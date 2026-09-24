# release/archive — purane version ke packages

**Policy (2026-09-23 se):** jab bhi naya version ship hota hai, us se pehle wala zip
`release/haseeb-autos-vX.Y.Z.zip` se utha kar yahan `release/archive/` mein rakha jata hai.
Purani zips **khud-ba-khud delete nahi hoti** — "workspace saaf karo" ka matlab ab sirf
logs/probes/temp files hain, **release packages nahi**.

| File | Version | Size | Notes |
|---|---|---|---|
| `haseeb-autos-v2.25.11.zip` | 2.25.11 | 5,744,165 B | shared error/retry policy (7 kinds, errBox, UI.run error path) + 62 gates green |
| `haseeb-autos-v2.25.10.zip` | 2.25.10 | 5,714,253 B | W2.T2 action-level busy: shared UI.run/PWA.run (spinner sirf usi button par, duplicate-submit block, long-op progress, ✓/✖ + okLabel, safety timeout) + fix_chrome_libs — 61 gates green |
| `haseeb-autos-v2.25.9.zip` | 2.25.9 | 5,691,324 B | Shared fetch core (dedupe/TTL cache/invalidation/retry/API.parallel) + App.sessionMeta null-session crash fix + 4 test-flake root causes + _harness/check lint — 60 gates green |
| `haseeb-autos-v2.25.8.zip` | 2.25.8 | 5,673,267 B | Sidebar partial-collapse (icon-only rail) + API instrumentation (14/0) + sidebar-states gate (19/0) — 58 gates green |
| `haseeb-autos-v2.25.7.zip` | 2.25.7 | 5,650,480 B | Labels: 300dpi/203dpi raster decode proof + printable floor 0.19mm (56 gates green) |
| `haseeb-autos-v2.25.6.zip` | 2.25.6 | 5,531,804 B | PWA stale-node/listener-leak + POS scroll-lock fix · gate 55 → 124/0, gate 54 → 91/0 |
| `haseeb-autos-v2.25.5.zip` | 2.25.5 | 5,525,985 B | POS payment-ledger gate 56 (24/0) + demo seed status fix (56 gates green) |
| `haseeb-autos-v2.25.4.zip` | 2.25.4 | 5,514,798 B | POS PWA stacking fix (Esc = top-most) + gate 55 → 118/0 (55 gates green) |
| `haseeb-autos-v2.25.3.zip` | 2.25.3 | 5,510,948 B | PWA overlays close sweep + gate 55 (55 gates green) |
| `haseeb-autos-v2.25.2.zip` | 2.25.2 | 5,502,913 B | root-cause Esc fix + scan-parity gate (54 gates green) |

Retention: kam az kam **pichhle 4 releases**. Isse purane versions (v2.24.x waghera) archive
mein nahi hain — wo is policy se PEHLE delete ho chuke thay (git history bhi nahi hai,
is liye unko reconstruct karna mumkin nahi).
