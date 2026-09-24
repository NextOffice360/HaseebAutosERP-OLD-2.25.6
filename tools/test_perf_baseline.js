/**
 * tools/test_perf_baseline.js — v2.25.8 — W0.T3
 *
 * Har screen par ja kar naapta hai (demo/local par):
 *   · kitni API calls hui  · kitni DUPLICATE (zaya)  · in-flight peak
 *   · p50 / p95 / max duration  · top actions
 * Nateeja: tmp/perf-baseline.json  (baad mein isi se improvement compare hoti hai)
 *
 * Chhota rakha gaya hai (har route ~1.2s settle) — poora run ~45s.
 *   node tools/test_perf_baseline.js [file|http] [out.json]
 */
'use strict';
const puppeteer = require('puppeteer');
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..');
const TARGET = process.argv[2] || ('file://' + path.join(ROOT, 'demo', 'index.html'));
const OUT = process.argv[3] || path.join(ROOT, 'tmp', 'perf-baseline.json');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROUTES = ['dashboard', 'pos', 'items', 'inventory', 'purchase', 'demands', 'parties', 'salesman', 'reports', 'settings'];

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const pageErrs = [];
  page.on('pageerror', e => pageErrs.push(String(e.message).slice(0, 100)));
  await page.goto(TARGET, { waitUntil: 'networkidle2', timeout: 45000 });
  if (await page.$('#lgUser')) {
    await page.click('#lgUser'); await page.type('#lgUser', 'owner');
    await page.click('#lgPass'); await page.type('#lgPass', 'admin123');
    await page.keyboard.press('Enter');
  }
  await page.waitForFunction(() => window.App && App.state && App.state.session, { timeout: 20000 });
  await sleep(1500);

  const boot = await page.evaluate(() => API.statsSummary());
  const out = { at: new Date().toISOString(), target: TARGET, boot: { calls: boot.calls, dups: boot.dups, p50: boot.p50, p95: boot.p95, max: boot.max }, routes: {} };

  for (const r of ROUTES) {
    const got = await page.evaluate(async (route) => {
      if (!App.screens[route]) return { skip: true };
      API.statsReset();
      const t0 = performance.now();
      App.go(route);
      await new Promise(res => setTimeout(res, 1300));       /* render + data settle */
      const s = API.statsSummary();
      return { s: s, wallMs: Math.round(performance.now() - t0),
        view: (document.querySelector('#view h2') || {}).textContent || '' };
    }, r);
    if (got.skip) { out.routes[r] = { skip: true }; continue; }
    out.routes[r] = { calls: got.s.calls, dups: got.s.dups, p50: got.s.p50, p95: got.s.p95, max: got.s.max,
      maxInflight: got.s.maxInflight, wallMs: got.wallMs, title: (got.view || '').trim().slice(0, 40),
      top: (got.s.top || []).slice(0, 4) };
    console.log(`  ${r.padEnd(10)} calls=${String(got.s.calls).padStart(3)} dups=${String(got.s.dups).padStart(2)} p50=${String(got.s.p50).padStart(4)}ms p95=${String(got.s.p95).padStart(4)}ms max=${String(got.s.max).padStart(4)}ms inflight=${got.s.maxInflight} wall=${got.wallMs}ms  ${out.routes[r].top.map(t => t.action + '×' + t.n).join(', ')}`);
  }

  const totals = Object.values(out.routes).filter(r => !r.skip);
  out.totals = {
    calls: totals.reduce((a, r) => a + r.calls, 0),
    dups: totals.reduce((a, r) => a + r.dups, 0),
    worstP95: Math.max(0, ...totals.map(r => r.p95 || 0)),
    routesWithDups: totals.filter(r => r.dups > 0).map(r => r.title || '?').length
  };
  out.pageErrors = pageErrs.slice(0, 5);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(`\n  KUL 10 route: calls=${out.totals.calls} dups=${out.totals.dups} worstP95=${out.totals.worstP95}ms · dup wale routes=${out.totals.routesWithDups}`);
  console.log('  → ' + OUT + '  (' + fs.statSync(OUT).size + ' bytes)');
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('✖ ' + (e && e.stack || e)); process.exit(1); });
