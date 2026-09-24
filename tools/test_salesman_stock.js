/**
 * tools/test_salesman_stock.js — v2.25.0 (requirement 4) — Salesman Stock gate.
 *
 * User ka audit finding: "Salesman Stock ka poora audit karein (UI/UX, workflow,
 * layout, usability, features) aur usi design system / interaction patterns par
 * polish karein."
 *
 * Asli Chromium mein naapa jata hai:
 *   · salesman select → Stock tab: rows + health KPIs (Items/Qty/Value/Out/Low)
 *   · search filter + "Out of stock / Low" KPI se filter (aur filter-miss par sahi message)
 *   · POS jaisa scan filter (barcode → item par filter + toast)
 *   · Stock Issued ▸ New issue: sections + shared scan picker + validation
 *     (0 items / qty 0) + F9 se save + stock refresh
 *
 *   node tools/test_salesman_stock.js            (default demo/index.html)
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
  console.log('\n\x1b[1mSALESMAN STOCK — audit + polish (req 4)\x1b[0m\n');
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

  await page.evaluate(() => App.go('salesman'));
  await sleep(1500);
  const picked = await page.evaluate(async () => {
    const sel = document.querySelector('select.f-input, select.st2-f');
    if (!sel) return { err: 'salesman select nahi mila' };
    const opt = [...sel.options].find(o => o.value);
    sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 1500));
    return { id: opt.value, label: opt.textContent };
  });
  ok('salesman select (list mock se aati hai)', !!picked.id, JSON.stringify(picked));

  /* Stock tab */
  const stock = await page.evaluate(async () => {
    const tabBtn = [...document.querySelectorAll('button')].find(b => /Stock/i.test(b.textContent || '') && !/Issued/.test(b.textContent || ''));
    if (tabBtn) tabBtn.click();
    await new Promise(r => setTimeout(r, 1600));
    const kpis = [...document.querySelectorAll('.kpi .k-label')].map(x => x.textContent.trim());
    return { kpis: kpis, rows: document.querySelectorAll('table.tbl2 tbody tr').length };
  });
  ok('Stock tab — rows + health KPIs (Items/Qty/Value/Out/Low)',
    stock.rows >= 1 && stock.kpis.some(k => /Out of stock/i.test(k)) && stock.kpis.some(k => /Low/i.test(k)),
    'rows=' + stock.rows + ' | ' + stock.kpis.join(', '));

  /* search filter */
  const srch = await page.evaluate(async () => {
    const inp = [...document.querySelectorAll('input.f-input')].find(i => /Search code/i.test(i.placeholder || ''));
    if (!inp) return { err: 'search nahi mila' };
    inp.value = 'Brake'; inp.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 700));
    const one = document.querySelectorAll('table.tbl2 tbody tr').length;
    inp.value = ''; inp.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 600));
    return { one: one, all: document.querySelectorAll('table.tbl2 tbody tr').length };
  });
  ok('search filter kaam karta hai', srch.one === 1 && srch.all > 1, JSON.stringify(srch));

  /* Out/Low KPI filter + filter-miss message */
  const health = await page.evaluate(async () => {
    const outK = [...document.querySelectorAll('.kpi')].find(k => /Out of stock/i.test(k.textContent || ''));
    outK.click();
    await new Promise(r => setTimeout(r, 700));
    const msg = (document.querySelector('.st2-body') || {}).innerText || '';
    const hit = /filter par kuch nahi mila/i.test(msg);
    outK.click();
    await new Promise(r => setTimeout(r, 500));
    return { msg: msg.replace(/\n/g, ' ').slice(0, 80), hit: hit };
  });
  ok('Out-of-stock KPI filter + khaali filter par sahi message (purana confusing message nahi)',
    health.hit, JSON.stringify(health));

  /* scan filter (POS jaisa) */
  const scan = await page.evaluate(async () => {
    const inp = [...document.querySelectorAll('input.f-input')].find(i => /Search code/i.test(i.placeholder || ''));
    window.__toasts.length = 0;
    inp.focus();
    inp.value = 'BRK-001';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise(r => setTimeout(r, 900));
    return { rows: document.querySelectorAll('table.tbl2 tbody tr').length,
      toasts: (window.__toasts || []).join(' | ') };
  });
  ok('scan/search se item filter (POS jaisa scan-aware box)',
    scan.rows === 1, JSON.stringify(scan));

  /* Stock Issued ▸ New issue */
  const issue = await page.evaluate(async () => {
    const tabBtn = [...document.querySelectorAll('button')].find(b => /Issued/i.test(b.textContent || ''));
    if (tabBtn) tabBtn.click();
    await new Promise(r => setTimeout(r, 1500));
    const newBtn = [...document.querySelectorAll('button')].find(b => /New issue|Create Issue|New Issue/i.test(b.textContent || ''));
    if (!newBtn) return { err: 'New issue button nahi mila' };
    newBtn.click();
    await new Promise(r => setTimeout(r, 1400));
    const m = document.querySelector('.modal2');
    const secs = m ? [...m.querySelectorAll('.sec-head h4')].map(x => x.textContent.trim()) : [];
    const scanAware = !!(m && m.querySelector('.ipk-q[data-scan-aware="1"]'));
    /* validation: 0 items */
    window.__toasts.length = 0;
    const issueBtn = [...m.querySelectorAll('.m-foot button')].find(b => /Issue Stock/.test(b.textContent || ''));
    issueBtn.click();
    await new Promise(r => setTimeout(r, 600));
    const v0 = (window.__toasts || []).join(' | ');
    /* scan se ek line add karein */
    const q = m.querySelector('.ipk-q');
    q.focus(); q.value = 'FL00000';
    q.dispatchEvent(new Event('input', { bubbles: true }));
    q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise(r => setTimeout(r, 1300));
    const lines = m.querySelectorAll('.po-line, .grn-line, .sm-line').length;
    /* qty 0 validation */
    window.__toasts.length = 0;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9', bubbles: true }));
    await new Promise(r => setTimeout(r, 1400));
    return { secs: secs, scanAware: scanAware, v0: v0, lines: lines,
      save: (window.__toasts || []).join(' | '), closed: !document.querySelector('.modal2') };
  });
  ok('Stock Issue modal — sections + shared scan picker (POS jaisa)',
    issue.secs && issue.secs.length >= 2 && issue.scanAware === true, JSON.stringify(issue.secs));
  ok('validation — 0 items par Issue block', /items add karein/i.test(issue.v0 || ''), issue.v0);
  ok('scan → line add → F9 = Issue Stock → save + modal band',
    issue.lines >= 1 && /Issue ho gaya/i.test(issue.save || '') && issue.closed === true,
    'lines=' + issue.lines + ' | ' + issue.save);

  /* ---- v2.25.2 (req 4) — poore feature ka sweep: har tab render ho, error na ho ---- */
  const tabs = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.querySelectorAll('.modal-scrim,.scrim,.drawer,.modal2').forEach(x => x.remove());
    await sleep(300);
    /* tabs `<button role="tab" aria-label="...">ICON Label</button>` hote hain —
       icon text ke shuru mein hota hai, is liye aria-label/title se match karein. */
    const labels = ['Stock Issued', 'Current Stock', 'Tours / Routes', 'Cust / Area Alloc',
      'Sales / Delivery', 'Returns', 'Ledger', 'Performance'];
    const out = [];
    for (const want of labels) {
      const btn = [...document.querySelectorAll('[role=tab], button')].find(b =>
        ((b.getAttribute('aria-label') || b.getAttribute('title') || b.textContent || '').trim()).startsWith(want));
      if (!btn) { out.push({ tab: want, found: false }); continue; }
      btn.click();
      await sleep(1500);
      const host = document.querySelector('#view') || document.body;
      const rows = host.querySelectorAll('table.tbl2 tbody tr').length;
      /* demo mein tour/ledger data nahi hai — lekin har tab ko ya rows dikhani
         chahiye ya saaf empty/notice state (broken/blank tab nahi) */
      const emptyState = !!host.querySelector('.tbl-empty, .sm-empty, .empty, .st2-bar, .sm-hint, .empty-state');
      out.push({ tab: want, found: true, rows: rows, empty: emptyState,
        nodes: host.querySelectorAll('*').length });
    }
    return out;
  });
  const missing = tabs.filter(t => !t.found);
  const broken = tabs.filter(t => t.found && t.nodes < 40);
  const noState = tabs.filter(t => t.found && t.rows === 0 && !t.empty);
  ok('aathon Salesman tabs render hote hain (rows ya saaf empty-state, koi blank/broken tab nahi)',
    missing.length === 0 && broken.length === 0 && noState.length === 0,
    JSON.stringify({ missing: missing.map(t => t.tab), broken: broken.map(t => t.tab),
      noState: noState.map(t => t.tab), perTab: tabs.map(t => t.tab.slice(0, 8) + '=' + (t.rows || (t.empty ? 'empty' : '?'))) }));

  ok('is run mein zero page errors', errs.length === 0, JSON.stringify(errs).slice(0, 200));

  await browser.close();
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  SALESMAN STOCK   PASS: ${pass}   FAIL: ${fail}`);
  if (fail) ERR.forEach(e => console.log('   ✖ ' + e));
  console.log('═══════════════════════════════════════════════════════════');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('✖ ' + (e && e.stack || e)); process.exit(1); });
