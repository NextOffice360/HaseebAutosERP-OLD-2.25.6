# 🆕 Haseeb Autos — v2.5 Features Guide

Version **2.5.0** — accounting, real wallet payments, party-balance movement reports, a
dedicated warehouse app, and a mobile order pad.

Roman Urdu mein likha gaya hai (har jagah EN/Urdu toggle bhi maujood hai).

---

## 1. 📒 Accounting (proper double-entry)

**Screen:** `Accounting` (permission: `reports.financial`)

| Tab | Kya milta hai |
|---|---|
| Overview | Cash in hand, bank balance, receivables, payables, stock value, MTD profit, trial-balance health, recent vouchers |
| Transactions | Day book with date range + type filter, voucher detail, **New voucher** (double-entry, live Dr/Cr difference) |
| Expenses | Expense KPIs, table, category breakdown, expense entry |
| Chart of accounts | Grouped COA (assets / liabilities / equity / income / expense), balances, new account, **seed defaults** |
| Banks | Bank book + **reconciliation** (CSV import → auto-match → clear/unclear) |
| Wallets | EasyPaisa / JazzCash requests with payer (from) + merchant (to) numbers |
| Reports | Trial balance, P&L (with COGS block), Balance sheet (with closing stock), Cash book, Account ledger |

### Conventions (backend + reports, ek hi tarteeb)

- Ledger balances **debit-positive**: `balance = opening + Σdebit − Σcredit`
- `normalSide`: `DR` for ASSET / EXPENSE, `CR` for LIABILITY / EQUITY / INCOME
- Trial balance: `bal > 0 → debit column`, `bal < 0 → credit column`
- Vouchers kabhi delete nahi hote — sirf `VOID` mark hote hain
- Auto-posting: `Config ▸ accounts.autoPost` (default **ON**) — sale, GRN, payment aur
  expense apna voucher khud banaate hain. Band karne par sirf haath ke vouchers aayenge.

### Chart of accounts (default, editable)

`1000 Cash`, `1010–1030 cash counters`, `1100–1140 banks (HBL, Meezan, JazzCash, EasyPaisa, Raast)`,
`1200 Accounts receivable`, `1300 Inventory`, `2000 Accounts payable`, `2100 Tax payable`,
`3000 Capital`, `3100 Retained earnings`, `4000/4100 Sales (retail/wholesale)`,
`4200 Other income`, `5000 Purchases / COGS`, `5100 Freight`, `6000–6900 expense heads`.

Settings: **Settings ▸ Trade & Accounts ▸ Chart of accounts** (har code tabdeel kar sakte hain)
aur **Accounts** (`accounts.autoPost`, `accounts.showOnDashboard`, `accounts.fiscalCloseLock`).

### Backfill

Purane data ke liye **🧮 Backfill vouchers** button (Overview tab) — sale / GRN / payment /
expense se vouchers bana deta hai.

---

## 2. 📲 Wallet gateway — EasyPaisa & JazzCash (asli API)

Manual entry ab bhi kaam karti hai, lekin ab **asli gateway** se payment request bhi bhej sakte hain.

### Setup

**Settings ▸ Trade & Accounts ▸ Wallets**

| Setting | EasyPaisa | JazzCash |
|---|---|---|
| Mode | `OFF` / `SANDBOX` / `LIVE` | `OFF` / `SANDBOX` / `LIVE` |
| Merchant id | Store ID (numeric) | Merchant ID |
| Auth | API username + password | API password |
| Signing | Hash key (hosted checkout) | Integrity salt |
| Extra | EWP account number | Sub-merchant ID, Product ID |
| Endpoints | Sandbox / Live base URL (agar gateway path rotate kare to yahan edit) | same |

> Sandbox credentials EasyPaisa khud issue nahi karta — apne merchant rep se maangein.
> JazzCash sandbox keys: <https://sandbox.jazzcash.com.pk>

### Flow (POS par)

1. Payment modal mein method `🟢 EasyPaisa` / `🟠 JazzCash` chunein
2. Wallet panel mein **customer ka mobile (from)** aur **merchant wallet (to)** likhein
3. **📲 Request bhejein** → gateway customer ke mobile par OTP / MPIN bhejta hai
4. Panel khud status check karta hai (`wallet.autoPollSeconds`, default 5s)
5. `PAID` hote hi payment row mein **txn ID** fill ho jata hai aur bill complete hota hai

Har request `WalletTxns` sheet mein record hoti hai (payer, receiver, amount, status,
provider response) — **credentials kabhi log nahi hote**. Accounting ▸ Wallets tab se
kisi bhi waqt status check / polling kar sakte hain.

### Official integration notes (code mein bhi darj hain)

- **EasyPaisa REST v4**: `POST {base}/easypay-service/rest/v4/initiate-ma-transaction`,
  header `Credentials: base64(username:password)`, body `orderId, storeId, transactionAmount,
  transactionType:'MA', mobileAccountNo(03xxxxxxxxx), emailAddress, tokenExpiry`;
  inquiry `/inquire-transaction {orderId, storeId, accountNum}` →
  `transactionStatus: PAID | FAILED | PENDING | EXPIRED | REVERSED | BLOCKED`
