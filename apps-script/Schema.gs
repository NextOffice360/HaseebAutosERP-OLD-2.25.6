/**
 * HASEEB AUTOS - ERP / POS  ::  SCHEMA
 * ---------------------------------------------------------------------------
 * Har Google Sheet ka naam + uske columns ki single source of truth.
 * Setup.gs isi schema se saari sheets + headers banaata hai.
 * Naya column chahiye? Yahan add karein aur Setup > Repair/Upgrade chalayein.
 */

var SCHEMA = {

  /* ------------------------------- CORE / CONFIG ------------------------ */
  Settings: ['id', 'key', 'value', 'type', 'updatedAt'],
  NumberSeries: ['id', 'entity', 'locationId', 'prefix', 'next', 'padding', 'updatedAt'],
  Locations: ['id', 'code', 'name', 'address', 'phone', 'manager', 'isDefault', 'active', 'createdAt'],

  /* --------------------------------- SECURITY --------------------------- */
  Groups: ['id', 'name', 'type', 'permissions', 'saleReturnLimit', 'dataViewLimit', 'comments', 'active'],
  Users: ['id', 'username', 'fullName', 'passwordHash', 'salt', 'email', 'phone', 'role', 'groupId',
    'locationIds', 'defaultLocationId', 'commissionRate', 'discountLimit', 'active', 'lastLogin', 'createdAt',
    /* v2.1 */ 'prefs',
    /* v2.5: per-user rules — role ke upar allow (extra) ya disallow (denied) */
    'extraPermissions', 'deniedPermissions'],
  AuditLog: ['id', 'ts', 'userId', 'username', 'action', 'entity', 'entityId', 'before', 'after', 'ip', 'locationId'],

  /* ------------------------- v2.3: COMMS / LOYALTY / IMPORT / MIGRATION --- */
  Messages: ['id', 'date', 'channel', 'provider', 'to', 'subject', 'body', 'status',
    'error', 'refType', 'refId', 'createdBy', 'createdAt'],
  LoyaltyLedger: ['id', 'date', 'customerId', 'type', 'points', 'amount', 'refType',
    'refId', 'note', 'expiresAt', 'createdBy', 'createdAt'],
  PriceImports: ['id', 'date', 'supplierId', 'fileName', 'rows', 'updated', 'created',
    'skipped', 'errors', 'notes', 'createdBy', 'createdAt'],
  MigrationLog: ['id', 'date', 'action', 'tables', 'files', 'bytes', 'status',
    'notes', 'createdBy', 'createdAt'],

  /* --------------------------------- PRODUCTS --------------------------- */
  Items: ['id', 'code', 'name', 'nameUr', 'category', 'subCategory', 'brand', 'partType',
    'make', 'model', 'yearFrom', 'yearTo', 'engine', 'chassis', 'unit', 'barcode', 'altBarcodes',
    'costPrice', 'retailPrice', 'wholesalePrice', 'minPrice', 'taxRate', 'hsn',
    'minStock', 'reorderLevel', 'rack', 'defaultLocationId', 'trackSerial', 'hasExpiry',
    'imageUrl', 'notes', 'status', 'createdAt', 'updatedAt',
    /* v2 */ 'size', 'conversionFactor', 'primarySupplierId', 'barcodeType', 'binId',
    'isBundle', 'isService', 'allowDiscount', 'warranty', 'origin', 'weight',
    'gallery', 'variants', 'customFields', 'favourite', 'sortOrder',
    /* v2.5.2 — real product master (CSV import): level-1 taxonomy "Line Item" */
    'lineItem'],
  ItemPrices: ['id', 'itemId', 'customerTypeId', 'priceType', 'minQty', 'price', 'discountPct',
    'validFrom', 'validTo', 'active'],
  CustomerTypes: ['id', 'name', 'discountPct', 'creditLimit', 'priceTier', 'active'],
  Discounts: ['id', 'code', 'type', 'value', 'minAmount', 'maxDiscount', 'validFrom', 'validTo',
    'usageLimit', 'used', 'appliesTo', 'active'],

  /* --------------------------------- INVENTORY -------------------------- */
  Stock: ['id', 'itemId', 'locationId', 'qty', 'avgCost', 'rack', 'binId', 'lastCountedAt', 'updatedAt'],

  /* ------------------------ v2: catalog, warehouse, config ---------------- */
  Categories: ['id', 'code', 'name', 'parentId', 'imageUrl', 'sortOrder', 'active'],
  Brands: ['id', 'code', 'name', 'notes', 'active'],
  Units: ['id', 'code', 'name', 'baseUnit', 'conversion', 'active'],
  TaxCodes: ['id', 'code', 'name', 'rate', 'type', 'active'],
  Warehouses: ['id', 'code', 'name', 'locationId', 'incharge', 'isDefault', 'notes', 'active'],
  Bins: ['id', 'code', 'name', 'warehouseId', 'rack', 'shelf', 'capacity', 'notes', 'active'],
  BinStock: ['id', 'itemId', 'binId', 'qty', 'updatedAt'],
  StockLots: ['id', 'itemId', 'lotNo', 'serials', 'expiry', 'mfg', 'qty', 'cost',
    'locationId', 'grnId', 'status', 'createdAt'],
  Bundles: ['id', 'parentItemId', 'childItemId', 'qty', 'notes'],
  PriceLists: ['id', 'code', 'name', 'tier', 'markupPct', 'roundTo', 'active'],
  CustomFields: ['id', 'entity', 'key', 'label', 'type', 'options', 'defaultValue',
    'required', 'showInTable', 'showInForm', 'showInPos', 'tab', 'sortOrder', 'active'],
  MenuConfig: ['id', 'parentId', 'label', 'icon', 'route', 'perm', 'badge', 'sortOrder', 'active'],
  PrintTemplates: ['id', 'type', 'name', 'json', 'active'],
  Translations: ['id', 'key', 'en', 'roman', 'ur', 'scope', 'updatedAt'],
  SavedViews: ['id', 'screen', 'name', 'filters', 'columns', 'sort', 'shared', 'userId'],
  StockMoves: ['id', 'ts', 'date', 'itemId', 'locationId', 'qtyIn', 'qtyOut', 'balance',
    'cost', 'refType', 'refId', 'userId', 'notes'],
  Transfers: ['id', 'transferNo', 'date', 'fromLocationId', 'toLocationId', 'status', 'notes',
    'createdBy', 'createdAt', 'postedAt'],
  TransferItems: ['id', 'transferId', 'itemId', 'qty', 'cost', 'notes'],
  StockAdjustments: ['id', 'adjNo', 'date', 'locationId', 'reason', 'status', 'notes',
    'createdBy', 'createdAt', 'reversedBy', 'reversedAt'],
  StockAdjustItems: ['id', 'adjId', 'itemId', 'systemQty', 'countedQty', 'diff', 'cost', 'notes'],

  /* ---------------------------------- PARTIES --------------------------- */
  Customers: ['id', 'code', 'name', 'phone', 'email', 'address', 'cnic', 'ntn', 'customerTypeId',
    'openingBalance', 'creditLimit', 'membershipId', 'points', 'priceTier', 'notes', 'active',
    'customFields', 'createdAt'],
  Suppliers: ['id', 'code', 'name', 'phone', 'email', 'address', 'ntn', 'openingBalance', 'creditLimit',
    'paymentTerms', 'ledgerAccount', 'notes', 'active', 'customFields', 'createdAt'],
  Ledger: ['id', 'date', 'partyType', 'partyId', 'refType', 'refId', 'description',
    'debit', 'credit', 'balance', 'locationId', 'createdAt'],

  /* ----------------------------------- SALES ---------------------------- */
  Sales: ['id', 'invoiceNo', 'date', 'locationId', 'customerId', 'customerName', 'customerType',
    'subtotal', 'discount', 'discountCode', 'tax', 'total', 'paid', 'change', 'due',
    'paymentMethod', 'payments', 'status', 'salespersonId', 'cashierId', 'sessionId',
    'notes', 'source', 'createdAt'],
  SaleItems: ['id', 'saleId', 'itemId', 'code', 'name', 'qty', 'price', 'cost', 'discount',
    'tax', 'taxRate', 'lineBase', 'lineTotal', 'salespersonId', 'serial', 'notes'],
  SaleReturns: ['id', 'returnNo', 'date', 'saleId', 'invoiceNo', 'locationId', 'customerId',
    'total', 'reason', 'refundMethod', 'createdBy', 'createdAt'],
  SaleReturnItems: ['id', 'returnId', 'itemId', 'code', 'name', 'qty', 'price', 'lineTotal', 'restock'],
  HoldBills: ['id', 'ref', 'locationId', 'cartJson', 'customerId', 'note', 'createdBy', 'createdAt'],

  /* ------------- v2.5: order book (mobile order taking) -------------------- */
  Orders: ['id', 'orderNo', 'date', 'expectedDate', 'customerId', 'customerName', 'phone', 'address',
    'locationId', 'salespersonId', 'status', 'priority', 'channel', 'priceTier',
    'subtotal', 'discount', 'tax', 'total', 'advance', 'balance', 'saleId', 'invoiceNo',
    'notes', 'source', 'statusBy', 'statusAt', 'convertedBy', 'convertedAt',
    /* v2.6 §11 — offline idempotency: PWA bhejta hai, do-bara sync par
       dohra order nahi banta */
    'clientId',
    'createdBy', 'createdAt', 'updatedAt'],
  OrderItems: ['id', 'orderId', 'itemId', 'code', 'name', 'qty', 'price', 'cost', 'discount',
    'taxRate', 'tax', 'lineBase', 'lineTotal', 'note', 'unit'],

  /* --------------------------------- PURCHASE --------------------------- */
  PurchaseOrders: ['id', 'poNo', 'date', 'supplierId', 'locationId', 'expectedDate', 'status',
    'subtotal', 'tax', 'total', 'budgetLimit', 'notes', 'createdBy', 'createdAt'],
  /* v2.6 §3 — pricing columns on every PO line (see Purchase._linePricing) */
  PurchaseOrderItems: ['id', 'poId', 'itemId', 'code', 'name', 'qty', 'rate', 'tax',
    'lineTotal', 'receivedQty',
    'discount', 'retailPrice', 'wholesalePrice',
    'prevPrice', 'prevDate', 'prevSource', 'prevGrnNo',
    'priceChange', 'priceChangePct'],
  GRN: ['id', 'grnNo', 'date', 'poId', 'supplierId', 'locationId', 'invoiceNo', 'invoiceDate',
    'subtotal', 'tax', 'freight', 'total', 'status', 'notes', 'createdBy', 'createdAt'],
  /* v2.6 §3 — same pricing block on GRN lines: purchase rate vs previous rate */
  GRNItems: ['id', 'grnId', 'itemId', 'code', 'name', 'qty', 'cost', 'tax', 'lineTotal', 'expiry',
    'discount', 'retailPrice', 'wholesalePrice',
    'prevPrice', 'prevDate', 'prevSource', 'prevGrnNo',
    'priceChange', 'priceChangePct'],
  PurchaseReturns: ['id', 'returnNo', 'date', 'grnId', 'supplierId', 'locationId', 'total',
    'reason', 'status', 'createdBy', 'createdAt'],
  PurchaseReturnItems: ['id', 'returnId', 'itemId', 'qty', 'cost', 'lineTotal'],

  /* ------------------------------------------------------------------------
     v2.6 §12 — SALESMAN STOCK & SETTLEMENT (consignment model)
     ------------------------------------------------------------------------
     Consignment matlab: stock company ki milkiyat rehta hai jab tak salesman
     use bech na de. Is liye:
       issue     → branch stock se nikla, salesman ke zimme aaya (SalesmanStock+)
       sale      → becha gaya, salesman ke zimme se gaya (SalesmanStock−)
       return    → bacha hua wapas branch mein (SalesmanStock−, Stock+)
       settlement→ sold + cash + bacha hua stock sab ka hisaab
     ====================================================================== */
  SalesmanStock: ['id', 'salesmanId', 'itemId', 'locationId', 'qty', 'avgCost', 'updatedAt'],
  /* v2.9.2 — extended: purpose/reason/tour+area/customer/reference + per-line allocation */
  SalesmanIssues: ['id', 'issueNo', 'date', 'salesmanId', 'locationId', 'status', 'total',
    'notes', 'createdBy', 'createdAt',
    'purpose', 'reason', 'routeId', 'area', 'customerId', 'customerName', 'reference'],
  SalesmanIssueItems: ['id', 'issueId', 'itemId', 'code', 'name', 'qty', 'cost', 'lineTotal',
    'customerId', 'customerName', 'routeId', 'area', 'purpose', 'reference'],
  /* v2.9.2 — return via original issue: issueId/issueNo link + remaining guard */
  SalesmanReturns: ['id', 'returnNo', 'date', 'salesmanId', 'locationId', 'status', 'total',
    'notes', 'createdBy', 'createdAt',
    'issueId', 'issueNo', 'reason'],
  SalesmanReturnItems: ['id', 'returnId', 'itemId', 'code', 'name', 'qty', 'cost', 'lineTotal',
    'issueId', 'issueItemId'],
  SalesmanSettlements: ['id', 'settleNo', 'date', 'salesmanId', 'locationId',
    'openingValue', 'issuedValue', 'soldValue', 'returnedValue',
    'expectedValue', 'countedValue', 'varianceValue',
    'cashCollected', 'cashDeposited', 'dueFromSalesman', 'status', 'notes', 'createdBy', 'createdAt'],
  SalesmanSettlementItems: ['id', 'settlementId', 'itemId', 'code', 'name',
    'expectedQty', 'countedQty', 'varianceQty', 'cost', 'varianceValue'],
  SalesmanVisits: ['id', 'date', 'salesmanId', 'customerId', 'customerName', 'purpose',
    'outcome', 'orderValue', 'collected', 'notes', 'locationId', 'createdAt'],
  /* v2.9 §12 — Route management: kis salesman ka kaunsa area/market, konse
     customers aur kis din. Visit diary se link hota hai (visits.routeId). */
  SalesmanRoutes: ['id', 'routeNo', 'name', 'salesmanId', 'locationId', 'customerIds', 'days',
    'targetValue', 'active', 'notes', 'createdBy', 'createdAt', 'updatedAt'],

  /* ---------------------------------- MONEY ----------------------------- */
  Payments: ['id', 'voucherNo', 'date', 'type', 'partyType', 'partyId', 'partyName', 'amount',
    'method', 'reference', 'locationId', 'sessionId', 'notes', 'createdBy', 'createdAt',
    /* v2.2 payment-method engine: fees, settlement, cheque lifecycle */
    'status', 'fee', 'fed', 'net', 'settleDate', 'bankName', 'accountNo',
    'chequeNo', 'chequeDate', 'clearingDate', 'bounceCharges',
    'walletNumber', 'txnId', 'raastId', 'cardLast4', 'approvalCode',
    'payerMobile', 'receiverMobile', 'dueDate', 'feePct', 'fedPct',
    'clearedBy', 'clearedAt', 'saleId', 'purchaseId',
    /* v2.9.2 — udhar wasooli details: prev/new balance, collector, linked invoices */
    'prevBalance', 'newBalance', 'collectorId', 'collectorName', 'invoiceNos', 'relatedRef'],
  Expenses: ['id', 'voucherNo', 'date', 'category', 'amount', 'paidTo', 'method',
    'locationId', 'sessionId', 'notes', 'createdBy', 'createdAt',
    /* v2.5: professional expense voucher */
    'accountId', 'reference', 'taxAmount', 'attachmentUrl', 'status', 'approvedBy', 'journalId'],
  CashSessions: ['id', 'sessionNo', 'locationId', 'userId', 'openingCash', 'expectedCash',
    'closingCash', 'variance', 'openedAt', 'closedAt', 'status', 'notes'],
  /* v2.6 §7 — shop khulne/band hone par auto day-report + uski history.
     Poori HTML sheet mein nahi rakhte (cell limit) — sirf summary JSON,
     aur HTML/PDF zaroorat par dobara banta hai (hamesha taaza data). */
  DayReports: ['id', 'reportNo', 'sessionId', 'kind', 'date', 'locationId', 'userId',
    'summary', 'method', 'status', 'generatedAt', 'generatedBy', 'notes'],

  /* --------------------- v2.5: ACCOUNTING (double entry) ------------------ */
  Accounts: ['id', 'code', 'name', 'group', 'type', 'parentId', 'bankName', 'accountNo', 'branch',
    'isCash', 'isBank', 'normalSide', 'openingBalance', 'currentBalance', 'active', 'notes', 'createdAt'],
  Journals: ['id', 'voucherNo', 'date', 'type', 'refType', 'refId', 'locationId', 'narration',
    'totalDebit', 'totalCredit', 'status', 'createdBy', 'createdAt', 'postedAt'],
  JournalLines: ['id', 'journalId', 'accountId', 'accountCode', 'debit', 'credit',
    'partyType', 'partyId', 'narration', 'lineOrder'],
  BankRecon: ['id', 'bankAccountId', 'date', 'reference', 'amount', 'direction', 'cleared',
    'clearedDate', 'journalId', 'statementRef', 'note', 'createdBy', 'createdAt'],

  /* ------------- v2.5: warehouse count sheets (cycle count / audit) -------- */
  /* v2.5.1: postedBy + updatedAt — audit trail (pehle dono silently drop ho rahe the) */
  CountSheets: ['id', 'sheetNo', 'date', 'locationId', 'warehouseId', 'binId', 'category', 'q',
    'scope', 'assignedTo', 'status', 'notes', 'lines', 'counted', 'diffLines', 'varianceValue',
    'adjustmentId', 'createdBy', 'createdAt', 'updatedAt', 'postedAt', 'postedBy'],
  CountLines: ['id', 'sheetId', 'itemId', 'code', 'name', 'binId', 'binCode', 'systemQty',
    'countedQty', 'diff', 'avgCost', 'varianceValue', 'note', 'countedAt', 'countedBy'],

  /* ---------------- v2.5: wallet gateway (EasyPaisa / JazzCash) ---------------- */
  WalletTxns: ['id', 'date', 'provider', 'flow', 'orderId', 'amount', 'payerMobile', 'receiverMobile',
    'email', 'status', 'providerRef', 'token', 'tokenExpiry', 'responseCode', 'responseDesc',
    'transactionStatus', 'saleId', 'paymentId', 'refType', 'refId', 'note', 'mode',
    'rawRequest', 'rawResponse', 'checkedAt', 'createdBy', 'createdAt', 'updatedAt'],

  /* --------------------------------- PEOPLE ----------------------------- */
  CommissionSlabs: ['id', 'name', 'userId', 'itemId', 'category', 'fromAmount', 'toAmount',
    'rateType', 'rate', 'active'],
  Commissions: ['id', 'date', 'saleId', 'salespersonId', 'itemId', 'saleAmount', 'rate',
    'amount', 'status', 'paidAt', 'paymentId'],

  /* ---------------------------------- MISC ------------------------------ */
  LabelTemplates: ['id', 'name', 'width', 'height', 'fields', 'json', 'isDefault', 'updatedAt'],
  /* v2.5.1: locationId — branch-wise alerts (pehle ye silently drop ho raha tha) */
  Notifications: ['id', 'ts', 'type', 'title', 'body', 'link', 'userId', 'readAt', 'severity', 'locationId'],
  AIThreads: ['id', 'userId', 'title', 'createdAt', 'updatedAt', 'messages'],

  /* -------------------------------- SYNC / OFFLINE ---------------------- */
  OfflineQueue: ['id', 'clientId', 'deviceId', 'action', 'payload', 'status', 'error',
    'receivedAt', 'processedAt'],

  /* ----------------------------- CUSTOMER DEMAND -------------------------- */
  CustomerDemands: ['id', 'demandNo', 'date', 'customerId', 'customerName', 'customerPhone',
    'itemId', 'itemCode', 'itemName', 'category', 'brand', 'make', 'model', 'qty', 'priority',
    'status', 'notes', 'locationId', 'source', 'requestedBy', 'assignedSupplierId', 'poIds',
    'grnId', 'saleId', 'invoiceNo', 'expectedDate', 'notifiedAt', 'fulfilledAt', 'cancelledAt',
    'createdBy', 'createdAt', 'updatedAt',
    /* v2.24.0 — advanced demand fields (append-only, purani sheets safe) */
    'customerPo', 'budgetPrice', 'partialOk', 'substituteOk', 'followUpDate',
    'notifyChannel', 'tags', 'internalNote'],
  DemandHistory: ['id', 'demandId', 'ts', 'fromStatus', 'toStatus', 'note', 'userId', 'createdAt']
};

