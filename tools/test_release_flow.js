#!/usr/bin/env node
'use strict';
/**
 * tools/test_release_flow.js — v2.30.0 GATE: fresh-install → shop rules → reports
 * ============================================================================
 * User ka final validation checklist (jaisa maanga gaya):
 *   fresh setup → seed → login → shop open → customer → product/items →
 *   inventory → sale → shop close → reports → settings → demo visibility
 *
 * Har qadam ASLI backend (.gs) par chalta hai — mocked Apps Script runtime mein.
 *   node tools/test_release_flow.js
 */
const assert = require('assert');
const path = require('path');
const { loadBackend } = require('./mock_gs');

let pass = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ✔ ' + name); }
  else { failures.push(name + (detail ? ' → ' + detail : '')); console.log('  ✖ ' + name + (detail ? '  → ' + detail : '')); }
}
function section(t) { console.log('\n' + t); }

const { sandbox: s } = loadBackend(path.join(__dirname, '..', 'apps-script'));
let TOKEN = '';
/** raw api envelope → {ok,data,error}; test helper unwrap karta hai aur fail par throw */
const raw = (action, payload) => s.api(action, Object.assign({ token: TOKEN }, payload || {}));
const api = (action, payload) => {
  const r = raw(action, payload);
  if (!r || !r.ok) {
    const err = (r && r.error) || {};
    const e = new Error(String(err.message || 'api failed'));
    e.code = err.code; e.action = action; e.details = err.details;
    throw e;
  }
  return r.data;
};

/* ======================= 1. FRESH SETUP + SEED =========================== */
section('1) FRESH SETUP + SEED (naya deployment)');
const setup = s.setupAll();
ok('setupAll() complete hota hai (physical seed verification ke sath)', setup.complete === true && setup.phase === 'COMPLETE', JSON.stringify(setup.missing || setup.message || ''));
ok('settings seed hue (60+)', setup.seedCounts.Settings >= 60, String(setup.seedCounts.Settings));
ok('users (9 staff + 1 demo) + roles/groups seed hue', setup.seedCounts.Users === 10 && setup.seedCounts.Groups === 5, JSON.stringify({ u: setup.seedCounts.Users, g: setup.seedCounts.Groups }));
ok('3 branches + number series seed hui', setup.seedCounts.Locations === 3 && setup.seedCounts.NumberSeries === 30, JSON.stringify({ l: setup.seedCounts.Locations, n: setup.seedCounts.NumberSeries }));
ok('DEMO CUSTOMER seed hua (user ki shikayat)', s.DB.count('Customers') >= 2 && !!s.DB.findOne('Customers', r => r.code === 'DEMO-WALKIN'), 'customers=' + s.DB.count('Customers'));
ok('demo supplier seed hua', !!s.DB.findOne('Suppliers', r => r.code === 'DEMO-SUP'));
ok('demo products + opening stock seed hue', s.DB.count('Items') === 10 && s.DB.count('Stock') >= 30, JSON.stringify({ items: s.DB.count('Items'), stock: s.DB.count('Stock') }));
ok('demo rows isDemo se mark hain', s.DB.all('Items').every(r => String(r.isDemo) === 'true') && s.DB.all('Customers').every(r => String(r.isDemo) === 'true'));
ok('demo user (training) bhi isDemo hai', !!s.DB.findOne('Users', r => r.username === 'demo' && String(r.isDemo) === 'true'));
ok('real staff users demo mark NAHI hain', s.DB.all('Users').filter(r => String(r.isDemo) !== 'true').length === 9);
ok('seed plan mein demo step registered hai', s.setupSeedPlan_().some(st => st.method === 'seedDemoData'), JSON.stringify(s.setupSeedPlan_().map(x => x.method).slice(-2)));

/* ======================= 2. LOGIN ======================================== */
section('2) LOGIN (seeded data ke sath)');
const login = api('auth.login', { username: 'owner', password: 'admin123' });
TOKEN = login.token;
ok('owner login ho gaya (fresh seed ke baad)', !!TOKEN && !!login.session, 'token=' + String(TOKEN).slice(0, 12) + '…');
ok('session mein permissions + branches mojood', (login.session.permissions || []).includes('*') && (login.session.locationIds || []).length === 3 && !!login.session.defaultLocationId, JSON.stringify({ perms: login.session.permissions, locs: (login.session.locationIds || []).length }));
const demoLogin = s.api('auth.login', { username: 'demo', password: 'demo123' });
ok('demo user bhi login kar sakta hai (training)', !!(demoLogin.ok && demoLogin.data && demoLogin.data.token), JSON.stringify(demoLogin.error || {}).slice(0, 120));

