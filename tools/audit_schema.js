/**
 * audit_schema.js — SHEETS / DB SCHEMA HEALTH CHECK
 * ---------------------------------------------------------------------------
 * Google Sheets-backed DB mein sabse khatarnaak bug chhupa hota hai:
 *
 *     DB.insert('Sales', { ..., prevBalance: 2500 })
 *
 * ...agar 'prevBalance' SCHEMA.Sales mein declared nahi hai to DB.insert use
 * SILENTLY drop kar deta hai (DB.gs sirf SCHEMA columns likhta hai). Data
 * chala jata hai, koi error nahi.
 *
 * Ye script:
 *   1. SCHEMA (Schema.gs) parse karta hai
 *   2. har DB.<fn>('Sheet', ...) call dhoondhta hai — sheet declared hai ya nahi
 *   3. DB.insert / insertMany / update ko diye gaye object ke har key ko
 *      SCHEMA columns se match karta hai → undeclared field = DATA LOSS BUG
 *   4. duplicate columns, ghalat identifiers, 'id' column mojood hai ya nahi
 *   5. Setup.gs sab sheets banaata hai ya nahi
 *
 *   node tools/audit_schema.js
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

/* ----------------------------- 1. SCHEMA parse ---------------------------- */
const schemaSrc = fs.readFileSync(path.join(ROOT, 'apps-script', 'Schema.gs'), 'utf-8');
const start = schemaSrc.indexOf('var SCHEMA = {');
let depth = 0, end = -1;
for (let i = schemaSrc.indexOf('{', start); i < schemaSrc.length; i++) {
  const c = schemaSrc[i];
  if (c === '{') depth++;
  else if (c === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
const SCHEMA = new Function('return ' + schemaSrc.slice(schemaSrc.indexOf('{', start), end))();

/* --------------------------- 2. code base scan ---------------------------- */
const files = fs.readdirSync(path.join(ROOT, 'apps-script'))
  .filter(f => f.endsWith('.gs'))
  .map(f => ({ name: f, src: fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf-8') }));

const DB_FNS = 'all|byId|where|findOne|insert|insertMany|update|remove|purge|count|rowOf|indexOfId|setRowValues';
const usedSheets = new Map();     // sheet → Set(file)
const undeclared = [];            // {sheet, field, file, line}
const mismatches = [];            // comma-list column mein array (neechay problems mein merge)
const sheetRefRe = new RegExp("DB\\.(?:" + DB_FNS + ")\\s*\\(\\s*'([A-Za-z][A-Za-z0-9]*)'", 'g');

/** ek index se aage object literal dhoondo aur uske TOP-LEVEL keys nikaalo */
function objectKeysAt(src, from) {
  const open = src.indexOf('{', from);
  if (open < 0) return null;
  /* pehla '{' se pehle koi "=" ya "(" na ho (function body na pakdein) */
  let depth = 0, i = open;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) break; }
    else if (c === '"' || c === "'" || c === '`') {           /* string skip */
      const q = c; i++;
      while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; }
    }
  }
  const body = src.slice(open + 1, i);
  const keys = [], entries = [];
  let d = 0, buf = '', inStr = null;
  const push = (raw) => {
    const m = raw.match(/^\s*(?:'([^']+)'|"([^"]+)"|\[\s*'([^']+)'\s*\]|([A-Za-z_$][\w$]*))\s*(?::\s*([\s\S]*))?$/);
    if (m) entries.push({ key: m[1] || m[2] || m[3] || m[4], value: m[5] || '' });
  };
  for (let j = 0; j < body.length; j++) {
    const c = body[j];
    if (inStr) { if (c === '\\') { j++; continue; } if (c === inStr) inStr = null; buf += c; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; buf += c; continue; }
    if (c === '{' || c === '(' || c === '[') { d++; buf += c; continue; }
    if (c === '}' || c === ')' || c === ']') { d--; buf += c; continue; }
    if (c === ',' && d === 0) { push(buf); buf = ''; continue; }
    buf += c;
  }
  push(buf);
  return { keys: keys.filter(Boolean), entries: entries, end: i, open: open };
}

/* DB.insert('X', {...}) / DB.insertMany('X', [...]) / DB.update('X', id, {...}) */
const WRITE_RE = new RegExp("DB\\.(insert|insertMany|update)\\s*\\(\\s*'([A-Za-z][A-Za-z0-9]*)'\\s*,", 'g');

/* 3h. COMMA-LIST vs JSON mismatch:
       DB._cell ab arrays ko JSON likhta hai. Agar koi column aaj bhi split(',')
       se parha jata hai aur code us mein ARRAY bhej de to JSON string banegi
       aur reader toot jayega — ye check aisi jagah pakadta hai. */
