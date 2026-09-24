#!/usr/bin/env node
/* ============================================================================
   tools/test_metatags.js — META TAG GUARD (v2.8.1)
   ----------------------------------------------------------------------------
   ASLI WAAQIA (production outage, 18 Sep 2026):
     Deploy karne ke baad app khulti hi nahi thi. Apps Script execution log:
         Exception: The meta tag you specified is not allowed in this context.
                    (line 58, file "Code")
     Wajah: Apps Script ka `HtmlOutput.addMetaTag()` SIRF 4 meta tags allow
     karta hai (official docs — developers.google.com/apps-script/reference/
     html/html-output):
         viewport · apple-mobile-web-app-capable · mobile-web-app-capable ·
         google-site-verification
     Hum ne doGet() aur Pwa.serve() mein theme-color, description,
     apple-mobile-web-app-title aur apple-mobile-web-app-status-bar-style bhi
     server se add kiye the → har request par exception → POORI APP DOWN.

   HAL (2 hissay):
     1. Server: sirf `addSafeMetaTag()` (Code.gs) — jo tag allowed nahi usay
        chupke se skip karta hai, page down nahi hota.
     2. Client: baqi tags browser mein inject (Index.html / Pwa_Shell.html) —
        wahan koi pabandi nahi.

   YE TEST KYA KARTA HAI:
     (A) STATIC  — apps-script/*.gs mein har `addMetaTag(` call site dekhta
         hai. Koi bhi DIRECT call jiska naam allowed list mein nahi, FAIL.
     (B) DYNAMIC — asli `doGet()` aur `Pwa.serve()` ko mock sandbox mein
         CHALATA hai. mock_gs.js ka HtmlService ab wahi exception deta hai jo
         Google deta hai, is liye ye test production crash ko dohra sakta hai.
     (C) TEMPLATE — client-side injection maujood hai (warna theme-color/PWA
         look chupke se chala jata).
     (D) DEMO     — demo/index.html mein koi `<?!= … ?>` literal nahi bacha
         (warna script toot jati aur smoke gate fail hota).
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { loadBackend } = require('./mock_gs');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'apps-script');

let PASS = 0, FAIL = 0;
function ok(name, cond, note) {
  if (cond) { PASS++; console.log('  \x1b[32m✔\x1b[0m ' + name + (note ? '  \x1b[2m→ ' + note + '\x1b[0m' : '')); }
  else { FAIL++; console.log('  \x1b[31m✘ ' + name + '\x1b[0m' + (note ? '  → ' + note : '')); }
}

/* Apps Script ke allowed meta tags (official docs) */
const ALLOWED = ['viewport', 'apple-mobile-web-app-capable',
  'mobile-web-app-capable', 'google-site-verification'];

/* ==========================================================================
   (A) STATIC SCAN — har addMetaTag( call site
   ========================================================================== */
