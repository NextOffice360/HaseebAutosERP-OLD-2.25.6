> **v2.14.1 — POS cart: multi-select add (GRN/PO-style checkbox picker), bulk scanning, aligned amount columns, wider cart rail** (supersedes v2.14.0 — install instead; nothing to reset). [Upgrade instructions](release/CHANGELOG-v2.14.1.md).

> **v2.13.2 — blank data rows after setup:** [Recovery guide](release/CHANGELOG-v2.13.2.md). Replace the source files, then **Setup.gs ▸ diagnoseSeedData ▸ Run**, followed by **Setup.gs ▸ repairSeedData ▸ Run**. Keep the existing spreadsheet. Both functions return and log their results.

> **v2.13.1 critical startup fix:** [Upgrade instructions](release/CHANGELOG-v2.13.1.md). Fixes `AI.officialEndpoint` on undefined and protected requests before login. Replace **both AI.gs and AI_ProviderHub.gs** (prefer all apps-script files), save, then deploy a **New version**. Do not reset sheets.

> **v2.13.0 AI update:** [Connection setup, automatic failover and upgrade steps](release/CHANGELOG-v2.13.0.md). Replace all Apps Script files (including AI_ProviderHub.gs), then deploy a **New version**. Existing installations need no setup reset. Enter rotated keys only in your original Apps Script web app.

# 🚗 Haseeb Autos — ERP & POS (Google Apps Script + Google Sheets)

> 🔀 **GitHub:** <https://github.com/NextOffice360/HaseebAutosERP-OLD-2.25.6> — push: `GITHUB_TOKEN=ghp_xxx bash tools/git_push.sh`
> 🚩 **Reset / naye session ke baad:** [`RESUME-HERE.md`](RESUME-HERE.md) → phir `bash tools/bootstrap.sh` (env 8s mein wapas)
> 📄 **Master spec (har task se pehle parhein):** [`APPLICATION-WIDE-SPEC.md`](APPLICATION-WIDE-SPEC.md) · copies + mapping: [`specs/README.md`](specs/README.md)


**Business:** Haseeb Autos · Auto parts, car & bike decoration · Retail + Wholesale
**Branches:** Sadiqabad City · Machi Goth · RYK Branch
**Users:** 9 roles (Owner, Manager, Salesman, Purchase, Warehouse, Accountant, Cashier, Delivery, Other)
**Stack:** Google Apps Script (backend) + Google Sheets (database) + Vanilla JS PWA (frontend) + Pluggable AI agent

> Ye poora system **bina kisi server / hosting kharche ke** aapke Google account mein chalta hai.
> Database = Google Sheets. Backend = Apps Script. Frontend = PWA (mobile + desktop + offline).

---

## 📦 Is folder mein kya hai

