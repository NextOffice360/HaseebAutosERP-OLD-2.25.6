#!/usr/bin/env node
/* ==========================================================================
   test_settings_ui.js — Settings screen ko ASLI browser mein render kar ke
   dekhna. Standing rule: static audit se UI "done" nahi hota.
   --------------------------------------------------------------------------
   Bug jo isi test ne pakra: App_Config.html ka `defLabel()`/`defIcon()`
   `window.DEFS` parh rahe thay, jabke `let DEFS = []` local hai →
   `window.DEFS` kabhi set hi nahi hua → Settings ke 8 tabs hamesha
   fallback dikhate thay ("⚙business" instead of "🏪 Business Profile").
   route_audit aur test_logic (785 tests) dono ne ye nahi pakra — kyun ke
   dono sirf backend dekhte hain, rendered DOM nahi.

     python3 tools/build_demo.py   (pehle)
     node tools/test_settings_ui.js
   ========================================================================== */
const puppeteer = require('puppeteer');
const { login } = require('./_harness');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const DEMO = path.join(ROOT, 'demo', 'index.html');

let pass = 0, fail = 0; const failures = [];
const ok = (n, c, d) => c ? (pass++, console.log('  ✔ ' + n + (d ? '  → ' + d : '')))
  : (fail++, failures.push(n), console.log('  ✖ ' + n + (d ? '  → ' + d : '')));

if (!fs.existsSync(DEMO)) {
  console.log('✖ demo/index.html nahi mila — pehle: python3 tools/build_demo.py');
  process.exit(1);
}

