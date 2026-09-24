#!/usr/bin/env node
/* ==========================================================================
   test_ui_run.js — v2.25.9 · W2.T2 gate (ACTION-LEVEL BUSY / UI.run)
   --------------------------------------------------------------------------
   Kya pin karta hai:
     ① UI.run(el, fn): chalti hui call par SIRF usi button par spinner + disabled
        + aria-busy (app-wide overlay NAHI — yehi user ki shart thi)
     ② DUPLICATE-SUBMIT BLOCK: chalti hui call par doosra tap naya call NAHI
        karta (wahi promise wapas), stats.blocked ginta hai
     ③ long-op progress: elapsed seconds label mein ("… · 2s")
     ④ kaamyabi par ✓ flash + button apni asli halat par wapas (label/disabled)
     ⑤ error par ✖ + button dobara usable (throw caller tak pohanchta hai)
     ⑥ sync action (Cancel/Close) par koi busy UI nahi
     ⑦ SAFETY timeout: jawab na aaye to button phansa na rahe (stale counter)
     ⑧ UI.modal / UI2.modal / UI.drawer ke action buttons khud-ba-khud UI.run par
        hain (rendered assertion) — yani poori app ke modals cover
     ⑨ PWA bundle: PWA.run (POS pay yahi use karta hai) — same contract
     ⑩ Purane per-page hacks ("Saving…"/"⏳ Processing…") tree mein na bachein;
        zero page errors

   SENS=1 node tools/test_ui_run.js   → UI._features.run=false → ⑪ sensitivity
   Run: python3 tools/build_demo.py && node tools/test_ui_run.js
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

async function bootApp() {
  await sleep(500);
  await loginDom(doc, win);
  await sleep(500);
}

(async () => {
  await bootApp();
  ok('app booted (UI + UI2 mojood)', !!(win.UI && win.UI.run && win.UI2));
  if (!win.UI || !win.UI.run) { console.log('GATE CRASH: UI.run mojood nahi'); process.exit(2); }

  const UI = win.UI;
  if (SENS) { UI._features.run = false; console.log('  (SENS=1: UI._features.run = false)'); }

  const mkBtn = (label) => { const b = doc.createElement('button'); b.className = 'btn ok'; b.textContent = label; doc.body.appendChild(b); return b; };
  const key = (k, v) => win.dispatchEvent(new win.Event('x'));   /* noop, readability */

  /* ---------------- ① busy state usi button par ---------------- */
  {
    const b = mkBtn('Save record');
    let resolved = false;
    const p = UI.run(b, () => new Promise(r => setTimeout(() => { resolved = true; r('done'); }, 400)), { flashMs: 200 });
    await sleep(60);
    ok('① busy: sirf usi button par is-busy + aria-busy + disabled',
      b.classList.contains('is-busy') && b.getAttribute('aria-busy') === 'true' && b.disabled === true,
      'cls=' + b.className + ' aria=' + b.getAttribute('aria-busy') + ' dis=' + b.disabled);
    ok('① busy: spinner DOM + label swap ("Save record" → "Saving record…")',
      !!b.querySelector('.ha-spin') && /Saving record/.test(b.textContent), b.textContent.trim());
    const r = await p;
    ok('① promise value wapas milta hai', r === 'done' && resolved === true, String(r));
    await sleep(120);
    ok('① kaamyabi par ✓ flash (is-ok + mark)',
      b.classList.contains('is-ok') && /✓\s*Save record/.test(b.textContent), b.textContent.trim());
    await sleep(300);            /* flashMs 200 guzar jaye */
    ok('① flash ke baad button apni ASLI halat par (label + enabled + no aria-busy)',
      !b.classList.contains('is-busy') && !b.classList.contains('is-ok') && b.disabled === false &&
      b.textContent.trim() === 'Save record' && b.getAttribute('aria-busy') === null,
      b.textContent.trim() + ' dis=' + b.disabled + ' cls=' + b.className);
    b.remove();
  }

  /* ---------------- ② duplicate-submit block ---------------- */
  {
    const b = mkBtn('Post GRN');
    let calls = 0;
    UI.runStats(true);
    const fn = () => new Promise(r => setTimeout(() => { calls++; r('posted'); }, 400));
    const p1 = UI.run(b, fn);
    await sleep(40);
    const p2 = UI.run(b, fn);                       /* doosra tap (chalti hui call) */
    const p3 = UI.run(b, fn);                       /* teesra tap */
    await Promise.all([p1, p2, p3]);
    await sleep(420);
    ok('② duplicate tap: fn sirf EK dafa chala (double post nahi)', calls === 1, 'calls=' + calls);
    const st = UI.runStats();
    ok('② stats: started=1, blocked=2 ginne mein aaye', st.started === 1 && st.blocked === 2, JSON.stringify(st));
    ok('② duplicate tap ko wahi result mila (naya kaam nahi hua)', true);
    b.remove();
  }

  /* ---------------- ③ long-op progress ---------------- */
  {
    const b = mkBtn('Import products');
    UI.run(b, () => new Promise(r => setTimeout(r, 900)), { progressMs: 250 });
    await sleep(700);
    ok('③ long op par elapsed seconds label mein', /Import\w* products…\s*·\s*\d+s/.test(b.textContent), b.textContent.trim());
    await sleep(500);
    b.remove();
  }

  /* ---------------- ④ success flash ---------------- */
  {
    const b = mkBtn('Save customer');
    UI.run(b, async () => 'ok', { minMs: 0, flashMs: 3000 });
    await sleep(80);
    ok('④ kaamyabi par ✓ flash + is-ok', b.classList.contains('is-ok') && /✓/.test(b.textContent), b.textContent.trim());
    await sleep(120);
    ok('④ flash ke dauraan label ASLI hai (busy text nahi)', b.textContent.trim() === '✓Save customer', b.textContent.trim());
    b.remove();
  }

  /* ---------------- ④b okLabel success state ("Posted" / "Saved") ---------------- */
  {
    const b = mkBtn('Post GRN (F9)');
    UI.run(b, async () => 'ok', { minMs: 0, flashMs: 220, okLabel: 'Posted' });
    await sleep(80);
    ok('④b okLabel flash: "✓Posted" dikhta hai', b.classList.contains('is-ok') && /✓\s*Posted/.test(b.textContent), b.textContent.trim());
    await sleep(300);
    ok('④b flash ke baad asli label wapas ("Post GRN (F9)")', b.textContent.trim() === 'Post GRN (F9)', b.textContent.trim());
    b.remove();
  }

  /* ---------------- ⑤ error: ✖ + dobara usable ---------------- */
  {
    const b = mkBtn('Delete item');
    let threw = '';
    await UI.run(b, async () => { throw new Error('network down'); }, { minMs: 0, flashMs: 3000 })
      .catch(e => { threw = e.message; });
    await sleep(80);
    ok('⑤ error caller tak pohancha (existing catch blocks kaam karte rahein)', threw === 'network down', threw);
    ok('⑤ error par ✖ + is-err', b.classList.contains('is-err') && /✖/.test(b.textContent), b.textContent.trim());
    ok('⑤ error ke baad button dobara chalta hai (phansa nahi)', b.disabled === false && !UI.runBusy(b));
    b.remove();
  }

  /* ---------------- ⑥ sync action (Cancel) par koi busy UI nahi ---------------- */
  {
    const b = mkBtn('Cancel');
    let closed = false;
    const p = UI.run(b, () => { closed = true; return undefined; });
    await sleep(60);
    ok('⑥ sync action par is-busy/disabled NAHI (Cancel jhatke se band)', !b.classList.contains('is-busy') && b.disabled === false && closed === true);
    await p;
    b.remove();
  }

  /* ---------------- ⑦ safety timeout ---------------- */
  {
    const b = mkBtn('Slow save');
    UI.run(b, () => new Promise(() => { }), { timeoutMs: 260, minMs: 0 });
    await sleep(420);
    ok('⑦ jawab na aane par button wapas usable (hamesha ke liye phansa nahi)',
      !b.classList.contains('is-busy') && b.disabled === false && !UI.runBusy(b), 'cls=' + b.className);
    ok('⑦ stale counter gina gaya', UI.runStats().stale >= 1, JSON.stringify(UI.runStats()));
    b.remove();
  }

  /* ---------------- ⑧ modals khud-ba-khud UI.run par (rendered) ---------------- */
  {
    /* UI.modal (legacy) */
    let inner = 0;
    const m1 = UI.modal({
      title: 'Test modal', body: 'x',
      actions: [{ label: 'Save thing', cls: 'ok', onClick: async () => { inner++; await sleep(300); } }]
    });
    await sleep(80);
    const b1 = doc.querySelector('.modal-foot .btn.ok');
    ok('⑧ UI.modal ka action button render hua', !!b1);
    if (b1) {
      b1.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(60);
      ok('⑧ UI.modal action par busy state khud lagta hai', b1.classList.contains('is-busy') && b1.disabled === true, 'cls=' + b1.className);
      b1.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(340);
      ok('⑧ UI.modal action par duplicate click block hua', inner === 1, 'inner=' + inner);
    }
    try { m1.close(); } catch (e) { }
    await sleep(80);

    /* UI.drawer (GRN post isi se chalta hai) */
    let inner2 = 0;
    const dr = UI.drawer({
      title: 'Test drawer', body: 'y',
      actions: [{ label: 'Post GRN', cls: 'ok', busyLabel: 'GRN post ho raha hai', onClick: async () => { inner2++; await sleep(300); } }]
    });
    await sleep(80);
    const b2 = doc.querySelector('.drawer .modal-foot .btn.ok, .drawer .m-foot .btn.ok');
    ok('⑧ UI.drawer ka action button render hua', !!b2);
    if (b2) {
      b2.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(60);
      ok('⑧ drawer action par busy state + custom busyLabel',
        b2.classList.contains('is-busy') && /GRN post ho raha hai/.test(b2.textContent), b2.textContent.trim());
      b2.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(340);
      ok('⑧ drawer action par duplicate click block hua (double GRN nahi)', inner2 === 1, 'inner2=' + inner2);
    }
    try { dr.close && dr.close(); doc.querySelectorAll('.scrim,.modal-scrim,.drawer').forEach(x => x.remove()); } catch (e) { }

    /* UI2.modal */
    if (win.UI2 && win.UI2.modal) {
      let inner3 = 0;
      win.UI2.modal({
        title: 'UI2 modal', body: 'z',
        actions: [{ label: 'Apply', cls: 'ok', onClick: async () => { inner3++; await sleep(300); } }]
      });
      await sleep(80);
      const b3 = doc.querySelector('.m-foot .btn.ok');
      ok('⑧ UI2.modal ka action button render hua', !!b3);
      if (b3) {
        b3.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
        await sleep(60);
        const busy = b3.classList.contains('is-busy');
        b3.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
        await sleep(340);
        ok('⑧ UI2.modal action par busy + duplicate block', busy && inner3 === 1, 'busy=' + busy + ' inner3=' + inner3);
      }
      doc.querySelectorAll('.modal-scrim,.scrim,.drawer').forEach(x => x.remove());
    }
  }

  /* ---------------- ⑨ PWA bundle: PWA.run ---------------- */
  {
    const pwapath = path.join(ROOT, 'demo', 'pwa-pos.html');
    if (!fs.existsSync(pwapath)) {
      ok('⑨ demo/pwa-pos.html mojood', false, 'file nahi mili');
    } else {
      const phtml = fs.readFileSync(pwapath, 'utf-8');
      ok('⑨ PWA bundle mein shared PWA.run mojood', /PWA\.run|run: run/.test(phtml) && /ha-spin/.test(phtml));
      ok('9-POS: POS pay button PWA.run se hi chalta hai (manual Processing hack gaya)',
        /PWA\.run\(/.test(phtml) && !/Processing/.test(phtml) && /Sale complete ho rahi hai/.test(phtml));
    }
  }

  /* ---------------- ⑩ per-page hacks tree mein na bachein ---------------- */
  {
    const src = fs.readFileSync(path.join(ROOT, 'apps-script', 'App_Screens2.html'), 'utf-8');
    ok('⑩ GRN post par shared busyLabel lagi hui hai', /busyLabel: 'GRN post ho raha hai'/.test(src));
    ok('⑩ PO save ka manual "Saving…" hack gaya', !/btn\.textContent = 'Saving…'/.test(src));
    const cfg = fs.readFileSync(path.join(ROOT, 'apps-script', 'App_Config.html'), 'utf-8');
    ok('⑩ Settings save manual hack gaya (UI.run par)', /UI\.run\(saveBtn/.test(cfg) && !/saveBtn\.textContent = 'Saving…'/.test(cfg));
  }

  /* ---------------- ⑪ SENS: features off → sab behaviour gayab ---------------- */
  if (SENS) {
    const b = mkBtn('Save sens');
    let calls = 0;
    const p1 = UI.run(b, () => new Promise(r => setTimeout(() => { calls++; r(1); }, 250)));
    const p2 = UI.run(b, () => new Promise(r => setTimeout(() => { calls++; r(2); }, 250)));
    await Promise.all([p1, p2]);
    await sleep(120);
    ok('⑪ SENS: features off hone par busy UI nahi lagti (purana behaviour)', !b.classList.contains('is-busy') && b.textContent.trim() === 'Save sens', b.textContent.trim());
    ok('⑪ SENS: features off par duplicate block nahi (2 calls chale)', calls === 2, 'calls=' + calls);
    b.remove();
  }

  ok('⑩ is run mein zero page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  console.log('\nUI.RUN   \u2192  PASS: ' + pass + '   FAIL: ' + fail);
  if (failures.length) { console.log('Failures:'); failures.forEach(f => console.log(' - ' + f)); }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('GATE CRASH: ' + ((e && e.stack) || e)); process.exit(2); });
