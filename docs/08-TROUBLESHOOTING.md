# ⑧ Troubleshooting — aam masail

| Masla | Wajah (asal) | Hal |
|-------|--------------|-----|
| **"Shop band hai… sale se pehle kholain"** | `shop.requireOpen` on hai aur aaj ka session OPEN nahi | POS/Shop ▸ **Open Shop** (opening cash ke sath) |
| **"Sale blocked: closing balance Rs X (previous + udhaar vs limit)"** | Customer ki credit limit cross | Purana hisaab wasool karo ya limit barhao (Customers) |
| **"Itne points nahi hain"** | Redeem > balance | Customer ki Loyalty ledger check karo (earn = paid bills par) |
| **"Stock kam hai (available X)"** | `allowNegativeStock` off | GRN daalo ya switch on (Settings ▸ Inventory) |
| **"Ye number already hai"** | Phone duplicate customer | Purana record use karo / number badlo |
| **Login hi nahi hota** | User DEMO data clear karne ke baad | `Setup.gs ▸ setupAll ▸ Run` dobara (resume safe) — ya Users sheet me naya owner |
| **Save all button nazar nahi** | Kuch dirty hi nahi — sahi baat | Koi tabdeeli karo; button khud zahir hoga (badge count ke sath) |
| **Offline chip lal reh gaya** | Backend tak pahunch nahi / op fail | Chip par click → failed op + **Retry**; duplicate nahi banega (idempotent ledger) |
| **Report ka profit bara lag raha** | v2.30.1 se returns NET hain — pehle wala *ghalat* bara figure tha | Returns dekho (`RTN-…`); ab profit sahi hai |
| **Receipt par amount tender se kam** | v2.30.2 se receipt = **applied** (change exclude) — ye sahi hai | Change POS par diya jata hai, drawer me aata hai |
| **Printer/QR nahi chala** | Browser popup/permission | Popup allow; QR ke liye camera permission (https zaroori) |
| **Apps Script "quote exceeded"** | Sheet quota (6 min/runtime) | Thori der baad; bari import tukron me (Items ▸ Import khud tukro me karta hai) |

## Diagnostic (Apps Script editor me Run)
- `Setup.gs ▸ setup.diag ▸ Run` — DB stats, settings sanity, last errors.
- `Audit` sheet — har sensitive kaam ka record (kaun/kab/kya).
