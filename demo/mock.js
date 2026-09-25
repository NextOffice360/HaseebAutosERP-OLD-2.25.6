/* ==========================================================================
   HASEEB AUTOS — DEMO / MOCK BACKEND
   Ye file SIRF preview ke liye hai: asli Google Apps Script backend ki jagah
   in-browser fake data deti hai taake aap poora UI/UX live dekh sakein.
   (Asli deployment mein iski zaroorat nahi — Apps Script hi backend hai.)
   ========================================================================== */
(function () {
'use strict';

const LOCATIONS = [
  { id: 'LOC-SDQ', code: 'SDQ', name: 'Sadiqabad City', address: 'Main Bazar, Sadiqabad', isDefault: 'true', active: 'true' },
  { id: 'LOC-MCH', code: 'MCH', name: 'Machi Goth', address: 'Machi Goth', isDefault: 'false', active: 'true' },
  { id: 'LOC-RYK', code: 'RYK', name: 'RYK Branch', address: 'Rahim Yar Khan', isDefault: 'false', active: 'true' }
];
const TYPES = [
  { id: 'CT-1', name: 'Retail / Walk-in', discountPct: '0', priceTier: 'RETAIL', creditLimit: '0', active: 'true' },
  { id: 'CT-2', name: 'Wholesale', discountPct: '10', priceTier: 'WHOLESALE', creditLimit: '500000', active: 'true' },
  { id: 'CT-3', name: 'Mechanic', discountPct: '5', priceTier: 'RETAIL', creditLimit: '50000', active: 'true' },
  { id: 'CT-5', name: 'Corporate', discountPct: '12', priceTier: 'WHOLESALE', creditLimit: '1000000', active: 'true' }
];
/* Real Flamingo catalogue (list.pdf + barcode.pdf) — demo/products.js */
const PRODUCT_SEED = window.PRODUCT_SEED || null;

const SETTINGS = {
  businessName: 'Haseeb Autos', businessNameUr: 'حسیب آٹوز',
  tagline: 'Auto Parts • Car & Bike Decoration', phone: '+92 300 1234567',
  address: 'Sadiqabad, Punjab, Pakistan', currency: 'PKR', currencySymbol: 'Rs',
  taxRate: '0', taxLabel: 'GST', receiptHeader: 'Haseeb Autos',
  receiptFooter: 'Shukriya! Phir aayein.', showUrduOnReceipt: 'true',
  aiProvider: 'GEMINI', aiModel: '', aiEnabled: 'true', aiCanWrite: 'false',
  allowNegativeStock: 'false', allowCreditSale: 'true', lowStockThreshold: '5',
  defaultLanguage: 'en', defaultPaymentMethod: 'CASH',

  /* ---- v2 (metadata-driven) settings ---- */
  'biz.name': 'Haseeb Autos', 'biz.nameUr': 'حسیب آٹوز', 'biz.phone': '+92 300 1234567',
  'biz.address': 'Sadiqabad, Punjab, Pakistan', 'biz.ntn': '', 'biz.strn': '',
  'biz.currency': 'PKR', 'biz.currencySymbol': 'Rs', 'biz.decimals': '2',
  'biz.roundingMode': 'NONE', 'biz.thousandSep': 'true', 'biz.dateFormat': 'dd/MM/yyyy',
  'biz.timezone': 'Asia/Karachi', 'biz.defaultBranch': 'LOC-SDQ', 'biz.receiptNote': 'Shukriya!',
  'pos.cardsPerRow': '4', 'pos.defaultView': 'all', 'pos.showImageOnCard': 'true',
  'pos.showStockOnCard': 'true', 'pos.allowDirectQty': 'true', 'pos.scanSound': 'true',
  'pos.autoFocusSearch': 'true', 'pos.quickKeys': 'true', 'pos.allowCreditSale': 'true',
  'pos.receiptWidth': '80mm', 'pos.quickCashButtons': '500,1000,2000,5000',
  'pos.lowStockBadge': 'true', 'pos.showProfit': 'true',
  /* v2.30.0 — shop session rules + demo data visibility (asli app jaisa) */
  'shop.requireOpen': 'true', 'shop.openPromptOnLogin': 'true', 'shop.defaultOpeningCash': '0',
  'data.showDemo': 'true', 'data.seedDemo': 'true', 'setup.wizardDone': 'false',
  'dayReportAutoOpen': 'true', 'dayReportAutoClose': 'true', 'dayReportAutoPrint': 'true',
  'tax.rate': '0', 'tax.label': 'GST', 'tax.inclusive': 'false', 'tax.discountBeforeTax': 'true',
  'inventory.allowNegativeStock': 'false',
  'autoReorder': 'true', 'autoReorderMethod': 'VELOCITY', 'autoReorderLookback': '30',
  'autoReorderCoverageDays': '30', 'autoReorderLeadTimeDays': '7', 'autoReorderSafetyDays': '7',
  'autoReorderSupplierMode': 'PRIMARY', 'autoReorderCreate': 'DRAFT',
  'autoReorderMinValue': '0', 'autoReorderIncludeSlow': 'false', 'inventory.lowStockThreshold': '5',
  'inventory.costingMethod': 'AVG', 'inventory.trackBins': 'true', 'inventory.trackLots': 'false',
  'inventory.trackSerial': 'false', 'inventory.autoReorder': 'true', 'inventory.expiryAlertDays': '30',
  'trade.maxDiscountPct': '30', 'trade.allowCreditSale': 'true', 'trade.defaultPaymentTerms': 'NET 30',
  'trade.enableWholesale': 'true', 'trade.enableLoyalty': 'true', 'trade.loyaltyPerAmount': '1000',
  'mod.pos': 'true', 'mod.sales': 'true', 'mod.purchase': 'true', 'mod.inventory': 'true',
  'mod.warehouse': 'true', 'mod.accounts': 'true', 'mod.reports': 'true', 'mod.hr': 'false',
  'mod.crm': 'true', 'mod.ai': 'true', 'mod.delivery': 'true', 'mod.manufacturing': 'false',
  'auto.reorder': 'true', 'auto.alerts': 'true', 'auto.backup': 'false', 'auto.poEmail': 'false',
  'pay.settleSkipWeekend': 'true', 'pay.cheque.bounceCharges': '350',
  'pay.cheque.clearDays': '2', 'pay.cheque.alertDays': '5',
  'pay.CASH.feePct': '0', 'pay.CARD.feePct': '2.5', 'pay.BANK.feePct': '0',
  'pay.JAZZCASH.feePct': '2', 'pay.EASYPAISA.feePct': '2.5', 'pay.RAAST.feePct': '0',
  'pay.CHEQUE.feePct': '0', 'pay.CREDIT.feePct': '0',
  'loyalty.enabled': 'true', 'loyalty.perAmount': '1000', 'loyalty.points': '1', 'loyalty.rate': '1',
  'loyalty.minRedeem': '50', 'loyalty.maxRedeemPct': '50', 'loyalty.rounding': 'DOWN', 'loyalty.expiryMonths': '0',
  'comms.whatsapp.provider': 'LINK', 'comms.countryCode': '92', 'comms.attachPdf': 'true',
  'comms.autoSendInvoice': 'false', 'comms.email.provider': 'APPS_SCRIPT', 'comms.email.fromName': 'Haseeb Autos',
  'comms.sms.provider': 'NONE', 'comms.email.subject': 'Invoice {{invoiceNo}} from Haseeb Autos',
  'comms.invoiceTemplate': 'Salam {{customer}}!\nInvoice {{invoiceNo}} · {{date}}\nTotal: {{total}}\nPaid: {{paid}}\nDue: {{due}}\nShukriya — {{business}}',
  'comms.reminderTemplate': 'Yaad-dahani: {{customer}}, invoice {{invoiceNo}} ki baqaya {{due}} reh gayi hai.',
  'price-import.minMarginPct': '5', 'price-import.autoCreate': 'false',
  'price-import.defaultCategory': 'Uncategorised', 'price-import.defaultMarginPct': '25',
  'migration.autoSync': 'false', 'migration.reminderRows': '100000',
  'exports.folder': 'Haseeb Autos Exports', 'exports.shareLinks': 'true',
  'exports.invoiceTitle': 'TAX INVOICE',
  'job.dailyReorder': 'true', 'job.dailyHour': '7', 'job.dailyAutoPO': 'false',
  'job.dailyAlerts': 'true', 'job.alertsHour': '6', 'job.timezone': 'Asia/Karachi',
  'sec.sessionTimeout': '480', 'sec.forceStrongPass': 'true', 'sec.auditRetention': '365',
  'sec.allowOffline': 'true', 'sec.twoFactor': 'false',
  'theme.primary': '#ff6a00', 'theme.accent': '#2f7fed', 'theme.mode': 'auto',
  'theme.density': 'comfortable', 'theme.fontSize': 'medium', 'theme.radius': '14',
  'print.receipt': 'true', 'print.label': 'true', 'print.a4': 'true', 'print.qrOnReceipt': 'true'
};

const SEED = [
  ['HLG-001','LED Headlight H4 60/55W','Lights','Philips','LIGHTING','Universal','',850,1200,1050,42],
  ['HLG-002','LED Fog Lamp 3" Round','Lights','Auxbeam','LIGHTING','Universal','',1200,1900,1700,26],
  ['BRK-001','Brake Pad Set Front (Corolla)','Brakes','NKM','BRAKES','Toyota','Corolla 2009-2020',2200,3200,2800,18],
  ['BRK-002','Brake Shoe Rear (Mehran)','Brakes','NKM','BRAKES','Suzuki','Mehran',900,1500,1300,31],
  ['OIL-001','Engine Oil 20W-50 4L','Oil & Lubricants','Shell','OIL','Universal','',2400,3000,2700,58],
  ['OIL-002','Gear Oil 80W-90 1L','Oil & Lubricants','Caltex','OIL','Universal','',620,900,800,44],
  ['BTRY-001','Battery 12V 65AH','Battery','Exide','BATTERY','Universal','',11500,14500,13200,12],
  ['BTRY-002','Battery 12V 45AH (Bike)','Battery','Exide','BATTERY','Motorcycle','',4200,5600,5000,22],
  ['TYR-001','Tyre 175/70 R13','Tyres','General','TYRE','Universal','',7800,9500,8800,16],
  ['DEC-001','Dashboard Decor Kit','Decoration','AutoStyle','DECOR','Universal','',950,1800,1500,34],
  ['DEC-002','Chrome Door Handle Cover','Decoration','AutoStyle','DECOR','Universal','',480,900,780,52],
  ['BIK-001','Bike LED Strip Light','Bike Accessories','AutoStyle','DECOR','Motorcycle','',350,700,600,64],
  ['BIK-002','Bike Mobile Holder','Bike Accessories','AutoStyle','DECOR','Motorcycle','',280,600,500,48],
  ['FLR-001','Car Floor Mat 5D','Interior','AutoStyle','DECOR','Universal','',2800,4500,4000,20],
  ['FLR-002','Seat Cover Leather (Universal)','Interior','AutoStyle','DECOR','Universal','',3600,5900,5200,9],
  ['SPK-001','Spark Plug Iridium','Engine','NGK','ENGINE','Universal','',750,1100,980,70],
  ['SPK-002','Timing Belt Kit','Engine','Gates','ENGINE','Toyota','Corolla',3100,4800,4300,11],
  ['FLT-001','Oil Filter (Corolla/Civic)','Filters','Guard','FILTER','Toyota','Corolla',380,650,560,55],
  ['FLT-002','Air Filter (Cultus)','Filters','Guard','FILTER','Suzuki','Cultus',420,720,620,40],
  ['ELC-001','Car Horn 12V Pair','Electrical','Hella','ELECTRICAL','Universal','',680,1200,1050,30],
  ['ELC-002','Wiper Blade 22" Pair','Electrical','Bosch','ELECTRICAL','Universal','',520,950,820,46],
  ['ELC-003','Car Charger Dual USB','Electrical','Baseus','ELECTRICAL','Universal','',450,900,780,60],
  ['BDY-001','Side Mirror (Corolla)','Parts','Taiwan','BODY','Toyota','Corolla',1800,2900,2500,7],
  ['BDY-002','Bumper Guard Black','Parts','Local','BODY','Universal','',2200,3600,3100,5],
  ['BDY-003','Mud Flap Set 4 PCS','Parts','Local','BODY','Universal','',320,650,550,72],
  ['LUB-001','Brake Fluid DOT4 500ml','Oil & Lubricants','Bosch','OIL','Universal','',380,650,560,38],
  ['LUB-002','Coolant 4L Red','Oil & Lubricants','Caltex','OIL','Universal','',720,1200,1050,24],
  ['ACC-001','Car Perfume Hanging','Decoration','AirWick','DECOR','Universal','',180,400,340,80],
  ['ACC-002','Steering Cover Leather','Interior','AutoStyle','DECOR','Universal','',550,1100,950,33],
  ['ACC-003','Sunshade Windshield','Interior','AutoStyle','DECOR','Universal','',420,900,780,27]
];

const rnd = (() => { let s = 42; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; })();
const pick = a => a[Math.floor(rnd() * a.length)];

/* Real catalogue (71 Flamingo SKUs) + demo SEED = full catalog in demo mode */
/* Catalog dono shape mein aa sakta hai:
   long keys (code/name/category/subCategory/costPrice/retailPrice/wholesalePrice/size/barcode)
   ya short keys (c/n/cat/sub/cp/rp/wp/sz/bc) — jaisa products.js (list.pdf + barcode.pdf) deta hai. */
const ITEMS = (PRODUCT_SEED || []).map((p, i) => ({
  id: 'ITM' + (5000 + i),
  code: p.code || p.c || ('SKU' + i),
  name: p.name || p.n || (p.c || 'Item ' + i),
  nameUr: '',
  lineItem: p.lineItem || p.li || 'Car Care',
  category: p.category || p.cat || 'Car Care',
  subCategory: p.subCategory || p.sub || '',
  brand: p.brand || p.br || 'Flamingo', partType: p.partType || p.ty || 'CAR_CARE',
  make: '', model: p.model || p.md || '', origin: p.origin || p.og || '',
  yearFrom: '', yearTo: '', engine: '', chassis: '', unit: p.uom || p.unit || 'PCS',
  conversionFactor: Number(p.conversionFactor != null ? p.conversionFactor : p.f) || 1,
  barcode: p.barcode || p.bc || p.code || p.c, altBarcodes: '',
  customFields: JSON.stringify({
    cf_productGroup: p.productGroup || p.pg || '',
    cf_color: p.color || p.cl || '',
    cf_costType: p.costType || p.ct || ''
  }),
  costPrice: Number(p.costPrice != null ? p.costPrice : p.cp) || 0,
  retailPrice: Number(p.retailPrice != null ? p.retailPrice : p.rp) || 0,
  wholesalePrice: Number(p.wholesalePrice != null ? p.wholesalePrice : p.wp) || 0,
  minPrice: Number(p.minPrice != null ? p.minPrice : p.cp) || 0,
  taxRate: 0, hsn: '', minStock: 5,
  reorderLevel: 10, rack: 'A' + (1 + i % 12), defaultLocationId: 'LOC-SDQ', trackSerial: 'false',
  hasExpiry: 'false', imageUrl: '', notes: ((p.size || p.sz) ? 'Size: ' + (p.size || p.sz) : ''),
  status: 'ACTIVE', size: p.size || p.sz || '',
  supplier: p.supplier || 'Ahsan Traders',
  createdAt: '2026-01-01T10:00:00', updatedAt: '2026-09-01T10:00:00',
  stock: p.stock !== undefined ? p.stock : (10 + (i * 7) % 40)
})).concat(SEED.map((s, i) => ({
  id: 'ITM' + (1000 + i), code: s[0], name: s[1], nameUr: '', category: s[2], subCategory: '',
  brand: s[3], partType: s[4], make: s[5], model: s[6], yearFrom: '', yearTo: '', engine: '', chassis: '',
  unit: 'PCS', barcode: s[0], altBarcodes: '', costPrice: s[7], retailPrice: s[8], wholesalePrice: s[9],
  minPrice: s[7], taxRate: 0, hsn: '', minStock: 5, reorderLevel: 10, rack: 'A' + (1 + i % 12),
  defaultLocationId: 'LOC-SDQ', trackSerial: 'false', hasExpiry: 'false', imageUrl: '', notes: '',
  status: 'ACTIVE', createdAt: '2026-01-01T10:00:00', updatedAt: '2026-09-01T10:00:00',
  stock: s[10]
})));

/* v2.30.0 (N10) — 2 "catalog only" demo products (stock abhi 0):
   All Inventory + "Out of stock" filter aur PO→GRN se pehle ka asli scenario. */
[['CAT-001', 'Seat Cover Set (Universal)', 'Interior', 'AutoStyle', 3800, 5200],
 ['CAT-002', 'Roof Rack Cross Bars', 'Accessories', 'Rhino', 6400, 8800]
].forEach((c, k) => ITEMS.push({
  id: 'ITM9' + (100 + k), code: c[0], name: c[1], nameUr: '', category: c[2], subCategory: '',
  brand: c[3], partType: 'ACCESSORY', make: 'Universal', model: '', yearFrom: '', yearTo: '', engine: '', chassis: '',
  unit: 'PCS', barcode: c[0], altBarcodes: '', costPrice: c[4], retailPrice: c[5], wholesalePrice: c[4],
  minPrice: c[4], taxRate: 0, hsn: '', minStock: 5, reorderLevel: 10, rack: 'B1',
  defaultLocationId: 'LOC-SDQ', trackSerial: 'false', hasExpiry: 'false', imageUrl: '',
  notes: 'Catalog item — stock 0 (GRN se pehle)', status: 'ACTIVE',
  createdAt: '2026-09-01T10:00:00', updatedAt: '2026-09-01T10:00:00', stock: 0
}));

const NAMES = ['Ahmad Ali','Bilal Khan','Haji Rafiq','Usman Sheikh','Kamran Motors','Zeeshan Autos','Imran Bhatti',
  'Sajjad Workshop','New City Motors','Faisal Traders','Rana Autos','Tariq Mehmood','Shahid Cycle Store',
  'Javed Iqbal','Al-Madina Motors','Sunny Car Care','Nadeem Electrician','Waqas Ali'];
const CUSTOMERS = NAMES.map((n, i) => ({
  id: 'CUS' + (1000 + i), code: 'CUS-' + String(i + 1).padStart(4, '0'), name: n,
  phone: '0300' + String(1000000 + i * 137).slice(0, 7), email: '', address: 'Sadiqabad',
  cnic: '', ntn: '', customerTypeId: pick(TYPES).id, openingBalance: i % 5 === 0 ? 2000 : 0,
  creditLimit: 100000, membershipId: '', points: Math.floor(rnd() * 300), priceTier: 'RETAIL',
  notes: '', active: 'true', createdAt: '2026-01-01T10:00:00',
  balance: i % 4 === 0 ? Math.floor(rnd() * 25000) : 0
}));
const SUPNAMES = ['Karachi Auto Traders','Lahore Parts House','Punjab Autos','Multan Spare Parts',
  'Pak China Motors','Ravi Engineering','Super Star Imports'];
const SUPPLIERS = SUPNAMES.map((n, i) => ({
  id: 'SUP' + (1000 + i), code: 'SUP-' + String(i + 1).padStart(4, '0'), name: n,
  phone: '0321' + String(2000000 + i * 311).slice(0, 7),
  email: 'sales' + (i + 1) + '@supplier.example', address: 'Multan Road, Lahore',
  ntn: '1234567-' + (i + 1), openingBalance: 0, creditLimit: 250000, paymentTerms: '30 days', ledgerAccount: '', notes: '',
  active: 'true', createdAt: '2026-01-01T10:00:00',
  balance: -(i % 3 === 0 ? Math.floor(rnd() * 180000) : 0)
}));

/* v2.3 state stores */
const SALE_ITEMS = [];
const PAYMENTS = [];
const LEDGER = [];
const MESSAGES = [];
const LOYALTY = [];
const REPORT_ROWS = { sales: [], stock: [], profit: [], lowstock: [] };

/* generate 45 days of sales */
const SALES = [];
let seq = 1001;
for (let d = 44; d >= 0; d--) {
  const date = new Date(Date.now() - d * 864e5);
  const bills = 6 + Math.floor(rnd() * 12);
  for (let b = 0; b < bills; b++) {
    const n = 1 + Math.floor(rnd() * 4);
    const items = [];
    let subtotal = 0, cost = 0;
    for (let k = 0; k < n; k++) {
      const it = pick(ITEMS);
      const qty = 1 + Math.floor(rnd() * 3);
      const price = Number(it.retailPrice);
      const si = { id: 'SI' + seq + k, saleId: 'SAL' + seq, itemId: it.id, code: it.code, name: it.name,
        qty, price, cost: Number(it.costPrice), discount: 0, tax: 0, lineTotal: price * qty, salespersonId: 'USR3', serial: '' };
      SALE_ITEMS.push(si);
      items.push(si);
      subtotal += price * qty; cost += Number(it.costPrice) * qty;
    }
    const disc = rnd() > 0.7 ? Math.floor(subtotal * 0.05) : 0;
    const total = subtotal - disc;
    /* v2.25.5 — status AB numbers se nikalta hai (wahi rule jo sales.create L1366 par hai).
       Pehle status random tha: zero-value bill par "DUE" chip lag jati thi jab ke due 0 tha
       (demo sales ledger mein inconsistency — payment-ledger gate ne pakra). */
    const wantDue = rnd() > 0.85;
    const paidSeed = wantDue ? 0 : total;
    const status = (total - paidSeed) <= 0 ? 'PAID' : (paidSeed > 0 ? 'PARTIAL' : 'DUE');
    date.setHours(9 + Math.floor(rnd() * 11), Math.floor(rnd() * 60), 0, 0);
    SALES.push({
      id: 'SAL' + seq, invoiceNo: 'INV-SDQ-' + seq, date: date.toISOString(),
      locationId: pick(LOCATIONS).id, customerId: rnd() > 0.4 ? pick(CUSTOMERS).id : '',
      customerName: rnd() > 0.4 ? pick(CUSTOMERS).name : 'Walk-in Customer', customerType: '',
      subtotal, discount: disc, discountCode: '', tax: 0, total,
      paid: paidSeed, change: 0, due: Math.max(0, total - paidSeed),
      paymentMethod: rnd() > 0.3 ? 'CASH' : 'CARD', payments: JSON.stringify([{ method: 'CASH', amount: paidSeed }]),
      status, salespersonId: 'USR3', cashierId: 'USR2', sessionId: '', notes: '', source: 'POS',
      createdAt: date.toISOString(), items, cost
    });
    seq++;
  }
}
SALES.sort((a, b) => new Date(b.date) - new Date(a.date));

/* ------------------- permissions (Users & Security matrix) ---------------- */
const PERM_GROUPS = [
  { id: 'dashboard', icon: '\u{1F4CA}', label: 'Dashboard', labelUr: '\u0688\u06cc\u0634 \u0628\u0648\u0631\u0688' },
  { id: 'pos', icon: '\u{1F9FE}', label: 'Point of Sale', labelUr: '\u067e\u0648\u0627\u0626\u0646\u0679 \u0622\u0641 \u0633\u06cc\u0644' },
  { id: 'items', icon: '\u{1F4E6}', label: 'Products & Stock', labelUr: '\u067e\u0631\u0648\u0688\u06a9\u0679 \u0627\u0648\u0631 \u0627\u0633\u0679\u0627\u06a9' },
  { id: 'purchase', icon: '\u{1F6D2}', label: 'Purchase', labelUr: '\u062e\u0631\u06cc\u062f\u0627\u0631\u06cc' },
  { id: 'sales', icon: '\u{1F4BC}', label: 'Sales & Parties', labelUr: '\u0633\u06cc\u0644 \u0627\u0648\u0631 \u067e\u0627\u0631\u0679\u06cc\u0632' },
  { id: 'money', icon: '\u{1F4B0}', label: 'Money', labelUr: '\u0645\u0627\u0644\u06cc\u0627\u062a' },
  { id: 'reports', icon: '\u{1F4C8}', label: 'Reports', labelUr: '\u0631\u067e\u0648\u0631\u0679\u0633' },
  { id: 'admin', icon: '\u{1F510}', label: 'Admin & System', labelUr: '\u0627\u06cc\u0688\u0645\u0646 \u0627\u0648\u0631 \u0633\u0633\u0679\u0645' }
];

/* [id, group, en, ur, desc] */
const PERM_CATALOG = [
  ['dashboard.view', 'dashboard', 'View dashboard', '\u0688\u06cc\u0634 \u0628\u0648\u0631\u0688 \u062f\u06cc\u06a9\u06c1\u06cc\u06ba', 'Home charts aur KPIs'],
  ['dashboard.financial', 'dashboard', 'View financial KPIs', '\u0645\u0627\u0644\u06cc\u0627\u062a\u06cc \u0627\u0634\u0627\u0631\u06cc\u06d2', 'Profit / margin / cash widgets'],
  ['pos.access', 'pos', 'Access POS screen', 'POS \u0627\u0633\u06a9\u0631\u06cc\u0646', 'Billing screen khol sakte hain'],
  ['pos.sell', 'pos', 'Create sale / invoice', '\u0633\u06cc\u0644 / \u0627\u0646\u0648\u0627\u0626\u0633 \u0628\u0646\u0627\u0626\u06cc\u06ba', 'Naya bill'],
  ['pos.return', 'pos', 'Process sale return', '\u0633\u06cc\u0644 \u0631\u06cc\u0679\u0631\u0646', 'Exchange / refund'],
  ['pos.discount', 'pos', 'Give discount', '\u0688\u0633\u06a9\u0627\u0626\u0646\u0679 \u062f\u06cc\u0646\u0627', 'Line aur bill discount'],
  ['pos.hold', 'pos', 'Hold / park bill', '\u0628\u0644 \u06c1\u0627\u0648\u0644\u0688 \u06a9\u0631\u0646\u0627', 'Parked bills'],
  ['pos.cash.manage', 'pos', 'Cash drawer open / close', '\u06a9\u06cc\u0634 \u062f\u0631\u0627\u0632', 'Opening/closing cash, drops'],
  ['pos.price.override', 'pos', 'Override sale price', '\u0631\u06cc\u0679 \u062a\u0628\u062f\u06cc\u0644 \u06a9\u0631\u0646\u0627', 'Rate edit at billing'],
  ['items.view', 'items', 'View products', '\u067e\u0631\u0648\u0688\u06a9\u0679 \u062f\u06cc\u06a9\u06be\u06cc\u06ba', 'Product cards / list'],
  ['items.create', 'items', 'Create product', '\u067e\u0631\u0648\u0688\u06a9\u0679 \u0628\u0646\u0627\u0626\u06cc\u06ba', 'Naya item'],
  ['items.edit', 'items', 'Edit product', '\u067e\u0631\u0648\u0688\u06a9\u0679 \u0645\u06cc\u06ba \u062a\u0631\u0645\u06cc\u0645', 'Name, barcode, category'],
  ['items.delete', 'items', 'Delete / deactivate product', '\u067e\u0631\u0648\u0688\u06a9\u0679 \u062d\u0630\u0641', 'Soft delete'],
  ['items.price.edit', 'items', 'Edit rates & price tiers', '\u0631\u06cc\u0679\u0633 \u0627\u0648\u0631 \u067e\u0631\u0627\u0626\u0633 \u0679\u06cc\u0631', 'Retail / wholesale rates'],
  ['items.import', 'items', 'Import products (CSV/Excel)', '\u067e\u0631\u0648\u0688\u06a9\u0679 \u0627\u0645\u067e\u0648\u0631\u0679', 'Bulk import / price list'],
  ['stock.view', 'items', 'View stock', '\u0627\u0633\u0679\u0627\u06a9 \u062f\u06cc\u06a9\u06be\u06cc\u06ba', 'On-hand per location'],
  ['stock.adjust', 'items', 'Adjust stock', '\u0627\u0633\u0679\u0627\u06a9 \u0627\u06cc\u0688\u062c\u0633\u0679', 'Manual +/- entry'],
  ['stock.transfer', 'items', 'Transfer between locations', '\u0627\u0633\u0679\u0627\u06a9 \u0679\u0631\u0627\u0646\u0633\u0641\u0631', 'SDQ / MCH / RYK'],
  ['stock.audit.post', 'items', 'Post stock audit / count', '\u0627\u0633\u0679\u0627\u06a9 \u0622\u0688\u0679', 'Warehouse counting'],
  ['purchase.view', 'purchase', 'View purchase', '\u062e\u0631\u06cc\u062f\u0627\u0631\u06cc \u062f\u06cc\u06a9\u06be\u06cc\u06ba', 'PO / GRN list'],
  ['purchase.po.create', 'purchase', 'Create purchase order', 'PO \u0628\u0646\u0627\u0626\u06cc\u06ba', 'Supplier order'],
  ['purchase.po.approve', 'purchase', 'Approve purchase order', 'PO \u0645\u0646\u0638\u0648\u0631', 'Approval workflow'],
  ['purchase.grn', 'purchase', 'Receive goods (GRN)', 'GRN (\u0645\u0627\u0644 \u0648\u0635\u0648\u0644\u06cc)', 'Stock inward'],
  ['purchase.return', 'purchase', 'Purchase return', '\u062e\u0631\u06cc\u062f\u0627\u0631\u06cc \u0648\u0627\u067e\u0633\u06cc', 'Return to supplier'],
  ['sales.view', 'sales', 'View own sales', '\u0627\u067e\u0646\u06cc \u0633\u06cc\u0644 \u062f\u06cc\u06a9\u06be\u06cc\u06ba', 'Sirf apni sales'],
  ['sales.view.all', 'sales', 'View all users sales', '\u0633\u0628 \u06a9\u06cc \u0633\u06cc\u0644', 'Puri company sales'],
  ['customers.view', 'sales', 'View customers', '\u06a9\u0633\u0679\u0645\u0631 \u062f\u06cc\u06a9\u06be\u06cc\u06ba', 'Ledger, udhaar'],
  ['customers.edit', 'sales', 'Edit customers', '\u06a9\u0633\u0679\u0645\u0631 \u0645\u06cc\u06ba \u062a\u0631\u0645\u06cc\u0645', 'Credit limit, rates'],
  ['suppliers.view', 'sales', 'View suppliers', '\u0633\u067e\u0644\u0627\u0626\u0631 \u062f\u06cc\u06a9\u06be\u06cc\u06ba', 'Payables'],
  ['suppliers.edit', 'sales', 'Edit suppliers', '\u0633\u067e\u0644\u0627\u0626\u0631 \u0645\u06cc\u06ba \u062a\u0631\u0645\u06cc\u0645', 'Price lists, terms'],
  ['payments.view', 'money', 'View payments', '\u0627\u062f\u0627\u06cc\u06af\u06cc\u0627\u06ba \u062f\u06cc\u06a9\u06be\u06cc\u06ba', 'Receipts / vouchers'],
  ['payments.create', 'money', 'Receive / make payment', '\u0627\u062f\u0627\u06cc\u06af\u06cc \u062f\u0631\u062c \u06a9\u0631\u06cc\u06ba', 'Cash, wallet, bank'],
  ['expenses.create', 'money', 'Record expense', '\u062e\u0631\u0686 \u062f\u0631\u062c \u06a9\u0631\u06cc\u06ba', 'Petty cash / expense'],
  ['expenses.approve', 'money', 'Approve expense', '\u062e\u0631\u0686 \u0645\u0646\u0638\u0648\u0631', 'Expense approval'],
  ['reports.view', 'reports', 'View reports', '\u0631\u067e\u0648\u0631\u0679\u0633 \u062f\u06cc\u06a9\u06be\u06cc\u06ba', 'Standard reports'],
  ['reports.financial', 'reports', 'View financial reports', '\u0645\u0627\u0644\u06cc\u0627\u062a\u06cc \u0631\u067e\u0648\u0631\u0679\u0633', 'P&L, cash flow'],
  ['reports.export', 'reports', 'Export reports', '\u0631\u067e\u0648\u0631\u0679 \u0627\u06cc\u06a9\u0633\u067e\u0648\u0631\u0679', 'PDF / Excel / CSV'],
  ['users.view', 'admin', 'View users', '\u06cc\u0648\u0632\u0631 \u062f\u06cc\u06a9\u06be\u06cc\u06ba', 'Users & Security screen'],
  ['users.manage', 'admin', 'Manage users & permissions', '\u06cc\u0648\u0632\u0631 \u0627\u0648\u0631 \u0627\u062c\u0627\u0632\u062a\u06cc\u06ba', 'Create user, role, matrix'],
  ['settings.view', 'admin', 'View settings', '\u0633\u06cc\u0679\u0646\u06af\u0632 \u062f\u06cc\u06a9\u06be\u06cc\u06ba', 'Read-only settings'],
  ['settings.manage', 'admin', 'Change settings', '\u0633\u06cc\u0679\u0646\u06af\u0632 \u062a\u0628\u062f\u06cc\u0644 \u06a9\u0631\u06cc\u06ba', 'Business settings'],
  ['ai.use', 'admin', 'Use AI assistant', 'AI \u0627\u0633\u0633\u0679\u0646\u0679', 'AI agent over the DB'],
  ['audit.view', 'admin', 'View audit log', '\u0622\u0688\u0679 \u0644\u0627\u06af', 'Kis ne kya kiya']
].map(function (r) { return { id: r[0], group: r[1], en: r[2], ur: r[3], desc: r[4] }; });

const ROLES = ['OWNER', 'MANAGER', 'SALESMAN', 'CASHIER', 'PURCHASE', 'WAREHOUSE', 'ACCOUNTANT', 'DELIVERY', 'OTHER'];

const ROLE_PERMS = {
  OWNER: ['*'],
  MANAGER: ['dashboard.view', 'dashboard.financial', 'pos.access', 'pos.sell', 'pos.return', 'pos.discount', 'pos.hold', 'pos.cash.manage', 'pos.price.override', 'items.view', 'items.create', 'items.edit', 'items.delete', 'items.price.edit', 'items.import', 'stock.view', 'stock.adjust', 'stock.transfer', 'stock.audit.post', 'purchase.view', 'purchase.po.create', 'purchase.po.approve', 'purchase.grn', 'purchase.return', 'sales.view', 'sales.view.all', 'customers.view', 'customers.edit', 'suppliers.view', 'suppliers.edit', 'payments.view', 'payments.create', 'expenses.create', 'expenses.approve', 'reports.view', 'reports.financial', 'reports.export', 'users.view', 'ai.use', 'settings.view', 'settings.manage', 'audit.view',
    'field.cost.view', 'field.margin.view', 'field.contact.view', 'field.finance.view', 'field.supplier.view', 'field.notes.view'],
  SALESMAN: ['dashboard.view', 'pos.access', 'pos.sell', 'pos.hold', 'items.view', 'stock.view', 'customers.view', 'customers.edit', 'sales.view', 'ai.use', 'field.contact.view', 'field.finance.view'],
  CASHIER: ['dashboard.view', 'pos.access', 'pos.sell', 'pos.cash.manage', 'items.view', 'stock.view', 'customers.view', 'payments.view', 'payments.create', 'ai.use', 'field.contact.view', 'field.finance.view'],
  PURCHASE: ['dashboard.view', 'items.view', 'items.create', 'items.edit', 'stock.view', 'stock.adjust', 'purchase.view', 'purchase.po.create', 'purchase.grn', 'purchase.return', 'suppliers.view', 'suppliers.edit', 'reports.view', 'ai.use', 'field.cost.view', 'field.supplier.view', 'field.contact.view'],
  WAREHOUSE: ['dashboard.view', 'items.view', 'stock.view', 'stock.adjust', 'stock.transfer', 'stock.audit.post', 'purchase.grn', 'ai.use', 'field.cost.view', 'field.supplier.view'],
  ACCOUNTANT: ['dashboard.view', 'dashboard.financial', 'sales.view', 'sales.view.all', 'purchase.view', 'payments.view', 'payments.create', 'expenses.create', 'expenses.approve', 'reports.view', 'reports.financial', 'reports.export', 'customers.view', 'suppliers.view', 'ai.use', 'field.cost.view', 'field.margin.view', 'field.contact.view', 'field.finance.view', 'field.supplier.view', 'field.notes.view'],
  DELIVERY: ['dashboard.view', 'sales.view', 'customers.view', 'ai.use', 'field.contact.view'],
  OTHER: ['dashboard.view']
};

/** admin ke overrides (demo mein localStorage, asli app mein Settings sheet) */
function permOverrides() {
  try { return JSON.parse(localStorage.getItem('ha_perm_overrides') || '{}') || {}; }
  catch (e) { return {}; }
}
function savePermOverrides(o) {
  try { localStorage.setItem('ha_perm_overrides', JSON.stringify(o)); } catch (e) { }
}


/* demo line items — PO / GRN detail popup ke liye */
const MOCK_GRN_ITEMS = [
  { id: 'GI1', grnId: 'GRN1', itemId: 'ITM5000', code: 'FL00000', name: 'FLAMINGO DASHBOARD POLISH 450ML', qty: 40, cost: 1500, lineTotal: 60000 },
  { id: 'GI2', grnId: 'GRN1', itemId: 'ITM5001', code: 'FL00001', name: 'FLAMINGO F024E PERFUME DASHBOARD POLISH 220ML', qty: 40, cost: 1500, lineTotal: 60000 }
,
  { id: 'GI3', grnId: 'GRN2', itemId: 'ITM5000', code: 'FL00000', name: 'FLAMINGO DASHBOARD POLISH 450ML', qty: 20, cost: 1350, lineTotal: 27000 }
];
const MOCK_EXPENSES = [
  { id: 'EXP1', voucherNo: 'EXP-SDQ-01001', date: new Date().toISOString().slice(0, 10), category: 'Electricity',
    amount: 8500, paidTo: 'LESCO', method: 'CASH', locationId: 'LOC-SDQ', notes: 'Monthly bill',
    status: 'POSTED', accountId: '', reference: 'LES-9911', taxAmount: 0, attachmentUrl: '' },
  { id: 'EXP2', voucherNo: 'EXP-SDQ-01002', date: new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10),
    category: 'Petty cash', amount: 25000, paidTo: 'Office boy', method: 'CASH', locationId: 'LOC-SDQ',
    notes: 'Karachi trip advance', status: 'PENDING', accountId: '', reference: '', taxAmount: 0, attachmentUrl: '' },
  /* W7 (v2.26.0) — approval queue demo: bulk approve (1 batch call) yahan dikhta hai */
  { id: 'EXP3', voucherNo: 'EXP-SDQ-01003', date: new Date(Date.now() - 864e5).toISOString().slice(0, 10),
    category: 'Freight in', amount: 14800, paidTo: 'Ravi Cargo', method: 'CASH', locationId: 'LOC-SDQ',
    notes: 'PO-1187 freight', status: 'PENDING', accountId: '', reference: 'RC-2291', taxAmount: 0, attachmentUrl: '' },
  { id: 'EXP4', voucherNo: 'EXP-SDQ-01004', date: new Date(Date.now() - 12 * 36e5).toISOString().slice(0, 10),
    category: 'Repair & maintenance', amount: 3200, paidTo: 'Ali Workshop', method: 'CASH', locationId: 'LOC-SDQ',
    notes: 'Polisher repair', status: 'PENDING', accountId: '', reference: '', taxAmount: 0, attachmentUrl: '' }
];

const MOCK_PO_ITEMS = [
  { id: 'PI1', poId: 'PO1', itemId: 'IT1', code: 'FL-1001', name: 'Flamingo Car Mat (Black)', qty: 60, rate: 1500, lineTotal: 90000, receivedQty: 40 },
  { id: 'PI2', poId: 'PO1', itemId: 'IT2', code: 'FL-1002', name: 'Flamingo Steering Cover', qty: 60, rate: 1500, lineTotal: 90000, receivedQty: 0 },
  { id: 'PI3', poId: 'PO2', itemId: 'IT3', code: 'FL-2001', name: 'Bike Side Mirror (Pair)', qty: 60, rate: 1133, lineTotal: 68000, receivedQty: 0 }
];


/* ==========================================================================
   ACCOUNTING — demo data + mini double-entry engine
   (asli backend apps-script/Accounting.gs hai; ye sirf preview ke liye)
   ========================================================================== */
const ACC_DEFS = [
  ['1000', 'Cash in hand', 'ASSET', 'CASH'],
  ['1010', 'Cash — Sadiqabad (SDQ)', 'ASSET', 'CASH'],
  ['1020', 'Cash — Machi Goth (MCH)', 'ASSET', 'CASH'],
  ['1030', 'Cash — RYK', 'ASSET', 'CASH'],
  ['1100', 'Bank — HBL (main)', 'ASSET', 'BANK', 'HBL', '0042-79012345-03'],
  ['1110', 'Bank — Meezan Bank', 'ASSET', 'BANK', 'Meezan', '0210-0109876543-01'],
  ['1120', 'Bank — JazzCash merchant', 'ASSET', 'BANK', 'JazzCash'],
  ['1130', 'Bank — EasyPaisa merchant', 'ASSET', 'BANK', 'EasyPaisa'],
  ['1140', 'Bank — Raast', 'ASSET', 'BANK', 'Raast'],
  ['1200', 'Accounts receivable (udhaar)', 'ASSET', 'AR'],
  ['1300', 'Inventory / stock', 'ASSET', 'INVENTORY'],
  ['1400', 'Advances & deposits', 'ASSET', 'GENERAL'],
  ['1500', 'Furniture & fixtures', 'ASSET', 'GENERAL'],
  ['2000', 'Accounts payable (suppliers)', 'LIABILITY', 'AP'],
  ['2100', 'Tax / GST payable', 'LIABILITY', 'GENERAL'],
  ['2200', 'Loans & borrowings', 'LIABILITY', 'GENERAL'],
  ['3000', 'Owner capital', 'EQUITY', 'CAPITAL'],
  ['3100', 'Retained earnings', 'EQUITY', 'GENERAL'],
  ['4000', 'Sales — retail', 'INCOME', 'REVENUE'],
  ['4100', 'Sales — wholesale', 'INCOME', 'REVENUE'],
  ['4200', 'Discount received / other income', 'INCOME', 'GENERAL'],
  ['5000', 'Purchases (COGS)', 'EXPENSE', 'COGS'],
  ['5100', 'Freight & cartage', 'EXPENSE', 'EXPENSE'],
  ['6000', 'Rent', 'EXPENSE', 'EXPENSE'],
  ['6100', 'Salaries & wages', 'EXPENSE', 'EXPENSE'],
  ['6200', 'Electricity', 'EXPENSE', 'EXPENSE'],
  ['6300', 'Fuel & conveyance', 'EXPENSE', 'EXPENSE'],
  ['6400', 'Repairs & maintenance', 'EXPENSE', 'EXPENSE'],
  ['6500', 'Marketing & advertising', 'EXPENSE', 'EXPENSE'],
  ['6600', 'Petty cash / tea & meals', 'EXPENSE', 'EXPENSE'],
  ['6700', 'Bank charges', 'EXPENSE', 'EXPENSE'],
  ['6900', 'Other expenses', 'EXPENSE', 'EXPENSE']
];

const ACCOUNTS = ACC_DEFS.map(function (a, i) {
  return {
    id: 'ACC' + (i + 1), code: a[0], name: a[1], group: a[2], type: a[3],
    bankName: a[4] || '', accountNo: a[5] || '', branch: '',
    isCash: a[3] === 'CASH' ? 'true' : 'false',
    isBank: a[3] === 'BANK' ? 'true' : 'false',
    normalSide: (a[2] === 'ASSET' || a[2] === 'EXPENSE') ? 'DR' : 'CR',
    openingBalance: 0, active: 'true', notes: '', createdAt: new Date().toISOString()
  };
});
const accByCode = function (c) {
  return ACCOUNTS.filter(function (a) { return a.code === c; })[0];
};
const A = function (c) { const x = accByCode(c); return x ? x.id : ''; };

/* --------------------------- demo vouchers ------------------------------ */
let JOURNALS = [];
let JV_SEQ = 0;
function jv(date, type, narration, lines, refType) {
  JV_SEQ++;
  const id = 'JV' + JV_SEQ;
  let td = 0, tc = 0;
  const ls = lines.map(function (l) {
    const acc = ACCOUNTS.filter(function (a) { return a.id === l[0]; })[0] || {};
    td += l[1]; tc += l[2];
    return { id: id + '-L' + Math.random().toString(36).slice(2, 7), journalId: id, accountId: l[0],
      accountCode: acc.code || '', debit: l[1], credit: l[2], partyType: '', partyId: '',
      narration: l[3] || narration, lineOrder: 0 };
  });
  JOURNALS.push({
    id: id, voucherNo: 'JV-SDQ-' + String(10000 + JV_SEQ), date: date, type: type,
    refType: refType || '', refId: '', locationId: 'LOC-SDQ', narration: narration,
    totalDebit: Math.round(td * 100) / 100, totalCredit: Math.round(tc * 100) / 100,
    status: 'POSTED', createdBy: 'USR1', createdAt: new Date().toISOString()
  });
  JOURNALS[JOURNALS.length - 1].lines = ls;
}
function iso(daysAgo) { return new Date(Date.now() - daysAgo * 864e5).toISOString().slice(0, 10); }

/* opening balances */
jv(iso(78), 'OPENING', 'Opening balances — financial year start', [
  [A('1000'), 145750, 0], [A('1020'), 38200, 0], [A('1100'), 1284500, 0],
  [A('1110'), 412300, 0], [A('1120'), 86400, 0], [A('1130'), 54900, 0],
  [A('1140'), 21000, 0], [A('1200'), 486300, 0],
  [A('2000'), 0, 742800], [A('2100'), 0, 128400],
  [A('3000'), 0, 1000000], [A('3100'), 0, 658150]
]);
/* sales */
jv(iso(6), 'SALE', 'Counter sales — cash + card', [
  [A('1000'), 68400, 0], [A('1100'), 42500, 0], [A('4000'), 0, 110900]
]);
jv(iso(4), 'SALE', 'Wholesale invoice — credit', [
  [A('1200'), 268000, 0], [A('4100'), 0, 268000]
]);
jv(iso(2), 'SALE', 'Wallet + Raast receipts', [
  [A('1120'), 18900, 0], [A('1130'), 24600, 0], [A('1140'), 11250, 0], [A('4000'), 0, 54750]
]);
/* purchases */
jv(iso(9), 'PURCHASE', 'Stock purchase — credit (Flamingo)', [
  [A('5000'), 486000, 0], [A('2000'), 0, 486000]
]);
jv(iso(5), 'PURCHASE', 'Cash purchase — local market', [
  [A('5000'), 96400, 0], [A('1000'), 0, 96400]
]);
jv(iso(3), 'PURCHASE', 'Freight on purchase', [
  [A('5100'), 18500, 0], [A('1000'), 0, 18500]
]);
/* expenses */
jv(iso(20), 'PAYMENT', 'Shop rent — quarterly', [
  [A('6000'), 120000, 0], [A('1100'), 0, 120000]
]);
jv(iso(15), 'PAYMENT', 'Staff salaries', [
  [A('6100'), 185000, 0], [A('1100'), 0, 185000]
]);
jv(iso(12), 'PAYMENT', 'Electricity bill', [
  [A('6200'), 28400, 0], [A('1100'), 0, 28400]
]);
jv(iso(8), 'PAYMENT', 'Fuel & conveyance', [
  [A('6300'), 21600, 0], [A('1000'), 0, 21600]
]);
jv(iso(1), 'PAYMENT', 'Petty cash — tea, packing, misc', [
  [A('6600'), 8400, 0], [A('6900'), 3200, 0], [A('1000'), 0, 11600]
]);
/* receipts & payments */
jv(iso(3), 'RECEIPT', 'Recovery from customer (udhaar)', [
  [A('1100'), 150000, 0], [A('1200'), 0, 150000]
]);
jv(iso(2), 'PAYMENT', 'Paid to supplier', [
  [A('2000'), 220000, 0], [A('1110'), 0, 220000]
]);
jv(iso(10), 'JV', 'Bank charges deducted by bank', [
  [A('6700'), 2450, 0], [A('1100'), 0, 2450]
]);

/* ---------------------------- mini engine -------------------------------- */
const DEMO_STOCK_VALUE = 1640000;

function accBalance(id, upto) {
  let bal = 0;
  const acc = ACCOUNTS.filter(function (a) { return a.id === id; })[0];
  if (acc) bal += Number(acc.openingBalance) || 0;
  JOURNALS.forEach(function (j) {
    if (j.status === 'VOID') return;
    if (upto && j.date > upto) return;
    (j.lines || []).forEach(function (l) {
      if (l.accountId !== id) return;
      bal += Number(l.debit) || 0;
      bal -= Number(l.credit) || 0;
    });
  });
  return Math.round(bal * 100) / 100;
}
function decorate(acc) {
  const bal = accBalance(acc.id);
  return {
    id: acc.id, code: acc.code, name: acc.name, group: acc.group, type: acc.type,
    bankName: acc.bankName, accountNo: acc.accountNo,
    isCash: acc.isCash === 'true', isBank: acc.isBank === 'true',
    normalSide: acc.normalSide, openingBalance: Number(acc.openingBalance) || 0,
    ledgerBalance: bal, displayBalance: acc.normalSide === 'CR' ? -bal : bal, active: true
  };
}
function journalRow(j) {
  const dr = [], cr = [];
  (j.lines || []).forEach(function (l) {
    const a = ACCOUNTS.filter(function (x) { return x.id === l.accountId; })[0] || { name: '' };
    if (l.debit > 0) dr.push(a.name);
    if (l.credit > 0) cr.push(a.name);
  });
  return {
    id: j.id, voucherNo: j.voucherNo, date: j.date, type: j.type, refType: j.refType,
    refId: j.refId, narration: j.narration, totalDebit: j.totalDebit, totalCredit: j.totalCredit,
    status: j.status, locationId: j.locationId,
    debitAccounts: dr.join(', '), creditAccounts: cr.join(', ')
  };
}
function bookFor(accounts, p, fallbackName) {
  p = p || {};
  let opening = 0;
  const rows = [];
  accounts.forEach(function (a) {
    const led = mockLedger(a.id, p.from, p.to);
    opening += led.opening;
    led.rows.forEach(function (r) { rows.push(Object.assign({}, r, { accountName: a.name, accountCode: a.code })); });
  });
  rows.sort(function (x, y) { return x.date < y.date ? -1 : 1; });
  const dr = rows.reduce(function (a, r) { return a + r.debit; }, 0);
  const cr = rows.reduce(function (a, r) { return a + r.credit; }, 0);
  return { from: p.from || '', to: p.to || '',
    accountName: accounts.length === 1 ? accounts[0].name : fallbackName,
    opening: Math.round(opening * 100) / 100,
    receipts: Math.round(dr * 100) / 100, payments: Math.round(cr * 100) / 100,
    closing: Math.round((opening + dr - cr) * 100) / 100, rows: rows };
}
function mockLedger(accountId, from, to) {
  let opening = 0;
  const acc = ACCOUNTS.filter(function (a) { return a.id === accountId; })[0];
  if (acc) opening += Number(acc.openingBalance) || 0;
  const rows = [];
  JOURNALS.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).forEach(function (j) {
    if (j.status === 'VOID') return;
    (j.lines || []).forEach(function (l) {
      if (l.accountId !== accountId) return;
      if (from && j.date < from) { opening += (Number(l.debit) || 0) - (Number(l.credit) || 0); return; }
      if (to && j.date > to) return;
      rows.push({ id: l.id, journalId: j.id, voucherNo: j.voucherNo, date: j.date, type: j.type,
        narration: l.narration || j.narration, refType: j.refType, refId: j.refId,
        debit: Number(l.debit) || 0, credit: Number(l.credit) || 0, balance: 0 });
    });
  });
  let bal = opening;
  rows.forEach(function (r) { bal += r.debit - r.credit; r.balance = Math.round(bal * 100) / 100; });
  const td = rows.reduce(function (a, r) { return a + r.debit; }, 0);
  const tc = rows.reduce(function (a, r) { return a + r.credit; }, 0);
  return { account: decorate(acc || {}), from: from || '', to: to || '',
    opening: Math.round(opening * 100) / 100, closing: Math.round(bal * 100) / 100,
    totalDebit: Math.round(td * 100) / 100, totalCredit: Math.round(tc * 100) / 100, rows: rows };
}

