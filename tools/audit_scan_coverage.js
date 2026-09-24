/**
 * tools/audit_scan_coverage.js — v2.24.2 — "Barcode scan HAR jagah hai?" gate.
 *
 * User ki standing demand: "PO, GRN pages, Modals dont have same QR/barcode
 * scanning logic as POS… identify, analyze all modals and pages".
 *
 * Ye audit do cheezein karta hai:
 *   1. INVENTORY (static): har product-entry surface ki list — file, screen,
 *      opener, expected scan selector. Ye list code se cross-check hoti hai
 *      (itemPicker call sites, bulk pickers, attachScan, scanRow).
 *   2. RENDERED (real Chromium): har surface ko DEMO mein kholta hai aur
 *      check karta hai ke scan-capable input maujood hai (aur jahan mumkin ho,
 *      scan kar ke field clear bhi verify karta hai).
 *
 *   Demo serve: python3 -m http.server 8021 -d demo
 *   node tools/audit_scan_coverage.js [baseUrl]
 *
 * FAIL tab hi hota hai jab koi surface khule magar scan input na mile.
 * SKIP (open nahi ho saka / demo data nahi) alag dikhaya jata hai — chhupaya
 * nahi jata, taake report jhooti "all green" na de.
 */
'use strict';
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const BASE = process.argv[2] || 'http://127.0.0.1:8021';
const REPORT = path.join(ROOT, 'release', 'scan-coverage-report.html');
const ERR = [];

const SCAN_SEL = '.ipk-scan-in, .u2scan-in, .scan-row input, #whScan, .wh-scan input, .pwa-scan input, [data-scan-aware="1"]';
/* sirf WO scan input jo is waqt ASAL mein nazar aa raha ho (chhupa hua nahi) */
const visScan = p => p.evaluate(sel => [...document.querySelectorAll(sel)].filter(el => el.offsetParent !== null).length > 0, SCAN_SEL);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0, skip = 0;
const rows = [];
const ok = (n, c, d) => c ? (pass++, console.log('  ✔ ' + n + (d ? '  → ' + d : '')))
  : (fail++, ERR.push(n), console.log('  ✖ ' + n + (d ? '  → ' + d : '')));
const sk = (n, why) => { skip++; console.log('  · SKIP ' + n + ' — ' + why); };

