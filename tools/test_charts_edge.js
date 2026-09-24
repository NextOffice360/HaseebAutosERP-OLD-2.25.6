#!/usr/bin/env node
/* ============================================================================
   test_charts_edge.js — CHART EDGE-CASE / TORTURE TEST (rendered)
   ----------------------------------------------------------------------------
   Charts ko aisi cheezon par azmata hai jo real duniya me aati hain aur
   layout tor deti hain:
     · khali data (0 rows)
     · aik hi row
     · 50 rows (crowding)
     · bohot lambe labels (60+ characters)
     · bohot bade numbers (Crore / Arab)
     · zero, negative, NaN, undefined, null
     · sab ek jaisi values (0 variance → divide by zero)
   Har case ke baad check: koi text SVG se bahar to nahi, koi overlap to nahi,
   aur koi JS error to nahi aaya.

   Usage: node tools/test_charts_edge.js [width] [height]
   ========================================================================== */
const puppeteer = require('puppeteer');
const { login } = require('./_harness');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const DEMO = path.join(ROOT, 'demo', 'index.html');

const W = Number(process.argv[2]) || 1440;
const H = Number(process.argv[3]) || 900;

let pass = 0, fail = 0; const failures = [];
const ok = (n, c, d) => c ? (pass++, console.log('  ✔ ' + n + (d ? '  → ' + d : '')))
  : (fail++, failures.push(n), console.log('  ✖ ' + n + (d ? '  → ' + d : '')));