const commaCols = new Set();
files.forEach(f => {
  const res = [
    /U\.str\(\s*\w+\.(\w+)\s*\)\s*\.split\(\s*','\s*\)/g,
    /String\(\s*\w+\.(\w+)[^)]*\)\s*\.split\(\s*','\s*\)/g
  ];
  res.forEach(re => { let mm; while ((mm = re.exec(f.src))) commaCols.add(mm[1]); });
});
/* note neechay (notes array ke baad) */


files.forEach(f => {
  let m;
  while ((m = sheetRefRe.exec(f.src))) {
    const s = m[1];
    if (!usedSheets.has(s)) usedSheets.set(s, new Set());
    usedSheets.get(s).add(f.name);
  }
  sheetRefRe.lastIndex = 0;

  while ((m = WRITE_RE.exec(f.src))) {
    const fn = m[1], sheet = m[2], at = m.index + m[0].length;
    const cols = SCHEMA[sheet];
    if (!cols) continue;                       /* sheet hi declared nahi — alag report */
    let scanFrom = at;
    if (fn === 'update') {
      /* DB.update('X', id, {patch}) → sirf id wala comma chhoren;
         agla token '{' ho to object parse karein, warna variable hai (chhoren) */
      const c1 = f.src.indexOf(',', at);
      if (c1 < 0) continue;
      scanFrom = c1 + 1;
      if (!/^\s*\{/.test(f.src.slice(scanFrom))) continue;
    }
    if (fn === 'insertMany') {
      /* array literal ke andar pehla object; sirf variable diya ho to chhoren */
      // Only inspect an array literal that is actually this call's argument.
      // Searching later source can mistake a different table's seed list for it.
      const literal = /^\s*\[/.exec(f.src.slice(scanFrom));
      if (!literal) continue;
      scanFrom += literal[0].length;
    }
    if (!/^\s*[{[]/.test(f.src.slice(scanFrom))) continue;
    const obj = objectKeysAt(f.src, scanFrom);
    if (!obj) continue;
    /* insertMany ke array se bahar ka object na pakda jaye */
    if (fn === 'insertMany' && f.src.slice(scanFrom, obj.open).indexOf(']') > -1) continue;
    obj.entries = obj.entries || [];
    obj.entries.forEach(e => {
      const k = e.key;
      if (k === 'undefined') return;
      if (cols.indexOf(k) === -1) {
        const line = f.src.slice(0, m.index).split('\n').length;
        undeclared.push({ sheet, field: k, file: f.name, line, fn });
      }
      /* comma-list column mein array/object bheja gaya → reader tootega
         (`.join(',')` lagane wale expressions theek hain — wo false positive hain) */
      const vraw = String(e.value || '');
      const arrayNoJoin = /^\s*\[/.test(vraw) ||
        (/(\.map\(|\.filter\(|Array\.isArray|Object\.keys)/.test(vraw) && !/\.join\(/.test(vraw));
      if (commaCols.has(k) && arrayNoJoin) {
        const line = f.src.slice(0, m.index).split('\n').length;
        mismatches.push({ kind: 'JSON vs split mismatch', sheet: sheet, field: k,
          detail: `${f.name}:${line} — ${k} ko array diya gaya par code ise split(',') se parhta hai` });
      }
    });
  }
  WRITE_RE.lastIndex = 0;
});

/* ------------------------------- 3. checks -------------------------------- */
const problems = [];
const notes = [];

/* 3a. code SHEET use karta hai jo SCHEMA mein nahi */
[...usedSheets.keys()].sort().forEach(s => {
  if (!SCHEMA[s]) problems.push({ kind: 'SHEET NOT IN SCHEMA', sheet: s, detail: 'used in ' + [...usedSheets.get(s)].join(', ') });
});

/* 3b. undeclared fields (data silently drop hota hai) */
undeclared.forEach(u => problems.push({
  kind: 'DATA-LOSS: undeclared column', sheet: u.sheet, field: u.field,
  detail: `${u.file}:${u.line}  DB.${u.fn}('${u.sheet}', { ${u.field}: … })`
}));

mismatches.forEach(p => problems.push(p));

/* 3c. schema hygiene */
Object.keys(SCHEMA).forEach(s => {
  const cols = SCHEMA[s];
  if (!Array.isArray(cols) || !cols.length) problems.push({ kind: 'EMPTY SCHEMA', sheet: s, detail: 'koi column nahi' });
  const seen = new Set();
  cols.forEach(c => {
    if (seen.has(c)) problems.push({ kind: 'DUPLICATE COLUMN', sheet: s, field: c, detail: '' });
    seen.add(c);
    if (/\s/.test(c)) problems.push({ kind: 'BAD COLUMN NAME', sheet: s, field: c, detail: 'column mein space hai' });
  });
  if (cols.indexOf('id') === -1) problems.push({ kind: 'NO id COLUMN', sheet: s, detail: 'DB.byId/update/remove id se kaam karte hain' });
});

/* 3d. declared par kabhi use nahi hua (informational) */
Object.keys(SCHEMA).forEach(s => { if (!usedSheets.has(s)) notes.push(s); });

notes.push('comma-list columns: ' + commaCols.size);

/* 3e. Setup.gs har sheet banaata hai? */
const setup = fs.readFileSync(path.join(ROOT, 'apps-script', 'Setup.gs'), 'utf-8');
if (!/Object\.keys\(SCHEMA\)/.test(setup)) problems.push({ kind: 'SETUP', sheet: '(all)', detail: 'Setup.gs SCHEMA se saari sheets nahi banaata' });
if (!/getRange\(1,\s*1,\s*1,\s*[A-Za-z_]+\.length\)|setValues\(\[[^\]]+\]\)/.test(setup) && !/headers/.test(setup))
  problems.push({ kind: 'SETUP', sheet: '(all)', detail: 'headers likhne ka tareeqa nahi mila' });

/* 3f. DEFAULT_SETTINGS keys sane hain */
const dsIdx = schemaSrc.indexOf('var DEFAULT_SETTINGS = {');
if (dsIdx > -1) {
  let d = 0, e = -1;
  for (let i = schemaSrc.indexOf('{', dsIdx); i < schemaSrc.length; i++) {
    if (schemaSrc[i] === '{') d++;
    else if (schemaSrc[i] === '}') { d--; if (!d) { e = i + 1; break; } }
  }
  const DS = new Function('return ' + schemaSrc.slice(schemaSrc.indexOf('{', dsIdx), e))();
  const bad = Object.entries(DS).filter(([k, v]) => !/^[A-Za-z][\w.]*$/.test(k) || v === undefined || v === null);
  bad.forEach(([k]) => problems.push({ kind: 'DEFAULT_SETTINGS', sheet: 'Settings', field: k, detail: 'key ya value ghalat' }));
  notes.push('DEFAULT_SETTINGS: ' + Object.keys(DS).length + ' keys');
}

/* 3g. NumberSeries: har entity ka prefix defined hona chahiye
       (warn entity -> DB.nextNumber 'DOC-00001' bana deta hai, chupke se ghalat number) */
const dbSrc = fs.readFileSync(path.join(ROOT, 'apps-script', 'DB.gs'), 'utf-8');
const pd = dbSrc.match(/prefixDefault\s*=\s*\{([\s\S]*?)\}\s*\[entity\]/);
const known = pd ? (pd[1].match(/[A-Z_]+(?=\s*:)/g) || []) : [];
const usedEntities = new Set();
files.forEach(f => {
  const re = /DB\.nextNumber\s*\(\s*'([A-Za-z_]+)'/g;
  let mm;
  while ((mm = re.exec(f.src))) usedEntities.add(mm[1]);
});
[...usedEntities].sort().forEach(e => {
  if (known.indexOf(e) === -1)
    problems.push({ kind: 'NUMBER SERIES', sheet: 'NumberSeries', field: e,
      detail: "DB.nextNumber('" + e + "') ka koi prefix defined nahi — DOC-00001 banega" });
});
notes.push('number series: ' + usedEntities.size + ' entities (' + known.length + ' prefixes defined)');

/* -------------------------------- 4. report ------------------------------- */
console.log('\n==============================================================');
console.log(' SHEETS / DB SCHEMA AUDIT');
console.log('==============================================================\n');
console.log(`  sheets declared : ${Object.keys(SCHEMA).length}`);
console.log(`  sheets used     : ${usedSheets.size}`);
console.log(`  columns total   : ${Object.values(SCHEMA).reduce((a, c) => a + c.length, 0)}`);
if (notes.length) console.log('  notes           : ' + notes.join(' · '));
console.log('');

if (!problems.length) {
  console.log('  ✔ koi masla nahi — har DB call declared columns ke andar hai\n');
} else {
  const by = {};
  problems.forEach(p => { (by[p.kind] = by[p.kind] || []).push(p); });
  Object.keys(by).forEach(k => {
    console.log(`  ✖ ${k}  (${by[k].length})`);
    by[k].slice(0, 25).forEach(p => console.log(`      · ${p.sheet}${p.field ? '.' + p.field : ''}  ${p.detail}`));
    if (by[k].length > 25) console.log('      … +' + (by[k].length - 25));
    console.log('');
  });
}
console.log('==============================================================');
console.log(` PROBLEMS: ${problems.length}`);
console.log('==============================================================\n');
process.exit(problems.length ? 1 : 0);
