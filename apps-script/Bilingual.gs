/* ============================================================================
   Bilingual.gs — ENGLISH TITLES + URDU/ENGLISH HINTS + TOOLTIPS
   ============================================================================
   v2.6 QA — user ki report:
     "Settings & Configuration may bohot se fields zig-zag hain, align nahi,
      jab ke sections mein jagah hai. English titles use karein, hints Urdu
      aur English dono mein, aur tooltips bhi (app-wide, jahan sirf Urdu
      titles/headings thay)."

   Ye file SIRF ek dictionary hai — koi feature nahi hataya gaya.
   Kaam karne ka tareeqa:
     1. LABEL_EN  : def.key  → English title (asli Urdu/Roman-Urdu `ur` me mehfooz)
     2. SEC_EN    : section title → English heading (Urdu `urSec` me mehfooz)
     3. HINT_EN   : def.key  → English hint (asli Urdu hint `urHint` me mehfooz)

   Render (UI2.form) har field par:
     title   = English                      (heading/label)
     hint    = "اردو · English"             (dono zabanen, neeche chhoti line)
     tooltip = "English — اردو" + hint      (mouse rakhne par)

   Naya field add karna hai? Bas yahan 1 line — baqi sab khud ho jayega.
   Kisi key ka translation nahi mila to ASLI label/heading waise hi rahega
   (kabhi kuch toota/hataya nahi jata).
   ========================================================================== */