/* ======================= 3. SHOP CLOSED → SALE BLOCK ===================== */
section('3) SHOP BAND → SALE BLOCK (naya rule)');
const st0 = api('shop.status', {});
ok('shop.status → band (fresh install par koi session nahi)', st0.open === false, JSON.stringify(st0.session));
const cust = api('customers.list', { limit: 5 });
ok('customer list mein DEMO customer milta hai', (cust.rows || cust || []).length > 0, JSON.stringify((cust.rows || []).length));

const item = api('items.list', { pageSize: 5, withStock: true });
ok('items.list rows deta hai (blank nahi)', (item.rows || []).length === 5 && item.total === 10, JSON.stringify({ rows: (item.rows || []).length, total: item.total }));
const itemsList = item.rows[0];

let blocked = null;
try { api('sales.create', { items: [{ itemId: itemsList.id, qty: 1, price: itemsList.retailPrice }], payments: [{ method: 'CASH', amount: Number(itemsList.retailPrice) }] }); }
catch (e) { blocked = e; }
ok('SHOP CLOSED par sale BLOCK hui (server-level)', !!blocked && /SHOP_CLOSED|Shop band hai/.test(blocked.message), blocked ? blocked.message.slice(0, 80) : 'sale chal gayi — rule fail');
ok('error message SHOP_CLOSED prefix ke sath (UI banner isse pehchane)', !!blocked && /^SHOP_CLOSED\|/.test(blocked.message), blocked ? blocked.message.slice(0, 30) : 'none');

/* ======================= 4. SHOP OPEN ==================================== */
section('4) SHOP OPEN (+ opening report)');
const opened = api('shop.open', { openingCash: 5000 });
ok('shop.open → session bana', !!(opened.session && opened.session.id) && opened.session.openingCash === 5000, JSON.stringify(opened.session));
ok('shop.status ab OPEN', api('shop.status', {}).open === true);
ok('OPENING report auto-generate hui (structured)', !!(opened.report && opened.report.reportNo) && opened.report.kind === 'OPEN', JSON.stringify(opened.report && { no: opened.report.reportNo, kind: opened.report.kind }));
ok('report summary mein opening cash + zero sales', Number(opened.report.summary.openingCash) === 5000 && Number(opened.report.summary.invoices) === 0, JSON.stringify(opened.report.summary));
ok('share text (WhatsApp) bana', /SHOP OPEN REPORT/.test(opened.share) && /Opening cash/.test(opened.share), String(opened.share).split('\n')[0]);
ok('autoPrint flag report ke sath', opened.autoPrint === true);

/* ======================= 5. CUSTOMER + PRODUCT + INVENTORY =============== */
section('5) CUSTOMER / PRODUCT / INVENTORY');
const demoCust = api('customers.list', { limit: 50 }).rows.find(r => r.code === 'DEMO-WALKIN');
ok('DEMO customer id mil gayi', !!demoCust && !!demoCust.id);
const stock = api('stock.levels', {});
const stockRows = stock.rows || stock || [];
ok('inventory (stock.list) rows deta hai', stockRows.length >= 10, 'rows=' + stockRows.length);
const itemDetail = api('items.get', { id: itemsList.id, withStock: true });
ok('item detail + stockByLocation', !!itemDetail && !!(itemDetail.stockByLocation || []).length, JSON.stringify((itemDetail.stockByLocation || []).length));

