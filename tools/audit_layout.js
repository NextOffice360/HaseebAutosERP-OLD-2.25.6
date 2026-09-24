/**
 * audit_layout.js — REAL BROWSER layout / UI-quality audit (puppeteer).
 *
 *   node tools/audit_layout.js [width] [height]
 *
 * jsdom layout nahi karta — is liye ye Chromium chalata hai aur asli geometry
 * napta hai:
 *   • overflow      — element viewport se bahar (horizontal clipping)
 *   • clipped       — text kati hui (scrollWidth > clientWidth, bina ellipsis)
 *   • overlap       — text elements ek dosre ke upar (jaise purani bar charts)
 *   • tiny          — tap target 32px se chhota (mobile best practice 44px)
 *   • contrast      — WCAG AA (4.5:1) se kam text contrast
 *   • hscroll       — page par horizontal scroll aa gaya
 *   • dupIds        — duplicate DOM ids
 */
const fs = require('fs');
const puppeteer = require('puppeteer');
const { login } = require('./_harness');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const SCREENS = ['dashboard', 'pos', 'sales', 'items', 'inventory', 'warehouse', 'parties',
  'purchase', 'reorder', 'orders', 'takeorder', 'accounting', 'money', 'shop', 'reports',
  'insights', 'users', 'settings', 'ai'];

const AUDIT = (rootSel) => {
  const vw = window.innerWidth;
  const ROOTEL = document.querySelector(rootSel);
  if (!ROOTEL) return { missing: true };
  const out = { overflow: [], clipped: [], overlap: [], tiny: [], contrast: [], dupIds: [], hscroll: false };
  const desc = el => {
    const cls = String(el.className || '').split(/\s+/).filter(Boolean).slice(0, 3).join('.');
    const txt = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 28);
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls ? '.' + cls : '') + (txt ? ' “' + txt + '”' : '');
  };
  const ids = {};
  document.querySelectorAll('[id]').forEach(e => { ids[e.id] = (ids[e.id] || 0) + 1; });
  Object.keys(ids).forEach(k => { if (ids[k] > 1) out.dupIds.push(k); });
  out.hscroll = document.documentElement.scrollWidth > vw + 2;
  out.rootMissing = false;

  const els = Array.from(ROOTEL.querySelectorAll('*'));
  const scrollableAncestor = el => {          /* table/carousel ke andar horizontal scroll theek hai */
    let n = el.parentElement;
    while (n && n !== document.body) {
      const ox = getComputedStyle(n).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
      n = n.parentElement;
    }
    return false;
  };
  const shown = el => {                        /* chhupe hue (hidden file input waghera) chhoren */
    if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
  };
  /* 1) overflow + clipped + tiny */
  els.forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    if ((r.right > vw + 2 || r.left < -2) && !scrollableAncestor(el))
      out.overflow.push({ el: desc(el), x: Math.round(r.left), w: Math.round(r.width) });
    if (el.matches('button, .btn, .tab, select, input, a') && r.height < 32 && r.height > 0 && shown(el) && r.height > 2) {
      let exempt = false;                                  /* checkbox/radio: click area = label ya poori row */
      if (el.matches('input[type=checkbox],input[type=radio]')) {
        const lab = el.closest('label');
        const row = el.closest('.gs-item,tr,.bulk-item,.list-item,.f');
        const rowH = row && row.getBoundingClientRect().height;
        exempt = !!lab || rowH >= 40;
      }
      if (!exempt) out.tiny.push({ el: desc(el), h: Math.round(r.height), w: Math.round(r.width) });
    }
    const cs = getComputedStyle(el);
    const leaf = el.children.length === 0 && (el.textContent || '').trim().length > 0;
    /* SVG text ka scrollWidth asli clipping nahi batata — SVG ko alag rule se napte hain */
    if (leaf && !el.ownerSVGElement && el.scrollWidth > el.clientWidth + 2 && cs.overflow === 'visible' &&
      cs.textOverflow !== 'ellipsis' && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll')
      out.clipped.push({ el: desc(el), sw: el.scrollWidth, cw: el.clientWidth });
  });

  /* 2) text overlap — same parent ke andar do text boxes aapas mein katein */
  const textEls = els.filter(el => {
    if (el.children.length) return false;
    const t = (el.textContent || '').trim();
    if (!t) return false;
    const r = el.getBoundingClientRect();
    return r.width > 4 && r.height > 4 && getComputedStyle(el).position !== 'absolute';
  });
  for (let i = 0; i < textEls.length; i++) {
    for (let j = i + 1; j < textEls.length; j++) {
      const a = textEls[i], b = textEls[j];
      if (a.parentElement !== b.parentElement) continue;
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ox > 2 && oy > 2) out.overlap.push({ a: desc(a), b: desc(b), ox: Math.round(ox) });
    }
  }

  /* 3) contrast (WCAG AA) */
  const lum = c => {
    const m = c.match(/[\d.]+/g); if (!m) return null;
    const v = m.slice(0, 3).map(Number).map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  /* translucent backgrounds (soft tinted cards) ko sahi se composited karo */
  const parseC = c => { const m = String(c).match(/[\d.]+/g); if (!m) return null;
    return { r: +m[0], g: +m[1], b: +m[2], a: m[3] === undefined ? 1 : +m[3] }; };
  const bgOf = el => {
    const stack = []; let n = el;
    while (n && n !== document.documentElement) {
      const c = parseC(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) { stack.push(c); if (c.a >= 0.999) break; }
      n = n.parentElement;
    }
    let base = { r: 255, g: 255, b: 255 };
    for (let i = stack.length - 1; i >= 0; i--) {
      const c = stack[i];
      base = { r: c.r * c.a + base.r * (1 - c.a), g: c.g * c.a + base.g * (1 - c.a), b: c.b * c.a + base.b * (1 - c.a) };
    }
    return 'rgb(' + Math.round(base.r) + ',' + Math.round(base.g) + ',' + Math.round(base.b) + ')';
  };
  const seen = new Set();
  els.forEach(el => {
    if (el.children.length) return;
    const t = (el.textContent || '').trim(); if (!t) return;
    const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize) || 12;
    const L1 = lum(cs.color), L2 = lum(bgOf(el));
    if (L1 == null || L2 == null) return;
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const need = (fs >= 18.66 || (fs >= 14 && Number(cs.fontWeight) >= 700)) ? 3 : 4.5;
    if (ratio < need) {
      const key = cs.color + '|' + cs.fontSize + '|' + el.className;
      if (seen.has(key)) return; seen.add(key);
      out.contrast.push({ el: desc(el), ratio: Math.round(ratio * 100) / 100, need, color: cs.color, size: Math.round(fs) });
    }
  });
  return out;
};