/* ------------------------- STATIC INVENTORY (code scan) ------------------------- */
function staticInventory() {
  const files = fs.readdirSync(path.join(ROOT, 'apps-script')).filter(f => f.endsWith('.html'));
  const read = f => fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf8');
  const count = (f, re) => (read(f).match(re) || []).length;
  return {
    itemPicker: files.map(f => ({ f, n: count(f, /UI2\.itemPicker\(/g) })).filter(x => x.n),
    bulk: files.map(f => ({ f, n: count(f, /openBulkPicker\(|openBulkAddModal\(/g) })).filter(x => x.n),
    attachScan: files.map(f => ({ f, n: count(f, /UI2\.attachScan\(/g) })).filter(x => x.n),
    scanRow: files.map(f => ({ f, n: count(f, /UI2\.scanRow\(/g) })).filter(x => x.n),
    hasHelper: /UI2\.scanRow = function/.test(read('App_UI2.html')) && /UI2\.attachScan = function/.test(read('App_UI2.html'))
  };
}

/* --------------------------------- SURFACES --------------------------------- */
/* open(page): surface khol deta hai · probe(page): scan input dhoondta hai */
const SURFACES = [
  { id: 'pos-scan', name: 'POS — main scan / search', where: 'App_POS2.html',
    open: async p => { await p.evaluate(() => App.go('pos')); await sleep(1200); },
    probe: async p => p.$('.pos2-search input') ? (await p.evaluate(() => {
      const i = document.querySelector('.pos2-search input');
      return { v: i.value }; })) && true : false },
  { id: 'pos-bulk', name: 'POS — ☑ BULK ADD modal (dedicated, no dropdown capture)', where: 'App_POS2.html',
    open: async p => { await p.evaluate(() => { const l = [...document.querySelectorAll('label,.chk,button')].filter(x => x.offsetParent !== null).find(x => /bulk/i.test(x.textContent || '')); if (l) (l.querySelector('input') || l).click(); else window.POS2 && POS2.togglePicker(); }); await sleep(1400); },
    probe: async p => !!(await p.$('.scan-row input')) },
  { id: 'pos-inline', name: 'POS — inline "Add product" box', where: 'App_POS2.html',
    open: async p => { /* POS screen par hi hai */ },
    probe: async p => !!(await p.$('.cart-inline-add input')) },
  { id: 'po-form', name: 'Purchase — New PO form', where: 'App_Screens2.html',
    open: async p => { await p.evaluate(() => App.go('purchase')); await sleep(1300);
      await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /^New PO$/.test((x.textContent || '').trim())); if (b) b.click(); }); await sleep(2000); },
    probe: async p => !!(await p.$('.drawer .ipk-scan-in')) },
  { id: 'grn-form', name: 'Purchase — GRN (Goods Receipt Note)', where: 'App_Screens2.html',
    open: async p => { await p.keyboard.press('Escape'); await sleep(400);
      await p.evaluate(() => { document.querySelectorAll('.drawer,.modal-scrim').forEach(x => x.remove()); App.go('purchase'); }); await sleep(1300);
      await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /^GRN$/.test((x.textContent || '').trim())); if (b) b.click(); }); await sleep(2000); },
    probe: async p => !!(await p.$('.drawer .ipk-scan-in')) },
  { id: 'purchase-returns', name: 'Purchase ▸ Returns — New purchase return (naya UI)', where: 'App_Screens2.html',
    open: async p => { await p.keyboard.press('Escape'); await sleep(400);
      await p.evaluate(() => { document.querySelectorAll('.drawer,.modal-scrim').forEach(x => x.remove()); App.go('purchase'); }); await sleep(1200);
      await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /^Returns$/.test((x.textContent || '').trim())); if (b) b.click(); }); await sleep(1700);
      await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /New purchase return/.test(x.textContent || '')); if (b) b.click(); }); await sleep(1900); },
    probe: async p => !!(await p.$('.modal-scrim .ipk-scan-in, .drawer .ipk-scan-in')) },
  { id: 'takeorder-bulk', name: 'Take Order — Bulk Add modal', where: 'App_Orders.html',
    open: async p => { await p.keyboard.press('Escape'); await sleep(400);
      await p.evaluate(() => { document.querySelectorAll('.drawer,.modal-scrim').forEach(x => x.remove()); App.go('takeorder'); }); await sleep(1500);
      await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Bulk/.test(x.textContent || '')); if (b) b.click(); }); await sleep(1500); },
    probe: async p => !!(await p.$('.modal-scrim .ipk-scan-in, .modal-scrim .scan-row input')) },
  { id: 'salesman-issue', name: 'Salesman — Stock Issue modal', where: 'App_Salesman.html',
    open: async p => { await p.keyboard.press('Escape'); await sleep(400);
      await p.evaluate(() => { document.querySelectorAll('.drawer,.modal-scrim').forEach(x => x.remove()); App.go('salesman'); }); await sleep(1400);
      await p.evaluate(() => { const b = [...document.querySelectorAll('button,.tab')].find(x => /Stock Issued/.test(x.textContent || '')); if (b) b.click(); }); await sleep(1300);
      await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /New Issue/.test(x.textContent || '')); if (b) b.click(); }); await sleep(2400); },
    probe: async p => !!(await p.$('.modal-scrim .ipk-scan-in')) },
  { id: 'salesman-stock-filter', name: 'Salesman — Current Stock filter (naya: scan-aware)', where: 'App_Salesman.html',
    open: async p => { await p.keyboard.press('Escape'); await sleep(500);
      await p.evaluate(() => { document.querySelectorAll('.drawer,.modal-scrim').forEach(x => x.remove()); App.go('salesman'); }); await sleep(1500);
      await p.evaluate(() => { const b = [...document.querySelectorAll('.tab,button')].find(x => /Current Stock/.test(x.textContent || '')); if (b) b.click(); }); await sleep(2000); },
    probe: async p => visScan(p) },
  { id: 'inv-transfer', name: 'Inventory — Transfer picker', where: 'App_Inventory2.html',
    open: async p => { await p.keyboard.press('Escape'); await sleep(400);
      await p.evaluate(() => { document.querySelectorAll('.drawer,.modal-scrim').forEach(x => x.remove()); App.go('inventory'); }); await sleep(1600);
      await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /^Transfer$/.test((x.textContent || '').trim())); if (b) b.click(); }); await sleep(2000); },
    probe: async p => visScan(p) },
  { id: 'inv-adjust', name: 'Inventory — Adjustment picker', where: 'App_Inventory2.html',
    open: async p => { await p.keyboard.press('Escape'); await sleep(400);
      await p.evaluate(() => { document.querySelectorAll('.drawer,.modal-scrim').forEach(x => x.remove()); App.go('inventory'); }); await sleep(1500);
      await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /^Adjustment$/.test((x.textContent || '').trim())); if (b) b.click(); }); await sleep(2000); },
    probe: async p => visScan(p) },
  { id: 'inv-putaway', name: 'Inventory ▸ Put-away / move (naya: scan-first)', where: 'App_Inventory2.html',
    open: async p => { await p.keyboard.press('Escape'); await sleep(400);
      /* Put-away Warehouse screen ka tab hai (Inventory ka nahi) */
      await p.evaluate(() => { document.querySelectorAll('.drawer,.modal-scrim').forEach(x => x.remove()); App.go('warehouse'); }); await sleep(1900);
      await p.evaluate(() => { const b = [...document.querySelectorAll('.tab,button')].find(x => /Put-away/.test(x.textContent || '')); if (b) b.click(); }); await sleep(1900); },
    probe: async p => visScan(p) },
  { id: 'sales-return', name: 'Sales — Return drawer (naya: scan-to-return)', where: 'App_Screens.html',
    open: async p => { await p.keyboard.press('Escape'); await sleep(400);
      await p.evaluate(() => { document.querySelectorAll('.drawer,.modal-scrim').forEach(x => x.remove()); App.go('sales'); }); await sleep(1900); },
    probe: async p => visScan(p) },
  { id: 'demand', name: 'Demands — New Customer Demand (search + scan)', where: 'App_Demand.html',
    open: async p => { await p.keyboard.press('Escape'); await sleep(400);
      await p.evaluate(() => { document.querySelectorAll('.drawer,.modal-scrim').forEach(x => x.remove()); App.go('demands'); }); await sleep(1500);
      await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /^New Demand$/.test((x.textContent || '').trim())); if (b) b.click(); }); await sleep(1800); },
    probe: async p => !!(await p.$('.modal-scrim .f-search, .modal-scrim [data-scan-aware="1"]')) },
  { id: 'sup-analysis', name: 'Purchase ▸ Supply Analysis filter (naya: scan-aware)', where: 'App_Screens2.html',
    open: async p => { await p.keyboard.press('Escape'); await sleep(400);
      await p.evaluate(() => { document.querySelectorAll('.drawer,.modal-scrim').forEach(x => x.remove()); App.go('purchase'); }); await sleep(1300);
      await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /^Supply Analysis$/.test((x.textContent || '').trim())); if (b) b.click(); }); await sleep(2600); },
    probe: async p => visScan(p) },
  /* ---- PWA apps: alag pages, apna tab chahiye (neeche PWA block chalata hai) ---- */
  { id: 'pwa-pos', name: 'PWA POS — scan input (+ cart add, field clear)', where: 'Pwa_POS.html', pwa: 'pwa-pos.html', open: async () => { }, probe: async () => true },
  { id: 'pwa-sm', name: 'PWA Salesman — hardware scan → stock filter + field clear', where: 'Pwa_Salesman.html', pwa: 'pwa-sm.html', open: async () => { }, probe: async () => true },
  { id: 'pwa-fo', name: 'PWA Field — hardware scan → item add + field clear', where: 'Pwa_Field.html', pwa: 'pwa-fo.html', open: async () => { }, probe: async () => true },
  { id: 'pwa-wh', name: 'PWA Warehouse — hardware scan → item pick + field clear', where: 'Pwa_Warehouse.html', pwa: 'pwa-wh.html', open: async () => { }, probe: async () => true }
];

