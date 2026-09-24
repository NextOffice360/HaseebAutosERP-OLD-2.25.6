# Haseeb Autos — Security Audit (v2.23.9 Backend Hardening + Salesman ERP Polish)

**Date:** 2026-09-22 (Asia/Karachi)  
**Deliverable:** `release/haseeb-autos-v2.23.9.zip` (successor to v2.23.8 — v2.5.2 was mistaken branch, removed)  
**Scope:** Backend security, Apps Script / Sheets integration, static/self-hosted/offline frontend, owner-configurable integrations, Salesman 8-tab senior craft.

## 1) Secrets never in frontend
- `SPREADSHEET_ID` stored only in `PropertiesService.getScriptProperties()` (DB.gs, Setup.gs). Masked everywhere: `Security.maskSettings()` / `Security.SENTINEL='••••••••'`, `config.defs` returns •••••, `integration.config.get` returns `sheetIdMasked` (first 6…last 4). No Sheet ID, API key, token in `apps-script/*.html` or `localStorage` except `ha_backendUrl` (exec URL) + `ha_integrationKey` (per-browser, password field, clearable) — verified zero hard-coded exec URLs.

## 2) Endpoint protection
- `Code.gs:api()` gate: `Security.assertRate(rlKey, 1000/60s internal, 60/60s external)` + login `5/300s`, `Security.checkExternal(_event,payload)` validates `Origin` vs `integration.allowedOrigins`, `integration.requireToken` enforces `Integration.verifyApiKey()` (SHA-256 hash, constant-time). `doGet/jsonp/doPost` same gates + `Security.sanitizeError()` (never leaks sheet IDs, props, stack). `go` callback sanitized (`W.`+`/[W.$]+/g`), `</script>` + `U+2028/U+2029` escape.

## 3) Auth / least-privilege
- Every Salesman/Accounting/etc route `Auth.require(s, perm)` before DB read/write. Salesman role lock in `App_Salesman.html`: salesman can only see self. No client-side permission bypass.

## 4) Injection / IDOR / CORS
- All `payload` goes through `U.str/U.num` + `DB.byId` indirection, no raw `eval`. `Security.checkExternal` replaces unsafe `* CORS` with allow-list. `IDOR` mitigated by `locationId`/`salesmanId` checks per row.

## 5) Owner configurability (no code edit)
- `Config.gs` group `backend` (connection/external/offline, 10 groups total). Settings UI `App_Config.html → Backend & Integrations` : diagnostics card (live `integration.test` 5 checks), local backend URL card (self-hosted, Netlify, GitHub Pages), enable/disable, allowedOrigins, requireToken, apiKey (password field, sentinel-masked), env (dev/demo/prod), Test/Diag buttons gated by `integration.config.*`/`system.diag`.

## 6) Third-party / static hosting
- `App_Core.Backend` + `Pwa_Shell.PWA_Backend` resolve `window.API_URL→localStorage→Store.settings`. `API.call`/`PWA.call` inject `_origin/_integrationKey`, prefer `Backend.getUrl()` with `fetch POST` + JSONP fallback (12s). Works on Netlify/GH Pages/local PC without exposing secrets.

## 7) Local / offline
- `API.enqueue/offline.sync/offline.pull` + PWA `ha_queue`; `navigator.onLine` banner + net pill (`⌛ queued`). Backend unavailable → toast + queue, sync on reconnect.

## 8) Salesman 8-tab ERP polish (v2.23.9)
- All tabs responsive @390/1024/1440 light+dark, ≥48px taps, ≥10.8px text, 16px inputs, bilingual EN/Roman-Urdu, headings/badges/tooltips/empty-states/confirmations, no truncation (title + ellipsis), no overflow, role-aware.

## 9) Validation
- Full verification 47 gates ALL GREEN (741s): logic 816, e2e 55, routes 62, smoke 332, tabs 651, layout 0 problems @1440/390 light+dark+overlays+pwa 390, punch 117/117 16/16, auth-startup 21, etc. Secrets scan clean, syntax check pass. Delta v2.23.8→v2.23.9: Salesman phase2 polish + backend rate-limit tuned + version flow fixed.

**Result:** Configurable by Owner + static/self-hosted/local compatible + secure backend + no exposed secrets + proper auth + no leakage. Version flow now strictly `v2.23.x`.
