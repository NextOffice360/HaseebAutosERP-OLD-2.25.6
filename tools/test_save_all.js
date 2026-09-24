/**
 * tools/test_save_all.js — v2.30.0 gate (N1 + N2): Save / SAVE ALL ka asli behaviour
 * ============================================================================
 * User ka asli bug:
 *   "A=ON, B=OFF, C=ON the; ek toggle badla aur Save dabaya → pehle se ON wale
 *    settings OFF ho gaye."
 *
 * Ye gate usi ko pakarta hai — RENDERED DOM se (class/token se nahi):
 *   1. combination test: POS=ON, Inventory=ON, WhatsApp=OFF → WhatsApp ON →
 *      Save → POS/Inventory ON rahen, WhatsApp ON (UI + backend store dono)
 *   2. Save sirf DIRTY keys bhejta hai (backend store mein koi doosri key nahi badalti)
 *   3. unknown/legacy select value clobber nahi hoti (pehla option silently nahi chunte)
 *   4. hash/URL: page refresh ke baad wahi values dikhti hain jo save hui
 *   5. SAVE ALL: 2 mukhtalif sub-tabs ki tabdeeliyan ek click mein save
 *   6. SAVE ALL khali ho to saaf paighaam (kuch bheja nahi jata)
 *   7. duplicate submit block (save ke doran dobara click se doosri call nahi)
 *   8. unsaved changes par navigation warning
 *   9. zero page errors
 *
 *   node tools/test_save_all.js [file|http]      (~60s)
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

/** page-side: settings store (server) snapshot — sirf selected prefixes */
const snapshot = (prefixes) => {
  if (!window.__saveLog) window.__saveLog = [];
  const st = (window.App && App.state && App.state.settings) || {};
  const out = {};
  Object.keys(st).forEach(k => { if (!prefixes || prefixes.some(p => k.indexOf(p) === 0)) out[k] = String(st[k]); });
  return out;
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
  await sleep(1400);

  /* server-side ki asli values (demo mock ke SETTINGS store se) — yeh "DB" hai */
  const serverVals = () => page.evaluate(async () => {
    const s = await API.call('system.settings.get', {}, { noCache: true });
    const out = {};
    Object.keys(s).filter(k => /^(mod\.|comms\.|pos\.|inv\.)/.test(k)).forEach(k => { out[k] = String(s[k]); });
    return out;
  });

  /* save calls ki ginti (duplicate detection + payload size) */
  await page.evaluate(() => {
    window.__saveCalls = [];
    const oc = API.call.bind(API);
    API.call = function (a, p, o) {
      if (a === 'config.save') window.__saveCalls.push({ values: (p && p.values) || {} });
      return oc(a, p, o);
    };
  });

  /* helpers: settings keys DOM se badalna (structure-agnostic) */
  await page.evaluate(() => {
    window.__sw = (key) => document.querySelector('#view input[id="f_' + key + '"]');
    window.__toggle = (key) => { const el = window.__sw(key); if (!el) return null; el.click(); return el.checked; };
    /* sub-tab strip ke andar EXACT match (group list ke button se takrao na ho) */
    window.__openSub = (label) => {
      const strip = Array.from(document.querySelectorAll('#view .tabbar-l2 button, #view .tabbar-l2 .tab'));
      const t = strip.find(x => (x.textContent || '').trim().toLowerCase() === label.toLowerCase());
      if (!t) return false; t.click(); return true;
    };
    /* sub-tab ka apna Save (cfg-bar mein; 'Save all' nahi) */
    window.__saveSub = () => {
      const b = Array.from(document.querySelectorAll('#view .cfg-bar button, #view button'))
        .find(x => /^Save\b(?!\s*all)/i.test((x.textContent || '').trim()));
      if (!b) return false; b.click(); return true;
    };
    window.__saveAll = () => {
      const b = Array.from(document.querySelectorAll('#view button')).find(x => /^Save\s*all$/i.test((x.textContent || '').trim()));
      if (!b) return false; b.click(); return true;
    };
    window.__findSel = (key) => document.querySelector('#view select[id="f_' + key + '"]');
    window.__subLabel = () => (Array.from(document.querySelectorAll('#view .tabbar-l2 .tab.on'))[0] || {}).textContent || '';
  });

  await page.evaluate(() => {
    App.state.settings['mod.pos'] = 'true';
    App.state.settings['mod.inventory'] = 'true';
    App.state.settings['mod.reports'] = 'false';
    App.go('settings', { tab: 'modules' });
  });
  await sleep(1800);

  /* ================= 1) COMBINATION TEST (user ka exact case) ============ */
  console.log('\n1) POS=ON, Inventory=ON, Reports=OFF → Reports ON → Save');
  const base = await page.evaluate(async () => {
    await API.call('config.save', { values: { 'mod.pos': 'true', 'mod.inventory': 'true', 'mod.reports': 'false' } }, { noCache: true });
    window.__saveCalls = [];
    App.refresh();
    await new Promise(r => setTimeout(r, 1300));
    /* sub-tab ka pehla switch: POS */
    const opened = window.__openSub('Enable / disable modules');
    if (!opened) return { err: 'sub-tab nahi mila', subs: Array.from(document.querySelectorAll('#view .tabbar-l2 .tab')).map(x => x.textContent.trim()) };
    await new Promise(r => setTimeout(r, 500));
    return { posOn: !!(window.__sw('mod.pos') || {}).checked, invOn: !!(window.__sw('mod.inventory') || {}).checked, repOn: !!(window.__sw('mod.reports') || {}).checked };
  });
  ok(base.posOn === true && base.invOn === true && base.repOn === false,
    'DOM ne asli values dikhayin (A=ON, B=ON, C=OFF)', JSON.stringify(base));

  const toggled = await page.evaluate(() => window.__toggle('mod.reports'));
  ok(toggled === true, 'user ne C (Reports) ON kiya — DOM se', String(toggled));
  await sleep(300);
  const dirtyNow = await page.evaluate(() => UI2.dirtyPayload().keys);
  ok(dirtyNow.length === 1 && dirtyNow[0] === 'mod.reports', 'dirty tracking ne sirf badli hui key pakri', JSON.stringify(dirtyNow));

  const saveClick = await page.evaluate(async () => {
    window.__saveCalls = [];
    window.__saveSub();
    await new Promise(r => setTimeout(r, 1600));
    return window.__saveCalls.map(c => c.values);
  });
  const payloadKeys = saveClick[0] ? Object.keys(saveClick[0]) : [];
  ok(payloadKeys.length === 1 && payloadKeys[0] === 'mod.reports',
    'Save ne SIRF dirty key bheji (poora sub-tab nahi) — asli root-cause fix', 'payload=' + JSON.stringify(payloadKeys));
  const after1 = await serverVals();
  ok(after1['mod.pos'] === 'true' && after1['mod.inventory'] === 'true',
    'A aur B ON rahe — pehle se ON wale reset NAHI huin', JSON.stringify({ pos: after1['mod.pos'], inv: after1['mod.inventory'] }));
  ok(after1['mod.reports'] === 'true', 'C ON save ho gaya', after1['mod.reports']);
  const uiAfter = await page.evaluate(() => ({
    pos: !!(window.__sw('mod.pos') || {}).checked, inv: !!(window.__sw('mod.inventory') || {}).checked, rep: !!(window.__sw('mod.reports') || {}).checked
  }));
  ok(uiAfter.pos && uiAfter.inv && uiAfter.rep, 'UI par teeno wahi dikh rahe hain jo save hua', JSON.stringify(uiAfter));

  /* ================= 2) zero drift + refresh ============================ */
  console.log('\n2) refresh ke baad bilkul wahi values (aur zero drift)');
  const before2 = await serverVals();
  const noChange = await page.evaluate(async () => {
    window.__saveCalls = [];
    window.__saveSub();
    await new Promise(r => setTimeout(r, 900));
    return window.__saveCalls.length;
  });
  ok(noChange === 0, 'bina tabdeeli Save kuch bhejta hi nahi (0 calls)', 'calls=' + noChange);
  const after2 = await serverVals();
  ok(JSON.stringify(before2) === JSON.stringify(after2), 'server par zero drift (koi chupke se reset nahi)');
  const afterRefresh = await page.evaluate(async () => {
    App.refresh();
    await new Promise(r => setTimeout(r, 1400));
    window.__openSub('Enable / disable modules');
    await new Promise(r => setTimeout(r, 500));
    return { pos: !!(window.__sw('mod.pos') || {}).checked, inv: !!(window.__sw('mod.inventory') || {}).checked, rep: !!(window.__sw('mod.reports') || {}).checked };
  });
  ok(afterRefresh.pos && afterRefresh.inv && afterRefresh.rep, 'refresh ke baad bhi teeno ON (persisted)', JSON.stringify(afterRefresh));

  /* ================= 3) legacy/unknown select value ===================== */
  console.log('\n3) purani/unknown option wali value clobber nahi hoti');
  const legacy = await page.evaluate(async () => {
    await API.call('config.save', { values: { 'dt.format': 'LEGACY_MODE' } }, { noCache: true });
    App.go('settings', { tab: 'business' });
    await new Promise(r => setTimeout(r, 1500));
    window.__openSub('Localization');
    await new Promise(r => setTimeout(r, 900));
    const sel = window.__findSel('dt.format');
    const shown = sel ? sel.value : '(no select)';
    const hasLegacy = sel ? Array.from(sel.options).some(o => o.value === 'LEGACY_MODE') : false;
    window.__saveCalls = [];                               /* koi touch nahi — sirf Save */
    window.__saveSub();
    await new Promise(r => setTimeout(r, 1200));
    const srv = await API.call('system.settings.get', {}, { noCache: true });
    return { shown, hasLegacy, after: String(srv['dt.format']), calls: window.__saveCalls.length };
  });
  ok(legacy.shown === 'LEGACY_MODE' && legacy.hasLegacy,
    'unknown value dropdown mein MAHJOOZ dikhi (pehla option silently nahi chuna)', JSON.stringify(legacy));
  ok(legacy.after === 'LEGACY_MODE', 'Save ke baad bhi value mehfooz (silent overwrite khatam)', legacy.after);
  ok(legacy.calls === 0, 'bina tabdeeli koi save call nahi gayi', 'calls=' + legacy.calls);

  /* ================= 4) SAVE ALL (do sub-tabs ek sath) ================== */
  console.log('\n4) SAVE ALL — do mukhtalif sections ek click mein');
  const sa = await page.evaluate(async () => {
    App.go('settings', { tab: 'modules' });
    await new Promise(r => setTimeout(r, 1500));
    window.__openSub('Enable / disable modules');
    await new Promise(r => setTimeout(r, 500));
    /* section 1: ek switch OFF karo (mod.reports ko off) */
    const swOff = window.__toggle('mod.reports');
    /* section 2: dusra sub-tab kholo aur wahan ek switch badlo */
    window.__openSub('Navigation');
    await new Promise(r => setTimeout(r, 900));
    const cb = Array.from(document.querySelectorAll('#view input[type=checkbox]'));
    let key2 = '';
    let val2 = null;
    if (cb.length) { const el = cb[0]; el.click(); key2 = (el.id || '').replace(/^f_/, ''); val2 = el.checked ? 'true' : 'false'; }
    const dirty = UI2.dirtyPayload();
    window.__saveCalls = [];
    window.__saveAll();
    await new Promise(r => setTimeout(r, 1800));
    const srv = await API.call('system.settings.get', {}, { noCache: true });
    return { ok: true, swOff: swOff, key2: key2, val2: val2, dirty: dirty.keys, calls: window.__saveCalls.map(c => Object.keys(c.values)), srv: srv };
  });
  ok(sa.dirty.length >= 2, 'SAVE ALL ne 2+ dirty sections pakre (do sub-tabs)', JSON.stringify(sa.dirty));
  ok(sa.calls.length === 1, 'ek hi save call (controlled sequence, duplicate nahi)', 'calls=' + JSON.stringify(sa.calls));
  ok(String(sa.srv['mod.reports']) === 'false', 'section 1 ki tabdeeli save hui (reports off)', String(sa.srv['mod.reports']));
  ok(!sa.key2 || String(sa.srv[sa.key2]) === sa.val2, 'doosre sub-tab ki tabdeeli bhi save hui (stash wapas laga)', sa.key2 + '=' + String(sa.srv[sa.key2]) + ' (expected ' + sa.val2 + ')');
  const dirtyAfter = await page.evaluate(() => UI2.dirtyPayload().count);
  ok(dirtyAfter === 0, 'save ke baad dirty state clear', 'dirty=' + dirtyAfter);

  /* ================= 5) SAVE ALL khali ================================ */
  console.log('\n5) SAVE ALL — kuch dirty na ho to saaf paighaam');
  const empty = await page.evaluate(async () => {
    window.__saveCalls = [];
    window.__saveAll();
    await new Promise(r => setTimeout(r, 900));
    return { calls: window.__saveCalls.length, toast: ((document.querySelector('#toastRoot') || {}).textContent || '').slice(0, 80) };
  });
  ok(empty.calls === 0, 'khali SAVE ALL par koi save call nahi', 'calls=' + empty.calls);
  ok(/unsaved|mehfooz|tabdeeli/i.test(empty.toast), 'user ko wazeh paighaam mila', empty.toast);

  /* ================= 6) duplicate submit block ========================= */
  console.log('\n6) duplicate submit block');
  const dup = await page.evaluate(async () => {
    window.__openSub('Enable / disable modules');
    await new Promise(r => setTimeout(r, 500));
    window.__toggle('mod.reports');                       /* dirty karo */
    const origRun = UI.run.bind(UI);
    window.__runs = [];
    UI.run = function (el, fn, opts) { window.__runs.push(((el && el.textContent) || '').trim().slice(0, 24)); return origRun(el, fn, opts); };
    const oc = API.call.bind(API);
    API.call = function (a, p, o) {
      if (a === 'config.save') { window.__saveCalls.push({ v: Object.keys((p && p.values) || {}) }); return new Promise(res => setTimeout(() => oc(a, p, o).then(res, res), 400)); }
      return oc(a, p, o);
    };
    window.__saveCalls = [];
    const btn = Array.from(document.querySelectorAll('#view button')).find(x => /^Save all$/i.test(x.textContent.trim()));
    btn.click(); btn.click(); btn.click();                     /* 3 quick clicks */
    await new Promise(r => setTimeout(r, 2200));
    API.call = oc; UI.run = origRun;
    return { calls: window.__saveCalls.length, runs: window.__runs.filter(x => /Save all/i.test(x)).length };
  });
  ok(dup.runs === 1, '3 quick clicks par SAVE ALL handler sirf 1 baar chala (duplicate submissions blocked)',
    'handler-runs=' + dup.runs + ' save-calls=' + dup.calls);

  /* ================= 7) navigation warning ============================= */
  console.log('\n7) unsaved changes par navigation warning');
  const nav = await page.evaluate(async () => {
    window.__openSub('Enable / disable modules');
    await new Promise(r => setTimeout(r, 500));
    window.__toggle('mod.reports');                      /* dirty */
    await new Promise(r => setTimeout(r, 200));
    App.go('dashboard');                                 /* bina save chale jao */
    await new Promise(r => setTimeout(r, 600));
    const modal = document.querySelector('.modal2');
    return { open: !!modal, text: modal ? modal.innerText.slice(0, 90) : '', stillSettings: App.current };
  });
  ok(nav.open && /unsaved|tabdeeli/i.test(nav.text), 'nav se pehle warning aayi (unsaved changes)', JSON.stringify(nav));
  ok(nav.stillSettings === 'settings', 'nav roka gaya jab tak user jawab na de', nav.stillSettings);
  await page.evaluate(() => { const x = document.querySelector('.modal2 .oc-x'); if (x) x.click(); });
  await sleep(400);

  /* ================= 8) zero page errors ============================== */
  ok(errs.length === 0, 'zero page errors', errs.slice(0, 3).join(' | '));

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  SAVE / SAVE ALL   PASS: ${pass}   FAIL: ${fail}`);
  ERR.forEach(e => console.log('   ' + e));
  console.log('═══════════════════════════════════════════════════════════');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