```
haseeb-autos/
├── apps-script/              # ← Yehi asli project hai (clasp push isi se hota hai)
│   ├── appsscript.json       # manifest (timezone, scopes, webapp)
│   ├── Code.gs               # doGet + API router (saari client calls yahan se guzarti hain)
│   ├── Schema.gs             # 30+ sheets ki definition (single source of truth)
│   ├── DB.gs                 # Sheets → database layer (cache, CRUD, number series)
│   ├── Setup.gs              # one-click setup: sheets + locations + 9 users + settings
│   ├── Auth.gs               # login, session, RBAC (role + group permissions)
│   ├── Items.gs              # products, as-you-type search, nested pricing, duplicates
│   ├── Inventory.gs          # per-branch stock, weighted avg cost, transfers, audits
│   ├── Sales.gs              # POS billing, returns, holds, stock+ledger+commission
│   ├── Purchase.gs           # PO → GRN → purchase return
│   ├── Parties.gs            # customers, suppliers, ledgers, udhaar
│   ├── Payments.gs           # receipts, payments, expenses, cash sessions
│   ├── Accounting.gs         # 📒 v2.5 double-entry engine (vouchers, COA, P&L, balance sheet, bank recon)
│   ├── Wallet.gs             # 📲 v2.5 EasyPaisa / JazzCash gateway (REST v4 / pp_ API)
│   ├── Orders.gs             # 📝 v2.5 order book — mobile order taking → invoice
│   ├── Reports.gs            # dashboard KPIs + 10 reports
│   ├── Config.gs             # ⚙ v2 config engine — Settings UI isi schema se banti hai
│   ├── Warehouse.gs          # 🏗 v2 bins/racks, put-away, bin transfer, cycle count, lots
│   ├── Notifications.gs      # 🔔 v2 alert engine (low stock, udhaar ageing, PO, expiry)
│   ├── Seed_Products.gs      # 📦 71 asli Flamingo products (list.pdf + barcode.pdf)
│   ├── AI.gs                 # AI agent (Gemini / OpenAI / OpenRouter / Mock) + 17 tools
│   ├── Barcode.gs            # barcode generation, QR payloads, label templates
│   ├── OfflineSync.gs        # offline catalog pull + queued actions sync
│   ├── Audit.gs              # before/after audit trail
│   ├── Utils.gs              # helpers (money, dates, fuzzy search, hashing)
│   └── *.html                # PWA frontend (Index + Styles + 14 JS modules)
│       ├── App_UI2.html        # nested tabs, offcanvas, modal, SmartTable, form builder
│       ├── App_POS2.html       # POS v2 — product CARDS, category rail, cart, split payment
│       ├── App_Masters.html    # Items / Customers / Suppliers — offcanvas sub-tabs
│       ├── App_Inventory2.html # Inventory + Warehouse (count sheet, bins, lots)
│       ├── App_Config.html     # Settings & Configuration (sab kuch editable)
│       ├── App_Dashboards.html # chart engine + AI dashboards + shop open/close
│       └── App_QR.html         # offline QR encoder (koi CDN nahi)
├── demo/
│   ├── index.html            # self-contained demo (mock data) — preview ke liye
│   └── mock.js               # fake backend (sirf demo ke liye)
├── tools/
│   ├── build_demo.py         # apps-script/*.html → demo/index.html
│   ├── check.sh              # syntax check (.gs + templates)
│   ├── deploy.sh             # clasp push one-command
│   ├── package.sh            # zip bundle banata hai
│   ├── parse_products.py     # list.pdf + barcode.pdf → products.json (catalog import)
│   ├── gen_seed.py           # products.json → Seed_Products.gs + demo/products.js
│   ├── test_logic.js         # 🧪 64 business-logic tests (real .gs backend, mock Sheets)
│   ├── test_qr.js            # QR encoder matrix dump
│   ├── verify_qr.py          # QR ko reference encoder se compare
│   └── smoke.js              # 🧪 headless UI smoke test (har screen + har tab)
│   ├── build_pdf.py          # README + DEPLOYMENT → release/Haseeb-Autos-Guide.pdf
│   └── package.sh            # release/haseeb-autos-v2.1.0.zip bundle
└── docs/ (DEPLOYMENT.md)     # step-by-step deployment
```

---

## 🆕 v2 mein kya naya hai

**1. Kuch bhi hardcoded nahi — sab Settings ▸ Configuration se**
Har label, module, field, tab, price tier, category, filter, workflow, permission,
print template aur number-format **Sheets mein stored** hai aur UI se edit hota hai:
- **Business / POS / Inventory / Trade / Modules / Automation / Security** groups —
  har group ke andar **sub-tabs** (Settings screen khud `Config.defs()` schema se banti hai)
- **Custom fields** — Item / Customer / Supplier / Sale / Purchase par apne fields
  (text, number, date, select, switch) aur form-tab choose kar ke
- **Menu builder** — sidebar ka har item (label, icon, order, permission, parent) editable
- **Print templates** — receipt/label JSON template (barcode/QR on/off, size, footer)
- **Lists** — Categories, Brands, Units, Tax codes, Warehouses sab editable
- **Modules on/off**, theme (colour, density, font size), automation, security

**2. POS = product CARDS** — category rail, as-you-type filter (name/code/barcode/brand/model),
stock badge, favourites, recently-sold, held bills, qty pad, **split payment**,
**camera barcode/QR scan** (mobile), offcanvas cart (mobile), F2/F4/F8/F9 shortcuts,
Ctrl+K command palette.

**3. Warehouse first-class module** — warehouses, bins/racks, put-away, bin-to-bin transfer,
bin-wise stock, count sheet (system vs counted → adjustment), lots/expiry.

**4. AI-driven interactive dashboards** — pure-SVG charts (donut, bars, area, sparkline,
gauge, progress, heat): Main dashboard + Customers · Receivables · Payables ·
**P&L** · Inventory · Alerts, aur **Shop Open/Close** (denomination counter + variance).

**5. Har jagah quick filter** — SmartTable har table mein: as-you-type filter **har field** par,
multi-facet filters (category/brand/status/branch/date/stock), column picker, density,
**saved views (filter presets)**, CSV export, sticky header, internal scroll (**bottom scroll nahi**).

