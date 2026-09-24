# Requirement Checklist — v2.27.0 (hardening + W3 dynamic/data-aware shared system)

**Date:** 2026-09-24 · **Version:** 2.27.0 · **Full suite:** `env -u HOME bash tools/verify.sh` → **65 GATES · ALL GATES GREEN ✔ (1251s ≈ 21 min)** (log `tmp/verify270.log`)
**Naye/barhte gates:** `pwa-shared` **16/0** (naya) · `dyn-deps` **51/0** (25 se) · `pay-ledger` **48/0** (32 se, naya Section G) · `check.sh` 78 tools
**Rendered evidence:** real-Chrome probes (pay sheet ledger · receipt badge/preview · POS customer picker · dashboards/salesman/inventory render) + gate screenshots

Legend: **✅ mukammal (gate + rendered proof)** · **🟡 by design / note** · **⬜ user-side check (device/deployed backend)**

---

## A. Hardening demand (is round ka user message)

| Requirement | Status | Evidence |
|---|---|---|
| PWA pay/receipt layers ka **stale-node visibility audit** | ✅ | Root cause mila: `posTopLayer()` sirf `.open` dekhta tha (desktop ka `UI2.dismissTop` sabak PWA mein missing) → stale layer Esc nigal jati + scroll-lock phansa |
| Fix **shared/core level** par (page patch nahi) | ✅ | `Pwa_Shell`: `PWA.layerVisible` / `layerReport` / `sweepStale` (+ orphan `[data-stale-guard]` cleanup, scroll-lock sync, kill-switch `_features.stale`); `Pwa_POS`: `posTopLayer()` open **AND** visible + 10 sweep call-sites |
| **POS payment-ledger ka dedicated gate** | ✅ | `tools/test_pay_ledger.js` (v2.25.5 se mojood) chalayi + extend: **A–G = 48/0**; naya G: stale simulation, orphan sweep, double-open duplicate, kill-switch, Esc order, source lock |
| Gate ki sachai (false-positive guard) | ✅ | **Negative proof**: pre-fix build par wahi 2 assertions FAIL (G3b `top=posReceiptLayer`, G3c visible pay sheet band nahi hui) |
| Regression na toote | ✅ | `pwa-overlays` 124/0 · `pwa-ui` 66/0 · `pay-ledger` 48/0 · poora suite 65/65 green |

## B. Spec Part-1 §5–7 + line 889 ("Look for") — dynamic/data-aware UI

| Requirement | Status | Evidence |
|---|---|---|
| Duplicate implementations / repeated data-fetching | ✅ | `Shared.*` (customers/suppliers/items/sales/raw + accounts/warehouse) — **12 modules mein raw fetch 0** |
| Hard-coded dropdown behavior | ✅ | Declarative `[data-dep]` + `_depOpts` (`data-dep-placeholder`, `data-dep-scope`); AI model select `data-dep="ai.models"` |
| Hard-coded conditional fields | ✅ | `[data-when]` shared system (`when/wire/refresh/apply`), AI key + endpoint sections usi par; gate: real screen ke `[data-when]` **evaluate hue** |
| Repeated API calls | ✅ | Same key = **1 request**, ek waqt = **inflight dedupe**; gate measurements (hits/misses/dedupes) |
| Fields jo parent selection par response nahi dete | ✅ | T2 cascade: provider → models (switch-back **0 nayi request**, leakage 0, value manage/clear) |
| Sections jo dynamically appear/disappear hon | ✅ | `[data-when]` + `aria-hidden`; MOCK par key section hidden (khali container nahi) |
| Tables jo related data badalne par update hon | ✅ | `Shared.invalidateFor` + **`API.call` write-hook** (35+ actions): save/post/count ke baad cache khud saaf |
| Forms jo dependent fields populate na karein | ✅ | T2/T3; `reconcile` value preserve/manage |
| Inconsistent loading/validation | 🟡 | `UI.run` 34/0 + `ui-err` 30/0 pehle se (v2.25.x); baqi ad-hoc validations ka bulk W10 mein |
| Fix shared architecture first, then apply consistently | ✅ | Deps + Shared + PWA.shared — teeno pehle core mein, phir modules |

## C. PWA parity (W3.T4)

| Requirement | Status | Evidence |
|---|---|---|
| PWA ka apna shared cache (desktop jaisa) | ✅ | `PWA.shared` / `sharedInvalidate` / `sharedStats` / `invalidateFor` + kill-switch; gate **16/0** |
| PWA screens shared par | ✅ | POS/Field/Salesman ke 8 `parties.*` call-sites shared (bare 0) |
| Offline contract (desktop jaisa) | ✅ | `offlineFallback` ab parha jata hai (pehle **dead parameter** tha) — fallback / queue / saaf error |
| Demo fidelity | ✅ | PWA demo mock mein `parties.balance` + `parties.customerHistory` (asli backend `Code.gs:449` par mojood) |

## D. Standing user constraints

| Constraint | Status | Evidence |
|---|---|---|
| Audit-first, no guessing | ✅ | Har hissa audit/probe se shuru (`audit_dyn_deps`, `tmp/dyn-deps-audit.json`, real-Chrome probes) |
| Fix shared/core, phir app-wide | ✅ | Deps → Shared → PWA.shared; page-specific patches nahi |
| No false "fixed" claims | ✅ | Negative proof (pre-fix build) + gate verdicts + rendered screenshots |
| Small standalone tests (no long waits) | ✅ | Har batch ka apna gate; full suite sirf version tag par (is release par: 1251s, ALL GREEN) |
| Beginner docs / rollback | ✅ | CHANGELOG §5 rollback (archive zip + clasp push), setup guides package mein |
| 48px taps / 10.8px text / 16px inputs / layout 0 problems | ✅ | `layout*` + `pwa-layout*` gates (390/1024/1440, light+dark) is run mein green |
| Feature na hatao | ✅ | Sirf internal fetch paths badle; koi screen/feature remove nahi hui (smoke 332 + tabs 656 green) |

## E. Baqi (aage ke waves — A§18 order)
**W5** visibility (backend/API-level, CSS nahi) → **W4** global date/time/timestamp → **W6** sidebar collapsed/off-canvas →
**W9/W13** help links/docs → **W10** testing matrix → **W11/W12** docs pack. Is build mein in par claim nahi kiya gaya.
