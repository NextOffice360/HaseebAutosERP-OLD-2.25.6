#!/usr/bin/env node
/* ============================================================================
   tools/test_raw_writes.js — RAW WRITE GUARD
   ----------------------------------------------------------------------------
   MASLA (v2.7 mein haqeeqat ban kar samne aaya):
     DB.gs ab har sheet ko IN-EXECUTION memoize karta hai (`DB._rows`, `_rowIdx`)
     — isi wajah se backend ops 577 se 52 ho gaye (−91%). Lekin ye memo sirf
     tab theek hai jab HAR write path `DB.touch(name)` kare.

     Jo write DB.gs ke BAHAR se seedha `appendRow()` / `setValues()` kare aur
     `DB.touch()` na kare, woh chupke se purana data dikha deta hai.
     v2.7 mein Audit.gs ne yahi kiya tha — `test_logic.js` crash hua
     (`voidLog[0]` undefined) kyunki nayi SALE_VOID rows memo ne chhupa li thin.

   YE TEST KYA KARTA HAI:
     apps-script/*.gs (DB.gs ke ilawa) mein har asli raw write site dhoondhta
     hai, aur usay ek ALLOWLIST se milata hai. Allowlist mein har entry ke sath
     LIKHI WAJAH hai ke woh mehfooz kyun hai.
       → NAYI site aayi to FAIL: matlab developer ko faisla karna padega ke
         DB.touch() chahiye ya nahi. Chupke se bug wapas nahi aa sakta.

   Note: sirf ASLI code dekha jata hai — comments aur strings chhor diye jate
     hain (warna Accounting.gs ke tafseeli comments jhoote alarm banate hain).
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'apps-script');

let PASS = 0, FAIL = 0;
function ok(name, cond, note) {
  if (cond) { PASS++; console.log('  \x1b[32m✔\x1b[0m ' + name + (note ? '  \x1b[2m→ ' + note + '\x1b[0m' : '')); }
  else { FAIL++; console.log('  \x1b[31m✘ ' + name + '\x1b[0m' + (note ? '  → ' + note : '')); }
}

/* ---------------------------------------------------------------- allowlist */
/* KEY = "file|code-signature" (LINE NUMBER NAHI!) — is liye ke aage koi file
   mein upar line judne se ye allowlist tootay nahi. Signature mein sirf asli
   code ka text hai (spaces hataye hue), to code rehne tak key bachi rahegi.
   Har entry ke sath LIKHI WAJAH hai ke woh mehfooz kyun hai. */
const ALLOWLIST = {
  /* string literals signature mein "" ban jate hain (stripNonCode unhen mita deta hai) */
  'Audit.gs|DB.sheet("").appendRow([':
    "DB.touch('AuditLog') isi function mein hai (v2.7 fix) — theek",
  "Setup.gs|sh.getRange(1,1,1,cols.length).setValues([cols]);":
    'Setup.createSheet() (nayi sheet) → function ke akhir mein DB.touch(name) (v2.8 fix)',
  "Setup.gs|sh.getRange(1,1,1,cols.length).setValues([cols]);#2":
    'Setup.createSheet() (khali sheet) → function ke akhir mein DB.touch(name) (v2.8 fix)',
  "Setup.gs|.setValues([missing])":
    'Setup.createSheet() (naye columns) → function ke akhir mein DB.touch(name) (v2.8 fix)',
  "Exports.gs|sh.getRange(1,1,1,headers.length).setValues([headers])":
    'DOOSRI spreadsheet (SpreadsheetApp.create) — DB.ss() se koi talluq nahi, cache invalidate karne ki zaroorat hi nahi',
  "Exports.gs|sh.getRange(2,1,values.length,headers.length).setValues(values);":
    'DOOSRI spreadsheet (SpreadsheetApp.create) — DB.ss() se koi talluq nahi, cache invalidate karne ki zaroorat hi nahi'
};

