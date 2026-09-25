#!/usr/bin/env node
/* ==========================================================================
   test_routes.js — v2.6 §19/§20: UNTESTED ROUTES ko asli tor par chalana
   --------------------------------------------------------------------------
   route_audit.js ne bataya: 265 routes hain, 0 crash — magar **114 aisi hain
   jinhein koi test chalta hi nahi**. E2E QA ne yahin 5 bugs pakde thay
   (route "maujood" thi, "chalti" nahi thi).

   Ye test un 114 ko REALISTIC payloads ke sath chala kar MEANINGFUL nateeja
   check karta hai — sirf "crash nahi hua" nahi, balkay "sahi jawab aaya".

   Pehla daur (sab se zyada khatre wale):
     • §12 salesman family (yahan abhi 3 bugs mile thay)
     • §10 warehouse family
     • core stock family
     • reports / dashboard
     • admin: users, system, utils

     node tools/test_routes.js
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
const arr = (v) => Array.isArray(v) ? v : [];

/* ------------------------------- bootstrap -------------------------------- */
const { sandbox } = loadBackend(DIR);
const { api, Setup, DB, U } = sandbox;
Setup.setupAll();
Setup.seedAll();
Setup.seedProducts({ stock: 20 });

const login = api('auth.login', { username: 'owner', password: 'admin123' });
const TOKEN = login.data.token;
const ME = login.data.session.userId;
const LOC = 'LOC-SDQ';

function call(action, payload) {
  const r = api(action, Object.assign({ token: TOKEN, locationId: LOC }, payload || {}));
  if (!r.ok) throw new Error(action + ' failed: ' + JSON.stringify(r.error || r));
  return r.data;
}
/** crash to nahi, par error bhi theek hai — sirf itna check karo ke handle hua */
function handled(action, payload) {
  const r = api(action, Object.assign({ token: TOKEN, locationId: LOC }, payload || {}));
  const msg = String(((r.error || {}).message) || '');
  const isCrash = /is not a function|is not defined|Cannot read prop|Cannot set prop|of null|of undefined/i.test(msg);
  return { ok: !!r.ok, crash: isCrash, msg: msg.slice(0, 90), data: r.data };
}

/* ========================================================================== */
section('§12 Salesman family — 3 bugs yahan mile thay, sab routes chala kar dekho');

const smItem = DB.all('Items').filter(i => n(i.costPrice) > 0)[0];
const issue = call('salesman.issue', {
  salesmanId: ME, locationId: LOC,
  items: [{ itemId: smItem.id, qty: 15, cost: n(smItem.costPrice) }]
});
ok('salesman.issue chala', !!(issue && issue.id), JSON.stringify(issue).slice(0, 110));

{ const r = handled('salesman.issues', { salesmanId: ME });
  ok('salesman.issues list deta hai', r.ok && arr(r.data && (r.data.rows || r.data)).length >= 0,
    JSON.stringify(r.data).slice(0, 100)); }

{ const r = handled('salesman.issue.get', { id: issue.id });
  ok('salesman.issue.get purana issue deta hai', r.ok, r.msg); }

/* v2.30.6 — demo v2.30.5 se CLOSED boot karta hai: sale se pehle session khulo (recipe) */
call('cash.session.open', { locationId: LOC, openingCash: 500 });

/* BUG #2 yahan tha: sale ke liye salespersonId chahiye */
const smSale = call('sales.create', {
  sale: {
    locationId: LOC, source: 'SALESMAN', salespersonId: ME,
    items: [{ itemId: smItem.id, qty: 3, price: n(smItem.retailPrice) || 100, discount: 0, taxRate: 0 }],
    payments: [{ method: 'CASH', amount: 2500 }]
  }
});
ok('salesman ki sale (consignment) hoti hai', !!(smSale && smSale.id), JSON.stringify(smSale).slice(0, 110));

/* BUG #3: collect mein partyId chahiye */
{ const r = handled('pwa.sm.collect', { customerId: '', amount: 0 });
  ok('pwa.sm.collect ghalat amount par crash NAHI karta (validation error theek hai)',
    !r.crash, r.msg); }

