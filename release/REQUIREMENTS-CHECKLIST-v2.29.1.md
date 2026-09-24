# REQUIREMENTS CHECKLIST — v2.29.1 (2026-09-24)

Base: v2.29.0 · Is build ka scope: **W6.T3 sidebar responsive matrix** + `verify.sh` false-green fix.

## Is build ke requirements

| # | Requirement (aap ka spec) | Status | Saboot |
|---|---|---|---|
| 1 | Sidebar responsive — desktop / laptop / tablet / small (req 13) | **✔ mukammal** | gate `sidebar-states` T6.3 block: 1440/1280/1024/768/390 × light+dark — mode + 0 overflow |
| 2 | 1440/1280/1024/768/390 par **0 layout problems** | **✔** | `verify.sh layout` 5/5 green (189s) + matrix asserts |
| 3 | **Tap targets ≥48px** | **✔** | nav-item 48 · `.sb-user` 48 · ⇤ 48×48 · ☰ 48×48 · mobile dense icons 48px HIT area |
| 4 | **Text ≥10.8px** | **✔** | sidebar min font ab **10.8px** (pehle 10.2/10.5) — gate assert |
| 5 | Laptop (1024px) par collapse mumkin ho | **✔ (naya fix)** | ⇤ button breakpoint 1024 → 900; gate: `T6.3 1024: ⇤ available` |
| 6 | Rail = sirf icons, hover par bhi (purana bug wapas na aaye) | **✔** | T6.1 asserts barqarar (rail@1280/1024 icons-only) |
| 7 | Off-canvas desktop pref se conflict na kare (req 14) | **✔** | T6.1 mobile asserts barqarar |
| 8 | State persistence (reload / route / resize) | **✔** | T6.1 asserts barqarar |
| 9 | Verification khud jhoot na bole (false-green) | **✔ (naya fix)** | `verify.sh` prefix-match + 0-gate guard (exit 2) |

## Pehle ke shipped (regression na hone ka saboot)

| Wave | Version | Gate |
|---|---|---|
| W0/W1 instrumentation | v2.25.8 | full suite |
| W2 shared fetch/busy | v2.25.9 | full suite |
| W3 dynamic deps | v2.26.0 | full suite |
| W6.T1/T2/T4 sidebar rail + off-canvas | v2.25.8+ | `sidebar-states` |
| W5 field visibility | v2.28.0 | `fields` 52/0 |
| W4 date/time/timestamp | v2.29.0 | `datetime` 44/0 |
| **W6.T3 responsive matrix** | **v2.29.1** | **`sidebar-states` 52/0** |

## Full suite (is build par)
`env -u HOME bash tools/verify.sh` → `tmp/verify291.log` — nateeja neeche wali tafseel mein (ALL GREEN par hi release).

## Baqi (aage ke waves)
W7 (busy/table/forms/settings apply) · W8 (verify + release) · W9/W13 · W10 · W11/W12 —
TODO-PERF-SHARED-UI.md dekhein. Carry-overs: Zx10 printer drill, label read-back, live GAS+Drive deploy, mobile POS cart→Pay→Esc.
