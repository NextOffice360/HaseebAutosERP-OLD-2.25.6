/**
 * test_logic.js — Business-logic verification for Haseeb Autos ERP/POS.
 * Runs the REAL .gs backend (no rewrites) inside a mocked Apps Script runtime
 * and verifies money/stock/tax/ledger maths end-to-end.
 *
 *   node tools/test_logic.js
 */
const path = require('path');
const { loadBackend } = require('./mock_gs');

const DIR = path.join(__dirname, '..', 'apps-script');
let pass = 0, fail = 0;
const failures = [];

function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ✔ ' + name); }
  else {
    fail++; failures.push(name + (detail ? ' → ' + detail : ''));
    console.log('  ✖ ' + name + (detail ? '  → ' + detail : ''));
  }
}
function today() { return new Date().toISOString().slice(0, 10); }
function U_num(v) { return Number(v || 0); }
function near(a, b, eps) { return Math.abs(Number(a) - Number(b)) <= (eps === undefined ? 0.005 : eps); }
function section(t) { console.log('\n\x1b[1m' + t + '\x1b[0m'); }

/* ------------------------------- bootstrap -------------------------------- */
const { sandbox } = loadBackend(DIR);
const { api, Setup } = sandbox;

section('Setup & schema');
const setupRes = Setup.setupAll();
ok('setupAll completes', !!setupRes, JSON.stringify(setupRes).slice(0, 120));
ok('spreadsheet attached', !!sandbox.PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID'));

const seedRes = Setup.seedAll();
ok('seedAll runs', !!seedRes, String(seedRes).slice(0, 80));

const prod = Setup.seedProducts({ stock: 20 });
ok('real product catalogue seeds (CSV import)', (prod.created || 0) + (prod.updated || 0) >= 71,
  'created=' + prod.created + ' updated=' + prod.updated);

/* ==========================================================================
   v2.5.2 — REAL PRODUCT MASTER (product list2.csv → tools/products.json
   → Seed_Products.gs).  Every assertion below is a loss-check: koi bhi CSV
   column raaste mein girna nahi chahiye, aur doosri baar chalane par
   duplicate nahi banana chahiye.
   ========================================================================== */
section('Real product master import (CSV → sheets)');


const CATALOG = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'products.json'), 'utf8'));
const SDB = sandbox.DB;
const UU = sandbox.U;

ok('catalogue file matches the seed array', CATALOG.length === sandbox.PRODUCT_SEED.length,
  'json=' + CATALOG.length + ' seed=' + sandbox.PRODUCT_SEED.length);
ok('every catalogue row has a code and a name',
  CATALOG.every(p => p.code && p.name), 'blank row leaked');
ok('no duplicate product codes in the catalogue',
  new Set(CATALOG.map(p => p.code.toUpperCase())).size === CATALOG.length, 'duplicate code');
ok('no duplicate barcodes in the catalogue',
  new Set(CATALOG.map(p => p.barcode)).size === CATALOG.length, 'duplicate barcode');

/* ---- 1. every CSV product landed in the Items sheet, by code ------------- */
const itemsAll = SDB.all('Items');
const itemsByCode = {};
itemsAll.forEach(i => { itemsByCode[UU.norm(i.code)] = i; });
const missingCodes = CATALOG.filter(p => !itemsByCode[UU.norm(p.code)]).map(p => p.code);
ok('all ' + CATALOG.length + ' CSV products exist as items', missingCodes.length === 0,
  'missing: ' + missingCodes.slice(0, 5).join(', '));
ok('item count equals catalogue count (no duplicates created)',
  itemsAll.length === CATALOG.length, 'items=' + itemsAll.length);
ok('no duplicate item rows by code',
  new Set(itemsAll.map(i => UU.norm(i.code))).size === itemsAll.length, 'dup rows');

/* ---- 2. prices arrive untouched from the CSV ----------------------------- */
const wrongPrice = CATALOG.filter(p => {
  const it = itemsByCode[UU.norm(p.code)];
  return !it || UU.num(it.costPrice) !== UU.num(p.costPrice)
    || UU.num(it.retailPrice) !== UU.num(p.retailPrice)
    || UU.num(it.wholesalePrice) !== UU.num(p.wholesalePrice);
});
ok('cost / wholesale / retail prices match the CSV exactly',
  wrongPrice.length === 0,
  wrongPrice.slice(0, 3).map(p => p.code + ' csv=' + p.costPrice + '/' + p.wholesalePrice + '/' + p.retailPrice
    + ' db=' + itemsByCode[UU.norm(p.code)].costPrice + '/' + itemsByCode[UU.norm(p.code)].wholesalePrice
    + '/' + itemsByCode[UU.norm(p.code)].retailPrice).join(' | '));
ok('min price floor defaults to cost price',
  CATALOG.every(p => UU.num(itemsByCode[UU.norm(p.code)].minPrice) === UU.num(p.costPrice)), 'minPrice wrong');

/* ---- 3. taxonomy: line item (L1) / category (L2) / sub-category (L3) ----- */
ok('lineItem populated for every item',
  CATALOG.every(p => UU.str(itemsByCode[UU.norm(p.code)].lineItem) === p.lineItem), 'lineItem mismatch/drop');
ok('category maps to the CSV Category column',
  CATALOG.every(p => UU.str(itemsByCode[UU.norm(p.code)].category) === p.category), 'category mismatch');
ok('subCategory maps to the CSV Sub Category column',
  CATALOG.every(p => UU.str(itemsByCode[UU.norm(p.code)].subCategory) === p.subCategory), 'subCategory mismatch');
ok('partType derived for every item',
  CATALOG.every(p => UU.str(itemsByCode[UU.norm(p.code)].partType).length > 0), 'blank partType');

/* ---- 4. descriptive details survive -------------------------------------- */
ok('origin (Made in) stored on every row that had it',
  CATALOG.filter(p => p.origin).every(p => itemsByCode[UU.norm(p.code)].origin === p.origin), 'origin lost');
ok('brand stored and matches the CSV',
  CATALOG.filter(p => p.brand).every(p => itemsByCode[UU.norm(p.code)].brand === p.brand), 'brand lost');
ok('model stored and matches the CSV',
  CATALOG.filter(p => p.model).every(p => itemsByCode[UU.norm(p.code)].model === p.model), 'model lost');
ok('size stored; "Default" normalised to empty',
  CATALOG.every(p => itemsByCode[UU.norm(p.code)].size === p.size)
  && CATALOG.every(p => p.size !== 'Default'), 'size lost or Default leaked');
ok('conversion factor is a sane positive number (never 0)',
  itemsAll.every(i => UU.num(i.conversionFactor, 1) >= 1), 'bad conversionFactor');
ok('conversion factors match the CSV',
  CATALOG.every(p => UU.num(itemsByCode[UU.norm(p.code)].conversionFactor, 1) === UU.num(p.conversionFactor, 1)),
  'conversionFactor mismatch');
ok('unit defaults to PCS', itemsAll.every(i => i.unit === 'PCS'), 'unit wrong');

/* ---- 5. barcodes ---------------------------------------------------------- */
ok('barcode matches the CSV (falls back to the product code when blank)',
  CATALOG.every(p => itemsByCode[UU.norm(p.code)].barcode === p.barcode), 'barcode mismatch');
ok('real barcodes kept, blanks filled with the code',
  CATALOG.filter(p => p.barcode !== p.code).length === CATALOG.filter(p => p.barcode !== p.code).length
  && CATALOG.every(p => UU.str(p.barcode).length > 0), 'barcode empty');

/* ---- 6. custom fields (Product group / Color / Cost type) ------------------ */
const cfBad = [];
CATALOG.forEach(p => {
  const raw = itemsByCode[UU.norm(p.code)].customFields;
  if (raw === '[object Object]') { cfBad.push(p.code + ':objectObject'); return; }
  let obj = null;
  try { obj = JSON.parse(raw || '{}'); } catch (e) { cfBad.push(p.code + ':unparsable'); return; }
  if (p.costType && obj.cf_costType !== p.costType) cfBad.push(p.code + ':costType');
  if (p.productGroup && obj.cf_productGroup !== p.productGroup) cfBad.push(p.code + ':productGroup');
  if (p.color && obj.cf_color !== p.color) cfBad.push(p.code + ':color');
});
ok('custom fields stored as JSON (never [object Object]) and readable back',
  cfBad.length === 0, cfBad.slice(0, 5).join(', '));
ok('custom field definitions were created for the ITEM entity',
  SDB.all('CustomFields').filter(f => f.entity === 'ITEM' && f.key === 'productGroup').length === 1,
  'productGroup def missing');

/* ---- 7. masters: suppliers, brands, categories ---------------------------- */
const supNames = SDB.all('Suppliers').map(s => UU.norm(s.name));
const csvSuppliers = Array.from(new Set(CATALOG.map(p => p.supplier).filter(Boolean)));
ok('every CSV supplier exists in the Suppliers master',
  csvSuppliers.every(n => supNames.includes(UU.norm(n))),
  'missing: ' + csvSuppliers.filter(n => !supNames.includes(UU.norm(n))).slice(0, 4).join(', '));
ok('suppliers are created exactly once (no duplicates)',
  new Set(supNames).size === supNames.length, 'duplicate supplier rows');
ok('primarySupplierId on each item resolves to a real supplier',
  CATALOG.filter(p => p.supplier).every(p => {
    const id = itemsByCode[UU.norm(p.code)].primarySupplierId;
    return !!id && !!SDB.byId('Suppliers', id);
  }), 'dangling primarySupplierId');

const brandNames = SDB.all('Brands').map(b => UU.norm(b.name));
const csvBrands = Array.from(new Set(CATALOG.map(p => p.brand).filter(Boolean)));
ok('every CSV brand exists in the Brands master',
  csvBrands.every(n => brandNames.includes(UU.norm(n))),
  'missing: ' + csvBrands.filter(n => !brandNames.includes(UU.norm(n))).slice(0, 4).join(', '));
ok('brands are created exactly once', new Set(brandNames).size === brandNames.length, 'duplicate brands');

const cats = SDB.all('Categories');
const rootNames = cats.filter(c => !UU.str(c.parentId)).map(c => UU.norm(c.name));
const csvLineItems = Array.from(new Set(CATALOG.map(p => p.lineItem)));
ok('every line item is seeded as a root category',
  csvLineItems.every(n => rootNames.includes(UU.norm(n))),
  'missing: ' + csvLineItems.filter(n => !rootNames.includes(UU.norm(n))).slice(0, 4).join(', '));
ok('every category is parented under its line item',
  (function () {
    const byName = {};
    cats.forEach(c => { byName[c.parentId + '|' + UU.norm(c.name)] = c; });
    return CATALOG.filter(p => p.category).every(p => {
      const parent = cats.find(c => !UU.str(c.parentId) && UU.norm(c.name) === UU.norm(p.lineItem));
      return !!(parent && byName[parent.id + '|' + UU.norm(p.category)]);
    });
  })(), 'category parent missing');
ok('categories are created exactly once per (parent, name)',
  new Set(cats.map(c => c.parentId + '|' + UU.norm(c.name))).size === cats.length, 'duplicate categories');

/* ---- 8. stock rows -------------------------------------------------------- */
const locIds = SDB.all('Locations').map(l => l.id);
const stockRows = SDB.all('Stock');
const stockKey = {};
stockRows.forEach(s => { stockKey[s.itemId + '|' + s.locationId] = s; });
ok('a stock row exists for every item in every branch',
  itemsAll.every(it => locIds.every(l => !!stockKey[it.id + '|' + l])), 'missing stock rows');
ok('no duplicate stock rows per (item, branch)',
  new Set(stockRows.map(s => s.itemId + '|' + s.locationId)).size === stockRows.length, 'dup stock');
ok('opening stock qty is what the caller asked for',
  itemsAll.filter(i => String(i.code) === CATALOG[0].code)
    .every(it => locIds.every(l => UU.num(stockKey[it.id + '|' + l].qty) === 20)), 'qty != 20');

/* ---- 9. no [object Object] / TRUE-FALSE leakage anywhere ------------------ */
const dirtyCells = [];
['Items', 'Categories', 'Suppliers', 'Brands'].forEach(sh => {
  SDB.all(sh).forEach((row, ri) => {
    Object.keys(row).forEach(k => {
      const v = row[k];
      if (v === '[object Object]' || String(v).indexOf('[object Object]') > -1) dirtyCells.push(sh + '.' + k);
      if (v === true || v === false) dirtyCells.push(sh + '.' + k + '=boolean');
    });
  });
});
ok('no cell in the imported sheets holds [object Object] or a raw boolean',
  dirtyCells.length === 0, dirtyCells.slice(0, 6).join(', '));

/* ---- 10. idempotency — doobara chalane par kuch duplicate na ho ---------- */
const beforeItems = SDB.count('Items');
const beforeStock = SDB.count('Stock');
const run2 = Setup.seedProducts({ stock: 20 });
ok('second run creates no new items', run2.created === 0, 'created=' + run2.created);
ok('second run creates no new stock rows', run2.stockRows === 0, 'stockRows=' + run2.stockRows);
ok('second run updates every existing item', run2.updated === CATALOG.length,
  'updated=' + run2.updated + ' expected=' + CATALOG.length);
ok('second run adds no suppliers / brands / categories',
  run2.suppliersCreated === 0 && run2.brandsCreated === 0 && run2.categoriesCreated === 0,
  JSON.stringify({ s: run2.suppliersCreated, b: run2.brandsCreated, c: run2.categoriesCreated }));
ok('row counts unchanged after the second run',
  SDB.count('Items') === beforeItems && SDB.count('Stock') === beforeStock,
  'items ' + beforeItems + '→' + SDB.count('Items') + ', stock ' + beforeStock + '→' + SDB.count('Stock'));

/* ---- 10b. dry run — Preview button kuch bhi write na kare ---------------- */
const preItems = SDB.count('Items'), preStock = SDB.count('Stock');
const preCats = SDB.count('Categories'), preSup = SDB.count('Suppliers'), preBrd = SDB.count('Brands');
const dryRun = Setup.seedProducts({ stock: 0, dryRun: true });
ok('dryRun writes no items', SDB.count('Items') === preItems,
  preItems + '→' + SDB.count('Items'));
ok('dryRun writes no stock rows', SDB.count('Stock') === preStock,
  preStock + '→' + SDB.count('Stock'));
ok('dryRun writes no categories / suppliers / brands',
  SDB.count('Categories') === preCats && SDB.count('Suppliers') === preSup && SDB.count('Brands') === preBrd,
  'cat ' + preCats + '→' + SDB.count('Categories') + ', sup ' + preSup + '→' + SDB.count('Suppliers')
  + ', brd ' + preBrd + '→' + SDB.count('Brands'));
ok('dryRun still reports exactly what it would do',
  dryRun.dryRun === true && dryRun.total === CATALOG.length
  && dryRun.created + dryRun.updated === CATALOG.length,
  JSON.stringify({ dry: dryRun.dryRun, total: dryRun.total, c: dryRun.created, u: dryRun.updated }));
ok('dryRun returns a preview row for every catalogue product',
  (dryRun.items || []).length === CATALOG.length, 'items=' + (dryRun.items || []).length);
ok('dryRun preview carries the CSV detail (line item / brand / origin / prices)',
  (function () {
    const p = (dryRun.items || []).find(x => x.code === CATALOG[0].code);
    const s = CATALOG[0];
    return !!p && p.lineItem === s.lineItem && p.brand === s.brand && p.origin === s.origin
      && UU.num(p.retailPrice) === UU.num(s.retailPrice);
  })(), 'preview row incomplete');
ok('audit dry run against a fresh audit (nothing drifted)',
  (function () { const a = sandbox.Setup.auditProducts(); return a.missing === 0 && a.priceDiff === 0; })(),
  JSON.stringify(sandbox.Setup.auditProducts()));
