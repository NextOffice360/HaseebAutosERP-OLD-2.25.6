# Haseeb Autos — v2.26.0 CHANGELOG

**Date:** 2026-09-24 · **Version:** `2.26.0` (Utils.gs ▸ `VERSION`)
**Base:** v2.25.11 (shared error/retry policy) → is build mein **W7: performance apply — mass
requests / N+1 khatam** (aap ke spec ka wo hissa: *"1 Gbps connection par bhi ek action ~1 minute
leti hai"* aur *"root cause pehle, phir shared level par fix"*).

---

## 1 ▸ Audit (pehle root cause, phir code)

`tools/audit_perf_sites.js` (naya tool) poore codebase ko scan karta hai — do qism ke N+1:

| Detector | Shuru mein | v2.26.0 |
|---|---|---|
| **Frontend:** loop ke andar `await API.call(...)` (sequential round-trips) | **46 sites / 18 files** | **0** |
| **Backend:** loop ke andar per-row Sheet/DB write | (scan) 10 → sab false-positive (in-memory / cache chunks / run-merge) | **0** |
| `.then(x => x.forEach(...))` chains | 14 sites | 14 — **ye N+1 NAHI** (pehle se parallel) |

Sab se bhaari jagah (aap ki shikayat ki jarh): **Accounting ▸ Expenses ▸ "Sab approve karein"** —
`pending.forEach(e => await API.call('expenses.approve', …))` yani **N pending = N mukammal
round-trips** (20 pending ≈ 20 requests → slow backend par ~1 minute).

Doosra asli **bug** (performance ke nam par chhupa hua): Config **import** `forEach(async …)` se
chal raha tha — **fire-and-forget**. UI "Config import ho gayi ✅" keh deta tha jab ke likhai abhi
chal rahi hoti thi, aur fail hone par kuch nahi batata tha.

## 2 ▸ Naya shared batch system

| Cheez | Kahan | Kaam |
|---|---|---|
| **`API.parallel(tasks, limit)`** | `App_Core.html` (W2 mein bana tha) | concurrency **cap** ke sath parallel — order barqarar, ek fail ho to baqi na rukein, error `{__err}` mein |
| **`Payments.approveExpenseBatch(ids, approve, s)`** | `Payments.gs` | **EK** request: ek `DB.all` read → `DB.updateMany` → ek fresh read → har posted expense ka `Accounting.auto('EXPENSE')` |
| route **`expenses.approveBatch`** | `Code.gs` | `{ ids: [...], approve: true\|false }`; duplicate ids dedupe; already-POSTED skip; `approve:false` → REJECTED |
| mock route | `demo/mock.js` | demo/PWA mein bhi wahi batch contract |

**Naapa hua farq (gate `perf-batch`, 24 pending expenses):**

| | Purana | Naya |
|---|---|---|
| Route calls | **24** | **1** |
| `Expenses` table par writes | **24** (`DB.update` per row) | **1** (`DB.updateMany`) |
| Kul sheet ops (24 approve) | 312 | **266** (−15%; baqi audit + auto-vouchers karobari zaroorat hain) |

## 3 ▸ Call-sites — sab shared logic par (page-specific patches nahi)

| Jagah | Pehle | Ab |
|---|---|---|
| **Accounting** — "Sab approve karein" | 24 sequential calls | 1 `expenses.approveBatch` + `UI.run` (busy state, duplicate-submit block, write-flag) + `API.parallel` **fallback** (purana backend ho to) |
| **Config ▸ Export** | 5 sequential `config.list` | `API.parallel` (5 ek sath) |
| **Config ▸ Import** | `forEach(async)` fire-and-forget (**bug**) | awaited parallel batches (6) + kamyab/fail ka natija (`impOk` / `impErr` toast) |
| **PayUI.validate** | har payment ka apna round-trip (N) | `API.parallel` — index-wise wahi order, offline tolerance barqarar (dead `validateLegacy` code hata) |
| **Screens2 ▸ Insights** | 4 sequential `purchase.po.get` | `API.parallel` (4 ek sath) |
| **Screens2 ▸ Permissions save** | per-role sequential; pehli ghalti par baqi roles chhoot jate | parallel batches + **sab** errors ka summary |

## 4 ▸ Naya gate + hardening (is build ka asli sabak)

| Gate | Natija | Kya pin karta hai |
|---|---|---|
| **`perf-batch`** (naya, 34 checks) | **34 / 0** · `SENS=1` → 1 FAIL | `API.parallel` contract (cap/order/error) · backend batch (1 request, 1 updateMany, 24 rows haqeeqat mein POSTED, dedupe, reject) · **rendered DOM**: Accounting ▸ Expenses tab par "Sab approve karein" ka click = 1 batch call, 0 purane calls, statuses POSTED, ginti ka toast · App_Config/App_PayUI/Screens2 source contracts · audit tool 0 N+1 · zero page errors |

**Do flakes jo is round pakde gaye (aur theek kiye):**

1. `modals-close` — verify ke dauran 2 checks red. **Root cause:** machine load par Chrome CDP
   `Escape` **drop** kar deta hai; saboot ye tha ke gate ka **apna** capture listener bhi
   `esc events=0` ginta hai (yani event app tak pohanchi hi nahi). Fix: `escClose()` — Esc ke
   baad overlay band na ho to **ek dafa** phir press (jaise user dobara dabata hai). Asli bug
   (Esc kabhi kaam na kare) ab bhi FAIL hota hai — masking nahi. Standalone: **91 / 0**,
   verify mein 24s.
2. `timeouts` — "no automatic write retry" red. **Root cause:** probe ke doran **background
   poll** bhi usi transport se ja rahi thi, is liye ginti 2 hui (retry hui hi nahi thi). Fix:
   assertion ab **siraf probed action** (`sales.post`) ke calls ginti hai — retry ki asal
   assertion wahi. Ab: **32 / 0**.

Dono fixes **test-side** hain (behaviour nahi badla) — aur dono apni asal regression pakadne ki
taqat rakhte hain.

## 5 ▸ Verify (v2.26.0)

```
env -u HOME bash tools/verify.sh  →  63 GATES · ALL GATES GREEN ✔  (1227s ≈ 20 min)
log: tmp/verify260c.log
naya gate: perf-batch (34/0)
```

| Run | Natija |
|---|---|
| #1 | `modals-close` RED (Esc input drop under load) → gate hardened |
| #2 | `timeouts` RED (background-poll false count) → assertion action-scoped |
| #3 | **63 / 63 GREEN ✔** |

## 6 ▸ Is build mein kya chhua

`Code.gs` (1 route) · `Payments.gs` (`approveExpenseBatch`) · `App_Core.html` (audit marker) ·
`App_Accounting.html` · `App_Config.html` · `App_Screens2.html` · `App_PayUI.html` ·
`demo/mock.js` (batch route + 2 extra pending expenses demo ke liye) · `Utils.gs` (VERSION) ·
naye: `tools/audit_perf_sites.js`, `tools/test_perf_batch.js` · hardened: `tools/test_modals_close.js`,
`tools/test_timeouts.js` · `tools/verify.sh` (63 gates).

## 7 ▸ W7 baqi kaam (agli waves)

- Baqi 11 module call-sites (Store/Inventory/AIConfig/Reports) — audit unhen **N+1 nahi** batata
  (`.then(...forEach)` = pehle se parallel), phir bhi aankhon se jaanch baqi.
- Backend ke 10 per-row-looking sites: sab in-memory/cache/run-merge (verify ho gaya, kuch karna nahi).
- Aage: **W3** (dynamic data-aware deps) → W5 (backend visibility) → W4 (date/time) → W6 (sidebar).
