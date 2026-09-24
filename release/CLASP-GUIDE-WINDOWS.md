# 📘 clasp se Deploy Karna — Windows 10 ke liye mukammal rehnuma

> **Ye guide bilkul shuru se likhi gayi hai.** Farz kiya gaya hai ke aap ne
> kabhi clasp istemal nahi kiya, aur command line (kali screen) se bilkul
> waaqif nahi hain. Har qadam, har jagah, likh kar diya gaya hai.
>
> **Poora waqt lagay ga: lagbhag 20–30 minute.**
>
> Agar kahin atak jayein to ghabrayein nahi — aakhir mein **"Masle aur un ka
> hal"** wala hissa hai, wahan se 99% masle hal ho jate hain.

---

## 🧠 Pehle ye samajh lein: hum kar kya rahe hain?

Sochiye aap ke paas **ek dukaan ka software** hai (Haseeb Autos). Wo files
hain aap ke computer par. Ab wo **Google ke server** par chahni hain, taake
mobile aur computer dono se — internet par — khul sakein.

| Cheez | Misaal (example) |
|---|---|
| Aap ke computer ka folder | Aap ka ghar (jahan samaan pada hai) |
| Google Apps Script | Aap ki dukaan (server par) |
| **clasp** | **Tongaa / truck** — ghar se dukaan tak samaan le jane wala |
| Deployment | Dukaan ka darwaza kholna — log andar aa sakein |

**3 bade kaam:**
1. **Node.js + clasp install karna** (truck khareedna) — sirf ek dafa
2. **clasp push** (samaan truck mein rakh kar bhejna)
3. **Deploy** (darwaza kholna)

---

## ✅ Hisa 1: Tayyari (teen cheezein chahiye)

### 1.1 — Aik folder banayein

- Desktop par **Right click → New → Folder**
- Naam likhein: `HaseebAutos` (bina space ke)
- Is folder ko khol kar **rakhein**, baar baar kaam aaye ga

### 1.2 — Zip file ko is folder mein khol dein

- Apni `haseeb-autos-v2.6.0.zip` file ko is folder mein **copy** karein
- Us par **Right click → Extract All… → Extract**
- Ab aap ko andar `apps-script` naam ka folder nazar aaye ga

**Check karein:** folder kholein, andar `apps-script` folder ho, us ke andar
bahut si `.gs` aur `.html` files hon. Agar hain to ✔ theek hai.

> 💡 **Ahem:** `apps-script` folder ka **poora raasta (path)** yaad rakhein,
> masalan: `C:\Users\Haseeb\Desktop\HaseebAutos\apps-script`

### 1.3 — Google account

Jis Google account se aap Google Drive / Gmail chalate hain — wahi istemal
hoga. Us ka **email aur password** tayyar rakhein.

---

## ✅ Hisa 2: Node.js install karna (Windows 10)

clasp ko chalane ke liye **Node.js** chahiye. Ye ek chota program hai jo
computer par commands chalata hai.

### Qadam 2.1 — Download

1. Browser (Chrome/Edge) kholein
2. Is pate (link) par jayein: **https://nodejs.org**
3. Aap ko **do sabz (green) buttons** nazar aayenge:
   - 👉 **LTS** wala button dabaayein (jo likha ho "Recommended For Most Users")
   - *(LTS = sab se stable wala. Hamesha LTS chunein.)*
4. File download hogi, jaisay: `node-v20.xx.x-x64.msi`

### Qadam 2.2 — Install

1. Download hui file par **Double click** karein
2. **"Welcome"** screen → **Next**
4. **"Destination Folder"** → kuch na badlein, bas **Next**
5. **"Custom Setup"** → kuch na badlein, bas **Next**
6. **"Tools for Native Modules"** → box ko **UN-check** rehne dein → **Next**
7. **Install** dabaayein
8. Windows pooche ga "Allow this app to make changes?" → **Yes**
9. Thoda intezaar karein (1–2 minute)
10. **Finish** dabaayein

> ⚠ **Zaroori:** Install ke baad computer ko **ek baar Restart** kar lein.
> Is se aage ke masle khud hi khatam ho jate hain.

### Qadam 2.3 — Check karein ke Node theek laga ya nahi

1. Keyboard par **Windows button** dabaayein
2. Type karein: `cmd`
3. **"Command Prompt"** par click karein (kali screen khul jaye gi)
4. Ye likhein aur **Enter** dabaayein:

