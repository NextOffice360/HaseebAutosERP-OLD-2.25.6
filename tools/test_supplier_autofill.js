/**
 * tools/test_supplier_autofill.js — v2.30.0 gate (N10)
 * ============================================================================
 * User ki shikayat: "PO mein supplier select karne par uski maloomat aa jati hai —
 * GRN aur doosri screens par wahi behaviour chahiye (contact, address, tax,
 * payment terms waghera automatically populate hon)."
 *
 * ROOT CAUSE (do hisse):
 *   ① `Purchase.gs ▸ supplierStatement` supplier ka sirf {name, phone, terms}
 *      bhejta tha → address / email / NTN / credit limit UI tak pohnchte hi nahi thay.
 *   ② GRN form par supplier select badalne par card refresh hi nahi hota tha
 *      (sirf ek dafa load hota tha) → purani supplier ki info chipki rehti thi.
 *
 *   PART 1 — backend: statement mein poora supplier master (seeded demo supplier se)
 *   PART 2 — rendered DOM: GRN par supplier chunein → contact/address/tax/terms/limit
 *     card mein aa jayein; doosra supplier chunein → values TAZA (fresh) (stale nahi);
 *     New PO par wahi behaviour (parity); khali fields (email/ntn) par noise na ho.
 *
 *   node tools/test_supplier_autofill.js [file|http]      (~60s)
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

/* ============================== PART 1 — backend ========================== */
console.log('\n\x1b[1mPART 1 — backend: supplierStatement poora master bhejta hai\x1b[0m');
const { sandbox: s } = loadBackend(path.join(ROOT, 'apps-script'));
s.setupAll();
const login = s.api('auth.login', { username: 'owner', password: 'admin123' });
const TOKEN = login.data.token;
const api = (a, p) => {
  const r = s.api(a, Object.assign({ token: TOKEN }, p || {}));
  if (!r || !r.ok) throw new Error(a + ': ' + ((r && r.error && r.error.message) || 'fail'));
  return r.data;
};
const sup = s.DB.findOne('Suppliers', r => r.code === 'DEMO-SUP');
const st = api('purchase.supplierStatement', { supplierId: sup.id }).supplier || {};
const NEED = ['code', 'name', 'phone', 'email', 'address', 'ntn', 'creditLimit', 'paymentTerms'];
ok(NEED.every(k => k in st), '① statement mein supplier master ke saare fields', NEED.filter(k => !(k in st)).join(',') || '8/8 ✔');
ok(!!st.address && !!st.ntn && Number(st.creditLimit) > 0 && !!st.paymentTerms,
  '② fresh install ka demo supplier tax/limit/terms ke saath seed hota hai',
  JSON.stringify({ address: st.address, ntn: st.ntn, limit: st.creditLimit, terms: st.paymentTerms }));
ok(st.name === sup.name && st.phone === sup.phone, '③ values supplier record se hi aati hain (guess nahi)');

