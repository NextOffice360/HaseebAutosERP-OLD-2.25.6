/**
 * tools/audit_busy_coverage.js — W7.T1 audit (read-only).
 *
 * Sawaal: "kaunse UI actions (button click / change / submit) backend se data
 * mangte hain magar shared `UI.run()` ke andar NAHI hain?" — un par busy state,
 * duplicate-submit guard aur progress nahi milta.
 *
 * Tareeqa (guess nahi — AST):
 *   · har apps-script/*.html ke <script> block ko acorn se parse karte hain
 *   · `UI.run(...)` ke argument ranges nikalte hain (wrapped ranges)
 *   · `API.*` / `fetch(...)` calls dhoondte hain
 *   · har call ka ancestor chain dekh kar batate hain:
 *       - kya wo UI.run ke andar hai?          → WRAPPED
 *       - kya wo UI event handler ke andar hai? → ACTION  (ye asal target hai)
 *         (onclick/onchange/onsubmit/oninput property, el.onclick = …, ya
 *          addEventListener('click'|'change'|'submit', …))
 *       - warna                                → OTHER (boot/loader/poller)
 *   · inline HTML `onclick="…API…"` attributes bhi count hote hain (wo by-definition raw hain)
 *
 *   node tools/audit_busy_coverage.js            → report
 *   node tools/audit_busy_coverage.js --json     → tmp/busy-audit.json bhi likho
 */
'use strict';
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const walk = require('acorn-walk');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'apps-script');
const EVENTS = new Set(['click', 'change', 'submit', 'input', 'keydown', 'dblclick']);
const PARSE_OPTS = {
  ecmaVersion: 2022, locations: true, allowReturnOutsideFunction: true,
  allowAwaitOutsideFunction: true, allowHashBang: true,
};

function scriptBlocks(file) {
  const text = fs.readFileSync(file, 'utf8');
  const out = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(text))) {
    const before = text.slice(0, m.index);
    const lineOffset = before.split('\n').length;     /* 1-based */
    const body = m[1];
    /* </script> ke andar HTML-escaping wale JS ko seedha parse karte hain */
    out.push({ code: body, lineOffset, raw: text, startIndex: m.index });
  }
  return { text, blocks: out };
}

function parseBlock(code) {
  /* Apps Script templating (`<?= ... ?>`) wale chhote blocks JS nahi hote — skip */
  if (/<\?/.test(code) || code.trim().length < 200) return 'SKIP';
  try { return acorn.parse(code, PARSE_OPTS); } catch (e) { }
  try { return acorn.parse(code, Object.assign({ sourceType: 'module' }, PARSE_OPTS)); } catch (e) { return null; }
}

const isUIrun = n =>
  n.type === 'CallExpression' && n.callee && n.callee.type === 'MemberExpression' &&
  !n.callee.computed && n.callee.object && n.callee.object.name === 'UI' &&
  n.callee.property && n.callee.property.name === 'run';

const apiCall = (n, ctx) => {
  if (n.type !== 'CallExpression') return null;
  const c = n.callee;
  if (!c) return null;
  if (c.type === 'Identifier' && c.name === 'fetch') return 'fetch';
  if (c.type === 'MemberExpression' && !c.computed && c.object && c.object.name === 'API' && c.property) {
    if (ctx && ctx.rawWrappers && ctx.rawWrappers.has(c.property.name)) return null;  /* allowlist */
    return 'API.' + c.property.name;
  }
  return null;
};

/* nearest enclosing function + how it is wired to a UI event */
function wiring(ancestors) {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const node = ancestors[i];
    const parent = ancestors[i - 1];
    if (!parent) continue;
    if (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression' || node.type === 'FunctionDeclaration') {
      if (parent.type === 'Property' && parent.key && /^on[a-z]+$/.test(String(parent.key.name || parent.key.value))) {
        return { kind: 'prop', ev: String(parent.key.name || parent.key.value) };
      }
      if (parent.type === 'AssignmentExpression' && parent.left && parent.left.type === 'MemberExpression' &&
          parent.left.property && /^on[a-z]+$/.test(String(parent.left.property.name))) {
        return { kind: 'assign', ev: String(parent.left.property.name) };
      }
      if (parent.type === 'CallExpression' && parent.callee && parent.callee.type === 'MemberExpression' &&
          parent.callee.property && parent.callee.property.name === 'addEventListener' &&
          parent.arguments[0] && parent.arguments[0].type === 'Literal') {
        const ev = String(parent.arguments[0].value);
        if (EVENTS.has(ev)) return { kind: 'listener', ev };
      }
      /* ek function chhupa hua event handler: function apne aap ko dekh chuke hain */
      return null;
    }
  }
  return null;
}

