#!/usr/bin/env node
'use strict';
// Offline protocol evidence only: real Apps Script code, mocked provider HTTP.
const path=require('path');
const {loadBackend}=require('./mock_gs');
const {sandbox:B,services}=loadBackend(path.join(__dirname,'../apps-script'));
const {AI,DB}=B, http=services.UrlFetchApp;
const S={userId:'U-OWNER',role:'OWNER',permissions:['*'],locationId:'LOC-SDQ'};
B.setupAll();
let pass=0,fail=0;
function ok(n,c){console.log((c?'PASS ':'FAIL ')+n);c?pass++:fail++;}
const J=o=>({code:200,text:JSON.stringify(o)});
function profile(id,model,endpoint){const v={};v['ai.profile.'+id]=JSON.stringify({model,endpoint:endpoint||AI.officialEndpoint(id),enabled:true});DB.setSettings(v,S);}
function clear(){['GEMINI','OPENAI','OPENROUTER','OLLAMA'].forEach(id=>B.CacheService.getScriptCache().remove(AI.cooldownKey(id)));}
function stub(f){http.reset();http.handle(f);clear();}
const secret='TEST-HUB-PRIVATE-12345';
stub((url)=>url.includes('/models')?J({models:[{name:'models/test-flash',supportedGenerationMethods:['generateContent']}]}):J({steps:[{type:'model_output',content:[{type:'text',text:'OK'}]}]}));
let result=AI.autoConfigure({provider:'GEMINI',key:secret},S);
ok('Auto-connect validates, discovers, probes, saves',result.ok && result.saved && result.model==='test-flash');
ok('Three bounded HTTP calls for successful cloud setup',http.log.length===3);
ok('Raw key never returned',!JSON.stringify(result).includes(secret));
ok('Key is stored in provider-specific Script Properties',AI.getKey('GEMINI')===secret);
ok('Profile contains no secret',!DB.settings()['ai.profile.GEMINI'].includes(secret));
ok('Stateless probe does not request conversation storage',JSON.parse(http.log[2].opts.payload).store===false);
ok('Connection timestamp/status persisted',AI.providerProfile('GEMINI').lastTest.ok);
stub(()=>({code:401,text:JSON.stringify({error:{message:'Invalid API key'}})}));
result=AI.autoConfigure({provider:'GEMINI',key:'INVALID-REPLACEMENT'},S);
ok('Invalid replacement fails without overwriting working key',!result.ok && AI.getKey('GEMINI')===secret);
ok('Failed auth does not attempt discovery or inference',http.log.length===1);
stub(url=>url.includes('/models')?J({models:[]}):J({}));
result=AI.autoConfigure({provider:'GEMINI',key:'VALID-NO-MODELS'},S);
ok('Empty discovery never fakes a connected catalog result',!result.ok && !result.saved);
ok('Empty discovery retains previous key',AI.getKey('GEMINI')===secret);
try{AI.autoConfigure({provider:'GEMINI',key:'x'},{role:'CUSTOM',permissions:[]});ok('Auto-connect requires settings.manage',false);}catch(e){ok('Auto-connect requires settings.manage',true);}
try{AI.saveRouting({primary:'OPENAI',order:['OPENAI'],enabled:true},{role:'CUSTOM',permissions:[]});ok('Routing requires settings.manage',false);}catch(e){ok('Routing requires settings.manage',true);}
try{AI.saveRouting({primary:'GEMINI',order:['MOCK'],enabled:true},S);ok('Mock forbidden as automatic real-service fallback',false);}catch(e){ok('Mock forbidden as automatic real-service fallback',true);}
AI.setKey('TEST-OPENAI-PRIVATE','OPENAI','test-mini');AI.setKey('TEST-OR-PRIVATE','OPENROUTER','router-test');
profile('GEMINI','test-flash','https://gemini-gateway.example/v1');profile('OPENAI','test-mini');profile('OPENROUTER','router-test');
AI.saveRouting({primary:'GEMINI',order:['GEMINI','OPENAI','OPENROUTER','OLLAMA'],enabled:true},S);
ok('Endpoints isolated across configured providers',AI._baseUrl('OPENAI')==='https://api.openai.com/v1' && AI._baseUrl('GEMINI').includes('gemini-gateway'));
stub(url=>url.includes('gemini-gateway')?{code:429,text:'quota exceeded'}:J({output:[{type:'message',content:[{type:'output_text',text:'OpenAI answered'}]}]}));
let cfg={provider:'GEMINI',model:'test-flash'},trace=[];
result=B.ai_withBudget_(()=>AI.callResilient(cfg,'Hello',[],S,[],trace));
ok('429 automatically moves Gemini to OpenAI',result.text==='OpenAI answered' && cfg.provider==='OPENAI');
ok('Failover metadata exposes attempted and answering provider',trace.length===2 && trace[0].reason==='QUOTA' && trace[1].status==='success');
ok('OpenAI key sent only to its own endpoint',http.log[1].url.startsWith('https://api.openai.com/') && http.log[1].opts.headers.Authorization==='Bearer TEST-OPENAI-PRIVATE');
ok('Gemini credential not forwarded in fallback payload',!JSON.stringify(http.log[1]).includes(secret));
ok('Quota failure installs bounded cooldown',!!B.CacheService.getScriptCache().get(AI.cooldownKey('GEMINI')));
http.reset();http.handle(()=>J({output:[{type:'message',content:[{type:'output_text',text:'OK'}]}]}));trace=[];
result=AI.callResilient({provider:'GEMINI',model:'test-flash'},'Hi',[],S,[],trace);
ok('Next chat skips cooling-down provider',trace[0].status==='skipped' && http.log.length===1);
['Gemini error 400: invalid schema','Gemini error 403: safety policy violation'].forEach(err=>{
  clear();const old=AI._callProvider;let n=0;AI._callProvider=()=>{n++;return {error:err};};
  result=AI.callResilient({provider:'GEMINI',model:'m'},'Hi',[],S,[],[]);
  ok('Does not bypass '+err,result.error===err && n===1);AI._callProvider=old;
});
stub(()=>({code:429,text:'quota exceeded'}));
result=AI.testConnection({provider:'GEMINI',model:'test-flash'},S);
ok('Exact connection test never silently tests fallback',!result.ok && http.log.every(x=>x.url.includes('gemini-gateway')));
clear();const original=AI._callProvider;let received;
AI._callProvider=(cfg,msg,history)=>cfg.provider==='GEMINI'?{error:'429 quota'}:(received=history,{text:'read data preserved'});
let history=[{role:'user',text:'What sold?'},{role:'model',rawSteps:[{secretSignature:'private-native'}],functionCall:{name:'today_sales'}},{role:'user',functionResponse:{name:'today_sales',response:{total:42}}}];
result=AI.callResilient({provider:'GEMINI',model:'m'},'',history,S,[{tool:'today_sales',result:{total:42}}],[]);
ok('Cross-provider history excludes raw reasoning signatures',!JSON.stringify(received).includes('private-native'));
ok('Completed read tool result survives provider switch',JSON.stringify(received).includes('42'));
clear();let calls=0;AI._callProvider=()=>{calls++;return {error:'503 unavailable'};};
result=AI.callResilient({provider:'GEMINI',model:'m'},'',[],S,[{tool:'draft_sale',result:{draft:{}}}],[]);
ok('Failover blocked after draft/write tool (no action replay)',calls===1 && /No automatic replay/.test(result.error));
AI._callProvider=original;
AI.saveRouting({primary:'GEMINI',order:['OPENAI','OPENROUTER'],enabled:false},S);
stub(()=>({code:429,text:'quota'}));
result=AI.callResilient({provider:'GEMINI',model:'m'},'Hi',[],S,[],[]);
ok('Disabling failover makes only the primary request',!!result.error && http.log.length===1);
AI.saveRouting({primary:'GEMINI',order:['OPENAI','OPENROUTER'],enabled:true},S);
stub(()=>({code:503,text:'unavailable'}));
result=B.ai_withBudget_(()=>AI.callResilient({provider:'GEMINI',model:'m'},'Hi',[],S,[],[]));
ok('All configured failures surface error, not Mock success',!!result.error && !result.text);
ok('Routing tries at most three providers within shared HTTP budget',http.log.length<=4 && http.log.length===3);
AI.saveAgentConfig({provider:'OPENAI',values:{aiProvider:'OPENAI',aiModel:'changed-model',aiEndpoint:'https://openai-gateway.example/v1'}},S);
ok('Editing fallback profile does not change primary',DB.settings().aiProvider==='GEMINI');
ok('Manual per-provider model and endpoint save independently',AI.providerProfile('OPENAI').model==='changed-model' && AI._baseUrl('OPENAI').includes('openai-gateway'));
ok('Write capability remains default OFF',AI.getConfig(S).canWrite===false);
ok('Provider prefix detection is deterministic',AI.detectProvider('sk-or-test')==='OPENROUTER' && AI.detectProvider('AIzaTEST')==='GEMINI' && AI.detectProvider('sk-proj-test')==='OPENAI');
ok('Errors redact exact active key',!AI.safeMessage('bad '+secret,secret).includes(secret));
console.log(`AI HUB: ${pass} PASS, ${fail} FAIL`);process.exit(fail?1:0);
