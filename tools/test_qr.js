/**
 * test_qr.js — verifies the offline QR encoder in apps-script/App_QR.html
 * against the reference `qrcode` python library (byte mode, ECC level L).
 *
 *   node tools/test_qr.js            # dumps matrices to /tmp/qr_js.json
 *   python3 tools/verify_qr.py       # compares them with the reference encoder
 */
const fs = require('fs'), vm = require('vm'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'App_QR.html'), 'utf-8');
const code = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
const sandbox = { console, unescape, encodeURIComponent,
  btoa: s => Buffer.from(s, 'binary').toString('base64'), Math, Array, Object, String, Number, Error };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const QR2 = sandbox.QR2;
const tests = ['HELLO', 'FL00000', 'https://haseeb.test/i/FL00001',
  'INV-SDQ-01001|5440.50|2026-09-15', 'حسیب آٹوز', 'A'.repeat(80)];
const out = tests.map(t => {
  const auto = QR2.matrix(t, 'L');
  const rec = { text: t, autoVersion: (auto.length - 17) / 4, autoMask: auto.mask, masks: {} };
  for (let m = 0; m < 8; m++) rec.masks[m] = QR2.matrix(t, 'L', m).map(r => r.join(''));
  return rec;
});
fs.writeFileSync('/tmp/qr_js.json', JSON.stringify(out));
console.log('✔ dumped ' + out.length + ' QR matrices → /tmp/qr_js.json');
console.log('  (compare with: python3 tools/verify_qr.py)');
// structural sanity: svg output is non-empty and well formed
const svgText = QR2.svg('FL00000', { size: 120 });
console.log('  svg ok:', svgText.indexOf('<svg') === 0 && svgText.indexOf('</svg>') > 0, '(' + svgText.length + ' bytes)');
