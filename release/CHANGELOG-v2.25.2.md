# Haseeb Autos — v2.25.2 CHANGELOG

**Date:** 2026-09-23 · **Version:** `2.25.2` (Utils.gs ▸ `VERSION`)
**Base:** v2.25.1 (6-point ERP/POS audit + legacy cleanup) → ye build **audit-driven hardening** hai:
aap ki purani shikayat ("cancel button, close button not working in many popups") ka **asli root cause**
mil gaya + uska permanent gate, aur PO/GRN scan ka POS ke sath **identity proof**.

---

## 1 ▸ ROOT-CAUSE FIX — "close/cancel kaam nahi karta" (req 6) — ✅

**Asli wajah (deep debug ke baad):** `UI2.dismissTop()` (Esc ka global handler) sab se pehle DOM mein
koi bhi `.f-search-results`/`.gs-results` (jo `hidden` attribute ke bagair pada ho) ya koi bhi
`.img-lightbox` dismiss kar deta tha — **chahe wo invisible / stale ho**. Agar kisi wajah se ek
orphan node DOM mein reh jaye, to har Esc hamesha usi ko "handle" karta rehta tha aur
**modal/drawer kabhi band nahi hota tha**. Ye exactly wahi class ka bug hai jo aap ne report kiya.

**Fix (shared logic, kisi ek screen ka patch nahi):**
* `UI2._visible(el)` — `hidden` ke ilawa **asli layout** dekhta hai (`getClientRects()` + computed
  `display/visibility/opacity`), aur `position:fixed` elements ke liye bhi sahi jawab deta hai
  (unka `offsetParent` null hota hai).
* `dismissTop()` ab sirf **visible** list / lightbox dismiss karta hai; invisible/stale node
  Esc ko shadow nahi kar sakta.
* Esc chain defensive: `dismissTop()` kabhi throw kar ke poora keyboard handler na torey.

**Sensitivity proof (guess nahi):** purana `dismissTop` wapas laga kar bug dobara banaya gaya —
Esc ne modal **band nahi kiya**; naya code usi halat mein **band karta hai**. Ye check ab
permanent gate mein hai (`modals-close` **84 PASS / 0 FAIL**, 2 naye regression checks ke sath).

## 2 ▸ Naya gate 54 — `scan-parity`: PO/GRN scan = bilkul wahi POS system (req 1) — ✅ 29/0

Teen pickers (POS, New PO, GRN) par **asli hardware-scanner payload** (tez keys + Enter):

| Kya prove hua | Nateeja |
|---|---|
| Code identity | PO + GRN wahi `UI2.itemPicker` / `UI2.bulkAddModal` / `UI2.attachScan` use karte hain; PO/GRN file mein koi native dialog ya purana bespoke scan widget nahi |
| Rendered identity | Teenon ka **DOM ek hi component** — `.ipk` ke bachche bilkul identical, wahi scan placeholder, wahi 📋 poori-list button, wahi Bulk List box + add bar, wahi footer commit+Cancel. Host by design: POS = `.modal2`, PO/GRN = `.drawer` |
| Behaviour | scan → Found → **Added** → field **CLEAR** → ready (dropdown hijack nahi) · duplicate scan = **qty bump** (nayi line nahi) · dusra code purane ko **append nahi** karta · ghalat code = warn + field clear + koi line nahi · kabhi file dialog nahi |

## 3 ▸ Labels gate 11/0 → 16/0 (req 5): sheet sizes + edge items — ✅

* **A4 sheet (24 labels)** aur **A5 sheet (12 labels)**: koi element apne label frame se bahar nahi,
  kuch clip nahi, labels ek doosre par nahi chadhte, `@page` CSS sahi (A4/A5 portrait, 8mm margin),
  aur label apna **50mm size** hi rakhta hai (stretch nahi hota — preview jaisa).
* **Barcode-bina item**: label phir bhi banta hai, code human-readable line mein aata hai, 0 overflow.
* **Bohat lamba product naam**: text frame ke andar rehta hai (0 overflow / 0 clip).

## 4 ▸ QA harness flake-proof + tooling fix — ✅

* `modals-close`: fixed `sleep()` ki jagah **state ka intezaar** (`waitForFunction` — overlay khula/band
  hone tak) + on-page **Esc counter** diagnostic (key page tak pohnchi ya nahi, ye evidence ban gaya)।
* `scan-parity`: `elementHandle.type()` (khud focus karta hai) + typing ke baad **payload verify** +
  retry; attempts/diagnostics report mein nazar aate hain (chhupte nahi). Yehi cheez load wale
  full-run mein jhooti failure de rahi thi.
* `tools/verify.sh --list` (akela) `set -u` ki wajah se crash hota tha → fix (`nxt="${ARGS[$((i+1))]:-}"`).

## Verification (is build ka)

`env -u HOME bash tools/verify.sh` → **ALL 54 GATES GREEN (1044s)** · log `tmp/verify252.log`
Is run mein: `scan-parity` 29/0 · `modals-close` 84/0 · `labels-live` 16/0 · `grn-drawer` 23/0 ·
`demands` 13/0 · `salesman-stock` 10/0 · `smoke` 332/0 · `scan-coverage` 21/0 · `ui-polish` 62/0 ·
`typography` 0 problems · layout 0 problems (1440/390/dark/overlays ×2/PWA ×2)।
Checklist: `release/REQUIREMENTS-CHECKLIST-v2.25.2.md` · Rendered evidence: `release/shots-v2.25.2/`

## User-side checks (device / deployed backend)

* Physical scanner drill (Zx10) + chhape hue label ka paper par read-back.
* Live GAS + Drive image upload test.
* Deployed `F2` shortcut check on a keyed device.
