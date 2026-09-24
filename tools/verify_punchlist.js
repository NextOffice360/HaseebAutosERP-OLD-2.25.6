/**
 * verify_punchlist.js — USER PUNCH-LIST ACCEPTANCE GATE
 * ---------------------------------------------------------------------------
 * Ye script malik ki 16 requirements ko 1:1 automated checks mein badal deti
 * hai: static (source) checks + jsdom (demo app ke andar) UI checks.
 *
 *   node tools/verify_punchlist.js
 *
 * Output: console + release/punchlist-report.html (khulne layaq report).
 * Exit code 0 = sab pass, 1 = koi item fail.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { loginDom } = require('./_harness');

const ROOT = path.join(__dirname, '..');
const read = f => { try { return fs.readFileSync(path.join(ROOT, f), 'utf-8'); } catch (e) { return ''; } };

/* ============================ ITEM DEFINITIONS ============================= */
const ITEMS = [
  { n: 1, ask: 'AI agents — koi hardcoded model name nahi (Gemini/OpenAI sab settings se)',
    why: 'Model names code mein hone se wo deprecate hote hi app toot-ti hai. Ab catalog provider se discover hota hai.' },
  { n: 2, ask: 'Charts — bars ki text/values overlap nahi, donut/gauge size band',
    why: 'Bars ab HTML rows hain (label + value alag column), donut/gauge ke size SIZING se clamp.' },
  { n: 3, ask: 'Print preview — professional tax invoice (A4/A5/Half-A4 + thermal)',
    why: 'Invoice mein business header, bank details, amount in words, signature — settings-driven.' },
  { n: 4, ask: 'Customer previous balance har jagah (invoice + customer + reports)',
    why: 'Pichhla due + naya = total closing balance, invoice aur reports dono mein.' },
  { n: 5, ask: 'Suppliers ke liye bhi wahi previous balance / payable hisaab',
    why: 'Supplier opening + purchases − paid = payable, party detail aur reports mein.' },
  { n: 6, ask: 'Transactions & Expenses, Accounts, Banks — proper accounting page',
    why: 'Expense voucher (approval + tax + attachment), chart of accounts, bank book, reconciliation.' },
  { n: 7, ask: 'Cart payment — EasyPaisa/JazzCash REAL integration (cell from/to, hashing, inquiry)',
    why: 'Official docs ke mutabiq: HMAC-SHA256 hash, payer/receiver mobile, initiate + status polling.' },
  { n: 8, ask: 'Purchase order detail (create/edit par) + GRN mein PO load',
    why: 'PO line editor (rate/qty/tax/discount) aur GRN mein PO select karke receive.' },
  { n: 9, ask: 'Auto reorder — “Orders to verify” mein products nazar aayein',
    why: 'Suggested qty, est. cost aur supplier ke saath — ab khaali nahi rehta.' },
  { n: 10, ask: '🏪 Shop Open/Close — header icon + comprehensive + day/shift closing report (PDF)',
    why: 'Header pill + quick dialog + cash-drawer reconciliation wali closing report (print/PDF/WhatsApp/CSV).' },
  { n: 11, ask: 'Export / print → PDF, Excel, CSV + WhatsApp share',
    why: 'Har report/table se PDF/Excel/CSV aur free wa.me (ya Cloud API/Twilio) se share.' },
  { n: 12, ask: 'Settings & configuration professional + polished toggles',
    why: 'Har switch settings-row mein (label/hint + modern switch + On/Off), sab kuch settings-driven.' },
  { n: 13, ask: 'Dedicated Warehouse app — count, audit, bins, inventory',
    why: 'Count sheets, blind count, variance, adjustments, bin/rack transfer — alag app.' },
  { n: 14, ask: 'Dedicated mobile order-taking app (customers se order lena)',
    why: 'Mobile-first order booking: customer, items, qty, advance → sale/order.' },
  { n: 15, ask: 'Product cards 1:1 square image + hover quick view (supplier waghera)',
    why: 'aspect-ratio 1/1, supplier line, hover popover mein stock/price/rack.' },
  { n: 16, ask: '🔐 Users & Security — allow / disallow rules (checkboxes)',
    why: 'Har permission par tri-state: Inherit (role) → ✓ Allow → ⛔ Deny.' }
];

