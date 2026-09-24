> **v2.14.1 — POS cart: multi-select add (GRN/PO-style checkbox picker), bulk scanning, aligned amount columns, wider cart rail** (supersedes v2.14.0 — install instead; nothing to reset). [Upgrade instructions](release/CHANGELOG-v2.14.1.md).

> **v2.13.2 — blank data rows after setup:** [Recovery guide](release/CHANGELOG-v2.13.2.md). Replace the source files, then **Setup.gs ▸ diagnoseSeedData ▸ Run**, followed by **Setup.gs ▸ repairSeedData ▸ Run**. Keep the existing spreadsheet. Both functions return and log their results.

> **v2.13.1 critical startup fix:** [Upgrade instructions](release/CHANGELOG-v2.13.1.md). Fixes `AI.officialEndpoint` on undefined and protected requests before login. Replace **both AI.gs and AI_ProviderHub.gs** (prefer all apps-script files), save, then deploy a **New version**. Do not reset sheets.

> **v2.13.0 AI update:** [Connection setup, automatic failover and upgrade steps](release/CHANGELOG-v2.13.0.md). Replace all Apps Script files (including AI_ProviderHub.gs), then deploy a **New version**. Existing installations need no setup reset. Enter rotated keys only in your original Apps Script web app.

# 🚀 Deployment Guide — Haseeb Autos ERP & POS

Ye guide 3 tareeqay deta hai. **Option A (clasp)** sab se fast hai, **Option B (copy/paste)** sab se simple.

---

## ✅ Pehlay ye check list