/** Sheets jinhe bulk-read cache se fast kiya jata hai.
 *  v2.13.4 — 'Sales' aur 'Payments' shamil: dashboards, reports aur AI har
 *  load par ye poori sheets parhte thay (sample backend isi liye tez lagta
 *  tha — wo bhi transactional stores cache karta hai). Correctness wahi
 *  rule: har DB write DB.touch() karta hai, to doosre user ko foran fresh
 *  data milta hai; TTL sirf direct-sheet-edit ka safety net hai. */
var CACHED_SHEETS = ['Settings', 'Locations', 'Users', 'Groups', 'Items', 'CustomerTypes',
  'ItemPrices', 'Customers', 'Suppliers', 'Stock', 'NumberSeries', 'Discounts', 'CommissionSlabs',
  'Sales', 'Payments'];

/** Seed settings (pehli dafa setup par likhi jati hain) */
var DEFAULT_SETTINGS = {
  businessName: 'Haseeb Autos',
  businessNameUr: 'حسیب آٹوز',
  tagline: 'Auto Parts • Car & Bike Decoration',
  phone: '+92 300 0000000',
  email: 'info@haseebautos.pk',
  address: 'Sadiqabad, Punjab, Pakistan',
  ntn: '',
  strn: '',
  bankName: '',
  bankTitle: '',
  bankAccount: '',
  bankIban: '',
  'invoice.showBank': 'true',
  'invoice.showWords': 'true',
  'invoice.showSignature': 'true',
  invoiceTerms: 'Goods once sold will not be taken back without original invoice.',
  currencyWord: 'Rupees',
  currency: 'PKR',
  /* v2.29.0 (W4 · spec §8) — global date/time display policy */
  timezone: 'Asia/Karachi',
  dateFormat: 'DD/MM/YYYY',
  'dt.format': 'datetime',
  'dt.dateStyle': 'DD MMM YYYY',
  'dt.hour12': 'false',
  'dt.seconds': 'false',
  'dt.showTime': 'true',
  'dt.showRecords': 'true',
  currencySymbol: 'Rs',
  taxRate: '0',
  taxLabel: 'GST',
  defaultLanguage: 'en',
  languages: 'en,ur',
  priceIncludesTax: 'false',
  allowNegativeStock: 'false',
  /* v2.6 §3 — PO/GRN par previous-price comparison (settings se band ho sakta hai) */
  purchasePriceCompare: 'true',
  /* v2.6 §7 — shop khulne / band hone par report khud banay */
  dayReportAutoOpen: 'true',
  dayReportAutoClose: 'true',
  /* v2.6 §10/§11/§13 — mobile PWAs (har app ka apna URL, alag se on/off) */
  'pwa.wh.enabled': 'true',
  'pwa.fo.enabled': 'true',
  'pwa.sm.enabled': 'true',
  'pwa.offlineEnabled': 'true',
  'pwa.offlineMaxQueue': '200',
  allowCreditSale: 'true',
  defaultPaymentMethod: 'CASH',
  receiptSize: '80mm',
  receiptHeader: 'Haseeb Autos',
  receiptFooter: 'Thank you! Visit again.',
  showUrduOnReceipt: 'true',
  lowStockThreshold: '5',
  autoReorder: 'false',
  aiProvider: 'GEMINI',
  aiModel: '',          /* khali = provider se latest/free model khud chun lay (v2.5) */
  aiEnabled: 'true',
  aiCanWrite: 'false',
  offlineMode: 'true',
  fiscalYearStart: '07-01',
  /* customer demand defaults */
  'demand.defaultPriority': 'MEDIUM',
  'demand.autoNotify': 'true',
  'demand.alertDays': '3',
  'demand.notifyOnArrival': 'true',
  'demand.allowDuplicateOpen': 'false',
  /* v2.9.2 — production login: show/hide demo credentials */
  'login.showDemo': 'true'
};

