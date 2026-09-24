#!/usr/bin/env node
/**
 * tools/test_datetime.js — W4 GATE (spec Part-1 §8 · §18 #6)
 * ---------------------------------------------------------------------------
 * Spec: "reusable global date/time system … date only / time only / date+time /
 * full timestamp · 12h/24h · seconds on/off · timezone · configurable display ·
 * configurable visibility … same reusable configuration throughout the app."
 *
 * Proofs:
 *   A. BACKEND (U.disp/U.stamp) — har setting ka asar, aur display format
 *      settings se aata hai (hard-coded nahi).
 *   B. STORAGE integrity — stored wall-clock strings tz se shift nahi hote,
 *      magar asli instant (new Date()) configured timezone mein dikhta hai.
 *   C. FRONTEND DT — backend ke sath EXACT parity (wahi config, wahi output).
 *   D. RENDERED DOM — UI2.stampRow detail view mein "Created: … , HH:MM:SS"
 *      dikhata hai; `dt.showRecords=false` par DOM mein stamps hi nahi.
 *   E. Settings + route contracts (Schema/Config/system.dtconfig).
 *
 *   node tools/test_datetime.js
 */
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const { loadBackend } = require('./mock_gs');

let pass = 0, fail = 0; const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  \u2714 ' + name); }
  else { fail++; failures.push(name + (detail ? ' \u2192 ' + detail : '')); console.log('  \u2716 ' + name + (detail ? '  \u2192 ' + detail : '')); }
}
const section = t => console.log('\n\x1b[1m' + t + '\x1b[0m');

const sb = loadBackend(path.join(ROOT, 'apps-script'));
sb.sandbox.Logger.log = () => { };
const { api, Setup, U } = sb.sandbox;
Setup.setupAll(); Setup.seedAll();

const login = (u, p) => { const r = api('auth.login', { username: u, password: p }); return r.ok ? r.data.token : null; };
const T = login('owner', 'admin123');
ok('owner login (backend context tayyar)', !!T);

const setCfg = values => { const r = api('config.save', { token: T, values }); if (!r.ok) throw new Error('config.save: ' + JSON.stringify(r.error)); };
const reset = () => setCfg({ 'dt.format': 'datetime', 'dt.dateStyle': 'DD MMM YYYY', 'dt.hour12': 'false',
  'dt.seconds': 'false', 'dt.showTime': 'true', 'dt.showRecords': 'true', timezone: 'Asia/Karachi' });

const WALL = '2026-09-23T10:42:31';      /* stored wall-clock (local) */
const WALL_SHORT = '2026-09-23T10:42';

section('A ▸ BACKEND — settings se chalti display (hard-coded nahi)');
reset();
ok('default: date + time, 24h, bina seconds', U.disp(WALL, 'auto') === '23 Sep 2026, 10:42', U.disp(WALL, 'auto'));
ok('stamp mode: poora timestamp (seconds ke sath)', U.disp(WALL, 'stamp') === '23 Sep 2026, 10:42:31', U.disp(WALL, 'stamp'));
ok('date-only mode', U.disp(WALL, 'date') === '23 Sep 2026', U.disp(WALL, 'date'));
ok('time-only mode', U.disp(WALL, 'time') === '10:42', U.disp(WALL, 'time'));

setCfg({ 'dt.seconds': 'true' });
ok('setting: seconds ON → 10:42:31', U.disp(WALL, 'auto') === '23 Sep 2026, 10:42:31', U.disp(WALL, 'auto'));
setCfg({ 'dt.seconds': 'false', 'dt.hour12': 'true' });
ok('setting: 12-ghante → 10:42 am', U.disp(WALL, 'auto') === '23 Sep 2026, 10:42 am', U.disp(WALL, 'auto'));
ok('12-ghante: dopahar 12:05 → 12:05 pm', U.disp('2026-09-23T12:05:00', 'auto') === '23 Sep 2026, 12:05 pm', U.disp('2026-09-23T12:05:00', 'auto'));
ok('12-ghante: raat 00:05 → 12:05 am', U.disp('2026-09-23T00:05:00', 'auto') === '23 Sep 2026, 12:05 am', U.disp('2026-09-23T00:05:00', 'auto'));

setCfg({ 'dt.hour12': 'false', 'dt.dateStyle': 'YYYY-MM-DD' });
ok('setting: dateStyle YYYY-MM-DD', U.disp(WALL, 'auto') === '2026-09-23, 10:42', U.disp(WALL, 'auto'));
setCfg({ 'dt.dateStyle': 'DD/MM/YYYY' });
ok('setting: dateStyle DD/MM/YYYY', U.disp(WALL, 'auto') === '23/09/2026, 10:42', U.disp(WALL, 'auto'));

