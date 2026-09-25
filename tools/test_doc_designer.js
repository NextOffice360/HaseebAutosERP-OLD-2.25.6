#!/usr/bin/env node
/* D14 (round-9) — LABEL/RECEIPT DESIGNER deep-DOM gate
   Spec: HBC DOCUMENT INTELLIGENCE §9 (designer live-preview) — ab RENDERED DOM par:
   har control (Title / Show-title / Footer / Terms / Font size / Label preset)
   preview ko FORAN update karta hai. Pehle code-level audit tha (D9); ye DOM sach hai. */
const path = require('path');
const puppeteer = require('puppeteer');
const ROOT = path.join(__dirname, '..');
const BASE = process.argv[2] || 'http://127.0.0.1:8021';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  \u2714 ' + n + (d ? '  \u2192 ' + d : '')); } else { fail++; console.log('  \u2716 ' + n + (d ? '  \u2192 ' + d : '')); } };

(async () => {
  console.log('\n\u001b[1mD14 · DESIGNER DEEP-DOM GATE (live-preview = rendered DOM)\u001b[0m');
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const errs = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', e => errs.push(String(e && e.message).slice(0, 90)));
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(BASE + '/index.html', { waitUntil: 'networkidle2', timeout: 45000 });
    await sleep(1800);
    if (await page.$('#lgUser')) {
      await page.click('#lgUser'); await page.type('#lgUser', 'owner');
      await page.click('#lgPass'); await page.type('#lgPass', 'admin123');
      await page.keyboard.press('Enter');
    }
    await page.waitForFunction(() => window.App && App.state && App.state.session, { timeout: 20000 });
    await sleep(1200);

    /* ---------------- RECEIPT designer: live text controls ---------------- */
    await page.evaluate(async () => {
      await Print2.designer('RECEIPT', { id: 'd14', name: 'D14', json: JSON.stringify({}) }, () => { });
    });
    await sleep(900);
    const modal1 = await page.evaluate(() => !!document.querySelector('.modal-scrim .modal2'));
    ok(modal1, 'RECEIPT designer modal khula');

    const setTitle = await page.evaluate(async () => {
      /* v2.30.6: textInput() = <label.f-col><span>Title</span><input/></label> */
      const inp = [].slice.call(document.querySelectorAll('.modal2 .f-col'))
        .filter(c => /^Title$/.test((c.querySelector('span') || {}).textContent || ''))
        .map(c => c.querySelector('input'))[0];
      if (!inp) return { found: false };
      inp.value = 'D14 LIVE CHECK'; inp.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 500));
      const pv = document.querySelector('.modal2 .print-preview');
      return { found: true, live: !!(pv && /D14 LIVE CHECK/.test(pv.textContent || '')) };
    });
    ok(setTitle.found, 'Title control mojood (aria-label)');
    ok(setTitle.live, 'Title badla → preview FORAN update (live paint)');

    const unTitle = await page.evaluate(async () => {
      const chk = [].slice.call(document.querySelectorAll('.modal2 input[type=checkbox]'))
        .find(x => /show title/i.test(((x.closest('label') || x.parentElement).textContent || '')));
      if (!chk) return { found: false };
      chk.click();
      await new Promise(r => setTimeout(r, 500));
      const pv = document.querySelector('.modal2 .print-preview');
      const gone = pv && !/D14 LIVE CHECK/.test(pv.textContent || '');
      chk.click();
      await new Promise(r => setTimeout(r, 400));
      const back = pv && /D14 LIVE CHECK/.test(pv.textContent || '');
      return { found: true, gone: gone, back: back };
    });
    ok(unTitle.found && unTitle.gone && unTitle.back,
      'Show-title toggle → title hide + wapas (dono live)', JSON.stringify(unTitle));

    const setFoot = await page.evaluate(async () => {
      const inp = [].slice.call(document.querySelectorAll('.modal2 .f-col'))
        .filter(c => /^Footer/.test((c.querySelector('span') || {}).textContent || ''))
        .map(c => c.querySelector('input'))[0];
      if (!inp) return { found: false };
      inp.value = 'D14 FOOTER TEST'; inp.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 500));
      const pv = document.querySelector('.modal2 .print-preview');
      return { found: true, live: !!(pv && /D14 FOOTER TEST/.test(pv.textContent || '')) };
    });
    ok(setFoot.found && setFoot.live, 'Footer control → preview live update');

    const setTerms = await page.evaluate(async () => {
      /* terms schema def:false (by-design off) — pehle field-toggle ON, phir text */
      /* field-toggle .df-row me checkbox + .df-label SIBLING hain (nested label nahi) */
      const row = [].slice.call(document.querySelectorAll('.modal2 .df-row'))
        .find(r => /^Terms/i.test(((r.querySelector('.df-label') || {}).textContent || '').trim()));
      const tgl = row && row.querySelector('input[type=checkbox]');
      if (tgl && !tgl.checked) { tgl.click(); await new Promise(r => setTimeout(r, 400)); }
      const inp = [].slice.call(document.querySelectorAll('.modal2 .f-col'))
        .filter(c => /^Terms/.test((c.querySelector('span') || {}).textContent || ''))
        .map(c => c.querySelector('input'))[0];
      if (!inp) return { found: false, toggled: !!tgl };
      inp.value = 'D14 TERMS TEST'; inp.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 500));
      const pv = document.querySelector('.modal2 .print-preview');
      return { found: true, toggled: !!tgl, live: !!(pv && /D14 TERMS TEST/.test(pv.textContent || '')) };
    });
    ok(setTerms.found && setTerms.live, 'Terms toggle+text → preview live update', JSON.stringify(setTerms));

    /* close receipt designer */
    await page.evaluate(() => { const b = [].slice.call(document.querySelectorAll('.modal2 button')).find(x => /^✕$|close/i.test(x.textContent || x.className)); if (b) b.click(); });
    await sleep(400);

    /* ---------------- LABEL designer: preset + sample render ---------------- */
    await page.evaluate(async () => {
      await Print2.designer('LABEL', { id: 'd14l', name: 'D14L', json: JSON.stringify({}) }, () => { });
    });
    await sleep(1600);
    const lbl = await page.evaluate(async () => {
      const m = document.querySelector('.modal-scrim .modal2');
      if (!m) return { open: false };
      /* label sample item preview mein render hona chahiye (deep-DOM) */
      const hasSample = /FLAMINGO DASHBOARD POLISH/.test(m.textContent || '');
      /* preset chip click → preview refresh (koi crash nahi) */
      const chip = [].slice.call(m.querySelectorAll('.chip2')).find(x => /retail/i.test(x.textContent || ''));
      if (chip) { chip.click(); await new Promise(r => setTimeout(r, 700)); }
      const pv = m.querySelector('.print-preview');
      return { open: true, hasSample: hasSample, previewAlive: !!pv && pv.children.length > 0,
        paper: !!m.querySelector('.pp-paper') };
    });
    ok(lbl.open, 'LABELS designer modal khula');
    ok(lbl.hasSample, 'Label preview me SAMPLE ITEM render (deep DOM)');
    ok(lbl.previewAlive && lbl.paper, 'Preset click ke baad preview zinda (paper render)', JSON.stringify(lbl));

    ok(errs.length === 0, 'zero page errors designer flows me', errs.slice(0, 3).join(' | '));
  } catch (e) {
    fail++;
    console.log('  \u2716 FATAL ' + (e && e.message));
  } finally {
    await browser.close().catch(() => { });
  }
  console.log('\n  D14 DESIGNER   PASS: ' + pass + '   FAIL: ' + fail);
  process.exit(fail ? 1 : 0);
})();
