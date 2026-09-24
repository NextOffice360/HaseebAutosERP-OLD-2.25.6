const path=require('path');
const {loadBackend}=require('./mock_gs');
const DIR=path.join(__dirname,'..','apps-script');
const {sandbox}=loadBackend(DIR);
const {api, Setup, DB, U}=sandbox;
Setup.setupAll(); Setup.seedAll(); Setup.seedProducts({stock:50});
function today(){return new Date().toISOString().slice(0,10);}
let pass=0,fail=0;
function ok(n,c,d){ if(c){pass++; console.log(' ✔ '+n);} else {fail++; console.log(' ✖ '+n+' → '+(d||''));}}
let res=api('auth.login',{username:'owner',password:'admin123'});
if(!res.ok) throw new Error('login '+JSON.stringify(res));
let TOKEN=res.data.token;
function call(a,p){ let r=api(a,Object.assign({token:TOKEN},p||{})); if(!r.ok) throw new Error(a+' failed '+JSON.stringify(r.error||r)); return r.data; }
const LOC=DB.all('Locations')[0].id;
let smUser=DB.all('Users').find(u=>['SALESMAN','MANAGER','OWNER'].includes(String(u.role).toUpperCase()));
let smId=smUser.id;
console.log('sm',smId, smUser.fullName||smUser.name);
let items=DB.all('Items').slice(0,3);
// create customer via API
let custRes;
try{ custRes=call('customers.save',{customer:{name:'Test Wasooli Cust', phone:'03001234567', address:'Model Town'}}); console.log('cust created',custRes); }catch(e){ console.log('cust create fail',e.message); custRes=DB.all('Customers')[0]; }
let custId=custRes.id||custRes.customerId||custRes.customer?.id||(custRes && custRes.id)||(DB.all('Customers')[0] && DB.all('Customers')[0].id);
if(!custId) { // ensure at least one customer exists, insert directly via DB
  let fakeId='CUS-TEST-'+Date.now();
  DB.insert('Customers',{id:fakeId, code:'C-TST', name:'Test Wasooli Cust', phone:'03001234567', address:'Model Town', balance:'0', creditLimit:'0'});
  custId=fakeId;
}
console.log('custId',custId, DB.byId('Customers',custId)?.name);
let cust=DB.byId('Customers',custId);

// route
let routeCreated=call('salesman.route.save',{route:{ name:'Test Tour-'+Date.now(), salesmanId:smId, days:['MON'], customerIds:[custId], targetValue:50000, locationId:LOC }});
console.log('route',routeCreated.routeNo);
let routeId=routeCreated.id;

// issue
let issueRes=call('salesman.issue',{
  salesmanId: smId, locationId:LOC,
  purpose:'TOUR_SUPPLY', reason:'Weekly', routeId:routeId, area:'Model Town', customerId:custId, reference:'REF-001',
  date: today(),
  items: items.slice(0,2).map(it=>({itemId:it.id, qty:10, cost:Number(it.costPrice||100)}))
});
console.log('issue',issueRes.issueNo, issueRes.total);
ok('issue', !!issueRes.issueNo);
let issueId=issueRes.id;

// sale 3 units of first item
let saleRes=call('sales.create',{
  locationId:LOC, customerId:'', customerName:'Walkin', salespersonId:smId, source:'SALESMAN',
  items: [{itemId:items[0].id, qty:3, price:Number(items[0].retailPrice||200)}],
  payments:[{method:'CASH', amount: 3*Number(items[0].retailPrice||200)}],
  date:today()
});
console.log('sale',saleRes.invoiceNo, saleRes.total);
let held=DB.findOne('SalesmanStock',r=>r.salesmanId===smId && r.itemId===items[0].id);
console.log('held after sale',held.qty);
ok('sold consumes', Number(held.qty)===7);

// trace before return
let trace=call('salesman.trace',{issueId:issueId});
console.log('trace before return',trace.totals, trace.items.map(i=>[i.code,i.issued,i.sold,i.returned,i.remaining]));
ok('trace remaining 7', trace.items.find(x=>x.itemId===items[0].id).remaining===7);

// return normal 2 units (should go 7->5)
let ret1=call('salesman.return',{salesmanId:smId, locationId:LOC, issueId:issueId, reason:'Unsold', items:[{itemId:items[0].id, qty:2, cost:Number(items[0].costPrice)}]});
console.log('ret1',ret1);
ok('ret1 ok', ret1.lines===1);
let held2=DB.findOne('SalesmanStock',r=>r.salesmanId===smId && r.itemId===items[0].id);
console.log('held after ret1',held2.qty);
ok('held 7->5', Number(held2.qty)===5);

// trace after ret1
let trace2=call('salesman.trace',{issueId:issueId});
console.log('trace after ret1',trace2.items.find(x=>x.itemId===items[0].id));
ok('trace2 remaining 5', trace2.items.find(x=>x.itemId===items[0].id).remaining===5);