```
node --version
```

Agar likha aaye `v20.11.0` ya koi `v` se shuru hone wala number — ✔ **theek hai.**

Phir ye likhein aur **Enter**:

```
npm --version
```

Agar `10.2.4` jaisa number aaye — ✔ **theek hai.**

> ❌ **Agar likha aaye "node is not recognized":**
> - Command Prompt ko **band** kar ke dobara kholein
> - Phir bhi na chale to computer **restart** karein
> - Phir bhi na chale to Hisa 11 (Masle) dekhein

---

## ✅ Hisa 3: clasp install karna

Ab hum **truck** (clasp) install karen ge.

### Qadam 3.1 — Command mein likhein

Command Prompt mein ye likhein aur **Enter** dabaayein:

```
npm install -g @google/clasp
```

**Kya hoga:** screen par kuch lines tezi se chalengi. 30 second se 2 minute
lag sakte hain. **Kuch mat dabaayein — bas intezaar karein.**

Jab wapas `C:\Users\...>` nazar aaye (naya command ka nishan), to ✔ ho gaya.

> ⚠ Agar koi **lal (red) likha** aaye to ghabrayein nahi — aksar sirf
> "warning" hoti hai. Neeche check karein.

### Qadam 3.2 — Check karein

```
clasp --version
```

Agar `2.4.2` jaisa number aaye — ✔ **clasp tayyar hai!** 🎉

> ❌ **Agar "clasp is not recognized" aaye:**
> ```
> npm install -g @google/clasp --force
> ```
> Phir Command Prompt **band kar ke dobara kholein** aur `clasp --version` likhein.

---

## ✅ Hisa 4: Google ko ijazat dena (sab se ahem qadam)

Ye **2 kaam** hain. Agar ye na kiye to aage kuch nahi chalega.

### Qadam 4.1 — Apps Script API ON karein ⚡ (bahut zaroori)

1. Browser mein jayein: **https://script.google.com/home/usersettings**
2. Login karein (apna Google account)
3. Neeche **"Google Apps Script API"** likha hoga
4. Us ke aage wala **switch ON** kar dein (neela / sabz ho jaye)

> 🔴 **Ye sab se badi wajah hai "clasp login kaam nahi kar raha" ki.**
> Bina is ke aage kuch nahi chalega.

### Qadam 4.2 — clasp ko login karayein

Command Prompt mein likhein:

```
clasp login
```

**Kya hoga:**
- Browser khul jaye ga
- Google pooche ga: "clasp wants to access your account"
- **Allow / Continue** dabaayein
- Phir ek lamba code aa sakta hai — usay **copy** karein
- Wapas Command Prompt mein **paste** kar ke **Enter** dabaayein

*(Aksar paste karna zaroori nahi hota — khud hi ho jata hai. Agar mangay to paste karein.)*

**Paste kaise karein:** Command Prompt mein **Right-click** karein → paste ho jaye ga.
*(Ctrl+V yahan kaam nahi karta!)*

Agar likha aaye:

```
Logged in! You may close this page.
```

to ✔ **login ho gaya!** 🎉

> 💡 Ab se aap ko dobara login karne ki zaroorat nahi.

---

## ✅ Hisa 5: Google par naya project banayein

Ab hum Google ke server par **ek khali project** banayenge, phir usay apne
computer se jodenge.

### Qadam 5.1 — Naya project

1. Browser mein jayein: **https://script.google.com**
2. Upar baen taraf **"＋ New project"** dabaayein
3. Project khul jaye ga (kali screen, code wali)
4. Upar **"Untitled project"** par click karein
5. Naam likhein: `Haseeb Autos` → **Rename**

### Qadam 5.2 — Script ID copy karein 🔑 (bahut zaroori)

1. Baen taraf neeche **⚙ (gear icon — "Project Settings")** par click karein
2. **"Script ID"** likha hoga, us ke neeche lamba code
3. Us ke daen taraf **copy wala button** dabaayein

Ye kuch aisa lagega:

```
1a2B3c4D5e6F7g8H9i0JkLmNoPqRsTuVwXyZ_abc123xyz
```

> 💡 **Isay kahin mehfooz kar lein** — Notepad mein paste kar lein. Baar baar
> kaam aaye ga. Ye aap ki **dukaan ki chaabi** hai.

---

