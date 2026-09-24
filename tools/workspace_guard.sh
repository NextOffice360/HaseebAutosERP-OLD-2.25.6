#!/usr/bin/env bash
# ============================================================================
# Haseeb Autos — WORKSPACE GUARD  (v2.28.0)
# ----------------------------------------------------------------------------
# Platform workspace snapshot ki 2 hadein hain (isi liye "data loss" hota hai
# jab workspace bhar jaye):
#     • ~128 MB   (turn-end snapshot)
#     • ~10,000 files
# Ye script batata hai ke hum kahan hain, aur `--prune` se SIRF safe cheezein
# saaf karta hai (tmp logs/probes, package caches). Releases KO CHHUTA NAHI
# karta jab tak aap khud `--prune-archives` na dein.
#
#   bash tools/workspace_guard.sh                 → report
#   bash tools/workspace_guard.sh --prune         → tmp logs + caches saaf
#   bash tools/workspace_guard.sh --prune-archives→ purane zips (newest 4 rakh kar)
# ============================================================================
set -u
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
WS="/home/user"
CAP_MB=110          # 128 ka safe margin (headroom chhod kar)
CAP_FILES=8000

prune=0; prune_arch=0
for a in "$@"; do
  [ "$a" = "--prune" ] && prune=1
  [ "$a" = "--prune-archives" ] && prune_arch=1
done

hdr() { echo ""; echo "── $* ───────────────────────────────────────"; }

size_mb() { du -sm "$1" 2>/dev/null | cut -f1; }
count_files() { find "$1" -path '*/node_modules' -prune -o -type f -print 2>/dev/null | wc -l; }

TOTAL_MB=$(size_mb "$WS")
TOTAL_FILES=$(find "$WS" -path '*/node_modules' -prune -o -path '*/.cache' -prune -o -type f -print 2>/dev/null | wc -l)

echo "══════════════════════════════════════════════════════════════"
echo " WORKSPACE GUARD   ($WS)"
echo "══════════════════════════════════════════════════════════════"
printf " total            : %s MB / %s MB soft-cap\n" "$TOTAL_MB" "$CAP_MB"
printf " files (saved)    : %s / %s\n" "$TOTAL_FILES" "$CAP_FILES"

hdr "Bade hisse (persisted)"
for d in haseeb-autos/release haseeb-autos/release/archive haseeb-autos/demo haseeb-autos/apps-script \
         haseeb-autos/tools haseeb-autos/dist-static haseeb-autos/shots-v2.24 haseeb-autos/tmp uploads; do
  [ -e "$WS/$d" ] && printf "  %-24s %5s MB\n" "$d" "$(size_mb "$WS/$d")"
done

hdr "Reset par gayab hone wali cheezein (ye 'data loss' nahi — ye platform ka niyam hai)"
for d in haseeb-autos/node_modules .chrome-libs .cache .npm; do
  if [ -e "$WS/$d" ]; then printf "  ✔ %-22s mojood (%s MB)\n" "$d" "$(size_mb "$WS/$d")"
  else printf "  ✖ %-22s GAYAB — 'bash tools/bootstrap.sh' se wapas aata hai\n" "$d"; fi
done

if [ $prune -eq 1 ]; then
  hdr "--prune: tmp logs + caches"
  before=$(size_mb "$WS")
  rm -f haseeb-autos/tmp/*.log haseeb-autos/tmp/probe_*.js haseeb-autos/tmp/dbg*.js 2>/dev/null
  rm -rf haseeb-autos/.cache .cache .npm 2>/dev/null
  after=$(size_mb "$WS")
  echo "  ✔ safai: $((before-after)) MB free (ab $after MB)"
fi

if [ $prune_arch -eq 1 ]; then
  hdr "--prune-archives: purane zips (newest 4 rakh kar)"
  cd "$ROOT/release/archive" || exit 1
  ls -1t haseeb-autos-v*.zip 2>/dev/null | tail -n +5 | while read -r f; do
    echo "  ✖ hata rahe: $f" >> REMOVED.txt
    echo "    hata rahe: $f"
    rm -f "$f"
  done
  [ -f REMOVED.txt ] && echo "  (record: release/archive/REMOVED.txt)"
  ls -1t haseeb-autos-v*.zip | head -5 | sed 's/^/  rakhe: /'
  cd ../..
fi

hdr "Verdict"
if [ "$TOTAL_MB" -gt "$CAP_MB" ]; then
  echo "  ⚠ workspace barh gaya — chalao: bash tools/workspace_guard.sh --prune"
  echo "    (aur zarurat par --prune-archives; releases newest 4 rakhta hai)"
else
  echo "  ✔ theek hai — snapshot cap se neeche (headroom $((CAP_MB-TOTAL_MB)) MB)"
fi
echo "══════════════════════════════════════════════════════════════"
