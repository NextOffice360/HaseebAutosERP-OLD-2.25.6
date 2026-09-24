# 🚀 Haseeb Autos — Google Apps Script se Deploy Karne Ka Mukammal Guide

> **Roman Urdu + English mix.** Zero se le kar live app tak — har step, har command, har error ka hal.
> Poora app **Google Apps Script + Google Sheets** par chalta hai: koi server nahi, koi hosting fee nahi,
> sirf aap ka Google account.

---

## 📋 30 second mein summary

| Step | Kaam | Time |
|---|---|---|
| 1 | Google account + naya Apps Script project | 2 min |
| 2 | Code upload (clasp **ya** copy/paste) | 3 min |
| 3 | `setupAll()` run → Sheets database ban jata hai | 2 min |
| 4 | **Deploy ▸ New deployment ▸ Web app** | 2 min |
| 5 | Pehli login (`owner` / `admin123`) + password badlein | 2 min |
| 6 | AI key + daily jobs (optional) | 3 min |

**Kul: ~15 minute.** Neechay har step detail mein hai.

---

## 🧰 Pehlay ye cheezein ready rakhein

- ✅ **Google account** (Gmail) — personal ya Workspace, dono chalte hain
- ✅ **Google Drive** ki permission (Sheets banane ke liye)
- ✅ (Optional) **Node.js 18+** — sirf clasp wale tareeqe ke liye
- ✅ Is folder ka ZIP (ya clone) apne computer par

> **Note:** App aap ke Google account ki **quota limits** use karta hai
> (20,000 UrlFetch calls/day, 6 min execution time). Retail shop ke liye ye bohat zyada hai.

---

# 🅰 Option A — clasp se deploy (recommended, ek command)

`clasp` Google ka official command-line tool hai — saari files ek sath upload ho jati hain,
naam/ghalti ka koi chance nahi.

## A1. clasp install + login

```bash
# 1. Node.js install hai? check karein
node -v          # v18 ya upar hona chahiye

# 2. clasp install
npm install -g @google/clasp

# 3. Google login (browser khulega → Allow karein)
clasp login
```

