# ARCHITECTURE & NAMING CONVENTIONS — A§14 (W8)

> Ye doc kaam ** describe ** karta hai jo hai — naya code isi shakal me likhna hai.
> `tools/audit_naming.js` (validate step 26) ye rules pin karta hai — toorne par RED.

## Files kaise rakhay hain

| Shakal | Matlab | Misal |
|---|---|---|
| `apps-script/*.gs` | Backend (GAS server code) — har file ka EK namespace | `Sales.gs` → `var Sales = {…}` |
| `apps-script/App_*.html` | Desktop/PWA-shell client modules (script/style chunks) | `App_POS2.html`, `App_UI2.html` |
| `apps-script/Pwa_*.html` | Naye-tab PWA pages (apna alag shell) | `Pwa_POS.html`, `Pwa_Shell.html` |
| `apps-script/Index.html` | Desktop shell ka HTML skeleton | sidebar/topbar/roots |
| `apps-script/Styles.html` | Poore client ki CSS (ek jagah) | — |
| `demo/` | Build output (build_demo.py) — EDIT NA KAREIN | source = apps-script |
| `tools/test_*.js` | Gates (behavior/DOM tests, GREEN zaroori) | `test_w13_modules.js` |
| `tools/audit_*.js` | Source audits (conventions/static asserts) | `audit_secrets.js` |
| `docs/` | Beginner guides (01–09 + OFFICIAL-DOCS + matrix/architecture) | — |
| `release/` | Ship zips + CHANGELOG-* + RELEASE-VERIFICATION-* | archive ≥3 rule |

## Naming rules (gate-pinned)

1. **Screens** (client pages): lowercase single-word ids — `App.registerScreen('pos', …)`.
   Unique zaroori (22 abhi). Naya screen = naya `App_*.html` file + nav entry.
2. **API routes**: `'domain.action'` camelCase — `'purchase.grn.save'`, `'items.list'`.
   Code.gs ke ROUTES map me hi declare; duplicates ZERO. Auth.require file ke andar.
3. **Namespaces**: `.gs` file ka top-level `var X = {…}` — ek namespace, ek file.
   Shared systems (DB, U, Auth, DT, Fields, Security…) kabhi duplicate na karein — pehle extend.
4. **Shared systems pehle**: koi naya dialog/validation/loading/table na banayein —
   `UI2.modal/confirm/validate/table`, `PWA.confirm`, `API.call`, `UI.run` extend karein.
   (A§1.3–4 ka usool: reuse, no duplicate systems.)
5. **Client permissions**: har screen/action `App.can(perm)` se filter; backend `Auth.require`.
   (A§9: sirf CSS-chhupana kafi nahi.)
6. **Koi backup/copy file git me nahi** (`.bak/.orig/.old/copy/(1)`).
7. **Demo**: `demo/` sirf build se banta hai; apps-script edit karke `python3 tools/build_demo.py`.

## Data flow (poora app ek hi tareeqe se)

```
UI (App_*.html)  ──API.call(action, payload)──▶  Code.gs api()  ──▶  domain.gs (Auth.require → DB/U)
      ▲                                                                      │
      └──────────────── JSON response ◀──────────────────────────────────────┘
PWA (Pwa_*.html) ──PWA.call (JSONP + offline queue)──▶ (wahi api() single point)
```

- **Ek hi backend entry**: `Code.gs ▸ api()` — routing, auth, audit, security sab wahin se.
- **Ek hi storage**: Google Sheets via `DB` (CACHED_SHEETS fast-read + `DB.touch()` freshness).
- **Ek hi settings source**: `DB.settings()` (Schema.gs DEFAULT_SETTINGS + Config.gs defs).
- **Ek hi date/time system**: `DT` (Utils.gs dtConfig) — app-wide display.
- **Field visibility**: `Fields.gs` wrap/scrub — backend-enforced (kill-switch `fields.enabled`).

## Naya feature banate waqt checklist
1. Pehle dekhein shared system mojood hai? (UI2.*, PWA.*, DT, Fields, Deps, Shared)
2. Route `'domain.action'` + `Auth.require` + Audit.log (write actions par)
3. Schema change? → Schema.gs (append-only columns, purani sheets safe)
4. Gate likhein (`tools/test_*.js`, chhota + standalone) + validate step wire
5. Docs parity (`docs/` + TESTING-MATRIX)

— W8 (2026-09-25) · gate: `tools/audit_naming.js` = validate step 26
