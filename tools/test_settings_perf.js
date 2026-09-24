#!/usr/bin/env node
/* v2.12.1 — counted Sheets operations; settings safety; lightweight diagnostics. */
'use strict';
const path = require('path');
const assert = require('assert');
const {loadBackend} = require('./mock_gs');
let passed = 0;
function ok(name, result) { assert(result, name); passed++; console.log('PASS ' + name); }
const {sandbox:s, services} = loadBackend(path.join(__dirname,'..','apps-script'));
s.setupAll();
const owner = {userId:'OWNER-PERF',username:'owner',role:'OWNER',permissions:['*'],locationId:'LOC-SDQ'};
const rows = Array.from({length:100},(_,i)=>({id:'SP-'+i,key:'perf.setting.'+i,value:'old',type:'string'}));
s.DB.insertMany('Settings',rows);
const sh=s.DB.sheet('Settings');
let reads=0,writes=0,ranges=[];
const gr=sh.getRange.bind(sh),ar=sh.appendRow.bind(sh);
sh.getRange=function(...a){const r=gr(...a);for(const key of ['getValues','getDisplayValues']){const f=r[key].bind(r);r[key]=()=>{reads++;return f();};}const f=r.setValues.bind(r);r.setValues=v=>{writes++;ranges.push({row:a[0],count:a[2]});return f(v);};return r;};
sh.appendRow=v=>{writes++;return ar(v);};
function reset(){reads=0;writes=0;ranges=[];}
function save(values){return s.ROUTES['system.settings.save']({values},owner);}
const values={}; rows.forEach(r=>values[r.key]='new');
reset();const result=save(values);
console.log('100 changed settings: reads='+reads+' writes='+writes);
ok('100 changed settings use two reads (including response) and one data write',reads===2&&writes===1);
ok('all requested values read back correctly',rows.every(r=>result[r.key]==='new'));
const logs=s.DB.all('AuditLog').filter(r=>r.entity==='Settings'&&r.userId===owner.userId&&r.action==='UPDATE');
ok('per-key audit history retained for all 100 changes',logs.length===100);
ok('audit before/after + actor retained',logs.every(r=>JSON.parse(r.before).value==='old'&&JSON.parse(r.after).value==='new'&&r.username==='owner'));
const ts=s.DB.findOne('Settings',r=>r.key===rows[0].key).updatedAt;
reset();save(values);console.log('100 unchanged settings: reads='+reads+' writes='+writes);
ok('unchanged save reads once and writes zero data rows',reads===1&&writes===0);
ok('unchanged save does not alter timestamps',s.DB.findOne('Settings',r=>r.key===rows[0].key).updatedAt===ts);
const extra={};for(let i=0;i<30;i++)extra['perf.new.'+i]=i;
reset();const added=save(extra);
ok('new settings appended in one range write',writes===1);
ok('numbers serialized as strings, matching prior setSetting behavior',added['perf.new.12']==='12');
reset();const single=s.DB.setSetting('perf.new.12','single',owner);
ok('single-key helper still returns a record',single.key==='perf.new.12'&&single.id&&single.value==='single');
reset();s.DB.setSetting('perf.new.12','single',owner);
ok('single unchanged setting also skips writes',writes===0);
reset();save({'perf.setting.0':'sparse-a','perf.setting.99':'sparse-z'});
ok('sparse save touches only changed rows',writes===2&&ranges.every(r=>r.count===1));
ok('unrelated middle row preserved',s.DB.findOne('Settings',r=>r.key==='perf.setting.50').value==='new');
reset();let denied=false;try{s.ROUTES['system.settings.save']({values:{'perf.setting.0':'unauthorized'}},{permissions:[],role:'OTHER'});}catch(e){denied=true;}
ok('unauthorized save rejected before table writes',denied&&writes===0);
reset();const patched=s.DB.updateMany('Settings',rows.map(r=>({id:r.id,patch:{value:'batch'}})));
console.log('100 updateMany patches: reads='+reads+' writes='+writes);
ok('updateMany uses one snapshot read, not one read per row',reads===1&&writes===1);
ok('all batched patches succeed',patched.length===100&&patched.every(r=>r.ok));
const dup=s.DB.updateMany('Settings',[{id:rows[0].id,patch:{value:'first'}},{id:rows[0].id,patch:{type:'retained'}},{id:'missing-id',patch:{value:'no'}}]);
ok('missing row remains an explicit error result',dup[2].ok===false);
const r=s.DB.byId('Settings',rows[0].id);
ok('multiple patches to the same row merge in order',r.value==='first'&&r.type==='retained');

