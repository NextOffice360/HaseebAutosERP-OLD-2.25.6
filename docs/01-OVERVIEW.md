# ① Overview — Ye app kya hai?

**Haseeb Autos ERP & POS** ek Google Apps Script par chalne wala pura dukan-system hai
(auto-parts / retail ke liye): billing (POS), stock (multi-branch), purchases (PO/GRN),
customers/suppliers ke hisab (ledger), loyalty points, cash sessions, reports, aur
offline-tolerant PWA — sab Google Sheet jaisi DB par, bina kisi alag server ke.

## Kya kya hai (modules)
| Module | Kya karta hai |
|--------|---------------|
| **POS** | Barcode/search sale, multi-tender (cash/card/wallet/loyalty), change, hold, scan-to-return |
| **Items/Inventory** | Catalog, stock per branch, transfers, stock-take, valuation (AVG costing), labels/QR |
| **Purchases** | PO → GRN (cost freeze, price history), purchase return, supplier statement |
| **Parties** | Customers/suppliers, credit limits, ledger, payments (receipts/recoveries) |
| **Accounting** | Auto journal (sale/purchase/payment/expense), chart of accounts, cashbook |
| **Loyalty** | Points earn (per amount) + redeem (payment method ya manual), ledger |
| **Reports** | Dashboard KPIs, sales/profit (returns NET), inventory valuation, party/cash reports |
| **Shop sessions** | Open (opening cash) → sell → Close (counted vs expected → variance) |
| **Users/Security** | Roles + permission keys + field-visibility matrix, audit log |
| **Offline/PWA** | Queue + idempotent replay (duplicate-guard), sync chip, background flush |
| **AI assistant** | Local Data Assistant (aap ke apne data par) — koi LLM claim nahi |

## Design ke 3 usool
1. **Authoritative source ek** — hisab (totals/tax/costing/points) backend (`apps-script/*.gs`)
   me hota hai; UI sirf render karta hai. Isi liye regression gates backend exact-math test karte hain.
2. **Kuch chhupana nahi** — overpay par change, discount allocation, returns ka profit-par asar:
   sab structured aur tested (v2.30.x me 5 shared fixes + 22-step E2E journey gate).
3. **Bilingual** — UI Roman-Urdu + English; docs bhi isi andaz me.

Agla qadam: [02-SETUP-GUIDE.md](02-SETUP-GUIDE.md)
