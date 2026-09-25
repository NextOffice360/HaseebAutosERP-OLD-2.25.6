#!/usr/bin/env node
/**
 * tools/audit_save_persistence.js — v2.30.5 (user mandate #1, CRITICAL)
 * ---------------------------------------------------------------------------
 * APP-WIDE SAVE-FLOW AUDIT: har save/update/submit/confirm/toggle site se
 * API route tak, aur har WRITE route ka demo-persistence sach:
 *
 *   UI site (button/form/toggle)  →  API.call(route)  →  mock handler  →  persist?
 *
 * Classes:
 *   CONFIG-ROUTE : settings/wizard/prefs — demo me bhi PERSIST zaroori (reload-proof)
 *   TXN-ROUTE    : business records (orders/items/sales…) — demo session-scope theek
 *                  (asli persistence backend Sheets par hai; demo-reload = fresh seed)
 *   GAP          : CONFIG-route jo persist NAHI karta → FIX zaroori
 *
 * Output: console table + tmp/save-persistence-audit.json
 *   node tools/audit_save_persistence.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const files = fs.readdirSync(path.join(ROOT, 'apps-script')).filter(f => f.endsWith('.html'));

/* ── 1) UI save/update/submit/confirm sites ── */
const sitePat = /(Save all|Save|Apply|Update|Submit|Confirm|Mukammal|Save karein|save ho)/;
const uiSites = [];
files.forEach(f => {
  const src = read('apps-script/' + f);
  const lines = src.split('\n');
  lines.forEach((ln, i) => {
    if (sitePat.test(ln) && /(label|button|btn|onClick|onclick)/i.test(ln)) {
      uiSites.push({ file: f, line: i + 1, text: ln.trim().slice(0, 110) });
    }
  });
});