**6. Deep links** — kisi bhi jagah se drill-down: `items?open=ID`, `parties?tab=customers&open=ID`,
`sales?open=ID`, `purchase?reorder=true` — har link kaam karta hai (88 UI checks se verified).

**7. Configuration backup/restore** — Settings ▸ Data ▸ Backup/restore se poora setup
(settings + lists + menu + custom fields + templates) JSON mein export/import.

**8. Offline QR + barcode** — built-in QR encoder (internet/CDN zaroori nahi),
Code39 + EAN-13 barcodes, labels aur receipts dono par.

**9. Verified calculations** — 64 automated logic tests: weighted-average costing, COGS,
tax (exclusive/inclusive, discount-before-tax), ledger, transfers, adjustments, guards.

---

## 🆕 v2.1 mein kya naya hai

**1. 🔁 Auto Reorder engine** (`Reorder.gs` + `App_Reorder.html`) — Settings ▸ Automation ▸
*Purchase reorder rules* se sab kuch configurable (method `MIN_MAX` / `REORDER_POINT` / `VELOCITY`,
lookback days, cover days, lead time, safety stock, pack rounding, min order value,
auto-PO `DRAFT`/`APPROVE`):
- **Suggestions** tab: velocity, on-hand, on-order, suggested qty, value, priority
  (OUT_OF_STOCK / CRITICAL / BELOW_REORDER / LOW_COVER / REPLENISH)
- **Rules & preview** tab: live calculation preview (formula dikhata hai)
- **Generated POs** tab + *Create POs* → supplier-wise grouped purchase orders
- Deep link: `purchase?reorder=true` → PO draft with lines

**2. 🌐 Bilingual engine (EN / Roman Urdu / اردو)** (`Lang.gs` + `App_Lang.html`)
- Nav ki `#EN` button: click = cycle EN → RO → UR (Urdu par **RTL** layout),
  double-click / right-click = **translation editor**
- `Translations` sheet mein har key ke 3 columns (en / roman / ur) — UI se edit,
  **AI se khali keys auto-fill** (`Lang.auto`, Gemini/OpenAI/OpenRouter, 25 keys per batch)
- Koi key missing ho to English fallback — kabhi blank screen nahi

**3. 📷 POS camera scanner** — `📷 Scan` button (native `BarcodeDetector`:
Code128/39/EAN-13/EAN-8/UPC/QR) + manual entry fallback + beep on hit.

**4. ⭐ Saved views** — SmartTable ke `⭐ Views` se filter/sort/columns preset save,
apply, delete (per screen, `SavedViews` sheet).

**5. 💾 Backup / restore** — Settings ▸ Data ▸ Backup: poora config (settings + custom
fields + menu + templates + 5 lists) JSON export/import — machine change ya
naye branch setup mein 10 second ka kaam.

**6. ⚡ Dashboard quick actions** — New sale · Add item · Receive udhaar · Shop close ·
Reorder stock · P&L · Warehouse · Ask AI (sab deep links).

**7. 📲 Real PWA assets (static hosting)** — `manifest.webmanifest`, `sw.js`,
`icon-192/512.png` (cache-first app shell, network-only API). Apps Script `/exec`
scope mein inline data-URI manifest; static hosting par asli installable PWA.

**8. Offline QR everywhere** — `QR.dataUrl()` ab pehle built-in offline encoder use
karta hai (network sirf last fallback).

---

## 📘 Apps Script se deploy — mukammal guide

**[`APPS_SCRIPT_DEPLOY_GUIDE.md`](APPS_SCRIPT_DEPLOY_GUIDE.md)** — zero se live tak, Roman Urdu mein:
clasp se push, copy-paste method, `setupAll()`, Web app deployment, users/roles, AI key,
**daily triggers**, mobile PWA install, updates aur troubleshooting table.

---

## ⚡ 10 minute mein live kaisy karein (short version)

