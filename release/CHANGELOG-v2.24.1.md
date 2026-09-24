# Haseeb Autos — v2.24.1 (patch)

**Base:** v2.24.0 · **Tareekh:** 2026-09-23

v2.24.0 ke baad ye ek chhota lekin **nazar aane wala** UI fix hai — Demand form mein ek
khaali bordered box dikh raha tha. Screenshot se pakra gaya, root cause form-builder mein
tha, aur shared level par theek kiya gaya (page-specific patch nahi).

---

## 1. Fix — Demand form ka khaali (empty) box

**Kya nazar aa raha tha**
`New Customer Demand` form mein chips ke neeche ek **khaali grey card/strip** — us jagah
jahan "walk-in customer" ya "duplicate demand" wala note aata hai.

**Root cause**
`UI2.form` ka `type:'el'` row (data-aware note panels ke liye) ek wrapper banata hai:
`.f-col.full` — aur CSS mein `.f-grid .f-col` ko **border + padding + background** milta hai.
Andar wala panel (`walkNote` / `dupNote`) `hidden` hota tha, magar **wrapper** visible reh
jata tha → 22px ka khaali bordered box.

**Fix (shared)**
`App_UI2.html` — `type:'el'` branch mein wrapper ki visibility andar wale element ke
`hidden` attribute se **sync** ho gayi hai (MutationObserver ke zariye, dono directions:
chhupe aur wapas dikhe). Wrapper par `f-el-row` class bhi lag gayi hai taake test isay
pehchaan sake.

**Faida:** sirf Demand par nahi — jahan bhi form row ke andar live panel dynamically
chhupta/dikhta hai, wahan wrapper bhi theek se chhupta hai. Walk-in note customer pick
karne par chhup jata hai, aur duplicate-demand warning aane par poora card sahi dikhta hai.

---

## 2. Naya regression test (rendered-DOM, real Chrome)

`tools/test_ui_polish.js` mein naya block **⑫ Demand form — khaali boxes / hidden-note wrappers**
(5 checks, sab real Chromium mein render kar ke naapi gayi):

1. Demand modal khulta hai (test ka base).
2. **KOI khaali bordered box nahi** — visible `.f-col` jinmein na text ho na koi control.
3. **`f-el-row` wrapper display:none** jab andar ka panel hidden ho (attribute par bharosa nahi).
4. Data-aware note panels mojood hain aur unme asli text hai.
5. Customer pick karne ke baad bhi zero khaali box (walk-in note theek se chhupta hai).

Pehle: suite 52 checks → ab **57 checks, 0 fail**.

---

## 3. Version

- `Utils.gs` → `VERSION: '2.24.1'`
- Demo / static / PWA builds dobara (agar us ne kiye hi nahi — sirf version + wrapper fix).
- Release zip: `release/haseeb-autos-v2.24.1.zip` (v2.24.0 zip superseded).

---

## Verification (shipped bytes par)

| Gate | Result |
|---|---|
| `bash tools/verify.sh` (47 gates) | **ALL GATES GREEN** |
| `tools/test_ui_polish.js` | 57 / 0 (naya ⑫ block shamil) |
| `tools/test_browser_scan.js` (real Chrome) | 52 / 0 |
| `tools/test_modals_close.js` | 82 / 0 |
| `tools/verify_punchlist.js` | 117 / 117 |
| `audit_layout.js` (1440 · 390 · dark · overlays · PWA) | 0 problems |

---

## Screenshots (asli demo se, Chromium)

`shots-v2.24/` folder:
`01-pos-bulk-add.png` · `02-po-form.png` · `03-grn-form.png` · `04-salesman-stock-issue.png` ·
`05-demand-form.png` · `06-demand-search-live.png` · `07-demand-advanced.png` ·
`08-footer-cancel-close.png` · `09-scan-block-zoom.png` · `10-demand-mobile-390.png`
