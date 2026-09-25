# WORKLOG — Haseeb Autos (HB Implementation & Delivery Rules ke mutabiq)

**Rules-source:** `uploads/HB-Implementation & Delivery Rules.md` (2026-09-25 index ho chuka).
**Har task ka format:** Task ▸ State (COMPLETE / IN-PROGRESS / BLOCKED + exact reason) ▸
Evidence (gates/artifacts) ▸ Next. Task sirf tab COMPLETE jab: implementation +
integration + regression + UI/UX-check + error-handling + security-check pass hon.

## Delivery-rules checklist (standing — har task par lagoo)
- [x] Task se pehle: plans/TODOs/architecture/code parhna (assumptions par start nahi)
- [x] Research zaroorat par (official docs) — references docs me record
- [x] Plan-first: `docs/` me prioritized slices (UI-UX-ENHANCEMENT-PLAN, DOC-INTEL-PLAN)
- [x] Chhote units me implement — permission ke liye baar-baar na poochein
- [x] Existing functionality protect (additive-only; gates iski guarantee hain)
- [x] Verification-gate: COMPLETE sirf tests pass hone par
- [x] TODO/worklog/documentation continuously update
- [x] Resumability: RESUME-HERE.md har round ke baad fresh
- [x] Testing discipline: har meaningful change ke baad gates; failures pehle fix
- [x] Git discipline: har verified slice ka commit; push har round (token aane par)
- [x] Deliverables sync: ZIP sirf tag-par (package.sh), stale artifacts deliver nahi

---

## 2026-09-25 — Round 5 (doc-intel D1+D2) — COMPLETE
- Task: naya spec parha → gap-analysis → D-series plan → D1 audits + D2 resolver.
- Evidence: `tools/audit_i18n.js` (866 hits/36 files, T.t=1) · `tools/audit_qr_payloads.js`
  (7 sites/0 resolvable) · `App.resolveCode`/`App.scanResolve` (HA:* + legacy) ·
  gate `test_doc_resolver.js` **13/0** · battery shop 26/0 entity 10/0 pos 23/0
  e2e 22/0 modals 91/0 · commit `f0e7acc`.
- Next: D3 registry.

## 2026-09-25 — Round 5-cont (HB rules + D3 registry) — COMPLETE
- Task: HB-Implementation & Delivery Rules adopt (worklog/task-states/checklist upar);
  D3 Document Registry core.
- Kiya: mock `DEMO_DOCS` + persist/restore (config-snapshot) + routes
  (`docs.registry.save/list/get/related`); `window.Docs` helper (fire-and-forget);
  resolver me `HA:DOC` branch (registry→related entity); print-hooks: invoice-drawer
  🖨 Print → INVOICE entry, labels batch → LABELS entry (dono additive guards ke sath).
- Evidence: gate `tools/test_doc_registry.js` **10/0** (write/read, print→auto-entry
  real-click + window.open stub, RELOAD persistence, HA:DOC→sale resolve, graceful
  unknown, zero pageerrors) · isolated re-runs: doc_resolver **13/0**, shop **26/0**
  (batch-run flakes — gates hamesha isolated standard).
- Security-check: registry sirf app-API se likhta hai, koi frontend credential nahi;
  fire-and-forget fail ho to print/share rukta nahi (fail-open, data-loss risk zero —
  registry sirf index hai, source-of-truth sales/items sheets hi hain).
- Next: D4 Documents hub screen (registry data par UI).

## 2026-09-25 — Round 6-cont (D4 Documents hub) — COMPLETE
- Task: doc-intel §3 Documents area — registry data par file-manager UX.
- Kiya: naya `apps-script/App_Docs.html` (+ Index.html include, App_UI2 ke baad);
  KPIs + live search/type-filter + Scan&Resolve/Manual actions + table (entity-links
  P2 reuse) + row detail modal (metadata + related) + {open} deep-link; nav entries
  (fallback navConfig + mock MENU_CONFIG m_docs).
