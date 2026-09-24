#!/usr/bin/env node
'use strict';
/**
 * tools/diag_fresh_install.js — READ-ONLY diagnosis (T2/T3).
 *
 * User ka asli flow dohraate hain (mocked Apps Script runtime mein):
 *   fresh DB → setupAll() → login(owner) → items.list / inventory / customers
 * aur dekhte hain kaunsi cheez khaali/throw karti hai — guess ke baghair.
 *
 *   node tools/diag_fresh_install.js
 */
const path = require('path');
const { loadBackend } = require('./mock_gs');
const DIR = path.join(__dirname, '..', 'apps-script');
const { sandbox: s } = loadBackend(DIR);

const line = (t) => console.log('\n=== ' + t + ' ===');
function tryCall(label, fn) {
  try {
    const r = fn();
    let shape;
    if (Array.isArray(r)) shape = 'array(' + r.length + ')';
    else if (r && typeof r === 'object') shape = 'object keys=' + Object.keys(r).slice(0, 6).join(',') + (r.rows ? ' rows=' + r.rows.length + ' total=' + r.total : '');
    else shape = String(r).slice(0, 60);
    console.log('  ✔ ' + label + ' → ' + shape);
    return { ok: true, r };
  } catch (e) {
    console.log('  ✖ ' + label + ' → THREW: ' + e.message);
    return { ok: false, e };
  }
}

line('1) fresh setupAll()');
const r = s.setupAll();
console.log('  complete=' + r.complete + ' phase=' + (r.phase || '-') + ' url=' + (r.url || '-'));
if (r.seedCounts) console.log('  seedCounts=' + JSON.stringify(r.seedCounts));

line('2) table counts after setup');
['Items', 'Customers', 'Suppliers', 'Stock', 'Locations', 'Users', 'Groups', 'Settings', 'ShopSessions'].forEach(t => {
  try { console.log('  ' + t + ': ' + s.DB.count(t) + ' rows'); } catch (e) { console.log('  ' + t + ': THREW ' + e.message); }
});

line('3) login as owner');
let session = null;
try {
  const res = s.Auth.login ? s.Auth.login({ username: 'owner', password: 'admin123' }) : null;
  session = res && (res.session || res);
  console.log('  login → ' + JSON.stringify(Object.keys(res || {})).slice(0, 120));
  console.log('  permissions: ' + JSON.stringify((session && session.permissions || []).slice(0, 8)) + ((session && session.permissions || []).length > 8 ? ' …' : ''));
} catch (e) { console.log('  ✖ login threw: ' + e.message); }

line('4) routes par fresh DB (user ki shikayat: items/inventory blank)');
if (session) {
  tryCall('items.list', () => s.api('items.list', { pageSize: 0, withStock: true }, session));
  tryCall('items.search', () => s.api('items.search', { q: '', limit: 25 }, session));
  tryCall('customers.list', () => s.api('customers.list', { limit: 25 }, session));
  tryCall('stock.list', () => s.api('stock.list', {}, session));
  tryCall('inventory.list', () => s.api('inventory.list', {}, session));
}

line('5) demo data seeding functions');
['seedDemoItems', 'seedDemoData', 'seedDemoCustomer'].forEach(fn => {
  console.log('  Setup.' + fn + ': ' + (typeof s.Setup[fn] === 'function' ? 'MOJOOD' : 'GAYAB'));
});

line('6) shop open/close surface');
['ShopSessions', 'Sessions', 'DayReports', 'Shifts'].forEach(t => {
  const inSchema = !!(s.SCHEMA && s.SCHEMA[t]);
  console.log('  schema[' + t + ']: ' + (inSchema ? 'MOJOOD (' + s.SCHEMA[t].length + ' cols)' : 'GAYAB'));
});
['shop.open', 'shop.close', 'shop.status', 'session.open', 'session.status'].forEach(act => {
  const has = !!(s.ROUTES && s.ROUTES[act]) || false;
  console.log('  route ' + act + ': ' + (has ? 'MOJOOD' : (s.ROUTES ? 'GAYAB' : '(ROUTES export nahi)')));
});
console.log('  sandbox keys: ' + Object.keys(s).filter(k => /shop|session|day|report/i.test(k)).join(', '));
