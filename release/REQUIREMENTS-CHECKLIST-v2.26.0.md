# Requirement Checklist — v2.26.0 (6-point spec + shared fetch core + W7 performance)

**Date:** 2026-09-24 · **Version:** 2.26.0 · **Full suite:** `env -u HOME bash tools/verify.sh` → **63 GATES · ALL GATES GREEN ✔ (1227s ≈ 20 min)** (log `tmp/verify260c.log`) · is build ka naya gate: `perf-batch` (34/0) · pehle se: `api-core` (16/0) · `session-guard` (15/0) · `api-instrument` (14/0) · `sidebar-states` (19/0) · `ui-run` (34/0) · `ui-err` (30/0)
**Rendered evidence:** `release/shots-v2.26.0/` (9 PNGs — GRN top/items, GRN bulk add, Salesman KPIs, Stock Issue modal, Demands list, Demand form, Label designer, shared scan dialog)

Legend: **✅ Fully implemented** · **🟡 Implemented (by design, note)** · **⬜ User-side check (device/deployed backend)**

---

## 1. PO & GRN Barcode/QR Scanning — ✅ Fully implemented

| Requirement | Status | Evidence |
|---|---|---|
| Old PO/GRN scanning replaced by the **same system as POS** | ✅ | `UI2.itemPicker` + `UI2.bulkAddModal` — POS, PO form, GRN drawer: ek hi component (page-specific copies khatam) |
| Same UX / scanning behaviour | ✅ | scan → line add, field foran khali, Enter + Enter-less HID auto-fire, duplicate scan = qty bump, stock cap |
| Bulk scanning | ✅ | dedicated Bulk Add modal: search + checkbox list + apna continuous-scan input + bulk list (qty ± / remove / clear) + Add All |
| Select modal | ✅ | shared multi-select list (40 rows in GRN gate), 📋 full list button har picker par |
| Fully integrated with POS | ✅ | `scan-coverage` 21/0 (sab scan surfaces), `pos-multi` 23/0, `grn-drawer` 23/0 |
| **Proof: PO/GRN = bilkul wahi POS system (v2.25.2 naya gate)** | ✅ | `scan-parity` **29/0** — teenon pickers (POS/PO/GRN) ka **DOM byte-for-byte ek hi** (.ipk ke bachche identical), scan → Found → Added → **field CLEAR** → ready, duplicate scan = **qty bump**, dusra code purane ko append nahi karta, ghalat code = warn + clear + koi line nahi, dropdown hijack nahi, koi file dialog nahi, aur PO/GRN file mein koi native dialog / purana bespoke scan widget nahi |

## 2. GRN Modal & Workflow — ✅ Fully implemented

| Requirement | Status | Evidence |
|---|---|---|
| Complete redesign, width increased | ✅ | `min(1100px, 96vw)` drawer; gate reads **1100px** |
| Fields/sections restructured & aligned | ✅ | 4 sections: 🏢 Supplier & invoice · 📄 Purchase order (optional) · 📦 Items · 🧾 Charges & costing |
| Premium ERP/POS hierarchy & spacing | ✅ | sections ke andar sub-cards, grid 8-col (PO) / 5-col (direct), supplier balance card, live summary bar |
| Responsive | ✅ | @390 header lapata, har cell apna label, 0 problems (overlay audit 390) |
| Entire GRN workflow reviewed | ✅ | PO load → supplier auto + banner + **title live** ("— PO PO-SDQ-01001"), per-line Receive all (F4), F2 scan, F9 post, qty-0 / 0-line / credit-bina-supplier validation |
| Messy/redundant interactions removed | ✅ | ek hi keydown listener (pehle duplicate), fill button always-rendered, "Clear PO"/PO switch par asli confirm (Cancel waqai rokta hai) |
| Cancel/Close kaam karta hai | ✅ | `grn-drawer` gate: Cancel par lines+banner+PO bilkul waise hi |

**Note:** mobile par 8-column grid 2-column stack ho jata hai (by design, readability).

## 3. Customer Demands — ✅ Fully implemented

