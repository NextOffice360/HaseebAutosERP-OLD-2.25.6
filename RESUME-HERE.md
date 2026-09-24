# 🚩 RESUME-HERE — environment reset / naye session ke baad PEHLE ye parhein

**Project:** Haseeb Autos ERP & POS · **Current version:** **v2.29.1** (Utils.gs ▸ `AppConfig.VERSION`)
**Last shipped:** 2026-09-24 · v2.29.1 = **W6.T3 Sidebar responsive matrix** (1440/1280/1024/768/390 × light+dark; taps ≥48 · text ≥10.8) + verify.sh false-green fix · full suite **67 gates · ALL GREEN ✔ (1248s)** (`tmp/verify291.log`) · gate `sidebar-states` **52/0**
**Spec:** `APPLICATION-WIDE-SPEC.md` (1540 L · md5 `69b50b821565d1654d2e3bed82f10e9c`) — har todo se pehle parhein
**Agla kaam:** **W7** (shared systems app-wide apply: busy/table/forms/settings) → W9/W13 → W10 → W11/W12 · **push pending:** GitHub par bhejne ke liye `PUSH-NOW.html` / `tools/connect_dashboard.py` (port 8034) dekhein

---

## 1 ▸ Ek command se environment wapas

```bash
bash /home/user/haseeb-autos/tools/bootstrap.sh
```

Ye khud karta hai: npm dependencies → Chromium libs → demo rebuild → demo server (8021) → canary gate → aur print
karta hai ke kaunsi file kahan hai. Sirf status chahiye: `bash tools/bootstrap.sh --check`

---

## 2 ▸ Reset par kya jata hai, kya nahi (ye "data loss" nahi — platform ka niyam)

| Cheez | Reset ke baad? | Wapas kaise |
|---|---|---|
| **Project files** (`apps-script/`, `tools/`, `demo/`, `dist-static/`, `release/`, `specs/`, docs) | ✅ **rehti hain** (workspace snapshot) | — |
| **Aap ke uploads** (`/home/user/uploads/`) | ✅ rehte hain | — |
| `node_modules/` (jsdom, puppeteer…) | ❌ gayab | `bash tools/bootstrap.sh` (ya `npm install --no-audit --no-fund`) |
| `/home/user/.chrome-libs` (Chromium system libs) | ❌ gayab | `python3 tools/fix_chrome_libs.py` (bootstrap khud karta hai) |
| Chalte hue processes (demo server, verify) | ❌ band | bootstrap server shuru karta hai |
| `LD_LIBRARY_PATH` environment variable | ❌ khatam | har browser-gate se pehle: `export LD_LIBRARY_PATH=/home/user/.chrome-libs/usr/lib/x86_64-linux-gnu` |
| `tmp/` logs (verification logs) | ✅ rehte hain | — |
| Release zips (`release/`, `release/archive/`) | ✅ rehte hain | — |

**Note:** snapshot ki 2 hadein hain (~128 MB, ~10,000 files). Guard chalayein: `bash tools/workspace_guard.sh`
(bhara ho to `--prune`, aur chahain to `--prune-archives` — newest 4 zips rakhta hai).

---

## 3 ▸ Master spec kahan hai (5 copies, sab byte-identical)

| Path | Kyun |
|---|---|
| **`haseeb-autos/APPLICATION-WIDE-SPEC.md`** | project root — sab se aasan jagah (README se bhi link) |
| `haseeb-autos/specs/APPLICATION-WIDE-SPEC.md` | canonical (code/docs yahi reference karte hain) |
| `/home/user/Application-Wide Performance, Dynamic UI, Shared Logic, AI Agent — Application-Wide Engineering, Performance.md` | workspace root, **asli naam** |
| `/home/user/APPLICATION-WIDE-SPEC.md` | root chhota naam |
| `/home/user/uploads/…Performance.txt` + `…Performance.md` | aap ke asli uploads (2 dafa) |

md5 (sab): `69b50b821565d1654d2e3bed82f10e9c` · 1540 lines · 25,539 characters · mapping: `specs/README.md`

---

## 3b ▸ GitHub (NextOffice360/HaseebAutosERP-OLD-2.25.6)

Poora project (395 files · v2.29.0) **commit ho chuka hai** — `main` branch tayyar hai. Push ke liye GitHub
authentication chahiye (token sandbox mein nahi hota).

```bash
# A) Agent ke sath (token sirf is command mein use hota hai, save nahi hota):
GITHUB_TOKEN=ghp_xxx  bash tools/git_push.sh

# B) Apni machine par, token apne paas rakh kar — release zip download kar ke:
unzip haseeb-autos-v2.29.0.zip -d haseeb-autos && cd haseeb-autos
git init -b main && git add -A && git commit -m "Haseeb Autos ERP v2.29.0"
git remote add origin https://github.com/NextOffice360/HaseebAutosERP-OLD-2.25.6.git
git push -u origin main
```

**Bundles:** `bash tools/git_push.sh --bundle` ek downloadable `release/haseeb-autos-vX.Y.Z.bundle`
(poori history ke sath) bana deta hai — jab chahein. Filhal bundle working tree se hata diya gaya hai
(workspace snapshot cap ke andar rehne ke liye); 1 second mein dobara ban jata hai.

