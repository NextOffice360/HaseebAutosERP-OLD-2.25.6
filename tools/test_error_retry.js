#!/usr/bin/env node
/**
 * tools/test_error_retry.js — W2.T3 GATE (spec Part-2 §2 · error/retry policy)
 * ---------------------------------------------------------------------------
 * Contract (App_Core ▸ SHARED ERROR POLICY, v2.25.11):
 *   ① UI.errKind(err)  → { kind, retryable, title, hint, detail, icon }
 *   ② UI.errText(err)  → human line (codes translate, stale "retry/reload/
 *                        please" guidance remove — Retry button khud hai)
 *   ③ UI.errBox(host, err, {retry, refresh, write}) → inline box + "Dobara
 *      koshish karein" SIRF retryable par; duplicate same-kind box nahi
 *   ④ UI.toast(…,'err') → khud classified + DEDUPE (1400ms window)
 *   ⑤ UI.errStats()     → counters (classified/retryable/blockedRetry) + reset
 *
 * RETRY SIRF JAB JAIZ HO: network/offline/server/conflict → Retry;
 * validation/auth/unknown → koi Retry button nahi (guidance doosri).
 *
 *   node tools/test_error_retry.js
 */
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0; const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  \u2714 ' + name); }
  else { fail++; failures.push(name + (detail ? ' \u2192 ' + detail : '')); console.log('  \u2716 ' + name + (detail ? '  \u2192 ' + detail : '')); }
}
const section = t => console.log('\n\x1b[1m' + t + '\x1b[0m');
const wait = ms => new Promise(r => setTimeout(r, ms));

const { JSDOM } = require('jsdom');
const demo = fs.readFileSync(path.join(ROOT, 'demo/index.html'), 'utf8');
const dom = new JSDOM(demo, { runScripts: 'dangerously', resources: undefined, pretendToBeVisual: true, url: 'http://localhost/' });
const win = dom.window;

