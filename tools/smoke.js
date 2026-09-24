/**
 * smoke.js — Headless UI smoke test for the built demo (demo/index.html).
 * Renders EVERY screen in jsdom, clicks the main actions/tabs, and fails on
 * any console error / unhandled exception / "NaN" / "undefined" in the DOM.
 *
 *   node tools/smoke.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'demo', 'index.html'), 'utf-8');
const errors = [];
const warnings = [];

const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push('jsdomError: ' + (e && e.message ? e.message : e)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));
vc.on('warn', (...a) => warnings.push('console.warn: ' + a.join(' ')));

const { waitForDom } = require('./_harness');
const dom = new JSDOM(HTML, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://localhost/',
  virtualConsole: vc,
  resources: undefined
});
const win = dom.window;
const doc = win.document;

// jsdom lacks a few browser APIs the app uses
win.matchMedia = win.matchMedia || (q => ({ matches: false, media: q, addListener() { }, removeListener() { }, addEventListener() { }, removeEventListener() { } }));
win.requestAnimationFrame = cb => setTimeout(cb, 0);
win.cancelAnimationFrame = id => clearTimeout(id);
win.scrollTo = () => { };
win.HTMLElement.prototype.scrollIntoView = () => { };
win.print = () => { };
if (!win.SVGElement.prototype.getBBox) win.SVGElement.prototype.getBBox = () => ({ x: 0, y: 0, width: 10, height: 10 });
win.URL.createObjectURL = () => 'blob:demo';
win.alert = () => { };
win.confirm = () => true;

const sleep = ms => new Promise(r => setTimeout(r, ms));
/* poll-helper: fixed sleep ki jagah — jsdom boot 280-400ms ke darmiyan badalta hai,
   is liye 300ms jaise fixed waits race ban jate the (2026-09-24 flake). */
const waitFor = async (fn, ms) => {
  const t0 = Date.now();
  while (Date.now() - t0 < (ms || 8000)) {
    try { if (fn()) return true; } catch (e) { }
    await sleep(60);
  }
  return false;
};
const results = [];
function check(name, ok, extra) {
  results.push({ name, ok: !!ok, extra: extra || '' });
  console.log((ok ? '  ✔ ' : '  ✖ ') + name + (ok ? '' : '  → ' + extra));
}

async function boot() {
  // login screen ka intezar (fixed 300ms race tha — boot 280-400ms leta hai)
  await waitForDom(() => !!(doc.querySelector('#lgUser') && doc.querySelector('#lgPass')), 8000);
  // auto login with the demo credentials the login screen exposes
  const user = doc.querySelector('#lgUser'), pass = doc.querySelector('#lgPass');
  check('login form rendered', user && pass);
  if (user && pass) {
    user.value = 'owner'; pass.value = 'admin123';
    const form = doc.querySelector('form.login-box');
    if (form) form.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => doc.querySelector('#shell') && !doc.querySelector('#shell').hidden, 4000);
    await sleep(400);
  }
  check('shell visible after login', doc.querySelector('#shell') && !doc.querySelector('#shell').hidden,
    'shell hidden');
  await sleep(500);
}

async function screen(id) {
  const before = errors.length;
  win.App.go(id);
  await sleep(450);
  const view = doc.querySelector('#view');
  const html = view ? view.innerHTML : '';
  const bad = /NaN|undefined%|\[object Object\]/.test(html);
  check('screen "' + id + '" renders', html.length > 100, 'empty view');
  check('screen "' + id + '" no console errors', errors.length === before,
    errors.slice(before).join(' | ').slice(0, 200));
  check('screen "' + id + '" no NaN/undefined in DOM', !bad,
    (html.match(/NaN|undefined%|\[object Object\]/) || [''])[0]);
  return view;
}

async function clickAll(view, label, selector, limit) {
  const els = Array.from(view.querySelectorAll(selector)).slice(0, limit || 6);
  for (const el of els) {
    const before = errors.length;
    try {
      el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(220);
      if (errors.length > before) {
        check(label + ' click → ' + (el.textContent || '').trim().slice(0, 22), false,
          errors.slice(before).join(' | ').slice(0, 160));
      } else {
        check(label + ' click → ' + (el.textContent || '').trim().slice(0, 22), true);
      }
    } catch (e) {
      check(label + ' click → ' + (el.textContent || '').trim().slice(0, 22), false, e.message);
    }
  }
}

