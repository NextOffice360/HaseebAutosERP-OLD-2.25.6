# Requirement Checklist — v2.29.0 (W4: Global Date / Time / Timestamp System)

**Date:** 2026-09-24 · **Version:** 2.29.0 · **Suite:** `env -u HOME bash tools/verify.sh` → **67 GATES** (log `tmp/verify290.log`)
**Naya gate:** `datetime` **44/0** · **Audit evidence:** `tmp/datetime-audit.json` (`tools/audit_datetime.js`)

Legend: **✅ mukammal (gate + rendered proof)** · **🟡 by design / note** · **⬜ user-side check (deployed backend)**

---

## A. Spec §8 — "Global Date & Timestamp System"

| Requirement | Status | Evidence |
|---|---|---|
| Reusable global date/time system | ✅ | `U.disp/U.stamp/dtConfig` (backend) + `DT.format/DT.stampLine` (frontend) + `UI2.stampRow` — ek policy, sab jagah |
| Records: **created date + created time** | ✅ | `U.stamp()` / `DT.stampLine()` → "Created: 23 Sep 2026, 10:42:31" (rendered DOM proof) |
| Records: **updated date + updated time** | ✅ | same (updated ≠ created par alag line) |
| **Full timestamp** | ✅ | `mode: 'stamp'` — hamesha seconds ke sath (spec example jaisa) |
| "Other relevant event timestamps" | ✅ | GRN detail ka Date ab date + waqt; stampRow har detail view mein daal sakte hain (shared) |
| Display format **configurable, hard-coded nahi** | ✅ | `dt.format` + `dt.dateStyle` (4 styles) — gate A har setting ka asar dikhata hai |
| **Date only** | ✅ | `dt.format=date` (ya per-call `mode:'date'`) |
| **Time only** | ✅ | `mode:'time'` |
| **Date + time** | ✅ | default `datetime` |
| **Full timestamp** | ✅ | `stamp` |
| **12-hour / 24-hour** | ✅ | `dt.hour12` — gate: 10:42 am · 12:05 pm · 12:05 am (midnight/noon edge cases) |
| **Seconds on/off** | ✅ | `dt.seconds` (aur stamp mode hamesha seconds) |
| **Timezone handling** | ✅ | `timezone` (default Asia/Karachi) — asli instant tz-convert hota hai; stored wall-clock strings shift nahi hote |
| **Configurable visibility** | ✅ | `dt.showTime` (global on/off) · `dt.showRecords` (Created/Updated line) |
| Global on/off option | ✅ | showTime off → datetime/stamp/time sab par sirf tareekh (gate A2 + rendered negative proof) |
| **Same system throughout the application** | ✅ | `fmt.date()` (92 call-sites) + `fmt.time()` DT par delegate — koi page-specific formatter nahi; FE↔BE parity 100 combinations par barabar |

## B. Spec §18 (priority #6) + §2 (state persistence)
| # | Kaam | Status |
|---|---|---|
| 1–5 | audit · root cause · perf · data-aware UI · field visibility | ✅ v2.25–v2.28 |
| **6** | **Global date/time/timestamp system** | ✅ **is build mein** |
| 7 | Sidebar/responsive navigation | ⏳ agli wave (W6) |
| §2 | Saved records turant reflect hon | ✅ (kuch nahi badla; timestamps ab sahi format mein save→display tak) |

## C. Standing user constraints
| Constraint | Status | Evidence |
|---|---|---|
| Audit-first | ✅ | `tools/audit_datetime.js` + `tmp/datetime-audit.json` (153·92·36 sites, 6 missing keys, consistency bug) |
| Shared level par fix, phir app-wide | ✅ | Settings → `U.*` + `DT` → `fmt.*` delegation → phir detail views |
| No false "fixed" claims | ✅ | Gate 44/0 (unit + parity + **rendered DOM** + negative proofs) |
| Feature na hatao | ✅ | `logic` 816/0 · `e2e` 55/0 · `smoke` 332/0 · `tabs` 656/0 · `settings-ui` 16/0 · `fields` 52/0 · `pay-ledger` 48/0 · `modals-close` 91/0 |
| Layout 0 problems @390/1440 (light/dark) | ✅ | layout audit: 19/19 screens · 0 problems (dono viewports) |
| Beginner-friendly docs · rollback | ✅ | CHANGELOG §6 rollback + settings labels Urdu-friendly hints ke sath |

## D. Baqi (aage ke waves — A§18 order)
**W6** sidebar (expanded → partially collapsed → mobile off-canvas) · **W9/W13** help/tooltips/docs links · **W10** testing matrix · **W11/W12** documentation pack.