const INLINE_RE = /<[a-zA-Z][^>]*\son(click|change|submit|input)\s*=\s*"((?:[^"\\]|\\.)*)"/g;

function main() {
  const files = fs.readdirSync(SRC).filter(f => f.endsWith('.html')).sort();
  const report = { files: [], totals: { action: 0, wrapped: 0, other: 0, inline: 0, parseFail: 0 }, raw: [] };
  for (const f of files) {
    const full = path.join(SRC, f);
    const { text, blocks } = scriptBlocks(full);
    const rec = { file: f, action: 0, wrapped: 0, other: 0, inline: 0, parseFail: 0, raw: [] };

    /* inline HTML handlers */
    let m;
    INLINE_RE.lastIndex = 0;
    while ((m = INLINE_RE.exec(text))) {
      const body = m[2];
      if (/API\.|fetch\s*\(|await\s/.test(body)) {
        rec.inline++;
      }
    }

    for (const b of blocks) {
      const ast = parseBlock(b.code);
      if (ast === 'SKIP') continue;                    /* template / chhota block */
      if (!ast) { rec.parseFail++; report.totals.parseFail++; continue; }

      const wrapped = [];                     /* [start,end] ranges of UI.run arguments */
      walk.simple(ast, {
        CallExpression(n) {
          if (!isUIrun(n)) return;
          const a0 = n.arguments[0];
          const rest = n.arguments.slice(1);
          for (const a of rest) if (a && typeof a.start === 'number') wrapped.push([a.start, a.end]);
          if (!a0) return;
        },
      });
      const inWrapped = (start) => wrapped.some(([s, e]) => start >= s && start < e);

      walk.ancestor(ast, {
        CallExpression(n, _state, ancestors) {
          const callee = apiCall(n, null);
          if (!callee) return;
          const line = (n.loc && n.loc.start ? n.loc.start.line : 0) + b.lineOffset - 1;
          if (inWrapped(n.start)) { rec.wrapped++; report.totals.wrapped++; return; }
          const w = wiring(ancestors);
          if (w) {
            rec.action++; report.totals.action++;
            const item = { file: f, line, callee, via: w.kind + ':' + w.ev };
            rec.raw.push(item); report.raw.push(item);
          } else { rec.other++; report.totals.other++; }
        },
      });
    }
    report.files.push(rec);
  }

  /* ---------- report ---------- */
  console.log('=== BUSY COVERAGE AUDIT (W7.T1) ===');
  console.log('file                       ACTION  wrapped  other  inline  parseFail');
  report.files.forEach(r => {
    if (!r.action && !r.wrapped && !r.other && !r.inline && !r.parseFail) return;
    console.log(r.file.padEnd(27) + String(r.action).padStart(6) + String(r.wrapped).padStart(9) +
      String(r.other).padStart(7) + String(r.inline).padStart(8) + String(r.parseFail).padStart(11));
  });
  const t = report.totals;
  console.log('\nTOTAL: ACTION (gher-wrapped) = ' + t.action + ' · wrapped = ' + t.wrapped +
    ' · other = ' + t.other + ' · inline HTML handlers = ' + t.inline + ' · parseFail = ' + t.parseFail);
  console.log('\n--- ACTION sites (gher-wrapped, pehle 40) ---');
  report.raw.slice(0, 40).forEach(r => console.log(`  ${r.file}:${r.line}  ${r.callee}  (${r.via})`));
  if (report.raw.length > 40) console.log(`  … +${report.raw.length - 40} more`);

  if (process.argv.includes('--json')) {
    fs.mkdirSync(path.join(ROOT, 'tmp'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'tmp', 'busy-audit.json'), JSON.stringify(report, null, 1));
    console.log('\nJSON: tmp/busy-audit.json');
  }
  return 0;
}

process.exit(main());
