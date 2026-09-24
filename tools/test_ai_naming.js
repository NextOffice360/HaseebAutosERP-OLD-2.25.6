/**
 * tools/test_ai_naming.js — v2.30.0 (N7) "MOCK" ka naam/sharafat gate
 * ============================================================================
 * Aap ki shart: feature 100% local (no LLM) hai to wahi naam/description do —
 * "Local Data Assistant". Capabilities/limits honestly documented. LLM ka dawa
 * hargiz nahi. Title/settings/help/UI sab jagah consistent.
 *
 *   PART 1 — static + backend truth:
 *     ① adapter meta.label === 'Local Data Assistant' (+ caps.llm === false)
 *     ② can/cannot lists mojood aur khaali nahi (honest docs ka source)
 *     ③ AI.gs catalog ki entry ka naam LLM ka dawa nahi karta (no "Mock (offline…")
 *     ④ Config.gs: aiProvider ki options ADAPTERS se aati hain (optionsFrom) aur
 *        settings ka fallback label "Local Data Assistant" kehta hai
 *     ⑤ UI files mein user-facing "Mock …" string bachi nahi (internal ids chalti hain)
 *     ⑥ `ai.agentConfig` provider meta frontend ko bhejta hai (label + can/cannot)
 *     ⑦ rendered names: defs() ke optionLabels mein 'MOCK' → 'Local Data Assistant'
 *
 *   PART 2 — rendered DOM (demo): AI screen + Settings ▸ Automation ▸ AI assistant
 *     ⑧ AI screen par capability card + "Local Data Assistant" nazar aata hai
 *     ⑨ user ko kahin "Mock" (LLM ka gumaan dene wala naam) nazar nahi aata
 *     ⑩ Settings ke provider dropdown ka option text Local Data Assistant hai
 *     ⑪ zero page errors
 *
 *   node tools/test_ai_naming.js [http://127.0.0.1:8021/]      (~45s)
 */
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const { loadBackend } = require('./mock_gs');
let pass = 0, fail = 0; const ERR = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✔', name); }
  else { fail++; const m = '  ✖ ' + name + (extra ? '  → ' + extra : ''); ERR.push(name); console.log(m); }
}
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

console.log('\n\x1b[1mPART 1 — static + backend: naam aur sharafat\x1b[0m');

/* ①②③ backend truth — asli .gs code chalta hua */
const { sandbox: s } = loadBackend(path.join(ROOT, 'apps-script'));
s.Setup.setupAll();
const provs = s.AI.providers();
const mock = provs.filter(p => p.id === 'MOCK')[0] || {};   /* AI.providers() meta ko flatten karta hai */
ok(mock.label === 'Local Data Assistant',
  '① adapter meta.label = "Local Data Assistant"', String(mock.label));
ok(mock.caps && mock.caps.llm === false,
  '①b caps.llm === false (koi LLM nahi — backend khud kehta hai)', JSON.stringify(mock.caps));
ok((mock.can || []).length >= 3 && (mock.cannot || []).length >= 3,
  '② can/cannot lists mojood (honest docs ka source)',
  'can=' + (mock.can || []).length + ' cannot=' + (mock.cannot || []).length);

const cat = s.AI.catalog('MOCK');
const catLabel = (cat[0] || {}).label || '';
ok(!/^mock\b/i.test(catLabel) && !/mock/i.test(catLabel),
  '③ catalog entry ka naam "Mock" nahi, LLM ka dawa nahi karta', catLabel + ' · ' + ((cat[0] || {}).note || ''));

/* ④ settings ki list adapters se aati hai (labels samet) */
const defs = s.Config.defs();
const aiSub = ((defs.filter(g => g.id === 'automation')[0] || {}).sub || [])
  .filter(t => t.id === 'ai')[0] || {};
const provField = (aiSub.fields || []).filter(f => f.key === 'aiProvider')[0] || {};
const fbField = (aiSub.fields || []).filter(f => f.key === 'aiFallbackMock')[0] || {};
ok(!!(provField.optionLabels && provField.optionLabels.MOCK === 'Local Data Assistant'),
  '④ provider dropdown ka label adapters se aata hai (optionsFrom)',
  JSON.stringify(provField.optionLabels));
