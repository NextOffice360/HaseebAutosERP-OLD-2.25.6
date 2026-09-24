# Haseeb Autos — v2.2 Features Guide (Roman Urdu)

Ye guide un cheezon ke liye hai jo **v2.2** mein shamil ki gayi hain:

1. **Professional receipts / invoices** — paper sizes (thermal 58/80/110mm, A3, A4, A5, Half sheet) + **visual template designer**
2. **Invoice par previous balance** (customer ka purana udhaar)
3. **Real payment methods** — Cash, Card, Bank, **JazzCash, EasyPaisa, Raast**, Cheque, Credit — asli fee / settlement formulas ke sath
4. **Modal & offcanvas alignment** fix (offcanvas right edge par, popup center mein)
5. **AI Agent configuration** — professional, settings-driven, ⚡Automation ke andar
6. **Professional dashboards** — donut, gauge circles, bars, lines, progress, sparkline, heat, funnel
7. **Full verification** — har tab / sub-tab / link audit (koi blank block nahi)

---

## 1) Receipts & invoices — paper sizes + visual designer

### 1.1 Paper sizes (Settings ▸ Print templates)

| Size | Type | Columns / Sheet |
|---|---|---|
| **58mm** thermal | Roll | 32 chars |
| **80mm** thermal | Roll | 48 chars |
| **110mm** thermal | Roll | 64 chars |
| **A3** | Sheet | 297 × 420 mm |
| **A4** | Sheet | 210 × 297 mm |
| **A5** | Sheet | 148 × 210 mm |
| **Half A4** (chhoti invoice) | Sheet | 148 × 105 mm |
| **US Letter** | Sheet | 216 × 279 mm |

Har size ka label, width aur font size Settings se badla ja sakta hai (`print.size.<ID>.label` / `widthMm` / `fontPx`).

### 1.2 Do print tareeqay

| Tareeqa | Kab |
|---|---|
| **Browser print** (🖨 Print) | `@page { size: … }` ke sath — **Save as PDF** bhi ho jata hai |
| **ESC/POS raw** (⬇ ESC/POS) | Direct thermal printer ke liye bytes download (init → align → bold → text → CODE39 barcode → feed → cut). Print server / spooler ko bhej dein |

### 1.3 Visual designer (JSON ke sath)

Pehle wala **JSON config abhi bhi hai** (user requirement) — upar se ek **visual designer** aa gaya hai:

`Settings ▸ Print templates ▸ 🎨 Design` (ya POS ▸ Print ▸ 🎨 Design)

- **Fields on/off** — 26 receipt fields (logo, business name, Urdu name, branch, phone, NTN, invoice no, date, customer, salesman, items, subtotal, discount, tax, total, payments, **previous balance, closing balance**, change, savings, barcode, QR, footer, terms, signature)
- **Order** — ↑ ↓ se field sequence
- **Custom fields** — apne field add karein (label + key + source)
- **Paper size / copies / font size / title / footer / terms**
- **Tax invoice mode** — NTN/STRN ke sath proper tax invoice layout
- **Live preview** — sample invoice par foran nazar aata hai
- **Labon ke liye** — alag schema: name, code, price, brand, size, category, MRP, barcode, QR, business, logo

Save karne par template `PrintTemplates` sheet me JSON string ke tor par save hota hai (pura backwards-compatible).

### 1.4 Invoice par previous balance

Jab customer select hota hai to invoice par **Account summary** block aata hai:

```
Previous balance      Rs 1,250
This invoice          Rs 5,440
Paid now             -Rs 5,000
Closing balance       Rs 1,690
Credit limit          Rs 50,000
```

`Parties.balanceBefore()` ledger se purana balance nikalta hai (is invoice ke rows chhor kar) — 100% accurate, koi guess nahi.

---

## 2) Payment methods — asli logics aur formulas

`Settings ▸ Trade ▸ Payment methods` — har method ka **fee %, fixed fee, FED %, settlement days, enable/disable** configurable.

### 2.1 Formulas (industry standard)

```
fee        = round(amount × feePct / 100, 2) + feeFixed
fed        = round(fee × fedPct / 100, 2)          ← FED fee par, amount par nahi
net        = amount − fee − fed                     ← merchant ko milne wali raqam
settleDate = date + settleDays (business days)      ← weekend skip setting ke mutabiq
```

