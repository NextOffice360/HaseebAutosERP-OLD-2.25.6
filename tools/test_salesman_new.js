/**
 * Quick salesman 9-item flow check
 */
const path=require('path');
const {loadBackend}=require('./mock_gs');
const DIR=path.join(__dirname,'..','apps-script');
const {sandbox}=loadBackend(DIR);
const {api, Setup, DB, U}=sandbox;
Setup.setupAll(); Setup.seedAll(); Setup.seedProducts({stock:50});

function today(){return new Date().toISOString().slice(0,10);}

let pass=0,fail=0;
function ok(name,cond,detail){
  if(cond){pass++; console.log(' ✔ '+name);}
  else {fail++; console.log(' ✖ '+name+' → '+(detail||''));}
}

// login as owner
let res=api('auth.login',{username:'owner', password:'admin123'});
if(!res.ok) throw new Error('login failed '+JSON.stringify(res));
let TOKEN=res.data.token;
function call(action,payload){
  let r=api(action, Object.assign({token:TOKEN}, payload||{}));
  if(!r.ok) throw new Error(action+' failed '+JSON.stringify(r.error||r));
  return r.data;
}
const LOC=DB.all('Locations')[0].id;
console.log('LOC',LOC);
// find salesman user
let smUser=DB.all('Users').find(u=>['SALESMAN','MANAGER','OWNER'].includes(String(u.role).toUpperCase()));
if(!smUser) throw new Error('no salesman');
console.log('salesman',smUser.id,smUser.name, smUser.role);
let smId=smUser.id;

// ensure items exist
let items=DB.all('Items').slice(0,3);
console.log('items',items.map(i=>i.code));
if(items.length<2) throw new Error('need 2 items');

// 1) create route
let cust=DB.all('Customers')[0]||DB.all('Customers');
console.log('customers',DB.all('Customers').length);
let custId=DB.all('Customers')[0]?.id || '';
let routeCreated=call('salesman.route.save',{route:{ name:'Test Tour-'+Date.now(), salesmanId:smId, days:['MON','WED'], customerIds: custId?[custId]:[], targetValue:50000, locationId:LOC }});
console.log('routeCreated',routeCreated);
ok('route created', !!routeCreated.id);
let routeId=routeCreated.id;

// 2) Issue stock with enriched fields
let issueRes=call('salesman.issue',{
  salesmanId: smId, locationId:LOC,
  purpose:'TOUR_SUPPLY', reason:'Weekly tour supply', routeId:routeId, area:'Model Town', customerId:custId, reference:'REF-001',
  date: today(),
  items: items.slice(0,2).map(it=>({itemId:it.id, qty:10, cost:Number(it.costPrice||100)}))
});
console.log('issue',issueRes);
ok('issue has issueNo', !!issueRes.issueNo);
ok('issue purpose stored', DB.all('SalesmanIssues').find(r=>r.id===issueRes.id)?.purpose==='TOUR_SUPPLY');
ok('issue area stored', DB.all('SalesmanIssues').find(r=>r.id===issueRes.id)?.area==='Model Town');
ok('issue customer stored', DB.all('SalesmanIssues').find(r=>r.id===issueRes.id)?.customerId===custId);
let issueId=issueRes.id;
let stockAfterIssue=DB.all('SalesmanStock').filter(r=>r.salesmanId===smId);
console.log('stock after issue', stockAfterIssue.map(r=>({item: r.itemId.slice(0,4), qty:r.qty})));

// 3) Check stock
let stockRes=call('salesman.stock',{salesmanId:smId, locationId:LOC});
ok('stock has rows', (stockRes.rows||[]).length>=2);
console.log('stock rows', stockRes.rows.slice(0,2));

