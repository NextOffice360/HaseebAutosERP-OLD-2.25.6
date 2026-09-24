#!/usr/bin/env node
/* ============================================================================
   tools/test_cache.js — CHUNKED SHEET CACHE GATE (v2.8.4)
   ----------------------------------------------------------------------------
   User report: "browsing aur sheets se data fetch karna bohot slow hai."

   WAJAH (naap kar malaum hui): CacheService ki har key par 100 KB hadd hai
   (official docs). Hamari bari sheets us se barhi hain —
       Items  422 rows = 405 KB   ·   Stock 1266 rows = 223 KB
   Purana code `put(key, JSON)` karta tha → exception → `catch(e){}` nigal
   jata → cache KABHI NAHI bharta → har execution par poori sheet dobara
   parhi jati. Apps Script par sheet read sab se mehengi cheez hai.

   HAL: chunked cache (≤90 KB tukre + `:n` index), `getAll()` se aik call mein
   wapsi, aur `DB.touch()` se invalidation.

   EXECUTION BOUNDARY KAISE NAQL KI GAYI: Apps Script mein har
   `google.script.run` aik NAYI execution hai — `DB._rows` (in-execution memo)
   khaali hota hai, magar CacheService qaim rehta hai. Is liye test wahi karta
   hai: memo saaf, cache qaim. Alag sandbox nahi banaya (us ka apna
   spreadsheet hota, jo ghalt model hai).

   NOTE: mock CacheService ab 100 KB limit ENFORCE karta hai — is liye agar
   chunking toote to ye test FAIL hoga (jhoota pass nahi ho sakta).
   ========================================================================== */
'use strict';
const path = require('path');
const { loadBackend } = require('./mock_gs');

let PASS = 0, FAIL = 0;
function ok(name, cond, note) {
  if (cond) { PASS++; console.log('  \x1b[32m✔\x1b[0m ' + name + (note ? '  \x1b[2m→ ' + note + '\x1b[0m' : '')); }
  else { FAIL++; console.log('  \x1b[31m✘ ' + name + '\x1b[0m' + (note ? '  → ' + note : '')); }
}

const { sandbox, services } = loadBackend(path.join(__dirname, '..', 'apps-script'));
const { DB } = sandbox;
sandbox.setupAll();
try { if (sandbox.seedRealProducts) sandbox.seedRealProducts(); } catch (e) { }

const store = services.CacheService.getScriptCache()._store;
const keysOf = pfx => Object.keys(store).filter(k => k.indexOf(pfx) === 0);
const nChunks = pfx => keysOf(pfx).filter(k => /:\d+$/.test(k)).length;
/* nayi execution ki naql: memo khaali, cache qaim */
function newExec(name) { try { delete DB._rows[name]; } catch (e) { } }

/* ==========================================================================
   1. Bari sheets ab cache mein jati hain (pehle nahi jati thin)
   ========================================================================== */
(function cacheActuallyFills() {
  const rows = DB.all('Items');                 // normal read → cache set
  const kb = (JSON.stringify(rows).length / 1024);
  ok('1 · Items sheet 100 KB limit se bari hai', kb > 100, kb.toFixed(0) + ' KB / ' + rows.length + ' rows');

  const chunks = nChunks((DB.cacheKey('Items') + ':'));
  const idx = store[(DB.cacheKey('Items') + ':n')];
  ok('1 · Items CHUNKED cache mein gaya', chunks > 1 && !!idx, chunks + ' tukre, index=' + idx);
  ok('1 · index aur tukron ki ginti barabar hai', String(chunks) === String(idx),
    'chunks=' + chunks + ' index=' + idx);

  const sizes = keysOf((DB.cacheKey('Items') + ':')).filter(k => /:\d+$/.test(k)).map(k => store[k].length);
  const maxKb = sizes.length ? Math.max.apply(null, sizes) / 1024 : -1;
  ok('1 · koi tukra 100 KB limit se bara nahi', sizes.length > 0 && maxKb <= 100,
    sizes.length ? 'sab se bara ' + maxKb.toFixed(1) + ' KB' : 'koi tukra nahi');
  ok('1 · tukre mil kar poora JSON bante hain',
    sizes.reduce((a, b) => a + b, 0) > kb * 1024 * 0.9, sizes.reduce((a, b) => a + b, 0) + ' bytes');
})();

/* ==========================================================================
   2. Cache HIT par sheet dobara nahi parhi jati (asal speed faida)
   ========================================================================== */
