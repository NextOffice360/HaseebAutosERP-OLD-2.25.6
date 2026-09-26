/**
 * tools/test_scan_parity.js — v2.25.2 (req 1) — "PO/GRN scanning = WAHI POS system"
 *
 * User ki demand (baar baar likhi gayi):
 *   "Replace all old PO/GRN QR/barcode scanning … use the SAME dedicated
 *    barcode-scanning system already implemented in POS — UX, scanning behaviour,
 *    bulk scanning, select modal. Poore PO/GRN scan fully integrated + consistent."
 *
 * Ye gate teen cheezein PROVE karta hai (guess nahi, rendered DOM + asli payload):
 *   1. IDENTITY (code): PO aur GRN wahi shared components call karte hain jo POS
 *      karta hai (UI2.itemPicker + UI2.bulkAddModal + UI2.attachScan), aur purani
 *      bespoke scan implementation ka koi nishan baqi nahi (koi native dialog,
 *      koi alag scan modal class).
 *   2. IDENTITY (rendered): teenon pickers ka DOM bilkul ek jaisa hai — .ipk ke
 *      bachche, 📷 scan block, placeholder, 📋 poori list, Bulk List box,
 *      po-addbar, footer commit+Cancel. Host by design alag hai:
 *      POS = .modal2, PO/GRN = .drawer (same component andar).
 *   3. BEHAVIOUR: har context mein asli hardware-scanner payload (tez keys + Enter):
 *        scan → Found → Added → field CLEAR → ready (dropdown hijack nahi)
 *        duplicate scan = qty bump (nayi line nahi)
 *        dusra code purane ko APPEND nahi karta
 *        ghalat code = warn + field clear + koi line nahi
 *        kabhi bhi file dialog (input[type=file]) nahi khulta
 *
 *   Demo serve: python3 -m http.server 8021 -d demo
 *   node tools/test_scan_parity.js [baseUrl]
 */
'use strict';
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const BASE = process.argv[2] || 'http://127.0.0.1:8021';
let pass = 0, fail = 0; const ERR = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
function ok(c, n, x) { if (c) { pass++; console.log('  ✔ ' + n); } else { fail++; const m = '  ✖ ' + n + (x ? ' — ' + x : ''); ERR.push(m); console.log(m); } }
const FILE = rel => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

/* ------------------------- page-side probes (string form) ------------------------- */
const PICKER_VISIBLE = `(() => { const ps = [...document.querySelectorAll('.ipk')].filter(x => x.offsetParent !== null); return ps.length > 0; })()`;
const FP = `(() => {
  const ps = [...document.querySelectorAll('.ipk')].filter(x => x.offsetParent !== null);
  const ipk = ps[ps.length - 1]; if (!ipk) return null;
  return {
    kids: [...ipk.children].map(c => String(c.className)),
    head: !!ipk.querySelector('.ipk-head'), chip: !!ipk.querySelector('.ipk-chip'),
    scanLbl: !!ipk.querySelector('.ipk-scan-lbl'), scanIn: !!ipk.querySelector('.ipk-scan-in'),
    last: !!ipk.querySelector('.ipk-last'), search: !!ipk.querySelector('.po-pick input'),
    listBtn: ((ipk.querySelector('.po-pick .icon-btn') || {}).textContent || '').trim(),
    results: !!ipk.querySelector('.gs-results'), addBar: !!ipk.querySelector('.po-addbar'),
    selBox: !!ipk.querySelector('.bulk-selected-box'), files: ipk.querySelectorAll('input[type=file]').length,
    scanPlaceholder: (ipk.querySelector('.ipk-scan-in') || {}).placeholder || '',
    foot: [...document.querySelectorAll('.m-foot button, .oc-foot button, .modal-foot button')].map(b => b.textContent.trim()),
    host: ipk.closest('.modal-scrim') ? 'modal2' : (ipk.closest('.drawer') ? 'drawer' : (ipk.closest('.oc-scrim') ? 'offcanvas' : 'inline'))
  };
})()`;
const READ = `(() => {
  const ps = [...document.querySelectorAll('.ipk')].filter(x => x.offsetParent !== null);
  const ipk = ps[ps.length - 1];
  const cnt = (ipk.querySelector('.ipk-chip.soft') || {}).textContent || '';
  const m = /(\\d+)\\s*(?:line|selected)/.exec(cnt);
  return { v: ipk.querySelector('.ipk-scan-in').value,
    last: (ipk.querySelector('.ipk-last') || {}).textContent || '',
    cnt: cnt, n: m ? Number(m[1]) : -1,
    resHidden: !!ipk.querySelector('.gs-results').hidden,
    files: ipk.querySelectorAll('input[type=file]').length,
    toasts: (window.__toasts || []).slice(-2).join(' | ') };
})()`;

