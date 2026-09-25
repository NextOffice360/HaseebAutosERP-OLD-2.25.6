#!/usr/bin/env bash
# ============================================================================
# Haseeb Autos — ENVIRONMENT BOOTSTRAP  (v2.28.0 · "Environment reset" ka ilaj)
# ----------------------------------------------------------------------------
#   bash tools/bootstrap.sh            → poora environment wapas laao
#   bash tools/bootstrap.sh --check    → sirf status dekho (kuch badlo na)
#
# Platform ka niyam: workspace ki FILES save hoti hain, magar ye cheezein
# save NAHI hoti (har naye session mein gayab): node_modules, .cache, .npm,
# chalte hue servers/processes, /tmp, environment variables (LD_LIBRARY_PATH),
# aur Chromium ki system libraries (/home/user/.cache/chrome-libs).
# Yahi "data loss / reset" dikhta hai. Is script se SAB wapas aa jata hai —
# project ka asli data (apps-script, tools, demo, release, docs, specs) kabhi
# nahi jata, wo workspace snapshot mein mojood hota hai.
# ============================================================================
set -u
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
CHECK=0
[ "${1:-}" = "--check" ] && CHECK=1
CHROME_LIB="/home/user/.cache/chrome-libs/usr/lib/x86_64-linux-gnu"

say() { printf '%s\n' "$*"; }
hdr() { say ""; say "── $* ──────────────────────────────────────────────"; }

say "══════════════════════════════════════════════════════════════"
say " HASEEB AUTOS — BOOTSTRAP   ($ROOT)"
say " mode: $([ $CHECK -eq 1 ] && echo 'check only' || echo 'restore')"
say "══════════════════════════════════════════════════════════════"

# ── 1) project files (ye snapshot mein hote hain — sirf yaad dilana) ────────
hdr "1) Project data (persisted — in ko kabhi kuch nahi hota)"
for d in apps-script tools demo dist-static release specs pwa; do
  [ -d "$d" ] && printf '  ✔ %-14s %s files\n' "$d" "$(find "$d" -type f | wc -l)"
done
[ -f release/haseeb-autos-v2.28.0.zip ] && say "  ✔ latest package: release/haseeb-autos-v2.28.0.zip ($(du -h release/haseeb-autos-v2.28.0.zip | cut -f1))"
[ -f APPLICATION-WIDE-SPEC.md ] && say "  ✔ master spec: APPLICATION-WIDE-SPEC.md (+ specs/APPLICATION-WIDE-SPEC.md)"

# ── 1b) git identity + remote (NOTE: .git/config snapshot se EXCLUDED hai —
#        is liye har naye session mein user/email/remote gayab ho jate hain.
#        Commit objects mehfooz rehte hain; sirf settings restore karni hoti hain.) ──
hdr "1b) git config (identity + remote)"
if [ -d .git ]; then
  if [ $CHECK -eq 0 ]; then
    git config user.name  "NextOffice360" >/dev/null 2>&1
    git config user.email "332094296+NextOffice360@users.noreply.github.com" >/dev/null 2>&1
    git config core.fileMode false >/dev/null 2>&1
    if ! git remote get-url origin >/dev/null 2>&1; then
      git remote add origin https://github.com/NextOffice360/HaseebAutosERP-OLD-2.25.6.git >/dev/null 2>&1
    fi
  fi
  say "  ✔ identity: $(git config user.name 2>/dev/null || echo '-') <$(git config user.email 2>/dev/null || echo '-')>"
  say "  ✔ remote  : $(git remote get-url origin 2>/dev/null || echo '(set nahi)')"
  say "  ✔ commits : $(git rev-list --count HEAD 2>/dev/null || echo 0) · files: $(git ls-files 2>/dev/null | wc -l) · pending: $(git status --porcelain 2>/dev/null | wc -l)"
  say "  ► GitHub push: GITHUB_TOKEN=ghp_xxx bash tools/git_push.sh   (ya --bundle se downloadable bundle)"
else
  say "  ⚠ .git mojood nahi (repo dobara init karein)"
fi

# ── 2) npm dependencies (reset par gayab ho jati hain) ─────────────────────
# quota: npm ki HAR cheez (cache + debug-logs + notifier) /tmp me — workspace me .npm kabhi na bane
export npm_config_cache=/tmp/npm-cache
export npm_config_logs_dir=/tmp/npm-cache/_logs
export npm_config_update_notifier=false
hdr "2) npm dependencies (jsdom · puppeteer …)"
NEED_NPM=0
[ -d node_modules ] && [ -f node_modules/jsdom/package.json ] || NEED_NPM=1
if [ $CHECK -eq 1 ]; then
  [ $NEED_NPM -eq 1 ] && say "  ✖ node_modules GAYAB — chalao: bash tools/bootstrap.sh" || say "  ✔ node_modules mojood ($(ls node_modules | wc -l) packages)"
else
  if [ $NEED_NPM -eq 1 ]; then
    say "  ▶ npm install (pehli baar 1–3 min lagta hai)…"
    # quota: npm cache /tmp par (workspace me .npm na bane) — v2.30.5
    npm install --no-audit --no-fund --cache /tmp/npm-cache >/tmp/npm-install.log 2>&1 \
      && say "  ✔ install ho gaya ($(ls node_modules | wc -l) packages)" \
      || { say "  ✖ npm install fail — dekhein /tmp/npm-install.log"; exit 1; }
  else
    say "  ✔ pehle se mojood ($(ls node_modules | wc -l) packages)"
  fi
