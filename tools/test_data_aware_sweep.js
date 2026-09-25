#!/usr/bin/env node
/**
 * tools/test_data_aware_sweep.js — W9.T3.5 GATE (spec Part-2 §3 · data-change reactivity)
 * ---------------------------------------------------------------------------
 * Contract (v2.30.5):
 *   ① Store.sub(topic, fn) → unsub fn; emit sab listeners (fail-eik-baaki-chale)
 *   ② API.call WRITE → Store 'data' event; READ → koi event nahi
 *   ③ Mounted UI2.table(load:) mutation ke baad AUTO-reload — naya data
 *      bina navigation/remount nazar (debounce 400ms)
 *   ④ live:false opt-out — koi auto-reload nahi
 *   ⑤ Debounce: 3 rapid writes → sirf 1 reload
 *   ⑥ Detached table (screen band) → listener chalta hai magar reload skip (no error)
 *   ⑦ zero page errors
 *
 *   node tools/test_data_aware_sweep.js
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
const jsErrors = [];
win.addEventListener('error', e => jsErrors.push(String(e.message || e).slice(0, 150)));

(async () => {
  for (let i = 0; i < 60 && !(win.UI2 && win.UI2.table && win.Store && win.Store.emit && win.App && win.App.state); i++) await wait(120);
  ok('demo app: Store.sub/emit + UI2.table mojood', !!(win.Store && win.Store.sub && win.Store.emit && win.UI2 && win.UI2.table));
  win.App.state.session = { userId: 'U1', username: 'owner', role: 'OWNER', permissions: ['*'], locationIds: [] };

  /* ── A ▸ pub/sub contract ── */
  section('A \u25b8 Store.sub/emit \u2014 contract');
  let hits = 0; let boom = 0;
  const unf = win.Store.sub('t1', () => { hits++; });
  win.Store.sub('t1', () => { throw new Error('listener fail'); });
  win.Store.sub('t1', () => { boom++; });
  win.Store.emit('t1', { x: 1 });
  ok('ek emit \u2192 dono sahi listeners chale (fail wala baaki ko nahi roka)', hits === 1 && boom === 1, hits + '/' + boom);
  unf();
  win.Store.emit('t1', { x: 2 });
  ok('unsubscribe \u2192 ab nahi chala', hits === 1);

  /* ── B ▸ API mutation → event ── */
  section('B \u25b8 API.call \u2014 write par event, read par nahi');
  let evCount = 0; let lastAction = '';
  win.Store.sub('data', p => { evCount++; lastAction = p && p.action || ''; });
  await win.API.call('items.list', {});
  ok('READ (items.list) \u2192 koi event nahi', evCount === 0, 'count=' + evCount);
  await win.API.call('items.save', { item: { name: 'Reactivity Item', code: 'REACT-1', category: 'T', qty: 1, rate: 10, retailPrice: 20 } });
  ok('WRITE (items.save) \u2192 data event + action naam', evCount === 1 && lastAction === 'items.save', lastAction + ' count=' + evCount);

  /* ── C ▸ live table auto-reload ── */
  section('C \u25b8 UI2.table(load:) \u2014 mounted table khud reload hota hai');
  const host = doc.createElement('div');
  doc.body.appendChild(host);
  let loads = 0;
  const wrap = win.UI2.table({
    screen: 'sweep_live', pageSize: 500,
    load: () => { loads++; return win.API.call('customers.list', {}).then(r => (r.customers || r.rows || r)); },
    columns: [{ key: 'name', label: 'Customer' }, { key: 'phone', label: 'Phone' }]
  });
  host.appendChild(wrap);
  await wait(600);                                       /* initial load */
  const beforeRows = wrap.querySelectorAll('tbody tr').length;
  const beforeText = wrap.textContent;
  ok('initial load hua + rows aayi', loads === 1 && beforeRows > 0, 'loads=' + loads + ' rows=' + beforeRows);
  ok('naya customer abhi nazar nahi (purana data)', !/Reactivity Customer/.test(beforeText));
  await win.API.call('customers.save', { customer: { name: 'Reactivity Customer', phone: '0300-123' } });
  await wait(1000);                                      /* debounce 400 + reload */
  ok('mutation ke baad table ne KHUD reload kiya (loads 1→2)', loads === 2, 'loads=' + loads);
  ok('naya row bina navigation nazar aata hai', /Reactivity Customer/.test(wrap.textContent));

  /* ── D ▸ live:false opt-out ── */
  section('D \u25b8 live:false \u2014 opt-out');
  let loadsD = 0;
  const wrapD = win.UI2.table({
    screen: 'sweep_static', live: false,
    load: () => { loadsD++; return Promise.resolve([{ name: 'S', code: 'S1' }]); },
    columns: [{ key: 'name', label: 'N' }]
  });
  host.appendChild(wrapD);
  await wait(400);
  await win.API.call('items.save', { item: { name: 'D Probe', code: 'REACT-3', category: 'T', qty: 1, rate: 1, retailPrice: 2 } });
  await wait(900);
  ok('live:false table ne reload NAHI kiya', loadsD === 1, 'loadsD=' + loadsD);

  /* ── E ▸ debounce ── */
  section('E \u25b8 Debounce \u2014 3 rapid writes \u2192 1 reload');
  const loadsE0 = loads;
  await win.API.call('items.save', { item: { name: 'E1', code: 'REACT-4', category: 'T', qty: 1, rate: 1, retailPrice: 2 } });
  await win.API.call('items.save', { item: { name: 'E2', code: 'REACT-5', category: 'T', qty: 1, rate: 1, retailPrice: 2 } });
  await win.API.call('items.save', { item: { name: 'E3', code: 'REACT-6', category: 'T', qty: 1, rate: 1, retailPrice: 2 } });
  await wait(1200);
  ok('3 writes ke baad sirf 1 extra reload (debounce)', loads - loadsE0 === 1, 'delta=' + (loads - loadsE0));

  /* ── F ▸ detached table ── */
  section('F \u25b8 Detached table \u2014 reload skip, koi error nahi');
  const hostF = doc.createElement('div');                  /* kabhi DOM me append nahi */
  let loadsF = 0;
  const wrapF = win.UI2.table({
    screen: 'sweep_detached',
    load: () => { loadsF++; return Promise.resolve([{ n: 1 }]); },
    columns: [{ key: 'n', label: 'N' }]
  });
  hostF.appendChild(wrapF);
  await wait(400);                                        /* initial load */
  await win.API.call('items.save', { item: { name: 'F1', code: 'REACT-7', category: 'T', qty: 1, rate: 1, retailPrice: 2 } });
  await wait(900);
  ok('detached: sirf initial load (reload skip)', loadsF === 1, 'loadsF=' + loadsF);

  section('G \u25b8 page health');
  ok('zero page errors', jsErrors.length === 0, jsErrors[0] || '');

  console.log('\n\x1b[1mSUMMARY:\x1b[0m ' + pass + ' pass \u00b7 ' + fail + ' fail \u00b7 ' + (fail === 0 ? '\x1b[32mGREEN\x1b[0m' : '\x1b[31mRED\x1b[0m'));
  if (failures.length) { console.log('Failures:'); failures.forEach(f => console.log('  - ' + f)); }
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
