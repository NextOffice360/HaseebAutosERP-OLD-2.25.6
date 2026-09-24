# Official documentation — links (master spec A§2 ke mutabiq record)

> Jo bhi technical faisla official docs ki wajah se hua, us ka link yahan mehfooz hai.
> (Links 2026-09-24 ko check kiye gaye the.)

## Google Apps Script (backend ka platform)
- Guides home: https://developers.google.com/apps-script/guides
- **Quotas** (6 min/runtime, triggers): https://developers.google.com/apps-script/guides/services/quotas
- **Web apps** (deploy/access): https://developers.google.com/apps-script/guides/web
- **HTML Service** (App_*.html sandbox/iframe): https://developers.google.com/apps-script/guides/html
- **Lock Service** (parallel writes): https://developers.google.com/apps-script/guides/services/locks
- **Sheets service** (spreadsheet as DB): https://developers.google.com/apps-script/reference/spreadsheet

## clasp (CLI)
- Repo/README: https://github.com/google/clasp
- `clasp push` / `pull` / `open` / `login` — is project ke tools/git_push.sh aur
  docs/04-ENVIRONMENT.md me isi ke mutabiq commands hain.

## PWA / browser platform (frontend)
- **Web App Manifest**: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest
- **Service workers + lifecycle**: https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
- **Background Sync (fallback design)**: https://developer.mozilla.org/en-US/docs/Web/API/SyncManager
  — note: iOS Safari me na-must; is liye app me visibility/timer-based flush (60s tick) + manual Retry.
- **Barcode/ShapeDetection (scanner fallback)**: https://developer.mozilla.org/en-US/docs/Web/API/Barcode_Detection_API
  — is liye `pwa/qr-scanner` (zxing-based) primary hai, native API fallback.

## Security practices (jo hum ne apnaye)
- OAuth scopes least-privilege: https://developers.google.com/apps-script/guides/services/authorization
- Tokens env-only (file me kabhi nahi): OWASP Secrets management cheat-sheet
  https://cheatsapp.owasp.org/ (cheatsheet_series ▸ Secrets_Management_Cheat_Sheet)

## Kya hum ne jaan-boojh kar ISTAMAL nahi kiya (record)
- **Third-party SaaS DB (Firebase/Supabase)** — spec ke mutabiq Sheet hi DB hai (simple, free).
- **Native SyncManager-only offline** — iOS support na hone ki wajah se generic queue design.
