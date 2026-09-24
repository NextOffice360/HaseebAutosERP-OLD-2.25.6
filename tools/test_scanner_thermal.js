#!/usr/bin/env node
/* ============================================================================
   tools/test_scanner_thermal.js — v2.14.0 GATE
   Live-camera scanner bridge (HaScan) + external scanner page contract +
   thermal paper handling (Print.pageCss / Exports.htmlToPdf / Print.open).
   Parts A+B run on the mocked host / static files; Part C renders the built
   demo in headless Chrome and drives the real bridge functions.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const { loadBackend } = require('./mock_gs');
let passed = 0, failed = 0;
function ok(name, cond, note) {
  if (cond) { passed++; console.log('PASS ' + name + (note ? '  → ' + note : '')); }
  else { failed++; console.log('FAIL ' + name + (note ? '  → ' + note : '')); }
}

const ROOT = path.join(__dirname, '..');

/* ══════════════════ A · backend contracts (mocked Sheets/Drive) ══════════ */
const { sandbox: s } = loadBackend(path.join(ROOT, 'apps-script'));
s.setupAll();
const owner = { userId: 'OWNER-QR', username: 'owner', role: 'OWNER', permissions: ['*'], locationId: 'LOC-SDQ' };

const t80 = s.Print.pageCss('80mm');
ok('thermal pageCss uses continuous-roll size + body width',
  t80.includes('@page{size:80mm auto;margin:2mm}') && t80.includes('body{width:80mm'), t80.slice(0, 40));
ok('A5 pageCss sets exact sheet dimensions', s.Print.pageCss('A5').includes('size:148mm 210mm'));
ok('unknown paper falls back to default size (no throw, no empty)',
  s.Print.pageCss('does-not-exist').includes('size:80mm'));

s.DB.setSettings({ 'exports.shareLinks': 'false' }, owner);
const withPaper = s.Exports.htmlToPdf({ html: '<b>receipt</b>', name: 'receipt-80mm', paper: '80mm' }, owner);
const saved = s.DriveApp.getFileById(withPaper.id);
const savedHtml = String(saved.getContent());
ok('htmlToPdf with paper appends overriding @page to the exported doc',
  savedHtml.includes('<style>@page{size:80mm auto;margin:2mm}body{width:80mm;margin:0 auto}</style>') && savedHtml.startsWith('<b>receipt</b>'));
const noPaper = s.Exports.htmlToPdf({ html: '<b>plain</b>', name: 'plain', }, owner);
const plainHtml = String(s.DriveApp.getFileById(noPaper.id).getContent());
ok('htmlToPdf without paper stays byte-identical (day reports untouched)',
  !plainHtml.includes('@page{size:80mm') && plainHtml === '<b>plain</b>');

/* route passthrough */
const viaRoute = s.ROUTES['exports.pdf']({ html: '<i>x</i>', name: 'r', paper: '58mm' }, owner);
ok('exports.pdf route forwards paper param',
  String(s.DriveApp.getFileById(viaRoute.id).getContent()).includes('size:58mm auto'));

/* settings defs */
const defs = s.CONFIG_DEFS;
const fields = [];
(function walk(list) { (list || []).forEach(t => (t.sub || []).forEach(sub => (sub.fields || []).forEach(f => fields.push(f)))); })(defs);
const fLive = fields.find(f => f.key === 'scanner.liveUrl');
const fInApp = fields.find(f => f.key === 'scanner.inApp');
const fPaper = fields.find(f => f.key === 'pos.receiptPaper');
ok('scanner.liveUrl + scanner.inApp settings exist (PWA tab, with hints)',
  !!fLive && !!fInApp && fLive.def === '' && fInApp.def === true &&
  fLive.hint && fLive.hint.includes('GitHub') && fInApp.type === 'switch');
ok('pos.receiptPaper select defaults to 80mm with thermal+sheet options',
  !!fPaper && fPaper.def === '80mm' && /58mm,80mm,110mm,A4,A5/.test(fPaper.options));

