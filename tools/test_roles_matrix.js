#!/usr/bin/env node
/* ==========================================================================
   test_roles_matrix.js — v2.30.4 · W10.T2 gate (A§17 ROLES dimension)
   --------------------------------------------------------------------------
   Role × API enforcement matrix — REAL backend (mock_gs sandbox = asli
   Auth.gs/Code.gs, mock UI nahi). A§9 ka usool: "not merely visually hidden
   with CSS" — backend/API level par bhi protect.

   Seed users (Setup.gs): owner/OWNER(*) · manager/MANAGER · cashier/CASHIER ·
   sales1/SALESMAN — passwords: admin123/manager123/cash123/sales123.

   Ye gate pin karta hai:
     ① CASHIER DENY: settings.get / users.list / reports.sales / suppliers.list
        (Auth.require → "ijazat nahi") — backend block, sirf chhupana nahi
     ② CASHIER ALLOW: items.list + customers.list (apna kaam chalta hai)
     ③ OWNER ALLOW: wohi 4 denied actions ('*' perms)
     ④ MANAGER ALLOW: settings/users/reports/suppliers (beech ka role farq)
     ⑤ SALESMAN: users DENY + items ALLOW
     ⑥ users.perms matrix (roles + per-role perms) — Users screen ka data
     ⑦ Client contract: nav render App.can se filter karta hai + screens perm
        rakhti hain (rendered DOM owner demo par — saare screens nazar)
   Run: node tools/test_roles_matrix.js   (browser hissa ke liye 8021 chalu)
   ========================================================================== */
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'apps-script');
const { loadBackend } = require('./mock_gs');
let pass = 0, fail = 0; const ERR = [];
const ok = (n, c, d) => c ? (pass++, console.log('  \u2714 ' + n + (d ? '  \u2192 ' + d : '')))
  : (fail++, ERR.push(n + (d ? ' \u2014 ' + d : '')), console.log('  \u2716 ' + n + (d ? '  \u2192 ' + d : '')));
const sleep = ms => new Promise(r => setTimeout(r, ms));

console.log('\n\x1b[1mW10.T2 · ROLES \u00d7 API ENFORCEMENT MATRIX (v2.30.4)\x1b[0m');

/* ---------------- backend (real Auth.gs sandbox) ---------------- */
const os = require('os');
process.env.MOCK_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'roles-matrix-'));
const { sandbox } = loadBackend(DIR);
const { api, Setup } = sandbox;

Setup.setupAll();
Setup.seedAll();
try { sandbox.DB.settings(); api('system.settings.save', { values: { 'shop.requireOpen': 'false' } }); } catch (e) { }

function login(u, p) {
  const r = api('auth.login', { username: u, password: p });
  if (!r.ok) throw new Error('login fail ' + u + ': ' + JSON.stringify(r.error || r).slice(0, 90));
  return r.data.token;
}
function call(token, action, payload) {
  return api(action, Object.assign({ token: token }, payload || {}));
}
const denied = r => !r.ok && /ijazat nahi|permission/i.test(JSON.stringify(r.error || r));

const T_OWNER = login('owner', 'admin123');
const T_MGR = login('manager', 'manager123');
const T_CASH = login('cashier', 'cash123');
const T_SALES = login('sales1', 'sales123');

const DENY_ACTIONS = [
  ['system.settings.get', {}, 'settings.view'],
  ['users.list', {}, 'users.view'],
  ['reports.sales', { from: '2026-01-01', to: '2026-12-31' }, 'reports.view'],
  ['suppliers.list', {}, 'suppliers.view']
];

/* ① CASHIER deny — backend block */
const cashDeny = DENY_ACTIONS.map(([a, p]) => denied(call(T_CASH, a, p)));
ok('\u2460 CASHIER: 4 sensitive APIs backend-block (settings/users/reports/suppliers)',
  cashDeny.every(Boolean), cashDeny.join(','));

/* ② CASHIER allow — apna kaam */
const cashAllow = [
  ['items.list', {}], ['customers.list', {}]
].every(([a, p]) => call(T_CASH, a, p).ok);
ok('\u2461 CASHIER: apne actions chalte hain (items/customers list)', cashAllow);

/* ③ OWNER allow — '*' */
const ownerAllow = DENY_ACTIONS.every(([a, p]) => call(T_OWNER, a, p).ok);
ok('\u2462 OWNER: wohi 4 APIs ALLOW (perms = *)', ownerAllow);

/* ④ MANAGER allow — beech ka role */
const mgrAllow = DENY_ACTIONS.every(([a, p]) => call(T_MGR, a, p).ok);
ok('\u2463 MANAGER: settings/users/reports/suppliers ALLOW (role farq)', mgrAllow);

/* ⑤ SALESMAN: users DENY + items ALLOW */
ok('\u2464 SALESMAN: users.list DENY + items.list ALLOW',
  denied(call(T_SALES, 'users.list', {})) && call(T_SALES, 'items.list', {}).ok);

/* ⑥ users.perms matrix */
const perms = call(T_OWNER, 'users.perms', {});
const pm = (perms.ok && perms.data && (perms.data.matrix || perms.data)) || null;
ok('\u2465 users.perms: matrix + roles (Users screen ka data)',
  !!pm && Object.keys(pm).length >= 4,
  pm ? Object.keys(pm).slice(0, 4).join(',') + (perms.data.roles ? ' +roles' : '') : 'null');

/* ---------------- ⑦ client contract (demo DOM, owner) ---------------- */
(async () => {
  console.log('\n  \x1b[1mPART 2 \u2014 client nav filter (DOM, owner)\x1b[0m');
  const coreSrc = fs.readFileSync(path.join(DIR, 'App_Core.html'), 'utf-8');
  ok('\u2466 Source: nav render App.can(perm) se filter karta hai (perm wala screen chhupta hai)',
    /!x\.perm \|\| App\.can\(x\.perm\)/.test(coreSrc)
    || /filter\(x => !x\.perm \|\| App\.can\(x\.perm\)\)/.test(coreSrc));

  try {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto('http://127.0.0.1:8021/index.html', { waitUntil: 'networkidle2', timeout: 45000 });
    if (await page.$('#lgUser')) {
      await page.click('#lgUser'); await page.type('#lgUser', 'owner');
      await page.click('#lgPass'); await page.type('#lgPass', 'admin123');
      await page.keyboard.press('Enter');
    }
    await page.waitForFunction(() => window.App && App.state && App.state.session, { timeout: 20000 });
    await sleep(1500);
    const nav = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('#sbNav .nav-item')).map(n => n.dataset.id);
      return { n: items.length, hasPos: items.indexOf('pos') > -1, hasItems: items.indexOf('items') > -1 };
    });
    ok('\u2466 DOM (owner): nav items render (POS + Items nazar) \u2014 App.can path chalta hai',
      nav.n > 3 && nav.hasPos && nav.hasItems, 'items=' + nav.n);
    await browser.close();
  } catch (e) {
    ok('\u2466 DOM (owner) nav check', false, String(e && e.message).slice(0, 80));
  }

  /* summary */
  console.log('\n\x1b[1mSUMMARY:\x1b[0m ' + pass + ' pass \u00b7 ' + fail + ' fail \u00b7 ' + (fail ? '\x1b[31mRED\x1b[0m' : '\x1b[32mGREEN\x1b[0m'));
  if (fail) { console.log('FAILED:\n' + ERR.map(x => '  - ' + x).join('\n')); process.exit(1); }
})().catch(e => { console.error('FATAL:', e && e.message); process.exit(1); });