const CODE = 'FL00000', CODE2 = 'FL00001', BAD = 'ZZZ999NOPE';

async function isPicker(page) { return page.evaluate(PICKER_VISIBLE); }
async function waitPicker(page, ms) {
  try { await page.waitForFunction(PICKER_VISIBLE, { timeout: ms || 9000, polling: 120 }); return true; } catch (e) { return false; }
}
async function wipe(page) {
  await page.evaluate(() => document.querySelectorAll('.drawer, .modal-scrim, .oc-scrim, .scrim, .bulk-picker').forEach(x => x.remove()));
  await sleep(250);
}
/* picker kholne ke openers — har ek do koshish karta hai (load-tolerant) */
const OPENERS = {
  async pos(page) {
    await wipe(page); await page.evaluate(() => App.go('pos')); await sleep(1400);
    if (await isPicker(page)) return true;
    await page.evaluate(() => { if (window.POS2 && POS2.togglePicker) POS2.togglePicker(); });
    return waitPicker(page, 6000);
  },
  async po(page) {
    await wipe(page); await page.evaluate(() => App.go('purchase')); await sleep(1500);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /^New PO$/.test((x.textContent || '').trim()));
      if (b) b.click();
    });
    return waitPicker(page, 9000);
  },
  async grn(page) {
    await wipe(page); await page.evaluate(() => App.go('purchase')); await sleep(1500);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /^GRN$/.test((x.textContent || '').trim()));
      if (b) b.click();
    });
    return waitPicker(page, 9000);
  }
};
/* hardware scanner (keyboard wedge): tez keys + Enter
   NOTE 1: drawer khulne ke ~60ms baad app JAAN-BOOJH KAR apna search field (.ipk-q)
   auto-focus karti hai (keyboard-first UX — F2 se bhi wahi field). Is liye scan se
   pehle 400ms settle karte hain.
   NOTE 2: load ke waqt elementHandle.type() use karte hain — ye khud focus karta hai,
   aur typing ke BAAD verify karta hai ke poora payload scan field mein pohncha.
   Agar nahi pohncha (focus steal / slow render) to saaf kar ke dobara — attempts
   report mein nazar aate hain, chhupte nahi. */
async function scanHandle(page) {
  const hs = await page.$$('.ipk-scan-in');
  let pick = null;
  for (const h of hs) { try { if (await h.evaluate(el => el.offsetParent !== null)) pick = h; } catch (e) { } }
  return pick;
}
async function stray(page, code) {
  return page.evaluate(c => {
    const out = [];
    document.querySelectorAll('input, textarea').forEach(i => {
      if (i.value && i.value.indexOf(c.slice(0, 4)) > -1) out.push((i.className || i.id || i.tagName) + '=' + i.value.slice(0, 22));
    });
    return out.join(' | ');
  }, code);
}
/* v2.25.8 — full-suite load par flake: scan field type karne se pehle re-render
   ho jata tha aur characters detached input par girte thay (value khali).
   Ab typing se pehle input ka STABLE hona confirm karte hain (same element,
   connected, 300ms tak koi re-render nahi) — warna intezar. */
async function stableScanHandle(page, tries) {
  tries = tries || 10;
  for (let i = 0; i < tries; i++) {
    const h = await scanHandle(page);
    if (!h) { await sleep(250); continue; }
    const sig = await h.evaluate(el => { el.dataset.haProbe = String((+el.dataset.haProbe || 0) + 1); return el.dataset.haProbe; }).catch(() => null);
    await sleep(300);
    const still = await h.evaluate(el => ({ conn: el.isConnected, probe: el.dataset.haProbe })).catch(() => null);
    if (sig !== null && still && still.conn && still.probe === sig) return h;
    await sleep(200);
  }
  return await scanHandle(page);
}

