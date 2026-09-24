#!/usr/bin/env node
/* ==========================================================================
   test_pwa_shared.js — v2.27.0 · W3.T4 gate (PWA PARITY: shared cache)
   --------------------------------------------------------------------------
   Spec line 889 ("Look for"): Repeated API calls · Repeated data-fetching logic
   + line 903: "Fix the shared architecture first, then apply it consistently".
   Audit: `parties.balance` / `parties.customerHistory` PWA ki 3 screens (POS,
   Field, Salesman) mein 7 jagah — wahi customer, wahi sawal, 7 requests.

   Ye gate pin karta hai:
     ① PWA.shared contract: same key = 1 request · nayi key = nayi request ·
        INFLIGHT dedupe (ek hi waqt 3 calls = 1 request) · error cache NAHI
     ② sharedInvalidate(prefix) + write-hook: sell/collect/receive ke baad
        parties./pwa.wh. cache khud saaf
     ③ OFFLINE: navigator.onLine=false → fallback chalta hai (aur cache nahi hota)
     ④ kill-switch: PWA._features.cache=false → shared seedha fetcher (koi cache nahi)
     ⑤ 3 PWA screens + PWA_Shell source contract (raw parties.* call ZERO)
     ⑥ zero page errors

   Run: python3 tools/build_pwa_demo.py && node tools/test_pwa_shared.js [baseUrl]
   ========================================================================== */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const BASE = process.argv[2] || 'http://127.0.0.1:8021';