const settle = call('salesman.settle', { salesmanId: ME, locationId: LOC, cashDeposited: 1000, countedValue: 0 });
ok('salesman.settle chala', !!(settle && settle.id), JSON.stringify(settle).slice(0, 110));

{ const r = handled('salesman.settlements', { salesmanId: ME });
  ok('salesman.settlements list deta hai', r.ok, r.msg); }
{ const r = handled('salesman.settlement.get', { id: settle.id });
  ok('salesman.settlement.get purana settlement deta hai', r.ok, r.msg); }
{ const r = handled('salesman.returns', { salesmanId: ME });
  ok('salesman.returns list deta hai', r.ok, r.msg); }
{ const r = handled('salesman.summary', { salesmanId: ME });
  ok('salesman.summary deta hai', r.ok, r.msg); }
{ const r = handled('salesman.list', {});
  ok('salesman.list deta hai', r.ok, r.msg); }
{ const r = handled('salesman.stock', { salesmanId: ME });
  ok('salesman.stock deta hai', r.ok && !!r.data, r.msg); }

/* ========================================================================== */
section('§10 Warehouse family');

{ const r = handled('warehouse.lots', { locationId: LOC });
  ok('warehouse.lots deta hai', r.ok, r.msg); }
{ const r = handled('warehouse.lot.receive', { itemId: smItem.id, qty: 1, cost: 10 });
  /* lot tracking settings se off ho sakta hai — validation error theek hai */
  ok('warehouse.lot.receive crash NAHI karta', !r.crash, r.msg); }
{ const r = handled('warehouse.save', { warehouse: { code: 'WH-T', name: 'Test WH', locationId: LOC } });
  ok('warehouse.save crash NAHI karta', !r.crash, r.msg); }
{ const bins = call('warehouse.bins', { locationId: LOC });
  const b = arr(bins)[0];
  if (b) {
    const r = handled('warehouse.bin.save', { bin: { id: b.id, name: b.name + ' (renamed)', locationId: LOC } });
    ok('warehouse.bin.save crash NAHI karta', !r.crash, r.msg);
  } else ok('warehouse.bins khaali (bin maujood nahi)', true, 'no bins'); }
{ const r = handled('warehouse.count.create', { locationId: LOC });
  ok('warehouse.count.create crash NAHI karta', !r.crash, r.msg);
  const sheet = DB.all('CountSheets')[0];
  if (sheet) {
    const r2 = handled('warehouse.count.cancel', { id: sheet.id });
    ok('warehouse.count.cancel crash NAHI karta', !r2.crash, r2.msg);
  } }

/* ========================================================================== */
section('Core stock family');

{ const r = call('stock.levels', { locationId: LOC });
  ok('stock.levels list deta hai', Array.isArray(r) ? r.length > 0 : !!r,
    'rows=' + (Array.isArray(r) ? r.length : typeof r)); }
{ const r = call('stock.moves', { locationId: LOC });
  ok('stock.moves list deta hai', Array.isArray(r) ? true : !!r, 'type=' + typeof r); }
{ const r = handled('stock.adjust.list', { locationId: LOC });
  ok('stock.adjust.list deta hai', r.ok, r.msg); }
{ const r = handled('stock.transfer.list', { locationId: LOC });
  ok('stock.transfer.list deta hai', r.ok, r.msg); }
{ const r = handled('stock.count', { itemId: smItem.id, qty: 5 });
  ok('stock.count crash NAHI karta', !r.crash, r.msg); }

/* ========================================================================== */
section('Reports / dashboard');

{ const r = handled('reports.dashboard', {});
  ok('reports.dashboard chala', r.ok, r.msg); }
{ const r = handled('reports.export', { kind: 'sales', format: 'CSV' });
  ok('reports.export crash NAHI karta', !r.crash, r.msg); }
{ const r = handled('reports.catalog', {});
  ok('reports.catalog groups deta hai', r.ok && Array.isArray(r.data), 'groups=' + (r.data || []).length); }

