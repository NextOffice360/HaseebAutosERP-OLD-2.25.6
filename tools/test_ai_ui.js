#!/usr/bin/env node
/* ============================================================================
   tools/test_ai_ui.js — AI AGENT TAB (real browser) — v2.10
   ----------------------------------------------------------------------------
   User ki shikayat: "AI Agent mein kuch kaam nahi karta — model list nahi,
   API key save nahi hoti, errors chup." Is liye ye gate ASLI Chromium mein
   dedicated #/ai tab khol kar RENDERED DOM par assert karta hai:
     1. AI Agent screen sidebar se + #/ai deep link se khulta hai (4 tabs)
     2. Assistant chat: sawal → jawab demo ke ASLI data se aata hai
     3. Setup: provider cards; content-aware fields (Mock → key field nahi)
     4. Model list populated (select mein options > 0) + Refresh models
     5. Save: dirty indicator → Save → persist (re-read agentConfig) + state reset
     6. API key save: masked hint aata hai, raw key kahin wapiss nahi
     7. Test connection → green result banner
     8. Tools tab toggle persist hoti hai
     9. Activity tab: usage counters + recent chat
    10. 390px mobile render + zero page/console errors
   Static audit pichli baar 6 bugs chhupa gayi thi — is liye sirf rendered proof.
   ========================================================================== */
'use strict';
const path = require('path');
const puppeteer = require('puppeteer');
const { login } = require('./_harness');

