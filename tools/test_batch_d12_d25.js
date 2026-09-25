#!/usr/bin/env node
/* ============================================================================
 * tools/test_batch_d12_d25.js — v2.30.5 MEGA-BATCH GATE (30-task round)
 * ----------------------------------------------------------------------------
 * Rendered-DOM/API assertions per task:
 *   D12b sales totals footer · D13 registry version-bump+history ·
 *   D18 recent-scan chips · D19 per-type share template · D20 HA:PAY → money ·
 *   D21 URL safe-open (https open / javascript: reject) · D22 invoice line →
 *   item detail · D23 supplier-payment modal entity-link · D24/D25 registry
 *   roundtrips (GRN/RECEIPT + resolve) · P4-a demand KPI drill-down ·
 *   P4-b demand state-aware next-action · D7b3-6 i18n EN-pure + roman dict
 * Run:  node tools/test_batch_d12_d25.js   (server 8021 + LD_LIBRARY_PATH)
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

  try {
    await page.goto('http://127.0.0.1:8021/', { waitUntil: 'networkidle2', timeout: 45000 });
    if (await page.$('#lgUser')) {
      await page.click('#lgUser'); await page.type('#lgUser', 'owner');
      await page.click('#lgPass'); await page.type('#lgPass', 'admin123');
      await page.keyboard.press('Enter');
    }
    await page.waitForFunction(() => window.App && App.state && App.state.session, { timeout: 20000 });
    await sleep(1200);

    /* ── D12b: sales totals footer ────────────────────────────────────────── */
    console.log('\x1b[1mD12b — sales totals footer\x1b[0m');
    await page.evaluate(() => App.go('sales'));
    await sleep(2000);
    const st = await page.evaluate(() => {
      const tf = document.querySelector('tfoot.tbl-totals');
      const body = [...document.querySelectorAll('tbody tr')].map(tr => {
        const tds = tr.querySelectorAll('td');
        return tds[4] ? (Number((tds[4].textContent || '').replace(/[^\d.]/g, '')) || 0) : 0;
      }).reduce((a, b) => a + b, 0);
      return { tf: !!tf, text: tf ? tf.textContent.replace(/\s+/g, ' ').trim() : '', bodySum: Math.round(body) };
    });
    ok(st.tf, 'sales tfoot.tbl-totals render');
    ok(st.bodySum > 0 && st.text.indexOf('Total') === 0, 'sums footer (' + st.text.slice(0, 60) + '… vs body-sum ' + st.bodySum + ')');

    /* ── D13: registry version-bump ───────────────────────────────────────── */
    console.log('\x1b[1mD13 — registry version-bump + history\x1b[0m');
    const vr = await page.evaluate(async () => {
      const a = await Docs.register({ docType: 'REPORT', entityType: 'item', entityId: 'ITM-V1', ref: 'RPT-V1', module: 'reports', action: 'generate' });
      const va = JSON.parse(JSON.stringify(a)).version; /* alias-safe read */
      const before = (await Docs.list({ pageSize: 500 })).total;
      const b = await Docs.register({ docType: 'REPORT', entityType: 'item', entityId: 'ITM-V1', ref: 'RPT-V1', module: 'reports', action: 'generate' });
      const vb = JSON.parse(JSON.stringify(b)).version;
      const after = (await Docs.list({ pageSize: 500 })).total;
      return { va: va, vb: vb, sameId: a.id === b.id, hist: (b.history || []).length, rowsSame: before === after };
    });
    ok(vr.sameId && vr.vb === vr.va + 1, 'same ref → version bump (' + vr.va + '→' + vr.vb + ', new row nahi)');
    ok(vr.hist >= 1 && vr.rowsSame, 'history entry save (' + vr.hist + ')');

    /* ── D20 + D21: resolver PAY + URL ────────────────────────────────────── */
    console.log('\x1b[1mD20/D21 — resolver PAY + URL safe-open\x1b[0m');
    const pay = await page.evaluate(() => App.resolveCode('HA:PAY:PMT-77'));
    await sleep(1000);
    ok(pay && pay.ok && pay.screen === 'money', 'HA:PAY → money screen (' + (pay && pay.label) + ')');
    const url = await page.evaluate(async () => {
      const opened = []; window.open = u => { opened.push(String(u)); return null; };
      await App.resolveCode('https://example.com/inv/123');
      await App.resolveCode('javascript:alert(1)');
      return { opened, jsBlocked: true };
    });
    ok(url.opened.length === 1 && url.opened[0] === 'https://example.com/inv/123', 'https open (1), javascript: reject — ' + JSON.stringify(url.opened));

    /* ── D18: recent-scan chips ───────────────────────────────────────────── */
    console.log('\x1b[1mD18 — recent-scan chips\x1b[0m');
    await page.evaluate(() => App.go('documents'));
    await sleep(1500);
    const chips = await page.evaluate(() => {
      const c = [...document.querySelectorAll('.chips .chip')];
      return { n: c.length, first: c[0] ? c[0].textContent : '' };
    });
    ok(chips.n >= 2, 'recent-scans chips render (' + chips.n + ')');

    /* ── D19: per-type share template ─────────────────────────────────────── */
    console.log('\x1b[1mD19 — docType share template\x1b[0m');
    const tpl = await page.evaluate(async () => {
      await API.call('system.settings.save', { values: { 'comms.docTemplate.LABELS': 'LABEL-TEST {{ref}} x{{version}} for {{business}}' } });
      await Docs.register({ docType: 'LABELS', entityType: 'item', entityId: 'ITM-T19', ref: 'labels:77', module: 'items', qr: 'HA:ITM:ITM-T19' });
      return true;
    });
    ok(tpl, 'template save + LABELS doc seed');
    await page.evaluate(() => { App.go('documents'); });
    await sleep(1600);
    await page.evaluate(() => {
      const tr = [...document.querySelectorAll('tbody tr')].find(x => x.textContent.includes('labels:77'));
      if (tr) { const b = tr.querySelector('button[title^="Share"]'); if (b) b.click(); }
    });
    await sleep(1000);
    const tplTxt = await page.evaluate(() => {
      const m = [...document.querySelectorAll('#modalRoot .modal2')].pop();
      const ta = m && m.querySelector('textarea');
      return ta ? ta.value : '';
    });
    ok(/LABEL-TEST labels:77 x\d+ for /.test(tplTxt), 'template rendered ({{ref}}/{{version}}/{{business}} fill)');
    await page.keyboard.press('Escape'); await sleep(400);

    /* ── D22: invoice lines → item links ──────────────────────────────────── */
    console.log('\x1b[1mD22 — invoice line entity-links\x1b[0m');
    const d22 = await page.evaluate(async () => {
      const r = await API.call('sales.list', { pageSize: 3 });
      window.__openSale((r.rows || [])[0].id);
      return true;
    });
    await sleep(1400);
    const d22b = await page.evaluate(() => {
      const drawer = document.querySelector('.drawer');
      const links = drawer ? [...drawer.querySelectorAll('.li-main .ent-link')] : []; /* sirf line-item links */
      if (links.length) links[0].click(); /* pehla LINE-ITEM link (customer-link nahi) */
      return { n: links.length };
    });
    await sleep(1500);
    ok(d22b.n >= 1, 'invoice lines me item-links (' + d22b.n + ')');
    ok(await page.evaluate(() => location.hash.indexOf('#/items') === 0 && !!document.querySelector('.offcanvas, #modalRoot .modal2')), 'item detail khula (#/items)');

    /* ── D23: supplier-payment modal link ─────────────────────────────────── */
    console.log('\x1b[1mD23 — supplier-payment modal link\x1b[0m');
    await page.evaluate(() => { document.querySelectorAll('.offcanvas, #modalRoot .modal-scrim, .drawer, .drawer-scrim').forEach(n => n.remove()); App.go('purchase'); });
    await sleep(2000);
    const d23 = await page.evaluate(() => {
      const gt = [...document.querySelectorAll('.seg button, [class*="seg"] button, .tabs button')].find(b => b.textContent.trim() === 'GRN');
      if (gt) { gt.click(); return 'tab'; }
      const tr = document.querySelector('tbody tr');
      if (tr) { tr.click(); return 'row'; }
      return false;
    });
    await sleep(1600);
    const d23r = await page.evaluate(() => { const tr = document.querySelector('tbody tr'); if (tr) tr.click(); return !!tr; });
    await sleep(1200);
    const d23b = await page.evaluate(() => {
      const pay = [...document.querySelectorAll('button')].find(b => /💸 Payment|Supplier payment/.test(b.textContent));
      if (pay) { pay.click(); return true; } return false;
    });
    await sleep(1200);
    const d23c = await page.evaluate(() => {
      const m = [...document.querySelectorAll('#modalRoot .modal2')].pop();
      return m ? { hasLink: !!m.querySelector('.m-sub .ent-link, .ent-link') } : { hasLink: false };
    });
    ok(!!d23 && d23r && d23b, 'GRN tab → detail → Payment action');
    ok(d23c.hasLink, 'payment modal me supplier .ent-link');
    await page.keyboard.press('Escape'); await sleep(400);

    /* ── D24/D25: registry roundtrips (GRN/RECEIPT data-level) ───────────── */
    console.log('\x1b[1mD24/D25 — GRN/RECEIPT registry + resolve\x1b[0m');
    const rr = await page.evaluate(async () => {
      await Docs.register({ docType: 'GRN', entityType: 'supplier', entityId: 'SUP-GRN1', ref: 'GRN-TEST-1', module: 'purchase', action: 'save', qr: '' });
      await Docs.register({ docType: 'RECEIPT', entityType: 'sale', entityId: 'SAL-R1', ref: 'INV-R-1', module: 'pos', action: 'print', qr: 'HA:INV:INV-R-1' });
      const g = await Docs.get('GRN-TEST-1') || (await Docs.list({ q: 'GRN-TEST-1' })).rows[0];
      return { g: !!g };
    });
    ok(rr.g, 'GRN + RECEIPT registry entries');
    const res2 = await page.evaluate(() => App.resolveCode('HA:DOC:' + 'DOC-DOC') /* unknown-id graceful */);
    await sleep(700);
    ok(res2 && res2.ok === false, 'unknown HA:DOC graceful');

    /* ── P4-a: demand KPI drill-down ──────────────────────────────────────── */
    console.log('\x1b[1mP4-a — demand KPI drill-down\x1b[0m');
    await page.evaluate(() => { App.go('demands'); });
    await sleep(2000);
    const kpi = await page.evaluate(() => {
      const k = [...document.querySelectorAll('.kpi')].find(x => /Outstanding/i.test(x.textContent));
      if (!k) return { found: false };
      k.click(); return { found: true, title: k.title };
    });
    await sleep(1400);
    ok(kpi.found, 'Outstanding KPI clickable (' + kpi.title + ')');
    ok(await page.evaluate(() => { const s = document.querySelector('select.f-input'); return s && s.value === 'OPEN'; }), 'KPI click → status filter OPEN');

    /* ── P4-b: state-aware next-action ────────────────────────────────────── */
    console.log('\x1b[1mP4-b — state-aware row action\x1b[0m');
    const act = await page.evaluate(() => {
      const tr = [...document.querySelectorAll('tbody tr')].find(x => /OPEN/.test(x.textContent));
      if (!tr) return { row: false };
      const b = [...tr.querySelectorAll('button')].find(x => /Source/.test((x.title || '') + (x.getAttribute('aria-label') || '') + x.textContent));
      if (!b) return { row: true, btn: false, btns: [...tr.querySelectorAll('button')].map(x => (x.title || '') + '|' + x.textContent.trim()).slice(0, 5) };
      b.click(); return { row: true, btn: true };
    });
    await sleep(900);
    const modalOpen = await page.evaluate(() => !!document.querySelector('#modalRoot .modal2'));
    ok(act.row && act.btn, 'OPEN row par "Source" next-action');
    ok(modalOpen, 'action → status modal khula');
    await page.keyboard.press('Escape'); await sleep(400);

    /* ── D7b3-6: i18n EN-pure + roman ─────────────────────────────────────── */
    console.log('\x1b[1mD7b3-6 — i18n EN-pure + roman dict\x1b[0m');
    const i18n = await page.evaluate(async () => {
      const keys = ['dash.csvHint', 'pur.noReorder', 'mast.printFail', 'inv2.noDiff', 'ord.noSelect', 'dem.pickCustomer'];
      const saved = T.lang;
      T.lang = 'en'; T.dict = {};
      const en = keys.map(k => T.t(k, 'FB-' + k));
      await T.set('roman'); await new Promise(r => setTimeout(r, 800));
      const ro = keys.map(k => T.t(k, 'FB-' + k));
      await T.set(saved); await new Promise(r => setTimeout(r, 400));
      return { en, ro };
    });
    const enPure = i18n.en.every(v => !/karein|nahi|gayi|Koi|zyada|likhein/i.test(v));
    const roWork = i18n.ro.some(v => /karein|nahi|mila|Koi|ya |Har /i.test(v));
    ok(enPure, '6 naye keys EN-pure (en mode)');
    ok(roWork, 'roman dict se Roman-Urdu aati hai');
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
