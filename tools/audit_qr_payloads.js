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
console.log(' QR/BARCODE PAYLOAD AUDIT (D1) — sites + resolvability');
console.log('════════════════════════════════════════════════════════════');
console.log(' sites:', sites.length, '| resolvable:', sites.filter(s => s.resolvable).length);
sites.forEach(s => console.log('   ' + s.file + ':' + s.line + '  [' + s.fmt + ']' + (s.resolvable ? ' ✓HA' : ' ✗') + '  ' + s.payload));
console.log('\n Standard (D2): HA:INV:<no> · HA:ITM:<id> · HA:CUS:<id> · HA:SUP:<id> · HA:DOC:<uuid>');
fs.mkdirSync(path.join(ROOT, 'tmp'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'tmp/qr-payloads-audit.json'), JSON.stringify({ generatedAt: new Date().toISOString(), sites }, null, 2));
console.log(' → tmp/qr-payloads-audit.json');
process.exit(0);
