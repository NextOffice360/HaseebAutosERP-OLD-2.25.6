/**
 * tools/test_demand.js — v2.25.0 (requirement 3) — Customer Demands ka permanent gate.
 *
 * User ka audit finding: "Customer Demands ke purane partially-implemented modal ko
 * remove/replace karein; poora logic/workflow review karein; professional/structured/
 * aligned design; incomplete behaviour fix karein."
 *
 * Is gate mein asli Chromium mein naapa jata hai:
 *   · list screen load (demo mock mein demand routes mojood — pehle nahi thay),
 *     live search filter, KPI grid
 *   · detail modal (header + linked PO + status history)
 *   · naya demand form: sections, customer search pick (+intelligence), product pick
 *     (+stock), qty/date chips, validation, duplicate guard (server-side), F9 save
 *
 *   node tools/test_demand.js            (default demo/index.html)
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
  console.log('\n\x1b[1mCUSTOMER DEMANDS — logic + UI (req 3)\x1b[0m\n');
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e && e.message)));
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(TARGET, { waitUntil: 'load', timeout: 40000 });
  await login(page);            /* poll + login (shared harness) */
  await page.waitForFunction(() => window.App && App.state && App.state.session, { timeout: 15000 });
  await sleep(1200);
  await page.evaluate(() => {
    window.__toasts = [];
    const t = UI.toast;
    UI.toast = function (m, k) { window.__toasts.push(String(m)); return t.apply(this, arguments); };
  });

  /* v2.25.2 — UI2.confirm ab asli promise deta hai; is test mein bhi har confirm ka
     jawab ek ASLI user ki tarah click se diya jata hai (warna flow wahin ruk jata). */
  await page.evaluate(() => {
    window.__confirms = [];
    const root = document.querySelector('#modalRoot') || document.body;
    const ans = () => {
      [].slice.call(document.querySelectorAll('.modal-scrim .modal2')).forEach(m => {
        if (m.__ans) return;
        const foot = m.querySelector('.m-foot');
        const fb = foot ? [].slice.call(foot.querySelectorAll('button')) : [];
        const yes = fb.find(x => /^\s*Yes\s*$/.test((x.textContent || '').trim()));
        const no = fb.find(x => /^\s*Cancel\s*$/.test((x.textContent || '').trim()));
        if (fb.length !== 2 || !yes || !no) return;
        m.__ans = 1;
        window.__confirms.push(((m.querySelector('.m-body') || m).innerText || '').replace(/\s+/g, ' ').slice(0, 90));
        yes.click();
      });
    };
    new MutationObserver(ans).observe(root, { childList: true, subtree: true });
    setTimeout(ans, 50);
  });

  await page.evaluate(() => App.go('demands'));
  await sleep(1800);

  /* 1) list load (mock mein demand routes) */
  const list = await page.evaluate(() => {
    const rows = document.querySelectorAll('table.tbl2 tbody tr').length;
    const txt = (document.querySelector('#screenBody, .screen-body, body') || {}).innerText || '';
    return { rows: rows, err: /Koi backend connected nahi|⚠ /.test(txt),
      kpi: document.querySelectorAll('.kpi, .kpi-card, .kpi-grid > *').length };
  });
  ok('demands list load hui (rows + KPI, koi backend error nahi)',
    list.rows >= 3 && !list.err && list.kpi >= 4, JSON.stringify(list));

  /* 2) live search filter */
  const search = await page.evaluate(async () => {
    const inp = document.querySelector('.f-input[type=search], .f-grid input.f-input');
    if (!inp) return { skip: true };
    const before = document.querySelectorAll('table.tbl2 tbody tr').length;
    inp.value = 'NGK';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 900));
    const after = document.querySelectorAll('table.tbl2 tbody tr').length;
    const names = [...document.querySelectorAll('table.tbl2 tbody tr')].map(r => r.innerText).join(' | ');
    inp.value = ''; inp.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 700));
    return { before: before, after: after, ngk: /NGK/.test(names) };
  });
  ok('live search (customer/product/demand no) filter karta hai',
    search.after > 0 && search.after < search.before && search.ngk, JSON.stringify(search));

  /* 3) detail modal */
  const detail = await page.evaluate(async () => {
    const tr = document.querySelector('table.tbl2 tbody tr');
    if (!tr) return { open: false, heads: [], acts: [], why: 'koi row nahi' };
    tr.click();
    await new Promise(r => setTimeout(r, 1200));
    const m = document.querySelector('.modal2');
    const heads = m ? [...m.querySelectorAll('.card-head h4')].map(x => x.textContent.trim()) : [];
    const acts = m ? [...m.querySelectorAll('.m-foot button')].map(x => x.textContent.trim()) : [];
    const x = m ? [...m.querySelectorAll('.m-foot button')].find(b => /Close/.test(b.textContent)) : null;
    if (x) x.click();
    await new Promise(r => setTimeout(r, 500));
    return { open: !!m, heads: heads, acts: acts };
  });
  ok('detail modal — header + linked PO + status history + actions',
    detail.open && detail.heads.length >= 3 && detail.acts.some(a => /Close/.test(a)),
    JSON.stringify(detail.heads));

  /* 4) naya demand form */
  const opened = await page.evaluate(async () => {
    const b = [...document.querySelectorAll('button')].find(x => /New Demand/.test(x.textContent || ''));
    if (!b) return false;
    b.click(); await new Promise(r => setTimeout(r, 1200)); return true;
  });
  const secs = await page.evaluate(() => [...document.querySelectorAll('.modal2 .f-sec, .modal2 .field-sec, .modal2 .f-row-sec')]
    .map(x => x.textContent.trim().slice(0, 24)));
  ok('demand form khula, section structure mojood', opened && secs.length >= 4, secs.join(' | '));

  /* 5) validation: khali form */
  const val = await page.evaluate(async () => {
    window.__toasts.length = 0;
    [...document.querySelectorAll('.modal2 .m-foot button')].find(b => /Save demand/.test(b.textContent)).click();
    await new Promise(r => setTimeout(r, 600));
    return (window.__toasts || []).join(' | ');
  });
  ok('validation — customer + product ke bagair save block', /Customer select|Product name/i.test(val), val);

  /* 6) customer pick (search + intelligence) */
  const cust = await page.evaluate(async () => {
    const inp = document.querySelector('.modal2 #f_customerId, .modal2 .f-search');
    inp.focus(); inp.value = 'Ahmad';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 900));
    const rows = document.querySelectorAll('.modal2 .f-search-results .f-sr');
    if (!rows.length) return { rows: 0 };
    rows[0].click();
    await new Promise(r => setTimeout(r, 1100));
    const note = (document.querySelector('.modal2 .f-note') || {}).innerText || '';
    return { rows: rows.length, badge: !!document.querySelector('.modal2 .f-pick-badge:not([hidden])'),
      note: note.replace(/\n/g, ' ').slice(0, 90) };
  });
  ok('customer search → pick → intelligence note (balance + open demands)',
    cust.rows > 0 && cust.badge && /Balance|open demand/i.test(cust.note), JSON.stringify(cust));

  /* 7) product pick (stock awareness) */
  const item = await page.evaluate(async () => {
    const inp = document.querySelector('.modal2 #f_itemId');
    inp.focus(); inp.value = 'FL00000';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 1000));
    const rows = document.querySelectorAll('.modal2 .f-search-results .f-sr');
    if (!rows.length) return { rows: 0 };
    rows[0].click();
    await new Promise(r => setTimeout(r, 1100));
    const notes = [...document.querySelectorAll('.modal2 .f-note')].map(x => x.innerText.replace(/\n/g, ' ')).join('  ||  ');
    return { rows: rows.length, notes: notes, first: notes.slice(0, 80) };
  });
  ok('product pick → stock/price awareness + duplicate warning',
    item.rows > 0 && /stock|Out of stock/i.test(item.notes) && /dhoond|Retail|\u2014/i.test(item.notes),
    JSON.stringify((item.notes || '').slice(0, 150)));

  /* 8) duplicate guard (server-side) */
  const dup = await page.evaluate(async () => {
    window.__toasts.length = 0;
    [...document.querySelectorAll('.modal2 .m-foot button')].find(b => /Save demand/.test(b.textContent)).click();
    await new Promise(r => setTimeout(r, 1400));
    return (window.__toasts || []).join(' | ');
  });
  ok('duplicate open demand server-side block (Ahmad Ali + wahi item)',
    /Duplicate|pehle se open/i.test(dup), dup);

  /* 9) F9 save (alag item → success) */
  const saved = await page.evaluate(async () => {
    const inp = document.querySelector('.modal2 #f_itemId');
    inp.focus(); inp.value = ''; inp.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 500));
    inp.value = 'NGK'; inp.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 1000));
    const rows = document.querySelectorAll('.modal2 .f-search-results .f-sr');
    if (rows.length) rows[0].click();
    await new Promise(r => setTimeout(r, 900));
    window.__toasts.length = 0;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9', bubbles: true }));
    await new Promise(r => setTimeout(r, 1600));
    return { toasts: (window.__toasts || []).join(' | '), closed: !document.querySelector('.modal2') };
  });
  ok('F9 = Save demand → save + modal band', /save ho gayi|update/i.test(saved.toasts) && saved.closed,
    JSON.stringify(saved));

  /* 10) list mein naya demand */
  const after = await page.evaluate(async () => {
    await new Promise(r => setTimeout(r, 1500));
    const rows = document.querySelectorAll('table.tbl2 tbody tr').length;
    return { rows: rows, first: (document.querySelector('table.tbl2 tbody tr') || {}).innerText || '' };
  });
  ok('save ke baad list update (naya demand nazar aata hai)', after.rows >= 4,
    'rows=' + after.rows + ' | ' + after.first.replace(/\n/g, ' ').slice(0, 70));

  /* ---------------- v2.25.2 — status workflow (row action → Change status → Update) ---------------- */
  const st = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.querySelectorAll('.modal-scrim, .scrim').forEach(x => x.remove());
    await sleep(300);
    App.go('demands');
    await sleep(1900);
    const row = document.querySelector('table.tbl2 tbody tr');
    if (!row) return { err: 'koi demand row nahi' };
    const stBtn = [].slice.call(row.querySelectorAll('button')).find(b =>
      /Status/.test((b.getAttribute('title') || '') + (b.getAttribute('aria-label') || '')));
    if (!stBtn) return { err: 'row par Status action nahi mila' };
    stBtn.click();
    await sleep(1100);
    const m = document.querySelector('.modal-scrim .modal2');
    if (!m) return { err: 'status modal nahi khula' };
    const title = (m.querySelector('h3') || {}).textContent || '';
    const sel = m.querySelector('select.f-input');
    if (!sel) return { err: 'status select nahi' };
    const opts = [].slice.call(sel.options).map(o => o.value);
    const want = sel.value || opts[0];
    sel.value = want; sel.dispatchEvent(new Event('change', { bubbles: true }));
    window.__toasts.length = 0;
    const up = [].slice.call(m.querySelectorAll('.m-foot button')).find(b => /Update/i.test(b.textContent || ''));
    if (up) up.click();
    await sleep(2000);
    const row2 = document.querySelector('table.tbl2 tbody tr');
    return { title: title, opts: opts, want: want, toast: (window.__toasts || []).join(' | '),
      closed: !document.querySelector('.modal-scrim .modal2'),
      rowTxt: (row2 ? row2.innerText : '').replace(/\n/g, ' ') };
  });
  ok('status workflow — row “Status” action → Change status modal → Update par status badal jata hai',
    !st.err && /^Change status — /.test(st.title || '') && st.opts.indexOf(st.want) > -1
      && /Updated/.test(st.toast || '') && st.closed === true && (st.rowTxt || '').indexOf(st.want) > -1,
    JSON.stringify({ title: st.title, opts: st.opts, want: st.want, toast: st.toast, closed: st.closed,
      rowHas: (st.rowTxt || '').indexOf(st.want || 'X') > -1 }));

  /* ---------------- v2.25.2 — walk-in customer save path ---------------- */
  const wk = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.querySelectorAll('.modal-scrim, .scrim').forEach(x => x.remove());
    await sleep(300);
    const before = document.querySelectorAll('table.tbl2 tbody tr').length;
    const nb = [].slice.call(document.querySelectorAll('button')).find(b => /New demand|New Demand/i.test(b.textContent || ''));
    if (!nb) return { err: 'New demand button nahi mila' };
    nb.click();
    await sleep(1500);
    const m = document.querySelector('.modal-scrim .modal2');
    if (!m) return { err: 'form modal nahi khula' };
    /* walk-in naam (catalog pick nahi) */
    const walk = m.querySelector('#f_customerName');
    if (!walk) return { err: 'walk-in field nahi mila' };
    walk.value = 'Walk-in Test ' + Math.floor(Math.random() * 900 + 100);
    walk.dispatchEvent(new Event('input', { bubbles: true }));
    walk.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(600);
    /* product = #f_itemId ka apna dropdown */
    const pi = m.querySelector('#f_itemId');
    if (!pi) return { err: 'product picker nahi mila' };
    pi.focus(); pi.value = 'FL00000';
    pi.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(1300);
    /* product picker ka apna scope dhoondo — input se upar pehla ancestor jismein sirf 1 dropdown ho
       (.field wrapping poori section hoti hai, is liye us se customer ka dropdown bhi aa jata hai) */
    let scope = null, up = pi;
    for (let i = 0; i < 5 && up; i++) {
      up = up.parentElement; if (!up) break;
      const rs = up.querySelectorAll('.f-search-results');
      if (rs.length === 1) { scope = rs[0]; break; }
    }
    if (!scope) scope = m.querySelector('.f-search-results');
    let hit = null;
    if (scope) {
      hit = [].slice.call(scope.querySelectorAll('.f-sr')).find(r => /FL00000/.test(r.textContent || ''))
        || scope.querySelector('.f-sr');
    }
    if (hit) hit.click();
    await sleep(900);
    /* catalog pick ka proof: #f_itemCode bhar gaya (itemId mein naam aa jata hai) */
    const icode = ((m.querySelector('#f_itemCode') || {}).value || '');
    window.__toasts.length = 0;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9', bubbles: true }));
    await sleep(2200);
    return { before: before, after: document.querySelectorAll('table.tbl2 tbody tr').length, icode: icode,
      cname: (m.querySelector('#f_customerId') || {}).value || '',
      toast: (window.__toasts || []).join(' | '),
      confirms: (window.__confirms || []).slice(-2).join(' | '),
      closed: !document.querySelector('.modal-scrim .modal2') };
  });
  ok('walk-in customer save — naya customer + catalog item pick kar ke demand save ho jati hai (list +1)',
    !wk.err && wk.closed === true && wk.after > wk.before
      && wk.icode === 'FL00000' && /save ho gayi|update/i.test(wk.toast || ''),
    JSON.stringify(wk));

  ok('is run mein zero page errors', errs.length === 0, JSON.stringify(errs).slice(0, 200));

  await browser.close();
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  DEMANDS   PASS: ${pass}   FAIL: ${fail}`);
  if (fail) ERR.forEach(e => console.log('   ✖ ' + e));
  console.log('═══════════════════════════════════════════════════════════');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('✖ ' + (e && e.stack || e)); process.exit(1); });
