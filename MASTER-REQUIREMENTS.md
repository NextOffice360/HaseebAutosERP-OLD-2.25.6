# MASTER REQUIREMENTS REGISTRY — Haseeb Autos

**Banaya:** 2026-09-24 · **Sources:** (A) `uploads/Application-Wide Performance, Dynamic UI, Shared Logic, AI Agent …md`
(18 sections + FINAL AGENT RULE) · (B) `uploads/New-Requirenment need to concider.md` (16 sections)
· (C) 6-point consolidated spec (2026-09-23) · (D) 16-point performance/shared-UI spec (2026-09-24)
· (E) standing user constraints (har version).

> **Rule:** koi bhi requirement "done" tab tak nahi likhi jati jab tak uska **gate + rendered evidence** na ho.
> Har naye TODO se pehle relevant attachment parhna lazmi hai → **`ATTACHMENTS-INDEX.md`**.

---

## 1 ▸ Standing process rules (A §1–3, §14–18 · E)

| # | Requirement (source) | Implementation | Status |
|---|---|---|---|
| P1 | **Inspect first, root cause, no guessing** (A§1, A§16) | Har wave audit se shuru; `tmp/*` probes; root cause likhna | ✅ ongoing (W1 audit, E1–E11) |
| P2 | **Reuse existing architecture, no duplicate systems** (A§1.3–4) | Shared cores: `API.call`/`UI.run`/`UI.errBox`, PWA `PWA.run` — page-specific patches hata diye | ✅ v2.25.9–11 |
| P3 | **Official docs first, record links** (A§2) | `docs/` folder + in-app help links (task **W9.T2**) | 🟡 partial (task bana diya) |
| P4 | **Beginner-friendly documentation** (A§3): what/why/setup/config/env/permissions/testing/deploy/troubleshoot/rollback + official links, **no secrets** | Task **W11** (docs pack: GAS, Sheets, AI providers, deploy, rollback) | 🟡 planned |
| P5 | **Test everything: normal/empty/large/slow/fail/timeout/retry/duplicate/permissions/roles/scopes/dependent/mobile/sidebar/local/prod** (A§17) | Task **W10** (testing matrix gates) — duplicate ✅(ui-run), fail/retry ✅(ui-err), timeout ✅, large ✅(scale) | 🟡 partial |
| P6 | **Naming & architecture consistency** (A§14) | Task **W8** (naming audit + conventions doc) | 🟡 planned |
| P7 | **Stale-node visibility (PWA parity)** — desktop ka `UI2.dismissTop` sabak PWA par bhi (user hardening demand 2026-09-24) | `PWA.layerVisible/layerReport/sweepStale` (Pwa_Shell) + `posTopLayer()` open AND visible; pay-ledger gate ka Section G | ✅ done (pay-ledger 48/0, pwa-overlays 124/0; pre-fix negative proof mojood) |
| P7 | **No hardcoded secrets; env/config management** (A§15) | Task **W12** (config/env + rollback docs; secret scan gate) | 🟡 planned |
| P8 | **Priority order:** audit → perf → data-aware UI → visibility/permissions → datetime → sidebar → apply everywhere → UX/help → test → document (A§18) | Wave order neeche `## 3` mein set kiya gaya | ✅ set |
| P9 | **FINAL AGENT RULE:** plan pehle (architecture, files, root causes, missing shared logic, deps, docs needed, reusable solution, risks, test plan) | Har wave ke shuru mein short plan → phir code | ✅ practice (audit blocks) |
| P10 | **Read the attached file before starting a todo** (user, 2026-09-24) | `ATTACHMENTS-INDEX.md` + har wave ke shuru mein relevant file | ✅ is round se |

## 2 ▸ Functional requirements → waves

### Wave list (v2.25.9 → v2.26.x)

