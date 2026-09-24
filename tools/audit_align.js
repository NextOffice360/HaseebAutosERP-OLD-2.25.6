/**
 * audit_align.js — Popup alignment auditor (modals, offcanvas, drawers)
 *
 * User report: "terms page modal left side ja raha hai; offcanvas right side par
 * chipakna chahiye; popup center me hona chahiye."
 *
 * Ye tool har popup type ko khol kar verify karta hai:
 *   • .offcanvas  → right:0 / left:auto (right-anchored), transform none when open
 *   • .offcanvas.left → left:0 / right:auto
 *   • .modal2     → parent .modal-scrim centered (flex + align/justify center)
 *   • .modal2 / .modal → koi `left:` offset nahi (center se hat kar nahi jana chahiye)
 *   • .drawer     → right:0
 *   • koi bhi modal/offcanvas orphan (scrim ke bahar) nahi
 *
 *   node tools/audit_align.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { loginDom } = require('./_harness');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'demo', 'index.html'), 'utf-8');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push('jsdomError: ' + (e && e.message ? e.message : e)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const dom = new JSDOM(HTML, { runScripts: 'dangerously', pretendToBeVisual: true,
  url: 'https://localhost/', virtualConsole: vc });
const win = dom.window, doc = win.document;
win.matchMedia = win.matchMedia || (q => ({ matches: false, media: q, addListener() { }, removeListener() { },
  addEventListener() { }, removeEventListener() { } }));
win.requestAnimationFrame = cb => setTimeout(cb, 0);
win.scrollTo = () => { };
win.HTMLElement.prototype.scrollIntoView = () => { };
win.URL.createObjectURL = () => 'blob:demo';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const fails = [];
const total = { n: 0 };
function check(name, ok, detail) {
  total.n++;
  if (!ok) { fails.push(name + ' → ' + (detail || '')); console.log('  ✖ ' + name + '  → ' + (detail || '')); }
}
const cs = el => win.getComputedStyle(el);

/* --------------------------- static CSS checks ---------------------------- */
function cssRule(selector) {
  const out = [];
  Array.from(doc.styleSheets || []).forEach(sheet => {
    let rules = [];
    try { rules = Array.from(sheet.cssRules || []); } catch (e) { return; }
    rules.forEach(r => { if (r.selectorText && r.selectorText.indexOf(selector) > -1) out.push(r); });
  });
  return out;
}
function ruleHas(sel, prop) {
  return cssRule(sel).some(r => r.style && r.style.getPropertyValue(prop) !== '');
}

/* ------------------------------ runtime checks ---------------------------- */
function checkOffcanvas(label, el) {
  const st = cs(el);
  const isLeft = el.classList.contains('left');
  check(label + ': offcanvas right-anchored',
    isLeft ? (st.left === '0px' || st.left === '0') : (st.right === '0px' || st.right === '0'),
    'right=' + st.right + ' left=' + st.left + ' (class="' + el.className + '")');
  check(label + ': offcanvas fixed', st.position === 'fixed', 'position=' + st.position);
  check(label + ': offcanvas open (no translate)',
    /none|matrix\(1, 0, 0, 1, 0, 0\)/.test(st.transform || 'none'), 'transform=' + st.transform);
  const scrim = doc.querySelector('.scrim.oc-scrim');
  check(label + ': offcanvas has scrim', !!scrim, 'no scrim');
}

function checkModal(label, el) {
  const scrim = el.parentElement;
  check(label + ': modal inside scrim', !!scrim && /modal-scrim/.test(scrim.className || ''),
    'parent=' + (scrim && scrim.className));
  if (scrim) {
    const sst = cs(scrim);
    check(label + ': scrim centers content',
      (sst.display === 'flex' || sst.display === 'grid') &&
      (sst.justifyContent === 'center' || sst.placeItems === 'center'),
      'display=' + sst.display + ' justify=' + sst.justifyContent + ' placeItems=' + sst.placeItems);
    check(label + ': scrim vertically centered',
      sst.alignItems === 'center' || sst.placeItems === 'center' || /flex-start/.test(sst.alignItems || ''),
      'alignItems=' + sst.alignItems);
  }
  const st = cs(el);
  check(label + ': modal has no left offset',
    !st.left || st.left === 'auto' || st.left === '0px', 'left=' + st.left);
  check(label + ': modal auto margins (centered)', /auto/.test(st.margin || '') || st.marginLeft === 'auto',
    'margin=' + st.margin);
}

