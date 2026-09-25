# 📄 Documents Hub — Asaan Guide (beginner-friendly)

*Haseeb Autos ERP · v2.30.6 · Document Intelligence (QR/Barcode/Drive/WhatsApp)*

## Documents Hub kya hai?

Sidebar me **Insights & Dashboards ▸ 📄 Documents** — yahan app ke saray generated
documents (invoices, receipts, labels, reports) ki **registry** hoti hai. Har document
scan honay wala code bhi hai — QR/barcode sirf tasveer nahi, **app kholne ki chaabi hai**.

## Roz-mara ka istemal

| Kaam | Kaise |
|---|---|
| Document dhoondna | Upar search box — doc-no / reference / module likhein |
| Type se filter | Dropdown: INVOICE / RECEIPT / LABELS / REPORT… |
| Kisi record par jana | **Entity link** (blue underline) click — customer/item/invoice foran khulegi |
| Code scan karna | **📷 Scan & Resolve** — camera/external scanner; ya **⌨ Manual code** |
| Code ka matlab | `HA:INV:INV-123` = invoice · `HA:ITM:` item · `HA:CUS:` customer · `HA:SUP:` supplier · `HA:DOC:` registry doc · `HA:PAY:` payment |
| Purana QR scan kiya? | Koi baat nahi — purane prints (JSON/CODE formats) bhi resolve hotay hain |
| WhatsApp bhejna | Row me 💬 — invoice ke liye poori Share window; baqi ke liye tayyar message + **⧉ Copy text** |
| QR bara dekhna | Row click → detail modal me bara QR + encoded value + scan-safety note |
| Drive folders | **☁ Drive setup** — root + Documents/Media/Exports… folders (IDs save rehti hain, dobara chalane par duplicate nahi banta) |

## Zaroori aadatein

- Print nikalte hi document registry me aa jata hai (invoice/receipt/labels/GRN) — khud.
- Ek hi document dobara print → **naya row nahi**, version barh jata hai (v1 → v2), purani history modal me.
- Scanner camera na de to Manual code hamesha fallback hai.
- Internet gayab? Registry offline bhi chalti hai (offlineFallback), baqi kaam online.

## Masla ho to

| Masla | Hal |
|---|---|
| Scan se record nahi khula | Code sahi likha? `HA:` se shuru? Phir bhi nahi → Documents ▸ Manual code me poora value paste karein |
| WhatsApp khula hi nahi | Browser popup allow karein (address-bar icon) |
| Drive setup fail | GAS deploy me Drive permission (scope) di gayi? DocReg.gs ▸ DocReg.bootstrap ▸ Run |
| "Registry me nahi mila" | Document purana hai — Sales/Items screen se wahan record kholein |

## Developers ke liye

- Engine: `window.Docs` (register/list/get/related) — fire-and-forget, print flows kabhi nahi rokti.
- Resolver: `App.resolveCode(code)` / `App.scanResolve()` — `apps-script/App_QR.html`.
- GAS bootstrap: `apps-script/DocReg.gs` ▸ `DocReg.bootstrap` / `DocReg.verify`.
- Share templates: Settings me `comms.docTemplate.<TYPE>` (placeholders `{{docNo}} {{ref}} {{total}}…`).
- Official refs: developers.google.com/apps-script/advanced/drive · developers.google.com/workspace/drive/api/guides/folder
