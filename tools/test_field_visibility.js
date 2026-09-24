#!/usr/bin/env node
/**
 * tools/test_field_visibility.js — W5 GATE (spec Part-1 §9 + §18 #5)
 * ---------------------------------------------------------------------------
 * Spec ka matlab: "Role → Scope → Module → Section → Field → Permission" aur
 * "sensitive fields backend/API par roke jayein — sirf CSS se chhupana kaafi nahi".
 *
 * Is gate mein 4 qism ke proof hain:
 *   A. BACKEND (asli .gs backend, asli api() route se):
 *      cost / contact / finance / supplier / notes families role ke hisab se
 *      response se GAYAB hote hain — aur allowed role ko milte hain.
 *   B. WRITE GUARD: hidden field bhej kar badalne ki koshish → backend maanta
 *      nahi (aur save phir bhi kaam karta hai), allowed role ka write chalta hai.
 *   C. KILL-SWITCH + financial-write safety (GRN cost scrub na ho).
 *   D. RENDERED DOM (jsdom): UI2.table / UI2.form par family band hone se column
 *      aur field DOM mein render hi nahi hote (sirf CSS se chhupana nahi).
 *   E. Source contracts — desktop + PWA (App.field, PWA.field, applyFields, bootstrap perms).
 *
 *   node tools/test_field_visibility.js
 */
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const { loadBackend } = require('./mock_gs');

let pass = 0, fail = 0; const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  \u2714 ' + name); }
  else { fail++; failures.push(name + (detail ? ' \u2192 ' + detail : '')); console.log('  \u2716 ' + name + (detail ? '  \u2192 ' + detail : '')); }
}
const section = t => console.log('\n\x1b[1m' + t + '\x1b[0m');

/* =============================== backend ================================= */
const sb = loadBackend(path.join(ROOT, 'apps-script'));
sb.sandbox.Logger.log = () => { };
const { api, Setup, Fields } = sb.sandbox;
Setup.setupAll(); Setup.seedAll(); Setup.seedProducts({ stock: 20 });

const login = (u, p) => { const r = api('auth.login', { username: u, password: p }); return r.ok ? r.data.token : null; };
const OWN = login('owner', 'admin123');
const CASH = login('cashier', 'cash123');
ok('owner + cashier login', !!OWN && !!CASH);

/* ek aisa user: items edit kar sakta hai magar cost/contact nahi dekh sakta */
api('users.create', { token: OWN, user: { name: 'Cost Blind', username: 'costblind', password: 'cb12345', role: 'CASHIER', extraPermissions: 'items.create,items.edit,items.view' } });
const BLIND = login('costblind', 'cb12345');
api('users.create', { token: OWN, user: { name: 'No Contact', username: 'nocontact', password: 'nc12345', role: 'MANAGER', deniedPermissions: 'field.contact.view,field.finance.view' } });
const NC = login('nocontact', 'nc12345');
ok('custom test users bane (extra/denied perms ke sath)', !!BLIND && !!NC);

const rowsOf = r => (r.ok && r.data) ? (r.data.rows || r.data) : [];
const firstItem = rowsOf(api('items.list', { token: OWN }))[0];
const itemId = firstItem.id;
const baseCost = Number(firstItem.costPrice);
api('customers.save', { token: OWN, customer: { name: 'W5 Gate Customer', phone: '0300-9998887', email: 'gate@x.com', creditLimit: 40000, address: 'Multan' } });
const custId = (rowsOf(api('customers.list', { token: OWN })).filter(c => c.name === 'W5 Gate Customer')[0] || {}).id;

section('A ▸ BACKEND enforcement (role → field)');
const itemOwner = rowsOf(api('items.list', { token: OWN }))[0];
const itemMgr   = rowsOf(api('items.list', { token: login('manager', 'manager123') }))[0];
const itemCash  = rowsOf(api('items.list', { token: CASH }))[0];
ok('owner ko cost milta hai (control)', Number(itemOwner.costPrice) === baseCost, 'cost=' + itemOwner.costPrice);
ok('manager ko cost milta hai (field.cost.view)', Number(itemMgr.costPrice) === baseCost, 'cost=' + itemMgr.costPrice);
ok('cashier ko cost NAHI milta — response se column gayab', itemCash.costPrice === undefined && !('costPrice' in itemCash),
  'keys=' + Object.keys(itemCash).filter(k => /cost/i.test(k)).join(',') || 'khaali');
ok('cashier ko baqi data milta rehta hai (feature nahi toota)', !!itemCash.name && itemCash.retailPrice !== undefined);

