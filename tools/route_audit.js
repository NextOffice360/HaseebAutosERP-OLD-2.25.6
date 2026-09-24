#!/usr/bin/env node
/* ==========================================================================
   route_audit.js — "route maujood hai" kafi nahi, "route CHALTA hai" chahiye
   --------------------------------------------------------------------------
   v2.6 §19/§20 ka sabaq: e2e QA ne 5 bugs pakde jin mein 2 showstopper thay —
   sirf is liye ke tests ne un functions ko kabhi CALL hi nahi kiya tha
   (sirf "route registered hai" check tha).

   Ye tool poori ROUTES table ko asli tor par chala kar 3 qism ke defects
   dhoondhta hai:

     A. CRASH    — handler TypeError / ReferenceError de (asli bug:
                   ghair-maujood function, ghalat signature)
     B. NO_ROUTE — route registered nahi magar code usay call karta hai
     C. UNTESTED — route chalti to hai magar koi test usay nahi chalta

     node tools/route_audit.js
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { loadBackend } = require('./mock_gs');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'apps-script');

/* ---------------------- 1. routes nikaalo (Code.gs) ----------------------- */
const codeSrc = fs.readFileSync(path.join(DIR, 'Code.gs'), 'utf8');
const ROUTE_RE = /^\s*'([a-z0-9_]+(?:\.[a-z0-9_]+)+)'\s*:\s*function\s*\(/gm;
const routes = [];
let m;
while ((m = ROUTE_RE.exec(codeSrc)) !== null) routes.push(m[1]);
const unique = [...new Set(routes)].sort();

/* ------------------ 2. kaun se tests kin routes ko chalate hain ----------- */
const TEST_FILES = ['test_logic.js', 'test_e2e.js', 'smoke.js'];
const testSrc = TEST_FILES
  .map(f => { const p = path.join(__dirname, f); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''; })
  .join('\n');
/* sirf woh jahan action ASLI tor par call ho (string literal ke zariye) */
const exercised = new Set();
unique.forEach(a => {
  const re = new RegExp("['\"`]" + a.replace(/\./g, '\\.') + "['\"`]", 'g');
  if (re.test(testSrc)) exercised.add(a);
});

/* --------------------------- 3. backend chalao ---------------------------- */
const { sandbox } = loadBackend(DIR);
sandbox.Setup.setupAll();
sandbox.Setup.seedAll();
sandbox.Setup.seedProducts({ stock: 20 });

const login = sandbox.api('auth.login', { username: 'owner', password: 'admin123' });
const TOKEN = (login.data && login.data.token) || '';

/* kuch routes ko kam se kam sahi shape chahiye — warna validation error aata
   hai (wo bug nahi, sirf shart hai). Inhein 'OK' manenge. */
const SHAPES = {
  'sales.create': { sale: { locationId: 'LOC-SDQ', items: [] } },
  'purchase.po.save': { po: { locationId: 'LOC-SDQ', items: [] } },
  'stock.transfer.save': { transfer: { fromLocationId: 'LOC-SDQ', toLocationId: 'LOC-MCH', items: [] } },
  'payments.create': { payment: { amount: 1, method: 'CASH' } },
  'expenses.create': { expense: { amount: 1, method: 'CASH' } },
  'orders.save': { order: { locationId: 'LOC-SDQ', items: [] } },
  'salesman.issue': { salesmanId: '', items: [] },
  'salesman.settle': { salesmanId: '' },
  'salesman.return': { salesmanId: '', items: [] },
  'reports.run': { id: '' },
  'pwa.sync': { queue: [] },
  'pwa.bootstrap': { app: 'wh' }
};

const VALIDATION = /zaroori|chahiye|select|mila|nahi|required|Invalid|blank|kam az kam|Unknown action|Unknown report|Report nahi mila|ijazat|permission|access|band hai|Unknown PWA|lazmi/i;

const crashes = [];
const noRoute = [];
const validation = [];
const worked = [];

unique.forEach((action) => {
  const payload = Object.assign({ token: TOKEN, locationId: 'LOC-SDQ' }, SHAPES[action] || {});
  let r;
  try {
    r = sandbox.api(action, payload);
  } catch (e) {
    /* handler ne throw kiya (api unhein catch kar leta hai, magar safety net) */
    crashes.push({ action, err: (e && e.message) || String(e) });
    return;
  }
  if (!r || typeof r !== 'object') { crashes.push({ action, err: 'no response object' }); return; }

  if (r.ok) { worked.push(action); return; }

  const msg = String(((r.error || {}).message) || '');
  const code = String(((r.error || {}).code) || '');

  if (code === 'NO_ROUTE' || /Unknown action/.test(msg)) { noRoute.push(action); return; }

  /* CRASH vs VALIDATION farq: asli code defect mein JS error ka nishaan hota hai */
  const isCrash = /is not a function|is not defined|Cannot read prop|Cannot set prop|undefined is not|null is not|of null|of undefined/i.test(msg);
  if (isCrash) { crashes.push({ action, err: msg }); return; }

  validation.push({ action, msg: msg.slice(0, 70) });
});

/* ------------------------------- 4. report -------------------------------- */
const P = (s) => console.log(s);
P('══════════════════════════════════════════════════════════════════');
P('  ROUTE AUDIT — kya har registered route ASLI TOR PAR chalti hai?');
P('══════════════════════════════════════════════════════════════════');
P(`  kul routes: ${unique.length}   ·   chala kar dekhe: ${unique.length}`);
P('');

if (crashes.length) {
  P(`\x1b[31m  ✖ CRASH (asli bug — handler toot gaya): ${crashes.length}\x1b[0m`);
  crashes.forEach(c => P(`     · ${c.action}\n         ${c.err.slice(0, 140)}`));
} else {
  P('  ✔ koi route crash nahi hui');
}

if (noRoute.length) {
  P(`\n\x1b[31m  ✖ NO_ROUTE (registered nahi / ghalat naam): ${noRoute.length}\x1b[0m`);
  noRoute.forEach(a => P('     · ' + a));
} else {
  P('  ✔ sab routes registered hain');
}

const untested = unique.filter(a => !exercised.has(a));
P(`\n  ── Coverage: tests kin routes ko chalate hain ──`);
P(`     exercised: ${exercised.size}/${unique.length}   ·   untested: ${untested.length}`);
if (untested.length) {
  P('\n  UNTESTED routes (yahan chupe bugs milte hain — jaise e2e ne 5 pakde):');
  untested.forEach(a => P('     · ' + a));
}

P('');
P('══════════════════════════════════════════════════════════════════');
const bad = crashes.length + noRoute.length;
if (bad) { P(`  ✖ ${bad} DEFECT`); process.exit(1); }
P('  ✔ koi crash / missing route nahi');
process.exit(0);
