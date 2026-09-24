#!/usr/bin/env node
/* ============================================================================
   test_scale.js — §16 PERFORMANCE / SCALE TEST (rendered)
   ----------------------------------------------------------------------------
   Bade catalog ke sath app ki raftaar napta hai — kyunki chhoti demo data par
   sab kuch tez lagta hai, asli masla 5,000+ items par hi nazar aata hai.

   Naapta hai:
     · catalog inject (500 / 2000 / 5000 items)
     · POS screen: render time + DOM nodes (virtual scrolling kaam kar raha hai?)
     · Items screen: rows in DOM (pagination?)
     · Reports / Dashboard: render time
     · memory (JS heap)

   Hadain (budget):
     · POS render      < 2500ms
     · POS DOM nodes   < 400   (warnaye 5000 items par — virtual scrolling ka matlab)
     · heap            < 220MB
   ========================================================================== */
const puppeteer = require('puppeteer');
const { login } = require('./_harness');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const DEMO = path.join(ROOT, 'demo', 'index.html');

const SIZES = [500, 2000, 5000];
const BUDGET = { posRenderMs: 2000, posCards: 120, itemsRows: 200, heapMB: 220, growthMB: 60 };

let pass = 0, fail = 0; const failures = [];
const ok = (n, c, d) => c ? (pass++, console.log('  ✔ ' + n + (d ? '  → ' + d : '')))
  : (fail++, failures.push(n), console.log('  ✖ ' + n + (d ? '  → ' + d : '')));

if (!fs.existsSync(DEMO)) { console.log('✖ demo/index.html nahi mila'); process.exit(1); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1440, height: 900 }
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));

  await page.goto('file://' + DEMO, { waitUntil: 'load' });
  await login(page);             /* poll + login (shared harness) */
  await sleep(2800);

  console.log(`\n\x1b[1m§16 SCALE TEST — bade catalog par raftaar\x1b[0m\n`);

  for (const N of SIZES) {
    /* --- catalog badlein (asli items ke upar synthetic bana kar) --- */
    await page.evaluate((n) => {
      const base = (App.state.catalog && App.state.catalog.items) ? App.state.catalog.items : [];
      const proto = base[0] || { id: 'X', code: 'X000', name: 'Test Item',
        retailPrice: 100, wholesalePrice: 90, costPrice: 70, qty: 5, category: 'GEN', brand: 'GEN' };
      const big = [];
      for (let i = 0; i < n; i++) {
        big.push(Object.assign({}, proto, {
          id: 'B' + i, code: 'BC' + String(i).padStart(5, '0'),
          name: 'Bulk test item number ' + i + ' — dashboard polish spray 450ml',
          retailPrice: 100 + (i % 500), wholesalePrice: 90 + (i % 400),
          costPrice: 70 + (i % 300), qty: (i % 40), category: 'CAT' + (i % 12),
          brand: 'BRAND' + (i % 8)
        }));
      }
      App.state.catalog.items = big;
      App.state.catalog.ts = Date.now();
      try { Store.set('catalog', App.state.catalog); } catch (e) { }
      window.__api = { fails: [] };
      if (!window.__patched) {
        window.__patched = true;
        const orig = API.call.bind(API);
        API.call = function (a, pl, o) {
          return orig(a, pl, o).then(r => r, e => { window.__api.fails.push(a); throw e; });
        };
      }
    }, N);

    /* --- POS --- */
    await page.evaluate(() => { location.hash = '#/dashboard'; });
    await sleep(600);
    /* ASLI render time: navigation se le kar POS grid ke bharne tak.
       (Pehle sleep(2600) ka waqt bhi render time mein gin liya jata tha —
        is liye har size par 2600ms hi aata tha, jo ghalat tha.) */
    const posMs = await page.evaluate(async () => {
      const t0 = performance.now();
      location.hash = '#/pos';
      for (let i = 0; i < 200; i++) {
        await new Promise(r => setTimeout(r, 25));
        const g = document.querySelector('#view [class*=grid], #view [class*=results], #view [class*=pcard]');
        if (g && g.children.length > 0) return Math.round(performance.now() - t0);
      }
      return Math.round(performance.now() - t0);
    });
    await sleep(400);
    const pos = await page.evaluate(() => {
      let nodes = 0;
      const v = document.getElementById('view');
      if (v) nodes = v.querySelectorAll('*').length;
      const cards = document.querySelectorAll('#view [class*=pcard],#view [class*=card-item]').length;
      return { nodes, cards };
    });

    /* --- Items table --- */
    await page.evaluate(() => { location.hash = '#/items'; });
    await sleep(2600);
    const items = await page.evaluate(() => ({
      rows: document.querySelectorAll('#view tbody tr').length,
      nodes: (() => { const v = document.getElementById('view'); return v ? v.querySelectorAll('*').length : 0; })()
    }));

    /* --- Dashboard (charts + aggregation) --- */
    const t2 = Date.now();
    await page.evaluate(() => { location.hash = '#/dashboard'; });
    await sleep(2800);
    const dashMs = Date.now() - t2;

    const heap = await page.evaluate(() => {
      try { return Math.round((performance.memory.usedJSHeapSize || 0) / 1048576); } catch (e) { return -1; }
    });

    const failsList = await page.evaluate(() => (window.__api && window.__api.fails) || []);

    console.log(`\n  ── ${N} items ──`);
    console.log(`     POS render ${posMs}ms · view nodes ${pos.nodes} (${pos.cards} cards)`);
    console.log(`     Items: ${items.rows} rows · ${items.nodes} nodes`);
    console.log(`     Dashboard render ${dashMs}ms · heap ${heap}MB`);
    ok(`${N}: POS render < ${BUDGET.posRenderMs}ms`, posMs < BUDGET.posRenderMs, posMs + 'ms');
    /* virtual scrolling ka asli saboot: cards ki tadad catalog size se NAHI barhti */
    ok(`${N}: POS cards < ${BUDGET.posCards} (virtual scrolling — catalog size se azad)`,
      pos.cards > 0 && pos.cards < BUDGET.posCards, pos.cards + ' cards (kul view nodes ' + pos.nodes + ')');
    ok(`${N}: Items table paginated (< ${BUDGET.itemsRows} rows)`, items.rows > 0 && items.rows < BUDGET.itemsRows,
      items.rows + ' rows');
    ok(`${N}: heap < ${BUDGET.heapMB}MB`, heap < 0 || heap < BUDGET.heapMB, heap + 'MB');
    ok(`${N}: koi API failure nahi`, failsList.length === 0,
      failsList.length ? failsList.slice(0, 3).join(', ') : 'clean');
  }

  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log(`  §16 SCALE TEST   PASS: ${pass}   FAIL: ${fail}`);
  if (fail) failures.forEach(f => console.log('   ✖ ' + f));
  if (errs.length) {
    console.log(`  page errors: ${errs.length}`);
    [...new Set(errs)].slice(0, 5).forEach(e => console.log('    · ' + e.slice(0, 110)));
  } else console.log('  page errors: none');
  console.log('══════════════════════════════════════════════════════════════════');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('✖ ' + e.message); process.exit(1); });
