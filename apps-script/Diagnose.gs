/* ============================================================================
   Diagnose.gs — v2.8.2
   ----------------------------------------------------------------------------
   MASLA: deploy ke baad mobile par "Sorry, unable to open the file at present"
   ya khaali safaid page — aur Apps Script editor mein kuch nazar nahi aata ke
   asal wajah kya hai.

   HAL: ye file aap ko DROPDOWN se chalne wale 3 function deti hai jo aap ke
   APNE account ki haqeeqat batate hain — bina kisi tool ke:

     ▸ diagnoseWebApp()   — page server par render hota hai ya nahi, size,
                            meta tags, missing HTML files, aur woh URLs jo
                            mobile par azmani hain
     ▸ deploymentUrls()   — kaunsa URL use karein (normal, /a/~/ , /a/<star>/)
     ▸ diagnoseAll()      — sab kuch ek saath (database + triggers + web app)

   ZAROORI: ye functions SIRF JAANCH karte hain — koi data change nahi karte.
   ========================================================================== */

/* Web app ke saare HTML partials — include() in par depend karta hai.
   Koi missing ho to page render hi nahi hota (aur error generic aata hai). */
var REQUIRED_HTML = ['Index', 'Styles', 'App_Core', 'Pwa_Shell',
  'Pwa_Warehouse', 'Pwa_Field', 'Pwa_Salesman'];


/** Har HTML file mojood hai? (missing file = page fail) */
function checkHtmlFiles() {
  var ok = [], missing = [];
  REQUIRED_HTML.forEach(function (name) {
    try {
      var o = HtmlService.createHtmlOutputFromFile(name);
      var len = (o.getContent() || '').length;
      if (len > 0) ok.push(name + ' (' + Math.round(len / 1024) + ' KB)');
      else missing.push(name + ' (khaali)');
    } catch (e) {
      missing.push(name + ' (' + e.message + ')');
    }
  });
  return { present: ok, missing: missing };
}

/** doGet() ko server par hi chala kar dekhein — wahi rasta jo browser leta hai */
function diagnoseWebApp() {
  var rep = {
    when: new Date().toISOString(),
    version: (typeof CONFIG !== 'undefined' && CONFIG.VERSION) ? CONFIG.VERSION : 'unknown',
    webApp: null,
    error: null,
    advice: []
  };

  /* 1. page render */
  try {
    var out = doGet({ parameter: {} });
    var html = out.getContent() || '';
    rep.webApp = {
      rendered: true,
      sizeKB: Math.round(html.length / 1024),
      title: out.getTitle ? out.getTitle() : '',
      metaTags: (out.getMetaTags ? out.getMetaTags() : []).map(function (m) { return m.name; })
    };
  } catch (e) {
    rep.webApp = { rendered: false };
    rep.error = e.message;
    rep.advice.push('doGet() FAIL hua: ' + e.message);
  }

  /* 2. HTML files */
  var files = checkHtmlFiles();
  rep.htmlFiles = files;
  if (files.missing.length) {
    rep.advice.push('MISSING HTML: ' + files.missing.join(', ') +
      ' — ye files Apps Script editor mein upload karein (apps-script/ se).');
  }

  /* 3. teenon PWA routes */
  rep.pwa = {};
  ['wh', 'fo', 'sm'].forEach(function (id) {
    try {
      doGet({ parameter: { app: id } });
      rep.pwa[id] = 'ok';
    } catch (e) {
      rep.pwa[id] = 'FAIL: ' + e.message;
      rep.advice.push('PWA ?app=' + id + ' fail: ' + e.message);
    }
  });

  /* 4. database */
  try {
    var info = (typeof spreadsheetInfo === 'function') ? spreadsheetInfo() : null;
    rep.spreadsheet = info;
    if (info && !info.spreadsheetId) {
      rep.advice.push('SPREADSHEET_ID set nahi — Setup.gs ▸ setupAll chalayein.');
    }
  } catch (e) {
    rep.spreadsheet = { error: e.message };
    rep.advice.push('Spreadsheet check fail: ' + e.message);
  }

  /* 5. URLs + mobile mashwara (ye error aksar Google ka multi-account bug hai) */
  rep.urls = buildUrlReport();

  if (!rep.advice.length) {
    rep.advice.push('Server side sab theek hai. Agar mobile par phir bhi error aaye to ' +
      'masla Google ke multi-account redirect ka hai — upar "mobileUrls" wale ' +
      'link azmaayein, ya "Anyone" access par deploy karein.');
  }

  Logger.log(JSON.stringify(rep, null, 2));
  return rep;
}

