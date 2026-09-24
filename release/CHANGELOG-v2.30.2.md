# CHANGELOG — v2.30.2 (2026-09-24)

**Theme:** N-series hardening khatam — math/logic audit (N11) + final E2E (N12) + docs set (T8).
**Scope:** 7 shared fixes (5 math/logic + 2 release-process), 2 naye gates (step 17/18), beginner `docs/`.

## Math/Logic fixes (har jagah ek hi source, koi mask nahi)
| # | Bug (pehle) | Ab (v2.30.x) | File |
|---|-------------|--------------|------|
| 1 | Returns ke baad dashboard/profit report profit **zyada** dikhta tha (returns ignore) | `Reports._returnsImpact` — dashboard + profit **returns NET** (revenue+cost reversal) | `Reports.gs` |
| 2 | Discounted bill ki return par **over-refund** (gross qty×price) | Refund base = **net unit revenue** (discount ka hissa wapas nahi); manual price override qayam; UI return form net prefill + "· net" hint | `Sales.gs`, `App_Screens.html` |
| 3 | Overpay par `due` **negative** (−4 jaisa) jabke change wapas ja chuka tha | `due = max(0, total − paid)` | `Sales.gs` |
| 4 | Partial return par salesman ki **poori commission REVERSED** | **Proportional** (1/4 return → 75% bachta hai), multiple returns cumulative, sirf PENDING (PAID untouched) | `Payments.gs` |
| 5 | Overpaid tender: receipt **tendered** (1300) par → customer ledger −4 + drawer expected +4 | Receipt **APPLIED** amount par; applied=0 → receipt/redeem skip; LOYALTY pro-rate — N11 gate ne ye regression khud pakra | `Sales.gs` |

## Verified-correct (koi change nahi — audit evidence)
Tax engine (inclusive/exclusive, proportional allocation, residue last line) · bill-discount clamp ·
credit-limit guard (poora hisab error me) · loyalty earn/redeem (double-receipt nahi) · AVG costing ·
ledger closing=due · numbering per-branch · GRN cost freeze + purchase return · valuation ·
party balances · day-report `expectedCash = opening + netCash` · offline idempotent replay.

## Naye gates
- **step 17** `tools/test_math_logic.js` **21/0** — backend exact-paisa math + commission + FE↔BE parity (POS cart DOM == backend total) + zero page errors.
- **step 18** `tools/test_e2e_critical.js` **22/0** — poora safar ek journey me: fresh DB → login → open shop → customer → GRN → POS sale → points earn/redeem → udhaar + payment → reports → close shop (variance 0) → band-dukan block → settings persist → offline sync (apply/replay-duplicate/structured-fail) | DOM: dashboard KPIs, 9 screens, POS cart, Save All → backend, zero page errors.

## Docs (T8)
- Naya **`docs/`** folder (10 files, no secrets): overview, setup (sheet→GAS→wizard→login),
  configuration, environment/clasp, permissions matrix, testing, deploy + 5-check,
  troubleshooting table, rollback (code-only rule), official-docs links (A§2 recorded).
- `tools/package.sh` ab **poora docs/** zip me shamil karta hai.

## Regression (ship par sab GREEN)
release_flow 62/0 · release_ui 29/0 · seed_recovery 36/0 · partial_save 48/0 · save_all 24/0 ·
saveall_pages 16/0 · supplier_autofill 19/0 · inventory_all 40/0 · data_aware 9/0 · offline_sync 11/0 ·
notifications 11/0 · ai_naming 23/0 · busy_coverage 17/0 · modals_close 91/0 · pay_ledger 48/0 ·
points_flow 40/0 · pos_multi 23/0 · sidebar 52/0 · pwa_overlays_close 124/0 · **math_logic 21/0 ·
e2e_critical 22/0** · validate_release GREEN.

## Upgrade (v2.29.x → v2.30.2)
1. Backup: Sheet ▸ File ▸ Make a copy.
2. `apps-script/*` ko Apps Script me update (clasp push ya paste).
3. Deploy ▸ Manage deployments ▸ New version.
4. 5-check: login → open shop → 1 sale → report → close (variance 0).
Details: `docs/07-DEPLOY.md` · masla ho to `docs/09-ROLLBACK.md`.
