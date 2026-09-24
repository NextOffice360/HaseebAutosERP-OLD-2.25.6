# Requirement Checklist — v2.28.0 (W5: Global Field Visibility & Permissions)

**Date:** 2026-09-24 · **Version:** 2.28.0 · **Full suite:** `env -u HOME bash tools/verify.sh` → **66 GATES · ALL GATES GREEN ✔ (1226s ≈ 20 min)** (log `tmp/verify280.log`)
**Naya gate:** `fields` **52/0** · **Audit evidence:** `tmp/field-visibility-audit.json` (`tools/audit_field_visibility.js`)

Legend: **✅ mukammal (gate + rendered proof)** · **🟡 by design / note** · **⬜ user-side check (deployed backend/device)**

---

## A. Spec §9 — "Global Field Visibility & Permissions"

| Requirement | Status | Evidence |
|---|---|---|
| Reusable field-level system: **Role → Scope → Module → Section → Field → Permission** | ✅ | `Fields.gs` families + permission keys; Role = `ROLE_PERMISSIONS`/per-user extra+denied · Module = `Fields.moduleOf(action)` + `MODULE_GRANTS` · Scope = location scope (`Auth.canAccessLocation`, pehle se) · Field = column regex |
| Apply where required: POS · GRN · PO · Sales · Customers · Products · Suppliers · other | ✅ | Ek enforcement point (`Code.gs ▸ api()`) — **295 routes** sab cover; UI adoption POS/Dashboards/Items/Customers/Suppliers/PWA screens |
| Cost price | ✅ | family `cost` — cashier/salesman koi cost nahi dekhta (gate A) |
| Profit / margin | ✅ | family `margin` — Dashboards KPI + ring, POS profit footer, `estProfit()` guard |
| Customer contact info & address | ✅ | family `contact` — phone/email/CNIC/address (gate: manager denied par teeno gayab) |
| Supplier information | ✅ | family `supplier` — primarySupplierId, paymentTerms, bank fields |
| Internal notes / financial internals | ✅ | families `notes` aur `finance` — audit ki 47+39 exposure sites cover |
| **"Backend/API level, not merely CSS"** | ✅ | Response se column **hata** diya jata hai (copy banti hai, cache mutate nahi) — gate A + rendered DOM test D |
| Role-based AND scope-based | ✅ | Role matrix (6 families × 9 roles) + per-user allow/deny + module grants; Users & Security matrix mein live toggle |
| UI bhi respect kare (khali column na dikhe) | ✅ | `UI2.table` column filter + `UI2.form` field filter + `App.field()`; **rendered DOM proof** (D, G) |
| Chupke se bhej kar badalna bhi na ho sake | ✅ | `Fields.scrub()` — gate B: cost-blind user ka `costPrice` change **ignore** (save phir bhi chalta hai) |

## B. Spec §18 (Execution Priority) — is build mein #5

| # | Kaam | Status |
|---|---|---|
| 1–2 | Audit + root cause | ✅ `tools/audit_field_visibility.js` + behavioural probe (cashier ko `costPrice: "990"` mil raha tha) |
| 3 | Performance/requests | ✅ v2.26.0/v2.27.0 (W3/W7) |
| 4 | Reusable data-aware UI | ✅ v2.27.0 (W3) |
| **5** | **Global permissions/field visibility** | ✅ **is build mein (W5)** |
| 6 | Date/time/timestamp system | ⏳ agli wave (W4) |
| 7 | Sidebar/responsive navigation | ⏳ (W6) |

## C. Standing user constraints

| Constraint | Status | Evidence |
|---|---|---|
| Audit-first, no guessing | ✅ | Naya audit tool + asli backend probe; nateeje `tmp/field-visibility-audit.json` mein |
| Fix shared/core, phir app-wide consistent adoption | ✅ | `Fields.gs` + `Code.gs` (2 lines) + `UI2.table/form` filter → phir screens par sirf `family:` marks |
| No false "fixed" claims | ✅ | Gate 52/0 (behavioural + rendered) + kill-switch negative proof + 2 asli bugs pakde aur fix (cache mutation, PWA `S`) |
| Small standalone tests | ✅ | `fields` gate 2s; full suite sirf version tag par (1226s) |
| Feature na hatao | ✅ | smoke 332/0 · tabs 656/0 · logic 816/0 · e2e 55/0 · pwa-overlays 124/0 · pay-ledger 48/0 — sab green |
| Layout 0 problems @390/1024/1440 light+dark, ≥48px taps, ≥10.8px text | ✅ | `layout*` + `pwa-layout*` gates is run mein green (hidden columns se layout aur saaf hua) |
| Sensitive data backend par (CSS nahi) | ✅ | Isi build ka core: response se column gaya, sirf CSS se nahi |

## D. Baqi (aage ke waves — A§18 order)
**W4** date/time/timestamp policy · **W6** sidebar expanded → partially collapsed → off-canvas · **W9/W13** help links & docs · **W10** testing matrix · **W11/W12** docs pack. Is build mein in par koi claim nahi.
