#!/usr/bin/env node
'use strict';
// Real browser + Apps Script-style transport contract; no production requests.
const path=require('path'),assert=require('assert'),pp=require('puppeteer');
const { login } = require('./_harness');
let count=0;
const ok=(name,value)=>{assert(value,name);count++;console.log('PASS '+name);};
(async()=>{
 const browser=await pp.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.evaluateOnNewDocument(()=>{
  window.__gasCalls=[];
  const publicActions=['auth.login','system.ping','system.health','system.loginConfig'];
  function runner(success,failure){return {
   withSuccessHandler(fn){return runner(fn,failure);},withFailureHandler(fn){return runner(success,fn);},
   api(action,payload){window.__gasCalls.push({action,hasToken:!!payload.token});setTimeout(()=>{
    try{
     if(!publicActions.includes(action)&&!payload.token){success({ok:false,error:{code:'SESSION_EXPIRED',message:'Session expired'}});return;}
     if(!window.MockAPI || typeof MockAPI[action]!=='function')throw new Error('Mock missing: '+action);
     success({ok:true,data:MockAPI[action](payload)});
    }catch(e){failure(e);}
   },25);}
  };}
  window.google={script:{run:runner()}};
 });
 await page.goto('file://'+path.join(__dirname,'../demo/index.html'),{waitUntil:'load'});
 await page.waitForSelector('#lgBtn');
 await new Promise(r=>setTimeout(r,1700)); // crosses legacy 1200ms language startup timer
 let state=await page.evaluate(()=>({calls:__gasCalls.slice(),pending:API.pending,expired:document.body.innerText.includes('Session expire'),raw:document.body.innerText.includes('function fRow2()'),helper:typeof fRow2,loggedIn:!!App.state.session}));
 ok('fresh Apps Script-style page makes ZERO protected pre-login calls',state.calls.filter(c=>c.action!=='system.loginConfig').length===0);
 ok('fresh login has no false session-expired banner',!state.expired);
 ok('logged-out page is idle and unauthenticated',state.pending===0&&!state.loggedIn);
 ok('helper executes rather than rendering JavaScript text',!state.raw&&state.helper==='function');
 await page.evaluate(async()=>{App.refresh();App.go('dashboard');T.set('roman');await T.load();});
 await new Promise(r=>setTimeout(r,100));
 ok('pre-login refresh/navigation/language uses no server requests',await page.evaluate(()=>__gasCalls.filter(c=>c.action!=='system.loginConfig').length===0));
 const anonymous=await page.evaluate(async()=>{
  let msg='';try{await API.call('reports.dashboard',{});}catch(e){msg=e.message;}
  return {msg,expired:document.body.innerText.includes('Session expire'),pending:API.pending};
 });
 ok('explicit anonymous protected call stays rejected',/Login/.test(anonymous.msg));
 ok('anonymous rejection does not falsely expire a session',!anonymous.expired&&anonymous.pending===0);
 await login(page, { pass: 'demo1234', button: '#lgBtn' });   /* poll + login (shared harness) */
 await page.waitForFunction(()=>App.state.booted&&App.state.session?.token,{timeout:15000});
 await page.waitForFunction(()=>API.pending===0,{timeout:15000});
 const after=await page.evaluate(()=>({calls:__gasCalls.slice(),token:!!App.state.session.token,booted:App.state.booted,loginHidden:document.querySelector('#loginRoot').hidden,expired:document.body.innerText.includes('Session expire')}));
 ok('login and bootstrap still open the workspace',after.token&&after.booted&&after.loginHidden&&!after.expired);
 const loginIndex=after.calls.findIndex(c=>c.action==='auth.login');
 const bootIndex=after.calls.findIndex(c=>c.action==='system.bootstrap');
 ok('protected startup runs AFTER authenticated bootstrap',bootIndex>loginIndex && after.calls.slice(bootIndex).every(c=>c.hasToken));
 for(const name of ['suppliers.list','config.fields.list','lang.prefs','lang.myOverrides','lang.dict','reports.dashboard']){
  ok('deferred feature still loads: '+name,after.calls.slice(bootIndex+1).some(c=>c.action===name));
 }
 const expiry=await page.evaluate(async()=>{
  const original=App.logout;let logouts=0;App.logout=()=>{logouts++;};
  const token=App.state.session.token;
  try{
   async function expire(request){try{await new Promise((resolve,reject)=>API.handle({ok:false,error:{code:'SESSION_EXPIRED'}},resolve,reject,request));}catch(e){}}
   await expire({token:''});const anonymous=logouts;
   await expire({token:'OLD-SESSION-TEST'});const stale=logouts;
   await expire({token});return {anonymous,stale,current:logouts};
  }finally{App.logout=original;}
 });
 ok('late anonymous response cannot log out a new session',expiry.anonymous===0);
 ok('late old-session response cannot log out a new session',expiry.stale===0);
 ok('current-session expiration still triggers logout',expiry.current===1);
 await page.evaluate(()=>App.logout(false));
 await page.waitForFunction(()=>!App.state.session&&API.pending===0,{timeout:10000});
 ok('logout clears personalized language and supplier cache',await page.evaluate(()=>Object.keys(T.personal).length===0 && (window.__suppliers||[]).length===0));
 const before=await page.evaluate(()=>__gasCalls.filter(c=>c.action!=='system.loginConfig').length);
 await page.evaluate(async()=>{App.refresh();await T.load();});
 await new Promise(r=>setTimeout(r,100));
 ok('after logout no protected background loads resume',await page.evaluate(n=>__gasCalls.filter(c=>c.action!=='system.loginConfig').length===n,before));
 ok('no uncaught browser errors',errors.length===0);
 }finally{await browser.close();}
 console.log('AUTH STARTUP: '+count+' PASS, 0 FAIL');
})().catch(e=>{console.error(e.stack);process.exit(1);});
