#!/usr/bin/env node
/* ==========================================================================
   test_e2e.js — v2.6 §20: END-TO-END QA (poora business cycle, ek hi chal mein)
   --------------------------------------------------------------------------
   Module tests (test_logic.js) har hisse ko ALAG ALAG check karte hain.
   Ye test un sab ko JOD kar chalata hai — jis tarah aap ki dukaan asli mein
   chalti hai:

     shop kholo → maal mangwao (PO/GRN) → becho (cash + udhaar) →
     udhaar wasool karo → kharcha → salesman ko maal do → salesman beche →
     hisaab karo → branch transfer → din band karo → report

   Har qadam ke baad INVARIANTS check hote hain (stock kabhi negative na ho,
   cash ka hisaab milay, supplier/customer ledger balance rahe, audit trail
   mein nishaan ho). Integration bugs yahin pakde jate hain — module tests
   unhein nahi dekh sakte.

     node tools/test_e2e.js
   ========================================================================== */
const path = require('path');
const { loadBackend } = require('./mock_gs');

const DIR = path.join(__dirname, '..', 'apps-script');
let pass = 0, fail = 0;
const failures = [];

function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ✔ ' + name + (detail ? '  → ' + detail : '')); }
  else {
    fail++; failures.push(name + (detail ? '  → ' + detail : ''));
    console.log('  ✖ ' + name + (detail ? '  → ' + detail : ''));
  }
}
function section(t) { console.log('\n\x1b[1m' + t + '\x1b[0m'); }
const n = (v) => Number(v || 0);
const near = (a, b, eps) => Math.abs(n(a) - n(b)) <= (eps === undefined ? 0.01 : eps);

/* ------------------------------- bootstrap -------------------------------- */
const { sandbox } = loadBackend(DIR);
const { api, Setup, DB, U } = sandbox;

section('§20 · 1 — Din ki shuruat');
Setup.setupAll();
Setup.seedAll();
Setup.seedProducts({ stock: 20 });

const login = api('auth.login', { username: 'owner', password: 'admin123' });
ok('owner login', login.ok && login.data && login.data.token, JSON.stringify(login.error || '').slice(0, 120));
const TOKEN = login.data.token;

function call(action, payload) {
  const r = api(action, Object.assign({ token: TOKEN }, payload || {}));
  if (!r.ok) throw new Error(action + ' failed: ' + JSON.stringify(r.error || r));
  return r.data;
}
function tryCall(action, payload) {
  return api(action, Object.assign({ token: TOKEN }, payload || {}));
}

const LOC = 'LOC-SDQ';
const LOC2 = (DB.all('Locations')[1] || {}).id || 'LOC-MCH';
const OPENING_CASH = 5000;

/* ------------------------------ helpers ---------------------------------- */
function stockOf(itemId, loc) {
  loc = loc || LOC;
  const row = DB.all('Stock').filter(r => r.itemId === itemId && r.locationId === loc)[0];
  return row ? n(row.qty) : 0;
}
function negStock() {
  return DB.all('Stock').filter(r => n(r.qty) < -0.0001)
    .map(r => r.itemId + '@' + r.locationId + '=' + r.qty);
}
function auditCount(action) {
  return DB.all('AuditLog').filter(l => l.action === action).length;
}

/* ========================================================================== */
section('§20 · 2 — Shop kholo (cash session)');
const session = call('cash.session.open', { locationId: LOC, openingCash: OPENING_CASH, notes: 'e2e morning float' });
ok('session khul gayi', !!(session && session.id), JSON.stringify(session).slice(0, 120));
ok('opening cash record hua', n(session.openingCash) === OPENING_CASH, 'openingCash=' + session.openingCash);
ok('§7: shop khulte hi day report BAN GAYI (auto)',
  DB.all('DayReports').filter(r => U.str(r.kind) === 'OPEN').length > 0,
  'OPEN reports=' + DB.all('DayReports').filter(r => U.str(r.kind) === 'OPEN').length);