fi

# ── 2b) Chromium BINARY (puppeteer) — ye bhi ~/.cache mein hota hai (snapshot se bahar) ──
hdr "2b) Chromium binary (real-browser gates ke liye)"
CHROME_PATH=$(node -e "try{process.stdout.write(require('puppeteer').executablePath()||'')}catch(e){}" 2>/dev/null)
if [ -n "$CHROME_PATH" ] && [ -x "$CHROME_PATH" ]; then
  say "  ✔ mojood: $CHROME_PATH"
elif [ $CHECK -eq 1 ]; then
  say "  ✖ Chromium gayab — chalao: bash tools/bootstrap.sh"
else
  say "  ▶ Chromium download (puppeteer) — ~150 MB, 1–4 min…"
  PUPPETEER_SKIP_CHROME_HEADLESS_SHELL_DOWNLOAD=1 npx --yes puppeteer browsers install chrome >/tmp/chrome-install.log 2>&1 \
    && say "  ✔ download ho gaya" || say "  ⚠ download fail — dekhein /tmp/chrome-install.log (browser gates tab tak red rahenge)"
  CHROME_PATH=$(node -e "try{process.stdout.write(require('puppeteer').executablePath()||'')}catch(e){}" 2>/dev/null)
  [ -n "$CHROME_PATH" ] && [ -x "$CHROME_PATH" ] && say "  ✔ ab mojood: $CHROME_PATH"
fi

# ── 3) Chromium libraries (real-browser gates ke liye) ─────────────────────
hdr "3) Chromium libs ($CHROME_LIB)"
if [ $CHECK -eq 1 ]; then
  [ -d "$CHROME_LIB" ] && say "  ✔ html $(ls "$CHROME_LIB" 2>/dev/null | wc -l) files" || say "  ✖ libs gayab — chalao: python3 tools/fix_chrome_libs.py"
else
  python3 tools/fix_chrome_libs.py 2>&1 | tail -1 | sed 's/^/  /'
fi

# ── 4) demo build + server (process reset par band ho jata hai) ────────────
hdr "4) Demo build + demo server (8021)"
if [ $CHECK -eq 0 ]; then
  python3 tools/build_demo.py >/dev/null 2>&1 && python3 tools/build_pwa_demo.py >/dev/null 2>&1 \
    && say "  ✔ demo + PWA demos rebuild ($(du -h demo/index.html | cut -f1))" || say "  ⚠ demo build fail (apps-script syntax check karein)"
fi
if [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 'http://127.0.0.1:8021/index.html')" = "200" ]; then
  say "  ✔ demo server 8021 chal raha hai"
elif [ $CHECK -eq 1 ]; then
  say "  ✖ demo server band hai — bootstrap chalane par khud shuru ho jata hai"
else
  nohup python3 -m http.server 8021 -d "$PWD/demo" --bind 0.0.0.0 >/tmp/demo8021.log 2>&1 &
  sleep 2
  if [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 'http://127.0.0.1:8021/index.html')" = "200" ]; then
    say "  ✔ demo server shuru (pid $! · port 8021 · http://127.0.0.1:8021/index.html)"
  else
    say "  ✖ demo server start nahi hua — dekhein /tmp/demo8021.log"
  fi
fi

# ── 5) canary: ek chhota gate (2 second) ───────────────────────────────────
hdr "5) Canary gate (W5 field-visibility — 2s)"
if [ $CHECK -eq 0 ] && [ $NEED_NPM -eq 0 -o $CHECK -eq 0 ] && [ -d node_modules ]; then
  export LD_LIBRARY_PATH="$CHROME_LIB"
  OUT=$(node tools/test_field_visibility.js 2>&1 | tail -1)
  say "  $OUT"
else
  say "  (skip — check mode / deps nahi)"
fi

# ── 6) yaad dehani: agla kaam kahan likha hai ──────────────────────────────
hdr "6) Kahan kya likha hai (task shuru karne se pehle)"
say "  • RESUME-HERE.md              ← reset ke baad PEHLE ye (state + commands)"
say "  • APPLICATION-WIDE-SPEC.md    ← master spec (har todo se pehle parhein)"
say "  • specs/README.md             ← spec ki 5 copies + mapping"
say "  • MASTER-REQUIREMENTS.md      ← 18+16 sections → waves (W1–W13) ka status"
say "  • TODO-PERF-SHARED-UI.md      ← chal raha kaam + shipped blocks"
say "  • ATTACHMENTS-INDEX.md        ← kis todo se pehle kaunsi upload parhni hai"
say ""
say "  Full verify (version tag par, ~20 min, ek hi waqt mein):"
say "    env -u HOME bash tools/verify.sh > tmp/verifyXXX.log 2>&1; tail -30 tmp/verifyXXX.log"
say "  Package:  bash tools/package.sh <version>"
say "  Workspace guard: bash tools/workspace_guard.sh"
say "══════════════════════════════════════════════════════════════"
