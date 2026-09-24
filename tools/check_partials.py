/**
 * check_partials.py — Apps Script HTML partials ka leak guard.
 *
 * Har partial sirf aik <style>…</style> ya <script>…</script> block hona chahiye.
 * Agar koi CSS/JS block ke BAHAR likha jaye to wo browser mein TEXT ki tarah
 * nazar aata hai (e.g. header par stylesheet ka raw text) — ye usi ko rokta hai.
 *
 *   node tools/check_partials.py     (ya tools/check.sh se chalta hai)
 */
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'apps-script');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html') && f !== 'Index.html' && !f.startsWith('Pwa_'));
const bad = [];

files.forEach(name => {
  const raw = fs.readFileSync(path.join(dir, name), 'utf-8');

  if (raw.trim().startsWith('<style>')) {                 // CSS partial
    if (!raw.trim().endsWith('</style>')) bad.push(name + ': text likha gaya hai </style> ke BAAD');
    if (raw.split('<style>').length - 1 !== 1) bad.push(name + ': ek se zyada <style> tags');
    if (raw.split('</style>').length - 1 !== 1) bad.push(name + ': ek se zyada </style> tags');
    const inner = raw.slice(raw.indexOf('<style>') + 7, raw.lastIndexOf('</style>'));
    if (inner.indexOf('<script') > -1) bad.push(name + ': style ke andar script tag');
    return;
  }

  // JS partial — string literals hata kar tag balance check karein
  const stripped = raw
    .replace(/'(?:[^'\\\n])*'/g, "''")
    .replace(/"(?:[^"\\\n])*"/g, '""')
    .replace(/`(?:[^`\\])*`/g, '``');
  if (!stripped.trim().endsWith('</script>')) bad.push(name + ': text likha gaya hai </script> ke BAAD');
  const open = stripped.split('<script>').length - 1;
  const close = stripped.split('</script>').length - 1;
  if (open !== close) bad.push(name + ': script tag mismatch (' + open + ' open / ' + close + ' close)');
});

if (bad.length) {
  console.log('  ✖ ' + bad.join('\n  ✖ '));
  process.exit(1);
}
console.log('  ✔ ' + files.length + ' partials — koi CSS/JS block ke bahar nahi');
