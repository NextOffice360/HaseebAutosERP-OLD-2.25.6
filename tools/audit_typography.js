#!/usr/bin/env node
/* ============================================================================
   audit_typography.js — RENDERED typography + chart-text-collision auditor
   ----------------------------------------------------------------------------
   Ye tool asli browser (Chromium) mein har screen render kar ke napta hai:

     A. TYPOGRAPHY INVENTORY — har text element ka computed font-size
        (page / section / card / field / table / chart / modal / component)
        aur oversized text ki list.

     B. CHART TEXT COLLISION — har <svg> chart ke andar <text> elements:
        · overflow  : text apne SVG ki boundary se bahar nikal raha hai
        · overlap   : do text ek doosre se takra rahe hain
        · edge      : text SVG ke kinaare se chipak raha hai (clip risk)

     C. LINE-HEIGHT / CLIPPING — text jis container me clip ho raha hai.

   Static audit se ye masle NAHI milte (SVG text layout runtime par banta hai).

   Usage:  node tools/audit_typography.js [width] [height] [--screen name]
   ========================================================================== */
const puppeteer = require('puppeteer');
const { login } = require('./_harness');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const DEMO = path.join(ROOT, 'demo', 'index.html');

const SCREENS = ['dashboard', 'pos', 'sales', 'items', 'inventory', 'warehouse', 'parties',
  'purchase', 'reorder', 'orders', 'takeorder', 'accounting', 'money', 'shop', 'reports',
  'insights', 'users', 'settings'];

const W = Number(process.argv[2]) || 1440;
const H = Number(process.argv[3]) || 900;
const onlyIdx = process.argv.indexOf('--screen');
const ONLY = onlyIdx > -1 ? process.argv[onlyIdx + 1] : null;

if (!fs.existsSync(DEMO)) {
  console.log('✖ demo/index.html nahi mila — pehle: python3 tools/build_demo.py');
  process.exit(1);
}

/* har element-type ke liye max recommended font-size (px) — v2.8: bumped to match WCAG 16px baseline + clamp headings.
   Research: body 14.8px, table 13.5, buttons 14.8 are readable not "oversized" (dense ERP needs breathing room). */
