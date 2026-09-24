/**
 * tools/test_sidebar_states.js — v2.25.8 — W6 gate (req 12–15).
 *
 * User ki repeat-shikayat: "partial collapse par icon+text dikh raha hai".
 * Ye gate RENDERED DOM + computed style par assert karta hai (class match nahi):
 *
 *  DESKTOP (1440 / 1280)
 *   1. expanded  → icon + text (label rects ≥ 1, width > 20, sbW 240–280)
 *   2. rail      → SIRF icons: label display:none, rects = 0, sbW ≤ 72
 *   3. rail + MOUSE HOVER → ab bhi icons only (pehle hover 256px kar deta tha — asli bug)
 *   4. rail mein nav-item ka tooltip data mojood (data-tip + title) — a11y
 *   5. reload ke baad rail hi rahega (persistence)
 *   6. wapas expand → labels lauta aata hai; reload par expand bhi persist
 *   7. Ctrl+B bhi persist karta hai (pehle sirf class toggle thi, save nahi hoti thi)
 *   8. route badalne par state reset NAHI hoti
 *  MOBILE (390 / 768)
 *   9. off-canvas default mein band (translateX) + scrim hidden
 *  10. hamburger → open (left ≈ 0, scrim visible)
 *  11. desktop ka rail preference mobile drawer ko SHRINK nahi karta — labels poore
 *      (req 14: off-canvas aur desktop state aapas mein conflict na karein)
 *  12. scrim click → band · 13. Esc → band
 *  14. mobile se wapas desktop par pref barqarar
 *  15. zero page errors
 *
 *   node tools/test_sidebar_states.js [file|http]      (~50s)
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

const PROBE = () => {
  const sb = document.getElementById('sidebar');
  const shell = document.getElementById('shell');
  const item = sb && sb.querySelector('.nav-item');
  const label = item ? (item.querySelector('.sb-txt') || item.querySelector('span:not(.ni):not(.nk)')) : null;
  const r = sb ? sb.getBoundingClientRect() : { width: 0, left: 0 };
  const lr = label ? label.getBoundingClientRect() : null;
  const lcs = label ? getComputedStyle(label) : null;
  const scrim = document.getElementById('scrim');
  return {
    sbW: Math.round(r.width), sbLeft: Math.round(r.left),
    sbClass: sb ? sb.className : '', mode: shell ? (shell.dataset.sbMode || '') : '',
    shellClass: shell ? shell.className : '',
    label: label ? { display: lcs.display, rects: label.getClientRects().length, w: Math.round(lr.width) } : null,
    tip: item ? (item.getAttribute('data-tip') || item.getAttribute('title') || '') : '',
    scrimHidden: scrim ? scrim.hidden : null,
    ls: (() => { try { return localStorage.getItem('ha.sbCollapsed'); } catch (e) { return 'ERR'; } })(),
    vw: document.documentElement.clientWidth
  };
};
const hoverRail = async (page, p) => {
  await page.mouse.move(p.sbLeft + Math.max(10, Math.round(p.sbW / 2)), 320);
  await sleep(450);
  return page.evaluate(PROBE);
};

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e.message).slice(0, 100)));
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(TARGET, { waitUntil: 'networkidle2', timeout: 45000 });
  await page.evaluate(() => { try { localStorage.removeItem('ha.sbCollapsed'); } catch (e) { } });
  if (await page.$('#lgUser')) {
    await page.click('#lgUser'); await page.type('#lgUser', 'owner');
    await page.click('#lgPass'); await page.type('#lgPass', 'admin123');
    await page.keyboard.press('Enter');
  }
  await page.waitForFunction(() => window.App && App.state && App.state.session, { timeout: 20000 });
  await sleep(900);

  /* ---------- DESKTOP 1440 ---------- */
  let p = await page.evaluate(PROBE);
  ok(p.sbW >= 240 && p.sbW <= 280 && p.label && p.label.rects >= 1 && p.label.w > 20 && p.label.display !== 'none',
    'expanded: icon + TEXT (label render ho raha hai)', JSON.stringify({ sbW: p.sbW, label: p.label }));
  ok(p.mode === 'expanded', 'state model: dataset.sbMode = expanded', p.mode);

  await page.click('#sbCollapse'); await sleep(500);
  p = await page.evaluate(PROBE);
  ok(p.sbW <= 72 && p.label && p.label.display === 'none' && p.label.rects === 0,
    'rail: SIRF icons — label display:none, rects 0, width ≤ 72 (asli bug fix)',
    JSON.stringify({ sbW: p.sbW, label: p.label, cls: p.shellClass }));
  ok(/collapsed/.test(p.shellClass) && p.mode === 'rail', 'rail: shell.collapsed + dataset.sbMode = rail', JSON.stringify({ cls: p.shellClass, mode: p.mode }));
  ok(!!p.tip, 'rail: nav-item ka tooltip data (data-tip/title) mojood — a11y', p.tip);

  const hv = await hoverRail(page, p);
  ok(hv.sbW <= 72 && hv.label && hv.label.rects === 0,
    'rail + HOVER: ab bhi icons only — sidebar 256px nahi khulta, text nahi aata (purana bug)',
    JSON.stringify({ sbW: hv.sbW, label: hv.label }));

  await page.reload({ waitUntil: 'networkidle2' }); await sleep(1400);
  p = await page.evaluate(PROBE);
  ok(p.sbW <= 72 && p.label && p.label.rects === 0 && /collapsed/.test(p.shellClass),
    'reload: rail state persist (icon-only hi rehta hai)', JSON.stringify({ sbW: p.sbW, ls: p.ls }));

  await page.click('#sbCollapse'); await sleep(500);
  p = await page.evaluate(PROBE);
  ok(p.sbW >= 240 && p.label && p.label.rects >= 1, 'expand wapas: labels lauta aaye', JSON.stringify({ sbW: p.sbW, label: p.label }));
  await page.reload({ waitUntil: 'networkidle2' }); await sleep(1400);
  p = await page.evaluate(PROBE);
  ok(p.sbW >= 240 && p.label && p.label.rects >= 1, 'reload: expanded state bhi persist', JSON.stringify({ sbW: p.sbW, ls: p.ls }));

  /* Ctrl+B — persist + sync */
  await page.keyboard.down('Control'); await page.keyboard.press('b'); await page.keyboard.up('Control');
  await sleep(500);
  p = await page.evaluate(PROBE);
  ok(p.sbW <= 72 && p.ls === '1', 'Ctrl+B se rail + preference SAVE (pehle save nahi hoti thi)', JSON.stringify({ sbW: p.sbW, ls: p.ls }));

  /* route change par reset nahi */
  await page.evaluate(() => App.go('items')); await sleep(900);
  p = await page.evaluate(PROBE);
  ok(p.sbW <= 72 && /collapsed/.test(p.shellClass),
    'route badalne par (App.go) sidebar state reset NAHI hoti', JSON.stringify({ sbW: p.sbW, route: await page.evaluate(() => App.current) }));

  /* ---------- MOBILE 390 (desktop pref = rail hi rakhein) ---------- */
  await page.setViewport({ width: 390, height: 844 }); await sleep(700);
  p = await page.evaluate(PROBE);
  ok(p.sbLeft < -100 && p.scrimHidden === true, 'mobile: off-canvas default band (left negative) + scrim hidden', JSON.stringify({ left: p.sbLeft, scrim: p.scrimHidden }));

  await page.click('#sbToggle'); await sleep(600);
  p = await page.evaluate(PROBE);
  const openOk = /open/.test(p.sbClass) && Math.abs(p.sbLeft) <= 2 && p.scrimHidden === false;
  ok(openOk, 'mobile: hamburger se open (left ≈ 0, scrim visible)', JSON.stringify({ cls: p.sbClass, left: p.sbLeft, scrim: p.scrimHidden }));
  ok(p.sbW >= 240 && p.label && p.label.rects >= 1 && p.label.display !== 'none',
    'mobile drawer: desktop ka rail pref asar nahi karta — labels POORE (req 14)',
    JSON.stringify({ sbW: p.sbW, label: p.label, pref: p.ls }));

  await page.click('#scrim'); await sleep(600);
  p = await page.evaluate(PROBE);
  ok(!/open/.test(p.sbClass) && p.scrimHidden === true, 'mobile: scrim click se band', JSON.stringify({ cls: p.sbClass, scrim: p.scrimHidden }));

  await page.click('#sbToggle'); await sleep(500);
  await page.keyboard.press('Escape'); await sleep(600);
  p = await page.evaluate(PROBE);
  ok(!/open/.test(p.sbClass) && p.scrimHidden === true, 'mobile: Esc se band', JSON.stringify({ cls: p.sbClass, scrim: p.scrimHidden }));

  /* ---------- wapas desktop: pref barqarar ---------- */
  await page.setViewport({ width: 1280, height: 800 }); await sleep(700);
  p = await page.evaluate(PROBE);
  ok(p.sbW <= 72 && /collapsed/.test(p.shellClass) && p.label && p.label.rects === 0,
    'mobile se wapas desktop par: rail preference barqarar', JSON.stringify({ sbW: p.sbW, ls: p.ls }));

  /* expanded par bhi resize cycle theek */
  await page.click('#sbCollapse'); await sleep(500);
  await page.setViewport({ width: 768, height: 900 }); await sleep(600);
  await page.setViewport({ width: 1440, height: 900 }); await sleep(600);
  p = await page.evaluate(PROBE);
  ok(p.sbW >= 240 && p.label && p.label.rects >= 1 && p.scrimHidden === true,
    'resize cycle (desktop→tablet→desktop): expanded wapas sahih, scrim hidden', JSON.stringify({ sbW: p.sbW, scrim: p.scrimHidden }));

  /* ======================================================================
     W6.T3 — RESPONSIVE MATRIX (1440 / 1280 / 1024 / 768 / 390 × light+dark)
     Har combo par: sahi mode · 0 horizontal overflow · tap targets ≥48px ·
     sidebar text ≥10.8px · ☰/⇤ control sirf apne range mein + 48px.
     ====================================================================== */
  const MATRIX_W = [1440, 1280, 1024, 768, 390];
  const MATRIX_T = ['light', 'dark'];
  const MX = () => {
    const de = document.documentElement, shell = document.getElementById('shell');
    const sb = document.getElementById('sidebar');
    const vis = el => !!(el && el.getClientRects && el.getClientRects().length);
    const box = sel => { const e = document.querySelector(sel); if (!vis(e)) return null;
      const q = e.getBoundingClientRect(); return { h: Math.round(q.height), w: Math.round(q.width) }; };
    const vw = de.clientWidth;
    const over = Math.max(0, de.scrollWidth - vw);
    let minFont = 999;
    sb.querySelectorAll('*').forEach(el => {
      if (!el.getClientRects || !el.getClientRects().length) return;
      if (!el.textContent || !el.textContent.trim()) return;
      if (el.children.length && el.children.length > 2) return;
      const fs = parseFloat(getComputedStyle(el).fontSize || '0');
      if (fs > 0 && fs < minFont) minFont = fs;
    });
    const after = (() => { const t = document.querySelector('.top-actions .icon-btn');
      if (!vis(t)) return 0; const a = getComputedStyle(t, '::after');
      return Math.round(parseFloat(a.width || '0')); })();
    return { mode: shell ? shell.dataset.sbMode : '', over, vw, minFont: Math.round(minFont * 10) / 10,
      navItem: box('.nav-item'), user: box('.sb-user'),
      toggle: box('#sbToggle'), rail: box('#sbRail'), after48: after };
  };
  const mpage = async (w, theme) => {
    const pg = await browser.newPage();
    pg.on('pageerror', e => errs.push(`[${w}/${theme}] ${String(e.message).slice(0, 90)}`));
    await pg.setViewport({ width: w, height: 900 });
    await pg.goto(TARGET, { waitUntil: 'networkidle2', timeout: 45000 });
    if (await pg.$('#lgUser')) {
      await pg.click('#lgUser'); await pg.type('#lgUser', 'owner');
      await pg.click('#lgPass'); await pg.type('#lgPass', 'admin123');
      await pg.keyboard.press('Enter');
    }
    await pg.waitForFunction(() => window.App && App.state && App.state.session, { timeout: 20000 });
    await pg.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
    await sleep(700);
    const m = await pg.evaluate(MX);
    await pg.close();
    return m;
  };

  for (const w of MATRIX_W) {
    for (const th of MATRIX_T) {
      const m = await mpage(w, th);
      const want = w >= 901 ? 'expanded' : 'offcanvas';
      ok(m.mode === want && m.over === 0,
        `T6.3 ${w}/${th}: mode=${want} + 0 horizontal overflow`,
        JSON.stringify({ mode: m.mode, want, over: m.over }));
      const tapOk = m.navItem && m.navItem.h >= 48 && m.user && m.user.h >= 48;
      const ctrl = w >= 901
        ? (m.rail && m.rail.h >= 48 && m.rail.w >= 48 && !m.toggle)
        : (!m.rail && m.toggle && m.toggle.h >= 48 && m.toggle.w >= 48);
      ok(tapOk && ctrl,
        `T6.3 ${w}/${th}: taps ≥48 (nav+user) + ${w >= 901 ? '⇤ rail visible 48px' : '☰ toggle visible 48px'}`,
        JSON.stringify({ nav: m.navItem, user: m.user, rail: m.rail, toggle: m.toggle }));
      ok(m.minFont >= 10.8,
        `T6.3 ${w}/${th}: sidebar text ≥10.8px (min ${m.minFont})`, String(m.minFont));
    }
  }

  /* 1024 par bhi collapse mumkin (pehle ⇤ 1024 par ghayab tha — asli gap) */
  const m1024 = await mpage(1024, 'light');
  ok(m1024.rail && m1024.rail.h >= 48, 'T6.3 1024: laptop width par bhi ⇤ collapse available', JSON.stringify(m1024.rail));

  /* rail state har desktop width par icons-only + 0 overflow */
  for (const w of [1280, 1024]) {
    const pg = await browser.newPage();
    await pg.setViewport({ width: w, height: 900 });
    await pg.goto(TARGET, { waitUntil: 'networkidle2', timeout: 45000 });
    if (await pg.$('#lgUser')) {
      await pg.click('#lgUser'); await pg.type('#lgUser', 'owner');
      await pg.click('#lgPass'); await pg.type('#lgPass', 'admin123');
      await pg.keyboard.press('Enter');
    }
    await pg.waitForFunction(() => window.App && App.state && App.state.session, { timeout: 20000 });
    await pg.evaluate(() => { try { localStorage.setItem('ha.sbCollapsed', '1'); } catch (e) { } });
    await pg.reload({ waitUntil: 'networkidle2' }); await sleep(1300);
    const m = await pg.evaluate(MX);
    ok(m.mode === 'rail' && m.over === 0 && m.navItem && m.navItem.h >= 48,
      `T6.3 rail@${w}: icons-only + 0 overflow + tap ≥48`,
      JSON.stringify({ mode: m.mode, over: m.over, nav: m.navItem }));
    await pg.close();
  }

  ok(errs.length === 0, 'zero page errors', JSON.stringify(errs).slice(0, 200));

  await browser.close();
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  SIDEBAR STATES   PASS: ${pass}   FAIL: ${fail}`);
  if (fail) ERR.forEach(e => console.log('   ✖ ' + e));
  console.log('═══════════════════════════════════════════════════════════');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('✖ ' + (e && e.stack || e)); process.exit(1); });
