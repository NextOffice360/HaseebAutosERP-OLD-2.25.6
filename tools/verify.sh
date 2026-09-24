#!/usr/bin/env bash
# Haseeb Autos — FULL VERIFICATION GATE
#
#   bash tools/verify.sh
#
# Chalta hai (sab green hona chahiye):
#   1. check.sh      — Apps Script .gs syntax + HTML <script> blocks
#   2. audit_schema.js — Sheets/DB schema health: undeclared columns (silent
#                        data loss), missing sheets, duplicate columns, Setup
#   3. test_logic.js — backend logic / formulas / calculations (Node sandbox)
#   3a. test_e2e.js  — §20 END-TO-END QA: poora business cycle ek hi chal mein
#                      (shop kholo → PO/GRN → sale cash+udhaar → wasooli →
#                       kharcha → salesman issue/sale/settle → transfer →
#                       din band → report) + invariants (negative stock nahi,
#                       ledger balance, audit trail, serialization)
#   3d. route_audit.js — 265 routes ko ASLI TOR PAR chala kar 3 defects dhoondo:
#                        CRASH / NO_ROUTE / UNTESTED (coverage report)
#   3g. test_settings_ui.js — Settings screen ko ASLI browser (Chromium) mein
#                             render kar ke dekhta hai. Ye pakra: window.DEFS
#                             bug (8 tabs lowercase dikhate thay) — jo 785 unit
#                             tests aur route_audit dono se chhoot gaya tha.
#   3f. test_static.js — dist-static/index.html ko jsdom mein RENDER kar ke
#                        dekhta hai ke static build (Netlify) backend se
#                        JSONP ke zariye baat kar rahi hai ya nahi.
#                        Pehle: python3 tools/build_static.py "<exec URL>"
#   3e. test_routes.js — route_audit ki "untested" list ko realistic payloads se
#                        chalata hai. Yahi woh jagah hai jahan e2e ne 5 bugs
#                        pakde thay — "route maujood hai" != "route chalti hai".
#   3b. check_pwa.js — mobile PWA templates: script-block parse, doGet routing,
#                      app registry, offline queue, manifest, tap targets
#   3c. test_pwa_ui.js — teenon PWA ko JSDOM mein ASLI TARAH boot kar ke check:
#                        tabs render, har tab khaali nahi, undefined/NaN nahi,
#                        scan→cart, offline queue. (Backend tests sirf API
#                        check karte hain — screen par kuch nazar aata hai ya
#                        nahi, sirf render kar ke pata chalta hai.)
#   3. ui_audit.js   — labels, accessibility, empty-content audit (jsdom)
#   4. smoke.js      — har screen/tab/action smoke test (jsdom)
#   5. audit_tabs.js — har screen + har sub-tab + har Settings sub-tab:
#                      content hai, blank block nahi, NaN/undefined nahi
#   6. audit_align.js— modal center / offcanvas right-edge alignment
#   7. verify_punchlist.js — malik ki 16 requirements ka acceptance gate
#   8/9. audit_layout.js  — Chromium: overflow / clipped text / text overlap /
#                           tap-target <32px / WCAG AA contrast / duplicate ids
#                           (desktop 1440×900 + mobile 390×844 + dark theme +
#                            8 overlays/modals — modals alag se napte hain)
#                            + teenon mobile PWA (390×844, light + dark)
#                            (har item ke static + live demo checks, report:
#                             release/punchlist-report.html)
#
# Akhri line: "ALL GATES GREEN" ya "GATE FAILED: <name>"
set -u
cd "$(dirname "$0")/.."

# jsdom chahiye (npm install ek dafa) — agar node_modules missing ho to khud install kar lein
if [ ! -d node_modules/jsdom ]; then
  echo "node_modules missing — npm install chala rahe hain…"
  npm install --no-audit --no-fund >/dev/null 2>&1 || true
fi

