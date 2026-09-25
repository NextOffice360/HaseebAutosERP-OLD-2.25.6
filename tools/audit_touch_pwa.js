#!/usr/bin/env node
/**
 * tools/audit_touch_pwa.js — v2.30.5 (P3-a + P3-d, mandate §10/§11)
 * ---------------------------------------------------------------------------
 * STATIC audit: touch targets (≥44px mobile) + PWA safe-areas + manifest.
 * Report-only baseline → fixes agle slices me (har fix ke baad re-run).
 *   node tools/audit_touch_pwa.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf8');
const checks = [];
const add = (id, ok, detail) => checks.push({ id, ok: !!ok, detail: String(detail).slice(0, 90) });

const st = read('Styles.html');
/* btn sizes: .btn base padding/height */
const btnBlock = (st.match(/\.btn\s*{[^}]*}/) || [''])[0];
add('btn.hasSize', /padding|height|min-height/.test(btnBlock), btnBlock.slice(0, 60));
const smBlock = (st.match(/\.btn\.sm\s*{[^}]*}/) || (st.match(/\.btn\.sm,[^{]*{[^}]*}/) || ['']))[0];
add('btn.sm.exists', !!smBlock, smBlock.slice(0, 60));
add('touch.mediaCoarse', /pointer:\s*coarse|@media\s*\(max-width/.test(st), 'mobile media queries');
const tabbar = (st.match(/#tabbar[^{]*{[^}]*}|\.tabbar[^{]*{[^}]*}/) || [''])[0];
const tabbarAll = st.match(/[^.]*tabbar[^{]*{[^}]*}/g) || [];
add('tabbar.touch', tabbarAll.some(r => /height|padding/.test(r)), (tabbarAll[0] || '').trim().slice(0, 60));

/* PWA shells: safe-areas */
['Pwa_Shell.html', 'App_PwaHub.html', 'Pwa_POS.html'].forEach(f => {
  try {
    const s = read(f);
    add('safearea.' + f, /safe-area-inset|viewport-fit=cover/.test(s), 'safe-area/viewport-fit');
  } catch (e) { add('safearea.' + f, false, 'file missing'); }
});

/* manifest */
try {
  const mf = fs.readFileSync(path.join(ROOT, 'demo', 'manifest.webmanifest'), 'utf8');
  add('manifest.themeDisplay', /"display"\s*:\s*"standalone"/.test(mf) && /"theme_color"/.test(mf), 'manifest standalone+theme');
} catch (e) { add('manifest.themeDisplay', false, 'manifest missing'); }

/* btn.sm touch on coarse pointers (fix-judge): kya .btn.sm mobile par ≥36px? */
const smH = (smBlock.match(/height\s*:\s*(\d+)/) || [])[1];
add('btn.sm.heightKnown', !!smH, smH ? ('height=' + smH + 'px') : 'not fixed height (padding-based)');

const okN = checks.filter(c => c.ok).length;
console.log('════════════════════════════════════════════════════════════');
console.log(' TOUCH/PWA AUDIT (P3-a/d) —', okN + '/' + checks.length, 'pass');
console.log('════════════════════════════════════════════════════════════');
checks.forEach(c => console.log('  ' + (c.ok ? '✔' : '✘') + ' ' + c.id.padEnd(24) + c.detail));
fs.writeFileSync(path.join(ROOT, 'tmp/touch-pwa-audit.json'), JSON.stringify({ generatedAt: new Date().toISOString(), checks }, null, 2));
console.log('\n → tmp/touch-pwa-audit.json');
process.exit(0);
