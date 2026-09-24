#!/usr/bin/env bash
# Haseeb Autos — syntax check
#   .gs  → copied to .js and parsed with node --check
#   .html template script blocks → extracted and parsed
set -e
cd "$(dirname "$0")/.."
TMP=$(mktemp -d)
fail=0

echo "== Apps Script (.gs) =="
for f in apps-script/*.gs; do
  cp "$f" "$TMP/$(basename "$f" .gs).js"
  if ! node --check "$TMP/$(basename "$f" .gs).js" 2>"$TMP/err"; then
    echo "  ✖ $f"; head -12 "$TMP/err"; fail=1
  else
    echo "  ✔ $f"
  fi
done

echo "== Frontend templates (.html) =="
python3 tools/build_demo.py >/dev/null
python3 - "$TMP" <<'PY'
import re, pathlib, subprocess, sys
tmp = pathlib.Path(sys.argv[1])
html = pathlib.Path('demo/index.html').read_text(encoding='utf-8')
blocks = re.findall(r'<script>(.*?)</script>', html, re.S)
bad = 0
for i, b in enumerate(blocks):
    p = tmp / f'block{i}.js'
    p.write_text(b, encoding='utf-8')
    r = subprocess.run(['node', '--check', str(p)], capture_output=True, text=True)
    if r.returncode != 0:
        bad += 1
        print(f"  ✖ script block {i}:")
        print('\n'.join('     ' + l for l in r.stderr.strip().splitlines()[:8]))
print(f"  {'✔' if not bad else '✖'} {len(blocks)} script blocks, {bad} invalid")
sys.exit(1 if bad else 0)
PY
if [ $? -ne 0 ]; then fail=1; fi

echo ""
echo "== Partial files: <style>/<script> leak check =="
node tools/check_partials.py
if [ $? -ne 0 ]; then fail=1; fi

echo ""
echo "== Test harness: login-race lint =="
node tools/check_harness_lint.js
if [ $? -ne 0 ]; then fail=1; fi

exit $fail
