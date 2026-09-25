#!/usr/bin/env node
/**
 * tools/audit_action_labels.js — v2.30.5 (enterprise mandate §4, P1)
 * ---------------------------------------------------------------------------
 * ACTION-LABEL AUDIT: ghair-wazeh button labels (OK/Submit/Process/Continue)
 * ki list — har hit ke liye behtar verb-label ka mauqa. Report-only (fixes
 * alag slices me, confirmation-dialog defaults jaiz samjhe jate hain jab tak
 * context label ke sath ho).
 *
 *   node tools/audit_action_labels.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const AMBIG = /\b(?:label:\s*'(OK|Submit|Process|Continue|Go)'|>(OK|Submit|Process|Continue)<)/g;
const files = fs.readdirSync(path.join(ROOT, 'apps-script')).filter(f => f.endsWith('.html'));
const hits = [];
files.forEach(f => {
  const lines = fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf8').split('\n');
  lines.forEach((ln, i) => {
    AMBIG.lastIndex = 0;
    if (AMBIG.test(ln)) hits.push({ file: f, line: i + 1, text: ln.trim().slice(0, 110) });
  });
});
console.log('════════════════════════════════════════════════════════════');
console.log(' ACTION-LABEL AUDIT  (mandate §4 — ambiguous labels)');
console.log('════════════════════════════════════════════════════════════');
console.log(' hits:', hits.length);
hits.forEach(h => console.log('   ' + h.file + ':' + h.line + '  ' + h.text));
fs.mkdirSync(path.join(ROOT, 'tmp'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'tmp/action-labels-audit.json'), JSON.stringify({ generatedAt: new Date().toISOString(), hits: hits }, null, 2));
console.log('\n → tmp/action-labels-audit.json  (fixes = P2 polish slice)');
process.exit(0);
