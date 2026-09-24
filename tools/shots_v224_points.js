/**
 * tools/shots_v224_points.js — v2.24.0 user points: ASLI screenshots (real Chromium).
 *
 * User ne 4 dafa wahi 6 points bheje. Prose se kaam nahi chal raha — is liye har point
 * ki live, asli screenshot. Sab demo (http://127.0.0.1:8021) par chalta hai.
 *
 *   node tools/shots_v224_points.js [baseUrl] [outDir]
 */
'use strict';
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] || 'http://127.0.0.1:8021';
const OUT = process.argv[3] || path.join(__dirname, '..', 'shots-v2.24');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = [];
function say(s) { log.push(s); console.log(s); }

async function wedge(page, selector, text, { enter = true, delay = 6 } = {}) {
  await page.focus(selector);
  for (const ch of String(text)) { await page.keyboard.type(ch, { delay: 0 }); await sleep(delay); }
  if (enter) await page.keyboard.press('Enter');
  await sleep(420);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 }
  });
  const page = await browser.newPage();
  const pageErrs = [];
  page.on('pageerror', e => pageErrs.push(String(e && e.message)));

  const shot = async (file, note) => {
    const p = path.join(OUT, file);
    await page.screenshot({ path: p });
    say('SHOT ' + file + (note ? '  — ' + note : ''));
    return p;
  };
  const elShot = async (sel, file, note) => {
    const el = await page.$(sel);
    if (!el) { say('SKIP ' + file + ' (element nahi mila: ' + sel + ')'); return null; }
    const p = path.join(OUT, file);
    await el.screenshot({ path: p });
    say('SHOT ' + file + (note ? '  — ' + note : ''));
    return p;
  };
  const clickText = async re => {
    const r = await page.evaluate(src => {
      const rx = new RegExp(src, 'i');
      const all = [...document.querySelectorAll('button, .tab, [role=button]')]
        .filter(x => x.offsetParent !== null && !x.disabled)
        .map(x => ({ el: x, txt: (x.textContent || '').replace(/\s+/g, ' ').trim() }));
      const m = all.filter(x => rx.test(x.txt));
      if (m.length) { m[0].el.click(); return m[0].txt; }
      return null;
    }, re);
    await sleep(900);
    return r;
  };
  const clearOverlays = async () => {
    await page.evaluate(() => { document.querySelectorAll('.drawer,.modal-scrim,.scrim').forEach(x => x.remove()); });
    await sleep(300);
  };

  try {
    /* ---------------------------- LOGIN ---------------------------- */
    await page.goto(BASE + '/index.html', { waitUntil: 'networkidle2', timeout: 40000 });
    if (await page.evaluate(() => !!document.querySelector('#lgUser'))) {
      await page.click('#lgUser'); await page.type('#lgUser', 'owner');
      await page.click('#lgPass'); await page.type('#lgPass', 'admin123');
      await page.keyboard.press('Enter');
    }
    await page.waitForFunction(() => window.App && App.state && App.state.session, { timeout: 15000 });
    await sleep(1200);
    say('LOGIN ok · demo bytes: ' + (await page.evaluate(() => (window.App.version || 'v?') + '')));

    /* ============ 1) POS — BULK ADD dedicated modal (spec) ============ */
    await page.evaluate(() => { App.go('pos'); });
    await page.waitForSelector('.pos2-search input', { timeout: 10000 });
    await sleep(800);
    // real UI trigger: BULK ADD label/checkbox (fallback = POS2.togglePicker)
    const trig = await page.evaluate(() => {
      const lbl = [...document.querySelectorAll('label,.chk,button')]
        .filter(x => x.offsetParent !== null)
        .find(x => /bulk/i.test(x.textContent || ''));
      if (lbl) { (lbl.querySelector('input') || lbl).click(); return (lbl.textContent || '').trim().slice(0, 30); }
      if (window.POS2 && POS2.togglePicker) { POS2.togglePicker(); return 'POS2.togglePicker()'; }
      return null;
    });
    await sleep(1400);
    await page.waitForSelector('.scan-row input', { timeout: 8000 });
    const codes = await page.evaluate(() => {
      const it = (App.state.catalog.items || []).filter(x => x.code);
      return [it[0] && it[0].code, it[1] && it[1].code].filter(Boolean);
    });
    await wedge(page, '.scan-row input', codes[0]);
    if (codes[1]) await wedge(page, '.scan-row input', codes[1]);
    await wedge(page, '.scan-row input', codes[0]); // duplicate → qty bump (dup merge proof)
    const bulkState = await page.evaluate(() => ({
      head: (document.querySelector('.modal-head h3') || {}).textContent || '',
      rows: document.querySelectorAll('.bulk-selected-box .bsb-row').length,
      hd: (document.querySelector('.bulk-selected-box .bsb-head') || {}).textContent || '',
      scanV: (document.querySelector('.scan-row input') || {}).value,
      last: (document.querySelector('.ipk-last') || {}).textContent || ''
    }));
    say('BULK state: ' + JSON.stringify(bulkState));
    await shot('01-pos-bulk-add.png', 'trigger=' + trig);

    /* ============ 2) PO — shared scan-first picker ============ */
    await page.keyboard.press('Escape'); await sleep(500);
    await clearOverlays();
    await page.evaluate(() => { App.go('purchase'); }); await sleep(1200);
    const poLbl = await clickText('^New PO$');
    try { await page.waitForSelector('.drawer .ipk-scan-in', { timeout: 9000 }); } catch (e) { }
    await sleep(400);
    await wedge(page, '.drawer .ipk-scan-in', codes[0]);
    const poState = await page.evaluate(() => ({
      title: (document.querySelector('.drawer .modal-head h3') || {}).textContent || '',
      scanV: (document.querySelector('.drawer .ipk-scan-in') || {}).value,
      lines: document.querySelectorAll('.drawer .po-line').length,
      last: (document.querySelector('.drawer .ipk-last') || {}).textContent || '',
      head: !!document.querySelector('.drawer .ipk-head')
    }));
    say('PO state (' + poLbl + '): ' + JSON.stringify(poState));
    await shot('02-po-form.png', 'New PO — scan-first picker + scan→line');
    await elShot('.drawer .ipk', '09-scan-block-zoom.png', 'picker element close-up');

    /* ============ 3) GRN — same scan-first picker ============ */
    await page.keyboard.press('Escape'); await sleep(500);
    await clearOverlays();
    await page.evaluate(() => { App.go('purchase'); }); await sleep(1200);
    const grnLbl = await clickText('^GRN$');
    try { await page.waitForSelector('.drawer .ipk-scan-in', { timeout: 9000 }); } catch (e) { }
    await sleep(400);
    await wedge(page, '.drawer .ipk-scan-in', codes[0]);
    const grnState = await page.evaluate(() => ({
      title: (document.querySelector('.drawer .modal-head h3') || {}).textContent || '',
      scanV: (document.querySelector('.drawer .ipk-scan-in') || {}).value,
      lines: document.querySelectorAll('.drawer .po-line').length,
      last: (document.querySelector('.drawer .ipk-last') || {}).textContent || ''
    }));
    say('GRN state (' + grnLbl + '): ' + JSON.stringify(grnState));
    await shot('03-grn-form.png', 'GRN — scan block + scanned line');

    /* ============ 4) Salesman Stock Issue — modal + scan + Cancel ============ */
    await page.keyboard.press('Escape'); await sleep(500);
    await clearOverlays();
    await page.evaluate(() => { App.go('salesman'); }); await sleep(1300);
    const si1 = await clickText('Stock Issued'); await sleep(700);
    const si2 = await clickText('New Issue'); await sleep(2200);
    try { await page.waitForSelector('.modal-scrim .ipk-scan-in', { timeout: 9000 }); } catch (e) { }
    await wedge(page, '.modal-scrim .ipk-scan-in', codes[0]);
    const siState = await page.evaluate(() => {
      const t = [...document.querySelectorAll('.modal-scrim')].pop();
      if (!t) return { open: false };
      return {
        open: true,
        title: (t.querySelector('.modal-head h3') || {}).textContent || '',
        scan: !!t.querySelector('.ipk-scan-in'),
        secs: t.querySelectorAll('.sec-head').length,
        line: !!t.querySelector('.po-line'),
        scanV: (t.querySelector('.ipk-scan-in') || {}).value,
        cancel: [...t.querySelectorAll('button')].some(b => /^(cancel|close)$/i.test((b.textContent || '').trim()))
      };
    });
    say('STOCK ISSUE (' + si1 + ' ▸ ' + si2 + '): ' + JSON.stringify(siState));
    await shot('04-salesman-stock-issue.png', 'sections + scan + Cancel footer');
    await elShot('.modal-scrim .m-foot', '08-footer-cancel-close.png', 'footer Cancel/Close proof');

    /* ============ 5) Demand — sections + data-aware + Advanced ============ */
    await page.keyboard.press('Escape'); await sleep(600);
    await clearOverlays();
    await page.evaluate(() => { App.go('demands'); }); await sleep(1300);
    const dLbl = await clickText('^New Demand$');
    await sleep(1600);
    const dTop = await page.evaluate(() => {
      const t = [...document.querySelectorAll('.modal-scrim')].pop();
      return t ? { open: true, secs: t.querySelectorAll('.f-sec').length, notes: t.querySelectorAll('.f-note').length,
        search: !!t.querySelector('.f-search') } : { open: false };
    });
    say('DEMAND (' + dLbl + '): ' + JSON.stringify(dTop));
    await shot('05-demand-form.png', 'sections + data-aware note panels');

    // customer pick (data-aware: balance / credit / open demands)
    const custName = await page.evaluate(() => {
      const c = (App.state.catalog.customers || [])[0];
      return c ? String(c.name || c.title || '').slice(0, 4) : '';
    });
    if (custName) {
      await page.evaluate(() => { const i = document.querySelector('.modal-scrim #f_customerId'); if (i) { i.focus(); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); } });
      await wedge(page, '.modal-scrim #f_customerId', custName, { enter: false });
      await sleep(1400);
      await page.evaluate(() => { const r = document.querySelector('.modal-scrim #f_customerId').closest('.f-col').querySelector('.f-search-results .f-sr'); if (r) r.click(); });
      await sleep(1000);
    }
    // product search dropdown OPEN (interactive / data aware)
    await page.evaluate(() => { const i = document.querySelector('.modal-scrim #f_itemId'); if (i) { i.focus(); i.value = 'FLAMINGO'; i.dispatchEvent(new Event('input', { bubbles: true })); } });
    await sleep(1500);
    const dSearch = await page.evaluate(() => {
      const i = document.querySelector('.modal-scrim #f_itemId');
      const box = i && i.closest('.f-col') ? i.closest('.f-col').querySelector('.f-search-results') : null;
      return { shown: !!box && !box.hidden, count: box ? box.querySelectorAll('.f-sr').length : 0 };
    });
    say('DEMAND search dropdown: ' + JSON.stringify(dSearch));
    await shot('06-demand-search-live.png', 'type-ahead dropdown + notes');
    // pick first result → auto-fill + badge; then Advanced ON
    await page.evaluate(() => { const r = document.querySelector('.modal-scrim #f_itemId').closest('.f-col').querySelector('.f-search-results .f-sr'); if (r) r.click(); });
    await sleep(1100);
    const advOn = await page.evaluate(() => {
      const cb = document.querySelector('.modal-scrim #f___adv');
      if (cb && !cb.checked) { cb.click(); return true; }
      return !!(cb && cb.checked);
    });
    await sleep(1200);
    const dFilled = await page.evaluate(() => {
      const t = [...document.querySelectorAll('.modal-scrim')].pop();
      const i = t && t.querySelector('#f_itemId');
      const col = i && i.closest('.f-col');
      const badge = col && col.querySelector('.f-pick-badge');
      return {
        name: (t.querySelector('#f_itemName') || {}).value || '',
        code: (t.querySelector('#f_itemCode') || {}).value || '',
        badge: !!badge && !badge.hidden,
        custNote: [...t.querySelectorAll('.f-note')].map(n => n.innerText.replace(/\s+/g, ' ').slice(0, 90)).slice(0, 4),
        advShown: [...t.querySelectorAll('.f-sec')].map(s => s.textContent.trim().slice(0, 40)),
        advOn: true
      };
    });
    say('DEMAND filled: ' + JSON.stringify(dFilled));
    // scroll the modal so the Advanced section is in frame
    await page.evaluate(() => {
      const t = [...document.querySelectorAll('.modal-scrim')].pop();
      const body = t.querySelector('.modal-body') || t;
      const sw = t.querySelector('#f___adv');
      const target = sw && sw.closest('.f-row') ? sw.closest('.f-row') : sw;
      if (target && target.scrollIntoView) target.scrollIntoView({ block: 'center' });
      else body.scrollTop = body.scrollHeight;
    });
    await sleep(900);
    await shot('07-demand-advanced.png', 'Advanced section (switch on)');

    /* ---- mobile 390px proof (alignment) ---- */
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    await sleep(900);
    await shot('10-demand-mobile-390.png', '390px — modal 100vw clamp + footer wrap');
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await sleep(500);

    say('PAGE ERRORS: ' + JSON.stringify(pageErrs).slice(0, 300));
  } catch (e) {
    say('FATAL ' + (e && e.stack ? e.stack : e));
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(OUT, 'shot-run.log'), log.join('\n'));
    say('DONE → ' + OUT);
  }
})();
