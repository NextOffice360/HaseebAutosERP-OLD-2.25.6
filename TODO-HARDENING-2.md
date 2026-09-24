# TODO — RELEASE HARDENING PART 2 (save/save-all, modals, notifications, data-aware UI)

**Banaya:** 2026-09-24 · **Base:** working tree (v2.29.2 + hardening part 1) · **Target:** v2.30.0
**Aap ka brief:** poora app analyze → root causes → chhote bounded tasks → har task validate → phir build/ZIP.

> **2026-09-24 (naya message) = is file ka AUTHORITATIVE/full version.**
> Us ke 12 numbered hisse neeche N1…N12 ke naamon se mapped hain (save/save-all, SAVE ALL,
> action feedback, POS points + payment modal, global modal UX, settings icons, MOCK rename,
> notifications, background sync, data-aware UI, math audit, final audit) — aur
> "existing critical requirements" T2–T9 (setupAll seeding ✔, wizard ✔, demo visibility ✔,
> shop OPEN gate ✔, activity tracking ✔, Shop Open/Close reports ✔, Items/Inventory blank ✔,
> v2.13.6 reference ⚠ see note, `docs/` folder ⛔ T8) ke saath juda hua hai.
> Validation & delivery (packaging hang diagnosis, clean ZIP, targeted/backward-compatible changes)
> = T8 + T10 + N12.

## ⚠️ Honest note (regression reference)
**v2.13.6 ka source workspace mein nahi hai** (archives: v2.26.0–v2.29.0). Is liye "v2.13.6 se compare" ka
koi claim nahi; baseline = mojooda gates + git HEAD `63b61a4` + mojooda behaviour. Jo cheez tooti mile,
uska root cause code se sabit karke theek karenge.

---

## A. Naye tasks (aap ke message se — N1…N12)

### ✅ N1 + N2 — DONE (2026-09-24) — Save / SAVE ALL ka asli root cause + fix

**Asli root cause (3 layer, sab reproduce kiye):**
1. `App_Config.html ▸ buildSections()` wrapper `{el, values}` return karta tha — us par
   `changed` na hone ki wajah se sub-tab ka Save **poore sub-tab ki 12+ values** bhej deta tha.
   Jo key UI mein render nahi hui / legacy value thi → default par RESET (user ka bug).
2. `UI2.form` mein dirty tracking na hone/na jane se "sirf badli hui setting" ka koi concept hi nahi tha.
3. `UI2.tabs` har switch par `body.innerHTML=''` karta tha → **khule panel ki unsaved tabdeeliyan
   chupke se zaya** ho jati thin (SAVE ALL un tak pohanch bhi nahi sakta tha).

**Fix (shared, minimal):**
- `App_UI2.html ▸ UI2.form`: dirty Set + markDirty/dirtySuspended; `vals({dirtyOnly})`; `changed/dirtyKeys/isDirty/clearDirty/markDirty`; `setVal` programmatic set par dirty nahi lagata.
- `App_UI2.html ▸ UI2.tabs`: switch se pehle dirty values **stash** → wapas us tab par re-render ke baad wahi values dobara apply + dirty mark (data-loss khatam, freshness barqarar).
- `App_UI2.html ▸ UI2.dirtyPayload/clearAllDirty/stashValues`: forms + stash dono ka mila payload.
- `App_Config.html ▸ buildSections`: wrapper par poora API delegate (`changed/dirtyKeys/clearDirty/set/markDirty/setOptions/show/values`).
- `App_Config.html` sub Save: **sirf dirty keys** bhejta hai; kuch dirty na ho to saaf paighaam (koi call nahi); fail par Retry.
- `App_Config.html` "Save all" (pehle **fake toast** tha): ab asli global save — `UI2.dirtyPayload()` → ek `config.save` → `UI2.clearAllDirty()` + refresh.
- `App_Core.html` nav guard + `beforeunload`: `UI2.dirtyPayload().count` par (forms + stash dono), `App._noDirtyGuard` internal bypass.
- Select ki unknown/legacy value `'(mojooda)'` option se mehfooz (silent clobber khatam).

**Gate:** `tools/test_save_all.js` — **24 PASS / 0 FAIL** (user ka exact scenario: POS=ON, Inventory=ON, Reports=OFF → toggle → Save → purani values ON rahin; sirf 1 key gayi; refresh par wahi; save-all 2 sections; dup-block; nav warning).

**Regression (sab green, isi build par):** check.sh 36/0 · release_flow **62/0** · release_ui **29/0** · sidebar_states **52/0** · busy_coverage **13/0** · report_actions **12/0**.

