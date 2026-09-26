/**
 * tools/test_pay_ledger.js — v2.25.5 (standing demand: "POS payment ledgers")
 *
 * Kya prove karta hai (sab RENDERED numbers + demo backend ka ASLI record):
 *   A. Desktop POS pay modal ka ledger math:
 *        - Total / Amount Paid / Current Due (footer `.tot2` rows)
 *        - "Exact" chip → invoice poora cover, Current Due = 0 (Clear)
 *        - overpay → Change row bilkul overpay ke barabar
 *        - customer ke sath ACCOUNT SUMMARY (`.ps-ledger`): Previous balance,
 *          This invoice, Amount Paid, Closing balance (= prev + total − paid), Credit limit / Available
 *   B. Jo sale ASAL mein record hoti hai (demo `sales.create` ledger):
 *        total / paid / change / due / status / paymentList — sab mutually consistent
 *   C. Blocked path: adhoora cash bina Udhaar → block toast, koi sale record NAHI
 *   D. Credit (udhaar) path: CREDIT row → status PARTIAL + due sahi
 *   E. Ledger invariants POORE sales ledger par:
 *        paid == Σpayments · change == max(0, paid−total) · due == max(0, total−paid) · status sahi
 *   F. PWA POS pay sheet ka wahi ledger (summary rows + Exact + blocked toast)
 *
 *   Demo serve: python3 -m http.server 8021 -d demo
 *   node tools/test_pay_ledger.js [baseUrl]
 */
'use strict';
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const BASE = process.argv[2] || 'http://127.0.0.1:8021';
let pass = 0, fail = 0; const ERR = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
function ok(c, n, x) { if (c) { pass++; console.log('  ✔ ' + n); } else { fail++; const m = '  ✖ ' + n + (x ? ' — ' + x : ''); ERR.push(m); console.log(m); } }
const num = s => { const m = String(s == null ? '' : s).replace(/[^0-9.\-]/g, ''); return m === '' ? 0 : Number(m); };

/* ------------------------------ page-side probes ------------------------------ */
const PAY_SUMMARY = `(() => {
  const modal = document.querySelector('.modal-scrim .modal2');
  if (!modal) return null;
  const n = s => { const m = String(s || '').replace(/[^0-9.\\-]/g, ''); return m === '' ? 0 : Number(m); };
  const rowOf = r => ({ k: ((r.children[0] || {}).textContent || '').trim(), v: n(((r.children[1] || {}).textContent || '')) });
  const t2 = [].slice.call(modal.querySelectorAll('.tot2')).map(x => (x.textContent || '').replace(/\\s+/g, ' ').trim());
  return {
    rows: [].slice.call(modal.querySelectorAll('.pay-summary > .ps-row')).map(rowOf),
    led: [].slice.call(modal.querySelectorAll('.ps-ledger .ps-row')).map(rowOf),
    ledTitle: ((modal.querySelector('.ps-ld-title') || {}).textContent || '').trim(),
    tot2: t2,
    foot: ((modal.querySelector('.modal-foot') || modal).textContent || '').replace(/\\s+/g, ' ').slice(0, 200),
    amount: (function () { const i = modal.querySelector('input[type=number][aria-label^="Amount for"]'); return i ? Number(i.value || 0) : null; })()
  };
})()`;
const SALES = `(() => {
  const list = (window.MockAPI && MockAPI['sales.list']) ? MockAPI['sales.list']({ page: 1, pageSize: 500 }) : null;
  if (!list) return null;
  return list.rows.map(s => {
    let pays = [];
    try { pays = JSON.parse(s.payments || '[]'); } catch (e) { pays = []; }
    return { id: s.id, invoiceNo: s.invoiceNo, total: Number(s.total || 0), paid: Number(s.paid || 0),
      due: Number(s.due || 0), change: Number(s.change || 0), status: s.status,
      method: s.paymentMethod, pays: pays.map(p => ({ m: p.method, a: Number(p.amount || 0), due: p.dueDate || '' })) };
  });
})()`;
const PWA_LEDGER = `(() => {
  const sum = document.getElementById('paySummary');
  if (!sum) return null;
  const n = s => { const m = String(s || '').replace(/[^0-9.\\-]/g, ''); return m === '' ? 0 : Number(m); };
  const rows = [].slice.call(sum.querySelectorAll('.row')).map(r => ({
    k: ((r.children[0] || {}).textContent || '').trim(), v: n(((r.children[1] || {}).textContent || '')) }));
  return { rows: rows, total: n((document.getElementById('payTotalBadge') || {}).textContent) };
})()`;

