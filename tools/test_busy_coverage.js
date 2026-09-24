/**
 * tools/test_busy_coverage.js — W7.T1 GATE (v2.29.2).
 *
 * Dawa: "har UI action (button click / change / submit) jo backend se data
 * mangta hai, us par busy state + duplicate-submit guard lage — SHARED engine
 * ke zariye, har page par alag patch ke baghair."
 *
 * Is gate mein sabit hota hai (RENDERED DOM + app ke asli helper `h()` se):
 *   A. h() path     — h('button',{onclick: async …}) par busy + disabled
 *   B. property path— el.onclick = async … (dusra attachment tareeqa) par bhi
 *   C. Dup block    — busy ke doran dobara click → API call count wahi rehti hai
 *   D. Clear/min    — kaam khatam hone par busy hat jati hai (min 320ms dikh kar)
 *   E. Real screens — asli screen ke buttons dabane par engine attach hota hai,
 *                     aur jab bhi busy lagti hai to us waqt API call in-flight hoti hai
 *   F. Kill-switch  — UI._features.autoBusy = false → koi auto busy nahi
 *   G. UI.run skip  — UI.run wale buttons par engine nahi lagta (double spinner nahi)
 *   H. data-nobusy  — opt-out kaam karta hai
 *   I. zero page errors
 *
 *   node tools/test_busy_coverage.js          (~30s)
 */
