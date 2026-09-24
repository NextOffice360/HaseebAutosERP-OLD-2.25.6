#!/usr/bin/env node
/* ==========================================================================
   test_w13_modules.js — v2.30.4 · W13 gate (B§8 CONVERSION UNITS + module audit)
   --------------------------------------------------------------------------
   Spec (MASTER-REQUIREMENTS B§8): PO/GRN/inventory — conversion unit AUTO-calc:
   "1 BOX = 12 PCS → Rs 3,000" — user pack mein qty/rate de, base units/cost
   khud ban jayein. Audit (2026-09-25):
     • PO form me pehle se tha (v2.9 §8 — App_Screens2 pack conversion)
     • GRN DIRECT lines me tha hi nahi (scan/bulk add ke baad sirf base units)
     • Backend invariant: GRN hamesha BASE units mein store karta hai
   Fix (T13.1): grnMap + picker map par conv/mode + direct GRN render par
   BOX↔PCS switch (wahi auto-calc jo PO me hai). PO lines base mein aati hain
   is liye unhein switch nahi milta (double-conversion se bachao).

   Ye gate pin karta hai:
   PART1 — source: grnMap/picker conv + GRN switch + PO conv mehfooz + backend
           base-unit invariant (koi conv multiply backend me nahi)
   PART2 — DOM (asli GRN form, F100002 = conversionFactor 12):
           ④ line add → pack switch nazar (×12) ⑤ BOX mode: 1 pack + Rs 3,000
           → amount Rs 3,000 · ⑥ wapas PCS: qty 12 / cost 250 (auto-calc dono
           tareef) ⑦ zero page errors

   Run: node tools/test_w13_modules.js [baseUrl]   (login: owner/admin123)
   ========================================================================== */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const BASE = process.argv[2] || 'http://127.0.0.1:8021';
