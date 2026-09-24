# TODO — Performance · Shared Logic · Dynamic UI · Timestamps · Visibility · Sidebar

**Added:** 2026-09-24 · **Owner:** dev (Arena agent) · **Status:** **v2.29.0 SHIPPED** — W3 (T1–T4) + **W5 (field visibility)** + **W4 (date/time system)** mukammal · **CONTINUITY KIT**: `tools/bootstrap.sh` + `RESUME-HERE.md` + `tools/workspace_guard.sh` (reset = 8s ka kaam, drill-proven)
**Rule (user):** *"Do not just patch the visible symptoms. First identify the underlying architectural/shared logic problems, fix them at the reusable application-wide level, then make sure the affected modules consume that shared logic consistently."*

> **REQUIREMENTS REGISTRY:** `MASTER-REQUIREMENTS.md` (Attachment A ke 18 sections + Attachment B ke 16 sections + 6-point/16-point specs → waves W1–W13, status ke sath).
> **ATTACHMENTS:** `ATTACHMENTS-INDEX.md` — kaun si uploaded file kis kaam se pehle parhni hai.

## ✅ W4 MUKAMMAL (v2.29.0) — Global Date/Time/Timestamp System (spec §8 · §18 #6)

- **Audit** (`tools/audit_datetime.js` → `tmp/datetime-audit.json`): `U.iso()` 153 · `fmt.date()` **92** · raw `.slice(0,10/16)` 36 · display settings **6 gayab** · **consistency bug**: backend seconds likhta tha, frontend bina seconds dikhata tha.
- **Settings (naye 6 keys)**: `dt.format` (date/time/datetime/stamp) · `dt.dateStyle` (4) · `dt.hour12` · `dt.seconds` · `dt.showTime` (global on/off) · `dt.showRecords` (Created/Updated line) + `timezone` default Asia/Karachi.
- **Backend**: `U.dtConfig/_parts/disp/stamp` (Intl tz) + route `system.dtconfig`. **Frontend**: naya **`DT`** layer + `fmt.date/time` delegation (92 call-sites bina patch) + **`UI2.stampRow`** (Items/Customer/Supplier/GRN detail).
- **Integrity rule**: stored wall-clock strings tz se shift nahi hote; sirf asli instants convert hote hain (gate B proof).
- **Gate `tools/test_datetime.js` 44/0** (verify.sh L151): har setting · 12h edge cases · global visibility · timezone · stamps · **FE↔BE parity 100 combos** · rendered DOM + negative proof · zero page errors.

## ✅ W5 MUKAMMAL (v2.28.0) — Global Field Visibility & Permissions (spec §9 · §18 #5)

- **Audit pehle** (`tools/audit_field_visibility.js` → `tmp/field-visibility-audit.json`): 295 routes · sirf 10 par module-perm · 81 routes sensitive tables padhte hain · **backend par field-level rok 0** · catalog mein field perms 0. Behavioural proof: cashier/salesman ko `items.list` se `costPrice: "990"` poora mil raha tha.
- **Fix (ek shared system):** naya **`apps-script/Fields.gs`** (6 families + `denied/can/wrap/scrub/matrix` + kill-switch) · **`Code.gs ▸ api()` mein sirf 2 lines** (sab 295 routes cover) · **`Schema.gs`**: 6 naye `field.*.view` keys + group 🙈 Field visibility + role defaults.
- **UI half:** `App.field/App.fieldFilter` + `UI2.table` columns & `UI2.form` fields par `family:` filter (teen paths) → phir Items / Customers / Suppliers / Dashboards / POS par adoption. **PWA:** bootstrap `perms` + `PWA.can/PWA.field/PWA.applyFields` (POS credit/history, contact lines).
- **2 asli bugs gate ne pakde:** (1) `Fields.wrap` DB cache rows ko in-place mutate kar raha tha (ek denied user ki call doosre ka data kha rahi thi) → **copy semantics**; (2) PWA `S is not defined` (screen ka state shell mein nahi) → `state.data.perms`.
- **Safety rule mila:** GRN post cost **payload se** aata hai (`Purchase.gs:344`) → financial writes scrub se bahar (warna stock zero value par).
- **Gate `tools/test_field_visibility.js` 52/0** (`verify.sh` L149): backend families · anon · cache-mutation regression · write-guard ×3 · kill-switch · GRN-safe · **rendered DOM** (column/field render hi nahi hote) · source contracts · admin matrix rendered (53 perms × 9 roles).
- **Release:** `release/haseeb-autos-v2.28.0.zip` + `CHANGELOG-v2.28.0.md` + `REQUIREMENTS-CHECKLIST-v2.28.0.md`.

## ✅ v2.27.0 SHIPPED — 2026-09-24 (hardening + W3 T1–T4)

- **Verify:** `env -u HOME bash tools/verify.sh` → **65 gates · ALL GATES GREEN ✔ · 1251s ≈ 21 min** (`tmp/verify270.log`) — naya gate **`pwa-shared` 16/0**, `dyn-deps` **51/0**, `pay-ledger` **48/0**, `check.sh` 78 tools
- **Package:** `release/haseeb-autos-v2.27.0.zip` (**5,824,663 B · 269 files**) + `CHANGELOG-v2.27.0.md` (8,013 B) + `REQUIREMENTS-CHECKLIST-v2.27.0.md` (5,334 B) · purana v2.26.0 zip `release/archive/` mein
- **`verify.sh` improvement:** demo server 8021 khud start karta hai (pay-ledger/pwa-shared HTTP gates) aur end par sirf apna band karta hai
- **Is build ka scope:** H1/H2 (PWA stale-node + pay-ledger gate) · W3.T1–T4 (Deps core · AI Setup cascade · Shared accessors 12 modules · PWA parity) — tafseel neeche

## 🔧 HARDENING (v2.26.0 ke baad, W3 ke sath release hoga) — 2026-09-24

**User demand:** *"hardening: PWA pay/receipt layers par bhi 'stale node' visibility audit + POS payment-ledger ka dedicated gate."*

### H1 — PWA pay/receipt layers: stale-node visibility ✔ (root cause fix, shared level)

- **Root cause (audit se):** PWA mein `posTopLayer()` sirf **`.open` class** dekhta tha. Desktop par ye bug pehle hi fix ho chuka hai (`UI2._visible` + `UI2.dismissTop`, v2.25.2) magar PWA mein us ka koi equivalent nahi tha. Nateeja: agar koi layer `.open` reh jaye magar **haqeeqat mein invisible** (display:none / getClientRects khali / opacity 0 — e.g. render fail, tez double-tap, offline re-render) to:
  - **Esc usi stale layer ko chala jata** → asli visible pay sheet/receipt band hi nahi hoti,
  - **body ka `overflow:hidden` scroll-lock phansa** reh jata (user scroll na kar sake).
- **Fix (shared/core level, page-specific patch nahi):** `Pwa_Shell.html` mein shared helpers — `PWA.layerVisible(el)` (getClientRects + computed display/visibility/opacity), `PWA.layerReport()` (kaun open / kaun visible / kaun **stale**), `PWA.sweepStale()` (stale layers ko `open` class se hata + `aria-hidden` + **orphan hidden `[data-stale-guard]` nodes remove** + scroll-lock sync). Kill-switch: `PWA._features.stale`.
- `Pwa_POS.html`: `posTopLayer()` ab **open AND visible** (stale skip) — sab PosCart/PaySheet/Receipt Esc handlers isi se chalte hain; teeno layers ke `open()`/`close()` par `sweepStale()` call.
- **Evidence:** screenshots `tmp/hardening-pay-sheet.png` (ledger: Prev 0 · Invoice 338 · Cash Paid -0 · Remaining 338 · Closing 338) + `tmp/hardening-receipt.png` (badge `HARDEN-1`, invoice rows, print/share/PDF/WhatsApp).

### H2 — POS payment-ledger ka dedicated gate ✔ (pehle se tha, ab extend + run)

- `tools/test_pay_ledger.js` **v2.25.5 se mojood tha** magar is session mein chalaya nahi gaya tha → chalaya, gap-check kiya, **naya Section G** add kiya (16 assertions):
  - G0–G1: cart+pay setup, `open ⊂ visible`, body scroll-lock
  - G2: **orphan `[data-stale-guard]`** node → `sweepStale()` remove kare
  - G3: **stale layer simulation** (receipt `.open` + `display:none`) → `posTopLayer()` usse **skip** kare, Esc asli **visible** pay sheet band kare, ledger values na badlein
  - G4–G5: receipt double-open par bhi `.pay-sheet` **sirf 1** (duplicate/orphan nahi) · close button + scrim close → layer band, body unlock, preview content intact
  - G6: **kill-switch proof** (`PWA._features.stale=false` → stale chhua nahi jata)
  - G7: cart+pay stack mein Esc order (pay pehle, cart baad, lock sahi)
  - G8: **source-contract lock** — shell ke Esc listeners stale-guarded (`document.body.contains` x3), `layerVisible` helper define+export, `posTopLayer` skip, teeno layers par `sweepStale` (10 call-sites)