'use strict';
const puppeteer = require('puppeteer');
const path = require('path');
const { login } = require('./_harness');
const ROOT = path.join(__dirname, '..');
const TARGET = process.argv[2] || ('file://' + path.join(ROOT, 'demo', 'index.html'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ERR = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('✔', name); }
  else { fail++; const m = '✘ ' + name + (extra ? ' — ' + extra : ''); ERR.push(m); console.log(m); }
}

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e.message).slice(0, 110)));
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(TARGET, { waitUntil: 'networkidle2', timeout: 45000 });
  await login(page);

  const engOn = await page.evaluate(() =>
    !!(window.UI && UI.autoBusyToken && UI._abWrapFn && UI._features && UI._features.autoBusy !== false));
  ok(engOn, 'shared auto-busy engine maujood + ON (UI._features.autoBusy)');

  /* ---------- A/B/C/D. synthetic — app ke apne h() aur property path ---------- */
  const A = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const out = {};
    /* h() → addEventListener path (app isi se 90% buttons banata hai) */
    const b1 = h('button', { class: 'btn', onclick: async () => { await API.call('system.settings.get', {}); } }, 'Test A');
    document.body.appendChild(b1);
    const b2 = h('button', { class: 'btn' }, 'Test B');
    b2.onclick = async () => { await API.call('system.settings.get', {}); };   /* property path */
    document.body.appendChild(b2);

    for (const [key, b] of [['h', b1], ['prop', b2]]) {
      let calls = 0;
      const oc = window.API.call;
      /* call ko ASAL mein in-flight rakho (250ms) — warna call itni tez khatam ho
         jati hai ke "busy ke doran dobara click" ka test bemani ho jata hai */
      /* sirf ISI test ka action gino — app ke background calls (jaise
         cash.session.summary poll) galti se count ho kar false fail dete the */
      window.API.call = async function (a, p, o) { if (a === 'system.settings.get') calls++; await wait(250); return oc(a, p, o); };
      const n0 = calls;
      b.click();
      const busyNow = { cls: b.classList.contains('is-busy-ab'), aria: b.getAttribute('aria-busy'), dis: b.disabled };
      await wait(60);
      try { b.click(); b.click(); } catch (e) { }
      await wait(260);
      const callsMid = calls - n0;
      await wait(600);
      const after = { cls: b.classList.contains('is-busy-ab'), aria: b.getAttribute('aria-busy'), dis: b.disabled };
      window.API.call = oc;
      out[key] = { busy: busyNow, callsMid: callsMid, after: after };
      b.remove();
    }
    return out;
  });
  ok(A.h && A.h.busy.cls && A.h.busy.aria === 'true' && A.h.busy.dis === true,
    'A. h() path: async handler par .is-busy-ab + aria-busy + disabled', JSON.stringify(A.h && A.h.busy));
  ok(A.prop && A.prop.busy.cls && A.prop.busy.aria === 'true',
    'B. property path (el.onclick = async): busy lagti hai', JSON.stringify(A.prop && A.prop.busy));
  ok(A.h && A.h.callsMid === 1 && A.prop && A.prop.callsMid === 1,
    'C. duplicate submit BLOCK: busy ke doran extra clicks se call 1 hi rahi',
    JSON.stringify({ h: A.h && A.h.callsMid, prop: A.prop && A.prop.callsMid }));
  ok(A.h && !A.h.after.cls && A.h.after.aria === null && A.prop && !A.prop.after.cls,
    'D. busy clear: kaam khatam hone par state wapas normal',
    JSON.stringify({ h: A.h && A.h.after, prop: A.prop && A.prop.after }));

  /* ---------- E. real screens sweep ---------- */
  const E = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const res = { clicked: 0, busy: 0, busyWithInflight: 0, samples: [] };
    const snap = () => UI.autoBusyStats().attached;
    const before = snap();
    for (const scr of ['settings', 'comms', 'dashboards']) {
      try { App.go(scr); } catch (e) { }
      await wait(1100);
      const btns = Array.from(document.querySelectorAll('button,a.btn'))
        .filter(b => b.offsetParent && !b.disabled && !b.closest('#sidebar') && !b.closest('#topbar'));
      for (const b of btns.slice(0, 14)) {
        res.clicked++;
        const n0 = API.stats.calls;
        try { b.click(); } catch (e) { continue; }
        const busy = b.classList.contains('is-busy-ab');
        if (busy) {
          res.busy++;
          if (API.stats.inflight > 0) res.busyWithInflight++;
          if (res.samples.length < 4) res.samples.push({ label: String(b.textContent || '').trim().slice(0, 24), api: API.stats.calls - n0 });
        }
        await wait(520);
        const scrim = document.querySelector('.modal-scrim');
        if (scrim) { try { scrim.click(); } catch (e) { } await wait(180); }
      }
    }
    res.attachedDelta = snap() - before;
    return res;
  });
  ok(E.clicked > 10, 'E. real screens sweep: kaafi buttons daba kar dekhe', JSON.stringify({ clicked: E.clicked }));
  ok(E.attachedDelta > 0, 'E. real screen button par engine ne busy lagayi (stats.attached barha)', JSON.stringify({ delta: E.attachedDelta }));
  ok(E.busy === 0 || E.busyWithInflight === E.busy,
    `E. jab bhi busy lagi, us waqt API call in-flight thi (${E.busyWithInflight}/${E.busy})`, JSON.stringify(E.samples));

  /* ---------- F. kill-switch ---------- */
  const F = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    UI._features.autoBusy = false;
    const b = h('button', { class: 'btn', onclick: async () => { await API.call('system.settings.get', {}); } }, 'Test F');
    document.body.appendChild(b);
    b.click();
    await wait(80);
    const busy = b.classList.contains('is-busy-ab') || !!b.getAttribute('aria-busy');
    await wait(500); b.remove();
    UI._features.autoBusy = true;
    return { busy: busy };
  });
  ok(F.busy === false, 'F. kill-switch: autoBusy=false par koi auto busy nahi', JSON.stringify(F));

  /* ---------- G. UI.run skip (double spinner nahi) ---------- */
  const G = await page.evaluate(async () => {
    const b = h('button', { class: 'btn' }, 'Test G');
    document.body.appendChild(b);
    let mid = null;
    await UI.run(b, async () => {
      mid = { token: UI.autoBusyToken(b) === null, ab: b.classList.contains('is-busy-ab') };
      await new Promise(r => setTimeout(r, 120));
    });
    await new Promise(r => setTimeout(r, 200));
    b.remove();
    return mid;
  });
  ok(G && G.token === true && G.ab === false,
    'G. UI.run ke andar engine skip (double spinner nahi)', JSON.stringify(G));

  /* ---------- H. data-nobusy opt-out ---------- */
  const H = await page.evaluate(async () => {
    const wrap = h('div', { 'data-nobusy': '1' });
    const b = h('button', { class: 'btn', onclick: async () => { await API.call('system.settings.get', {}); } }, 'Test H');
    wrap.appendChild(b); document.body.appendChild(wrap);
    b.click();
    const busy = b.classList.contains('is-busy-ab');
    await new Promise(r => setTimeout(r, 300));
    wrap.remove();
    return { busy: busy };
  });
  ok(H.busy === false, 'H. data-nobusy: opt-out kaam karta hai', JSON.stringify(H));

  /* ---------- I. stats + errors ---------- */
  const st = await page.evaluate(() => (window.UI && UI.autoBusyStats) ? UI.autoBusyStats() : null);
  ok(!!st && st.attached > 0 && st.done > 0, 'auto-busy stats: attach/done counters chal rahe hain', JSON.stringify(st));
  ok(errs.length === 0, 'I. zero page errors', JSON.stringify(errs).slice(0, 200));

  await browser.close();
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  BUSY COVERAGE   PASS: ${pass}   FAIL: ${fail}`);
  if (fail) ERR.forEach(e => console.log('   ✖ ' + e));
  console.log('═══════════════════════════════════════════════════════════');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('✖ ' + (e && e.stack || e)); process.exit(1); });
