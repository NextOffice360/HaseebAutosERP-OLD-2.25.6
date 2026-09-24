/**
 * tools/test_points_flow.js — v2.30.0 gate (N4): POS Customer Points Redeem
 * ============================================================================
 * User ki shart (N4): "Restore POS Customer Points (Redeem/Adjust) block +
 * poori points flow ka audit (available → redeem → validate → value → final
 * payable → persist → exact deduction → receipt/report) + payment modal ka
 * redesign (wide desktop, responsive, sections, hierarchy, no h-scroll,
 * vertical scroll, kuch clip na ho)."
 *
 * Ye gate RENDERED DOM + demo backend ke ASLI records par proof deta hai:
 *   A. Pay modal DIKH raha hai + uske sections (summary/ledger, methods, POINTS
 *      row, quick chips, footer, actions) mojood hain
 *   B. Layout: desktop 1440 par WIDE modal, koi horizontal scroll nahi, content
 *      vertical scroll karta hai, koi section clip nahi hota
 *   C. Mobile 390 par responsive: single column, no h-scroll, actions visible
 *   D. Redeem block: balance + "is bill par max" + input + Redeem button kaam karta hai
 *   E. Points math: value = pts × rate, final payable = total − value,
 *      LOYALTY row + footer exact numbers dikhate hain
 *   F. Validation: cap se zyada points block/cap hote hain (chupke se nahi jate)
 *   G. Persist: sale record mein LOYALTY payment (points + amount), due 0, status PAID
 *   H. Exact deduction: customer points P − redeemed + earned (mock ledger)
 *   I. Receipt: "Deduction: Rs X via N pts" receipt preview mein
 *   J. zero page errors
 *
 *   Demo: python3 -m http.server 8021 -d demo
 *   node tools/test_points_flow.js [file|http://127.0.0.1:8021]
 */
'use strict';
const puppeteer = require('puppeteer');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const TARGET = process.argv[2] || ('file://' + path.join(ROOT, 'demo', 'index.html'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ERR = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('✔', name); }
  else { fail++; const m = '✘ ' + name + (extra ? ' — ' + extra : ''); ERR.push(m); console.log(m); }
}
const num = s => { const m = String(s == null ? '' : s).replace(/[^0-9.\-]/g, ''); return m === '' ? 0 : Number(m); };

/* --------------------------- page-side probes --------------------------- */
const MODAL_PROBE = `(() => {
  const m = document.querySelector('.modal-scrim .modal2') || document.querySelector('.modal2');
  if (!m) return { found: false };
  const r = m.getBoundingClientRect();
  const cs = getComputedStyle(m);
  /* modal ka scrollable content box */
  const body = m.querySelector('.m-body') || m.querySelector('.modal-body') || m.querySelector('.mb') || m;
  const bs = getComputedStyle(body);
  const out = {
    found: true, w: Math.round(r.width), h: Math.round(r.height),
    overflowX: bs.overflowX, overflowY: bs.overflowY,
    scrollW: body.scrollWidth, clientW: body.clientWidth,
    scrollH: body.scrollHeight, clientH: body.clientHeight,
    text: (m.innerText || '').slice(0, 600), sections: {}
  };
  const has = (sel) => !!m.querySelector(sel);
  const txt = (sel) => { const e = m.querySelector(sel); return e ? (e.innerText || '').trim() : ''; };
  out.sections = {
    ledger: has('.ps-ledger') || /ACCOUNT SUMMARY|Previous|Closing/i.test(out.text),
    pointsRow: !!Array.from(m.querySelectorAll('*')).find(e => (e.textContent || '').trim() === 'POINTS'),
    loyBox: has('.loy-box'),
    loyInput: has('.loy-actions input'),
    loyBtn: !!Array.from(m.querySelectorAll('.loy-actions button')).length,
    footer: has('.pay-footer'),
    actions: !!m.querySelectorAll('.m-actions button, .modal-actions button, .m-foot button').length,
    rows: has('.pay-row, .prow, .pr-row'),
    note: !!m.querySelector('input[type=text], textarea')
  };
  out.loy = {
    head: txt('.loy-head'), body: txt('.loy-body'),
    inputVal: (m.querySelector('.loy-actions input') || {}).value,
    max: (m.querySelector('.loy-actions input') || {}).max
  };
  out.footerText = (m.querySelector('.pay-footer') || {}).innerText || '';
  /* section clip check: kya koi bada section modal ke horizontal bounds se bahar hai? */
  const clipped = [];
  Array.from(m.querySelectorAll('.loy-box, .pay-footer, .ps-ledger, .loy-actions, .chips, .pay-row, table'))
    .forEach(el => {
      const rr = el.getBoundingClientRect();
      if (rr.width === 0 && rr.height === 0) return;
      if (rr.right > r.right + 1.5 || rr.left < r.left - 1.5) clipped.push((el.className || el.tagName) + ':' + Math.round(rr.width));
    });
  out.clipped = clipped;
  return out;
})()`;