const LIMITS = [
  { sel: '.page-head h2, .page-head h1', max: 26, name: 'page title' },
  { sel: '.card-head h3, .card-head h4', max: 18, name: 'card heading' },
  { sel: '.sec-head h4', max: 18, name: 'section heading' },
  { sel: '.kpi .k-val', max: 28, name: 'KPI value' },
  { sel: '.kpi .k-lab', max: 13, name: 'KPI label' },
  { sel: 'td, th', max: 14.5, name: 'table cell' },
  { sel: '.f-col label, .f-col .f-input', max: 15, name: 'form field' },
  { sel: '.btn', max: 15, name: 'button' },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: W, height: H }
  });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));

  await page.goto('file://' + DEMO, { waitUntil: 'load' });
  await login(page);             /* poll + login (shared harness) */
  await sleep(2600);

  const all = { oversized: [], chartOverflow: [], chartOverlap: [], chartEdge: [], clipped: [], sizes: {} };

  for (const scr of SCREENS) {
    if (ONLY && scr !== ONLY) continue;
    await page.evaluate(s => { location.hash = '#/' + s; }, scr);
    await sleep(1900);

    const r = await page.evaluate(() => {
      const out = { oversized: [], chartOverflow: [], chartOverlap: [], chartEdge: [], clipped: [], sizes: [] };

      /* ---------- A. typography inventory ---------- */
      const seen = new Set();
      document.querySelectorAll('#view *').forEach(el => {
        if (!el.children.length === false) { /* leaf check below */ }
        // sirf wo elements jin ka khud ka text ho
        const own = Array.from(el.childNodes)
          .filter(n => n.nodeType === 3 && n.textContent.trim()).length;
        if (!own) return;
        const cs = getComputedStyle(el);
        const fs = parseFloat(cs.fontSize);
        if (!fs || isNaN(fs)) return;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return;
        const cls = String(el.className || '').split(/\s+/).filter(Boolean).slice(0, 2).join('.');
        const key = el.tagName.toLowerCase() + '.' + cls + '@' + fs.toFixed(1);
        if (seen.has(key)) return;
        seen.add(key);
        const txt = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 34);
        out.sizes.push({ tag: el.tagName.toLowerCase(), cls, fs: +fs.toFixed(1), txt });
      });

      /* limit cross-check */
      const LIM = [
        { sel: '.page-head h2, .page-head h1', max: 26, name: 'page title' },
        { sel: '.card-head h3, .card-head h4', max: 18, name: 'card heading' },
        { sel: '.sec-head h4', max: 18, name: 'section heading' },
        { sel: '.kpi .k-val', max: 28, name: 'KPI value' },
        { sel: '.kpi .k-lab', max: 13, name: 'KPI label' },
        { sel: 'td, th', max: 14.5, name: 'table cell' },
        { sel: '.f-col label, .f-col .f-input', max: 15, name: 'form field' },
        { sel: '.btn', max: 15, name: 'button' }
      ];
      LIM.forEach(l => {
        document.querySelectorAll('#view ' + l.sel).forEach(el => {
          const fs = parseFloat(getComputedStyle(el).fontSize);
          if (fs > l.max) {
            out.oversized.push({ kind: l.name, fs: +fs.toFixed(1), max: l.max,
              txt: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 32) });
          }
        });
      });

      /* ---------- B. chart SVG text collisions ---------- */
      document.querySelectorAll('#view svg').forEach(svgEl => {
        const sr = svgEl.getBoundingClientRect();
        if (sr.width < 8 || sr.height < 8) return;
        const texts = [...svgEl.querySelectorAll('text')];
        if (!texts.length) return;
        const chartName = (svgEl.getAttribute('class') || svgEl.parentElement?.className || 'svg')
          .toString().split(/\s+/)[0];

        const boxes = [];
        texts.forEach(t => {
          const tr = t.getBoundingClientRect();
          if (tr.width < 1) return;
          const fs = parseFloat(getComputedStyle(t).fontSize) || parseFloat(t.getAttribute('font-size')) || 12;
          boxes.push({
            str: (t.textContent || '').slice(0, 30), fs: +fs.toFixed(1),
            x: tr.x, y: tr.y, w: tr.width, h: tr.height,
            r: tr.right, b: tr.bottom
          });
        });

        /* overflow: text SVG boundary se bahar */
        boxes.forEach(b => {
          const pad = 0.5;
          const outL = sr.x - b.x, outR = b.r - sr.right;
          const outT = sr.y - b.y, outB = b.b - sr.bottom;
          const worst = Math.max(outL, outR, outT, outB);
          if (worst > 1.5) {
            out.chartOverflow.push({ chart: chartName, str: b.str, fs: b.fs,
              over: +worst.toFixed(1), side: worst === outL ? 'left' : worst === outR ? 'right' : worst === outT ? 'top' : 'bottom' });
          }
        });

        /* overlap: do text aapas me */
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i], c = boxes[j];
            const ox = Math.min(a.r, c.r) - Math.max(a.x, c.x);
            const oy = Math.min(a.b, c.b) - Math.max(a.y, c.y);
            if (ox > 1 && oy > 1) {
              out.chartOverlap.push({ chart: chartName, a: a.str, b: c.str,
                fs: Math.max(a.fs, c.fs), ox: +ox.toFixed(1), oy: +oy.toFixed(1) });
            }
          }
        }

        /* edge: text kinaare se chipka (clip risk) */
        boxes.forEach(b => {
          const m = 2;
          const nearL = b.x - sr.x, nearR = sr.right - b.r;
          if ((nearL >= 0 && nearL < m) || (nearR >= 0 && nearR < m)) {
            out.chartEdge.push({ chart: chartName, str: b.str, fs: b.fs,
              gap: +Math.min(nearL < 0 ? 99 : nearL, nearR < 0 ? 99 : nearR).toFixed(1) });
          }
        });
      });

      /* ---------- C. clipped text (HTML) ---------- */
      document.querySelectorAll('#view *').forEach(el => {
        if (el.children.length) return;
        const txt = (el.textContent || '').trim();
        if (!txt) return;
        if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
          const cs = getComputedStyle(el);
          if (cs.overflow === 'visible' || cs.textOverflow === 'ellipsis') return; // intentional
          out.clipped.push({ tag: el.tagName.toLowerCase(),
            cls: String(el.className || '').split(/\s+/).slice(0, 2).join('.'),
            txt: txt.slice(0, 30), sw: el.scrollWidth, cw: el.clientWidth });
        }
      });

      return out;
    });

    const tag = o => Object.assign(o, { screen: scr });
    r.oversized.forEach(o => all.oversized.push(tag(o)));
    r.chartOverflow.forEach(o => all.chartOverflow.push(tag(o)));
    r.chartOverlap.forEach(o => all.chartOverlap.push(tag(o)));
    r.chartEdge.forEach(o => all.chartEdge.push(tag(o)));
    r.clipped.forEach(o => all.clipped.push(tag(o)));
    r.sizes.forEach(s => {
      const k = s.tag + '.' + s.cls;
      all.sizes[k] = all.sizes[k] || { fs: s.fs, screen: scr, sample: s.txt };
    });

    const n = r.chartOverflow.length + r.chartOverlap.length + r.chartEdge.length;
    console.log(`  ${n ? '✖' : '✔'} ${scr.padEnd(12)} chart-issues:${String(n).padStart(3)}  oversized:${String(r.oversized.length).padStart(3)}  clipped:${String(r.clipped.length).padStart(3)}`);
  }

  /* ---------------------------- REPORT ---------------------------- */
  console.log('\n══════════════════════════════════════════════════════════════════════');
  console.log(`  TYPOGRAPHY AUDIT @ ${W}x${H}`);
  console.log('══════════════════════════════════════════════════════════════════════');

  if (all.chartOverflow.length) {
    console.log(`\n\x1b[31m① CHART TEXT OVERFLOW (SVG se bahar) — ${all.chartOverflow.length}\x1b[0m`);
    all.chartOverflow.slice(0, 30).forEach(o =>
      console.log(`   [${o.screen}] "${o.str}"  ${o.fs}px  → ${o.over}px ${o.side} se bahar`));
  }
  if (all.chartOverlap.length) {
    console.log(`\n\x1b[31m② CHART TEXT OVERLAP (aapas me) — ${all.chartOverlap.length}\x1b[0m`);
    all.chartOverlap.slice(0, 30).forEach(o =>
      console.log(`   [${o.screen}] "${o.a}" ⟷ "${o.b}"  ${o.fs}px  (${o.ox}×${o.oy}px takra)`));
  }
  if (all.chartEdge.length) {
    console.log(`\n\x1b[33m③ CHART TEXT EDGE (clip khatra) — ${all.chartEdge.length}\x1b[0m`);
    all.chartEdge.slice(0, 20).forEach(o =>
      console.log(`   [${o.screen}] "${o.str}"  ${o.fs}px  (kinaare se ${o.gap}px)`));
  }
  if (all.oversized.length) {
    console.log(`\n\x1b[33m④ OVERSIZED TEXT — ${all.oversized.length}\x1b[0m`);
    const by = {};
    all.oversized.forEach(o => { const k = o.kind + ' ' + o.fs + 'px>' + o.max; by[k] = (by[k] || 0) + 1; });
    Object.keys(by).sort((a, b) => by[b] - by[a]).slice(0, 20)
      .forEach(k => console.log(`   ${k}  ×${by[k]}`));
  }
  if (all.clipped.length) {
    console.log(`\n\x1b[33m⑤ CLIPPED TEXT (HTML) — ${all.clipped.length}\x1b[0m`);
    all.clipped.slice(0, 15).forEach(o =>
      console.log(`   [${o.screen}] ${o.tag}.${o.cls} "${o.txt}" (${o.sw}>${o.cw})`));
  }

  const total = all.chartOverflow.length + all.chartOverlap.length + all.chartEdge.length + all.oversized.length;
  console.log('\n══════════════════════════════════════════════════════════════════════');
  console.log(`  TOTAL PROBLEMS: ${total}`);
  console.log(`  page errors: ${pageErrors.length ? pageErrors.slice(0, 2).join(' | ') : 'none'}`);
  console.log('══════════════════════════════════════════════════════════════════════');

  await browser.close();
  process.exit(total ? 1 : 0);
})().catch(e => { console.error('✖ ' + e.message); process.exit(1); });
