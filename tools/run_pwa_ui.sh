#!/usr/bin/env bash
# PWA UI gate — demo pages build kar ke JSDOM mein render test chalao
set -e
cd "$(dirname "$0")/.."
python3 tools/build_pwa_demo.py
node tools/test_pwa_ui.js