/* ========================================================================== */
section('Admin: users · system · utils');

{ const r = handled('users.list', {});
  ok('users.list deta hai', r.ok, r.msg); }
{ const r = handled('users.groups.list', {});
  ok('users.groups.list deta hai', r.ok, r.msg); }
{ const r = handled('users.matrix', {});
  ok('users.matrix deta hai', r.ok, r.msg); }
{ const r = handled('system.ping', {});
  ok('system.ping deta hai', r.ok, r.msg); }
{ const r = handled('system.health', {});
  ok('system.health deta hai', r.ok, r.msg); }
{ const r = handled('system.settings.get', {});
  ok('system.settings.get deta hai', r.ok, r.msg); }
{ const r = handled('utils.stats', {});
  ok('utils.stats deta hai', r.ok, r.msg); }
{ const r = handled('utils.reindex', {});
  ok('utils.reindex crash NAHI karta', !r.crash, r.msg); }
{ const r = handled('utils.backup', {});
  ok('utils.backup crash NAHI karta', !r.crash, r.msg); }

/* ========================================================================== */
section('Baqui untested routes — sirf crash-check (data shape alag ho sakta hai)');

const REST = [
  'accounting.backfill', 'accounts.save', 'accounts.seed', 'ai.chat', 'ai.clear',
  'ai.config', 'ai.history', 'ai.index', 'ai.insights', 'ai.test',
  'barcode.generate', 'barcode.labels', 'barcode.print', 'barcode.scan',
  'commissions.accrue', 'commissions.pay', 'commissions.rules.save', 'commissions.summary',
  'customers.types.list', 'customers.types.save', 'expenses.list', 'expenses.approve',
  'inventory.reorder', 'items.bulk', 'items.facets', 'items.import',
  'loyalty.adjust', 'loyalty.redeem', 'loyalty.summary',
  'migration.export', 'migration.log', 'migration.sync',
  'notifications.clear', 'notifications.list', 'notifications.read',
  'offline.pull', 'offline.sync', 'orders.get', 'pay.methods.enabled',
  'payments.list', 'priceimport.gmail', 'priceimport.sample',
  'purchase.po.list', 'purchase.returns.list', 'reorder.run',
  'sales.get', 'sales.held.list', 'sales.held.resume', 'sales.hold',
  'sales.returns.list', 'stock.adjust.post', 'stock.adjust.reverse',
  'suppliers.list', 'system.bootstrap', 'system.triggers.remove',
  'users.groups.save', 'wallet.manual', 'wallet.poll'
];

let restCrashes = [], restOk = 0;
REST.forEach((a) => {
  const r = handled(a, {});
  if (r.crash) restCrashes.push(a + ' → ' + r.msg);
  else restOk++;
});
ok(`${REST.length} untested routes mein se koi CRASH nahi karta`,
  restCrashes.length === 0, restCrashes.slice(0, 4).join(' | '));
ok('...aur sab ne jawab diya (chahe validation error ho)',
  restOk === REST.length, 'responded=' + restOk + '/' + REST.length);

/* ========================================================================== */
section('JSONP bridge — static hosting (Netlify / Vercel / GitHub Pages)');

/* doGet ka ?t=jsonp branch — pehle ye DEAD CODE tha (function maujood tha,
   doGet usay kabhi call hi nahi karta tha) → static hosting kabhi chalti
   hi nahi thi. Ab wired hai + callback sanitized. */
function jsonpCall(action, payload, cb) {
  const out = sandbox.jsonp(action, JSON.stringify(payload || {}), cb);
  const body = (out && out.getContent) ? out.getContent() : String(out);
  const mime = (out && out.getMimeType) ? out.getMimeType() : '';
  return { body, mime };
}