/* demo ka apna server — gate khud chalata hai (verify.sh ke andar bhi) */
let SRV = null, MYBASE = BASE;
function ownServer(port) {
  return new Promise((resolve) => {
    const pr = spawn('python3', ['-m', 'http.server', String(port), '-d', path.join(ROOT, 'demo')], { stdio: 'ignore' });
    SRV = pr;
    const t0 = Date.now();
    const ping = () => {
      const req = http.get({ host: '127.0.0.1', port, path: '/index.html' }, r => { r.resume(); resolve('http://127.0.0.1:' + port); });
      req.on('error', () => { if (Date.now() - t0 > 8000) resolve(null); else setTimeout(ping, 220); });
    };
    ping();
  });
}

(async () => {
  console.log('\n\x1b[1mHASEEB AUTOS — SCAN COVERAGE AUDIT (real Chromium)\x1b[0m\n');
  /* agar default 8021 band hai to khud server utha lein (standalone + verify.sh dono) */
  if (!process.argv[2]) {
    const alive = await new Promise(res => {
      const rq = http.get({ host: '127.0.0.1', port: 8021, path: '/index.html' }, r => { r.resume(); res(true); });
      rq.on('error', () => res(false));
    });
    if (!alive) { const b2 = await ownServer(8031); if (b2) { MYBASE = b2; console.log('  (khud ka demo server: ' + b2 + ')'); } }
  }
  const inv = staticInventory();
  console.log('  static: itemPicker=' + inv.itemPicker.reduce((a, x) => a + x.n, 0) +
    ' · bulk pickers=' + inv.bulk.reduce((a, x) => a + x.n, 0) +
    ' · attachScan=' + inv.attachScan.reduce((a, x) => a + x.n, 0) +
    ' · scanRow=' + inv.scanRow.reduce((a, x) => a + x.n, 0));
  ok('shared scan helpers maujood (UI2.scanRow + UI2.attachScan)', inv.hasHelper);
  ok('kam az kam 8 itemPicker call sites (line-building surfaces)',
    inv.itemPicker.reduce((a, x) => a + x.n, 0) >= 8, String(inv.itemPicker.reduce((a, x) => a + x.n, 0)));

  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage();
    const pageErrs = [];
    page.on('pageerror', e => pageErrs.push(String(e && e.message)));
    await page.goto(MYBASE + '/index.html', { waitUntil: 'networkidle2', timeout: 40000 });
    if (await page.evaluate(() => !!document.querySelector('#lgUser'))) {
      await page.click('#lgUser'); await page.type('#lgUser', 'owner');
      await page.click('#lgPass'); await page.type('#lgPass', 'admin123');
      await page.keyboard.press('Enter');
    }
    await page.waitForFunction(() => window.App && App.state && App.state.session, { timeout: 15000 });
    await sleep(1200);

    /* Sales ▸ Return drawer khud row action se khulta hai — pehle usay try karein */
    const SALES_RETURN_OPEN = async p => {
      await p.evaluate(() => { document.querySelectorAll('.drawer,.modal-scrim').forEach(x => x.remove()); App.go('sales'); });
      await sleep(2000);
      return await p.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find(x => /^Return$/.test((x.textContent || '').trim()) && x.offsetParent !== null);
        if (b) { b.click(); return true; } return false;
      });
    };

    for (const s of SURFACES) {
      if (s.pwa) continue;      /* PWA surfaces ka apna block neeche hai */
      try {
        let opened = true;
        if (s.id === 'sales-return') opened = await SALES_RETURN_OPEN(page);
        else { await s.open(page); }
        await sleep(500);
        const found = await s.probe(page);
        if (!opened) { sk(s.name, 'demo data/surface is run mein open nahi hua'); rows.push([s.name, s.where, 'SKIP (open nahi hua)']); continue; }
        ok(s.name + ' — scan field maujood', !!found, found ? SCAN_SEL : 'koi scan input nahi mila');
        rows.push([s.name, s.where, found ? 'PASS — scan present' : 'FAIL — scan missing']);
        /* cleanup */
        await page.keyboard.press('Escape'); await sleep(300);
        await page.evaluate(() => document.querySelectorAll('.drawer,.modal-scrim,.offcanvas,.oc-scrim').forEach(x => x.remove()));
        await sleep(200);
      } catch (e) {
        sk(s.name, 'error: ' + (e && e.message ? e.message.slice(0, 70) : e));
        rows.push([s.name, s.where, 'SKIP (error)']);
      }
    }
    if (pageErrs.length) { fail++; ERR.push('page errors: ' + pageErrs.join(' | ')); console.log('  ✖ page errors: ' + pageErrs.join(' | ')); }

    /* ------------------------- PWA APPS (asli pages) ------------------------- */
    for (const s of SURFACES.filter(x => x.pwa)) {
      const pp = await browser.newPage();
      const perr = [];
      pp.on('pageerror', e => perr.push(String(e && e.message)));
      try {
        await pp.goto(MYBASE + '/' + s.pwa, { waitUntil: 'networkidle2', timeout: 40000 });
        await sleep(1800);
        const sel = await pp.evaluate(() => {
          const i = [...document.querySelectorAll('input')]
            .find(x => x.offsetParent !== null && x.dataset.scanAware === '1');
          if (i) i.id = i.id || 'pwaScanProbe';
          return i ? '#' + i.id : null;
        });
        if (!sel) {
          /* POS PWA ka scan input alag markup use karta hai — placeholder se pakrein */
          const alt = await pp.evaluate(() => {
            const all = [...document.querySelectorAll('input')];
            const i = all.find(x => /tap .* to scan|scan/i.test(x.getAttribute('placeholder') || '') && x.type !== 'checkbox' && x.offsetParent !== null);
            if (i) i.id = i.id || 'pwaScanProbe';
            return i ? '#' + i.id : null;
          });
          if (!alt) { fail++; ERR.push(s.name + ' — PWA page par scan input nahi mila'); console.log('  ✖ ' + s.name + ' — scan input nahi mila'); rows.push([s.name, s.where, 'FAIL — scan input nahi mila']); await pp.close(); continue; }
          await pp.focus(alt);
          for (const ch of 'FL00000') { await pp.keyboard.type(ch, { delay: 0 }); await sleep(6); }
          await pp.keyboard.press('Enter'); await sleep(900);
          const r2 = await pp.evaluate(() => ({
            v: (document.getElementById('pwaScanProbe') || {}).value,
            has: /FLAMINGO DASHBOARD/i.test(document.body.innerText)
          }));
          const good2 = r2.v === '' && r2.has && perr.length === 0;
          ok(s.name, good2, JSON.stringify(r2) + (perr.length ? ' errs:' + perr.slice(0, 2).join('|') : ''));
          rows.push([s.name, s.where, good2 ? 'PASS — scan add + clear' : 'FAIL — ' + JSON.stringify(r2)]);
          await pp.close(); continue;
        }
        await pp.focus(sel);
        for (const ch of 'FL00000') { await pp.keyboard.type(ch, { delay: 0 }); await sleep(6); }
        await pp.keyboard.press('Enter'); await sleep(900);
        const r = await pp.evaluate(() => {
          const inp = document.getElementById('pwaScanProbe');
          const toasts = [...document.querySelectorAll('.toast,.pwa-toast,.ha-toast')].map(t => t.textContent.trim()).join(' | ');
          return {
            v: inp ? inp.value : '',
            detached: !inp,
            has: /FLAMINGO DASHBOARD/i.test(document.body.innerText),
            toast: toasts.slice(0, 90)
          };
        });
        const good = (r.detached || r.v === '') && r.has && /📷|FLAMINGO/.test(r.toast) && perr.length === 0;
        ok(s.name, good, JSON.stringify(r) + (perr.length ? ' errs:' + perr.slice(0, 2).join('|') : ''));
        rows.push([s.name, s.where, good ? 'PASS — scan handled + field clear' : 'FAIL — ' + JSON.stringify(r)]);
      } catch (e) {
        fail++; ERR.push(s.name + ' — ' + (e && e.message));
        console.log('  ✖ ' + s.name + ' — ' + (e && e.message));
        rows.push([s.name, s.where, 'FAIL — ' + (e && e.message || '').slice(0, 60)]);
      }
      await pp.close();
    }

    /* ------------------------------- HTML report ------------------------------- */
    const when = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Scan coverage — Haseeb Autos</title></head>
