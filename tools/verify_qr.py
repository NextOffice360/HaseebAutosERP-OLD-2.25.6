#!/usr/bin/env python3
"""Compare JS QR matrices (/tmp/qr_js.json) with the reference `qrcode` encoder."""
import json, sys
try:
    import qrcode, qrcode.util
    from qrcode.constants import ERROR_CORRECT_L
except ImportError:
    print('pip install qrcode   # needed for reference comparison'); sys.exit(2)

data = json.load(open('/tmp/qr_js.json'))
allok = True
for rec in data:
    v = int(rec['autoVersion'])
    q = qrcode.QRCode(version=v, error_correction=ERROR_CORRECT_L, box_size=1, border=0)
    q.add_data(qrcode.util.QRData(rec['text'], mode=qrcode.util.MODE_8BIT_BYTE))
    q.make(fit=False)
    ref = [''.join('1' if m else '0' for m in row) for row in q.modules]
    matches = [m for m in range(8) if rec['masks'][str(m)] == ref]
    ok = bool(matches)
    allok = allok and ok
    print(('OK  ' if ok else 'BAD '), 'v%d' % v, 'len=%3d' % len(rec['text']),
          'matching_masks=', matches, 'js_auto=', rec['autoMask'])
print('\nQR ENCODER VERIFIED AGAINST REFERENCE' if allok else '\nFAILURES REMAIN')
sys.exit(0 if allok else 1)