const ROOT = path.resolve(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ERR = [];
const ok = (n, c, d) => c ? (pass++, console.log('  \u2714 ' + n + (d ? '  \u2192 ' + d : '')))
  : (fail++, ERR.push(n + (d ? ' \u2014 ' + d : '')), console.log('  \u2716 ' + n + (d ? '  \u2192 ' + d : '')));
const src = f => fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf-8');

(async () => {
  console.log('\n\x1b[1mW13 · B\u00a78 CONVERSION UNITS GATE (v2.30.4)\x1b[0m');
  const s2 = src('App_Screens2.html');
  const pur = src('Purchase.gs');

  /* ---------------- PART1: source contract ---------------- */
  console.log('\n  \x1b[1mPART 1 — source contract\x1b[0m');

  const grnMapConv = /grnMap = \(r, qty\) => \(\{[\s\S]{0,500}conv: Math\.max\(1, Number\(r\.conversionFactor \|\| 1\)\), mode: 'PCS'/.test(s2);
  const pickerConv = /map: \(r, qty\) => \(\{ itemId: r\.id, code: r\.code, name: r\.name, unit: r\.unit,[\s\S]{0,500}conv: Math\.max\(1, Number\(r\.conversionFactor \|\| 1\)\), mode: 'PCS'/.test(s2);
  ok('\u2460 GRN direct lines: grnMap + picker map dono par conv/mode', grnMapConv && pickerConv);

  const grnSwitch = /canPack \? h\('button', \{ class: 'link-btn'[\s\S]{0,220}l\.mode = l\.mode === 'BOX' \? 'PCS' : 'BOX'/.test(s2);
  const grnBoxMath = /l\.qty = isBox \? Math\.round\(v \* l\.conv \* 1000\) \/ 1000 : v/.test(s2)
    && /l\.cost = isBox \? Math\.round\(\(v \/ l\.conv\) \* 100\) \/ 100 : v/.test(s2);
  const poGuard = /const canPack = !isPO\(\) && l\.conv > 1/.test(s2);
  ok('\u2461 GRN render: BOX\u2194PCS switch + auto-calc; PO lines par switch NAHI (base aati hain)',
    grnSwitch && grnBoxMath && poGuard);

  const poConv = /v2\.9 \u00a78 \u2014 pack conversion/.test(s2)
    && /l\.qty = isBox \? r2q\(v \* l\.conv\) : v/.test(s2)
    && /l\.rate = isBox \? Math\.round\(\(v \/ l\.conv\) \* 100\) \/ 100 : v/.test(s2);
  ok('\u2462 PO pack conversion (v2.9 \u00a78) salamat', poConv);

  const m = pur.match(/saveGRN: function \(payload, s\) \{[\s\S]{0,400}U\.sum\(items, function \(i\) \{ return U\.num\(i\.qty\)[\s\S]{0,80}U\.num\(i\.cost\)/);
  const noConvBE = !/U\.num\(i\.conv|conversionFactor/.test((pur.match(/saveGRN: function \(payload, s\) \{[\s\S]{0,2000}/) || [''])[0]);
  ok('\u2463 Backend base-unit invariant: GRN total = \u03a3 qty\u00d7cost (conv multiply backend me NAHI)',
    !!m && noConvBE);

  /* ---------------- PART2: rendered DOM ---------------- */
  console.log('\n  \x1b[1mPART 2 — rendered DOM (asli GRN, F100002 conv=12)\x1b[0m');
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const errs = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', e => errs.push(String(e && e.message).slice(0, 130)));
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(BASE + '/index.html', { waitUntil: 'networkidle2', timeout: 45000 });
    if (await page.$('#lgUser')) {
      await page.click('#lgUser'); await page.type('#lgUser', 'owner');
      await page.click('#lgPass'); await page.type('#lgPass', 'admin123');
      await page.keyboard.press('Enter');
    }
    await page.waitForFunction(() => window.App && App.state && App.state.session, { timeout: 20000 });
    await sleep(1500);
    await page.evaluate(() => App.go('purchase'));
    await sleep(1800);

    /* header ka GRN button (supplier_autofill gate jaisa poll) */
    let opened = false;
    for (let i = 0; i < 14 && !opened; i++) {
      opened = await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('button')).find(x =>
          /^GRN\b|^GRN$/.test((x.textContent || '').trim()) && (x.textContent || '').trim().length < 24
          && x.offsetParent !== null && !x.disabled);
        if (b) { b.click(); return true; } return false;
      });
      if (!opened) await sleep(400);
    }
    ok('\u2463 GRN form khula (screen header ke GRN button se)', opened);

    /* picker input me exact code type + Enter → line (sirf VISIBLE picker —
       purchase screen ke chhupe PO pickers background me ho sakte hain) */
    const added = await (async () => {
      for (let i = 0; i < 10; i++) {
        const has = await page.evaluate(() =>
          Array.from(document.querySelectorAll('.ipk-q')).some(x => x.offsetParent !== null));
        if (has) {
          return page.evaluate(async () => {
            const inp = Array.from(document.querySelectorAll('.ipk-q'))
              .filter(x => x.offsetParent !== null)[0];
            inp.focus();
            await new Promise(r => setTimeout(r, 800));   /* focus → rows load */
            inp.value = 'F100002';
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            await new Promise(r => setTimeout(r, 900));   /* debounced search */
            inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            await new Promise(r => setTimeout(r, 1000));
            const l = document.querySelector('.grn-line');
            return l ? { name: (l.querySelector('.pl-name b') || {}).textContent || '' } : null;
          });
        }
        await sleep(500);
      }
      return null;
    })();
    ok('\u2464 Scan/search se pack-item line add (F100002, conv=12)',
      !!added && /Formula1/i.test(added.name || ''), added && added.name);

    const pack = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('.grn-line .link-btn'))
        .find(b => /Buying per pack/.test(b.textContent || ''));
      return { found: !!btn, label: btn ? btn.textContent.trim() : '' };
    });
    ok('\u2465 Pack switch nazar (auto \u00d712)', pack.found && /12/.test(pack.label), pack.label);

    /* BOX mode: qty 1 pack, rate Rs 3,000/pack → base 12 \u00d7 250 = Rs 3,000 */
    const box = await page.evaluate(async () => {
      const btn = Array.from(document.querySelectorAll('.grn-line .link-btn'))
        .find(b => /Buying per pack/.test(b.textContent || ''));
      if (!btn) return { err: 'no switch' };
      btn.click(); await new Promise(r => setTimeout(r, 500));
      const line = document.querySelector('.grn-line');
      const q = line.querySelector('input[aria-label^="Receive qty"]');
      const c = line.querySelector('input[aria-label^="Unit cost"]');
      q.value = '1'; q.dispatchEvent(new Event('change', { bubbles: true }));
      c.value = '3000'; c.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 500));
      const line2 = document.querySelector('.grn-line');
      const q2 = line2.querySelector('input[aria-label^="Receive qty"]');
      const c2 = line2.querySelector('input[aria-label^="Unit cost"]');
      const amt = (line2.querySelector('b.pl-num') || {}).textContent || '';
      return { q: q2.value, c: c2.value, amt: amt.trim(), modeLbl: (line2.querySelector('.link-btn') || {}).textContent || '' };
    });
    ok('\u2466 BOX mode: 1 pack + Rs 3,000/pack \u2192 amount Rs 3,000 (base 12\u00d7250 auto)',
      !box.err && box.q === '1' && /3,000/.test(box.amt), JSON.stringify(box));

    /* wapas PCS: display base units par laut-ta hai */
    const pcs = await page.evaluate(async () => {
      const btn = Array.from(document.querySelectorAll('.grn-line .link-btn'))
        .find(b => /Switch to per-base/.test(b.textContent || ''));
      if (!btn) return { err: 'no back-switch' };
      btn.click(); await new Promise(r => setTimeout(r, 500));
      const line = document.querySelector('.grn-line');
      const q = line.querySelector('input[aria-label^="Receive qty"]');
      const c = line.querySelector('input[aria-label^="Unit cost"]');
      const amt = (line.querySelector('b.pl-num') || {}).textContent || '';
      return { q: q.value, c: c.value, amt: amt.trim() };
    });
    ok('\u2467 Wapas base mode: qty 12 / cost 250 / amount Rs 3,000 qayam',
      !pcs.err && Number(pcs.q) === 12 && Number(pcs.c) === 250 && /3,000/.test(pcs.amt), JSON.stringify(pcs));

    ok('\u2468 Zero page errors', errs.length === 0, errs.length ? errs[0] : 'clean');
  } catch (e) {
    ok('PART2 browser flow', false, String(e && e.message).slice(0, 110));
  } finally { await browser.close(); }

  /* ---------------- summary ---------------- */
  console.log('\n\x1b[1mSUMMARY:\x1b[0m ' + pass + ' pass \u00b7 ' + fail + ' fail \u00b7 ' + (fail ? '\x1b[31mRED\x1b[0m' : '\x1b[32mGREEN\x1b[0m'));
  if (fail) { console.log('FAILED:\n' + ERR.map(x => '  - ' + x).join('\n')); process.exit(1); }
})().catch(e => { console.error('FATAL:', e && e.message); process.exit(1); });
