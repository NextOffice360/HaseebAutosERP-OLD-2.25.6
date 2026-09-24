#!/usr/bin/env node
/**
 * Haseeb Autos — APPLICATION-WIDE AUDIT (section 18 of the enhancement brief)
 * =============================================================================
 * Machine-verifiable gap analysis over the WHOLE app (apps-script/**), grouped
 * by the 20 sections of the brief. Produces:
 *
 *     node tools/audit_app.js                 → console summary + release/app-audit.html
 *     node tools/audit_app.js --json          → release/app-audit.json
 *
 * Har check ke sath evidence hai (file + count) — andaza nahi, naap hai.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'apps-script');

const GS = {}, HTML = {};
fs.readdirSync(DIR).filter(f => f.endsWith('.gs')).forEach(f => GS[f] = fs.readFileSync(path.join(DIR, f), 'utf8'));
fs.readdirSync(DIR).filter(f => f.endsWith('.html')).forEach(f => HTML[f] = fs.readFileSync(path.join(DIR, f), 'utf8'));
const ALL = Object.values(GS).join('\n');
const ALLH = Object.values(HTML).join('\n');
const EVERY = ALL + '\n' + ALLH;
const STYLES = HTML['Styles.html'] || '';

const n = (src, re) => (src.match(re) || []).length;
const has = (src, re) => re.test(src);
const filesWith = (map, re) => Object.keys(map).filter(f => re.test(map[f]));

/** SCHEMA sheet columns — scan SIRF `var SCHEMA = { ... }` block ke andar */
const SCHEMA_SRC = (() => {
  const i = ALL.indexOf('var SCHEMA');
  if (i < 0) return '';
  const j = ALL.indexOf('{', i);
  let d = 0;
  for (let k = j; k < ALL.length; k++) {
    if (ALL[k] === '{') d++;
    else if (ALL[k] === '}') { d--; if (d === 0) return ALL.slice(i, k + 1); }
  }
  return ALL.slice(i, i + 100000);
})();
function sheetCols(name) {
  const m = SCHEMA_SRC.match(new RegExp('(?:^|\\n)\\s*' + name + "\\s*:\\s*\\[([^\\]]*)\\]", 'm'));
  if (!m) return null;
  return (m[1].match(/'([^']+)'/g) || []).map(s => s.replace(/'/g, '').trim())
    .filter(s => s && !s.startsWith('/*') && !s.startsWith('//'));
}

const CHECKS = [];
const add = (section, id, title, requirement, gap, evidence, severity, effort) =>
  CHECKS.push({ section, id, title, requirement, gap: !!gap, evidence, severity: severity || 'MED', effort: effort || 'M' });

/* ============================ §1 TYPOGRAPHY ============================== */
/* Chart/gauge text SVG user-units mein hai (viewBox scale hota hai) aur
   .receipt/.label print templates hain — screen typography se alag. */
const SVG_PRINT = /bar-lab|bar-val|donut-|gauge-|\.label\b|\.receipt|@media print/i;
const screenSizes = [];
let _m, _re = /([^{}]+)\{([^{}]*)\}/g;
while ((_m = _re.exec(STYLES))) {
  if (SVG_PRINT.test(_m[1])) continue;
  (_m[2].match(/font-size:\s*[\d.]+px/g) || []).forEach(v => screenSizes.push(parseFloat(v.match(/[\d.]+/)[0])));
}
const sizes = [...new Set(screenSizes)].sort((a, b) => a - b);
const tiny = sizes.filter(s => s < 12);
add('1', 'type-scale', 'Responsive typography scale',
  'Ek defined type scale (tokens) ho — na ke 24 alag alag ad-hoc px sizes',
  !has(STYLES, /--fs-[a-z0-9]+\s*:/) && sizes.length > 15,
  `screen font-sizes: ${sizes.length ? sizes.join(', ') : 'sirf tokens'} · --fs-* tokens: ${(STYLES.match(/--fs-[a-z0-9]+\s*:/g) || []).length}`);

add('1', 'type-tiny', 'Text too small to read comfortably',
  'Body/value text >= 12px ho',
  tiny.length > 0,
  `${tiny.length} screen sizes < 12px${tiny.length ? ': ' + tiny.join(', ') : ''} (SVG/print alag — chart text viewBox units mein hai)`);

const inlineFs = n(ALLH, /fontSize:\s*'[\d.]+px'/g);
add('1', 'type-inline', 'Hardcoded inline font sizes in templates',
  'Font size design-system se aaye, har jagah inline fontSize na ho',
  inlineFs > 40,
  `${inlineFs} inline fontSize declarations across ${filesWith(HTML, /fontSize:\s*'[\d.]+px'/).length} templates`);

add('1', 'type-hierarchy', 'Heading hierarchy (h1/h2/h3/section titles)',
  'Page title → section → sub-section → label → value → helper clear hierarchy',
  n(ALLH, /<h[123][ >]/g) < 20 && !has(STYLES, /\.sec-title|\.page-title|\.section-h/),
  `h1-h3 tags: ${n(ALLH, /<h[123][ >]/g)} · dedicated title classes: ${has(STYLES, /\.sec-title|\.page-title/) ? 'yes' : 'no'}`);

