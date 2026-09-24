# CHANGELOG — v2.30.5 (2026-09-25)

**Theme:** W13 module wave (audit-first) + W10 testing matrix + W12 secret scan — 4 naye gates (step 22–25).
**Base:** v2.30.3 ke upar T7.3/T7.4/T7.2 + W9 ship ho chuke the (v2.30.3 tag).

## W13 — Module wave (B§5–13, audit-first: jahan theek tha wahan pin, jahan khali tha wahan fix)
| Slice | Faisla | Kya hua |
|---|---|---|
| T13.1 B§8 conversion units | **ASLI FIX** | GRN direct lines par BOX↔PCS switch (PO v2.9 §8 jaisa): 1 BOX=12 PCS, rate Rs 3,000 → base 12 × 250 auto; line hamesha BASE units (backend invariant salamat) |
| T13.2 B§11 price signals | **ASLI FIX** | `purchase.supplierPriceSignals` — har item ki aakhri 2 GRN rates (real data) + supplier detail me 📈 Price signals tab (up/down badges) |
| T13.3 B§6 quick view | pehle se ✔ | POS2: ⓘ quick-view modal, image lightbox, ★ favorites, category after code — ab gate me PINNED |
| T13.4 B§9 reorder + AI | pehle se ✔ | real-sheets engine (math test_logic me gated) + AI signals live card — ab gate me PINNED |
| T13.5 B§7/§10/§12 | pehle se ✔ | itemPicker multi-select (pos_multi 23/0) · AI provider discovery (ai_naming 23/0) · salesman Ledger/Wasooli |
| B§5/B§13 | pehle se ✔ | credit-limit full-hisab (N11) + "Insights & Dashboards" rename |

## W10 — Testing matrix (A§17)
- **`docs/TESTING-MATRIX.md`** — 17 dimensions → gates + evidence; **15/17 gated**
- **`test_roles_matrix.js` 8/0 = step 24** — asli Auth.gs: CASHIER 4 APIs backend-DENY, OWNER/MANAGER ALLOW, users.perms, nav App.can filter

## W12/W11 — Hardening
- **`audit_secrets.js` 4/0 = step 25** — 9 token families + literal-assignment scan (378 files; test-fixture files sirf token-scan) + PropertiesService usool — repo CLEAN
- docs/06-TESTING parity (25 steps) · docs File.gs ▸ func ▸ Run convention sahi

## Fixes (cleanup ne pakre)
- **test_logic ab self-contained 816/0** — fresh-DB par SHOP_CLOSED crash (requireOpen) + stale catalogue-count assert root-fixed
- PWA confirm sweep (W9, v2.30.3) ke sath raw native confirm ZERO

## Naye gates (is release me)
step 22 w9_help 10/0 · step 23 w13_modules 20/0 · step 24 roles_matrix 8/0 · step 25 audit_secrets 4/0

## Regression (ship par GREEN)
release_flow 62/0 · e2e_critical 22/0 · math_logic 21/0 · test_logic 816/0 · modals_close 91/0 ·
supplier_autofill 19/0 · data_aware 9/0 · saveall_pages 16/0 · settings_shared 6/0 · audit_settings_defs 10/0 ·
pwa_shared 16/0 · table_states 11/0 · w9_help 10/0 · w13_modules 20/0 · roles_matrix 8/0 · audit_secrets 4/0

## Upgrade (v2.30.3 → v2.30.5)
1. Backup: Sheet ▸ File ▸ Make a copy.
2. `apps-script/*` update (clasp push ya paste) — schema change nahi.
3. Deploy ▸ Manage deployments ▸ New version.
4. 5-check: login → GRN pack switch (1 BOX ×12) → supplier Price signals tab → role check (cashier login par Settings nahi) → 1 sale.
Details: `docs/07-DEPLOY.md` · masla ho to `docs/09-ROLLBACK.md`.
