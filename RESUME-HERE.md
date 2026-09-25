# 🚩 RESUME-HERE — environment reset / naye session ke baad PEHLE ye parhein

**Project:** Haseeb Autos ERP & POS · **Current version:** **v2.29.1** (Utils.gs ▸ `AppConfig.VERSION`)
**Last shipped:** 2026-09-24 · v2.29.1 = **W6.T3 Sidebar responsive matrix** (1440/1280/1024/768/390 × light+dark; taps ≥48 · text ≥10.8) + verify.sh false-green fix · full suite **67 gates · ALL GREEN ✔ (1248s)** (`tmp/verify291.log`) · gate `sidebar-states` **52/0**
**Spec:** `APPLICATION-WIDE-SPEC.md` (1540 L · md5 `69b50b821565d1654d2e3bed82f10e9c`) — har todo se pehle parhein
**N-series (2026-09-24, v2.30.0 — uncommitted):** N1 ✅ · **N2 ✅ APP-WIDE** (header ka shared *Save all*: page bridge
`App.setSaveBridge` + engine `UI2.saveAll` + per-form `onSave`; fail par sirf wohi section dirty + Retry; dup-block;
nav-guard; jhoota button nazar nahi aata — gate `tools/test_saveall_pages.js` **16/0**, wired as step 12) ·
**N4 ✅ (gate 40/0)** · **N5 ✅ (modal audit gate)** · **N6 ✅ (settings icons: root cause + 55 tabs SVG + tints,
static+DOM gates wired into `validate_release.sh` steps 7/8; duplicate `icon:` keys tidy + assert)** ·
**N7 ✅ ("MOCK" → "Local Data Assistant": naam ek source se — adapter meta + `UI2.provLabel`; honest
can/cannot capability card AI screen par; koi user-facing "Mock"/LLM-dawa nahi; saath mein UI2 select
`optionLabels` bug + AI-screen stale-provider bug fix; gate `test_ai_naming.js` **23/0**, wired step 13) ·
**N8 ✅ (notification service `UI.notify`: dedupe ×N badge, sticky+Retry, progress done/fail,
cap 4, Settings controls notif.enabled/duration; UI.toast/UI2.notify back-compat; gate
`test_notifications.js` **11/0**, wired step 14) ·
**N1/N2-ext ✅** (partial-save backend round: 6 endpoints; gate `tools/test_partial_save.js` **48/0** (stale/concurrent writes samet), wired as step 11)
**N3 ✅ (auto-busy engine ki 2 coverage holes band: rowActions promise passthrough + uncaught
rejection → UI.fail+Retry; permanent-disable audit sab safe; gate `test_busy_coverage.js` **17/0**)**
**N9 ✅ (offline sync: generic idempotency ledger OfflineQueue sheet; sales.create metadata passthrough;
partial-fail par sirf nakaam requeue; offline reload resume — login nahi maangta; header sync chip;
60s auto-flush + `sync.autoFlush` setting; gate `test_offline_sync.js` **11/0**, wired step 15)**
**N10 ✅ APP-WIDE (data-aware engine `UI2.form`: depOn dependent options + invalid-child clear +
showWhen; adopt: Transfer to-branch, Account bank fields, Item subCategory; gate `test_data_aware.js`
**9/0**, wired step 16)**
**N11 ✅ MATH/LOGIC AUDIT (4 shared fixes + gate `test_math_logic.js` **21/0**, wired step 17):
①returns-profit overstatement (Reports._returnsImpact → dashboard+profit net) ②return over-refund
(Sales.returnSale + UI return form = NET unit revenue, override qayam) ③overpay par due −ve (clamp 0)
④partial-return commission poora reverse (proportional, cumulative, sirf PENDING). Recon baqi sab
areas verified-correct (tax engine, AVG costing, loyalty, numbering, valuation, party balances,
GRN/purchase-return costing, day report). Regression: 12 gates ALL GREEN.**
**N12 ✅ FINAL E2E (gate `test_e2e_critical.js` **22/0**, wired step 18) + FIX #5: overpaid tender
receipt APPLIED amount par (pehle tendered → ledger −4 / drawer +4); applied=0 → receipt skip;
LOYALTY redeem pro-rate. N11 gate ne ye regression khud pakra. Regression: 15 gates ALL GREEN.**
**N9.1 ✅ DONE (offline sync hardening):** per-field 3-way conflict merge (`__base` stamps:
items/customers/suppliers forms → `OfflineSync._mergeUpdate`, CONFLICT → server wins + audit +
toast), stale flag (AuditLog touch), retry backoff (`sync.backoffBase`, 60→120→…600s, reset on
success) — gate `test_offline_sync.js` **17/0** (⑫a–f), regression 8 gates GREEN.
**W7.T2-perf ✅ (GRN waterfall):** `purchase.priceInfoBatch` (N lines ka price history EK call)
+ FE `fetchPrevBatch` (PO-load/demand add-all) — gate `test_perf_batch.js` **39/0**, regression
(supplier_autofill 19 · release_flow 62 · e2e 22 · data_aware 9 · modals 91) sab GREEN.
**T7.3 Forms ✅ (shared validation):** `UI2.validate` engine (highlight `.f-err-mark` + aria-invalid
+ focus + `(+N aur)` key-dedupe toast; structural→content order; msgs barqarar) — 6 adoptions:
transfer/GRN/PO/purchase-return/item/customer-supplier. Gate `test_forms_shared.js` **14/0** (step 19), regression 6 gates GREEN.
**T7.4 Settings ✅ (shared consumption):** declarative showWhen {key,eq|ne} (JSON-safe) +
UI2 object-form + **cross-form depsRoot** (sectioned sub-tabs) — aiOpenaiPrefixes(OPENAI),
integration fields(ON) · DT live preview (`DT.format(v,mode,cfgOv)` — save ke baghair am/pm,
date-only rules) · visibility pehle se (page perm + config.save strip + defs group perm).
Gates: `audit_settings_defs` **10/0** + `test_settings_shared` **6/0** (step 20); regression 9
gates GREEN. **T7.2 Table states ✅ (W9 slice):** `UI2.table` shared `load` → delayed skeleton / error+Retry
(`wrap.reload()`)/onLoad — Demand ▸ Reports 3 tables adopted; gate `test_table_states.js` **11/0**
(step 21); regression report_actions/release_flow 62/e2e 22/modals 91 GREEN.
**v2.30.3 SHIP (2026-09-25):** T7.3 forms-validate + T7.4 settings-shared + T7.2 table-states +
**W9 (T7.5)** — PWA.confirm shared (3 raw native confirm khatam), **📖 Madad modal** (sidebar ▸ ❓:
repo docs/ + official links, `help.docsUrl` setting), tooltip sweep 9/9 icon-btns. Gates:
`test_w9_help` **10/0** = step 22 · table_states 11/0 = step 21. VERSION = 2.30.3.
**T13.1 B§8 conversion units ✔ (v2.30.4):** GRN direct lines par BOX↔PCS switch
(wahi auto-calc jo PO me v2.9 §8 me tha) — 1 BOX=12 PCS, rate Rs 3,000 → base 12 × 250 auto;
line hamesha BASE units. Gate `test_w13_modules.js` **10/0** = step 23. W13 audit: B§5 credit
logic + B§13 rename pehle se ✔ (gated). Cleanup (2026-09-25): stale zips/shots ~67MB free;
test_logic legacy gate ab self-contained **816/0**. **T13.2 B§11 price signals ✔ (v2.30.4):** `purchase.supplierPriceSignals`
(har item ki aakhri 2 GRN rates — real data) + supplier detail me Price signals tab
(up/down badges); party history+totals pehle se ✔. Gate 14/0; regression GREEN.
Quota round 2: chrome-libs → .cache/ (snapshot-excluded), zip tracking band — snapshot
~85MB. **W13 MUKAMMAL (v2.30.4):** T13.3 quick-view + T13.4 reorder/AI-signals verify-complete
(pinned, gate **20/0**) · T13.5 B§7/B§10/B§12 verify (pos_multi/ai_naming gates) —
audit-first: 2 asli fixes (T13.1/T13.2), baqi pehle se complete. Quota round 3: chrome-headless-shell
(259M) + npm cache (22M) hataye — disk 561M, snapshot-effective **~86M**. **W10.T1 matrix ✔:** `docs/TESTING-MATRIX.md` — 17 A§17 dimensions → gates/evidence;
14/17 gated, gaps: roles (W10.T2 gate), scopes (live-GAS carry-over), prod parity (W12).
Quota round 4: shallow re-clone (.git 55M→4.9M) — snapshot-effective **37MB**; zips tree me
mehfooz. **W10.T2 roles gate ✔:** `test_roles_matrix.js` **8/0** = step 24 (asli Auth.gs:
CASHIER 4 APIs backend-DENY, OWNER/MANAGER ALLOW, users.perms, nav App.can) — matrix
**15/17 gated** (baqi: scopes live-GAS, prod parity W12). **v2.30.5 SHIP (2026-09-25):** FULL validate **26/26 PASS** (25 steps, env -u HOME,
log tmp/validate-v2.30.5.log) + package `release/haseeb-autos-v2.30.5.zip` (4.3M).
W12 secret scan 4/0 = step 25 · W11 docs parity (06-TESTING 25-steps). Zips: tree me
v2.30.5 (current) + archive v2.30.2/v2.30.3. **W8 ✔ (v2.30.4):** `audit_naming.js` **6/0** = step 26 (22 screens unique+lowercase,
nav↔screens match, 273 routes domain.action + zero dup, zero .bak, 44 namespaces ek-ek,
App_/Pwa_ split) + `docs/ARCHITECTURE.md` (conventions + data flow). Saare waves ab
✅ (W1–W13). Quota round 6: snapshot-effective 41MB (display 118.9 stale; 87MB khali).
**App_Orders L186 adoption ✔ (v2.30.5):** orders list shared `load:` par
(tbl.reload() rowActions me, Clear filters emptyAction). **Sabak:** UI2.table wrap
return karta hai — append lazmi (DOM-probe debugging se pakra). Chrome-libs restore:
fetch_chrome_libs ke atspi/avahi gaps manually .deb se bhare (libnspr/nss/atk/atspi/
avahi/cairo/pango). Quota: 41.3MB effective (stale display ignore). **ENTERPRISE UI/UX MANDATE (2026-09-25) — P0 round done:** attachment
`Context_Aware_ERP_UI_UX_Workflow_Architecture.md` parh kar
docs/UI-UX-ENHANCEMENT-PLAN.md banai (P0–P4 slices; spec ke saare 51 sections
ka distill). P0: audit_save_persistence.js (72 sites/81 routes) → 16 CONFIG
gaps → config-snapshot layer (ha_mock_cfg, write-wrap, window-expose sabak)
→ GAP 0; salesman.routes mock CRUD added; gate shop_setup_flow 26/0 (K naya).
**Agli rounds: P1 typography (Styles tokens audit), P2 modal wide-arch,
P3 responsive sweep, P4 context-aware pilot (Demand module — spec §8–14).**
**TOGGLES/SETTINGS persist fix (v2.30.5 +1):** user ka "toggles not saving"
ka asli sabab — mock config.save / system.settings.save SETTINGS me assign
karte the magar PERSIST nahi (reload par sab defaults). Ab dono
mockPersistSettings() karte hain (ha_mock_set_ov overlay) — UI-flow probe:
toggle + Save all → RELOAD → values qayam. Gate ab 24/0 (J section naya).
**KNOWN demo-scope note (user ko batana):** demo-reload par seeded DATA
(items/sales/orders) seed-state par wapas aata hai — sirf SETTINGS + wizard
ab persist hote hai; poora mock-persistence layer alag slice hai (backend
GAS deploy par har cheez asli Sheet me save hoti hai).
**USER-BUG CLUSTER FIX (v2.30.5, 2026-09-25) — shop/wizard/POS/prints:**
(1) demo shop-state 3 sources me bikhrha tha (pill hard-coded OPEN vs banner
CLOSED) — ab demoShopSync se EK sachai; (2) POS pehle action par block:
addToCart + qtyPad gate + 'Shop band hai' popup/banner (PWA.POS me bhi pay);
(3) wizard: Skip (persisted) + Discard changes + done par banner-hide +
persistence (mock SETTINGS localStorage overlay — reload par wizard nag band);
(4) shop screen par 'wizard dobara chalayen' (reset+open, settings.manage);
(5) invoice me 'Printed at' timestamp; (6) loadShopState ab sab users ke liye
session parhta hai (pill sirf UI-hide). GATE: test_shop_setup_flow.js 21/0.
pos_multi/e2e me shop-open preamble (nayi POS reality). **Note: agar koi
SPECIFIC save button ab bhi fail ho to screen ka naam batayein — wizard-save,
settings Save-all, orders/items sab DOM-verified GREEN hain.**
**Agla: T3.1 UI.bindDeps ya W1.T1 API audit; items.list cap-100 slice.**
**W9.T3.5 data-reactivity ✔ (v2.30.5):** Store.sub/emit engine + API.call
write-emit + UI2.table live auto-reload (debounce, live:false opt-out); mock
customers.save persist bug fix. Gate sweep 13/0. fetch_chrome_libs.py ab
khud-kaafi (atspi/avahi static map — reset par ek-command env recovery).
**Agla: T3.1 UI.bindDeps (90-min slice) ya W1.T1 API call-site audit.**
Live GAS deploy + hardware drills user ke sath pending. v2.30.6 tag ka
faisla: W2 (T2.3+T2.4) + T3.5 ab ship-level — agle round start par tag +
full-verify (env -u HOME, ek call).
**W2.T4 progress ✔ (v2.30.5):** UI.progress + UI.progress.run (chunked-yield);
labels dono copies wired (App_Core + App_Barcode — duplicate labelsHtml ka
dhyan rakhna!). Gates: progress 20/0 · labels_live 30/0 · baqi sab GREEN.
**Agla: W9.T3.5 data-reactivity sweep (Store.sub) — phir T3.1 UI.bindDeps.
Live GAS deploy + hardware drills user ke sath pending.**
**ROUND-START RULE (user hukum, 2026-09-25):** har lambe kaam/todo se PEHLE
capacity check: python-walk (koi exclusion nahi, .cache bhi dekho) + node_modules/
.npm mojood hon to pehle safai. Limit 128MB/10k files. **W2.T3 error/retry ✔**
(tools/test_error_retry.js naya gate 26/0; impl pehle se thi). **Agla: W2.T4
UI.progress (sach me missing — grep zero) → T3.5 data-reactivity sweep.**
**QUOTA PROTOCOL (2026-09-25, over-budget hua tha):** counter ab node_modules +
npm-cache BHI ginta hai (131.3MB hua tha, 53 files drop). Is liye: (1) bootstrap
ab npm cache /tmp par karta hai (.npm kabhi workspace me nahi banta); (2) ROUND
KE AKHIR me jab test runs mukammal hon to `rm -rf node_modules` karke turn
khatam karo — agle round ka bootstrap 17s me wapis bana deta hai. Sach ke liye
hamesha python-walk (node_modules/.cache/.npm counting ke sath).
**W5 COMPLETE (v2.30.5):** T5.1–T5.5 ✔ — asli system `Fields.gs` (v2.28/2.29
se shipped, TODO stale tha). Aaj: demo-mock parity (ROLE_PERMS field.* keys +
fields.matrix mirror) + Users & Security me "Field visibility" live-matrix tab +
gate F assertions → test_field_visibility **58/0 GREEN**. Audit tool me stale
metric ka note. **Agla: W2.T2 error/retry (UI.errBox) ya T2.4 progress — phir
W9 data-reactivity sweep (T3.5). Live GAS deploy verify user ke sath pending.**
