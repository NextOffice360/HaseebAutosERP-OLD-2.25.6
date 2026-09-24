/**
 * tools/audit_modals_layout.js — v2.30.0 (N5) modal layout audit
 * ============================================================================
 * Har modal/offcanvas kholta hai (real Chrome, demo) aur naapta hai:
 *   · width (desktop 1440 par kitna patla hai — "unnecessarily narrow" ka proof)
 *   · horizontal overflow (content scrollW > clientW → unwanted h-scroll)
 *   · clip (koi section modal ke horizontal bounds se bahar)
 *   · vertical scroll mojood hai jab content lamba ho
 *   · header (m-head) aur footer/actions (m-foot) visible hain
 *
 *   node tools/audit_modals_layout.js            (report)
 *   node tools/audit_modals_layout.js --assert   (fail par exit 1)
 *   BASE: python3 -m http.server 8021 -d demo
 */
'use strict';
const puppeteer = require('puppeteer');
const BASE = process.argv.includes('--assert') ? (process.env.BASE || 'http://127.0.0.1:8021') : (process.env.BASE || 'http://127.0.0.1:8021');
const ASSERT = process.argv.includes('--assert');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MEASURE = `(() => {
  const list = Array.from(document.querySelectorAll('.modal-scrim .modal2, .modal-scrim .modal, .offcanvas'));
  const m = list[list.length - 1];
  if (!m) return { found: false };
  const r = m.getBoundingClientRect();
  const body = m.querySelector('.m-body, .modal-body, .oc-body') || m;
  const bs = getComputedStyle(body);
  const clipped = [];
  Array.from(m.querySelectorAll('table, .pay-footer, .f-grid, .chips, .loy-box, .ps-ledger, pre, img, .row, .tabbar-l2, .tabbar-l3'))
    .forEach(el => {
      const rr = el.getBoundingClientRect();
      if (rr.width === 0 && rr.height === 0) return;
      if (rr.right > r.right + 1.5 || rr.left < r.left - 1.5) clipped.push((String(el.className || el.tagName)).split(' ')[0]);
    });
  const head = m.querySelector('.m-head, .modal-head, .oc-head');
  const foot = m.querySelector('.m-foot, .modal-foot, .oc-foot, .modal-actions');
  const hf = (el) => { if (!el) return null; const rr = el.getBoundingClientRect(); return rr.height > 0 && rr.top >= r.top - 2 && rr.bottom <= r.bottom + 2; };
  return {
    found: true, cls: String(m.className || ''), w: Math.round(r.width),
    scrollW: body.scrollWidth, clientW: body.clientWidth,
    hOverflow: body.scrollWidth - body.clientWidth,
    vScroll: /auto|scroll/.test(bs.overflowY) || body.scrollHeight > body.clientHeight,
    clipped: clipped.slice(0, 6), headOk: hf(head), footOk: hf(foot),
    text: (m.innerText || '').slice(0, 60).replace(/\\n/g, ' ')
  };
})()`;


/* header action button ko poll kar ke click karo (screen data load hone ke baad aata hai) */
async function clickAction(page, btn, tries) {
  for (let i = 0; i < (tries || 10); i++) {
    const okc = await page.evaluate(b => {
      const re = new RegExp(b, 'i');
      const cands = Array.from(document.querySelectorAll('button')).filter(x => {
        const t = (x.textContent || '').trim(); return re.test(t) && t.length < 24;
      });
      const b2 = cands.find(x => x.offsetParent !== null);
      if (b2) { b2.click(); return b2.textContent.trim(); }
      return null;
    }, btn);
    if (okc) return okc;
    await sleep(400);
  }
  return null;
}

const CAM = `(() => {
  const m = [...document.querySelectorAll('.modal-scrim .modal2')].pop();
  if (!m) return { found: false };
  const r = m.getBoundingClientRect();
  const body = m.querySelector('.m-body') || m;
  const cols = Array.from(body.children).filter(c => {
    const cs = getComputedStyle(c);
    return cs.display === 'grid' || cs.display === 'flex';
  }).map(c => getComputedStyle(c).gridTemplateColumns);
  return {
    found: true, w: Math.round(r.width), vw: window.innerWidth,
    fits: r.width <= window.innerWidth + 0.5,
    hOverflow: body.scrollWidth - body.clientWidth,
    gridCols: cols.join(' | ')
  };
})()`;

