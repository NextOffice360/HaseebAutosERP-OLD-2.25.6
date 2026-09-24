# Haseeb Autos — v2.28.0 CHANGELOG

**Date:** 2026-09-24 · **Version:** `2.28.0` (Utils.gs ▸ `AppConfig.VERSION`)
**Base:** v2.27.0 (W3 dynamic/shared system) → is build mein **W5: GLOBAL FIELD VISIBILITY &
PERMISSIONS** (aap ke master spec ka §9 + §18 priority #5).

**Full verification:** `env -u HOME bash tools/verify.sh` → **66 GATES · ALL GATES GREEN ✔ (1226s ≈ 20 min)**
(log `tmp/verify280.log`) — naya gate: **`fields` (52/0)** · `check.sh` ab **80 tools**.

---

## 0 ▸ Spec ka matlab (aap ke lafz)
> *"Create reusable field-level visibility rules supporting: Role → Scope → Module → Section → Field → Permission …*
>  *Sensitive fields must be protected at the **backend/API authorization level**, not merely hidden with frontend CSS."*

Pehle sirf do jagah aisi thi jo permission-aware thin (POS ka profit toggle, Demand ka create button) —
baqi sab kuch "screen bhar ka data" tha: **jis ko screen dikhti thi, us ko us ke saare columns bhi milte thay.**

## 1 ▸ AUDIT pehle (naya tool, koi guess nahi)
`tools/audit_field_visibility.js` → `tmp/field-visibility-audit.json`:

| Cheez | Nateeja |
|---|---|
| Routes | **295** · module-permission wale **10** · bina koi perm check **285** |
| Sensitive tables padhne wale routes | **81** |
| Family-wise exposure | contact 39 · finance 47 · cost 63 · supplier 42 · address 22 |
| Backend par field-level rok | **NAHI — 0** (koi `Fields.strip`/filter mojood nahi tha) |
| Catalog mein field perms | **0** |
| Frontend CSS-only hiding | 13 candidate sites (baad mein manual check: zyada tar false positives — asli rule kahin tha hi nahi) |

**Behavioural proof (asli backend par):** `cashier` aur `salesman` login kar ke `items.list` —
`costPrice: "990"` **poora mil raha tha** (aur customer ka phone/balance bhi). Yaani cost, margin aur
customer contact ka poora data chup chaap har us role ke browser mein ja raha tha.

## 2 ▸ FIX — ek shared system (teen auraten)
| File | Kya |
|---|---|
| **`Fields.gs` (naya)** | Families (cost · margin · contact · finance · supplier · notes) ka column-regex + permission key · `Fields.denied/can` (Role → Module → Field) · **`Fields.wrap()`** (response se column gayab) · **`Fields.scrub()`** (incoming payload se bhi — chupke se bhej kar badla nahi ja sakta) · `matrix()` admin route · kill-switch `_features.on` |
| **`Code.gs` ▸ `api()`** | **Sirf do lines** — har route apne aap cover ho gaya (koi module ise bhool nahi sakta): response par `Fields.wrap`, payload par `Fields.scrub` |
| **`Schema.gs`** | 6 naye permission keys `field.*.view` + naya group **🙈 Field visibility** + har role ke sensible defaults (OWNER `*` · MANAGER/ACCOUNTANT sab · PURCHASE cost+supplier+contact · WAREHOUSE cost+supplier · CASHIER/SALESMAN contact+finance · DELIVERY contact) |

### Frontend (UI bhi chhupti hai — magar roke backend par hai)
- `App_Core.html`: **`App.field(family)`** + `App.fieldFilter([…])` (ek jagah define)
- `App_UI2.html`: **`UI2.table` ke columns** aur **`UI2.form` ke fields** par `family:` tag — teen jagah (columns list, column-picker, dono form paths). Marks laga dena kaafi hai; filter shared hai.
- Adoption: Items (cost column, Cost/Margin tiles, cost field) · Customers/Suppliers (phone, email, CNIC, credit limit, outstanding/available, terms) · **Dashboards** (Munafa KPI + Gross-margin ring) · **POS** (quick-view Cost/Margin cells, `showProfit`, aur `estProfit()` — cost na mile to ghalat munafa dikhane ke bajaye 0).
- **PWA**: `Pwa.gs ▸ bootstrap` ab `perms` bhejta hai · `Pwa_Shell` mein `PWA.can` / `PWA.field` / **`PWA.applyFields()`** (DOM pass) · Pwa_POS ka credit/history, Pwa_Field/Pwa_Salesman ke contact lines — sab `data-family` ke zariye.

## 3 ▸ Is kaam mein gate ne 2 ASLI bugs pakde (dono fix, dono locked)
1. **DB cache mutation**: `Fields.wrap` pehle rows ko **in-place mutate** karta tha (`delete row.phone`) —
   aur Apps Script ke `DB` cache **wahi row object** return karta hai, is liye *ek denied user ki call doosre
   (allowed) user ka data bhi kha jati thi*. Ab sirf **copy** banti hai. Gate mein regression assertion mojood.
2. **PWA bundle crash** (`S is not defined`): `PWA.field` screen ke apne state `S` ko chhoo raha tha
   (wo shell mein hota hi nahi) → **`state.data.perms`** par shift; `pwa-shared` + `pay-ledger` dono dobara green.

Aur ek **safety rule** bhi mila: `Purchase.gs:344` GRN post ka **cost payload se** aata hai aur stock ki value
banta hai — agar cost-blind user ka payload scrub kar dete to stock **zero value** par chala jata
("chup chaap ghalat"). Is liye financial writes (`grn.post`, `po.save`, `stock.adjust`, `salesman.issue` …)
**scrub se bahar** hain — wahan module-perm (`purchase.grn` wagaira) hi faisla karta hai. Read-side strip in
par bhi lagta hai (list/detail par cost nahi dikhta).

## 4 ▸ Naya gate `tools/test_field_visibility.js` — **52/0**
- **A** backend: owner/manager ko cost milta hai · cashier/salesman ko **column gayab** (baqi data salamat) ·
  manager (contact+finance denied) ko phone/email/creditLimit nahi · anon par cost/margin/finance/supplier/notes band
- **A2** regression: denied user ki call ke baad bhi allowed user ka data salamat (cache mutate nahi hoti)
- **B** write-guard: cost-blind user ka save **chalta hai** magar `costPrice` change **ignore** ·
  allowed role (manager) ka write chalta hai
- **C** kill-switch (OFF → cost wapas, negative proof) · GRN cost scrub-safe · sale line scrub
- **D** **rendered DOM (jsdom)**: family band → column/field DOM mein **render hi nahi hote** (sirf CSS hiding nahi) · allowed par control
- **E** source contracts (desktop + PWA)
- **F/G** admin: `fields.matrix` route · catalog mein 6 keys + naya group · **permission matrix rendered** (asli catalog se, 53 permissions × 9 roles, CASHIER ka cost toggle OFF)

## 5 ▸ Rollback
`release/archive/` mein pichhle packages (v2.25.2 … v2.27.0). Rollback = archive ka zip extract karke `clasp push`.
Koi schema/data change nahi hua (sirf naye permission keys — purane zips par wo keys na hote to behaviour bilkul v2.27.0 jaisa).

---

## 6 ▸ Addendum — CONTINUITY KIT (environment reset ka ilaj)

Aap ki shikayat: *"bar bar environment reset ho raha hai aur data loss ho jata hai"*. Wajah platform ka niyam hai —
**project files save hoti hain, magar ye cheezein har naye session mein gayab ho jati hain**: `node_modules/`,
Chromium binary (`~/.cache/puppeteer`, ~635 MB), `.chrome-libs`, chalte hue servers/processes, `/tmp`, aur
environment variables. Ab is ka pakka ilaj shamil hai:

| Naya file | Kaam |
|---|---|
| **`tools/bootstrap.sh`** | Ek command se poora environment wapas: npm deps → Chromium binary (agar gayab ho to download) → Chromium libs → demo build → demo server (8021) → canary gate → "kahan kya likha hai" ka naqsha. `--check` se sirf status. |
| **`RESUME-HERE.md`** | Reset ke baad PEHLE parhne wali file: kya persist hota hai / kya nahi, spec ki 5 copies kahan hain, roz-marra ke commands, traps, aur waves ka status. |
| **`tools/workspace_guard.sh`** | Snapshot ki 2 hadein (~128 MB, ~10,000 files) naazir rakhne wala guard; `--prune` se tmp logs/caches, aur `--prune-archives` se purane zips (newest 4 rakhta hai, hataye gaye zips ka record likhta hai). |

**Drill (asli test):** `node_modules/` **delete** kar ke aur demo server **band** kar ke `bash tools/bootstrap.sh` —
**8.4 second** mein: 126 npm packages install · Chromium mojood · 59 libs check · demo rebuild · demo server khud start
(pid 25093) · canary gate `fields` **52/0** · phir asli browser gate `pay-ledger` **48/0**. Yaani "reset" ka matlab ab
8 second ka kaam hai — koi data loss nahi (project files kabhi nahi jati).

**Is addendum ke sath package dobara cut hua (same version 2.28.0):** sirf **tools + docs** shamil hue —
**koi app-code (`.gs`/`.html`) tabdeeli nahi**, is liye `tmp/verify280.log` ka 66/66 green result waise hi lagoo hai
(uske baad chalaye gaye canary + pay-ledger gates ne bhi tasdeeq ki).
