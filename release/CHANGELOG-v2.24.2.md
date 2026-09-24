# Haseeb Autos — v2.24.2

**Base:** v2.24.1 · **Tareekh:** 2026-09-23
**User ki demand:** *"plz fix this Barcode scanning logic in all pages, modals"* — is liye is dafa poora
**coverage audit** kiya gaya (har product-entry surface), gaps band kiye gaye, aur ek naya
**automated gate** bana diya jo aage aisi koi jagah chhoot na sake.

---

## 1. Shared scan primitives (App_UI2.html)

Pehle scan sirf `UI2.itemPicker` ke andar tha (line-building screens). Ab do shared helpers hain —
page-specific patch nahi, ek hi logic har jagah:

| Helper | Kaam |
|---|---|
| `UI2.scanRow(cfg)` | Standalone scan block: HID wedge (Enter **ya** 280ms settle), auto-clear + refocus, camera fallback (HaScan → PWA camera → prompt), status line jo **sirf message par** banti hai |
| `UI2.attachScan(input, onScan)` | Maujooda search/filter box ko scan-aware banata hai (naya input add kiye baghair). Plain typing = filter; scan-shaped payload (8+ digits ya `CODE-1234`) = scan action |
| `data-scan-aware="1"` | Audit/test nishaan (itemPicker ka search box + har attachScan input par) |

## 2. Jo gaps mile — aur band kiye gaye

| Surface | Pehle | Ab |
|---|---|---|
| **Sales ▸ Return drawer** | Koi scan nahi (sirf qty boxes) | **Scan-to-return**: barcode scan → us line ki return qty +1, ✅/⚠ status, invalid code par qty safe |
| **Warehouse ▸ Put-away / move** | Plain "Item dhoondain…" box | Shared scan block: scan → item row + bin selector; "Nahi mila" par saaf warning |
| **Salesman ▸ Current Stock** | Filter box scan-free | Scan-aware filter: barcode → us item par 1 row filter |
| **Purchase ▸ Supply Analysis** | Filter box scan-free **aur** live binding hi nahi thi (type karne par kuch nahi hota tha) | Scan-aware + dono tables live re-render (Product / Supplier / Status filters ab foran lagte hain) |
| **Purchase ▸ Returns (tab khaali tha)** | Backend par `purchase.listReturns` / `purchase.saveReturn` + permission tha, magar **screen par koi UI nahi** | Poora flow: returns list (return no., supplier, GRN ref, reason, total, status) + "↩ New purchase return" form — shared **scan-first picker**, supplier/date/reason, qty+cost editable, Post return |

### Chhote bug jo isi audit mein pakre gaye
- **Supply Analysis**: supplier reliability table product query se filter ho rahi thi (product text likhne par supplier rows ghayab) — theek kiya.
- **Demo mock route mismatch**: demo `purchase.returns.list` deta tha jabke screen/backend `purchase.listReturns` — is liye demo mein Returns tab "backend connected nahi" dikhata tha. Mock mein asli naam add kiya + frontend resilient (backend purana ho to bhi UI khulta hai).
- **Blank status pill**: naya scan status line khaali DOM element ki tarah reh jati thi (tabs audit ne pakra) → ab lazily banti hai, message na ho to DOM mein kuch nahi.

## 3. Naya gate + test coverage

- **`tools/audit_scan_coverage.js` (NAYA, verify.sh mein 48th gate)**: 17 live surfaces asli Chromium mein kholta hai aur sabit karta hai ke scan field maujood hai; apna demo server khud uthata hai; `release/scan-coverage-report.html` report deta hai. PWA screens alag harness par **SKIP** likhe jate hain (chhupaye nahi jate).
- **`tools/test_browser_scan.js`**: 52 → **61 checks** (+9 naye): Return scan/invalid, Put-away scan, Salesman Stock scan-filter, Purchase Returns scan.
- **`tools/audit_tabs.js`**: 656 checks — Warehouse putaway ka blank block pakra aur fix hua.

## 4. Version
- `Utils.gs` → `VERSION: '2.24.2'` · demo / PWA / dist-static sab dobara build
- Release zip: `release/haseeb-autos-v2.24.2.zip`

---

## Verification (final bytes par)

| Gate | Result |
|---|---|
| `bash tools/verify.sh` — **48 gates** | **ALL GATES GREEN** (842s) |
| `tools/audit_scan_coverage.js` | 17 PASS / 0 FAIL / 4 SKIP (PWA) |
| `tools/test_browser_scan.js` (real Chrome) | **61 / 0** |
| `tools/test_ui_polish.js` | **57 / 0** |
| `tools/test_modals_close.js` | **82 / 0** |
| `tools/audit_tabs.js` | 656 checks, 0 fail |
| `tools/verify_punchlist.js` | 117 / 117 |
| `audit_layout.js` (1440 · 390 · dark · overlays · PWA) | 0 problems |

## Coverage report
`release/scan-coverage-report.html` — har page/modal ka natija ek table mein.