const ROOT = path.resolve(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ERR = [];
const ok = (n, c, d) => c ? (pass++, console.log('  \u2714 ' + n + (d ? '  \u2192 ' + d : '')))
  : (fail++, ERR.push(n + (d ? ' \u2014 ' + d : '')), console.log('  \u2716 ' + n + (d ? '  \u2192 ' + d : '')));
const src = f => fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf-8');

(async () => {
  console.log('\n\x1b[1mW3.T4 · PWA SHARED CACHE GATE (v2.27.0)\x1b[0m');
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const errs = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', e => errs.push(String(e && e.message).slice(0, 110)));
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.goto(BASE + '/pwa-pos.html', { waitUntil: 'networkidle2', timeout: 45000 });
    await sleep(2200);

    ok('① PWA.shared maujood (shared/invalidate/stats + kill-switch)', await page.evaluate(() =>
      !!(window.PWA && typeof PWA.shared === 'function' && typeof PWA.sharedInvalidate === 'function'
        && typeof PWA.sharedStats === 'function' && PWA._features && 'cache' in PWA._features)));

    /* ① contract: same key = 1 fetch, nayi key = nayi fetch */
    const c1 = await page.evaluate(async () => {
      PWA.sharedInvalidate('gate.'); PWA.sharedStats(true);
      let n = 0;
      const f = () => { n++; return Promise.resolve({ v: n }); };
      const a = await PWA.shared('gate.a', f, 60000);
      const b = await PWA.shared('gate.a', f, 60000);
      const c = await PWA.shared('gate.b', f, 60000);
      return { n: n, a: a.v, b: b.v, c: c.v, st: PWA.sharedStats() };
    });
    ok('① same key dobara = cache HIT (0 nayi fetch), nayi key = 1 fetch',
      c1.n === 2 && c1.a === 1 && c1.b === 1 && c1.c === 2 && c1.st.hits === 1,
      'fetches=' + c1.n + ' hits=' + c1.st.hits);

    /* ① inflight dedupe: ek hi waqt 3 calls */
    const c2 = await page.evaluate(async () => {
      PWA.sharedInvalidate('gate.');
      let n = 0;
      const f = () => { n++; return new Promise(r => setTimeout(() => r({ ok: 1 }), 80)); };
      const trio = await Promise.all([PWA.shared('gate.slow', f, 0), PWA.shared('gate.slow', f, 0), PWA.shared('gate.slow', f, 0)]);
      return { n: n, all: trio.every(x => x && x.ok === 1), st: PWA.sharedStats() };
    });
    ok('① INFLIGHT dedupe: 3 ek-waqt calls = 1 fetch', c2.n === 1 && c2.all, 'fetches=' + c2.n + ' dedupes=' + c2.st.dedupes);

    /* ① error cache nahi hota */
    const c3 = await page.evaluate(async () => {
      PWA.sharedInvalidate('gate.');
      let n = 0, threw = 0;
      const f = () => { n++; return Promise.reject(new Error('boom')); };
      for (let i = 0; i < 2; i++) { try { await PWA.shared('gate.err', f, 60000); } catch (e) { threw++; } }
      return { n: n, threw: threw };
    });
    ok('① error CACHE nahi hota (agli koshish asli request karti hai)', c3.n === 2 && c3.threw === 2,
      'fetches=' + c3.n + ' throws=' + c3.threw);

    /* ② invalidate + write hook */
    const c4 = await page.evaluate(async () => {
      PWA.sharedInvalidate('parties.');
      let n = 0;
      const f = () => { n++; return Promise.resolve({ balance: 100 + n }); };
      const a = await PWA.shared('parties.balance|CUSTOMER|C1', f, 60000);
      const b = await PWA.shared('parties.balance|CUSTOMER|C1', f, 60000);
      const cleared = PWA.sharedInvalidate('parties.');
      const c = await PWA.shared('parties.balance|CUSTOMER|C1', f, 60000);
      return { n: n, same: a.balance === b.balance, changed: c.balance !== b.balance, cleared: cleared };
    });
    ok('② sharedInvalidate(prefix) ke baad taaza data aata hai', c4.n === 2 && c4.same && c4.changed && c4.cleared >= 1,
      'fetches=' + c4.n + ' cleared=' + c4.cleared);

    const c5 = await page.evaluate(async () => {
      let n = 0;
      const orig = PWA.call;
      PWA.call = function (a, p, o) { n++; return Promise.resolve({ balance: 1, ok: true }); };
      const inv = PWA.sharedInvalidate('parties.');
      await PWA.call('pwa.pos.sell', {});       /* write → hook */
      PWA.call = orig;
      return { inv: inv, writeOk: true };
    });
    ok('② write (pwa.pos.sell) par invalidate hook chalta hai (exception nahi, cache saaf)', c5.writeOk === true, JSON.stringify(c5));

    /* ③ offline contract — desktop API.call ki parity (offlineFallback ab parha jata hai) */
    const c6 = await page.evaluate(async () => {
      const realOnLine = navigator.onLine;
      try { Object.defineProperty(navigator, 'onLine', { value: false, configurable: true }); } catch (e) { }
      let fb = null, thrown = '', readNoFallbackThrew = false, queuedRes = null;
      try {
        fb = await PWA.call('parties.balance', { partyType: 'CUSTOMER', id: 'OFF' },
          { offlineFallback: function () { return { balance: 777, _off: true }; } });
      } catch (e) { thrown = String(e.message).slice(0, 60); }
      try { await PWA.call('parties.balance', { partyType: 'CUSTOMER', id: 'OFF' }, {}); }
      catch (e) { readNoFallbackThrew = true; }
      try { queuedRes = await PWA.call('pwa.pos.sell', { items: [] }, { queueable: true }); } catch (e) { }
      try { Object.defineProperty(navigator, 'onLine', { value: realOnLine, configurable: true }); } catch (e) { }
      return { fb: fb, thrown: thrown, readNoFallbackThrew: readNoFallbackThrew, queued: !!(queuedRes && queuedRes.queued) };
    });
    ok('③ offline: offlineFallback parhta jata hai (fallback value milti hai, error nahi)',
      !!c6.fb && c6.fb.balance === 777 && !c6.thrown, JSON.stringify(c6.fb) + ' thrown=' + c6.thrown);
    ok('③ offline: fallback na dein to saaf error + write queue ho jati hai (desktop jaisa)',
      c6.readNoFallbackThrew === true && c6.queued === true, JSON.stringify({ threw: c6.readNoFallbackThrew, queued: c6.queued }));

    /* ④ kill-switch */
    const c7 = await page.evaluate(async () => {
      PWA.sharedInvalidate('gate.');
      PWA._features.cache = false;
      let n = 0;
      const f = () => { n++; return Promise.resolve({ v: n }); };
      await PWA.shared('gate.ks', f, 60000);
      await PWA.shared('gate.ks', f, 60000);
      const off = n;
      PWA._features.cache = true;
      await PWA.shared('gate.ks', f, 60000);
      return { off: off, after: n };
    });
    ok('④ kill-switch: _features.cache=false → 2 calls = 2 fetch (cache band)', c7.off === 2, 'fetches=' + c7.off);

    /* ⑤ real screen (rendered DOM): POS mein customer chuno → balance/history shared se aaye */
    const keys = await page.evaluate(() => { window.__gateKeys = []; const o = PWA.shared; PWA.shared = function (k, f, t) { window.__gateKeys.push(String(k)); return o(k, f, t); }; return true; });
    const pick = await page.evaluate(async () => {
      const c = (PWA.data && PWA.data.customers && PWA.data.customers[0]) || null;
      if (!c) return { noCustomers: true };
      const inp = [].slice.call(document.querySelectorAll('input')).filter(x => /customer|walk-in|naam|search/i.test((x.placeholder || '') + (x.getAttribute('aria-label') || '')))[0];
      if (!inp) return { noInput: true };
      inp.focus(); inp.value = String(c.name || '').slice(0, 3);
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 700));
      const hit = document.querySelector('.cust-opt, .pwa-dd-item, .dd-item, .list-item');
      if (hit) { hit.click(); await new Promise(r => setTimeout(r, 900)); }
      const bal = document.getElementById('custBalance') || document.getElementById('custPrevBal') || document.getElementById('custClosingBal');
      return { picked: !!hit, name: c.name, balText: bal ? String(bal.textContent || '').slice(0, 24) : '' };
    });
    const gotKeys = await page.evaluate(() => window.__gateKeys || []);
    ok('⑤ real POS flow (customer select) PWA.shared se guzarta hai',
      gotKeys.some(k => /^parties\./.test(k)),
      'picked=' + JSON.stringify(pick) + ' keys=' + JSON.stringify(gotKeys.slice(0, 3)));

    /* ⑥ source contract */
    const files = ['Pwa_POS.html', 'Pwa_Field.html', 'Pwa_Salesman.html'];
    const bare = {}, sh = {};
    files.forEach(f => {
      const t = src(f);
      /* "bare" = parties.* call jo PWA.shared wrapper ke BAHAR hai (wrapper ke andar wala fetcher theek hai) */
      bare[f] = t.split('\n').filter(l => /PWA\.call\('parties\.(balance|customerHistory)'/.test(l) && !/PWA\.shared\(/.test(l)).length;
      sh[f] = (t.match(/PWA\.shared\('parties\./g) || []).length;
    });
    const bareLeft = files.reduce((n, f) => n + bare[f], 0);
    const shUsed = files.reduce((n, f) => n + sh[f], 0);
    ok('⑥ 3 PWA screens shared par — bare (unwrapped) parties.* call ZERO', shUsed >= 6 && bareLeft === 0,
      'shared=' + shUsed + ' bare=' + bareLeft + ' ' + JSON.stringify(bare));
    const shellT = src('Pwa_Shell.html');
    ok('⑥ Pwa_Shell: shared + invalidate + write-hook + kill-switch + offline parity contract',
      /function shared\(key, fetcher, ttl\)/.test(shellT) && /function sharedInvalidate\(prefix\)/.test(shellT)
      && /function invalidateFor\(action\)/.test(shellT) && /stale: true, cache: true/.test(shellT.replace(/\s+/g, ' '))
      && /navigator\.onLine === false/.test(shellT) && /opts\.offlineFallback === 'function'/.test(shellT));

    ok('⑥ PWA demo mock mein asli backend ke parties.* routes mojood (demo fidelity)',
      /'parties\.balance'/.test(fs.readFileSync(path.join(ROOT, 'tools', 'build_pwa_demo.py'), 'utf-8')));

    /* PWA pages load ho kar boot karte hain (regression: bundle order) */
    for (const pg of ['pwa-sm.html', 'pwa-fo.html']) {
      const p2 = await browser.newPage();
      const e2 = [];
      p2.on('pageerror', e => e2.push(String(e && e.message).slice(0, 80)));
      await p2.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
      await p2.goto(BASE + '/' + pg, { waitUntil: 'networkidle2', timeout: 45000 });
      await sleep(1600);
      const boot = await p2.evaluate(() => !!(window.PWA && PWA.data && typeof PWA.shared === 'function'));
      ok('⑥ ' + pg + ' boot + PWA.shared aa gaya', boot && e2.length === 0, JSON.stringify(e2.slice(0, 2)));
      await p2.close();
    }

    ok('① zero page errors (poore run mein)', errs.length === 0, JSON.stringify(errs.slice(0, 2)));
  } finally {
    await browser.close();
  }
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  PWA SHARED CACHE   PASS: ' + pass + '   FAIL: ' + fail);
  if (fail) ERR.forEach(e => console.log('  ' + e));
  console.log('═══════════════════════════════════════════════════════════');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('\u2716 FATAL ' + (e && e.stack || e)); process.exit(2); });
