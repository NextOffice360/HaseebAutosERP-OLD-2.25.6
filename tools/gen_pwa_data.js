/**
 * gen_pwa_data.js — PWA demo ke liye ASLI backend se bootstrap data nikalta hai.
 *
 *   node tools/gen_pwa_data.js > tools/pwa-demo-data.json
 *
 * Ye zaroori kyun hai: preview mein invent kiya hua data dikhaana aasan tha,
 * lekin phir preview asli app se alag cheez dikhaata. Yahan hum wahi
 * `Pwa.bootstrap()` chalate hain jo production mein chalta hai — to preview
 * aur asli app mein koi farq nahi.
 *
 * Isi wajah se "Salesman.stock() array nahi deta" wala bug preview mein bhi
 * nazar aata (aur test mein pakda gaya).
 */
const path = require('path');
const { loadBackend } = require('./mock_gs');

const DIR = path.join(__dirname, '..', 'apps-script');
const { sandbox } = loadBackend(DIR);

/* ---- seed: bilkul wahi data jo demo ERP app dikhata hai ---- */
try { sandbox.Setup.setupAll(); } catch (e) { console.error('setupAll: ' + e.message); }
try { sandbox.Setup.seedAll(); } catch (e) { console.error('seedAll: ' + e.message); }
try { sandbox.Setup.seedProducts({ stock: 20 }); } catch (e) { console.error('seedProducts: ' + e.message); }

/* ---- owner session (Pwa.bootstrap ko permissions chahiye) ---- */
let session = { userId: 'U-OWNER', role: 'Owner' };
try {
  const r = sandbox.api('auth.login', { username: 'owner', password: 'admin123' });
  if (r && r.ok && r.data && r.data.session) session = r.data.session;
} catch (e) { /* seed users na mile to default session hi kaafi hai */ }

const LOC = 'LOC-SDQ';
const out = { generatedAt: new Date().toISOString(), apps: {} };

/* ---- preview mein khaali list na dikhe: thoda real data seed kar dete hain
        (har cheez backend ke APNE routes se — koi invent kiya hua JSON nahi) ---- */
function seedPreviewData() {
  const loc = (sandbox.DB.all('Locations')[0] || {}).id || LOC;

  /* customers — field order + udhaar wasooli ke liye */
  const CUSTOMERS = [
    { name: 'Ali Motors', phone: '0300-1112233', address: 'Main Bazar, Sadiqabad' },
    { name: 'Khan Autos', phone: '0301-4455667', address: 'Bypass Road' },
    { name: 'Rana Repair Works', phone: '0333-7788990', address: 'Katchery Road' },
    { name: 'Bilal Traders', phone: '0345-2211445', address: 'Railway Road' },
    { name: 'Usman Car Decor', phone: '0312-9988776', address: 'City Center' }
  ];
  CUSTOMERS.forEach((c) => {
    try { sandbox.api('customers.save', Object.assign({ token }, { customer: c })); } catch (e) { }
  });

  /* suppliers — GRN receive ke liye */
  ['Flamingo Auto Industries', 'Zahid Traders', 'Pak Auto Spares'].forEach((name) => {
    try { sandbox.api('suppliers.save', Object.assign({ token }, { supplier: { name: name, phone: '0300-0000000' } })); } catch (e) { }
  });

  /* ek APPROVED PO — warehouse "Receive ke liye" list mein nazar aaye */
  try {
    const sup = sandbox.DB.all('Suppliers')[0];
    const items = sandbox.DB.all('Items').slice(0, 3);
    if (sup && items.length) {
      const po = sandbox.api('purchase.po.save', Object.assign({ token }, {
        po: { supplierId: sup.id, locationId: loc, expectedDate: '',
          items: items.map((i) => ({ itemId: i.id, qty: 20, rate: Number(i.costPrice) || 100 })) }
      }));
      if (po && po.data && po.data.id) {
        try { sandbox.api('purchase.po.approve', Object.assign({ token }, { id: po.data.id })); } catch (e) { }
      }
    }
  } catch (e) { console.error('po seed: ' + e.message); }

  /* ek open count sheet — warehouse "Count" tab ke liye */
  try {
    sandbox.api('warehouse.count.create', Object.assign({ token }, { locationId: loc, category: '' }));
  } catch (e) { console.error('count sheet: ' + e.message); }

  /* salesman ko stock issue — "Mera stock" tab ke liye
     NOTE: Salesman.issue(payload, s) mein payload.items ARRAY mangta hai */
  try {
    const items = sandbox.DB.all('Items').slice(0, 8);
    if (items.length) {
      sandbox.api('salesman.issue', Object.assign({ token }, {
        salesmanId: session.userId, locationId: loc,
        items: items.map((i) => ({ itemId: i.id, qty: 12, cost: Number(i.costPrice) || 100 }))
      }));
    }
  } catch (e) { console.error('salesman issue: ' + e.message); }
}

let token = '';
try {
  const lr = sandbox.api('auth.login', { username: 'owner', password: 'admin123' });
  if (lr && lr.ok && lr.data) {
    token = lr.data.token || '';
    if (lr.data.session) session = lr.data.session;
  }
} catch (e) { console.error('login: ' + e.message); }

if (token) seedPreviewData();
else console.error('  (login na ho saka — preview mein lists khaali ho sakti hain)');

['wh', 'fo', 'sm', 'pos'].forEach((app) => {
  try {
    const data = sandbox.Pwa.bootstrap({ app: app, locationId: LOC }, session);
    out.apps[app] = data;
    console.error(`  ✔ ${app}: items=${(data.items || []).length} ` +
      `customers=${(data.customers || []).length} ` +
      `tasks=${(data.tasks || []).length} ` +
      `bins=${(data.bins || []).length} ` +
      `myStock=${(data.myStock || []).length}`);
  } catch (e) {
    out.apps[app] = { error: e.message };
    console.error(`  ✖ ${app}: ${e.message}`);
  }
});

process.stdout.write(JSON.stringify(out));
