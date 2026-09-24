/**
 * tools/test_e2e_critical.js — v2.30.2 (N12) FINAL end-to-end critical flows
 * ============================================================================
 * Aap ke exact checklist par ek TASALSUL wala safar (isolated feature tests nahi —
 * poora journey ek hi database/session par, bilkul waise jaise dukan me hota hai):
 *
 *   PART 1 — backend journey (fresh DB → … → shop close → offline sync):
 *     ① fresh setup + seed (users/locations/items/settings)
 *     ② login → session shape (role/permissions/locations)
 *     ③ open shop (opening cash) → session OPEN
 *     ④ customer banao → code + list
 *     ⑤ products/items + GRN → stock + avg cost
 *     ⑥ POS sale (discount + tax + cash) → exact totals + points EARN
 *     ⑦ customer points REDEEM (LOYALTY payment) → balance + no double receipt
 *     ⑧ udhaar sale PARTIAL → ledger debit=total; payment se balance kam
 *     ⑨ reports (dashboard + sales + day report expected cash)
 *     ⑩ close shop (counted vs expected → variance 0) + band hone ke baad sale
 *        block (structured error — retry/error handling)
 *     ⑪ settings save → persisted (Save path)
 *     ⑫ offline/online sync: queued op → replay duplicate-guard → failed op
 *        structured error
 *
 *   PART 2 — DOM journey (rendered app, 1440×900):
 *     ⑬ login → dashboard KPIs
 *     ⑭ har critical screen render (pos/sales/inventory/purchases/parties/
 *        accounting/masters/reports/settings)
 *     ⑮ POS cart → totals; settings change → Save All button → save → backend
 *     ⑯ zero page errors
 *
 *   export LD_LIBRARY_PATH=… ; node tools/test_e2e_critical.js [http://127.0.0.1:8021/]
 */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { loadBackend } = require('./mock_gs');
let pass = 0, fail = 0; const ERR = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✔', name); }
  else { fail++; const m = '  ✖ ' + name + (extra ? '  → ' + extra : ''); ERR.push(name); console.log(m); }
}
const near = (a, b, eps) => Math.abs(Number(a) - Number(b)) <= (eps || 0.011);