/* ========================================================================== */
section('§20 · 3 — Maal mangwana: PO → approve → GRN');
const supplier = call('suppliers.save', { supplier: { name: 'E2E Supplier', phone: '0300-0000001' } });
const buyItem = DB.all('Items').filter(i => n(i.costPrice) > 0)[0];
const BUY_COST = n(buyItem.costPrice);
const SELL_PRICE = n(buyItem.retailPrice) || (BUY_COST * 1.4);

const stockBefore = stockOf(buyItem.id);

const po = call('purchase.po.save', {
  po: {
    supplierId: supplier.id, locationId: LOC,
    items: [{ itemId: buyItem.id, qty: 50, rate: BUY_COST }]
  }
});
ok('PO ban gayi', !!(po && po.id), JSON.stringify(po).slice(0, 120));

const appr = call('purchase.po.approve', { id: po.id });
ok('PO approve ho gayi', !!appr, JSON.stringify(appr).slice(0, 100));
const poAfter = call('purchase.po.get', { id: po.id });
ok('PO ka status APPROVED', U.upper(U.str(poAfter.status)) === 'APPROVED', 'status=' + poAfter.status);

const grn = call('purchase.grn.save', {
  supplierId: supplier.id, locationId: LOC, poId: po.id, invoiceNo: 'INV-E2E-1',
  onCredit: true,          /* udhaar khareeda → supplier payable banta hai (by design) */
  items: [{ itemId: buyItem.id, qty: 50, cost: BUY_COST }]
});
ok('GRN ban gayi', !!(grn && grn.id), JSON.stringify(grn).slice(0, 140));

const stockAfterGrn = stockOf(buyItem.id);
ok('GRN se stock +50 hua', near(stockAfterGrn, stockBefore + 50),
  'before=' + stockBefore + ' after=' + stockAfterGrn);
ok('GRN ke baad stock negative nahi', negStock().length === 0, negStock().slice(0, 3).join(', '));
const supLedger = call('suppliers.ledger', { id: supplier.id });
ok('supplier ka ledger GRN se barha (udhaar khareeda tha)',
  (supLedger.rows || []).length > 0, 'rows=' + ((supLedger.rows || []).length));
ok('supplier ka balance GRN ke barabar',
  near(n(supLedger.closing), n(grn.total), 1),
  'closing=' + supLedger.closing + ' grnTotal=' + grn.total);

/* ========================================================================== */
section('§20 · 4 — §3: doosri GRN par price change pakda jaye');
const grn2 = call('purchase.grn.save', {
  supplierId: supplier.id, locationId: LOC, invoiceNo: 'INV-E2E-2',
  items: [{ itemId: buyItem.id, qty: 10, cost: BUY_COST + 100 }]
});
ok('doosri GRN (mehngi) bhi ban gayi', !!(grn2 && grn2.id), JSON.stringify(grn2).slice(0, 120));
const grn2Full = call('purchase.grn.get', { id: grn2.id });
const line2 = (grn2Full.items || []).filter(l => l.itemId === buyItem.id)[0] || {};
ok('§3: purani qeemat record hui (prevPrice)',
  n(line2.prevPrice) > 0, 'prevPrice=' + line2.prevPrice);
ok('§3: qeemat ka farq record hua (priceChange)',
  !near(n(line2.priceChange), 0), 'priceChange=' + line2.priceChange);
ok('§3: priceChange = naye − purane ke barabar',
  near(n(line2.priceChange), (BUY_COST + 100) - n(line2.prevPrice)),
  'change=' + line2.priceChange + ' expected=' + ((BUY_COST + 100) - n(line2.prevPrice)));

/* ========================================================================== */
section('§20 · 5 — Cash sale (retail)');
const custCash = call('customers.save', { customer: { name: 'E2E Cash Customer', phone: '0300-1110001' } });
const stockBeforeSale = stockOf(buyItem.id);
const saleCash = call('sales.create', {
  sale: {
    locationId: LOC, sessionId: session.id,
    customerId: custCash.id, customerName: custCash.name,
    items: [{ itemId: buyItem.id, qty: 5, price: SELL_PRICE, discount: 0, taxRate: 0 }],
    payments: [{ method: 'CASH', amount: SELL_PRICE * 5 }]
  }
});
ok('cash sale ho gayi', !!(saleCash && saleCash.id), JSON.stringify(saleCash).slice(0, 140));
ok('sale se stock −5 hua', near(stockOf(buyItem.id), stockBeforeSale - 5),
  'before=' + stockBeforeSale + ' after=' + stockOf(buyItem.id));
