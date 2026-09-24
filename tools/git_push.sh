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
# DEFAULT: HEAD waise hi push hota hai (auto-commit NAHI) — taake "all files" wala
# commit apni jagah rahe. Naye kaam ko commit karna ho to: --commit flag dein.
if [ "${2:-}" = "--commit" ] || [ "${1:-}" = "--commit" ]; then
  git add -A
  git diff --cached --quiet || git commit -q -m "Update: $(date -u +'%Y-%m-%d %H:%M UTC')"
fi
PENDING=$(git status --porcelain | wc -l)
if [ "$PENDING" != "0" ]; then
  echo "  note: $PENDING pending change(s) — ye push NAHI ho rahe (sirf committed state jata hai)."
  echo "        Commit karna ho to: bash tools/git_push.sh --commit"
fi
echo "  files: $(git ls-files | wc -l) · size: $(du -sh .git | cut -f1)"
git log --oneline -1 2>/dev/null || echo "  (koi commit nahi)"

echo "── push ($BRANCH → $REPO) ────────────────────────"
# v2.30.0 FIX — pehle push "stale info" par atak raha tha: remote remove karne se
# remote-tracking refs delete ho jati hain aur `--force-with-lease` (bina explicit
# expected sha) phir hamesha reject karta hai. Ab remote ka asli sha ls-remote se
# parhte hain aur lease USSI par lagate hain; fast-forward par force ki zaroorat hi nahi.
URL="https://x-access-token:$TOKEN@github.com/$REPO.git"
RSHA=$(git ls-remote "$URL" "refs/heads/$BRANCH" 2>/dev/null | cut -f1)
PUSH_OK=0
if [ -z "$RSHA" ]; then
  echo "  remote khali hai — pehla push"
  git push "$URL" "$BRANCH:$BRANCH" 2>&1 | sed -E "s/$TOKEN/***TOKEN***/g" && PUSH_OK=1
elif git merge-base --is-ancestor "$RSHA" "$BRANCH" 2>/dev/null; then
  echo "  remote peeche hai ($RSHA) — fast-forward push"
  git push "$URL" "$BRANCH:$BRANCH" 2>&1 | sed -E "s/$TOKEN/***TOKEN***/g" && PUSH_OK=1
else
  echo "  remote diverged hai ($RSHA) — lease ke saath overwrite (expected=$RSHA)"
  git push "$URL" "$BRANCH:$BRANCH" "--force-with-lease=$BRANCH:$RSHA" 2>&1 | sed -E "s/$TOKEN/***TOKEN***/g" && PUSH_OK=1
fi

echo "── verify ───────────────────────────────────────"
NSHA=$(git ls-remote "$URL" "refs/heads/$BRANCH" 2>/dev/null | cut -f1 | sed -E "s/$TOKEN/***TOKEN***/g")
echo "  remote $BRANCH = $NSHA"
if [ "$PUSH_OK" = "1" ] && [ "$NSHA" = "$(git rev-parse $BRANCH)" ]; then
  echo "✔ push KAMYAB: https://github.com/$REPO (remote ab $(git log --oneline -1 $BRANCH | head -c 60)… par)"
else
  echo "✖ push FAIL — remote abhi bhi $NSHA par hai. Upar ki wajah dekhein."
  exit 1
fi