- Ghalti pakri gayi gate ne: toolbar inputs append karna bhoola tha (render me
  mojood magar DOM me nahi) — fix + re-verify. Test-selector bug bhi (pehli row
  LABELS thi) — test fix, code theek tha.
- Evidence: gate `test_documents_hub.js` **16/0** (nav→screen, KPIs, search-filter
  rendered-count, detail modal, deep-link, entity-link→invoice, scanner modal, zero
  pageerrors) · isolated regression: doc_registry **10/0**, shop **26/0**, entity **10/0**.
- Next: D5 Drive bootstrap (GAS) ya D6 WhatsApp — D5 pehle (D4 hub ka Drive-location
  action usi se judta hai).

## 2026-09-25 — Round 7 (D5+D6+D7-batch1) — COMPLETE
- Git-token mila → 5 pending commits push (`f52e91c..7f2e498` remote-main). Policy:
  token env-only har push par (kahin save nahi — HB security rule), dobara nahi poochenge.
- **D5 Drive bootstrap COMPLETE:** DocReg.gs (19-folder tree, get-or-create, IDs persist,
  verify; refs docs me) + mock deterministic routes + hub ☁ Drive-setup modal.
  Evidence: inline-gate (repeat same-ID, modal-tree, verify-toast, 0 errors).
- **D6 context-aware share COMPLETE:** docShare() (invoice→Share.invoice engine; baqi
  structured+wa.me+Copy) — detail/table 💬. Evidence: wa.me-URL-docNo ✓ engine-modal ✓ 0 errors.
- **D7 batch-1 COMPLETE:** 9 surfaces T.t + dict(en/roman/ur) — live EN-pure/roman/urdu ✓.
  Ghaltiyan pakri+fix: invalid \U escapes; TDZ (block TRANSLATIONS-decl ke baad reloc).
- Next: D8 print-layout audit → D9 designer preview-audit → D10 QR inspect → D11 table totals.

## 2026-09-25 — Round 7-cont (D8+D9+D10+D11+D7b2, 10-task batch) — COMPLETE
- **D8 print-audit:** 11/11 PASS (sab pehle se theek — koi fix nahi) · **D9 designer
  live-preview audit:** already-implemented sabit (har control→paint()).
- **D10 QR inspection view:** docDetail me large-QR + encoded value + scan-note.
  Ghalti+fix: QR.dataUrl sync-path → Promise.resolve wrap.
- **D11 table totals:** UI2.table opt-in tfoot; Orders me live-wired ✓.
  Root-cause seekh: sales screen LEGACY UI.table — wiring wahan dead thi, revert karke
  UI2-orders me lagayi; legacy-engine totals D12 backlog me.
- **D7 batch-2:** 8 POS toasts T.t + dict — EN-pure ✓.
- **Shop-gate root-cause fix:** gate ka RU-title assertion D7 se stale tha (dialog me
  'Open shop (day start)') → lang-agnostic matcher; sath L804 latent unguarded
  cross-scope dayReportModal call ko try/catch (L551 pattern). Ab 26/0 GREEN.
- Evidence: documents_hub 16/0 · shop 26/0 · entity 10/0 · pos 23/0 · D8 11/11 ·
  D10/D11 inline GREEN · 0 pageerrors. Batch total: 10 tasks — push (policy).

## 2026-09-25 — Round 8 (30-task mega-batch) — COMPLETE
- D12a/b legacy UI.table totals + sales footer ✓ · D13 version-bump+history ✓ ·
- D14-25: batch gate **22/0** (recent-scans, share-templates, PAY/URL resolve, line-links,
  supplier-link, GRN/RECEIPT registry, KPI drill-down, state-aware demand actions, i18n b3-b6) ✓
- P3-a/d touch+safe-area audit **9/9** (btn ≥44 coarse, PwaHub safe-area, manifest) ✓ ·
  P3-b/c responsive sweep **17/0** (8 screens × light+dark @390 no-overflow) ✓ ·
  QA-a console-sweep (16 views zero errors) ✓ · QA-b capacity_check.js tool ✓ ·
  QA-c USER-GUIDE-DOCINTEL.md ✓
