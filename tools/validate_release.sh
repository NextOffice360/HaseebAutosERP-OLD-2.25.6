#!/usr/bin/env bash
# ============================================================================
# tools/validate_release.sh — v2.30.0 PRE-PACKAGE VALIDATION CHECKLIST
# ----------------------------------------------------------------------------
# User ki shart (release-hardening message):
#   "Pre-package validation checklist: fresh setup → seed → login → shop open →
#    customer → product/items → inventory → sale → shop close → reports →
#    settings → demo-data visibility."
#
# Ye script wahi checklist chalta hai — ASLI backend logic (mock Apps Script
# runtime) + ASLI rendered DOM (puppeteer) par. Har qadam ka nateeja alag
# dikhta hai; kuch red ho to ZIP banane se PEHLE pata chal jata hai.
#
#   bash tools/validate_release.sh            # poora checklist (~4 min)
#   bash tools/validate_release.sh --fast     # DOM gates skip (sirf logic, ~30s)
#
# NOTE: har step ka exit code check hota hai — koi blind retry nahi. Fail ho to
# us step ka log khol kar wajah dekhein, phir dobara chalayein.
# ============================================================================
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
FAST=0
[ "${1:-}" = "--fast" ] && FAST=1

PASS=0; FAIL=0; SKIP=0
RESULTS=()
step() {                       # step "<naam>" <command...>
  local name="$1"; shift
  printf '\n\033[1m▶ %s\033[0m\n' "$name"
  local log="tmp/validate-$(echo "$name" | tr ' /' '__').log"
  mkdir -p tmp
  if "$@" >"$log" 2>&1; then
    local line; line="$(grep -E 'PASS:|FAIL:|SEED RECOVERY|SUITE|✔ [0-9]+ script blocks' "$log" | tail -1)"
    printf '  \033[32m✔ PASS\033[0m  %s\n' "${line:-ok}"
    PASS=$((PASS+1)); RESULTS+=("PASS  $name  ${line:-}")
  else
    printf '  \033[31m✘ FAIL\033[0m  log: %s\n' "$log"
    tail -20 "$log" | sed 's/^/      /'
    FAIL=$((FAIL+1)); RESULTS+=("FAIL  $name  log: $log")
  fi
}
skip() { printf '\n\033[2m⏭ %s (skipped: %s)\033[0m\n' "$1" "$2"; SKIP=$((SKIP+1)); RESULTS+=("SKIP  $1  $2"); }

echo "═══════════════════════════════════════════════════════════════"
echo "  HASEEB AUTOS ERP — PRE-PACKAGE VALIDATION  ($(date '+%Y-%m-%d %H:%M'))"
echo "═══════════════════════════════════════════════════════════════"

# ---------------------------------------------------------------- 0. syntax
step "0. syntax + script blocks" bash tools/check.sh

# ------------------------------------------- 1..12 poora fresh-install flow
#  setup → seed → login → shop open → customer/items → inventory → sale →
#  shop close → reports → settings → demo visibility → demo removal
step "1. fresh-install flow (setup→seed→login→shop→sale→reports→settings→demo)" \
  node tools/test_release_flow.js

# ------------------------------------------------ seed recovery / live DB rules
step "2. seed recovery (live DB par demo data nahi ghusata)" node tools/test_seed_recovery.js

if [ "$FAST" = "1" ]; then
  skip "3. UI states + shop banner + wizard (rendered DOM)" "--fast"
  skip "4. busy/duplicate-submit coverage (rendered DOM)" "--fast"
  skip "5. sidebar states (rendered DOM)" "--fast"
  skip "6. modal layout audit (wide desktop / no h-scroll / no clip)" "--fast"
  skip "7. settings icons audit (23 areas · source + runtime parity)" "--fast"
  skip "8. settings icons rendered DOM (55 tabs · SVG · tint · light+dark)" "--fast"
  skip "9. inventory: All inventory + Stock levels (catalog vs stock)" "--fast"
  skip "10. supplier auto-populate + legacy form dirty tracking" "--fast"
  skip "11. partial-save deep audit (partial updates + refresh + DOM)" "--fast"
  skip "12. app-wide SAVE ALL (header button + Retry + nav guard)" "--fast"
  skip "13. AI naming honesty (Local Data Assistant, capability card, no Mock)" "--fast"
  skip "14. notification service (dedupe, sticky+Retry, progress, settings)" "--fast"
  skip "15. offline sync (idempotent replay, partial fail, chip, auto-flush)" "--fast"
  skip "16. data-aware UI (depOn, invalid-child clear, showWhen, validate)" "--fast"
  skip "17. math/logic audit (exact totals, costing, returns net, FE-BE parity)" "--fast"
  skip "18. E2E critical journey (fresh DB to close shop, POS, points, udhaar, reports, sync, DOM)" "--fast"
  skip "19. shared form validation (UI2.validate: highlight+focus+aria, 6 forms)" "--fast"
  skip "20. settings consume shared (showWhen deps + DT live preview)" "--fast"
  skip "21. shared table states (load: skeleton+error+Retry, onLoad, reload)" "--fast"
