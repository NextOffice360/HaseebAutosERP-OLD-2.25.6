/**
 * tools/test_partial_save.js — v2.30.0 gate (N1/N2 deep audit — app-wide)
 * ============================================================================
 * User ki shikayat: "Save / Save All ab bhi reliable nahi. Ek cheez badlo, save
 * karo — doosri values reset ho jati hain (jaise Inventory=ON, POS=ON, WhatsApp=OFF
 * → sirf WhatsApp ON karo → save → teeno reset)."
 *
 * Ye gate har save endpoint par WAHI cheez parkhta hai (asli `.gs` code par):
 *   ① poora record save karo (booleans true/false, numbers, empty strings, JSON)
 *   ② sirf EK field badal kar PARTIAL save bhejo
 *   ③ sab fields dobara read karo → jo nahi bheja woh bilkul waisa hi ho
 *      (false / 0 / '' / null bhi "missing" nahi samjhe jayein)
 *   ④ fresh read (DB cache bypass) = "refresh" ke baad wahi values
 *   ⑤ record ghayab na ho, na default values aa jayein
 *
 *   node tools/test_partial_save.js      (~10s, sab asli backend functions)
 */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { loadBackend } = require('./mock_gs');
const { sandbox: s } = loadBackend(path.join(ROOT, 'apps-script'));
let pass = 0, fail = 0; const ERR = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✔', name); }
  else { fail++; const m = '  ✖ ' + name + (extra ? '  → ' + extra : ''); ERR.push(name); console.log(m); }
}

s.setupAll();
const login = s.api('auth.login', { username: 'owner', password: 'admin123' });
if (!login.ok) { console.log('login fail'); process.exit(1); }
const TOKEN = login.data.token;
const api = (a, p) => {
  const r = s.api(a, Object.assign({ token: TOKEN }, p || {}));
  if (!r || !r.ok) throw new Error(a + ': ' + ((r && r.error && r.error.message) || 'fail'));
  return r.data;
};
const U_num = v => Number(v === undefined || v === '' ? 0 : v);
const S = login.data.session;
const FRESH = (t, id) => s.DB.all(t, true).filter(r => r.id === id)[0] || null;
const eq = (a, b) => String(a === undefined ? '' : a) === String(b === undefined ? '' : b);

/** case chalane wala generic engine */
function audit(c) {
  console.log('\n\x1b[1m' + c.title + '\x1b[0m');
  let id;
  try {
    const created = c.create();
    id = c.idOf(created);
    ok(!!id, '① record bana (naya save)', String(id));
  } catch (e) { ok(false, '① record bana', e.message); return; }

  const full = FRESH(c.table, id);
  const cols = s.SCHEMA[c.table] || [];
  const wanted = c.keep.filter(k => cols.indexOf(k) > -1);
  const notInSchema = c.keep.filter(k => cols.indexOf(k) === -1);
  const keep = {};
  wanted.forEach(k => { keep[k] = full[k]; });
  ok(wanted.every(k => full[k] !== undefined), '② saare test fields store hue',
    wanted.filter(k => full[k] === undefined).join(',') || wanted.length + ' fields (schema: ' + cols.length + ')');
  if (notInSchema.length) console.log('   ↳ note: schema mein nahi (assert nahi kiya): ' + notInSchema.join(', '));

  /* partial save: sirf ek field */
  try { api(c.save, c.partial(id)); } catch (e) { ok(false, '③ partial save chala', e.message); return; }
  const after = FRESH(c.table, id);
  ok(!!after, '③ record partial save ke baad mojood hai (ghayab nahi hua)');
  ok(eq(after[c.change], c.changeTo), '④ badla gaya field update hua', JSON.stringify({ got: after[c.change], want: c.changeTo }));

  const broken = wanted.filter(k => k !== c.change && !eq(after[k], keep[k]));
  ok(broken.length === 0, '⑤ baqi saare fields bilkul waisay hi (chhua bhi nahi gaya)',
    broken.map(k => k + ': ' + JSON.stringify(keep[k]) + ' → ' + JSON.stringify(after[k])).join(' · ') || wanted.length + ' fields ✔');

  /* refresh = wahi values */
  const reread = (c.read ? c.read(id) : FRESH(c.table, id)) || {};
  const drift = wanted.filter(k => !eq(String(reread[k]).toLowerCase(), String(after[k]).toLowerCase()));
  ok(drift.length === 0, '⑥ refresh/reload ke baad wahi values', drift.join(',') || '✔');

  /* "missing" field ko default nahi banana chahiye */
  if (c.neverSet) {
    const ns = c.neverSet.keys.map(k => ({ k: k, v: after[k] }));
    const defaults = ns.filter(x => String(x.v) === String(c.neverSet.badDefault));
    ok(defaults.length === 0, '⑦ jo field kabhi set hi nahi hua woh default (' + c.neverSet.badDefault + ') nahi ban gaya',
      defaults.map(x => x.k).join(',') || ns.length + ' fields ✔');
  }
}

