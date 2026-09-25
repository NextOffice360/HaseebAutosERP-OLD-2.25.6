# UI/UX Enhancement Plan — v2.30.5 mandate (2026-09-25)
**Sources:** user mandate (enterprise audit) + `uploads/Context_Aware_ERP_UI_UX_Workflow_Architecture.md`
(1585 lines — context-aware/entity-centric/workflow-driven spec; Customer Demand = reference module).
**Rule (non-negotiable):** NO breaking/removal/simplification of existing functionality — additive only;
regression gates har slice ke baad GREEN hona zaroori.

## P0 — Save/State persistence & controls (CRITICAL — correctness pehle)
- [x] Mock settings persist (`config.save`/`system.settings.save` → localStorage overlay) — toggles
      Save-all reload-proof (gate shop_setup_flow J, 24/0)
- [x] Wizard save/skip persist + already-configured hide + re-run (Shop screen)
- [x] **FULL save-flow audit tool** (`tools/audit_save_persistence.js`): har Save/Save All/Apply/Update/
      Submit/Confirm site × har toggle/switch/checkbox site → kaunsa API route → mock handler persist
      karta hai ya nahi → classes: CONFIG (persist hona chahiye) / TXN (session-theek, backend Sheet
      asli jagah) / GAP (fix)
- [x] **Hydration trace (part):** boot → SETTINGS overlay restore (settings + config-snapshot:
      fields/menu/templates/lists/translations/prefs — `ha_mock_cfg`) — reload/navigation/re-open sab
      reload-proof; gate K DOM-asserted. Baqi: PWA-shell hydration + per-screen savedViews audit.
- [ ] **Optimistic-update pattern:** boot → system.settings.get → App.state.settings → renderers (Settings re-open,
      modal re-open, PWA shell) — 'greyed-out/OFF revert' ka poora loop + optimistic-update-with-rollback
      pattern ka audit (UI.run write path par already busy/err hai; optimistic additive where safe)
- [x] Success/error toast + post-save refresh (audit: configSaveAllNow/sub-save dono
      pullSettings+refresh+theme karte hain; UI.run busy/err shared) — per-screen spot-audit baqi
- [ ] Success/error toast + post-save refresh behavior ka deep audit (UI.run + UI2.saveAll already; individual
      screens ka pattern check)

## P1 — Enterprise UI/UX polish (spec §42 design system par implement)
- [ ] Typography audit vs tokens (`Styles.html`): hierarchy (h1..h4/label/hint), sizes ≥10.8px floor,
      weights, contrast light+dark — 'tiny bold' sites ki list + token-level fix (per-screen nahi)
- [ ] Buttons/action hierarchy: primary/secondary/ghost consistent; destructive confirm
- [ ] Tables/cards density + spacing rhythm (spec: data-dense but clean)
- [ ] Focus/hover/active/disabled states audit (accessibility §38)

## P2 — Modals/off-canvas (spec §25)
- [ ] Wide/horizontal compositions desktop par (lg/xl size use) — tall-narrow vs content-benefit audit
- [ ] Modal dead-ends: entity references clickable (Customer/Supplier/PO links) — additive
- [ ] Mobile: modal full-width/bottom-sheet behavior qayam (390px gates)

## P3 — Responsive/PWA (spec: first-class mobile)
- [ ] 390/768/1440 sweep gates refresh: overflow/truncation/hidden-controls
- [ ] PWA shell top-bar/action-bar safe-areas; touch targets ≥48px (standing rule)

## P4 — Context-aware architecture (attachment ka core — bade slices, har module)
- [ ] Customer Demand = PILOT: actionable dashboard cards (§8) + state-aware row actions (§12–14)
      + master-detail modal (§10–11) + related-entity links (§27)
- [ ] Deep-linking + context preservation (§23–24) — App.params already; patterns extend
- [ ] Related-entity clickable links in modals (orders→customer, items→supplier, PO→GRN)
- [ ] Empty/error states spec §37 ke mutabiq (already strong — audit)
- [ ] 'What to do today' (§21) dashboard widget — additive

## QA (mandate §2)
- Har slice ke baad: full gate set + 390/1024/1440 light+dark + PWA overlays + shop_setup_flow
- Strict: koi working feature hatana/nahi — sirf add/repair; har fix DOM-asserted gate ke sath


## P0 RESULTS (2026-09-25 round)
- audit: 72 UI-save sites · 34 switches + 16 checkboxes · 81 WRITE-routes
- 16 CONFIG-GAPs → config-snapshot layer (ha_mock_cfg + write-wrap) → **GAP 0**
- 4 NO-MOCK-HANDLER → salesman.routes CRUD add (pehle save hi fail hota tha);
  pay.fields/validate graceful-by-design (offlineFallback) — documented
- scope-sabak: build me mock core aur append-blocks ALAG scopes me hote hain —
  cross-scope helpers `window.` par expose (mockPersistConfig)
- gates: shop_setup_flow **26/0** + 11-gate battery GREEN
