/**
 * DocReg.gs — v2.30.5 (D5, doc-intel spec §5/§6) — GOOGLE DRIVE DOCUMENT ORGANIZATION
 * ----------------------------------------------------------------------------
 * Research / official refs (HB delivery-rule #2):
 *   • https://developers.google.com/apps-script/advanced/drive
 *   • https://developers.google.com/workspace/drive/api/guides/folder
 *   • https://developers.google.com/apps-script/guides/web   (execute-as notes)
 * Rules:
 *   • Get-or-create by NAME under parent → stable reuse, koi duplicate folder nahi
 *   • Folder IDs PropertiesService (script) me persist — deterministic re-runs
 *   • Minimum scope: DriveApp (manifest me pehle se mojood)
 *   • Bootstrap repeated-run-safe; verify() har stored ID check karta hai
 *   • Koi OAuth token/credential frontend ko kabhi nahi milta (spec §6)
 * Run (docs format: File.gs ▸ func ▸ Run):  DocReg.gs ▸ DocReg.bootstrap ▸ Run
 */
'use strict';

var DOCREG_TREE = {
  name: 'Haseeb Autos ERP',
  kids: [
    { name: 'Project', kids: [{ name: 'Versions' }, { name: 'Backups' }, { name: 'Deployment' }] },
    { name: 'Documents', kids: [{ name: 'Invoices' }, { name: 'Receipts' }, { name: 'Reports' }, { name: 'Ledgers' }, { name: 'Quotations' }, { name: 'Other' }] },
    { name: 'Media', kids: [{ name: 'Images' }, { name: 'QR' }, { name: 'Barcodes' }] },
    { name: 'Exports' }, { name: 'Imports' }, { name: 'Archive' }
  ]
};

function DocReg_child_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

/** First-run/whenever: root + poori sub-tree create-OR-reuse; IDs return + persist. */
function DocReg_bootstrap() {
  var props = PropertiesService.getScriptProperties();
  var root = null;
  var rootId = props.getProperty('drive.rootId');
  if (rootId) { try { root = DriveApp.getFolderById(rootId); } catch (e) { root = null; } }
  if (!root) root = DocReg_child_(DriveApp.getRootFolder(), DOCREG_TREE.name);
  var map = { root: { id: root.getId(), name: root.getName(), url: root.getUrl() } };
  DOCREG_TREE.kids.forEach(function (g) {
    var f = DocReg_child_(root, g.name);
    map[g.name] = { id: f.getId(), url: f.getUrl() };
    (g.kids || []).forEach(function (k) {
      map[g.name + '/' + k.name] = { id: DocReg_child_(f, k.name).getId() };
    });
  });
  props.setProperty('drive.rootId', map.root.id);
  try { Config.set('drive.rootId', map.root.id); } catch (e) { /* CONFIG sheet optional */ }
  return { ok: true, folders: map, folderCount: Object.keys(map).length, at: new Date().toISOString() };
}

/** Har stored folder ID reachable? — clear failure report (spec §6). */
function DocReg_verify() {
  var props = PropertiesService.getScriptProperties();
  var rootId = props.getProperty('drive.rootId');
  var out = { ok: true, rootId: rootId || '', checked: 0, missing: [] };
  if (!rootId) { out.ok = false; out.missing.push('root (bootstrap pehle chalayein)'); return out; }
  try {
    var root = DriveApp.getFolderById(rootId);
    out.checked++;
    var it = root.getFolders();
    while (it.hasNext()) { it.next(); out.checked++; }
  } catch (e) { out.ok = false; out.missing.push('root: ' + e.message); }
  return out;
}