/** Roles → permission keys (RBAC). Group.permissions in ko override kar sakta hai. */
/* ============================================================================
 * PERMISSION CATALOG — Users & Security screen isi se matrix banati hai.
 * Har entry: [id, label_en, label_ur, description]
 * Hardcoded nahi: naye permission ids yahan add karein, UI khud update ho jayega.
 * ==========================================================================*/
var PERMISSION_GROUPS = [
  { id: 'dashboard', icon: '📊', label: 'Dashboard', labelUr: 'ڈیش بورڈ' },
  { id: 'pos', icon: '🧾', label: 'Point of Sale', labelUr: 'پوائنٹ آف سیل' },
  { id: 'items', icon: '📦', label: 'Products & Stock', labelUr: 'پروڈکٹ اور اسٹاک' },
  { id: 'purchase', icon: '🛒', label: 'Purchase', labelUr: 'خریداری' },
  { id: 'sales', icon: '💼', label: 'Sales & Parties', labelUr: 'سیل اور پارٹیز' },
  { id: 'demand', icon: '📝', label: 'Customer Demands', labelUr: 'کسٹمر ڈیمانڈ' },
  { id: 'money', icon: '💰', label: 'Money', labelUr: 'مالیات' },
  { id: 'reports', icon: '📈', label: 'Reports', labelUr: 'رپورٹس' },
  { id: 'admin', icon: '🔐', label: 'Admin & System', labelUr: 'ایڈمن اور سسٹم' },
  /* v2.28.0 (W5) — field-level visibility (spec §9) */
  { id: 'fields', icon: '🙈', label: 'Field visibility', labelUr: 'فیلڈ کی نمائش' }
];