// 4) Sale via salesman (consume stock) - salesman sale consumes salesman stock
let saleRes=call('sales.create',{
  locationId:LOC, customerId:custId||'', customerName:'Walkin', salespersonId:smId, source:'SALESMAN',
  items: [{itemId:items[0].id, qty:3, price: Number(items[0].retailPrice||200)}],
  payments: [{method:'CASH', amount: 3*Number(items[0].retailPrice||200)}],
  date: today()
});
console.log('sale',saleRes?.invoiceNo||saleRes);
let stockAfterSale=DB.all('SalesmanStock').find(r=>r.salesmanId===smId && r.itemId===items[0].id);
console.log('stock after sale (should be 7)', stockAfterSale?.qty);
ok('sale consumed salesman stock 10->7', Number(stockAfterSale?.qty)===7);

// 5) Trace
let trace=call('salesman.trace',{issueId:issueId});
console.log('trace totals',trace.totals);
ok('trace has items', Array.isArray(trace.items) && trace.items.length===2);
let firstTrace=trace.items.find(x=>x.itemId===items[0].id);
ok('trace remaining 7 for first item (10-3)', firstTrace && firstTrace.remaining===7, JSON.stringify(firstTrace));
ok('trace issued 10', firstTrace.issued===10);
ok('trace sold 3', firstTrace.sold===3);

// 6) issuesForReturn should show remaining
let forReturn=call('salesman.issuesForReturn',{salesmanId:smId, locationId:LOC, onlyWithRemaining:true});
console.log('issuesForReturn',forReturn.map(r=>({no:r.issueNo, rem: r.remainingValue, remainingQty:r.remainingQty})));
ok('issuesForReturn finds our issue', forReturn.some(r=>r.id===issueId));

// 7) Return via issue with guard — try over-return should clamp / error?
let overReturnTry=false;
try{
  call('salesman.return',{salesmanId:smId, locationId:LOC, issueId:issueId, items:[{itemId:items[0].id, qty:100, cost:Number(items[0].costPrice||100)}]});
  overReturnTry=true;
  console.log('over-return did not throw, checking clamp');
}catch(e){
  console.log('over-return threw as expected',e.message.slice(0,120));
  overReturnTry=false;
}
// after over-return, stock should be clamped to remaining (7) not 100
let stockAfterOver=DB.all('SalesmanStock').find(r=>r.salesmanId===smId && r.itemId===items[0].id);
console.log('stock after over-return attempt', stockAfterOver?.qty);
// if over-return succeeded, qty should be 0? Let's see: if clamped to remaining, stock goes 7->0? Actually issue remaining 7, second item remaining 10, so return 7 would clear first item?
// We'll check: if overReturnTry false, means guard blocked, stock stays 7
if(!overReturnTry) ok('over-return guarded (no over-return)', Number(stockAfterOver?.qty)===7);
else {
  // if it allowed but clamped
  ok('over-return clamped to remaining (stock 7 + 10? )', Number(stockAfterOver?.qty) >=0 && Number(stockAfterOver?.qty) <=7);
}

// Now do a valid return of 2 from first item (remaining 7 -> 5)
let retRes=call('salesman.return',{salesmanId:smId, locationId:LOC, issueId:issueId, reason:'Unsold', date:today(), items:[{itemId:items[0].id, qty:2, cost:Number(items[0].costPrice||100)}]});
console.log('valid return',retRes);
ok('valid return has returnNo', !!retRes.returnNo);
let stockAfterReturn=DB.all('SalesmanStock').find(r=>r.salesmanId===smId && r.itemId===items[0].id);
console.log('stock after valid return 7->5?', stockAfterReturn?.qty);
ok('valid return reduces salesman stock 7->5', Number(stockAfterReturn?.qty)===5);
ok('return linked to issueId', DB.all('SalesmanReturns').find(r=>r.id===retRes.id)?.issueId===issueId);

// 8) Ledger
let ledger=call('salesman.ledger',{salesmanId:smId, locationId:LOC, limit:20});
console.log('ledger rows',ledger.rows.slice(0,3).map(r=>({type:r.type, ref:r.refNo, amt:r.amount})));
ok('ledger has ISSUE', ledger.rows.some(r=>r.type==='ISSUE'));
ok('ledger has SALE', ledger.rows.some(r=>r.type==='SALE'));
ok('ledger has RETURN', ledger.rows.some(r=>r.type==='RETURN'));

