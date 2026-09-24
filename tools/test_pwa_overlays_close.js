/**
 * tools/test_pwa_overlays_close.js — v2.25.3 (req 6) — MOBILE PWA overlays ka close sweep.
 *
 * Aap ki shikayat: "cancel button, close button not working in many popups, and modal windows."
 * Desktop app ka proof gate 54 (`modals-close`) hai. Mobile PWAs ALAG documents hain
 * (pwa-pos / pwa-sm / pwa-fo / pwa-wh) — unka koi close-proof nahi tha. Ye gate wahi karta hai:
 *
 *   Har overlay, ASLI trigger se khulta hai (scan / 📷 / ☑ long-press / cart button / pay flow) aur
 *   phir har closer alag alag test hota hai: ✕ · Escape · footer Cancel · backdrop (scrim).
 *
 * Saath hi design-system contract (aur v2.25.4 ka stacking rule):
 *   - ek Esc sirf TOP-MOST overlay band kare (neeche wala khula rahe) — cart drawer ke
 *     andar se "💳 Pay" kholne par dono layers open hoti hain; pehle ek Esc dono gira deta tha,
 *   - har overlay Esc se band hona chahiye (baaki app jaisa),
 *   - har overlay mein ✕ ya Cancel ka raasta ho.
 *
 *   Demo serve: python3 -m http.server 8021 -d demo
 *   node tools/test_pwa_overlays_close.js [baseUrl]
 */
'use strict';
const puppeteer = require('puppeteer');
const BASE = process.argv[2] || 'http://127.0.0.1:8021';
let pass = 0, fail = 0; const ERR = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
function ok(c, n, x) { if (c) { pass++; console.log('  ✔ ' + n); } else { fail++; const m = '  ✖ ' + n + (x ? ' — ' + x : ''); ERR.push(m); console.log(m); } }

