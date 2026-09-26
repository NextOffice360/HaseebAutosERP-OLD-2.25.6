/**
 * test_pos_multi.js — v2.14.1 gate: POS cart multi-select add (GRN/PO-style
 * checkbox picker), bulk scanning (HaScan once=0 stream), aligned cart rows,
 * wider fluid rail. Static contracts + REAL rendered demo behavior in jsdom
 * (login → POS2 → click the actual buttons → assert cart DOM/state).
 *
 *   node tools/test_pos_multi.js
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) { passed++; console.log('PASS ' + name); }
  else { failed++; console.log('FAIL ' + name + (extra ? '  → ' + extra : '')); }
}
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

/* ══════════════════════════ A · static contracts ═════════════════════════ */
const qr = read('apps-script/App_QR.html');
ok('bridge: bulk only — continuous stream (once=0) + per-code idle timer (BULK_IDLE_MS)',
  qr.includes("(opts.bulk ? '&once=0' : '')") && qr.includes('BULK_IDLE_MS') && qr.includes('bulkScan'));
ok('bridge: no cross-origin beforeunload probe (SecurityError) — safe closed-poll instead',
  !qr.includes("w.addEventListener('beforeunload'") && qr.includes('c = !!w.closed;'));
ok('bridge: one-shot guards kept (origin pin, nonce, msg type, detach+close on result)',
  qr.includes("if (ev.origin !== origin) return;") && qr.includes('d.nonce !== n') &&
  qr.includes('d.type !== MSG_TYPE') && qr.includes('function detach()') && qr.includes('function closePopup()'));
ok('bridge: in-app bulk keeps modal open with anti-repeat + unified m.cancel',
  qr.includes('opts.bulk') && qr.includes('t - lastT > 1500') && qr.includes('m.cancel = function'));

const pos2 = read('apps-script/App_POS2.html');
ok('POS2: cart toolbar ships ☑ multi-add + 🔁 bulk + live badge',
  pos2.includes("class: 'cart2-tools'") && pos2.includes('☑ Add items') && pos2.includes('🔁 Bulk scan') && pos2.includes('pos2-bulk'));
const bulkBody = pos2.slice(pos2.indexOf('function openBulkAddModal()'), pos2.indexOf('function togglePicker()'));
ok('POS2: multi-add reuses UI2.itemPicker (same picker as PO/GRN) through addToCart merge',
  bulkBody.includes('UI2.itemPicker') && bulkBody.includes('addToCart(') &&
  bulkBody.includes("mode: 'multi'") && bulkBody.includes('picker.api.commit()'));
ok('POS2: bulk flow routes through HaScan.bulkScan with onDetect/onDone + unknown-code tally',
  pos2.includes('HaScan.bulkScan') && pos2.includes("badge.classList.add('on')") && pos2.includes('unknown: '));
/* v2.24.0: spec badli — Bulk Add ab DEDICATED MODAL hai (togglePicker wahi
   openBulkAddModal() call karta hai; cart drawer ke andar inline picker nahi). */
ok('POS2: Bulk Add opens a dedicated modal (mode:multi + API commit), not an inline drawer picker',
  pos2.includes('function openBulkAddModal()') && /togglePicker\(\)\s*\{[^}]*openBulkAddModal\(\)/.test(pos2.replace(/\s+/g, ' ')) &&
  pos2.includes("mode: 'multi'") && pos2.includes('picker.api.commit()'));
ok('POS2: cart header row + per-line rate/amount/acts cells',
  pos2.includes("class: 'cart2-cols'") && pos2.includes("class: 'cr-rate'") && pos2.includes("class: 'cr-amt'") && pos2.includes("class: 'cr-acts'"));
ok('POS2: public handle exposes togglePicker/bulkFlow for automation + tests',
  pos2.includes('togglePicker, bulkFlow, ui: POS2'));

const sty = read('apps-script/Styles.html');
ok('styles: cart rail is fluid-wide (clamp 410–520px) — content fits, grid still gets space',
  sty.includes('grid-template-columns:1fr clamp(410px,32vw,520px)'));
ok('styles: cart rows + header share one grid (item | qty | rate | amount | acts), numbers right-aligned tabular',
  sty.includes('.cart2-row{display:grid;grid-template-columns:minmax(0,1fr) auto 76px 88px auto') &&
  sty.includes('.cart2-row>.cr-amt{grid-column:4;text-align:right;font-weight:800;font-variant-numeric:tabular-nums') &&
  sty.includes('.cart2-cols{display:grid'));