## ✅ Hisa 6: Apne folder ko project se jodna (`.clasp.json`)

Ab computer ko batana hai ke code kahan jana hai.

### Qadam 6.1 — Command Prompt ko sahi jagah le jayein

Command Prompt mein, apne `apps-script` folder ke **andar** jana hai.

Pehle ye likhein (apna raasta lagayein) aur **Enter**:

```
cd C:\Users\Haseeb\Desktop\HaseebAutos\apps-script
```

> 🔴 **Apna raasta (path) kaise pata karein:**
> - File Explorer mein `apps-script` folder kholein
> - Upar address bar par **click** karein (raasta neela ho jaye ga)
> - `Ctrl + C` dabaayein (copy)
> - Command Prompt mein likhein `cd ` (cd aur space) phir **Right-click** (paste)
> - **Enter**

**Check karein:** ab likhein:

```
dir
```

Aap ko `Code.gs`, `Index.html`, `appsscript.json` waghera nazar aayein — ✔
to aap sahi jagah hain.

### Qadam 6.2 — `.clasp.json` file banayein

Command Prompt mein **(h1 bilkul waise hi)** likhein:

```
notepad .clasp.json
```

**Kya hoga:** Notepad khul jaye ga aur poochay ga "Do you want to create a
new file?" → **Yes** dabaayein.

Ab Notepad mein **bilkul ye** likhein (apna Script ID lagayein):

```json
{
  "scriptId": "YAHA_APNA_SCRIPT_ID_PASTE_KAREIN",
  "rootDir": ""
}
```

**Misaal:**

```json
{
  "scriptId": "1a2B3c4D5e6F7g8H9i0JkLmNoPqRsTuVwXyZ_abc123xyz",
  "rootDir": ""
}
```

> 🔴 **Zaroori:** `rootDir` **khali** rehne dein (`""`), kyun ke hum pehle hi
> `apps-script` folder ke andar hain.

**Save karein:** `Ctrl + S` → Notepad band kar dein.

**Check karein:** Command Prompt mein likhein:

```
type .clasp.json
```

Jo abhi likha tha wo nazar aaye — ✔ **jod lag gaya!**

---

## ✅ Hisa 7: Code bhejna — `clasp push` 🚀

Ab asli kaam. Ye command aap ki sari files Google par bhej degi.

```
clasp push
```

**Kya hoga:** kuch lines chalengi, aakhir mein:

```
└─ appsscript.json
Pushed 81 files.
```

✅ **Matlab code Google par pahunch gaya!** 🎉

> ⚠ Agar poochay: **"? Manifest file has been updated. Do you want to push
> and overwrite? (y/N)"** → `y` likh kar **Enter** dabaayein.

**Check karein:** browser mein script.google.com kholein — aap ko apni sari
files baen taraf nazar aayengi (`Code.gs`, `Sales.gs`, `Index.html` …).

---

## ✅ Hisa 8: Pehli dafa Setup chalana (sheets banana)

Ab **database (sheets)** banani hai. Ye **sirf ek dafa** hota hai.

> ⚠ **YE PURANA TAREEQA GHALAT THA — v2.8 mein theek kar diya gaya.**
> `attachSpreadsheet` **kuch jodta nahi**, sirf likh kar batata hai ke link hai ya nahi.
> Is liye ye chalane se spreadsheet **judi nahi** thi aur aage ka setup atak jata tha.
>
> **Sahi tareeqa (niche Hissa 8.4 dekhein):**
> - Naya spreadsheet chahein → `setupAll` (khud bana deta hai)
> - Pehle se bani apni sheet jodni ho → `attachExistingSpreadsheet`
> - Sirf dekhna ho ke kya juda hai → `spreadsheetInfo`
>
> 📄 **Mukammal guide ke liye `FIRST-SETUP-GUIDE.html` dekhein** — us mein har qadam,
> har file ka naam aur har function ka naam likha hai.

### Qadam 8.4 — Spreadsheet ka sahi tareeqa (v2.8)

**A) Naya spreadsheet (99% log ke liye yahi):**
1. Baen taraf files list mein **`Setup.gs`** kholein
2. Upar dropdown se **`setupAll`** chunein → **Run**
3. Authorization aaye to **Advanced → Go to … (unsafe) → Allow**
4. 10–30 second intezaar → log mein `spreadsheetId` + `url` aaye ga
5. ✅ Spreadsheet **khud ban jati hai** — aap ko kuch banana nahi