| Requirement | Status | Evidence |
|---|---|---|
| Old partially implemented modal removed/replaced | ✅ | naya `demandForm` (4 sections) + naya detail modal (linked POs + status history) |
| Logic / workflow reviewed | ✅ | status flow (OPEN→ORDERED→SOURCED→ARRIVED→FULFILLED/CANCELLED), walk-in auto-create, vendor suggest, PO suggest, monitor/dashboard, reports |
| Professional structured UI | ✅ | list + 6 KPIs + live search; form Customer → Product → Demand details → Advanced |
| Incomplete behaviour fixed | ✅ | server-side duplicate guard (`Ye demand pehle se open hai (DM-SDQ-01001)…`), empty-save validation, data-aware notes (customer balance/credit/open demands, product stock+price) |
| F-keys consistent | ✅ | F9 = Save demand |
| Demo mein feature zinda | ✅ | `demo/mock.js` mein poora `demand.*` backend + real-id seeds |
| Gate | ✅ | `demands` 13/0 (list 5→6, search 5→2, detail, form, dup block, F9 save, **status workflow**, **walk-in customer + product pick**, 0 errors) |

## 4. Salesman Stock — ✅ Fully implemented

| Requirement | Status | Evidence |
|---|---|---|
| Full audit (UI/UX, workflow, layout, usability, features) | ✅ | 8 tabs reviewed; Issue → Sale → Collection → Return → Ledger → Rating flow line |
| Layout/issues fixed | ✅ | health KPI row (Items / Qty / Value / **Out of stock** / **Low (<5)**, click = filter); filter + search merged; filter-miss ka sahi message (pehle har khaali list "stock issue nahi hua" kehti thi) |
| Same design system & interaction patterns | ✅ | POS jaisa scan-aware search; Stock Issue modal 2 sections + shared scan picker + F2/F9 + qty-0 block + Cancel ghost |
| Gate | ✅ | `salesman-stock` 10/0 (8-tab sweep: rows ya saaf empty-state, koi blank tab nahi) · overlay audit 0 problems @1440 + @390 |

## 5. Barcode/QR Label Designer & Templates — ✅ Fully implemented

| Requirement | Status | Evidence |
|---|---|---|
| Generation + templates fixed | ✅ | `.lqr img{width:100%}` (QR poore label tak phail jata tha) aur `.lbc svg{width:100%}` (computed module width override) — dono root causes hataye |
| Nothing overflows outside the label/frame | ✅ | 6 presets × real render: **0 outside, 0 clipped** (`scrollHeight == clientHeight`); QR+bars ek row mein; content budget + font compression |
| Spacing / sizing / alignment / typography | ✅ | GS1 quiet zones (real), bar module width ~0.85–2.4px, human-readable line hamesha, price/sale-price hierarchy |
| TRUE live preview (no refresh) | ✅ | har control change par foran re-render (designer gate: title/footer/terms/font/show-title sab live) |
| Generated output = designer preview | ✅ | print bilkul wahi `LABEL_CSS` + config use karta hai — gate: same CSS, same font scale (1.5), same 18px name, same 76 bars, human-readable true, direct 50×30 render 0 outside/0 clipped |
| Gate | ✅ | `labels-live` **27/0** — 6 presets frame-fit + **A4 sheet (24 labels)** + **A5 sheet (12 labels)**: 0 overflow / 0 clip / 0 overlap, sahi `@page` CSS + barcode-bina item aur bohat lamba naam (dono 0 overflow) + **v2.25.7: 300dpi/203dpi raster decode (ZXing), printable floor ≥ 0.19mm, QR decode, stacked layout, printability warning wiring** |

**Note:** bahut chhote label (e.g. 50×25 `price_focus`) par font scale thoda compress hota hai — yeh **jaan-boojh kar** hai taake kuch bhi frame se bahar na jaye.

## 6. Global Consistency & Quality — ✅ Fully implemented

