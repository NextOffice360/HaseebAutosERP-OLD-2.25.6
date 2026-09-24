/**
 * tools/test_inventory_all.js — v2.30.0 gate (N10)
 * ============================================================================
 * User ki shikayat: "naye install par Items/Inventory/Stock Levels mein koi
 * product nahi dikhta jab tak PO → GRN se stock na aaye."
 *
 * ROOT CAUSE: `Inventory.levels()` list SIRF `Stock` rows se banti thi. Naye
 * install par Stock table khali hoti hai (catalog Items mein hota hai) → page
 * khali. Fix: list ab **Items (catalog) se** banti hai + Stock LEFT JOIN.
 *
 * Ye gate do hisson mein sabit karta hai:
 *   PART 1 — backend (asli `.gs` code, fresh sandbox):
 *     ① setupAll ke baad har item levels mein (scope:'all') — 0 stock par bhi
 *     ② brand-new item (koi Stock row nahi) bhi nazar aata hai: qty 0 · stocked false · OUT
 *     ③ scope:'stocked' purana view barqarar (sirf stock wale) — default bhi wahi
 *     ④ stockStatus filters: out / low / in
 *     ⑤ purane saare fields + filters (q, category, lowOnly, zeroOnly, sort) kaam karte hain
 *     ⑥ GRN jaisa posting (Inventory.post) ke baad wahi item stocked ho jata hai
 *     ⑦ items.list (Items screen) stock ke baghair bhi item deta hai
 *   PART 2 — rendered DOM (demo): All inventory tab default · OUT rows · status filter ·
 *     search · column show/hide · Stock levels tab mojood · 0 page errors
 *
 *   node tools/test_inventory_all.js [file|http]      (~60s)
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

/* ============================== PART 1 — backend ========================== */
console.log('\n\x1b[1mPART 1 — backend: catalog har item dikhata hai (naya install)\x1b[0m');
s.setupAll();
const login = s.api('auth.login', { username: 'owner', password: 'admin123' });
if (!login.ok) { console.log('login fail: ' + JSON.stringify(login.error)); process.exit(1); }
const TOKEN = login.data.token;
const api = (action, payload) => {
  const r = s.api(action, Object.assign({ token: TOKEN }, payload || {}));
  if (!r || !r.ok) throw new Error(action + ': ' + ((r && r.error && r.error.message) || 'fail'));
  return r.data;
};

const itemsTotal = s.DB.all('Items').filter(r => String(r.status) !== 'DELETED').length;
const stockRows0 = s.DB.count('Stock');
const all0 = api('stock.levels', { scope: 'all' });
const stocked0 = api('stock.levels', { scope: 'stocked' });
ok(all0.length >= itemsTotal, '① har catalog item levels mein (scope:all)', all0.length + ' rows / ' + itemsTotal + ' items');
ok(all0.length >= stocked0.length, '② catalog view kam az kam stock view jitna bara hai', all0.length + ' vs ' + stocked0.length);
ok(stocked0.every(r => r.stocked === true), '③ scope:stocked = sirf stock wale (purana view)');

/* brand-new item: koi Stock row hi nahi (naye install jaisa) */
/* asli "GRN se pehle" scenario: catalog row mojood hai magar is branch ke liye
   koi Stock row NAHI (imports / nayi branch / seed ke baad yehi halat hoti hai) */
const NEWCODE = 'TEST-NO-STOCK-' + Date.now().toString().slice(-5);
const inserted = s.DB.insert('Items', { code: NEWCODE, name: 'Gate Test Item (no stock)', unit: 'PCS',
  category: 'Test', brand: 'GateBrand', costPrice: 100, retailPrice: 150, minStock: 2, reorderLevel: 4,
  status: 'ACTIVE', createdAt: s.U.iso(), updatedAt: s.U.iso() });
const newId = inserted.id;
ok(!!newId, '④ catalog item bana (stock ke baghair)', String(newId));
ok(!s.DB.findOne('Stock', r => r.itemId === newId), '⑤ is item ki koi Stock row NAHI (yehi asli bug scenario tha)');