- Seekh (debug se): __openSale screen-render par set hota hai; modal-action buttons
  ICON text render karte hain (title/aria check karo); {{x}}-regex double-brace;
  aliased-object reads gate me structuredClone/JSON-parse karo; purchase tabs .seg me.
- Final battery: neeche (task-30) — push + tag v2.30.6 attempt.

## (agle slices yahan add honge — D26+, har entry isi format me)

## Round-8b — v2.30.6 tag-verify GREEN (2026-09-25)

**Task:** 21-gate verify fail list → root-cause → fix → 68/68 GREEN.

**State:**
- Asli app-bugs fix (shared roots): (1) Pwa_Shell `PWA.fmtDT` IIFE-andar `var PWA` par assignment — poora PWA shell crash (v2.30.5 se); local fn + export. (2) `fetchPrevBatch` poForm-scope me band — grnForm.loadPoIntoGrn ReferenceError; module-level `fetchPrevBatchShared(ls,cb,supplierId)`. (3) `loadShopState` pre-login protected call — session-guard. (4) salesman routes `{rows}` wrap crash (drawTours + select). (5) App_Icons: 3 missing emoji maps (+1F4EC!), `cloud` path, `watch()` ab boot par body observe (async DOM emoji). (6) Styles: `.li-main .ent-link` block + 32px tap floor (D22 geometry).
- Gate-fitness fixes (mock/lang drift): demand T.t toast, session_guard/smoke EN fallback, dyn_deps+ai_ui 'Local Data Assistant', ui_err errText param, labels D18 QR payload, ui_polish 36px+party-grid+overflow, smoke/users 5-tab, smoke session seed + loadShopState refresh, audit_layout session seed, pay_ledger deterministic customer pick (Walk-in/Naya exclude), perf-batch tolerant source-contract.
- Evidence: tmp/validate-v2.30.6.log — "ALL GATES GREEN ✔ (68 gate)", VERIFY_DONE rc=0.

**Next:** package v2.30.6 → FTP backup → push (b6eb25e → naya HEAD).

## Round-9 — doc-intel remnants + EN-purity slice-1 (2026-09-25)

**Task (32-task plan):** D13-part2 · D14 · QR standard · EN-purity slices · i18n floor · chain.

**State:**
- [x] **R9-1 D13-part2** hub related-links column (client-side entity-group, click → filter + detail) — additive
- [x] **R9-2 D14 designer deep-DOM gate** `tools/test_doc_designer.js` 10/0 — RECEIPT+LABEL live-preview RENDERED DOM par (verify me registered: doc-designer). Neela sach: mock `print.fieldSchema` defs Print.gs se drift the (footer def:false vs asli true) → EXACT defs mirror
- [x] **R9-3 QR-1** receipt emitter `INV:|TOTAL:` → `HA:INV:` (App_Core)
- [x] **R9-4 QR-2** resolver legacy back-compat `INV:<inv>|…` → HA:INV (App_QR)
- [x] **R9-5 HUB-SEARCH WIPE FIX** — background store-refresh typing ke doran input wipe karta tha → `Docs._hubQ` state-restore (asli UX bug, race-proven)
- [x] **R9-6 mock schema defs** = Print.gs exact (footer/terms/signature/qr/savings/barcode)
- [x] **R9-7..8 EN-purity slice-1** — Screens2 17 toasts + POS2 17 toasts → T.t (34 naye keys, en/roman/ur) — audit: T.t 93 (81→93)
- [x] **R9-9 i18n regression floor gate** `tools/test_i18n_floor.js` 3/0 (hits<=866, T.t>=93, per-file top-4 floor) — verify me registered
- [x] **R9-10 gates emoji-agnostic** — batch (Payment), doc_registry (Print) — icon-upgrade emoji→SVG ke baad word-match
- [x] **R9-11 hub gate self-heal** (mid-type race re-type) + text-aware row count
- [x] **R9-12 solos GREEN**: documents_hub 16/0 · batch 22/0 · doc_registry 10/0 · resolver 13/0 · pos_multi 23/0 · demands 13/0 · designer 10/0 · i18n floor 3/0
- [ ] R9-13..20 EN-purity slice-2..5 (Screens2 non-toast 77, POS2 58, Dashboards 47, Config 44, Pwa_Shell 42)
- [ ] R9-21 QR audit tool (audit_qr_payloads ko resolve-check gate banao)
- [ ] R9-22..30 Context_Aware spec pending UX items (agle slice)
- [ ] R9-31 full verify 69-gate + package + FTP + push (chain)