var PERMISSION_CATALOG = [
  { id: 'dashboard.view', group: 'dashboard', en: 'View dashboard', ur: 'ڈیش بورڈ دیکھیں', desc: 'Home charts aur KPIs' },
  { id: 'dashboard.financial', group: 'dashboard', en: 'View financial KPIs', ur: 'مالیاتی اشاریے', desc: 'Profit / margin / cash widgets' },

  { id: 'pos.access', group: 'pos', en: 'Access POS screen', ur: 'POS اسکرین', desc: 'Billing screen khol sakte hain' },
  { id: 'pos.sell', group: 'pos', en: 'Create sale / invoice', ur: 'سیل / انوائس بنائیں', desc: 'Naya bill' },
  { id: 'pos.return', group: 'pos', en: 'Process sale return', ur: 'سیل ریٹرن', desc: 'Exchange / refund' },
  { id: 'pos.discount', group: 'pos', en: 'Give discount', ur: 'ڈسکاؤنٹ دینا', desc: 'Line aur bill discount' },
  { id: 'pos.hold', group: 'pos', en: 'Hold / park bill', ur: 'بل ہولڈ کرنا', desc: 'Parked bills' },
  { id: 'pos.cash.manage', group: 'pos', en: 'Cash drawer open / close', ur: 'کیش دراز', desc: 'Opening/closing cash, drops' },
  { id: 'pos.price.override', group: 'pos', en: 'Override sale price', ur: 'ریٹ تبدیل کرنا', desc: 'Rate edit at billing' },

  { id: 'items.view', group: 'items', en: 'View products', ur: 'پروڈکٹ دیکھیں', desc: 'Product cards / list' },
  { id: 'items.create', group: 'items', en: 'Create product', ur: 'پروڈکٹ بنائیں', desc: 'Naya item' },
  { id: 'items.edit', group: 'items', en: 'Edit product', ur: 'پروڈکٹ میں ترمیم', desc: 'Name, barcode, category' },
  { id: 'items.delete', group: 'items', en: 'Delete / deactivate product', ur: 'پروڈکٹ حذف', desc: 'Soft delete' },
  { id: 'items.price.edit', group: 'items', en: 'Edit rates & price tiers', ur: 'ریٹس اور پرائس ٹیر', desc: 'Retail / wholesale rates' },
  { id: 'items.import', group: 'items', en: 'Import products (CSV/Excel)', ur: 'پروڈکٹ امپورٹ', desc: 'Bulk import / price list' },
  { id: 'stock.view', group: 'items', en: 'View stock', ur: 'اسٹاک دیکھیں', desc: 'On-hand per location' },
  { id: 'stock.adjust', group: 'items', en: 'Adjust stock', ur: 'اسٹاک ایڈجسٹ', desc: 'Manual +/- entry' },
  { id: 'stock.transfer', group: 'items', en: 'Transfer between locations', ur: 'اسٹاک ٹرانسفر', desc: 'SDQ / MCH / RYK' },
  { id: 'stock.audit.post', group: 'items', en: 'Post stock audit / count', ur: 'اسٹاک آڈٹ', desc: 'Warehouse counting' },

  { id: 'purchase.view', group: 'purchase', en: 'View purchase', ur: 'خریداری دیکھیں', desc: 'PO / GRN list' },
  { id: 'purchase.po.create', group: 'purchase', en: 'Create purchase order', ur: 'PO بنائیں', desc: 'Supplier order' },
  { id: 'purchase.po.approve', group: 'purchase', en: 'Approve purchase order', ur: 'PO منظور', desc: 'Approval workflow' },
  { id: 'purchase.grn', group: 'purchase', en: 'Receive goods (GRN)', ur: 'GRN (مال وصولی)', desc: 'Stock inward' },
  { id: 'purchase.return', group: 'purchase', en: 'Purchase return', ur: 'خریداری واپسی', desc: 'Return to supplier' },

  { id: 'sales.view', group: 'sales', en: 'View own sales', ur: 'اپنی سیل دیکھیں', desc: 'Sirf apni sales' },
  { id: 'sales.view.all', group: 'sales', en: 'View all users sales', ur: 'سب کی سیل', desc: 'Puri company sales' },
  { id: 'customers.view', group: 'sales', en: 'View customers', ur: 'کسٹمر دیکھیں', desc: 'Ledger, udhaar' },
  { id: 'customers.edit', group: 'sales', en: 'Edit customers', ur: 'کسٹمر میں ترمیم', desc: 'Credit limit, rates' },
  { id: 'suppliers.view', group: 'sales', en: 'View suppliers', ur: 'سپلائر دیکھیں', desc: 'Payables' },
  { id: 'suppliers.edit', group: 'sales', en: 'Edit suppliers', ur: 'سپلائر میں ترمیم', desc: 'Price lists, terms' },

  { id: 'demand.view', group: 'demand', en: 'View demands', ur: 'ڈیمانڈ دیکھیں', desc: 'Customer Demand List' },
  { id: 'demand.create', group: 'demand', en: 'Create demand', ur: 'ڈیمانڈ بنائیں', desc: 'Record unavailable product request' },
  { id: 'demand.manage', group: 'demand', en: 'Manage demands', ur: 'ڈیمانڈ مینج', desc: 'Update status, link PO, notify' },
  { id: 'demand.reports', group: 'demand', en: 'Demand reports', ur: 'ڈیمانڈ رپورٹس', desc: 'Outstanding / fulfilled / pending' },

  { id: 'payments.view', group: 'money', en: 'View payments', ur: 'ادائیگیاں دیکھیں', desc: 'Receipts / vouchers' },
  { id: 'payments.create', group: 'money', en: 'Receive / make payment', ur: 'ادائیگی درج کریں', desc: 'Cash, wallet, bank' },
  { id: 'expenses.create', group: 'money', en: 'Record expense', ur: 'خرچ درج کریں', desc: 'Petty cash / expense' },
  { id: 'expenses.approve', group: 'money', en: 'Approve expense', ur: 'خرچ منظور', desc: 'Expense approval' },

  { id: 'reports.view', group: 'reports', en: 'View reports', ur: 'رپورٹس دیکھیں', desc: 'Standard reports' },
  { id: 'reports.financial', group: 'reports', en: 'View financial reports', ur: 'مالیاتی رپورٹس', desc: 'P&L, cash flow' },
  { id: 'reports.export', group: 'reports', en: 'Export reports', ur: 'رپورٹ ایکسپورٹ', desc: 'PDF / Excel / CSV' },

  { id: 'users.view', group: 'admin', en: 'View users', ur: 'یوزر دیکھیں', desc: 'Users & Security screen' },
  { id: 'users.manage', group: 'admin', en: 'Manage users & permissions', ur: 'یوزر اور اجازتیں', desc: 'Create user, role, matrix' },
  { id: 'settings.view', group: 'admin', en: 'View settings', ur: 'سیٹنگز دیکھیں', desc: 'Read-only settings' },
  { id: 'settings.manage', group: 'admin', en: 'Change settings', ur: 'سیٹنگز تبدیل کریں', desc: 'Business settings' },
  { id: 'ai.use', group: 'admin', en: 'Use AI assistant', ur: 'AI اسسٹنٹ', desc: 'AI agent over the DB' },
  { id: 'audit.view', group: 'admin', en: 'View audit log', ur: 'آڈٹ لاگ', desc: 'Kis ne kya kiya' },

  /* v2.28.0 (W5) — FIELD VISIBILITY (spec §9): ye sirf screen chhupate nahi,
     backend bhi in columns ko response se hata deta hai (Fields.gs). */
  { id: 'field.cost.view', group: 'fields', en: 'See cost price / lagat', ur: 'لاگت دیکھیں', desc: 'Items/stock lines par costPrice, avgCost, landed cost' },
  { id: 'field.margin.view', group: 'fields', en: 'See margin / profit', ur: 'منافع دیکھیں', desc: 'Profit, margin %, markup' },
  { id: 'field.contact.view', group: 'fields', en: 'See customer contact & address', ur: 'کسٹمر رابطہ', desc: 'Phone, email, CNIC, address' },
  { id: 'field.finance.view', group: 'fields', en: 'See balances / credit limits', ur: 'بیلنس اور کریڈٹ', desc: 'Udhaar balance, credit limit, salary, commission %' },
  { id: 'field.supplier.view', group: 'fields', en: 'See supplier internals', ur: 'سپلائر معلومات', desc: 'Supplier id, payment terms, bank details' },
  { id: 'field.notes.view', group: 'fields', en: 'See internal notes', ur: 'اندرونی نوٹس', desc: 'Internal/private/admin notes' }
];

