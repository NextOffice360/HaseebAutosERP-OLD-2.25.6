/**
 * tools/test_settings_shared.js — v2.30.2 (T7.4) settings consume shared systems
 * ============================================================================
 * Settings ab BHI shared engines consume karta hai (bespoke paths nahi):
 *   ① DEPS — Config.defs ka declarative showWhen {key, eq|ne} (JSON-safe) →
 *      UI2.form ka WAHI N10 showSync engine (function-form ke sath):
 *        · aiOpenaiPrefixes sirf provider=OPENAI par
 *        · integration strictOrigin/requireToken/apiKey sirf integrations ON par
 *   ② DATETIME — localization sub-tab ka LIVE preview ISI shared DT.format se
 *      (cfgOv override; save ki zaroorat nahi; showTime off → datetime khud
 *      date-only ho jata hai — wahi app-wide rule)
 *
 *   PART 1 — backend defs (mock):
 *     ① showWhen objects + dt.* fields defs se aate hain
 *   PART 2 — rendered DOM:
 *     ② integration OFF/ON → integration fields chhupe/nazar
 *     ③ provider GEMINI/OPENAI → aiOpenaiPrefixes chhupa/nazar (value qayam)
 *     ④ live preview: hour12 toggle → am/pm; showTime off → datetime=date-only
 *     ⑤ zero page errors
 *
 *   export LD_LIBRARY_PATH=… ; node tools/test_settings_shared.js [http://127.0.0.1:8021/]
 */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { loadBackend } = require('./mock_gs');