/* ============================== PART 2 — DOM ============================== */
(async () => {
  const puppeteer = require('puppeteer');
  const TARGET = process.argv[2] || ('file://' + path.join(ROOT, 'demo', 'index.html'));
  console.log('\n\x1b[1mPART 2 — rendered DOM: GRN + PO supplier auto-populate\x1b[0m');
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
  await sleep(1600);

  /* expected data backend se (UI ka claim backend truth se match ho) */
  async function supTruth(id) {
    return page.evaluate(async (sid) => {
      const r = await API.call('purchase.supplierStatement', { supplierId: sid }, { offlineFallback: () => null }).catch(() => null);
      return (r && r.supplier) || null;
    }, id);
  }

  await page.evaluate(() => App.go('purchase'));
  await sleep(1800);

  /** screen header ka action button (GRN / New PO) — async load ki wajah se poll */
  async function clickAction(rx) {
    for (let i = 0; i < 14; i++) {
      const hit = await page.evaluate(r => {
        const re = new RegExp(r, 'i');
        const b = Array.from(document.querySelectorAll('button')).find(x => {
          const t = (x.textContent || '').trim();
          return re.test(t) && t.length < 24 && x.offsetParent !== null && !x.disabled;
        });
        if (b) { b.click(); return true; }
        return false;
      }, rx);
      if (hit) return true;
      await sleep(400);
    }
    return false;
  }
  /** supplier select wala form taiyar hone tak intezar */
  const waitForm = () => page.waitForFunction(() =>
    Array.from(document.querySelectorAll('select')).some(s => Array.from(s.options).some(o => /select supplier/i.test(o.textContent || ''))),
    { timeout: 15000 });

  /** supplier chuno aur card parho */
  async function pickAndRead(supIdx) {
    const res = await page.evaluate(async (idx) => {
      const sel = Array.from(document.querySelectorAll('select'))
        .find(s => Array.from(s.options).some(o => /select supplier/i.test(o.textContent || '')));
      if (!sel) return { err: 'supplier select nahi mila' };
      const opts = Array.from(sel.options).filter(o => o.value);
      const opt = opts[idx];
      if (!opt) return { err: 'option nahi mili' };
      sel.value = opt.value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 1100));
      const cards = Array.from(document.querySelectorAll('.party-bal')).filter(c => c.offsetParent !== null && c.style.display !== 'none');
      const card = cards[cards.length - 1];
      const text = card ? (card.innerText || '').replace(/\s+/g, ' ').trim() : '';
      const labels = card ? Array.from(card.querySelectorAll('.pb-row span')).map(x => (x.textContent || '').trim()) : [];
      return { id: opt.value, name: opt.textContent.trim(), text: text, labels: labels, visible: !!card };
    }, supIdx);
    return res;
  }

  /* ---------- GRN ---------- */
  const openedGRN = await clickAction('GRN$|^GRN|\\bGRN\\b');
  ok(openedGRN, '⑤ GRN form khula (screen header ke GRN button se)');
  await waitForm().catch(() => { });
  await sleep(600);
  const g1 = await pickAndRead(0);
  ok(g1 && !g1.err && g1.visible, '⑥ GRN: supplier select karne par info card dikhta hai', g1 && (g1.err || g1.text.slice(0, 90)));
  const txt1 = (g1 && g1.text) || '';
  ok(/Contact/i.test(txt1) && /Address/i.test(txt1), '⑦ GRN: contact + address auto-populate', txt1.slice(0, 120));
  ok(/Tax \/ NTN/i.test(txt1), '⑧ GRN: tax / NTN (configured ho to)', txt1.slice(0, 160));
  ok(/Payment terms/i.test(txt1), '⑨ GRN: payment terms', txt1.slice(0, 160));
  ok(/Credit limit|Available credit/i.test(txt1), '⑩ GRN: credit limit + available credit', txt1.slice(0, 160));
  ok(/Prev\. balance/i.test(txt1) && /Total purchases/i.test(txt1), '⑪ GRN: purane balance rows barqarar (kuch hataya nahi)');
  const sup0 = await supTruth((g1 && g1.id) || '');
  ok(!sup0 || (sup0 && txt1.indexOf(String(sup0.name).slice(0, 10)) > -1) || txt1.indexOf(String((g1 && g1.name) || '').slice(0, 10)) > -1,
    '⑫ GRN: card usi supplier ka hai jo select hua', (g1 && g1.name) + ' / ' + (sup0 && sup0.name));
  ok(!sup0 || (String(sup0.phone || '').replace(/\D/g, '').slice(-7) ? txt1.replace(/\D/g, '').indexOf(String(sup0.phone).replace(/\D/g, '').slice(-7)) > -1 : true),
    '⑫b GRN: card ka contact backend ke phone se match karta hai', sup0 && sup0.phone);

  /* doosra supplier → stale na ho (asli bug) */
  const g2 = await pickAndRead(1);
  const txt2 = (g2 && g2.text) || '';
  ok(g2 && g2.id !== g1.id && txt2 !== txt1, '⑬ GRN: doosra supplier chunne par card TAZA (fresh) hota hai (stale info nahi)', (g2 && g2.id) + ' vs ' + (g1 && g1.id));
  const sup1 = await supTruth((g2 && g2.id) || '');
  const uniq = sup0 && sup1 && String(sup0.name).slice(0, 8) !== String(sup1.name).slice(0, 8);
  ok(g2 && txt2.indexOf(String((g2 && g2.name) || '').slice(0, 10)) > -1 && (!uniq || txt2.indexOf(String(sup0.name).slice(0, 8)) === -1),
    '⑭ GRN: naye supplier ka naam aur purane ka nahi', (g2 && g2.name));

  /* ---------- New PO (parity) ---------- */
  await page.keyboard.press('Escape');
  await sleep(700);
  const openedPO = await clickAction('New PO|^PO$|\\bPO\\b');
  ok(openedPO, '⑮ New PO form khula');
  await waitForm().catch(() => { });
  await sleep(600);
  const p1 = await pickAndRead(0);
  const ptxt = (p1 && p1.text) || '';
  ok(p1 && p1.visible && /Contact/i.test(ptxt) && /Address/i.test(ptxt) && /Payment terms/i.test(ptxt),
    '⑯ PO par bhi wahi card + wahi fields (GRN ↔ PO behaviour match)', ptxt.slice(0, 130));
  ok(/Credit limit|Available credit/i.test(ptxt), '⑰ PO par bhi credit limit', ptxt.slice(0, 150));

  /* legacy UI.form par dirty tracking (Save/Save All ka bunyaad) */
  const dirtyInfo = await page.evaluate(() => {
    const fs = (window.UI2 && UI2._forms) || [];
    const live = fs.filter(f => f && f.el && document.body.contains(f.el));
    const d = live.filter(f => typeof f.isDirty === 'function' && f.isDirty());
    return { live: live.length, dirty: d.length, keys: d.reduce((a, f) => a.concat(f.dirtyKeys()), []) };
  });
  ok(dirtyInfo.live > 0 && dirtyInfo.dirty > 0 && dirtyInfo.keys.indexOf('supplierId') > -1,
    '⑱ legacy form (GRN/PO) par dirty tracking kaam karta hai', JSON.stringify(dirtyInfo));
  ok(errs.length === 0, '⑲ zero page errors', errs.slice(0, 3).join(' | ') || '0');
  await browser.close();
  console.log('\n\x1b[1mSUMMARY:\x1b[0m ' + pass + ' pass · ' + fail + ' fail · ' + (fail ? '\x1b[31mRED\x1b[0m' : '\x1b[32mGREEN\x1b[0m'));
  if (fail) { console.log(ERR.map(e => ' - ' + e).join('\n')); process.exit(1); }
})();