**B) Pehle se bani apni spreadsheet jodni ho:**
1. Apni sheet ka URL se **ID** copy karein (darmiyani hissa)
2. `Setup.gs` ke aakhir mein `var ATTACH_ID = ''` ke quotes ke beech paste karein
3. **Save** dabayein
4. Dropdown se **`attachExistingSpreadsheet`** chunein → **Run**

**C) Jaanch:** dropdown se **`spreadsheetInfo`** → Run → ID aur link nazar aaye ga.

### Qadam 8.2 — Sari sheets banayein

1. Function dropdown mein **`setupAll`** chunein
2. **Run** dabaayein
3. 10–30 second intezaar karein
4. Execution log mein lambi list aaye gi (sab sheets ke naam)

✅ **Matlab aap ka database ban gaya!**

### Qadam 8.3 — (Ikhtiyari) Demo data

Agar **test data** (products, customers) chahiye to:
- Function **`seedDemo`** chunein → **Run**

> 💡 Asli kaam ke liye **seedDemo mat chalayein** — ye sirf test ke liye hai.
> Asli products aap ERP ke andar **CSV se import** karen ge.

---

## ✅ Hisa 9: Deploy — dukaan ka darwaza kholna 🚪

Ab app ko **internet par** lana hai.

### Qadam 9.1 — Naya deployment

1. Upar daen taraf **"Deploy"** (neela button) dabaayein
2. **"New deployment"** chunein
3. Gear icon ⚙ ke aage, **"Select type"** par click karein
4. **"Web app"** chunein
5. Ab ye settings bharein:

| Setting | Kya chunein |
|---|---|
| **Description** | `Haseeb Autos v2.6` (jo marzi) |
| **Execute as** | **Me** (apna email) |
| **Who has access** | **Anyone** _(sab se aasan)_ |

> ⚠ **"Who has access"** ke liye behtar:</br>
> • Sirf aap / staff ke liye → **Anyone with Google account** (zyda mehfooz)</br>
> • Sab ke liye (bina login) → **Anyone** (kam mehfooz)</br>

6. **Deploy** dabaayein
7. Google phir poochay ga authorization → **Allow** (Hisa 8.1 ki tarah)

### Qadam 9.2 — URL copy karein 🔗 (sab se qeemti cheez)

Deploy ke baad aap ko **"Web app"** ke neeche ek lamba link milega:

```
https://script.google.com/macros/s/AKfycb……………/exec
```

**Isay copy kar ke mehfooz kar lein** (Notepad mein save kar lein).

🎉 **Mubarak ho! Ye aap ki poori ERP app ka pata hai.**

---

## ✅ Hisa 10: Teen mobile apps — har app ka apna URL

Ek hi deployment se **3 alag mobile apps** milte hain. Bas aakhir mein
`?app=...` lagana hai:

| App | URL |
|---|---|
| 🏬 **Warehouse** | `APKA_LINK?app=wh` |
| 🧾 **Field Orders** | `APKA_LINK?app=fo` |
| 🚚 **Salesman** | `APKA_LINK?app=sm` |
| 💻 **Poori ERP** | `APKA_LINK` |

**Misaal:**

```
https://script.google.com/macros/s/AKfycb………/exec?app=wh
https://script.google.com/macros/s/AKfycb………/exec?app=fo
https://script.google.com/macros/s/AKfycb………/exec?app=sm
```

**Phone par install kaise karein:**
- **Android:** Chrome mein link kholein → ⋮ (upar daen) → **"Install app"**
- **iPhone:** Safari mein link kholein → Share ↗ → **"Add to Home Screen"**

*(Har app alag icon aur alag naam ke sath nazar aaye gi.)*

---

## ✅ Hisa 11: Rozana ka kaam — update kaise karein

Jab bhi code badle (naya version aaye), sirf **3 commands**:

```
cd C:\Users\Haseeb\Desktop\HaseebAutos\apps-script
clasp push
```

Phir **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy**

> 💡 **Shortcut:** `clasp push` ke baad
> ```
> clasp deploy
> ```
> likhein — naya version ban jaye ga. *(Magar pehli dafa UI se karna behtar hai
> taake samajh aaye.)*

---

## 🆘 Hisa 12: Masle aur un ka hal

