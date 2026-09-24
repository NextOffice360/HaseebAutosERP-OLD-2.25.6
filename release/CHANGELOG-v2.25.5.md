# Haseeb Autos — v2.25.5 CHANGELOG

**Date:** 2026-09-23 · **Version:** `2.25.5` (Utils.gs ▸ `VERSION`)
**Base:** v2.25.4 (PWA stacking fix) → ye build **POS payment ledgers** ko gate karta hai
(standing criteria: "POS payment ledgers") aur usi gate ne demo ledger ka ek data-bug pakra jo fix hua.

---

## 1 ▸ Naya gate 56 — `pay-ledger`: 24 PASS / 0 FAIL — ✅

Kya kya asal mein naapa jata hai (guess nahi):

| # | Kya | Nateeja |
|---|---|---|
| 1 | Pay modal ka **foot ledger**: shuru mein Paid = 0, Due = Total | ✔ |
| 2 | **Exact** chip → amount = Total, Paid = Total, `Current Due 0 (Clear)` | ✔ |
| 3 | **Overpay** (Rs 500 zyada) → Change row bilkul Rs 500 | ✔ |
| 4 | ✅ Complete → invoice modal + **ledger mein wahi invoice** | ✔ |
| 5 | **Recorded sale**: total / paid / change / due / status = PAID | ✔ |
| 6 | `paymentList` ka jama == `sale.paid` | ✔ |
| 7 | **Blocked**: adhoora cash bina Udhaar → block toast, **koi sale record nahi** | ✔ |
| 8 | Customer **ACCOUNT SUMMARY**: Previous balance / This invoice / Amount Paid / Closing | ✔ |
| 9 | **Ledger identity**: Closing = Previous + invoice − paid, aur POS **customer bar** ka "Previous" usi number se match karta hai | ✔ |
| 10 | Exact ke baad: invoice cover, magar **purana balance Closing mein baqi** | ✔ |
| 11 | **Credit (udhaar)**: CREDIT row → status **PARTIAL** + due = total − paid | ✔ |
| 12 | **Poore sales ledger par invariants**: `paid == Σpayments` · `change == max(0, paid−total)` · `due == max(0, total−paid)` · status sahi | ✔ (500 sales) |
| 13 | **PWA POS** pay sheet: This invoice / Remaining / Closing + Exact + blocked toast | ✔ |

## 2 ▸ Gate ne DEMO LEDGER KA ASLI BUG PAKRA — ✅ fixed

**Bug:** `demo/mock.js` ka sales seed status ko **random** rakhta tha (`rnd() > 0.85 ? 'DUE' : 'PAID'`),
paid/total se independent. Zero-value bill (jab kisi item ki price 0 ho) par nateeja:
`INV-SDQ-1440 — total 0, paid 0, due 0, magar status **DUE**` → demo Sales screen par
**paid-0-due-0 bill par "DUE" chip**, aur ledger invariants toot rahe thay.

**Fix (wahi rule jo asli app `sales.create` L1366 par lagata hai):**
```js
const wantDue = rnd() > 0.85;
const paidSeed = wantDue ? 0 : total;
const status = (total - paidSeed) <= 0 ? 'PAID' : (paidSeed > 0 ? 'PARTIAL' : 'DUE');
```
Ab `paid` / `due` / `payments[]` bhi isi derived number se set hote hain — poore 500-row demo
ledger par invariants **100% green**.

## 3 ▸ Verification

`env -u HOME bash tools/verify.sh` → **ALL 56 GATES GREEN (1137s)** · log `tmp/verify255.log`
Is run mein: `pay-ledger` **24/0** (naya) · `pwa-overlays` 118/0 · `scan-parity` 29/0 ·
`modals-close` 84/0 · `labels-live` 16/0 · `grn-drawer` 23/0 · `demands` 13/0 ·
`salesman-stock` 10/0 · `smoke` 332/0 · `scan-coverage` 21/0 · `ui-polish` 62/0 · `check_pwa` ✔ ·
`pwa-ui` 66/0 · `typography` 0 problems · layout 0 problems (1440/390/dark/overlays ×2/PWA ×2)।

Checklist: `release/REQUIREMENTS-CHECKLIST-v2.25.5.md` · Evidence: `release/AUDIT-EVIDENCE-v2.25.5.html` ·
Rendered shots: `release/shots-v2.25.5/` · Pichhla package: `release/archive/haseeb-autos-v2.25.4.zip`

## 4 ▸ Archive policy (amal mein)

`release/archive/` mein pichhle **3** releases rakhe ja rahe hain (v2.25.2 · v2.25.3 · v2.25.4) —
release packages khud-ba-khud delete nahi hote; sirf logs/probes/temp saaf hote hain.

## User-side checks (device / deployed backend)

* Physical scanner drill (Zx10) + chhape hue label ka paper par read-back.
* Live GAS + Drive image upload test.
* Deployed `F2` shortcut check on a keyed device.
* Live POS par ek dafa udhaar bill (CREDIT) dekh lein: Closing balance aur Customer ledger
  ka previous balance match karein (demo mein ye gate khud check karta hai).