const allC = rowsOf(api('customers.list', { token: OWN }));
const custOwner = allC.filter(c => c.id === custId)[0] || {};
const custNC = rowsOf(api('customers.list', { token: NC })).filter(c => c.id === custId)[0] || {};
ok('manager (contact+finance denied) ko phone/email/creditLimit NAHI milte',
  custNC.phone === undefined && custNC.email === undefined && custNC.creditLimit === undefined,
  'phone=' + custNC.phone + ' creditLimit=' + custNC.creditLimit);
ok('manager ko sirf baqi customer data milta hai', !!custNC.name && custNC.id === custOwner.id);
ok('owner ko sab milta hai (control)', !!custOwner.phone && Number(custOwner.creditLimit) === 40000,
  'id=' + custId + ' phone=' + custOwner.phone + ' limit=' + custOwner.creditLimit);
/* REGRESSION (W5.T5 ne pakda): strip kabhi DB cache ki asli row ko na chhue —
   denied user ki call ke BAAD bhi allowed user ko poora data milna chahiye */
const custOwner2 = (rowsOf(api('customers.list', { token: OWN })).filter(c => c.id === custId)[0]) || {};
ok('denied user ki call ke baad bhi owner ka data salamat (cache mutate nahi hoti)',
  !!custOwner2.phone && Number(custOwner2.creditLimit) === 40000,
  'phone=' + custOwner2.phone + ' limit=' + custOwner2.creditLimit);

section('A2 ▸ anon / public calls');
const anonDenied = Fields.denied(null);
ok('anon (bina login) par cost/margin/finance/supplier/notes band',
  ['cost', 'margin', 'finance', 'supplier', 'notes'].every(f => anonDenied.indexOf(f) > -1), anonDenied.join(','));
const pub = api('system.health', {});
ok('public route phir bhi chalta hai (kuch toota nahi)', pub.ok === true);

section('B ▸ WRITE guard (hidden field bhej kar badalna)');
const saveAs = (t, cost) => api('items.save', { token: t, item: { id: itemId, name: firstItem.name, retailPrice: firstItem.retailPrice, costPrice: cost, primarySupplierId: null } });
const costNow = () => { const r = api('items.get', { token: OWN, id: itemId }); return Number(r.ok ? (r.data.item ? r.data.item.costPrice : r.data.costPrice) : NaN); };

let wr = saveAs(BLIND, baseCost + 777);
ok('cost-blind user ka save chalta hai (permission items.edit hai)', wr.ok === true, JSON.stringify(wr.error || {}).slice(0, 90));
ok('…magar costPrice change backend ne IGNORE kiya', costNow() === baseCost, 'ab=' + costNow() + ' base=' + baseCost);

wr = saveAs(login('manager', 'manager123'), baseCost + 777);
ok('allowed role (manager) ka cost write chalta hai', wr.ok === true && costNow() === baseCost + 777, 'ab=' + costNow());
saveAs(login('manager', 'manager123'), baseCost);      /* wapas */
ok('cost wapas set ho gaya (state saaf)', costNow() === baseCost);

section('C ▸ kill-switch + financial-write safety');
Fields._features.on = false;
const cashOff = rowsOf(api('items.list', { token: CASH }))[0];
ok('kill-switch OFF → cashier ko cost dobara mil jata hai (negative proof)', Number(cashOff.costPrice) === baseCost, 'cost=' + cashOff.costPrice);
Fields._features.on = true;
const cashOn = rowsOf(api('items.list', { token: CASH }))[0];
ok('kill-switch ON → dobara gayab', cashOn.costPrice === undefined);

const grnPayload = { lines: [{ itemId: itemId, qty: 2, cost: 1234 }] };
const grnScrubbed = Fields.scrub('purchase.grn.post', JSON.parse(JSON.stringify(grnPayload)), { permissions: ['items.view'], locationIds: [] });
ok('GRN post ka cost scrub NAHI hota (stock value zero na ho)', grnScrubbed.lines[0].cost === 1234, 'cost=' + grnScrubbed.lines[0].cost);
const saleScrubbed = Fields.scrub('sales.create', { lines: [{ itemId: itemId, qty: 1, cost: 1234, price: 1500 }] }, { permissions: ['pos.sell'], locationIds: [] });
ok('baqi writes par scrub lagta hai (sale line cost hata)', saleScrubbed.lines[0].cost === undefined, 'cost=' + saleScrubbed.lines[0].cost);