/* ══════════════════ B · static scanner page + pinned vendor ═══════════ */
const page = fs.readFileSync(path.join(ROOT, 'pwa/qr-scanner/index.html'), 'utf8');
const vendorPath = path.join(ROOT, 'pwa/qr-scanner/vendor/html5-qrcode.min.js');
const vendor = fs.readFileSync(vendorPath);
const sha = crypto.createHash('sha256').update(vendor).digest('hex');
ok('vendor html5-qrcode pinned (v2.3.8, MIT) — checksum matches guide',
  vendor.length === 375364 && sha === '660b12437b1d747e3e68b8be0685c08cb728140110ad213f167b14b66f8b1d8e',
  sha.slice(0, 12) + '… ' + vendor.length + ' bytes');
ok('scanner posts only to pinned Google origins, with nonce echo',
  page.includes("HASEEB_QR_RESULT") && /validRet/.test(page) &&
  /script\\.google\\.com/.test(page) && /googleusercontent\\.com/.test(page) &&
  page.includes('postMessage({ type: MSG_TYPE, value: value, nonce: NONCE }, RET)'));
ok('one-shot default + 1500ms cooldown (duplicate-scan prevention)',
  page.includes("var COOLDOWN_MS = 1500") && page.includes("QS.get('once') === '0'"));
ok('photo fallback uses OS camera app (capture=environment), decoded locally',
  page.includes('capture="environment"') && page.includes('decodeImageFile'));
ok('torch, camera-flip and auto-restart on visibilitychange present',
  page.includes('advanced: [{ torch: on }]') && page.includes("facing = facing === 'environment' ? 'user' : 'environment'") &&
  page.includes("visibilitychange"));