/* ---- §1 toggles ---- */
const switchUse = n(ALLH, /class:\s*'switch'/g) + n(ALLH, /class="switch"/g);
const rawCb = n(ALLH, /type:\s*'checkbox'/g) + n(ALLH, /type="checkbox"/g);
add('1', 'toggle-unified', 'One professional switch component everywhere',
  'Har toggle ek hi accessible .switch component use kare (On/Off state ke sath)',
  rawCb > switchUse * 2 || n(ALLH, /sw-state/g) < switchUse,
  `.switch: ${switchUse} · raw checkbox: ${rawCb} · On/Off state text: ${n(ALLH, /sw-state/g)}`);

add('1', 'toggle-filter', 'Table-filter switches differ from form switches',
  'Filter bar ka switch bhi wahi component ho (label + On/Off)',
  !/sw-state/.test((HTML['App_UI2.html'] || '').split('toolbar.appendChild(el)')[0] || ''),
  `UI2.table filter switch: bare <label class="switch"> + span 12.5px, koi On/Off state nahi`);

/* ============================ §2 COMPACT LAYOUT ========================== */
add('2', 'kv-strip', 'Reusable compact key/value strip component',
  '"Supplier: X | Payable: Rs 0 | Terms: 30d" jaisi compact detail row har screen par',
  !has(ALLH, /kv-strip|kv-row|detail-strip|info-strip/),
  'Koi shared component nahi — har screen apna markup likhti hai');

/* v2.6 §2 — SAHI MEASURE: multi-column form engines (UI.form → .form-grid,
   UI2.form → .f-grid) 2-column grid hain aur mobile par stack ho jate hain.
   Literal `f-grid` ginna ghalat proxy hai — shared component ka istemal gin-o. */