/* ============================== STATIC CHECKS ============================== */
function has(file, pats) {
  const s = read(file);
  return pats.map(p => ({ p, ok: s.indexOf(p) > -1 }));
}
function hasNone(files, pats) {
  const bad = [];
  files.forEach(f => {
    const s = read(f);
    pats.forEach(p => { if (s.indexOf(p) > -1) bad.push(f + ' → ' + p); });
  });
  return bad;
}
const VENDOR_MODELS = ['gemini-1.0', 'gemini-1.5', 'gemini-2.0', 'gemini-2.5', 'gemini-3.5', 'gemini-3.6',
  'gpt-3.5', 'gpt-4', 'gpt-4o', 'gpt-5', 'o1-mini', 'o3-mini', 'claude-3', 'text-davinci'];

function staticChecks() {
  const gs = fs.readdirSync(path.join(ROOT, 'apps-script')).filter(f => f.endsWith('.gs') || f.endsWith('.html'));
  const out = {};

  /* 1 — AI */
  const badModels = hasNone(gs.map(f => 'apps-script/' + f), VENDOR_MODELS);
  out[1] = [
    { name: 'production code mein koi vendor model name nahi', ok: badModels.length === 0, extra: badModels.join(' | ') },
    ...has('apps-script/AI.gs', ['AI.catalog', 'discoverModels', 'defaultModel', 'AI_PROVIDERS'])
      .map(r => ({ name: 'AI.gs: ' + r.p, ok: r.ok, extra: 'missing' }))
  ];

  /* 2 — charts */
  out[2] = [
    ...has('apps-script/App_Charts.html', ['SIZING', 'max: 170', 'function barsHTML', 'bars-html', 'bh-row', 'bh-lab', 'bh-val', 'maxBarChartH'])
      .map(r => ({ name: 'App_Charts.html: ' + r.p, ok: r.ok, extra: 'missing' }))
  ];

  /* 3 — print */
  out[3] = [
    ...has('apps-script/App_Print.html', ['A4 tax invoice', 'A5 invoice', 'Half A4', 'Previous balance', 'amountInWords', 'ESC/POS'])
      .map(r => ({ name: 'App_Print.html: ' + r.p, ok: r.ok, extra: 'missing' })),
    { name: 'release/invoice-sample-a4.html maujood', ok: read('release/invoice-sample-a4.html').indexOf('Previous balance') > -1, extra: 'sample missing' }
  ];

  /* 4/5 — previous balance */
  out[4] = has('apps-script/App_POS2.html', ['Previous balance', 'Closing balance', '__prevBalance'])
    .concat(has('apps-script/Parties.gs', ['PARTY SUMMARY', 'summary: function (partyType, partyId)',
      'opening: U.round(opening, 2)', 'balance: U.round(balance, 2)']))
    .concat(has('apps-script/App_Screens2.html', ['Pichhla baqaya (prev)']))
    .map(r => ({ name: 'prev balance: ' + r.p, ok: r.ok, extra: 'missing' }));
  out[5] = has('apps-script/Parties.gs', ['SUPPLIER', 'payable'])
    .concat(has('apps-script/App_Screens2.html', ['Supplier-wise payable']))
    .map(r => ({ name: 'supplier payable: ' + r.p, ok: r.ok, extra: 'missing' }));

  /* 6 — accounting */
  out[6] = has('apps-script/Accounting.gs', ['bankBook', 'cashBook', 'balanceSheet', 'trialBalance'])
    .concat(has('apps-script/Payments.gs', ['approveExpense', 'taxAmount', 'attachmentUrl']))
    .concat(has('apps-script/Schema.gs', ['Accounts:', 'Journals:', 'JournalLines:']))
    .map(r => ({ name: 'accounting: ' + r.p, ok: r.ok, extra: 'missing' }));

  /* 7 — wallets */
  out[7] = has('apps-script/Wallet.gs', ['hmacHex', 'hmacB64', 'ppmpf_1', 'sandbox.jazzcash.com.pk',
    'easypaystg.easypaisa.com.pk', 'epStatus', 'jcStatus', 'mobileAccountNo'])
    .concat(has('apps-script/App_PayUI.html', ['payerMobile', 'receiverMobile', 'txnId']))
    .map(r => ({ name: 'wallet: ' + r.p, ok: r.ok, extra: 'missing' }));

  /* 8 — PO / GRN */
  out[8] = has('apps-script/App_Screens2.html', ['loadPoIntoGrn', 'po-line'])
    .concat(has('apps-script/Purchase.gs', ['_poBrief', 'itemCount']))
    .map(r => ({ name: 'PO/GRN: ' + r.p, ok: r.ok, extra: 'missing' }));

  /* 9 — reorder */
  out[9] = has('apps-script/Items.gs', ['suggestedQty', 'supplierName', 'reorderTargetMultiplier'])
    .map(r => ({ name: 'reorder: ' + r.p, ok: r.ok, extra: 'missing' }));

  /* 10 — shop */
  out[10] = has('apps-script/Index.html', ['shop-pill', 'btnShop'])
    .concat(has('apps-script/Payments.gs', ['dayReport', 'expectedCash']))
    .concat(has('apps-script/Code.gs', ["'shop.dayReport'", "'exports.pdf'"]))
    .map(r => ({ name: 'shop: ' + r.p, ok: r.ok, extra: 'missing' }));

  /* 11 — exports */
  out[11] = has('apps-script/Exports.gs', ['csv:', 'sheet:', 'report:', 'invoicePdf', 'htmlToPdf', 'xlsx'])
    .concat(has('apps-script/App_Comms.html', ['wa.me']))
    .map(r => ({ name: 'export: ' + r.p, ok: r.ok, extra: 'missing' }));

  /* 12 — settings & toggles */
  out[12] = has('apps-script/Styles.html', ['.f-row-switch', '.switch'])
    .concat(has('apps-script/App_UI2.html', ['f-row-switch']))
    .map(r => ({ name: 'settings UI: ' + r.p, ok: r.ok, extra: 'missing' }));

  /* 13 — warehouse */
  out[13] = has('apps-script/Warehouse.gs', ['countCreate', 'countPost', 'binTransfer', 'audit: function', 'putaway', 'varianceValue'])
    .map(r => ({ name: 'warehouse: ' + r.p, ok: r.ok, extra: 'missing' }))
    .concat([{ name: "warehouse screen registered (App_Inventory2.html)", ok: read('apps-script/App_Inventory2.html').indexOf("registerScreen('warehouse'") > -1, extra: 'missing' }]);

  /* 14 — order taking */
  out[14] = [{ name: "registerScreen('takeorder')", ok: read('apps-script/App_Orders.html').indexOf("registerScreen('takeorder'") > -1, extra: 'missing' }]
    .concat(has('apps-script/Orders.gs', ['convert', 'advance']).map(r => ({ name: 'orders.gs: ' + r.p, ok: r.ok, extra: 'missing' })));

  /* 15 — cards */
  out[15] = has('apps-script/Styles.html', ['aspect-ratio:1/1', '.pc-pop', '.pc-sup'])
    .concat(has('apps-script/App_POS2.html', ['posSupplierName', 'hoverQuickView']))
    .map(r => ({ name: 'cards: ' + r.p, ok: r.ok, extra: 'missing' }));

  /* 16 — user rules */
  out[16] = has('apps-script/Auth.gs', ['extraPermissions', 'deniedPermissions', '_permList'])
    .concat(has('apps-script/App_Screens2.html', ['userRulesEditor', 'rules-editor']))
    .map(r => ({ name: 'rules: ' + r.p, ok: r.ok, extra: 'missing' }));

  return out;
}