// try over-return 10 (remaining 5) should clamp to 5
let retOver=call('salesman.return',{salesmanId:smId, locationId:LOC, issueId:issueId, reason:'Over test', items:[{itemId:items[0].id, qty:10, cost:Number(items[0].costPrice)}]});
console.log('retOver',retOver);
let held3=DB.findOne('SalesmanStock',r=>r.salesmanId===smId && r.itemId===items[0].id);
console.log('held after over',held3.qty);
ok('over clamped to remaining 5 ->0', Number(held3.qty)===0);

// ledger should have ISSUE, SALE, RETURN x2, PAYMENT?
let ledger=call('salesman.ledger',{salesmanId:smId, locationId:LOC, limit:100});
console.log('ledger rows',ledger.rows.map(r=>r.type+':'+r.refNo+':'+r.amount));
console.log('DB returns count',DB.all('SalesmanReturns').length, DB.all('SalesmanReturns').map(r=>r.returnNo+':'+r.total));
ok('ledger has ISSUE', ledger.rows.some(r=>r.type==='ISSUE'));
ok('ledger has SALE', ledger.rows.some(r=>r.type==='SALE'));
ok('ledger has RETURN', ledger.rows.some(r=>r.type==='RETURN'));
console.log('ledger total rows',ledger.total);

// credit sale for wasooli
// need to create credit sale with due
let credit=call('sales.create',{
  locationId:LOC, customerId:custId, customerName:cust.name, salespersonId:smId, source:'SALESMAN',
  items: [{itemId:items[1].id, qty:2, price:Number(items[1].retailPrice||300)}],
  payments:[{method:'CASH', amount:0}],
  date:today()
});
console.log('credit invoice',credit.invoiceNo, credit.due, credit.total);
// check parties balance via API
let balInfo=null;
try{ balInfo=call('parties.balance',{partyType:'CUSTOMER', id:custId}); }catch(e){ balInfo=call('customers.ledger',{id:custId}); balInfo={balance: balInfo.closing}; }
console.log('balance',balInfo);
let prevBal=Number(balInfo.balance||balInfo.bal||balInfo.closing||0);
ok('balance >0 after credit', prevBal>0);
let amt=Math.min(500, prevBal);
let coll=call('salesman.collect',{payment:{customerId:custId, amount:amt, prevBalance:prevBal, method:'CASH', reference:'TXN123', date:today(), collectorId:smId, locationId:LOC, notes:'test'}});
console.log('collect',coll);
ok('collect', coll.amount===amt && coll.prevBalance===prevBal && coll.newBalance===prevBal-amt);
// verify balance reduced
let balAfter=null;
try{ balAfter=call('parties.balance',{partyType:'CUSTOMER', id:custId}); }catch(e){ balAfter=call('customers.ledger',{id:custId}); balAfter={balance: balAfter.closing};}
console.log('balance after', (balAfter.balance!==undefined?balAfter.balance:balAfter.bal));
ok('balance reduced', Number(balAfter.balance!==undefined?balAfter.balance:balAfter.bal)===prevBal-amt);

// ledger after collect should have PAYMENT
let ledger2=call('salesman.ledger',{salesmanId:smId, locationId:LOC, from:today(), to:today(), limit:100});
console.log('ledger2 today rows',ledger2.rows.map(r=>r.type+':'+r.refNo));
ok('ledger2 has PAYMENT', ledger2.rows.some(r=>r.type==='PAYMENT'));

// payments history
let pays=call('salesman.payments',{salesmanId:smId, limit:50});
console.log('payments',pays.map(p=>p.voucherNo+':'+p.amount+':'+p.reference));
ok('payments has collect', pays.some(p=>p.reference==='TXN123'));

// performance
let perf=call('salesman.performance',{salesmanId:smId, locationId:LOC});
console.log('perf totals',perf.totals);
console.log('perf rating',perf.rating);
ok('perf issued>0', perf.totals.issuedQty>0);
ok('perf rating 0-5', perf.rating.score>=0 && perf.rating.score<=5);
console.log('byCustomer',perf.byCustomer.slice(0,2));
console.log('byArea',perf.byArea.slice(0,2));
ok('byArea has Model Town', perf.byArea.some(x=>x.label==='Model Town'));

// second issue different area
let issue2=call('salesman.issue',{salesmanId:smId, locationId:LOC, purpose:'AREA_SUPPLY', area:'Cantt', reference:'REF-002', date:today(), items:[{itemId:items[0].id, qty:5, cost:Number(items[0].costPrice)}]});
console.log('issue2',issue2.issueNo);
let trace3=call('salesman.trace',{issueId:issue2.id});
console.log('trace3',trace3.items[0]);
ok('issue2 trace issued 5', trace3.items[0].issued===5);

let loginCfg=call('system.loginConfig',{});
console.log('loginCfg',loginCfg);
ok('loginCfg bool', typeof loginCfg.showDemo==='boolean');

console.log('PASS',pass,'FAIL',fail);
if(fail) process.exit(1);