setCfg({ 'dt.dateStyle': 'DD MMM YYYY', 'dt.format': 'date' });
ok('setting: format=date → poore app mein sirf tareekh', U.disp(WALL, 'auto') === '23 Sep 2026', U.disp(WALL, 'auto'));
ok('…magar explicit stamp mode apni jagah poora rehta hai', U.disp(WALL, 'stamp') === '23 Sep 2026, 10:42:31');

section('A2 ▸ global visibility switch (spec: "global on/off option")');
setCfg({ 'dt.showTime': 'false', 'dt.format': 'datetime' });
ok('showTime OFF → datetime par bhi sirf tareekh', U.disp(WALL, 'auto') === '23 Sep 2026', U.disp(WALL, 'auto'));
ok('showTime OFF → stamp par bhi waqt gayab', U.disp(WALL, 'stamp') === '23 Sep 2026', U.disp(WALL, 'stamp'));
ok('showTime OFF → time mode bhi date par gir jata hai', U.disp(WALL, 'time') === '23 Sep 2026', U.disp(WALL, 'time'));
reset();
ok('switch ON → waqt wapas', U.disp(WALL, 'auto') === '23 Sep 2026, 10:42');

section('B ▸ timezone handling + storage integrity');
setCfg({ timezone: 'Asia/Karachi' });
const instant = new Date(Date.UTC(2026, 8, 23, 5, 42, 31));      /* 05:42 UTC = 10:42 PKT */
ok('asli instant → configured tz (Asia/Karachi) mein 10:42', U.disp(instant, 'stamp') === '23 Sep 2026, 10:42:31', U.disp(instant, 'stamp'));
setCfg({ timezone: 'UTC' });
ok('timezone badla → wahi instant ab UTC (05:42)', U.disp(instant, 'stamp') === '23 Sep 2026, 05:42:31', U.disp(instant, 'stamp'));
ok('stored wall-clock string tz se SHIFT nahi hota (data integrity)', U.disp(WALL, 'stamp') === '23 Sep 2026, 10:42:31', U.disp(WALL, 'stamp'));
reset();

section('B2 ▸ record stamps (Created / Updated)');
const rec = { id: 'X1', createdAt: '2026-09-23T10:42:31', updatedAt: '2026-09-23T11:18:07' };
let st = U.stamp(rec);
ok('stamp() created ko poora deta hai (spec example jaisa)', st.created === '23 Sep 2026, 10:42:31', st.created);
ok('stamp() updated bhi deta hai', st.updated === '23 Sep 2026, 11:18:07', st.updated);
setCfg({ 'dt.showRecords': 'false' });
ok('showRecords OFF → stamps ki ijazat nahi (global on/off)', U.stamp(rec).show === false);
reset();