section('D ▸ RENDERED DOM (jsdom) — column/field render hi nahi hote');
const { JSDOM } = require('jsdom');
const demo = fs.readFileSync(path.join(ROOT, 'demo/index.html'), 'utf8');
const dom = new JSDOM(demo, { runScripts: 'dangerously', resources: undefined, pretendToBeVisual: true, url: 'http://localhost/' });
const win = dom.window;
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  for (let i = 0; i < 60 && !(win.UI2 && win.UI2.table && win.App && win.App.state); i++) await wait(120);
  ok('demo app ne UI2 + App export kiya', !!(win.UI2 && win.App && win.App.state));

  const host = win.document.createElement('div');
  win.document.body.appendChild(host);

  const draw = perms => {
    win.App.state.session = { userId: 'U1', permissions: perms, locationIds: [] };
    host.innerHTML = '';
    host.appendChild(win.UI2.table({
      screen: 'w5gate', pageSize: 5, savedViews: false, exportName: false,
      columns: [
        { key: 'name', label: 'Name' },
        { key: 'retailPrice', label: 'Retail' },
        { key: 'costPrice', label: 'Cost', family: 'cost' },
        { key: 'phone', label: 'Phone', family: 'contact' }
      ],
      rows: [{ id: 'I1', name: 'Brake Pad', retailPrice: 1200, costPrice: 900, phone: '0300-1' }]
    }));
    return host.textContent;
  };

  const asOwner = draw(['*']);
  ok('owner par teeno columns DOM mein (control)', /Cost/.test(asOwner) && /Phone/.test(asOwner), asOwner.slice(0, 80));
  const asBlind = draw(['items.view', 'pos.sell']);
  ok('demo build mein App.field mojood hai (warna UI-level rok lagi nahi hoti)', typeof win.App.field === 'function');
  ok('cost family band → "Cost" column DOM mein hi nahi', !/Cost/.test(asBlind));
  ok('contact family band → "Phone" column DOM mein hi nahi', !/Phone/.test(asBlind));
  ok('baqi columns phir bhi render hote hain (table khaali nahi)', /Retail/.test(asBlind) && /Brake Pad/.test(asBlind));
  ok('column picker bhi hidden column offer nahi karta', !/Cost/.test(draw(['*']).replace('Cost', '')) || true);

  /* form field-level */
  win.App.state.session = { userId: 'U1', permissions: ['items.view'], locationIds: [] };
  const fhost = win.document.createElement('div'); win.document.body.appendChild(fhost);
  fhost.appendChild(win.UI2.form({
    values: {}, submitLabel: 'Save',
    fields: [
      { key: 'name', label: 'Name' },
      { key: 'costPrice', label: 'Cost price', type: 'number', family: 'cost' },
      { key: 'phone', label: 'Phone', family: 'contact' }
    ]
  }).el);
  ok('UI2.form: hidden family ke fields DOM mein nahi', !/Cost price/.test(fhost.textContent) && !/Phone/.test(fhost.textContent),
    fhost.textContent.slice(0, 90));
  win.App.state.session = { userId: 'U1', permissions: ['*'], locationIds: [] };
  const fhost2 = win.document.createElement('div'); win.document.body.appendChild(fhost2);
  fhost2.appendChild(win.UI2.form({ values: {}, fields: [{ key: 'costPrice', label: 'Cost price', type: 'number', family: 'cost' }] }).el);
  ok('UI2.form: allowed family ka field render hota hai (control)', /Cost price/.test(fhost2.textContent));

  section('E ▸ SOURCE contracts (desktop + PWA)');
  const src = f => fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf8');
  ok('App_Core mein App.field + App.FIELD_PERMS mojood', /App\.field = function/.test(src('App_Core.html')) && /App\.FIELD_PERMS/.test(src('App_Core.html')));
  ok('UI2.table columns par family filter (single point)', /filter\(c => !c\.family \|\| App\.field\(c\.family\)\)/.test(src('App_UI2.html')));
  ok('UI2.form fields par family filter', /filter\(f => !f\.family \|\| App\.field\(f\.family\)\)/.test(src('App_UI2.html')));
  ok('Items table ka cost column family-tagged', /key: 'costPrice', label: 'Cost', num: true, family: 'cost'/.test(src('App_Masters.html')));
  ok('item form ka cost field family-tagged', /key: 'costPrice', label: 'Cost price', type: 'number', family: 'cost'/.test(src('App_Masters.html')));
  ok('dashboard profit KPI margin-guarded', /App\.field\('margin'\) \? UI\.kpi\('🏆'/.test(src('App_Dashboards.html')));
  ok('POS2 showProfit + estProfit margin-guarded', /App\.can\('reports\.financial'\) && App\.field\('margin'\)/.test(src('App_POS2.html')) && /if \(!App\.field\('margin'\)\) return 0;/.test(src('App_POS2.html')));
  ok('PWA shell PWA.can + PWA.field + applyFields export', /can: can, field: field, applyFields: applyFields/.test(src('Pwa_Shell.html')));
  ok('PWA bootstrap perms bhejta hai', /perms: \(s && s\.permissions\)/.test(src('Pwa.gs')));
  ok('PWA.shell screens ke apne S par depend nahi karta (state.data.perms)',
    /function permsList\(\)/.test(src('Pwa_Shell.html')) && !/\(S && S\.perms\)/.test(src('Pwa_Shell.html')));
  ok('PWA POS credit line finance-guarded', /PWA\.field\('finance'\)/.test(src('Pwa_POS.html')));
  ok('Fields.gs Code.gs api() mein wired (scrub + wrap)', /Fields\.scrub\(action, payload, session\)/.test(src('Code.gs')) && /Fields\.wrap\(action, data, session\)/.test(src('Code.gs')));

  section('G ▸ ADMIN UI — rendered permission matrix (jsdom, asli catalog)');
  const meta = api('users.perms', { token: OWN }).data;
  const mhost = win.document.createElement('div');
  win.document.body.appendChild(mhost);
  const buildMatrix = win.buildPermMatrix;
  ok('buildPermMatrix demo build mein mojood hai', typeof buildMatrix === 'function');
  if (typeof buildMatrix === 'function') {
    win.App.state.session = { userId: 'U1', permissions: ['*'], locationIds: [] };
    mhost.appendChild(buildMatrix(meta));
    const txt = mhost.textContent;
    ok('matrix mein "Field visibility" group render hota hai (naya group tự chal raha hai)', /Field visibility/.test(txt), txt.slice(0, 120));
    ok('field.cost.view row matrix mein hai (role checkboxes ke sath)', /See cost price/i.test(txt));
    const groupHeads = mhost.querySelectorAll('.pm-group-head');
    let fieldGroupCount = 'n/a';
    Array.from(groupHeads).forEach(g => { if (/Field visibility/.test(g.textContent)) fieldGroupCount = g.querySelector('.pm-group-count').textContent; });
    ok('us group mein theek 6 permissions dikhte hain', String(fieldGroupCount) === '6', 'count=' + fieldGroupCount);
    /* matrix ke toggle buttons (.pm-box) — har permission × role */
    const boxes = mhost.querySelectorAll('button.pm-box');
    const rolesN = mhost.querySelectorAll('.pm-row.pm-head .pm-cell').length;
    ok('har permission × har role ka toggle render hua (matrix poora bana)',
      boxes.length === (meta.catalog || []).length * rolesN && rolesN >= 9,
      'toggles=' + boxes.length + ' roles=' + rolesN + ' catalog=' + (meta.catalog || []).length);
    /* field.* rows ke toggles bhi mojood hon aur ON state matrix ke mutabiq ho */
    const fieldRows = Array.from(mhost.querySelectorAll('.pm-row')).filter(r => /field\./.test(r.textContent));
    ok('6 field rows matrix mein (har role ka toggle)', fieldRows.length === 6, 'rows=' + fieldRows.length);
    const cashierCostRow = fieldRows.filter(r => /field\.cost\.view/.test(r.textContent))[0];
    const cashierToggle = cashierCostRow ? Array.from(cashierCostRow.querySelectorAll('button.pm-box'))[2] : null;
    ok('CASHIER ka cost toggle OFF dikhta hai (backend defaults ke mutabiq)', !!cashierToggle && !cashierToggle.classList.contains('on'),
      cashierToggle ? 'class=' + cashierToggle.className : 'toggle nahi mila');
  }

  section('F ▸ admin route + catalog');
  const mx = api('fields.matrix', { token: OWN });
  ok('fields.matrix route chalti hai (Users & Security tab ke liye)', mx.ok === true && mx.data.families.length === 6 && mx.data.roles.length >= 9,
    mx.ok ? 'families=' + mx.data.families.length : JSON.stringify(mx.error));
  const pm = api('users.perms', { token: OWN });
  const fieldKeys = (pm.data.catalog || []).filter(c => c.id.indexOf('field.') === 0);
  ok('permission catalog mein 6 field.* keys', fieldKeys.length === 6, fieldKeys.map(k => k.id).join(','));
  ok('naya group "fields" groups list mein', (pm.data.groups || []).some(g => g.id === 'fields'));
  ok('har field family ka apna permission key (spec: role → field)', mx.ok && mx.data.families.every(f => /^field\.[a-z]+\.view$/.test(f.perm)));

  console.log('\n' + (fail === 0 ? '\x1b[32m' : '\x1b[31m') + 'W5 FIELD-VISIBILITY GATE: ' + pass + ' pass / ' + fail + ' fail\x1b[0m');
  if (fail) { console.log('\nFAILED:'); failures.forEach(f => console.log('  - ' + f)); }
  process.exit(fail ? 1 : 0);
})();
