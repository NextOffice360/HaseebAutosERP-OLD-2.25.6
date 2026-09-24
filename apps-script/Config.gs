/**
 * HASEEB AUTOS - ERP / POS  ::  CONFIG ENGINE
 * ---------------------------------------------------------------------------
 * Rule: koi bhi cheez code mein HARDCODED nahi. Har behaviour, label, list,
 * tax, UoM, menu, custom field, print template — sab Settings / sheets se aata
 * hai aur Settings ▸ Configuration screen se bina code chhuay badla ja sakta hai.
 *
 * CONFIG_DEFS = settings UI ka schema (tabs → sub-tabs → sub-sub-tabs).
 */

var CONFIG_DEFS = [
  {
    id: 'business', label: 'Business Profile', icon: '🏪', sub: [
      { id: 'identity', label: 'Identity', fields: [
        { key: 'businessName', label: 'Business name', type: 'text', def: 'Haseeb Autos' , sec: { title: '① Naam aur pehchan', tone: 'ok' }},
        { key: 'businessNameUr', label: 'Name (Urdu)', type: 'text', def: 'حسیب آٹوز' , sec: { title: '① Naam aur pehchan', tone: 'ok' }},
        { key: 'tagline', label: 'Tagline', type: 'text', def: 'Auto Parts • Car & Bike Decoration' , sec: { title: '① Naam aur pehchan', tone: 'ok' }},
        { key: 'branchLabel', label: 'Word used for branch', type: 'text', def: 'Branch', hint: 'Branch / Shop / Store — poori app mein ye lafz use hoga' , sec: { title: '① Naam aur pehchan', tone: 'ok' }},
        { key: 'phone', label: 'Phone', type: 'text', def: '' , sec: { title: '② Rabta (contact)', tone: 'info' }},
        { key: 'email', label: 'Email', type: 'text', def: '' , sec: { title: '② Rabta (contact)', tone: 'info' }},
        { key: 'address', label: 'Address', type: 'textarea', def: '' , sec: { title: '② Rabta (contact)', tone: 'info' }},
        { key: 'ntn', label: 'NTN / Tax no.', type: 'text', def: '' , sec: { title: '③ Tax registration', tone: 'warn' }},
        { key: 'strn', label: 'STRN (sales tax reg. no.)', type: 'text', def: '' , sec: { title: '③ Tax registration', tone: 'warn' }},
        { key: 'logoUrl', label: 'Logo URL (receipt + login)', type: 'text', def: '' , sec: { title: '④ Logo', tone: 'fin' }}
      ]},
      { id: 'invoice', label: 'Bank & invoice', fields: [
        { key: 'bankName', label: 'Bank name', type: 'text', def: '' },
        { key: 'bankTitle', label: 'Account title', type: 'text', def: '' },
        { key: 'bankAccount', label: 'Account number', type: 'text', def: '' },
        { key: 'bankIban', label: 'IBAN', type: 'text', def: '' },
        { key: 'invoice.showBank', label: 'Invoice par bank details chhapain', type: 'switch', def: true },
        { key: 'invoice.showWords', label: 'Amount in words likhain', type: 'switch', def: true },
        { key: 'invoice.showSignature', label: 'Signature line chhapain', type: 'switch', def: true },
        { key: 'invoiceTerms', label: 'Terms & conditions (invoice footer)', type: 'textarea',
          def: 'Goods once sold will not be taken back without original invoice.' }
      ]},
      { id: 'localization', label: 'Localization', fields: [
        { key: 'defaultLanguage', label: 'Default language', type: 'select', options: 'en,ur', def: 'en' , sec: { title: '① Zaban (language)', tone: 'ok' }},
        { key: 'languages', label: 'Enabled languages', type: 'text', def: 'en,ur' , sec: { title: '① Zaban (language)', tone: 'ok' }},
        { key: 'currency', label: 'Currency code', type: 'text', def: 'PKR' , sec: { title: '② Currency', tone: 'fin' }},
        { key: 'currencySymbol', label: 'Currency symbol', type: 'text', def: 'Rs' , sec: { title: '② Currency', tone: 'fin' }},
        { key: 'currencyWord', label: 'Currency word (amount in words)', type: 'text', def: 'Rupees' , sec: { title: '② Currency', tone: 'fin' }},
        { key: 'currencyPosition', label: 'Symbol position', type: 'select', options: 'before,after', def: 'before' , sec: { title: '② Currency', tone: 'fin' }},
        { key: 'dateFormat', label: 'Date format', type: 'select', options: 'YYYY-MM-DD,DD/MM/YYYY,MM/DD/YYYY', def: 'DD/MM/YYYY' , sec: { title: '③ Tareekh & waqt', tone: 'info' }},
        { key: 'timezone', label: 'Timezone', type: 'text', def: 'Asia/Karachi' , sec: { title: '③ Tareekh & waqt', tone: 'info' }},
        /* v2.29.0 (W4 · spec §8) — display format configurable (hard-coded nahi) */
        { key: 'dt.format', label: 'Kab kya dikhe', type: 'select', options: 'date,time,datetime,stamp', def: 'datetime',
          hint: 'date = sirf tareekh · time = sirf waqt · datetime = dono · stamp = poora (seconds ke sath)', sec: { title: '③ Tareekh & waqt', tone: 'info' }},
        { key: 'dt.dateStyle', label: 'Tareekh ka style', type: 'select', options: 'DD MMM YYYY,YYYY-MM-DD,DD/MM/YYYY,MM/DD/YYYY', def: 'DD MMM YYYY',
          sec: { title: '③ Tareekh & waqt', tone: 'info' }},
        { key: 'dt.hour12', label: '12-ghante ka format (AM/PM)', type: 'switch', def: false, sec: { title: '③ Tareekh & waqt', tone: 'info' }},
        { key: 'dt.seconds', label: 'Seconds dikhain', type: 'switch', def: false, sec: { title: '③ Tareekh & waqt', tone: 'info' }},
        { key: 'dt.showTime', label: 'Waqt dikhain (global on/off)', type: 'switch', def: true,
          hint: 'Off karne par poore app mein sirf tareekh dikhegi', sec: { title: '③ Tareekh & waqt', tone: 'info' }},
        { key: 'dt.showRecords', label: 'Records par Created/Updated dikhain', type: 'switch', def: true,
          sec: { title: '③ Tareekh & waqt', tone: 'info' }},
        { key: 'fiscalYearStart', label: 'Fiscal year start (MM-DD)', type: 'text', def: '07-01' , sec: { title: '③ Tareekh & waqt', tone: 'info' }}
      ]},
      { id: 'appearance', label: 'Appearance', fields: [
        { key: 'theme', label: 'Default theme', type: 'select', options: 'light,dark', def: 'light' },
        { key: 'brandColor', label: 'Brand color', type: 'color', def: '#ff6a00' },
        { key: 'density', label: 'UI density', type: 'select', options: 'comfortable,compact', def: 'comfortable' },
        { key: 'fontSize', label: 'Base font size (px)', type: 'number', def: 14 },
        { key: 'sidebarCollapsed', label: 'Sidebar collapsed by default', type: 'switch', def: false },
        { key: 'animations', label: 'Enable animations', type: 'switch', def: true }
      ]}
    ]
  },
  {
    id: 'pos', label: 'Point of Sale', icon: '🧾', sub: [
      { id: 'billing', label: 'Billing behaviour', fields: [
        { key: 'pos.layout', label: 'POS layout', type: 'select', options: 'cards,list,both', def: 'cards' , sec: { title: '① Layout', tone: 'ok' }},
        { key: 'pos.defaultView', label: 'Opening tab', type: 'select', options: 'all,categories,favorites,recent', def: 'categories' , sec: { title: '① Layout', tone: 'ok' }},
        { key: 'pos.cardsPerRow', label: 'Product cards per row', type: 'number', def: 4 , sec: { title: '① Layout', tone: 'ok' }},
        { key: 'pos.showStockOnCard', label: 'Show stock on card', type: 'switch', def: true , sec: { title: '② Card par kya dikhe', tone: 'info' }},
        { key: 'pos.showImageOnCard', label: 'Show image on card', type: 'switch', def: true , sec: { title: '② Card par kya dikhe', tone: 'info' }},
        { key: 'pos.allowDirectQty', label: 'Ask qty when adding item', type: 'switch', def: false , sec: { title: '③ Behaviour', tone: 'warn' }},
        { key: 'pos.scanSound', label: 'Beep on scan', type: 'switch', def: true , sec: { title: '③ Behaviour', tone: 'warn' }},
        { key: 'pos.autoFocusSearch', label: 'Auto-focus search', type: 'switch', def: true , sec: { title: '③ Behaviour', tone: 'warn' }},
        { key: 'pos.quickKeys', label: 'Quick keys row (hot items)', type: 'switch', def: true , sec: { title: '③ Behaviour', tone: 'warn' }},
        { key: 'pos.confirmOnDelete', label: 'Confirm before removing line', type: 'switch', def: false , sec: { title: '③ Behaviour', tone: 'warn' }}
      ]},
      { id: 'cards', label: 'Product cards & layout', fields: [
        { key: 'pos.defaultView', label: 'Opening tab', type: 'select', options: 'all,categories,favourites,recent', def: 'all' , sec: { title: '① Card layout', tone: 'ok' }},
        { key: 'pos.cardsPerRow', label: 'Cards per row', type: 'number', def: 4 , sec: { title: '① Card layout', tone: 'ok' }},
        { key: 'pos.showImageOnCard', label: 'Show image on card', type: 'switch', def: true , sec: { title: '② Card par kya dikhe', tone: 'info' }},
        { key: 'pos.showStockOnCard', label: 'Show stock badge on card', type: 'switch', def: true , sec: { title: '② Card par kya dikhe', tone: 'info' }},
        { key: 'pos.showPriceOnCard', label: 'Show price on card', type: 'switch', def: true , sec: { title: '② Card par kya dikhe', tone: 'info' }},
        { key: 'pos.allowDirectQty', label: 'Ask quantity when card tapped', type: 'switch', def: true , sec: { title: '③ Behaviour', tone: 'warn' }},
        { key: 'pos.scanSound', label: 'Beep on scan/add', type: 'switch', def: true , sec: { title: '③ Behaviour', tone: 'warn' }},
        { key: 'pos.lowStockBadge', label: 'Highlight low stock', type: 'switch', def: true , sec: { title: '② Card par kya dikhe', tone: 'info' }},
        { key: 'pos.virtualScroll', label: 'Virtual scrolling (bade catalog ke liye)', type: 'switch', def: true,
          help: '1000+ items par bhi fast — sirf nazar aane wale cards DOM mein rehte hain' , sec: { title: '④ Performance (bare catalog)', tone: 'inv' }},
        { key: 'pos.virtualThreshold', label: 'Virtual scrolling shuru (items)', type: 'number', def: 80 , sec: { title: '④ Performance (bare catalog)', tone: 'inv' }},
        { key: 'pos.cardMinWidth', label: 'Card ki min chaurai (px)', type: 'number', def: 150 , sec: { title: '① Card layout', tone: 'ok' }}
      ]},
      /* v2.16 — comprehensive POS/Cart UI toggles (admin controls visible/enabled) */
      { id: 'cartui', label: 'Cart & UI controls', icon: '🛒', fields: [
        { key: 'pos.cartInlineAdd', label: 'Inline Add Product field in cart (desktop + drawer)', type: 'switch', def: true, sec: { title: '① Cart features', tone: 'ok' }},
        { key: 'pos.cartPicker', label: 'Multi-select Add Items picker', type: 'switch', def: true, sec: { title: '① Cart features', tone: 'ok' }},
        { key: 'pos.cartBulkScan', label: 'Bulk scan button', type: 'switch', def: true, sec: { title: '① Cart features', tone: 'ok' }},
        { key: 'pos.cartFullNameRow', label: 'Full-width product name row', type: 'switch', def: true, help: 'Name poori row par — qty/rate/amount neeche', sec: { title: '② Cart fields & layout', tone: 'info' }},
        { key: 'pos.cartShowCode', label: 'Show code under name', type: 'switch', def: true, sec: { title: '② Cart fields & layout', tone: 'info' }},
        { key: 'pos.cartShowRate', label: 'Show rate column', type: 'switch', def: true, sec: { title: '② Cart fields & layout', tone: 'info' }},
        { key: 'pos.cartShowQtyCtl', label: 'Show qty − / + controls', type: 'switch', def: true, sec: { title: '② Cart fields & layout', tone: 'info' }},
        { key: 'pos.cartShowEditDelete', label: 'Show edit / delete in cart row', type: 'switch', def: true, sec: { title: '② Cart fields & layout', tone: 'info' }},
        { key: 'pos.cartShowDiscount', label: 'Show line discount in cart rows', type: 'switch', def: true, sec: { title: '② Cart fields & layout', tone: 'info' }},
        { key: 'pos.customerBar', label: 'Customer bar in cart (walk-in / select)', type: 'switch', def: true, sec: { title: '③ Customer & payments in cart', tone: 'warn' }},
        { key: 'pos.customerRequireForCredit', label: 'Credit requires customer', type: 'switch', def: true, sec: { title: '③ Customer & payments in cart', tone: 'warn' }},
        { key: 'pos.showCustomerPhone', label: 'Show customer phone in bar', type: 'switch', def: true, sec: { title: '③ Customer & payments in cart', tone: 'warn' }},
        { key: 'pos.showCustomerBalance', label: 'Show previous/closing balance', type: 'switch', def: true, sec: { title: '③ Customer & payments in cart', tone: 'warn' }},
        { key: 'pos.payButtons', label: 'Payment buttons (comma: CASH,CARD,SPLIT,CREDIT)', type: 'text', def: 'CASH,CARD,SPLIT,CREDIT', sec: { title: '③ Customer & payments in cart', tone: 'warn' }},
        { key: 'pos.showProfit', label: 'Show estimated profit in cart', type: 'switch', def: true, sec: { title: '④ Totals & modals', tone: 'inv' }},
        { key: 'pos.showTax', label: 'Show tax row', type: 'switch', def: true, sec: { title: '④ Totals & modals', tone: 'inv' }},
        { key: 'pos.modalBehindFix', label: 'Payment modal always above drawer', type: 'switch', def: true, sec: { title: '④ Totals & modals', tone: 'inv' }}
      ]},
      { id: 'posbehavior', label: 'POS behaviour & invoice', fields: [
        { key: 'pos.invoiceSimpleConfirm', label: 'Simple invoice confirmation (Print/Share only)', type: 'switch', def: true, help: 'After sale: Print, Share, Send, Save, Create New Sale — design controls stay in Settings', sec: { title: '① Invoice confirmation', tone: 'ok' }},
        { key: 'pos.invoiceDesignInSettingsOnly', label: 'Invoice design only in Settings', type: 'switch', def: true, sec: { title: '① Invoice confirmation', tone: 'ok' }},
        { key: 'pos.cashMustBeFull', label: 'Cash sale must pay full', type: 'switch', def: true, sec: { title: '② Payment rules', tone: 'warn' }},
        { key: 'pos.creditNeedsLimit', label: 'Credit check limit & block if exceeded', type: 'switch', def: true, sec: { title: '② Payment rules', tone: 'warn' }},
        { key: 'pos.creditAllowPartial', label: 'Allow partial payment on credit', type: 'switch', def: true, help: 'Paid + remaining udhaar baqi credit se calculate', sec: { title: '② Payment rules', tone: 'warn' }},
        { key: 'pos.confirmOnClear', label: 'Confirm before clear cart', type: 'switch', def: false, sec: { title: '③ General behaviour', tone: 'info' }},
        { key: 'pos.retainCustomerAfterSale', label: 'Keep customer after sale', type: 'switch', def: false, sec: { title: '③ General behaviour', tone: 'info' }},
        { key: 'pos.performanceFastRender', label: 'Fast cart/invoice render', type: 'switch', def: true, help: 'Batch DOM + fragment + fast print path', sec: { title: '④ Performance', tone: 'inv' }}
      ]},
      { id: 'payments', label: 'Payments', fields: [
        { key: 'defaultPaymentMethod', label: 'Default method', type: 'select', options: 'CASH,CARD,BANK', def: 'CASH' },
        { key: 'paymentMethods', label: 'Enabled methods (comma)', type: 'text', def: 'CASH,CARD,BANK,JAZZCASH,EASYPAISA,CHEQUE,CREDIT' },
        { key: 'allowCreditSale', label: 'Allow udhaar sale', type: 'switch', def: true },
        { key: 'allowSplitPayment', label: 'Allow split payment', type: 'switch', def: true },
        { key: 'roundTotal', label: 'Round total to', type: 'select', options: 'none,1,5,10', def: 'none' },
        { key: 'tipsEnabled', label: 'Enable tips', type: 'switch', def: false },
        { key: 'changeSuggestions', label: 'Quick cash buttons', type: 'text', def: '500,1000,2000,5000' }
      ]},
      { id: 'discounts', label: 'Discounts & tax', fields: [
        { key: 'taxRate', label: 'Default tax %', type: 'number', def: 0 , sec: { title: '① Tax', tone: 'warn' }},
        { key: 'taxLabel', label: 'Tax label', type: 'text', def: 'GST' , sec: { title: '① Tax', tone: 'warn' }},
        { key: 'discountBeforeTax', label: 'Bill discount before tax', type: 'switch', def: true,
          help: 'On = discount tax se pehle kat-ta hai (PK retail standard)' , sec: { title: '② Discount', tone: 'ok' }},
        { key: 'taxInclusive', label: 'Prices include tax', type: 'switch', def: false , sec: { title: '① Tax', tone: 'warn' }},
        { key: 'discountMode', label: 'Discount entered as', type: 'select', options: 'percent,amount,both', def: 'both' , sec: { title: '② Discount', tone: 'ok' }},
        { key: 'maxDiscountPct', label: 'Global max discount %', type: 'number', def: 30 , sec: { title: '② Discount', tone: 'ok' }},
        { key: 'costingMethod', label: 'Costing method', type: 'select', def: 'AVG',
          options: ['AVG', 'FIFO'], help: 'Stock cost nikalne ka tareeqa' , sec: { title: '③ Costing', tone: 'info' }},
        { key: 'allowLineDiscount', label: 'Line-level discount', type: 'switch', def: true , sec: { title: '② Discount', tone: 'ok' }},
        { key: 'allowCoupons', label: 'Enable coupon codes', type: 'switch', def: true , sec: { title: '② Discount', tone: 'ok' }}
      ]},
      { id: 'receipt', label: 'Receipt / print', fields: [
        { key: 'receiptHeader', label: 'Header text', type: 'text', def: 'Haseeb Autos' , sec: { title: '① Receipt ka matn', tone: 'info' }},
        { key: 'receiptFooter', label: 'Footer text', type: 'text', def: 'Shukriya! Phir aayein.' , sec: { title: '① Receipt ka matn', tone: 'info' }},
        { key: 'receiptSize', label: 'Paper size', type: 'select', options: '58mm,80mm,A4', def: '80mm' , sec: { title: '① Receipt ka matn', tone: 'info' }},
        { key: 'pos.showSupplierOnCard', label: 'Product card par supplier ka naam', type: 'switch', def: true , sec: { title: '② Product cards', tone: 'ok' }},
        { key: 'pos.hoverQuickView', label: 'Card par hover quick-view (supplier/stock/rates)', type: 'switch', def: true , sec: { title: '② Product cards', tone: 'ok' }},
        { key: 'pos.cardImageFit', label: 'Card image fit', type: 'select', options: 'contain,cover', def: 'contain' , sec: { title: '② Product cards', tone: 'ok' }},
        { key: 'receipt.showBarcode', label: 'Print invoice barcode', type: 'switch', def: true , sec: { title: '③ Print options', tone: 'warn' }},
        { key: 'receipt.showTax', label: 'Show tax summary', type: 'switch', def: true , sec: { title: '③ Print options', tone: 'warn' }},
        { key: 'print.decimals', label: 'Decimals on printed invoice', type: 'number', def: 2 , sec: { title: '③ Print options', tone: 'warn' }},
        { key: 'expenseApproval', label: 'Bade expenses ke liye approval zaroori', type: 'switch', def: false , sec: { title: '④ Expenses', tone: 'fin' }},
        { key: 'expenseApprovalOver', label: 'Approval limit (is se bada expense pending rahe)', type: 'number', def: 20000 , sec: { title: '④ Expenses', tone: 'fin' }},
        { key: 'expenseCategories', label: 'Expense categories (comma)', type: 'text', full: true,
          def: 'General,Rent,Utilities,Salaries,Freight,Repairs,Marketing,Bank charges,Petty cash,Taxes' , sec: { title: '④ Expenses', tone: 'fin' }},
        { key: 'receipt.showCustomer', label: 'Show customer + balance', type: 'switch', def: true , sec: { title: '③ Print options', tone: 'warn' }},
        { key: 'receipt.showSalesman', label: 'Show salesman name', type: 'switch', def: true , sec: { title: '③ Print options', tone: 'warn' }},
        { key: 'pos.receiptPaper', label: 'Quick-print paper (simple Print fallback)', type: 'select', options: '58mm,80mm,110mm,A4,A5', def: '80mm', hint: 'Thermal sizes print at true width — browser no longer offers only A4/A5. Full Print dialog keeps its own size selector.', sec: { title: '③ Print options', tone: 'warn' }},
        { key: 'showUrduOnReceipt', label: 'Urdu line on receipt', type: 'switch', def: true , sec: { title: '① Receipt ka matn', tone: 'info' }},
        { key: 'autoPrintReceipt', label: 'Auto-print after sale', type: 'switch', def: true , sec: { title: '① Receipt ka matn', tone: 'info' }},
        { key: 'copies', label: 'Copies', type: 'number', def: 1 , sec: { title: '① Receipt ka matn', tone: 'info' }},
        /* v2.6 §7 */
        { key: 'dayReportAutoOpen', label: 'Shop khulte hi opening report banay',
          type: 'switch', def: true,
          hint: 'Report history mein save ho jati hai — baad mein print / export kar sakte hain' , sec: { title: '⑤ Reports (shop open/close)', tone: 'inv' }},
        { key: 'dayReportAutoClose', label: 'Shop band karte hi closing report banay',
          type: 'switch', def: true,
          hint: 'Cash reconciliation + expenses + top items sab ke sath' , sec: { title: '⑤ Reports (shop open/close)', tone: 'inv' }},
        { key: 'reportShowCodes', label: 'Reports par barcode + QR dikhao',
          type: 'switch', def: true,
          hint: 'Scan karte hi document mil jata hai — tracking aur search dono aasan' , sec: { title: '⑤ Reports (shop open/close)', tone: 'inv' }},
        { key: 'dayReportAutoPrint', label: 'Report ban-te hi print dialog kholay',
          type: 'switch', def: true,
          hint: '§7 — open/close ke foran baad print window aati hai (band bhi kar sakte hain)' , sec: { title: '⑤ Reports (shop open/close)', tone: 'inv' }}
      ]}
    ]
  },
  /* ================= v2.6 §10/§11/§13 — MOBILE PWAs ===================== */
  {
    id: 'pwa', label: 'Mobile apps (PWA)', icon: '📱', sub: [
      { id: 'pwaapps', label: 'Kaun si apps chalein', fields: [
        { key: 'pwa.wh.enabled', label: 'Warehouse app (?app=wh)',
          type: 'switch', def: true,
          hint: 'Receive · Put-away · Count · Transfer — warehouse staff ke liye' },
        { key: 'pwa.fo.enabled', label: 'Field Orders app (?app=fo)',
          type: 'switch', def: true,
          hint: 'Market mein order lein — bina net ke bhi (offline queue)' },
        { key: 'pwa.sm.enabled', label: 'Salesman app (?app=sm)',
          type: 'switch', def: true,
          hint: 'Mera stock · Sell · Collect · Settle' },
        { key: 'pwa.pos.enabled', label: 'Standalone POS app (?app=pos)',
          type: 'switch', def: true,
          hint: 'Dedicated POS — grid, barcode, cart drawer, hold, offline queue' }
      ]},
      { id: 'pwaoffline', label: 'Offline behaviour', fields: [
        { key: 'pwa.offlineEnabled', label: 'Offline kaam chaloo rahe',
          type: 'switch', def: true,
          hint: 'Net na ho to entries phone mein save hongi, net aate hi sync' },
        { key: 'pwa.offlineMaxQueue', label: 'Queue ki had (kitni entries jam ho sakti hain)',
          type: 'number', def: 200,
          hint: 'Zyada hone par user ko sync karne ka message milega' }
      ]},
      { id: 'scanner', label: 'Live camera scan (QR/barcode)', fields: [
        { key: 'scanner.liveUrl', label: 'External scanner URL (HTTPS)', type: 'text', def: '', full: true,
          hint: 'pwa/qr-scanner/ folder ko GitHub Pages ya apne domain par host karein aur uska URL yahan paste karein. Phones par live camera ka ekmatr reliable hal — Google ka sandbox Apps Script ke andar camera block karta hai (guide: release/QR-LIVE-CAMERA-GUIDE.md).' },
        { key: 'scanner.inApp', label: 'In-app camera attempt (fallback)', type: 'switch', def: true,
          hint: 'External URL na ho to app ke andar browser camera azmaayein; sandbox block kare to manual entry khuli rehti hai.' }
      ]},
      { id: 'pwahosting', label: 'Hosting & PWA URLs (dedicated)', icon: '🌐', fields: [
        { key: 'pwa.urls.frontend', label: 'Main frontend URL', type: 'text', def: '', full: true,
          hint: 'Main app kahan host hai — e.g. https://your-domain.com, https://owner.github.io/haseeb-autos, Netlify / self-hosted. Khali = auto (current origin). Owner settings mein bina code change ke badal sakta hai.',
          sec: { title: '① Core hosts', tone: 'ok' }},
        { key: 'pwa.urls.backend', label: 'Backend / GAS Web App URL (exec)', type: 'text', def: '', full: true,
          hint: 'GAS exec URL — e.g. https://script.google.com/macros/s/XXXX/exec. Khali = auto (current GAS). External/static frontends isi se API call karte hain. Duplicate of backend.gasUrl for easy discovery.',
          sec: { title: '① Core hosts', tone: 'ok' }},
        { key: 'pwa.urls.apiBase', label: 'API base / GAS exec (alias)', type: 'text', def: '', full: true,
          hint: 'Agar aapka backend alag domain par hai (custom API) — warna khali chhorein (exec URL hi API base hai).',
          sec: { title: '① Core hosts', tone: 'ok' }},
        { key: 'pwa.urls.pwaBase', label: 'PWA service worker / static host', type: 'text', def: '', full: true,
          hint: 'Service worker aur manifest kahan host hain — aksar frontend hi. Custom PWA domain ho to yahan likhein.',
          sec: { title: '① Core hosts', tone: 'ok' }},
        { key: 'pwa.urls.wh', label: 'Warehouse PWA URL', type: 'text', def: '', full: true,
          hint: 'Dedicated Warehouse app — e.g. https://your-domain.com/?app=wh ya https://your-domain.com/pwa/wh/ — khali = main frontend + ?app=wh',
          sec: { title: '② Per-app dedicated PWAs (?app=)', tone: 'info' }},
        { key: 'pwa.urls.fo', label: 'Field Orders PWA URL', type: 'text', def: '', full: true,
          hint: 'Field app (?app=fo) — khali = main frontend + ?app=fo',
          sec: { title: '② Per-app dedicated PWAs (?app=)', tone: 'info' }},
        { key: 'pwa.urls.sm', label: 'Salesman PWA URL', type: 'text', def: '', full: true,
          hint: 'Salesman app (?app=sm) — khali = main frontend + ?app=sm',
          sec: { title: '② Per-app dedicated PWAs (?app=)', tone: 'info' }},
        { key: 'pwa.urls.pos', label: 'POS PWA URL', type: 'text', def: '', full: true,
          hint: 'Dedicated POS (?app=pos) — khali = main frontend + ?app=pos',
          sec: { title: '② Per-app dedicated PWAs (?app=)', tone: 'info' }}
      ]}
    ]
  },
  {
    id: 'inventory', label: 'Inventory & Warehouse', icon: '📦', sub: [
      { id: 'stock', label: 'Stock rules', fields: [
        { key: 'allowNegativeStock', label: 'Allow negative stock', type: 'switch', def: false },
        { key: 'stockValuation', label: 'Valuation method', type: 'select', options: 'WAC,FIFO,LATEST', def: 'WAC' },
        { key: 'lowStockThreshold', label: 'Default low-stock qty', type: 'number', def: 5 },
        { key: 'autoReorder', label: 'Auto reorder suggestions', type: 'switch', def: true },
        { key: 'trackBins', label: 'Enable bin/rack tracking', type: 'switch', def: true },
        { key: 'trackLots', label: 'Enable batch/lot & expiry', type: 'switch', def: false },
        { key: 'trackSerial', label: 'Enable serial/IMEI tracking', type: 'switch', def: false },
        { key: 'transferApproval', label: 'Transfers need approval', type: 'switch', def: false }
      ]},
      { id: 'audit', label: 'Counts & audits', fields: [
        { key: 'audit.freezeOnCount', label: 'Freeze stock during count', type: 'switch', def: true },
        { key: 'audit.varianceAlert', label: 'Alert on variance > (qty)', type: 'number', def: 3 },
        { key: 'audit.requireReason', label: 'Reason mandatory', type: 'switch', def: true },
        { key: 'audit.autoPost', label: 'Auto-post small variances', type: 'switch', def: false }
      ]},
      { id: 'product', label: 'Product defaults', fields: [
        { key: 'defaultUnit', label: 'Default UoM', type: 'text', def: 'PCS' },
        { key: 'defaultCategory', label: 'Default category', type: 'text', def: 'Car Care' },
        { key: 'defaultTaxCode', label: 'Default tax code', type: 'text', def: '' },
        { key: 'autoBarcode', label: 'Auto barcode on new item', type: 'switch', def: true },
        { key: 'barcodeType', label: 'Barcode symbology', type: 'select', options: 'CODE39,CODE128,EAN13', def: 'CODE39' },
        { key: 'skuPrefix', label: 'Auto SKU prefix', type: 'text', def: 'HA' }
      ]}
    ]
  },
  {
    id: 'trade', label: 'Trade & Accounts', icon: '🤝', sub: [
      { id: 'customers', label: 'Customers', fields: [
        { key: 'customer.creditCheck', label: 'Enforce credit limit', type: 'switch', def: true },
        { key: 'customer.loyalty', label: 'Loyalty points per 1000', type: 'number', def: 1 },
        { key: 'customer.requirePhone', label: 'Phone mandatory', type: 'switch', def: false },
        { key: 'customer.autoCode', label: 'Auto customer codes', type: 'switch', def: true },
        { key: 'priceTiers', label: 'Price tiers (comma)', type: 'text', def: 'RETAIL,WHOLESALE,MECHANIC,CORPORATE' }
      ]},
      { id: 'purchase', label: 'Purchase', fields: [
        { key: 'purchase.budgetCheck', label: 'Enforce PO budget', type: 'switch', def: true },
        { key: 'purchase.approval', label: 'PO needs approval', type: 'switch', def: false },
        { key: 'purchase.grnUpdatesCost', label: 'GRN updates item cost', type: 'switch', def: true },
        { key: 'purchase.grnUpdatesPrice', label: 'GRN updates retail price', type: 'switch', def: false },
        { key: 'purchase.marginDefault', label: 'Default margin %', type: 'number', def: 25 },
        /* v2.6 §3 */
        { key: 'purchasePriceCompare', label: 'PO/GRN par pichhli rate ka muqabla dikhaen',
          type: 'switch', def: true,
          hint: 'Har line par Previous rate, Retail, Wholesale aur farq (Rs / %) record hota hai' }
      ]},
      { id: 'paymethods', label: 'Payment methods', fields: [
        { key: 'paymentMethods', label: 'Enabled methods (comma)', type: 'text',
          def: 'CASH,CARD,BANK,JAZZCASH,EASYPAISA,RAAST,CHEQUE,CREDIT' },
        { key: 'pay.settleSkipWeekend', label: 'Settlement mein weekend skip karein', type: 'switch', def: true },
        { key: 'pay.cheque.bounceCharges', label: 'Cheque bounce bank charges', type: 'number', def: 350,
          hint: 'Bounce hone par customer se liye jane wale bank charges' },
        { key: 'pay.cheque.clearDays', label: 'Cheque clearing days', type: 'number', def: 2 },
        { key: 'pay.cheque.alertDays', label: 'Clearing overdue alert (days)', type: 'number', def: 5 }
      ]},
      { id: 'loyalty', label: 'Loyalty points', fields: [
        { key: 'loyalty.enabled', label: 'Loyalty program', type: 'switch', def: true , sec: { title: '① Program on/off', tone: 'ok' }},
        { key: 'loyalty.perAmount', label: 'Har kitne Rs par points', type: 'number', def: 1000 , sec: { title: '② Points ka hisaab', tone: 'info' }},
        { key: 'loyalty.points', label: 'Kitne points milte hain', type: 'number', def: 1 , sec: { title: '② Points ka hisaab', tone: 'info' }},
        { key: 'loyalty.rate', label: '1 point = kitne rupay', type: 'number', def: 1 , sec: { title: '② Points ka hisaab', tone: 'info' }},
        { key: 'loyalty.minRedeem', label: 'Kam az kam redeem points', type: 'number', def: 50 , sec: { title: '③ Redeem (istamal)', tone: 'warn' }},
        { key: 'loyalty.maxRedeemPct', label: 'Invoice ka max % points se', type: 'number', def: 50 , sec: { title: '③ Redeem (istamal)', tone: 'warn' }},
        { key: 'loyalty.rounding', label: 'Rounding (DOWN/NEAREST/UP)', type: 'text', def: 'DOWN' , sec: { title: '② Points ka hisaab', tone: 'info' }},
        { key: 'loyalty.expiryMonths', label: 'Points expiry (mahine, 0 = kabhi nahi)', type: 'number', def: 0 , sec: { title: '③ Redeem (istamal)', tone: 'warn' }}
      ]},
      { id: 'accounts', label: 'Accounts', fields: [
        { key: 'accounts.enableExpenses', label: 'Enable expense module', type: 'switch', def: true , sec: { title: '① Modules on/off', tone: 'ok' }},
        { key: 'accounts.cashSessions', label: 'Enable cash drawer sessions', type: 'switch', def: true , sec: { title: '① Modules on/off', tone: 'ok' }},
        { key: 'accounts.varianceAlert', label: 'Alert cash variance >', type: 'number', def: 100 , sec: { title: '① Modules on/off', tone: 'ok' }},
        { key: 'expenseCategories', label: 'Expense categories', type: 'text', full: true, def: 'Rent,Salary,Electricity,Fuel,Tea/Meals,Repair,Marketing,Transport,Petty cash,Other' , sec: { title: '② Expenses', tone: 'warn' }},
        /* v2.5: accounting engine */
        { key: 'accounts.autoPost', label: 'Auto-post vouchers (sale/GRN/payment/expense)', type: 'switch', def: true,
          hint: 'Band karne par sirf hath se banaye vouchers account books mein aayenge' , sec: { title: '③ Auto-posting & dashboard', tone: 'info' }},
        { key: 'accounts.showOnDashboard', label: 'Accounting KPIs on dashboard', type: 'switch', def: true , sec: { title: '③ Auto-posting & dashboard', tone: 'info' }},
        { key: 'accounts.fiscalCloseLock', label: 'Lock posted vouchers (void ke liye admin)', type: 'switch', def: true , sec: { title: '③ Auto-posting & dashboard', tone: 'info' }},
        /* v2.5.1: cash book — opening balance koi hardcoded 0 nahi, yahan se set hoti hai */
        { key: 'cashbook.method', label: 'Cash book — default method', type: 'select',
          options: 'ALL,CASH,CARD,BANK,WALLET,CHEQUE,OTHER', def: 'ALL',
          hint: 'ALL = sab methods milkar · koi ek = sirf wahi method (CASH = asli cash book)' , sec: { title: '④ Cash book', tone: 'fin' }},
        { key: 'cashbook.openingCash', label: 'Cash book opening balance', type: 'number', def: 0,
          hint: 'Jis din se aap hisaab rakhna shuru kar rahe hain us din ka cash/bank balance' , sec: { title: '④ Cash book', tone: 'fin' }},
        { key: 'cashbook.openingAsOf', label: 'Opening balance as on date', type: 'text', def: '',
          hint: 'yyyy-mm-dd · khali chhoren to poori history ka net opening ban jata hai' , sec: { title: '④ Cash book', tone: 'fin' }},
        { key: 'cashbook.includeExpenses', label: 'Cash book mein expenses bhi dikhayein', type: 'switch', def: true , sec: { title: '④ Cash book', tone: 'fin' }}
      ]},
      /* v2.5: wallet gateway — EasyPaisa / JazzCash (asli API, no hardcoding) */
      { id: 'wallets', label: 'Wallets (EasyPaisa / JazzCash)', icon: '📲', fields: [
        { key: 'wallet.autoPollSeconds', label: 'Status auto-check (seconds)', type: 'number', def: 5,
          hint: 'POS par request ke baad kitni der mein status check ho' , sec: { title: '① Status polling', tone: 'info' }},
        { key: 'wallet.pollAttempts', label: 'Kitni dafa status check karein', type: 'number', def: 24 , sec: { title: '① Status polling', tone: 'info' }},

        { key: 'wallet.EASYPAISA.mode', label: 'EasyPaisa mode', type: 'select',
          options: 'OFF,SANDBOX,LIVE', def: 'OFF',
          hint: 'OFF = sirf manual txn ID · SANDBOX/LIVE = asli API (docs: Easypay REST v4)' , sec: { title: '② EasyPaisa', tone: 'ok' }},
        { key: 'wallet.EASYPAISA.storeId', label: 'EasyPaisa Store ID', type: 'text', def: '',
          hint: 'Merchant portal se milti hai (numeric)' , sec: { title: '② EasyPaisa', tone: 'ok' }},
        { key: 'wallet.EASYPAISA.username', label: 'EasyPaisa API username', type: 'text', def: '' , sec: { title: '② EasyPaisa', tone: 'ok' }},
        { key: 'wallet.EASYPAISA.password', label: 'EasyPaisa API password', type: 'password', def: '',
          hint: 'Header "Credentials: base64(username:password)" mein jata hai' , sec: { title: '② EasyPaisa', tone: 'ok' }},
        { key: 'wallet.EASYPAISA.accountNum', label: 'EWP account number', type: 'text', def: '',
          hint: 'Inquire API ke liye (merchant profile par "EWP Account #")' , sec: { title: '② EasyPaisa', tone: 'ok' }},
        { key: 'wallet.EASYPAISA.hashKey', label: 'Hash key (hosted checkout)', type: 'password', def: '' , sec: { title: '② EasyPaisa', tone: 'ok' }},
        { key: 'wallet.EASYPAISA.receiverMobile', label: 'Merchant wallet number', type: 'text', def: '',
          hint: 'Jis number par paisa aata hai (03xxxxxxxxx)' , sec: { title: '② EasyPaisa', tone: 'ok' }},
        { key: 'wallet.EASYPAISA.baseSandbox', label: 'Sandbox base URL', type: 'text', full: true,
          def: 'https://easypaystg.easypaisa.com.pk/easypay-service/rest/v4' , sec: { title: '② EasyPaisa', tone: 'ok' }},
        { key: 'wallet.EASYPAISA.baseLive', label: 'Live base URL', type: 'text', full: true,
          def: 'https://easypay.easypaisa.com.pk/easypay-service/rest/v4' , sec: { title: '② EasyPaisa', tone: 'ok' }},
        { key: 'wallet.EASYPAISA.maxAmount', label: 'Max amount per request', type: 'number', def: 0,
          hint: '0 = koi limit nahi' , sec: { title: '② EasyPaisa', tone: 'ok' }},
        { key: 'wallet.EASYPAISA.tokenMinutes', label: 'Token expiry (minutes)', type: 'number', def: 30 , sec: { title: '② EasyPaisa', tone: 'ok' }},

        { key: 'wallet.JAZZCASH.mode', label: 'JazzCash mode', type: 'select',
          options: 'OFF,SANDBOX,LIVE', def: 'OFF',
          hint: 'OFF = manual · SANDBOX/LIVE = REST Mobile Wallet API (v3.9)' , sec: { title: '③ JazzCash', tone: 'warn' }},
        { key: 'wallet.JAZZCASH.merchantId', label: 'JazzCash Merchant ID', type: 'text', def: '' , sec: { title: '③ JazzCash', tone: 'warn' }},
        { key: 'wallet.JAZZCASH.password', label: 'JazzCash API password', type: 'password', def: '' , sec: { title: '③ JazzCash', tone: 'warn' }},
        { key: 'wallet.JAZZCASH.integritySalt', label: 'Integrity salt (HMAC key)', type: 'password', def: '' , sec: { title: '③ JazzCash', tone: 'warn' }},
        { key: 'wallet.JAZZCASH.subMerchantId', label: 'Sub-merchant ID (optional)', type: 'text', def: '' , sec: { title: '③ JazzCash', tone: 'warn' }},
        { key: 'wallet.JAZZCASH.productId', label: 'Product ID (optional)', type: 'text', def: '' , sec: { title: '③ JazzCash', tone: 'warn' }},
        { key: 'wallet.JAZZCASH.receiverMobile', label: 'Merchant wallet number', type: 'text', def: '' , sec: { title: '③ JazzCash', tone: 'warn' }},
        { key: 'wallet.JAZZCASH.baseSandbox', label: 'Sandbox base URL', type: 'text',
          def: 'https://sandbox.jazzcash.com.pk' , sec: { title: '③ JazzCash', tone: 'warn' }},
        { key: 'wallet.JAZZCASH.baseLive', label: 'Live base URL', type: 'text',
          def: 'https://payments.jazzcash.com.pk' , sec: { title: '③ JazzCash', tone: 'warn' }},
        { key: 'wallet.JAZZCASH.maxAmount', label: 'Max amount per request', type: 'number', def: 0 , sec: { title: '③ JazzCash', tone: 'warn' }},
        { key: 'wallet.JAZZCASH.tokenMinutes', label: 'Token expiry (minutes)', type: 'number', def: 30 , sec: { title: '③ JazzCash', tone: 'warn' }}
      ]},
      { id: 'coa', label: 'Chart of accounts', icon: '📒', fields: [
        { key: 'acc.cash', label: 'Cash account code', type: 'text', def: '1000', hint: 'Cash in hand' , sec: { title: '① Cash & bank', tone: 'ok' }},
        { key: 'acc.bank', label: 'Default bank account code', type: 'text', def: '1100' , sec: { title: '① Cash & bank', tone: 'ok' }},
        { key: 'acc.receivable', label: 'Accounts receivable code', type: 'text', def: '1200' , sec: { title: '② Receivable / payable', tone: 'warn' }},
        { key: 'acc.payable', label: 'Accounts payable code', type: 'text', def: '2000' , sec: { title: '② Receivable / payable', tone: 'warn' }},
        { key: 'acc.inventory', label: 'Inventory code', type: 'text', def: '1300' , sec: { title: '③ Inventory & sales', tone: 'info' }},
        { key: 'acc.sales', label: 'Sales revenue code', type: 'text', def: '4000' , sec: { title: '③ Inventory & sales', tone: 'info' }},
        { key: 'acc.salesWholesale', label: 'Wholesale sales code', type: 'text', def: '4100' , sec: { title: '③ Inventory & sales', tone: 'info' }},
        { key: 'acc.purchase', label: 'Purchases / COGS code', type: 'text', def: '5000' , sec: { title: '④ Purchase & COGS', tone: 'fin' }},
        { key: 'acc.cogs', label: 'Cost of goods sold code', type: 'text', def: '5000' , sec: { title: '④ Purchase & COGS', tone: 'fin' }},
        { key: 'acc.freight', label: 'Freight code', type: 'text', def: '5100' , sec: { title: '④ Purchase & COGS', tone: 'fin' }},
        { key: 'acc.expense', label: 'Default expense code', type: 'text', def: '6900' , sec: { title: '⑤ Expense, tax & equity', tone: 'err' }},
        { key: 'acc.tax', label: 'Tax payable code', type: 'text', def: '2100' , sec: { title: '⑤ Expense, tax & equity', tone: 'err' }},
        { key: 'acc.capital', label: 'Owner capital code', type: 'text', def: '3000' , sec: { title: '⑤ Expense, tax & equity', tone: 'err' }},
        { key: 'acc.retained', label: 'Retained earnings code', type: 'text', def: '3100' , sec: { title: '⑤ Expense, tax & equity', tone: 'err' }},
        { key: 'accounts.expenseMap', label: 'Expense category → account id (JSON)', type: 'textarea', def: '',
          hint: '{"Rent":"ACC...","Salary":"ACC..."} — khali chhor dein to naam se match hoga' , sec: { title: '⑥ Mapping (category → account)', tone: 'inv' }}
      ]}
    ]
  },
  {
    id: 'modules', label: 'Modules & Navigation', icon: '🧩', sub: [
      { id: 'modules', label: 'Enable / disable modules', fields: [
        { key: 'mod.pos', label: 'Point of Sale', type: 'switch', def: true , sec: { title: '① Kaun se modules chalu hain', tone: 'ok' }},
        { key: 'mod.items', label: 'Items & products', type: 'switch', def: true , sec: { title: '① Kaun se modules chalu hain', tone: 'ok' }},
        { key: 'mod.inventory', label: 'Inventory', type: 'switch', def: true , sec: { title: '① Kaun se modules chalu hain', tone: 'ok' }},
        { key: 'mod.warehouse', label: 'Warehouse & bins', type: 'switch', def: true , sec: { title: '① Kaun se modules chalu hain', tone: 'ok' }},
        { key: 'mod.purchase', label: 'Purchase', type: 'switch', def: true , sec: { title: '① Kaun se modules chalu hain', tone: 'ok' }},
        { key: 'mod.parties', label: 'Customers & suppliers', type: 'switch', def: true , sec: { title: '① Kaun se modules chalu hain', tone: 'ok' }},
        { key: 'mod.money', label: 'Payments & cash', type: 'switch', def: true , sec: { title: '② Reports, users aur zyada', tone: 'info' }},
        { key: 'mod.reports', label: 'Reports', type: 'switch', def: true , sec: { title: '② Reports, users aur zyada', tone: 'info' }},
        { key: 'mod.users', label: 'Users & security', type: 'switch', def: true , sec: { title: '② Reports, users aur zyada', tone: 'info' }},
        { key: 'mod.ai', label: 'AI assistant', type: 'switch', def: true , sec: { title: '② Reports, users aur zyada', tone: 'info' }},
        { key: 'mod.offline', label: 'Offline POS', type: 'switch', def: true , sec: { title: '② Reports, users aur zyada', tone: 'info' }},
        { key: 'mod.labels', label: 'Barcode labels', type: 'switch', def: true , sec: { title: '② Reports, users aur zyada', tone: 'info' }}
      ]},
      { id: 'nav', label: 'Navigation', fields: [
        { key: 'nav.style', label: 'Sidebar style', type: 'select', options: 'expanded,compact,floating', def: 'expanded' },
        { key: 'nav.showIcons', label: 'Show nav icons', type: 'switch', def: true },
        { key: 'nav.groupLabels', label: 'Show group labels', type: 'switch', def: true },
        { key: 'nav.rememberLast', label: 'Remember last screen', type: 'switch', def: true }
      ]}
    ]
  },
  {
    id: 'automation', label: 'Automation & AI', icon: '🤖', sub: [
      { id: 'comms', label: 'WhatsApp & SMS', fields: [
        { key: 'comms.whatsapp.provider', label: 'WhatsApp provider', type: 'select',
          options: 'LINK,META,TWILIO,WEBHOOK', def: 'LINK' , sec: { title: '① WhatsApp', tone: 'ok' }},
        { key: 'comms.whatsapp.apiVersion', label: 'Meta API version', type: 'text', def: 'v20.0' , sec: { title: '① WhatsApp', tone: 'ok' }},
        { key: 'comms.whatsapp.phoneNumberId', label: 'Meta phone number ID', type: 'text', def: '' , sec: { title: '① WhatsApp', tone: 'ok' }},
        { key: 'comms.whatsapp.token', label: 'Meta access token', type: 'password', def: '' , sec: { title: '① WhatsApp', tone: 'ok' }},
        { key: 'comms.twilio.sid', label: 'Twilio Account SID', type: 'text', def: '' , sec: { title: '② Twilio', tone: 'warn' }},
        { key: 'comms.twilio.token', label: 'Twilio auth token', type: 'password', def: '' , sec: { title: '② Twilio', tone: 'warn' }},
        { key: 'comms.twilio.whatsappFrom', label: 'Twilio WhatsApp from', type: 'text', def: '' , sec: { title: '② Twilio', tone: 'warn' }},
        { key: 'comms.twilio.smsFrom', label: 'Twilio SMS from', type: 'text', def: '' , sec: { title: '② Twilio', tone: 'warn' }},
        { key: 'comms.sms.provider', label: 'SMS provider', type: 'select', options: 'NONE,TWILIO,WEBHOOK', def: 'NONE' , sec: { title: '③ SMS & email', tone: 'info' }},
        { key: 'comms.email.provider', label: 'Email provider', type: 'select',
          options: 'APPS_SCRIPT,GMAIL,WEBHOOK,MAILTO', def: 'APPS_SCRIPT' , sec: { title: '③ SMS & email', tone: 'info' }},
        { key: 'comms.email.fromName', label: 'Email from name', type: 'text', def: 'Haseeb Autos' , sec: { title: '③ SMS & email', tone: 'info' }},
        { key: 'comms.webhook.url', label: 'Custom webhook URL', type: 'text', def: '' , sec: { title: '④ Webhook', tone: 'inv' }},
        { key: 'comms.webhook.json', label: 'Webhook JSON template', type: 'textarea',
          def: '{"to":"{{to}}","message":"{{message}}"}' , sec: { title: '④ Webhook', tone: 'inv' }},
        { key: 'comms.countryCode', label: 'Country code', type: 'text', def: '92' , sec: { title: '⑤ Auto-send & templates', tone: 'fin' }},
        { key: 'comms.attachPdf', label: 'Invoice PDF attach karein', type: 'switch', def: true , sec: { title: '⑤ Auto-send & templates', tone: 'fin' }},
        { key: 'comms.autoSendInvoice', label: 'Sale ke baad auto WhatsApp', type: 'switch', def: false , sec: { title: '⑤ Auto-send & templates', tone: 'fin' }},
        { key: 'comms.invoiceTemplate', label: 'Invoice message template', type: 'textarea',
          def: 'Salam {{customer}}!\nInvoice {{invoiceNo}} · {{date}}\nTotal: {{total}}\nPaid: {{paid}}\nDue: {{due}}\n{{link}}\nShukriya — {{business}}' , sec: { title: '⑤ Auto-send & templates', tone: 'fin' }},
        { key: 'comms.reminderTemplate', label: 'Reminder template', type: 'textarea',
          def: 'Yaad-dahani: {{customer}}, invoice {{invoiceNo}} ki baqaya {{due}} reh gayi hai. {{link}}' , sec: { title: '⑤ Auto-send & templates', tone: 'fin' }}
      ]},
      { id: 'priceimport', label: 'Price list import', fields: [
        { key: 'price-import.minMarginPct', label: 'Min margin % (guard)', type: 'number', def: 5 },
        { key: 'price-import.autoCreate', label: 'Naye items auto banayein', type: 'switch', def: false },
        { key: 'price-import.defaultCategory', label: 'Default category', type: 'text', def: 'Uncategorised' },
        { key: 'price-import.defaultMarginPct', label: 'Default margin % (naye item par)', type: 'number', def: 25 },
        { key: 'price-import.gmailQuery', label: 'Gmail search query', type: 'text', def: 'has:attachment newer_than:30d' }
      ]},
      { id: 'migration', label: 'Firebase migration', fields: [
        { key: 'migration.autoSync', label: 'Daily auto-sync to Firebase', type: 'switch', def: false },
        { key: 'migration.syncTables', label: 'Sync tables (comma)', type: 'text',
          def: 'Items,Customers,Sales,SaleItems,StockLedger,Payments' },
        { key: 'migration.reminderRows', label: 'Migrate-sochne ki had (rows)', type: 'number', def: 100000 }
      ]},
      { id: 'exports', label: 'Export & share', fields: [
        { key: 'exports.folder', label: 'Drive folder name', type: 'text', def: 'Haseeb Autos Exports' },
        { key: 'exports.shareLinks', label: 'Share links (anyone with link)', type: 'switch', def: true },
        { key: 'exports.invoiceTitle', label: 'Invoice title', type: 'text', def: 'TAX INVOICE' },
        { key: 'exports.invoiceTerms', label: 'Invoice terms', type: 'textarea',
          def: 'Goods once sold will not be taken back without original invoice.' }
      ]},
      { id: 'ai', label: 'AI assistant', fields: [
        /* ── ① Agent · provider · model ─────────────────────────────────── */
        { key: 'aiEnabled', label: 'Enable AI agent', type: 'switch', def: true,
          sec: { title: '① Agent · provider · model', tone: 'ok' } },
        { key: 'aiProvider', label: 'Provider', type: 'select', options: 'GEMINI,OPENAI,OPENROUTER,MOCK', def: 'GEMINI',
          sec: { title: '① Agent · provider · model', tone: 'ok' } },
        { key: 'aiModel', label: 'Model (khali = auto: provider se latest free model)', type: 'text', def: '',
          hint: 'AI Agent screen par "Refresh models" daba kar asli list lain — koi model code mein hardcode nahi',
          sec: { title: '① Agent · provider · model', tone: 'ok' } },
        { key: 'aiEndpoint', label: 'Custom endpoint (optional)', type: 'text', def: '',
          sec: { title: '① Agent · provider · model', tone: 'ok' } },

        /* ── ② Model list (catalog) ─────────────────────────────────────── */
        { key: 'aiPreferFree', label: 'Free tier models ko tarjeeh dein', type: 'switch', def: true,
          sec: { title: '② Model list (catalog)', tone: 'warn' } },
        { key: 'aiOpenaiPrefixes', label: 'OpenAI: kin families ko list karein (comma)', type: 'text',
          def: 'gpt-,o1,o3,o4,chatgpt,computer-use',
          sec: { title: '② Model list (catalog)', tone: 'warn' } },
        { key: 'aiModelCacheMins', label: 'Model list cache (minutes)', type: 'number', def: 720,
          sec: { title: '② Model list (catalog)', tone: 'warn' } },
        { key: 'ai.modelCatalog.GEMINI', label: 'Gemini catalog override (JSON)', type: 'textarea', def: '',
          hint: 'Khali chhor dein — "Refresh models" se provider ki asli list aa jayegi',
          sec: { title: '② Model list (catalog)', tone: 'warn' } },
        { key: 'ai.modelCatalog.OPENAI', label: 'OpenAI catalog override (JSON)', type: 'textarea', def: '',
          sec: { title: '② Model list (catalog)', tone: 'warn' } },
        { key: 'ai.modelCatalog.OPENROUTER', label: 'OpenRouter catalog override (JSON)', type: 'textarea', def: '',
          sec: { title: '② Model list (catalog)', tone: 'warn' } },

        /* ── ③ Behaviour · jawab ka style ───────────────────────────────── */
        { key: 'aiTemperature', label: 'Temperature (0–1)', type: 'number', def: 0.2,
          sec: { title: '③ Behaviour · jawab ka style', tone: 'info' } },
        { key: 'aiMaxTokens', label: 'Max output tokens', type: 'number', def: 2048,
          sec: { title: '③ Behaviour · jawab ka style', tone: 'info' } },
        { key: 'aiLanguage', label: 'Answer language', type: 'select', options: 'AUTO,ROMAN_URDU,URDU,ENGLISH', def: 'AUTO',
          sec: { title: '③ Behaviour · jawab ka style', tone: 'info' } },
        { key: 'aiStyle', label: 'Answer style', type: 'select', options: 'TINY,SHORT,DETAILED', def: 'SHORT',
          sec: { title: '③ Behaviour · jawab ka style', tone: 'info' } },
        { key: 'aiPersona', label: 'Agent persona / instructions', type: 'textarea',
          def: 'Aap Haseeb Autos ke business assistant hain. Roman Urdu mein short, numbers ke sath jawab dein.',
          sec: { title: '③ Behaviour · jawab ka style', tone: 'info' } },
        { key: 'aiHistoryTurns', label: 'History turns (context)', type: 'number', def: 8,
          sec: { title: '③ Behaviour · jawab ka style', tone: 'info' } },

        /* ── ④ Guardrails · limits (hifazat) ────────────────────────────── */
        { key: 'aiCanWrite', label: 'AI write mode (drafts only)', type: 'switch', def: false,
          sec: { title: '④ Guardrails · limits (hifazat)', tone: 'err' } },
        { key: 'aiRequireApproval', label: 'Approval zaroori (har action par)', type: 'switch', def: true,
          sec: { title: '④ Guardrails · limits (hifazat)', tone: 'err' } },
        { key: 'aiAutoSuggest', label: 'Auto suggestions (dashboard/chat)', type: 'switch', def: true,
          sec: { title: '④ Guardrails · limits (hifazat)', tone: 'err' } },
        { key: 'aiFallbackMock', label: 'Key na ho to MOCK mode', type: 'switch', def: true,
          sec: { title: '④ Guardrails · limits (hifazat)', tone: 'err' } },
        { key: 'aiRedact', label: 'Redact CNIC / phone / ids', type: 'switch', def: true,
          sec: { title: '④ Guardrails · limits (hifazat)', tone: 'err' } },
        { key: 'aiRateLimitPerDay', label: 'Rate limit — system / day', type: 'number', def: 200,
          sec: { title: '④ Guardrails · limits (hifazat)', tone: 'err' } },
        { key: 'aiRateLimitPerUser', label: 'Rate limit — per user / day', type: 'number', def: 40,
          sec: { title: '④ Guardrails · limits (hifazat)', tone: 'err' } },
        { key: 'aiDataScope', label: 'Data scope (location ids, comma)', type: 'text', def: '',
          sec: { title: '④ Guardrails · limits (hifazat)', tone: 'err' } }
      ]},
      { id: 'alerts', label: 'Alerts & notifications', fields: [
        { key: 'alert.lowStock', label: 'Low stock alert', type: 'switch', def: true },
        { key: 'alert.outOfStock', label: 'Out of stock alert', type: 'switch', def: true },
        { key: 'alert.receivables', label: 'Receivable over (days)', type: 'number', def: 30 },
        { key: 'alert.pendingPO', label: 'Pending PO over (days)', type: 'number', def: 7 },
        { key: 'alert.cashVariance', label: 'Cash variance alert', type: 'switch', def: true },
        { key: 'alert.dailySummary', label: 'Daily summary to owner', type: 'switch', def: false }
      ]},
      { id: 'reorder', label: 'Purchase reorder rules', fields: [
        { key: 'autoReorderMethod', label: 'Suggestion method', type: 'select', options: 'VELOCITY,REORDER_POINT,MIN_MAX', def: 'VELOCITY' , sec: { title: '① Tareeqa (method)', tone: 'ok' }},
        { key: 'autoReorderLookback', label: 'Sales lookback (days)', type: 'number', def: 30 , sec: { title: '① Tareeqa (method)', tone: 'ok' }},
        { key: 'autoReorderCoverageDays', label: 'Cover stock for (days)', type: 'number', def: 30 , sec: { title: '① Tareeqa (method)', tone: 'ok' }},
        { key: 'autoReorderLeadTimeDays', label: 'Supplier lead time (days)', type: 'number', def: 7 , sec: { title: '② Lead time & safety', tone: 'warn' }},
        { key: 'autoReorderSafetyDays', label: 'Safety stock (days)', type: 'number', def: 7 , sec: { title: '② Lead time & safety', tone: 'warn' }},
        { key: 'autoReorderSupplierMode', label: 'Preferred supplier', type: 'select', options: 'PRIMARY,LAST,CHEAPEST', def: 'PRIMARY' , sec: { title: '③ Supplier & PO', tone: 'info' }},
        { key: 'autoReorderCreate', label: 'Create PO as', type: 'select', options: 'DRAFT,APPROVE', def: 'DRAFT' , sec: { title: '③ Supplier & PO', tone: 'info' }},
        { key: 'autoReorderMinValue', label: 'Min order value per item', type: 'number', def: 0 , sec: { title: '③ Supplier & PO', tone: 'info' }},
        { key: 'autoReorderIncludeSlow', label: 'Include slow / no-movement items', type: 'switch', def: false , sec: { title: '③ Supplier & PO', tone: 'info' }}
      ]},
      { id: 'jobs', label: 'Scheduled jobs (triggers)', fields: [
        { key: 'job.dailyReorder', label: 'Rozana auto reorder', type: 'switch', def: true,
          help: 'Subah Reorder.run() chalta hai → suggestions + notification' },
        { key: 'job.dailyHour', label: 'Reorder ka waqt (0-23)', type: 'number', def: 7 },
        { key: 'job.dailyAutoPO', label: 'Suggestions se khud PO banaayein', type: 'switch', def: false },
        { key: 'job.dailyAlerts', label: 'Rozana alerts regenerate', type: 'switch', def: true },
        { key: 'job.alertsHour', label: 'Alerts ka waqt (0-23)', type: 'number', def: 6 },
        { key: 'job.timezone', label: 'Timezone', type: 'text', def: 'Asia/Karachi' }
      ]},
      { id: 'numbering', label: 'Document numbering', fields: [
        { key: 'prefix.SALE', label: 'Invoice prefix', type: 'text', def: 'INV' },
        { key: 'prefix.RETURN', label: 'Sale return', type: 'text', def: 'RTN' },
        { key: 'prefix.PO', label: 'Purchase order', type: 'text', def: 'PO' },
        { key: 'prefix.GRN', label: 'GRN', type: 'text', def: 'GRN' },
        { key: 'prefix.TRANSFER', label: 'Transfer', type: 'text', def: 'TRF' },
        { key: 'prefix.ADJ', label: 'Adjustment', type: 'text', def: 'ADJ' },
        { key: 'prefix.PAY', label: 'Payment', type: 'text', def: 'PAY' },
        { key: 'numberPadding', label: 'Number padding', type: 'number', def: 5 }
      ]}
    ]
  },
  {
    id: 'security', label: 'Security & Sessions', icon: '🔐', sub: [
      { id: 'access', label: 'Access', fields: [
        { key: 'sessionHours', label: 'Session length (hours)', type: 'number', def: 12 },
        { key: 'maxLoginAttempts', label: 'Max failed logins', type: 'number', def: 5 },
        { key: 'requireStrongPassword', label: 'Require strong password', type: 'switch', def: true },
        { key: 'allowUserBranchSwitch', label: 'Users can switch branch', type: 'switch', def: true },
        { key: 'auditRetentionDays', label: 'Keep audit logs (days)', type: 'number', def: 365 },
        { key: 'auditAllReads', label: 'Also log reads (heavy)', type: 'switch', def: false }
      ]},
      { id: 'loginPage', label: 'Login page', fields: [
        { key: 'login.showDemo', label: 'Show demo login buttons / credentials on homepage', type: 'switch', def: true,
          hint: 'Production par OFF karein — demo buttons/credentials chhup jayenge (login functionality waise hi rahega). Default ON.' }
      ]}
    ]
  },
  {
    id: 'backend', label: 'Backend & Integrations', icon: '🔗', sub: [
      { id: 'connection', label: 'Connection (GAS / Sheet)', fields: [
        { key: 'backend.gasUrl', label: 'GAS Web App URL (exec)', type: 'text', def: '', full: true,
          hint: 'External/static frontends is URL se backend ko call karte hain. Khali = auto (current exec URL). Owner bina code edit ke yahan badal sakta hai. https://script.google.com/macros/s/.../exec' , sec: { title: '① GAS Web App connection', tone: 'ok' }},
        { key: 'backend.sheetUrl', label: 'Google Sheet URL (optional)', type: 'text', def: '', full: true,
          hint: 'Sirf reference — sheet ka link. Asal SPREADSHEET_ID server-side ScriptProperties mein mehfooz hai, frontend par kabhi nahi aata.' , sec: { title: '① GAS Web App connection', tone: 'ok' }},
        { key: 'integration.env', label: 'Environment', type: 'select', options: 'prod,demo,dev', def: 'prod',
          hint: 'prod = live, demo = trial data, dev = test' , sec: { title: '① GAS Web App connection', tone: 'ok' }},
        { key: 'pwa.urls.frontend', label: 'Frontend URL (alias, also in Mobile apps → Hosting)', type: 'text', def: '', full: true,
          hint: 'Main frontend alias — dono jagah se editable; host-agnostic (GH Pages / Netlify / self-hosted / local).' , sec: { title: '① GAS Web App connection', tone: 'ok' }},
        { key: 'pwa.urls.backend', label: 'Backend API URL (alias)', type: 'text', def: '', full: true,
          hint: 'Backend alias — khali = backend.gasUrl. Change without code after deploy.' , sec: { title: '① GAS Web App connection', tone: 'ok' }}
      ]},
      { id: 'external', label: 'External frontends', fields: [
        { key: 'integration.enabled', label: 'Enable external frontends (Netlify / GitHub Pages / self-hosted)', type: 'switch', def: true,
          hint: 'OFF = sirf GAS-hosted app chalegi, JSONP/external calls block' , sec: { title: '② External access', tone: 'warn' }},
        { key: 'integration.allowedOrigins', label: 'Allowed origins (comma)', type: 'text', def: '', full: true,
          hint: 'Jin domains ko API call ki ijazat hai: https://your-site.netlify.app,https://owner.github.io — khali = koi origin limit nahi (phir bhi auth zaroori). Strict mode ON par origin bina allow-list ke block.' , sec: { title: '② External access', tone: 'warn' }},
        { key: 'integration.requireToken', label: 'Require API token for external calls', type: 'switch', def: false,
          hint: 'ON = external frontends ko har request par integration.apiKey bhejni hogi' , sec: { title: '② External access', tone: 'warn' }},
        { key: 'integration.strictOrigin', label: 'Strict origin check (block if origin not in list)', type: 'switch', def: false,
          hint: 'ON = allowedOrigins khali na ho to bina origin ke requests block' , sec: { title: '② External access', tone: 'warn' }},
        { key: 'integration.apiKey', label: 'Integration API key (shared secret)', type: 'password', def: '',
          hint: 'External frontends is key ko header/payload mein bhejenge. Server-side hashed, frontend par •••• dikhega. Khali = no extra key (auth token hi kafi).' , sec: { title: '② External access', tone: 'warn' }}
      ]},
      { id: 'offline', label: 'Offline & self-hosted', fields: [
        { key: 'integration.offlineEnabled', label: 'Enable offline queue (self-hosted / offline PC)', type: 'switch', def: true,
          hint: 'Net na ho to bills phone/PC par queue honge, net aate hi sync — local/offline use ke liye' , sec: { title: '③ Offline & local PC', tone: 'info' }},
        { key: 'pwa.offlineEnabled', label: 'PWA offline cache (duplicate control)', type: 'switch', def: true,
          hint: 'Yeh aur integration.offlineEnabled dono ON hona chahiye offline ke liye' , sec: { title: '③ Offline & local PC', tone: 'info' }}
      ]}
    ]
  }
];

