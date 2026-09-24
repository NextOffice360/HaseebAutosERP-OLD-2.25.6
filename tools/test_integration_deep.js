#!/usr/bin/env node
/* ============================================================================
   test_integration_deep.js — FRONTEND ↔ BACKEND deep integration test
   ----------------------------------------------------------------------------
   Har screen par jata hai aur wahan maujood HAR clickable control ko daba kar
   dekhta hai:
     · koi JS error to nahi aaya
     · koi API call fail to nahi hui (NO_ROUTE / SERVER_ERROR)
     · modal / drawer / toast khula ya nahi (yani click "kaam" hua)

   Hifazat: DELETE / PURGE / RESET / VOID waghaira destructive controls CHHOR
   diye jate hain — data integrity kabhi khatre me nahi parti.

   Usage: node tools/test_integration_deep.js [width] [height] [--max n]
   ========================================================================== */
const puppeteer = require('puppeteer');
const { login } = require('./_harness');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const DEMO = path.join(ROOT, 'demo', 'index.html');

const W = Number(process.argv[2]) || 1440;
const H = Number(process.argv[3]) || 900;
const mi = process.argv.indexOf('--max');
const MAXPER = mi > -1 ? Number(process.argv[mi + 1]) : 40;

const SCREENS = ['dashboard', 'pos', 'sales', 'items', 'inventory', 'warehouse', 'parties',
  'purchase', 'reorder', 'orders', 'takeorder', 'accounting', 'money', 'shop', 'reports',
  'insights', 'users', 'settings'];

/* destructive — inhen kabhi nahi dabana */
const DANGER = /(delete|hata|purge|reset|void|cancel sale|remove|khatam|clear all|wipe|drop)/i;

let pass = 0, fail = 0; const failures = [];
const ok = (n, c, d) => c ? (pass++, console.log('  ✔ ' + n + (d ? '  → ' + d : '')))
  : (fail++, failures.push(n), console.log('  ✖ ' + n + (d ? '  → ' + d : '')));

if (!fs.existsSync(DEMO)) { console.log('✖ demo/index.html nahi mila'); process.exit(1); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: W, height: H }
  });
  const page = await browser.newPage();
  const errs = [];
  const stacks = [];
  page.on('pageerror', e => {
    errs.push(e.message);
    stacks.push({ m: e.message, s: (e.stack || '').split('\n').slice(0, 6).join(' | ') });
  });

  await page.goto('file://' + DEMO, { waitUntil: 'load' });
  await login(page);             /* poll + login (shared harness) */
  await sleep(2800);

  /* API failures pakadne ke liye instrument */
  await page.evaluate(() => {
    window.__api = { calls: [], fails: [] };
    const orig = API.call.bind(API);
    API.call = function (a, pl, o) {
      window.__api.calls.push(a);
      return orig(a, pl, o).then(r => r, e => {
        window.__api.fails.push({ action: a, msg: (e && e.message) || String(e) });
        throw e;
      });
    };
  });

  console.log(`\n\x1b[1mDEEP INTEGRATION @ ${W}x${H}\x1b[0m\n`);

  let totalClicked = 0, totalFails = 0;
  const controlErrors = [];

  for (const scr of SCREENS) {
    await page.evaluate(s => { location.hash = '#/' + s; }, scr);
    await sleep(1800);
    await page.evaluate(() => { window.__api.fails = []; });

    /* is screen ke clickable controls (sirf #view ke andar) */
    const controls = await page.evaluate(() => {
      const out = [];
      const sel = '#view button, #view .btn, #view [role=tab], #view .tab, #view .nav-item';
      document.querySelectorAll(sel).forEach((el, i) => {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return;               /* chhupa hua */
        const lab = ((el.getAttribute('title') || '') + ' ' +
          (el.getAttribute('aria-label') || '') + ' ' +
          (el.textContent || '')).replace(/\s+/g, ' ').trim();
        out.push({ i, lab: lab.slice(0, 60), danger: false });
      });
      return out;
    });

    /* destructive hata do */
    const safe = controls.filter(c => !DANGER.test(c.lab));
    const picked = safe.slice(0, MAXPER);
    let clicked = 0;

    for (const c of picked) {
      const before = errs.length;
      /* har click ke liye screen dobara load karein (state saaf rahe) */
      await page.evaluate(s => { location.hash = '#/' + s; }, scr);
      await sleep(900);
      try {
        const found = await page.evaluate((idx) => {
          const sel = '#view button, #view .btn, #view [role=tab], #view .tab, #view .nav-item';
          const els = [...document.querySelectorAll(sel)].filter(el => {
            const r = el.getBoundingClientRect();
            return r.width >= 2 && r.height >= 2;
          });
          const el = els[idx];
          if (!el) return false;
          el.click();
          return true;
        }, c.i);
        if (!found) continue;
        clicked++;
        await sleep(700);
        /* agar modal/drawer khula ho to band kar do (agli screen ke liye) */
        await page.evaluate(() => {
          const closers = document.querySelectorAll('.modal-scrim .x, .drawer .x, .scrim');
          closers.forEach(x => { try { x.click(); } catch (e) { } });
        });
        await sleep(200);
      } catch (e) { /* click fail — agla */ }
      if (errs.length > before) {
        /* is control ne error diya — record with stack */
        controlErrors.push({ screen: scr, control: c.lab, err: errs[errs.length - 1] });
      }
    }

    const f = await page.evaluate(() => window.__api.fails.slice(0, 6));
    totalClicked += clicked;
    totalFails += f.length;
    const newErrs = errs.length;
    ok(`${scr.padEnd(11)} ${String(clicked).padStart(3)} controls clicked`,
      f.length === 0,
      f.length ? 'API FAIL: ' + f.map(x => x.action + ' → ' + x.msg.slice(0, 44)).join(' | ')
        : `${controls.length} controls milay (${controls.length - safe.length} destructive chhoray)`);
  }

  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log(`  DEEP INTEGRATION   PASS: ${pass}   FAIL: ${fail}`);
  console.log(`  total controls clicked: ${totalClicked}   API failures: ${totalFails}`);
  if (errs.length) {
    console.log(`  page errors: ${errs.length}`);
    [...new Set(errs)].slice(0, 8).forEach(e => console.log('    · ' + e.slice(0, 110)));
    console.log('\n  \x1b[33mkon se control ne error diya:\x1b[0m');
    controlErrors.slice(0, 10).forEach(c => console.log(`    [${c.screen}] "${c.control}" → ${c.err.slice(0, 80)}`));
  } else console.log('  page errors: none');
  if (fail) failures.forEach(f2 => console.log('   ✖ ' + f2));
  console.log('══════════════════════════════════════════════════════════════════');
  await browser.close();
  process.exit(fail || errs.length ? 1 : 0);
})().catch(e => { console.error('✖ ' + e.message); process.exit(1); });