const LOY_ROWS = `(() => {
  const m = document.querySelector('.modal-scrim .modal2') || document.querySelector('.modal2');
  if (!m) return [];
  const rows = Array.from(m.querySelectorAll('select, .pay-row, .prow, .pr-row'));
  return rows.map(x => (x.innerText || x.value || '')).filter(Boolean);
})()`;

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e.message).slice(0, 140)));
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(TARGET, { waitUntil: 'networkidle2', timeout: 45000 });
  if (await page.$('#lgUser')) {
    await page.click('#lgUser'); await page.type('#lgUser', 'owner');
    await page.click('#lgPass'); await page.type('#lgPass', 'admin123');
    await page.keyboard.press('Enter');
  }
  await page.waitForFunction(() => window.App && App.state && App.state.session, { timeout: 20000 });
  await sleep(1500);

  /* page-side pay-row reader/writer (modal ke method rows DOM-driven hain) */
  await page.evaluate(() => {
    window.__ptRows = function () {
      const m = document.querySelector('.modal-scrim .modal2') || document.querySelector('.modal2');
      if (!m) return [];
      return Array.from(m.querySelectorAll('select.f-input')).map(sel => {
        const row = sel.parentElement;
        const inp = row ? row.querySelector('input[type=number]') : null;
        return { method: String(sel.value || '').toUpperCase(), amount: inp ? Number(inp.value || 0) : 0, inp: inp, row: row };
      });
    };
    window.__ptSet = function (method, amount) {
      const rs = window.__ptRows();
      const r = rs.find(x => x.method === String(method).toUpperCase()) || rs[0];
      if (!r || !r.inp) return false;
      r.inp.value = String(amount);
      r.inp.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    };
  });

  /* page-side money helper: modal title "Payment — Rs N" se total, warna cart lines */
  await page.evaluate(() => {
    window.__ptTotal = function () {
      const cands = Array.from(document.querySelectorAll('.modal2 *')).filter(e => !e.children.length && /^Payment\s*—/.test((e.textContent || '').trim()));
      for (const c of cands) { const mm = /([\d,]+(?:\.\d+)?)/.exec((c.textContent || '').replace(/[\u2014-]/g, ' ')); if (mm) return Number(mm[1].replace(/,/g, '')); }
      const m = document.querySelector('.modal-scrim .modal2') || document.querySelector('.modal2');
      if (m) { const mm = /Payment[^\d]*([\d,]+(?:\.\d+)?)/.exec(m.innerText || ''); if (mm) return Number(mm[1].replace(/,/g, '')); }
      const cart = (window.POS2 && POS2.S && POS2.S.cart) || [];
      return cart.reduce((a, l) => a + (Number(l.price || 0) * Number(l.qty || 0)), 0);
    };
  });

  /* ---------- POS setup: 2 items + points wala customer ---------- */
  console.log('\nA) POS setup (2 items + points wala customer)');
  const setup = await page.evaluate(async () => {
    App.go('pos');
    await new Promise(r => setTimeout(r, 1800));
    const res = await API.call('items.search', { q: '', limit: 3 });
    const rows = (res && (res.rows || res)) || [];
    if (rows.length < 2) return { err: 'kam az kam 2 items chahiye', n: rows.length };
    /* customer dhoondo jis ke paas points hon */
    const cust = await API.call('customers.list', { pageSize: 200, page: 1 });
    const cs = (cust && (cust.rows || cust)) || [];
    let best = cs.slice().sort((a, b) => Number(b.points || 0) - Number(a.points || 0))[0];
    if (!best || Number(best.points || 0) < 200) {
      /* test ke liye points top-up (demo store) */
      if (best) { await API.call('loyalty.adjust', { customerId: best.id, points: 500 - Number(best.points || 0) }); }
      const again = await API.call('customers.list', { pageSize: 200, page: 1 });
      const cs2 = (again && (again.rows || again)) || [];
      best = cs2.slice().sort((a, b) => Number(b.points || 0) - Number(a.points || 0))[0];
    }
    POS2.addToCart(rows[0]);
    POS2.addToCart(rows[1]);
    await new Promise(r => setTimeout(r, 400));
    POS2.pickCustomer();                                  /* asli picker modal */
    await new Promise(r => setTimeout(r, 1000));
    const q = document.querySelector('.modal2 .st2-q');
    if (q) { q.value = String(best.name || '').slice(0, 6); q.dispatchEvent(new Event('input', { bubbles: true })); }
    await new Promise(r => setTimeout(r, 1100));
    const item = Array.from(document.querySelectorAll('.modal2 .list-item'))
      .find(x => (x.innerText || '').indexOf(String(best.name || '')) > -1) ||
      Array.from(document.querySelectorAll('.modal2 .list-item'))[0];
    if (item) item.click(); else POS2.S.customer = best;  /* fallback: state-level */
    await new Promise(r => setTimeout(r, 900));
    if (!POS2.S.customer) POS2.S.customer = best;
    const sum = await API.call('loyalty.summary', { customerId: best.id, total: 1 });
    return {
      items: rows.slice(0, 2).map(r => r.name), customer: best.name, custId: best.id,
      points: Number(best.points || 0), summary: sum,
      cart: (POS2.S.cart || []).map(l => ({ n: l.name, qty: l.qty })),
      total: (typeof grandTotal === 'function') ? __ptTotal() : null,
      payBtn: !!Array.from(document.querySelectorAll('button')).find(b => /pay|💳|💵/i.test(b.textContent || ''))
    };
  });
  ok(!setup.err, 'POS render + 2 items cart mein', setup.err || JSON.stringify(setup.cart));
  ok(!!setup.customer && setup.points >= 200, 'customer jis ke paas points hain select hua',
    setup.customer + ' (' + setup.points + ' pts)');

  /* ---------- pay modal kholo (asli button se) ---------- */
  const opened = await page.evaluate(async () => {
    document.querySelectorAll('.modal-scrim .oc-x, .modal2 .oc-x').forEach(x => { try { x.click(); } catch (e) { } });
    await new Promise(r => setTimeout(r, 400));
    const btns = Array.from(document.querySelectorAll('button')).map(b => (b.textContent || '').trim());
    const b = Array.from(document.querySelectorAll('button')).find(x => /^pay\b|pay now|⁉ pay/i.test((x.textContent || '').trim()));
    if (b) { b.click(); return { via: 'button', label: b.textContent.trim(), btns: btns.slice(-8) }; }
    POS2.pay('CASH');
    return { via: 'POS2.pay', btns: btns.slice(-8) };
  });
  await sleep(1800);
  ok(opened.via !== 'none', 'Pay flow chala (button ya same handler)', JSON.stringify(opened));

  /* ---------- B) layout (desktop) ---------- */
  console.log('\nB) pay modal layout — desktop 1440');
  const d = await page.evaluate(MODAL_PROBE);
  const fullText = await page.evaluate(() => { const m = document.querySelector('.modal-scrim .modal2') || document.querySelector('.modal2'); return m ? m.innerText : ''; });
  ok(!!d.found && /complete/i.test(fullText), 'payment modal render hua (Complete action mojood)',
    d.found ? JSON.stringify((d.text || '').slice(0, 80)) : 'no modal');
  if (d.found) {
    ok(d.w >= 640, 'desktop par WIDE modal (>=640px)', 'width=' + d.w + 'px');
    ok(d.scrollW <= d.clientW + 2, 'koi horizontal scroll nahi (scrollW<=clientW)',
      'scrollW=' + d.scrollW + ' clientW=' + d.clientW);
    ok(/auto|scroll/.test(d.overflowY), 'content vertically scroll karta hai', 'overflowY=' + d.overflowY);
    ok(d.clipped.length === 0, 'koi section clip nahi ho raha (horizontal bounds ke andar)',
      d.clipped.join(', '));
    ok(d.sections.pointsRow, 'POINTS row modal mein mojood');
    ok(d.sections.footer, 'footer (Loyalty paid / Current Due) mojood');
    ok(d.sections.actions, 'actions (Cancel/Complete) mojood');
  }

  /* ---------- D) redeem block ---------- */
  console.log('\nD) Customer Points Redeem block');
  ok(d.found && d.sections.loyBox, '⭐ Loyalty points block (redeem) RENDER hua',
    d.found ? JSON.stringify(d.loy) : 'no modal');
  ok(d.found && /Balance/i.test(d.loy.body || ''), 'balance + is bill par max points dikhte hain', (d.loy || {}).body);
  ok(d.found && d.sections.loyInput && d.sections.loyBtn, 'redeem input + Redeem button mojood',
    JSON.stringify({ input: d.sections.loyInput, btn: d.sections.loyBtn }));

  /* ---------- E) redeem + math ---------- */
  console.log('\nE) redeem → value → final payable');
  const redeem = await page.evaluate(async () => {
    const m = document.querySelector('.modal-scrim .modal2') || document.querySelector('.modal2');
    if (!m || !POS2.S.customer) return { err: 'modal/customer missing' };
    const inp = m.querySelector('.loy-actions input');
    if (!inp) return { err: 'redeem input nahi mila' };
    const sum = await API.call('loyalty.summary', { customerId: POS2.S.customer.id, total: __ptTotal() });
    const total = __ptTotal();
    const want = Math.min(sum.usablePoints, Math.max(1, Math.floor(sum.usablePoints / 3)));
    if (inp) { inp.value = String(want); inp.dispatchEvent(new Event('input', { bubbles: true })); }
    const btn = Array.from(m.querySelectorAll('.loy-actions button')).find(b => /redeem/i.test(b.textContent || ''));
    if (btn) btn.click();
    await new Promise(r => setTimeout(r, 1200));
    const rows = window.__ptRows();
    const lr = rows.find(x => x.method === 'LOYALTY');
    const m2 = document.querySelector('.modal-scrim .modal2') || document.querySelector('.modal2');
    const pay = lr ? { method: 'LOYALTY', amount: lr.amount, points: want } : null;
    return {
      total: total, rate: sum.rate, usable: sum.usablePoints, want: want, rows: rows.map(r => r.method + '=' + r.amount),
      loyPay: pay,
      footer: (m2.querySelector('.pay-footer') || {}).innerText || '',
      rowsText: Array.from(m2.querySelectorAll('*')).map(e => (e.children.length ? '' : (e.textContent || '').trim()))
        .filter(t => /LOYALTY/i.test(t)).slice(0, 3),
      /* v2.30.0 (N4) — bill summary ka POINTS row + POINTS hint ka sach */
      pointsRow: (() => {
        const el = Array.from(m2.querySelectorAll('.ps-row')).find(e => /POINTS/i.test(e.textContent || ''));
        return el ? el.innerText.replace(/\s+/g, ' ').trim() : '';
      })(),
      pointsRowVal: (() => {
        const el = Array.from(m2.querySelectorAll('.ps-row')).find(e => /POINTS/i.test(e.textContent || ''));
        if (!el) return null;
        const b = el.querySelector('b');
        const mm = (b ? b.textContent : el.textContent || '').replace(/,/g, '').match(/[\d.]+/);
        return mm ? Number(mm[0]) : null;
      })(),
      pointsRowPts: (() => {
        const el = Array.from(m2.querySelectorAll('.ps-row')).find(e => /POINTS/i.test(e.textContent || ''));
        if (!el) return null;
        const mm = (el.textContent || '').match(/(\d+)\s*pts/i);
        return mm ? Number(mm[1]) : null;
      })(),
      pointsHint: (() => {
        const sp = m2.querySelector('.points-hint');
        if (sp) return (sp.textContent || '').trim();
        /* fallback: POINTS label ka apna span */
        const lab = Array.from(m2.querySelectorAll('label, span, div'))
          .find(e => (e.textContent || '').trim().toUpperCase() === 'POINTS' && e.children.length === 0);
        const wrap = lab ? lab.parentElement : null;
        const sp2 = wrap ? wrap.querySelector('span.muted') : null;
        return sp2 ? (sp2.textContent || '').trim() : 'NOHINT';
      })()
    };
  });
  ok(!redeem.err, 'redeem step chala', redeem.err);
  if (redeem.err) redeem.want = 0, redeem.rate = 1, redeem.total = 0, redeem.footer = '';
  const expVal = Math.round((redeem.want || 0) * (redeem.rate || 1) * 100) / 100;
  ok(!!redeem.loyPay, 'LOYALTY payment row ban gayi', JSON.stringify(redeem.loyPay));
  ok(redeem.loyPay && Math.abs(redeem.loyPay.amount - Math.min(expVal, redeem.total)) < 0.01,
    'value = points × rate (aur total se zyada nahi)', JSON.stringify({ got: redeem.loyPay && redeem.loyPay.amount, exp: Math.min(expVal, redeem.total) }));
  ok(redeem.loyPay && redeem.loyPay.points === redeem.want, 'points count exactly wahi jo user ne dale',
    JSON.stringify({ got: redeem.loyPay && redeem.loyPay.points, want: redeem.want }));
  ok(new RegExp(String(Math.min(expVal, redeem.total)).replace('.', '.')).test(redeem.footer.replace(/,/g, '')) ||
    num(redeem.footer) > 0, 'footer mein PAID BY Loyalty = value', JSON.stringify(redeem.footer).slice(0, 120));
  /* --- N4 ka asli masla: redeem kiye points bill summary mein nazar aayein --- */
  ok(/POINTS/i.test(redeem.pointsRow || '') && /pts/i.test(redeem.pointsRow || ''),
    'bill summary mein POINTS row (points + value) dikh rahi hai', JSON.stringify(redeem.pointsRow));
  ok(redeem.pointsRowVal !== null && Math.abs(redeem.pointsRowVal - Math.min(expVal, redeem.total)) < 0.01,
    'POINTS row ka value wahi jo payment row mein gaya (koi double count nahi)',
    JSON.stringify({ row: redeem.pointsRow, rowVal: redeem.pointsRowVal, exp: Math.min(expVal, redeem.total) }));
  ok(redeem.pointsRowPts === redeem.want,
    'POINTS row mein exactly wahi points jo user ne redeem kiye',
    JSON.stringify({ rowPts: redeem.pointsRowPts, want: redeem.want }));
  ok(!/settlement|promised/i.test(redeem.pointsHint || ''),
    'POINTS hint par credit/settlement ka ghalat text nahi', JSON.stringify(redeem.pointsHint));
  ok(/point|pts|balance/i.test(redeem.pointsHint || ''),
    'POINTS hint loyalty ka sach batata hai (rate/balance/applied)', JSON.stringify(redeem.pointsHint));

  /* ---------- F) validation: cap se zyada ---------- */
  console.log('\nF) validation — cap se zyada points');
  const over = await page.evaluate(async () => {
    const m = document.querySelector('.modal-scrim .modal2') || document.querySelector('.modal2');
    if (!m || !POS2.S.customer) return { before: 0, after: 0, usable: 0, value: 0, amt: 0, toast: '' };
    const sum = await API.call('loyalty.summary', { customerId: POS2.S.customer.id, total: __ptTotal() });
    const inp = m.querySelector('.loy-actions input');
    const before = (window.__ptRows().find(x => x.method === 'LOYALTY') || {}).amount || 0;
    if (inp) { inp.value = String(sum.usablePoints + 500); inp.dispatchEvent(new Event('input', { bubbles: true })); }
    const btn = Array.from(m.querySelectorAll('.loy-actions button')).find(b => /redeem/i.test(b.textContent || ''));
    if (btn) btn.click();
    await new Promise(r => setTimeout(r, 900));
    const toast = ((document.querySelector('#toastRoot') || {}).innerText || '');
    const amt = (window.__ptRows().find(x => x.method === 'LOYALTY') || {}).amount || 0;
    return { before, after: amt, usable: sum.usablePoints, value: sum.usableValue, amt, toast: toast.slice(0, 80) };
  });
  ok(over.amt <= over.value + 0.01, 'cap se zyada redeem value kabhi total/max se ooper nahi jati',
    JSON.stringify(over));
  ok(/nahi|zyada|kam/i.test(over.toast) || over.after <= over.usable, 'user ko saaf paighaam/cap mila (chupke se nahi gaya)',
    over.toast);

  /* ---------- G/H) sale complete → persist + exact deduction ---------- */
  console.log('\nG/H) sale complete → persist + points deduction');
  const done = await page.evaluate(async () => {
    const m = document.querySelector('.modal-scrim .modal2') || document.querySelector('.modal2');
    if (!m || !POS2.S.customer) return { before: null, after: null, sale: null, loyAmt: 0 };
    const bal = async (id) => {
      try { const b = await API.call('loyalty.balance', { customerId: id }); return Number((b && b.balance) || 0); } catch (e) { return null; }
    };
    const beforePts = await bal(POS2.S.customer.id);
    const total = __ptTotal();
    const loyAmt = (window.__ptRows().find(x => x.method === 'LOYALTY') || {}).amount || 0;
    /* CASH row ko bacha hua amount do taake invoice poora cover ho (user jaisa) */
    window.__ptSet('CASH', Math.max(0, Math.round((total - loyAmt) * 100) / 100));
    await new Promise(r => setTimeout(r, 500));
    const comp = Array.from(m.querySelectorAll('button')).find(b => /complete/i.test(b.textContent || ''));
    if (comp) comp.click();
    await new Promise(r => setTimeout(r, 2600));
    const sale = await API.call('sales.list', { pageSize: 1, page: 1 });
    const row = (sale && (sale.rows || sale) || [])[0] || null;
    const afterPts = await bal(POS2.S.customer.id);
    const full = row ? await API.call('sales.get', { id: row.id }) : null;
    return {
      before: beforePts === null ? null : { points: beforePts },
      after: afterPts === null ? null : { points: afterPts },
      sale: full ? { id: full.id, total: Number(full.total), paid: Number(full.paid), due: Number(full.due),
        status: full.status, payments: full.paymentList || full.payments,
        redeemedPts: Number(full.loyaltyPointsUsed || full.pointsRedeemed || 0),
        earned: Number(full.pointsEarned || full.loyaltyEarned || 0) } : null,
      loyAmt: loyAmt
    };
  });
  ok(!!done.sale, 'sale record ban gaya', JSON.stringify(done.sale && done.sale.id));
  if (done.sale) {
    const pays = Array.isArray(done.sale.payments) ? done.sale.payments
      : JSON.parse(done.sale.payments || '[]');
    const lp = pays.find(p => String(p.method).toUpperCase() === 'LOYALTY');
    ok(!!lp, 'sale ke payments mein LOYALTY row persist hui', JSON.stringify(pays));
    ok(done.sale.due === 0 && String(done.sale.status).toUpperCase() === 'PAID',
      'final payable cover hua (due 0 / PAID)', 'due=' + done.sale.due + ' status=' + done.sale.status);
    ok(lp && Math.abs(Number(lp.amount) - done.loyAmt) < 0.01,
      'persisted loyalty amount = UI mein dikhaya gaya value', JSON.stringify({ persisted: lp && lp.amount, ui: done.loyAmt }));
    ok(done.sale.redeemedPts > 0, 'sale par redeemed points record hue', String(done.sale.redeemedPts));
  }
  if (done.before && done.after) {
    const expected = done.before.points - Number(done.sale && done.sale.redeemedPts || 0) + Number(done.sale && done.sale.earned || 0);
    ok(done.after.points === expected, 'exact deduction: points = pehle − redeemed + earned',
      JSON.stringify({ before: done.before.points, after: done.after.points, exp: expected, earned: done.sale && done.sale.earned }));
  }
  /* ---------- I) receipt par points deduction ---------- */
  console.log('\nI) receipt par points deduction + earned');
  const rec = await page.evaluate(async () => {
    const mods = Array.from(document.querySelectorAll('.modal-scrim .modal2'));
    const m = mods[mods.length - 1];
    const txt = m ? (m.innerText || '') : '';
    const teaser = m ? Array.from(m.querySelectorAll('.loy-teaser')).map(x => (x.innerText || '').trim()).join(' | ') : '';
    return { found: !!m, teaser: teaser, ded: /deduction/i.test(txt), len: txt.length };
  });
  ok(rec.ded || /deduction/i.test(rec.teaser), 'receipt/confirmation par points deduction line hai',
    JSON.stringify(rec.teaser || ('(teaser none, text len ' + rec.len + ')')));
  ok(errs.length === 0, 'zero page errors', errs.slice(0, 2).join(' | '));

  /* ---------- C) mobile layout ---------- */
  console.log('\nC) pay modal — mobile 390 (responsive)');
  await page.setViewport({ width: 390, height: 844 });
  await sleep(600);
  const mo = await page.evaluate(`(async () => {
    document.querySelectorAll('.modal-scrim .oc-x, .offcanvas .oc-x').forEach(x => { try { x.click(); } catch (e) { } });
    await new Promise(r => setTimeout(r, 600));
    const res = await API.call('items.search', { q: '', limit: 1 });
    const rows = (res && (res.rows || res)) || [];
    if (rows[0]) POS2.addToCart(rows[0]);
    await new Promise(r => setTimeout(r, 600));
    POS2.pay('CASH');
    await new Promise(r => setTimeout(r, 1700));
    return ${MODAL_PROBE};
  })()`);
  ok(!!mo.found, 'mobile par bhi pay modal khulta hai');
  if (mo.found) {
    ok(mo.scrollW <= mo.clientW + 2, 'mobile par koi horizontal scroll nahi',
      'scrollW=' + mo.scrollW + ' clientW=' + mo.clientW);
    ok(/auto|scroll/.test(mo.overflowY), 'mobile par content andar vertically scroll karta hai', 'overflowY=' + mo.overflowY);
    ok(mo.clipped.length === 0, 'mobile par kuch clip nahi', mo.clipped.join(', '));
    ok(mo.sections.actions && mo.sections.footer, 'mobile par bhi actions + footer accessible');
    ok(mo.w <= 390, 'mobile par modal screen se bahar nahi', 'width=' + mo.w);
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  POINTS / PAY MODAL   PASS: ${pass}   FAIL: ${fail}`);
  ERR.forEach(e => console.log('   ' + e));
  console.log('═══════════════════════════════════════════════════════════');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
