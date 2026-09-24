#!/usr/bin/env bash
# Haseeb Autos — deploy to Google Apps Script with clasp
#   bash tools/deploy.sh            → clasp push
#   bash tools/deploy.sh --deploy   → push + new version deploy
set -e
cd "$(dirname "$0")/.."

if ! command -v clasp >/dev/null 2>&1; then
  echo "✖ clasp nahi mila. Install karein:"
  echo "    npm install -g @google/clasp && clasp login"
  exit 1
fi

if [ ! -f .clasp.json ]; then
  echo "✖ .clasp.json nahi mila."
  echo "  cp tools/.clasp.json.template .clasp.json"
  echo "  phir apna scriptId daalein (script.google.com ▸ Project Settings ▸ Script ID)"
  exit 1
fi

echo "▶ syntax check…"
bash tools/check.sh >/dev/null && echo "  ✔ ok"

echo "▶ pushing to Apps Script…"
clasp push --force

echo "✔ Push complete."
echo
echo "Agar pehli dafa hai to ab ye karein:"
echo "  1) clasp open  (ya script.google.com)"
echo "  2) function 'setupAll' select kar ke Run ▶  → authorize"
echo "  3) Deploy ▸ New deployment ▸ Web app  (Execute as: Me · Access: Anyone)"
echo
if [ "$1" = "--deploy" ]; then
  echo "▶ creating new version…"
  clasp deploy --description "Haseeb Autos v$(date +%Y%m%d-%H%M)"
  echo "✔ Deployed."
fi