| Requirement | Status | Evidence |
|---|---|---|
| One cohesive design system | ✅ | shared dialogs: `UI2.confirm` (promise-aware) · `UI2.askCode` (scan/code) · `UI2.copyText` (link copy) |
| Native dialogs removed | ✅ | app mein **koi native `confirm()`/`prompt()`/`alert()` nahi** — POS/POS2 clearCart, Salesman disableRoute, Demands, 4 scan fallbacks, PWA hub copy link |
| Cancel/close reliability (user ki purani shikayat) | ✅ | awaited guards waqai block karte hain: gate `Clear PO → Cancel = kuch nahi badalta`, `Cancel = false`; Esc/scrim bhi promise resolve karte hain |
| **Popup ka ✕ / Esc / Cancel — repo-wide proof (gate 55)** | ✅ | `modals-close` **91 PASS / 0 FAIL** — har overlay par teen closer alag alag: ✕, `Escape`, footer `Cancel/Close` (generic UI2.modal, legacy UI.modal, offcanvas, POS bulk-add, Alerts, Label print, Item new form, GRN overlay, New PO, New Item, Demand, Adjustment, Transfer, New Stock Issue) + scrim click (soft) + zero page errors · **v2.25.6 naye:** legacy `UI.modal` ke upar `UI2.modal`, `UI.drawer` ke upar `UI2.modal` (ek Esc = sirf top-most), aur **stale registry entry** (bina close hataya scrim) Esc ko block nahi karti |
| **Mobile PWA overlays — wahi contract (gate naya, v2.25.3+)** | ✅ | `pwa-overlays` **124 PASS / 0 FAIL** — chaaron PWAs (pwa-pos/sm/fo/wh, 390×844) par har overlay **asli trigger** se kholta hai aur har closer alag test hota hai: ✕ · Esc · Cancel · backdrop. POS: scan → Bulk Add (long-press) · Cart drawer · Pay sheet · Receipt layer (asli scan→pay→✓ Complete flow). Fix shared `Pwa_Shell`: camera overlay + scan-fallback modal ab Esc/backdrop se bhi band (pehle sirf ✕ button tha). **Stacking rule (v2.25.4):** cart drawer ke andar se “💳 Pay” kholne par cart + pay dono open hoti hain — ab **ek Esc sirf top-most (pay) band karta hai** aur cart khula rehta hai, doosra Esc cart band karta hai; pay ka footer Cancel bhi sirf apni layer band karta hai (pehle ek Esc dono gira deta tha — poora cart gayab ho jata tha) |
| **POS payment ledgers (naya gate 56, v2.25.5)** | ✅ | `pay-ledger` **24 PASS / 0 FAIL** — pay modal ka ledger math (Total/Paid/Due/Change), **Exact** chip, overpay = Change, customer ACCOUNT SUMMARY ka **identity** (Closing = Previous + invoice − paid, customer bar se cross-check), **recorded sale** (total/paid/change/due/status/paymentList), blocked adhoora-cash, udhaar CREDIT → PARTIAL + due, aur **poore sales ledger par invariants**; PWA POS pay sheet ka wahi ledger (summary + Exact + blocked). Isi gate ne demo seed ka ek data-bug pakra: zero-value bill par status **DUE** chip — ab status numbers se derive hota hai |
| **Shared error / retry policy (v2.25.11 · W2.T3)** | ✅ | `UI.errKind/errText/errBox/fail/errStats` — 7 kinds (offline/network/auth/validation/conflict/server/unknown) + **retry sirf jaiz errors par** (validation/auth par button NAHI). `UI.toast(...,'err')` khud classified → **150+ purane call-sites bina chhue** behtar; toast par asli Retry button. Write errors par "pehle refresh karein" warning + ⟳ refresh (GRN/PO/settings/AI/**POS sale**). `UI.run` ka error path khud inline box dikhata hai + wahi kaam dobara chalane wala Retry. Gate **`ui-err` 30/0**; sensitivity (features off) **5 FAIL**. |
| **Action-level busy + duplicate-submit block (v2.25.10 · W2.T2)** | ✅ | Shared **`UI.run(el, fn)`** (App_Core) — sirf usi button par spinner + label swap, **duplicate tap block** (3 tap = 1 call), long-op elapsed seconds, ✓/✖ flash + `okLabel` (✓Posted), min-busy 320ms, **safety timeout 120s** (jawab na aaye to button wapas usable). `UI.modal` / `UI.drawer` / `UI2.modal` / `UI2.offcanvas` ke **har action button par khud-ba-khud**; purane per-page hacks (PO save `Saving…`, Settings `Saving…`, AI `Saving…`/`Testing…`) hata diye. **PWA bundle** mein `PWA.run` (POS pay — double sale block). Gate **`ui-run` 34/0**; sensitivity (features off) **17 FAIL**. |
| **Shared fetch core (v2.25.9 · req 1, 2)** | ✅ | `API.call` mein ek jagah: **in-flight dedupe** (sirf reads) · **TTL cache + har write par invalidation** · **retry** (sirf network errors, sirf reads) · **`API.parallel()`** (waterfall ka hathiyar). Naapa: 3× `renderNav()` par `config.menu` network calls **3 → 1**; 3 identical parallel reads **3 → 1** mock call. Gate `api-core` **16/0**; sensitivity (features off) **6 FAIL**. |
| **Null-session crash fix (v2.25.9 robustness)** | ✅ | Logout/session-expiry ke baad `App.state.session = null` par shop quick-dialog + account menu crash ho rahe the (`TypeError ... fullName`). Ab shared **`App.sessionMeta()`** (App_Core) — 8 call-sites shift; naya gate `session-guard` **15/0**, sensitivity: guards hatane par gate CRASH = pakra jata hai. |
| **Sidebar partial-collapse (v2.25.8 · req 12–15)** | ✅ | Asli bug reproduce + fix: nav labels bina class the (rail mein clip), aur `.sidebar:hover{width:256px}` ki wajah se collapse ke baad **icon+text 256px** hi dikhta tha. Ab **rail = SIRF icons (64px)**, hover par bhi (naam tooltip `data-tip` se), label `display:none` + rects 0; state model ek jagah (`dataset.sbMode = expanded/rail/offcanvas`), preference `ha.sbCollapsed` persist (reload/route change par barqarar), **Ctrl+B** bhi save karta hai, mobile (<=900) drawer hamesha poore labels ke sath, scrim/Esc se band. Gate `sidebar-states` **19/0**; sensitivity: purana behaviour = 4 FAIL |
| **Label = ASLI scan hota hai (v2.25.7)** | ✅ | Do asli print bugs fix: (a) 50×30 label + QR + 13-digit code par module width **0.066mm** thi (spec 0.19mm) — chhapne par bars mil jate thay (300dpi raster test: sirf **13 bars**, ZXing decode **FAIL**); ab **printable floor 0.19mm** + QR apni row + spec quiet zone → **75 bars, decode ✔**. (b) **203dpi** printer par long codes (13-digit / 18-char) decode hi nahi hote thay; ab ✔. Purana **double quiet-zone** bug bhi gaya (bars be-wajah 20% patle thay). Jo label waqai fit na ho us par `data-lw` marker + designer preview mein **warning chip** (“bara label ya chhota code”) — khamoshi se unscannable label nahi. **Sensitivity proven:** bug wapas lagane par gate 5 checks FAIL |
| **Mobile PWA: stale-node / listener-leak audit (v2.25.6)** | ✅ | `Pwa_Shell` ke teenon overlays (camera · scan-fallback · bulk-picker) ka Esc handler ab **stale guard** rakhta hai (detached overlay leaked listener Esc na nigele); scan-fallback ka duplicate path purane overlay ka **proper `close()`** chalata hai (listenar + body-lock release) — do 📷 tap par sirf EK overlay bachta hai; aur POS layers ka `close()` **scroll-lock ko layers ke sath sync** karta hai (pay band hone par cart khula ho to background locked rehta hai). Gate mein 3 static + 2 rendered checks |
| **Esc ka root-cause fix (v2.25.2)** | ✅ | `UI2.dismissTop()` ab sirf **VISIBLE** list/lightbox dismiss karta hai — pehle DOM mein pada koi bhi invisible `.gs-results`/`.f-search-results` ya stale `.img-lightbox` Esc ko hamesha khud par rok leta tha aur **modal kabhi band nahi hota tha** (aap ki "cancel/close kaam nahi karta" wali shikayat ka asli reason). Purana code wapas laga kar bug dobara reproduce kiya gaya, naye code se fix — sensitivity-proven regression check gate mein shamil |
**Performance audit ka pehla hissa (v2.25.8 · req 1 / 16-P1):** instrumentation (`API.statsSummary()`: calls/dups/inflight/p50/p95/slow) · `tools/quick.sh` (per-gate timeout — sandbox hang nahi) · baseline `tmp/perf-baseline.json`.

**Findings (E1–E11):** 438 API call-sites · **0 dedupe/cache/in-flight guard** · dashboard par 6 parallel calls · har nav par `config.menu` re-fetch · **`App_Screens2`: 49 sequential awaits, 0 `Promise.all`** (waterfall = asli "1 minute" ka sabab) · **N+1: `App_Accounting` har expense ke liye alag call** · cache sirf 203/438 sites par · `items.search` 9 jagah duplicate. Fix plan: W2 (v2.25.9).

| Consistent spacing/typography/buttons/inputs/tables/modals/colors/states/validation | ✅ | shared CSS bug fix: `.field label` ne `.switch` ko tor diya tha (track 0px + knob label ke upar) — ab inline-flex + block track; search-field 📋/✕ 26–32px → **44px**; lambe chip text ke liye `.btn.wrap` |
| Usability / clarity / accessibility / responsiveness / maintainability | ✅ | taps ≥44px, inputs 16px, layout audits (1440 / 1440-dark / 390 / overlays 1440+390 / PWA) **0 problems**, `typography`+`align`+`tabs` clean, `ui-polish` 62/0 |
| Legacy removed, production-ready | ✅ | purane native dialogs, duplicate listeners, purple khaali wrapper, outdated smoke selectors — sab saaf |

---

## 7. Performance — mass requests / N+1 — ✅ Fully implemented (W7, v2.26.0)

| Requirement (spec) | Kahan | Status |
|---|---|---|
| **N+1 khatam** — kai records/records ke liye ek-ek request na bhejein | `API.parallel` + `expenses.approveBatch` | ✅ 24 requests → **1** (gate `perf-batch` ②) |
| **Batch writes** — ek read + ek write | `DB.updateMany` (Payments.gs) | ✅ 24 writes → **1**; sheets ops 312 → 266 |
| **Fire-and-forget bug** — "ho gaya" batana jab kaam chalu ho | App_Config import ab awaited batches + kamyab/fail natija | ✅ |
| **Rendered DOM proof** — claim sirf DOM assertions se | Accounting ▸ Expenses ▸ "Sab approve karein" click = 1 batch call, 0 purane, 3 → 0 pending | ✅ gate ③ |
| **Action-level loading / duplicate block** (W2 ka systm batch par bhi) | bulk approve `UI.run` + `write:true` (refresh-first warning) | ✅ |
| **Retry sirf jab jaiz ho** | batch fail → `API.parallel` fallback (4 at a time), auto-retry nahi | ✅ |
| **Call-sites ek hi shared logic par** | Config export/import, PayUI.validate, Screens2 insights + perms save | ✅ |

**Verified numbers (gate output):** purane tareeqe se 24 approve = **24 requests / 24 Expenses writes /
312 sheet writes**; naye tareeqe se = **1 request / 1 write / 266 sheet writes**, 24 rows fresh read par
bhi POSTED, har expense ka auto-voucher (24 journals), duplicate id skip, `approve:false` → REJECTED.

---

## Remaining issues

| # | Item | Type |
|---|---|---|
| 1 | Physical scanner drill (Zx10) + real paper par label read-back | ⬜ user-side (device) |
| 2 | Live GAS + Drive image upload test (deployed backend) | ⬜ user-side (environment) |
| 3 | Deployed `F2` shortcut check on a keyed device | ⬜ user-side (device) |
| 4 | Chhote label presets par font auto-compress (k) — kuch clip na ho is liye | 🟡 by design |
| 5 | Demo evidence mock data par bana hai; production `dist-static` + GAS backend alag | ℹ️ note |

**Known open defects: none.** Sab 53 gates green, rendered evidence `release/shots-v2.25.1/` mein hai.