(async () => {
  const args = process.argv.slice(2);
  const flag = k => args.indexOf(k) > -1;
  const W = Number(args.find(a => /^\d+$/.test(a)) || 1440);
  const H = Number(args.filter(a => /^\d+$/.test(a))[1] || 900);
  const DARK = flag('--dark');
  const OVERLAYS = flag('--overlays');
  const PWA = flag('--pwa');

  const OVERLAY_STEPS = [
    { screen: 'reports', name: 'export/share dialog', clicks: [/Export \/ share|📤/] },
    { screen: 'shop', name: 'day closing report', clicks: [/Closing report|📄/] },
    { screen: 'sales', name: 'sale detail (offcanvas)', clicks: [null] },
    { screen: 'users', name: 'user form (rules)', clicks: [null] },                     /* row click */
    { screen: 'items', name: 'item detail', clicks: [null] },
    { screen: 'purchase', name: 'purchase order form', clicks: [/New PO|➕|PO/] },
    { screen: 'warehouse', name: 'count sheet form', clicks: [/Count sheet|➕|New/] },
    { screen: 'accounting', name: 'voucher form', clicks: [/New voucher|➕/] },
    /* v2.23.20 — new overlays get permanent audit coverage (js: raw expression) */
    { screen: 'dashboard', name: 'alerts & notifications panel', js: "var b=document.querySelector('#btnNotif'); if(b) b.click();" },
    { screen: 'items', name: 'label print modal', js: "(function(){var it=(App.state.catalog&&App.state.catalog.items||[])[0]; if(it&&window.__printLabels) window.__printLabels([it.id]);})()" },
    { screen: 'pos', name: 'bulk add modal', js: "window.POS2 && window.POS2.togglePicker && window.POS2.togglePicker()" },
    /* v2.25.0 (req 2) — naya GRN drawer (width/sections/grid/responsive) */
    { screen: 'salesman', name: 'stock issue modal (req 4)', js: "(function(){var tries=0; function pick(){var s=document.querySelector('select.f-input, select.st2-f'); if(s){var o=[].slice.call(s.options).filter(function(x){return !!x.value;})[0]; if(o && s.value!==o.value){s.value=o.value; s.dispatchEvent(new Event('change',{bubbles:true}));}} var b=[].slice.call(document.querySelectorAll('button')).filter(function(x){return /Issued/i.test(x.textContent||'') && !/Stock Issued tab/i.test(x.textContent||'');})[0]; if(b) b.click(); setTimeout(function(){var n=[].slice.call(document.querySelectorAll('button')).filter(function(x){return /New issue|Create Issue|New Issue/i.test(x.textContent||'');})[0]; if(n){n.click(); return;} if(++tries<6) setTimeout(pick, 700);}, 1100);} pick();})()" },
    { screen: 'demands', name: 'demand form (req 3)', js: "(function(){var b=[].slice.call(document.querySelectorAll('button')).filter(function(x){return /New Demand/.test(x.textContent||'');}); if(b[0]) b[0].click();})()" },
    { screen: 'purchase', name: 'GRN drawer', js: "(function(){var b=[].slice.call(document.querySelectorAll('button')).filter(function(x){return /\\bGRN\\b/.test(x.textContent||'') && !x.closest('.seg');}); if(b[0]) b[0].click();})()" }
  ];

  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'], defaultViewport: { width: W, height: H } });
  const page = await browser.newPage();
  /* PWA dark mode: shell `prefers-color-scheme` se light/dark choose karta hai */
  if (PWA && DARK) {
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  }
  await page.goto('file://' + path.join(ROOT, 'demo', 'index.html'), { waitUntil: 'load' });
  await login(page);            /* poll + login (shared harness) */
  await new Promise(r => setTimeout(r, 900));
  if (DARK) {
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await new Promise(r => setTimeout(r, 400));
  }

  let problems = 0;
  const report = (title, a) => {
    if (a.missing) { console.log(`\n✖ ${title}  (overlay nahi khula)`); problems++; return; }
    const n = a.overflow.length + a.clipped.length + a.overlap.length + a.tiny.length + a.contrast.length + a.dupIds.length + (a.hscroll ? 1 : 0);
    problems += n;
    console.log(`\n${n ? '✖' : '✔'} ${title}  (${n} problem${n === 1 ? '' : 's'})`);
    const show = (label, arr, fmt) => { if (arr.length) { console.log('   ' + label + ': ' + arr.length); arr.slice(0, 6).forEach(x => console.log('      · ' + fmt(x))); if (arr.length > 6) console.log('      … +' + (arr.length - 6)); } };
    show('OVERFLOW (viewport se bahar)', a.overflow, x => x.el + ' → x=' + x.x + ' w=' + x.w);
    show('CLIPPED text (kati hui)', a.clipped, x => x.el + ' → ' + x.sw + '>' + x.cw);
    show('OVERLAP (text upar-upar)', a.overlap, x => x.a + ' ⟷ ' + x.b + ' (' + x.ox + 'px)');
    show('TINY tap target (<32px)', a.tiny, x => x.el + ' → ' + x.h + 'px');
    show('LOW CONTRAST (WCAG AA)', a.contrast, x => x.el + ' → ' + x.ratio + ':1 (need ' + x.need + ', ' + x.size + 'px)');
    if (a.dupIds.length) console.log('   DUPLICATE ids: ' + a.dupIds.join(', '));
    if (a.hscroll) console.log('   H-SCROLL: page horizontally scroll ho raha hai');
  };

  console.log(`\n==============================================================`);
  console.log(` LAYOUT / UI-QUALITY AUDIT  ·  ${W}×${H}${DARK ? '  ·  DARK THEME' : ''}${OVERLAYS ? '  ·  OVERLAYS' : ''}${PWA ? '  ·  MOBILE PWAs' : ''}`);
  console.log(`==============================================================`);

  /* ------------------------------------------------------------------
     PWA MODE — teenon mobile apps ko ASLI browser mein napo.
     PWA sirf phone par chalti hain, is liye desktop audit un par
     kuch nahi batata. Har app ka har tab alag se check hota hai.
     ------------------------------------------------------------------ */
  if (PWA) {
    const APPS = [
      { file: 'pwa-wh.html', name: 'WAREHOUSE PWA', tabs: ['Receive', 'Put-away', 'Count', 'Transfer'] },
      { file: 'pwa-fo.html', name: 'FIELD ORDERS PWA', tabs: ['New order', 'Pending', 'Synced'] },
      { file: 'pwa-sm.html', name: 'SALESMAN PWA', tabs: ['My stock', 'Sell', 'Collect', 'Settle'] }
    ];
    for (const app of APPS) {
      const file = path.join(ROOT, 'demo', app.file);
      if (!fs.existsSync(file)) {
        console.log(`\n✖ ${app.name}  (demo page missing — build_pwa_demo.py chalayein)`);
        problems++; continue;
      }
      await page.goto('file://' + file, { waitUntil: 'load' });
      await new Promise(r => setTimeout(r, 1400));
      /* sandboxed/localStorage ki wajah se login screen aa sakti hai — us case mein
         token set kar ke dobara load karein */
      const needsLogin = await page.evaluate(() => !!document.querySelector('#pwaBody input[type="password"]'));
      if (needsLogin) {
        await page.evaluate(() => {
          try { localStorage.setItem('ha_token', 'demo-token'); } catch (e) { }
        });
        await page.goto('file://' + file, { waitUntil: 'load' });
        await new Promise(r => setTimeout(r, 1600));
      }
      for (const tab of app.tabs) {
        const clicked = await page.evaluate((t) => {
          const btn = Array.from(document.querySelectorAll('#pwaBar .b'))
            .find(b => (b.textContent || '').indexOf(t) > -1);
          if (!btn) return false;
          btn.click();
          return true;
        }, tab);
        if (!clicked) { console.log(`\n✖ ${app.name} ▸ ${tab}  (tab nahi mila)`); problems++; continue; }
        await new Promise(r => setTimeout(r, 700));
        report(`${app.name} ▸ ${tab}`, await page.evaluate(AUDIT, '#pwaBody'));
      }
    }
    console.log(`\n==============================================================`);
    console.log(` PROBLEMS: ${problems}`);
    console.log(`==============================================================`);
    await browser.close();
    process.exit(problems ? 1 : 0);
  }

  if (!OVERLAYS) {
    for (const id of SCREENS) {
      await page.evaluate(s => window.App.go(s), id);
      await new Promise(r => setTimeout(r, 1200));
      report(id.toUpperCase(), await page.evaluate(AUDIT, '#view'));
    }
  } else {
    for (const ov of OVERLAY_STEPS) {
      await page.evaluate(s => window.App.go(s), ov.screen);
      await new Promise(r => setTimeout(r, 1500));
      try {
        if (ov.js) {
          await page.evaluate(ov.js);
        } else if (ov.clicks[0] === null) {
          /* row click (table ki pahli row) */
          await page.evaluate(() => {
            const row = document.querySelector('#view tbody tr') || document.querySelector('#view .card, #view .item, #view .task');
            if (row) row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          });
        } else {
          await page.evaluate(re => {
            const rx = new RegExp(re);
            const b = Array.from(document.querySelectorAll('#view button, #view .tab, #view a.btn'))
              .find(x => rx.test(x.textContent || ''));
            if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          }, ov.clicks[0].source);
        }
        await new Promise(r => setTimeout(r, 1700));
      } catch (e) { /* ignore */ }
      report(ov.name.toUpperCase(), await page.evaluate(AUDIT, '.modal, .modal2, .offcanvas, .drawer, .bulk-picker, .modal-scrim > *'));
      /* band karo: Escape ya scrim click */
      await page.evaluate(() => {
        const scrim = document.querySelector('.modal-scrim');
        if (scrim && scrim.close) scrim.close();
        const x = document.querySelector('.modal-head .x, .drawer .x, .modal .x');
        if (x) x.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        const ocx = document.querySelector('.oc-head .oc-x, .oc-x'); if (ocx) ocx.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        document.querySelectorAll('.modal-scrim, .bulk-picker, .drawer, .offcanvas, .oc-scrim').forEach(n => n.remove()); /* hard cleanup */
      });
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`\n==============================================================`);
  console.log(` PROBLEMS: ${problems}`);
  console.log(`==============================================================\n`);
  await browser.close();
  process.exit(problems ? 1 : 0);
})();
