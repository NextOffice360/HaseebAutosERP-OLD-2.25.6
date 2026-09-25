#!/usr/bin/env node
/**
 * tools/audit_typography.js — v2.30.5 (enterprise mandate §7/§11, P1)
 * ---------------------------------------------------------------------------
 * TYPOGRAPHY AUDIT: hard-coded font-sizes jo enterprise floor se neeche hain.
 *
 * Floor: 10.8px (standing rule) — token scale: --fs-2xs 11px (chart labels),
 * --fs-xs 12px (WCAG floor). EXEMPT (report me "exempt" count):
 *   • print/label CSS (.label .lname/.lprice — physical 50×30mm labels)
 *   • SVG chart internals (.bar-lab/.bar-val/.donut-lab — viewBox scale)
 *   • LABEL_CSS block + print templates (mm-scale physical output)
 *
 * Fix policy: UI text → var(--fs-2xs) (11px) ya var(--fs-xs) (12px) tokens —
 * page-specific px nahi (design-system rule).
 *
 *   node tools/audit_typography.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const FLOOR = 10.8;
const files = fs.readdirSync(path.join(ROOT, 'apps-script')).filter(f => f.endsWith('.html'));
const violations = [];
let exempt = 0, okCount = 0;

/* PRINT/DOCUMENT exemptions (physical output — paper par mm-scale jaiz):
   App_Barcode  = label-designer preview + thermal/A4 invoice builders
   App_Print    = print templates engine
   App_Comms    = SMS/WhatsApp/message templates
   Line-level: App_Config receipt/label PREVIEW (mm) — neeche whitelist */
const PRINT_FILES = new Set(['App_Print.html', 'App_Barcode.html', 'App_Comms.html']);
const PRINT_LINES = new Set(['App_Config.html:846']);   /* label preview (mm) */

/* Dynamic print-range: jis file me 'const Print = {' se 'window.Barcode = Barcode;'
   tak print/document builders hain (App_Core) — wo range exempt */
function printRange(f, lines) {
  if (f === 'App_Core.html') {
    let a = -1, b = -1;
    for (let i = 0; i < lines.length; i++) {
      if (a === -1 && /const Print = \{/.test(lines[i])) a = i;
      if (/window\.Barcode = Barcode;/.test(lines[i])) b = i;
    }
    return (a > -1 && b > a) ? [a, b] : null;
  }
  if (f === 'App_Dashboards.html') {
    /* DAY REPORT print-sheet CSS (dr-kpis → .power) — physical A4 output */
    let a = -1, b = -1;
    for (let i = 0; i < lines.length; i++) {
      if (a === -1 && /\.dr-kpis/.test(lines[i])) a = i;
      if (/\.power\{/.test(lines[i])) b = i;
    }
    return (a > -1 && b > a) ? [a, b] : null;
  }
  return null;
}

files.forEach(f => {
  const src = fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf8');
  const lines = src.split('\n');
  const prRange = printRange(f, lines);
  lines.forEach((ln, i) => {
    const m = ln.match(/font-size:\s*([0-9.]+)px/) || ln.match(/fontSize:\s*'?([0-9.]+)px'?/);
    if (!m) return;
    const px = parseFloat(m[1]);
    if (px >= FLOOR) { okCount++; return; }
    const isPrintLabel = /\.label\s|\.lname|\.lprice|LABEL_CSS|label-sheet/i.test(ln) ||
      (f === 'App_Barcode.html' && /label/i.test(ln));
    const isSvg = /fill:|\.bar-lab|\.bar-val|\.donut-lab|viewBox/i.test(ln);
    const inPrintRange = prRange && i >= prRange[0] && i <= prRange[1];
    if (isPrintLabel || isSvg || inPrintRange || PRINT_FILES.has(f) || PRINT_LINES.has(f + ':' + (i + 1))) { exempt++; return; }
    violations.push({ file: f, line: i + 1, px: px, text: ln.trim().slice(0, 110) });
  });
});

console.log('════════════════════════════════════════════════════════════');
console.log(' TYPOGRAPHY AUDIT  (floor ' + FLOOR + 'px — mandate §7/§11, P1)');
console.log('════════════════════════════════════════════════════════════');
console.log(' ok (>= floor)         :', okCount);
console.log(' exempt (print/SVG)    :', exempt);
console.log(' VIOLATIONS (< floor)  :', violations.length);
violations.forEach(v => console.log('   ' + v.file + ':' + v.line + '  ' + v.px + 'px  ' + v.text));

fs.mkdirSync(path.join(ROOT, 'tmp'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'tmp/typography-audit.json'), JSON.stringify({ generatedAt: new Date().toISOString(), floor: FLOOR, ok: okCount, exempt: exempt, violations: violations }, null, 2));
console.log('\n → tmp/typography-audit.json');
process.exit(violations.length === 0 ? 0 : 2);
