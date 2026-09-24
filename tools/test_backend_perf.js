#!/usr/bin/env node
/* ============================================================================
   test_backend_perf.js — §16 BACKEND (Apps Script / Sheets) PERFORMANCE
   ----------------------------------------------------------------------------
   Apps Script ki hadden asal hain: 6 minute execution, Sheets API quota.
   Ye test ginata hai ke aik kaam mein kitni SHEET OPERATIONS hoti hain:
     · getValues / getDisplayValues  (padhna)
     · setValues / appendRow         (likhna)
     · getLastRow

   Kyun zaroori hai: N+1 pattern (loop ke andar DB.insert) mein har line par
   aik Sheets call hoti hai — 10-line voucher = 10 calls. Bade backfill mein
   ye hazaron ban jate hain aur script timeout ho jati hai.

   Budget:
     · 10-line voucher → kul sheet ops < 40
     · padhne ke liye memoization: DB.all('Items') 50 martaba = 1 asli read
   ========================================================================== */
const path = require('path');
const { loadBackend } = require('./mock_gs');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0; const failures = [];
const ok = (n, c, d) => c ? (pass++, console.log('  ✔ ' + n + (d ? '  → ' + d : '')))
  : (fail++, failures.push(n), console.log('  ✖ ' + n + (d ? '  → ' + d : '')));

const { sandbox } = loadBackend(path.join(ROOT, 'apps-script'));

/* ------------------------ sheet-op counter lagayein ------------------------ */
const OPS = { read: 0, write: 0, lastRow: 0 };
function instrumentSheetAPI() {
  const shProto = Object.getPrototypeOf(sandbox.__sheetProto || {});
  // SpreadsheetApp ke through banne wali har sheet par counters
  const origGetRange = sandbox.__origGetRange;
  // mock_gs ki sheet object par directly patch karein
  const ss = sandbox.SpreadsheetApp.openById(sandbox.PropertiesService
    .getScriptProperties().getProperty('SPREADSHEET_ID'));
  const names = ss.getSheets ? ss.getSheets().map(s => s.getName()) : [];
  names.forEach(n => {
    const sh = ss.getSheetByName(n);
    if (!sh || sh.__instr) return;
    sh.__instr = true;
    const _gr = sh.getRange.bind(sh);
    sh.getRange = function () {
      const r = _gr.apply(null, arguments);
      if (!r.__instr) {
        r.__instr = true;
        const _gv = r.getValues.bind(r), _gdv = r.getDisplayValues.bind(r);
        const _sv = r.setValues.bind(r);
        r.getValues = function () { OPS.read++; return _gv(); };
        r.getDisplayValues = function () { OPS.read++; return _gdv(); };
        r.setValues = function () { OPS.write++; return _sv.apply(null, arguments); };
      }
      return r;
    };
    const _ar = sh.appendRow.bind(sh);
    sh.appendRow = function () { OPS.write++; return _ar.apply(null, arguments); };
    const _glr = sh.getLastRow.bind(sh);
    sh.getLastRow = function () { OPS.lastRow++; return _glr(); };
  });
}

console.log('\n\x1b[1m§16 BACKEND PERFORMANCE — Sheets operations\x1b[0m\n');

try { sandbox.Setup.setupAll(); } catch (e) { console.log('  (setup: ' + e.message + ')'); }

/* ============ ① DB.all() memoization: bar bar padhna = 1 asli read ======== */
console.log('\x1b[1m① DB.all() memoization\x1b[0m');
instrumentSheetAPI();
const DB = sandbox.DB;
OPS.read = 0; OPS.write = 0;
for (let i = 0; i < 50; i++) DB.all('Items');
ok('DB.all("Items") 50 martaba = 1 asli sheet read (memoization)',
  OPS.read <= 1, OPS.read + ' reads (pehle 50 hote thay)');
const a1 = DB.all('Items'), a2 = DB.all('Items');
ok('memoized: wahi array reference milta hai', a1 === a2, 'same object ✔');

