#!/usr/bin/env node
/* ==========================================================================
   audit_settings_defs.js — Settings schema ki pakki nazar (v2.6 QA)
   --------------------------------------------------------------------------
   Ye check isliye hai kyunke "AI assistant" sub-tab mein 7 fields DO Duplicate
   thin (aiEnabled, aiProvider, aiModel, aiCanWrite, aiPersona, aiTemperature,
   aiAutoSuggest). Nateeja: user ko "Enable AI agent" upar aur "Enable AI"
   neechay nazar aata tha, aur save mein aakhri wali value jeet ti thi.

   Checks:
     ① kisi sub-tab mein duplicate field key nahi
     ② har field ka key / label / type maujood
     ③ `sec` ho to title ho aur tone un 6 me se ho (fin/inv/ok/warn/info/err)
     ④ Config.defs() `sec` ko aage pass karta hai (warna UI section ban hi nahi
        sakta — ye bug asal mein hua tha)
     ⑤ har sub-tab zyada se zyada 1 baar define ho

   Chalein:  node tools/audit_settings_defs.js
   ========================================================================== */
const path = require('path');
const { loadBackend } = require('./mock_gs');
const DIR = path.join(__dirname, '..', 'apps-script');

let pass = 0, fail = 0; const problems = [];
const ok = (n, c, d) => c ? (pass++, console.log('  ✔ ' + n + (d ? '  → ' + d : '')))
  : (fail++, problems.push(n), console.log('  ✖ ' + n + (d ? '  → ' + d : '')));

const TONES = ['fin', 'inv', 'ok', 'warn', 'info', 'err'];

let defs = [];
try {
  const { sandbox } = loadBackend(DIR);
  try { sandbox.Setup.setupAll(); } catch (e) { /* defs ko data chahiye hi nahi */ }
  defs = sandbox.Config.defs ? sandbox.Config.defs() : [];
} catch (e) {
  console.log('✖ Config.defs() load nahi hua: ' + e.message);
  process.exit(1);
}

console.log('\n\x1b[1mSettings schema — Config.defs()\x1b[0m');
ok('schema load hua', Array.isArray(defs) && defs.length > 0, defs.length + ' groups');

let subs = 0, fields = 0, withSec = 0;
const dupKeys = [], missingMeta = [], badSec = [], subSeen = {};

defs.forEach(g => {
  (g.sub || []).forEach(t => {
    subs++;
    const id = g.id + '/' + t.id;
    subSeen[id] = (subSeen[id] || 0) + 1;

    const keys = (t.fields || []).map(f => f.key);
    const dups = keys.filter((k, i) => keys.indexOf(k) !== i);
    if (dups.length) dupKeys.push(id + ': ' + [...new Set(dups)].join(', '));

    (t.fields || []).forEach(f => {
      fields++;
      if (!f.key || !f.label || !f.type) missingMeta.push(id + '/' + (f.key || '?'));
      if (f.sec) {
        withSec++;
        if (!f.sec.title) badSec.push(id + '/' + f.key + ' (sec bina title)');
        else if (f.sec.tone && TONES.indexOf(f.sec.tone) < 0)
          badSec.push(id + '/' + f.key + ' (ghair-mashhoor tone: ' + f.sec.tone + ')');
      }
    });
  });
});

console.log('     ' + subs + ' sub-tabs, ' + fields + ' fields, ' + withSec + ' sectioned');

ok('① kisi sub-tab mein duplicate field key nahi',
  dupKeys.length === 0, dupKeys.length ? dupKeys.join(' | ') : subs + ' sub-tabs saf');

ok('② har field ka key / label / type maujood',
  missingMeta.length === 0, missingMeta.length ? missingMeta.slice(0, 3).join(', ') : fields + ' fields');

ok('③ `sec` ho to title ho aur tone 6 me se ho',
  badSec.length === 0, badSec.length ? badSec.slice(0, 3).join(', ') : withSec + ' sectioned fields theek');

/* ④ — defs() sec ko aage pass kare (warna UI block ban hi nahi sakta) */
const aiSub = (() => {
  const g = defs.find(x => x.id === 'automation');
  return g ? (g.sub || []).find(s => s.id === 'ai') : null;
})();
if (aiSub) {
  const n = (aiSub.fields || []).filter(f => f.sec).length;
  ok('④ Config.defs() `sec` ko aage pass karta hai (AI sub: 24/24)',
    n === (aiSub.fields || []).length && n > 0,
    n + '/' + (aiSub.fields || []).length + ' fields ke sath sec');
} else {
  ok('④ AI sub-tab mila', false, 'automation/ai nahi mila');
}

/* ⑤ */
const dupSubs = Object.keys(subSeen).filter(k => subSeen[k] > 1);
ok('⑤ koi sub-tab do baar define nahi hua',
  dupSubs.length === 0, dupSubs.length ? dupSubs.join(', ') : subs + ' sub-tabs yakht');

console.log('\n══════════════════════════════════════════════════════════════════');
console.log(`  SETTINGS SCHEMA   PASS: ${pass}   FAIL: ${fail}`);
if (fail) problems.forEach(x => console.log('   ✖ ' + x));
console.log('══════════════════════════════════════════════════════════════════');
process.exit(fail ? 1 : 0);
