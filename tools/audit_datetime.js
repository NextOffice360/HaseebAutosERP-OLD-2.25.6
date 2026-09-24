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
/* v2.30.5 (W4.T4) — GATE detection: sirf DATE-sites count ho, number-formatting nahi.
   dateLocale   : toLocaleString/Date/Time jis line par dateStyle/timeStyle ho, YA
                  'en-US' + fraction-digits opts NA ho (wo number/money formatting hai)
   stampDisplay : .slice(0,16).replace('T',…) — hand-rolled datetime display
   adhocDate    : String(<expr>).slice(0,10) DISPLAY concat (type:'date' input values
                  aur payload lines exempt — wo functional ISO hain)
   getHours     : App_Core (DT engine internals) exempt */
let dateLocale = 0, stampDisplay = 0, adhocDate = 0; const siteRefs = [];
html.forEach(f => {
  const src = S('apps-script/' + f);
  const lines = src.split('\n');
  const a = (src.match(/fmt\.date\(/g) || []).length;
  const b = (src.match(/getHours\(\)|getMinutes\(\)/g) || []).length;
  const c = (src.match(/toLocaleString\(|toLocaleDateString\(|toLocaleTimeString\(/g) || []).length;
  const d = (src.match(/\.slice\(0,\s*1[06]\)/g) || []).length;      // YYYY-MM-DD slice patterns
  fmtDateCalls += a; getHours += b; toLocale += c; manualSlice += d;
  lines.forEach((ln, i) => {
    const tr = ln.trim();
    if (tr.startsWith('*') || tr.startsWith('/*') || tr.startsWith('//')) return;  /* comments nahi */
    if (f === 'App_Core.html' && /String\([^)]*\)\.slice\(0,\s*10\)/.test(ln)) return; /* engine ka fallback khud fmt hai */
    const isNumFmt = /toLocaleString\(\s*'en-US'/.test(ln);   /* is app mein number/money hamesha en-US */
    const hasDateWord = /dateStyle|timeStyle|toLocaleDateString|toLocaleTimeString|new Date|\.date\b|\bAt\b|lastSync/.test(ln);
    const isDateLocale = /toLocaleString\(|toLocaleDateString\(|toLocaleTimeString\(/.test(ln) && !isNumFmt && hasDateWord
      && !/typeof DT !== 'undefined' \? DT\.format/.test(ln);   /* fallback-ke-sath guard jaiz */
    if (isDateLocale) { dateLocale++; siteRefs.push(f + ':' + (i + 1) + ' dateLocale'); }
    if (/\.slice\(0,\s*16\)\.replace\(\s*["']T["']/.test(ln)) { stampDisplay++; siteRefs.push(f + ':' + (i + 1) + ' stampDisplay'); }
    const idSlice = /String\(([^)]*)\)\.slice\(0,\s*10\)/.test(ln) && /entityId|\.id\b|[a-zA-Z]Id\b/.test(ln);
    if (/String\([^)]*\)\.slice\(0,\s*10\)/.test(ln) && !idSlice && !/type:\s*['"]date['"]/.test(ln) && !/toISOString\(\)\.slice/.test(ln)) { adhocDate++; siteRefs.push(f + ':' + (i + 1) + ' adhocDate'); }
  });
  if (a + b + c + d >= 4) perFile.push({ file: f, fmtDate: a, getHours: b, locale: c, slice: d });
});
const gate = {
  dateLocale: { count: dateLocale, target: 0 },
  stampDisplay: { count: stampDisplay, target: 0 },
  adhocDate: { count: adhocDate, target: 0 },
  getHoursExempt: 'App_Core (DT engine fallback)',
  sites: siteRefs
};
out.gate = gate;
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
