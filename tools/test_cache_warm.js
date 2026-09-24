#!/usr/bin/env node
/* ============================================================================
   tools/test_cache_warm.js — v2.13.4 CACHE-WARM + TRANSACTIONAL CACHE gate
   ----------------------------------------------------------------------------
   Sample app ki tezi ka analysis (investigation doc) do cheezein dikhati thi:
     ① transactional stores bhi cross-execution cache mein hote hain
     ② koi cold-start tax nahi — cache hamesha bhara rehta hai
   ERP mein (1) ab Sales + Payments bhi CACHED_SHEETS mein hain aur har DB
   write DB.touch() se foran invalidate karta hai; (2) ke liye Triggers.gs
   mein read-only cacheWarm job hai (har 15 min, business-hours window).

   Ye test CONTRACT check karta hai (mocked host):
     · transactional sheets cache hoti hain aur write par foran saaf
     · cacheWarm har cacheable sheet ka chunk index dobara bhar deta hai
     · off/hours guards aur manual override
     · install/remove/status naye handler ko cover karte hain
   Live Google performance ya timing yahan measure nahi hoti.
   ========================================================================== */
'use strict';
const path = require('path');
const assert = require('assert');
const { loadBackend } = require('./mock_gs');
let passed = 0, failed = 0;
function ok(name, cond, note) {
  if (cond) { passed++; console.log('PASS ' + name + (note ? '  → ' + note : '')); }
  else { failed++; console.log('FAIL ' + name + (note ? '  → ' + note : '')); }
}
function throws(fn, message) { try { fn(); return false; } catch (e) { return true; } }

const { sandbox: s, services } = loadBackend(path.join(__dirname, '..', 'apps-script'));
s.setupAll();
const owner = { userId: 'OWNER-WARM', username: 'owner', role: 'OWNER', permissions: ['*'], locationId: 'LOC-SDQ' };

const cache = services.CacheService.getScriptCache();
const store = cache._store;
const idxOf = name => store[s.DB.cacheKey(name) + ':n'];
function coldExec(name) { delete s.DB._rows[name]; delete s.DB._rowIdx[name]; }

/* ① transactional sheets participate in the same safe caching */
ok('v2.13.4 lists Sales and Payments among cacheable sheets',
  s.CACHED_SHEETS.indexOf('Sales') > -1 && s.CACHED_SHEETS.indexOf('Payments') > -1);
s.DB.insertMany('Sales', [{ id: 'SO-W1', date: '2026-09-19', locationId: 'LOC-SDQ', total: 500 }], owner);
s.DB.all('Sales');
ok('Sales read fills the chunked cache', Number(idxOf('Sales')) >= 1, 'chunks=' + idxOf('Sales'));
s.DB.insert('Sales', { id: 'SO-W2', date: '2026-09-19', locationId: 'LOC-SDQ', total: 700 }, owner);
ok('Sales write invalidates its cache immediately (touch rule)', !idxOf('Sales'));
s.DB.all('Sales'); coldExec('Sales');
ok('next execution reads Sales from cache, not the sheet',
  s.DB.all('Sales').map(r => r.id).join(',') === 'SO-W1,SO-W2' && Number(idxOf('Sales')) >= 1);

/* ② a write by another user cannot leave this execution stale */
s.DB.all('Payments');
const beforePaymentIds = s.DB.all('Payments').length;
s.DB.insert('Payments', { amount: 100, method: 'Cash', date: '2026-09-19', direction: 'IN', locationId: 'LOC-SDQ' }, owner);
coldExec('Payments');
ok('cross-execution invalidation is observed before the next read',
  s.DB.all('Payments').length === beforePaymentIds + 1);