GATES=("check:bash tools/check.sh" "schema:node tools/audit_schema.js" "logic:node tools/test_logic.js" "e2e:node tools/test_e2e.js" "routes:node tools/test_routes.js" "route-audit:node tools/route_audit.js" "settings-ui:node tools/test_settings_ui.js" "settings-defs:node tools/audit_settings_defs.js" "ui-polish:node tools/test_ui_polish.js" "typography:node tools/audit_typography.js 1440 900" "charts-edge:node tools/test_charts_edge.js 1440 900" "backend-perf:node tools/test_backend_perf.js" "settings-perf:node tools/test_settings_perf.js" "seed-recovery:node tools/test_seed_recovery.js" "report-dates:node tools/test_report_dates.js" "report-actions:node tools/test_report_actions.js" "cache-warm:node tools/test_cache_warm.js" "qr-thermal:node tools/test_scanner_thermal.js" \
  "pos-multi:node tools/test_pos_multi.js" "raw-writes:node tools/test_raw_writes.js" "metatags:node tools/test_metatags.js" "diagnose:node tools/test_diagnose.js" "ai:node tools/test_ai.js" "ai-hub:node tools/test_ai_hub.js" "ai-load-order:node tools/test_ai_load_order.js" "session:node tools/test_session.js" "cache:node tools/test_cache.js" "scale:node tools/test_scale.js" "icons:node tools/audit_icons.js" "static:node tools/test_static.js" "pwa:node tools/check_pwa.js" "pwa-ui:bash tools/run_pwa_ui.sh" "ui:node tools/ui_audit.js" "smoke:node tools/smoke.js" "tabs:node tools/audit_tabs.js" "align:node tools/audit_align.js" "punch:node tools/verify_punchlist.js" "scan-coverage:node tools/audit_scan_coverage.js" "api-instrument:node tools/test_api_instrument.js" "sidebar-states:node tools/test_sidebar_states.js" "api-core:node tools/test_api_core.js" "session-guard:node tools/test_session_guard.js" "ui-run:node tools/test_ui_run.js" "ui-err:node tools/test_ui_err.js" \
  "perf-batch:node tools/test_perf_batch.js" \
  "dyn-deps:node tools/test_dyn_deps.js")

# ---------------------------------------------------------------------------
# FAST SET — "kya maine kuch tod diya?" ka ~30-second wala jawab.
#
# Ye taqseem andaze se NAHI, NAAP kar banayi gayi hai (har gate `date +%s%N`
# se alag se time kiya gaya, phir verify.sh khud har gate ka waqt batata hai).
# Poori suite 663s (30 gate) — uska sab se dheema hissa browser/puppeteer hai.
#
# Waqt mein SAAF TOOTna hai (natural break):  align 13s  |  settings-ui 8s
#   → upar wale 15 (13s..128s) = SLOW,  neeche wale 15 (0s..8s) = FAST
# Is liye fast set mein koi bhi puppeteer/browser gate shamil nahi.
#
# Naape hue waqt (kul ~29s):
#   settings-ui 8s · pwa-ui 7s · charts-edge 7s · static 3s · check 2s
#   logic 1s · schema/icons/e2e/routes/route-audit/pwa/backend-perf
#   raw-writes/settings-defs = 0s
#
# NOTE: e2e ko pehle ~11s samjha gaya tha (yaad-dasht se) — naapne par 0s nikla.
#       Is liye waqt hamesha NAAPEIN, yaad-dasht par mat jayein.
# ---------------------------------------------------------------------------
FAST_GATES=(check schema logic e2e routes route-audit settings-defs backend-perf
            raw-writes metatags diagnose ai session cache icons static pwa charts-edge pwa-ui settings-ui)

