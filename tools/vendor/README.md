# tools/vendor — third-party test-only assets

| File | Origin | Version | License | Kyon |
|---|---|---|---|---|
| `zxing.min.js` | npm `@zxing/library` → `umd/index.min.js` | 0.23.0 | Apache-2.0 | Gate `labels-live` ka **300dpi raster decode** test: rendered label ka PNG screenshot isi decoder se padha jata hai (wahi library jo asli scanner apps use karti hain). Ye sirf `tools/` ke andar test ke liye hai — app runtime ise load **nahi** karta (app ka barcode/QR 100% dependency-free hai). |