| Wave | Kya | Requirements (source) | Status |
|---|---|---|---|
| **W1** | Perf audit + instrumentation (E1–E11) | A§4 audit, D | ✅ v2.25.8 |
| **W2** | Shared fetch core · busy UI · error/retry | A§4 required UX, D | ✅ v2.25.9/10/11 (gates `api-core` 16/0, `ui-run` 34/0, `ui-err` 30/0) |
| **W7** | **Perf apply: call-sites → `API.parallel`, backend N+1, batch writes** | A§4 (N+1, duplicate requests, blocking ops, large payloads), B§1, B§15 | ✅ **v2.26.0** (gate `perf-batch` 34/0; 24 req → 1) |
| **W3** | Dynamic data-aware UI (field→value→dependency→data→UI) | A§5–7, B§7, D | ✅ **SHIPPED v2.27.0** — `Deps` core · T1 shared item search · T2 AI Setup cascade · T3 **`Shared` accessors 12 modules** · T4 **PWA parity** (`PWA.shared` + offline contract) — gates `dyn-deps` **51/0** (SENS 20/31) + `pwa-shared` **16/0**; full suite **65/65 GREEN** |
| **W5** | Field visibility/permissions **backend-enforced** | A§9, B§1, E | ✅ **SHIPPED v2.28.0** — `Fields.gs` (6 families · wrap/scrub · kill-switch) + `Code.gs ▸ api()` single point + `UI2.table/form` family filter + PWA parity — gate **`fields` 52/0** (rendered DOM + write-guard + cache-mutation regression); full suite **66/66 GREEN** |
| **W4** | Global date/time/timestamp system | A§8, D | ✅ **SHIPPED v2.29.0** — `U.disp/stamp` + `DT` layer + `UI2.stampRow` + 6 naye `dt.*` settings — gate **`datetime` 44/0** (FE↔BE parity 100 combos + rendered DOM) |
| **W6** | Sidebar responsive states (Expanded → Partially Collapsed → Off-canvas) | A§10, D, E | ✅ **v2.29.1** — responsive matrix 1440/1280/1024/768/390 × light+dark: 0 overflow, taps ≥48, text ≥10.8px, laptop (1024) par collapse available; gate **`sidebar-states` 52/0** |
| **W9** | UX polish: design-system components (loading/empty/error/retry/validation/tooltip/help/confirm/notify/table/filter/pagination/button/dropdown/modal/nav), self-descriptive field hints, **in-app official doc links** | A§11–13, B§1, B§16 | ⏳ |
| **W10** | Full testing matrix + evidence | A§17, B§16 | ⏳ (partial gates mojood) |
| **W8** | Naming/architecture consistency audit | A§14 | ⏳ |
| **W11** | Beginner docs pack (per integration: setup→rollback) | A§3 | ⏳ |
| **W12** | Deploy/config/rollback docs + secret scan + local↔prod parity | A§15, B§16 | ⏳ |

### Attachment B (16 sections) → mapping

| B# | Requirement | Wave |
|---|---|---|
| 1 | Global UI/UX + performance (typography/spacing/overflow, responsive, optimized GAS/Sheets, no flicker, loading states, toasts/banner/tooltip, wide modals) | W7 + W9 (+ W1/W2 done) |
| 2 | **State persistence: save/update/delete ke baad same page/tab/sub-tab/section par rahein** | W7.T4 (naya) |
| 3 | Financial display: "Rs. 20.67 Lakhs", "Rs. 1.03 Crore (Rs. 10,328,802)" — ambiguous `20.67 L` nahi | W9.T3 (naya) |
| 4 | Charts/cards collisions (e.g. `Rs. 2,500 / Rs. 2,828`), table header/row alignment + responsive | W9.T3 |
| 5 | Sales/credit/invoice logic: Paid Now = cash; credit-limit ke andar sale without payment; Cash Paid/Current Due/Previous/Closing balance clear | W13 (naya module wave) |
| 6 | Products quick view (category after code, image enlarge, quick view info, favorites badge) | W13 |
| 7 | Product selection: multi-select checkboxes + qty, dropdown open until outside click, list icon, auto-fetch | W3.T3 (bulk picker) + W13 |
| 8 | PO/GRN/inventory: real supplier lists, retail/wholesale/purchase price, conversion unit auto-calc (1 BOX = 12 PCS → Rs 3,000) | W13 |
| 9 | Auto reorder + AI monitoring on **real** data | W13 |
| 10 | AI agent config: provider/model lists (Gemini/OpenAI/OpenRouter/Ollama/Mock), dynamic model discovery, key save, test, status, presets, real execution | W3.T2 (provider-dependent form) + W13 |
| 11 | Customer/supplier history + totals + price-variation signals (real data only) | W13 |
| 12 | Salesman stock labels (ISSUE/RETURN), routes, Udhaar Wasooli live balances/history | W13 |
| 13 | Rename "Insights & Shop" → "Insights & Dashboards" + real KPIs | W13 |
| 14 | Automation/AI bottom bar redesign (clean, aligned, functional) | W9 |
| 15 | **Backend wiring audit: har tab/button/field/calc/API/Sheet write traced; no mock pretending** | W7.T5 |
| 16 | Final QA + regression + ZIP verify | Har version (`package.sh` + verify.sh 62 gates) |