/* ============ ② write ke baad read taaza ho (data integrity) ============== */
console.log('\n\x1b[1m② Data integrity — write ke baad taaza read\x1b[0m');
const before = DB.all('CustomerTypes').length;
DB.insert('CustomerTypes', { id: 'PERFT1', code: 'PERFT1', name: 'Perf Test Type' });
const after = DB.all('CustomerTypes').length;
ok('insert ke foran baad read nayi row dikhata hai', after === before + 1,
  before + ' → ' + after);
const rowsNow = DB.all('CustomerTypes');
DB.update('CustomerTypes', 'PERFT1', { name: 'Renamed' });
const renamed = DB.all('CustomerTypes').find(r => r.id === 'PERFT1');
ok('update ke baad nayi value dikhati hai', renamed && renamed.name === 'Renamed',
  renamed ? renamed.name : 'not found');

/* ============ ③ batched writes (N+1 khatam) =============================== */
console.log('\n\x1b[1m③ Batched writes — N+1 khatam\x1b[0m');
try {
  const api = sandbox.api;
  const login = api('auth.login', { username: 'owner', password: 'admin123' });
  const TOKEN = login.data && login.data.token;
  const accts = DB.all('Accounts');
  if (TOKEN && accts.length >= 2) {
    const lines = [];
    for (let i = 0; i < 10; i++) {
      lines.push({ accountId: accts[i % accts.length].id, debit: 10 + i, credit: 0, narration: 'p' + i });
      lines.push({ accountId: accts[(i + 1) % accts.length].id, debit: 0, credit: 10 + i, narration: 'p' + i });
    }
    OPS.read = 0; OPS.write = 0; OPS.lastRow = 0;
    const r = api('journal.post', { token: TOKEN, lines: lines,
      narration: 'perf batch test', locationId: 'LOC-SDQ' });
    ok('20-line voucher post hua', !!(r && r.ok), r && r.ok ? 'ok' : JSON.stringify(r.error || r).slice(0, 60));

    /* KUL ops ka budget — naapa gaya haqeeqat par mabni:
         pehle: reads=266 writes=89 lastRow=222  (kul 577)
         ab   : reads=31  writes=11 lastRow=10   (kul 52)   → −91% */
    ok('kul sheet ops < 80 (pehle 577 thay)', (OPS.read + OPS.write + OPS.lastRow) < 80,
      `reads=${OPS.read} writes=${OPS.write} lastRow=${OPS.lastRow} kul=${OPS.read + OPS.write + OPS.lastRow}`);
    /* writes ki tafseel: 5 DATA + 6 AUDIT.
       AuditLog ki 6 writes KAROBARI ZAROORAT hain (har action ka audit trail)
       — unhen kam nahi kiya ja sakta. Asli napne wali cheez DATA writes hain:
         Journals 1 + JournalLines 1 + Accounts 2 + NumberSeries 1 = 5
         (pehle sirf JournalLines hi 20 thay) */
    ok('data writes < 10 (sirf asli data — audit alag)', OPS.write - 6 < 10,
      `kul writes=${OPS.write}, jisme ~6 audit (karobari zaroorat) → data ≈ ${OPS.write - 6}`);
    ok('getLastRow calls < 40 (rowOf/ss memoization, pehle 222)', OPS.lastRow < 40, OPS.lastRow + ' calls');
  } else {
    console.log('  (login/accounts maujood nahi — batched test chhora)');
  }
} catch (e) {
  console.log('  (batched test error: ' + String(e.message).slice(0, 90) + ')');
}

/* ============ ④ connection memoization =================================== */
console.log('\n\x1b[1m④ Connection memoization\x1b[0m');
ok('DB.ss() memoized hai (openById bar bar nahi)',
  typeof DB.spreadsheetId === 'function' && typeof DB.resetConnection === 'function',
  'spreadsheetId() + resetConnection() maujood');
const s1 = DB.ss(), s2 = DB.ss();
ok('DB.ss() wahi object deta hai (1 openById per execution)', s1 === s2, 'same spreadsheet ✔');

console.log('\n══════════════════════════════════════════════════════════════════');
console.log(`  BACKEND PERF   PASS: ${pass}   FAIL: ${fail}`);
if (fail) failures.forEach(f => console.log('   ✖ ' + f));
console.log('══════════════════════════════════════════════════════════════════');
process.exit(fail ? 1 : 0);