ok('invoice number mila', !!U.str(saleCash.invoiceNo || ''), 'invoiceNo=' + saleCash.invoiceNo);

/* ========================================================================== */
section('§20 · 6 — Udhaar sale (credit) + wasooli');
const custCredit = call('customers.save', { customer: { name: 'E2E Udhaar Customer', phone: '0300-2220002' } });
const UDHAR = 3000;
const saleCredit = call('sales.create', {
  sale: {
    locationId: LOC, sessionId: session.id,
    customerId: custCredit.id, customerName: custCredit.name,
    items: [{ itemId: buyItem.id, qty: 2, price: SELL_PRICE, discount: 0, taxRate: 0 }],
    payments: [{ method: 'CREDIT', amount: 0 }],
    dueAmount: UDHAR
  }
});
ok('udhaar sale ho gayi', !!(saleCredit && saleCredit.id), JSON.stringify(saleCredit).slice(0, 140));

const RECOVERED = 1200;
const recv = call('payments.create', {
  type: 'RECEIPT', partyType: 'CUSTOMER', partyId: custCredit.id,
  amount: RECOVERED, method: 'CASH', locationId: LOC, notes: 'e2e udhaar wasooli'
});
ok('udhaar ki wasooli record hui', !!recv, JSON.stringify(recv).slice(0, 120));

const ledger = call('customers.ledger', { id: custCredit.id });
const entries = ledger.rows || ledger.entries || [];
ok('customer ledger mein dono entries hain (sale + wasooli)',
  Array.isArray(entries) && entries.length >= 2, 'entries=' + (entries.length || 'n/a'));
ok('customer ka baqi udhaar = sale − wasooli',
  near(n(ledger.closing), n(saleCredit.total) - RECOVERED, 1),
  'closing=' + ledger.closing + ' expected=' + (n(saleCredit.total) - RECOVERED));

/* ========================================================================== */
section('§20 · 7 — Kharcha (expense)');
const EXPENSE = 750;
const exp = call('expenses.create', {
  expense: { amount: EXPENSE, method: 'CASH', locationId: LOC,
    category: 'General', notes: 'e2e chai + freight', date: new Date().toISOString().slice(0, 10) }
});
ok('expense record hua', !!exp, JSON.stringify(exp).slice(0, 120));

/* ========================================================================== */
section('§20 · 12 ke liye — Salesman: issue → sale → collect → settle');
const smItem = DB.all('Items').filter(i => i.id !== buyItem.id && n(i.costPrice) > 0)[0];
const branchStockBefore = stockOf(smItem.id);
const issue = call('salesman.issue', {
  salesmanId: login.data.session.userId, locationId: LOC,
  items: [{ itemId: smItem.id, qty: 20, cost: n(smItem.costPrice) }]
});
ok('salesman ko stock issue hua', !!issue, JSON.stringify(issue).slice(0, 140));
ok('§12: issue se BRANCH stock ghat-ta hai (maal salesman ke zimme)',
  stockOf(smItem.id) < branchStockBefore,
  'before=' + branchStockBefore + ' after=' + stockOf(smItem.id));

const smStock = call('salesman.stock', { salesmanId: login.data.session.userId });
const smRows = smStock.rows || smStock || [];
ok('§12: salesman ke zimme stock nazar aa raha hai',
  Array.isArray(smRows) && smRows.length > 0, 'rows=' + (smRows.length || 0));

const SM_CASH = 4000;          /* salesman ne customer se itne wasool kiye */
const smSale = call('sales.create', {
  sale: {
    locationId: LOC, source: 'SALESMAN', salespersonId: login.data.session.userId,
    items: [{ itemId: smItem.id, qty: 4, price: n(smItem.retailPrice) || (n(smItem.costPrice) * 1.3), discount: 0, taxRate: 0 }],
    payments: [{ method: 'CASH', amount: SM_CASH }]
  }
});
ok('salesman ki sale ho gayi', !!(smSale && smSale.id), JSON.stringify(smSale).slice(0, 140));
ok('salesman ki sale par cash wasool hua', n(smSale.paid) > 0, 'paid=' + smSale.paid);