## 3 ▸ Formal priority order (A§18 ke mutabiq, hmaray wave numbers ke sath)

1. Audit architecture ✅ (W1)
2. Root causes + missing shared systems ✅ (W1/W2 audit)
3. **Performance / request handling → W7 (ab)**
4. Global data-aware UI → W3
5. Global permissions / field visibility → **W5 ✔ (v2.28.0)**
6. Date/time/timestamp → **W4 ✔ (v2.29.0)**
7. Sidebar/responsive nav → W6
8. Apply shared systems across modules → W9 + W13
9. UX/help/tooltips/doc links → W9
10. Test local + deployed → W10
11. Document implementation/config/deploy/troubleshoot → W11/W12

## 4 ▸ Har wave ka plan template (FINAL AGENT RULE)

```
## W<k> plan
1. Existing architecture  : <files/functions jo chhu rahe hain>
2. Current behaviour      : <measured — numbers/screenshots>
3. Root cause             : <verified, guess nahi>
4. Missing shared logic   : <kya central banana hai>
5. Dependencies/official docs : <links>
6. Reusable solution      : <ek hi jagah, phir call-sites>
7. Risks                  : <kya toot sakta hai>
8. Test plan              : <gate + sensitivity + regression gates>
```

## 5 ▸ Evidence trail (is waqt tak)

| Version | Wave | Gate(s) | Verify |
|---|---|---|---|
| v2.25.8 | W1 + W6 (sidebar icon-only) | `sidebar-states` 19/0, `api-instrument` 14/0 | 58/58 green |
| v2.25.9 | W2.T1 shared fetch core + session guard | `api-core` 16/0, `session-guard` 15/0 | 60/60 green (1193s) |
| v2.25.10 | W2.T2 action-level busy | `ui-run` 34/0 | 61/61 green (1187s) |
| v2.25.11 | W2.T3 error/retry policy | `ui-err` 30/0 | 62/62 green (1195s) |
| v2.26.0 | **W7 perf apply** | `perf-batch` 34/0 + audit tool (N+1 = 0) | ✅ 63/63 green (1227s) |

# 6 ▸ Attachment A — Part 2 (companion detail) → TASK LEVEL

Attachment A do hisson mein hai: **Part 1** = 18 numbered sections + FINAL AGENT RULE (upar `## 2`),
**Part 2** (lines 519–1540) = wahi cheezein tafseel se + kaam ki listein jo Part 1 mein summary thi
(**"Problems observed"**, **"Look for:" 12-item audit**, **field-visibility list**, **device verify list**).
Neeche har item ka **status + evidence** hai.

## 6.1 Aap ki apni "most important immediate issues" list (Final Requirement, ~line 1493)

| # | Issue (aap ke lafz) | Status | Evidence |
|---|---|---|---|
| 1 | Extremely slow data fetching + UI response | 🟢 W1/W2/W7 | audit tool + `api-instrument` 14/0 + `perf-batch` (24 req → 1) |
| 2 | Missing action-specific loading/progress | ✅ W2.T2 | `ui-run` 34/0 (button-level spinner, elapsed, min-busy, timeout) |
| 3 | Request hanging + "Retry Again", user ko pata na chale | ✅ W2.T3 | `ui-err` 30/0 (7 kinds, retry sirf jaiz) + `timeouts` 32/0 |
| 4 | Missing app-wide **dynamic / data-aware** field & UI logic | ⏭ **W3 (ab)** | gate `tools/test_dyn_deps.js` |
| 5 | Missing configurable timestamps / time display | ✅ W4 (v2.29.0) | `datetime` gate 44/0 |
| 6 | Missing global field/data **visibility** controls | ✅ W5 (v2.28.0) | `Fields.gs` + gate `fields` 52/0 |
| 7 | Role/scope protection of cost price + customer info (**backend**) | ⏳ W5 | backend/API level par, CSS sirf nahi |
| 8 | Sidebar collapse/expand incorrect | ✅ W6 | v2.25.8 icon-only ✔ · v2.29.1 par matrix verify ✔ (gate 52/0) |
| 9 | Desktop partial-collapse = icons **only** (no text) | ✅ W6 | gate assert (rail + hover par bhi icons-only) |
| 10 | Off-canvas sidebar proper show/hide | ✅ W6 | ☰/scrim/Esc + persistence gate mein ✔ |

