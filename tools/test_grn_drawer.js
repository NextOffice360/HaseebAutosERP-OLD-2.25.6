/**
 * tools/test_grn_drawer.js — v2.25.0 (requirement 2) — GRN drawer ka permanent gate.
 *
 * User ka audit finding: "GRN modal ko poora dobara design karein: width barhayein,
 * fields/sections ko restructure karein (premium ERP/POS hierarchy, spacing,
 * grouping, responsive); poora GRN workflow logic review karein; messy/redundant/
 * confusing interactions hatayein."
 *
 * Ye test ASLI Chromium mein drawer kholta hai aur rendered DOM naapta hai:
 *   · width + 4 sections + scan-first picker (POS jaisa hi component)
 *   · direct purchase mode = 5 columns, PO mode = 8 columns (khaali column shor nahi)
 *   · scan → line add → qty/cost → amount → live summary (subtotal + freight = total)
 *   · PO load (supplier auto-set + banner), line "Receive all", F4, remove
 *   · validation (0 lines / qty 0 / credit bina supplier) + F9 post
 *   · mobile 390px: header chhup jata hai aur har cell apna label dikhata hai
 *
 *   node tools/test_grn_drawer.js            (default demo/index.html)
 */
'use strict';
const puppeteer = require('puppeteer');
const { login } = require('./_harness');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const TARGET = process.argv[2] || ('file://' + path.join(ROOT, 'demo', 'index.html'));

let pass = 0, fail = 0; const ERR = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ok = (n, c, d) => c ? (pass++, console.log('  ✔ ' + n + (d ? '  → ' + d : '')))
  : (fail++, ERR.push(n), console.log('  ✖ ' + n + (d ? '  → ' + d : '')));

