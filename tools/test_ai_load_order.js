#!/usr/bin/env node
'use strict';
const assert=require('assert'),vm=require('vm'),fs=require('fs'),path=require('path');
const {loadBackend}=require('./mock_gs');
const root=path.join(__dirname,'../apps-script');
let pass=0;
function ok(name,value){assert(value,name);pass++;console.log('PASS '+name);}
function permutations(xs){return xs.length?xs.flatMap((x,i)=>permutations(xs.filter((_,j)=>j!==i)).map(p=>[x,...p])):[[]];}
const orders=permutations(['AI','AI_ProviderHub','AI_Adapters']);
for(const order of orders){
 const label=order.join(' → ');
 // Separate-script execution models a hub evaluated before AI exists.
 const ctx=vm.createContext({});
 order.forEach(n=>vm.runInContext(fs.readFileSync(path.join(root,n+'.gs'),'utf8'),ctx,{filename:n+'.gs'}));
 ok(label+': evaluation succeeds; hub installed',ctx.AI._coreReady && ctx.AI._providerHubInstalled);
 ok(label+': methods retained',typeof ctx.AI.chat==='function' && typeof ctx.AI.autoConfigure==='function' && typeof ctx.AI.callResilient==='function');
 const exact=ctx.AI.testConnection;ctx.ai_installProviderHub_();ctx.ai_installProviderHub_();
 ok(label+': repeated installation never wraps twice',ctx.AI.testConnection===exact);
 // Single compilation models cross-file hoisting before initialization.
 const combined=vm.createContext({});vm.runInContext(order.map(n=>fs.readFileSync(path.join(root,n+'.gs'),'utf8')).join('\n'),combined);
 ok(label+': concatenated/hoisted initialization also succeeds',combined.AI._providerHubInstalled);
 // Full backend setup + exact test (no network) under this order.
 const {sandbox:B}=loadBackend(root,{firstFiles:order});
 B.setupAll();
 ok(label+': setupAll reaches completion',!!B.DB.settings());
 const S={userId:'U-OWNER',role:'OWNER',permissions:['*'],locationId:'LOC-SDQ'};
 B.DB.setSettings({aiProvider:'MOCK',aiModel:'mock-1'},S);
 const test=B.AI.testConnection({provider:'MOCK'},S);
 ok(label+': exact-provider wrapper operational',test.ok===true && test.provider==='MOCK');
 ok(label+': test metadata saved once into profile',B.AI.providerProfile('MOCK').lastTest.ok===true);
 const result=B.AI.chat({message:'aaj ki sale'},S);
 ok(label+': chat operates with routing metadata',!!result.reply && result.config.provider==='MOCK');
}
const lone=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(root,'AI_ProviderHub.gs'),'utf8'),lone);
ok('Hub alone defers safely instead of inventing an empty AI object',typeof lone.AI==='undefined');
console.log('AI LOAD ORDER: '+pass+' PASS, 0 FAIL');
