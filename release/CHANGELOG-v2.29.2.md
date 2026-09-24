# Haseeb Autos — v2.29.2 CHANGELOG

**Date:** 2026-09-24 · **Version:** `2.29.2` (Utils.gs ▸ `AppConfig.VERSION`)
**Base:** v2.29.1 (W6.T3 sidebar matrix) → is build mein **W7.T1: BUSY COVERAGE (poore app par busy + duplicate-submit guard)**.

**Full verification:** `env -u HOME bash tools/verify.sh` → `tmp/verify292.log` · naya gate **`busy-coverage`** · `check.sh` **86 tools**.

---

## 1 ▸ Aap ki shikayat (spec: performance + shared UI)
> *"Button dabane par kuch nahi hota / dobara dabane se do dafa kaam ho jata hai"* · *"action-specific loading"* ·
> *"shared logic app-wide level par fix ho, har page par alag patch na lage"*

## 2 ▸ AUDIT pehle — `tools/audit_busy_coverage.js` (naya · acorn AST, guess nahi)

| Cheez | Nateeja |
|---|---|
| Gher-wrapped **ACTION** sites (`API.*` / `fetch` jo UI event handler mein hain magar `UI.run` ke bahar) | **78** — App_Config 22 · App_Masters 11 · App_Inventory2 8 · App_Comms 7 · App_Dashboards 6 · App_AIConfig 5 · App_UI2 4 · App_Accounting 3 · App_Wallet 3 · App_Boot 2 · App_Orders 2 · App_Screens2 2 · App_POS/POS2/Screens 1+1+1 |
| `UI.run` (busy + dup-guard) ke andar | **5** |
| Boot/loader/poller calls (action nahi) | 375 |
| Inline HTML `onclick="…"` (by-definition raw) | **0** |
| Parse fails | 0 (Apps Script template blocks skip hote hain) |

**Yani:** 78 jagah aisa button tha jo backend se data mangta tha magar us par **na busy dikhti thi, na dobara dabane se roktay** thay.

## 3 ▸ FIX — SHARED auto-busy engine (`apps-script/App_Core.html`, ek jagah)

Per-page patch **nahi** (78 sites edit karne ki zarurat nahi). Engine har handler ko registering waqt wrap karta hai:

- **Dono attachment tareeqay cover:** `h('button',{onclick: …})` → `addEventListener` path **aur** `el.onclick = …` property path
  (`EventTarget.prototype.addEventListener` intercept + `removeEventListener` mapping — app ke apne remove calls nahi tootay)
- Jab handler **Promise return** kare (yani asli async action) → element par:
  - `aria-busy="true"` + `.is-busy`/`.is-busy-ab` (CSS spinner, `prefers-reduced-motion` respect)
  - `disabled` (button/anchor) → **duplicate submit khud block**
  - **min-busy 320ms** (jhatka na lage) · **safety 120s** (jawaab na aaye to button hamesha ke liye phansa na rahe)
- **Sync handlers** (tab nav, print, quick-add) par **zero asar** — un par wait karne ko kuch nahi hota
- `UI.run()` wale buttons **skip** (double spinner nahi) — `__haRunBusy` run-lock
- **Opt-out:** kisi element/container par `data-nobusy`
- **Kill-switch:** `UI._features.autoBusy = false`
- **Stats:** `UI.autoBusyStats()` → `{ attached, done, forced, elements }`

## 4 ▸ GATE — `tools/test_busy_coverage.js` (**13 PASS / 0 FAIL**, ~31s)

| # | Saboot |
|---|---|
| A | `h()` path: async handler par `.is-busy-ab` + `aria-busy` + `disabled` |
| B | property path (`el.onclick = async …`) par bhi busy |
| C | **duplicate submit block** — busy ke doran extra clicks se API call **1** hi rahi |
| D | kaam khatam hone par busy state saaf (min 320ms dikh kar) |
| E | real screens sweep (settings/comms/dashboards): engine attach hui **aur** jab bhi busy lagi to us waqt API call **in-flight** thi (3/3) |
| F | kill-switch off → koi auto busy nahi |
| G | `UI.run` ke andar engine skip (double spinner nahi) |
| H | `data-nobusy` opt-out |
| I | zero page errors |

**Regression (is build par):** `ui-run` · `ui-err` · `smoke` · `modals-close` · `pay-ledger` · `sidebar-states` — **sab green**.

## 5 ▸ Kya nahi badla
Koi feature hata nahi · koi page-specific patch nahi · `UI.run` ka behaviour waisa hi (us ke buttons ab engine se skip hote hain) ·
sync actions par koi naya wait nahi · handlers ka `removeEventListener` mapping barqarar.

---
**Evidence:** `tmp/verify292.log` (full suite) · `tools/audit_busy_coverage.js` → `tmp/busy-audit.json` · gate output `busy-coverage 13/0`