const originalLock=services.LockService.getScriptLock;
let releases=0;
services.LockService.getScriptLock=()=>({hasLock:()=>false,tryLock:ms=>{ok('settings lock wait bounded at two seconds',ms===2000);return false;},releaseLock:()=>{releases++;}});
reset();let busy='';try{s.DB.setSetting('busy','no',owner);}catch(e){busy=e.message;}
ok('lock contention fails clearly without data read/write',/SETTINGS_BUSY/.test(busy)&&reads===0&&writes===0&&releases===0);
let events=[];const originalFlush=services.SpreadsheetApp.flush;
services.SpreadsheetApp.flush=()=>events.push('flush');
services.LockService.getScriptLock=()=>({hasLock:()=>false,tryLock:()=>{events.push('acquire');return true;},releaseLock:()=>events.push('release')});
s.DB.setSetting('perf.new.12','locked',owner);
ok('pending writes flushed before releasing acquired lock',events.join(',')==='acquire,flush,release');
events=[];
services.LockService.getScriptLock=()=>({hasLock:()=>true,releaseLock:()=>events.push('BAD-release')});
s.DB.setSetting('perf.new.12','outer-locked',owner);
ok('does not release a caller-owned lock',events.length===0);
services.LockService.getScriptLock=originalLock;services.SpreadsheetApp.flush=originalFlush;

// A later failed range must not hide an earlier successful write or strand a lock.
const normalRange=sh.getRange;
let attemptedWrites=0;
sh.getRange=function(...args){const range=normalRange.apply(sh,args),fn=range.setValues.bind(range);range.setValues=v=>{attemptedWrites++;if(attemptedWrites===2)throw new Error('injected write failure');return fn(v);};return range;};
let failure='';try{save({'perf.setting.0':'partial-success','perf.setting.99':'not-written'});}catch(e){failure=e.message;}
sh.getRange=normalRange;
ok('write failure surfaced and cached Settings invalidated',failure==='injected write failure'&&!s.DB._rows.Settings);
ok('successful range survives without pretending later range succeeded',s.DB.findOne('Settings',r=>r.key==='perf.setting.0').value==='partial-success'&&s.DB.findOne('Settings',r=>r.key==='perf.setting.99').value!=='not-written');
ok('successful range audit retained after later failure',s.DB.all('AuditLog').some(r=>r.entity==='Settings'&&r.action==='UPDATE'&&JSON.parse(r.after||'{}').value==='partial-success'));

// Diagnostic must not seed, read full sheets, call providers, or touch credentials.
const originals={setup:s.Setup.setupAll,all:s.DB.all,fetch:services.UrlFetchApp.fetch,key:s.AI.getKey};
s.Setup.setupAll=()=>{throw new Error('must not setup');};s.DB.all=()=>{throw new Error('must not read full tables');};
services.UrlFetchApp.fetch=()=>{throw new Error('must not call provider');};s.AI.getKey=()=>{throw new Error('must not access key');};
let output=[];const logger=s.Logger.log;s.Logger.log=(x)=>output.push(x);
const diagnosis=s.diagnosePerformance();
ok('performance diagnostic returns five bounded-scope checks',diagnosis.readOnly&&diagnosis.checks.length===5);
ok('diagnostic does not rely on expensive or credential paths',diagnosis.checks.every(r=>!r.error));
ok('beginner diagnostic RETURNS and logs same report',output.length===1&&JSON.parse(output[0]).version===diagnosis.version);
ok('diagnostic timings are nonnegative measurements',diagnosis.totalMs>=0&&diagnosis.checks.every(r=>r.ms>=0));
s.Setup.setupAll=originals.setup;s.DB.all=originals.all;services.UrlFetchApp.fetch=originals.fetch;s.AI.getKey=originals.key;s.Logger.log=logger;
console.log('SETTINGS PERFORMANCE: '+passed+' PASS, 0 FAIL');