/** Kaunsa URL use karein — teen tarteeben, mobile ke liye */
function buildUrlReport() {
  var base = '';
  try {
    var svc = ScriptApp.getService();
    base = (svc && svc.getUrl) ? (svc.getUrl() || '') : '';
  } catch (e) { base = ''; }

  var rep = { detected: base || '(editor se nahi mila — Deploy ▸ Manage deployments se copy karein)' };

  if (base && base.indexOf('/macros/s/') !== -1) {
    /* personal account: /a/~/  ·  Workspace: /a/<star>/  — dono Google ka
       multi-account redirect bypass karte hain */
    rep.mobileUrls = [
      base.replace('script.google.com/macros/', 'script.google.com/a/~/macros/'),
      base.replace('script.google.com/macros/', 'script.google.com/a/*/macros/')
    ];
    rep.pwaUrls = {
      warehouse: base + '?app=wh',
      field: base + '?app=fo',
      salesman: base + '?app=sm'
    };
  }
  rep.note = 'Pehle normal URL, phir /a/~/ wala, phir incognito tab. ' +
    'Sab se pakka hal: deploy mein "Who has access: Anyone" — us se ' +
    'sign-in redirect hi nahi hota aur ye bug paida hi nahi hota.';
  return rep;
}

/** Sirf URLs chahiye to ye chalayein */
function deploymentUrls() {
  var rep = buildUrlReport();
  Logger.log(JSON.stringify(rep, null, 2));
  return rep;
}

/** Ek saath sab kuch */
function diagnoseAll() {
  var rep = { web: diagnoseWebApp() };
  try {
    rep.triggers = ScriptApp.getProjectTriggers().map(function (t) {
      return { handler: t.getHandlerFunction(), source: String(t.getTriggerSource()) };
    });
    if (!rep.triggers.length) {
      rep.advice = 'Koi trigger install nahi — Setup.gs ▸ reinstallTriggers chalayein.';
    }
  } catch (e) {
    rep.triggers = { error: e.message };
  }
  Logger.log(JSON.stringify(rep, null, 2));
  return rep;
}


/** v2.12.1 — bounded-scope, read-only performance diagnosis.
 * Editor: Diagnose.gs > diagnosePerformance > Run. RETURNS and logs timings.
 * No seed/setup, no full-table reads, no provider requests, no key access.
 */
function diagnosePerformance() {
  var started = Date.now();
  var report = { version: CONFIG.VERSION, checks: [], readOnly: true };
  function measure(name, fn) {
    var t = Date.now();
    try { var result = fn();
      report.checks.push({ name: name, ms: Date.now() - t, result: result });
    } catch (e) { report.checks.push({ name: name, ms: Date.now() - t, error: e.message }); }
  }
  var id = '';
  measure('Database link and setup progress', function () {
    var props = PropertiesService.getScriptProperties();
    id = props.getProperty('SPREADSHEET_ID') || '';
    var state = JSON.parse(props.getProperty('SETUP_PROGRESS_V212') || '{}');
    return { linked: !!id, completedSetupSteps: state.next || 0, setupVersion: state.version || '' };
  });
  var ss;
  if (id) measure('Open spreadsheet', function () { ss = SpreadsheetApp.openById(id); return { opened: true }; });
  if (ss) ['Settings', 'Items', 'Sales'].forEach(function (name) {
    measure(name + ' size only', function () {
      var sh = ss.getSheetByName(name);
      return sh ? { rows: Math.max(0, sh.getLastRow() - 1), columns: sh.getLastColumn() } : { missing: true };
    });
  });
  report.totalMs = Date.now() - started;
  report.message = 'These are metadata timings, not a full request benchmark. For the actual failed action, inspect Apps Script > Executions (function, duration, error). No data was changed.';
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}