console.log('\x1b[1mPART 1 — backend journey (fresh DB → close shop → sync)\x1b[0m');
let LOC1, TOKEN;
try {
  const { sandbox: s } = loadBackend(path.join(ROOT, 'apps-script'));

  /* ① fresh setup + seed */
  s.Setup.setupAll();
  const seeded = s.DB.all('Users').length >= 1
    && s.DB.all('Locations').length >= 2
    && Object.keys(s.DB.settings() || {}).length > 10
    && s.DB.all('Items').length >= 3;
  ok(seeded, '① fresh setup: users/locations/settings/items sab seed ho gaye',
    JSON.stringify({ u: s.DB.all('Users').length, l: s.DB.all('Locations').length, i: s.DB.all('Items').length }));

  /* ② login → session shape */
  const login = s.api('auth.login', { username: 'owner', password: 'admin123' });
  TOKEN = login.data.token;
  const ses = login.data.session || {};
  ok(login.ok && ses.role && (ses.permissions || ses.groupName) && (ses.locations || ses.locationIds),
    '② login: session me role + permissions + locations',
    JSON.stringify({ role: ses.role, grp: ses.groupName, locs: (ses.locations || ses.locationIds || []).length }));
  const api = (a, p) => {
    const r = s.api(a, Object.assign({ token: TOKEN }, p || {}));
    if (!r || !r.ok) throw new Error(a + ': ' + ((r && r.error && r.error.message) || 'fail'));
    return r.data;
  };
  const tryApi = (a, p) => s.api(a, Object.assign({ token: TOKEN }, p || {}));
  /* dukan ki maalik-muqarrar loyalty rules (jaise Settings me set hoti hain) */
  api('config.save', { values: { 'loyalty.perAmount': '100', 'loyalty.points': '1',
    'loyalty.rate': '1', 'loyalty.minRedeem': '0' } });

  /* ③ open shop */
  LOC1 = s.DB.all('Locations')[0].id;
  const open = api('shop.open', { locationId: LOC1, openingCash: 5000 });
  ok(open.status && open.status.open === true && (open.status.session || {}).status === 'OPEN'
    && open.session && near(open.session.openingCash, 5000),
    '③ shop open: status OPEN, opening cash 5000',
    JSON.stringify({ open: open.status && open.status.open, ses: open.session }));

  /* ④ customer */
  const CUST = api('customers.save', { customer: { name: 'E2E Customer', phone: '0300-2220001', creditLimit: 2000 } });
  const clist = api('customers.list', {});
  const crows = clist.rows || clist.data || clist.list || (Array.isArray(clist) ? clist : []);
  const inList = crows.filter(c => c.id === CUST.id).length === 1;
  ok(!!CUST.id && !!CUST.code && inList, '④ customer save → code mila + list me wapas',
    JSON.stringify({ id: CUST.id, code: CUST.code, listed: inList }));

  /* ⑤ items + GRN */
  const A = api('items.save', { item: { name: 'E2E-A Pad', costPrice: 400, retailPrice: 500, taxRate: 17 } });
  const B = api('items.save', { item: { name: 'E2E-B Bulb', costPrice: 200, retailPrice: 300 } });
  const C = api('items.save', { item: { name: 'E2E-C Polish', costPrice: 100, retailPrice: 250 } });
  const SUP = s.DB.all('Suppliers')[0];
  api('purchase.grn.save', { grn: { supplierId: SUP.id, locationId: LOC1, invoiceNo: 'E2E-GRN-1',
    items: [ { itemId: A.id, qty: 10, cost: 400 }, { itemId: B.id, qty: 10, cost: 200 }, { itemId: C.id, qty: 20, cost: 100 } ] } });
  const stA = s.DB.all('Stock').filter(x => x.itemId === A.id)[0] || {};
  ok(near(stA.qty, 10) && near(stA.avgCost, 400) && near((s.DB.all('Stock').filter(x => x.itemId === C.id)[0] || {}).qty, 20),
    '⑤ GRN: stock aya (A 10@400, C 20@100)', JSON.stringify({ a: stA.qty, avg: stA.avgCost }));

  /* ⑥ POS sale: discount + tax + cash */
  const sale1 = api('sales.create', { sale: { customerId: CUST.id,
    items: [ { itemId: A.id, qty: 2, price: 500 }, { itemId: B.id, qty: 1, price: 300, discount: 30 } ],
    discount: 127, payments: [ { method: 'CASH', amount: 1300 } ] } });
  ok(near(sale1.subtotal, 1270) && near(sale1.total, 1296) && near(sale1.change, 4) && sale1.status === 'PAID',
    '⑥ POS sale: subtotal 1270, total 1296, change 4, PAID',
    JSON.stringify({ st: sale1.subtotal, tot: sale1.total, ch: sale1.change, st8: sale1.status }));
  const bal1 = api('loyalty.balance', { customerId: CUST.id }).balance;
  ok(near(bal1, 12), '⑥b points EARN floor(1296/100) = 12', 'bal=' + bal1);
  const rcp1 = s.DB.all('Payments').filter(x => x.reference === sale1.invoiceNo && x.type === 'SALE_RECEIPT')[0] || {};
  ok(near(rcp1.amount, 1296),
    '⑥c overpaid tender (1300): receipt APPLIED 1296 par (change 4 drawer/ledger me nahi ghusta)',
    'rcp=' + rcp1.amount);

  /* ⑦ points redeem */
  const sale2 = api('sales.create', { sale: { customerId: CUST.id,
    items: [ { itemId: B.id, qty: 1, price: 300 } ],
    payments: [ { method: 'LOYALTY', amount: 5, points: 5 }, { method: 'CASH', amount: 295 } ] } });
  const bal2 = api('loyalty.balance', { customerId: CUST.id }).balance;
  const dupReceipt = s.DB.all('Payments').filter(x => x.reference === sale2.invoiceNo && x.method === 'LOYALTY').length;
  ok(near(bal2, 10) && dupReceipt === 0 && near(sale2.total, 300),
    '⑦ redeem 5 → balance 10; LOYALTY ka double receipt NAHI',
    JSON.stringify({ bal: bal2, dup: dupReceipt, tot: sale2.total }));

  /* ⑧ udhaar + payment */
  const sale3 = api('sales.create', { sale: { customerId: CUST.id,
    items: [ { itemId: C.id, qty: 1, price: 250 } ], payments: [ { method: 'CASH', amount: 100 } ] } });
  const ledDebit = s.DB.all('Ledger').filter(x => x.partyType === 'CUSTOMER' && x.partyId === CUST.id
    && (x.refId === sale3.id || String(x.description || '').indexOf(sale3.invoiceNo) > -1)
    && near(Number(x.debit), 250)).length;
  ok(sale3.status === 'PARTIAL' && near(sale3.due, 150) && ledDebit >= 1,
    '⑧a udhaar sale: PARTIAL, due 150, ledger debit poora 250',
    JSON.stringify({ st8: sale3.status, due: sale3.due, debit: ledDebit }));
  api('payments.create', { payment: { type: 'CUSTOMER_PAYMENT', partyType: 'CUSTOMER', partyId: CUST.id,
    amount: 150, method: 'CASH' } });
  const bal3 = api('parties.balance', { partyType: 'CUSTOMER', id: CUST.id });
  ok(near(bal3.balance, 0) && near(bal3.outstanding, 0),
    '⑧b customer payment 150 → balance 0 (hisab barabar)',
    JSON.stringify({ bal: bal3.balance, out: bal3.outstanding }));

  /* ⑨ reports */
  const dash = api('reports.dashboard', {});
  const rs = api('reports.sales', {});
  ok(near(dash.kpis.todaySales, 1296 + 300 + 250) && near(rs.summary.total, 1296 + 300 + 250)
    && rs.summary.count >= 3,
    '⑨ reports: dashboard todaySales + sales summary = 1846 (3 bills)',
    JSON.stringify({ today: dash.kpis.todaySales, sum: rs.summary.total, n: rs.summary.count }));
  const dr = api('shop.dayReport', {});
  ok(near(dr.expectedCash, 5000 + Number((dr.totals || {}).netCash || 0)) && Number(dr.expectedCash) > 5000,
    '⑨b day report: expected = opening + netCash (activity ke sath)',
    JSON.stringify({ exp: dr.expectedCash, net: (dr.totals || {}).netCash }));

  /* ⑩ close shop + blocked sale */
  const counted = Number(dr.expectedCash);
  const closed = api('shop.close', { locationId: LOC1, closingCash: counted });
  const cs = closed.session || {};
  ok(cs.status === 'CLOSED' && near(cs.variance, 0) && near(cs.expectedCash, counted),
    '⑩ close shop: counted = expected → variance 0, CLOSED', JSON.stringify(cs));
  const blocked = tryApi('sales.create', { sale: { walkIn: true,
    items: [ { itemId: B.id, qty: 1, price: 300 } ], payments: [ { method: 'CASH', amount: 300 } ] } });
  ok(!blocked.ok && /band|CLOSED|kholain/i.test(String((blocked.error || {}).message || '')),
    '⑩b band dukan par sale → structured error (koi silent loss nahi)',
    String((blocked.error || {}).message || '').slice(0, 60));

  /* ⑪ settings save → persisted */
  api('config.save', { values: { taxRate: '18', 'pos.receiptFooter': 'E2E shukriya' } });
  const st8 = s.DB.settings();
  ok(String(st8.taxRate) === '18' && st8['pos.receiptFooter'] === 'E2E shukriya',
    '⑪ settings save → dono values persisted', JSON.stringify({ tax: st8.taxRate, foot: st8['pos.receiptFooter'] }));

  /* ⑫ offline/online sync */
  const sync1 = api('offline.sync', { queue: [
    { clientId: 'E2E-C1', action: 'config.save', payload: { values: { 'pos.receiptFooter': 'E2E offline' } } }
  ] });
  const footerAfter = s.DB.settings()['pos.receiptFooter'];
  const sync2 = api('offline.sync', { queue: [
    { clientId: 'E2E-C1', action: 'config.save', payload: { values: { 'pos.receiptFooter': 'DUBARA nahi' } } }
  ] });
  const dup2 = (sync2.results || [])[0] || {};
  const sync3 = api('offline.sync', { queue: [ { clientId: 'E2E-C2', action: 'bogus.kuch', payload: {} } ] });
  ok(sync1.succeeded === 1 && footerAfter === 'E2E offline' && dup2.duplicate === true
    && s.DB.settings()['pos.receiptFooter'] === 'E2E offline' && sync3.failed === 1,
    '⑫ offline sync: op apply → replay DUPLICATE (idempotent) → nakaam op structured fail',
    JSON.stringify({ ok1: sync1.succeeded, foot: footerAfter, dup: dup2.duplicate, failed3: sync3.failed }));
} catch (e) {
  ok(false, 'PART 1 journey fail', String(e.message || e).slice(0, 160));
}