(function cacheHitSavesRead() {
  const origRead = DB._readSheet.bind(DB);

  /* (a) khali cache → sheet parhni chahiye */
  DB._cacheDel('Items'); newExec('Items');
  let reads = 0;
  DB._readSheet = function (n) { reads++; return origRead(n); };
  const rows = DB.all('Items');
  ok('2 · khali cache par sheet read hua', reads === 1, 'reads=' + reads);

  /* (b) ab nayi execution (memo khaali) magar cache bhara hua → read NAHI */
  newExec('Items');
  reads = 0;
  DB._readSheet = function (n) { reads++; return origRead(n); };
  const back = DB.all('Items');
  DB._readSheet = origRead;
  ok('2 · cache HIT par sheet read Nahi hua', reads === 0, 'reads=' + reads);
  ok('2 · wapas wahi data aaya', Array.isArray(back) && back.length === rows.length,
    back.length + ' rows (asal ' + rows.length + ')');
  ok('2 · data intact (pehla + akhri item same)',
    back[0] && rows[0] && back[0].id === rows[0].id &&
    back[back.length - 1].id === rows[rows.length - 1].id);
})();

/* ==========================================================================
   3. Write ke baad invalidation (data integrity)
   ========================================================================== */
(function invalidationWorks() {
  DB.all('Items');
  ok('3 · cache bhara hua hai', nChunks((DB.cacheKey('Items') + ':')) > 1, nChunks((DB.cacheKey('Items') + ':')) + ' tukre');
  DB.touch('Items');
  ok('3 · touch() ke baad cache SAAAF', keysOf((DB.cacheKey('Items') + ':')).length === 0,
    keysOf((DB.cacheKey('Items') + ':')).length + ' keys bache');
  ok('3 · index key bhi gaya', !store[(DB.cacheKey('Items') + ':n')]);
  /* doosri sheet ko nuqsaan nahi pohancha (purana removeAll poora saaf karta tha) */
  DB.all('Locations');
  DB.touch('Items');
  ok('3 · touch(Items) ne Locations ka cache nahi toda', !!store[(DB.cacheKey('Locations') + ':n')]);
})();

/* ==========================================================================
   4. Aadha evict ho jaye to mehfooz fallback (Google cache evict kar sakta hai)
   ========================================================================== */
(function partialEvictionIsSafe() {
  const rows = DB.all('Items');
  const n = parseInt(store[(DB.cacheKey('Items') + ':n')], 10);
  ok('4 · cache dobara bhara', n > 1, n + ' tukre');
  delete store[(DB.cacheKey('Items') + ':0')];                   // jaise Google eviction karta hai
  newExec('Items');
  let res = null, threw = null;
  try { res = DB.all('Items'); } catch (e) { threw = e; }
  ok('4 · aadha evict hone par bhi data milta hai (sheet fallback)',
    !threw && res && res.length === rows.length,
    threw ? threw.message : res.length + ' rows');
  ok('4 · fallback ke baad cache dobara bhar gaya', nChunks((DB.cacheKey('Items') + ':')) > 1);
})();

/* ==========================================================================
   5. Index jhoot bole (tukron se zyada) to bhi crash na ho
   ========================================================================== */
(function corruptIndexIsSafe() {
  DB.all('Items');
  store[(DB.cacheKey('Items') + ':n')] = '99';                   // corrupt / stale index
  newExec('Items');
  let res = null, threw = null;
  try { res = DB.all('Items'); } catch (e) { threw = e; }
  ok('5 · corrupt index par bhi data milta hai', !threw && res && res.length > 0,
    threw ? threw.message : res.length + ' rows');
})();

/* ==========================================================================
   6. Chhoti sheets bhi chalti hain (regression)
   ========================================================================== */
(function smallSheetsStillWork() {
  ['Settings', 'Locations', 'Users'].forEach(n => {
    const rows = DB.all(n);
    newExec(n);
    const got = DB._cacheGet(n);
    ok('6 · ' + n + ' cache round-trip theek', Array.isArray(got) && got.length === rows.length,
      rows.length + ' rows');
  });
})();

/* ==========================================================================
   7. Stock (doosri bari sheet) bhi cache hoti hai
   ========================================================================== */
(function stockCachesToo() {
  const rows = DB.all('Stock');
  const kb = (JSON.stringify(rows).length / 1024);
  ok('7 · Stock sheet cache mein gaya', rows.length === 0 || nChunks((DB.cacheKey('Stock') + ':')) > 0,
    rows.length + ' rows, ' + kb.toFixed(0) + ' KB, ' + nChunks((DB.cacheKey('Stock') + ':')) + ' tukre');
})();

/* ========================================================================== */
console.log('');
console.log('══════════════════════════════════════════════════════════════');
console.log('  CHUNKED SHEET CACHE   PASS: ' + PASS + '   FAIL: ' + FAIL);
console.log('══════════════════════════════════════════════════════════════');
process.exit(FAIL ? 1 : 0);
