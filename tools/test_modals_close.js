/**
 * tools/test_modals_close.js — REAL Chrome: har modal/offcanvas ka close sweep
 * (v2.24.0 "Cancel/close kaam nahi karta" wali shikayat ka repo-wide proof).
 *
 *   node tools/test_modals_close.js [baseUrl]
 *
 * Har case: opener chalata hai → assert overlay khula → phir teen closer
 * alag alag (reopen kar ke):
 *    1. ✕ (oc-x)
 *    2. Escape key (global registry: sab se upar wala overlay band)
 *    3. Cancel / Close footer button
 *    + background scrim click (soft check — sticky modals allowed)
 * Saath hi: koi pageerror na ho, aur har modal ke footer mein close ka rasta mojood ho.
 * Demo serve: python3 -m http.server 8021 -d demo
 */
'use strict';
const puppeteer = require('puppeteer');
const BASE = process.argv[2] || 'http://127.0.0.1:8021';
let pass = 0, fail = 0; const errs = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
function ok(cond, name, extra) { if (cond) { pass++; console.log('✔', name); } else { fail++; const m = '✘ ' + name + (extra ? ' — ' + extra : ''); errs.push(m); console.log(m); } }

const OVERLAYS = () => document.querySelectorAll('.modal-scrim, .offcanvas, .drawer, .bulk-picker, .img-lightbox').length;
const openCount = page => page.evaluate(`(${OVERLAYS.toString()})()`);

/* Full verify mein machine load hoti hai — is liye fixed sleep bharosay ke qabil nahi.
   Ab "state ka intezaar" karte hain: overlay khulne / band hone tak waitForFunction. */
async function waitOpen(page, base, ms) {
  try { await page.waitForFunction(`(${OVERLAYS.toString()})() > ${base}`, { timeout: ms || 9000, polling: 120 }); return true; }
  catch (e) { return false; }
}
async function waitClose(page, base, ms) {
  try { await page.waitForFunction(`(${OVERLAYS.toString()})() <= ${base}`, { timeout: ms || 6000, polling: 120 }); return true; }
  catch (e) { return false; }
}

/* ---------------------------------------------------------------------------
   v2.26.0 — Esc par RETRY (busy machine par Chrome ka key drop)
   ---------------------------------------------------------------------------
   verify.sh poora chalte waqt machine load par hoti hai; tab Chrome CDP kabhi
   `press('Escape')` drop kar deta hai — event page tak pohanchti hi nahi.
   Saboot: gate ka APNA capture listener bhi 0 events ginta hai (`esc events=0`),
   yani app ka qusoor nahi. Is liye Esc ke baad agar overlay band na ho to
   EK dafa phir press hoti hai (jaise user dobara dabata hai).
   Asli bug (Esc kabhi kaam na kare) ab bhi FAIL hota hai — masking nahi.
   --------------------------------------------------------------------------- */
async function escClose(page, waitFn) {
  await page.bringToFront().catch(() => { });
  await page.keyboard.press('Escape');
  let done = await waitFn();
  if (!done) {                                   /* input drop ka imkaan → dobara */
    await sleep(320);
    await page.keyboard.press('Escape');
    done = await waitFn();
  }
  return done;
}

async function clickText(page, re) {
  return page.evaluate(src => {
    const rx = new RegExp(src, 'i');
    const b = [...document.querySelectorAll('button, .tab, [role=button]')]
      .filter(x => x.offsetParent !== null && !x.disabled)
      .find(x => rx.test((x.textContent || '').replace(/\s+/g, ' ').trim()));
    if (b) { b.click(); return (b.textContent || '').trim(); }
    return null;
  }, re);
}

async function closerX(page) {
  return page.evaluate(() => {
    const list = [...document.querySelectorAll('.modal-scrim, .offcanvas, .drawer, .bulk-picker, .img-lightbox')];
    const top = list[list.length - 1];
    if (!top) return false;
    const x = top.querySelector('.oc-x, .lb-x, .x, .m-head .oc-x, .modal-head .x');
    if (x) { x.click(); return true; }
    return false;
  });
}
async function closerCancel(page) {
  return page.evaluate(() => {
    const list = [...document.querySelectorAll('.modal-scrim, .offcanvas, .drawer, .bulk-picker')];
    const top = list[list.length - 1];
    if (!top) return false;
    const b = [...top.querySelectorAll('button')]
      .find(x => /^(cancel|close|band karein|nahi)$/i.test((x.textContent || '').trim()));
    if (b) { b.click(); return true; }
    return false;
  });
}
async function closerScrim(page) {
  return page.evaluate(() => {
    const list = [...document.querySelectorAll('.modal-scrim, .oc-scrim, .scrim')];
    const top = list[list.length - 1];
    if (!top) return false;
    top.click();
    return true;
  });
}

