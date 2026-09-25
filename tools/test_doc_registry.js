#!/usr/bin/env node
/* ============================================================================
 * tools/test_doc_registry.js — v2.30.5 (D3) DOCUMENT REGISTRY GATE
 * ----------------------------------------------------------------------------
 * Doc-intel §2: har generated doc indexed → scannable → resolvable → trackable.
 * Rendered-DOM/API assertions:
 *   A) Docs.register → list/get (docNo, version, status defaults)
 *   B) invoice-drawer Print click (window.open stubbed) → registry entry auto
 *   C) RELOAD → registry entry qayam (config-snapshot persistence)
 *   D) resolver: HA:DOC:<id> → related entity screen + detail khula
 *   E) unknown HA:DOC graceful · zero page errors
 * Run:  node tools/test_doc_registry.js   (server 8021 + LD_LIBRARY_PATH)
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

  try {
    await page.goto('http://127.0.0.1:8021/', { waitUntil: 'networkidle2', timeout: 45000 });
    if (await page.$('#lgUser')) {
      await page.click('#lgUser'); await page.type('#lgUser', 'owner');
      await page.click('#lgPass'); await page.type('#lgPass', 'admin123');
      await page.keyboard.press('Enter');
    }
    await page.waitForFunction(() => window.App && App.state && App.state.session, { timeout: 20000 });
    await sleep(1200);

    /* ── PART A — Docs.register + list/get ────────────────────────────────── */
    console.log('\x1b[1mPART A — registry write/read\x1b[0m');
    const seeded = await page.evaluate(async () => {
      const rec = await Docs.register({ docType: 'TESTDOC', entityType: 'sale', entityId: 'SAL-X1',
        ref: 'INV-TEST-1', module: 'sales', action: 'gate', qr: 'HA:INV:INV-TEST-1' });
      const got = await Docs.get(rec.id);
      return { id: rec.id, docNo: rec.docNo, got: !!got, version: rec.version, status: rec.status };
    });
    ok(seeded.id && seeded.got, 'register → get roundtrip (' + seeded.docNo + ')');
    ok(seeded.version === 1 && seeded.status === 'GENERATED', 'defaults: version=1, status=GENERATED');

    /* ── PART B — invoice print click → auto registry entry ──────────────── */
    console.log('\x1b[1mPART B — invoice print → auto registry\x1b[0m');
    const inv = await page.evaluate(async () => {
      const r = await API.call('sales.list', { pageSize: 3 });
      return (r.rows || [])[0];
    });
    ok(!!inv, 'invoice seed (' + (inv && inv.invoiceNo) + ')');
    const before = await page.evaluate(async () => (await Docs.list({ docType: 'INVOICE' })).total);
    await page.evaluate(() => {
      window.__openStubbed = 0;
      window.open = function () { window.__openStubbed++; return { document: { write() { }, close() { } }, focus() { }, print() { } }; };
      App.go('sales');
    });
    await sleep(1500);
    await page.evaluate(() => {
      const tr = document.querySelector('.screen table tbody tr, main table tbody tr');
      if (tr) tr.click();
    });
    await sleep(900);
    const clicked = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      const b = btns.find(x => /Print/.test(x.textContent)); /* v2.30.6: emoji→SVG upgrade ke baad text-only */
      if (!b) return false; b.click(); return true;
    });
    ok(clicked, 'invoice drawer 🖨 Print button click');
    await sleep(1800);
    const afterB = await page.evaluate(async (invNo) => {
      const r = await Docs.list({ docType: 'INVOICE' });
      return { total: r.total, hit: (r.rows || []).some(x => x.ref === invNo && x.action === 'print') };
    }, inv.invoiceNo);
    ok(afterB.total > before && afterB.hit, 'registry entry auto (' + (afterB.total - before) + ' naya, ref=' + inv.invoiceNo + ')');
    await page.evaluate(() => {
      document.querySelectorAll('#modalRoot .modal-scrim, .drawer, .drawer-scrim').forEach(n => n.remove());
    });

    /* ── PART C — reload persistence ──────────────────────────────────────── */
    console.log('\x1b[1mPART C — RELOAD persistence\x1b[0m');
    await page.reload({ waitUntil: 'networkidle2' });
    if (await page.$('#lgUser')) {
      await page.click('#lgUser'); await page.type('#lgUser', 'owner');
      await page.click('#lgPass'); await page.type('#lgPass', 'admin123');
      await page.keyboard.press('Enter');
    }
    await page.waitForFunction(() => window.App && App.state && App.state.session, { timeout: 20000 });
    await sleep(1200);
    const afterC = await page.evaluate(async (id) => {
      const got = await Docs.get(id);
      return got && got.docType === 'TESTDOC';
    }, seeded.id);
    ok(afterC, 'RELOAD ke baad registry entry qayam (config-snapshot)');

    /* ── PART D — HA:DOC resolve → related entity ─────────────────────────── */
    console.log('\x1b[1mPART D — HA:DOC resolver → entity\x1b[0m');
    const r = await page.evaluate((id) => App.resolveCode('HA:DOC:' + id), seeded.id);
    await sleep(1200);
    ok(r && r.ok && r.screen === 'sales', 'HA:DOC → related sale screen (' + JSON.stringify(r && r.label) + ')');
    ok(await page.evaluate(() => location.hash.indexOf('#/sales') === 0), 'hash: ' + (await page.evaluate(() => location.hash)));

    /* ── PART E — unknown + page health ───────────────────────────────────── */
    console.log('\x1b[1mPART E — unknown + page health\x1b[0m');
    const rb = await page.evaluate(() => App.resolveCode('HA:DOC:DOC99999'));
    await sleep(800);
    ok(rb && rb.ok === false, 'unknown HA:DOC → graceful');
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