const CASES = [
  { name: 'generic UI2.modal', open: `UI2.modal({ title: 'Sweep test', body: '<b>hi</b>', actions: [{ label: 'Do', cls: 'ok', onClick: c => c() }] })`, wait: 500 },
  { name: 'POS pay modal', steps: [
      { js: `App.go('pos')`, wait: 1500 },
      { js: `(function(){ var rows=App.state.catalog.items||[]; if(rows[0]&&window.POS2&&POS2.addToCart) POS2.addToCart(rows[0]); return rows.length; })()`, wait: 500 },
      { js: `POS2.pay('CASH')`, wait: 2000 }
    ] },
  { name: 'POS bulk add', open: `App.go('pos'); POS2.togglePicker()`, wait: 900 },
  { name: 'Alerts panel', open: `document.querySelector('#btnNotif').click()`, wait: 700 },
  { name: 'GRN modal', screen: 'purchase', btn: 'GRN$', wait: 1800 },
  { name: 'New PO modal', screen: 'purchase', btn: 'New PO', wait: 1800 },
  { name: 'New Item modal', screen: 'items', btn: '^New Item$', wait: 1400 },
  { name: 'New Demand modal', screen: 'demands', btn: '^New Demand$', wait: 1400 },
  { name: 'Adjustment modal', screen: 'inventory', btn: '^Adjustment$', wait: 1400 },
  { name: 'Transfer modal', screen: 'inventory', btn: '^Transfer$', wait: 1400 },
  { name: 'Receipt/invoice modal', open: `(function(){ try { var s=(App.state.catalog.items||[])[0]||{}; showInvoiceConfirmation && showInvoiceConfirmation({ invoiceNo:'AUD-1', total:1000, payments:[{method:'CASH',amount:1000}], items:[] }); } catch(e){ UI2.modal({title:'x',body:'y'}); } })()`, wait: 1200 }
];

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e && e.message).slice(0, 100)));
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle2', timeout: 45000 });
  if (await page.evaluate(() => !!document.querySelector('#lgUser'))) {
    await page.click('#lgUser'); await page.type('#lgUser', 'owner');
    await page.click('#lgPass'); await page.type('#lgPass', 'admin123');
    await page.keyboard.press('Enter');
  }
  await page.waitForFunction(() => window.App && App.state && App.state.session, { timeout: 20000 });
  await sleep(1400);
  await page.evaluate(() => { document.querySelectorAll('.modal-scrim .oc-x, .offcanvas .oc-x').forEach(x => { try { x.click(); } catch (e) { } }); });
  await sleep(400);

  const rows = [];
  for (const c of CASES) {
    await page.evaluate(() => { document.querySelectorAll('.modal-scrim .oc-x, .offcanvas .oc-x').forEach(x => { try { x.click(); } catch (e) { } }); });
    await sleep(250);
    try {
      if (c.screen) {
        await page.evaluate(s => App.go(s), c.screen);
        await sleep(1500);
        const clicked = await clickAction(page, c.btn, 12);
        if (!clicked) { rows.push({ name: c.name, err: 'button nahi mila' }); continue; }
      } else if (c.steps) {
        for (const st of c.steps) { await page.evaluate(new Function(st.js)); await sleep(st.wait || 800); }
      } else {
        await page.evaluate(new Function(c.open));
      }
      await sleep(c.wait || 1200);
      const d = await page.evaluate(MEASURE);
      rows.push(Object.assign({ name: c.name }, d));
    } catch (e) {
      rows.push({ name: c.name, err: String(e.message).slice(0, 70) });
    }
  }

  /* mobile pass — sirf 3 sab se bade modals */
  await page.setViewport({ width: 390, height: 844 });
  await sleep(500);
  const mobile = [];
  for (const c of [CASES[1], CASES[5], CASES[7]]) {
    await page.evaluate(() => { document.querySelectorAll('.modal-scrim .oc-x, .offcanvas .oc-x').forEach(x => { try { x.click(); } catch (e) { } }); });
    await sleep(300);
    try {
      if (c.screen) {
        await page.evaluate(s => App.go(s), c.screen); await sleep(1500);
        await clickAction(page, c.btn, 10);
      } else if (c.steps) {
        for (const st of c.steps) { await page.evaluate(new Function(st.js)); await sleep(st.wait || 800); }
      } else { await page.evaluate(new Function(c.open)); }
      await sleep(c.wait || 1300);
      mobile.push(Object.assign({ name: c.name }, await page.evaluate(CAM)));
    } catch (e) { mobile.push({ name: c.name, err: String(e.message).slice(0, 60) }); }
  }

  console.log('\n===== DESKTOP 1440 =====');
  console.log('modal'.padEnd(26) + 'width   hOverflow  vScroll  head  foot  clipped');
  let bad = 0, narrow = 0;
  rows.forEach(r => {
    if (r.err || !r.found) { console.log(String(r.name).padEnd(26) + (r.err || 'nahi khula')); return; }
    const isNarrow = r.w < 620;
    const isBad = r.hOverflow > 2 || r.clipped.length > 0 || r.footOk === false || isNarrow;
    if (isNarrow) narrow++;
    if (isBad) bad++;
    console.log(String(r.name).padEnd(26) + String(r.w).padEnd(8) + String(r.hOverflow).padEnd(11) +
      String(!!r.vScroll).padEnd(9) + String(r.headOk).padEnd(6) + String(r.footOk).padEnd(6) +
      (r.clipped.join(',') || '-') + (isNarrow ? '  ⚠NARROW' : '') + (r.hOverflow > 2 ? '  ⚠HSCROLL' : '') + (r.clipped.length ? '  ⚠CLIP' : ''));
  });
  console.log('\n===== MOBILE 390 =====');
  mobile.forEach(r => {
    console.log(String(r.name).padEnd(26) + (r.err ? r.err : ('w=' + r.w + '/' + r.vw + '  fits=' + r.fits + '  hOverflow=' + r.hOverflow + '  cols=' + r.gridCols)));
  });
  let mbad = 0;
  mobile.forEach(r => {
    if (r.err || !r.found) return;
    if (r.fits === false || r.hOverflow > 2) mbad++;
  });
  console.log('\npage errors: ' + errs.length + (errs.length ? ' :: ' + errs.slice(0, 3).join(' | ') : ''));
  console.log('SUMMARY: ' + rows.length + ' cases · narrow(<620px): ' + narrow + ' · desktop issues: ' + bad + ' · mobile issues: ' + mbad);
  await browser.close();
  process.exit(ASSERT && (bad || mbad || errs.length) ? 1 : 0);
})();