else
  export LD_LIBRARY_PATH="${LD_LIBRARY_PATH:-/home/user/.cache/chrome-libs/usr/lib/x86_64-linux-gnu}"
  # blank-page error/empty states, shop banner, SHOP_CLOSED gate, setup wizard
  step "3. UI states + shop banner + wizard (rendered DOM)" node tools/test_release_ui.js
  step "4. busy/duplicate-submit coverage (rendered DOM)" node tools/test_busy_coverage.js
  step "5. sidebar states (rendered DOM)" node tools/test_sidebar_states.js
  # N5 — har modal: wide desktop, no h-scroll, no clip, head/foot accessible, mobile fits
  step "6. modal layout audit (wide desktop / no h-scroll / no clip)" node tools/audit_modals_layout.js --assert
  # N6 — settings icons: source + Config.defs() runtime parity, phir asli rendered DOM
  step "7. settings icons audit (23 areas · source + runtime parity)" node tools/audit_settings_icons.js --assert
  step "8. settings icons rendered DOM (55 tabs · SVG · tint · light+dark)" node tools/test_settings_icons.js
  # N10 — All Inventory (catalog 0-stock par bhi) + Stock levels purana view
  step "9. inventory: All inventory + Stock levels (catalog vs stock)" node tools/test_inventory_all.js
  # N10 — supplier info auto-populate (GRN + PO), data-aware + dirty tracking
  step "10. supplier auto-populate + legacy form dirty tracking" node tools/test_supplier_autofill.js
  # N1/N2 deep audit — partial save: har field type, har save endpoint (aur DOM proof)
  step "11. partial-save deep audit (partial updates + refresh + DOM)" node tools/test_partial_save.js
  # N2 — app-wide SAVE ALL: header button, page bridge, stash, fail→Retry, dup-block, nav guard
  step "12. app-wide SAVE ALL (header button + Retry + nav guard)" node tools/test_saveall_pages.js
  # N7 — AI naming/honesty: "MOCK" ka asli naam Local Data Assistant, LLM ka dawa nahi
  step "13. AI naming honesty (Local Data Assistant, capability card, no Mock)" node tools/test_ai_naming.js
  # N8 — notification service: dedupe/sticky/retry/progress/settings (rendered DOM)
  step "14. notification service (dedupe, sticky+Retry, progress, settings)" node tools/test_notifications.js
  # N9 — offline/background sync: idempotency ledger, partial-fail requeue, chip, auto-flush
  step "15. offline sync (idempotent replay, partial fail, chip, auto-flush)" node tools/test_offline_sync.js
  # N10 — data-aware UI: dependent options, invalid-child clear, showWhen, validate-before-save
  step "16. data-aware UI (depOn, invalid-child clear, showWhen, validate)" node tools/test_data_aware.js
  # N11 — math/logic: authoritative-source exact math + regression (returns/discount/tax/costing/parity)
  step "17. math/logic audit (exact totals, costing, returns net, FE-BE parity)" node tools/test_math_logic.js
  # N12 — final E2E: fresh DB → open shop → sale/points/udhaar → reports → close → offline sync → DOM journey
  step "18. E2E critical journey (fresh DB to close shop, POS, points, udhaar, reports, sync, DOM)" node tools/test_e2e_critical.js
  # T7.3 — shared form validation: ek engine, highlight + focus + aria, msgs barqarar
  step "19. shared form validation (UI2.validate: highlight+focus+aria, 6 forms)" node tools/test_forms_shared.js
  # T7.4 — settings shared systems: declarative showWhen + datetime live preview (DT.format)
  step "20. settings consume shared (showWhen deps + DT live preview)" node tools/test_settings_shared.js
  # T7.2/W9 — shared table states: skeleton (delayed), error+Retry, onLoad, reload
  step "21. shared table states (load: skeleton+error+Retry, onLoad, reload)" node tools/test_table_states.js
  # W9 — Madad/help links + shared PWA.confirm + tooltip sweep
  step "22. W9 help links + confirm sweep + tooltips (UI2.help, PWA.confirm)" node tools/test_w9_help.js
  # W13/T13.1 — B§8 conversion units: GRN direct lines BOX↔PCS auto-calc (PO v2.9 §8 parity)
  step "23. W13 B§8 conversion units (GRN pack auto-calc, backend base invariant)" node tools/test_w13_modules.js
  # W10.T2 — roles × API enforcement matrix (real Auth.gs: cashier deny, owner allow)
  step "24. W10 roles matrix (backend-enforced deny/allow + nav filter)" node tools/test_roles_matrix.js
fi

echo
echo "═══════════════════════════════════════════════════════════════"
printf '  VALIDATION   PASS: %d   FAIL: %d   SKIP: %d\n' "$PASS" "$FAIL" "$SKIP"
for r in "${RESULTS[@]}"; do echo "   $r"; done
echo "═══════════════════════════════════════════════════════════════"
if [ "$FAIL" -gt 0 ]; then
  echo "  ❌ Checklist RED — ZIP banane se pehle upar wale fail theek karein."
  exit 1
fi
echo "  ✅ Checklist GREEN — ab packaging safe hai (bash tools/package.sh)."