**N2 baqi (agla):** doosre editable pages par bhi ek jaisa SAVE ALL (masters/customer/supplier/user forms) — shared helper se; N3/N8 ke saath.

## ✅ N4 — DONE (2026-09-24) — POS Points Redeem + payment-modal redesign

**Gate:** `tools/test_points_flow.js` — **40 PASS / 0 FAIL** (35 se barha — neeche addendum; khud POS ko chalata hai:
2 items → asli customer picker → points wala customer → Pay → redeem → complete → sales record).

**2 asli bugs mile + fix hue:**
1. **Points ≠ value (paise/points ka mismatch):** `App_POS2.html` ka Complete handler +
   `submit()` dono POINTS textbox ki RAW value seedhi sale mein copy karte the. User cap se
   zyada likh de to sale mein `points: 500` record hota aur customer ke **saare** points kat
   jate, magar bill par sirf 89 points ki value lagti thi (deduction ≠ value).
   Fix: **amount = single source of truth**, points usi se derive (`floor(amount/rate)`),
   `usablePoints` par CAP, invoice se zyada value kabhi nahi, dono inputs ek hi cap share karte
   hain (`clampBoth`), aur `submit()` bhi wahi derivation dobara karta hai (double-path khatam).
2. **Payment modal 460px (sm) par qaid:** desktop par narrow. Ab `size:'xl'` + CSS
   `.pay-cols` grid — ≥900px par 2 columns (left: bill summary + quick chips + note ·
   right: methods + POINTS + loyalty + footer), <900px par single column. `.modal2.lg/.xl`
   ≤640px par 96vw. Har section `min-width:0` → koi clip/h-scroll nahi.

**Proof (gate ke asserts):** LOYALTY row + exact value, footer "PAID BY Loyalty" = value,
cap se zyada block/cap + saaf toast, sale record mein LOYALTY payment persist, due 0/PAID,
**exact deduction** (`after = before − redeemed + earned`), receipt par deduction line,
mobile 390 par no h-scroll + actions/footer accessible, zero page errors.

**Regression (sab green):** pay_ledger 48/0 · modals_close 91/0 · pwa_overlays 124/0 ·
pos_multi 23/0 · release_flow 62/0 · release_ui 29/0 · sidebar_states 52/0 · check.sh 36/0.

## ✅ N5 — DONE (2026-09-24) — shared modal system + layout audit gate

Shared system: `.modal2` sizes (sm 460 · md 680 · lg 960 · xl 1180 · full 96vw), `.m-body`
`overflow:auto` (content ke andar vertical scroll), head/foot scroll area se bahar (hamesha
accessible), `.pay-cols` responsive grid (≥900px 2 col, <900px 1 col), `.modal2.lg/.xl` ≤640px
par 96vw, har section `min-width:0` (clip safety).

**Naya audit gate:** `tools/audit_modals_layout.js [--assert]` — 11 real cases (generic UI2.modal,
POS pay, POS picker, alerts panel, New Item, New Demand, Adjustment, Transfer, Receipt/invoice)
desktop 1440 + mobile 390: width, h-overflow, clip, vertical scroll, head/foot visibility.
**Result: narrow(<620px)=0 · desktop issues=0 · mobile issues=0 · page errors=0** (POS pay modal
= 1180px wide desktop, 366/390 mobile single column).
`validate_release.sh` mein **step 6** ke tor par shamil (fast mode skip).

## ✅ N8/N3 — service layer shuru (baqi: wire karna + Settings controls)

`App_UI2.html` mein `UI2.notify(msg, kind, opts)` (kind map success/error/warning/info/progress,
2.5s duplicate-suppression, history `UI2._notifLog`, auto-dismiss/persistent) aur
`UI2.retryToast(title, detail, retryFn)` ("↻ Retry" button ke sath) add ho gaye.
Settings mein Notifications controls + sab action sites ki adoption **baqi hai**.

## N1 — Save / Save All ka asli bug  🔴 CRITICAL
- [ ] **Root cause:** settings ka `Save` **poori sub-tab ke SAB fields** bhejta hai (dirty sirf ek ho).
      Jo field DOM mein stored value se mukhtalif render hui (purana/unknown select option, stale state,
      number format, string vs bool) wo **chupke se overwrite** ho jati hai → "A=ON, B=OFF, C=ON → Save → pehle ON wale OFF".
