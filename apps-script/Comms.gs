/**
 * HASEEB AUTOS - ERP / POS  ::  COMMS ENGINE (WhatsApp · SMS · Email)
 * ---------------------------------------------------------------------------
 * Providers (sab Settings ▸ Automation ▸ WhatsApp & SMS se configurable):
 *
 *  1. META CLOUD API  — Graph API
 *     POST https://graph.facebook.com/v{version}/{PHONE_NUMBER_ID}/messages
 *     Headers: Authorization: Bearer <token>
 *     Body: { messaging_product:'whatsapp', to, type:'text', text:{preview_url, body} }
 *     Document: { type:'document', document:{ link, filename, caption } }
 *
 *  2. TWILIO (WhatsApp + SMS)
 *     POST https://api.twilio.com/2010-04-01/Accounts/{ACCOUNT_SID}/Messages.json
 *     Auth: Basic(SID:TOKEN) · Body: To=whatsapp:+92… / From=whatsapp:+1… / Body=
 *
 *  3. LINK (free, personal WhatsApp) — koi API key nahi:
 *     https://wa.me/<number>?text=<urlencoded>  → app/web khul jata hai
 *
 *  4. WEBHOOK — apna gateway ({{to}} {{message}} placeholders ke sath)
 *
 *  5. EMAIL — MailApp (Apps Script) ya GmailApp; PDF attachment Drive se
 *
 * Har bheja gaya message `Messages` sheet (outbox) me log hota hai.
 * ---------------------------------------------------------------------------
 */