(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  console.log('\x1b[1mPART 2 — DOM journey (rendered app)\x1b[0m');
  const puppeteer = require('puppeteer');
  const TARGET = process.argv[2] || ('http://127.0.0.1:8021/');
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e.message).slice(0, 130)));
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(TARGET, { waitUntil: 'networkidle2', timeout: 45000 });
  if (await page.$('#lgUser')) {
    await page.click('#lgUser'); await page.type('#lgUser', 'owner');
    await page.click('#lgPass'); await page.type('#lgPass', 'admin123');
    await page.keyboard.press('Enter');
  }
  await page.waitForFunction(() => window.App && App.state && App.state.session, { timeout: 20000 });
  await sleep(1500);

  /* ⑬ dashboard */
  const dash = await page.evaluate(() => ({
    kpis: document.querySelectorAll('#view .kpi, #view [class*=kpi]').length,
    text: (document.getElementById('view') || {}).textContent ? document.getElementById('view').textContent.length : 0
  }));
  ok(dash.kpis >= 3 && dash.text > 200, '⑬ dashboard KPIs render', JSON.stringify(dash).slice(0, 90));

  /* ⑭ critical screens journey */
  const SCREENS = [
    ['pos', '.tot2, .pcard, [class*=pos]'],
    ['sales', 'input, table, .list-item'],
    ['inventory', '.tab, table, .list-item, button'],
    ['purchases', 'button, table, .list-item'],
    ['parties', 'input, table, .list-item'],
    ['accounting', '.tab, table, button'],
    ['items', 'table, .list-item, button'],
    ['reports', '.card, table, canvas, .kpi'],
    ['settings', '.tab, input, button']
  ];
  let badScreens = [];
  for (const [id, sel] of SCREENS) {
    const r = await page.evaluate(async (id, sel) => {
      try {
        App._noDirtyGuard = true;
        App.go(id);
        await new Promise(r2 => setTimeout(r2, 900));
        App._noDirtyGuard = false;
        const v = document.getElementById('view');
        return { n: v ? v.querySelectorAll(sel).length : 0, len: v ? (v.textContent || '').length : 0 };
      } catch (e) { return { err: String(e.message || e).slice(0, 60) }; }
    }, id, sel);
    if (r.err || r.n === 0 || r.len < 80) badScreens.push(id + '(' + (r.err || r.n + '/' + r.len) + ')');
  }
  ok(badScreens.length === 0, '⑭ 9 critical screens sab render (content mojood)', badScreens.join(' | ') || 'sab theek');

  /* ⑮ POS cart + Save All */
  const pos = await page.evaluate(async () => {
    App._noDirtyGuard = true; App.go('pos'); await new Promise(r => setTimeout(r, 1200)); App._noDirtyGuard = false;
    const cat = await API.call('offline.pull', {});
    const hit = ((cat || {}).items || []).filter(x => Number(x.rp) > 0)[0];
    if (!hit) return { err: 'catalog khaali' };
    window.POS2.addToCart({ id: hit.id, code: hit.code, name: hit.name, retailPrice: hit.rp,
      wholesalePrice: hit.wp, costPrice: hit.cp, stock: hit.qty }, 1);
    await new Promise(r => setTimeout(r, 400));
    const num = v => Number(String(v).replace(/[^\d.\-]/g, '')) || 0;
    return { total: num((document.querySelector('.tot2.big span:last-child') || {}).textContent) };
  });
  ok(!pos.err && pos.total > 0, '⑮ POS cart → total DOM par', JSON.stringify(pos));

  const sa = await page.evaluate(async () => {
    try {
      App._noDirtyGuard = true; App.go('settings');
      await new Promise(r => setTimeout(r, 1200));
      const t1 = Array.from(document.querySelectorAll('.tabbar-l1 .tab')).find(x => /module/i.test(x.textContent || ''));
      if (t1) t1.click();
      await new Promise(r => setTimeout(r, 1300));
      const sw = document.getElementById('f_mod.labels');
      if (!sw) return { err: 'switch nahi mila (settings form)' };
      sw.checked = !sw.checked;
      sw.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 500));
      const b = document.getElementById('saveAllBtn');
      if (!b || b.hidden) return { err: 'saveAllBtn zahir nahi hua' };
      b.click();
      await new Promise(r => setTimeout(r, 3000));
      const st = await API.call('system.settings.get', {}, { noCache: true }).catch(() => ({}));
      const b2 = document.getElementById('saveAllBtn');
      return { saved: String(st['mod.labels']), dirty: UI2.dirtyPayload().count, hidden: b2 ? b2.hidden : 'gone' };
    } catch (e) { return { err: String(e.message || e).slice(0, 80) }; }
  });
  ok(!sa.err && sa.saved !== 'undefined' && sa.dirty === 0 && sa.hidden === true,
    '⑮b Save All: change → button → save → dirty clear', JSON.stringify(sa));

  /* ⑯ zero page errors */
  ok(errs.length === 0, '⑯ zero page errors (poora journey)', errs.slice(0, 3).join(' | ') || '0');

  await browser.close();
  console.log('\n\x1b[1mSUMMARY:\x1b[0m ' + pass + ' pass · ' + fail + ' fail · ' + (fail ? '\x1b[31mRED\x1b[0m' : '\x1b[32mGREEN\x1b[0m'));
  if (fail) { console.log(ERR.map(e => ' - ' + e).join('\n')); process.exit(1); }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
