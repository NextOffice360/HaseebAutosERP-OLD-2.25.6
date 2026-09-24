/**
 * HASEEB AUTOS - ERP / POS  ::  AUTH + RBAC
 * Session: CacheService (12h). Token har request ke sath bhejna hota hai.
 * Permissions: role defaults + group.permissions override (comma list ya '*')
 */

var Auth = {

  /* ================================ LOGIN ================================= */
  login: function (username, password, deviceInfo) {
    username = U.str(username).toLowerCase();
    if (!username || !password) throw new Error('Username aur password zaroori hain.');

    var users = DB.all('Users', true);
    var user = null;
    for (var i = 0; i < users.length; i++) {
      if (U.str(users[i].username).toLowerCase() === username) { user = users[i]; break; }
    }
    if (!user) throw new Error('Invalid username or password.');
    if (U.str(user.active) === 'false') throw new Error('Account disabled. Admin se rabta karein.');

    var h = U.sha256(user.salt + '::' + password + '::' + CONFIG.PW_PEPPER);
    if (h !== user.passwordHash) throw new Error('Invalid username or password.');

    var session = Auth._buildSession(user);
    /* v2.8.4 — SIGNED stateless token. Pehle sirf UUID + CacheService tha, aur
       Google cache ko kabhi bhi evict kar sakta hai (official docs) → user ko
       foran "Session expire ho gaya". Ab token khud apni pehchan rakhta hai. */
    var token = Auth.issue(session);
    /* cache bhi bharein — logout/revocation aur purane code paths ke liye */
    try {
      CacheService.getScriptCache().put('sess:' + token, JSON.stringify(session), U.num(CONFIG.SESSION_TTL, 43200));
      CacheService.getUserCache().put('sess:' + token, JSON.stringify(session), U.num(CONFIG.SESSION_TTL, 43200));
    } catch (e) { }

    DB.update('Users', user.id, { lastLogin: U.iso() });
    Audit.log('LOGIN', 'Users', user.id, null, { device: deviceInfo || '' }, session);
    return { token: token, session: session };
  },

  logout: function (token) {
    /* signed token ab storage par depend nahi karta, is liye REVOCATION list
       zaroori hai — warna logout ke baad bhi token chalta rehta. */
    Auth._revoke(token);
    try {
      CacheService.getScriptCache().remove('sess:' + token);
      CacheService.getUserCache().remove('sess:' + token);
    } catch (e) { }
    return true;
  },

  _buildSession: function (user) {
    var group = DB.byId('Groups', user.groupId);
    var perms = Auth.rolePerms(user.role);
    if (group && U.str(group.permissions)) {
      var gp = U.str(group.permissions);
      if (gp === '*') perms = ['*'];
      else perms = perms.concat(gp.split(',').map(function (s) { return U.str(s); }).filter(Boolean));
    }
    /* v2.5: per-user rules — role ke baad allow (extra) aur disallow (denied) lagoo */
    var extra = U.str(user.extraPermissions).split(',').map(function (s) { return U.str(s); }).filter(Boolean);
    var denied = U.str(user.deniedPermissions).split(',').map(function (s) { return U.str(s); }).filter(Boolean);
    if (extra.length) perms = perms.concat(extra);
    if (denied.length && perms.indexOf('*') === -1) {
      perms = perms.filter(function (p) { return denied.indexOf(p) === -1; });
    }
    var locIds = U.str(user.locationIds).split(',').filter(Boolean);
    var locations = DB.all('Locations').filter(function (l) {
      return U.str(l.active) !== 'false';
    });
    if (locIds.length && perms.indexOf('*') === -1) {
      var allowed = locations.filter(function (l) { return locIds.indexOf(l.id) > -1; });
      locations = allowed.length ? allowed : locations;
    }
    var saleLimit = U.num(user.role === 'OWNER' || perms.indexOf('*') > -1 ? 99999999 : (group && group.saleReturnLimit));
    var prefs = {};
    try { prefs = JSON.parse(U.str(user.prefs) || '{}') || {}; } catch (e) { prefs = {}; }
    if (!prefs.lang) prefs.lang = U.str(DB.settings().defaultLanguage) || 'en';
    return {
      userId: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      groupId: user.groupId,
      groupName: group ? group.name : '',
      permissions: Array.isArray(perms) ? perms : [perms],
      saleReturnLimit: saleLimit || 0,
      discountLimit: U.num(user.discountLimit, 0),
      commissionRate: U.num(user.commissionRate, 0),
      locations: locations,
      locationIds: locations.map(function (l) { return l.id; }),
      defaultLocationId: user.defaultLocationId || (locations[0] && locations[0].id),
      prefs: prefs,
      issuedAt: U.iso(),
      expiresIn: CONFIG.SESSION_TTL
    };
  },

  /* ====================== SIGNED SESSION TOKENS (v2.8.4) ==================
     ASLI MASLA (production, user report: "webapp flashing … Session expire ho
     gaya"): sessions SIRF CacheService mein thin. Google ke official docs
     (developers.google.com/apps-script/reference/cache/cache-service) kehte hain:

        "The data you write to the cache is not guaranteed to persist until its
         expiration time. You must be prepared to get back null from all reads."

     Yani Google session ko KABHI BHI uda sakta hai → agla request
     SESSION_EXPIRED → app login screen par flash karti thi. 12h TTL ka koi
     faida nahi jab storage hi guaranteed na ho.

     HAL (industry standard, JWT jaisa STATELESS token):
        v2.<base64url(session)>.<base64url(HMAC-SHA256(secret, body))>
     Verify ke liye kisi storage ki zaroorat NAHI — bas secret se signature
     match karein aur expiry dekhein. Is liye:
       • eviction se session kabhi nahi marta
       • verify mein koi service call nahi → TEZ bhi (best-practices: minimize
         calls to other services)
     Cache ab sirf 2 kaam ke liye: (a) logout/revocation, (b) purane tokens.
     ===================================================================== */
  _secret: function () {
    var p = PropertiesService.getScriptProperties();
    var s = p.getProperty('HA_TOKEN_SECRET');
    if (!s) {
      s = Utilities.getUuid() + Utilities.getUuid();
      p.setProperty('HA_TOKEN_SECRET', s);
    }
    return s;
  },

  /** HMAC-SHA256 signature (URL-safe base64, padding hata kar) */
  _hmac: function (data) {
    var sig = Utilities.computeHmacSha256Signature(data, Auth._secret(), Utilities.Charset.UTF_8);
    return Utilities.base64EncodeWebSafe(sig).replace(/=+$/, '');
  },

  /** Session → signed token */
  issue: function (session) {
    var s = JSON.parse(JSON.stringify(session));
    s.exp = Math.floor(new Date().getTime() / 1000) + U.num(CONFIG.SESSION_TTL, 43200);
    var body = Utilities.base64EncodeWebSafe(Utilities.newBlob(JSON.stringify(s)).getBytes())
      .replace(/=+$/, '');
    return 'v2.' + body + '.' + Auth._hmac(body);
  },

  /** Token → session (signature + expiry check). Ghalat/expired → null */
  _decodeToken: function (token) {
    var parts = U.str(token).split('.');
    if (parts.length !== 3 || parts[0] !== 'v2') return null;
    /* timing-safe compare (length barabar kar ke) */
    var want = Auth._hmac(parts[1]);
    if (want.length !== parts[2].length) return null;
    var diff = 0;
    for (var i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ parts[2].charCodeAt(i);
    if (diff !== 0) return null;                       // signature fail
    var s;
    try {
      s = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[1])).getDataAsString());
    } catch (e) { return null; }
    if (!s || typeof s !== 'object') return null;
    if (s.exp && Math.floor(new Date().getTime() / 1000) > U.num(s.exp)) return null;  // expired
    delete s.exp;
    return s;
  },

  /** Token revoke (logout) — signed tokens bhi ab band ho jayenge */
  _revoke: function (token) {
    try {
      CacheService.getScriptCache().put('revoked:' + U.str(token).slice(-40), '1',
        U.num(CONFIG.SESSION_TTL, 43200));
    } catch (e) { }
  },
  _isRevoked: function (token) {
    try { return !!CacheService.getScriptCache().get('revoked:' + U.str(token).slice(-40)); }
    catch (e) { return false; }
  },

  /* ============================== SESSION OPS ============================= */
  verify: function (token) {
    if (!token) throw new Error('NO_SESSION');
    if (Auth._isRevoked(token)) throw new Error('SESSION_EXPIRED');

    /* 1) signed stateless token — koi storage read nahi */
    var s = null;
    try { s = Auth._decodeToken(token); } catch (e) { s = null; }
    if (s) return s;

    /* 2) purane (unsigned) tokens — cache fallback. Cache eviction se ye mar
          sakte hain, is liye naye logins hamesha signed token lete hain. */
    var raw = CacheService.getScriptCache().get('sess:' + token);
    if (!raw) {
      try { raw = CacheService.getUserCache().get('sess:' + token); } catch (e) { }
    }
    if (!raw) throw new Error('SESSION_EXPIRED');
    return JSON.parse(raw);
  },

  refresh: function (token) {
    var s = Auth.verify(token);
    /* signed token khud expiry rakhta hai — cache ko taza karte rahein taake
       purane clients bhi chalte rahein */
    try {
      CacheService.getScriptCache().put('sess:' + token, JSON.stringify(s), U.num(CONFIG.SESSION_TTL, 43200));
    } catch (e) { }
    return s;
  },

  /** permission check — '*' ya exact key ya wildcard 'items.*' */
  /* ======================= PERMISSIONS MATRIX (v2.5) ======================
   * Roles ke default permissions Schema.gs (ROLE_PERMISSIONS) mein hain.
   * Admin Users & Security screen se unhein override kar sakta hai —
   * override Settings sheet mein JSON key ROLE_PERMISSIONS_OVERRIDE mein save hota hai.
   * =======================================================================*/
  _overrides: function () {
    var raw = DB.settings().ROLE_PERMISSIONS_OVERRIDE;
    if (!raw) return {};
    try {
      var o = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return (o && typeof o === 'object') ? o : {};
    } catch (e) { return {}; }
  },

  /** Effective permissions for a role (defaults + admin override) */
  rolePerms: function (role) {
    var base = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.OTHER || [];
    var ov = Auth._overrides()[role];
    if (!ov) return base.slice();
    var arr = Array.isArray(ov) ? ov : String(ov).split(',').map(function (x) { return U.str(x); }).filter(Boolean);
    return arr.slice();
  },

  /** Catalog + current matrix (Users & Security ▸ Permissions tab) */
  perms: function (payload, s) {
    Auth.require(s, 'users.view');
    var ov = Auth._overrides();
    var matrix = {};
    (typeof ROLES !== 'undefined' ? ROLES : []).forEach(function (r) {
      var id = typeof r === 'string' ? r : r.id;
      matrix[id] = Auth.rolePerms(id);
    });
    Object.keys(ROLE_PERMISSIONS).forEach(function (k) {
      if (!matrix[k]) matrix[k] = Auth.rolePerms(k);
    });
    return {
      groups: PERMISSION_GROUPS,
      catalog: PERMISSION_CATALOG,
      roles: (typeof ROLES !== 'undefined' ? ROLES : []),
      matrix: matrix,
      defaults: ROLE_PERMISSIONS,
      overridden: Object.keys(ov),
      locked: ['OWNER']
    };
  },

  /** Save one role's permission list */
  setPerms: function (payload, s) {
    payload = payload || {};
    Auth.require(s, 'users.manage');
    var role = U.str(payload.role).toUpperCase();
    if (!ROLES || ROLES.map(function (r) { return typeof r === 'string' ? r : r.id; }).indexOf(role) === -1) {
      throw new Error('Role ghalat hai: ' + role);
    }
    if (role === 'OWNER') throw new Error('Owner ke sab permissions hamesha ON rehte hain.');
    var list = (payload.permissions || []).map(function (x) { return U.str(x); }).filter(Boolean);
    var ov = Auth._overrides();
    /* v2.6 §15 — permission change sab se zyada sensitive hai: pehle kya tha
       (kaunsi permission ON thi) aur ab kya hai — dono record, taake
       "kis ne kis ko kya access diya" hamesha pata rahe. */
    var prevList = ov[role] || null;
    ov[role] = list;
    DB.setSetting('ROLE_PERMISSIONS_OVERRIDE', JSON.stringify(ov), s);
    Audit.log('PERMS_UPDATE', 'Users', role,
      { permissions: prevList },
      { permissions: list, added: prevList ? list.filter(function (x) { return prevList.indexOf(x) < 0; }) : [],
        removed: prevList ? prevList.filter(function (x) { return list.indexOf(x) < 0; }) : [] }, s);
    return Auth.perms({}, s);
  },

  /** Reset a role back to shipped defaults */
  resetPerms: function (payload, s) {
    payload = payload || {};
    Auth.require(s, 'users.manage');
    var role = U.str(payload.role).toUpperCase();
    var ov = Auth._overrides();
    delete ov[role];
    DB.setSetting('ROLE_PERMISSIONS_OVERRIDE', JSON.stringify(ov), s);
    /* v2.6 §15 — reset se pehle role ke paas kya permissions thin, wo bhi record */
    var prevReset = (Auth._overrides()[role] || []).slice();
    Audit.log('PERMS_RESET', 'Users', role,
      { permissions: prevReset, overridden: prevReset.length > 0 },
      { permissions: null, resetToDefaults: true }, s);
    return Auth.perms({}, s);
  },

  can: function (session, key) {
    if (!session) return false;
    var p = session.permissions || [];
    if (p.indexOf('*') > -1) return true;
    if (p.indexOf(key) > -1) return true;
    var parts = key.split('.');
    for (var i = parts.length - 1; i > 0; i--) {
      if (p.indexOf(parts.slice(0, i).join('.') + '.*') > -1) return true;
    }
    return false;
  },

  require: function (session, key) {
    if (!Auth.can(session, key)) {
      throw new Error('Aap ko ye kaam karne ki ijazat nahi hai (' + key + ').');
    }
    return true;
  },

  /** location access check */
  canAccessLocation: function (session, locationId) {
    if (!session) return false;
    if ((session.permissions || []).indexOf('*') > -1) return true;
    return (session.locationIds || []).indexOf(locationId) > -1;
  },

  /* ============================= USER MGMT ================================ */
  createUser: function (payload, session) {
    Auth.require(session, 'users.manage');
    var exists = DB.findOne('Users', function (u) { return U.str(u.username).toLowerCase() === U.str(payload.username).toLowerCase(); });
    if (exists) throw new Error('Username already exists.');
    var h = U.hashPassword(payload.password || 'haseeb123');
    return DB.insert('Users', {
      id: U.uid('USR'), username: U.str(payload.username).toLowerCase(), fullName: payload.fullName,
      passwordHash: h.hash, salt: h.salt, email: payload.email || '', phone: payload.phone || '',
      role: payload.role || 'OTHER', groupId: payload.groupId || '', locationIds: (payload.locationIds || []).join(','),
      defaultLocationId: payload.defaultLocationId || '', commissionRate: payload.commissionRate || 0,
      discountLimit: payload.discountLimit || 0, active: payload.active === false ? 'false' : 'true',
      /* v2.5: per-user rules */
      extraPermissions: Auth._permList(payload.extraPermissions),
      deniedPermissions: Auth._permList(payload.deniedPermissions),
      createdAt: U.iso()
    }, session);
  },

  /** comma string ya array → saf comma list */
  _permList: function (v) {
    if (Array.isArray(v)) return v.map(function (x) { return U.str(x); }).filter(Boolean).join(',');
    return U.str(v).split(',').map(function (x) { return U.str(x); }).filter(Boolean).join(',');
  },

  updateUser: function (id, patch, session) {
    Auth.require(session, 'users.manage');
    var safe = U.pick(patch, ['fullName', 'email', 'phone', 'role', 'groupId', 'locationIds',
      'defaultLocationId', 'commissionRate', 'discountLimit', 'active',
      /* v2.5: per-user rules */
      'extraPermissions', 'deniedPermissions']);
    if (safe.extraPermissions !== undefined) safe.extraPermissions = Auth._permList(safe.extraPermissions);
    if (safe.deniedPermissions !== undefined) safe.deniedPermissions = Auth._permList(safe.deniedPermissions);
    if (Array.isArray(safe.locationIds)) safe.locationIds = safe.locationIds.join(',');
    if (patch.password) {
      var h = U.hashPassword(patch.password);
      safe.passwordHash = h.hash; safe.salt = h.salt;
    }
    return DB.update('Users', id, safe, session);
  },

  changePassword: function (token, oldPassword, newPassword) {
    var session = Auth.verify(token);
    var u = DB.byId('Users', session.userId);
    if (U.sha256(u.salt + '::' + oldPassword + '::' + CONFIG.PW_PEPPER) !== u.passwordHash) {
      throw new Error('Purana password ghalat hai.');
    }
    var h = U.hashPassword(newPassword);
    DB.update('Users', u.id, { passwordHash: h.hash, salt: h.salt }, session);
    return true;
  },

  listUsers: function (session) {
    Auth.require(session, 'users.view');
    return DB.all('Users').map(function (u) {
      return U.pick(u, ['id', 'username', 'fullName', 'email', 'phone', 'role', 'groupId',
        'locationIds', 'defaultLocationId', 'commissionRate', 'discountLimit', 'active', 'lastLogin']);
    });
  },

  listGroups: function (session) {
    Auth.require(session, 'users.view');
    return DB.all('Groups');
  },

  saveGroup: function (payload, session) {
    Auth.require(session, 'users.manage');
    if (payload.id) return DB.update('Groups', payload.id, U.pick(payload,
      ['name', 'type', 'permissions', 'saleReturnLimit', 'dataViewLimit', 'comments', 'active']), session);
    return DB.insert('Groups', U.pick(payload, ['name', 'type', 'permissions',
      'saleReturnLimit', 'dataViewLimit', 'comments', 'active']), session);
  },

  permissionMatrix: function () {
    return { roles: ROLES, rolePermissions: ROLE_PERMISSIONS };
  }
};
