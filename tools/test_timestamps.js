#!/usr/bin/env node
/**
 * tools/test_timestamps.js — W4/T4.2 GATE (spec Part-1 §8 · §18 #6)
 * ---------------------------------------------------------------------------
 * Spec: "Record stamps — createdAt/updatedAt (full timestamp) har write path
 * (.gs + demo mock) + display (detail view par Created/Updated line)."
 *
 * Modules (6):
 *   A. orders.create  — naya order createdAt + updatedAt dono le kar janme
 *   B. orders.update  — edit par updatedAt aage barhe (createdAt na badle)
 *   C. orders.status/convert — dono paths par updatedAt bump (DB.gs parity)
 *   D. items.create/update — item save par stamps
 *   E. customers/suppliers — party saves par stamps
 *   F. RENDERED DOM   — order detail modal mein .stamp-row[data-dt-stamp]
 *                       "Created: DD MMM YYYY, HH:MM:SS" nazar aaye
 *
 * Backend (.gs) side DB.gs ke central stamps (L293/330/374) se covered hai —
 * yeh gate demo-mock parity + display contract pakadta hai.
 *
 * Run (demo server 8021 chalu ho):
 *   export LD_LIBRARY_PATH=/home/user/.cache/chrome-libs/usr/lib/x86_64-linux-gnu
 *   node tools/test_timestamps.js [http://127.0.0.1:8021/]
 */
'use strict';
const puppeteer = require('puppeteer');