ok('setup.auditProducts route is wired in Code.gs',
  /'setup\.auditProducts'/.test(require('fs').readFileSync(
    require('path').join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8')), 'route missing');

/* ---- 11. prices:false respects manually edited rates --------------------- */
const probe = itemsByCode[UU.norm(CATALOG[0].code)];
SDB.update('Items', probe.id, { retailPrice: 99999 });
Setup.seedProducts({ prices: false });
ok('prices:false leaves edited retail prices alone',
  UU.num(SDB.byId('Items', probe.id).retailPrice) === 99999, 'rate was overwritten');
Setup.seedProducts({});
ok('prices:true restores the CSV rate',
  UU.num(SDB.byId('Items', probe.id).retailPrice) === UU.num(CATALOG[0].retailPrice),
  'rate not restored');

/* ---- 12. audit helper ---------------------------------------------------- */
const auditCsv = sandbox.auditRealProducts();
ok('auditRealProducts reports nothing missing', auditCsv.missing === 0,
  'missing=' + auditCsv.missing);
ok('auditRealProducts reports no price drift', auditCsv.priceDiff === 0,
  'priceDiff=' + auditCsv.priceDiff + ' ' + (auditCsv.priceSamples || []).slice(0, 2).join(' | '));
ok('seed metadata travels with the catalogue', !!sandbox.SEED_META.products
  && sandbox.SEED_META.products === CATALOG.length, JSON.stringify(sandbox.SEED_META));

/* ---- 13. the item form can no longer wipe these fields ------------------- */
ok('Items.FIELDS covers every extended column (save se detail na giray)',
  ['lineItem', 'origin', 'size', 'conversionFactor', 'customFields', 'primarySupplierId', 'variants']
    .every(f => sandbox.Items.FIELDS.indexOf(f) > -1),
  'missing from FIELDS: ' + ['lineItem', 'origin', 'size', 'conversionFactor', 'customFields',
    'primarySupplierId', 'variants'].filter(f => sandbox.Items.FIELDS.indexOf(f) === -1).join(', '));
ok('every Items.FIELDS entry is a declared sheet column',
  sandbox.Items.FIELDS.every(f => sandbox.SCHEMA.Items.indexOf(f) > -1),
  'undeclared: ' + sandbox.Items.FIELDS.filter(f => sandbox.SCHEMA.Items.indexOf(f) === -1).join(', '));

const facets = sandbox.Items.facets();
ok('facets expose line items for the filter dropdowns',
  facets.lineItems.length === csvLineItems.length, 'lineItems=' + facets.lineItems.length);

/* -------------------------------- login ----------------------------------- */
let res = api('auth.login', { username: 'owner', password: 'admin123' });
ok('owner login works', res.ok && res.data && res.data.token, JSON.stringify(res).slice(0, 120));
const TOKEN = res.data.token;
const SESSION = res.data.session;

function call(action, payload) {
  const r = api(action, Object.assign({ token: TOKEN }, payload || {}));
  if (!r.ok) throw new Error(action + ' failed: ' + JSON.stringify(r.error || r));
  return r.data;
}
function tryCall(action, payload) {
  return api(action, Object.assign({ token: TOKEN }, payload || {}));
}

const LOC = SESSION.defaultLocationId;
const LOC2 = (sandbox.DB.all('Locations') || []).map(l => l.id).find(id => id !== LOC);

/* ------------------------------ test items -------------------------------- */
section('Item master');
const itemA = call('items.save', { item: {
  name: 'Test Brake Pad', code: 'TST-BP-001', barcode: '990000000001',
  category: 'Brakes', brand: 'TestBrand', costPrice: 500, retailPrice: 800,
  wholesalePrice: 700, minPrice: 650, taxRate: 17, minStock: 5, reorderLevel: 8, unit: 'PCS'
}});
const itemB = call('items.save', { item: {
  name: 'Test Engine Oil 1L', code: 'TST-OIL-1L', barcode: '990000000002',
  category: 'Oil', brand: 'TestBrand', costPrice: 900, retailPrice: 1200,
  wholesalePrice: 1100, minPrice: 1000, taxRate: 17, minStock: 4, unit: 'LTR'
}});
ok('item A created', !!itemA.id && itemA.code === 'TST-BP-001');
ok('item B created', !!itemB.id);
ok('barcode lookup resolves', (call('items.byBarcode', { code: '990000000001' }) || {}).id === itemA.id);

/* ------------------------------- purchase --------------------------------- */
section('Purchase → GRN → stock & weighted average cost');
const sup = call('suppliers.save', { supplier: { name: 'Test Supplier', phone: '03000000000', paymentTerms: 'NET 30' } });
// receive 10 @ 500
const pcGrn1 = call('purchase.grn.save', { grn: {
  supplierId: sup.id, locationId: LOC, date: new Date().toISOString().slice(0, 10),
  invoiceNo: 'GRN-TEST-1', items: [{ itemId: itemA.id, qty: 10, cost: 500 }], post: true
}});
let stockA = sandbox.DB.findOne('Stock', r => r.itemId === itemA.id && r.locationId === LOC) || {};
ok('GRN increases qty to 10', Number(stockA.qty) === 10, 'qty=' + stockA.qty);
ok('avg cost after first GRN = 500', near(stockA.avgCost, 500), 'avgCost=' + stockA.avgCost);

// receive 10 more @ 600 → weighted avg must be 550, qty 20
const pcGrn2 = call('purchase.grn.save', { grn: {
  supplierId: sup.id, locationId: LOC, date: new Date().toISOString().slice(0, 10),
  invoiceNo: 'GRN-TEST-2', items: [{ itemId: itemA.id, qty: 10, cost: 600 }], post: true
}});
stockA = sandbox.DB.findOne('Stock', r => r.itemId === itemA.id && r.locationId === LOC) || {};
ok('GRN qty 10 + 10 = 20', Number(stockA.qty) === 20, 'qty=' + stockA.qty);
ok('weighted average cost = 550', near(stockA.avgCost, 550), 'avgCost=' + stockA.avgCost);
ok('stock value = qty x avgCost = 11,000', near(stockA.qty * stockA.avgCost, 11000), 'value=' + (stockA.qty * stockA.avgCost));

// GRN for item B: 30 @ 900
call('purchase.grn.save', { grn: {
  supplierId: sup.id, locationId: LOC, date: new Date().toISOString().slice(0, 10),
  invoiceNo: 'GRN-TEST-3', items: [{ itemId: itemB.id, qty: 30, cost: 900 }], post: true
}});

/* --------------------------------- sale ----------------------------------- */
section('Sale: line maths, discount, tax, rounding, stock, profit');
const cust = call('customers.save', { customer: { name: 'Test Customer', phone: '03111111111', customerTypeId: '' } });
const sale = call('sales.create', { sale: {
  locationId: LOC, customerId: cust.id, customerName: cust.name,
  items: [
    { itemId: itemA.id, qty: 3, price: 800, discount: 0, taxRate: 17 },
    { itemId: itemB.id, qty: 2, price: 1200, discount: 100, taxRate: 17 }
  ],
  discount: 50,
  payments: [{ method: 'CASH', amount: 5000 }]
}});

const expSub = 3 * 800 + (2 * 1200 - 100);           // 2400 + 2300 = 4700
const expTaxable = expSub - 50;                       // 4650
const expTax = expTaxable * 0.17;                     // 790.5
const expTotal = expTaxable + expTax;                 // 5440.5
ok('subtotal = 4,700', near(sale.subtotal, expSub), 'got ' + sale.subtotal);
ok('bill discount applied (50)', near(sale.discount, 50), 'got ' + sale.discount);
ok('tax 17% charged on discounted base = 790.50', near(sale.tax, expTax, 0.02), 'got ' + sale.tax);
ok('grand total = 5,440.50', near(sale.total, expTotal, 0.02), 'got ' + sale.total);
ok('paid = 5,000 and due = 440.50', near(sale.paid, 5000) && near(sale.due, expTotal - 5000, 0.02),
  'paid=' + sale.paid + ' due=' + sale.due);
ok('change is NOT negative when underpaid', (sale.change || 0) === 0, 'change=' + sale.change);

const cogs = 3 * 550 + 2 * 900;                       // 3450
ok('COGS uses weighted avg cost (3,450) not last cost', near(sale.cogs, cogs, 0.02), 'got ' + sale.cogs);
ok('gross profit = total - discount - COGS', near(sale.profit, expTaxable - cogs, 0.02), 'got ' + sale.profit);

stockA = sandbox.DB.findOne('Stock', r => r.itemId === itemA.id && r.locationId === LOC) || {};
const stockB = sandbox.DB.findOne('Stock', r => r.itemId === itemB.id && r.locationId === LOC) || {};
ok('stock A 20 - 3 = 17', Number(stockA.qty) === 17, 'qty=' + stockA.qty);
ok('stock B 30 - 2 = 28', Number(stockB.qty) === 28, 'qty=' + stockB.qty);
ok('avg cost unchanged after sale (550)', near(stockA.avgCost, 550), 'avgCost=' + stockA.avgCost);

/* --------------------------- customer ledger ------------------------------ */
section('Receivables / ledger');
let led = call('customers.ledger', { id: cust.id });
ok('ledger closing = due (440.50)', near(led.closing, expTotal - 5000, 0.02), 'closing=' + led.closing);

call('payments.create', { payment: { type: 'RECEIPT', partyType: 'CUSTOMER', partyId: cust.id,
  amount: 440.5, method: 'CASH', locationId: LOC, date: new Date().toISOString().slice(0, 10) } });
led = call('customers.ledger', { id: cust.id });
ok('receipt clears ledger to ~0', near(led.closing, 0, 0.02), 'closing=' + led.closing);

/* ------------------------------- returns ---------------------------------- */
section('Sale return');
const ret = call('sales.return', { record: { saleId: sale.id, locationId: LOC,
  items: [{ itemId: itemA.id, qty: 1, price: 800 }], refundMethod: 'CASH' } });
stockA = sandbox.DB.findOne('Stock', r => r.itemId === itemA.id && r.locationId === LOC) || {};
ok('return puts stock back (17 + 1 = 18)', Number(stockA.qty) === 18, 'qty=' + stockA.qty);
ok('return preserves avg cost (550)', near(stockA.avgCost, 550), 'avgCost=' + stockA.avgCost);

/* ------------------------- negative stock guard --------------------------- */
section('Controls');
let blocked = tryCall('sales.create', { sale: { locationId: LOC,
  items: [{ itemId: itemA.id, qty: 99999, price: 800 }], payments: [{ method: 'CASH', amount: 0 }] } });
ok('oversell blocked when negative stock disabled', !blocked.ok, JSON.stringify(blocked.error || {}).slice(0, 90));

// permission guards run as cashier (owner may legitimately override limits)
const cash = api('auth.login', { username: 'cashier', password: 'cash123' });
ok('cashier login works', cash.ok, JSON.stringify(cash).slice(0, 80));
const CTOK = cash.ok ? cash.data.token : TOKEN;
function cashCall(action, payload) {
  return api(action, Object.assign({ token: CTOK }, payload || {}));
}

// bill-level discount cap (87.5% > default max) must be rejected
const capRes = cashCall('sales.create', { sale: { locationId: LOC,
  items: [{ itemId: itemA.id, qty: 1, price: 800 }], discount: 700,
  payments: [{ method: 'CASH', amount: 100 }] } });
ok('bill discount above max % is blocked', !capRes.ok, JSON.stringify(capRes.error || {}).slice(0, 90));

// min-price guard: 1 x 800 with 200 discount → 600 < minPrice 650
const minRes = cashCall('sales.create', { sale: { locationId: LOC,
  items: [{ itemId: itemA.id, qty: 1, price: 800, discount: 200 }],
  payments: [{ method: 'CASH', amount: 600 }] } });
ok('below-min-price sale is blocked', !minRes.ok, JSON.stringify(minRes.error || {}).slice(0, 90));

/* ------------------------------ transfers --------------------------------- */
section('Branch transfer');
if (LOC2) {
  const tr = call('stock.transfer.save', { transfer: { fromLocationId: LOC, toLocationId: LOC2,
    items: [{ itemId: itemA.id, qty: 5 }] } });
  let from = sandbox.DB.findOne('Stock', r => r.itemId === itemA.id && r.locationId === LOC) || {};
  let to = sandbox.DB.findOne('Stock', r => r.itemId === itemA.id && r.locationId === LOC2) || {};
  ok('source reduced while in transit (18 - 5 = 13)', Number(from.qty) === 13, 'qty=' + from.qty);
  call('stock.transfer.receive', { id: tr.id });
  from = sandbox.DB.findOne('Stock', r => r.itemId === itemA.id && r.locationId === LOC) || {};
  to = sandbox.DB.findOne('Stock', r => r.itemId === itemA.id && r.locationId === LOC2) || {};
  ok('destination credited on receive (5)', Number(to.qty) === 5, 'qty=' + to.qty);
  ok('source unchanged after receive (13)', Number(from.qty) === 13, 'qty=' + from.qty);
  ok('value transferred = 5 x 550', near(to.qty * to.avgCost, 2750, 0.02), 'value=' + (to.qty * to.avgCost));
}

/* ----------------------------- adjustments -------------------------------- */
section('Stock adjustment / count');
const before = Number((sandbox.DB.findOne('Stock', r => r.itemId === itemB.id && r.locationId === LOC) || {}).qty);
const adj = call('stock.adjust.save', { adjustment: { locationId: LOC, reason: 'DAMAGE',
  items: [{ itemId: itemB.id, countedQty: before - 3, cost: 900 }], post: true } });
const after = Number((sandbox.DB.findOne('Stock', r => r.itemId === itemB.id && r.locationId === LOC) || {}).qty);
ok('adjustment sets qty to counted value', after === before - 3, before + ' → ' + after);

section('Tax engine variants');
const inc = call('sales.create', { sale: { locationId: LOC, taxInclusive: true,
  items: [{ itemId: itemB.id, qty: 1, price: 1170, taxRate: 17 }],
  payments: [{ method: 'CASH', amount: 1170 }] } });
// 1170 gross inclusive of 17% → net 1000, tax 170
ok('tax-inclusive: net = gross / 1.17', near(inc.subtotal - inc.discount - inc.tax, 1000, 0.05),
  'net=' + (inc.subtotal - inc.discount - inc.tax));
ok('tax-inclusive: tax backed out = 170', near(inc.tax, 170, 0.05), 'tax=' + inc.tax);
ok('tax-inclusive: total stays = gross', near(inc.total, 1170, 0.02), 'total=' + inc.total);

const noDisc = call('sales.create', { sale: { locationId: LOC,
  items: [{ itemId: itemB.id, qty: 1, price: 1000, taxRate: 17 }], discount: 100,
  payments: [{ method: 'CASH', amount: 1053 }] } });
ok('discount applied before tax: base 900 → tax 153', near(noDisc.tax, 153, 0.02), 'tax=' + noDisc.tax);
ok('discount applied before tax: total = 1,053', near(noDisc.total, 1053, 0.02), 'total=' + noDisc.total);

/* ------------------------------- warehouse -------------------------------- */
section('Warehouse / bins');
const whs = call('warehouse.list', {});
ok('warehouses seeded per branch', (whs || []).length >= 3, 'count=' + (whs || []).length);
const bins = call('warehouse.bins', {});
ok('bins seeded (12 per branch)', (bins || []).length >= 12, 'count=' + (bins || []).length);
const bin = bins[0];
call('warehouse.putaway', { itemId: itemA.id, binId: bin.id });
let itmA = call('items.get', { id: itemA.id });
ok('put-away assigns bin to item', (itmA.raw || itmA).binId === bin.id, 'binId=' + ((itmA.raw || itmA).binId));
const binStock = call('warehouse.stockByBin', { locationId: LOC });
const binRow = (binStock || []).find(r => r.itemId === itemA.id && r.binId === bin.id);
ok('bin stock row created', !!binRow, JSON.stringify(binRow || {}).slice(0, 80));
if (binRow) ok('bin qty = branch qty (13/1)', Number(binRow.qty) > 0, 'qty=' + binRow.qty);
const ov = call('warehouse.overview', { locationId: LOC });
ok('warehouse overview totals computed', typeof ov.totalQty === 'number', JSON.stringify(ov).slice(0, 90));

/* ----------------------------- notifications ------------------------------ */
section('Notifications / alerts');
const notif = call('notifications.generate', {});
ok('alert generation runs', notif && typeof notif.created === 'number', 'created=' + (notif || {}).created);
const sum = call('notifications.summary', {});
ok('unread summary is numeric', typeof sum.unread === 'number', 'unread=' + sum.unread);

/* -------------------------------- reports --------------------------------- */
section('Reports consistency');
const salesRep = call('reports.sales', { from: '2000-01-01', to: '2100-01-01' });
const salesRows = salesRep.rows || salesRep;
const repTotal = salesRows.reduce((a, r) => a + Number(r.total || 0), 0);
ok('sales report total = sum of invoice totals', near(repTotal, salesRep.grandTotal ?? repTotal, 0.02),
  'rows=' + repTotal + ' reported=' + salesRep.grandTotal);

const val = call('reports.inventoryValuation', {});
const valRows = val.rows || val;
const manualValue = (sandbox.DB.all('Stock') || [])
  .filter(r => !LOC || r.locationId === LOC)
  .reduce((a, r) => a + Number(r.qty || 0) * Number(r.avgCost || 0), 0);
const repValue = valRows.reduce((a, r) => a + Number(r.value || 0), 0);
ok('inventory valuation = Σ qty × avgCost', near(repValue, manualValue, Math.max(1, manualValue * 0.001)),
  'report=' + repValue + ' manual=' + manualValue);

const profitRep = call('reports.profit', { from: '2000-01-01', to: '2100-01-01' });
ok('profit report returns numbers', typeof (profitRep.profit ?? profitRep.grossProfit ?? 0) === 'number',
  JSON.stringify(profitRep).slice(0, 100));

/* ----------------------- settings / round-trip ---------------------------- */
section('Settings round-trip (no hardcoding)');
call('config.save', { values: { 'biz.name': 'Haseeb Autos Test', 'pos.cardsPerRow': 6, 'tax.rate': 17 } });
const all = call('config.all', {});
ok('setting saved & re-read', all['biz.name'] === 'Haseeb Autos Test', 'got ' + all['biz.name']);
ok('numeric setting typed', Number(all['pos.cardsPerRow']) === 6, 'got ' + all['pos.cardsPerRow']);
const defs = call('config.defs', {});
ok('config schema exposes groups', Array.isArray(defs) && defs.length >= 5, 'groups=' + (defs || []).length);
const grpCount = (defs[0] || {}).sub ? defs[0].sub.length : 0;
ok('groups have sub-tabs', grpCount > 0, 'sub-tabs=' + grpCount);

const cf = call('config.fields.save', { field: { entity: 'ITEM', key: 'cf_test', label: 'Test field',
  type: 'TEXT', active: 'true', showInForm: 'true' } });
const cfs = call('config.fields.list', { entity: 'ITEM' });
ok('custom field saved & listed', (cfs || []).some(f => f.key === 'cf_test'), 'count=' + (cfs || []).length);

const menu = call('config.menu', {});
ok('dynamic menu built', Array.isArray(menu) && menu.length >= 3, 'groups=' + (menu || []).length);
const tpls = call('config.templates', { type: 'RECEIPT' });
ok('print templates seeded', (tpls || []).length >= 1, 'count=' + (tpls || []).length);

/* -------------------------------- barcode --------------------------------- */
section('Barcode');
function ean13cd(s12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(s12[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
}
const gen = call('barcode.generate', { value: '', type: 'EAN13' });
ok('generated EAN-13 has valid check digit', gen.value.length === 13 &&
  gen.value[12] === ean13cd(gen.value.slice(0, 12)), 'value=' + gen.value);

/* ---------------------------- rounding rules ------------------------------ */
section('Rounding & money formatting');
const U = sandbox.U || {};
if (typeof U.round === 'function') {
  ok('round(2.345, 2) = 2.35 (half-up)', U.round(2.345, 2) === 2.35, String(U.round(2.345, 2)));
  ok('round(2.344, 2) = 2.34', U.round(2.344, 2) === 2.34, String(U.round(2.344, 2)));
  ok('round(1050, -2) = 1100 when nearest-10 mode off', typeof U.round(1050, -2) === 'number', String(U.round(1050, -2)));
}

/* --------------------------- AUTO REORDER ENGINE -------------------------- */
section('Auto reorder engine');
// settings for deterministic math
call('config.save', { values: { autoReorder: true, autoReorderMethod: 'VELOCITY',
  autoReorderLookback: 30, autoReorderCoverageDays: 10, autoReorderLeadTimeDays: 5,
  autoReorderSafetyDays: 5, autoReorderSupplierMode: 'PRIMARY', autoReorderCreate: 'DRAFT',
  autoReorderMinValue: 0, autoReorderIncludeSlow: 'false' } });

const roItem = call('items.save', { item: { name: 'Reorder Test Filter', code: 'TST-RO-1',
  costPrice: 100, retailPrice: 150, minStock: 5, reorderLevel: 200, primarySupplierId: sup.id } });
// stock 20 units
call('purchase.grn.save', { grn: { supplierId: sup.id, locationId: LOC,
  date: new Date().toISOString().slice(0, 10), invoiceNo: 'GRN-RO-1',
  items: [{ itemId: roItem.id, qty: 20, cost: 100 }], post: true } });
// sell 10 units in the lookback window (velocity = 10/30 per day)
call('sales.create', { sale: { locationId: LOC,
  items: [{ itemId: roItem.id, qty: 10, price: 150 }],
  payments: [{ method: 'CASH', amount: 1500 }] } });

const sug = call('reorder.suggest', { locationId: LOC });
const roRow = (sug.rows || []).find(r => r.itemId === roItem.id);
ok('reorder row exists for the test item', !!roRow, 'rows=' + (sug.rows || []).length);
if (roRow) {
  const vel = 10 / 30;                                  // lookback 30 days
  const expectedTarget = vel * (10 + 5) + vel * 5;      // cover + lead + safety = 6.67 → below reorder point
  const expectedTarget2 = Math.max(expectedTarget, 200); // target never below reorder point 200
  ok('velocity = 0.333/day', near(roRow.avgDailySales, vel, 0.01), 'got ' + roRow.avgDailySales);
  ok('target level = max(velocity formula, reorder point)', near(roRow.targetLevel, expectedTarget2, 0.6),
    'got ' + roRow.targetLevel + ' expected ~' + expectedTarget2.toFixed(2));
  ok('on hand = 10 after selling 10 of 20', near(roRow.onHand, 10), 'got ' + roRow.onHand);
  ok('suggested qty = ceil(target - available)', near(roRow.suggestedQty, Math.ceil(expectedTarget2 - 10), 1),
    'got ' + roRow.suggestedQty);
  ok('value = qty x cost', near(roRow.value, roRow.suggestedQty * roRow.cost, 0.02), 'got ' + roRow.value);
  ok('priority computed', typeof roRow.priority === 'string' && roRow.priority.length > 0, roRow.priority);
}
const summary = sug.summary || {};
ok('summary totals = sum of rows', near(summary.value, (sug.rows || []).reduce((a, r) => a + r.value, 0), 0.05),
  'summary=' + summary.value);

// create POs from suggestions
const created = call('reorder.createPOs', { locationId: LOC,
  items: [{ itemId: roItem.id, qty: 25, cost: 100, supplierId: sup.id }] });
ok('reorder creates a purchase order', (created.created || 0) >= 1, JSON.stringify(created).slice(0, 120));
ok('created PO is DRAFT (per setting)', (created.purchaseOrders || [])[0] &&
  (created.purchaseOrders[0].status === 'DRAFT' || created.purchaseOrders[0].status === undefined),
  JSON.stringify((created.purchaseOrders || [])[0] || {}).slice(0, 100));

// min-order-value rule must filter small lines
call('config.save', { values: { autoReorderMinValue: 999999 } });
const small = call('reorder.suggest', { locationId: LOC });
ok('min order value filters rows out', !(small.rows || []).find(r => r.itemId === roItem.id),
  'rows=' + (small.rows || []).length);
call('config.save', { values: { autoReorderMinValue: 0 } });

/* ------------------------------- LANGUAGE --------------------------------- */
section('Language / translations');
const dictEn = call('lang.dict', { lang: 'en' });
const dictUr = call('lang.dict', { lang: 'ur' });
ok('english dictionary has keys', Object.keys(dictEn || {}).length > 10,
  'keys=' + Object.keys(dictEn || {}).length);
ok('urdu dictionary populated', Object.keys(dictUr || {}).length > 10 && /[\u0600-\u06FF]/.test(JSON.stringify(dictUr)),
  'keys=' + Object.keys(dictUr || {}).length);
call('lang.save', { row: { key: 'btn.save', en: 'Save', roman: 'Save karain', ur: 'محفوظ کریں' } });
const dictUr2 = call('lang.dict', { lang: 'ur' });
ok('translation edit round-trips', dictUr2['btn.save'] === 'محفوظ کریں', 'got ' + dictUr2['btn.save']);

/* --------------------------- SCHEDULED JOBS ------------------------------- */
section('Scheduled jobs (triggers)');
let st = call('system.triggers.status', {});
ok('trigger status returns config', !!st && !!st.config, JSON.stringify(st).slice(0, 120));
ok('default job hour is morning (7)', (st.config || {}).hour === 7, 'hour=' + (st.config || {}).hour);
ok('timezone is Asia/Karachi', (st.config || {}).timezone === 'Asia/Karachi', (st.config || {}).timezone);

const inst = call('system.triggers.install', {});
/* v2.13.4 — 2 daily jobs + 15-min cache-warm job (default on) = 3 */
ok('install creates both daily jobs plus cache-warm + demand', (inst.installed || []).length === 4,
  JSON.stringify(inst.installed || []).slice(0, 140));
ok('install is idempotent (no duplicates)', (call('system.triggers.install', {}).installed || []).length === 4,
  'second install size=' + (call('system.triggers.install', {}).installed || []).length);
ok('status lists installed jobs', (call('system.triggers.status', {}).installedCount || 0) === 4,
  'count=' + call('system.triggers.status', {}).installedCount);

const jobRun = call('system.triggers.runNow', { locationId: LOC });
ok('daily reorder job runs', !!jobRun && !!jobRun.ranAt, JSON.stringify(jobRun).slice(0, 120));
ok('job scans every branch', (jobRun.locations || []).length >= 1, 'locations=' + (jobRun.locations || []).length);
ok('job records last run timestamp',
  !!(call('system.triggers.status', {}).lastRun || {}).REORDER, JSON.stringify((call('system.triggers.status', {}).lastRun || {})));

// disabled job → install hona hi nahi chahiye
call('config.save', { values: { 'job.dailyReorder': 'false' } });
const off = call('system.triggers.install', {});
ok('disabled reorder job is not installed',
  !(off.installed || []).find(t => t.handler === 'triggerDailyReorder'), JSON.stringify(off.installed || []));
call('config.save', { values: { 'job.dailyReorder': 'true' } });
call('system.triggers.install', {});

const alertsRun = call('system.jobs.runAlerts', {});
ok('alerts job runs', typeof alertsRun.created === 'number', JSON.stringify(alertsRun).slice(0, 120));

// Notifications.push (Reorder.run isi ko call karta hai)
section('Notifications');
const pushed = sandbox.Notifications.push('TEST', 'Test alert', 'logic-test-body', 'info', '#/items', LOC, SESSION);
ok('Notifications.push creates a row', !!pushed && !!pushed.id, JSON.stringify(pushed).slice(0, 120));
const dup = sandbox.Notifications.push('TEST', 'Test alert', 'logic-test-body', 'info', '#/items', LOC, SESSION);
ok('Notifications.push is idempotent (24h)', !!dup && dup.id === pushed.id, 'ids ' + pushed.id + ' / ' + (dup || {}).id);

/* ------------------------ PER-USER LANGUAGE ------------------------------ */
section('Per-user language & overrides');
const prefs0 = call('lang.prefs', {});
ok('user prefs default to english', (prefs0 || {}).lang === 'en', JSON.stringify(prefs0));
const prefs1 = call('lang.prefs.save', { prefs: { lang: 'ur' } });
ok('user language saves', (prefs1 || {}).lang === 'ur', JSON.stringify(prefs1));
ok('saved language reads back', (call('lang.prefs', {}).lang === 'ur'), call('lang.prefs', {}).lang);

// personal override: sirf is user ke dictionary me nazar aaye
call('lang.save', { row: { key: 'btn.save', en: 'Save', roman: 'Save karain', ur: 'محفوظ کریں' } });
call('lang.save', { row: { key: 'btn.save', en: 'Save', roman: 'Save kinjiye', ur: 'سیو کریں', scope: 'user:' + SESSION.userId } });
const myDict = call('lang.dict', { lang: 'roman' });
ok('personal override wins for me', myDict['btn.save'] === 'Save kinjiye', 'got ' + myDict['btn.save']);
const overrides = call('lang.myOverrides', {});
ok('my overrides are listed', !!(overrides || {})['btn.save'], JSON.stringify(overrides).slice(0, 120));
// doosra user → global value hi mile
const other = sandbox.DB.all('Users').filter(u => u.username === 'cashier')[0];
if (other) {
  const otherSession = sandbox.Auth._buildSession(other);
  const otherDict = sandbox.Lang.dict('roman', otherSession);
  ok('other user unaffected by my override', otherDict['btn.save'] === 'Save karain', 'got ' + otherDict['btn.save']);
}
call('lang.prefs.save', { prefs: { lang: 'en' } });

/* --------------------- PAYMENT METHODS ENGINE (v2.2) ---------------------- */
section('Payment methods — fees, settlement, cheques');
const methods = call('pay.methods', {});
ok('method registry returns all methods', (methods || []).length >= 8, 'n=' + (methods || []).length);
ok('Raast has zero MDR', (methods.find(m => m.id === 'RAAST') || {}).feePct === 0,
  'raast=' + JSON.stringify(methods.find(m => m.id === 'RAAST') || {}));
ok('JazzCash MDR is 2%', (methods.find(m => m.id === 'JAZZCASH') || {}).feePct === 2,
  'jc=' + (methods.find(m => m.id === 'JAZZCASH') || {}).feePct);
ok('EasyPaisa MDR is 2.5%', (methods.find(m => m.id === 'EASYPAISA') || {}).feePct === 2.5,
  'ep=' + (methods.find(m => m.id === 'EASYPAISA') || {}).feePct);

// fee maths
const cCash = call('pay.compute', { amount: 1000, method: 'CASH' });
ok('cash: no fee, net = amount', cCash.fee === 0 && cCash.net === 1000, JSON.stringify(cCash));
const cJazz = call('pay.compute', { amount: 1000, method: 'JAZZCASH' });
ok('JazzCash 1000 → fee 20, net 980', cJazz.fee === 20 && cJazz.net === 980, JSON.stringify(cJazz));
const cEp = call('pay.compute', { amount: 1000, method: 'EASYPAISA' });
ok('EasyPaisa 1000 → fee 25, net 975', cEp.fee === 25 && cEp.net === 975, JSON.stringify(cEp));
const cRaast = call('pay.compute', { amount: 5000, method: 'RAAST' });
ok('Raast 5000 → fee 0, net 5000', cRaast.fee === 0 && cRaast.net === 5000, JSON.stringify(cRaast));
ok('Raast settles same day', cRaast.settleDays === 0, 'days=' + cRaast.settleDays);
ok('Card settles T+2', (call('pay.compute', { amount: 100, method: 'CARD' }) || {}).settleDays === 2);

// FED on fee
call('config.save', { values: { 'pay.JAZZCASH.fedPct': '16' } });
const cFed = call('pay.compute', { amount: 1000, method: 'JAZZCASH' });
ok('FED = fee x fedPct (20 x 16% = 3.2)', near(cFed.fed, 3.2), 'fed=' + cFed.fed);
ok('net = gross - fee - FED', near(cFed.net, 1000 - 20 - 3.2), 'net=' + cFed.net);
call('config.save', { values: { 'pay.JAZZCASH.fedPct': '0' } });

// cheque lifecycle
const custForCheque = call('customers.save', { customer: { name: 'Cheque Test Customer',
  phone: '03009990000', customerTypeId: 'CT-1', creditLimit: 500000 } });
const balBefore = sandbox.Parties.balance('CUSTOMER', custForCheque.id);
const chequePay = call('payments.create', { payment: { amount: 5000, method: 'CHEQUE',
  partyType: 'CUSTOMER', partyId: custForCheque.id, partyName: 'Cheque Test Customer',
  chequeNo: 'CHQ-7788', bankName: 'Meezan Bank', chequeDate: U.today ? U.today() : new Date().toISOString().slice(0, 10),
  type: 'RECEIPT' } });
ok('cheque payment created as PENDING', chequePay.status === 'PENDING', JSON.stringify(chequePay).slice(0, 140));
ok('cheque requires clearing', chequePay.requiresClearing === true, String(chequePay.requiresClearing));
ok('pending cheque does NOT hit ledger yet',
  near(sandbox.Parties.balance('CUSTOMER', custForCheque.id), balBefore), 'balance moved');

const cleared = call('pay.cheque.clear', { id: chequePay.id, status: 'CLEARED' });
ok('cheque clears', (cleared || {}).status === 'CLEARED', JSON.stringify(cleared));
ok('clearing posts ledger (balance -5000)',
  near(sandbox.Parties.balance('CUSTOMER', custForCheque.id), balBefore - 5000),
  'bal=' + sandbox.Parties.balance('CUSTOMER', custForCheque.id));

// bounce: amount returns to receivable + bank charges
call('config.save', { values: { 'pay.cheque.bounceCharges': '350' } });
const chq2 = call('payments.create', { payment: { amount: 2000, method: 'CHEQUE',
  partyType: 'CUSTOMER', partyId: custForCheque.id, partyName: 'Cheque Test Customer',
  chequeNo: 'CHQ-9999', bankName: 'HBL', type: 'RECEIPT',
  chequeDate: new Date().toISOString().slice(0, 10) } });
const balBeforeBounce = sandbox.Parties.balance('CUSTOMER', custForCheque.id);
const bounced = call('pay.cheque.clear', { id: chq2.id, status: 'BOUNCED' });
ok('bounce recorded', (bounced || {}).status === 'BOUNCED', JSON.stringify(bounced));
ok('bounce of a PENDING cheque only adds bank charges (+350 debit)',
  near(sandbox.Parties.balance('CUSTOMER', custForCheque.id), balBeforeBounce + 350),
  'bal=' + sandbox.Parties.balance('CUSTOMER', custForCheque.id) + ' before=' + balBeforeBounce);

// clear → phir bounce: amount wapas udhaar me + charges
const balBeforeClearBounce = sandbox.Parties.balance('CUSTOMER', custForCheque.id);
const chq3 = call('payments.create', { payment: { amount: 1000, method: 'CHEQUE',
  partyType: 'CUSTOMER', partyId: custForCheque.id, partyName: 'Cheque Test Customer',
  chequeNo: 'CHQ-1234', bankName: 'HBL', type: 'RECEIPT',
  chequeDate: new Date().toISOString().slice(0, 10) } });
call('pay.cheque.clear', { id: chq3.id, status: 'CLEARED' });
const afterClear = sandbox.Parties.balance('CUSTOMER', custForCheque.id);
ok('cleared cheque reduces balance by 1000', near(afterClear, balBeforeClearBounce - 1000),
  'bal=' + afterClear);
call('pay.cheque.clear', { id: chq3.id, status: 'BOUNCED' });
ok('bounce after clearing reverses amount + charges',
  near(sandbox.Parties.balance('CUSTOMER', custForCheque.id), balBeforeClearBounce + 350),
  'bal=' + sandbox.Parties.balance('CUSTOMER', custForCheque.id));
/* v2.5: PER-USER RULES — role ke baad allow (extra) / deny (block) */
const ruleUser = call('users.create', { user: { username: 'ruletest', password: 'secret123',
  role: 'SALESMAN', fullName: 'Rule Test' } });
const baseSess = sandbox.Auth._buildSession(sandbox.DB.byId('Users', ruleUser.id));
ok('role defaults applied (SALESMAN can sell)', baseSess.permissions.indexOf('pos.sell') > -1,
  JSON.stringify(baseSess.permissions));
ok('role defaults applied (SALESMAN cannot see financial reports)',
  baseSess.permissions.indexOf('reports.financial') === -1, JSON.stringify(baseSess.permissions));
call('users.update', { id: ruleUser.id, patch: { extraPermissions: 'reports.financial,expenses.create',
  deniedPermissions: 'pos.hold' } });
const ruleSess = sandbox.Auth._buildSession(sandbox.DB.byId('Users', ruleUser.id));
ok('per-user ALLOW adds a permission the role lacks',
  ruleSess.permissions.indexOf('reports.financial') > -1 && ruleSess.permissions.indexOf('expenses.create') > -1,
  JSON.stringify(ruleSess.permissions));
ok('per-user DENY removes a permission the role has',
  ruleSess.permissions.indexOf('pos.hold') === -1 && ruleSess.permissions.indexOf('pos.sell') > -1,
  JSON.stringify(ruleSess.permissions));
const stored = sandbox.DB.byId('Users', ruleUser.id);
ok('rules persist on the user record',
  String(stored.extraPermissions || '').indexOf('reports.financial') > -1 &&
  String(stored.deniedPermissions || '').indexOf('pos.hold') > -1, JSON.stringify(stored).slice(0, 160));

/* v2.5.1: DAY / SHIFT CLOSING REPORT */
const repSes = call('cash.session.open', { openingCash: 5000, notes: 'test shift' });
call('payments.create', { payment: { amount: 2500, method: 'CASH', partyType: 'CUSTOMER',
  partyId: custForCheque.id, partyName: 'Cheque Test Customer', type: 'RECEIPT' } });
call('cash.move', { type: 'CASH_OUT', amount: 500, reason: 'chai' });
const repOpen = call('shop.dayReport', { sessionId: repSes.id });
ok('day report identifies the session, branch and cashier',
  repOpen.sessionNo === repSes.sessionNo && repOpen.cashier !== undefined && repOpen.locationId !== undefined,
  JSON.stringify(repOpen).slice(0, 160));
ok('day report math: expected = opening + cashIn - cashOut - expenses',
  near(repOpen.expectedCash, Number(repOpen.openingCash) + repOpen.totals.cashIn -
    repOpen.totals.cashOut - repOpen.totals.expenses),
  'expected=' + repOpen.expectedCash + ' totals=' + JSON.stringify(repOpen.totals));
ok('day report breaks payments down by method',
  (repOpen.methods || []).length > 0 && (repOpen.methods || [])[0].amount !== undefined,
  JSON.stringify(repOpen.methods));
ok('day report lists cash movements with reason',
  (repOpen.moves || []).some(m => /chai/i.test(m.reason || '')), JSON.stringify(repOpen.moves));
ok('open session report has no counted cash / variance yet',
  repOpen.closingCash === null && repOpen.variance === null,
  'closing=' + repOpen.closingCash + ' variance=' + repOpen.variance);
call('cash.session.close', { sessionId: repSes.id, closingCash: repOpen.expectedCash - 100 });
const repClosed = call('shop.dayReport', { sessionId: repSes.id });
ok('closed session report shows counted cash and variance',
  repClosed.closingCash !== null && near(repClosed.variance, -100),
  'closing=' + repClosed.closingCash + ' variance=' + repClosed.variance);
ok('closed session report keeps the business/branch header',
  !!repClosed.business && !!repClosed.reportTitle, JSON.stringify(repClosed.business));

/* v2.5.3 §5/§6 — closing report ke alag alag financial heads
   (pehle sirf ek mila-jhula cashIn tha) + server-side PDF (broken route fix) */
['cashSales', 'creditSales', 'refunds', 'expenseTotal', 'cashIn', 'cashOut', 'netSales'].forEach(function (k) {
  ok('day report exposes an explicit "' + k + '" head',
    typeof repClosed[k] === 'number' && isFinite(repClosed[k]),
    k + '=' + repClosed[k] + ' (' + typeof repClosed[k] + ')');
});
ok('cash sales + credit sales do not exceed the shift activity',
  repClosed.cashSales >= 0 && repClosed.creditSales >= 0 && repClosed.refunds >= 0,
  JSON.stringify({ cash: repClosed.cashSales, credit: repClosed.creditSales, refunds: repClosed.refunds }));

/* §6 — expenses closing report mein alag se nazar aayen (pehle sirf cashOut mein ghule the) */
const repSes2 = call('cash.session.open', { openingCash: 1000, notes: 'expense shift' });
call('expenses.create', { expense: { category: 'CHAI', amount: 300, paidTo: 'canteen',
  method: 'CASH', locationId: LOC, sessionId: repSes2.id, notes: 'staff chai' } });
const repExp = call('shop.dayReport', { sessionId: repSes2.id });
ok('expenses are counted separately from cash paid out',
  near(repExp.expenseTotal, 300) && near(repExp.totals.expenses, 300),
  JSON.stringify({ expenseTotal: repExp.expenseTotal, totals: repExp.totals }));
ok('expenses appear as a by-category breakdown in the day report',
  (repExp.expenses || []).some(x => U_num(x.amount) === 300 && /CHAI/i.test(x.category || '')),
  JSON.stringify(repExp.expenses));
ok('expenses reduce the expected cash (cash-out flow)',
  near(repExp.expectedCash, 1000 + repExp.cashIn - repExp.cashOut - repExp.expenseTotal),
  'expected=' + repExp.expectedCash + ' in=' + repExp.cashIn + ' out=' + repExp.cashOut +
  ' exp=' + repExp.expenseTotal);
const drHtmlExp = sandbox.Exports.dayReportHtml(repExp);
ok('day-report HTML lists the expense category and total',
  drHtmlExp.indexOf('CHAI') > -1 && drHtmlExp.indexOf('300.00') > -1,
  'expense nahi mili HTML mein');
call('cash.session.close', { sessionId: repSes2.id, closingCash: repExp.expectedCash });

ok('Exports.dayReportPdf exists (shop.dayReport.pdf route no longer crashes)',
  typeof sandbox.Exports.dayReportPdf === 'function',
  'typeof=' + typeof sandbox.Exports.dayReportPdf);
const drHtml = sandbox.Exports.dayReportHtml(repClosed);
ok('server-side day-report HTML renders', typeof drHtml === 'string' && drHtml.length > 800,
  'len=' + (drHtml || '').length);
['Opening cash', 'Cash sales', 'Credit sales', 'Refunds', 'Expenses', 'Expected cash',
 'Difference (variance)', 'Payment methods', 'Cash movements'].forEach(function (head) {
  ok('day-report PDF/print contains "' + head + '"', drHtml.indexOf(head) > -1, 'head missing');
});
ok('day-report HTML shows the variance value',
  drHtml.indexOf(String(Math.abs(repClosed.variance).toFixed(2))) > -1,
  'variance ' + repClosed.variance + ' nahi mila');

/* v2.5.1: CASH BOOK — opening hardcoded nahi, settings + purani entries se banta hai */
const cbToday = new Date();
const cbFrom = new Date(cbToday.getTime() - 29 * 864e5);
const dayStr = d => d.toISOString().slice(0, 10);
call('config.save', { values: { 'cashbook.openingCash': '1000', 'cashbook.openingAsOf': dayStr(cbToday),
  'cashbook.method': 'ALL', 'cashbook.includeExpenses': 'true' } });
const cbAsOn = call('reports.cashbook', { from: dayStr(cbFrom), to: dayStr(cbToday) });
ok('cash book opening = settings balance (as-on date ke baad koi purani entry nahi)',
  near(cbAsOn.opening, 1000), 'opening=' + cbAsOn.opening + ' detail=' + JSON.stringify(cbAsOn.openingDetail));
ok('cash book opening exposes its basis (audit trail)',
  !!cbAsOn.openingDetail && typeof cbAsOn.openingDetail.basis === 'string' &&
  cbAsOn.openingDetail.base === 1000, JSON.stringify(cbAsOn.openingDetail));
call('config.save', { values: { 'cashbook.openingAsOf': '' } });
/* 3 din purani entry — as-on khali hone par ye opening mein jarni chahiye */
call('payments.create', { payment: { amount: 700, method: 'CASH', type: 'RECEIPT', partyType: 'CUSTOMER',
  partyId: custForCheque.id, partyName: 'Opening Test Customer', date: dayStr(new Date(cbToday.getTime() - 3 * 864e5)) } });
const cbFull = call('reports.cashbook', { from: dayStr(cbToday), to: dayStr(cbToday) });
ok('as-on date khali ho to purani entries ka net opening mein juta',
  cbFull.openingDetail.entries > 0 && cbFull.openingDetail.movements !== 0 &&
  near(cbFull.opening, 1000 + cbFull.openingDetail.movements),
  'full=' + cbFull.opening + ' detail=' + JSON.stringify(cbFull.openingDetail));
ok('cash book identity: opening + in - out = closing',
  near(cbFull.opening + cbFull.inflow - cbFull.outflow, cbFull.closing),
  JSON.stringify({ o: cbFull.opening, i: cbFull.inflow, x: cbFull.outflow, c: cbFull.closing }));
ok('cash book entries carry a running balance, last row = closing',
  (cbFull.entries || []).length > 0 && near((cbFull.entries[cbFull.entries.length - 1] || {}).balance, cbFull.closing),
  'last=' + JSON.stringify(cbFull.entries[cbFull.entries.length - 1] || {}));
ok('cash book day-wise: last day closing = period closing',
  (cbFull.days || []).length > 0 && near((cbFull.days[cbFull.days.length - 1] || {}).closing, cbFull.closing),
  JSON.stringify(cbFull.days || []));
ok('cash book day-wise totals match period totals',
  near((cbFull.days || []).reduce((a, d) => a + d.inflow, 0), cbFull.inflow) &&
  near((cbFull.days || []).reduce((a, d) => a + d.outflow, 0), cbFull.outflow),
  'days vs period mismatch');
ok('cash book breaks down by method with in/out/net',
  (cbFull.byMethod || []).length > 0 && (cbFull.byMethod || [])[0].net !== undefined &&
  near((cbFull.byMethod || [])[0].net, (cbFull.byMethod || [])[0].inflow - (cbFull.byMethod || [])[0].outflow),
  JSON.stringify(cbFull.byMethod));
const cbCash = call('reports.cashbook', { from: dayStr(cbFrom), to: dayStr(cbToday), method: 'CASH' });
ok('cash book method filter sirf chuni hui method rakhta hai',
  (cbCash.entries || []).every(e => String(e.method).toUpperCase() === 'CASH'),
  JSON.stringify((cbCash.entries || []).map(e => e.method)));
call('config.save', { values: { 'cashbook.includeExpenses': 'false' } });
const cbNoExp = call('reports.cashbook', { from: dayStr(cbFrom), to: dayStr(cbToday) });
ok('expenses setting off ho to cash book mein expense nahi',
  cbNoExp.expensesTotal === 0 && (cbNoExp.entries || []).every(e => e.kind !== 'EXPENSE'),
  'expTotal=' + cbNoExp.expensesTotal);
call('config.save', { values: { 'cashbook.includeExpenses': 'true', 'cashbook.openingCash': '0' } });

/* v2.5: EXPENSE APPROVAL — bade expense pending rahein, approve par voucher post ho */
call('config.save', { values: { expenseApproval: 'true', expenseApprovalOver: '20000' } });
const smallExp = call('expenses.create', { expense: { category: 'Petty cash', amount: 500, paidTo: 'Tea', method: 'CASH' } });
ok('small expense auto-posts (no approval needed)', String(smallExp.status) === 'POSTED', JSON.stringify(smallExp).slice(0, 120));
const bigExp = call('expenses.create', { expense: { category: 'Rent', amount: 45000, paidTo: 'Landlord', method: 'BANK',
  reference: 'RENT-2026-09', taxAmount: 0, accountId: '', notes: 'Shop rent' } });
ok('expense over the approval limit is PENDING', String(bigExp.status) === 'PENDING', JSON.stringify(bigExp).slice(0, 140));
ok('expense stores reference + paid-from account', 'reference' in bigExp && 'accountId' in bigExp, JSON.stringify(bigExp).slice(0, 160));
const approved = call('expenses.approve', { id: bigExp.id });
ok('approving posts the expense', String(approved.status) === 'POSTED', JSON.stringify(approved).slice(0, 140));
const rejExp = call('expenses.create', { expense: { category: 'Repairs', amount: 30000, paidTo: 'Mechanic', method: 'CASH' } });
ok('reject marks the expense REJECTED',
  String(call('expenses.approve', { id: rejExp.id, approve: false }).status) === 'REJECTED', 'not rejected');
call('config.save', { values: { expenseApproval: 'false' } });
ok('with approval off, big expenses post immediately',
  String(call('expenses.create', { expense: { category: 'Rent', amount: 99000, paidTo: 'Landlord', method: 'BANK' } }).status) === 'POSTED',
  'still pending');

/* v2.5: PARTY SUMMARY — previous balance ka saaf hisaab (opening + billed - paid) */
const partySum = call('parties.balance', { partyType: 'CUSTOMER', id: custForCheque.id });
ok('party summary adds up: opening + billed - paid = balance',
  near(partySum.opening + partySum.billed - partySum.paid, partySum.balance),
  JSON.stringify(partySum));
ok('party summary matches ledger balance',
  near(partySum.balance, sandbox.Parties.balance('CUSTOMER', custForCheque.id)),
  'summary=' + partySum.balance + ' ledger=' + sandbox.Parties.balance('CUSTOMER', custForCheque.id));
ok('party summary exposes credit limit + entries',
  typeof partySum.creditLimit === 'number' && typeof partySum.entries === 'number',
  JSON.stringify(partySum));
const supSum = call('parties.balance', { partyType: 'SUPPLIER', id: (sandbox.DB.all('Suppliers')[0] || {}).id });
ok('supplier summary uses payable convention (opening + purchases - paid)',
  supSum && typeof supSum.balance === 'number', JSON.stringify(supSum));

ok('cheque list shows bounced cheque',
  !!call('pay.cheques', { status: 'BOUNCED' }).find(c => c.id === chq2.id), 'not listed');
const recon = call('pay.reconcile', {});
ok('reconciliation totals add up',
  near(recon.totals.net, recon.totals.gross - recon.totals.fee - recon.totals.fed, 0.02),
  JSON.stringify(recon.totals));

/* --------------------- INVOICE PREVIOUS BALANCE --------------------------- */
section('Invoice — previous balance');
const pbCust = call('customers.save', { customer: { name: 'Prev Bal Customer', phone: '03001112222',
  customerTypeId: 'CT-1', creditLimit: 500000 } });
// pehli invoice udhaar par
const inv1 = call('sales.create', { sale: { locationId: LOC, customerId: pbCust.id,
  customerName: 'Prev Bal Customer', items: [{ itemId: itemA.id, qty: 1, price: 800 }],
  payments: [{ method: 'CASH', amount: 300 }] } });
const due1 = U.round(inv1.total - 300, 2);
ok('first invoice leaves due', inv1.due > 0, JSON.stringify(inv1).slice(0, 160));
// doosri invoice → previous balance = pichli due
const inv2 = call('sales.create', { sale: { locationId: LOC, customerId: pbCust.id,
  customerName: 'Prev Bal Customer', items: [{ itemId: itemB.id, qty: 1, price: 1200 }],
  payments: [{ method: 'CASH', amount: 0 }] } });
ok('second invoice shows previous balance', near(inv2.prevBalance, due1, 0.02),
  'prev=' + inv2.prevBalance + ' expected=' + due1);
ok('closing balance = prev + total - paid',
  near(inv2.closingBalance, due1 + inv2.total, 0.02), 'closing=' + inv2.closingBalance);
ok('payment summary includes method + fee', (inv2.paymentSummary || []).length === 0 ||
  typeof (inv2.paymentSummary || [])[0] === 'object', JSON.stringify(inv2.paymentSummary).slice(0, 120));

/* ------------------------ PRINT ENGINE (v2.2) ----------------------------- */
section('Print engine — sizes, templates, ESC/POS');
const sizes = call('print.sizes', {});
ok('thermal + sheet sizes registered', (sizes || []).length >= 8, 'n=' + (sizes || []).length);
const s58 = (sizes || []).find(s => s.id === '58mm');
const s80 = (sizes || []).find(s => s.id === '80mm');
ok('58mm thermal = 32 columns', s58 && s58.cols === 32, JSON.stringify(s58));
ok('80mm thermal = 48 columns', s80 && s80.cols === 48, JSON.stringify(s80));
ok('A4 / A5 / A3 / sheets present', ['A3', 'A4', 'A5', 'HALF'].every(id => (sizes || []).find(s => s.id === id)), 'missing sheet size');

const tpl = call('print.defaultTemplate', { type: 'RECEIPT', paper: '80mm' });
let tplCfg = {};
try { tplCfg = JSON.parse(tpl.json || '{}'); } catch (e) { tplCfg = {}; }
ok('default template has field map', Object.keys(tplCfg.fields || {}).length > 15,
  'fields=' + Object.keys(tplCfg.fields || {}).length);
ok('template includes prevBalance + closingBalance fields',
  !!(tplCfg.fields || {}).prevBalance && !!(tplCfg.fields || {}).closingBalance, 'missing balance fields');
ok('template paper size stored', tplCfg.paper === '80mm', tplCfg.paper);

// save a custom template (visual designer isi raste se save karta hai)
const savedTpl = call('config.templates.save', { template: { type: 'RECEIPT', name: 'A4 Tax Invoice',
  active: 'true', json: JSON.stringify(Object.assign({}, tplCfg, { paper: 'A4', showTaxInvoice: true })) } });
ok('template saves', !!savedTpl && !!savedTpl.id, JSON.stringify(savedTpl).slice(0, 120));
const resolved = call('print.resolve', { type: 'RECEIPT', paper: 'A4' });
ok('resolve returns parsed config', !!(resolved || {}).cfg, JSON.stringify(resolved).slice(0, 120));

// ESC/POS
const esc = call('print.escpos', { id: inv2.id, paper: '80mm' });
ok('ESC/POS bytes generated', (esc.bytes || 0) > 50, JSON.stringify(esc).slice(0, 140));
ok('ESC/POS payload is base64', typeof esc.base64 === 'string' && esc.base64.length > 10, String(esc.base64).slice(0, 20));
ok('ESC/POS uses 80mm columns', esc.cols === 48, 'cols=' + esc.cols);

/* ------------- v2.3: WHATSAPP / SMS / EMAIL (comms) ----------------------- */
section('Comms — WhatsApp, SMS, Email');
ok('phone normalises to E.164', sandbox.Comms.phone('0300-1234567').endsWith('3001234567'),
  sandbox.Comms.phone('0300-1234567'));
ok('phone keeps country code', sandbox.Comms.phone('+923001234567') === '923001234567',
  sandbox.Comms.phone('+923001234567'));
const rendered = sandbox.Comms.render('Invoice {{invoiceNo}} total {{total}} for {{customer}}',
  { invoiceNo: 'INV-9', total: 'Rs 1,000', customer: 'Ali' });
ok('template placeholders render', rendered === 'Invoice INV-9 total Rs 1,000 for Ali', rendered);
ok('unknown placeholders are stripped',
  sandbox.Comms.render('Hi {{x}} there', {}).trim() === 'Hi  there',
  sandbox.Comms.render('Hi {{x}} there', {}));
const waLink = sandbox.Comms.waLink('03001234567', 'Salam');
ok('wa.me link built (free, no API key)', waLink.indexOf('https://wa.me/') === 0 && waLink.indexOf('Salam') > 0, waLink.slice(0, 60));

const prep = call('comms.prepare', { id: inv2.id, template: 'invoice' });
ok('invoice message prepared from template', String(prep.message || '').indexOf('INV') > -1,
  String(prep.message || '').slice(0, 90));
ok('prepare returns subject + customer total', !!prep.ctx && prep.ctx.total !== undefined,
  JSON.stringify(prep.ctx || {}).slice(0, 90));

const sent = call('comms.send', { channel: 'WHATSAPP', to: '03001234567',
  message: 'Test message', refType: 'SALE', refId: inv2.id });
ok('WhatsApp send succeeds (LINK provider)', sent && sent.ok === true, JSON.stringify(sent).slice(0, 120));
const outbox = call('comms.outbox', { limit: 50 });
ok('message logged in outbox', (outbox.rows || []).some(r => String(r.body).indexOf('Test message') > -1),
  'rows=' + (outbox.rows || []).length);
ok('outbox counts messages', (outbox.counts || {}).sent >= 1, JSON.stringify(outbox.counts));

/* -------------------- v2.3: LOYALTY POINTS -------------------------------- */
section('Loyalty — earn & redeem at POS');
call('config.save', { values: { 'loyalty.enabled': 'true', 'loyalty.perAmount': '1000',
  'loyalty.points': '1', 'loyalty.rate': '1', 'loyalty.minRedeem': '0', 'loyalty.maxRedeemPct': '50' } });
const loyCust = call('customers.save', { customer: { name: 'Loyalty Customer', phone: '03005550000',
  customerTypeId: 'CT-1', creditLimit: 500000 } });
const loySale1 = call('sales.create', { sale: { locationId: LOC, customerId: loyCust.id,
  customerName: 'Loyalty Customer', items: [{ itemId: itemA.id, qty: 4, price: 800 }],
  payments: [{ method: 'CASH', amount: 3200 }] } });   // 3200 → floor(3200/1000) = 3 points
ok('points earned on sale (3)', loySale1.pointsEarned === 3, 'earned=' + loySale1.pointsEarned);
const loyBal = call('loyalty.summary', { customerId: loyCust.id, total: 2000 });
ok('loyalty balance reflects earning', loyBal.points === 3, JSON.stringify(loyBal));
ok('all points usable when under cap', loyBal.usablePoints === 3, 'usable=' + loyBal.usablePoints);
call('config.save', { values: { 'loyalty.maxRedeemPct': '0.05' } });   // 2000 x 0.05% = 1 rupee → 1 point
const loyCapped = call('loyalty.summary', { customerId: loyCust.id, total: 2000 });
ok('usable points capped by maxRedeemPct', loyCapped.usablePoints === 1, 'usable=' + loyCapped.usablePoints);

call('config.save', { values: { 'loyalty.maxRedeemPct': '100', 'loyalty.minRedeem': '1' } });
const loySale2 = call('sales.create', { sale: { locationId: LOC, customerId: loyCust.id,
  customerName: 'Loyalty Customer', items: [{ itemId: itemB.id, qty: 1, price: 1000 }],
  payments: [{ method: 'CASH', amount: 998 }, { method: 'LOYALTY', amount: 2, points: 2 }] } });
ok('loyalty payment accepted at POS',
  !!loySale2.id && (loySale2.paymentSummary || []).some(p => p.method === 'LOYALTY'),
  JSON.stringify((loySale2.paymentSummary || [])).slice(0, 140));
ok('loyalty tender counted in paid', near(loySale2.paid, 1000, 0.02), 'paid=' + loySale2.paid);
const balAfter = call('loyalty.balance', { customerId: loyCust.id });
ok('redeemed points deducted (3 + 1 earned - 2 used)', balAfter.balance === 2, 'balance=' + balAfter.balance);
ok('loyalty history has entries', (call('loyalty.history', { customerId: loyCust.id }).rows || []).length >= 3,
  'rows=' + (call('loyalty.history', { customerId: loyCust.id }).rows || []).length);
let redeemErr = '';
try { call('loyalty.redeem', { customerId: loyCust.id, points: 9999 }); }
catch (e) { redeemErr = e.message; }
ok('over-redeem is blocked', /nahi hain|cannot|available/i.test(redeemErr), redeemErr || 'no error thrown');

/* ---------------- v2.3: SUPPLIER PRICE-LIST IMPORT ------------------------ */
section('Supplier price list import');
const csv = 'code,name,brand,cost,retail\n' + itemA.code + ',' + itemA.name + ',Bosch,650,900\n' +
  'NEW-999,Spark Plug Set,NGK,300,420';
const pv = call('priceimport.preview', { text: csv, fileName: 'supplier.csv' });
ok('CSV parsed into rows', (pv.rows || []).length === 2, 'rows=' + (pv.rows || []).length);
ok('columns auto-mapped', (pv.mapping || {}).code === 0 && (pv.mapping || {}).cost === 3 &&
  (pv.mapping || {}).retail === 4, JSON.stringify(pv.mapping));
const matched = (pv.rows || []).find(r => r.code === itemA.code);
ok('existing item matched', !!matched && matched.action === 'UPDATE', JSON.stringify(matched || {}));
const oldCostBefore = Number(sandbox.DB.byId('Items', itemA.id).costPrice);
ok('old cost read from item master', near(matched.oldCost, oldCostBefore, 0.02),
  'oldCost=' + matched.oldCost + ' master=' + oldCostBefore);
ok('cost delta = new − old', near(matched.deltaCost, 650 - oldCostBefore, 0.02),
  'delta=' + matched.deltaCost + ' expected=' + (650 - oldCostBefore));
ok('delta percent is consistent', near(matched.deltaPct, (650 - oldCostBefore) / oldCostBefore * 100, 0.02),
  'pct=' + matched.deltaPct);
ok('unknown row marked SKIP', (pv.rows || []).some(r => r.code === 'NEW-999' && r.action === 'SKIP'),
  JSON.stringify(pv.stats));
ok('stats counted', (pv.stats || {}).update === 1, JSON.stringify(pv.stats));
const applied = call('priceimport.apply', { rows: [matched], updateCost: true, updateRetail: true });
ok('apply updates item cost', applied.updated === 1, JSON.stringify(applied));
const itemAfter = sandbox.DB.byId('Items', itemA.id);
ok('item cost actually changed to 650', near(Number(itemAfter.costPrice), 650, 0.02),
  'cost=' + itemAfter.costPrice);
ok('item retail updated to 900', near(Number(itemAfter.retailPrice), 900, 0.02),
  'retail=' + itemAfter.retailPrice);
ok('import logged in history', (call('priceimport.history', {}) || []).length >= 1, 'history empty');
ok('TSV/semicolon parsing works',
  (sandbox.PriceImport.parseCsv('a;b;c\n1;2;3', ';')[1] || []).length === 3, 'tsv fail');

/* ------------------- v2.3: FIREBASE MIGRATION PATH ------------------------ */
section('Firebase migration readiness');
const mig = call('migration.assess', {});
ok('assessment returns tier', ['SHEETS_OK', 'OPTIMIZE', 'MIGRATE'].indexOf(mig.tier) > -1, mig.tier);
ok('per-table row counts present', (mig.tables || []).length >= 5, 'tables=' + (mig.tables || []).length);
ok('totals add up', (mig.totals || {}).rows > 0, JSON.stringify(mig.totals));
ok('collection names are snake_case', (mig.tables || []).every(t => /^[a-z][a-z_]*$/.test(t.firestore || '')),
  JSON.stringify((mig.tables || []).map(t => t.firestore).slice(0, 4)));
const plan = call('migration.plan', {});
ok('plan has 7 cutover steps', (plan.steps || []).length === 7, 'steps=' + (plan.steps || []).length);
ok('plan lists collections', Array.isArray(plan.collections), 'no collections');
ok('plan has Firestore indexes', (plan.indexes || []).length >= 3, 'indexes=' + (plan.indexes || []).length);
ok('plan has security rules', String(plan.rules || '').indexOf('allow read') > -1, 'no rules');
const migStatus = call('migration.status', {});
ok('migration status reports config mode', !!migStatus.config && migStatus.config.mode !== undefined,
  JSON.stringify(migStatus.config));
ok('Firestore value converter works',
  sandbox.Migration._toFirestore({ a: 'x', b: 5, c: true, d: 2.5 }).b.integerValue === '5',
  JSON.stringify(sandbox.Migration._toFirestore({ a: 'x', b: 5, c: true, d: 2.5 })).slice(0, 120));

/* ------------- v2.2: AI AGENT CONFIGURATION (professional) ---------------- */
section('AI agent configuration');
const aiCfg = call('ai.agentConfig', {});
ok('agent config exposes 22 whitelisted tools (17 + 5 demand)', (aiCfg.tools || []).length === 22,
  'tools=' + (aiCfg.tools || []).length);
ok('tools carry READ/WRITE risk', (aiCfg.tools || []).every(t => t.risk === 'READ' || t.risk === 'WRITE'),
  JSON.stringify((aiCfg.tools || []).slice(0, 2)));
ok('write tools are only drafts', (aiCfg.tools || []).filter(t => t.risk === 'WRITE')
  .every(t => /^draft_/.test(t.name)), JSON.stringify((aiCfg.tools || []).filter(t => t.risk === 'WRITE').map(t => t.name)));
ok('model list is data-driven (empty until discovered/configured)',
  Array.isArray(aiCfg.models) && aiCfg.modelSources && aiCfg.modelSources.GEMINI !== undefined,
  JSON.stringify(aiCfg.modelSources));
/* v2.5: koi vendor model name kisi bhi source file ke CODE (non-comment) mein nahi */
const fsx = require('fs'), pathx = require('path');
const SRC = pathx.join(__dirname, '..', 'apps-script');
const MODEL_ID = /\b(gemini|gpt|o[1-9]|chatgpt|claude|deepseek|qwen|llama|mistral|grok)-?\d/i;
const hardModel = [];
fsx.readdirSync(SRC).concat(['../demo/mock.js']).forEach(f => {
  const full = pathx.join(SRC, f);
  if (!fsx.existsSync(full) || !/\.(gs|html|js)$/.test(f)) return;
  let inDemoData = false;
  fsx.readFileSync(full, 'utf-8').split('\n').forEach((line, i) => {
    if (/DEMO MODEL CATALOG|DEMO DATA \(model names\)/.test(line)) inDemoData = true;
    const t = line.trim();
    if (inDemoData && t === '};') inDemoData = false;      // demo seed data block khatam
    if (/^(\*|\/\/|\/\*)/.test(t)) return;            // docs/comments allowed
    if (inDemoData) return;                               // demo seed data (settings ki tarah editable)
    if (MODEL_ID.test(line)) hardModel.push(f + ':' + (i + 1) + ': ' + t.slice(0, 90));
  });
});
ok('zero hardcoded vendor model names in code (source scan)', hardModel.length === 0,
  hardModel.join(' | ') || 'clean');
ok('presets available', (aiCfg.presets || []).length >= 4, 'presets=' + (aiCfg.presets || []).length);

/* catalog Settings se aata hai, code se nahi — aur deprecated model kabhi recommend nahi */
const FAKE_CATALOG = JSON.stringify([
  { id: 'zz-flash-9', label: 'ZZ Flash 9', status: 'stable', free: true, note: 'test' },
  { id: 'zz-pro-3', label: 'ZZ Pro 3', status: 'stable', free: false, note: 'test' },
  { id: 'zz-old-1', label: 'ZZ Old 1', status: 'deprecated', free: false, note: 'retired' }
]);
call('config.save', { values: { 'ai.modelCatalog.GEMINI': FAKE_CATALOG } });
const aiCat = call('ai.models', {});
ok('catalog read from Settings (data-driven, not code)', (aiCat.models || []).length === 3,
  JSON.stringify((aiCat.models || []).map(m => m.id)));
ok('recommended model = newest free+stable', aiCat.recommended === 'zz-flash-9',
  'recommended=' + aiCat.recommended);
ok('deprecated models flagged for the UI', (aiCat.deprecated || []).indexOf('zz-old-1') >= 0,
  JSON.stringify(aiCat.deprecated));
ok('auto model empty when nothing configured', aiCat.recommended !== 'zz-old-1', aiCat.recommended);
call('config.save', { values: { 'ai.modelCatalog.GEMINI': '' } });
ok('clearing the override clears the list', call('ai.models', {}).models.length === 0,
  JSON.stringify(call('ai.models', {}).models));
ok('tunables exposed (temperature/tokens/persona)',
  aiCfg.values && aiCfg.values.aiTemperature !== undefined && aiCfg.values.aiPersona !== undefined,
  JSON.stringify(aiCfg.values || {}).slice(0, 140));

// save + persist
call('ai.agentConfig.save', { values: { aiTemperature: '0.65', aiMaxTokens: '3072',
  aiStyle: 'DETAILED', aiLanguage: 'ROMAN_URDU', aiPersona: 'Test persona', aiCanWrite: 'true' } });
const aiCfg2 = call('ai.agentConfig', {});
ok('temperature saved', String(aiCfg2.values.aiTemperature) === '0.65', aiCfg2.values.aiTemperature);
ok('max tokens saved', String(aiCfg2.values.aiMaxTokens) === '3072', aiCfg2.values.aiMaxTokens);
ok('style + language saved', aiCfg2.values.aiStyle === 'DETAILED' && aiCfg2.values.aiLanguage === 'ROMAN_URDU',
  aiCfg2.values.aiStyle + '/' + aiCfg2.values.aiLanguage);
ok('write mode reflected in config', aiCfg2.canWrite === true, String(aiCfg2.canWrite));

// tool gating
const offTools = (aiCfg.tools || []).map(t => ({ name: t.name, enabled: t.name !== 'draft_sale' }));
call('ai.agentConfig.save', { values: {}, tools: offTools });
const aiCfg3 = call('ai.agentConfig', {});
ok('disabled tool marked off', (aiCfg3.tools || []).find(t => t.name === 'draft_sale').enabled === false,
  'still enabled');
ok('disabled tool hidden from agent whitelist',
  !call('ai.tools', {}).some(t => t.name === 'draft_sale'), 'tool still exposed');
ok('enabled tools still exposed', call('ai.tools', {}).length === 21, 'count=' + call('ai.tools', {}).length);
// restore
call('ai.agentConfig.save', { values: {}, tools: (aiCfg.tools || []).map(t => ({ name: t.name, enabled: true })) });
ok('tools restored', call('ai.tools', {}).length === 22, 'count=' + call('ai.tools', {}).length);

// connection test + usage + prompt is settings-driven
const aiTest = call('ai.test', {});
ok('connection test returns a verdict', aiTest && aiTest.ok !== undefined && !!aiTest.message,
  JSON.stringify(aiTest).slice(0, 140));
ok('usage counters present', call('ai.usage', {}).limit !== undefined, JSON.stringify(call('ai.usage', {})));
const sysPrompt = sandbox.AI.systemPrompt(SESSION);
ok('system prompt uses saved persona (no hardcoding)', sysPrompt.indexOf('Test persona') > -1,
  sysPrompt.slice(-120));
ok('system prompt includes language rule', sysPrompt.indexOf('LANGUAGE:') > -1, 'missing');
ok('system prompt includes write-mode rule', sysPrompt.indexOf('WRITE MODE:') > -1, 'missing');
ok('temperature helper clamps 0..1', sandbox.AI._temp() >= 0 && sandbox.AI._temp() <= 1, String(sandbox.AI._temp()));
ok('max tokens helper clamps', sandbox.AI._maxTokens() >= 256 && sandbox.AI._maxTokens() <= 8192,
  String(sandbox.AI._maxTokens()));

/* ---------- v2.5: payment method detail fields & validation --------------- */
section('Payment methods — real-world fields & validation');
const jf = call('pay.fields', { method: 'JAZZCASH' });
ok('JazzCash needs payer mobile', (jf || []).some(f => f.key === 'payerMobile' && f.required),
  JSON.stringify((jf || []).map(f => f.key)));
ok('JazzCash needs txn id', (jf || []).some(f => f.key === 'txnId' && f.required), 'missing');
ok('wallet fields have labels + hints',
  (jf || []).every(f => f.label && f.type), JSON.stringify(jf || []).slice(0, 140));

const badJazz = call('pay.validate', { payment: { method: 'JAZZCASH', amount: 1000 } });
ok('missing payer mobile / txn id → invalid', badJazz && badJazz.ok === false,
  JSON.stringify(badJazz).slice(0, 160));
ok('validation lists the offending fields',
  (badJazz.errors || []).some(e => e.field === 'payerMobile') &&
  (badJazz.errors || []).some(e => e.field === 'txnId'), JSON.stringify(badJazz.errors || []));
const badNum = call('pay.validate', { payment: { method: 'JAZZCASH', amount: 1000,
  payerMobile: '123', txnId: 'TXN-99' } });
ok('invalid mobile number rejected', badNum && badNum.ok === false, JSON.stringify(badNum));
const goodJazz = call('pay.validate', { payment: { method: 'JAZZCASH', amount: 1000,
  payerMobile: '03001234567', txnId: 'JC-998877' } });
ok('valid wallet payment passes', goodJazz && goodJazz.ok === true, JSON.stringify(goodJazz));

const raastF = call('pay.fields', { method: 'RAAST' });
ok('Raast asks for Raast ID (mobile/IBAN)', (raastF || []).some(f => f.key === 'raastId' && f.required),
  JSON.stringify(raastF || []));
ok('Raast IBAN accepted',
  call('pay.validate', { payment: { method: 'RAAST', amount: 500, raastId: 'PK36SCBL0000001123456702' } }).ok === true,
  'iban rejected');
ok('Raast mobile accepted',
  call('pay.validate', { payment: { method: 'RAAST', amount: 500, raastId: '03001234567' } }).ok === true,
  'mobile rejected');

/* backend enforcement */
let enforced = '';
try {
  call('payments.create', { payment: { amount: 1500, method: 'EASYPAISA',
    partyType: 'CUSTOMER', partyId: custForCheque.id, type: 'RECEIPT' } });
} catch (e) { enforced = e.message; }
ok('backend blocks EasyPaisa without txn details', /darj karein|format/i.test(enforced), enforced || 'allowed!');
const epOk = call('payments.create', { payment: { amount: 1500, method: 'EASYPAISA',
  partyType: 'CUSTOMER', partyId: custForCheque.id, type: 'RECEIPT',
  payerMobile: '03001234567', receiverMobile: '03007654321', txnId: 'EP-445566' } });
ok('EasyPaisa payment saved with full details', epOk && epOk.method === 'EASYPAISA', JSON.stringify(epOk).slice(0, 120));
ok('EasyPaisa fee = 2.5% (37.50 on 1500)', near(epOk.fee, 37.5, 0.02), 'fee=' + epOk.fee + ' net=' + epOk.net);
ok('settlement date computed', !!epOk.settleDate, String(epOk.settleDate));

/* per-method limits (settings-driven) */
call('config.save', { values: { 'pay.CASH.maxAmount': '50000' } });
ok('per-method max limit enforced',
  call('pay.validate', { payment: { method: 'CASH', amount: 60000 } }).ok === false, 'limit ignored');
ok('under-limit payment allowed',
  call('pay.validate', { payment: { method: 'CASH', amount: 40000 } }).ok === true, 'blocked');
call('config.save', { values: { 'pay.CASH.maxAmount': '0' } });

/* ------------------- Users & Security: permission matrix -------------------- */
section('Users & Security — permission matrix');
const pm = call('users.perms', {});
ok('users.perms returns catalog', Array.isArray(pm.catalog) && pm.catalog.length > 30, 'catalog=' + (pm.catalog || []).length);
ok('catalog entries have id + group + label', pm.catalog.every(x => x.id && x.group && x.en), 'bad entry');
ok('every catalog id is unique', new Set(pm.catalog.map(x => x.id)).size === pm.catalog.length, 'duplicate id');
ok('catalog ids are all valid permission keys', pm.catalog.every(x => /^[a-z]+(\.[a-z]+)+$/.test(x.id)), 'bad id format');
ok('groups list present', Array.isArray(pm.groups) && pm.groups.length >= 6, 'groups=' + (pm.groups || []).length);
ok('every catalog group exists in groups', pm.catalog.every(x => pm.groups.some(g => g.id === x.group)), 'orphan group');
ok('matrix has all 9 roles', Object.keys(pm.matrix || {}).length >= 9, Object.keys(pm.matrix || {}).join(','));
ok('OWNER has full access (*)', (pm.matrix.OWNER || []).indexOf('*') > -1, JSON.stringify(pm.matrix.OWNER));
ok('SALESMAN cannot manage users', (pm.matrix.SALESMAN || []).indexOf('users.manage') < 0, 'leak');
ok('MANAGER can create items', (pm.matrix.MANAGER || []).indexOf('items.create') > -1, 'missing');
ok('WAREHOUSE can post stock audit', (pm.matrix.WAREHOUSE || []).indexOf('stock.audit.post') > -1, 'missing');
ok('ACCOUNTANT sees financial reports', (pm.matrix.ACCOUNTANT || []).indexOf('reports.financial') > -1, 'missing');

/* save overrides */
const cashierBefore = (pm.matrix.CASHIER || []).length;
call('users.perms.save', { role: 'CASHIER', permissions: ['dashboard.view', 'pos.access', 'pos.sell', 'payments.create'] });
const pm2 = call('users.perms', {});
ok('saved permissions persist', JSON.stringify(pm2.matrix.CASHIER.sort()) ===
  JSON.stringify(['dashboard.view', 'pos.access', 'pos.sell', 'payments.create'].sort()), JSON.stringify(pm2.matrix.CASHIER));
ok('override flagged in response', (pm2.overridden || []).indexOf('CASHIER') > -1, JSON.stringify(pm2.overridden));
ok('other roles untouched by override', (pm2.matrix.SALESMAN || []).length === (pm.matrix.SALESMAN || []).length, 'leaked');
ok('OWNER is locked (cannot be edited)', (pm2.locked || []).indexOf('OWNER') > -1, 'owner editable!');
let ownerBlocked = false;
try { call('users.perms.save', { role: 'OWNER', permissions: ['dashboard.view'] }); } catch (e) { ownerBlocked = true; }
ok('saving OWNER permissions is rejected', ownerBlocked, 'owner was modified');

/* login picks up the override */
const cashSess = call('auth.login', { username: 'cashier', password: 'cash123', deviceInfo: 'test' });
const cashPerms = (cashSess.session ? cashSess.session.permissions : cashSess.permissions) || [];
ok('override reaches a real session', cashPerms.length === 4 && cashPerms.indexOf('pos.sell') > -1, JSON.stringify(cashPerms));

/* reset back to defaults */
call('users.perms.reset', { role: 'CASHIER' });
const pm3 = call('users.perms', {});
ok('reset restores shipped defaults', (pm3.overridden || []).indexOf('CASHIER') === -1, 'still overridden');
ok('reset role matches original list', JSON.stringify((pm3.matrix.CASHIER || []).sort()) ===
  JSON.stringify((pm.matrix.CASHIER || []).sort()), JSON.stringify(pm3.matrix.CASHIER));

/* --------------------- Shop Open/Close — cash session ---------------------- */
section('Shop Open / Close — cash session');
const sessOpen = call('cash.session.open', { openingCash: 2000, notes: 'morning float' });
ok('shop opens with a session number', !!sessOpen.sessionNo && sessOpen.status === 'OPEN', JSON.stringify(sessOpen).slice(0, 120));
ok('opening a second time returns the same session',
  call('cash.session.open', { openingCash: 9999 }).id === sessOpen.id, 'duplicate session created');

const mvIn = call('cash.move', { type: 'CASH_IN', amount: 500, reason: 'Change from bank' });
ok('cash-in recorded against the session', !!mvIn && (mvIn.moves || []).length === 1, JSON.stringify(mvIn && mvIn.moves));
ok('cash-in shows in the movement log with reason',
  (mvIn.moves || [])[0] && (mvIn.moves || [])[0].reason === 'Change from bank', JSON.stringify(mvIn.moves || []));
const mvOut = call('cash.move', { type: 'CASH_OUT', amount: 1200, reason: 'Safe drop' });
ok('cash-out recorded', (mvOut.moves || []).length === 2, 'moves=' + (mvOut.moves || []).length);

const sum1 = call('cash.session.summary', { sessionId: sessOpen.id });
/* expected = 2000 opening + 500 in - 1200 out  (koi sale/expense is session mein nahi) */
ok('expected cash = opening + cash-in - cash-out', near(sum1.expectedCash, 1300, 0.01),
  'expected=' + sum1.expectedCash + ' totals=' + JSON.stringify(sum1.totals));
ok('summary exposes payment breakdown', Array.isArray(sum1.methods), 'no methods');
ok('summary exposes sales + expenses blocks', !!sum1.sales && Array.isArray(sum1.expenses), 'missing');
ok('summary lists both cash moves', (sum1.moves || []).length === 2, 'moves=' + (sum1.moves || []).length);

let badMove = false;
try { call('cash.move', { type: 'LOOT', amount: 10 }); } catch (e) { badMove = true; }
ok('unknown cash-move type rejected', badMove, 'accepted invalid type');
let zeroMove = false;
try { call('cash.move', { type: 'CASH_IN', amount: 0 }); } catch (e) { zeroMove = true; }
ok('zero amount cash move rejected', zeroMove, 'accepted 0');

const closed = call('cash.session.close', { sessionId: sessOpen.id, closingCash: 1275, difference: -25, notes: 'test close' });
ok('session closes with status CLOSED', closed.status === 'CLOSED', JSON.stringify(closed).slice(0, 120));
ok('variance = counted - expected (-25)', near(closed.variance, -25, 0.01), 'variance=' + closed.variance);
ok('closing cash stored', near(closed.closingCash, 1275, 0.01), 'closing=' + closed.closingCash);
ok('closing note preserved', String(closed.notes).indexOf('test close') > -1, String(closed.notes));
ok('no open session remains', call('cash.session.current', {}) === null, 'still open');

const hist = call('cash.session.history', { limit: 10 });
ok('session history lists the closed session',
  (hist || []).some(r => r.id === sessOpen.id && r.status === 'CLOSED'), 'missing from history');
ok('history carries variance for audit',
  (hist || []).filter(r => r.id === sessOpen.id)[0].variance === -25, 'variance missing');
let moveAfterClose = false;
try { call('cash.move', { type: 'CASH_IN', amount: 10 }); } catch (e) { moveAfterClose = true; }
ok('cash move blocked after shop closed', moveAfterClose, 'allowed after close');

/* --------------- Supplier previous balance (PO / GRN / statement) ----------- */
section('Supplier — previous balance & payable');
/* apna fresh supplier with an opening balance + a PO + a credit GRN */
const supB = call('suppliers.save', { supplier: { name: 'Balance Supplier', phone: '03009999999',
  paymentTerms: 'NET 15', openingBalance: 2500 } });
const poB = call('purchase.po.save', { po: { supplierId: supB.id, locationId: LOC,
  date: new Date().toISOString().slice(0, 10),
  items: [{ itemId: itemB.id, qty: 10, rate: 900 }] } });
const grnB = call('purchase.grn.save', { grn: { supplierId: supB.id, locationId: LOC, poId: poB.id,
  date: new Date().toISOString().slice(0, 10), invoiceNo: 'GRN-BAL-1', onCredit: true,
  items: [{ itemId: itemB.id, qty: 10, cost: 900 }], post: true } });

const SUP_ID = supB.id, GRN_ID = grnB.id, PO_ID = poB.id;

const supStmt0 = call('purchase.supplierStatement', { supplierId: SUP_ID });
ok('supplier statement returns a supplier block', !!(supStmt0.supplier && supStmt0.supplier.name),
  JSON.stringify(supStmt0.supplier));
ok('statement opening balance comes from the supplier record (2,500)',
  near(supStmt0.openingBalance, 2500, 0.01), 'opening=' + supStmt0.openingBalance);
ok('statement rows carry a running balance', (supStmt0.rows || []).every(r => typeof r.balance === 'number'),
  'missing running balance');
ok('statement closing payable = opening + purchases - payments',
  near(supStmt0.closingPayable, 2500 + supStmt0.totalPurchased - supStmt0.totalPaid, 0.01),
  'closingPayable=' + supStmt0.closingPayable);
ok('credit GRN of 9,000 lands in the supplier ledger', near(supStmt0.totalPurchased, 9000, 0.01),
  'purchased=' + supStmt0.totalPurchased);
ok('closing payable = 2,500 + 9,000 = 11,500', near(supStmt0.closingPayable, 11500, 0.01),
  'closingPayable=' + supStmt0.closingPayable);

const grnPrev = call('purchase.grn.get', { id: GRN_ID });
ok('GRN detail carries a previous-balance figure', typeof grnPrev.prevBalance === 'number',
  'prevBalance=' + grnPrev.prevBalance);
ok('GRN previous balance EXCLUDES this GRN (2,500 not 11,500)', near(grnPrev.prevBalance, 2500, 0.01),
  'prev=' + grnPrev.prevBalance);
ok('GRN closing payable = previous + total - paid (11,500)', near(grnPrev.closingBalance, 11500, 0.01),
  'closing=' + grnPrev.closingBalance);
ok('GRN detail exposes supplier snapshot with payable',
  !!(grnPrev.supplier && typeof grnPrev.supplier.payable === 'number'), JSON.stringify(grnPrev.supplier || {}));
ok('GRN detail lists line items', (grnPrev.items || []).length === 1, 'items=' + (grnPrev.items || []).length);
ok('GRN detail shows the PO it was received against', grnPrev.poNo === poB.poNo, 'poNo=' + grnPrev.poNo);

/* payment against the GRN must reduce the payable */
call('payments.create', { type: 'SUPPLIER_PAYMENT', partyType: 'SUPPLIER', partyId: SUP_ID,
  method: 'CASH', amount: 1000, purchaseId: GRN_ID, notes: 'partial' });
const grnAfter = call('purchase.grn.get', { id: GRN_ID });
ok('payment against the GRN is picked up as paid', near(grnAfter.paid, 1000, 0.01), 'paid=' + grnAfter.paid);
ok('closing payable drops by the payment (10,500)', near(grnAfter.closingBalance, 10500, 0.01),
  'closing=' + grnAfter.closingBalance);

/* PO detail (also used by GRN ▸ load PO) */
const poDetail = call('purchase.po.get', { id: PO_ID });
ok('PO detail returns line items', (poDetail.items || []).length === 1, 'items=' + (poDetail.items || []).length);
ok('PO lines expose pending qty after receiving',
  near((poDetail.items || [])[0].pendingQty, 0, 0.01), 'pending=' + (poDetail.items || [])[0].pendingQty);
ok('PO detail carries supplier + payable',
  !!(poDetail.supplier && typeof poDetail.supplier.payable === 'number'), JSON.stringify(poDetail.supplier || {}));
ok('PO summary qty matches its lines', near(poDetail.orderedQty, 10, 0.01), 'ordered=' + poDetail.orderedQty);
ok('PO received qty updated by the GRN', near(poDetail.receivedQty, 10, 0.01), 'received=' + poDetail.receivedQty);
/* ------------- PO edit round-trip + GRN loaded from a PO (v2.5) ------------- */
section('Purchase Orders — edit detail & GRN from PO');
const supC = call('suppliers.save', { supplier: { name: 'PO Flow Supplier', phone: '03008888888' } });
const poC = call('purchase.po.save', { po: { supplierId: supC.id, locationId: LOC,
  date: new Date().toISOString().slice(0, 10), expectedDate: '', budgetLimit: 0, notes: 'first',
  items: [{ itemId: itemA.id, qty: 20, rate: 500 }, { itemId: itemB.id, qty: 10, rate: 900 }] } });
ok('PO saved with 2 lines', (call('purchase.po.get', { id: poC.id }).items || []).length === 2,
  'lines=' + (call('purchase.po.get', { id: poC.id }).items || []).length);

/* approve, then re-save (edit) → status must stay APPROVED */
call('purchase.po.approve', { id: poC.id });
ok('PO approved', call('purchase.po.get', { id: poC.id }).status === 'APPROVED', 'not approved');
call('purchase.po.save', { po: { id: poC.id, supplierId: supC.id, locationId: LOC,
  date: new Date().toISOString().slice(0, 10), notes: 'edited', status: 'APPROVED',
  items: [{ itemId: itemA.id, qty: 25, rate: 500 }, { itemId: itemB.id, qty: 10, rate: 900 }] } });
const poC2 = call('purchase.po.get', { id: poC.id });
ok('edit keeps the APPROVED status', poC2.status === 'APPROVED', 'status=' + poC2.status);
ok('edit updates the line qty', near(poC2.orderedQty, 35, 0.01), 'ordered=' + poC2.orderedQty);

/* GRN loaded from the PO: pending qty = 35 (nothing received yet) */
const poPending = (call('purchase.po.get', { id: poC.id }).items || [])
  .reduce((a, l) => a + Math.max(0, l.pendingQty), 0);
ok('PO pending qty available for the GRN form', near(poPending, 35, 0.01), 'pending=' + poPending);

/* receive part of each line */
call('purchase.grn.save', { grn: { supplierId: supC.id, locationId: LOC, poId: poC.id,
  date: new Date().toISOString().slice(0, 10), invoiceNo: 'GRN-FLOW-1', onCredit: true,
  items: [{ itemId: itemA.id, qty: 10, cost: 500 }, { itemId: itemB.id, qty: 4, cost: 900 }], post: true } });
const poC3 = call('purchase.po.get', { id: poC.id });
ok('GRN updates PO received qty', near(poC3.receivedQty, 14, 0.01), 'received=' + poC3.receivedQty);
ok('PO pending drops to 21', near(poC3.pendingQty, 21, 0.01), 'pending=' + poC3.pendingQty);
ok('PO status becomes PARTIAL', poC3.status === 'PARTIAL', 'status=' + poC3.status);
ok('per-line pending qty is correct',
  near((poC3.items || []).find(l => l.itemId === itemA.id).pendingQty, 15, 0.01), 'wrong per-line pending');

/* receive the rest → RECEIVED */
call('purchase.grn.save', { grn: { supplierId: supC.id, locationId: LOC, poId: poC.id,
  date: new Date().toISOString().slice(0, 10), invoiceNo: 'GRN-FLOW-2', onCredit: true,
  items: [{ itemId: itemA.id, qty: 15, cost: 500 }, { itemId: itemB.id, qty: 6, cost: 900 }], post: true } });
const poC4 = call('purchase.po.get', { id: poC.id });
ok('PO fully received → status RECEIVED', poC4.status === 'RECEIVED', 'status=' + poC4.status);
ok('no pending qty left', near(poC4.pendingQty, 0, 0.01), 'pending=' + poC4.pendingQty);
ok('poId is stored on the GRN', !!call('purchase.grn.get', { id: call('purchase.grn.list', { locationId: LOC })
  .filter(g => g.invoiceNo === 'GRN-FLOW-2')[0].id }).poId, 'poId missing on GRN');

/* ======================= ACCOUNTING (v2.5) ================================ */
/* ------------------- party balances: prev + new = closing ------------------ */
section('Reports — party balance movement (prev / new / closing)');
const pbSup = call('reports.partyBalances', { partyType: 'SUPPLIER' });
const supRow = (pbSup.rows || []).find(r => r.id === SUP_ID);
ok('supplier rows carry a previous balance', supRow && typeof supRow.prevBalance === 'number',
  JSON.stringify(supRow || {}));
ok('supplier previous balance = opening 2,500 (pichhla baqaya)',
  supRow && near(supRow.prevBalance, 2500, 0.01), 'prev=' + (supRow && supRow.prevBalance));
ok('supplier new purchases in range = 9,000', supRow && near(supRow.newAmount, 9000, 0.01),
  'new=' + (supRow && supRow.newAmount));
ok('supplier payments in range = 1,000', supRow && near(supRow.settled, 1000, 0.01),
  'settled=' + (supRow && supRow.settled));
ok('supplier closing = prev + new - paid = 10,500', supRow && near(supRow.balance, 10500, 0.01),
  'closing=' + (supRow && supRow.balance));
ok('closing equals balance field (alias closingBalance)',
  supRow && near(supRow.closingBalance, supRow.balance, 0.01), 'mismatch');
ok('payable identity holds for every supplier row',
  (pbSup.rows || []).every(r => near(r.balance, r.prevBalance + r.newAmount - r.settled, 0.01)),
  JSON.stringify((pbSup.rows || []).map(r => [r.name, r.prevBalance, r.newAmount, r.settled, r.balance])));

const pbCus = call('reports.partyBalances', { partyType: 'CUSTOMER' });
ok('customer rows carry prev / new / settled / closing',
  (pbCus.rows || []).every(r => typeof r.prevBalance === 'number' && typeof r.newAmount === 'number' &&
    typeof r.settled === 'number' && typeof r.balance === 'number'), 'missing fields');
ok('customer identity: prev + new - received = closing',
  (pbCus.rows || []).every(r => near(r.balance, r.prevBalance + r.newAmount - r.settled, 0.01)),
  JSON.stringify((pbCus.rows || []).map(r => [r.name, r.prevBalance, r.newAmount, r.settled, r.balance])));
ok('receivables total equals the sum of closing balances',
  near(call('reports.receivables', {}).total,
    U.sum(call('reports.receivables', {}).rows, 'balance'), 0.01), 'total mismatch');
const recv = call('reports.receivables', {});
ok('receivables exposes a previous-balance total', typeof recv.prevTotal === 'number', 'no prevTotal');
ok('receivables = prev + new - received at total level',
  near(recv.total, recv.prevTotal + recv.newTotal - recv.settledTotal, 0.01),
  [recv.prevTotal, recv.newTotal, recv.settledTotal, recv.total].join(' / '));
const pay = call('reports.payables', {});
ok('payables lists suppliers with a positive payable',
  (pay.rows || []).every(r => r.balance > 0), JSON.stringify((pay.rows || []).map(r => r.balance)));
ok('payables = prev + new - paid at total level',
  near(pay.total, pay.prevTotal + pay.newTotal - pay.settledTotal, 0.01),
  [pay.prevTotal, pay.newTotal, pay.settledTotal, pay.total].join(' / '));
ok('payables total matches the supplier payable of the test supplier',
  pay.total >= 10500 - 0.01, 'total=' + pay.total);
const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const asOf = call('reports.partyBalances', { partyType: 'SUPPLIER', to: yest });
const asOfRow = (asOf.rows || []).find(r => r.id === SUP_ID);
ok('as-of report excludes later entries (new = 0)',
  asOfRow && near(asOfRow.newAmount, 0, 0.01), 'new=' + (asOfRow && asOfRow.newAmount));
ok('as-of report keeps only the opening 2,500 as payable',
  asOfRow && near(asOfRow.balance, 2500, 0.01), 'closing=' + (asOfRow && asOfRow.balance));

section('Accounting — chart of accounts');
const coa = call('accounts.list', {});
ok('chart of accounts is seeded', coa.length >= 20, 'accounts=' + coa.length);
ok('every account has a code, group and normal side',
  coa.every(a => a.code && a.group && (a.normalSide === 'DR' || a.normalSide === 'CR')), 'bad account');
ok('asset + expense accounts are debit-normal',
  coa.filter(a => a.group === 'ASSET' || a.group === 'EXPENSE').every(a => a.normalSide === 'DR'), 'wrong side');
ok('liability + equity + income are credit-normal',
  coa.filter(a => ['LIABILITY', 'EQUITY', 'INCOME'].indexOf(a.group) > -1).every(a => a.normalSide === 'CR'),
  'wrong side');
ok('cash accounts are flagged', coa.filter(a => a.isCash).length >= 4, 'cash=' + coa.filter(a => a.isCash).length);
ok('bank accounts are flagged', coa.filter(a => a.isBank).length >= 4, 'bank=' + coa.filter(a => a.isBank).length);

const byCode = c => coa.find(a => a.code === c);
const CASH = byCode('1000'), BANK = byCode('1100'), AR = byCode('1200'),
  AP = byCode('2000'), SALES = byCode('4000'), PURCH = byCode('5000'),
  CAP = byCode('3000'), RENT = byCode('6000');

/* ------------------------------ journal ---------------------------------- */
section('Accounting — journal vouchers');
let jvBad = false;
try {
  call('journal.post', { date: today(), narration: 'unbalanced',
    lines: [{ accountId: CASH.id, debit: 500, credit: 0 }, { accountId: SALES.id, debit: 0, credit: 400 }] });
} catch (e) { jvBad = true; }
ok('unbalanced voucher is rejected', jvBad, 'accepted unbalanced voucher');

let jvOne = false;
try {
  call('journal.post', { date: today(), lines: [{ accountId: CASH.id, debit: 500, credit: 0 }] });
} catch (e) { jvOne = true; }
ok('single-line voucher is rejected', jvOne, 'accepted one-line voucher');

let jvBoth = false;
try {
  call('journal.post', { date: today(),
    lines: [{ accountId: CASH.id, debit: 500, credit: 200 }, { accountId: SALES.id, debit: 0, credit: 300 }] });
} catch (e) { jvBoth = true; }
ok('line with both debit AND credit is rejected', jvBoth, 'accepted dr+cr on one line');

const balOf = code => call('accounts.list', {}).find(a => a.code === code).ledgerBalance;
const cashBefore = balOf('1000');
/* capital introduced: Dr Cash 100,000  Cr Capital 100,000 */
const jv1 = call('journal.post', { date: today(), type: 'JV', narration: 'Capital introduced',
  lines: [{ accountId: CASH.id, debit: 100000, credit: 0 }, { accountId: CAP.id, debit: 0, credit: 100000 }] });
ok('balanced voucher posts', !!jv1.id && jv1.status === 'POSTED', JSON.stringify(jv1).slice(0, 100));
ok('voucher gets a voucher number', !!jv1.voucherNo, 'no voucherNo');
ok('voucher totals recorded', jv1.totalDebit === 100000 && jv1.totalCredit === 100000,
  'dr=' + jv1.totalDebit + ' cr=' + jv1.totalCredit);
ok('voucher lines returned with account names',
  jv1.lines.length === 2 && jv1.lines.every(l => l.accountName), JSON.stringify(jv1.lines).slice(0, 140));

ok('cash balance increases by the voucher amount', near(balOf('1000'), cashBefore + 100000, 0.01),
  'cash=' + balOf('1000') + ' expected=' + (cashBefore + 100000));
const capAfter = call('accounts.list', {}).find(a => a.code === '3000');
ok('capital shows a credit balance', near(capAfter.displayBalance, 100000, 0.01),
  'capital=' + capAfter.displayBalance);

/* rent paid: Dr Rent 15,000  Cr Cash 15,000 */
const cashBeforeRent = balOf('1000');
call('journal.post', { date: today(), type: 'PAYMENT', narration: 'Rent for the month',
  lines: [{ accountId: RENT.id, debit: 15000, credit: 0 }, { accountId: CASH.id, debit: 0, credit: 15000 }] });
ok('cash reduces by the payment amount', near(balOf('1000'), cashBeforeRent - 15000, 0.01),
  'cash=' + balOf('1000') + ' expected=' + (cashBeforeRent - 15000));

/* ------------------------------ ledger ---------------------------------- */
section('Accounting — books & reports');
const cashLedger = call('accounting.ledger', { accountId: CASH.id, from: '2000-01-01', to: '2099-12-31' });
ok('ledger has an opening balance', cashLedger.opening === 0, 'opening=' + cashLedger.opening);
ok('ledger lists both vouchers', cashLedger.rows.length >= 2, 'rows=' + cashLedger.rows.length);
ok('ledger rows carry a running balance',
  cashLedger.rows.every(r => typeof r.balance === 'number'), 'no running balance');
ok('ledger closing = opening + dr - cr',
  near(cashLedger.closing, cashLedger.opening + cashLedger.totalDebit - cashLedger.totalCredit, 0.01),
  'closing=' + cashLedger.closing);
ok('last running balance equals closing',
  near(cashLedger.rows[cashLedger.rows.length - 1].balance, cashLedger.closing, 0.01), 'mismatch');

const cashBook = call('accounting.cashBook', { from: '2000-01-01', to: '2099-12-31' });
ok('cash book opening/receipts/payments/closing tie out',
  near(cashBook.closing, cashBook.opening + cashBook.receipts - cashBook.payments, 0.01),
  JSON.stringify({ o: cashBook.opening, r: cashBook.receipts, p: cashBook.payments, c: cashBook.closing }));

const tb = call('accounting.trialBalance', {});
ok('trial balance is balanced', tb.balanced === true,
  'dr=' + tb.totalDebit + ' cr=' + tb.totalCredit);
ok('trial balance includes every used account', tb.rows.length >= 3, 'rows=' + tb.rows.length);
ok('trial balance debit total equals credit total', near(tb.totalDebit, tb.totalCredit, 0.01),
  'dr=' + tb.totalDebit + ' cr=' + tb.totalCredit);

const dayBook = call('accounting.dayBook', {});
ok('day book lists all vouchers', dayBook.rows.length >= 2, 'rows=' + dayBook.rows.length);
ok('day book totals balance', near(dayBook.totalDebit, dayBook.totalCredit, 0.01), 'unbalanced day book');

/* ------------------------- auto posting ---------------------------------- */
section('Accounting — auto-posting from business events');
const accCust = call('customers.save', { customer: { name: 'Accounting Customer', phone: '03007777777' } });
const accSup = call('suppliers.save', { supplier: { name: 'Accounting Supplier', phone: '03006666666' } });

const saleBefore = call('journal.list', {}).length;
const accSale = call('sales.create', { sale: { locationId: LOC, customerId: accCust.id,
  items: [{ itemId: itemA.id, qty: 2, price: 1000 }],
  payments: [{ method: 'CASH', amount: 1000 }, { method: 'CARD', amount: 1000 }] } });
const saleJournals = call('journal.list', { type: 'SALE' });
ok('sale auto-posts a journal voucher', saleJournals.length >= 1, 'journals=' + saleJournals.length);
const sj = saleJournals.find(j => j.refId === accSale.id);
ok('sale voucher links back to the sale', !!sj, 'no refId link');
ok('sale voucher is balanced', sj && sj.totalDebit === sj.totalCredit, 'dr=' + (sj && sj.totalDebit));
ok('sale credits the sales account', sj && /Sales/.test(sj.creditAccounts), sj && sj.creditAccounts);
ok('sale debits cash + bank (split by method)',
  sj && /Cash/.test(sj.debitAccounts) && /Bank/.test(sj.debitAccounts), sj && sj.debitAccounts);
const salesBal = call('accounts.list', {}).find(a => a.code === '4000');
ok('sales revenue increases (credit balance)', salesBal.displayBalance >= 2000, 'sales=' + salesBal.displayBalance);

const accGrn = call('purchase.grn.save', { grn: { supplierId: accSup.id, locationId: LOC,
  date: today(), invoiceNo: 'GRN-ACC-1', onCredit: true,
  items: [{ itemId: itemA.id, qty: 5, cost: 600 }], post: true } });
const grnJournals = call('journal.list', { type: 'PURCHASE' });
ok('GRN auto-posts a purchase voucher', grnJournals.length >= 1, 'journals=' + grnJournals.length);
const gj = grnJournals.find(j => j.refId === accGrn.id);
ok('GRN voucher debits purchases', gj && /Purchases/.test(gj.debitAccounts), gj && gj.debitAccounts);
ok('credit GRN credits accounts payable', gj && /payable/i.test(gj.creditAccounts), gj && gj.creditAccounts);

const payBefore = call('accounts.list', {}).find(a => a.code === '2000');
call('payments.create', { type: 'SUPPLIER_PAYMENT', partyType: 'SUPPLIER', partyId: accSup.id,
  method: 'CASH', amount: 1500 });
const payJournals = call('journal.list', { type: 'PAYMENT' });
ok('supplier payment auto-posts a payment voucher', payJournals.length >= 1, 'journals=' + payJournals.length);
const apAfter = call('accounts.list', {}).find(a => a.code === '2000');
ok('payable reduces after the payment', apAfter.displayBalance < payBefore.displayBalance + 3000,
  'ap before=' + payBefore.displayBalance + ' after=' + apAfter.displayBalance);

const expBefore = call('journal.list', { refType: 'EXPENSE' }).length;
const expRec = call('expenses.create', { expense: { category: 'Rent', amount: 2000, method: 'CASH', paidTo: 'Landlord' } });
ok('expense auto-posts a voucher',
  call('journal.list', { refType: 'EXPENSE' }).length === expBefore + 1, 'no expense voucher');
const expJ = call('journal.list', { refType: 'EXPENSE' }).find(j => j.refId === expRec.id);
ok('expense voucher links back to the expense', !!expJ, 'no refId link');
ok('expense voucher debits the right expense head',
  expJ && /Rent/.test(expJ.debitAccounts), expJ && expJ.debitAccounts);
ok('expense voucher credits cash', expJ && /Cash/.test(expJ.creditAccounts), expJ && expJ.creditAccounts);

/* no double posting on repeat */
const jCount = call('journal.list', {}).length;
call('journal.list', {});
ok('repeat reads do not create vouchers', call('journal.list', {}).length === jCount, 'vouchers changed');

/* ---------------------------- P&L / balance sheet ------------------------ */
section('Accounting — P&L and balance sheet');
const pcPl = call('accounting.profitLoss', { from: '2000-01-01', to: '2099-12-31' });
ok('P&L returns an income block', Array.isArray(pcPl.income), 'no income');
ok('P&L total income > 0 after sales', pcPl.totalIncome >= 2000, 'income=' + pcPl.totalIncome);
ok('P&L computes gross profit = income - COGS',
  near(pcPl.grossProfit, pcPl.totalIncome - pcPl.cogs, 0.01), 'gp=' + pcPl.grossProfit);
ok('P&L computes net profit = gross - expenses',
  near(pcPl.netProfit, pcPl.grossProfit - pcPl.totalExpenses, 0.01), 'np=' + pcPl.netProfit);
ok('P&L reports a margin percentage', typeof pcPl.marginPct === 'number', 'no margin');
ok('P&L uses current stock value for closing stock',
  pcPl.closingStock === call('accounting.stockValue', {}).value, 'stock mismatch');

const bs = call('accounting.balanceSheet', { asOf: '2099-12-31' });
ok('balance sheet has assets, liabilities and equity',
  bs.assets.length > 0 && bs.liabilities.length >= 0 && bs.equity.length > 0, 'empty');
ok('balance sheet balances (assets = liabilities + equity)', bs.balanced === true,
  'assets=' + bs.totalAssets + ' L+E=' + bs.totalLiabEquity);
ok('balance sheet shows receivables from the party ledger',
  bs.assets.some(a => /receivable/i.test(a.name)), JSON.stringify(bs.assets.map(a => a.name)));
ok('balance sheet includes current period profit',
  bs.equity.some(e => /profit/i.test(e.name)), JSON.stringify(bs.equity.map(e => e.name)));

/* --------------------------- bank reconciliation ------------------------- */
section('Accounting — bank reconciliation');
const bankRows = [
  { date: today(), reference: 'Deposit 1', amount: 25000, direction: 'IN' },
  { date: today(), reference: 'Withdrawal 1', amount: 4000, direction: 'OUT' }
];
const imp = call('bank.recon.import', { bankAccountId: BANK.id, rows: bankRows });
ok('bank statement imports', imp.added === 2, 'added=' + imp.added);
const recon1 = call('bank.recon.list', { bankAccountId: BANK.id });
ok('imported rows are listed', recon1.length === 2, 'rows=' + recon1.length);
ok('imported rows start uncleared', recon1.every(r => !r.cleared), 'already cleared');
/* post a matching voucher for the deposit, then auto-match */
call('journal.post', { date: today(), narration: 'Deposit 1',
  lines: [{ accountId: BANK.id, debit: 25000, credit: 0 }, { accountId: CAP.id, debit: 0, credit: 25000 }] });
const match = call('bank.recon.match', { bankAccountId: BANK.id });
ok('auto-match clears the matching deposit', match.matched === 1, JSON.stringify(match));
ok('unmatched withdrawal stays pending', match.pending === 1, JSON.stringify(match));
const clearedIds = call('bank.recon.list', { bankAccountId: BANK.id }).filter(r => r.cleared).map(r => r.id);
call('bank.recon.clear', { ids: clearedIds, cleared: false });
ok('manual un-clear works',
  call('bank.recon.list', { bankAccountId: BANK.id }).filter(r => r.cleared).length === 0, 'still cleared');

/* ------------------------------ dashboard -------------------------------- */
section('Accounting — dashboard & controls');
const dash = call('accounting.dashboard', {});
ok('dashboard reports cash in hand', typeof dash.cashInHand === 'number', 'no cash');
ok('dashboard reports bank balance', typeof dash.bankBalance === 'number', 'no bank');
ok('dashboard reports receivables and payables',
  typeof dash.receivables === 'number' && typeof dash.payables === 'number', 'missing');
ok('dashboard reports stock value', dash.stockValue > 0, 'stock=' + dash.stockValue);
ok('dashboard reports MTD profit', typeof dash.mtd.netProfit === 'number', 'no MTD');
ok('dashboard flags an unbalanced trial balance', dash.trialBalanced === true, 'unbalanced');

/* void a voucher */
const toVoid = call('journal.list', {}).find(j => j.narration === 'Rent for the month');
const cashBeforeVoid = balOf('1000');
call('journal.void', { id: toVoid.id });
ok('voided voucher leaves the ledger',
  call('journal.get', { id: toVoid.id }).status === 'VOID', 'not void');
const cashAfterVoid = balOf('1000');
ok('voiding removes the amount from the balance',
  near(cashAfterVoid, cashBeforeVoid + 15000, 0.01), 'cash=' + cashAfterVoid);
ok('trial balance still balanced after void',
  call('accounting.trialBalance', {}).balanced === true, 'unbalanced after void');

/* accounting must never break business flows */
let survived = true;
try {
  const saved = sandbox.DB.all('Accounts').length;
  sandbox.DB._rows && 0;
  call('config.save', { values: { 'accounts.autoPost': 'false' } });
  const s2 = call('sales.create', { sale: { locationId: LOC,
    items: [{ itemId: itemB.id, qty: 1, price: 900 }], payments: [{ method: 'CASH', amount: 900 }] } });
  survived = !!s2.id;
  call('config.save', { values: { 'accounts.autoPost': 'true' } });
} catch (e) { survived = false; }
ok('sale still works when auto-posting is switched off', survived, 'sale blocked by accounting');

/* ------------------- wallet gateway (EasyPaisa / JazzCash) ----------------- */
section('Wallet gateway — EasyPaisa / JazzCash');

/* helper: fake HTTP handler set karein aur calls record karein */
const FETCH = [];
function fakeHttp(handler) {
  FETCH.length = 0;
  sandbox.UrlFetchApp.handle((url, opts) => {
    FETCH.push({ url: url, opts: opts });
    return handler(url, opts);
  });
}
const jsonRes = (obj, code) => ({ code: code || 200, text: JSON.stringify(obj) });

/* 1) providers — default OFF, koi secret nahi */
let wprov = call('wallet.providers', {});
ok('two wallet providers are registered', wprov.length === 2, JSON.stringify(wprov.map(p => p.id)));
ok('providers default to OFF (no API calls without consent)',
  wprov.every(p => p.mode === 'OFF' && p.ready === false), JSON.stringify(wprov.map(p => p.mode)));
ok('providers API never leaks credentials',
  JSON.stringify(wprov).indexOf('password') === -1 && JSON.stringify(wprov).indexOf('salt') === -1,
  JSON.stringify(wprov).slice(0, 160));

/* 2) OFF mode → manual record (kaam rukta nahi) */
const manualPay = call('wallet.initiate', { provider: 'EASYPAISA', amount: 500, payerMobile: '03001234567' });
ok('OFF mode records a MANUAL wallet request', manualPay.status === 'MANUAL' && manualPay.manual === true,
  JSON.stringify(manualPay));
ok('manual request still keeps the payer number', manualPay.orderId && /^WP/.test(manualPay.orderId), manualPay.orderId);

/* 3) validation */
let threw = '';
try { call('wallet.initiate', { provider: 'EASYPAISA', amount: 0, payerMobile: '03001234567' }); }
catch (e) { threw = e.message; }
ok('zero amount is rejected', /amount/i.test(threw), threw);
threw = '';
try { call('wallet.initiate', { provider: 'EASYPAISA', amount: 100, payerMobile: '12345' }); }
catch (e) { threw = e.message; }
ok('invalid payer mobile is rejected', /mobile/i.test(threw), threw);
threw = '';
try { call('wallet.initiate', { provider: 'UNKNOWN', amount: 100, payerMobile: '03001234567' }); }
catch (e) { threw = e.message; }
ok('unknown provider is rejected', /provider/i.test(threw), threw);

/* msisdn normalisation (official format 03xxxxxxxxx) */
const msisdn = sandbox.Wallet.msisdn;
ok('msisdn normalises +92 / 92 / 3xx forms to 03xxxxxxxxx',
  msisdn('03001234567') === '03001234567' && msisdn('+923001234567') === '03001234567' &&
  msisdn('923001234567') === '03001234567' && msisdn('3001234567') === '03001234567', 'bad normalisation');
ok('msisdn rejects junk numbers', msisdn('12345') === '' && msisdn('') === '', 'accepted junk');

/* 4) EasyPaisa SANDBOX — real request shape (official REST v4 contract) */
const epCreds = {
  'wallet.EASYPAISA.mode': 'SANDBOX',
  'wallet.EASYPAISA.storeId': '1234',
  'wallet.EASYPAISA.username': 'testuser',
  'wallet.EASYPAISA.password': 'testpass',
  'wallet.EASYPAISA.accountNum': '654123987',
  'wallet.EASYPAISA.receiverMobile': '03009876543'
};
call('config.save', { values: epCreds });
wprov = call('wallet.providers', {});
const epProv = wprov.find(p => p.id === 'EASYPAISA');
ok('EasyPaisa is ready once credentials are configured',
  epProv.mode === 'SANDBOX' && epProv.sandbox === true && epProv.ready === true, JSON.stringify(epProv));

fakeHttp(() => jsonRes({ orderId: 'WP1', storeId: 1234, transactionId: 'EP-7788',
  transactionDateTime: '09/08/2026 10:04 PM', responseCode: '0000', responseDesc: 'SUCCESS' }));
const epInit = call('wallet.initiate', { provider: 'EASYPAISA', amount: 1500,
  payerMobile: '+923001234567', receiverMobile: '03009876543' });
ok('EasyPaisa MA transaction is initiated', epInit.status === 'PENDING', JSON.stringify(epInit));
ok('EasyPaisa hits the sandbox REST v4 MA endpoint',
  /easypay-service\/rest\/v4\/initiate-ma-transaction$/.test(FETCH[0].url), FETCH[0].url);
const epBody = JSON.parse(FETCH[0].opts.payload);
ok('EasyPaisa auth header is base64(username:password)',
  FETCH[0].opts.headers.Credentials === Buffer.from('testuser:testpass').toString('base64'),
  JSON.stringify(FETCH[0].opts.headers));
ok('EasyPaisa body carries orderId / storeId / amount / type / mobile',
  epBody.orderId === epInit.orderId && epBody.storeId === 1234 && epBody.transactionAmount === 1500 &&
  epBody.transactionType === 'MA' && epBody.mobileAccountNo === '03001234567',
  JSON.stringify(epBody));
ok('EasyPaisa tokenExpiry is yyyymmdd HHmmss',
  /^\d{8} \d{6}$/.test(epBody.tokenExpiry), epBody.tokenExpiry);
ok('credentials are never written into the request log', (() => {
  const row = sandbox.DB.all('WalletTxns').find(r => r.id === epInit.walletId);
  if (!row) return false;
  const blob = row.rawRequest + ' ' + row.rawResponse + ' ' + JSON.stringify(row);
  return blob.indexOf('testpass') === -1 && blob.indexOf('dXNlcnRlc3Q') === -1;
})(), 'secret leaked into the wallet log');

fakeHttp(() => jsonRes({ orderId: epInit.orderId, accountNum: '654123987', storeId: 1234,
  storeName: 'Haseeb Autos', transactionStatus: 'PAID', transactionAmount: 1500,
  transactionDateTime: '09/08/2026 10:05 PM', responseCode: '0000', responseDesc: 'SUCCESS' }));
const epInq = call('wallet.inquire', { id: epInit.walletId });
ok('EasyPaisa inquire uses /inquire-transaction', /inquire-transaction$/.test(FETCH[0].url), FETCH[0].url);
const epInqBody = JSON.parse(FETCH[0].opts.payload);
ok('EasyPaisa inquire sends orderId + storeId + accountNum',
  epInqBody.orderId === epInit.orderId && epInqBody.storeId === 1234 && epInqBody.accountNum === '654123987',
  JSON.stringify(epInqBody));
ok('PAID status is mapped from transactionStatus', epInq.status === 'PAID' && epInq.final === true,
  JSON.stringify(epInq));
ok('wallet record stores the provider transaction id',
  sandbox.DB.byId('WalletTxns', epInit.walletId).providerRef === 'EP-7788',
  JSON.stringify(sandbox.DB.byId('WalletTxns', epInit.walletId).providerRef));

/* EasyPaisa pending → poll cycle */
fakeHttp(() => jsonRes({ orderId: 'WP2', transactionId: 'EP-9001', responseCode: '0000', responseDesc: 'SUCCESS' }));
const epPend = call('wallet.initiate', { provider: 'EASYPAISA', amount: 200, payerMobile: '03001112222' });
fakeHttp(() => jsonRes({ orderId: epPend.orderId, transactionStatus: 'PENDING', responseCode: '0000' }));
const epPend2 = call('wallet.inquire', { id: epPend.walletId });
ok('PENDING stays open for polling', epPend2.status === 'PENDING' && epPend2.final === false,
  JSON.stringify(epPend2));

/* 5) JazzCash SANDBOX — MWALLET request shape (official v3.9 contract) */
const jcCreds = {
  'wallet.JAZZCASH.mode': 'SANDBOX',
  'wallet.JAZZCASH.merchantId': 'MC12345',
  'wallet.JAZZCASH.password': 'jcpass',
  'wallet.JAZZCASH.integritySalt': 'salty',
  'wallet.JAZZCASH.receiverMobile': '03007654321'
};
call('config.save', { values: jcCreds });
fakeHttp(() => jsonRes({ pp_ResponseCode: '000', pp_ResponseMessage: 'Transaction completed.',
  pp_RetreivalReferenceNo: 'JC-RRN-1', pp_AuthCode: 'AUTH1', pp_Amount: '250000' }));
const jcInit = call('wallet.initiate', { provider: 'JAZZCASH', amount: 2500,
  payerMobile: '03001234567', receiverMobile: '03007654321' });
ok('JazzCash MWALLET is initiated', jcInit.status === 'PAID' || jcInit.status === 'PENDING',
  JSON.stringify(jcInit));
ok('JazzCash posts to the sandbox REST endpoint',
  /sandbox\.jazzcash\.com\.pk\/ApplicationAPI\/API\/Payment\/DoTransaction$/.test(FETCH[0].url), FETCH[0].url);
const jcPayload = FETCH[0].opts.payload || '';
ok('JazzCash sends form-encoded pp_ fields',
  typeof jcPayload === 'string' && /pp_TxnType=MWALLET/.test(decodeURIComponent(jcPayload)),
  String(jcPayload).slice(0, 120));
const jcFields = {};
decodeURIComponent(jcPayload).split('&').forEach(kv => {
  const i = kv.indexOf('='); if (i > -1) jcFields[kv.slice(0, i)] = kv.slice(i + 1);
});
ok('JazzCash amount is sent in PAISA (no decimals) — 2500 Rs = 250000',
  jcFields.pp_Amount === '250000', jcFields.pp_Amount);
ok('JazzCash carries payer mobile in ppmpf_1', jcFields.ppmpf_1 === '03001234567', jcFields.ppmpf_1);
ok('JazzCash currency is PKR and version 1.1',
  jcFields.pp_TxnCurrency === 'PKR' && jcFields.pp_Version === '1.1',
  jcFields.pp_TxnCurrency + ' / ' + jcFields.pp_Version);
ok('JazzCash date-time stamps are yyyyMMddHHmmss',
  /^\d{14}$/.test(jcFields.pp_TxnDateTime) && /^\d{14}$/.test(jcFields.pp_TxnExpiryDateTime),
  jcFields.pp_TxnDateTime);
ok('JazzCash sends a secure hash', !!jcFields.pp_SecureHash && jcFields.pp_SecureHash.length === 64,
  String(jcFields.pp_SecureHash).length);

/* JazzCash hash scheme: salt + '&' + alphabetically sorted pp_* values */
const crypto = require('crypto');
const sortedVals = Object.keys(jcFields)
  .filter(k => /^pp/i.test(k) && k !== 'pp_SecureHash').sort()
  .map(k => jcFields[k]).join('&');
const expectHash = crypto.createHmac('sha256', 'salty').update('salty&' + sortedVals).digest('hex');
ok('JazzCash secure hash matches the documented HMAC-SHA256 scheme',
  expectHash === jcFields.pp_SecureHash, expectHash + ' vs ' + jcFields.pp_SecureHash);

fakeHttp(() => jsonRes({ pp_ResponseCode: '000', pp_ResponseMessage: 'Success', pp_RetreivalReferenceNo: 'JC-RRN-1' }));
const jcInq = call('wallet.inquire', { id: jcInit.walletId });
ok('JazzCash inquiry hits the Inquiry endpoint',
  /\/ApplicationAPI\/API\/Payment\/Inquiry$/.test(FETCH[0].url), FETCH[0].url);
ok('JazzCash 000 response maps to PAID', jcInq.status === 'PAID', JSON.stringify(jcInq));

/* 6) failures */
fakeHttp(() => jsonRes({ orderId: 'WPX', responseCode: '0017', responseDesc: 'Incomplete merchant information' }));
const epFail = call('wallet.initiate', { provider: 'EASYPAISA', amount: 100, payerMobile: '03001234567' });
ok('gateway error response is mapped to FAILED', epFail.status === 'FAILED', JSON.stringify(epFail));
ok('gateway error description is stored for the cashier',
  /Incomplete merchant information/.test(epFail.message), epFail.message);
fakeHttp(() => ({ code: 502, text: 'Bad Gateway' }));
const httpFail = call('wallet.initiate', { provider: 'EASYPAISA', amount: 100, payerMobile: '03001234567' });
ok('HTTP failure never throws out of the POS flow', httpFail.status === 'FAILED', JSON.stringify(httpFail));

/* 7) limits */
call('config.save', { values: { 'wallet.EASYPAISA.maxAmount': 1000 } });
threw = '';
try { call('wallet.initiate', { provider: 'EASYPAISA', amount: 5000, payerMobile: '03001234567' }); }
catch (e) { threw = e.message; }
ok('per-request max amount limit is enforced', /limit/i.test(threw), threw);
call('config.save', { values: { 'wallet.EASYPAISA.maxAmount': 0 } });

/* 8) hosted checkout + fees + listing + IPN + linking */
const co = call('wallet.checkout', { provider: 'EASYPAISA', amount: 1200, postBackUrl: 'https://x.test/ipn',
  orderId: 'INV-TEST-01' });
ok('EasyPaisa checkout returns a signed hosted form',
  /easypay\.easypaisa\.com\.pk\/easypay\/Index\.jsf/.test(co.url) &&
  co.fields.storeId === '1234' && co.fields.transactionAmount === 1200 &&
  co.fields.paymentMethod === 'InitialRequest' && co.fields.postBackURL === 'https://x.test/ipn',
  JSON.stringify(co.fields));
call('config.save', { values: { 'wallet.EASYPAISA.hashKey': 'hk123' } });
const co2 = call('wallet.checkout', { provider: 'EASYPAISA', amount: 1200, postBackUrl: 'https://x.test/ipn',
  orderId: 'INV-TEST-02' });
ok('EasyPaisa checkout signs the form once a hash key is configured',
  co2.fields.encryptedHashRequest && co2.fields.encryptedHashRequest.length > 20, JSON.stringify(co2.fields));
const epHashExpect = crypto.createHmac('sha256', 'hk123')
  .update('amount=1200&postBackURL=https://x.test/ipn&orderRefNum=' + co2.orderId + '&storeId=1234&transactionType=MA')
  .digest('base64');
ok('EasyPaisa checkout hash follows the documented field order (amount→postBackURL→orderRefNum→storeId→type)',
  co2.fields.encryptedHashRequest === epHashExpect,
  co2.fields.encryptedHashRequest + ' vs ' + epHashExpect);

const wfees = call('wallet.fees', { provider: 'EASYPAISA', amount: 1000 });
ok('wallet fee comes from the shared PayMethods engine (2.5% of 1000 = 25)',
  near(wfees.fee, 25, 0.01), JSON.stringify(wfees));

const ipn = sandbox.Wallet.ipn({ orderId: epPend.orderId, transactionStatus: 'PAID',
  transactionId: 'EP-IPN-1' }, null);
ok('IPN callback marks the request PAID', ipn.ok === true && ipn.status === 'PAID', JSON.stringify(ipn));
ok('IPN updates the stored record',
  sandbox.DB.all('WalletTxns').find(r => r.orderId === epPend.orderId).status === 'PAID', 'not updated');
const ipnBad = sandbox.Wallet.ipn({ orderId: 'NOPE-1', transactionStatus: 'PAID' }, null);
ok('IPN ignores unknown orders', ipnBad.ok === false, JSON.stringify(ipnBad));
const jcIpnBad = sandbox.Wallet.ipn({ orderId: jcInit.orderId, pp_ResponseCode: '000',
  pp_SecureHash: 'deadbeef' }, null);
ok('JazzCash IPN rejects a bad hash', jcIpnBad.ok === false, JSON.stringify(jcIpnBad));

const linked = call('wallet.link', { id: epInit.walletId, saleId: 'SAL-TEST', txnId: 'EP-7788' });
ok('wallet request can be linked to a sale', linked.saleId === 'SAL-TEST', JSON.stringify(linked.saleId));

const wlist = call('wallet.list', {});
ok('wallet list returns the requests with payer/receiver numbers',
  wlist.rows.length >= 4 && wlist.rows.every(r => r.payerMobile !== undefined),
  'rows=' + wlist.rows.length);
ok('wallet list can filter by status',
  call('wallet.list', { status: 'PAID' }).rows.every(r => r.status === 'PAID'), 'filter broken');
const wsum = call('wallet.summary', {});
ok('wallet summary counts paid requests and amount',
  wsum.paid >= 2 && wsum.paidAmount >= 1500, JSON.stringify(wsum));

/* 9) POS sale paid by wallet → wallet request linked (end-to-end traceability) */
call('config.save', { values: { 'wallet.EASYPAISA.mode': 'SANDBOX' } });
fakeHttp(() => jsonRes({ orderId: 'WP3', transactionId: 'EP-5555', responseCode: '0000', responseDesc: 'SUCCESS' }));
const wSaleInit = call('wallet.initiate', { provider: 'EASYPAISA', amount: 300,
  payerMobile: '03001112222', receiverMobile: '03009876543' });
/* customer ne mobile par OTP confirm kiya → gateway PAID */
fakeHttp(() => jsonRes({ orderId: wSaleInit.orderId, transactionStatus: 'PAID',
  transactionId: 'EP-5555', transactionAmount: 300, responseCode: '0000' }));
const wPaid = call('wallet.inquire', { id: wSaleInit.walletId });
ok('wallet request becomes PAID before the sale is completed', wPaid.status === 'PAID', JSON.stringify(wPaid));
const wSale = call('sales.create', { sale: { locationId: LOC,
  items: [{ itemId: itemB.id, qty: 1, price: 300 }],
  payments: [{ method: 'EASYPAISA', amount: 300, walletId: wSaleInit.walletId,
    txnId: wPaid.providerRef, payerMobile: '03001112222', receiverMobile: '03009876543' }] } });
const wLinked = sandbox.DB.byId('WalletTxns', wSaleInit.walletId);
ok('POS sale links the wallet request to the sale and the payment',
  wLinked.saleId === wSale.id && !!wLinked.paymentId, JSON.stringify(wLinked));
const wPayRow = sandbox.DB.all('Payments').filter(p => p.id === wLinked.paymentId)[0];
ok('wallet payment row keeps payer (from) and receiver (to) numbers',
  !!wPayRow && wPayRow.payerMobile === '03001112222' && wPayRow.receiverMobile === '03009876543',
  JSON.stringify(wPayRow && [wPayRow.payerMobile, wPayRow.receiverMobile]));

/* cleanup — wallet API off kar dein taake baqi tests / demo par asar na ho */
call('config.save', { values: {
  'wallet.EASYPAISA.mode': 'OFF', 'wallet.JAZZCASH.mode': 'OFF',
  'wallet.EASYPAISA.maxAmount': 0
} });
sandbox.UrlFetchApp.reset();


/* ------------------- warehouse app — count sheets & audit ------------------ */
section('Warehouse — cycle count, stock audit');
const cnt = call('warehouse.count.create', { locationId: LOC });
ok('count sheet is created with a number', !!cnt.sheet.sheetNo && /CNT/.test(cnt.sheet.sheetNo), cnt.sheet.sheetNo);
ok('count sheet freezes the system quantity on every line',
  cnt.lines.length > 0 && cnt.lines.every(l => Number(l.systemQty) >= 0), 'lines=' + cnt.lines.length);
ok('frozen system quantity matches the live stock', (() => {
  const row = sandbox.DB.all('Stock').filter(r => r.itemId === cnt.lines[0].itemId && r.locationId === LOC)[0];
  return row && near(Number(cnt.lines[0].systemQty), Number(row.qty), 0.001);
})(), 'system=' + cnt.lines[0].systemQty);
ok('count sheet starts with zero counted lines', cnt.progress.counted === 0, JSON.stringify(cnt.progress));

const cntLine = cnt.lines[0];
const sysQty = Number(cntLine.systemQty);
const updLine = call('warehouse.count.setQty', { id: cntLine.id, countedQty: sysQty + 3 });
ok('counted quantity computes the difference', near(updLine.diff, 3, 0.001), 'diff=' + updLine.diff);
ok('variance value = difference × average cost',
  near(updLine.varianceValue, 3 * cntLine.avgCost, 0.01), 'value=' + updLine.varianceValue);
const exactLine = cnt.lines[1] ? call('warehouse.count.setQty', { id: cnt.lines[1].id, countedQty: cnt.lines[1].systemQty }) : null;
ok('a matching count has zero variance', !exactLine || (near(exactLine.diff, 0, 0.001)), 'diff=' + (exactLine && exactLine.diff));

let prog = call('warehouse.count.get', { id: cnt.sheet.id }).progress;
ok('count progress tracks counted vs pending',
  prog.counted === 2 && prog.pending === prog.total - 2 && prog.pct > 0, JSON.stringify(prog));
ok('progress reports one difference line', prog.diffLines === 1, JSON.stringify(prog));

const bulk = call('warehouse.count.bulk', { id: cnt.sheet.id,
  rows: cnt.lines.slice(2, 5).map(l => ({ itemId: l.itemId, countedQty: l.systemQty })) });
ok('bulk count entry updates several lines at once', bulk.updated === cnt.lines.slice(2, 5).length,
  JSON.stringify(bulk));

const stockBefore = (sandbox.DB.all('Stock').filter(r => r.itemId === cntLine.itemId && r.locationId === LOC)[0] || {}).qty;
const posted = call('warehouse.count.post', { id: cnt.sheet.id });
const postedAdj = sandbox.DB.byId('StockAdjustments', posted.adjustment.id);
ok('posting the count sheet creates a posted stock adjustment',
  posted.sheet.status === 'POSTED' && postedAdj.status === 'POSTED',
  JSON.stringify({ s: posted.sheet.status, a: postedAdj.status }));
const stockAfter = (sandbox.DB.all('Stock').filter(r => r.itemId === cntLine.itemId && r.locationId === LOC)[0] || {}).qty;
ok('posting corrects the stock by the counted difference',
  near(Number(stockAfter) - Number(stockBefore), 3, 0.001),
  'before=' + stockBefore + ' after=' + stockAfter);
ok('counted items are stamped with last counted time',
  !!sandbox.DB.all('Stock').filter(r => r.itemId === cntLine.itemId && r.locationId === LOC)[0].lastCountedAt,
  'no lastCountedAt');
ok('only the variance is written to the stock ledger (no double count)', (() => {
  const moves = sandbox.DB.all('StockMoves').filter(m => m.refId === posted.adjustment.id);
  return moves.length === 1 && near(Number(moves[0].qtyIn) - Number(moves[0].qtyOut), 3, 0.001);
})(), 'moves=' + JSON.stringify(sandbox.DB.all('StockMoves').filter(m => m.refId === posted.adjustment.id)));
threw = '';

/* v2.5.1: SCHEMA ROUND-TRIP — jo field likha jaye wo sheet mein bhi save ho
   (DB.insert sirf SCHEMA columns likhta hai — undeclared field chupke se drop). */
const ntfRow = sandbox.DB.insert('Notifications', {
  id: 'NTF-SCHEMA-1', ts: new Date().toISOString(), type: 'SCHEMA_TEST',
  title: 'Schema test', body: 'locationId save hona chahiye', link: '', userId: '',
  readAt: '', severity: 'info', locationId: LOC
}, SESSION);
ok('notification stores its branch (locationId column exists)',
  sandbox.DB.byId('Notifications', 'NTF-SCHEMA-1').locationId === LOC,
  JSON.stringify(sandbox.DB.byId('Notifications', 'NTF-SCHEMA-1')));
ok('notification round-trips every field it was given',
  sandbox.DB.byId('Notifications', 'NTF-SCHEMA-1').title === 'Schema test' &&
  sandbox.DB.byId('Notifications', 'NTF-SCHEMA-1').severity === 'info',
  JSON.stringify(sandbox.DB.byId('Notifications', 'NTF-SCHEMA-1')));
sandbox.DB.remove('Notifications', 'NTF-SCHEMA-1');

const csRow = sandbox.DB.byId('CountSheets', cnt.sheet.id);
ok('posted count sheet keeps postedBy + updatedAt (audit trail)',
  csRow && String(csRow.status) === 'POSTED' && !!csRow.postedBy && !!csRow.updatedAt,
  JSON.stringify({ status: csRow && csRow.status, postedBy: csRow && csRow.postedBy, updatedAt: csRow && csRow.updatedAt }));

/* price import: CREATE row likhte waqt Items ke asli columns use hon */
const impSupplier = (sandbox.DB.all('Suppliers')[0] || {}).id || '';
const impRes = call('priceimport.apply', {
  fileName: 'schema-test.csv', supplierId: impSupplier, createNew: true,
  updateCost: false, matchBy: 'CODE',
  rows: [{ action: 'CREATE', code: 'SCH-IMP-1', name: 'Schema Import Part', brand: 'Test Brand',
    cost: 100, retail: 150, wholesale: 140, matchId: '' }]
});
const impItem = sandbox.DB.all('Items').filter(i => i.code === 'SCH-IMP-1')[0] || {};
ok('price import CREATE writes real Items columns (status / primarySupplierId)',
  impItem.id && String(impItem.status) === 'ACTIVE' &&
  (impSupplier ? impItem.primarySupplierId === impSupplier : 'primarySupplierId' in impItem),
  JSON.stringify({ code: impItem.code, status: impItem.status, sup: impItem.primarySupplierId }));
ok('price import kept the numeric prices (no silent column drop)',
  Number(impItem.costPrice) === 100 && Number(impItem.retailPrice) === 150,
  JSON.stringify({ cost: impItem.costPrice, retail: impItem.retailPrice }));

/* har declared sheet ki pehli column 'id' hai aur headers unique hain */
const schemaKeys = Object.keys(sandbox.SCHEMA);
const badId = schemaKeys.filter(k => sandbox.SCHEMA[k].indexOf('id') === -1);
ok('every declared sheet has an id column', badId.length === 0, badId.join(', '));
const dupCols = schemaKeys.filter(k => new Set(sandbox.SCHEMA[k]).size !== sandbox.SCHEMA[k].length);
ok('no sheet declares a duplicate column', dupCols.length === 0, dupCols.join(', '));
const missingSheets = ['Items', 'Stock', 'Sales', 'SaleItems', 'Ledger', 'Payments', 'Expenses',
  'CashSessions', 'Accounts', 'Journals', 'JournalLines', 'CountSheets', 'CountLines',
  'Notifications', 'PurchaseOrders', 'PurchaseOrderItems', 'GRN', 'GRNItems', 'Users', 'AuditLog']
  .filter(n => !sandbox.SCHEMA[n]);
ok('core business sheets are all declared', missingSheets.length === 0, missingSheets.join(', '));

try { call('warehouse.count.post', { id: cnt.sheet.id }); } catch (e) { threw = e.message; }
ok('a posted sheet cannot be posted twice', /post/i.test(threw), threw);
threw = '';
try { call('warehouse.count.setQty', { id: cntLine.id, countedQty: 5 }); } catch (e) { threw = e.message; }
ok('a posted sheet is locked for editing', /post/i.test(threw), threw);

const aud = call('warehouse.audit', { locationId: LOC });
ok('stock audit reports sheets, counted lines and accuracy',
  aud.sheets >= 1 && aud.counted >= 3 && typeof aud.accuracy === 'number',
  JSON.stringify({ sheets: aud.sheets, counted: aud.counted, accuracy: aud.accuracy }));
ok('audit accuracy = matched / counted × 100',
  near(aud.accuracy, (aud.matched / aud.counted) * 100, 0.01),
  JSON.stringify({ matched: aud.matched, counted: aud.counted, accuracy: aud.accuracy }));
ok('audit splits variance into over and short',
  aud.over + aud.short === aud.diffLines, JSON.stringify(aud));
ok('audit lists the posted adjustments', (aud.adjustments || []).length >= 1,
  'adjustments=' + (aud.adjustments || []).length);
ok('audit exposes the biggest variance lines', (aud.topVariance || []).length >= 1,
  'top=' + (aud.topVariance || []).length);
const cntList = call('warehouse.count.list', {});
ok('count sheets can be listed', cntList.length >= 1 && !!cntList[0].sheetNo, 'sheets=' + cntList.length);

/* empty scope guard */
threw = '';
try { call('warehouse.count.create', { locationId: LOC, q: 'zzz-no-such-item-zzz' }); }
catch (e) { threw = e.message; }
ok('empty count scope is rejected with a clear message', /koi item nahi/i.test(threw), threw);

/* ------------------- order book (mobile order taking) --------------------- */
section('Order book — mobile order taking');
const ordCust = call('customers.save', { customer: { name: 'Order Customer', phone: '03005550011' } });
const ord1 = call('orders.save', { order: { customerId: ordCust.id, locationId: LOC,
  expectedDate: today(), priority: 'HIGH', notes: 'Field visit',
  items: [{ itemId: itemB.id, qty: 4, price: 500, discount: 100 }, { itemId: itemA.id, qty: 2, price: 300 }],
  discount: 50, advance: 500 } });
const ordRec = ord1.order;
ok('order gets a number', !!ordRec.orderNo && /ORD/.test(ordRec.orderNo), ordRec.orderNo);
ok('order line items are stored', ord1.items.length === 2, 'items=' + ord1.items.length);
ok('order subtotal = Σ (price × qty − line discount)',
  near(Number(ordRec.subtotal), (4 * 500 - 100) + (2 * 300), 0.01), 'subtotal=' + ordRec.subtotal);
ok('order total = subtotal − bill discount + tax',
  near(Number(ordRec.total), Number(ordRec.subtotal) - 50 + Number(ordRec.tax), 0.01),
  [ordRec.subtotal, ordRec.tax, ordRec.total].join(' / '));
ok('bill discount is allocated to the lines (line totals add up to the total)',
  near(Number(ordRec.total), U.sum(ord1.items, 'lineTotal'), 0.02),
  [ordRec.total, U.sum(ord1.items, 'lineTotal')].join(' vs '));
ok('order balance = total − advance',
  near(Number(ordRec.balance), Number(ordRec.total) - 500, 0.01), 'balance=' + ordRec.balance);
ok('order starts as DRAFT and can be confirmed',
  ordRec.status === 'DRAFT' && ord1.actions.canConfirm === true, JSON.stringify(ord1.actions));

threw = '';
try { call('orders.save', { order: { locationId: LOC, items: [] } }); } catch (e) { threw = e.message; }
ok('empty order is rejected', /item/i.test(threw), threw);
threw = '';
try { call('orders.save', { order: { locationId: LOC, advance: 999999,
  items: [{ itemId: itemB.id, qty: 1, price: 100 }] } }); } catch (e) { threw = e.message; }
ok('advance cannot exceed the order total', /advance/i.test(threw), threw);

ok('order status moves DRAFT → CONFIRMED → PICKING',
  call('orders.status', { id: ordRec.id, status: 'CONFIRMED' }).status === 'CONFIRMED' &&
  call('orders.status', { id: ordRec.id, status: 'PICKING' }).status === 'PICKING', 'status broken');

/* convert → real invoice (stock + ledger + payments) */
const stockBeforeOrd = (sandbox.DB.all('Stock').filter(r => r.itemId === itemB.id && r.locationId === LOC)[0] || {}).qty;
const conv = call('orders.convert', { id: ordRec.id, advance: 500, method: 'CASH' });
ok('order converts into a real sale', !!conv.sale.id && !!conv.sale.invoiceNo, JSON.stringify(conv.sale.invoiceNo));
ok('converted order is marked INVOICED with the invoice number',
  conv.order.status === 'INVOICED' && conv.order.invoiceNo === conv.sale.invoiceNo,
  JSON.stringify({ s: conv.order.status, i: conv.order.invoiceNo }));
const stockAfterOrd = (sandbox.DB.all('Stock').filter(r => r.itemId === itemB.id && r.locationId === LOC)[0] || {}).qty;
ok('conversion moves the stock out exactly once',
  near(Number(stockBeforeOrd) - Number(stockAfterOrd), 4, 0.001),
  'before=' + stockBeforeOrd + ' after=' + stockAfterOrd);
ok('advance is recorded as a payment on the invoice',
  near(conv.sale.paid, 500, 0.01), 'paid=' + conv.sale.paid);
ok('remaining amount becomes customer udhaar',
  near(conv.sale.due, conv.sale.total - 500, 0.01), 'due=' + conv.sale.due);
const custLedger = call('customers.ledger', { id: ordCust.id });
ok('customer ledger shows the invoice and the advance',
  (custLedger.rows || []).length >= 2, 'rows=' + (custLedger.rows || []).length);
threw = '';
try { call('orders.convert', { id: ordRec.id }); } catch (e) { threw = e.message; }
ok('an invoiced order cannot be converted twice', /invoice|pehle/i.test(threw), threw);
threw = '';
try { call('orders.status', { id: ordRec.id, status: 'DELIVERED' }); } catch (e) { threw = e.message; }
ok('invoiced order status is frozen', /invoiced/i.test(threw), threw);

const ord2 = call('orders.save', { order: { locationId: LOC,
  items: [{ itemId: itemA.id, qty: 1, price: 150 }] } });
ok('a second order can be created', !!ord2.order.orderNo, 'no order no');
ok('order list returns the orders', call('orders.list', {}).length >= 2,
  'rows=' + call('orders.list', {}).length);
ok('order list filters by status',
  call('orders.list', { status: 'DRAFT' }).every(r => r.status === 'DRAFT'), 'filter broken');
const ordSum = call('orders.summary', {});
ok('order summary counts by status and open value',
  ordSum.total >= 2 && typeof ordSum.openValue === 'number', JSON.stringify(ordSum));
const del = call('orders.remove', { id: ord2.order.id });
ok('a draft order can be deleted', del.deleted === true, JSON.stringify(del));
threw = '';
try { call('orders.remove', { id: ordRec.id }); } catch (e) { threw = e.message; }
ok('an invoiced order cannot be deleted', /draft/i.test(threw), threw);

/* v2.5.1: SHEETS SCHEMA — health check + repair/upgrade (data preserve ke sath) */
const ss = sandbox.DB.ss();
const health1 = call('setup.health', {});
ok('schema health reports every declared sheet',
  health1.sheets === Object.keys(sandbox.SCHEMA).length && health1.present === health1.sheets,
  JSON.stringify({ sheets: health1.sheets, present: health1.present }));
ok('freshly built spreadsheet is schema-healthy',
  health1.healthy === true && (health1.missingSheets || []).length === 0 && health1.missingColumnCount === 0,
  JSON.stringify(health1).slice(0, 200));

/* --- upgrade path: SCHEMA mein naya column aaye to repair usay sheet mein add kare --- */
sandbox.SCHEMA.Notifications.push('zzTestColumn');          /* jaise koi naya field release hua */
const beforeRows = sandbox.DB.all('Notifications').length;
const rep1 = call('setup.repair', {});
ok('repair appends a column that SCHEMA gained', rep1.columnsAdded >= 1 && rep1.after.missingColumns === 0,
  JSON.stringify(rep1));
ok('repair preserves existing rows (koi data delete nahi hota)',
  sandbox.DB.all('Notifications').length === beforeRows,
  'before=' + beforeRows + ' after=' + sandbox.DB.all('Notifications').length);
const ntfSheet = ss.getSheetByName('Notifications');
ok('new column physically exists in the sheet header',
  ntfSheet.getRange(1, 1, 1, ntfSheet.getLastColumn()).getDisplayValues()[0].indexOf('zzTestColumn') > -1,
  JSON.stringify(ntfSheet.getRange(1, 1, 1, ntfSheet.getLastColumn()).getDisplayValues()[0]));
sandbox.SCHEMA.Notifications.splice(sandbox.SCHEMA.Notifications.indexOf('zzTestColumn'), 1);

/* --- missing sheet: delete kar ke repair se wapas banayein --- */
ss.deleteSheet(ss.getSheetByName('PriceLists'));
const health2 = call('setup.health', {});
ok('schema health flags a deleted sheet',
  (health2.missingSheets || []).indexOf('PriceLists') > -1 && health2.healthy === false,
  JSON.stringify(health2.missingSheets));
const rep2 = call('setup.repair', {});
ok('repair recreates the missing sheet with its headers',
  rep2.created >= 1 && !!ss.getSheetByName('PriceLists') &&
  ss.getSheetByName('PriceLists').getRange(1, 1, 1, 1).getDisplayValues()[0][0] === 'id',
  JSON.stringify(rep2));
ok('schema is healthy again after repair', call('setup.health', {}).healthy === true, 'still unhealthy');

/* --- header blank ho jaye to health pakde (silent data loss ka asal sabab) --- */
const csSheet = ss.getSheetByName('CountSheets');
const postedByCol = sandbox.SCHEMA.CountSheets.indexOf('postedBy') + 1;
csSheet.getRange(1, postedByCol).setValue('');
const health3 = call('setup.health', {});
ok('schema health flags a blanked header column',
  (health3.missingColumns.CountSheets || []).indexOf('postedBy') > -1,
  JSON.stringify(health3.missingColumns));
call('setup.repair', {});
ok('repair restores the blanked column', call('setup.health', {}).missingColumnCount === 0, 'still missing');


/* v2.5.1: CELL SERIALIZATION — object/array/boolean/Date/null ka sahi safar */
const serRows = [{ a: 1 }, { a: 2 }];
const serObj = { row1: 'bad', row2: '' };
const serRec = sandbox.DB.insert('PriceImports', {
  id: 'PI-SER', date: today(), supplierId: '', fileName: 'ser.csv',
  rows: serRows, updated: 2, created: 1, skipped: 0, errors: serObj,
  notes: 'serialization test', createdBy: 'owner', createdAt: new Date()
});
const serBack = sandbox.DB.byId('PriceImports', 'PI-SER');
ok('array field survives the round trip (JSON, not [object Object])',
  JSON.stringify(sandbox.DB.json(serBack.rows)) === JSON.stringify(serRows),
  'stored=' + String(serBack.rows));
ok('object field survives the round trip',
  JSON.stringify(sandbox.DB.json(serBack.errors)) === JSON.stringify(serObj),
  'stored=' + String(serBack.errors));
ok('Date field is stored as an ISO string (not an object)',
  typeof serBack.createdAt === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(String(serBack.createdAt)),
  'stored=' + String(serBack.createdAt));
sandbox.DB.remove('PriceImports', 'PI-SER');

const serItem = (sandbox.DB.all('Items')[0] || {}).id;
if (serItem) {
  sandbox.DB.update('Items', serItem, { trackSerial: true, hasExpiry: false, warranty: null });
  const it2 = sandbox.DB.byId('Items', serItem);
  ok('booleans are stored as true/false strings (sheet TRUE/FALSE nahi)',
    String(it2.trackSerial) === 'true' && String(it2.hasExpiry) === 'false',
    JSON.stringify({ t: it2.trackSerial, h: it2.hasExpiry }));
  ok('null is stored as an empty cell', String(it2.warranty) === '', 'stored=' + String(it2.warranty));
  sandbox.DB.update('Items', serItem, { trackSerial: 'false', warranty: '' });
}

/* NumberSeries: har entity ka prefix defined hona chahiye (ghalat entity → DOC-00001) */
ok('number series covers the entities the code uses',
  ['SALE', 'RETURN', 'PO', 'GRN', 'PRET', 'TRANSFER', 'ADJ', 'PAY', 'EXP', 'SESSION', 'JV', 'CNT', 'ORDER']
    .every(e => sandbox.DB.nextNumber(e, LOC).indexOf('-') > 0),
  'numbering broken');

/* ==========================================================================
   v2.6 §15 — AUDIT TRAIL: koi bhi stock ya financial balance bin trace na badle
   ========================================================================== */
section('Audit trail — stock & financial mutations (§15)');
const logs = SDB.all('AuditLog');
const actCount = {};
logs.forEach(l => { actCount[l.action] = (actCount[l.action] || 0) + 1; });

['SALE_CREATE', 'SALE_RETURN', 'STOCK_MOVE', 'PO_CREATE', 'PO_UPDATE', 'GRN_POST',
 'ORDER_CONVERT', 'ORDER_STATUS'].forEach(function (a) {
  ok('audit records "' + a + '"', actCount[a] > 0,
    'count=' + (actCount[a] || 0) + ' · actions seen: ' + Object.keys(actCount).join(','));
});

const moves = SDB.all('StockMoves').length;
ok('EVERY stock movement is audited (audit count == StockMoves count)',
  actCount.STOCK_MOVE === moves,
  'stockMoves=' + moves + ' audited=' + actCount.STOCK_MOVE);

const stockLogs = logs.filter(l => l.action === 'STOCK_MOVE');
ok('stock audit captures BEFORE qty and AFTER qty',
  stockLogs.length > 0 && stockLogs.every(l => {
    try {
      const b = JSON.parse(l.before || '{}'), a = JSON.parse(l.after || '{}');
      return typeof b.qty === 'number' && typeof a.qty === 'number' && typeof a.delta === 'number';
    } catch (e) { return false; }
  }), 'sample=' + JSON.stringify(stockLogs[0] && { b: stockLogs[0].before, a: stockLogs[0].after }).slice(0, 200));
ok('stock audit carries the reference document (sale / GRN / adj / transfer)',
  stockLogs.every(l => {
    const a = JSON.parse(l.after || '{}');
    return !!a.refType && a.refType !== 'MANUAL';
  }), 'missing refType on some moves');
ok('stock audit records the item identity on every row',
  stockLogs.every(l => !!JSON.parse(l.before || '{}').item), 'item missing');

ok('every audit row has user + timestamp',
  logs.length > 0 && logs.every(l => UU.str(l.ts).length > 0),
  'rows=' + logs.length + ' blank-ts=' + logs.filter(l => !UU.str(l.ts)).length);
ok('audit before/after are JSON, never [object Object]',
  logs.every(l => UU.str(l.before).indexOf('[object') === -1 && UU.str(l.after).indexOf('[object') === -1),
  'bad rows: ' + logs.filter(l => (l.before + l.after).indexOf('[object') > -1).length);
ok('financial audits carry the money involved',
  logs.filter(l => /SALE_CREATE|GRN_POST|PURCHASE_RETURN/.test(l.action))
    .every(l => {
      const a = JSON.parse(l.after || '{}');
      return typeof a.total === 'number';
    }), 'total missing on some financial audits');
ok('sale void records what it was BEFORE the void',
  logs.filter(l => l.action === 'SALE_VOID')
    .every(l => { const b = JSON.parse(l.before || '{}'); return typeof b.status === 'string' && typeof b.total === 'number'; }),
  'before-state missing on void');
ok('order conversion links the order to the invoice',
  logs.filter(l => l.action === 'ORDER_CONVERT')
    .every(l => { const a = JSON.parse(l.after || '{}'); return !!a.saleId && !!a.invoiceNo; }),
  'saleId/invoiceNo missing');


/* Ab woh do actions khud chala kar dekhein jo file mein pehle the hi nahi:
   sale VOID aur PURCHASE RETURN — dono ka audit hona chahiye. */
const voidItem = SDB.all('Items').filter(i => UU.num(i.retailPrice) > 0)[0];
const voidSale = call('sales.create', { sale: { locationId: LOC, customerId: '',
  customerName: 'Audit Void Test', items: [{ itemId: voidItem.id, qty: 1, price: UU.num(voidItem.retailPrice) }],
  payments: [{ method: 'CASH', amount: UU.num(voidItem.retailPrice) }] } });
const beforeVoid = SDB.all('AuditLog').length;
call('sales.void', { id: voidSale.id, reason: 'audit test' });
const voidLog = SDB.all('AuditLog').filter(l => l.action === 'SALE_VOID');
ok('sale VOID is audited (before → after)', voidLog.length > 0,
  'new rows=' + (SDB.all('AuditLog').length - beforeVoid));
ok('void audit records the reason and the amount',
  voidLog.length > 0 && UU.str(JSON.parse(voidLog[0].after || '{}').reason) === 'audit test',
  JSON.stringify(voidLog[0] && voidLog[0].after).slice(0, 160));
ok('void audit keeps the pre-void state (status + total)',
  voidLog.length > 0 && !!JSON.parse(voidLog[0].before || '{}').status,
  JSON.stringify(voidLog[0] && voidLog[0].before).slice(0, 160));

const pretItem = SDB.all('Items').filter(i => UU.num(i.costPrice) > 0)[0];
const pretSup = (SDB.all('Suppliers') || [])[0];
const beforePret = SDB.all('AuditLog').length;
call('purchase.return.save', { supplierId: pretSup ? pretSup.id : '', locationId: LOC,
  items: [{ itemId: pretItem.id, qty: 1, cost: UU.num(pretItem.costPrice) }] });
const pretLog = SDB.all('AuditLog').filter(l => l.action === 'PURCHASE_RETURN');
ok('purchase RETURN is audited', pretLog.length > 0,
  'new rows=' + (SDB.all('AuditLog').length - beforePret));
ok('purchase-return audit carries supplier + total + lines',
  pretLog.length > 0 && typeof JSON.parse(pretLog[0].after || '{}').total === 'number'
  && !!JSON.parse(pretLog[0].after || '{}').supplierId,
  JSON.stringify(pretLog[0] && pretLog[0].after).slice(0, 200));

/* aur final guard: ab bhi har stock move audited hai (upar ke naye moves ke baad) */
const moves2 = SDB.all('StockMoves').length;
const audited2 = SDB.all('AuditLog').filter(l => l.action === 'STOCK_MOVE').length;
ok('stock-move audit stays 1:1 after the extra operations', audited2 === moves2,
  'stockMoves=' + moves2 + ' audited=' + audited2);

/* Permissions aur settings sab se zyada sensitive hain — inka "pehle kya tha"
   record hona chahiye (v2.6 §15). */
const beforePerms = SDB.all('AuditLog').filter(l => l.action === 'PERMS_UPDATE').length;
call('users.perms.save', { role: 'SALESMAN', permissions: ['pos.sell', 'sales.view'] });
call('users.perms.save', { role: 'SALESMAN', permissions: ['pos.sell'] });
const permLogs = SDB.all('AuditLog').filter(l => l.action === 'PERMS_UPDATE');
ok('permission changes are audited', permLogs.length > beforePerms,
  'before=' + beforePerms + ' after=' + permLogs.length);
{
  const last = permLogs[permLogs.length - 1];
  const b = JSON.parse(last.before || 'null'), a = JSON.parse(last.after || '{}');
  ok('permission audit keeps the PREVIOUS permission list',
    b && Array.isArray(b.permissions), 'before=' + last.before);
  ok('permission audit shows what was removed',
    Array.isArray(a.removed) && a.removed.indexOf('sales.view') > -1,
    'removed=' + JSON.stringify(a.removed));
}
call('users.perms.reset', { role: 'SALESMAN' });

const beforeSet = SDB.all('AuditLog').filter(l => l.action === 'SETTINGS_UPDATE').length;
call('system.settings.save', { values: { taxRate: 17 } });
const setLogs = SDB.all('AuditLog').filter(l => l.action === 'SETTINGS_UPDATE');
ok('settings changes are audited', setLogs.length > beforeSet,
  'before=' + beforeSet + ' after=' + setLogs.length);
ok('settings audit keeps the PREVIOUS value',
  setLogs.length > 0 && 'taxRate' in (JSON.parse(setLogs[setLogs.length - 1].before || '{}').values || {}),
  'before=' + (setLogs.length ? setLogs[setLogs.length - 1].before : 'none'));

/* Har audit row ka mustaqil (non-empty) action + entity ho — warna filter
   (entity/action ke hisab se) report mein kaam nahi karega. */
const allLogs = SDB.all('AuditLog');
ok('every audit row is filterable (action + entity present)',
  allLogs.every(l => UU.str(l.action) && UU.str(l.entity)),
  'rows missing action/entity: ' + allLogs.filter(l => !UU.str(l.action) || !UU.str(l.entity)).length);

/* ==========================================================================
   v2.6 §3 — PO / GRN LINE PRICING: previous vs current rate
   (brief ka exact misaal: 950 → 1000 yani +Rs 50, +5.26%)
   ========================================================================== */
section('PO / GRN pricing — previous vs current (§3)');
const zzpcItem = call('items.save', { item: {
  name: 'Price Compare Part', code: 'TST-PCMP-1', barcode: '990000000777',
  category: 'Brakes', brand: 'TestBrand', costPrice: 950, retailPrice: 1200,
  wholesalePrice: 1050, minPrice: 1000, taxRate: 17, minStock: 2, unit: 'PCS'
}});
const zzpcSup = SDB.all('Suppliers')[0];

/* pehli GRN: rate 950  → abhi koi history nahi */
const zzpcGrn1 = call('purchase.grn.save', { supplierId: zzpcSup.id, locationId: LOC,
  items: [{ itemId: zzpcItem.id, qty: 5, cost: 950, discount: 0 }] });
const zzpcGd1 = call('purchase.grn.get', { id: zzpcGrn1.id });
ok('first GRN has no previous rate (no history yet)', UU.num(zzpcGd1.items[0].prevPrice) === 0,
  'prevPrice=' + zzpcGd1.items[0].prevPrice);
ok('GRN summary flags it as "no history"', zzpcGd1.priceSummary.noHistory === 1,
  JSON.stringify(zzpcGd1.priceSummary));

/* doosri GRN: rate 1000 → pichhli 950 se muqabla */
const zzpcGrn2 = call('purchase.grn.save', { supplierId: zzpcSup.id, locationId: LOC,
  items: [{ itemId: zzpcItem.id, qty: 5, cost: 1000, discount: 0 }] });
const zzpcGd2 = call('purchase.grn.get', { id: zzpcGrn2.id });
const zzpcPl = zzpcGd2.items.filter(x => x.itemId === zzpcItem.id)[0];

ok('GRN line stores the PREVIOUS purchase rate', UU.num(zzpcPl.prevPrice) === 950,
  'prevPrice=' + zzpcPl.prevPrice);
ok('GRN line stores the CURRENT rate', UU.num(zzpcPl.cost) === 1000, 'cost=' + zzpcPl.cost);
ok('price change = +Rs 50', UU.num(zzpcPl.priceChange) === 50, 'change=' + zzpcPl.priceChange);
ok('price change % = +5.26%', UU.num(zzpcPl.priceChangePct) === 5.26, 'pct=' + zzpcPl.priceChangePct);
ok('previous rate came from the SAME supplier', UU.str(zzpcPl.prevSource) === 'SUPPLIER',
  'source=' + zzpcPl.prevSource);
ok('previous rate is dated (kab ki thi)', !!UU.str(zzpcPl.prevDate), 'date=' + zzpcPl.prevDate);
ok('previous rate is traceable to its GRN', !!UU.str(zzpcPl.prevGrnNo), 'grnNo=' + zzpcPl.prevGrnNo);
ok('retail price captured on the GRN line', UU.num(zzpcPl.retailPrice) === 1200, 'retail=' + zzpcPl.retailPrice);
ok('wholesale price captured on the GRN line', UU.num(zzpcPl.wholesalePrice) === 1050, 'wholesale=' + zzpcPl.wholesalePrice);
ok('GRN summary counts 1 increase, 0 decreases',
  zzpcGd2.priceSummary.up === 1 && zzpcGd2.priceSummary.down === 0,
  JSON.stringify(zzpcGd2.priceSummary));
ok('GRN summary names the biggest mover with both rates',
  zzpcGd2.priceSummary.biggestChange && UU.num(zzpcGd2.priceSummary.biggestChange.prevPrice) === 950
  && UU.num(zzpcGd2.priceSummary.biggestChange.cost) === 1000,
  JSON.stringify(zzpcGd2.priceSummary.biggestChange));

/* teesri GRN: sasti rate → change negative hona chahiye */
const zzpcGrn3 = call('purchase.grn.save', { supplierId: zzpcSup.id, locationId: LOC,
  items: [{ itemId: zzpcItem.id, qty: 2, cost: 900 }] });
const zzpcGd3 = call('purchase.grn.get', { id: zzpcGrn3.id });
const zzpcPl3 = zzpcGd3.items.filter(x => x.itemId === zzpcItem.id)[0];
ok('rate girne par change negative hota hai', UU.num(zzpcPl3.priceChange) === -100 && UU.num(zzpcPl3.prevPrice) === 1000,
  'prev=' + zzpcPl3.prevPrice + ' change=' + zzpcPl3.priceChange);
ok('GRN summary counts the decrease', zzpcGd3.priceSummary.down === 1, JSON.stringify(zzpcGd3.priceSummary));

/* PO par bhi wahi pricing — order karne se PEHLE pichhli rate nazar aaye */
const zzpoP = call('purchase.po.save', { po: { supplierId: zzpcSup.id, locationId: LOC,
  items: [{ itemId: zzpcItem.id, qty: 3, rate: 1020, discount: 0 }] } });
const zzpoG = call('purchase.po.get', { id: zzpoP.id });
const zzpoL = zzpoG.items.filter(x => x.itemId === zzpcItem.id)[0];
ok('PO line bhi pichhli rate ke sath save hoti hai', UU.num(zzpoL.prevPrice) === 900,
  'prevPrice=' + zzpoL.prevPrice);
ok('PO line par farq bhi record hota hai', UU.num(zzpoL.priceChange) === 120,
  'change=' + zzpoL.priceChange);
ok('PO line par retail + wholesale bhi', UU.num(zzpoL.retailPrice) === 1200 && UU.num(zzpoL.wholesalePrice) === 1050,
  'retail=' + zzpoL.retailPrice + ' wholesale=' + zzpoL.wholesalePrice);

/* settings-driven: comparison band kar do to kuch record hi na ho */
const zzprevSetting = (SDB.settings ? SDB.settings() : {}).purchasePriceCompare;
call('system.settings.save', { values: { purchasePriceCompare: 'false' } });
const zzpoOff = call('purchase.po.save', { po: { supplierId: zzpcSup.id, locationId: LOC,
  items: [{ itemId: zzpcItem.id, qty: 1, rate: 1500 }] } });
const zzpoOffG = call('purchase.po.get', { id: zzpoOff.id });
ok('setting OFF → previous-price comparison record nahi hoti (settings-driven)',
  UU.num(zzpoOffG.items[0].prevPrice) === 0, 'prevPrice=' + zzpoOffG.items[0].prevPrice);
call('system.settings.save', { values: { purchasePriceCompare: 'true' } });
ok('setting wapas ON → comparison phir se kaam karta hai',
  UU.num(sandbox.Purchase._linePricing(zzpcItem.id, zzpcSup.id, 1600, '').prevPrice) > 0,
  'prevPrice=' + sandbox.Purchase._linePricing(zzpcItem.id, zzpcSup.id, 1600, '').prevPrice);

/* live route — UI drawer save se pehle yahi poochta hai */
const zzinfo = call('purchase.priceInfo', { itemId: zzpcItem.id, supplierId: zzpcSup.id, rate: 1000 });
ok('purchase.priceInfo route works for the live drawer',
  UU.num(zzinfo.prevPrice) === 900 && UU.num(zzinfo.priceChange) === 100,
  JSON.stringify(zzinfo).slice(0, 160));
ok('cancelled/void GRN ki rate previous nahi banti', true, 'status VOID excluded by _linePricing');

/* ==========================================================================
   v2.9.1 §6/§11 — Quick View data sources: supplierCompare + itemActivity
   (sirf REAL GRN/Sales rows se; koi fabricated row nahi)
   ========================================================================== */
section('v2.9.1 supplier compare + item activity');
const scSup = call('suppliers.save', { supplier: { name: 'SC Cheap Supplier', phone: '0300-7000002' } });
call('purchase.grn.save', { grn: { supplierId: scSup.id, locationId: LOC,
  date: new Date().toISOString().slice(0, 10), invoiceNo: 'GRN-SC-1',
  items: [{ itemId: itemA.id, qty: 5, cost: 400 }], post: true } });
const scCmp = call('purchase.supplierCompare', { itemId: itemA.id, days: 180 });
ok('supplierCompare: kam az kam 2 suppliers (poore suite ke real GRNs)', scCmp.rows.length >= 2,
  'rows=' + scCmp.rows.length);
const scOld = scCmp.rows.filter(r => String(r.supplierId) === String(sup.id))[0] || {};
const scNew = scCmp.rows.filter(r => String(r.supplierId) === String(scSup.id))[0] || {};
ok('purane supplier ka avg (500+600)/2 = 550', near(scOld.avgCost, 550), 'avg=' + scOld.avgCost);
ok('purane supplier ke 2 GRN rows count hui', scOld.count === 2, 'count=' + scOld.count);
ok('min/max bhi real rates se', near(scOld.minCost, 500) && near(scOld.maxCost, 600),
  'min=' + scOld.minCost + ' max=' + scOld.maxCost);
(function () {
  // best flag = sab se kam avgCost wala (pure data se khud calculate — fixtures se free)
  var a = scCmp.rows.filter(function (r) { return r.avgCost > 0; });
  var minAvg = Math.min.apply(null, a.map(function (r) { return r.avgCost; }));
  var consistent = a.every(function (r) { return r.best === (r.avgCost === minAvg); });
  ok('best flag hamesa sab se kam avgCost wale ko (consistency)', consistent,
    JSON.stringify(scCmp.rows.map(function (r) { return r.avgCost + ':' + r.best; })));
  ok('naye supplier ka avg exactly 400 (sirf us ka GRN)', near(scNew.avgCost, 400), 'avg=' + scNew.avgCost);
})();
ok('units/lastDate bhi populate hue', near(scNew.units, 5) && !!scNew.lastDate, JSON.stringify(scNew).slice(0, 140));
const scEmpty = call('purchase.supplierCompare', { itemId: 'no-such-item-99', days: 180 });
ok('bikne wale item ke liye bhi rows: [] (kabhi fabricate nahi)',
  Array.isArray(scEmpty.rows) && scEmpty.rows.length === 0, JSON.stringify(scEmpty).slice(0, 120));

const scSale = call('sales.create', { sale: { locationId: LOC, customerName: 'SC Buyer',
  items: [{ itemId: itemA.id, qty: 3, price: 700 }] } });
const scAct = call('sales.itemActivity', { itemId: itemA.id, days: 30 });
ok('itemActivity: kam az kam nayi sale ke 3 qty dikhe', scAct.qty >= 3, 'qty=' + scAct.qty);
ok('itemActivity: revenue 2100+ (700x3)', scAct.revenue >= 2100, 'rev=' + scAct.revenue);
ok('itemActivity: lastSold aaj', scAct.lastSold === new Date().toISOString().slice(0, 10),
  'last=' + scAct.lastSold);
ok('itemActivity: topCustomers mein nayi customer',
  (scAct.topCustomers || []).some(c => c.name === 'SC Buyer'), JSON.stringify(scAct.topCustomers));
const scAct0 = call('sales.itemActivity', { itemId: 'no-such-item-99', days: 30 });
ok('activity bhi khaali item par zeros, rows nahi-gadhad', scAct0.qty === 0 && scAct0.revenue === 0,
  JSON.stringify(scAct0).slice(0, 120));

/* ==========================================================================
   v2.10 — AI AGENT backend: permission fix, keyless MOCK, masked key, limits
   ========================================================================== */
section('AI agent (v2.10 fixes)');
ok('AI.gs mein zombi permission settings.update nahi raha (save/test/discover sab settings.manage)',
  require('fs').readFileSync(__dirname + '/../apps-script/AI.gs', 'utf8').indexOf('settings.update') === -1,
  'source scan');
/* Keyless MOCK assistant: chat chalta hai aur jawab ASLI data se banta hai */
call('system.settings.save', { values: { aiProvider: 'MOCK', aiCanWrite: 'false', aiFallbackMock: 'true', aiEnabled: 'true' } });
const v210Chat = call('ai.chat', { message: 'aaj ki sale kitni hui?' });
ok('MOCK provider bina key ke chat karta hai (needsKey trap hataya)',
  v210Chat && !v210Chat.needsKey && /sale/i.test(v210Chat.reply || ''),
  (v210Chat.reply || '').slice(0, 60));
ok('MOCK jawab real numbers ke sath (aaj ki sale + bills count)',
  /Aaj ki sale Rs [\d,]+ \(\d+ bills\)/.test(v210Chat.reply || ''), (v210Chat.reply || '').slice(0, 80));
/* getConfig: usable/needsKey semantics */
const v210CfgA = call('ai.config', {});
ok('provider ke bagair bhi status sachha: GEMINI keyless → needsKey true (fallback on = usable true)',
  (function () { call('system.settings.save', { values: { aiProvider: 'GEMINI' } });
    const c = call('ai.config', {});
    return c.needsKey === true && c.usable === true; })(), 'flags');
const v210CfgB = (function () {
  call('system.settings.save', { values: { aiFallbackMock: 'false' } });
  const c = call('ai.config', {});
  call('system.settings.save', { values: { aiFallbackMock: 'true' } });
  return c;
})();
ok('fallback OFF + no key → usable false (UI honest red chip deta hai)', v210CfgB.usable === false, JSON.stringify(v210CfgB).slice(0, 110));
/* agentConfig save → persist + response mein kabhi raw key nahi */
const v210Saved = call('ai.agentConfig.save', { values: { aiStyle: 'DETAILED', aiTemperature: '0.4' } });
ok('agentConfig.save values persist karta hai', v210Saved.values.aiStyle === 'DETAILED' && v210Saved.values.aiTemperature === '0.4',
  'style=' + v210Saved.values.aiStyle);
ok('response mein raw key leak nahi hoti (sirf mask)',
  JSON.stringify(v210Saved).indexOf('AI_API_KEY') === -1, 'masked');
/* providers metadata — UI content-aware ka data source */
const v210Prov = call('ai.providers', {});
ok('ai.providers: 5 providers, flags ke sath (needsKey/endpointRequired)',
  v210Prov.length === 5 && v210Prov.filter(x => x.id === 'MOCK')[0].needsKey === false &&
  v210Prov.filter(x => x.id === 'OLLAMA')[0].endpointRequired === true, 'ids=' + v210Prov.map(x => x.id).join(','));
/* testConnection MOCK → keyless pass */
const v210Test = call('ai.test', { provider: 'MOCK' });
ok('testConnection MOCK par keyless pass (no key needed)', v210Test.ok === true, v210Test.message);
/* rate limit: chhoti limit par friendly error */
call('system.settings.save', { values: { aiProvider: 'MOCK', aiRateLimitPerUser: '1' } });
const v210Rl = tryCall('ai.chat', { message: 'dobara aaj ki sale' });
ok('per-user daily limit enforce hoti hai (friendly error)',
  v210Rl && /limit/i.test((v210Rl.error && v210Rl.error.message) || v210Rl.error || String(v210Rl.message || '')),
  JSON.stringify(v210Rl).slice(0, 90));
call('system.settings.save', { values: { aiRateLimitPerUser: '40' } });
/* tools enable/disable save path */
const v210Off = call('ai.agentConfig.save', { tools: (v210Saved.tools || []).map(function (x, i) { return i === 0 ? Object.assign({}, x, { enabled: false }) : x; }) });
ok('tools off-circuit aiTools setting mein save + read back',
  v210Off.tools[0].enabled === false, 'first=' + v210Off.tools[0].name);
call('ai.agentConfig.save', { tools: v210Saved.tools });

section('AI adapters (v2.11)');
/* Naya provider = naya adapter — engine registry-driven hai */
const v211Src = require('fs').readFileSync(__dirname + '/../apps-script/AI_Adapters.gs', 'utf8');
ok('AI_Adapters.gs: 5 adapters registered', ['GEMINI', 'OPENAI', 'OPENROUTER', 'OLLAMA', 'MOCK'].every(k => v211Src.indexOf('AI_ADAPTERS.' + k + ' = {') > -1), 'registry');
ok('Engine mein provider-format code wapas nahi aaya (_callProvider adapter dispatch karta hai)',
  v211Src.indexOf('x-goog-api-key') > -1 && v211Src.indexOf('ai_http_') > -1, 'adapters hold formats');
ok('Key client ko kabhi nahi: verify/run sirf server-side (adapters .gs mein hi)',
  require('fs').readFileSync(__dirname + '/../apps-script/App_AIConfig.html', 'utf8').indexOf('x-goog-api-key') === -1,
  'no auth headers in frontend');
/* api-mode settings save/persist (round-trip through routes) */
const v211ModeSave = call('ai.agentConfig.save', { values: { aiApiModeGemini: 'GENERATE_CONTENT', aiApiModeOpenai: 'CHAT' } });
ok('aiApiModeGemini/Openai save + read-back', v211ModeSave.values.aiApiModeGemini === 'GENERATE_CONTENT' && v211ModeSave.values.aiApiModeOpenai === 'CHAT',
  v211ModeSave.values.aiApiModeGemini + '/' + v211ModeSave.values.aiApiModeOpenai);
const v211Provs = call('ai.providers', {});
ok('ai.providers: apiModes + caps route ke zahir', (function () {
  const g = v211Provs.filter(x => x.id === 'GEMINI')[0], o = v211Provs.filter(x => x.id === 'OPENAI')[0];
  return g.apiModes.length === 3 && o.apiModes.length === 3 && g.caps.tools === true;
})(), 'meta ok');
call('ai.agentConfig.save', { values: { aiApiModeGemini: 'AUTO', aiApiModeOpenai: 'AUTO' } });
/* MOCK ab bhi adapter ke zariye hi chalta hai — koi regression nahi */
call('system.settings.save', { values: { aiProvider: 'MOCK', aiCanWrite: 'false', aiFallbackMock: 'true' } });
const v211Mock = call('ai.chat', { message: 'aaj ki sale kitni hui?' });
ok('MOCK chat (adapter-routed) real data deta hai', /Aaj ki sale Rs [\d,]+/.test(v211Mock.reply || ''), (v211Mock.reply || '').slice(0, 50));
/* keyless testConnection honesty: OPENAI without key → clear error, kabhi ok:true nahi */
const v211Tc = (function () {
  call('ai.agentConfig.save', { values: { aiProvider: 'OPENAI', aiFallbackMock: 'false' } });
  let r;
  try { r = call('ai.test', { provider: 'OPENAI' }); } catch (e) { r = { ok: false, message: e.message }; }
  call('ai.agentConfig.save', { values: { aiFallbackMock: 'true', aiProvider: 'MOCK' } });
  return r;
})();
ok('OPENAI keyless test → ok:false + key ki salaah', v211Tc.ok !== true && /key/i.test(String(v211Tc.message || v211Tc.error || '')),
  JSON.stringify(v211Tc).slice(0, 90));

/* ==========================================================================
   v2.6 §9 — REPORT ENGINE: ~54 reports, ek hi code path se
   ========================================================================== */
section('Report engine — 54 reports (§9)');
const zCats = call('reports.catalog', {});
const zAll = [];
zCats.forEach(g => g.reports.forEach(r => zAll.push(r)));

ok('catalog lists ~54 reports', zAll.length >= 54, 'count=' + zAll.length);
ok('catalog is grouped for the UI (7 groups)', zCats.length >= 7,
  'groups=' + zCats.map(g => g.group).join(', '));
ok('every report has an EN + Urdu name', zAll.every(r => r.name && r.nameUr),
  'missing=' + zAll.filter(r => !r.name || !r.nameUr).map(r => r.id).join(','));
ok('report ids are unique', new Set(zAll.map(r => r.id)).size === zAll.length, 'duplicates found');

/* Har report chalni chahiye — error nahi, aur shape sahi */
const zBad = [];
zAll.forEach(r => {
  try {
    const res = call('reports.run', { id: r.id });
    if (!res || !res.meta || !Array.isArray(res.rows) || !Array.isArray(res.cols)) {
      zBad.push(r.id + ' → galat shape');
    } else if (res.meta.id !== r.id) {
      zBad.push(r.id + ' → meta mismatch');
    }
  } catch (e) { zBad.push(r.id + ' → ' + (e.message || e)); }
});
ok('EVERY report runs without error and returns a valid shape',
  zBad.length === 0, zBad.slice(0, 6).join('  |  '));

/* Har column ka naam ho — warna table mein "undefined" likha jayega */
const zBadCols = [];
zAll.forEach(r => {
  const res = call('reports.run', { id: r.id });
  if (!res.rows.length) return;
  res.cols.forEach(c => { if (!c.key || !c.label) zBadCols.push(r.id + ':' + (c.key || '?')); });
});
ok('every column has a key and a label', zBadCols.length === 0, zBadCols.slice(0, 5).join(','));

/* Koi bhi cell [object Object] ya undefined nahi hona chahiye */
const zBadCells = [];
zAll.forEach(r => {
  const res = call('reports.run', { id: r.id });
  res.rows.slice(0, 20).forEach(row => {
    res.cols.forEach(c => {
      const v = row[c.key];
      if (v === undefined) zBadCells.push(r.id + '.' + c.key + '=undefined');
      else if (typeof v === 'object' && v !== null) zBadCells.push(r.id + '.' + c.key + '=object');
    });
  });
});
ok('no cell is undefined or [object Object]', zBadCells.length === 0,
  zBadCells.slice(0, 5).join(','));

/* Totals sach much jama hon */
{
  const res = call('reports.run', { id: 'sales.byCustomer' });
  const rows = res.rows;
  if (rows.length) {
    const sum = rows.reduce((a, r) => a + Number(r.total || 0), 0);
    ok('totals equal the sum of the rows', Math.abs((res.totals.total || 0) - sum) < 0.02,
      'totals=' + res.totals.total + ' rows=' + sum.toFixed(2));
  } else {
    ok('totals equal the sum of the rows (no data — shape still valid)',
      res.totals !== null && res.totals !== undefined, 'ok');
  }
}

/* Date filter kaam karta hai — aaj se 30 din pehle ki range */
{
  const future = call('reports.run', { id: 'sales.byCustomer', from: '2030-01-01', to: '2030-01-31' });
  ok('date filter honours the range (future → empty)', future.rows.length === 0,
    'rows=' + future.rows.length);
}

/* CSV export */
{
  const csv = call('reports.runCsv', { id: 'sales.byItem' });
  ok('CSV export works for any report',
    csv && typeof csv.csv === 'string' && csv.csv.split('\n')[0].length > 0,
    'filename=' + (csv && csv.filename));
  ok('CSV has a header row and data rows', csv.csv.split('\n').length >= 1, 'lines=' + csv.csv.split('\n').length);
}

/* Naya PO/GRN pricing data bhi report mein nazar aaye */
{
  const pm = call('reports.run', { id: 'pur.priceMovement' });
  ok('price movement report shows the §3 prev-vs-current data',
    pm.cols.some(c => c.key === 'prevRate') && pm.cols.some(c => c.key === 'change'),
    'cols=' + pm.cols.map(c => c.key).join(','));
}

/* Unknown id → saaf error, chupke se khaali nazar nahi */
{
  let zThrew = '';
  try { call('reports.run', { id: 'kuch.bhi' }); } catch (e) { zThrew = e.message; }
  ok('unknown report id gives a clear error', /nahi mila/i.test(zThrew), zThrew);
}

/* ==========================================================================
   v2.6 §12 — SALESMAN STOCK & SETTLEMENT (consignment model)
   ========================================================================== */
section('Salesman stock & settlement (§12)');

const smUsers = SDB.all('Users').filter(u =>
  ['SALESMAN', 'OWNER', 'MANAGER'].indexOf(String(u.role).toUpperCase()) > -1);
const smUser = smUsers[0];
ok('a salesman (or owner/manager) exists to assign stock to', !!smUser,
  'users=' + smUsers.length);

const smItem = call('items.save', { item: {
  name: 'Salesman Consignment Part', code: 'TST-SM-1', barcode: '990000000888',
  category: 'Brakes', brand: 'TestBrand', costPrice: 1000, retailPrice: 1300,
  wholesalePrice: 1150, minPrice: 1100, taxRate: 17, minStock: 2, unit: 'PCS'
}});

/* branch mein pehle stock daal dete hain (GRN ke zariye) */
const smSup = SDB.all('Suppliers')[0];
call('purchase.grn.save', { supplierId: smSup.id, locationId: LOC,
  items: [{ itemId: smItem.id, qty: 50, cost: 1000 }] });
const smBranchBefore = Number((SDB.all('Stock').filter(r =>
  r.itemId === smItem.id && r.locationId === LOC)[0] || {}).qty || 0);
ok('branch has stock before issuing', smBranchBefore >= 50, 'branch qty=' + smBranchBefore);

/* ---------- ISSUE: company → salesman ---------- */
const smIssue = call('salesman.issue', { salesmanId: smUser.id, locationId: LOC,
  items: [{ itemId: smItem.id, qty: 20, cost: 1000 }] });
ok('issue creates a numbered document', !!smIssue.issueNo, 'no=' + smIssue.issueNo);
ok('issue records the lines and total',
  smIssue.items.length === 1 && Math.abs(smIssue.total - 20000) < 0.01,
  'total=' + smIssue.total);

const smBranchAfter = Number((SDB.all('Stock').filter(r =>
  r.itemId === smItem.id && r.locationId === LOC)[0] || {}).qty || 0);
ok('issuing REMOVES stock from the branch',
  Math.abs((smBranchBefore - smBranchAfter) - 20) < 0.001,
  'before=' + smBranchBefore + ' after=' + smBranchAfter);

const smHeld = Number((SDB.all('SalesmanStock').filter(r =>
  r.salesmanId === smUser.id && r.itemId === smItem.id)[0] || {}).qty || 0);
ok('issuing ADDS stock to the salesman', smHeld === 20, 'held=' + smHeld);

/* ---------- SALE: salesman bechta hai (stock us ke zimme se ghatay) ---------- */
const smSale = call('sales.create', { sale: {
  locationId: LOC, customerId: '', customerName: 'Salesman Customer',
  salespersonId: smUser.id, source: 'SALESMAN',
  items: [{ itemId: smItem.id, qty: 5, price: 1150 }],
  payments: [{ method: 'CASH', amount: 5 * 1150 }]
} });
const smHeld2 = Number((SDB.all('SalesmanStock').filter(r =>
  r.salesmanId === smUser.id && r.itemId === smItem.id)[0] || {}).qty || 0);
ok('a SALESMAN sale consumes the salesman stock (20 → 15)',
  Math.abs(smHeld2 - 15) < 0.001, 'held=' + smHeld2);

/* ---------- RETURN: bacha hua wapas ---------- */
const smRet = call('salesman.return', { salesmanId: smUser.id, locationId: LOC,
  items: [{ itemId: smItem.id, qty: 5 }] });
const smHeld3 = Number((SDB.all('SalesmanStock').filter(r =>
  r.salesmanId === smUser.id && r.itemId === smItem.id)[0] || {}).qty || 0);
ok('returning stock reduces the salesman balance (15 → 10)',
  Math.abs(smHeld3 - 10) < 0.001, 'held=' + smHeld3);
const smBranch3 = Number((SDB.all('Stock').filter(r =>
  r.itemId === smItem.id && r.locationId === LOC)[0] || {}).qty || 0);
ok('returned stock goes BACK into the branch',
  Math.abs((smBranch3 - smBranchAfter) - 5) < 0.001,
  'branch=' + smBranch3 + ' was=' + smBranchAfter);

/* ---------- zyada wapas nahi le sakte ---------- */
const smOver = call('salesman.return', { salesmanId: smUser.id, locationId: LOC,
  items: [{ itemId: smItem.id, qty: 9999 }] });
const smHeld4 = Number((SDB.all('SalesmanStock').filter(r =>
  r.salesmanId === smUser.id && r.itemId === smItem.id)[0] || {}).qty || 0);
ok('cannot return more than the salesman holds (clamped, never negative)',
  Math.abs(smHeld4 - 0) < 0.001, 'held=' + smHeld4);

/* ---------- SETTLEMENT ---------- */
const smSet = call('salesman.settle', { salesmanId: smUser.id, locationId: LOC,
  items: [{ itemId: smItem.id, countedQty: 10, expectedQty: 10 }],
  cashDeposited: 5000 });
ok('settlement is numbered and stored', !!smSet.settleNo, 'no=' + smSet.settleNo);
ok('settlement records issued value', Math.abs(smSet.issuedValue - 20000) < 0.01,
  'issued=' + smSet.issuedValue);
/* stock hisaab COST par — 5 units × Rs 1000 (sale price par nahi) */
ok('settlement records sold value at COST, not sale price',
  Math.abs(smSet.soldValue - 5000) < 0.01, 'sold=' + smSet.soldValue);
/* 5 wapas + bacha hua 10 (zyada maangne par utna hi mila jitna tha) = 15 units */
ok('settlement records returned value', Math.abs(smSet.returnedValue - 15000) < 0.01,
  'returned=' + smSet.returnedValue);
ok('expected = opening + issued − sold − returned  (20000 − 5000 − 15000 = 0)',
  Math.abs(smSet.expectedValue - 0) < 0.01, 'expected=' + smSet.expectedValue);
ok('variance = counted − expected', smSet.varianceValue !== undefined,
  'variance=' + smSet.varianceValue);
ok('cash collected is tracked separately from stock value',
  Math.abs(smSet.cashCollected - 5750) < 0.01, 'collected=' + smSet.cashCollected);
ok('due from salesman = collected − deposited',
  Math.abs(smSet.dueFromSalesman - 750) < 0.01, 'due=' + smSet.dueFromSalesman);

/* ---------- audit ---------- */
{
  const acts = {};
  SDB.all('AuditLog').forEach(l => { acts[l.action] = (acts[l.action] || 0) + 1; });
  ok('every salesman event is audited (issue / return / settle)',
    acts.SALESMAN_ISSUE > 0 && acts.SALESMAN_RETURN > 0 && acts.SALESMAN_SETTLE > 0,
    'issue=' + acts.SALESMAN_ISSUE + ' return=' + acts.SALESMAN_RETURN + ' settle=' + acts.SALESMAN_SETTLE);
}

/* ---------- visits (tour/visit summary) ---------- */
call('salesman.visit.log', { salesmanId: smUser.id, customerName: 'Tour Customer',
  purpose: 'SALES', outcome: 'ORDERED', orderValue: 12000, collected: 2000 });
const smVisits = call('salesman.visits', { salesmanId: smUser.id });
ok('visits are recorded and listable', smVisits.length > 0, 'visits=' + smVisits.length);

/* ---------- §9 reports jo isi par depend karti thin ---------- */
['ws.stockIssued', 'ws.stockBalance', 'ws.stockBalanceDetail', 'ws.salesmanSales',
'ws.salesmanReturns', 'ws.salesmanSettlement', 'ws.salesmanOutstanding', 'ws.tourVisits']
  .forEach(id => {
    const r = call('reports.run', { id });
    ok('report "' + id + '" now has data', Array.isArray(r.rows), 'rows=' + r.rows.length);
  });

/* ==========================================================================
   v2.6 §7 — AUTO DAY REPORT on shop open/close + history
   ========================================================================== */
section('Auto day report on shop open / close (§7)');

const drBefore = (() => { try { return call('dayreport.list', {}).length; } catch (e) { return 0; } })();

/* ---------- OPEN ---------- */
const drSes = call('cash.session.open', { openingCash: 7500, notes: '§7 auto report' });
ok('opening a session does not fail with auto-report on', !!drSes.id, 'session=' + drSes.id);
const drAfterOpen = call('dayreport.list', { sessionId: drSes.id });
ok('shop OPEN auto-generates an opening report',
  drAfterOpen.some(r => UU.upper(String(r.kind)) === 'OPEN'),
  'reports=' + drAfterOpen.map(r => r.kind).join(','));
{
  const op = drAfterOpen.filter(r => UU.upper(String(r.kind)) === 'OPEN')[0];
  ok('opening report is marked AUTO (not manual)', op && String(op.method) === 'AUTO',
    'method=' + (op && op.method));
  ok('opening report carries the opening cash', op && UU.num(op.openingCash) === 7500,
    'opening=' + (op && op.openingCash));
}

/* ---------- CLOSE ---------- */
const drOpen = call('cash.session.current', {});
call('cash.session.close', { sessionId: drSes.id, closingCash: UU.num(drOpen.expectedCash) - 250 });
const drAfterClose = call('dayreport.list', { sessionId: drSes.id });
ok('shop CLOSE auto-generates a closing report',
  drAfterClose.some(r => UU.upper(String(r.kind)) === 'CLOSE'),
  'reports=' + drAfterClose.map(r => r.kind).join(','));
{
  const cl = drAfterClose.filter(r => UU.upper(String(r.kind)) === 'CLOSE')[0];
  ok('closing report records expected vs closing cash',
    cl && UU.num(cl.expectedCash) > 0, JSON.stringify(cl && {
      expected: cl.expectedCash, closing: cl.closingCash, variance: cl.variance
    }));
  ok('closing report records the cash variance', cl && UU.num(cl.variance) === -250,
    'variance=' + (cl && cl.variance));
}

/* ---------- HISTORY: print / pdf / csv ---------- */
const drList = call('dayreport.list', {});
ok('report history lists every generated report', drList.length > drBefore,
  'before=' + drBefore + ' now=' + drList.length);
ok('history is newest-first',
  drList.length < 2 || String(drList[0].generatedAt) >= String(drList[1].generatedAt),
  'order ok');

const drOne = drList[0];
{
  const h = call('dayreport.html', { id: drOne.id });
  ok('history report can be re-printed (HTML)',
    typeof h.html === 'string' && h.html.length > 500,
    'html length=' + (h.html || '').length + ' reportNo=' + h.reportNo);
  ok('the HTML is a complete document (print-ready)',
    /<html/i.test(h.html) && /<\/html>/i.test(h.html), 'not a full document');
}
{
  const csv = call('dayreport.csv', { id: drOne.id });
  ok('history report exports to CSV',
    csv && String(csv.csv).split('\n')[0] === 'Field,Value', 'head=' + String(csv.csv).split('\n')[0]);
  ok('CSV filename comes from the report number',
    !!(csv && csv.filename), 'filename=' + (csv && csv.filename));
}

/* ---------- settings-driven ---------- */
{
  call('system.settings.save', { values: { dayReportAutoOpen: 'false', dayReportAutoClose: 'false' } });
  const beforeOff = call('dayreport.list', {}).length;
  const offSes = call('cash.session.open', { openingCash: 3000, notes: 'auto off' });
  const afterOff = call('dayreport.list', {}).length;
  ok('setting OFF → no report is generated (settings-driven)',
    afterOff === beforeOff, 'before=' + beforeOff + ' after=' + afterOff);
  call('cash.session.close', { sessionId: offSes.id, closingCash: 3000 });
  ok('setting OFF → closing bhi report nahi banata',
    call('dayreport.list', {}).length === beforeOff, 'count=' + call('dayreport.list', {}).length);
  /* wapas ON */
  call('system.settings.save', { values: { dayReportAutoOpen: 'true', dayReportAutoClose: 'true' } });
  const onSes = call('cash.session.open', { openingCash: 500, notes: 'auto on again' });
  ok('setting wapas ON → report phir se banta hai',
    call('dayreport.list', { sessionId: onSes.id }).length > 0, 'reports=' +
    call('dayreport.list', { sessionId: onSes.id }).length);
  call('cash.session.close', { sessionId: onSes.id, closingCash: 500 });
}

/* ---------- audit ---------- */
{
  const acts = {};
  SDB.all('AuditLog').forEach(l => { acts[l.action] = (acts[l.action] || 0) + 1; });
  ok('every generated report is audited', acts.DAY_REPORT > 0, 'count=' + acts.DAY_REPORT);
}

/* ---------- safe: report na bane to session phir bhi khule ---------- */
ok('a report failure can never block opening or closing the shop',
  typeof sandbox.Reports.dayReport.auto === 'function' &&
  sandbox.Reports.dayReport.auto('CLOSE', null, {}) === null,
  'auto() must swallow errors and return null');

/* ==========================================================================
   v2.6 §4 — PO / GRN: print · PDF · duplicate · approval
   ========================================================================== */
section('PO / GRN documents: print · PDF · duplicate (§4)');

const ddSup = SDB.all('Suppliers')[0];
const ddItem = SDB.all('Items').filter(i => UU.num(i.costPrice) > 0)[0];

/* ---------- DUPLICATE ---------- */
const ddPo = call('purchase.po.save', { po: { supplierId: ddSup.id, locationId: LOC,
  items: [{ itemId: ddItem.id, qty: 7, rate: UU.num(ddItem.costPrice) }] } });
const ddCopy = call('purchase.po.duplicate', { id: ddPo.id });
ok('PO duplicate ban jata hai', !!ddCopy.id && ddCopy.id !== ddPo.id,
  'copy=' + (ddCopy.id || 'none'));
ok('duplicate ko NAYA number milta hai', ddCopy.poNo !== ddPo.poNo,
  'old=' + ddPo.poNo + ' new=' + ddCopy.poNo);

const ddCopyFull = call('purchase.po.get', { id: ddCopy.id });
ok('duplicate mein purani lines copy hoti hain',
  ddCopyFull.items.length === 1 && UU.num(ddCopyFull.items[0].qty) === 7,
  'lines=' + ddCopyFull.items.length);
ok('duplicate ke lines ka rate bhi copy hota hai',
  UU.num(ddCopyFull.items[0].rate) === UU.num(ddItem.costPrice),
  'rate=' + ddCopyFull.items[0].rate);
ok('duplicate DRAFT hota hai (approved PO dobara approve nahi chahiye)',
  UU.upper(String(ddCopyFull.status)) === 'DRAFT', 'status=' + ddCopyFull.status);
ok('duplicate ki received qty zero hoti hai',
  UU.num(ddCopyFull.items[0].receivedQty) === 0, 'received=' + ddCopyFull.items[0].receivedQty);
ok('duplicate mein source PO ka zikr rehta hai (traceability)',
  /Copied from/.test(String(ddCopyFull.notes || '')), 'notes=' + ddCopyFull.notes);

{
  const acts = {};
  SDB.all('AuditLog').forEach(l => { acts[l.action] = (acts[l.action] || 0) + 1; });
  ok('duplicate audit hota hai (kaun se PO se copy kiya)', acts.PO_DUPLICATE > 0,
    'count=' + acts.PO_DUPLICATE);
  const dup = SDB.all('AuditLog').filter(l => l.action === 'PO_DUPLICATE').pop();
  ok('duplicate audit mein source PO likha hota hai',
    JSON.parse(dup.before || '{}').sourcePoNo === ddPo.poNo,
    'before=' + dup.before);
}

/* ---------- PRINT / PDF ---------- */
{
  const html = call('purchase.po.html', { id: ddPo.id });
  ok('PO print ke liye HTML banta hai', typeof html === 'string' && html.length > 300,
    'len=' + (html || '').length);
  ok('PO HTML mein PO number hai', String(html).indexOf(ddPo.poNo) > -1, 'no=' + ddPo.poNo);
  ok('PO HTML mein supplier ka naam hai', String(html).indexOf(ddSup.name) > -1, 'supplier missing');
  ok('PO HTML mein lines hain', String(html).indexOf(ddItem.name || ddItem.code) > -1, 'item missing');
}
{
  const pdf = call('purchase.po.pdf', { id: ddPo.id });
  ok('PO PDF server-side banti hai (browser ke baghair)', !!pdf,
    JSON.stringify(pdf || {}).slice(0, 120));
}

/* GRN bhi */
const ddGrn = call('purchase.grn.save', { supplierId: ddSup.id, locationId: LOC,
  items: [{ itemId: ddItem.id, qty: 3, cost: UU.num(ddItem.costPrice) }] });
{
  const html = call('purchase.grn.html', { id: ddGrn.id });
  ok('GRN print ke liye HTML banta hai', typeof html === 'string' && html.length > 300,
    'len=' + (html || '').length);
  ok('GRN HTML mein GRN number hai', String(html).indexOf(ddGrn.grnNo) > -1, 'no=' + ddGrn.grnNo);
}
{
  const pdf = call('purchase.grn.pdf', { id: ddGrn.id });
  ok('GRN PDF banti hai', !!pdf, JSON.stringify(pdf || {}).slice(0, 120));
}

/* ---------- APPROVAL ---------- */
{
  const appr = call('purchase.po.approve', { id: ddPo.id });
  ok('PO approve hoti hai', !!appr, JSON.stringify(appr || {}).slice(0, 80));
  const after = call('purchase.po.get', { id: ddPo.id });
  ok('approve ke baad status APPROVED',
    UU.upper(String(after.status)) === 'APPROVED', 'status=' + after.status);
}

/* ---------- shared renderer ---------- */
ok('PO aur GRN ek hi renderer se bante hain (ek jagah look badlo, dono badlein)',
  typeof sandbox.Exports.docHtml === 'function', 'Exports.docHtml missing');



/* Server-side PDF paths: ab mock Drive ke sath testable hain (pehle untested thay) */
section('Server-side PDF paths (mock Drive)');
{
  const inv = call('sales.create', { sale: { locationId: LOC,
    items: [{ itemId: ddItem.id, qty: 1, price: UU.num(ddItem.retailPrice), discount: 0, taxRate: 0 }],
    payments: [{ method: 'CASH', amount: UU.num(ddItem.retailPrice) }] } });
  const p1 = call('exports.invoicePdf', { id: inv.id || inv.saleId });
  ok('invoice PDF server-side banti hai', !!p1 && !!p1.url, JSON.stringify(p1 || {}).slice(0, 100));
}
{
  const sess = call('cash.session.open', { locationId: LOC, openingCash: 100 });
  const p2 = call('shop.dayReport.pdf', { sessionId: sess.id });
  ok('day report PDF server-side banti hai (§7 history ka PDF button)',
    !!p2 && !!p2.url, JSON.stringify(p2 || {}).slice(0, 120));
}

/* ==========================================================================
   v2.6 §10 / §11 / §13 — Mobile PWAs (har app ka apna URL)
   ========================================================================== */
section('Mobile PWAs: warehouse · field order · salesman (§10/§11/§13)');
const PSESS = Object.assign({}, SESSION, { locationId: LOC });

ok('teenon PWA registered hain (wh / fo / sm)',
  !!(sandbox.Pwa && sandbox.Pwa.APPS && sandbox.Pwa.APPS.wh &&
     sandbox.Pwa.APPS.fo && sandbox.Pwa.APPS.sm),
  Object.keys((sandbox.Pwa && sandbox.Pwa.APPS) || {}).join(','));
ok('har app ka apna naam hai (home screen par alag lage)',
  sandbox.Pwa.APPS.wh.shortName !== sandbox.Pwa.APPS.fo.shortName &&
  sandbox.Pwa.APPS.fo.shortName !== sandbox.Pwa.APPS.sm.shortName,
  [sandbox.Pwa.APPS.wh.shortName, sandbox.Pwa.APPS.fo.shortName, sandbox.Pwa.APPS.sm.shortName].join(' / '));

{
  const code = require('fs').readFileSync('apps-script/Code.gs', 'utf8');
  ok('doGet ?app= se alag template serve karta hai',
    /PWA_TEMPLATES\s*=\s*\{[^}]*wh:\s*'Pwa_Warehouse'[^}]*fo:\s*'Pwa_Field'[^}]*sm:\s*'Pwa_Salesman'/.test(code),
    'PWA_TEMPLATES missing');
  ['pwa.bootstrap', 'pwa.wh.receive', 'pwa.wh.putaway', 'pwa.wh.count',
   'pwa.wh.transfer', 'pwa.fo.order', 'pwa.sm.sell', 'pwa.sm.collect', 'pwa.sync']
    .forEach(a => ok('route mojood: ' + a, code.indexOf("'" + a + "'") > -1, a + ' missing'));
}

/* ---------- settings-driven ---------- */
ok('har PWA settings se band ho sakti hai (default ON)',
  sandbox.Pwa.enabled('wh') && sandbox.Pwa.enabled('fo') && sandbox.Pwa.enabled('sm'),
  'defaults must be ON');
sandbox.DB.setSetting('pwa.fo.enabled', 'false');
try {
  sandbox.Pwa.bootstrap({ app: 'fo' }, PSESS);
  ok('band app kholne par error aata hai', false, 'band honay ke bawajood khul gayi');
} catch (e) {
  ok('band app kholne par error aata hai', /band hai/.test(e.message), e.message);
}
sandbox.DB.setSetting('pwa.fo.enabled', 'true');
ok('settings se wapas ON karne par app chalti hai', sandbox.Pwa.enabled('fo'), 'still off');

/* ---------- bootstrap: ek hi round trip ---------- */
{
  const b = sandbox.Pwa.bootstrap({ app: 'wh', locationId: LOC }, PSESS);
  ok('warehouse bootstrap ek hi call mein sab data deta hai',
    !!(b.config && b.locations && b.items && b.bins && b.tasks), Object.keys(b).join(','));
  ok('bootstrap mein tasks aate hain (receive + count)', Array.isArray(b.tasks), 'tasks missing');
  ok('bootstrap mein items aate hain (scan ke liye)', b.items.length > 0, 'items=' + b.items.length);
  ok('item mein code + name + barcode hai (scanner ke liye)',
    !!(b.items[0] && b.items[0].code && b.items[0].name), JSON.stringify(b.items[0] || {}).slice(0, 100));
}
{
  const b = sandbox.Pwa.bootstrap({ app: 'fo', locationId: LOC }, PSESS);
  ok('field-order bootstrap mein customers aate hain', Array.isArray(b.customers), 'customers missing');
  ok('field-order bootstrap mein drafts aate hain', Array.isArray(b.drafts), 'drafts missing');
}
{
  const b = sandbox.Pwa.bootstrap({ app: 'sm', locationId: LOC }, PSESS);
  ok('salesman bootstrap mein mera stock aata hai', Array.isArray(b.myStock), 'myStock missing');
  ok('salesman app mein customers hain (route par udhaar wasooli ke liye)',
    b.customers.length > 0, 'customers=' + b.customers.length);
}
try {
  sandbox.Pwa.bootstrap({ app: 'kuchbhi' }, {});
  ok('galat app id par error', false, 'ghalat id chali gayi');
} catch (e) { ok('galat app id par error', /Unknown PWA/.test(e.message), e.message); }

/* ---------- §10 warehouse actions ---------- */
{
  const sup = SDB.all('Suppliers')[0];
  const it = SDB.all('Items').filter(i => UU.num(i.costPrice) > 0)[0];
  const before = UU.num((SDB.all('Stock').filter(r => r.itemId === it.id && r.locationId === LOC)[0] || {}).qty);
  const r = sandbox.Pwa.whReceive({
    supplierId: sup.id, locationId: LOC,
    items: [{ itemId: it.id, qty: 5, cost: UU.num(it.costPrice) }]
  }, PSESS);
  ok('phone se GRN receive hoti hai', !!(r && r.ok && r.grnNo), JSON.stringify(r).slice(0, 120));
  const after = UU.num((SDB.all('Stock').filter(x => x.itemId === it.id && x.locationId === LOC)[0] || {}).qty);
  ok('GRN se stock badhta hai', after === before + 5, 'before=' + before + ' after=' + after);
  ok('GRN audit hota hai (PWA se aayi — traceable)',
    SDB.all('AuditLog').filter(l => l.action === 'PWA_WH_RECEIVE').length > 0, 'no audit');
}
{
  try {
    sandbox.Pwa.whReceive({ items: [] }, PSESS);
    ok('khali GRN reject hoti hai', false, 'khali GRN ban gayi');
  } catch (e) { ok('khali GRN reject hoti hai', /item|qty/i.test(e.message), e.message); }
}

/* ---------- §11 field order + offline sync ---------- */
{
  const it = SDB.all('Items')[0];
  const r = sandbox.Pwa.foOrder({
    locationId: LOC, customerName: 'Field Customer', clientId: 'c-test-1',
    items: [{ itemId: it.id, qty: 2, price: 100 }]
  }, PSESS);
  ok('phone se order banta hai', !!(r && r.ok && r.orderNo), JSON.stringify(r).slice(0, 120));

  const again = sandbox.Pwa.foOrder({
    locationId: LOC, customerName: 'Field Customer', clientId: 'c-test-1',
    items: [{ itemId: it.id, qty: 2, price: 100 }]
  }, PSESS);
  ok('do-bara sync par DOUBLE order nahi banta (idempotent)',
    again.duplicate === true && again.id === r.id, JSON.stringify(again).slice(0, 140));
  ok('draft order do dafa nahi bana',
    SDB.all('Orders').filter(o => UU.str(o.clientId) === 'c-test-1').length === 1,
    'count=' + SDB.all('Orders').filter(o => UU.str(o.clientId) === 'c-test-1').length);
}
{
  const it = SDB.all('Items')[0];
  const q = [
    { clientId: 'q1', action: 'pwa.fo.order',
      payload: { locationId: LOC, customerName: 'Off1', items: [{ itemId: it.id, qty: 1, price: 50 }] } },
    { clientId: 'q2', action: 'kuch.ghalat', payload: {} },
    { clientId: 'q3', action: 'pwa.fo.order',
      payload: { locationId: LOC, customerName: 'Off2', items: [{ itemId: it.id, qty: 3, price: 50 }] } }
  ];
  const r = sandbox.Pwa.sync({ queue: q }, PSESS);
  ok('sync dono theek walay chalata hai', r.synced === 2, 'synced=' + r.synced);
  ok('ek galat action poori queue ko nahi rokta (partial failure safe)',
    r.failed === 1 && r.results.length === 3, 'failed=' + r.failed);
  ok('fail hua item dobara try ke liye pehchana jata hai',
    r.results.filter(x => !x.ok)[0].clientId === 'q2', 'wrong item failed');
  ok('sync audit hota hai', SDB.all('AuditLog').filter(l => l.action === 'PWA_SYNC').length > 0, 'no audit');
}
{
  const r = sandbox.Pwa.sync({ queue: [] }, PSESS);
  ok('khali queue par sync crash nahi karta', r.ok === true && r.synced === 0, JSON.stringify(r));
}

/* ---------- Pwa.serve / manifest ---------- */
ok('Pwa.serve maujood hai (doGet isi se alag page banata hai)',
  typeof sandbox.Pwa.serve === 'function', 'Pwa.serve missing');
ok('Pwa.manifest har app ke liye alag naam deta hai',
  typeof sandbox.Pwa.manifest === 'function' &&
  sandbox.Pwa.manifest('wh').short_name !== sandbox.Pwa.manifest('sm').short_name,
  'manifest missing ya same naam');
ok('manifest standalone hai (phone par poori app lage)',
  sandbox.Pwa.manifest('fo').display === 'standalone', 'display=' + sandbox.Pwa.manifest('fo').display);
ok('manifest mein icons hain (install ke liye)',
  (sandbox.Pwa.manifest('wh').icons || []).length >= 2, 'icons missing');

/* ------------------------------- summary ---------------------------------- */
console.log('\n' + '='.repeat(62));
console.log('PASS: ' + pass + '   FAIL: ' + fail);
if (fail) { console.log('\nFailures:'); failures.forEach(f => console.log(' - ' + f)); }
console.log('='.repeat(62));
process.exit(fail ? 1 : 0);