/* ============================ ITEMS ====================================== */
audit({
  title: 'items.save — Items (masters)',
  table: 'Items',
  create: () => api('items.save', { item: { code: 'GATE-PS-1', name: 'Partial Save Item', unit: 'PCS',
    retailPrice: 1234.56, costPrice: 900.25, minStock: 0, reorderLevel: 0, rack: '', notes: 'keep-me',
    trackSerial: 'true', hasExpiry: 'false', favourite: true, status: 'ACTIVE' } }),
  idOf: r => r.id,
  save: 'items.save',
  partial: id => ({ item: { id: id, retailPrice: 1500 } }),
  change: 'retailPrice', changeTo: 1500,
  keep: ['code', 'name', 'unit', 'costPrice', 'minStock', 'reorderLevel', 'rack', 'notes', 'trackSerial', 'hasExpiry', 'favourite', 'status'],
  read: id => (api('items.get', { id: id }) || {}).raw || {}   /* projection chhota hai, asli row .raw mein */
});

/* ========================== CUSTOMERS ==================================== */
audit({
  title: 'customers.save — Customers',
  table: 'Customers',
  create: () => api('customers.save', { customer: { name: 'Gate Partial Customer', phone: '0300-1234567',
    address: '', creditLimit: 50000, openingBalance: 0, active: true, notes: 'keep-cust', customFields: '{"cf_x":"1"}' } }),
  idOf: r => r.id,
  save: 'customers.save',
  partial: id => ({ customer: { id: id, phone: '0301-7654321' } }),
  change: 'phone', changeTo: '0301-7654321',
  keep: ['name', 'address', 'creditLimit', 'openingBalance', 'active', 'notes', 'customFields']
});

/* ========================== SUPPLIERS ==================================== */
audit({
  title: 'suppliers.save — Suppliers',
  table: 'Suppliers',
  create: () => api('suppliers.save', { supplier: { name: 'Gate Partial Supplier', phone: '0300-2222222',
    ntn: '9999999-1', creditLimit: 0, paymentTerms: '', active: false, notes: 'keep-sup' } }),
  idOf: r => r.id,
  save: 'suppliers.save',
  partial: id => ({ supplier: { id: id, ntn: '1111111-2' } }),
  change: 'ntn', changeTo: '1111111-2',
  keep: ['name', 'phone', 'creditLimit', 'paymentTerms', 'active', 'notes']
});

/* ============================ USERS ====================================== */
audit({
  title: 'users.update — Users (RBAC/staff)',
  table: 'Users',
  create: () => api('users.create', { user: { username: 'gateuser1', password: 'GatePass123', fullName: 'Gate User',
    role: 'CASHIER', groupId: '', active: true, phone: '0300-0000001' } }),
  idOf: r => r.id,
  save: 'users.update',
  partial: id => ({ id: id, patch: { fullName: 'Gate User Renamed' } }),
  change: 'fullName', changeTo: 'Gate User Renamed',
  keep: ['username', 'role', 'active', 'phone']
});

