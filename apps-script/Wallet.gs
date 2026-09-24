/**
 * HASEEB AUTOS - ERP / POS  ::  WALLET GATEWAY (EasyPaisa / JazzCash)
 * ---------------------------------------------------------------------------
 * POS par mobile-wallet payment ko *asli* gateway se initiate / verify karne
 * ka engine. Manual mode (sirf txn ID) bhi hai, taake merchant onboarding se
 * pehle bhi kaam chalta rahe.
 *
 * ─────────────────────── OFFICIAL INTEGRATION FACTS ─────────────────────────
 * EASYPAISA (REST v4, "Easypay Merchant Integration Guide v4.1.x")
 *   • Auth header : Credentials: base64(username:password)      (per request)
 *   • Initiate MA : POST {base}/easypay-service/rest/v4/initiate-ma-transaction
 *       body  { orderId, storeId(Long), transactionAmount(Double),
 *               transactionType:'MA', mobileAccountNo(03xxxxxxxxx),
 *               emailAddress, tokenExpiry('yyyymmdd HHmmss'), optional1..5 }
 *       resp  { orderId, storeId, transactionId, transactionDateTime,
 *               responseCode, responseDesc }        ← '0000' = SUCCESS
 *   • Initiate OTC: POST {base}/easypay-service/rest/v4/initiate-otc-transaction
 *       body  { orderId, storeId, transactionAmount, transactionType:'OTC',
 *               msisdn, emailAddress, tokenExpiry }
 *       resp  { … paymentToken, paymentTokenExpiryDateTime, responseCode, responseDesc }
 *   • Inquire     : POST {base}/easypay-service/rest/v4/inquire-transaction
 *       body  { orderId, storeId, accountNum (merchant EWP account #) }
 *       resp  { … transactionStatus: PAID|FAILED|PENDING|BLOCKED|EXPIRED|REVERSED,
 *               transactionAmount, msisdn, paymentMode, responseCode, responseDesc }
 *   • Hosted checkout: POST https://easypay.easypaisa.com.pk/easypay/Index.jsf
 *       signed fields (storeId, orderRefNum, transactionAmount, postBackURL,
 *       paymentMethod:'InitialRequest', merchantHashedReq / encryptedHashRequest)
 *       hash = base64(HMAC-SHA256("amount=..&postBackURL=..&orderRefNum=..&storeId=..&transactionType=..", hashKey))
 *   • Sandbox keys EasyPaisa khud issue nahi karta — merchant rep se maangna hota hai.
 *
 * JAZZCASH (Payment Gateway Integration Guide v3.9)
 *   • REST Mobile Wallet: POST {base}/ApplicationAPI/API/Payment/DoTransaction
 *       body  pp_Version '1.1', pp_TxnType 'MWALLET', pp_Language 'EN',
 *             pp_MerchantID, pp_SubMerchantID, pp_Password, pp_BankID, pp_ProductID,
 *             pp_TxnRefNo, pp_Amount (PAISA — decimals nahi, e.g. 10000 = Rs 100.00),
 *             pp_TxnCurrency 'PKR', pp_TxnDateTime(yyyyMMddHHmmss),
 *             pp_BillReference, pp_Description, pp_TxnExpiryDateTime,
 *             pp_ReturnURL, ppmpf_1 = payer mobile (03xxxxxxxxx),
 *             pp_SecureHash = HMAC-SHA256
 *       resp  pp_ResponseCode '000' = success, pp_ResponseMessage,
 *             pp_RetreivalReferenceNo, pp_AuthCode
 *   • Inquiry: POST {base}/ApplicationAPI/API/Payment/Inquiry  (pp_TxnRefNo …)
 *   • Hash  : salt(saltpepper) + '&' + sorted pp_* values (values only,
 *             alphabetical by field name) → HMAC-SHA256 → hex.
 *   • Sandbox: https://sandbox.jazzcash.com.pk  ·  Live: https://payments.jazzcash.com.pk
 *
 * ─────────────────────────── NO HARDCODING RULE ────────────────────────────
 * Har endpoint, credential, mode (OFF / SANDBOX / LIVE), payer-receiver label,
 * amount limit aur timeout **Settings ▸ Trade ▸ Wallets** se aata hai. Gateway
 * apna path rotate kare to Settings mein URL edit karein — code change ki
 * zaroorat nahi. Credentials kabhi log / response mein nahi likhe jate.
 * ---------------------------------------------------------------------------
 */