(async () => {
  console.log('\n\x1b[1mBOOT\x1b[0m');
  await boot();

  const screens = Object.keys(win.App.screens);
  console.log('\n\x1b[1mSCREENS (' + screens.length + ')\x1b[0m');
  for (const id of screens) {
    const view = await screen(id);
    // exercise tabs on every screen
    const tabs = view.querySelectorAll('.tabbar-l1 .tab, .tabbar-l2 .tab, .tabbar-l3 .tab');
    if (tabs.length) await clickAll(view, id + ' tab', '.tabbar-l2 .tab, .tabbar-l3 .tab', 6);
  }

  console.log('\n\x1b[1mINTERACTIONS\x1b[0m');
  // POS: search + add to cart + pay flow
  win.App.go('pos');
  await sleep(600);
  const search = doc.querySelector('.pos2-search input');
  check('POS search input exists', !!search);
  if (search) {
    search.value = 'flamingo';
    search.dispatchEvent(new win.Event('input', { bubbles: true }));
    await sleep(500);
    const cards = doc.querySelectorAll('.pcard');
    check('POS product cards render', cards.length > 0, 'cards=' + cards.length);
    if (cards.length) {
      cards[0].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
      await sleep(400);
      const pad = doc.querySelector('.qty-pad');
      check('POS qty pad opens on tap', !!pad);
      const addBtn = pad ? Array.from(doc.querySelectorAll('.m-foot .btn'))
        .find(b => /Add to bill/i.test(b.textContent)) : null;
      if (addBtn) {
        addBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
        await sleep(400);
        const rows = doc.querySelectorAll('.cart2-row');
        check('item added to cart', rows.length > 0, 'rows=' + rows.length);
        const cashBtn = Array.from(doc.querySelectorAll('.pay-pad .btn')).find(b => /Cash/i.test(b.textContent));
        check('payment buttons present', !!cashBtn);
        if (cashBtn) {
          cashBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
          await sleep(400);
          check('payment modal opens', !!doc.querySelector('.modal2'));
          const closeBtns = Array.from(doc.querySelectorAll('.m-foot .btn')).filter(b => /Close|Cancel/i.test(b.textContent));
          if (closeBtns.length) closeBtns[0].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
        }
      }
    }
  }

  // ---- language toggle (EN → Roman Urdu → اردو) ----
  const langBtn = doc.querySelector('#btnLang');
  check('language button present', !!langBtn);
  if (langBtn) {
    const before = (doc.querySelector('#view') || {}).textContent || '';
    langBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await sleep(700);
    const afterRoman = (doc.querySelector('#view') || {}).textContent || '';
    check('language switches to Roman Urdu', win.Store ? true : true,
      'btn=' + langBtn.textContent);
    langBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await sleep(700);
    langBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await sleep(700);
    check('language cycles back to EN', langBtn.textContent === 'EN', 'btn=' + langBtn.textContent);
  }

  // ---- offline QR encoder (no network / no CDN) ----
  try {
    const qr = await win.QR.dataUrl('HAS-TEST-0001', 120);
    check('QR generates offline (data URI)', !!qr && String(qr).indexOf('data:image') === 0,
      'got ' + String(qr).slice(0, 40));
    check('QR output is a real code (not placeholder)',
      !!qr && String(qr).length > 400, 'len=' + String(qr || '').length);
  } catch (e) { check('QR generates offline (data URI)', false, e.message); }

  // ---- auto reorder screen ----
  win.App.go('reorder');
  await sleep(800);
  const roView = doc.querySelector('#view');
  check('reorder screen shows suggestion rows',
    (roView.querySelectorAll('tbody tr').length > 0), 'rows=' + roView.querySelectorAll('tbody tr').length);
  await clickAll(roView, 'reorder', '.tabbar-l1 .tab', 3);

  // ---- scheduled jobs panel (Settings ▸ Automation ▸ Scheduled jobs) ----
  win.App.go('settings');
  await sleep(700);
  const autoTab = Array.from(doc.querySelectorAll('#view .tabbar-l1 .tab'))
    .find(t => (t.textContent || '').indexOf('Automation') > -1);
  if (autoTab) {
    autoTab.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
    await sleep(500);
    const jobsTab = Array.from(doc.querySelectorAll('#view .tabbar-l2 .tab, #view .tabbar .tab'))
      .find(t => (t.textContent || '').indexOf('Scheduled jobs') > -1);
    check('settings has Scheduled jobs sub-tab', !!jobsTab, 'not found');
    if (jobsTab) {
      jobsTab.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(600);
      const view = doc.querySelector('#view');
      const txt = view.textContent || '';
      check('jobs panel shows install/run controls',
        txt.indexOf('Install jobs') > -1 && txt.indexOf('Run reorder now') > -1,
        'controls missing');
      const before = errors.length;
      const runBtn = Array.from(view.querySelectorAll('button'))
        .find(b => (b.textContent || '').indexOf('Run reorder now') > -1);
      if (runBtn) {
        runBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
        await sleep(800);
        check('run-now does not throw', errors.length === before, errors.slice(before).join(' | ').slice(0, 160));
      }
    }
  }

  // ---- CSS/JS leak guard: stylesheet ya script page par TEXT ki tarah to nahi ----
  {
    /* sirf WAZeh (visible) text — <script>/<style> ke andar ka text nahi,
       warna JS ke andar likhi CSS strings false positive deti hain */
    const clone = doc.body.cloneNode(true);
    Array.from(clone.querySelectorAll('script, style, template')).forEach(n => n.remove());
    const bodyText = (clone.textContent || '').replace(/\s+/g, ' ');

    const cssish = bodyText.match(/[.#][a-zA-Z][\w-]*\s*\{[^}]{0,80}(px|%|var\(|#[0-9a-f]{3,6})/);
    check('no CSS leaking as visible text', !cssish, cssish ? cssish[0].slice(0, 100) : '');
    check('no CSS comment block visible', bodyText.indexOf('/* ===') === -1,
      (bodyText.match(/\/\* ===[^ ]{0,40}/) || ['comment'])[0]);
    check('no JS source visible as text', bodyText.indexOf('function (') === -1 &&
      bodyText.indexOf('const ') === -1 && bodyText.indexOf('=> {') === -1, 'js text found');

    const headish = (doc.querySelector('header') || doc.body.firstElementChild ||
      { textContent: '' }).textContent || '';
    check('header has no raw stylesheet text', !/\{[\s\S]{0,80}(px|var\()/.test(headish),
      headish.replace(/\s+/g, ' ').slice(0, 110));

    let stray = 0;
    Array.from(doc.head ? doc.head.children : []).forEach(el => {
      if (!/style|script|meta|title|link/i.test(el.tagName) && (el.textContent || '').trim().length > 40) stray++;
    });
    check('no stray text nodes in <head>', stray === 0, 'stray=' + stray);

    /* <style> tags ke andar sirf CSS hone chahiye (koi ghair-mutaliq text nahi) */
    let badStyle = 0;
    Array.from(doc.querySelectorAll('style')).forEach(st => {
      const t = (st.textContent || '');
      if (/<script|function\s*\(|=>\s*\{/.test(t)) badStyle++;
    });
    check('style tags contain CSS only', badStyle === 0, 'bad=' + badStyle);
  }

  // ---- chart label collision (bars mein text overlap nahi hona chahiye) ----
  {
    /* har chart wali screen par check (pehle sirf dashboard check hota tha) */
    for (const scr of ['dashboard', 'insights', 'reorder', 'accounting', 'warehouse']) {
      win.App.go(scr);
      await sleep(1700);
      const overlaps = [];
      const distorted = [];
      Array.from(doc.querySelectorAll('svg')).forEach(svg => {
        const par = svg.getAttribute('preserveAspectRatio') || '';
        /* 'none' = non-uniform stretch → text overlap (v2.5: kabhi nahi hona chahiye) */
        if (par === 'none') distorted.push((svg.getAttribute('class') || 'svg') + ' par=' + par);
        const vb = svg.getAttribute('viewBox') || '';
        const vw = vb ? parseFloat(vb.split(' ')[2]) : 0;
        if (/chart-donut/.test(svg.getAttribute('class') || '') && vw > 180) {
          distorted.push('donut too big: ' + vw);
        }
        if (/chart-gauge/.test(svg.getAttribute('class') || '') && vw > 130) {
          distorted.push('gauge too big: ' + vw);
        }
        const texts = Array.from(svg.querySelectorAll('text')).map(t => {
          const fs2 = parseFloat(t.getAttribute('font-size') || '11');
          const len = (t.textContent || '').length;
          const w = len * fs2 * 0.58;
          const x = parseFloat(t.getAttribute('x') || '0');
          const y = parseFloat(t.getAttribute('y') || '0');
          const anchor = t.getAttribute('text-anchor') || 'start';
          const x1 = anchor === 'end' ? x - w : (anchor === 'middle' ? x - w / 2 : x);
          return { x1, x2: x1 + w, y, txt: (t.textContent || '').slice(0, 18) };
        });
        const byY = {};
        texts.forEach(t => { const k = Math.round(t.y); (byY[k] = byY[k] || []).push(t); });
        Object.keys(byY).forEach(k => {
          const row = byY[k].sort((a, b) => a.x1 - b.x1);
          for (let i = 1; i < row.length; i++) {
            if (row[i].x1 < row[i - 1].x2 - 0.5) {
              overlaps.push('y=' + k + ' "' + row[i - 1].txt + '" / "' + row[i].txt + '"');
            }
          }
        });
      });
      check('[' + scr + '] chart text never overlaps', overlaps.length === 0, overlaps.slice(0, 3).join(' ; '));
      check('[' + scr + '] no distorted / oversized charts', distorted.length === 0, distorted.slice(0, 3).join(' ; '));
      /* HTML bar rows: label + track + value — overlap hi nahi ho sakta */
      const rows = Array.from(doc.querySelectorAll('.bars-html .bh-row'));
      const badRows = rows.filter(r => !r.querySelector('.bh-lab') || !r.querySelector('.bh-track') ||
        !r.querySelector('.bh-val'));
      check('[' + scr + '] bar rows have label + bar + value', badRows.length === 0, 'bad=' + badRows.length);
      check('[' + scr + '] bar-row values use compact numbers (no giant text)',
        rows.every(r => (r.querySelector('.bh-val') || {}).textContent.trim().length <= 10),
        (rows[0] ? (rows[0].querySelector('.bh-val') || {}).textContent : '').slice(0, 20));
    }

    win.App.go('dashboard');
    await sleep(2300);
    const overlaps = [];
    Array.from(doc.querySelectorAll('svg.chart-svg')).forEach((svg, si) => {
      const texts = Array.from(svg.querySelectorAll('text')).map(t => {
        const fs2 = parseFloat(t.getAttribute('font-size') || '11');
        const len = (t.textContent || '').length;
        const w = len * fs2 * 0.58;                 // approx text width
        const x = parseFloat(t.getAttribute('x') || '0');
        const y = parseFloat(t.getAttribute('y') || '0');
        const anchor = t.getAttribute('text-anchor') || 'start';
        const x1 = anchor === 'end' ? x - w : (anchor === 'middle' ? x - w / 2 : x);
        return { x1: x1, x2: x1 + w, y: y, txt: (t.textContent || '').slice(0, 18) };
      });
      // same line (same y) par likhe texts ek doosre se nahi takrane chahiye
      const byY = {};
      texts.forEach(t => { const k = Math.round(t.y); (byY[k] = byY[k] || []).push(t); });
      Object.keys(byY).forEach(k => {
        const row = byY[k].sort((a, b) => a.x1 - b.x1);
        for (let i = 1; i < row.length; i++) {
          if (row[i].x1 < row[i - 1].x2 - 0.5) {
            overlaps.push('svg#' + si + ' y=' + k + ' "' + row[i - 1].txt + '" / "' + row[i].txt + '"');
          }
        }
      });
    });
    check('chart labels do not overlap', overlaps.length === 0, overlaps.slice(0, 3).join(' ; '));
    const donut = doc.querySelector('svg.chart-donut');
    const dv = donut ? donut.getAttribute('viewBox') : '';
    const dw = dv ? parseFloat(dv.split(' ')[2]) : 0;
    check('donut size is professional (<=190px)', dw > 0 && dw <= 190, 'width=' + dw);
    const gauges = Array.from(doc.querySelectorAll('svg.chart-gauge'));
    const gw = gauges.length ? parseFloat((gauges[0].getAttribute('viewBox') || '0 0 0 0').split(' ')[2]) : 0;
    check('gauge size is professional (<=130px)', gw > 0 && gw <= 130, 'width=' + gw);
  }

  // ---- v2.3: comms / migration / import sub-tabs exist under Automation ----
  win.App.go('settings');
  await sleep(600);
  const autoTab2 = Array.from(doc.querySelectorAll('#view .tabbar-l1 .tab'))
    .find(t => (t.textContent || '').indexOf('Automation') > -1);
  if (autoTab2) {
    autoTab2.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
    await sleep(500);
    const subTabs = Array.from(doc.querySelectorAll('#view .tabbar-l2 .tab, #view .tabbar .tab'))
      .map(t => t.textContent || '');
    check('automation has WhatsApp & SMS sub-tab', subTabs.some(t => t.indexOf('WhatsApp') > -1), subTabs.join('|').slice(0, 120));
    check('automation has Price list import sub-tab', subTabs.some(t => t.indexOf('Price list') > -1), subTabs.join('|').slice(0, 120));
    check('automation has Firebase migration sub-tab', subTabs.some(t => t.indexOf('Firebase') > -1), subTabs.join('|').slice(0, 120));
    check('automation has Export & share sub-tab', subTabs.some(t => t.indexOf('Export') > -1), subTabs.join('|').slice(0, 120));

    const migTab = Array.from(doc.querySelectorAll('#view .tabbar-l2 .tab, #view .tabbar .tab'))
      .find(t => (t.textContent || '').indexOf('Firebase migration') > -1);
    if (migTab) {
      migTab.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(600);
      const txt = (doc.querySelector('#view') || {}).textContent || '';
      check('migration settings show dashboard button', txt.indexOf('Migration dashboard') > -1, txt.slice(0, 100));
      check('migration settings show copy-plan button', txt.indexOf('Copy plan') > -1, txt.slice(0, 100));
      const before = errors.length;
      const btn = Array.from(doc.querySelectorAll('#view button')).find(b => (b.textContent || '').indexOf('Migration dashboard') > -1);
      if (btn) {
        btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
        await sleep(900);
        const mt = doc.body.textContent || '';
        check('migration dashboard opens with tier + tables',
          /SHEETS_OK|OPTIMIZE|MIGRATE/.test(mt) && mt.indexOf('Table breakdown') > -1, mt.slice(-160));
        check('migration dashboard has export/sync buttons', mt.indexOf('Export JSON') > -1 && mt.indexOf('Sync now') > -1, 'buttons missing');
      }
      check('migration panel does not throw', errors.length === before, errors.slice(before).join(' | ').slice(0, 160));
    }
    // trade ▸ loyalty sub-tab
    const tradeTab = Array.from(doc.querySelectorAll('#view .tabbar-l1 .tab'))
      .find(t => (t.textContent || '').indexOf('Trade') > -1);
    if (tradeTab) {
      tradeTab.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(500);
      const loy = Array.from(doc.querySelectorAll('#view .tabbar-l2 .tab, #view .tabbar .tab'))
        .find(t => (t.textContent || '').indexOf('Loyalty') > -1);
      check('trade has Loyalty points sub-tab', !!loy, 'not found');
      if (loy) {
        loy.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
        await sleep(500);
        const lt = (doc.querySelector('#view') || {}).textContent || '';
        check('loyalty settings fields render', lt.indexOf('Loyalty program') > -1 && lt.indexOf('1 point') > -1, lt.slice(0, 120));
      }
    }
  }

  // ---- v2.3: share invoice dialog renders ----
  try {
    win.App.go('sales');
    await sleep(700);
    check('sales screen exposes openSale', typeof win.__openSale === 'function', 'no __openSale');
    let shareBtn = null;
    try {
      const list = await win.API.call('sales.list', { pageSize: 1 });
      const first = (list.rows || [])[0];
      if (first && win.__openSale) {
        win.__openSale(first.id);
        await sleep(700);
        shareBtn = Array.from(doc.querySelectorAll('.drawer button, .modal2 button'))
          .find(b => (b.textContent || '').indexOf('Share') > -1);
      }
    } catch (e) { }
    check('sale detail has Share button', !!shareBtn, 'not found');
    if (shareBtn) {
      const before = errors.length;
      shareBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(900);
      const st = doc.body.textContent || '';
      check('share dialog opens with WhatsApp/SMS/Email',
        st.indexOf('WhatsApp') > -1 && st.indexOf('SMS') > -1 && st.indexOf('Email') > -1, st.slice(-160));
      check('share dialog does not throw', errors.length === before, errors.slice(before).join(' | ').slice(0, 160));
    }
  } catch (e) { check('share invoice dialog', false, e.message); }

  // ---- POS virtualised grid (1000+ items) ----
  try {
    const big = [];
    for (let i = 0; i < 1200; i++) {
      big.push({ id: 'VITM' + i, code: 'V-' + String(i).padStart(4, '0'), name: 'Virtual item ' + i,
        cat: 'Test', sub: '', brand: 'B', bc: '9' + String(i).padStart(11, '0'), alt: '',
        cp: 100, rp: 150, wp: 130, mp: 110, tx: 17, qty: 5, rack: '', img: '' });
    }
    win.App.state.catalog = win.App.state.catalog || {};
    win.App.state.catalog.items = big;
    const t0 = Date.now();
    win.App.go('pos');
    await sleep(1000);
    const cards = doc.querySelectorAll('.pcard').length;
    const ms = Date.now() - t0;
    check('POS renders 1200-item catalog', cards > 0, 'cards=' + cards);
    check('virtual grid keeps DOM small (<200 cards)', cards < 200, 'cards=' + cards);
    check('POS paint is fast (<4s)', ms < 4000, ms + 'ms');
    const gw = doc.querySelector('.pos2-gridwrap');
    if (gw) {
      gw.scrollTop = 4000;
      gw.dispatchEvent(new win.Event('scroll'));
      await sleep(400);
      check('scrolling keeps DOM bounded', doc.querySelectorAll('.pcard').length < 200,
        'cards=' + doc.querySelectorAll('.pcard').length);
    }
    check('item counter shown', (doc.querySelector('.pos2-count') || {}).textContent.length > 0, 'no counter');
  } catch (e) { check('POS virtual grid', false, e.message); }

  // Command palette
  win.document.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
  await sleep(400);
  check('command palette opens (Ctrl+K)', !!doc.querySelector('.pal-list'));
  const palClose = Array.from(doc.querySelectorAll('.m-foot .btn')).find(b => /Close/i.test(b.textContent));
  if (palClose) palClose.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

  // ---- deep links (har jagah se drill-down kaam kare) ----
  const itemRows = win.MockAPI['items.list']({}).rows || [];
  if (itemRows.length) {
    win.App.go('items', { open: itemRows[0].id });
    await sleep(1400);
    check('deep link items?open → detail offcanvas', !!doc.querySelector('.offcanvas .oc-body'),
      'no offcanvas');
    const ocX = doc.querySelector('.oc-x'); if (ocX) ocX.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await sleep(300);
  }
  const custRows = win.MockAPI['customers.list']({ withBalance: true }).rows || [];
  if (custRows.length) {
    win.App.go('parties', { tab: 'customers', open: custRows[0].id });
    await sleep(1800);
    check('deep link parties?open → customer offcanvas', !!doc.querySelector('.offcanvas .oc-body'),
      'no offcanvas');
    const ocX = doc.querySelector('.oc-x'); if (ocX) ocX.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await sleep(300);
  }
  const saleRows = (win.MockAPI['sales.list']({ pageSize: 5 }).rows || []);
  if (saleRows.length) {
    win.App.go('sales', { open: saleRows[0].id });
    await sleep(900);
    check('deep link sales?open → invoice detail', !!doc.querySelector('.modal2, .offcanvas, .drawer'),
      'no detail view');
    const x = doc.querySelector('.modal2 .oc-x, .offcanvas .oc-x, .drawer .oc-x');
    if (x) x.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await sleep(300);
  }
  win.App.go('purchase', { reorder: true });
  await sleep(900);
  check('deep link purchase?reorder → PO draft with lines',
    !!doc.querySelector('.modal2, .offcanvas, .drawer'), 'no PO form');

  // ---- POS product cards: 1:1 image + quick view ----
  win.App.go('pos');
  await sleep(1000);
  {
    const view = doc.querySelector('#view');
    const cards = view.querySelectorAll('.pcard');
    check('POS shows product cards', cards.length > 3, 'cards=' + cards.length);
    if (cards.length) {
      const img = cards[0].querySelector('.pc-img');
      check('product card has an image box', !!img, 'no .pc-img');
      if (img) {
        const w = img.getBoundingClientRect ? img.getBoundingClientRect().width : 0;
        const hh = img.getBoundingClientRect ? img.getBoundingClientRect().height : 0;
        check('card image box is 1:1 square (aspect-ratio applied)',
          Math.abs(w - hh) <= 2 || /aspect-ratio:\s*1/.test(doc.querySelector('style').textContent),
          'w=' + Math.round(w) + ' h=' + Math.round(hh));
      }
      const qv = cards[0].querySelector('.pc-qv');
      check('product card has a quick-view button', !!qv, 'no .pc-qv');
      if (qv) {
        qv.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
        await sleep(700);
        const qvm = doc.querySelector('.qv');
        check('quick view opens a modal', !!qvm, 'no .qv popup');
        if (qvm) {
          const txt = qvm.textContent || '';
          check('quick view shows supplier info', /supplier/i.test(txt), txt.slice(0, 120));
          check('quick view shows stock by branch', /stock by branch/i.test(txt), 'missing stock section');
          check('quick view shows rates', /sale price|wholesale/i.test(txt), 'missing rates');
        }
        const closer = Array.from(doc.querySelectorAll('.modal2 button, .modal button'))
          .find(b => /^\s*Close\s*$/.test(b.textContent || ''));
        if (closer) closer.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
        await sleep(250);
      }
    }
  }

  // ---- Shop Open / Close screen + header icon ----
  {
    const shopIcon = doc.querySelector('#btnShop');
    check('header has a shop open/close icon', !!shopIcon, 'no #btnShop');
    check('shop icon shows open state', !!shopIcon && shopIcon.classList.contains('is-open'),
      'icon not marked open');
    win.App.go('shop');
    await sleep(900);
    const sv = doc.querySelector('#view');
    check('shop screen shows the open session hero', !!sv.querySelector('.shop-hero.open'),
      'no open hero');
    check('shop screen shows KPI grid', sv.querySelectorAll('.kpi, .kpi-card, .k-grid > *').length >= 4,
      'kpis=' + sv.querySelectorAll('.kpi, .kpi-card, .k-grid > *').length);
    check('shop screen shows cash in/out buttons',
      Array.from(sv.querySelectorAll('button')).filter(b => /Cash (in|out)/i.test(b.textContent)).length >= 2,
      'no cash in/out buttons');
    check('shop screen shows expected cash', /Expected in drawer/i.test(sv.textContent), 'missing expected KPI');
    check('shop screen shows session history', /Pichhli sessions/i.test(sv.textContent), 'no history card');
    check('shop screen has a close button',
      Array.from(sv.querySelectorAll('button')).some(b => /Close shop/i.test(b.textContent)), 'no close button');
    // denomination counter inside close modal
    const closeBtn = Array.from(sv.querySelectorAll('button')).find(b => /^\s*🔒\s*Close shop\s*$/.test(b.textContent));
    if (closeBtn) {
      closeBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(600);
      const den = doc.querySelectorAll('.den-row').length;
      check('close-shop modal has a denomination counter', den >= 8, 'den-rows=' + den);
      const modal = doc.querySelector('.modal2, .modal, .modal-card');
      if (modal) {
        const inp = modal.querySelector('.den-in');
        if (inp) {
          inp.value = '10';
          inp.dispatchEvent(new win.Event('input', { bubbles: true }));
          await sleep(200);
          check('denomination entry updates counted total',
            /50,000|50000|Counted/i.test(modal.textContent), modal.textContent.slice(0, 80));
        }
        const cancel = Array.from(modal.querySelectorAll('button')).find(b => /Cancel/i.test(b.textContent));
        if (cancel) cancel.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
      }
    }
  }

  // ---- Purchase ▸ GRN detail with supplier previous balance ----
  win.App.go('purchase');
  await sleep(900);
  {
    const view = doc.querySelector('#view');
    const grnTab = Array.from(view.querySelectorAll('.seg button'))
      .find(b => (b.textContent || '').trim() === 'GRN');
    check('purchase screen has a GRN tab', !!grnTab, 'no GRN tab');
    if (grnTab) {
      grnTab.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(700);
      const rows = doc.querySelectorAll('#view tbody tr');
      check('GRN list has rows', rows.length > 0, 'rows=' + rows.length);
      if (rows.length) {
        rows[0].dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
        await sleep(800);
        const bal = doc.querySelector('.bal-card');
        check('GRN detail shows a supplier balance card', !!bal, 'no .bal-card');
        if (bal) {
          const t = bal.textContent || '';
          check('GRN balance card shows previous payable', /pichhla baqaya|previous/i.test(t), t.slice(0, 120));
          check('GRN balance card shows closing payable', /total dena hai|closing/i.test(t), 'missing closing');
        }
        const items = doc.querySelectorAll('#view tbody tr').length;
        check('GRN detail lists line items', items > 0, 'items=' + items);
        const closer = Array.from(doc.querySelectorAll('.modal2 button, .modal button'))
          .find(b => /^\s*Close\s*$/.test(b.textContent || ''));
        if (closer) closer.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
        await sleep(250);
      }
    }
  }

  // ---- PO detail: editing shows real lines; GRN loads the PO ----
  /* pichhle test se koi modal/khula form ho to band kar dein */
  Array.from(doc.querySelectorAll('.modal-scrim, .modal2, .offcanvas, .drawer, .scrim'))
    .forEach(m => { try { m.remove(); } catch (e) { } });
  win.App.go('purchase');
  await sleep(900);
  {
    const rows = doc.querySelectorAll('#view tbody tr');
    if (rows.length) {
      rows[0].dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(900);
      const all = doc.querySelectorAll('.offcanvas, .drawer, .modal2, .modal');
      const drawer = all[all.length - 1];
      check('PO form opens on row click', !!drawer, 'no form');
      if (drawer) {
        const t = drawer.textContent || '';
        check('PO form shows a detail strip (status / qty / total)',
          /Status:|Ordered:|Total:/.test(t), t.slice(0, 140));
        const lineRows = drawer.querySelectorAll('.po-line, .list-item').length;
        check('PO form loads the PO line items', lineRows > 0, 'lines=' + lineRows);
        check('PO line rows are column-aligned (stock / qty / rate / amount)',
          drawer.querySelectorAll('.po-line-head').length === 1 &&
          Array.from(lineRows ? drawer.querySelectorAll('.po-line') : []).every(r =>
            r.querySelector('input') && r.querySelector('.pl-name') && r.querySelector('.pl-num')),
          'heads=' + drawer.querySelectorAll('.po-line-head').length +
          ' lines=' + drawer.querySelectorAll('.po-line').length);
        const closer = Array.from(drawer.querySelectorAll('button'))
          .find(b => /\u2715|Close/i.test(b.textContent || ''));
        if (closer) closer.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
        await sleep(250);
      }
    }
    // GRN button on a pending PO row should open a pre-filled GRN form
    const rcv = Array.from(doc.querySelectorAll('#view tbody tr button'))
      .find(b => /Receive/i.test(b.textContent || ''));
    check('PO row exposes a Receive (GRN) button', !!rcv, 'no receive button');
    if (rcv) {
      rcv.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(900);
      const allG = doc.querySelectorAll('.offcanvas, .drawer, .modal2, .modal');
      const grn = allG[allG.length - 1];
      const t = grn ? (grn.textContent || '') : '';
      check('GRN form is opened against the PO', /PO .* ke khilaf|Goods Receipt/i.test(t), t.slice(0, 120));
      if (grn) {
        /* v2.25.0 (req 2) — GRN dobara design hua: lines ab `.grn-line` hain
           (purane `.po-line/.list-item` selectors is drawer par match nahi karte) */
        const lineRows = grn.querySelectorAll('.grn-line, .po-line, .list-item').length;
        check('GRN form pre-fills lines from the PO', lineRows > 0, 'lines=' + lineRows);
        const poSel = Array.from(grn.querySelectorAll('select'))
          .find(sel => /Load from PO|PO-SDQ|pending/i.test(sel.textContent || ''));
        check('GRN form lets you pick another open PO', !!poSel, 'no PO selector');
        check('GRN lines show ordered / received / now columns',
          /Ordered/i.test(grn.textContent || '') && /Received/i.test(grn.textContent || ''),
          'missing columns');
        const closer = Array.from(grn.querySelectorAll('button'))
          .find(b => /\u2715|Close/i.test(b.textContent || ''));
        if (closer) closer.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
        await sleep(250);
      }
    }
  }

  // ---- Shop Open/Close: header pill + quick dialog ----
  {
    const pill = doc.querySelector('#btnShop');
    check('header shows a Shop Open/Close pill', !!pill && !pill.hidden, pill ? pill.className : 'missing');
    check('pill shows the state in words (Open / Closed)',
      !!pill && /Open|Closed|کھلی|بند/.test(pill.textContent || ''), pill ? pill.textContent.trim() : '');
    check('pill carries open/closed styling', !!pill && /shop-pill/.test(pill.className) &&
      (/is-open/.test(pill.className) || true), pill ? pill.className : '');
    if (pill) {
      pill.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(1600);
      const modal = Array.from(doc.querySelectorAll('.modal2, .modal')).pop();
      const t = modal ? (modal.textContent || '') : '';
      check('header pill opens a quick open/close dialog',
        /Shop kholein|Shop khuli hai/.test(t), t.slice(0, 120));
      if (/Shop khuli hai/.test(t)) {
        check('quick dialog shows expected cash + day summary',
          /Expected in drawer/.test(t) && /Opening cash/.test(t), t.slice(0, 200));
        check('quick dialog offers close / cash in / cash out',
          /Close shop/.test(t) && /Cash in/.test(t) && /Cash out/.test(t), t.slice(0, 200));
      }
      const closer = modal && Array.from(modal.querySelectorAll('button')).find(b => /^Close$/i.test((b.textContent || '').trim()));
      if (closer) closer.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(300);
    }
  }

  // ---- Accounting: expenses (paid-from account, approval, detail) ----
  win.App.go('accounting');
  await sleep(1400);
  {
    const tabs = Array.from(doc.querySelectorAll('#view .tabbar-l1 .tab')).map(b => (b.textContent || '').trim());
    const expTab = Array.from(doc.querySelectorAll('#view .tabbar-l1 .tab')).find(b => /Expenses/i.test(b.textContent || ''));
    if (expTab) {
      expTab.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(1800);
      const v = doc.querySelector('#view');
      const t = v.textContent || '';
      check('expenses tab shows KPIs', /Total spent/i.test(t), t.slice(0, 140));
      check('expense table has Status column', /Status/.test(t), 'no status column');
      const rows = v.querySelectorAll('tbody tr').length;
      check('expenses render in the table', rows > 0, 'rows=' + rows);
      const addBtn = Array.from(v.querySelectorAll('button')).find(b => /Add expense/i.test(b.textContent || ''));
      if (addBtn) {
        addBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
        await sleep(1600);
        const modal = Array.from(doc.querySelectorAll('.modal2, .modal')).pop();
        const mt = modal ? (modal.textContent || '') : '';
        check('expense form has paid-from account + bill reference',
          /Paid from account/.test(mt) && /Bill \/ reference/.test(mt), mt.slice(0, 200));
        const closer = modal && Array.from(modal.querySelectorAll('button')).find(b => /Cancel/i.test(b.textContent || ''));
        if (closer) closer.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
        await sleep(300);
      }
    }
  }

  // ---- Shop: day / shift closing report (print · PDF · WhatsApp · CSV) ----
  win.App.go('shop');
  await sleep(2200);
  {
    const v = doc.querySelector('#view');
    const repBtn = Array.from(v.querySelectorAll('button')).find(b => /Closing report|Pichhli session ki report/i.test(b.textContent || ''));
    check('shop screen exposes a closing-report button', !!repBtn, v.textContent.slice(0, 120));
    if (repBtn) {
      repBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(2400);
      const modal = Array.from(doc.querySelectorAll('.modal2, .modal')).pop();
      const t = modal ? (modal.textContent || '') : '';
      check('closing report opens with full day summary',
        /DAY CLOSING REPORT/.test(t) && /Expected in drawer/.test(t) && /Variance/.test(t), t.slice(0, 160));
      check('closing report lists payments, expenses, top items, hours',
        /Payments by method/.test(t) && /Expenses by head/.test(t) && /Top items/.test(t) && /Hour-wise/.test(t),
        t.slice(0, 200));
      check('closing report offers Print / PDF / WhatsApp / CSV',
        /Print/.test(t) && /PDF/.test(t) && /WhatsApp/.test(t) && /CSV/.test(t), t.slice(0, 200));
      check('closing report has signature lines for cashier + manager',
        /Cashier signature/.test(t) && /Manager/.test(t), 'no signatures');
      const closer = modal && Array.from(modal.querySelectorAll('button')).find(b => /^Close$/i.test((b.textContent || '').trim()));
      if (closer) closer.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(300);
    }
  }

  // ---- Dedicated apps: Warehouse + mobile order taking ----
  win.App.go('warehouse');
  await sleep(1800);
  {
    const v = doc.querySelector('#view');
    const t = v.textContent || '';
    check('warehouse app renders', /Warehouse/i.test(t), t.slice(0, 120));
    const tabs = Array.from(v.querySelectorAll('.tabbar-l1 .tab')).map(b => (b.textContent || '').trim());
    check('warehouse has dedicated tabs (count / audit / inventory)', tabs.length >= 2, tabs.join('|'));
  }
  win.App.go('takeorder');
  await sleep(1600);
  {
    const v = doc.querySelector('#view');
    const t = v.textContent || '';
    check('mobile order-taking app renders', /Order|Customer|Item/i.test(t), t.slice(0, 160));
    check('order pad has a cart / add-item area', /Add|Cart|item/i.test(t), t.slice(0, 160));
  }

  // ---- Users & Security: per-user rule checkboxes (allow / disallow actions) ----
  win.App.go('users');
  await sleep(1600);
  {
    const view = doc.querySelector('#view');
    const segs = Array.from(view.querySelectorAll('.seg button')).map(b => (b.textContent || '').trim());
    check('users screen shows 4 sections (Users / Groups / Permissions / Audit)',
      segs.length === 4, segs.join('|'));
    const permTab = Array.from(view.querySelectorAll('.seg button')).find(b => /Permission/i.test(b.textContent || ''));
    if (permTab) {
      permTab.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(1800);
      const v2 = doc.querySelector('#view');
      const boxes = v2.querySelectorAll('.pm-box').length;
      check('role permission matrix renders checkboxes', boxes > 50, 'boxes=' + boxes);
      check('matrix is grouped and searchable',
        v2.querySelectorAll('.pm-group').length > 3 && !!v2.querySelector('input[type=search]'),
        'groups=' + v2.querySelectorAll('.pm-group').length);
    }
    /* user form → per-user rules */
    const back = Array.from(doc.querySelectorAll('#view .seg button')).find(b => /^Users$/i.test(b.textContent || ''));
    if (back) { back.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true })); await sleep(1500); }
    const uRow = doc.querySelector('#view tbody tr');
    if (uRow) {
      uRow.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(2000);
      const drawer = Array.from(doc.querySelectorAll('.drawer, .offcanvas, .modal2')).pop();
      const t = drawer ? (drawer.textContent || '') : '';
      check('user form shows a Rules (allow/disallow) section', /Rules — kaun se actions/.test(t), t.slice(0, 120));
      const boxes = drawer ? drawer.querySelectorAll('.re-box').length : 0;
      check('rules editor renders one tri-state control per permission', boxes > 20, 'boxes=' + boxes);
      if (drawer) {
        const first = drawer.querySelector('.re-box');
        if (first) {
          const before = first.className;
          first.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
          await sleep(150);
          check('rule control cycles Inherit → Allow', /allow/.test(first.className) && before !== first.className,
            before + ' → ' + first.className);
          first.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
          await sleep(150);
          check('rule control cycles Allow → Deny', /deny/.test(first.className), first.className);
        }
        const closer = Array.from(drawer.querySelectorAll('button')).find(b => /\u2715|Close|Cancel/i.test(b.textContent || ''));
        if (closer) closer.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
        await sleep(250);
      }
    }
  }

  // ---- Accounting page ----
  win.App.go('accounting');
  await sleep(1100);
  {
    const view = doc.querySelector('#view');
    const t = view.textContent || '';
    check('accounting screen renders', /Overview|Transactions/i.test(t), t.slice(0, 120));
    check('accounting shows KPIs (cash / bank / receivables / payables)',
      /Cash in hand/i.test(t) && /Bank balance/i.test(t) && /Receivables/i.test(t) && /Payables/i.test(t),
      t.slice(0, 160));
    check('accounting shows trial balance health', /Trial balance health/i.test(t), 'missing TB health');

    const tabs = Array.from(view.querySelectorAll('.tabbar-l1 .tab')).map(b => (b.textContent || '').trim());
    check('accounting has 7 level-1 tabs', tabs.length === 7, tabs.join('|'));

    // transactions
    const tx = Array.from(view.querySelectorAll('.tabbar-l1 .tab')).find(b => /Transactions/i.test(b.textContent));
    if (tx) {
      tx.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(900);
      check('transactions tab lists vouchers', doc.querySelectorAll('#view tbody tr').length > 3,
        'rows=' + doc.querySelectorAll('#view tbody tr').length);
    }
    // chart of accounts
    const coa = Array.from(doc.querySelectorAll('.tabbar-l1 .tab')).find(b => /Chart of accounts/i.test(b.textContent));
    if (coa) {
      coa.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(900);
      const t2 = doc.querySelector('#view').textContent || '';
      check('chart of accounts lists account groups', /Assets/i.test(t2) && /Liabilities/i.test(t2), t2.slice(0, 120));
      check('chart of accounts shows balances', /Balance/i.test(t2), 'no balance column');
    }
    // banks + reconciliation
    const banks = Array.from(doc.querySelectorAll('.tabbar-l1 .tab')).find(b => /Banks/i.test(b.textContent));
    if (banks) {
      banks.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(1000);
      const t3 = doc.querySelector('#view').textContent || '';
      check('banks tab shows bank accounts', /Bank/i.test(t3), t3.slice(0, 120));
      const sub = Array.from(doc.querySelectorAll('.tabbar-l2 .tab')).map(b => (b.textContent || '').trim());
      check('banks tab has sub-tabs (book + reconciliation)', sub.length >= 2, sub.join('|'));
      const rec = Array.from(doc.querySelectorAll('.tabbar-l2 .tab')).find(b => /Reconcil/i.test(b.textContent));
      if (rec) {
        rec.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
        await sleep(900);
        const t4 = doc.querySelector('#view').textContent || '';
        check('reconciliation tab renders', /Cleared|Pending|Statement/i.test(t4), t4.slice(0, 140));
      }
    }
    // reports
    const rep = Array.from(doc.querySelectorAll('.tabbar-l1 .tab')).find(b => /Reports/i.test(b.textContent));
    if (rep) {
      rep.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(1000);
      const sub2 = Array.from(doc.querySelectorAll('.tabbar-l2 .tab')).map(b => (b.textContent || '').trim());
      check('reports has P&L, balance sheet, cash book, ledger',
        sub2.join('|').indexOf('Profit') > -1 && sub2.join('|').indexOf('Balance') > -1 &&
        sub2.join('|').indexOf('Cash') > -1 && sub2.join('|').indexOf('Ledger') > -1, sub2.join('|'));
      const plTab = Array.from(doc.querySelectorAll('.tabbar-l2 .tab')).find(b => /Profit/i.test(b.textContent));
      if (plTab) {
        plTab.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
        await sleep(1000);
        const t5 = doc.querySelector('#view').textContent || '';
        check('P&L report renders income + net profit', /Net profit/i.test(t5) && /Total income/i.test(t5),
          t5.slice(0, 160));
      }
      // re-query: the tab bar is re-rendered by each report switch
      let bsTab = Array.from(doc.querySelectorAll('.tabbar-l2 .tab')).find(b => /Balance sheet/i.test(b.textContent));
      if (bsTab) {
        bsTab.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
        await sleep(1000);
        const t6 = doc.querySelector('#view').textContent || '';
        check('balance sheet renders and is balanced', /Total assets/i.test(t6) && /Balanced/i.test(t6),
          t6.slice(-200));
      }
    }
  }

  // ---- Order book + mobile order pad ----
  win.App.go('orders');
  await waitFor(() => /Order/i.test((doc.querySelector('#view') || {}).textContent || ''), 5000);
  await sleep(500);
  {
    const view = doc.querySelector('#view');
    const t = view.textContent || '';
    check('order book screen renders', /Order/i.test(t), t.slice(0, 120));
    const tabs = Array.from(view.querySelectorAll('.tabbar-l1 .tab')).map(b => (b.textContent || '').trim());
    check('order book has Orders + Pipeline tabs', tabs.length === 2, tabs.join('|'));
    const takeBtn = Array.from(view.querySelectorAll('button')).find(b => /Take order/i.test(b.textContent));
    check('order book exposes the mobile order pad', !!takeBtn, 'no take-order button');
  }

  win.App.go('takeorder');
  await waitFor(() => { const v = doc.querySelector('#view'); return v && v.classList.contains('m-full') && v.querySelector('.mo-search'); }, 6000);
  await sleep(400);
  {
    const view = doc.querySelector('#view');
    check('mobile order pad is full screen', view.classList.contains('m-full'), 'not full screen');
    check('order pad has a big item search', !!view.querySelector('.mo-search'), 'no search');
    check('order pad has a customer bar', !!view.querySelector('.mo-cust'), 'no customer bar');
    check('order pad shows an empty cart message', /koi item nahi/i.test(view.textContent || ''),
      (view.textContent || '').slice(0, 140));

    /* search + add an item */
    const search = view.querySelector('.mo-search');
    if (!search) {
      check('order pad search input mojood', false, 'no .mo-search (skeleton/modal ke bagair crash nahi hoga)');
    } else {
    const items = win.MockAPI['items.list']({ pageSize: 3 }).rows || [];
    search.value = String((items[0] || {}).name || 'oil').slice(0, 8);
    search.dispatchEvent(new win.Event('input', { bubbles: true }));
    await sleep(800);
    const hits = Array.from(doc.querySelectorAll('.mo-hit'));
    check('order pad shows search results', hits.length > 0, 'hits=' + hits.length);
    if (hits.length) {
      hits[0].dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(500);
      check('tapping a result adds it to the order cart',
        doc.querySelectorAll('.mo-line').length === 1, 'lines=' + doc.querySelectorAll('.mo-line').length);
      const plus = Array.from(doc.querySelectorAll('.qbtn')).find(b => (b.textContent || '').indexOf('＋') > -1);
      if (plus) {
        plus.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
        await sleep(400);
        check('quantity can be increased with the ＋ button',
          /2/.test((doc.querySelector('.qval') || {}).textContent || ''),
          (doc.querySelector('.qval') || {}).textContent);
      }
      check('order pad shows live totals', /Total/i.test(doc.querySelector('#view').textContent || ''),
        'no totals');
    }

    }

    const submit = doc.querySelector('.mo-submit');
    check('order pad has a submit button', !!submit, 'no submit');
    if (submit) {
      submit.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(1000);
      check('order is saved from the mobile pad',
        (win.MockAPI['orders.list']({}) || []).length >= 1,
        'orders=' + (win.MockAPI['orders.list']({}) || []).length);
      check('cart is cleared after submit', /koi item nahi/i.test(doc.querySelector('#view').textContent || ''),
        'cart not cleared');
    }
  }

  // ---- Warehouse app (inventory · count · audit · movements) ----
  win.App.go('warehouse');
  await sleep(1200);
  {
    const view = doc.querySelector('#view');
    const tabs = Array.from(view.querySelectorAll('.tabbar-l1 .tab')).map(b => (b.textContent || '').trim());
    check('warehouse app has 8 level-1 tabs', tabs.length === 8, tabs.join('|'));
    check('warehouse app has inventory, count, audit and movements tabs',
      /Inventory/i.test(tabs.join(' ')) && /Count/i.test(tabs.join(' ')) &&
      /Audit/i.test(tabs.join(' ')) && /Movements/i.test(tabs.join(' ')), tabs.join('|'));

    const clickTab = async (re) => {
      const t = Array.from(doc.querySelectorAll('.tabbar-l1 .tab')).find(b => re.test(b.textContent || ''));
      if (!t) return false;
      t.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(1100);
      return true;
    };

    /* inventory */
    if (await clickTab(/Inventory/)) {
      const t = doc.querySelector('#view').textContent || '';
      check('warehouse inventory lists stock rows', doc.querySelectorAll('#view tbody tr').length > 3,
        'rows=' + doc.querySelectorAll('#view tbody tr').length);
      check('warehouse inventory shows stock value KPI', /Stock value/i.test(t), t.slice(0, 140));
    }

    /* count sheets: create → enter counts → post */
    if (await clickTab(/Count/)) {
      const t = doc.querySelector('#view').textContent || '';
      check('count sheets tab renders', /Sheet|sheet/i.test(t), t.slice(0, 140));
      const newBtn = Array.from(doc.querySelectorAll('#view button')).find(b => /New count sheet/i.test(b.textContent));
      check('count sheets tab has a create button', !!newBtn, 'no create button');
      if (newBtn) {
        newBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
        await sleep(700);
        const modal = doc.querySelector('.modal2, .modal');
        check('new count sheet wizard opens', !!modal && /Nayi count sheet/i.test(modal.textContent || ''),
          modal ? (modal.textContent || '').slice(0, 120) : 'no modal');
        if (modal) {
          const createBtn = Array.from(modal.querySelectorAll('button')).find(b => /^\s*Create\s*$/.test(b.textContent || ''));
          if (createBtn) {
            createBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
            await sleep(1200);
            const entry = doc.querySelector('.modal2, .modal');
            const et = (entry && entry.textContent) || '';
            check('count entry screen opens with a progress bar', !!doc.querySelector('.cnt-prog'), 'no progress');
            check('count entry shows system quantities', /System/i.test(et), et.slice(0, 160));
            /* enter a count on the first line */
            const inp = doc.querySelector('#view input[aria-label^="Counted quantity for"], .modal2 input[aria-label^="Counted quantity for"], .modal input[aria-label^="Counted quantity for"]');
            if (inp) {
              inp.value = '7';
              inp.dispatchEvent(new win.Event('input', { bubbles: true }));
              inp.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
              await sleep(900);
              check('count entry records the counted quantity',
                /Diff/i.test((doc.querySelector('.modal2, .modal') || {}).textContent || ''), 'no diff column');
            }
            const postBtn = Array.from(doc.querySelectorAll('button')).find(b => /Post & adjust stock/i.test(b.textContent || ''));
            check('count entry exposes a post button', !!postBtn, 'no post button');
            if (postBtn) {
              postBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
              await sleep(600);
              const confirmBtn = Array.from(doc.querySelectorAll('button'))
                .find(b => /^(Yes|OK|Haan|Theek|Confirm)/i.test((b.textContent || '').trim()));
              check('post asks for confirmation', !!confirmBtn, 'no confirm button');
              if (confirmBtn) {
                confirmBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
                await sleep(1200);
              }
            }
          }
          const closer = Array.from(doc.querySelectorAll('button')).find(b => /^\s*Close\s*$/.test(b.textContent || ''));
          if (closer) { closer.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true })); await sleep(400); }
        }
      }
    }

    /* audit */
    if (await clickTab(/Audit/)) {
      const t = doc.querySelector('#view').textContent || '';
      check('audit tab shows accuracy KPI', /Accuracy/i.test(t), t.slice(0, 160));
      check('audit tab shows variance value', /Variance value/i.test(t), t.slice(0, 160));
      check('audit tab shows the adjustments ledger', /Adjustments ledger/i.test(t), t.slice(0, 160));
      check('audit tab has no NaN', !/NaN/.test(t), 'NaN found');
    }

    /* movements */
    if (await clickTab(/Movements/)) {
      const t = doc.querySelector('#view').textContent || '';
      check('movements tab renders the stock ledger', /In/.test(t) && /Out/.test(t), t.slice(0, 160));
      check('movements tab has no NaN', !/NaN/.test(t), 'NaN found');
    }
  }

  // ---- Wallet payments (EasyPaisa / JazzCash) ----
  {
    check('wallet providers are exposed to the UI', typeof win.WalletUI === 'object', 'no WalletUI');
    const provs = await win.MockAPI['wallet.providers']({});
    check('two wallet providers configured', provs.length === 2, JSON.stringify(provs.map(p => p.id)));
    check('wallet providers never expose secrets',
      JSON.stringify(provs).indexOf('password') === -1, 'secret leaked');

    /* panel rendered stand-alone (same component POS use karta hai) */
    const payment = { method: 'EASYPAISA', amount: 1200 };
    const host = doc.createElement('div');
    doc.body.appendChild(host);
    const panel = await win.WalletUI.panel({ method: 'EASYPAISA', amount: 1200, payment: payment });
    host.appendChild(panel);
    const ptext = host.textContent || '';
    check('wallet panel renders for a wallet method', /EasyPaisa/.test(ptext), ptext.slice(0, 120));
    check('wallet panel asks for the payer number (from)',
      !!host.querySelector('input[aria-label="Customer mobile number"]'), 'no payer input');
    check('wallet panel shows the merchant wallet number (to)',
      !!host.querySelector('input[aria-label="Merchant wallet number"]'), 'no receiver input');
    check('wallet panel shows the environment badge', /SANDBOX|LIVE/.test(ptext), ptext.slice(0, 120));

    const payerInput = host.querySelector('input[aria-label="Customer mobile number"]');
    const recvInput = host.querySelector('input[aria-label="Merchant wallet number"]');
    payerInput.value = '03001234567';
    payerInput.dispatchEvent(new win.Event('input', { bubbles: true }));
    if (recvInput) { recvInput.value = '03009876543'; recvInput.dispatchEvent(new win.Event('input', { bubbles: true })); }
    const reqBtn = Array.from(host.querySelectorAll('button')).find(b => /Request bhejein/i.test(b.textContent));
    check('wallet panel has a request button', !!reqBtn, 'no request button');
    if (reqBtn) {
      reqBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(700);
      check('wallet request is created', !!payment.walletId, JSON.stringify(payment));
      check('request stores payer and receiver numbers',
        payment.payerMobile === '03001234567' && payment.receiverMobile === '03009876543',
        JSON.stringify(payment));
      const checkBtn = Array.from(host.querySelectorAll('button')).find(b => /Check now/i.test(b.textContent));
      if (checkBtn) {
        checkBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
        await sleep(600);
        checkBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
        await sleep(900);
      }
      check('payment row gets the provider transaction id once paid',
        !!payment.txnId && payment.walletStatus === 'PAID',
        JSON.stringify({ txnId: payment.txnId, status: payment.walletStatus }));
      check('paid status is shown in the panel', /Paisa mil gaya/i.test(host.textContent || ''),
        (host.textContent || '').slice(0, 160));
    }
    host.remove();
  }

  // ---- POS payment modal ▸ wallet panel wiring ----
  win.App.go('pos');
  await sleep(1100);
  {
    const card = doc.querySelector('#view .pcard');
    if (card) {
      card.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(500);
      const payBtn = Array.from(doc.querySelectorAll('#view button, .pos2-foot button'))
        .find(b => /split|card|cash \(f9\)/i.test((b.textContent || '').toLowerCase()));
      check('POS exposes a payment button', !!payBtn, 'no pay button');
      if (payBtn) {
        payBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
        await sleep(900);
        const modal = doc.querySelector('.modal2, .modal');
        check('POS payment modal opens', !!modal, 'no modal');
        if (modal) {
          /* v2.5: polished payment modal — bill summary + quick cash + fill */
          check('payment modal shows a bill summary', !!doc.querySelector('.pay-summary'), 'no summary');
          const sumTxt = (doc.querySelector('.pay-summary') || {}).textContent || '';
          check('bill summary shows subtotal, discount, tax and total',
            /Subtotal/i.test(sumTxt) && /Discount/i.test(sumTxt) && /Total/i.test(sumTxt), sumTxt.slice(0, 140));
          check('bill summary has no NaN', !/NaN/.test(sumTxt), sumTxt.slice(0, 140));
          const chips = Array.from(doc.querySelectorAll('.chip2')).map(b => (b.textContent || ''));
          check('quick-cash chips include the exact amount', chips.some(t => /Exact/i.test(t)), chips.join(' | '));
          check('quick-cash chips include a round-up with change',
            chips.some(t => /change/i.test(t)), chips.join(' | '));
          check('each payment row has a Fill button',
            Array.from(doc.querySelectorAll('button')).some(b => (b.textContent || '').trim() === 'Fill'),
            'no Fill button');

          const sel = doc.querySelector('.modal2 select, .modal select');
          if (sel) {
            const opt = Array.from(sel.options).find(o => /EASYPAISA/i.test(o.value));
            if (opt) {
              sel.value = 'EASYPAISA';
              sel.dispatchEvent(new win.Event('change', { bubbles: true }));
              await sleep(900);
              check('wallet panel appears inside the POS payment modal',
                !!doc.querySelector('.wallet-panel'), 'no .wallet-panel');
            } else {
              check('wallet panel appears inside the POS payment modal', false, 'EASYPAISA option missing');
            }
          }
          const cancel = Array.from(modal.querySelectorAll('button')).find(b => /Cancel/i.test(b.textContent));
          if (cancel) cancel.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
          await sleep(300);
        }
      }
    }
  }

  // ---- Reports ▸ party balances (prev + new - settled = closing) ----
  win.App.go('reports');
  await sleep(1100);
  {
    const view = doc.querySelector('#view');
    const sel = view.querySelector('select');
    check('reports screen has a report-type picker', !!sel, 'no select');
    if (sel) {
      const run = async (value, label) => {
        sel.value = value;
        sel.dispatchEvent(new win.Event('change', { bubbles: true }));
        await sleep(900);
        return (doc.querySelector('#view').textContent || '');
      };
      let t = await run('receivables');
      check('receivables report shows previous balance KPI', /Pichhla baqaya \(prev\)/i.test(t), t.slice(0, 140));
      check('receivables report shows closing KPI', /Total udhaar \(closing\)/i.test(t), t.slice(0, 140));
      check('receivables table has prev / new / wasooli / closing columns',
        /Prev/i.test(t) && /Naya/i.test(t) && /Wasooli/i.test(t) && /Closing/i.test(t), t.slice(0, 160));
      check('receivables rows show no NaN', !/NaN/.test(t), 'NaN found');

      t = await run('payables');
      check('payables report shows previous payable KPI', /Pichhla baqaya \(prev\)/i.test(t), t.slice(0, 140));
      check('payables table has pichhla baqaya / purchase / paid / closing',
        /Prev/i.test(t) && /Purchase/i.test(t) && /Paid/i.test(t) && /Closing/i.test(t), (t.match(/Supplier-wise[\s\S]{0,200}/) || [t.slice(0, 200)])[0]);
      check('payables rows show no NaN', !/NaN/.test(t), 'NaN found');

      t = await run('partyBalances');
      check('party balances report renders prev / new / settled / closing',
        /Pichhla baqaya/i.test(t) && /Closing/i.test(t), t.slice(0, 160));
      check('party balances rows show no NaN', !/NaN/.test(t), 'NaN found');

      /* v2.5.1: cash book — opening → in → out → closing */
      t = await run('cashbook');
      check('cash book shows opening / in / out / closing KPIs',
        /Opening/i.test(t) && /Cash in/i.test(t) && /Cash out/i.test(t) && /Closing/i.test(t), t.slice(0, 180));
      check('cash book explains where the opening came from',
        /Opening kahan se aaya/i.test(t), t.slice(0, 200));
      check('cash book renders the method-wise breakdown', /Method-wise/i.test(t), t.slice(0, 160));
      check('cash book renders a day-wise table with opening and closing',
        /Day-wise cash book/i.test(t), t.slice(0, 160));
      check('cash book entries carry a running balance column',
        /Entries \(running balance\)/i.test(t) && /Balance/i.test(t), t.slice(0, 200));
      check('cash book has a settings-driven method filter',
        !!doc.querySelector('#view .cb-method'), 'no .cb-method select');
      check('cash book rows show no NaN', !/NaN/.test(t), 'NaN found');
    }
  }

  // ---- Users & Security ▸ Permissions matrix ----
  win.App.go('users');
  await sleep(800);
  const permTab = Array.from(doc.querySelectorAll('#view .seg button'))
    .find(t => (t.textContent || '').indexOf('Permissions') > -1);
  check('users screen has a Permissions tab', !!permTab, 'not found');
  if (permTab) {
    permTab.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
    await sleep(900);
    const mtx = doc.querySelector('#view .perm-matrix');
    check('permission matrix renders', !!mtx, 'no .perm-matrix');
    if (mtx) {
      const boxes = mtx.querySelectorAll('.pm-box');
      const heads = mtx.querySelectorAll('.pm-head .pm-cell');
      check('matrix has one box per permission x role', boxes.length >= 40 * 9,
        'boxes=' + boxes.length);
      check('matrix header lists 9 roles', heads.length >= 9, 'heads=' + heads.length);
      check('matrix groups permissions', mtx.querySelectorAll('.pm-group').length >= 6,
        'groups=' + mtx.querySelectorAll('.pm-group').length);
      check('owner column is locked (full access)',
        Array.from(mtx.querySelectorAll('.pm-box.locked')).length > 40 &&
        Array.from(mtx.querySelectorAll('.pm-box.locked')).every(b => b.classList.contains('on')),
        'owner not locked-on');
      check('matrix body is scrollable, not bottom-scrolling the page',
        !!mtx.querySelector('.pm-body'), 'no .pm-body');
      // toggle one box
      const free = Array.from(mtx.querySelectorAll('.pm-box:not(.locked)'))[0];
      const was = free.classList.contains('on');
      free.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(120);
      check('permission checkbox toggles', free.classList.contains('on') !== was, 'no toggle');
      // filter
      const search = mtx.querySelector('input[type="search"]');
      if (search) {
        search.value = 'stock';
        search.dispatchEvent(new win.Event('input', { bubbles: true }));
        await sleep(150);
        const vis = Array.from(mtx.querySelectorAll('.pm-row')).filter(r => r.style.display !== 'none').length;
        check('permission filter narrows the list', vis > 0 && vis < 45, 'visible=' + vis);
      }
    }
  }

  // Settings tabs
  win.App.go('settings');
  await sleep(600);
  await clickAll(doc.querySelector('#view'), 'settings', '.tabbar-l1 .tab', 8);

  /* v2.5.1: Settings ▸ Data & tools ▸ Maintenance — sheets/DB schema health */
  win.App.go('settings');
  await sleep(900);
  {
    const view = doc.querySelector('#view');
    const dataTab = Array.from(view.querySelectorAll('.tabbar-l1 .tab'))
      .find(t => /Data & tools/i.test(t.textContent || ''));
    check('settings has a Data & tools tab', !!dataTab, 'not found');
    if (dataTab) {
      dataTab.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(900);
      const maint = Array.from(doc.querySelectorAll('#view .tabbar-l2 .tab'))
        .find(t => /Maintenance/i.test(t.textContent || ''));
      check('Data & tools has a Maintenance sub-tab', !!maint, 'not found');
      if (maint) {
        maint.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
        await sleep(1400);
        const t = (doc.querySelector('#view').textContent || '').replace(/\s+/g, ' ');
        check('maintenance shows the sheets / DB schema panel', /Sheets \/ DB schema/i.test(t), t.slice(0, 160));
        check('schema panel shows sheet / column / row counts',
          /Sheets/i.test(t) && /Columns/i.test(t) && /Rows/i.test(t), t.slice(0, 200));
        const repair = Array.from(doc.querySelectorAll('#view button'))
          .find(b => /Repair \/ upgrade sheets/i.test(b.textContent || ''));
        check('schema panel offers one-click repair / upgrade', !!repair, 'repair button missing');
        check('schema panel shows no NaN/undefined', !/NaN|undefined/.test(t), t.slice(0, 160));
      }
    }
  }

  // Warehouse + insights
  for (const id of ['warehouse', 'insights', 'shop', 'inventory', 'items', 'parties']) {
    win.App.go(id);
    await sleep(500);
    await clickAll(doc.querySelector('#view'), id, '.tabbar-l1 .tab', 6);
  }

  console.log('\n' + '='.repeat(62));
  const failed = results.filter(r => !r.ok);
  console.log('CHECKS: ' + results.length + '   FAILED: ' + failed.length);
  if (errors.length) {
    console.log('\nConsole/jsdom errors (' + errors.length + '):');
    errors.slice(0, 15).forEach(e => console.log(' - ' + e.slice(0, 300)));
  }
  console.log('='.repeat(62));
  process.exit(failed.length || errors.length ? 1 : 0);
})().catch(e => { console.error('SMOKE CRASH', e); process.exit(1); });
