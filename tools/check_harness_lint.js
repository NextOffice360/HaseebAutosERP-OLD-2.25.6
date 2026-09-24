#!/usr/bin/env node
/* ==========================================================================
   check_harness_lint.js — login-race lint (v2.25.9)
   --------------------------------------------------------------------------
   Kyun: 2026-09-24 ki teen full-verify runs mein gates sirf is wajah se gire ke
   wo fixed `sleep(300-2200)` ke baad seedha `#lgUser.value = 'owner'` set kar
   dete the — boot kabhi 280ms leta hai, kabhi 1000ms+ → ya login hi nahi hota,
   ya gate crash ("Cannot set properties of null").

   Ilaj: `tools/_harness.js` (poll + login helpers). Ye lint us pattern ko
   wapas aane se rokta hai:

     RULE 1:  jo file login values set karti hai (`.value = 'owner'`) usay
              `require('./_harness')` karna chahiye.
     RULE 2:  jo file `#lgUser` / `.login-box input` ko chhoti hai, usay ya
              harness use karna chahiye, ya `page.type()` / `waitForFunction()`
              (puppeteer khud wait karta hai), ya explicit "harness-exempt" marker likhe.

   Run: node tools/check_harness_lint.js      (tools/check.sh ka hissa)
   ========================================================================== */
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const SKIP = new Set(['_harness.js', 'check_harness_lint.js']);
const SET_LOGIN = /\.value\s*=\s*['"]owner['"]/;
const USES_LOGIN = /#lgUser|login-box input/;
const SAFE_WAIT = /page\.type\(|waitForFunction\(|waitForPage\(|waitForDom\(|loginDom\(|\blogin\(page|harness-exempt/;

const files = fs.readdirSync(DIR).filter(f => f.endsWith('.js') && !SKIP.has(f));
const problems = [];
let r1 = 0, r2 = 0;

for (const f of files) {
  const src = fs.readFileSync(path.join(DIR, f), 'utf-8');
  const hasHarness = /require\(['"]\.\/_harness['"]\)/.test(src);
  if (SET_LOGIN.test(src)) {
    r1++;
    if (!hasHarness) problems.push(f + '  → login values seedha set karta hai magar _harness require nahi (RULE 1)');
  }
  if (USES_LOGIN.test(src) && !hasHarness && !SAFE_WAIT.test(src)) {
    r2++;
    problems.push(f + '  → login DOM ko chhota hai magar na harness, na page.type/waitForFunction (RULE 2)');
  }
}

console.log('  checked ' + files.length + ' tools   (RULE 1 hits: ' + r1 + ', RULE 2 hits: ' + r2 + ')');
if (problems.length) {
  problems.forEach(p => console.log('  ✖ ' + p));
  console.log('  ✖ ' + problems.length + ' file(s) mein login-race pattern mojood hai');
  process.exit(1);
}
console.log('  ✔ koi login-race pattern nahi (sab shared harness par)');
