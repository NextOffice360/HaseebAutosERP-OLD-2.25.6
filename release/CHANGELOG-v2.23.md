# Changelog — v2.23.x line (consolidated)

## v2.23.21 — Overlay-level layout audit + 4 real touch/overflow fixes
The layout audit (tools/audit_layout.js --overlays) now PERMANENTLY measures the new
overlays — alerts panel, label print modal, bulk add modal — plus its measurement was
made honest: offcanvas routes (.offcanvas) included, row-click fallback for card grids,
sale step targets the real detail overlay (its old 'print preview' step was measuring a
popup window that never exists in-app → false "overlay didn't open"), and
checkbox/radio inside a <label> or a >=40px clickable row is exempt (the hit area IS
the label/row — WCAG-correct sizing, not number-fudging).

Findings → real fixes (all were genuine, none hidden):
- UI.form type:'switch' rendered the BARE 13px checkbox instead of the toggle — every
  form boolean (Users form: 44 tiny taps incl. input#f_active). Now renders the full
  UI2.toggle (pill + On/Off text wrap the input; refs/values()/aria unchanged). File: App_Core.
- Reorder status chips (.re-box) 26px → min-height 32px; PO line qty/rate inputs and
  Bulk-list qty inputs got min-height 32px. File: Styles.html.
- Take Order @390px: category <select> (433px intrinsic, long option text) overflowed
  the viewport in light AND dark → min-width:0 + max-width:140px + ellipsis. File: App_Orders.

Verified on final bytes (2.23.21): overlays 0 problems (1440 & 390, all 11 steps);
screens sweep 0 problems × 4 (1440/390 × light/dark); tools/test_browser_scan.js 27/27;
check_pwa all pass; smoke.js 332/0. Old v2.23.20 zip removed; this is the current release.

## v2.23.20 — Label printing actually works (dead button found via real-browser audit)
Deep browser re-testing found the 🏷 Label button chain was BROKEN in the current build:
`printLabels()` called `Print.labelHtml(...)` — a function that never existed — with fake
rows ({name:id}); the real renderer was `Print.labelsHtml`. The old screens file also
carried a second, poorer label implementation shadowing the alias. Fixed at the SHARED
logic level, one flow everywhere:

- **`Print.labelFlow(ids)`** (App_Barcode.html ▸ Print): resolves REAL item rows via
  `items.labels` (server) with cached-catalog fallback (offline/demo), then a modal with
  the **6 professional GS1 templates** (Compact 30×20 · Standard retail 50×30 · Price
  focus 50×25 · Inventory 60×40 · QR+Barcode 50×30 · Warehouse 80×50), copies per item,
  and a LIVE preview; "Print sheet" opens the A4 popup. `Print.LABEL_TEMPLATES` is now the
  single source of truth — the App_Print designer reads the same list (its old duplicate
  array is gone) and gains: label-mode PRESET chips (apply fields+size) and a real LABEL
  preview (was: designer showed a receipt even in LABEL type) + Test print prints a label sheet.
- **GS1 rendering rules in `labelsHtml`**: white field, black bars, computed quiet-zone
  padding (2.2–6 mm/side from symbol width), human-readable barcode value under the bars,
  bar band 42% of tile height (≥15% rule), dashed cut outline; optional stock/lot/expiry/
  supplier/warehouse/category lines per template. Legacy callers keep working (same
  signature; old templates' showName/showCode/showPrice semantics unchanged).
- **Print actions everywhere the spec asked**: Items rows & detail Barcode tab (already),
  Inventory stock rows 🏷 (App_Inventory2), PO line rows 🏷 (App_Screens2), and GRN doc
  actions → "Labels (received items)" loads the GRN lines and prints their labels.
- Legacy `App_Screens.printLabels` now DELEGATES to the same flow (was a second
  implementation with only a copies prompt).

**Verification (final build):** real Chrome suite `tools/test_browser_scan.js` **27/27** —
new: label modal + 6 templates, preview renders symbol (20+ bars), human-readable line =
barcode value, quiet-zone padding present, Print-sheet popup contains label tiles, F2
focuses POS scan with a real key press; pixel sanity of the popup via OpenCV (dark-ink
fraction 2.06%, image std 63 — genuine print content). `smoke.js` **332/0** (run twice —
before and after the last cosmetic preset tweak). `check_pwa.js` all pass.
Screenshots: release/shot-labels-v2.23.20.png (modal + preview), release/shot-alerts-v2.23.19.png.

## v2.23.19 — Real-Chrome verification + 2 genuine bugs found & fixed
User ne kaha tha "browser me test karke verify karo" — so we added a REAL Chromium
regression suite, `tools/test_browser_scan.js` (kept in repo; needs the demo served:
`python3 -m http.server 8011 -d demo`, then `node tools/test_browser_scan.js`).
It drives actual keyboard events (wedge-speed typing + Enter) against the built demo.

**Bugs the real browser found that jsdom missed — both fixed:**
- 🔔 **Alerts panel was dead code** — a second `$('#btnNotif').onclick` (legacy
  zero-stock-only modal) silently OVERRODE `openNotifPanel()`, so the redesigned
  Alerts & notifications panel never opened. The bell now opens the unified panel:
  unread/critical/total counts, All/Unread/Critical filter chips, severity tiles
  (⛔/️/🔵) with English type labels + Roman-Urdu body, per-row ✓ mark-read,
  and zero-stock rows synthesized from cache when the server has no notifications
  (offline or empty) so the bell never lies "all clear" with dead stock on shelf.
  Files.gs: `App_Boot.html` (openNotifPanel + localZeroStockAlerts).
- 📦 **Bulk Add stale scrim** — if the picker's OWN "Add all" button was clicked
  (inside the modal body) instead of the footer button, the commit landed in the
  cart but the wrapper modal stayed open; its scrim blocked the POS until Cancel.
  `openBulkAddModal` now delegates a close on the stable `.po-addbar` container
  (paintAddBar() rebuilds the button, so direct listeners are wiped). File: `App_POS2.html`.

**Verified on final build (real Chrome + suites):**
- `tools/test_browser_scan.js` — 20/20: scan→add→clear, rescan merges, EAN merges
  into its own product (demo: FL00000 carries barcode 6959375198888), invalid code
  clears without corrupting next scan, back-to-back wedge scans, Bulk modal scan
  list + qty bump + commit + modal closed, Take Order Enter-scan clears, Alerts
  panel opens from bell + filters repaint, PWA-POS scan clears + adds, zero
  uncaught page errors on main app and PWA.
- `tools/smoke.js` — 332 checks / 0 failures · `tools/check_pwa.js` — all pass.

## v2.23.18 — 2026-09-22
- **Image upload in the product EDIT modal** (was detail-view only — user could not find it):
  `UI2.form` gains a reusable `type:'image'` field — URL box + live preview + **📁 Upload / 📷 Camera / ✕ Remove**
  buttons, shared shrink helper `UI2.shrinkImage` (900px JPEG ≤6MB).
- Picked images upload **after save** via `items.uploadImage` (Drive URL stored, never raw base64 in the
  sheet); demo/offline falls back to data-URL; Drive failures warn but never lose the item save.
- New `Media & Image` tab in itemForm (imageUrl + gallery). Verified 11/11 browser checks + smoke 332/0.

## v2.23.17 — 2026-09-22
- **Item detail “General” tab redesigned** (hero card: image/zoom + name + status/stock/price badges + quick Edit/Label/Copy actions; grouped info sections Identity, Sourcing & stocking, Vehicle fitment; notes block). Quick image upload added on this tab too.
- Workspace cleanup: removed stale release zips, v2.13-era audit/investigation reports, old screenshots, backups/.

## v2.23.16 — 2026-09-22
- **Scan-field clear fix (root cause)**: `extractBarcode` no longer mangles alphanumeric SKUs (`FL00000` was being reduced to `00000` and matching the wrong product). Clean single-token input is used as-is; messy scanner payloads (`I98796 695… 695…`) resolve to the last numeric run.
- `findProductByBarcode` now: exact code/barcode → EAN check-digit-tolerant → numeric-suffix (digits only) → name substring. Verified with 28 browser-flow assertions.
- Pasted/scanned EAN auto-submits without Enter (140 ms settle), field always clears → next scan ready.
- Multi-match still renders the dropdown but clears the field so a next scan never appends.
- **Pwa_Shell.html syntax repair** (a missing brace had broken every dedicated PWA's script) + dedicated Bulk Add modal rebuilt on `el()`.

## v2.23.15 — 2026-09-22
- Bulk Add / Multi-Select conflict fix: **dedicated modal** (`openBulkAddModal`) with its own scan field + checkbox list + bulk collection + “Add Selected to Cart”. Scan no longer hijacks the product dropdown. Shared across POS, Take Order (and PWA shell `openBulkPicker`). Continuous scanning: scan → find → add to bulk list → clear → ready. Duplicate scans bump qty; stock cap warning.
- `UI2.itemPicker` gained: scan row with auto-clear, bulk selection panel, item cache, `api.hasSel()`.
- Take Order: full-screen scan handling unified; category filter; customer ledger card fixed.

## v2.23.14 and earlier (this workspace)
- v2.23.11–13: POS receipt preview 80mm, table separators, thermal print-size fix; demo PDF fallback; top-bar responsive fixes; toast/alert polish (icons, bilingual EN + Roman-Urdu, aria-live).
- v2.23.x: F-key shortcuts + help modal (F1–F10, WCAG-safe), 6 professional label templates + GS1 label rules, product image upload (Media + General), Supply Analysis tab (PO vs GRN shortage), PWA Field/Salesman/Warehouse customer ledger blocks.
