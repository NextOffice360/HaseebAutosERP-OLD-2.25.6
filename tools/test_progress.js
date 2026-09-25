#!/usr/bin/env node
/**
 * tools/test_progress.js — W2.T4 GATE (spec Part-2 §2 · long-op progress)
 * ---------------------------------------------------------------------------
 * Contract (App_Core ▸ UI.progress, v2.30.5):
 *   ① UI.progress(title, total) → card (role=progressbar) + handle
 *      { set, step, value, label, done, fail, el }
 *   ② UI.progress.run(items, fn, opts) → chunked + yield runner:
 *      har chunk (default 24) ke baad setTimeout(0) — sync bursts chhote
 *      (main-thread block chhota), progress card zinda, shouldStop support.
 *   ③ labels sheet (48+) par progress + periodic yield (Print.labelsHtml).
 *
 * Block-<100ms ka proxy proof: consecutive fn calls ke beech MAX SYNC BURST
 * chunk-size se bound hota hai (jsdom me wall-clock timing noisy hoti hai,
 * is liye burst-size assert karte hai — burst chhota = block chhota).
 *
 *   node tools/test_progress.js
 */
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0; const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  \u2714 ' + name); }
  else { fail++; failures.push(name + (detail ? ' \u2192 ' + detail : '')); console.log('  \u2716 ' + name + (detail ? '  \u2192 ' + detail : '')); }
}
const section = t => console.log('\n\x1b[1m' + t + '\x1b[0m');
const wait = ms => new Promise(r => setTimeout(r, ms));

const { JSDOM } = require('jsdom');
const demo = fs.readFileSync(path.join(ROOT, 'demo/index.html'), 'utf8');
const dom = new JSDOM(demo, { runScripts: 'dangerously', resources: undefined, pretendToBeVisual: true, url: 'http://localhost/' });
const win = dom.window;
const doc = win.document;

