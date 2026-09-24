/**
 * tools/test_browser_scan.js — REAL Chrome verification of scan & bulk flows (v2.23.19).
 *
 * Why this exists: jsdom doesn't run focus/IME/keyboard-wedge timing faithfully, and
 * the user's bug reports were real-browser only. This drives actual Chromium with real
 * key events against the built demo (serve: `python3 -m http.server 8011 -d demo`).
 *
 *   node tools/test_browser_scan.js [baseUrl]
 *
 * Covers: POS continuous scan (add→clear→merge, invalid clears, EAN-13 merges into its
 * product), Bulk Add modal (scan into dedicated field, qty bump, commit to cart),
 * Take Order scan, Alerts & notifications panel, PWA POS screen (scan + zero page errors).
 * Demo-data note: item FL00000's barcode IS 6959375198888, so an EAN scan legitimately
 * merges into the same cart row.
 */
'use strict';
const puppeteer = require('puppeteer');
const path = require('path');
const BASE = process.argv[2] || 'http://127.0.0.1:8011';
let pass = 0, fail = 0; const errs = [];
function ok(cond, name, extra) { if (cond) { pass++; console.log('✔', name); } else { fail++; const m = '✘ ' + name + (extra ? ' — ' + extra : ''); errs.push(m); console.log(m); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function wedge(page, selector, text, { enter = true, delay = 8 } = {}) {
  await page.focus(selector);
  for (const ch of String(text)) { await page.keyboard.type(ch, { delay: 0 }); await sleep(delay); }
  if (enter) await page.keyboard.press('Enter');
  await sleep(380);
}
const posState = page => page.evaluate(() => ({
  v: (document.querySelector('.pos2-search input') || {}).value,
  cart: JSON.parse(JSON.stringify((window.POS2 && POS2.S.cart) || []))
}));

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--allow-running-insecure-content'],
  });
  try {
    /* ============================ MAIN APP ============================ */
    const page = await browser.newPage();
    const pageErrs = [];
    page.on('pageerror', e => pageErrs.push(String(e && e.message)));
    await page.goto(BASE + '/index.html', { waitUntil: 'networkidle2', timeout: 40000 });
    if (await page.evaluate(() => !!document.querySelector('#lgUser'))) {
      await page.click('#lgUser'); await page.type('#lgUser', 'owner');
      await page.click('#lgPass'); await page.type('#lgPass', 'admin123');
      await page.keyboard.press('Enter');
    }
    await page.waitForFunction(() => window.App && App.state && App.state.session, { timeout: 15000 });
    await sleep(900);
    await page.evaluate(() => { App.go('pos'); });
    await page.waitForSelector('.pos2-search input', { timeout: 8000 });
    await sleep(600);

    // 1) scan adds + clears (keyboard-wedge timing, real Enter)
    await wedge(page, '.pos2-search input', 'FL00000');
    let st = await posState(page);
    ok(st.v === '', 'browser POS: field cleared after scan (real keys)', JSON.stringify(st.v));
    ok(st.cart.length === 1 && st.cart[0].code === 'FL00000' && st.cart[0].name.includes('FLAMINGO'),
      'browser POS: correct product added', JSON.stringify(st.cart));

    // 2) rescan merges qty
    await wedge(page, '.pos2-search input', 'FL00000');
    st = await posState(page);
    ok(st.v === '' && st.cart.length === 1 && Number(st.cart[0].qty) === 2, 'browser POS: rescan merges qty=2, field clear', JSON.stringify(st.cart));

    // 3) EAN-13 scan — FL00000's own barcode → merges (no phantom row, no residue)
    await wedge(page, '.pos2-search input', '6959375198888');
    st = await posState(page);
    ok(st.v === '' && st.cart.length === 1 && Number(st.cart[0].qty) === 3, 'browser POS: EAN merges into its product, field clear', JSON.stringify(st.cart));

    // 4) invalid code: clears, no append, no phantom row
    await wedge(page, '.pos2-search input', 'ZZZ9999');
    st = await posState(page);
    ok(st.v === '' && st.cart.length === 1 && Number(st.cart[0].qty) === 3, 'browser POS: invalid code clears without corrupting state', JSON.stringify(st));

    // 5) back-to-back wedge after invalid must still work
    await wedge(page, '.pos2-search input', 'FL00000');
    st = await posState(page);
    ok(st.cart.length === 1 && Number(st.cart[0].qty) === 4 && st.v === '', 'browser POS: back-to-back scans merge correctly (qty=4)', JSON.stringify(st.cart));

    /* ----------------------- Bulk Add modal ----------------------- */
    await page.evaluate(() => window.POS2.togglePicker());
    await page.waitForSelector('.scan-row input', { timeout: 6000 });
    await sleep(250);
    await wedge(page, '.scan-row input', 'FL00000');
    let bulk = await page.evaluate(() => ({ v: document.querySelector('.scan-row input').value,
      rows: document.querySelectorAll('.bulk-selected-box input[type=number]').length }));
    ok(bulk.v === '' && bulk.rows === 1, 'browser Bulk: scan adds list row + clears input', JSON.stringify(bulk));
    await wedge(page, '.scan-row input', 'FL00000');
    bulk = await page.evaluate(() => ({ v: document.querySelector('.scan-row input').value,
      rows: document.querySelectorAll('.bulk-selected-box input[type=number]').length,
      qty: (document.querySelector('.bulk-selected-box input[type=number]') || {}).value }));
    ok(bulk.v === '' && bulk.rows === 1 && Number(bulk.qty) === 2, 'browser Bulk: duplicate scan bumps qty=2, clears', JSON.stringify(bulk));
    await page.keyboard.press('Tab'); // close any dropdown
    await page.evaluate(() => { const b = document.querySelector('.po-addbar .btn.ok'); if (b) { b.disabled = false; b.click(); } });
    await sleep(600);
    st = await page.evaluate(() => ({ cart: JSON.parse(JSON.stringify(window.POS2.S.cart || [])), scrim: document.querySelectorAll('.modal-scrim').length }));
    ok(st.cart.length === 1 && Number(st.cart[0].qty) === 6 && st.scrim === 0, 'browser Bulk: commit adds to cart & closes modal', JSON.stringify(st));

    /* ----------------------- Take Order scan ----------------------- */
    await page.evaluate(() => { App.go('takeorder'); });
    await sleep(900);
    const toInput = await page.evaluate(() => {
      const inp = [...document.querySelectorAll('input[type=text],input[type=search]')]
        .filter(i => i.offsetParent !== null)
        .find(i => /dhoondain|scan/i.test(i.getAttribute('placeholder') || ''));
      if (inp) inp.id = inp.id || 'toScanProbe';
      return inp ? inp.id : null;
    });
    ok(!!toInput, 'browser TakeOrder: scan field present', String(toInput));
    if (toInput) {
      await wedge(page, '#' + toInput, 'FL00000');
      const after = await page.evaluate(id => ({ v: document.getElementById(id).value }), toInput);
      ok(after.v === '', 'browser TakeOrder: Enter scan clears field (real keys)', JSON.stringify(after));
    }

    /* ----------------------- Alerts & notifications panel ----------------------- */
    await page.evaluate(() => document.querySelector('#btnNotif').click());
    await sleep(900);
    const notif = await page.evaluate(() => {
      const m = [...document.querySelectorAll('.modal2, .modal')].find(x => /Alerts/i.test(x.textContent));
      if (!m) return { found: false };
      return { found: true, head: !!m.querySelector('.notif-head'), chips: m.querySelectorAll('.chip2').length,
        rows: m.querySelectorAll('.notif-row').length, empty: /All clear|koi alert nahi/i.test(m.textContent) };
    });
    ok(notif.found, 'browser Alerts: panel opens from bell', JSON.stringify(notif));
    ok(notif.found && (notif.head || notif.empty), 'browser Alerts: renders head/empty state', JSON.stringify(notif));
    ok(notif.chips >= 3, 'browser Alerts: filter chips present', JSON.stringify(notif));
    if (notif.found) {
      const filtered = await page.evaluate(() => {
        const m = [...document.querySelectorAll('.modal2')].find(x => /Alerts/i.test(x.textContent));
        const chip = m && [...m.querySelectorAll('.chip2')].find(c => /Critical/.test(c.textContent));
        if (chip) chip.click();
        return !!chip;
      });
      await sleep(300);
      const still = await page.evaluate(() => {
        const m = [...document.querySelectorAll('.modal2')].find(x => /Alerts/i.test(x.textContent));
        return !!m && /All clear|koi alert nahi|Is filter/i.test(m.textContent);
      });
      ok(filtered && still, 'browser Alerts: Critical filter repaints (empty filter message)', String(filtered));
    }

    ok(pageErrs.length === 0, 'browser main: zero uncaught page errors', JSON.stringify(pageErrs).slice(0, 300));

    /* ----------------------- Label print flow (v2.23.20) ----------------------- */
    const lp = await page.evaluate(async () => {
      const it = App.state.catalog.items.find(i => i.code === 'FL00000') || App.state.catalog.items[0];
      window.__printLabels([it.id]);
      await new Promise(r => setTimeout(r, 900));
      const m = [...document.querySelectorAll('.modal2')].find(x => /Print labels/.test(x.textContent));
      if (!m) return { modal: false };
      const chips = [...m.querySelectorAll('.chip2')];
      chips[Math.min(3, chips.length - 1)].click();  // switch to 'inventory' preset
      await new Promise(r => setTimeout(r, 700));
      const prev = m.querySelector('.lbl-preview');
      const lbc = prev && prev.querySelector('.lbc');
      return {
        modal: true, chips: chips.length,
        labels: prev ? prev.querySelectorAll('.label').length : 0,
        svg: !!(prev && prev.querySelector('.label svg')),
        bars: prev ? prev.querySelectorAll('.label svg rect').length : 0,
        hr: prev && prev.querySelector('.lhr') ? prev.querySelector('.lhr').textContent.trim() : '',
        padPx: lbc ? parseFloat(getComputedStyle(lbc).paddingLeft) : -1,
        name: prev && prev.querySelector('.lname') ? prev.querySelector('.lname').textContent : ''
      };
    });
    ok(lp.modal && lp.chips === 6, 'browser Labels: modal opens with 6 GS1 templates', JSON.stringify(lp).slice(0, 160));
    ok(lp.labels >= 1 && lp.svg && lp.bars > 20, 'browser Labels: preview renders label with barcode symbol', JSON.stringify({ labels: lp.labels, bars: lp.bars }));
    ok(/(FL00000|6959\d{9})/.test(lp.hr), 'browser Labels: human-readable line under symbol (GS1)', lp.hr);
    ok(lp.padPx >= 4, 'browser Labels: quiet-zone padding present on symbol box', String(lp.padPx));

    // print sheet -> popup window; count tiles + no errors there
    const br = page.browser();
    const pgT = () => br.targets().filter(t => t.type() === 'page');
    const before = pgT().length;
    const clicked = await page.evaluate(() => {
      const m = [...document.querySelectorAll('.modal2')].find(x => /Print labels/.test(x.textContent));
      const b = m && [...m.querySelectorAll('button')].find(x => /Print sheet/.test(x.textContent));
      if (b) { b.click(); return true; } return false;
    });
    ok(clicked, 'browser Labels: Print sheet button works', String(clicked));
    let pop = null;
    for (let i = 0; i < 24 && !pop; i++) {
      await sleep(250);
      const all = pgT();
      if (all.length > before) pop = await all[all.length - 1].asPage();
    }
    if (pop) {
      await sleep(700);
      const pr = await pop.evaluate(() => ({
        labels: document.querySelectorAll('.label').length,
        svg: !!document.querySelector('.label svg'),
        hr: !!document.querySelector('.lhr'),
        white: getComputedStyle(document.querySelector('.label')).backgroundColor
      }));
      ok(pr.labels >= 1 && pr.svg && pr.hr, 'browser Labels: A4 popup contains label tiles + bars + HR text', JSON.stringify(pr));
      await pop.screenshot({ path: '/tmp/label_sheet_probe.png' });
      await pop.close();
    } else {
      ok(false, 'browser Labels: print popup opened', 'no popup target');
    }

    /* ----------------------- F-shortcuts (F2 focus) ----------------------- */
    await page.evaluate(() => { App.go('pos'); });
    await sleep(700);
    await page.evaluate(() => { document.activeElement && document.activeElement.blur(); });
    await sleep(150);
    await page.keyboard.press('F2');
    await sleep(250);
    const foc = await page.evaluate(() => {
      const a = document.activeElement;
      return { cls: a ? a.className : '', inSearch: !!(a && a.closest && a.closest('.pos2-search')) };
    });
    ok(foc.inSearch, 'browser F2: focuses POS scan/search field (real key press)', JSON.stringify(foc));

    /* ══════════ v2.24.0 — SCAN PARITY: GRN / Stock Issue / Take Order / Demand ══════════
       User ki shikayat: "POS ke ilawa baqi pages/modals mein wahi barcode log nahi".
       Ye block un har page ko real Chrome mein scan kara ke sabit karta hai. */
    const clickText = async (pg, re) => {
      const r = await pg.evaluate(src => {
        const rx = new RegExp(src, 'i');
        const all = [...document.querySelectorAll('button, .tab, [role=button]')]
          .filter(x => x.offsetParent !== null && !x.disabled)
          .map(x => ({ el: x, txt: (x.textContent || '').replace(/\s+/g, ' ').trim() }));
        const matches = all.filter(x => rx.test(x.txt));
        if (matches.length) { matches[0].el.click(); return { picked: matches[0].txt, matches: matches.map(m => m.txt) }; }
        return { picked: null, matches: [], visible: all.map(x => x.txt.slice(0, 16)).slice(0, 20) };
      }, re);
      console.log('  · click(/' + re + '/) → ' + JSON.stringify(r));
      return r.picked;
    };
    const topOverlayText = pg => pg.evaluate(() => {
      const l = [...document.querySelectorAll('.drawer, .modal-scrim, .offcanvas')];
      const t = l[l.length - 1];
      return t ? t.innerText : '';
    });

    /* ---- GRN (Purchase ▸ GRN — drawer) ---- */
    await page.evaluate(() => { App.go('purchase'); });
    await sleep(1000);
    await page.evaluate(() => { document.querySelectorAll('.drawer,.modal-scrim,.scrim').forEach(x => x.remove()); });
    const grnLbl = await clickText(page, '^GRN$');
    await sleep(1500);
    let gState = await page.evaluate(() => ({
      drawer: !!document.querySelector('.drawer'),
      scan: !!document.querySelector('.drawer .ipk-scan-in'),
      head: !!document.querySelector('.drawer .ipk-head'),
      title: ((document.querySelector('.drawer .modal-head h3') || {}).textContent || '')
    }));
    ok(/goods receipt/i.test(grnLbl + ' ' + gState.title), 'browser GRN: drawer khula', JSON.stringify(gState));
    ok(gState.head && gState.scan, 'browser GRN: naya scan-first picker block maujood', JSON.stringify(gState));
    if (gState.scan) {
      await wedge(page, '.drawer .ipk-scan-in', 'FL00000');
      const r1 = await page.evaluate(() => ({
        v: (document.querySelector('.drawer .ipk-scan-in') || {}).value,
        txt: (document.querySelector('.drawer') || {}).innerText || ''
      }));
      ok(r1.v === '', 'browser GRN: scan ke baad field CLEAR (next scan ready)', JSON.stringify(r1.v));
      ok(/FLAMINGO/i.test(r1.txt), 'browser GRN: scanned product seedha GRN line mein add hua');
      await wedge(page, '.drawer .ipk-scan-in', '0000000000000');
      const r2 = await page.evaluate(() => ({
        v: (document.querySelector('.drawer .ipk-scan-in') || {}).value,
        txt: (document.querySelector('.drawer') || {}).innerText || ''
      }));
      ok(r2.v === '' && /nahi mila/i.test(r2.txt), 'browser GRN: invalid code → clear + warning (order kharab nahi hota)', JSON.stringify(r2.v));
      /* qty merge: wahi scan dobara → nayi line nahi */
      const before = await page.evaluate(() => document.querySelectorAll('.drawer .po-line').length);
      await wedge(page, '.drawer .ipk-scan-in', 'FL00000');
      const after = await page.evaluate(() => document.querySelectorAll('.drawer .po-line').length);
      ok(after === before && before > 0, 'browser GRN: duplicate scan qty merge karta hai (nayi line nahi)', before + ' → ' + after);
    }
    await page.keyboard.press('Escape');
    await sleep(600);
    ok(!(await page.evaluate(() => !!document.querySelector('.drawer'))), 'browser GRN: Esc se drawer band');

    /* ---- PO form (v2.24.0: custom search → shared scan picker) ---- */
    await page.evaluate(() => { document.querySelectorAll('.drawer,.modal-scrim,.scrim').forEach(x => x.remove()); App.go('purchase'); });
    await sleep(1100);
    const poLbl = await clickText(page, '^New PO$');
    await sleep(1800);
    const po = await page.evaluate(() => ({
      drawer: !!document.querySelector('.drawer'),
      title: ((document.querySelector('.drawer .modal-head h3') || {}).textContent || ''),
      scan: !!document.querySelector('.drawer .ipk-scan-in'),
      head: !!document.querySelector('.drawer .ipk-head')
    }));
    ok(/new purchase order/i.test(po.title), 'browser PO: form khula — title "' + po.title + '" ("' + poLbl + '")');
    ok(po.head && po.scan, 'browser PO: shared scan-first picker (pehle custom search tha)', JSON.stringify(po));
    if (po.scan) {
      await wedge(page, '.drawer .ipk-scan-in', 'FL00000');
      const rp = await page.evaluate(() => ({
        v: (document.querySelector('.drawer .ipk-scan-in') || {}).value,
        lines: document.querySelectorAll('.drawer .po-line').length,
        last: (document.querySelector('.drawer .ipk-last') || {}).textContent || ''
      }));
      ok(rp.v === '' && rp.lines > 0, 'browser PO: scan → PO line + field clear', JSON.stringify(rp));
      await wedge(page, '.drawer .ipk-scan-in', '0000000000000');
      const rp2 = await page.evaluate(() => ({
        v: (document.querySelector('.drawer .ipk-scan-in') || {}).value,
        lines: document.querySelectorAll('.drawer .po-line').length
      }));
      ok(rp2.v === '' && rp2.lines === rp.lines, 'browser PO: invalid code → clear, PO lines safeena', JSON.stringify(rp2));
    }
    await page.keyboard.press('Escape'); await sleep(500);

    /* ---- Stock Issue (Salesman ▸ Stock Issued ▸ ＋ New Issue) ---- */
    await page.evaluate(() => { App.go('salesman'); });
    await sleep(1200);
    await clickText(page, 'Stock Issued');
    await sleep(1200);
    const siLbl = await clickText(page, 'New Issue');
    await sleep(2200);
    const si = await page.evaluate(() => {
      const l = [...document.querySelectorAll('.modal-scrim, .drawer')]; const t = l[l.length - 1];
      return { open: !!t, scan: !!(t && t.querySelector('.ipk-scan-in')), secs: t ? t.querySelectorAll('.sec-head').length : 0,
        cancel: t ? [...t.querySelectorAll('button')].some(b => /^(cancel|close)$/i.test((b.textContent || '').trim())) : false };
    });
    ok(si.open && si.scan, 'browser Stock Issue: modal khula + scan block maujood ("' + siLbl + '")', JSON.stringify(si));
    ok(si.secs >= 2, 'browser Stock Issue: sections (Issue details / Items) render hue', String(si.secs));
    ok(si.cancel, 'browser Stock Issue: Cancel button maujood');
    if (si.scan) {
      await wedge(page, '.modal-scrim .ipk-scan-in', 'FL00000');
      const r3 = await page.evaluate(() => ({
        v: (document.querySelector('.modal-scrim .ipk-scan-in') || {}).value,
        line: !!document.querySelector('.modal-scrim .po-line')
      }));
      ok(r3.v === '' && r3.line, 'browser Stock Issue: scan → line add + field clear', JSON.stringify(r3));
    }
    await page.keyboard.press('Escape'); await sleep(600);

    /* ---- Take Order screen (bulk modal) ---- */
    await page.evaluate(() => { App.go('takeorder'); });
    await sleep(1500);
    const toOk = await page.evaluate(() => ({ screen: App.current, hasBulk: [...document.querySelectorAll('button')].some(b => /Bulk/i.test(b.textContent || '')) }));
    ok(toOk.screen === 'takeorder', 'browser Take Order: screen load hui (#/takeorder)');
    ok(toOk.hasBulk, 'browser Take Order: Bulk button maujood');
    const toBulk = await clickText(page, 'Bulk');
    await sleep(1200);
    const to = await page.evaluate(() => {
      const l = [...document.querySelectorAll('.modal-scrim')]; const t = l[l.length - 1];
      return { open: !!t, scan: !!(t && t.querySelector('.ipk-scan-in')), txt: t ? t.innerText : '' };
    });
    ok(to.open && to.scan, 'browser Take Order: Bulk Add modal + dedicated scan field ("' + toBulk + '")', JSON.stringify({ open: to.open, scan: to.scan }));
    if (to.scan) {
      await wedge(page, '.modal-scrim .ipk-scan-in', 'FL00001');
      const r4 = await page.evaluate(() => {
        const t = [...document.querySelectorAll('.modal-scrim')].pop();
        return { v: (t.querySelector('.ipk-scan-in') || {}).value, txt: t.innerText };
      });
      ok(r4.v === '' && /Bulk List/i.test(r4.txt), 'browser Take Order: scan → Bulk List + field clear', JSON.stringify(r4.v));
    }
    await page.keyboard.press('Escape'); await sleep(600);

    /* ---- Demand form: asli search field (pehle plain text box tha) ---- */
    await page.evaluate(() => { App.go('demands'); });
    await sleep(1200);
    await clickText(page, '^New Demand$');
    await sleep(1500);
    const dm = await page.evaluate(() => {
      const t = [...document.querySelectorAll('.modal-scrim')].pop();
      return { open: !!t, secs: t ? t.querySelectorAll('.f-sec').length : 0,
        search: !!(t && t.querySelector('.f-search')),
        notes: t ? (t.querySelectorAll('.f-note').length) : 0 };
    });
    ok(dm.open && dm.search, 'browser Demand: modal + asli async search field', JSON.stringify(dm));
    ok(dm.secs >= 3, 'browser Demand: section cards (Customer / Product / Details / Advanced)', String(dm.secs));
    ok(dm.notes >= 2, 'browser Demand: data-aware note panels', String(dm.notes));
    if (dm.search) {
      await page.evaluate(() => { const i = document.querySelector('.modal-scrim #f_itemId'); if (i) { i.focus(); i.value = 'FLAMINGO'; i.dispatchEvent(new Event('input', { bubbles: true })); } });
      await sleep(1500);
      const res = await page.evaluate(() => {
        const i = document.querySelector('.modal-scrim #f_itemId');
        const box = i && i.closest('.f-col') ? i.closest('.f-col').querySelector('.f-search-results') : null;
        return { shown: !!box && !box.hidden, count: box ? box.querySelectorAll('.f-sr').length : 0,
          first: box && box.querySelector('.f-sr') ? box.querySelector('.f-sr').innerText.slice(0, 40) : '' };
      });
      ok(res.shown && res.count > 0, 'browser Demand: product search dropdown results aaye', JSON.stringify(res));
      await page.evaluate(() => {
        const i = document.querySelector('.modal-scrim #f_itemId');
        const r = i && i.closest('.f-col').querySelector('.f-search-results .f-sr');
        if (r) r.click();
      });
      await sleep(800);
      const filled = await page.evaluate(() => {
        const t = [...document.querySelectorAll('.modal-scrim')].pop();
        const i = t.querySelector('#f_itemId');
        const col = i.closest('.f-col');
        const badge = col.querySelector('.f-pick-badge');
        return {
          name: (t.querySelector('#f_itemName') || {}).value || '',
          code: (t.querySelector('#f_itemCode') || {}).value || '',
          badge: !!badge && !badge.hidden,
          picked: i.dataset.value || ''
        };
      });
      ok(/flamingo/i.test(filled.name) && filled.badge && !!filled.picked,
        'browser Demand: pick karne par itemName/itemCode auto-fill + pick badge', JSON.stringify(filled));
    }
    /* Esc #1 → khuli hui list band (agar ho), Esc #2 → modal band (standard UX) */
    await page.keyboard.press('Escape'); await sleep(450);
    if (await page.evaluate(() => document.querySelectorAll('.modal-scrim').length)) { await page.keyboard.press('Escape'); await sleep(600); }
    ok(!(await page.evaluate(() => document.querySelectorAll('.modal-scrim').length)), 'browser Demand: Esc se modal band');

    /* ══════════ v2.24.2 — SCAN PARITY: Returns / Put-away / Stock filter / Purchase Returns ══════════
       User: "plz fix this barcode scanning logic in all pages, modals". Ye chaar surfaces
       pehle scan-free thay (line-building nahi, magar product-entry hain). */

    /* ---- Sales ▸ Return drawer: scan-to-return ---- */
    await page.evaluate(() => { document.querySelectorAll('.drawer,.modal-scrim,.offcanvas,.oc-scrim').forEach(x => x.remove()); App.go('sales'); });
    await sleep(2000);
    const retOpened = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /^Return$/.test((x.textContent || '').trim()) && x.offsetParent !== null);
      if (b) { b.click(); return true; } return false;
    });
    let retState = { opened: retOpened };
    if (retOpened) {
      await sleep(1500);
      const pack = await page.evaluate(() => {
        const l = [...document.querySelectorAll('.drawer, .modal-scrim')];
        const t = l[l.length - 1];
        if (!t) return { scan: false };
        const rowEl = t.querySelector('.list-item[data-code]');
        const code = rowEl ? rowEl.dataset.code : '';
        return { scan: !!t.querySelector('.ipk-scan-in'), code, lines: t.querySelectorAll('.list-item').length };
      });
      retState = Object.assign(retState, pack);
      ok(retState.scan, 'browser Return drawer: scan block maujood', JSON.stringify(retState).slice(0, 140));
      if (retState.scan && retState.code) {
        await wedge(page, '.drawer .ipk-scan-in, .modal-scrim .ipk-scan-in', retState.code);
        const after = await page.evaluate(() => {
          const l = [...document.querySelectorAll('.drawer, .modal-scrim')];
          const t = l[l.length - 1];
          const qs = [...t.querySelectorAll('input[type=number]')].map(i => Number(i.value) || 0);
          return { last: (t.querySelector('.ipk-last') || {}).textContent || '', maxQty: Math.max.apply(null, qs.concat([0])),
            scanV: (t.querySelector('.ipk-scan-in') || {}).value };
        });
        ok(after.maxQty >= 1 && /✅/.test(after.last) && after.scanV === '',
          'browser Return: scan → us line ki return qty +1 (field clear)', JSON.stringify(after));
        /* invalid code → warn, qty safe */
        await wedge(page, '.drawer .ipk-scan-in, .modal-scrim .ipk-scan-in', 'ZZZ9999');
        const bad = await page.evaluate(() => {
          const l = [...document.querySelectorAll('.drawer, .modal-scrim')];
          const t = l[l.length - 1];
          const qs = [...t.querySelectorAll('input[type=number]')].map(i => Number(i.value) || 0);
          return { last: (t.querySelector('.ipk-last') || {}).textContent || '', maxQty: Math.max.apply(null, qs.concat([0])) };
        });
        ok(/⚠/.test(bad.last) && bad.maxQty === after.maxQty, 'browser Return: invalid code → warn, qty safe', JSON.stringify(bad));
      }
    } else {
      ok(false, 'browser Return: drawer khula', 'koi Return button nahi mila');
    }
    await page.keyboard.press('Escape'); await sleep(500);
    await page.evaluate(() => { document.querySelectorAll('.drawer,.modal-scrim,.offcanvas,.oc-scrim').forEach(x => x.remove()); });

    /* ---- Warehouse ▸ Put-away / move: scan-first ---- */
    await page.evaluate(() => { App.go('warehouse'); });
    await sleep(1900);
    const paTab = await page.evaluate(() => {
      const b = [...document.querySelectorAll('.tab,button')].find(x => /Put-away/.test(x.textContent || ''));
      if (b) { b.click(); return (b.textContent || '').trim(); } return null;
    });
    await sleep(1900);
    const paScan = await page.evaluate(() => {
      const el = [...document.querySelectorAll('.u2scan-in')].filter(x => x.offsetParent !== null)[0];
      if (el) el.id = el.id || 'paScanProbe';
      return el ? el.id : null;
    });
    ok(!!paScan, 'browser Put-away: scan block maujood (' + paTab + ')', String(paScan));
    if (paScan) {
      await wedge(page, '#' + paScan, 'FL00000');
      /* items.search async hai — row aane tak thora intezar (parallel runs mein
         demo server single-threaded hota hai, is liye poll karna zyada theek) */
      let pa = null;
      for (let i = 0; i < 12; i++) {
        pa = await page.evaluate(() => ({
          v: document.getElementById('paScanProbe').value,
          last: (document.querySelector('.ipk-last') || {}).textContent || '',
          rows: document.querySelectorAll('.list-item').length,
          bins: document.querySelectorAll('.list-item select').length
        }));
        if (pa.rows > 0) break;
        await sleep(250);
      }
      ok(pa.v === '' && /✅/.test(pa.last) && pa.rows > 0 && pa.bins > 0,
        'browser Put-away: scan → item row + bin selector, field clear', JSON.stringify(pa));
    }

    /* ---- Salesman ▸ Current Stock: scan-aware filter ---- */
    await page.evaluate(() => { document.querySelectorAll('.drawer,.modal-scrim,.offcanvas,.oc-scrim').forEach(x => x.remove()); App.go('salesman'); });
    await sleep(1800);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('.tab,button')].find(x => /Current Stock/.test(x.textContent || ''));
      if (b) b.click();
    });
    await sleep(2200);
    const smStock = await page.evaluate(() => {
      const inp = [...document.querySelectorAll('[data-scan-aware="1"]')].filter(x => x.offsetParent !== null)[0];
      if (inp) inp.id = 'smStockProbe';
      const first = document.querySelector('.st2-body tr.clickable td b');
      return { input: !!inp, code: first ? String(first.textContent).trim() : '', rows: document.querySelectorAll('.st2-body tr.clickable').length };
    });
    ok(smStock.input, 'browser Salesman Stock: filter box scan-aware (data-scan-aware)', JSON.stringify(smStock).slice(0, 140));
    if (smStock.input && smStock.code) {
      await wedge(page, '#smStockProbe', smStock.code);
      await sleep(800);
      const filtered = await page.evaluate(() => ({
        v: (document.getElementById('smStockProbe') || {}).value,
        rows: document.querySelectorAll('.st2-body tr.clickable').length
      }));
      /* Filter box hai — scan ke baad value FILTER ke tor par rehti hai (clear nahi hoti),
         rows us item par simat jati hain. Wah scan-to-filter behaviour yahi hai. */
      ok(filtered.v === smStock.code && filtered.rows === 1,
        'browser Salesman Stock: scan → us item par filter (1 row)', JSON.stringify(filtered));
    }

    /* ---- Purchase ▸ Returns: naya UI + scan ---- */
    await page.evaluate(() => { document.querySelectorAll('.drawer,.modal-scrim,.offcanvas,.oc-scrim').forEach(x => x.remove()); App.go('purchase'); });
    await sleep(1500);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /^Returns$/.test((x.textContent || '').trim()));
      if (b) b.click();
    });
    await sleep(1900);
    const pret = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find(x => /New purchase return/.test(x.textContent || ''));
      if (btn) { btn.click(); return true; } return false;
    });
    await sleep(2100);
    const prState = await page.evaluate(() => {
      const l = [...document.querySelectorAll('.modal-scrim, .drawer, .offcanvas')];
      const t = l[l.length - 1];
      return t ? { open: true, title: (t.querySelector('.modal-head h3') || {}).textContent || '', scan: !!t.querySelector('.ipk-scan-in') } : { open: false };
    });
    ok(pret && prState.open && prState.scan, 'browser Purchase Returns: naya form + scan block', JSON.stringify(prState));
    if (prState.scan) {
      await wedge(page, '.modal-scrim .ipk-scan-in, .drawer .ipk-scan-in, .offcanvas .ipk-scan-in', 'FL00000');
      const pr = await page.evaluate(() => {
        const l = [...document.querySelectorAll('.modal-scrim, .drawer, .offcanvas')];
        const t = l[l.length - 1];
        return { v: (t.querySelector('.ipk-scan-in') || {}).value, last: (t.querySelector('.ipk-last') || {}).textContent || '',
          rows: Math.max(0, t.querySelectorAll('table tr').length - 1),   /* header ke ilawa */ };
      });
      ok(pr.v === '' && /✅/.test(pr.last) && pr.rows > 0, 'browser Purchase Returns: scan → line add + field clear', JSON.stringify(pr));
    }
    await page.keyboard.press('Escape'); await sleep(500);
    await page.evaluate(() => { document.querySelectorAll('.drawer,.modal-scrim,.offcanvas,.oc-scrim').forEach(x => x.remove()); });

    /* ============================ PWA POS ============================ */
    const p2 = await browser.newPage();
    const pwaErrs = [];
    p2.on('pageerror', e => pwaErrs.push(String(e && e.message)));
    await p2.goto(BASE + '/pwa-pos.html', { waitUntil: 'networkidle2', timeout: 40000 });
    await sleep(1500); // demo pages auto-login via injected ha_token
    const scanSel = await p2.evaluate(() => {
      const all = [...document.querySelectorAll('input')];
      const inp = all.find(i => /tap .* to scan/i.test(i.getAttribute('placeholder') || ''))
        || all.find(i => /scan/i.test(i.getAttribute('placeholder') || '') && i.type !== 'checkbox');
      if (!inp) return null;
      inp.id = inp.id || 'pwaScanProbe';
      return '#' + inp.id;
    });
    ok(!!scanSel, 'browser PWA-POS: scan input exists', String(scanSel));
    if (scanSel) {
      await wedge(p2, scanSel, 'FL00000');
      const r = await p2.evaluate(s => ({ v: document.querySelector(s).value,
        inCart: /FLAMINGO DASHBOARD/i.test(document.body.innerText) }), scanSel);
      ok(r.v === '' && r.inCart, 'browser PWA-POS: scan clears input + adds to cart (real keys)', JSON.stringify(r));
      // second scan merges (PWA qInput exact-code path adds 1 each time → cart shows 2)
      await wedge(p2, scanSel, 'FL00000');
      const r2 = await p2.evaluate(s => ({ v: document.querySelector(s).value }), scanSel);
      ok(r2.v === '', 'browser PWA-POS: second scan clears again', JSON.stringify(r2));
    }
    ok(pwaErrs.length === 0, 'browser PWA-POS: zero page errors', JSON.stringify(pwaErrs).slice(0, 300));
  } finally {
    await browser.close();
  }
  console.log('\nREAL-BROWSER PASS ' + pass + ' / FAIL ' + fail);
  errs.forEach(e => console.log('  ' + e));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