if (!fs.existsSync(DEMO)) { console.log('✖ demo/index.html nahi mila'); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: W, height: H }
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  await page.goto('file://' + DEMO, { waitUntil: 'load' });
  await login(page);             /* poll + login (shared harness) */
  await sleep(2600);
  await page.evaluate(() => { location.hash = '#/dashboard'; });
  await sleep(1800);

  /* har case: chart banao → #view me lagao → fitAll → naapo */
  const runCase = async (name, code) => {
    const before = errs.length;
    const r = await page.evaluate((codeStr) => {
      const host = document.createElement('div');
      host.id = '__torture';
      host.style.cssText = 'position:absolute;left:0;top:0;width:100%;padding:8px';
      const view = document.getElementById('view');
      view.appendChild(host);
      let made = 0, threw = null;
      try {
        const el = eval(codeStr);
        if (el) { host.appendChild(el); made = 1; }
      } catch (e) { threw = e.message; }
      try { if (window.Chart && Chart.fitAll) Chart.fitAll(host); } catch (e) { }
      /* naap */
      const problems = [];
      host.querySelectorAll('svg').forEach(s => {
        const sr = s.getBoundingClientRect();
        if (sr.width < 4) return;
        const texts = [...s.querySelectorAll('text')];
        const boxes = [];
        texts.forEach(t => {
          const tr = t.getBoundingClientRect();
          if (tr.width < 1) return;
          boxes.push({ s: (t.textContent || '').slice(0, 24), fs: parseFloat(t.getAttribute('font-size')) || 12,
            x: tr.x, y: tr.y, r: tr.right, b: tr.bottom });
        });
        boxes.forEach(b => {
          const over = Math.max(sr.x - b.x, b.r - sr.right, sr.y - b.y, b.b - sr.bottom);
          if (over > 2) problems.push({ type: 'overflow', s: b.s, fs: b.fs, over: +over.toFixed(1) });
        });
        for (let i = 0; i < boxes.length; i++)
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i], c = boxes[j];
            const ox = Math.min(a.r, c.r) - Math.max(a.x, c.x);
            const oy = Math.min(a.b, c.b) - Math.max(a.y, c.y);
            if (ox > 1.5 && oy > 1.5) problems.push({ type: 'overlap', a: a.s, b: c.s, ox: +ox.toFixed(1) });
          }
      });
      const out = { made, threw, problems, svgs: host.querySelectorAll('svg').length,
        emptyMsg: (host.querySelector('.chart-empty') || {}).textContent || '' };
      host.remove();
      return out;
    }, code);
    const newErrs = errs.length - before;
    return { name, ...r, newErrs };
  };

  const C = window => 0; // placeholder
  const cases = [
    ['donut · empty data',            `Chart.donut([])`],
    ['donut · single row',            `Chart.donut([{label:'Only one',value:10}])`],
    ['donut · 50 rows',               `Chart.donut(Array.from({length:50},(_,i)=>({label:'Item number '+i,value:i+1})))`],
    ['donut · 60-char labels',        `Chart.donut([{label:'FLAMINGO DASHBOARD POLISH 450ML SUPER PREMIUM QUALITY BOTTLE',value:5},{label:'B',value:3}])`],
    ['donut · crore values',          `Chart.donut([{label:'Sales',value:123456789},{label:'Purchase',value:98765432}])`],
    ['donut · all zeros',             `Chart.donut([{label:'A',value:0},{label:'B',value:0}])`],
    ['donut · null/undefined',        `Chart.donut([{label:'A',value:null},{label:'B',value:undefined},{label:'C',value:NaN}])`],

    ['gauge · Rs 510,660.92',         `Chart.gauge(34.2,'Gross margin','Rs 510,660.92',{size:118,value:'34.2%'})`],
    ['gauge · Rs 12,345 / Rs 1,000,000', `Chart.gauge(78,'Udhaar recovery','Rs 12,345 / Rs 1,000,000',{size:118,value:'78%'})`],
    ['gauge · arab (1,23,45,67,890)', `Chart.gauge(91,'Total revenue','Rs 1,23,45,67,890.55',{size:118,value:'91%'})`],
    ['gauge · 60-char sub',           `Chart.gauge(50,'Very long label here for testing purposes','Sub label that is also extremely long and wide',{size:118,value:'50%'})`],
    ['gauge · NaN pct',               `Chart.gauge(NaN,'Broken','Rs 0',{size:118,value:'—'})`],
    ['gauge · negative',              `Chart.gauge(-20,'Negative','-Rs 5,000',{size:118,value:'-20%'})`],

    ['bars · empty',                  `Chart.bars([])`],
    ['bars · 50 rows',                `Chart.bars(Array.from({length:50},(_,i)=>({label:'Item '+i,value:i+1})))`],
    ['bars · long labels',            `Chart.bars([{label:'FLAMINGO DASHBOARD POLISH 450ML PREMIUM QUALITY SPRAY BOTTLE',value:10},{label:'X',value:2}])`],
    ['line · empty',                  `Chart.line([],[])`],
    ['line · 40 points',              `Chart.line([{label:'S',values:Array.from({length:40},(_,i)=>i*3)}],Array.from({length:40},(_,i)=>'P'+i))`],
    ['line · all same value',         `Chart.line([{label:'S',values:[5,5,5,5,5]}],['a','b','c','d','e'])`],
    ['progress · long label',         `Chart.progress([{label:'A very very long progress label for testing',value:5,max:10}])`],
    ['kpiRing · 100%',                `Chart.kpiRing(100,{label:'Full'})`],
  ];

  console.log(`\n\x1b[1mCHART EDGE-CASES @ ${W}x${H}\x1b[0m\n`);
  let totalProblems = 0;
  for (const [name, code] of cases) {
    const r = await runCase(name, code);
    totalProblems += r.problems.length;
    const bad = r.threw || r.problems.length || r.newErrs;
    ok(name.padEnd(38), !bad,
      r.threw ? 'THREW: ' + r.threw
        : r.newErrs ? r.newErrs + ' JS errors'
        : r.problems.length ? JSON.stringify(r.problems[0])
        : (r.svgs + ' svg' + (r.emptyMsg ? ' · empty-state: "' + r.emptyMsg + '"' : '')));
  }

  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log(`  CHART EDGE-CASES   PASS: ${pass}   FAIL: ${fail}   (problems: ${totalProblems})`);
  if (fail) failures.forEach(f => console.log('   ✖ ' + f));
  console.log('══════════════════════════════════════════════════════════════════');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('✖ ' + e.message); process.exit(1); });
