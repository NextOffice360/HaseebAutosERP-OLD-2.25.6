#!/usr/bin/env bash
# ============================================================================
# Haseeb Autos — GIT PUSH (v2.29.0)
# ----------------------------------------------------------------------------
# Poora project GitHub par bhejne ke liye. Token KAHIN SAVE NAHI hota
# (na .git/config mein, na kisi file mein) — sirf is command ke andar use hota hai.
#
#   GITHUB_TOKEN=ghp_xxx  bash tools/git_push.sh
#   bash tools/git_push.sh ghp_xxx          # token argument ke tor par
#
# Remote: https://github.com/NextOffice360/HaseebAutosERP-OLD-2.25.6.git
# ============================================================================
set -eu
cd "$(dirname "$0")/.."
REPO="NextOffice360/HaseebAutosERP-OLD-2.25.6"
BRANCH="${BRANCH:-main}"

# ---- --bundle mode: token ke bagair ek single file banao (user khud push kare) ----
if [ "${1:-}" = "--bundle" ]; then
  git add -A; git diff --cached --quiet || git commit -q -m "Update: $(date -u +'%Y-%m-%d %H:%M UTC')"
  VER=$(grep -oE "VERSION: '[0-9.]+'" apps-script/Utils.gs | head -1 | grep -oE "[0-9.]+")
  OUT="release/haseeb-autos-v${VER}.bundle"
  git bundle create "$OUT" --all >/dev/null 2>&1
  echo "✔ bundle: $OUT ($(du -h "$OUT" | cut -f1))"
  echo "  Is file ko download kar ke apni machine par:"
  echo "    git clone $OUT haseeb-autos && cd haseeb-autos"
  echo "    git remote set-url origin https://github.com/$REPO.git"
  echo "    git push -u origin main"
  exit 0
fi

TOKEN="${GITHUB_TOKEN:-${1:-}}"
if [ -z "$TOKEN" ]; then
  echo "✖ Token chahiye. Do raste:"
  echo "  1) Agent ke sath:      GITHUB_TOKEN=ghp_xxx bash tools/git_push.sh"
  echo "  2) Apni machine par:   bash tools/git_push.sh --bundle   (bundle file banao, phir push)"
  echo "  Token: GitHub ▸ Settings ▸ Developer settings ▸ Personal access tokens ▸ repo scope"
  echo "         (ya fine-grained token: Contents = Read and write)"
  exit 1
fi

# identity (naye session mein .git/config snapshot mein nahi aata — is liye yahan bhi)
git init -q 2>/dev/null || true
git symbolic-ref HEAD refs/heads/$BRANCH 2>/dev/null || git checkout -q -b $BRANCH 2>/dev/null || true
git config user.name  "NextOffice360" || true
git config user.email "332094296+NextOffice360@users.noreply.github.com" || true
git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/$REPO.git"

echo "── local status ─────────────────────────────────"
git add -A
if ! git diff --cached --quiet; then
  git commit -q -m "Update: $(date -u +'%Y-%m-%d %H:%M UTC')" || true
fi
echo "  files: $(git ls-files | wc -l) · size: $(du -sh .git | cut -f1)"
git log --oneline -1 2>/dev/null || echo "  (koi commit nahi)"

echo "── push ($BRANCH → $REPO) ────────────────────────"
# token ko sirf isi command mein use karo (persist nahi hota)
git push "https://x-access-token:$TOKEN@github.com/$REPO.git" "$BRANCH:$BRANCH" --force-with-lease 2>&1 | \
  sed -E "s/$TOKEN/***TOKEN***/g"

echo "── verify ───────────────────────────────────────"
git ls-remote "https://x-access-token:$TOKEN@github.com/$REPO.git" 2>/dev/null | sed -E "s/$TOKEN/***TOKEN***/g" | head -3
echo "✔ ho gaya: https://github.com/$REPO"