- **JazzCash REST (v3.9)**: `POST {base}/ApplicationAPI/API/Payment/DoTransaction` with
  `pp_*` fields; **amount paisa mein** (`2500 Rs → pp_Amount 250000`), payer number
  `ppmpf_1`, `pp_SecureHash = HMAC-SHA256(salt + '&' + sorted pp_* values)`;
  inquiry `/ApplicationAPI/API/Payment/Inquiry`, success `pp_ResponseCode = '000'`
- Fee / FED / net / settlement sab **Payment methods** engine se aate hain (koi duplicate formula nahi)

---

## 3. 📊 Party balance movement — "pichhla baqaya + naya = kul baqaya"

Reports ▸ **Receivables / Payables / Party balances** ab 4 columns dikhaate hain:

| Column | Formula |
|---|---|
| Prev (pichhla baqaya) | opening balance + ledger entries **before** the selected range |
| Naya / Purchase | range ke andar bana udhaar (customer) ya purchase (supplier) |
| Wasooli / Paid | range ke andar mili recovery / ki gayi payment |
| **Closing** | `Prev + Naya − Wasooli` |

- Supplier ke liye payable **positive** rehta hai (`Parties.supplierPayable`)
- `to` date ke baad ki entries report se bahar rehti hain (as-of report)
- Naya report type: **Party balances (prev / new / closing)** — customer + supplier dono

Misaal: pichhla baqaya `2,500` + naya udhaar `1,000` = closing `3,500`.

---

## 4. 🏗 Warehouse app (count · audit · inventory)

**Screen:** `Warehouse` — ab 8 tabs:

| Tab | Kaam |
|---|---|
| Overview | Warehouses, bins, units, value, low/out-of-stock, without-bin |
| **Inventory** | Branch / category / search filters, SKU value, low-stock switch, value-by-category chart, quick count |
| **Count sheets** | Nayi sheet (warehouse / bin / category / search / zero / low scope) → blind entry → **Post & adjust** |
| **Audit** | Accuracy %, over/short, variance value, top variance, adjustments ledger (reverse bhi) |
| **Movements** | Poora stock ledger (in / out / balance / reference) |
| Bins & racks | Bin CRUD |
| Stock by bin | Bin-wise stock |
| Put-away / move | Item ko bin mein move karein |

### Count sheet ka sahi tareeqa

1. **＋ New count sheet** → scope chunein (system qty freeze ho jati hai — blind count)
2. Entry screen par code scan/type karein (Enter se us line par jump) aur counted qty likhein
3. Progress bar + live diff + variance value
4. **✅ Post & adjust stock** → har farq ke liye `StockAdjustment` ban kar post hoti hai
   (stock + StockMoves + `lastCountedAt` stamp) — dobara post nahi ho sakti

Audit formula: `accuracy = matched lines / counted lines × 100`

---

## 5. 📝 Order book + 📱 mobile order pad

**Screens:** `Order Book` aur `Take Order (mobile)` (`pos.sell` permission)

- **Order Book**: list (status/customer search) + Pipeline (counts, open value, advance)
- Order detail: lines, status moves `DRAFT → CONFIRMED → PICKING → PACKED → DELIVERED`, cancel
- **🧾 Convert to invoice** → asli sale banti hai (`Sales.create`) — stock, customer ledger,
  loyalty, accounting sab wahi flow, advance payment ke sath
- **📱 Take Order** full-screen mobile pad:
  - bara search (name / code / barcode), bari `＋ / −` qty buttons
  - customer picker (walk-in bhi), advance, delivery date, note
  - neechay sticky totals + **Order save karein**

Order formulas: `lineBase = price × qty − line discount`, bill discount lines par
proportionally allocate (bilkul `Sales.create` jaisa), `total = subtotal − discount + tax`,
`balance = total − advance`.

---

## 6. 🧾 POS payment polish

- **Bill summary** payment modal ke upar (items, subtotal, discount, tax, total)
- **Fill** button — baqi amount ek click mein us method par
- **Quick chips** — `💯 Exact`, round-up (`⬆` with change), aur settings wale note buttons
- Wallet methods par asli gateway panel (section 2)

---

## 7. ✅ Verification (`bash tools/verify.sh`)

| Gate | Kya check karta hai |
|---|---|
| `check` | Har `.gs` file ki syntax + HTML `<script>` blocks |
| `logic` | Real backend logic (stock, tax, ledger, accounting, wallet, orders) — **470 assertions** |
| `ui` | Labels, accessibility, empty/undefined content |
| `smoke` | Har screen / tab / action — **245 checks** |
| `tabs` | Har screen, sub-tab aur Settings sub-tab blank to nahi — **476 checks** |
| `align` | Modal center / offcanvas right-edge alignment |

Sab green hona chahiye: `ALL GATES GREEN`.
