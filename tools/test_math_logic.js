/**
 * tools/test_math_logic.js — v2.30.1 (N11) math/logic audit gate
 * ============================================================================
 * Shart: subtotal/discount/tax/total, payments/change, balances, loyalty points,
 * stock qty/movements, purchase/sales/returns, profit/margin, numbering —
 * authoritative source ek; mismatch fix (mask nahi) + regression test.
 *
 *   PART 1 — backend exact-math (asli .gs sandbox, haath se ginay hue values):
 *     ① proportional discount + mixed tax rates + change/due (exact paisa)
 *     ② tax-inclusive total (price ke andar tax)
 *     ③ discount clamp (bill discount subtotal se zyada nahi)
 *     ④ credit limit: closing balance rule + block message me poora hisab
 *     ⑤ loyalty round-trip: earn (rounding DOWN) → redeem (LOYALTY payment,
 *        double-ledger NAHI) → balance
 *     ⑥ AVG costing: GRN → sale → GRN → sale (avg + COGS exact)
 *     ⑦ return: total/restock-cost/refund + STOCK (explicit price honored)
 *     ⑦b N11 FIX: discounted bill return → refund = NET unit (gross nahi)
 *     ⑧ N11 FIX: reports/dashboard profit RETURNS NET — test khud raw tables
 *        (SaleItems/SaleReturnItems) se azzi-bar recompute karta hai
 *     ⑨ numbering: per-location series, sequence +1, branches independent
 *     ⑩ day report expected cash = opening + netCash
 *
 *   PART 2 — FE↔BE parity (rendered DOM):
 *     ⑪ POS cart ka total (UI) == backend sale ka total (same basket, same settings)
 *     ⑫ zero page errors
 *
 *   export LD_LIBRARY_PATH=… ; node tools/test_math_logic.js [http://127.0.0.1:8021/]
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

console.log('\x1b[1mPART 1 — backend math (exact)\x1b[0m');
const saleIds = {};
let ITEM_A, ITEM_B, ITEM_C, LOC1, LOC2, CUST, CUST2;
try {
  const { sandbox: s } = loadBackend(path.join(ROOT, 'apps-script'));
  s.Setup.setupAll();
  const login = s.api('auth.login', { username: 'owner', password: 'admin123' });
  const TOKEN = login.data.token;
  const api = (a, p) => {
    const r = s.api(a, Object.assign({ token: TOKEN }, p || {}));
    if (!r || !r.ok) throw new Error(a + ': ' + ((r && r.error && r.error.message) || 'fail'));
    return r.data;
  };
  const tryApi = (a, p) => s.api(a, Object.assign({ token: TOKEN }, p || {}));
  api('shop.open', {});
  LOC1 = s.DB.all('Locations')[0].id;
  LOC2 = s.DB.all('Locations')[1].id;
  api('config.save', { values: { taxRate: '17', taxInclusive: 'false', maxDiscountPct: '30',
    'loyalty.perAmount': '100', 'loyalty.points': '1', 'loyalty.rate': '1', 'loyalty.minRedeem': '0' } });

  /* items (stock 0 — GRN se aayega) */
  ITEM_A = api('items.save', { item: { name: 'N11-A Brake Pad', unit: 'PCS', costPrice: 400, retailPrice: 500, taxRate: 17 } });
  ITEM_B = api('items.save', { item: { name: 'N11-B Bulb', unit: 'PCS', costPrice: 200, retailPrice: 300, taxRate: 0 } });
  ITEM_C = api('items.save', { item: { name: 'N11-C Polish', unit: 'PCS', costPrice: 100, retailPrice: 250, taxRate: 0 } });
  const SUP = s.DB.all('Suppliers')[0];

  /* stock in: A 10@400, B 10@200, C 10@100 */
  api('purchase.grn.save', { grn: { supplierId: SUP.id, locationId: LOC1, invoiceNo: 'N11-GRN-1',
    items: [ { itemId: ITEM_A.id, qty: 10, cost: 400 }, { itemId: ITEM_B.id, qty: 10, cost: 200 }, { itemId: ITEM_C.id, qty: 10, cost: 100 } ] } });

  /* ---------- ① exact math ---------- */
  const r1 = api('sales.create', { sale: { walkIn: true,
    items: [ { itemId: ITEM_A.id, qty: 2, price: 500 }, { itemId: ITEM_B.id, qty: 1, price: 300, discount: 30 } ],
    discount: 127, payments: [ { method: 'CASH', amount: 1300 } ] } });
  saleIds.s1 = r1.id;
  const li1 = s.DB.all('SaleItems').filter(x => x.saleId === r1.id);
  const A1 = li1.filter(x => x.itemId === ITEM_A.id)[0], B1 = li1.filter(x => x.itemId === ITEM_B.id)[0];
  ok(near(r1.subtotal, 1270) && near(r1.tax, 153) && near(r1.total, 1296) && near(r1.change, 4) && near(r1.due, 0) && r1.status === 'PAID',
    '① subtotal/tax/total/change exact (1270 / 153 / 1296 / 4 / PAID)',
    JSON.stringify({ st: r1.subtotal, tax: r1.tax, tot: r1.total, ch: r1.change, due: r1.due, st8: r1.status }));
  ok(near(A1.tax, 153) && near(A1.discount, 100) && near(A1.lineTotal, 1053) && near(B1.tax, 0) && near(B1.discount, 57) && near(B1.lineTotal, 243)
    && near(li1.reduce((t, x) => t + Number(x.lineTotal), 0), 1296),
    '①b line-wise allocation exact (A: tax153 disc100 tot1053 · B: tax0 disc57 tot243 · sum=total)',
    JSON.stringify({ a: [A1.tax, A1.discount, A1.lineTotal], b: [B1.tax, B1.discount, B1.lineTotal] }));

  /* ---------- ② tax-inclusive ---------- */
  const r2 = api('sales.create', { sale: { walkIn: true, taxInclusive: 'true',
    items: [ { itemId: ITEM_A.id, qty: 2, price: 500 }, { itemId: ITEM_B.id, qty: 1, price: 300, discount: 30 } ],
    payments: [ { method: 'CASH', amount: 1270 } ] } });
  saleIds.s2 = r2.id;
  ok(near(r2.total, 1270) && near(r2.tax, 145.30),
    '② tax-inclusive: total 1270 ke andar tax 145.30 (1000 − 1000/1.17)',
    JSON.stringify({ tot: r2.total, tax: r2.tax }));

  /* ---------- ③ discount clamp ---------- */
  const r3 = api('sales.create', { sale: { walkIn: true,
    items: [ { itemId: ITEM_B.id, qty: 1, price: 300 } ], discount: 5000,
    payments: [ { method: 'CASH', amount: 0.01 } ] } });
  saleIds.s3 = r3.id;
  ok(near(r3.discount, 300) && near(r3.total, 0),
    '③ bill discount subtotal par CLAMP (5000 maanga → 300 laga, total 0)',
    JSON.stringify({ disc: r3.discount, tot: r3.total }));

  /* ---------- ④ credit limit ---------- */
  CUST = api('customers.save', { customer: { name: 'N11 Limit Customer', phone: '0300-7770011', creditLimit: 500 } });
  const e4 = tryApi('sales.create', { sale: { customerId: CUST.id,
    items: [ { itemId: ITEM_A.id, qty: 2, price: 500 } ], payments: [ { method: 'CASH', amount: 400 } ] } });
  const blocked = !e4.ok && /Sale blocked/.test(String(e4.error && e4.error.message)) && /previous/i.test(String(e4.error && e4.error.message));
  const ok4 = tryApi('sales.create', { sale: { customerId: CUST.id,
    items: [ { itemId: ITEM_A.id, qty: 1, price: 500 } ], payments: [ { method: 'CASH', amount: 100 } ] } });
  saleIds.s4 = ok4.ok ? ok4.data.id : '';
  ok(blocked && ok4.ok,
    '④ credit limit: 600 udhaar → "Sale blocked (previous+due vs limit)"; 400 udhaar → chal gaya',
    JSON.stringify({ blocked: !e4.ok, msg: String((e4.error || {}).message || '').slice(0, 70), ok2: ok4.ok }));

  /* ---------- ⑤ loyalty round-trip ---------- */
  CUST2 = api('customers.save', { customer: { name: 'N11 Loyal Customer', phone: '0300-7770012' } });
  const r5a = api('sales.create', { sale: { customerId: CUST2.id,
    items: [ { itemId: ITEM_A.id, qty: 2, price: 500 }, { itemId: ITEM_B.id, qty: 1, price: 300, discount: 30 } ],
    discount: 127, payments: [ { method: 'CASH', amount: 1296 } ] } });
  saleIds.s5a = r5a.id;
  const bal1 = api('loyalty.balance', { customerId: CUST2.id }).balance;   /* floor(1296/100)=12 */
  const r5b = api('sales.create', { sale: { customerId: CUST2.id,
    items: [ { itemId: ITEM_B.id, qty: 1, price: 300 } ],
    payments: [ { method: 'LOYALTY', amount: 5, points: 5 }, { method: 'CASH', amount: 295 } ] } });
  saleIds.s5b = r5b.id;
  const bal2 = api('loyalty.balance', { customerId: CUST2.id }).balance;   /* 12 − 5 + earn(300→3) = 10 */
  const ledgerRows = s.DB.all('LoyaltyLedger').filter(x => x.customerId === CUST2.id);
  const payRows5 = s.DB.all('Payments').filter(x => x.reference === r5b.invoiceNo);
  ok(near(bal1, 12) && near(bal2, 10),
    '⑤ loyalty: earn floor(1296/100)=12 → redeem 5 + earn(300)=3 → balance 10', JSON.stringify({ b1: bal1, b2: bal2 }));
  ok(ledgerRows.filter(x => x.type === 'EARN').length === 2 && ledgerRows.filter(x => x.type === 'REDEEM' && Math.abs(Number(x.points)) === 5).length === 1
    && payRows5.filter(x => x.method === 'LOYALTY').length === 0,
    '⑤b LoyaltyLedger: 2 EARN (12+3) + 1 REDEEM(5); LOYALTY payment ka DOUBLE ledger NAHI',
    JSON.stringify({ earn: ledgerRows.filter(x => x.type === 'EARN').length, red: ledgerRows.filter(x => x.type === 'REDEEM').length, pays: payRows5.length }));

  /* ---------- ⑥ AVG costing ---------- */
  api('purchase.grn.save', { grn: { supplierId: SUP.id, locationId: LOC1, invoiceNo: 'N11-GRN-2',
    items: [ { itemId: ITEM_C.id, qty: 10, cost: 200 } ] } });
  const r6a = api('sales.create', { sale: { walkIn: true, items: [ { itemId: ITEM_C.id, qty: 4, price: 250 } ], payments: [ { method: 'CASH', amount: 1000 } ] } });
  saleIds.s6a = r6a.id;
  const r6b = api('sales.create', { sale: { walkIn: true, items: [ { itemId: ITEM_C.id, qty: 2, price: 250 } ], payments: [ { method: 'CASH', amount: 500 } ] } });
  saleIds.s6b = r6b.id;
  const stockC = s.DB.all('Stock').filter(x => x.itemId === ITEM_C.id && x.locationId === LOC1)[0] || {};
  const c6b = s.DB.all('SaleItems').filter(x => x.saleId === r6b.id)[0] || {};
  /* avg after GRN-2: (10×100 + 10×200)/20 = 150.00 ; COGS 2×150 = 300 */
  ok(near(stockC.qty, 14) && near(stockC.avgCost, 150.00) && near(c6b.cost, 150.00),
    '⑥ AVG costing: (10×100+10×200)/20 = 150.00 avg; COGS 2×150 = 300',
    JSON.stringify({ qty: stockC.qty, avg: stockC.avgCost, cost: c6b.cost }));

  /* ---------- ⑦ return (explicit price honored) ---------- */
  const r7 = api('sales.return', { return_: { saleId: r6b.id,
    items: [ { itemId: ITEM_C.id, qty: 2, price: 250 } ], refundMethod: 'CASH', reason: 'N11 gate return' } });
  const stockC2 = s.DB.all('Stock').filter(x => x.itemId === ITEM_C.id && x.locationId === LOC1)[0] || {};
  const retPay = s.DB.all('Payments').filter(x => x.type === 'REFUND_OUT' && near(Number(x.amount), 500)).length;
  ok(near(r7.total, 500) && near(stockC2.qty, 16) && near(stockC2.avgCost, 150.00) && retPay >= 1,
    '⑦ return: total 500, stock 14→16 (wahi 150.00 cost par wapas), REFUND_OUT 500',
    JSON.stringify({ tot: r7.total, qty: stockC2.qty, avg: stockC2.avgCost, refund: retPay }));

  /* ---------- ⑦b discounted bill → refund NET unit (N11 FIX) ---------- */
  const r7s = api('sales.create', { sale: { walkIn: true,
    items: [ { itemId: ITEM_A.id, qty: 2, price: 500, discount: 100 } ], discount: 100,
    payments: [ { method: 'CASH', amount: 1170 } ] } });
  saleIds.s7s = r7s.id;
  /* SI.discount = 100(line) + 100(header share) = 200 → net unit = (1000−200)/2 = 400 */
  const r7b = api('sales.return', { return_: { saleId: r7s.id,
    items: [ { itemId: ITEM_A.id, qty: 1 } ], refundMethod: 'CASH', reason: 'N11 net refund' } });
  const sri7 = s.DB.all('SaleReturnItems').filter(x => x.returnId === r7b.id)[0] || {};
  ok(near(r7b.total, 400) && near(sri7.price, 400) && near(sri7.lineTotal, 400),
    '⑦b discounted bill return (bina price): refund = NET unit 400 (pehle 500 hota — over-refund)',
    JSON.stringify({ tot: r7b.total, price: sri7.price }));
  const r7c = api('sales.return', { return_: { saleId: r7s.id,
    items: [ { itemId: ITEM_A.id, qty: 1, price: 350 } ], refundMethod: 'CASH', reason: 'N11 manual' } });
  ok(near(r7c.total, 350),
    '⑦c explicit price ab bhi honored (manual adjust feature qayam)', 'tot=' + r7c.total);

  /* ---------- ⑧ reports/dashboard profit RETURNS NET (N11 FIX) ---------- */
  /* azzi-bar recompute raw tables se — reports ka apna code use NAHI hota */
  const SIs = s.DB.all('SaleItems');
  const lineProfit = {};
  SIs.forEach(x => {
    if (x.saleId in lineProfit) lineProfit[x.saleId] += (Number(x.price) * Number(x.qty)) - Number(x.discount || 0) - (Number(x.cost) * Number(x.qty));
    else lineProfit[x.saleId] = (Number(x.price) * Number(x.qty)) - Number(x.discount || 0) - (Number(x.cost) * Number(x.qty));
  });
  let sumLineProfit = 0; Object.keys(lineProfit).forEach(k => { sumLineProfit += lineProfit[k]; });
  let impactSum = 0;
  s.DB.all('SaleReturns').forEach(rt => {
    s.DB.all('SaleReturnItems').filter(ri => ri.returnId === rt.id).forEach(ri => {
      const orig = SIs.filter(x => x.saleId === rt.saleId && x.itemId === ri.itemId)[0] || {};
      const rev = Number(ri.lineTotal);
      const costRev = ri.restock !== 'false' ? Number(orig.cost || 0) * Number(ri.qty) : 0;
      impactSum += rev - costRev;
    });
  });
  const expectedGross = sumLineProfit - impactSum;
  const rp = api('reports.sales', {});
  const dash = api('reports.dashboard', {});
  ok(near(rp.summary.grossProfit, expectedGross, 0.05),
    '⑧ reports.sales grossProfit == raw-tables recompute (returns NET)', JSON.stringify({ got: rp.summary.grossProfit, want: Math.round(expectedGross * 100) / 100 }));
  ok(near(dash.kpis.monthProfit, expectedGross, 0.05),
    '⑧b dashboard monthProfit == wahi recompute', JSON.stringify({ got: dash.kpis.monthProfit, want: Math.round(expectedGross * 100) / 100 }));
  ok(impactSum > 0.01,
    '⑧c scenario mein returns ka asar ZERO nahi (test pre-fix formula ko pakar sakta hai)', 'impact=' + Math.round(impactSum * 100) / 100);

  /* ---------- ⑫ commission: partial return proportional ---------- */
  const SP = s.DB.all('Users')[1] || s.DB.all('Users')[0];
  s.DB.insert('CommissionSlabs', { id: 'SLB-N11', itemId: ITEM_C.id, userId: '', category: '',
    fromAmount: 0, toAmount: 999999999, rate: 10, rateType: 'PCT', active: 'true' });
  const r12 = api('sales.create', { sale: { walkIn: true,
    items: [ { itemId: ITEM_C.id, qty: 4, price: 250, salespersonId: SP.id } ],
    payments: [ { method: 'CASH', amount: 1000 } ] } });
  saleIds.s12 = r12.id;
  let com = s.DB.all('Commissions').filter(x => x.saleId === r12.id && x.itemId === ITEM_C.id)[0] || {};
  ok(near(com.amount, 100) && com.status === 'PENDING',
    '⑫a commission accrue 10% × 1000 = 100 PENDING', JSON.stringify({ a: com.amount, st: com.status }));
  api('sales.return', { return_: { saleId: r12.id,
    items: [ { itemId: ITEM_C.id, qty: 1 } ], refundMethod: 'CASH', reason: 'N11 partial' } });
  com = s.DB.all('Commissions').filter(x => x.saleId === r12.id && x.itemId === ITEM_C.id)[0] || {};
  ok(near(com.amount, 75) && com.status === 'PENDING',
    '⑫b partial return (1/4) → commission 75 PENDING (pehle poori 100 REVERSED hoti)',
    JSON.stringify({ a: com.amount, st: com.status }));
  api('sales.return', { return_: { saleId: r12.id,
    items: [ { itemId: ITEM_C.id, qty: 3 } ], refundMethod: 'CASH', reason: 'N11 full' } });
  com = s.DB.all('Commissions').filter(x => x.saleId === r12.id && x.itemId === ITEM_C.id)[0] || {};
  ok(com.status === 'REVERSED',
    '⑫c poori qty wapas → commission REVERSED (purana behavior full return par qayam)',
    'st=' + com.status);

  /* ---------- ⑨ numbering ---------- */
  const inv1 = s.DB.byId('Sales', saleIds.s1).invoiceNo, inv2 = s.DB.byId('Sales', saleIds.s2).invoiceNo;
  api('shop.open', { locationId: LOC2 });
  api('purchase.grn.save', { grn: { supplierId: SUP.id, locationId: LOC2, invoiceNo: 'N11-GRN-3',
    items: [ { itemId: ITEM_B.id, qty: 5, cost: 200 } ] } });
  const r9 = api('sales.create', { sale: { walkIn: true, locationId: LOC2, items: [ { itemId: ITEM_B.id, qty: 1, price: 300 } ], payments: [ { method: 'CASH', amount: 300 } ] } });
  const seq = (v) => Number(String(v).replace(/\D/g, ''));
  const l2code = String((s.DB.byId('Locations', LOC2) || {}).code || '').toUpperCase();
  ok(seq(inv2) === seq(inv1) + 1 && (!l2code || String(r9.invoiceNo).toUpperCase().indexOf(l2code) > -1),
    '⑨ numbering: series +1 per location; doosri branch ki apni series', JSON.stringify({ inv1, inv2, loc2: r9.invoiceNo }));

  /* ---------- ⑩ day report expected cash ---------- */
  const ss = api('shop.dayReport', {});
  ok(typeof ss.expectedCash === 'number' && near(ss.expectedCash, Number(ss.openingCash || 0) + Number((ss.totals || {}).netCash || 0)),
    '⑩ day report expectedCash = opening + netCash (session math self-consistent)',
    JSON.stringify({ expected: ss.expectedCash, opening: ss.openingCash, net: (ss.totals || {}).netCash }));
} catch (e) {
  ok(false, 'PART 1 setup/scenario fail', String(e.message || e).slice(0, 160));
}