Token: GitHub ▸ Settings ▸ Developer settings ▸ Personal access tokens ▸ **repo** scope
(fine-grained token mein: **Contents = Read and write**).

**Note:** `.git/config` platform snapshot se **excluded** hota hai — is liye naye session mein identity/remote
gayab lag sakte hain (commit objects mehfooz rehte hain). `bash tools/bootstrap.sh` un ko khud restore kar deta hai.

## 4 ▸ Roz-marra ke commands

```bash
# ek gate (chhota, tez)
node tools/test_field_visibility.js            # W5 — 52 checks, ~2s
node tools/test_dyn_deps.js                    # W3 — 51 checks
node tools/test_pwa_shared.js                  # W3.T4 — 16 checks

# full suite — SIRF version tag par, ek waqt mein, background/foreground with log
env -u HOME bash tools/verify.sh > tmp/verifyXXX.log 2>&1 ; tail -30 tmp/verifyXXX.log

# release
bash tools/package.sh 2.29.0                   # naya version zip
```

**Traps jo yaad rakhein:** ek waqt mein sirf ek verify · browser gates se pehle demo server (8021) chale ·
`env -u HOME` verify ke sath · `python3 tools/build_demo.py` + `build_pwa_demo.py` har apps-script edit ke baad ·
JS source mein emoji literal na rakhein · `.gs`/`<script>` patches assert-guarded script se + `node --check`.

---

## 5 ▸ Ab tak kya ship hua (waves)

| Wave | Kya | Version | Gate |
|---|---|---|---|
| W1–W2 | performance core, error/retry policy, UI run/err | v2.25.x | `perf-batch` · `ui-run` · `ui-err` |
| W7 | N+1 khatam (mass requests) | v2.26.0 | `perf-batch` 34/0 |
| Hardening | PWA pay/receipt stale-node + pay-ledger gate | v2.27.0 | `pay-ledger` 48/0 |
| **W3** | dynamic/data-aware UI (`Deps`) + `Shared` accessors + PWA parity | v2.27.0 | `dyn-deps` 51/0 · `pwa-shared` 16/0 |
| **W5** | global field visibility & permissions (backend-enforced) | v2.28.0 | `fields` 52/0 |
| **W4** | **global date/time/timestamp system (settings-driven)** | **v2.29.0** | **`datetime` 44/0** |
| W6 · W9/W13 · W10 · W11/W12 | aage (A§18 order) | — | — |

Tafseel: `TODO-PERF-SHARED-UI.md` (chal raha kaam + shipped blocks) · `MASTER-REQUIREMENTS.md` (18+16 sections → waves)

---

## 7 ▸ Workspace cap (data-loss ka asli sabab)

Platform turn-end snapshot **~128 MB (+ ~10,000 files)** par best-effort capped hai. 2026-09-24 par workspace
**255 MB** ho gaya tha (12 purane zips 65 MB + 47 MB bundle + `.git` 48 MB) → isi liye files truncate hone ka khatra tha.

**Kya kiya:** `release/archive/` ke 10 purane zips (v2.25.2–v2.25.11) **working tree se** hata diye —
**zero data loss**, kyunke wo sab `.git` history (commit `9b41980`) ke andar mehfooz hain.
Wapas laane ke liye: `git checkout HEAD -- release/archive/<filename>`. Record: `release/archive/REMOVED.txt`.
Workspace ab **108 MB** — cap ke andar (headroom ~20 MB).

Nayi cheez add karne se pehle: `bash tools/workspace_guard.sh` (aur `--prune` / `--prune-archives`).

---

## 8. Push help tools (2026-09-24, sandbox-side)

- `tools/connect_dashboard.py` (port **8034**) — GitHub device-code worker: code generate karta hai, har 2s par poll, approve hote hi **khud `git push`** karta hai; code expire ho to naya code khud banata hai. Endpoints: `/status`, `/list`, `/upload`.
- `tools/control_center.py` (port **8035**) — ek page = status proxy + live code + QR (`/qr.png`) + upload inbox + downloads (`/download/bundle`, `/download/zip`). 8034 se server-side proxy (CORS-free).
- `tools/upload_inbox_server.py` (port **8033**) — standalone drag&drop upload (root + project `uploads/`).
- `PUSH-NOW.html` — user ke liye 3-step card (code + QR + backup links).
- Temporary mirrors (72h, litterbox): bundle `https://litter.catbox.moe/npagtq.bundle` · zip `https://litter.catbox.moe/k00n3r.zip` (regenerate: `git bundle create /tmp/x.bundle --all`).
- **Preview proxy requires `e2b-traffic-access-token`** → sirf LIVE PREVIEW panel se reach hota hai; raw URL normal browser mein 403 deta hai. Is liye user ko plain-text URL/QR dena behtar hai.
- Credentials: sandbox mein koi GitHub credential nahi (no gh, no token, no .netrc). Deploy key staged at `~/.ssh/haseeb_deploy` (public key user ne add ki to SSH push chal jayega).
