# ⑥ Testing — gates aur validate_release

Har release se pehle **ek hi checklist** chalti hai — `tools/validate_release.sh` (18 steps).
Ye sirf "page khulta hai" nahi dekhta — **backend exact-math** (paisa ke sawal) aur
**rendered-DOM** (jo dikh raha hai wahi assert) dono check karta hai.

## Chalana
```bash
# quick (backend + syntax, DOM gates skip):
bash tools/validate_release.sh --fast

# poora (release ke waqt — ek foreground call):
export LD_LIBRARY_PATH=/home/user/.cache/chrome-libs/usr/lib/x86_64-linux-gnu
bash tools/validate_release.sh
```

## 18 steps kya hain
| # | Gate | Cover |
|---|------|-------|
| 1–2 | syntax + script blocks | har .gs parse hota hai |
| 3 | release_ui | blank-page/error/empty states, SHOP_CLOSED banner, wizard |
| 4 | busy_coverage | har action: idle→loading→success/error→retry, dup-submit block |
| 5 | seed_recovery | fresh setup + resume (adhoora setup dobara chalao) |
| 6 | report_actions | reports ke export/share/print |
| 7–8 | icons static+DOM | consistent icons (SVG, tint, duplicate keys) |
| 9 | partial_save | partial update safe (koi field false/empty replace nahi) |
| 10 | supplier_autofill | GRN par supplier ka pichhla rate khud aata hai |
| 11 | inventory_all | All-Inventory tab, catalog vs stock, transfers |
| 12 | saveall_pages | header Save All: dirty detect, failed-retry, dup-block |
| 13 | ai_naming | "Local Data Assistant" (koi LLM/MOCK ka jhoota dawa nahi) |
| 14 | notifications | toast dedupe/merge/cap, settings |
| 15 | offline_sync | idempotent replay, partial-fail requeue, chip, auto-flush |
| 16 | data_aware | dependent dropdowns, invalid-child clear, showWhen |
| 17 | **math_logic** | exact totals/tax/discount/change, AVG costing, loyalty, returns NET profit, net-refund, commission proportion, numbering, expectedCash |
| 18 | **e2e_critical** | poora safar: fresh DB → login → open → customer → GRN → sale → points → udhaar → payment → reports → close (variance 0) → band-dukan block → settings → offline sync | DOM: dashboard, 9 screens, Save All, zero errors |

## Naya fix ka usool (standing rule)
Reproduce → **SHARED** fix (root cause) → regression test isi gate me add → sab gates GREEN.
"Fixed" ka dawa sirf gate ke saboot par.
