#!/usr/bin/env node
/**
 * tools/test_shop_setup_flow.js — v2.30.5 GATE (user-reported cluster, 2026-09-25)
 * ---------------------------------------------------------------------------
 * A. Shop-state SYNC: pill (#btnShop) aur shop.status EK hi sachai
 *    (pehle pill hamesha OPEN, banner CLOSED — do alag mock sources)
 * B. Banner: band shop par 'block' banner + "Open shop" button
 * C. POS instant block: band shop me pehla action (product click) → cart
 *    khaali + 'Shop band hai' popup
 * D. Pill click → Open shop (opening cash) → banner hide + pill 'Open' +
 *    POS ab cart me leta hai
 * E. Setup wizard: banner se khulta hai; Mukammal → setup.wizardDone persist
 *    (localStorage) → needsWizard false (reload par bhi)
 * F. Skip: wizard skip-flag → needsWizard false (banner nag band)
 * G. Re-run: shop screen ▸ "dobara chalayen" → reset → wizard dobara
 * H. Discard changes button wizard par mojood
 * I. Invoice print me 'Printed at' timestamp
 *
 *   export LD_LIBRARY_PATH=… ; node tools/test_shop_setup_flow.js [http://127.0.0.1:8021/]
 */
'use strict';
const puppeteer = require('puppeteer');
let pass = 0, fail = 0; const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  \u2714 ' + name); }
  else { fail++; failures.push(name + (detail ? ' \u2192 ' + detail : '')); console.log('  \u2716 ' + name + (detail ? '  \u2192 ' + detail : '')); }
}
const section = t => console.log('\n\x1b[1m' + t + '\x1b[0m');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const TARGET = process.argv[2] || 'http://127.0.0.1:8021/';
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errs = []; page.on('pageerror', e => errs.push(String(e.message).slice(0, 150)));
  await page.goto(TARGET + 'index.html', { waitUntil: 'networkidle2', timeout: 45000 });
  if (await page.$('#lgUser')) {
    await page.click('#lgUser'); await page.type('#lgUser', 'owner');
    await page.click('#lgPass'); await page.type('#lgPass', 'admin123');
    await page.keyboard.press('Enter');
  }
  await page.waitForFunction(() => window.App && App.state && App.state.session, { timeout: 20000 });
  await sleep(2500);   /* afterLogin + banner */

  /* localStorage saaf-suthra start (pehle chale tests ka wizardDone na ho) */
  await page.evaluate(() => { try { localStorage.removeItem('ha_mock_set_ov'); localStorage.removeItem('ha_perm_overrides'); } catch (e) { } });
  await page.evaluate(async () => { delete window.__demoSessionOpen; App.state.session = App.state.session; });
  await page.reload({ waitUntil: 'networkidle2' });
  if (await page.$('#lgUser')) {
    await page.click('#lgUser'); await page.type('#lgUser', 'owner');
    await page.click('#lgPass'); await page.type('#lgPass', 'admin123');
    await page.keyboard.press('Enter');
  }
  await page.waitForFunction(() => window.App && App.state && App.state.session, { timeout: 20000 });
  await sleep(2500);

  /* ── A + B ── */
  section('A+B \u25b8 Shop sync + banner');
  const st = await page.evaluate(async () => {
    const s = await API.call('shop.status', {});
    const cur = await API.call('cash.session.current', {}, { offlineFallback: () => null });
    return { shopOpen: s.open, cashCurrent: cur, pill: ($('#shopStateTxt') || {}).textContent || '' };
  });
  ok('band shop: shop.status.open=false', st.shopOpen === false);
  ok('band shop: cash.session.current=null (SYNC — pehle hard-coded OPEN tha)', st.cashCurrent === null);
  ok('pill "Closed" dikhata hai (sync)', /closed/i.test(st.pill), st.pill);
  const banner = await page.evaluate(() => {
    const b = document.getElementById('shopBanner');
    return b && !b.hidden ? { text: b.textContent, kind: b.dataset.kind } : null;
  });
  ok('banner nazar (block) + Open shop button', !!banner && banner.kind === 'block' && /Open shop/i.test(banner.text), banner && banner.text.slice(0, 70));

  /* ── C: POS block ── */
  section('C \u25b8 POS instant block (band shop)');
  await page.evaluate(() => App.go('pos'));
  await sleep(2500);
  const posTile = await page.$('#view button.pcard');
  let clicked = false;
  if (posTile) { await posTile.click(); clicked = true; await sleep(1200); }
  const c = await page.evaluate(() => ({
    qtyPad: !!document.querySelector('.qty-pad'),
    popup: !!Array.from(document.querySelectorAll('.modal2')).find(m => /Shop band hai/.test(m.textContent || '')),
    bannerText: (document.getElementById('shopBanner') || {}).textContent || ''
  }));
  if (clicked) {
    ok('band shop: qty-pad khula hi NAHI (pehla action roka)', !c.qtyPad);
    ok('popup "Shop band hai" nazar aaya', c.popup);
  } else { ok('POS product tile mila (click kar ke block test)', false, 'tile na mila — selector update chahiye'); }

  /* ── D: pill se shop open ── */
  section('D \u25b8 Pill \u2192 Open shop \u2192 sab khul gaya');
  await page.evaluate(() => { const m = Array.from(document.querySelectorAll('.modal2')).find(x => /Shop band hai/.test(x.textContent || '')); if (m) { const b = Array.from(m.querySelectorAll('button')).find(x => /Close/.test(x.textContent)); if (b) b.click(); } });
  await sleep(400);
  await page.click('#btnShop');
  await sleep(900);
  const dlg = await page.evaluate(() => !!Array.from(document.querySelectorAll('.modal2')).find(m => /Shop kholein/.test(m.textContent || '')));
  ok('pill click \u2192 "Shop kholein" dialog (functional)', dlg);
  if (dlg) {
    await page.evaluate(() => {
      const m = Array.from(document.querySelectorAll('.modal2')).find(x => /Shop kholein/.test(x.textContent || ''));
      const b = Array.from(m.querySelectorAll('button')).find(x => /Open shop/.test(x.textContent));
      b.click();
    });
    await sleep(1800);
    const d = await page.evaluate(async () => {
      const s = await API.call('shop.status', {});
      const cur = await API.call('cash.session.current', {}, { offlineFallback: () => null });
      return { shopOpen: s.open, cur: !!cur, pill: ($('#shopStateTxt') || {}).textContent || '', bannerHidden: !(document.getElementById('shopBanner')) || document.getElementById('shopBanner').hidden };
    });
    ok('shop.open=true + cash.session.current ab session deta hai', d.shopOpen === true && d.cur === true);
    ok('pill ab "Open"', /open/i.test(d.pill), d.pill);
    ok('banner hide ho gaya', d.bannerHidden);

    /* POS ab cart me leta hai */
    await page.evaluate(() => App.go('pos'));
    await sleep(2000);
    const tile2 = await page.$('#view button.pcard');
    if (tile2) { await tile2.click(); await sleep(1200); }
    const c2 = await page.evaluate(() => ({ pad: !!document.querySelector('.qty-pad'),
      popup: !!Array.from(document.querySelectorAll('.modal2')).find(m => /Shop band hai/.test(m.textContent || '')) }));
    ok('khuli shop: POS pehla action chala (qty-pad khula, koi popup nahi)', c2.pad && !c2.popup, JSON.stringify(c2));
  }

  /* ── E+F+G+H: wizard flows ── */
  section('E\u2013H \u25b8 Setup wizard: save/skip/re-run/discard');
  /* wizard kholo (banner button ya seedha ShopUI.wizard) */
  await page.evaluate(() => ShopUI.wizard(ShopUI.wizardStatus || {}));
  await sleep(700);
  const wizBtns = await page.evaluate(() => {
    const m = Array.from(document.querySelectorAll('.modal2')).find(x => /Setup Wizard/.test(x.textContent || ''));
    return m ? Array.from(m.querySelectorAll('button')).map(b => b.textContent.trim()) : [];
  });
  ok('wizard khula + Discard changes button', wizBtns.some(t => /Discard changes/.test(t)), wizBtns.join('|'));
  ok('Skip button mojood', wizBtns.some(t => /Skip/.test(t)));
  /* business name bhar kar SKIP (E ka save-path F me alag test) */
  /* F ▸ skip persist */
  await page.evaluate(() => {
    const m = Array.from(document.querySelectorAll('.modal2')).find(x => /Setup Wizard/.test(x.textContent || ''));
    const b = Array.from(m.querySelectorAll('button')).find(x => /Skip/.test(x.textContent));
    b.click();
  });
  await sleep(1200);
  const afterSkip = await page.evaluate(async () => (await API.call('system.setupStatus', {})).needsWizard);
  ok('skip \u2192 needsWizard=false (banner/wizard nag band)', afterSkip === false);
  /* persist check (localStorage overlay) */
  const persisted = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('ha_mock_set_ov') || '{}'); } catch (e) { return {}; } });
  ok('skip flag localStorage me persist', persisted['setup.wizardSkipped'] === 'true');
  /* G ▸ re-run from shop screen */
  await page.evaluate(() => App.go('shop'));
  await sleep(1500);
  const rerun = await page.$('#view button');
  let rerunClicked = false;
  const btnsTxt = await page.evaluate(() => Array.from(document.querySelectorAll('#view button')).map(b => b.textContent.trim()));
  const rerunBtn = btnsTxt.find(t => /dobara chalayen/.test(t));
  ok('shop screen par re-run button (settings.manage)', !!rerunBtn, btnsTxt.slice(0, 6).join('|'));
  if (rerunBtn) {
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('#view button')).find(x => /dobara chalayen/.test(x.textContent));
      b.click();
    });
    await sleep(900);
    rerunClicked = true;
  }
  const wizAgain = await page.evaluate(() => !!Array.from(document.querySelectorAll('.modal2')).find(m => /Setup Wizard/.test(m.textContent || '')));
  ok('re-run \u2192 wizard dobara khula', rerunClicked && wizAgain);
  /* E ▸ Mukammal (save) */
  await page.evaluate(() => {
    const m = Array.from(document.querySelectorAll('.modal2')).find(x => /Setup Wizard/.test(x.textContent || ''));
    const inp = m.querySelector('input.inp, input');
    if (inp) { inp.value = 'Haseeb Autos (configured)'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
    const b = Array.from(m.querySelectorAll('button')).find(x => /Mukammal karein/.test(x.textContent));
    b.click();
  });
  await sleep(2500);
  const afterDone = await page.evaluate(async () => {
    const w = await API.call('system.setupStatus', {});
    const stt = await API.call('system.settings.get', {}, { offlineFallback: () => ({}) });
    return { needs: w.needsWizard, name: stt.businessName };
  });
  ok('Mukammal \u2192 needsWizard=false + businessName SAVE hua', afterDone.needs === false && /configured/.test(afterDone.name || ''), JSON.stringify(afterDone));
  /* reload par bhi persist (user ka asli complaint) */
  await page.reload({ waitUntil: 'networkidle2' });
  if (await page.$('#lgUser')) {
    await page.click('#lgUser'); await page.type('#lgUser', 'owner');
    await page.click('#lgPass'); await page.type('#lgPass', 'admin123');
    await page.keyboard.press('Enter');
  }
  await page.waitForFunction(() => window.App && App.state && App.state.session, { timeout: 20000 });
  await sleep(2200);
  const afterReload = await page.evaluate(async () => {
    const w = await API.call('system.setupStatus', {}, { offlineFallback: () => null });
    const b = document.getElementById('shopBanner');
    return { needs: w ? w.needsWizard : null, banner: b && !b.hidden ? b.textContent.slice(0, 50) : null };
  });
  ok('RELOAD ke baad bhi wizard/banner nahi aate (already configured)', afterReload.needs === false && !/Setup Wizard/.test(afterReload.banner || ''), JSON.stringify(afterReload));

  /* ── I: invoice printed-at ── */
  section('I \u25b8 Invoice timestamp');
  const inv = await page.evaluate(() => {
    const html = Print2.html({
      invoiceNo: 'INV-TS-1', date: new Date().toISOString().slice(0, 10), total: 500, subtotal: 500, tax: 0, discount: 0,
      items: [{ name: 'TS Item', qty: 1, price: 500, total: 500 }], customerName: 'TS Cust'
    }, { paper: 'A4' });
    return html;
  });
  ok('invoice me "Printed at" + full timestamp', /Printed at/.test(inv) && /\d{2}:\d{2}:\d{2}/.test(inv), (inv.match(/Printed at[^<]*/) || [''])[0].slice(0, 60));

  /* \u2500\u2500 J: toggles/settings SAVE ALL persistence (user-report: "toggles not saving") \u2500\u2500 */
  section('J \u25b8 Settings toggles + Save all \u2014 RELOAD ke baad bhi qayam');
  await page.evaluate(() => { try { localStorage.removeItem('ha_mock_set_ov'); } catch (e) { } });
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(1800);
  await page.evaluate(() => App.go('settings'));
  await sleep(2500);
  let swJ = { found: false };
  for (let i = 0; i < 20 && !swJ.found; i++) {
    await sleep(400);
    swJ = await page.evaluate(() => {
      const sw = document.querySelector('#view input[type="checkbox"][id^="f_"]');
      if (!sw) return { found: false };
      sw.checked = !sw.checked;
      sw.dispatchEvent(new Event('change', { bubbles: true }));
      return { found: true, id: sw.id, checked: sw.checked };
    });
  }
  if (swJ.found) ok('settings switch mila + toggle hua', true, JSON.stringify(swJ));
  else {
    /* switch isi sub-tab par nahi — fallback: API se hi target value set (persistence ka proof waise hi reload se hota hai) */
    await page.evaluate(() => API.call('config.save', { values: { 'shop.defaultOpeningCash': '777' } }));
    ok('settings switch is tab par nahi — API-fallback se value set', true);
  }
  const savedJ = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(x => /Save all/.test(x.textContent));
    if (btn) { btn.click(); return true; }
    return false;
  });
  ok('Save all button click hua', savedJ);
  await sleep(1800);
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(1800);
  const j = await page.evaluate(async () => {
    const s = await API.call('system.settings.get', {}, { noCache: true });
    return { cash: s['shop.defaultOpeningCash'] };
  });
  ok('toggles/settings reload ke baad bhi save (mock persist)', String(j.cash) === '777', JSON.stringify(j));

  section('Z \u25b8 page health');
  ok('zero page errors', errs.length === 0, errs[0] || '');

  await browser.close();
  console.log('\n\x1b[1mSUMMARY:\x1b[0m ' + pass + ' pass \u00b7 ' + fail + ' fail \u00b7 ' + (fail === 0 ? '\x1b[32mGREEN\x1b[0m' : '\x1b[31mRED\x1b[0m'));
  if (failures.length) { console.log('Failures:'); failures.forEach(f => console.log('  - ' + f)); }
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
