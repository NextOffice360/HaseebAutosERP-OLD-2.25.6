/**
 * tools/test_table_states.js — v2.30.2 (T7.2 / W9) shared TABLE STATES gate
 * ============================================================================
 * Shart: UI2.table apne states khud sambhale — callers skeleton/.then na likhein:
 *   load  → pending par DELAYED skeleton (flash nahi), fail par error block +
 *           ↻ Retry (recover), kamyabi par rows (+onLoad), reload() se dobara
 *   empty → filter-aware empty + emptyAction (pehle se tha — regression)
 *   rows  → cfg.rows/wrap.refresh() pehle jaisa (backward compat)
 *
 *   PART 1 — source contract (UI2.table load/onLoad/reload + 3 demand adoptions)
 *   PART 2 — rendered DOM (demo):
 *     ① pending → skeleton (200ms baad), data → rows
 *     ② fail → error block + Retry → recover (wahi load dobara)
 *     ③ rows se bani table: refresh(rows) re-render; rows option waisi hi
 *     ④ empty + emptyAction
 *     ⑤ real screen: Demand ▸ Reports (outstanding) shared load se render
 *     ⑥ zero page errors
 *
 *   export LD_LIBRARY_PATH=… ; node tools/test_table_states.js [http://127.0.0.1:8021/]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0; const ERR = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✔', name); }
  else { fail++; const m = '  ✖ ' + name + (extra ? '  → ' + extra : ''); ERR.push(name); console.log(m); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const src = f => fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf8');

console.log('\x1b[1mPART 1 — source contract\x1b[0m');
{
  const ui2 = src('App_UI2.html');
  ok(ui2.includes('wrap.reload = reload') && ui2.includes('if (cfg.load) setTimeout(reload, 0)'),
    '① UI2.table: load auto-start + wrap.reload (store-change re-render)');
  ok(ui2.includes("h('div', { class: 'empty err' }, h('span', { class: 'big' }, '⚠'),") && ui2.includes("'↻ Retry'"),
    '①b error block + ↻ Retry (table ke andar)');
  ok(ui2.includes('let data = (cfg.rows || []).slice();') && ui2.includes('let rows = data.slice();'),
    '①c data/filtered backward-compatible (cfg.rows waisi hi)');
  const dm = src('App_Demand.html');
  const loads = (dm.match(/UI2\.table\(\{[^}]*load:/g) || []).length;
  /* sirf REPORTS teeno (reportTable/waiting/supplier) — baqi demand lists apna
     filter-bar flow rakhti hain (is slice ka scope nahi) */
  const reportsFn = (dm.split('function reportTable')[1] || '') + (dm.split('function waitingReport')[1] || '').split('function supplierReport')[0] + ((dm.split('function supplierReport')[1] || '').split('/* ============================ POS HOOK')[0]);
  ok(loads >= 3 && !reportsFn.includes('appendChild(UI.skeleton('),
    '①d Demand REPORTS: 3 tables shared load par (reports me hand-rolled skeleton gaya)',
    'load-sites=' + loads + ', skeleton-in-reports=' + (reportsFn.includes('appendChild(UI.skeleton(') ? 1 : 0));
}

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
  await sleep(1200);

  /* ① isolated table: controllable promise (skeleton → rows → onLoad) */
  const r1 = await page.evaluate(async () => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;z-index:9999;background:var(--panel);width:900px';
    document.body.appendChild(host);
    let resolveLoad, loaded = 0;
    const t = UI2.table({
      screen: 't72probe', exportName: 't72',
      columns: [{ key: 'name', label: 'Name' }, { key: 'qty', label: 'Qty', num: true }],
      load: () => new Promise(res => { resolveLoad = res; }),
      onLoad: rows => { loaded = rows.length; }
    });
    host.appendChild(t);
    await new Promise(r => setTimeout(r, 550));          /* skeleton 200ms delayed-mount */
    const hasSkel = !!host.querySelector('.skel');
    resolveLoad([{ name: 'A', qty: 1 }, { name: 'B', qty: 2 }]);
    await new Promise(r => setTimeout(r, 300));
    const rowsOk = host.querySelectorAll('tr').length >= 2;
    const skelGone = !host.querySelector('.skel');
    host.remove();
    return { hasSkel, rowsOk, skelGone, onLoadOk: loaded === 2 };
  });
  ok(r1.hasSkel, '① pending par skeleton (delayed-mount — flash nahi)', JSON.stringify(r1).slice(0, 90));
  ok(r1.rowsOk && r1.skelGone && r1.onLoadOk, '①b data aate hi rows (skeleton hata) + onLoad(n)', JSON.stringify(r1).slice(0, 90));

  /* ② ko seedha asli tpar karna ajeeb tha — naya isolated table (fail path) */
  const r2 = await page.evaluate(async () => {
    document.querySelectorAll('body > div[style*="z-index:9999"]').forEach(x => x.remove());
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;z-index:9999;background:var(--panel);width:900px';
    document.body.appendChild(host);
    let calls = 0;
    const t = UI2.table({
      screen: 't72fail', columns: [{ key: 'name', label: 'Name' }],
      load: () => { calls++; return calls === 1 ? Promise.reject(new Error('T72 boom')) : Promise.resolve([{ name: 'R1' }]); }
    });
    host.appendChild(t);
    await new Promise(r => setTimeout(r, 700));   /* pehla load FAIL */
    const errBlock = !!host.querySelector('.empty.err');
    const retryBtn = Array.from(host.querySelectorAll('button')).find(b => /retry/i.test(b.textContent || ''));
    if (retryBtn) retryBtn.click();
    await new Promise(r => setTimeout(r, 500));   /* retry → kamyabi */
    const rowsAfter = host.querySelectorAll('tr').length >= 2;
    const errGone = !host.querySelector('.empty.err');
    host.remove();
    return { errBlock, retry: !!retryBtn, rowsAfter, errGone, calls };
  });
  ok(r2.errBlock && r2.retry && r2.rowsAfter && r2.errGone && r2.calls === 2,
    '② fail → error block + Retry click → recover (wahi load dobara)', JSON.stringify(r2));

  /* ③④ rows/refresh + empty/emptyAction */
  const r3 = await page.evaluate(async () => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;z-index:9999;background:var(--panel);width:900px';
    document.body.appendChild(host);
    const t = UI2.table({
      screen: 't72rows', columns: [{ key: 'name', label: 'Name' }],
      rows: [{ name: 'X1' }], emptyAction: { label: '➕ Pehla record', onClick: () => { } }
    });
    host.appendChild(t);
    await new Promise(r => setTimeout(r, 250));
    const rows1 = host.querySelectorAll('tr').length;
    t.refresh([{ name: 'Y1' }, { name: 'Y2' }]);
    await new Promise(r => setTimeout(r, 150));
    const rows2 = host.querySelectorAll('tr').length;
    /* empty */
    const t2 = UI2.table({ screen: 't72empty', columns: [{ key: 'name', label: 'Name' }], rows: [],
      emptyAction: { label: '➕ Add', onClick: () => { } } });
    host.appendChild(t2);
    await new Promise(r => setTimeout(r, 150));
    const emptyBlock = !!host.querySelector('.empty');
    const emptyBtn = Array.from(host.querySelectorAll('.empty button')).some(b => /pehla record|add/i.test(b.textContent || ''));
    host.remove();
    return { rows1, rows2, emptyBlock, emptyBtn };
  });
  ok(r3.rows1 >= 2 && r3.rows2 >= 3, '③ rows option + wrap.refresh() re-render (backward compat)', JSON.stringify(r3));
  ok(r3.emptyBlock && r3.emptyBtn, '④ empty state + emptyAction (regression — pehle se tha)', JSON.stringify(r3).slice(0, 80));

  /* ⑤ real screen: Demand ▸ Reports */
  const r5 = await page.evaluate(async () => {
    App._noDirtyGuard = true;
    App.go('demands'); await new Promise(r => setTimeout(r, 1400));
    const rep = Array.from(document.querySelectorAll('.tabbar-l2 .tab, .tabs .tab, button')).find(x => /^reports?$/i.test((x.textContent || '').trim()));
    if (rep) { rep.click(); await new Promise(r => setTimeout(r, 1200)); }
    const v = document.getElementById('view');
    const badges = (v && Array.from(v.querySelectorAll('.badge')).some(b => /^rows:/i.test(b.textContent || ''))) || false;
    const table = !!(v && v.querySelector('.st2'));
    const err = !!(v && v.querySelector('.empty.err'));
    App._noDirtyGuard = false;
    return { badges, table, err };
  });
  ok(r5.table && r5.badges && !r5.err, '⑤ Demand ▸ Reports shared load se render (Rows badge + table, koi error nahi)', JSON.stringify(r5));

  ok(errs.length === 0, '⑥ zero page errors', errs.slice(0, 3).join(' | ') || '0');

  await browser.close();
  console.log('\n\x1b[1mSUMMARY:\x1b[0m ' + pass + ' pass · ' + fail + ' fail · ' + (fail ? '\x1b[31mRED\x1b[0m' : '\x1b[32mGREEN\x1b[0m'));
  if (fail) { console.log(ERR.map(e => ' - ' + e).join('\n')); process.exit(1); }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
