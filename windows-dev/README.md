# HaseebAutosERP — Windows 10/11 (64-bit) Dev Kit

Ye folder project ko **Windows 10/11 64-bit + VS Code** par develop karne ke liye hai.
Cloud-sandbox ke sab tools/tests (node + python) Windows-compatible wrappers isi folder mein hain.
Backend code `apps-script/` (Google Apps Script) mein hai — wo kisi bhi OS par edit hota hai;
tests/verify/package sab Windows se chal sakte hain.

*(This folder makes the whole cloud toolchain runnable on Windows. Roman-Urdu notes are intentional — project bilingual hai.)*

## 1) Ek dafa setup (har naye machine par)

PowerShell ya CMD kholein (admin zaroori nahi), repo clone ke baad:

```bat
git clone https://github.com/NextOffice360/HaseebAutosERP-OLD-2.25.6.git
cd HaseebAutosERP-OLD-2.25.6
windows-dev\setup-dev.cmd
```

`setup-dev.cmd` ye check/karta hai:
- **Node.js 18+** (LTS recommended) — `node -v`
- **Python 3.10+** — `python --version` (sirf build scripts ke liye)
- **Git for Windows** — bash bhi isse aata hai (verify/package ke liye zaroori)
- **npm install** (repo root) — `PUPPETEER_SKIP_CHROME_HEADLESS_SHELL_DOWNLOAD=1` pehle se set
- **Chrome for Testing** — puppeteer ke liye `npx @puppeteer/browsers install chrome@stable`

> Note: system Chrome bhi chalega; agar tests browser na kholein to upar wali install command zaroor chalayein.

## 2) Roz ka loop (VS Code terminal ya CMD)

| Kaam | Command | Kya karta hai |
|---|---|---|
| Demo server | `windows-dev\serve-demo.cmd` | `demo/` ko `http://localhost:8021` par |
| Ek test | `windows-dev\run-test.cmd test_logic` | `node tools\test_logic.js` |
| Sab node tests | `windows-dev\run-all-tests.cmd` | har `tools\test_*.js`, FAIL report |
| Syntax check | `windows-dev\check.cmd` | `bash tools/check.sh` |
| i18n audit + floor | `windows-dev\i18n-audit.cmd` | EN-purity gates |
| Demo/static build | `windows-dev\build.cmd` | `build_demo.py` + `build_static.py` |
| **Full verify (71 gates)** | `windows-dev\run-verify.cmd 2.31.4` | `tools/verify.sh` (Git-Bash) → `tmp\validate-vX.log` |
| Release zip | `windows-dev\package.cmd 2.31.4` | `tools/package.sh X.Y.Z` → `release\` |
| Git push (token se) | `windows-dev\push.cmd` | `tools/git_push.sh` + GITHUB_TOKEN prompt |
| FTP backup upload | `windows-dev\ftp-backup.cmd` | zip/log → FTP project folder |

## 3) VS Code

`.vscode\tasks.json` template isi folder mein hai: `windows-dev\vscode-tasks.json`.
Use ke liye repo root ke `.vscode\` mein copy karein (ya `windows-dev\use-vscode.cmd` chalayein).
Tasks: **serve demo**, **run single test (input box)**, **full verify**, **package release**.

## 4) Zaroori farq (Linux sandbox vs Windows)

- `LD_LIBRARY_PATH` / `CHROME_LIBS` sirf sandbox ke liye thay — **Windows par kuch nahi karna**.
- Verify/package bash-scripts hain: Windows par **Git-Bash** unhe chalata hai (`run-verify.cmd` yehi karta hai).
- Test harness login `#lgUser` / `#lgPass` + Enter hai (same dono jagah).
- Demo server ke bagair browser-tests (puppeteer wale) fail honge — pehle `serve-demo.cmd`.
- Naya session shuru karte hi (sandbox ya naya clone) — `setup-dev.cmd` ek dafa chala dein.

## 5) FTP backup rules (mandate)

- FTP = **recovery point**. Sequence: **Upload → Verify (size-match) → Delete locally → Confirm**.
- Delete KABHI pehle nahi. Project folder: `ftp://ftp.gb.stackcp.com/HaseebAutosERP/` (zips/, logs/, bundles/).
- Credentials `C:\Users\<you>\_netrc` file mein (script khud bana degi, password prompt se) — repo/logs mein password KABHI nahi.
- Pura workspace snapshot: `windows-dev\workspace-zip.cmd` → `HaseebAutosERP/snapshots/` par upload hota hai.

## 6) Windows parity — kya kya test hua

- Node tools (`tools/*.js`) platform-neutral hain — path separators ka use nahi (ya `path` module hai).
- Python build scripts pure `pathlib`/`open()` — Windows OK.
- `verify.sh`/`package.sh`/`check.sh` bash-only hain → wrappers Git-Bash se chalate hain (isi folder mein).
