/**
 * gen_defs.js — Settings schema (Config.defs()) ko REAL Apps Script backend se
 * nikal kar JSON banaata hai, taake demo preview kabhi source se aage/piche na rahe.
 *   node tools/gen_defs.js > defs.json
 */
const path = require('path');
const { loadBackend } = require('./mock_gs');

const DIR = path.join(__dirname, '..', 'apps-script');
const { sandbox } = loadBackend(DIR);

try { sandbox.Setup.setupAll(); } catch (e) { /* defs should not need data */ }
let defs = [];
try { defs = sandbox.Config.defs ? sandbox.Config.defs() : []; } catch (e) {
  console.error('Config.defs() failed: ' + (e && e.message));
  process.exit(1);
}
process.stdout.write(JSON.stringify(defs));
