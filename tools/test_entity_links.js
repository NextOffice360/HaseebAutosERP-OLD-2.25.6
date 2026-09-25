#!/usr/bin/env node
/* ============================================================================
 * tools/test_entity_links.js — v2.30.5 (P2) ENTITY-LINK GATE
 * ----------------------------------------------------------------------------
 * Mandate §3/§6 (entity-centric UX): modal dead-ends ab record-context links.
 * Rendered-DOM assertions (standing rule — sirf DOM se sabit hota hai):
 *   A) UI2.entityLink helper: modal ke andar link → click → TOP overlay band +
 *      App.go deep-link (#/parties?tab=…)
 *   B) REAL flow: customers.save + orders.save → orders list row → order modal
 *      → customer .ent-link mojood + sahi label → click → modal band + parties
 *      tab=customers deep-link + partyDetail offcanvas khula
 *   C) zero page errors
 * Run:  node tools/test_entity_links.js   (server 8021 + LD_LIBRARY_PATH)
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

    /* ── PART A — helper + closeTop (modal ke andar) ─────────────────────── */
    console.log('\x1b[1mPART A — UI2.entityLink helper + closeTop\x1b[0m');
    await page.evaluate(() => new Promise(res => {
      const link = UI2.entityLink('parties', { tab: 'suppliers', open: 'SUP_TEST' }, 'A1 Suppliers');
      UI2.modal({ title: 'ent-link probe', body: link });
      setTimeout(res, 350);
    }));
    const linkText = await page.evaluate(() => {
      const l = document.querySelector('#modalRoot .modal2 .ent-link');
      return l ? l.textContent : null;
    });
    ok(linkText === 'A1 Suppliers', 'entityLink modal ke andar render hua (label sahi)');
    await page.click('#modalRoot .modal2 .ent-link');
    await sleep(900);
    const probeGone = await page.evaluate(() => {
      const heads = [...document.querySelectorAll('#modalRoot .modal2 h3')];
      return !heads.some(x => x.textContent.includes('ent-link probe'));
    });
    ok(probeGone, 'click par top modal band (closeTop)');
    const hashA = await page.evaluate(() => location.hash);
    ok(hashA.indexOf('#/parties') === 0 && hashA.indexOf('tab=suppliers') > -1, 'deep-link: ' + hashA);

    /* ── PART B — REAL flow: order modal customer link ───────────────────── */
    console.log('\x1b[1mPART B — order modal → customer → parties detail\x1b[0m');
    const seeded = await page.evaluate(async () => {
      const cust = await API.call('customers.save', { customer: { name: 'Entity Link Test Store', phone: '0300 1112223', type: 'CUSTOMER' } });
      const its = await API.call('items.list', {});
      const it = (its.rows || its || [])[0];
      if (!it) throw new Error('koi item nahi');
      const ord = await API.call('orders.save', { order: {
        customerId: cust.id, customerName: cust.name, phone: '0300 1112223',
        items: [{ itemId: it.id, qty: 2, price: Number(it.retailPrice) || 100 }] } });
      return { cid: cust.id, name: cust.name };
    });
    ok(!!seeded.cid, 'seed: customer + order save (customerId ' + seeded.cid + ')');

    await page.evaluate(() => App.go('orders'));
    await sleep(1600);
    const rowClicked = await page.evaluate(() => {
      const tr = document.querySelector('.screen table tbody tr, .screen .tbl tbody tr, main table tbody tr');
      if (!tr) return false; tr.click(); return true;
    });
    ok(rowClicked, 'orders list row click → order modal');
    await sleep(900);
    const custLink = await page.evaluate((name) => {
      const l = [...document.querySelectorAll('#modalRoot .modal2 .ent-link')]
        .find(x => x.textContent === name);
      return l ? { found: true, title: l.getAttribute('title') } : { found: false };
    }, seeded.name);
    ok(custLink.found, 'order modal me customer .ent-link (' + seeded.name + ')' + (custLink.found ? ' · title="' + custLink.title + '"' : ''));
    if (custLink.found) {
      await page.evaluate((name) => {
        [...document.querySelectorAll('#modalRoot .modal2 .ent-link')].find(x => x.textContent === name).click();
      }, seeded.name);
      await sleep(1400);
      const after = await page.evaluate(() => ({
        hash: location.hash,
        oc: !!document.querySelector('.offcanvas'),
        modalGone: ![...document.querySelectorAll('#modalRoot .modal2 h3')].some(x => /Order ORD/.test(x.textContent))
      }));
      ok(after.hash.indexOf('#/parties') === 0 && after.hash.indexOf('tab=customers') > -1, 'deep-link: ' + after.hash);
      ok(after.modalGone, 'order modal band hua');
      ok(after.oc, 'partyDetail offcanvas khul gaya (record context wapis mila)');
    }

    /* ── PART C — page health ─────────────────────────────────────────────── */
    console.log('\x1b[1mPART C — page health\x1b[0m');
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
