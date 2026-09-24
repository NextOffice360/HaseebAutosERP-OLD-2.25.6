# Haseeb Autos — v2.24.3

**Base:** v2.24.2 · **Tareekh:** 2026-09-23
**Demand:** *"Barcode scanning logic in all pages, modals"* — is dafa **PWA apps** ka number aaya:
unme barcode scan ka **camera** path tha, magar asli **handheld scanner (keyboard wedge)** kaam
nahi karta tha. Ab chaaron PWA bhi POS jaisa behave karte hain, aur scan coverage mein
**koi SKIP baqi nahi**.

---

## 1. Asli gap jo mila — PWA apps par hardware scanner

| PWA | Pehle | Ab |
|---|---|---|
| **Salesman** (Sell / My stock) | 📷 camera button se scan hota tha; **handheld scanner** sirf text type kar deta tha (Enter par kuch nahi) | Hardware scan → item add/filter + **field clear** + ✅ toast |
| **Field order** | Wahi masla — Enter par kuch nahi | Scan → item add + field clear |
| **Warehouse** (receive / putaway / count) | Camera path tha, wedge nahi | Scan → item pick + field clear |
| **POS PWA** | Pehle se theek | (unchanged — regression test) |

### Fix (shared)
`Pwa_Shell.html` mein naya **`PWA.attachScan(input, cfg)`** — bilkul wahi semantics jo main app
ke `UI2.attachScan` mein hai:

- **Enter** ya **280ms settle** (Enter-less scanners) par poora code-shaped payload
- exact item hit → `onHit(item)` + field CLEAR + refocus (agla scan ready)
- multi hit → list se chunne ka toast
- miss → warn toast + field clear
- input par `data-scan-aware="1"` nishaan (audit/tests ke liye)

Phir teeno PWAs ke search/scan boxes isi se wire kiye gaye (page-specific patch nahi —
ek helper, teen call sites).

---

## 2. Scan coverage ab ZERO SKIP

`tools/audit_scan_coverage.js` ne pehle PWA screens ko **SKIP** likha tha (alag harness).
Ab wo khud chaaron PWA pages asli browser mein kholta hai, hardware-scan wedge chalata hai,
aur verify karta hai ke item handle hua + field clear hui + zero page errors.

**21 surfaces · PASS 21 · FAIL 0 · SKIP 0**
Report: `release/scan-coverage-report.html`

---

## 3. Version
- `Utils.gs` → `VERSION: '2.24.3'`
- demo / PWA (chaaron) / dist-static sab dobara build
- Release zip: `release/haseeb-autos-v2.24.3.zip` (v2.24.2 superseded)

---

## Verification (final bytes par)

| Gate | Result |
|---|---|
| `bash tools/verify.sh` — 48 gates | **ALL GATES GREEN** |
| `tools/audit_scan_coverage.js` | **21 / 0 / 0 SKIP** |
| `tools/test_browser_scan.js` (real Chrome) | 61 / 0 |
| `tools/test_ui_polish.js` | 57 / 0 |
| `tools/test_modals_close.js` | 82 / 0 |
| `tools/audit_tabs.js` | 656 / 0 |
| `tools/verify_punchlist.js` | 117 / 117 |
| `audit_layout.js` | 0 problems |