- [ ] Fix: per-field **dirty tracking** → Save sirf dirty keys bheje (`UI2.form.dirtyKeys()`).
- [ ] Fix: select ka stored value options mein na ho to usay **option ki tarah barqarar** rakho (first option par clobber na ho).
- [ ] Fix: save ke baad dirty clear; refresh par bilkul wahi dikhe jo save hua.
- [ ] Gate: `tools/test_save_all.js` — combinations + DB diff (sirf intended key badle).

### N2 — Global SAVE ALL  ✅ DONE (2026-09-24, app-wide)
- [x] Settings ka jhoota "Save all" (sirf toast) hata kar **asli** Save All: page ke saare dirty fields
      (group ke sab sub-tabs + notifications/other forms) → ek `config.save` call. Ab ye
      `configSaveAllNow()` hai aur page bridge se header ke shared button bhi isi ko call karta hai.
- [x] **APP-WIDE**: har page ke header mein ek hi shared **Save all** button (`App.saveAllButton()`),
      engine `UI2.saveAll()` — page bridge (`App.setSaveBridge({label, run})`) ya per-form `f.onSave`
      fallback; dono na hon to button **nazar hi nahi aata** (jhoota UI nahi).
- [x] Progress (1/2, 2/2 …) → success/error; **section-wise Retry** (sirf nakaam section dirty rehta hai);
      duplicate submit block (`UI2._saBusy` + `UI.run`); success par dirty clear; count badge.
- [x] Navigation guard: unsaved changes ho to nikalne se pehle warning (forms + sub-tab stash — `App.go` +
      `beforeunload`), Cancel par wahi page.
- [x] Gate: `tools/test_saveall_pages.js` — **16 PASS / 0 FAIL** (loaded-par-chhupa button · change → button+badge ·
      Asli backend save · refresh = wahi value · do sub-tabs (stash) ek save mein · fail → dirty baqi + Retry ·
      retry se recover · read-only page par koi button nahi · nav guard + Cancel · 3 click = 1 request · 0 errors).

### N3 — Action buttons: loader / retry / feedback  ✅ DONE (2026-09-24)
- [x] **Shared action-state utility maujood tha (`UI.run` + W7.T1 auto-busy engine)** — N3 ne uski
      **COVERAGE ke 2 asli holes** band kiye (page-specific patch nahi, engine-level):
      ① **UI2.table rowActions**: sync wrapper (`e => { stopPropagation; a.onClick(r) }`) async
      handler ko chhupa leta tha → row actions par busy/dup-block/fail-feedback lagta hi nahi tha.
      Ab promise wapas aata hai → engine busy + dup-block + safety sab lagata hai.
      ② **Uncaught async rejection khamoosh tha**: auto-busy wrapper ab rejection par `UI.fail`
      (classified toast + jaiz ho to Retry) deta hai — jo handler apna error khud sambhalte,
      unka double toast NAHI hota (sirf be-cade rejections).
- [x] **Permanent-disable audit**: saare `disabled = true` sites checked — sab finally/catch/re-render
      se restore karte hain (AI send ✔ AIConfig models/hub/chat ✔ login re-render ✔ wallet finally ✔);
      engine safety 120s + UI.run settle(false) bhi phansne nahi dete.
- [x] **Gate `test_busy_coverage.js` ab 17 PASS / 0 FAIL** — purane A–I + naya N3a (row async action:
      busy + dup-block 1 call + restore) · N3b (header async action: wahi) · N3c (uncaught rejection →
      error toast + button restored) · N3c-b (Retry se wahi action dobara — calls 2).
- [x] Regression: release_flow 62/0 · release_ui 29/0 · saveall_pages 16/0 · report_actions 12/0 ·
      notifications 11/0 · modals_close 91/0 · pwa_overlays 124/0 · pos_multi 23/0.

### N6 — Settings icons (23 groups, poora list)  ✅ DONE (2026-09-24)
- [x] **Duplicate `icon:` keys tidy (2026-09-24):** `Config.gs` ki 13 lines par do-do `icon:` thay (emoji + naam) —
      JS mein aakhri jeetta tha, is liye schema padh kar pata nahi chalta tha kaun chalega. Ab har line par ek hi key,
      aur `tools/audit_settings_icons.js` ise **assert** karta hai (duplicate par exit 1).
- [x] **ROOT CAUSE (asli bug):** `Config.gs ▸ Config.defs()` frontend ko schema bhejte waqt
      sub-tab ka `icon` aur group ka `tint` **drop** kar raha tha → har settings sub-tab par
      fallback `▸` (icons "aate hi nahi thay") aur koi rang nahi. Fix: dono keys pass-through.
