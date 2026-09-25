#!/usr/bin/env node
/* ==========================================================================
   test_session_guard.js — v2.25.9
   --------------------------------------------------------------------------
   Bug (is round pakra gaya, verify ke dauraan `smoke` gate crash se):
     logout / session-expiry par `App.state.session` null ho jata hai, magar
     shop quick-dialog aur account menu seedha `.fullName` parh rahe the →
     "Cannot read properties of null (reading 'fullName')" → poora modal gayab.

   Fix: shared `App.sessionMeta()` (App_Core.html) — poori app ek hi jagah se
   safe session values leti hai (name/initial/role/group/userId/token).

   Ye gate ASLI browser (demo/index.html) mein dono paths dobara chalata hai,
   aur teen cheezein pin karta hai:
     ① logged-in session par sessionMeta() sahi values deta hai
     ② session null par bhi crash nahi (safe fallbacks)
     ③ shop quick-dialog + account menu null session par bhi render hote hain
        aur unme 'undefined' leak nahi hota

   Run:  python3 tools/build_demo.py && node tools/test_session_guard.js
   ========================================================================== */
const puppeteer = require('puppeteer');
const { login } = require('./_harness');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const DEMO = path.join(ROOT, 'demo', 'index.html');

let pass = 0, fail = 0; const failures = [];
const ok = (n, c, d) => c ? (pass++, console.log('  ✔ ' + n + (d ? '  → ' + d : '')))
  : (fail++, failures.push(n), console.log('  ✖ ' + n + (d ? '  → ' + d : '')));
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (!fs.existsSync(DEMO)) {
  console.log('✖ demo/index.html nahi mila — pehle: python3 tools/build_demo.py');
  process.exit(1);
}

(async () => {
  const errs = [];
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1440, height: 900 }
  });
  const page = await browser.newPage();
  page.on('pageerror', e => errs.push(String((e && e.message) || e)));

  await page.goto('file://' + DEMO, { waitUntil: 'load' });
  await sleep(600);

  /* poll + login — shared harness (fixed-sleep race ka ek hi ilaaj) */
  const loggedIn = await login(page);
  ok('login form mojood hai + login hua', loggedIn);
  if (!loggedIn) { await browser.close(); console.log('\nGATE CRASH: login nahi hua'); process.exit(2); }
  await sleep(1600);
  ok('login ke baad shell khuli', await page.evaluate(() => !!document.querySelector('#shell') && !document.querySelector('#shell').hidden));

  /* ①  logged-in session */
  const m1 = await page.evaluate(() => {
    const m = App.sessionMeta();
    return { ok: m.ok, name: m.name, initial: m.initial, role: m.role, userId: m.userId, token: !!m.token };
  });
  ok('sessionMeta() logged-in par ok=true', m1.ok === true);
  ok('sessionMeta() naam deta hai', !!m1.name, m1.name);
  ok('sessionMeta() initial = naam ka pehla harf', m1.initial === String(m1.name || 'U').charAt(0).toUpperCase(), m1.initial);
  ok('sessionMeta() userId + token deta hai', !!m1.userId && m1.token === true, m1.userId);

  /* ②  session null — koi throw nahi */
  const m2 = await page.evaluate(() => {
    let threw = '';
    let m = {};
    try { App.state.session = null; m = App.sessionMeta(); } catch (e) { threw = String(e.message || e); }
    return { threw, ok: m.ok, name: m.name, initial: m.initial, role: m.role, userId: m.userId, group: m.group };
  });
  ok('session null par sessionMeta() throw nahi karta', m2.threw === '', m2.threw);
  ok('null session par safe fallbacks (name "", initial "U", role "—")',
    m2.ok === false && m2.name === '' && m2.initial === 'U' && m2.role === '\u2014' && m2.userId === '' && m2.group === '',
    JSON.stringify(m2));

  const beforeErrs = errs.length;

  /* ③  shop quick-dialog: khuli cash-session + null app-session (asli crash path) */
  await page.evaluate(async () => {
    window.__origCall = API.call;
    API.call = function (a, p, o) {
      if (a === 'cash.session.summary') {
        return Promise.resolve({
          sessionNo: 'TEST-1',
          openedAt: new Date(Date.now() - 3600e3).toISOString(),
          openingCash: 500,
          totals: { txns: 3, cashIn: 1000, cashOut: 0, expenses: 0, card: 200, expectedCash: 1500 }
        });
      }
      return window.__origCall.call(this, a, p, o);
    };
    await window.shopQuickDialog();
  });
  await sleep(500);
  const shop = await page.evaluate(() => {
    const m = Array.from(document.querySelectorAll('.modal-scrim, .modal2, .modal')).pop();
    return m ? (m.textContent || '') : '';
  });
  ok('shop quick-dialog null session par bhi khula', /Shop khuli hai|Shop is open/i.test(shop), shop.slice(0, 70)); /* v2.30.6: T.t EN fallback bhi */
  ok('shop dialog summary rows render hui', /Expected in drawer/.test(shop) && /Opening cash/.test(shop));
  ok('shop dialog mein undefined leak nahi', !/undefined/.test(shop));
  ok('shop dialog se page-error nahi aaya', errs.length === beforeErrs, errs.slice(beforeErrs).join(' | '));

  await page.evaluate(async () => {
    API.call = window.__origCall;                    // stub hata do
    Array.from(document.querySelectorAll('.modal-scrim')).forEach(m => m.remove());
  });
  await sleep(250);

  /* ④  account menu (session null) */
  await page.evaluate(() => { const b = document.querySelector('#sbUser'); if (b) b.click(); });
  await sleep(500);
  const acc = await page.evaluate(() => {
    const m = Array.from(document.querySelectorAll('.modal-scrim, .modal2, .modal')).pop();
    return m ? (m.textContent || '') : '';
  });
  ok('account menu null session par khula', /Change password/.test(acc) && /Logout/.test(acc), acc.slice(0, 70));
  ok('account menu mein undefined leak nahi', !/undefined/.test(acc));
  ok('account menu se page-error nahi aaya', errs.length === beforeErrs, errs.slice(beforeErrs).join(' | '));

  await browser.close();
  console.log('\nSESSION GUARD  →  PASS: ' + pass + '   FAIL: ' + fail);
  if (failures.length) { console.log('Failures:'); failures.forEach(f => console.log(' - ' + f)); }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('GATE CRASH: ' + ((e && e.stack) || e)); process.exit(2); });