async function boot() {
  /* login ka poll (fixed 400ms race thi — 2026-09-24 full verify mein crash) */
  await loginDom(doc, win);
  await sleep(400);

  console.log('\x1b[1mSTATIC CSS RULES\x1b[0m');
  check('.offcanvas has right anchor', ruleHas('.offcanvas', 'right'), 'missing right:0');
  check('.offcanvas.left has left anchor', ruleHas('.offcanvas.left', 'left'), 'missing left:0');
  check('.modal-scrim centers (flex)', ruleHas('.modal-scrim', 'justify-content'), 'missing centering');
  check('.drawer anchored right', ruleHas('.drawer', 'right'), 'missing right');

  /* 1. offcanvas — item detail (Masters) */
  win.App.go('items'); await sleep(900);
  const rows = Array.from(doc.querySelectorAll('#view .tbl tbody tr, #view .list-item'));
  if (rows.length) {
    rows[0].dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
    await sleep(700);
    const oc = doc.querySelector('.offcanvas');
    if (oc) checkOffcanvas('items ▸ detail', oc);
    else check('items ▸ detail: offcanvas opens', false, 'not opened');
    const closeBtn = doc.querySelector('.offcanvas .oc-x');
    if (closeBtn) { closeBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); await sleep(400); }
  }

  /* 2. offcanvas — POS current bill (right side) */
  win.App.go('pos'); await sleep(1400);
  const billBtn = Array.from(doc.querySelectorAll('#view button'))
    .find(b => /bill|cart/i.test(b.getAttribute('aria-label') || b.textContent || ''));
  if (billBtn) {
    billBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
    await sleep(700);
    const oc2 = doc.querySelector('.offcanvas');
    if (oc2) checkOffcanvas('pos ▸ current bill', oc2);
  }

  /* 3. modals — AI studio, share, print dialog, template designer */
  async function openModal(label, fn) {
    const before = doc.querySelectorAll('.modal2').length;
    try { await fn(); } catch (e) { check(label + ': opens', false, e.message); return; }
    await sleep(800);
    const m = Array.from(doc.querySelectorAll('.modal2')).slice(-1)[0];
    if (!m || doc.querySelectorAll('.modal2').length === before) { check(label + ': modal opens', false, 'not opened'); return; }
    checkModal(label, m);
    const closeBtn = Array.from(m.querySelectorAll('button, .m-x')).find(b => /close|band/i.test(b.textContent || ''));
    if (closeBtn) { closeBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); await sleep(400); }
  }

  /* AI v2.10: modal nahi — dedicated AI Agent tab (openModal ab wahan navigate karta hai) */
  {
    const before = errors.length;
    win.AIConfig.openModal();
    await sleep(1200);
    check('ai ▸ openModal routes to AI Agent tab', win.App.current === 'ai', 'current=' + win.App.current);
    const view = doc.querySelector('#view');
    const tabsN = view ? view.querySelectorAll('.tabs.l1 .tab').length : 0;
    check('ai ▸ 4 tabs render', tabsN === 4, 'tabs=' + tabsN);
    check('ai ▸ renders without console errors', errors.length === before, errors.slice(before).join(' | ').slice(0, 120));
    /* provider cards + model select Setup tab par */
    const st = Array.from((view || doc).querySelectorAll('.tabs.l1 .tab')).find(x => /Setup/i.test(x.textContent || ''));
    if (st) { st.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); await sleep(500); }
    const cards = (doc.querySelector('#view') || doc).querySelectorAll('.ai-provc, .card').length;
    check('ai ▸ Setup shows provider choices', cards >= 5, 'cards=' + cards);
    win.App.go('settings'); await sleep(400);
  }
  await openModal('print ▸ template designer', async () => { win.Print2.designer('RECEIPT', null, () => { }); });
  await openModal('share ▸ outbox', async () => { win.Share.outbox(); });
  await openModal('migration ▸ dashboard', async () => { win.Migration2.open(); });
  await openModal('pricelist ▸ import', async () => { win.PriceList.open(); });
  await openModal('sales ▸ share invoice', async () => {
    const list = await win.API.call('sales.list', { pageSize: 1 });
    const first = (list.rows || [])[0];
    if (first) win.Share.invoice(first);
  });

  /* 4. koi orphan modal/offcanvas to nahi */
  const orphans = Array.from(doc.querySelectorAll('.modal2, .offcanvas'))
    .filter(el => !el.closest('.modal-scrim, .scrim') && !el.classList.contains('closing'));
  check('no orphan popup (modal/offcanvas without scrim)', orphans.length === 0,
    orphans.length + ' orphan(s)');
  check('no popup with left offset class', Array.from(doc.querySelectorAll('.offcanvas'))
    .every(el => !/left/.test(el.className) || cs(el).left === '0px'), 'left-offcanvas mis-anchored');

  console.log('\n==============================================================');
  console.log('ALIGNMENT CHECKS: ' + total.n + '   FAILED: ' + fails.length);
  console.log('==============================================================');
  if (fails.length) { console.log('\nFailures:'); fails.forEach(f => console.log(' - ' + f.slice(0, 200))); }
  process.exit(fails.length ? 1 : 0);
}

boot().catch(e => { console.error('ALIGN AUDIT CRASH:', e.message); process.exit(2); });
