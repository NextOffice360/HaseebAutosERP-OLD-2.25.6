#!/usr/bin/env node
/* ==========================================================================
   test_w9_help.js — v2.30.3 · W9 gate (HELP LINKS + CONFIRM SWEEP + TOOLTIPS)
   --------------------------------------------------------------------------
   Spec (MASTER-REQUIREMENTS W9 / A§11–13, B§3·4·14):
     • "in-app official doc links" — Madad modal (repo docs/ + OFFICIAL links)
     • design-system components: confirm sab jagah shared (native confirm()
       sandboxed WebView me block/chup ho sakta hai)
     • self-descriptive UI — icon-only buttons par tooltip (title/aria)

   Ye gate pin karta hai:
   PART1 — source contract:
     ① Pwa_Shell: shared PWA.confirm (non-blocking promise) + export + CSS
     ② raw native confirm() PWA pages me ZERO (3 sites PWA.confirm par)
     ③ UI2.help: repo docs/ links + OFFICIAL links + sab target=_blank rel=noopener
     ④ sbHelp button (title+aria) + App_Boot wiring + help.docsUrl (Config+Schema)
     ⑤ tooltip sweep: Index.html har icon-btn + sbUser par title
   PART2 — rendered DOM:
     ⑥ sbHelp click → Madad modal (title, ≥20 links, official href, target)
     ⑦ modal close kaam karta hai
     ⑧ PWA.confirm DOM: overlay dikhta hai, OK=true, Esc=false (non-blocking)
     ⑨ zero page errors

   Run: bash tools/build_demo.sh (ya build_demo.py) && python3 tools/build_pwa_demo.py
        && node tools/test_w9_help.js [baseUrl]
   Login: owner / admin123
   ========================================================================== */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const BASE = process.argv[2] || 'http://127.0.0.1:8021';
