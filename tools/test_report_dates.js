'use strict';
const assert=require('assert'),path=require('path'),fs=require('fs');
const {loadBackend}=require('./mock_gs');const {sandbox:s}=loadBackend(path.join(__dirname,'../apps-script'));
let n=0;function ok(label,value){assert(value,label);n++;console.log('PASS '+label);}
s.setupAll();const actor={userId:'OWNER-TEST',username:'owner',role:'OWNER',permissions:['*'],locationId:'LOC-SDQ'};
let err='';try{s.Utilities.formatDate('2026-09-19','Asia/Karachi','yyyy-MM-dd');}catch(e){err=e.message;}
ok('mock enforces Google Date-only formatter signature',/Date required/.test(err));
const fixed=s.U.dateOnly;s.U.dateOnly=d=>s.Utilities.formatDate(d||new Date(),'Asia/Karachi','yyyy-MM-dd');
err='';try{s.Exports.dayReportHtml({openedAt:'2026-09-19T12:29:00',generatedAt:'2026-09-19T12:30:00'});}catch(e){err=e.message;}
// Safe report wrapper catches invalid legacy formatting; demonstrate original direct call too.
try{s.U.dateOnly('2026-09-19T12:29:00');}catch(e){err=e.message;}
ok('old helper reproduces string signature error',/Date required/.test(err));s.U.dateOnly=fixed;
for(const val of ['2026-09-19','2026-09-19T00:01:00','2026-09-19 23:59:59','2026-09-19T12:29:00.123'])ok('local calendar preserved '+val,s.U.dateOnly(val)==='2026-09-19');
ok('month extraction supports persisted string',s.U.monthKey('2026-09-19T12:29:00')==='2026-09');
ok('ISO normalizes date-only at local midnight',s.U.iso('2026-09-19')==='2026-09-19T00:00:00');
ok('valid leap day accepted',s.U.dateOnly('2024-02-29')==='2024-02-29');
for(const v of ['not-a-date','2026-02-30','2026-13-01','2026-09-19T24:00:00',{},new Date(NaN)]){let threw=false;try{s.U.iso(v);}catch(e){threw=/INVALID_DATE/.test(e.message);}ok('invalid date explicitly rejected '+String(v),threw);}
ok('real Date accepted',s.U.dateOnly(new Date('2026-09-19T12:00:00Z'))==='2026-09-19');
const fmt=s.Utilities.formatDate;let instant;
s.Utilities.formatDate=(d,tz,f)=>{instant={ms:d.getTime(),tz};return 'formatted-in-script-timezone';};
ok('offset-aware dates use the Google formatter',s.U.dateOnly('2026-09-19T23:00:00-04:00')==='formatted-in-script-timezone'&&instant.ms===Date.parse('2026-09-19T23:00:00-04:00')&&instant.tz==='Asia/Karachi');
s.U.iso(0);ok('epoch zero is a real instant, not now',instant.ms===0);s.Utilities.formatDate=fmt;
const session=s.Payments.openSession({openingCash:100,locationId:'LOC-SDQ'},actor);
s.DB.update('CashSessions',session.id,{openedAt:'2026-09-19T12:29:00'},actor);s.DB.resetConnection();
const r=s.Reports.dayReport.generate({sessionId:session.id,kind:'OPEN'},actor);
const html=s.Reports.dayReport.html({id:r.id},actor);
ok('persisted report produces full printable HTML',html.html.includes('<html')&&html.html.includes('2026-09-19')&&!html.html.includes('Invalid date'));
const pdf=s.Reports.dayReport.pdf({id:r.id},actor);
ok('history PDF reaches mocked Drive conversion',!!pdf.url&&pdf.format==='PDF');
ok('history PDF preserves report number and OPEN kind',pdf.name.toLowerCase().includes(r.reportNo.toLowerCase())&&pdf.name.endsWith('-open.pdf'));
const csv=s.Reports.dayReport.csv({id:r.id},actor);ok('CSV retains report metadata',csv.csv.includes(r.reportNo)&&csv.filename.endsWith('.csv'));
s.Payments.closeSession({sessionId:session.id,closingCash:100},actor);
s.DB.resetConnection();const closed=s.Reports.dayReport.list({sessionId:session.id},actor).find(r=>r.kind==='CLOSE');
ok('closed persisted session prints and converts too',!!s.Reports.dayReport.html({id:closed.id},actor).html&&!!s.Reports.dayReport.pdf({id:closed.id},actor).url);
ok('legacy session PDF endpoint also succeeds',!!s.Exports.dayReportPdf(session.id,actor).url);
const malformed=s.Exports.dayReportHtml({openedAt:'bad-date',generatedAt:'',moves:[{date:'bad',amount:1}]});ok('malformed legacy dates are labeled without breaking report',malformed.includes('Invalid date')&&!malformed.includes('undefined'));
const noAuth=s.api('dayreport.html',{id:r.id});ok('report routes still reject anonymous callers',noAuth.ok===false);
const mf=JSON.parse(fs.readFileSync(path.join(__dirname,'../apps-script/appsscript.json')));
ok('deployment manifest matches public login page requirement',mf.webapp.access==='ANYONE_ANONYMOUS'&&mf.webapp.executeAs==='USER_DEPLOYING');
ok('manifest declares scope required by native DriveApp exports',mf.oauthScopes.includes('https://www.googleapis.com/auth/drive'));
let logs=[];s.Logger.log=x=>logs.push(String(x));
const auth=s.authorizeReportExports();ok('read-only Drive authorization helper returns and logs',auth.authorized&&logs.some(l=>l.includes('Native Drive access')));
console.log('REPORT DATES: '+n+' PASS, 0 FAIL');
