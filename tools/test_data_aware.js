/**
 * tools/test_data_aware.js — v2.30.0 (N10) data-aware / dependency-aware UI gate
 * ============================================================================
 * Shart: dropdowns/fields asli data se; dependent fields auto-populate;
 * parent badle to invalid child value CLEAR + validate before save; irrelevant
 * fields (bank sirf BANK par) chhupen — par hote hain (koi feature nahi jata).
 *
 *   PART 1 — backend truth:
 *     ① transfer from==to → backend reject (rule UI se pehle se hai)
 *     ② child category (parentId ke sath) save → list mein wapas aati hai
 *
 *   PART 2 — rendered DOM (shared UI2.form depOn/showWhen engine):
 *     ③ transfer: To-branch options mein From branch aati hi nahi (initial)
 *     ④ transfer: From badalne par To ke options dobar banti hain; jo To ab
 *        invalid ho (From == To) → CLEAR + toast (invalid child zinda nahi)
 *     ⑤ transfer: from==to bhejna → warn toast, API call NAHI jata (validate-before-save)
 *     ⑥ account form: bank fields GENERAL par chhupe; BANK type ya isBank ON par nazar
 *     ⑦ item form: subCategory ki suggestions selected category ki CHILD categories
 *        se (datalist); free typing qayam (values() mein aata hai)
 *     ⑧ zero page errors
 *
 *   export LD_LIBRARY_PATH=… ; node tools/test_data_aware.js [http://127.0.0.1:8021/]
 */
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const { loadBackend } = require('./mock_gs');
let pass = 0, fail = 0; const ERR = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✔', name); }
  else { fail++; const m = '  ✖ ' + name + (extra ? '  → ' + extra : ''); ERR.push(name); console.log(m); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

console.log('\x1b[1mPART 1 — backend: transfer rule + child category persist\x1b[0m');
{
  const { sandbox: s } = loadBackend(path.join(ROOT, 'apps-script'));
  s.Setup.setupAll();
  const login = s.api('auth.login', { username: 'owner', password: 'admin123' });
  const TOKEN = login.data.token;
  const api = (a, p) => {
    const r = s.api(a, Object.assign({ token: TOKEN }, p || {}));
    if (!r || !r.ok) throw new Error(a + ': ' + ((r && r.error && r.error.message) || 'fail'));
    return r.data;
  };
  const items = s.DB.all('Items').filter(r => String(r.status) !== 'DELETED');
  const iid = items[0].id;
  const locs = s.DB.all('Locations');
  const from = locs[0].id, to = locs[1].id;

  /* ① from==to reject */
  let err1 = '';
  try { api('stock.transfer.save', { transfer: { fromLocationId: from, toLocationId: from, items: [{ itemId: iid, qty: 1 }] } }); }
  catch (e) { err1 = String(e.message || e); }
  ok(/alag/i.test(err1), '① transfer from==to → backend reject (alag honay chahiye)', err1.slice(0, 70) || 'chal gaya!');

  /* ② child category persist */
  api('config.list.save', { entity: 'categories', record: { name: 'N10 Polish', parentId: locs[0].id === 'x' ? '' : (s.DB.all('Categories')[0] || {}).id } });
  const back = api('config.list', { entity: 'categories' }).filter(c => c.name === 'N10 Polish')[0] || {};
  ok(!!back.id && !!back.parentId, '② child category (parentId) save → list mein wapas (persist)', JSON.stringify(back));
}

(async () => {
  console.log('\x1b[1mPART 2 — rendered DOM: depOn / showWhen engine\x1b[0m');
  const puppeteer = require('puppeteer');
  const TARGET = process.argv[2] || ('file://' + path.join(ROOT, 'demo', 'index.html'));
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
  const setSel = (id, val) => page.evaluate((x, v) => {
    const el = document.getElementById(x);
    if (!el) return false;
    el.value = v;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }, id, val);

  /* ---------- ③④⑤ transfer form ---------- */
  await page.evaluate(async () => { App._noDirtyGuard = true; App.go('inventory'); await new Promise(r => setTimeout(r, 1000)); App._noDirtyGuard = false; });
  await sleep(2000);
  const t1 = await page.evaluate(async () => {
    const btn = Array.from(document.querySelectorAll('#view button')).find(b => /transfer/i.test(b.textContent || ''));
    if (!btn) return { err: 'Transfer button nahi mila' };
    btn.click();
    await new Promise(r => setTimeout(r, 600));
    const from = document.getElementById('f_fromLocationId');
    const to = document.getElementById('f_toLocationId');
    if (!from || !to) return { err: 'from/to select nahi mile' };
    const opts = () => Array.from(to.options).map(o => o.value);
    return { from: from.value, toOpts: opts(), fromInTo: opts().indexOf(from.value) > -1, fromName: (from.options[from.selectedIndex] || {}).textContent };
  });
  ok(!t1.err && t1.toOpts.length >= 2 && !t1.fromInTo,
    '③ To-branch options mein From branch NAHI (initial data-aware)', JSON.stringify(t1).slice(0, 160));

  const t2 = await page.evaluate(async () => {
    const from = document.getElementById('f_fromLocationId');
    const to = document.getElementById('f_toLocationId');
    /* To ko wohi branch banao jis par From JAANA hai → From wahan jate hi To invalid */
    const second = Array.from(from.options).map(o => o.value).find(v => v !== from.value);
    to.value = second;
    from.value = second;
    from.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 400));
    const toast = Array.from(document.querySelectorAll('#toastRoot .toast')).some(x => /alag/i.test(x.textContent || ''));
    return { newFrom: from.value, toVal: to.value, opts: Array.from(to.options).map(o => o.value), toast };
  });
  ok(t2.toVal === '' && t2.opts.indexOf(t2.newFrom) === -1 && t2.toast,
    '④ From badla → To ke options dobar; invalid To CLEAR + toast', JSON.stringify(t2).slice(0, 180));

  const t3 = await page.evaluate(async () => {
    const from = document.getElementById('f_fromLocationId');
    const to = document.getElementById('f_toLocationId');
    let calls = 0;
    const oc = API.call;
    API.call = function (a) { if (a === 'stock.transfer.save') { calls++; return Promise.resolve({}); } return oc.apply(this, arguments); };
    to.innerHTML = ''; to.appendChild(new Option('x', from.value)); to.value = from.value;   /* force invalid */
    const send = Array.from(document.querySelectorAll('.offcanvas button')).find(b => /^Send$/i.test((b.textContent || '').trim()));
    if (send) send.click();
    await new Promise(r => setTimeout(r, 600));
    API.call = oc;
    const toast = Array.from(document.querySelectorAll('#toastRoot .toast')).some(x => /alag|chunein/i.test(x.textContent || ''));
    return { calls: calls, toast };
  });
  ok(t3.calls === 0 && t3.toast, '⑤ from==to → warn toast, API call NAHI (validate-before-save)', JSON.stringify(t3));
  await page.evaluate(() => { document.querySelectorAll('.offcanvas, .oc-scrim').forEach(o => o.remove()); });

  /* ---------- ⑥ account form showWhen ---------- */
  await page.evaluate(async () => { App._noDirtyGuard = true; App.go('accounting'); await new Promise(r => setTimeout(r, 1000)); App._noDirtyGuard = false; });
  await sleep(2000);
  const a1 = await page.evaluate(async () => {
    /* 'New account' Chart of accounts sub-tab mein hota hai */
    const tab = Array.from(document.querySelectorAll('#view button')).find(b => /chart of accounts/i.test(b.textContent || ''));
    if (tab) { tab.click(); await new Promise(r => setTimeout(r, 800)); }
    const btn = Array.from(document.querySelectorAll('.actions button, #view button')).find(b => /new account/i.test(b.textContent || ''));
    if (!btn) return { err: 'New account button nahi mila (Chart of accounts tab?)' };
    btn.click();
    await new Promise(r => setTimeout(r, 600));
    const type = document.getElementById('f_type');
    const bn = document.getElementById('f_bankName');
    const an = document.getElementById('f_accountNo');
    const ib = document.getElementById('f_isBank');
    if (!type || !bn || !an) return { err: 'account fields nahi mile' };
    const vis = el => { const c = el.closest('.f-col'); return c ? c.style.display !== 'none' : true; };
    const general = { bn: vis(bn), an: vis(an) };
    type.value = 'BANK'; type.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    const bank = { bn: vis(bn), an: vis(an) };
    type.value = 'GENERAL'; type.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    if (ib) { ib.checked = true; ib.dispatchEvent(new Event('change', { bubbles: true })); }
    await new Promise(r => setTimeout(r, 300));
    const isBankOn = { bn: vis(bn), an: vis(an) };
    if (ib) { ib.checked = false; ib.dispatchEvent(new Event('change', { bubbles: true })); }
    await new Promise(r => setTimeout(r, 200));
    document.querySelectorAll('.modal2, .modal-scrim').forEach(o => o.remove());
    return { general: general, bank: bank, isBankOn: isBankOn };
  });
  ok(!a1.err && !a1.general.bn && !a1.general.an && a1.bank.bn && a1.bank.an && a1.isBankOn.bn,
    '⑥ bank fields: GENERAL par chhupe, BANK/isBank par nazar (irrelevant chhupe, feature salamat)', JSON.stringify(a1).slice(0, 160));

  /* ---------- ⑦ item form subCategory datalist ---------- */
  await page.evaluate(async () => {
    await API.call('config.list.save', { entity: 'categories', record: { name: 'N10 Polish', parentId: 'CAT-1' } });
    App.state.categories = await API.call('config.list', { entity: 'categories' });
    App._noDirtyGuard = true; App.go('items');
  });
  await page.waitForFunction(() => document.querySelectorAll('#view button').length > 3, { timeout: 20000 });
  await sleep(2000);
  const i1 = await page.evaluate(async () => {
    const btn = Array.from(document.querySelectorAll('.actions button, #view button')).find(b => /new item/i.test(b.textContent || ''));
    if (!btn) return { err: 'New Item button nahi mila' };
    btn.click();
    await new Promise(r => setTimeout(r, 700));
    const cat = document.getElementById('f_category');
    const sub = document.getElementById('f_subCategory');
    if (!cat || !sub) return { err: 'category/subCategory fields nahi mile' };
    cat.value = 'Car Care';
    cat.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 400));
    const dl = sub.__haDl || document.getElementById('dl_f_subCategory');
    const dlOpts = dl ? Array.from(dl.options || dl.querySelectorAll('option')).map(o => o.value) : [];
    sub.value = 'Naya Sub (custom)';
    sub.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 200));
    const form = (UI2._forms || []).filter(f => f.refs && f.refs.subCategory === sub)[0];
    const kept = form ? form.values().subCategory : '(form nahi mila)';
    document.querySelectorAll('.modal2, .modal-scrim').forEach(o => o.remove());
    return { dlOpts: dlOpts, kept: kept };
  });
  ok(!i1.err && i1.dlOpts.indexOf('N10 Polish') > -1,
    '⑦a subCategory suggestions = selected category ki children (asli data)', JSON.stringify(i1).slice(0, 160));
  ok(!i1.err && i1.kept === 'Naya Sub (custom)',
    '⑦b free typing QAYAM (values() mein custom subCategory)', JSON.stringify(i1).slice(0, 140));

  ok(errs.length === 0, '⑧ zero page errors', errs.slice(0, 3).join(' | ') || '0');

  await browser.close();
  console.log('\n\x1b[1mSUMMARY:\x1b[0m ' + pass + ' pass · ' + fail + ' fail · ' + (fail ? '\x1b[31mRED\x1b[0m' : '\x1b[32mGREEN\x1b[0m'));
  if (fail) { console.log(ERR.map(e => ' - ' + e).join('\n')); process.exit(1); }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