# 8/9. audit_layout.js — ASLI browser (Chromium) mein layout/contrast/tap-target audit.
#      jsdom layout nahi karta, is liye ye optional gate hai (puppeteer ho to hi chalega):
#        npm install puppeteer
#   ROOT KE BAGAIR CHROME: sandbox mein apt-get lock denied hota hai (uid 1000).
#   Is liye .deb files download kar ke `dpkg -x` se SIRF EXTRACT karte hain
#   (install nahi) aur LD_LIBRARY_PATH se Chrome ko wahan dekhate hain.
#   Ek dafa hota hai; phir cache ( /home/user/.chrome-libs, ~14MB ) reuse hota hai.
if [ -d node_modules/puppeteer ]; then
  # NOTE: $HOME har environment mein set nahi hota (cron / background runner) —
  # is liye fallback zaroori hai, warna chrome libs nahi miltin aur layout
  # gates jhoothi failure dete hain.
  MYHOME="${HOME:-$(getent passwd "$(id -u)" 2>/dev/null | cut -d: -f6)}"
  MYHOME="${MYHOME:-/home/user}"
  CHROME_LIBS="${CHROME_LIBS:-$MYHOME/.chrome-libs}"
  CHROME_BIN_FALLBACK="$(ls -1 "$MYHOME"/.cache/puppeteer/chrome/*/chrome-linux64/chrome 2>/dev/null | head -1)"
  if ! (LD_LIBRARY_PATH="$CHROME_LIBS/usr/lib/x86_64-linux-gnu" \
        "${CHROME_BIN_FALLBACK:-$MYHOME/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome}" \
        --version >/dev/null 2>&1); then
    echo "Chrome libraries missing — root ke bagair fetch kar rahe hain (ek dafa)…"
    python3 tools/fetch_chrome_libs.py || true
  fi
  if [ -d "$CHROME_LIBS/usr/lib/x86_64-linux-gnu" ]; then
    # v2.25.9 — snapshot symlinks preserve nahi karta: SONAME links dobara banao
    # (warna har browser gate "error while loading shared libraries: libatk-1.0.so.0").
    python3 tools/fix_chrome_libs.py >/dev/null 2>&1 || true
    export LD_LIBRARY_PATH="$CHROME_LIBS/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
    echo "  (chrome libs: $CHROME_LIBS/usr/lib/x86_64-linux-gnu)"
  fi
  GATES+=("layout-desktop:node tools/audit_layout.js 1440 900")
  GATES+=("layout-mobile:node tools/audit_layout.js 390 844")
  GATES+=("layout-dark:node tools/audit_layout.js 1440 900 --dark")
  GATES+=("layout-overlays:node tools/audit_layout.js 1440 900 --overlays")
  GATES+=("layout-overlays-m:node tools/audit_layout.js 390 844 --overlays")
  # teenon mobile PWA — asli browser, phone ki chaurai (390px), light + dark
  GATES+=("pwa-layout:node tools/audit_layout.js 390 844 --pwa")
  GATES+=("pwa-layout-dark:node tools/audit_layout.js 390 844 --pwa --dark")
  # v2.8.3 — AI config panel: asli browser mein DOM check (Quick setup, content-aware, descriptions)
  GATES+=("ai-ui:node tools/test_ai_ui.js")
  GATES+=("auth-startup:node tools/test_auth_startup.js")
  # v2.25.0 (req 5) — Label designer: TRUE LIVE PREVIEW + 6 presets ka frame-fit
  #   (har control ka asar foran preview par, kuch label frame se bahar nahi, aur
  #    print output bilkul wahi CSS/config — asli Chromium mein naapa jata hai)
  GATES+=("labels-live:node tools/test_labels_live.js")
  # v2.25.0 (req 1+2) — GRN drawer: naya design + PO/scan/bulk workflow
  GATES+=("grn-drawer:node tools/test_grn_drawer.js")
  # v2.25.0 (req 3) — Customer Demands: list/detail/form logic + duplicate guard + F9
  GATES+=("demands:node tools/test_demand.js")
  # v2.25.0 (req 4) — Salesman Stock: health KPIs, filter, scan, Stock Issue (F9)
  GATES+=("salesman-stock:node tools/test_salesman_stock.js")
  # v2.25.2 (req 6) — "cancel/close button kaam nahi karta" ka repo-wide proof
  # v2.25.2 (req 1) — PO/GRN scanning = WAHI POS system ka proof:
  #   shared component identity (.ipk DOM identical) + asli hardware payload
  #   (Found → Added → field CLEAR · duplicate = qty bump · ghalat code = warn)
  GATES+=("scan-parity:node tools/test_scan_parity.js")
  # v2.25.3 (req 6) — mobile PWAs ke overlays ka close/cancel proof (✕ · Esc · Cancel · backdrop)
  #   PWA alag documents hain — desktop gate 54 inko cover nahi karta
  # v2.25.5 — POS payment ledgers: pay modal math + RECORDED sale + poore ledger par
  #   invariants (paid/change/due/status/paymentList) + blocked + udhaar + PWA pay sheet
  GATES+=("pay-ledger:node tools/test_pay_ledger.js")
  # v2.28.0 (W5) — spec §9: field-level visibility backend/API par (sirf CSS nahi)
  #   role → module → field: cost/contact/finance/supplier/notes families, write-guard,
  #   kill-switch, GRN-cost safety, aur UI2.table/form ka rendered-DOM proof
  GATES+=("fields:node tools/test_field_visibility.js")
  # v2.29.0 (W4) — spec §8: global date/time/timestamp system (settings-driven,
  #   timezone-aware, 12/24h, seconds, global showTime/showRecords on-off)
  GATES+=("datetime:node tools/test_datetime.js")
  GATES+=("pwa-shared:node tools/test_pwa_shared.js")
  GATES+=("pwa-overlays:node tools/test_pwa_overlays_close.js")
  GATES+=("modals-close:node tools/test_modals_close.js")
  GATES+=("timeouts:node tools/test_timeouts.js")