Agar `clasp login` mein error aaye to: [script.google.com/home/usersettings](https://script.google.com/home/usersettings) → **Apps Script API** ko **On** karein.

## A2. Naya project banayein

```bash
cd haseeb-autos/apps-script

# Naya project (Script + bound Spreadsheet ek sath)
clasp create --title "Haseeb Autos ERP" --type standalone
```

Ya **existing project** ke sath:

1. [script.google.com](https://script.google.com) → **New project**
2. **Project Settings (⚙) → Script ID** copy karein
3. `apps-script/.clasp.json` banayein:

```json
{ "scriptId": "1AbC...xyz", "rootDir": "apps-script" }
```

## A3. Push (code upload)

```bash
clasp push           # sab .gs + .html files upload
clasp open           # Apps Script editor khul jayega (browser)
```

> Pehli dafa `.claspignore` ensure karein: sirf `.gs` aur `.html` jayen, `appsscript.json` bhi.

## A4. Databasebanana (sab se zaroori step)

Apps Script editor mein:

```
Function select: setupAll  →  Run ▶
```

1. **Authorization required** dialog aayega → **Review permissions** → apna account → **Advanced ▸ Allow**
2. Execution log mein ye nazar aayega:

```json
{ "spreadsheetId": "1XyZ...", "url": "https://docs.google.com/spreadsheets/d/1XyZ.../edit",
  "jobs": { "installed": [ {"handler":"triggerDailyReorder"}, {"handler":"triggerDailyAlerts"} ] },
  "message": "Setup complete. Ab Deploy > New deployment > Web app karein." }
```

✅ Ab aap ki **"Haseeb Autos - ERP Database"** spreadsheet ban chuki hai:
30+ sheets, 3 branches (SDQ / MCH / RYK), 9 users, 101 catalogue items, print templates.

> Spreadsheet ka link save kar lein — yahi aap ka **database** hai.

## A5. Web app deploy

```
Deploy ▸ New deployment ▸ (⚙ gear) Web app
```

| Field | Value |
|---|---|
| **Description** | `Haseeb Autos v2.1.0` |
| **Execute as** | **Me** (apna account) |
| **Who has access** | **Anyone** (ya "Anyone with Google account" — zyada secure) |

**Deploy** dabayein → pehli dafa dobara **Authorize access** karein → **Web app URL** milega:

```
https://script.google.com/macros/s/AKfycb..../exec
```

🎉 **Yehi aap ke app ka address hai.** Mobile/desktop browser mein kholein, ya QR bana kar
staff ko bhej dein (App ke **Settings ▸ Business** mein QR print bhi ho sakta hai).

---

# 🅱 Option B — bina Node ke (copy/paste)

Agar Node install nahi kar sakte to ye tareeqa use karein. ~10 minute lagte hain.

## B1. Project + files

1. [script.google.com](https://script.google.com) → **New project**
2. Project ka naam: **Haseeb Autos ERP**
3. Har file ke liye: **＋ (Plus) ▸ Script** ya **▸ HTML**
   - `.gs` files → **Script**
   - `.html` files → **HTML** (naam **bina extension** ke — masalan `Index`, `Styles`, `App_Core`)
4. Is folder ki `apps-script/` se content copy kar ke paste karein

### Server files (Script) — isi order mein banayein

| # | File | Kya karta hai |
|---|---|---|
| 1 | `Utils` | Helpers, CONFIG, formatting, `U.*` |
| 2 | `DB` | Sheets read/write layer |
| 3 | `Auth` | Login, sessions, RBAC |
| 4 | `Audit` | Audit log |
| 5 | `Schema` | Har sheet ke columns (single source of truth) |
| 6 | `Config` | Settings registry (`Config.defs()`) |
| 7 | `Setup` | Sheets banana + seed data |
| 8 | `Items` | Product master |
| 9 | `Parties` | Customers / Suppliers / Ledger |
| 10 | `Inventory` | Stock, transfers, adjustments |
| 11 | `Sales` | POS billing, returns, holds |
| 12 | `Purchase` | PO, GRN, purchase return |
| 13 | `Payments` | Cash in/out, expenses |
| 14 | `Reports` | Dashboards, P&L, exports |
| 15 | `Warehouse` | Bins, put-away, count sheets |
| 16 | `Notifications` | Alert engine |
| 17 | `Commissions` | Salesman commission |
| 18 | `Barcode` | Barcode/QR label data |
| 19 | `OfflineSync` | Offline pull/sync |
| 20 | `AI` | AI agent (Gemini/OpenAI/OpenRouter) |
| 21 | `Lang` | Translations (EN/Roman/Urdu) |
| 22 | `Reorder` | Auto reorder engine (v2.1) |
| 23 | `Triggers` | Scheduled jobs (v2.1) |
| 24 | `Seed_Products` | 71 asli Flamingo products |
| 25 | `Code` | `doGet()`, `api()` router |

### Client files (HTML) — bina `.html` extension ke

`Index`, `Styles`, `App_Core`, `App_Barcode`, `App_QR`, `App_UI2`, `App_POS`, `App_Screens`,
`App_Screens2`, `App_POS2`, `App_Masters`, `App_Inventory2`, `App_Config`, `App_Dashboards`,
`App_Lang`, `App_Reorder`, `App_AI`, `App_Boot`

> ⚠ **Naam bilkul waise hi rakhein** (case-sensitive). Ghalti se app blank screen dega.

## B2. Apps Script manifest

**Project Settings ⚙ → Show "appsscript.json"** → ye content daalein:

```json
{
  "timeZone": "Asia/Karachi",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": { "executeAs": "USER_DEPLOYING", "access": "ANYONE_ANONYMOUS" }
}
```

## B3. Ab wahi A4 + A5

`setupAll()` run karein → authorize → `Deploy ▸ New deployment ▸ Web app`.

---

# ⚙ Deploy ke baad ki zaroori settings

## 1. Pehli login (aur foran password badlein)

| Role | Username | Password |
|---|---|---|
| Owner | `owner` | `admin123` |
| Manager | `manager` | `manager123` |
| Salesman | `sales1` | `sales123` |
| Purchase | `purchase` | `purchase123` |
| Warehouse | `warehouse` | `ware123` |
| Accountant | `accountant` | `acc123` |
| Cashier | `cashier` | `cash123` |
| Delivery | `delivery` | `del123` |

🔐 **Sab se pehla kaam:** `Users & Security` → har user ka password change karein.

## 2. Business profile

`Settings ▸ Business ▸ Identity` — naam, phone, address, NTN, currency.
Ye sab **Sheets** mein save hota hai (kuch bhi hardcoded nahi).

## 3. Catalogue import (apna purana stock)

`Items` screen → **⬆ Import** (CSV) ya `Settings ▸ Data & tools ▸ Import`.
Format: `code, name, category, brand, cost, retail, wholesale, stock`.

## 4. AI Assistant (optional, 2 minute)

1. [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → **Create API key**
2. Apps Script editor: **Project Settings ⚙ → Script Properties → Add**
   ```
   Name:  AI_API_KEY
   Value: AIza...
   ```
3. App mein: `Settings ▸ Automation ▸ AI assistant` → Provider `GEMINI`, Enable ✅
4. `aiCanWrite = false` rakhein jab tak aap AI ko direct write nahi karwana chahte
   (default: AI sirf **draft** banata hai, aap confirm karte hain)

## 5. Daily jobs / triggers (v2.1)

Editor mein (ya `Settings ▸ Automation ▸ Scheduled jobs ▸ ⏰ Install jobs` se):

```
Function: installTriggers  →  Run ▶  →  Authorize
```

| Setting | Default | Matlab |
|---|---|---|
| `job.dailyReorder` | `true` | Roz subah `Reorder.run()` — suggestions + notification |
| `job.dailyHour` | `7` | Kab chalay (Asia/Karachi) |
| `job.dailyAutoPO` | `false` | Suggestions se khud PO banayein |
| `job.dailyAlerts` | `true` | Low stock / udhaar / pending PO alerts |
| `job.alertsHour` | `6` | Alerts ka waqt |

Editor se test ke liye: `runReorderNow()` ya `triggerStatus()` chala kar dekhein.

---

# 📱 Mobile PWA (app ki tarah install)

**Android (Chrome):**
1. Web app URL kholein → ⋮ menu → **Install app** / **Add to Home screen**
2. Icon home screen par aa jayega — offline bhi khulta hai (catalog cache)

**iPhone (Safari):** Share ▸ **Add to Home Screen**

> Apps Script ke `/exec` URL par app **khud** apna manifest inject karta hai (data-URI),
> is liye install prompt bina kisi extra file ke aa jata hai.
> Asli `sw.js` (offline shell) sirf static hosting par chalta hai — `DEPLOYMENT.md ▸ Option C`.

---

# 🔄 Updates kaise karein (naye features)

```bash
# clasp wale
clasp push
```

Phir editor mein:

| Function | Kab chalayein |
|---|---|
| `repairSchema` | Naye sheets/columns add karne hain (purana data **safe** rehta hai) |
| `seedAll` | Catalog lists, warehouses, templates dobara seed karne hain |
| `seedTranslations` | Urdu/Roman dictionary refresh karni ho (v2.1) |
| `reinstallTriggers` | Jobs dobara install karne hain |

**Deployment update:** `Deploy ▸ Manage deployments ▸ ✏ Edit ▸ Version: New version`.
> ⚠ Zaroori: naya version banayein, warna users ko purana code dikhega (Apps Script caching).

Version badhane ka sahi tareeqa: `apps-script/Utils.gs` mein `CONFIG.VERSION` badlein →
demo build aur service-worker cache khud update ho jata hai.

---

# 🧪 Deploy se pehle verification (developer)

```bash
bash tools/check.sh          # 23 .gs + HTML script blocks syntax
node tools/test_logic.js     # 97 business-logic tests (real backend, mock Sheets)
node tools/smoke.js          # 109 UI checks — har screen, har tab, deep links
node tools/ui_audit.js       # UI defect scan (labels/titles/blank content)
node tools/test_qr.js && python3 tools/verify_qr.py
```

Sab green hon → `clasp push`.

---

# 🆘 Troubleshooting

| Masla | Wajah | Hal |
|---|---|---|
| **"Authorization required" / "This app isn't verified"** | Google ka standard warning | **Advanced ▸ Go to Haseeb Autos (unsafe) ▸ Allow** |
| **`Setup.setupAll` mein "Sheet not found"** | Spreadsheet link toota | Editor: `Setup.attach("<SPREADSHEET_ID>")` phir `setupAll()` |
| **Blank white screen** | HTML file ka naam ghalat (extension samet) | File names check karein: `Index`, `Styles`, … (`.html` ke baghair) |
| **`ScriptApp` / trigger install error** | Trigger ke liye authorization pending | `installTriggers()` editor se run karein → Allow |
| **Job chal raha hai par notification nahi** | `job.*` settings off, ya item hi reorder par nahi | `Settings ▸ Automation ▸ Scheduled jobs` + Reorder screen check karein |
| **"Service invoked too many times"** | Sheets quota (writes/min) | Thora wait karein; bulk import chhote batches mein karein |
| **Execution timeout (6 min)** | Bohat bada import/export | Import ko 500-row batches mein split karein |
| **Login ke baad "Session expire"** | Cache TTL (8 ghante) | Dobara login; `sec.sessionTimeout` setting se badal sakte hain |
| **AI jawab nahi de raha** | `AI_API_KEY` missing ya quota | Script Properties check; `Settings ▸ AI` provider/model |
| **Urdu/Roman switch nahi ho raha** | Dictionary seed nahi hui | `seedTranslations()` run karein; phir `#EN` button (dbl-click = editor) |
| **Barcode scanner kaam nahi (mobile)** | Camera permission denied | Browser settings → Site permissions → Camera: Allow (HTTPS lazmi) |
| **Naye code ke baad purana UI** | Deployment version update nahi hua | `Manage deployments ▸ Edit ▸ New version` |
| **Slow first load** | Apps Script cold start (2-4 s) | Normal hai; baar baar use par fast ho jata hai |

---

# ✅ Daily use checklist

**Subah (shop kholte waqt)**
1. **Shop Open/Close** → opening cash daalein → session start
2. **🔔 Alerts** check karein (low stock, udhaar, pending PO)
3. **🔁 Auto Reorder** → suggestions dekhein → zaroori lines select → **Create POs**

**Din mein**
4. **POS** → cards se item tap karein / barcode scan → qty → Cash/Udhaar
5. Udhaar → **Parties** → customer ledger

**Shaam (shop band karte waqt)**
6. **Reports** → day sale, cash, P&L
7. **Shop Open/Close** → counting → variance → close
8. Haftay mein ek dafa: **Settings ▸ Data ▸ Backup** (JSON export) Drive mein save karein

---

**Version:** 2.1.0  ·  **Stack:** Google Apps Script (V8) + Google Sheets  ·  **License:** Aap ki property
