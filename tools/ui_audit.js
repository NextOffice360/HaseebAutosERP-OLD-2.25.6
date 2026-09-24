/**
 * ui_audit.js — headless UI defect scanner.
 * Har screen + har tab ghoom kar report karta hai:
 *   • label/title ke baghair buttons
 *   • label/title/placeholder ke baghair inputs
 *   • khaali (blank) product cards / table cells
 * Run: node tools/ui_audit.js
 */
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { loginDom } = require('./_harness');

const HTML = path.join(__dirname, '..', 'demo', 'index.html');
const html = fs.readFileSync(HTML, 'utf8');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push('JSDOM: ' + (e.stack || e.message).slice(0, 200)));
vc.on('error', (...a) => errors.push('console.error: ' + a.map(String).join(' ').slice(0, 200)));

const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc });
const win = dom.window, doc = win.document;
win.matchMedia = () => ({ matches: false, addListener() { }, removeListener() { }, addEventListener() { }, removeEventListener() { } });
win.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
win.scrollTo = () => { };
win.alert = () => { }; win.confirm = () => true;
if (win.Element) win.Element.prototype.scrollIntoView = () => { };

const sleep = ms => new Promise(r => setTimeout(r, ms));
const SCREENS = ['dashboard', 'pos', 'items', 'inventory', 'warehouse', 'purchase', 'reorder',
  'parties', 'sales', 'money', 'insights', 'reports', 'shop', 'users', 'settings'];

function labelProblems(root, where) {
  const out = [];
  Array.from(root.querySelectorAll('button')).forEach(b => {
    const txt = (b.textContent || '').trim();
    const t = b.getAttribute('title') || b.getAttribute('aria-label') || '';
    if (!txt && !t) out.push(where + ' → button without label/title' + (b.className ? ' [.' + b.className + ']' : '') + (b.id ? ' #' + b.id : ''));
    else if (txt.length === 1 && !t && !/^[+\-−×✕✓]$/.test(txt)) out.push(where + ' → icon-only button "' + txt + '" without title');
  });
  Array.from(root.querySelectorAll('input, select, textarea')).forEach(i => {
    if (i.type === 'hidden') return;
    const t = i.getAttribute('title') || i.getAttribute('aria-label') || i.getAttribute('placeholder') || '';
    const wrap = i.closest('label');
    const lab = wrap ? (wrap.textContent || '').trim() : '';
    const idl = i.id ? doc.querySelector('label[for="' + i.id + '"]') : null;
    if (!t && !lab && !idl) out.push(where + ' → ' + i.tagName.toLowerCase() + (i.type ? '[' + i.type + ']' : '') + ' without label');
  });
  return out;
}

(async () => {
  await loginDom(doc, win);      /* poll + login (shared harness) */
  await sleep(900);

  const problems = [];
  const empties = [];

  for (const id of SCREENS) {
    win.App.go(id);
    await sleep(650);
    const view = doc.querySelector('#view');
    problems.push(...labelProblems(view, id));

    // blank content detection
    const cards = Array.from(view.querySelectorAll('.pcard'));
    cards.slice(0, 40).forEach(c => {
      const nm = (c.querySelector('.pc-name') || {}).textContent || '';
      if (!nm.trim()) empties.push(id + ' → product card with empty name');
    });
    const blankCells = Array.from(view.querySelectorAll('tbody td')).filter(td => {
      const t = (td.textContent || '').trim();
      return t === 'undefined' || t === 'null' || t === 'NaN';
    });
    if (blankCells.length) empties.push(id + ' → ' + blankCells.length + ' cells showing undefined/null/NaN');

    // tabs (3 levels)
    for (const lvl of [1, 2, 3]) {
      const tabs = Array.from(view.querySelectorAll('.tabbar-l' + lvl + ' .tab'));
      for (const t of tabs.slice(0, 6)) {
        try { t.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true })); }
        catch (e) { }
        await sleep(260);
        const label = (t.textContent || '').trim().slice(0, 18) || 'tab';
        problems.push(...labelProblems(doc.querySelector('#view'), id + '/' + label));
      }
    }
  }

  console.log('\n=== UI AUDIT ===');
  console.log('screens scanned: ' + SCREENS.length);
  console.log('\n-- label/title problems (' + problems.length + ') --');
  [...new Set(problems)].slice(0, 60).forEach(p => console.log('  • ' + p));
  console.log('\n-- empty/undefined content (' + empties.length + ') --');
  [...new Set(empties)].slice(0, 30).forEach(p => console.log('  • ' + p));
  console.log('\n-- jsdom errors (' + errors.length + ') --');
  [...new Set(errors)].slice(0, 10).forEach(p => console.log('  • ' + p));
  process.exit(0);
})();