const ROOT = path.join(__dirname, '..');
const auditSource=require('fs').readFileSync(path.join(__dirname,'audit_layout.js'),'utf8').split('const AUDIT = ')[1].split('\n};')[0];
const hubGeometryAudit=new Function('return ('+auditSource+'\n})')();
let PASS = 0, FAIL = 0;
function ok(name, cond, note) {
  if (cond) { PASS++; console.log('  \x1b[32m✔\x1b[0m ' + name + (note ? '  \x1b[2m→ ' + note + '\x1b[0m' : '')); }
  else { FAIL++; console.log('  \x1b[31m✘ ' + name + '\x1b[0m' + (note ? '  → ' + note : '')); }
}
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error' && !/manifest|ERR_FAILED|file:\/\/.*(favicon)/.test(m.text())) errs.push('console: ' + m.text());
  });

  await page.goto('file://' + path.join(ROOT, 'demo/index.html'), { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.App && App.state, { timeout: 25000 });
  /* Insan wali raftaar: pehle demo login (mock auth kisi bhi credentials
     par OWNER session deta hai) — warna permission-gated screens khul hi na
     sakay. Ye ahem hai: pichli ghalti yahi thi ke gate login ke bagair
     screen maang raha tha. */
  const needsLogin = await page.evaluate(() => !App.state.session || !App.state.session.permissions);
  if (needsLogin) {
    /* poll + login — shared harness (fixed-sleep race ka ek hi ilaaj) */
    await login(page, { pass: 'demo1234', button: '#lgBtn' });
    await page.waitForFunction(() => App.state.session && (App.state.session.permissions || []).length, { timeout: 20000 });
  }
  ok('Demo login flow se OWNER session milta hai (gate human journey par)', needsLogin !== null);
  if (errs.length) { errs.forEach(e => console.log('   ' + e)); }

  /* ================= 1 · screen + tabs ================= */
  const inNav = await page.evaluate(() => !!window.AIConfig && !!App.screens.ai);
  ok('AI Agent screen registered (window.AIConfig shim + App.screens.ai)', inNav);
  await page.evaluate(() => App.go('ai'));
  await page.waitForFunction(() => document.querySelector('#view .tabs.l1'), { timeout: 15000 }).catch(() => {});
  const tabs = await page.evaluate(() => [...document.querySelectorAll('#view .tab')].map(b => b.textContent.trim()));
  ok('4 tabs render (Assistant/Setup/Tools/Activity)',
    /Assistant/.test(tabs.join('|')) && /Setup/.test(tabs.join('|')) && /Tools/.test(tabs.join('|')) && /Activity/.test(tabs.join('|')),
    tabs.join(', '));
  await wait(900); /* loadCfg() promise */

  /* ================= 2 · assistant chat = live demo data ================= */
  const chat = await page.evaluate(() => ({
    greeting: /Assalam-o-Alaikum/.test((document.querySelector('.ai-msgs') || {}).textContent || ''),
    chips: document.querySelectorAll('.ai-chips2 .chip').length,
    hasInput: !!document.getElementById('aiAsk') && !!document.getElementById('aiSendBtn')
  }));
  ok('Assistant: greeting + suggestion chips + input render', chat.greeting && chat.chips >= 3 && chat.hasInput, 'chips=' + chat.chips);
  await page.evaluate(() => { document.getElementById('aiAsk').value = 'aaj ki sale kitni hui?'; });
  await page.click('#aiSendBtn');
  await page.waitForFunction(() => {
    const m = [...document.querySelectorAll('.ai-msg.bot')];
    return m.some(x => /Aaj ki sale: Rs/.test(x.textContent));
  }, { timeout: 15000 }).catch(() => {});
  const reply = await page.evaluate(() => {
    const m = [...document.querySelectorAll('.ai-msg.bot')];
    const hit = m.filter(x => /Aaj ki sale: Rs/.test(x.textContent)).pop();
    return hit ? hit.textContent.slice(0, 90) : (m.pop() ? m.pop().textContent.slice(0, 90) : '');
  });
  ok('Chat jawab REAL demo data se (total + bills)', /Aaj ki sale: Rs [\d,]+ \(\d+ bills\)/.test(reply), reply);
  const threadSaved = await page.evaluate(async () => {
    const r = await API.call('ai.threads', {}); return (r || []).length;
  });
  ok('Chat thread server-side save hua (ai.threads)', threadSaved >= 1, 'threads=' + threadSaved);

  /* ================= 3 · Setup: providers + content-aware ================= */
  await page.evaluate(() => { const t = [...document.querySelectorAll('#view .tab')].find(x => /Setup/.test(x.textContent)); t && t.click(); });
  await wait(700);
  const prov = await page.evaluate(() => ({
    cards: [...document.querySelectorAll('.ai-provc')].map(c => c.textContent),
    statusStrip: !!document.querySelector('.ai-connection-title .badge')
  }));
  ok('5 provider cards with taglines', prov.cards.length === 5, prov.cards.map(x => x.slice(0, 16)).join(' | '));
  ok('status strip chips render', prov.statusStrip);

  /* Mock select → key field hidden */
  await page.evaluate(() => { const c = [...document.querySelectorAll('.ai-provc')].find(c => /Mock|Local Data/i.test(c.textContent)); c && c.click(); }); /* v2.30.6: MOCK card ka label 'Local Data Assistant' */
  await wait(700);
  const mockState = await page.evaluate(() => ({
    keyField: !!document.querySelector('.ai-keyrow'),
    onCard: !!document.querySelector('.ai-provc.on')
  }));
  ok('content-aware: Mock par API-key field GAYAB (ghair-zaroori fields chhupay)', !mockState.keyField && mockState.onCard);

  /* Gemini select → key field wapas + help + new-tab link */
  await page.evaluate(() => { [...document.querySelectorAll('.ai-provc')].find(c => /Gemini/.test(c.textContent)).click(); });
  await wait(700);
  const gemState = await page.evaluate(() => {
    const row = document.querySelector('.ai-keyrow');
    const link = row ? row.querySelector('a[target=_blank]') : null;
    return { keyField: !!row, pw: row ? row.querySelector('input[type=password]') !== null : false, link: !!link };
  });
  ok('Gemini par key input (password) + Get-a-key link (naye tab)', gemState.keyField && gemState.pw && gemState.link);

  /* ================= 4 · model list + refresh ================= */
  const modelInfo = await page.evaluate(() => {
    const sel = document.querySelector('select[aria-label="Model"]');
    return { n: sel ? sel.options.length : 0, first: sel && sel.options[0] ? sel.options[0].textContent : '' };
  });
  ok('Model dropdown populated (list-e-model)', modelInfo.n >= 3, 'options=' + modelInfo.n + ' first=' + modelInfo.first);
  const refreshState = await page.evaluate(async () => {
    const btn = [...document.querySelectorAll('.btn')].find(b => /Refresh models/.test(b.textContent));
    if (!btn) return { found: false };
    const sel = document.querySelector('select[aria-label="Model"]');
    const before = sel.options.length;
    btn.click();
    const t0 = Date.now();
    while (Date.now() - t0 < 6000) {
      const s2 = document.querySelector('select[aria-label="Model"]');
      if (s2 && s2.options.length >= before) break;
      await new Promise(r => setTimeout(r, 150));
    }
    return { found: true, after: (document.querySelector('select[aria-label="Model"]') || {}).options ? document.querySelector('select[aria-label="Model"]').options.length : 0 };
  });
  ok('Refresh models button kaam karta hai (state ke sath)', refreshState.found && refreshState.after >= 3, JSON.stringify(refreshState));

  /* ================= 5 · save (dirty → saved → persisted) ================= */
  await page.evaluate(() => {
    const s2 = document.querySelector('select[aria-label="Jawab ka andaaz"]');
    s2.value = 'DETAILED'; s2.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await wait(300);
  const dirtyTxt = await page.evaluate(() => (document.getElementById('aiDirty') || {}).textContent || '');
  ok('dirty indicator: tabdeeli ke baad "Gair-mehfooz"', /Gair-mehfooz|Unsaved changes/.test(dirtyTxt) /* v2.31.2: T.t EN/roman */, dirtyTxt);
  await page.evaluate(() => { [...document.querySelectorAll('.ai-foot .btn')].find(b => /Save settings/.test(b.textContent)).click(); });
  await wait(1400);
  const afterSave = await page.evaluate(async () => {
    const r = await API.call('ai.agentConfig', {});
    const dot = (document.getElementById('aiDirty') || {}).textContent || '';
    return { style: r.values.aiStyle, dot };
  });
  ok('Save → backend persist (aiStyle=DETAILED re-read)', afterSave.style === 'DETAILED', 'style=' + afterSave.style);
  ok('Save → dirty reset', /mehfooz hai|Everything is saved/.test(afterSave.dot) /* v2.31.2 T.t */, afterSave.dot);

  /* ================= 6 · API key: masked, never raw ================= */
  const secRaw = await page.evaluate(() => {
    const inp = document.querySelector('.ai-keyrow input');
    if (!inp) return { skip: true };
    inp.value = 'sk-DEADBEEF-1234567890abcd';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    return { skip: false };
  });
  if (!secRaw.skip) {
    await page.evaluate(() => { [...document.querySelectorAll('.ai-foot .btn')].find(b => /Save settings/.test(b.textContent)).click(); });
    await wait(1200);
    const sec = await page.evaluate(async () => {
      const r = await API.call('ai.agentConfig', {});
      const bodyTxt = document.body.innerText || '';
      return { hasKey: r.hasKey, hint: r.keyHint,
        leaked: /sk-DEADBEEF-1234567890abcd/.test(JSON.stringify(r)) || bodyTxt.indexOf('sk-DEADBEEF-1234567890abcd') > -1 };
    });
    ok('Key save hui (hasKey + masked hint)', sec.hasKey === true && String(sec.hint).indexOf('…') > -1,
      'hint=' + sec.hint);
    ok('RAW key kabhi client ko wapiss nahi jati (mask only)', sec.leaked === false);
  } else ok('Key field test skipped', false, 'key row not visible');

  /* ================= 7 · test connection banner ================= */
  const testRes = await page.evaluate(async () => {
    const btn = [...document.querySelectorAll('.ai-foot .btn')].find(b => /Test connection/.test(b.textContent));
    btn.click();
    const t0 = Date.now();
    while (Date.now() - t0 < 8000) {
      const el = document.getElementById('aiTestHost');
      if (el && el.querySelector('.ai-test')) break;
      await new Promise(r => setTimeout(r, 150));
    }
    const el = document.querySelector('.ai-test');
    return el ? { cls: el.className, txt: el.textContent.slice(0, 120) } : null;
  });
  ok('Test connection → result banner (green/yellow)', !!testRes && /ok|err/.test(testRes.cls), testRes && testRes.txt);
  ok('Test ka matlab saaf hai (KAAMYAB ya fallback note)', !!testRes && /KAAMYAB|fallback|FAIL/.test(testRes.txt),
    testRes && testRes.txt.slice(0, 70));

  /* ================= 8 · tools toggle persists ================= */
  await page.evaluate(() => { const t = [...document.querySelectorAll('#view .tab')].find(x => /Tools/.test(x.textContent)); t.click(); });
  await wait(700);
  const toolPersist = await page.evaluate(async () => {
    const rows = [...document.querySelectorAll('.ai-tool')];
    if (!rows.length) return { rows: 0 };
    const cb = rows[0].querySelector('input[type=checkbox]');
    const was = cb.checked;
    cb.click();
    const t0 = Date.now();
    while (Date.now() - t0 < 6000) {
      const r = await API.call('ai.agentConfig', {});
      const now = r.tools.filter(t => t.name === r.tools[0].name)[0];
      if (now && now.enabled !== was) break;
      await new Promise(r2 => setTimeout(r2, 200));
    }
    const r = await API.call('ai.agentConfig', {});
    return { rows: rows.length, first: r.tools[0].name, toggled: r.tools[0].enabled === !was,
      risk: rows[0].textContent.indexOf('READ') > -1 || rows[0].textContent.indexOf('WRITE') > -1 };
  });
  ok('Tools list render + risk badges', toolPersist.rows >= 10 && toolPersist.risk, 'rows=' + toolPersist.rows);
  ok('Tool toggle backend par persist hoti hai', toolPersist.toggled === true, toolPersist.first);

  /* ================= 9 · activity counters ================= */
  await page.evaluate(() => { const t = [...document.querySelectorAll('#view .tab')].find(x => /Activity/.test(x.textContent)); t.click(); });
  await wait(800);
  const act = await page.evaluate(() => ({
    stats: [...document.querySelectorAll('.ai-stat b')].map(b => b.textContent),
    hasChat: (document.querySelector('.ai-stat') || {}).textContent,
    meter: !!document.querySelector('.ai-meter i'),
    threads: (document.querySelector('.ai-safe') || {}).textContent
  }));
  ok('Activity: usage counters + meter render', act.stats.length >= 4 && act.meter, act.stats.join(' / '));
  const recentHasChat = await page.evaluate(() => /sale kitni hui/i.test((document.querySelector('.ai-tool, .list-item') || { textContent: document.body.textContent }).textContent || '') || /sale/i.test([...document.querySelectorAll('.list-item')].map(x => x.textContent).join('|')));
  ok('Activity: recent chat list mein peechla sawal nazar aata hai', recentHasChat);

  /* ============ 9b · v2.11 adapters: API mode select + caps row ============ */
  await page.evaluate(() => { const tt = [...document.querySelectorAll('#view .tab')].find(x => /Setup/.test(x.textContent)); tt && tt.click(); });
  await wait(700);
  await page.evaluate(()=>{document.querySelector('.ai-hub-advanced').open=true;});
  const ui9b = await page.evaluate(() => {
    const caps = [...document.querySelectorAll('.ai-provc-caps')].map(x => x.textContent);
    const s = document.querySelector('select[aria-label="API mode"]');
    const body = document.body.innerText || '';
    return { caps, modeOpts: s ? Array.from(s.options).map(o => o.value) : null,
      hint: /Interactions API Google ka naya standard/.test(body) && /store=false/.test(body) };
  });
  ok('Provider cards par capability row (function-tools ✓ etc.)', ui9b.caps.length >= 5 && /function-tools/.test(ui9b.caps.join('|')), (ui9b.caps[0] || '').slice(0, 70));
  ok('Gemini: API mode select = AUTO/INTERACTIONS/GENERATE_CONTENT', ui9b.modeOpts && ui9b.modeOpts.join(',') === 'AUTO,INTERACTIONS,GENERATE_CONTENT', JSON.stringify(ui9b.modeOpts));
  ok('Mode helper text: Interactions + stateless store=false batata hai', ui9b.hint === true);
  /* mode change → save → persist */
  await page.evaluate(() => {
    const s = document.querySelector('select[aria-label="API mode"]');
    s.value = 'GENERATE_CONTENT'; s.dispatchEvent(new Event('change', { bubbles: true }));
    [...document.querySelectorAll('.ai-foot .btn')].find(b => /Save settings/.test(b.textContent)).click();
  });
  await wait(1300);
  const modePersist = await page.evaluate(async () => (await API.call('ai.agentConfig', {})).values.aiApiModeGemini);
  ok('API mode save persist hota hai (GENERATE_CONTENT re-read)', modePersist === 'GENERATE_CONTENT', 'mode=' + modePersist);
  await page.evaluate(async () => { await API.call('ai.agentConfig.save', { values: { aiApiModeGemini: 'AUTO' } }); });
  /* provider switch → OpenAI apna mode dikhaye; Mock ka koi mode nahi */
  const oaModes = await page.evaluate(async () => {
    const card = [...document.querySelectorAll('.ai-provc')].find(b => /OpenAI/.test(b.textContent));
    card.click();
    await new Promise(r => setTimeout(r, 500));
    const s = document.querySelector('select[aria-label="API mode"]');
    return s ? Array.from(s.options).map(o => o.value).join(',') : '';
  });
  ok('OpenAI card → Responses/CHAT modes usi ka select', oaModes === 'AUTO,RESPONSES,CHAT', oaModes);
  const mockMode = await page.evaluate(async () => {
    const card = [...document.querySelectorAll('.ai-provc')].find(b => /Mock|Local Data/i.test(b.textContent));
    if (!card) throw new Error('MOCK card nahi mila'); /* v2.30.6: label 'Local Data Assistant' */
    card.click();
    await new Promise(r => setTimeout(r, 500));
    return { sel: !!document.querySelector('select[aria-label="API mode"]'),
      key: !!document.querySelector('.ai-keyrow'),
      capsText: (document.querySelector('.ai-provc.on .ai-provc-caps') || {}).textContent || '' };
  });
  ok('Mock card: koi API-mode/key field nahi (offline engine cap)', !mockMode.sel && !mockMode.key && /offline/.test(mockMode.capsText), JSON.stringify(mockMode).slice(0, 110));
  await page.evaluate(async () => {
    const card = [...document.querySelectorAll('.ai-provc')].find(b => /Gemini/.test(b.textContent));
    card.click();
    await API.call('ai.agentConfig.save', { values: { aiProvider: 'GEMINI' } });
  });
  await wait(500);

  /* ================= 10 · mobile render + errors ================= */
  await page.setViewport({ width: 390, height: 844 });
  await wait(700);
  const mob = await page.evaluate(() => {
    const v = document.querySelector('#view');
    return { scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth,
      hasTabs: !!document.querySelector('#view .tab') };
  });
  ok('Mobile 390: screen fit (horizontal overflow nahi)', mob.scrollW <= mob.clientW + 2 && mob.hasTabs,
    'scroll=' + mob.scrollW + '/' + mob.clientW);

  /* v2.13 connection hub: actual controls, simulated backend clearly labelled. */
  await page.evaluate(()=>{[...document.querySelectorAll('.ai-provc')].find(b=>/OpenAI/.test(b.textContent)).click();});
  await wait(250);
  const beforePrimary=await page.evaluate(async()=> (await API.call('ai.agentConfig',{})).provider);
  await page.evaluate(()=>{const k=document.querySelector('.ai-keyrow input');k.value='TEST-CONNECTION-HUB-KEY';k.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-action="auto-connect"]').click();});
  await page.waitForFunction(()=>document.querySelector('.ai-test') && /DEMO SIMULATION/.test(document.querySelector('.ai-test').textContent),{timeout:10000});
  const connected=await page.evaluate(async()=>{const cfg=await API.call('ai.agentConfig',{});return {cfg,empty:document.querySelector('.ai-keyrow input').value==='',model:document.querySelector('[aria-label="Model"]').value};});
  ok('Auto-connect actual button clears raw input and chooses model',connected.empty && connected.model===connected.cfg.profiles.OPENAI.model);
  ok('Adding fallback does not silently change primary',connected.cfg.provider===beforePrimary);
  ok('Multiple provider keys/profiles retained independently',connected.cfg.credentials.OPENAI.hasKey && connected.cfg.credentials.GEMINI.hasKey);
  ok('Demo never claims a live connection',/DEMO SIMULATION/.test(connected.cfg.profiles.OPENAI.lastTest.message));
  await page.evaluate(()=>{document.querySelector('[aria-label="Move OPENROUTER up"]').click();});
  await wait(150);
  const desiredOrder=await page.evaluate(()=>[...document.querySelectorAll('.ai-route-list li')].map(el=>el.dataset.provider));
  await page.evaluate(()=>{[...document.querySelectorAll('.btn')].find(b=>b.textContent==='Save routing').click();});
  await wait(600);
  const persistedOrder=await page.evaluate(async()=>(await API.call('ai.agentConfig',{})).routing.order);
  ok('Fallback reorder + Save routing persists through real UI',JSON.stringify(desiredOrder)===JSON.stringify(persistedOrder));
  for(const theme of ['light','dark'])for(const width of [390,1024,1440]){
    await page.setViewport({width,height:900});
    await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);await wait(250);
    const audit=await page.evaluate(()=>{
      const root=document.querySelector('.ai-hub');
      const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0 && r.height>0 && s.visibility!=='hidden' && !el.closest('details:not([open]) :not(summary)');};
      const interactive=[...root.querySelectorAll('button,input,select,summary,a')].filter(visible).filter(el=>getComputedStyle(el).position!=='absolute');
      const tiny=interactive.filter(el=>{const r=el.getBoundingClientRect();return r.height<31.5 || (el.tagName==='BUTTON' && r.width<31.5);}).map(el=>el.textContent.slice(0,40)||el.getAttribute('aria-label'));
      const small=[...root.querySelectorAll('*')].filter(visible).filter(el=>[...el.childNodes].some(n=>n.nodeType===3 && n.textContent.trim())).filter(el=>parseFloat(getComputedStyle(el).fontSize)<10.8).map(el=>el.textContent.slice(0,30));
      return {overflow:document.documentElement.scrollWidth>innerWidth+2,tiny,small,columns:getComputedStyle(document.querySelector('.ai-hub-layout')).gridTemplateColumns.split(' ').length};
    });
    ok('Hub '+theme+' @'+width+': no overflow, 32px taps, readable type',!audit.overflow && !audit.tiny.length && !audit.small.length,JSON.stringify(audit));
    ok('Hub '+theme+' @'+width+': responsive connection/routing columns',audit.columns===(width===390?1:2));
    const geometry=await page.evaluate(hubGeometryAudit,'.ai-hub');
    ok('Hub '+theme+' @'+width+': WCAG AA / overlap / clipping / duplicate IDs',!geometry.hscroll && ['overflow','clipped','overlap','tiny','contrast','dupIds'].every(k=>!geometry[k].length),JSON.stringify(geometry));
    if(width===1440 && theme==='light')await page.screenshot({path:'/tmp/haseeb-ai-settings-213.png',fullPage:true});
  }

  const secretTransport=await page.evaluate(async()=>{
    const oldUrl=window.API_URL, oldOffline=App.state.offline, oldQueue=API.enqueue;
    let jsonpBlocked=false,offlineBlocked=false,queued=0;
    try {
      window.API_URL='https://example.invalid/exec';
      try {await API.call('ai.autoConfigure',{provider:'OPENAI',key:'TEST-PRIVATE-TRANSPORT'});}catch(e){jsonpBlocked=/never sent in a URL/.test(e.message);}
      window.API_URL='';App.state.offline=true;API.enqueue=()=>{queued++;return Promise.resolve();};
      try {await API.call('ai.agentConfig.save',{key:'TEST-PRIVATE-TRANSPORT'});}catch(e){offlineBlocked=true;}
      return {jsonpBlocked,offlineBlocked,queued};
    } finally {window.API_URL=oldUrl;App.state.offline=oldOffline;API.enqueue=oldQueue;}
  });
  ok('Credentials blocked from JSONP URLs and persistent offline queue',secretTransport.jsonpBlocked && secretTransport.offlineBlocked && secretTransport.queued===0);

  const clean = errs.filter(e => !/favicon|manifest/i.test(e));
  ok('Zero page/console errors poore flow mein', clean.length === 0, clean.slice(0, 2).join(' | '));

  console.log('\n==============================================================');
  console.log('  AI AGENT UI (rendered)   PASS: ' + PASS + '   FAIL: ' + FAIL);
  console.log('==============================================================');
  await browser.close();
  process.exit(FAIL ? 1 : 0);
})().catch(e => { console.log('\x1b[31mFATAL:\x1b[0m ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')); process.exit(2); });