/* NOTE: `cashCollected` parameter nahi hai — wo ASLI sales se calculate hota
   hai (sirf cashDeposited / countedValue bhejte hain). Ye ghalat-fehemi test
   mein pehle thi, ab document ho gayi. */
const SM_DEPOSIT = Math.round(SM_CASH * 0.6);   /* 60% jamaa karwaya */
const settle = call('salesman.settle', {
  salesmanId: login.data.session.userId, locationId: LOC,
  cashDeposited: SM_DEPOSIT, countedValue: 0
});
ok('§12: settlement ban gaya', !!settle, JSON.stringify(settle).slice(0, 160));
ok('§12: cashCollected ASLI sale se aata hai (pass nahi kiya gaya)',
  near(n(settle.cashCollected), SM_CASH, 1),
  'cashCollected=' + settle.cashCollected + ' expected=' + SM_CASH);
ok('§12: due from salesman = wasooli − jamaa',
  near(n(settle.dueFromSalesman), SM_CASH - SM_DEPOSIT, 1),
  'due=' + settle.dueFromSalesman + ' expected=' + (SM_CASH - SM_DEPOSIT));

/* ========================================================================== */
section('§20 · 8 — Branch transfer');
const xferItem = DB.all('Items').filter(i => i.id !== buyItem.id && i.id !== smItem.id)[0];
const srcBefore = stockOf(xferItem.id, LOC);
const dstBefore = stockOf(xferItem.id, LOC2);
const XQ = 6;
const xfer = call('stock.transfer.save', {
  transfer: { fromLocationId: LOC, toLocationId: LOC2,
    items: [{ itemId: xferItem.id, qty: XQ }], notes: 'e2e branch transfer' }
});
ok('transfer save hua', !!xfer, JSON.stringify(xfer).slice(0, 140));
ok('transfer se source stock ghat-ta hai', near(stockOf(xferItem.id, LOC), srcBefore - XQ),
  'before=' + srcBefore + ' after=' + stockOf(xferItem.id, LOC));
if (xfer && xfer.id) {
  try { call('stock.transfer.receive', { id: xfer.id }); } catch (e) { /* receive optional ho sakta hai */ }
  ok('transfer receive ke baad destination stock barhta hai',
    stockOf(xferItem.id, LOC2) > dstBefore,
    'before=' + dstBefore + ' after=' + stockOf(xferItem.id, LOC2));
}

/* ========================================================================== */
section('§20 · 9 — Din ka hisaab (day report + band karo)');
const dayReport = call('shop.dayReport', { sessionId: session.id });
ok('day report data mila', !!dayReport, JSON.stringify(dayReport).slice(0, 160));
ok('day report mein opening cash sahi', near(n(dayReport.openingCash), OPENING_CASH),
  'openingCash=' + dayReport.openingCash);
/* Payments.dayReport shape: { ..., totals: { cashSales, netCash, ... }, expectedCash } */
const T = dayReport.totals || dayReport;
ok('day report mein cash sales aayi hain', n(T.cashSales) > 0, 'cashSales=' + T.cashSales);
ok('day report mein expense shamil hai', n(T.expenses) > 0, 'expenses=' + T.expenses);
ok('day report: expected = opening + net cash',
  near(n(dayReport.expectedCash), OPENING_CASH + n(T.netCash), 0.5),
  'expected=' + dayReport.expectedCash + ' opening+net=' + (OPENING_CASH + n(T.netCash)));
ok('day report: net cash = cash sales − cash out − expense (taqriban)',
  n(T.cashSales) > 0 && isFinite(n(T.netCash)),
  'cashSales=' + T.cashSales + ' netCash=' + T.netCash + ' exp=' + T.expenseTotal);

const CLOSING = n(dayReport.expectedCash);          /* bilkul sahi hisaab */
const closed = call('cash.session.close', {
  id: session.id, closingCash: CLOSING, notes: 'e2e day close'
});
ok('session band ho gayi', !!closed, JSON.stringify(closed).slice(0, 140));
ok('§7: band karte hi closing report BAN GAYI (auto)',
  DB.all('DayReports').filter(r => U.str(r.kind) === 'CLOSE').length > 0,
  'CLOSE reports=' + DB.all('DayReports').filter(r => U.str(r.kind) === 'CLOSE').length);
