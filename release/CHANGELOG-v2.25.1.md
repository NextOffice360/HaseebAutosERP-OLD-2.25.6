# Haseeb Autos — v2.25.1 CHANGELOG

**Date:** 2026-09-23 · **Version:** `2.25.1` (Utils.gs ▸ `VERSION`)
**Base:** v2.25.0 (poora 6-point ERP/POS audit) + **legacy/dead-code cleanup**.

---

## What changed ab v2.25.0 ke baad

### 1 ▸ Dead CSS / legacy styles hata diye (req 6 ka "remove legacy") — ✅
`Styles.html` mein **56 classes** aisi thin jo app ke kisi bhi partial, tool ya PWA shell mein
**kahin use nahi hoti thin** (purane POS cart, AI panel, PO-suggest, migration aur
early-iteration leftovers). **50 rules** hataye — `172,892 → 168,075` bytes, braces balanced,
aur jo cheez tests assert karte hain (`tabbar-l3` etc.) wo barqarar rakhi gayi.

Hataye gaye blocks (namoona): `cart-head/cart-close/cart-list`, `pos-card/pos-left/pos-results/
pos-searchbox/pp-scale`, `ai-actions/ai-answer/ai-hint/ai-meta/ai-note/ai-pill/ai-presets/ai-tools/
aiconfig`, `po-pick-head/po-suggest-card/pl-sub-row`, `kpi-ring-row/kpi-ring-item`,
`offline-pill/migrate/sheets_ok/dot-live`, `tbl-th/tbl-wrap/tabbbar/tabbar-l4`,
`pimg/prod-img/pc-ph/item-img`, `f-switch-row/sec-grid/sec-sep/sec-sub/form-actions/gap-tight/span2` waghera.

### 2 ▸ Uske badle: koi bhi screen tooti nahi (verified) — ✅
| Gate | Result |
|---|---|
| `audit_typography` | **0 problems** |
| `audit_align` | 35 checks, **0 failed** |
| `audit_tabs` | 656 checks, **0 failed** |
| `ui_audit` (all screens, jsdom) | **0 problems / 0 errors** |
| `test_ui_polish` (rendered design system) | **62 PASS / 0 FAIL** |
| `check.sh` (partial leak) | 30 partials ✔ |

### 3 ▸ Yad-dehani: 2.25.0 mein jo fix hua (is build mein shamil hai)
* **Switch CSS root-cause fix:** `.field label{display:block…}` ki specificity `.switch` se zyada thi →
  field ke andar har switch toot jata tha (track 0px, knob apne label ke harf par). Ab `inline-flex`
  + block track. (`GRN ▸ On credit / Update item cost`, PO form, Settings — sab theek.)
* **GRN title live update:** PO load karne par drawer title bhi `— PO PO-SDQ-01001` ho jata hai
  (pehle "Direct Purchase" hi reh jata tha).
* Full suite dono builds par **ALL GATES GREEN** — is build ke logs rotate ho gaye — current: `tmp/verify253.log` (v2.25.3, 55 gates green).

### 4 ▸ QA harness — user ki purani shikayat ab PERMANENT gate hai — ✅
User ne dobara likha: *"cancel button, close button not working in many popups, and modal windows"*.
Sirf code fix kaafi nahi — is liye ek naya permanent gate bana:

* **Gate 53 `modals-close` (82 PASS / 0 FAIL)** — asli Chromium mein har overlay par **teen
  closer alag alag** test hote hain: **✕**, **Escape** aur footer ka **Cancel/Close**:
  generic `UI2.modal`, legacy `UI.modal`, offcanvas, POS bulk-add modal, Alerts panel,
  Label print modal, Item new form, GRN drawer, New PO, New Item, Demand create,
  Adjustment, Transfer, New Stock Issue drawer. Har modal ke footer mein close ka raasta
  mojood hai ya nahi — wo bhi check hota hai. Background scrim click soft-check hai
  (sticky modals by design allowed). Zero page errors.
* **Flaky-proof banaya gaya:** full verify mein machine load hoti hai, is liye fixed `sleep()`
  ki jagah ab **state ka intezaar** (`waitForFunction` — overlay khula/band hone tak).
  Standalone 3/3 runs green, aur salesman gate ke sath **parallel load** mein bhi 82/0.
* **Demands gate 11/0 → 13/0:** naye checks — (a) row ka **Status** action → modal
  `Change status — {demandNo}` → select (SOURCED…CANCELLED, current minus) → **Update** →
  modal band + toast `Updated ✅` + row par naya status; (b) **walk-in customer** (catalog
  pick ke bagair naam) + product pick → demand save (list +1).
  *(Pehle jo "fail" lag raha tha wo test ki ghalat scoping thi — `.field` poori section
  wrap karti hai, is liye customer ka dropdown click ho jata tha; ab picker ka apna scope
  dhoonda jata hai aur `#f_itemCode` = `FL00000` se pick prove hota hai.)*
* **Salesman gate 9/0 → 10/0:** aathon tabs ka sweep (rows ya saaf empty-state; blank tab = fail).

## Verification (is build ka)

`env -u HOME bash tools/verify.sh` → **ALL GATES GREEN (53 gates, 1007s)** · log `tmp/verify251c.log`
Rendered evidence: `release/shots-v2.25.1/` (9 PNGs) · Checklist: `release/REQUIREMENTS-CHECKLIST-v2.25.1.md`

## User-side checks (device/deployed backend)

* Physical scanner drill (Zx10) + real paper par label read-back.
* Live GAS + Drive image upload test.
* Deployed `F2` shortcut check on a keyed device.

> **Note (superseded):** is build ke artifacts **v2.25.2** ne replace kar diye — current: `release/REQUIREMENTS-CHECKLIST-v2.25.2.md`, `release/AUDIT-EVIDENCE-v2.25.2.html`, `release/shots-v2.25.2/` (v2.25.1 ke duplicate copies workspace se hata diye gaye).