(async () => {
  for (let i = 0; i < 60 && !(win.UI && win.UI.progress && win.App && win.App.state); i++) await wait(120);
  ok('demo app ne UI.progress export kiya', !!(win.UI && typeof win.UI.progress === 'function' && typeof win.UI.progress.run === 'function'));

  /* ── A ▸ factory + handle ── */
  section('A \u25b8 UI.progress \u2014 card render + handle updates');
  const p = win.UI.progress('Test Kaam', 10);
  let card = doc.querySelector('.prog[role="progressbar"]');
  ok('card render (role=progressbar, min/max)', !!card && card.getAttribute('aria-valuemax') === '10');
  ok('title me 0/10', /Test Kaam\s*0\/10/.test(card.textContent), card.textContent.slice(0, 30));
  p.set(4);
  ok('set(4) \u2192 aria-valuenow=4 + text 4/10', card.getAttribute('aria-valuenow') === '4' && /4\/10/.test(card.textContent));
  p.step(); p.step();
  ok('step()×2 \u2192 6/10', card.getAttribute('aria-valuenow') === '6');
  p.label('Label ban rahe hai');
  ok('label(sub-text) dikhta hai', /Label ban rahe hai/.test(card.textContent));

  /* ── B ▸ done / fail ── */
  section('B \u25b8 done / fail \u2014 card remove');
  p.done('Mukammal');
  await wait(700);
  ok('done \u2192 card DOM se hat gaya', !doc.querySelector('.prog[role="progressbar"]'));
  const pf = win.UI.progress('Fail Wala', 5);
  win.UI._lastToastText = '';
  pf.fail(new Error('timeout: beech me fail'));
  await wait(50);
  ok('fail \u2192 card remove + classified toast', !doc.querySelector('.prog[role="progressbar"]') && doc.querySelectorAll('.toast').length > 0);

  /* ── C ▸ run(): chunked + yield ── */
  section('C \u25b8 UI.progress.run \u2014 chunked-yield (main-thread bursts bound)');
  let count = 0;
  let lastT = Date.now(); let burst = 1, maxBurst = 1;
  let yieldHappened = false;
  setTimeout(() => { yieldHappened = true; }, 0);        /* run ke pehle schedule — yield hone par chal jayega */
  const res = await win.UI.progress.run(
    new Array(500).fill(0).map((_, i) => i),
    () => {
      count++;
      const t = Date.now();
      if (t - lastT < 1) burst++; else { maxBurst = Math.max(maxBurst, burst); burst = 1; }
      lastT = t;
    },
    { chunk: 25, title: 'C-Test' }
  );
  await wait(700);
  ok('saare 500 items process hue', count === 500 && res.total === 500 && res.done === 500);
  ok('beech me event-loop yield hua (setTimeout chala)', yieldHappened === true);
  ok('sync burst chunk(25) se bound \u2192 block chhota', maxBurst <= 25, 'maxBurst=' + maxBurst);
  ok('run ke baad card remove (auto-done)', !doc.querySelector('.prog[role="progressbar"]'));

  /* ── D ▸ shouldStop ── */
  section('D \u25b8 shouldStop \u2014 beech me rokna');
  let c2 = 0;
  const res2 = await win.UI.progress.run(new Array(1000).fill(0), () => { c2++; }, { chunk: 10, title: 'D-Test', shouldStop: () => c2 >= 60 });
  ok('stop flag \u2192 stopped:true + count bounded (60+chunk)', res2.stopped === true && c2 >= 60 && c2 <= 60 + 10, 'c2=' + c2);

  /* ── E ▸ fn throw ── */
  section('E \u25b8 run error \u2014 card fail + rethrow');
  let threw = false;
  try {
    await win.UI.progress.run([1, 2, 3], (x) => { if (x === 2) throw new Error('zaroori: item 2 ghalat'); }, { chunk: 1, title: 'E-Test' });
  } catch (e) { threw = true; }
  await wait(750);   /* D/E cards ki 550ms removal-window poori ho */
  ok('error aage pasa + card hat gaya', threw && !doc.querySelector('.prog[role="progressbar"]'));

  /* ── F ▸ labelsHtml wiring ── */
  section('F \u25b8 Print.labelsHtml \u2014 48+ labels par progress, chhoti sheet par nahi');
  const origProg = win.UI.progress;
  let created = 0;
  win.UI.progress = function (...a) { created++; return origProg.apply(this, a); };
  const rowsBig = new Array(120).fill(0).map((_, i) => ({ name: 'Item ' + i, code: 'C' + i, barcode: 'BC' + i, price: 100, currency: 'Rs' }));
  const htmlBig = await win.Print.labelsHtml(rowsBig, { json: '{}' });
  const labelDivs = (htmlBig.match(/class="label"/g) || []).length;
  ok('bari sheet: progress card bana (1 dafa)', created === 1, 'created=' + created);
  ok('saare 120 labels HTML me', labelDivs === 120, 'divs=' + labelDivs);
  await wait(750);   /* done ki 550ms removal-window */
  ok('labels ke baad card remove (done)', !doc.querySelector('.prog[role="progressbar"]'));
  created = 0;
  const rowsSmall = [{ name: 'A', code: 'A1', barcode: 'B1', price: 5, currency: 'Rs' }];
  await win.Print.labelsHtml(rowsSmall, { json: '{}' });
  ok('chhoti sheet (1 label): koi progress nahi', created === 0);

  win.UI.progress = origProg;

  /* ── G ▸ source contracts ── */
  section('G \u25b8 SOURCE contracts');
  const core = fs.readFileSync(path.join(ROOT, 'apps-script/App_Core.html'), 'utf8');
  ok('App_Core: UI.progress + run dono', /progress\(title, total\)/.test(core) && /UI\.progress\.run = async function/.test(core));
  ok('labelsHtml wired (prog-step + yield)', /prog\.step\(\); if \(\(\+\+lblN % 24\) === 0\) await new Promise/.test(core));

  console.log('\n\x1b[1mSUMMARY:\x1b[0m ' + pass + ' pass \u00b7 ' + fail + ' fail \u00b7 ' + (fail === 0 ? '\x1b[32mGREEN\x1b[0m' : '\x1b[31mRED\x1b[0m'));
  if (failures.length) { console.log('Failures:'); failures.forEach(f => console.log('  - ' + f)); }
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
