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
avahi/cairo/pango). Quota: 41.3MB effective (stale display ignore). **Agla: Zx10 printer
drill + label read-back + POS→Pay→Esc mobile walkthrough (user ke sath) → W4/W5 polish
slices → live GAS deploy verify.** Carry-overs: live GAS deploy, Zx10 printer drill, label read-back, mobile
POS cart→Pay→Esc, App_Orders L186 adoption.
read-back, mobile POS cart→Pay→Esc, App_Orders L186 adoption.
**PUSH HO CHUKA (2026-09-24):** GitHub `NextOffice360/HaseebAutosERP-OLD-2.25.6` (public) — remote `main` =
**3b7b40e** (v2.30.0 commit c07e4fc + git_push.sh stale-info fix 3b7b40e) · 424 files · poora project.
**Agla kaam:** **N3/N8** (action loading/retry + notification service) → N9 (offline sync) → app-wide data-aware baqi → N11 → N12 → T8 docs/ZIP → T10 release → W7.T2 → T7.3/T7.4 → W9/W13 → W10 → W11/W12
(Naya session/token ka khaali hone par: user se naya PAT le kar `GITHUB_TOKEN=… bash tools/git_push.sh` — script ab fast-forward/diverged khud sambhalti hai; token KAHIN save nahi hota)

---

## 1 ▸ Ek command se environment wapas

```bash
bash /home/user/haseeb-autos/tools/bootstrap.sh
```

Ye khud karta hai: npm dependencies → Chromium libs → demo rebuild → demo server (8021) → canary gate → aur print
karta hai ke kaunsi file kahan hai. Sirf status chahiye: `bash tools/bootstrap.sh --check`

---

## 2 ▸ Reset par kya jata hai, kya nahi (ye "data loss" nahi — platform ka niyam)

| Cheez | Reset ke baad? | Wapas kaise |
|---|---|---|
| **Project files** (`apps-script/`, `tools/`, `demo/`, `dist-static/`, `release/`, `specs/`, docs) | ✅ **rehti hain** (workspace snapshot) | — |
| **Aap ke uploads** (`/home/user/uploads/`) | ✅ rehte hain | — |
| `node_modules/` (jsdom, puppeteer…) | ❌ gayab | `bash tools/bootstrap.sh` (ya `npm install --no-audit --no-fund`) |
| `/home/user/.cache/chrome-libs` (Chromium system libs) | ❌ gayab | `python3 tools/fix_chrome_libs.py` (bootstrap khud karta hai) |
| Chalte hue processes (demo server, verify) | ❌ band | bootstrap server shuru karta hai |
| `LD_LIBRARY_PATH` environment variable | ❌ khatam | har browser-gate se pehle: `export LD_LIBRARY_PATH=/home/user/.cache/chrome-libs/usr/lib/x86_64-linux-gnu` |
| `tmp/` logs (verification logs) | ✅ rehte hain | — |
| Release zips (`release/`, `release/archive/`) | ✅ rehte hain | — |

**Note:** snapshot ki 2 hadein hain (~128 MB, ~10,000 files). Guard chalayein: `bash tools/workspace_guard.sh`
(bhara ho to `--prune`, aur chahain to `--prune-archives` — newest 4 zips rakhta hai).

---

## 3 ▸ Master spec kahan hai (5 copies, sab byte-identical)

| Path | Kyun |
|---|---|
| **`haseeb-autos/APPLICATION-WIDE-SPEC.md`** | project root — sab se aasan jagah (README se bhi link) |
| `haseeb-autos/specs/APPLICATION-WIDE-SPEC.md` | canonical (code/docs yahi reference karte hain) |
| `/home/user/Application-Wide Performance, Dynamic UI, Shared Logic, AI Agent — Application-Wide Engineering, Performance.md` | workspace root, **asli naam** |
| `/home/user/APPLICATION-WIDE-SPEC.md` | root chhota naam |
| `/home/user/uploads/…Performance.txt` + `…Performance.md` | aap ke asli uploads (2 dafa) |

md5 (sab): `69b50b821565d1654d2e3bed82f10e9c` · 1540 lines · 25,539 characters · mapping: `specs/README.md`

---

## 3b ▸ GitHub (NextOffice360/HaseebAutosERP-OLD-2.25.6)

Poora project (395 files · v2.29.0) **commit ho chuka hai** — `main` branch tayyar hai. Push ke liye GitHub
authentication chahiye (token sandbox mein nahi hota).

```bash
# A) Agent ke sath (token sirf is command mein use hota hai, save nahi hota):
GITHUB_TOKEN=ghp_xxx  bash tools/git_push.sh

# B) Apni machine par, token apne paas rakh kar — release zip download kar ke:
unzip haseeb-autos-v2.29.0.zip -d haseeb-autos && cd haseeb-autos
git init -b main && git add -A && git commit -m "Haseeb Autos ERP v2.29.0"
git remote add origin https://github.com/NextOffice360/HaseebAutosERP-OLD-2.25.6.git
git push -u origin main
```

