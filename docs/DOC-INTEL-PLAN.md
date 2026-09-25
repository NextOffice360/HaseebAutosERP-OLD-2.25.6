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
- [x] **D4** Documents hub screen: `App_Docs.html` (naya, Index include) — KPIs (total/
      invoices/labels/today) + search/type-filter + Scan & Resolve + Manual actions +
      table (docNo/type/entity-link/version/status/created/Open+Copy) + row→detail modal
      (metadata + related) + deep-link {open:DOCid} onParams; nav: fallback navConfig
      'Insights & Dashboards' me Documents (perm reports.view) + MENU_CONFIG m_docs.
      Gate `test_documents_hub.js` **16/0** (2026-09-25); regression doc_registry 10/0 ·
      shop 26/0 · entity 10/0. WhatsApp/Drive-location actions D5/D6 me judenge
- [x] **D5** Drive bootstrap: `DocReg.gs` (naya) — root+19 subfolders get-or-create by name
      (stable reuse, no duplicates), IDs PropertiesService+CONFIG persist, `DocReg.verify`;
      official refs record (advanced/drive, api/guides/folder, web). Mock `docs.drive.*`
      deterministic (repeat=same IDs); hub me ☁ Drive-setup modal (tree + Verify).
      Inline-gate GREEN: repeat same-ID ✓ 19 folders ✓ modal ✓ verify-toast ✓ 0 errors
- [x] **D6** Context-aware share: `docShare()` — INVOICE/RECEIPT → poori mojooda
      Share.invoice engine; baqi types → structured message + wa.me free-link +
      Copy-Text fallback. Detail-modal + table me 💬 actions. Inline-gate GREEN:
      wa.me URL me docNo ✓ invoice→Share.engine modal ✓ 0 errors
- [x] **D7 (batch-1)** EN-purity: 9 boot/shop/core surfaces T.t me route (App_Boot 8 +
      App_Core 1) + TRANSLATIONS dict (en/roman/ur). Live-verify GREEN: EN me pure-English ✓
      roman Roman-Urdu ✓ urdu اردو ✓ 0 errors. Sabak: TDZ (seed-block decl ke baad) +
      escape-literals + block-relocate order. Agle batches D1 baseline tarteeb se
- [x] **D8** Print/doc responsiveness AUDIT: `tools/audit_print_layouts.js` — **11/11 PASS**
      (paper-width, margins, @media print, overflow guards, mm-sizing, flexible QR/img sab
      pehle se mojood — koi fix nahi chahiye). Baseline tmp/print-layout-audit.json
- [x] **D9** Designer live-preview AUDIT: code-level verify — HAR control onChange→paint()
      (copies/fontSize/title/showTitle/taxMode/footer/terms + renderFields/renderCustom)
      — live-preview PEHLE SE implemented (spec §9 requirement already met); koi fix nahi
- [x] **D10** QR inspection view: docDetail modal me large QR (220px + padding) + encoded
      value + scannability note (>900 chars warn). Sabak: QR.dataUrl sync-ho-sakta hai →
      Promise.resolve() wrap. Inline-gate GREEN: img+src+value+note ✓ 0 errors
- [x] **D11** Table totals: UI2.table opt-in `totals:{label}` → tfoot (filtered-data sums,
      first-num-col me label). Wired: Orders list (Total/Advance/Balance sums — live
      "Total: Rs 600 · Rs 0 · Rs 600" ✓). Sabak: sales screen LEGACY UI.table use karta hai
      (UI2 nahi) — wiring wahan revert, legacy-engine totals D12 backlog. Engine probe GREEN

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