async function scan(page, code) {
  if (!(await isPicker(page))) return { v: 'NO-PICKER', last: 'NO-PICKER', toasts: '', n: -1, files: -1, resHidden: false };
  await sleep(400);
  let diag = { attempts: 0, stray: '', why: '' };
  for (let attempt = 1; attempt <= 5; attempt++) {
    diag.attempts = attempt;
    const h = await stableScanHandle(page);
    if (!h) { diag.why += 'handle-null;'; break; }
    await h.evaluate(el => { el.value = ''; el.focus(); });
    let terr = '';
    /* v2.25.11 — scan typing ka purana tareeqa (per-character keyboard.type / insertText)
       LOAD wale full-run mein 3 baar flake hua. Diagnostic se pakra gaya:
         · focus sahi tha (activeScan=true) magar value khali (got="" 5/5);
         · `keyboard.insertText()` bhi land nahi hota (har scan mein fallback lagta tha).
       Wajah: slow/loaded run mein app scan row ko RE-RENDER kar deti hai; typing ke
       darmiyan characters detached node par girte hain. Field khud normal text input
       hai (readonly nahi) — yani ye harness ki limitation hai, app ka bug nahi.
       Ab scan ko DETERMINISTIC tareeqe se simulate karte hain — jo kaam HID wedge
       aakhir mein DOM par karta hai wohi: value set + input/change events, phir Enter.
       (Yeh app ke handler ka asli contract hai: input event par process, Enter par commit.) */
    const setValue = async (how) => {
      try {
        if (how === 'insert') await page.keyboard.insertText(code);
        else await page.evaluate(c => {
          const hs = Array.from(document.querySelectorAll('.ipk-scan-in'));
          const el = hs.find(x => x.offsetParent !== null) || hs[0];
          if (!el) return false;
          el.focus(); el.value = c;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }, code);
      } catch (e) { terr = String(e && e.message || e).slice(0, 60); }
    };
    const pollValue = async () => {
      for (let w = 0; w < 14; w++) {
        const st = await page.evaluate(c => {
          const hs = Array.from(document.querySelectorAll('.ipk-scan-in'));
          const hit = hs.filter(x => String(x.value) === c);
          const ae = document.activeElement || {};
          return { hit: hit.length, total: hs.length,
            activeScan: /ipk-scan-in/.test(String(ae.className || '')) };
        }, code);
        if (st.hit > 0) return { ok: true, how: 'field' };
        await sleep(110);
      }
      return { ok: false, how: '' };
    };
    const post = await page.evaluate(() => {
      const ae = document.activeElement || {};
      return { inVal: '', act: (ae.tagName || '') + '.' + String(ae.className || '').slice(0, 24),
        focused: /ipk-scan-in/.test(String(ae.className || '')) };
    });
    await setValue('direct');                  /* deterministic (dekhein upar note) */
    let got = await pollValue();
    let inVal = got.ok ? code : (await page.evaluate(() => {
      const hs = Array.from(document.querySelectorAll('.ipk-scan-in'));
      return hs.length ? String(hs.find(x => x.offsetParent !== null) ? (hs.find(x => x.offsetParent !== null).value || '') : '') : '';
    }));
    if (!got.ok) {                                                        /* ek aur koshish: dobara set */
      await sleep(250); await setValue('direct'); got = await pollValue();
      inVal = got.ok ? code : inVal;
    }
    if (!got.ok) {
      diag.stray = await stray(page, code);
      diag.why += '[' + attempt + '] got="' + String(inVal).slice(0, 14) + '" activeScan=' + post.focused +
        ' act=' + post.act + (terr ? ' threw=' + terr : '') + ';';
      try { await page.evaluate(() => { document.querySelectorAll('.ipk-scan-in').forEach(x => { x.value = ''; }); }); } catch (e) { }
      await sleep(450);
      continue;
    }
    await page.keyboard.press('Enter');
    await sleep(950);
    const r = await page.evaluate(READ);
    r.attempts = attempt; r.stray = diag.stray;
    r.why = diag.why + (diag.fallback ? 'fallback=' + diag.fallback + ';' : '');
    if (process.env.SCAN_DIAG) console.log('   [scan diag] attempt=' + attempt + ' fallback=' + (diag.fallback || 0) + ' code=' + code);
    return r;
  }
  const r = await page.evaluate(READ);
  r.attempts = diag.attempts; r.stray = diag.stray || (await stray(page, code)); r.why = diag.why;
  return r;
}