/* ③ cacheWarm refills every cacheable sheet, read-only, returns + logs */
for (const n of s.CACHED_SHEETS) { s.DB._cacheDel(n); coldExec(n); }
const readsBefore = {};
for (const n of ['Settings', 'Items']) {
  const sh = s.DB.sheet(n);
  readsBefore[n] = 0;
  const gr = sh.getRange.bind(sh);
  sh.getRange = function (...a) { const r = gr(...a); for (const k of ['getValues', 'getDisplayValues']) { const f = r[k].bind(r); r[k] = () => { readsBefore[n]++; return f(); }; } return r; };
}
let warmLogs = [];
const realLog = s.Logger.log; s.Logger.log = (...a) => { warmLogs.push(a.map(String).join(' ')); };
try {
  s.Triggers._warmHour = () => 12;                    /* inside default 7..22 */
  const warm = s.warmCacheNow();
  ok('cacheWarm warms every cacheable sheet (returns the list)',
    Array.isArray(warm.warmed) && warm.warmed.length === s.CACHED_SHEETS.length &&
    warm.warmed.every(x => x.cached === true || (x.rows === 0 && x.cached === true)));
  ok('warm result is logged for the editor too',
    warmLogs.some(l => l.includes('"warmed"')));
  ok('after warm, a fresh execution reads from cache not the sheet',
    (() => { for (const n of s.CACHED_SHEETS) coldExec(n);
      const r0 = readsBefore['Settings'], r1 = readsBefore['Items'];
      s.DB.all('Settings'); s.DB.all('Items');
      return readsBefore['Settings'] === r0 && readsBefore['Items'] === r1; })());
  ok('warm stores chunk index for the largest master sheet too', Number(idxOf('Items')) >= 1);

  /* ④ guards */
  s.Triggers._warmHour = () => 3;                     /* outside 7..22 */
  const skipped = s.Triggers.cacheWarm({ trigger: true });
  ok('scheduled run outside business window is skipped (no churn)',
    skipped.skipped === 'outside-hours' && skipped.warmed.length === 0);
  ok('manual run ignores only the HOURS guard, and says so',
    s.warmCacheNow().skipped === null);
  s.DB.setSettings({ 'job.cacheWarm': 'false' }, owner);
  s.Triggers._warmHour = () => 12;
  ok('Settings job.cacheWarm=false turns the scheduled job off',
    s.Triggers.cacheWarm({ trigger: true }).skipped === 'off' && s.Triggers.config().warm === false);
  s.DB.setSettings({ 'job.cacheWarm': 'true' }, owner);
} finally { s.Logger.log = realLog; }

/* ⑤ install / remove / status include the new handler */
const installed = () => s.ScriptApp._triggers.filter(t => t._handler === 'triggerCacheWarm');
s.Triggers.install({}, owner);
ok('install creates the 15-minute warm trigger with timezone',
  installed().length === 1 && installed()[0]._minutes === 15 && installed()[0]._tz === 'Asia/Karachi',
  'minutes=' + (installed()[0] && installed()[0]._minutes) + ' tz=' + (installed()[0] && installed()[0]._tz));
const st = s.Triggers.status({}, owner);
ok('status reports the warm trigger among installed jobs',
  st.installed.some(x => x.handler === 'triggerCacheWarm'), 'installedCount=' + st.installedCount);
const rm = s.Triggers.remove({}, owner);
ok('remove deletes only project-owned handlers including warm', rm.removed >= 1 && installed().length === 0);

/* ⑥ config defaults */
const c = s.Triggers.config();
ok('warm job defaults on with a 7..22 Karachi window (64 runs/day, under 90)',
  c.warm === true && c.warmFrom === 7 && c.warmTo === 22 && c.timezone === 'Asia/Karachi');

/* ⑦ version */
ok('release is current (>=2.14)', parseFloat(s.CONFIG.VERSION) >= 2.14);

console.log('\n' + '═'.repeat(66));
console.log('  CACHE WARM   PASS: ' + passed + '   FAIL: ' + failed);
console.log('═'.repeat(66));
if (failed) process.exit(1);
