# Haseeb Autos — v2.27.0 CHANGELOG

**Date:** 2026-09-24 · **Version:** `2.27.0` (Utils.gs ▸ `AppConfig.VERSION`)
**Base:** v2.26.0 (W7 performance) → is build mein **W3: dynamic / data-aware shared system
(T1–T4) + hardening (PWA stale-node) + POS payment-ledger gate**.

**Full verification:** `env -u HOME bash tools/verify.sh` → **65 GATES · ALL GATES GREEN ✔ (1251s ≈ 21 min)**
(log `tmp/verify270.log`) — naye gates: **`pwa-shared` (16/0)** · barhte gates: **`dyn-deps` 25 → 51/0**,
**`pay-ledger` 32 → 48/0 (naya Section G: stale-node visibility)** · `check.sh` ab **78 tools**.

---

## 1 ▸ Aap ki demand (is round): *"hardening: PWA pay/receipt layers par bhi 'stale node' visibility audit + POS payment-ledger ka dedicated gate"*

### 1.1 Root cause (audit pehle, phir fix)
- PWA mein **`posTopLayer()` sirf `.open` class dekhta tha**. Desktop par ye bug pehle hi fix tha
  (`UI2._visible` + `UI2.dismissTop`, v2.25.2) magar PWA mein us ka koi equivalent nahi tha.
  Nateeja: agar koi layer `.open` reh jaye magar **haqeeqat mein invisible** ho (display:none /
  getClientRects khali / opacity 0 — render fail, tez double-tap, offline re-render) to
  **Esc usi stale layer ko chala jata** (asli visible pay sheet / receipt band hi nahi hoti) aur
  **body ka `overflow:hidden` scroll-lock phansa** reh jata.

### 1.2 Fix — shared level (page-specific patch nahi)
| Kahan | Kya |
|---|---|
| `Pwa_Shell.html` | `PWA.layerVisible(el)` (getClientRects + computed display/visibility/opacity) · `PWA.layerReport()` (open / visible / **stale**) · `PWA.sweepStale()` (stale layer se `open` hata + aria-hidden + **orphan hidden `[data-stale-guard]` nodes remove** + scroll-lock sync) · kill-switch `PWA._features.stale` |
| `Pwa_POS.html` | `posTopLayer()` ab **open AND visible** (stale skip) — teeno layers (cart/pay/receipt) ke Esc handlers isi se; har `open()`/`close()` par `sweepStale()` (10 call-sites) |

### 1.3 Dedicated gate (pehle se thi — chalayi, extend ki)
`tools/test_pay_ledger.js` (v2.25.5) → **naya Section G (16 assertions)**: orphan `[data-stale-guard]` sweep ·
stale-layer simulation (receipt `.open` + `display:none` → `posTopLayer()` skip, Esc **asli visible** pay sheet
band kare, ledger values na badlein) · receipt double-open par `.pay-sheet` sirf **1** (duplicate/orphan nahi) ·
close button + scrim close (body unlock, preview content intact) · **kill-switch proof** · cart+pay Esc order ·
**G8 source-contract lock** · **negative proof**: pre-fix demo par bilkul wahi 2 assertions red.

**Verdict: `PAY LEDGER PASS: 48 / FAIL: 0`** (pehle 32).

---

## 2 ▸ W3 — Dynamic, Data-Aware Fields, Rows, Forms, Tables & UI (spec Part-1 §5–7 + line 889 "Look for")

### 2.1 Audit pehle (`tools/audit_dyn_deps.js`, v2.26.0 baseline)
`data-dep`/`Deps.*` markers **0** · inline `<option>` builds **104 (93 option-sites)** ·
**`items.search` 7 files / 9 calls**, `customers.list` **7 files**, `sales.list` 5, `suppliers.list` 4 ·
ad-hoc validations 110 vs shared 5 · manual busy toggles 11 vs `UI.run` 10.