- [x] **Fix (shared):** 6 naye Lucide-style paths (`shop` `fileText` `flame` `share` `alarmClock` `sliders`
      `toolbox` `sparkles` `globe` `cloudOff`) + `tabIcon()` ab path ka **naam** bhi leta hai
      (`icon: 'receipt'`) — emoji→SVG mapping barqarar hai (nothing deleted).
- [x] **41/41 settings sub-tabs + 14 L1 tabs + 5 extras** ke apne icons (koi `▸` nahi, koi duplicate nahi).
- [x] **Rang meaningful:** 14 area tints (sirf icon par; tab/label ka rang waisa hi). Tint backend se aata hai
      (`Config.gs` group `tint` + App_Config extras) — UI mein koi duplicate colour list nahi.
- [x] Business Profile · Point of Sale · Mobile Apps (PWA) · Inventory & Warehouse · Trade & Accounts ·
      Modules & Navigation · Automation & AI · Security & Sessions · Backend & Integrations · Custom Fields ·
      Menu Builder · Print Templates · Lists & Catalogs · Data & Tools · WhatsApp & SMS · Price List Import ·
      Firebase Migration · Export & Share · AI Assistant · Alerts & Notifications · Purchase Reorder Rules ·
      Scheduled Jobs/Triggers · Document Numbering
      → ek hi icon style/library ✔ (24×24 · fill none · currentColor · stroke 1.9), function saaf zahir ✔,
      color meaningful ✔, broken mappings fix ✔, desktop+mobile render ✔, navigation functionality badli nahi ✔
      (sidebar_states 52/0 · release_ui 29/0).
- [x] **Gates:** `tools/audit_settings_icons.js` (23 areas + **Config.defs() runtime parity** check) ·
      `tools/test_settings_icons.js` (rendered DOM: 55 tabs · SVG · unique per bar · tint match · light+dark) —
      dono `tools/validate_release.sh` ke step **7** aur **8** mein wired.
      Saboot: audit 23/23 · 0 gaps · runtime "9 groups, koi key drop nahi" (EXIT 0) · DOM gate **12 PASS / 0 FAIL**.

#### N4 addendum (2026-09-24 baad ka audit)
- [x] Redeem block modal mein maujood: balance, "is bill par max N points", input + Redeem button.
- [x] **Fix 1 (asli masla):** POINTS row par **CREDIT settlement ka text** chipka hua tha
      ("Koi fee nahi - settlement <date>") jo points se be-taaluq tha → ab hint loyalty ka sach
      batata hai (rate · balance · max / applied points). `pointsHint.textContent` ka TDZ crash
      bhi khatam (ab class-based `setPointsHint()`).
- [x] **Fix 2:** bill summary mein **POINTS row** (points + value) — display-only, paisa hamesha
      LOYALTY payment row se (koi double-count nahi, logic waisa hi).
- [x] Gate strong kiya: `tools/test_points_flow.js` **40 PASS / 0 FAIL** (pehle 35) — naye assertions:
      POINTS row ka value = payment row ka value, points count = user ka input, hint par settlement text nahi.

### N7 — "MOCK" AI Assistant ka naam/sharafat  ✅ DONE (2026-09-24)
- [x] **Naam ek hi jagah:** `AI_Adapters.gs` MOCK meta ka label ab **"Local Data Assistant"** hai
      (`caps.llm: false` bhi) — provider dropdown ka naam wahin se aata hai (`Config.gs ▸ optionsFrom:
      CONFIG_OPTION_SOURCES.aiProviders`), UI helper `UI2.provLabel` bhi wahi meta parhta hai
      (`ai.agentConfig.providers`). Internal id 'MOCK' waise hi hai — routing/fallback/purani settings safe.
- [x] **Honest capabilities:** adapter meta mein `can` / `cannot` lists (sale/stock/udhaar/reports vs
      internet gyan/creative/seekhna — "koi hidden LLM nahi"). AI screen par nayi **capability card**
      (LOCAL branch: dono lists; bahar ke LLM par: saaf LLM-warn + "ghalat jawab mumkin" note).
- [x] **Sab jagah consistent:** Settings ka "Key na ho to MOCK mode" → "Key na ho to Local Data Assistant";
      drawer/answered-by/badges/greetings/keyless-reply sab ab ya to meta se aate hain ya honestly likhe hain
      ("local rules engine (no LLM)"). User-facing koi "Mock …" string nahi bachi (gate assert karta hai).
- [x] **Saath mein 2 asli bug fix:** (①) UI2 select ka naya `optionLabels` pehle khaali-label shart par
      lagta tha — string options mein kabhi nahi lagta tha; ab curated label hamesha jeetta hai.
      (②) Settings se provider badalne par AI screen purana (stale) config dikhata tha jab tak F5 na ho —
      ab `App.state.settings.aiProvider` mukhtalif ho to screen khud config dobara load karta hai.
