# REQUIREMENTS CHECKLIST — v2.29.2 (2026-09-24)

Base: v2.29.1 · Is build ka scope: **W7.T1 — busy coverage (poore app par busy state + duplicate-submit guard)**.

## Is build ke requirements

| # | Requirement (aap ka spec) | Status | Saboot |
|---|---|---|---|
| 1 | Har action par **action-specific loading** (busy dikhe) | **✔** | auto-busy engine + gate `busy-coverage` (A/B) |
| 2 | **Duplicate submits block** | **✔** | gate C: busy ke doran extra clicks se API call 1 hi rahi |
| 3 | **Root cause pehle, phir shared-level fix** (per-page patch nahi) | **✔** | audit: 78 sites mille → ek SHARED engine (`App_Core.html`), 0 page-specific patches |
| 4 | Dono handler attachment tareeqay cover | **✔** | `h()`/addEventListener path (A) + property path (B) |
| 5 | Sync actions par bina wajah wait na ho | **✔** | sirf Promise-returning handlers par busy (design + gate E samples) |
| 6 | Busy state **safe** ho (phansa na rahe) | **✔** | safety 120s + min-busy 320ms + kill-switch + `data-nobusy` |
| 7 | Mojooda `UI.run` behaviour na tootay | **✔** | engine skip (G) + regression gates `ui-run`/`ui-err`/`smoke` green |
| 8 | Har dawa ka rendered-DOM saboot | **✔** | gate 13 asserts asli browser mein; real-screen sweep bhi |

## Pehle ke shipped (regression na hone ka saboot)

| Wave | Version | Gate |
|---|---|---|
| W4 date/time/timestamp | v2.29.0 | `datetime` 44/0 |
| W6.T3 sidebar responsive matrix | v2.29.1 | `sidebar-states` 52/0 |
| **W7.T1 busy coverage** | **v2.29.2** | **`busy-coverage` 13/0** |
| W5 field visibility | v2.28.0 | `fields` 52/0 |

## Full suite (is build par)
`env -u HOME bash tools/verify.sh` → `tmp/verify292.log` — nateeja neeche wali tafseel mein (ALL GREEN par hi release).

## Baqi (aage ke waves)
W7.T2 (table states: skeleton/empty/store-change) · W7.T3 (shared forms validation) · W7.T4 (settings consume shared) ·
W8 (verify + release) · W9/W13 (deps/UX) · W10 (testing matrix) · W11/W12.
Carry-overs: Zx10 printer drill, label read-back, live GAS+Drive deploy, deployed F2, mobile POS cart→Pay→Esc.