var Config = {

  /* ============================== SETTINGS ================================= */
  /** Flat {key: value} with defaults applied */
  all: function (s) {
    var out = {};
    CONFIG_DEFS.forEach(function (g) {
      (g.sub || []).forEach(function (t) {
        (t.fields || []).forEach(function (f) { out[f.key] = f.def; });
      });
    });
    var rows = DB.all('Settings');
    rows.forEach(function (r) { if (r.key) out[r.key] = r.value; });
    return out;
  },

  /** Masked view for frontend — never leaks secrets */
  maskedAll: function (s) {
    var raw = Config.all(s);
    if (typeof Security !== 'undefined' && Security.maskSettings) {
      try { return Security.maskSettings(raw); } catch (e) { return raw; }
    }
    return raw;
  },

  /** UI schema (filtered by permission for sensitive groups) */
  defs: function (s) {
    var cfg = Config.all(s);
    var out = [];
    CONFIG_DEFS.forEach(function (g) {
      if (g.id === 'security' && s && !Auth.can(s, 'users.manage')) return;
      if (g.id === 'automation' && s && !Auth.can(s, 'ai.use') && !Auth.can(s, 'settings.manage')) { /* still show numbering */ }
      var clone = { id: g.id, label: g.label, icon: g.icon, sub: [] };
      (g.sub || []).forEach(function (t) {
        var tt = { id: t.id, label: t.label, fields: [] };
        (t.fields || []).forEach(function (f) {
          var rawVal = cfg[f.key] !== undefined ? cfg[f.key] : f.def;
          // mask secrets before they reach frontend — never send raw passwords
          if (f.type === 'password' && typeof Security !== 'undefined' && Security.isPasswordKey) {
            try { if (U.str(rawVal)) rawVal = Security.SENTINEL; else rawVal = ''; } catch (e) {}
          } else if (typeof Security !== 'undefined' && Security.isPasswordKey && Security.isPasswordKey(f.key)) {
            try { if (U.str(rawVal)) rawVal = Security.SENTINEL; } catch (e) {}
          }
          var ff = {
            key: f.key, label: f.label, type: f.type, def: f.def, hint: f.hint || '',
            full: !!f.full,
            options: f.options ? String(f.options).split(',') : null,
            value: rawVal,
            sec: f.sec || null
          };
          if (ff.type === 'switch') ff.value = (String(ff.value) === 'true' || ff.value === true);
          if (ff.type === 'number') ff.value = U.num(ff.value);
          tt.fields.push(ff);
        });
        clone.sub.push(tt);
      });
      out.push(clone);
    });
    try { out = Bilingual.apply(out); } catch (e) { }
    return out;
  },

  save: function (values, s) {
    if (s && !Auth.can(s, 'settings.manage') && !Auth.can(s, '*')) {
      var allowed = ['theme', 'defaultLanguage', 'density', 'fontSize', 'sidebarCollapsed', 'animations'];
      Object.keys(values).forEach(function (k) {
        if (allowed.indexOf(k) === -1) delete values[k];
      });
    }
    // never overwrite secrets with sentinel — keep old value
    if (typeof Security !== 'undefined' && Security.stripSentinel) {
      try {
        var stripped = Security.stripSentinel(values);
        values = stripped.values;
        if (!Object.keys(values).length) return Config.all(s); // only sentinel was sent
      } catch (e) { }
    }
    // also handle integration.apiKey (stored hashed in ScriptProperties, not Settings)
    var apiKeySent = false;
    if (values['integration.apiKey'] !== undefined) {
      apiKeySent = true;
      var rawApi = U.str(values['integration.apiKey']);
      delete values['integration.apiKey'];
      if (rawApi && rawApi !== Security.SENTINEL) {
        // delegate to Integration (hashed)
        try { Integration.saveConfig({ 'integration.apiKey': rawApi }, s); } catch (e) { throw e; }
      } else if (!rawApi) {
        try { Integration.saveConfig({ 'integration.apiKey': '' }, s); } catch (e) {}
      }
      // if sentinel, keep existing (do nothing)
      if (!Object.keys(values).length) return Config.maskedAll ? Config.maskedAll(s) : Config.all(s);
    }
    var saved = DB.setSettings(values, s);
    Audit.log('CONFIG_UPDATE', 'Settings', '', { values: saved.previous }, values, s);
    return (typeof Config.maskedAll === 'function' ? Config.maskedAll(s) : Config.all(s));
  },

  get: function (key, dft, s) {
    var rec = DB.findOne('Settings', function (r) { return r.key === key; });
    if (rec) return rec.value;
    var found = null;
    CONFIG_DEFS.forEach(function (g) {
      (g.sub || []).forEach(function (t) {
        (t.fields || []).forEach(function (f) { if (f.key === key) found = f.def; });
      });
    });
    return found === null ? dft : found;
  },

  resetGroup: function (groupId, s) {
    Auth.require(s, 'settings.manage');
    var g = CONFIG_DEFS.filter(function (x) { return x.id === groupId; })[0];
    if (!g) throw new Error('Group not found');
    (g.sub || []).forEach(function (t) {
      (t.fields || []).forEach(function (f) { DB.setSetting(f.key, String(f.def), s); });
    });
    return Config.all(s);
  },

  /* =========================== GENERIC LISTS =============================== */
  /** Dynamic lists: categories, brands, units, tax codes, warehouses, bins... */
  LIST_ENTITIES: {
    categories: 'Categories', brands: 'Brands', units: 'Units', taxCodes: 'TaxCodes',
    warehouses: 'Warehouses', bins: 'Bins', priceLists: 'PriceLists'
  },

  list: function (entity, s, opts) {
    var sheet = Config.LIST_ENTITIES[entity];
    if (!sheet) throw new Error('Unknown list: ' + entity);
    var rows = DB.all(sheet);
    if (opts && opts.q) rows = rows.filter(function (r) { return U.matchAll(r.name + ' ' + (r.code || ''), opts.q); });
    if (opts && opts.locationId) rows = rows.filter(function (r) { return !r.locationId || r.locationId === opts.locationId; });
    return rows.filter(function (r) { return U.str(r.active) !== 'false'; });
  },

  saveList: function (entity, rec, s) {
    Auth.require(s, 'settings.manage');
    var sheet = Config.LIST_ENTITIES[entity];
    if (!sheet) throw new Error('Unknown list: ' + entity);
    var payload = U.pick(rec, SCHEMA[sheet]);
    if (!payload.name) throw new Error('Name zaroori hai.');
    if (payload.id) return DB.update(sheet, payload.id, payload, s);
    payload.active = payload.active === false ? 'false' : 'true';
    return DB.insert(sheet, payload, s);
  },

  removeList: function (entity, id, s) {
    Auth.require(s, 'settings.manage');
    return DB.remove(Config.LIST_ENTITIES[entity], id, s);
  },

  /* =========================== CUSTOM FIELDS =============================== */
  /**
   * entity: ITEM | CUSTOMER | SUPPLIER | SALE | PURCHASE
   * type: TEXT | NUMBER | DATE | SELECT | SWITCH | TEXTAREA
   */
  customFields: function (entity, s) {
    return DB.all('CustomFields')
      .filter(function (f) { return f.entity === entity && U.str(f.active) !== 'false'; })
      .sort(function (a, b) { return U.num(a.sortOrder) - U.num(b.sortOrder); });
  },

  allCustomFields: function (s) { return DB.all('CustomFields'); },

  saveCustomField: function (rec, s) {
    Auth.require(s, 'settings.manage');
    var payload = U.pick(rec, ['entity', 'key', 'label', 'type', 'options', 'defaultValue',
      'required', 'showInTable', 'showInPos', 'showInForm', 'tab', 'sortOrder', 'active']);
    if (!payload.key) payload.key = 'cf_' + U.slug(payload.label || 'field').replace(/-/g, '_');
    if (!payload.label) throw new Error('Label zaroori hai.');
    if (rec.id) return DB.update('CustomFields', rec.id, payload, s);
    payload.sortOrder = payload.sortOrder || DB.all('CustomFields').length + 1;
    payload.active = 'true';
    return DB.insert('CustomFields', payload, s);
  },

  removeCustomField: function (id, s) {
    Auth.require(s, 'settings.manage');
    return DB.remove('CustomFields', id, s);
  },

  /** entity record se custom field values nikalna / set karna (JSON column `customFields`) */
  readCustom: function (record, entity) {
    try { return JSON.parse(record && record.customFields ? record.customFields : '{}') || {}; }
    catch (e) { return {}; }
  },

  /* ============================== MENU (nav) =============================== */
  /** Dynamic sidebar — DB se aata hai; empty ho to defaults */
  menu: function (s) {
    var rows = DB.all('MenuConfig');
    if (!rows.length) return Config.defaultMenu();
    var tree = [];
    var byParent = {};
    rows.filter(function (r) { return U.str(r.active) !== 'false'; })
      .forEach(function (r) {
        var node = { id: r.id, parentId: r.parentId || '', label: r.label, icon: r.icon || '',
          route: r.route || '', perm: r.perm || '', badge: r.badge || '', children: [] };
        if (!node.parentId) tree.push(node); else (byParent[node.parentId] = byParent[node.parentId] || []).push(node);
      });
    function attach(n) { n.children = byParent[n.id] || []; n.children.forEach(attach); }
    tree.forEach(attach);
    // permission filter
    function allow(n) { n.children = n.children.filter(allow); return !n.perm || Auth.can(s, n.perm); }
    return tree.filter(allow);
  },

  defaultMenu: function () {
    return [
      { id: 'm_main', label: 'Main', icon: '', route: '', perm: '', children: [
        { id: 'm_dash', label: 'Dashboard', icon: '📊', route: 'dashboard', perm: 'dashboard.view', children: [] },
        { id: 'm_pos', label: 'Point of Sale', icon: '🧾', route: 'pos', perm: 'pos.access', children: [] },
        { id: 'm_sales', label: 'Sales History', icon: '📁', route: 'sales', perm: 'sales.view', children: [] }
      ]},
      { id: 'm_stock', label: 'Catalog & Stock', icon: '', route: '', perm: '', children: [
        { id: 'm_items', label: 'Items', icon: '📦', route: 'items', perm: 'items.view', children: [] },
        { id: 'm_inv', label: 'Inventory', icon: '🏬', route: 'inventory', perm: 'stock.view', children: [] },
        { id: 'm_wh2', label: 'Warehouse', icon: '🏗', route: 'warehouse', perm: 'stock.view', children: [] },
        { id: 'm_wh', label: 'Warehouse', icon: '🏗', route: 'warehouse', perm: 'stock.view', children: [] }
      ]},
      { id: 'm_trade', label: 'Trade', icon: '', route: '', perm: '', children: [
        { id: 'm_pur', label: 'Purchase', icon: '🚚', route: 'purchase', perm: 'purchase.view', children: [] },
        { id: 'm_dem', label: 'Demands', icon: '📝', route: 'demands', perm: 'demand.view', children: [] },
        { id: 'm_reo', label: 'Auto Reorder', icon: '🔁', route: 'reorder', perm: 'purchase.view', children: [] },
        { id: 'm_par', label: 'Customers & Suppliers', icon: '👥', route: 'parties', perm: 'customers.view', children: [] },
        { id: 'm_mon', label: 'Payments & Cash', icon: '💰', route: 'money', perm: 'payments.view', children: [] }
      ]},
      { id: 'm_insight', label: 'Insights & Admin', icon: '', route: '', perm: '', children: [
        { id: 'm_ins', label: 'Dashboards', icon: '📈', route: 'insights', perm: 'reports.view', children: [] },
        { id: 'm_rep', label: 'Reports', icon: '📊', route: 'reports', perm: 'reports.view', children: [] },
        { id: 'm_shop', label: 'Shop Open/Close', icon: '🏪', route: 'shop', perm: 'pos.access', children: [] },
        { id: 'm_usr', label: 'Users & Security', icon: '🔐', route: 'users', perm: 'users.view', children: [] },
        { id: 'm_set', label: 'Settings', icon: '⚙', route: 'settings', perm: 'settings.view', children: [] },
        { id: 'm_ai', label: 'AI Agent', icon: '✨', route: 'ai', perm: 'ai.use', children: [] }
      ]}
    ];
  },

  saveMenuItem: function (rec, s) {
    Auth.require(s, 'settings.manage');
    var payload = U.pick(rec, ['parentId', 'label', 'icon', 'route', 'perm', 'badge', 'sortOrder', 'active']);
    if (rec.id) return DB.update('MenuConfig', rec.id, payload, s);
    payload.active = 'true';
    return DB.insert('MenuConfig', payload, s);
  },

  removeMenuItem: function (id, s) {
    Auth.require(s, 'settings.manage');
    DB.all('MenuConfig').forEach(function (r) { if (r.parentId === id) DB.remove('MenuConfig', r.id, s); });
    return DB.remove('MenuConfig', id, s);
  },

  resetMenu: function (s) {
    Auth.require(s, 'settings.manage');
    DB.all('MenuConfig').forEach(function (r) { DB.remove('MenuConfig', r.id, s); });
    var defs = Config.defaultMenu();
    defs.forEach(function (g) {
      var gid = U.uid('MNU');
      DB.insert('MenuConfig', { id: gid, parentId: '', label: g.label, icon: g.icon, route: '', perm: '', sortOrder: '1', active: 'true' }, s);
      g.children.forEach(function (c) {
        DB.insert('MenuConfig', { id: U.uid('MNU'), parentId: gid, label: c.label, icon: c.icon,
          route: c.route, perm: c.perm, sortOrder: '1', active: 'true' }, s);
      });
    });
    return Config.menu(s);
  },

  /* ========================== PRINT TEMPLATES ============================== */
  templates: function (type, s) {
    var rows = DB.all('PrintTemplates').filter(function (r) { return !type || r.type === type; });
    if (!rows.length) return [Config.defaultTemplate(type)];
    return rows;
  },

  defaultTemplate: function (type) {
    if (type === 'LABEL') {
      return { id: 'tpl_label_default', type: 'LABEL', name: 'Standard 50x30', active: 'true',
        json: JSON.stringify({ width: 50, height: 30, showName: true, showCode: true,
          showPrice: true, showBrand: false, barcodeType: 'CODE39', qr: false, copies: 1, fontSize: 9 }) };
    }
    return { id: 'tpl_receipt_default', type: 'RECEIPT', name: 'Thermal 80mm', active: 'true',
      json: JSON.stringify({ header: 'Haseeb Autos', footer: 'Shukriya! Phir aayein.',
        showLogo: true, showCustomer: true, showTax: true, showBarcode: true,
        showSalesman: true, showPayments: true, paper: '80mm', copies: 1 }) };
  },

  saveTemplate: function (rec, s) {
    Auth.require(s, 'settings.manage');
    var payload = U.pick(rec, ['type', 'name', 'json', 'active']);
    if (rec.id && String(rec.id).indexOf('tpl_') !== 0) return DB.update('PrintTemplates', rec.id, payload, s);
    return DB.insert('PrintTemplates', payload, s);
  },

  /* v2.7 — BUG FIX: frontend se 'config.templates.remove' call hota tha
     (Settings → Print templates → 🗑), magar backend me route HI NAHI tha.
     Router 'NO_ROUTE' error bhejta, aur frontend `.catch(() => {})` usay
     chhupa kar "Deleted ✅" dikhata — yani user sochta tha delete ho gaya
     jab ke template waise ka waisa rehta tha. Ab asal route mojood hai. */
  removeTemplate: function (id, s) {
    Auth.require(s, 'settings.manage');
    if (!id) throw new Error('Template id nahi mila');
    /* built-in default templates (tpl_…) sheet me maujood nahi — unhen
       delete karna mumkin nahi, is liye seedha success (UI refresh kar lega) */
    if (String(id).indexOf('tpl_') === 0) return { id: id, removed: false, builtIn: true };
    return DB.remove('PrintTemplates', id, s);
  },

  /* ============================= SAVED VIEWS =============================== */
  /** Per-screen filter presets (user ke apne filters save ho jatay hain) */
  savedViews: function (screen, s) {
    return DB.all('SavedViews').filter(function (v) {
      return v.screen === screen && (v.userId === s.userId || U.str(v.shared) === 'true');
    });
  },

  saveView: function (rec, s) {
    var payload = U.pick(rec, ['screen', 'name', 'filters', 'columns', 'sort', 'shared']);
    payload.userId = s.userId;
    if (rec.id) return DB.update('SavedViews', rec.id, payload, s);
    return DB.insert('SavedViews', payload, s);
  },

  removeView: function (id, s) { return DB.remove('SavedViews', id, s); }
};
