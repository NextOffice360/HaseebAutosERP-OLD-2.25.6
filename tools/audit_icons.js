#!/usr/bin/env node
/* ==========================================================================
   audit_icons.js — icon safety check (v2.6 QA)
   --------------------------------------------------------------------------
   Masla: "🧑‍💼 double icon show ho raha hai tab button par"
   Wajah: 🧑‍💼 koi aik emoji NAHI — ye 3 codepoints ka ZWJ sequence hai
          (U+1F9D1 + U+200D + U+1F4BC). Windows 10 ke Segoe UI Emoji mein
          is sequence ka support nahi, is liye ye DO alag icons (🧑 aur 💼)
          ban jata hai — user ko "double icon" nazar aata hai.

   Is liye hum sirf aik-codepoint wale emoji istemal karte hain.

   Checks:
     ① koi ZWJ (U+200D) sequence nahi
     ② koi variation selector (U+FE0F) nahi — ye bhi Windows par alag dikhta hai
     ③ har nav/table icon aik hi codepoint ka ho
     ④ icon ke baghair koi tab nahi (§1: har section pehchana jaye)

   Chalein:  node tools/audit_icons.js
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0; const problems = [];
const ok = (n, c, d) => c ? (pass++, console.log('  ✔ ' + n + (d ? '  → ' + d : '')))
  : (fail++, problems.push(n), console.log('  ✖ ' + n + (d ? '  → ' + d : '')));

/* v2.30.0 (N6) — App_Icons.html ki path library (naam se icons) */
const ICON_NAMES = new Set();
try {
  const ic = fs.readFileSync(path.join(ROOT, 'apps-script', 'App_Icons.html'), 'utf8');
  Array.from(ic.matchAll(/^\s{4}([a-zA-Z][A-Za-z0-9_]*):\s*'/gm)).forEach(m => ICON_NAMES.add(m[1]));
} catch (e) { }

const ZWJ = '‍';      // U+200D
const VS16 = '\uFE0F';     // U+FE0F

const files = [];
(function walk(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
    const p = path.join(dir, e.name);
    if (e.name === 'node_modules' || e.name === 'release' || e.name === 'demo' ||
        e.name === '.git' || e.name.startsWith('.')) return;
    if (e.isDirectory()) walk(p);
    else if (/\.(html|gs|json|js)$/.test(e.name) && p.includes('apps-script')) files.push(p);
  });
})(ROOT);

console.log('\n\x1b[1mIcons — Windows-safe emoji\x1b[0m');
ok('apps-script files mili hain', files.length > 0, files.length + ' files');

const zwjFiles = [], vsFiles = [];
files.forEach(f => {
  const t = fs.readFileSync(f, 'utf8');
  if (t.includes(ZWJ)) zwjFiles.push(path.basename(f));
  if (t.includes(VS16)) vsFiles.push(path.basename(f));
});

ok('① koi ZWJ sequence nahi (🧑‍💼 wala "double icon" bug)',
  zwjFiles.length === 0, zwjFiles.length ? zwjFiles.join(', ') : 'sab aik-codepoint ✔');

ok('② koi variation selector U+FE0F nahi',
  vsFiles.length === 0, vsFiles.length ? vsFiles.slice(0, 4).join(', ') : 'saf ✔');

/* ③ — nav + screen icons aik codepoint */
const iconIssues = [];
let iconCount = 0;
files.forEach(f => {
  const t = fs.readFileSync(f, 'utf8');
  const re = /icon:\s*'([^']+)'/g;
  let m; while ((m = re.exec(t))) {
    iconCount++;
    const raw = m[1];
    /* JS escape ('\\uD83D\\uDCB5') ho to pehle decode karo — warna
       literal source characters gin kar galat alarm lagta hai. */
    let v = raw;
    if (/\\u[0-9A-Fa-f]{4}/.test(raw)) {
      try { v = JSON.parse('"' + raw.replace(/"/g, '\\"') + '"'); } catch (e) { v = raw; }
    }
    if (v.includes(ZWJ) || v.includes(VS16)) iconIssues.push(raw + ' (' + path.basename(f) + ')');
    /* v2.30.0 (N6) — icon ab path ka NAAM bhi ho sakta hai ('receipt').
       Naam ho to codepoint counting ka sawal hi nahi (App_Icons.html ki P list). */
    if (ICON_NAMES.has(v.trim())) continue;
    /* keycap / flag / ZWJ sequences multi-codepoint hote hain */
    const cps = Array.from(v.trim());
    if (cps.length > 1) iconIssues.push(raw + ' (' + cps.length + ' codepoints, ' + path.basename(f) + ')');
  }
});
ok('③ har icon aik hi codepoint ka hai',
  iconIssues.length === 0, iconIssues.length ? iconIssues.slice(0, 4).join(' | ') : iconCount + ' icons saf');

/* ④ — har nav item ka icon ho */
const core = path.join(ROOT, 'apps-script', 'App_Core.html');
if (fs.existsSync(core)) {
  const t = fs.readFileSync(core, 'utf8');
  const re = /\{\s*id:\s*'([^']+)'\s*,\s*label:\s*'([^']+)'\s*,\s*icon:\s*'([^']*)'/g;
  let m, missing = [], total = 0;
  while ((m = re.exec(t))) { total++; if (!m[3].trim()) missing.push(m[1]); }
  ok('④ har nav item ka icon hai (koi "⚙business" jaisa nahi)',
    total === 0 || missing.length === 0, total ? total + ' items, ' + missing.length + ' bina icon' : 'koi nav pattern nahi mila');
}

console.log('\n══════════════════════════════════════════════════════════════════');
console.log(`  ICONS   PASS: ${pass}   FAIL: ${fail}`);
if (fail) problems.forEach(x => console.log('   ✖ ' + x));
console.log('══════════════════════════════════════════════════════════════════');
process.exit(fail ? 1 : 0);
