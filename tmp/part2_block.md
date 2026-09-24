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
| 5 | Missing configurable timestamps / time display | ⏳ W4 | — |
| 6 | Missing global field/data **visibility** controls | ⏳ W5 | — |
| 7 | Role/scope protection of cost price + customer info (**backend**) | ⏳ W5 | backend/API level par, CSS sirf nahi |
| 8 | Sidebar collapse/expand incorrect | 🟡 W6 | v2.25.8 icon-only ✔; partial-collapse + persist verify baaqi (`sidebar-states` 19/0) |
| 9 | Desktop partial-collapse = icons **only** (no text) | 🟡 W6 | gate isi par; screenshots se confirm |
| 10 | Off-canvas sidebar proper show/hide | 🟡 W6 | controls + persistence baaqi |

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