let BANK_RECON = [
  { id: 'BR1', bankAccountId: A('1100'), date: iso(2), reference: 'Online transfer in', amount: 125000, direction: 'IN', cleared: 'true', clearedDate: iso(2), journalId: '', statementRef: 'STMT-1', note: '' },
  { id: 'BR2', bankAccountId: A('1100'), date: iso(1), reference: 'ATM withdrawal', amount: 40000, direction: 'OUT', cleared: 'false', clearedDate: '', journalId: '', statementRef: 'STMT-2', note: '' },
  { id: 'BR3', bankAccountId: A('1100'), date: iso(1), reference: 'Bank charges', amount: 2450, direction: 'OUT', cleared: 'true', clearedDate: iso(1), journalId: '', statementRef: 'STMT-3', note: 'Monthly fee' }
];

/* v2.5: wallet gateway demo state */
const WALLET_TXNS = [];
let WALLET_SEQ = 1000;
const WALLET_PROVIDERS = [
  { id: 'EASYPAISA', label: 'EasyPaisa', icon: '\uD83D\uDFE2', methodId: 'EASYPAISA', flows: ['MA', 'OTC'],
    mode: 'SANDBOX', enabled: true, sandbox: true, hasCredentials: true, ready: true,
    base: 'https://easypaystg.easypaisa.com.pk/easypay-service/rest/v4',
    receiverMobile: '03001234567', maxAmount: 0, tokenMinutes: 30 },
  { id: 'JAZZCASH', label: 'JazzCash', icon: '\uD83D\uDFE3', methodId: 'JAZZCASH', flows: ['MWALLET', 'OTC'],
    mode: 'SANDBOX', enabled: true, sandbox: true, hasCredentials: true, ready: true,
    base: 'https://sandbox.jazzcash.com.pk',
    receiverMobile: '03007654321', maxAmount: 0, tokenMinutes: 30 }
];

/* v2.5: warehouse count sheets demo state */
const COUNT_SHEETS = [];
let COUNT_SEQ = 0, COUNTLINE_SEQ = 0;

/* v2.5: order book demo state */
const ORDERS = [];
let ORDER_SEQ = 0;

const USERS = [
  { id: 'USR1', username: 'owner', fullName: 'Haseeb (Owner)', role: 'OWNER', locationIds: 'LOC-SDQ,LOC-MCH,LOC-RYK', active: 'true', lastLogin: new Date().toISOString(), commissionRate: 0, discountLimit: 100 },
  { id: 'USR2', username: 'manager', fullName: 'Shop Manager', role: 'MANAGER', locationIds: 'LOC-SDQ,LOC-MCH,LOC-RYK', active: 'true', lastLogin: new Date(Date.now() - 3600e3).toISOString(), commissionRate: 0.5, discountLimit: 10 },
  { id: 'USR3', username: 'sales1', fullName: 'Salesman One', role: 'SALESMAN', locationIds: 'LOC-SDQ', active: 'true', lastLogin: new Date(Date.now() - 7200e3).toISOString(), commissionRate: 1, discountLimit: 2 },
  { id: 'USR4', username: 'purchase', fullName: 'Purchase Officer', role: 'PURCHASE', locationIds: 'LOC-SDQ,LOC-RYK', active: 'true', lastLogin: '', commissionRate: 0, discountLimit: 0 },
  { id: 'USR5', username: 'warehouse', fullName: 'Warehouse Incharge', role: 'WAREHOUSE', locationIds: 'LOC-SDQ,LOC-MCH,LOC-RYK', active: 'true', lastLogin: '', commissionRate: 0, discountLimit: 0 },
  { id: 'USR6', username: 'accountant', fullName: 'Accountant', role: 'ACCOUNTANT', locationIds: 'LOC-SDQ,LOC-MCH,LOC-RYK', active: 'true', lastLogin: '', commissionRate: 0, discountLimit: 0 },
  { id: 'USR7', username: 'cashier', fullName: 'Cashier', role: 'CASHIER', locationIds: 'LOC-SDQ', active: 'true', lastLogin: '', commissionRate: 0, discountLimit: 1 },
  { id: 'USR8', username: 'delivery', fullName: 'Delivery Boy', role: 'DELIVERY', locationIds: 'LOC-SDQ', active: 'true', lastLogin: '', commissionRate: 0, discountLimit: 0 }
];
const GROUPS = [
  { id: 'GRP-OWNER', name: 'Owners', type: 'Admin', permissions: '*', saleReturnLimit: '0', dataViewLimit: '0', comments: '', active: 'true' },
  { id: 'GRP-MGR', name: 'Shop Managers', type: 'Shop', permissions: '', saleReturnLimit: '100000', dataViewLimit: '365', comments: '', active: 'true' },
  { id: 'GRP-SAL', name: 'Sales Shops', type: 'Shop', permissions: '', saleReturnLimit: '5000', dataViewLimit: '30', comments: '', active: 'true' },
  { id: 'GRP-WH', name: 'Warehouse', type: 'Shop', permissions: '', saleReturnLimit: '0', dataViewLimit: '90', comments: '', active: 'true' }
];

const SESSION = {
  userId: 'USR1', username: 'owner', fullName: 'Haseeb (Owner)', role: 'OWNER', groupId: 'GRP-OWNER',
  groupName: 'Owners', permissions: ['*'], saleReturnLimit: 99999999, discountLimit: 100,
  commissionRate: 0, locations: LOCATIONS, locationIds: LOCATIONS.map(l => l.id),
  defaultLocationId: 'LOC-SDQ',
  /* v2.1: per-user preferences (language yahin save hoti hai) */
  prefs: { lang: 'en' }
};

