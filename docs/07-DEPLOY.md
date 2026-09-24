# ⑦ Deploy — app duniya tak kaise pahunchti hai

## A. Apps Script web app (asli app)
1. Editor me code sab latest hai (clasp push ya paste).
2. **Deploy ▸ Manage deployments ▸ (pencil) ▸ Version: New version ▸ Deploy**
   — URL **wohi** rehta hai (users kuch nahi mehsoos karte).
3. Naya URL chahiye to **Deploy ▸ New deployment** (naya URL — sirf jab naye log-on chahiye).

> Upgrade ka sunehri tareeqa: pehle **backup ZIP** (Sheet ▸ File ▸ Make a copy ya
> release/ ka purana zip), phir deploy, phir 1 test sale + 1 report check.

## B. Static (dist-static/) — sirf UI host, data Apps Script se
```bash
API_URL=<APPS-SCRIPT-URL> python3 tools/build_static.py
# dist-static/ kisi bhi static host par (Firebase/Netlify/GitHub Pages)
```
Host par CORS na ho to JSONP wala mode khud chalta hai (build me config ho jata hai).

## C. PWA (phone par install)
- `demo/` folder + `manifest.webmanifest` + `sw.js` (build_demo.py banata hai).
- Phone: browser me URL ▸ **Add to Home screen**. Offline me queue + auto-replay.

## Deploy ke baad 5-check (har dafa)
1. Login chalta hai (naya password).
2. Shop Open → 1 test sale (cash) → receipt.
3. Report me wahi sale nazar.
4. Close Shop → variance 0.
5. Ek offline op (flight mode) → online aate hi sync (chip green).

## Rollback
Kuch ghalat ho jaye? **abhi** [09-ROLLBACK.md](09-ROLLBACK.md) kholo — panic se pehle plan.
