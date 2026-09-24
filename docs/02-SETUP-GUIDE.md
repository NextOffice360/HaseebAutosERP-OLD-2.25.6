# ② Setup Guide — Pehli dafa install (bilkul shuru se)

> Target: aisa banda jis ne Apps Script pehle kabhi nahi chalaya. Waqt: ~15 minute.

## Step 0 — Kya chahiye
- Google account (Gmail) — bas.
- Ye project folder (ya GitHub se download kiya hua ZIP).

## Step 1 — Google Sheet banao + Apps Script kholo
1. [sheets.new](https://sheets.new) par nayi Sheet banao — naam do: `HaseebAutos-ERP`.
2. Sheet me: **Extensions ▸ Apps Script**.
3. Editor me default `Code.gs` kholo — uska content mita do.

## Step 2 — Project ka code daalo
**Aasan tareeqa (UI se):** `apps-script/` folder ki HAR file kholo (ye plain text hain:
`Code.gs`, `Utils.gs`, `Sales.gs`, … aur `App_*.html`), content copy karke Apps Script me
usi naam ki nayi file me paste karo. `App_*.html` files ko **HTML** type se banao (+ ▸ HTML).

**Ya clasp se (developers):** `docs/04-ENVIRONMENT.md` dekho.

## Step 3 — Database initialize (ek dafa)
Apps Script editor me:
- dropdown se file: `Setup.gs`, function: **`setupAll`** → **Run**.
- Pehli dafa Google permission maangta hai → **Allow** (ye aap ke hi Sheet ko likhta hai).
- Agar beech me ruk jaye to dobara `Setup.gs ▸ setupAll ▸ Run` — wahi jagah se **resume**
  hota hai (`Progress mehfooz: X/Y`), data dobara nahi banta.

Kya banta hai: 3 branches, 10 demo items, users (owner: `owner` / `admin123` — **pehli
login ke baad password badlein**), settings (tax 17%, loyalty rules…), numbering series.

## Step 4 — Web app banao (phone/laptop par chalane ke liye)
1. Apps Script me: **Deploy ▸ New deployment ▸ Web app**.
2. Execute as: **Me** · Who has access: **Anyone with the link** (ya jitna chahen).
3. **Deploy** → URL copy (yahin se app khulti hai). URL kabhi public paste na karein.

## Step 5 — Pehli login + wizard
1. Web app URL kholo → login: `owner` / `admin123`.
2. Setup wizard (agar mangta hai) complete karo: dukan ka naam, branch, opening cash.
3. **Settings ▸ Users** me ja kar: apna password badlo, aur `admin123` hatao.
4. **Open Shop** (POS screen ya Shop screen se) — opening cash daalo → ab sale shuru.

## Step 6 — Demo data hatao (asli dukan shuru karne se pehle)
- Settings ▸ Data: **Clear demo data** (ya `Setup.gs ▸ clearDemo ▸ Run`) — phir apne
  items/suppliers/customers import karo (Items screen ▸ Import).

Masla aaye? [08-TROUBLESHOOTING.md](08-TROUBLESHOOTING.md) ▸ phir [09-ROLLBACK.md](09-ROLLBACK.md).