// 9) Collect payment (Wasooli) — need customer ledger balance
// create a customer invoice with due to have collect
let custBalBefore=call('customers.ledger',{id:custId});
console.log('cust bal before', custBalBefore.closing);
// make a credit sale for wasooli target
let creditSale=call('sales.create',{
  locationId:LOC, customerId:custId, customerName:DB.all('Customers').find(c=>c.id===custId)?.name||'Cust',
  salespersonId:smId, source:'SALESMAN',
  items:[{itemId:items[1].id, qty:2, price: Number(items[1].retailPrice||300)}],
  payments:[{method:'CASH', amount:0}],
  date:today()
});
console.log('credit sale',creditSale.invoiceNo);
let custBalAfterInvoice=call('parties.balance',{partyType:'CUSTOMER', id:custId});
console.log('cust balance after',custBalAfterInvoice);
let prevBal=Number(custBalAfterInvoice.balance||custBalAfterInvoice.bal||0);
ok('customer has balance after credit sale', prevBal>0);
let collectRes=call('salesman.collect',{payment:{
  customerId:custId, amount: Math.min(1000, prevBal), prevBalance: prevBal, method:'CASH', reference:'TXN123', date:today(), collectorId:smId, locationId:LOC, notes:'Test wasooli'
}});
console.log('collect',collectRes);
ok('collect creates payment', !!collectRes.voucherNo||!!collectRes.id);
ok('collect prev/new balances', collectRes.prevBalance===prevBal && collectRes.newBalance===prevBal-Number(collectRes.amount));
let custBalAfterCollect=call('parties.balance',{partyType:'CUSTOMER', id:custId});
console.log('cust balance after collect',custBalAfterCollect.balance);
ok('customer balance reduced by collect', Number(custBalAfterCollect.balance)=== prevBal - Number(collectRes.amount));

// 10) Payments history
let pays=call('salesman.payments',{salesmanId:smId, locationId:LOC});
console.log('payments history', pays.slice(0,2).map(p=>({voucher:p.voucherNo, amt:p.amount, cust:p.partyName})));
ok('payments history contains our collect', pays.some(p=>p.reference==='TXN123' || p.amount===collectRes.amount));

// 11) Performance
let perf=call('salesman.performance',{salesmanId:smId, locationId:LOC});
console.log('performance totals',perf.totals);
console.log('performance rating',perf.rating);
console.log('byCustomer',perf.byCustomer?.slice(0,2));
console.log('byRoute',perf.byRoute?.slice(0,2));
ok('performance has totals', !!perf.totals && perf.totals.issuedQty>0);
ok('performance rating 0-5', perf.rating.score>=0 && perf.rating.score<=5);
ok('performance byCustomer populated (if customer tagged)', Array.isArray(perf.byCustomer));
ok('performance byRoute populated', Array.isArray(perf.byRoute));
ok('performance collection stats', typeof perf.collection.rate==='number');

// 12) login showDemo toggle
let loginCfg=call('system.loginConfig',{});
console.log('loginConfig',loginCfg);
ok('loginConfig returns bool', typeof loginCfg.showDemo==='boolean' || typeof loginCfg.showDemo==='string');

// Check issue second time with same item but different route/area — trace second issue separate
let issue2=call('salesman.issue',{
  salesmanId: smId, locationId:LOC, purpose:'AREA_SUPPLY', area:'Cantt', reference:'REF-002', date:today(),
  items: [{itemId:items[0].id, qty:5, cost:Number(items[0].costPrice||100)}]
});
console.log('second issue',issue2.issueNo);
let trace2=call('salesman.trace',{issueId:issue2.id});
ok('second trace isolated', trace2.items.length===1 && trace2.items[0].issued===5);

console.log('\n=== RESULT ===');
console.log('PASS',pass,'FAIL',fail);
if(fail) process.exit(1);
