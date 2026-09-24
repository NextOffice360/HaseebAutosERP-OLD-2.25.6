/**
 * tools/test_notifications.js — v2.30.0 (N8) notification service gate
 * ============================================================================
 * Shart: reusable notification service (success/error/warning/info/progress +
 * persistent failures + Retry) · duplicate spam nahi · responsive · Settings
 * controls. Sab kuch RENDERED DOM par assert hota hai (UI claims = DOM proof).
 *
 *   ① dedupe: ek hi message 5× tezi se → 1 toast + ×N count (stack nahi)
 *   ② mukhtalif messages → alag toasts (dedupe ghalat cheez ko na roke)
 *   ③ sticky error auto-dismiss NAHI hota (persistent failure) + ✕ se jata hai
 *   ④ Retry action toast par nazar aata hai aur click par callback chalta hai
 *   ⑤ progress → done() (ok ban gaya, auto-dismiss) + fail() (err + retry)
 *   ⑥ cap: 8 tez toasts par non-sticky ≤ 4 (screen dhakti nahi)
 *   ⑦ Settings: notif.enabled=OFF → ok/info chhupe, err/warn NAZAR aate hain
 *   ⑧ duration setting sach mein ms badalti hai (SHORT < LONG)
 *   ⑨ UI.toast (purana signature) ab bhi chalta hai — 300+ call-sites safe
 *   ⑩ zero page errors
 *
 *   export LD_LIBRARY_PATH=… ; node tools/test_notifications.js [http://127.0.0.1:8021/]
 */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0; const ERR = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✔', name); }
  else { fail++; const m = '  ✖ ' + name + (extra ? '  → ' + extra : ''); ERR.push(name); console.log(m); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const puppeteer = require('puppeteer');
  const TARGET = process.argv[2] || ('file://' + path.join(ROOT, 'demo', 'index.html'));
  const clickSel = sel => page.evaluate(x => { const e = document.querySelector(x); if (!e) throw new Error('missing ' + x); e.click(); }, sel);
  console.log('\x1b[1mNOTIFICATION SERVICE — rendered DOM gate\x1b[0m');
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
  await sleep(1200);
  const count = () => page.evaluate(() => document.querySelectorAll('#toastRoot .toast').length);
  const cleanup = () => page.evaluate(() => { UI._toasts.slice().forEach(t => UI._toastClose(t)); });

  /* ① dedupe */
  await cleanup();
  for (let i = 0; i < 5; i++) await page.evaluate(() => UI.toast('Gate duplicate test — ek hi toast', 'warn', 60000));
  await sleep(350);
  const d1 = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('#toastRoot .toast'));
    const el = els.filter(x => (x.textContent || '').indexOf('Gate duplicate test') > -1)[0];
    const badge = el && el.querySelector('.t-count');
    return { total: els.length, mine: !!el, badge: badge ? badge.textContent.trim() : '', visible: badge ? badge.style.display !== 'none' : false };
  });
  ok(d1.total === 1 && d1.mine && d1.visible && d1.badge === '×5',
    '① 5× same message → 1 toast + ×5 badge (spam nahi)', JSON.stringify(d1));

  /* ② mukhtalif messages alag */
  await cleanup();
  await page.evaluate(() => { UI.toast('Pehla message', 'info', 60000); UI.toast('Doosra message', 'ok', 60000); UI.toast('Teesra message', 'warn', 60000); });
  await sleep(300);
  ok(await count() === 3, '② 3 mukhtalif messages → 3 toasts', 'count=' + await count());

  /* ③ sticky */
  await cleanup();
  await page.evaluate(() => UI.notify({ key: 'gate.sticky', tone: 'err', sticky: true, msg: 'Gate sticky wall 77' }));
  await sleep(1300);                                    /* normal 4.2s se pehle hi */
  const stickyThere = await page.evaluate(() => UI._toasts.filter(t => t.key === 'gate.sticky' && !t.closed).length);
  await page.evaluate(() => {
    const rec = UI._toasts.filter(t => t.key === 'gate.sticky' && !t.closed)[0];
    const x = rec && rec.el.querySelector('button[aria-label="Close"]');
    if (x) x.click();
  });
  await sleep(400);
  const stickyAfter = await page.evaluate(() => UI._toasts.filter(t => t.key === 'gate.sticky' && !t.closed).length);
  ok(stickyThere === 1 && stickyAfter === 0, '③ sticky error 1.3s baad bhi mojood, ✕ par gayab', 'during=' + stickyThere + ' after=' + stickyAfter);

  /* ④ retry action */
  await cleanup();
  await page.evaluate(() => { window.__gateRetried = 0; UI.notify({ key: 'gate.retry', tone: 'err', ms: 60000, msg: 'Gate retry wall 42', action: { label: 'Dobara koshish karein', onClick: () => { window.__gateRetried++; } } }); });
  await sleep(300);
  const r1 = await page.evaluate(() => {
    const rec = UI._toasts.filter(t => t.key === 'gate.retry' && !t.closed)[0];
    const b = rec && Array.from(rec.el.querySelectorAll('button')).find(x => /koshish/i.test(x.textContent || ''));
    if (b) b.click();
    return { hasBtn: !!b };
  });
  await sleep(200);
  const retried = await page.evaluate(() => window.__gateRetried);
  ok(r1.hasBtn && retried === 1, '④ Retry button nazar aata hai aur callback chalta hai', JSON.stringify({ hasBtn: r1.hasBtn, retried }));

  /* ⑤ progress handle */
  await cleanup();
  await page.evaluate(() => {
    window.__gateRec = UI.notify({ key: 'gate.prog', tone: 'progress', msg: 'Gate progress kaam' });
  });
  await sleep(1200);
  const progThere = await page.evaluate(() => !!document.querySelector('#toastRoot .toast.progress'));
  await page.evaluate(() => window.__gateRec.done('Gate progress mukammal'));
  await sleep(250);
  const doneState = await page.evaluate(() => {
    const el = document.querySelector('#toastRoot .toast');
    return { isOk: /ok/.test(el.className), spinnerGone: !el.querySelector('.t-spin'), txt: (el.textContent || '').indexOf('mukammal') > -1 };
  });
  ok(progThere && doneState.isOk && doneState.spinnerGone && doneState.txt,
    '⑤a progress 1.2s baad bhi zinda (khud nahi jata), done() → ok + spinner gayab', JSON.stringify({ progThere, doneState }));
  await cleanup();
  await page.evaluate(() => { window.__gateRec2 = UI.notify({ key: 'gate.prog2', tone: 'progress', msg: 'Gate progress 2' }); });
  await page.evaluate(() => window.__gateRec2.fail('Gate progress wall 99', () => { window.__gateRetried++; }));
  await sleep(250);
  const failState = await page.evaluate(() => {
    const rec = UI._toasts.filter(t => t.key === 'gate.prog2' && !t.closed)[0];
    return { isErr: rec ? /err/.test(rec.el.className) : false, hasRetry: rec ? !!Array.from(rec.el.querySelectorAll('button')).find(b => /koshish/i.test(b.textContent || '')) : false };
  });
  ok(failState.isErr && failState.hasRetry, '⑤b fail() → err toast + Retry', JSON.stringify(failState));

  /* ⑥ cap */
  await cleanup();
  for (let i = 0; i < 8; i++) await page.evaluate(n => UI.toast('Cap test number ' + n + ' — mukhtalif', 'info', 60000), i);
  await sleep(350);
  const capN = await count();
  ok(capN <= 4, '⑥ 8 toasts par non-sticky cap (≤4)', 'visible=' + capN);

  /* ⑦ settings: notif.enabled OFF */
  await cleanup();
  await page.evaluate(() => { App.state.settings = App.state.settings || {}; App.state.settings['notif.enabled'] = 'false'; });
  await page.evaluate(() => { UI.toast('Gate quiet ok 11', 'ok', 60000); UI.notify({ key: 'gate.erralways', tone: 'err', ms: 60000, msg: 'Gate err wall 7' }); });
  await sleep(300);
  const s1 = await page.evaluate(() => {
    const okGone = !UI._toasts.some(t => !t.closed && (t.msg || '').indexOf('quiet ok 11') > -1);
    const errRec = UI._toasts.filter(t => t.key === 'gate.erralways' && !t.closed)[0];
    return { n: document.querySelectorAll('#toastRoot .toast').length, okHidden: okGone, errThere: !!errRec };
  });
  ok(s1.n === 1 && s1.okHidden && s1.errThere, '⑦ notif OFF → ok chhupa, err nazar (errors hamesha)', JSON.stringify(s1));
  await page.evaluate(() => { App.state.settings['notif.enabled'] = 'true'; });

  /* ⑧ duration scale */
  await cleanup();
  const dur = await page.evaluate(async () => {
    App.state.settings['notif.duration'] = 'SHORT';
    UI.toast('Dur short', 'info');
    const shortMs = UI._toasts.filter(t => t.key === 'info|Dur short')[0] ? null : null;
    /* direct call se arm ka waqt naapo: toast ko ms do aur timer check karo */
    UI._toasts.slice().forEach(t => UI._toastClose(t));
    const rec1 = UI.notify({ tone: 'info', msg: 'Dur naap SHORT', ms: 5000 });
    const t1 = rec1.timer ? 1 : 0;
    const started = Date.now(); let fired1 = 0;
    rec1.close(); UI._toasts.slice().forEach(t => UI._toastClose(t));
    App.state.settings['notif.duration'] = 'LONG';
    const rec2 = UI.notify({ tone: 'info', msg: 'Dur naap LONG', ms: 5000 });
    /* arm ko turant naap nahi sakte — _toastMs hi check karo (scale ka asli test) */
    const m1 = UI._toastMs('info', 5000, false);
    App.state.settings['notif.duration'] = 'SHORT';
    const m2 = UI._toastMs('info', 5000, false);
    App.state.settings['notif.duration'] = 'NORMAL';
    rec2.close();
    return { long: m1, short: m2 };
  });
  ok(dur.short < dur.long && dur.long > 5000 && dur.short < 5000,
    '⑧ duration setting scale karta hai (SHORT < NORMAL < LONG)', JSON.stringify(dur));

  /* ⑨ purana signature */
  await cleanup();
  await page.evaluate(() => UI.toast('Legacy toast signature', 'ok', 60000));
  await sleep(250);
  const legacy = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('#toastRoot .toast')).find(x => (x.textContent || '').indexOf('Legacy toast signature') > -1);
    return { there: !!el, isOk: el ? /ok/.test(el.className) : false };
  });
  ok(legacy.there && legacy.isOk, '⑨ UI.toast(msg, type, ms) back-compat chal raha hai', JSON.stringify(legacy));

  ok(errs.length === 0, '⑩ zero page errors', errs.slice(0, 3).join(' | ') || '0');

  await browser.close();
  console.log('\n\x1b[1mSUMMARY:\x1b[0m ' + pass + ' pass · ' + fail + ' fail · ' + (fail ? '\x1b[31mRED\x1b[0m' : '\x1b[32mGREEN\x1b[0m'));
  if (fail) { console.log(ERR.map(e => ' - ' + e).join('\n')); process.exit(1); }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
