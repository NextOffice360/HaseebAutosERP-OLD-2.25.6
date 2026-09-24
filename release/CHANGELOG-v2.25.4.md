# Haseeb Autos — v2.25.4 CHANGELOG

**Date:** 2026-09-23 · **Version:** `2.25.4` (Utils.gs ▸ `VERSION`)
**Base:** v2.25.3 (PWA overlay close sweep) → ye build **stacking contract** theek karta hai:
ek Esc = sirf **top-most** overlay (neeche wala khula rehta hai) — bilkul main app jaisa.

---

## 1 ▸ BUG (asli flow se pakra) — POS PWA mein ek Esc DONO layers band kar deta tha — ✅ fixed

**Kaise mila:** PWA pay/receipt layers ka audit (v2.25.3 ke baad agla item) — asli user path
probe kiya:

```
scan item → cart drawer khula → usi ke andar "💳 Pay · PKR 338" click
  → layers: ['posCartLayer', 'posPayLayer']   (dono open — ye by design hai)
  → EK Esc dabaya
  → layers: []        ✖ PEHLE: DUNO band — poora cart gayab ho gaya!
```

**Wajah:** POS PWA ki har layer ka apna `keydown` handler tha jo sirf ye dekhta tha ke **wo khud
open hai** — is liye ek hi Esc par teenon handlers (cart, pay, receipt) apna apna overlay band
kar dete thay. Main app ka contract iske ulat hai (registry se sirf **top-most** band hota hai).

**Fix (v2.25.4):** `Pwa_POS.html` mein shared `posTopLayer()` helper + `LAYER_ORDER =
[receipt, pay, cart]` (upar se neeche). Ab har layer ka Esc handler pehle ye check karta hai ke
wo **top-most** hai ya nahi:

| Halat | Pehle | Ab |
|---|---|---|
| cart + pay open, 1 Esc | dono band (cart gaya) | **sirf pay** band, cart khula |
| uske baad dobara Esc | — | **cart** band |
| pay ka footer **Cancel** | sirf pay band ✔ | sirf pay band ✔ (cart bacha rehta hai) |
| receipt open (sale ke baad), Esc | receipt band | receipt band (top), phir cart/pay baari baari |

PWA ke scan fallback / bulk-picker overlays capture-phase handler `stopPropagation()` karte hain —
wo pehle se hi sab se upar wala overlay hote hain (unko chhua nahi).

**Sensitivity proof (guess nahi):** purana behaviour (top-check hata kar) demo par wapas lagaya —
naya stacking check **FAIL** (`ek Esc sirf TOP-MOST … — []`); fix ke sath **118 PASS / 0 FAIL**.
Yehi check ab permanent gate mein hai.

## 2 ▸ Gate 55 `pwa-overlays` — 114 → **118 PASS / 0 FAIL** (4 naye stacking checks)

* asli flow: 💳 Pay cart ke andar se → **cart + pay dono layers khuli** hain
* ek Esc sirf **top-most (pay)** band karta hai; cart khula rehta hai
* doosra Esc cart band karta hai (baari baari)
* pay ka footer **Cancel** sirf pay band karta hai (cart bacha rehta hai)

## Verification (is build ka)

`env -u HOME bash tools/verify.sh` → **ALL 55 GATES GREEN (1089s)** · log `tmp/verify254.log`
Is run mein: `pwa-overlays` **118/0** · `scan-parity` 29/0 · `modals-close` 84/0 ·
`labels-live` 16/0 · `grn-drawer` 23/0 · `demands` 13/0 · `salesman-stock` 10/0 · `smoke` 332/0 ·
`scan-coverage` 21/0 · `ui-polish` 62/0 · `check_pwa` ✔ · `pwa-ui` 66/0 · `typography` 0 problems ·
layout 0 problems (1440/390/dark/overlays ×2/PWA ×2)।
Checklist: `release/REQUIREMENTS-CHECKLIST-v2.25.4.md` · Evidence: `release/AUDIT-EVIDENCE-v2.25.4.html` ·
Rendered shots: `release/shots-v2.25.4/` · Pichhla package: `release/archive/haseeb-autos-v2.25.3.zip`

## User-side checks (device / deployed backend)

* Physical scanner drill (Zx10) + chhape hue label ka paper par read-back.
* Live GAS + Drive image upload test.
* Deployed `F2` shortcut check on a keyed device.
* Mobile POS PWA par ek dafa khud test: cart khol kar Pay → **back/Esc** dabayein → pay band ho,
  cart khula rahe (ye asli bug ka manual check hai).