/* ----------------------------- mock helpers ------------------------------ */
const norm = s => String(s || '').toLowerCase().replace(/[\s\-_\/\\.#]/g, '');
const money = v => Math.round(Number(v || 0) * 100) / 100;
function inRange(d, from, to) {
  const x = new Date(d);
  if (from && x < new Date(from)) return false;
  if (to && x > new Date(to + 'T23:59:59')) return false;
  return true;
}
function filterSales(p) {
  return SALES.filter(s => (!p.locationId || s.locationId === p.locationId) &&
    (!p.status || s.status === p.status) &&
    (!p.q || norm(s.invoiceNo + s.customerName).includes(norm(p.q))) &&
    inRange(s.date, p.from, p.to));
}
function decorate(it) {
  return Object.assign({}, it, { stock: it.stock });
}

/* --------------------------- v2 mock collections -------------------------- */
const CATEGORIES = [
  { id: 'CAT-1', code: 'CAR-CARE', name: 'Car Care', active: 'true' },
  { id: 'CAT-2', code: 'LIGHTS', name: 'Lights', active: 'true' },
  { id: 'CAT-3', code: 'BRAKES', name: 'Brakes', active: 'true' },
  { id: 'CAT-4', code: 'OIL', name: 'Oil & Lubricants', active: 'true' },
  { id: 'CAT-5', code: 'DECOR', name: 'Decoration', active: 'true' }
];
const BRANDS = ['Flamingo', 'Philips', 'NKM', 'Shell', 'Exide', 'Bosch']
  .map((b, i) => ({ id: 'BRD-' + (i + 1), code: b.toUpperCase().slice(0, 5), name: b, active: 'true' }));
const UNITS = [
  { id: 'UNT-1', code: 'PCS', name: 'Piece', baseUnit: 'PCS', conversion: '1', active: 'true' },
  { id: 'UNT-2', code: 'BOX', name: 'Box', baseUnit: 'PCS', conversion: '12', active: 'true' },
  { id: 'UNT-3', code: 'LTR', name: 'Litre', baseUnit: 'LTR', conversion: '1', active: 'true' }
];
const TAXES = [{ id: 'TAX-1', code: 'STD', name: 'Standard 17%', rate: '17', type: 'PCT', active: 'true' }];
const WAREHOUSES = LOCATIONS.map((l, i) => ({ id: 'WH-' + l.code, code: l.code + '-MAIN',
  name: l.name + ' Main Store', locationId: l.id, isDefault: i === 0 ? 'true' : 'false', active: 'true' }));
const BINS = [];
WAREHOUSES.forEach(w => ['A', 'B', 'C'].forEach((rack, ri) => {
  for (let s = 1; s <= 4; s++) BINS.push({ id: 'BIN-' + w.code + '-' + rack + s, code: rack + '-0' + s,
    name: w.name + ' Rack ' + rack + ' Shelf ' + s, warehouseId: w.id, rack: rack, shelf: String(s),
    capacity: '100', active: 'true' });
}));
const CUSTOM_FIELDS = [
  { id: 'CF1', entity: 'ITEM', key: 'cf_shelf_life', label: 'Shelf life (months)', type: 'NUMBER',
    options: '', defaultValue: '', required: 'false', showInTable: 'false', showInForm: 'true',
    showInPos: 'false', tab: 'Extra', sortOrder: '1', active: 'true' },
  { id: 'CF2', entity: 'CUSTOMER', key: 'cf_vehicle', label: 'Vehicle (model/plate)', type: 'TEXT',
    options: '', defaultValue: '', required: 'false', showInTable: 'true', showInForm: 'true',
    showInPos: 'false', tab: 'Extra', sortOrder: '1', active: 'true' }
];
const TEMPLATES = [
  { id: 'TPL1', type: 'RECEIPT', name: 'Thermal 80mm', active: 'true',
    json: JSON.stringify({ showLogo: true, showBarcode: true, footer: 'Shukriya! Phir aayein.', paperWidth: '80mm' }) },
  { id: 'TPL2', type: 'LABEL', name: 'Standard 50x30', active: 'true',
    json: JSON.stringify({ width: 50, height: 30, showPrice: true, showName: true, showBarcode: true, barcodeType: 'CODE128' }) }
];
const MENU_CONFIG = [
  { id: 'm_main', label: 'Main', icon: '', parentId: '', route: '', perm: '', sortOrder: 1, active: 'true' },
  { id: 'm_dash', label: 'Dashboard', icon: '📊', parentId: 'm_main', route: 'dashboard', perm: 'dashboard.view', sortOrder: 1, active: 'true' },
  { id: 'm_pos', label: 'Point of Sale', icon: '🧾', parentId: 'm_main', route: 'pos', perm: 'pos.access', sortOrder: 2, active: 'true' },
  { id: 'm_ins', label: 'Dashboards', icon: '📈', parentId: 'm_main', route: 'insights', perm: 'reports.view', sortOrder: 3, active: 'true' },
  { id: 'm_shop', label: 'Shop Open/Close', icon: '🏪', parentId: 'm_main', route: 'shop', perm: 'pos.access', sortOrder: 4, active: 'true' },
  { id: 'm_stock', label: 'Catalog & Stock', icon: '', parentId: '', route: '', perm: '', sortOrder: 2, active: 'true' },
  { id: 'm_items', label: 'Items', icon: '📦', parentId: 'm_stock', route: 'items', perm: 'items.view', sortOrder: 1, active: 'true' },
  { id: 'm_inv', label: 'Inventory', icon: '🏬', parentId: 'm_stock', route: 'inventory', perm: 'stock.view', sortOrder: 2, active: 'true' },
  { id: 'm_wh', label: 'Warehouse', icon: '🏗', parentId: 'm_stock', route: 'warehouse', perm: 'stock.view', sortOrder: 3, active: 'true' }
];
const NOTIFICATIONS = [];
/** v2.1: per-user translation overrides (scope = user:<id>) + job run stamps */
const USER_TRANSLATIONS = {};
const LAST_JOB_RUN = {};

const PORDERS = [];
/* v2.24.2 — purchase returns (real backend Purchase.gs ke route naam se) */
const _GRN_LINES = {};   /* v2.30.4 (W13/T13.2) — demo GRN lines (price signals) */
  const PRETURNS = [
  { id: 'PRT1', returnNo: 'PRET-SDQ-01001', date: new Date(Date.now() - 9 * 864e5).toISOString().slice(0, 10),
    grnId: 'GRN1', supplierId: SUPPLIERS[0].id, locationId: 'LOC-SDQ', total: 4200,
    reason: 'Damaged in transit', status: 'POSTED' }
];
function pushNotif(type, title, body, severity) {
  const key = type + ':' + body;
  if (NOTIFICATIONS.some(n => n.type + ':' + n.body === key)) return;
  NOTIFICATIONS.push({ id: 'NTF' + NOTIFICATIONS.length + 1, ts: new Date().toISOString(), type: type,
    title: title, body: body, link: '', userId: '', readAt: '', severity: severity || 'info', locationId: 'LOC-SDQ' });
}
/* Demo shop session — realistic open day taake Shop screen poori nazar aaye */
let SESSION_HISTORY = [
  { id: 'SES0', sessionNo: 'SES-SDQ-00041', openedAt: new Date(Date.now() - 30 * 3600e3).toISOString(),
    closedAt: new Date(Date.now() - 22 * 3600e3).toISOString(), status: 'CLOSED',
    openingCash: 4000, expectedCash: 74850, closingCash: 74800, variance: -50, userId: 'USR7' },
  { id: 'SES00', sessionNo: 'SES-SDQ-00040', openedAt: new Date(Date.now() - 54 * 3600e3).toISOString(),
    closedAt: new Date(Date.now() - 46 * 3600e3).toISOString(), status: 'CLOSED',
    openingCash: 4000, expectedCash: 61200, closingCash: 61200, variance: 0, userId: 'USR7' }
];
/* v2.30.5 (user-report) — SETTINGS persistence (demo): wizardSave ke baad reload
   par bhi setup.wizardDone qayam rahe (warna wizard/banner har reload par wapas). */
try { const _SOV = JSON.parse(localStorage.getItem('ha_mock_set_ov') || '{}');
  Object.keys(_SOV).forEach(k => { SETTINGS[k] = _SOV[k]; }); } catch (e) { }
function mockPersistSettings() {
  try { localStorage.setItem('ha_mock_set_ov', JSON.stringify(SETTINGS)); } catch (e) { }
}
/* v2.30.5 (user-report) — demo shop-state EK jagah: shop.* (window.__demoSessionOpen)
   aur cash.* (CASH_SESSION) ko sync rakhta hai — pehle pill OPEN keh raha tha aur
   banner CLOSED (do alag sources) isi liye. */
function demoShopSync() {
  if (window.__demoSessionOpen) {
    const ses = window.__demoSessionOpen;
    if (!CASH_SESSION || CASH_SESSION.status !== 'OPEN') {
      CASH_SESSION = { id: ses.id || 'SES1', sessionNo: ses.sessionNo || 'SES-SDQ-00042', locationId: 'LOC-SDQ',
        openedAt: ses.openedAt || new Date().toISOString(), openingCash: Number(ses.openingCash) || 0,
        status: 'OPEN', notes: '',
        totals: { cashIn: 0, cashOut: 0, expenses: 0, card: 0, netCash: 0, txns: 0 } };
      CASH_SESSION.expectedCash = CASH_SESSION.openingCash;
    }
  } else if (CASH_SESSION && CASH_SESSION.status === 'OPEN') {
    CASH_SESSION.status = 'CLOSED';
    CASH_SESSION.closedAt = new Date().toISOString();
  }
  return CASH_SESSION;
}
let CASH_SESSION = {
  id: 'SES1', sessionNo: 'SES-SDQ-00042', locationId: 'LOC-SDQ',
  openedAt: new Date(Date.now() - 5.4 * 3600e3).toISOString(),
  openingCash: 5000, status: 'OPEN', notes: '',
  totals: { cashIn: 84500, cashOut: 1500, expenses: 3200, card: 22000, netCash: 79800, txns: 34 }
};
CASH_SESSION.expectedCash = CASH_SESSION.openingCash + CASH_SESSION.totals.netCash;
let CASH_MOVES = [
  { id: 'PMV1', date: new Date(Date.now() - 3.2 * 3600e3).toISOString(), type: 'CASH_IN',
    amount: 2000, reason: 'Change from bank', sessionId: 'SES1' },
  { id: 'PMV2', date: new Date(Date.now() - 1.6 * 3600e3).toISOString(), type: 'CASH_OUT',
    amount: 3500, reason: 'Safe drop (bank deposit)', sessionId: 'SES1' }
];
const TRANSLATIONS = {
  'nav.dashboard': { en: 'Dashboard', roman: 'Dashboard', ur: 'ڈیش بورڈ', scope: 'UI' },
  'nav.pos': { en: 'Point of Sale', roman: 'Bill banaayein', ur: 'بل بنائیں', scope: 'UI' },
  'nav.items': { en: 'Items', roman: 'Items', ur: 'آئٹمز', scope: 'UI' },
  'nav.inventory': { en: 'Inventory', roman: 'Stock', ur: 'اسٹاک', scope: 'UI' },
  'nav.warehouse': { en: 'Warehouse', roman: 'Godam', ur: 'گودام', scope: 'UI' },
  'nav.purchase': { en: 'Purchase', roman: 'Khareed', ur: 'خرید', scope: 'UI' },
  'nav.reorder': { en: 'Auto Reorder', roman: 'Auto reorder', ur: 'آٹو ری آرڈر', scope: 'UI' },
  'nav.parties': { en: 'Customers & Suppliers', roman: 'Customers & Suppliers', ur: 'کسٹمرز اور سپلائرز', scope: 'UI' },
  'nav.reports': { en: 'Reports', roman: 'Reports', ur: 'رپورٹس', scope: 'UI' },
  'nav.insights': { en: 'Dashboards', roman: 'Dashboards', ur: 'ڈیش بورڈز', scope: 'UI' },
  'nav.shop': { en: 'Shop Open/Close', roman: 'Shop open/close', ur: 'دکان کھولنا/بند', scope: 'UI' },
  'nav.settings': { en: 'Settings', roman: 'Settings', ur: 'سیٹنگز', scope: 'UI' },
  'btn.save': { en: 'Save', roman: 'Save karein', ur: 'محفوظ کریں', scope: 'UI' },
  'btn.cancel': { en: 'Cancel', roman: 'Cancel', ur: 'منسوخ', scope: 'UI' },
  'btn.close': { en: 'Close', roman: 'Band karein', ur: 'بند کریں', scope: 'UI' },
  'btn.add': { en: 'Add', roman: 'Add karein', ur: 'شامل کریں', scope: 'UI' },
  'btn.edit': { en: 'Edit', roman: 'Edit karein', ur: 'تبدیل کریں', scope: 'UI' },
  'btn.delete': { en: 'Delete', roman: 'Delete karein', ur: 'حذف کریں', scope: 'UI' },
  'btn.refresh': { en: 'Refresh', roman: 'Refresh', ur: 'تازہ کریں', scope: 'UI' },
  'btn.search': { en: 'Search', roman: 'Dhoondain', ur: 'تلاش کریں', scope: 'UI' },
  'pos.total': { en: 'TOTAL', roman: 'TOTAL', ur: 'ٹوٹل', scope: 'UI' },
  'pos.subtotal': { en: 'Subtotal', roman: 'Sub total', ur: 'سب ٹوٹل', scope: 'UI' },
  'pos.discount': { en: 'Discount', roman: 'Discount', ur: 'ڈسکاؤنٹ', scope: 'UI' },
  'pos.customer': { en: 'Customer', roman: 'Customer', ur: 'کسٹمر', scope: 'UI' },
  'pos.walkin': { en: 'Walk-in Customer', roman: 'Walk-in customer', ur: 'عام گاہک', scope: 'UI' },
  'msg.saved': { en: 'Saved', roman: 'Save ho gaya', ur: 'محفوظ ہو گیا', scope: 'UI' },
  'msg.noData': { en: 'No data found', roman: 'Koi data nahi mila', ur: 'کوئی ڈیٹا نہیں ملا', scope: 'UI' }
};

/* ============================================================================
   v2.30.5 (user mandate #1, P0) — CONFIG SNAPSHOT: settings + saari config
   collections (fields/menu/templates/lists/translations/prefs) localStorage
   me — Reload/navigation/re-open par bhi toggles aur saves qayam (pehle sirf
   session me the → "revert to OFF"). Transactional data (orders/sales/items)
   jaan-boojh kar session-scope hai — asli persistence GAS/Sheet par.
   ========================================================================== */
const MOCK_CFG_KEY = 'ha_mock_cfg';
function mockPersistConfig() {
  mockPersistSettings();
  try {
    localStorage.setItem(MOCK_CFG_KEY, JSON.stringify({
      categories: CATEGORIES, brands: BRANDS, units: UNITS, taxes: TAXES,
      warehouses: WAREHOUSES, fields: CUSTOM_FIELDS, templates: TEMPLATES,
      menu: MENU_CONFIG, translations: TRANSLATIONS,
      prefs: (typeof SESSION !== 'undefined' && SESSION && SESSION.prefs) || {}
    }));
  } catch (e) { }
}
(function mockRestoreConfig() {
  try {
    const d = JSON.parse(localStorage.getItem(MOCK_CFG_KEY) || 'null');
    if (!d) return;
    const ra = (t, src) => { if (Array.isArray(src)) { t.length = 0; src.forEach(x => t.push(x)); } };
    ra(CATEGORIES, d.categories); ra(BRANDS, d.brands); ra(UNITS, d.units);
    ra(TAXES, d.taxes); ra(WAREHOUSES, d.warehouses); ra(CUSTOM_FIELDS, d.fields);
    ra(TEMPLATES, d.templates); ra(MENU_CONFIG, d.menu);
    if (d.translations) Object.keys(d.translations).forEach(k => { TRANSLATIONS[k] = d.translations[k]; });
    if (typeof SESSION !== 'undefined' && SESSION && d.prefs) SESSION.prefs = Object.assign({}, d.prefs);
  } catch (e) { }
})();
try { window.mockPersistConfig = mockPersistConfig; } catch (e) { }
pushNotif('LOW_STOCK', 'Low stock alert', 'Kuch items reorder level par hain', 'WARN');
pushNotif('RECEIVABLE', 'Udhaar baqaya', 'Customers se recovery pending hai', 'INFO');

/* Settings schema (Settings screen is generated from this) */
/* REAL schema (apps-script/Config.gs → Config.defs()) build time par inject hota hai —
   neeche wala fallback sirf tab chalta hai jab build step skip ho. */
const CONFIG_DEFS_DEMO = (typeof window !== 'undefined' && window.CONFIG_DEFS_DEMO) || [
  { id: 'business', label: 'Business', icon: '🏪', sub: [
    { id: 'identity', label: 'Identity', icon: '🏷', fields: [
      { key: 'biz.name', label: 'Business name', type: 'text', def: 'Haseeb Autos' },
      { key: 'biz.nameUr', label: 'Urdu name', type: 'text', def: 'حسیب آٹوز' },
      { key: 'biz.phone', label: 'Phone', type: 'text' },
      { key: 'biz.address', label: 'Address', type: 'textarea' },
      { key: 'biz.ntn', label: 'NTN', type: 'text' }
    ]},
    { id: 'money', label: 'Money & format', icon: '💱', fields: [
      { key: 'biz.currency', label: 'Currency', type: 'text', def: 'PKR' },
      { key: 'biz.currencySymbol', label: 'Symbol', type: 'text', def: 'Rs' },
      { key: 'biz.decimals', label: 'Decimals', type: 'number', def: 2 },
      { key: 'biz.roundingMode', label: 'Rounding', type: 'select', options: ['NONE', 'NEAREST_1', 'NEAREST_10', 'UP_10', 'DOWN_1'], def: 'NONE' },
      { key: 'biz.dateFormat', label: 'Date format', type: 'text', def: 'dd/MM/yyyy' }
    ]}
  ]},
  { id: 'pos', label: 'POS', icon: '🧾', sub: [
    { id: 'layout', label: 'Layout & cards', icon: '🗂', fields: [
      { key: 'pos.defaultView', label: 'Default view', type: 'select', options: ['all', 'categories', 'favorites'], def: 'all' },
      { key: 'pos.cardsPerRow', label: 'Cards per row', type: 'number', def: 4 },
      { key: 'pos.showImageOnCard', label: 'Show image on card', type: 'switch', def: true },
      { key: 'pos.showStockOnCard', label: 'Show stock badge', type: 'switch', def: true },
      { key: 'pos.allowDirectQty', label: 'Ask quantity on tap', type: 'switch', def: true }
    ]},
    { id: 'billing', label: 'Billing', icon: '💰', fields: [
      { key: 'pos.allowCreditSale', label: 'Allow udhaar sale', type: 'switch', def: true },
      { key: 'pos.quickKeys', label: 'Keyboard shortcuts', type: 'switch', def: true },
      { key: 'pos.quickCashButtons', label: 'Quick cash buttons', type: 'text', def: '500,1000,2000,5000' },
      { key: 'pos.scanSound', label: 'Beep on scan', type: 'switch', def: true }
    ]}
  ]},
  { id: 'inventory', label: 'Inventory', icon: '🏬', sub: [
    { id: 'stock', label: 'Stock rules', icon: '📦', fields: [
      { key: 'inventory.allowNegativeStock', label: 'Allow negative stock', type: 'switch', def: false },
      { key: 'inventory.lowStockThreshold', label: 'Low stock at', type: 'number', def: 5 },
      { key: 'inventory.costingMethod', label: 'Costing method', type: 'select', options: ['AVG', 'FIFO'], def: 'AVG' }
    ]},
    { id: 'warehouse', label: 'Warehouse & lots', icon: '🏗', fields: [
      { key: 'inventory.trackBins', label: 'Bin / rack tracking', type: 'switch', def: true },
      { key: 'inventory.trackLots', label: 'Lot tracking', type: 'switch', def: false },
      { key: 'inventory.trackSerial', label: 'Serial tracking', type: 'switch', def: false },
      { key: 'inventory.expiryAlertDays', label: 'Expiry alert (days)', type: 'number', def: 30 }
    ]}
  ]},
  { id: 'trade', label: 'Trade', icon: '💱', sub: [
    { id: 'pricing', label: 'Pricing & discount', icon: '🏷', fields: [
      { key: 'trade.enableWholesale', label: 'Wholesale pricing', type: 'switch', def: true },
      { key: 'trade.maxDiscountPct', label: 'Max discount %', type: 'number', def: 30 }
    ]},
    { id: 'loyalty', label: 'Loyalty', icon: '🎁', fields: [
      { key: 'trade.enableLoyalty', label: 'Loyalty points', type: 'switch', def: true },
      { key: 'trade.loyaltyPerAmount', label: '1 point per (amount)', type: 'number', def: 1000 }
    ]}
  ]},
  { id: 'modules', label: 'Modules', icon: '🧩', sub: [
    { id: 'modules', label: 'Enable / disable', icon: '🔌', fields: [
      { key: 'mod.pos', label: 'POS', type: 'switch', def: true },
      { key: 'mod.purchase', label: 'Purchase', type: 'switch', def: true },
      { key: 'mod.inventory', label: 'Inventory', type: 'switch', def: true },
      { key: 'mod.warehouse', label: 'Warehouse', type: 'switch', def: true },
      { key: 'mod.accounts', label: 'Accounts', type: 'switch', def: true },
      { key: 'mod.ai', label: 'AI assistant', type: 'switch', def: true }
    ]}
  ]},
  { id: 'automation', label: 'Automation', icon: '⚡', sub: [
    { id: 'auto', label: 'Automation', icon: '🤖', fields: [
      { key: 'auto.alerts', label: 'Auto alerts', type: 'switch', def: true },
      { key: 'auto.reorder', label: 'Auto reorder', type: 'switch', def: false },
      { key: 'auto.backup', label: 'Daily backup', type: 'switch', def: false }
    ]}
  ]},
  { id: 'security', label: 'Security', icon: '🔒', sub: [
    { id: 'access', label: 'Access', icon: '🔑', fields: [
      { key: 'sec.sessionTimeout', label: 'Session timeout (min)', type: 'number', def: 480 },
      { key: 'sec.forceStrongPass', label: 'Strong password', type: 'switch', def: true },
      { key: 'sec.allowOffline', label: 'Offline mode', type: 'switch', def: true }
    ]},
    { id: 'look', label: 'Theme', icon: '🎨', fields: [
      { key: 'theme.primary', label: 'Primary colour', type: 'color', def: '#ff6a00' },
      { key: 'theme.accent', label: 'Accent colour', type: 'color', def: '#2f7fed' },
      { key: 'theme.mode', label: 'Mode', type: 'select', options: ['auto', 'light', 'dark'], def: 'auto' },
      { key: 'theme.density', label: 'Density', type: 'select', options: ['comfortable', 'compact'], def: 'comfortable' },
      { key: 'theme.fontSize', label: 'Font size', type: 'select', options: ['small', 'medium', 'large', 'xl'], def: 'medium' }
    ]}
  ]}
];

/* v2.7 — day reports store (§7 shop open/close) */
var DAY_REPORTS = [];

/* ------------------------------- MockAPI --------------------------------- */
/* ======================= DEMO DATA (model names) ==========================
 * Ye SIRF demo / offline preview ke liye seed data hai. Production Apps Script
 * code (apps-script/*.gs|html) mein koi model name hardcode nahi hai — wahan
 * catalog Settings (ai.modelCatalog.*) aur provider ki live discovery se aata
 * hai. Is list ko UI se "Refresh models" ya Settings se badla ja sakta hai.
 * ========================================================================= */
const DEMO_MODEL_CATALOG = {
  GEMINI: [
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', status: 'stable', free: true, note: 'Latest — recommended' },
    { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash', status: 'stable', free: false, note: 'Coding / agents' },
    { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', status: 'stable', free: true, note: 'Balanced' },
    { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', status: 'stable', free: true, note: 'Fast, free tier' },
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', status: 'stable', free: true, note: 'Cheapest' },
    { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite', status: 'stable', free: true, note: 'Free tier' },
    { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (preview)', status: 'preview', free: false, note: 'Deep reasoning' },
    { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (preview)', status: 'preview', free: true, note: 'Free tier' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', status: 'legacy', free: true, note: 'Shutdown 16 Oct 2026' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', status: 'legacy', free: true, note: 'Shutdown 16 Oct 2026' },
    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', status: 'legacy', free: true, note: 'Shutdown 16 Oct 2026' },
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', status: 'deprecated', free: false, note: 'RETIRED 1 Jun 2026' },
    { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash-Lite', status: 'deprecated', free: false, note: 'RETIRED 1 Jun 2026' }
  ],
  OPENAI: [
    { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', status: 'stable', free: false, note: 'Flagship' },
    { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', status: 'stable', free: false, note: 'Balanced' },
    { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', status: 'stable', free: false, note: 'Fastest / cheapest' },
    { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini', status: 'stable', free: false, note: '' },
    { id: 'gpt-4.1', label: 'GPT-4.1', status: 'stable', free: false, note: 'Still supported' },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', status: 'stable', free: false, note: 'Still supported' },
    { id: 'gpt-5-2025-08-07', label: 'GPT-5 (snapshot)', status: 'legacy', free: false, note: 'Shutdown 11 Dec 2026' },
    { id: 'gpt-4o', label: 'GPT-4o', status: 'deprecated', free: false, note: 'RETIRED Feb 2026' },
    { id: 'gpt-4o-mini', label: 'GPT-4o mini', status: 'deprecated', free: false, note: 'Superseded' },
    { id: 'o4-mini', label: 'o4-mini', status: 'deprecated', free: false, note: 'RETIRED Feb 2026' }
  ],
  OPENROUTER: [
    { id: 'google/gemini-3.5-flash', label: 'Gemini 3.5 Flash (OR)', status: 'stable', free: true, note: '' },
    { id: 'openai/gpt-5.6-terra', label: 'GPT-5.6 Terra (OR)', status: 'stable', free: false, note: '' },
    { id: 'meta-llama/llama-4-maverick', label: 'Llama 4 Maverick', status: 'stable', free: true, note: '' },
    { id: 'qwen/qwen3-235b-a22b', label: 'Qwen3 235B', status: 'stable', free: true, note: '' }
  ],
  MOCK: [{ id: 'mock-1', label: 'Mock (offline, no key)', status: 'stable', free: true, note: '' }]
};
/* Settings override → discovery cache → demo seed data */
function demoCatalog(provider) {
  const p = String(provider || 'GEMINI').toUpperCase();
  const tryJSON = v => { try { const j = JSON.parse(v); return (j && j.length) ? j : null; } catch (e) { return null; } };
  return tryJSON(SETTINGS['ai.modelCatalog.' + p]) || tryJSON(SETTINGS['ai.modelCache.' + p]) ||
    (DEMO_MODEL_CATALOG[p] || []);
}
function demoRecommended(provider) {
  const pinned = String(SETTINGS['ai.defaultModel.' + provider] || '');
  if (pinned) return pinned;
  const list = demoCatalog(provider);
  if (!list.length) return '';
  const ver = id => { const m = String(id).match(/(\d+(?:\.\d+)*)/); if (!m) return 0;
    const q = m[1].split('.').map(Number); return (q[0] || 0) * 1000 + (q[1] || 0) * 10 + (q[2] || 0) * 0.1; };
  const score = m => { let sc = 0;
    if (m.status === 'stable' || m.status === 'live') sc += 100;
    if (m.status === 'preview') sc += 20;
    if (m.status === 'deprecated' || m.status === 'legacy') sc -= 500;
    if (String(SETTINGS.aiPreferFree) !== 'false' && m.free) sc += 60;
    return sc * 100000 + ver(m.id); };
  return list.slice().sort((a, b) => score(b) - score(a))[0].id;
}

/* ── v2.10 — AI Agent demo backend: server AI.gs ka faithful mirror ─────────
   Keyless MOCK provider poori chat chalata hai (asli demo data se jawab);
   key/vars save karna persist karta hai (SETTINGS store) — live jaisa. ── */
let DEMO_AI_KEY = '';
const DEMO_AI_THREADS = [];
const DEMO_AI_TOOLS_META = {
  search_items: { risk: 'READ', group: 'Inventory' },
  get_item_stock: { risk: 'READ', group: 'Inventory' },
  low_stock_list: { risk: 'READ', group: 'Inventory' },
  inventory_valuation: { risk: 'READ', group: 'Inventory' },
  reorder_suggestions: { risk: 'READ', group: 'Inventory' },
  today_sales: { risk: 'READ', group: 'Sales' },
  sales_summary: { risk: 'READ', group: 'Sales' },
  top_selling_items: { risk: 'READ', group: 'Sales' },
  recent_sales: { risk: 'READ', group: 'Sales' },
  profit_report: { risk: 'READ', group: 'Reports' },
  cash_position: { risk: 'READ', group: 'Reports' },
  customer_balance: { risk: 'READ', group: 'Parties' },
  receivables: { risk: 'READ', group: 'Parties' },
  supplier_payables: { risk: 'READ', group: 'Parties' },
  pending_purchase_orders: { risk: 'READ', group: 'Purchase' },
  draft_sale: { risk: 'WRITE', group: 'Actions' },
  draft_purchase_order: { risk: 'WRITE', group: 'Actions' }
};
const DEMO_AI_DEFAULTS = {
  aiEnabled: 'true', aiProvider: 'GEMINI', aiModel: '', aiEndpoint: '',
  aiTemperature: '0.2', aiMaxTokens: '2048', aiLanguage: 'AUTO', aiStyle: 'SHORT',
  aiPersona: '', aiCanWrite: 'false', aiRequireApproval: 'true', aiAutoSuggest: 'true',
  aiFallbackMock: 'true', aiRedact: 'false', aiHistoryTurns: '8',
  aiRateLimitPerDay: '200', aiRateLimitPerUser: '40', aiDataScope: 'ALL',
  aiApiModeGemini: 'AUTO', aiApiModeOpenai: 'AUTO'
};
const DEMO_AI_PROVIDERS = ['GEMINI', 'OPENAI', 'OPENROUTER', 'OLLAMA', 'MOCK'];
const DEMO_AI_KEYS = {};
const DEMO_AI_PROFILES = {};
function demoAiProfiles() {
  return DEMO_AI_PROVIDERS.reduce((a,id)=>{
    const key=DEMO_AI_KEYS[id] || '', saved=DEMO_AI_PROFILES[id] || {};
    a[id]=Object.assign({provider:id,model:demoRecommended(id),endpoint:'',enabled:true,
      configured:id==='MOCK' || !!key,hasKey:!!key,keyHint:key ? key.slice(0,4)+'…'+key.slice(-3) : '',lastTest:null},saved);
    return a;
  },{});
}
function demoAiCfg() {
  const provider = String(SETTINGS.aiProvider || DEMO_AI_DEFAULTS.aiProvider).toUpperCase();
  DEMO_AI_KEY = DEMO_AI_KEYS[provider] || '';
  const needsKey = (provider === 'GEMINI' || provider === 'OPENAI' || provider === 'OPENROUTER') && !DEMO_AI_KEY;
  const mockFallback = String(SETTINGS.aiFallbackMock) !== 'false';
  return {
    enabled: String(SETTINGS.aiEnabled) !== 'false',
    provider: provider,
    model: String(SETTINGS.aiModel || '') || demoRecommended(provider),
    hasKey: !!DEMO_AI_KEY, needsKey: needsKey, mockFallback: mockFallback,
    credentials: DEMO_AI_PROVIDERS.reduce((a,p) => { const k = DEMO_AI_KEYS[p] || ''; a[p] = {hasKey:!!k, keyHint:k ? k.slice(0,4)+'…'+k.slice(-3) : ''};return a; }, {}),
    usable: !needsKey || mockFallback || provider === 'MOCK',
    canWrite: String(SETTINGS.aiCanWrite) === 'true',
    endpoint: String(SETTINGS.aiEndpoint || ''),
    keyHint: DEMO_AI_KEY ? DEMO_AI_KEY.slice(0, 4) + '…' + DEMO_AI_KEY.slice(-3) : ''
  };
}
function demoAiMoney(v) { return 'Rs ' + Math.round(Number(v) || 0).toLocaleString('en-PK'); }
/* Chat brain: sawal → asli demo data → tay jawab (server _mock ka mirror) */
function demoAiChat(text) {
  const q = String(text || '').toLowerCase();
  const has = (...ks) => ks.some(k => q.indexOf(k) > -1);
  const today = new Date().toISOString().slice(0, 10);
  if (has('aaj ki sale', 'aj ki sale', 'today sale', 'aaj ka')) {
    const rows = SALES.filter(s => String(s.date).slice(0, 10) === today);
    const tot = rows.reduce((a, s) => a + Number(s.total || 0), 0);
    const due = rows.reduce((a, s) => a + Number(s.due || 0), 0);
    return 'Aaj ki sale: ' + demoAiMoney(tot) + ' (' + rows.length + ' bills), cash ' +
      demoAiMoney(tot - due) + ', udhaar ' + demoAiMoney(due) + '.';
  }
  if (has('low stock', 'kam stock', 'reorder', 'out of stock')) {
    const low = ITEMS.filter(i => Number(i.stock) <= Number(i.reorderLevel || 0)).slice(0, 5);
    return low.length + ' item low stock par hain:\n' +
      low.map((i, ix) => (ix + 1) + '. ' + i.name + ' — stock ' + i.stock + ' (level ' + (i.reorderLevel || 0) + ')').join('\n');
  }
  if (has('udhaar', 'receivable', 'wasooli', 'kaun dega')) {
    const due = CUSTOMERS.filter(c => Number(c.balance) > 0).sort((a, b) => b.balance - a.balance);
    const tot = due.reduce((a, c) => a + Number(c.balance), 0);
    return 'Kul udhaar: ' + demoAiMoney(tot) + '\n' +
      due.slice(0, 5).map((c, ix) => (ix + 1) + '. ' + c.name + ' — ' + demoAiMoney(c.balance)).join('\n');
  }
  if (has('inventory value', 'stock value', 'godam')) {
    const tot = ITEMS.reduce((a, i) => a + Number(i.stock || 0) * Number(i.costPrice || 0), 0);
    return 'Inventory kul qeemat (cost par): ' + demoAiMoney(tot);
  }
  if (has('profit', 'munafa', 'margin')) {
    const rows = SALES.filter(s => String(s.date).slice(0, 10) >= new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));
    const rev = rows.reduce((a, s) => a + Number(s.total || 0), 0);
    const cost = rows.reduce((a, s) => a + Number(s.cost || 0), 0);
    return 'Pichle 30 din: sale ' + demoAiMoney(rev) + ', gross profit ' + demoAiMoney(rev - cost) +
      (rev ? ' (' + Math.round((rev - cost) / rev * 1000) / 10 + '%)' : '') + '.';
  }
  if (has('top selling', 'zyada bika', 'best seller')) {
    const agg = {};
    SALE_ITEMS.forEach(li => { agg[li.name] = (agg[li.name] || 0) + Number(li.qty || 0); });
    const top = Object.keys(agg).map(k => ({ name: k, qty: agg[k] })).sort((a, b) => b.qty - a.qty).slice(0, 5);
    return 'Top sellers:\n' + top.map((t, ix) => (ix + 1) + '. ' + t.name + ' × ' + t.qty).join('\n');
  }
  if (has('search', 'dhoond', 'khoj')) {
    const w = q.replace(/.*?(search|dhoond|khoj)\s*/i, '').trim();
    const hits = ITEMS.filter(i => w && String(i.name + ' ' + i.code).toLowerCase().indexOf(w) > -1).slice(0, 5);
    return hits.length ? 'Items mile:\n' + hits.map((i, ix) =>
      (ix + 1) + '. ' + i.name + ' (' + i.code + ') — stock ' + i.stock + ', retail ' + demoAiMoney(i.retailPrice)).join('\n')
      : 'Koi item nahi mila: "' + w + '"';
  }
  return 'Main (Mock mode) aapke demo business data par tools chala kar jawab deta hoon. Aazmaayein:\n' +
    '• "aaj ki sale"\n• "low stock"\n• "udhaar kitni hai"\n• "inventory value"\n• "profit"\n• "top selling"\n' +
    'Live LLM ke liye Setup mein Gemini/OpenAI/OpenRouter/Ollama connect karein.';
}

window.MockAPI = {
  /* ── v2.10 — AI Agent actions (faithful demo mirror of AI.gs) ── */
  'ai.providers': () => [
    { id: 'GEMINI', label: 'Google Gemini', tagline: 'Free tier · naya Interactions API', needsKey: true,
      keyUrl: 'https://aistudio.google.com/apikey', keyHelp: 'Google account se login → Create API key → copy karein.',
      modelSource: 'live (models list) + fallback',
      apiModes: [{ id: 'AUTO', label: 'Auto — Interactions try, purana fallback' },
        { id: 'INTERACTIONS', label: 'Interactions API (naya — recommended)' },
        { id: 'GENERATE_CONTENT', label: 'generateContent (legacy compatible)' }],
      caps: { tools: true, freeTier: true, serverState: true, structured: true } },
    { id: 'OPENAI', label: 'OpenAI', tagline: 'Responses API · ChatGPT wale models', needsKey: true,
      keyUrl: 'https://platform.openai.com/api-keys', keyHelp: 'platform.openai.com → API keys → Create new secret key.',
      modelSource: 'live (models list) + fallback',
      apiModes: [{ id: 'AUTO', label: 'Auto — Responses try, chat fallback' },
        { id: 'RESPONSES', label: 'Responses API (naya — recommended)' },
        { id: 'CHAT', label: 'Chat Completions (legacy compatible)' }],
      caps: { tools: true, serverState: true, structured: true } },
    { id: 'OPENROUTER', label: 'OpenRouter', tagline: 'Ek key, saikron models — free options bhi', needsKey: true,
      keyUrl: 'https://openrouter.ai/keys', keyHelp: 'openrouter.ai → Keys → Create. Free models :free naam ke sath hote hain.',
      modelSource: 'live (public list — key ke bagair bhi)',
      apiModes: [{ id: 'CHAT', label: 'Chat Completions (OpenAI-compatible)' }],
      caps: { tools: true, freeModels: true, structured: true } },
    { id: 'OLLAMA', label: 'Local / Ollama', tagline: 'Apne model server par — via Apps Script', needsKey: false, endpointRequired: true,
      endpointHelp: 'URL jo Google servers se reach ho sake (https://…). Ghar ka localhost seedha nahi chalta — tunnel lagayein, ya pehle Gemini/OpenRouter try karein.',
      modelSource: 'live (server /api/tags)',
      apiModes: [{ id: 'NATIVE', label: 'Native /api/chat' }],
      caps: { tools: true, private: true } },
    /* v2.30.0 (N7) — asli adapter (AI_Adapters.gs MOCK) ka mirror: wahi naam,
       tagline, caps + honest can/cannot. Demo production se alag nahi ho sakta. */
    { id: 'MOCK', label: 'Local Data Assistant',
      tagline: 'Bina internet · bina LLM — rule-based jawab aap ke LIVE data par', needsKey: false,
      help: 'Koi internet, koi API key, koi LLM nahi. Ye app ka apna local rules engine hai: sawal ka matlab pehchan kar aap ke ASLI business data par tools chalata hai (sale, stock, udhaar, reports, expense).',
      modelSource: 'built-in',
      apiModes: [{ id: 'MOCK', label: 'Built-in local rules engine' }],
      caps: { tools: true, offline: true, llm: false },
      can: [
        'Aaj / is mahine ki sale, profit, top items',
        'Low stock, reorder suggestions, stock value',
        'Customer / supplier udhaar aur ledger ka khulasa',
        'Expense, cash aur shop-day reports ka khulasa',
        'Aap ke pooche gaye periods ka hisaab (rules se)'
      ],
      cannot: [
        'Internet ka general knowledge, khabrein, mausam',
        'Nayi creative likhai (shayari, kahani, tasveer)',
        'Aap ke data se bahar ka jawab ya raye',
        'Khud se seekhna — koi training / koi hidden LLM nahi'
      ] }
  ],
  'ai.config': () => demoAiCfg(),
  'ai.suggest': () => ['Aaj ki sale kitni hui?', 'Low stock items batao', 'Top 5 selling parts is month', 'Kon se customer ka udhaar sab se zyada hai?', 'Inventory value kitni hai?', 'Is month ka profit report'],
  'ai.agentConfig': () => {
    const cfg = demoAiCfg();
    const get = k => (SETTINGS[k] !== undefined && SETTINGS[k] !== '' ? SETTINGS[k] : DEMO_AI_DEFAULTS[k]);
    const off = {};
    String(SETTINGS.aiTools || '').split(',').forEach(t => { t = String(t).trim(); if (t.charAt(0) === '-') off[t.slice(1)] = true; });
    const tools = Object.keys(DEMO_AI_TOOLS_META).map(n => ({
      name: n, description: n.replace(/_/g, ' '),
      risk: DEMO_AI_TOOLS_META[n].risk, group: DEMO_AI_TOOLS_META[n].group, enabled: !off[n]
    }));
    const allModels = {};
    DEMO_AI_PROVIDERS.forEach(p => { allModels[p] = demoCatalog(p); });
    return Object.assign({}, cfg, {
      profiles:demoAiProfiles(), routing:{primary:cfg.provider,enabled:SETTINGS.aiFailoverEnabled!=='false',order:String(SETTINGS.aiFallbackOrder || 'GEMINI,OPENAI,OPENROUTER,OLLAMA').split(',')},
      values: Object.keys(DEMO_AI_DEFAULTS).reduce((a, k) => { a[k] = get(k); return a; }, {}),
      tools: tools, models: demoCatalog(cfg.provider), allModels: allModels,
      modelMeta: (demoCatalog(cfg.provider).filter(mm => mm.id === cfg.model)[0] ||
        { id: cfg.model, label: cfg.model, status: 'custom', free: false, note: 'Custom / manually entered' }),
      recommendedModel: demoRecommended(cfg.provider),
      recommendedByProvider: DEMO_AI_PROVIDERS.reduce((a, p) => { a[p] = demoRecommended(p); return a; }, {}),
      modelSources: DEMO_AI_PROVIDERS.reduce((a, p) => {
        a[p] = SETTINGS['ai.modelCatalog.' + p] ? 'settings' : (SETTINGS['ai.modelCache.' + p] ? 'discovered' : 'demo'); return a; }, {}),
      preferFree: String(SETTINGS.aiPreferFree) !== 'false',
      presets: MockAPI['ai.presets']({}),
      locations: LOCATIONS.map(l => ({ id: l.id, name: l.name })),
      usage: { threads: DEMO_AI_THREADS.length,
        messages: DEMO_AI_THREADS.reduce((a, t) => a + t.messages.length, 0),
        today: DEMO_AI_THREADS.reduce((a, t) => a + t.messages.filter(x => String(x.ts).slice(0, 10) === new Date().toISOString().slice(0, 10)).length, 0),
        limit: Number(get('aiRateLimitPerDay')) },
      limits: { temperature: [0, 1], maxTokens: [256, 8192] }
    });
  },
  'ai.presets': () => [
    { id: 'balanced', name: 'Balanced (default)', desc: 'Read-only data answers + draft actions, Roman Urdu, short.',
      values: { aiCanWrite: 'true', aiRequireApproval: 'true', aiTemperature: '0.2', aiStyle: 'SHORT', aiLanguage: 'AUTO', aiMaxTokens: '2048', aiHistoryTurns: '8', aiAutoSuggest: 'true' } },
    { id: 'analyst', name: 'Read-only analyst', desc: 'Sirf data parh sakta hai — koi write/draft nahi.',
      values: { aiCanWrite: 'false', aiRequireApproval: 'true', aiTemperature: '0.1', aiStyle: 'DETAILED', aiMaxTokens: '3072', aiHistoryTurns: '12', aiAutoSuggest: 'true' } },
    { id: 'ops', name: 'Ops assistant', desc: 'Purchase/reorder focused — drafts banata hai, post nahi karta.',
      values: { aiCanWrite: 'true', aiRequireApproval: 'true', aiTemperature: '0.2', aiStyle: 'SHORT', aiMaxTokens: '2048', aiHistoryTurns: '10', aiAutoSuggest: 'true' } },
    { id: 'cashier', name: 'Roman-Urdu cashier', desc: 'Bahut chhote jawab, sirf rozana ki baat.',
      values: { aiCanWrite: 'false', aiRequireApproval: 'true', aiTemperature: '0.3', aiStyle: 'TINY', aiLanguage: 'ROMAN_URDU', aiMaxTokens: '1024', aiHistoryTurns: '5', aiAutoSuggest: 'true' } },
    { id: 'auditor', name: 'Night auditor', desc: 'Detailed, English, discrepancies aur anomalies.',
      values: { aiCanWrite: 'false', aiRequireApproval: 'true', aiTemperature: '0', aiStyle: 'DETAILED', aiLanguage: 'ENGLISH', aiMaxTokens: '4096', aiHistoryTurns: '16', aiAutoSuggest: 'false' } }
  ],
  'ai.autoConfigure': p => {
    const provider=p.provider, cloud=['GEMINI','OPENAI','OPENROUTER'].includes(provider);
    if(cloud && !p.key && !DEMO_AI_KEYS[provider])return {ok:false,message:'Demo: enter a test key to simulate setup.'};
    if(provider==='OLLAMA' && !/^https:\/\//.test(p.endpoint || ''))return {ok:false,message:'Enter a reachable HTTPS server URL.'};
    if(p.key)DEMO_AI_KEYS[provider]=String(p.key).slice(0,4)+'-DEMO-MASK-'+String(p.key).slice(-3);
    const model=demoRecommended(provider), test={ok:true,at:new Date().toISOString(),message:'DEMO SIMULATION — not a live provider test.',ms:0};
    DEMO_AI_PROFILES[provider]={provider,model,endpoint:p.endpoint || '',enabled:true,configured:true,lastTest:test};
    return {ok:true,saved:true,provider,model,message:test.message,config:MockAPI['ai.agentConfig']({})};
  },
  'ai.routing.save': p => {
    SETTINGS.aiProvider=p.primary;SETTINGS.aiModel=demoAiProfiles()[p.primary].model;
    SETTINGS.aiEndpoint=demoAiProfiles()[p.primary].endpoint;
    SETTINGS.aiFallbackOrder=p.order.join(',');SETTINGS.aiFailoverEnabled=String(p.enabled);
    return MockAPI['ai.agentConfig']({});
  },
  'ai.agentConfig.save': p => {
    const v = Object.assign({},p.values || {});
    if(p.provider){
      DEMO_AI_PROFILES[p.provider]=Object.assign({},demoAiProfiles()[p.provider],{model:v.aiModel,endpoint:v.aiEndpoint,lastTest:null});
      delete v.aiProvider;
      if(p.provider!==(SETTINGS.aiProvider || DEMO_AI_DEFAULTS.aiProvider)){delete v.aiModel;delete v.aiEndpoint;}
    }
    Object.keys(v).forEach(k => { if (DEMO_AI_DEFAULTS[k] !== undefined || k === 'aiTools') SETTINGS[k] = String(v[k]); });
    if (p.tools) SETTINGS.aiTools = p.tools.filter(t => t.enabled === false).map(t => '-' + t.name).join(',');
    if (p.key !== undefined && p.key !== null && p.key !== '') {
      DEMO_AI_KEY = String(p.key);
      DEMO_AI_KEYS[p.provider || v.aiProvider || SETTINGS.aiProvider || 'GEMINI'] = DEMO_AI_KEY;
      if(p.provider && DEMO_AI_PROFILES[p.provider])DEMO_AI_PROFILES[p.provider].configured=true;
      if (v.aiProvider) SETTINGS.aiProvider = v.aiProvider;
      if (v.aiModel) SETTINGS.aiModel = v.aiModel;
    }
    return MockAPI['ai.agentConfig']({});
  },
  'ai.setKey': p => {
    DEMO_AI_KEY = String(p.key || '');
    DEMO_AI_KEYS[p.provider || SETTINGS.aiProvider || 'GEMINI'] = DEMO_AI_KEY;
    if (p.provider) SETTINGS.aiProvider = String(p.provider).toUpperCase();
    if (p.model) SETTINGS.aiModel = p.model;
    return MockAPI['ai.config']({});
  },
  'ai.test': p => {
    const provider = String((p && p.provider) || SETTINGS.aiProvider || 'GEMINI').toUpperCase();
    if (provider === 'MOCK') return { ok: true, provider: provider, model: 'mock-1', ms: 6,
      message: 'Mock agent tayyar — sawal poochein.', sample: demoAiChat('aaj ki sale').split('\n')[0].slice(0, 80) };
    if (!DEMO_AI_KEY) {
      if (String(SETTINGS.aiFallbackMock) !== 'false')
        return { ok: true, provider: 'MOCK', model: 'mock-1', ms: 5, fallback: true,
          message: 'Key nahi — Mock fallback dry-run pass. Key daalein to live call hoga.' };
      return { ok: false, provider: provider, ms: 1, message: 'API key set nahi hai — Setup mein daalein ya Mock chunein.' };
    }
    const am = (provider === 'GEMINI' ? String(SETTINGS.aiApiModeGemini || 'AUTO') : provider === 'OPENAI' ? String(SETTINGS.aiApiModeOpenai || 'AUTO') : 'AUTO') || 'AUTO';
    const eff = am === 'AUTO' ? (provider === 'GEMINI' ? 'INTERACTIONS' : provider === 'OPENAI' ? 'RESPONSES' : 'CHAT') : am;
    return { ok: true, provider: provider, model: (p && p.model) || demoRecommended(provider), ms: 42,
      keyCheck: '✓ demo transport — key format theek (' + String(DEMO_AI_KEY).slice(0, 4) + '…)',
      apiMode: eff, message: 'Connected · 42 ms (demo) · ✓ key check · reply: OK', sample: 'OK' };
  },
  'ai.chat': p => {
    const cfg = demoAiCfg();
    if (!cfg.enabled) throw new Error('AI assistant band hai. AI Agent ▸ Setup mein "AI enabled" on karein.');
    if (cfg.needsKey && !cfg.mockFallback)
      return { reply: 'AI abhi keyless hai aur fallback bhi band hai. Setup tab mein key daalein ya "Mock fallback" on karein.', toolResults: [], needsKey: true };
    const msg = String((p && p.message) || '').slice(0, 4000);
    const reply = demoAiChat(msg);
    const id = (p && p.threadId) || 'THR' + Date.now();
    let t = DEMO_AI_THREADS.find(x => x.id === id);
    if (!t) { t = { id: id, title: msg.slice(0, 40) || 'Chat', userId: 'demo', createdAt: new Date().toISOString(), messages: [] }; DEMO_AI_THREADS.unshift(t); }
    t.messages.push({ role: 'user', content: msg.slice(0, 1000), ts: new Date().toISOString() });
    t.messages.push({ role: 'assistant', content: reply, ts: new Date().toISOString() });
    t.messages = t.messages.slice(-40);
    t.updatedAt = new Date().toISOString();
    return { reply: reply, toolResults: [], config: { provider: 'MOCK', model: 'mock-1' }, threadId: id };
  },
  'ai.threads': () => DEMO_AI_THREADS.slice(0, 20).map(t => ({ id: t.id, title: t.title, updatedAt: t.updatedAt })).reverse(),
  'ai.clear': () => { DEMO_AI_THREADS.length = 0; return true; },
  'ai.usage': () => MockAPI['ai.agentConfig']({}).usage,
  'ai.tools': () => MockAPI['ai.agentConfig']({}).tools,
  'ai.models': () => {
    const provider = String(SETTINGS.aiProvider || 'GEMINI').toUpperCase();
    const cat = {};
    DEMO_AI_PROVIDERS.forEach(pp => { cat[pp] = demoCatalog(pp); });
    return { provider: provider, catalog: cat, models: cat[provider] || [],
      recommended: demoRecommended(provider), preferFree: String(SETTINGS.aiPreferFree) !== 'false',
      deprecated: (cat[provider] || []).filter(mm => mm.status === 'deprecated' || mm.status === 'legacy').map(mm => mm.id),
      sources: DEMO_AI_PROVIDERS.reduce((a, pp) => {
        a[pp] = SETTINGS['ai.modelCatalog.' + pp] ? 'settings' : (SETTINGS['ai.modelCache.' + pp] ? 'discovered' : 'demo'); return a; }, {}) };
  },
  'ai.models.refresh': p => {
    const provider = String((p && p.provider) || SETTINGS.aiProvider || 'GEMINI').toUpperCase();
    return { provider: provider, source: 'catalog', models: demoCatalog(provider),
      note: 'Demo transport — live app mein provider ki asli model list aati hai.' };
  },


  'system.ping': () => ({ pong: true, provider: 'demo' }),
  'system.health': () => ({ status: 'ok', rows: { Items: ITEMS.length, Sales: SALES.length } }),
  'system.bootstrap': () => ({
    settings: SETTINGS, locations: LOCATIONS, user: SESSION, customerTypes: TYPES,
    /* v2.10 — AI drawer/panel ko boot par hi config chahiye (live server bhi yahi karta hai) */
    aiConfig: demoAiCfg(), suggestions: MockAPI['ai.suggest']({}),
    counts: { items: ITEMS.length, customers: CUSTOMERS.length, suppliers: SUPPLIERS.length }
  }),
  'system.settings.get': () => SETTINGS,
  /* v2.30.0 — demo mein bhi shop rules UI asli ki tarah chale */
  'shop.status': () => ({ open: !!(window.__demoSessionOpen), requireOpen: true, locationName: 'Sadiqabad City',
    seeded: { items: (window.ITEMS || []).length, users: 9, customers: 2, settings: 61 }, demo: true,
    session: window.__demoSessionOpen || null }),
  'shop.open': p => { window.__demoSessionOpen = { id: 'SES-DEMO-1', sessionNo: 'CS-SDQ-DEMO', openingCash: Number((p || {}).openingCash || 0), openedAt: new Date().toISOString() };
    return { session: window.__demoSessionOpen, autoPrint: false,
      report: { id: 'DRP-DEMO-1', reportNo: 'DRP-SDQ-DEMO', kind: 'OPEN', date: new Date().toISOString().slice(0, 10), locationId: 'LOC-SDQ', userId: 'USR-1',
        summary: { openingCash: Number((p || {}).openingCash || 0), cashSales: 0, creditSales: 0, refunds: 0, netSales: 0, expenseTotal: 0, invoices: 0, sessionNo: 'CS-SDQ-DEMO' } },
      share: 'SHOP OPEN REPORT' };
  },
  'shop.close': p => { const ses = window.__demoSessionOpen || { id: 'SES-DEMO-1', sessionNo: 'CS-SDQ-DEMO', openingCash: 0 };
    window.__demoSessionOpen = null;
    return { session: Object.assign({}, ses, { status: 'CLOSED', closedAt: new Date().toISOString() }), autoPrint: false,
      report: { id: 'DRP-DEMO-2', reportNo: 'DRP-SDQ-DEMO2', kind: 'CLOSE', date: new Date().toISOString().slice(0, 10), locationId: 'LOC-SDQ', userId: 'USR-1',
        summary: { openingCash: Number(ses.openingCash || 0), expectedCash: 0, closingCash: Number((p || {}).closingCash || 0), variance: 0, cashSales: 0, creditSales: 0, refunds: 0, netSales: 0, expenseTotal: 0, invoices: 0, sessionNo: ses.sessionNo } },
      share: 'SHOP CLOSE REPORT' };
  },
  'system.setupStatus': () => ({ version: 'demo',
    needsWizard: String(SETTINGS['setup.wizardDone']) !== 'true' && String(SETTINGS['setup.wizardSkipped']) !== 'true',
    steps: { business: true, admin: true, shopOpen: !!window.__demoSessionOpen, demo: true,
      skipped: String(SETTINGS['setup.wizardSkipped']) === 'true', done: String(SETTINGS['setup.wizardDone']) === 'true' },
    seeded: { users: 9, items: (window.ITEMS || []).length, customers: 2, suppliers: 1, settings: 61, locations: 3, sales: 0, stock: 0 },
    shop: { open: !!window.__demoSessionOpen }, demoVisible: String(SETTINGS['data.showDemo']) !== 'false',
    businessName: SETTINGS.businessName, shopName: '', message: 'demo' }),
  'system.wizardSave': p => { const v = (p || {}); if (v['businessName']) SETTINGS.businessName = v['businessName'];
    if (v['shop.name']) SETTINGS['shop.name'] = v['shop.name']; if (v.demoDecision) SETTINGS['data.showDemo'] = String(v.demoDecision) !== 'false' ? 'true' : 'false';
    if (v.done) SETTINGS['setup.wizardDone'] = 'true';
    if (v.skipped) SETTINGS['setup.wizardSkipped'] = 'true';
    if (v.reset) { SETTINGS['setup.wizardDone'] = ''; SETTINGS['setup.wizardSkipped'] = ''; }
    mockPersistSettings();
    return { saved: Object.keys(v) }; },
  'system.wizardAdminPassword': p => ({ ok: true, username: 'owner' }),
  'admin.demoStats': () => ({ visible: String(SETTINGS['data.showDemo']) !== 'false',
    counts: { Items: 10, Customers: 2, Suppliers: 1, Stock: 30, Sales: 0, Users: 1 }, total: 44 }),
  'admin.removeDemoData': () => ({ removed: { Items: 10, Customers: 2, Suppliers: 1, Stock: 30, Sales: 0, Users: 1 },
    message: 'Demo data hata diya gaya (demo).' }),
  'setup.diag': () => ({ version: 'demo', linked: true, problems: [], counts: { Users: 10, Items: 25, Customers: 7, Sales: 12 }, shop: { open: !!window.__demoSessionOpen } }),
  'system.settings.save': p => { Object.assign(SETTINGS, p.values || {}); mockPersistSettings();
    return { saved: Object.keys(p.values || {}).length }; },

  'auth.login': p => {
    if (!p.username || !p.password) throw new Error('Username aur password zaroori hain.');
    return { token: 'demo-token-' + Date.now(), session: Object.assign({}, SESSION, { username: p.username }) };
  },
  'auth.logout': () => true,
  'auth.me': () => SESSION,
  'auth.changePassword': () => true,

  'fields.matrix': function () {
    const FAMILIES = [
      { key: 'cost', label: 'Cost price / lagat', perm: 'field.cost.view' },
      { key: 'margin', label: 'Margin / profit', perm: 'field.margin.view' },
      { key: 'contact', label: 'Customer contact', perm: 'field.contact.view' },
      { key: 'finance', label: 'Financial internals', perm: 'field.finance.view' },
      { key: 'supplier', label: 'Supplier internals', perm: 'field.supplier.view' },
      { key: 'notes', label: 'Internal notes', perm: 'field.notes.view' }
    ];
    const ov = permOverrides();
    const matrix = {};
    ROLES.forEach(function (r) {
      const perms = (ov[r] || ROLE_PERMS[r] || []);
      matrix[r] = {};
      FAMILIES.forEach(function (f) { matrix[r][f.key] = perms.indexOf('*') > -1 || perms.indexOf(f.perm) > -1; });
    });
    return { families: FAMILIES, roles: ROLES, matrix: matrix };
  },
  'users.perms': function () {
    const ov = permOverrides();
    const matrix = {};
    ROLES.forEach(function (r) { matrix[r] = (ov[r] || ROLE_PERMS[r] || []).slice(); });
    return {
      groups: PERM_GROUPS, catalog: PERM_CATALOG, roles: ROLES,
      matrix: matrix, defaults: ROLE_PERMS,
      overridden: Object.keys(ov), locked: ['OWNER']
    };
  },
  'users.perms.save': function (p) {
    p = p || {};
    const role = String(p.role || '').toUpperCase();
    if (ROLES.indexOf(role) < 0) throw new Error('Role ghalat hai: ' + role);
    if (role === 'OWNER') throw new Error('Owner ke sab permissions hamesha ON rehte hain.');
    const ov = permOverrides();
    ov[role] = (p.permissions || []).filter(Boolean);
    savePermOverrides(ov);
    return MockAPI['users.perms']({});
  },
  'users.perms.reset': function (p) {
    const role = String((p && p.role) || '').toUpperCase();
    const ov = permOverrides();
    delete ov[role];
    savePermOverrides(ov);
    return MockAPI['users.perms']({});
  },
    'users.list': () => USERS,
  'users.groups.list': () => GROUPS,
  'users.groups.save': p => p.group || p,
  'users.create': p => { const u = Object.assign({ id: 'USR' + Date.now(),
      extraPermissions: '', deniedPermissions: '' }, p.user || p); USERS.unshift(u); return u; },
  /* v2.5: per-user rules (allow / deny) bhi save hon — demo mein memory + localStorage */
  'users.update': function (p) {
    const patch = p.patch || {};
    const u = USERS.filter(x => x.id === p.id)[0];
    if (u) Object.assign(u, patch);
    return Object.assign({ id: p.id }, patch);
  },
  'users.matrix': () => ({ roles: ['OWNER', 'MANAGER'], rolePermissions: {} }),

  'locations.list': () => LOCATIONS,

  'items.list': p => {
    let rows = ITEMS.filter(i => {
      if (p.q && !norm(i.code + i.name + i.brand + i.category + i.model + i.barcode).includes(norm(p.q))) return false;
      if (p.category && i.category !== p.category) return false;
      if (p.brand && i.brand !== p.brand) return false;
      if (p.lowStockOnly && i.stock > (i.reorderLevel || i.minStock)) return false;
      return true;
    }).map(decorate);
    const page = p.page || 1, size = p.pageSize || 100;
    return { rows: rows.slice((page - 1) * size, page * size), total: rows.length, page, pages: Math.ceil(rows.length / size) || 1 };
  },
  'items.search': p => {
    const q = norm(p.q || '');
    return ITEMS.filter(i => norm(i.code + i.name + i.brand + i.category + i.model + i.barcode).includes(q))
      .slice(0, p.limit || 24).map(decorate);
  },
  'items.get': p => decorate(ITEMS.find(i => i.id === p.id) || ITEMS[0]),
  'items.save': p => {
    const it = p.item || p;
    if (it.id) { const f = ITEMS.find(i => i.id === it.id); Object.assign(f, it, { updatedAt: new Date().toISOString() }); return f; }
    const n = Object.assign({ id: 'ITM' + Date.now(), status: 'ACTIVE', stock: 0,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, it);
    ITEMS.push(n); return n;
  },
  'items.delete': p => { const i = ITEMS.findIndex(x => x.id === p.id); if (i > -1) ITEMS.splice(i, 1); return true; },
  'items.duplicates': () => [],
  'items.setStatus': p => ({ updated: (p.ids || []).length, status: p.status }),
  'items.labels': p => ({
    template: { id: 'default', name: 'Standard 50x30', width: 50, height: 30, isDefault: 'true', fields: [], json: JSON.stringify({ showPrice: true, showName: true, showCode: true, qr: false }) },
    rows: (p.ids || []).map(id => { const it = ITEMS.find(i => i.id === id); return it ? {
      id: it.id, code: it.code, name: it.name, nameUr: '', brand: it.brand, category: it.category,
      price: it.retailPrice, wholesale: it.wholesalePrice, mrp: it.retailPrice, barcode: it.barcode,
      barcodeType: 'CODE128', qr: 'HA:' + it.code, unit: it.unit, rack: it.rack, currency: 'Rs' } : null; }).filter(Boolean),
    business: { name: SETTINGS.businessName, phone: SETTINGS.phone }
  }),
  'items.byBarcode': p => ITEMS.map(decorate).find(i => norm(i.barcode) === norm(p.code) || norm(i.code) === norm(p.code)) || null,
  'items.reorderSuggest': () => ITEMS.filter(i => i.stock <= (i.reorderLevel || i.minStock)).map(i => {
    const d = decorate(i);
    const reorder = Number(i.reorderLevel || i.minStock || 0);
    const qty = Math.max(reorder * 2 - Number(i.stock || 0), 10);
    const sup = SUPPLIERS[(ITEMS.indexOf(i)) % SUPPLIERS.length] || {};
    return Object.assign({}, d, {
      reorderLevel: reorder, suggestQty: qty, suggestedQty: qty,
      estCost: Math.round(qty * Number(i.costPrice || 0) * 100) / 100, value: Math.round(qty * Number(i.costPrice || 0) * 100) / 100,
      supplierId: sup.id || '', supplierName: sup.name || '', primarySupplierId: sup.id || ''
    });
  })
    .map(i => Object.assign({}, i, { suggestQty: 20 - i.stock, estCost: (20 - i.stock) * i.costPrice })),

  /* v2.30.0 (N10) — asli backend (Inventory.levels) jaisa hi:
     scope 'all' = poora catalog (0 stock par bhi) · 'stocked' = sirf stock wale (purana view) */
  'stock.levels': p => {
    p = p || {};
    const locId = p.locationId || 'LOC-SDQ';
    const scope = norm(p.scope || 'stocked') === 'all' ? 'all' : 'stocked';
    let rows = ITEMS.map(i => {
      const qty = Number(i.stock) || 0;
      const reorder = Number(i.reorderLevel != null ? i.reorderLevel : i.minStock) || 0;
      const cost = Number(i.costPrice) || 0;
      return {
        itemId: i.id, code: i.code, name: i.name, brand: i.brand, category: i.category, unit: i.unit,
        rack: i.rack, locationId: locId, qty: qty, avgCost: cost, value: money(qty * cost),
        retailPrice: Number(i.retailPrice) || 0, costPrice: cost,
        minStock: Number(i.minStock) || 0, reorderLevel: reorder, status: i.status || 'ACTIVE',
        barcode: i.barcode || '', stocked: qty > 0, hasQty: qty > 0,
        stockStatus: qty <= 0 ? 'out' : (qty <= reorder ? 'low' : 'in'), low: qty <= reorder
      };
    });
    if (scope === 'stocked') rows = rows.filter(r => r.stocked);
    if (p.stockStatus && norm(p.stockStatus) !== 'all') {
      if (norm(p.stockStatus) === 'stocked') rows = rows.filter(r => r.stocked);
      else rows = rows.filter(r => r.stockStatus === norm(p.stockStatus));
    }
    if (p.q) rows = rows.filter(r => norm(r.code + ' ' + r.name + ' ' + r.brand + ' ' + r.category + ' ' + r.barcode).includes(norm(p.q)));
    if (p.category) rows = rows.filter(r => r.category === p.category);
    if (p.brand) rows = rows.filter(r => r.brand === p.brand);
    if (p.lowOnly) rows = rows.filter(r => r.low);
    if (p.zeroOnly) rows = rows.filter(r => r.qty === 0);
    const key = p.sort || 'name';
    const dir = p.dir === 'desc' ? -1 : 1;
    return rows.slice().sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * dir);
  },
  'stock.moves': () => ITEMS.slice(0, 40).map((i, k) => ({
    id: 'MOV' + k, date: new Date(Date.now() - k * 3600e3).toISOString(), itemId: i.id, code: i.code, name: i.name,
    qtyIn: k % 3 === 0 ? 10 : 0, qtyOut: k % 3 === 0 ? 0 : 2, balance: i.stock, cost: i.costPrice,
    refType: k % 3 === 0 ? 'GRN' : 'SALE', refId: '', notes: ''
  })),
  'stock.adjust.list': () => [
    { id: 'ADJ1', adjNo: 'ADJ-SDQ-01001', date: new Date().toISOString().slice(0, 10), locationId: 'LOC-SDQ', reason: 'PHYSICAL_COUNT', status: 'POSTED', notes: 'Monthly count' }
  ],
  'stock.adjust.save': p => Object.assign({ id: 'ADJ' + Date.now(), status: 'DRAFT' }, p.adjustment || p),
  'stock.adjust.post': () => ({ id: 'ADJ1', status: 'POSTED' }),
  'stock.adjust.reverse': () => ({ id: 'ADJ1', status: 'REVERSED' }),
  'stock.transfer.list': () => [
    { id: 'TRF1', transferNo: 'TRF-SDQ-01001', date: new Date().toISOString().slice(0, 10), fromLocationId: 'LOC-SDQ', toLocationId: 'LOC-RYK', status: 'IN_TRANSIT', notes: 'Stock balancing' }
  ],
  'stock.transfer.save': p => Object.assign({ id: 'TRF' + Date.now(), status: 'IN_TRANSIT' }, p.transfer || p),
  'stock.transfer.receive': () => ({ id: 'TRF1', status: 'RECEIVED' }),
  'stock.count': () => ({ ok: true }),

  'sales.create': p => {
    const s = p.sale || p;
    const items = (s.items || []).map((l, i) => {
      const it = ITEMS.find(x => x.id === l.itemId) || {};
      return { id: 'SI' + Date.now() + i, saleId: 'SAL' + Date.now(), itemId: l.itemId, code: it.code, name: it.name,
        qty: Number(l.qty), price: Number(l.price), cost: Number(it.costPrice || 0), discount: Number(l.discount || 0),
        tax: 0, lineTotal: Number(l.qty) * Number(l.price) - Number(l.discount || 0), salespersonId: 'USR1', serial: '' };
    });
    const subtotal = items.reduce((a, i) => a + i.lineTotal, 0);
    const paid = (s.payments || []).reduce((a, x) => a + Number(x.amount || 0), 0);
    const total = subtotal - Number(s.discount || 0);
    // loyalty mock: handle redeem + earn via CUSTOMERS.points (mirrors Loyalty.gs)
    let loyEarned = 0; let loyRedeemed = 0; let loyRedeemedPts = 0;
    try {
      const cust = s.customerId ? CUSTOMERS.find(c=>c.id===s.customerId) : null;
      const rate = Number(SETTINGS['loyalty.rate']||1) || 1;
      const perAmt = Number(SETTINGS['loyalty.perAmount']||1000) || 1000;
      const perPts = Number(SETTINGS['loyalty.points']||1) || 1;
      const enabled = String(SETTINGS['loyalty.enabled']||'true')!=='false';
      if (cust && enabled) {
        const lp = (s.payments||[]).find(x=>String(x.method||'').toUpperCase()==='LOYALTY');
        if (lp && Number(lp.amount||0)>0){
          const pts = Number(lp.points)||Math.ceil(Number(lp.amount||0)/rate);
          loyRedeemedPts = pts;
          loyRedeemed = Number(lp.amount||0);
          cust.points = Math.max(0, Number(cust.points||0) - pts);
        }
        if (Number(total)>0 && perAmt>0){
          loyEarned = Math.floor((Number(total)/perAmt)*perPts);
          if (loyEarned>0) cust.points = Number(cust.points||0) + loyEarned;
        }
      }
    } catch(e){}
    const sale = {
      id: 'SAL' + Date.now(), invoiceNo: 'INV-SDQ-0' + (9000 + SALES.length), date: new Date().toISOString(),
      locationId: s.locationId, customerId: s.customerId || '', customerName: s.customerName || 'Walk-in Customer',
      customerType: s.customerTypeId || '', subtotal, discount: Number(s.discount || 0), discountCode: '', tax: 0,
      total, paid, change: Math.max(0, paid - total), due: Math.max(0, total - paid),
      paymentMethod: (s.payments || []).map(x => x.method).join('+') || 'CASH',
      payments: JSON.stringify(s.payments || []), status: total - paid <= 0 ? 'PAID' : (paid > 0 ? 'PARTIAL' : 'DUE'),
      salespersonId: 'USR1', cashierId: 'USR1', sessionId: '', notes: s.notes || '', source: s.source || 'POS',
      createdAt: new Date().toISOString(), items,
      paymentList: s.payments || [], profit: items.reduce((a, i) => a + (i.price - i.cost) * i.qty, 0),
      pointsEarned: loyEarned, loyaltyEarned: loyEarned, pointsRedeemed: loyRedeemedPts, loyaltyRedeemed: loyRedeemedPts, loyaltyPointsUsed: loyRedeemedPts, loyaltyValue: loyRedeemed
    };
    items.forEach(i => { const it = ITEMS.find(x => x.id === i.itemId); if (it) it.stock = Math.max(0, it.stock - i.qty); });
    SALES.unshift(sale);
    return sale;
  },
  'sales.list': p => {
    const rows = filterSales(p);
    const page = p.page || 1, size = p.pageSize || 50;
    return {
      rows: rows.slice((page - 1) * size, page * size).map(s => Object.assign({}, s)),
      total: rows.length, page, pages: Math.ceil(rows.length / size) || 1,
      totals: { total: money(rows.reduce((a, s) => a + s.total, 0)), paid: money(rows.reduce((a, s) => a + s.paid, 0)),
        due: money(rows.reduce((a, s) => a + s.due, 0)), discount: money(rows.reduce((a, s) => a + s.discount, 0)) }
    };
  },
  'sales.get': p => SALES.find(s => s.id === p.id) || SALES[0],
  'sales.return': p => ({ id: 'RTN1', returnNo: 'RTN-SDQ-01001', total: 0 }),
  'sales.returns.list': () => [],
  'sales.hold': p => ({ id: 'HLD' + Date.now(), ref: p.ref }),
  'sales.held.list': () => [],
  'sales.held.resume': () => ({}),
  'sales.void': p => { const s = SALES.find(x => x.id === p.id); if (s) s.status = 'VOID'; return s; },

  'purchase.po.list': () => PORDERS.concat([
    { id: 'PO1', poNo: 'PO-SDQ-01001', date: new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10), supplierId: SUPPLIERS[0].id, locationId: 'LOC-SDQ', expectedDate: '', status: 'APPROVED', subtotal: 120000, tax: 0, total: 120000, budgetLimit: 200000, notes: '', supplierName: SUPPLIERS[0].name, lines: 6, itemCount: 6, orderedQty: 120, receivedQty: 40, pendingQty: 80 },
    { id: 'PO2', poNo: 'PO-SDQ-01002', date: new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10), supplierId: SUPPLIERS[1].id, locationId: 'LOC-SDQ', expectedDate: '', status: 'DRAFT', subtotal: 68000, tax: 0, total: 68000, budgetLimit: 0, notes: '', supplierName: SUPPLIERS[1].name, lines: 4, itemCount: 4, orderedQty: 60, receivedQty: 0, pendingQty: 60 }
  ]),
  'purchase.po.save': p => { const po = Object.assign({ id: 'PO' + Date.now(), status: 'DRAFT' }, p.po || p); PORDERS.unshift(po); return po; },
  'purchase.po.approve': () => ({ status: 'APPROVED' }),
  /* demo line items (mock PO / GRN detail ke liye) */
  'purchase.grn.get': function (p) {
    const g = MockAPI['purchase.grn.list']().find(x => x.id === p.id) || null;
    if (!g) throw new Error('GRN nahi mili');
    const sup = SUPPLIERS.find(x => x.id === g.supplierId) || {};
    const prev = Number(sup.openingBalance || 0);
    const total = Number(g.total || 0);
    return Object.assign({}, g, {
      items: MOCK_GRN_ITEMS.filter(r => r.grnId === g.id),
      poNo: g.poNo || '', paid: 0,
      prevBalance: prev, closingBalance: prev + total,
      supplier: { id: sup.id, name: sup.name || '—', phone: sup.phone || '',
        openingBalance: Number(sup.openingBalance || 0), paymentTerms: sup.paymentTerms || '',
        payable: prev, previousBalance: prev }
    });
  },
  'purchase.po.get': function (p) {
    const po = MockAPI['purchase.po.list']().find(x => x.id === p.id);
    if (!po) throw new Error('PO nahi mili');
    const sup = SUPPLIERS.find(x => x.id === po.supplierId) || {};
    return Object.assign({}, po, {
      items: MOCK_PO_ITEMS.filter(r => r.poId === po.id)
        .map(r => Object.assign({}, r, { pendingQty: Number(r.qty) - Number(r.receivedQty || 0) })),
      supplier: { id: sup.id, name: sup.name || '—', phone: sup.phone || '',
        openingBalance: Number(sup.openingBalance || 0), paymentTerms: sup.paymentTerms || '',
        payable: Number(sup.openingBalance || 0), previousBalance: Number(sup.openingBalance || 0) }
    });
  },
  'purchase.supplierStatement': function (p) {
    const sup = (SUPPLIERS || []).find(x => x.id === p.supplierId) || { name: '—' };
    const opening = Number(sup.openingBalance || 0);
    return {
      supplier: { id: sup.id, code: sup.code || '', name: sup.name, phone: sup.phone || '',
        email: sup.email || '', address: sup.address || '', ntn: sup.ntn || '',
        creditLimit: Number(sup.creditLimit || 0), active: sup.active || 'true',
        openingBalance: opening, paymentTerms: sup.paymentTerms || '' },
      openingBalance: opening, closingBalance: opening, closingPayable: opening,
      rows: [], totalPurchased: 0, totalPaid: 0
    };
  },
  /* v2.9.1 §6/§11 — Quick View endpoints (server logic ka demo mirror;
   * sirf upar wale real demo rows se aggregate, kuch bhi fabricated nahi) */
  'sales.itemActivity': p => {
    const days = Math.max(7, Number(p && p.days) || 30);
    const cut = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
    let qty = 0, revenue = 0, last = ''; const custs = {};
    SALE_ITEMS.forEach(li => {
      if (!p || String(li.itemId) !== String(p.itemId)) return;
      const sv = SALES.find(s => s.id === li.saleId && String(s.date).slice(0, 10) >= cut && s.status !== 'VOID');
      if (!sv) return;
      qty += Number(li.qty) || 0; revenue += Number(li.lineTotal) || 0;
      const d = String(sv.date).slice(0, 10); if (d > last) last = d;
      if (sv.customerName) custs[sv.customerName] = (custs[sv.customerName] || 0) + (Number(li.qty) || 0);
    });
    const top = Object.keys(custs).map(k => ({ name: k, qty: custs[k] })).sort((a, b) => b.qty - a.qty).slice(0, 3);
    return { itemId: p && p.itemId, days, qty: Math.round(qty * 100) / 100,
      revenue: Math.round(revenue * 100) / 100, lastSold: last, topCustomers: top };
  },
  'purchase.supplierCompare': p => {
    const days = Math.max(30, Number(p && p.days) || 180);
    const cut = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
    const grns = MockAPI['purchase.grn.list']().filter(g => String(g.date).slice(0, 10) >= cut && g.supplierId);
    const agg = {};
    grns.forEach(g => {
      MOCK_GRN_ITEMS.filter(li => li.grnId === g.id && (!p || String(li.itemId) === String(p.itemId)))
        .forEach(li => {
          const a = agg[g.supplierId] || (agg[g.supplierId] = {
            supplierId: g.supplierId, count: 0, units: 0, value: 0, min: Infinity, max: 0, lastRate: 0, lastDate: ''
          });
          const rate = Number(li.cost) || 0, q = Number(li.qty) || 0;
          a.count++; a.units += q; a.value += rate * q;
          if (rate && rate < a.min) a.min = rate;
          if (rate > a.max) a.max = rate;
          const d = String(g.date).slice(0, 10); if (d >= a.lastDate) { a.lastDate = d; a.lastRate = rate; }
        });
    });
    const rr = n => Math.round(n * 100) / 100;
    const rows = Object.keys(agg).map(k => {
      const a = agg[k]; const sup = SUPPLIERS.find(x => String(x.id) === String(k)) || {};
      return { supplierId: k, supplierName: sup.name || ('#' + k), count: a.count, units: rr(a.units),
        avgCost: a.units ? rr(a.value / a.units) : 0, minCost: a.min === Infinity ? 0 : rr(a.min),
        maxCost: rr(a.max), lastRate: rr(a.lastRate), lastDate: a.lastDate };
    }).sort((x, y) => y.count - x.count || y.units - x.units);
    const withAvg = rows.filter(r => r.avgCost > 0);
    if (withAvg.length > 1) {
      const best = withAvg.slice().sort((x, y) => x.avgCost - y.avgCost)[0];
      rows.forEach(r => { r.best = r.supplierId === best.supplierId; });
    }
    return { itemId: p && p.itemId, days, rows };
  },

  'purchase.grn.list': () => [
    { id: 'GRN1', grnNo: 'GRN-SDQ-01001', date: new Date(Date.now() - 4 * 864e5).toISOString().slice(0, 10), poId: 'PO1', supplierId: SUPPLIERS[0].id, locationId: 'LOC-SDQ', invoiceNo: 'INV-8821', invoiceDate: '', subtotal: 120000, tax: 0, freight: 0, total: 120000, status: 'POSTED', notes: '' },
    /* v2.9.1 §11 — doosre supplier ki GRN taake demo mein muqabla nazar aaye */
    { id: 'GRN2', grnNo: 'GRN-SDQ-01002', date: new Date(Date.now() - 18 * 864e5).toISOString().slice(0, 10), poId: '', supplierId: SUPPLIERS[1].id, locationId: 'LOC-SDQ', invoiceNo: 'INV-9912', invoiceDate: '', subtotal: 27000, tax: 0, freight: 0, total: 27000, status: 'POSTED', notes: '' }
  ],
  /* v2.30.4 (W13/T13.2) — GRN lines demo-store: supplier price signals isi se
     nikalte hain (session ke GRNs, asli gs logic ka mirror) */
  'purchase.grn.save': p => {
    const g = Object.assign({ id: 'GRN' + Date.now(), status: 'POSTED' }, p.grn || p);
    const sid = g.supplierId || '';
    if (sid && Array.isArray(g.items)) {
      (_GRN_LINES[sid] = _GRN_LINES[sid] || []).push(...g.items.map(it => ({
        itemId: it.itemId || '', code: it.code || '', name: it.name || '',
        rate: Number(it.cost) || 0, date: (g.date || '').slice(0, 10)
      })));
    }
    return g;
  },
  'purchase.supplierPriceSignals': p => {
    const arr = _GRN_LINES[p.supplierId] || [];
    const per = {};
    arr.forEach(l => {
      if (l.rate <= 0) return;
      (per[l.itemId] = per[l.itemId] || []).push(l);
    });
    const rows = [];
    Object.keys(per).forEach(itemId => {
      const list = per[itemId].slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
      if (list.length < 2) return;
      const last = list[list.length - 1], prev = list[list.length - 2];
      if (last.rate === prev.rate) return;
      const change = Math.round((last.rate - prev.rate) * 100) / 100;
      rows.push({
        itemId, code: last.code, name: last.name,
        lastRate: last.rate, lastDate: last.date,
        prevRate: prev.rate, prevDate: prev.date,
        change, changePct: prev.rate ? Math.round((change / prev.rate) * 1000) / 10 : 0,
        direction: change > 0 ? 'up' : 'down'
      });
    });
    rows.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
    return { rows: rows.slice(0, 20), total: rows.length, asOf: new Date().toISOString() };
  },
  'purchase.returns.list': () => PRETURNS,
  'purchase.return.save': p => p.record || p,
  /* v2.24.2 — Purchase ▸ Returns screen ab inhi naam se call karti hai (jaise
     asli backend Purchase.gs karta hai). Pehle sirf 'purchase.returns.list' tha,
     is liye demo mein Returns tab "backend connected nahi" dikhata tha. */
  'purchase.listReturns': () => PRETURNS,
  'purchase.saveReturn': p => {
    const rec = Object.assign({
      id: 'PRT' + Date.now(), returnNo: 'PRET-SDQ-0' + (1001 + PRETURNS.length),
      date: new Date().toISOString().slice(0, 10), status: 'POSTED',
      total: (p.items || []).reduce((a, x) => a + (Number(x.qty) || 0) * (Number(x.cost) || 0), 0)
    }, p);
    PRETURNS.unshift(rec);
    return rec;
  },

  'customers.list': p => {
    let rows = CUSTOMERS.filter(c => !p.q || norm(c.name + c.phone + c.code).includes(norm(p.q)));
    if (p.onlyDue) rows = rows.filter(c => c.balance > 0);
    return { rows: rows.map(c => Object.assign({}, c, { balance: c.balance })), total: rows.length };
  },
  'customers.save': p => {
    /* v2.30.5 fix (sweep ne pakra) — record list me bhi jata tha nahi (sirf return) */
    const rec = Object.assign({ id: 'CUS' + Date.now(),
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, p.customer || p);
    const ci = CUSTOMERS.findIndex(x => x.id === rec.id);
    if (ci > -1) Object.assign(CUSTOMERS[ci], rec, { updatedAt: new Date().toISOString() });
    else CUSTOMERS.push(rec);
    return rec;
  },
  'customers.ledger': p => {
    const c = CUSTOMERS.find(x => x.id === p.id) || CUSTOMERS[0];
    let bal = Number(c.openingBalance || 0);
    const rows = [];
    for (let i = 0; i < 5; i++) {
      bal += (i % 2 ? -1500 : 4200);
      rows.push({ id: 'L' + i, date: new Date(Date.now() - i * 5 * 864e5).toISOString().slice(0, 10),
        refType: i % 2 ? 'RECEIPT' : 'SALE', refId: '', description: i % 2 ? 'Cash received' : 'Invoice INV-00' + i,
        debit: i % 2 ? 0 : 4200, credit: i % 2 ? 1500 : 0, balance: bal, locationId: 'LOC-SDQ' });
    }
    return { party: c, opening: Number(c.openingBalance || 0), rows, closing: bal };
  },
  'parties.balance': p => {
    const type = String(p.partyType || p.type || 'CUSTOMER').toUpperCase();
    const row = type === 'CUSTOMER'
      ? (CUSTOMERS.find(x => x.id === (p.id || p.partyId)) || CUSTOMERS[0])
      : (SUPPLIERS.find(x => x.id === (p.id || p.partyId)) || SUPPLIERS[0]);
    const led = MockAPI['customers.ledger']({ id: row.id });
    const billed = led.rows.reduce((a, r) => a + Number(type === 'CUSTOMER' ? (r.debit || 0) : (r.credit || 0)), 0);
    const paid = led.rows.reduce((a, r) => a + Number(type === 'CUSTOMER' ? (r.credit || 0) : (r.debit || 0)), 0);
    const balance = Number(led.closing || 0);
    return { id: row.id, type: type, name: row.name, code: row.code || '', phone: row.phone || '',
      opening: Number(row.openingBalance || 0), billed: billed, paid: paid, balance: balance,
      outstanding: Math.abs(balance), creditLimit: Number(row.creditLimit || 0), entries: led.rows.length };
  },
  'customers.types.list': () => TYPES,
  'customers.types.save': p => p.type || p,
  'suppliers.list': p => {
    let rows = SUPPLIERS.filter(s => !p.q || norm(s.name + s.phone).includes(norm(p.q)));
    return { rows, total: rows.length };
  },
  /* v2.30.4 — demo store: save par list mein bhi aa jaye (pehle sirf echo tha) */
  'suppliers.save': p => {
    const rec = Object.assign({ id: 'SUP' + Date.now(),
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, p.supplier || p);
    const i = (SUPPLIERS || []).findIndex(x => x.id === rec.id);
    if (i > -1) SUPPLIERS[i] = Object.assign(SUPPLIERS[i], rec, { updatedAt: new Date().toISOString() }); else SUPPLIERS.push(rec);
    return rec;
  },
  'suppliers.ledger': p => MockAPI['customers.ledger'](p),


  /* ------------------------- ACCOUNTING (demo) -------------------------- */
  'accounts.list': function () { return ACCOUNTS.map(decorate); },
  'accounts.save': function (p) {
    const existing = p.id ? ACCOUNTS.filter(function (a) { return a.id === p.id; })[0] : null;
    if (existing) { Object.assign(existing, p); return decorate(existing); }
    const acc = Object.assign({ id: 'ACC' + (ACCOUNTS.length + 1) + Date.now().toString(36),
      openingBalance: 0, active: 'true', isCash: 'false', isBank: 'false',
      normalSide: (p.group === 'ASSET' || p.group === 'EXPENSE') ? 'DR' : 'CR',
      createdAt: new Date().toISOString() }, p);
    acc.isCash = String(acc.isCash); acc.isBank = String(acc.isBank);
    ACCOUNTS.push(acc);
    return decorate(acc);
  },
  'accounts.seed': function () { return { created: 0 }; },
  'journal.post': function (p) {
    const lines = (p.lines || []).filter(function (l) { return (Number(l.debit) || 0) > 0 || (Number(l.credit) || 0) > 0; });
    if (lines.length < 2) throw new Error('Voucher mein kam az kam do lines (debit + credit) chahiye.');
    let td = 0, tc = 0;
    lines.forEach(function (l) {
      if ((Number(l.debit) || 0) > 0 && (Number(l.credit) || 0) > 0) throw new Error('Ek line mein debit aur credit dono nahi ho sakte.');
      td += Number(l.debit) || 0; tc += Number(l.credit) || 0;
    });
    if (Math.abs(td - tc) > 0.01) throw new Error('Voucher balanced nahi: debit ' + td + ' vs credit ' + tc);
    const before = JOURNALS.length;
    jv(p.date || new Date().toISOString().slice(0, 10), p.type || 'JV', p.narration || '',
      lines.map(function (l) { return [l.accountId, Number(l.debit) || 0, Number(l.credit) || 0, l.narration]; }),
      p.refType);
    const made = JOURNALS[JOURNALS.length - 1];
    const out = Object.assign({}, made);
    out.lines = made.lines.map(function (l) {
      const a = ACCOUNTS.filter(function (x) { return x.id === l.accountId; })[0] || {};
      return Object.assign({}, l, { accountName: a.name || '' });
    });
    return out;
  },
  'journal.list': function (p) {
    p = p || {};
    return JOURNALS.filter(function (j) {
      if (p.type && j.type !== p.type) return false;
      if (p.from && j.date < p.from) return false;
      if (p.to && j.date > p.to) return false;
      return true;
    }).sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, Number(p.limit) || 200).map(journalRow);
  },
  'journal.get': function (p) {
    const j = JOURNALS.filter(function (x) { return x.id === p.id; })[0];
    if (!j) throw new Error('Voucher nahi mila');
    return Object.assign({}, j, { lines: (j.lines || []).map(function (l) {
      const a = ACCOUNTS.filter(function (x) { return x.id === l.accountId; })[0] || {};
      return Object.assign({}, l, { accountName: a.name || '' });
    }) });
  },
  'journal.void': function (p) {
    const j = JOURNALS.filter(function (x) { return x.id === p.id; })[0];
    if (j) j.status = 'VOID';
    return { ok: true };
  },
  'accounting.ledger': function (p) { return mockLedger(p.accountId, p.from, p.to); },
  'accounting.dayBook': function (p) {
    const rows = MockAPI['journal.list'](p);
    return { from: (p || {}).from || '', to: (p || {}).to || '', rows: rows,
      totalDebit: rows.reduce(function (a, r) { return a + r.totalDebit; }, 0),
      totalCredit: rows.reduce(function (a, r) { return a + r.totalCredit; }, 0) };
  },
  'accounting.cashBook': function (p) {
    const cash = ACCOUNTS.filter(function (a) { return a.isCash === 'true' && (!p.accountId || a.id === p.accountId); });
    return bookFor(cash, p, 'Cash accounts');
  },
  'accounting.bankBook': function (p) {
    const bank = ACCOUNTS.filter(function (a) { return a.isBank === 'true' && (!p.accountId || a.id === p.accountId); });
    return bookFor(bank, p, 'Bank accounts');
  },
  'accounting.trialBalance': function (p) {
    const rows = ACCOUNTS.map(decorate).map(function (a) {
      const bal = a.ledgerBalance;
      return { id: a.id, code: a.code, name: a.name, group: a.group,
        debit: bal > 0 ? bal : 0, credit: bal < 0 ? -bal : 0 };
    }).filter(function (r) { return r.debit > 0.004 || r.credit > 0.004; });
    const td = rows.reduce(function (a, r) { return a + r.debit; }, 0);
    const tc = rows.reduce(function (a, r) { return a + r.credit; }, 0);
    return { asOf: (p || {}).asOf || '', rows: rows,
      totalDebit: Math.round(td * 100) / 100, totalCredit: Math.round(tc * 100) / 100,
      balanced: Math.abs(td - tc) < 0.01 };
  },
  'accounting.profitLoss': function (p) {
    p = p || {};
    const income = [], expenses = [], cogsRows = [];
    ACCOUNTS.forEach(function (a) {
      const led = mockLedger(a.id, p.from, p.to);
      const net = Math.round((led.totalCredit - led.totalDebit) * 100) / 100;
      if (a.group === 'INCOME') income.push({ code: a.code, name: a.name, amount: net });
      else if (a.group === 'EXPENSE' && (led.totalDebit || led.totalCredit)) {
        (a.code === '5000' || a.code === '5100' ? cogsRows : expenses)
          .push({ code: a.code, name: a.name, amount: Math.round((led.totalDebit - led.totalCredit) * 100) / 100 });
      }
    });
    const totalIncome = income.reduce(function (a, r) { return a + r.amount; }, 0);
    const purchases = cogsRows.reduce(function (a, r) { return a + r.amount; }, 0);
    const closing = DEMO_STOCK_VALUE;
    const cogs = purchases - closing;
    const gp = totalIncome - cogs;
    const te = expenses.reduce(function (a, r) { return a + r.amount; }, 0);
    const np = gp - te;
    return { from: p.from || '', to: p.to || '',
      income: income.filter(function (r) { return Math.abs(r.amount) > 0.004; }),
      totalIncome: totalIncome, openingStock: 0, purchases: purchases, closingStock: closing,
      cogs: cogs, grossProfit: gp,
      expenses: expenses.filter(function (r) { return Math.abs(r.amount) > 0.004; }),
      totalExpenses: te, netProfit: np,
      marginPct: totalIncome ? Math.round(np / totalIncome * 10000) / 100 : 0 };
  },
  'accounting.balanceSheet': function (p) {
    const asOf = (p || {}).asOf || new Date().toISOString().slice(0, 10);
    const assets = [], liabilities = [], equity = [];
    ACCOUNTS.forEach(function (a) {
      const bal = accBalance(a.id, asOf);
      if (Math.abs(bal) < 0.004) return;
      const row = { code: a.code, name: a.name, amount: a.group === 'ASSET' ? bal : -bal };
      if (a.group === 'ASSET') assets.push(row);
      else if (a.group === 'LIABILITY') liabilities.push(row);
      else if (a.group === 'EQUITY') equity.push(row);
    });
    const inv = assets.filter(function (r) { return r.code === '1300'; })[0];
    if (inv) { inv.name = inv.name + ' — closing stock'; inv.amount = DEMO_STOCK_VALUE; }
    else assets.push({ code: '1300', name: 'Inventory — closing stock', amount: DEMO_STOCK_VALUE });
    const pl = MockAPI['accounting.profitLoss']({ to: asOf });
    equity.push({ code: '3100', name: 'Current period profit / (loss)', amount: pl.netProfit });
    const ta = assets.reduce(function (a, r) { return a + r.amount; }, 0);
    const tl = liabilities.reduce(function (a, r) { return a + r.amount; }, 0);
    const te = equity.reduce(function (a, r) { return a + r.amount; }, 0);
    return { asOf: asOf, assets: assets, liabilities: liabilities, equity: equity,
      totalAssets: Math.round(ta * 100) / 100, totalLiabilities: Math.round(tl * 100) / 100,
      totalEquity: Math.round(te * 100) / 100, closingStock: DEMO_STOCK_VALUE,
      partyReceivables: 486300, partyPayables: 742800,
      totalLiabEquity: Math.round((tl + te) * 100) / 100,
      balanced: Math.abs(ta - (tl + te)) < 0.01 };
  },
  'accounting.dashboard': function () {
    let cash = 0, bank = 0;
    ACCOUNTS.forEach(function (a) {
      const bal = accBalance(a.id);
      if (a.isCash === 'true') cash += bal;
      if (a.isBank === 'true') bank += bal;
    });
    const tb = MockAPI['accounting.trialBalance']({});
    const monthStart = new Date().toISOString().slice(0, 8) + '01';
    const pl = MockAPI['accounting.profitLoss']({ from: monthStart, to: new Date().toISOString().slice(0, 10) });
    const today = new Date().toISOString().slice(0, 10);
    const todays = JOURNALS.filter(function (j) { return j.date === today && j.status !== 'VOID'; });
    return { today: today, cashInHand: Math.round(cash * 100) / 100, bankBalance: Math.round(bank * 100) / 100,
      receivables: 486300, payables: 742800, stockValue: DEMO_STOCK_VALUE,
      netWorth: Math.round((cash + bank + 486300 + DEMO_STOCK_VALUE - 742800) * 100) / 100,
      vouchersToday: todays.length,
      postedToday: todays.reduce(function (a, j) { return a + j.totalDebit; }, 0),
      trialBalanced: tb.balanced, trialDebit: tb.totalDebit, trialCredit: tb.totalCredit,
      mtd: { income: pl.totalIncome, expenses: pl.totalExpenses, netProfit: pl.netProfit } };
  },
  'accounting.stockValue': function () { return { value: DEMO_STOCK_VALUE }; },
  'accounting.backfill': function () { return { sales: 0, grn: 0, payments: 0, expenses: 0 }; },
  'bank.recon.list': function (p) {
    return BANK_RECON.filter(function (r) { return !p.bankAccountId || r.bankAccountId === p.bankAccountId; })
      .sort(function (a, b) { return a.date < b.date ? 1 : -1; })
      .map(function (r) { return Object.assign({}, r, { cleared: r.cleared === 'true',
        amount: Number(r.amount) }); });
  },
  'bank.recon.import': function (p) {
    (p.rows || []).forEach(function (r, i) {
      BANK_RECON.push({ id: 'BR' + Date.now() + i, bankAccountId: p.bankAccountId,
        date: r.date || new Date().toISOString().slice(0, 10), reference: r.reference || '',
        amount: Math.abs(Number(r.amount) || 0),
        direction: (r.direction || (Number(r.amount) < 0 ? 'OUT' : 'IN')).toUpperCase(),
        cleared: 'false', clearedDate: '', journalId: '', statementRef: '', note: r.note || '' });
    });
    return { added: (p.rows || []).length };
  },
  'bank.recon.match': function (p) {
    let matched = 0, pending = 0;
    BANK_RECON.forEach(function (r) {
      if (r.bankAccountId !== p.bankAccountId || r.cleared === 'true') return;
      const hit = JOURNALS.filter(function (j) {
        if (j.date !== r.date || j.status === 'VOID') return false;
        let amt = 0;
        (j.lines || []).forEach(function (l) {
          if (l.accountId !== p.bankAccountId) return;
          amt += r.direction === 'IN' ? (Number(l.debit) || 0) : (Number(l.credit) || 0);
        });
        return Math.abs(amt - Number(r.amount)) < 0.01;
      })[0];
      if (hit) { r.cleared = 'true'; r.clearedDate = new Date().toISOString().slice(0, 10); r.journalId = hit.id; matched++; }
      else pending++;
    });
    return { matched: matched, pending: pending };
  },
  'bank.recon.clear': function (p) {
    (p.ids || []).forEach(function (id) {
      BANK_RECON.forEach(function (r) {
        if (r.id !== id) return;
        r.cleared = p.cleared === false ? 'false' : 'true';
        r.clearedDate = p.cleared === false ? '' : new Date().toISOString().slice(0, 10);
      });
    });
    return { updated: (p.ids || []).length };
  },

  /* helper used by cashBook / bankBook */
  'payments.list': () => [
    { id: 'PAY1', voucherNo: 'PAY-SDQ-01001', date: new Date().toISOString(), type: 'RECEIPT', partyType: 'CUSTOMER', partyId: CUSTOMERS[0].id, partyName: CUSTOMERS[0].name, amount: 15000, method: 'CASH', reference: 'INV-1', locationId: 'LOC-SDQ', notes: '' }
  ],
  'payments.create': p => Object.assign({ id: 'PAY' + Date.now(), voucherNo: 'PAY-' + Date.now() }, p.payment || p),
  'expenses.list': () => MOCK_EXPENSES.slice(),
  'expenses.create': p => {
    const e = Object.assign({ id: 'EXP' + Date.now(), voucherNo: 'EXP-SDQ-0' + (1000 + MOCK_EXPENSES.length),
      status: 'POSTED', accountId: '', reference: '', taxAmount: 0, attachmentUrl: '' }, p.expense || p);
    if ((SETTINGS.expenseApproval === 'true') && Number(e.amount) >= Number(SETTINGS.expenseApprovalOver || 0)) e.status = 'PENDING';
    MOCK_EXPENSES.unshift(e); return e;
  },
  /* W7 (v2.26.0) — batch approve: ek hi call mein kai ids */
  'expenses.approveBatch': p => {
    const ids = (p && p.ids) || [];
    let n = 0;
    ids.forEach(id => {
      const r = (MockAPI['expenses.list']({}) || []).find(x => x.id === id);
      if (r) { r.status = (p && p.approve === false) ? 'REJECTED' : 'POSTED'; n++; }
    });
    return { approved: n, ids: ids, skipped: 0, _batch: true };
  },
  'expenses.approve': p => {
    const e = MOCK_EXPENSES.filter(x => x.id === p.id)[0] || MOCK_EXPENSES[0];
    if (e) e.status = (p.approve === false) ? 'REJECTED' : 'POSTED';
    return e || {};
  },
  /* v2.5.1: day / shift closing report (demo) */
  'shop.dayReport': function (p) {
    const ses = MockAPI['cash.session.current']();
    const t = { cashIn: 84500, cashOut: 2000, expenses: 2700, card: 22000, netCash: 79800, txns: 34 };
    return {
      id: ses.id, sessionNo: ses.sessionNo, locationId: ses.locationId, locationName: 'Sadiqabad City',
      locationCode: 'SDQ', cashier: 'Haseeb (Owner)', cashierUsername: 'owner',
      openedAt: ses.openedAt, closedAt: null, status: 'OPEN',
      openingCash: 5000, closingCash: null, variance: null, notes: '',
      totals: t, expectedCash: 84800,
      business: { name: 'Haseeb Autos', ur: 'حسیب آٹوز', phone: '+92 300 1234567',
        address: 'Main Bypass Road, Sadiqabad', ntn: '1234567-8' },
      currency: 'Rs', durationMins: 324, bills: 34,
      sales: { count: 34, gross: 97596, returns: 1200, udhaar: 4400 },
      methods: [{ method: 'CASH', count: 21, amount: 84500 }, { method: 'JAZZCASH', count: 7, amount: 14000 },
        { method: 'CARD', count: 4, amount: 8000 }, { method: 'EASYPAISA', count: 2, amount: 3000 }],
      moves: [{ id: 'M1', date: new Date(Date.now() - 3 * 3600e3).toISOString(), type: 'CASH_OUT',
        amount: 2000, reason: 'Chai / staff lunch' }],
      expenses: [{ category: 'Petty cash', count: 2, amount: 2700 }],
      top: [{ itemId: 'IT1', name: 'Flamingo Car Mat (Black)', code: 'FL-1001', qty: 12, amount: 18000 },
        { itemId: 'IT2', name: 'Engine Oil 20W-50 1L', code: 'OIL-001', qty: 22, amount: 26400 }],
      hours: [{ hour: '10', bills: 5, amount: 14000 }, { hour: '12', bills: 9, amount: 26000 },
        { hour: '15', bills: 11, amount: 31000 }],
      generatedAt: new Date().toISOString()
    };
  },
  'exports.pdf': p => ({ id: 'PDF' + Date.now(), url: '#', name: (p.name || 'document') + '.pdf', format: 'PDF', size: 0 }),
  'cash.session.current': () => {
    /* v2.30.5 — ab shop.status wali hi sachai se (band shop → null) */
    const cs = demoShopSync();
    if (!window.__demoSessionOpen || !cs || cs.status !== 'OPEN') return null;
    return { id: cs.id, sessionNo: cs.sessionNo, locationId: cs.locationId, openedAt: cs.openedAt,
      openingCash: cs.openingCash, status: 'OPEN', totals: cs.totals, expectedCash: cs.expectedCash };
  },
  'cash.session.summary': function (p) {
    demoShopSync();
    if (!CASH_SESSION || CASH_SESSION.status !== 'OPEN') return null;
    const ses = CASH_SESSION;
    const moves = CASH_MOVES.map(function (m) {
      return { id: m.id, date: m.date, type: m.type, amount: m.amount, reason: m.reason };
    }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    const t = ses.totals || {};
    const methods = [
      { method: 'CASH', count: 21, amount: t.cashIn || 0 },
      { method: 'CARD', count: 6, amount: 14000 },
      { method: 'JAZZCASH', count: 4, amount: 5000 },
      { method: 'EASYPAISA', count: 3, amount: 3000 }
    ].filter(function (m) { return m.amount > 0; });
    return {
      id: ses.id, sessionNo: ses.sessionNo, locationId: ses.locationId,
      openedAt: ses.openedAt, closedAt: ses.closedAt || '', status: ses.status,
      openingCash: ses.openingCash, closingCash: null, variance: null, notes: ses.notes || '',
      totals: t, expectedCash: ses.expectedCash,
      methods: methods, moves: moves,
      expenses: [
        { category: 'GENERAL', count: 2, amount: 1200 },
        { category: 'TRANSPORT', count: 1, amount: 1500 },
        { category: 'UTILITIES', count: 1, amount: 500 }
      ],
      sales: { count: 34, gross: 106500, returns: 3200, udhaar: 18500 }
    };
  },
  'cash.move': function (p) {
    demoShopSync();
    if (!CASH_SESSION || CASH_SESSION.status !== 'OPEN') throw new Error('Pehle shop open karein.');
    const type = String(p.type || '').toUpperCase();
    if (['CASH_IN', 'CASH_OUT', 'DROP'].indexOf(type) < 0) throw new Error('Ghalat type.');
    const amt = Number(p.amount || 0);
    if (!(amt > 0)) throw new Error('Amount zaroori hai.');
    CASH_MOVES.push({ id: 'PMV' + (CASH_MOVES.length + 1), date: new Date().toISOString(),
      type: type, amount: amt, reason: p.reason || p.notes || '' });
    /* drawer expectation turant update */
    const t = CASH_SESSION.totals;
    if (type === 'CASH_IN') t.cashIn += amt; else t.cashOut += amt;
    t.netCash = t.cashIn - t.cashOut - t.expenses;
    CASH_SESSION.expectedCash = CASH_SESSION.openingCash + t.netCash;
    return MockAPI['cash.session.summary']({});
  },
  'cash.session.open': p => {
    /* v2.30.5 — shop.open ke sath EK hi sachai (pehle CASH_SESSION azaad tha) */
    const r = MockAPI['shop.open']({ openingCash: Number((p || {}).openingCash || 0) });
    demoShopSync();
    return { id: r.session.id, status: 'OPEN' };
  },
  'cash.session.close': p => {
    const exp = (CASH_SESSION && CASH_SESSION.expectedCash) || 0;
    MockAPI['shop.close']({ closingCash: Number((p || {}).closingCash || 0) });
    demoShopSync();
    return { variance: Number((p || {}).closingCash || 0) - exp };
  },
  'cash.session.close': p => ({ variance: Number(p.closingCash || 0) - 86300 }),

  'reports.dashboard': () => {
    const today = new Date().toISOString().slice(0, 10);
    const todays = SALES.filter(s => s.date.slice(0, 10) === today);
    const month = SALES.filter(s => new Date(s.date) > new Date(Date.now() - 30 * 864e5));
    const trend = [];
    for (let d = 13; d >= 0; d--) {
      const day = new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
      trend.push({ date: day, total: money(SALES.filter(s => s.date.slice(0, 10) === day).reduce((a, s) => a + s.total, 0)) });
    }
    const agg = {};
    SALES.forEach(s => s.items.forEach(i => {
      agg[i.itemId] = agg[i.itemId] || { itemId: i.itemId, code: i.code, name: i.name, qty: 0, revenue: 0, profit: 0 };
      agg[i.itemId].qty += i.qty; agg[i.itemId].revenue += i.lineTotal;
      agg[i.itemId].profit += (i.price - i.cost) * i.qty;
    }));
    const topItems = Object.values(agg).sort((a, b) => b.revenue - a.revenue).slice(0, 8).map(i =>
      Object.assign(i, { revenue: money(i.revenue), profit: money(i.profit) }));
    const lowStock = ITEMS.filter(i => i.stock <= (i.reorderLevel || i.minStock)).slice(0, 8)
      .map(i => ({ id: i.id, code: i.code, name: i.name, qty: i.stock, reorderLevel: i.reorderLevel }));
    const profit = month.reduce((a, s) => a + s.items.reduce((x, i) => x + (i.price - i.cost) * i.qty, 0), 0);
    return {
      kpis: {
        todaySales: money(todays.reduce((a, s) => a + s.total, 0)), todayTxns: todays.length,
        weekSales: money(SALES.filter(s => new Date(s.date) > new Date(Date.now() - 7 * 864e5)).reduce((a, s) => a + s.total, 0)),
        monthSales: money(month.reduce((a, s) => a + s.total, 0)), monthProfit: money(profit),
        monthDiscount: money(month.reduce((a, s) => a + s.discount, 0)),
        avgTicket: month.length ? money(month.reduce((a, s) => a + s.total, 0) / month.length) : 0,
        receivables: money(CUSTOMERS.reduce((a, c) => a + c.balance, 0)),
        payables: money(Math.abs(SUPPLIERS.reduce((a, s) => a + s.balance, 0))),
        inventoryValue: money(ITEMS.reduce((a, i) => a + i.stock * i.costPrice, 0)),
        inventoryRetail: money(ITEMS.reduce((a, i) => a + i.stock * i.retailPrice, 0)),
        lowStockCount: lowStock.length, itemsCount: ITEMS.length, customersCount: CUSTOMERS.length,
        pendingDue: money(SALES.filter(s => s.due > 0).reduce((a, s) => a + s.due, 0))
      },
      trend, topItems, lowStock,
      paymentMix: [{ method: 'CASH', total: money(month.reduce((a, s) => a + s.total, 0) * 0.7) },
        { method: 'CARD', total: money(month.reduce((a, s) => a + s.total, 0) * 0.3) }]
    };
  },
  'reports.sales': p => {
    const rows = filterSales(p);
    let cogs = 0, gross = 0;
    rows.forEach(s => s.items.forEach(i => { cogs += i.cost * i.qty; gross += (i.price - i.cost) * i.qty; }));
    return {
      rows: rows.map(s => Object.assign({}, s)),
      summary: {
        count: rows.length,
        subtotal: money(rows.reduce((a, s) => a + s.subtotal, 0)),
        discount: money(rows.reduce((a, s) => a + s.discount, 0)), tax: 0,
        total: money(rows.reduce((a, s) => a + s.total, 0)),
        paid: money(rows.reduce((a, s) => a + s.paid, 0)),
        due: money(rows.reduce((a, s) => a + s.due, 0)),
        cogs: money(cogs), grossProfit: money(gross)
      }
    };
  },
  'reports.salesByItem': p => {
    const rows = filterSales(p);
    const agg = {};
    rows.forEach(s => s.items.forEach(i => {
      agg[i.itemId] = agg[i.itemId] || { itemId: i.itemId, code: i.code, name: i.name, qty: 0, revenue: 0, cost: 0, profit: 0, txns: 0 };
      agg[i.itemId].qty += i.qty; agg[i.itemId].revenue += i.lineTotal;
      agg[i.itemId].cost += i.cost * i.qty; agg[i.itemId].profit += (i.price - i.cost) * i.qty; agg[i.itemId].txns++;
    }));
    const out = Object.values(agg).sort((a, b) => b.revenue - a.revenue);
    return { rows: out, total: out.length };
  },
  'reports.salesByCategory': p => {
    const rows = filterSales(p);
    const agg = {};
    rows.forEach(s => s.items.forEach(i => {
      const it = ITEMS.find(x => x.id === i.itemId) || {};
      const cat = it.category || 'Other';
      agg[cat] = agg[cat] || { category: cat, qty: 0, revenue: 0, profit: 0 };
      agg[cat].qty += i.qty; agg[cat].revenue += i.lineTotal; agg[cat].profit += (i.price - i.cost) * i.qty;
    }));
    return { rows: Object.values(agg).sort((a, b) => b.revenue - a.revenue) };
  },
  'reports.profit': p => {
    const r = MockAPI['reports.sales'](p);
    const expenses = 42000;
    return {
      revenue: r.summary.total, cogs: r.summary.cogs, grossProfit: r.summary.grossProfit,
      discount: r.summary.discount, expenses, netProfit: money(r.summary.grossProfit - expenses),
      margin: r.summary.total ? money(r.summary.grossProfit / r.summary.total * 100) : 0,
      byCategory: MockAPI['reports.salesByCategory'](p).rows
    };
  },
  'reports.inventoryValuation': p => {
    const rows = MockAPI['stock.levels'](p);
    return { rows, summary: { costValue: money(rows.reduce((a, r) => a + r.value, 0)),
      retailValue: money(rows.reduce((a, r) => a + r.qty * r.retailPrice, 0)),
      units: rows.reduce((a, r) => a + r.qty, 0), skus: rows.length } };
  },
  'reports.lowStock': () => MockAPI['items.reorderSuggest'](),
  /* prev + new - settled = closing  (identity demo mein bhi barqarar) */
  'reports.receivables': () => MockAPI['reports.partyBalances']({ partyType: 'CUSTOMER' }),
  'reports.payables': () => MockAPI['reports.partyBalances']({ partyType: 'SUPPLIER' }),
  'reports.partyBalances': p => {
    const sup = String((p && p.partyType) || 'CUSTOMER').toUpperCase() === 'SUPPLIER';
    const src = (sup ? SUPPLIERS : CUSTOMERS).map(x => ({ id: x.id, code: x.code, name: x.name, phone: x.phone, raw: x.balance }));
    const rows = src.filter(x => Math.abs(x.raw) > 0.005).map(x => {
      const closing = money(Math.abs(x.raw));
      const prev = money(closing * 0.7);
      const added = money(closing * 0.5);
      const settled = money(prev + added - closing);
      return {
        id: x.id, code: x.code, name: x.name, phone: x.phone, partyType: sup ? 'SUPPLIER' : 'CUSTOMER',
        openingBalance: money(prev * 0.4), prevBalance: prev, newAmount: added, settled,
        balance: closing, closingBalance: closing
      };
    }).sort((a, b) => b.balance - a.balance);
    return {
      rows, partyType: sup ? 'SUPPLIER' : 'CUSTOMER', from: '', to: '',
      prevTotal: money(rows.reduce((a, r) => a + r.prevBalance, 0)),
      newTotal: money(rows.reduce((a, r) => a + r.newAmount, 0)),
      settledTotal: money(rows.reduce((a, r) => a + r.settled, 0)),
      total: money(rows.reduce((a, r) => a + r.balance, 0))
    };
  },
  'reports.stockMovement': () => MockAPI['stock.moves'](),
  /* v2.5.1: cash book — opening → in → out → closing (running balance) */
  'reports.cashbook': p => {
    const method = String((p && p.method) || 'ALL').toUpperCase();
    const ok = r => method === 'ALL' || String(r.method || 'CASH').toUpperCase() === method;
    const pays = MockAPI['payments.list']().filter(ok);
    const exps = MOCK_EXPENSES.filter(e => String(e.status).toUpperCase() !== 'REJECTED').filter(ok);
    const opening = 125000;                       /* settings balance + purani entries */
    let inflow = 0, outflow = 0, expTotal = 0;
    const byMethod = {}, byDay = {}, entries = [];
    const bucket = m => (byMethod[m] = byMethod[m] || { method: m, count: 0, inflow: 0, outflow: 0, net: 0 });
    const day = k => (byDay[k] = byDay[k] || { date: k, inflow: 0, outflow: 0 });
    const dstr = d => String(d).slice(0, 10);
    const dayStr = d => new Date(d).toISOString().slice(0, 10);
    pays.forEach(r => {
      const amt = Number(r.amount) || 0, m = String(r.method || 'CASH').toUpperCase();
      const out = r.type === 'REFUND_OUT' || r.type === 'SUPPLIER_PAYMENT';
      if (out) outflow += amt; else inflow += amt;
      const b = bucket(m); b.count++; if (out) b.outflow += amt; else b.inflow += amt; b.net = b.inflow - b.outflow;
      const k = dstr(r.date), dd = day(k); if (out) dd.outflow += amt; else dd.inflow += amt;
      entries.push(Object.assign({}, r, { _at: String(r.date), direction: out ? 'OUT' : 'IN', kind: 'PAYMENT', accountName: r.partyName || '' }));
    });
    exps.forEach(r => {
      const amt = Number(r.amount) || 0, m = String(r.method || 'CASH').toUpperCase();
      outflow += amt; expTotal += amt;
      const b = bucket(m); b.count++; b.outflow += amt; b.net = b.inflow - b.outflow;
      const k = dstr(r.date), dd = day(k); dd.outflow += amt;
      entries.push({ id: r.id, voucherNo: r.voucherNo, date: r.date, type: 'EXPENSE', category: r.category,
        partyName: r.paidTo || '', amount: amt, method: m, _at: String(r.date),
        direction: 'OUT', kind: 'EXPENSE', accountName: r.paidTo || '', notes: r.notes || '' });
    });
    entries.sort((a, b) => String(a._at).localeCompare(String(b._at)));
    let bal = opening;
    entries.forEach(e => { bal += (e.direction === 'OUT' ? -Number(e.amount || 0) : Number(e.amount || 0)); e.balance = Math.round(bal * 100) / 100; delete e._at; });
    let run = opening;
    const days = Object.keys(byDay).sort().map(k => {
      const d = byDay[k], o = run; run += d.inflow - d.outflow;
      return { date: k, opening: Math.round(o * 100) / 100, inflow: Math.round(d.inflow * 100) / 100,
        outflow: Math.round(d.outflow * 100) / 100, net: Math.round((d.inflow - d.outflow) * 100) / 100,
        closing: Math.round(run * 100) / 100 };
    });
    return {
      from: '', to: '', locationId: (p && p.locationId) || '', method: method,
      opening: opening,
      openingDetail: { base: 100000, asOf: dayStr(new Date(Date.now() - 60 * 864e5)), entries: 18,
        movements: 25000, basis: 'settings balance as on ' + dayStr(new Date(Date.now() - 60 * 864e5)) + ' + 18 purani entries' },
      inflow: Math.round(inflow * 100) / 100, outflow: Math.round(outflow * 100) / 100,
      expensesTotal: Math.round(expTotal * 100) / 100,
      closing: Math.round((opening + inflow - outflow) * 100) / 100,
      byMethod: Object.keys(byMethod).sort().map(k => byMethod[k]),
      days: days, entries: entries,
      payments: entries.filter(e => e.kind === 'PAYMENT'),
      expenses: entries.filter(e => e.kind === 'EXPENSE'),
      generatedAt: new Date().toISOString()
    };
  },

  'reports.export': p => ({ csv: 'demo,export\n1,2', filename: (p.type || 'report') + '.csv' }),
  /* v2.5.1: sheets / DB schema health + repair (demo) */
  'setup.health': () => {
    const names = ['Items', 'Stock', 'Sales', 'SaleItems', 'Customers', 'Suppliers', 'Ledger',
      'Payments', 'Expenses', 'CashSessions', 'Accounts', 'Journals', 'JournalLines',
      'CountSheets', 'CountLines', 'Notifications', 'PurchaseOrders', 'GRN', 'Users', 'AuditLog'];
    const rowCounts = { Items: 71, Stock: 213, Sales: 128, SaleItems: 342, Customers: 24,
      Suppliers: 6, Ledger: 96, Payments: 74, Expenses: 18, CashSessions: 12, Accounts: 22,
      Journals: 64, JournalLines: 148, CountSheets: 4, CountLines: 60, Notifications: 9,
      PurchaseOrders: 11, GRN: 9, Users: 9, AuditLog: 420 };
    return {
      sheets: 67, present: 67, missingSheets: [], missingColumns: {}, missingColumnCount: 0,
      rowCounts, totalRows: Object.keys(rowCounts).reduce((a, k) => a + rowCounts[k], 0),
      columns: 824, healthy: true
    };
  },
  'setup.repair': () => ({ created: 0, columnsAdded: 0,
    before: { missingSheets: 0, missingColumns: 0 }, after: { missingSheets: 0, missingColumns: 0 },
    healthy: true, sheets: 67, totalRows: 1814 }),

  /* ------------- v2.5: wallet gateway (EasyPaisa / JazzCash) ------------- */
  /* ------------- v2.5: warehouse app — count sheets & audit --------------- */
  'warehouse.count.create': p => {
    let rows = MockAPI['warehouse.stockByBin']({ locationId: (p && p.locationId) || '' });
    if (p && p.q) { const q = String(p.q).toLowerCase();
      rows = rows.filter(r => (r.code + ' ' + r.name).toLowerCase().indexOf(q) > -1); }
    if (p && p.category) rows = rows.filter(r => r.category === p.category);
    if (p && p.zeroOnly) rows = rows.filter(r => Number(r.qty) <= 0);
    if (p && p.lowStockOnly) rows = rows.filter(r => Number(r.qty) > 0 && Number(r.qty) <= 5);
    if (!rows.length) throw new Error('Is scope mein koi item nahi mila.');
    const sheet = {
      id: 'CNT' + (++COUNT_SEQ), sheetNo: 'CNT-0000' + COUNT_SEQ,
      date: new Date().toISOString().slice(0, 10), locationId: (p && p.locationId) || 'LOC-SDQ',
      warehouseId: (p && p.warehouseId) || '', binId: (p && p.binId) || '',
      category: (p && p.category) || '', q: (p && p.q) || '',
      scope: [p && p.warehouseId ? 'warehouse' : null, p && p.binId ? 'bin' : null,
        p && p.category ? p.category : null].filter(Boolean).join(' · ') || 'all stock',
      assignedTo: (p && p.assignedTo) || '', status: 'DRAFT', notes: (p && p.notes) || '',
      lines: rows.length, counted: 0, diffLines: 0, varianceValue: 0, adjustmentId: '',
      createdBy: 'demo', createdAt: new Date().toISOString()
    };
    COUNT_SHEETS.unshift(sheet);
    sheet.__lines = rows.slice(0, 60).map(r => ({
      id: 'CNL' + (++COUNTLINE_SEQ), sheetId: sheet.id, itemId: r.itemId, code: r.code, name: r.name,
      binId: r.binId || '', binCode: r.binCode || '', systemQty: Number(r.qty), countedQty: '',
      diff: 0, avgCost: Number(r.avgCost), varianceValue: 0, note: '', countedAt: '', countedBy: ''
    }));
    return MockAPI['warehouse.count.get']({ id: sheet.id });
  },
  'warehouse.count.get': p => {
    const sheet = COUNT_SHEETS.find(r => r.id === p.id);
    if (!sheet) throw new Error('Count sheet nahi mili');
    const lines = sheet.__lines || [];
    const counted = lines.filter(r => r.countedQty !== '' && r.countedQty !== null && r.countedQty !== undefined);
    const diffs = lines.filter(r => Number(r.diff) !== 0);
    return { sheet, lines, progress: { total: lines.length, counted: counted.length,
      pending: lines.length - counted.length, diffLines: diffs.length,
      over: diffs.filter(r => Number(r.diff) > 0).length, short: diffs.filter(r => Number(r.diff) < 0).length,
      varianceValue: money(diffs.reduce((a, r) => a + Number(r.varianceValue), 0)),
      pct: lines.length ? Number((counted.length / lines.length * 100).toFixed(1)) : 0 } };
  },
  'warehouse.count.list': p => COUNT_SHEETS.filter(s => !p || !p.status || s.status === p.status),
  'warehouse.count.setQty': p => {
    let found = null;
    COUNT_SHEETS.forEach(sh => (sh.__lines || []).forEach(l => { if (l.id === p.id) found = { sh, l }; }));
    if (!found) throw new Error('Line nahi mili');
    if (found.sh.status === 'POSTED') throw new Error('Posted sheet edit nahi ho sakti.');
    const counted = (p.countedQty === '' || p.countedQty === null || p.countedQty === undefined)
      ? '' : Number(p.countedQty);
    found.l.countedQty = counted;
    found.l.diff = counted === '' ? 0 : Number((counted - Number(found.l.systemQty)).toFixed(3));
    found.l.varianceValue = money(found.l.diff * Number(found.l.avgCost));
    found.l.countedAt = new Date().toISOString();
    const lines = found.sh.__lines || [];
    const c = lines.filter(r => r.countedQty !== '' && r.countedQty !== null && r.countedQty !== undefined);
    found.sh.counted = c.length;
    found.sh.diffLines = lines.filter(r => Number(r.diff) !== 0).length;
    found.sh.varianceValue = money(lines.reduce((a, r) => a + Number(r.varianceValue), 0));
    found.sh.status = c.length ? 'COUNTING' : 'DRAFT';
    return found.l;
  },
  'warehouse.count.bulk': p => {
    const out = { updated: 0, notFound: [] };
    (p.rows || []).forEach(r => {
      let line = null;
      COUNT_SHEETS.forEach(sh => (sh.__lines || []).forEach(l => {
        if (sh.id === p.id && (l.itemId === r.itemId || String(l.code).toUpperCase() === String(r.code || '').toUpperCase())) line = l;
      }));
      if (!line) { out.notFound.push(r.code || r.itemId); return; }
      MockAPI['warehouse.count.setQty']({ id: line.id, countedQty: r.countedQty, note: r.note || '' });
      out.updated++;
    });
    return out;
  },
  'warehouse.count.post': p => {
    const sheet = COUNT_SHEETS.find(r => r.id === p.id);
    if (!sheet) throw new Error('Count sheet nahi mili');
    if (sheet.status === 'POSTED') throw new Error('Ye sheet pehle hi post ho chuki hai.');
    const counted = (sheet.__lines || []).filter(r => r.countedQty !== '' && r.countedQty !== null && r.countedQty !== undefined);
    if (!counted.length) throw new Error('Koi line count hi nahi hui.');
    const adj = MockAPI['stock.adjust.save']({ adjustment: {
      date: new Date().toISOString().slice(0, 10), locationId: sheet.locationId,
      reason: 'Cycle count ' + sheet.sheetNo,
      items: counted.map(l => ({ itemId: l.itemId, countedQty: Number(l.countedQty), cost: l.avgCost })) } });
    MockAPI['stock.adjust.post']({ id: adj.id });
    sheet.status = 'POSTED'; sheet.adjustmentId = adj.id; sheet.postedAt = new Date().toISOString();
    return { sheet, adjustment: adj, lines: counted.length,
      varianceValue: money(counted.reduce((a, r) => a + Number(r.varianceValue), 0)) };
  },
  'warehouse.count.cancel': p => {
    const sheet = COUNT_SHEETS.find(r => r.id === p.id);
    if (!sheet) throw new Error('Count sheet nahi mili');
    if (sheet.status === 'POSTED') throw new Error('Posted sheet cancel nahi ho sakti.');
    sheet.status = 'CANCELLED';
    return sheet;
  },
  'warehouse.audit': p => {
    const lines = [];
    COUNT_SHEETS.forEach(sh => (sh.__lines || []).forEach(l => lines.push(l)));
    const counted = lines.filter(r => r.countedQty !== '' && r.countedQty !== null && r.countedQty !== undefined);
    const diffs = counted.filter(r => Number(r.diff) !== 0);
    const adjustRows = MockAPI['stock.adjust.list']({});
    return {
      sheets: COUNT_SHEETS.length,
      posted: COUNT_SHEETS.filter(r => r.status === 'POSTED').length,
      open: COUNT_SHEETS.filter(r => r.status === 'DRAFT' || r.status === 'COUNTING').length,
      lines: lines.length, counted: counted.length, matched: counted.length - diffs.length,
      diffLines: diffs.length, over: diffs.filter(r => Number(r.diff) > 0).length,
      short: diffs.filter(r => Number(r.diff) < 0).length,
      accuracy: counted.length ? Number(((counted.length - diffs.length) / counted.length * 100).toFixed(2)) : 0,
      varianceQty: Number(diffs.reduce((a, r) => a + Number(r.diff), 0).toFixed(3)),
      varianceValue: money(diffs.reduce((a, r) => a + Number(r.varianceValue), 0)),
      adjustments: adjustRows, adjustmentsValue: 0, sheetsList: COUNT_SHEETS.slice(0, 50),
      topVariance: diffs.slice().sort((a, b) => Math.abs(b.varianceValue) - Math.abs(a.varianceValue)).slice(0, 20)
    };
  },

  /* ------------- v2.5: order book (mobile order taking) ------------------- */
  'orders.save': p => {
    const o = p.order || p || {};
    const items = (o.items || []).map(l => {
      const it = ITEMS.find(i => i.id === l.itemId) || {};
      const qty = Number(l.qty || 0);
      const price = Number(l.price || it.retailPrice || 0);
      const disc = Number(l.discount || 0);
      const base = money(price * qty - disc);
      return { id: 'ORDI' + Math.random().toString(36).slice(2, 8), orderId: '', itemId: l.itemId,
        code: it.code || '', name: it.name || '', qty, price, cost: Number(it.costPrice || 0),
        discount: disc, taxRate: Number(l.taxRate || it.taxRate || 0), tax: 0,
        lineBase: base, lineTotal: base, note: l.note || '', unit: it.unit || 'pcs' };
    });
    if (!items.length) throw new Error('Kam az kam ek item zaroori hai.');
    const subtotal = money(items.reduce((a, l) => a + l.lineBase, 0));
    const disc = money(items.reduce((a, l) => a + l.discount, 0) + Number(o.discount || 0));
    const total = Math.max(0, money(subtotal - Number(o.discount || 0)));
    const advance = Number(o.advance || 0);
    if (advance > total) throw new Error('Advance total se zyada nahi ho sakta.');
    if (o.id) {
      const rec = ORDERS.find(r => r.id === o.id);
      if (!rec) throw new Error('Order nahi mila');
      if (rec.status === 'INVOICED') throw new Error('Invoiced order edit nahi ho sakti.');
      Object.assign(rec, { customerId: o.customerId || '', customerName: o.customerName || 'Walk-in Customer',
        phone: o.phone || '', expectedDate: o.expectedDate || '', subtotal, discount: disc, total,
        advance, balance: money(total - advance), notes: o.notes || '',
        updatedAt: new Date().toISOString() });
      rec.items = items.map(i => Object.assign(i, { orderId: rec.id }));
      return MockAPI['orders.get']({ id: rec.id });
    }
    const rec = {
      id: 'ORD' + (++ORDER_SEQ), orderNo: 'ORD-0000' + ORDER_SEQ,
      date: o.date || new Date().toISOString().slice(0, 10), expectedDate: o.expectedDate || '',
      customerId: o.customerId || '', customerName: o.customerName || 'Walk-in Customer',
      phone: o.phone || '', address: o.address || '',
      locationId: o.locationId || 'LOC-SDQ', salespersonId: 'USR-OWNER',
      status: String(o.status || 'DRAFT').toUpperCase(), priority: String(o.priority || 'NORMAL').toUpperCase(),
      channel: String(o.channel || 'FIELD').toUpperCase(), subtotal, discount: disc, tax: 0, total,
      advance, balance: money(total - advance), saleId: '', invoiceNo: '', notes: o.notes || '',
      source: 'MOBILE', createdBy: 'demo',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    rec.items = items.map(i => Object.assign(i, { orderId: rec.id }));
    ORDERS.unshift(rec);
    return MockAPI['orders.get']({ id: rec.id });
  },
  'orders.get': p => {
    const o = ORDERS.find(r => r.id === p.id);
    if (!o) throw new Error('Order nahi mila');
    const cust = o.customerId ? (CUSTOMERS.find(c => c.id === o.customerId) || null) : null;
    return { order: o, items: o.items || [], customer: cust,
      summary: { lines: (o.items || []).length, qty: (o.items || []).reduce((a, l) => a + l.qty, 0),
        subtotal: o.subtotal, discount: o.discount, tax: o.tax, total: o.total,
        advance: o.advance, balance: o.balance },
      actions: { canEdit: o.status !== 'INVOICED', canConfirm: o.status === 'DRAFT',
        canConvert: o.status !== 'INVOICED' && o.status !== 'CANCELLED',
        canCancel: o.status !== 'INVOICED' && o.status !== 'CANCELLED' } };
  },
  'orders.list': p => ORDERS.filter(o => !p || !p.status || o.status === String(p.status).toUpperCase()),
  'orders.summary': () => {
    const byStatus = {};
    ORDERS.forEach(o => { byStatus[o.status] = (byStatus[o.status] || 0) + 1; });
    const today = new Date().toISOString().slice(0, 10);
    return { total: ORDERS.length, byStatus,
      openValue: money(ORDERS.filter(o => o.status !== 'INVOICED' && o.status !== 'CANCELLED')
        .reduce((a, o) => a + o.total, 0)),
      advance: money(ORDERS.reduce((a, o) => a + o.advance, 0)),
      today: ORDERS.filter(o => String(o.date).slice(0, 10) === today).length };
  },
  'orders.status': p => {
    const o = ORDERS.find(r => r.id === p.id);
    if (!o) throw new Error('Order nahi mila');
    if (o.status === 'INVOICED') throw new Error('Invoiced order ka status nahi badalta.');
    o.status = String(p.status).toUpperCase();
    o.updatedAt = new Date().toISOString();
    return o;
  },
  'orders.convert': p => {
    const o = ORDERS.find(r => r.id === p.id);
    if (!o) throw new Error('Order nahi mila');
    if (o.status === 'INVOICED') throw new Error('Ye order pehle hi invoice ho chuki hai.');
    const advance = Number(p.advance || o.advance || 0);
    const sale = MockAPI['sales.create']({ sale: {
      locationId: o.locationId, customerId: o.customerId, customerName: o.customerName,
      items: (o.items || []).map(l => ({ itemId: l.itemId, qty: l.qty, price: l.price, discount: l.discount })),
      discount: 0,
      payments: advance > 0 ? [{ method: p.method || 'CASH', amount: advance }] : [],
      notes: 'Order ' + o.orderNo, source: 'ORDER' } });
    o.status = 'INVOICED'; o.saleId = sale.id; o.invoiceNo = sale.invoiceNo;
    o.updatedAt = new Date().toISOString();
    return { order: o, sale: sale };
  },
  'orders.remove': p => {
    const i = ORDERS.findIndex(r => r.id === p.id);
    if (i < 0) throw new Error('Order nahi mila');
    if (ORDERS[i].status !== 'DRAFT') throw new Error('Sirf DRAFT order delete ho sakti hai.');
    ORDERS.splice(i, 1);
    return { deleted: true, id: p.id };
  },

  'wallet.providers': () => WALLET_PROVIDERS.map(p => Object.assign({}, p)),
  'wallet.initiate': p => {
    const prov = WALLET_PROVIDERS.find(x => x.id === String(p.provider || p.methodId || '').toUpperCase());
    if (!prov) throw new Error('Unknown wallet provider');
    const amount = Number(p.amount || 0);
    if (!(amount > 0)) throw new Error('Amount zaroori hai');
    const msisdn = String(p.payerMobile || '').replace(/[^\d+]/g, '');
    if (!/^(03\d{9}|\+?92\d{10})$/.test(msisdn)) throw new Error('Bhejne wale ka mobile sahi nahi (03xxxxxxxxx)');
    if (prov.maxAmount && amount > prov.maxAmount) throw new Error('Max limit ' + prov.maxAmount + ' hai');
    const orderId = 'WP' + String(Date.now()).slice(-10);
    const rec = {
      id: 'WTX' + (++WALLET_SEQ), date: new Date().toISOString().slice(0, 10),
      provider: prov.id, flow: String(p.flow || (prov.id === 'EASYPAISA' ? 'MA' : 'MWALLET')),
      orderId, amount: money(amount), payerMobile: msisdn, receiverMobile: String(p.receiverMobile || prov.receiverMobile || ''),
      email: String(p.email || ''), status: 'PENDING', providerRef: '', token: 'TKN' + (1000 + WALLET_SEQ),
      tokenExpiry: new Date(Date.now() + 30 * 60000).toISOString(), responseCode: '0000',
      responseDesc: 'OTP bhej diya gaya', transactionStatus: 'PENDING',
      saleId: String(p.saleId || ''), paymentId: String(p.paymentId || ''),
      refType: String(p.refType || ''), refId: String(p.refId || ''), note: String(p.note || ''),
      mode: prov.mode, attempts: 0, createdAt: new Date().toISOString()
    };
    WALLET_TXNS.unshift(rec);
    return {
      walletId: rec.id, orderId, status: 'PENDING', provider: prov.id, mode: prov.mode,
      flow: rec.flow, providerRef: '', token: rec.token, tokenExpiry: rec.tokenExpiry,
      amount: rec.amount, payerMobile: rec.payerMobile, receiverMobile: rec.receiverMobile,
      message: rec.responseDesc, manual: false
    };
  },
  'wallet.inquire': p => {
    const rec = WALLET_TXNS.find(r => r.id === p.id) || WALLET_TXNS.find(r => r.orderId === p.orderId);
    if (!rec) throw new Error('Wallet request nahi mili');
    if (rec.status !== 'PENDING' && rec.status !== 'INITIATED') {
      return { walletId: rec.id, orderId: rec.orderId, status: rec.status, provider: rec.provider,
        amount: rec.amount, providerRef: rec.providerRef, message: rec.responseDesc, final: true };
    }
    rec.attempts = (rec.attempts || 0) + 1;
    /* demo: 2nd check par paid (asli gateway mein customer OTP confirm karta hai) */
    if (rec.attempts >= 2) {
      rec.status = 'PAID';
      rec.transactionStatus = 'PAID';
      rec.providerRef = (rec.provider === 'EASYPAISA' ? 'EP' : 'JC') + String(Date.now()).slice(-8);
      rec.responseDesc = 'SUCCESS';
    }
    return { walletId: rec.id, orderId: rec.orderId, status: rec.status, provider: rec.provider,
      amount: rec.amount, providerRef: rec.providerRef, message: rec.responseDesc,
      final: rec.status !== 'PENDING' };
  },
  'wallet.list': p => {
    let rows = WALLET_TXNS.slice();
    if (p && p.provider) rows = rows.filter(r => r.provider === String(p.provider).toUpperCase());
    if (p && p.status) rows = rows.filter(r => r.status === String(p.status).toUpperCase());
    if (p && p.openOnly) rows = rows.filter(r => ['PENDING', 'INITIATED', 'MANUAL'].indexOf(r.status) > -1);
    return { rows, total: rows.length, pending: rows.filter(r => r.status === 'PENDING').length,
      providers: WALLET_PROVIDERS.map(x => Object.assign({}, x)) };
  },
  'wallet.poll': p => {
    const open = WALLET_TXNS.filter(r => r.status === 'PENDING').slice(0, Number((p && p.limit) || 10));
    open.forEach(r => { r.attempts = (r.attempts || 0) + 2; r.status = 'PAID';
      r.providerRef = (r.provider === 'EASYPAISA' ? 'EP' : 'JC') + String(Date.now()).slice(-8); });
    return { checked: open.length, paid: open.length, failed: 0, pending: 0 };
  },
  'wallet.link': p => {
    const rec = WALLET_TXNS.find(r => r.id === p.id);
    if (!rec) throw new Error('Wallet request nahi mili');
    if (p.saleId) rec.saleId = p.saleId;
    if (p.paymentId) rec.paymentId = p.paymentId;
    if (p.txnId) rec.providerRef = p.txnId;
    return rec;
  },
  'wallet.manual': p => {
    const rec = {
      id: 'WTX' + (++WALLET_SEQ), date: new Date().toISOString().slice(0, 10),
      provider: String(p.provider || p.methodId || 'EASYPAISA').toUpperCase(), flow: 'MA',
      orderId: 'WPM' + String(Date.now()).slice(-8), amount: money(p.amount),
      payerMobile: String(p.payerMobile || ''), receiverMobile: String(p.receiverMobile || ''),
      status: 'MANUAL', providerRef: String(p.txnId || ''), responseDesc: 'Manual entry',
      createdAt: new Date().toISOString()
    };
    WALLET_TXNS.unshift(rec);
    return rec;
  },
  'wallet.checkout': p => ({
    provider: String(p.provider || p.methodId || 'EASYPAISA').toUpperCase(),
    url: 'https://easypay.easypaisa.com.pk/easypay/Index.jsf', method: 'POST',
    fields: { storeId: '0000', orderRefNum: 'WP' + String(Date.now()).slice(-8),
      transactionAmount: money(p.amount), postBackURL: String(p.postBackUrl || '') },
    orderId: 'WP' + String(Date.now()).slice(-8), amount: money(p.amount)
  }),
  'wallet.fees': p => MockAPI['pay.compute']({ amount: p.amount, method: p.provider || p.methodId }),
  'wallet.summary': () => ({
    total: WALLET_TXNS.length,
    pending: WALLET_TXNS.filter(r => r.status === 'PENDING').length,
    paid: WALLET_TXNS.filter(r => r.status === 'PAID').length,
    paidAmount: money(WALLET_TXNS.filter(r => r.status === 'PAID').reduce((a, r) => a + r.amount, 0)),
    failed: WALLET_TXNS.filter(r => r.status === 'FAILED').length,
    byStatus: WALLET_TXNS.reduce((a, r) => (a[r.status] = (a[r.status] || 0) + 1, a), {}),
    byProvider: WALLET_TXNS.reduce((a, r) => (a[r.provider] = (a[r.provider] || 0) + 1, a), {})
  }),


  'barcode.generate': p => ({ value: p.value || 'HA' + Date.now().toString(36).toUpperCase(), type: 'CODE128', qrPayload: 'HA:' + (p.value || '') }),
  'barcode.lookup': p => MockAPI['items.byBarcode'](p),

  'audit.search': () => [
    { id: 'LOG1', ts: new Date().toISOString(), username: 'owner', action: 'LOGIN', entity: 'Users', entityId: 'USR1', before: null, after: { ok: true }, locationId: 'LOC-SDQ' },
    { id: 'LOG2', ts: new Date(Date.now() - 600e3).toISOString(), username: 'manager', action: 'CREATE', entity: 'Sales', entityId: 'SAL123', before: null, after: { total: 4200 }, locationId: 'LOC-SDQ' }
  ],
  'audit.trail': () => [],

  'offline.pull': () => ({
    items: ITEMS.map((i, ix) => { const sup = SUPPLIERS[ix % SUPPLIERS.length] || {};
      return { id: i.id, code: i.code, name: i.name, nameUr: '', cat: i.category, sub: i.subCategory || '',
      brand: i.brand, unit: i.unit, bc: i.barcode, alt: '', cp: i.costPrice, rp: i.retailPrice, wp: i.wholesalePrice,
      mp: i.minPrice, tx: 0, qty: i.stock, rack: i.rack, img: i.imageUrl || '',
      sp: sup.id || '', sup: sup.name || '', reorder: Number(i.reorderLevel || i.minStock || 0) }; }),
    customers: CUSTOMERS.map(c => ({ id: c.id, code: c.code, name: c.name, phone: c.phone, typeId: c.customerTypeId, bal: c.balance })),
    settings: SETTINGS, locations: LOCATIONS, locationId: 'LOC-SDQ', ts: new Date().toISOString(), itemCount: ITEMS.length
  }),
  /* v2.30.0 (N9) — asli offline sync mirror (OfflineSync.gs jaisa): har entry
     asli MockAPI route par chalti hai, OfflineQueue ledger generic dedupe karta
     hai (DONE clientId dobara NAHI chalta) — demo bhi production jaisa hi. */
  'offline.sync': p => {
    const queue = p.queue || [];
    if (!window.__OFF_LEDGER) window.__OFF_LEDGER = [];
    const results = queue.map(entry => {
      const out = { clientId: entry.clientId, ok: true };
      if (window.__OFF_LEDGER.some(r => String(r.clientId) === String(entry.clientId) && r.status === 'DONE')) {
        out.duplicate = true; return out;
      }
      try {
        const fn = MockAPI[entry.action];
        if (!fn) throw new Error('Unknown action ' + entry.action);
        const payload = Object.assign({}, entry.payload || {}, { offlineId: entry.clientId, source: 'OFFLINE' });
        out.data = fn(payload);
        window.__OFF_LEDGER.push({ id: 'OFF' + Math.random().toString(36).slice(2, 8),
          clientId: entry.clientId, action: entry.action, status: 'DONE',
          receivedAt: entry.createdAt || new Date().toISOString(), processedAt: new Date().toISOString() });
      } catch (e) {
        out.ok = false; out.error = String(e.message || e);
        window.__OFF_LEDGER.push({ id: 'OFF' + Math.random().toString(36).slice(2, 8),
          clientId: entry.clientId, action: entry.action, status: 'FAILED', error: out.error,
          receivedAt: entry.createdAt || new Date().toISOString(), processedAt: new Date().toISOString() });
      }
      return out;
    });
    return { received: queue.length,
      succeeded: results.filter(r => r.ok).length,
      failed: results.filter(r => !r.ok).length, results };
  },

  'utils.stats': () => ({ Items: ITEMS.length, Sales: SALES.length, SaleItems: SALES.length * 2, Customers: CUSTOMERS.length,
    Suppliers: SUPPLIERS.length, Stock: ITEMS.length * 3, StockMoves: 400, GRN: 12, PurchaseOrders: 8, Payments: 320, AuditLog: 1500 }),
  'utils.backup': () => ({ url: '#', fileId: 'demo' }),
  'utils.reindex': () => ({ kept: 0, removed: 0 }),
  'utils.deleteData': () => ({ removed: 0 }),

  /* ===================== v2: CONFIG / WAREHOUSE / NOTIFICATIONS ===================== */
  'config.all': () => SETTINGS,
  'config.get': p => (SETTINGS[p.key] !== undefined ? SETTINGS[p.key] : p.def),
  'config.save': p => { Object.assign(SETTINGS, p.values || {}); mockPersistSettings();
    return { saved: Object.keys(p.values || {}).length }; },
  'config.resetGroup': p => ({ reset: p.group || 'all', note: 'demo: group defaults session-level' }),
  'config.defs': () => CONFIG_DEFS_DEMO,

  'config.list': p => {
    const e = String(p.entity || '').toLowerCase();
    if (e.indexOf('categor') === 0) return CATEGORIES;
    if (e.indexOf('brand') === 0) return BRANDS;
    if (e.indexOf('unit') === 0) return UNITS;
    if (e.indexOf('tax') === 0) return TAXES;
    if (e.indexOf('warehouse') === 0) return WAREHOUSES;
    return [];
  },
  'config.list.save': p => {
    const e = String(p.entity || '').toLowerCase();
    const rec = p.record || p;
    if (!rec.id) rec.id = 'LST' + Date.now().toString(36);
    const target = e.indexOf('categor') === 0 ? CATEGORIES : e.indexOf('brand') === 0 ? BRANDS
      : e.indexOf('unit') === 0 ? UNITS : e.indexOf('tax') === 0 ? TAXES : WAREHOUSES;
    const i = target.findIndex(x => x.id === rec.id);
    if (i > -1) target[i] = Object.assign(target[i], rec); else target.push(rec);
    return rec;
  },
  'config.list.remove': p => {
    const e = String(p.entity || '').toLowerCase();
    const target = e.indexOf('categor') === 0 ? CATEGORIES : e.indexOf('brand') === 0 ? BRANDS
      : e.indexOf('unit') === 0 ? UNITS : e.indexOf('tax') === 0 ? TAXES : WAREHOUSES;
    const i = target.findIndex(x => x.id === p.id); if (i > -1) target.splice(i, 1);
    return { removed: 1 };
  },

  'config.fields.list': p => (p.entity ? CUSTOM_FIELDS.filter(f => f.entity === p.entity) : CUSTOM_FIELDS),
  'config.fields.save': p => {
    const f = p.field || p;
    if (!f.id) f.id = 'CF' + Date.now().toString(36);
    const i = CUSTOM_FIELDS.findIndex(x => x.id === f.id);
    if (i > -1) CUSTOM_FIELDS[i] = Object.assign(CUSTOM_FIELDS[i], f); else CUSTOM_FIELDS.push(f);
    return f;
  },
  'config.fields.remove': p => {
    const i = CUSTOM_FIELDS.findIndex(x => x.id === p.id); if (i > -1) CUSTOM_FIELDS.splice(i, 1);
    return { removed: 1 };
  },

  'config.menu': () => MENU_CONFIG,
  'config.menu.save': p => { const it = p.item || p; if (!it.id) it.id = 'MNU' + Date.now().toString(36);
    const i = MENU_CONFIG.findIndex(x => x.id === it.id);
    if (i > -1) MENU_CONFIG[i] = Object.assign(MENU_CONFIG[i], it); else MENU_CONFIG.push(it); return it; },
  'config.menu.remove': p => { const i = MENU_CONFIG.findIndex(x => x.id === p.id); if (i > -1) MENU_CONFIG.splice(i, 1); return { removed: 1 }; },
  'config.menu.reset': () => { MENU_CONFIG.length = 0; return { reset: true }; },

  'config.templates': p => TEMPLATES.filter(t => !p.type || t.type === p.type),
  'config.templates.save': p => { const t = p.template || p; if (!t.id) t.id = 'TPL' + Date.now().toString(36);
    const i = TEMPLATES.findIndex(x => x.id === t.id); if (i > -1) TEMPLATES[i] = t; else TEMPLATES.push(t); return t; },

  'config.views.list': () => [], 'config.views.save': p => p.view || p, 'config.views.remove': () => ({}),

  'items.facets': () => ({
    categories: Array.from(new Set(ITEMS.map(i => i.category).filter(Boolean))),
    brands: Array.from(new Set(ITEMS.map(i => i.brand).filter(Boolean))),
    makes: Array.from(new Set(ITEMS.map(i => i.make).filter(Boolean))),
    partTypes: Array.from(new Set(ITEMS.map(i => i.partType).filter(Boolean)))
  }),
  'items.prices.get': () => [], 'items.prices.save': () => ({}),
  'items.bulkSave': p => ({ created: (p.items || []).length, updated: 0, errors: [] }),
  'items.changeCode': p => ({ updated: 1, code: p.newCode }),

  /* v2.5.2: CSV ↔ DB milan (demo: catalogue aur demo items ka muqabla) */
  'setup.auditProducts': () => {
    const byCode = {}; ITEMS.forEach(i => { byCode[String(i.code || '').toLowerCase()] = i; });
    const missing = PRODUCT_SEED.filter(p => !byCode[String(p.c || '').toLowerCase()]).map(p => p.c);
    const priceDiff = PRODUCT_SEED.filter(p => {
      const it = byCode[String(p.c || '').toLowerCase()];
      return it && (Number(it.retailPrice) !== Number(p.rp) || Number(it.costPrice) !== Number(p.cp));
    }).map(p => p.c);
    return { csv: PRODUCT_SEED.length, missing: missing.length, missingCodes: missing.slice(0, 50),
             priceDiff: priceDiff.length, priceSamples: priceDiff.slice(0, 20) };
  },
  'setup.seedProducts': p => ({ created: PRODUCT_SEED ? PRODUCT_SEED.length : 0, updated: 0, total: PRODUCT_SEED ? PRODUCT_SEED.length : 0,
    items: (PRODUCT_SEED || []).slice(0, 50) }),

  'warehouse.list': () => WAREHOUSES,
  'warehouse.save': p => { const w = p.warehouse || p; if (!w.id) w.id = 'WH' + Date.now().toString(36);
    const i = WAREHOUSES.findIndex(x => x.id === w.id); if (i > -1) WAREHOUSES[i] = w; else WAREHOUSES.push(w); return w; },
  'warehouse.bins': p => BINS.filter(b => !p.warehouseId || b.warehouseId === p.warehouseId),
  'warehouse.bin.save': p => { const b = p.bin || p; if (!b.id) b.id = 'BIN' + Date.now().toString(36);
    const i = BINS.findIndex(x => x.id === b.id); if (i > -1) BINS[i] = b; else BINS.push(b); return b; },
  'warehouse.stockByBin': () => ITEMS.slice(0, 24).map((it, k) => ({
    itemId: it.id, code: it.code, name: it.name, binId: BINS[k % BINS.length].id,
    binCode: BINS[k % BINS.length].code, locationId: 'LOC-SDQ',
    qty: Math.max(0, Math.round(it.stock / 2)), avgCost: it.costPrice, value: money(Math.round(it.stock / 2) * it.costPrice)
  })),
  'warehouse.putaway': p => { const it = ITEMS.find(x => x.id === p.itemId); if (it) it.binId = p.binId; return { ok: true }; },
  'warehouse.binTransfer': p => ({ ok: true, moved: p.qty || 0 }),
  'warehouse.countSheet': () => ({ rows: ITEMS.slice(0, 30).map(it => ({
    itemId: it.id, code: it.code, name: it.name, binCode: 'A-01',
    systemQty: it.stock, countedQty: '', avgCost: it.costPrice })) }),
  'warehouse.lots': () => [], 'warehouse.lot.receive': p => ({ id: 'LOT' + Date.now().toString(36) }),
  'warehouse.overview': () => ({
    warehouses: WAREHOUSES.length, bins: BINS.length,
    totalQty: ITEMS.reduce((a, i) => a + i.stock, 0),
    totalValue: money(ITEMS.reduce((a, i) => a + i.stock * i.costPrice, 0)),
    lowStock: ITEMS.filter(i => i.stock > 0 && i.stock <= (i.reorderLevel || i.minStock || 5)).length,
    outOfStock: ITEMS.filter(i => i.stock <= 0).length,
    unassigned: ITEMS.filter(i => !i.binId).length,
    byWarehouse: WAREHOUSES.map(w => ({ id: w.id, name: w.name, locationId: w.locationId,
      bins: BINS.filter(b => b.warehouseId === w.id).length, skus: ITEMS.length,
      qty: ITEMS.reduce((a, i) => a + i.stock, 0), value: money(ITEMS.reduce((a, i) => a + i.stock * i.costPrice, 0)) }))
  }),

  'notifications.list': () => NOTIFICATIONS,
  'notifications.summary': () => ({ unread: NOTIFICATIONS.filter(n => !n.readAt).length,
    total: NOTIFICATIONS.length, bySeverity: { error: 1, warn: 2, info: 1 },
    latest: NOTIFICATIONS.slice(-5).reverse() }),
  'notifications.read': p => { const n = NOTIFICATIONS.find(x => x.id === p.id); if (n) n.readAt = new Date().toISOString(); return n; },
  'notifications.readAll': () => { NOTIFICATIONS.forEach(n => n.readAt = new Date().toISOString()); return { marked: NOTIFICATIONS.length }; },
  'notifications.generate': () => {
    const before = NOTIFICATIONS.length;
    ITEMS.filter(i => i.stock <= (i.reorderLevel || i.minStock || 5)).slice(0, 5).forEach(i =>
      pushNotif('LOW_STOCK', 'Low stock: ' + i.name, i.name + ' sirf ' + i.stock + ' bache hain', 'WARN'));
    ITEMS.filter(i => i.stock <= 0).slice(0, 3).forEach(i =>
      pushNotif('OUT_OF_STOCK', 'Out of stock: ' + i.name, i.code + ' khatam ho gaya', 'ERR'));
    const due = SALES.filter(s => s.due > 0);
    if (due.length) pushNotif('RECEIVABLE', 'Udhaar baqaya', due.length + ' invoices me Rs ' +
      Math.round(due.reduce((a, s) => a + s.due, 0)).toLocaleString() + ' baqaya hai', 'WARN');
    return { created: NOTIFICATIONS.length - before, added: NOTIFICATIONS.length - before };
  },
  'notifications.clear': () => { const n = NOTIFICATIONS.length; NOTIFICATIONS.length = 0; return { cleared: n }; },

  /* v2.30.5 — LAST definition jeet-ti hai: yahin shop-status sync (demoShopSync) */
  'cash.session.current': () => {
    demoShopSync();
    if (!window.__demoSessionOpen || !CASH_SESSION || CASH_SESSION.status !== 'OPEN') return null;
    return Object.assign({}, CASH_SESSION, { expectedCash: CASH_SESSION.expectedCash });
  },
  'cash.session.open': p => {
    MockAPI['shop.open']({ openingCash: Number((p || {}).openingCash || 0) });
    demoShopSync();
    CASH_MOVES = [];
    return CASH_SESSION;
  },
  'cash.session.close': p => {
    demoShopSync();
    if (!CASH_SESSION || CASH_SESSION.status !== 'OPEN') throw new Error('Koi open session nahi mili.');
    const expected = CASH_SESSION.expectedCash || 0;
    MockAPI['shop.close']({ closingCash: Number(p.closingCash || 0) });
    demoShopSync();
    CASH_SESSION.closingCash = Number(p.closingCash || 0);
    CASH_SESSION.variance = Math.round((Number(p.closingCash || 0) - expected) * 100) / 100;
    SESSION_HISTORY.unshift(Object.assign({}, CASH_SESSION));
    return CASH_SESSION;
  },
  'cash.session.history': p => (SESSION_HISTORY || []).slice(0, Number((p && p.limit) || 20)),

  'commissions.summary': () => ({ rows: [], total: 0, paid: 0, payable: 0 }),
  'commissions.pay': p => ({ paid: p.amount }),

  'utils.recomputeStock': () => ({ updated: ITEMS.length }),

  /* ===================== v2: AUTO REORDER + LANGUAGE ===================== */
  'reorder.suggest': p => {
    const r = {
      method: SETTINGS.autoReorderMethod || 'VELOCITY',
      lookback: Number(SETTINGS.autoReorderLookback || 30),
      coverageDays: Number(SETTINGS.autoReorderCoverageDays || 30),
      leadTimeDays: Number(SETTINGS.autoReorderLeadTimeDays || 7),
      safetyDays: Number(SETTINGS.autoReorderSafetyDays || 7),
      supplierMode: SETTINGS.autoReorderSupplierMode || 'PRIMARY',
      createAs: SETTINGS.autoReorderCreate || 'DRAFT',
      minOrderValue: Number(SETTINGS.autoReorderMinValue || 0),
      includeZeroSales: String(SETTINGS.autoReorderIncludeSlow) === 'true'
    };
    const sold = {};
    SALES.forEach(sl => (sl.items || []).forEach(li => {
      if (p.locationId && sl.locationId !== p.locationId) return;
      sold[li.itemId] = (sold[li.itemId] || 0) + li.qty;
    }));
    const rows = [];
    ITEMS.forEach(it => {
      const hand = it.stock || 0;
      const vel = (sold[it.id] || 0) / (r.lookback || 30);
      const reorderPoint = Number(it.reorderLevel || it.minStock || 10);
      let target = vel * (r.coverageDays + r.leadTimeDays) + vel * r.safetyDays;
      if (target < reorderPoint) target = reorderPoint;
      let suggested = Math.max(0, Math.ceil(target - hand));
      if (!suggested) return;
      if (!r.includeZeroSales && vel === 0 && hand > 0) return;
      const cost = Number(it.costPrice || 0), value = money(suggested * cost);
      if (value < r.minOrderValue) return;
      const daysOfCover = vel ? Math.round(hand / vel * 10) / 10 : null;
      const supplier = pick(SUPPLIERS);
      let priority = 'REPLENISH';
      if (hand <= 0) priority = 'OUT_OF_STOCK';
      else if (daysOfCover !== null && daysOfCover < r.leadTimeDays) priority = 'CRITICAL';
      else if (hand <= reorderPoint) priority = 'BELOW_REORDER';
      else if (daysOfCover !== null && daysOfCover < r.coverageDays) priority = 'LOW_COVER';
      rows.push({ itemId: it.id, code: it.code, name: it.name, category: it.category, brand: it.brand,
        unit: it.unit || 'PCS', supplierId: supplier.id, supplierName: supplier.name,
        onHand: hand, onOrder: 0, avgDailySales: Math.round(vel * 1000) / 1000,
        daysOfCover, reorderPoint, safetyStock: Math.round(vel * r.safetyDays * 100) / 100,
        targetLevel: Math.round(target), suggestedQty: suggested, cost, value,
        priority, reason: 'Velocity ' + Math.round(vel * 100) / 100 + '/day · cover ' + r.coverageDays + 'd + lead ' + r.leadTimeDays + 'd' });
    });
    const weight = { OUT_OF_STOCK: 0, CRITICAL: 1, BELOW_REORDER: 2, LOW_COVER: 3, REPLENISH: 4 };
    rows.sort((a, b) => (weight[a.priority] - weight[b.priority]) || (b.value - a.value));
    const summary = { items: rows.length, units: rows.reduce((a, x) => a + x.suggestedQty, 0),
      value: money(rows.reduce((a, x) => a + x.value, 0)), byPriority: {}, bySupplier: {} };
    rows.forEach(x => {
      summary.byPriority[x.priority] = (summary.byPriority[x.priority] || 0) + 1;
      summary.bySupplier[x.supplierName] = money((summary.bySupplier[x.supplierName] || 0) + x.value);
    });
    return { rows, rules: r, summary, generatedAt: new Date().toISOString() };
  },
  'reorder.createPOs': p => {
    const lines = p.items || [];
    const bySup = {};
    lines.forEach(l => {
      const it = ITEMS.find(x => x.id === l.itemId) || {};
      const sid = l.supplierId || it.primarySupplierId || (pick(SUPPLIERS) || {}).id;
      bySup[sid] = bySup[sid] || { supplierId: sid, lines: [], total: 0 };
      bySup[sid].lines.push(l);
      bySup[sid].total += Number(l.qty || 0) * Number(l.cost || it.costPrice || 0);
    });
    const created = Object.keys(bySup).map((sid, i) => ({
      id: 'PO' + Date.now() + i, poNo: 'PO-SDQ-' + (2000 + i), date: new Date().toISOString().slice(0, 10),
      supplierId: sid, locationId: p.locationId || 'LOC-SDQ', total: money(bySup[sid].total),
      status: (SETTINGS.autoReorderCreate === 'APPROVE') ? 'APPROVED' : 'DRAFT',
      source: 'AUTO_REORDER', notes: 'Auto reorder', items: bySup[sid].lines
    }));
    created.forEach(po => PORDERS.unshift(po));
    return { created: created.length, purchaseOrders: created, units: lines.length };
  },
  'reorder.run': p => MockAPI['reorder.suggest'](p),

  'lang.all': () => TRANSLATIONS,
  'lang.dict': p => {
    const f = p.lang === 'ur' ? 'ur' : (p.lang === 'roman' ? 'roman' : 'en');
    const out = {};
    Object.keys(TRANSLATIONS).forEach(k => {
      const v = TRANSLATIONS[k][f] || TRANSLATIONS[k].en;
      if (v) out[k] = v;
    });
    return out;
  },
  'lang.save': p => { const row = p.row || p; if (row && row.key) TRANSLATIONS[row.key] = Object.assign({}, TRANSLATIONS[row.key], row); return row; },
  'lang.remove': p => { delete TRANSLATIONS[p.key]; return { removed: 1 }; },
  'lang.seed': () => TRANSLATIONS,
  'lang.reset': () => ({ reset: true }),
  'lang.auto': p => ({ translated: 0, failed: 0, note: 'demo mode — AI key lagane par translations auto bhar jayengi' }),

  /* ---------------- v2.1: per-user language + personal overrides ---------- */
  'lang.prefs': () => Object.assign({ lang: 'en' }, SESSION.prefs || {}),
  'lang.prefs.save': p => {
    const patch = p.prefs || p;
    SESSION.prefs = Object.assign({}, SESSION.prefs || {}, patch || {});
    return SESSION.prefs;
  },
  'lang.myOverrides': () => USER_TRANSLATIONS,
  'lang.dict.user': p => {
    const lang = p.lang || 'en';
    const d = MockAPI['lang.dict']({ lang });
    Object.keys(USER_TRANSLATIONS || {}).forEach(k => {
      const v = (USER_TRANSLATIONS[k] || {})[lang]; if (v) d[k] = v;
    });
    return d;
  },

  /* ---------------- v2.2: print engine ------------------------------------ */
  'print.sizes': () => [
    { id: '58mm', label: 'Thermal 58mm (2")', kind: 'THERMAL', widthMm: 58, cols: 32, marginMm: 2, fontPx: 11 },
    { id: '80mm', label: 'Thermal 80mm (3")', kind: 'THERMAL', widthMm: 80, cols: 48, marginMm: 3, fontPx: 12 },
    { id: '110mm', label: 'Thermal 110mm (4")', kind: 'THERMAL', widthMm: 110, cols: 64, marginMm: 3, fontPx: 12 },
    { id: 'A3', label: 'A3 sheet (297x420mm)', kind: 'SHEET', widthMm: 297, heightMm: 420, fontPx: 13 },
    { id: 'A4', label: 'A4 sheet (210x297mm)', kind: 'SHEET', widthMm: 210, heightMm: 297, fontPx: 12 },
    { id: 'A5', label: 'A5 sheet (148x210mm)', kind: 'SHEET', widthMm: 148, heightMm: 210, fontPx: 11 },
    { id: 'HALF', label: 'Half A4 / small invoice (148x105mm)', kind: 'SHEET', widthMm: 148, heightMm: 105, fontPx: 10 },
    { id: 'LETTER', label: 'US Letter (216x279mm)', kind: 'SHEET', widthMm: 216, heightMm: 279, fontPx: 12 }
  ],
  'print.fieldSchema': p => (p.type === 'LABEL'
    ? ['name', 'code', 'price', 'brand', 'size', 'category', 'mrp', 'barcode', 'qr', 'business', 'logo']
    : ['logo', 'business', 'businessUr', 'branch', 'phone', 'ntn', 'invoiceNo', 'date', 'customer',
       'customerPhone', 'salesman', 'items', 'subtotal', 'discount', 'tax', 'total', 'payments',
       'prevBalance', 'closingBalance', 'change', 'savings', 'barcode', 'qr', 'footer', 'terms', 'signature'])
    .map((k, i) => ({ key: k, label: k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()), def: i < 20 })),
  'print.defaultTemplate': p => ({ id: 'tpl_default', type: p.type || 'RECEIPT',
    name: 'Default ' + (p.paper || '80mm'), active: 'true', paper: p.paper || '80mm',
    json: JSON.stringify({ paper: p.paper || '80mm', copies: 1, fontSize: 12, title: 'SALE RECEIPT',
      showTitle: true, footer: 'Shukriya! Phir aayein.', terms: '', fields: {}, customFields: [],
      table: { showCode: true, showQty: true, showRate: true }, styles: { header: 'center', totals: 'right', boldTotal: true, dashed: true } }) }),
  'print.resolve': p => MockAPI['print.defaultTemplate'](p),
  'print.escpos': p => {
    const sale = SALES.find(s => s.id === p.id) || SALES[0];
    return { base64: 'G0AA', bytes: 128, cols: 48, size: { id: '80mm', widthMm: 80, cols: 48 } };
  },

  /* ---------------- v2.2: AI agent configuration --------------------------- */

  /* ---------------- v2.3: comms (WhatsApp / SMS / Email) ------------------ */
  'comms.providers': () => ({ whatsapp: { provider: SETTINGS['comms.whatsapp.provider'] || 'LINK', ready: true,
      masked: { token: '', twilioSid: '', phoneNumberId: '' } },
    sms: { provider: SETTINGS['comms.sms.provider'] || 'NONE', ready: false },
    email: { provider: SETTINGS['comms.email.provider'] || 'APPS_SCRIPT', ready: true }, countryCode: '92' }),
  'comms.templates': () => ({ invoice: SETTINGS['comms.invoiceTemplate'] || '', reminder: SETTINGS['comms.reminderTemplate'] || '',
    thanks: '', emailSubject: SETTINGS['comms.email.subject'] || '' }),
  'comms.prepare': p => {
    const sale = SALES.find(x => x.id === p.id) || SALES[0] || {};
    const ctx = { customer: sale.customerName || 'Customer', invoiceNo: sale.invoiceNo || 'INV-1',
      date: String(sale.date || '').slice(0, 10), total: 'Rs ' + Number(sale.total || 0).toFixed(2),
      paid: 'Rs ' + Number(sale.paid || 0).toFixed(2), due: 'Rs ' + Number(sale.due || 0).toFixed(2),
      link: '', business: SETTINGS.businessName || 'Haseeb Autos', points: '0' };
    const tpl = SETTINGS['comms.invoiceTemplate'] || 'Invoice {{invoiceNo}} · Total {{total}}';
    const msg = tpl.replace(/\{\{(\w+)\}\}/g, (m, k) => ctx[k] !== undefined ? ctx[k] : '');
    return { ctx, message: msg, link: '', sale, subject: 'Invoice ' + ctx.invoiceNo,
      to: (CUSTOMERS.find(c => c.id === sale.customerId) || {}).phone || '' };
  },
  'comms.send': p => { MESSAGES.push({ id: 'MSG' + MESSAGES.length, date: new Date().toISOString(),
      channel: p.channel, provider: 'LINK', to: p.to, body: p.message, status: 'SENT' });
    return { ok: true, channel: p.channel, to: p.to, provider: 'LINK',
      link: 'https://wa.me/' + String(p.to).replace(/\D/g, '') + '?text=' + encodeURIComponent(p.message), detail: 'demo' }; },
  'comms.shareInvoice': p => MockAPI['comms.send'](Object.assign({ channel: 'WHATSAPP' }, p)),
  'comms.outbox': () => ({ rows: MESSAGES.slice(-100).reverse(), total: MESSAGES.length,
    counts: { sent: MESSAGES.filter(m => m.status === 'SENT').length, failed: 0 } }),
  'comms.retry': () => ({ ok: true, provider: 'LINK' }),

  /* ---------------- v2.3: exports ----------------------------------------- */
  'exports.report': p => ({ format: p.format || 'CSV', url: '#', name: (p.title || 'report') + '.csv', rows: 0, csv: '' }),
  'exports.payload': p => {
    const rows = (REPORT_ROWS[p.kind] || []);
    const headers = rows.length ? Object.keys(rows[0]) : [];
    return { rows, headers, csv: rows.length ? headers.join(',') + '\n' + rows.map(r => headers.map(h => r[h]).join(',')).join('\n') : '',
      html: '<table>' + (rows[0] ? '<tr>' + headers.map(h => '<th>' + h + '</th>').join('') + '</tr>' : '') + '</table>',
      filename: (p.title || p.kind || 'export') + '-' + new Date().toISOString().slice(0, 10) };
  },
  'exports.invoicePdf': p => ({ id: 'demo', url: '#', name: (p.id || 'invoice') + '.pdf', size: 24000 }),
  'exports.sheet': p => ({ id: 'demo', url: '#', name: p.name || 'export', xlsx: '#' }),

  /* ---------------- v2.3: loyalty ----------------------------------------- */
  'loyalty.summary': p => {
    const pts = Number((CUSTOMERS.find(c => c.id === p.customerId) || {}).points || 0);
    const rate = Number(SETTINGS['loyalty.rate'] || 1);
    const capPct = Number(SETTINGS['loyalty.maxRedeemPct'] || 50);
    const cap = p.total ? Math.floor((p.total * capPct / 100) / rate) : pts;
    const usable = Math.max(0, Math.min(pts, cap));
    return { points: pts, value: pts * rate, rate, minRedeem: Number(SETTINGS['loyalty.minRedeem'] || 50),
      maxRedeemPct: capPct, usablePoints: usable, usableValue: usable * rate,
      enabled: String(SETTINGS['loyalty.enabled'] || 'true') !== 'false' };
  },
  'loyalty.balance': p => ({ customerId: p.customerId, balance: Number((CUSTOMERS.find(c => c.id === p.customerId) || {}).points || 0) }),
  'loyalty.redeem': p => { const c = CUSTOMERS.find(x => x.id === p.customerId);
    if (c) c.points = String(Math.max(0, Number(c.points || 0) - Number(p.points || 0)));
    LOYALTY.push({ id: 'LOY' + LOYALTY.length, date: new Date().toISOString(), customerId: p.customerId,
      type: 'REDEEM', points: -Number(p.points || 0), amount: Number(p.points || 0) * Number(SETTINGS['loyalty.rate'] || 1), note: p.note || '' });
    return { points: Number(p.points || 0), value: Number(p.points || 0) * Number(SETTINGS['loyalty.rate'] || 1),
      balance: Number(c ? c.points : 0) }; },
  'loyalty.adjust': p => { LOYALTY.push({ id: 'LOY' + LOYALTY.length, date: new Date().toISOString(),
      customerId: p.customerId, type: p.type || 'ADJUST', points: Number(p.points || 0), note: p.note || '' });
    return { balance: Number((CUSTOMERS.find(c => c.id === p.customerId) || {}).points || 0) }; },
  'loyalty.history': p => ({ rows: LOYALTY.filter(r => r.customerId === p.customerId).slice(-100).reverse(),
    balance: Number((CUSTOMERS.find(c => c.id === p.customerId) || {}).points || 0), lifetime: 0 }),

  /* ---------------- v2.3: price list import ------------------------------- */
  'priceimport.sample': () => 'code,name,brand,cost,retail,wholesale,barcode\nBRK-001,Brake Pad Set,Bosch,620,800,760,8964000123456\nOIL-001,Engine Oil 20W-50,Caltex,980,1200,1150,8964000987654',
  'priceimport.preview': p => {
    const lines = String(p.text || '').replace(/\r/g, '').split('\n').filter(Boolean);
    const header = (lines[0] || '').split(',').map(x => x.trim());
    const map = {};
    header.forEach((hraw, i) => { const h = String(hraw).toLowerCase().trim();
      if (['code', 'sku', 'part no'].includes(h)) map.code = i;
      if (['name', 'description', 'item'].includes(h)) map.name = i;
      if (['cost', 'trade price', 'purchase price'].includes(h)) map.cost = i;
      if (['retail', 'mrp', 'price'].includes(h)) map.retail = i;
      if (['wholesale', 'dealer'].includes(h)) map.wholesale = i;
      if (['brand', 'make'].includes(h)) map.brand = i;
      if (['barcode', 'ean'].includes(h)) map.barcode = i;
    });
    const rows = lines.slice(1).map((ln, i) => {
      const c = ln.split(',').map(x => x.trim());
      const rec = { row: i + 2, code: c[map.code] || '', name: c[map.name] || '', barcode: c[map.barcode] || '',
        cost: Number((c[map.cost] || '0').replace(/[^\d.]/g, '')) || 0,
        retail: Number((c[map.retail] || '0').replace(/[^\d.]/g, '')) || 0,
        wholesale: Number((c[map.wholesale] || '0').replace(/[^\d.]/g, '')) || 0,
        brand: c[map.brand] || '', qty: 0 };
      const match = ITEMS.find(it => (rec.code && it.code === rec.code) || (rec.barcode && it.barcode === rec.barcode) ||
        (rec.name && String(it.name).toLowerCase() === rec.name.toLowerCase()));
      if (match) { rec.matchId = match.id; rec.matchName = match.name; rec.oldCost = Number(match.cost) || 0;
        rec.oldRetail = Number(match.retailPrice) || 0; rec.deltaCost = Math.round((rec.cost - rec.oldCost) * 100) / 100;
        rec.deltaPct = rec.oldCost ? Math.round(rec.deltaCost / rec.oldCost * 10000) / 100 : 0;
        rec.action = 'UPDATE'; rec.reason = 'Matched by code'; }
      else { rec.action = 'SKIP'; rec.reason = 'Match nahi mila'; }
      return rec;
    });
    return { columns: header, mapping: map, rows,
      stats: { total: rows.length, update: rows.filter(r => r.action === 'UPDATE').length,
        create: 0, skip: rows.filter(r => r.action === 'SKIP').length,
        costIncrease: rows.filter(r => r.deltaCost > 0).length, costDecrease: rows.filter(r => r.deltaCost < 0).length,
        avgChangePct: rows.length ? Math.round(rows.reduce((a, r) => a + (r.deltaPct || 0), 0) / rows.length * 100) / 100 : 0 },
      supplierId: p.supplierId || '', fileName: p.fileName || '' };
  },
  'priceimport.apply': p => ({ logId: 'PIM1', updated: (p.rows || []).filter(r => r.action === 'UPDATE').length,
    created: 0, skipped: (p.rows || []).filter(r => r.action !== 'UPDATE').length, errors: [], total: (p.rows || []).length }),
  'priceimport.history': () => [],
  'priceimport.gmail': () => ({ count: 0, attachments: [] }),

  /* ---------------- v2.3: Firebase migration ------------------------------ */
  'migration.assess': () => {
    const tables = ['Items', 'Customers', 'Sales', 'SaleItems', 'Payments', 'StockLedger', 'Ledger']
      .map(t => ({ table: t, rows: ({ Items: ITEMS.length, Customers: CUSTOMERS.length, Sales: SALES.length,
        SaleItems: SALE_ITEMS.length, Payments: PAYMENTS.length, StockLedger: 0, Ledger: LEDGER.length })[t] || 0,
        cols: 12, cells: (({ Items: ITEMS.length, Customers: CUSTOMERS.length, Sales: SALES.length,
        SaleItems: SALE_ITEMS.length, Payments: PAYMENTS.length, Ledger: LEDGER.length })[t] || 0) * 12,
        risk: 'LOW', firestore: t.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase() + 's' }));
    const rows = tables.reduce((a, t) => a + t.rows, 0);
    return { tier: rows > 100000 ? 'MIGRATE' : (rows > 25000 ? 'OPTIMIZE' : 'SHEETS_OK'),
      totals: { rows, cells: rows * 12, bytes: rows * 500, mb: Math.round(rows * 500 / 1048576 * 100) / 100 },
      limits: { sheetsCells: 10000000, appsScriptQuotaMb: 100, maxRowsPerSheet: 5000000 },
      usedPct: Math.round(rows * 12 / 10000000 * 100000) / 1000, tables,
      heavy: tables.filter(t => t.rows > 10000),
      advice: ['Demo data — sheet abhi theek hai.', 'Badi sheet par Firebase migration plan Settings me hai.'],
      config: MockAPI['migration.status']().config };
  },
  'migration.plan': () => ({ target: 'Firestore (Native mode)', region: 'asia-south1',
    collections: [], indexes: [], rules: '', steps: [
      { n: 1, title: 'Firebase project banayein', detail: 'console.firebase.google.com' },
      { n: 2, title: 'Service account key', detail: 'Script Properties me daalein' },
      { n: 3, title: 'Export JSON', detail: 'Settings ▸ Migration' },
      { n: 4, title: 'Import Firestore', detail: 'CLI se import' },
      { n: 5, title: 'Dual-write', detail: 'migration.sync()' },
      { n: 6, title: 'Read switch', detail: 'DB source badlein' },
      { n: 7, title: 'Sheets read-only', detail: 'Archive' }],
    codeNotes: ['DB.gs adapter layer', 'OfflineSync replay'], estimate: { rows: 0, cells: 0, mb: 0, firestoreWrites: 0, firestoreCostNote: '' } }),
  'migration.export': () => ({ folderUrl: '#', folderId: 'demo', manifestUrl: '#', files: [] }),
  'migration.sync': () => ({ pushed: 0, errors: [], since: new Date().toISOString(), mode: 'NONE' }),
  'migration.status': () => ({ config: { mode: 'NONE', ready: false, dbUrl: '', projectId: '', hasToken: false,
      autoSync: String(SETTINGS['migration.autoSync']) === 'true' }, lastSync: [] }),
  'migration.log': () => [],

  /* ---------------- v2.2: payment methods engine -------------------------- */
  'pay.methods': () => (typeof PAY_METHODS === 'undefined' ? [] : PAY_METHODS),
  'pay.methods.enabled': () => (typeof PAY_METHODS === 'undefined' ? [] : PAY_METHODS.filter(m => m.enabled)),
  'pay.compute': p => {
    const amt = Number(p.amount || 0);
    const defs = {
      CASH: { feePct: 0, feeFixed: 0, fedPct: 0, settleDays: 0, label: 'Cash', group: 'CASH', icon: '💵' },
      CARD: { feePct: 2.5, feeFixed: 0, fedPct: 0, settleDays: 2, label: 'Card (POS machine)', group: 'CARD', icon: '💳' },
      BANK: { feePct: 0, feeFixed: 0, fedPct: 0, settleDays: 1, label: 'Bank transfer / IBFT', group: 'BANK', icon: '🏦' },
      JAZZCASH: { feePct: 2, feeFixed: 0, fedPct: 0, settleDays: 2, label: 'JazzCash', group: 'WALLET', icon: '🟣' },
      EASYPAISA: { feePct: 2.5, feeFixed: 0, fedPct: 0, settleDays: 2, label: 'EasyPaisa', group: 'WALLET', icon: '🟢' },
      RAAST: { feePct: 0, feeFixed: 0, fedPct: 0, settleDays: 0, label: 'Raast (instant, free)', group: 'BANK', icon: '⚡' },
      CHEQUE: { feePct: 0, feeFixed: 0, fedPct: 0, settleDays: 2, label: 'Cheque', group: 'CHEQUE', icon: '🧾' },
      CREDIT: { feePct: 0, feeFixed: 0, fedPct: 0, settleDays: 0, label: 'Credit / Udhaar', group: 'CREDIT', icon: '📒' }
    };
    const m = defs[String(p.method || 'CASH').toUpperCase()] || defs.CASH;
    const pct = (SETTINGS['pay.' + String(p.method || 'CASH').toUpperCase() + '.feePct'] !== undefined)
      ? Number(SETTINGS['pay.' + String(p.method || 'CASH').toUpperCase() + '.feePct']) : m.feePct;
    const fee = Math.round((amt * pct / 100) * 100) / 100;
    const fed = Math.round(fee * m.fedPct / 100 * 100) / 100;
    const net = Math.round((amt - fee - fed) * 100) / 100;
    const d = new Date(); d.setDate(d.getDate() + m.settleDays);
    return { method: String(p.method || 'CASH').toUpperCase(), label: m.label, group: m.group,
      icon: m.icon, gross: amt, feePct: pct, feeFixed: m.feeFixed, fee: fee, fedPct: m.fedPct,
      fed: fed, net: net, settleDays: m.settleDays, settleDate: d.toISOString().slice(0, 10),
      postOnClear: m.group === 'CHEQUE', requiresClearing: m.group === 'CHEQUE', requireRef: m.group !== 'CASH' };
  },
  'pay.cheques': () => (PAYMENTS || []).filter(p => p.method === 'CHEQUE')
    .map(p => ({ id: p.id, voucherNo: p.voucherNo, date: p.date, type: p.type, partyName: p.partyName,
      amount: p.amount, chequeNo: p.chequeNo || '', bankName: p.bankName || '',
      status: p.status || 'PENDING', clearingDate: p.clearingDate || '' })),
  'pay.cheque.clear': p => ({ id: p.id, status: p.status || 'CLEARED',
    bounceCharges: Number(p.bounceCharges || 0), clearingDate: new Date().toISOString().slice(0, 10) }),
  'pay.reconcile': () => ({ rows: [], totals: { count: 0, gross: 0, fee: 0, fed: 0, net: 0, pendingAmount: 0 } }),

  /* ---------------- v2.1: scheduled jobs / triggers ----------------------- */
  'system.triggers.status': () => ({
    available: false,               // demo/static build me asli ScriptApp nahi hota
    installed: [], installedCount: 0, lastRun: LAST_JOB_RUN,
    config: {
      reorder: SETTINGS['job.dailyReorder'] !== 'false',
      hour: Number(SETTINGS['job.dailyHour'] || 7),
      autoPO: SETTINGS['job.dailyAutoPO'] === 'true',
      alerts: SETTINGS['job.dailyAlerts'] !== 'false',
      alertsHour: Number(SETTINGS['job.alertsHour'] || 6),
      timezone: SETTINGS['job.timezone'] || 'Asia/Karachi'
    },
    note: 'Real time-driven triggers sirf deployed Apps Script project mein chalte hain.'
  }),
  'system.triggers.install': () => ({ installed: [], skipped: true, note: 'Demo mode — asli triggers deploy ke baad install honge.' }),
  'system.triggers.remove': () => ({ removed: 0, skipped: true }),
  'system.triggers.runNow': p => {
    const sug = MockAPI['reorder.suggest']({ locationId: p.locationId });
    LAST_JOB_RUN.REORDER = new Date().toISOString();
    return { ranAt: new Date().toISOString(), method: SETTINGS.autoReorderMethod || 'VELOCITY',
      locations: [{ locationId: p.locationId || 'LOC-SDQ', name: 'Sadiqabad City',
        items: (sug.rows || []).length, value: (sug.summary || {}).value || 0, purchaseOrders: 0 }],
      items: (sug.rows || []).length, value: (sug.summary || {}).value || 0, created: 0 };
  },
  'system.jobs.runAlerts': () => {
    LAST_JOB_RUN.ALERTS = new Date().toISOString();
    return { ranAt: new Date().toISOString(), created: 2 };
  },

  /* ======================================================================
     v2.7 — DEMO MOCK FIDELITY
     Ye actions ASLI backend (Code.gs) me maujood hain, magar mock me nahi
     thin. Is wajah se demo/static preview me screen "Koi backend connected
     nahi hai" dikhati thi jab ke production me sab theek chalta hai.
     Preview ko production jaisa banane ke liye yahan shamil kiya gaya.
     ====================================================================== */

  /* --- items.categories (warehouse filter dropdown) --- */
  'items.categories': () => {
    const set = {};
    (typeof ITEMS !== 'undefined' ? ITEMS : []).forEach(i => { if (i.category) set[i.category] = 1; });
    return Object.keys(set).sort();
  },

  /* --- config.templates.remove (Settings → Print templates → 🗑) --- */
  'config.templates.remove': p => {
    if (String(p.id || '').indexOf('tpl_') === 0) return { id: p.id, removed: false, builtIn: true };
    return { id: p.id, removed: true };
  },

  /* --- reports.catalog — ASLI backend (ReportEngine.groups) ki shape --- */
  'reports.catalog': () => {
    const CAT = [
      { group: 'Sales', reports: [
        { id: 'sales.summary',    name: 'Sales summary',     nameUr: 'سیلز کا خلاصہ',   icon: '🧾', note: 'Bills, amount, discount, tax', hasDate: true },
        { id: 'sales.byItem',     name: 'Sales by item',     nameUr: 'آئٹم کے حساب سے', icon: '📦', note: 'Item-war quantity aur revenue', hasDate: true },
        { id: 'sales.byCategory', name: 'Sales by category', nameUr: 'کیٹیگری کے حساب', icon: '🗂', note: 'Category-war toot', hasDate: true },
        { id: 'sales.byUser',     name: 'Sales by user',     nameUr: 'یوزر کے حساب سے', icon: '👤', note: 'Cashier / salesman ke hisaab se', hasDate: true }] },
      { group: 'Inventory', reports: [
        { id: 'inv.valuation',    name: 'Stock valuation',   nameUr: 'اسٹاک کی مالیت',  icon: '💎', note: 'Cost aur retail dono par', hasDate: false },
        { id: 'inv.lowStock',     name: 'Low stock',         nameUr: 'کم اسٹاک',        icon: '⚠', note: 'Reorder point se neechay', hasDate: false },
        { id: 'inv.movement',     name: 'Stock movement',    nameUr: 'اسٹاک کی نقل',    icon: '🔄', note: 'Andar / bahar ki har entry', hasDate: true }] },
      { group: 'Money', reports: [
        { id: 'money.cashbook',   name: 'Cash book',         nameUr: 'کیش بک',          icon: '💰', note: 'Cash in / out aur balance', hasDate: true },
        { id: 'money.receivables',name: 'Receivables',       nameUr: 'وصولی باقی',      icon: '📒', note: 'Customer ka baqaya', hasDate: false },
        { id: 'money.payables',   name: 'Payables',          nameUr: 'ادائیگی باقی',    icon: '🧾', note: 'Supplier ka baqaya', hasDate: false }] },
      { group: 'Purchase', reports: [
        { id: 'pur.bySupplier',   name: 'Purchase by supplier', nameUr: 'سپلائر کے حساب', icon: '🚚', note: 'Supplier-war kharidari', hasDate: true },
        { id: 'pur.pending',      name: 'Pending POs',       nameUr: 'زیر التواء پی او', icon: '⏳', note: 'Jo abhi receive nahi hue', hasDate: false }] }
    ];
    return CAT;
  },

  /* --- reports.run / runCsv (ReportEngine) --- */
  'reports.run': p => {
    /* demo me asli aggregation ka poori tarah naqal karna mumkin nahi —
       magar SHAKAL bilkul waisi honi chahiye taake UI tootay nahi */
    const sampleRows = [
      { name: 'FLAMINGO DASHBOARD POLISH 450ML', code: 'FL00000', qty: 24, amount: 8112 },
      { name: 'CAR WASH SHAMPOO 1L',             code: 'CW0001',  qty: 12, amount: 3600 },
      { name: 'MICROFIBRE CLOTH',                code: 'MC0002',  qty: 40, amount: 2000 },
      { name: 'TYRE SHINE SPRAY 500ML',          code: 'TS0003',  qty: 9,  amount: 1755 },
      { name: 'AIR FRESHENER JASMINE',           code: 'AF0004',  qty: 30, amount: 1500 }
    ];
    const cols = [
      { key: 'name',   label: 'Item',   type: 'text' },
      { key: 'code',   label: 'Code',   type: 'text' },
      { key: 'qty',    label: 'Qty',    type: 'number' },
      { key: 'amount', label: 'Amount', type: 'money' }
    ];
    return { id: p.id, name: p.id, columns: cols, rows: sampleRows,
      totals: { qty: sampleRows.reduce((a, r) => a + r.qty, 0),
                amount: sampleRows.reduce((a, r) => a + r.amount, 0) },
      generatedAt: new Date().toISOString(), rowCount: sampleRows.length };
  },
  'reports.runCsv': p => {
    const r = MockAPI['reports.run'](p);
    const head = r.columns.map(c => c.label).join(',');
    const body = r.rows.map(row => r.columns.map(c => row[c.key]).join(',')).join('\n');
    return { csv: head + '\n' + body, filename: (p.id || 'report') + '.csv' };
  },

  /* --- dayreport.* (§7 shop open / close reports) --- */
  'dayreport.generate': p => {
    const now = new Date();
    const rec = {
      id: 'DR' + String(DAY_REPORTS.length + 1).padStart(4, '0'),
      sessionNo: 'DR' + String(DAY_REPORTS.length + 1).padStart(4, '0'),
      kind: p.kind || 'CLOSE',
      locationId: p.locationId || 'LOC-SDQ',
      locationName: 'Sadiqabad City',
      cashier: 'owner',
      openedAt: new Date(now.getTime() - 9 * 3600e3).toISOString(),
      closedAt: now.toISOString(),
      openingCash: 5000, closingCash: null, expectedCash: 0, variance: null,
      bills: SALES.length,
      sales: { gross: SALES.reduce((a, r) => a + (Number(r.total) || 0), 0),
               returns: 0, udhaar: SALES.filter(r => String(r.status) === 'CREDIT')
                 .reduce((a, r) => a + (Number(r.total) || 0), 0) },
      totals: { cashIn: SALES.reduce((a, r) => a + (Number(r.paid) || 0), 0), cashOut: 0, expenses: 0 },
      byMethod: [{ method: 'CASH', txns: SALES.length, amount: SALES.reduce((a, r) => a + (Number(r.total) || 0), 0) }],
      expenses: [], topItems: []
    };
    rec.expectedCash = rec.openingCash + rec.totals.cashIn - rec.totals.cashOut - rec.totals.expenses;
    DAY_REPORTS.unshift(rec);
    return rec;
  },
  'dayreport.list': p => (DAY_REPORTS || []).slice(0, p.limit || 30),
  'dayreport.get': p => (DAY_REPORTS || []).find(r => r.id === p.id) || null,
  'dayreport.html': p => {
    const r = (DAY_REPORTS || []).find(x => x.id === p.id);
    return { html: '<h3>Day closing report</h3><p>' + ((r && r.sessionNo) || p.id) + '</p>' };
  },
  'dayreport.pdf': p => ({ url: '', filename: 'day-report-' + (p.id || 'x') + '.pdf' }),

  /* ---------------- v2.19 — PWA bootstrap & dedicated POS ----------------- */
  'pwa.bootstrap': p => {
    var app = String(p.app||'pos').toLowerCase();
    var cats = Array.from(new Set(ITEMS.map(i=>i.category).filter(Boolean))).sort();
    var base = {
      config: { app: { id:app, shortName: ({wh:'Warehouse',fo:'Field Orders',sm:'Salesman',pos:'POS'})[app]||app, name: 'Haseeb Autos — '+(app.toUpperCase()), icon: ({wh:'🏬',fo:'🧾',sm:'🚚',pos:'🧾'})[app]||'📱', theme:'#0b1220' }, business:{name:'Haseeb Autos',currency:'Rs'}, version:'2.19', offline:{maxQueue:200, enabled:true} },
      locationId: 'LOC-SDQ',
      locations: LOCATIONS.map(l=>({id:l.id,name:l.name})),
      serverTime: new Date().toISOString(),
      items: ITEMS.map(i=>({id:i.id, code:i.code, name:i.name, category:i.category, cat:i.category, retail:Number(i.retailPrice||0), wholesale:Number(i.wholesalePrice||0), cost:Number(i.costPrice||0), barcode:i.barcode, stock:i.stock})),
      app: app
    };
    if(app==='wh'){
      base.bins = BINS.slice(0,12).map(b=>({id:b.id, name:b.name, code:b.code}));
      base.tasks = [{kind:'RECEIVE', ref:'PO-SDQ-01001', refId:'PO1', title:'Receive PO-SDQ-01001', meta:'Karachi Auto Traders · 120 items', qty:120, priority:1},{kind:'COUNT', ref:'CNT-00001', refId:'CNT1', title:'Count CNT-00001', meta:'all stock · 30 lines', qty:30, priority:1}];
    } else if(app==='fo'){
      base.customers = CUSTOMERS.slice(0,20).map(c=>({id:c.id, name:c.name, phone:c.phone, bal:c.balance, priceTier:c.priceTier}));
      base.drafts = [{id:'ORD1', orderNo:'ORD-00001', date:new Date().toISOString().slice(0,10), customerName: CUSTOMERS[0].name, total: 5200, status:'DRAFT'},{id:'ORD2', orderNo:'ORD-00002', date:new Date(Date.now()-864e5).toISOString().slice(0,10), customerName: CUSTOMERS[1].name, total: 8100, status:'CONFIRMED'}];
      base.cats = cats;
    } else if(app==='sm'){
      base.customers = CUSTOMERS.slice(0,20).map(c=>({id:c.id, name:c.name, phone:c.phone, bal:c.balance}));
      base.myStock = [{itemId:ITEMS[0].id, code:ITEMS[0].code, name:ITEMS[0].name, qty:24, avgCost:Number(ITEMS[0].costPrice)}];
      base.stockSummary = {items:1, qty:24, value:24*Number(ITEMS[0].costPrice), retailValue:24*Number(ITEMS[0].retailPrice)};
    } else if(app==='pos'){
      base.customers = CUSTOMERS.slice(0,30).map(c=>({id:c.id, name:c.name, phone:c.phone, bal:c.balance, priceTier:c.priceTier, points:c.points}));
      base.cats = cats;
      base.recent = SALES.slice(0,10).map(s=>({id:s.id, invoiceNo:s.invoiceNo, date:String(s.date).slice(0,16), customerName:s.customerName, total:s.total, status:s.status}));
    }
    return base;
  },
  'pwa.wh.receive': p => ({ok:true, grnNo:'GRN-SDQ-01099', id:'GRN99'}),
  'pwa.wh.putaway': p => ({ok:true}),
  'pwa.wh.count': p => ({ok:true, code:'FL00000'}),
  'pwa.wh.transfer': p => ({ok:true}),
  'pwa.fo.order': p => ({ok:true, id:'ORD'+Date.now(), orderNo:'ORD-0'+String(Date.now()).slice(-4)}),
  'pwa.sm.sell': p => ({ok:true, id:'SAL'+Date.now(), invoiceNo:'INV-SDQ-0'+String(Date.now()).slice(-4)}),
  'pwa.sm.collect': p => ({ok:true}),
  'pwa.pos.sell': p => {
    var sale = MockAPI['sales.create']({sale:{locationId:p.locationId||'LOC-SDQ', customerId:p.customerId, customerName:p.customerName||'Walk-in Customer', discount:Number(p.discount||0), payments:p.payments, items:(p.items||[]).map(l=>({itemId:l.itemId, qty:l.qty, price:l.price})), notes:'via POS PWA'}});
    return {ok:true, id: sale.id, invoiceNo: sale.invoiceNo, total: sale.total};
  },
  'pwa.sync': p => ({ok:true, synced: (p.queue||[]).length, failed:0, results:(p.queue||[]).map(q=>({clientId:q.clientId, ok:true, result:{ok:true}}))}),
  'dayreport.csv': p => {
    const r = (DAY_REPORTS || []).find(x => x.id === p.id) || {};
    const rows = [['Day closing report', r.sessionNo || '', r.locationName || ''],
      ['Opened', r.openedAt || '', 'Closed', r.closedAt || ''], [],
      ['Bills', r.bills || 0, 'Gross', (r.sales || {}).gross || 0],
      ['Opening cash', r.openingCash || 0, 'Expected', r.expectedCash || 0]];
    return { csv: rows.map(x => x.join(',')).join('\n'), filename: 'day-report-' + (p.id || 'x') + '.csv' };
  }
};
})();

/* ============================================================================
   SALESMAN MODULE (v2.6 QA) — demo mock mein YE HANDLERS THAY HI NAHI,
   is liye demo mein poora "Salesman Stock" screen murda nazar aata tha
   (dropdown khali → "koi option he nahi" ki shikayat).
   ========================================================================== */
(function () {
  const M = window.MockAPI || (window.MockAPI = {});
  const mk = (id, n, r) => ({ id: id, name: n, role: r });
  const SM = [mk('USR-SM1', 'Imran Ali', 'SALESMAN'), mk('USR-SM2', 'Bilal Ahmed', 'SALESMAN'),
              mk('USR-SM3', 'Kashif Iqbal', 'SALESMAN')];
  let stock = {};
  SM.forEach(sm => {
    stock[sm.id] = [
      { itemId: 'ITM-1', code: 'BRK-001', name: 'Brake Pad Set', qty: 24, avgCost: 850, value: 20400, retailValue: 26400 },
      { itemId: 'ITM-2', code: 'OIL-005', name: 'Engine Oil 20W50', qty: 18, avgCost: 620, value: 11160, retailValue: 14400 },
      { itemId: 'ITM-3', code: 'FLT-012', name: 'Oil Filter', qty: 30, avgCost: 240, value: 7200, retailValue: 9300 }
    ];
  });
  M['salesman.list'] = () => SM;
  M['salesman.stock'] = (p) => {
    const rows = stock[p.salesmanId] || [];
    const value = rows.reduce((a, r) => a + (r.value || 0), 0);
    return { rows: rows, summary: { items: rows.length, value: value, qty: rows.reduce((a, r) => a + r.qty, 0) } };
  };
  M['salesman.summary'] = () => ({ soldValue: 184500, customerDue: 41200, collected: 143300, issuedValue: 38760 });
  M['salesman.issue'] = (p) => {
    const sid = p.salesmanId || SM[0].id; const list = stock[sid] || (stock[sid] = []);
    (p.items || []).forEach(l => {
      const f = list.find(x => x.itemId === l.itemId);
      if (f) f.qty += Number(l.qty) || 0;
      else list.push({ itemId: l.itemId, code: l.itemId, name: 'Item', qty: Number(l.qty) || 0, avgCost: Number(l.cost) || 0 });
    });
    return { id: 'SIS-DEMO1', issueNo: 'SIS-SDQ-00001', lines: (p.items || []).length };
  };
  M['salesman.issues'] = () => [{ id: 'SIS-DEMO1', issueNo: 'SIS-SDQ-00001', date: new Date().toISOString(), lines: 3, value: 38760 }];
  M['salesman.issue.get'] = (p) => ({ id: p.id, issueNo: 'SIS-SDQ-00001', items: [] });
  M['salesman.return'] = (p) => { const list = stock[p.salesmanId] || []; (p.items || []).forEach(l => { const f = list.find(x => x.itemId === l.itemId); if (f) f.qty = Math.max(0, f.qty - (Number(l.qty) || 0)); }); return { id: 'SRT-DEMO1' }; };
  M['salesman.returns'] = () => [];
  M['salesman.settle'] = (p) => ({ id: 'SST-DEMO1', settleNo: 'STLM-SDQ-00001', cashCollected: 143300, cashDeposited: Number(p.cashDeposited) || 0, variance: 0 });
  M['salesman.settlements'] = () => [];
  M['salesman.settlement.get'] = (p) => ({ id: p.id });
  M['media.uploadLogo'] = () => ({ url: '', driveId: '' });
  M['items.uploadImage'] = () => ({ url: '', driveId: 'demo' });
})();

/* ============================================================================
   CUSTOMER DEMANDS — v2.25.0 (req 3).
   Demo mock mein ye routes PEHLE SE HI NAHI THAY (sirf backend CustomerDemands.gs
   mein) — is liye demo par poori Demands screen murda thi: list khaali aati thi
   aur form save karne par "Koi backend connected nahi hai (action: demand.create)"
   aata tha. Ab demo asli backend jaisa: list · get · create · update · setStatus ·
   dashboard · vendorSuggest · monitor · suggestForPO · reports · posRecommend.
   ========================================================================== */
(function () {
  const M = window.MockAPI || (window.MockAPI = {});
  const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  let seq = 1005;
  const ROWS = [
    { id: 'DM1001', demandNo: 'DM-SDQ-01001', date: day(9), customerId: 'CUS1000', customerName: 'Ahmad Ali',
      customerPhone: '0300-1000000', itemId: 'ITM5000', itemName: 'FLAMINGO DASHBOARD POLISH 450ML',
      itemCode: 'FL00000', category: 'DashBoard Polish Spray', brand: 'Flamingo', make: '', model: '',
      qty: 6, priority: 'HIGH', status: 'OPEN', expectedDate: day(-3), notes: 'Black colour chahiye',
      source: 'PHONE', budgetPrice: 0, partialOk: true, substituteOk: false, followUpDate: '',
      notifyChannel: 'WHATSAPP', assignedSupplierId: '', tags: 'repeat', internalNote: '',
      locationId: 'LOC-SDQ' },
    { id: 'DM1002', demandNo: 'DM-SDQ-01002', date: day(5), customerId: 'CUS1001', customerName: 'Muhammad Adnan',
      customerPhone: '0300-1000137', itemId: 'ITM5173', itemName: 'NGK Spark Plug C7HSA / CD70',
      itemCode: 'IGM00007', category: 'Spark Plug', brand: 'NGK', make: 'Honda', model: 'CD70',
      qty: 12, priority: 'URGENT', status: 'ORDERED', expectedDate: day(-1), notes: '',
      source: 'WHATSAPP', budgetPrice: 4800, partialOk: false, substituteOk: true, followUpDate: day(-2),
      notifyChannel: 'BOTH', assignedSupplierId: 'SUP1000', tags: 'urgent,honda', internalNote: 'Client ka CD70',
      locationId: 'LOC-SDQ' },
    { id: 'DM1003', demandNo: 'DM-SDQ-01003', date: day(2), customerId: 'CUS1002', customerName: 'Bilal Sheikh',
      customerPhone: '0300-1000274', itemId: '', itemName: 'Headlight Assembly (Honda CD70)', itemCode: '',
      category: 'Electrical', brand: '', make: 'Honda', model: 'CD70', qty: 2, priority: 'MEDIUM', status: 'SOURCED',
      expectedDate: day(-7), notes: 'Original chahiye, local nahi', source: 'WALK_IN', budgetPrice: 3500,
      partialOk: false, substituteOk: false, followUpDate: day(-1), notifyChannel: 'SMS',
      assignedSupplierId: 'SUP1000', tags: 'honda,electrical', internalNote: '', locationId: 'LOC-SDQ' },
    { id: 'DM1004', demandNo: 'DM-SDQ-01004', date: day(20), customerId: 'CUS1000', customerName: 'Ahmad Ali',
      customerPhone: '0300-1000000', itemId: 'ITM5000', itemName: 'FLAMINGO DASHBOARD POLISH 450ML',
      itemCode: 'FL00000', category: 'DashBoard Polish Spray', brand: 'Flamingo', qty: 4, priority: 'LOW',
      status: 'FULFILLED', expectedDate: day(12), notes: '', source: 'PHONE', locationId: 'LOC-SDQ',
      budgetPrice: 0, partialOk: true, substituteOk: false, tags: '', internalNote: '' },
    { id: 'DM1005', demandNo: 'DM-SDQ-01005', date: day(1), customerId: 'CUS1001', customerName: 'Muhammad Adnan',
      customerPhone: '0300-1000137', itemId: 'ITM5173', itemName: 'NGK Spark Plug C7HSA / CD70',
      itemCode: 'IGM00007', category: 'Spark Plug', brand: 'NGK', qty: 3, priority: 'HIGH', status: 'ARRIVED',
      expectedDate: day(0), notes: '', source: 'FIELD', locationId: 'LOC-SDQ', budgetPrice: 0,
      partialOk: true, substituteOk: true, tags: 'urgent', internalNote: '' }
  ];
  const ACTIVE = ['OPEN', 'SOURCED', 'ORDERED', 'ARRIVED', 'NOTIFIED', 'PARTIAL'];
  const ageDays = r => Math.max(0, Math.round((Date.now() - new Date(r.date).getTime()) / 864e5));
  const overdue = r => ACTIVE.indexOf(r.status) > -1 && r.expectedDate && r.expectedDate < day(0);
  const deco = r => Object.assign({}, r, { daysOpen: ageDays(r), isOverdue: overdue(r) });
  const byId = id => ROWS.filter(r => String(r.id) === String(id))[0] || null;
  const HIST = [];
  function hist(d, from, to, note) {
    HIST.unshift({ id: 'DH' + (HIST.length + 1), demandId: d.id, ts: new Date().toISOString(),
      fromStatus: from || '—', toStatus: to, note: note || '', userName: 'Owner' });
  }

  M['demand.list'] = p => {
    p = p || {};
    let rows = ROWS.slice();
    if (p.customerId) rows = rows.filter(r => String(r.customerId) === String(p.customerId));
    if (p.itemId) rows = rows.filter(r => String(r.itemId) === String(p.itemId));
    if (p.status) rows = rows.filter(r => r.status === p.status || (p.status === 'ACTIVE' && ACTIVE.indexOf(r.status) > -1));
    if (p.priority) rows = rows.filter(r => r.priority === p.priority);
    if (p.q) {
      const q = String(p.q).toLowerCase();
      rows = rows.filter(r => [r.demandNo, r.customerName, r.customerPhone, r.itemName, r.itemCode]
        .join(' ').toLowerCase().indexOf(q) > -1);
    }
    const byStatus = {}; ROWS.forEach(r => { byStatus[r.status] = (byStatus[r.status] || 0) + 1; });
    const out = rows.map(deco).sort((a, b) => (a.date < b.date ? 1 : -1));
    const limit = Number(p.limit) || 100;
    return { rows: out.slice(0, limit), total: rows.length,
      totals: { total: ROWS.length, outstanding: ROWS.filter(r => ACTIVE.indexOf(r.status) > -1).length, byStatus: byStatus } };
  };

  M['demand.get'] = p => {
    const r = byId(p.id);
    if (!r) throw new Error('Demand nahi mili');
    return { demand: deco(r),
      history: HIST.filter(x => x.demandId === r.id),
      pos: r.status === 'ORDERED' || r.status === 'ARRIVED' || r.status === 'NOTIFIED'
        ? [{ id: 'PO1', poNo: 'PO-SDQ-01001', supplierName: 'Metro Auto Parts', status: 'APPROVED' }] : [] };
  };

  M['demand.create'] = p => {
    const d = p.demand || p;
    const id = 'DM' + (seq++);
    const row = Object.assign({ id: id, demandNo: 'DM-SDQ-0' + seq, date: day(0), status: 'OPEN',
      locationId: d.locationId || 'LOC-SDQ' }, d);
    ROWS.unshift(row); hist(row, '—', 'OPEN', 'Demand banayi gayi');
    return { ok: true, id: id, demandNo: row.demandNo };
  };

  M['demand.update'] = p => {
    const r = byId(p.id);
    if (!r) throw new Error('Demand nahi mili');
    Object.assign(r, p.patch || {});
    hist(r, r.status, r.status, 'Update');
    return { ok: true, id: r.id };
  };

  M['demand.setStatus'] = p => {
    const r = byId(p.id);
    if (!r) throw new Error('Demand nahi mili');
    const from = r.status; r.status = p.status; hist(r, from, p.status, p.note || '');
    return { ok: true, id: r.id, status: r.status };
  };

  M['demand.dashboard'] = () => {
    const byStatus = {}; ROWS.forEach(r => { byStatus[r.status] = (byStatus[r.status] || 0) + 1; });
    const openRows = ROWS.filter(r => ACTIVE.indexOf(r.status) > -1);
    const ageing = { '0-3 din': 0, '4-7 din': 0, '8-15 din': 0, '15+ din': 0 };
    openRows.forEach(r => { const a = ageDays(r);
      if (a <= 3) ageing['0-3 din']++; else if (a <= 7) ageing['4-7 din']++; else if (a <= 15) ageing['8-15 din']++; else ageing['15+ din']++; });
    return { byStatus: byStatus, ageing: ageing,
      supplierOrderStatus: { APPROVED: 1, DRAFT: 1, RECEIVED: 0 },
      totals: { total: ROWS.length, outstanding: openRows.length,
        fulfilled: byStatus.FULFILLED || 0,
        pendingProcurement: ROWS.filter(r => ['SOURCED', 'OPEN'].indexOf(r.status) > -1).length,
        waitingCustomers: openRows.filter(r => r.status !== 'NOTIFIED').length,
        overdue: ROWS.filter(overdue).length } };
  };

  M['demand.monitor'] = () => ({ alerts: ROWS.filter(r => r.status === 'ARRIVED').length, checked: ROWS.length });

  M['demand.suggestForPO'] = () => {
    const open = ROWS.filter(r => ACTIVE.indexOf(r.status) > -1 && r.status !== 'ORDERED');
    const items = [{ key: 'IGM00007', itemId: 'ITM5173', itemName: 'NGK Spark Plug C7HSA / CD70', itemCode: 'IGM00007',
      demandCount: 1, totalQty: 12, onHand: 3, topPriority: 'URGENT', estimatedValue: 4080,
      customers: [{ name: 'Muhammad Adnan' }], demandIds: ['DM1002'] },
    { key: 'FL00000', itemId: 'ITM-5000', itemName: 'FLAMINGO DASHBOARD POLISH 450ML', itemCode: 'FL00000',
      demandCount: 1, totalQty: 6, onHand: 41, topPriority: 'HIGH', estimatedValue: 2028,
      customers: [{ name: 'Ahmad Ali' }], demandIds: ['DM1001'] }];
    return { items: items, totalItems: items.length, totalDemands: open.length,
      totalQty: items.reduce((a, x) => a + x.totalQty, 0),
      estimatedValue: items.reduce((a, x) => a + x.estimatedValue, 0) };
  };

  M['demand.reports'] = p => {
    const type = (p && p.type) || 'open';
    let rows = ROWS.slice();
    if (type === 'waiting_customers') rows = rows.filter(r => ACTIVE.indexOf(r.status) > -1);
    if (type === 'supplier_status') rows = rows.filter(r => r.assignedSupplierId);
    if (type === 'overdue') rows = rows.filter(overdue);
    if (type === 'fulfilled') rows = rows.filter(r => r.status === 'FULFILLED');
    return { rows: rows.map(deco), total: rows.length };
  };

  M['demand.vendorSuggest'] = p => {
    const best = { supplierId: 'SUP1000', supplierName: 'Metro Auto Parts', score: 92, avgCost: 2380,
      leadTimeAvg: 3, reliabilityPct: 96, lastRate: 2420, lastDate: day(14), note: 'Pichhle 6 mahine mein sab se tez + sasti supply.' };
    const rows = [
      Object.assign({ isBest: true, purchases: 12 }, best),
      { supplierId: 'SUP1001', supplierName: 'Al-Madina Traders', purchases: 7, avgCost: 2465, lastRate: 2480,
        leadTimeAvg: 5, reliabilityPct: 88, score: 78, isBest: false },
      { supplierId: 'SUP1002', supplierName: 'Speed Motors Parts', purchases: 3, avgCost: 2510, lastRate: 2500,
        leadTimeAvg: 8, reliabilityPct: 74, score: 61, isBest: false }
    ];
    return { best: best, rows: rows, note: '' };
  };

  M['demand.posRecommend'] = p => {
    const rows = ROWS.filter(r => String(r.customerId) === String(p.customerId || '') && ACTIVE.indexOf(r.status) > -1);
    return { items: rows.map(r => ({ id: r.id, demandNo: r.demandNo, itemId: r.itemId, itemName: r.itemName,
      code: r.itemCode, qty: r.qty, status: r.status, arrived: r.status === 'ARRIVED' || r.status === 'NOTIFIED' })) };
  };
})();


/* ============================================================================
   v2.30.5 (mandate #1) — CONFIG-class write handlers auto-persist: koi bhi
   config./system.wizard/system.settings.save/lang.* route likhe to poori
   config-snapshot mehfooz (aane wale handlers bhi mehfooz rahenge).
   ========================================================================== */
/* v2.30.5 (mandate #1) — salesman route CRUD (pehle mock handlers hi nahi the —
   route modal save par 'Koi backend connected nahi hai' aata tha) */
(function () {
  const M = window.MockAPI || (window.MockAPI = {});
  const SM_ROUTES = [];
  M['salesman.routes'] = function () { return { rows: SM_ROUTES.slice() }; };
  M['salesman.route.save'] = function (p) {
    const r = (p && p.route) || p || {};
    if (!r.name) throw new Error('Route name zaroori hai.');
    if (!r.id) { r.id = 'SMR' + (SM_ROUTES.length + 1); SM_ROUTES.push(r); }
    else { const i = SM_ROUTES.findIndex(x => x.id === r.id); if (i > -1) SM_ROUTES[i] = Object.assign(SM_ROUTES[i], r); else SM_ROUTES.push(r); }
    return r;
  };
  M['salesman.route.delete'] = function (p) {
    const i = SM_ROUTES.findIndex(x => x.id === (p && p.id));
    if (i > -1) SM_ROUTES.splice(i, 1);
    return { removed: 1 };
  };
})();

(function mockCfgWriteWrap() {
  const RE = /^(config\.|system\.wizard|system\.settings\.save|lang\.)/;
  Object.keys(window.MockAPI).forEach(function (k) {
    if (!RE.test(k) || typeof window.MockAPI[k] !== 'function' || window.MockAPI[k].__cfgp) return;
    const orig = window.MockAPI[k];
    const w = function (p) {
      const r = orig.apply(this, arguments);
      try {
        if (typeof mockPersistConfig === 'function') mockPersistConfig();
        else if (typeof window.mockPersistConfig === 'function') window.mockPersistConfig();
      } catch (e) { try { window.__cfgErr = 'WRAP: ' + e.message; } catch (e2) { } }
      return r;
    };
    w.__cfgp = true;
    window.MockAPI[k] = w;
  });
})();
