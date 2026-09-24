# Haseeb Autos — v2.25.3 CHANGELOG

**Date:** 2026-09-23 · **Version:** `2.25.3` (Utils.gs ▸ `VERSION`)
**Base:** v2.25.2 (root-cause Esc fix + scan-parity gate) → ye build **mobile PWA overlays** ko
usi close/cancel contract par le aata hai, aur release **archive policy** shuru karta hai.

---

## 1 ▸ Mobile PWA overlays — Esc/close ka wahi contract (req 6) — ✅

Aap ki shikayat ("cancel button, close button not working in many popups") ka desktop proof
gate 54 (`modals-close`) tha — lekin **PWAs alag HTML documents hain** (pwa-pos / pwa-sm /
pwa-fo / pwa-wh), unka koi proof nahi tha. Audit mein 2 shared overlays mile jo Esc handle
**nahi** karte thay:

| Overlay | Pehle | Ab |
|---|---|---|
| Camera scan overlay (`Pwa_Shell ▸ scanWithCamera`) | sirf "✕ Cancel" button | **✕ + Esc + backdrop** (app ke baaki overlays jaisa) |
| Scan fallback modal (`Pwa_Shell ▸ showScanFallback`) | sirf ✕ button (Esc nahi) | **✕ + Esc + backdrop** |

Fix **shared** hai (`apps-script/Pwa_Shell.html`) — chaaron PWAs ko ek hi jagah se milta hai;
listeners overlay band hone par hat jate hain (leak nahi). Verified: `demo/pwa-sm|fo|wh.html`
mein `onEsc` present (9×), POS PWA ka apna layer-Esc pehle se theek tha.

## 2 ▸ Naya gate 55 — `pwa-overlays`: 114 PASS / 0 FAIL — ✅

Har PWA (390×844, asli Chromium) par **har overlay** ko **asli trigger** se khola jata hai,
phir har closer **alag alag** test hota hai:

| PWA | Overlays | Closers |
|---|---|---|
| pwa-pos | Scan fallback modal · **Bulk Add modal** (long-press / ⋯ Modal) · Cart drawer · Pay sheet · Receipt layer (scan → pay → ✓ Complete ka asli flow) | ✕ · Esc · Cancel · backdrop |
| pwa-sm | Scan fallback · Bulk Add (Sell tab) | ✕ · Esc · Cancel · backdrop |
| pwa-fo | Scan fallback · Bulk Add | ✕ · Esc · Cancel · backdrop |
| pwa-wh | Scan fallback · Bulk Add | ✕ · Esc · Cancel · backdrop |

Contract bhi assert hota hai: har overlay mein **✕ ya Cancel** ka raasta mojood ho, aur har overlay
**Esc** se band ho. Test ki 2 ghaltiyan bhi pakri gayin aur theek ki gayin (documented):
(i) ✕ dhoondte waqt cart line ka "✕ Remove" bhi match ho raha tha → ab `aria-label`
(remove/delete/clear/increase/decrease/cancel) filter hoti hai; (ii) POS bulk modal ka opener
asli long-press (`mousedown` → 520ms) hai → gate wahi path chalata hai (fallback: bulk mode ON → "⋯ Modal").

## 3 ▸ Release archive policy (aap ka sawal: purani zip kahan?) — ✅

Purani version zips supersede hone par delete ho rahi thin (aur ye project git repo nahi hai,
is liye wapas nahi aati). Ab policy badal di:

* `release/archive/README.md` — retention: kam az kam **pichhle 2 releases** (v2.25.2 zip
  wahin rakhi gayi hai).
* `tools/package.sh` mein note: naya version banane se pehle purana zip archive mein rakhein —
  **release packages khud-ba-khud delete nahi honge** ("workspace saaf karo" ka matlab sirf
  logs/probes/temp hai).
* Note: v2.24.x zips is policy se PEHLE delete ho chuki thin — unka reconstruction mumkin nahi
  (source ka history nahi hai).

## 4 ▸ Manual verify run ka flake — wajah pakri gayi (self-inflicted) — ✅

Aap ke interrupts ke baad **kai verify runs background mein zinda reh gaye thay**; jab maine
agla run chalu kiya to 3 suites + kai Chromium instances ek sath chal rahe thay → gates
`CdpPage.goto` par fail (`scan-parity`, `pwa-overlays`, `modals-close (1s)`). Sab stale runs
kill kar ke, demo server dobara kharra kar ke **ek clean run** kiya: **ALL 55 GATES GREEN (1083s)**.
Sabooq: us waqt `scan-parity` standalone 29/0 aur `modals-close` 84/0 aa rahe thay.

## Verification (is build ka)

`env -u HOME bash tools/verify.sh` → **ALL 55 GATES GREEN (1083s)** · log `tmp/verify253.log`
Is run mein: `pwa-overlays` **114/0** (naya) · `scan-parity` 29/0 · `modals-close` 84/0 ·
`labels-live` 16/0 · `grn-drawer` 23/0 · `demands` 13/0 · `salesman-stock` 10/0 · `smoke` 332/0 ·
`scan-coverage` 21/0 · `ui-polish` 62/0 · `typography` 0 problems · layout 0 problems
(1440/390/dark/overlays ×2/PWA ×2)।
Checklist: `release/REQUIREMENTS-CHECKLIST-v2.25.3.md` · Evidence: `release/AUDIT-EVIDENCE-v2.25.3.html` ·
Rendered shots: `release/shots-v2.25.3/`

## User-side checks (device / deployed backend)

* Physical scanner drill (Zx10) + chhape hue label ka paper par read-back.
* Live GAS + Drive image upload test.
* Deployed `F2` shortcut check on a keyed device.
* Mobile par PWA overlays: 📷 camera overlay aur scan-fallback modal — Esc (ya mobile back
  gesture) se band hone ka manual check.
