/**
 * tools/audit_settings_icons.js — v2.30.0 (N6) settings icons audit
 * ============================================================================
 * Aap ke 23 settings areas ka icon status (static): SVG (App_Icons.html ki
 * Lucide-style library) mila, ya purana emoji fallback chal raha hai.
 * Saath hi: koi do areas aik hi icon share nahi karte (ambiguous icons ka
 * purana bug dobara na ho — v2.6 QA).
 *
 *   node tools/audit_settings_icons.js           (report)
 *   node tools/audit_settings_icons.js --assert  (gap/duplicate par exit 1)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const ASSERT = process.argv.includes('--assert');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const cfg = read('apps-script/Config.gs');
const conf = read('apps-script/App_Config.html');
const icons = read('apps-script/App_Icons.html');

/* ---------- DUPLICATE KEYS (v2.30.0) ----------
   Ek hi line par do `icon:` = ambiguity (JS mein aakhri jeetta hai). Pehle
   Config.gs mein 13 aisi lines thin — schema padh kar pata nahi chalta tha kaun
   sa icon chalega. Ab ye check dobara aane nahi deta. */
const dupIconLines = [];
[['config', cfg], ['App_Config', conf]].forEach(([tag, src]) => {
  src.split('\n').forEach((l, i) => {
    const n = (l.match(/\bicon\s*:/g) || []).length;
    if (n > 1) dupIconLines.push(tag + ':' + (i + 1) + ' (' + n + '× icon:)');
  });
});

/* ---------- icon library: kaun se emoji → SVG mapped hain ---------- */
const pNames = new Set(Array.from(icons.matchAll(/^\s{4}([A-Za-z][A-Za-z0-9_]*):\s*'/gm)).map(m => m[1]));
const byEmoji = new Map();
Array.from(icons.matchAll(/'(\\u[0-9A-Fa-f]{4}(?:\\u[0-9A-Fa-f]{4})*|..)':\s*'([A-Za-z][A-Za-z0-9_]*)'/g)).forEach(m => {
  const raw = m[1];
  let ch = raw;
  if (raw.indexOf('\\u') === 0) {
    try { ch = raw.split('\\u').filter(Boolean).map(x => String.fromCharCode(parseInt(x, 16))).join(''); } catch (e) { }
  }
  byEmoji.set(ch, m[2]);
});
function resolve(emoji) {
  if (!emoji) return { ok: false, why: 'icon set nahi' };
  /* v2.30.0 (N6): icon seedha path ka naam bhi ho sakta hai ('receipt') */
  if (pNames.has(emoji)) return { ok: true, name: emoji, direct: true };
  const n = byEmoji.get(emoji);
  if (!n) return { ok: false, why: 'emoji ka SVG mapping nahi (fallback emoji)', name: null };
  if (!pNames.has(n)) return { ok: false, why: 'mapping "' + n + '" ka path library mein nahi', name: n };
  return { ok: true, name: n };
}

/* ---------- RUNTIME PARITY (asli sabak) ----------
   Static source mein icon hona kaafi NAHI — Config.defs() jab frontend ko schema
   bhejta hai to keys drop ho sakti hain. v2.30.0 se pehle sub-tab ka `icon` aur
   group ka `tint` yahin se ghayab ho jate the, is liye UI har sub-tab par '▸'
   dikhata tha. Ye check usi ko pakarta hai. */
function runtimeParity() {
  try {
    const { loadBackend } = require('./mock_gs');
    const { sandbox } = loadBackend(path.join(ROOT, 'apps-script'));
    try { sandbox.Setup.setupAll(); } catch (e) { }
    const defs = sandbox.Config.defs ? sandbox.Config.defs() : [];
    const miss = [];
    defs.forEach(g => {
      if (!g.icon) miss.push(g.id + ' (group icon)');
      if (!g.tint) miss.push(g.id + ' (group tint)');
      (g.sub || []).forEach(t => { if (!t.icon) miss.push(g.id + '/' + t.id + ' (sub icon)'); });
    });
    return { ok: defs.length > 0 && miss.length === 0, count: defs.length, miss: miss };
  } catch (e) {
    return { ok: false, count: 0, miss: ['runtime check fail: ' + (e && e.message)] };
  }
}
const RT = runtimeParity();

/* ---------- settings areas (aap ka 23-item list) ---------- */
/* har area ka icon kahan likha hai: Config.gs group/sub, ya App_Config extras */
function findIcon(label) {
  const re = new RegExp("label:\\s*'" + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "'\\s*,\\s*icon:\\s*'([^']*)'");
  let m = cfg.match(re);
  if (m) return { where: 'Config.gs', emoji: m[1] };
  m = conf.match(re);
  if (m) return { where: 'App_Config.html', emoji: m[1] };
  /* icon label se pehle bhi likha ho sakta hai (icon: 'x', label: 'y') */
  const re2 = new RegExp("icon:\\s*'([^']*)'\\s*,\\s*(?:render:|fields:|sub:|title:)?\\s*label:\\s*'" + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "'");
  m = cfg.match(re2) || conf.match(re2);
  if (m) return { where: 'Config.gs/App_Config', emoji: m[1] };
  return null;
}

const AREAS = [
  'Business Profile', 'Point of Sale', 'Mobile apps (PWA)', 'Inventory & Warehouse', 'Trade & Accounts',
  'Modules & Navigation', 'Automation & AI', 'Security & Sessions', 'Backend & Integrations',
  'Custom fields', 'Menu builder', 'Print templates', 'Lists & catalogs', 'Data & tools',
  'WhatsApp & SMS', 'Price list import', 'Firebase migration', 'Export & share', 'AI assistant',
  'Alerts & notifications', 'Purchase reorder rules', 'Scheduled jobs (triggers)', 'Document numbering'
];

console.log('area'.padEnd(26) + 'icon   status');
let gaps = 0;
const used = {};
AREAS.forEach(area => {
  const found = findIcon(area);
  if (!found) { console.log(area.padEnd(26) + '—      ❌ icon hi nahi (label match nahi hua)'); gaps++; return; }
  const r = resolve(found.emoji);
  const nm = r.ok ? r.name : '';
  if (r.ok) { used[nm] = (used[nm] || []).concat(area); }
  if (!r.ok) gaps++;
  console.log(area.padEnd(26) + String(found.emoji || '·').padEnd(7) + (r.ok ? '✔ SVG: ' + r.name : '⚠ ' + r.why) + '  [' + found.where + ']');
});

const dupes = Object.keys(used).filter(k => used[k].length > 1);
console.log('\nRUNTIME:  Config.defs() → frontend  ' + (RT.ok
  ? '✔ ' + RT.count + ' groups, koi key drop nahi'
  : '✖ ' + RT.miss.slice(0, 6).join(', ')));
console.log('\nDUPLICATE keys: ' + (dupIconLines.length ? '✖ ' + dupIconLines.join(', ') : '✔ koi nahi (har line par ek hi icon:)'));
console.log('\nSUMMARY: ' + (AREAS.length - gaps) + '/' + AREAS.length + ' SVG mapped · gaps: ' + gaps +
  ' · shared-icon areas: ' + (dupes.length ? dupes.map(k => k + ' (' + used[k].join(' = ') + ')').join('; ') : 'koi nahi') +
  ' · duplicate icon: keys: ' + dupIconLines.length);
process.exitCode = (ASSERT && (!RT.ok || gaps || dupes.length || dupIconLines.length)) ? 1 : 0;
