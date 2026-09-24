#!/usr/bin/env node
/* ==========================================================================
   check_pwa.js — v2.6 §10/§11/§13
   PWA templates (Pwa_*.html) ke <script> blocks ko parse karta hai.
   Apps Script template tags (<?!= ... ?> / <? ... ?>) ko pehle hata deta hai
   warna node --check un par fail ho jata hai (wo valid JS nahi hote).

   Sath hi ye bhi check karta hai:
     • har PWA ka apna template + doGet routing mojood ho
     • teenon apps ka Pwa.APPS entry ho
     • offline queue / sync wiring mojood ho
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'apps-script');
let bad = 0;
const fail = (m) => { console.log('  ✖ ' + m); bad++; };
const ok = (m) => console.log('  ✔ ' + m);

/* ---------------- 1) script blocks parse karo ----------------------------- */
console.log('== PWA templates: script blocks ==');
const templates = fs.readdirSync(DIR)
  .filter(f => f.startsWith('Pwa_') && f.endsWith('.html'))
  .sort();

if (!templates.length) fail('koi Pwa_*.html template nahi mila');

const tmp = fs.mkdtempSync('/tmp/pwacheck-');
let blockNo = 0;
for (const f of templates) {
  const raw = fs.readFileSync(path.join(DIR, f), 'utf8');
  const blocks = raw.match(/<script>([\s\S]*?)<\/script>/g) || [];
  let fileBad = 0;
  blocks.forEach((b, i) => {
    let js = b.replace(/^<script>/, '').replace(/<\/script>$/, '');
    /* template tags → JS literal */
    /* pehle QUOTED template tags (''<?!= x ?>'') phir bare ones */
    js = js.replace(/'\s*<\?[\s\S]*?\?>\s*'/g, "''")
           .replace(/<\?[\s\S]*?\?>/g, "''");
    const p = path.join(tmp, `b${blockNo++}.js`);
    fs.writeFileSync(p, js);
    try {
      execFileSync('node', ['--check', p], { stdio: 'pipe' });
    } catch (e) {
      fileBad++;
      console.log(`  ✖ ${f} block ${i}:`);
      console.log(String(e.stderr || e.message).split('\n').slice(0, 6).map(l => '      ' + l).join('\n'));
    }
  });
  if (fileBad) bad += fileBad; else ok(`${f} — ${blocks.length} block(s)`);
}

/* ---------------- 2) routing + registry wiring ---------------------------- */
console.log('== PWA routing / registry ==');
const code = fs.readFileSync(path.join(DIR, 'Code.gs'), 'utf8');
const pwa = fs.readFileSync(path.join(DIR, 'Pwa.gs'), 'utf8');
const shell = fs.readFileSync(path.join(DIR, 'Pwa_Shell.html'), 'utf8');

const APPS = ['wh', 'fo', 'sm', 'pos'];
const TPL = { wh: 'Pwa_Warehouse', fo: 'Pwa_Field', sm: 'Pwa_Salesman', pos: 'Pwa_POS' };

if (/PWA_TEMPLATES\s*=\s*\{[^}]*wh:\s*'Pwa_Warehouse'[^}]*fo:\s*'Pwa_Field'[^}]*sm:\s*'Pwa_Salesman'/.test(code))
  ok('doGet: 3 alag templates (?app=wh / ?app=fo / ?app=sm)');
else fail('doGet mein PWA_TEMPLATES routing missing');

for (const a of APPS) {
  const tplPath = path.join(DIR, TPL[a] + '.html');
  if (fs.existsSync(tplPath) && fs.readFileSync(tplPath, 'utf8').includes("include('Pwa_Shell')"))
    ok(`${TPL[a]}.html — apna template + shared shell`);
  else fail(`${TPL[a]}.html missing ya shell include nahi karta`);

  if (new RegExp(`${a}:\\s*\\{`).test(pwa) && new RegExp(`slug:\\s*'\\w+'`).test(pwa))
    ok(`Pwa.APPS.${a} registered`);
  else fail(`Pwa.APPS.${a} missing`);
}

/* ---------------- 3) offline + installability ----------------------------- */
console.log('== Offline / installability ==');
[['offline queue', /enqueue\(/],
 ['sync flush', /function sync\(/],
 ['online listener', /addEventListener\('online'/],
 ['manifest inject', /injectManifest/],
 ['apple-touch-icon', /apple-touch-icon/],
 ['standalone display', /display:\s*'standalone'/]
].forEach(([label, rx]) => {
  if (rx.test(shell) || rx.test(pwa)) ok(label);
  else fail(label + ' missing');
});

if (fs.existsSync(path.join(DIR, 'Pwa_Icons.gs')) && /PWA_ICONS\s*=\s*\{/.test(fs.readFileSync(path.join(DIR, 'Pwa_Icons.gs'), 'utf8')))
  ok('Pwa_Icons.gs — embedded icons (bina external host ke installable)');
else fail('Pwa_Icons.gs missing');

/* ---------------- 4) tap targets ------------------------------------------ */
console.log('== Mobile ergonomics ==');
const css = shell.match(/<style>([\s\S]*?)<\/style>/);
if (css && /min-height:\s*48px/.test(css[1]) && /\.pwa-bar\s+\.b\{[^}]*min-height:\s*56px/.test(css[1]))
  ok('tap targets: inputs/buttons >=48px, bottom bar >=56px');
else fail('tap targets chhote hain (<48px)');

if (css && /font-size:\s*16px/.test(css[1])) ok('inputs 16px — iOS auto-zoom nahi hoga');
else fail('input font <16px — iOS par zoom ho jayega');

if (css && /safe-area-inset/.test(css[1])) ok('safe-area insets (notch wale phones)');
else fail('safe-area insets missing');

console.log('');
if (bad) { console.log(`  ✖ ${bad} problem(s)`); process.exit(1); }
console.log('  ✔ PWA checks: sab theek');