/* =========================== LOCATIONS =================================== */
audit({
  title: 'locations.save — Branches',
  table: 'Locations',
  create: () => api('locations.save', { location: { name: 'Gate Branch', address: 'Gate Road',
    phone: '061-111', active: true, isWarehouse: false, notes: 'keep-loc' } }),
  idOf: r => r.id,
  save: 'locations.save',
  partial: id => ({ location: { id: id, phone: '061-999' } }),
  change: 'phone', changeTo: '061-999',
  keep: ['name', 'address', 'active', 'isWarehouse', 'notes', 'phone']
});

/* ==================== SETTINGS (user ka exact example) =================== */
console.log('\n\x1b[1mconfig.save — Settings (user ka asli scenario)\x1b[0m');
api('config.save', { values: { 'mod.pos': true, 'mod.inventory': true, 'comms.whatsapp': false } });
const readSet = () => {
  const st = s.DB.settings(true);
  return { pos: String(st['mod.pos']), inv: String(st['mod.inventory']), wa: String(st['comms.whatsapp']) };
};
const before = readSet();
ok(before.pos === 'true' && before.inv === 'true' && before.wa === 'false', '① shuru mein POS=ON · Inventory=ON · WhatsApp=OFF', JSON.stringify(before));
api('config.save', { values: { 'comms.whatsapp': true } });
const after = readSet();
ok(after.wa === 'true', '② sirf WhatsApp ON hua', JSON.stringify(after));
ok(after.pos === 'true' && after.inv === 'true', '③ POS aur Inventory ON hi rahe (yehi asli bug tha)',
  JSON.stringify({ pos: after.pos, inv: after.inv }));
/* booleans: false bhi "missing" nahi samjha jaye */
api('config.save', { values: { 'comms.whatsapp': false } });
ok(readSet().wa === 'false' && readSet().pos === 'true', '④ false save karna bhi kaam karta hai (missing na samjha jaye)', JSON.stringify(readSet()));
/* unknown/garbage keys kisi doosri key ko na chhuein */
const sentinel = readSet();
api('config.save', { values: { 'gate.unknownKey': 'x' } });
ok(readSet().pos === sentinel.pos && readSet().inv === sentinel.inv, '⑤ anjaani key save karne se baqi values safe', JSON.stringify(readSet()));

/* ================== MULTI-SECTION SAVE (SAVE ALL jaisa) ================== */
console.log('\n\x1b[1mSAVE ALL — ek hi call mein do sections, baqi untouched\x1b[0m');
const snap = s.DB.settings(true);
const beforeAll = { pos: String(snap['mod.pos']), inv: String(snap['mod.inventory']), wa: String(snap['comms.whatsapp']), rep: String(snap['mod.reports']) };
api('config.save', { values: { 'mod.reports': true, 'mod.purchase': true } });
const now = s.DB.settings(true);
ok(String(now['mod.reports']) === 'true' && String(now['mod.purchase']) === 'true', '① dono sections save hue');
ok(String(now['mod.pos']) === beforeAll.pos && String(now['mod.inventory']) === beforeAll.inv && String(now['comms.whatsapp']) === beforeAll.wa,
  '② baqi saari settings bilkul waisi hi', JSON.stringify({ pos: now['mod.pos'], inv: now['mod.inventory'], wa: now['comms.whatsapp'] }));

/* ================== PART 1b — concurrent / stale writes ================== */
/* Do users (ya do tabs) ek hi record ke ALAG fields badalte hain. Purana stale
   copy poora record bhejta hi nahi (sirf apni badli hui key) — is liye doosre
   ki tabdeeli zaya nahi honi chahiye. Yehi "concurrent saves" ka asli risk hai. */