### 2.2 Defaults (research ke mutabiq — Settings me badal sakte hain)

| Method | MDR % | Settlement | Notes |
|---|---|---|---|
| **Cash** | 0 | Same day | — |
| **Card (POS machine)** | ~2.5% | T+2 | Approval code / last4 |
| **Bank transfer / IBFT** | 0 (bank ke hisaab se) | T+1 | IBAN / account no |
| **JazzCash** | ~2.0% (market 1.5–2.5%) | T+1…T+3 | Wallet number + Txn ID |
| **EasyPaisa** | ~2.5% (market 1.5–3.0%) | T+1…T+3 | Wallet number + Txn ID |
| **Raast** | **0%** (SBP: filhaal koi charges nahi) | Instant (24/7) | Raast ID = mobile number ya IBAN |
| **Cheque** | 0 | Post-dated / clearing ke baad | Status PENDING → CLEARED / BOUNCED |
| **Credit (udhaar)** | 0 | — | Ledger receivable |

> Raast State Bank of Pakistan ka instant payment system hai — is waqt is par koi transaction fee nahi.
> JazzCash / EasyPaisa merchant discount rate (MDR) published ranges se liya gaya hai — **apna asli agreement rate Settings me daalein**.

### 2.3 POS par use

Payment dialog mein ab har method ke sath **uske apne fields** aate hain:

- JazzCash / EasyPaisa → wallet number + transaction ID
- Bank / Raast → bank name, account/IBAN ya Raast ID
- Card → bank, last 4 digits, approval code
- Cheque → cheque number, bank, cheque date
- Har method ke neechay **fee preview**: `Fee Rs 40 · net Rs 1,960 · settlement 2026-09-18`

### 2.4 Cheque lifecycle

1. Cheque payment → status **PENDING** (ledger mein tab tak nahi jata)
2. **Clear** karte hi ledger post hota hai
3. **Bounce** → amount wapas udhaar mein + bank charges (`pay.cheque.bounceCharges`) customer par debit + notification
4. `Reconciliation` (`pay.reconcile`) method-wise gross / fee / FED / net / pending dikhata hai — dashboard ke **💳 Payment mix** donut par bhi nazar aata hai

---

## 3) Modal / offcanvas alignment

- **Offcanvas** → hamesha **right edge** par chipakta hai (`right: 0`), `side: 'left'` dene par left edge par
- **Modal / popup** → scrim ke bilkul **center** (`display:flex; align-items:center; justify-content:center` + `margin:auto`), mobile par upar se scrollable
- **Drawer** → right edge
- Koi bhi popup scrim ke bahar (orphan) nahi rehta

Is ki verification `tools/audit_align.js` karta hai — 36 checks, har popup type khol kar geometry verify hoti hai.

---

## 4) AI Agent configuration (⚡Automation ▸ AI assistant)

Ab AI agent **professionally configurable** hai — koi hardcoding nahi, sab DB settings me:

| Section | Kya configure hota hai |
|---|---|
| **Status** | Enabled / key state / read-write mode pills |
| **Provider & model** | GEMINI / OPENAI / OPENROUTER / MOCK, model list provider ke hisaab se, **endpoint override**, temperature (0–1), max tokens |
| **API key** | Masked set (Script Properties `AI_API_KEY` — sheet me nahi) + **🔌 Test connection** (latency + sample reply) |
| **Behaviour** | Language (Auto / Roman Urdu / Urdu / English), style (Tiny / Short / Detailed), history turns, **persona / system instructions**, auto-suggestions, MOCK fallback |
| **Guardrails** | Enable agent, write mode (drafts only), **approval lazmi**, redact CNIC/phone/ids, rate limits (system + per user), **data scope** (kaunsi branches) |
| **Tools (whitelist)** | 17 tools — per-tool on/off, READ / WRITE risk badge, search, "Enable all", "Read-only only" |
| **Presets** | Balanced · Read-only analyst · Ops assistant · Roman-Urdu cashier · Night auditor |
| **Test agent** | Seedha sawal pooch kar jawab + kaunse tools chale |
| **JSON** | Poori config JSON me dekhein / copy karein |

