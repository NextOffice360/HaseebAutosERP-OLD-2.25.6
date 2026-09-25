#!/usr/bin/env node
/* ============================================================================
 * tools/test_doc_resolver.js — v2.30.5 (D2) UNIVERSAL CODE RESOLVER GATE
 * ----------------------------------------------------------------------------
 * Doc-intel §1: QR/barcode = bidirectional navigation keys. Rendered-DOM:
 *   A) HA: standard payloads (INV/ITM/CUS/SUP) → sahi screen + record khule
 *   B) legacy payloads (JSON {inv,total}, CODE:;SKU:, raw code) → resolve
 *   C) manual-entry modal (bina onDetect) → Enter → resolver chalta hai
 *   D) unknown code → graceful warn, koi crash nahi · zero page errors
 * Run:  node tools/test_doc_resolver.js   (server 8021 + LD_LIBRARY_PATH)
 * ==========================================================================*/
'use strict';
(async () => {
  const puppeteer = require('puppeteer');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e.message).slice(0, 140)));
  await page.setViewport({ width: 1440, height: 900 });
  let pass = 0, fail = 0; const failures = [];
  const ok = (cond, name) => { if (cond) { pass++; console.log('  ✔ ' + name); } else { fail++; failures.push(name); console.log('  ✘ ' + name); } };
  const reset = async () => {
    await page.evaluate(() => {
      document.querySelectorAll('#modalRoot .modal-scrim, .offcanvas, .drawer, .drawer-scrim, .oc-scrim').forEach(n => n.remove());
      App.go('dashboard');
    });
    await sleep(700);
  };

  try {
    await page.goto('http://127.0.0.1:8021/', { waitUntil: 'networkidle2', timeout: 45000 });
    if (await page.$('#lgUser')) {
      await page.click('#lgUser'); await page.type('#lgUser', 'owner');
      await page.click('#lgPass'); await page.type('#lgPass', 'admin123');
      await page.keyboard.press('Enter');
    }
    await page.waitForFunction(() => window.App && App.state && App.state.session, { timeout: 20000 });
    await sleep(1200);

    /* seed data */
    const seed = await page.evaluate(async () => {
      const cust = await API.call('customers.save', { customer: { name: 'Resolver Test Mart', phone: '0300 9998877', type: 'CUSTOMER' } });
      const its = await API.call('items.list', { pageSize: 100 });
      const it = (its.rows || its || [])[0];
      const sl = await API.call('sales.list', { pageSize: 5 });
      const sale = (sl.rows || [])[0];
      return { cid: cust.id, iid: it && it.id, icode: it && it.code, inv: sale && sale.invoiceNo, sid: sale && sale.id };
    });
    ok(!!(seed.cid && seed.iid && seed.inv), 'seed: customer + item + invoice (' + seed.inv + ')');

    /* ── PART A — HA: standard payloads ──────────────────────────────────── */
    console.log('\x1b[1mPART A — HA: standard payloads\x1b[0m');
    const rInv = await page.evaluate((inv) => App.resolveCode('HA:INV:' + inv), seed.inv);
    await sleep(1200);
    ok(rInv && rInv.ok && rInv.screen === 'sales', 'HA:INV → sales screen (' + JSON.stringify(rInv && rInv.label) + ')');
    const invDrawer = await page.evaluate(() => !!document.querySelector('.drawer, #modalRoot .modal2'));
    ok(invDrawer, 'invoice drawer/detail foran khula');
    await reset();

    const rCus = await page.evaluate((cid) => App.resolveCode('HA:CUS:' + cid), seed.cid);
    await sleep(1200);
    ok(rCus && rCus.ok && rCus.screen === 'parties', 'HA:CUS → parties screen');
    ok(await page.evaluate(() => location.hash.indexOf('tab=customers') > -1), 'hash: ' + (await page.evaluate(() => location.hash)));
    await reset();

    const rItm = await page.evaluate((iid) => App.resolveCode('HA:ITM:' + iid), seed.iid);
    await sleep(1200);
    ok(rItm && rItm.ok && rItm.screen === 'items', 'HA:ITM → items screen');
    ok(await page.evaluate(() => location.hash.indexOf('#/items') === 0), 'hash: ' + (await page.evaluate(() => location.hash)));
    await reset();

    /* ── PART B — legacy payloads ─────────────────────────────────────────── */
    console.log('\x1b[1mPART B — legacy payloads (backward-compat)\x1b[0m');
    const rJson = await page.evaluate((inv) => App.resolveCode('{"inv":"' + inv + '","total":1500}'), seed.inv);
    await sleep(1100);
    ok(rJson && rJson.ok && rJson.screen === 'sales', 'legacy JSON {inv,total} → sales');
    await reset();

    const rKv = await page.evaluate((iid) => App.resolveCode('CODE:XYZ;SKU:' + iid), seed.iid);
    await sleep(1100);
    ok(rKv && rKv.ok && rKv.screen === 'items', 'legacy CODE:;SKU: → items');
    await reset();

    const rRaw = await page.evaluate((code) => App.resolveCode(code), seed.icode);
    await sleep(1100);
    ok(rRaw && rRaw.ok && rRaw.screen === 'items', 'raw item-code → items (' + seed.icode + ')');
    await reset();

    /* ── PART C — manual entry modal (bina onDetect) ─────────────────────── */
    console.log('\x1b[1mPART C — manual-entry universal path\x1b[0m');
    await page.evaluate(() => { window.HaScan.manual({}); });
    await sleep(400);
    await page.type('#modalRoot .modal2 input.f-input', 'HA:INV:' + seed.inv);
    await page.keyboard.press('Enter');
    await sleep(1300);
    ok(await page.evaluate(() => location.hash.indexOf('#/sales') === 0), 'manual Enter → resolver → ' + (await page.evaluate(() => location.hash)));
    await reset();

    /* ── PART D — unknown + page health ──────────────────────────────────── */
    console.log('\x1b[1mPART D — unknown code + page health\x1b[0m');
    const rBad = await page.evaluate(() => App.resolveCode('ZZZ-NOT-A-REAL-CODE-9137'));
    await sleep(1000);
    ok(rBad && rBad.ok === false, 'unknown code → graceful (ok=false), koi crash nahi');
    ok(errs.length === 0, 'zero page errors' + (errs.length ? ' — ' + errs[0] : ''));

    console.log('\x1b[1mSUMMARY:\x1b[0m ' + pass + ' pass \u00b7 ' + fail + ' fail \u00b7 ' + (fail ? '\x1b[31mRED\x1b[0m' : '\x1b[32mGREEN\x1b[0m'));
    if (fail) { console.log('Failures:'); failures.forEach(f => console.log('  - ' + f)); }
  } catch (e) {
    console.log('FATAL: ' + String(e.message || e).slice(0, 200));
    fail++;
  } finally {
    await browser.close();
    process.exitCode = fail ? 1 : 0;
  }
})();
