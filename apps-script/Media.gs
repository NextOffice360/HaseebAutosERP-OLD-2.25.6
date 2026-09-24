/* ============================================================================
   Media.gs — v2.6 QA · shared image upload (Google Drive)
   ----------------------------------------------------------------------------
   User ki shikayat: "shop ka Logo add karnay ki bhi option nahi hay."
   Item image upload alag tha, logo ke liye kuch bhi nahi.

   Ab EK hi jagah: Media.upload() — items bhi isi se, logo bhi, aur aage
   koi bhi image (category, user avatar) isi se chalega.

   Kyun Drive? Apps Script ka apna filesystem nahi. Drive aap ke apne Google
   account ke andar hai → koi teesri party, koi API key, koi extra cost.
   ========================================================================== */
var Media = {

  MAX_B64: 1700000,      /* ~1.2 MB image (base64 lamba hota hai) */
  FOLDER_PROP: 'IMG_FOLDER_ID',

  /**
   * @param {object} s        session
   * @param {object} opt      { bytes:Byte[], owner:'ITEM'|'LOGO'|'AVATAR', name:string }
   * @param {function} done   (url, driveId) => apna record save karke jawab dein
   */
  upload: function (s, opt, done) {
    opt = opt || {};
    var bytes = opt.bytes;
    if (!bytes || !bytes.length) throw new Error('Image khaali hai.');
    if (bytes.length > 1700000) throw new Error('Image bari hai — dobara chhoti kar ke bhejein.');

    var mime = opt.mime || 'image/jpeg';
    if (mime.indexOf('image/') !== 0) throw new Error('Sirf image file (JPG/PNG/WebP).');

    var ext = (mime.indexOf('png') > -1) ? 'png'
      : (mime.indexOf('webp') > -1) ? 'webp' : 'jpg';
    var base = String(opt.name || opt.owner || 'img').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40);
    var fname = (opt.owner || 'IMG') + '-' + base + '-' + U.uid('').slice(-6) + '.' + ext;

    var folder = Media._folder();
    var file = folder.createFile(Utilities.newBlob(bytes, mime, fname));
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { }

    var id = file.getId();
    var url = 'https://drive.google.com/uc?export=view&id=' + id;
    return done ? done(url, id, file) : { url: url, driveId: id };
  },

  /**
   * data: URL ya raw base64 → byte[].
   *   "data:image/png;base64,AAAA"  ya  "AAAA"  dono chalte hain.
   * Guard: sirf image/* — text/html waghera reject.
   */
  decode: function (data, fallbackMime) {
    var b64 = U.str(data);
    var mime = U.str(fallbackMime) || 'image/jpeg';
    if (!b64) throw new Error('Image khaali hai.');
    if (b64.indexOf(',') > -1) {
      var head = b64.slice(0, b64.indexOf(','));
      var mm = head.match(/data:([^;]+);/);
      if (mm && mm[1]) mime = mm[1];
      b64 = b64.slice(b64.indexOf(',') + 1);
    }
    if (mime.indexOf('image/') !== 0) {
      throw new Error('Sirf image file (JPG/PNG/WebP) upload ho sakti hai.');
    }
    if (b64.length > Media.MAX_B64) throw new Error('Image bari hai — dobara chhoti kar ke bhejein.');
    var bytes;
    try { bytes = Utilities.base64Decode(b64); }
    catch (e) { throw new Error('Image samajh nahi aayi (corrupt file).'); }
    bytes.mime = mime;
    return bytes;
  },

  /** Ek hi "Haseeb Autos — Product Images" folder (baar baar nahi banega) */
  _folder: function () {
    var name = 'Haseeb Autos — Product Images';
    try {
      var props = PropertiesService.getScriptProperties();
      var fid = props.getProperty(Media.FOLDER_PROP);
      if (fid) { try { return DriveApp.getFolderById(fid); } catch (e) { } }
      var it = DriveApp.getFoldersByName(name);
      if (it.hasNext()) { var f = it.next(); props.setProperty(Media.FOLDER_PROP, f.getId()); return f; }
      var made = DriveApp.createFolder(name);
      props.setProperty(Media.FOLDER_PROP, made.getId());
      return made;
    } catch (e) {
      return DriveApp.getRootFolder();
    }
  }
};

/** Logo upload — user ki shikayat: "shop ka Logo add karnay ki bhi option nahi hay" */
function uploadLogo(p, s) {
  Auth.require(s, 'settings.manage');
  p = p || {};
  var bytes = Media.decode(p.data, p.mime);
  return Media.upload(s, {
    bytes: bytes, owner: 'LOGO', name: 'logo'
  }, function (url, driveId) {
    /* logoUrl = Business Profile setting (receipt + login dono par nazar aaye ga) */
    var st = DB.settings() || {};
    var prev = U.str(st.logoUrl);
    if (typeof Settings !== 'undefined' && Settings.set) {
      Settings.set({ key: 'logoUrl', value: url }, s);
    } else {
      DB.setSetting('logoUrl', url, s);
    }
    Audit.log('LOGO', 'Settings', 'logoUrl', { logoUrl: prev }, { logoUrl: url, driveId: driveId }, s);
    return { url: url, driveId: driveId, previous: prev };
  });
}