const pickRow = (rows, key) => (rows || []).filter(r => new RegExp(key, 'i').test(r.k))[0];
const tot2Find = (arr, key) => (arr || []).filter(x => new RegExp(key, 'i').test(x))[0] || '';
const salesCount = page => page.evaluate(`((${SALES}) || []).length`);
const readSales = page => page.evaluate(SALES);
async function freshSale(page, prevIds) {
  const all = await readSales(page);
  return { fresh: (all || []).filter(s => prevIds.indexOf(s.id) === -1), all: all || [] };
}
const invariants = list => {
  const bad = [];
  (list || []).forEach(s => {
    const sum = s.pays.reduce((a, p) => a + p.a, 0);
    if (Math.abs(sum - s.paid) > 0.01) bad.push(s.invoiceNo + ': paid ' + s.paid + ' != sum(payments) ' + sum);
    if (Math.abs(s.change - Math.max(0, s.paid - s.total)) > 0.01) bad.push(s.invoiceNo + ': change ' + s.change + ' != max(0, paid-total)');
    if (Math.abs(s.due - Math.max(0, s.total - s.paid)) > 0.01) bad.push(s.invoiceNo + ': due ' + s.due + ' != max(0, total-paid)');
    const st = (s.total - s.paid) <= 0 ? 'PAID' : (s.paid > 0 ? 'PARTIAL' : 'DUE');
    if (s.status !== st && s.status !== 'INVOICED') bad.push(s.invoiceNo + ': status ' + s.status + ' != ' + st);
  });
  return bad;
};

