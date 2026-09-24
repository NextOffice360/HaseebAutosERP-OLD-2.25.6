/**
 * tools/test_api_instrument.js — v2.25.8 — W0.T2 gate.
 *
 * Kya check karta hai (chhota, akela chalne wala, ~20s):
 *   1. Instrumentation maujood hai (window.__apiStats + API.statsSummary).
 *   2. Calls count hote hain, action-wise count sahi.
 *   3. DUPLICATE detect hota hai: same action + same payload, jab pehli call
 *      ABHI chalu ho → stats.dups >= 1 (yahi "button dobara dabaya" wala zaya).
 *   4. in-flight peak >= 2 (parallel calls).
 *   5. p50 / p95 nikaalte hain (sane values).
 *   6. slow-call list kaam karti hai (threshold gira kar).
 *   7. FAIL bhi count hoti hai (reject path), aur ok/fail ka jama sahi.
 *   8. Behaviour NAHI badla: instrumented call ka return value wahi.
 *   9. Zero page errors.
 *
 *   node tools/test_api_instrument.js [file|http]     (default demo/index.html)
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

(async () => {
  const launchArgs = ['--no-sandbox', '--disable-dev-shm-usage'];
  const browser = await puppeteer.launch({
    args: launchArgs,
    executablePath: process.env.CHROME_PATH || undefined
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message).slice(0, 120)));
  await page.goto(TARGET, { waitUntil: 'networkidle2', timeout: 45000 });
  if (await page.$('#lgUser')) {
    await page.click('#lgUser'); await page.type('#lgUser', 'owner');
    await page.click('#lgPass'); await page.type('#lgPass', 'admin123');
    await page.keyboard.press('Enter');
  }
  await page.waitForFunction(() => window.App && App.state && App.state.session, { timeout: 20000 });
  await sleep(1200);

  /* 1) instrumentation maujood hai? */
  const has = await page.evaluate(() => !!(window.__apiStats && window.API && API.statsSummary && API.statsReset));
  ok(has, 'instrumentation maujood (window.__apiStats + API.statsSummary/statsReset)');

  /* boot ke doran bhi kuch calls hui hain — wo bhi count honi chahiye */
  const boot = await page.evaluate(() => API.statsSummary());
  ok(boot.calls > 0, 'boot ke doran hui calls count hui hain', 'calls=' + boot.calls);

  /* 2) ek asli mock action chun kar do parallel identical calls */
  const probe = await page.evaluate(async () => {
    const key = Object.keys(window.MockAPI || {})[0];
    if (!key) return { err: 'koi MockAPI action nahi mila' };
    API.statsReset();
    const t0 = performance.now();
    const pa = API.call(key, {}, {});
    const pb = API.call(key, {}, {});            /* same action + same payload, abhi chalu */
    const [a, b] = await Promise.all([pa, pb]);
    const ms = performance.now() - t0;
    /* direct mock se compare (behaviour change na hua ho) */
    let direct = null; try { direct = window.MockAPI[key]({}); } catch (e) { direct = 'ERR:' + e.message; }
    API.stats.slowMs = 50;                        /* threshold gira kar slow-list test */
    await API.call(key, { probeSlow: 1 }, {});
    const s = API.statsSummary();
    return { key: key, a: a === undefined ? 'undef' : (a === null ? 'null' : typeof a),
      b: b === undefined ? 'undef' : (b === null ? 'null' : typeof b),
      directSame: JSON.stringify(a) === JSON.stringify(direct),
      ms: Math.round(ms), s: s };
  });
  ok(!probe.err, 'probe action mila', probe.err || probe.key);

  const s = probe.s || {};
  ok(s.calls === 3, 'calls count sahi (2 parallel + 1 slow-probe = 3)', 'calls=' + s.calls);
  ok(s.dups === 1, 'DUPLICATE detect hua: same action+payload jab pehli chalu thi (dups=1)', 'dups=' + s.dups);
  ok((s.dupList || []).some(d => d.action === probe.key), 'dupList mein action ka naam bhi hai', JSON.stringify(s.dupList));
  ok(s.maxInflight >= 2, 'in-flight peak >= 2 (parallel calls sahi gine)', 'maxInflight=' + s.maxInflight);
  ok(s.n === 3 && s.p50 >= 0 && s.p95 >= s.p50, 'p50/p95 nikal rahe hain (p95 >= p50)', JSON.stringify({ n: s.n, p50: s.p50, p95: s.p95, max: s.max }));
  ok(s.ok === 3 && s.fail === 0, 'ok/fail counters sahi (teenon resolve hue)', JSON.stringify({ ok: s.ok, fail: s.fail }));
  ok((s.slow || []).some(x => x.action === probe.key), 'slow-call list kaam karti hai (threshold gira kar pakra)', JSON.stringify(s.slow));
  ok(s.top && s.top.length && s.top[0].n >= 2, 'action-wise top list sahi', JSON.stringify(s.top && s.top.slice(0, 2)));
  ok(probe.directSame === true, 'behaviour NAHI badla: instrumented return === direct mock return', String(probe.directSame));

  /* 3) FAIL path bhi count ho (reject) */
  const failed = await page.evaluate(async () => {
    API.statsReset();
    let caught = false;
    try { await API.call('__nope.not_an_action', {}, { timeoutMs: 900 }); }
    catch (e) { caught = true; }
    return { caught: caught, s: API.statsSummary() };
  });
  ok(failed.caught && failed.s.fail === 1, 'fail path count hoti hai (unknown action → 1 fail)', JSON.stringify({ caught: failed.caught, fail: failed.s.fail }));

  ok(errs.length === 0, 'zero page errors', JSON.stringify(errs).slice(0, 200));

  await browser.close();
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  API INSTRUMENT   PASS: ${pass}   FAIL: ${fail}`);
  if (fail) ERR.forEach(e => console.log('   ✖ ' + e));
  console.log('═══════════════════════════════════════════════════════════');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('✖ ' + (e && e.stack || e)); process.exit(1); });
