#!/usr/bin/env node
/* ============================================================================
 * tools/test_documents_hub.js — v2.30.5 (D4) DOCUMENTS HUB GATE
 * ----------------------------------------------------------------------------
 * Doc-intel §3: Documents area = dashboard + search + scanner + file-manager UX.
 * Rendered-DOM assertions:
 *   A) nav (config.menu) → screen khulta hai, KPIs + toolbar render
 *   B) registry entries → table rows + KPI counts (rendered)
 *   C) search filter live (rendered row count ghatta hai)
 *   D) row click → detail modal (metadata + related)
 *   E) deep-link App.go('documents',{open:id}) → modal (onParams)
 *   F) entity-link → sales screen (record context)
 *   G) Scan & Resolve action → scanner/manual modal khulta hai
 *   H) zero page errors
 * Run:  node tools/test_documents_hub.js   (server 8021 + LD_LIBRARY_PATH)
 * ==========================================================================*/
'use strict';
(async () => {
  const puppeteer = require('puppeteer');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e.message).slice(0, 140)));
  await page.setViewport({ width: 1440, height: 900 });
  let pass = 0, fail = 0; const failures = [];
  const ok = (cond, name) => { if (cond) { pass++; console.log('  ✔ ' + name); } else { fail++; failures.push(name); console.log('  ✘ ' + name); } };
  const login = async () => {
    if (await page.$('#lgUser')) {
      await page.click('#lgUser'); await page.type('#lgUser', 'owner');
      await page.click('#lgPass'); await page.type('#lgPass', 'admin123');
      await page.keyboard.press('Enter');
    }
    await page.waitForFunction(() => window.App && App.state && App.state.session, { timeout: 20000 });
    await sleep(1200);
  };

  try {
    await page.goto('http://127.0.0.1:8021/', { waitUntil: 'networkidle2', timeout: 45000 });
    await login();

    /* ── PART A — nav se screen ───────────────────────────────────────────── */
    console.log('\x1b[1mPART A — nav + screen render\x1b[0m');
    const navThere = await page.evaluate(() => {
      const n = document.querySelector('#sbNav .nav-item[data-id="documents"]');
      return n ? n.textContent.trim() : null;
    });
    ok(!!navThere, 'sidebar me Documents nav-item (config.menu)' + (navThere ? ' — "' + navThere.slice(0, 20) + '"' : ''));
    await page.evaluate(() => App.go('documents'));
    await sleep(1400);
    ok(await page.evaluate(() => location.hash.indexOf('#/documents') === 0), 'hash #/documents');
    const hubRender = await page.evaluate(() => ({
      kpi: [...document.querySelectorAll('.screen, main, body')].some(x => x.textContent.includes('Total documents')),
      scan: [...document.querySelectorAll('button')].some(b => /Scan & Resolve/.test(b.textContent))
    }));
    ok(hubRender.kpi, 'KPI row render (Total documents)');
    ok(hubRender.scan, 'Scan & Resolve action topbar me');

    /* ── PART B — registry data → rows + KPIs ─────────────────────────────── */
    console.log('\x1b[1mPART B — registry → table rows\x1b[0m');
    const seeded = await page.evaluate(async () => {
      await Docs.register({ docType: 'INVOICE', entityType: 'sale', entityId: 'SAL-D4A', ref: 'INV-D4-1', module: 'sales', qr: 'HA:INV:INV-D4-1' });
      await Docs.register({ docType: 'LABELS', entityType: 'item', entityId: 'ITM-D4B', ref: 'labels:25', module: 'items', qr: 'HA:ITM:ITM-D4B' });
      return (await Docs.list({ pageSize: 100 })).total;
    });
    ok(seeded >= 2, 'seed: 2 registry entries (total=' + seeded + ')');
    await page.evaluate(() => App.refresh());
    await sleep(1600);
    const rowsB = await page.evaluate(() => document.querySelectorAll('.screen table tbody tr, main table tbody tr').length);
    ok(rowsB >= 2, 'table rows render (' + rowsB + ')');
    const kpiVal = await page.evaluate(() => {
      const k = [...document.querySelectorAll('.kpi')].find(x => /Total documents/.test(x.textContent));
      if (!k) return null;
      const m = k.textContent.match(/(\d[\d,]*)/g);
      return m ? m[m.length - 1] : null;
    });
    ok(kpiVal !== null && Number(String(kpiVal).replace(/,/g, '')) >= 2, 'KPI Total = ' + kpiVal);

    /* ── PART C — search filter ───────────────────────────────────────────── */
    console.log('\x1b[1mPART C — search filter\x1b[0m');
    await page.type('input[type="search"][aria-label="Search documents"]', 'INV-D4-1');
    await sleep(1100);
    const rowsC = await page.evaluate(() => document.querySelectorAll('.screen table tbody tr, main table tbody tr').length);
    ok(rowsC === 1, 'search "INV-D4-1" → 1 row (rendered ' + rowsC + ')');
    await page.evaluate(() => { const i = document.querySelector('input[aria-label="Search documents"]'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); });
    await sleep(900);

    /* ── PART D — row click → detail modal ────────────────────────────────── */
    console.log('\x1b[1mPART D — detail modal\x1b[0m');
    await page.evaluate(() => { const tr = document.querySelector('.screen table tbody tr, main table tbody tr'); if (tr) tr.click(); });
    await sleep(900);
    const modalD = await page.evaluate(() => {
      const h3 = document.querySelector('#modalRoot .modal2 h3');
      return { open: !!h3, doc: h3 ? h3.textContent : '', related: document.querySelector('#modalRoot .modal2').textContent.includes('Related documents') };
    });
    ok(modalD.open && modalD.doc.indexOf('DOC-') > -1, 'detail modal khula (' + modalD.doc + ')');
    ok(modalD.related, 'related-documents section mojood');
    await page.keyboard.press('Escape');
    await sleep(500);

    /* ── PART E — deep-link onParams ──────────────────────────────────────── */
    console.log('\x1b[1mPART E — deep-link {open}\x1b[0m');
    await page.evaluate(async () => {
      const r = (await Docs.list({ q: 'INV-D4-1' })).rows[0];
      App.go('documents', { open: r.id });
    });
    await sleep(1600);
    ok(await page.evaluate(() => !!document.querySelector('#modalRoot .modal2 h3')), 'deep-link → detail modal (onParams)');
    await page.keyboard.press('Escape');
    await sleep(400);

    /* ── PART F — entity-link → sales ─────────────────────────────────────── */
    console.log('\x1b[1mPART F — entity-link\x1b[0m');
    await page.evaluate(() => App.go('documents'));
    await sleep(1400);
    const went = await page.evaluate(() => {
      const l = [...document.querySelectorAll('.screen .ent-link, main .ent-link')].find(x => x.textContent === 'INV-D4-1');
      if (!l) return false; l.click(); return true;
    });
    ok(went, 'table me entity-link click');
    await sleep(1500);
    const afterF = await page.evaluate(() => ({
      hash: location.hash,
      detail: !!document.querySelector('#modalRoot .modal2, .drawer')
    }));
    ok(afterF.hash.indexOf('#/sales') === 0, 'hash: ' + afterF.hash);
    ok(afterF.detail, 'invoice detail foran khuli');

    /* ── PART G — Scan & Resolve action ───────────────────────────────────── */
    console.log('\x1b[1mPART G — Scan & Resolve\x1b[0m');
    await page.evaluate(() => { document.querySelectorAll('#modalRoot .modal-scrim').forEach(n => n.remove()); App.go('documents'); });
    await sleep(1300);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /Scan & Resolve/.test(x.textContent));
      if (b) b.click();
    });
    await sleep(900);
    ok(await page.evaluate(() => !!document.querySelector('#modalRoot .modal2, video')), 'scanner/manual modal khula');
    await page.keyboard.press('Escape');
    await sleep(400);

    /* ── PART H — page health ─────────────────────────────────────────────── */
    console.log('\x1b[1mPART H — page health\x1b[0m');
    ok(errs.length === 0, 'zero page errors' + (errs.length ? ' — ' + errs[0] : ''));

    console.log('\x1b[1mSUMMARY:\x1b[0m ' + pass + ' pass \u00b7 ' + fail + ' fail \u00b7 ' + (fail ? '\x1b[31mRED\x1b[0m' : '\x1b[32mGREEN\x1b[0m'));
    if (fail) { console.log('Failures:'); failures.forEach(f => console.log('  - ' + f)); }
  } catch (e) {
    console.log('FATAL: ' + String(e.message || e).slice(0, 200));
    fail++;
  } finally {
    await browser.close();
    process.exitCode = fail ? 1 : 0;
  }
})();
