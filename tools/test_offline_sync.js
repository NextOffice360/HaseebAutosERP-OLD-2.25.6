/**
 * tools/test_offline_sync.js — v2.30.0 (N9) offline/background sync gate
 * ============================================================================
 * Shart: reliable offline/background sync + status + Settings controls.
 *
 *   PART 1 — backend truth (asli .gs sandbox):
 *     ① queue entry (sales.create) → sale bani (OFFLINE: marker)
 *     ② wahi entry REPLAY → duplicate:true, sale dobara NAHI bani (idempotent)
 *     ③ generic action (config.save) → apply; REPLAY → duplicate, double nahi
 *     ④ unknown action → ok:false + FAILED ledger row
 *     ⑤ mixed queue (1 ok + 1 fail) → results/results count sahi; sirf fail wala
 *        dobara bhejne par wo bhi ban jata hai
 *
 *   PART 2 — rendered DOM (demo):
 *     ⑥ offline override → API.write → queue + header chip count dikhta hai
 *     ⑦ online + flush → queue khaali, chip chhupa, value backend mein
 *     ⑧ partial fail (offline.sync reject) → queue ka KOI entry zaya nahi
 *     ⑨ reload ke baad queue/chip qayam (localStorage persist)
 *     ⑩ sync.autoFlush=OFF → autoSyncTick flush NAHI karta; ON → karta hai
 *     ⑪ zero page errors
 *
 *   export LD_LIBRARY_PATH=… ; node tools/test_offline_sync.js [http://127.0.0.1:8021/]
 */
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const { loadBackend } = require('./mock_gs');
let pass = 0, fail = 0; const ERR = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✔', name); }
  else { fail++; const m = '  ✖ ' + name + (extra ? '  → ' + extra : ''); ERR.push(name); console.log(m); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

console.log('\x1b[1mPART 1 — backend: idempotency + partial fail\x1b[0m');
{
  const { sandbox: s } = loadBackend(path.join(ROOT, 'apps-script'));
  s.Setup.setupAll();
  const login = s.api('auth.login', { username: 'owner', password: 'admin123' });
  const TOKEN = login.data.token;
  const S = login.data.session;
  const api = (a, p) => {
    const r = s.api(a, Object.assign({ token: TOKEN }, p || {}));
    if (!r || !r.ok) throw new Error(a + ': ' + ((r && r.error && r.error.message) || 'fail'));
    return r.data;
  };
  const items = s.DB.all('Items').filter(r => String(r.status) !== 'DELETED');
  const iid = items[0].id;

  /* dukaan kholo — sales ka asli business rule (band shop par sale rukti hai) */
  api('shop.open', {});

  /* ①② sale entry + replay */
  const entry = { clientId: 'OFF-N9-1', action: 'sales.create', createdAt: new Date().toISOString(),
    payload: { sale: { customerName: 'N9 gate customer', walkIn: true, items: [{ itemId: iid, qty: 1, rate: 100 }], paid: 100, method: 'CASH' } } };
  const r1 = api('offline.sync', { queue: [entry] });
  const salesCount1 = s.DB.all('Sales').filter(x => String(x.notes || '').indexOf('OFF-N9-1') > -1).length;
  ok(r1.succeeded === 1 && salesCount1 === 1, '① queue entry chali → sale bani (OFFLINE marker)', JSON.stringify({ ok: r1.succeeded, n: salesCount1 }));
  const r2 = api('offline.sync', { queue: [entry] });
  const salesCount2 = s.DB.all('Sales').filter(x => String(x.notes || '').indexOf('OFF-N9-1') > -1).length;
  ok(r2.results[0].duplicate === true && salesCount2 === 1,
    '② REPLAY → duplicate:true, sale DOUBLE NAHI hui', JSON.stringify({ dup: r2.results[0].duplicate, n: salesCount2 }));

  /* ③ generic action + replay */
  api('config.save', { values: { 'alert.receivables': 30 } });
  const g1 = { clientId: 'OFF-N9-2', action: 'config.save', createdAt: new Date().toISOString(),
    payload: { values: { 'alert.receivables': 45 } } };
  const g2 = { clientId: 'OFF-N9-3', action: 'config.save', createdAt: new Date().toISOString(),
    payload: { values: { 'alert.receivables': 60 } } };
  api('offline.sync', { queue: [g1] });
  api('offline.sync', { queue: [g2] });                    /* 45 ko 60 se replace karta hai */
  api('offline.sync', { queue: [g2] });                    /* REPLAY — agar dedupe nahi to g1 wala 45 ho jata */
  const st = s.DB.all('Settings').filter(r => r.key === 'alert.receivables')[0] || {};
  const ledgerDone = s.DB.all('OfflineQueue').filter(r => r.clientId === 'OFF-N9-2' && r.status === 'DONE').length;
  ok(String(st.value) === '60' && ledgerDone === 1,
    '③ generic action replay-safe (value 60 hi, ledger 1 row)', JSON.stringify({ v: st.value, ledger: ledgerDone }));

  /* ④ unknown action */
  const r4 = api('offline.sync', { queue: [{ clientId: 'OFF-N9-4', action: 'kuch.nahi', payload: {} }] });
  const failedRow = s.DB.all('OfflineQueue').filter(r => r.clientId === 'OFF-N9-4' && r.status === 'FAILED').length;
  ok(r4.failed === 1 && failedRow === 1, '④ unknown action → failed + FAILED ledger row', JSON.stringify({ f: r4.failed, row: failedRow }));

  /* ⑤ mixed queue + sirf-fail retry */
  const mix = [
    { clientId: 'OFF-N9-5', action: 'sales.create', createdAt: new Date().toISOString(),
      payload: { sale: { customerName: 'N9 mix ok', walkIn: true, items: [{ itemId: iid, qty: 1, rate: 50 }], paid: 50, method: 'CASH' } } },
    { clientId: 'OFF-N9-6', action: 'sales.create', createdAt: new Date().toISOString(),
      payload: { sale: { customerName: '', walkIn: true, items: [], paid: -5, method: 'CASH' } } }
  ];
  const r5 = api('offline.sync', { queue: mix });
  const okIds = (r5.results || []).filter(x => x.ok).map(x => x.clientId);
  const failIds = (r5.results || []).filter(x => !x.ok).map(x => x.clientId);
  const retry = api('offline.sync', { queue: mix.filter(e => failIds.indexOf(e.clientId) > -1).map(e => Object.assign({}, e, { clientId: 'OFF-N9-6b' })) });
  ok(r5.succeeded + r5.failed === 2 && okIds.length === r5.succeeded && failIds.length === r5.failed && retry.succeeded + retry.failed === 1,
    '⑤ mixed queue: results per-entry sahi; sirf fail wala dobara bheja', JSON.stringify({ ok: okIds.length, fail: failIds.length }));
}

(async () => {
  console.log('\x1b[1mPART 2 — rendered DOM: chip + queue + persist + auto-flush\x1b[0m');
  const puppeteer = require('puppeteer');
  const TARGET = process.argv[2] || ('file://' + path.join(ROOT, 'demo', 'index.html'));
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  /* n9_online flag (localStorage) — reload ke baad bhi offline override qayam rehta hai */
  await page.evaluateOnNewDocument(() => {
    try { Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => (localStorage.getItem('n9_online') !== '0') }); } catch (e) { }
  });
  const errs = []; page.on('pageerror', e => errs.push(String(e.message).slice(0, 130)));
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(TARGET, { waitUntil: 'networkidle2', timeout: 45000 });
  if (await page.$('#lgUser')) {
    await page.click('#lgUser'); await page.type('#lgUser', 'owner');
    await page.click('#lgPass'); await page.type('#lgPass', 'admin123');
    await page.keyboard.press('Enter');
  }
  await page.waitForFunction(() => window.App && App.state && App.state.session, { timeout: 20000 });
  await sleep(2500);                                       /* boot flush khatam ho */

  /* ⑥ offline flag ON (localStorage) → write queue hota hai (direct nahi jata) */
  await page.evaluate(() => {
    localStorage.setItem('n9_online', '0');
    App.state.queue = []; Store.set('queue', []);
    App.state.syncFailed = 0;
    API.updateSyncUI();
  });
  await page.evaluate(() => API.call('config.save', { values: { 'alert.cashVariance': true } }));
  await sleep(400);
  const q1 = await page.evaluate(() => ({
    n: App.state.queue.length, chip: !document.getElementById('syncChip').hidden,
    lbl: (document.getElementById('syncChipN') || {}).textContent,
    saved: (Store.get('queue', []) || []).length
  }));
  ok(q1.n === 1 && q1.chip && q1.lbl === '1' && q1.saved === 1,
    '⑥ offline write → queue + chip count 1 + Store persist', JSON.stringify(q1));

  /* ⑧ partial fail — ONLINE flag par offline.sync reject (be-qarar network jaisa):
     flush koshish karega, nakaam entries wapas aayen — koi entry zaya nahi */
  await page.evaluate(() => {
    localStorage.setItem('n9_online', '1');
    window.__n9orig = API.call;
    API.call = function (action, payload, opts) {
      if (action === 'offline.sync') return Promise.reject(new Error('N9 gate: sync down'));
      return window.__n9orig.apply(this, arguments);
    };
  });
  const q3 = await page.evaluate(async () => { await API.flushQueue(); return { n: App.state.queue.length, fail: App.state.syncFailed }; });
  ok(q3.n === 1 && q3.fail === 1, '⑧ offline.sync fail → queue salamat (kuch zaya nahi)', JSON.stringify(q3));

  /* ⑨ reload (dobara offline flag) → queue/chip qayam, boot flush offline par no-op */
  await page.evaluate(() => { localStorage.setItem('n9_online', '0'); });
  await page.reload({ waitUntil: 'networkidle2' });
  await page.waitForFunction(() => window.App && App.state && App.state.session, { timeout: 20000 });
  await sleep(2300);                                       /* boot ka 1.5s flush guzar jaye (offline = no-op) */
  const q2 = await page.evaluate(() => ({ n: App.state.queue.length, chip: !document.getElementById('syncChip').hidden }));
  ok(q2.n === 1 && q2.chip, '⑨ reload ke baad queue + chip qayam (offline flush no-op)', JSON.stringify(q2));

  /* ⑦ online + flush → saved */
  await page.evaluate(() => { localStorage.setItem('n9_online', '1'); });
  const q4 = await page.evaluate(async () => {
    const n = await API.flushQueue();
    return { n: n, left: App.state.queue.length, chipHidden: document.getElementById('syncChip').hidden };
  });
  const q4val = await page.evaluate(async () => {
    const st = await API.call('system.settings.get', {}, { noCache: true }).catch(() => ({}));
    return String(st['alert.cashVariance']);
  });
  ok(q4.n === 1 && q4.left === 0 && q4.chipHidden && q4val === 'true',
    '⑦ online flush → queue 0, chip chhupa, value backend mein', JSON.stringify(Object.assign(q4, { val: q4val })));

  /* ⑩ auto-flush setting */
  const a1 = await page.evaluate(async () => {
    localStorage.setItem('n9_online', '0');
    await API.call('config.save', { values: { 'alert.dailySummary': true } });
    App.state.settings = App.state.settings || {};
    App.state.settings['sync.autoFlush'] = 'false';
    API.autoSyncTick();
    const afterOff = App.state.queue.length;
    App.state.settings['sync.autoFlush'] = 'true';
    localStorage.setItem('n9_online', '1');
    API.autoSyncTick();
    await new Promise(r => setTimeout(r, 1200));
    return { afterOff: afterOff, afterOn: App.state.queue.length };
  });
  ok(a1.afterOff === 1 && a1.afterOn === 0,
    '⑩ sync.autoFlush OFF → tick nahi chalta; ON → flush', JSON.stringify(a1));

  /* cleanup */
  await page.evaluate(() => { App.state.queue = []; Store.set('queue', []); App.updateSyncUI(); });

  ok(errs.length === 0, '⑪ zero page errors', errs.slice(0, 3).join(' | ') || '0');

  await browser.close();
  console.log('\n\x1b[1mSUMMARY:\x1b[0m ' + pass + ' pass · ' + fail + ' fail · ' + (fail ? '\x1b[31mRED\x1b[0m' : '\x1b[32mGREEN\x1b[0m'));
  if (fail) { console.log(ERR.map(e => ' - ' + e).join('\n')); process.exit(1); }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