console.log('\n\x1b[1mPART 1b — do users ek hi record (stale write safe?)\x1b[0m');
{
  /* --- item: user A notes, user B minStock (dono ne purana copy load kiya tha) --- */
  const it = api('items.save', { item: { name: 'Gate Concurrent Item', unit: 'PCS', notes: 'A: started', minStock: 1, retailPrice: 100 } });
  const copyA = api('items.get', { id: it.id }).raw;          /* dono ne yahi dekha */
  const copyB = api('items.get', { id: it.id }).raw;

  api('items.save', { item: { id: it.id, notes: 'A: changed note', name: copyA.name, unit: copyA.unit } });
  api('items.save', { item: { id: it.id, minStock: 77 } });           /* B ka stale save */
  const row = s.DB.byId('Items', it.id);
  ok(row.notes === 'A: changed note' && U_num(row.minStock) === 77,
    '① dono tabdeeliyan bachi rahin (A ki notes + B ka minStock)', JSON.stringify({ notes: row.notes, minStock: row.minStock }));
  ok(row.code === it.code && row.barcode === it.barcode,
    '② kisi bhi save se code/barcode dobara generate nahi hua', JSON.stringify({ code: row.code, barcode: row.barcode }));

  /* --- settings: do "tabs" alag keys (stale settings object) --- */
  api('config.save', { values: { 'mod.pos': true } });
  api('config.save', { values: { 'comms.whatsapp.provider': 'LINK' } });
  const st = s.DB.all('Settings');
  const val = k => (st.find(r => r.key === k) || {}).value;
  ok(String(val('mod.pos')) === 'true' && String(val('comms.whatsapp.provider')) === 'LINK',
    '③ alag tabs ke settings saves ne ek doosre ko nahi mitaya', JSON.stringify({ pos: val('mod.pos'), wa: val('comms.whatsapp.provider') }));

  /* --- rapid repeated writes: kya koi write doosre ko kha jata hai? --- */
  const many = {};
  ['rack', 'warranty', 'subCategory'].forEach((k, n) => { many[k] = 'RC-' + n; api('items.save', { item: Object.assign({ id: it.id }, { [k]: many[k] }) }); });
  const row2 = s.DB.byId('Items', it.id);
  ok(Object.keys(many).every(k => String(row2[k]) === String(many[k])),
    '④ 5 tez saves ke baad saare fields salamat (koi write doosre ko kha gaya)',
    JSON.stringify(many) + ' → ' + JSON.stringify({ rack: row2.rack, warranty: row2.warranty, sub: row2.subCategory }));

  /* --- business rule intact: shop band ho to sale ruke (aur error saaf ho) --- */
  let shopErr = '';
  try { api('sales.create', { sale: { customerName: 'Gate Concurrent', walkIn: true, items: [{ itemId: it.id, qty: 1, rate: 100 }], paid: 100, method: 'CASH' } }); }
  catch (e) { shopErr = String(e.message || e); }
  ok(/shop/i.test(shopErr), '⑤ shop band hone par sale rukti hai (business rule barqarar)', shopErr.slice(0, 60) || 'sale chal gayi!');
}


/* ========================= PART 2 — rendered DOM ========================== */
/* Jo partial-save paths backend audit mein TOOTAY hue nikle, ab ASLI UI se check:
   Item detail ▸ Barcode tab ▸ "🎲 Generate new"  →  items.save({id, barcode})
   (pehle ye hamesha "Item name zaroori hai" error deta tha, aur agar chalta to
    item ka CODE bhi naya bana deta tha — dono ka assert). */