let pass = 0, fail = 0; const ERR = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✔', name); }
  else { fail++; const m = '  ✖ ' + name + (extra ? '  → ' + extra : ''); ERR.push(name); console.log(m); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

console.log('\x1b[1mPART 1 — backend defs\x1b[0m');
let defsOK = false;
try {
  const { sandbox } = loadBackend(path.join(ROOT, 'apps-script'));
  try { sandbox.Setup.setupAll(); } catch (e) { }
  const defs = sandbox.Config.defs();
  const allF = [];
  defs.forEach(g => (g.sub || []).forEach(t => (t.fields || []).forEach(f => allF.push(f))));
  const sw = k => { const f = allF.filter(x => x.key === k)[0] || {}; return f.showWhen || null; };
  defsOK = sw('aiOpenaiPrefixes') && sw('aiOpenaiPrefixes').key === 'aiProvider'
    && sw('integration.strictOrigin') && String(sw('integration.strictOrigin').eq) === 'true'
    && allF.some(f => f.key === 'dt.format') && allF.some(f => f.key === 'dt.showTime');
  ok(defsOK, '① defs: showWhen objects (ai + integration) + dt.* fields',
    JSON.stringify({ ai: !!sw('aiOpenaiPrefixes'), integ: !!sw('integration.strictOrigin') }));
} catch (e) { ok(false, '① defs load', String(e.message || e).slice(0, 120)); }

(async () => {
  console.log('\x1b[1mPART 2 — rendered DOM\x1b[0m');
  const puppeteer = require('puppeteer');
  const TARGET = process.argv[2] || ('http://127.0.0.1:8021/');
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

  const openSub = async (l1Src, l2Src) => page.evaluate(async (r1s, r2s) => {
    const R1 = new RegExp(r1s, 'i'), R2 = new RegExp(r2s, 'i');
    App._noDirtyGuard = true;
    App.go('settings');
    await new Promise(r => setTimeout(r, 1200));
    const t1 = Array.from(document.querySelectorAll('.tabbar-l1 .tab')).find(x => R1.test(x.textContent || ''));
    if (!t1) return 'L1 nahi: ' + r1s;
    t1.click();
    await new Promise(r => setTimeout(r, 1100));
    const t2 = Array.from(document.querySelectorAll('.tabbar-l2 .tab')).find(x => R2.test(x.textContent || ''));
    if (!t2) return 'L2 nahi: ' + r2s;
    t2.click();
    await new Promise(r => setTimeout(r, 1100));
    return '';
  }, String(l1Src), String(l2Src));

  /* ② integration deps */
  const nav2 = await openSub('backend|integration', 'external');
  const r2 = await page.evaluate(async () => {
    const setSw = (id, on) => {
      const el = document.getElementById(id);
      if (!el) return false;
      el.checked = on;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    };
    const vis = id => { const el = document.getElementById(id); return el ? (el.closest('.f-col') || {}).style.display !== 'none' : null; };
    const out = { init: { strict: vis('f_integration.strictOrigin'), tok: vis('f_integration.requireToken') } };
    setSw('f_integration.enabled', false);
    await new Promise(r => setTimeout(r, 500));
    out.off = { strict: vis('f_integration.strictOrigin'), tok: vis('f_integration.requireToken'), key: vis('f_integration.apiKey') };
    setSw('f_integration.enabled', true);
    await new Promise(r => setTimeout(r, 500));
    out.on = { strict: vis('f_integration.strictOrigin'), key: vis('f_integration.apiKey') };
    return out;
  }).catch(e => ({ err: String(e.message || e).slice(0, 100) }));
  r2.navErr = nav2 && String(nav2).slice(0, 60);
  ok(!r2.err && r2.init && r2.init.strict === true && r2.off && r2.off.strict === false && r2.off.tok === false
    && r2.off.key === false && r2.on && r2.on.strict === true && r2.on.key === true,
    '② integration OFF → strict/token/apiKey CHHUPE; ON → nazar (shared showWhen object-form)',
    JSON.stringify(r2).slice(0, 150));

  /* ③ AI provider deps (settings already open — L1 nav karo) */
  const r3 = await page.evaluate(async () => {
    const nav = Array.from(document.querySelectorAll('.tabbar-l1 .tab')).find(x => /automation|ai/i.test(x.textContent || ''));
    if (!nav) return { err: 'AI group nahi' };
    nav.click(); await new Promise(r => setTimeout(r, 1100));
    const sub = Array.from(document.querySelectorAll('.tabbar-l2 .tab')).find(x => /ai/i.test(x.textContent || ''));
    if (sub) { sub.click(); await new Promise(r => setTimeout(r, 1100)); }
    const prov = document.getElementById('f_aiProvider');
    if (!prov) return { err: 'f_aiProvider nahi' };
    const vis = id => { const el = document.getElementById(id); return el ? (el.closest('.f-col') || {}).style.display !== 'none' : null; };
    prov.value = 'GEMINI';
    prov.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 500));
    const gem = vis('f_aiOpenaiPrefixes');
    const before = document.getElementById('f_aiOpenaiPrefixes') ? document.getElementById('f_aiOpenaiPrefixes').value : '';
    prov.value = 'OPENAI';
    prov.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 500));
    const oai = vis('f_aiOpenaiPrefixes');
    const after = document.getElementById('f_aiOpenaiPrefixes') ? document.getElementById('f_aiOpenaiPrefixes').value : '';
    return { gem, oai, valPreserved: before === after, val: String(after).slice(0, 20) };
  });
  ok(!r3.err && r3.gem === false && r3.oai === true,
    '③ provider GEMINI → OpenAI-prefixes CHHUPE; OPENAI → nazar', JSON.stringify(r3).slice(0, 120));

  /* ④ datetime live preview */
  const nav4 = await openSub('general|business|system', 'localization');
  const r4 = await page.evaluate(async () => {
    const rows = Array.from(document.querySelectorAll('[data-dtpv]'));
    if (!rows.length) {
      const sub2 = Array.from(document.querySelectorAll('.tabbar-l2 .tab')).find(x => /localization/i.test(x.textContent || ''));
      if (sub2) { sub2.click(); await new Promise(r => setTimeout(r, 1100)); }
      const rows2 = Array.from(document.querySelectorAll('[data-dtpv]'));
      if (!rows2.length) return { err: 'preview nahi mila', nav: document.querySelector('.tabbar-l2 .tab.on') ? (document.querySelector('.tabbar-l2 .tab.on').textContent || '') : '' };
    }
    if (!rows.length) return { err: 'preview nahi mila' };
    const read = m => (rows.filter(x => x.getAttribute('data-dtpv') === m)[0] || {}).textContent || '';
    const dt24 = read('datetime');
    /* hour12 ON */
    const h12 = document.getElementById('f_dt.hour12');
    if (!h12) return { err: 'f_dt.hour12 nahi' };
    h12.checked = true; h12.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 500));
    const dt12 = read('datetime');
    /* showTime OFF → datetime row date-only ho jati hai (shared rule) */
    const st = document.getElementById('f_dt.showTime');
    st.checked = false; st.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 500));
    const dtNoTime = read('datetime'), dOnly = read('date');
    /* wapis defaults */
    st.checked = true; st.dispatchEvent(new Event('change', { bubbles: true }));
    h12.checked = false; h12.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    const ampm = /\b(am|pm)\b/i.test(dt12);
    const same24 = dt24 === dt12;
    return { dt24: dt24.slice(0, 24), dt12: dt12.slice(0, 24), ampm, same24, dtNoTime, dOnly, dateOnlyApplied: dtNoTime === dOnly && dtNoTime.length > 0 };
  });
  ok(!r4.err && r4.ampm && !r4.same24,
    '④a live preview: hour12 toggle → am/pm (save ke baghair, shared DT.format)',
    JSON.stringify({ dt24: r4.dt24, dt12: r4.dt12 }));
  ok(!r4.err && r4.dateOnlyApplied,
    '④b showTime OFF → datetime preview khud DATE-ONLY (app-wide rule Settings me bhi)',
    JSON.stringify({ dtNoTime: String(r4.dtNoTime).slice(0, 20), dOnly: String(r4.dOnly).slice(0, 20) }));

  ok(errs.length === 0, '⑤ zero page errors', errs.slice(0, 3).join(' | ') || '0');

  await browser.close();
  console.log('\n\x1b[1mSUMMARY:\x1b[0m ' + pass + ' pass · ' + fail + ' fail · ' + (fail ? '\x1b[31mRED\x1b[0m' : '\x1b[32mGREEN\x1b[0m'));
  if (fail) { console.log(ERR.map(e => ' - ' + e).join('\n')); process.exit(1); }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
