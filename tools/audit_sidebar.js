/**
 * tools/audit_sidebar.js — W6.T1 ka pehla hissa (AUDIT — koi assert nahi).
 *
 * 5 viewports par sidebar ka ASLI behaviour naapta hai (computed style + DOM):
 *   · width, position, classes
 *   · pehle nav-item ka label span DIKHTA hai ya nahi (getClientRects + display)
 *   · label sidebar frame se bahar nikal raha hai ya clip ho raha hai
 *   · collapse toggle ka asar + localStorage persistence + reload ke baad state
 *   · hover par kya hota hai (kya rail text dikha deta hai?)
 *   · mobile (390): off-canvas open/close
 *
 *   node tools/audit_sidebar.js [file|http]        (~30s)
 */
'use strict';
const puppeteer = require('puppeteer');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const TARGET = process.argv[2] || ('file://' + path.join(ROOT, 'demo', 'index.html'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const VIEWPORTS = [[1440, 900], [1280, 800], [1024, 768], [768, 900], [390, 844]];

/* sidebar + pehla nav label ki asli halat */
const PROBE = () => {
  const sb = document.getElementById('sidebar');
  const shell = document.getElementById('shell');
  if (!sb) return { err: 'sidebar nahi mila' };
  const item = sb.querySelector('.nav-item');
  const label = item ? item.querySelector('span:not(.ni):not(.nk)') : null;
  const vis = el => {
    if (!el) return { found: false };
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      found: true, display: cs.display, visibility: cs.visibility, opacity: cs.opacity,
      rects: el.getClientRects().length, w: Math.round(r.width), h: Math.round(r.height),
      left: Math.round(r.left), right: Math.round(r.right), text: (el.textContent || '').trim().slice(0, 20)
    };
  };
  const sr = sb.getBoundingClientRect();
  const lv = vis(label);
  return {
    shellClass: shell ? shell.className : '',
    sbClass: sb.className,
    sbW: Math.round(sr.width), sbLeft: Math.round(sr.left), sbPos: getComputedStyle(sb).position,
    label: lv,
    labelInside: lv.found ? (lv.left >= sr.left - 1 && lv.right <= sr.right + 1) : null,
    labelClipped: lv.found ? (lv.w > 0 && (lv.left < sr.left || lv.right > sr.right)) : null,
    ls: (() => { try { return { collapsed: localStorage.getItem('ha.sbCollapsed'), mode: localStorage.getItem('ha.sbMode') }; } catch (e) { return {}; } })(),
    scrimHidden: (() => { const s = document.getElementById('scrim'); return s ? s.hidden : null; })(),
    bodyW: document.documentElement.clientWidth
  };
};

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e.message).slice(0, 90)));
  page.on('console', m => { if (/sidebar/i.test(m.text())) console.log('   [console]', m.text().slice(0, 120)); });

  for (const [w, h] of VIEWPORTS) {
    await page.setViewport({ width: w, height: h });
    await page.goto(TARGET, { waitUntil: 'networkidle2', timeout: 45000 });
    if (await page.$('#lgUser')) {
      await page.click('#lgUser'); await page.type('#lgUser', 'owner');
      await page.click('#lgPass'); await page.type('#lgPass', 'admin123');
      await page.keyboard.press('Enter');
    }
    await page.waitForFunction(() => window.App && App.state && App.state.session, { timeout: 20000 });
    await sleep(900);
    const base = await page.evaluate(PROBE);
    console.log(`\n=== ${w}×${h} ===`);
    console.log('  default       :', JSON.stringify({ sbW: base.sbW, pos: base.sbPos, labelDisp: base.label.display, labelW: base.label.w, labelRects: base.label.rects, inside: base.labelInside, clipped: base.labelClipped, shell: base.shellClass }));

    /* collapse toggle (desktop) — agar control mojood ho */
    const hasBtn = await page.$('#sbCollapse');
    if (hasBtn && w >= 1025) {
      await page.click('#sbCollapse'); await sleep(500);
      const col = await page.evaluate(PROBE);
      console.log('  collapsed     :', JSON.stringify({ sbW: col.sbW, labelDisp: col.label.display, labelW: col.label.w, labelRects: col.label.rects, inside: col.labelInside, clipped: col.labelClipped, shell: col.shellClass, ls: col.ls }));
      /* hover par kya hota hai? */
      await page.mouse.move(col.sbLeft + Math.round(col.sbW / 2), 300); await sleep(500);
      const hov = await page.evaluate(PROBE);
      console.log('  collapsed+hover:', JSON.stringify({ sbW: hov.sbW, labelDisp: hov.label.display, labelW: hov.label.w, labelRects: hov.label.rects, inside: hov.labelInside }));
      await page.mouse.move(w - 20, h - 20); await sleep(400);
      /* reload → persist? */
      await page.reload({ waitUntil: 'networkidle2' }); await sleep(1200);
      const rel = await page.evaluate(PROBE);
      console.log('  after reload  :', JSON.stringify({ sbW: rel.sbW, shell: rel.shellClass, ls: rel.ls }));
      /* wapas expand */
      if (await page.$('#sbCollapse')) { await page.click('#sbCollapse'); await sleep(400); }
    }

    /* mobile off-canvas */
    if (w < 1025) {
      const hamb = await page.$('#sbRail') || await page.$('.sb-rail');
      const open = await page.evaluate(() => {
        const sb = document.getElementById('sidebar');
        const b = document.querySelector('.sb-rail');
        if (b) b.click();
        return new Promise(r => setTimeout(() => {
          const s2 = document.getElementById('sidebar');
          const sc = document.getElementById('scrim');
          const r2 = s2.getBoundingClientRect();
          r({ sbClass: s2.className, sbLeft: Math.round(r2.left), sbW: Math.round(r2.width), scrimHidden: sc ? sc.hidden : null });
        }, 500));
      });
      console.log('  offcanvas open:', JSON.stringify(open));
      const close = await page.evaluate(() => {
        if (window.App && App.closeSidebar) App.closeSidebar();
        return new Promise(r => setTimeout(() => {
          const s2 = document.getElementById('sidebar');
          const sc = document.getElementById('scrim');
          const r2 = s2.getBoundingClientRect();
          r({ sbClass: s2.className, sbLeft: Math.round(r2.left), sbW: Math.round(r2.width), scrimHidden: sc ? sc.hidden : null });
        }, 450));
      });
      console.log('  offcanvas shut:', JSON.stringify(close));
    }
  }
  console.log('\npage errors:', JSON.stringify(errs.slice(0, 4)));
  await browser.close();
})().catch(e => { console.error('✖ ' + (e && e.stack || e)); process.exit(1); });