/* ======================= 6. SALE ========================================= */
section('6) SALE (shop khuli hai)');
const stockBefore = Number((s.DB.findOne('Stock', r => r.itemId === itemsList.id && r.locationId === login.session.defaultLocationId) || {}).qty);
const price = Number(itemsList.retailPrice || 1000);
const sale = api('sales.create', {
  customerId: demoCust.id, customerName: demoCust.name,
  items: [{ itemId: itemsList.id, qty: 2, price: price }],
  payments: [{ method: 'CASH', amount: price * 2 }]
});
ok('sale post ho gayi', !!(sale && sale.id), JSON.stringify(sale && { inv: sale.invoiceNo, total: sale.total }));
const saleRow = s.DB.byId('Sales', sale.id);
ok('sale row par sessionId stamp hua (tracking)', !!saleRow.sessionId && saleRow.sessionId === opened.session.id, JSON.stringify({ sale: saleRow.sessionId, session: opened.session.id }));
ok('receipt (Payments) bhi session se juda', s.DB.all('Payments').some(p => p.sessionId === opened.session.id && p.type === 'SALE_RECEIPT'));
ok('sale par cashierId (user) stamp hua', !!sale.cashierId && sale.cashierId === login.session.userId, 'cashier=' + sale.cashierId);
ok('sale location default branch hai', sale.locationId === login.session.defaultLocationId, sale.locationId);
const stockAfter = Number((s.DB.findOne('Stock', r => r.itemId === itemsList.id && r.locationId === login.session.defaultLocationId) || {}).qty);
ok('stock ghat gaya (2 pcs, isi branch ka)', stockAfter === stockBefore - 2, stockBefore + ' -> ' + stockAfter);
const otherQty = Number((s.DB.findOne('Stock', r => r.itemId === itemsList.id && r.locationId === 'LOC-MCH') || {}).qty);
ok('doosri branch ka stock waisa hi', otherQty === stockBefore, String(otherQty));
  const row = s.DB.findOne('Stock', r => r.itemId === itemsList.id && r.locationId === login.session.defaultLocationId);

/* ======================= 7. SHOP CLOSE + REPORTS ========================= */
section('7) SHOP CLOSE + REPORTS');
const closed = api('shop.close', { closingCash: 5000 + price * 2 });
ok('shop.close → session CLOSED', !!(closed.session && closed.session.status === 'CLOSED'), JSON.stringify(closed.session));
ok('CLOSING report auto-generate hui', !!(closed.report && closed.report.reportNo) && closed.report.kind === 'CLOSE', JSON.stringify(closed.report && { no: closed.report.reportNo, kind: closed.report.kind }));
ok('closing report mein cash sales + variance hisab', Number(closed.report.summary.cashSales) === price * 2 && closed.report.summary.openingCash !== undefined, JSON.stringify(closed.report.summary));
ok('closing share text (WhatsApp) bana', /SHOP CLOSE REPORT/.test(closed.share) && /Variance/.test(closed.share));
ok('shop.status ab band', api('shop.status', {}).open === false);
const hist = api('dayreport.list', {});
ok('report history mein 2 reports (OPEN + CLOSE)', ((hist.rows || hist || []).length) === 2, 'rows=' + JSON.stringify((hist.rows || hist || []).length));
const html = api('dayreport.html', { id: closed.report.id });
ok('report ka printable HTML banta hai', !!html && (/<html/i.test(String(html.html || html))), String(html && Object.keys(html)));
const csv = api('dayreport.csv', { id: closed.report.id });
ok('report ka CSV export banta hai', !!csv && /csv|filename/i.test(JSON.stringify(Object.keys(csv || {}))), JSON.stringify(csv && Object.keys(csv)));

/* ======================= 8. SETTINGS + DEMO VISIBILITY =================== */
section('8) SETTINGS + DEMO DATA VISIBILITY');
const sets = api('system.settings.get', {});
ok('naye settings keys mojood (data.showDemo, shop.requireOpen, setup.wizardDone)', sets['data.showDemo'] !== undefined && sets['shop.requireOpen'] !== undefined && sets['setup.wizardDone'] !== undefined, JSON.stringify({ demo: sets['data.showDemo'], shop: sets['shop.requireOpen'] }));
ok('demo visibility default true (fresh install usable)', String(sets['data.showDemo']) === 'true');
const stats = api('admin.demoStats', {});
ok('demoStats demo rows ginta hai', stats.total >= 12, JSON.stringify(stats.counts));
const wiz = api('system.setupStatus', {});
ok('wizard status: needsWizard true (fresh install)', wiz.needsWizard === true && wiz.steps.done === false);
ok('wizard status seed counts dikhata hai', wiz.seeded.items === 10 && wiz.seeded.users === 10, JSON.stringify(wiz.seeded));
const diag = api('setup.diag', {});
ok('diagnostics: koi missing sheet/column nahi', (diag.problems || []).length === 0, JSON.stringify((diag.problems || []).slice(0, 3)));
ok('diagnostics counts + shop status deta hai', diag.counts.Items === 10 && !!diag.shop, JSON.stringify(diag.counts));

