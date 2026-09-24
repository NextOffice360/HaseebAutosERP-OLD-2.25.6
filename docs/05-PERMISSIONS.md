# ⑤ Permissions — kaun kya kar sakta hai

## Structure
- **Group/Role** (jaise Owner, Manager, Cashier, Salesman) → **permission keys** ka set.
- User ko group milta hai (+ kabhi kabhi per-user allow/deny override).
- Har backend action apni key maangta hai (`Auth.require(s, 'sales.create')` waghera) —
  UI ke button ke chhupe hon se koi farq nahi parta: **backend hi asli rakhwala hai**.

## Aam keys
| Key | Kya khulta hai |
|-----|----------------|
| `pos.sell` / `pos.return` / `pos.discount` | Billing / return / bill-discount bypass |
| `sales.void` | Invoice void |
| `items.edit` / `inventory.transfer` | Catalog / branch transfer |
| `purchase.grn` / `purchase.return` | GRN / supplier return |
| `customers.edit` / `parties.pay` | Customer / payments |
| `reports.financial` | Profit/margin reports |
| `pos.cash.manage` | Shop open/close, cash in/out, drop |
| `settings.view` / `settings.edit` | Settings |
| `*` | Sab (sirf Owner ko) |

## Field visibility matrix (W5)
`Users & Security ▸ Field matrix`: jaise Cashier ko items ka **cost price** nahi dikhna
chahiye — matrix me off karo; backend response me field jata hi nahi (UI me sirf chhupana
kaafi nahi tha).

## Limits (per user/group)
- `discountLimit` — kitna % discount de sakta hai (bill max ke upar).
- `saleReturnLimit` — is se bari return par Owner approve (`*`) chahiye.
- `commissionRate` — default salesman commission (jab slab na mile).

## Audit
Har sensitive kaam `Audit.log` se record hota hai (kaun, kab, kya, purana/naya) —
`Audit` sheet me dekhein.