- [x] Demo mirror: `demo/mock.js ▸ ai.providers` MOCK meta (label + can/cannot + caps) asli adapter jaisa.
- [x] **Gate: `tools/test_ai_naming.js` — 23 PASS / 0 FAIL** (static+backend: meta/caps/can-cannot/catalog/
      optionsFrom/labels/agentConfig-meta/leftover-scan · rendered DOM: capability card dono branches,
      settings dropdown labels, settings-save → stale refetch → LOCAL card, wapas GEMINI bahal, 0 errors).
      **Wired as step 13** (+ `--fast` skip).
- [x] Regression (is build par): saveall_pages 16/0 · save_all 24/0 · partial_save 48/0 · release_flow 62/0 ·
      release_ui 29/0 · modals_close 91/0 · settings icons 23/23 + dup 0 · validate_release --fast GREEN.

### N8 — Notifications / toasts system  ✅ DONE (2026-09-24)
- [x] **`UI.notify({key, tone, msg, ms, action, sticky})`** — reusable service (App_Core):
      ok/err/warn/info/**progress** tones; record handle `{close(), update(), done(), fail()}` —
      progress spinner khud band nahi hota, `done()` → ok auto-dismiss, `fail()` → err + Retry.
- [x] **Dedupe (spam khatam):** ek hi key/tone+msg 1400ms mein dobara → naya stack NAHI,
      purane par **×N** count + timer reset. Merge par **behtar toast jeetta hai** — Retry
      action/sticky purane par upgrade hote hain (SAVE ALL fail→Retry ka rasta isse hi bacha).
- [x] **Persistent failures + Retry:** `sticky` toast auto-dismiss NAHI hota (offline sync fail ab
      sticky + "Dobara sync karein" action ke saath); cap: non-sticky max 4 (purana pehle jata hai).
- [x] **Settings controls:** Settings ▸ Automation & AI ▸ Alerts & notifications — `notif.enabled`
      (OFF par bhi errors/warnings HAMESHA) + `notif.duration` (SHORT/NORMAL/LONG scale).
- [x] **Responsive:** ≤600px toasts full-width bottom (92vw cap desktop); spinner/count/sticky styles.
- [x] **Back-compat:** `UI.toast(msg, type, ms|{action})` + `UI2.notify` + `UI2.retryToast` sab isi
      service par — 300+ purane call-sites bina chhue dedupe/cap/settings se mehfooz.
- [x] **Gate `tools/test_notifications.js` — 11 PASS / 0 FAIL** (dedupe ×5 badge, alag messages,
      sticky + ✕, Retry callback, progress done/fail, cap ≤4, notif OFF → err zinda, duration scale,
      legacy signature, 0 errors). **Wired as step 14.**
- [x] Regression: saveall_pages 16/0 · save_all 24/0 · partial_save 48/0 · release_flow 62/0 ·
      release_ui 29/0 · modals_close 91/0 · pwa_overlays 124/0 · points_flow 40/0 · pos_multi 23/0 ·
      busy_coverage 13/0 · icons 23/23 · validate_release --fast GREEN.

### N9 — Background sync / offline  ✅ DONE (2026-09-24)
- [x] **Detect/queue/reconnect (pehle se thay)** — online/offline events, localStorage queue
      (`ha_queue`), boot flush + `online` par flush. N9 ne 3 ASLI bugs band kiye:
- [x] **① Replay double-apply (backend):** dedupe sirf SALE ke paas tha (`offlineId` notes mein) —
      config.save jaise generic actions ka replay double apply ho sakta tha. Ab `OfflineSync.process`
      mein **generic idempotency ledger** (`OfflineQueue` sheet): DONE clientId dobara NAHI chalta
      (duplicate flag); FAILED rows bhi ledger mein (audit).
- [x] **② sales.create route metadata drop:** route `p.sale` unwrap karta tha → `offlineId`/`source`
      Sales.create tak pohanchti hi nahi theen (sale-level dedupe dead tha). Ab passthrough.
- [x] **③ Partial-fail par poora queue wapas:** flush mein kamyab entries bhi dobara bheji jati theen.
      Ab **sirf NAKAAM clientIds** requeue; concurrent flush guard (`_syncBusy`); `syncFailed`/`lastSync` state.
- [x] **④ Offline reload dobara login maangta tha:** init `token && navigator.onLine` — offline par
      login screen. Ab **offline resume**: token + cached bootstrap + stored session → app khuli rehti hai.
- [x] **Sync status visibility:** header mein **sync chip** (⇅ + pending count; 0 par chhupa; fail par
      surkh pulse; title mein aakhri sync) — click = abhi sync. Queue had (`pwa.offlineMaxQueue`) par
      sticky warn (kaam phir bhi queue hota hai — zaya nahi).
- [x] **Background auto-sync:** 60s tick (lightweight: pending + online + idle shartein) —
      **Settings ▸ Backend & Integrations ▸ `sync.autoFlush`** (def ON) se band.
- [x] **Gate `tools/test_offline_sync.js` — 11 PASS / 0 FAIL** (backend: sale replay dedupe, generic
      replay-safe, unknown→FAILED ledger, mixed queue + sirf-fail retry · DOM: offline write→chip,
      fail→queue salamat, offline reload→qayam + offline resume, online flush→backend value,
      autoFlush OFF/ON, 0 errors). **Wired as step 15.**
- [x] Regression: release_flow 62/0 · release_ui 29/0 · saveall_pages 16/0 · notifications 11/0 ·
      busy_coverage 17/0 · modals_close 91/0 · pos_multi 23/0 · pwa_overlays 124/0 · --fast GREEN.
- [ ] Baqi (N9.1, chhota): server-side conflict resolution (ab last-write; per-field merge N11 ke baad)
      + retry backoff (ab 60s fixed — backoff settings).

### N10 — Data-aware / dependency-aware UI  ✅ DONE (2026-09-24 — neeche detail; AI provider conditional UI N7 mein ho chuka)


### N10 — Data-aware UI  🔵 (Inventory hissa DONE · GRN/supplier agla)
- [x] **Inventory "All Inventory" (root cause fix)** — `Inventory.gs ▸ levels()` list SIRF `Stock` rows se banti thi;
      naye install par (GRN se pehle) page khali. Ab **Items (catalog) se** banti hai + Stock LEFT JOIN:
      `scope:'all'` (har item, 0 stock par bhi) · `scope:'stocked'` (purana view, default) ·
      naye fields `hasQty` + `stockStatus` (out/low/in) · purane saare fields/filters barqarar.
      UI: **All inventory** permanent tab (default) + **Stock levels** waisa hi (naya "Zero-stock items bhi dikhayein" switch).
      Filters: search · category · brand · stock status · "sirf stock wale" · sorting · **column show/hide** · CSV · saved views.
      **Gate `tools/test_inventory_all.js` 40 PASS / 0 FAIL** (22 backend + 18 rendered DOM).
- [x] **GRN + PO supplier info auto-populate (DONE 2026-09-24)** — do root causes:
      ① `Purchase.gs ▸ supplierStatement` sirf {name, phone, terms} bhejta tha → address/email/NTN/credit limit
         UI tak pohnchte hi nahi thay. Ab poora supplier master (additive change).
      ② **Bara fix:** GRN/PO legacy `UI.form` (App_Core) use karte hain jismein per-field `onChange` hook
         **bilkul support hi nahi tha** (`UI2.form` mein tha) → supplier badalne par info card stale rehta tha.
         Ab legacy form builder par bhi `onChange` + **dirty tracking** (`changed()/dirtyKeys()/isDirty()/clearDirty()`).
         `UI2.form` ke hook ka `apiRef`-null bug bhi fix (value seedha element se).
      Card (shared `supplierBalanceCard`) ab dikhata hai: Contact · Email · Address · Tax/NTN · Payment terms ·
      Credit limit + available credit · Prev. balance · Total purchases/paid (jo field khali ho woh row dikhti hi nahi).
      Fresh install ka demo supplier bhi tax/NTN + credit limit ke sath seed hota hai.
      **Gate `tools/test_supplier_autofill.js` 19 PASS / 0 FAIL** (3 backend + 16 rendered DOM: GRN + PO parity,
      stale-info check, backend-truth match, legacy dirty tracking).
- [x] **Inventory** (upar) · **GRN supplier** (upar) — dono gate ke sath VERIFIED.
- [x] **APP-WIDE data-aware engine (2026-09-24)** — `UI2.form` par shared do mechanisms:
      **① `f.depOn = {parent, options(parentVal, vals), invalidMsg}`** — parent badalne par child ke
      options ASLI data se dobar banti hain; invalid child value CLEAR + toast (+ "— chunein —"
      placeholder); TEXT field ho to datalist suggestions (free typing QAYAM); initial render par
      koi value zaya nahi (purani value "(mojooda)" ban kar bachi).
      **② `f.showWhen = (vals)=>bool`** — field sirf tab jab shart sahi (har change par dobara talli).
- [x] **Adoption (3 sites):** Transfer (To-branch options mein From NAHI; From badle to To dobar;
      invalid To clear + toast; send par from≠to validate — structural errors pehle) · Account form
      (bank fields sirf BANK type / isBank ON par — chhupte hain, HOTE hain) · Item form (subCategory
      suggestions = selected category ki child categories; naya naam likhna barqarar).
- [x] **Gate `tools/test_data_aware.js` — 9 PASS / 0 FAIL** (backend: transfer rule + child-category
      persist · DOM: to-options exclude from, invalid clear + toast, validate-before-save (API call
      nahi jata), bank showWhen 3-halat, subCategory datalist + free-typing, 0 errors). **Step 16 wired.**
- [x] Regression: release_flow 62/0 · release_ui 29/0 · saveall_pages 16/0 · partial_save 48/0 ·
      save_all 24/0 · supplier_autofill 19/0 · modals_close 91/0 · --fast GREEN.

### N1/N2 extension — Save/Save All app-wide deep audit  🟠
- [x] **Legacy `UI.form` par dirty tracking + onChange hook (2026-09-24)** — `changed()/dirtyKeys()/isDirty()/clearDirty()`,
      programmatic `set()` quiet (dirty nahi karta), `form:dirty` event — SAVE ALL ka bunyaad ab Settings ke bahar bhi mojood.
- [x] Regression isi build par: save_all 24/0 · modals_close 91/0 · release_ui 29/0 · points_flow 40/0 ·
      pos_multi 23/0 · inventory_all 40/0 · supplier_autofill 19/0 · validate_release --fast GREEN.
- [x] **Backend partial-save round (2026-09-24):** `Items.save`, `Parties.saveCustomer/saveSupplier`,
      `Accounting.saveAccount`, `Config.saveList/saveCustomField` — update par sirf BHEJI hui keys patch hoti hain,
      validation MERGED (effective) values par, `code`/`barcode`/`nextCode` sirf insert par, `account.group/type/
      isCash/isBank/active` bina bheje chhue nahi jate. (Jaanch: deep-read diff-do.)
- [x] **app-wide SAVE ALL button + engine** (upar N2) — masters/GRN/PO/Demand apne modal ke andar save karte hain,
      is liye un par jhoota header button nahi aata; field-level in-form dirty + guard dono mojood.
- [x] Gate: `tools/test_partial_save.js` — **48 PASS / 0 FAIL** (backend audit items/customers/suppliers/users/
      locations + settings scenario + SAVE ALL multi-section + rendered DOM: item detail ▸ 🎲 Generate new —
      barcode update hua, CODE wapas generate NAHI hua, name/price safe).
- [x] Regression (is build par): saveall_pages 16/0 · partial_save 48/0 · save_all 24/0 · modals_close 91/0 ·
      release_flow 62/0 · release_ui 29/0 · sidebar_states 52/0 · busy_coverage 13/0 · inventory_all 40/0 ·
      supplier_autofill 19/0 · settings icons 23/23 static + dup-keys 0 · audit_icons 5/0.
- [x] **Concurrent / stale writes (2026-09-24)** — do users ek hi record ke alag fields: stale save ne doosre ki
      tabdeeli nahi mitayi (sirf bheji hui keys patch hoti hain), code/barcode dobara generate nahi hua, alag tabs ke
      settings saves ek doosre ko nahi khate, 5 tez saves mein sab fields salamat, aur shop band hone par sale rukti hai
      (business rule barqarar) — `test_partial_save.js` PART 1b (⑥–⑩).
- [ ] Baqi: refresh/reload ke baad adhoori sync ke edge cases + related calculations/state transitions (N11 ke sath).

### UI / compatibility rule (standing)
- [ ] Koi feature hataana NAHI. Sirf spacing/width/grid/tabs/breakpoints/modal-size/section organization badal sakte hain.
- [ ] PWA-first responsive (desktop/tablet/mobile), bina zaroorat horizontal scroll na ho.
- [ ] Har change ke baad regression: feature removal ya disable hona nahi chahiye.

### N11 — Full math/logic audit  ✅ DONE
- [x] Recon (authoritative-source per area, read-only): Sales line calc (lineDisc + discountPct, per-line limit, `pos.discount`
      bypass, minPrice effUnit guard), header discount (amount/pct/coupon, subtotal cap), bill maxDiscountPct, tax engine
      (taxInclusive/exclusive, proportional header-disc allocation, residue last line, `payload.tax` override), total↔lineSum
      drift guard 0.02, paid/due/change, credit-sale + credit-limit (error me poora hisab), status PAID/PARTIAL/DUE, ledger
      full-invoice debit (closing=due), LOYALTY payment → redeem (double receipt nahi), Inventory.post AVG (in: weighted,
      out: oldAvg), Payments.create (fee/fed/net, postOnClear→PENDING), Loyalty earn/redeem, sessionSummary
      expected=opening+netCash, DB.nextNumber per entity|location, purchase GRN costing + price freeze, purchase return
      (stock −qty at line cost, supplier ledger debit), Inventory.valuation = Σ qty×avgCost, Parties.summary directions
      (customer debit−credit / supplier credit−debit) — sab theek, koi mask nahi.
- [x] **FIX #1 — returns profit overstatement** (`Reports.gs`): dashboard `monthProfit` + `reports.profit` cogs/gross returns
      ignore karte the → profit overstated. Naya `Reports._returnsImpact(p,s)` (revenue reversal = orig net unit rev capped
      at return lineTotal; cost reversal = orig cost×qty jab restock) → dashboard `profit -= impact`, profit report
      `cogs += cost; gross -= impact`.
- [x] **FIX #2 — return over-refund** (`Sales.gs` + `App_Screens.html`): `returnSale` refund = qty×price (gross) tha →
      discounted bill par zyada wapas. Ab refund base = **net unit revenue** (orig lineBase/qty; explicit price override
      qayam); UI return form net prefill + sirf discount ho to "· net" hint.
- [x] **FIX #3 — negative due on overpay** (`Sales.gs`): overpay par `due = total − paid` −ve ho jata tha (change cash
      wapas ja chuka tha) → `due = max(0, …)`.
- [x] **FIX #4 — partial-return commission** (`Payments.gs`): `reverseForReturn` poore sale ki commission REVERSED kar
      deta tha → ab proportional (returned line net share, cumulative across multiple returns, sirf PENDING; PAID untouched).
- [x] Gate `tools/test_math_logic.js` **21/0 GREEN** = validate_release **step 17** (`--fast` skips): backend exact-math
      ①–⑩ (proportional disc + mixed tax + change/due, taxInclusive 145.30, clamp, credit limit, loyalty round-trip,
      AVG costing 150.00, return/stock/refund, net refund 400, profit==raw-tables recompute, numbering series, expectedCash)
      + commission proportional ⑫ + FE↔BE parity ⑪ (POS cart DOM == backend total) + zero page errors.
- [x] Regression all GREEN: release_flow 62/0 · points_flow 40/0 · pay_ledger 48/0 · pos_multi 23/0 · modals_close 91/0 ·
      release_ui 29/0 · inventory_all 40/0 · saveall_pages 16/0 · supplier_autofill 19/0 · save_all 24/0 · partial_save 48/0 ·
      data_aware 9/0 · math_logic 21/0 · validate_release `--fast` GREEN.

### N12 — Final regression audit  🔴 (aap ke message ka exact checklist)
- [ ] Fresh setup → seed → setup wizard → login → user/shop → open shop → customer → products → items → inventory →
      POS → customer points → sale → payment → reports → close shop → settings → Save → Save All → notifications →
      offline/online sync → retry/error handling → demo visibility → **build → ZIP**.
- [ ] Poora end-to-end: fresh setup → seed → wizard → login → user/shop → open shop → customer → products → items →
      inventory → POS → points → sale → payment → reports → close shop → settings → Save → Save All → notifications →
      offline/online sync → retry/error → demo visibility → build → ZIP. Bilkul aakhir mein.

---

## B. Pichhle tasks (part 1 se — jo baqi hain)

- [ ] **T8 docs/ + ZIP process** — poora `docs/` folder build mein + `tools/package.sh` hang/error-free.
- [ ] **T10 Release** — full suite (`env -u HOME`) → `tools/validate_release.sh` → package v2.30.0 → CHANGELOG/CHECKLIST.
- [x] T1 recon · T2 blank pages · T3 seeding · T4 shop gate · T5 open/close reports · T6 demo visibility · T7 wizard · T9 validation script
      (saboot: `test_release_flow.js` 62/0 · `test_release_ui.js` 29/0 · `test_seed_recovery.js` 36/0)

## C. Standing rules
- Reproduce pehle, phir fix — shared logic (page-specific patch nahi); dawa sirf rendered-DOM/back-end saboot ke sath.
- Chhote steps; har task ka apna test; full suite sirf release par (`env -u HOME`, ek foreground run, log).
- Kuch delete nahi; layout/tap/text rules barqarar; end par `## ➡️ Next to do`.