section('C ▸ FRONTEND ↔ BACKEND parity (ek hi system, do implementation nahi)');
const { JSDOM } = require('jsdom');
const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'demo/index.html'), 'utf8'),
  { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' });
const win = dom.window;
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  for (let i = 0; i < 60 && !(win.DT && win.App && win.App.state); i++) await wait(120);
  ok('demo build mein DT + App mojood', !!(win.DT && win.App && win.App.state));

  const configs = [
    { format: 'datetime', dateStyle: 'DD MMM YYYY', hour12: false, seconds: false, showTime: true, tz: 'Asia/Karachi' },
    { format: 'datetime', dateStyle: 'DD MMM YYYY', hour12: true, seconds: true, showTime: true, tz: 'Asia/Karachi' },
    { format: 'date', dateStyle: 'YYYY-MM-DD', hour12: false, seconds: false, showTime: true, tz: 'UTC' },
    { format: 'stamp', dateStyle: 'DD/MM/YYYY', hour12: true, seconds: false, showTime: true, tz: 'Asia/Karachi' },
    { format: 'datetime', dateStyle: 'DD MMM YYYY', hour12: false, seconds: true, showTime: false, tz: 'Asia/Karachi' }
  ];
  const values = [WALL, WALL_SHORT, '2026-01-05T00:05:00', instant];
  let mismatches = [];
  configs.forEach((c, ci) => {
    win.App.state.dt = c;
    /* backend ko bhi bilkul wahi config dein */
    values.forEach((v, vi) => {
      ['auto', 'date', 'time', 'datetime', 'stamp'].forEach(mode => {
        const fe = win.DT.format(v, mode);
        const be = U.disp(v, mode, c);            /* cfg directly pass — same object */
        if (fe !== be) mismatches.push('cfg' + ci + ' v' + vi + ' ' + mode + ': FE="' + fe + '" BE="' + be + '"');
      });
    });
  });
  ok('har config × har mode par frontend = backend output', mismatches.length === 0,
    mismatches.slice(0, 3).join(' | ') + (mismatches.length > 3 ? ' …+' + (mismatches.length - 3) : ''));

  section('C2 ▸ fmt.date delegation (92 purane call-sites apne aap naye system par)');
  const v = '2026-09-23T10:42:31';
  win.App.state.dt = { format: 'datetime', dateStyle: 'DD MMM YYYY', hour12: false, seconds: false, showTime: true, tz: 'Asia/Karachi' };
  ok('fmt.date(v) → date-only wahi policy', win.fmt.date(v) === win.DT.format(v, 'date'), win.fmt.date(v));
  ok('fmt.date(v, true) → date+time wahi policy', win.fmt.date(v, true) === win.DT.format(v, 'datetime'), win.fmt.date(v, true));
  ok('fmt.dt(v) → poora timestamp (seconds)', win.fmt.dt(v) === '23 Sep 2026, 10:42:31', win.fmt.dt(v));

  section('D ▸ RENDERED DOM — detail view par Created/Updated');
  const host = win.document.createElement('div');
  win.document.body.appendChild(host);
  const row = { id: 'I1', name: 'Brake Pad', createdAt: '2026-09-23T10:42:31', updatedAt: '2026-09-23T11:18:07' };

  win.App.state.dt = { format: 'datetime', dateStyle: 'DD MMM YYYY', hour12: false, seconds: false, showTime: true, showRecords: true, tz: 'Asia/Karachi' };
  host.innerHTML = '';
  const el1 = win.UI2.stampRow(row);
  if (el1) host.appendChild(el1);
  const domText = host.textContent;
  ok('stampRow "Created: 23 Sep 2026, 10:42:31" render karta hai', /Created: 23 Sep 2026, 10:42:31/.test(domText), domText.slice(0, 90));
  ok('update ka timestamp bhi', /Updated: 23 Sep 2026, 11:18:07/.test(domText));
  ok('element data-dt-stamp se mark hai (probe-able)', !!host.querySelector('[data-dt-stamp]'));

  win.App.state.dt = { format: 'datetime', dateStyle: 'DD MMM YYYY', hour12: false, seconds: false, showTime: true, showRecords: false, tz: 'Asia/Karachi' };
  ok('showRecords OFF → stampRow null deta hai (kuch render nahi)', win.UI2.stampRow(row) === null);
  ok('…aur DT.stampLine bhi khaali', win.DT.stampLine(row) === '');

  /* NEGATIVE PROOF (pre-fix behaviour ka ulta): showTime=false par DOM mein waqt nahi */
  win.App.state.dt = { format: 'datetime', dateStyle: 'DD MMM YYYY', hour12: false, seconds: false, showTime: false, showRecords: true, tz: 'Asia/Karachi' };
  const el2 = win.UI2.stampRow(row);
  const t2 = el2 ? el2.textContent : '';
  ok('showTime OFF → DOM mein waqt nahi (sirf 23 Sep 2026)', /Created: 23 Sep 2026\b/.test(t2) && !/10:42/.test(t2), t2.slice(0, 80));

  section('E ▸ settings + route contracts');
  const schemaSrc = fs.readFileSync(path.join(ROOT, 'apps-script/Schema.gs'), 'utf8');
  const cfgSrc = fs.readFileSync(path.join(ROOT, 'apps-script/Config.gs'), 'utf8');
  ['dt.format', 'dt.dateStyle', 'dt.hour12', 'dt.seconds', 'dt.showTime', 'dt.showRecords'].forEach(k => {
    ok('setting key mojood: ' + k, schemaSrc.indexOf("'" + k + "'") > -1 && cfgSrc.indexOf("'" + k + "'") > -1);
  });
  ok('timezone default Asia/Karachi (DEFAULT_SETTINGS)', /timezone: 'Asia\/Karachi'/.test(schemaSrc));
  const dtc = api('system.dtconfig', { token: T });
  ok('system.dtconfig route chalti hai aur poora config deti hai',
    dtc.ok && dtc.data && dtc.data.tz && dtc.data.format && dtc.data.dateStyle !== undefined,
    dtc.ok ? JSON.stringify(dtc.data) : JSON.stringify(dtc.error));
  ok('stampRow App_UI2 mein define + 3 detail views mein adopt',
    /UI2\.stampRow = function/.test(fs.readFileSync(path.join(ROOT, 'apps-script/App_UI2.html'), 'utf8')) &&
    ['App_Masters.html', 'App_Screens2.html'].every(f => /UI2\.stampRow\(/.test(fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf8'))));

  section('F ▸ page errors');
  const errs = [];
  win.addEventListener('error', e => errs.push(e.message));
  await wait(300);
  ok('zero page errors', errs.length === 0, errs.slice(0, 2).join(' | '));

  console.log('\n' + (fail === 0 ? '\x1b[32m' : '\x1b[31m') + 'W4 DATE/TIME GATE: ' + pass + ' pass / ' + fail + ' fail\x1b[0m');
  if (fail) { console.log('\nFAILED:'); failures.forEach(f => console.log('  - ' + f)); }
  process.exit(fail ? 1 : 0);
})();
