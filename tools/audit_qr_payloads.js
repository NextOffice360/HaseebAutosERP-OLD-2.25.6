#!/usr/bin/env node
/**
 * tools/audit_qr_payloads.js — v2.30.5 (D1, doc-intel §1/§2)
 * ---------------------------------------------------------------------------
 * QR/BARCODE PAYLOAD AUDIT: har QR/barcode generation site ka payload format +
 * resolvability verdict (scanner se record khulta hai ya nahi). Report-only.
 *   node tools/audit_qr_payloads.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const files = fs.readdirSync(path.join(ROOT, 'apps-script')).filter(f => f.endsWith('.html'));
const sites = [];
files.forEach(f => {
  const lines = fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf8').split('\n');
  lines.forEach((ln, i) => {
    if (/\bQR\.dataUrl\s*\(|QR2\.svg\s*\(|QR2\.dataUrl\s*\(|JsBarcode|\.toBarcode|barcodegen/i.test(ln)) {
      const payload = (ln.match(/(?:dataUrl|svg)\s*\(\s*([^,)]{3,80})/) || [])[1] || '?';
      let fmt = 'raw';
      if (/JSON\.stringify|JSON\.parse/.test(payload)) fmt = 'json';
      else if (/\w+:\s*'\s*\+|\+ .*;/.test(payload)) fmt = 'kv';
      const resolvable = /HA:(INV|ITM|CUS|SUP|DOC|PAY):/.test(payload);
      sites.push({ file: f, line: i + 1, payload: payload.trim().slice(0, 70), fmt, resolvable });
    }
  });
});
console.log('════════════════════════════════════════════════════════════');
console.log(' QR/BARCODE PAYLOAD AUDIT (D1) — sites + resolvability [GATE]');
console.log('════════════════════════════════════════════════════════════');
console.log(' sites:', sites.length, '| resolvable:', sites.filter(s => s.resolvable).length);
sites.forEach(s => console.log('   ' + s.file + ':' + s.line + '  [' + s.fmt + ']' + (s.resolvable ? ' ✓HA' : ' ✗') + '  ' + s.payload));
console.log('\n Standard (D2): HA:INV:<no> · HA:ITM:<id> · HA:CUS:<id> · HA:SUP:<id> · HA:DOC:<uuid>');
fs.mkdirSync(path.join(ROOT, 'tmp'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'tmp/qr-payloads-audit.json'), JSON.stringify({ generatedAt: new Date().toISOString(), sites }, null, 2));
console.log(' → tmp/qr-payloads-audit.json');
/* v2.30.9 (r11) — GATE: report-only nahi, ab fail bhi karta hai.
   (1) har QR/Barcode EMITTER ka payload resolvable HA: ho — variable payloads ke
       liye 8-line look-back; documented exceptions: `.qr` registry-backed rows,
       url/link QR (link share, doc-code nahi), DAYREP session-info JSON.
   (2) apps-script me koi naya 'INV:'-style non-HA emitter na likha ja sake. */
const srcCache = {};
files.forEach(f => { srcCache[f] = fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf8').split('\n'); });
function payloadResolves(s) {
  const p = s.payload.trim();
  if (/HA:(INV|ITM|CUS|SUP|DOC|PAY):/.test(p)) return 'HA';
  const lines = srcCache[s.file] || [];
  if (p.indexOf('JSON.stringify') === 0 && lines.slice(s.line - 1, s.line + 4).join('\n').match(/\bdoc:\s*'DAYREP'/)) return 'DAYREP-INFO'; /* session QR — DOC-INTEL-PLAN remnant */
  if (p === 'url' || p === 'link' || /^r\.qr$/.test(p)) return 'REGISTRY/LINK'; /* link QR ya registry row */
  if (/^[A-Za-z_$][\w$]*$/.test(p)) {                               /* variable → look-back */
    const lines = srcCache[s.file] || [];
    for (let j = s.line - 2; j >= Math.max(0, s.line - 9); j--) {
      const m = lines[j].match(new RegExp('\\b' + p + '\\s*=\\s*(.+)'));
      if (m && /HA:(INV|ITM|CUS|SUP|DOC|PAY):/.test(m[1])) return 'HA-VAR';
      if (m && /=/.test(m[1])) break;                               /* doosri assignment mil gayi */
    }
  }
  return null;
}
const badEmit = [];
sites.forEach(s => { s.verdict = payloadResolves(s); if (!s.verdict) badEmit.push(s); });
const legacy = [];
files.forEach(f => {
  if (/'INV:'\s*\+/.test(srcCache[f].join('\n'))) legacy.push(f);
});
let fails = 0;
if (badEmit.length) { fails++; console.log(' ✖ non-HA emitters: ' + badEmit.map(s => s.file + ':' + s.line + ' (' + s.payload + ')').join(', ')); }
if (legacy.length) { fails++; console.log(' ✖ legacy INV: emitter: ' + legacy.join(', ')); }
console.log(fails ? ' QR GATE   FAIL (' + fails + ')' : ' QR GATE   PASS — ' + sites.length + ' sites (' + sites.filter(s => s.verdict === 'HA' || s.verdict === 'HA-VAR').length + ' HA, baqi documented exceptions)');
process.exit(fails ? 1 : 0);