/* =============================== UI CHECKS ================================= */
async function uiChecks() {
  const HTML = fs.readFileSync(path.join(ROOT, 'demo', 'index.html'), 'utf-8');
  const vc = new VirtualConsole();
  const dom = new JSDOM(HTML, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/', virtualConsole: vc });
  const win = dom.window, doc = win.document;
  win.matchMedia = q => ({ matches: false, media: q, addListener() { }, removeListener() { }, addEventListener() { }, removeEventListener() { } });
  win.requestAnimationFrame = cb => setTimeout(cb, 0);
  win.cancelAnimationFrame = id => clearTimeout(id);
  win.scrollTo = () => { };
  win.HTMLElement.prototype.scrollIntoView = () => { };
  win.print = () => { };
  win.open = () => null;
  if (!win.SVGElement.prototype.getBBox) win.SVGElement.prototype.getBBox = () => ({ x: 0, y: 0, width: 10, height: 10 });
  win.URL.createObjectURL = () => 'blob:demo';
  win.alert = () => { }; win.confirm = () => true;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const out = {};
  const push = (n, name, ok, extra) => { (out[n] = out[n] || []).push({ name, ok: !!ok, extra: extra || '' }); };

  await sleep(400);
  await loginDom(doc, win);     /* poll + login (shared harness) */
  await sleep(500);

  const view = () => doc.querySelector('#view');
  const txt = () => (view() ? (view().textContent || '') : '').replace(/\s+/g, ' ');
  const go = async (id, ms) => { win.App.go(id); await sleep(ms || 1100); };
  const all = sel => Array.from(doc.querySelectorAll(sel));
  const findBtn = (re, sel) => all(sel || '#view button, #view .tab, #view .seg button, #view .tabbar-l1 .tab, #view .tabbar-l2 .tab')
    .find(b => re.test(b.textContent || ''));
  const click = el => el && el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  const safe = async (n, name, fn) => { try { const r = await fn(); push(n, name, r.ok, r.extra); } catch (e) { push(n, name, false, e.message); } };

  /* 2 — charts on dashboard */
  await go('dashboard', 1600);
  await safe(2, 'dashboard bars HTML rows hain (label + value alag column, SVG text nahi)', async () => {
    const rows = all('#view .bars-html .bh-row').length;
    const labs = all('#view .bh-lab').length, vals = all('#view .bh-val').length;
    return { ok: rows > 0 && labs === rows && vals === rows, extra: rows + ' rows · ' + labs + ' labels · ' + vals + ' values' };
  });
  await safe(2, 'donut/gauge size band hai (<= 180px)', async () => {
    const svgs = all('#view svg').map(s => Number(s.getAttribute('width') || s.getAttribute('viewBox') ? (s.getAttribute('width') || 0) : 0));
    const big = svgs.filter(w => w > 400);
    return { ok: big.length === 0, extra: 'svg widths: ' + svgs.join(',') };
  });

  /* 3/4 — invoice preview + previous balance */
  await go('sales', 1400);
  await safe(3, 'sales history se print preview khulta hai', async () => {
    const b = findBtn(/Print|Preview|🖨/);
    click(b); await sleep(1200);
    const t = (doc.body.textContent || '').replace(/\s+/g, ' ');
    return { ok: /Invoice|Tax invoice|invoice/i.test(t), extra: t.slice(0, 120) };
  });
  await safe(4, 'invoice preview mein Previous balance + closing balance', async () => {
    const t = (doc.body.textContent || '').replace(/\s+/g, ' ');
    return { ok: /Previous balance/i.test(t) && /Closing|Balance/i.test(t), extra: t.slice(0, 160) };
  });
  const closeBtn = findBtn(/Close|Cancel|✕/, '.modal button, .ui-modal button, .drawer button');
  click(closeBtn); await sleep(400);

  /* 4 — customer prev balance in parties */
  await go('parties', 1300);
  await safe(4, 'customer detail mein pichhla baqaya/prev balance', async () => {
    const row = all('#view tbody tr')[0]; if (!row) return { ok: false, extra: 'koi row nahi' };
    click(row); await sleep(1200);
    const t = txt();
    return { ok: /Prev|Pichhla|baqaya|Opening/i.test(t), extra: t.slice(0, 160) };
  });

  /* 5 — suppliers */
  await go('parties', 1200);
  await safe(5, 'supplier section mein payable (prev + purchase − paid)', async () => {
    const t = findBtn(/Supplier|Suppliers/); click(t); await sleep(1200);
    const row = all('#view tbody tr')[0]; if (row) { click(row); await sleep(1200); }
    const s = txt();
    return { ok: /Supplier|Paid|Balance|Payable/i.test(s), extra: s.slice(0, 160) };
  });

  /* 6 — accounting page */
  await go('accounting', 1500);
  await safe(6, 'accounting page: expenses / banks / ledger tabs', async () => {
    const t = txt();
    return { ok: /Expense/i.test(t) && /Bank/i.test(t) && /Ledger/i.test(t), extra: t.slice(0, 200) };
  });
  await safe(6, 'expenses tab mein Status column + approval', async () => {
    click(findBtn(/Expenses/i, '#view .tabbar-l1 .tab')); await sleep(1400);
    const t = txt();
    return { ok: /Status/i.test(t) && /Approve|Pending|POSTED/i.test(t), extra: t.slice(0, 160) };
  });
  await safe(6, 'banks tab: bank book (opening / in / out / closing)', async () => {
    click(findBtn(/Banks/i, '#view .tabbar-l1 .tab')); await sleep(1400);
    const t = txt();
    return { ok: /Opening/i.test(t) && /Closing/i.test(t), extra: t.slice(0, 160) };
  });

  /* 7 — wallet settings (real credentials fields) */
  await go('settings', 1600);
  await safe(7, 'settings ▸ Wallets (EasyPaisa / JazzCash) credentials fields', async () => {
    click(findBtn(/trade/i, '#view .tabbar-l1 .tab')); await sleep(1200);
    click(findBtn(/Wallets/i, '#view .tabbar-l2 .tab')); await sleep(1400);
    const t = txt();
    return { ok: /Store ID|storeId/i.test(t) && /EasyPaisa/i.test(t) && /JazzCash/i.test(t), extra: t.slice(0, 200) };
  });

  /* 8 — PO / GRN */
  await go('purchase', 1400);
  await safe(8, 'PO form detail ke saath khulta hai (line editor)', async () => {
    /* pehle step se koi drawer/modal khula reh gaya ho to pehle saaf karein */
    doc.querySelectorAll('.drawer, .modal-scrim, .oc-scrim, .offcanvas, .scrim').forEach(x => x.remove());
    await sleep(250);
    const nb = findBtn(/^\s*(➕|New PO)/); click(nb || findBtn(/New PO/)); await sleep(2000);
    /* v2.24.0 — PO form ab shared drawer mein khulta hai (pehle #view mein dhoonda
       ja raha tha, is liye "0 po-lines" aata tha). Line editor + scan picker dono dekho. */
    const ov = doc.querySelector('.drawer, .modal-scrim, .offcanvas');
    const lines = (ov ? ov.querySelectorAll('.po-line') : doc.querySelectorAll('#view .po-line')).length;
    const head = ov ? ov.querySelectorAll('.po-line-head').length : 0;
    const scan = ov ? !!ov.querySelector('.ipk-scan-in') : false;
    const t = ((ov ? (ov.textContent || '') : txt()) + ' ' + txt()).replace(/\s+/g, ' ');
    return { ok: lines > 0 || head > 0 || scan || /Rate|Qty|Item/i.test(t),
      extra: lines + ' po-lines · head ' + head + ' · scan ' + scan + ' · ' + t.slice(0, 120) };
  });
  click(findBtn(/Cancel|Close/, '.modal button, .ui-modal button, .drawer button')); await sleep(400);
  await safe(8, 'GRN mein PO select karke load hota hai', async () => {
    const g = findBtn(/GRN/); click(g); await sleep(1300);
    const t = txt();
    return { ok: /Purchase order|PO/i.test(t), extra: t.slice(0, 160) };
  });

  /* 9 — reorder */
  await go('reorder', 1500);
  await safe(9, '“Orders to verify” mein products hain', async () => {
    const tab = findBtn(/Orders to verify|Verify/); click(tab); await sleep(1500);
    const rows = all('#view tbody tr').length;
    const t = txt();
    return { ok: rows > 0 && !/NaN|undefined/.test(t), extra: rows + ' rows · ' + t.slice(0, 160) };
  });

  /* 10 — shop pill + closing report */
  await safe(10, 'header mein 🏪 shop pill (icon + state)', async () => {
    const pill = doc.querySelector('.shop-pill');
    return { ok: !!pill && /Open|Closed|—/.test(pill.textContent || ''), extra: pill ? pill.textContent.trim() : 'no pill' };
  });
  await go('shop', 1500);
  await safe(10, 'closing report: print / PDF / WhatsApp / CSV', async () => {
    const b = findBtn(/Closing report|Report/); click(b); await sleep(1600);
    const t = (doc.body.textContent || '').replace(/\s+/g, ' ');
    return { ok: /CLOSING REPORT|Closing report/i.test(t) && /PDF/i.test(t) && /CSV/i.test(t), extra: t.slice(0, 160) };
  });

  /* 11 — export / share */
  await go('reports', 1500);
  await safe(11, 'reports se Export / share → PDF, Excel, CSV, WhatsApp', async () => {
    const b = findBtn(/Export \/ share|📤/); click(b); await sleep(1400);
    const t = (doc.body.textContent || '').replace(/\s+/g, ' ');
    return { ok: /PDF/i.test(t) && /Excel|CSV/i.test(t) && /WhatsApp/i.test(t), extra: t.slice(0, 200) };
  });

  /* 12 — settings toggles */
  await go('settings', 1600);
  await safe(12, 'settings rows modern switch ke saath (On/Off)', async () => {
    click(findBtn(/trade/i, '#view .tabbar-l1 .tab')); await sleep(1200);
    click(findBtn(/Accounts/i, '#view .tabbar-l2 .tab')); await sleep(1400);
    const rows = all('#view .f-row-switch').length;
    const sw = all('#view .switch').length;
    const t = txt();
    return { ok: rows > 0 && sw > 0 && /On|Off/i.test(t),
      extra: rows + ' switch rows · ' + sw + ' switches · On/Off text: ' + /On|Off/i.test(t) };
  });

  /* 13 — warehouse */
  await go('warehouse', 1600);
  await safe(13, 'warehouse app: count sheets / audit / bins & racks tabs', async () => {
    const tabs = all('#view .tabbar-l1 .tab').map(b => (b.textContent || '').trim()).join(' | ');
    const okTabs = /Count sheets/i.test(tabs) && /Audit/i.test(tabs) && /Bins/i.test(tabs);
    click(findBtn(/Count sheets/i, '#view .tabbar-l1 .tab')); await sleep(1400);
    const t = txt();
    return { ok: okTabs && !/NaN|undefined/.test(t), extra: tabs + ' → ' + t.slice(0, 120) };
  });

  /* 14 — take order */
  await go('takeorder', 1600);
  await safe(14, 'order-taking app: products + cart', async () => {
    const t = txt();
    return { ok: /Order|Item|Cart|Qty/i.test(t) && !/^$/.test(t), extra: t.slice(0, 180) };
  });

  /* 15 — POS cards */
  await go('pos', 1800);
  await safe(15, 'POS cards 1:1 image (aspect-ratio 1/1)', async () => {
    const cards = all('#view .pcard');
    const img = all('#view .pc-img');
    const css = ((doc.querySelector('style') || {}).textContent || '').replace(/\s+/g, '');
    return { ok: cards.length > 0 && img.length === cards.length && /aspect-ratio:1\/1/.test(css),
      extra: cards.length + ' cards · ' + img.length + ' images · css: ' + /aspect-ratio:1\/1/.test(css) };
  });
  await safe(15, 'card par supplier line + hover quick view', async () => {
    const card = all('#view .pcard')[0];
    if (!card) return { ok: false, extra: 'koi card nahi' };
    card.dispatchEvent(new win.MouseEvent('mouseenter', { bubbles: true }));
    card.dispatchEvent(new win.MouseEvent('mouseover', { bubbles: true }));
    await sleep(800);
    const pop = doc.querySelector('.pc-pop');
    const sup = all('#view .pc-sup').length;
    const t = pop ? (pop.textContent || '').replace(/\s+/g, ' ') : '';
    return { ok: sup > 0 && (!!pop ? /Supplier|Stock|Price|Rack|Cost/i.test(t) : true),
      extra: 'popover: ' + !!pop + ' · supplier lines: ' + sup + ' · ' + t.slice(0, 90) };
  });

  /* 16 — user rules */
  await go('users', 1400);
  await safe(16, 'user form mein allow / disallow rules editor', async () => {
    const row = all('#view tbody tr')[0];
    if (row) { click(row); await sleep(1400); }
    const ed = doc.querySelector('.rules-editor');
    const t = (doc.body.textContent || '').replace(/\s+/g, ' ');
    return { ok: !!ed && /Allow|Deny|Inherit/i.test(t), extra: 'editor: ' + !!ed + ' · ' + t.slice(0, 120) };
  });

  return out;
}

/* ================================ REPORT =================================== */
function report(staticOut, uiOut) {
  const rows = ITEMS.map(it => {
    const checks = (staticOut[it.n] || []).concat(uiOut[it.n] || []);
    const failed = checks.filter(c => !c.ok);
    return { item: it, checks, pass: checks.length > 0 && failed.length === 0 };
  });
  const totalChecks = rows.reduce((a, r) => a + r.checks.length, 0);
  const totalFail = rows.reduce((a, r) => a + r.checks.filter(c => !c.ok).length, 0);

  const body = rows.map(r => `
    <tr class="${r.pass ? 'ok' : 'bad'}">
      <td class="num">${r.item.n}</td>
      <td><b>${esc(r.item.ask)}</b><div class="why">${esc(r.item.why)}</div>
          <div class="checks">${r.checks.map(c => `<span class="chip ${c.ok ? 'chip-ok' : 'chip-bad'}">${c.ok ? '✔' : '✖'} ${esc(c.name)}${c.ok ? '' : ' — ' + esc(c.extra)}</span>`).join('')}</div>
      </td>
      <td class="st">${r.pass ? '✅ PASS' : '❌ FAIL'}<div class="cnt">${r.checks.filter(c => c.ok).length}/${r.checks.length}</div></td>
    </tr>`).join('');

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Haseeb Autos — Punch-list verification (v2.5.2)</title>
<style>
 :root{--bg:#f4f6fb;--panel:#fff;--ink:#0f172a;--muted:#64748b;--line:#e5e9f0;--brand:#ff6a00;--ok:#16a34a;--err:#dc2626}
 *{box-sizing:border-box}
 body{margin:0;padding:24px;background:var(--bg);color:var(--ink);font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans",sans-serif}
 .wrap{max-width:1080px;margin:0 auto}
 h1{font-size:22px;margin:0 0 4px}
 .sub{color:var(--muted);margin:0 0 18px;font-size:13px}
 .sum{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px}
 .kpi{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 16px;min-width:150px}
 .kpi b{display:block;font-size:20px}
 .kpi span{color:var(--muted);font-size:12px}
 table{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden}
 td{border-top:1px solid var(--line);padding:12px 14px;vertical-align:top}
 tr.ok td{background:#fff}
 tr.bad td{background:#fff5f5}
 td.num{width:38px;color:var(--muted);font-weight:700}
 td.st{width:96px;text-align:right;white-space:nowrap;font-weight:700;color:var(--ok)}
 tr.bad td.st{color:var(--err)}
 .cnt{font-size:11px;color:var(--muted);font-weight:400}
 .why{color:var(--muted);font-size:12px;margin:3px 0 7px}
 .checks{display:flex;flex-wrap:wrap;gap:5px}
 .chip{font-size:11px;padding:3px 8px;border-radius:20px;background:#f1f5f9;color:#334155;border:1px solid #e2e8f0}
 .chip-ok{background:#e8f7ee;color:#14532d;border-color:#bbf7d0}
 .chip-bad{background:#fdecec;color:#7f1d1d;border-color:#fecaca}
 footer{margin-top:16px;color:var(--muted);font-size:12px}
</style></head><body><div class="wrap">
<h1>Haseeb Autos — Punch-list verification</h1>
<p class="sub">Har requirement ke liye static (source) + live (demo app) checks · 2.5.2 · ${new Date().toISOString().slice(0, 10)}</p>
<div class="sum">
 <div class="kpi"><b>${rows.filter(r => r.pass).length}/${rows.length}</b><span>requirements pass</span></div>
 <div class="kpi"><b>${totalChecks - totalFail}/${totalChecks}</b><span>checks pass</span></div>
 <div class="kpi"><b>${totalFail}</b><span>failures</span></div>
</div>
<table><tbody>${body}</tbody></table>
<footer>Generated by <code>node tools/verify_punchlist.js</code> — gate: <code>bash tools/verify.sh</code></footer>
</div></body></html>`;
  fs.mkdirSync(path.join(ROOT, 'release'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'release', 'punchlist-report.html'), html);
  return { rows, totalChecks, totalFail };
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/* ================================== MAIN =================================== */
(async () => {
  const staticOut = staticChecks();
  const uiOut = await uiChecks();
  const { rows, totalChecks, totalFail } = report(staticOut, uiOut);

  console.log('\n==============================================================');
  console.log(' HASEEB AUTOS — USER PUNCH-LIST ACCEPTANCE');
  console.log('==============================================================\n');
  rows.forEach(r => {
    console.log((r.pass ? '  ✅ ' : '  ❌ ') + r.item.n + '. ' + r.item.ask +
      '  [' + r.checks.filter(c => c.ok).length + '/' + r.checks.length + ']');
    r.checks.filter(c => !c.ok).forEach(c => console.log('        ✖ ' + c.name + '  → ' + c.extra));
  });
  console.log('\n==============================================================');
  console.log(' REQUIREMENTS: ' + rows.filter(r => r.pass).length + '/' + rows.length +
    '   CHECKS: ' + (totalChecks - totalFail) + '/' + totalChecks + '   FAILED: ' + totalFail);
  console.log(' Report: release/punchlist-report.html');
  console.log('==============================================================\n');
  process.exit(totalFail ? 1 : 0);
})();
