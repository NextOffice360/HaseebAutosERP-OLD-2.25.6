#!/usr/bin/env node
/* v2.12 timeout regression gate: simulated slow GAS services + rendered browser transport. */
'use strict';
const assert = require('assert');
const path = require('path');
const {loadBackend} = require('./mock_gs');
const puppeteer = require('puppeteer');
const ROOT = path.join(__dirname, '..');
let checks = 0;
function ok(name, condition) { assert(condition, name); checks++; console.log('PASS ' + name); }
async function main() {
  const {sandbox:s, services} = loadBackend(path.join(ROOT, 'apps-script'));
  const S = {userId:'U-OWNER', username:'owner', role:'OWNER', locationId:'LOC-SDQ', permissions:['*']};
  const RealDate = s.Date;
  let now = Date.now();
  s.Date = class extends RealDate { static now() { return now; } };
  const origCreate = s.Setup.createSheet;
  let sheetWork = 0;
  s.Setup.createSheet = function(name) { const sh = origCreate(name); sheetWork++; now += 16000; return sh; };
  const partial = s.setupAll();
  ok('setup yields incomplete progress before six-minute execution limit', !partial.complete && partial.completedSteps === 3);
  const id = partial.spreadsheetId;
  const partial2 = s.setupAll();
  ok('rerun resumes SAME spreadsheet', partial2.spreadsheetId === id && partial2.completedSteps === 6);
  ok('completed sheets not repeated', sheetWork === 6);
  s.Setup.createSheet = origCreate;
  const finished = s.setupAll();
  ok('resume completes sheets/seeds/jobs', finished.complete && finished.completedSteps === finished.totalSteps);
  const userCount = s.DB.count('Users');
  const settingsCount = s.DB.count('Settings');
  const finished2 = s.setupAll();
  ok('completed setup rerun does not recreate database or users', finished2.spreadsheetId === id && s.DB.count('Users') === userCount);
  const props = services.PropertiesService.getScriptProperties();
  const progress = JSON.parse(props.getProperty('SETUP_PROGRESS_V212'));
  ok('checkpoint persisted with version and database binding', progress.id === id && progress.version === s.CONFIG.VERSION);
  s.Setup.seedSettings();
  ok('batch defaults are idempotent', s.DB.count('Settings') === settingsCount);
  s.DB.setSetting('businessName','KEEP MY BUSINESS'); s.Setup.seedSettings();
  ok('existing business settings preserved', s.DB.settings().businessName === 'KEEP MY BUSINESS');
  const sh = s.DB.sheet('Settings'); let bulkWidths = 0, singleWidths = 0;
  sh.setColumnWidth = function(){singleWidths++;return this;};
  sh.setColumnWidths = function(){bulkWidths++;return this;};
  s.Setup.createSheet('Settings');
  ok('column formatting is TWO RPCs, not one per column', bulkWidths === 1 && singleWidths === 1);

  s.AI.setKey('TEST-TIMEOUT-ONLY', 'OPENAI', 'test-model');
  const net = services.UrlFetchApp;
  net.reset();
  net.handle((url, opts) => {
    const payload = opts.payload ? JSON.parse(opts.payload) : {};
    return {code:200, text:JSON.stringify(opts.method === 'get' ? {data:[]} : {output:[{type:'message',content:[{text:'OK'}]}]})};
  });
  const tested = s.AI.testConnection({provider:'OPENAI',model:'test-model'},S);
  ok('connection test still validates provider', tested.ok);
  const post = net.log.find(r => r.opts.method === 'post');
  const pl = JSON.parse(post.opts.payload);
  ok('connection test has no 17-tool payload', !pl.tools);
  ok('connection test output capped at 256 tokens', pl.max_output_tokens === 256);
  ok('all network requests have explicit <=20-second fetch deadline', net.log.every(r=>r.opts.timeoutSeconds > 0 && r.opts.timeoutSeconds <= 20));

  net.reset(); let calls = 0;
  net.handle((url,opts) => {
    calls++; now += opts.timeoutSeconds * 1000;
    return {code:200,text:JSON.stringify({output:[{type:'function_call',call_id:'c'+calls,name:'today_sales',arguments:'{}'}]})};
  });
  const chat = s.AI.chat({message:'Get today sales',history:[]},S);
  ok('slow tool loop stops within shared fetch budget', calls <= 3 && /waqt/.test(chat.reply));
  ok('budget released at end of execution', s.AI_REQUEST_BUDGET === null);
  net.reset();
  s.ai_withBudget_(function(){
    for(let i=0;i<8;i++) s.ai_http_('get','https://example.test',{},null);
  });
  ok('retry request count bounded even with slow provider', net.log.length <= 4);
  s.Date = RealDate;

  let writes = 0; const set = s.DB.setSetting;
  s.DB.setSetting = function(){ writes++; return set.apply(s.DB,arguments); };
  const cfg = s.AI.agentConfig(S);
  s.AI.saveAgentConfig({values:cfg.values,tools:cfg.tools},S);
  ok('saving unchanged AI configuration avoids repeated setting writes', writes === 0);
  s.DB.setSetting = set;

  const browser = await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try {
    const page = await browser.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('file://'+path.join(ROOT,'demo/index.html'),{waitUntil:'load'});
    await page.waitForFunction(()=>window.App && window.API && window.fmt);
    const amounts = await page.evaluate(()=>({
      lakh:fmt.moneyCompact(2067000),crore:fmt.moneyCompact(10328802),
      neg:fmt.moneyCompact(-10328802),small:fmt.moneyCompact(500),
      custom:fmt.moneyCompact(2067000,'PKR'),exact:fmt.money(10328802)
    }));
    ok('Lakhs formatting requested', amounts.lakh === 'Rs. 20.67 Lakhs');
    ok('Crore plus exact amount requested', amounts.crore === 'Rs. 1.03 Crore (Rs. 10,328,802)');
    ok('negative financial values preserved', amounts.neg === 'Rs. -1.03 Crore (Rs. -10,328,802)');
    ok('small amounts stay exact', amounts.small === 'Rs. 500');
    ok('custom currency preserved', amounts.custom === 'PKR 20.67 Lakhs');
    ok('invoice/table exact formatter unchanged', amounts.exact === 'Rs 10,328,802');
    await page.setViewport({width:390,height:844});
    const dom = await page.evaluate(()=>{
      const box=document.createElement('div');box.style.cssText='width:300px;position:relative';
      box.appendChild(UI.kpi('💰','Amount',fmt.moneyCompact(10328802),'',''));
      document.body.appendChild(box);
      const val=box.querySelector('.k-value'),exact=box.querySelector('.k-exact');
      const r={val:val.textContent,exact:exact.textContent,fit:box.scrollWidth <= 300,font:parseFloat(getComputedStyle(exact).fontSize)};
      box.remove();return r;
    });
    ok('rendered KPI keeps short headline and visible exact amount', dom.val === 'Rs. 1.03 Crore' && dom.exact === '(Rs. 10,328,802)');
    ok('mobile KPI fits and exact text >=10.8px', dom.fit && dom.font >=10.8);

    // Let real startup requests finish before replacing the global transport.
    // Otherwise their completions change API.pending during the probe, or a
    // startup continuation overwrites its success/failure callback capture.
    await page.waitForFunction(()=>{
      if (API.pending !== 0) { window.__timeoutProbeIdleSince=0; return false; }
      if (!window.__timeoutProbeIdleSince) window.__timeoutProbeIdleSince=Date.now();
      return Date.now()-window.__timeoutProbeIdleSince >= 300;
    }, {timeout:15000, polling:50});
    const transport = await page.evaluate(async()=>{
      // Deliberately hang real Apps Script transport API; settle late after watchdog.
      const original=window.google;
      let success, failure, requests=0, calls=[];
      /* v2.26.0 — background polls (notifications/refresh) isi transport se ja sakti hain;
         is liye sirf woh calls ginne hain jo PROBED action ke hain. Warna timer ki timing
         par test jhooti failure deta hai (retry ki asal assertion neeche wahi hai). */
      const chain={withSuccessHandler(fn){success=fn;return chain;},withFailureHandler(fn){failure=fn;return chain;},
        api(a){requests++;calls.push(String(a||''));}};
      window.google={script:{run:chain}}; App.state.offline=false;
      const before=API.pending;
      let message='';try{await API.call('sales.post',{}, {timeoutMs:25});}catch(e){message=e.message;}
      const after=API.pending;
      success({ok:true,data:{saved:true}});failure(new Error('late'));
      const afterLate=API.pending;
      let throws=0;
      chain.api=()=>{throws++;throw new Error('transport-init-failed');};
      let sync='';try{await API.call('system.ping',{}, {timeoutMs:100});}catch(e){sync=e.message;}
      const result={message,before,after,afterLate,requests,calls,sync,pending:API.pending,throws,
        aiTimeout:API.timeoutFor('ai.chat'),normalTimeout:API.timeoutFor('items.list')};
      window.google=original;return result;
    });
    ok('hung GAS request rejects with action name and timeout', /REQUEST_TIMEOUT \[sales.post\]/.test(transport.message));
    ok('uncertain write warning; does not claim server cancelled', /Server ka kaam abhi chal sakta/.test(transport.message) && /record\/history/.test(transport.message));
    const probed = (transport.calls||[]).filter(x => x === 'sales.post').length;
    ok('no automatic write retry', probed === 1,
      'sales.post calls=' + probed + ' · kul transport calls=' + transport.requests + ' [' + (transport.calls||[]).join(',') + ']');
    ok('spinner/pending counter cleaned once despite late handlers', transport.before === 0 && transport.after === 0 && transport.afterLate === 0);
    ok('synchronous transport exception also cleans busy state', transport.sync === 'transport-init-failed' && transport.pending === transport.before);
    ok('AI client timeout aligned above server budget, not old 25 seconds', transport.aiTimeout === 65000 && transport.normalTimeout === 60000);
    ok('rendered page no uncaught errors',errors.length===0);
  } finally { await browser.close(); }
  console.log('TIMEOUT + AMOUNTS: '+checks+' PASS, 0 FAIL');
}
main().catch(e=>{console.error(e.stack);process.exit(1);});