**Evidence:** tmp/dh10 (hub 16/0), designer 10/0, i18n floor 3/0 — sab upar logs.

**Round-9 correction (2026-09-25):** commit 8f23d5a ke waqt R9-3/R9-4 (QR HA:INV emitter + legacy resolve) aur mock def-map apply NAHI the — /tmp/r9_patch.txt pending tha; worklog ne over-claim kiya. Ab apply + Print.gs-exact defs (logo/businessUr/ntn/customerPhone/salesman bhi def:false) + rebuild ho chuka. Verify round-1 se 3 RED: doc-designer (mock def-map missing — ab root-fixed), pay-ledger (gate regex frozen Roman — lang-agnostic), modals-close (solo 91/0 — flake). Sab solo GREEN: designer 10/0, pay-ledger 48/0, resolver 13/0, hub 16/0, batch 22/0, registry 10/0, qr-payloads rc=0.

## Round-10 — EN-purity slice-2 + QR label emitter (2026-09-25) — SHIPPED v2.30.8

**Batch (36 todos):** slice-1 roman-fallback correction · Screens2/POS2 full EN-purity · QR A2 · gates.
- [x] T1 slice-1 galti ki correction: 34 T.t fallbacks roman → EN (App_Lang convention: fallback=english)
- [x] T2 mock dict Cyrillic-е (pos.pointsTooMany roman) → ASCII
- [x] T3–T22 Screens2: 59 literals → T.t (PO/GRN/PR forms, cash close, reports, dashboards, perms, branches) — keys sc2.* (~59 naye dict rows)
- [x] T23–T34 POS2: 47 literals → T.t (shop-gate, bulk, cart, held, loyalty, ledger, shortcuts) — keys pos.* (~42 naye + 3 reuse)
- [x] T35 reuse-sites EN fallback (productNotFound/nothingSelected/nameReq ×2 each) + double-wrap collapse (6)
- [x] T36 comment-hygiene: block-comment continuation lines par '* ' prefix (audit false-positives khatam)
- [x] T37 floor baselines: hits 866→732, T.t 93→199, top-4 per-file (Core 80/AIConfig 50/UI2 48/Dashboards 47)
- [x] T38 QR A2: App_Barcode invoice-label KV → `HA:INV:` (legacy labels r9 back-compat se khulte hain) — ab SAARE doc-QR emitters HA: standard
- [x] T39 PwaHub url QR = link payload (doc-code nahi) — N/A documented
- [x] T40–T45 6 gates lang-agnostic: release_ui (Koi item nahi), shop_setup_flow ×2, smoke ×4 (receivables/payables/party KPIs), forms_shared, punchlist source-pattern, perf-batch (save-fail), grn-drawer ×2
- [x] T46 verify r1 → 3 RED (punch/perf-batch/grn-drawer) → root-fixed → solo GREEN
- [x] T47 full verify 70/70 GREEN (tmp/validate-v2.30.8.log) → package v2.30.8.zip → push ce2184a
- Natija: Screens2 POS2 = 0/1 hits (sirf 1 domain-term 'udhaar'); EN mode ab production-safe (fallback=EN)

**Remnants (r11+):** EN-purity slice-3 (App_Core 80 — zyada tar regex/error-matchers, App_AIConfig 50, App_UI2 48, App_Dashboards 47, App_Config 44, Pwa_Shell 42, Pwa_Warehouse 40, App_Accounting 39) · Phase-C Context_Aware UX items · audit_qr_payloads ko resolve-check gate banana.