- **Verdict:** `PAY LEDGER PASS: 48 / FAIL: 0` (pehle 32 checks + **16 naye**: G0–G7 behavioural + **G8 source-contract** lock) · A–F (desktop ledger math, recorded-sale consistency, blocked path, credit/PARTIAL, invariants, PWA pay sheet) sab green
- **Negative proof (false-positive guard):** pre-fix demo copy (sirf class check wala `posTopLayer`) par bilkul wahi 2 assertions **fail** hue (G3b `top = posReceiptLayer`, G3c visible pay sheet band nahi hui) → fix asli hai, gate sensitive hai
- Ye gate `verify.sh` mein **pehle se registered** hai (`pay-ledger` — v2.25.5 se, line 145) — gates **64** barqarar

### Regression sweep (hardening ke baad)
`pay-ledger 48/0` · `pwa-overlays 124/0` · `pwa-ui 66/0` · `dyn-deps 25/0` · `perf-batch 34/0` · `pos-multi 23/0` · `ui-run 34/0` · `check.sh ✔` (77 tools, RULE1 2, RULE2 0)
**Bug jo isi kaam mein pakda gaya:** `Pwa_Shell.html` IIFE ke andar `PWA.layerVisible = …` assign kar raha tha jab `PWA` khud abhi bana hi nahi tha → poora bundle boot par crash (pwa-overlays 124 red) → assignment export object mein shift ki, dobara 124/0.

### W3.T2 ✔ — AI Setup (provider → model/sections) ab shared `Deps` par  [2026-09-24]

Spec line 799–871 ("Dropdowns and selection fields must drive the rest of the UI dynamically … reusable dependency/configuration system, **not isolated hard-coded logic for each dropdown**") ka asli module adoption:

- **Naye shared primitives (`App_Core.html`)** — sirf AI ke liye nahi, poore app ke liye:
  - `Deps._scopeEl(el)` — parent field dhoondte waqt scope: ancestor/khud ka `data-dep-scope` (CSS selector) → warna document. **Ye stale/detached node class ka shared ilaaj hai** (neeche bug #2 dekhein).
  - `data-dep-placeholder="<text|false>"` — declarative placeholder (hardcoded `bindSelect(opts)` ki zaroorat khatam); `wire()`/`refresh()` dono `_depOpts()` use karte hain.
- **AI config (`App_AIConfig.html`)**:
  - `Deps.define('ai.providers')` (10 min cache) → provider metadata ek hi request se, `hardRefresh` available.
  - `Deps.define('ai.models', {fetch})` — **provider → models cascade**, per-provider cache; pehli dafa config se, warna ek catalog/live refresh; `(saved)` model row preserve.
  - Model `<select>` ab declarative: `data-dep="ai.models"` + `data-dep-parent="aiProvider"` + `data-dep-scope="#view"` + `data-dep-placeholder="false"`; hidden provider field (`#aiProvider`) — cards ek hi rasta `setProviderValue()` use karte hain.
  - **Cache coherence:** `connectProvider` / `saveAllInner` / `testConn` / key-remove — jab bhi config badli, `Deps.hardRefresh('ai.models')`.
  - `[data-when="!aiProvider=MOCK"]` — API-key section + advanced endpoint block shared conditional UI se (khali container chhor kar hide nahi karte).
- **Gate `dyn-deps` 25 → 36 checks** (naya block ⑦): GEMINI→OPENAI switch par options badalte hain (koi leakage nahi) · **wapas GEMINI = 0 nayi request** (per-provider cache) · provider badalne par purana model select mein nahi rehta (manage/clear) · MOCK par key section hidden/absent · real screen ke `[data-when]` blocks **evaluate hue** (`__depsWhen`, dead markup nahi) · **stale duplicate provider field (`#view` ke bahar) cascade hijack nahi kar saka**.
- **`SENS=1` → 13 pass / 23 fail** (kill-switch proof). `ai-ui` gate **55/0**, `ai-hub` 35/0, `ai` 75/0, `ai-load-order` 49/0.

**Is kaam mein 2 asli bugs pakde gaye (guess nahi, gate se proven):**
1. **Detached-tree parent lookup** — AI hub apna UI `legacy` detached div se nodes utha kar banata hai; pehle hidden provider field `legacy` mein reh gaya → Deps ko parent mila hi nahi (`parentValue=''`) → mock GEMINI fallback de deta tha → OpenAI par GEMINI models. Fix: field **visible tree** mein, wiring sirf visible tree par (`Deps.apply(c)` hub ke end mein).
2. **Stale-node hijack** — `#view` ke bahar koi bhi duplicate `#aiProvider` (purana render/detached tree) `_readParent` ko ghalat value de sakta tha. Fix shared: `data-dep-scope` + `_scopeEl()`.

### W3.T3 (batch 1) ✔ — Shared data accessors: repeated fetching khatam  [2026-09-24]

Audit (`tmp/dyn-deps-audit.json`) ka sab se bara item: **wahi data har screen apne tareeqe se fetch kar rahi thi** —
`items.search` **7 files / 9 calls**, `customers.list` **7 files**, `sales.list` 5, `suppliers.list` 4.
Spec (A line 889 "Look for": *Repeated API calls · Repeated data-fetching logic*) + line 903
(*"Fix the shared architecture first, then apply it consistently"*).

- **Naya shared layer (`App_Core.html`)** — `Shared` (window.Shared, v1.0.0):
  - `Shared.list(action, payload, {ttl, offline})` → **hamesha rows array**; key sirf un cheezon se banti hai jo result badalti hain (`undefined/null/''` keys skip).
  - `Shared.customers/suppliers/items/sales({...})` — 4 thin accessors (POS grid, picker, palette, Demand, Orders, Boot sab inhi par).
  - **Cache:** `Deps.shared` (same key = 1 request, 60 s search / 180 s list TTL).
  - **Offline fallback CACHE nahi hota** — warna data wapas aane par purana fallback chipka reh jata.
  - `Shared.invalidate('customers'|'items'|... )`, `Shared.invalidateFor(action)` + **`API.call` ke success path par automatic hook**: koi bhi write (`customers.save`, `sales.post`, `stock.count`, `payments.*` …) → related read-caches khud saaf (spec: *"tables that do not update when related data changes"*). Map `Shared._writeMap` mein 30+ actions.
- **Adoption:** 11 call-sites convert hue — `App_POS` (customer search + grid search), `App_POS2` (customer search + deep search), `App_Demand` (customer + item), `App_Orders` (customer picker + barcode exact + item search), `App_Boot` (global search ki 3 requests), `App_UI2` (command palette items/customers/sales + `UI2.itemPicker._defaultSearch`).
  → in **6 files mein `API.call('customers.list'|'items.search'|'sales.list')` ab ZERO** (gate assertion).
- **Real Chrome evidence** (jsdom ke upar, `tmp/probe_shared.js` → `tmp/` se hata diya): `Shared.customers` same query 2 dafa = **2 calls / 3 requests**, alag query = nayi request; POS (POS2) `custBar2` → picker modal → "Ahm" type → **1 row render, zero page errors**.
- **Gate `dyn-deps` 36 → 45 checks** (naya block ⑧): same query dobara = 1 request · nayi query = nayi request · invalidate ke baad taaza fetch · **write ke baad automatic invalidate** · offline fallback cache nahi hota · 6 modules mein leftover raw fetch **0** · source contract. **`SENS=1` → 17 pass / 28 fail**.

**Gate ne 2 asli bugs pakde (guess nahi):**
1. **`Shared.invalidate` kuch bhi clear nahi kar raha tha** — `Deps.shared(key, …)` apne entries `shared:<key>` naam se cache karta hai, magar invalidate `hardRefresh(action)` chala raha tha (aur `hardRefresh` sirf `key + \0` prefix match karta hai) → write ke baad bhi purana data. Fix: naya **`Deps.clearPrefix(pfx)`** (raw prefix) + invalidate usi par.
2. **Prefix vs SEP semantics** — `hardRefresh('customers.list')` wali prefix `customers.list\0` banati hai jo `customers.list|limit=…` keys par match hi nahi karti thi (upar wala fix isi ko cover karta hai).

### W3.T3 (batch 2 + 3) ✔ aur W3.T4 ✔ — poore app + PWA parity  [2026-09-24]

**Batch 2/3 (desktop):** `suppliers.list` (Demand ×2, Masters, Reorder, Screens2) aur `sales.list`
(Dashboards ×2, Print, Screens) + `items.list` (Masters) + Inventory2 item lookup + **Salesman ka `smCall`**
→ sab `Shared.*` par. Salesman mein shared core routes (`customers.list`/`items.search`/`sales.list`/`suppliers.list`)
ab `Shared.raw` se guzarte hain (salesman.* routes seedha API par — unka data screen-specific hai).
- Naya `Shared.raw(action, payload, opts)` — **poora envelope** (rows/total/totals) cache se; `Shared.list` usi cache entry par rows deta hai → **ek request, dono shakal** (gate: `requests=1`).
- **12 modules mein raw customers/suppliers/items/sales fetch = ZERO** (gate assertion).
- `dyn-deps` gate **45 → 48 checks**.

**W3.T4 (PWA parity):** PWA ka apna transport hai (`PWA.call`), is liye desktop `Shared` wahan nahi chalta tha —
audit: `parties.balance` / `parties.customerHistory` PWA ki **3 screens (POS/Field/Salesman) mein 8 jagah** alag alag call.
- `Pwa_Shell.html` mein **`PWA.shared(key, fetcher, ttl)`** (+ `sharedInvalidate(prefix)`, `sharedStats()`, `PWA.invalidateFor(action)`)
  — wahi semantics: same key = 1 fetch · **inflight dedupe** · **error cache nahi** · kill-switch **`PWA._features.cache`**.
- **write-hook:** `pwa.pos.sell` / `pwa.sm.collect` / `pwa.wh.*` / `customers.save` → related cache khud saaf (`parties.`, `pwa.wh.`, `demand.`, `loyalty.`).
- 3 screens ke 8 call-sites `PWA.shared` par → **bare (unwrapped) parties.\* call ZERO**.
- **Do asli parity gaps bhi band hue (gate ne pakde):**
  1. **`PWA.call` mein `offlineFallback` parha hi nahi jata tha** — screens har jagah `{offlineFallback: …}` bhejti thin, magar net band hone par fallback ke bajaye error aata tha. Ab desktop jaisa contract: offline + fallback → fallback value · offline + queueable → queue · warna saaf error.
  2. **PWA demo mock mein `parties.*` routes maujood nahi thay** (asli backend `Code.gs:449` par hai) → demo mein balance/history lines chup chaap gayab rehti thin. Ab demo mock mein bhi hain (demo fidelity, pretending nahi).
- **Naya gate `tools/test_pwa_shared.js` — 16/0** (contract · dedupe · error-no-cache · invalidate + write-hook · offline contract ×2 · kill-switch · **real POS flow (customer select) se `parties.balance|CUSTOMER|…` key** · 3 screens bare-call 0 · shell contract · demo-fidelity · sm/fo boot) → `verify.sh` ab **65 gates**.

**Regression (sab green):** smoke 332/0 · tabs 656/0 · logic 816/0 · e2e 55/0 · pwa-overlays 124/0 · pwa-ui 66/0 · pwa-shared 16/0 · pay-ledger 48/0 · dyn-deps 48/0 (SENS 19/29) · ai-ui 55/0 · pos-multi 23/0 · ui-run 34/0 · ui-err 30/0 · check.sh ✔.

## 🔄 W3 CHALU — dynamic/data-aware shared system (v2.27.0, ab tak)

- **W3.T0 audit ✔** — naya tool `tools/audit_dyn_deps.js` (spec ka 12-item "Look for" checklist naapta hai):
  `data-dep`/`Deps.*` markers **0** · inline `<option>` builds **104** · `items.search` **11 jagah** (8 routes >1 file) ·
  ad-hoc validations **110** vs shared **5** · manual busy toggles **11** vs `UI.run` **10** · search/filter/sort impls 6 files · debounce impls 21
  → snapshot `tmp/dyn-deps-audit.json`
- **W3.T1 `Deps` core ✔** — `App_Core.html` mein (228 lines), model: **Field → Value → Dependency → Data → UI**
  - `Deps.define/load` (cache + **inflight dedupe**, error cache nahi hota, `hardRefresh`)
  - `Deps.shared(key, fetcher, ttl)` — ek hi data kai screens par → **1 request**
  - `Deps.bindSelect` + declarative `[data-dep]` / `[data-dep-parent]` + `Deps.wire/refresh`
  - `Deps.when` — `[data-when="provider=OPENROUTER"]` conditional UI (+ `!` negation, aria-hidden)
  - `Deps.reconcile` — value **preserve/manage** (list mein ho to rakho, warna clear)
  - `deps:change` / `deps:loaded` events (tables/forms refresh ho sakte hain) · kill-switch `_features.on`
- **Aasan farq (gate se proven):** wahi item search dobara = **0 nayi request**; ek waqt 3 calls = **1 request**; parent badla → child options badle, value preserve/clear
- **Gate `dyn-deps` 45/0** (SENS=1 → 17/28; T1+T2+T3 ke sath barhta gaya) · verify.sh **64 gates** · ye gate **khud 3 asli bugs pakde**: `opts.valueOf` ka `Object.prototype` collision, `[data-field]` wrapper se value read, `map()` mein `this` loose
- **Pehla module adoption ✔** — `UI2.itemPicker._defaultSearch` ab `Deps.shared` (POS/PO/GRN/Salesman/Transfer/Count sab pickers)
- **W3.T2 (agli)** provider/config forms (`App_AIConfig`) ko `Deps` par · **W3.T3** 104 inline option lists → `Deps.define` · **W3.T4** PWA bundle parity + `data-when` ka asli module adoption (Inventory location→bin, customer→price tier)
- **Note:** version abhi `2.26.0` hai — W3 mukammal hone par **v2.27.0** tag hoga (full verify + package).

## ✅ v2.26.0 SHIPPED — 2026-09-24 (W7: mass requests / N+1 khatam)

- **Verify:** `env -u HOME bash tools/verify.sh` → **63 gates · ALL GATES GREEN ✔ · 1227s ≈ 20 min** (`tmp/verify260c.log`) — naya gate **`perf-batch` 34/0** (`SENS=1` → 1 FAIL)
- **Zip:** `release/haseeb-autos-v2.26.0.zip` — **5,759,668 B / 264 files** (VERSION 2.26.0; approveBatch + Payments.approveExpenseBatch + mock `_batch` + 12 call-site markers content-verified)
- **Shots:** `release/shots-v2.26.0/` 9 PNGs · **Docs:** `release/CHANGELOG-v2.26.0.md` · `REQUIREMENTS-CHECKLIST-v2.26.0.md` (17,500 B) · `AUDIT-EVIDENCE-v2.26.0.html` (816,668 B, pill "63 / 63 GATES GREEN · 1227s")
- **Archive:** v2.25.11 zip archive mein gaya (10 zips) · purane v2.25.11 docs/shots hata diye
- **W7 ka nateeja:** frontend loop-N+1 **46 → 0** · backend per-row writes **0** (10 hits sab in-memory/cache/run-merge) · Accounting bulk approve **24 requests → 1**, 24 Expenses writes → 1, sheet ops 312 → 266 · Config import ka **fire-and-forget bug** khatam (awaited parallel + kamyab/fail natija)
- **Gate hardening (2 flakes pakde gaye):** `modals-close` — load par Chrome Esc drop → `escClose()` retry (91/0, masking nahi: asli bug ab bhi FAIL) · `timeouts` — background-poll ginti → assertion sirf probed action par (32/0)
- **Runs:** #1 `modals-close` RED → #2 `timeouts` RED → #3 **green**
> **Naya standing rule (user, 2026-09-24):** *har naye TODO/kaam se pehle relevant attached file parhein* (research, coding, debugging, deploy, docs — sab ke liye).


### Progress (live)

| Wave | Status | Evidence |
|---|---|---|
| **W0** harness + baseline | **T0.1 ✔ T0.2 ✔ T0.3 ✔** | `quick.sh logic api-instrument` OK · `api-instrument` **14/0 (4s)** · baseline JSON: 10 routes, 19 calls, 0 dup, worst p95 246ms (demo/mock) · regression: `smoke` ✔ + `e2e` 55/0 + `logic` 816/0 — wrapper se kuch nahi toota |
| W1 root-cause audit | **E1–E11 (partial, numbers ke sath)** | 438 call-sites · 0 dedupe/cache · App_Screens2 49 await / 0 Promise.all · N+1 Accounting · cache 203/438 |
| **W2 shared fetch + busy + error** | **T2.1 ✔ · T2.1b ✔ · T2.2 ✔ · T2.3 ✔** | gate `api-core` **16/0 (6s)** · `session-guard` **15/0 (9s)** · sensitivity: features off = **6 FAIL** · 3× renderNav: cache ON **1** call vs OFF **3** · zip `release/haseeb-autos-v2.25.9.zip` **5,691,324 B / 259 files** · verify `tmp/verify259d.log` **60/0 (1193s)** |
| W2.T3/T2.4 | **DONE in v2.25.11** | error/retry policy ✔ (§ below) · long-op progress ✔ (elapsed seconds, v2.25.10) |
| **W7 perf apply** | **✅ SHIPPED v2.26.0** | `API.parallel` call-sites · backend batch `expenses.approveBatch` (24 req → 1) · gate `perf-batch` 34/0 |
| W3 dynamic deps | pending | A§5–7 (Country→State→City, AI provider forms) |
| W5 visibility | pending | A§9 — backend-enforced role→scope→module→section→field |
| W4 datetime | pending | A§8 — ek global date/time system |
| W6 sidebar | partial (v2.25.8 icon-only) | A§10 — partial-collapse + tablet/off-canvas verify |
| **W9 UX/design-system + doc links** | pending | A§11–13, B§3·4·14 |
| **W10 testing matrix** | pending | A§17 — 17 scenarios (kuch gates mojood) |
| **W8 naming/architecture audit** | pending | A§14 |
| **W11 beginner docs pack** | pending | A§3 — per integration: setup → rollback |
| **W12 deploy/config/rollback + secret scan** | pending | A§15, B§16 |
| **W13 module wave (B§5–13)** | pending | invoice/credit logic · quick view · multi-select · conversion units · auto-reorder · AI providers · histories · salesman · dashboards |
| W4 datetime | pending | — |
| W5 visibility + backend | pending | — |
| W6 sidebar rail/off-canvas | **T6.1 ✔ T6.2 ✔ T6.4 ✔** (T6.3 partial) | gate `sidebar-states` **19/0 (15s)** — rail icons-only · hover par bhi icons · persistence · Ctrl+B save · mobile drawer poore labels · scrim/Esc band · resize cycle |
| W7 app-wide apply | pending | — |
| W8 verify + release | pending | — |

**Sabaq (is round ka):** background process user interrupt par mar jata hai — v2.25.7b ka full verify gate 36 (`punch`) par kill hua (chrome 0). Is liye:
* **Full 56-gate suite ek hi bash call mein foreground** (`timeout` ≤ 1800s), kabhi background mein turn-crossing nahi.
* Rozana ka kaam = `bash tools/quick.sh <gate…>` (per-gate 150s timeout, hang par khud mar jata hai).
* v2.25.7b ka `labels-live` akela dobara chala kar **30/0** confirm ho gaya; poora 56-gate run **v2.25.8 tag** par hoga (audit wave ke baad).

---

## 0 ▸ Kyun ye plan + "NO LONG WAIT" protocol (sandbox hang se bachne ke liye)

User ki shikayat: full verify (~19 min) baar baar chalane se wait/hang hota hai. Is liye:

| Qaida | Tafseel |
|---|---|
| **1 chhota test = 1 kaam** | Har task ka apna gate script (`tools/test_*.js`) jo **akela** chalta hai aur **≤ 90s** leta hai. |
| **Gate subset** | `bash tools/verify.sh labels-live modals-close` — sirf mutalliqua gates (verify.sh ye already support karta hai). |
| **Timeout wrapper** | Har browser test `timeout 150 node tools/<gate>.js` se; hang ho to khud mar jaye, sandbox na atke. |
| **Full suite sirf release par** | 56-gate poora run **sirf** version tag ke waqt (background + koi edit nahi), warna `--fast` set (~39s). |
| **Chhote cases** | Har raster/browser test mein max 3–4 cases per run (pehle 12 cases = 30s+). |
| **waitForFunction, sleep nahi** | Fixed sleeps ki jagah state-wait (purana sabaq). |

**W0.T1 (sab se pehle):** `tools/quick.sh <gate...>` — timeout + sirf summary line print kare. ✔ (ban gaya)
**Gates: 56 → 57** (`api-instrument` register ho gaya, 4s — fast set ke qareeb).
**Naya sabaq (v2.25.8):** full-suite load par `scan-parity` flake de raha tha (scan field type karne se pehle re-render ho jata tha → value khali). Test ko harden kiya: typing se pehle input ka **stable hona** (same element + connected + 300ms, max ~3s), attempts 3 → 5, retry settle 450ms. Ab full run mein bhi **29/0**.

**Naya sabaq:** na-registered gate naam par `verify.sh` chup-chaap exit 0 deta hai → `quick.sh` ab **UNKNOWN gate ko FAIL** karta hai (warna "green" jhoota lagta).

---

## 1 ▸ Requirements (user ke alfaaz mein, condensed) — inko poora karna hai

**A. Performance & loading (Priority 1)**
A1. App bohat slow: 1 Gbps par bhi button click ke baad ~1 minute tak kuch nahi. Hosted + local dono par.
A2. Action-specific loading state (spinner **usi button** par), duplicate submission block, success/error state, retry **sirf** jab wajib ho, long ops ka progress. Generic app-wide spinner nahi.

**B. Shared logic (core architecture)**
B1. Common logic (fetch, loading, error/retry, deps, visibility, datetime, sidebar) **ek jagah** likhi jaye — POS/GRN/PO/customers/products/settings har page par alag nahi.

**C. Dynamic data-aware UI**
C1. Parent selection → dependent data → dependent fields → sections → options **apne aap** update (misaal: Country → State → City → Postal). Manual refresh nahi.
C2. Field mein data ho → us se juri section show; khali ho → hide (khali card/blank block nahi).
C3. Dropdown-driven config (misaal: AI provider Gemini/OpenAI/Anthropic → us provider ke fields, validation, baqi hide; values preserve/manage).

**D. Audit-first**
D1. Pehle poore app mein identify karo: duplicate logic, hard-coded dropdowns/conditions, repeated API calls, wo fields jo parent par react nahi karte, sections jo show/hide nahi hote, tables jo data change par update nahi hote, inconsistent validation/loading, components jo ek hi kaam different tareeqe se karte hain.

**E. Date & time system**
E1. Records par created/updated **date + time** (full timestamp) — jaisa: *Created: 23 Sep 2026, 10:42:31*.
E2. Display configurable: date only / time only / date+time / full, 12h/24h, seconds on/off, timezone, format string, aur **global on/off**. Har jagah wahi shared formatter.

**F. Field & data visibility (+ security)**
F1. Reusable visibility system: `Role → Module → Section → Field`, aur `User Scope → Branch/Warehouse → Data`.
F2. Modules: POS, GRN, PO, SO, invoices, customers, products, suppliers… Sensitive fields: cost price, margin/profit, customer contact/data, supplier info, internal notes, financials.
F3. **Ahem:** sirf CSS se hide nahi — **backend/API level** par bhi sensitive data frontend ko na bheja jaye.

**G. Sidebar / navigation (baar baar repeat hui shikayat)**
G1. Desktop: **Expanded = icon + text**, **Partially collapsed = icon ONLY** (text hatna lazmi, width kam ho). Mojooda behaviour ghalat hai.
G2. Responsive: desktop/laptop/tablet/small — predictable states: **Expanded → Rail (icons only) → Off-canvas**.
G3. Off-canvas ka proper open/close/expand/collapse + desktop state se conflict nahi.
G4. State **persist** ho (page change par reset na ho).

**H. Priority order (user ka)**
P1 root causes → P2 shared architecture → P3 apply app-wide → P4 verify (local/self-hosted × desktop/tablet/mobile × roles/scopes × large data × many-option dropdowns × dependent fields × slow/failed API).

---

## 2 ▸ Waves + Tasks (har task = chhota kaam + apna test)

> Legend: `[ ]` pending · `[~]` in progress · `[x]` done · har task ke sath **test** aur **~waqt**.

### W0 — No-hang harness + baseline (pehla, sab se tez) — target **v2.25.8-dev**
- [x] **T0.1 `tools/quick.sh <gate…>`** ✔ — per-gate 150s timeout, sirf summary; timeout ho to `⏱ TIMEOUT` (sandbox hang nahi). *Test (kiya):* `logic` 816/0 (47s) · `labels-live` 30/0 (40s) · **total 87s**. Usage: `bash tools/quick.sh <gate…>` · `QUICK_TMO=240 …`
- [x] **T0.2 API instrumentation** ✔ — `API.call` ab **instrumented wrapper** hai (`API._begin` → `API._call` → `API._end`); record: calls · ok/fail · byAction · **dups** (same action+payload jab pehli chalu ho) · inflight/maxInflight · times (p50/p95/max) · slow list · `API.statsReset()` / `API.statsSummary()` / `window.__apiStats`. **Behaviour bilkul nahi badla** (test: instrumented return === direct mock return). *Test:* `tools/test_api_instrument.js` → **14/0, 3.8s** (dup detect · inflight peak · p50/p95 · slow list · fail path · zero page errors).
- [x] **T0.3 Baseline capture** ✔ — `tools/test_perf_baseline.js` (10 routes, ~16s) → `tmp/perf-baseline.json`. Baseline (demo/mock): dashboard **6 calls** (5 parallel) · pos 2 · items 2 · salesman 3 · baqi 1 · **dups 0** · worst p95 **246ms**. Yani demo fast hai — asli dard live GAS transport + per-call overhead + no-cache pattern hai (audit W1 isi par).

### W1 — ROOT-CAUSE AUDIT (P1) — target **v2.25.8** (evidence ke sath)

**Early findings (static + runtime, 2026-09-24) — ye abhi ke numbers hain:**

| # | Finding | Number |
|---|---|---|
| E1 | **`API.call` par koi dedupe/cache/inflight-guard nahi** — `grep _inflight\|dedupe\|inFlight App_Core.html` = **0** | 0 protections |
| E2 | **438 API.call sites** 36 files mein (sab se zyada: Config 59 · Screens2 56 · Dashboards 33 · Masters 32 · Accounting 32) — shared layer ke baghair har site apna pattern | 438 |
| E3 | **Dashboard khulte hi 6 parallel calls** (reports.dashboard, salesByCategory, notifications.summary, pay.reconcile …) — live GAS par har call ka apna execution context (latency × 6, network par serialized hone ka khatra) | 6 calls |
| E4 | **Navigation har renderNav par `config.menu` dobara fetch** karta hai (cache nahi) | har nav |
| E5 | **Do modal systems** (UI2.modal 100 sites + UI.modal 19 sites) — wahi duplication class jo user ne point ki (shared logic) | 119 sites |
| **E7** | **SIDEBAR (asli bug reproduce ho gaya)**: nav labels `h('span', null, label)` — class ke baghair; CSS sirf `.sb-name` chhupata tha. Nateeja: rail mein text 64px mein clip, aur **`.sidebar:hover{width:256px}`** ki wajah se collapse button dabane ke baad (pointer sidebar par hi rehta hai) sidebar 256px + icon+text hi dikhta tha → bilkul wohi shikayat. **Fix (v2.25.8):** `.sb-txt` class + rail mein `display:none`, **hover-expand hata diya** (tooltip `data-tip` se), mobile (≤900) par collapsed rules **neutralize** (off-canvas hamesha poora), Ctrl+B ab persist karta hai, `dataset.sbMode = expanded\|rail\|offcanvas`. | gate 19/0 · sensitivity: purana behaviour = **4 FAIL** |
| **E8** | **Sequential await waterfalls (asli "1 minute" ka sabab)**: `App_Screens2.html` mein **49 `await API.call`** magar **0 `Promise.all`**; `App_Config.html` 51 await / 1 Promise.all. Live GAS par har call ka apna round-trip (~1–3s) — 10 sequential calls = 10–30s, aur heavy screens par 60s tak. Fix = W2 (parallel + dedupe + cache). | 49 / 0 |
| **E9** | **N+1 pattern**: `App_Accounting.html:448` — `for (const e of pending) { await API.call('expenses.approve', …) }` (har expense ke liye alag call). Isi tarah 11 jagah loop ke andar await. Fix = shared `API.batch()` (W2.T1). | 11 sites |
| **E10** | **Cache coverage adhoori**: 438 call-sites mein sirf **203** par `offlineFallback` (46%) — baqi 54% bina cache/fallback. | 203/438 |
| **E11** | **Duplicate call-sites**: `items.search` 9 jagah · `items.save` 9 · `customers.list` 7 · `warehouse.bins` 6 · `suppliers.list` 6 · `sales.list` 6 · `accounts.list` 6 — shared layer ke baghair har jagah apna pattern. | top: 9 |
| E6 | Demo baseline theek (p95 246ms) → matlab **dawa: asli slowness backend transport (GAS `google.script.run`/JSONP per-call overhead) + N+1 call pattens + zero caching** hai, rendering nahi. W1.3/W1.4 isi ko live backend par confirm karega. | — |
- [ ] **T1.1 API call-site audit** — static: har `API.call(` site, per-screen count, repeated same-key calls → `tools/audit_api_calls.js` + `release/PERF-AUDIT-v2.25.8.html`. **~45 min**
- [ ] **T1.2 Runtime N+1 / duplicate audit** — baseline json se: kaunse route par sab se zyada calls, kaunse duplicate, kaunse sequential (parallel ho sakte). **~30 min**
- [ ] **T1.3 Backend (.gs) audit** — per-request `getValues` batching, CacheService, LockService scope, loops mein API/Sheet calls, `Utilities.sleep`, cold-start heavy work → `tools/audit_gs_perf.js`. **~60 min**
- [ ] **T1.4 Timeout / hang path audit** — `API.call` timeout budget, `google.script.run` failure, "Retry Again" kahan se aata hai; offline fallback behaviour. **Test:** `tools/test_api_timeout.js` (mock slow + fail). **~45 min**
- [x] **T1.5 Sidebar current-state audit** ✔ — `tools/audit_sidebar.js` (5 viewports, computed style + DOM): **bug reproduce hua** → collapse ke baad width 256px + label `display:block` (hover-expand), reload par 64px. Findings + fix E7 mein.
- [ ] **T1.6 Datetime gap audit** — kahan-kahan date print hoti hai, time ghayab; kitni ad-hoc `toLocaleDateString`/slicing sites → list. **~30 min**
- [ ] **T1.7 Visibility gap audit** — sensitive fields ki list × modules; kahan sirf CSS/logic se chhupa hai aur API se data ja raha hai. **~45 min**

**W1 deliverable:** `PERF-AUDIT` report + pehle naape gaye numbers (jaisa user ne kaha: "identify actual root causes before fixing").

### W2 — SHARED CORE: fetch · busy · error/retry · progress (P2) — target **v2.25.9**
- [x] **T2.1 `API.call` upgrade (ek jagah)** ✔ (2026-09-24) — teen shared features ek jagah:
  * **IN-FLIGHT DEDUPE** (reads only): same action+payload jab pehli call chalu ho → doosri network call nahi, dono ko wahi promise. Writes par **kabhi nahi**.
  * **TTL CACHE** + `DEFAULT_TTL` (`config.defs`/`config.menu`/`config.list` 120s, `system.settings.get` 60s, `items.facets`/`warehouse.list` 60–120s) · per-call `{cacheTtl}` / `{noCache:true}` · **har kaamyab write par cache khud saaf** (`API.invalidate(prefix)` manual bhi).
  * **RETRY** (reads only, sirf network/timeout error par, backoff+jitter, default 1 retry; `{retries:n}` / `{retry:false}`) — validation/session error par nahi, writes par kabhi nahi.
  * **`API.parallel(tasks, limit=6)`** — sequential awaits ki jagah ek sath (E8 waterfall ka hathiyar; call-sites W7 mein badlenge).
  * Sab features `API._features` se off ho sakte hain (sensitivity proof ke liye).
  * **Gate `tools/test_api_core.js` 16/0 (6s)** · **sensitivity `SENS=1` → 6 checks FAIL** (dedupe 3 mock calls, cacheHits 0, invalidation 0…).
  * **Asli naap:** 3× `renderNav()` → `config.menu` network calls **cache ON = 1, OFF = 3**; items→reports→items par 1 call cache se bachi.
  * **Correction (E4):** pehle likha tha “har nav par config.menu” — naap kar pata chala ye **har nav par nahi**, sirf `renderNav()` par (boot/branch switch/login) hota hai. Impact chhota tha magar fix phir bhi asli (repeat renderNav cached). — in-flight dedupe (same key+params), short TTL cache + invalidation hooks, exponential backoff + jitter retry (sirf idempotent), timeout budget, abort, offline fallback barqarar. **Test:** `tools/test_api_core.js` (dedupe · cache · invalidate · retry-once · no-retry-on-validation · abort). **~90 min**
- [ ] ### W2.T1b (v2.25.9) — session-safe shared meta + gate hardening ✔ (2026-09-24)

Full-verify #4 (`tmp/verify259.log`) mein 2 gate red hue — dono ka root cause nikala aur
**shared level par** fix hua (page-specific patch nahi):

**1. Asli app bug: null session par crash (`App.state.session.fullName`)**
- Repro: logout/session-expiry ke baad `App.state.session = null`, magar shop quick-dialog
  (khuli cash-session) aur account menu seedha `.fullName` parh rahe the →
  `TypeError: Cannot read properties of null (reading 'fullName')` → poora modal gayab.
  `smoke` gate isi wajah se crash hua (stack: `shopQuickDialog` App_Boot.html:553).
- Fix: **`App.sessionMeta()`** App_Core.html mein (ek hi jagah se safe `name/initial/role/group/userId/token`),
  aur 8 call-sites us par shift: `App_Boot` ×4 (avatar, account menu name/role, close-shop sub, changePassword),
  `App_Dashboards` ×1, `App_POS` ×1, `App_POS2` ×1, `App_Lang` ×1 (token).
  Baaki sab `.session.*` parhne wali jagahon par pehle se guard tha (verify kiya: 0 unguarded baaqi).
- Naya gate **`session-guard`** (`tools/test_session_guard.js`, asli browser, **15/0 · 8.6s**):
  logged-in meta, null-session safe fallbacks, shop quick-dialog (khuli session + null app-session),
  account menu — aur teeno paths par **page-error 0**.
- **Sensitivity:** teen guards wapas puranay seedhe access par rakhe → gate CRASH
  (`shopQuickDialog` TypeError) = purana behaviour pakra jata hai ✔ (guards restore kiye, `check.sh` green).

**2. Test-side flake (dono proven, phir harden)**
- `smoke` boot: fixed **300 ms** wait; jsdom boot ka login screen 280–404 ms leta hai → race.
  2 identical runs = **66 FAIL**. Fix: `waitFor(fn, ms)` poll helper (boot + orders + takeorder sections)
  aur `.mo-search` null par graceful fail (poora gate crash nahi hota). Ab **332/0 (129s)**.
- `audit_tabs`: (a) boot bhi fixed 400 ms par tha → poll kiya; (b) `ALLOWED` mein `skel`/`skel-wrap` add
  (skeleton bars ko "blank block" gina ja raha tha jab data >200 ms le). Ab **656/0**.

**3. Test-harness ka shared ilaaj: `tools/_harness.js` (login race poori suite se khatam)**
- Full-verify #5 (`tmp/verify259b.log`, 59/1) mein ek aur gate isi race se gira: `align`
  (fixed 400 ms ke baad seedha `#lgUser.value` → "Cannot set properties of null").
- Audit: **12 gates** fixed-sleep ke baad login kar rahe the (2 jsdom: `align`, `punchlist`,
  aur puppeteer: `layout`, `settings-ui`, `ui-polish`, `demand`, `grn-drawer`, `salesman-stock`,
  `labels-live`, `auth-startup`, `shots`, `shots_v2250`).
- Fix (ek hi jagah): naya **`tools/_harness.js`** — `waitForPage/waitForDom` poll + `login(page)` /
  `loginDom(doc,win)` (login form ka poll → credentials → shell visible ka wait). Sab 12 gates
  isi shared helper par shift (page-specific fixed sleeps hata diye). `smoke`/`tabs` ke inline polls
  bhi `waitForDom` par shift.
- Standalone re-check: `align` 35/0 · `punchlist` ✓ · `settings-ui` 16/0 · `auth-startup` 21/0 ·
  `demand` 13/0 · `grn-drawer` 23/0 · `salesman-stock` 10/0 · `labels-live` 30/0 · `ui-polish` 63/0 · `layout` exit=0.

**4. Load par ek aur flake: `modals-close` + `scan-parity` (run #6, 57/3)**
- `modals-close` standalone **91/0 (24s)**, magar full run mein 5 checks gire (167s = 3x slow):
  stacked-modals scenario Esc ke baad **fixed `sleep(700)`** par assert kar raha tha. Fix:
  `waitStack(pred, 4000)` poll (setup + har Esc ke liye) — assertion wahi rahi, sirf intezar theek hua.
- `scan-parity` standalone **29/0 (30s)**, full run mein 5 GRN/PO scan checks gire (63s) —
  diag ne dikhaya: `got="" act=INPUT.f-input ipk-scan-in focusOK=true`, 5/5 attempts. Matlab app
  load mein scan row **re-render** kar deti hai, `handle.type()` ka captured handle detach ho jata tha
  aur characters khali input par girte thay. Fix: `page.keyboard.type()` + **focused element ka poll**
  (`value === code && activeElement .ipk-scan-in`), phir Enter. Ab 29/0 ×2.

**5. Regression-proof: `tools/check_harness_lint.js` (gate `check` ka hissa)**
- RULE 1: jo tool `.value = 'owner'` set karta hai usay `require('./_harness')` karna hoga.
- RULE 2: jo `#lgUser` / `.login-box input` chhota hai usay ya harness, ya `page.type()`/`waitForFunction()`.
- Aaj: **71 tools checked, 0 violations** — yehi race (fixed sleep → login) dobara nahi aa sakti.

**Is round ka tally:** `api-core` 16/0 · `session-guard` 15/0 · `tabs` 656/0 · `smoke` 332/0 · `ui-polish` 63/0 ·
`e2e` 55/0 · `logic` 816/0 · `modals-close` ✔ · `sidebar-states` 19/0 → gates **59 → 60**.

### W2.T2 (v2.25.10) — action-level busy / duplicate-submit / progress ✔ (2026-09-24)

**Audit pehle (jo mila):** (a) busy-ness sirf global patli top bar thi (`UI.busy`) — action-specific nahi;
(b) har page ka apna hack: PO save `'Saving…'`, POS pay `'⏳ Processing…'`, Settings `'Saving…'`, AI `'Saving…'`/`'Testing…'`;
(c) **bhaari writes par koi busy state hi nahi thi** — GRN post (Post GRN F9), customers/suppliers/users save
→ duplicate tap = **double GRN / double stock** (aap ki "button hang / dobara dabana" shikayat ki jarh).

**Fix (shared, ek jagah): `UI.run(el, fn, opts)`** — App_Core.html
- sirf usi button par spinner + label swap (`Save PO` → `Saving PO…`) + `disabled` + `aria-busy` (**app-wide overlay nahi**);
- **duplicate-submit block** — chalti hui call par naya tap naya call nahi karta (wahi promise), `runStats().blocked`;
- **long-op progress** — `GRN post ho raha hai · 4s` (20s+ par `(chal raha hai…)`);
- **success/error** — ✓ (+ `okLabel` → `✓Posted`/`✓Saved`) / ✖, phir button asli label par;
- min-busy **320ms** · safety timeout **120s** (jawab na aaye → button wapas usable + toast) · sync action (Cancel) par koi busy UI nahi;
- kill-switch `UI._features.run = false`; stats `UI.runStats()`.

**Khud-ba-khud wiring:** `UI.modal` · `UI.drawer` · `UI2.modal` · `UI2.offcanvas` ke har action button par (yani GRN drawer,
PO/SO, customers/suppliers/users, bulk-add, invoice dialogs, settings modals — sab cover) — 4 central patches, koi call-site change nahi.

**PWA bundle ka apna `PWA.run`** (`Pwa_Shell.html`) — POS "Complete" isi par: spinner + elapsed + duplicate-tap block
(**double sale se bachao**) + ✓/✖. `PWA.runStats()` + `PWA._features.run`.

**Purane hacks hata diye:** PO save manual → `busyLabel`/`okLabel` · Settings save → `UI.run(saveBtn, …)` ·
AI save/test → `UI.run(btn, …)` · POS pay manual → `PWA.run` · GRN post → `busyLabel: 'GRN post ho raha hai'` (pehle kuch bhi nahi tha).

**Gate `ui-run`** (`tools/test_ui_run.js`, jsdom, **34/0 · ~12s**): busy sirf usi button par · 3 tap = 1 call (`blocked=2`) ·
elapsed · ✓/✖ + `okLabel` + asli label wapas · error ke baad dobara usable · sync action par busy UI nahi ·
timeout safety (`stale≥1`) · **rendered**: UI.modal/drawer/UI2.modal action buttons khud UI.run par + duplicate block ·
PWA bundle mein `PWA.run` (purana `⏳ Processing…` gayab) · zero page errors.
**Sensitivity:** `SENS=1` → **17 FAIL** (purana behaviour pakra jata hai).

**Is round ka regression (sab green):** `ui-run` 34/0 · `modals-close` 91/0 · `grn-drawer` 23/0 · `scan-parity` 29/0 ·
`pay-ledger` 48/0 (+G stale-node) · `pwa-overlays` 124/0 · `settings-ui` 16/0 · `ai-ui` 55/0 · `ui-polish` 63/0 · `smoke` 332/0 ·
`tabs` 656/0 · `e2e` 55/0 · `logic` 816/0 · gates **60 → 61**.

**Infra (is round pakra, dobara nahi hoga):** workspace snapshot symlinks preserve nahi karta → Chrome libs ke
SONAME links gayab (`libatk-1.0.so.0`) aur har browser gate "Failed to launch the browser process" se gir raha tha.
`tools/fix_chrome_libs.py` (idempotent repair) + `verify.sh` har run se pehle chalata hai (`ldd chrome` not-found = 0).

**T2.2 `UI.run(el, fn)` / `UI.busy(el)`** — action-specific: 50ms ke andar button par spinner + `aria-busy`, disable + duplicate click block, success(✓)/error(!) transient state, `finally` par restore. **Test:** `tools/test_busy_state.js` (double-click = 1 call · sibling button untouched). **~60 min**
- [ ] **T2.3 Error/retry policy** — `UI.errBox(err, retryFn)`; "Retry" sirf retryable + idempotent par; toast dedupe; error text insani zaban mein. **Test:** `tools/test_error_retry.js`. **~45 min**
- [ ] **T2.4 Long-op progress** — `UI.progress()` (chunked + yield): label 240 copies, CSV import, bulk stock. **Test:** `tools/test_progress.js` (main thread block < 100ms). **~60 min**

### W3 — DYNAMIC / DATA-AWARE DEPENDENCIES (P2+P3) — target **v2.26.0**
- [ ] **T3.1 `UI.bindDeps(cfg)` engine** — declarative parent→loader→(options, fields, sections, validation); per-key cache; **stale-response guard** (latest wins). **Test:** `tools/test_binddeps.js`. **~90 min**
- [ ] **T3.2 `UI.section(cond)` + `UI.autoHideEmpty()`** — conditional blocks; khali container auto-hide (blank card nahi). **Test:** `tools/test_conditional_ui.js`. **~45 min**
- [ ] **T3.3 Geo chain apply** — Country → State → City → Postal (customers, suppliers, business settings, warehouses). **Test:** `tools/test_geo_chain.js`. **~60 min**
- [ ] **T3.4 AI provider deps apply** — Gemini/OpenAI/Anthropic/other: relevant fields, model options, validation; baqi hide; per-provider values preserve. **Test:** `tools/test_ai_provider_deps.js`. **~60 min**
- [ ] **T3.5 Data-change reactivity sweep** — jo tables/sections store change par update nahi hote unhe `Store.sub` par wire karna. **Test:** `tools/test_data_aware_sweep.js`. **~60 min**

### W4 — DATE & TIME SYSTEM (P2+P3) — target **v2.26.0**
- [ ] **T4.1 `fmt.dt()` + `DateTime.cfg`** — modes (date/time/datetime/full), 12h/24h, seconds, timezone (Asia/Karachi default), custom format, global on/off. **Test:** `tools/test_datetime_fmt.js` (pure node, <5s). **~45 min**
- [ ] **T4.2 Record stamps** — `createdAt`/`updatedAt` (full timestamp) har write path (.gs + demo mock) + display. **Test:** `tools/test_timestamps.js` (6 modules: create/update/monotonic). **~60 min**
- [ ] **T4.3 Settings UI** — "Date & time" section: sab options + **live preview** + global on/off. **Test:** `tools/test_datetime_settings.js`. **~45 min**
- [ ] **T4.4 App-wide apply** — ad-hoc date prints ko `fmt.dt` par laana. **Test:** `tools/audit_datetime_usage.js` (fmt ke bahar 0 direct `toLocaleDateString`). **~60 min**

### W5 — VISIBILITY + ROLE/SCOPE (P2+P3+security) — target **v2.26.1**
- [ ] **T5.1 `Vis` engine** — `role → module → section → field` + scope (`branch/warehouse`); `Vis.can()`, `Vis.apply(root)`. **Test:** `tools/test_vis_engine.js`. **~90 min**
- [ ] **T5.2 Sensitive registry** — cost price, margin/profit, customer contact/data, supplier info, internal notes, financials → modules map. **Test:** `tools/test_vis_registry.js` (coverage: har sensitive field ka rule). **~45 min**
- [ ] **T5.3 BACKEND enforcement** — .gs response shaping by role/scope (fields strip) + demo mock mirror. **Test:** `tools/test_vis_backend.js` — **payload-level assertion** (cashier ka response mein `costPrice`/`margin`/customer phone **na ho**). **~90 min**
- [ ] **T5.4 Scope-based data** — branch/warehouse filter (sales, stock, customers lists). **Test:** `tools/test_vis_scope.js`. **~60 min**
- [ ] **T5.5 Settings UI + role matrix** screen (kaun kya dekhta hai, live). **~60 min**

### W6 — SIDEBAR STATE MACHINE (user ki repeat-shikayat) — target **v2.26.1**
- [x] **T6.1 State model + persistence** ✔ — `applySb()` ek hi jagah (breakpoint + pref → class + `dataset.sbMode` + aria); pref `ha.sbCollapsed`; `matchMedia('(min-width:901px)')` change → re-apply + off-canvas band; `window.__haSetCollapsed` (Ctrl+B bhi isi se — ab SAVE hota hai). **Gate `tools/test_sidebar_states.js` 19/0.** — desktop `expanded | rail`, mobile `off-canvas open|closed`; `Store.sidebar.mode`, breakpoint memory, navigation par reset nahi. **Test:** `tools/test_sidebar_states.js`: expanded = icon+text; **rail = icons only — label `visibility/display` hidden + width ≤ 72px**; toggle cycle; reload/route change par persist; 390 → off-canvas closed; open/close/scrim/Esc; resize par conflict nahi. **~90 min**
- [x] **T6.2 Rail polish** ✔ — rail: `.sb-logo` 34px + vertical brand (64px fit), collapse button 24px; nav par CSS tooltip (`data-tip` ::after), `title`/`data-tip` barqarar (gate mein a11y check).
- [~] **T6.3 Responsive matrix** (partial) — `layout-desktop` · `layout-mobile` · `layout-dark` · `modals-close` green; 1440/1280/1024/768/390 sidebar checks gate mein. Baqi W8. — 1440/1280/1024/768/390 light+dark, 0 layout problems. **Test:** `bash tools/verify.sh layout` (+ sidebar checks T6.1). **~45 min**
- [x] **T6.4 Off-canvas controls** ✔ — hamburger (`#sbToggle`) open · scrim · **Esc** band; desktop rail pref drawer ko shrink nahi karta (req 14); wapas desktop par pref barqarar. Gate mein 5 checks.

### W7 — APPLY SHARED SYSTEMS APP-WIDE (P3) — target **v2.26.2**
- [ ] **T7.1 Busy coverage** — POS/GRN/PO/SO/settings ke har fetch-button par `UI.run`. **Test:** `tools/audit_busy_coverage.js` (0 raw async onclick). **~60 min**
- [ ] **T7.2 Table states** — shared table: skeleton rows (fetch), empty-state, store-change re-render. **Test:** `tools/test_table_states.js`. **~60 min**
- [ ] **T7.3 Forms** — shared validation + deps customer/supplier/product/PO/GRN forms par (16px inputs / 48px taps barqarar). **Test:** `tools/test_forms_shared.js` + `smoke`/`ui-polish`. **~90 min**
- [ ] **T7.4 Settings consume shared** — datetime + visibility + deps; `settings-defs` gate update. **~60 min**

### W8 — VERIFY (P4) + RELEASE — target **v2.26.2**
- [ ] **T8.1 Local** — har wave par `--fast` (~39s) + mutalliqua gate; full 56-gate **sirf tag par** (background, no edits).
- [ ] **T8.2 Self-hosted/static** — `build_demo.py` + `test_static` + `check_pwa`.
- [ ] **T8.3 Roles × scopes matrix** — owner/manager/cashier × 2 branches: vis tests dobara.
- [ ] **T8.4 Slow/failed API simulation** — latency injection + offline: busy dikhe, retry sirf jab wajib, UI "frozen" na lage. **Test:** `tools/test_slow_network.js`.
- [ ] **T8.5 Large datasets** — 2k products / 1k customers / 500 sale rows: render timings (aur zaroorat par virtualization). **Test:** `tools/test_scale.js` extend.
- [ ] **T8.6 Docs + package** — CHANGELOG + checklist + evidence + shots + zip + archive (purana zip pehle `release/archive/`).

---

## 2b ▸ Requirements traceability (aap ka spec → yahan ka task)

| Aap ka req | # | Task(s) |
|---|---|---|
| Performance + request lifecycle audit | 1, 16-P1 | **W0.T2/T3 ✔ · W1.1–W1.4** |
| Action-specific loading/progress/duplicate-block | 1 | **W2.T1–T4** · apply W7.1 |
| Global reusable shared logic | 2, 6, 16-P2/P3 | W2 (fetch/busy/error) · W3 (deps) · W7 (apply) |
| Data-aware fields/rows/forms/tables | 3 | **W3.T1–T5** |
| Dynamic sections / conditional UI | 4 | W3.T2 |
| Dropdown/provider config (Gemini/OpenAI…) | 5 | W3.T4 |
| Global date & timestamp system | 7 | **W4.T1–T2** |
| Configurable date/time display + global on/off | 8 | W4.T3 (+ T4.1 cfg) |
| Field/data visibility controls | 9 | **W5.T1–T2, T5.5** |
| Role + scope visibility | 10 | W5.T1, W5.4 |
| Visibility backend/API level (sirf CSS nahi) | 11 | **W5.T3 (payload-level proof)** |
| Sidebar collapse/expand fix | 12, 16-P9 | **W6.T1, T6.2** |
| Sidebar responsive (desktop/laptop/tablet/small) | 13 | W6.T3 |
| Off-canvas show/hide | 14, 16-P10 | W6.T4 |
| Sidebar state persistence | 15 | W6.T1 |
| Priority 4 verify (local/self-hosted/roles/large data/slow API) | 16-P4 | **W8.T1–T5** |

## 3 ▸ Version roadmap (chhote chunks — koi bara big-bang nahi)

| Version | Waves | Kya milega |
|---|---|---|
| **v2.25.8** | W0 + W1 | Instrumentation + **audit report** (root causes, numbers, gaps list) — koi behaviour change nahi |
| **v2.25.9** | W2 | Shared fetch/busy/error/progress core + POS/GRN par apply |
| **v2.26.0** | W3 + W4 | Dynamic deps engine + geo chain + AI provider + **timestamp system** |
| **v2.25.8** | W0 + W6 | Harness + instrumentation + baseline + **Sidebar rail/off-canvas/persistence** (user ki repeat-shikayat) | 
| **v2.26.1** | W5 (+ W6.T3) | Visibility engine (+ **backend enforcement**) + responsive matrix |
| **v2.26.2** | W7 + W8 | App-wide apply + verify matrix + release |

---

## 4 ▸ Definition of Done (har task)

1. **Test pehle likha** (ya sath) — chhota, akela chalne wala, ≤ 90s.
2. **Sensitivity proof** — jahan mumkin ho: purana behaviour wapas kar ke test **FAIL** hota dikhaya jaye.
3. **Shared jagah fix** — page-specific patch nahi.
4. **Existing features preserve** — koi feature nahi hatega; gate counts kam nahi honge.
5. **Bade assertion ke sath** — sirf DOM class nahi; **computed style / payload / timing** par assert (user ke qawaid).
6. **Docs** — CHANGELOG/checklist/evidence update.
7. **Full 56-gate verify** sirf version tag par (background).

---

## 4b ▸ W1 ke liye ready commands

```bash
# aaj ke naye gates (chhote, tez)
bash tools/quick.sh api-instrument sm<?>      # (khali; asli:)
bash tools/quick.sh api-instrument
bash tools/quick.sh smoke e2e logic           # regression
LD_LIBRARY_PATH=... node tools/test_perf_baseline.js   # baseline dobara
API.statsSummary()                            # browser console mein live naap
```

## 5 ▸ Abhi ka status

**v2.25.8 SHIPPED** · **ALL 58 GATES GREEN (1183s, EXIT=0)** · log `tmp/verify258c.log` · zip `release/haseeb-autos-v2.25.8.zip` (5,673,267 B · 255 files) · shots `release/shots-v2.25.8/` · archive v2.25.2–v2.25.7.

- **v2.25.7** ship ho chuki (labels raster-proof + printable floor) — `release/haseeb-autos-v2.25.7.zip`.
- **W0 poora mukammal** (T0.1/T0.2/T0.3 ✔) — harness + instrumentation + baseline tayyar.
- **W1 (root-cause audit) shuru hone ko tayyar** — early findings E1–E6 upar darj hain (438 call sites · 0 dedupe/cache · dashboard 6 calls · nav par menu re-fetch · 2 modal systems).
- **Pending:** v2.25.8 ke saath **57-gate full verify** (ek hi foreground bash call, ~19 min) + CHANGELOG/checklist/evidence + zip.

---

## 🚀 v2.25.11 SHIPPED (2026-09-24) — W2.T3 shared error / retry policy

| Cheez | Value |
|---|---|
| Zip | `release/haseeb-autos-v2.25.11.zip` — **5,744,165 B / 262 files** |
| Verify | `tmp/verify2511c.log` — **62 gates, ALL GATES GREEN ✔ (1195s ≈ 20 min)** |
| Naya gate | **`ui-err` 30/0** (~6s) · `SENS=1` → **5 FAIL** |
| Shots | `release/shots-v2.25.11/` (9 rendered PNGs, page errors []) |
| Docs | `release/CHANGELOG-v2.25.11.md` · `REQUIREMENTS-CHECKLIST-v2.25.11.md` (15,990 B) · `AUDIT-EVIDENCE-v2.25.11.html` (814,636 B) |
| Archive | v2.25.10 zip → `release/archive/` (+ README entry, 5,714,253 B) |

**W2.T3 mein:** `UI.errKind` (7 kinds + retryable) · `UI.errText` (raw codes aur "then retry/please retry" wali
stale guidance hata deta hai) · `UI.errBox` (action ke paas thaira hua inline box + technical tafseel) ·
`UI.fail` · `UI.toast(...,'err')` classified (**150+ call-sites bina chhue** behtar) + toast par asli Retry button ·
**retry sirf jaiz errors par** (validation/auth par button nahi) · write errors par "pehle refresh karein" warning + ⟳ refresh
(GRN/PO/settings/AI/**POS sale**) · `UI.run` error path khud inline box dikhata hai + wahi kaam dobara chalane wala Retry ·
**unhandled rejection bug fix** (modal/drawer/offcanvas action, errBox retry, toast action) · PWA bundle mein wahi contract.

**Is round ke 3 full runs ka sabaq:** (1) `icons` gira — PWA mein escape-sequence emoji (`\u{1F4F6}`) literal ki jagah likhe the
(sab literal emoji kar diye, FE0F se bachao bhi verify kiya); (2) `scan-parity` gira — scan typing load mein flake
(focus sahi, value khali, `insertText` bhi land nahi hota) → ab **deterministic** value+events+Enter; (3) **62/0 green**.

### ▶ NEXT (isse shuru karein)

1. **W7 — shared core ke call-sites (agla bara kaam):** `App_Screens2` (49 await / **0** Promise.all) aur
   `App_Accounting.html:448` (N+1 `expenses.approve`) ko `API.parallel`/batch par shift + 11 loop sites.
   Gate: chhota standalone test + `perf-baseline.json` ke repeat-action numbers.
2. **W3 — dynamic data-aware UI:** Country→State→City→Postal, AI provider dropdown (Gemini/OpenAI/Anthropic
   → sirf relevant fields, values preserve), data ho to section dikhe / khaali ho to chhupe. Gate: `tools/test_dyn_deps.js`.
3. **W4 — date/time system:** created/updated date+time, full timestamps ("Created: 23 Sep 2026, 10:42:31"),
   configurable (date/time/both/full, 12h/24h, seconds, timezone, format, visibility, global on/off).
4. **W5 — visibility (backend-enforced, CSS-only nahi):** Role→Module→Section→Field + Scope→Branch/Warehouse/Org;
   sensitive fields (cost price, margins, customer contact, supplier info, internal notes, financials).
5. **W6 — sidebar polish** (desktop expanded / icon-only partial / tablet / off-canvas; state persist).
6. **User-side carry-over:** Zx10 drill · physical label read-back (25×15 + dpi) · live GAS+Drive upload ·
   deployed F2 · mobile POS cart→Pay→Esc.
7. App_Core ke Barcode/Print duplicate block ka load-order resolve (agli labels change se pehle).
