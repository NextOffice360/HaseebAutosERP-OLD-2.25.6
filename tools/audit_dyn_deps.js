#!/usr/bin/env node
/* ============================================================================
   audit_dyn_deps.js — W3.T0 audit (v2.26.x)
   ----------------------------------------------------------------------------
   Attachment A (master spec) line 889 — "Identify Existing Missing Shared Logic
   First … Look for:" — 12 items. Yeh tool har item ka STATIC evidence ginata hai
   (runtime behaviour ka faisla `tools/test_dyn_deps.js` gate karta hai).

   Sirf naapta hai — kuch badalta nahi. Output: tmp/dyn-deps-audit.json
   ========================================================================== */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), SRC = path.join(ROOT, 'apps-script');
const files = fs.readdirSync(SRC).filter(f => /\.(html|gs)$/.test(f));
const src = f => fs.readFileSync(path.join(SRC, f), 'utf-8');
const all = files.map(f => ({ f, s: src(f) }));
const total = (rx) => all.reduce((a, x) => a + (x.s.match(rx) || []).length, 0);
const per = (rx, top) => all.map(x => ({ f: x.f, n: (x.s.match(rx) || []).length }))
  .filter(x => x.n > 0).sort((a, b) => b.n - a.n).slice(0, top || 6);

const R = {};
/* ① duplicate implementations — ek hi cheez kai jagah (heuristic: named helpers) */
R.dupDropdownHelpers = per(/function\s+\w*(dropdown|select|picker|option)\w*\s*\(/gi);
R.dupModalHelpers = per(/function\s+\w*(modal|dialog|drawer)\w*\s*\(/gi);
R.dupLoadingHelpers = per(/function\s+\w*(loading|spinner|skeleton)\w*\s*\(/gi);
/* ② hard-coded dropdown behaviour — inline option lists */
R.inlineOptionLists = total(/h\('option'|appendChild\(h\('option'/g);
R.inlineOptionListsTop = per(/h\('option'|appendChild\(h\('option'/g, 5);
/* ③ hard-coded conditional fields — provider/flags branches */
R.hardcodedProviderBranches = total(/['"](gemini|openai|anthropic|openrouter|ollama|mock)['"]\s*(===|==|!==|!=)/gi);
R.hardcodedProviderTop = per(/['"](gemini|openai|anthropic|openrouter|ollama|mock)['"]\s*(===|==|!==|!=)/gi, 5);
/* ④ repeated API calls — same route kai files mein */
const routeCount = {};
all.forEach(x => {
  (x.s.match(/API\.call\(\s*'([a-z0-9._]+)'/gi) || []).forEach(m => {
    const r = m.replace(/.*'([a-z0-9._]+)'.*/i, '$1').toLowerCase();
    (routeCount[r] = routeCount[r] || []).push(x.f);
  });
});
R.routesInManyFiles = Object.entries(routeCount)
  .map(([r, fs_]) => ({ route: r, files: [...new Set(fs_)].length, calls: fs_.length }))
  .filter(x => x.files > 1).sort((a, b) => b.files - a.files).slice(0, 8);
/* ⑤ repeated data-fetching logic — fetch blocks jo UI.run/parallel se bahar hain */
R.rawFetchBlocks = total(/host\.innerHTML\s*=\s*''\s*;?\s*(try|\n\s*const|\n\s*let)/g);
R.loadingPlaceholdersOld = total(/innerHTML\s*=\s*['"][^'"]*(Loading|لوڈ)/gi);
R.loadingPlaceholdersTop = per(/innerHTML\s*=\s*['"][^'"]*(Loading|لوڈ)/gi, 5);
/* ⑥⑦⑧⑨ runtime items — static candidates */
R.dynamicDepMarkers = total(/data-dep|data-when|Deps\./g);
R.tableRenderSites = total(/UI2\.table\(/g);
R.refreshAfterWrite = total(/App\.refresh\(\)|load\(\);\s*App\.refresh/g);
/* ⑩ inconsistent validation */
R.adHocValidations = total(/if\s*\(!\s*\w+\s*\)\s*(return\s*)?(UI\.toast\([^)]*(zaroori|required|khaali)|throw)/gi);
R.sharedValidatorUses = total(/UI\.require|Validators\.|validate\(/g);
/* ⑪ inconsistent loading states */
R.uiRunUses = total(/UI\.run\(/g);
R.manualBusyToggles = total(/\.disabled\s*=\s*true|textContent\s*=\s*['"][^'"]*\.\.\./g);
/* ⑫ same logic different implementations — search/filter/sort */
R.searchImpls = per(/function\s+\w*(search|filter|sort)\w*\s*\(/gi);
R.debounceImpls = total(/debounce|setTimeout\(\s*\w+\s*,\s*2[0-9]{2}/g);

console.log('\n\x1b[1mW3.T0 — DYNAMIC / DATA-AWARE SHARED-LOGIC AUDIT\x1b[0m');
console.log('(Attachment A line 889 — "Look for:" 12 items)\n');
const say = (n, label, val) => console.log(`  ${String(n).padStart(2)}. ${label.padEnd(46)} ${val}`);
say(1, 'duplicate dropdown helpers / files', R.dupDropdownHelpers.map(x => x.f + ':' + x.n).join(' ') || '0');
say(1, 'duplicate modal helpers / files', R.dupModalHelpers.map(x => x.f + ':' + x.n).join(' ') || '0');
say(1, 'duplicate loading helpers / files', R.dupLoadingHelpers.map(x => x.f + ':' + x.n).join(' ') || '0');
say(2, 'inline <option> builds (total)', R.inlineOptionLists);
say(3, 'hard-coded provider branches', R.hardcodedProviderBranches + '  ' + R.hardcodedProviderTop.map(x => x.f + ':' + x.n).join(' '));
say(4, 'routes called from >1 file', R.routesInManyFiles.length + '  ' + R.routesInManyFiles.slice(0, 4).map(x => x.route + '(' + x.files + ')').join(' '));
say(5, 'raw "host.innerHTML = \'\'" fetch blocks', R.rawFetchBlocks);
say(6, 'data-dep / data-when / Deps.* markers', R.dynamicDepMarkers);
say(7, 'UI2.table( render sites', R.tableRenderSites);
say(8, 'App.refresh()/load() after write markers', R.refreshAfterWrite);
say(9, 'forms: ad-hoc dep population', '(runtime — gate)');
say(10, 'ad-hoc validation blocks vs shared', R.adHocValidations + ' ad-hoc / ' + R.sharedValidatorUses + ' shared-ish');
say(11, 'UI.run( uses vs manual busy toggles', R.uiRunUses + ' UI.run / ' + R.manualBusyToggles + ' manual');
say(11, 'purane "Loading…" placeholders (files)', R.loadingPlaceholdersOld + '  ' + R.loadingPlaceholdersTop.map(x => x.f + ':' + x.n).join(' '));
say(12, 'search/filter/sort impls / files', R.searchImpls.map(x => x.f + ':' + x.n).join(' ') || '0');
say(12, 'debounce/timeout search impls', R.debounceImpls);

fs.writeFileSync(path.join(ROOT, 'tmp', 'dyn-deps-audit.json'), JSON.stringify(R, null, 1));
console.log('\n(snapshot: tmp/dyn-deps-audit.json)\n');
