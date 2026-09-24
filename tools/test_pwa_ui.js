#!/usr/bin/env node
/* ==========================================================================
   test_pwa_ui.js — v2.6 §10/§11/§13
   PWA demo pages ko JSDOM mein ASLI TARAH boot kar ke check karta hai.
   --------------------------------------------------------------------------
   Ye test is liye zaroori hai: backend tests (test_logic.js) sirf API ko
   check karte hain. "App khul rahi hai ya nahi, screen par kuch nazar aa raha
   hai ya safed pani" — sirf render kar ke pata chalta hai.

   Chalane ka tariqa:
     python3 tools/build_pwa_demo.py
     node tools/test_pwa_ui.js
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const DEMO = path.join(ROOT, 'demo');

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ✔ ' + name + (detail ? '  → ' + detail : '')); }
  else { fail++; failures.push(name + (detail ? '  → ' + detail : '')); console.log('  ✖ ' + name + (detail ? '  → ' + detail : '')); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const APPS = [
  { id: 'wh', file: 'pwa-wh.html', name: 'Warehouse', tabs: ['Receive', 'Put-away', 'Count', 'Transfer'] },
  { id: 'fo', file: 'pwa-fo.html', name: 'Field Orders', tabs: ['New order', 'Pending', 'Synced'] },
  { id: 'sm', file: 'pwa-sm.html', name: 'Salesman', tabs: ['My stock', 'Sell', 'Collect', 'Settle'] }
];

async function loadApp(app) {
  const file = path.join(DEMO, app.file);
  if (!fs.existsSync(file)) throw new Error('demo page missing: ' + app.file);
  const html = fs.readFileSync(file, 'utf8');

  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(String(e.message || e)));
  vc.on('error', (...a) => errors.push(a.map(String).join(' ')));

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    url: 'https://localhost/demo/' + app.file
  });
  const win = dom.window;
  win.prompt = () => '5';                     // count tab qty prompt
  win.matchMedia = win.matchMedia || (() => ({ matches: false, addListener() { }, removeListener() { } }));

  // boot hone do
  for (let i = 0; i < 40; i++) {
    await sleep(50);
    const body = win.document.querySelector('#pwaBody');
    if (body && body.children.length && !body.querySelector('.skel')) break;
  }
  await sleep(300);
  return { dom, win, doc: win.document, errors };
}

async function testApp(app) {
  console.log('\n\x1b[1m' + app.name + ' PWA (' + app.file + ')\x1b[0m');
  const { win, doc, errors } = await loadApp(app);

  ok(app.name + ': boot ke baad JS error nahi', errors.length === 0, errors.slice(0, 2).join(' | '));

  /* ---- top bar ---- */
  const title = doc.querySelector('#pwaTitle');
  ok(app.name + ': title bar render hua', !!title && (title.textContent || '').trim().length > 0,
    title ? title.textContent.trim() : 'no #pwaTitle');

  /* ---- bottom tabs ---- */
  const tabs = Array.from(doc.querySelectorAll('#pwaBar .b'));
  ok(app.name + ': ' + app.tabs.length + ' bottom tabs hain', tabs.length >= app.tabs.length,
    'found=' + tabs.length + ' → ' + tabs.map(t => (t.textContent || '').trim()).join(' | '));
  app.tabs.forEach((label) => {
    const found = tabs.some(t => (t.textContent || '').indexOf(label) > -1);
    ok(app.name + ': tab "' + label + '" maujood', found,
      tabs.map(t => (t.textContent || '').trim()).join(' | '));
  });

  /* ---- har tab pe click kar ke dekho: kuch to nazar aaye ---- */
  for (let i = 0; i < app.tabs.length; i++) {
    const label = app.tabs[i];
    const btn = Array.from(doc.querySelectorAll('#pwaBar .b'))
      .find(t => (t.textContent || '').indexOf(label) > -1);
    if (!btn) continue;
    const before = errors.length;
    btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
    await sleep(260);
    const body = doc.querySelector('#pwaBody');
    const txt = (body ? body.textContent : '').trim();
    ok(app.name + ' ▸ ' + label + ': screen khaali nahi', txt.length > 20,
      'len=' + txt.length + ' → ' + txt.slice(0, 70));
    ok(app.name + ' ▸ ' + label + ': koi error nahi', errors.length === before,
      errors.slice(before).join(' | '));
    ok(app.name + ' ▸ ' + label + ': "undefined"/"NaN" nazar nahi aata',
      !/undefined|NaN|\[object Object\]/.test(txt),
      (txt.match(/undefined|NaN|\[object Object\]/g) || []).slice(0, 3).join(','));
  }

  return { win, doc, errors };
}