ok('styles: ≤560px collapses Rate column and re-anchors amount/actions cells',
  /@media \(max-width:560px\)\{[\s\S]*?\.cart2-row>\.cr-rate,\.cart2-cols>\.cr-rate\{display:none\}/.test(sty));

/* ══════════════════════ B · rendered demo behavior (jsdom) ══════════════ */
const { JSDOM, VirtualConsole } = (() => { try { return require('jsdom'); } catch (e) { return {}; } })();
const { loginDom } = require('./_harness');
if (!JSDOM) { console.log('SKIP jsdom render checks (jsdom not installed)'); finish(); return; }

const errors = [];

(async () => {
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push('jsdomError: ' + (e && e.message || e)));
  vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));
  const dom = new JSDOM(read('demo/index.html'), {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/', virtualConsole: vc
  });
  const win = dom.window, doc = win.document;
  win.matchMedia = win.matchMedia || (q => ({ matches: false, media: q, addListener() { }, removeListener() { }, addEventListener() { }, removeEventListener() { } }));
  win.requestAnimationFrame = cb => setTimeout(cb, 0);
  win.cancelAnimationFrame = id => clearTimeout(id);
  win.scrollTo = () => { }; win.print = () => { };
  win.URL.createObjectURL = () => 'blob:demo';
  win.HTMLElement.prototype.scrollIntoView = () => { };
  if (!win.SVGElement.prototype.getBBox) win.SVGElement.prototype.getBBox = () => ({ x: 0, y: 0, width: 10, height: 10 });
  win.alert = () => { };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  /* demo is auth-gated (same as smoke.js): poll + login (shared harness) */
  await loginDom(doc, win);
  /* v2.30.5 (POS shop-gate) — tests ab bhi cart add karein to pehle shop OPEN */
  try { await win.API.call('cash.session.open', { openingCash: 5000 }); } catch (e) { }
  try { win.loadShopState && win.loadShopState(); } catch (e) { }
  await new Promise(r => setTimeout(r, 300));
  await sleep(400);
  win.App.go('pos');
  { let tries = 0; while (tries++ < 40 && !(await win.eval('!!(window.POS2 && POS2.ui && POS2.ui.pkHost && POS2.S.catalog.length)'))) await sleep(150); }

  const ev = async (label, code) => {
    console.log('  … ' + label);
    const r = await win.eval('(async () => {' + code + '})()');
    return typeof r === 'string' ? JSON.parse(r) : r;
  };

  const k1 = await ev('picker: open', `
    POS2.clearCart(true);
    window.__S2 = POS2.S; window.__UIH = POS2.ui;
    POS2.togglePicker();
    /* v2.24.0 — Bulk Add ab dedicated MODAL hai; picker usi ke andar rehta hai */
    const host = document.querySelector('.modal-scrim .ipk') || __UIH.pkHost;
    window.__UIH.pkHost = host;
    return { pickerOpen: !!host && !host.hidden && !!host.querySelector('input[type=text]'),
      inModal: !!document.querySelector('.modal-scrim .ipk') };`);
  const k2 = await ev('picker: search', `
    /* v2.24.0 — picker mein pehla text input SCAN field hai; search ke liye .ipk-q */
    const inp = __UIH.pkHost.querySelector('.ipk-q') || __UIH.pkHost.querySelector('input[type=text]');
    inp.value = 'flamingo'; inp.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 700));
    return { results: __UIH.pkHost.querySelectorAll('.gs-item').length };`);
  const k3 = await ev('picker: multi + batch add', `
    /* v2.24.0 — picker ka public API use karein (DOM poke ke bajaye):
       setMulti(true) → rows tick → qty → commit() → POS cart mein merge */
    const host = __UIH.pkHost;
    host.api.setMulti(true);
    await new Promise(r => setTimeout(r, 120));
    const rows = [...host.querySelectorAll('.gs-item')];
    let lines = 0, firstQty = 0, boxes = 0;
    if (rows.length) {
      rows[0].click(); if (rows[1]) rows[1].click();
      await new Promise(r => setTimeout(r, 80));
      const qty = host.querySelector('.gs-item input[type=number]');
      if (qty) { qty.value = '3'; qty.dispatchEvent(new Event('input', { bubbles: true })); }
      boxes = host.querySelectorAll('.gs-item input[type=checkbox]').length;
      const addBarVisible = !host.querySelector('.po-addbar').hidden;
      const committed = host.api.commit();
      await new Promise(r => setTimeout(r, 150));
      lines = __S2.cart.length;
      firstQty = __S2.cart[0] && __S2.cart[0].qty;
      return { boxes, addBarVisible, committed, lines, firstQty };
    }
    return { boxes: 0, addBarVisible: false, committed: 0, lines: 0, firstQty: 0 };`);
  const k4 = await ev('picker: merge on re-add', `
    const firstId = __S2.cart[0] && __S2.cart[0].itemId, linesBefore = __S2.cart.length,
      firstQty = (__S2.cart[0] && __S2.cart[0].qty) || 0;
    const host = __UIH.pkHost;
    host.api.setMulti(false);                       // normal mode → row click seedha cart mein
    await new Promise(r => setTimeout(r, 120));
    const row2 = host.querySelector('.gs-item');
    if (row2) { row2.click(); await new Promise(r => setTimeout(r, 200)); }
    const again = __S2.cart.find(l => l.itemId === firstId);
    return { mergedSameLines: __S2.cart.length === linesBefore, mergeCounted: !!again && again.qty === firstQty + 1 };`);

  const k5 = await ev('cart structure', `
    const head = document.querySelector('.cart2-body .cart2-cols');
    const rowEl = document.querySelector('.cart2-body .cart2-row');
    return { headerCols: head ? head.children.length : 0,
      rowCells: rowEl ? { info: !!rowEl.querySelector('.cr-info'), qty: !!rowEl.querySelector('.qty-ctl'),
        rate: !!rowEl.querySelector('.cr-rate'), amt: !!rowEl.querySelector('.cr-amt'),
        acts: rowEl.querySelectorAll('.cr-acts button').length } : null,
      amtMatchesTotal: rowEl ? rowEl.querySelector('.cr-amt').textContent.replace(/[^\\d]/g, '') === String(Math.round(__S2.cart[0].price * __S2.cart[0].qty - (__S2.cart[0].discount || 0))) : false };`);
  const k6 = await ev('bulk: start (external once=0)', `
    App.state.settings = { 'scanner.liveUrl': 'https://scan.example.com/shop/' };
    const seen = [];
    window.open = (url) => { seen.push(url); return { closed: false, close() { this.closed = true; } }; };
    const toasts = []; window.__ut = window.UI.toast; window.UI.toast = (m) => { toasts.push(String(m)); };
    window.__seen = seen; window.__toasts = toasts;
    POS2.bulkFlow();
    return { bulkBadge: !__UIH.bulkBadge.hidden, bulkUrl: seen[0] || '' };`);
  const k7 = await ev('bulk: messages flow', `
    const n1 = (__seen[0].match(/[&?]n=([0-9a-zA-Z]+)/) || [])[1];
    const bc1 = String(__S2.catalog[0].bc), code1 = String(__S2.catalog[0].code);
    const bc2 = String(__S2.catalog[1].bc), code2 = String(__S2.catalog[1].code);
    const qOf = c => (__S2.cart.find(l => String(l.code) === c) || {}).qty || 0;
    const sumOf = () => __S2.cart.reduce((a, l) => a + l.qty, 0);
    const base = __S2.cart.length, q1 = qOf(code1), q2 = qOf(code2), sumB = sumOf();
    const post = (origin, value, nonce) => { const e = new Event('message'); e.origin = origin; e.data = { type: 'HASEEB_QR_RESULT', value, nonce }; window.dispatchEvent(e); };
    post('https://evil.example', bc1, n1);
    const evilIgnored = sumOf() === sumB;
    post('https://scan.example.com', bc1, n1);
    post('https://scan.example.com', bc2, n1);
    post('https://scan.example.com', bc1, n1);
    await new Promise(r => setTimeout(r, 50));
    return { evilIgnored, linesGrew: __S2.cart.length - base, d1: qOf(code1) - q1, d2: qOf(code2) - q2,
      sumGrew: sumOf() - sumB, badgeCount: /ON · 3/.test(__UIH.bulkBadge.textContent),
      sameCodeIsDistinct: code1 !== code2 };`);
  const k8 = await ev('bulk: badge stop', `
    __UIH.bulkBadge.click();
    await new Promise(r => setTimeout(r, 150));
    window.UI.toast = window.__ut;
    return { bulkStopped: __UIH.bulkBadge.hidden && !__UIH.bulkHandle,
      doneToast: __toasts.some(x => /Bulk scan (khatam|done)/.test(x)) };`); /* v2.30.6: T.t EN/roman dono */
  const k9 = await ev('bulk: in-app fallback (no liveUrl)', `
    App.state.settings = {};
    document.querySelectorAll('.modal-scrim').forEach(x => x.remove());   // purane overlay saaf
    POS2.bulkFlow();
    const scrim = [...document.querySelectorAll('.modal-scrim')].pop();
    const inAppBulk = !!scrim && /Bulk/i.test(scrim.textContent);
    const cBtn = scrim ? [...scrim.querySelectorAll('button')].find(b => /Cancel|Close|Bulk band|Stop bulk/i.test(b.textContent) /* v2.31.6 EN */) : null;
    if (cBtn) cBtn.click();
    await new Promise(r => setTimeout(r, 150));
    return { inAppBulk, inAppBulkStopped: __UIH.bulkBadge.hidden && !__UIH.bulkHandle };`);

  ok('demo render: ☑ opens the DEDICATED Bulk Add modal with the shared picker (no inline cart picker)',
    k1.pickerOpen && k1.inModal && k2.results > 0 && k3.boxes > 0, JSON.stringify({ r: k2.results, b: k3.boxes, inModal: k1.inModal }));
  ok('demo render: checkbox+qty batch adds — 2 lines, qty 3 respected', k3.addBarVisible && k3.lines === 2 && k3.firstQty === 3, JSON.stringify({ l: k3.lines, q: k3.firstQty }));
  ok('demo render: re-adding an existing product merges (no duplicate line)', k4.mergedSameLines && k4.mergeCounted);
  ok('demo render: every cart row carries Item/Qty/Rate/Amount/actions + header', k5.headerCols === 5 && k5.rowCells && k5.rowCells.rate && k5.rowCells.amt && k5.rowCells.acts >= 2 /* v2.31.3: +FOC chip (pos.discount) */);
  ok('demo render: amount cell equals qty × price − discount (aligned numbers real)', k5.amtMatchesTotal);
  ok('demo render: bulk opens scanner with once=0 + badge live count', /once=0/.test(k6.bulkUrl) && k6.bulkBadge && k7.badgeCount, k6.bulkUrl.slice(0, 96));
  ok('demo render: hostile origin ignored; 3 codes flow exactly (same code ×2 merges, second +1, badge 3)',
    k7.evilIgnored && k7.sameCodeIsDistinct && k7.d1 === 2 && k7.d2 === 1 && k7.sumGrew === 3 && k7.badgeCount && k7.linesGrew <= 2,
    JSON.stringify(k7));
  ok('demo render: badge stop closes session cleanly with summary toast', k8.bulkStopped && k8.doneToast);
  /* v2.31.3 (r15/F1) — FOC toggle: chip render (pos.discount owner) + 100% discount + amount 0 */
  const k10 = await ev('foc toggle', `
    document.querySelectorAll('.modal-scrim').forEach(x => x.remove());
    POS2.clearCart(true);
    await new Promise(r => setTimeout(r, 400));
    const cat = (POS2.S && POS2.S.catalog) || (App.state.catalog || {}).items || [];
    const raw = cat[0] || {};
    const it0 = { id: raw.id, code: raw.code, name: raw.name, retailPrice: raw.retailPrice ?? raw.rp ?? raw.retail, stock: raw.qty ?? raw.stock };
    await POS2.addToCart(it0, 1);
    await new Promise(r => setTimeout(r, 700));
    const chip = [].slice.call(document.querySelectorAll('.cart2-row .cr-acts button')).find(b => (b.getAttribute('aria-label') || '') === 'FOC toggle');
    if (!chip) return { chip: false };
    const amtBefore = (function(){ const c = document.querySelector('.cart2-row .cr-amt'); return c ? (c.textContent || '').trim() : ''; })();
    chip.click(); await new Promise(r => setTimeout(r, 500));
    const row = document.querySelector('.cart2-row');
    const amt = (row.querySelector('.cr-amt') || {}).textContent || '';
    const chipOn = !!row.querySelector('.cr-acts button.ok');
    return { chip: true, amtBefore, amt: amt.trim(), chipOn,
      tot: (function(){ const t = [].slice.call(document.querySelectorAll('#posTotal2, .tot2')).map(x=>x.textContent).join('|'); return t.slice(0, 60); })() };`);
  ok('demo render: FOC chip render (owner) + toggle → amount 0 + chip active', k10.chip && k10.chipOn && /Rs\s*0(?![0-9])/.test(k10.amt || ''), JSON.stringify(k10).slice(0, 140));
  ok('demo render: without liveUrl bulk degrades to in-app modal; Close ends cleanly', k9.inAppBulk && k9.inAppBulkStopped, JSON.stringify(k9));
  ok('demo render: zero console/jsdom errors across the whole flow', errors.length === 0, errors.slice(0, 2).join(' | '));
  win.close();
  finish();
})().catch(e => { console.log('jsdom phase error:', e.message, (e.stack || '').split('\n')[1] || ''); failed++; finish(); });

function finish() {
  console.log('\n' + '═'.repeat(66));
  console.log('  POS MULTI-ADD + BULK   PASS: ' + passed + '   FAIL: ' + failed);
  console.log('═'.repeat(66));
  if (failed) process.exit(1);
  process.exit(0);   /* jsdom timers otherwise hold the loop open */
}