/* ------------------------------- page-side helpers ------------------------------- */
const IS_OPEN = sel => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) return false;
  if (el.classList && el.classList.contains('pos-layer')) return el.classList.contains('open');
  return el.getClientRects().length > 0;
})()`;
/* ✕ dhoondte waqt SIRF close wala ✕ lena hai — cart line ka "✕ Remove" jaisa button nahi
   (warna test ghalti se line delete kar deta hai — yehi cheez pehle pay/receipt sweep tor rahi thi). */
const X_CAND = `(el) => [].slice.call(el.querySelectorAll('button')).filter(b => {
  const al = (b.getAttribute('aria-label') || '').trim().toLowerCase();
  const t = (b.textContent || '').trim();
  if (/remove|delete|clear|decrease|increase|cancel/i.test(al)) return false;
  if (al === 'close') return true;
  if (/^\u2715$/.test(t)) return true;
  return false;
})`;
const HAS_X = sel => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false;
  return (${X_CAND})(el).length > 0;
})()`;
const HAS_CANCEL = sel => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false;
  return [].slice.call(el.querySelectorAll('button')).some(b => /^cancel$/i.test((b.textContent || '').trim()));
})()`;
const HAS_SCRIM = sel => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false;
  if (el.querySelector('.pos-scrim, .oc-scrim, .scrim')) return true;
  return el.classList.contains('bulk-picker');   /* shared modal: backdrop = overlay khud */
})()`;
const CLICK_X = sel => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false;
  const bs = (${X_CAND})(el); if (!bs.length) return false;
  const head = bs.filter(b => b.closest('[class*=head]'))[0];   /* modal ka apna close */
  (head || bs[0]).click(); return true;
})()`;
const CLICK_CANCEL = sel => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false;
  const b = [].slice.call(el.querySelectorAll('button')).filter(x => /^cancel$/i.test((x.textContent || '').trim()))[0];
  if (!b) return false; b.click(); return true;
})()`;
const CLICK_SCRIM = sel => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false;
  const s = el.querySelector('.pos-scrim, .oc-scrim, .scrim');
  if (s) { s.click(); return true; }
  if (el.classList.contains('bulk-picker')) { el.click(); return true; }   /* target === overlay */
  return false;
})()`;

async function waitOpen(page, sel, ms) {
  try { await page.waitForFunction(IS_OPEN(sel), { timeout: ms || 8000, polling: 120 }); return true; } catch (e) { return false; }
}
async function waitClosed(page, sel, ms) {
  try { await page.waitForFunction('!(' + IS_OPEN(sel) + ')', { timeout: ms || 5000, polling: 120 }); return true; } catch (e) { return false; }
}
/* long-press (POS bulk button 520ms par khulta hai — asli user gesture) */
async function longPress(page, textRe) {
  const box = await page.evaluate(src => {
    const rx = new RegExp(src);
    const b = [].slice.call(document.querySelectorAll('button')).filter(x => x.getClientRects().length && rx.test((x.textContent || '').trim()))[0];
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, textRe);
  if (!box) return false;
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  await sleep(750);
  await page.mouse.up();
  return true;
}
async function clickText(page, textRe) {
  return page.evaluate(src => {
    const rx = new RegExp(src);
    const b = [].slice.call(document.querySelectorAll('button')).filter(x => x.getClientRects().length && rx.test((x.textContent || '').trim()))[0];
    if (!b) return false; b.click(); return true;
  }, textRe);
}

/* ------------------------------------ specs ------------------------------------ */
const OPEN_LAYERS = `(() => [].slice.call(document.querySelectorAll('.pos-layer'))
  .filter(l => l.classList.contains('open')).map(l => l.id))()`;

const POS = 'pwa-pos.html', SM = 'pwa-sm.html', FO = 'pwa-fo.html', WH = 'pwa-wh.html';
const SCAN_FALLBACK = { sel: '#scanFallbackOverlay', name: 'Scan fallback modal', closers: ['X', 'Esc', 'Scrim'] };
const BULK = { sel: '.bulk-picker', name: 'Bulk Add modal', closers: ['X', 'Esc', 'Cancel', 'Scrim'] };
const POS_CART = { sel: '#posCartLayer', name: 'Cart drawer', closers: ['X', 'Esc', 'Scrim'] };
const POS_PAY = { sel: '#posPayLayer', name: 'Pay sheet', closers: ['X', 'Esc', 'Cancel', 'Scrim'] };
const POS_RCPT = { sel: '#posReceiptLayer', name: 'Receipt layer', closers: ['X', 'Esc', 'Scrim'] };

async function sweep(page, spec, opener, label) {
  for (const how of spec.closers) {
    const opened = await opener();
    const isOpen = opened && await waitOpen(page, spec.sel, 8000);
    ok(isOpen, label + ' ▸ ' + spec.name + ' → khula (' + how + ' test ke liye)');
    if (!isOpen) return;
    if (how === 'X' || how === 'Cancel' || how === 'Scrim') {
      const hx = await page.evaluate(how === 'X' ? HAS_X(spec.sel) : (how === 'Cancel' ? HAS_CANCEL(spec.sel) : HAS_SCRIM(spec.sel)));
      ok(hx, label + ' ▸ ' + spec.name + ' → ' + how + ' ka raasta mojood');
      if (!hx) { await closeAny(page, spec); continue; }
    }
    if (how === 'Esc') { await page.bringToFront().catch(() => { }); await page.keyboard.press('Escape'); }
    else if (how === 'X') await page.evaluate(CLICK_X(spec.sel));
    else if (how === 'Cancel') await page.evaluate(CLICK_CANCEL(spec.sel));
    else await page.evaluate(CLICK_SCRIM(spec.sel));
    const closed = await waitClosed(page, spec.sel, 5000);
    ok(closed, label + ' ▸ ' + spec.name + ' → ' + how + ' se band hua', closed ? '' : 'abhi bhi khula');
    if (!closed) await closeAny(page, spec);
  }
}
async function closeAny(page, spec) {
  await page.evaluate(CLICK_X(spec.sel));
  await sleep(250);
  if (await page.evaluate(IS_OPEN(spec.sel))) { await page.keyboard.press('Escape'); await sleep(300); }
  if (await page.evaluate(IS_OPEN(spec.sel))) {
    await page.evaluate(s => { const el = document.querySelector(s); if (el) el.remove(); }, spec.sel);
    await sleep(200);
  }
}

/* --------------------------- STATIC contract (code) --------------------------- */
const FILE = rel => require('fs').readFileSync(require('path').join(__dirname, '..', rel), 'utf8');

(async () => {
  console.log('\n\x1b[1mPWA OVERLAYS — close/cancel sweep (✕ · Esc · Cancel · backdrop)\x1b[0m\n');
  const shell = FILE('apps-script/Pwa_Shell.html');
  const posSrc = FILE('apps-script/Pwa_POS.html');
  const onEscN = (shell.match(/function onEsc\(/g) || []).length;
  const guardN = (shell.match(/!document\.body\.contains\(/g) || []).length;
  ok(onEscN === 3 && guardN >= 3,
    'shared shell ke teenon overlays (camera · scan-fallback · bulk-picker) Esc par STALE guard rakhte hain',
    'onEsc=' + onEscN + ' guards=' + guardN);
  ok(/showScanFallback\._close\s*=\s*close/.test(shell) && /typeof showScanFallback\._close/.test(shell),
    'scan-fallback ka duplicate path purane overlay ka proper close() chalata hai (listener leak band)',
    'ref=' + (/showScanFallback\._close\s*=\s*close/.test(shell) ? 'set' : 'missing'));
  const syncN = (posSrc.match(/posSyncScrollLock\(\)/g) || []).length;
  ok(/function posSyncScrollLock/.test(posSrc) && syncN >= 3,
    'POS PWA: har layer ka close() scroll-lock ko layers ke sath sync karta hai (stacked case)',
    'calls=' + syncN);

  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    for (const pg of [POS, SM, FO, WH]) {
      const page = await browser.newPage();
      const errs = [];
      page.on('pageerror', e => errs.push(String(e && e.message).slice(0, 80)));
      await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
      await page.goto(BASE + '/' + pg, { waitUntil: 'networkidle2', timeout: 45000 });
      await sleep(2200);
      const boot = await page.evaluate(() => !!(window.PWA && PWA.data && (PWA.data.items || []).length));
      ok(boot, pg + ' — boot ho gaya (PWA data load)');
      if (!boot) { await page.close(); continue; }

      /* ---- 1) scan ke baad wale flows: POS mein cart → pay → receipt ---- */
      if (pg === POS) {
        const code = await page.evaluate(() => (PWA.data.items[0] || {}).code || '');
        const typed = await page.evaluate(() => {
          const i = [].slice.call(document.querySelectorAll('input')).filter(x => /scan/i.test(x.placeholder || ''))[0];
          if (!i) return false; i.id = i.id || 'pwaScanProbe'; return true;
        });
        /* credit row ke liye customer zaroori hai — app ka apna customer field use karein */
        const cust = await page.evaluate(() => {
          const c = (PWA.data && PWA.data.customers) || [];
          const f = [].slice.call(document.querySelectorAll('input')).filter(x => /customer|walk-in|search name/i.test((x.placeholder || '') + (x.getAttribute('aria-label') || '')))[0];
          if (!f || !c.length) return 'no-field';
          f.focus(); f.value = c[0].name || c[0].phone || '';
          f.dispatchEvent(new Event('input', { bubbles: true }));
          return (c[0].name || c[0].phone || '');
        });
        ok(!!cust && cust !== 'no-field', pg + ' — customer field bhara (credit/pay flow ke liye)', String(cust));
        await sleep(900);
        ok(typed && !!code, pg + ' — scan input mila (POS PWA)', String(code));
        if (typed && code) {
          await page.click('#pwaScanProbe');
          for (const ch of code) await page.keyboard.type(ch, { delay: 6 });
          await page.keyboard.press('Enter');
          await sleep(1000);
        }
        const badge = await page.evaluate(() => ((document.getElementById('posCartBadge') || {}).textContent || '').trim());
        ok(/[1-9]/.test(badge), pg + ' — scan se cart mein item chala gaya (payment flow ke liye zaroori)', 'badge=' + badge);
      } else {
        /* Salesman mein Sell tab khol kar scan/bulk buttons samne aate hain */
        if (pg === SM) { await clickText(page, 'Sell'); await sleep(1300); }
      }

      /* ---- 2) overlays ---- */
      const scanOpen = async () => {
        const clicked = await clickText(page, '📷');
        await sleep(500);
        return clicked;
      };
      await sweep(page, SCAN_FALLBACK, scanOpen, pg);

      const bulkOpen = async () => {
        if (pg === POS) {
          /* 1) POS ka asli long-press path (mousedown -> 520ms -> modal), seedha usi button par */
          const pressed = await page.evaluate(() => {
            const b = [].slice.call(document.querySelectorAll('button')).filter(x => /☑|☒/.test((x.textContent || '').trim()))[0];
            if (!b) return false;
            b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            return true;
          });
          if (pressed) {
            await sleep(760);
            await page.evaluate(() => {
              const b = [].slice.call(document.querySelectorAll('button')).filter(x => /☑|☒/.test((x.textContent || '').trim()))[0];
              if (b) b.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            });
            await sleep(600);
          }
          if (await page.evaluate(IS_OPEN('.bulk-picker'))) return 'long-press';
          /* 2) fallback: bulk mode ON -> "Modal" button */
          await page.evaluate(() => {
            const b = [].slice.call(document.querySelectorAll('button')).filter(x => /☑/.test((x.textContent || '').trim()))[0];
            if (b) b.click();
          });
          await sleep(600);
          await clickText(page, 'Modal');
          await sleep(600);
          return await page.evaluate(IS_OPEN('.bulk-picker')) ? 'modal-button' : false;
        }
        const clicked = await clickText(page, '☑|Bulk');
        await sleep(400);
        return clicked;
      };
      await sweep(page, BULK, bulkOpen, pg);

      if (pg === POS) {
        await sweep(page, POS_CART, async () => {
          return page.evaluate(() => { if (window.PosCart) { PosCart.open(); return true; } return false; });
        }, pg);
        await sweep(page, POS_PAY, async () => {
          return page.evaluate(() => { if (window.PaySheet) { PaySheet.open(); return true; } return false; });
        }, pg);
        await sweep(page, POS_RCPT, async () => {
          /* receipt = sale ke BAAD ka overlay — asli flow dobara chalana parta hai
             (scan → pay sheet → Exact → Complete). Isi liye har iteration mein naya item. */
          await page.evaluate(() => {
            const i = [].slice.call(document.querySelectorAll('input')).filter(x => /scan/i.test(x.placeholder || ''))[0];
            if (i) i.id = 'pwaScanProbe';
          });
          const code2 = await page.evaluate(() => (PWA.data.items[0] || {}).code || '');
          await page.click('#pwaScanProbe');
          for (const ch of code2) await page.keyboard.type(ch, { delay: 6 });
          await page.keyboard.press('Enter');
          await sleep(900);
          const o = await page.evaluate(() => { if (window.PaySheet) { PaySheet.open(); return true; } return false; });
          if (!o) return false;
          await sleep(900);
          await clickText(page, 'Exact');
          await sleep(600);
          const done = await page.evaluate(() => {
            const b = document.getElementById('payConfirmBtn');
            if (!b) return false; b.click(); return true;
          });
          await sleep(2600);
          return done;
        }, pg);

        /* ---- STACKING: asli flow mein cart + pay dono khuli hoti hain ----
           Desktop app ka contract: ek Esc = sirf TOP-MOST overlay (neeche wala khula rehta hai).
           Pehle ek Esc dono band kar deta tha → poora cart gayab (v2.25.4 fix). */
        const hasItem = await page.evaluate(() => Number((((document.getElementById('posCartBadge') || {}).textContent) || '0').replace(/\D+/g, '') || 0) > 0);
        if (!hasItem) {
          await page.evaluate(() => {
            const i = [].slice.call(document.querySelectorAll('input')).filter(x => /scan/i.test(x.placeholder || ''))[0];
            if (i) i.id = 'pwaScanProbe';
          });
          const c2 = await page.evaluate(() => (PWA.data.items[0] || {}).code || '');
          await page.click('#pwaScanProbe');
          for (const ch of c2) await page.keyboard.type(ch, { delay: 6 });
          await page.keyboard.press('Enter');
          await sleep(900);
        }
        await page.evaluate(() => { if (window.PosCart) PosCart.open(); });
        await sleep(800);
        await page.evaluate(() => {
          const b = [].slice.call(document.querySelectorAll('#posCartLayer button')).filter(x => /Pay/i.test(x.textContent || ''))[0];
          if (b) b.click();
        });
        await sleep(1100);
        const bothOpen = await page.evaluate(OPEN_LAYERS);
        ok(bothOpen.indexOf('posCartLayer') > -1 && bothOpen.indexOf('posPayLayer') > -1,
          pg + ' — asli flow: 💳 Pay cart ke andar se → cart + pay DONO layers khuli', JSON.stringify(bothOpen));
        await page.bringToFront().catch(() => { });
        await page.keyboard.press('Escape'); await sleep(800);
        const afterOne = await page.evaluate(OPEN_LAYERS);
        ok(afterOne.length === 1 && afterOne[0] === 'posCartLayer',
          pg + ' — ek Esc sirf TOP-MOST (pay) band karta hai; cart khula rehta hai (stacking contract)', JSON.stringify(afterOne));
        await page.keyboard.press('Escape'); await sleep(800);
        const afterTwo = await page.evaluate(OPEN_LAYERS);
        ok(afterTwo.length === 0, pg + ' — doosra Esc cart band karta hai (dono baari baari band)', JSON.stringify(afterTwo));
        /* pay ka footer Cancel bhi sirf apni layer band kare (cart na gire) */
        await page.evaluate(() => {
          if (window.PosCart) PosCart.open();
        });
        await sleep(700);
        await page.evaluate(() => {
          if (window.PaySheet) PaySheet.open();
        });
        await sleep(900);
        const cancelDid = await page.evaluate(() => {
          const b = [].slice.call(document.querySelectorAll('#posPayLayer button')).filter(x => /^cancel$/i.test((x.textContent || '').trim()))[0];
          if (!b) return false; b.click(); return true;
        });
        await sleep(800);
        const afterCancel = await page.evaluate(OPEN_LAYERS);
        ok(cancelDid && afterCancel.length === 1 && afterCancel[0] === 'posCartLayer',
          pg + ' — pay ka footer Cancel sirf pay band karta hai (cart bacha rehta hai)', JSON.stringify(afterCancel));
        await page.evaluate(() => { if (window.PosCart) PosCart.close(); });
        await sleep(400);

        /* ---- STALE-NODE LEAK (v2.25.6) — do asli leak paths ----
           1) 📷 do bar: pehla fallback overlay direct DOM remove hota tha (bina close())
              → uska capture-phase Esc listener document par leak → pehla Esc nigal jata tha.
           2) Koi overlay DOM se bahar nikal jaye (kisi aur path se) to bhi Esc na rukna chahiye. */
        const fbSel = '#scanFallbackOverlay';
        await clickText(page, '📷');
        await waitOpen(page, fbSel, 6000);
        await clickText(page, '📷');            /* dobara — guard path */
        await sleep(900);
        const oneFb = await page.evaluate(s2 => document.querySelectorAll(s2).length, fbSel);
        ok(oneFb === 1, '📷 do bar tap: sirf EK scan-fallback overlay (purana saaf hua)', 'count=' + oneFb);
        await page.evaluate(CLICK_X(fbSel));
        await waitClosed(page, fbSel, 4000);
        /* ab leaked listener ka asar: cart + pay khol kar EK Esc — pay band hona chahiye */
        await page.evaluate(() => { if (window.PosCart) PosCart.open(); });
        await sleep(700);
        await page.evaluate(() => {
          const b = [].slice.call(document.querySelectorAll('#posCartLayer button')).filter(x => /Pay/i.test(x.textContent || ''))[0];
          if (b) b.click();
        });
        await sleep(1000);
        await page.bringToFront().catch(() => { });
        await page.keyboard.press('Escape');
        await sleep(900);
        const afterLeakEsc = await page.evaluate(OPEN_LAYERS);
        ok(afterLeakEsc.length === 1 && afterLeakEsc[0] === 'posCartLayer',
          'purane fallback ka leaked listener Esc ko nigalta nahi (v2.25.6 stale-guard)', JSON.stringify(afterLeakEsc));
        await page.evaluate(() => { if (window.PosCart) PosCart.close(); });
        await sleep(400);

        /* detached (stale) overlay ka leaked listener:
           (a) koi aur overlay khula ho to us ka scroll-lock reset na kare
           (b) Esc top-most ko band kare, layer state consistent rahe */
        const bulkOpened2 = await bulkOpen();
        await sleep(600);
        if (bulkOpened2) {
          await page.evaluate(() => { const el = document.querySelector('.bulk-picker'); if (el) el.remove(); });
          await sleep(400);
          await page.evaluate(() => { if (window.PosCart) PosCart.open(); });
          await sleep(700);
          await page.evaluate(() => {
            const b = [].slice.call(document.querySelectorAll('#posCartLayer button')).filter(x => /Pay/i.test(x.textContent || ''))[0];
            if (b) b.click();
          });
          await sleep(1000);
          const beforeEsc = await page.evaluate(() => ({
            layers: [].slice.call(document.querySelectorAll('.pos-layer')).filter(l => l.classList.contains('open')).map(l => l.id),
            lock: document.body.style.overflow
          }));
          await page.bringToFront().catch(() => { });
          await page.keyboard.press('Escape');
          await sleep(900);
          const afterEsc2 = await page.evaluate(() => ({
            layers: [].slice.call(document.querySelectorAll('.pos-layer')).filter(l => l.classList.contains('open')).map(l => l.id),
            lock: document.body.style.overflow
          }));
          ok(afterEsc2.layers.length === 1 && afterEsc2.layers[0] === 'posCartLayer' && afterEsc2.lock === 'hidden',
            'stale overlay ka leaked listener: Esc top-most (pay) band karta hai AUR bachi hui layer ka scroll-lock reset nahi hota',
            JSON.stringify({ before: beforeEsc, after: afterEsc2 }));
          await page.evaluate(() => { if (window.PosCart) PosCart.close(); });
          await sleep(400);
        } else {
          ok(false, 'bulk modal khula (stale-node check ke liye)', 'open=false');
        }
      }

      ok(errs.length === 0, pg + ' — zero page errors', JSON.stringify(errs).slice(0, 200));
      await page.close();
    }
  } finally {
    await browser.close();
  }
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  PWA OVERLAYS CLOSE   PASS: ' + pass + '   FAIL: ' + fail);
  if (fail) ERR.forEach(e => console.log('  ' + e));
  console.log('═══════════════════════════════════════════════════════════');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('✖ FATAL ' + (e && e.stack || e)); process.exit(2); });
