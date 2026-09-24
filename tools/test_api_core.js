/**
 * tools/test_api_core.js — v2.25.9 — W2.T1 gate (SHARED FETCH CORE).
 *
 * Audit E1/E4/E8 ka core ilaaj: in-flight dedupe · TTL cache (+ write par
 * invalidation) · network-only retry (reads) · API.parallel.
 *
 *   node tools/test_api_core.js            → assertions (~20s, mock transport)
 *   SENS=1 node tools/test_api_core.js     → SENSITIVITY: features off kar ke
 *                                            dikhana ke checks FAIL hote hain
 */
'use strict';
const puppeteer = require('puppeteer');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const TARGET = process.argv[2] || ('file://' + path.join(ROOT, 'demo', 'index.html'));
const SENS = process.env.SENS === '1';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ERR = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('✔', name); }
  else { fail++; const m = '✘ ' + name + (extra ? ' — ' + extra : ''); ERR.push(m); console.log(m); }
}

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errs = []; page.on('pageerror', e => errs.push(String(e.message).slice(0, 110)));
  await page.goto(TARGET, { waitUntil: 'networkidle2', timeout: 45000 });
  if (await page.$('#lgUser')) {
    await page.click('#lgUser'); await page.type('#lgUser', 'owner');
    await page.click('#lgPass'); await page.type('#lgPass', 'admin123');
    await page.keyboard.press('Enter');
  }
  await page.waitForFunction(() => window.App && App.state && App.state.session, { timeout: 20000 });
  await sleep(1000);
  if (SENS) {
    await page.evaluate(() => { API._features = { dedupe: false, cache: false, retry: false }; });
    console.log('  [SENS] features OFF (purana behaviour) — checks FAIL hone chahiye\n');
  }

  /* spy-able actions banayein (mock transport ke andar) */
  await page.evaluate(() => {
    window.__spy = { a: 0, b: 0, w: 0, flaky: 0, bad: 0 };
    window.MockAPI = window.MockAPI || {};
    window.MockAPI['__core.readA'] = () => { window.__spy.a++; return { n: window.__spy.a, tag: 'A' }; };
    window.MockAPI['__core.readB'] = () => { window.__spy.b++; return { n: window.__spy.b, tag: 'B' }; };
    window.MockAPI['__core.save'] = () => { window.__spy.w++; return { saved: window.__spy.w }; };
    window.MockAPI['__core.flaky'] = () => {
      window.__spy.flaky++;
      if (window.__spy.flaky < 3) throw new Error('REQUEST_TIMEOUT [__core.flaky]: server slow');
      return { okAfter: window.__spy.flaky };
    };
    window.MockAPI['__core.bad'] = () => { window.__spy.bad++; throw new Error('Ghalat code — validation'); };
    window.MockAPI['__core.stable'] = () => ({ v: 1 });   /* TTL cache test */
  });

  /* 1) IN-FLIGHT DEDUPE — ek hi waqt mein 3 identical reads */
  const d = await page.evaluate(async () => {
    API.cacheClear(); API.statsReset();
    const [r1, r2, r3] = await Promise.all([
      API.call('__core.readA', { p: 1 }, {}),
      API.call('__core.readA', { p: 1 }, {}),
      API.call('__core.readA', { p: 1 }, {})
    ]);
    return { spy: window.__spy.a, same: JSON.stringify(r1) === JSON.stringify(r2) && JSON.stringify(r2) === JSON.stringify(r3),
      s: API.statsSummary() };
  });
  ok(d.spy === 1, 'dedupe: 3 identical parallel reads → network/MOCK par sirf 1 call', 'mock calls=' + d.spy);
  ok(d.same === true, 'dedupe: teenon callers ko WAHI data mila', String(d.same));
  ok(d.s.dedupesServed >= 2, 'dedupe: stats.dedupesServed ≥ 2 (2 calls bach gayi)', JSON.stringify({ dedupesServed: d.s.dedupesServed }));

  /* 2) WRITES DEDUPE NA HON — do bar save = do save (data loss nahi) */
  const w = await page.evaluate(async () => {
    API.statsReset();
    await Promise.all([API.call('__core.save', { x: 1 }, {}), API.call('__core.save', { x: 1 }, {})]);
    return window.__spy.w;
  });
  ok(w === 2, 'dedupe writes par NAHI: do identical save = 2 asli save', 'saves=' + w);

  /* 3) TTL CACHE — sequential identical read */
  const c = await page.evaluate(async () => {
    API.cacheClear(); API.statsReset();
    const a = await API.call('__core.stable', {}, { cacheTtl: 60000 });
    const b = await API.call('__core.stable', {}, { cacheTtl: 60000 });
    const hits = API.statsSummary().cacheHits;
    const c2 = await API.call('__core.stable', {}, { cacheTtl: 60000, noCache: true });
    return { a: a, b: b, hits: hits, c: c2 };
  });
  ok(c.hits >= 1, 'cache: 2nd identical read cache se aaya (network/mock nahi)', 'cacheHits=' + c.hits);
  ok(JSON.stringify(c.a) === JSON.stringify(c.b), 'cache: cached data wahi hai', JSON.stringify(c.b));
  ok(!!c.c, 'cache: { noCache:true } bypass karta hai', JSON.stringify(c.c));

  /* 4) WRITE KE BAAD CACHE INVALID — stale data nahi */
  const inv = await page.evaluate(async () => {
    API.cacheClear();
    await API.call('__core.stable', {}, { cacheTtl: 60000 });
    const before = API.cacheSize();
    await API.call('__core.save', { y: 2 }, {});
    const after = API.cacheSize();
    return { before: before, after: after };
  });
  ok(inv.before >= 1 && inv.after === 0, 'invalidation: kaamyab write ke baad cache khud saaf', JSON.stringify(inv));

  /* 5) DEFAULT_TTL — config.menu/config.defs auto-cache (E4 ka fix) */
  const defs = await page.evaluate(async () => {
    API.cacheClear(); API.statsReset();
    if (!window.MockAPI['config.menu']) return { skip: true };
    await API.call('config.menu', {}, {});
    await API.call('config.menu', {}, {});
    return { hits: API.statsSummary().cacheHits, ttl: API.DEFAULT_TTL['config.menu'] };
  });
  if (defs.skip) { console.log('  (config.menu mock nahi — skip)'); }
  else ok(defs.hits >= 1 && defs.ttl >= 30000, 'DEFAULT_TTL: config.menu cache ho kar dobara network par nahi jati (E4)', JSON.stringify(defs));

  /* 6) RETRY — sirf network error par, reads par */
  const r = await page.evaluate(async () => {
    window.__spy.flaky = 0; API.statsReset();
    const res = await API.call('__core.flaky', {}, { retries: 2 });
    return { res: res, tries: window.__spy.flaky, s: API.statsSummary() };
  });
  ok(r.tries === 3 && r.res && r.res.okAfter === 3, 'retry: network error par 2 retry ke baad success (3 attempts)', JSON.stringify({ tries: r.tries, res: r.res }));
  ok(r.s.retries >= 2, 'retry: stats.retries ≥ 2', 'retries=' + r.s.retries);

  /* 7) VALIDATION error par retry NAHI */
  const bad = await page.evaluate(async () => {
    window.__spy.bad = 0;
    let msg = '';
    try { await API.call('__core.bad', {}, { retries: 2 }); } catch (e) { msg = e.message; }
    return { tries: window.__spy.bad, msg: msg };
  });
  ok(bad.tries === 1 && /Ghalat/.test(bad.msg), 'retry: validation error par sirf 1 attempt (fazool retry nahi)', JSON.stringify(bad));

  /* 8) WRITE par retry NAHI (double-post ka khatra nahi) */
  const wr = await page.evaluate(async () => {
    window.__spy.w = 0; window.MockAPI['__core.saveErr'] = () => { window.__spy.w++; throw new Error('REQUEST_TIMEOUT [__core.saveErr]: boom'); };
    let threw = false;
    try { await API.call('__core.saveErr', {}, {}); } catch (e) { threw = true; }
    return { tries: window.__spy.w, threw: threw };
  });
  ok(wr.tries === 1 && wr.threw, 'retry: write par retry nahi (duplicate post se bachao)', JSON.stringify(wr));

  /* 9) API.parallel — waterfall ki jagah ek sath */
  const par = await page.evaluate(async () => {
    window.__spy.a = 0; window.__spy.b = 0; API.statsReset();
    const t0 = performance.now();
    const out = await API.parallel([
      { action: '__core.readA', payload: { k: 1 } },
      { action: '__core.readB', payload: { k: 2 } },
      { action: '__core.readA', payload: { k: 3 } }
    ], 3);
    const ms = Math.round(performance.now() - t0);
    return { n: out.length, okAll: out.every(x => x && !x.__err), a: window.__spy.a, b: window.__spy.b, ms: ms,
      maxInflight: API.statsSummary().maxInflight };
  });
  ok(par.n === 3 && par.okAll && par.a === 2 && par.b === 1, 'API.parallel: 3 kaam, sahi natije', JSON.stringify(par));
  ok(par.maxInflight >= 2, 'API.parallel: sach mein parallel chala (inflight ≥ 2)', 'maxInflight=' + par.maxInflight);

  ok(errs.length === 0, 'zero page errors', JSON.stringify(errs).slice(0, 200));

  await browser.close();
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  API CORE (${SENS ? 'SENSITIVITY' : 'assert'})   PASS: ${pass}   FAIL: ${fail}`);
  if (fail) ERR.forEach(e => console.log('   ✖ ' + e));
  console.log('═══════════════════════════════════════════════════════════');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('✖ ' + (e && e.stack || e)); process.exit(1); });