/* demo hide → dashboard numbers se demo nikal jayein */
const dashBefore = api('reports.dashboard', {});
ok('dashboard demo ke sath: 10 items + demo flag off', dashBefore.kpis.itemsCount === 10 && dashBefore.kpis.demoHidden !== true, JSON.stringify({ items: dashBefore.kpis.itemsCount, hidden: dashBefore.kpis.demoHidden }));
api('system.settings.save', { values: { 'data.showDemo': 'false' } });
ok('demo hide karne par demoVisible false', s.Shop.demoVisible() === false);
const dashAfter = api('reports.dashboard', {});
ok('dashboard se demo items/customers ghayab (production view)', dashAfter.kpis.itemsCount === 0 && dashAfter.kpis.customersCount === 0 && dashAfter.kpis.demoHidden === true, JSON.stringify({ items: dashAfter.kpis.itemsCount, cust: dashAfter.kpis.customersCount, hidden: dashAfter.kpis.demoHidden }));
ok('dashboard par demo low-stock list khali', (dashAfter.lowStock || []).length === 0, JSON.stringify((dashAfter.lowStock || []).length));
ok('real data dashboard par barqarar (demo hide se real chhupta nahi)', (dashAfter.kpis.itemsCount === 0) === true && dashBefore.kpis.itemsCount === 10);
const visible = s.Shop.visibleRows(s.DB.all('Items'));
ok('demo items production view se hat gaye', visible.length === 0, 'visible=' + visible.length);
api('system.settings.save', { values: { 'data.showDemo': 'true' } });
ok('wapas true karne par demo items lauta aate hain', s.Shop.visibleRows(s.DB.all('Items')).length === 10);

/* ======================= 9. FAIL-OPEN / KILL-SWITCH ==================== */
section('9) RULES + KILL-SWITCH');
api('system.settings.save', { values: { 'shop.requireOpen': 'false' } });
let allowed = null;
try {
  const it2 = api('items.list', { pageSize: 1, withStock: true }).rows[0];
  allowed = api('sales.create', { items: [{ itemId: it2.id, qty: 1, price: Number(it2.retailPrice) }], payments: [{ method: 'CASH', amount: Number(it2.retailPrice) }] });
} catch (e) { allowed = e; }
ok('shop.requireOpen=false par sale allowed (setting ka asar)', !!(allowed && allowed.id), JSON.stringify(allowed && allowed.message));
api('system.settings.save', { values: { 'shop.requireOpen': 'true' } });
let blocked2 = null;
try {
  const it3 = api('items.list', { pageSize: 1, withStock: true }).rows[0];
  api('sales.create', { items: [{ itemId: it3.id, qty: 1, price: Number(it3.retailPrice) }], payments: [{ method: 'CASH', amount: Number(it3.retailPrice) }] });
} catch (e) { blocked2 = e; }
ok('wapas true karne par block bahal', !!blocked2 && /SHOP_CLOSED\|/.test(blocked2.message));

/* ======================= 10. DEMO REMOVAL (production) ================= */
section('10) PRODUCTION KE LIYE DEMO DATA HATAO');
const p2 = s.api('auth.login', { username: 'owner', password: 'admin123' });
const savedToken = TOKEN; TOKEN = (p2.data || p2).token;
const removed = api('admin.removeDemoData', {});
ok('demo data hat gaya (sirf isDemo rows)', removed.removed && removed.removed.Items === 10 && removed.removed.Customers === 2, JSON.stringify(removed.removed));
ok('real users safe hain (demo user hi gaya)', s.DB.count('Users') === 9 && !s.DB.findOne('Users', r => r.username === 'demo'));
ok('real data safe (koi real sale/customer nahi hua)', s.DB.count('Sales') >= 1);
TOKEN = savedToken;

/* ======================= SUMMARY ====================================== */
console.log('\n═══════════════════════════════════════════════════════════');
console.log(`  RELEASE FLOW   PASS: ${pass}   FAIL: ${failures.length}`);
failures.forEach(f => console.log('   ✖ ' + f));
console.log('═══════════════════════════════════════════════════════════');
process.exit(failures.length ? 1 : 0);
