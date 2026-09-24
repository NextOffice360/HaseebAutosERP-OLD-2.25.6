#!/usr/bin/env bash
# ==========================================================================
# tools/quick.sh — CHHOTE iteration ke liye (sandbox hang se bachne ke liye).
#
#   bash tools/quick.sh labels-live modals-close
#   QUICK_TMO=240 bash tools/quick.sh smoke
#
# Har gate apne timeout ke sath chalta hai: agar koi gate hang ho jaye to
# timeout usay maar deta hai (poora sandbox nahi atakta) aur baqi gates
# chalte rehte hain. Output sirf summary — poora log nahi.
#
# Full suite (56 gate, ~19 min) SIRF version tag par chalayein:
#   env -u HOME bash tools/verify.sh > tmp/verifyNNN.log 2>&1
# ==========================================================================
set -u
TMO=${QUICK_TMO:-150}
if [ "$#" -eq 0 ]; then
  echo "usage: bash tools/quick.sh <gate> [gate ...]"
  echo "       (gates ki list: bash tools/verify.sh --list | bash tools/verify.sh --list fast)"
  exit 2
fi
KNOWN=$(bash tools/verify.sh --list 2>/dev/null | sed 's/^ *//' | grep -v ':' )
echo "▶ quick.sh — ${#} gate · per-gate timeout ${TMO}s"
fail=0; t0=$(date +%s)
for g in "$@"; do
  # v2.25.8 — ghalat/na-register-shuda gate chup-chaap "ok" na ho (verify.sh
  # aise naam par kuch nahi karta aur exit 0 de deta hai)
  if ! printf '%s\n' "$KNOWN" | grep -qx "$g"; then
    echo "  ?  UNKNOWN  $g  — ye gate verify.sh mein register nahi (--list dekhein)"; fail=1; continue
  fi
  s=$(date +%s)
  out=$(timeout "$TMO" bash tools/verify.sh "$g" 2>&1); rc=$?
  e=$(date +%s); d=$((e - s))
  clean=$(printf '%s\n' "$out" | sed 's/\x1b\[[0-9;]*m//g')
  line=$(printf '%s\n' "$clean" | grep -E 'PASS: *[0-9]+ +FAIL: *[0-9]+|gate passed|gate failed' | tail -2 | tr '\n' ' ')
  if [ "$rc" -eq 124 ]; then
    echo "  ⏱  TIMEOUT  $g  (${TMO}s se zyada — hang)"; fail=1
  elif [ "$rc" -ne 0 ]; then
    echo "  ✖  FAIL     $g  (${d}s)  ${line}"
    printf '%s\n' "$clean" | grep -E '^\s*✘|FAIL' | tail -3 | sed 's/^/        /'
    fail=1
  else
    echo "  ✔  ok       $g  (${d}s)  ${line}"
  fi
done
echo "── quick.sh: $(( $(date +%s) - t0 ))s total · $( [ $fail -eq 0 ] && echo 'SAB OK' || echo 'KUCH FAIL — upar dekhein' )"
exit $fail