var Wallet = {

  /* ============================ DEFINITIONS ================================ */

  /**
   * Provider catalogue — Settings isi se banti hai aur runtime bhi isi se chalti hai.
   *   mode OFF → sirf manual entry (txn ID); SANDBOX / LIVE → asli API call
   */
  PROVIDERS: {
    EASYPAISA: {
      id: 'EASYPAISA', label: 'EasyPaisa', icon: '\uD83D\uDFE2', methodId: 'EASYPAISA',
      flows: ['MA', 'OTC'],
      defaults: {
        mode: 'OFF',
        baseSandbox: 'https://easypaystg.easypaisa.com.pk/easypay-service/rest/v4',
        baseLive: 'https://easypay.easypaisa.com.pk/easypay-service/rest/v4',
        maPath: '/initiate-ma-transaction',
        otcPath: '/initiate-otc-transaction',
        inquirePath: '/inquire-transaction',
        checkoutUrl: 'https://easypay.easypaisa.com.pk/easypay/Index.jsf',
        storeId: '', username: '', password: '', accountNum: '',
        receiverMobile: '', hashKey: '',
        maxAmount: 0, tokenMinutes: 30
      },
      secretKeys: ['password', 'hashKey']
    },
    JAZZCASH: {
      id: 'JAZZCASH', label: 'JazzCash', icon: '\uD83D\uDFE3', methodId: 'JAZZCASH',
      flows: ['MWALLET', 'OTC'],
      defaults: {
        mode: 'OFF',
        baseSandbox: 'https://sandbox.jazzcash.com.pk',
        baseLive: 'https://payments.jazzcash.com.pk',
        doPath: '/ApplicationAPI/API/Payment/DoTransaction',
        inquirePath: '/ApplicationAPI/API/Payment/Inquiry',
        checkoutUrl: 'https://payments.jazzcash.com.pk/CustomerPortal/TransactionManagement/HostedPaymentLink',
        merchantId: '', password: '', integritySalt: '', subMerchantId: '',
        receiverMobile: '', productId: '',
        maxAmount: 0, tokenMinutes: 30
      },
      secretKeys: ['password', 'integritySalt']
    }
  },

  /** status values — UI aur ledger dono inhi ko samajhte hain */
  STATUS: ['INITIATED', 'PENDING', 'PAID', 'FAILED', 'EXPIRED', 'REVERSED', 'BLOCKED', 'MANUAL'],

  /* ============================== CONFIG =================================== */

  /** Settings ▸ Trade ▸ Wallets se config uthao (defaults ke sath merge) */
  cfg: function (providerId) {
    var def = Wallet.PROVIDERS[U.upper(providerId)];
    if (!def) return null;
    var st = DB.settings();
    var out = { id: def.id, label: def.label, icon: def.icon, methodId: def.methodId, flows: def.flows };
    Object.keys(def.defaults).forEach(function (k) {
      var v = st['wallet.' + def.id + '.' + k];
      out[k] = (v === undefined || v === null || v === '') ? def.defaults[k] : U.str(v);
    });
    out.mode = U.upper(out.mode || 'OFF');
    if (['OFF', 'SANDBOX', 'LIVE'].indexOf(out.mode) < 0) out.mode = 'OFF';
    out.sandbox = out.mode === 'SANDBOX';
    out.base = out.sandbox ? out.baseSandbox : out.baseLive;
    out.enabled = out.mode !== 'OFF';
    out.hasCredentials = def.id === 'EASYPAISA'
      ? !!(out.storeId && out.username && out.password)
      : !!(out.merchantId && out.password && out.integritySalt);
    return out;
  },

  /** UI ke liye — secret kabhi wapas nahi bheje jate, sirf presence flag */
  providers: function (p, s) {
    Auth.require(s, 'payments.view');
    return Object.keys(Wallet.PROVIDERS).map(function (id) {
      var c = Wallet.cfg(id);
      return {
        id: c.id, label: c.label, icon: c.icon, methodId: c.methodId, flows: c.flows,
        mode: c.mode, enabled: c.enabled, sandbox: c.sandbox,
        hasCredentials: c.hasCredentials, base: c.base,
        receiverMobile: c.receiverMobile,
        maxAmount: U.num(c.maxAmount), tokenMinutes: U.num(c.tokenMinutes, 30),
        ready: c.enabled && c.hasCredentials
      };
    });
  },

  /* ============================== HELPERS ================================== */

  /** Pakistani mobile → 03xxxxxxxxx (11 digit). Na ho to '' */
  msisdn: function (v) {
    var d = U.str(v).replace(/[^\d+]/g, '');
    if (/^\+92\d{10}$/.test(d)) d = '0' + d.slice(3);
    if (/^92\d{10}$/.test(d)) d = '0' + d.slice(2);
    if (/^3\d{9}$/.test(d)) d = '0' + d;
    return /^03\d{9}$/.test(d) ? d : '';
  },

  /** HMAC-SHA256 → hex (JazzCash) */
  hmacHex: function (value, key) {
    var bytes = Utilities.computeHmacSha256Signature(Utilities.newBlob(value).getBytes(), key);
    return bytes.map(function (b) {
      var v = (b < 0 ? b + 256 : b).toString(16);
      return v.length === 1 ? '0' + v : v;
    }).join('');
  },

  /** HMAC-SHA256 → base64 (EasyPaisa hosted checkout) */
  hmacB64: function (value, key) {
    var bytes = Utilities.computeHmacSha256Signature(Utilities.newBlob(value).getBytes(), key);
    return Utilities.base64Encode(bytes);
  },

  b64: function (v) { return Utilities.base64Encode(U.str(v)); },

  /** order reference — EasyPaisa max 20 alphanumeric */
  orderId: function (seed) {
    var base = U.str(seed).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (base && base.length >= 6 && base.length <= 18) return base;
    return 'WP' + String(Date.now()).slice(-12);
  },

  /** yyyyMMddHHmmss (JazzCash) */
  stamp: function (d) {
    d = d || new Date();
    var p = function (n) { return ('0' + n).slice(-2); };
    return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
      p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  },

  /** 'yyyymmdd HHmmss' (EasyPaisa tokenExpiry) */
  epStamp: function (d) {
    d = d || new Date();
    var p = function (n) { return ('0' + n).slice(-2); };
    return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + ' ' +
      p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  },

  /** secrets hata kar log ke liye safe object */
  mask: function (obj, secretKeys) {
    var out = {};
    Object.keys(obj || {}).forEach(function (k) {
      out[k] = (secretKeys || []).indexOf(k) > -1 ? '***' : obj[k];
    });
    return out;
  },

  /** HTTP POST — JSON ya form. Kabhi throw nahi karta: {ok, status, body} */
  post: function (url, body, headers, asJson) {
    try {
      var opts = { method: 'post', muteHttpExceptions: true, headers: headers || {} };
      if (asJson === false) {
        opts.payload = Object.keys(body || {}).map(function (k) {
          return encodeURIComponent(k) + '=' + encodeURIComponent(body[k] === undefined ? '' : body[k]);
        }).join('&');
        if (!opts.headers['Content-Type']) opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      } else {
        opts.contentType = 'application/json';
        opts.payload = JSON.stringify(body || {});
      }
      var r = UrlFetchApp.fetch(url, opts);
      var txt = '';
      try { txt = r.getContentText(); } catch (e) { txt = ''; }
      return { ok: r.getResponseCode() < 400, status: r.getResponseCode(), body: txt, json: Wallet._json(txt) };
    } catch (e) {
      return { ok: false, status: 0, body: '', error: U.str(e && e.message), json: null };
    }
  },

  _json: function (txt) {
    try { return JSON.parse(txt); } catch (e) { return null; }
  },

  /** provider ke response ko normal status mein badlo */
  epStatus: function (j) {
    j = j || {};
    var code = U.str(j.responseCode), desc = U.str(j.responseDesc);
    var ts = U.upper(j.transactionStatus);
    var status = 'PENDING';
    if (ts) {
      if (ts === 'PAID') status = 'PAID';
      else if (ts === 'FAILED' || ts === 'BLOCKED') status = 'FAILED';
      else if (ts === 'EXPIRED') status = 'EXPIRED';
      else if (ts === 'REVERSED') status = 'REVERSED';
      else status = 'PENDING';
    } else if (code) {
      status = (code === '0000') ? 'PENDING' : 'FAILED';   /* initiate par 0000 = request accept */
    }
    return { status: status, responseCode: code, responseDesc: desc, transactionStatus: ts };
  },

  jcStatus: function (j) {
    j = j || {};
    var code = U.str(j.pp_ResponseCode || j.responseCode);
    var msg = U.str(j.pp_ResponseMessage || j.responseMessage);
    var status;
    if (code === '000' || code === '121') status = 'PAID';
    else if (code === '') status = 'PENDING';
    else if (/^(0[0-9]{2}|1[0-9]{2})$/.test(code)) status = 'PENDING';
    else status = 'FAILED';
    return { status: status, responseCode: code, responseDesc: msg, transactionStatus: status };
  },

  /* =============================== LOG ===================================== */

  _save: function (row, s) {
    if (!row.id || !DB.byId('WalletTxns', row.id)) {
      row.id = U.uid('WTX');
      row.createdAt = U.iso();
      row.createdBy = (s && s.userId) || '';
      return DB.insert('WalletTxns', row, s);
    }
    row.updatedAt = U.iso();
    return DB.update('WalletTxns', row.id, row, s);
  },

  _row: function (base, extra) { return Object.assign(base || {}, extra || {}); },

  /* ============================== INITIATE ================================= */

  /**
   * Wallet par payment request bhejein.
   * p: { provider|methodId, amount, payerMobile, receiverMobile, email,
   *      flow ('MA'|'OTC'|'MWALLET'), orderId, refType, refId, note }
   * mode OFF ho to MANUAL record banata hai (sirf log + txn id baad mein).
   */
  initiate: function (p, s) {
    Auth.require(s, 'payments.create');
    p = p || {};
    var pid = U.upper(p.provider || p.methodId || '');
    var cfg = Wallet.cfg(pid);
    if (!cfg) throw new Error('Unknown wallet provider');
    var amount = U.round(U.num(p.amount), 2);
    if (amount <= 0) throw new Error('Amount zaroori hai');
    var maxAmt = U.num(cfg.maxAmount);
    if (maxAmt > 0 && amount > maxAmt) throw new Error('Max limit ' + fmtAmt(maxAmt) + ' hai');

    var payer = Wallet.msisdn(p.payerMobile);
    if (!payer) throw new Error('Bhejne wale ka mobile sahi nahi (03xxxxxxxxx)');
    var receiver = Wallet.msisdn(p.receiverMobile || cfg.receiverMobile);
    var orderId = Wallet.orderId(p.orderId);
    var flow = U.upper(p.flow || (pid === 'EASYPAISA' ? 'MA' : 'MWALLET'));

    var row = {
      id: U.uid('WTX'), date: U.dateOnly(), provider: cfg.id, flow: flow,
      orderId: orderId, amount: amount, payerMobile: payer, receiverMobile: receiver,
      email: U.str(p.email), status: 'INITIATED', providerRef: '', token: '', tokenExpiry: '',
      responseCode: '', responseDesc: '', saleId: U.str(p.saleId), paymentId: U.str(p.paymentId),
      refType: U.str(p.refType), refId: U.str(p.refId), note: U.str(p.note),
      mode: cfg.mode, rawRequest: '', rawResponse: '', createdAt: U.iso(),
      createdBy: (s && s.userId) || ''
    };

    /* ---- OFF mode: manual entry (API credentials nahi hain) ---- */
    if (!cfg.enabled || !cfg.hasCredentials) {
      row.status = 'MANUAL';
      row.responseDesc = cfg.enabled
        ? 'Credentials adhoore hain (Settings ▸ Trade ▸ Wallets)'
        : 'Wallet API off hai — manual txn ID entry';
      Wallet._save(row, s);
      return {
        walletId: row.id, orderId: orderId, status: 'MANUAL', manual: true,
        message: row.responseDesc, provider: cfg.id, mode: cfg.mode
      };
    }

    var req, url, headers, res, mapped;
    if (cfg.id === 'EASYPAISA') {
      url = cfg.base + (flow === 'OTC' ? cfg.otcPath : cfg.maPath);
      headers = { Credentials: Wallet.b64(cfg.username + ':' + cfg.password), 'Content-Type': 'application/json' };
      req = {
        orderId: orderId, storeId: U.num(cfg.storeId), transactionAmount: amount,
        transactionType: flow === 'OTC' ? 'OTC' : 'MA',
        emailAddress: U.str(p.email) || 'pos@haseebautos.pk',
        tokenExpiry: Wallet.epStamp(new Date(Date.now() + U.num(cfg.tokenMinutes, 30) * 60000))
      };
      if (flow === 'OTC') req.msisdn = payer; else req.mobileAccountNo = payer;
      row.rawRequest = JSON.stringify(Wallet.mask(req, Wallet.PROVIDERS.EASYPAISA.secretKeys));
      res = Wallet.post(url, req, headers, true);
      mapped = Wallet.epStatus(res.json);
      row.providerRef = U.str((res.json || {}).transactionId);
      row.token = U.str((res.json || {}).paymentToken);
      row.tokenExpiry = U.str((res.json || {}).paymentTokenExpiryDateTime);
    } else {
      /* ---- JAZZCASH MWALLET / OTC ---- */
      url = cfg.base + cfg.doPath;
      var now = new Date();
      var exp = new Date(now.getTime() + U.num(cfg.tokenMinutes, 30) * 60000);
      req = {
        pp_Version: '1.1',
        pp_TxnType: flow === 'OTC' ? 'OTC' : 'MWALLET',
        pp_Language: 'EN',
        pp_MerchantID: cfg.merchantId,
        pp_SubMerchantID: cfg.subMerchantId,
        pp_Password: cfg.password,
        pp_BankID: '',
        pp_ProductID: cfg.productId,
        pp_TxnRefNo: orderId,
        pp_Amount: String(Math.round(amount * 100)),      /* paisa — decimals nahi */
        pp_TxnCurrency: 'PKR',
        pp_TxnDateTime: Wallet.stamp(now),
        pp_TxnExpiryDateTime: Wallet.stamp(exp),
        pp_BillReference: orderId,
        pp_Description: U.str(p.note) || ('Haseeb Autos ' + orderId),
        pp_ReturnURL: U.str(p.returnUrl) || '',
        ppmpf_1: payer,
        ppmpf_2: receiver,
        ppmpf_3: '', ppmpf_4: '', ppmpf_5: ''
      };
      req.pp_SecureHash = Wallet.jcHash(req, cfg.integritySalt);
      row.rawRequest = JSON.stringify(Wallet.mask(req, Wallet.PROVIDERS.JAZZCASH.secretKeys));
      res = Wallet.post(url, req, {}, false);
      mapped = Wallet.jcStatus(res.json || {});
      row.providerRef = U.str((res.json || {}).pp_RetreivalReferenceNo || (res.json || {}).pp_AuthCode);
      row.token = U.str((res.json || {}).pp_AuthCode);
      row.tokenExpiry = Wallet.stamp(exp);
    }

    row.rawResponse = U.str(res.body).slice(0, 2000);
    row.responseCode = mapped.responseCode;
    row.responseDesc = mapped.responseDesc || (res.ok ? '' : ('HTTP ' + res.status + ' ' + U.str(res.error)));
    row.status = res.ok ? (mapped.status === 'FAILED' ? 'FAILED' : 'PENDING') : 'FAILED';
    if (!res.ok && !row.responseDesc) row.responseDesc = 'Gateway se rabt nahi ho saka';
    Wallet._save(row, s);

    return {
      walletId: row.id, orderId: orderId, status: row.status,
      provider: cfg.id, mode: cfg.mode, flow: row.flow,
      providerRef: row.providerRef, token: row.token, tokenExpiry: row.tokenExpiry,
      amount: amount, payerMobile: payer, receiverMobile: receiver,
      message: row.responseDesc, manual: false, raw: res.json
    };
  },

  /** JazzCash secure hash: salt + '&' + sorted pp_* values */
  jcHash: function (fields, salt) {
    var keys = Object.keys(fields).filter(function (k) { return /^pp/i.test(k) && k !== 'pp_SecureHash'; });
    keys.sort();
    var str = keys.map(function (k) { return U.str(fields[k]); }).join('&');
    return Wallet.hmacHex(U.str(salt) + '&' + str, U.str(salt));
  },

  /** EasyPaisa hosted-checkout hash */
  epHash: function (d, hashKey) {
    var str = 'amount=' + d.transactionAmount +
      '&postBackURL=' + d.postBackURL +
      '&orderRefNum=' + d.orderRefNum +
      '&storeId=' + d.storeId +
      '&transactionType=' + (d.transactionType || 'MA');
    return Wallet.hmacB64(str, hashKey);
  },

  /* =============================== INQUIRE ================================= */

  /** Status check: { id } ya { orderId, provider } */
  inquire: function (p, s) {
    Auth.require(s, 'payments.view');
    p = p || {};
    var row = p.id ? DB.byId('WalletTxns', p.id)
      : DB.all('WalletTxns').filter(function (r) {
        return r.orderId === U.str(p.orderId) && (!p.provider || r.provider === U.upper(p.provider));
      }).pop();
    if (!row) throw new Error('Wallet request nahi mili');
    if (!Wallet.STATUS_OPEN(row.status)) {
      return { walletId: row.id, orderId: row.orderId, status: row.status,
        provider: row.provider, amount: row.amount, providerRef: row.providerRef,
        message: row.responseDesc, final: true };
    }

    var cfg = Wallet.cfg(row.provider);
    if (!cfg || !cfg.enabled || !cfg.hasCredentials) {
      return { walletId: row.id, orderId: row.orderId, status: row.status,
        provider: row.provider, amount: row.amount, providerRef: row.providerRef,
        message: row.responseDesc, final: Wallet.STATUS_OPEN(row.status) ? false : true, manual: true };
    }

    var res, mapped;
    if (cfg.id === 'EASYPAISA') {
      var req = { orderId: row.orderId, storeId: U.num(cfg.storeId), accountNum: U.str(cfg.accountNum) };
      res = Wallet.post(cfg.base + cfg.inquirePath, req,
        { Credentials: Wallet.b64(cfg.username + ':' + cfg.password), 'Content-Type': 'application/json' }, true);
      mapped = Wallet.epStatus(res.json);
      if (mapped.transactionStatus) mapped.status = mapped.transactionStatus === 'PAID' ? 'PAID'
        : mapped.transactionStatus === 'FAILED' ? 'FAILED'
          : mapped.transactionStatus === 'EXPIRED' ? 'EXPIRED'
            : mapped.transactionStatus === 'REVERSED' ? 'REVERSED'
              : mapped.transactionStatus === 'BLOCKED' ? 'BLOCKED' : 'PENDING';
    } else {
      var req2 = {
        pp_Version: '1.1', pp_TxnType: row.flow === 'OTC' ? 'OTC' : 'MWALLET',
        pp_Language: 'EN', pp_MerchantID: cfg.merchantId,
        pp_SubMerchantID: cfg.subMerchantId, pp_Password: cfg.password,
        pp_TxnRefNo: row.orderId, pp_Amount: String(Math.round(U.num(row.amount) * 100)),
        pp_TxnCurrency: 'PKR', pp_TxnDateTime: Wallet.stamp(new Date()),
        pp_BillReference: row.orderId
      };
      req2.pp_SecureHash = Wallet.jcHash(req2, cfg.integritySalt);
      res = Wallet.post(cfg.base + cfg.inquirePath, req2, {}, false);
      mapped = Wallet.jcStatus(res.json || {});
    }

    var upd = {
      id: row.id, status: mapped.status,
      responseCode: mapped.responseCode, responseDesc: mapped.responseDesc,
      transactionStatus: mapped.transactionStatus || '',
      rawResponse: U.str(res.body).slice(0, 2000), checkedAt: U.iso(), updatedAt: U.iso()
    };
    if (mapped.status === 'PAID' && !row.providerRef) {
      upd.providerRef = U.str((res.json || {}).transactionId ||
        (res.json || {}).pp_RetreivalReferenceNo || row.providerRef);
    }
    Wallet._save(upd, s);
    return {
      walletId: row.id, orderId: row.orderId, status: upd.status,
      provider: row.provider, amount: row.amount, providerRef: upd.providerRef || row.providerRef,
      message: upd.responseDesc, raw: res.json,
      final: !Wallet.STATUS_OPEN(upd.status)
    };
  },

  /** kya status abhi bhi pending hai (poll karna chahiye) */
  STATUS_OPEN: function (st) {
    return ['INITIATED', 'PENDING', 'MANUAL'].indexOf(U.upper(st)) > -1;
  },

  /* ================================ LIST =================================== */

  list: function (p, s) {
    Auth.require(s, 'payments.view');
    p = p || {};
    var rows = DB.all('WalletTxns').filter(function (r) {
      if (p.provider && r.provider !== U.upper(p.provider)) return false;
      if (p.status && r.status !== U.upper(p.status)) return false;
      if (p.openOnly && !Wallet.STATUS_OPEN(r.status)) return false;
      if (p.from && U.str(r.date) < U.str(p.from)) return false;
      if (p.to && U.str(r.date) > U.str(p.to)) return false;
      if (p.q) {
        var q = U.norm(p.q);
        if (U.norm(r.orderId + ' ' + r.payerMobile + ' ' + r.providerRef).indexOf(q) < 0) return false;
      }
      return true;
    });
    rows.sort(function (a, b) { return U.str(b.createdAt).localeCompare(U.str(a.createdAt)); });
    return {
      rows: rows.slice(0, U.num(p.limit, 200)),
      total: rows.length,
      pending: rows.filter(function (r) { return Wallet.STATUS_OPEN(r.status); }).length,
      providers: Wallet.providers({}, s)
    };
  },

  /** Pending requests ko batch mein check karein (UI poll / trigger) */
  poll: function (p, s) {
    Auth.require(s, 'payments.view');
    p = p || {};
    var rows = DB.all('WalletTxns').filter(function (r) {
      if (!Wallet.STATUS_OPEN(r.status)) return false;
      if (U.str(r.status) === 'MANUAL') return false;
      if (p.provider && r.provider !== U.upper(p.provider)) return false;
      return true;
    }).slice(0, U.num(p.limit, 10));
    var paid = 0, failed = 0, pending = 0;
    rows.forEach(function (r) {
      try {
        var out = Wallet.inquire({ id: r.id }, s);
        if (out.status === 'PAID') paid++;
        else if (Wallet.STATUS_OPEN(out.status)) pending++;
        else failed++;
      } catch (e) { pending++; }
    });
    return { checked: rows.length, paid: paid, failed: failed, pending: pending };
  },

  /* =============================== LINKING ================================= */

  /** Sale / payment banne ke baad wallet record se jor dein */
  link: function (p, s) {
    Auth.require(s, 'payments.create');
    p = p || {};
    var row = DB.byId('WalletTxns', p.id);
    if (!row) throw new Error('Wallet request nahi mili');
    var upd = { id: row.id, updatedAt: U.iso() };
    if (p.saleId) upd.saleId = U.str(p.saleId);
    if (p.paymentId) upd.paymentId = U.str(p.paymentId);
    if (p.txnId) upd.providerRef = U.str(p.txnId);
    if (p.status && Wallet.STATUS.indexOf(U.upper(p.status)) > -1) upd.status = U.upper(p.status);
    Wallet._save(upd, s);
    return DB.byId('WalletTxns', row.id);
  },

  /** Manual entry — gateway off hone par txn ID record karne ke liye */
  manual: function (p, s) {
    Auth.require(s, 'payments.create');
    p = p || {};
    var pid = U.upper(p.provider || p.methodId || '');
    var cfg = Wallet.cfg(pid);
    if (!cfg) throw new Error('Unknown wallet provider');
    var row = {
      id: U.uid('WTX'), date: U.dateOnly(), provider: cfg.id, flow: U.upper(p.flow || 'MA'),
      orderId: Wallet.orderId(p.orderId), amount: U.round(U.num(p.amount), 2),
      payerMobile: Wallet.msisdn(p.payerMobile), receiverMobile: Wallet.msisdn(p.receiverMobile || cfg.receiverMobile),
      email: U.str(p.email), status: 'MANUAL', providerRef: U.str(p.txnId), token: '',
      tokenExpiry: '', responseCode: '', responseDesc: U.str(p.note) || 'Manual entry',
      saleId: U.str(p.saleId), paymentId: U.str(p.paymentId),
      refType: U.str(p.refType), refId: U.str(p.refId), note: U.str(p.note),
      mode: cfg.mode, rawRequest: '', rawResponse: '',
      createdAt: U.iso(), createdBy: (s && s.userId) || ''
    };
    if (!row.payerMobile) throw new Error('Bhejne wale ka mobile sahi nahi (03xxxxxxxxx)');
    Wallet._save(row, s);
    return row;
  },

  /* =============================== CHECKOUT ================================ */

  /**
   * Hosted checkout / payment link (online invoice ke liye).
   * EasyPaisa : signed POST form (Index.jsf)
   * JazzCash  : signed pp_* form (hosted payment link)
   */
  checkout: function (p, s) {
    Auth.require(s, 'payments.create');
    p = p || {};
    var cfg = Wallet.cfg(p.provider || p.methodId);
    if (!cfg) throw new Error('Unknown wallet provider');
    var amount = U.round(U.num(p.amount), 2);
    if (amount <= 0) throw new Error('Amount zaroori hai');
    var ref = Wallet.orderId(p.orderId || p.invoiceNo);
    var postBack = U.str(p.postBackUrl);

    if (cfg.id === 'EASYPAISA') {
      var d = {
        storeId: U.str(cfg.storeId), orderRefNum: ref, transactionAmount: U.round(amount, 2),
        postBackURL: postBack, transactionType: 'MA', paymentMethod: 'InitialRequest',
        merchantPaymentMethod: '', merchantHashedReq: '', encryptedHashRequest: '',
        tokenExpiry: Wallet.epStamp(new Date(Date.now() + U.num(cfg.tokenMinutes, 30) * 60000)),
        bankIdentificationNumber: '', mobileAccountNo: Wallet.msisdn(p.payerMobile),
        emailAddr: U.str(p.email)
      };
      d.encryptedHashRequest = cfg.hashKey ? Wallet.epHash(d, cfg.hashKey) : '';
      return { provider: cfg.id, url: cfg.checkoutUrl, method: 'POST', fields: d, orderId: ref, amount: amount };
    }
    var now = new Date();
    var f = {
      pp_Version: '1.1', pp_TxnType: U.upper(p.flow || 'MWALLET') === 'OTC' ? 'OTC' : 'MWALLET',
      pp_Language: 'EN', pp_MerchantID: cfg.merchantId, pp_SubMerchantID: cfg.subMerchantId,
      pp_Password: cfg.password, pp_BankID: '', pp_ProductID: cfg.productId,
      pp_TxnRefNo: ref, pp_Amount: String(Math.round(amount * 100)), pp_TxnCurrency: 'PKR',
      pp_TxnDateTime: Wallet.stamp(now), pp_TxnExpiryDateTime: Wallet.stamp(new Date(now.getTime() + 30 * 60000)),
      pp_BillReference: ref, pp_Description: U.str(p.note) || ('Invoice ' + ref),
      pp_ReturnURL: postBack, ppmpf_1: Wallet.msisdn(p.payerMobile)
    };
    f.pp_SecureHash = Wallet.jcHash(f, cfg.integritySalt);
    return { provider: cfg.id, url: cfg.checkoutUrl, method: 'POST', fields: f, orderId: ref, amount: amount };
  },

  /* ============================== WEBHOOK / IPN ============================ */

  /**
   * Gateway callback (doPost se aata hai).
   * JazzCash  : pp_* fields + pp_SecureHash (salt se verify)
   * EasyPaisa : { orderId, transactionStatus, transactionAmount, … }
   */
  ipn: function (payload, s) {
    var p = payload || {};
    var ref = U.str(p.orderId || p.pp_TxnRefNo || p.pp_BillReference);
    if (!ref) return { ok: false, message: 'order reference missing' };
    var row = DB.all('WalletTxns').filter(function (r) { return r.orderId === ref; }).pop();
    if (!row) return { ok: false, message: 'unknown order ' + ref };

    var cfg = Wallet.cfg(row.provider);
    /* JazzCash hash verification (salt configured ho to) */
    if (cfg && cfg.id === 'JAZZCASH' && cfg.integritySalt && p.pp_SecureHash) {
      var mine = Wallet.jcHash(p, cfg.integritySalt);
      if (U.upper(mine) !== U.upper(U.str(p.pp_SecureHash))) {
        return { ok: false, message: 'hash mismatch' };
      }
    }
    var status;
    if (p.transactionStatus) {
      status = U.upper(p.transactionStatus);
      if (['PAID', 'FAILED', 'PENDING', 'EXPIRED', 'REVERSED', 'BLOCKED'].indexOf(status) < 0) status = 'PENDING';
    } else if (p.pp_ResponseCode !== undefined) {
      status = Wallet.jcStatus(p).status;
    } else {
      status = 'PENDING';
    }
    var upd = {
      id: row.id, status: status, updatedAt: U.iso(), checkedAt: U.iso(),
      responseDesc: U.str(p.responseDesc || p.pp_ResponseMessage || 'IPN update'),
      responseCode: U.str(p.responseCode || p.pp_ResponseCode || ''),
      rawResponse: JSON.stringify(p).slice(0, 2000)
    };
    if (p.transactionId || p.pp_RetreivalReferenceNo) {
      upd.providerRef = U.str(p.transactionId || p.pp_RetreivalReferenceNo);
    }
    Wallet._save(upd, s || null);
    return { ok: true, orderId: ref, status: status };
  },

  /* ============================ FEES / SUMMARY ============================= */

  /** PayMethods engine se fee / FED / net / settlement (duplicate formula nahi) */
  fees: function (p, s) {
    var cfg = Wallet.cfg(p.provider || p.methodId);
    if (!cfg) throw new Error('Unknown wallet provider');
    return PayMethods.compute(U.num(p.amount), cfg.methodId, s, U.str(p.date) || U.dateOnly());
  },

  summary: function (p, s) {
    Auth.require(s, 'payments.view');
    var rows = DB.all('WalletTxns');
    var byStatus = {}, byProvider = {};
    rows.forEach(function (r) {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
      byProvider[r.provider] = (byProvider[r.provider] || 0) + 1;
    });
    return {
      total: rows.length,
      pending: rows.filter(function (r) { return Wallet.STATUS_OPEN(r.status); }).length,
      paid: rows.filter(function (r) { return r.status === 'PAID'; }).length,
      paidAmount: U.round(U.sum(rows.filter(function (r) { return r.status === 'PAID'; }), 'amount'), 2),
      failed: rows.filter(function (r) { return r.status === 'FAILED'; }).length,
      byStatus: byStatus, byProvider: byProvider
    };
  }
};

/** chhota local formatter (Wallet.gs backend hai — UI fmt yahan nahi chalta) */
function fmtAmt(v) {
  try { return 'Rs ' + U.round(U.num(v), 2).toLocaleString('en-PK'); }
  catch (e) { return 'Rs ' + U.round(U.num(v), 2); }
}