### 2.2 T1 — `Deps` core (`App_Core.html`)
`define/load` (TTL cache + **inflight dedupe** + error-not-cached) · `shared(key,fetcher,ttl)` · `hardRefresh` ·
**`clearPrefix`** · `reconcile(prev,options,itemValue)` · `bindSelect` + declarative `[data-dep]`/`[data-dep-parent]`/
**`[data-dep-scope]`**/**`[data-dep-placeholder]`** · `when` (`[data-when="field=value"]`, `!` negation, aria-hidden) ·
`wire/refresh/apply` · events `deps:change`/`deps:loaded` · kill-switch `Deps._features.on`.

### 2.3 T2 — AI Setup (provider → model → sections) shared par
`Deps.define('ai.providers')` + `Deps.define('ai.models')` (**per-provider cache**, switch-back = **0 nayi request**) ·
model select declarative (`data-dep="ai.models"`, `data-dep-parent="aiProvider"`, scope `#view`) ·
`[data-when="!aiProvider=MOCK"]` provider-specific sections (khali container nahi) · cache coherence
(connect/save/test/key-remove → `hardRefresh`) — **2 asli bugs** bhi pakde: detached-tree parent lookup
(AI hub `legacy` div se nodes uthata hai) aur stale duplicate field hijack.

### 2.4 T3 — `Shared` accessors: repeated fetching khatam (12 modules)
`Shared.customers/suppliers/items/sales({…})` + `Shared.raw(action,payload)` (poora envelope **usi cache entry** se) ·
key sirf un cheezon se jo result badalti hain · **offline fallback cache nahi hota** ·
**write → auto-invalidate** (`Shared._writeMap` 35+ actions + `API.call` success hook) — spec:
*"tables that do not update when related data changes"*.

| Route | Pehle | v2.27.0 |
|---|---|---|
| `customers.list` | 7 files raw | **0** |
| `items.search` | 7 files raw | **0** |
| `sales.list` | 5 files raw | **0** |
| `suppliers.list` | 4 files raw | **0** |
| `accounts.list` / `warehouse.list` / `warehouse.bins` | 3 files, 11 sites | **0** |
| Salesman (`smCall`) | apna fetch | shared routes **Shared.raw** par |

### 2.5 T4 — PWA parity (`PWA.shared`) + 2 asli parity gaps
`PWA.shared(key,fetcher,ttl)` / `sharedInvalidate(prefix)` / `sharedStats()` / `invalidateFor(action)`
(write-hook: pos.sell · sm.collect · wh.* · customers.save → `parties.` / `pwa.wh.` / `demand.` / `loyalty.` saaf) ·
kill-switch `PWA._features.cache` · 3 PWA screens (POS/Field/Salesman) ke **8 call-sites** shared par
(bare `parties.*` calls **0**).
**Gaps band hue:** (1) **`PWA.call` mein `offlineFallback` parha hi nahi jata tha** — screens har jagah bhejti thin,
magar offline par fallback ke bajaye error; ab desktop jaisa contract (offline+fallback → fallback · offline+queueable → queue · warna saaf error).
(2) **PWA demo mock mein `parties.*` routes nahi thay** (asli backend `Code.gs:449` par hain) → demo mein balance/history
lines chup chaap gayab rehti thin; ab mojood.
**Naya gate `tools/test_pwa_shared.js` — 16/0** (contract · dedupe · error-no-cache · invalidate + write-hook ·
offline ×2 · kill-switch · **real POS flow (customer select) se `parties.balance|CUSTOMER|…`** · 3 screens bare-call 0 ·
shell contract · demo fidelity · sm/fo boot).

### 2.6 Is kaam mein gate ne pakde asli bugs (guess nahi)
1. `Deps` option key `valueOf` → `Object.prototype.valueOf` collision (`.map` crash) — fixed.
2. `[data-field]` wrapper se `textContent` ("—L1L2") parent value ban raha tha — `_findField()`.
3. `Array.map` callback `this === undefined` — self-capture.
4. `Shared.invalidate` kuch clear nahi kar raha tha (`shared:<key>` prefix vs `hardRefresh` ka SEP semantics) — **`Deps.clearPrefix`**.
5. AI hub detached-tree parent lookup (OpenAI par GEMINI models) — visible tree + `data-dep-scope`.
6. PWA bundle boot crash — `PWA.layerVisible = …` IIFE ke andar jab `PWA` bana hi nahi tha (export object mein shift).
7. `PWA.call` offlineFallback dead parameter (upar) · PWA demo mock gap (upar).

---

## 3 ▸ Infra / process

- **`verify.sh` ab 65 gates** + **demo server 8021 khud start karta hai** (pay-ledger/pwa-shared HTTP par hain;
  pehle manually chalana parta tha) aur end par sirf apna hi band karta hai.
- Naya gate `pwa-shared`; `dyn-deps` 25 → **51** checks; `pay-ledger` 32 → **48**; `check.sh` 77 → **78 tools**.
- `SENS=1` kill-switch proof har gate mein: `dyn-deps` → 20/31 · `perf-batch` → 1 fail (by design).

## 4 ▸ Pehle se mojood (is build mein bhi green)
`smoke` 332/0 · `tabs` 656/0 · `logic` 816/0 · `e2e` 55/0 · `pwa-overlays` 124/0 · `pwa-ui` 66/0 · `ai-ui` 55/0 ·
`ai-hub` 35/0 · `ai` 75/0 · `ai-load-order` 49/0 · `pos-multi` 23/0 · `perf-batch` 34/0 · `ui-run` 34/0 · `ui-err` 30/0 ·
`settings-ui` 16/0 · `api-core` 16/0 · `grn-drawer` 23/0 · `demands`/`salesman-stock`/`scan-parity`/`labels-live`/`layout*` sab green.

## 5 ▸ Rollback
`release/archive/` mein pichhle packages (v2.25.2 … v2.26.0). Rollback = archive ka zip extract karke
`clasp push` (ya Apps Script editor mein paste) — data/Sheets waise hi rehte hain (schema change nahi hua).
