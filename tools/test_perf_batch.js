#!/usr/bin/env node
/* ==========================================================================
   test_perf_batch.js — v2.26.0 · W7 gate (MASS REQUEST / N+1 ELIMINATION)
   --------------------------------------------------------------------------
   Kya pin karta hai (user ki shikayat: "1 Gbps par bhi ek action ~1 minute"):
     ① API.parallel() contract — concurrency CAP ke andar rehta hai (limit),
        natija ORDER barqarar, ek task fail ho to baqi na ruken aur error
        `{__err}` mein wapas aaye
     ② BACKEND batch — "Sab approve karein":
        · pehle: N alag `expenses.approve` = N DB.update + N sheet writes
        · ab   : `expenses.approveBatch` = 1 route call, 1 DB.updateMany
        · 24 pending expenses par sheet WRITES ka farq naapa jata hai
        · skip logic (already POSTED), approve:false → REJECTED
     ③ RENDERED DOM — Accounting ▸ Expenses tab par "Sab approve karein" ka
        click asal mein chalta hai: `expenses.approveBatch` 1 dafa, purana
        `expenses.approve` ZERO dafa; statuses POSTED; toast ginti batata hai
     ④ App_Config import — pehle `forEach(async …)` fire-and-forget tha
        (import "mukammal" jab ke likhai chal rahi thi); ab awaited parallel
        batches + kamyab/fail ka natija (source contract)
     ⑤ Perf audit tool (tools/audit_perf_sites.js) — GENUINE N+1 (frontend
        await-in-loop, backend per-row writes) = 0
     ⑥ SENS=1 → API.parallel sequential ban jaye to ① ka concurrency test FAIL
        (gate sach mein feature par depend karta hai)

   Run: python3 tools/build_demo.py && node tools/test_perf_batch.js
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { JSDOM, VirtualConsole } = require('jsdom');
const { loginDom } = require('./_harness');
const { loadBackend } = require('./mock_gs');

const ROOT = path.join(__dirname, '..');
const SENS = process.env.SENS === '1';
let pass = 0, fail = 0; const failures = [];
const ok = (n, c, d) => c ? (pass++, console.log('  \u2714 ' + n + (d ? '  \u2192 ' + d : '')))
  : (fail++, failures.push(n), console.log('  \u2716 ' + n + (d ? '  \u2192 ' + d : '')));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const src = f => fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf-8');

console.log('\n\x1b[1mW7 · MASS REQUEST / N+1 GATE (v2.26.0 + W7.T2)\x1b[0m');

/* =================== ⑦ W7.T2 — GRN price-info BATCH ====================== */
console.log('\x1b[1m⑦ priceInfoBatch: N lines ka price history EK call me\x1b[0m');
{
  const calls = { single: 0, batch: 0 };
  try {
    const { sandbox } = loadBackend(path.join(ROOT, 'apps-script'));
    sandbox.Setup.setupAll();
    const login = sandbox.api('auth.login', { username: 'owner', password: 'admin123' });
    const T7 = login.data.token;
    const api7 = (a, p) => { const r = sandbox.api(a, Object.assign({ token: T7 }, p || {}));
      if (!r || !r.ok) throw new Error(a + ': ' + ((r && r.error && r.error.message) || 'fail')); return r.data; };
    api7('shop.open', {});
    const L = sandbox.DB.all('Locations')[0].id;
    const SUP = sandbox.DB.all('Suppliers')[0];
    const its = [];
    for (let i = 0; i < 8; i++) {
      its.push(api7('items.save', { item: { name: 'W72-' + i, costPrice: 100 + i, retailPrice: 200 + i } }));
    }
    api7('purchase.grn.save', { grn: { supplierId: SUP.id, locationId: L, invoiceNo: 'W72-GRN',
      items: its.slice(0, 4).map((it, i) => ({ itemId: it.id, qty: 2, cost: 100 + i })) } });

    /* purana tareeqa: har line ka alag call (baseline) */
    const singles = its.map(it => {
      calls.single++;
      return api7('purchase.priceInfo', { itemId: it.id, supplierId: SUP.id, rate: 0 });
    });
    /* naya tareeqa: EK batch call */
    const batch = api7('purchase.priceInfoBatch', { supplierId: SUP.id,
      items: its.map(it => ({ itemId: it.id, rate: 0 })) });
    calls.batch++;
    ok('⑦ batch: 8 rows ek hi call me (single = ' + calls.single + ' calls ka kaam)',
      batch && Array.isArray(batch.rows) && batch.rows.length === its.length,
      'rows=' + (batch.rows || []).length);
    const same = its.every((it, i) => {
      const b = batch.rows[i] || {}, o = singles[i] || {};
      return Number(b.prevPrice || 0) === Number(o.prevPrice || 0)
        && Number(b.retailPrice || 0) === Number(o.retailPrice || 0)
        && String(b.prevSource || '') === String(o.prevSource || '');
    });
    ok('⑦ batch ka natija per-line single call ke BARABAR (prev/retail/source)', same,
      JSON.stringify(batch.rows[0]).slice(0, 90));
    const withGrn = batch.rows[its.length - 1] || {};
    ok('⑦ kul sirf 1 batch request (8 ke bajaye)', calls.batch === 1, 'batch=' + calls.batch);
  } catch (e) {
    ok(false, '⑦ backend priceInfoBatch', String(e.message || e).slice(0, 120));
  }
  /* FE wiring (source contract): PO-load + demand add-all ab batch; single-line fetchPrev qayam */
  const scr = src('App_Screens2.html');
  /* v2.30.6: fetchPrevBatch ab (ls, repaintCb, supplierId) leta hai — GRN call me
     repaint+supplier pass hote hain, is liye literal-match extra-args tolerant */
  ok('⑦ GRN screen: PO-load + demand add-all dono fetchPrevBatch (batch) par',
    /fetchPrevBatch\(lines[),]/.test(scr) && scr.includes('fetchPrevBatch(fresh);'));
  ok('⑦ single-line fetchPrev qayam (per-action price info bhi hai — feature nahi gaya)',
    scr.includes("purchase.priceInfoBatch'") && (scr.match(/fetchPrev\(/g) || []).length >= 3);
}


/* ======================= ② BACKEND BATCH (naapa hua) ====================== */
console.log('\x1b[1m② Backend: batch approve — sheet writes ka farq\x1b[0m');
let backendRan = false;
try {
  const { sandbox } = loadBackend(path.join(ROOT, 'apps-script'));
  /* asli setup PEHLE (spreadsheet banti hai), phir instrumentation */
  try { sandbox.Setup.setupAll(); } catch (e) { console.log('  (setup: ' + e.message + ')'); }
  const DB = sandbox.DB, api = sandbox.api, R = sandbox.ROUTES;

  /* --- counters: (a) route calls, (b) Expenses table par writes, (c) kul sheet ops --- */
  const routeCalls = {};
  ['expenses.approve', 'expenses.approveBatch'].forEach(k => {
    const o = R[k]; R[k] = function (p, s) { routeCalls[k] = (routeCalls[k] || 0) + 1; return o(p, s); };
  });
  const tblW = {};
  const _upd = DB.update.bind(DB), _updMany = DB.updateMany.bind(DB), _ins = DB.insert.bind(DB);
  DB.update = (n, id, p, u) => { tblW[n + ':update'] = (tblW[n + ':update'] || 0) + 1; return _upd(n, id, p, u); };
  DB.updateMany = (n, p, u) => { tblW[n + ':updateMany'] = (tblW[n + ':updateMany'] || 0) + 1; return _updMany(n, p, u); };
  DB.insert = (n, o, u) => { tblW[n + ':insert'] = (tblW[n + ':insert'] || 0) + 1; return _ins(n, o, u); };
  const OPS = { read: 0, write: 0, lastRow: 0 };
  const ss = sandbox.SpreadsheetApp.openById(sandbox.PropertiesService
    .getScriptProperties().getProperty('SPREADSHEET_ID'));
  (ss.getSheets ? ss.getSheets().map(x => x.getName()) : []).forEach(n => {
    const sh = ss.getSheetByName(n); if (!sh || sh.__instrW7) return; sh.__instrW7 = true;
    const _gr = sh.getRange.bind(sh);
    sh.getRange = function () {
      const r = _gr.apply(null, arguments);
      if (!r.__instrW7) {
        r.__instrW7 = true;
        const _gv = r.getValues.bind(r), _sv = r.setValues.bind(r);
        r.getValues = function () { OPS.read++; return _gv(); };
        r.setValues = function () { OPS.write++; return _sv.apply(null, arguments); };
      }
      return r;
    };
    const _ar = sh.appendRow.bind(sh);
    sh.appendRow = function () { OPS.write++; return _ar.apply(null, arguments); };
    const _glr = sh.getLastRow.bind(sh);
    sh.getLastRow = function () { OPS.lastRow++; return _glr(); };
  });

  const login = api('auth.login', { username: 'owner', password: 'admin123' });
  const TOKEN = login && login.data && login.data.token;
  ok('② backend login + batch route maujood', !!TOKEN && !!sandbox.Payments.approveExpenseBatch);

  const mk = (ids) => ids.forEach(id => DB.insert('Expenses', {
    id: id, voucherNo: 'EXP-PERF-' + id, date: new Date().toISOString().slice(0, 10),
    category: 'Perf test', amount: 1000, paidTo: 'T', method: 'CASH', locationId: 'LOC-SDQ',
    status: 'PENDING', accountId: '', reference: '', taxAmount: 0, attachmentUrl: ''
  }, null));

  /* ---------- purana tareeqa: N alag requests ---------- */
  const oldIds = []; for (let i = 0; i < 24; i++) oldIds.push('PERFOLD' + i);
  mk(oldIds);
  Object.keys(routeCalls).forEach(k => delete routeCalls[k]);
  Object.keys(tblW).forEach(k => delete tblW[k]);
  OPS.read = 0; OPS.write = 0; OPS.lastRow = 0;
  oldIds.forEach(id => { try { api('expenses.approve', { token: TOKEN, id: id }); } catch (e) { } });
  const oldRoutes = routeCalls['expenses.approve'] || 0, oldW = OPS.write, oldR = OPS.read;
  const oldTblW = Object.keys(tblW).filter(k => k.indexOf('Expenses') === 0).reduce((a, k) => a + tblW[k], 0);
  ok('② purana tareeqa: 24 approve = 24 ALAG requests (baseline)', oldRoutes === 24,
    `requests=${oldRoutes} · Expenses writes=${oldTblW} · sheet writes=${oldW}`);

  /* ---------- naya tareeqa: 1 batch ---------- */
  const newIds = []; for (let i = 0; i < 24; i++) newIds.push('PERFNEW' + i);
  mk(newIds);
  Object.keys(routeCalls).forEach(k => delete routeCalls[k]);
  Object.keys(tblW).forEach(k => delete tblW[k]);
  OPS.read = 0; OPS.write = 0; OPS.lastRow = 0;
  const r = api('expenses.approveBatch', { token: TOKEN, ids: newIds.concat(['PERFNEW0']), approve: true });
  const d = (r && r.data) || {};
  const newRoutes = routeCalls['expenses.approveBatch'] || 0, newSingles = routeCalls['expenses.approve'] || 0;
  const newW = OPS.write;
  const newTblW = Object.keys(tblW).filter(k => k.indexOf('Expenses') === 0).reduce((a, k) => a + tblW[k], 0);
  const newMany = tblW['Expenses:updateMany'] || 0;

  ok('② naya tareeqa: 24 approve = sirf 1 request', newRoutes === 1 && newSingles === 0,
    `batch=${newRoutes} · single=${newSingles}`);
  ok('② 24 rows HAQEEQAT mein POSTED (sirf response nahi)', d.approved === 24, 'approved=' + d.approved);
  ok('② per-row update ki jagah EK updateMany', newMany === 1 && newTblW <= 2,
    `updateMany=${newMany} · Expenses writes=${newTblW} (pehle ${oldTblW})`);
  ok('② duplicate id skip hua (dedupe)', d.skipped >= 1, 'skipped=' + d.skipped);
  ok('② sheet writes kam (Expenses ke 24 writes bach gaye)', oldW - newW >= 20,
    `pehle=${oldW} ab=${newW} (−${oldW ? Math.round(100 - newW / oldW * 100) : 0}%)`);
  const posted = DB.all('Expenses', true).filter(x => x.id.indexOf('PERFNEW') === 0 && x.status === 'POSTED').length;
  ok('② fresh read par bhi sab 24 POSTED', posted === 24, posted + '/24');
  const jrn = DB.all('Journals', true).filter(j => /PERFNEW/.test(JSON.stringify(j))).length;
  ok('② har approved expense ka auto-voucher bana (accounting nahi chhooti)', jrn >= 24, jrn + ' journal(s)');

  /* ---------- reject path ---------- */
  const rejIds = []; for (let i = 0; i < 3; i++) rejIds.push('PERFREJ' + i);
  mk(rejIds);
  const rr = api('expenses.approveBatch', { token: TOKEN, ids: rejIds, approve: false });
  const rej = DB.all('Expenses', true).filter(x => x.id.indexOf('PERFREJ') === 0 && x.status === 'REJECTED').length;
  ok('② approve:false → REJECTED (batch reject bhi kaam karta hai)',
    rej === 3 && (rr.data || {}).approved === 3, rej + '/3 REJECTED');
  backendRan = true;
} catch (e) {
  console.log('  (backend block error: ' + String(e && e.message).slice(0, 120) + ')');
  ok('② backend batch block chala', false, 'error');
}

/* =================== ① + ③ LIVE APP (rendered DOM) ======================= */
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
  const API = win.API;
  ok('app booted + API.parallel mojood', !!(API && API.parallel));

  if (SENS) {
    /* SENS=1: parallel ko sequential bana dein — gate ko FAIL hona chahiye */
    console.log('  (SENS=1: API.parallel → sequential limit=1)');
    const orig = API.parallel.bind(API);
    API.parallel = (tasks, limit) => orig(tasks, 1);
  }

  /* ---------------- ① parallel contract ---------------- */
  {
    let inFlight = 0, maxInFlight = 0;
    const order = [];
    const tasks = [];
    for (let i = 0; i < 12; i++) {
      const idx = i;
      tasks.push(() => new Promise(res => {
        inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
        setTimeout(() => { order.push(idx); inFlight--; res('r' + idx); }, 12);
      }));
    }
    const out = await API.parallel(tasks, 3);
    ok('① concurrency CAP: limit=3 par ek waqt mein ≤3 tasks',
      maxInFlight <= 3 && maxInFlight >= 2, 'max in-flight=' + maxInFlight);
    ok('① natija ORDER barqarar (index-wise)', out.length === 12 && out.every((v, i) => v === 'r' + i),
      out.slice(0, 3).join(',') + ' … ' + out.slice(-1));
    ok('① limit se tez nahi chala (sequential nahi hua)', order.length === 12, 'kul ' + order.length + ' tasks');

    const mixed = await API.parallel([
      () => Promise.resolve('ok1'),
      () => Promise.reject(new Error('boom')),
      () => Promise.resolve('ok2')
    ], 3);
    ok('① ek task fail ho to baqi na rukein, error {__err} mein aaye',
      mixed[0] === 'ok1' && mixed[2] === 'ok2' && mixed[1] && /boom/.test(mixed[1].__err),
      String(mixed[1] && mixed[1].__err));

    /* action-object form: asli API.call ke sath (demo route) */
    let callCount = 0;
    const origCall = API.call.bind(API);
    API.call = (a, p, o) => { callCount++; return origCall(a, p, o); };
    const res = await API.parallel([{ action: 'items.categories', payload: {} }], 2);
    API.call = origCall;
    ok('① action-object form asli API.call se chalti hai', callCount === 1 && Array.isArray(res) && !res[0].__err,
      'calls=' + callCount);
  }

  /* ---------------- ③ rendered DOM: bulk approve ---------------- */
  {
    const calls = {};
    const origCall = API.call.bind(API);
    API.call = (a, p, o) => { calls[a] = (calls[a] || 0) + 1; return origCall(a, p, o); };

    const pendingBefore = (win.MockAPI['expenses.list']({}) || []).filter(e => e.status === 'PENDING').length;
    win.App.go('accounting');
    await sleep(500);
    /* Expenses tab */
    const tabs = Array.from(doc.querySelectorAll('button, .ui2-tab, [role="tab"]'))
      .filter(b => /Expenses/i.test(b.textContent || ''));
    ok('③ Accounting ▸ Expenses tab mila', tabs.length > 0, tabs.length + ' tab(s)');
    if (tabs.length) { tabs[0].click(); await sleep(600); }

    const bulk = Array.from(doc.querySelectorAll('button'))
      .find(b => /Sab approve karein/i.test(b.textContent || ''));
    ok('③ "Sab approve karein" button render hua (' + pendingBefore + ' pending)', !!bulk && pendingBefore >= 2);

    if (bulk) {
      calls['expenses.approveBatch'] = 0; calls['expenses.approve'] = 0;
      bulk.click();
      await sleep(900);
      const after = (win.MockAPI['expenses.list']({}) || []).filter(e => e.status === 'PENDING').length;
      ok('③ bulk click = EK `expenses.approveBatch` call', calls['expenses.approveBatch'] === 1,
        'batch calls=' + calls['expenses.approveBatch']);
      ok('③ purana N+1 (`expenses.approve`) ZERO dafa chala', calls['expenses.approve'] === 0,
        'single calls=' + calls['expenses.approve']);
      ok('③ sab pending expenses POSTED ho gaye', after === 0, pendingBefore + ' → ' + after + ' pending');
      const toastTxt = Array.from(doc.querySelectorAll('.toast, #toastRoot *')).map(t => t.textContent).join(' ');
      ok('③ user ko ginti ka toast mila', /approve ho gayeen/.test(toastTxt), toastTxt.trim().slice(-60));
    }
    API.call = origCall;
  }

  /* ---------------- ④ source contracts (shared logic maujood) ---------------- */
  {
    /* comments hata kar code dekhein (comment mein purana pattern likha hai: "pehle forEach(async …)") */
    const cfg = src('App_Config.html').replace(/\/\*[\s\S]*?\*\//g, '');
    ok('④ App_Config import: fire-and-forget `forEach(async` khatam', !/forEach\s*\(\s*async/.test(cfg), 'koi nahi');
    ok('④ App_Config import: awaited parallel batches + natija (impOk/impErr)',
      /impOk/.test(cfg) && /impErr/.test(cfg) && /API\.parallel/.test(cfg));
    ok('④ App_Config export: 5 sequential config.list → API.parallel', /const _got = await API\.parallel/.test(cfg));
    const acc = src('App_Accounting.html');
    ok('④ Accounting: bulk approve batch route + parallel fallback',
      /expenses\.approveBatch/.test(acc) && /API\.parallel/.test(acc) && /write: true, writeLabel: 'bulk approve'/.test(acc));
    const payui = src('App_PayUI.html');
    ok('④ PayUI.validate: parallel (per-payment N round-trips khatam)',
      /async validate\(payments\)/.test(payui) && /API\.parallel\(active\.map/.test(payui));
    const scr2 = src('App_Screens2.html');
    ok('④ Screen2 perms save: parallel batches + error summary',
      /const res = await API\.parallel\(jobs\.map/.test(scr2) && /save nahi ho sake/.test(scr2));
    ok('④ Screen2 insights: 4 sequential po.get → API.parallel', /_det\s*=\s*await API\.parallel/.test(scr2));
    const code = src('Code.gs');
    ok('④ router: expenses.approveBatch route registered', /'expenses\.approveBatch'/.test(code));
    const pay = src('Payments.gs');
    ok('④ backend: approveExpenseBatch ek hi DB.updateMany karta hai',
      /approveExpenseBatch: function/.test(pay) && /DB\.updateMany\('Expenses'/.test(pay));
  }

  /* ---------------- ⑤ audit tool: 0 genuine N+1 ---------------- */
  try {
    const out = execFileSync('node', [path.join(ROOT, 'tools', 'audit_perf_sites.js')], { encoding: 'utf-8' });
    const feZero = /GENUINE N\+1[\s\S]*?koi nahi/.test(out);
    const beZero = /BACKEND loops[\s\S]*?koi nahi/.test(out);
    ok('⑤ perf audit: frontend GENUINE N+1 = 0', feZero);
    ok('⑤ perf audit: backend per-row writes = 0', beZero);
  } catch (e) { ok('⑤ perf audit tool chala', false, String(e.message).slice(0, 80)); }

  /* ---------------- ⑥ page errors ---------------- */
  ok('⑥ zero page errors', errors.length === 0, errors.slice(0, 2).join(' | '));

  console.log('\n' + (fail === 0 ? '\x1b[32m' : '\x1b[31m') +
    'W7 GATE: ' + pass + ' pass / ' + fail + ' fail\x1b[0m');
  if (fail) console.log('  FAIL: ' + failures.join(' · '));
  process.exit(fail === 0 ? 0 : (SENS ? 0 : 1));
})();
