# ⑨ Rollback — purane version par wapas (bina data khoye)

> Usool: **code purana, data naya** — data (Sheet) hamesha aage chalta hai; hum sirf
> chalne wala code wapas le jate hain.

## Step 1 — Pehle backup (agar abhi tak nahi)
- Google Sheet ▸ **File ▸ Make a copy** (naam: `backup-<TARIKH>`).
- Ya `release/` folder ka aakhri zip me `apps-script/` ready-para hota hai.

## Step 2 — Code wapas (Apps Script me)
**Tareeqa A — Sheet version history (sab se asaan):**
Sheet ▸ File ▸ Version history — ye **Sheet data** ke liye hai; code ke liye nahi.

**Tareeqa B — Apps Script versions:**
1. Editor ▸ **Deploy ▸ Manage deployments**.
2. Purana **version** select karo (jaise "v2.29.1") → **Deploy**.
   URL wahi rehta hai — app foran purane code par wapas.

**Tareeqa C — purane files paste:**
`release/haseeb-autos-v<VERSION>.zip` kholo → `apps-script/` ki files
Apps Script me paste (overwrite) → **Deploy ▸ New version**.

## Step 3 — Verify (2 minute)
1. Login → dashboard khulta hai.
2. 1 test sale → report me nazar.
3. Close Shop → variance 0.
4. (Offline chalana ho) flight-mode test → sync chip.

## Kab roll forward (wapas naye par)?
Jab asli masla theek ho — CHANGELOG (`release/CHANGELOG-v*.md`) dekho ke naya version
kya theek kar raha tha; fix ka regression gate (`tools/test_*.js`) GREEN ho to bila-hichak
naye par jao.

## Kya KABHI na karein
- Sheet ka data purane snapshot par restore na karein jabke naye bills aa chuke hon
  (beech ke bills gayab ho jayenge) — sirf code rollback hota hai.
- `.clasp.json` / token kabhi zip me na jaye (package.sh me excluded hai).
