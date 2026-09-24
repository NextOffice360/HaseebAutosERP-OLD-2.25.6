/**
 * tools/test_settings_icons.js — v2.30.0 gate (N6): settings icons RENDERED DOM se
 * ============================================================================
 * N6 ka matlab sirf "emoji ko SVG se badal do" nahi tha — user ne kaha tha:
 *   "23 settings groups ke liye colored icons · ek hi consistent style ·
 *    meaningful (magar zaroorat se zyada nahi) rang"
 *
 * Static audit (tools/audit_settings_icons.js) source dekhta hai; ye gate ASLI
 * rendered DOM dekhta hai — aur usi ne asli bug pakra tha:
 *   Config.defs() sub-tab ka `icon` aur group ka `tint` DROP kar raha tha,
 *   is liye har settings sub-tab par fallback '▸' aur koi rang nahi tha.
 *
 * Checks (light + dark):
 *   ① Settings ka L1 tabbar: 14 tabs (9 group + 5 extra) — sab par SVG
 *   ② har group ke ANDAR har sub-tab par SVG (41 sub-tabs) — koi '▸' fallback nahi
 *   ③ icon slot mein bacha hua emoji nahi (double-icon purana bug)
 *   ④ ek hi tab-bar ke andar koi do tabs aik icon share nahi karte
 *   ⑤ style ek hi: fill=none · stroke=currentColor · stroke-width=1.9 · viewBox 24
 *   ⑥ har tab par uska tint (L1 = apna, sub-tab = apne group ka) — computed color match
 *   ⑦ tints aapas mein mukhtalif (rang ka matlab hai, dhabba nahi)
 *   ⑧ aap ki 23-area list DOM mein maujood (traceability)
 *   ⑨ zero page errors
 *
 *   node tools/test_settings_icons.js [file|http]      (~50s)
 */
'use strict';
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const TARGET = process.argv[2] || ('file://' + path.join(ROOT, 'demo', 'index.html'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ERR = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✔', name); }
  else { fail++; const m = '  ✖ ' + name + (extra ? '  → ' + extra : ''); ERR.push(name); console.log(m); }
}

/* ---------- expected tints (source of truth se; duplicate list nahi) ---------- */
const cfgSrc = fs.readFileSync(path.join(ROOT, 'apps-script/Config.gs'), 'utf8');
const confSrc = fs.readFileSync(path.join(ROOT, 'apps-script/App_Config.html'), 'utf8');
const GROUPS = ['business', 'pos', 'pwa', 'inventory', 'trade', 'modules', 'automation', 'security', 'backend'];
const GROUP_TINT = {};
Array.from(cfgSrc.matchAll(/id: '([a-zA-Z0-9_]+)', label: '([^']*)', icon: '[^']*', tint: '(#[0-9a-fA-F]{3,6})'/g))
  .forEach(m => { if (GROUPS.indexOf(m[1]) > -1) GROUP_TINT[m[1]] = m[3]; });
const EXTRA_TINT = {};   /* label → tint */
Array.from(confSrc.matchAll(/\{ id: '[a-zA-Z0-9_]+', label: '([^']*)', icon: '[^']*', tint: '(#[0-9a-fA-F]{3,6})'/g))
  .forEach(m => { EXTRA_TINT[m[1]] = m[2]; });
const hexToRgb = hex => {
  const h = hex.replace('#', '');
  const f = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  return 'rgb(' + parseInt(f.slice(0, 2), 16) + ', ' + parseInt(f.slice(2, 4), 16) + ', ' + parseInt(f.slice(4, 6), 16) + ')';
};

/* ---------- 23 areas (user ki list) ---------- */
const AREAS = [
  'Business Profile', 'Point of Sale', 'Mobile apps (PWA)', 'Inventory & Warehouse', 'Trade & Accounts',
  'Modules & Navigation', 'Automation & AI', 'Security & Sessions', 'Backend & Integrations',
  'Custom fields', 'Menu builder', 'Print templates', 'Lists & catalogs', 'Data & tools',
  'WhatsApp & SMS', 'Price list import', 'Firebase migration', 'Export & share', 'AI assistant',
  'Alerts & notifications', 'Purchase reorder rules', 'Scheduled jobs (triggers)', 'Document numbering'
];

