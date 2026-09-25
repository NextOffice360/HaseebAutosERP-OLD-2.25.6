#!/usr/bin/env node
/* ==========================================================================
   test_dyn_deps.js — v2.27.0 · W3 gate (SHARED DYNAMIC / DATA-AWARE SYSTEM)
   --------------------------------------------------------------------------
   Attachment A §5–7 + line 889 ("Look for" 12 items) + line 799.
   Audit ne dikhaya tha: `data-dep` markers 0, `items.search` 11 jagah,
   104 inline option lists — koi shared dependency system nahi tha.

   Ye gate pin karta hai:
     ① Deps core contract — define/load · CACHE hit · INFLIGHT dedupe (ek hi
        waqt mein 2 call = 1 request) · error cache NAHI hota · hardRefresh
     ② Shared search adoption — UI2.itemPicker._defaultSearch ab Deps.shared se
        chalta hai: wahi query dobara = 0 nayi request; nayi query = 1 request
     ③ Parent → child cascade (rendered DOM) — `data-field` parent badla to
        `data-dep` child ke options badle; value PRESERVE jab maujood ho,
        CLEAR jab na ho; `deps:change` event
     ④ Conditional UI — `data-when="provider=OPENROUTER"` → value match par
        visible, warna hidden (+ aria-hidden)
     ⑤ Real files: Deps App_Core mein hai, picker usse use karta hai, demo
        bundle mein window.Deps maujood
     ⑥ SENS=1 → `Deps._features.on=false` → wiring/cascade band (kuch FAIL)

   Run: python3 tools/build_demo.py && node tools/test_dyn_deps.js
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { loginDom } = require('./_harness');

const ROOT = path.join(__dirname, '..');
const SENS = process.env.SENS === '1';
let pass = 0, fail = 0; const failures = [];
const ok = (n, c, d) => c ? (pass++, console.log('  \u2714 ' + n + (d ? '  \u2192 ' + d : '')))
  : (fail++, failures.push(n), console.log('  \u2716 ' + n + (d ? '  \u2192 ' + d : '')));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const src = f => fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf-8');

console.log('\n\x1b[1mW3 · DYNAMIC / DATA-AWARE SHARED-LOGIC GATE (v2.27.0)\x1b[0m');

const HTML = fs.readFileSync(path.join(ROOT, 'demo', 'index.html'), 'utf-8');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push('jsdomError: ' + (e && e.message ? e.message : e)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ').slice(0, 160)));
const dom = new JSDOM(HTML, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/', virtualConsole: vc });
const win = dom.window, doc = win.document;
win.matchMedia = win.matchMedia || (q => ({ matches: false, media: q, addListener() { }, removeListener() { }, addEventListener() { }, removeEventListener() { } }));
win.requestAnimationFrame = cb => setTimeout(cb, 0);
win.cancelAnimationFrame = id => clearTimeout(id);
win.scrollTo = () => { };
win.HTMLElement.prototype.scrollIntoView = () => { };
if (!win.SVGElement.prototype.getBBox) win.SVGElement.prototype.getBBox = () => ({ x: 0, y: 0, width: 10, height: 10 });
win.URL.createObjectURL = () => 'blob:demo';
win.alert = () => { }; win.confirm = () => true;
/* CustomEvent jsdom mein maujood hai; safety */
if (!win.CustomEvent) win.CustomEvent = win.Event;