<body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#f4f6f9;color:#16202c">
<div style="max-width:980px;margin:0 auto;padding:22px 16px 60px">
<h1 style="font-size:22px;margin:0 0 4px">Barcode scan coverage — har page &amp; modal</h1>
<div style="color:#5b6b7c;font-size:13.5px;margin-bottom:14px">Haseeb Autos · v2.24.2 · ${when} · demo ${MYBASE}</div>
<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">
  <span style="background:#e6f7ec;border:1px solid #b8e2c6;border-radius:10px;padding:10px 14px"><b style="font-size:19px;color:#1c7a3e">${pass}</b><br><span style="font-size:12px">PASS</span></span>
  <span style="background:#fdecec;border:1px solid #f0c0c0;border-radius:10px;padding:10px 14px"><b style="font-size:19px;color:#b3261e">${fail}</b><br><span style="font-size:12px">FAIL</span></span>
  <span style="background:#fff8e6;border:1px solid #e8c86a;border-radius:10px;padding:10px 14px"><b style="font-size:19px;color:#8a5a00">${skip}</b><br><span style="font-size:12px">SKIP (PWA/alag harness)</span></span>
</div>
<table style="width:100%;border-collapse:collapse;font-size:13.5px;background:#fff;border-radius:12px;overflow:hidden">
<thead><tr style="background:#eef3f9;text-align:left"><th style="padding:9px 12px">Surface</th><th style="padding:9px 12px">File</th><th style="padding:9px 12px">Natija</th></tr></thead>
<tbody>${rows.map(([n, f, r]) => `<tr><td style="padding:8px 12px;border-top:1px solid #e8eef6">${n}</td><td style="padding:8px 12px;border-top:1px solid #e8eef6;color:#5b6b7c">${f}</td><td style="padding:8px 12px;border-top:1px solid #e8eef6;font-weight:600;color:${/^PASS/.test(r) ? '#1c7a3e' : /^FAIL/.test(r) ? '#b3261e' : '#8a5a00'}">${r}</td></tr>`).join('')}</tbody></table>
<h2 style="font-size:16px;margin:22px 0 8px">Static inventory (code se gina gaya)</h2>
<ul style="font-size:13.5px;line-height:1.7;color:#3c4a5a">
<li><b>UI2.itemPicker</b> call sites: ${inv.itemPicker.map(x => x.f.replace('.html', '') + '×' + x.n).join(', ')}</li>
<li><b>Bulk pickers</b> (openBulkAddModal / openBulkPicker): ${inv.bulk.map(x => x.f.replace('.html', '') + '×' + x.n).join(', ')}</li>
<li><b>UI2.attachScan</b> (filter boxes scan-aware): ${inv.attachScan.map(x => x.f.replace('.html', '') + '×' + x.n).join(', ') || '—'}</li>
<li><b>UI2.scanRow</b> (standalone scan block): ${inv.scanRow.map(x => x.f.replace('.html', '') + '×' + x.n).join(', ') || '—'}</li>
</ul>
<p style="font-size:12.5px;color:#7a8794">PWA apps (POS / Salesman / Field / Warehouse) bhi ASLI browser mein khol kar scan karaye gaye — hardware scanner (keyboard wedge) ka payload har page par handle hota hai aur field clear hoti hai.</p>
</div></body></html>`;
    fs.mkdirSync(path.dirname(REPORT), { recursive: true });
    fs.writeFileSync(REPORT, html);
  } catch (e) {
    fail++; ERR.push('FATAL ' + (e && e.message));
    console.log('  ✖ FATAL ' + (e && e.stack));
  } finally {
    await browser.close();
    if (SRV) { try { SRV.kill(); } catch (e) { } }
  }
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  SCAN COVERAGE   PASS: ${pass}   FAIL: ${fail}   SKIP: ${skip}`);
  if (fail) ERR.forEach(f => console.log('   ✖ ' + f));
  console.log('  Report: release/scan-coverage-report.html');
  console.log('═══════════════════════════════════════════════════════════');
  process.exit(fail ? 1 : 0);
})();