/** Har permission ko label/group ke sath (UI aur Reports dono ke liye) */
function permissionMeta(id) {
  for (var i = 0; i < PERMISSION_CATALOG.length; i++) {
    if (PERMISSION_CATALOG[i].id === id) return PERMISSION_CATALOG[i];
  }
  return { id: id, group: 'admin', en: id, ur: id, desc: '' };
}

var ROLE_PERMISSIONS = {
  OWNER: ['*'],
  MANAGER: [
    'dashboard.view', 'pos.access', 'pos.sell', 'pos.return', 'pos.discount', 'pos.hold',
    'pos.cash.manage', 'items.view', 'items.create', 'items.edit', 'items.delete', 'items.price.edit',
    'items.import', 'stock.view', 'stock.adjust', 'stock.transfer', 'stock.audit.post',
    'purchase.view', 'purchase.po.create', 'purchase.po.approve', 'purchase.grn', 'purchase.return',
    'sales.view', 'sales.view.all', 'customers.view', 'customers.edit', 'suppliers.view', 'suppliers.edit',
    'demand.view', 'demand.create', 'demand.manage', 'demand.reports',
    'payments.view', 'payments.create', 'expenses.create', 'reports.view', 'reports.financial',
    'users.view', 'ai.use', 'settings.view', 'audit.view',
    'field.cost.view', 'field.margin.view', 'field.contact.view', 'field.finance.view', 'field.supplier.view', 'field.notes.view'
  ],
  SALESMAN: [
    'dashboard.view', 'pos.access', 'pos.sell', 'pos.hold', 'items.view', 'stock.view',
    'customers.view', 'customers.edit', 'sales.view', 'demand.view', 'demand.create', 'ai.use',
    'field.contact.view', 'field.finance.view'
  ],
  CASHIER: [
    'dashboard.view', 'pos.access', 'pos.sell', 'pos.cash.manage', 'items.view', 'stock.view',
    'customers.view', 'payments.view', 'payments.create', 'demand.view', 'demand.create', 'ai.use',
    'field.contact.view', 'field.finance.view'
  ],
  PURCHASE: [
    'dashboard.view', 'items.view', 'items.create', 'items.edit', 'stock.view', 'stock.adjust',
    'purchase.view', 'purchase.po.create', 'purchase.grn', 'purchase.return',
    'suppliers.view', 'suppliers.edit', 'demand.view', 'demand.manage', 'demand.reports', 'reports.view', 'ai.use',
    'field.cost.view', 'field.supplier.view', 'field.contact.view'
  ],
  WAREHOUSE: [
    'dashboard.view', 'items.view', 'stock.view', 'stock.adjust', 'stock.transfer',
    'stock.audit.post', 'purchase.grn', 'demand.view', 'ai.use',
    'field.cost.view', 'field.supplier.view'
  ],
  ACCOUNTANT: [
    'dashboard.view', 'sales.view', 'sales.view.all', 'purchase.view', 'payments.view',
    'payments.create', 'expenses.create', 'reports.view', 'reports.financial',
    'customers.view', 'suppliers.view', 'demand.view', 'demand.reports', 'ai.use',
    'field.cost.view', 'field.margin.view', 'field.contact.view', 'field.finance.view', 'field.supplier.view', 'field.notes.view'
  ],
  DELIVERY: [
    'dashboard.view', 'sales.view', 'items.view', 'stock.view', 'customers.view', 'demand.view', 'ai.use',
    'field.contact.view'
  ],
  OTHER: ['dashboard.view', 'items.view', 'stock.view']
};

var ROLES = ['OWNER', 'MANAGER', 'SALESMAN', 'CASHIER', 'PURCHASE', 'WAREHOUSE',
  'ACCOUNTANT', 'DELIVERY', 'OTHER'];
