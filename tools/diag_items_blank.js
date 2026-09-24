/**
 * tools/diag_items_blank.js — T2 ka REPRODUCE step (read-only diagnosis).
 *
 * Shikayat: "Products/Items/Inventory pages blank dikhte hain, magar product
 * data search/dropdown mein mojood hai — koi error bhi nazar nahi aata."
 *
 * Ye script: Items screen + Inventory screen kholta hai, ASLI console errors,
 * thrown exceptions, phir DOM ki haqeeqat (rows/empty/loader) napa karta hai.
 *
 *   node tools/diag_items_blank.js           (~30s)
 */
'use strict';
const puppeteer = require('puppeteer');
const path = require('path');
const { login } = require('./_harness');
const ROOT = path.join(__dirname, '..');
const TARGET = process.argv[2] || ('file://' + path.join(ROOT, 'demo', 'index.html'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SCREENS = ['items', 'inventory'];

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  const errs = [], logs = [];
  page.on('pageerror', e => errs.push('[pageerror] ' + String(e.message).slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push('[' + m.type() + '] ' + String(m.text()).slice(0, 200)); });
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(TARGET, { waitUntil: 'networkidle2', timeout: 45000 });
  await login(page);
  await sleep(500);

  /* backend counts (source of truth) */
  const api = await page.evaluate(async () => {
    const out = {};
    try { const r = await API.call('items.list', { limit: 5 }); out.items = Array.isArray(r) ? r.length : (r && r.rows ? r.rows.length : JSON.stringify(r).slice(0, 120)); }
    catch (e) { out.items = 'ERR: ' + e.message; }
    try { const r = await API.call('inventory.list', {}); out.inventory = Array.isArray(r) ? r.length : (r && r.rows ? r.rows.length : JSON.stringify(r).slice(0, 120)); }
    catch (e) { out.inventory = 'ERR: ' + e.message; }
    try { const r = await API.call('items.search', { q: '' }); out.search = Array.isArray(r) ? r.length : (r && r.rows ? r.rows.length : JSON.stringify(r).slice(0, 120)); }
    catch (e) { out.search = 'ERR: ' + e.message; }
    return out;
  });
  console.log('backend:', JSON.stringify(api));

  for (const scr of SCREENS) {
    console.log('\n=== screen: ' + scr + ' ===');
    const before = errs.length;
    await page.evaluate(s => { try { App.go(s); } catch (e) { console.log('App.go threw: ' + e.message); } }, scr);
    await sleep(2500);
    const view = await page.evaluate(() => {
      const main = document.querySelector('.main') || document.body;
      const rows = main.querySelectorAll('table.tbl tbody tr, table.tbl2 tbody tr, .row-item, .list-row, tr.item').length;
      const cards = main.querySelectorAll('.card, .panel, .kpi').length;
      const text = (main.innerText || '').replace(/\s+/g, ' ').trim();
      const emptyEl = main.querySelector('.empty, .empty-state, [data-empty]');
      const loader = main.querySelector('.skel, .skeleton, .loading, .ha-spin');
      return {
        rows, cards, len: text.length, snippet: text.slice(0, 220),
        emptyText: emptyEl ? String(emptyEl.textContent || '').trim().slice(0, 120) : null,
        loader: !!loader,
        current: (window.App && App.current) || ''
      };
    });
    console.log('DOM:', JSON.stringify(view, null, 1));
    console.log('errors during render:', errs.length - before);
  }

  console.log('\n=== ALL PAGE ERRORS ===');
  errs.slice(0, 15).forEach(e => console.log(' ', e));
  console.log('\n=== console errors/warnings ===');
  logs.slice(0, 15).forEach(e => console.log(' ', e));
  await browser.close();
})().catch(e => { console.error('✖ ' + (e && e.stack || e)); process.exit(1); });