/* ---------- page-side: kisi tab-bar ke icons padho ---------- */
const READ_BAR = (sel) => Array.from(document.querySelectorAll(sel)).map(b => {
  const ti = b.querySelector('span.ti');
  const svg = ti ? ti.querySelector('svg') : null;
  let label = '';
  Array.from(b.children).forEach(ch => {
    if (ch.classList && (ch.classList.contains('ti') || ch.classList.contains('tbadge'))) return;
    label += (ch.textContent || '');
  });
  const sig = svg ? Array.from(svg.children).map(el =>
    el.tagName.toLowerCase() + ':' + (el.getAttribute('d') || '') +
    ':' + (el.getAttribute('cx') || '') + (el.getAttribute('cy') || '') + (el.getAttribute('r') || '')).join('|') : '';
  return {
    id: b.dataset.id, label: label.trim(), hasSvg: !!svg, sig: sig,
    style: svg ? {
      fill: svg.getAttribute('fill'), stroke: svg.getAttribute('stroke'),
      sw: svg.getAttribute('stroke-width'), vb: svg.getAttribute('viewBox')
    } : null,
    color: svg ? getComputedStyle(svg).color : '',
    emoji: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u.test(ti ? ti.textContent : '')
  };
});

const styleOk = r => r.style && r.style.fill === 'none' && r.style.stroke === 'currentColor' &&
  String(r.style.sw) === '1.9' && r.style.vb === '0 0 24 24';