function stripCommentsAndStrings(code) {
  /* comments aur string literals hata dein taake doc comments mein likhe
     misaal (jaise guide ke code snippets) jhoote alarm na banayen */
  let out = '', i = 0;
  while (i < code.length) {
    const c = code[i], d = code[i + 1];
    if (c === '/' && d === '/') { while (i < code.length && code[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i += 2; while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '"' || c === "'") {
      const q = c; i++;
      while (i < code.length && code[i] !== q) { if (code[i] === '\\') i++; i++; }
      i++; out += '""'; continue;
    }
    out += c; i++;
  }
  return out;
}

(function staticScan() {
  const files = fs.readdirSync(SRC).filter(f => f.endsWith('.gs'));
  const bad = [];
  let sites = 0;
  files.forEach(f => {
    const raw = fs.readFileSync(path.join(SRC, f), 'utf-8');
    const code = stripCommentsAndStrings(raw);
    const re = /addMetaTag\s*\(/g;
    let m;
    while ((m = re.exec(code))) {
      sites++;
      /* call ke baad wala argument: 'name' ya variable */
      const after = code.slice(m.index + m[0].length, m.index + m[0].length + 60).trim();
      const lit = after.match(/^(['"])([^'"]+)\1/);
      if (!lit) continue;                    /* dynamic name → addSafeMetaTag */
      if (ALLOWED.indexOf(lit[2]) === -1) {
        bad.push(f + ': addMetaTag(\'' + lit[2] + '\')');
      }
    }
  });
  ok('(A) koi illegal addMetaTag() literal nahi', bad.length === 0,
    bad.length === 0 ? sites + ' call site(s) saf' : bad.join(' | '));

  /* addSafeMetaTag helper maujood aur allowed-list ke sath? */
  const code = fs.readFileSync(path.join(SRC, 'Code.gs'), 'utf-8');
  ok('(A) addSafeMetaTag() helper maujood hai', /function addSafeMetaTag\s*\(/.test(code));
  ok('(A) GAS_ALLOWED_META list docs se match karti hai',
    ALLOWED.every(n => code.indexOf("'" + n + "'") !== -1) &&
    /GAS_ALLOWED_META\s*=/.test(code),
    ALLOWED.length + ' allowed tags');

  /* doGet / Pwa.serve ab DIRECT chain use na karein */
  const pwa = fs.readFileSync(path.join(SRC, 'Pwa.gs'), 'utf-8');
  const directInPwa = /addMetaTag\s*\(\s*['"]/.test(stripCommentsAndStrings(pwa));
  ok('(A) Pwa.serve() direct addMetaTag chain use nahi karta', !directInPwa);
})();

/* ==========================================================================
   (B) DYNAMIC — asli doGet() / Pwa.serve() chalao (production crash replay)
   ========================================================================== */
(function dynamic() {
  const { sandbox } = loadBackend(SRC);

  /* 1. main ERP route */
  let out = null, err = null;
  try { out = sandbox.doGet({ parameter: {} }); } catch (e) { err = e; }
  ok('(B) doGet() chalta hai — koi exception nahi', !err,
    err ? err.message : 'HtmlOutput mila');

  if (out) {
    const names = (out.getMetaTags ? out.getMetaTags() : []).map(m => m.name);
    ok('(B) doGet() ke meta tags sab allowed hain',
      names.every(n => ALLOWED.indexOf(n) !== -1),
      names.length ? names.join(', ') : 'koi meta tag nahi');
    ok('(B) viewport lag gaya (mobile layout ke liye zaroori)',
      names.indexOf('viewport') !== -1);
    ok('(B) title set hua', !!out.getTitle(), out.getTitle());
  }

  /* 2. teenon PWA routes (?app=wh / fo / sm) */
  ['wh', 'fo', 'sm'].forEach(id => {
    let o = null, e2 = null;
    try { o = sandbox.doGet({ parameter: { app: id } }); } catch (e) { e2 = e; }
    ok('(B) PWA route ?app=' + id + ' chalta hai', !e2,
      e2 ? e2.message : 'ok');
    if (o) {
      const nm = (o.getMetaTags ? o.getMetaTags() : []).map(m => m.name);
      ok('(B) ?app=' + id + ' ke meta tags allowed hain',
        nm.every(n => ALLOWED.indexOf(n) !== -1), nm.join(', ') || 'none');
    }
  });

  /* 3. JSONP route (static hosting) — meta tags se mutasir na ho */
  let jErr = null;
  try { sandbox.doGet({ parameter: { t: 'jsonp', a: 'system.ping', cb: 'cb1' } }); }
  catch (e) { jErr = e; }
  ok('(B) JSONP route ab bhi chalta hai', !jErr, jErr ? jErr.message : 'ok');
})();

/* ==========================================================================
   (C) TEMPLATES — client-side injection maujood?
   ========================================================================== */
(function templates() {
  const idx = fs.readFileSync(path.join(SRC, 'Index.html'), 'utf-8');
  ok('(C) Index.html client-side meta inject karta hai',
    /document\.createElement\('meta'\)/.test(idx) && /theme-color/.test(idx));

  const shell = fs.readFileSync(path.join(SRC, 'Pwa_Shell.html'), 'utf-8');
  ok('(C) Pwa_Shell.html mein HA_applyExtraMeta() hai',
    /function HA_applyExtraMeta\s*\(/.test(shell));
  ok('(C) HA_applyExtraMeta duplicate nahi banata (querySelector)',
    /querySelector\('meta\[name=/.test(shell));

  let callSites = 0;
  ['Pwa_Warehouse', 'Pwa_Field', 'Pwa_Salesman'].forEach(n => {
    const t = fs.readFileSync(path.join(SRC, n + '.html'), 'utf-8');
    if (/HA_applyExtraMeta\s*\(/.test(t)) callSites++;
  });
  ok('(C) teenon PWA templates HA_applyExtraMeta bulate hain', callSites === 3,
    callSites + '/3');

  /* Pwa.gs server se extraMetaJson bhejta hai */
  const pwa = fs.readFileSync(path.join(SRC, 'Pwa.gs'), 'utf-8');
  ok('(C) Pwa.gs extraMetaJson JSON.stringify se bhejta hai',
    /extraMetaJson\s*=\s*JSON\.stringify/.test(pwa));
  ok('(C) extraMetaJson </script> breakout se mehfooz hai',
    /replace\(\/</.test(pwa));
})();

/* ==========================================================================
   (D) DEMO BUILD — koi scriptlet literal na bacha ho
   ========================================================================== */
(function demo() {
  const f = path.join(ROOT, 'demo', 'index.html');
  if (!fs.existsSync(f)) { ok('(D) demo/index.html maujood hai', false, 'file nahi'); return; }
  const html = fs.readFileSync(f, 'utf-8');
  ok('(D) demo mein koi <?!= … ?> literal nahi bacha', !/<\?!=/.test(html));
  ok('(D) demo mein koi <?= … ?> literal nahi bacha', !/<\?=[^<]/.test(html));
  /* demo Index.html se banta hai (Pwa_Shell include nahi hota), is liye
     wahan HA_applyExtraMeta nahi — Index.html ka apna upsert script hota hai */
  ok('(D) demo mein client-side meta upsert maujood hai',
    /createElement\('meta'\)/.test(html) && /theme-color/.test(html));
})();

/* ========================================================================== */
console.log('');
console.log('══════════════════════════════════════════════════════════════');
console.log('  META TAG GUARD   PASS: ' + PASS + '   FAIL: ' + FAIL);
console.log('══════════════════════════════════════════════════════════════');
process.exit(FAIL ? 1 : 0);
