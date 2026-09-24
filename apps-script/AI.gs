/**
 * HASEEB AUTOS - ERP / POS  ::  AI AGENT
 * ---------------------------------------------------------------------------
 * Pluggable provider: GEMINI (default) / OPENAI / OPENROUTER / MOCK
 * API key Script Properties mein: AI_API_KEY  (kabhi sheet mein nahi likhi jati)
 *
 * Agent sirf WHITELISTED tools chala sakta hai — har tool user ke RBAC session
 * ke sath chalta hai, is liye AI kabhi bhi wo data nahi dekh sakta jis ki
 * ijazat user ko nahi hai. Write tools sirf tab chalte hain jab
 * Settings.aiCanWrite = true ho, aur wo bhi DRAFT banate hain (post nahi).
 */

var AI = {

  /* ============================== CONFIG =================================== */
  /* Provider ko API key chahiye ya nahi (MOCK/OLLAMA keyless chal saktay hain) */
  requiresKey: function (provider) {
    provider = U.str(provider || 'GEMINI').toUpperCase();
    return provider === 'GEMINI' || provider === 'OPENAI' || provider === 'OPENROUTER';
  },

  getConfig: function (s) {
    var settings = DB.settings();
    var key = AI.getKey();
    var provider = (settings.aiProvider || 'GEMINI').toUpperCase();
    var mockFallback = U.str(settings.aiFallbackMock) === 'true';
    var needsKey = AI.requiresKey(provider) && !key;
    return {
      enabled: U.str(settings.aiEnabled) !== 'false',
      provider: provider,
      model: AI._model(settings),
      hasKey: !!key,
      needsKey: needsKey,
      mockFallback: mockFallback,
      usable: !needsKey || mockFallback || provider === 'MOCK',
      credentials: AI_PROVIDERS.reduce(function (out, id) { var k = AI.getKey(id); out[id] = { hasKey: !!k, keyHint: k ? k.slice(0, 4) + '…' + k.slice(-3) : '' }; return out; }, {}),
      canWrite: U.str(settings.aiCanWrite) === 'true',
      endpoint: U.str(settings.aiEndpoint || ''),
      keyHint: key ? key.substring(0, 4) + '…' + key.slice(-3) : ''
    };
  },

  /** Current model — setting ho to wahi, warna provider ka recommended default.
   *  Agar saved model deprecated/retired ho to warning ke sath recommended sugget karta hai. */
  _model: function (settings) {
    settings = settings || DB.settings();
    var m = U.str(settings.aiModel);
    var provider = U.str(settings.aiProvider || 'GEMINI').toUpperCase();
    if (!m) return AI.defaultModel(provider);
    return m;                                  // custom / discovered ids bhi allowed hain
  },

  getKey: function (provider) {
    provider = U.str(provider || DB.settings().aiProvider || 'GEMINI').toUpperCase();
    if (AI_PROVIDERS.indexOf(provider) < 0) throw new Error('Unknown AI provider');
    var props = PropertiesService.getScriptProperties();
    var legacy = props.getProperty('AI_API_KEY');
    if (legacy) {
      var owner = props.getProperty('AI_API_KEY_PROVIDER') || U.str(DB.settings().aiProvider || 'GEMINI').toUpperCase();
      if (!props.getProperty('AI_KEY_' + owner)) props.setProperty('AI_KEY_' + owner, legacy);
      props.deleteProperty('AI_API_KEY');
    }
    return props.getProperty('AI_KEY_' + provider) || '';
  },

  setKey: function (key, provider, model) {
    AI.getKey(); // migrate legacy key BEFORE switching provider
    provider = U.str(provider || DB.settings().aiProvider || 'GEMINI').toUpperCase();
    if (AI_PROVIDERS.indexOf(provider) < 0) throw new Error('Unknown AI provider');
    PropertiesService.getScriptProperties().setProperty('AI_KEY_' + provider, U.str(key).trim());
    DB.setSetting('aiProvider', provider);
    if (model) DB.setSetting('aiModel', model);
    return AI.getConfig();
  },

  /* ============================== TOOLS ==================================== */
  /** Saare tools (config panel ke liye — enabled flag ke sath) */
  allTools: function () {
    return [
      {
        name: 'search_items',
        description: 'Search products/parts by name, code, barcode, brand, category, or vehicle model. Use for "kia hai", "kitna hai", price questions.',
        parameters: { type: 'OBJECT', properties: {
          query: { type: 'STRING', description: 'search text e.g. "brake pad", "HLG-001"' },
          limit: { type: 'NUMBER' },
          locationId: { type: 'STRING' }
        }, required: ['query'] }
      },
      {
        name: 'get_item_stock',
        description: 'Get stock + price + cost of a specific item across or in one branch.',
        parameters: { type: 'OBJECT', properties: {
          code: { type: 'STRING', description: 'item code or barcode' },
          locationId: { type: 'STRING' }
        }, required: ['code'] }
      },
      {
        name: 'low_stock_list',
        description: 'Items at or below reorder level (needs purchasing).',
        parameters: { type: 'OBJECT', properties: { locationId: { type: 'STRING' }, limit: { type: 'NUMBER' } } }
      },
      {
        name: 'today_sales',
        description: 'Today\'s sales total, transaction count and cash position for a branch.',
        parameters: { type: 'OBJECT', properties: { locationId: { type: 'STRING' } } }
      },
      {
        name: 'sales_summary',
        description: 'Sales totals between two dates (YYYY-MM-DD). Default last 30 days.',
        parameters: { type: 'OBJECT', properties: {
          from: { type: 'STRING' }, to: { type: 'STRING' }, locationId: { type: 'STRING' }
        } }
      },
      {
        name: 'top_selling_items',
        description: 'Best selling items by revenue or quantity for a date range.',
        parameters: { type: 'OBJECT', properties: {
          from: { type: 'STRING' }, to: { type: 'STRING' }, limit: { type: 'NUMBER' }, locationId: { type: 'STRING' }
        } }
      },
      {
        name: 'profit_report',
        description: 'Gross profit, COGS, expenses and net profit for a date range.',
        parameters: { type: 'OBJECT', properties: { from: { type: 'STRING' }, to: { type: 'STRING' }, locationId: { type: 'STRING' } } }
      },
      {
        name: 'inventory_valuation',
        description: 'Total stock value at cost and at retail for a branch.',
        parameters: { type: 'OBJECT', properties: { locationId: { type: 'STRING' } } }
      },
      {
        name: 'customer_balance',
        description: 'Find a customer by name/phone and return their outstanding (udhaar) balance.',
        parameters: { type: 'OBJECT', properties: { query: { type: 'STRING' } } }
      },
      {
        name: 'receivables',
        description: 'All customers with outstanding balance, sorted biggest first.',
        parameters: { type: 'OBJECT', properties: { limit: { type: 'NUMBER' } } }
      },
      {
        name: 'supplier_payables',
        description: 'Suppliers we owe money to.',
        parameters: { type: 'OBJECT', properties: { limit: { type: 'NUMBER' } } }
      },
      {
        name: 'pending_purchase_orders',
        description: 'Purchase orders not fully received yet.',
        parameters: { type: 'OBJECT', properties: { limit: { type: 'NUMBER' } } }
      },
      {
        name: 'recent_sales',
        description: 'List recent invoices with totals and payment status.',
        parameters: { type: 'OBJECT', properties: { limit: { type: 'NUMBER' }, locationId: { type: 'STRING' } } }
      },
      {
        name: 'cash_position',
        description: 'Cash in/out, expenses and closing for a date range (cashbook).',
        parameters: { type: 'OBJECT', properties: { from: { type: 'STRING' }, to: { type: 'STRING' }, locationId: { type: 'STRING' } } }
      },
      {
        name: 'draft_sale',
        description: 'Prepare a SALE DRAFT (cart) from item codes. Does NOT save. Requires aiCanWrite.',
        parameters: { type: 'OBJECT', properties: {
          items: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
            code: { type: 'STRING' }, qty: { type: 'NUMBER' } }, required: ['code'] } },
          customerName: { type: 'STRING' }
        }, required: ['items'] }
      },
      {
        name: 'draft_purchase_order',
        description: 'Prepare a PURCHASE ORDER DRAFT for a supplier. Does NOT save. Requires aiCanWrite.',
        parameters: { type: 'OBJECT', properties: {
          supplierName: { type: 'STRING' },
          items: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
            code: { type: 'STRING' }, qty: { type: 'NUMBER' }, cost: { type: 'NUMBER' } }, required: ['code', 'qty'] } }
        }, required: ['items'] }
      },
      {
        name: 'reorder_suggestions',
        description: 'Suggest what to purchase: items below reorder level with suggested qty and estimated cost.',
        parameters: { type: 'OBJECT', properties: { locationId: { type: 'STRING' } } }
      },
      {
        name: 'demand_list',
        description: 'List customer demands (outstanding / fulfilled / by customer / priority). Use for \"kitni demands pending hain\", customer ke mutalba.',
        parameters: { type: 'OBJECT', properties: {
          status: { type: 'STRING', description: 'OPEN, ORDERED, ARRIVED, NOTIFIED, FULFILLED, CANCELLED or ACTIVE/OPENISH' },
          customer: { type: 'STRING', description: 'customer name/phone filter' },
          priority: { type: 'STRING' },
          limit: { type: 'NUMBER' }
        } }
      },
      {
        name: 'demand_outstanding',
        description: 'Outstanding demands grouped by product for Purchase Order creation — qty to order.',
        parameters: { type: 'OBJECT', properties: { locationId: { type: 'STRING' }, limit: { type: 'NUMBER' } } }
      },
      {
        name: 'demand_vendor_suggest',
        description: 'Best vendor for a demanded product based on price, reliability, lead time and purchase history.',
        parameters: { type: 'OBJECT', properties: {
          itemId: { type: 'STRING', description: 'item id if known' },
          itemName: { type: 'STRING', description: 'product name if itemId not known' },
          days: { type: 'NUMBER' }
        } }
      },
      {
        name: 'demand_pos_recommend',
        description: 'POS recommendations for a customer: their demanded products (with stock status) + related + history.',
        parameters: { type: 'OBJECT', properties: {
          customer: { type: 'STRING', description: 'customer name/phone' },
          limit: { type: 'NUMBER' }
        }, required: ['customer'] }
      },
      {
        name: 'demand_dashboard',
        description: 'Demand KPIs dashboard: outstanding, fulfilled, pending procurement, waiting customers, supplier order status, ageing.',
        parameters: { type: 'OBJECT', properties: { locationId: { type: 'STRING' } } }
      }
    ];
  },

  /** Enabled (whitelisted) tools — agent sirf inhi ko call kar sakta hai */
  tools: function () {
    return AI.allTools().filter(function (t) { return AI.toolEnabled(t.name); });
  },

  /* ============================ TOOL DISPATCH ============================== */
  dispatch: function (name, args, s) {
    args = args || {};
    var loc = args.locationId && Auth.canAccessLocation(s, args.locationId) ? args.locationId : s.locationId;
    var money = function (v) { return (DB.settings().currencySymbol || 'Rs') + ' ' + U.round(v, 2).toLocaleString('en-PK'); };

    switch (name) {

      case 'search_items': {
        var res = Items.search({ q: args.query, limit: U.num(args.limit, 10), locationId: loc }, s);
        return { items: res.map(function (i) {
          return { code: i.code, name: i.name, brand: i.brand || '', category: i.category || '',
            stock: i.stock, unit: i.unit, retail: i.retailPrice, wholesale: i.wholesalePrice, cost: i.costPrice };
        }) };
      }

      case 'get_item_stock': {
        var it = Items.findByBarcode(args.code, s) ||
          DB.findOne('Items', function (r) { return U.norm(r.code) === U.norm(args.code); });
        if (!it) return { error: 'Item not found: ' + args.code };
        var levels = DB.all('Stock').filter(function (r) { return r.itemId === it.id; })
          .map(function (r) { return { location: (DB.byId('Locations', r.locationId) || {}).name, qty: U.num(r.qty) }; });
        return { item: { code: it.code, name: it.name, stock: it.stock, retail: it.retailPrice,
          wholesale: it.wholesalePrice, cost: it.costPrice, rack: it.rack, unit: it.unit },
          byLocation: levels, message: money(it.retailPrice) + ' retail, stock ' + it.stock + ' ' + it.unit };
      }

      case 'low_stock_list': {
        var low = Items.reorderSuggestion(s).slice(0, U.num(args.limit, 20));
        return { count: low.length, items: low.map(function (i) {
          return { code: i.code, name: i.name, stock: i.stock, reorderLevel: i.reorderLevel,
            suggestQty: i.suggestQty, estCost: i.estCost };
        }) };
      }

      case 'today_sales': {
        var t = U.dateOnly();
        var r = Reports.sales({ from: t, to: t, locationId: loc }, s);
        return { date: t, summary: r.summary, message: 'Aaj ki sale ' + money(r.summary.total) +
          ' (' + r.summary.count + ' bills), cash ' + money(r.summary.paid) + ', udhaar ' + money(r.summary.due) };
      }

      case 'sales_summary': {
        var p = { from: args.from, to: args.to, locationId: loc };
        var rep = Reports.sales(p, s);
        return { summary: rep.summary, rowCount: rep.rows.length,
          message: 'Total ' + money(rep.summary.total) + ', profit ' + money(rep.summary.grossProfit) };
      }

      case 'top_selling_items': {
        var top = Reports.salesByItem({ from: args.from, to: args.to, locationId: loc }, s)
          .rows.slice(0, U.num(args.limit, 10));
        return { items: top.map(function (i) { return { code: i.code, name: i.name, qty: i.qty, revenue: i.revenue, profit: i.profit }; }) };
      }

      case 'profit_report': {
        try { Auth.require(s, 'reports.financial'); }
        catch (e) { return { error: 'Aap ko financial reports dekhne ki ijazat nahi hai.' }; }
        var pr = Reports.profit({ from: args.from, to: args.to, locationId: loc }, s);
        return pr;
      }

      case 'inventory_valuation': {
        var v = Inventory.valuation(loc);
        return v;
      }

      case 'customer_balance': {
        var list = Parties.listCustomers({ q: args.query, withBalance: true }, s).rows;
        if (!list.length) return { error: 'Customer nahi mila: ' + args.query };
        return { customers: list.slice(0, 5).map(function (c) {
          return { name: c.name, phone: c.phone, balance: c.balance, code: c.code };
        }) };
      }

      case 'receivables': {
        try { Auth.require(s, 'reports.financial'); } catch (e) { return { error: 'Permission nahi hai.' }; }
        var rec = Reports.receivables({}, s);
        return { total: rec.total, rows: rec.rows.slice(0, U.num(args.limit, 15)) };
      }

      case 'supplier_payables': {
        try { Auth.require(s, 'reports.financial'); } catch (e) { return { error: 'Permission nahi hai.' }; }
        var pay = Reports.payables({}, s);
        return { total: pay.total, rows: pay.rows.slice(0, U.num(args.limit, 15)) };
      }

      case 'pending_purchase_orders': {
        try { Auth.require(s, 'purchase.view'); } catch (e) { return { error: 'Permission nahi hai.' }; }
        return { rows: Purchase.listPO({}, s).filter(function (r) { return r.status !== 'RECEIVED'; }).slice(0, U.num(args.limit, 10)) };
      }

      case 'recent_sales': {
        var rs = Sales.list({ limit: U.num(args.limit, 10), locationId: loc }, s);
        return { rows: rs.rows.slice(0, U.num(args.limit, 10)).map(function (r) {
          return { invoice: r.invoiceNo, date: r.date, customer: r.customerName, total: r.total, status: r.status };
        }) };
      }

      case 'cash_position': {
        try { Auth.require(s, 'reports.financial'); } catch (e) { return { error: 'Permission nahi hai.' }; }
        return Reports.cashbook({ from: args.from, to: args.to, locationId: loc }, s);
      }

      case 'reorder_suggestions': {
        var sug = Items.reorderSuggestion(s);
        return { count: sug.length, estimatedTotal: U.round(U.sum(sug, 'estCost'), 2),
          items: sug.slice(0, 25).map(function (i) { return { code: i.code, name: i.name, stock: i.stock, suggestQty: i.suggestQty, estCost: i.estCost }; }) };
      }

      case 'demand_list': {
        try { Auth.require(s, 'demand.view'); } catch (e) { return { error: 'Demand dekhne ki ijazat nahi.' }; }
        var dl = CustomerDemands.list({ status: args.status, priority: args.priority, q: args.customer, limit: U.num(args.limit, 15) }, s);
        return { total: dl.total, rows: dl.rows.slice(0, U.num(args.limit, 15)).map(function (r) {
          return { demandNo: r.demandNo, date: r.date, customer: r.customerName, item: r.itemName, qty: r.qty, priority: r.priority, status: r.status, daysOpen: r.daysOpen };
        }), summary: dl.totals };
      }

      case 'demand_outstanding': {
        try { Auth.require(s, 'purchase.view'); } catch (e) { return { error: 'Permission nahi.' }; }
        var outS = CustomerDemands.suggestForPO({ locationId: loc, limit: U.num(args.limit, 15) }, s);
        return { totalDemands: outS.totalDemands, totalItems: outS.totalItems, totalQty: outS.totalQty, estimatedValue: outS.estimatedValue,
          items: outS.items.slice(0, U.num(args.limit, 15)).map(function (it) { return { item: it.itemName, code: it.itemCode, demandCount: it.demandCount, totalQty: it.totalQty, priority: it.topPriority, onHand: it.onHand, value: it.estimatedValue }; }) };
      }

      case 'demand_vendor_suggest': {
        try { Auth.require(s, 'purchase.view'); } catch (e) { return { error: 'Permission nahi.' }; }
        var vs = CustomerDemands.suggestVendors({ itemId: args.itemId, itemName: args.itemName, days: args.days }, s);
        return { item: vs.itemName || vs.itemId, best: vs.best, rows: vs.rows.slice(0, 8) };
      }

      case 'demand_pos_recommend': {
        try { Auth.require(s, 'pos.access'); } catch (e) { return { error: 'POS access nahi.' }; }
        var cands = Parties.listCustomers({ q: args.customer, withBalance: true }, s).rows;
        if (!cands.length) return { error: 'Customer nahi mila: ' + args.customer };
        var cid = cands[0].id;
        var rec = CustomerDemands.posRecommend({ customerId: cid, locationId: loc, limit: U.num(args.limit, 6) }, s);
        return { customer: rec.customerName, outstanding: rec.demands.length, demands: rec.demands.slice(0, 6).map(function (d) { return { item: d.itemName, qty: d.qty, status: d.status, stock: d.stock, canFulfill: d.canFulfill }; }), related: rec.related, history: rec.history };
      }

      case 'demand_dashboard': {
        try { Auth.require(s, 'demand.view'); } catch (e) { return { error: 'Permission nahi.' }; }
        var dash = CustomerDemands.dashboard({ locationId: loc }, s);
        return { totals: dash.totals, byStatus: dash.byStatus, ageing: dash.ageing, supplierOrderStatus: dash.supplierOrderStatus };
      }

      case 'draft_sale': {
        if (U.str(DB.settings().aiCanWrite) !== 'true') return { error: 'AI write mode band hai. Settings mein aiCanWrite=true karein.' };
        Auth.require(s, 'pos.sell');
        var lines = [], missing = [], total = 0;
        (args.items || []).forEach(function (l) {
          var it = Items.findByBarcode(U.str(l.code), s);
          if (!it) { missing.push(l.code); return; }
          var qty = U.num(l.qty, 1);
          var price = it.retailPrice;
          lines.push({ itemId: it.id, code: it.code, name: it.name, qty: qty, price: price,
            discount: 0, lineTotal: U.round(qty * price, 2), stock: it.stock });
          total += qty * price;
        });
        return { draft: true, type: 'SALE', customerName: args.customerName || 'Walk-in',
          lines: lines, subtotal: U.round(total, 2), missing: missing,
          note: 'Ye sirf draft hai — save karne ke liye POS screen par confirm karein.' };
      }

      case 'draft_purchase_order': {
        if (U.str(DB.settings().aiCanWrite) !== 'true') return { error: 'AI write mode band hai.' };
        Auth.require(s, 'purchase.po.create');
        var plines = [], pmissing = [], ptotal = 0;
        (args.items || []).forEach(function (l) {
          var it = Items.findByBarcode(U.str(l.code), s);
          if (!it) { pmissing.push(l.code); return; }
          var qty = U.num(l.qty, 1), cost = U.num(l.cost, U.num(it.costPrice));
          plines.push({ itemId: it.id, code: it.code, name: it.name, qty: qty, cost: cost, lineTotal: U.round(qty * cost, 2) });
          ptotal += qty * cost;
        });
        return { draft: true, type: 'PURCHASE_ORDER', supplierName: args.supplierName || '',
          lines: plines, total: U.round(ptotal, 2), missing: pmissing,
          note: 'Draft hai — Purchase module se confirm karein.' };
      }
    }
    return { error: 'Unknown tool: ' + name };
  },

  /* =============================== SYSTEM ================================== */
  systemPrompt: function (s) {
    var settings = DB.settings();
    var locs = (s.locations || []).map(function (l) { return l.name + '(' + l.id + ')'; }).join(', ');
    return [
      'You are "Haseeb Assistant", the built-in AI business agent for ' + settings.businessName + '.',
      'Business: auto parts, car & bike decoration, accessories — retail + wholesale, 3 branches: Sadiqabad City, Machi Goth, RYK Branch.',
      'Today: ' + U.dateOnly() + '. Timezone: Asia/Karachi. Currency: ' + (settings.currency || 'PKR') + ' (' + (settings.currencySymbol || 'Rs') + ').',
      'Current user: ' + s.fullName + ' (role ' + s.role + '). Active branch: ' + s.locationId + '. Allowed branches: ' + locs + '.',
      '',
      'RULES:',
      '1. ALWAYS call the relevant tool before answering any question about data. Never guess numbers.',
      '2. If a tool returns an error or no data, say so plainly — do not invent figures.',
      '3. Answer in the SAME language the user writes: Roman Urdu / English mix is expected ("aaj ki sale kya hai?"). Keep it short and business-like.',
      '4. Money format: ' + (settings.currencySymbol || 'Rs') + ' 12,500 — no decimals unless needed.',
      '5. Never expose ids, hashes, tokens or internal errors. Never claim you saved something you did not.',
      '6. Draft tools only PREPARE data; they never post transactions. Say "draft ready" and ask to confirm.',
      '7. Be proactive: if stock is low, mention it; if receivables are high, name the top 3 defaulters.',
      '8. Prefer tables/lists for multi-row answers. Use emojis sparingly (📦 💰 ⚠ ✅).',
      '',
      /* ---------- v2.2: Settings-driven behaviour (koi hardcoding nahi) ---------- */
      'PERSONA: ' + U.str(settings.aiPersona || AI_DEFAULTS.aiPersona),
      'LANGUAGE: ' + AI._langRule(settings.aiLanguage),
      'STYLE: ' + AI._styleRule(settings.aiStyle),
      'WRITE MODE: ' + (U.str(settings.aiCanWrite) === 'true'
        ? 'draft tools allowed (they NEVER post transactions)' +
          (U.str(settings.aiRequireApproval) !== 'false' ? ' — always ask for confirmation.' : '.')
        : 'read-only — never call draft tools.'),
      (U.str(settings.aiRedact) !== 'false'
        ? 'PRIVACY: never reveal CNIC, full phone numbers, tokens, ids or raw errors.' : ''),
      (U.str(settings.aiDataScope) ? 'DATA SCOPE: only these locations → ' + U.str(settings.aiDataScope) : '')
    ].join('\n');
  },

  _langRule: function (code) {
    code = U.str(code || 'AUTO').toUpperCase();
    if (code === 'ENGLISH') return 'Always answer in English.';
    if (code === 'URDU') return 'Hamesha Urdu (Arabic script) mein jawab dein.';
    if (code === 'ROMAN_URDU') return 'Hamesha Roman Urdu mein jawab dein.';
    return 'Mirror the user language: Roman Urdu / English mix is expected.';
  },

  _styleRule: function (code) {
    code = U.str(code || 'SHORT').toUpperCase();
    if (code === 'TINY') return 'Maximum 2 short sentences, numbers only where needed.';
    if (code === 'DETAILED') return 'Structured answer with headings, bullet lists and a short summary.';
    return 'Short and business-like: 3-6 lines, numbers first.';
  },

  /* ================================ CHAT =================================== */
  /**
   * p = { message, history: [{role, content}], threadId }
   */
  /* Roz ki message limit (per-user + global) — Settings se, 0 = unlimited */
  _rateCheck: function (s) {
    var perUser = U.num(DB.settings().aiRateLimitPerUser, 40);
    var perDay = U.num(DB.settings().aiRateLimitPerDay, 200);
    if (!perUser && !perDay) return;
    var today = U.dateOnly(), mine = 0, all = 0;
    DB.all('AIThreads').forEach(function (t) {
      var msgs = [];
      try { msgs = JSON.parse(t.messages || '[]'); } catch (e) { return; }
      msgs.forEach(function (m) {
        if (U.str(m.ts || t.updatedAt).slice(0, 10) !== today) return;
        all++;
        if (t.userId === s.userId) mine++;
      });
    });
    if (perUser && mine >= perUser)
      throw new Error('Roz ki limit poori (' + perUser + ' messages per user). Kal phir poochiye — ya AI Agent ▸ Setup mein limit barha saktay hain.');
    if (perDay && all >= perDay)
      throw new Error('Aaj ki total AI limit (' + perDay + ') khatam. AI Agent ▸ Setup se barhaayein.');
  },

  chat: function (p, s) {
    Auth.require(s, 'ai.use');
    var cfg = AI.getConfig(s);
    if (!cfg.enabled) throw new Error('AI assistant band hai. AI Agent ▸ Setup mein "AI enabled" on karein.');
    var routes = AI.routing(), readyFallback = routes.enabled && routes.order.some(function(id) { return id !== cfg.provider && AI.providerProfile(id).configured && AI.providerProfile(id).enabled; });
    if (cfg.needsKey && !cfg.mockFallback && !readyFallback) {
      return {
        reply: 'AI abhi keyless hai aur fallback bhi band hai.\n\nDo kaam:\n1) AI Agent ▸ Setup mein provider chunein aur API key daalein (Gemini key: https://aistudio.google.com/apikey — bilkul free tier hai), ya\n2) "Mock mode" on karke app key ke bagair rule-based jawabon ke sath chalein.\n\nSetup ▸ Test Connection dabakar confirm karein.',
        toolResults: [], needsKey: true
      };
    }
    if (cfg.enabled) AI._rateCheck(s);
    /* Keyless par fallback: is call ko MOCK par chalayein (baqi config waise hi) */
    if (cfg.needsKey && cfg.mockFallback && !readyFallback) cfg = Object.assign({}, cfg, { provider: 'MOCK' });

    var history = (p.history || []).slice(-12).map(function (h) {
      return { role: h.role === 'assistant' ? 'model' : 'user', text: U.str(h.content).substring(0, 4000) };
    });
    var message = U.str(p.message).substring(0, 4000);
    if (!message) throw new Error('Message khali hai.');

    var toolResults = [], attempts = [], requestedProvider = cfg.provider;
    var maxSteps = 5;
    var reply = '';
    var question = message;          /* v2.8.3 — asli sawal mehfooz rakhein */

    for (var step = 0; step < maxSteps; step++) {
      if (AI_REQUEST_BUDGET && Date.now() >= AI_REQUEST_BUDGET.deadline - 2000) {
        reply = 'AI waqt ki had par ruk gaya. Jo data mil saka woh tool results mein hai; chhota sawal ya tez model chunein.';
        break;
      }
      var resp = AI.callResilient(cfg, message, history, s, toolResults, attempts);
      /* v2.8.3 — provider error par throw NAHI hota, {error} aata hai.
         Pehle ye check missing tha → error chupke se ignore ho jata tha. */
      if (resp && resp.error) {
        var hint = AI._errorHint(resp.error, cfg.provider);
        throw new Error(resp.error + (hint ? '\n\n💡 ' + hint : ''));
      }

      var calls = resp.functionCalls || (resp.functionCall ? [resp.functionCall] : []);
      if (calls.length) {
        if (message) history.push({ role: 'user', text: message });
        calls.forEach(function (fc, ix) {
          var result;
          try {
            if (AI_REQUEST_BUDGET && Date.now() >= AI_REQUEST_BUDGET.deadline) throw new Error('AI_TIME_BUDGET: tool skipped');
            if (!AI.toolEnabled(fc.name)) throw new Error('Tool disabled');
            var previous = toolResults.filter(function(t){return t.tool===fc.name && JSON.stringify(t.args || {})===JSON.stringify(fc.args || {});})[0];
            result = previous && AI_TOOLS_META[fc.name] && AI_TOOLS_META[fc.name].risk==='WRITE' ? previous.result : AI.dispatch(fc.name, fc.args || {}, s);
          } catch (e) { result = { error: e.message }; }
          toolResults.push({ tool: fc.name, args: fc.args, result: result });
          history.push({ role: 'model', functionCall: fc,
            rawSteps: ix === 0 ? resp.rawSteps || null : null,
            skipRaw: ix > 0 && !!resp.rawSteps });
          history.push({ role: 'user', functionResponse: { id: fc.id, name: fc.name, response: result } });
        });
        message = '';
        continue;
      }

      reply = resp.text || '';
      break;
    }

    if (!reply) reply = 'Maazrat, main is waqt jawab nahi de pa raha. Dobara koshish karein.';

    /* v2.8.3 — pehle `message` save hota tha, jo loop ke andar badal kar
       "TOOL RESULT…" ban chuka hota tha → thread mein user ka asli sawal
       gum ho jata tha. Ab `question` save hota hai. */
    AI._saveThread(s, p.threadId, question, reply);
    Audit.log('AI_CHAT', 'AIThreads', '', null, { q: U.str(p.message).substring(0, 200), tools: toolResults.length }, s);

    return { reply: reply, toolResults: toolResults, config: { provider: cfg.provider, model: cfg.model }, routing: { primary: requestedProvider, answeredBy: cfg.provider, failover: cfg.provider !== requestedProvider, attempts: attempts } };
  },

  _saveThread: function (s, threadId, q, a) {
    try {
      var id = threadId || U.uid('THR');
      var rec = DB.byId('AIThreads', id);
      var msgs = [];
      if (rec) { try { msgs = JSON.parse(rec.messages || '[]'); } catch (e) { msgs = []; } }
      msgs.push({ role: 'user', content: U.str(q).substring(0, 1000), ts: U.iso() });
      msgs.push({ role: 'assistant', content: U.str(a).substring(0, 4000), ts: U.iso() });
      msgs = msgs.slice(-40);
      var payload = { title: (U.str(q).substring(0, 40) || 'Chat'), updatedAt: U.iso(), messages: JSON.stringify(msgs) };
      if (rec) DB.update('AIThreads', id, payload);
      else DB.insert('AIThreads', Object.assign({ id: id, userId: s.userId, createdAt: U.iso() }, payload));
      return id;
    } catch (e) { return null; }
  },

  threads: function (s) {
    return DB.all('AIThreads').filter(function (t) { return t.userId === s.userId; })
      .map(function (t) { return { id: t.id, title: t.title, updatedAt: t.updatedAt }; })
      .reverse().slice(0, 20);
  },

  clear: function (s) {
    DB.all('AIThreads').filter(function (t) { return t.userId === s.userId; })
      .forEach(function (t) { DB.remove('AIThreads', t.id, s); });
    return true;
  },

  /* ============================== PROVIDERS ================================ */
  /** Settings se temperature (0..1) */
  _temp: function () {
    var v = U.num(DB.settings().aiTemperature, 0.2);
    return Math.max(0, Math.min(1, v));
  },
  /** Settings se max output tokens (clamped) */
  _maxTokens: function () {
    var v = U.num(DB.settings().aiMaxTokens, 2048);
    return Math.max(256, Math.min(8192, v));
  },
  /** Custom endpoint override (self-hosted / proxy gateways ke liye) */
  _endpoint: function (provider) {
    return U.str(DB.settings().aiEndpoint || '');
  },

  /** v2.8.3 — base URL: user ka custom endpoint, warna provider ka official.
   *  PEHLE `aiEndpoint` setting dead code thi (kahin use hi nahi hoti thi),
   *  is liye "network config" ka field kuch bhi nahi karta tha. */
  _baseUrl: function (provider) {
    var st = DB.settings(), profile = {};
    try { profile = JSON.parse(st['ai.profile.' + provider] || '{}'); } catch(e) {}
    var custom = U.str(profile.endpoint !== undefined ? profile.endpoint : (st.aiProvider === provider ? st.aiEndpoint : '')).replace(/\/+$/, '');
    if (custom) {
      if (AI.requiresKey(provider) && !/^https:\/\/[^\s?#@]+$/i.test(custom)) throw new Error('Provider endpoint must use HTTPS without embedded credentials/query.');
      return custom;
    }
    if (provider === 'OPENROUTER') return 'https://openrouter.ai/api/v1';
    if (provider === 'OPENAI') return 'https://api.openai.com/v1';
    if (provider === 'OLLAMA') return ''; /* v2.9 — ollama self-hosted: URL admin deta hai */
    return 'https://generativelanguage.googleapis.com/v1beta';
  },

  /** v2.8.3 — Gemini ka schema UPPERCASE hota hai (STRING/NUMBER/OBJECT),
   *  OpenAI ko standard JSON Schema chahiye (lowercase) — official docs:
   *  developers.openai.com/api/docs/guides/function-calling
   *  Pehle hum Gemini wala schema seedha OpenAI ko bhej rahe the → tools
   *  reject/ignore → OpenAI par function calling CHUPKE SE band thi. */
  _jsonSchema: function (node) {
    if (!node || typeof node !== 'object') return node;
    if (Object.prototype.toString.call(node) === '[object Array]') {
      return node.map(function (x) { return AI._jsonSchema(x); });
    }
    var out = {};
    Object.keys(node).forEach(function (k) {
      var v = node[k];
      if (k === 'type' && typeof v === 'string') out.type = v.toLowerCase();
      else if (k === 'properties' && v && typeof v === 'object') {
        out.properties = {};
        Object.keys(v).forEach(function (pk) { out.properties[pk] = AI._jsonSchema(v[pk]); });
      } else if (k === 'items') out.items = AI._jsonSchema(v);
      else out[k] = v;                       // description / required / enum waghera
    });
    if (out.type === 'object' && out.additionalProperties === undefined) out.additionalProperties = false;
    return out;
  },

  /** Provider error ko aam aadmi ki zaban mein samjhayein */
  _errorHint: function (err, provider) {
    var e = U.str(err).toLowerCase();
    if (e.indexOf('api key not valid') > -1 || e.indexOf('invalid api key') > -1 ||
        e.indexOf('incorrect api key') > -1 || e.indexOf('401') > -1) {
      return 'API key ghalat ya expire ho chuki hai. Nayi key banayein: ' +
        (provider === 'GEMINI' ? 'https://aistudio.google.com/apikey' : 'https://platform.openai.com/api-keys');
    }
    if (e.indexOf('403') > -1 || e.indexOf('permission') > -1 || e.indexOf('access') > -1) {
      return 'Key theek hai magar is model/account par access nahi. Billing enable karein ya model badlein.';
    }
    if (e.indexOf('404') > -1 || e.indexOf('not found') > -1 || e.indexOf('not supported') > -1) {
      return 'Ye model is provider par nahi mila. "Refresh models" se list laayein ya koi aur model chunein. ' +
        '(Gemini par naye accounts ke liye purane models band ho saktay hain — API mode "Interactions" rakhein.)';
    }
    if (e.indexOf('429') > -1 || e.indexOf('quota') > -1 || e.indexOf('rate') > -1) {
      return 'Limit khatam (quota/rate limit). Thodi der baad koshish karein ya plan upgrade karein.';
    }
    if (e.indexOf('timeout') > -1 || e.indexOf('timed out') > -1 || e.indexOf('address') > -1) {
      return 'Network/endpoint masla. Agar custom endpoint diya hai to URL check karein (https:// zaroori hai).';
    }
    return 'Provider ka error — message parhein. Aksar wajah: ghalat key, model available nahi, ya quota.';
  },

  /** v2.11 — PROVIDER-AGNOSTIC: engine sirf adapter registry se baat karta hai
   *  (AI_Adapters.gs). Naya provider jodna ho to sirf ek adapter object chahiye. */
  _adapterFor: function (provider) {
    provider = U.str(provider || 'GEMINI').toUpperCase();
    if (!AI_ADAPTERS[provider] || !AI_ADAPTERS[provider].run) throw new Error('Unknown AI provider');
    return AI_ADAPTERS[provider];
  },
  _ctx: function (cfg, message, history, s) {
    var provider = U.str(cfg.provider || 'GEMINI').toUpperCase();
    return {
      provider: provider,
      mode: (typeof AI_ADAPTERS !== 'undefined' && AI_ADAPTERS.modeFor) ? AI_ADAPTERS.modeFor(provider) : 'AUTO',
      model: cfg.model || AI.defaultModel(provider),
      key: AI.getKey(provider), endpoint: AI._baseUrl(provider),
      system: cfg.probe ? 'Reply with OK. Do not call tools.' : AI.systemPrompt(s),
      message: message, history: history || [],
      tools: cfg.probe ? [] : AI.tools(),
      temp: AI._temp(), maxTokens: cfg.probe ? 256 : AI._maxTokens(),
      settings: DB.settings(), s: s
    };
  },
  _callProvider: function (cfg, message, history, s) {
    var ctx = AI._ctx(cfg, message, history, s);
    return AI._adapterFor(ctx.provider).run(ctx);
  },

  /* v2.8.3 — history ke 4 qisam ke items dono providers ki apni zaban mein
     tarjuma karte hain. Official protocol yehi hai:
       Gemini  → parts: [{functionCall}] / [{functionResponse}]
       OpenAI  → assistant.tool_calls / {role:'tool', tool_call_id}
     Pehle hum tool ka natija aik aam "TOOL RESULT: …" text ki tarah bhejte
     the — model ko pata hi nahi chalta tha ke ye tool ka jawab hai. */
  _geminiContents: function (history, message) {
    var contents = [];
    (history || []).forEach(function (h) {
      if (h.functionCall) {
        contents.push({ role: 'model', parts: [{ functionCall: { name: h.functionCall.name, args: h.functionCall.args || {} } }] });
      } else if (h.functionResponse) {
        contents.push({ role: 'user', parts: [{ functionResponse: { name: h.functionResponse.name, response: { result: h.functionResponse.response } } }] });
      } else {
        contents.push({ role: h.role === 'model' ? 'model' : 'user', parts: [{ text: U.str(h.text) }] });
      }
    });
    if (message) contents.push({ role: 'user', parts: [{ text: message }] });
    return contents;
  },

  _openAIMessages: function (history, message) {
    var messages = [];
    (history || []).forEach(function (h) {
      if (h.functionCall) {
        messages.push({
          role: 'assistant', content: null,
          tool_calls: [{ id: h.functionCall.id || ('ha_' + U.uid('c')), type: 'function',
            function: { name: h.functionCall.name, arguments: JSON.stringify(h.functionCall.args || {}) } }]
        });
      } else if (h.functionResponse) {
        messages.push({ role: 'tool', tool_call_id: h.functionResponse.id || 'ha_call',
          content: JSON.stringify(h.functionResponse.response).substring(0, 8000) });
      } else {
        messages.push({ role: h.role === 'model' ? 'assistant' : 'user', content: U.str(h.text) });
      }
    });
    if (message) messages.push({ role: 'user', content: message });
    return messages;
  },

  /* v2.10 — Rule-based MOCK agent: sawal ka matlab pehchan kar ASLI tools
   * chalaata hai aur un ke natijon se jawab banata hai (koi fabricated figure
   * nahi). Yehi wajah hai ke Mock mode demo aur live dono mein data deta hai.
   * Real model lagane par yehi tools uske paas jaate hain (function calling). */
  _mock: function (message, s) {
    var m = U.norm(message);
    var t = function (name, args) {
      try { return AI.dispatch(name, args || {}, s); } catch (e) { return { error: e.message }; }
    };
    var has = function () {
      var i;
      for (i = 0; i < arguments.length; i++) if (m.indexOf(U.norm(arguments[i])) > -1) return true;
      return false;
    };
    var money = function (v) { return (DB.settings().currencySymbol || 'Rs') + ' ' + U.round(v, 2).toLocaleString('en-PK'); };

    if (has('aaj ki sale', 'aj ki sale', 'today sale', 'aaj ka karobar', 'today sales')) {
      var r = t('today_sales');
      return { text: r.message || ('Aaj ki sale: ' + money((r.summary || {}).total || 0)) };
    }
    if (has('low stock', 'kam stock', 'khatam', 'out of stock', 'reorder')) {
      var l = t('low_stock_list', { limit: 5 });
      if (l.error) return { text: 'Stock data nahi khola ja saka: ' + l.error };
      var li = (l.items || []).map(function (i, ix) {
        return (ix + 1) + '. ' + i.name + ' — stock ' + U.num(i.stock) + ' (level ' + U.num(i.reorderLevel) + ', suggest ' + U.num(i.suggestQty) + ')';
      });
      return { text: (l.count || 0) + ' item low stock par hain:\n' + (li.length ? li.join('\n') : 'Koi item nahi — stock theek hai.') +
        '\n\nDetail ke liye Reorder screen kholein.' };
    }
    if (has('udhaar', 'receivable', 'lena hai', 'kaun dega', 'wasooli')) {
      var rc = t('receivables');
      if (rc.error) return { text: rc.error };
      var rr = (rc.rows || []).slice(0, 5).map(function (x, ix) {
        return (ix + 1) + '. ' + (x.name || x.customerName || '?') + ' — ' + money(U.num(x.balance || x.due));
      });
      return { text: 'Kul udhaar: ' + money(U.num(rc.total)) + '\n' + (rr.join('\n') || 'Koi udhaar nahi.') };
    }
    if (has('payable', 'supplier ko dena', 'dena hai')) {
      var sp = t('supplier_payables');
      if (sp.error) return { text: sp.error };
      return { text: 'Suppliers ko kul dena: ' + money(U.num(sp.total)) +
        ((sp.rows || []).length ? '\nSab se bara: ' + (sp.rows[0].name || '?') + ' — ' + money(U.num(sp.rows[0].balance || sp.rows[0].due)) : '') };
    }
    if (has('inventory value', 'stock value', 'godam ki qeemat', 'total stock')) {
      var iv = t('inventory_valuation');
      if (iv.error) return { text: iv.error };
      return { text: 'Inventory kul qeemat (cost par): ' + money(U.num(iv.total || iv.value)) };
    }
    if (has('profit', 'munafa', 'margin')) {
      var pr = t('profit_report');
      if (pr.error) return { text: pr.error };
      return { text: 'Munafa report: sale ' + money(U.num(pr.revenue || pr.total)) + ', gross profit ' + money(U.num(pr.profit || pr.grossProfit)) +
        (pr.margin !== undefined ? ' (' + U.round(U.num(pr.margin), 1) + '%)' : '') };
    }
    if (has('cash', 'naqd', 'wallet')) {
      var cp = t('cash_position');
      if (cp.error) return { text: cp.error };
      return { text: 'Cash position: ' + money(U.num(cp.total || cp.cash)) };
    }
    if (has('top selling', 'zyada bika', 'best seller', 'chalne wala')) {
      var ts = t('top_selling_items', { limit: 5 });
      if (ts.error) return { text: ts.error };
      var ti = (ts.items || []).map(function (i, ix) { return (ix + 1) + '. ' + (i.name || '?') + ' \u00d7 ' + U.num(i.qty); });
      return { text: 'Top sellers:\n' + (ti.join('\n') || 'Is arsay mein koi bikri nahi.') };
    }
    if (has('demand', 'mutalba', 'mang')) {
      var dd = t('demand_dashboard');
      if (dd && !dd.error && dd.totals) {
        return { text: '\ud83d\udcdd Demand dashboard: outstanding ' + U.num(dd.totals.outstanding) + ', fulfilled ' + U.num(dd.totals.fulfilled) + ', pending procurement ' + U.num(dd.totals.pendingProcurement) + ', waiting customers ' + U.num(dd.totals.waitingCustomers) };
      }
      var dl = t('demand_list', { limit: 5 });
      if (dl && !dl.error) {
        var lst = (dl.rows||[]).map(function(r,ix){return (ix+1)+'. '+r.item+' ('+r.qty+') \u2014 '+r.customer+' \u00b7 '+r.status;}).join('\n');
        return { text: 'Demands:\n' + (lst || 'Koi demand nahi') };
      }
    }
    if (has('item dhoond', 'search', 'khoj')) {
      var sr = t('search_items', { query: String(message || '').replace(/item|dhoond|khoj|search|for|do/gi, ' ').trim().slice(0, 40) });
      if (sr && !sr.error && (sr.items || []).length) {
        return { text: 'Items mile:\n' + sr.items.slice(0, 5).map(function (i, ix) {
          return (ix + 1) + '. ' + i.name + ' (' + i.code + ') — stock ' + U.num(i.stock) + ', retail ' + money(U.num(i.retail)); }).join('\n') };
      }
    }
    return { text: 'Main (Mock mode) aapki LIVE business data par tools chala kar jawab deta hoon. Aazmaayein:\n' +
      '• "aaj ki sale"\n• "low stock"\n• "udhaar kitna hai"\n• "inventory value"\n• "profit"\n• "top selling"\n' +
      'Live LLM chahiye to Setup mein Gemini/OpenAI/OpenRouter/Ollama provider connect karein.' };
  },

  /* ============================ SMART PROMPTS ============================== */
  suggestions: function (s) {
    var out = [
      'Aaj ki sale kitni hui?',
      'Low stock items batao',
      'Top 5 selling parts is month',
      'Kon se customer ka udhaar sab se zyada hai?',
      'Inventory value kitni hai?',
      'Is month ka profit report'
    ];
    if (Auth.can(s, 'purchase.view')) out.push('Reorder suggestion do');
    if (Auth.can(s, 'demand.view')) out.push('Kitni demands pending hain?');
    if (Auth.can(s, 'demand.view')) out.push('Demand dashboard batao');
    if (Auth.can(s, 'reports.financial')) out.push('Cash position last 7 days');
    return out;
  },

  /* ======================= RAW COMPLETION (utilities) ====================== */
  /**
   * Bina tools ke simple text completion — translations, descriptions,
   * auto-categorisation waghera ke liye. Failure par '' deta hai (App chalay ga).
   */
  complete: function (prompt, s) {
    var cfg = AI.getConfig(s);
    if (!cfg || cfg.enabled === false) return '';
    try {
      var res = ai_withBudget_(function(){return AI.callResilient({provider:cfg.provider,model:cfg.model,probe:true},prompt,[],s,[],[]);});
      return (res && (res.text || (res.functionCall ? '' : ''))) || '';
    } catch (e) {
      Logger.log('AI.complete failed: ' + e.message);
      return '';
    }
  }
};

/* ========================= AGENT CONFIGURATION (v2.2) =====================
 * Professional, fully settings-driven AI agent configuration.
 * Koi bhi value hardcoded nahi — sab Settings (DB) me `ai.*` keys ke sath.
 * ========================================================================= */

var AI_TOOLS_META = {
  search_items: { risk: 'READ', group: 'Inventory' },
  get_item_stock: { risk: 'READ', group: 'Inventory' },
  low_stock_list: { risk: 'READ', group: 'Inventory' },
  inventory_valuation: { risk: 'READ', group: 'Inventory' },
  reorder_suggestions: { risk: 'READ', group: 'Inventory' },
  demand_list: { risk: 'READ', group: 'Demands' },
  demand_outstanding: { risk: 'READ', group: 'Demands' },
  demand_vendor_suggest: { risk: 'READ', group: 'Demands' },
  demand_pos_recommend: { risk: 'READ', group: 'Demands' },
  demand_dashboard: { risk: 'READ', group: 'Demands' },
  today_sales: { risk: 'READ', group: 'Sales' },
  sales_summary: { risk: 'READ', group: 'Sales' },
  top_selling_items: { risk: 'READ', group: 'Sales' },
  recent_sales: { risk: 'READ', group: 'Sales' },
  profit_report: { risk: 'READ', group: 'Reports' },
  cash_position: { risk: 'READ', group: 'Reports' },
  customer_balance: { risk: 'READ', group: 'Parties' },
  receivables: { risk: 'READ', group: 'Parties' },
  supplier_payables: { risk: 'READ', group: 'Parties' },
  pending_purchase_orders: { risk: 'READ', group: 'Purchase' },
  draft_sale: { risk: 'WRITE', group: 'Actions' },
  draft_purchase_order: { risk: 'WRITE', group: 'Actions' }
};

var AI_DEFAULTS = {
  'aiEnabled': 'true',
  'aiProvider': 'GEMINI',
  'aiModel': '',            /* khali = provider se latest model khud chunein */
  'aiEndpoint': '',
  'aiTemperature': '0.2',
  'aiMaxTokens': '2048',
  'aiLanguage': 'AUTO',
  'aiStyle': 'SHORT',
  'aiPersona': 'Aap Haseeb Autos ke business assistant hain. Roman Urdu mein short, numbers ke sath jawab dein.',
  'aiCanWrite': 'false',
  'aiRequireApproval': 'true',
  'aiAutoSuggest': 'true',
  'aiFallbackMock': 'true',
  'aiRedact': 'true',
  'aiHistoryTurns': '8',
  'aiRateLimitPerDay': '200',
  'aiRateLimitPerUser': '40',
  'aiDataScope': '',
  'aiTools': '',
  /* v2.11 — per-provider API mode (AI_Adapters): AUTO = best-first + fallback */
  'aiApiModeGemini': 'AUTO',
  'aiApiModeOpenai': 'AUTO'
};

var AI_PRESETS = [
  { id: 'balanced', name: 'Balanced (default)', icon: '⚖',
    desc: 'Read-only data answers + draft actions, Roman Urdu, short.',
    values: { aiCanWrite: 'true', aiRequireApproval: 'true', aiTemperature: '0.2', aiStyle: 'SHORT',
      aiLanguage: 'AUTO', aiMaxTokens: '2048', aiHistoryTurns: '8', aiAutoSuggest: 'true' } },
  { id: 'analyst', name: 'Read-only analyst', icon: '📊',
    desc: 'Sirf data parh sakta hai — koi write/draft nahi. Reports ke liye behtareen.',
    values: { aiCanWrite: 'false', aiRequireApproval: 'true', aiTemperature: '0.1', aiStyle: 'DETAILED',
      aiMaxTokens: '3072', aiHistoryTurns: '12', aiAutoSuggest: 'true' } },
  { id: 'ops', name: 'Ops assistant', icon: '⚙',
    desc: 'Purchase/reorder focused — drafts banata hai, post nahi karta.',
    values: { aiCanWrite: 'true', aiRequireApproval: 'true', aiTemperature: '0.2', aiStyle: 'SHORT',
      aiMaxTokens: '2048', aiHistoryTurns: '10', aiAutoSuggest: 'true' } },
  { id: 'cashier', name: 'Roman-Urdu cashier', icon: '🧾',
    desc: 'Bahut chhote jawab, sirf rozana ki baat (aaj ki sale, stock, udhaar).',
    values: { aiCanWrite: 'false', aiRequireApproval: 'true', aiTemperature: '0.3', aiStyle: 'TINY',
      aiLanguage: 'ROMAN_URDU', aiMaxTokens: '1024', aiHistoryTurns: '5', aiAutoSuggest: 'true' } },
  { id: 'auditor', name: 'Night auditor', icon: '🌙',
    desc: 'Detailed, English, discrepancies aur anomalies dhoondhta hai.',
    values: { aiCanWrite: 'false', aiRequireApproval: 'true', aiTemperature: '0', aiStyle: 'DETAILED',
      aiLanguage: 'ENGLISH', aiMaxTokens: '4096', aiHistoryTurns: '16', aiAutoSuggest: 'false' } }
];

/**
 * MODEL CATALOG — **koi model name code mein nahi hai** (v2.5 rule).
 * ---------------------------------------------------------------------------
 * Model list 3 jagah se aa sakti hai (pehli jo mile wahi):
 *   1. Settings override : `ai.modelCatalog.<PROVIDER>` (JSON array) — admin
 *      khud daal sakta hai ya "Refresh models" se auto-fill hota hai
 *   2. Live discovery    : provider ke /models endpoint se (`AI.discoverModels`)
 *      → `ai.modelCache.<PROVIDER>` mein cache (12 ghante)
 *   3. khali             → UI "Refresh models" ya manual entry ka kehta hai
 *
 * Is tarah koi model deprecated/retire ho to sirf Settings ya discovery se
 * list update hoti hai — code mein kuch nahi badalna parta.
 * Provider endpoints aur auth official docs ke mutabiq hain.
 */
var AI_PROVIDERS = ['GEMINI', 'OPENAI', 'OPENROUTER', 'OLLAMA', 'MOCK'];

/** Settings se catalog (override JSON → discovery cache → []) */
/* v2.10 — Provider metadata (AI object ke bahir attach; same style as catalog) */
AI.providers = function () {
  /* v2.11 — meta ab ADAPTERS se aata hai: naya provider = naya adapter, bas. */
  return AI_PROVIDERS.map(function (id) {
    var ad = (typeof AI_ADAPTERS !== 'undefined' && AI_ADAPTERS[id]) || null;
    var m = (ad && ad.meta) || { label: id };
    return Object.assign({ id: id }, m);
  });
};

AI.catalog = function (provider) {
  provider = U.str(provider || DB.settings().aiProvider || 'GEMINI').toUpperCase();
  var st = DB.settings();
  var out = [];
  var override = U.str(st['ai.modelCatalog.' + provider]);
  if (override) {
    try {
      var j = JSON.parse(override);
      if (j && j.length) {
        out = j.map(function (m) {
          return typeof m === 'string'
            ? { id: m, label: m, status: 'custom', free: false, note: 'Custom' }
            : { id: U.str(m.id), label: U.str(m.label || m.id), status: U.str(m.status || 'stable'),
                free: m.free === true, note: U.str(m.note || '') };
        });
      }
    } catch (e) { out = []; }
  }
  if (!out.length) {
    var cache = U.str(st['ai.modelCache.' + provider]);
    if (cache) {
      try {
        var c = JSON.parse(cache);
        if (c && c.length) {
          out = c.map(function (m) {
            return typeof m === 'string' ? { id: m, label: m, status: 'live', free: false, note: 'Discovered' }
              : { id: U.str(m.id), label: U.str(m.label || m.id), status: U.str(m.status || 'live'),
                  free: m.free === true, note: U.str(m.note || 'Discovered') };
          });
        }
      } catch (e2) { out = []; }
    }
  }
  if (!out.length && provider === 'MOCK') {
    /* MOCK hamara apna offline provider hai — is ka model vendor model nahi */
    out = [{ id: 'mock', label: 'Mock (offline, no key)', status: 'stable', free: true, note: 'Rules-based answers' }];
  }
  return out;
};

/** Model ki metadata (status / free / note) — UI badges isi se bante hain */
AI.modelMeta = function (model, provider) {
  var list = AI.catalog(provider);
  for (var i = 0; i < list.length; i++) if (list[i].id === U.str(model)) return list[i];
  return { id: U.str(model), label: U.str(model), status: 'custom', free: false, note: 'Custom / not in catalog' };
};

/**
 * Recommended model — Settings override → catalog se behtareen (free + stable,
 * naya version pehle) → '' (matlab: user khun choose kare ya refresh kare).
 * Koi vendor model name yahan hardcode nahi hai.
 */
AI.defaultModel = function (provider) {
  provider = U.str(provider || DB.settings().aiProvider || 'GEMINI').toUpperCase();
  var pinned = U.str(DB.settings()['ai.defaultModel.' + provider]);
  if (pinned) return pinned;
  var list = AI.catalog(provider);
  if (!list.length) return '';
  var preferFree = U.str(DB.settings().aiPreferFree) !== 'false';
  var ver = function (id) {
    var m = U.str(id).match(/(\d+(?:\.\d+)*)/);
    if (!m) return 0;
    var parts = m[1].split('.').map(Number);
    return (parts[0] || 0) * 1000 + (parts[1] || 0) * 10 + (parts[2] || 0) * 0.1;
  };
  var score = function (m) {
    var v = ver(m.id);
    var s = 0;
    if (m.status === 'stable' || m.status === 'live') s += 100;
    if (m.status === 'preview') s += 20;
    if (m.status === 'deprecated' || m.status === 'legacy') s -= 500;
    if (preferFree && m.free) s += 60;
    return s * 100000 + v;
  };
  return list.slice().sort(function (a, b) { return score(b) - score(a); })[0].id;
};

/**
 * LIVE MODEL DISCOVERY — provider ke /models endpoint se asli list laata hai,
 * Settings me cache karta hai (`ai.modelCache.<PROVIDER>`), aur fail hone par
 * catalog fallback deta hai. Is se koi model name kabhi stale nahi hota.
 */
AI.discoverModels = function (p, s) {
  Auth.require(s, 'settings.manage');
  p = p || {};
  var provider = U.str(p.provider || DB.settings().aiProvider || 'GEMINI').toUpperCase();
  var settings = DB.settings();
  var cacheKey = 'ai.modelCache.' + provider;
  var cachedAt = U.str(settings['ai.modelCacheAt.' + provider] || '');
  var ageMin = cachedAt ? (Date.now() - new Date(cachedAt).getTime()) / 60000 : 1e9;

  if (!p.refresh && settings[cacheKey] && ageMin < (U.num(settings.aiModelCacheMins, 720))) {
    try {
      return { provider: provider, source: 'cache', ageMinutes: Math.round(ageMin),
        models: JSON.parse(settings[cacheKey]) };
    } catch (e) { /* cache kharab → aage barho */ }
  }
  if (provider === 'MOCK') {
    return { provider: 'MOCK', source: 'catalog', models: AI.catalog('MOCK'), note: '' };
  }
  var adD = AI._adapterFor(provider);
  var ctxD = AI._ctx({ provider: provider, model: '' }, '', [], s);
  ctxD.provider = provider;
  try {
    var lm = adD.listModels ? adD.listModels(ctxD) : { models: null };
    if (lm && lm.models && lm.models.length) {
      try {
        DB.setSetting(cacheKey, JSON.stringify(lm.models));
        DB.setSetting('ai.modelCacheAt.' + provider, new Date().toISOString());
      } catch (eC) { }
      return { provider: provider, source: 'live', models: lm.models };
    }
    return { provider: provider, source: 'catalog', models: AI.catalog(provider),
      note: (lm && lm.note) || (lm && lm.error) || 'Provider se list nahi mili — key check karein ya model khud darj karein' };
  } catch (e) {
    return { provider: provider, source: 'catalog', error: e.message, models: AI.catalog(provider) };
  }
};

/** Har provider ka catalog (Settings override → discovery cache) + recommended */
AI.modelOptions = function (s) {
  var provider = U.str(DB.settings().aiProvider || 'GEMINI').toUpperCase();
  var out = {};
  AI_PROVIDERS.forEach(function (p) { out[p] = AI.catalog(p); });
  var list = out[provider] || [];
  return {
    provider: provider, catalog: out, models: list,
    recommended: AI.defaultModel(provider),
    preferFree: U.str(DB.settings().aiPreferFree) !== 'false',
    deprecated: list.filter(function (m) { return m.status === 'deprecated' || m.status === 'legacy'; })
      .map(function (m) { return m.id; }),
    sources: AI_PROVIDERS.reduce(function (a, p) {
      a[p] = DB.settings()['ai.modelCatalog.' + p] ? 'settings'
        : (DB.settings()['ai.modelCache.' + p] ? 'discovered' : 'empty');
      return a;
    }, {})
  };
};

/** Poori agent configuration (frontend panel isi se banta hai) */
AI.agentConfig = function (s) {
  var st = DB.settings();
  var cfg = AI.getConfig(s);
  var enabledTools = U.str(st.aiTools || '');
  var off = {};
  if (enabledTools) {
    U.str(enabledTools).split(',').forEach(function (t) {
      t = U.str(t);
      if (t.charAt(0) === '-') off[t.slice(1)] = true;
    });
  }
  var tools = AI.allTools().map(function (t) {
    var meta = AI_TOOLS_META[t.name] || { risk: 'READ', group: 'Other' };
    return { name: t.name, description: t.description, risk: meta.risk, group: meta.group,
      enabled: !off[t.name] };
  });
  var get = function (k) { return st[k] !== undefined && st[k] !== '' ? st[k] : AI_DEFAULTS[k]; };
  return {
    /* runtime status */
    enabled: cfg.enabled, provider: cfg.provider, model: cfg.model,
    hasKey: cfg.hasKey, keyHint: cfg.keyHint, canWrite: cfg.canWrite, credentials: cfg.credentials,
    profiles: AI.profileMap(), routing: AI.routing(),
    /* tunables */
    values: {
      aiEnabled: get('aiEnabled'), aiProvider: get('aiProvider'), aiModel: get('aiModel'),
      aiEndpoint: get('aiEndpoint'), aiTemperature: get('aiTemperature'),
      aiMaxTokens: get('aiMaxTokens'), aiLanguage: get('aiLanguage'), aiStyle: get('aiStyle'),
      aiPersona: get('aiPersona'), aiCanWrite: get('aiCanWrite'),
      aiRequireApproval: get('aiRequireApproval'), aiAutoSuggest: get('aiAutoSuggest'),
      aiFallbackMock: get('aiFallbackMock'), aiRedact: get('aiRedact'),
      aiHistoryTurns: get('aiHistoryTurns'), aiRateLimitPerDay: get('aiRateLimitPerDay'),
      aiRateLimitPerUser: get('aiRateLimitPerUser'), aiDataScope: get('aiDataScope'),
      aiApiModeGemini: get('aiApiModeGemini'), aiApiModeOpenai: get('aiApiModeOpenai')
    },
    tools: tools,
    models: AI.modelOptions(s).models,
    allModels: AI.modelOptions(s).catalog,
    modelMeta: AI.modelMeta(cfg.model, cfg.provider),
    recommendedModel: AI.defaultModel(cfg.provider),
    /* v2.8.3 — CONTENT-AWARE UI ke liye: har provider ka recommended model.
       Pehle sirf mojooda provider ka model aata tha, is liye provider badalne
       par frontend purana (doosre provider ka) model dikhata rehta tha. */
    recommendedByProvider: AI_PROVIDERS.reduce(function (a, p) {
      a[p] = AI.defaultModel(p); return a;
    }, {}),
    modelSources: AI.modelOptions(s).sources,
    preferFree: U.str(st.aiPreferFree) !== 'false',
    presets: AI_PRESETS,
    locations: DB.all('Locations').map(function (l) { return { id: l.id, name: l.name }; }),
    usage: AI.usage(s),
    limits: { temperature: [0, 1], maxTokens: [256, 8192] }
  };
};

/** Agent config save — `values` object aur `tools` array dono le sakta hai */
AI.saveAgentConfig = function (p, s) {
  Auth.require(s, 'settings.manage');
  AI.getKey(); // bind any legacy credential before provider change
  var values = Object.assign({}, p.values || {});
  var selected = p.provider;
  if (selected && AI_PROVIDERS.indexOf(selected) < 0) throw new Error('Unknown provider');
  var profileChanges = {};
  if (selected) {
    var profile = AI.providerProfile(selected);
    profileChanges['ai.profile.' + selected] = JSON.stringify({
      model:values.aiModel || profile.model, endpoint:values.aiEndpoint !== undefined ? values.aiEndpoint : profile.endpoint,
      enabled:true, lastTest:null });
    delete values.aiProvider;
    if (selected !== DB.settings().aiProvider) { delete values.aiModel; delete values.aiEndpoint; }
  }
  var currentValues = DB.settings();
  var changes = profileChanges;
  Object.keys(values).forEach(function (k) {
    if (Object.keys(AI_DEFAULTS).indexOf(k) === -1 && k !== 'aiTools') return;
    if (String(currentValues[k] === undefined ? AI_DEFAULTS[k] : currentValues[k]) !== String(values[k])) changes[k] = String(values[k]);
  });
  if (p.tools) {
    var off = p.tools.filter(function (t) { return t.enabled === false; })
      .map(function (t) { return '-' + t.name; });
    if (U.str(currentValues.aiTools) !== off.join(',')) changes.aiTools = off.join(',');
  }
  if (Object.keys(changes).length) DB.setSettings(changes, s);
  if (p.key !== undefined && p.key !== null && p.key !== '') {
    if (selected) PropertiesService.getScriptProperties().setProperty('AI_KEY_' + selected, U.str(p.key).trim());
    else AI.setKey(p.key, values.aiProvider, values.aiModel);
  }
  Audit.log('AI_CONFIG', 'Settings', 'ai', {}, values, s);
  return AI.agentConfig(s);
};

/** Tool ko chalane se pehle check — disabled tool agent ke liye nazar nahi aata */
AI.toolEnabled = function (name) {
  var st = DB.settings();
  var list = U.str(st.aiTools || '');
  if (!list) return true;
  return list.split(',').indexOf('-' + name) === -1;
};

/** Provider se live connection test (key ke baghair MOCK dry-run) */
AI.testConnection = function (p, s) {
  Auth.require(s, 'settings.manage');
  var cfg = AI.getConfig(s);
  var provider = U.str((p && p.provider) || cfg.provider || 'GEMINI').toUpperCase();
  var model = (p && p.model) || AI.providerProfile(provider).model;
  var started = new Date().getTime();
  var out = { ok: false, provider: provider, model: model, ms: 0, message: '' };
  try {
    if (AI.requiresKey(provider) && !AI.getKey(provider)) {
      out.message = 'API key set nahi hai — AI Agent ▸ Setup mein is provider ki key save karein.';
      return out;
    }
    /* v2.11 — pehle SASTA auth check (adapter.verify — key/models endpoint),
       taake ghalti ki jagah saaf pata chale: key kharab HAI ya model nahi chala. */
    var adT = AI._adapterFor(provider);
    if (adT.verify && provider !== 'MOCK') {
      var ctxV = { provider: provider, model: model, key: AI.getKey(provider), settings: DB.settings(), s: s };
      var v = adT.verify(ctxV);
      out.keyCheck = v && v.ok ? ('✓ ' + (v.note || 'key valid')) : '✖ ' + ((v && v.error) || 'verify failed');
      if (!v || !v.ok) {
        out.ok = false;
        out.message = out.keyCheck;
        out.hint = AI._errorHint((v && v.error) || '', provider);
        out.ms = new Date().getTime() - started;
        return out;
      }
    }
    var res = AI._callProvider({ provider: provider, model: model, probe: true },
      'Reply with the single word: OK', [], s);
    out.ms = new Date().getTime() - started;

    /* v2.8.3 — PEHLE YAHAN BUG THA: `_callProvider` HTTP failure par throw
       NAHI karta, `{error: …}` return karta hai. Hum ne wo check hi nahi kiya
       aur `out.ok = true` kar diya — natija: ghalat API key par bhi screen par
       "Connected" (hara) likha aata, magar assistant kuch kaam nahi karta tha.
       Ab error ko asal error ki tarah report karte hain + qabil-e-fahm mashwara. */
    if (res && res.error) {
      out.ok = false;
      out.message = res.error;
      out.hint = AI._errorHint(res.error, provider);
      return out;
    }

    var text = U.str(res && (res.text || ''));
    if (!text && !(res && res.functionCall)) {
      out.ok = false;
      out.message = 'Provider ne khaali jawab diya (model "' + model + '" shayad is account par available nahi).';
      out.hint = 'Model badal kar dekhein — dropdown se koi aur model chunein, ya "Refresh models" dabayein.';
      return out;
    }
    out.ok = true;
    out.message = 'Connected · ' + out.ms + ' ms' + (out.keyCheck ? ' · ' + out.keyCheck : '') +
      (text ? ' · reply: ' + text.slice(0, 60) : '');
    out.apiMode = AI_ADAPTERS.modeFor(provider);
    out.sample = text.slice(0, 200);
  } catch (e) {
    out.ms = new Date().getTime() - started;
    out.message = e.message;
  }
  return out;
};

/** Usage statistics (threads / messages / aaj ke sawalat) */
AI.usage = function (s) {
  try {
    var rows = DB.all('AIThreads');
    var today = U.dateOnly();
    var msgs = 0, todayMsgs = 0;
    rows.forEach(function (r) {
      var arr = [];
      try { arr = JSON.parse(r.messages || '[]'); } catch (e) { arr = []; }
      msgs += arr.length;
      if (U.str(r.updatedAt || r.createdAt).slice(0, 10) === today) todayMsgs += arr.length;
    });
    return { threads: rows.length, messages: msgs, today: todayMsgs,
      limit: U.num(DB.settings().aiRateLimitPerDay, 200) };
  } catch (e) { return { threads: 0, messages: 0, today: 0, limit: 200 }; }
};

/** Owner ke liye: key set karne ka helper (Apps Script editor se chalayein) */
function setAIKey(key, provider, model) {
  return AI.setKey(key, provider, model);
}

/* One deadline shared across discovery, verification, fallbacks and chat rounds. */
(function () {
  ['chat', 'testConnection', 'discoverModels', '_callProvider'].forEach(function (name) {
    var original = AI[name];
    AI[name] = function () {
      var args = arguments;
      return ai_withBudget_(function () { return original.apply(AI, args); });
    };
  });
})();

/* File-order-independent provider hub handshake; do not move before wrappers. */
AI._coreReady = true;
if (typeof ai_installProviderHub_ === 'function') ai_installProviderHub_();