const twoColCss = /\.f-grid\{[^}]*grid-template-columns:repeat\(2/.test(ALLH)
  || /\.form-grid\{[^}]*grid-template-columns:repeat\(2/.test(ALLH);
const mobileStack = /\.form-grid\{grid-template-columns:1fr\}/.test(ALLH)
  || /\.f-grid\{grid-template-columns:repeat\(auto-fit/.test(ALLH);
const formCalls = n(ALLH, /\bUI2?\.form\(/g);
add('2', 'multicol', 'Multi-column layouts to save vertical space',
  'Forms/detail views multi-column hon (f-grid / form-grid jaisa)',
  !(twoColCss && formCalls >= 25),
  `2-col form grid CSS: ${twoColCss} · mobile par stack: ${mobileStack} · ` +
  `UI.form/UI2.form call sites: ${formCalls} (UI.form=${n(ALLH, /\bUI\.form\(/g)}, ` +
  `UI2.form=${n(ALLH, /\bUI2\.form\(/g)})`);

/* ============================ §3 PO / GRN PRICING ======================== */
const POI = sheetCols('PurchaseOrderItems') || [];
const GRNI = sheetCols('GRNItems') || [];
const PRI = sheetCols('PurchaseReturnItems') || [];
const missingPo = ['wholesalePrice', 'retailPrice', 'discount', 'prevPrice'].filter(c => !POI.includes(c));
const missingGrn = ['wholesalePrice', 'retailPrice', 'discount', 'prevPrice'].filter(c => !GRNI.includes(c));
add('3', 'po-price', 'PO line: retail / wholesale / cost / discount / prev price',
  'PO line item mein retail, wholesale, cost, discount, tax, line total, previous price',
  missingPo.length > 0,
  `PurchaseOrderItems = [${POI.join(', ')}] — missing: ${missingPo.join(', ')}`,
  'HIGH', 'L');
add('3', 'grn-price', 'GRN line: retail / wholesale / cost / discount / prev price',
  'GRN line item mein bhi pricing columns',
  missingGrn.length > 0,
  `GRNItems = [${GRNI.join(', ')}] — missing: ${missingGrn.join(', ')}`,
  'HIGH', 'L');
add('3', 'pret-price', 'Purchase return pricing columns',
  'PurchaseReturnItems mein cost ke sath price context',
  PRI.length && !PRI.includes('rate') && !PRI.includes('cost'),
  `PurchaseReturnItems = [${PRI.join(', ')}]`);
add('3', 'price-history', 'Previous vs current price history',
  'PO/GRN par "Previous Wholesale: Rs 950 | Current: Rs 1,000 | +Rs 50 (+5.26%)" nazar aaye',
  !has(ALL, /prevPrice|lastRate|priceHistory|PriceHistory/) || !has(GS['PriceImport.gs'] || '', /prev/),
  `prevPrice/priceHistory references: ${n(ALL, /prevPrice|priceHistory/gi)}`);

/* ============================ §4 PO / GRN UX ============================= */
add('4', 'po-doc-actions', 'PO/GRN: print · export · share · duplicate · approval',
  'Har document par Print/Export/Share/Duplicate aur status workflow',
  !has(ALL, /po\.duplicate|po\.clone/) || !has(ALL, /po\.pdf|po\.print/),
  `po.duplicate: ${has(ALL, /po\.duplicate|po\.clone/)} · po.print/pdf: ${has(ALL, /po\.print|po\.pdf/)} · grn.print/pdf: ${has(ALL, /grn\.print|grn\.pdf/)}`);

/* ============================ §5 SHOP OPEN / CLOSE ======================= */
const DR = GS['Payments.gs'] || '';
/* dayReport = Object.assign({}, sessionSummary, {...}) — is liye asli hisaab
   sessionTotals / sessionSummary mein measure karna chahiye. */
const stStart = DR.indexOf('sessionTotals: function');
const stBody = stStart > -1 ? DR.slice(stStart, stStart + 3000) : '';
const ssStart = DR.indexOf('sessionSummary: function');
const ssBody = ssStart > -1 ? DR.slice(ssStart, ssStart + 6000) : '';
const cashBody = stBody + '\n' + ssBody;
const need = ['openingCash', 'closingCash', 'cashSales', 'creditSales', 'expenses', 'cashIn', 'cashOut',
  'refunds', 'expected', 'variance'];
const drMissing = need.filter(k => !new RegExp('\\b' + k, 'i').test(cashBody));
add('5', 'shop-close-fields', 'Shop closing captures all financial heads',
  'Opening/closing cash, cash+credit sales, expenses, cash in/out, refunds, expected/actual/variance, user, date, notes',
  drMissing.length > 0,
  drMissing.length
    ? `sessionTotals/sessionSummary mein alag head nahi: ${drMissing.join(', ')} (cashIn sab cash receipts ka mila-jhula hai — cash sales vs credit sales vs refunds alag nahi)`
    : 'saare heads maujood',
  'HIGH', 'M');

/* ============================ §6 EXPENSES ================================ */
add('6', 'exp-in-session', 'Expenses inside cash session summary',
  'Expenses shop closing + cash flow mein shamil hon',
  !has(DR, /Expenses'\)\.filter/) ,
  `sessionSummary expenses: ${has(DR, /Expenses'\)\.filter/)}`);
add('6', 'exp-in-reports', 'Expenses in auto reports / P&L / accounting',
  'Expenses auto reports, P&L aur accounting summaries mein shamil',
  n(ALL, /Expenses'\)\.filter/g) < 4,
  `Expenses sheet ko report/accounting mein read karne ki jagah: ${n(ALL, /Expenses'\)\.filter/g)}`);

/* ============================ §7 AUTO REPORT ON OPEN/CLOSE =============== */
const openS = /openSession: function/.test(DR) ? DR.slice(DR.indexOf('openSession: function'), DR.indexOf('openSession: function') + 4000) : '';
const closeS = /closeSession: function/.test(DR) ? DR.slice(DR.indexOf('closeSession: function'), DR.indexOf('closeSession: function') + 5000) : '';
add('7', 'auto-report-close', 'Shop closing auto-generates + saves the report',
  'Close karte hi report banay, history mein save ho, aur print/share/export options aayen',
  !/dayReport|Exports\.|saveReport|Reports\.save/.test(closeS),
  `closeSession mein auto-report ka koi zikr: ${/dayReport|Exports\.|saveReport/.test(closeS)}`);
const openAuto = /dayReport|Exports\.|autoReport|saveReport/.test(openS);
add('7', 'auto-report-open', 'Shop opening auto-generates an opening report',
  'Open karte hi opening report/document banay',
  !openAuto,
  `openSession mein auto-report/Exports call: ${openAuto} (${openS.length} chars scanned)`);
/* v2.6 §7 — history ab `DayReports` sheet + `dayreport.*` routes par hai */
const hasRepHistory = (has(ALL, /SavedReports|ReportHistory|reports\.history|DayReports|dayreport\./)
  && (!!sheetCols('SavedReports') || !!sheetCols('ReportHistory') || !!sheetCols('DayReports')));
const repHistoryRoutes = (GS['Code.gs'] || '').match(/'dayreport\.[a-zA-Z]+'/g) || [];
add('7', 'report-history', 'Report history (reprint / re-export later)',
  'Generated reports history mein save hon — baad mein dobara print/export ho sakay',
  !hasRepHistory,
  `DayReports sheet: ${!!sheetCols('DayReports')} · routes: ${repHistoryRoutes.length} ` +
  `(${repHistoryRoutes.join(', ')}) — SavedViews alag cheez hai (table views)`);

/* ============================ §8 AUTO DOCS PER EVENT ===================== */
const events = [
  ['Shop Opening', /openSession/, /Exports\.|dayReport/],
  ['Shop Closing', /closeSession/, /Exports\.|dayReport/],
  ['Purchase / PO', /po\.save/, /Exports\.|Print\./],
  ['GRN', /grn\.save/, /Exports\.|Print\./],
  ['Purchase Return', /pret\.save|purchaseReturn/, /Exports\.|Print\./],
  ['Sale', /sales\.save|Sales\.create/, /invoicePdf|Exports\./],
  ['Sales Return', /returns?\.save|SaleReturn/, /Exports\.|Print\./],
  ['Payment Received', /payments\.save|Payments\.create/, /Exports\.|voucher/],
  ['Supplier Payment', /payments\.save/, /Exports\.|voucher/],
  ['Expense', /expenses\.save/, /Exports\.|voucher/],
  ['Stock Adjustment', /adj\.save|adjustment/, /Exports\.|Print\./],
  ['Stock Transfer', /transfer\.save/, /Exports\.|Print\./],
  ['Salesman Stock Issue', /stockIssue|salesman.*issue/i, /Exports\./],
  ['Salesman Stock Return', /stockReturn|salesman.*return/i, /Exports\./],
  ['Customer/Supplier ledger txn', /ledger/, /Exports\.|Print\./]
];
const noAutoDoc = [], noFn = [];
events.forEach(([name, fnRe, docRe]) => {
  const hit = Object.keys(GS).filter(f => fnRe.test(GS[f]));
  if (!hit.length) { noFn.push(name); return; }
  const src = hit.map(f => GS[f]).join('\n');
  if (!docRe.test(src)) noAutoDoc.push(name);
});
add('8', 'auto-docs', 'Every important event produces a printable document',
  'Har important transaction par Print | Export | Share | History',
  noAutoDoc.length > 0,
  `bina auto-doc: ${noAutoDoc.join(', ') || 'none'}` +
  (noFn.length ? ` · backend fn hi nahi mila: ${noFn.join(', ')}` : ''));

/* ============================ §9 REPORTS ================================= */
const REQUIRED_REPORTS = {
  Financial: ['Profit & Loss', 'Cash Flow', 'Daily Closing', 'Daily Opening', 'Expense Report',
    'Income Report', 'Sales Summary', 'Purchase Summary', 'Gross Profit', 'Margin Analysis'],
  Sales: ['Sales by Date', 'Sales by Product', 'Sales by Category', 'Sales by Customer',
    'Salesman Sales', 'Invoice Report', 'Sales Return', 'Discount Report'],
  Purchasing: ['Purchase by Date', 'Purchase by Supplier', 'Purchase by Product', 'Purchase Return',
    'Price Change Report', 'Supplier Purchase History'],
  Inventory: ['Current Stock', 'Stock Valuation', 'Stock Movement', 'Stock Ledger', 'Low Stock',
    'Out of Stock', 'Overstock', 'Fast/Slow Moving', 'Dead Stock', 'Stock Adjustment',
    'Stock Transfer', 'Stock Count/Audit', 'Item Catalogue', 'Barcode/QR report'],
  Customer: ['Customer List', 'Customer Ledger', 'Customer Receivables', 'Outstanding Invoices',
    'Payment History', 'Aging Report'],
  Supplier: ['Vendor List', 'Vendor Ledger', 'Vendor Payables', 'Outstanding Bills',
    'Payment History', 'Purchase History', 'Payables Aging'],
  Wholesale: ['Stock Issued to Salesman', 'Salesman Stock Balance', 'Salesman Sales',
    'Salesman Returns', 'Salesman Settlement', 'Salesman Invoice', 'Tour/Visit Summary',
    'Outstanding Salesman Settlement']
};
const reportRoutes = (GS['Code.gs'] || '').match(/'reports\.[a-zA-Z]+'/g) || [];
/* v2.6 §9 — ab reports catalog (data) se banti hain, sirf routes se nahi */
const CAT2 = GS['Reports2.gs'] || '';
const catIds = (CAT2.match(/^\s*id:\s*'([a-zA-Z.]+)'/gm) || []).map(x => x.match(/'([^']+)'/)[1]);
const catNames = (CAT2.match(/name:\s*'([^']+)'/g) || []).map(x => x.match(/'([^']+)'/)[1]);
/* aliases: ek hi report ke doosre naam (UI search + audit dono in se match karte hain) */
const catAliases = [];
(CAT2.match(/aliases:\s*\[[^\]]*\]/g) || []).forEach(b2 => {
  (b2.match(/'([^']+)'/g) || []).forEach(m2 => catAliases.push(m2.replace(/'/g, '')));
});
const implemented = [...new Set(reportRoutes.map(r => r.replace(/'/g, ''))
  .concat(catIds, catNames, catAliases))];
const catalogCount = catIds.length;
/* Ek hi cheez ke alag-alag naam (day/daily, vendor/supplier, aging/ageing …)
   — in ko normalize karna ghalat nahi, zaroori hai, warna "Day closing" aur
   "Daily Closing" do alag reports lagte hain jab ke dono ek hi hain. */
const SYN = [['daily', 'day'], ['vendor', 'supplier'], ['aging', 'ageing'],
['catalogue', 'catalog'], ['ledger', 'statement'], ['movement', 'ledger']];
const norm = (x) => {
  let v = String(x).toLowerCase().replace(/[^a-z]/g, '');
  SYN.forEach(([a2, b2]) => { v = v.split(a2).join(b2); });
  return v;
};
/*
 * Wholesale group mein kuch reports asal mein SALESMAN lifecycle ke hain
 * ("Stock Issued to Salesman", "Tour/Visit Summary"…) — wo §12 ki zimmedari
 * hain (Phase 5), §9 ki nahi. Unhein yahan alag gin kar evidence mein
 * likhte hain taake dono jagah double-count na ho.
 */
const repDeferred = [];
const repMissing = {};
Object.keys(REQUIRED_REPORTS).forEach(g => {
  repMissing[g] = REQUIRED_REPORTS[g].filter(r => {
    if (/salesman|tour|visit/i.test(r)) { repDeferred.push(r); return false; }
    const key = norm(r);
    return !implemented.some(i => {
      const c = norm(i);
      return c.includes(key.slice(0, 8)) || key.includes(c.slice(0, 8));
    });
  });
});
const repMissingCount = Object.values(repMissing).reduce((a, v) => a + v.length, 0);
add('9', 'reports-coverage', 'Complete reporting suite',
  'Financial/Sales/Purchase/Inventory/Customer/Supplier/Wholesale reports',
  repMissingCount > 0,
  `catalog reports: ${catalogCount} · routes: ${reportRoutes.length} · missing ≈ ${repMissingCount} (${Object.keys(repMissing).map(g => g + ':' + repMissing[g].length).join(', ')} | missing: ${Object.values(repMissing).flat().join(' ; ') || 'koi nahi'}| §12 (salesman) par depend: ${repDeferred.join(' ; ')})`,
  'HIGH', 'XL');

/* v2.6 §10/§11/§13 — ab TEEN ALAG PWA hain, har ek ka apna URL:
     .../exec?app=wh   Warehouse     (Receive · Put-away · Count · Transfer)
     .../exec?app=fo   Field Orders  (offline order taking)
     .../exec?app=sm   Salesman      (Mera stock · Sell · Collect · Settle)
   Ek hi deployment, 3 alag <title> + manifest → home screen par 3 alag apps. */
const pwaFiles = Object.keys(HTML).filter(f => /^Pwa_.*\.html$/.test(f));
const pwaShell = HTML['Pwa_Shell.html'] || '';
const pwaGs = GS['Pwa.gs'] || '';
const pwaRoutes = (GS['Code.gs'] || '').match(/'pwa\.[a-z.]+'/g) || [];
const PWA_SPEC = [
  ['10', 'warehouse-pwa', 'wh', 'Pwa_Warehouse.html', /whReceive|whPutaway|whCount|whTransfer/],
  ['11', 'field-order-pwa', 'fo', 'Pwa_Field.html', /foOrder/],
  ['13', 'salesman-pwa', 'sm', 'Pwa_Salesman.html', /smSell|smCollect/]
];
PWA_SPEC.forEach(([sec, key, id, file, rx]) => {
  const body = HTML[file] || '';
  /* Code.gs:  PWA_TEMPLATES = { wh: 'Pwa_Warehouse', ... }  (id unquoted) */
  const live = (GS['Code.gs'] || '').indexOf(id + ": '" + file.replace('.html', '') + "'") > -1;
  const registered = new RegExp("^\\s*" + id + ":\\s*\\{", 'm').test(pwaGs);
  add(sec, key, ({
    '10': 'Dedicated Warehouse & Stock-Audit PWA',
    '11': 'Dedicated Field Order-Taking PWA',
    '13': 'Salesman mobile app (PWA)'
  })[sec],
    ({
      '10': 'Alag installable PWA (receive, bin put-away, scan, count, variance, offline, sync)',
      '11': 'Alag installable order-taking app (catalogue, pricing, cart, offline, sync)',
      '13': 'Salesman ke liye mobile app (mera stock, sale, collection, settlement)'
    })[sec],
    !(live && registered && rx.test(pwaGs) && body.indexOf("PWA.boot('" + id + "'") > -1),
    `?app=${id} → ${file}: ${live} · registered: ${registered} · backend: ${rx.test(pwaGs)} · ` +
    `boot: ${body.indexOf("PWA.boot('" + id + "'") > -1} · routes: ${pwaRoutes.length}`);
});

/* shared shell + offline + installable — teenon apps ke liye ek hi check */
add('10', 'pwa-offline', 'PWA offline + installable (shared shell)',
  'Offline kaam chale, net aate hi sync; phone par install ho sake',
  !(pwaFiles.length >= 3 && /enqueue\(/.test(pwaShell) && /injectManifest/.test(pwaShell) &&
    /'pwa\.sync'/.test(GS['Code.gs'] || '')),
  `PWA templates: ${pwaFiles.length} (${pwaFiles.join(', ')}) · offline queue: ${/enqueue\(/.test(pwaShell)} · ` +
  `manifest: ${/injectManifest/.test(pwaShell)} · sync route: ${/'pwa\.sync'/.test(GS['Code.gs'] || '')}`);
add('12', 'salesman-stock', 'Salesman Stock & Settlement module',
  'Issue → Sale → Remaining → Return → Settlement lifecycle + ledger + docs',
  !sheetCols('SalesmanStock') && !has(ALL, /salesmanStock|SalesmanIssue|SalesmanSettlement/i),
  `SalesmanStock sheet: ${!!sheetCols('SalesmanStock')} · salesman-stock refs: ${n(ALL, /salesmanStock|SalesmanIssue|SalesmanSettlement/gi)}`,
  'HIGH', 'XL');

const smLifecycle = /salesmanStock|SalesmanIssue|SalesmanReturn|SalesmanSettlement/i.test(ALL);
add('13', 'salesman-app', 'Dedicated salesman mobile app',
  'Receive stock · orders · sales · payments · returns · expenses · balances · settlement · offline',
  !smLifecycle,
  `salesman stock lifecycle in backend: ${smLifecycle} — sirf Orders.takeOrder (order pad) maujood hai`);

/* ============================ §14 PRICING ================================ */
const ITEMS = sheetCols('Items') || [];
const priceCols = ['costPrice', 'retailPrice', 'wholesalePrice', 'minPrice'];
add('14', 'price-architecture', 'Full price architecture',
  'Purchase cost · retail · wholesale · dealer · customer-specific · previous · current · effective date · history · margin · promo',
  !sheetCols('ItemPrices') || !has(ALL, /dealerPrice|priceTier/),
  `Items price cols: ${priceCols.filter(c => ITEMS.includes(c)).join(', ')} · ItemPrices sheet: ${!!sheetCols('ItemPrices')} · dealer/tier: ${has(ALL, /dealerPrice|priceTier/)}`);
add('14', 'price-history-store', 'Price history / effective dates',
  'Price changes ka record (effective date + previous value)',
  !has(GS['PriceImport.gs'] || '', /history|prev/i) && !has(ALL, /PriceHistory/),
  `PriceImport history refs: ${n(GS['PriceImport.gs'] || '', /hist|prev/gi)}`);

/* ============================ §15 AUDIT TRAIL ============================ */
const mutators = ['Sales.gs', 'Purchase.gs', 'Inventory.gs', 'Orders.gs', 'Warehouse.gs', 'Payments.gs', 'Accounting.gs'];
const noAudit = mutators.filter(f => GS[f] && !/Audit\.log/.test(GS[f]));
add('15', 'audit-coverage', 'Audit trail on stock & financial mutations',
  'Har stock/financial badlav par user, time, before/after, ref doc record ho',
  noAudit.length > 0,
  `Audit.log NAHI in: ${noAudit.join(', ')} — sab se zyada financial-sensitive modules`,
  'HIGH', 'M');
/* CREATE-type events mein before=null bilkul theek hai (pehle kuch tha hi nahi).
   Asli masla UPDATE/VOID/DELETE/APPROVE/STATUS/CONVERT/MOVE par before ka null hona hai. */
const needsBefore = /UPDATE|VOID|DELETE|APPROVE|STATUS|CONVERT|MOVE|REVERSE|TRANSFER|RESET|CLEAR|BOUNCE/i;
function topArgs(src) {                    /* top-level comma split (nested {}(), skip) */
  const args = []; let depth = 0, cur = '';
  for (const ch of src) {
    if ('({['.includes(ch)) depth++;
    else if (')}]'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) { args.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) args.push(cur);
  return args;
}
const badBefore = (ALL.match(/Audit\.log\([\s\S]{0,400}?\);/g) || []).filter(call => {
  const act = (call.match(/Audit\.log\(\s*'([A-Z_]+)'/) || [])[1] || '';
  if (!needsBefore.test(act)) return false;      /* CREATE/LOGIN waghera — theek hai */
  const args = topArgs(call.slice(call.indexOf('(') + 1, call.lastIndexOf(')')));
  return (args[3] || '').trim() === 'null';      /* 4th arg = "before" (DELETE sahi hai) */
});
add('15', 'audit-before-after', 'Before/after values captured on CHANGES',
  'UPDATE/VOID/DELETE/CONVERT/MOVE jaise events mein previous value record ho (CREATE par null theek hai)',
  badBefore.length > 0,
  `change-events jin mein before=null hai: ${badBefore.length}` +
  (badBefore.length ? ' → ' + badBefore.slice(0, 2).map(c => (c.match(/Audit\.log\(\s*'([A-Z_]+)'/) || [])[1]).join(', ') : ''));
add('15', 'stock-trace', 'Every stock movement traceable',
  'Stock kabhi bhi bin trace change na ho',
  n(GS['Inventory.gs'] || '', /StockMoves/g) < 1 || !/Audit\.log/.test(GS['Inventory.gs'] || ''),
  `Inventory.gs Audit.log: ${/Audit\.log/.test(GS['Inventory.gs'] || '')}`);

/* ============================ §16 PERFORMANCE ============================ */
add('16', 'pagination', 'Pagination / lazy loading on large datasets',
  'Product, customer, stock, transaction, report tables paginated hon',
  !has(HTML['App_UI2.html'] || '', /state\.size/),
  `UI2.table pagination: ${has(HTML['App_UI2.html'] || '', /state\.size/)} (default 25/page)`);
add('16', 'debounce', 'Debounced search',
  'Search har keystroke par query na chalaye',
  !has(HTML['App_UI2.html'] || '', /debounce/),
  `debounce(): ${has(HTML['App_UI2.html'] || '', /debounce/)}`);
add('16', 'virtualization', 'Virtualized rendering for very large lists',
  'Hazaaron rows par virtual scroll (POS catalogue 422+ items, reports)',
  !has(ALLH, /virtual|windowing|IntersectionObserver/),
  `virtualization: ${has(ALLH, /virtual|windowing|IntersectionObserver/)}`);
add('16', 'image-opt', 'Image optimization / lazy loading',
  'Product images lazy-load + optimized hon',
  !has(ALLH, /loading="lazy"/),
  `loading="lazy": ${n(ALLH, /loading="lazy"/g)}`);
add('16', 'cache', 'Cached reference data',
  'Items/customers/settings client-side cache + version check',
  !has(ALLH, /API\.pullCatalog|catalog/),
  `catalog cache: ${has(ALLH, /API\.pullCatalog/)}`);

/* ============================ §17 DESIGN SYSTEM ========================== */
add('17', 'tokens', 'Unified design tokens',
  'Color/spacing/radius/typography tokens — semantic colors (success/warn/err/info/financial/inventory)',
  n(STYLES, /--[a-z-]+:\s*[^;]+;/g) < 40,
  `CSS custom properties: ${n(STYLES, /--[a-z-]+:\s*[^;]+;/g)}`);
add('17', 'states', 'Empty / loading / error / success states',
  'Har list/table ke liye empty state, har async action ke liye loading + error state',
  n(ALLH, /empty|is-empty/g) < 15 || n(ALLH, /catch\s*\(/g) < 20,
  `empty-state refs: ${n(ALLH, /empty/g)} · catch blocks: ${n(ALLH, /catch\s*\(/g)}`);
add('17', 'semantic-color', 'Semantic (not decorative) color usage',
  'Status colors semantic hon — inventory/financial/pending/completed ke liye alag tokens',
  !has(STYLES, /--c-fin|--c-inv|--c-pending/),
  `financial/inventory/pending tokens: ${has(STYLES, /--c-fin|--c-inv|--c-pending/)}`);

/* ============================ §18/20 BROKEN & DUPLICATE ================== */
add('18', 'broken-dayreport-pdf', 'BROKEN: shop.dayReport.pdf calls a missing function',
  'Koi bhi route aisi function call na kare jo maujood hi na ho',
  has(GS['Code.gs'] || '', /Exports\.dayReportPdf\(/) && !has(ALL, /dayReportPdf\s*[:=]\s*function/),
  `Code.gs:297 → Exports.dayReportPdf(...) · Exports.gs mein dayReportPdf defined NAHI → PDF button dabate hi runtime error`,
  'HIGH', 'S');

const dupScreens = {};
Object.values(HTML).join('\n').replace(/registerScreen\(\s*'([a-z0-9]+)'/g, (m, id) => { dupScreens[id] = (dupScreens[id] || 0) + 1; return m; });
const dupes = Object.keys(dupScreens).filter(k => dupScreens[k] > 1);
add('18', 'duplicate-screens', 'Duplicate screen registrations',
  'Ek screen ID do baar register na ho',
  dupes.length > 0,
  dupes.length ? `${dupes.map(d => d + '×' + dupScreens[d]).join(', ')}` : 'none');

const urduOnly = n(ALLH, /[؀-ۿ][^<]{2,40}/g);
add('18', 'urdu-labels', 'Urdu-only labels/headings',
  'Har label/heading English + (Roman) Urdu dono mein — sirf Urdu nahi',
  urduOnly > 30,
  `${urduOnly} Urdu-script strings in templates (bilingual toggle maujood: ${has(ALLH, /Lang\.|lang\./)})`);

add('18', 'validation', 'Form validation coverage',
  'Required fields, numeric ranges, duplicate checks har form par',
  n(ALLH, /required:\s*true/g) < 15,
  `required:true fields: ${n(ALLH, /required:\s*true/g)} · throw new Error validations in .gs: ${n(ALL, /throw new Error/g)}`);

add('18', 'mobile-usability', 'Mobile usability / one-hand operation',
  'Mobile-first workflows (thumb reach, minimum taps)',
  !has(HTML['App_Orders.html'] || '', /thumb|one-hand|mobile/i) || n(ALLH, /@media \(max-width/g) < 10,
  `@media blocks: ${n(STYLES, /@media/g)} · mobile-first notes: ${n(ALLH, /thumb|one-hand/gi)}`);

/* ================================ OUTPUT ================================= */
const gaps = CHECKS.filter(c => c.gap);
const bySev = { HIGH: 0, MED: 0, LOW: 0 };
CHECKS.forEach(c => { if (c.gap) bySev[c.severity] = (bySev[c.severity] || 0) + 1; });

console.log('\n==============================================================');
console.log(' HASEEB AUTOS — APPLICATION-WIDE AUDIT');
console.log('==============================================================');
const SECTIONS = {};
CHECKS.forEach(c => {
  (SECTIONS[c.section] = SECTIONS[c.section] || []).push(c);
});
/* ============================ §20 END-TO-END QA ========================== */
const e2eSrc = fs.existsSync(path.join(ROOT, 'tools', 'test_e2e.js'))
  ? fs.readFileSync(path.join(ROOT, 'tools', 'test_e2e.js'), 'utf8') : '';
const e2eSteps = (e2eSrc.match(/section\('§20 · /g) || []).length;
const e2eInvariants = /negStock\(\)/.test(e2eSrc) && /AuditLog/.test(e2eSrc) &&
  /object Object/.test(e2eSrc);
add('20', 'e2e-qa', 'End-to-end QA: poora business cycle ek hi chal mein',
  'Shop kholo se din band tak poora flow chalay, har qadam par integrity check',
  !(e2eSteps >= 8 && e2eInvariants),
  `e2e steps: ${e2eSteps} · invariants (negative stock / audit trail / serialization): ${e2eInvariants}`);

Object.keys(SECTIONS).sort((a, b) => a - b).forEach(s => {
  const g = SECTIONS[s].filter(c => c.gap).length;
  console.log(`\n§${s}  ${g}/${SECTIONS[s].length} gaps`);
  SECTIONS[s].forEach(c => console.log(`   ${c.gap ? '✖' : '✔'} [${c.severity}] ${c.title}\n       ${c.evidence}`));
});
console.log('\n==============================================================');
console.log(` CHECKS: ${CHECKS.length}   GAPS: ${gaps.length}   (HIGH ${bySev.HIGH} · MED ${bySev.MED} · LOW ${bySev.LOW})`);
console.log('==============================================================');

/* report detail for §9 */
const repDetail = Object.keys(repMissing).map(g => ({ group: g, missing: repMissing[g] }));

if (process.argv.includes('--json')) {
  fs.writeFileSync(path.join(ROOT, 'release', 'app-audit.json'),
    JSON.stringify({ checks: CHECKS, reportGaps: repDetail, implementedReports: implemented,
      fontSizes: sizes, generated: new Date().toISOString() }, null, 2));
  console.log('  → release/app-audit.json');
}

/* ------------------------------------------------------------------ HTML -- */
const e = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const SEVC = { HIGH: '#b91c1c', MED: '#b45309', LOW: '#0369a1' };

const rows = CHECKS.map(c => {
  const sev = SEVC[c.severity];
  return `<tr>
   <td style="padding:6px 8px;border-bottom:1px solid #eef2f7;font-size:12px;white-space:nowrap">§${c.section}</td>
   <td style="padding:6px 8px;border-bottom:1px solid #eef2f7;font-size:12px"><b>${e(c.title)}</b>
     <div style="color:#64748b;font-size:11.5px;margin-top:2px">${e(c.requirement)}</div></td>
   <td style="padding:6px 8px;border-bottom:1px solid #eef2f7;font-size:11.5px;color:#475569">${e(c.evidence)}</td>
   <td style="padding:6px 8px;border-bottom:1px solid #eef2f7;text-align:center">
     <span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;color:#fff;background:${c.gap ? sev : '#15803d'}">${c.gap ? c.severity : 'OK'}</span></td>
   <td style="padding:6px 8px;border-bottom:1px solid #eef2f7;text-align:center;font-size:12px">${c.effort}</td>
  </tr>`;
}).join('');

const repRows = repDetail.map(g => `<tr><td style="padding:6px 8px;border-bottom:1px solid #eef2f7;font-size:12px"><b>${g.group}</b></td>
  <td style="padding:6px 8px;border-bottom:1px solid #eef2f7;font-size:12px">${g.missing.length
    ? g.missing.map(m => `<span style="display:inline-block;background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;border-radius:6px;padding:1px 7px;margin:2px 3px 2px 0;font-size:11px">${e(m)}</span>`).join('')
    : '<span style="color:#15803d">complete</span>'}</td></tr>`).join('');

const HTMLDOC = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Haseeb Autos — application-wide audit</title></head>
<body style="margin:0;background:#f6f8fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Noto Naskh Arabic',sans-serif;color:#0f172a">
<div style="max-width:1200px;margin:0 auto;padding:22px 18px 60px">
 <div style="background:linear-gradient(135deg,#0f172a,#1e293b);color:#fff;border-radius:14px;padding:20px 22px;margin-bottom:16px">
  <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#fca5a5">Haseeb Autos · حسیب آٹوز</div>
  <h1 style="margin:4px 0 2px;font-size:22px">Application-wide audit — gap checklist</h1>
  <div style="font-size:12px;color:#cbd5e1">Sections 1–20 of the enhancement brief ·
    ${CHECKS.length} machine-verified checks · generated ${new Date().toISOString().slice(0, 10)}</div>
 </div>

 <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px">
  ${[['Checks run', CHECKS.length, '#0369a1'], ['Gaps found', gaps.length, '#b91c1c'],
     ['High severity', bySev.HIGH, '#b91c1c'], ['Medium', bySev.MED, '#b45309'],
     ['Low', bySev.LOW, '#0369a1'], ['Already OK', CHECKS.length - gaps.length, '#15803d']]
    .map(([l, v, c]) => `<div style="flex:1 1 130px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;border-top:3px solid ${c}">
      <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em">${l}</div>
      <div style="font-size:24px;font-weight:800">${v}</div></div>`).join('')}
 </div>

 <section style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px 18px;margin-bottom:16px">
  <h2 style="margin:0 0 4px;font-size:15px">§9 — Report coverage (implemented vs required)</h2>
  <div style="font-size:12px;color:#64748b;margin-bottom:10px">${implemented.length} report endpoints implemented</div>
  <table style="width:100%;border-collapse:collapse"><tbody>${repRows}</tbody></table>
 </section>

 <section style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px 18px">
  <h2 style="margin:0 0 4px;font-size:15px">Full checklist — har check ke sath evidence</h2>
  <div style="font-size:12px;color:#64748b;margin-bottom:10px">Effort: S (&lt;1h) · M (half day) · L (1–2 days) · XL (multi-day)</div>
  <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">
   <thead><tr>
    <th style="text-align:left;padding:6px 8px;border-bottom:2px solid #cbd5e1;background:#f1f5f9;font-size:11px">§</th>
    <th style="text-align:left;padding:6px 8px;border-bottom:2px solid #cbd5e1;background:#f1f5f9;font-size:11px">Check</th>
    <th style="text-align:left;padding:6px 8px;border-bottom:2px solid #cbd5e1;background:#f1f5f9;font-size:11px">Evidence (measured)</th>
    <th style="text-align:center;padding:6px 8px;border-bottom:2px solid #cbd5e1;background:#f1f5f9;font-size:11px">Status</th>
    <th style="text-align:center;padding:6px 8px;border-bottom:2px solid #cbd5e1;background:#f1f5f9;font-size:11px">Effort</th>
   </tr></thead><tbody>${rows}</tbody></table></div>
 </section>

 <div style="font-size:11px;color:#64748b;text-align:center;padding-top:10px">
   Reproduce: <code>node tools/audit_app.js</code> · <code>node tools/audit_app.js --json</code>
 </div>
</div></body></html>`;

fs.writeFileSync(path.join(ROOT, 'release', 'app-audit.html'), HTMLDOC);
console.log(`  → release/app-audit.html  (${fs.statSync(path.join(ROOT, 'release', 'app-audit.html')).size.toLocaleString()} B)`);