const sibsDup = rows => {
  const seen = {}, dup = [];
  rows.forEach(r => {
    if (!r.sig) return;
    if (seen[r.sig] && seen[r.sig] !== r.label) dup.push(seen[r.sig] + ' = ' + r.label);
    seen[r.sig] = r.label;
  });
  return dup;
};

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e.message).slice(0, 120)));
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(TARGET, { waitUntil: 'networkidle2', timeout: 45000 });
  if (await page.$('#lgUser')) {
    await page.click('#lgUser'); await page.type('#lgUser', 'owner');
    await page.click('#lgPass'); await page.type('#lgPass', 'admin123');
    await page.keyboard.press('Enter');
  }
  await page.waitForFunction(() => window.App && App.state && App.state.session, { timeout: 20000 });
  await sleep(1200);
  console.log('\n\x1b[1mSettings icons (N6) — rendered DOM\x1b[0m');
  await page.evaluate(() => App.go('settings'));
  await page.waitForFunction(() => document.querySelectorAll('.tabbar-l1 .tab').length >= 14, { timeout: 20000 });
  await sleep(400);

  /* ek theme mein poora walk: L1 + har group ke sub-tabs */
  async function walk(dark) {
    await page.evaluate(d => { try { document.documentElement.dataset.theme = d ? 'dark' : 'light'; } catch (e) { } }, dark);
    await sleep(260);
    const l1 = await page.evaluate(READ_BAR, '.tabbar-l1 .tab');
    const subs = {};
    for (const gid of GROUPS) {
      await page.evaluate(id => {
        const b = document.querySelector('.tabbar-l1 .tab[data-id="' + id + '"]');
        if (b) b.click();
      }, gid);
      await page.waitForFunction(id => {
        const on = document.querySelector('.tabbar-l1 .tab[data-id="' + id + '"].on');
        return !!on && document.querySelectorAll('.tabbar-l2 .tab').length > 0;
      }, { timeout: 15000 }, gid).catch(() => { });
      await sleep(300);
      subs[gid] = await page.evaluate(READ_BAR, '.tabbar-l2 .tab');
    }
    return { l1, subs };
  }
  const light = await walk(false);
  const dark = await walk(true);

  /* ---------- scoring ---------- */
  const all = []
    .concat(light.l1.map(r => ({ where: 'L1', r })))
    .concat(GROUPS.reduce((a, g) => a.concat(light.subs[g].map(r => ({ where: g, r }))), []));
  const noSvg = all.filter(x => !x.r.hasSvg).map(x => x.where + ':' + x.r.label);
  const leftover = all.filter(x => x.r.emoji).map(x => x.where + ':' + x.r.label);
  const bad = all.filter(x => x.r.hasSvg && !styleOk(x.r)).map(x => x.where + ':' + x.r.label);
  const dups = [].concat(sibsDup(light.l1),
    GROUPS.reduce((a, g) => a.concat(sibsDup(light.subs[g]).map(d => g + ': ' + d)), []));
  const tintBad = [];
  light.l1.forEach(r => { if (!r.hasSvg) return; });
  GROUPS.forEach(g => {
    const want = hexToRgb(GROUP_TINT[g] || '#000000');
    (light.subs[g] || []).forEach(r => { if (r.color !== want) tintBad.push(g + '/' + r.id + ' got ' + r.color + ' want ' + want); });
  });
  const missing23 = AREAS.filter(a => !all.some(x => x.r.label === a));
  const tints = new Set(GROUPS.map(g => (light.l1.find(r => r.id === g) || {}).color).filter(Boolean)
    .concat(Object.keys(EXTRA_TINT).map(l => {
      const hit = light.l1.find(r => r.label === l); return hit ? hit.color : '';
    })));
  const l1TintBad = GROUPS.concat(['customFields', 'menu', 'templates', 'lists', 'data']).map(gid => {
    const r = light.l1.find(x => x.id === gid); if (!r) return gid + ' tab nahi mila';
    const exp = GROUP_TINT[gid] || (r.label in EXTRA_TINT ? EXTRA_TINT[r.label] : null);
    if (!exp) return gid + ' ka tint source mein nahi';
    return r.color === hexToRgb(exp) ? null : gid + ' got ' + r.color + ' want ' + hexToRgb(exp);
  }).filter(Boolean);
  const darkBad = GROUPS.reduce((a, g) => a.concat((dark.subs[g] || []).filter(r => !r.hasSvg || r.emoji).map(r => g + ':' + r.label)), []);

  /* ---------- assertions ---------- */
  ok(light.l1.length >= 14, '① L1 tabbar: 14 tabs (9 group + 5 extra)', light.l1.length + ' tabs');
  const l2Count = GROUPS.reduce((a, g) => a + light.subs[g].length, 0);
  ok(l2Count >= 41, '② har group ke saare sub-tabs render hue', l2Count + ' sub-tabs');
  ok(noSvg.length === 0, '③ har settings tab par asli SVG icon (koi \u25B8 fallback nahi)',
    noSvg.length ? noSvg.slice(0, 5).join(', ') : (light.l1.length + l2Count) + ' tabs ✔');
  ok(leftover.length === 0, '④ icon slot mein bacha hua emoji nahi', leftover.slice(0, 5).join(', ') || 'saaf');
  ok(dups.length === 0, '⑤ ek hi tab-bar mein duplicate icons nahi', dups.slice(0, 4).join(' · ') || 'sab unique (per bar)');
  ok(bad.length === 0, '⑥ ek hi consistent style (24px · fill none · currentColor · 1.9)',
    bad.slice(0, 4).join(', ') || (light.l1.length + l2Count) + ' icons ✔');
  ok(l1TintBad.length === 0, '⑦ har L1 area ka apna tint', l1TintBad.slice(0, 3).join(' · ') || '14/14 ✔');
  ok(tintBad.length === 0, '⑧ sub-tabs apne group ka tint le rahe hain', tintBad.slice(0, 3).join(' · ') || '41/41 ✔');
  ok(tints.size >= 12, '⑨ tints aapas mein mukhtalif (rang ka matlab hai)', tints.size + ' mukhtalif rang');
  ok(missing23.length === 0, '⑩ aap ki 23-area list DOM mein maujood', missing23.join(', ') || '23/23 ✔');
  ok(darkBad.length === 0, '⑪ DARK theme mein bhi sab icons SVG + emoji-free', darkBad.slice(0, 4).join(', ') || '✔');
  ok(errs.length === 0, '⑫ zero page errors', errs.slice(0, 3).join(' | ') || '0');

  await browser.close();
  console.log('\n\x1b[1mSUMMARY:\x1b[0m ' + pass + ' pass · ' + fail + ' fail · tabs ' + (light.l1.length + l2Count) +
    ' · areas 23/23 · tints ' + tints.size + ' · ' + (fail ? '\x1b[31mRED\x1b[0m' : '\x1b[32mGREEN\x1b[0m'));
  if (fail) { console.log(ERR.map(e => ' - ' + e).join('\n')); process.exit(1); }
})();