ok(provField.options && provField.options.indexOf('MOCK') > -1 && provField.options.indexOf('GEMINI') > -1,
  '④b option VALUES waise hi (purani settings/behaviour safe)', JSON.stringify(provField.options));
ok(/Local Data Assistant/i.test(String(fbField.label || '')),
  '④c settings ka fallback label saaf hai (koi "MOCK mode" nahi)', String(fbField.label));

/* ⑤ UI files mein user-facing "Mock …" string bachi nahi */
const uiFiles = ['App_AI.html', 'App_AIConfig.html', 'App_Config.html', 'App_Core.html', 'App_UI2.html'];
const leftovers = [];
uiFiles.forEach(f => {
  read('apps-script/' + f).split('\n').forEach((l, i) => {
    /* jis line par user ko dikhne wala text ho aur "Mock" likha ho — wo galat hai.
       Internal ids ('MOCK'), comments aur demo-transport (MockAPI) allowed hain. */
    const isComment = /^\s*(\/\*|\*|\/\/)/.test(l);
    const code = l.replace(/\/\*[\s\S]*?\*\//g, '');
    if (isComment) return;
    if (/MockAPI|window\.MockAPI/.test(code)) return;
    if (/'[^']*Mock [^']*'|"[^"]*Mock [^"]*"|`[^`]*Mock [^`]*`/.test(code)) leftovers.push(f + ':' + (i + 1) + ' ' + code.trim().slice(0, 80));
    else if (/>[^<]*Mock [^<]*</.test(code)) leftovers.push(f + ':' + (i + 1) + ' ' + code.trim().slice(0, 80));
  });
});
ok(leftovers.length === 0, '⑤ user-facing "Mock …" string kahin nahi bachi',
  leftovers.slice(0, 4).join(' | ') || 'saf');

/* ⑥ agentConfig meta frontend tak */
const cfg = s.AI.agentConfig(s.DB.all('Users').filter(u => u.username === 'owner')[0] ? { user: s.DB.all('Users').filter(u => u.username === 'owner')[0], permissions: ['*'] } : {});
const cfgMock = (cfg.providers || []).filter(p => p.id === 'MOCK')[0] || {};
ok(Array.isArray(cfg.providers) && cfg.providers.length >= 4 && !!cfgMock.label && (cfgMock.can || []).length >= 3,
  '⑥ ai.agentConfig providers meta (label + can/cannot) bhejta hai — UI ka naam ek hi source se',
  'providers=' + (cfg.providers || []).length + ' · mock.label=' + cfgMock.label);

/* ============================== PART 2 — DOM ============================== */
(async () => {
  const puppeteer = require('puppeteer');
  const TARGET = process.argv[2] || ('file://' + path.join(ROOT, 'demo', 'index.html'));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const clickSel = sel => page.evaluate(x => { const e = document.querySelector(x); if (!e) throw new Error('missing ' + x); e.click(); }, sel);
  console.log('\n\x1b[1mPART 2 — rendered DOM: AI screen + settings dropdown\x1b[0m');
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e.message).slice(0, 130)));
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(TARGET, { waitUntil: 'networkidle2', timeout: 45000 });
  if (await page.$('#lgUser')) {
    await page.click('#lgUser'); await page.type('#lgUser', 'owner');
    await page.click('#lgPass'); await page.type('#lgPass', 'admin123');
    await page.keyboard.press('Enter');
  }
  await page.waitForFunction(() => window.App && App.state && App.state.session, { timeout: 20000 });
  await sleep(1500);

  /* AI screen */
  await page.evaluate(async () => { App._noDirtyGuard = true; App.go('ai'); await new Promise(r => setTimeout(r, 1200)); App._noDirtyGuard = false; });
  await sleep(2200);
  const ai = await page.evaluate(() => {
    const txt = (document.querySelector('#view') || document.body).textContent || '';
    const card = document.getElementById('aiCapCard');
    return { hasCard: !!card, cardTxt: card ? (card.textContent || '').slice(0, 240) : '',
      hasName: txt.indexOf('Local Data Assistant') > -1,
      mockHits: (txt.match(/\bMock\b/g) || []).length, screen: App.current };
  });
  ok(ai.screen === 'ai' && ai.hasCard, '⑧ AI screen par capability card mojood', 'screen=' + ai.screen + ' card=' + ai.hasCard);
  ok(ai.hasName, '⑧b "Local Data Assistant" naam UI par nazar aata hai', ai.cardTxt.slice(0, 120));
  ok(ai.mockHits === 0, '⑨ user ko kahin "Mock" nazar nahi aata (LLM ka gumaan nahi)', 'hits=' + ai.mockHits);

  /* capability card honest content — branch-aware:
     demo ka default provider GEMINI hai (bahar ka LLM) → card wahan LLM-warn karta hai;
     LOCAL branch (provider=MOCK) ka can/cannot card neeche alag step mein aazmaya jata hai. */
  const cap = await page.evaluate(() => {
    const c = document.getElementById('aiCapCard');
    if (!c) return null;
    const lists = Array.from(c.querySelectorAll('.cap-list')).map(u => u.querySelectorAll('li').length);
    return { lists: lists, text: (c.textContent || '') };
  });
  ok(cap && cap.lists.length >= 2 && cap.lists.every(n => n >= 2),
    '⑧c card mein dono lists (kar sakta / nahi ya dhyan) bhare hue', JSON.stringify(cap && cap.lists));
  ok(cap && /LLM/i.test(cap.text) && !/mock/i.test(cap.text),
    '⑧d LLM provider par card saaf LLM-warn karta hai (koi Mock lafz nahi)', cap ? 'ok' : 'no card');

  /* LOCAL branch — ASLI user path: Settings ▸ AI assistant ▸ Provider = Local Data
     Assistant ▸ Save. AI screen purana config NA dikhae (stale-provider refetch). */
  await page.evaluate(() => { App._noDirtyGuard = true; App.go('settings'); });
  await page.waitForFunction(() => document.querySelectorAll('.tabbar-l1 .tab').length >= 14, { timeout: 20000 });
  await sleep(900);
  await page.evaluate(() => {
    const t = Array.from(document.querySelectorAll('.tabbar-l1 .tab')).find(x => /automation/i.test(x.textContent || ''));
    if (t) t.click();
  });
  await sleep(1400);
  await page.evaluate(() => {
    const t = Array.from(document.querySelectorAll('.tabbar-l2 .tab')).find(x => /^AI|assistant/i.test((x.textContent || '').trim()));
    if (t) t.click();
  });
  await sleep(1500);
  const setProv = await page.evaluate(() => {
    const s2 = document.getElementById('f_aiProvider');
    if (!s2) return false;
    s2.value = 'MOCK';
    s2.dispatchEvent(new Event('change', { bubbles: true }));
    s2.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  });
  ok(setProv, '⑧h settings form mein provider select hua (MOCK)', String(setProv));
  const saved = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('#view button')).find(x => /^Save /.test((x.textContent || '').trim()));
    if (!b) return 'save-button-nahi-mila';
    b.click();
    return 'clicked:' + (b.textContent || '').trim().slice(0, 30);
  });
  await sleep(2500);
  const settingsNow = await page.evaluate(() => String((App.state.settings || {}).aiProvider || ''));
  ok(settingsNow === 'MOCK', '⑧i settings save ke baad runtime provider = MOCK', settingsNow || '(khali)');
  /* AI screen wapas — stale refetch ab LOCAL dikhaye */
  await page.evaluate(() => { App._noDirtyGuard = true; App.go('ai'); });
  await sleep(2500);
  const loc = await page.evaluate(() => {
    const c = document.getElementById('aiCapCard');
    if (!c) return null;
    const lists = Array.from(c.querySelectorAll('.cap-list')).map(u => u.querySelectorAll('li').length);
    return { lists: lists, text: (c.textContent || '') };
  });
  ok(loc && /LOCAL rules engine/i.test(loc.text),
    '⑧e LOCAL branch: card kehta hai "app ka apna LOCAL rules engine"', loc ? (loc.text || '').slice(0, 90) : 'no card');
  ok(loc && loc.lists.length >= 2 && loc.lists.every(n => n >= 3),
    '⑧f LOCAL branch: "kar sakta hai / nahi kar sakta" dono lists bhare hue', JSON.stringify(loc && loc.lists));
  ok(loc && /LLM/i.test(loc.text) && !/mock/i.test(loc.text),
    '⑧g LOCAL branch: honestly "koi LLM nahi" (na Mock, na AI ka dawa)', loc ? 'ok' : 'no card');
  /* wapas GEMINI (usi settings path se) — demo default halat bahal */
  await page.evaluate(() => { App._noDirtyGuard = true; App.go('settings'); });
  await page.waitForFunction(() => document.querySelectorAll('.tabbar-l1 .tab').length >= 14, { timeout: 20000 });
  await sleep(900);
  await page.evaluate(() => {
    const t = Array.from(document.querySelectorAll('.tabbar-l1 .tab')).find(x => /automation/i.test(x.textContent || ''));
    if (t) t.click();
  });
  await sleep(1400);
  await page.evaluate(() => {
    const t = Array.from(document.querySelectorAll('.tabbar-l2 .tab')).find(x => /^AI|assistant/i.test((x.textContent || '').trim()));
    if (t) t.click();
  });
  await sleep(1500);
  await page.evaluate(() => {
    const s2 = document.getElementById('f_aiProvider');
    if (s2) { s2.value = 'GEMINI'; s2.dispatchEvent(new Event('change', { bubbles: true })); s2.dispatchEvent(new Event('input', { bubbles: true })); }
    const b = Array.from(document.querySelectorAll('#view button')).find(x => /^Save /.test((x.textContent || '').trim()));
    if (b) b.click();
  });
  await sleep(2200);
  const backNow = await page.evaluate(() => String((App.state.settings || {}).aiProvider || ''));
  ok(backNow === 'GEMINI', '⑧j wapas GEMINI (demo default bahal)', backNow || '(khali)');

  /* Settings ▸ Automation ▸ AI assistant — provider dropdown labels */
  await page.evaluate(() => { App._noDirtyGuard = true; App.go('settings'); });
  await page.waitForFunction(() => document.querySelectorAll('.tabbar-l1 .tab').length >= 14, { timeout: 20000 });
  await sleep(900);
  await page.evaluate(() => {
    const t = Array.from(document.querySelectorAll('.tabbar-l1 .tab')).find(x => /automation|AI/i.test(x.textContent || ''));
    if (t) t.click();
  });
  await sleep(1500);
  await page.evaluate(() => {
    const t = Array.from(document.querySelectorAll('.tabbar-l2 .tab')).find(x => /^AI|assistant/i.test((x.textContent || '').trim()));
    if (t) t.click();
  });
  await sleep(1500);
  const sel = await page.evaluate(() => {
    const s2 = document.getElementById('f_aiProvider');
    if (!s2) return { err: 'settings mein provider select nahi mila' };
    return { opts: Array.from(s2.options).map(o => o.value + '=' + o.textContent.trim()) };
  });
  ok(!sel.err && sel.opts.some(o => o === 'MOCK=Local Data Assistant'),
    '⑩ settings ke dropdown mein MOCK ka label "Local Data Assistant" hai', sel.err || sel.opts.join(' | '));
  ok(!sel.err && sel.opts.filter(o => /^Mock/i.test(o.split('=')[1] || '')).length === 0,
    '⑩b dropdown mein kahin "Mock" nahi', sel.err || sel.opts.join(' | '));

  ok(errs.length === 0, '⑪ zero page errors', errs.slice(0, 3).join(' | ') || '0');

  await browser.close();
  console.log('\n\x1b[1mSUMMARY:\x1b[0m ' + pass + ' pass · ' + fail + ' fail · ' + (fail ? '\x1b[31mRED\x1b[0m' : '\x1b[32mGREEN\x1b[0m'));
  if (fail) { console.log(ERR.map(e => ' - ' + e).join('\n')); process.exit(1); }
})();
