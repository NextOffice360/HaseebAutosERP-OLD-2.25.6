# Haseeb Autos — v2.25.7 CHANGELOG

**Date:** 2026-09-24 · **Version:** `2.25.7` (Utils.gs ▸ `VERSION`)
**Base:** v2.25.6 → ye build requirement **#5 (Labels)** ko asli meaning mein poora karta hai:
label ka barcode ab **chhapne ke baad wapas scan hota hai**. Galat nahi — is round mein
**do asli print bugs** mile jo machine test ne pakre, aur dono fix huye.

---

## 1 ▸ Asli bug #1 — barcode itna patla ho jata tha ke chhapne par mil jata (req 5) — ✅ fixed

**Reproduce:** 50×30mm retail label + QR + 13-digit barcode → `Print.labelsHtml` mein
`modW = Math.max(0.25, …)` tha. 0.25 CSS px = **0.066mm** narrow module (spec minimum
**0.19mm**). QR jo jagah kha jata tha us ke sath bars 0.07mm par sikur jate thay →
**chhapne par bars mil jate thay** aur scanner padh hi nahi sakta tha.
300dpi raster test ne yahi dikhaya: **sirf 13 bars** bache (75 hone chahiye) aur ZXing decode **FAIL**.

**Fix (shared `Print.labelsHtml` — preview + print dono isi se bante hain):**
* **Printable floor:** narrow module kabhi `0.19mm` (ANSI/GS1 Code 39 minimum) se neeche nahi.
* **Jab jagah kam ho:** QR apni **alag row** mein chala jata hai (bars ko poori chaurai) aur
  quiet zone spec minimum (`>=10X`) par aa jata hai — phir bhi floor se neeche na jaye to.
* **Purana double quiet-zone bug bhi gaya:** pehle `availWpx` (jismein quiet zone pehle se
  nikal chuki thi) se quiet zone **dobara** minus hoti thi → bars be-wajah 20% patle.
  Ab chaurai label ki asli inner width se nikalti hai → bars baray/clear.
* **Koi khamoshi se unscannable label nahi:** agar koi code kisi size par waqai fit na ho
  (misal 30×15mm par 25-character code), label par `data-lw="1"` mark hota hai aur
  **designer preview mein saaf warning** aata hai — "bara label chunein ya chhota code".

## 2 ▸ Asli bug #2 — 203dpi thermal printer par long codes scan nahi hote thay (req 5) — ✅ fixed

**Reproduce:** 13-digit code 50×30 par aur 18-character code 60×40 par **203dpi** par
raster decode **FAIL** (narrow module 0.125mm). Zx10/hardware printers aksar 203dpi hote hain —
yani chhapa hua label wahan bhi scan nahi hota tha. Floor + adaptive layout ke baad wahi
labels 203dpi par decode hote hain (`0.196mm` / `0.198mm` designed module).

## 3 ▸ Naya gate evidence (gate 60 `labels-live`): 16 → **27 PASS / 0 FAIL**

* **300dpi print simulation:** label ko 300dpi par rasterize karke PNG screenshot liya jata
  hai aur **ZXing** (`tools/vendor/zxing.min.js`, wahi decoder jo scanner apps use karti hain)
  se padha jata hai → decoded text **exact wahi code** hona chahiye. 6 real-world cases
  (50×30 short code · 50×30 13-digit · 50×30 + QR · 40×25 price · 60×40 18-char · 70×50 WH + QR).
* **203dpi thermal simulation:** wahi 5 cases.
* **Printable floor:** har label ka **designed** narrow module ≥ 0.19mm (DOM se naapa jata hai).
* **bars merge nahi:** bug case par 75 alag bars (pehle 13) — module ≥ 0.22mm.
* **QR bhi scannable:** QR image se decode ho kar payload wahi (`CODE:…;SKU:…`) — offline encoder.
* **Stacked layout:** QR bars ke **neeche** (alag row), overlap nahi, frame ke andar.
* **Chhote code par layout purana hi** (koi zabardasti stacking/warning nahi — preserve).
* **Warning wiring:** `data-lw` marker + designer ka `#lblWarn` chip.

**Sensitivity proven (dono taraf):** purana bug wapas lagane par gate **5 checks FAIL** karta hai —
`300dpi decode FAIL (ean13+QR)`, `203dpi decode FAIL (ean13, long18)`, `floor 0.095mm`,
`bars merge (runs=13)`, `stacked layout ghayab`. Fix ke sath **27/0**. Yani checks khokhle nahi.

## 4 ▸ Test-only vendor

`tools/vendor/zxing.min.js` (Apache-2.0, `@zxing/library` 0.23.0) — sirf **test** ke liye;
app runtime ise load nahi karta (app ka barcode/QR 100% dependency-free hai). Origin/license
`tools/vendor/README.md` mein. App ka size/waparz is se nahi barhta.

## Verification (is build ka)

`env -u HOME bash tools/verify.sh` → **ALL 56 GATES GREEN (1161s)** · log `tmp/verify257.log`
`labels-live` **27/0** · `modals-close` 91/0 · `pwa-overlays` 124/0 · `pay-ledger` 24/0 ·
`scan-parity` 29/0 · `grn-drawer` 23/0 · `demands` 13/0 · `salesman-stock` 10/0 ·
`smoke` 332/0 · `scan-coverage` 21/0 · `ui-polish` 62/0 · `check_pwa` ✔ · `pwa-ui` 66/0 ·
typography 0 problems · layout 0 problems (1440/390/dark/overlays×2/PWA×2)।

Checklist: `release/REQUIREMENTS-CHECKLIST-v2.25.7.md` · Evidence: `release/AUDIT-EVIDENCE-v2.25.7.html` ·
Shots: `release/shots-v2.25.7/` · Archive: `release/archive/` (v2.25.3–v2.25.6)

## User-side checks (device / paper)

* **Asli label print karke scanner se padhein** (barcode + QR) — machine simulation strong hai,
  lekin asli printer/ink/dot-gain ka faisla aap ke device par hota hai.
* Un labels par jo **13-digit** barcode ya 18+ character code use karte hain (chhota code
  pehle se theek tha).
* Agar kisi item ka code bohat lamba ho: designer preview ka **warning** dekhein aur bara label chunein.
