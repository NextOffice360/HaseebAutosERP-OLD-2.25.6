# TESTING MATRIX — A§17 (W10.T1)

> Har claim ke sath chalne wala gate ya evidence. "Gate" = `tools/` ke Node tests
> (validate_release 23 steps + legacy verify.sh set, kul **94 test/audit files**).
> Chalane ka tareeqa neeche ▸ *Kaise chalayein*.

## 17 dimensions (A§17: normal/empty/large/slow/fail/timeout/retry/duplicate/permissions/roles/scopes/dependent/mobile/sidebar/local/prod + offline)

| # | Dimension | Gates (tools/) | Status | Evidence |
|---|-----------|----------------|--------|----------|
| 1 | **normal** (khushi ka raasta) | `test_release_flow` 62/0 (fresh-install journey) · `test_e2e_critical` 22/0 (sale→close→sync) · `test_logic` 816/0 (backend math) | ✅ | `tmp/validate-v2.30.3.log` · RELEASE-VERIFICATION-* |
| 2 | **empty** (khaali DB/fields) | `test_seed_recovery` 36/0 · `test_table_states` 11/0 (empty + emptyAction) · `test_release_ui` 29/0 (khaali states) | ✅ | validate step 1/2/3 |
| 3 | **large** (bara data) | `test_scale` · `test_backend_perf` · `test_settings_perf` · `test_perf_batch` 39/0 (N→1 batch) | ✅ | validate step legacy set |
| 4 | **slow** (dheema network) | `test_timeouts` · `test_ui_err` (slow/abort paths) · busy engine min-busy 320ms | ✅ | validate steps 4 |
| 5 | **fail** (API/server ghalati) | `test_ui_err` (fail→error UI→retry) · `test_report_actions` 12/0 · `test_notifications` 11/0 (sticky+Retry) | ✅ | ui-err log |
| 6 | **timeout** | `test_timeouts` · `API.call` per-action timeout cache (`App_Core` L543) | ✅ | ui-err/timeout gates |
| 7 | **retry** | `test_ui_err` · `test_table_states` 11/0 (fail→↻ Retry→recover, calls===2) · `test_notifications` (Retry) | ✅ | table-states step 21 |
| 8 | **duplicate** (double submit/replay) | `test_ui_run` (dup block) · `test_busy_coverage` 13/0 (aria-busy disabled) · `test_offline_sync` (replay-duplicate) · `test_e2e_critical` | ✅ | busy-coverage step 4 |
| 9 | **permissions** (field-level) | `test_field_visibility` 52/0 (backend-enforced + write-guard) · `audit_field_visibility` · settings key-strip (`test_settings_shared` 6/0) | ✅ | fields gate (W5) |
| 10 | **roles** (role×screen) | routes perm filter (`test_routes`/`route_audit`) · sidebar perm-filter · settings defs groups (security→users.manage) | 🟡 | **gap:** explicit role×screen DOM matrix — W10.T2 |
| 11 | **scopes** (OAuth least-privilege) | `test_diagnose` (scope diagnostics) · `docs/OFFICIAL-DOCS.md` (recorded official links) | 🟡 | docs-level; live-scope check GAS deploy ke baad (carry-over) |
| 12 | **dependent** (parent→child UI) | `test_data_aware` 9/0 (depOn + invalid-child clear) · `test_dyn_deps` 51/0 · `test_settings_shared` 6/0 (showWhen) | ✅ | data-aware step 16 |
| 13 | **mobile** (390px PWA) | `test_sidebar_states` 52/0 (390/768/1024/1440 × light/dark) · `test_modals_close` 91/0 · `test_pwa_overlays_close` 124/0 · `test_pwa_shared` 16/0 | ✅ | sidebar matrix shots |
| 14 | **sidebar** | `test_sidebar_states` 52/0 · `audit_sidebar_matrix` · `audit_sidebar` | ✅ | W6 evidence |
| 15 | **local** (dev/mock) | poora suite local mock GS par (`tools/mock_gs`) — validate_release 23 steps GREEN | ✅ | `tmp/validate-v2.30.3.log` |
| 16 | **prod** (static/deployed) | `dist-static` build + JSONP backend + static-config · release zip includes deploy guides | 🟡 | **gap:** local↔prod parity gate — W12 |
| 17 | **offline** | `test_offline_sync` 11/0 (idempotent replay, partial fail, chip, auto-flush) · e2e offline leg · PWA cache fallback (`test_pwa_shared`) | ✅ | e2e step 18 |

## Coverage summary
- ✅ gated: 14/17 dimensions
- 🟡 partial: **roles** (W10.T2 — role×screen DOM matrix gate bana hai) · **scopes** (live-GAS check carry-over) · **prod** (W12 parity gate)

## Kaise chalayein
```bash
# full (version tag par, ek foreground call):
env -u HOME bash tools/validate_release.sh > tmp/validate-<ver>.log 2>&1
# fast iteration:
bash tools/validate_release.sh --fast
# koi ek gate:
node tools/test_w13_modules.js   # http://127.0.0.1:8021 par demo chal raha ho
```

## Evidence paths
- Full-validate log: `tmp/validate-v2.30.3.log` (23/23 PASS — v2.30.3 ship)
- Release verification: `release/RELEASE-VERIFICATION-v2.30.2.md` (purane versions ke sath)
- Layout/typography audits: `audit_layout`, `audit_typography`, `audit_modals_layout` (rendered DOM)
- Screenshots: sidebar matrix (52-check gate khud shots leta hai), PWA shots (`release/pwa-shot-*.png` history)

— W10.T1 (2026-09-25) · agla: W10.T2 role×screen matrix gate
