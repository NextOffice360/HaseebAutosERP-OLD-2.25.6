# Haseeb Autos — v2.3 Features Guide (Roman Urdu)

Ye guide un features ke liye hai jo v2.3 mein shamil kiye gaye hain:

1. **WhatsApp / SMS / Email** se invoice bhejna
2. **Supplier price list** auto-import (CSV / Gmail)
3. **Customer loyalty** — points kamana aur POS par redeem karna
4. **Export & share** — PDF, Excel, CSV, Print
5. **Firebase migration path** — jab sheet bari ho jaye

> Har feature **Settings-driven** hai. Koi bhi rate, template ya provider code mein hardcoded nahi — sab
> `Settings` app ke andar se badla ja sakta hai.

---

## 1) WhatsApp / SMS / Email

### 1.1 Teen tareeqay (Settings ▸ Automation ▸ WhatsApp & SMS)

| Provider | Kab use karein | Kya chahiye | Cost |
|---|---|---|---|
| **LINK (default, free)** | Personal WhatsApp se bhejna — koi API key nahi | Kuch nahi | Free |
| **META (Cloud API)** | Automated, branded messages + PDF attachment | Meta app + phone number ID + token | Meta charges per conversation |
| **TWILIO** | WhatsApp + SMS dono ek hi jagah | Account SID + Auth Token + Twilio number | Twilio per-message |
| **WEBHOOK** | Apna gateway / local print-server | URL + JSON template | Apke hisaab se |

**Free mode ka matlab:** jab provider `LINK` hota hai to app `https://wa.me/92XXXXXXXXX?text=...` link banata hai.
WhatsApp app ya web khul jata hai aur message **pehle se likha hua** hota hai — aap sirf Send dabayein.
Koi API key, koi approval, koi cost nahi. Ye "personal account free use" wala tareeqa hai.

### 1.2 Meta Cloud API setup (agar automated chahiye)