else
  echo "  (layout audit skip: npm install puppeteer — real-browser geometry/contrast check)"
fi
FAILED=""

# --- demo server (v2.27.0): pay-ledger aur pwa-shared gates HTTP par chalte hain.
#     Agar 8021 sun nahi raha to khud start karo (aur end par sirf apna hi band karo).
DEMO_STARTED=0
if ! curl -s -o /dev/null --max-time 2 "http://127.0.0.1:8021/index.html"; then
  python3 -m http.server 8021 -d demo --bind 0.0.0.0 >/dev/null 2>&1 &
  DEMO_PID=$!
  DEMO_STARTED=1
  for i in 1 2 3 4 5 6 7 8 9 10; do
    curl -s -o /dev/null --max-time 1 "http://127.0.0.1:8021/index.html" && break
    sleep 1
  done
  echo "  (demo server 8021 par shuru kiya — pid $DEMO_PID)"
else
  echo "  (demo server 8021 pehle se chal raha hai)"
fi

echo ""
echo "=============================================================="
echo " HASEEB AUTOS — FULL VERIFICATION"
echo "=============================================================="

# --- sirf chand gates chalane ka tareeqa (waqt bachane ke liye) -------------
#   bash tools/verify.sh              → sab gates (~11 minute — naapa gaya)
#   bash tools/verify.sh --fast       → sirf tez gates (~39s) ← rozana ke liye
#   bash tools/verify.sh --slow       → sirf browser-wale gates (raat ko)
#   bash tools/verify.sh logic        → sirf 'logic'
#   bash tools/verify.sh logic e2e    → dono
#   bash tools/verify.sh --list       → sab ke naam
#   bash tools/verify.sh --list fast  → tez set ke naam
# Poori suite foreground mein chalane se command hang lagti hai — is liye
# rozana ke kaam ke liye sirf mutalliqua gate chalayein.
WANT=()
FAST_ONLY=0
SLOW_ONLY=0
i=0; ARGS=("$@")
for a in "$@"; do
  case "$a" in
    --list|-l)
      nxt="${ARGS[$((i+1))]:-}"      # set -u safe: --list akela bhi chale
      if [ "$nxt" = "fast" ]; then
        echo "  FAST set (~39s, naapa gaya):"
        for n in "${FAST_GATES[@]}"; do echo "    $n"; done
      elif [ "$nxt" = "slow" ]; then
        echo "  SLOW set (browser/geometry — raat ko chalayein):"
        for g in "${GATES[@]}"; do
          n="${g%%:*}"; hit=0
          for f in "${FAST_GATES[@]}"; do [ "$f" = "$n" ] && hit=1; done
          [ $hit -eq 0 ] && echo "    $n"
        done
      else
        for g in "${GATES[@]}"; do echo "  ${g%%:*}"; done
      fi
      exit 0 ;;
    --fast)  FAST_ONLY=1 ;;
    --slow|--nightly) SLOW_ONLY=1 ;;
    -*) : ;;
    *) WANT+=("$a") ;;
  esac
  i=$((i+1))