| Masla (error) | Wajah | Hal |
|---|---|---|
| `node is not recognized` | Node install nahi hua, ya PATH nahi laga | Computer **restart** karein. Phir bhi na chalay to Node dobara install karein |
| `npm is not recognized` | Wahi | Computer **restart** karein |
| `clasp is not recognized` | clasp install nahi hua | `npm install -g @google/clasp --force` phir CMD dobara kholein |
| `User has not enabled the Apps Script API` | API ON nahi | **https://script.google.com/home/usersettings** → API **ON** |
| `Could not find script` / `Script ID not found` | Script ID ghalat | Hisa 5.2 dobara karein, `.clasp.json` check karein |
| `Unable to read manifest` | `.clasp.json` ghalat jagah | `type .clasp.json` se check karein; `apps-script` folder ke **andar** hona chahiye |
| `Syntax error` push ke waqt | File kharaab | Mujhe batayein — fix kar ke doonga |
| App khule to **safed screen** | Deploy purana | Deploy → Manage → **New version** |
| "Authorization required" baar baar | Normal hai | Har dafa **Advanced → Go to … (unsafe) → Allow** |
| Sheets khali / columns missing | Schema update nahi hua | ERP mein **Settings → Data & tools → 🧰 Repair/upgrade sheets** |
| `Pushed 0 files` | Ghalat folder | `dir` karein — `.gs` files nazar aani chahiye |

---

## 📋 Hisa 13: Chhoti cheat-sheet (print kar lein)

```
# 1. Folder mein jayein
cd C:\Users\Haseeb\Desktop\HaseebAutos\apps-script

# 2. Check: sahi jagah?
dir

# 3. Login (sirf pehli dafa)
clasp login

# 4. Code bhejein
clasp push

# 5. (ikhtiyari) naya version
clasp deploy
```

**Zaroori links:**
- Apps Script: https://script.google.com
- API ON karne ke liye: https://script.google.com/home/usersettings
- Node.js: https://nodejs.org

**Zaroori functions (editor mein Run karein):**
- `setupAll` — naya spreadsheet banana + sab kuch (pehle) ← **yahi chahiye aksar**
- `attachExistingSpreadsheet` — pehle se bani apni sheet jodna
- `spreadsheetInfo` — abhi kaunsi sheet judi hai (ID + link)
- `repairSchema` — columns theek karna (update ke baad)
- `attachSpreadsheet` — ❌ ye jodta NAHI, sirf likh kar batata hai (purana, bewaqoofana naam)

---

## 🎯 Ek nazar mein poora safar

```
1. Node.js install + restart
2. npm install -g @google/clasp
3. script.google.com/home/usersettings  →  API ON
4. clasp login        →  browser mein Allow
5. script.google.com  →  New project  →  Script ID copy
6. notepad .clasp.json  →  Script ID paste
7. clasp push         →  "Pushed 81 files"
8. Editor: setupAll  →  Run   (spreadsheet khud ban jayegi)
   [agar apni purani sheet jodni ho to: attachExistingSpreadsheet]
9. Editor: spreadsheetInfo  →  Run  (tasalli: ID + link)
10. Deploy → New deployment → Web app → Who has access: **Anyone** → Deploy
    (⚠ "Anyone" na chunein to URL khulte hi Google sign-in maangega)
11. Error aaye to Hissa 12 dekhein — khaas kar "meta tag … not allowed" wala
11. URL copy  →  App khul gayi! 🎉
12. Mobile:  URL?app=wh  ·  URL?app=fo  ·  URL?app=sm
```

---

**Koi masla aaye to mujhe batayein** — error ka poora text bhej dein, main
theek kar ke bata doon ga.


---

## Hissa 12 — Deploy ke baad error? (asli waqiyat, v2.8.1)

### 12.1 `Exception: The meta tag you specified is not allowed in this context.`

**Kya tha:** `Code.gs` ke `doGet()` aur `Pwa.gs` ke `serve()` mein `theme-color`,
`description`, `apple-mobile-web-app-title` aur `apple-mobile-web-app-status-bar-style`
server se `addMetaTag()` se add ho rahe the. Apps Script sirf **4** meta tags allow karta hai:

| Allowed (server se) | Allowed NAHI |
|---|---|
| `viewport` | `theme-color` |
| `apple-mobile-web-app-capable` | `description` |
| `mobile-web-app-capable` | `apple-mobile-web-app-title` |
| `google-site-verification` | `apple-mobile-web-app-status-bar-style` |

