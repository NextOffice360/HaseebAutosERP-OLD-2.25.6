# Haseeb Autos — v2.29.0 CHANGELOG

**Date:** 2026-09-24 · **Version:** `2.29.0` (Utils.gs ▸ `AppConfig.VERSION`)
**Base:** v2.28.0 (W5 field visibility) → is build mein **W4: GLOBAL DATE / TIME / TIMESTAMP SYSTEM** (spec §8 + §18 priority #6).

**Full verification:** `env -u HOME bash tools/verify.sh` → dekhne ke liye `tmp/verify290.log` · naya gate **`datetime` (44/0)** · `check.sh` ab **82 tools**.

---

## 1 ▸ Aap ki shikayat (spec §8 ke lafz)
> *"I also noticed that the application currently displays dates in many places, but the time component/timestamp is missing…
> required: created date, created time, updated date, updated time, full timestamp… **configurable rather than hard-coded**
> — date only / time only / date + time / full timestamp · 12-hour/24-hour · seconds on/off · timezone handling ·
> configurable display format · configurable visibility · global on/off."*

## 2 ▸ AUDIT pehle (`tools/audit_datetime.js` → `tmp/datetime-audit.json`)

| Cheez | Nateeja |
|---|---|
| Backend | `U.iso()` **153** calls · raw `toISOString()` 7 · timezone refs 8 |
| Frontend | `fmt.date()` **92** calls · `getHours/getMinutes` 4 · `toLocale*` 16 · manual `.slice(0,10/16)` **36** |
| Settings | date/time display ke liye **sirf 2** cheezein (timezone, job.timezone) — format/12h/seconds/visibility **kuch bhi configurable nahi** (6 keys gayab) |
| Records | "Created" label sirf 3 jagah · "Updated" 2 · `fmt.date(x, true)` 22 sites |
| **Consistency bug** | Backend `U.iso()` seconds likhta hai (`10:42:31`) magar frontend dikhata hai **bina seconds** (`10:42`), aur format hard-coded `YYYY-MM-DD HH:mm` — yani **ek hi record do jagah do shakal mein**, aur settings se kuch badalna mumkin nahi |

## 3 ▸ FIX — ek hi reusable system (settings-driven)

**Settings (naye, Settings ▸ Localization ▸ ③ Tareekh & waqt):**
| Key | Kya karta hai |
|---|---|
| `dt.format` | `date` / `time` / `datetime` / `stamp` (poora timestamp) |
| `dt.dateStyle` | `DD MMM YYYY` (default, spec example) · `YYYY-MM-DD` · `DD/MM/YYYY` · `MM/DD/YYYY` |
| `dt.hour12` | 12-ghante (am/pm) ya 24-ghante |
| `dt.seconds` | seconds on/off |
| `dt.showTime` | **global on/off** — off karne par poore app mein sirf tareekh |
| `dt.showRecords` | records par Created/Updated line dikhe ya na dikhe |
| `timezone` | Asia/Karachi (pehle se) — ab display formatter bhi isi ko maanta hai |

**Backend (`Utils.gs`):** `U.dtConfig()` · `U._parts(value, tz)` (Intl se asli tz conversion) · `U._MON/_pad` ·
**`U.disp(value, mode)`** (shared formatter) · **`U.stamp(rec)`** → `{created:'23 Sep 2026, 10:42:31', updated:…}` ·
naya route **`system.dtconfig`**.

**Frontend (`App_Core.html`):** naya **`DT`** layer — `DT.cfg()` (wahi settings) · `DT.format(v, mode)` ·
`DT.stampLine(rec)` — aur **`fmt.date()`/`fmt.time()` usi par delegate** kar diye, is liye poore app ke **92 call-sites
apne aap naye system par** aa gaye (koi page-specific patch nahi). `fmt.dt(v)` poora timestamp deta hai.

**Adoption (records par timestamps):** naya shared **`UI2.stampRow(rec)`** — Items detail, Customer/Supplier detail,
GRN detail (uske meta mein date ab **date + waqt**), aur `[data-dt-stamp]` mark (probe-able).

## 4 ▸ Storage ka usool (data integrity — proof ke sath)
Pehle se ek usool tha jo hamesha barkarar rahega: **stored `U.iso()` values local wall-clock strings hain, UTC instants nahi.**
Is liye display par:
- stored string (`2026-09-23T10:42:31`) **tz se shift nahi hota** — jo likha gaya wahi dikhta hai
- magar **asli instant** (`new Date()`) configured timezone mein convert hota hai (Asia/Karachi par 05:42 UTC → 10:42 PKT) — gate B isi ka proof hai.

## 5 ▸ Naya gate `tools/test_datetime.js` — **44/0**
- **A** har setting ka asar (seconds · 12h (am/pm, 12:05 pm, 12:05 am) · dateStyle ×3 · format=date · explicit stamp)
- **A2** **global visibility**: showTime off → datetime, stamp, time sab par sirf tareekh
- **B** timezone: same instant UTC vs Asia/Karachi · **stored string shift nahi hota** (integrity)
- **B2** `U.stamp()` created+updated (spec example jaisa) · showRecords off → ijazat nahi
- **C** **frontend ↔ backend parity**: 5 configs × 4 values × 5 modes = 100 combinations, har ek par output bilkul barabar
- **C2** `fmt.date` delegation (purane call-sites)
- **D** **rendered DOM**: "Created: 23 Sep 2026, 10:42:31" + "Updated: …" · showRecords off → kuch render nahi · showTime off → DOM mein waqt nahi (negative proof)
- **E** settings/route contracts · **F** zero page errors

## 6 ▸ Rollback
`release/archive/` mein pichhle packages. Rollback = archive zip extract + `clasp push`. Koi schema/data change nahi
(sirf naye settings keys — purane build par wo na hone se behaviour bilkul v2.28.0 jaisa rehta hai).
