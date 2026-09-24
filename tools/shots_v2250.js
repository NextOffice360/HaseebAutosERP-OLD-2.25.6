/**
 * tools/shots_v2250.js — v2.25.0 requirement work ka RENDERED evidence.
 *   node tools/shots_v2250.js            → release/shots-v2.26.0/*.png
 * Har shot asli Chromium (1440×900) mein, asli data ke sath.
 */
'use strict';
const puppeteer = require('puppeteer');
const { login } = require('./_harness');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'release', 'shots-v2.26.0');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TARGET = 'file://' + path.join(ROOT, 'demo', 'index.html');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errs = []; page.on('pageerror', e => errs.push(String(e.message)));
  await page.goto(TARGET, { waitUntil: 'load', timeout: 40000 });
  await sleep(900);

  const shoot = async (name) => { await page.screenshot({ path: path.join(OUT, name + '.png') }); console.log('  📸 ' + name); };
  const reset = async () => {
    await page.evaluate(() => {
      document.querySelectorAll('.modal-scrim,.scrim,.drawer,.oc-scrim').forEach(x => x.remove());
      document.querySelectorAll('.modal2,.modal,.drawer').forEach(x => x.remove());
      document.querySelectorAll('input.f-input').forEach(i => { if (i.value) i.value = ''; });
    });
    await sleep(500);
  };

  await login(page);            /* poll + login (shared harness) */
  await page.waitForFunction(() => window.App && App.state && App.state.session, { timeout: 15000 });
  await sleep(1400);

  /* 1) GRN drawer — PO mode (req 2) */
  await page.evaluate(() => App.go('purchase'));
  await sleep(1500);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /\bGRN\b/.test(x.textContent || '') && !x.closest('.seg'));
    if (b) b.click();
  });
  await sleep(1400);
  await page.evaluate(async () => {
    const sel = document.querySelector('.drawer .grn-po-pick select');
    const o = sel && [...sel.options].find(x => x.value);
    if (o) { sel.value = o.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    await new Promise(r => setTimeout(r, 1600));
  });
  await sleep(1200);
  await shoot('01-grn-drawer-top-sections');
  /* drawer body ko items section tak scroll karein (lines bhi evidence mein aayein) */
  await page.evaluate(() => {
    const d = document.querySelector('.drawer');
    /* drawer ka asli scroller `.modal-body` hai (UI.drawer) */
    const sc = d && d.querySelector('.modal-body');
    const ipk = d && d.querySelector('.ipk');
    if (ipk && sc) sc.scrollTop = Math.max(0, ipk.offsetTop - 90);
  });
  await sleep(700);
  await shoot('01b-grn-drawer-items-lines');

  /* 2) GRN drawer — Bulk Add modal (req 1: POS wala hi system) */
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.drawer .sec-actions button')].find(x => /Bulk add/.test(x.textContent || ''));
    if (b) b.click();
  });
  await sleep(1600);
  await shoot('02-grn-bulk-add-pos-system');
  await page.evaluate(() => { const m = document.querySelector('.modal-scrim .modal2'); const x = m && m.querySelector('.oc-x'); if (x) x.click(); });
  await sleep(600);

  /* 3) Salesman Stock tab — health KPIs (req 4) */
  await reset();
  await page.evaluate(() => App.go('salesman'));
  await sleep(1500);
  await page.evaluate(async () => {
    const s = document.querySelector('select.f-input, select.st2-f');
    if (s) { const o = [...s.options].find(x => x.value); if (o) { s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); } }
    await new Promise(r => setTimeout(r, 1500));
  });
  await sleep(1500);
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('button')].find(b => /Stock/i.test(b.textContent || '') && !/Issued/.test(b.textContent || ''));
    if (t) t.click();
  });
  await sleep(1600);
  await shoot('03-salesman-stock-kpis');

  /* 4) Salesman Stock Issue modal (req 4) */
  await page.evaluate(async () => {
    const t = [...document.querySelectorAll('button')].find(b => /Issued/i.test(b.textContent || ''));
    if (t) t.click();
    await new Promise(r => setTimeout(r, 1300));
    const n = [...document.querySelectorAll('button')].find(b => /New issue|Create Issue/i.test(b.textContent || ''));
    if (n) n.click();
  });
  await sleep(1500);
  await shoot('04-salesman-stock-issue-modal');
  await reset();

  /* 5) Customer Demands list + KPI (req 3) */
  await page.evaluate(() => App.go('demands'));
  await sleep(1800);
  await shoot('05-demands-list');

  /* 6) Demand form — customer intelligence (req 3) */
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /New demand|➕/i.test(x.textContent || ''));
    if (b) b.click();
  });
  await sleep(1400);
  await page.evaluate(async () => {
    const inp = document.querySelector('.modal2 .f-search');
    if (inp) { inp.focus(); inp.value = 'Ahmad'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
    await new Promise(r => setTimeout(r, 1200));
    const r = document.querySelector('.modal2 .f-search-results .f-sr');
    if (r) r.click();
    await new Promise(r => setTimeout(r, 900));
  });
  await sleep(1200);
  await shoot('06-demand-form-intelligence');
  await reset();

  /* 7) Label designer — live preview (req 5) */
  await page.evaluate(() => {
    if (window.Print2 && Print2.designer) Print2.designer('LABEL', { json: JSON.stringify({ paper: '50x30', title: 'MY SHOP', footer: 'THANK YOU', fontSize: 12 }) }, () => { });
  });
  await sleep(2000);
  await shoot('07-label-designer-live-preview');

  /* 8) shared askCode dialog (req 6: native prompt ka replacement) */
  await reset();
  await page.evaluate(() => { if (UI2.askCode) UI2.askCode({ title: '📷 Barcode / QR code' }); });
  await sleep(900);
  await shoot('08-shared-scan-code-dialog');

  console.log('\n  page errors: ' + JSON.stringify(errs.slice(0, 3)));
  console.log('  → ' + OUT);
  await browser.close();
})().catch(e => { console.error('✖ ' + (e && e.stack || e)); process.exit(1); });