- [ ] Google account (jis se system chalana hai — ideally business ka apna account)
- [ ] Node.js 18+ (agar clasp use karna hai) — [nodejs.org](https://nodejs.org)
- [ ] Gemini API key (AI ke liye) — [aistudio.google.com/apikey](https://aistudio.google.com/apikey) *(optional)*
- [ ] 15–20 minute

---

# Option A — clasp (recommended, one command)

### 1. clasp install + login

```bash
npm install -g @google/clasp
clasp login          # browser khulega → Google account allow karein
clasp enable apps-script-api   # sirf ek dafa (https://script.google.com/home/usersettings)
```

### 2. Apps Script project banayein aur `.clasp.json` mein ID daalein

```bash
# Naya project (script + bound spreadsheet ek saath)
clasp create --title "Haseeb Autos ERP" --type standalone
# ✓ .clasp.json automatically ban jata hai

# Ya existing project ke sath:
# script.google.com → project kholein → Project Settings → Script ID copy
# phir .clasp.json mein: { "scriptId": "1AbC...xyz", "rootDir": "apps-script" }
```

> `tools/.clasp.json.template` ko copy kar ke root mein `.clasp.json` bana dein.

### 3. Push + setup

```bash
cd haseeb-autos
bash tools/deploy.sh          # → clasp push

# ab Apps Script editor mein:
#   function select: setupAll  →  Run ▶  →  authorize  →  Logs dekhein
clasp open                     # editor kholta hai
```

Editor mein **`setupAll`** run karne ke baad Logs mein aayega:

```
{ spreadsheetId: '1xYz...', url: 'https://docs.google.com/spreadsheets/d/1xYz.../edit',
  message: 'Setup complete. Ab Deploy > New deployment > Web app karein.' }
```

### 4. Deploy (web app)

```bash
clasp deploy --description "Haseeb Autos v1.0"
```

Ya editor se: **Deploy ▸ New deployment ▸ ⚙ Web app**
- Execute as: **Me** (aapka Google account)
- Who has access: **Anyone** (login app ke andar hai, is liye safe hai)
- **Deploy** → URL copy karein → `Ctrl+V` browser mein 🎉

---

# Option B — copy/paste (bina Node ke)

1. [script.google.com](https://script.google.com) → **+ New project**
2. Project name: `Haseeb Autos ERP`
3. Har `.gs` file ke liye: **+ ▸ Script** → file name (bina `.gs`) type karein → content paste → 💾 Save
   - `Schema`, `Utils`, `DB`, `Setup`, `Auth`, `Audit`, `Items`, `Inventory`, `Sales`, `Purchase`,
     `Parties`, `Payments`, `Reports`, `AI`, `Barcode`, `OfflineSync`, `Code`
4. Har `.html` file ke liye: **+ ▸ HTML** → name (`Index`, `Styles`, `App_Core`, `App_Barcode`, `App_POS`,
   `App_Screens`, `App_Screens2`, `App_AI`, `App_Boot`) → content paste → Save
5. ⚙ **Project Settings** → tick **Show "appsscript.json"** → wapas editor → `appsscript.json` ka content replace karein
6. Function dropdown mein **`setupAll`** select → **Run ▶** → **Review permissions → Advanced → Allow**
7. Logs mein spreadsheet URL aayega
8. **Deploy ▸ New deployment ▸ Web app** (Execute as: Me · Access: Anyone) → Deploy

---

# Option C — static PWA hosting (advanced, real service worker)

Agar aap chahte hain ke app **real installable PWA** ho (offline app shell, add-to-home-screen prompt):

1. `demo/index.html` (ya apps-script templates se build) ko **Netlify / Vercel / GitHub Pages / Firebase Hosting** par host karein.
2. Apps Script project ko **Web app** ki tarah deploy karein (Mode A/B ki tarah) aur uska `/exec` URL lein.
3. Frontend mein `window.API_URL` set karein:
   - `Index.html` mein: `<script>window.API_URL = 'https://script.google.com/macros/s/AKfy.../exec';</script>`
   - App automatically **JSONP** transport use karega (CORS problem nahi aati).
4. `python3 tools/build_demo.py` chalayein — yeh **`demo/manifest.webmanifest`**,
   **`demo/sw.js`** aur **`demo/icon-192.png` / `icon-512.png`** khud bana deta hai
   (source icons: `tools/icon-192.png`, `tools/icon-512.png`). Poori `demo/` folder
   (index.html + manifest + sw + icons) static host par upload karein.
5. Naye build par service-worker cache refresh karne ke liye `tools/build_demo.py` ke
   andar `CACHE = 'haseeb-autos-v…'` version badhayein — purana cache auto-clear hoga.

> **Note:** Apps Script ke `/exec` scope me alag file serve nahi ho sakti, is liye wahan
> app apne aap **inline data-URI manifest** use karta hai (install prompt phir bhi aata hai).
> Asli `sw.js` sirf static hosting par register hota hai (`window.SERVE_MODE` check).

**Faida:** poora app offline (app shell cache), install prompt, faster loading.
**Nuksan:** do jagah deploy karna parhta hai.

---

# 🔑 AI Agent setup (v2.10 — naya dedicated tab)

AI ab **Settings ke andar dafan nahi** — sidebar mein **AI Agent** naam ka apna tab hai
(chaar hissay: **Assistant · Setup · Tools · Activity**).

### Kaunsi file kya karti hai
| Kaam | File ▸ Function |
|---|---|
| Chat loop + tools (aapka data) | `AI.gs` ▸ `AI.chat` → `AI.dispatch` |
| Provider config parhna/bachana | `AI.gs` ▸ `AI.agentConfig` / `AI.saveAgentConfig` |
| API key (Script Properties mein, kabhi sheet mein nahi) | `AI.gs` ▸ `AI.setKey` |
| Live model list + fallback catalog | `AI.gs` ▸ `AI.discoverModels` / `AI.modelOptions` |
| Connection test (sachchi ping + human hint) | `AI.gs` ▸ `AI.testConnection` |
| Provider metadata (UI content-aware) | `AI.gs` ▸ `AI.providers` |
| Routes | `Code.gs` ▸ `ai.agentConfig`, `ai.agentConfig.save`, `ai.setKey`, `ai.test`, `ai.chat`, `ai.providers`, `ai.models.refresh` |
| UI | `App_AIConfig.html` (AI Agent tab) + `App_AI.html` (floating quick-chat) |
| Chat history sheet | `AIThreads` — user-wise rows; `Setup ▸ Repair/Upgrade` ise khud bana deta hai |

### Gemini se shuru karein (recommended, free tier)
1. [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → **Create API key** → copy.
2. App mein **AI Agent ▸ Setup** kholen → Provider: **Google Gemini** (pehle se select) →
   key box mein paste → **Save settings** → **Test connection** (hara banner aayega).
   Key khud-b-khud `PropertiesService` Script Properties mein mehfooz hoti hai — aapko
   editor kholne ki zaroorat NAHI. Screen par sirf `AIz…xyz` jaisa masked hint dikhta hai.
3. Model dropdown provider ke hisab se LIVE list load karta hai (Refresh models button);
   list na mile to built-in fallback + khud model ID likhne ka option hamesha maujood.
4. Assistant tab mein poochein: "aaj ki sale kitni hui?" — jawab aapke SHEETS ke data
   se aayega (agent tools chalaata hai, hallucinate nahi karta).

### Key ke bagair bhi chalta hai
Provider **Mock (built-in)** ya **Mock fallback = ON** rakhein to assistant bina internet/key
ke aapke LIVE data par rule-based jawab deta hai — demo aur training ke liye behtareen.
(default: fallback ON — is liye AI kabhi "khamosh" nahi hota)

### OpenAI / OpenRouter / Ollama
* **OpenAI**: `AI Agent ▸ Setup` mein provider OpenAI → platform.openai.com/api-keys se key → Save/Test.
* **OpenRouter**: key openrouter.ai/keys se; free models `:free` naam ke sath dropdown mein aayenge.
* **Ollama (local)**: koi key nahi — lekin Setup ka **Server / endpoint** field me wo https://
  URL daalein jo GOOGLE ke servers se reach ho sake. Ghar ka `localhost` seedha nahi chalta
  (ngrok/cloudflare tunnel lagana parta hai) — isi liye beginners ke liye Gemini behtar hai.
* **Model list**: teeno live providers par list provider ki API se aati hai + 12 ghante cache;
  manual fallback har waqt maujood.

### Editor wala tareeqa (optional backup)
Agar app kholne se pehle key set karni ho to Apps Script editor me run karein:
```javascript
setAIKey("AIzaSy...", "GEMINI", "")   // Utils.gs ▸ setAIKey — Return bhi deta hai: config object
```
Sheets/Properties me koi manual row banane ki zaroorat nahi — `AIThreads` sheet pehli
chat par ap-aap fill hoti hai (rows sirf aapke spreadsheet mein rehti hain).

### Provider adapters (v2.11 — provider-agnostic architecture)
AI engine (`AI.gs`) kisi bhi provider ki API nahi jaanta — har provider ka apna
**adapter** hai `AI_Adapters.gs` mein, teen functions ke sath: `run` (model round +
tool loop), `verify` (sasta key-check), `listModels` (live model discovery).
Naya provider jodna = ek adapter object, bas; UI metadata usi se banta hai
(`AI.providers`).

| Provider | API mode (Setup ▸ API mode) | Kya bheja jata hai |
|---|---|---|
| Google Gemini | Auto / **Interactions** (naya GA standard) / generateContent (legacy) | `POST /v1beta/interactions` — steps protocol; tool-loop mein thought-signature VERBATIM echo (docs shart) |
| OpenAI | Auto / **Responses** / Chat Completions (legacy) | `POST /v1/responses` — `function_call` + `function_call_output` items; reasoning models par temperature NAHI bheja jata (API 400 deti hai) |
| OpenRouter | Chat Completions (OpenAI-compatible) | public `/api/v1/models` list — `:free` + pricing se FREE labels, `supported_parameters` se no-tools flags |
| Ollama | Native `/api/chat` | `/api/tags` se installed models (GB size ke sath); endpoint tunnel zaroori |
| Mock | built-in rules engine | koi network nahi — phir bhi aapke live data par tools |

**Privacy/security defaults:** Interactions/Responses calls `store:false` (stateless) — app conversation storage request nahi karta; provider ki retention policy phir bhi lagu hoti hai; API key sirf **Script Properties** mein (`AI.setKey`)
 aur hamesha server-side se bheji jati hai (header) — key source code mein embed nahi hoti; owner Setup form mein enter karta hai, server read-back sirf masked hint deta hai. Test connection pehle **verify** karta
hai (models-list/key endpoint — 1 token ka kharcha nahi), phir mini-round.
APIs ke official schemas par LIVE keys se verify kiya hua harness repo mein hai:

```javascript
// node tools/test_live_ai.js   (keys: GEMINI_API_KEY/OPENAI_API_KEY env ya ~/.secrets)
```

### Agent ki taqat/chhuttiyan (Setup tab)
- **Tools** tab: kaunsa tool model use kar sakta hai (READ = sirf parhna, WRITE = draft).
- **AI enabled** off = poora assistant band (signals bhi). **Writes** default OFF.
- **Roz ki limit**: per-user 40 / global 200 messages — `Activity` tab mein live meter.
- Purana "Settings ▸ Automation" ab sirf bridge hai: **Open AI Agent tab** button.


### AI write mode
Default: **draft only** (AI sirf draft banata hai, kuch post nahi hota).
Agar aap chahte hain ke AI se PO/sale draft ban kar seedha save ho: Settings ▸ `aiCanWrite = true`
(pehlay kuch din draft mode mein chalayein).

---

# 👥 Pehli login ke baad kya karein

1. `owner / admin123` se login → **Settings ▸ Users** → har user ka password change karein
   (ya username click kar ke **Change password**)
2. Har user ko uski **branch access** aur **role** assign karein
3. **Settings ▸ Configuration ▸ Business** — naam, phone, address, NTN, tax %, currency
4. **Settings ▸ POS** — cards per row, default view, stock badge, quantity pad, quick cash
5. **Settings ▸ Lists & catalogs** — apni Categories / Brands / Units / Tax codes
6. **Settings ▸ Menu builder** — sidebar ke items apni marzi se (label, icon, order, permission)
7. **Settings ▸ Print templates** — receipt/label JSON (barcode/QR, paper size, footer)
8. **Settings ▸ Data ▸ Real catalog** — **"Seed 71 products"** (Flamingo catalogue, list.pdf se)
9. **Items** screen se baqi stock import karein (CSV paste — Import button)
10. **Customers** mein purana udhaar (opening balance) daal dein
11. **Inventory ▸ Warehouse** — apne racks/bins banaayein (ya `Setup.seedWarehouses()` run karein)
12. Mobile par URL khol kar **Add to Home Screen** (PWA install)

---

# 📥 Data import (purana stock / customers)

**Items:** Items screen ▸ **Import** → Excel/CSV se copy kar ke paste (tab-separated bhi chalta hai)
```
code	name	category	brand	costPrice	retailPrice	wholesalePrice	barcode
HLG-001	LED Headlight	Lights	Philips	850	1200	1050	HLG-001
```
- `code` existing ho ga to **update**, nahi to **naya item** banay ga.

**Customers:** Parties ▸ Add Customer (ya `Setup.seedDemoItems()` ki tarah bulk loader likhwa lein).

**Opening stock:** Inventory ▸ Adjustment → reason `OPENING` → items add kar ke **Save & Post**.

---

# 🆕 v2.1 upgrade (existing install par)

```bash
# clasp mode
clasp push
# phir Apps Script editor mein:
#   function: repairSchema      →  Run ▶   # Translations / SavedViews + lineBase column (data safe)
#   function: seedAll           →  Run ▶   # + seedTranslations() (EN/Roman/Urdu dictionary)
#   function: setupAll          →  sirf naye project par
```

Naye Settings keys (Settings ▸ … se editable):
`discountBeforeTax`, `taxInclusive`, `costingMethod` (AVG/FIFO), `maxDiscountPct`,
aur **Automation ▸ Purchase reorder rules** group (`autoReorder*` keys).

---

# 🏗 v2 deployment — naye sheets aur data

v2 mein **14 naye sheets** judti hain: `Categories, Brands, Units, TaxCodes, Warehouses,
Bins, BinStock, StockLots, Bundles, PriceLists, CustomFields, MenuConfig, PrintTemplates,
SavedViews` — aur `Items`/`Stock`/`Customers`/`Suppliers` mein naye columns.

**Agar aap v1 se upgrade kar rahe hain:**
```bash
# clasp mode
bash tools/deploy.sh
# phir Apps Script editor mein:
#   function: repairSchema  →  Run ▶     # naye sheets + columns add (data safe)
#   function: seedAll       →  Run ▶     # catalog lists + warehouses + templates
```
`repairSchema()` purana data delete nahi karta — sirf missing sheets/columns add karta hai.

**71 asli products (Flamingo catalogue):**
- Apps Script: `Setup.seedProducts()` → `seedRealProducts({ stock: 20 })`
- Ya UI: **Settings ▸ Data & tools ▸ Real catalog ▸ Seed 71 products**
- Har item ke sath 3 branches ke liye stock row ban jati hai

---

# 🧪 Deployment se pehle verification (developer)

```bash
bash tools/check.sh          # 23 .gs files + 19 script blocks syntax
node tools/test_logic.js     # 78 business-logic tests (costing, tax, ledger, reorder, i18n)
node tools/smoke.js          # 100 UI checks — har screen + har tab + deep links + QR
node tools/test_qr.js && python3 tools/verify_qr.py
# tools/mock_gs.js  →  in-memory Apps Script runtime (SpreadsheetApp/CacheService fake)
#                      jo test_logic.js real .gs files ke saath use karta hai
```
Sab green hone ke baad hi `deploy.sh` chalayein.

---

# 🔧 Troubleshooting

| Masla | Hal |
|---|---|
| `SPREADSHEET_ID not set` | `setupAll()` run karein (function dropdown se) |
| Login ke baad blank screen | Browser console (F12) dekhein; aksar `AI_API_KEY` missing hone pe AI hi error deta hai, baqi app chalay ga |
| `Session expire ho gaya` | Dobara login (12h baad hota hai) |
| Stock update nahi ho raha | Cache 5 min ka hai — Refresh dabayein; phir bhi na ho to Settings ▸ Data ▸ Row counts |
| AI jawab nahi deta | Settings ▸ AI Assistant ▸ key check karein; Gemini quota |
| Barcode scan nahi ho raha | Scanner Code39 mode par ho (default hota hai); item ka barcode khali na ho |
| Print receipt khali aata hai | Popup blocker allow karein |
| Bahut slow ho gaya | Sheet bari ho gayi — purana data purge karein (Settings ▸ Data) |
| Naye columns chahiye | `Schema.gs` mein column add karein → `repairSchema()` run karein |
| Naye fields chahiye (bina code) | Settings ▸ Custom fields — Item/Customer/Supplier par apna field banaayein |
| Menu item chhupana hai | Settings ▸ Menu builder → item edit → Active off |
| Settings screen khali | `config.defs()` route deploy hua ya nahi check karein; `repairSchema()` run karein |
| Warehouse/Bins nazar nahi | `Setup.seedWarehouses()` run karein (ya Settings ▸ Lists ▸ Warehouses se add) |
| QR nahi ban raha | Ab offline encoder hai — internet zaroori nahi; data 134 bytes se kam hona chahiye |

---

# 🔄 Updates kaise karein (naye features aane par)

```bash
git pull            # agar repo use kar rahe hain
bash tools/check.sh # syntax verify
bash tools/deploy.sh
# Apps Script editor → Deploy ▸ Manage deployments → Edit → Version: New version
# (Naya deployment banane se URL change ho jata hai — Edit use karein taake URL same rahe)
```

Schema change ho to: editor mein **`repairSchema`** run karein (naye columns add ho jayen ge, data safe rahe ga).

---

# 🔐 Security best practices

- ✅ **Pehlay din har default password badlein**
- ✅ Spreadsheet ko **kisi ke sath publicly share na karein** — sirf Apps Script (Execute as: Me) access karta hai
- ✅ Owner account par 2FA on karein
- ✅ Har 1–2 hafte mein **Settings ▸ Data ▸ Backup to Drive**
- ✅ AI key kabhi bhi sheet mein na likhein (Script Properties mein rahe)
- ✅ Staff ko sirf zaroori role dein (Salesman ko `reports.financial` na dein)

---

# 📞 Agla step

Kya chahiye next?
1. **WhatsApp/SMS** invoice bhejna (Twilio / Meta Cloud API)
2. **Supplier price lists** auto-import (email/CSV parsing)
3. **Customer loyalty** — points redeem at POS
4. **Multi-currency / purchase in USD**
5. **Firebase migration path** jab sheet bari ho jaye

Bas bata dein — agla feature bana deta hoon.

## v2.11 secure credentials and deployment

- Add **AI_Adapters.gs** as a new Apps Script file, and replace the other files from `apps-script/`. Deploy a **New version**. No clasp is required.
- `AI.gs ▸ AI.setKey(key, provider, model)` stores `AI_KEY_<PROVIDER>` in Script Properties; `AI.gs ▸ getKey` migrates the old singleton key to its current provider. Changing providers never reuses another provider's key.
- Beginner workflow: **AI Agent ▸ Setup ▸ provider ▸ paste key ▸ Save settings ▸ Refresh models ▸ select model ▸ Save settings ▸ Test connection**. Repeat for each provider.
- Apps Script Project Settings ▸ Script Properties is the alternative if you prefer not to paste a key into the app form. Property names: `AI_KEY_GEMINI`, `AI_KEY_OPENAI`, `AI_KEY_OPENROUTER`, optional `AI_KEY_OLLAMA`. Never share these with other editors. Script Properties are server-side storage, not an encrypted vault isolated from project editors.
- File **AI.gs ▸ setAIKey** is a parameterized helper that RETURNS masked status. Clicking Run without arguments is not a credential setup method. Prefer the Setup form or Project Settings.
- Credentials are NOT included in the release or preinstalled in your Apps Script project. Rotate any credential posted in a conversation. Do not paste real keys into the standalone mock demo.
- `store:false` disables application conversation storage where supported. It is not a guarantee of zero provider retention or absence of abuse-monitoring logs. Ollama requests pass through Google Apps Script and your configured HTTPS endpoint.
- `AIThreads` continues to hold app chat history in the spreadsheet; setup creates the sheet, chat updates it, and Clear history removes the user's saved threads. No new credential sheet is created.

Official references: https://ai.google.dev/api/interactions-api · https://ai.google.dev/gemini-api/docs/function-calling · https://developers.openai.com/api/docs/guides/function-calling · https://openrouter.ai/docs/api_reference/overview · https://docs.ollama.com/api/chat


# v2.12 — Long execution / timeout recovery

## Setup runs in resumable batches

**File: Setup.gs ▸ function: setupAll ▸ Run.** The function RETURNS and logs a result with `complete`, `completedSteps`, `totalSteps`, `spreadsheetId`, `url`, and `message`.

- If `complete: false`, progress is saved. Run **the same function again**; it continues in the same spreadsheet. Do not delete the existing database or repeatedly create projects.
- If `complete: true`, setup is ready. Deploy a New version. Rerunning a completed setup does not create another database or reset existing users/settings.
- If `busy: true`, another setup is running; wait for it to finish before running again.
- Setup checks a 45-second work budget between steps and checkpoints after every completed sheet/seed task. A single Google service call or seed task may take longer; this is a cooperative budget, not a hard cancellation.
- Sheets are formatted with two column-width service calls instead of one per column. Default settings are inserted as one batch, preserving existing values.
- `SETUP_PROGRESS_V212` and `SPREADSHEET_ID` are Script Properties. Progress is bound to the database ID and application version. All existing business sheets remain intact. **File: Setup.gs ▸ function: spreadsheetInfo ▸ Run** reports the linked database without modifying it.
- Existing spreadsheet: **File: Setup.gs ▸ function: attachExistingSpreadsheet ▸ Run**, after filling `ATTACH_ID`. If incomplete, continue with `setupAll`. Never attach an unrelated spreadsheet as a workaround for a slow call.

## AI and app requests no longer wait indefinitely

**File: AI_Adapters.gs ▸ function: ai_http_** sets `timeoutSeconds` to at most 20 seconds per fetch. **Function: ai_withBudget_** shares a 50-second cooperative budget and four-request ceiling across retries, fallback and tool rounds. These are internal functions: do not run them manually.

**File: AI.gs ▸ function: testConnection** uses a small probe (no business tools; 256 output tokens) after checking credentials. **Function: saveAgentConfig** skips unchanged settings instead of rewriting every field. AI Setup loads independent metadata requests concurrently.

**File: App_Core.html ▸ API.call / API.jsonp** now applies a 60-second browser watchdog (65 seconds for AI) and cleans up the busy state exactly once. Late replies are ignored by that request. An action name is included in timeout errors.

**Important:** a browser timeout does NOT prove that the server stopped or that a write failed. Check the invoice/payment/record/history before pressing Save/Post again. There is no automatic retry of the timed-out action. Google/provider outages can still produce errors; the code now bounds waiting and gives a recovery path rather than claiming every timeout is eliminated.

For further diagnosis: Apps Script editor ▸ **Executions** ▸ failed execution: record the function, duration and exact error. This identifies whether the cause is provider latency, spreadsheet service latency, or a quota restriction. No live production speed measurement is claimed by the release tests.

## Amounts
Dashboard and financial KPI compact amounts now use `Rs. 20.67 Lakhs` and `Rs. 1.03 Crore (Rs. 10,328,802)`. Crore KPI cards show the exact amount on a separate visible line to preserve mobile readability. Currency comes from settings. Exact invoice/table amounts and chart-axis formatting remain unchanged.

## Official references read for this fix
- https://developers.google.com/apps-script/guides/services/quotas
- https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app#fetch(String,Object)
- https://developers.google.com/apps-script/reference/spreadsheet/sheet#setColumnWidths(Integer,Integer,Integer)

Regression command: `node tools/test_timeouts.js` (32 checks: injected slow services, resumable setup, rendered Chromium timeout handling and amount formatting). Full `verify.sh` includes this gate when Chromium is installed.


# v2.12.1 — Remove repeated database work (timeout follow-up)

This patch keeps v2.12's resumable setup, request deadlines, safe timeout messages and Lakhs/Crore formatting. It reduces backend work rather than increasing execution limits.

## What changed
- **DB.gs ▸ setSettings** reads the Settings table once, skips unchanged values, and groups adjacent changed rows into range writes. Unrelated rows are not rewritten. Every changed key retains a before/after audit record, with audit rows inserted in a batch.
- **DB.gs ▸ setSetting** retains its single-record return contract, using the same writer. Settings writers share a script lock with a maximum two-second acquisition wait. Pending spreadsheet writes are flushed before releasing a lock acquired here; a caller-owned lock is not released.
- **Code.gs ▸ ROUTES['system.settings.save']**, **Config.gs ▸ Config.save**, and **AI.gs ▸ AI.saveAgentConfig** use batched settings writes. Existing permissions remain in place.
- **DB.gs ▸ updateMany** builds its ID index and merges patches from the snapshot already fetched. It no longer rereads each row. This optimization does not turn arbitrary multi-row business writes into database transactions; existing operation-specific locking remains necessary.
- Settings range writes are not an all-or-nothing database transaction. If a later range fails, prior completed ranges and their audit records remain. The error is surfaced and caches are invalidated. Check saved values before retrying.

## Measured operation counts (test harness, Settings table only)
| Operation | Before | v2.12.1 |
|---|---|---|
| Save 100 changed settings | 401 reads / 100 writes | 2 reads / 1 write |
| Save 100 unchanged settings | 400 reads / 100 writes | 1 read / 0 writes |
| updateMany with 100 patches | 102 reads / 1 write | 1 read / 1 write |

These are counted API operations, not measured production seconds. Audit writes are excluded from this table; tests separately verify all 100 per-key audit records.

## Beginner diagnosis — no full database scan
**File: Diagnose.gs ▸ function: diagnosePerformance ▸ Run.**

The function both RETURNS and logs a report containing the deployed code version, database-link/setup progress, spreadsheet-open timing, row/column metadata timings for only Settings, Items and Sales, and total diagnostic time. It does not run setup, read full business tables, call an AI provider, or inspect credentials. No sheet is created or modified. A single Google service call can still be slow; this is bounded scope, not a hard execution-time guarantee.

Do not repeatedly run setupAll or diagnoseAll to benchmark a slow business request. Open **Apps Script ▸ Executions** to inspect that request's function, duration and exact error. A browser timeout does not prove that a write failed; check the record first.

## Install
Replace files from `apps-script/`, then **Deploy ▸ Manage deployments ▸ Edit ▸ New version**. No database reset, key re-entry or setup rerun is required for an already-complete installation. The web app URL stays the same when updating an existing deployment.

Official references read: https://developers.google.com/apps-script/guides/support/best-practices and https://developers.google.com/apps-script/reference/lock/lock .