(async () => {
  console.log('\n\x1b[1mGRN DRAWER — redesign + workflow (req 2)\x1b[0m\n');
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e && e.message)));
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(TARGET, { waitUntil: 'load', timeout: 40000 });
  await login(page);            /* poll + login (shared harness) */
  await page.waitForFunction(() => window.App && App.state && App.state.session, { timeout: 15000 });
  await sleep(1200);
  /* toasts pakadne ke liye hook */
  await page.evaluate(() => {
    window.__toasts = [];
    const t = UI.toast;
    UI.toast = function (m, k) { window.__toasts.push(String(m)); return t.apply(this, arguments); };
  });
  /* v2.25.0 — UI2.confirm AB asli promise deta hai (pehle modal object deta tha,
     is liye `await UI2.confirm(...)` wale guards kabhi block hi nahi karte thay).
     Is test mein har confirm ka jawab EK ASLI USER ki tarah click se diya jata
     hai (Yes / Cancel) — warna flow wahin ruk jata. */
  await page.evaluate(() => {
    window.__confirms = [];
    window.__confirmMode = 'yes';
    const root = document.querySelector('#modalRoot') || document.body;
    const ans = () => {
      const list = [].slice.call(document.querySelectorAll('.modal-scrim .modal2'));
      for (const m of list) {
        if (m.__ans) continue;
        /* SIRF asli confirm dialog: footer mein theek 2 buttons — Cancel + Yes.
           (Pehle aksar `.modal2` ko bhi pakar leta tha jo Bulk Add/askCode jaise
           modal thay — un ka Cancel daba kar modal band ho jata tha.) */
        const foot = m.querySelector('.m-foot');
        const fb = foot ? [].slice.call(foot.querySelectorAll('button')) : [];
        const yes = fb.find(x => /^\s*Yes\s*$/.test((x.textContent || '').trim()));
        const no = fb.find(x => /^\s*Cancel\s*$/.test((x.textContent || '').trim()));
        if (fb.length !== 2 || !yes || !no) continue;
        m.__ans = 1;
        const msg = ((m.querySelector('.m-body') || m).innerText || '').replace(/\s+/g, ' ').trim().slice(0, 140);
        window.__confirms.push(msg);
        (window.__confirmMode === 'cancel' && no ? no : (yes || no)).click();
      }
    };
    new MutationObserver(ans).observe(root, { childList: true, subtree: true });
    setTimeout(ans, 50);
  });

  /* ---------------- drawer kholें (Purchase screen ke GRN action se) ---------------- */
  const opened = await page.evaluate(() => {
    if (window.App && App.go) App.go('purchase');
    return true;
  });
  await sleep(1400);
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x =>
      /\bGRN\b/.test(x.textContent || '') && !x.closest('.seg'));
    if (!b) return false; b.click(); return true;
  });
  await sleep(1200);
  ok('GRN drawer khula (Purchase ▸ GRN action)', clicked && !!(await page.$('.drawer')),
    'clicked=' + clicked + ' drawer=' + !!(await page.$('.drawer')));

  const w = await page.evaluate(() => { const d = document.querySelector('.drawer'); return d ? Math.round(d.getBoundingClientRect().width) : 0; });
  ok('drawer width barhi hui (>= 900px)', w >= 900, w + 'px');

  const secs = await page.$$eval('.drawer .sec-head h4', els => els.map(e => e.textContent.trim()));
  ok('4 saaf sections (Supplier / PO / Items / Charges)', secs.length === 4 && /Supplier/.test(secs[0]) &&
    /Purchase order/.test(secs[1]) && /Items/.test(secs[2]) && /Charges/.test(secs[3]), secs.join(' | '));

  const pk = await page.evaluate(() => {
    const p = document.querySelector('.drawer .picker-field .ipk');
    const q = document.querySelector('.drawer .ipk-q');
    return { present: !!p, scanAware: !!(q && q.dataset.scanAware === '1'),
      commit: (document.body.innerText.indexOf('Add to GRN lines') > -1),
      hint: (document.querySelector('.drawer .ipk-tt span') || {}).textContent || '',
      hasListBtn: !!document.querySelector('.drawer [title*="Poori product list"], .drawer .ipk-list') };
  });
  ok('items picker = POS wala hi scan-first component (scan + 📋 list)',
    pk.present && pk.scanAware && pk.hasListBtn && /POS jaisa|Scan/.test(pk.hint), JSON.stringify(pk));

  const emptyTxt = await page.evaluate(() => (document.querySelector('.drawer .grn-empty') || {}).innerText || '');
  ok('khali state ka wazeh message', /koi line nahi/i.test(emptyTxt), emptyTxt.replace(/\n/g, ' · ').slice(0, 70));

  /* ---------------- direct mode: sirf 5 columns ---------------- */
  const direct = await page.evaluate(() => ({
    cls: (document.querySelector('.grn-lines') || {}).className || '',
    head: [...document.querySelectorAll('.grn-line-head > span')].map(s => s.textContent.trim())
  }));
  ok('direct purchase mein khaali Ordered/Received/Short columns NAHI (5 columns)',
    /grn-direct/.test(direct.cls) && direct.head.length === 5 &&
    direct.head.join(',') === 'Item,Now,Cost,Amount,', JSON.stringify(direct.head));

  /* ---------------- dedicated Bulk Add modal (POS jaisa hi shared flow) ---------------- */
  const bulk = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    window.__toasts.length = 0;
    const bb = [].slice.call(document.querySelectorAll('.drawer .sec-actions button')).find(b => /Bulk add/.test(b.textContent || ''));
    if (!bb) return { err: 'Bulk add button nahi mila' };
    bb.click();
    await wait(900);
    /* UI2.modal ka host `.modal-scrim > .modal2` hota hai (`.scrim` drawer ka hai —
       pehle us par query ki wajah se test ne 0 rows dekhe thay) */
    const mod = document.querySelector('.modal-scrim .modal2');
    if (!mod) return { err: 'bulk modal nahi khula' };
    /* list: shuru mein khud load hoti hai, warna 📋 dabayein */
    const grab = () => mod.querySelectorAll('.gs-item').length;
    for (let i = 0; i < 12 && !grab(); i++) {
      if (i === 3) { const lb = mod.querySelector('button[title*="Poori product list"]'); if (lb) lb.click(); }
      await wait(400);
    }
    const rows = grab();
    const first = mod.querySelector('.gs-item');
    const ticked0 = mod.querySelectorAll('.gs-item.on').length;
    if (first) { const cb = first.querySelector('input[type=checkbox]'); (cb || first).click(); await wait(500); }
    const ticked1 = mod.querySelectorAll('.gs-item.on').length;
    const addBar = mod.querySelector('.po-addbar');
    const addBtn = addBar ? [].slice.call(addBar.querySelectorAll('button')).find(b => /Add|GRN/i.test(b.textContent || '')) : null;
    const before = document.querySelectorAll('.grn-line').length;
    if (addBtn) { addBtn.click(); await wait(1000); }
    const after = document.querySelectorAll('.grn-line').length;
    const x = mod.querySelector('.oc-x') || [].slice.call(mod.querySelectorAll('button')).find(b => /^✕|Close|Cancel/.test((b.textContent || '').trim()));
    if (x) x.click();
    await wait(400);
    return { rows: rows, ticked0: ticked0, ticked1: ticked1, commit: addBtn ? (addBtn.textContent || '').trim() : '',
      multi: !!mod.querySelector('.gs-item input[type=checkbox]'), before: before, after: after,
      closed: !document.querySelector('.modal-scrim .modal2') };
  });
  ok('Bulk Add modal — shared picker (multi tick + Add All → GRN line)',
    !bulk.err && bulk.rows > 0 && bulk.multi && bulk.ticked1 > bulk.ticked0 && bulk.after > bulk.before,
    JSON.stringify(bulk));

  /* ---------------- PO load → 8 columns + supplier auto + banner ---------------- */
  const po = await page.evaluate(async () => {
    const sel = document.querySelector('.drawer .grn-po-pick select');
    const opt = [...sel.options].find(o => o.value);
    if (!opt) return { err: 'koi open PO nahi mila' };
    sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 1500));
    const sup = document.querySelector('.drawer #f_supplierId');
    return { id: opt.value, head: [...document.querySelectorAll('.grn-line-head > span')].map(s => s.textContent.trim()),
      cls: (document.querySelector('.grn-lines') || {}).className || '',
      n: document.querySelectorAll('.grn-lines .grn-line').length,
      banner: (document.querySelector('.drawer .grn-banner') || {}).innerText.replace(/\n/g, ' ') || '',
      supplier: sup ? sup.value : '', fill: !!document.querySelector('.drawer .gl-fill') };
  });
  ok('PO load → 8 columns (Ordered/Received/Short) + supplier auto-set + PO banner',
    /grn-po/.test(po.cls) && po.head.length === 8 && po.n > 0 && !!po.supplier && /PO/.test(po.banner),
    JSON.stringify({ head: po.head, lines: po.n, supplier: po.supplier, banner: po.banner.slice(0, 60) }));

  /* ---------------- line par "Receive all" ---------------- */
  const all = await page.evaluate(async () => {
    const row = document.querySelector('.grn-line');
    const inp = row.querySelectorAll('.gl-input')[0];
    const full = Number(inp.value) || 0;
    inp.value = '1'; inp.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    const row2 = document.querySelector('.grn-line');
    const badge = (row2.querySelector('.badge') || {}).textContent.trim();
    const btn = row2.querySelector('.gl-fill');
    if (!btn) return { skip: true, badge: badge, full: full };
    btn.click();
    await new Promise(r => setTimeout(r, 400));
    const row3 = document.querySelector('.grn-line');
    return { full: full, qty: Number(row3.querySelectorAll('.gl-input')[0].value) || 0,
      badge: (row3.querySelector('.badge') || {}).textContent.trim(), shortBadgeBefore: badge };
  });
  ok('line par "Receive all" → qty wapas poori pending, Short badge 0',
    !all.skip && all.shortBadgeBefore.indexOf('Short') === 0 && all.qty === all.full && all.badge === '0',
    JSON.stringify(all));

  /* ------------- Clear PO par confirm dialog: Cancel = kuch nahi, Yes = PO hat jaye ------------- */
  const cf = await page.evaluate(async () => {
    const clr = [].slice.call(document.querySelectorAll('.drawer .grn-banner button')).find(b => /Clear PO/i.test(b.textContent || ''));
    if (!clr) return { err: 'Clear PO button nahi mila' };
    const pick = document.querySelector('.drawer .grn-po-pick select');
    const before = { lines: document.querySelectorAll('.grn-lines .grn-line').length, po: pick.value };
    const out = { before: before };
    window.__confirms.length = 0;
    window.__confirmMode = 'cancel';
    clr.click();
    await new Promise(r => setTimeout(r, 900));
    out.msg = window.__confirms[0] || '';
    out.cancel = { lines: document.querySelectorAll('.grn-lines .grn-line').length,
      banner: !!document.querySelector('.drawer .grn-banner:not([hidden])'), po: pick.value };
    window.__confirmMode = 'yes';
    clr.click();
    await new Promise(r => setTimeout(r, 900));
    out.yes = { lines: document.querySelectorAll('.grn-lines .grn-line').length,
      cols: document.querySelectorAll('.grn-line-head > span').length,
      banner: !!document.querySelector('.drawer .grn-banner:not([hidden])'), po: pick.value };
    return out;
  });
  ok('Clear PO → confirm dialog aata hai aur CANCEL par kuch nahi badalta (awaited guard asli mein block karta hai)',
    !cf.err && /PO hata dein/i.test(cf.msg || '') && cf.cancel && cf.cancel.lines === cf.before.lines
      && cf.cancel.banner === true && cf.cancel.po === cf.before.po,
    JSON.stringify({ msg: (cf.msg || '').slice(0, 60), cancel: cf.cancel, before: cf.before }));
  ok('Clear PO → YES par PO hat jata hai, lines khali, direct mode (5 columns)',
    !cf.err && cf.yes && cf.yes.lines === 0 && cf.yes.cols === 5 && cf.yes.banner === false && cf.yes.po === '',
    JSON.stringify(cf.yes));

  /* PO dobara load (aage ke steps PO context mein chalte hain) */
  const reload = await page.evaluate(async () => {
    const pick = document.querySelector('.drawer .grn-po-pick select');
    const opt = [].slice.call(pick.options).find(o => o.value);
    pick.value = opt.value; pick.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 1500));
    return { n: document.querySelectorAll('.grn-lines .grn-line').length, po: pick.value,
      cls: (document.querySelector('.grn-lines') || {}).className || '' };
  });
  ok('PO dobara load (8 columns wapas)', reload.n > 0 && /grn-po/.test(reload.cls), JSON.stringify(reload));

  /* ---------------- scan → line (POS jaisa behaviour) ---------------- */
  await page.evaluate(() => {
    const q = document.querySelector('.drawer .ipk-q');
    q.focus(); q.value = 'FL00000';
    q.dispatchEvent(new Event('input', { bubbles: true }));
    q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  await sleep(1300);
  const afterScan = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.grn-lines .grn-line')];
    const q = document.querySelector('.drawer .ipk-q');
    return { n: rows.length, qty: rows[0] ? (rows[0].querySelector('.gl-input') || {}).value : '',
      name: rows[0] ? (rows[0].querySelector('.pl-name b') || {}).textContent : '',
      cleared: !!q && q.value === '', toast: (window.__toasts || []).slice(-2).join(' | ') };
  });
  ok('scan → seedha GRN line mein (field clear, POS jaisa)', afterScan.n > po.n && afterScan.cleared,
    JSON.stringify(afterScan));

  /* ---------------- qty + cost + freight → amount + live summary ---------------- */
  const calc = await page.evaluate(async () => {
    const row = document.querySelector('.grn-lines .grn-line');
    const inp = row.querySelectorAll('.gl-input');
    inp[0].value = '5'; inp[0].dispatchEvent(new Event('change', { bubbles: true }));
    const cost = Number(inp[1].value) || 100;
    inp[1].value = String(cost); inp[1].dispatchEvent(new Event('change', { bubbles: true }));
    const fr = document.querySelector('.drawer #f_freight');
    fr.value = '250'; fr.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 500));
    const num = t => Number(String(t).replace(/[^0-9.]/g, '')) || 0;
    const rows = [...document.querySelectorAll('.grn-lines .grn-line')].map(r => ({
      q: Number(r.querySelectorAll('.gl-input')[0].value) || 0,
      c: Number(r.querySelectorAll('.gl-input')[1].value) || 0,
      amt: num((r.querySelector('.gl-cell b') || {}).textContent)
    }));
    const sumTxt = (document.querySelector('.grn-sum') || {}).innerText.replace(/\n+/g, ' ') || '';
    return { rows: rows, sumTxt: sumTxt, sumNum: num(sumTxt),
      sub: num((sumTxt.match(/Subtotal\s*Rs\s*([\d,]+)/) || [0, 0])[1]),
      fr: num((sumTxt.match(/Freight\s*Rs\s*([\d,]+)/) || [0, 0])[1]),
      total: num((sumTxt.match(/Total\s*Rs\s*([\d,]+)/) || [0, 0])[1]) };
  });
  const r0 = calc.rows[0];
  const subCalc = Math.round(calc.rows.reduce((a, x) => a + x.q * x.c, 0));
  const totalCalc = subCalc + 250;
  ok('qty × cost = Amount (row) aur summary = saray lines ka jama',
    r0 && r0.amt === Math.round(r0.q * r0.c) && Math.abs(calc.sub - subCalc) <= 1,
    'row: ' + r0.q + '×' + r0.c + '=' + r0.amt + '  |  rows=' + calc.rows.length + '  |  ' + calc.sumTxt.slice(0, 110));
  ok('freight total mein juda (Subtotal + 250 = Total)',
    calc.fr === 250 && Math.abs(calc.total - totalCalc) <= 1,
    'Subtotal=' + calc.sub + ' Freight=' + calc.fr + ' Total=' + calc.total + ' (expect ' + totalCalc + ')');

  /* ---------------- F4: receive all pending ---------------- */
  const f4 = await page.evaluate(async () => {
    window.__toasts.length = 0;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F4', bubbles: true }));
    await new Promise(r => setTimeout(r, 500));
    return (window.__toasts || []).join(' | ');
  });
  ok('F4 = Receive all pending (shortcut chalta hai)', f4.length > 0, f4);

  /* ---------------- F2 = scan field focus ---------------- */
  const f2 = await page.evaluate(async () => {
    document.body.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    return (document.activeElement || {}).className || '';
  });
  ok('F2 = scan/search field par focus', /ipk-q/.test(f2), f2);

  /* ---------------- mobile 390: responsive stacking ---------------- */
  await page.setViewport({ width: 390, height: 844 });
  await sleep(800);
  const mob = await page.evaluate(() => {
    const head = document.querySelector('.grn-line-head');
    const row = document.querySelector('.grn-line');
    const cell = row ? row.querySelector('.gl-cell') : null;
    const dr = document.querySelector('.drawer').getBoundingClientRect();
    return {
      headShown: head ? getComputedStyle(head).display !== 'none' : false,
      cols: row ? getComputedStyle(row).gridTemplateColumns.split(' ').length : 0,
      label: cell ? getComputedStyle(cell, '::before').content : '',
      overflow: row ? (row.getBoundingClientRect().right > dr.right + 1) : false
    };
  });
  ok('mobile 390 — line stack + har cell apna label (responsive)',
    !mob.headShown && mob.cols === 2 && /Ordered|Now|Cost|Amount/.test(mob.label) && !mob.overflow,
    JSON.stringify(mob));
  await page.setViewport({ width: 1440, height: 900 });
  await sleep(600);

  /* ---------------- validation: credit bina supplier ---------------- */
  const val = await page.evaluate(async () => {
    const sup = document.querySelector('.drawer #f_supplierId');
    sup.value = ''; sup.dispatchEvent(new Event('change', { bubbles: true }));
    window.__toasts.length = 0;
    [...document.querySelectorAll('.modal-foot button')].find(b => /Post GRN/.test(b.textContent)).click();
    await new Promise(r => setTimeout(r, 500));
    return (window.__toasts || []).join(' | ');
  });
  ok('validation: credit purchase bina supplier block', /supplier/i.test(val), val);

  /* ---------------- line remove ---------------- */
  const rm = await page.evaluate(async () => {
    const before = document.querySelectorAll('.grn-lines .grn-line').length;
    document.querySelector('.grn-line .gl-rm').click();
    await new Promise(r => setTimeout(r, 400));
    return { before: before, after: document.querySelectorAll('.grn-lines .grn-line').length };
  });
  ok('line hatana (✕) kaam karta hai', rm.after === rm.before - 1, JSON.stringify(rm));

  /* ---------------- validation: 0 lines + F9 post ---------------- */
  const zero = await page.evaluate(async () => {
    let guard = 0;
    while (document.querySelector('.grn-line .gl-rm') && guard++ < 40) {
      document.querySelector('.grn-line .gl-rm').click();
      await new Promise(r => setTimeout(r, 60));
    }
    window.__toasts.length = 0;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9', bubbles: true }));
    await new Promise(r => setTimeout(r, 500));
    return { toasts: (window.__toasts || []).join(' | '), n: document.querySelectorAll('.grn-lines .grn-line').length };
  });
  ok('validation: 0 lines ke saath Post block', /items add karein/i.test(zero.toasts), JSON.stringify(zero));

  const posted = await page.evaluate(async () => {
    const q = document.querySelector('.drawer .ipk-q');
    q.focus(); q.value = 'FL00000';
    q.dispatchEvent(new Event('input', { bubbles: true }));
    q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise(r => setTimeout(r, 1200));
    const sup = document.querySelector('.drawer #f_supplierId');
    const opt = [...sup.options].find(o => o.value);
    sup.value = opt.value; sup.dispatchEvent(new Event('change', { bubbles: true }));
    window.__toasts.length = 0;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9', bubbles: true }));
    await new Promise(r => setTimeout(r, 1500));
    return { toasts: (window.__toasts || []).join(' | '), drawerGone: !document.querySelector('.drawer') };
  });
  ok('F9 = Post GRN → success + drawer band', /GRN posted/.test(posted.toasts) && posted.drawerGone,
    JSON.stringify(posted));

  ok('is run mein zero page errors', errs.length === 0, JSON.stringify(errs).slice(0, 200));

  await browser.close();
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  GRN DRAWER   PASS: ${pass}   FAIL: ${fail}`);
  if (fail) ERR.forEach(e => console.log('   ✖ ' + e));
  console.log('═══════════════════════════════════════════════════════════');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('✖ ' + (e && e.stack || e)); process.exit(1); });