done
# --fast / --slow ko WANT mein daal dein (baqi logic waise hi rahe)
if [ $FAST_ONLY -eq 1 ] && [ ${#WANT[@]} -eq 0 ]; then
  WANT=("${FAST_GATES[@]}")
elif [ $SLOW_ONLY -eq 1 ] && [ ${#WANT[@]} -eq 0 ]; then
  for g in "${GATES[@]}"; do
    n="${g%%:*}"; hit=0
    for f in "${FAST_GATES[@]}"; do [ "$f" = "$n" ] && hit=1; done
    [ $hit -eq 0 ] && WANT+=("$n")
  done
fi
keep() {
  [ ${#WANT[@]} -eq 0 ] && return 0
  local w
  for w in "${WANT[@]}"; do
    [ "$w" = "$1" ] && return 0
    case "$1" in "$w"*) return 0 ;; esac   # prefix: 'layout' → layout-desktop, layout-mobile, …
  done
  return 1
}

TIMES=()          # "milliseconds name" — akhir mein sab se dheeme gates dikhayenge
TOTAL_MS=0
RAN=0             # kitne gates ASAL mein chale (false-green rok)
for g in "${GATES[@]}"; do
  name="${g%%:*}"; cmd="${g#*:}"
  keep "$name" || continue
  RAN=$((RAN + 1))
  printf "\n\033[1m▶ %s\033[0m  (%s)\n" "$name" "$cmd"
  t0=$(date +%s%N)
  out=$(eval "$cmd" 2>&1)
  code=$?
  t1=$(date +%s%N)
  ms=$(( (t1 - t0) / 1000000 ))          # nano -> milli
  sec=$(( (ms + 500) / 1000 ))           # round kar ke second
  TIMES+=("$ms $name")
  TOTAL_MS=$((TOTAL_MS + ms))
  echo "$out" | tail -n 6
  if [ $code -ne 0 ]; then
    printf "  \033[31m✖ gate failed: %s\033[0m  \033[2m(%ss)\033[0m\n" "$name" "$sec"
    FAILED="$FAILED $name"
  else
    printf "  \033[32m✔ gate passed: %s\033[0m  \033[2m(%ss)\033[0m\n" "$name" "$sec"
  fi
done

# --- waqt ka khulasa: sab se dheeme gates pehle (fast-set tune karne ke liye) ---
if [ ${#TIMES[@]} -gt 0 ]; then
  echo ""
  echo "--- waqt (sab se dheema pehle) -----------------------------------------"
  printf '%s\n' "${TIMES[@]}" | sort -rn | while read -r ms n; do
    printf "  %5ss  %s\n" "$(( (ms + 500) / 1000 ))" "$n"
  done
  echo "  ----------------------------------------------------------------------"
  printf "  %5ss  KUL (%s gate)\n" "$(( (TOTAL_MS + 500) / 1000 ))" "${#TIMES[@]}"
  echo "  (ye waqt isi machine ke hain; --fast set isi tarah tune kiya gaya tha)"
fi

echo ""
echo "=============================================================="
if [ "$RAN" -eq 0 ]; then
  printf " \033[31m✖ 0 gates match: %s\033[0m\n" "${WANT[*]}"
  echo "   available: bash tools/verify.sh --list"
  echo "=============================================================="
  exit 2
fi
if [ -n "$FAILED" ]; then
  echo " GATE FAILED:$FAILED"
  echo "=============================================================="
  exit 1
fi
echo " ALL GATES GREEN ✔  (${RAN} gate: ${WANT[*]:-full suite})"
echo "=============================================================="
if [ "${DEMO_STARTED:-0}" = "1" ] && [ -n "${DEMO_PID:-}" ]; then
  kill "$DEMO_PID" 2>/dev/null
fi
exit 0