(async function main() {
  console.log('══════════════════════════════════════════════════════════════════');
  console.log('  PWA UI TESTS — teenon mobile apps asli tarah render ho rahi hain?');
  console.log('══════════════════════════════════════════════════════════════════');

  /* ---------------- WareHOME: item scan → cart ---------------- */
  {
    const { win, doc } = await testApp(APPS[0]);
    const input = doc.querySelector('#pwaBody input[type="search"]');
    ok('Warehouse: search box maujood (scanner)', !!input, 'no search input');
    if (input) {
      input.value = 'FL00002';
      input.dispatchEvent(new win.Event('input', { bubbles: true }));
      await sleep(220);
      const hits = doc.querySelectorAll('#pwaHits .task');
      ok('Warehouse: scan karne par item milta hai', hits.length > 0, 'hits=' + hits.length);
      if (hits.length) {
        hits[0].dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
        await sleep(220);
        const bodyTxt = (doc.querySelector('#pwaBody').textContent || '');
        ok('Warehouse: item click karne se cart mein lagta hai', /Lines \(1\)/.test(bodyTxt),
          (bodyTxt.match(/Lines \(\d+\)/) || ['no Lines()'])[0]);
      }
    }
  }

  /* ---------------- Field Orders ---------------- */
  {
    const { win, doc } = await testApp(APPS[1]);
    // "New order" tab par wapas aao
    const btn = Array.from(doc.querySelectorAll('#pwaBar .b'))
      .find(t => (t.textContent || '').indexOf('New order') > -1);
    if (btn) { btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); await sleep(250); }
    const input = doc.querySelector('#pwaBody input[type="search"]');
    ok('Field: item search box maujood', !!input, 'no search input');
    if (input) {
      input.value = 'FL00002';
      input.dispatchEvent(new win.Event('input', { bubbles: true }));
      await sleep(220);
      const hits = doc.querySelectorAll('#pwaHits .task');
      ok('Field: scan par item milta hai', hits.length > 0, 'hits=' + hits.length);
      if (hits.length) {
        hits[0].dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
        await sleep(250);
        const t = doc.querySelector('#pwaBody').textContent || '';
        ok('Field: item add karne se order line banti hai', /Order lines \(1\)/.test(t),
          (t.match(/Order lines \(\d+\)/) || ['no lines'])[0]);
      }
    }
  }

  /* ---------------- Salesman: mera stock ---------------- */
  {
    const { doc } = await testApp(APPS[2]);
    const btn = Array.from(doc.querySelectorAll('#pwaBar .b'))
      .find(t => (t.textContent || '').indexOf('My stock') > -1);
    if (btn) { btn.dispatchEvent(new doc.defaultView.MouseEvent('click', { bubbles: true })); await sleep(300); }
    const t = doc.querySelector('#pwaBody').textContent || '';
    ok('Salesman: "Mera stock" mein asli items hain (khaali nahi)',
      /Mera stock \([1-9]/.test(t), (t.match(/Mera stock \(\d+ items\)/) || ['stock empty'])[0]);
    ok('Salesman: stock ki value nazar aa rahi hai', /Total value/.test(t), 'no total value');
    ok('Salesman: stock value 0 NAHI hai (avgCost field theek padh rahi hai)',
      !/Total value[^0-9]*PKR 0(\.00)?/.test(t.replace(/\s+/g, ' ')),
      (t.match(/Total value.{0,20}/) || ['?'])[0]);
  }

  /* ---------------- shared: offline queue ---------------- */
  console.log('\n\x1b[1mOffline queue (shared shell)\x1b[0m');
  {
    const { win, doc } = await loadApp(APPS[1]);
    ok('Offline: PWA object load hua', typeof win.PWA === 'object', 'PWA missing');
    // net band karo → enqueue hona chahiye
    Object.defineProperty(win.navigator, 'onLine', { value: false, configurable: true });
    win.dispatchEvent(new win.Event('offline'));
    await sleep(120);
    try {
      const r = await win.PWA.call('pwa.fo.order', { items: [{ itemId: 'X', qty: 1, price: 10 }] }, { queueable: true });
      ok('Offline: entry queue mein chali jati hai (kaam rukta nahi)', r && r.queued === true,
        JSON.stringify(r));
      const n = win.PWA.queuedCount();
      ok('Offline: queue count barh gaya', n >= 1, 'count=' + n);
      const net = doc.querySelector('#pwaNet');
      ok('Offline: net badge "Offline" dikhata hai', !!net && /Offline|queued/i.test(net.textContent || ''),
        net ? net.textContent : 'no badge');
    } catch (e) {
      ok('Offline: entry queue mein chali jati hai (kaam rukta nahi)', false, e.message);
    }
  }

  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log(`  PASS: ${pass}   FAIL: ${fail}`);
  if (fail) { failures.forEach(f => console.log('   ✖ ' + f)); }
  console.log('══════════════════════════════════════════════════════════════════');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
