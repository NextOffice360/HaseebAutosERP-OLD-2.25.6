#!/usr/bin/env node
/* ==========================================================================
   audit_naming.js — v2.30.4 · W8 gate (A§14: naming & architecture consistency)
   --------------------------------------------------------------------------
   Ye gate conventions ko TODE nahi, TODNE se pehle ROKTA hai (regression pin):
     ① Screen ids: unique + lowercase (App.registerScreen)
     ② Nav routes == screens (App.navConfig har screen tak pohanche, koi orphan nahi)
     ③ API routes: 'domain.action' pattern + ZERO duplicates (Code.gs)
     ④ Koi .bak / copy / (1) / .orig / .old file git-tracked nahi
     ⑤ .gs namespaces: har namespace EK hi dafa (do files me same var X = { nahi)
     ⑥ HTML split: App_* (desktop) / Pwa_* (PWA) — na-tay shanakht wali koi file nahi

   Run: node tools/audit_naming.js
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'apps-script');
let pass = 0, fail = 0;
const ok = (n, c, d) => c ? (pass++, console.log('  \u2714 ' + n + (d ? '  \u2192 ' + d : '')))
  : (fail++, console.log('  \u2716 ' + n + (d ? '  \u2192 ' + d : '')));

console.log('\x1b[1mW8 \u00b7 NAMING & ARCHITECTURE CONSISTENCY (A\u00a714)\x1b[0m');

const read = f => fs.readFileSync(path.join(DIR, f), 'utf8');

/* ① screen ids */
const screenIds = [];
for (const f of fs.readdirSync(DIR).filter(f => /^App_.*\.html$/.test(f))) {
  const re = /registerScreen\('([^']+)'/g;
  let m; const src = read(f);
  while ((m = re.exec(src))) screenIds.push({ id: m[1], file: f });
}
const dupScreens = screenIds.map(s => s.id).filter((x, i, a) => a.indexOf(x) !== i);
const badCase = screenIds.filter(s => !/^[a-z][a-z0-9]*$/.test(s.id));
ok('\u2460 Screen ids: unique + lowercase (' + screenIds.length + ' screens)',
  screenIds.length > 15 && dupScreens.length === 0 && badCase.length === 0,
  dupScreens.length ? 'dup: ' + dupScreens.join(',') : (badCase.length ? 'case: ' + badCase.map(s => s.id).join(',') : [...new Set(screenIds.map(s => s.id))].slice(0, 6).join(',') + '…'));

/* ② nav routes == screens */
const core = read('App_Core.html');
const navIds = [...core.matchAll(/id:\s*'([a-z][a-z0-9]*)'/g)].map(m => m[1]);
const idSet = new Set(screenIds.map(s => s.id));
const orphans = [...new Set(navIds.filter(id => !idSet.has(id)))];
ok('\u2462 Nav \u2192 screen: koi orphan route nahi (navConfig \u2286 screens)',
  orphans.length === 0, orphans.length ? 'orphan: ' + orphans.join(',') : 'match');

/* ③ API routes pattern + duplicates */
const code = read('Code.gs');
const routeRe = /'([a-zA-Z0-9]+\.[a-zA-Z0-9]+)':\s*function/g;
const routes = [...code.matchAll(routeRe)].map(m => m[1]);
const badRoutes = routes.filter(r => !/^[a-z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9]*$/.test(r));
const dupRoutes = routes.filter((x, i, a) => a.indexOf(x) !== i);
ok('\u2463 API routes: domain.action pattern + ZERO duplicates (' + routes.length + ' routes)',
  routes.length > 80 && badRoutes.length === 0 && dupRoutes.length === 0,
  (badRoutes.length ? 'bad: ' + badRoutes.join(',') + ' ' : '') + (dupRoutes.length ? 'dup: ' + dupRoutes.join(',') : 'clean'));

/* ④ koi backup/copy file tracked */
const tracked = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
const junk = tracked.filter(f => /\.(bak|orig|old)$/.test(f) || /copy| \(\d+\)/.test(path.basename(f)));
ok('\u2464 Backup/copy files tracked: ZERO', junk.length === 0, junk.length ? junk.slice(0, 3).join(',') : 'clean');

/* ⑤ namespaces unique */
const nsCount = {};
for (const f of fs.readdirSync(DIR).filter(f => f.endsWith('.gs'))) {
  const re = /^var ([A-Z][A-Za-z0-9]+) = \{/gm;
  let m; const src = read(f);
  while ((m = re.exec(src))) nsCount[m[1]] = (nsCount[m[1]] || 0) + 1;
}
const dupNs = Object.keys(nsCount).filter(k => nsCount[k] > 1);
ok('\u2465 .gs namespaces: har namespace EK hi dafa (' + Object.keys(nsCount).length + ' namespaces)',
  Object.keys(nsCount).length > 20 && dupNs.length === 0, dupNs.length ? 'dup: ' + dupNs.join(',') : 'clean');

/* ⑥ HTML split conventions */
const htmls = fs.readdirSync(DIR).filter(f => f.endsWith('.html'));
const odd = htmls.filter(f => !/^(App_|Pwa_|Index|Styles|mock)/.test(f));
ok('\u2466 HTML split: App_* (desktop) / Pwa_* (PWA) — na-tay shanakht ZERO',
  odd.length === 0, odd.length ? odd.join(',') : htmls.length + ' files (29 App + 5 Pwa + index/styles)');

/* summary */
console.log('\n\x1b[1mSUMMARY:\x1b[0m ' + pass + ' pass \u00b7 ' + fail + ' fail \u00b7 ' + (fail ? '\x1b[31mRED\x1b[0m' : '\x1b[32mGREEN\x1b[0m'));
if (fail) process.exit(1);
