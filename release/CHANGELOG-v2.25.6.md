# Haseeb Autos — v2.25.6 CHANGELOG

**Date:** 2026-09-23 · **Version:** `2.25.6` (Utils.gs ▸ `VERSION`)
**Base:** v2.25.5 (POS payment-ledger gate) → ye build **mobile PWA ka stale-node / listener-leak audit**
karta hai (wahi class jo v2.25.2 mein DESKTOP par fix hui thi) + ek naya scroll-lock bug fix karta hai.

---

## 1 ▸ Listener leak jo mila — scan-fallback ka duplicate path (req 6) — ✅ fixed

`Pwa_Shell ▸ showScanFallback()` — agar scan-fallback overlay pehle se khula ho to purana code
usay **seedha `existing.remove()`** se DOM se hata deta tha. Nateeja: us overlay ka
capture-phase **Esc listener document par leak** ho jata tha (aur `body.style.overflow` bhi
locked reh jata tha). Yehi wo class hai jo aap ki shikayat ("close kaam nahi karta") ki jarh thi.

**Fix:**
* Purana overlay ab **proper close()** se hatta hai — reference `showScanFallback._close` par
  rakha jata hai: listener remove + body-lock release + reference null.
* Teenon shared overlays (**camera · scan-fallback · bulk-picker**) ke Esc handlers mein
  **stale guard**: agar overlay DOM mein nahi raha to listener khud ko hatata hai aur Esc
  aage nikal jata hai (kabhi keys ko "nigal" nahi karta).

## 2 ▸ Naya bug — stacked layers par scroll-lock (req 6) — ✅ fixed

POS PWA ki **har** layer ka `close()` `document.body.style.overflow=''` kar deta tha. Cart +
Pay dono khuli hon aur Esc se sirf **pay** band ho to background scroll **unlock** ho jata tha,
jab ke cart khula tha (asli mobile UX bug — peeche page scroll ho jata).

**Fix:** naya `posSyncScrollLock()` — lock sirf tab unlock hota hai jab **koi bhi POS layer khuli
na ho**. Cart/pay/receipt teenon `close()` isi ko call karte hain.

## 3 ▸ Gate 55 `pwa-overlays`: 118 → **124 PASS / 0 FAIL**

* 3 **static contract** checks: teenon shell overlays mein stale guard mojood · duplicate path
  proper close() chalata hai · POS layers ka scroll-lock sync (≥3 call sites).
* 2 **rendered** checks: 📷 do bar tap → sirf **EK** overlay bachta hai, aur us ke baad cart+pay
  khol kar **ek Esc** = sirf top-most band (leaked listener Esc nahi nigalta);
  detached (stale) overlay ke baad bhi Esc top-most band karta hai **aur** bachi hui layer ka
  scroll-lock reset nahi hota.
* **Sensitivity proven:** fix (close-call + guards) revert kar ke demo par gate chalayi →
  leaked-listener check **FAIL** (`["posCartLayer","posPayLayer"]` — Esc nikal gaya);
  fix ke sath **124/0**. Yani check khokhla nahi.

## 4 ▸ Environment note (workspace snapshot)

Is round mein `node_modules/` aur `~/.cache/puppeteer` snapshot se ghayab mile (policy:
ye directories save nahi hoti). Restore kiya: `npm install` (137 packages, root) +
`npx puppeteer browsers install chrome` + `tools/fetch_chrome_libs.py` (symlinks wapas).
**Is liye:** future mein agar gates "Cannot find module 'puppeteer'" dein to wahi 3 steps
chalane hain — app/kits se masla nahi hota.

## 5 ▸ Desktop legacy paths — stacking + stale-entry VERIFIED (test-only) — ✅

Wahi discipline ab **desktop** par bhi gate mein hai (app code mein koi tabdeeli nahi chahiye thi —
probe se sabit hua ke `UI.modal` / `UI.drawer` / `UI2.modal` ka registry pehle se sahi hai):

* `UI2.modal` **legacy `UI.modal` ke upar** → 1st Esc sirf top band, 2nd Esc legacy band.
* `UI2.modal` **`UI.drawer` ke upar** → 1st Esc modal band, drawer khula; 2nd Esc drawer band.
* **Stale registry entry** (scrim bina `close()` ke DOM se hataya gaya) → Esc phir bhi visible
  modal band karta hai (entry prune hoti hai, keys "nigal" nahi jatin).

Gate 54 `modals-close`: **84 → 91 PASS / 0 FAIL** (7 naye checks). Poora suite dobara: **56 gates green**.

## Verification (is build ka)

`env -u HOME bash tools/verify.sh` → **ALL 56 GATES GREEN (1147s)** · log `tmp/verify256.log`
Is run mein: `pwa-overlays` **124/0** · `pay-ledger` 24/0 · `scan-parity` 29/0 · `modals-close` 84/0 ·
`labels-live` 16/0 · `grn-drawer` 23/0 · `demands` 13/0 · `salesman-stock` 10/0 · `smoke` 332/0 ·
`scan-coverage` 21/0 · `ui-polish` 62/0 · `check_pwa` ✔ · `pwa-ui` 66/0 · `typography` 0 problems ·
layout 0 problems (1440/390/dark/overlays ×2/PWA ×2)।

Checklist: `release/REQUIREMENTS-CHECKLIST-v2.25.6.md` · Evidence: `release/AUDIT-EVIDENCE-v2.25.6.html` ·
Rendered shots: `release/shots-v2.25.6/` · Archive: `release/archive/` (v2.25.2–v2.25.5)

## User-side checks (device / deployed backend)

* Physical scanner drill (Zx10) + chhape hue label ka paper par read-back.
* Live GAS + Drive image upload test.
* Deployed `F2` shortcut check on a keyed device.
* Mobile POS PWA: cart khol kar **Pay**, phir **back/Esc** — pay band ho, cart khula rahe **aur
  page peeche scroll na ho** (dono naye fixes ka manual check).