(async () => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1440, height: 900 }
  });
  const page = await browser.newPage();
  await page.goto('file://' + DEMO, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 900));
  await login(page);            /* poll + login (shared harness) */
  await new Promise(r => setTimeout(r, 1000));
  await page.evaluate(() => window.App.go('settings'));
  await new Promise(r => setTimeout(r, 1600));

  const res = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('.tabbar-l1 .tab')]
      .map(t => t.textContent.trim());
    /* v2.6 QA — ab icons SVG hain (emoji nahi). Icon mojood hai agar
       .ti ke andar <svg> ho, ya (purane style me) emoji ho. */
    const iconInfo = [...document.querySelectorAll('.tabbar-l1 .tab')].map(t => {
      const ti = t.querySelector('.ti');
      const svg = ti ? ti.querySelector('svg') : null;
      const txt = ti ? (ti.textContent || '').trim() : '';
      return {
        label: t.textContent.trim(),
        svg: !!svg,
        emoji: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u.test(txt)
      };
    });
    return {
      windowDEFS: typeof window.DEFS,
      defsLen: (window.DEFS || []).length,
      tabs,
      iconInfo
    };
  });

  console.log('\n\x1b[1mSettings — rendered DOM\x1b[0m');
  ok('window.DEFS set hai (tab labels isi se aate hain)',
    res.windowDEFS === 'object' && res.defsLen > 0, res.windowDEFS + ' len=' + res.defsLen);

  /* BUG ka asli lakshya: koi bhi tab raw lowercase id na ho */
  const rawIds = ['business', 'pos', 'pwa', 'inventory', 'trade', 'modules', 'automation', 'security'];
  const broken = res.tabs.filter(t => rawIds.some(id => t === id || t.endsWith(id)));
  ok('koi tab raw lowercase id nahi dikhata (⚙business wala bug)',
    broken.length === 0, broken.length ? broken.join(', ') : res.tabs.slice(0, 3).join(' · '));

  ok('kam se kam 8 settings tabs hain', res.tabs.length >= 8, 'tabs=' + res.tabs.length);
  ok('har tab mein icon hai (SVG ya emoji — dono qabil-e-qabool)',
    (res.iconInfo || []).length > 0 && res.iconInfo.every(i => i.svg || i.emoji),
    (res.iconInfo || []).filter(i => i.svg).length + ' SVG / ' +
    (res.iconInfo || []).filter(i => i.emoji).length + ' emoji, kul ' + (res.iconInfo || []).length);

  /* ------------------------------------------------------------------------
     font sizes — v2.7 COMPACT SCALE (§1 tabdeel)
     ------------------------------------------------------------------------
     Purana rule "koi text 12px se chhota nahi" us waqt ka tha jab user ne
     TEXT BARA karne ko kaha tha. v2.7 mein user ne bataya ke text oversized
     hai aur chart/dense text ~9–9.6px hona chahiye.
     Ab do alag hadden:
       · CHART text (SVG <text>) → >= 9.2px   (compact, jaiz)
       · UI text   (HTML)        → >= 10.8px  (parhne layak)
     ------------------------------------------------------------------------ */
  const MIN_CHART = 9.2, MIN_UI = 10.8;
  const fs2 = await page.evaluate((mc, mu) => {
    const tiny = [];
    document.querySelectorAll('#view *').forEach(el => {
      if (!el.children.length && el.textContent.trim()) {
        const v = parseFloat(getComputedStyle(el).fontSize) || 0;
        if (!v) return;
        const floor = el.closest('svg') ? mc : mu;
        if (v < floor - 0.05) tiny.push(Math.round(v * 10) / 10 + 'px ' + el.textContent.trim().slice(0, 24));
      }
    });
    return { tinyCount: tiny.length, sample: tiny.slice(0, 5) };
  }, MIN_CHART, MIN_UI);
  ok('chart text >= ' + MIN_CHART + 'px, UI text >= ' + MIN_UI + 'px (v2.7 compact scale)',
    fs2.tinyCount === 0,
    fs2.tinyCount ? fs2.sample.join(' | ') : 'sab hadd ke andar');

  /* §9 / v2.6 QA — "report main QR aur Barcode bhi hoona chahiye" */
  const codes = await page.evaluate(() => {
    try {
      const html = window.HA_DayReport.codes({
        sessionNo: 'SES-SDQ-00042', sessionId: 'SES-1', date: '2026-09-18',
        locationId: 'LOC-SDQ', expectedCash: 12500
      });
      return { ok: true, svgs: (html.match(/<svg/g) || []).length, hasNo: /SES-SDQ-00042/.test(html) };
    } catch (e) { return { ok: false, err: e.message }; }
  });
  ok('day report mein barcode + QR dono bante hain', codes.ok && codes.svgs === 2,
    codes.ok ? 'svgs=' + codes.svgs : codes.err);
  ok('barcode ke neeche session no likha hai (type kar ke bhi dhoondh sakte hain)', !!codes.hasNo);

  /* Button width — user: "buttons ka background kafi jaga par big hay" */
  const btn = await page.evaluate(() => {
    const b = [...document.querySelectorAll('#view .btn')][0];
    if (!b) return { none: true };
    const r = b.getBoundingClientRect();
    const parent = b.parentElement.getBoundingClientRect();
    return { bw: Math.round(r.width), pw: Math.round(parent.width) };
  });
  ok('button poori chaurai par nahi phailta (text ke hisaab se)',
    btn.none || btn.bw < btn.pw - 20, btn.none ? 'no button' : btn.bw + 'px / ' + btn.pw + 'px');


  /* ══════════════════════════════════════════════════════════════════
     v2.6 QA — Settings sections (structure / separator / colour blocks)
     User: "ai Agents section properly structured nahi" +
           "ui main jahan bhi sections hain ... seperator, color coded blocks"
     Asal wajah: AI sub-tab me 7 DUPLICATE fields thin aur 24 fields
     bina kisi heading ke aik flat list me the.
     ══════════════════════════════════════════════════════════════════ */

  /* Automation ▸ AI assistant */
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('#view .tabs.l1 > .tabbar-l1 > .tab')]
      .find(x => /Automation/.test(x.textContent)); if (t) t.click();
  });
  await new Promise(r => setTimeout(r, 1200));
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('#view .tabs.l2 > .tabbar-l2 > .tab')]
      .find(x => /assistant/i.test(x.textContent)); if (t) t.click();
  });
  await new Promise(r => setTimeout(r, 1800));

  const ai = await page.evaluate(() => {
    const v = document.getElementById('view');
    const blocks = [...v.querySelectorAll('.cfg-secs > .ui2-block')];
    return {
      blocks: blocks.length,
      heads: blocks.map(b => {
        const hd = b.querySelector('.sec-head');
        return hd ? hd.textContent.trim().slice(0, 34) : null;
      }),
      tones: blocks.map(b => {
        const hd = b.querySelector('.sec-head');
        if (!hd) return null;
        return [...hd.classList].filter(c => c !== 'sec-head')[0] || null;
      }),
      barColors: blocks.map(b => {
        const hd = b.querySelector('.sec-head');
        return hd ? getComputedStyle(hd).borderLeftColor : null;
      }),
      fields: blocks.map(b => b.querySelectorAll('.f-col, .field, .f-row').length),
      enableAiCount: (v.textContent.match(/Enable AI/g) || []).length
    };
  });

  ok('AI assistant: 4 colour-coded section blocks bante hain',
    ai.blocks === 4, ai.blocks + ' blocks');
  ok('AI assistant: har block ka sar-name (heading) hai',
    ai.heads.every(h => !!h), JSON.stringify(ai.heads));
  ok('AI assistant: har block ka alag rang hai (tone)',
    ai.tones.every(t => !!t) && new Set(ai.tones).size >= 3, JSON.stringify(ai.tones));
  ok('AI assistant: har block ki left colour bar alag rang ki hai',
    new Set(ai.barColors.filter(Boolean)).size >= 3, JSON.stringify(ai.barColors.slice(0, 4)));
  ok('AI assistant: koi block khali nahi (field bina section ke nahi)',
    ai.fields.every(n => n > 0), JSON.stringify(ai.fields));
  ok('AI assistant: "Enable AI" aik hi dafa hai (pehle 2 baar — duplicate fields)',
    ai.enableAiCount === 1, ai.enableAiCount + ' baar');
  ok('AI assistant: 24 fields 4 sections me bate hain',
    ai.fields.reduce((a, b2) => a + b2, 0) >= 24,
    ai.fields.join('+') + ' = ' + ai.fields.reduce((a, b2) => a + b2, 0));

  /* Doosre bade sub-tabs bhi sectioned honay chahiye */
  const coverage = await page.evaluate(() => {
    const out = [];
    const gtab = [...document.querySelectorAll('#view .tabs.l1 > .tabbar-l1 > .tab')];
    return gtab.map(x => x.textContent.trim());
  });
  ok('Settings ke group tabs maujood hain', coverage.length >= 6, coverage.length + ' groups');

  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log(`  SETTINGS RENDER   PASS: ${pass}   FAIL: ${fail}`);
  if (fail) { failures.forEach(f => console.log('   ✖ ' + f)); }
  console.log('══════════════════════════════════════════════════════════════════');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('✖ ' + e.message); process.exit(1); });