const ROOT = path.resolve(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ERR = [];
const ok = (n, c, d) => c ? (pass++, console.log('  \u2714 ' + n + (d ? '  \u2192 ' + d : '')))
  : (fail++, ERR.push(n + (d ? ' \u2014 ' + d : '')), console.log('  \u2716 ' + n + (d ? '  \u2192 ' + d : '')));
const src = f => fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf-8');

(async () => {
  console.log('\n\x1b[1mW9 · HELP + CONFIRM + TOOLTIP GATE (v2.30.3)\x1b[0m');
  const shell = src('Pwa_Shell.html');
  const wh = src('Pwa_Warehouse.html');
  const pos = src('Pwa_POS.html');
  const ui2 = src('App_UI2.html');
  const idx = src('Index.html');
  const boot = src('App_Boot.html');
  const cfgGs = src('Config.gs');
  const schemaGs = src('Schema.gs');

  /* ---------------- PART1: source contract ---------------- */
  console.log('\n  \x1b[1mPART 1 — source contract\x1b[0m');

  ok('\u2460 Pwa_Shell: shared PWA.confirm (promise overlay + export + CSS)',
    /function confirm\(msg, opts\)/.test(shell) && /confirm: confirm/.test(shell)
    && /\.pwa-cf\{position:fixed/.test(shell) && /role: 'alertdialog'/.test(shell),
    'Pwa_Shell.html');

  const rawCount = [wh, pos].filter(s =>
    /(^|[^\w.$])confirm\(/.test(s.replace(/PWA\.confirm\(/g, '')
      .replace(/function confirm\(/g, 'function_gateConfirm(')
      .replace(/\/\*[\s\S]*?\*\//g, ''))).length;
  ok('\u2461 Pwa_Warehouse + Pwa_POS: raw native confirm() ZERO (3 sites shared par)',
    rawCount === 0 && (wh.match(/PWA\.confirm\(/g) || []).length === 2
    && (pos.match(/PWA\.confirm\(/g) || []).length === 1,
    'adopted=' + ((wh.match(/PWA\.confirm\(/g) || []).length + (pos.match(/PWA\.confirm\(/g) || []).length));

  const officialLinks = (ui2.match(/https:\/\/developers\.google\.com\//g) || []).length;
  const helperBlank = /target: '_blank', rel: 'noopener'/.test(ui2);
  const aCount = (ui2.match(/A\(/g) || []).length;
  ok('\u2462 UI2.help: repo docs/ guides + OFFICIAL links, sab target=_blank rel=noopener (A-helper par)',
    /const A = \(href, label, sub\)/.test(ui2) && helperBlank && aCount >= 19 && officialLinks >= 7
    && /help\.docsUrl/.test(ui2) && /01-OVERVIEW\.md/.test(ui2) && /09-ROLLBACK\.md/.test(ui2),
    'links=' + aCount + ' official=' + officialLinks + ' helper-blank=' + helperBlank);

  const sbBtn = idx.match(/<button class="sb-help" id="sbHelp"[^>]*>/);
  ok('\u2463 sbHelp button (title + aria-label) + wiring + help.docsUrl (Config.gs + Schema.gs)',
    !!sbBtn && /title="/.test(sbBtn[0]) && /aria-label="/.test(sbBtn[0])
    && /\$\(\'#sbHelp\'\)\.onclick/.test(boot) && /UI2\.help\(\)/.test(boot)
    && /'help\.docsUrl'/.test(cfgGs) && /'help\.docsUrl': ''/.test(schemaGs),
    'Index + App_Boot + Config.gs + Schema.gs');

  const iconBtns = idx.match(/<button class="icon-btn[^"]*"[^>]*>/g) || [];
  const withTitle = iconBtns.filter(b => /title="/.test(b)).length;
  const sbUserOk = /<button class="sb-user" id="sbUser" type="button" title="/.test(idx);
  ok('\u2464 Tooltip sweep: Index.html har icon-btn + sbUser par title',
    iconBtns.length > 0 && withTitle === iconBtns.length && sbUserOk,
    withTitle + '/' + iconBtns.length + ' icon-btns + sbUser');

  /* ---------------- PART2: rendered DOM ---------------- */
  console.log('\n  \x1b[1mPART 2 — rendered DOM\x1b[0m');
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const errs = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', e => errs.push(String(e && e.message).slice(0, 110)));
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(BASE + '/index.html', { waitUntil: 'networkidle2', timeout: 45000 });
    await sleep(1200);

    // login (owner / admin123) — same ids as other gates (#lgUser/#lgPass)
    if (await page.$('#lgUser')) {
      await page.click('#lgUser'); await page.type('#lgUser', 'owner');
      await page.click('#lgPass'); await page.type('#lgPass', 'admin123');
      await page.keyboard.press('Enter');
    }
    await page.waitForFunction(() => window.App && App.state && App.state.session, { timeout: 20000 });
    await sleep(1200);

    ok('\u2464 sbHelp nazar aur tap-size OK; click \u2192 Madad modal (title + \u226520 links + official href)',
      await (async () => {
        const r = await page.evaluate(() => {
          const b = document.getElementById('sbHelp');
          if (!b) return { bad: 'no sbHelp' };
          const rc = b.getBoundingClientRect();
          if (rc.width < 44 || rc.height < 44) return { bad: 'tap<44 ' + rc.width + 'x' + rc.height };
          b.click();
          const m = document.querySelector('.modal2');
          if (!m) return { bad: 'no modal' };
          const links = m.querySelectorAll('a.hlp-a');
          const official = m.querySelectorAll('a.hlp-a[href^="https://developers.google.com"]');
          const blank = m.querySelectorAll('a.hlp-a[target="_blank"]');
          const title = (m.querySelector('.m-head h3') || {}).textContent || '';
          return { t: title, n: links.length, o: official.length, b: blank.length };
        });
        if (r.bad) return false;
        return /madad/i.test(r.t) && r.n >= 20 && r.o >= 7 && r.b === r.n;
      })(), 'Madad modal open with official links');

    ok('\u2464b Dark theme par bhi readable (card surface white NAHI, label ink light)',
      await (async () => {
        const r = await page.evaluate(() => {
          document.documentElement.setAttribute('data-theme', 'dark');
          const a = document.querySelector('.modal2 a.hlp-a');
          if (!a) return { bad: 'no link' };
          const cs = getComputedStyle(a);
          const bg = cs.backgroundColor.match(/\d+/g).map(Number).slice(0, 3);
          const ink = getComputedStyle(a.querySelector('b')).color.match(/\d+/g).map(Number).slice(0, 3);
          const white = bg[0] > 245 && bg[1] > 245 && bg[2] > 245;
          const lightInk = ink[0] > 180 && ink[1] > 180 && ink[2] > 180;
          return { white: white, lightInk: lightInk };
        });
        await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'light'); });
        return !r.bad && !r.white && r.lightInk;
      })(), 'dark: surface=panel-2, ink light');

    ok('\u2465 Modal close kaam karta hai (Band karein \u2192 overlay gaya)',
      await (async () => {
        await page.evaluate(() => {
          const btns = [...document.querySelectorAll('.modal2 .m-foot button')];
          const b = btns.find(x => /band|close/i.test(x.textContent));
          if (b) b.click(); else { const x = document.querySelector('.modal2 .oc-x'); if (x) x.click(); }
        });
        await sleep(350);
        return page.evaluate(() => !document.querySelector('.modal2'));
      })());

    /* \u2466 PWA.confirm DOM — pwa-pos.html par seedha driver (login ke baghair bhi
       PWA global mojood hota hai): overlay render + OK=true + Esc=false */
    const p2 = await browser.newPage();
    p2.on('pageerror', e => errs.push('PWA:' + String(e && e.message).slice(0, 90)));
    await p2.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await p2.goto(BASE + '/pwa-pos.html', { waitUntil: 'networkidle2', timeout: 45000 });
    await sleep(1800);

    ok('\u2466 PWA.confirm DOM: overlay dikhta hai, OK=true, Esc=false (non-blocking)',
      await (async () => {
        const a = await p2.evaluate(() => {
          const pr = PWA.confirm('Gate test — theek hai?', { danger: true });
          const ov = document.querySelector('.pwa-cf');
          const msg = (document.querySelector('.pwa-cf-msg') || {}).textContent || '';
          const btn = [...document.querySelectorAll('.pwa-cf .btn')].find(b => /OK/.test(b.textContent));
          if (btn) btn.click();
          return pr.then(v => ({ hasOv: !!ov, msg: msg, v: v }));
        });
        if (!a.hasOv || !/Gate test/.test(a.msg) || a.v !== true) return false;
        const b = await p2.evaluate(() => {
          const pr = PWA.confirm('Esc test?');
          const ov = document.querySelector('.pwa-cf');
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          return pr.then(v => ({ ov: !!ov, v: v }));
        });
        return b.ov && b.v === false && await p2.evaluate(() => !document.querySelector('.pwa-cf'));
      })(), 'Pwa_Shell shared dialog (danger btn + Esc cancel)');

    ok('\u2467 Zero page errors (desktop + PWA)', errs.length === 0,
      errs.length ? errs[0] : 'clean');

  } catch (e) {
    ok('PART2 browser flow', false, String(e && e.message).slice(0, 110));
  } finally { await browser.close(); }

  /* ---------------- summary ---------------- */
  console.log('\n\x1b[1mSUMMARY:\x1b[0m ' + pass + ' pass \u00b7 ' + fail + ' fail \u00b7 ' + (fail ? '\x1b[31mRED\x1b[0m' : '\x1b[32mGREEN\x1b[0m'));
  if (fail) { console.log('FAILED:\n' + ERR.map(x => '  - ' + x).join('\n')); process.exit(1); }
})().catch(e => { console.error('FATAL:', e && e.message); process.exit(1); });