(async () => {
  const puppeteer = require('puppeteer');
  const TARGET = process.argv[2] || ('file://' + path.join(ROOT, 'demo', 'index.html'));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
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
  await sleep(1600);
  console.log('\n\x1b[1mPART 2 — rendered DOM: partial save (Items screen) + Save All baar\x1b[0m');

  const before = await page.evaluate(async () => {
    const r = await API.call('items.list', {}, { offlineFallback: () => ({ rows: [] }) });
    const rows = Array.isArray(r) ? r : (r.rows || []);
    const it = rows[0] || {};
    return { id: it.id, code: it.code, barcode: it.barcode, name: it.name, price: it.retailPrice };
  });
  ok(!!before.id, '① Items list se pehla item mila (rendered DOM se pehle backend truth)', before.code + ' / ' + before.barcode);
  await page.evaluate(id => App.go('items', { open: id }), before.id);
  await sleep(1800);

  /* Barcode tab ka "Generate new" → items.save({id, barcode}) — purana toota path */
  const res = await page.evaluate(async () => {
    const tabs = Array.from(document.querySelectorAll('.tab'));
    let btn = Array.from(document.querySelectorAll('button')).find(b => /generate new/i.test(b.textContent || ''));
    if (!btn) {
      for (const t of tabs) {
        t.click();
        await new Promise(r => setTimeout(r, 450));
        btn = Array.from(document.querySelectorAll('button')).find(b => /generate new/i.test(b.textContent || ''));
        if (btn) break;
      }
    }
    if (!btn) return { err: '"Generate new" button nahi mila (tabs: ' + tabs.map(t => (t.textContent || '').trim()).join('|') + ')' };
    btn.click();
    await new Promise(r => setTimeout(r, 1600));
    return { clicked: true };
  });
  ok(!res.err, '② Barcode tab ▸ "🎲 Generate new" dabaya (purana toota partial-save path)', res.err || 'clicked');
  await sleep(500);
  const after = await page.evaluate(async (id) => {
    const r = await API.call('items.get', { id: id }, { offlineFallback: () => null }).catch(() => null);
    const raw = (r && r.raw) || r || {};
    return { code: raw.code, barcode: raw.barcode, name: raw.name, price: raw.retailPrice };
  }, before.id);
  ok(after.barcode && after.barcode !== before.barcode,
    '③ partial save ne barcode update kiya (silent fail khatam)', JSON.stringify({ was: before.barcode, now: after.barcode }));
  ok(after.code === before.code && after.name === before.name && String(after.price) === String(before.price),
    '④ baqi fields safe: CODE naya generate NAHI hua, name/price wahi (data-corruption fix)',
    JSON.stringify({ codeWas: before.code, codeNow: after.code, name: after.name }));

  /* Settings SAVE ALL dobara — sirf dirty keys */
  await page.evaluate(() => App.go('settings', { tab: 'modules' }));
  await page.waitForFunction(() => document.querySelectorAll('.tabbar-l1 .tab').length >= 14, { timeout: 20000 });
  await sleep(1200);
  const sa = await page.evaluate(async () => {
    const sw = Array.from(document.querySelectorAll('input[type=checkbox]')).find(c => c.id.indexOf('mod.') > -1);
    if (!sw) return { err: 'switch nahi mila' };
    const before = sw.checked;
    sw.checked = !before; sw.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 400));
    const btn = Array.from(document.querySelectorAll('button')).find(b => /save all/i.test(b.textContent || ''));
    if (!btn) return { err: 'Save all button nahi mila' };
    btn.click();
    await new Promise(r => setTimeout(r, 2200));
    const st = await API.call('system.settings.get', {}, { noCache: true }).catch(() => ({}));
    return { key: sw.id.replace('f_', ''), want: String(sw.checked), got: String(st[sw.id.replace('f_', '')]) };
  });
  ok(!sa.err && sa.got === sa.want, '⑥ SAVE ALL ne switch ki value theek save ki', sa.err || JSON.stringify(sa));
  ok(errs.length === 0, '⑦ zero page errors', errs.slice(0, 3).join(' | ') || '0');

  await browser.close();
  console.log('\n\x1b[1mSUMMARY:\x1b[0m ' + pass + ' pass · ' + fail + ' fail · ' + (fail ? '\x1b[31mRED\x1b[0m' : '\x1b[32mGREEN\x1b[0m'));
  if (fail) { console.log(ERR.map(e => ' - ' + e).join('\n')); process.exit(1); }
})();
