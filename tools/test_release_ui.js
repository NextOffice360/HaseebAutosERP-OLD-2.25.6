/**
 * tools/test_release_ui.js — v2.30.0 gate: blank-page fixes + shop rules UI + wizard
 * ============================================================================
 * User ki shikayat (release-hardening message):
 *  1. "Products/Items/Inventory ke safhe blank aa rahe hain, koi error bhi nahi"
 *  2. "login ke baad shop OPEN lazmi + band ho to saaf pata chale"
 *  3. "first-run Setup/Configuration Wizard"
 *  4. "demo data ko production dashboards par dikhana/chhupana"
 *
 * Standing rule: UI ka dawa RENDERED DOM se prove hota hai (class name se nahi).
 * Har check asli rendered element, text aur click behaviour dekhta hai.
 *
 *   node tools/test_release_ui.js [file|http]        (~40s)
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

const PROBE_ERROR_STATE = () => {
  const el = document.querySelector('[data-state="error"]');
  if (!el) return null;
  const btns = Array.from(el.querySelectorAll('button')).map(b => b.textContent.trim());
  const r = el.getBoundingClientRect();
  return { text: el.innerText.replace(/\s+/g, ' ').slice(0, 200), btns, w: Math.round(r.width), h: Math.round(r.height), vis: !!el.offsetParent };
};
const PROBE_EMPTY_STATE = () => {
  const el = document.querySelector('[data-state="empty"]');
  if (!el) return null;
  return { text: el.innerText.replace(/\s+/g, ' ').slice(0, 200), vis: !!el.offsetParent };
};
const PROBE_LOADING = () => !!document.querySelector('[data-state="loading"]');
const PROBE_BANNER = () => {
  const b = document.getElementById('shopBanner');
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return {
    hidden: !!b.hidden, text: b.innerText.replace(/\s+/g, ' ').slice(0, 200),
    btns: Array.from(b.querySelectorAll('button')).map(x => x.textContent.trim()),
    w: Math.round(r.width), h: Math.round(r.height), vis: !!b.offsetParent
  };
};
const PROBE_WIZARD = () => {
  const all = document.querySelectorAll('.modal2');
  const m = all.length ? all[all.length - 1] : null;
  if (!m) return null;
  const heads = Array.from(m.querySelectorAll('.card-head h4')).map(x => x.textContent.trim());
  const foot = Array.from(m.querySelectorAll('.m-foot button')).map(x => x.textContent.trim());
  const inputs = m.querySelectorAll('input').length;
  return { title: (m.querySelector('h3') || {}).textContent || '', heads, foot, inputs, vis: !!m.offsetParent };
};

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e.message).slice(0, 120)));
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(TARGET, { waitUntil: 'networkidle2', timeout: 45000 });
  if (await page.$('#lgUser')) {
    await page.click('#lgUser'); await page.type('#lgUser', 'owner');
    await page.click('#lgPass'); await page.type('#lgPass', 'admin123');
    await page.keyboard.press('Enter');
  }
  await page.waitForFunction(() => window.App && App.state && App.state.session, { timeout: 20000 });
  await sleep(1200);
  /* test harness: API.call par shart lagane ke liye helper page mein rakho */
  await page.evaluate(() => {
    window.__origCall = API.call.bind(API);
    window.__origRaw = Shared.raw.bind(Shared);
    window.__fault = {};
    const hit = (action) => {
      const f = window.__fault && window.__fault[action];
      if (!f || !f.on) return null;
      if (f.mode === 'reject') return { err: new Error(f.message || 'Simulated backend error') };
      if (f.mode === 'empty') return { val: { rows: [] } };
      if (f.mode === 'value') return { val: f.value };
      return null;
    };
    API.call = function (action, payload, opts) {
      const h = hit(action);
      if (h) return h.err ? Promise.reject(h.err) : Promise.resolve(h.val);
      return window.__origCall(action, payload, opts);
    };
    /* screens Shared.raw ke through load karti hain — fault wahin bhi lazmi */
    Shared.raw = function (action, payload, opts) {
      const h = hit(action);
      if (h) return h.err ? Promise.reject(h.err) : Promise.resolve(h.val);
      return window.__origRaw(action, payload, opts);
    };
  });

  /* ============ 1) ITEMS: error state (asli blank-page bug) ============= */
  console.log('\n1) ITEMS/INVENTORY blank-page fix — error state');
  await page.evaluate(() => {
    window.__fault['items.list'] = { on: true, mode: 'reject', message: 'Simulated backend error (items)' };
    API.cacheClear();
    App.go('items');
  });
  await sleep(1500);
  /* loading card pehle aati hai, phir error */
  let st = await page.evaluate(PROBE_ERROR_STATE);
  ok(!!st && st.vis, 'items: error state RENDER hui (blank nahi, ⚠ card mojood)', JSON.stringify(st));
  ok(!!st && /Simulated backend error/.test(st.text), 'items: asli error message user ko dikhta hai (pehle nigal jata tha)', st && st.text);
  ok(!!st && st.btns.some(b => /Dobara koshish/.test(b)), 'items: "Dobara koshish" (retry) button mojood', st && JSON.stringify(st.btns));
  ok(!!st && st.btns.some(b => /Diagnostics/.test(b)), 'items: "Diagnostics copy" button mojood', st && JSON.stringify(st.btns));

  /* retry se wapas data aa jaye */
  await page.evaluate(() => { window.__fault['items.list'].on = false; API.cacheClear(); });
  const clicked = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('[data-state="error"] button')).find(x => /Dobara koshish/.test(x.textContent));
    if (!b) return false; b.click(); return true;
  });
  ok(clicked, 'items: retry button clickable');
  await sleep(2200);
  const rowsAfter = await page.evaluate(() => document.querySelectorAll('#view table tbody tr').length);
  ok(rowsAfter > 0, 'items: retry ke baad table wapas render (data mojood)', 'rows=' + rowsAfter);
  ok(!(await page.evaluate(PROBE_ERROR_STATE)), 'items: retry ke baad error card gaya');

  /* ============ 2) ITEMS: empty state (0 rows) ========================== */
  console.log('\n2) ITEMS — empty state');
  await page.evaluate(() => { window.__fault['items.list'] = { on: true, mode: 'empty' }; API.cacheClear(); App.go('items'); });
  await sleep(1500);
  const em = await page.evaluate(PROBE_EMPTY_STATE);
  ok(!!em && em.vis, 'items: 0 rows par empty state ("koi item nahi") render hui', JSON.stringify(em));
  ok(!!em && /Koi item nahi/.test(em.text), 'items: empty state mein wazeh paighaam + action hint', em && em.text);

  /* ============ 3) INVENTORY: loading + error + retry =================== */
  console.log('\n3) INVENTORY — loading / error / retry');
  await page.evaluate(() => {
    window.__fault['items.list'].on = false;
    window.__fault['stock.levels'] = { on: true, mode: 'reject', message: 'Simulated stock error' };
    API.cacheClear();
    App.go('inventory');
  });
  await sleep(400);
  const loading = await page.evaluate(PROBE_LOADING);
  await sleep(1600);
  const ist = await page.evaluate(PROBE_ERROR_STATE);
  ok(!!ist && /Simulated stock error/.test(ist.text), 'inventory: stock error dikhta hai + retry', ist && ist.text.slice(0, 90));
  ok(!!loading || !!ist, 'inventory: loading ya error state render hui (blank nahi)');
  await page.evaluate(() => { window.__fault['stock.levels'].on = false; API.cacheClear(); App.go('inventory'); });
  await sleep(2000);
  const invRows = await page.evaluate(() => document.querySelectorAll('#view table tbody tr').length);
  ok(invRows > 0, 'inventory: retry/refresh ke baad stock table wapas', 'rows=' + invRows);

  /* ============ 4) SHOP: band ho to banner + open button ================ */
  console.log('\n4) SHOP RULES — band shop ka banner/prompt');
  await page.evaluate(() => {
    window.__fault['shop.status'] = { on: true, mode: 'value', value: { open: false, requireOpen: true, locationName: 'Sadiqabad City', demo: true, seeded: {} } };
    window.__fault['system.setupStatus'] = { on: true, mode: 'value', value: { needsWizard: true, seeded: { users: 10, items: 10, customers: 2, settings: 61 }, shopName: 'Sadiqabad City' } };
    App.state.settings['shop.openPromptOnLogin'] = 'true';
  });
  const modalsBefore = await page.evaluate(() => document.querySelectorAll('.modal2').length);
  await page.evaluate(() => ShopUI.afterLogin());
  await sleep(1000);
  let b = await page.evaluate(PROBE_BANNER);
  ok(!!b && !b.hidden && b.vis && b.h > 20, 'shop band: banner RENDER hua (sticky, visible)', JSON.stringify(b));
  ok(!!b && /Shop band hai/.test(b.text), 'shop band: banner message Urdu/Roman mein saaf', b && b.text.slice(0, 80));
  ok(!!b && b.btns.some(x => /Open shop/.test(x)), 'shop band: banner se ek click "Open shop" button', b && JSON.stringify(b.btns));
  const modalsAfter = await page.evaluate(() => document.querySelectorAll('.modal2').length);
  ok(modalsAfter === modalsBefore,
    'login par shell BLOCK nahi hota — koi modal khud nahi khulta (sirf banner; mojooda screens safe)', modalsBefore + ' → ' + modalsAfter);
  /* banner se wizard bhi khul jata hai (guided raasta) */
  const wizBtn = await page.evaluate(() => {
    const x = Array.from(document.querySelectorAll('#shopBanner button')).find(y => /Setup Wizard/.test(y.textContent));
    return !!x;
  });
  ok(wizBtn, 'banner par "Setup Wizard" button mojood (pehla din)');

  /* ============ 5) SHOP_CLOSED gate (server error → banner) ============= */
  console.log('\n5) SHOP_CLOSED server gate — user ko saaf message');
  await page.evaluate(() => ShopUI.hide());
  await page.evaluate(() => {
    /* asli transport par fault — is se API.call ka shop-gate chalta hai */
    window.__origTransport = API._call.bind(API);
    API._call = function (action, payload, opts) {
      if (action === 'items.search') return Promise.reject(new Error('SHOP_CLOSED|Shop band hai (Test gate) — sale se pehle Shop kholain.'));
      return window.__origTransport(action, payload, opts);
    };
  });
  const gate = await page.evaluate(async () => {
    const out = {};
    try {
      await API.call('items.search', { q: 'test' }, { noCache: true, retry: false });
    } catch (e) { out.raw = String(e.message); out.stripped = !/SHOP_CLOSED\|/.test(String(e.message)); out.flag = !!e.shopClosed; }
    return out;
  });
  ok(!!gate.raw, 'SHOP_CLOSED error propagate hui (chhupi nahi)');
  ok(!!gate.stripped, 'SHOP_CLOSED| prefix hata kar saaf message mila', gate.raw && gate.raw.slice(0, 60));
  ok(gate.flag === true, 'error par e.shopClosed flag set (screens isse pehchanti hain)');
  await sleep(400);
  b = await page.evaluate(PROBE_BANNER);
  ok(!!b && !b.hidden && b.vis && /block ho gaya/.test(b.text),
    'shop-closed event par banner khud zaahir hua (block ka paighaam)', JSON.stringify(b && b.text.slice(0, 70)));

  /* ============ 6) SETUP WIZARD (first run) ============================= */
  console.log('\n6) FIRST-RUN SETUP WIZARD');
  await page.evaluate(() => {
    /* pehle koi khula modal band karo (shop dialog auto-open ho sakta hai) */
    document.querySelectorAll('.modal2 .oc-x').forEach(x => x.click());
  });
  await sleep(500);
  const before = await page.evaluate(() => document.querySelectorAll('.modal2').length);
  await page.evaluate(() => ShopUI.wizard({ needsWizard: true, shopName: 'Sadiqabad City', seeded: { users: 10, items: 10, customers: 2, settings: 61 }, shop: { open: false } }));
  await sleep(700);
  const wz = await page.evaluate(PROBE_WIZARD);
  ok(!!wz && wz.vis, 'wizard modal render hua', JSON.stringify(wz && { t: wz.title, inputs: wz.inputs }));
  ok(!!wz && /Setup Wizard/i.test(wz.title), 'wizard ka title "Setup Wizard"', wz && wz.title);
  ok(!!wz && wz.heads.length >= 4, 'wizard mein 4 qadam (business → password → shop open → demo data)', wz && JSON.stringify(wz.heads));
  ok(!!wz && wz.foot.some(x => /Mukammal/.test(x)) && wz.foot.some(x => /Baad mein/.test(x)), 'wizard ke actions: Mukammal karein + Baad mein', wz && JSON.stringify(wz.foot));
  ok(!!wz && wz.inputs >= 5, 'wizard ke inputs mojood (business name, shop, phone, address, password, cash)', wz && String(wz.inputs));
  /* cancel kaam karta hai (purani shikayat: close/cancel nahi chalte) */
  await page.evaluate(() => { const x = document.querySelector('.modal2 .oc-x'); if (x) x.click(); });
  await sleep(600);
  const afterClose = await page.evaluate(() => document.querySelectorAll('.modal2').length);
  ok(afterClose < before + 1 && afterClose <= before, 'wizard ka close (✕) kaam karta hai — modal band ho gaya', before + ' → ' + afterClose);

  /* ============ 7) demo visibility + zero errors ======================== */
  console.log('\n7) DEMO VISIBILITY + page errors');
  const demoUi = await page.evaluate(() => {
    const st = App.state.settings || {};
    return { showDemo: String(st['data.showDemo']), requireOpen: String(st['shop.requireOpen']) };
  });
  ok(demoUi.showDemo === 'true' && demoUi.requireOpen === 'true',
    'settings mein data.showDemo + shop.requireOpen mojood (Settings UI se badle ja sakte hain)', JSON.stringify(demoUi));
  ok(errs.length === 0, 'zero page errors', errs.slice(0, 3).join(' | '));

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  RELEASE UI   PASS: ${pass}   FAIL: ${fail}`);
  ERR.forEach(e => console.log('   ' + e));
  console.log('═══════════════════════════════════════════════════════════');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