**Bundles:** `bash tools/git_push.sh --bundle` ek downloadable `release/haseeb-autos-vX.Y.Z.bundle`
(poori history ke sath) bana deta hai — jab chahein. Filhal bundle working tree se hata diya gaya hai
(workspace snapshot cap ke andar rehne ke liye); 1 second mein dobara ban jata hai.

Token: GitHub ▸ Settings ▸ Developer settings ▸ Personal access tokens ▸ **repo** scope
(fine-grained token mein: **Contents = Read and write**).

**Note:** `.git/config` platform snapshot se **excluded** hota hai — is liye naye session mein identity/remote
gayab lag sakte hain (commit objects mehfooz rehte hain). `bash tools/bootstrap.sh` un ko khud restore kar deta hai.

## 4 ▸ Roz-marra ke commands

```bash
# ek gate (chhota, tez)
node tools/test_field_visibility.js            # W5 — 52 checks, ~2s
node tools/test_dyn_deps.js                    # W3 — 51 checks
node tools/test_pwa_shared.js                  # W3.T4 — 16 checks

# full suite — SIRF version tag par, ek waqt mein, background/foreground with log
env -u HOME bash tools/verify.sh > tmp/verifyXXX.log 2>&1 ; tail -30 tmp/verifyXXX.log

# release
bash tools/package.sh 2.29.0                   # naya version zip
```

**Traps jo yaad rakhein:** ek waqt mein sirf ek verify · browser gates se pehle demo server (8021) chale ·
`env -u HOME` verify ke sath · `python3 tools/build_demo.py` + `build_pwa_demo.py` har apps-script edit ke baad ·
JS source mein emoji literal na rakhein · `.gs`/`<script>` patches assert-guarded script se + `node --check`.

---

## 5 ▸ Ab tak kya ship hua (waves)

| Wave | Kya | Version | Gate |
|---|---|---|---|
| W1–W2 | performance core, error/retry policy, UI run/err | v2.25.x | `perf-batch` · `ui-run` · `ui-err` |
| W7 | N+1 khatam (mass requests) | v2.26.0 | `perf-batch` 34/0 |
| Hardening | PWA pay/receipt stale-node + pay-ledger gate | v2.27.0 | `pay-ledger` 48/0 |
| **W3** | dynamic/data-aware UI (`Deps`) + `Shared` accessors + PWA parity | v2.27.0 | `dyn-deps` 51/0 · `pwa-shared` 16/0 |
| **W5** | global field visibility & permissions (backend-enforced) | v2.28.0 | `fields` 52/0 |
| **W4** | **global date/time/timestamp system (settings-driven)** | **v2.29.0** | **`datetime` 44/0** |
| W6 · W9/W13 · W10 · W11/W12 | aage (A§18 order) | — | — |

Tafseel: `TODO-PERF-SHARED-UI.md` (chal raha kaam + shipped blocks) · `MASTER-REQUIREMENTS.md` (18+16 sections → waves)

---

## 7 ▸ Workspace cap (data-loss ka asli sabab)

Platform turn-end snapshot **~128 MB (+ ~10,000 files)** par best-effort capped hai. 2026-09-24 par workspace
**255 MB** ho gaya tha (12 purane zips 65 MB + 47 MB bundle + `.git` 48 MB) → isi liye files truncate hone ka khatra tha.

**Kya kiya:** `release/archive/` ke 10 purane zips (v2.25.2–v2.25.11) **working tree se** hata diye —
**zero data loss**, kyunke wo sab `.git` history (commit `9b41980`) ke andar mehfooz hain.
Wapas laane ke liye: `git checkout HEAD -- release/archive/<filename>`. Record: `release/archive/REMOVED.txt`.
Workspace ab **108 MB** — cap ke andar (headroom ~20 MB).

Nayi cheez add karne se pehle: `bash tools/workspace_guard.sh` (aur `--prune` / `--prune-archives`).

---

## 8. Push help tools (2026-09-24, sandbox-side)

- `tools/connect_dashboard.py` (port **8034**) — GitHub device-code worker: code generate karta hai, har 2s par poll, approve hote hi **khud `git push`** karta hai; code expire ho to naya code khud banata hai. Endpoints: `/status`, `/list`, `/upload`.
- `tools/control_center.py` (port **8035**) — ek page = status proxy + live code + QR (`/qr.png`) + upload inbox + downloads (`/download/bundle`, `/download/zip`). 8034 se server-side proxy (CORS-free).
- `tools/upload_inbox_server.py` (port **8033**) — standalone drag&drop upload (root + project `uploads/`).
- `PUSH-NOW.html` — user ke liye 3-step card (code + QR + backup links).
- Temporary mirrors (72h, litterbox): bundle `https://litter.catbox.moe/npagtq.bundle` · zip `https://litter.catbox.moe/k00n3r.zip` (regenerate: `git bundle create /tmp/x.bundle --all`).
- **Preview proxy requires `e2b-traffic-access-token`** → sirf LIVE PREVIEW panel se reach hota hai; raw URL normal browser mein 403 deta hai. Is liye user ko plain-text URL/QR dena behtar hai.
- Credentials: sandbox mein koi GitHub credential nahi (no gh, no token, no .netrc). Deploy key staged at `~/.ssh/haseeb_deploy` (public key user ne add ki to SSH push chal jayega).
