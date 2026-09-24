#!/usr/bin/env node
/* ==========================================================================
   _harness.js — shared test-harness helpers (v2.25.9)
   --------------------------------------------------------------------------
   Sabaq (2026-09-24): jsdom/puppeteer ka boot 280-1000 ms ke darmiyan badalta
   hai, magar kai gates fixed `sleep(300-1000)` ke baad seedha
   `#lgUser.value = ...` set kar dete the → race. Kabhi login hi nahi hota
   (66 FAIL), kabhi poora gate crash ("Cannot set properties of null").

   Ilaj ek hi jagah (shared): pehle poll karo, phir login karo. Sab gates
   yahi helpers use karein — page-specific fixed sleeps nahi.
   ========================================================================== */
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ------------------------------ puppeteer ------------------------------- */

/** page ke andar koi shart pooori hone tak intezar (fn page-context function hai) */
async function waitForPage(page, fn, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < (ms || 10000)) {
    let hit = false;
    try { hit = await page.evaluate(fn); } catch (e) { hit = false; }
    if (hit) return true;
    await sleep(120);
  }
  return false;
}

/** login screen ka poll + demo credentials se login. true = logged in */
async function login(page, opts) {
  opts = opts || {};
  const user = opts.user || 'owner';
  const pass = opts.pass || 'admin123';
  const ready = await waitForPage(page, () => !!document.querySelector('#lgUser'), opts.wait || 10000);
  if (!ready) return false;
  await page.evaluate((u, p, btnSel) => {
    const U = document.querySelector('#lgUser'), P = document.querySelector('#lgPass');
    if (U) U.value = u;
    if (P) P.value = p;
    const b = btnSel ? document.querySelector(btnSel) : null;
    if (b) { b.click(); return; }
    const f = document.querySelector('form.login-box');
    if (f) f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  }, user, pass, opts.button || '');
  await waitForPage(page, () => { const s = document.querySelector('#shell'); return !!(s && !s.hidden); }, opts.shellWait || 8000);
  if (opts.settle !== 0) await sleep(opts.settle || 400);
  return true;
}

/* -------------------------------- jsdom -------------------------------- */

/** doc ke andar koi shart pooori hone tak intezar */
async function waitForDom(fn, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < (ms || 10000)) {
    let hit = false;
    try { hit = fn(); } catch (e) { hit = false; }
    if (hit) return true;
    await sleep(60);
  }
  return false;
}

/** jsdom login (doc + win). true = logged in */
async function loginDom(doc, win, opts) {
  opts = opts || {};
  const ready = await waitForDom(() => !!(doc.querySelector('#lgUser') && doc.querySelector('#lgPass')), opts.wait || 10000);
  if (!ready) return false;
  const user = doc.querySelector('#lgUser'), pass = doc.querySelector('#lgPass');
  user.value = opts.user || 'owner';
  pass.value = opts.pass || 'admin123';
  const form = doc.querySelector('form.login-box');
  if (form) form.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  await waitForDom(() => { const s = doc.querySelector('#shell'); return !!(s && !s.hidden); }, opts.shellWait || 8000);
  if (opts.settle !== 0) await sleep(opts.settle || 400);
  return true;
}

module.exports = { sleep, waitForPage, login, waitForDom, loginDom };