Agent ka system prompt ab in settings se banta hai — persona, language rule, style rule, write-mode rule, privacy aur data scope **settings-driven** hain.

---

## 5) Professional dashboards

Naya chart engine (`App_Charts.html`) — **pure SVG/CSS, koi CDN nahi** (offline PWA safe):

| Chart | Kahan |
|---|---|
| **Donut** (hover + legend + %) | Category mix, Payment mix |
| **Gauge circles** (270°) | Gross margin, Stock health, Udhaar recovery, Month target |
| **Multi-series lines** (smooth, area gradient, crosshair tooltip) | Sales vs Profit trend — Line / Area / Bars switch |
| **Bars** (vertical + horizontal, value labels) | Top items (drill-down), daily sales |
| **Progress bars** | Udhaar by customer, margin & fees, pending cheques |
| **Sparkline** | KPI cards ke andar chhota trend |
| **Heat strip / Funnel** | Insights screens |

Har chart: responsive (`viewBox`), accessible (`role="img"` + `<title>/<desc>`), hover tooltip, click drill-down, aur print-safe.

---

## 6) Verification suite (koi blank block nahi)

```bash
bash tools/verify.sh          # sab gates ek sath
```

| Gate | Kya check karta hai |
|---|---|
| `check.sh` | 25 `.gs` files + **24** HTML `<script>` blocks syntax |
| `check_partials.py` | **Leak guard** — har partial sirf aik `<style>…</style>` ya `<script>…</script>` block; block ke bahar koi CSS/JS text nahi (warna wo page par TEXT ki tarah nazar aata hai) |
| `test_logic.js` | **199** backend assertions — sales/tax/GRN/avg-cost, payments, cheques, loyalty, import, migration, AI config |
| `ui_audit.js` | Labels, a11y, empty-content audit |
| `smoke.js` | **116** UI checks — har screen/tab/action + **runtime leak guard** (page par koi CSS/JS text nahi, head me koi stray text nahi) |
| `audit_tabs.js` | **382** checks — har screen + har level-1/2/3 tab + har Settings sub-tab: content hai, blank block nahi, `NaN`/`undefined` nahi |
| `audit_align.js` | **36** checks — modal center, offcanvas right-edge, drawer, orphan popups |

**Naye gates:** `check_partials.py` (partial leak guard), `smoke.js` leak checks, `audit_tabs.js` (blank-block auditor) aur `audit_align.js` (popup alignment auditor).

> Note: pehli dafa `npm install` chala kar `jsdom` install karein (jsdom-based gates ke liye) —
> `tools/verify.sh` khud bhi install kar leta hai agar `node_modules` missing ho.

### Bug fix: header par CSS text kyun aa raha tha

Ek partial (`Styles.html`) mein naye CSS blocks `</style>` **ke baad** append ho gaye the, is liye browser
unhein CSS ki bajaye **plain text** ki tarah render kar raha tha (header ke upar stylesheet ka raw text).
Ab:

- Saara CSS `<style> … </style>` ke andar hai (file khatam bhi `</style>` par hoti hai)
- `tools/check_partials.py` aisi ghalti dobara hone nahi deta (static gate)
- `smoke.js` runtime par bhi verify karta hai ke page par koi CSS/JS text nazar nahi aa raha
- Negative test se confirm kiya gaya: jaan-bujh kar leak daalne par dono guards fail karte hain

---

## Troubleshooting

| Masla | Hal |
|---|---|
| Receipt chhota/bara print ho raha hai | Print dialog me **Paper size** badlein (58/80mm, A4, A5…) |
| Thermal printer par garbled text | ESC/POS download use karein (browser print nahi) |
| Previous balance nazar nahi aa raha | Customer select karein — walk-in par balance nahi hota |
| Wallet fee galat lag rahi hai | Settings ▸ Trade ▸ Payment methods me apna asli MDR % daalein |
| Cheque clear karne ka option nahi | `Money` screen ▸ cheques list, ya cheque payment par status PENDING |
| AI jawab nahi de raha | Settings ▸ Automation ▸ AI assistant ▸ API key daalein + **Test connection** |
| Modal left side ja raha hai | Fix ho gaya (`audit_align.js` verify karta hai) — hard refresh karein (PWA cache) |
