# CHANGELOG — v2.30.3 (2026-09-25)

**Theme:** W7 continue — SHARED SYSTEMS wave (forms validation · settings consume · table states) + W9 UX (Madad links · shared confirm · tooltips).
**Scope:** T7.3 + T7.4 + T7.2 + W9.T1/T2 — 3 naye shared systems, 2 naye gates (step 21/22), 3 naye settings defs, PWA confirm parity.

## Shared systems (root fix pehle, phir adoption)
| # | System | Kya mila | Files |
|---|--------|----------|-------|
| T7.3 | **UI2.validate** (forms) | Declarative rules + highlight + focus-first-invalid + aria — 6 forms ne hand-rolled checks hata diye; EXACT legacy messages mehfooz | `App_UI2.html`, 6 form screens |
| T7.4 | **Settings consume shared** | `showWhen {key,eq|ne}` (JSON-safe) + cross-form `depsRoot` + `DT.format(v,mode,cfgOv)` live preview — Settings ab Deps/DT engines khud use karta hai | `App_Config.html`, `App_Core.html` |
| T7.2 | **UI2.table states** | cfg `load: fn|Promise` (auto-start) → delayed skeleton (200ms, flash nahi) → fail par error block + ↻ Retry (`wrap.reload()`) → rows + `onLoad(rows)`; `cfg.rows`/`refresh()` path untouched (backward-compat) | `App_UI2.html`, `App_Demand.html` |
| W9.T1 | **PWA.confirm** (shared) | Native `confirm()` sandboxed WebView me block/chup ho sakta hai — ab non-blocking promise dialog (danger variant, Esc/backdrop cancel); Pwa_Warehouse (2) + Pwa_POS (1) adopted, raw native confirm PWA me ZERO | `Pwa_Shell.html`, `Pwa_Warehouse.html`, `Pwa_POS.html` |
| W9.T2 | **📖 Madad / Help** (in-app) | Sidebar ▸ ❓ Madad: repo docs/ (01–09 + OFFICIAL-DOCS) + official GAS/Sheets/PWA links (sab `target=_blank rel=noopener`, naye tab — GAS iframe safe) + keyboard shortcuts; base link admin setting `help.docsUrl` (repo private ho to apna link) | `App_UI2.html`, `Index.html`, `App_Boot.html`, `Config.gs`, `Schema.gs`, `Styles.html` |
| W9.T3 | **Tooltip sweep** | Index.html har icon-btn (9/9) + sbUser par `title` — icon-only buttons self-descriptive | `Index.html` |

## Naye gates
- **step 21** `tools/test_table_states.js` **11/0** — reload+auto-start · error+Retry+recover (calls===2) · data/filtered compat · 3 load sites · DOM: controllable-promise skeleton→rows→onLoad, fail→Retry, refresh/empty/emptyAction, real Demand ▸ Reports screen, zero errors.
- **step 22** `tools/test_w9_help.js` **10/0** — PWA.confirm contract + raw-confirm-zero · UI2.help 20 links (official ≥7, sab blank+noopener) · sbHelp wiring + `help.docsUrl` · tooltip 9/9 · DOM: Madad modal open/close, tap ≥44, dark-theme readable (computed-style), PWA.confirm OK/Esc, zero page errors.
- **step 20** `tools/test_settings_shared.js` **6/0** (T7.4) + `audit_settings_defs` **10/0** — settings defs schema + shared engines ke consume ki wadaifi.

## Regression (ship par sab GREEN)
release_flow 62/0 · e2e_critical 22/0 · math_logic 21/0 · modals_close 91/0 · forms_shared 14/0 ·
settings_shared 6/0 · settings_icons (55 tabs) · audit_settings_defs 10/0 · pwa_shared 16/0 ·
report_actions 12/0 · data_aware 9/0 · saveall_pages 16/0 · supplier_autofill 19/0 · notifications 11/0 ·
table_states 11/0 · w9_help 10/0 · validate_release GREEN (--fast).

## Upgrade (v2.30.2 → v2.30.3)
1. Backup: Sheet ▸ File ▸ Make a copy.
2. `apps-script/*` update (clasp push ya paste) — koi schema change nahi (sirf nayi optional setting `help.docsUrl`, default khali).
3. Deploy ▸ Manage deployments ▸ New version.
4. 5-check: login → sidebar ▸ ❓ Madad khulti hai → koi table load/retry → 1 sale → report.
Details: `docs/07-DEPLOY.md` · masla ho to `docs/09-ROLLBACK.md`.
