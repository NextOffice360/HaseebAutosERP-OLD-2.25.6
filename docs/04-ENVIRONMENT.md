# ④ Environment — clasp, config, PWA (KOI SECRET NAHI)

> ⚠️ Is project me **koi bhi asli token/password save nahi hai** — aur hona bhi nahi
> chahiye. Neeche sirf placeholders hain. Token aankhon se do, file me kabhi nahi.

## clasp (command line se Apps Script)
```bash
npm i -g @google/clasp
clasp login                       # browser me Google login
cp clasp.template.json .clasp.json   # <SCRIPT-ID> apne project ka daalo
clasp push                        # apps-script/ → Apps Script
clasp open                        # editor
```
`clasp.template.json` me sirf placeholder hai. `.clasp.json` **commit na karein**.

## Environment variables (sirf aap ki machine par)
| Variable | Kab | Kahan |
|----------|-----|-------|
| `GITHUB_TOKEN` | push ke waqt | sirf command env: `GITHUB_TOKEN=<APNI-PAT-YAHAN> bash tools/git_push.sh` — script file me NAHI likhti |
| `LD_LIBRARY_PATH` | test gates (puppeteer) | `export LD_LIBRARY_PATH=/home/user/.cache/chrome-libs/usr/lib/x86_64-linux-gnu` |
| `API_URL` | static build | ya `static-config.json` me `apiUrl` |

## Static hosting / PWA
- `tools/build_static.py` — dist-static/ (JSONP se asli backend ko data milta hai);
  URL `static-config.json` (`apiUrl`) ya `API_URL` env se aata hai.
- `demo/` = offline preview (mock data — asli app NAHI). PWA files: `demo/manifest.webmanifest`,
  `demo/sw.js` (build_demo.py banata hai), scanner: `pwa/qr-scanner`.

## Git push (project ka poora record)
```bash
GITHUB_TOKEN=<APNI-PAT-YAHAN> bash tools/git_push.sh
```
Script khud: remote compare → fast-forward ya `--force-with-lease` → verify remote SHA.
PAT **sirf env se** — `.git/config`, files, commits me kabhi nahi (script me check hai).
PAT rotate karna = GitHub ▸ Settings ▸ Developer settings ▸ Tokens ▸ Revoke + naya.