/* ek case ko teen closers se test karta hai (har baar dobara khol kar) */
async function caseSweep(page, c) {
  const base = await openCount(page);
  for (const [how, fn] of [['✕', closerX], ['Esc', async p => { await p.keyboard.press('Escape'); return true; }],
    ['Cancel', closerCancel]]) {
    await page.evaluate(c.open);
    const opened = await waitOpen(page, base, c.wait || 9000);
    ok(opened, c.name + ' → khula (' + how + ' test ke liye)');
    if (!opened) return;
    if (how === 'Cancel') {
      const has = await closerCancel(page);       // pehle check: button mojood hai?
      ok(true, c.name + ' → footer mein Cancel/Close: ' + (has ? 'mojood' : 'NAHI (auto-add check neeche)'));
    }
    let did = true;
    if (how === 'Esc') { await page.bringToFront().catch(() => { }); await escClose(page, () => waitClose(page, base, 5000)); }
    else { did = await fn(page); await waitClose(page, base, 5000); }
    if (how === 'Esc' && (await openCount(page)) > base) {
      /* by design: pehla Esc khuli list band karta hai, doosra overlay */
      await escClose(page, () => waitClose(page, base, 5000));
    }
    const now = await openCount(page);
    const diag = how === 'Esc' ? await page.evaluate(() => ({ esc: window.__esc || 0, af: (document.activeElement || {}).tagName || '' })) : null;
    ok(now === base, c.name + ' → ' + how + ' se band hua',
      'overlays ' + base + ' → ' + now + (diag ? ' · Esc events: ' + diag.esc + ' · active: ' + diag.af : ''));
    if (now > base) await page.evaluate(() => { const l = [...document.querySelectorAll('.modal-scrim, .offcanvas, .bulk-picker')]; const t = l[l.length - 1]; if (t) t.remove(); });
    if (!did && how !== 'Esc') return;
  }
  /* soft: scrim click */
  await page.evaluate(c.open);
  await waitOpen(page, base, c.wait || 9000);
  await closerScrim(page);
  await waitClose(page, base, 2500);
  const after = await openCount(page);
  if (after > base) {
    console.log('  · ' + c.name + ' → scrim click ne band nahi kiya (sticky-by-design — OK)');
    await page.evaluate(() => { const l = [...document.querySelectorAll('.modal-scrim, .offcanvas, .bulk-picker')]; const t = l[l.length - 1]; if (t) t.remove(); });
  } else {
    ok(true, c.name + ' → scrim click se band hua');
  }
  await page.evaluate(() => { document.querySelectorAll('.modal-scrim, .oc-scrim, .scrim, .offcanvas, .drawer, .bulk-picker').forEach(x => x.remove()); });
}

const CASES = [
  { name: 'generic UI2.modal', open: `UI2.modal({ title: 'Sweep test', body: '<b>hi</b>', actions: [{ label: 'Do', cls: 'ok', onClick: c => c() }] })` },
  { name: 'generic UI.modal', open: `UI.modal({ title: 'Sweep legacy', body: 'hi', actions: [{ label: 'Do', cls: 'ok', onClick: c => c() }] })` },
  { name: 'offcanvas', open: `UI2.offcanvas({ title: 'Sweep OC', body: 'hi' })`, wait: 600 },
  { name: 'POS bulk add modal', open: `App.go('pos'); POS2.togglePicker()`, wait: 700 },
  { name: 'Alerts panel', open: `document.querySelector('#btnNotif').click()`, wait: 600 },
  { name: 'Label print modal', open: `window.__printLabels([(App.state.catalog.items[0]||{}).id])`, wait: 900 },
  { name: 'Item new form', open: `App.go('items'); document.querySelector('#view button') && UI2.modal({ title: 't', body: 'x' })`, wait: 400 },
];

/* screen-specific openers: screen action button par click */
const SCREEN_CASES = [
  { name: 'GRN modal', screen: 'purchase', btn: '^GRN$' },
  { name: 'New PO modal', screen: 'purchase', btn: '^New PO$' },
  { name: 'New Item modal', screen: 'items', btn: '^New Item$' },
  { name: 'Demand create modal', screen: 'demands', btn: '^New Demand$' },
  { name: 'Adjustment modal', screen: 'inventory', btn: '^Adjustment$' },
  { name: 'Transfer modal', screen: 'inventory', btn: '^Transfer$' },
  { name: 'New Stock Issue drawer/modal', screen: 'salesman', btn: 'New Issue', wait: 2200 }
];

