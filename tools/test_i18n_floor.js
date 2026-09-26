#!/usr/bin/env node
/* v2.30.6 (round-9) — I18N REGRESSION FLOOR GATE
   EN-purity D7-batches ka regression band: hard-coded Roman-Urdu hits (audit_i18n)
   kabhi BASELINE se UPAR nahi, T.t call-sites kabhi BASELINE se NEECHE nahi.
   Naya migration = totalHits kam / totalTt zyada ho sakta hai (floor sirf girta hai).
   Baseline update: INTENTIONAL migration ke baad tools/test_i18n_floor.js me BASELINE badlo. */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

/* [totalHits, totalTt] — 2026-09-25 round-9 slice-1 ke baad naapa gaya */
const BASELINE_HITS = 486; /* r14: App_Core error-UI + AIConfig pure */
const BASELINE_TT = 459; /* r14 */

let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  \u2714 ' + n + (d ? '  \u2192 ' + d : '')); } else { fail++; console.log('  \u2716 ' + n + (d ? '  \u2192 ' + d : '')); } };

console.log('\n\u001b[1mI18N REGRESSION FLOOR (EN-purity D7)\u001b[0m');
try {
  execSync('node tools/audit_i18n.js', { cwd: ROOT, stdio: 'ignore' });
  const a = JSON.parse(fs.readFileSync(path.join(ROOT, 'tmp', 'i18n-audit.json'), 'utf-8'));
  ok(a.totalHits <= BASELINE_HITS, 'Roman-Urdu hits <= baseline ' + BASELINE_HITS, 'hits=' + a.totalHits);
  ok(a.totalTt >= BASELINE_TT, 'T.t call-sites >= baseline ' + BASELINE_TT, 'T.t=' + a.totalTt);
  /* har file me hits baseline-file se zyada na hon (per-file floor) */
  const BL_PER = { 'App_Core.html': 80, 'App_AIConfig.html': 50, 'App_UI2.html': 48, 'Pwa_Shell.html': 42 };
  const byFile = {};
  (a.files || []).forEach(f => { byFile[f.file] = f.hits; });
  const bad = Object.keys(BL_PER).filter(k => (byFile[k] || 0) > BL_PER[k]);
  ok(bad.length === 0, 'top-4 files apne per-file floor par', bad.map(k => k + '=' + byFile[k] + '>' + BL_PER[k]).join(', ') || 'sab OK');
} catch (e) {
  fail++;
  console.log('  \u2716 FATAL ' + (e && e.message));
}
console.log('\n  I18N FLOOR   PASS: ' + pass + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