1. **Sheet + code create karein** — [script.google.com](https://script.google.com) → New project → `Setup.gs` etc. paste karein (ya clasp use karein).
2. `Setup.gs` mein function select kar ke **`setupAll()`** Run ▶ → Google authorize karein.
   → Ek naya Spreadsheet "Haseeb Autos - ERP Database" ban jata hai jisme **30+ sheets**, 3 branches aur **9 users** ready hain.
3. **Deploy ▸ New deployment ▸ Web app** → Execute as: **Me** · Access: **Anyone** → URL copy karein.
4. URL kholein → `owner / admin123` se login karein → **Password turant badlein.**
5. AI: app ke andar **AI Agent ▸ Setup** tab se (provider + key + model + test) — key khud Script Properties me jati hai. Zruri ho to editor fallback: `setAIKey("AIza...", "GEMINI")` (Utils.gs ▸ setAIKey, Run).

**Poora detail:** [`DEPLOYMENT.md`](DEPLOYMENT.md)

---

## 🔐 Default accounts (pehli login ke baad password sab se pehlay change karein)

| Username | Role | Password | Kya kar sakta hai |
|---|---|---|---|
| `owner` | OWNER | `admin123` | Sab kuch (full admin) |
| `manager` | MANAGER | `manager123` | Sales, items, purchase, reports, users |
| `sales1` | SALESMAN | `sales123` | POS billing, items dekhna, customers |
| `purchase` | PURCHASE | `purchase123` | PO, GRN, suppliers, stock |
| `warehouse` | WAREHOUSE | `ware123` | Stock, transfers, adjustments, GRN |
| `accountant` | ACCOUNTANT | `acc123` | Reports, payments, ledgers |
| `cashier` | CASHIER | `cash123` | POS + cash drawer |
| `delivery` | DELIVERY | `del123` | Sirf dekhna (sales/items) |
| `other` | OTHER | `other123` | Minimum read-only |

---

## ✨ Features (jo aapne demand kiye thay)

### 1. POS (billing)
- **As-you-type search** — jaisay hi type karein (`brk`, `corolla`, `HLG-001`) results turant, bina Enter ke
- **Barcode / QR scanner** support (scanner keyboard ki tarah type karta hai, Enter pe direct add)
- Cart: qty +/−, price edit, line discount, min-price guard
- Split payment (Cash + Card + JazzCash + Easypaisa + Bank + Cheque)
- Udhaar sale with credit-limit check · Change calculate · Hold/Resume bills
- Thermal receipt 80mm print with barcode + Urdu header
- Keyboard: **F2** search · **F4** customer · **F8** hold · **F9** pay · **Esc** clear

### 2. Inventory (3 branches)
- Har branch ka alag stock · weighted-average cost · rack/shelf
- Stock ledger (har movement ki record) · quick count
- Branch-to-branch transfer (send → in-transit → receive)
- Stock adjustment: **Draft → Post → Reverse** (audit reversal)
- Low stock alerts + reorder suggestions with estimated cost
- Negative stock block (setting se allow kiya ja sakta hai)

### 3. Items (products)
- Auto-parts fields: brand, part type, **make / model / year range / engine / chassis**
- Multiple barcodes (alternate barcodes) · auto barcode generate
- 3 price levels: cost · retail · wholesale + **customer-type based nested pricing** (qty slabs)
- Min-price guard (salesman is se neechay nahi ja sakta)
- CSV import/export · duplicate finder · bulk status change · **barcode label printing** (Code39, offline)

### 4. Purchase
PO (draft → approve) → **GRN** (stock in + cost update + supplier ledger) → Purchase return
Budget limit check · pending qty tracking · on-credit purchase

### 5. Customers / Suppliers
- Udhaar ledger with running balance · credit limits · customer types (discount tiers)
- Membership points (Rs 1000 = 1 point) · receive payment / pay supplier
- Receivables & payables reports

### 6. Reports
Dashboard (8 KPIs + 14-day trend + top items + low stock + payment mix) · Sales · Item-wise ·
Category-wise · Profit & loss · Stock valuation · Low stock · Receivables · Payables · Cash book — sab **CSV export** ke sath

### 7. Users & Security (RBAC)
- 9 roles × permission keys (e.g. `pos.discount`, `items.price.edit`, `reports.financial`)
- Groups with extra permissions + sale-return limit + data-view limit (days)
- **Audit log**: har write pe before/after snapshot, diff viewer
- Password SHA-256 + salt + pepper · session expiry 12h · branch-level data access

### 8. 🤖 AI Agent (business automation)
Frontend chat (Ctrl+K) + backend agent with **17 tools** jo aapke real data par chaltay hain:

| Tool | Example sawal |
|---|---|
| `search_items` / `price_check` | "HLG-001 kitne ka hai?" |
| `get_item_stock` | "Corolla brake pad kitna stock hai?" |
| `today_sales` / `sales_summary` | "Aaj ki sale kitni hui?" |
| `top_selling_items` | "Is month top 5 parts?" |
| `low_stock_list` / `reorder_suggestions` | "Kya mangwana chahiye?" |
| `customer_balance` / `receivables` | "Ahmad ka udhaar kitna hai?" |
| `profit_report` / `cash_position` | "Is mahine ka profit?" |
| `draft_sale` / `draft_purchase_order` | "2 brake pad + 1 oil ka bill bana do" |

**Safety:** AI sirf whitelisted tools chala sakta hai, user ki RBAC permissions ke ander,
aur write tools **draft** banatay hain (post nahi) jab tak `aiCanWrite = true` na ho.
Provider: **Gemini** (default) / OpenAI / OpenRouter — key sirf Script Property mein.

### 9. PWA + Offline
- Install karein mobile/desktop par (home screen icon, standalone window)
- **Offline billing**: internet jane par bhi POS chalta hai (local catalog + write queue),
  wapas online aate hi **auto-sync** with duplicate protection
- Mobile-first UI: bottom tab bar, touch-friendly cards, 80mm print, camera/scan support

### 10. Extras
Multi-language toggle (**English ⇄ Roman Urdu**) · Dark/Light theme · branch switcher ·
global search (items/invoices/customers) · notifications · audit trail · Drive backup ·
data purge/reindex utilities

---

## 🏗 Architecture (ek nazar mein)

```
┌──────────────────────────────────────────────────────────────┐
│  PWA Frontend (Index.html + styles + 6 JS modules)           │
│  · offline-first: localStorage catalog + write queue          │
│  · transport: google.script.run  |  JSONP  |  mock (demo)     │
└───────────────┬──────────────────────────────────────────────┘
                │  api(action, payload)  — single entry point
┌───────────────▼──────────────────────────────────────────────┐
│  Code.gs router → 60+ actions (auth, items, sales, AI…)      │
│  · session verify (CacheService) · RBAC check per action     │
└───────────────┬──────────────────────────────────────────────┘
                │
┌───────────────▼──────────────────────────────────────────────┐
│  DB layer (cache 5 min) → Google Sheets (30+ tables)         │
│  Audit log · Number series · Stock moves ledger               │
└──────────────────────────────────────────────────────────────┘
```

**Transaction safety:** Sale create = stock out + sale items + customer ledger + payment +
commission + audit — ek hi server call mein, ya to sab ho ga ya kuch nahi.

---

## 🧪 Developer commands

```bash
bash tools/verify.sh         # ⭐ SAB 13 GATES EK SATH (ye chalaayein)
bash tools/check.sh          # syntax check (.gs + html templates)
python3 tools/build_demo.py  # demo/index.html rebuild
node tools/test_logic.js     # business-logic tests (real backend, mock Sheets)
node tools/smoke.js          # headless UI smoke test — har screen + har tab
node tools/audit_schema.js   # Sheets/DB schema health (silent data-loss check)
node tools/audit_layout.js 1440 900 --dark --overlays   # asli browser: layout/contrast
node tools/verify_punchlist.js   # 16 required cheezein — acceptance gate
node tools/test_qr.js && python3 tools/verify_qr.py   # QR encoder verification
bash tools/deploy.sh         # clasp push (agar clasp installed hai)
bash tools/package.sh 2.5.2  # release/haseeb-autos-v2.5.2.zip + PDF guide
```

### Apni product list CSV se import (asli product master)

```bash
python3 tools/import_products_csv.py path/to/export.csv   # CSV → tools/products.json (+DQ report)
python3 tools/import_products_csv.py --report-only        # sirf analyze, kuch likhay baghair
python3 tools/import_products_csv.py --price-mode swap    # jahan wholesale>retail, swap kar dein
python3 tools/gen_seed.py            # products.json → Seed_Products.gs + demo/products.js
python3 tools/build_demo.py          # demo rebuild
python3 tools/gen_product_report.py  # release/product-import-report.html
```

Phir Apps Script editor mein `seedRealProducts()` chalayein — **ya** deployed app mein
Settings ▸ Data & tools ▸ Maintenance → **📦 Seed real products**.

Expected CSV columns (aapke export jaisay): `Product Code, Line Item, Category,
Sub Category, Conversion Factor, Supplier, Cost Type, Purchase Type, Made in,
Product Group, Model, Brand, Product Name, Size, Color, Cost Price,
Wholesale Price, Retail Price, Profit(%), Difference, Barcode`.

> Saari suites **green** hain — `bash tools/verify.sh` → `ALL GATES GREEN`
> (`check` 29 blocks · `schema` 0 problems · `logic` **581/0** · `ui` 0 ·
> `smoke` **308/0** · `tabs` **483/0** · `align` **36/0** · `punch` **16/16 · 117/117** ·
> 5 × `layout` **0 problems** — desktop/mobile/dark/overlays).

---

## ⚠ Important notes

- **Google Sheets limits:** ~10M cells. Is schema se lagbhag 1M+ transactions aa jayen gi;
  us ke baad purana data archive karein (Settings ▸ Data ▸ Purge) ya Firebase/SQL par migrate karein.
- **Barcode format:** Code39 (built-in, offline, har scanner par chalta hai) — catalogue ke
  71 Flamingo products mein asli EAN-13 bhi maujood hain; EAN-13 generate bhi ho sakta hai.
- **QR** ab **built-in offline** encoder se banta hai — internet/CDN ki zaroorat nahi
  (`App_QR.html`, reference encoder se byte-exact verified).
- **Service worker** Apps Script `/exec` scope mein register nahi ho sakta, is liye offline
  continuity app ke apne catalog + queue se handle ki gayi hai (installable PWA ke liye
  static hosting mode dekhein — `DEPLOYMENT.md` ▸ Mode B).

---

**Version:** 2.5.0 · **Built for:** Haseeb Autos · **License:** Aapki property — freely modify & resell.

## v2.3 features guide (WhatsApp/SMS · price-list import · loyalty · export · Firebase)

Roman-Urdu step-by-step guide for everything added in v2.3:
**[FEATURES_V23_GUIDE.md](FEATURES_V23_GUIDE.md)**

- WhatsApp (free wa.me / Meta Cloud API / Twilio), SMS, Email + outbox & retry
- Supplier price-list import (CSV paste, Gmail attachment, auto column detection, margin guard)
- Loyalty points: earn formula, POS redemption, cap/min, expiry, manual adjustment
- Export & share: Print/PDF, CSV, Excel (xls + Drive xlsx), native share
- Firebase migration: tier assessment, JSON export, Firestore import, 7-step cutover

## v2.2 feature guide (receipts · payment methods · AI agent · dashboards · verification)

Roman-Urdu guide for everything added in v2.2: **[FEATURES_V22_GUIDE.md](FEATURES_V22_GUIDE.md)**

- Professional receipts/invoices: thermal 58/80/110mm + A3/A4/A5/Half/Letter, ESC/POS, visual designer
- Invoice previous balance (ledger-accurate)
- Real payment methods: cash, card, bank, JazzCash, EasyPaisa, Raast, cheque lifecycle, credit — fee/FED/settlement formulas
- Popup alignment: offcanvas right-edge, modals centered (audited)
- AI agent configuration under Automation (provider/model/key/guardrails/tools/presets/test)
- Professional dashboards: donut, gauge circles, multi-series lines, bars, progress, sparkline
- Verification suite: `bash tools/verify.sh` (check · logic · ui · smoke · tabs · align)

---

## Deployment — beginner guide (Windows 10)

**Naye user hain aur clasp kabhi istemal nahi kiya?**
→ **`release/CLASP-GUIDE-WINDOWS.md`** parh kar shuru karein.
Har qadam likha hai (Node.js install se le kar deploy tak, 3 PWA URLs ke sath).

**Sab se mukammal guide (CLASP ke 15 points + static hosting ke 8 points,
har command ke sath WHERE → TYPE → SEE → NEXT):**
→ **`release/CLASP-STATIC-COMPLETE-GUIDE.html`**

### v2.11 AI providers
New server file: `apps-script/AI_Adapters.gs`. Gemini Interactions + generateContent fallback; OpenAI Responses + Chat fallback; OpenRouter compatible chat; Ollama native chat; explicit Mock adapter. Provider keys are separate Script Properties and are never bundled. See DEPLOYMENT.md for the beginner Setup workflow.

### v2.12 timeout recovery + amounts
Setup is resumable: `Setup.gs ▸ setupAll ▸ Run`; repeat if the returned/logged `complete` is false. It reuses the same database. AI network calls have explicit deadlines and a shared budget; browser watchdogs restore the UI without automatically repeating writes. See DEPLOYMENT.md for recovery steps. Compact financial KPI values now use Lakhs/Crore with exact crore values visible.

### v2.12.1 backend performance follow-up
Settings saves now batch changed rows and skip unchanged values; bulk updates no longer reread every row. For a read-only check: **Diagnose.gs ▸ diagnosePerformance ▸ Run** (returns and logs metadata timings, no full table scan). Update the existing deployment to a New version; do not reset the database.