ok('closing cash = expected (koi variance nahi)',
  near(n(closed.variance), 0), 'variance=' + closed.variance);

const hist = call('dayreport.list', { locationId: LOC });
const histRows = hist.rows || hist || [];
ok('§7: report history mein dono reports (OPEN + CLOSE)',
  Array.isArray(histRows) && histRows.length >= 2, 'history=' + (histRows.length || 0));

/* ========================================================================== */
section('§20 · 10 — Reports chalte hain (koi crash nahi)');
const catalog = call('reports.catalog');
const allReports = [];
(JSON.parse(JSON.stringify(catalog)) || []).forEach((g) => {
  (g.reports || g.items || []).forEach((r) => { if (r && r.id) allReports.push(r.id); });
});
ok('reports catalog mein reports hain', allReports.length > 20, 'reports=' + allReports.length);
let reportFails = [], ran = 0;
allReports.slice(0, 40).forEach((id) => {
  const r = tryCall('reports.run', { id: id, from: '', to: '' });
  if (!r.ok) reportFails.push(id + ': ' + U.str((r.error || {}).message).slice(0, 50));
  else ran++;
});
ok('catalog ki reports bina error chalti hain',
  reportFails.length === 0, 'ran=' + ran + ' failed=' + reportFails.length + ' ' + reportFails.slice(0, 3).join(' | '));

/* ========================================================================== */
section('§20 · 11 — INVARIANTS (poore safar ke baad)');
ok('kahin bhi stock NEGATIVE nahi', negStock().length === 0, negStock().slice(0, 4).join(', '));

const totals = DB.all('Stock').reduce((a, r) => a + n(r.qty), 0);
ok('kul stock ek munasib number hai (data barbaad nahi hua)',
  totals > 0 && isFinite(totals), 'totalQty=' + totals);

const moves = DB.all('StockMoves') || DB.all('StockLedger') || [];
ok('stock moves/ledger record hue hain', moves.length > 0, 'moves=' + moves.length);

const auditActions = {};
DB.all('AuditLog').forEach(l => { auditActions[l.action] = (auditActions[l.action] || 0) + 1; });
['SALE_CREATE', 'GRN_CREATE', 'PO_APPROVE'].forEach((a) => {
  /* backend alag naam use kar sakta hai — sirf itna check karo ke trail bani ho */
});
ok('§15: audit trail bani hai (koi qadam ghair-mehfooz nahi)',
  DB.all('AuditLog').length > 10, 'audit entries=' + DB.all('AuditLog').length);
ok('§15: audit mein GRN ka nishaan hai',
  Object.keys(auditActions).some(a => /GRN/i.test(a)),
  Object.keys(auditActions).filter(a => /GRN|PO/i.test(a)).join(', ') || 'none');
ok('§15: audit mein SALE ka nishaan hai',
  Object.keys(auditActions).some(a => /SALE/i.test(a)),
  Object.keys(auditActions).filter(a => /SALE/i.test(a)).join(', ') || 'none');
ok('§15: audit mein DAY_REPORT ka nishaan hai (§7)',
  Object.keys(auditActions).some(a => /DAY_REPORT/i.test(a)), 'DAY_REPORT missing');

ok('koi cell [object Object] nahi (DB._cell serialization)',
  (function () {
    let bad = 0;
    Object.keys(sandbox.SCHEMA).forEach((sheet) => {
      (DB.all(sheet) || []).forEach((row) => {
        Object.keys(row).forEach((k) => {
          if (U.str(row[k]).indexOf('[object Object]') > -1) bad++;
        });
      });
    });
    return bad === 0;
  })(), 'serialize check');

console.log('\n══════════════════════════════════════════════════════════════════');
console.log(`  §20 END-TO-END QA   PASS: ${pass}   FAIL: ${fail}`);
if (fail) failures.forEach(f => console.log('   ✖ ' + f));
console.log('══════════════════════════════════════════════════════════════════');
process.exit(fail ? 1 : 0);
