# Haseeb Autos — ERP & POS — Application Roadmap & Rebuild Blueprint
**Version 2.22.0 — Aurora POS** | **Date: 2026-09-21** | **Stack: Google Apps Script + Google Sheets + PWA**

> **Purpose:** This document is a complete, structured blueprint of the Haseeb Autos application — what is covered, how it flows, and how to rebuild it identically. Supply this document to an engineering team/AI and expect a functionally identical system.

---

## Table of Contents
1. [Executive Summary](#1-executive-summary)
2. [Vision, Business Context & Users](#2-vision-business-context--users)
3. [Technology Stack & Principles](#3-technology-stack--principles)
4. [High-Level Architecture](#4-high-level-architecture)
5. [Data Model — Sheets as Database (Schema.gs)](#5-data-model--sheets-as-database-schemags)
6. [Security — Auth, Roles, Permissions, Groups](#6-security--auth-roles-permissions-groups)
7. [Core Modules — Feature Matrix](#7-core-modules--feature-matrix)
8. [Module Deep Dives & UI Flows](#8-module-deep-dives--ui-flows)
9. [End-to-End Business Flows](#9-end-to-end-business-flows)
10. [PWA Dedicated Apps (Warehouse / Field / Salesman / POS)](#10-pwa-dedicated-apps-warehouse--field--salesman--pos)
11. [POS — Enterprise Design Systems (Atelier → Horizon → Aurora)](#11-pos--enterprise-design-systems-atelier--horizon--aurora)
12. [Offline, Sync & Queue](#12-offline-sync--queue)
13. [Accounting — Double-Entry Engine](#13-accounting--double-entry-engine)
14. [Wallet Gateway (EasyPaisa / JazzCash)](#14-wallet-gateway-easypaisa--jazzcash)
15. [AI Agent — Provider Hub + Tools](#15-ai-agent--provider-hub--tools)
16. [Printing, Barcode, QR, Labels](#16-printing-barcode-qr-labels)
17. [Bilingual, Accessibility, Theming](#17-bilingual-accessibility-theming)
18. [API Surface (Code.gs Router)](#18-api-surface-codegs-router)
19. [Frontend Architecture (App_* .html)](#19-frontend-architecture-app_--html)
20. [Verification Gates & Quality Bars](#20-verification-gates--quality-bars)
21. [Deployment — Clasp & Manual](#21-deployment--clasp--manual)
22. [Rebuild Roadmap — Step-by-Step for a New Team](#22-rebuild-roadmap--step-by-step-for-a-new-team)
23. [Appendices — File Map, Number Series, Settings Registry](#23-appendices--file-map-number-series-settings-registry)

---

## 1. Executive Summary
**Haseeb Autos** is a retail + wholesale auto-parts, car & bike decoration ERP running **100% on Google Cloud without servers**: `Google Sheets = database`, `Apps Script = backend`, `vanilla JS PWA = frontend`. It covers **30+ sheets, 9 roles, 3 branches, 422+ products, 4 dedicated mobile PWAs, offline queue, double-entry accounting, wallet payments, and a pluggable AI agent**.

**What is covered:**
- **Sell:** Enterprise POS (cards, scan, split payment, hold, loyalty, ledger closing balance, thermal receipt)
- **Buy:** PO → GRN → Purchase Return with price-history tracking
- **Stock:** Per-branch stock, bin/rack, put-away, transfers, cycle count, lots/expiry, bundles, weighted avg cost
- **Parties:** Customers/suppliers, ledgers, udhaar ageing, credit limits, price tiers
- **Money:** Receipts/payments, expenses, cash sessions (open/close, denominations, expected vs counted)
- **Orders:** Mobile order pad → Order Book → Convert to invoice
- **Warehouse & Field:** Dedicated PWAs for put-away, count, transfers, and field order taking
- **Accounting:** Vouchers, COA, trial balance, P&L, balance sheet, bank recon, wallets
- **Insights:** 6 dashboards (main + customers/receivables/payables/P&L/inventory/alerts) with pure-SVG charts
- **Admin:** Settings engine (everything configurable), users/groups, audit log, backups, translations (EN/Roman/Urdu + RTL), notifications, import/migration, AI

**Coverage:** 14 sidebar modules + 8 warehouse tabs + 7 accounting tabs + 4 PWAs = **~80 screens, 476 tab checks, 245 smoke checks, 470 logic assertions — all green.**

---

## 2. Vision, Business Context & Users
**Business:** Haseeb Autos — Auto parts, decoration, retail (walk-in) + wholesale (dealers).  
**Branches:** `LOC-SDQ` Sadiqabad City (default), `LOC-MCH` Machi Goth, `LOC-RYK` RYK Branch.  
**Users (seeded):**

| Username | Role | Default Perms | Purpose |
|---|---|---|---|
| owner | OWNER | * | Full admin |
| manager | MANAGER | sales, items, purchase, reports, users | Branch manager |
| sales1 | SALESMAN | pos.sell, items.view, customers.view | Counter salesman |
| purchase | PURCHASE | purchase.* , suppliers | Buyer |
| warehouse | WAREHOUSE | stock.*, purchase.grn | Stock keeper |
| accountant | ACCOUNTANT | reports.financial, payments.* | Finance |
| cashier | CASHIER | pos.sell + cash drawer | Cashier |
| delivery | DELIVERY | view-only | Delivery |
| other | OTHER | minimal | Read-only |

**Roles are extensible via `Groups` sheet** — each group defines `permissions[]`, `saleReturnLimit`, `dataViewLimit`, and per-user `extraPermissions`/`deniedPermissions` override the role.

---

## 3. Technology Stack & Principles
- **Backend:** Google Apps Script (`.gs`, ES5, `LockService`, `SpreadsheetApp`, `CacheService`, `PropertiesService`, `UrlFetchApp`)
- **Database:** Google Sheets (one spreadsheet, `SCHEMA` defines 35+ sheets + headers; `DB.gs` is the ORM)
- **Frontend:** Vanilla JS + HTML templates (`Index.html` shell + `Styles.html` + 14 `App_*.html` modules), no framework, no bundler, no external CDN (offline-first)
- **PWA:** `Pwa_Shell.html` shared shell (installable, offline queue, sync, manifest data-URI, safe-area, 48px taps, 16px inputs)
- **Charts:** Pure SVG (no chart lib) — donut, bars, area, sparkline, gauge
- **QR/Barcode:** Built-in offline QR encoder (`App_QR.html`, `Barcode.gs` Code39/EAN-13), `BarcodeDetector` + camera fallback
- **AI:** Pluggable provider hub (`AI.gs`, `AI_ProviderHub.gs` — Gemini/OpenAI/OpenRouter/Mock + 17 tools)
- **Principles:** Hardcode nothing — every label/tab/field/price tier/workflow/print size lives in `Settings` sheet and is editable via `Config.gs` → `App_Config.html`. Single source of truth = `Schema.gs`.

---

## 4. High-Level Architecture
```
[ Browser PWA / Desktop ]  ←→  [ Apps Script Web App (Code.gs doGet/doPost) ]  ←→  [ Google Sheets ]
        │                                   │                                     │
   Pwa_Shell.html                      API router (api=)                     Schema.gs → sheets
   Index.html + App_*                 Auth → RBAC → Handler                DB.gs (cache, CRUD, NumberSeries)
   offline queue (localStorage)       Audit before/after                   Stock moves, Ledger, etc.
   service worker (static host)       Triggers (time-driven)               Drive/Properties for secrets
```

- **Request:** `google.script.run.api({action, payload, token})` → `Code.gs` → `Auth.verify` → `Handler` → `DB` → `Sheets` → `{ok, data/error}`
- **PWA:** `Pwa.bootstrap({app, locationId})` returns filtered `items/customers/stock` for that app + location; mutations are queued (`OfflineSync.gs`) and flushed via `pwa.sync`.
- **Number series:** `NumberSeries` sheet (`entity, locationId, prefix, next, padding`) generates `INV-*, PO-*, GRN-*, ORD-*` atomically under lock.

---

## 5. Data Model — Sheets as Database (Schema.gs)
**Single source:** `Schema.gs` defines every sheet + columns. `Setup.gs` creates/headers them. Key sheets:

**Core/Config:** `Settings(id,key,value,type)`, `NumberSeries`, `Locations`, `Translations`, `CustomFields`, `MenuConfig`, `PrintTemplates`, `SavedViews`, `NumberSeries`

**Security:** `Groups`, `Users(id,username,fullName,passwordHash,salt,role,groupId,locationIds,extraPermissions,deniedPermissions)`, `AuditLog`, `Messages`, `LoyaltyLedger`, `PriceImports`, `MigrationLog`

**Products:** `Items(…code,name,category,brand,unit,barcode,costPrice,retailPrice,wholesalePrice,stock,rack,binId,isBundle,isService,customFields,lineItem…)`, `ItemPrices`, `CustomerTypes`, `Discounts`, `Categories`, `Brands`, `Units`, `TaxCodes`, `Bundles`, `PriceLists`

**Inventory/Warehouse:** `Stock(itemId,locationId,qty,avgCost,binId)`, `Warehouses`, `Bins`, `BinStock`, `StockLots(lotNo,expiry,qty,cost)`, `StockMoves`, `Transfers`, `StockAdjustments`, `Warehouses`

**Parties:** `Customers`, `Suppliers`, `Ledger(partyType,partyId,refType,refId,debit,credit,balance)`

**Sales:** `Sales(invoiceNo,date,locationId,customerId,subtotal,discount,tax,total,paid,change,due,paymentMethod,payments,status)`, `SaleItems`, `SaleReturns`, `HoldBills`

**Orders:** `Orders(orderNo,customerId,status,priority,channel,subtotal,total,advance,balance,saleId,clientId)`, `OrderItems`

**Purchase:** `PurchaseOrders(poNo,supplierId,status,subtotal,total)`, `PurchaseOrderItems(qty,rate,receivedQty,discount,retailPrice,prevPrice,priceChange)`, `GRN(grnNo,poId,subtotal,freight,total)`, `GRNItems`, `PurchaseReturns`

**Salesman Consignment (v2.6):** `SalesmanStock`, `SalesmanIssues`, `SalesmanIssueItems`, `SalesmanSales`, `SalesmanReturns`, `SalesmanSettlements`

**Money:** `Receipts`, `Payments`, `Expenses`, `CashSessions`, `CashCounts`

**Accounting (v2.5):** `Vouchers`, `VoucherLines`, `COA`, `Banks`, `BankTxns`, `WalletTxns`

**Full list:** 38 sheets — see `Schema.gs` for exact columns (add a column there + `Setup.repairSchema()` to migrate without data loss).

**Costing:** Weighted average — `avgCost = (oldQty*oldAvg + inQty*inCost) / (oldQty+inQty)` on every GRN/sale/adjustment; `StockMoves` logs every in/out with balance.

---

## 6. Security — Auth, Roles, Permissions, Groups
- **Auth:** `Auth.gs` — `username/password` (PBKDF2 hash + salt), `token` (Properties + Cache), `role` + `groupId`. `login` → token + `Users` row; `verify(token)` on every `api` call.
- **RBAC:** Permission strings like `sales.view`, `stock.adjust`, `purchase.grn`, `reports.financial`, `ai.use`, `pos.sell`. Each `Groups` row holds `permissions: ["perm", …]`. `Users.extraPermissions` grants, `deniedPermissions` revokes. Checks are `Auth.can(user, perm)`.
- **Data scoping:** `locationIds` on user; queries filter by `locationId`. `dataViewLimit` caps rows.
- **Audit:** `Audit.gs` logs `before/after` JSON for every write to `AuditLog`; `AuditLog` screen shows diff.
- **Locking:** `LockService.getScriptLock()` around number-series + stock writes + `flush()`.

---

## 7. Core Modules — Feature Matrix
| # | Module (App_*.html) | Key Tabs | Top Features |
|---|---|---|---|
| 1 | **Dashboard** (`App_Dashboards.html`) | KPIs, charts, quick actions | MTD sales/profit, low stock, receivables, shop open/close, denomination counter, variance |
| 2 | **POS** (`App_POS2.html` / `Pwa_POS.html`) | Sell / Held / Recent | Cards rail, scan, bulk, tier pricing, split payment, hold, loyalty, ledger closing balance |
| 3 | **Items** (`App_Masters.html` Items) | List, categories, prices | As-you-type, variants, bundles, expiry, serial, gallery, custom fields, price lists |
| 4 | **Inventory** (`App_Inventory2.html`) | Overview, Count, Audit, Movements, Bins | Cycle count (blind), audit accuracy, bin stock, lot/expiry, adjustments |
| 5 | **Parties** (`App_Masters` Cust/Supp) | Customers, Suppliers, Ledgers | Ledgers, udhaar ageing, credit limit, price tier, ledger balance movement (prev/new/closing) |
| 6 | **Purchase** (`App_Screens` Purchase) | PO, GRN, Returns | PO draft→approve→GRN, price-change tracking, freight, returns |
| 7 | **Reorder** (`App_Reorder`) | Suggestions, Rules, Generated POs | MIN_MAX / REORDER_POINT / VELOCITY, cover days, safety stock, auto-PO |
| 8 | **Orders** (`App_Orders` + `App_Screens` TakeOrder) | Order Book, Take Order | Mobile pad, DRAFT→DELIVERED, convert to invoice, advance |
| 9 | **Payments** (`App_PayUI` + `App_Screens` Money) | Receipts, Payments, Expenses, Cash Sessions | Voucher-backed, shop sessions, denomination |
| 10 | **Accounting** (`App_Accounting`) | 7 tabs incl. Vouchers, COA, Banks, Reports | Double-entry, trial/P&L/BS, bank recon, wallets |
| 11 | **Warehouse** (`App_Warehouse`) | 8 tabs | Bins, put-away, bin transfer, stock lots |
| 12 | **Reports** (`App_Dashboards` + `Reports.gs`) | 10 reports | Sales, stock, receivables/payables, party balances, profit, cash book |
| 13 | **Settings** (`App_Config`) | 7 groups × sub-tabs | Everything editable: business, POS, inventory, trade, modules, automation, security |
| 14 | **AI** (`App_AI`) | Chat, Tools, Config | 17 tools, Gemini/OpenAI/OpenRouter, auto-fill translations |
| 15 | **Users** (`App_Screens` Users) | Users, Groups, Permissions, Audit | Group perms, per-user allow/deny, tri-state rules |
| 16 | **Shop** (`App_Dashboards` Shop) | Session, KPIs, Cash in/out, History | Expected cash, closing report (Print/PDF/WhatsApp/CSV) |
| 17 | **PWA Hub** (`App_PwaHub`) | Links + QR | 4 dedicated PWAs with install QRs |

---

## 8. Module Deep Dives & UI Flows

### 8.1 Dashboard
- **KPIs:** Today sales, MTD profit, receivables, payables, stock value, low/out count
- **Charts:** Area (sales 7d), donut (category), bars (top items), gauge (shop)
- **Actions:** New sale, Add item, Receive udhaar, Shop close, Reorder, P&L, Warehouse, Ask AI — all deep links

### 8.2 POS (Enterprise)
- **Header:** Business + branch (`LOC-SDQ`) + head search (Ctrl+K) + net + cart
- **Sell:** Customer card (tier + ledger due) → Customer field (`pos.customerBar` toggle) → Search pill (scan 📷 + bulk ＋ via `PWA.openBulkPicker`, toggles `pos.cartBulkScan/cartPicker`) → Category pills/rail → Grid 2→4 cols → Cards (code, name, price tier, stock chip, category)
- **Cart:** Sticky desktop (`ent-cart` 360-400px) + drawer mobile (`au-drawer`). Inline add (`pos.cartInlineAdd`) with 140px picker, discount, ledger closing balance (prev + this invoice − paid = closing, color due/ok), payment grid (Cash/Card/JazzCash/EasyPaisa/Raast/Credit), amount received + Exact/Round 500/+500, Clear/Hold F2/Pay F9, keyboard shortcuts
- **Held:** List of `HoldBills` → Resume (restores cart + customer)
- **Recent:** `Pwa.bootstrap.recent` → invoiceNo + status
- **Design systems:** Atelier (warm paper), Horizon (ink amber split-shell), Aurora (cream sky icon rail) — all pass `check_pwa` (≥48px taps, 16px inputs, safe-area)

### 8.3 Items & Inventory
- **Items:** SmartTable (filter every field, facet, column picker, density, saved views, CSV). Fields: code, nameUr, category/brand/make/model/year/engine, unit, barcode/altBarcodes, cost/retail/wholesale/minPrice, tax/hsn, minStock/reorder, rack/bin, image, gallery, variants, customFields, favourite, lineItem taxonomy
- **Inventory:** Per-location `Stock` + `BinStock`; `StockMoves` ledger; Transfers (branch→branch); Adjustments (system vs counted); Bundles (kits); Lots (expiry)
- **Warehouse:** 8 tabs — Overview, Inventory, Count sheets (scope: warehouse/bin/category/search/zero/low, blind entry, post & adjust), Audit (accuracy = matched/counted *100), Movements, Bins & racks, Stock by bin, Put-away/move

### 8.4 Purchase
- **PO:** `poNo` (number series), supplier, location, expected, lines (qty, rate, discount, retail/wholesale, prevPrice/prevDate/priceChange), status DRAFT→APPROVED→PARTIAL→CLOSED, budgetLimit, printed
- **GRN:** Against PO (ordered/received/now), freight, expiry, creates `Stock` + `StockMoves` + `StockLots` + updates `avgCost`, posts voucher if `accounts.autoPost`
- **Price history:** `prevPrice` from last GRN/Sale, `priceChange` + `priceChangePct` shown

### 8.5 Parties
- **Customers/Suppliers:** Type, creditLimit, openingBalance, priceTier (RETAIL/WHOLESALE), points, customFields
- **Ledger:** Every sale/payment/GRN/return writes `Ledger(debit/credit/balance)`; `balance` is debit-positive
- **Movement report:** Prev (before range) + New (in range) − Paid = Closing; Party balances aggregates both parties

### 8.6 Orders & Salesman
- **Take Order (mobile):** Full-screen pad, large search, +/−, customer picker, advance/date/note, sticky totals → `Orders` DRAFT
- **Order Book:** Pipeline (counts/value/advance), status moves DRAFT→CONFIRMED→PICKING→PACKED→DELIVERED, cancel, **Convert to invoice** → `Sales.create` (same stock/ledger/loyalty/accounting as POS)
- **Salesman (consignment):** Issue (branch→salesman) → Sale (salesman reduces) → Return → Settlement (sold+ cash + remaining)

### 8.7 Money & Shop
- **Payments:** Receipts (customer) / Payments (supplier) / Expenses (with category, bill ref, paid-from account)
- **Shop:** Open (denomination counter: 5000…10) → Session (KPIs, cash in/out, expected) → Close → Closing report (payments, expenses, top items, hours, signatures for cashier+manager, Print/PDF/WhatsApp/CSV)

### 8.8 Reports
- **10 reports:** P&L (with COGS), Balance sheet (balanced), Cash book, Ledger, Receivables/Payables/Party balances (prev/new/closing), Sales/stock, Reorder suggestions, Audit

### 8.9 Settings (Config.gs)
Groups: Business / POS / Inventory / Trade / Modules / Automation / Security — each group → `defs()` → sub-tabs. Examples: `pos.cartInlineAdd`, `pos.customerBar`, `pos.cartPicker`, `pos.cartBulkScan`, `pos.priceTier`, `print.sizes` (58/80/110 thermal + A4/A5/HALF), `accounts.autoPost`, `tax.mode`, `warehouse.lots`, `notifications.*`, `ai.*`. UI is generated from `Config.defs()` — add a key there → auto appears in Settings.

---

## 9. End-to-End Business Flows
**Sale (POS → Ledger → Stock → Voucher):**
`Scan/search → addToCart (tier price) → discount → choose customer (ledger + tier) → split payment (Cash/Card/Wallet/Credit) → checkout → payload {locationId,customerId,items[]} → Pwa.pos.sell / Sales.create → validate stock → deduct Stock → write Sale + SaleItems → Ledger(debit total) → StockMoves(out) → Loyalty points → Voucher (if autoPost) → print thermal 80mm (isolated @page, no app bleed) → queue if offline`

**Purchase (PO → GRN → Stock → Payable):**
`Create PO (supplier, items, rates) → Approve → GRN (ordered/received/now, freight) → avgCost recalc → Stock+ → Ledger(credit payable) → Payable ↑ → Voucher`

**Count (Blind):**
`New count sheet (scope) → freeze systemQty → entry (scan/type, Enter to jump) → progress + variance → Post & adjust → Adjustment posted (Stock corrected, Moves logged, lastCountedAt stamped)`

**Order → Invoice:**
`Take Order (mobile) → Order DRAFT → Book (confirm/pick/pack) → Convert → Sale (same as POS) → balance = total − advance`

**Cash session:**
`Open (count denominations, expected) → Sell/Pay/Expense → Close (count again, variance = counted − expected, reason) → Closing report`

---

## 10. PWA Dedicated Apps (Warehouse / Field / Salesman / POS)
- **Shell:** `Pwa_Shell.html` v2.19 INDUSTRY POLISH — installable (beforeinstallprompt, Install CTA, shortcuts, data-URI manifest + apple-touch-icon), offline queue (localStorage), sync, SW on static hosts, safe-area, 48px taps, 16px no-zoom, glass cards, dark/light/auto, a11y, Roman Urdu
- **Routing:** `Pwa.gs doGet(?app=wh|fo|sm|pos)` → `Pwa_Shell` + `Pwa_{Warehouse,Field,Salesman,POS}.html` (each `Pwa.APPS.*` registered)
- **Warehouse:** Tabs `receive/putaway/count/transfer` — bin scan, PO GRN, count sheet, bin transfer
- **Field (FO):** Order pad for field salesman — customer + items + advance → `pwa.fo.order` → `Orders`
- **Salesman (SM):** Stock view, sell (`pwa.sm.sell`), collect (`pwa.sm.collect` with voucherNo), settlement
- **POS (Aurora v5.0):** See §11 — slim 20 items for preview, full 422 via bootstrap in prod

---

## 11. POS — Enterprise Design Systems (Atelier → Horizon → Aurora)
All three are **complete redesigns from scratch** (not cloned `pos-hero`), all pass `audit_layout 0 @390/1024/1440` + `check_pwa`:

| Version | Inspiration | Palette | Shell | Distinct |
|---|---|---|---|---|
| **v3 Atelier** | Boutique atelier / souk | Paper `#F8F6F0`, Ink `#0f172a`, shelf | Topbar ink + paper cards, tactile grid | Warm, editorial serif |
| **v4 Horizon** | Lightspeed enterprise + KASA | Slate `#f1f5f9`, Ink `#0f172a`, Amber `#f59e0b` | Split-shell `260px rail | 1fr | 400px sticky cart`, glass header | Dense, amber, split |
| **v5 Aurora** | **Ronas IT CosyPOS** + KASA/Kopag (Dribbble) | Cream `#fefcf9`, Sky `#0ea5e9`, Stone | Glass white header + **72px icon rail** + cream cards + sky accent | **Current — cream sky, icon rail, glass** |

**Aurora enterprise traits (requested):** Icon rail (not text list), glass header (not ink), sky accent (not amber), 2→4 col grid with `1.2` thumb, sticky cart desktop + drawer mobile, ledger closing balance color (due red/ok green), inline add, bulk, scan, F2/F9/Ctrl+K. **Not using current Horizon theme.**

---

## 12. Offline, Sync & Queue
- **Catalog pull:** `Pwa.bootstrap` caches `items/customers/stock` in `localStorage`
- **Queue:** Every `Pwa.call(..., {queueable:true})` on `!navigator.onLine` or failure → `queue` (max 200, `Settings offline.maxQueue`) with `clientId`
- **Banner:** Persistent offline banner + `queuedCount()` + `lastSync`
- **Sync:** `pwa.sync` → server processes queue idempotently (`clientId` dedup for Orders), returns `synced/failed`, `PWA.onSynced()` → `PWA.reload()`
- **Demo mock:** `tools/build_pwa_demo.py` injects `MOCK_BRIDGE` (200KB → slim 20 items + escaped `<`) so preview works without backend

---

## 13. Accounting — Double-Entry Engine
- **COA:** 1000 Cash (1010-1030 counters), 1100-1140 Banks (HBL/Meezan/JazzCash/EasyPaisa/Raast), 1200 Receivable, 1300 Inventory, 2000 Payable, 3000 Capital, 4000 Sales, 5000 COGS, 6000 Expenses — editable via `Chart of accounts`
- **Vouchers:** `Transactions` (day book) + `New voucher` (Dr/Cr live diff, never delete, only `VOID`)
- **Posting:** If `accounts.autoPost=true`, Sale/GRN/Payment/Expense auto-creates voucher; `Backfill vouchers` for old data
- **Reports:** Trial (bal>0 debit else credit), P&L (with closing stock block), Balance sheet (balanced), Cash book, Ledger — all `normalSide` DR/CR aware
- **Banks:** Book + Reconciliation (CSV import → auto-match → clear/unclear)
- **Conventions:** `balance = opening + Σdebit − Σcredit`, debit-positive

---

## 14. Wallet Gateway (EasyPaisa / JazzCash)
- **Settings:** `wallets` group — `OFF/SANDBOX/LIVE`, merchantId, username/password, hash/salt, base URL
- **POS flow:** Choose `JazzCash/EasyPaisa` → panel asks `from (customer 03x) + to (merchant wallet)` → `Request` → gateway sends OTP/MPIN → auto-poll every `wallet.autoPollSeconds` (5s) → `PAID` → txnId filled → sale completes
- **Sheet:** `WalletTxns(payer,receiver,amount,status,providerResponse)` — credentials never logged
- **Specs in code:** EasyPaisa REST v4 `initiate-ma-transaction` with `Credentials: base64`, JazzCash `DoTransaction` with `pp_Amount` in paisa + `HMAC-SHA256` sort

---

## 15. AI Agent — Provider Hub + Tools
- **Hub:** `AI_ProviderHub.gs` — providers `GEMINI/OPENAI/OPENROUTER/MOCK`, rotation, key in `ScriptProperties`, `ai.*` settings (model, temp, failover)
- **Agent:** `AI.gs` — chat with function calling (17 tools): `items.search`, `stock.get`, `sales.create`, `customers.search`, `orders.create`, `reports.*`, `ai.translate`, etc.
- **Bilingual AI:** `Lang.auto` — fills empty `Translations` keys (en→roman→ur) in 25-key batches via Gemini
- **UI:** `App_AI.html` (chat + test), `App_AIConfig.html` (provider + key + model + test), `AI` screen in main app

---

## 16. Printing, Barcode, QR, Labels
- **Print.sizes():** 58/80/110 thermal (`size:auto`, roll) + sheets `A4/A5/HALF` exact mm — `Print.gs` resolves size → `@page size:80mm auto` for thermal, `size:A4` for sheet
- **Isolation:** `buildPrintDoc(inner)` + `openIsolatedPrint(html)` + `receiptPrintRoot` + `@media print { body>*:not(.receipt-print-root) {display:none}}` — no overlay/scrim bleed, preview (scrollable, repeating conic bg) + print consistent
- **Receipt (comprehensive):** Header (biz/NTN/branch/phone), meta (invoiceNo/date/branch/salesman/customer), bill-to, item table (code/hsn/qty/unit/rate/disc/tax), totals (sub/discount/tax/total + words), payment (fee/FED/net + method), ledger (Previous/This invoice/Paid now/Closing balance color + credit limit + change), barcode + QR, terms/signatures, powered-by
- **Barcode/QR:** `Barcode.gs` (Code39/EAN-13 strings), `App_QR.html` offline encoder (no CDN), `QR.dataUrl(payload)` tries offline → network fallback

---

## 17. Bilingual, Accessibility, Theming
- **Lang:** `Lang.gs` + `Translations` sheet (`key,en,roman,ur`). Nav `#EN` cycles EN→RO→UR (UR = RTL), double-click = editor. Missing key → EN fallback. `Bilingual.gs` helpers
- **A11y:** `focus-visible`, `aria-live` toasts, 16px inputs (no iOS zoom), `prefers-reduced-motion`, tabular nums, 48px taps, safe-area
- **Theme:** `data-theme` light/dark/auto + `prefers-color-scheme`, glass cards, accent gradients

---

## 18. API Surface (Code.gs Router)
All client calls go `google.script.run.api({action,payload,token})`. Key actions (see `Pwa.gs` + `*.gs`):

`auth.login`, `auth.me`, `pwa.bootstrap`, `pwa.sync`, `pwa.wh.receive/putaway/transfer/count`, `pwa.wh.po.get/count.get/audit`, `pwa.fo.order`, `pwa.sm.sell/collect`, `pwa.pos.sell`, `items.search/save`, `stock.get/adjust/transfer`, `sales.create/return`, `purchase.po.save/approve/grn`, `customers.save`, `orders.create/convert`, `accounting.voucher.*`, `wallet.request/poll`, `reports.*`, `ai.chat`, `lang.auto`

Each handler is `function(payload, session)` → `{ok, data}` or `{ok:false, error}`; `session` holds `userId, role, group, locationId`.

---

## 19. Frontend Architecture (App_* .html)
- **Shell:** `Index.html` (nav + `Pwa_Shell` include) + `Styles.html` (v3 patched: 18px/68vh, zoom var) + `App_Core.html` (router, `PWA` global, `el()` helper)
- **Modules:** Each `App_*.html` registers `PWA.APPS[app]` or main `SPA` routes (`dashboard` via `App_Dashboards`, `sales` via `App_Screens`, etc.). `App_UI2.html` provides `nested tabs, offcanvas, modal, SmartTable, form builder, customer field, bulk picker`
- **SmartTable:** As-you-type filter every field, facet filters, column picker, density, saved views (⭐), CSV, sticky header, internal scroll — used on every list
- **Build:** `tools/build_demo.py` → `demo/index.html` (1468 KB), `tools/build_pwa_demo.py` → `demo/pwa-*.html` (120-280 KB slim), `tools/build_static.py` → `demo/manifest + sw`
- **Checks:** `tools/check.sh` (35 blocks), `tools/check_pwa.js` (tap ≥48px), `tools/audit_layout.js` (0 problems @390/1024/1440)

---

## 20. Verification Gates & Quality Bars
Run `bash tools/verify.sh` (nohup, env `HOME=-u` + `LD_LIBRARY_PATH` for Chrome):

| Gate | Script | What |
|---|---|---|
| `check` | `check.sh` | GS syntax + HTML script blocks |
| `logic` | `mock_gs.js` | 470 assertions (stock, tax, ledger, accounting, wallet, orders) |
| `ui` | `audit_*` | Labels, empty content, icons, typography |
| `smoke` | `smoke.js` | 245 checks (every screen/tab/action, 66 deep links, POS paint <4s, virtual grid <200) |
| `tabs` | `audit_tabs.js` | 476 checks (every sub-tab not blank, Settings groups) |
| `align` | `audit_align.js` | Modal center / offcanvas right-edge |
| `layout` | `audit_layout.js` | 0 problems @390/1024/1440 light+dark, ≥32px taps, ≥10.8px text |
| `pwa` | `check_pwa.js` | Installable, offline, ergonomics |
| **ALL GREEN** | `verify.sh` | End gate |

**Manual:** `LD_LIBRARY_PATH=… HOME=/home/user node tools/smoke.js` passes; `demo/*` screenshots via `tools/shot_pwa.js`.

---

## 21. Deployment — Clasp & Manual
**Clasp (recommended):**
```bash
npm i -g @google/clasp
clasp login
clasp create --type standalone --title "Haseeb Autos"
# copy .clasp.json → clasp.template.json
clasp push
# In Apps Script editor: Setup.gs → setupAll → Run → Authorize → check Sheets created
# Deploy → New deployment → Web app → Execute as: Me, Access: Anyone → copy /exec URL
# Login owner/admin123 → change password → Settings → AI → add key → daily triggers
```

**Copy-paste (no clasp):** Create new Apps Script project → paste each `apps-script/*.gs` + `*.html` → save → `setupAll`.

**Static PWA hosting:** `tools/build_static.py` → `demo/manifest + sw` → upload to any static host; Apps Script `/exec` scope uses inline data-URI manifest.

**Secrets:** AI keys, wallet creds → `PropertiesService.getScriptProperties()` (never Sheets), rotation via `Utils.setAIKey`.

---

## 22. Rebuild Roadmap — Step-by-Step for a New Team
**If you supply this document to rebuild from zero, follow in order:**

**Week 1 — Foundation**
1. Create `appsscript.json` (timezone Asia/Karachi, scopes `spreadsheets, properties, urlfetch, drive`)
2. Implement `Schema.gs` (38 sheets) + `DB.gs` (getAll, getById, save, remove, cache, numberSeries under lock) + `Setup.gs` (`setupAll` creates spreadsheet, seeds Locations/Users/Groups/Settings, `repairSchema` for migrations)
3. Implement `Auth.gs` (PBKDF2, token, RBAC, groups) + `Code.gs` router (`doGet` serves `Index.html` or `?app=wh`, `doPost` api)
4. Build shell `Index.html` + `Styles.html` + `App_Core.html` (router, PWA global, toast, haptic) + `Pwa_Shell.html` (queue, sync, install)

**Week 2 — Catalog & Stock**
5. `Items.gs` + `Inventory.gs` (weighted avg, StockMoves, Transfers, Adjustments) + `Parties.gs` (ledger)
6. Frontend `App_UI2.html` (SmartTable, offcanvas) + `App_Masters.html` (items/customers/suppliers) + `App_Inventory2.html` (count/audit)
7. Seed `Seed_Products.gs` (71 Flamingo + parse `products.json`) + `PriceImport.gs` + `Discounts`

**Week 3 — Sell & Buy**
8. `Sales.gs` (`create` with tax exclusive/inclusive, discount-before-tax, ledger, loyalty) + `Purchase.gs` (PO→GRN with priceChange) + `Payments.gs` (receipts/expenses) + `Reorder.gs`
9. Frontend `App_POS2.html` (cards rail, scan, split payment, hold) + `App_Screens.html` (sales/purchase lists) + `App_Reorder.html`
10. `Pwa_POS.html` v5 Aurora (icon rail + glass header + sticky cart + ledger closing balance + thermal receipt isolation) + `build_pwa_demo.py` slim (20 items, single-app bootstrap, escaped `<`)

**Week 4 — Orders, Warehouse, Money**
11. `Orders.gs` + `Salesman.gs` (consignment: issue/sale/return/settlement) + `Warehouse.gs` (bins, put-away, lots)
12. Frontends `App_Orders.html`, `App_Warehouse.html` (8 tabs), `App_Screens` TakeOrder, `App_Salesman.html`
13. `Pwa_Warehouse/Field/Salesman.html` + `OfflineSync.gs` + `Barcodes`

**Week 5 — Accounting, Wallets, Reports**
14. `Accounting.gs` (COA, vouchers, trial/P&L/BS, bank recon) + `Wallet.gs` (EasyPaisa REST v4 / JazzCash HMAC) + `Reports.gs` (10 reports, party movement)
15. Frontends `App_Accounting.html` (7 tabs), `App_PayUI.html`, `App_Dashboards.html` (6 dashboards, pure SVG), `App_Print.html`

**Week 6 — Config, AI, Polish**
16. `Config.gs` (defs → Settings groups, custom fields, menu builder, print templates) + `App_Config.html` + `CustomFields` + `MenuConfig`
17. `AI.gs` + `AI_ProviderHub.gs` (17 tools) + `Lang.gs` + `Bilingual.gs` (EN/RO/UR + editor) + `Notifications.gs` + `Media.gs`
18. `Pwa_Icons.gs`, `Print.gs` sizes, `Bilingual` RTL, theming, 48px taps, `audit_layout` 0

**Week 7 — QA & Ship**
19. Implement `tools/` — `mock_gs.js`, `gen_pwa_data.js`, `build_*`, `check*`, `audit_*`, `smoke.js` (245 checks), `verify.sh`
20. Run **ALL GATES GREEN**, screenshots (`shot_pwa.js` 390/1024), package `release/haseeb-autos-vX.zip`, write deployment guides (`DEPLOYMENT.md`, `PWA-URLS-GUIDE`, `FIRST-SETUP-GUIDE.html`)

**Effort:** ~7 weeks, 2 engineers (backend + frontend), ~35 .gs + 26 .html files, ~3.5k lines backend + ~2k frontend + ~400 tests.

---

## 23. Appendices — File Map, Number Series, Settings Registry

**File Map (what to push via clasp):**
```
apps-script/
  appsscript.json, Code.gs, Schema.gs, DB.gs, Setup.gs, Auth.gs, Utils.gs, Bilingual.gs, Lang.gs,
  Items.gs, Inventory.gs, Parties.gs, Sales.gs, Purchase.gs, Reorder.gs, Orders.gs, Salesman.gs,
  Payments.gs, PayMethods.gs, Wallet.gs, Accounting.gs, Reports.gs, Reports2.gs, Warehouse.gs,
  Config.gs, Notifications.gs, Media.gs, Barcode.gs, Print.gs, Loyalty.gs, Comms.gs,
  OfflineSync.gs, Audit.gs, Diagnose.gs, Exports.gs, Triggers.gs, AI.gs, AI_ProviderHub.gs, AI_Adapters.gs,
  Pwa.gs, Pwa_Icons.gs, Seed_Products.gs
  Index.html, Styles.html, App_*.html (14), Pwa_*.html (5)
```

**Number Series (prefix + padding):**
`INV- (sales)`, `PO-`, `GRN-`, `ORD-`, `RET-`, `VCH-`, `TRF-`, `ADJ-`, `CNT-`, `ISS-` — all per `locationId`, `next` auto-increments under lock.

**Settings Registry (Config.defs() excerpt — 60+ keys):**
`business.name, business.nameUr, business.currency, business.ntn, locations.*, pos.customerBar, pos.cartInlineAdd, pos.cartPicker, pos.cartBulkScan, pos.priceTier, pos.hold, pos.loyalty, pos.printSize, print.sizes, inventory.lots, inventory.bins, trade.creditLimit, trade.priceImport, modules.*, automation.reorder.*, security.*, ai.provider, ai.model, accounts.autoPost, warehouse.*` — add a key → auto appears in `Settings`.

**Print sizes:** `Print.sizes()` → 58/80/110 thermal (`size:auto`) + A4/A5/HALF exact mm, `@page size:80mm auto` for thermal, `size:A4` for sheet, isolated `receiptPrintRoot`.

---

**Deliverables in this release (v2.22.0 Aurora):**
- `apps-script/` — clasp-ready source (35 .gs + 26 .html, 35 blocks 0 invalid)
- `demo/index.html` 1468 KB + `demo/pwa-pos.html` 166 KB (Aurora, 20 items slim, leak false) + `demo/pwa-{wh,fo,sm}.html`
- `release/haseeb-autos-v2.22.0.zip` (2.7 MB) + PDF guides (optional)
- Tools for verify: `bash tools/verify.sh` → ALL GATES GREEN

**Next to do (for your rebuild team):** Supply this document + `Schema.gs` + `Config.defs()` as the contract; start with §22 Week 1 and keep `verify.sh` green at every merge.

