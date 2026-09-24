#!/usr/bin/env node
'use strict';
const assert=require('assert'),path=require('path');
const {loadBackend}=require('./mock_gs');
let passed=0;function ok(n,c){assert(c,n);passed++;console.log('PASS '+n);}
const make=()=>loadBackend(path.join(__dirname,'../apps-script'));
function empty(s,name){const sh=s.DB.sheet(name);if(sh.getLastRow()>1)sh.deleteRows(2,sh.getLastRow()-1);}
{
 const {sandbox:s,services}=make();let r=s.setupAll();const id=r.spreadsheetId;
 ok('fresh setup completes only with physical seed verification',r.complete&&r.seedCounts.Users===10&&r.seedCounts.Locations===3);
 ok('fresh result exposes phase and exact database URL',r.phase==='COMPLETE'&&r.url.includes(id));
 const props=services.PropertiesService.getScriptProperties();props.setProperty('AI_KEY_GEMINI','TEST-PRESERVE-PRIVATE');
 const names=s.setupSeedPlan_().flatMap(p=>Array.from(p.tables));
 names.forEach(n=>s.DB.all(n));names.forEach(n=>empty(s,n)); // leave warm cache and a completed checkpoint
 const diag=s.diagnoseSeedData();
 ok('diagnostic bypasses warm cache and detects all empty seed tables',!diag.ready&&diag.missing.length===names.length);
 ok('diagnostic returns linked spreadsheet, not active browser sheet',diag.spreadsheetId===id);
 ok('diagnostic never includes API key or hashes',!JSON.stringify(diag).includes('TEST-PRESERVE-PRIVATE')&&!JSON.stringify(diag).includes('passwordHash'));
 r=s.setupAll();
 ok('completed-but-empty checkpoint is repaired rather than falsely accepted',r.complete&&r.recoveryDetected.length===names.length&&r.seedCounts.Users===10);
 ok('recovery keeps exact same spreadsheet binding',r.spreadsheetId===id&&props.getProperty('SPREADSHEET_ID')===id);
 ok('all required tables now physically contain valid rows',s.diagnoseSeedData().ready);
 ok('groups/users (9 staff + demo)/branches recovered',s.DB.all('Groups',true).length===5&&s.DB.all('Users',true).length===10&&s.DB.all('Locations',true).length===3);
 const owner=s.DB.all('Users',true).find(u=>u.username==='owner');
 ok('initial owner password hash verifies after recovery',s.U.hashPassword('admin123',owner.salt).hash===owner.passwordHash);
 ok('keys retained in Script Properties',props.getProperty('AI_KEY_GEMINI')==='TEST-PRESERVE-PRIVATE');
 const users=JSON.stringify(s.DB.all('Users',true));
 s.DB.setSetting('businessName','KEEP BUSINESS');s.DB.insert('Sales',{id:'KEEP-SALE',total:123});
 const itemsBefore=s.DB.count('Items'),custBefore=s.DB.count('Customers');
 empty(s,'Translations');empty(s,'Bins');
 r=s.repairSeedData();
 ok('live DB par demo seeding SKIP (zinda business ke data mein demo nahi ghusa)',r.demoDataSkipped===true&&s.DB.count('Items')===itemsBefore&&s.DB.count('Customers')===custBefore);
 ok('explicit recovery restores empty translation/bin tables',r.complete&&r.seedCounts.Translations>0&&r.seedCounts.Bins===36);
 ok('existing user IDs, hashes, salts and roles unchanged',JSON.stringify(s.DB.all('Users',true))===users);
 ok('existing business setting preserved',s.DB.settings().businessName==='KEEP BUSINESS');
 ok('existing sale untouched',s.DB.byId('Sales','KEEP-SALE').total==='123');
 const counts=JSON.stringify(r.seedCounts);r=s.repairSeedData();
 ok('repeated recovery creates no duplicate defaults',r.attempted.length===0&&JSON.stringify(r.seedCounts)===counts);
 ok('transactions and product rows are not fabricated',s.DB.count('Payments')===0&&s.DB.count('Items')===itemsBefore);
 // A no-op seed cannot advance the completion checkpoint.
 empty(s,'Users');const original=s.Setup.seedGroupsAndUsers;s.Setup.seedGroupsAndUsers=()=>{};
 let err='';try{s.setupAll();}catch(e){err=e.message;}
 ok('seed no-op is surfaced instead of reporting success',/SEED_VERIFY_FAILED.*seedGroupsAndUsers/.test(err));
 const cp=JSON.parse(props.getProperty('SETUP_PROGRESS_V212'));
 ok('failed seed retains retry position',cp.next===Object.keys(s.SCHEMA).length+1);
 s.Setup.seedGroupsAndUsers=original;
 ok('rerun after failure safely resumes',s.setupAll().complete&&s.DB.all('Users',true).length>=9);
 empty(s,'Accounts');const account=s.Accounting.seedAccounts;s.Accounting.seedAccounts=()=>{throw new Error('ACCOUNT-SEED-FAIL');};
 let accountError='';try{s.repairSeedData();}catch(e){accountError=e.message;}
 ok('account-seeding exceptions no longer swallowed',accountError==='ACCOUNT-SEED-FAIL');
 s.Accounting.seedAccounts=account;ok('account recovery succeeds after underlying issue resolved',s.repairSeedData().complete);
 // Cache identity follows spreadsheet ID; reset drops per-execution rows too.
 const cacheA=s.DB.cacheKey('Users');s.DB.all('Users');
 const other=services.SpreadsheetApp.create('SECOND TEST DB');props.setProperty('SPREADSHEET_ID',other.getId());s.DB.resetConnection();
 ok('resetConnection clears row and row-index memos',Object.keys(s.DB._rows).length===0&&Object.keys(s.DB._rowIdx).length===0);
 ok('sheet caches namespaced by spreadsheet ID',s.DB.cacheKey('Users')!==cacheA);
 ok('old DB users not returned for a new DB',s.DB.all('Users').length===0);
 Object.keys(s.SCHEMA).forEach(n=>s.Setup.createSheet(n));
 const result=s.repairSeedData();
 ok('explicit recovery populates the linked headers-only second DB',result.complete&&result.spreadsheetId===other.getId()&&result.seedCounts.Users===10);
 props.setProperty('SPREADSHEET_ID',id);s.DB.resetConnection();
 ok('switching back preserves original database',s.DB.byId('Sales','KEEP-SALE').total==='123');
}
{
 const {sandbox:s,services}=make();const props=services.PropertiesService.getScriptProperties();
 ok('read-only diagnostic handles absent binding without creating DB',!s.diagnoseSeedData().ready&&!props.getProperty('SPREADSHEET_ID'));
 let e='';try{s.repairSeedData();}catch(err){e=err.message;}
 ok('recovery refuses to silently create an unrelated spreadsheet',/No spreadsheet linked/.test(e)&&!props.getProperty('SPREADSHEET_ID'));
 s.setupAll();
 const original=s.Setup.seedLocations;empty(s,'Locations');empty(s,'Users');
 const RealDate=s.Date;let now=RealDate.now();s.Date=class extends RealDate{static now(){return now;}};
 s.Setup.seedLocations=()=>{original();now+=46000;};
 const partial=s.repairSeedData();
 ok('recovery yields honestly at cooperative deadline',!partial.complete&&partial.attempted.length===1&&partial.missingSeedTables.includes('Users'));
 s.Setup.seedLocations=original;s.Date=RealDate;
 ok('repeat resumes from actual missing data and completes',s.repairSeedData().complete);
 const getLock=services.LockService.getScriptLock;let released=false;
 services.LockService.getScriptLock=()=>({tryLock:()=>false,releaseLock:()=>{released=true;}});
 const busy=s.repairSeedData();ok('concurrent recovery returns busy without releasing another lock',busy.busy&&!busy.complete&&!released);
 services.LockService.getScriptLock=getLock;
 const all=s.DB.all;s.DB.all=()=>{throw new Error('diagnostic must bypass DB caches');};
 let logs=[];s.Logger.log=x=>logs.push(String(x));const report=s.diagnoseSeedData();s.DB.all=all;
 ok('diagnostic reads physical sheets, returns AND logs report',report.ready&&logs.some(x=>x.includes('"ready": true')));
}
// The schema gate must not attribute a later unrelated array to insertMany.
{
 const fs=require('fs'),os=require('os'),cp=require('child_process');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'seed-schema-'));
 try {
  fs.mkdirSync(path.join(dir,'tools'));fs.mkdirSync(path.join(dir,'apps-script'));
  fs.copyFileSync(path.join(__dirname,'audit_schema.js'),path.join(dir,'tools/audit_schema.js'));
  for(const name of fs.readdirSync(path.join(__dirname,'../apps-script')).filter(n=>n.endsWith('.gs')))
   fs.copyFileSync(path.join(__dirname,'../apps-script',name),path.join(dir,'apps-script',name));
  const fixture=path.join(dir,'apps-script/Fixture.gs');
  fs.writeFileSync(fixture,"DB.insertMany('Groups', mappedRows); var unrelated=[{u:'staff',pw:'fixture'}];");
  let run=cp.spawnSync(process.execPath,[path.join(dir,'tools/audit_schema.js')],{encoding:'utf8'});
  ok('schema auditor does not scan beyond variable/mapped batch argument',run.status===0);
  fs.appendFileSync(fixture,"DB.insertMany('Groups', [{id:'g',notAColumn:'bad'}]);");
  run=cp.spawnSync(process.execPath,[path.join(dir,'tools/audit_schema.js')],{encoding:'utf8'});
  ok('schema auditor still rejects real unknown literal fields',run.status!==0&&run.stdout.includes('Groups.notAColumn'));
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
}
console.log('SEED RECOVERY: '+passed+' PASS, 0 FAIL');
