#!/usr/bin/env node
/* ==========================================================================
   audit_secrets.js — v2.30.4 · W12 gate (A§15: no hardcoded secrets)
   --------------------------------------------------------------------------
   Repo (git-tracked files) ko scan karta hai:
     ① Mashhoor token patterns: GitHub (ghp_/github_pat_/gho_/ghs_), OpenAI
        (sk-), Google (AIza…), Slack (xox…), AWS (AKIA…), private keys (BEGIN
        RSA/EC/OPENSSH PRIVATE KEY), JWT (eyJ………)
     ② Mashbooh literal assignments: password/secret/apiKey = "…" (allowlist:
        demo seed creds — admin123 waghera demo-only hain aur docs me declared)
   PASS = 0 findings. Koi bhi pattern mile to RED (exit 1) — fix: secret ko
   ScriptProperties/PropertiesService ya Settings me daalo, file se hatao.

   NOTE: ye gate sirf CURRENT TREE parhta hai (.git history nahi) — history me
   kabhi secret push ho to GitHub par rotate/revoke karna zaroori hai.

   Run: node tools/audit_secrets.js
   ========================================================================== */
const { execSync } = require('child_process');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, d) => c ? (pass++, console.log('  \u2714 ' + n + (d ? '  \u2192 ' + d : '')))
  : (fail++, console.log('  \u2716 ' + n + (d ? '  \u2192 ' + d : '')));

console.log('\n\x1b[1mW12 \u00b7 SECRET SCAN (A\u00a715)\x1b[0m');

/* git-tracked files (node_modules/demo-builds waise hi bahar) */
let files = [];
try {
  files = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(Boolean)
    .filter(f => /\.(gs|html|js|json|md|sh|py|txt|webmanifest|css)$/i.test(f));
} catch (e) {
  console.error('git ls-files fail:', e.message);
  process.exit(1);
}
ok('\u2460 Scan set: git-tracked source files', files.length > 100, files.length + ' files');

/* ① token patterns */
const PATTERNS = [
  [/ghp_[A-Za-z0-9]{20,}/, 'GitHub PAT (ghp_)'],
  [/github_pat_[A-Za-z0-9_]{20,}/, 'GitHub fine-grained PAT'],
  [/gho_[A-Za-z0-9]{20,}|ghs_[A-Za-z0-9]{20,}/, 'GitHub OAuth/App token'],
  [/sk-[A-Za-z0-9]{20,}/, 'OpenAI-style key (sk-)'],
  [/AIza[A-Za-z0-9_\-]{30,}/, 'Google API key (AIza)'],
  [/xox[baprs]-[A-Za-z0-9\-]{10,}/, 'Slack token'],
  [/AKIA[0-9A-Z]{16}/, 'AWS access key'],
  [/-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'private key block'],
  [/eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}\./, 'JWT literal']
];

/* ② literal assignment (chhoti allowlist ke sath) */
const ASSIGN = /(password|passwd|secret|api[_\-]?key|token)\s*[:=]\s*["'][^"']{8,}["']/i;
const ALLOW = [
  /admin123|manager123|sales123|cash123|del123|other123|acc123|purchase123|warehouse123/ /* demo seed creds (Setup.gs + docs, jaan-boojh kar public demo) */,
  /_TOKEN|tokenKey|TOKEN_KEY|auth\.token|\.token\b|token:/i,
  /secretName|secret_key_placeholder|your[-_]?api[-_]?key|placeholder|example\.com/i,
  /process\.env|getProperties|ScriptProperties|UserProperties/i,
  /* v2.30.4 round-2 — verified false-positives (asli UI strings, secrets nahi): */
  /radio: 'Option', file: 'File'/            /* i18n label dictionary */,
  /encodeURIComponent/                        /* query-string builder (token= expr) */
];

const findings = [];
for (const f of files) {
  let src;
  try { src = require('fs').readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { continue; }
  const lines = src.split('\n');
  /* test/audit files me fake fixtures hone design hai (users.create test-creds
     waghera) — literal-assignment check un par nahi, TOKEN patterns phir bhi sab par */
  const isFixture = /^tools\/(test|audit)_/.test(f);
  lines.forEach((line, i) => {
    for (const [re, label] of PATTERNS) {
      if (re.test(line)) findings.push(f + ':' + (i + 1) + ' \u2014 ' + label);
    }
    if (!isFixture && ASSIGN.test(line) && !ALLOW.some(a => a.test(line))) {
      findings.push(f + ':' + (i + 1) + ' \u2014 suspicious literal: ' + line.trim().slice(0, 70));
    }
  });
}

ok('\u2461 Token patterns: ZERO (9 families)', !findings.some(x => /\u2014 (GitHub|OpenAI|Google|Slack|AWS|private key|JWT)/.test(x)),
  findings.length ? findings.slice(0, 3).join(' | ') : 'clean');
ok('\u2462 Mashbooh literal assignments: ZERO (demo-seed allowlist ke siwa)',
  !findings.some(x => /suspicious literal/.test(x)),
  findings.length ? findings.slice(0, 3).join(' | ') : 'clean');

/* ③ key-storage ka usool: config PropertiesService par (docs declared) */
const fs = require('fs');
const aiGs = fs.readFileSync(path.join(ROOT, 'apps-script', 'AI.gs'), 'utf8') +
  fs.readFileSync(path.join(ROOT, 'apps-script', 'AI_ProviderHub.gs'), 'utf8');
ok('\u2463 API keys PropertiesService par (hardcoded nahi) \u2014 AI provider keys ka usool',
  /getScriptProperties|getUserProperties|PropertiesService/.test(aiGs));

/* summary */
console.log('\n\x1b[1mSUMMARY:\x1b[0m ' + pass + ' pass \u00b7 ' + fail + ' fail \u00b7 ' + (fail ? '\x1b[31mRED\x1b[0m' : '\x1b[32mGREEN\x1b[0m'));
if (fail) process.exit(1);