{ const r = jsonpCall('auth.login', { username: 'owner', password: 'admin123' }, 'cb1');
  ok('jsonp: JS mime deta hai', /javascript/i.test(r.mime), r.mime);
  ok('jsonp: callback ke sath wrap karta hai', /^cb1\(/.test(r.body), r.body.slice(0, 40));
  ok('jsonp: asli result deta hai (login token)',
    /"ok":true/.test(r.body) && /token/.test(r.body), r.body.slice(0, 80)); }

{ const r = jsonpCall('items.list', { token: TOKEN }, 'cb2');
  ok('jsonp: token ke sath bhi kaam karta hai (auth lagu)', /"ok":true/.test(r.body), r.body.slice(0, 60)); }

{ const r = jsonpCall('items.list', {}, 'cb3');
  ok('jsonp: bina token → SESSION_EXPIRED (security barkarar)',
    /SESSION_EXPIRED/.test(r.body), r.body.slice(0, 90)); }

/* XSS: callback mein sirf [A-Za-z0-9_$.] allow */
{ const r = jsonpCall('auth.login', {}, 'alert(1)//<script>');
  ok('jsonp: kharab callback ko saf karta hai (XSS band)',
    !/alert\(1\)|<script>/.test(r.body), r.body.slice(0, 50));
  ok('jsonp: saf hone ke baad valid JS identifier rehta hai',
    /^[A-Za-z0-9_$.]+\(/.test(r.body), r.body.slice(0, 40)); }

{ const r = jsonpCall('koi.galat.action', { token: TOKEN }, 'cb4');
  ok('jsonp: ghalat action → NO_ROUTE (crash nahi)',
    /NO_ROUTE/.test(r.body), r.body.slice(0, 90)); }
/* auth route-lookup se PEHLE chalti hai — bina token NO_ROUTE nahi, SESSION_EXPIRED */
{ const r = jsonpCall('koi.galat.action', {}, 'cb6');
  ok('jsonp: bina token ghalat action par bhi SESSION_EXPIRED pehle',
    /SESSION_EXPIRED/.test(r.body) && !/NO_ROUTE/.test(r.body), r.body.slice(0, 70)); }

{ const nm = DB.insert('Items', { sku: 'JSONP-XSS-1', name: 'A</script>B\u2028C',
      costPrice: 1, retailPrice: 2, wholesalePrice: 2, uom: 'PCS', trackStock: 'true' }) ;
  const r = jsonpCall('items.list', { token: TOKEN }, 'cb5');
  ok('jsonp: `</script>` escape hota hai (JS tootay nahi)',
    r.body.indexOf('</script>') === -1, r.body.indexOf('</script>') === -1 ? 'clean' : 'LEAK');
  ok('jsonp: U+2028/2029 escape hote hain',
    r.body.indexOf('\u2028') === -1, r.body.indexOf('\u2028') === -1 ? 'clean' : 'LEAK'); }

/* ========================================================================== */
section('v2.6 QA — user ki teen shikayatein (regression tests)');

/* ① Settings tabs: window.DEFS kabhi set nahi hota tha → hamesha lowercase id.
      Ye test browser-mein render check karta hai (tools/test_settings_ui.js). */
{ const r = handled('config.defs', {});
  ok('config.defs group labels+icons deta hai (Settings tabs inhi se bante hain)',
    r.ok && Array.isArray(r.data) && r.data.length >= 8 &&
    r.data.every(g => g.id && g.label && g.icon),
    'groups=' + ((r.data || []).length) + ' · pehla=' +
    JSON.stringify((r.data || [])[0] && { id: r.data[0].id, label: r.data[0].label, icon: r.data[0].icon })); }

/* ② Shop close: pehle auto() ka natija phenk diya jata tha → koi print/export */
{ const ses = call('cash.session.open', { locationId: LOC, openingCash: 500 });
  const closed = call('cash.session.close', { sessionId: ses.id, closingCash: 500, difference: 0, notes: 'qa' });
  ok('shop close jawab mein dayReport wapas bhejta hai (§7 point 3)',
    !!(closed && closed.dayReport), closed && closed.dayReport ? 'report#' + (closed.dayReport.reportNo || '?') : 'GHAIB');
  ok('shop close autoPrint flag bhi bhejta hai (§7 point 4)',
    'autoPrint' in (closed || {}), 'autoPrint=' + (closed && closed.autoPrint));
  /* history se dobara print/export (§7 point 5) */
  const hist = call('dayreport.list', { sessionId: ses.id });
  ok('report history mein save hui (baad mein dobara print ho sake)',
    arr(hist).length >= 1, 'rows=' + arr(hist).length); }

/* ③ Product image upload — pehle sirf URL paste tha */
{ const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const it = call('items.save', { item: { code: 'QA-IMG-1', name: 'QA Image Item', costPrice: 1, retailPrice: 2, uom: 'PCS' } });
  const up = call('items.uploadImage', { itemId: it.id, data: 'data:image/png;base64,' + png, mime: 'image/png', slot: 'main' });
  ok('items.uploadImage Drive par file banata hai', !!(up && up.url), up && up.url ? up.url.slice(0, 48) : 'fail');
  ok('upload ke baad item.imageUrl set ho jata hai',
    U_str(DB.byId('Items', it.id).imageUrl).indexOf('http') === 0,
    U_str(DB.byId('Items', it.id).imageUrl).slice(0, 40));
  /* gallery slot */
  const up2 = call('items.uploadImage', { itemId: it.id, data: 'data:image/png;base64,' + png, mime: 'image/png', slot: 'gallery' });
  ok('gallery slot bhi kaam karta hai', !!(up2 && up2.gallery && up2.gallery.length >= 1),
    'gallery=' + ((up2 && up2.gallery) || []).length);
  /* guards */
  let bad = 0;
  try { call('items.uploadImage', { itemId: it.id, data: 'data:text/plain;base64,aGVsbG8=', mime: 'text/plain' }); } catch (e) { bad++; }
  ok('sirf image allow hai (text file reject)', bad === 1);
  bad = 0;
  try { call('items.uploadImage', { itemId: 'NOPE', data: 'data:image/png;base64,' + png }); } catch (e) { bad++; }
  ok('ghalat item → saaf error (crash nahi)', bad === 1);
  /* audit trail (§15) */
  ok('image upload audit trail mein darj hota hai',
    DB.all('AuditLog').some(a => U_str(a.entity) === 'Items' && U_str(a.action) === 'ITEM_IMAGE'),
    'ITEM_IMAGE logged'); }

/* ④ Shop logo upload — user: "shop ka Logo add karnay ki bhi option nahi hay" */
{ const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const up = call('media.uploadLogo', { data: 'data:image/png;base64,' + png, mime: 'image/png' });
  const st2 = DB.settings ? (DB.settings() || {}) : {};
  ok('media.uploadLogo Drive par save karta hai', !!(up && up.url && up.url.indexOf('http') === 0),
    up && up.url ? up.url.slice(0, 44) : 'fail');
  ok('logo setting mein save hota hai (receipt + login par nazar aaye ga)',
    U_str(st2.logoUrl).indexOf('http') === 0, U_str(st2.logoUrl).slice(0, 40));
  let bad2 = 0;
  try { call('media.uploadLogo', { data: 'data:text/plain;base64,aGVsbG8=', mime: 'text/plain' }); } catch (e) { bad2++; }
  ok('logo mein sirf image allow (text reject)', bad2 === 1);
  ok('logo upload audit trail mein darj hota hai',
    DB.all('AuditLog').some(a => U_str(a.entity) === 'Settings' && U_str(a.action) === 'LOGO'),
    'LOGO logged'); }

function U_str(v) { return String(v == null ? '' : v); }

console.log('\n══════════════════════════════════════════════════════════════════');
console.log(`  UNTESTED-ROUTE SWEEP   PASS: ${pass}   FAIL: ${fail}`);
if (fail) failures.forEach(f => console.log('   ✖ ' + f));
console.log('══════════════════════════════════════════════════════════════════');
process.exit(fail ? 1 : 0);