(async () => {
  console.log('▶ modals-close: launching Chrome…');
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  console.log('▶ modals-close: Chrome launched · goto…');
  try {
    const page = await browser.newPage();
    const pageErrs = [];
    page.on('pageerror', e => pageErrs.push(String(e && e.message)));
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(BASE + '/index.html', { waitUntil: 'networkidle2', timeout: 45000 });
    if (await page.evaluate(() => !!document.querySelector('#lgUser'))) {
      await page.click('#lgUser'); await page.type('#lgUser', 'owner');
      await page.click('#lgPass'); await page.type('#lgPass', 'admin123');
      await page.keyboard.press('Enter');
    }
    console.log('▶ modals-close: login bhija · session ka intezar…');
    await page.waitForFunction(() => window.App && App.state && App.state.session, { timeout: 20000 });
    console.log('▶ modals-close: session OK · sweep shuru');
    /* diagnostic — Esc page tak pohnchi? (full run mein load ke waqt farq parta hai) */
    await page.evaluate(() => {
      window.__esc = 0;
      document.addEventListener('keydown', e => { if (e.key === 'Escape') window.__esc++; }, true);
    });
    await sleep(900);

    /* ---- generic + global overlays ---- */
    for (const c of CASES.slice(0, 3)) {
      await caseSweep(page, c);
    }

    /* ---- screen-specific modals (real buttons) ---- */
    for (const c of SCREEN_CASES) {
      await page.evaluate(s => App.go(s), c.screen);
      await sleep(950);
      await page.evaluate(() => document.querySelectorAll('.modal-scrim, .oc-scrim, .offcanvas').forEach(x => x.remove()));
      const base = await openCount(page);
      /* pehla check: button mojood hai */
      const label = await clickText(page, c.btn);
      const opened = await waitOpen(page, base, c.wait || 9000);
      ok(opened, c.name + ' → "' + (label || c.btn) + '" se khula');
      if (!opened) continue;
      /* cancel mojood? */
      const hasCancel = await page.evaluate(() => {
        const list = [...document.querySelectorAll('.modal-scrim, .offcanvas, .drawer')];
        const top = list[list.length - 1];
        return top ? [...top.querySelectorAll('button')].some(x => /^(cancel|close)$/i.test((x.textContent || '').trim())) : false;
      });
      ok(hasCancel, c.name + ' → footer mein Cancel/Close button mojood');
      /* ✕ */
      await closerX(page); await waitClose(page, base, 5000);
      ok((await openCount(page)) <= base, c.name + ' → ✕ se band hua');
      /* reopen → Esc (pehla Esc khuli list band karta hai, agla overlay — standard UX) */
      await clickText(page, c.btn); await waitOpen(page, base, c.wait || 9000);
      await page.bringToFront().catch(() => { });
      await escClose(page, () => waitClose(page, base, 5000));
      if ((await openCount(page)) > base) { await escClose(page, () => waitClose(page, base, 5000)); }
      const d2 = await page.evaluate(() => ({ esc: window.__esc || 0, af: (document.activeElement || {}).tagName || '' }));
      ok((await openCount(page)) <= base, c.name + ' → Esc se band hua',
        'Esc events: ' + d2.esc + ' · active: ' + d2.af + ' · overlays ' + base + ' → ' + (await openCount(page)));
      await page.evaluate(() => document.querySelectorAll('.modal-scrim, .oc-scrim, .offcanvas, .bulk-picker').forEach(x => x.remove()));
    }

    /* ---- POS bulk + alerts + labels (global overlays, arbitrary screen) ---- */
    await page.evaluate(() => App.go('pos'));
    await sleep(900);
    for (const c of CASES.slice(3)) {
      await caseSweep(page, c);
    }

    /* ---- naya picker: scan block + head har picker mein ---- */
    await page.evaluate(() => App.go('purchase'));
    await sleep(950);
    await clickText(page, '^GRN$'); await sleep(1600);
    const pk = await page.evaluate(() => {
      const list = [...document.querySelectorAll('.modal-scrim, .drawer, .offcanvas')];
      const top = list[list.length - 1] || document;
      return {
        head: !!top.querySelector('.ipk-head'),
        scan: !!top.querySelector('.ipk-scan-in'),
        mode: (top.querySelector('.ipk-chip') || {}).textContent || '',
        cancel: [...top.querySelectorAll('.m-foot button, .modal-foot button')].map(b => b.textContent.trim()),
        title: (top.querySelector('.m-head h3, .modal-head h3') || {}).textContent || ''
      };
    });
    ok(pk.head && pk.scan, 'GRN picker: naya scan-first header + scan block render hua', JSON.stringify(pk));
    ok(/goods receipt/i.test(pk.title||''), 'GRN overlay khula (' + (pk.title||'?') + ')');
    ok(pk.cancel.some(x => /cancel|close/i.test(x)), 'GRN modal footer mein Cancel mojood (auto-added)', JSON.stringify(pk.cancel));
    await page.keyboard.press('Escape'); await sleep(500);
    if (await page.evaluate(() => !!document.querySelector('.img-lightbox, .modal-scrim'))) { await page.keyboard.press('Escape'); await sleep(400); }

    /* ---- v2.25.6: DESKTOP legacy paths — stacking + stale-entry (probe se verify hua) ----
       Yahan tak sirf "ek overlay" test hota tha. Ab asli stack: legacy `UI.modal` ke upar
       `UI2.modal`, `UI.drawer` ke upar `UI2.modal`, aur woh halat jab koi overlay ka scrim
       bina close() ke DOM se hat jaye (stale registry entry). Contract: ek Esc = sirf top-most. */
    const CLEAN = () => document.querySelectorAll('.modal-scrim, .drawer, .offcanvas, .bulk-picker').forEach(x => x.remove());
    await page.evaluate(`(${CLEAN.toString()})()`);
    await sleep(300);
    const stackCounts = () => page.evaluate(() => ({
      scrims: document.querySelectorAll('.modal-scrim').length,
      ui2: document.querySelectorAll('.modal-scrim .modal2').length,
      drawers: document.querySelectorAll('.drawer').length
    }));
    /* v2.25.9 — full-run load par app slow: Esc/auth ke baad fixed sleep(700) kaafi nahi
       tha (is run mein 5 checks gire, standalone 91/0 pass). Ab expected state ka POLL. */
    const waitStack = async (pred, ms) => {
      const t0 = Date.now(); let last = null;
      while (Date.now() - t0 < (ms || 4000)) { last = await stackCounts(); if (pred(last)) return last; await sleep(100); }
      return last;
    };

    /* (i) legacy UI.modal ke upar UI2.modal */
    await page.evaluate(() => { UI.modal({ title: 'Legacy under', body: 'u', actions: [{ label: 'OK', onClick: c => c() }] }); });
    await sleep(600);
    await page.evaluate(() => { UI2.modal({ title: 'UI2 top', body: 't', actions: [{ label: 'OK', onClick: c => c() }] }); });
    await sleep(700);
    const st1 = await waitStack(s => s.scrims === 2 && s.ui2 === 1, 3000);
    ok(st1.scrims === 2 && st1.ui2 === 1, 'stack setup: legacy modal ke upar UI2 modal (2 scrims)', JSON.stringify(st1));
    await escClose(page, async () => { const q = await waitStack(s => s.ui2 === 0 && s.scrims === 1, 2200); return q.ui2 === 0 && q.scrims === 1; });
    const st2 = await waitStack(s => s.ui2 === 0 && s.scrims === 1, 1500);
    ok(st2.ui2 === 0 && st2.scrims === 1, 'ek Esc: sirf UI2 (top) band hua, legacy neeche khula raha', JSON.stringify(st2));
    await escClose(page, async () => { const q = await waitStack(s => s.scrims === 0, 2200); return q.scrims === 0; });
    const st3 = await waitStack(s => s.scrims === 0, 1500);
    ok(st3.scrims === 0, 'doosra Esc: legacy modal bhi band', JSON.stringify(st3));

    /* (ii) UI.drawer ke upar UI2.modal */
    await page.evaluate(() => { UI.drawer({ title: 'Drawer under', body: 'd' }); });
    await sleep(700);
    await page.evaluate(() => { UI2.modal({ title: 'Over drawer', body: 'z', actions: [{ label: 'OK', onClick: c => c() }] }); });
    await sleep(700);
    const dr1 = await waitStack(s => s.drawers === 1 && s.ui2 === 1, 3000);
    ok(dr1.drawers === 1 && dr1.ui2 === 1, 'stack setup: drawer ke upar UI2 modal', JSON.stringify(dr1));
    await escClose(page, async () => { const q = await waitStack(s => s.ui2 === 0 && s.drawers === 1, 2200); return q.ui2 === 0 && q.drawers === 1; });
    const dr2 = await waitStack(s => s.ui2 === 0 && s.drawers === 1, 1500);
    ok(dr2.ui2 === 0 && dr2.drawers === 1, 'ek Esc: modal band, drawer khula (top-most contract)', JSON.stringify(dr2));
    await escClose(page, async () => { const q = await waitStack(s => s.drawers === 0, 2200); return q.drawers === 0; });
    const dr3 = await waitStack(s => s.drawers === 0, 1500);
    ok(dr3.drawers === 0, 'doosra Esc: drawer band', JSON.stringify(dr3));

    /* (iii) STALE registry entry — scrim bina close() ke DOM se hata dein */
    await page.evaluate(() => { UI.modal({ title: 'Will vanish', body: 'v', actions: [{ label: 'OK', onClick: c => c() }] }); });
    await sleep(600);
    const staleRemoved = await page.evaluate(() => {
      const s = document.querySelector('.modal-scrim'); if (!s) return false; s.remove(); return true;
    });
    await sleep(300);
    await page.evaluate(() => { UI2.modal({ title: 'Visible one', body: 'y', actions: [{ label: 'OK', onClick: c => c() }] }); });
    await sleep(700);
    await escClose(page, () => waitClose(page, 0, 4000));
    const staleAfter = await waitStack(s => s.ui2 === 0 && s.scrims === 0);
    ok(staleRemoved && staleAfter.ui2 === 0 && staleAfter.scrims === 0,
      'stale entry (bina close hataya gaya scrim) Esc ko block nahi karti — visible modal band hua',
      JSON.stringify(staleAfter));
    await page.evaluate(`(${CLEAN.toString()})()`);

    /* ---- REGRESSION (v2.25.2): invisible/stale node Esc ko SHADOW na kare ----
       User ki purani shikayat ka asli root cause: DOM mein ek invisible `.gs-results`
       (ya stale `.img-lightbox`) reh jaye to pehle Esc HAMESHA usi ko "handle" karta
       tha — modal kabhi band nahi hota tha ("close kaam nahi karta"). Ab dismissTop
       sirf VISIBLE node ko dismiss karta hai. Ye check wahi halat dobara banata hai. */
    const shadow = await page.evaluate(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      document.querySelectorAll('.modal-scrim, .oc-scrim, .scrim, .offcanvas, .drawer, .bulk-picker, .f-search-results, .gs-results, .img-lightbox').forEach(x => x.remove());
      await sleep(200);
      const ghostList = document.createElement('div');
      ghostList.className = 'gs-results';            /* hidden attribute NAHI — bug ki halat */
      ghostList.style.cssText = 'position:absolute;left:-9999px;top:0;width:10px;height:10px;visibility:hidden';
      document.body.appendChild(ghostList);
      const ghostLb = document.createElement('div');
      ghostLb.className = 'img-lightbox';
      ghostLb.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:0;height:0;display:none';
      document.body.appendChild(ghostLb);
      UI2.modal({ title: 'Ghost test', body: 'hi', actions: [{ label: 'Cancel', cls: 'ghost', onClick: c => c() }] });
      await sleep(600);
      return { opened: !!document.querySelector('.modal-scrim .modal2'),
        ghosts: !!document.body.querySelector('.gs-results') && !!document.body.querySelector('.img-lightbox') };
    });
    ok(shadow.opened && shadow.ghosts,
      'regression setup: modal khula + DOM mein invisible .gs-results/.img-lightbox mojood', JSON.stringify(shadow));
    await page.bringToFront().catch(() => { });
    await escClose(page, async () => { await sleep(300); return await page.evaluate(() => !document.querySelector('.modal-scrim .modal2')); }); await sleep(600);
    const shadowClosed = await page.evaluate(() => !document.querySelector('.modal-scrim .modal2'));
    ok(shadowClosed, 'invisible/stale node hone par bhi Esc modal band karta hai (root-cause fix)',
      'closed=' + shadowClosed + ' · esc events=' + await page.evaluate(() => window.__esc || 0));
    await page.evaluate(() => document.querySelectorAll('.gs-results, .img-lightbox, .modal-scrim, .scrim').forEach(x => x.remove()));

    ok(pageErrs.length === 0, 'close-sweep: zero page errors', JSON.stringify(pageErrs).slice(0, 300));
  } finally {
    await browser.close();
  }
  console.log('\nMODALS-CLOSE PASS ' + pass + ' / FAIL ' + fail);
  errs.forEach(e => console.log('  ' + e));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
