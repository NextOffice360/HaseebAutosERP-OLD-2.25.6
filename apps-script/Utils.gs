# GAP AUDIT — Missing must-haves scan (2026-09-25, round-13)

**Mandate:** user-directed systematic scan — "missing must-have features, fields, columns implement karo, no skipping; docs/plans/todos ke mutabiq focused raho."
**Method:** Schema.gs ke har sheet ko typical trading/ERP must-haves se compare kiya (audit everything, no skips); jo mila woh additive-only implement (v2.31.1).

## Verdict — schema pehle se rich hai
HS-code (`hsn`), warranty, batch/expiry lots (`StockLots.expiry`), UoM conversions, price tiers, discounts engine, cheque/Raast/wallet lifecycle, approvals, custom fields, salesman consignment, day reports, doc registry — sab mojood the. Ye galat-fehmi durust hui ke "ERP chhota hai".

## Gaps MILAY (is round implement — v2.31.1)
| # | Gap | Kahan implement |
|---|-----|-----------------|
| G1 | **Customers.creditDays** — credit terms (din); promised-date default + overdue hisaab ke liye bunyaad | Schema.gs · App_Masters customer form · POS promised-date prefill (aaj + creditDays) · aging detail |
| G2 | **Customers.salesmanId** — assigned salesman (salesman PWA "mere customers" filter ki bunyaad) | Schema.gs · customer form (Users role /sales/i select) · mock seeds |
| G3 | **SaleItems.foc** — free-of-cost line flag (distribution must-have; totals unchanged — FOC engine baad) | Schema.gs · Sales.gs lineRows passthrough · demo seed flag |
| G4 | **Aging report credit-terms awareness** — per-customer creditDays + overdue din (age − creditDays) detail rows | Reports2.gs `cus.ageing` (additive `detail` + `note`) |
| G5 | Tests: backend save/read-back, FOC flag, aging detail, POS prefill | test_logic.js (3 ok) · test_pay_ledger.js (1 ok) |

## Gaps jo MOJOOD hain (misconceptions cleared — koi kaam nahi)
- dueDate: POS promised date → `Payments.dueDate` (N4) ✓
- Receivables aging (0-30/31-60/61-90/90+): `cus.ageing` ✓ (ab creditDays-aware bhi)
- Suppliers paymentTerms ✓ · NTN/CNIC ✓ · Item hsn/warranty/barcode-type ✓ · UoM+conversions ✓ · price tiers/lists ✓ · cheque/Raast ✓ · expense approvals ✓ · audit logs ✓ · consignment ✓ · count sheets + variance ✓ · transfers ✓

## Future candidates (NOT this round — records only)
- **F1 Full FOC engine** ✅ DONE v2.31.3 (r15): FOC line lineTotal 0 (price reference), stock+cost deducted, min-price/discount-limit guards FOC-aware, POS cart 🎁 toggle (pos.discount gated), print FREE badge — GRN-side promo lots future
- **F2 Fiscal period lock** (accounting close)
- **F3 Batch/expiry AT SALE capture** (pharma-style; autos me kam zaroori — StockLots already GRN-side)
- **F4 Credit-limit override** ✅ DONE v2.31.3 (r15): naya perm `pos.credit.override` (OWNER+MANAGER), POS confirm-override flow, backend guard + **Audit CREDIT_OVERRIDE record** — kabhi chupchap nahi
- **F5 PWA salesman "mere customers"** UI filter — backend salesmanId ab hai; PWA list filter next round