const all1 = api('stock.levels', { scope: 'all' });
const mine = all1.filter(r => r.itemId === newId)[0];
ok(!!mine, '⑥ 0-stock item banaya gaya to All Inventory mein foran nazar aata hai (YEHI BUG THA)');
ok(mine && Number(mine.qty) === 0 && mine.stocked === false && mine.hasQty === false && mine.stockStatus === 'out',
  '⑦ qty 0 · stocked false · hasQty false · stockStatus out',
  JSON.stringify(mine && { q: mine.qty, st: mine.stocked, hq: mine.hasQty, ss: mine.stockStatus }));
ok(api('stock.levels', { scope: 'stocked' }).filter(r => r.itemId === newId).length === 0,
  '⑧ Stock levels (scope:stocked) mein nahi aata — dono views ka farq saaf');
const qtyOnly = api('stock.levels', { scope: 'all' }).filter(r => r.hasQty);
ok(qtyOnly.every(r => r.qty > 0) && qtyOnly.length > 0, '⑧b hasQty boolean sahi (UI ka "sirf stock wale" filter)', qtyOnly.length + ' rows');
ok(api('stock.levels', { scope: 'all' }).length === all1.length, '⑨ default (koi scope nahi) purana view deta hai — backward compatible');

const outRows = api('stock.levels', { scope: 'all', stockStatus: 'out' });
ok(outRows.some(r => r.itemId === newId) && outRows.every(r => r.qty === 0),
  '⑩ stockStatus=out filter: sirf out-of-stock rows', outRows.length + ' rows');
const inRows = api('stock.levels', { scope: 'all', stockStatus: 'in' });
ok(inRows.every(r => r.stockStatus === 'in') && inRows.length > 0, '⑪ stockStatus=in filter kaam karta hai', inRows.length + ' rows');
const lowRows = api('stock.levels', { scope: 'all', stockStatus: 'low' });
ok(lowRows.every(r => r.stockStatus === 'low'), '⑫ stockStatus=low filter kaam karta hai', lowRows.length + ' rows');

/* purane fields + filters (feature removal nahi) */
const LEGACY = ['itemId', 'code', 'name', 'brand', 'category', 'unit', 'rack', 'locationId', 'qty', 'avgCost', 'value',
  'retailPrice', 'minStock', 'reorderLevel', 'status', 'low'];
ok(LEGACY.every(k => k in (all1[0] || {})), '⑬ purane saare fields barqarar (kuch hataya nahi)',
  LEGACY.filter(k => !(k in (all1[0] || {}))).join(',') || 'sab mojood');
ok(api('stock.levels', { scope: 'all', q: NEWCODE }).length === 1, '⑭ q search kaam karta hai (code se)');
ok(api('stock.levels', { scope: 'all', category: 'Test' }).every(r => r.category === 'Test'), '⑮ category filter barqarar');
ok(api('stock.levels', { scope: 'all', brand: 'GateBrand' }).length === 1, '⑯ brand filter (naya, All Inventory ke liye)');
ok(api('stock.levels', { scope: 'all', zeroOnly: true }).every(r => r.qty === 0), '⑰ zeroOnly filter barqarar');
const sortedDesc = api('stock.levels', { scope: 'all', sort: 'retailPrice', dir: 'desc' });
ok(Number(sortedDesc[0].retailPrice) >= Number(sortedDesc[sortedDesc.length - 1].retailPrice), '⑱ sorting barqarar (dir:desc)');
const listRes = api('items.list', {});
const listRows = Array.isArray(listRes) ? listRes : (listRes.rows || listRes.data || []);
ok(listRows.some(r => r.id === newId), '⑲ Items screen (items.list) bhi 0-stock item dikhata hai',
  listRows.length + ' rows');