let pass = 0, fail = 0; const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  \u2714 ' + name); }
  else { fail++; failures.push(name + (detail ? ' \u2192 ' + detail : '')); console.log('  \u2716 ' + name + (detail ? '  \u2192 ' + detail : '')); }
}
const section = t => console.log('\n\x1b[1m' + t + '\x1b[0m');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const TARGET = process.argv[2] || 'http://127.0.0.1:8021/';
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(String(e.message || e).slice(0, 200)));
  await page.goto(TARGET + 'index.html', { waitUntil: 'networkidle2', timeout: 45000 });

  /* login */
  if (await page.$('#lgUser')) {
    await page.click('#lgUser'); await page.type('#lgUser', 'owner');
    await page.click('#lgPass'); await page.type('#lgPass', 'admin123');
    await page.keyboard.press('Enter');
  }
  await page.waitForFunction(() => window.App && App.state && App.state.session, { timeout: 20000 });
  await sleep(1200);

  /* seed item → order create/update/status/convert sab ek hi page par */
  const ord = await page.evaluate(async () => {
    const out = {};
    const res = await API.call('items.list', {});
    const items = res.items || res.rows || res;
    const it = items[0];
    const mkOrder = extra => Object.assign({
      customerName: 'Stamp Probe', phone: '0300',
      items: [{ itemId: it.id, name: it.name, qty: 1, price: it.retailPrice }],
      total: it.retailPrice
    }, extra);
    /* A ▸ create */
    await new Promise(x => setTimeout(x, 15));
    const saved = await API.call('orders.save', { order: mkOrder({}) });
    const g1 = await API.call('orders.get', { id: saved.order.id });
    out.created = g1.order.createdAt || ''; out.createdUpd = g1.order.updatedAt || '';
    /* B ▸ update — updatedAt aage barhe, createdAt wahi rahe */
    await new Promise(x => setTimeout(x, 15));
    await API.call('orders.save', { order: mkOrder({ id: saved.order.id, customerName: 'Stamp Probe 2' }) });
    const g2 = await API.call('orders.get', { id: saved.order.id });
    out.updAt = g2.order.updatedAt || ''; out.createdAtAfterEdit = g2.order.createdAt || '';
    out.nameAfterEdit = g2.order.customerName || '';
    /* C ▸ status change */
    await new Promise(x => setTimeout(x, 15));
    await API.call('orders.status', { id: saved.order.id, status: 'CONFIRMED' });
    const g3 = await API.call('orders.get', { id: saved.order.id });
    out.statusAt = g3.order.updatedAt || ''; out.statusNow = g3.order.status;
    /* C ▸ convert (jo chale) */
    try {
      await API.call('orders.convert', { id: saved.order.id, advance: 0, method: 'CASH' });
      const g4 = await API.call('orders.get', { id: saved.order.id });
      out.convAt = g4.order.updatedAt || ''; out.invoiceNo = g4.order.invoiceNo || '';
    } catch (e) { out.convErr = e.message; }
    out.orderId = saved.order.id;
    return out;
  }).catch(e => ({ evalErr: e.message }));

  section('A \u25B8 orders.create — naya order stamps ke sath');
  ok('createdAt mojood (full timestamp)', /T\d{2}:\d{2}:\d{2}/.test(ord.created || ''), ord.created || String(ord.evalErr));
  ok('create par updatedAt bhi mojood', /T\d{2}:\d{2}:\d{2}/.test(ord.createdUpd || ''), ord.createdUpd || '');

  section('B \u25B8 orders.update — updatedAt bump, createdAt sthir');
  ok('edit ke baad customerName badla (update waqai hua)', ord.nameAfterEdit === 'Stamp Probe 2', ord.nameAfterEdit);
  ok('createdAt edit par nahi badla', ord.createdAtAfterEdit === ord.created, ord.createdAtAfterEdit);
  ok('updatedAt edit par aage barha', String(ord.updAt) > String(ord.created), ord.updAt + ' vs ' + ord.created);

  section('C \u25B8 orders.status / orders.convert — DB.gs parity');
  ok('status change par updatedAt phir barha', String(ord.statusAt) > String(ord.updAt), ord.statusAt + ' vs ' + ord.updAt);
  ok('status CONFIRMED hua', ord.statusNow === 'CONFIRMED', ord.statusNow);
  if (ord.convErr) { ok('convert path par updatedAt bump', false, 'convert err: ' + ord.convErr); }
  else {
    ok('convert par invoiceNo set', !!ord.invoiceNo, ord.invoiceNo);
    ok('convert par updatedAt bump', String(ord.convAt) > String(ord.statusAt), ord.convAt + ' vs ' + ord.statusAt);
  }

  /* D + E ▸ items / customers / suppliers */
  const parties = await page.evaluate(async () => {
    const out = {};
    await new Promise(x => setTimeout(x, 15));
    const ni = await API.call('items.save', { item: { name: 'Stamp Item', code: 'STP-1', category: 'Test', qty: 3, rate: 100, retailPrice: 150 } });
    out.itemC = ni.createdAt || ''; out.itemU1 = ni.updatedAt || ''; out.itemId = ni.id;
    await new Promise(x => setTimeout(x, 15));
    const ui = await API.call('items.save', { item: { id: ni.id, name: 'Stamp Item 2' } });
    out.itemU2 = ui.updatedAt || '';
    await new Promise(x => setTimeout(x, 15));
    const nc = await API.call('customers.save', { customer: { name: 'Stamp Cust' } });
    out.custC = nc.createdAt || '';
    await new Promise(x => setTimeout(x, 15));
    const ns = await API.call('suppliers.save', { supplier: { name: 'Stamp Sup', phone: '0345' } });
    out.supC = ns.createdAt || ''; out.supU1 = ns.updatedAt || ''; out.supId = ns.id;
    await new Promise(x => setTimeout(x, 15));
    const us = await API.call('suppliers.save', { supplier: { id: ns.id, name: 'Stamp Sup 2' } });
    out.supU2 = us.updatedAt || '';
    return out;
  }).catch(e => ({ evalErr: e.message }));

  section('D \u25B8 items.create/update — item save par stamps');
  ok('item create: createdAt + updatedAt', /T/.test(parties.itemC || '') && /T/.test(parties.itemU1 || ''), (parties.itemC || '') + ' / ' + (parties.itemU1 || ''));
  ok('item update: updatedAt barha', String(parties.itemU2) > String(parties.itemU1), parties.itemU2 + ' vs ' + parties.itemU1);

  section('E \u25B8 customers/suppliers — party saves par stamps');
  ok('customer create: createdAt', /T/.test(parties.custC || ''), parties.custC || '');
  ok('supplier create: createdAt + updatedAt', /T/.test(parties.supC || '') && /T/.test(parties.supU1 || ''), (parties.supC || '') + ' / ' + (parties.supU1 || ''));
  ok('supplier update: updatedAt barha', String(parties.supU2) > String(parties.supU1), parties.supU2 + ' vs ' + parties.supU1);

  /* F ▸ RENDERED DOM — order detail modal par stamp line */
  section('F \u25B8 RENDERED DOM — order detail par Created/Updated line');
  await page.evaluate(() => App.go('orders'));
  await page.waitForFunction(() => document.querySelectorAll('#view .st2 tbody tr').length > 0, { timeout: 15000 }).catch(() => {});
  await sleep(800);
  await page.click('#view .st2 tbody tr');
  await sleep(1500);
  const stamp = await page.evaluate(() => {
    const el = document.querySelector('.stamp-row[data-dt-stamp]');
    return el ? el.textContent : '';
  });
  ok('detail modal par [data-dt-stamp] line nazar aati hai', /Created:/.test(stamp), stamp.slice(0, 60));

  section('G \u25B8 page health');
  ok('koi page error nahi', jsErrors.length === 0, jsErrors[0] || '');

  await browser.close();
  console.log('\n\x1b[1mSUMMARY:\x1b[0m ' + pass + ' pass \u00b7 ' + fail + ' fail \u00b7 ' + (fail === 0 ? '\x1b[32mGREEN\x1b[0m' : '\x1b[31mRED\x1b[0m'));
  if (failures.length) { console.log('Failures:'); failures.forEach(f => console.log('  - ' + f)); }
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