(async () => {
  for (let i = 0; i < 60 && !(win.UI && win.UI.errKind && win.App && win.App.state); i++) await wait(120);
  ok('demo app ne UI + errKind export kiya', !!(win.UI && typeof win.UI.errKind === 'function'));

  const doc = win.document;

  /* ── A ▸ CLASSIFICATION MATRIX ── */
  section('A \u25b8 errKind \u2014 har kind ka class + retryable faisla');
  UI_reset();
  const K = e => win.UI.errKind(e);
  ok('offline (failed to fetch) \u2192 retryable', K(new Error('Failed to fetch')).kind === 'offline' && K(new Error('Failed to fetch')).retryable === true);
  ok('network (REQUEST_TIMEOUT) \u2192 retryable', K(new Error('REQUEST_TIMEOUT: jawab nahi aaya')).kind === 'network' && K(new Error('timeout')).retryable === true);
  ok('auth (session/ijazat) \u2192 retry NAHI', K(new Error('Session expire ho gaya')).kind === 'auth' && K(new Error('ijazat nahi')).retryable === false);
  ok('validation (zaroori/ghalat) \u2192 retry NAHI', K(new Error('Name zaroori hai.')).kind === 'validation' && K(new Error('Qty ghalat hai')).retryable === false);
  ok('conflict (SETTINGS_BUSY) \u2192 retryable', K(new Error('SETTINGS_BUSY: another save is running')).kind === 'conflict' && K(new Error('SETTINGS_BUSY: x')).retryable === true);
  ok('server (exception/quota) \u2192 retryable', K(new Error('Exception: spreadsheet error')).kind === 'server' && K(new Error('quota exceeded')).retryable === true);
  ok('unknown \u2192 retry NAHI (default safe)', K(new Error('kuch ajeeb hua')).kind === 'unknown' && K(new Error('kuch ajeeb hua')).retryable === false);
  ok('har kind ka title + hint (insani zaban) mojood', ['offline', 'network', 'auth', 'validation', 'conflict', 'server', 'unknown']
    .every(x => { const k = K(new Error(msgFor(x))); return k.title && k.hint && k.title.length > 8 && k.hint.length > 15; }));

  function msgFor(kind) {
    return { offline: 'failed to fetch', network: 'timeout', auth: 'session', validation: 'required',
      conflict: 'busy', server: 'internal', unknown: 'xyz-ajeeb' }[kind] || 'xyz';
  }
  function UI_reset() { win.UI.errStats(true); }

  /* ── B ▸ errText ── */
  section('B \u25b8 errText \u2014 codes translate, stale guidance remove');
  const t1 = win.UI.errText(new Error('REQUEST_TIMEOUT: Server slow tha. Please try again.'));
  ok('CODE-prefix gaya + "Please try again" wala jumla gaya', !/REQUEST_TIMEOUT/.test(t1) && !/try again/i.test(t1) && t1.length > 3, t1);
  const t2 = win.UI.errText(new Error('Kam az kam ek item zaroori hai.'));
  ok('validation ka asli message bacha (matlab wapas milta hai)', /zaroori/.test(t2), t2);

  /* ── C ▸ errBox DOM ── */
  section('C \u25b8 errBox \u2014 inline box, Retry sirf jaiz par, duplicate nahi');
  const host = doc.createElement('div'); doc.body.appendChild(host);
  win.App.state.session = win.App.state.session || { permissions: ['*'] };

  host.innerHTML = '';
  let retryCalls = 0;
  const b1 = win.UI.errBox(host, new Error('REQUEST_TIMEOUT: jawab nahi aaya'), { retry: () => retryCalls++ });
  ok('retryable error par box bana + role=alert', !!b1 && !!host.querySelector('.err-box[data-kind="network"]') && host.querySelector('.err-box').getAttribute('role') === 'alert');
  const rbtn = Array.from(host.querySelectorAll('button')).find(b => /Dobara koshish/i.test(b.textContent));
  ok('Retry button nazar aata hai (network jaiz)', !!rbtn);
  if (rbtn) rbtn.click();
  await wait(30);
  ok('Retry click \u2192 wahi kaam dobara chala', retryCalls === 1, 'calls=' + retryCalls);

  host.innerHTML = '';
  win.UI.errBox(host, new Error('Name zaroori hai.'), { retry: () => retryCalls++ });
  ok('validation par koi Retry button NAHI (blocked)', !/Dobara koshish/i.test(host.textContent) && host.querySelector('.err-box[data-kind="validation"]'));
  ok('validation hint durust rasta dikhata hai', /durust|fields|values/i.test(host.textContent), host.textContent.slice(0, 80));

  host.innerHTML = '';
  win.UI.errBox(host, new Error('timeout A'));
  const kidsAfterFirst = host.querySelectorAll('.err-box').length;
  win.UI.errBox(host, new Error('timeout B'));
  ok('wahi kind dobara \u2192 duplicate box nahi (1 hi)', kidsAfterFirst === 1 && host.querySelectorAll('.err-box').length === 1);

  host.innerHTML = '';
  win.UI.errBox(host, new Error('SETTINGS_BUSY: another save'), { write: true });
  ok('write error par Refresh/save-warning bhi (double-write hifazat)', /refresh|dobara load|taza/i.test(host.textContent) || host.querySelectorAll('.eb-acts button').length >= 2, host.textContent.slice(0, 90));
  ok('technical tafseel <details> me raw message', /another save/.test(host.textContent) && !!host.querySelector('.eb-det, details'));

  /* ── D ▸ toast dedupe ── */
  section('D \u25b8 UI.toast(err) \u2014 classification + dedupe');
  const toastsOf = () => Array.from(doc.querySelectorAll('.toast'));
  const before = toastsOf().length;
  win.UI.toast('timeout: pehli dafa', 'err');
  win.UI.toast('timeout: pehli dafa', 'err');           /* 1400ms ke andar same */
  await wait(80);
  const same = toastsOf().filter(t => /pehli dafa/.test(t.textContent));
  ok('same msg dedupe \u2192 1 hi toast node', same.length === 1, 'found=' + same.length);
  win.UI.toast('Item zaroori hai naya wala', 'err');   /* validation kind \u2192 alag text */
  await wait(80);
  ok('naya msg \u2192 naya toast node (dedupe sirf same-msg par)', toastsOf().filter(t => /Item zaroori hai naya wala/.test(t.textContent)).length === 1, toastsOf().map(t => t.textContent.slice(0, 40)).join(' | '));

  /* ── E ▸ errStats ── */
  section('E \u25b8 errStats \u2014 counters + reset');
  const st = win.UI.errStats();
  ok('classified/retryable/blockedRetry gine gaye', st.classified >= 10 && st.retryable >= 3 && st.blockedRetry >= 3,
    JSON.stringify(st));
  UI_reset();
  ok('errStats(true) reset', win.UI.errStats().classified === 0);

  /* ── F ▸ source contracts ── */
  section('F \u25b8 SOURCE contracts (desktop + PWA parity)');
  const src = f => fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf8');
  ok('App_Core: errKind + errText + errBox + errStats sab', /errKind\(err\)/.test(src('App_Core.html')) && /errText\(err\)/.test(src('App_Core.html')) && /errBox\(host, err, opts\)/.test(src('App_Core.html')) && /errStats\(reset\)/.test(src('App_Core.html')));
  ok('API._retryable bhi mojood (transport-layer retry)', /_retryable\(msg\)/.test(src('App_Core.html')));
  ok('PWA parity: Pwa_Shell _errKinds policy', /_errKinds/.test(src('Pwa_Shell.html')) && /retryable/.test(src('Pwa_Shell.html')));

  console.log('\n\x1b[1mSUMMARY:\x1b[0m ' + pass + ' pass \u00b7 ' + fail + ' fail \u00b7 ' + (fail === 0 ? '\x1b[32mGREEN\x1b[0m' : '\x1b[31mRED\x1b[0m'));
  if (failures.length) { console.log('Failures:'); failures.forEach(f => console.log('  - ' + f)); }
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
