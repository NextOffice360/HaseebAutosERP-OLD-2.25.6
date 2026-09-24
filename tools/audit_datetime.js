#!/usr/bin/env node
/* ============================================================================
   AUDIT — Global Date/Time/Timestamp system  (spec Part-1 §8 · §18 #6)
   ----------------------------------------------------------------------------
   SIRF dekhta hai. Sawal:
     1. Backend + frontend mein date/time banane/format karne ke kitne tareeqe hain?
     2. Kitni jagah SECONDS ya TIMEZONE ka koi khayal nahi?
     3. Kitni jagah raw toISOString()/getHours() se display ban raha hai
        (yani ek shared policy ke bajaye ad-hoc formatting)?
     4. Records par "created/updated" full timestamp dikhta hai ya sirf date?
   Output: tmp/datetime-audit.json + console summary
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const S = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

const out = { generatedAt: new Date().toISOString(), backend: {}, frontend: {}, records: {}, display: {} };

/* ---------- 1 ▸ backend ---------- */
const gs = fs.readdirSync(path.join(ROOT, 'apps-script')).filter(f => f.endsWith('.gs'));
let isoCalls = 0, toIsoCalls = 0, tzRefs = 0, dateOnly = 0, display = [];
gs.forEach(f => {
  const src = S('apps-script/' + f);
  isoCalls += (src.match(/\bU\.iso\(/g) || []).length;
  toIsoCalls += (src.match(/toISOString\(\)/g) || []).length;
  tzRefs += (src.match(/getScriptTimeZone|Asia\/Karachi|Session\.getScriptTimeZone/g) || []).length;
  dateOnly += (src.match(/\bU\.dateOnly\(/g) || []).length;
  if (/createdAt|updatedAt/.test(src)) {
    out.records[f] = {
      createdAtWrites: (src.match(/createdAt\s*[:=]/g) || []).length,
      updatedAtWrites: (src.match(/updatedAt\s*[:=]/g) || []).length
    };
  }
});
out.backend = { files: gs.length, isoCalls, rawToIso: toIsoCalls, tzRefs, dateOnlyCalls: dateOnly };

/* ---------- 2 ▸ frontend formatting sites ---------- */
const html = fs.readdirSync(path.join(ROOT, 'apps-script')).filter(f => f.endsWith('.html'));
let fmtDateCalls = 0, getHours = 0, toLocale = 0, manualSlice = 0, perFile = [];
html.forEach(f => {
  const src = S('apps-script/' + f);
  const a = (src.match(/fmt\.date\(/g) || []).length;
  const b = (src.match(/getHours\(\)|getMinutes\(\)/g) || []).length;
  const c = (src.match(/toLocaleString\(|toLocaleDateString\(|toLocaleTimeString\(/g) || []).length;
  const d = (src.match(/\.slice\(0,\s*1[06]\)/g) || []).length;      // YYYY-MM-DD slice patterns
  fmtDateCalls += a; getHours += b; toLocale += c; manualSlice += d;
  if (a + b + c + d >= 4) perFile.push({ file: f, fmtDate: a, getHours: b, locale: c, slice: d });
});
out.frontend = { files: html.length, fmtDateCalls, getHours, toLocale, manualSlice, busiest: perFile.sort((x, y) => (y.fmtDate + y.getHours + y.locale + y.slice) - (x.fmtDate + x.getHours + x.locale + x.slice)).slice(0, 8) };

/* ---------- 3 ▸ settings: kitni cheezein configurable hain ---------- */
const schema = S('apps-script/Schema.gs');
const cfg = S('apps-script/Config.gs');
const dtKeys = (schema.match(/'(?:dt|date|time)\.[a-zA-Z.]+'/g) || []).concat(cfg.match(/key:\s*'(?:dt|date|time)\.[a-zA-Z.]+'/g) || []);
out.settings = {
  existing: ['timezone (Config.gs:45, default Asia/Karachi)', 'job.timezone (Config.gs:541)'],
  missing: ['dt.format (date-only/date+time/full)', 'dt.hour12', 'dt.seconds', 'dt.showTime (global visibility)', 'dt.showInTables', 'dt.dateStyle'],
  keysFound: dtKeys
};

/* ---------- 4 ▸ records par timestamp display ---------- */
let createdShown = 0, updatedShown = 0, fullStampShown = 0;
html.forEach(f => {
  const src = S('apps-script/' + f);
  if (/Created\b|createdAt/.test(src)) createdShown += (src.match(/Created['":\s]/g) || []).length;
  if (/Updated\b|updatedAt/.test(src)) updatedShown += (src.match(/Updated['":\s]/g) || []).length;
  fullStampShown += (src.match(/fmt\.date\([^)]*,\s*true\s*\)/g) || []).length;   // withTime = true wale
});
out.display = { createdLabels: createdShown, updatedLabels: updatedShown, withTimeSites: fullStampShown };

/* ---------- 5 ▸ consistency check: do jagah alag default format? ---------- */
const utilFmt = /formatDate: function/.test(S('apps-script/Utils.gs'));
const feFmt = /date\(v, withTime\)/.test(S('apps-script/App_Core.html'));
out.consistency = {
  backendHasFormatter: utilFmt, frontendHasFormatter: feFmt,
  sameDefault: false,
  note: 'Backend U.iso() = yyyy-MM-ddTHH:mm:ss (seconds) · frontend fmt.date = YYYY-MM-DD HH:mm (BINA seconds) → ek hi record do jagah do shakal mein'
};

fs.writeFileSync(path.join(ROOT, 'tmp/datetime-audit.json'), JSON.stringify(out, null, 2));

console.log('══════════════════════════════════════════════════════════════');
console.log(' DATE/TIME/TIMESTAMP AUDIT  (spec §8 · §18 #6)');
console.log('══════════════════════════════════════════════════════════════');
console.log(' backend : U.iso() calls', out.backend.isoCalls, '· raw toISOString()', out.backend.rawToIso, '· tz refs', out.backend.tzRefs);
console.log(' frontend: fmt.date()', out.frontend.fmtDateCalls, '· getHours/getMinutes', out.frontend.getHours,
  '· toLocale*', out.frontend.toLocale, '· .slice(0,10/16)', out.frontend.manualSlice);
console.log(' settings: mojood =', out.settings.existing.length, '· GAYAB =', out.settings.missing.length, '→', out.settings.missing.join(', '));
console.log(' display : "Created" labels', out.display.createdLabels, '· "Updated"', out.display.updatedLabels, '· withTime sites', out.display.withTimeSites);
console.log(' consistency:', out.consistency.note);
console.log('');
console.log(' Sab se busy files (format points):');
out.frontend.busiest.forEach(f => console.log('   ' + f.file.padEnd(24) + ' fmt.date=' + f.fmtDate + ' getHours=' + f.getHours + ' locale=' + f.locale + ' slice=' + f.slice));
console.log('');
console.log(' → tmp/datetime-audit.json');