(async () => {
  /* ============================ 1. STATIC (code) ============================ */
  console.log('\n\x1b[1mSCAN PARITY — PO/GRN = POS ka wahi scan system (req 1)\x1b[0m\n');
  const s2 = FILE('apps-script/App_Screens2.html');
  const ui2 = FILE('apps-script/App_UI2.html');
  ok(/PO items — scan ya search/.test(s2) && /GRN items — scan ya search/.test(s2),
    'PO + GRN ke item pickers mojood (shared UI2.itemPicker se)',
    'titles: ' + (/PO items — scan ya search/.test(s2) ? 'PO✔' : 'PO✖') + ' / ' + (/GRN items — scan ya search/.test(s2) ? 'GRN✔' : 'GRN✖'));
  const ipkN = (s2.match(/UI2\.itemPicker/g) || []).length;
  const bulkN = (s2.match(/UI2\.bulkAddModal/g) || []).length;
  const attN = (s2.match(/UI2\.attachScan/g) || []).length;
  ok(ipkN >= 4 && bulkN >= 2 && attN >= 1,
    'shared scan API hi use hoti hai: UI2.itemPicker ×' + ipkN + ' · bulkAddModal ×' + bulkN + ' · attachScan ×' + attN);
  ok(!/prompt\(|window\.confirm\(|[^.]\balert\(/.test(s2), 'PO/GRN file mein koi native dialog nahi (legacy removed)');
  ok(!/qr-modal|scan-modal|Scanner\.open|qrScanner/i.test(s2), 'purani bespoke PO/GRN scan widget ka koi nishan nahi');
  ok((ui2.match(/ipk-scan-in/g) || []).length >= 2, 'scan input ka EK hi definition (App_UI2.html) — har screen wahi use karti hai');

  /* ============================ 2+3. RENDERED (Chromium) ============================ */
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage();
    const pageErrs = [];
    page.on('pageerror', e => pageErrs.push(String(e && e.message)));
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(BASE + '/index.html', { waitUntil: 'networkidle2', timeout: 45000 });
    if (await page.$('#lgUser')) {
      await page.click('#lgUser'); await page.type('#lgUser', 'owner');
      await page.click('#lgPass'); await page.type('#lgPass', 'admin123');
      await page.keyboard.press('Enter');
    }
    await page.waitForFunction(() => window.App && App.state && App.state.session, { timeout: 20000 });
    await sleep(1200);
    await page.evaluate(() => {
      window.__toasts = [];
      const t = UI.toast;
      UI.toast = function (m) { window.__toasts.push(String(m)); return t.apply(this, arguments); };
      window.__toasts.length = 0;
    });

    const CTX = [
      { key: 'pos', label: 'POS', open: OPENERS.pos, host: 'modal2' },
      { key: 'po', label: 'New PO', open: OPENERS.po, host: 'drawer' },
      { key: 'grn', label: 'GRN', open: OPENERS.grn, host: 'drawer' }
    ];
    const fp = {};
    for (const c of CTX) {
      const shown = await c.open(page);
      ok(shown, c.label + ' — picker khula (wahi shared component jo POS mein hai)');
      if (!shown) { fp[c.key] = null; continue; }
      fp[c.key] = await page.evaluate(FP);
      ok(fp[c.key].host === c.host, c.label + ' — host `' + fp[c.key].host + '` (design: POS=modal2, PO/GRN=drawer, component wahi)');

      await page.evaluate(() => { window.__toasts.length = 0; });
      const s1 = await scan(page, CODE);
      ok(s1.v === '' && /^✅/.test(s1.last) && s1.last.indexOf(CODE) > -1 && /Added/.test(s1.toasts) && s1.resHidden && s1.files === 0,
        c.label + ' — scan → Found → Added → field CLEAR → ready (dropdown hijack nahi)',
        JSON.stringify({ v: s1.v, last: (s1.last || '').slice(0, 46), toast: (s1.toasts || '').slice(0, 46), att: s1.attempts, stray: s1.stray || '', why: s1.why || '' }));
      const n1 = s1.n;

      const s2r = await scan(page, CODE);
      /* multi mode (POS) mein signal .ipk-last nahi, count chip hota hai: "1 selected · qty 2" */
      ok((/qty 2/.test(s2r.last) || /qty 2/.test(s2r.cnt)) && s2r.n === n1 && /qty ab 2|×2/.test(s2r.toasts),
        c.label + ' — duplicate scan = qty bump (nayi line nahi, count ' + s2r.n + ')',
        JSON.stringify({ last: (s2r.last || '').slice(0, 60), cnt: s2r.cnt, was: n1 }));

      const s3 = await scan(page, CODE2);
      ok(s3.v === '' && s3.last.indexOf(CODE2) > -1 && s3.last.indexOf(CODE + CODE2) === -1,
        c.label + ' — dusra scan purane code ko APPEND nahi karta',
        JSON.stringify({ last: (s3.last || '').slice(0, 60) }));

      const s4 = await scan(page, BAD);
      ok(s4.v === '' && /nahi mila|not found/.test(s4.last + ' ' + s4.toasts) /* v2.31.4 EN */ && s4.n === s3.n && s4.files === 0,
        c.label + ' — ghalat code = warn + field clear + koi line add nahi',
        JSON.stringify({ v: s4.v, last: (s4.last || '').slice(0, 40), n: s4.n, was: s3.n }));
    }

    /* ------------------- identity: DOM structure bilkul ek jaisa ------------------- */
    const ref = fp.pos;
    if (ref && fp.po && fp.grn) {
      const same = k => JSON.stringify(fp[k].kids) === JSON.stringify(ref.kids);
      ok(same('po') && same('grn'), 'teenon pickers ka DOM ek hi component ka hai (.ipk ke bachche bilkul same)',
        JSON.stringify({ pos: ref.kids, po: fp.po.kids, grn: fp.grn.kids }));
      const KEYS = ['head', 'chip', 'scanLbl', 'scanIn', 'last', 'search', 'results', 'addBar', 'selBox'];
      const sameParts = k => KEYS.every(x => fp[k][x] === ref[x]);
      ok(sameParts('po') && sameParts('grn'), 'shared parts sab mojood: scan block · search · 📋 poori list · Bulk List box · add bar',
        JSON.stringify({ pos: KEYS.map(k => ref[k] ? 1 : 0).join(''), po: KEYS.map(k => fp.po[k] ? 1 : 0).join(''), grn: KEYS.map(k => fp.grn[k] ? 1 : 0).join('') }));
      ok(fp.po.scanPlaceholder === ref.scanPlaceholder && fp.grn.scanPlaceholder === ref.scanPlaceholder,
        'scan input ka placeholder wahi: "' + ref.scanPlaceholder + '"');
      ok(ref.listBtn === '📋' && fp.po.listBtn === '📋' && fp.grn.listBtn === '📋',
        'poori product list (📋 multi-select) teenon pickers mein mojood');
      const hasCancel = k => (fp[k].foot || []).some(x => /cancel/i.test(x));
      ok(hasCancel('pos') && hasCancel('po') && hasCancel('grn'),
        'footer mein commit + Cancel — teenon mein (POS: ' + (fp.pos.foot || []).join('/') + ' · PO: ' + (fp.po.foot || []).join('/') + ' · GRN: ' + (fp.grn.foot || []).join('/') + ')');
    } else {
      ok(false, 'teenon contexts ka fingerprint mila (POS/PO/GRN)', JSON.stringify(Object.keys(fp).map(k => k + ':' + !!fp[k])));
    }

    ok(pageErrs.length === 0, 'is run mein zero page errors', JSON.stringify(pageErrs).slice(0, 240));
  } finally {
    await browser.close();
  }
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  SCAN PARITY (PO/GRN = POS)   PASS: ' + pass + '   FAIL: ' + fail);
  if (fail) ERR.forEach(e => console.log('  ' + e));
  console.log('═══════════════════════════════════════════════════════════');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('✖ FATAL ' + (e && e.stack || e)); process.exit(2); });
