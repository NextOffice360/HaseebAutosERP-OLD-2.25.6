# Haseeb Autos — v2.29.1 CHANGELOG

**Date:** 2026-09-24 · **Version:** `2.29.1` (Utils.gs ▸ `AppConfig.VERSION`)
**Base:** v2.29.0 (W4 date/time) → is build mein **W6.T3: SIDEBAR RESPONSIVE MATRIX poori** (spec A§10 + req 13) aur **verify.sh ka false-green bug fix**.

**Full verification:** `env -u HOME bash tools/verify.sh` → `tmp/verify291.log` · gate `sidebar-states` **19 → 52** assertions.

---

## 1 ▸ Aap ki requirement
> *"Sidebar responsive (desktop/laptop/tablet/small)"* — req **13** — 1440 / 1280 / 1024 / 768 / 390 par layout theek rahe,
> aur poore app ke qawaid: **tap ≥48px**, **text ≥10.8px**, **0 layout problems** (light + dark).

## 2 ▸ AUDIT pehle (`tools/audit_sidebar_matrix.js` — naya, read-only)
10 combos (5 width × 2 theme) + rail-state rows par asli numbers (rendered DOM, computed styles):

| Width | Mode (pehle) | minFont (pehle) | ⇤ rail btn (pehle) | Overflow |
|---|---|---|---|---|
| 1440 / 1280 | expanded, 256px | **10.2** ❌ | 38×38 ❌ | 0 |
| 1024 | expanded, 256px | **10.2** ❌ | **hidden** ❌ (laptop par collapse hi nahi) | 0 |
| 768 / 390 | off-canvas | **10.2** ❌ | — (☰ 38×38 ❌) | 0 |
| rail @1440/1280/1024 | rail, 64px, labels 0 | 12 | 38×38 ❌ | 0 |

**Root causes:** (a) `.sb-name span` 10.5px + `.sb-user-meta em` 10.2px — 10.8px floor se neeche;
(b) `.sb-collapse` 28px aur `.icon-btn` 38px — 48px tap rule se neeche;
(c) `@media (max-width:1024px){ .sb-rail{display:none} }` — 1024px laptop par collapse control ghayab.

## 3 ▸ FIX (sab **shared CSS** — `apps-script/Styles.html`; koi page-specific patch nahi)

| # | Fix | Pehle → Baad |
|---|---|---|
| 1 | `.sb-name span` (branch) | 10.5px → **11px** |
| 2 | `.sb-user-meta em` (role) | 10.2px → **11px** |
| 3 | `.sb-collapse` (sidebar header « ) | 28×28 → **48×48** (glyph 14px wahi) |
| 4 | `.icon-btn.sb-toggle` / `.icon-btn.sb-rail` (☰ / ⇤) | 38×38 → **48×48** |
| 5 | ⇤ rail breakpoint | `max-width:1024px` → **900px** (ab **poora desktop 901+** collapse kar sakta hai) |
| 6 | mobile topbar dense icons (≤560px) | 34×34 visual + **48×48 HIT area** (`::after` overlay — layout nahi hilti) |
| 7 | `.sb-user` (footer user button) | min-height **48px** |

## 4 ▸ GATE (permanent proof — `tools/test_sidebar_states.js`)
- Pehle: **19/0** · Ab: **52/0** (~37s) — naye **T6.3 matrix asserts**:
  har combo (5 width × 2 theme) par → `mode` sahi · **0 horizontal overflow** · taps ≥48 (nav + user + ☰/⇤) · sidebar text **≥10.8px**;
  plus **1024 par ⇤ available** aur **rail@1280/1024** icons-only + 0 overflow.
- Regression: `bash tools/verify.sh layout` → **5/5 gates green** (`layout-desktop` · `layout-mobile` · `layout-dark` · `layout-overlays` · `layout-overlays-m`, 189s).

## 5 ▸ Tools fix — `verify.sh` ka **false green** (`tools/verify.sh`)
Filter mein aisa naam dene par jo kisi gate se match na kare, script **0 gate chala kar bhi "ALL GATES GREEN"**
print kar deti thi (yani jhooti tasdeeq). Ab:
- **prefix matching** — `bash tools/verify.sh layout` → layout-* saare gates chalte hain;
- **0-gate guard** — koi gate match na ho to **exit 2** aur saaf message: `✖ 0 gates match: <names>`.

## 6 ▸ Kya nahi badla
Koi feature hata nahi · koi page-specific patch nahi · rail/off-canvas behaviour (T6.1/T6.2/T6.4) waisa hi —
sirf sizes/breakpoint/pixels. Sidebar ki shakal visual tor par wahi hai (48px buttons thore bare hit-box ke sath).

---
**Evidence:** `tmp/verify291.log` (full suite) · `tools/audit_sidebar_matrix.js` (audit) · gate output `sidebar-states 52/0`
