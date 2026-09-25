#!/usr/bin/env node
/**
 * tools/audit_i18n.js — v2.30.5 (D1, doc-intel §7)
 * ---------------------------------------------------------------------------
 * LOCALIZATION AUDIT: hard-coded Roman-Urdu string literals jo EN mode me leak
 * hote hain (T.t engine bypass). Report-only baseline — fix batches D7 me.
 * Curated unambiguous Roman-Urdu markers (word-boundary) — false-positive kam.
 *   node tools/audit_i18n.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

/* unambiguous markers (roman-urdu jaise shabd jo English me nahi milte) */
const MARKERS = [
  'karein', 'karna', 'karke', 'karti', 'karta', 'nahi', 'nahin', 'mojood', 'zaroori',
  'dikhaye', 'dikhayein', 'chunein', 'bhejein', 'lazmi', 'darkaar', 'shuru', 'kholein',
  'tabdeel', 'mukammal', 'daakhil', 'koshish', 'dobara', 'dubara', 'wapis', 'baqaya',
  'udhaar', 'wasooli', 'ghalat', 'sahi hai', 'mil gaya', 'ho gaya', 'ho gayi', 'milta',
  'banayein', 'badlein', 'khareed', 'farq', 'taadaad', 'talaash', 'dhoondein', 'ijazat',
  'mehfooz', 'muntaqil', 'tasdeeq', 'rawana', 'mukhtalif', 'mutabiq', 'biltafseel'
];
const RE = new RegExp('([\'"`])((?:[^\'"\\\\]|\\\\.)*?\\b(?:' + MARKERS.join('|') + ')\\b(?:[^\'"\\\\]|\\\\.)*?)\\1', 'gi');
/* string-literals only (quotes ke andar), T.t( calls ke andar wale fallbacks bhi
   pakde ga — wo theek hain (EN default hota hai to unhe count nahi karte): */
const files = fs.readdirSync(path.join(ROOT, 'apps-script')).filter(f => f.endsWith('.html'));
const rows = [];
let totalHits = 0, totalTt = 0;
files.forEach(f => {
  const src = fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf8');
  const tt = (src.match(/\bT\.t\s*\(/g) || []).length;
  totalTt += tt;
  const hits = [];
  let m; RE.lastIndex = 0;
  const lines = src.split('\n');
  lines.forEach((ln, i) => {
    if (/^\s*(\/\*|\*|\/\/|<!--)/.test(ln)) return;          /* comments skip */
    if (new RegExp('\\b(?:' + MARKERS.join('|') + ')\\b', 'i').test(ln) && /['"`]/.test(ln)) {
      hits.push({ line: i + 1, text: ln.trim().slice(0, 90) });
    }
  });
  if (hits.length) { rows.push({ file: f, tt: tt, hits: hits.length, samples: hits.slice(0, 3) }); totalHits += hits.length; }
});
rows.sort((a, b) => b.hits - a.hits);
console.log('════════════════════════════════════════════════════════════');
console.log(' I18N AUDIT (D1) — hard-coded Roman-Urdu literals');
console.log('════════════════════════════════════════════════════════════');
console.log(' total hits:', totalHits, '| files:', rows.length, '| T.t call-sites:', totalTt);
rows.slice(0, 15).forEach(r => console.log('   ' + String(r.hits).padStart(4) + '  ' + r.file + '  (T.t: ' + r.tt + ')  e.g. ' + r.samples[0].text.slice(0, 60)));
fs.mkdirSync(path.join(ROOT, 'tmp'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'tmp/i18n-audit.json'), JSON.stringify({ generatedAt: new Date().toISOString(), totalHits, totalTt, files: rows }, null, 2));
console.log('\n → tmp/i18n-audit.json  (EN-purity fixes = D7 batches)');
process.exit(0);
