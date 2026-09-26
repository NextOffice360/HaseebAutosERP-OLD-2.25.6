#!/usr/bin/env node
/* ==========================================================================
   test_ui_err.js — v2.25.11 · W2.T3 gate (SHARED ERROR / RETRY POLICY)
   --------------------------------------------------------------------------
   Kya pin karta hai:
     ① UI.errKind() — 6 kinds (offline/network/auth/validation/conflict/server)
        + unknown; har kind ka retryable flag SAHI hai
        · network/offline/server/conflict → retryable ✔
        · validation/auth → NOT retryable (yahan retry ghalat guidance hai)
     ② UI.errText() — technical text friendly ban jata hai: `REQUEST_TIMEOUT: …`
        ka code hat jata hai, "please retry / then retry again" jaise stale lafz
        nikal jate hain (kyunki ab asli Retry button hota hai)
     ③ UI.toast(msg,'err') khud classified hota hai — 150+ purane call-sites
        bina chhue behtar ho jate hain; aur action wala toast ek asli button
        dikhata hai jo click par chalta hai
     ④ UI.errBox(host, err, …) — action ke paas THAIRA hua box: icon + title +
        hint + technical details (details/summary) + buttons
        · retryable → "Dobara koshish karein" button ✔ (aur woh kaam dobara chalata hai)
        · validation → retry button NAHI ✔
        · write:true → "pehle refresh karein" warning + ⟳ List refresh
     ⑤ UI.run ka error path: error par KHUD box render hota hai (modal body mein),
        Retry button wahi kaam dobara chalata hai (call count 2), aur error
        caller tak pohanchta rehta hai (purane catch blocks na tootein)
     ⑥ PWA bundle: PWA.errKind/errBox/fail + PWA.run ka error path + POS pay write flag
     ⑦ Zero page errors · SENS=1 → features off → purana behaviour (kuch FAIL)

   Run: python3 tools/build_demo.py && node tools/test_ui_err.js
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

(async () => {
  await sleep(500);
  await loginDom(doc, win);
  await sleep(400);
  const UI = win.UI;
  ok('app booted + UI error policy mojood', !!(UI && UI.errKind && UI.errBox && UI.fail));
  if (!UI || !UI.errKind) { console.log('GATE CRASH: error policy mojood nahi'); process.exit(2); }
  if (SENS) { UI._features.err = false; console.log('  (SENS=1: UI._features.err = false)'); }

  /* ---------------- ① classifier ---------------- */
  {
    const cases = [
      ['Failed to fetch', 'offline', true],
      ['REQUEST_TIMEOUT: backend ne waqt par jawab nahi diya', 'network', true],
      ['Login required — session expire ho gaya', 'auth', false],
      ['Qty 0 hai — pehle items add karein', 'validation', false],
      ['SETTINGS_BUSY: another save is running. Wait, reload settings, then retry.', 'conflict', true],
      ['Exception: Cannot read properties of undefined', 'server', true],
      ['bilkul nayi ghalti', 'unknown', false]
    ];
    let allOk = true, detail = [];
    cases.forEach(([msg, kind, retryable]) => {
      const k = UI.errKind(new Error(msg));
      const good = k.kind === kind && k.retryable === retryable;
      if (!good) { allOk = false; detail.push(msg.slice(0, 24) + '→' + k.kind + '/' + k.retryable + ' (chahiye ' + kind + '/' + retryable + ')'); }
    });
    ok('① 7 error kinds + retryable flags sahi', allOk, detail.join(' | '));
    ok('① har kind ka title/hint mojood hai (user ko aage kya karna hai pata chale)',
      cases.every(([m]) => { const k = UI.errKind(new Error(m)); return !!k.title && !!k.hint; }));
    UI.errStats(true);
    UI.errKind(new Error('Failed to fetch'));
    UI.errKind(new Error('Qty 0 hai'));
    const st = UI.errStats();
    ok('① stats: classified=2 · retryable=1 · blockedRetry=1', st.classified === 2 && st.retryable === 1 && st.blockedRetry === 1, JSON.stringify(st));
  }

  /* ---------------- ② friendly text (stale "retry" lafz gayab) ---------------- */
  {
    const t1 = UI.errText(new Error('REQUEST_TIMEOUT: backend ne waqt par jawab nahi diya'));
    ok('② technical code hat gaya', !/REQUEST_TIMEOUT/.test(t1) && t1.length > 5, t1);
    const t2 = UI.errText(new Error('SETTINGS_BUSY: another save is running. Wait, reload settings, then retry.'));
    ok('② stale "then retry" jaisa lafz nikal gaya (ab asli button hota hai)',
      !/then retry/i.test(t2) && !/please retry/i.test(t2), t2);
    const t3 = UI.errText(new Error('PDF response has no file URL. Please retry.'));
    ok('② "Please retry." gaya', !/please retry/i.test(t3), t3);
    const t4 = UI.errText(new Error('TypeError: x is not a function at line 42'));
    ok('② technical stack ki jagah friendly title+hint', /Kaam mukammal nahi hua|Server par masla|Maloomat theek karein|did not complete|Server problem|Fix the input/.test(t4) /* v2.31.2 T.t */, t4);
  }

  /* ---------------- ③ toast classification + action ---------------- */
  {
    const root = doc.querySelector('#toastRoot');
    root.innerHTML = '';
    UI.toast('SETTINGS_BUSY: another save is running. Wait, reload settings, then retry.', 'err');
    await sleep(60);
    const t = root.querySelector('.toast.err');
    ok('③ purana raw call-site bhi classified text dikhata hai',
      !!t && !/SETTINGS_BUSY/.test(t.textContent) && !/then retry/i.test(t.textContent), t ? t.textContent.slice(0, 70) : 'no toast');
    root.innerHTML = '';
    let clicked = 0;
    UI.toast('REQUEST_TIMEOUT: x', 'err', { action: { label: 'Dobara koshish karein', onClick: () => clicked++ } });
    await sleep(60);
    const btn = root.querySelector('.toast.err button.btn.ok');
    ok('③ retryable error ke toast par asli Retry button', !!btn && /Dobara koshish/.test(btn.textContent));
    if (btn) { btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true })); await sleep(60); }
    ok('③ Retry button click par kaam chala', clicked === 1, 'clicked=' + clicked);
    root.innerHTML = '';
  }

  /* ---------------- ④ errBox: retryable / validation / write ---------------- */
  {
    const host = doc.createElement('div'); host.className = 'modal-body'; doc.body.appendChild(host);

    let retried = 0;
    const b1 = UI.errBox(host, new Error('REQUEST_TIMEOUT: none'), { retry: () => retried++ });
    await sleep(40);
    const box = host.querySelector('.err-box');
    ok('④ inline box render hua (host ke andar)', !!box && !!b1);
    ok('④ box mein title + hint + technical details', !!box.querySelector('.eb-head b') && !!box.querySelector('.eb-hint') && !!box.querySelector('details.eb-det'));
    const rbtn = box.querySelector('.eb-acts .btn.ok');
    ok('④ retryable error par "Dobara koshish karein" button', !!rbtn && /Dobara koshish|Try again/.test(rbtn.textContent) /* v2.31.2 T.t */);
    if (rbtn) { rbtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true })); await sleep(40); }
    ok('④ retry click par kaam dobara chala + box hat gaya', retried === 1 && !host.querySelector('.err-box'), 'retried=' + retried);

    const b2 = UI.errBox(host, new Error('Qty 0 hai — pehle items add karein'), { retry: () => retried++ });
    await sleep(40);
    ok('④ validation error par Retry button NAHI (ghalat guidance se bachao)',
      !!host.querySelector('.err-box') && !host.querySelector('.err-box .eb-acts .btn.ok'), 'box=' + !!host.querySelector('.err-box'));
    host.innerHTML = '';

    const b3 = UI.errBox(host, new Error('Failed to fetch'), { retry: () => { }, write: true, writeLabel: 'GRN post' });
    await sleep(40);
    const warn = host.querySelector('.err-box .eb-warn');
    ok('④ write error par "pehle refresh karein" warning', !!warn && /refresh/i.test(warn.textContent), warn ? warn.textContent.slice(0, 60) : 'no warn');
    ok('④ write error par ⟳ refresh button bhi', !!host.querySelector('.err-box .eb-acts .btn.sec'));
    ok('④ write warning ka counter barha', UI.errStats().writeWarned >= 1, JSON.stringify(UI.errStats()));
    host.remove();
  }

  /* ---------------- ⑤ UI.run ka error path (auto box + real retry) ---------------- */
  {
    let m = UI.modal({ title: 'GRN test', body: 'x', noCancel: true, actions: [
      { label: 'Post GRN (F9)', cls: 'ok', write: true, writeLabel: 'GRN post',
        onClick: async () => { throw new Error('REQUEST_TIMEOUT: backend ne jawab nahi diya'); } }
    ] });
    await sleep(80);
    const btn = doc.querySelector('.modal-foot .btn.ok');
    btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
    await sleep(400);
    const body = doc.querySelector('.modal-body');
    ok('⑤ UI.run error par KHUD inline box dikhata hai', !!body.querySelector('.err-box'), 'box=' + !!body.querySelector('.err-box'));
    ok('⑤ box mein retry + write warning dono', !!body.querySelector('.err-box .eb-acts .btn.ok') && !!body.querySelector('.err-box .eb-warn'));
    ok('⑤ button apni asli halat par wapas (phansa nahi)', btn.disabled === false && !btn.classList.contains('is-busy'), btn.className);

    /* pehla modal band kar do — warna neeche ke selectors usi ke buttons pakar lete hain */
    try { m.close(); } catch (e) { }
    doc.querySelectorAll('.modal-scrim,.scrim,.drawer').forEach(x => x.remove());
    await sleep(120);

    /* retry button se wahi kaam dobara chalta hai (call count 2) */
    let calls = 0;
    let m2 = UI.modal({ title: 'Retry test', body: 'y', noCancel: true, actions: [
      { label: 'Save thing', cls: 'ok', onClick: async () => { calls++; if (calls === 1) throw new Error('Failed to fetch'); return 'ok'; } }
    ] });
    await sleep(80);
    const b2 = doc.querySelector('.modal-foot .btn.ok');
    b2.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
    await sleep(400);
    const rb = doc.querySelector('.modal-body .err-box .eb-acts .btn.ok');
    ok('⑤ retry button mojood (network error)', !!rb);
    if (rb) { rb.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true })); await sleep(700); }
    ok('⑤ retry se kaam dobara chala (calls=2) aur box hat gaya',
      calls === 2 && !doc.querySelector('.err-box'), 'calls=' + calls);
    doc.querySelectorAll('.modal-scrim,.scrim,.drawer').forEach(x => x.remove());
  }

  /* ---------------- ⑥ PWA bundle ---------------- */
  {
    const p = path.join(ROOT, 'demo', 'pwa-pos.html');
    if (!fs.existsSync(p)) ok('⑥ demo/pwa-pos.html mojood', false, 'file nahi mili');
    else {
      const h = fs.readFileSync(p, 'utf-8');
      /* POS bundle terser se minify hota hai (local names mangle), is liye exported
         CONTRACT keys check karte hain — woh mangle nahi hote. */
      ok('⑥ PWA bundle mein error policy mojood (errKind/errBox/fail exports + err-box CSS)',
        /errKind:/.test(h) && /errBox:/.test(h) && /fail:/.test(h) && /errText:/.test(h));
      ok('⑥ PWA err-box CSS mojood', /\.err-box/.test(h));
      ok('⑥ POS pay write flag ke sath (double-sale warning)', /write: ?!0|write:true|write: true/.test(h));
    }
  }

  /* ---------------- ⑦ extra: koi "Retry Again" stale text tree mein nahi ---------------- */
  {
    const core = fs.readFileSync(path.join(ROOT, 'apps-script', 'App_Core.html'), 'utf-8');
    ok('⑦ shared policy mojood (errKind + errBox + fail + write warning)', /errKind\(err\)/.test(core) && /errBox\(host, err, opts\)/.test(core) && /writeWarned/.test(core));
    ok('⑦ toast err path classified ho raha hai', /UI\.errText\((msg|raw|err)\)/.test(core)); /* v2.30.6: param msg→raw/err rename hua, path wahi hai */
  }

  if (SENS) {
    const host = doc.createElement('div'); host.className = 'modal-body'; doc.body.appendChild(host);
    UI.toast('REQUEST_TIMEOUT: x', 'err');
    await sleep(50);
    const rawShown = /REQUEST_TIMEOUT/.test((doc.querySelector('#toastRoot') || {}).textContent || '');
    ok('⑧ SENS: features off par classified text NAHI (purana raw message)', rawShown);
    const host2 = doc.querySelector('#toastRoot'); host2.innerHTML = '';
    doc.body.removeChild(host);
  }

  ok('⑦ is run mein zero page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  console.log('\nUI.ERR   \u2192  PASS: ' + pass + '   FAIL: ' + fail);
  if (failures.length) { console.log('Failures:'); failures.forEach(f => console.log(' - ' + f)); }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('GATE CRASH: ' + ((e && e.stack) || e)); process.exit(2); });