Illegal tag par exception aata hai aur **poora page fail** ho jata hai — app khulti hi nahi.

**v2.8.1 ka hal (2 hissay):**
1. **Server:** `Code.gs` ▸ `addSafeMetaTag()` — sirf allowed tags add karta hai, baqi skip.
2. **Client:** baqi tags browser mein inject hotay hain (`Index.html` ka upsert script aur
   `Pwa_Shell.html` ▸ `HA_applyExtraMeta()`). Browser par koi pabandi nahi.

**Machine-verifiable:** `node tools/test_metatags.js` (verify.sh ka `metatags` gate, 24 checks) —
asli `doGet()` aur teenon PWA routes ko chala kar dekhta hai.

### 12.2 URL khulte hi Google sign-in maangta hai

Deploy ke waqt **Who has access = Anyone** nahi chuna gaya.
**Ilaj:** Deploy ▸ Manage deployments ▸ ✏ Edit ▸ **Anyone** ▸ Deploy.
Tasalli: doosre phone se (apne Google account ke baghair) URL kholein.

### 12.3 Executions log mein `Failed · 0s`

0 second = code shuru hote hi ruka. Executions ▸ us line par click ▸ error message padhein.

### 12.4 `setupAll` 195 second le raha hai

**Normal.** 76 sheets + seed = 2–4 minute. `Completed` likha ho to theek hai.


---

## Hissa 13 — Mobile par kaise kholein? "Anyone" ya "Anyone with Google account"?

### 13.1 `Sorry, unable to open the file at present.` (mobile)

**Ye app ki ghalti NAHI.** Google ka mashhoor **multi-account redirect bug** hai:
phone ke browser mein ek se zyada Google account sign-in hon to Google URL mein
`/u/0/`, `/u/1/` laga deta hai; mobile browser ki privacy settings us redirect ki
cookie rok deti hain → generic Drive error page.

**Ilaj (tarteeb se):**

| # | Kya karein |
|---|---|
| 1 | Deploy mein **Who has access: Anyone** karein (redirect hi nahi hota → bug paida nahi hota) |
| 2 | URL mein `script.google.com/` ke baad **`a/~/`** laga dein:<br>`https://script.google.com/a/~/macros/s/AKfyc…/exec` (Workspace: `a/*/`) |
| 3 | **Incognito / Private tab** mein kholein |
| 4 | iPhone: link ko **Google app** ke search bar mein paste karein |
| 5 | WhatsApp ke andaruni browser se na kholein — **Chrome** use karein |

### 13.2 Dono access options ka farq

| Option | Kya hota hai | Kab |
|---|---|---|
| **Anyone** ⭐ | Koi sign-in nahi; link khulte hi app. Redirect nahi → mobile bug nahi | **Dukan ke liye yahi** — app ke andar apna login (owner / admin123) phir bhi hai |
| Anyone with Google account | Pehle Google sign-in, phir app. Mobile par multi-account se aksar fail | Sirf jab sirf Google-account walon ko access dena ho |

### 13.3 Mobile par safaid khaali page (blank white page)

Apps Script app ko sandboxed `<iframe>` mein serve karta hai; mobile browser us ki height
collapse kar dete hain. **2 cheezein zaroori hain** (v2.8.2 mein dono maujood hain):
1. `Code.gs` ▸ `setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)`
2. `Styles.html` ▸ `html,body{ min-height:100vh; min-height:100dvh }`

Machine check: `node tools/test_diagnose.js` (verify.sh ka `diagnose` gate).

### 13.4 Apne account ki haqeeqat khud dekhein — `Diagnose.gs`

| Function (dropdown se) | Kya batata hai |
|---|---|
| `diagnoseWebApp` | page render hota hai ya nahi, size, missing HTML files, teenon PWA, database, mobile URLs |
| `deploymentUrls` | asli `/exec` URL + `/a/~/` variant + teenon PWA URLs |
| `diagnoseAll` | sab kuch ek saath (web app + database + triggers) |

Jawab **Execution log** mein aata hai. Ye functions sirf **jaanch** karte hain — koi data change nahi hota.

### 13.5 Mobile PWA URLs

`URL?app=wh` (Warehouse) · `URL?app=fo` (Field) · `URL?app=sm` (Salesman) · `URL` (poora ERP)
App khulne ke baad Chrome menu ⋮ ▸ **Add to Home screen**.
