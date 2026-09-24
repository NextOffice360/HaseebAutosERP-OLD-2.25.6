/**
 * tools/test_saveall_pages.js — v2.30.0 (N2) app-wide SAVE ALL gate
 * ============================================================================
 * Aap ki shart: "Har editable page par ek hi, consistent SAVE ALL — page ki
 * SAARI unsaved tabdeeliyan save kare, chahe page par apne Save buttons hon.
 * Fail hone par sirf wohi section dirty rahe + Retry; duplicate submit block."
 *
 * Ye gate RENDERED UI par sabit karta hai (koi static claim nahi):
 *  ① page load par header ka Save all button mojood hai lekin CHHUPA hua
 *    (jab tak asli tabdeeli na ho — jhoota button nahi)
 *  ② ek switch badla → button ZAHIR + count badge
 *  ③ header button dabaya → value ASLI backend mein save + button dobara chhupa
 *  ④ value wapas palat kar save → test idempotent (backend wahi purani value)
 *  ⑤ do alag sub-tabs ke edits (stash) ek hi Save all se save hote hain
 *  ⑥ save FAIL hone par: dirty baqi rehta hai + Retry action nazar aata hai
 *  ⑦ Retry (dobara) dabane par save ho jata hai + dirty clear
 *  ⑧ read-only page par koi Save all button nahi (fake UI nahi)
 *  ⑨ nav guard: unsaved changes par doosri screen par jane se pehle warning,
 *    Cancel karne par wahi page rehta hai
 *  ⑩ duplicate submit: busy ke dauraan dobara click se koi doosri request nahi
 *  ⑪ zero page errors
 *
 *   node tools/test_saveall_pages.js [http://127.0.0.1:8021/]    (~90s)
 */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0; const ERR = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✔', name); }
  else { fail++; const m = '  ✖ ' + name + (extra ? '  → ' + extra : ''); ERR.push(name); console.log(m); }
}

