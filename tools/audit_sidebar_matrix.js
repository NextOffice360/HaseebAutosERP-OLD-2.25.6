/**
 * tools/audit_sidebar_matrix.js — W6.T3 audit (read-only, no assertions).
 *
 * 1440 / 1280 / 1024 / 768 / 390  ×  light + dark  → raw numbers:
 *   · sbMode (expanded | rail | offcanvas)
 *   · sidebar width / left
 *   · horizontal overflow (px) + top offenders
 *   · tap targets: #sbToggle #sbRail #sbCollapse .nav-item (h, w)
 *   · smallest visible text size in sidebar (≥10.8px chahiye)
 *   · rail mein visible labels ka count (0 hona chahiye)
 *   · page errors
 *
 *   node tools/audit_sidebar_matrix.js            (~45s)
 */
'use strict';
const puppeteer = require('puppeteer');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const TARGET = process.argv[2] || ('file://' + path.join(ROOT, 'demo', 'index.html'));

const WIDTHS = [1440, 1280, 1024, 768, 390];
const THEMES = ['light', 'dark'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MEASURE = () => {
  const de = document.documentElement;
  const shell = document.getElementById('shell');
  const sb = document.getElementById('sidebar');
  const r = sb ? sb.getBoundingClientRect() : { width: 0, left: 0 };
  const vis = el => !!(el && el.getClientRects && el.getClientRects().length);
  const rect = sel => { const e = document.querySelector(sel); if (!vis(e)) return null;
    const q = e.getBoundingClientRect(); return { h: Math.round(q.height), w: Math.round(q.width) }; };

  /* horizontal overflow + offenders */
  const vw = de.clientWidth;
  const over = Math.max(0, de.scrollWidth - vw);
  const bad = [];
  document.querySelectorAll('body *').forEach(el => {
    if (!el.getClientRects || !el.getClientRects().length) return;
    const q = el.getBoundingClientRect();
    if (q.right > vw + 1 && q.width > 4 && q.height > 4) {
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed' && cs.visibility === 'hidden') return;
      bad.push({ el: el.tagName.toLowerCase() + '.' + String(el.className || '').split(' ').slice(0, 2).join('.'),
                 right: Math.round(q.right), w: Math.round(q.width) });
    }
  });
  bad.sort((a, b) => b.right - a.right);

  /* smallest visible text in sidebar (font-size px) */
  let minFont = 999; let minFontEl = '';
  if (sb) {
    sb.querySelectorAll('*').forEach(el => {
      if (!el.getClientRects || !el.getClientRects().length) return;
      if (!el.textContent || !el.textContent.trim()) return;
      if (el.children.length && el.children.length > 2) return;
      const fs = parseFloat(getComputedStyle(el).fontSize || '0');
      if (fs > 0 && fs < minFont) { minFont = fs; minFontEl = el.tagName.toLowerCase() + '.' + String(el.className || '').split(' ')[0]; }
    });
  }

  /* visible labels in sidebar */
  let visLabels = 0, visGroup = 0;
  if (sb) {
    sb.querySelectorAll('.sb-txt, .nav-item .nk, .sb-group, .sb-name').forEach(el => { if (vis(el)) visLabels++; });
    visGroup = visLabels;
  }
  const scrim = document.getElementById('scrim');
  return {
    sbMode: shell ? (shell.dataset.sbMode || '') : '',
    sbW: Math.round(r.width), sbLeft: Math.round(r.left),
    vw, over, offenders: bad.slice(0, 4),
    taps: { toggle: rect('#sbToggle'), rail: rect('#sbRail'), collapse: rect('#sbCollapse'), navItem: rect('.nav-item') },
    minFont: Math.round(minFont * 10) / 10, minFontEl,
    visibleLabels: visGroup,
    scrimHidden: scrim ? scrim.hidden : null,
    railBtnHidden: (() => { const b = document.getElementById('sbRail'); return b ? getComputedStyle(b).display === 'none' : null; })(),
  };
};

async function login(page) {
  if (await page.$('#lgUser')) {
    await page.click('#lgUser'); await page.type('#lgUser', 'owner');
    await page.click('#lgPass'); await page.type('#lgPass', 'admin123');
    await page.keyboard.press('Enter');
  }
  await page.waitForFunction(() => window.App && App.state && App.state.session, { timeout: 20000 });
  await sleep(800);
}

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const rows = [];
  const errors = [];
  for (const w of WIDTHS) {
    for (const theme of THEMES) {
      const page = await browser.newPage();
      page.on('pageerror', e => errors.push(`[${w}/${theme}] ${e.message}`));
      await page.setViewport({ width: w, height: 900 });
      await page.goto(TARGET, { waitUntil: 'networkidle2', timeout: 45000 });
      await login(page);
      await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
      await sleep(400);
      const m = await page.evaluate(MEASURE);
      rows.push({ w, theme, ...m });
      await page.close();
    }
  }
  /* rail pass (desktop prefs) */
  const railRows = [];
  for (const w of [1440, 1280, 1024]) {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: 900 });
    await page.goto(TARGET, { waitUntil: 'networkidle2', timeout: 45000 });
    await login(page);
    await page.evaluate(() => { try { localStorage.setItem('ha.sbCollapsed', '1'); } catch (e) { } });
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(1200);
    const m = await page.evaluate(MEASURE);
    railRows.push({ w, theme: 'light', ...m });
    await page.close();
  }
  await browser.close();

  console.log('=== EXPANDED / DEFAULT MATRIX ===');
  console.log('w     theme  mode        sbW  left  over  navTap  railTap  minFont  labels');
  rows.forEach(r => console.log(
    String(r.w).padEnd(6) + r.theme.padEnd(7) + String(r.sbMode).padEnd(12) +
    String(r.sbW).padEnd(5) + String(r.sbLeft).padEnd(6) + String(r.over).padEnd(6) +
    String(r.taps.navItem ? r.taps.navItem.h + 'x' + r.taps.navItem.w : '-').padEnd(8) +
    String(r.taps.rail ? r.taps.rail.h + 'x' + r.taps.rail.w : (r.railBtnHidden ? 'hidden' : '-')).padEnd(9) +
    String(r.minFont).padEnd(9) + String(r.visibleLabels)));
  console.log('\n=== RAIL PREF (ha.sbCollapsed=1) ===');
  console.log('w     mode        sbW  left  over  labels  minFont  railTip');
  railRows.forEach(r => console.log(
    String(r.w).padEnd(6) + String(r.sbMode).padEnd(12) + String(r.sbW).padEnd(5) +
    String(r.sbLeft).padEnd(6) + String(r.over).padEnd(6) + String(r.visibleLabels).padEnd(8) +
    String(r.minFont).padEnd(9) + String(r.taps.rail ? r.taps.rail.h + 'x' + r.taps.rail.w : '-')));
  const off = rows.filter(r => r.offenders.length);
  if (off.length) {
    console.log('\n=== OVERFLOW OFFENDERS ===');
    off.forEach(r => console.log(`${r.w}/${r.theme}: over=${r.over}px → ` + r.offenders.map(o => `${o.el} right=${o.right} w=${o.w}`).join(' | ')));
  } else console.log('\n=== OVERFLOW: none ===');
  console.log('\n=== SURFACE TABLE ===');
  console.log('navItem heights :', [...new Set(rows.map(r => r.taps.navItem ? r.taps.navItem.h : 0))].join(','));
  console.log('rail btn        :', rows.map(r => `${r.w}:${r.railBtnHidden ? 'hidden' : (r.taps.rail ? r.taps.rail.h + 'x' + r.taps.rail.w : 'none')}`).join('  '));
  console.log('toggle btn      :', rows.map(r => `${r.w}:${r.taps.toggle ? r.taps.toggle.h + 'x' + r.taps.toggle.w : 'hidden'}`).join('  '));
  console.log('page errors     :', errors.length ? errors.slice(0, 5) : 0);
})();
