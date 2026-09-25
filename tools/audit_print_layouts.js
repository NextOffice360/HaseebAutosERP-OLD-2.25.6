#!/usr/bin/env node
/**
 * tools/audit_print_layouts.js — v2.30.5 (D8, doc-intel §8)
 * ---------------------------------------------------------------------------
 * DOCUMENT/PRINT RESPONSIVENESS AUDIT (static, report-only):
 *   • receipt/label/print generators me paper-width + margins + overflow guards
 *   • .label/.qr/.bcode CSS: box-sizing/overflow/max-width
 *   • @media print rules mojood?
 * Baseline → fixes baad me (har fix ke baad tool re-run → ghatna sabit).
 *   node tools/audit_print_layouts.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf8');

const checks = [];
const add = (id, ok, detail) => checks.push({ id, ok: !!ok, detail: String(detail).slice(0, 100) });

/* --- App_Print: receipt + A4 --- */
const pr = read('App_Print.html');
add('receipt.paperWidth', /80mm|58mm|paper|paperSize/i.test(pr), 'receipt paper-size handling');
add('receipt.margins', /margin|padding/.test(pr), 'print CSS margins');
add('print.hasMediaPrint', /@media\s+print/.test(pr), '@media print block');
add('qr.noFixedOverflow', /max-width\s*:\s*100%|width:\s*100%/.test(pr), 'qr/print img flexible');

/* --- App_Barcode: labels --- */
const bc = read('App_Barcode.html');
add('label.boxSizing', /box-sizing|overflow\s*:\s*hidden/.test(bc), 'label overflow guard');
add('label.sheetGrid', /display\s*:\s*(flex|grid)|flex-wrap|grid-template/.test(bc), 'sheet columns layout');
add('barcode.svgFlexible', /max-width|viewBox/.test(bc), 'barcode flexible');

/* --- App_Core: labelsHtml --- */
const co = read('App_Core.html');
add('labels.imgFixedSize', /<img[^>]+width="\d+"/.test(co), 'label img explicit px (print-safe)');
add('labels.mmSizing', /wmm|height:\s*'\s*\+\s*hmm/.test(co), 'mm-based label size');

/* --- Styles: print area guards --- */
const st = read('Styles.html');
add('styles.printBlock', /@media\s+print/.test(st), '@media print in Styles');
add('styles.imgMax', /img\s*{[^}]*max-width/.test(st), 'global img max-width');

const okN = checks.filter(c => c.ok).length;
console.log('════════════════════════════════════════════════════════════');
console.log(' PRINT-LAYOUT AUDIT (D8) —', okN + '/' + checks.length, 'checks pass');
console.log('════════════════════════════════════════════════════════════');
checks.forEach(c => console.log('  ' + (c.ok ? '✔' : '✘') + ' ' + c.id.padEnd(22) + c.detail));
fs.mkdirSync(path.join(ROOT, 'tmp'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'tmp/print-layout-audit.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), checks }, null, 2));
console.log('\n → tmp/print-layout-audit.json');
process.exit(okN === checks.length ? 0 : 1);
