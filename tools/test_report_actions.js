'use strict';
const assert=require('assert'),path=require('path'),pp=require('puppeteer');let count=0;
const ok=(s,v)=>{assert(v,s);count++;console.log('PASS '+s);};
(async()=>{const browser=await pp.launch({args:['--no-sandbox']});try{
const page=await browser.newPage();await page.goto('file://'+path.join(__dirname,'../demo/index.html'),{waitUntil:'load'});
await page.evaluate(async()=>{
 window.events=[];window.testMode='ok';window.printCount=0;window.downloadResult=null;window.pendingResolve=null;
 window.tab={closed:false,document:{write(v){events.push(['write',v]);},open(){},close(){}},location:{replace(v){events.push(['navigate',v]);}},focus(){},print(){printCount++;},close(){this.closed=true;events.push(['closed']);}};
 window.open=()=>{events.push(['open',navigator.userActivation.isActive]);tab.closed=false;return testMode==='blocked'?null:tab;};
 UI.toast=(m,k)=>events.push(['toast',m,k]);
 window.downloadCsv=(csv,name)=>downloadResult={csv,name};
 API.call=async(action,p)=>{
  if(action==='dayreport.list')return [{id:'REPORT-TEST',reportNo:'DAYREP-SDQ-00002',kind:'CLOSE',date:'2026-09-19'}];
  events.push(['rpc',action,p.id]);
  if(testMode==='error')throw Error('Server report failure');
  if(action==='dayreport.csv')return {csv:'Field,Value\nReport,DAYREP-SDQ-00002',filename:'day.csv'};
  return await new Promise(resolve=>{pendingResolve=()=>resolve(testMode==='missing'?{}:action==='dayreport.pdf'?{url:'https://drive.google.com/file/d/test/view'}:{html:'<!doctype html><html><body>Saved report 2026-09-19</body></html>'});});
 };
 document.body.innerHTML='';document.body.appendChild(HA_DayReport.historyCard());
});await page.waitForSelector('button[title="Print / PDF"]');
for(const width of [390,1024,1440]){await page.setViewport({width,height:900});ok(width+' rendered report controls present',await page.$$eval('button',b=>['Print / PDF','PDF download','CSV / Excel','WhatsApp / share'].every(t=>b.some(x=>x.title===t))));}
await page.click('button[title="Print / PDF"]');let events=await page.evaluate(()=>events);
ok('print reserves tab synchronously before RPC',events[0][0]==='open'&&events[0][1]===true&&events.findIndex(e=>e[0]==='rpc')>0);
ok('print waits for successful report response',await page.evaluate(()=>printCount===0));
await page.evaluate(()=>pendingResolve());await page.waitForFunction(()=>printCount===1);
ok('print writes the returned report and invokes print once',await page.evaluate(()=>events.some(e=>e[0]==='write'&&e[1].includes('Saved report'))&&printCount===1));
await page.evaluate(()=>events=[]);await page.click('button[title="PDF download"]');events=await page.evaluate(()=>events);
ok('PDF also reserves tab inside user gesture before RPC',events[0][0]==='open'&&events[0][1]===true&&events.some(e=>e[0]==='rpc'&&e[1]==='dayreport.pdf'));
await page.evaluate(()=>pendingResolve());await page.waitForFunction(()=>events.some(e=>e[0]==='navigate'));
ok('PDF navigates reserved tab to returned Drive file',await page.evaluate(()=>events.some(e=>e[0]==='navigate'&&e[1]==='https://drive.google.com/file/d/test/view')));
await page.click('button[title="CSV / Excel"]');ok('CSV button delivers data and filename',await page.evaluate(()=>downloadResult.name==='day.csv'&&downloadResult.csv.includes('DAYREP')));
await page.evaluate(()=>{testMode='blocked';events=[];});await page.click('button[title="Print / PDF"]');
ok('blocked popup gives visible advice without a server request',await page.evaluate(()=>events.some(e=>e[0]==='toast'&&e[2]==='warn')&&!events.some(e=>e[0]==='rpc')));
await page.evaluate(()=>{testMode='error';events=[];});await page.click('button[title="PDF download"]');
ok('server failure closes placeholder and displays error',await page.evaluate(()=>tab.closed&&events.some(e=>e[0]==='toast'&&e[1]==='Server report failure')));
await page.evaluate(()=>{testMode='missing';events=[];});await page.click('button[title="PDF download"]');await page.evaluate(()=>pendingResolve());
ok('missing PDF URL is not falsely reported as success',await page.evaluate(()=>tab.closed&&events.some(e=>e[0]==='toast'&&e[2]==='err')));
console.log('REPORT ACTIONS: '+count+' PASS, 0 FAIL');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