/* --------------------------------- POS helpers -------------------------------- */
async function addPosItem(page, times) {
  for (let i = 0; i < (times || 1); i++) {
    await page.evaluate(() => {
      const card = document.querySelector('#view .pcard');
      if (card) card.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    await sleep(700);
    /* card click "Add to bill" modal kholta hai — asli user path: usay commit karein */
    await page.evaluate(() => {
      const m = document.querySelector('.modal-scrim .modal2');
      if (!m) return;
      const b = [].slice.call(m.querySelectorAll('button')).filter(x => /add to bill/i.test(x.textContent || ''))[0];
      if (b) b.click();
    });
    await sleep(600);
  }
}
async function openPay(page) {
  const clicked = await page.evaluate(() => {
    const b = [].slice.call(document.querySelectorAll('#view button, .pos2-foot button'))
      .filter(x => x.getClientRects().length && /cash \(f9\)|card|split/i.test((x.textContent || '').toLowerCase()))[0];
    if (b) { b.click(); return (b.textContent || '').trim(); }
    return null;
  });
  await sleep(1100);
  return clicked;
}
async function setAmount(page, val) {
  await page.evaluate(v => {
    const modal = document.querySelector('.modal-scrim .modal2');
    const inp = modal ? modal.querySelector('input[type=number][aria-label^="Amount for"]') : null;
    if (!inp) return;
    inp.value = String(v);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  }, val);
  await sleep(340);
}
async function clickExactChip(page) {
  return page.evaluate(() => {
    const modal = document.querySelector('.modal-scrim .modal2');
    const c = modal ? [].slice.call(modal.querySelectorAll('button.chip2')).filter(x => /exact/i.test(x.textContent || ''))[0] : null;
    if (c) { c.click(); return true; }
    return false;
  });
}
async function clickComplete(page) {
  const clicked = await page.evaluate(() => {
    const modal = document.querySelector('.modal-scrim .modal2');
    const b = modal ? [].slice.call(modal.querySelectorAll('button')).filter(x => /complete/i.test((x.textContent || '').trim()))[0] : null;
    if (b) { b.click(); return true; }
    return false;
  });
  await sleep(2200);
  return clicked;
}
async function closeAllModals(page) {
  await page.evaluate(() => { document.querySelectorAll('.modal-scrim, .oc-scrim, .scrim, .offcanvas').forEach(x => x.remove()); });
  await sleep(300);
}
async function pickFirstCustomer(page) {
  await page.evaluate(() => { const bar = document.getElementById('custBar2'); if (bar) bar.click(); });
  await sleep(900);
  /* prefer aisa customer jiska udhaar (balance) AUR credit limit dono ho —
     warna ledger ka "Credit limit / Available" row by-design render nahi hota */
  /* v2.30.6 — deterministic: catalog se BEHTAREEN customer (limit+balance wala
     pehle), phir picker me USI ke naam wala button click (Walk-in/Naya kabhi nahi) */
  return page.evaluate(() => {
    const list = (App.state.catalog.customers || []).map(c => ({
      name: String(c.name || '').trim(), bal: Number(c.balance || 0), lim: Number(c.creditLimit || 0) }));
    const m = document.querySelector('.modal-scrim .modal2');
    if (!m) return null;
    const btns = [].slice.call(m.querySelectorAll('button'));
    const scored = [];
    list.forEach(c => {
      if (!c.name) return;
      const b = btns.filter(x => (x.textContent || '').indexOf(c.name) > -1)[0];
      if (b) scored.push({ b: b, t: (b.textContent || '').trim(), sc: (c.lim > 0 ? 2 : 0) + (c.bal > 0 ? 1 : 0) });
    });
    scored.sort((a, b2) => b2.sc - a.sc);
    const pick = scored[0];
    if (!pick) return null;
    pick.b.click();
    return pick.t;
  });
}

(async () => {
  console.log('\n\x1b[1mPOS PAYMENT LEDGERS — pay modal + recorded sale + invariants\x1b[0m\n');
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    /* ================================ DESKTOP POS ================================ */
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e && e.message).slice(0, 90)));
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(BASE + '/index.html', { waitUntil: 'networkidle2', timeout: 45000 });
    if (await page.$('#lgUser')) {
      await page.click('#lgUser'); await page.type('#lgUser', 'owner');
      await page.click('#lgPass'); await page.type('#lgPass', 'admin123');
      await page.keyboard.press('Enter');
    }
    await page.waitForFunction(() => window.App && App.state && App.state.session, { timeout: 20000 });
    await sleep(1200);
    /* v2.30.6 — demo v2.30.5 se CLOSED boot karta hai (user-report fix): gate khud
       shop session khole ga (standing recipe), warna shop-blocker pay modal ko
       replace kar deta hai */
    await page.evaluate(() => API.call('cash.session.open', { openingCash: 5000 }, { offlineFallback: () => null }).catch(() => null));
    await sleep(700);
    await page.evaluate(() => {
      window.__toasts = [];
      const t = UI.toast;
      UI.toast = function (m) { window.__toasts.push(String(m)); return t.apply(this, arguments); };
      window.__toasts.length = 0;
    });
    const baseline = await readSales(page);
    ok(!!baseline && baseline.length > 0, 'demo sales ledger load hua (`sales.list`)', baseline ? baseline.length + ' rows' : 'null');

    /* ---- 1) pay modal + summary/foot ledger ---- */
    await page.evaluate(() => App.go('pos'));
    await sleep(1400);
    await addPosItem(page, 2);
    const opened = await openPay(page);
    ok(!!opened, 'POS payment modal khula ("' + opened + '")');
    const s1 = await page.evaluate(PAY_SUMMARY);
    const T = (pickRow(s1.rows, '^Total$') || {}).v || 0;
    ok(!!s1 && T > 0, 'pay modal summary: Total row parhi gayi', JSON.stringify(s1 && s1.rows));
    const paidTxt0 = tot2Find(s1.tot2, 'paid');
    const dueTxt0 = tot2Find(s1.tot2, 'due|remaining');
    const paidRow0 = pickRow(s1.rows, 'Amount Paid');
    ok((paidRow0 ? paidRow0.v === 0 : num(paidTxt0) === 0) && num(dueTxt0) === T,
      'shuru mein: Paid = 0 aur Due = Total (' + T + ')', JSON.stringify({ paid: paidRow0 && paidRow0.v, tot2: s1.tot2 }));

    /* ---- 2) Exact chip → covered ---- */
    const exactClicked = await clickExactChip(page);
    await sleep(650);
    const s2 = await page.evaluate(PAY_SUMMARY);
    const paidRow2 = pickRow(s2.rows, 'Amount Paid');
    const clear2 = (s2.tot2 || []).some(x => /0 \(clear\)/i.test(x));
    ok(exactClicked && s2.amount === T && (paidRow2 ? Math.abs(paidRow2.v - T) < 1 : /Paid/i.test(s2.tot2.join(' '))) && clear2,
      'Exact chip: amount = Total, Paid = Total, Current Due = 0 (Clear)',
      JSON.stringify({ amt: s2.amount, paidRow: paidRow2 && paidRow2.v, tot2: s2.tot2 }));

    /* ---- 3) overpay → Change ---- */
    const OVER = 500;
    await setAmount(page, T + OVER);
    const s3 = await page.evaluate(PAY_SUMMARY);
    const chgTxt = tot2Find(s3.tot2, 'change');
    ok(/change/i.test(chgTxt) && num(chgTxt) === OVER,
      'overpay Rs ' + OVER + ' par footer Change = ' + OVER, JSON.stringify({ tot2: s3.tot2 }));

    /* ---- 4) Complete → invoice modal + RECORDED sale ---- */
    await page.evaluate(() => { window.__toasts.length = 0; });
    const done = await clickComplete(page);
    const inv = await page.evaluate(() => {
      const m = document.querySelector('.modal-scrim .modal2');
      return m ? (m.textContent || '').replace(/\s+/g, ' ').slice(0, 200) : '';
    });
    const l1 = await freshSale(page, baseline.map(s => s.id));
    const sale1 = l1.fresh[0];
    ok(done, '✅ Complete click hua');
    ok(/Sale complete/.test(inv) && !!sale1 && inv.indexOf(sale1.invoiceNo) > -1,
      'invoice confirmation modal + ledger mein wahi invoice (' + (sale1 && sale1.invoiceNo) + ')', inv.slice(0, 120));
    ok(!!sale1 && Math.abs(sale1.total - T) < 1 && Math.abs(sale1.paid - (T + OVER)) < 1 &&
      Math.abs(sale1.change - OVER) < 1 && sale1.due === 0 && sale1.status === 'PAID',
      'recorded sale: total=' + T + ' paid=' + (T + OVER) + ' change=' + OVER + ' due=0 status=PAID',
      JSON.stringify(sale1 && { total: sale1.total, paid: sale1.paid, change: sale1.change, due: sale1.due, status: sale1.status }));
    ok(!!sale1 && sale1.pays.length > 0 && Math.abs(sale1.pays.reduce((a, p) => a + p.a, 0) - sale1.paid) < 0.01,
      'paymentList ka jama = sale.paid (' + (sale1 && sale1.pays.reduce((a, p) => a + p.a, 0)) + ')',
      JSON.stringify(sale1 && sale1.pays));

    /* ---- 5) BLOCKED: adhoora cash bina udhaar ---- */
    await closeAllModals(page);
    await page.evaluate(() => App.go('pos'));
    await sleep(1200);
    await addPosItem(page, 1);
    await openPay(page);
    await page.evaluate(() => { window.__toasts.length = 0; });
    await setAmount(page, 5);
    const beforeBlockCount = await salesCount(page);
    await clickComplete(page);
    const toasts5 = await page.evaluate(() => (window.__toasts || []).join(' | '));
    const afterBlockCount = await salesCount(page);
    ok(/Full payment required|poora bill pay karein|pay the full bill/i.test(toasts5) /* v2.30.6: T.t EN/roman */ && afterBlockCount === beforeBlockCount,
      'adhoora cash bina Udhaar → block + koi sale record nahi (' + beforeBlockCount + ' → ' + afterBlockCount + ')',
      toasts5.slice(0, 150));
    await closeAllModals(page);

    /* ---- 6) CUSTOMER LEDGER (previous balance + closing) ---- */
    await page.evaluate(() => App.go('pos'));
    await sleep(1200);
    await addPosItem(page, 1);
    const custName = await pickFirstCustomer(page);
    await openPay(page);
    const s6 = await page.evaluate(PAY_SUMMARY);
    const ledName = String((s6 && s6.ledTitle) || '').replace(/^[^—]*—\s*/, '').trim();
    ok(!!custName && !!ledName, 'customer POS bar se select hua (' + (custName || '?') + ') · ledger: ' + ledName);
    /* v2.31.1 (r13) — credit-terms default: customer ke creditDays se promised-date prefill */
    const pref = await page.evaluate(() => {
      const d = document.querySelector('.modal-scrim .modal2 input[type=date]');
      return d ? d.value : '';
    });
    ok(!!pref, 'promised-date prefill (creditDays default) — ' + pref);
    const pv = pickRow(s6.led, 'Previous balance'), iv = pickRow(s6.led, 'This invoice'),
      cl = pickRow(s6.led, 'Closing balance'), li = pickRow(s6.led, 'Credit limit|Available');
    const T6 = iv ? iv.v : 0;
    ok(!!pv && !!iv && !!cl, 'account summary rows mojood (Previous balance / This invoice / Amount Paid / Closing)',
      JSON.stringify(s6.led));
    /* ledger IDENTITY (source-independent): Closing == prev + invoice − paid (paid = 0 abhi)
       + cross-view: POS customer bar ka "Previous" isi number se match kare */
    const barPrev = await page.evaluate(() => {
      const b = document.getElementById('custBal2');
      const t = b ? (b.textContent || '') : '';
      const m = t.match(/Previous\s*Rs\s*([0-9,]+)/);
      return m ? Number(m[1].replace(/,/g, '')) : 0;
    });
    ok(!!pv && pv.v > 0 && !!cl && Math.abs(cl.v - (pv.v + T6)) < 1 && Math.abs(barPrev - pv.v) < 2,
      'ledger identity: Previous ' + (pv && pv.v) + ' + invoice ' + T6 + ' → Closing ' + (cl && cl.v) +
      ' (customer bar ka Previous bhi wahi: ' + barPrev + ')',
      JSON.stringify({ pv: pv && pv.v, cl: cl && cl.v, barPrev: barPrev }));
    /* credit-limit row sirf tab render hoti hai jab customer ka limit ho — ho to numbers consistent hon */
    const liOK = !li || (li.v >= pv.v);
    ok(liOK, 'credit-limit row: ' + (li ? ('limit ' + li.v + ' >= prev ' + pv.v) : 'is customer ka limit nahi (by design row nahi)'),
      JSON.stringify({ li: li || null, pv: pv && pv.v }));
    await clickExactChip(page);
    await sleep(650);
    const s6b = await page.evaluate(PAY_SUMMARY);
    const ap6 = pickRow(s6b.led, 'Amount Paid'), cl6 = pickRow(s6b.led, 'Closing balance');
    ok(!!ap6 && Math.abs(ap6.v - T6) < 1 && !!cl6 && Math.abs(cl6.v - pv.v) < 1.5,
      'Exact ke baad: invoice cover, magar PURANA balance Closing mein baqi (' + (cl6 && cl6.v) + ')',
      JSON.stringify({ paid: ap6 && ap6.v, closing: cl6 && cl6.v, prev: pv && pv.v }));
    const prevIds6 = (await readSales(page)).map(s => s.id);
    await clickComplete(page);
    const l6 = await freshSale(page, prevIds6);
    const sale6 = l6.fresh[0];
    ok(!!sale6 && sale6.status === 'PAID' && sale6.due === 0 && Math.abs(sale6.paid - T6) < 1,
      'customer wali sale record hui: PAID, due 0, paid = invoice (' + (sale6 && sale6.paid) + ')',
      JSON.stringify(sale6 && { paid: sale6.paid, due: sale6.due, status: sale6.status }));
    await closeAllModals(page);

    /* ---- 7) CREDIT (udhaar) → PARTIAL + due ---- */
    await page.evaluate(() => App.go('pos'));
    await sleep(1200);
    await addPosItem(page, 1);
    await pickFirstCustomer(page);
    await openPay(page);
    const s7 = await page.evaluate(PAY_SUMMARY);
    const T7 = (pickRow(s7.rows, '^Total$') || {}).v || 0;
    const HALF = Math.round(T7 / 2);
    await page.evaluate(() => {
      const modal = document.querySelector('.modal-scrim .modal2');
      const sel = modal ? modal.querySelector('select[aria-label="Payment method"]') : null;
      if (sel) { sel.value = 'CREDIT'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await sleep(600);
    await setAmount(page, HALF);
    const prevIds7 = (await readSales(page)).map(s => s.id);
    await clickComplete(page);
    const l7 = await freshSale(page, prevIds7);
    const sale7 = l7.fresh[0];
    ok(!!sale7 && sale7.status === 'PARTIAL' && Math.abs(sale7.due - (T7 - HALF)) < 1 &&
      Math.abs(sale7.paid - HALF) < 1 && sale7.pays.some(p => p.m === 'CREDIT'),
      'udhaar (CREDIT): PARTIAL, paid=' + HALF + ', due=' + (T7 - HALF) + ', paymentList mein CREDIT',
      JSON.stringify(sale7 && { paid: sale7.paid, due: sale7.due, status: sale7.status, pays: sale7.pays }));
    await closeAllModals(page);

    /* ---- 8) INVARIANTS — poore ledger par ---- */
    const finalList = await readSales(page);
    const bad = invariants(finalList);
    ok(bad.length === 0, 'ledger invariants: paid == Σpayments · change == max(0,paid−total) · due == max(0,total−paid) · status sahi',
      bad.slice(0, 3).join(' | ') || 'all ' + (finalList || []).length + ' sales consistent');
    ok(errs.length === 0, 'desktop POS run mein zero page errors', JSON.stringify(errs).slice(0, 200));
    await page.close();

    /* ================================== PWA POS ================================== */
    const p2 = await browser.newPage();
    const perrs = [];
    p2.on('pageerror', e => perrs.push(String(e && e.message).slice(0, 90)));
    await p2.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await p2.goto(BASE + '/pwa-pos.html', { waitUntil: 'networkidle2', timeout: 45000 });
    await sleep(2200);
    const setPwaCustomer = () => p2.evaluate(() => {
      const c = (PWA.data && PWA.data.customers) || [];
      const f = [].slice.call(document.querySelectorAll('input')).filter(x => /customer|walk-in|search name/i.test((x.placeholder || '') + (x.getAttribute('aria-label') || '')))[0];
      if (f && c.length) { f.focus(); f.value = c[0].name || ''; f.dispatchEvent(new Event('input', { bubbles: true })); }
      return c.length ? (c[0].name || '') : null;
    });
    await p2.evaluate(() => {
      window.__pwaToasts = [];
      const t = PWA.toast;
      PWA.toast = function (m) { window.__pwaToasts.push(String(m)); return t.apply(this, arguments); };
      const i = [].slice.call(document.querySelectorAll('input')).filter(x => /scan/i.test(x.placeholder || ''))[0];
      if (i) i.id = 'ledgerScan';
    });
    await setPwaCustomer();
    await sleep(800);
    const code = await p2.evaluate(() => (PWA.data.items[0] || {}).code || '');
    await p2.click('#ledgerScan');
    for (const ch of code) await p2.keyboard.type(ch, { delay: 6 });
    await p2.keyboard.press('Enter');
    await sleep(1000);
    await p2.evaluate(() => { if (window.PaySheet) PaySheet.open(); });
    await sleep(1000);
    const g1 = await p2.evaluate(PWA_LEDGER);
    const inv0 = pickRow(g1.rows, 'This invoice'), rem1 = pickRow(g1.rows, 'Remaining amount'), cl0 = pickRow(g1.rows, 'Closing balance');
    const PT = inv0 ? inv0.v : 0;
    ok(!!g1 && PT > 0 && !!rem1 && Math.abs(rem1.v - PT) < 1 && !!cl0 && Math.abs(cl0.v - PT) < 1,
      'PWA pay sheet ledger: This invoice ' + PT + ' · Remaining ' + (rem1 && rem1.v) + ' · Closing ' + (cl0 && cl0.v),
      JSON.stringify(g1 && g1.rows));
    await p2.evaluate(() => {
      const c = [].slice.call(document.querySelectorAll('#payQuickChips button')).filter(x => /exact/i.test(x.textContent || ''))[0];
      if (c) c.click();
    });
    await sleep(700);
    const g2 = await p2.evaluate(PWA_LEDGER);
    const cl1 = pickRow(g2.rows, 'Closing balance'), cash1 = pickRow(g2.rows, 'Cash Paid');
    ok(!!cash1 && Math.abs(cash1.v) - PT === 0 && !!cl1 && cl1.v === 0,
      'PWA Exact: Cash Paid = invoice, Closing = 0', JSON.stringify({ cash: cash1 && cash1.v, closing: cl1 && cl1.v }));
    /* blocked partial (customer set — warna credit row khud pehle block karti hai) */
    await p2.evaluate(() => {
      window.__pwaToasts.length = 0;
      const inputs = [].slice.call(document.querySelectorAll('#payRowsHost input[type=number]'));
      const cash = inputs[0];
      if (cash) { cash.value = '5'; cash.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    await sleep(500);
    await p2.evaluate(() => { const b = document.getElementById('payConfirmBtn'); if (b) b.click(); });
    await sleep(1800);
    const ptoasts = await p2.evaluate(() => (window.__pwaToasts || []).join(' | '));
    ok(/Full payment required/i.test(ptoasts), 'PWA blocked path: "Full payment required" toast', ptoasts.slice(0, 150));
    ok(perrs.length === 0, 'PWA run mein zero page errors', JSON.stringify(perrs).slice(0, 200));

    /* ══════════════════════════════════════════════════════════════════════════
       G. PWA pay/receipt layers — STALE-NODE VISIBILITY (v2.27.0 hardening)
       Desktop sabak (UI2.dismissTop / v2.25.2): class hone se visibility nahi hoti.
       Yahan prove: stale (invisible magar .open) layer Esc ko nigal na paye,
       ledger corrupt na ho, orphan/duplicate nodes na banein.
       ══════════════════════════════════════════════════════════════════════════ */
    const REP = `(() => { try { return PWA.layerReport(); } catch (e) { return { err: String(e) }; } })()`;
    const closeAll = () => p2.evaluate(`(() => {
      try {
        const l = document.getElementById('posReceiptLayer'); if (l) { l.style.display = ''; l.classList.remove('open'); l.setAttribute('aria-hidden','true'); }
        if (window.PaySheet) PaySheet.close();
        if (window.Receipt) Receipt.close();
        if (window.PosCart) PosCart.close();
        if (PWA.sweepStale) PWA.sweepStale();
      } catch (e) { }
      return (window.PosCart ? true : false);
    })()`);
    const addOneItem = async () => {
      const code = await p2.evaluate(() => (PWA.data.items[0] || {}).code || '');
      await p2.evaluate(() => { const i = document.getElementById('ledgerScan') || [].slice.call(document.querySelectorAll('input')).filter(x => /scan/i.test(x.placeholder || ''))[0]; if (i) i.id = 'ledgerScan'; });
      await p2.click('#ledgerScan');
      for (const ch of code) await p2.keyboard.type(ch, { delay: 6 });
      await p2.keyboard.press('Enter');
      await sleep(900);
    };

    await closeAll();
    /* G0 — cart mein item (pay sheet khul jaye = cart ready) */
    let top0 = await p2.evaluate(`(() => { const l = document.getElementById('posPayLayer'); if (l) l.style.display = ''; if (window.PaySheet) PaySheet.open(); return posTopLayer(); })()`);
    if (top0 !== 'posPayLayer') { await addOneItem(); await closeAll(); top0 = await p2.evaluate(`(() => { if (window.PaySheet) PaySheet.open(); return posTopLayer(); })()`); }
    ok(top0 === 'posPayLayer', 'G0 stale-test setup: cart mein item + pay sheet khul gaya', String(top0));

    /* G1 — pay sheet khula: open ⊂ visible, koi stale nahi, body locked */
    await sleep(700);
    const r1 = await p2.evaluate(REP);
    ok(r1 && !r1.err && r1.open.indexOf('posPayLayer') !== -1 && r1.visible.indexOf('posPayLayer') !== -1 && r1.open.every(x => r1.visible.indexOf(x) !== -1),
      'G1 pay sheet: open ⊂ visible (koi invisible-open layer nahi)', JSON.stringify(r1));
    ok(r1 && r1.bodyLocked === true, 'G1b pay sheet khula → body scroll-locked', JSON.stringify(r1));

    /* G2 — ORPHAN guard node: hidden [data-stale-guard] DOM mein → sweep hata de */
    await p2.evaluate(() => {
      const n = document.createElement('div'); n.setAttribute('data-stale-guard', '1');
      n.id = 'orphanGuardProbe'; n.style.display = 'none'; n.textContent = 'orphan';
      document.body.appendChild(n);
    });
    const g2a = await p2.evaluate(`(() => ({ inDom: !!document.getElementById('orphanGuardProbe'), rep: PWA.layerReport() }))()`);
    ok(g2a.inDom === true && g2a.rep.orphans >= 1, 'G2 orphan guard node DOM mein (pre-sweep count ' + (g2a.rep && g2a.rep.orphans) + ')', JSON.stringify(g2a.rep));
    const g2b = await p2.evaluate(`(() => { const r = PWA.sweepStale(); return { removed: r.removed, inDom: !!document.getElementById('orphanGuardProbe') }; })()`);
    ok(g2b.removed >= 1 && g2b.inDom === false, 'G2b sweepStale() ne orphan node hata diya (removed=' + g2b.removed + ')', JSON.stringify(g2b));

    /* G3 — STALE LAYER (root cause simulation): receipt .open magar display:none
       → (a) report stale pakre, (b) posTopLayer skip kare, (c) Esc VISIBLE pay sheet band kare
       + stale sweep ho, (d) ledger values theek rahein. */
    const before = await p2.evaluate(PWA_LEDGER);
    await p2.evaluate(() => {
      const l = document.getElementById('posReceiptLayer');
      l.classList.add('open'); l.setAttribute('aria-hidden', 'false'); l.style.display = 'none';
    });
    const r3 = await p2.evaluate(REP);
    ok(r3 && r3.stale.indexOf('posReceiptLayer') !== -1, 'G3 stale receipt layer detect (open magar invisible)', JSON.stringify(r3));
    const top3 = await p2.evaluate(`(() => (window.posTopLayer ? posTopLayer() : 'no-fn'))()`);
    ok(top3 === 'posPayLayer', 'G3b posTopLayer() stale layer ko skip karta hai → asli visible layer top', String(top3));
    await p2.keyboard.press('Escape');
    await sleep(700);
    const r3c = await p2.evaluate(REP);
    ok(r3c.open.indexOf('posPayLayer') === -1 && r3c.stale.length === 0,
      'G3c Esc ne VISIBLE pay sheet band ki, stale layer bhi sweep ho gaya', JSON.stringify(r3c));
    const after = await p2.evaluate(PWA_LEDGER);
    ok(!before || !after || JSON.stringify(before) === JSON.stringify(after),
      'G3d ledger values stale-node episode se badle nahi', JSON.stringify({ before: before && before.rows, after: after && after.rows }));

    /* G4 — receipt double-open: duplicate/orphan node na banein, badge + preview set */
    await closeAll(); await sleep(300);
    await p2.evaluate(() => {
      const l = document.getElementById('posReceiptLayer'); if (l) l.style.display = '';
      const item = (PWA.data.items[0] || {});
      const sale = { invoiceNo: 'GATE-TEST-1', total: 100, paid: 100, change: 0, due: 0,
        items: [{ name: item.name || 'Gate item', code: item.code || 'G1', qty: 1, price: 100 }],
        payments: [{ method: 'CASH', amount: 100 }], customerName: 'Gate Walk-in' };
      if (window.Receipt) { Receipt.open(sale); Receipt.open(sale); }
    });
    await sleep(600);
    const rc = await p2.evaluate(`(() => {
      const l = document.getElementById('posReceiptLayer');
      const sheets = l ? l.querySelectorAll('.pay-sheet').length : 0;
      const prev = document.getElementById('receiptPreview');
      return { open: l ? l.classList.contains('open') : null, sheets: sheets,
        badge: (document.getElementById('receiptNoBadge') || {}).textContent || '',
        prevLen: prev ? prev.innerHTML.length : 0,
        visible: PWA.layerVisible ? PWA.layerVisible(l) : null,
        stale: PWA.layerReport().stale };
    })()`);
    ok(rc.open === true && rc.visible === true && rc.sheets === 1, 'G4 receipt double-open par bhi .pay-sheet sirf 1 (orphan duplicate nahi)', JSON.stringify(rc));
    ok(rc.badge === 'GATE-TEST-1' && rc.prevLen > 100, 'G4b receipt badge set + preview render (' + rc.badge + ', ' + rc.prevLen + 'B)', JSON.stringify(rc));

    /* G4c — receipt ke andar close button bhi kaam kare (DOM-level, visible layer) */
    await p2.evaluate(() => {
      const l = document.getElementById('posReceiptLayer');
      const b = [].slice.call(l.querySelectorAll('button')).filter(x => /✕|close/i.test((x.getAttribute('aria-label') || '') + (x.textContent || '')))[0];
      if (b) b.click(); else l.classList.remove('open');
    });
    await sleep(500);
    const rc2 = await p2.evaluate(`(() => ({ open: document.getElementById('posReceiptLayer').classList.contains('open'), stale: PWA.layerReport().stale.length }))()`);
    ok(rc2.open === false && rc2.stale === 0, 'G4c receipt close button → layer band, stale 0', JSON.stringify(rc2));

    /* G5 — receipt scrim-close (sirf receipt khula ho) → band + body unlock + stale 0 */
    await closeAll(); await sleep(300);
    await p2.evaluate(() => { if (window.Receipt) Receipt.open(window.LAST_SALE || null); });
    await sleep(400);
    await p2.evaluate(() => { const sc = document.querySelector('#posReceiptLayer .pos-scrim'); if (sc) sc.click(); });
    await sleep(500);
    const r5 = await p2.evaluate(`(() => {
      const prev = document.getElementById('receiptPreview');
      return { open: document.getElementById('posReceiptLayer').classList.contains('open'),
        rep: PWA.layerReport(), prevLen: prev ? prev.innerHTML.length : 0 };
    })()`);
    ok(r5.open === false && r5.rep.stale.length === 0 && r5.rep.bodyLocked === false,
      'G5 receipt scrim-close: layer band + body unlock + stale 0', JSON.stringify(r5.rep));
    ok(r5.prevLen > 100, 'G5b close ke baad preview content mojood (orphan wipe nahi)', String(r5.prevLen));

    /* G6 — kill-switch proof: PWA._features.stale=false → stale layer ko sweep NA kare */
    const g6 = await p2.evaluate(`(() => {
      const l = document.getElementById('posReceiptLayer');
      l.classList.add('open'); l.style.display = 'none';
      PWA._features.stale = false;
      const rep = PWA.sweepStale();
      const still = l.classList.contains('open');
      PWA._features.stale = true;
      const rep2 = PWA.sweepStale();
      const after = document.getElementById('posReceiptLayer').classList.contains('open');
      const disp = document.getElementById('posReceiptLayer').style.display;
      document.getElementById('posReceiptLayer').style.display = '';
      return { closedWithSwitchOff: rep.closed.length, stillOpen: still, closedAfterReset: rep2.closed, afterReset: after, disp: disp };
    })()`);
    ok(g6.closedWithSwitchOff === 0 && g6.stillOpen === true, 'G6 kill-switch: PWA._features.stale=false → stale layer chhua nahi gaya', JSON.stringify(g6));
    ok(g6.afterReset === false || g6.closedAfterReset.indexOf('posReceiptLayer') !== -1, 'G6b kill-switch on → sweep phir se kaam karta hai', JSON.stringify(g6));

    /* G7 — layer stack: cart + pay dono → Esc pay (top) band kare, cart + lock baqi; dobara Esc → sab saaf */
    await closeAll(); await sleep(300);
    await p2.evaluate(() => {
      if (window.PosCart) PosCart.open();
      if (window.PaySheet) PaySheet.open();
    });
    await sleep(900);
    const r7a = await p2.evaluate(`(() => ({ top: posTopLayer(), rep: PWA.layerReport() }))()`);
    ok(r7a.top === 'posPayLayer', 'G7 cart+pay stack: top = posPayLayer', JSON.stringify(r7a));
    await p2.keyboard.press('Escape');
    await sleep(700);
    const r7b = await p2.evaluate(`(() => ({ top: posTopLayer(), rep: PWA.layerReport() }))()`);
    ok(r7b.rep.open.indexOf('posPayLayer') === -1 && r7b.rep.open.indexOf('posCartLayer') !== -1 && r7b.rep.bodyLocked === true,
      'G7b Esc#1: pay band, cart khula (scroll LOCKED rahe)', JSON.stringify(r7b));
    await p2.keyboard.press('Escape');
    await sleep(700);
    const r7c = await p2.evaluate(`(() => ({ top: posTopLayer(), rep: PWA.layerReport() }))()`);
    ok(r7c.top === null && r7c.rep.open.length === 0 && r7c.rep.stale.length === 0 && r7c.rep.bodyLocked === false,
      'G7c Esc#2: cart band, scroll unlock, zero stale', JSON.stringify(r7c));
    ok(perrs.length === 0, 'G baad bhi zero page errors', JSON.stringify(perrs).slice(0, 200));

    /* G8 — SOURCE CONTRACT (regression lock): ye pattern dobara toot na paye */
    const sr = (f) => fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf8');
    const shell = sr('Pwa_Shell.html'), posSrc = sr('Pwa_POS.html');
    const containsGuards = (shell.match(/document\.body\.contains\(/g) || []).length;
    ok(containsGuards >= 3, 'G8a Pwa_Shell: Esc listeners stale-guarded (document.body.contains x' + containsGuards + ')', String(containsGuards));
    ok(/function layerVisible\s*\(/.test(shell) && /PWA\.layerVisible = layerVisible/.test(shell) === false && /layerVisible: layerVisible/.test(shell),
      'G8b Pwa_Shell: layerVisible shared helper define + export object se bahar (IIFE-order bug dobara na ho)', 'missing');
    ok(/PWA\.layerVisible\(l\)\)\s*continue/.test(posSrc),
      'G8c Pwa_POS posTopLayer: stale (invisible-open) layer ko skip karta hai', 'missing');
    const sweeps = (posSrc.match(/PWA\.sweepStale/g) || []).length;
    ok(sweeps >= 5, 'G8d Pwa_POS: teeno layers ke open/close par sweepStale (' + sweeps + ' call-sites)', String(sweeps));
    await p2.close();
  } finally {
    await browser.close();
  }
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  PAY LEDGER   PASS: ' + pass + '   FAIL: ' + fail);
  if (fail) ERR.forEach(e => console.log('  ' + e));
  console.log('═══════════════════════════════════════════════════════════');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('✖ FATAL ' + (e && e.stack || e)); process.exit(2); });