var Comms = {

  DEFAULTS: {
    'comms.whatsapp.provider': 'LINK',        // META | TWILIO | LINK | WEBHOOK
    'comms.whatsapp.apiVersion': 'v20.0',
    'comms.whatsapp.phoneNumberId': '',
    'comms.whatsapp.token': '',
    'comms.twilio.sid': '',
    'comms.twilio.token': '',
    'comms.twilio.whatsappFrom': '',
    'comms.twilio.smsFrom': '',
    'comms.sms.provider': 'NONE',             // TWILIO | WEBHOOK | NONE
    'comms.email.provider': 'APPS_SCRIPT',    // APPS_SCRIPT | GMAIL | WEBHOOK | MAILTO
    'comms.email.fromName': 'Haseeb Autos',
    'comms.email.subject': 'Invoice {{invoiceNo}} from Haseeb Autos',
    'comms.webhook.url': '',
    'comms.webhook.json': '{"to":"{{to}}","message":"{{message}}"}',
    'comms.webhook.secret': '',
    'comms.countryCode': '92',
    'comms.attachPdf': 'true',
    'comms.autoSendInvoice': 'false',
    'comms.invoiceTemplate': 'Salam {{customer}}!\nInvoice {{invoiceNo}} · {{date}}\nTotal: {{total}}\nPaid: {{paid}}\nDue: {{due}}\n{{link}}\nShukriya — {{business}}',
    'comms.reminderTemplate': 'Yaad-dahani: {{customer}}, invoice {{invoiceNo}} ki baqaya {{due}} reh gayi hai. {{link}}',
    'comms.thanksTemplate': 'Shukriya {{customer}}! Aaj ki purchase {{total}} · points balance {{points}}. — {{business}}'
  },

  /* ============================== SETTINGS ================================= */
  cfg: function (key) {
    var st = DB.settings();
    var v = st[key];
    if (v === undefined || v === null || v === '') return Comms.DEFAULTS[key] !== undefined ? Comms.DEFAULTS[key] : '';
    return v;
  },

  /** Provider status (secrets masked) */
  providers: function (s) {
    function mask(v) { v = U.str(v); return v ? v.slice(0, 4) + '••••' + v.slice(-3) : ''; }
    var wa = U.str(Comms.cfg('comms.whatsapp.provider')).toUpperCase();
    return {
      whatsapp: {
        provider: wa,
        ready: (wa === 'META' && Comms.cfg('comms.whatsapp.token') && Comms.cfg('comms.whatsapp.phoneNumberId')) ||
               (wa === 'TWILIO' && Comms.cfg('comms.twilio.sid') && Comms.cfg('comms.twilio.token')) ||
               (wa === 'WEBHOOK' && Comms.cfg('comms.webhook.url')) ||
               wa === 'LINK',
        masked: { token: mask(Comms.cfg('comms.whatsapp.token')),
          twilioSid: mask(Comms.cfg('comms.twilio.sid')),
          phoneNumberId: mask(Comms.cfg('comms.whatsapp.phoneNumberId')) }
      },
      sms: { provider: U.str(Comms.cfg('comms.sms.provider')).toUpperCase(),
        ready: (U.str(Comms.cfg('comms.sms.provider')).toUpperCase() === 'TWILIO' &&
                Comms.cfg('comms.twilio.sid') && Comms.cfg('comms.twilio.token')) ||
               (U.str(Comms.cfg('comms.sms.provider')).toUpperCase() === 'WEBHOOK' && Comms.cfg('comms.webhook.url')) },
      email: { provider: U.str(Comms.cfg('comms.email.provider')).toUpperCase(), ready: true },
      countryCode: Comms.cfg('comms.countryCode') || '92'
    };
  },

  templates: function () {
    return { invoice: Comms.cfg('comms.invoiceTemplate'),
      reminder: Comms.cfg('comms.reminderTemplate'),
      thanks: Comms.cfg('comms.thanksTemplate'),
      emailSubject: Comms.cfg('comms.email.subject') };
  },

  /* ============================== HELPERS ================================== */
  /** phone → E.164 (92 300 1234567) */
  phone: function (p) {
    var cc = U.str(Comms.cfg('comms.countryCode') || '92').replace(/\D/g, '');
    var d = U.str(p).replace(/[^\d+]/g, '');
    if (!d) return '';
    if (d.charAt(0) === '+') return d.replace(/^\+/, '');
    if (d.indexOf('00') === 0) return d.replace(/^00/, '');
    if (d.charAt(0) === '0') d = d.slice(1);
    if (d.indexOf(cc) === 0) return d;
    return cc + d;
  },

  render: function (tpl, ctx) {
    var out = U.str(tpl);
    Object.keys(ctx || {}).forEach(function (k) {
      out = out.split('{{' + k + '}}').join(ctx[k] === null || ctx[k] === undefined ? '' : String(ctx[k]));
    });
    out = out.replace(/\{\{[a-zA-Z0-9_]+\}\}/g, '');
    return out;
  },

  /* ============================ INVOICE CONTEXT ============================ */
  /** Sale se message context (PDF link bhi, agar attachPdf on ho) */
  invoiceCtx: function (saleId, s) {
    var sale = Sales.get(saleId, s);
    var st = DB.settings();
    var link = '';
    if (U.str(Comms.cfg('comms.attachPdf')) !== 'false') {
      try {
        var pdf = Exports.invoicePdf(saleId, s);
        link = pdf.url || '';
      } catch (e) { link = ''; }
    }
    return {
      ctx: {
        customer: sale.customerName || 'Customer',
        invoiceNo: sale.invoiceNo || '',
        date: U.str(sale.date).slice(0, 10),
        total: fmtMoney_(sale.total),
        paid: fmtMoney_(sale.paid),
        due: fmtMoney_(sale.due),
        prevBalance: fmtMoney_(sale.prevBalance || 0),
        closingBalance: fmtMoney_(sale.closingBalance || 0),
        link: link || (U.str(st.businessName || 'Haseeb Autos') + ' — invoice ' + sale.invoiceNo),
        business: st.businessName || 'Haseeb Autos',
        points: String(U.num((DB.byId('Customers', sale.customerId) || {}).points))
      },
      sale: sale, link: link
    };
  },

  /** Free wa.me share link (koi API key nahi chahiye) */
  waLink: function (phone, message) {
    var p = Comms.phone(phone);
    return 'https://wa.me/' + p + '?text=' + encodeURIComponent(message || '');
  },
  smsLink: function (phone, message) {
    return 'sms:' + Comms.phone(phone) + '?body=' + encodeURIComponent(message || '');
  },
  mailLink: function (to, subject, body) {
    return 'mailto:' + encodeURIComponent(to || '') + '?subject=' + encodeURIComponent(subject || '') +
      '&body=' + encodeURIComponent(body || '');
  },

  /* ================================ SEND =================================== */
  /**
   * p = { channel:'WHATSAPP'|'SMS'|'EMAIL', to, message, subject,
   *       template:'invoice'|'reminder'|'thanks'|'', refType, refId, attach }
   */
  send: function (p, s) {
    Auth.require(s, 'sales.view');
    var channel = U.str(p.channel || 'WHATSAPP').toUpperCase();
    var to = U.str(p.to);
    var message = U.str(p.message);
    if (!to) throw new Error('Recipient (phone/email) chahiye.');
    if (!message) throw new Error('Message khali hai.');

    var res = { ok: false, channel: channel, to: to, provider: '', detail: '' };
    try {
      if (channel === 'WHATSAPP') res = Comms._whatsapp(to, message, p, s);
      else if (channel === 'SMS') res = Comms._sms(to, message, p, s);
      else if (channel === 'EMAIL') res = Comms._email(to, message, p, s);
      else throw new Error('Unknown channel ' + channel);
    } catch (e) {
      res = { ok: false, channel: channel, to: to, provider: res.provider || '', detail: e.message };
    }

    Comms._log({ channel: channel, to: to, subject: p.subject || '', body: message,
      status: res.ok ? 'SENT' : 'FAILED', provider: res.provider, error: res.detail || '',
      refType: p.refType || '', refId: p.refId || '' }, s);
    res.logged = true;
    if (!res.ok) throw new Error(res.detail || 'Send failed');
    return res;
  },

  _whatsapp: function (to, message, p, s) {
    var prov = U.str(Comms.cfg('comms.whatsapp.provider')).toUpperCase();
    var num = Comms.phone(to);
    if (prov === 'META') {
      var token = Comms.cfg('comms.whatsapp.token'), pid = Comms.cfg('comms.whatsapp.phoneNumberId');
      if (!token || !pid) throw new Error('Meta Cloud API keys missing (Settings ▸ WhatsApp & SMS).');
      var v = Comms.cfg('comms.whatsapp.apiVersion') || 'v20.0';
      var payload = { messaging_product: 'whatsapp', to: num, type: 'text', text: { preview_url: true, body: message } };
      if (p.attach && p.attachUrl) {
        payload = { messaging_product: 'whatsapp', to: num, type: 'document',
          document: { link: p.attachUrl, filename: U.str(p.attachName) || 'invoice.pdf', caption: message.slice(0, 400) } };
      }
      var r = UrlFetchApp.fetch('https://graph.facebook.com/' + v + '/' + pid + '/messages', {
        method: 'post', contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + token },
        payload: JSON.stringify(payload), muteHttpExceptions: true
      });
      var code = r.getResponseCode();
      var body = r.getContentText();
      if (code >= 300) throw new Error('Meta API ' + code + ': ' + body.slice(0, 200));
      return { ok: true, provider: 'META', channel: 'WHATSAPP', to: num, detail: body.slice(0, 200) };
    }
    if (prov === 'TWILIO') {
      var sid = Comms.cfg('comms.twilio.sid'), tok = Comms.cfg('comms.twilio.token'),
        from = Comms.cfg('comms.twilio.whatsappFrom');
      if (!sid || !tok) throw new Error('Twilio keys missing.');
      var r2 = UrlFetchApp.fetch('https://api.twilio.com/2010-04-01/Accounts/' + sid + '/Messages.json', {
        method: 'post', muteHttpExceptions: true,
        headers: { Authorization: 'Basic ' + Utilities.base64Encode(sid + ':' + tok) },
        payload: { To: 'whatsapp:+' + num, From: U.str(from).replace(/^whatsapp:/, '') ? (from.indexOf('whatsapp:') === 0 ? from : 'whatsapp:' + from) : 'whatsapp:' + from, Body: message }
      });
      var c2 = r2.getResponseCode();
      if (c2 >= 300) throw new Error('Twilio ' + c2 + ': ' + r2.getContentText().slice(0, 200));
      return { ok: true, provider: 'TWILIO', channel: 'WHATSAPP', to: num, detail: 'queued' };
    }
    if (prov === 'WEBHOOK') return Comms._webhook({ to: num, message: message, channel: 'WHATSAPP' }, s);

    // LINK — free personal WhatsApp: link ban kar deta hai (app/web khul jata hai)
    return { ok: true, provider: 'LINK', channel: 'WHATSAPP', to: num,
      link: Comms.waLink(num, message), detail: 'wa.me link (free, no API key)' };
  },

  _sms: function (to, message, p, s) {
    var prov = U.str(Comms.cfg('comms.sms.provider')).toUpperCase();
    var num = Comms.phone(to);
    if (prov === 'TWILIO') {
      var sid = Comms.cfg('comms.twilio.sid'), tok = Comms.cfg('comms.twilio.token');
      if (!sid || !tok) throw new Error('Twilio keys missing.');
      var r = UrlFetchApp.fetch('https://api.twilio.com/2010-04-01/Accounts/' + sid + '/Messages.json', {
        method: 'post', muteHttpExceptions: true,
        headers: { Authorization: 'Basic ' + Utilities.base64Encode(sid + ':' + tok) },
        payload: { To: '+' + num, From: Comms.cfg('comms.twilio.smsFrom'), Body: message }
      });
      if (r.getResponseCode() >= 300) throw new Error('Twilio ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 200));
      return { ok: true, provider: 'TWILIO', channel: 'SMS', to: num, detail: 'queued' };
    }
    if (prov === 'WEBHOOK') return Comms._webhook({ to: num, message: message, channel: 'SMS' }, s);
    return { ok: true, provider: 'LINK', channel: 'SMS', to: num,
      link: Comms.smsLink(num, message), detail: 'sms: link (device se bheja jayega)' };
  },

  _email: function (to, message, p, s) {
    var prov = U.str(Comms.cfg('comms.email.provider')).toUpperCase();
    var subject = U.str(p.subject) || Comms.render(Comms.cfg('comms.email.subject'), p.ctx || {});
    if (prov === 'WEBHOOK') return Comms._webhook({ to: to, message: message, channel: 'EMAIL', subject: subject }, s);
    if (prov === 'MAILTO') {
      return { ok: true, provider: 'MAILTO', channel: 'EMAIL', to: to,
        link: Comms.mailLink(to, subject, message), detail: 'mailto link' };
    }
    // APPS_SCRIPT / GMAIL
    var files = [];
    if (p.attachUrl && p.attachId) {
      try { files.push(DriveApp.getFileById(p.attachId)); } catch (e) { }
    }
    var html = '<div style="font:14px Segoe UI,Arial">' + escHtml_(message).replace(/\n/g, '<br>') + '</div>';
    try {
      if (prov === 'GMAIL' && typeof GmailApp !== 'undefined') {
        GmailApp.sendEmail(to, subject, message, { htmlBody: html, attachments: files,
          name: Comms.cfg('comms.email.fromName') });
      } else {
        MailApp.sendEmail({ to: to, subject: subject, htmlBody: html, attachments: files,
          name: Comms.cfg('comms.email.fromName') });
      }
    } catch (e) { throw new Error('Email bhejne mein masla: ' + e.message); }
    return { ok: true, provider: prov === 'GMAIL' ? 'GMAIL' : 'APPS_SCRIPT', channel: 'EMAIL', to: to, detail: 'sent' };
  },

  _webhook: function (p, s) {
    var url = Comms.cfg('comms.webhook.url');
    if (!url) throw new Error('Webhook URL missing.');
    var body = Comms.render(Comms.cfg('comms.webhook.json'), p);
    var headers = { 'Content-Type': 'application/json' };
    if (Comms.cfg('comms.webhook.secret')) headers['X-Secret'] = Comms.cfg('comms.webhook.secret');
    var r = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json',
      payload: body, headers: headers, muteHttpExceptions: true });
    if (r.getResponseCode() >= 300) throw new Error('Webhook ' + r.getResponseCode());
    return { ok: true, provider: 'WEBHOOK', channel: p.channel, to: p.to, detail: 'delivered' };
  },

  /* =========================== SHARE INVOICE =============================== */
  /** Sale ki PDF banayein + message template render karein */
  prepare: function (p, s) {
    Auth.require(s, 'sales.view');
    var built = Comms.invoiceCtx(p.id, s);
    var tplKey = p.template || 'invoice';
    var tpl = Comms.templates()[tplKey] || Comms.templates().invoice;
    return { ctx: built.ctx, message: Comms.render(tpl, built.ctx),
      link: built.link, sale: built.sale,
      subject: Comms.render(Comms.cfg('comms.email.subject'), built.ctx),
      to: U.str(p.to || (DB.byId('Customers', built.sale.customerId) || {}).phone || '') };
  },

  /** Ek hi call me prepare + send (frontend isi ko use karta hai) */
  shareInvoice: function (p, s) {
    var prep = Comms.prepare(p, s);
    var to = U.str(p.to) || prep.to;
    if (!to) throw new Error('Customer ka phone/email nahi mila — manual enter karein.');
    return Comms.send({ channel: p.channel || 'WHATSAPP', to: to,
      message: U.str(p.message) || prep.message, subject: prep.subject,
      refType: 'SALE', refId: prep.sale.id, ctx: prep.ctx,
      attach: p.attach !== false, attachUrl: prep.link,
      attachId: p.attachId || '', attachName: (prep.sale.invoiceNo || 'invoice') + '.pdf' }, s);
  },

  /* ============================== OUTBOX =================================== */
  _log: function (p, s) {
    try {
      DB.insert('Messages', {
        id: U.uid('MSG'), date: U.iso(), channel: p.channel, provider: p.provider || '',
        to: p.to, subject: p.subject || '', body: U.str(p.body).slice(0, 2000),
        status: p.status || 'SENT', error: p.error || '', refType: p.refType || '', refId: p.refId || '',
        createdBy: s ? s.userId : '', createdAt: U.iso()
      }, s);
    } catch (e) { }
  },

  outbox: function (p, s) {
    Auth.require(s, 'sales.view');
    p = p || {};
    var rows = DB.all('Messages').filter(function (r) {
      if (p.channel && r.channel !== p.channel) return false;
      if (p.status && r.status !== p.status) return false;
      if (p.refId && r.refId !== p.refId) return false;
      return true;
    }).sort(function (a, b) { return U.str(b.date).localeCompare(U.str(a.date)); });
    var limit = U.num(p.limit, 100);
    return { rows: rows.slice(0, limit).map(function (r) {
      return { id: r.id, date: r.date, channel: r.channel, provider: r.provider, to: r.to,
        subject: r.subject, body: r.body, status: r.status, error: r.error, refType: r.refType, refId: r.refId };
    }), total: rows.length,
      counts: { sent: rows.filter(function (r) { return r.status === 'SENT'; }).length,
        failed: rows.filter(function (r) { return r.status === 'FAILED'; }).length } };
  },

  /** Failed messages dobara bhejein */
  retry: function (p, s) {
    var row = DB.byId('Messages', p.id);
    if (!row) throw new Error('Message not found');
    return Comms.send({ channel: row.channel, to: row.to, message: row.body, subject: row.subject,
      refType: row.refType, refId: row.refId }, s);
  }
};

function escHtml_(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
