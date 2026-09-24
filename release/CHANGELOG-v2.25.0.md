# Haseeb Autos — v2.25.0 CHANGELOG

**Date:** 2026-09-23 · **Version:** `2.25.0` (Utils.gs ▸ `VERSION`)
**Theme:** 6-point ERP/POS audit — PO/GRN scanning, GRN redesign, Customer Demands,
Salesman Stock, Label designer/templates, global design-system consistency.

> Verification: `env -u HOME bash tools/verify.sh` → **ALL 52 GATES GREEN**
> (log: `tmp/verify250b.log`) · rendered evidence: `release/shots-v2.25.0/`

---

## 1 ▸ PO & GRN barcode/QR scanning — POS system reuse

* Ek hi scanning system ("same dedicated system as POS") — `UI2.itemPicker` + `UI2.bulkAddModal`
  POS, PO form aur GRN drawer teeno jaga use hote hain (page-specific copy khatam).
* Scan → item seedha line mein, field foran khali, agla scan ready (scan never appends).
* Dedicated **Bulk Add modal**: search + checkbox list + apna continuous-scan input +
  bulk list (qty ± / remove / clear) + Add All → lines.
* Gate: `scan-coverage` 21/0 · `grn-drawer` 23/0 (bulk 40 rows, multi tick → line) · `pos-multi` 23/0.

## 2 ▸ GRN drawer — complete redesign + workflow review

* Width `min(1100px, 96vw)`; **4 saaf sections**: Supplier & invoice → PO (optional) → Items → Charges.
* PO mode = 8 columns (Ordered/Received/Now/Short/Cost/Amount), direct purchase = 5 columns
  (khaali columns ka shor nahi); mobile par header lapata aur har cell apna label.
* Live feedback: `Short` badge, row Amount, footer summary (Lines/Qty/Subtotal) aur
  `Total = Subtotal + Freight` — qty/cost badalte hi update.
* Workflow: PO load (supplier auto-set + banner + **title bhi badalta hai**), per-line
  "Receive all" (F4), F2 scan focus, F9 post; validation (0 lines / qty 0 / credit bina supplier).
* Redundant/legacy interactions hataye: ek hi keydown listener, duplicate fill buttons nahi,
  "Clear PO"/PO switch par **asli confirm dialog** (Cancel waqai rokta hai).
* Gate: `grn-drawer` 23/0 · overlay audit 0 problems @1440 + @390 · `smoke` 332/0.

## 3 ▸ Customer Demands — purana adhoora modal replace

* List + KPIs + live search → detail (linked POs + status history) → form
  (Customer → Product → Demand details → Advanced) → save.
* Data-aware: customer intelligence (balance/credit/open demand), product stock+price awareness,
  duplicate guard **server-side** (`Ye demand pehle se open hai …`), walk-in auto-create, F9 save.
* Demo ka mock backend `demand.*` routes ke sath poora kaam karta hai (pehle screen dead thi).
* Gate: `demands` 11/0 (list 5→6 rows, dup block, F9 save, 0 page errors).

## 4 ▸ Salesman Stock — audit + polish

* Health KPI row: Items / Qty in hand / Value / **Out of stock** / **Low (<5)** — click = filter
  (health + search merged), filter-miss par sahi message (pehle har khaali list "stock issue nahi hua" kehti thi).
* POS jaisa **scan-aware search**; Stock Issue modal: 2 sections, shared scan picker, F2 scan /
  F9 issue, qty-0 line block, Cancel ghost, shared confirm dialog.
* Gate: `salesman-stock` 9/0 · overlay audit 0 problems @1440 + @390.

## 5 ▸ Barcode/QR label designer & templates

* **Overflow root causes fixed:** `.lqr img{width:100%}` QR ko label ki poori chaurai tak
  phaila deta tha; `.lbc svg{width:100%}` CSS computed module width ko override kar rahi thi.
  Ab sirf `max-width/max-height` guards hain aur width JS se (asli GS1 quiet zones ke sath) aati hai.
* QR + bars **ek row** mein (combined labels), text ke liye pehle jagah — phir symbol;
  chhote label par font compress hota hai lekin **kuch bhi frame se bahar/clip nahi hota**.
* Human-readable line hamesha banti hai; 6 templates (compact, retail_std, price_focus,
  inventory, qr_combo, warehouse) sab 0 overflow.
* **True live preview**: har control change par foran re-render, aur print output bilkul wahi
  `LABEL_CSS` + config use karta hai (designer = print).
* Gate: `labels-live` 11/0 (print vs preview: same CSS, same font scale, same bars, hr, 0 outside).

## 6 ▸ Global consistency & quality

* **Native `confirm()` / `prompt()` ab app mein kahin nahi** (sandboxed preview/iframe mein
  wo block ho jate thay → "cancel button kaam nahi karta" jaisi shikayatein):
  POS/POS2 `clearCart`, Salesman `disableRoute`, Demands (cancel/status/save),
  4 scan fallbacks aur PWA hub "copy link" → naye shared `UI2.confirm` (promise-aware),
  `UI2.askCode`, `UI2.copyText`.
* **Shared CSS bug fix:** `.field label{display:block…}` ki specificity `.switch` se zyada thi →
  har field ke andar switch toot jata tha (track 0px, knob apne hi label ke harf par).
  Ab `inline-flex` + block track (audit finding, GRN ka "On credit", PO form, Settings sab theek).
* Tap targets: search fields ke 📋/✕ 26–32px → **44px**; lambe chip text ke liye `.btn.wrap`
  (PO demand-suggest chips 390px par kat rahe thay).
* Gate: `ui-polish` 62/0 (5 naye shared-dialog checks) · `layout` 1440 / 1440-dark / 390 +
  overlays dono sizes = 0 problems · `typography` / `align` / `tabs` clean.

---

## Files touché (main)

`App_UI2.html` (askCode/copyText, confirm promise, picker fallbacks) · `App_Screens2.html`
(GRN sections/title/summary) · `App_Demand.html` (dup guard, dialogs) · `App_Salesman.html`
(KPI + filters + Issue modal) · `App_Barcode.html` (LABEL_CSS + sizing) · `App_Print.html` ·
`App_Orders.html` · `App_POS.html` / `App_POS2.html` · `App_PwaHub.html` · `Styles.html`
(switch fix, f-search-btn 44px, `.btn.wrap`) · `tools/*` (6 new/updated gates + shots).

## Verification

| Suite | Result |
|---|---|
| `tools/verify.sh` — 52 gates | **ALL GATES GREEN** (969s) |
| `grn-drawer` / `demands` / `salesman-stock` / `labels-live` | 23/0 · 11/0 · 9/0 · 11/0 |
| `ui-polish` (design system) | 62/0 |
| `scan-coverage` / `pos-multi` / `smoke` | 21/0 · 23/0 · 332/0 |
| overlay layout audits 1440 + 390 (+ dark) | 0 problems |
| Evidence shots | `release/shots-v2.25.0/` (9 PNGs) |

## User-side checks (device/環境)

* Physical scanner drill (Zx10) + label read-back on real paper.
* Live GAS + Drive image upload (deployed backend).
* Deployed `F2` shortcut check on a real keyed phone/browser.
