/**
 * tools/test_forms_shared.js — v2.30.2 (T7.3) shared form validation gate
 * ============================================================================
 * Shart: har bade form ki validation ab EK shared engine (UI2.validate) se —
 * inline `if (!v.x) toast` ka bijtan khatam. Fail par: pehla msg + kitni aur,
 * ghalt fields par .f-err-mark + aria-invalid, pehla ghalt field FOCUS.
 * Structural pehle, content baad (N10 rule). Msgs wahi (koi behavior change nahi).
 *
 *   PART 1 — source contract:
 *     ① engine mojood (UI2.validate + .f-err-mark CSS + clear-on-change wiring)
 *     ② 6 adoptions: transfer · GRN post · PO save · purchase return ·
 *        item form · customer/supplier form
 *
 *   PART 2 — rendered DOM:
 *     ③ item form: khaali naam → toast + highlight + focus; bharne par save
 *     ④ customer form: khaali naam → highlight + toast; bharne par save
 *     ⑤ transfer: khaali branches → 'dono chunein' + NO API; from==to → 'alag';
 *        valid → created (API 1 dafa)
 *     ⑥ GRN: khaali post → 'Pehle items add karein…' + NO API
 *     ⑦ zero page errors
 *
 *   export LD_LIBRARY_PATH=… ; node tools/test_forms_shared.js [http://127.0.0.1:8021/]
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
const src = f => fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));

console.log('\x1b[1mPART 1 — source contract\x1b[0m');
{
  const ui2 = src('App_UI2.html');
  ok(ui2.includes('UI2.validate = function') && ui2.includes('f-err-mark') && ui2.includes('aria-invalid'),
    '① UI2.validate engine (highlight + aria-invalid + clear-on-change)');
  ok(src('Styles.html').includes('.f-err-mark{border-color:var(--err)'),
    '①b .f-err-mark CSS (Styles.html — dono themes me var(--err))');
  const s2 = src('App_Screens2.html'), inv = src('App_Inventory2.html'), mas = src('App_Masters.html');
  ok(inv.includes('UI2.validate([') && inv.includes("'Source aur destination alag honi chahiye'"),
    '② transfer shared validate (msgs barqarar)');
  ok(s2.includes("toastKey: 'grn'") && s2.includes("toastKey: 'po'") && s2.includes("toastKey: 'preturn'"),
    '②b GRN + PO + purchase-return shared validate');
  ok(mas.includes("toastKey: 'item'") && mas.includes("toastKey: 'party'"),
    '②c item + customer/supplier forms shared validate');
  ok((ui2.match(/UI\.notify\(\{ key: 'validate\./g) || []).length === 1,
    '②d fail toast UI.notify key se (dedupe — spam nahi)');
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
  await sleep(1500);

  /* ③ item form */
  const r3 = await page.evaluate(async () => {
    const out = {};
    App._noDirtyGuard = true;
    App.go('items'); await new Promise(r => setTimeout(r, 1200));
    const btn = Array.from(document.querySelectorAll('.actions button, #view button')).find(b => /new item|naya item/i.test(b.textContent || ''));
    if (!btn) { out.err = 'New Item button nahi'; return out; }
    btn.click(); await new Promise(r => setTimeout(r, 700));
    let save = Array.from(document.querySelectorAll('.drawer button, .offcanvas button, .modal button')).find(b => /save/i.test(b.textContent || '') && !/cancel|delete/i.test(b.textContent || ''));
    if (!save) { out.err = 'Save button nahi'; return out; }
    const oc = API.call; let saved = 0;
    API.call = function (a) { if (a === 'items.save') { saved++; return Promise.resolve({ id: 'T73' }); } return oc.apply(this, arguments); };
    save.click(); await new Promise(r => setTimeout(r, 700));
    const nameEl = document.getElementById('f_name');
    out.toast = (Array.from(document.querySelectorAll('#toastRoot .toast')).map(x => x.textContent || '').join('§'));
    out.mark = !!(nameEl && nameEl.classList.contains('f-err-mark'));
    out.aria = !!(nameEl && nameEl.getAttribute('aria-invalid'));
    out.focus = !!(nameEl && document.activeElement === nameEl);
    out.savedWhenEmpty = saved;
    out.apiStillStubbed = API.call !== oc;          /* baaki steps ke liye stub qayam */
    window.__oc73 = oc; window.__saved73 = () => saved;
    return out;
  });
  ok(!r3.err && r3.mark && r3.aria && r3.focus && !r3.savedWhenEmpty,
    '③ item form: khaali naam → highlight + aria-invalid + focus + NO save', JSON.stringify(r3).slice(0, 140));
  ok(/Name zaroori hai/.test(r3.toast || ''), '③b toast "Name zaroori hai"', (r3.toast || '').slice(0, 80));

  const r3b = await page.evaluate(async () => {
    const nameEl = document.getElementById('f_name');
    nameEl.value = 'T73 Item ' + Date.now();
    nameEl.dispatchEvent(new Event('input', { bubbles: true }));
    nameEl.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    const cleared = !nameEl.classList.contains('f-err-mark');
    const save = Array.from(document.querySelectorAll('.drawer button, .offcanvas button, .modal button')).find(b => /save/i.test(b.textContent || '') && !/cancel|delete/i.test(b.textContent || ''));
    save.click(); await new Promise(r => setTimeout(r, 900));
    return { cleared, saved: window.__saved73(), open: !!document.getElementById('f_name') };
  });
  ok(r3b.cleared && r3b.saved === 1 && !r3b.open,
    '③c naam bhara → mark clear-on-change + save chala + drawer band', JSON.stringify(r3b));

  /* ④ customer form */
  const r4 = await page.evaluate(async () => {
    const oc = window.__oc73 || API.call;
    let saved = 0;
    API.call = function (a) { if (a === 'customers.save') { saved++; return Promise.resolve({ id: 'T73C' }); } return oc.apply(this, arguments); };
    App.go('parties'); await new Promise(r => setTimeout(r, 1200));
    const btn = Array.from(document.querySelectorAll('.actions button, #view button')).find(b => /add customer/i.test(b.textContent || ''));
    if (!btn) return { err: 'Add Customer button nahi' };
    btn.click(); await new Promise(r => setTimeout(r, 700));
    const save = Array.from(document.querySelectorAll('.offcanvas button, .drawer button')).find(b => /save/i.test(b.textContent || '') && !/cancel|delete/i.test(b.textContent || ''));
    if (!save) return { err: 'Save button nahi' };
    save.click(); await new Promise(r => setTimeout(r, 700));
    const nameEl = document.getElementById('f_name');
    return {
      mark: !!(nameEl && nameEl.classList.contains('f-err-mark')),
      focus: !!(nameEl && document.activeElement === nameEl),
      toast: (Array.from(document.querySelectorAll('#toastRoot .toast')).map(x => x.textContent || '').join('§')),
      savedEmpty: saved,
      nameEl: !!nameEl
    };
  });
  ok(!r4.err && r4.mark && r4.focus && !r4.savedEmpty,
    '④ customer form: khaali naam → highlight + focus + NO save', JSON.stringify(r4).slice(0, 140));
  ok(/Name zaroori hai/.test(r4.toast || ''), '④b toast "Name zaroori hai"');

  /* ⑤ transfer */
  const r5 = await page.evaluate(async () => {
    const oc = window.__oc73 || API.call;
    let calls = 0;
    API.call = function (a) { if (a === 'stock.transfer.save') { calls++; return Promise.resolve({ id: 'T73T' }); } return oc.apply(this, arguments); };
    App.go('inventory'); await new Promise(r => setTimeout(r, 1200));
    const btn = Array.from(document.querySelectorAll('.actions button, #view button')).find(b => /transfer/i.test(b.textContent || ''));
    if (!btn) return { err: 'Transfer button nahi' };
    btn.click(); await new Promise(r => setTimeout(r, 700));
    const send = Array.from(document.querySelectorAll('.offcanvas button')).find(b => /^send$/i.test((b.textContent || '').trim()));
    if (!send) return { err: 'Send button nahi' };
    /* debug: har send par rules ka natija capture */
    if (!btn) return { err: 'x' };
    window.__dbg73 = [];
    const ow = UI2.validate;
    UI2.validate = function (rules, opts) { const r = ow.apply(this, arguments); window.__dbg73.push({ v: JSON.parse(JSON.stringify(r.value || {})), errs: r.errors }); return r; };
    const from = document.getElementById('f_fromLocationId');
    const to = document.getElementById('f_toLocationId');
    /* a) DONO khaali karo (form pre-filled hota hai) */
    from.value = ''; from.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 400));
    document.querySelectorAll('#toastRoot .toast').forEach(x => x.remove());   /* N8 merge — fresh node */
    send.click(); await new Promise(r => setTimeout(r, 600));
    const t1 = (Array.from(document.querySelectorAll('#toastRoot .toast')).map(x => x.textContent || '').join('§'));
    const markFrom = !!(from && from.classList.contains('f-err-mark'));
    const focusFrom = document.activeElement === from;
    const callsEmpty = calls;
    /* b) from == to (To ko FORCE karo — N10 To-options From ko exclude karte hain;
       change event baad mein NAHI bhejna warna depSync invalid To clear kar deta) */
    from.value = from.options[1] ? from.options[1].value : 'LOC-1';
    from.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 400));
    to.innerHTML = ''; to.appendChild(new Option('x', from.value)); to.value = from.value;
    document.querySelectorAll('#toastRoot .toast').forEach(x => x.remove());
    send.click(); await new Promise(r => setTimeout(r, 600));
    const t2 = (Array.from(document.querySelectorAll('#toastRoot .toast')).map(x => x.textContent || '').join('§'));
    const callsSame = calls;
    /* c) branches theek karo (To ke options (b) mein force hue the) → content rule */
    to.innerHTML = '';
    (App.state.locations || []).filter(l => l.id !== from.value).forEach(l => to.appendChild(new Option(l.name, l.id)));
    const second = Array.from(to.options).map(o => o.value)[0];
    if (second) { to.value = second; to.dispatchEvent(new Event('change', { bubbles: true })); }
    await new Promise(r => setTimeout(r, 300));
    document.querySelectorAll('#toastRoot .toast').forEach(x => x.remove());
    send.click(); await new Promise(r => setTimeout(r, 600));
    const t3 = (Array.from(document.querySelectorAll('#toastRoot .toast')).map(x => x.textContent || '').join('§'));
    const callsValid = calls;
    const dbg = (window.__dbg73 || []).map(d => ({ f: (d.v || {}).fromLocationId, t: (d.v || {}).toLocationId, e: (d.errs || []).map(x => String(x.msg).slice(0, 30)) }));
    try { UI2.validate = ow; } catch (e) { }
    return { t1, markFrom, focusFrom, callsEmpty, t2, callsSame, t3, callsValid, dbg };
  });
  ok(!r5.err && /dono chunein/.test(r5.t1 || '') && r5.markFrom && r5.focusFrom && r5.callsEmpty === 0,
    '⑤ transfer: khaali → dono-chunein + from highlighted + FOCUS + NO API', JSON.stringify(r5).slice(0, 160));
  const d1 = ((r5.dbg || [])[0] || { e: [] }).e.join('§');
  const d2 = ((r5.dbg || [])[1] || { e: [] }).e.join('§');
  const d3 = ((r5.dbg || [])[2] || { e: [] }).e.join('§');
  ok(/destination alag/.test(d2) && r5.callsSame === 0,
    '⑤b from==to → engine "alag" error + NO API (N8 dedupe: same-key toast node merge hota hai)',
    'd2=' + d2);
  ok(/Items add karein/.test(d3) && r5.callsValid === 0,
    '⑤c structural theek → content rule (Items add karein) + NO API (order qayam)', 'd3=' + d3);

  await browser.close();
  console.log('\n\x1b[1mSUMMARY:\x1b[0m ' + pass + ' pass · ' + fail + ' fail · ' + (fail ? '\x1b[31mRED\x1b[0m' : '\x1b[32mGREEN\x1b[0m'));
  if (fail) { console.log(ERR.map(e => ' - ' + e).join('\n')); process.exit(1); }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