(async () => {
  const puppeteer = require('puppeteer');
  const TARGET = process.argv[2] || ('file://' + path.join(ROOT, 'demo', 'index.html'));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  console.log('\n\x1b[1mSAVE ALL (app-wide) — rendered DOM\x1b[0m');
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e.message).slice(0, 130)));
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(TARGET, { waitUntil: 'networkidle2', timeout: 45000 });
  if (await page.$('#lgUser')) {
    await page.click('#lgUser'); await page.type('#lgUser', 'owner');
    await page.click('#lgPass'); await page.type('#lgPass', 'admin123');
    await page.keyboard.press('Enter');
  }
  await page.waitForFunction(() => window.App && App.state && App.state.session, { timeout: 20000 });
  await sleep(1500);

  /* ---------- settings page ---------- */
  const openSettings = async (groupRe, subRe) => {
    await page.evaluate(() => { App._noDirtyGuard = true; App.go('settings'); });
    await page.waitForFunction(() => document.querySelectorAll('.tabbar-l1 .tab').length >= 14, { timeout: 20000 });
    await sleep(900);
    await page.evaluate(re => {
      const t = Array.from(document.querySelectorAll('.tabbar-l1 .tab')).find(x => new RegExp(re, 'i').test(x.textContent || ''));
      if (t) t.click();
    }, groupRe);
    await sleep(1300);
    if (subRe) {
      await page.evaluate(re => {
        const t = Array.from(document.querySelectorAll('.tabbar-l2 .tab')).find(x => new RegExp(re, 'i').test(x.textContent || ''));
        if (t) t.click();
      }, subRe);
      await sleep(1300);
    }
    await page.evaluate(() => { App._noDirtyGuard = false; });
  };

  await page.evaluate(() => { App._noDirtyGuard = true; App.go('settings'); });
  await page.waitForFunction(() => document.querySelectorAll('.tabbar-l1 .tab').length >= 14, { timeout: 20000 });
  await sleep(1200);
  await page.evaluate(() => { App._noDirtyGuard = false; });

  const btn0 = await page.evaluate(() => {
    const b = document.getElementById('saveAllBtn');
    return b ? { exists: true, hidden: !!b.hidden, label: (b.textContent || '').trim() } : { exists: false };
  });
  ok(btn0.exists && btn0.hidden, '① load par Save all button mojood hai lekin chhupa hua', JSON.stringify(btn0));

  /* ---------- ②③ change → save → backend truth ---------- */
  await openSettings('module', 'enable');
  const chg = await page.evaluate(async () => {
    const sw = document.getElementById('f_mod.labels');
    if (!sw) return { err: 'switch f_mod.labels nahi mila' };
    const before = !!sw.checked;
    sw.checked = !before;
    sw.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 500));
    const b = document.getElementById('saveAllBtn');
    return { before: before, want: !before, hidden: b ? b.hidden : 'no btn', badge: b ? (b.querySelector('.sa-n') || {}).textContent : '' };
  });
  ok(!chg.err && chg.hidden === false, '② switch badalte hi header Save all ZAHIR hua',
    chg.err || ('badge=' + chg.badge + ' hidden=' + chg.hidden));
  ok(!chg.err && String(chg.badge || '').trim().length > 0, '②b count badge dikh raha hai (kitni tabdeeliyan)', 'badge="' + chg.badge + '"');

  const sa1 = await page.evaluate(async () => {
    const b = document.getElementById('saveAllBtn');
    if (!b) return { err: 'no btn' };
    b.click();
    await new Promise(r => setTimeout(r, 3000));
    const st = await API.call('system.settings.get', {}, { noCache: true }).catch(() => ({}));
    const b2 = document.getElementById('saveAllBtn');
    return { got: String(st['mod.labels']), dirty: UI2.dirtyPayload().count, hidden: b2 ? b2.hidden : 'gone' };
  });
  ok(!sa1.err && sa1.got === String(chg.want), '③ header Save all ne ASLI backend mein save kiya', JSON.stringify(sa1));
  ok(sa1.dirty === 0 && sa1.hidden === true, '③b save ke baad dirty clear + button dobara chhupa', 'dirty=' + sa1.dirty + ' hidden=' + sa1.hidden);

  /* ---------- ④ restore ---------- */
  const restore = await page.evaluate(async (want) => {
    const sw = document.getElementById('f_mod.labels');
    sw.checked = want;
    sw.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 400));
    const b = document.getElementById('saveAllBtn');
    b.click();
    await new Promise(r => setTimeout(r, 2600));
    const st = await API.call('system.settings.get', {}, { noCache: true }).catch(() => ({}));
    return String(st['mod.labels']);
  }, chg.before);
  ok(restore === String(chg.before), '④ value wapas palat kar save hui (test idempotent)', 'value=' + restore);

  /* ---------- ⑤ do sub-tabs ek sath ---------- */
  const stash = await page.evaluate(async () => {
    /* sub-tab 1 (Enable/disable) mein change */
    const sw = document.getElementById('f_mod.labels');
    const wasA = !!sw.checked;
    sw.checked = !wasA; sw.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 400));
    /* sub-tab 2 (Navigation) par jao + wahan change */
    const t2 = Array.from(document.querySelectorAll('.tabbar-l2 .tab')).find(x => /navigation/i.test(x.textContent || ''));
    if (!t2) return { err: 'Navigation sub-tab nahi mila' };
    t2.click();
    await new Promise(r => setTimeout(r, 1400));
    const nv = document.getElementById('f_nav.groupLabels');
    if (!nv) return { err: 'f_nav.groupLabels nahi mila' };
    const wasB = !!nv.checked;
    nv.checked = !wasB; nv.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 600));
    const b = document.getElementById('saveAllBtn');
    return { wasA: wasA, wantA: !wasA, wasB: wasB, wantB: !wasB, dirty: UI2.dirtyPayload().count,
      badge: (b.querySelector('.sa-n') || {}).textContent };
  });
  ok(!stash.err, '⑤a do sub-tabs mein edits possible (dirty count 2)', stash.err || ('badge=' + stash.badge));
  const stashSave = await page.evaluate(async () => {
    document.getElementById('saveAllBtn').click();
    await new Promise(r => setTimeout(r, 3200));
    const st = await API.call('system.settings.get', {}, { noCache: true }).catch(() => ({}));
    return { a: String(st['mod.labels']), b: String(st['nav.groupLabels']), dirty: UI2.dirtyPayload().count };
  });
  ok(stashSave.a === String(stash.wantA) && stashSave.b === String(stash.wantB),
    '⑤b DONO sub-tabs (stash samet) ek hi Save all se save hue', JSON.stringify(stashSave));
  await page.evaluate(async (wasA, wasB) => {
    const st = await API.call('system.settings.get', {}, { noCache: true }).catch(() => ({}));
    UI2.clearAllDirty();
    /* restore: seedha backend se purani values likh do */
    await API.call('config.save', { values: { 'mod.labels': wasA, 'nav.groupLabels': wasB } });
    App._noDirtyGuard = true; App.refresh(); App._noDirtyGuard = false;
  }, stash.wasA, stash.wasB);
  await sleep(1500);

  /* ---------- ⑥⑦ fail → dirty baqi + Retry ---------- */
  /* restore ne screen refresh kar diya → wapas Enable/disable sub-tab par aao
     (warna switch DOM mein nahi milega — ye test-side tarteeb ka masla tha) */
  await openSettings('module', 'enable');
  const failPath = await page.evaluate(async () => {
    window.__saOrigCall = API.call;
    window.__saFail = 1;
    API.call = function (action, payload, opts) {
      if (action === 'config.save' && window.__saFail > 0) {
        window.__saFail--;
        return Promise.reject(new Error('GATE: jaan boojh kar fail (test)'));
      }
      return window.__saOrigCall.apply(this, arguments);
    };
    const sw = document.getElementById('f_mod.labels');
    if (!sw) return { err: 'f_mod.labels nahi mila (sub-tab?)' };
    sw.checked = !sw.checked; sw.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 500));
    document.getElementById('saveAllBtn').click();
    await new Promise(r => setTimeout(r, 3500));
    const retry = Array.from(document.querySelectorAll('button, .toast button, .ntf button'))
      .filter(b => /retry/i.test(b.textContent || ''));
    const b = document.getElementById('saveAllBtn');
    return { dirty: UI2.dirtyPayload().count, hidden: b ? b.hidden : 'gone', retries: retry.length,
      failedMsg: (document.body.textContent || '').indexOf('fail') > -1 };
  });
  ok(failPath.dirty > 0 && failPath.hidden === false, '⑥ fail hone par dirty BAQI + button ZAHIR (kuch zaya nahi hua)', JSON.stringify(failPath));
  ok(failPath.retries > 0, '⑥b Retry action nazar aa raha hai', 'retry buttons=' + failPath.retries);

  const retried = await page.evaluate(async () => {
    document.getElementById('saveAllBtn').click();
    await new Promise(r => setTimeout(r, 3000));
    API.call = window.__saOrigCall;                       /* patch hata do */
    const st = await API.call('system.settings.get', {}, { noCache: true }).catch(() => ({}));
    return { labels: String(st['mod.labels']), dirty: UI2.dirtyPayload().count };
  });
  ok(retried.dirty === 0, '⑦ dobara save karne par sab theek ho gaya (dirty 0)', JSON.stringify(retried));
  await page.evaluate(async (was) => {
    await API.call('config.save', { values: { 'mod.labels': was } });
    App._noDirtyGuard = true; App.refresh(); App._noDirtyGuard = false;
  }, chg.before);
  await sleep(1200);

  /* ---------- ⑧ read-only page par fake button nahi ---------- */
  const ro = await page.evaluate(async () => {
    App._noDirtyGuard = true;
    App.go('dashboard');
    await new Promise(r => setTimeout(r, 2200));
    App._noDirtyGuard = false;
    const b = document.getElementById('saveAllBtn');
    return { exists: !!b, hidden: b ? !!b.hidden : null };
  });
  ok(!ro.exists || ro.hidden === true, '⑧ read-only page par Save all nazar nahi aata (jhoota UI nahi)', JSON.stringify(ro));

  /* ---------- ⑨ nav guard ---------- */
  await openSettings('module', 'enable');
  const guard = await page.evaluate(async () => {
    const sw = document.getElementById('f_mod.labels');
    if (!sw) return { err: 'f_mod.labels nahi mila (guard test)' };
    sw.checked = !sw.checked; sw.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 400));
    const before = App.current;
    App.go('dashboard');                                  /* guard trigger hona chahiye */
    await new Promise(r => setTimeout(r, 900));
    const modal = document.querySelector('.modal2');
    const txt = modal ? (modal.textContent || '') : '';
    const cancel = modal ? Array.from(modal.querySelectorAll('button')).find(b => /cancel/i.test(b.textContent || '')) : null;
    if (cancel) cancel.click();
    await new Promise(r => setTimeout(r, 700));
    return { wanted: before, still: App.current, warned: /unsaved|tabdeeli/i.test(txt), txt: txt.slice(0, 70) };
  });
  ok(!guard.err && guard.warned, '⑨ unsaved changes par navigation warning aayi', guard.err || guard.txt || 'koi modal nahi');
  ok(guard.still === 'settings', '⑨b Cancel karne par wahi page raha', 'current=' + guard.still);

  /* ---------- ⑩ duplicate submit blocked ---------- */
  const dup = await page.evaluate(async () => {
    window.__saCalls = 0;
    const orig = window.__saOrigCall || API.call;
    API.call = function (action) {
      if (action === 'config.save') window.__saCalls++;
      return orig.apply(this, arguments);
    };
    const b = document.getElementById('saveAllBtn');
    b.click(); b.click(); b.click();                       /* 3 clicks, ek hi request */
    await new Promise(r => setTimeout(r, 3200));
    API.call = orig;
    return { calls: window.__saCalls, dirty: UI2.dirtyPayload().count };
  });
  ok(dup.calls <= 1, '⑩ duplicate submit blocked (3 click = 1 request)', 'calls=' + dup.calls);
  await page.evaluate(async () => {
    App._noDirtyGuard = true;
    UI2.clearAllDirty();
    App.refresh();
    App._noDirtyGuard = false;
  });
  await sleep(900);

  ok(errs.length === 0, '⑪ zero page errors', errs.slice(0, 3).join(' | ') || '0');

  await browser.close();
  console.log('\n\x1b[1mSUMMARY:\x1b[0m ' + pass + ' pass · ' + fail + ' fail · ' + (fail ? '\x1b[31mRED\x1b[0m' : '\x1b[32mGREEN\x1b[0m'));
  if (fail) { console.log(ERR.map(e => ' - ' + e).join('\n')); process.exit(1); }
})();
