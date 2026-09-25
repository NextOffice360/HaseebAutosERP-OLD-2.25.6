# DOC-INTEL PLAN — Document Intelligence + QR/Barcode + Drive + i18n (2026-09-25)

Source: `uploads/ERP DOCUMENT INTELLIGENCE - QR-BARCODE - DRIVE - UX ENHANCEMENT.md` (§1–13).
Rule: additive-only; reuse existing engines (QR.dataUrl, App_QR scanner, T.t lang engine,
Comms WhatsApp, App_Print designer, UI2.table). Har slice ke baad: build + gates + commit.

## GAP-ANALYSIS (audit 2026-09-25 — kya hai / kya missing)

| § | Feature | Maujood | Missing / Enhance |
|---|---|---|---|
| 1 | Doc Intelligence Hub | QR engine (`QR.dataUrl` offline QR2 + online fallback), scanner (App_QR popup + manual entry, onDetect) | universal resolver (scan→registry→entity→screen), hub UI, doc history |
| 2 | Document Registry | — | registry (docId/type/entity/module/version/QR payload/status) + `docs.*` routes |
| 3 | Documents UI | — | Documents screen (dashboard/search/explorer/preview/actions) |
| 4 | WhatsApp/Share | Comms: wa.me free-mode + API modes, invoice share | doc-type coverage + structured templates + Copy-Text fallback |
| 5 | Drive org | ad-hoc folders (Exports.gs L23 get-or-create, Items.gs L239-242) | root tree (Project/Documents/Media/Exports/Imports/Archive) + stable IDs config me |
| 6 | Setup bootstrap | — | first-run Drive bootstrap + verify + failure reporting (GAS) |
| 7 | Localization | `T.t()` engine (en/roman/ur), user-prefs persist, Translations editor | **BUG: hard-coded Roman-Urdu literals EN mode me leak** — audit + fix top surfaces |
| 8 | Doc/print responsiveness | print files (App_Print/Barcode/Comms) | QR/label/receipt overflow + printable-area audit |
| 9 | Designer live-preview | App_Print template designer (xl) | control→preview immediate-update audit/fix |
| 10 | QR/barcode workspace | label builder (lg) + QR cache | large inspection view + scannability pre-check |
| 11 | Data-aware tables | UI2.table (num align, export, saved views) | footer totals / expand-collapse audit |
| 12 | Content-aware UI | fmt.money/date, statusBadge, badges | mostly mojood — spot-audit |
| 13 | Centralized arch | engines alag-alag | registry → resolver → manager wiring |

## D-SERIES TODOS (chhote, sandbox-safe slices)

- [x] **D1** Audit tools (read-only): `tools/audit_i18n.js` (hard-coded Roman-Urdu strings/file
      + T.t coverage ratio) + `tools/audit_qr_payloads.js` (QR/barcode payload sites + format
      + resolvability verdict) → baselines `tmp/` me, plan me record
- [x] **D2** QR payload standard + resolver: `HA:INV:<no>` / `HA:ITM:<id>` / `HA:CUS:<id>` /
      `HA:SUP:<id>`; `App.resolveCode` + `App.scanResolve` (App_QR) — frontend parser (mock
      route ki zaroorat nahi); manual-entry ab onDetect-na-hone par resolver; naye prints
      HA: payloads (App_Print invoice QR, App_Barcode label default); legacy JSON/kv/raw
      back-compat resolve. Gate `test_doc_resolver.js` **13/0** (2026-09-25) · battery
      shop 26/0 · entity 10/0 · pos 23/0 · e2e 22/0 · modals 91/0 GREEN
      (DOC/PAY payloads → D3 registry ke baad, graceful warn abhi)
- [x] **D3** Document Registry core: mock `DEMO_DOCS` + `docs.registry.save/list/get/related`
      (config-snapshot persist/restore); `window.Docs` helper (fire-and-forget); resolver
      HA:DOC→related-entity; print-hooks (invoice-drawer 🖨 → INVOICE entry, labels batch →
      LABELS entry). Gate `test_doc_registry.js` **10/0** (2026-09-25) — RELOAD persistence +
      print auto-entry (real click) sabit
- [ ] **D4** Documents hub screen: dashboard counts + table (search/filter/module) + preview
      actions (View/Print/Share/WhatsApp/Copy/Drive-location) — reuse UI2.table/modal
- [ ] **D5** Drive bootstrap (GAS `DocReg.gs`): root+subfolder create-OR-reuse (IDs config me
      persist), verify report, repeated-run safe; docs: File.gs ▸ func ▸ Run format
- [ ] **D6** WhatsApp structured share: template per doc-type (invoice/receipt/report) +
      Copy-Text fallback; context-aware placement (mandate §4)
- [ ] **D7** EN-purity fixes: D1 baseline se top-20 surfaces (toasts/labels/buttons) T.t me
      route — batches me, EN default english dikhaye, roman dict me Roman-Urdu values
- [ ] **D8** Print/doc responsiveness audit: 80mm receipt + A4 + label sheets — QR/label
      overflow/clip checks (rendered-DOM assertions @print CSS)
- [ ] **D9** Designer live-preview: har control change → immediate preview (audit + missing
      bindings fix, App_Print designer)
- [ ] **D10** QR inspection modal: large view + encoded-value display + scannability pre-check
      (QR2 matrix se quiet-zone/size validation) — print se pehle warning
- [ ] **D11** Tables: footer totals + expand/collapse audit (UI2.table) — jahan hierarchical
      data hai wahan reveal-rows additive

## D1 BASELINES (2026-09-25)

- I18N: **866 hard-coded Roman-Urdu hits / 36 files · T.t call-sites: 1**
  (engine mojood magar istemal nahi — EN mode me Roman-Urdu leak ka root-cause).
  Top: App_Core 81, App_Screens2 80, App_POS2 60, App_AIConfig 50, App_Dashboards 48.
  → tmp/i18n-audit.json (D7 batches isi ki tarteeb se)
- QR payloads: **7 sites / 0 resolvable** — formats mixed (raw/kv/json):
  App_Barcode:434 (CODE:;SKU: kv), App_Print:177 (JSON {inv,total}), App_Dashboards:1405
  (JSON), App_PwaHub:145 (url raw), App_Core:3303/3362 + App_Barcode:237 (raw).
  → tmp/qr-payloads-audit.json (D2 me HA: standard + legacy back-compat resolve)

## QA (har slice)

- Build demo+static → targeted gate (naya) + shop_setup_flow + entity_links (min)
- Battery full sirf tag-par (standing rule); commit+push har slice ke baad