/** code se spaces hatakar signature banayein (line number par depend na ho) */
function sig(text) { return text.replace(/\s+/g, ''); }

/* --------------------------------------------------- comment/string hatao */
/** Line comments, block comments aur string literals mita deta hai */
function stripNonCode(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') {                    // line comment
      /* KUCH emit na karein — warna har character ke liye ek naya "\n" ban jata
         hai aur line numbers aage badal jate hain (425 → 580 ho gaye the).
         Neeche wala "\n" outer loop khud emit kar lega, is liye line count
         asli file jaisa hi rahega. */
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && d === '*') {                    // block comment
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') out += '\n';
        i++;
      }
      i += 2; out += ' ';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {        // string literal
      const q = c; i++;
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === q) { i++; break; }
        if (src[i] === '\n') { break; }               // unterminated — newline par chhor do
        i++;
      }
      out += ' "" ';
      continue;
    }
    out += c; i++;
  }
  return out;
}

console.log('\n\x1b[1mRAW WRITE GUARD\x1b[0m \x1b[2m— har DB.gs-bahar write ka hisaab\x1b[0m\n');

const files = fs.readdirSync(SRC).filter(f => f.endsWith('.gs') && f !== 'DB.gs').sort();
ok('apps-script/*.gs miley (DB.gs ke ilawa)', files.length > 0, files.length + ' files');

const found = [];
const seenSig = {};
for (const f of files) {
  const raw = fs.readFileSync(path.join(SRC, f), 'utf8');
  const code = stripNonCode(raw);
  const lines = code.split('\n');
  lines.forEach((ln, idx) => {
    if (/\.(appendRow|setValues)\s*\(/.test(ln)) {
      let key = f + '|' + sig(ln.trim());
      if (seenSig[key]) key = key + '#' + (++seenSig[key]); else seenSig[key] = 1;
      found.push({ key: key, file: f, line: idx + 1, text: ln.trim().slice(0, 62) });
    }
  });
}

/* ① koi NAYI raw write site to nahi aayi? */
const unknown = found.filter(s => !ALLOWLIST[s.key]);
ok('koi nayi (non-allowlisted) raw write site nahi',
  unknown.length === 0,
  unknown.length ? unknown.map(s => s.key + ' (line ' + s.line + ')').join(', ') : found.length + ' sites sab allowlist mein');

/* ② allowlist mein koi MURDA entry to nahi (jo ab code mein ho hi nahi)? */
const stale = Object.keys(ALLOWLIST).filter(k => !found.some(s => s.key === k));
ok('allowlist mein koi purani/murdi entry nahi',
  stale.length === 0,
  stale.length ? 'hatayein: ' + stale.join(', ') : Object.keys(ALLOWLIST).length + ' entries sab zinda');

/* ③ har allowlisted site: ya to DB.touch() hai, ya doosri spreadsheet */
for (const s of found) {
  const reason = ALLOWLIST[s.key] || '';
  const src = fs.readFileSync(path.join(SRC, s.file), 'utf8').split('\n');
  /* function ke akhir tak DB.touch dhoondo (nazdeeki 60 line) */
  const tail = src.slice(Math.max(0, s.line - 1), s.line + 60).join('\n');
  const hasTouch = /DB\.touch\s*\(/.test(tail);
  const otherSpreadsheet = /SpreadsheetApp\.create/.test(src.slice(0, s.line).join('\n')
    .split('\n').reverse().slice(0, 30).reverse().join('\n'));
  ok('  ↳ ' + s.file + ':' + s.line + ' mehfooz', hasTouch || otherSpreadsheet,
    hasTouch ? 'DB.touch() maujood' : otherSpreadsheet ? 'doosri spreadsheet' : 'DONO NAHI — theek karein!');
}

console.log('\n' + '═'.repeat(64));
console.log(`  RAW WRITE GUARD   PASS: ${PASS}   FAIL: ${FAIL}`);
console.log('═'.repeat(64) + '\n');
process.exit(FAIL ? 1 : 0);