ok('scanner is a static island: no fetch/XHR/beacon, no remote src',
  !/fetch\(/.test(page) && !/XMLHttpRequest/.test(page) && !/sendBeacon/.test(page) &&
  !/<script[^>]+src="https?:/.test(page) && !/<link[^>]+href="https?:/.test(page));
ok('CSP meta locks the page to self + inline only',
  page.includes("default-src 'self'") && page.includes("connect-src 'none'"));
const qrBridge = fs.readFileSync(path.join(ROOT, 'apps-script/App_QR.html'), 'utf8');
ok('ERP bridge pins reply origin + nonce + timeout before falling back to manual',
  qrBridge.includes('if (ev.origin !== origin) return;') && qrBridge.includes("d.nonce !== n") &&
  qrBridge.includes('TIMEOUT_MS') && qrBridge.includes('window.HaScan = (function ()') &&
    qrBridge.includes("window.addEventListener('message', onMsg)"));
ok('POS scan button delegates to bridge (single scanner implementation)',
  fs.readFileSync(path.join(ROOT, 'apps-script/App_POS2.html'), 'utf8').includes('return HaScan.scan({ onDetect: onDetect })'));
const guide = fs.readFileSync(path.join(ROOT, 'release/QR-LIVE-CAMERA-GUIDE.md'), 'utf8');
ok('guide documents root cause, hosting options, security and test matrix',
  guide.includes('Permissions policy') && guide.includes('GitHub Pages') && guide.includes('nonce') &&
  guide.includes('Samsung') && guide.includes('sha256sum') && guide.length > 9000);

/* legacy quick-print window must set a real @page size (the A4/A5 complaint) */
const barcode = fs.readFileSync(path.join(ROOT, 'apps-script/App_Barcode.html'), 'utf8');
ok('legacy Print.baseCss emits size-aware @page per paper (58/80/110mm auto; A4/A5 fixed)',
  barcode.includes("'@page{size:' + m.w + 'mm auto;margin:2mm}'") &&
  barcode.includes('size:\' + (paper === \'A4\' ? \'A4 portrait\''));
ok('legacy popup ships a paper toolbar + print button and strips on print',
  barcode.includes('id="psz"') && barcode.includes('@media print{.ha-ptool{display:none!important}}'));
ok('every legacy Print.open call passes the receipt paper setting',
  ['App_POS.html', 'App_POS2.html', 'App_Screens.html', 'App_Comms.html'].every(f =>
    fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf8').includes("pos.receiptPaper'] || '80mm'")));
const appPrint = fs.readFileSync(path.join(ROOT, 'apps-script/App_Print.html'), 'utf8');
ok('Print dialog gained server Download PDF honouring the chosen paper',
  appPrint.includes('downloadPdf') && appPrint.includes("API.call('exports.pdf'") && appPrint.includes('paper: cfg.paper'));

/* ══════════════════ C · rendered bridge behavior (headless Chrome) ══════ */
(async () => {
  let browser;
  try { browser = require('puppeteer'); } catch (e) { browser = null; }
  if (!browser) { console.log('SKIP puppeteer render checks (not installed)'); finish(); return; }
  const b = await browser.launch({ args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.goto('file://' + path.join(ROOT, 'demo/index.html'), { waitUntil: 'load' });
  const r = await p.evaluate(async () => {
    const out = { checks: {} };
    const seen = [];
    window.open = (url, name, feat) => { seen.push({ url, feat }); return { closed: false, addEventListener() { }, close() { out.closed = true; } }; };
    const toasts = []; window.UI.toast = (m, k) => toasts.push(m + '|' + k);
    let got = null;
    window.App.state.settings = { 'scanner.liveUrl': 'https://scan.example.com/shop/' };
    const handle = window.HaScan.scan({ onDetect: v => { got = v; } });
    out.opened = seen[0] && seen[0].url || '';
    out.gotSync = got;

    const msg = (origin, data) => window.dispatchEvent(new MessageEvent('message', { origin, data, source: window }));
    const nonce = (out.opened.match(/[&?]n=([0-9a-f]{32})/) || [])[1];
    out.nonceShape = !!nonce;
    msg('https://evil.example', { type: 'HASEEB_QR_RESULT', value: 'EVIL', nonce });
    out.afterEvil = got;
    msg('https://scan.example.com', { type: 'HASEEB_QR_RESULT', value: 'NOPE', nonce: 'deadbeef'.repeat(4) });
    out.afterBadNonce = got;
    msg('https://scan.example.com', { type: 'HASEEB_QR_RESULT', value: 'BR-7788', nonce });
    out.afterGood = got;
    out.popupClosed = !!out.closed;

    /* second scan: fresh nonce, single-use listener detached */
    seen.length = 0;
    window.HaScan.scan({ onDetect: () => { out.second = true; } });
    const n2 = (seen[0].url.match(/[&?]n=([0-9a-f]{32})/) || [])[1];
    out.nonceRotated = n2 && n2 !== nonce;
    msg('https://scan.example.com', { type: 'HASEEB_QR_RESULT', value: 'X', nonce });   /* OLD nonce must NOT fire */
    out.oldNonceIgnored = !out.second;

    /* no liveUrl + inApp disabled → manual-capable modal, never a dead end */
    window.App.state.settings = { 'scanner.inApp': 'false' };
    window.HaScan.scan({ onDetect: () => { out.third = true; } });
    const modal = document.querySelector('.modal-scrim');
    out.modalShown = !!modal && /Settings|manual|type/i.test(modal.textContent);
    if (modal) { const btn = [...modal.querySelectorAll('button')].find(x => /Close/i.test(x.textContent)); btn && btn.click(); }
    out.toasts = toasts;
    return out;
  });
  ok('click opens the configured scanner with ret origin + 32-hex nonce, synchronously',
    /^https:\/\/scan\.example\.com\/shop\/\?ret=[^&]+&n=[0-9a-f]{32}$/.test(r.opened) && r.nonceShape,
    r.opened.slice(0, 86));
  ok('hostile origin and wrong nonce are ignored; exact origin+nonce delivers once',
    r.gotSync === null && r.afterEvil === null && r.afterBadNonce === null && r.afterGood === 'BR-7788');
  ok('result closes the popup and detaches the listener (old nonce replay dead)',
    r.popupClosed && r.nonceRotated && r.oldNonceIgnored);
  ok('no scanner URL + in-app disabled still shows manual path (never a dead end)',
    r.modalShown);
  await b.close();
  finish();
})().catch(e => { console.log('render phase error:', e.message); failed++; finish(); });

function finish() {
  console.log('\n' + '═'.repeat(66));
  console.log('  SCANNER+THERMAL   PASS: ' + passed + '   FAIL: ' + failed);
  console.log('═'.repeat(66));
  if (failed) process.exit(1);
}
