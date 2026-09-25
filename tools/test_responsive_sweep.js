#!/usr/bin/env node
/* ============================================================================
 * tools/test_responsive_sweep.js — v2.30.5 (P3-b/c + QA-a)
 * ----------------------------------------------------------------------------
 * 390px sweep (mobile-first standing rule) — 8 core screens, LIGHT + DARK:
 *   • koi horizontal overflow (scrollWidth ≤ innerWidth + 2)
 *   • koi console.error / pageerror (QA-a console-sweep fold)
 * Run:  node tools/test_responsive_sweep.js   (server 8021 + LD_LIBRARY_PATH)
 * ==========================================================================*/
'use strict';
(async () => {
  const puppeteer = require('puppeteer');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', e => errs.push('PE:' + String(e.message).slice(0, 100)));
  page.on('console', m => { if (m.type() === 'error' && !/net::|favicon|Failed to load resource/.test(m.text())) errs.push('CE:' + m.text().slice(0, 100)); });
  let pass = 0, fail = 0; const failures = [];
  const ok = (cond, name) => { if (cond) { pass++; console.log('  ✔ ' + name); } else { fail++; failures.push(name); console.log('  ✘ ' + name); } };
  const SCREENS = ['dashboard', 'pos', 'items', 'parties', 'sales', 'orders', 'demands', 'documents'];
  const sweep = async (mode) => {
    for (const sc of SCREENS) {
      await page.evaluate(id => App.go(id), sc);
      await sleep(1500);
      const m = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth, iw: window.innerWidth,
        bodySw: document.body.scrollWidth
      }));
      ok(m.sw <= m.iw + 2 && m.bodySw <= m.iw + 2, mode + ' 390px ' + sc + ' — no overflow (' + m.sw + '≤' + m.iw + ')');
    }
  };
  try {
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.goto('http://127.0.0.1:8021/', { waitUntil: 'networkidle2', timeout: 45000 });
    if (await page.$('#lgUser')) {
      await page.click('#lgUser'); await page.type('#lgUser', 'owner');
      await page.click('#lgPass'); await page.type('#lgPass', 'admin123');
      await page.keyboard.press('Enter');
    }
    await page.waitForFunction(() => window.App && App.state && App.state.session, { timeout: 20000 });
    await sleep(1500);
    console.log('\x1b[1mLIGHT sweep @390\x1b[0m');
    await sweep('light');
    console.log('\x1b[1mDARK sweep @390\x1b[0m');
    await page.evaluate(() => { document.body.classList.add('dark'); });
    await sleep(400);
    await sweep('dark');
    console.log('\x1b[1mConsole/page health (QA-a)\x1b[0m');
    ok(errs.length === 0, 'zero console/page errors across ' + SCREENS.length * 2 + ' views' + (errs.length ? ' — ' + errs.slice(0, 3).join(' | ') : ''));
    console.log('\x1b[1mSUMMARY:\x1b[0m ' + pass + ' pass \u00b7 ' + fail + ' fail \u00b7 ' + (fail ? '\x1b[31mRED\x1b[0m' : '\x1b[32mGREEN\x1b[0m'));
    if (fail) { console.log('Failures:'); failures.forEach(f => console.log('  - ' + f)); }
  } catch (e) {
    console.log('FATAL: ' + String(e.message || e).slice(0, 200));
    fail++;
  } finally {
    await browser.close();
    process.exitCode = fail ? 1 : 0;
  }
})();
