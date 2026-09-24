# CHANGELOG — Haseeb Autos ERP & POS

## v2.24.0 — scan parity har page/modal, modal & drawer close reliability, Demand module v2

**User feedback jis par ye release bani:** "PO, GRN pages, modals don't have same QR/barcode scanning logic as POS",
"cancel button, close button not working in many popups and modal windows",
"New Customer Demand — enhance the UI, many fields wired nahi / logic flow nahi", "Salesman Stock modal mein barcode logic nahi".

### 1. Scan parity — aik hi core, har jagah POS jaisa behaviour
- **PO form (New PO / edit PO)** purana custom search tha — ab wahi shared scan-first picker (scan → PO line, qty merge, stock cap, invalid code safe). GRN drawer, Take Order bulk, Salesman Stock Issue, Transfer, Adjustment, Demand — sab aik hi core par.
- `UI2.itemPicker` v2: dono modes mein **dedicated scan block** (`📷 Scan → direct add → ready`).
  Normal mode: scan **seedha line mein** add hota hai (bulk UI nahi khulti) · Multi mode: scan Bulk List mein jama.
- Ek hi shared `locate()` lookup: exact code → barcode → id → EAN-13 suffix (GS1) — PO/GRN/Take Order/Salesman/Transfer/Adjustment/POS sab isi par.
- HID wedge support: search box mein bhi burst aaye to Enter ya 280ms settle par auto-add (dropdown hijack nahi, file dialog nahi).
- Invalid code → toast + **field clear + refocus** (order/qty bilkul nahi bigadta) · duplicate scan → **qty merge** (nayi line nahi) · stock cap.
- Live scan status line (`✅ FL00000 → item ×1`) aur picker header (mode + line/selected count).
- Real-Chrome proof: `tools/test_browser_scan.js` mein GRN drawer, Stock Issue, Take Order bulk aur Demand form ke scan tests.

### 2. UI2.form — asli async search field (fields ab "wired" hain)
- `type:'search'` pehle plain text box ban jata tha aur `load:` callback **kabhi call hi nahi hota tha** — ab dropdown + keyboard nav (↑↓/Enter) + 📋 poori list + ✓ pick badge + `row.fill` se auto-fill + `onPick`/`onChange` hooks.
- Naye field types: `sec` (section card), `note` (info/warning callout), `el` (live data panel); API mein `show() / set() / setOptions()`.
- Demand form isi par bana: customer/product pickers catalog se, `📷` scan button, auto-fill (name/code/category/brand/make/model).

### 3. Modal / drawer / offcanvas close reliability (shared fix)
- `UI2.modal`, `UI.modal`, `UI.drawer`, `UI2.offcanvas` — chaar koi bhi ho: **footer mein Cancel/Close hamesha mojood** (na ho to add; opt-out `noCancel:true`).
- Overlay registry + **global Escape**: pehla Esc khuli list band karta hai, agla Esc sab se upar wala overlay — focus wapas pehle element par.
- Jo asli bugs mile aur theek hue: `UI.drawer` mein Esc support hi nahi tha · App_Boot ka Esc/global-search handler `#scrim`/`#gsResults` null hone par throw karta tha (isi wajah se "close kaam nahi karta" lagta tha) · Stock Issue modal async API ke intezar mein khulta hi nahi tha (silent throw) — ab modal pehle khulta hai, routes/areas baad mein.
- Naya permanent gate: `tools/test_modals_close.js` — ✕ / Cancel / Esc / backdrop per modal, 11 openers, 82 checks.

### 4. Customer Demand module v2 (ERP-grade)
- Create/Edit modal dobara: section cards (Customer · Product · Demand details · Advanced) + quick chips (Aaj / 3 din / 1 hafta; qty 1–25).
- Data-aware: customer balance + credit limit + open demands · duplicate open-demand guard · item stock, retail/wholesale/cost, demand history · stock 0 par sourcing suggestion.
- Advanced: customer PO ref, budget price (cost se kam par warning), partial/substitute policy, follow-up date, notify channel (SMS/WhatsApp/Both), preferred supplier, tags, internal note.
- **Walk-in flow**: customer list se pick na ho to naam + phone se naya customer record khud ban jata hai.
- List: View · **Repeat demand** (clone) · Status · Vendors.
- Backend: `CustomerDemands` schema mein 8 naye columns (append-only, purani sheets safe) + `demand.create` / `demand.update` in ko accept karte hain.

### 5. Design / alignment polish
- Modal-drawer sections: title + action aik line par (ellipsis), consistent grid gaps; picker ka apna header + scan card.
- Narrow-screen fixes: footer buttons wrap (390px par "📤 Share" `x=-82` tha) · offcanvas/drawer `max-width:100vw` clamp · naye tokens ka WCAG AA contrast (`--brand-text` / `--brand-strong`).
- Stock Issue modal sections mein (Issue details / Items) · PWA bulk picker: scan field auto-focus, Esc close, wahi toast wording.

### Verification (v2.24.0)
- `bash tools/verify.sh` → **ALL GATES GREEN (47 gates)**: check · schema · logic · e2e · routes · route-audit · settings-ui · settings-defs · ui-polish · typography · charts-edge · punch (117/117) · pos-multi (23/0) · raw-writes · metatags · icons · static · pwa · pwa-ui · ui · smoke (332/0) · layout-desktop/mobile/dark/overlays/mobile-overlays/pwa/pwa-dark.
- Real Chrome: `test_browser_scan.js` **52/52** (POS + **PO** + GRN + Stock Issue + Take Order + Demand + PWA) · `test_modals_close.js` **82/82** (✕ / Cancel / Esc / backdrop har modal-drawer-offcanvas par).
- Layout: overlays **0 problems** @1440 & @390 · screens sweep **0 problems ×4** (1440/390 × light/dark) · PWA **11 tabs 0 problems** · `check_pwa` ✔
- Is release mein pakre gaye aur theek kiye gaye asli bugs: PO form ka `r2q` ReferenceError (scan chup-chaap fail hota tha), PO/GRN action button event-object leak ("PO undefined"), Stock Issue modal ka async silent fail, App_Boot Esc handler ka null crash, footer buttons ka 390px overflow, `.f-search-results` DOM mein add na hona, 10px labels (WCAG), U+FE0F variation selectors.