(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  console.log('\x1b[1mPART 2 — FE↔BE parity (POS cart vs backend)\x1b[0m');
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

  /* ⑪ cart total (UI DOM) vs backend total (same basket) */
  const par = await page.evaluate(async () => {
    try {
      await API.call('config.save', { values: { taxRate: '17', taxInclusive: 'false' } });
      App._noDirtyGuard = true; App.go('pos'); await new Promise(r => setTimeout(r, 1400)); App._noDirtyGuard = false;
      const cat = await API.call('offline.pull', {});
      const list = (cat && cat.items) || [];
      const hit = list.filter(x => Number(x.rp) > 0)[0];
      if (!hit) return { err: 'catalog mein saleable item nahi' };
      /* bilkul wahi mapping jo POS scan/grid khud karta hai */
      const it = { id: hit.id, code: hit.code, name: hit.name, retailPrice: hit.rp, wholesalePrice: hit.wp, costPrice: hit.cp, stock: hit.qty };
      window.POS2.addToCart(it, 2);
      await new Promise(r => setTimeout(r, 500));
      const num = v => Number(String(v).replace(/[^\d.\-]/g, '')) || 0;
      const tots = Array.from(document.querySelectorAll('.tot2')).map(x => num((x.querySelector('span:last-child') || {}).textContent));
      const big = num((document.querySelector('.tot2.big span:last-child') || {}).textContent);
      if (!tots.length || !big) return { err: 'POS totals DOM nahi mile', tots: tots.length };
      const uiSub = tots[0], uiTotal = big;
      const r = await API.call('sales.create', { sale: { walkIn: true, items: [ { itemId: it.id, qty: 2, price: Number(it.retailPrice) } ], payments: [ { method: 'CASH', amount: uiTotal } ] } });
      const voided = await API.call('sales.void', { id: r.id, reason: 'N11 parity probe' }).catch(() => null);
      return { uiSub, uiTotal, beSub: r.subtotal, beTotal: r.total, undone: voided ? 1 : 0 };
    } catch (e) { return { err: String(e.message || e).slice(0, 120) }; }
  });
  ok(!par.err && near(par.uiSub, par.beSub) && near(par.uiTotal, par.beTotal),
    '⑪ FE↔BE parity: POS cart DOM ka subtotal/total == backend ka hisaab (probe sale void)',
    JSON.stringify(par));

  ok(errs.length === 0, '⑫ zero page errors', errs.slice(0, 3).join(' | ') || '0');

  await browser.close();
  console.log('\n\x1b[1mSUMMARY:\x1b[0m ' + pass + ' pass · ' + fail + ' fail · ' + (fail ? '\x1b[31mRED\x1b[0m' : '\x1b[32mGREEN\x1b[0m'));
  if (fail) { console.log(ERR.map(e => ' - ' + e).join('\n')); process.exit(1); }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