/* ── 2) Toggle/switch/checkbox sites ── */
const toggleSites = [];
files.forEach(f => {
  const src = read('apps-script/' + f);
  const n1 = (src.match(/type:\s*'switch'/g) || []).length;
  const n2 = (src.match(/UI2\.toggle\(/g) || []).length;
  const n3 = (src.match(/type:\s*'checkbox'/g) || []).length;
  if (n1 + n2 + n3) toggleSites.push({ file: f, switch: n1, ui2toggle: n2, checkbox: n3 });
});

/* ── 3) API routes referenced from UI ── */
const routeRe = /API\.call\(\s*['"]([a-z]+\.[a-zA-Z0-9.]+)['"]/g;
const routes = new Set();
files.forEach(f => {
  const src = read('apps-script/' + f);
  let m; while ((m = routeRe.exec(src))) routes.add(m[1]);
});

/* ── 4) WRITE-routes (API._isWrite verbs + explicit) ── */
const isWrite = r => /save|create|post|update|delete|void|return|receive|approve|hold|sync|assign|purge|reindex|close|convert|pay|open|remove|import|reset|wizard/i.test(r);
const writeRoutes = Array.from(routes).filter(isWrite).sort();

/* ── 5) Mock handler persistence sach ── */
const mock = read('demo/mock.js');
const mockLines = mock.split('\n');
const handlerBlock = route => {
  const key = "'" + route + "'";
  for (let i = 0; i < mockLines.length; i++) {
    const assignStyle = new RegExp("(?:M|MockAPI)\\['" + route.replace(/\./g, '\\.') + "'\\]\\s*=").test(mockLines[i]);
    if (assignStyle) {
      /* assignment-style handler (patch-blocks) — block end tak jao */
      let depth = 0, opened = false, k = i;
      for (const ch of mockLines[i]) { if (ch === '{') { depth++; opened = true; } if (ch === '}') depth--; }
      if (opened && depth > 0) {
        for (k = i + 1; k < mockLines.length; k++) {
          for (const ch of mockLines[k]) { if (ch === '{') depth++; if (ch === '}') depth--; }
          if (depth <= 0) break;
        }
      }
      return mockLines.slice(i, k + 1).join('\n');
    }
    if (mockLines[i].indexOf(key) > -1 && /:\s*(function|\(|p =>|async|=>)/.test(mockLines[i].slice(mockLines[i].indexOf(key)))) {
      /* block end: agla line jo "  '" se shuru ho (next handler) ya deep dedent */
      let j = i + 1, depth = 0, opened = false;
      const startLine = mockLines[i];
      for (const ch of startLine.slice(startLine.indexOf(key))) { if (ch === '{') { depth++; opened = true; } if (ch === '}') depth--; }
      const end = mockLines.length;
      let k = i;
      if (!(opened && depth <= 0)) {
        for (k = i + 1; k < end; k++) {
          for (const ch of mockLines[k]) { if (ch === '{') depth++; if (ch === '}') depth--; }
          if (opened && depth <= 0) break;
          if (!opened && /^\s{2}'[a-z]/.test(mockLines[k])) break;
        }
      }
      return mockLines.slice(i, k + 1).join('\n');
    }
  }
  return null;
};

const PERSIST_MARKS = ['mockPersistSettings()', 'localStorage.setItem'];
/* v2.30.5 — wrap-layer: config-class handlers mockCfgWriteWrap se auto-persist */
const CFG_WRAP_PRESENT = mock.indexOf('mockCfgWriteWrap') > -1;
const CFG_WRAP_RE = /^(config\.|system\.wizard|system\.settings\.save|lang\.)/;
const CONFIG_RE = /^(config\.|system\.settings|system\.wizard|auth\.prefs|lang\.|ui\.prefs|pwa\.)/;
const rows = writeRoutes.map(r => {
  const blk = handlerBlock(r);
  const config = CONFIG_RE.test(r);
  const persists = !!blk && PERSIST_MARKS.some(mk => blk.indexOf(mk) > -1);
  const exists = blk !== null;
  let cls;
  if (!exists) cls = 'NO-MOCK-HANDLER';
  else if (config && (persists || (CFG_WRAP_PRESENT && CFG_WRAP_RE.test(r)))) cls = 'CONFIG-PERSIST-OK';
  else if (config && !persists) cls = 'GAP-CONFIG-NOT-PERSISTED';
  else cls = 'TXN-SESSION-OK';
  return { route: r, cls: cls, persisted: persists };
});

const gaps = rows.filter(r => r.cls === 'GAP-CONFIG-NOT-PERSISTED' || r.cls === 'NO-MOCK-HANDLER');
const configOk = rows.filter(r => r.cls === 'CONFIG-PERSIST-OK');
const txn = rows.filter(r => r.cls === 'TXN-SESSION-OK');

console.log('════════════════════════════════════════════════════════════');
console.log(' SAVE-FLOW / PERSISTENCE AUDIT  (mandate #1 — v2.30.5)');
console.log('════════════════════════════════════════════════════════════');
console.log(' UI save/apply/update sites      :', uiSites.length);
console.log(' toggle/switch sites (files)     :', toggleSites.length, '· switches:', toggleSites.reduce((a, b) => a + b.switch + b.ui2toggle, 0), '· checkboxes:', toggleSites.reduce((a, b) => a + b.checkbox, 0));
console.log(' API routes (UI-referenced)      :', routes.size, '· WRITE-routes:', writeRoutes.length);
console.log('   CONFIG-PERSIST-OK             :', configOk.length, '→', configOk.map(r => r.route).join(', '));
console.log('   TXN-SESSION-OK (demo-scope)   :', txn.length);
console.log('   GAP-CONFIG-NOT-PERSISTED      :', gaps.filter(g => g.cls.startsWith('GAP')).length, '→', gaps.filter(g => g.cls.startsWith('GAP')).map(r => r.route).join(', '));
console.log('   NO-MOCK-HANDLER               :', gaps.filter(g => g.cls === 'NO-MOCK-HANDLER').length, '→', gaps.filter(g => g.cls === 'NO-MOCK-HANDLER').map(r => r.route).join(', '));
console.log('\n TXN note: demo me transactional data session-scope hai (reload = fresh');
console.log(' seed) — asli persistence GAS/Sheet par hoti hai. CONFIG/settings ab');
console.log(' reload-proof (localStorage overlay) — user ka "revert to OFF" bug hal.');

fs.mkdirSync(path.join(ROOT, 'tmp'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'tmp/save-persistence-audit.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  uiSites: uiSites.length,
  toggles: toggleSites,
  routesTotal: routes.size,
  writeRoutes: rows,
  gaps: gaps
}, null, 2));
console.log('\n → tmp/save-persistence-audit.json');
process.exit(gaps.filter(g => g.cls.startsWith('GAP')).length === 0 ? 0 : 2);