/* GRN jaisa posting → wahi item stocked ho jata hai */
s.Inventory.post(newId, login.data.session.defaultLocationId, 7, 100, 'GRN', 'GATE-TEST', login.data.session, 'gate');
const after = api('stock.levels', { scope: 'stocked' }).filter(r => r.itemId === newId)[0];
ok(!!after && Number(after.qty) === 7, '⑳ GRN jaisa posting ke baad Stock levels mein aa gaya (qty 7)',
  JSON.stringify(after && { q: after.qty, st: after.stockStatus }));
ok(after && after.stockStatus === 'in', '㉑ 7 qty (reorder 4) → stockStatus in', after && after.stockStatus);
ok(api('stock.levels', { scope: 'all', stockStatus: 'out' }).filter(r => r.itemId === newId).length === 0,
  '㉒ ab wahi item "out of stock" filter se nikal gaya');

/* ============================== PART 2 — DOM ============================== */
(async () => {
  const puppeteer = require('puppeteer');
  const TARGET = process.argv[2] || ('file://' + path.join(ROOT, 'demo', 'index.html'));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  console.log('\n\x1b[1mPART 2 — rendered DOM: All inventory + Stock levels\x1b[0m');
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
  await sleep(1400);
  await page.evaluate(() => App.go('inventory'));
  await page.waitForFunction(() => document.querySelectorAll('.tabbar-l1 .tab').length > 0, { timeout: 20000 });
  await sleep(1600);

  const tabs = await page.evaluate(() => Array.from(document.querySelectorAll('.tabbar-l1 .tab')).map(b => b.dataset.id + ':' + (b.textContent || '').trim()));
  ok(tabs.some(t => t === 'all:All inventory'), '① "All inventory" tab maujood', tabs.join(' | ').slice(0, 160));
  ok(tabs.some(t => t.indexOf('stock:') === 0), '② "Stock levels" tab bhi maujood (purani feature nahi hui)');

  const grid = async () => page.evaluate(() => {
    const t = document.querySelector('.st2');
    if (!t) return { rows: 0 };
    const body = Array.from(t.querySelectorAll('tbody tr')).filter(tr => !tr.classList.contains('tbl-empty'));
    const head = Array.from(t.querySelectorAll('thead th')).map(th => (th.textContent || '').trim());
    return {
      rows: body.length,
      head: head,
      all: body.map(tr => Array.from(tr.children).map(td => (td.textContent || '').trim())),
      foot: (document.querySelector('.st2-foot') || {}).textContent || ''
    };
  });

  const activeBar = () => page.evaluate(() => {
    const w = document.querySelector('.tabs.l1');
    const on = w && w.querySelector('.tabbar-l1 .tab.on');
    return on ? on.dataset.id : '';
  });
  ok(await activeBar() === 'all', '③ All inventory default tab hai (kholte hi catalog dikhta hai)');


  /* search box se kisi item ko dhoond kar row parho (demo mein pagination hai — 19 pages) */
  const findRow = async (term) => page.evaluate(async (t) => {
    const q = document.querySelector('.st2-q');
    if (!q) return { ok: false };
    q.value = t; q.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 600));
    const rows = Array.from(document.querySelectorAll('.st2 tbody tr')).filter(tr => !tr.classList.contains('tbl-empty'));
    const head = Array.from(document.querySelectorAll('.st2 thead th')).map(th => (th.textContent || '').trim());
    const cells = rows.length ? Array.from(rows[0].children).map(td => (td.textContent || '').trim()) : [];
    const qtyIdx = head.findIndex(h => /qty/i.test(h));
    const statusIdx = head.findIndex(h => /status/i.test(h));
    return { ok: true, n: rows.length, head: head, cells: cells,
      qty: qtyIdx > -1 ? cells[qtyIdx] : '', status: statusIdx > -1 ? cells[statusIdx] : '',
      text: rows.map(tr => (tr.textContent || '')).join(' ') };
  }, term);

  /* search clear */
  const clearSearch = () => page.evaluate(async () => {
    const q = document.querySelector('.st2-q');
    if (q) { q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true })); }
    await new Promise(r => setTimeout(r, 400));
  });

  const g1 = await grid();
  ok(g1.rows > 0, '④ All inventory mein rows aaye (naye install par bhi catalog)', g1.rows + ' rows · head: ' + (g1.head || []).join('/'));
  ok((g1.head || []).some(h => /Status/i.test(h)) && (g1.head || []).some(h => /Qty/i.test(h)),
    '⑤ Qty aur Status columns mojood (catalog vs stock ka farq saaf)');
  const zero = await findRow('CAT-001');
  ok(zero.ok && zero.n === 1 && /out/i.test(zero.status) && Number(zero.qty) === 0,
    '⑥ 0-stock product par "OUT" badge + qty 0 (catalog item GRN se pehle bhi nazar aata hai)',
    JSON.stringify({ n: zero.n, qty: zero.qty, status: zero.status }));
  const stockedGal = await findRow('BRK-001');
  ok(stockedGal.ok && stockedGal.n === 1 && /(in|low)/i.test(stockedGal.status) && Number(stockedGal.qty) > 0,
    '⑥b stock wala product IN/LOW badge ke sath (dono halat ek hi table mein)',
    JSON.stringify({ qty: stockedGal.qty, status: stockedGal.status }));
  await clearSearch();
  const foot = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('.st2-foot')).map(e => (e.textContent || '').trim())
      .find(t => /products \(catalog\)/i.test(t));
    return el || '';
  });
  ok(/products \(catalog\)/i.test(foot) && /out of stock/i.test(foot) && /stock value/.test(foot),
    '⑦ footer mein catalog totals (products · out of stock · low · stock value)', foot.slice(0, 110));

  /* --- status filter: Out of stock --- */
  const filtered = await page.evaluate(async () => {
    const sel = Array.from(document.querySelectorAll('.st2-f')).find(el => el.tagName === 'SELECT' &&
      Array.from(el.options).some(o => /Out of stock/i.test(o.textContent)));
    if (!sel) return { ok: false };
    sel.value = 'out';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 500));
    const body = Array.from(document.querySelectorAll('.st2 tbody tr')).filter(tr => !tr.classList.contains('tbl-empty'));
    return { ok: true, n: body.length,
      allOut: body.every(tr => /OUT/.test(tr.textContent)),
      qtyZero: body.every(tr => { const tds = Array.from(tr.children).map(td => (td.textContent || '').trim()); return tds.every(c => !/^\d+(\.\d+)?$/.test(c) || Number(c) === 0); }) };
  });
  ok(filtered.ok && filtered.n > 0 && filtered.allOut, '⑧ "Out of stock" filter: sirf OUT rows', JSON.stringify({ n: filtered.n, allOut: filtered.allOut }));
  const qtyZero = await page.evaluate(() => {
    const head = Array.from(document.querySelectorAll('.st2 thead th')).map(th => (th.textContent || '').trim());
    const qi = head.findIndex(h => /qty/i.test(h));
    const rows = Array.from(document.querySelectorAll('.st2 tbody tr')).filter(tr => !tr.classList.contains('tbl-empty'));
    return { qi: qi, bad: rows.map(tr => (tr.children[qi] || {}).textContent || '').filter(t => Number(String(t).replace(/[^\d.-]/g, '')) !== 0) };
  });
  ok(qtyZero.qi > -1 && qtyZero.bad.length === 0, '⑨ filtered rows ka Qty column sirf 0 hai', JSON.stringify(qtyZero).slice(0, 120));

  /* --- search --- */
  const searched = await page.evaluate(async () => {
    const q = document.querySelector('.st2-q');
    if (!q) return { ok: false };
    const before = document.querySelectorAll('.st2 tbody tr').length;
    q.value = 'ZZZ-NO-MATCH-GATE';
    q.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 500));
    const empty = document.querySelectorAll('.st2 tbody tr').length;
    q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 400));
    return { ok: true, before, empty, back: document.querySelectorAll('.st2 tbody tr').length };
  });
  ok(searched.ok && searched.empty < searched.before && searched.back === searched.before,
    '⑩ search filter kaam karta hai (aur clear karne par wapas)', JSON.stringify(searched));

  /* --- column show/hide --- */
  const cols = await page.evaluate(async () => {
    const btn = Array.from(document.querySelectorAll('.st2-right button')).find(b => /Columns/i.test(b.textContent || ''));
    if (!btn) return { ok: false };
    const headBefore = document.querySelectorAll('.st2 thead th').length;
    btn.click();
    await new Promise(r => setTimeout(r, 400));
    const boxes = Array.from(document.querySelectorAll('.modal2 .chk input[type=checkbox]'));
    if (!boxes.length) return { ok: false, why: 'column picker khula nahi' };
    const target = boxes[0];
    target.checked = false; target.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 400));
    const headAfter = document.querySelectorAll('.st2 thead th').length;
    target.checked = true; target.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    const close = Array.from(document.querySelectorAll('.modal2 .m-actions button, .modal2 .modal-actions button')).pop();
    if (close) close.click();
    await new Promise(r => setTimeout(r, 300));
    return { ok: true, headBefore, headAfter, restored: document.querySelectorAll('.st2 thead th').length };
  });
  ok(cols.ok && cols.headAfter === cols.headBefore - 1 && cols.restored === cols.headBefore,
    '⑪ column show/hide kaam karta hai (Columns button)', JSON.stringify(cols));

  /* --- Stock levels tab (purani feature) --- */
  await page.evaluate(() => { const b = document.querySelector('.tabbar-l1 .tab[data-id="stock"]'); if (b) b.click(); });
  await page.waitForFunction(() => !!document.querySelector('.st2'), { timeout: 15000 }).catch(() => { });
  await sleep(1200);
  const g2 = await grid();
  ok(g2.rows > 0, '⑫ Stock levels tab abhi bhi kaam karta hai', g2.rows + ' rows');
  const beforeZero = await findRow('CAT-001');           /* default (stocked) view */
  await clearSearch();
  const toggled = await page.evaluate(async () => {
    const cb = document.querySelector('#stkZero');
    if (!cb) return { ok: false };
    cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 1600));
    return { ok: true, foot: Array.from(document.querySelectorAll('.st2-foot')).map(e => e.textContent || '').join(' | ').slice(0, 120) };
  });
  const afterZero = await findRow('CAT-001');            /* switch ke baad (all) */
  await clearSearch();
  ok(beforeZero.ok && beforeZero.n === 0, '⑬ Stock levels (default) mein 0-stock item nahi hota (purana view waisa hi)', JSON.stringify({ n: beforeZero.n }));
  ok(toggled.ok && afterZero.ok && afterZero.n === 1 && /out/i.test(afterZero.status),
    '⑬b "Zero-stock items bhi dikhayein" switch ke baad wahi item is table mein bhi aa jata hai',
    JSON.stringify({ n: afterZero.n, status: afterZero.status, toggled: toggled.ok }));

  /* --- Items screen (catalog) bhi theek --- */
  await page.evaluate(() => App.go('items'));
  await sleep(1800);
  const itemsRows = await page.evaluate(() => Array.from(document.querySelectorAll('.st2 tbody tr')).filter(tr => !tr.classList.contains('tbl-empty')).length);
  ok(itemsRows > 0, '⑭ Items screen par products nazar aate hain (catalog)', itemsRows + ' rows');

  ok(errs.length === 0, '⑮ zero page errors', errs.slice(0, 3).join(' | ') || '0');
  await browser.close();
  console.log('\n\x1b[1mSUMMARY:\x1b[0m ' + pass + ' pass · ' + fail + ' fail · ' + (fail ? '\x1b[31mRED\x1b[0m' : '\x1b[32mGREEN\x1b[0m'));
  if (fail) { console.log(ERR.map(e => ' - ' + e).join('\n')); process.exit(1); }
})();
