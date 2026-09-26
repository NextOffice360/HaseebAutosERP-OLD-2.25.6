#!/usr/bin/env node
/* tools/fix_comment_hygiene.js — v2.31.0 (r12)
   ---------------------------------------------------------------------------
   Block-comment CONTINUATION lines par '* ' prefix lagata hai (javadoc style)
   taake audit_i18n un lines ko code samajh kar hits na gine (false-positives).
   SAFE by design (r11 lesson: naive depth-counter ne App_Config JS tod diya tha):
     1. sirf wo lines badalta hai jo block-comment ke andar hon aur jin par
        i18n MARKER + quote mojood ho (yaani audit ne flag ki hon)
     2. har file ke badlaav ke baad <script> blocks new Function se VALIDATE
        hote hain — koi bhi syntax error → poori file REVERT (all-or-nothing)
     node tools/fix_comment_hygiene.js [file.html ...]   (default: sari apps-script)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

/* audit_i18n ke markers ki copy (sync rakhein) */
const MARKERS = [
  'karein', 'karna', 'karke', 'karti', 'karta', 'nahi', 'nahin', 'mojood', 'zaroori',
  'dikhaye', 'dikhayein', 'chunein', 'bhejein', 'lazmi', 'darkaar', 'shuru', 'kholein',
  'tabdeel', 'mukammal', 'daakhil', 'koshish', 'dobara', 'dubara', 'wapis', 'baqaya',
  'udhaar', 'wasooli', 'ghalat', 'sahi hai', 'mil gaya', 'ho gaya', 'ho gayi', 'milta',
  'banayein', 'badlein', 'khareed', 'farq', 'taadaad', 'talaash', 'dhoondein', 'ijazat',
  'mehfooz', 'muntaqil', 'tasdeeq', 'rawana', 'mukhtalif', 'mutabiq', 'biltafseel'
];
const MARKER_RE = new RegExp('\\b(?:' + MARKERS.join('|') + ')\\b', 'i');

function scriptBlocks(src) {
  const blocks = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(src))) blocks.push(m[1]);
  return blocks;
}
function syntaxOk(src) {
  for (const b of scriptBlocks(src)) {
    try { new Function(b); } catch (e) { return false; }
  }
  return true;
}

/* ek file par hygiene chalao → { changed, reverted, lines } */
function fixFile(fp) {
  const orig = fs.readFileSync(fp, 'utf8');
  const lines = orig.split('\n');
  let depth = 0;                       /* block-comment depth (strings ka ilm nahi — is liye validate+revert) */
  let n = 0;
  const out = lines.map((ln) => {
    const st = ln.trim();
    let nl = ln;
    if (depth > 0 && st && !st.startsWith('*') && !st.startsWith('/*') && MARKER_RE.test(st) && /['"`]/.test(st)) {
      const indent = ln.slice(0, ln.length - ln.lstrip_len());
      nl = indent + '* ' + st;
      n++;
    }
    depth = Math.max(0, depth + (ln.match(/\/\*/g) || []).length - (ln.match(/\*\//g) || []).length);
    return nl;
  });
  const cand = out.join('\n');
  if (cand === orig) return { changed: false, lines: 0 };
  if (!syntaxOk(cand)) return { changed: false, reverted: true, lines: 0 };
  fs.writeFileSync(fp, cand);
  return { changed: true, lines: n };
}

/* string.prototype lstrip helper (chhota, local) */
Object.defineProperty(String.prototype, 'lstrip_len', {
  value: function () { const m = this.match(/^[ \t]*/); return m ? m[0].length : 0; },
  configurable: true, writable: true
});

const args = process.argv.slice(2);
const files = args.length
  ? args.map(f => path.join(ROOT, 'apps-script', f))
  : fs.readdirSync(path.join(ROOT, 'apps-script')).filter(f => f.endsWith('.html')).map(f => path.join(ROOT, 'apps-script', f));

let tot = 0, ch = 0, rev = 0;
files.forEach(fp => {
  const r = fixFile(fp);
  if (r.reverted) { rev++; console.log('  ↩ revert (syntax): ' + path.basename(fp)); }
  else if (r.changed) { ch++; tot += r.lines; console.log('  ✔ ' + path.basename(fp) + ' — ' + r.lines + ' continuation lines'); }
});
console.log(' COMMENT HYGIENE  files:' + ch + ' lines:' + tot + (rev ? ' reverted:' + rev : ''));
