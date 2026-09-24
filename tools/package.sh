#!/usr/bin/env bash
# Haseeb Autos — bundle banata hai (zip) jo aap kisi ko bhi bhej sakein / backup
set -e
cd "$(dirname "$0")/.."
# NOTE (v2.25.3 se): naya version banane se pehle purana zip release/archive/ mein
#       rakhein — purani releases DELETE na karein (release/archive/README.md dekhein).
VER=${1:-2.23.15}
OUT="release/haseeb-autos-v${VER}.zip"
mkdir -p release dist

python3 tools/build_demo.py >/dev/null
# v2.8: also rebuild production static (real backend via JSONP) so release has deploy-ready folder
python3 tools/build_static.py >/dev/null 2>&1 || echo "  (static build skip: no API URL — set static-config.json apiUrl or env API_URL)"
python3 tools/build_pdf.py 2>/dev/null || echo "  (PDF guide skip: pip install weasyprint markdown)"

rm -f "$OUT"
zip -qr "$OUT" \
  apps-script \
  demo \
  dist-static \
  static-config.json \
  pwa/qr-scanner \
  tools \
  README.md RESUME-HERE.md DEPLOYMENT.md OPEN-WEBAPP.html clasp.template.json .claspignore APPS_SCRIPT_DEPLOY_GUIDE.md APPLICATION-WIDE-SPEC.md MASTER-REQUIREMENTS.md TODO-PERF-SHARED-UI.md specs FEATURES_V22_GUIDE.md FEATURES_V23_GUIDE.md FEATURES_V25_GUIDE.md \
  release/Haseeb-Autos-Guide.pdf \
  release/FIRST-SETUP-GUIDE.html release/CLASP-DIRECT-PUSH-GUIDE.html release/CHANGELOG-*.md release/RELEASE-VERIFICATION-*.md release/SPEED-ANALYSIS-*.md release/QR-LIVE-CAMERA-GUIDE.md release/ENHANCEMENT-PLAN-v2.6.md release/CLASP-GUIDE-WINDOWS.md release/CLASP-GUIDE-WINDOWS.html release/STATIC-HOSTING-GUIDE.html release/CLASP-STATIC-COMPLETE-GUIDE.html release/PWA-URLS-GUIDE.md release/SECURITY-AUDIT-*.md release/app-audit.html release/punchlist-report.html release/product-import-report.html \
  release/REQUIREMENTS-CHECKLIST-*.md release/AUDIT-EVIDENCE-*.html release/shots-v* \
  release/invoice-sample-a4.html release/invoice-sample-thermal.html \
  release/day-report-sample.html release/cashbook-sample.html \
  -x "*.DS_Store" "*/__pycache__/*" "*/node_modules/*"

echo "✔ $OUT  ($(du -h "$OUT" | cut -f1))"
echo "  Is zip mein hai:"
echo "   • apps-script/  — clasp-ready source (GAS backend)"
echo "   • demo/index.html — self-contained PREVIEW (mock data, offline demo)"
echo "   • dist-static/  — PRODUCTION static build (real backend via JSONP) → drag-drop to Netlify / GH Pages / self-hosted"
echo "   • static-config.json — production API URL (edit post-deploy, no rebuild needed if using Settings → Backend & Integrations)"
echo "   • README.md / DEPLOYMENT.md / PDF guide"
echo "   • release/FIRST-SETUP-GUIDE.html — PEHLE ye padhein (kaun si file, kaunsa function)"
echo "   • tools/ - build, tests, audit (tabs/align), CSV product importer"
echo "   • release/STATIC-HOSTING-GUIDE.html — static prod deploy guide"
echo "   • release/product-import-report.html - kya import hua, kya faisla baqi hai"
echo "   • clearly separated: demo (preview) vs dist-static (prod) vs config (static-config.json + Settings) vs docs (release/)"