(async () => {
  await sleep(500);
  await loginDom(doc, win);
  await sleep(400);
  const D = win.Deps;
  ok('Deps core app mein load hua (window.Deps)', !!D && typeof D.load === 'function' && typeof D.shared === 'function');
  if (!D) { console.log('GATE CRASH: Deps maujood nahi'); process.exit(2); }
  if (SENS) { D._features.on = false; console.log('  (SENS=1: Deps._features.on = false)'); }

  /* ---------------- ① core: cache + dedupe + error + refresh ---------------- */
  {
    let fetches = 0;
    D.define('t.list', { ttl: 60000, fetch: async () => { fetches++; await sleep(40); return [{ id: 'a' }, { id: 'b' }]; } });
    D.hardRefresh('t.list'); D.stats(true);
    const r1 = await D.load('t.list', 'p1');
    const r2 = await D.load('t.list', 'p1');
    ok('① pehla load = 1 fetch, doosra = cache HIT (0 nayi request)', fetches === 1 && r1 === r2 && r1.length === 2,
      `fetches=${fetches} · stats=${JSON.stringify(D.stats())}`);
    ok('① stats: hit gina gaya', D.stats().hits === 1, JSON.stringify(D.stats()));

    /* inflight dedupe: ek hi waqt 3 calls */
    D.hardRefresh('t.slow'); D.stats(true);
    let slowFetches = 0;
    D.define('t.slow', { ttl: 0, fetch: async () => { slowFetches++; await sleep(60); return ['x']; } });
    const trio = await Promise.all([D.load('t.slow', ''), D.load('t.slow', ''), D.load('t.slow', '')]);
    ok('① INFLIGHT dedupe: 3 ek-waqt calls = 1 request', slowFetches === 1 && trio.every(x => x[0] === 'x'),
      `fetches=${slowFetches} · dedupes=${D.stats().dedupes}`);

    /* error cache nahi hota */
    let errFetches = 0, threw = 0;
    D.define('t.err', { ttl: 60000, fetch: async () => { errFetches++; throw new Error('boom'); } });
    for (let i = 0; i < 2; i++) { try { await D.load('t.err', ''); } catch (e) { threw++; } }
    ok('① error CACHE nahi hota (agli koshish dobara request karti hai)', errFetches === 2 && threw === 2,
      `fetches=${errFetches} · throws=${threw}`);

    /* hardRefresh */
    await D.load('t.list', 'p1');
    const cleared = D.hardRefresh('t.list');
    const before = fetches;
    await D.load('t.list', 'p1');
    ok('① hardRefresh(key) cache saaf karta hai (agli load = nayi request)', cleared >= 1 && fetches === before + 1,
      `cleared=${cleared} fetches ${before} -> ${fetches}`);

    /* parent value ka farq alag cache entry hai */
    D.hardRefresh('t.list');
    await D.load('t.list', 'p1'); const f2 = fetches;
    await D.load('t.list', 'p2');
    ok('① parent value badalne par alag entry (stale child data nahi)', fetches === f2 + 1,
      `fetches ${f2} -> ${fetches}`);

    /* reconcile semantics (preserve / clear) */
    const keep = D.reconcile('SDQ', [{ id: 'SDQ' }, { id: 'MCH' }]);
    const drop = D.reconcile('RYK', [{ id: 'SDQ' }]);
    ok('① value management: maujood → preserve, ghayab → clear',
      keep.keep === true && keep.value === 'SDQ' && drop.keep === false && drop.value === '', JSON.stringify({ keep, drop }));
  }

  /* ---------------- ② shared search adoption (asli picker path) ---------------- */
  {
    const calls = {};
    const orig = win.API.call.bind(win.API);
    win.API.call = (a, p, o) => { calls[a] = (calls[a] || 0) + 1; return orig(a, p, o); };
    D.hardRefresh('shared:items.search');
    const q = 'fl' + Date.now().toString().slice(-4);
    const a1 = await win.UI2.itemPicker._defaultSearch(q);
    const a2 = await win.UI2.itemPicker._defaultSearch(q);
    ok('② wahi query dobara = 0 nayi request (cache)',
      (calls['items.search'] || 0) === 1 && Array.isArray(a1) && Array.isArray(a2),
      'items.search calls=' + (calls['items.search'] || 0));
    const q2 = q + 'x';
    await win.UI2.itemPicker._defaultSearch(q2);
    ok('② nayi query = 1 nayi request', (calls['items.search'] || 0) === 2, 'calls=' + (calls['items.search'] || 0));
    win.API.call = orig;
    ok('② picker asal mein shared system par chalta hai (Shared.items → Deps.shared)', (function () {
      const core = src('App_Core.html');
      return /Shared\.items\(/.test(src('App_UI2.html')) && /var Shared = \{/.test(core) && /Deps\.shared\(key, fetchIt, ttl\)/.test(core);
    })());
  }

  /* ---------------- ③ parent -> child cascade (rendered DOM) ---------------- */
  {
    const host = doc.createElement('div');
    host.setAttribute('data-dep-scope', '');
    host.innerHTML =
      '<div data-field="locationId"><select id="t_loc"><option value="">—</option>' +
      '<option value="L1">L1</option><option value="L2">L2</option></select></div>' +
      '<select data-dep="t.bins" data-dep-parent="locationId"></select>';
    doc.body.appendChild(host);
    const loc = host.querySelector('#t_loc'), binSel = host.querySelector('[data-dep="t.bins"]');

    let loads = [];
    D.define('t.bins', { ttl: 0, fetch: async (parent) => { loads.push(parent); await sleep(20);
      return parent === 'L2' ? [{ id: 'B2', label: 'Bin 2' }] : [{ id: 'B1', label: 'Bin 1' }, { id: 'B2', label: 'Bin 2' }]; } });

    const wired = D.wire(host);
    await sleep(120);
    ok('③ [data-dep] select wire hua aur pehli load hui', wired === 1 && binSel.options.length >= 2,
      `wired=${wired} options=${binSel.options.length} loads=${JSON.stringify(loads)}`);

    /* value preserve: B2 dono lists mein hai */
    binSel.value = 'B2';
    let evt = 0; binSel.addEventListener('deps:change', () => evt++);
    loc.value = 'L2'; loc.dispatchEvent(new win.Event('change', { bubbles: true }));
    await sleep(150);
    ok('③ parent badla → child options badle', loads.indexOf('L2') > -1 && binSel.options.length === 2,
      `loads=${JSON.stringify(loads)} options=${binSel.options.length}`);
    ok('③ value PRESERVE (nayi list mein maujood thi)', binSel.value === 'B2', 'value=' + binSel.value);
    ok('③ deps:change event aya (tables/forms isse refresh kar sakte hain)', evt >= 1, 'events=' + evt);

    /* value manage: L1 par wahi B2 dobara; ab child clear test (B9) */
    D.define('t.bins2', { ttl: 0, fetch: async () => [{ id: 'B9', label: 'Bin 9' }] });
    const sel2 = doc.createElement('select');
    sel2.setAttribute('data-dep', 't.bins2'); sel2.setAttribute('data-dep-parent', 'locationId');
    host.appendChild(sel2);
    await D.bindSelect(sel2, 't.bins2', { parentField: 'locationId' });
    sel2.value = 'B2';
    await D.bindSelect(sel2, 't.bins2', { parentField: 'locationId' });
    ok('③ value CLEAR jab nayi list mein na ho (spec: "preserve or manage")', sel2.value === '',
      'value="' + sel2.value + '" · meta=' + JSON.stringify(sel2._deps || {}));
    host.remove();
  }

  /* ---------------- ④ conditional UI (data-when) ---------------- */
  {
    const host = doc.createElement('div');
    host.setAttribute('data-dep-scope', '');
    host.innerHTML =
      '<div data-field="provider"><select id="t_prov"><option value="">—</option>' +
      '<option value="GEMINI">GEMINI</option><option value="OPENROUTER">OPENROUTER</option></select></div>' +
      '<div data-when="provider=OPENROUTER" id="t_ep">endpoint</div>' +
      '<div data-when="!provider=GEMINI" id="t_key">key</div>';
    doc.body.appendChild(host);
    const prov = host.querySelector('#t_prov');
    const n = D.when(host);
    ok('④ do conditional sections evaluate huin', n === 2, 'when=' + n);
    const ep = host.querySelector('#t_ep'), keyEl = host.querySelector('#t_key');
    ok('④ shuru mein provider khali → OPENROUTER section hidden', ep.style.display === 'none' && ep.getAttribute('aria-hidden') === 'true');
    prov.value = 'OPENROUTER'; prov.dispatchEvent(new win.Event('change', { bubbles: true }));
    await sleep(60);
    ok('④ OPENROUTER chunne par section visible', ep.style.display !== 'none' && ep.getAttribute('aria-hidden') === 'false');
    prov.value = 'GEMINI'; prov.dispatchEvent(new win.Event('change', { bubbles: true }));
    await sleep(60);
    ok('④ GEMINI par OPENROUTER section wapas hidden (+ !GEMINI wala visible)',
      ep.style.display === 'none' && keyEl.style.display === 'none', 'ep=' + ep.style.display + ' key=' + keyEl.style.display);
    host.remove();
  }

  /* ═══════════ ⑦ W3.T2 — AI Setup: provider → model cascade (W3.T2) ═══════════
     Attachment A line 799-871: "Dropdowns and selection fields must drive the rest
     of the UI dynamically … reusable dependency/configuration system, not isolated
     hard-coded logic for each dropdown." Yahan rendered DOM par prove hota hai. */
  {
    /* API.call counter — action-wise */
    const calls = {};
    const origCall = win.API.call.bind(win.API);
    win.API.call = function (action, payload, opts) { calls[action] = (calls[action] || 0) + 1; return origCall(action, payload, opts); };
    const cardClick = txt => new Promise(async res => {
      const card = Array.from(doc.querySelectorAll('.ai-provc')).filter(x => new RegExp(txt, 'i').test(x.textContent))[0];
      if (card) { card.click(); await sleep(260); }
      res(!!card);
    });
    const modelSel = () => doc.querySelector('[aria-label="Model"]');
    const optVals = () => { const s2 = modelSel(); return s2 ? Array.from(s2.options).map(o => o.value) : []; };

    await win.App.go('ai'); await sleep(700);
    const setupTab = Array.from(doc.querySelectorAll('#view .tab')).filter(x => /Setup/.test(x.textContent))[0];
    if (setupTab) { setupTab.click(); await sleep(700); }
    const cardsN = doc.querySelectorAll('.ai-provc').length;
    ok('⑦ AI Setup render: provider cards + hidden provider field maujood',
      cardsN >= 4 && !!doc.getElementById('aiProvider'), 'cards=' + cardsN);

    /* Gemini (default provider) → model list usi provider ki */
    await cardClick('Gemini');
    const g1 = optVals();
    ok('⑦ GEMINI chuna → model options GEMINI ke (cascade kaam karta hai)', g1.length >= 3,
      'n=' + g1.length + ' first=' + g1[0]);

    /* OPENAI par switch → options bhi badlein (parent → child) */
    calls['ai.models.refresh'] = 0;
    await cardClick('OpenAI');
    const o1 = optVals();
    ok('⑦ OPENAI par switch → options badal gaye (koi GEMINI leakage nahi)',
      o1.length >= 2 && o1[0] !== g1[0] && !/^gemini/i.test(String(o1[0])),
      'n=' + o1.length + ' first=' + o1[0]);
    const refOpenai = calls['ai.models.refresh'] || 0;

    /* Wapas GEMINI → CACHE hit (0 nayi request) aur wahi list */
    const hitsBefore = D.stats().hits;
    await cardClick('Gemini');
    const g2 = optVals();
    ok('⑦ wapas GEMINI → 0 nayi request (per-provider cache) + wahi list',
      JSON.stringify(g2) === JSON.stringify(g1) && D.stats().hits > hitsBefore,
      'hits ' + hitsBefore + '→' + D.stats().hits + ' · refresh-calls OPENAI ke liye=' + refOpenai);

    /* Value preserve/manage: provider ke sath model value sahi provider ki rahe */
    const selNow = modelSel();
    if (selNow) { selNow.value = g2[1] || g2[0]; selNow.dispatchEvent(new win.Event('change', { bubbles: true })); await sleep(400); }
    await cardClick('OpenAI');
    const sel2 = modelSel();
    ok('⑦ provider badla → chuna hua GEMINI model select mein nahi rehta (manage/clear)',
      !!sel2 && !/^gemini/i.test(String(sel2.value)), 'value=' + (sel2 && sel2.value));
    ok('⑦ naye provider ka model select auto-select hua (khali nahi)', !!sel2 && String(sel2.value).length > 0,
      'value=' + (sel2 && sel2.value));

    /* [data-when] — provider-specific sections shared system se
       (v2.30.6: MOCK card ka label 'Local Data Assistant' hai — 'Mock' text
       card par nahi, is liye dono naam match karo) */
    await cardClick('Local Data|Mock');
    const mockKeyVis = (function () {
      const key = doc.querySelector('.ai-keyrow');
      if (!key) return 'absent';
      const sec = key.closest('[data-when]') || key.parentElement;
      return (sec && sec.style.display === 'none') ? 'hidden' : 'visible';
    })();
    ok('⑦ MOCK → API-key section shared [data-when] se hidden/absent (khali container nahi)',
      mockKeyVis === 'hidden' || mockKeyVis === 'absent', 'state=' + mockKeyVis);
    await cardClick('Gemini');
    const gemKeyVis = (function () {
      const key = doc.querySelector('.ai-keyrow');
      const sec = key && (key.closest('[data-when]') || key.parentElement);
      return sec ? sec.style.display !== 'none' : false;
    })();
    ok('⑦ GEMINI → key section visible (data-when dobara sahi evaluate hua)', gemKeyVis === true);

    /* SCOPE: stale/duplicate provider field (#view ke bahar) cascade ko hijack na kare */
    const stale = doc.createElement('input');
    stale.type = 'hidden'; stale.id = 'aiProvider'; stale.setAttribute('data-field', 'aiProvider'); stale.value = 'MOCK';
    doc.body.appendChild(stale);
    await cardClick('OpenAI');
    const o2 = optVals();
    ok('⑦ stale duplicate provider field (#view bahar) cascade hijack NAHI kar saka (data-dep-scope)',
      o2.length >= 2 && o2[0] === o1[0], 'n=' + o2.length + ' first=' + o2[0] + ' (expected ' + o1[0] + ')');
    stale.remove();

    /* Real screen ke [data-when] elements Deps ne evaluate kiye (dead attribute nahi) */
    const whenEls = Array.from(doc.querySelectorAll('#view [data-when]'));
    const evalCount = whenEls.filter(e => e.__depsWhen !== undefined).length;
    ok('⑦ AI screen ke [data-when] blocks shared system se EVALUATE hue (dead markup nahi)',
      whenEls.length >= 1 && evalCount === whenEls.length,
      'total=' + whenEls.length + ' evaluated=' + evalCount + ' val=' + whenEls.map(e => e.getAttribute('data-when')).join(','));

    const coreSrc = src('App_Core.html'), aiSrc = src('App_AIConfig.html');
    ok('⑦ source: AI config Deps par hai (define ai.models + data-dep + data-when + scope)',
      /Deps\.define\('ai\.models'/.test(aiSrc) && /'data-dep': 'ai\.models'/.test(aiSrc) &&
      /data-when/.test(aiSrc) && /data-dep-scope/.test(aiSrc) && /_scopeEl\(/.test(coreSrc));

    win.API.call = origCall;
  }

  /* ═════════ ⑧ W3.T3 — Shared accessors: repeated fetching khatam (v2.27.0) ═════════
     Spec line 889 "Look for": Repeated API calls / repeated data-fetching logic.
     Audit: customers.list 7 files, items.search 7 files, sales.list 5, suppliers.list 4. */
  {
    const calls = {};
    const origCall = win.API.call.bind(win.API);
    win.API.call = function (action, payload, opts) { calls[action] = (calls[action] || 0) + 1; return origCall(action, payload, opts); };
    const S = win.Shared;
    ok('⑧ Shared accessors load hue (window.Shared + list/customers/items/sales/invalidate)',
      !!S && typeof S.list === 'function' && typeof S.customers === 'function' && typeof S.invalidateFor === 'function');

    win.Deps.hardRefresh();
    calls['customers.list'] = 0;
    const a1 = await S.customers({ q: 'ali', limit: 4, withBalance: true });
    const a2 = await S.customers({ q: 'ali', limit: 4, withBalance: true });
    ok('⑧ wahi query dobara = 1 request (dono calls ka data same)',
      calls['customers.list'] === 1 && Array.isArray(a1) && Array.isArray(a2),
      'requests=' + calls['customers.list'] + ' rows=' + a1.length);

    const b1 = await S.customers({ q: 'bilal', limit: 4, withBalance: true });
    ok('⑧ nayi query = nayi request (cache sirf same key par)', calls['customers.list'] === 2,
      'requests=' + calls['customers.list'] + ' rows=' + b1.length);

    /* key sirf un cheezon par jalti hai jo result badalti hain */
    await S.customers({ q: 'ali', limit: 4, withBalance: true });
    ok('⑧ teeni dafa wahi query = phir bhi 2 requests (0 extra)', calls['customers.list'] === 2,
      'requests=' + calls['customers.list']);

    /* write → related cache invalidate (tables taaza) */
    const before = calls['customers.list'];
    S.invalidate('customers');
    await S.customers({ q: 'ali', limit: 4, withBalance: true });
    ok('⑧ invalidate(customers) ke baad nayi request aayi (write ke baad taaza data)',
      calls['customers.list'] === before + 1, 'before=' + before + ' after=' + calls['customers.list']);

    /* write action khud invalidate karta hai (API layer hook) */
    S.invalidate('customers');
    await S.customers({ q: 'ali', limit: 4, withBalance: true });
    const c0 = calls['customers.list'];
    try { await win.API.call('customers.save', { customer: { name: 'Gate Test', phone: '03000000000' } }); } catch (e) { }
    await S.customers({ q: 'ali', limit: 4, withBalance: true });
    ok('⑧ customers.save ke baad cache khud invalidate hui (manual call ki zaroorat nahi)',
      calls['customers.list'] === c0 + 1, 'before=' + c0 + ' after=' + calls['customers.list']);

    /* OFFLINE fallback cache NAHI hota (warna data aane par purana fallback chipka rehta) */
    calls['customers.list'] = 0;
    S.invalidate('customers');
    const off = () => ({ rows: [{ id: 'off1', name: 'Offline customer' }] });
    try { win.App.state.offline = true; } catch (e) { }
    const o1 = await S.customers({ q: 'zz', limit: 3, offline: off });
    const o2 = await S.customers({ q: 'zz', limit: 3, offline: off });
    try { win.App.state.offline = false; } catch (e) { }
    const o3 = await S.customers({ q: 'zz', limit: 3 });
    ok('⑧ offline fallback CACHE nahi hota — online hone par asli data aata hai',
      o1.length === 1 && o2.length === 1 && calls['customers.list'] >= 1 && o3.length !== undefined,
      'offline rows=' + o1.length + ' · online call hui=' + (calls['customers.list'] >= 1));

    /* source contract: modules ab shared accessor par (duplicate fetch khatam) */
    const files = ['App_POS.html', 'App_POS2.html', 'App_Demand.html', 'App_Orders.html', 'App_Boot.html', 'App_UI2.html'];
    const raw = {}, shared = {};
    files.forEach(f => {
      const t = src(f);
      raw[f] = (t.match(/API\.call\('(customers\.list|items\.search|sales\.list)'/g) || []).length;
      shared[f] = (t.match(/Shared\.(customers|items|sales)\(/g) || []).length;
    });
    const rawLeft = Object.keys(raw).reduce((n, k) => n + raw[k], 0);
    const sharedUsed = Object.keys(shared).reduce((n, k) => n + shared[k], 0);
    ok('⑧ 6 modules shared accessor par — duplicate customers/items/sales fetch ZERO',
      sharedUsed >= 10 && rawLeft === 0, 'shared=' + sharedUsed + ' · leftover-raw=' + rawLeft + ' ' + JSON.stringify(raw));

    const coreT = src('App_Core.html');
    /* batch-4: accounts.list / warehouse.list / warehouse.bins (Accounting + Inventory2 + Warehouse) */
    const files3 = ['App_Accounting.html', 'App_Inventory2.html', 'App_Warehouse.html'];
    const raw3 = {}, sh3 = {};
    files3.forEach(f => {
      const t = src(f);
      raw3[f] = (t.match(/API\.call\('(accounts\.list|warehouse\.list|warehouse\.bins)'/g) || []).length;
      sh3[f] = (t.match(/Shared\.raw\('(accounts\.list|warehouse\.list|warehouse\.bins)'/g) || []).length;
    });
    const raw3Left = files3.reduce((n, f) => n + raw3[f], 0);
    const sh3Used = files3.reduce((n, f) => n + sh3[f], 0);
    ok('⑧ batch-4: accounts/warehouse dropdowns bhi shared par — raw call ZERO',
      sh3Used >= 11 && raw3Left === 0, 'shared=' + sh3Used + ' leftover-raw=' + raw3Left + ' ' + JSON.stringify(raw3));

    /* behavioural: wahi warehouse.bins dobara = 1 request; aur write par khud invalidate */
    calls['warehouse.bins'] = 0;
    win.Deps.clearPrefix('shared:warehouse.bins');
    const wb1 = await S.raw('warehouse.bins', {}, { ttl: 180000 });
    const wb2 = await S.raw('warehouse.bins', {}, { ttl: 180000 });
    ok('⑧ warehouse.bins dobara = 1 request (Accounting/Inventory2/Warehouse ek hi cache)',
      calls['warehouse.bins'] === 1 && Array.isArray(wb1) && Array.isArray(wb2), 'requests=' + calls['warehouse.bins']);
    S.invalidateFor('warehouse.bins.save');
    await S.raw('warehouse.bins', {}, { ttl: 180000 });
    ok('⑧ warehouse bins save hone par cache khud saaf (dropdown taaza)', calls['warehouse.bins'] === 2,
      'requests=' + calls['warehouse.bins']);

    ok('⑧ source: Shared + write→invalidate map App_Core mein (ek jagah se sab)',
      /var Shared = \{/.test(coreT) && /_writeMap: \{/.test(coreT) && /Shared\.invalidateFor\(action\)/.test(coreT));

    /* ---- batch 2/3: suppliers + sales + salesman + dashboards + inventory ---- */
    const files2 = ['App_Dashboards.html', 'App_Print.html', 'App_Screens.html', 'App_Screens2.html',
      'App_Masters.html', 'App_Reorder.html', 'App_Inventory2.html', 'App_Salesman.html'];
    const raw2 = {}, sh2 = {};
    files2.forEach(f => {
      const t = src(f);
      raw2[f] = (t.match(/API\.call\('(customers|suppliers|items|sales)\.(list|search)'/g) || []).length;
      sh2[f] = (t.match(/Shared\.(customers|suppliers|items|sales|raw)\(/g) || []).length;
    });
    const raw2Left = Object.keys(raw2).reduce((n, k) => n + raw2[k], 0);
    const sh2Used = Object.keys(sh2).reduce((n, k) => n + sh2[k], 0);
    ok('⑧ batch-2/3: 8 aur modules shared par — raw customers/suppliers/items/sales fetch ZERO',
      sh2Used >= 10 && raw2Left === 0, 'shared=' + sh2Used + ' · leftover-raw=' + raw2Left + ' ' + JSON.stringify(raw2));

    /* smCall: shared routes Shared.raw se guzarte hain (warna har screen apna fetch) */
    const smT = src('App_Salesman.html');
    ok('⑧ Salesman ka smCall bhi shared routes par Shared.raw use karta hai',
      /SM_SHARED_ROUTES/.test(smT) && /Shared\.raw\(action/.test(smT) && /salesman\./.test(smT));

    /* envelope parity: Shared.raw ka envelope aur Shared.list ki rows EK hi request share karte hain */
    calls['customers.list'] = 0;
    win.Deps.clearPrefix('shared:customers.list');
    const envP = await S.raw('customers.list', { q: 'env', limit: 3, withBalance: true });
    const rowsP = await S.customers({ q: 'env', limit: 3, withBalance: true });
    ok('⑧ Shared.raw (envelope) aur Shared.customers (rows) = EK request, consistent data',
      calls['customers.list'] === 1 && Array.isArray(rowsP) && rowsP.length === ((envP && envP.rows) || []).length,
      'requests=' + calls['customers.list'] + ' envRows=' + ((envP && envP.rows) || []).length + ' listRows=' + rowsP.length);

    win.API.call = origCall;
  }

  /* ---------------- ⑤ source contracts ---------------- */
  {
    const core = src('App_Core.html');
    ok('⑤ Deps core App_Core.html mein hai + window par export',
      /var Deps = \{/.test(core) && /window\.Deps = Deps/.test(core));
    ok('⑤ Deps ke contract keys maujood (define/load/shared/bindSelect/when/wire/refresh/hardRefresh)',
      ['define', 'load', 'shared', 'bindSelect', 'when', 'wire', 'refresh', 'hardRefresh', 'reconcile']
        .every(k => new RegExp('\\b' + k + '(\\s*[:(])').test(core)));
    ok('⑤ kill-switch maujood (tests/SENS ke liye)', /_features: \{ on: true, cache: true \}/.test(core));
    ok('⑤ HTML bundle mein Deps aya (demo build)', /window\.Deps/.test(fs.readFileSync(path.join(ROOT, 'demo', 'index.html'), 'utf-8')));
  }

  /* ---------------- ⑥ page errors ---------------- */
  ok('⑥ zero page errors', errors.length === 0, errors.slice(0, 2).join(' | '));

  console.log('\n' + (fail === 0 ? '\x1b[32m' : '\x1b[31m') +
    'W3 DYN-DEPS GATE: ' + pass + ' pass / ' + fail + ' fail\x1b[0m');
  if (fail) console.log('  FAIL: ' + failures.join(' · '));
  process.exit(fail === 0 ? 0 : (SENS ? 0 : 1));
})();