## 6.2 "Loading UX requirements" (line 635) — 9 shartein

| Requirement | Status |
|---|---|
| Button-specific loading state | ✅ `ui-run` |
| Spinner / progress indicator | ✅ `ui-run` |
| Button visually indicates processing | ✅ `ui-run` |
| Duplicate submissions blocked | ✅ `ui-run` (`blocked` stat) |
| Success **aur** error state | ✅ `ui-run` (✓/✖ flash + errBox) |
| Retry **sirf** jab munasib | ✅ `ui-err` (validation/auth par retry nahi) |
| Long ops → meaningful progress/status | ✅ `ui-run` (elapsed + 20s baad "chal raha hai…") |
| User ko "frozen vs processing" ka shak na ho | ✅ `ui-run` + `ui-err` |
| Loading **action-specific** (app-wide spinner nahi) | ✅ `ui-run` |

## 6.3 "Look for:" 12-item audit (line 889) → **W3.T0** (yeh chalna hai)

| # | Item | Kaise naapenge |
|---|---|---|
| 1 | Duplicate implementations | ek hi behaviour kai jagah (dropdown cascade, validation) |
| 2 | Hard-coded dropdown behaviour | option list source code mein likhi ho |
| 3 | Hard-coded conditional fields | `if (x === 'GEMINI')` jaisi branches |
| 4 | Repeated API calls | per-open/per-keystroke duplicate calls |
| 5 | Repeated data-fetching logic | same route kai files mein |
| 6 | Fields jo parent selection par react nahi karte | parent→child wiring |
| 7 | Sections jo dynamically appear/hide hone chahiye | empty data par bhi dikhne wale sections |
| 8 | Tables jo related data badalne par update nahi hote | save/delete ke baad refresh |
| 9 | Forms jo dependent fields populate nahi karte | Country→City, category→subcategory |
| 10 | Inconsistent validation | per-screen ad-hoc checks vs shared validator |
| 11 | Inconsistent loading states | purane `innerHTML='Loading…'` call-sites |
| 12 | Same logic different implementations | 3 tarah ke search/filter |

## 6.4 Dynamic provider/configuration forms (line 799) → **W3.T2**

Provider badalne par: **Gemini-specific model options · parameters · settings · other fields** —
irrelevant settings **hide/remove**, nayi provider ki settings **load**, validation **sahi** lagi,
purani values ka **preserve/manage**. **Ek reusable dependency system** — per-dropdown hard-coded nahi.
(`App_AIConfig.html` + Attachment B§10.)

## 6.5 Global date/time (line 955/997) → **W4**

Records par: **created/updated timestamps** · display `Created: 23 Sep 2026, 10:42:31` /
`Updated: 23 Sep 2026, 11:18:07` · global config: format, **12/24h**, **seconds**, **timezone**,
har record par **visible ON/OFF** toggle.

## 6.6 Visibility (line 1049/1137) → **W5**

**Modules:** POS · GRN · Purchase Orders · Sales Orders · Invoices · Customers · Products · Suppliers (+baqi).
**Fields:** cost price · selling price · margin/profit · customer contact details · customer data ·
supplier information · internal notes · financial information (+baqi sensitive).
**Rules:** `Role → Module → Section → Field → Visibility/Permission` **+**
`Scope → Location/Branch/Warehouse/Org → Data Visibility`.
**Zaroori:** "not merely visually hidden with CSS" → **backend/API** level par bhi protect.

## 6.7 Sidebar (line 1185) → **W6**

Desktop: Expanded = **icon + text**, Partially collapsed = **icon only** (width bhi kamre) ·
Devices: desktop/laptop/tablet/mobile + **off-canvas** clear show/hide/expand controls jo desktop states se
takra na lagayen · **State persistence** (navigation ke baad wahi state).

## 6.8 Priority 4 — Verify (line 1441) → **W10 matrix**

Local · self-hosted · desktop · laptop · tablet/mobile · different roles/scopes · large datasets ·
dropdowns with many options · forms with dependent fields · slow/failed API requests.