var Bilingual = {

  /* ---------- 1) FIELD TITLES: English (asli Urdu `ur` mein rehti hai) ------ */
  LABEL_EN: {

    /* Business profile · invoice */
    'invoice.showBank':        'Print bank details on invoice',
    'invoice.showWords':       'Print amount in words',
    'invoice.showSignature':   'Print signature line',

    /* POS · product cards */
    'pos.virtualScroll':       'Virtual scrolling (large catalogs)',
    'pos.virtualThreshold':    'Virtual scrolling starts at (items)',
    'pos.cardMinWidth':        'Card minimum width (px)',
    'pos.showSupplierOnCard':  'Show supplier name on card',
    'pos.hoverQuickView':      'Hover quick-view on card (supplier / stock / rates)',

    /* Expenses */
    'expenseApproval':         'Require approval for large expenses',
    'expenseApprovalOver':     'Approval threshold — expenses above stay pending',

    /* Reports (shop open / close) */
    'dayReportAutoOpen':       'Create opening report when shop opens',
    'dayReportAutoClose':      'Create closing report when shop closes',
    'reportShowCodes':         'Show barcode + QR on reports',
    'dayReportAutoPrint':      'Open print dialog as soon as a report is made',

    /* PWA · offline */
    'pwa.offlineEnabled':      'Keep working offline',
    'pwa.offlineMaxQueue':     'Offline queue limit (max pending entries)',

    /* Purchase */
    'purchasePriceCompare':    'Compare previous rate on PO / GRN',
    'pay.settleSkipWeekend':   'Skip weekends in settlement',

    /* Loyalty */
    'loyalty.perAmount':       'Points are earned per (Rs)',
    'loyalty.points':          'Points earned',
    'loyalty.rate':            '1 point is worth (Rs)',
    'loyalty.minRedeem':       'Minimum points to redeem',
    'loyalty.maxRedeemPct':    'Max % of invoice payable by points',
    'loyalty.expiryMonths':    'Points expiry (months, 0 = never)',

    /* Accounting */
    'accounts.fiscalCloseLock':'Lock posted vouchers (admin needed to void)',
    'cashbook.includeExpenses':'Show expenses in cash book',

    /* Wallets */
    'wallet.pollAttempts':     'Status check attempts',

    /* Comms */
    'comms.attachPdf':         'Attach invoice PDF',
    'comms.autoSendInvoice':   'Auto-send WhatsApp after a sale',

    /* Price import */
    'price-import.autoCreate':      'Auto-create new items',
    'price-import.defaultMarginPct':'Default margin % (for new items)',

    /* Migration */
    'migration.reminderRows':  'Row limit that triggers a migration hint',

    /* AI agents */
    'aiModel':                 'Model (blank = auto: latest free model from provider)',
    'aiPreferFree':            'Prefer free-tier models',
    'aiOpenaiPrefixes':        'OpenAI: families to list (comma separated)',
    'aiRequireApproval':       'Require approval (for every action)',
    'aiFallbackMock':          'Use MOCK mode when no API key',

    /* Scheduled jobs */
    'job.dailyHour':           'Reorder job hour (0-23)',
    'job.dailyAutoPO':         'Auto-create POs from suggestions',
    'job.alertsHour':          'Alerts job hour (0-23)'
  },

  /* ---------- 2) SECTION HEADINGS: English (Urdu `urSec` mein rehti hai) ---- */
  SEC_EN: {
    '① Naam aur pehchan':            '① Name & identity',
    '③ Tareekh & waqt':              '③ Date & time',
    '② Card par kya dikhe':          '② What shows on the card',
    '④ Performance (bare catalog)':  '④ Performance (large catalog)',
    '① Receipt ka matn':             '① Receipt text',
    '② Points ka hisaab':            '② Points calculation',
    '① Kaun se modules chalu hain':  '① Which modules are on',
    '② Reports, users aur zyada':    '② Reports, users & more',
    '③ Behaviour · jawab ka style':  '③ Behaviour · answer style',
    '① Tareeqa (method)':            '① Method',
    '③ Redeem (istamal)':            '③ Redeem (usage)'
  },

  /* ---------- 3) HINTS: English (asli Urdu hint `urHint` mein rehti hai) ---- */
  HINT_EN: {
    'branchLabel':            'Branch / Shop / Store — this word is used across the whole app',
    'dayReportAutoOpen':      'Saved in report history — you can print or export it later',
    'dayReportAutoClose':     'Includes cash reconciliation, expenses and top items',
    'reportShowCodes':        'Scanning finds the document instantly — easier tracking and search',
    'dayReportAutoPrint':     '§7 — the print window opens right after open/close (can be turned off)',
    'pwa.wh.enabled':         'Receive · Put-away · Count · Transfer — for warehouse staff',
    'pwa.fo.enabled':         'Take orders in the market — works without internet (offline queue)',
    'pwa.sm.enabled':         'My stock · Sell · Collect · Settle',
    'pwa.offlineEnabled':     'With no internet, entries are saved on the phone and sync when it returns',
    'pwa.offlineMaxQueue':    'Above this limit the user is asked to sync',
    'purchasePriceCompare':   'Every line records Previous rate, Retail, Wholesale and the difference (Rs / %)',
    'pay.cheque.bounceCharges':'Bank charges recovered from the customer when a cheque bounces',
    'accounts.autoPost':      'Off = only manually created vouchers reach the account books',
    'cashbook.method':        'ALL = all methods combined · pick one = only that method (CASH = true cash book)',
    'cashbook.openingCash':   'Cash / bank balance on the day you start keeping books',
    'cashbook.openingAsOf':   'yyyy-mm-dd · leave blank and the net of full history becomes the opening',
    'wallet.autoPollSeconds': 'How soon after a POS request the status is checked',
    'wallet.EASYPAISA.mode':  'OFF = manual txn ID only · SANDBOX/LIVE = real API (docs: Easypay REST v4)',
    'wallet.EASYPAISA.storeId':'Issued by the merchant portal (numeric)',
    'wallet.EASYPAISA.password':'Goes in the header "Credentials: base64(username:password)"',
    'wallet.EASYPAISA.accountNum':'For the Inquire API ("EWP Account #" on your merchant profile)',
    'wallet.EASYPAISA.receiverMobile':'The number that receives the money (03xxxxxxxxx)',
    'wallet.EASYPAISA.maxAmount':'0 = no limit',
    'wallet.JAZZCASH.mode':   'OFF = manual · SANDBOX/LIVE = REST Mobile Wallet API (v3.9)',
    'acc.cash':               'Cash in hand',
    'accounts.expenseMap':    '{"Rent":"ACC...","Salary":"ACC..."} — leave blank to match by name',
    'aiModel':                'Press "Refresh models" on the AI Agent screen — no model is hardcoded',
    'ai.modelCatalog.GEMINI': 'Leave blank — "Refresh models" fetches the provider\'s real list'
  },

  /* ==========================================================================
     apply(defs) — Config.defs() ke baad chalta hai.
     Har field me ye 4 cheezen add karta hai (additive — kuch nahi hat-ta):
        ur      : asli Urdu/Roman-Urdu label  (tooltip me)
        urHint  : asli Urdu hint              (hint line me)
        enHint  : English hint                (hint line me)
        tip     : poora tooltip text          (mouse rakhne par)
     ======================================================================== */
  apply: function (defs) {
    if (!defs || !defs.length) return defs;
    var LE = Bilingual.LABEL_EN, SE = Bilingual.SEC_EN, HE = Bilingual.HINT_EN;

    defs.forEach(function (g) {
      (g.sub || []).forEach(function (t) {
        (t.fields || []).forEach(function (f) {
          var original = f.label || '';

          /* 1) English title (asli ko `ur` me mehfooz rakho) */
          if (LE[f.key]) { f.ur = original; f.label = LE[f.key]; }

          /* 2) Section heading English (asli ko `urSec` me) */
          if (f.sec && f.sec.title && SE[f.sec.title]) {
            f.sec.urSec = f.sec.title;
            f.sec.title = SE[f.sec.title];
          }

          /* 3) Hint — Urdu AUR English dono */
          var urHint = f.hint || '';
          var enHint = HE[f.key] || '';
          f.urHint = urHint;
          f.enHint = enHint;
          /* dono mila kar hint line banegi (UI2.form render karega) */

          /* 4) Tooltip — English title + Urdu + dono hints */
          var parts = [];
          parts.push(f.label || original);
          if (f.ur && f.ur !== f.label) parts.push(f.ur);
          if (enHint) parts.push(enHint);
          if (urHint && urHint !== enHint) parts.push(urHint);
          f.tip = parts.join('  ·  ');
        });
      });
    });
    return defs;
  },

  /* section heading ke liye (App_Config / UI2.section) */
  secTitle: function (t) { return (Bilingual.SEC_EN[t] || t); }
};