1. [developers.facebook.com](https://developers.facebook.com) → **My Apps → Create App → Business**
2. App mein **WhatsApp → Getting started** add karein.
3. Test number milta hai; production ke liye apna real number register karein.
4. **Phone Number ID** aur **Temporary/permanent access token** copy karein.
5. Haseeb Autos: `Settings ▸ Automation ▸ WhatsApp & SMS`
   - `WhatsApp provider` = `META`
   - `Meta phone number ID` = copy kiya hua ID
   - `Meta access token` = token
   - `Meta API version` = `v20.0` (default)
6. Template message ka format:
   ```
   Salam {{customer}}!
   Invoice {{invoiceNo}} · {{date}}
   Total: {{total}}
   Paid: {{paid}}
   Due: {{due}}
   {{link}}
   Shukriya — {{business}}
   ```
   `{{link}}` ki jagah invoice ki **PDF ka Drive link** aa jata hai (agar `Invoice PDF attach karein` on ho).

**Placeholders:** `{{customer}} {{invoiceNo}} {{date}} {{total}} {{paid}} {{due}} {{prevBalance}}
{{closingBalance}} {{link}} {{business}} {{points}}`

### 1.3 Twilio setup (WhatsApp + SMS)

1. [twilio.com](https://www.twilio.com) → Console → **Account SID** aur **Auth Token** copy karein.
2. WhatsApp: `Messaging → Try it out → WhatsApp sandbox` — customer ko `join <code>` bhejna parta hai
   (production ke liye Twilio se WhatsApp number approval lein).
3. Settings mein:
   - `WhatsApp provider` = `TWILIO`, `Twilio Account SID`, `Twilio auth token`, `Twilio WhatsApp from` (`whatsapp:+14155238886`)
   - `SMS provider` = `TWILIO`, `Twilio SMS from` = apna Twilio number

### 1.4 Email

- `APPS_SCRIPT` (default) — Google `MailApp` se bhejta hai, koi setup nahi.
- `GMAIL` — GmailApp (signature/labels chahiye to).
- `MAILTO` — device ka email client khol deta hai.
- PDF attachment Drive se attach hota hai.

### 1.5 Use kaise karein

`Sales` → koi invoice kholein → **📤 Share** →
channel chunein (**WhatsApp / SMS / Email**), number/email confirm karein, message edit karein → Send.

- Har bheja gaya message **Outbox** (`Settings ▸ Automation ▸ WhatsApp & SMS ▸ Outbox`) mein log hota hai.
- Failed message ke aage **↻ Retry** button hai.
- `Sale ke baad auto WhatsApp` = on kar dein to har bill ke baad message khud bhej diya jayega.

---

## 2) Supplier price list auto-import

### 2.1 CSV format

Koi bhi header chal jata hai — app columns **khud pehchanta hai**:

```csv
code,name,brand,cost,retail,wholesale,barcode
BRK-001,Brake Pad Set,Bosch,620,800,760,8964000123456
OIL-001,Engine Oil 20W-50,Caltex,980,1200,1150,8964000987654
```

| App field | Accepted headers |
|---|---|
| code | `code`, `sku`, `part no`, `part number`, `article`, `ref` |
| name | `name`, `item`, `description`, `product`, `tafseel` |
| cost | `cost`, `trade price`, `purchase price`, `buy`, `rate` |
| retail | `retail`, `mrp`, `sale price`, `price` |
| wholesale | `wholesale`, `dealer`, `bulk` |
| brand / barcode | `brand`, `make` / `barcode`, `ean`, `upc` |

Comma, semicolon, tab (`TSV`) — sab support hain.

### 2.2 Import karna

**Purchase ▸ 📥 Price list** (ya Settings ▸ Automation ▸ Price list import):

1. Supplier chunein (optional)
2. CSV **paste** karein, **sample** load karein, **Gmail se layen**, ya **file chunein**
3. **🔍 Parse & preview** — app dikhata hai:
   - Kaunsa item match hua (code → barcode → name order mein)
   - Purani cost, nayi cost, **Δ%**
   - Status: `UPDATE` / `CREATE` / `SKIP` (margin guard ya match na milne par)
4. Options: `Update cost` (default on), `Update retail`, `Update wholesale`, `Create new items`
5. Rows select karke **Apply selected**

**Margin guard:** `price-import.minMarginPct` (default 5%) — is se kam margin wali price `SKIP` ho jati hai,
taake ghalati se nuksan wali price na lag jaye.

**Gmail import:** Settings mein `Gmail search query` set karein, e.g.
`has:attachment from:supplier@example.com newer_than:30d` → **📥 Gmail se layen** dabayein.
(Apps Script direct `.xlsx` nahi padh sakta — supplier ko CSV bhejne ka keh dein ya Drive se CSV export karein.)

**History:** Settings ▸ Automation ▸ Price list import ▸ **🗂 Import history**.

---

## 3) Customer loyalty (points)

### 3.1 Settings (Settings ▸ Trade ▸ Loyalty points)

| Setting | Matlab | Default |
|---|---|---|
| Loyalty program | on/off | on |
| Har kitne Rs par points | earning base | 1000 |
| Kitne points milte hain | points per base | 1 |
| 1 point = kitne rupay | redemption value | 1 |
| Kam az kam redeem points | minimum redemption | 50 |
| Invoice ka max % points se | redemption cap | 50% |
| Rounding | DOWN / NEAREST / UP | DOWN |
| Points expiry (mahine) | 0 = kabhi expire nahi | 0 |

### 3.2 Formulas

```
earned  = floor( (invoiceTotal / perAmount) × points )     ← rounding setting ke mutabiq
value   = points × rate                                     ← rupees mein
usable  = min(availablePoints, floor(invoiceTotal × maxRedeemPct/100 / rate))
closing = available − used
```

**Example:** Rs 3,200 ki bill par (1000 Rs = 1 point) → **3 points**.
Agli bill Rs 1,000 ki, cap 50% → max 500 Rs = 500 points use ho sakte hain, lekin balance sirf 3 hai → **3 points** hi lagengi.

### 3.3 POS par redeem

1. Cart banayein → **Pay**
2. Customer select karein (walk-in par points nahi milte)
3. Payment dialog ke neechay **⭐ Loyalty points** box:
   - Balance, is bill par kitne points use ho sakte hain
   - Points daal kar **Redeem** → payment rows mein `⭐ Loyalty points` add ho jata hai
4. Baqi amount cash/card/wallet se — **split payment** bilkul normal hai

Ledger mein points ki value **credit** (payment) hoti hai, aur `LoyaltyLedger` se points debit.
Har entry `Loyalty ▸ history` mein note ke sath milti hai. **Manual adjust** bhi possible hai
(Settings ▸ Trade ▸ Loyalty ▸ **⭐ Top customers by points** → Adjust).

---

## 4) Export & share (reports)

Har report (sales, item-wise, profit, stock, receivables, cashbook…) par **📤 Export / share** button hai:

| Button | Kya karta hai |
|---|---|
| 🖨 Print / Save PDF | Browser print dialog — **Save as PDF** chunein |
| ⬇ CSV | UTF-8 CSV turant download (Excel mein khul jata hai) |
| 📊 Excel (.xls) | Excel-compatible file, bina kisi library ke |
| ☁ Excel (Drive .xlsx) | Asli Google Sheet banata hai → `.xlsx` download link |
| ☁ PDF (Drive) | Server-side PDF → Drive folder, link milta hai |
| ↗ Share… | Mobile par native share sheet (WhatsApp, Drive, Bluetooth…) |

Invoice ke liye: **Sales → invoice → 📤 Share** (WhatsApp/SMS/Email) ya **🖨 Print** (58/80mm, A4, A5…).
Drive exports `Haseeb Autos Exports` folder mein jate hain (`exports.folder` setting).
`Share links (anyone with link)` on hai to bheja gaya link receiver ko directly kaam aata hai.

---

## 5) Firebase migration path (jab sheet bari ho jaye)

### 5.1 Kab sochna chahiye

`Settings ▸ Automation ▸ Firebase migration ▸ ☁ Migration dashboard` kholein — app **tier** batata hai:

| Tier | Jab | Kya karein |
|---|---|---|
| **SHEETS_OK** | < 25,000 rows | Sheet theek hai; purane rows archive karte rahiyega |
| **OPTIMIZE** | 25k–100k rows | Indexing/caching on rakhein, Firebase sync abhi set kar lein |
| **MIGRATE** | > 100k rows ya > 1M cells | Firestore par jayein — latency + cell limit dono ka hal |

Dashboard dikhata hai: har table ke rows/cells, gauge, risk (LOW/MEDIUM/HIGH), aur advice.

### 5.2 Tayari (Firebase project)

1. [console.firebase.google.com](https://console.firebase.google.com) → **Add project**
2. **Firestore Database → Create** → region `asia-south1` (Mumbai — Pakistan se sabse qareeb)
3. **Project settings → Service accounts → Generate new private key** (JSON)

### 5.3 Apps Script mein config

`Project Settings (gear) ▸ Script properties` mein add karein:

| Property | Kab | Value |
|---|---|---|
| `FIREBASE_DB_URL` | Realtime DB | `https://<project>.firebaseio.com` |
| `FIREBASE_DB_SECRET` | Realtime DB | database secret |
| `FIREBASE_PROJECT_ID` | Firestore | `<project-id>` |
| `FIREBASE_ID_TOKEN` | Firestore | OAuth2 access token (service account se) |

> Firestore ke liye token 1 ghante mein expire hota hai — production mein service-account se
> JWT sign karke token mint karein (ya Cloud Run function use karein). Realtime DB secret simple hai.

### 5.4 Export → Import

1. **⬆ Export JSON (Drive)** — har table ka JSON dump (4.5 MB ke chunks + `manifest.json`) ek Drive folder mein
2. Firestore mein import:
   ```bash
   # Node script (har collection ke liye)
   const rows = JSON.parse(fs.readFileSync('sales.json','utf8'));
   const batch = db.batch();
   rows.forEach((r, i) => {
     batch.set(db.collection('sales').doc(r.id), r);
     if (i % 500 === 0) await batch.commit();     // Firestore limit 500 writes/commit
   });
   await batch.commit();
   ```
   ya `gcloud firestore import` / Firebase CLI.
3. **🔄 Sync now** — `updatedAt/createdAt > last sync` wale rows Firebase par push
4. Daily auto-sync chahiye to `migration.autoSync` on kar dein (trigger install karwana hoga)

### 5.5 Cutover (7 steps — dashboard mein **📋 Migration plan** se copy bhi ho jata hai)

1. Firebase project banayein (asia-south1)
2. Service account key → Script Properties
3. Export JSON (Drive)
4. Import to Firestore (batch 500)
5. **Dual-write 1 hafta** — purana aur naya dono
6. **Read switch** — `DB.gs` ka adapter source `FIRESTORE` kar dein; **frontend code badalne ki zaroorat nahi**
7. Sheets read-only → archive

Code notes: `DB.all / DB.byId / DB.insert / DB.update / DB.remove` hi ek jagah hain jahan source badalna hai.
`OfflineSync` ka queue wahi payload Firebase par bhi replay ho jata hai.

---

## Troubleshooting

| Masla | Wajah / Hal |
|---|---|
| WhatsApp message nahi gaya | `LINK` mode mein link khulta hai — popup blocker allow karein. META mein token/phone-ID check karein. |
| Meta API error 190 | Token expire/expired — naya permanent token generate karein |
| Twilio error 21606 | `From` number WhatsApp-enabled nahi — sandbox join karein ya approved number use karein |
| CSV columns pehchane nahi gaye | Header line check karein (pehli line header honi chahiye); synonyms table dekhein |
| Price update nahi hua | Row `SKIP` thi (margin guard / match nahi) — preview mein reason dekhein |
| Points redeem nahi ho rahe | Cap (`maxRedeemPct`) ya minimum (`minRedeem`) check karein; customer select hona zaroori hai |
| Export PDF khali hai | Browser print dialog mein "Save as PDF" chunein; ya ☁ PDF (Drive) use karein |
| Migration sync fail | Script Properties missing — `FIREBASE_DB_URL/SECRET` ya `FIREBASE_PROJECT_ID/ID_TOKEN` set karein |
| Gmail button kuch nahi laya | Apps Script ko Gmail permission chahiye (pehli dafa authorize prompt aata hai); query check karein |
