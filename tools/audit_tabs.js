/**
 * audit_tabs.js — Navigation & blank-block auditor for the built demo.
 *
 * Har registered screen, har level-1/2/3 tab, aur har Settings group/sub-tab
 * par jata hai aur verify karta hai:
 *   1. view render hua (content nodes > 0, text length > threshold)
 *   2. koi "blank block" nahi — yani container khali to nahi
 *      (`.empty` / `.tbl-empty` / `.chart-empty` jaisi states allowed hain,
 *       kyunki wo jaan-bujh kar likhe gaye empty states hain)
 *   3. koi console error / jsdom error nahi
 *   4. koi NaN / undefined / [object Object] DOM me nahi
 *
 *   node tools/audit_tabs.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { waitForDom } = require('./_harness');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'demo', 'index.html'), 'utf-8');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push('jsdomError: ' + (e && e.message ? e.message : e)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const dom = new JSDOM(HTML, { runScripts: 'dangerously', pretendToBeVisual: true,
  url: 'https://localhost/', virtualConsole: vc });
const win = dom.window, doc = win.document;

win.matchMedia = win.matchMedia || (q => ({ matches: false, media: q, addListener() { }, removeListener() { },
  addEventListener() { }, removeEventListener() { } }));
win.requestAnimationFrame = cb => setTimeout(cb, 0);
win.scrollTo = () => { };
win.HTMLElement.prototype.scrollIntoView = () => { };
win.URL.createObjectURL = () => 'blob:demo';
win.alert = () => { };
win.confirm = () => true;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const problems = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  if (!ok) { problems.push(name + ' → ' + (detail || '')); console.log('  ✖ ' + name + '  → ' + (detail || '').slice(0, 220)); }
}

/** Container ke andar "asli" content hai ya khali block */
function contentScore(el) {
  if (!el) return { nodes: 0, text: 0, blanks: 0, blankSel: '' };
  let nodes = 0, text = 0, blanks = 0, blankSel = '';
  /* legit empty states — ye blank block nahi hain */
  const ALLOWED = ['empty', 'tbl-empty', 'chart-empty', 'skeleton', 'sk-row', 'skel', 'skel-wrap', 'loading'];
  /* containers jo design ke hisaab se khaali rehte hain (actions bar, footers, hosts) */
  const NEUTRAL = /(actions|foot|footer|results|host|-head|sp$|row|wrap|grid|chips|seg|toolbar|tabpanel|panel|body|list|box)/i;
  const walk = node => {
    if (node.nodeType === 3) { text += (node.nodeValue || '').trim().length; return; }
    if (node.nodeType !== 1) return;
    nodes++;
    const cls = String(node.getAttribute && node.getAttribute('class') || '');
    if (ALLOWED.some(a => cls.split(/\s+/).indexOf(a) > -1)) { text += 20; return; }
    if (node.tagName === 'svg' || node.tagName === 'SVG') text += 40;
    if (node.tagName === 'INPUT' || node.tagName === 'SELECT' || node.tagName === 'TEXTAREA') text += 10;
    /* asli blank block: container jisme na text na children aur koi neutral class nahi */
    if (['DIV', 'SECTION', 'TBODY', 'UL'].indexOf(node.tagName) > -1 &&
        node.childNodes.length === 0 && (node.textContent || '').trim() === '' &&
        cls && !NEUTRAL.test(cls)) {
      blanks++; if (!blankSel) blankSel = node.tagName + '.' + cls.slice(0, 40);
    }
    Array.from(node.childNodes).forEach(walk);
  };
  Array.from(el.childNodes).forEach(walk);
  return { nodes, text, blanks, blankSel };
}

async function visit(label, sel) {
  if (sel) {
    const t = doc.querySelector(sel);
    if (!t) return null;
    t.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
    await sleep(420);
  }
  const view = doc.querySelector('#view');
  const score = contentScore(view);
  const html = view ? view.innerHTML : '';
  check(label + ' renders content', score.nodes > 3 && score.text > 40,
    'nodes=' + score.nodes + ' text=' + score.text);
  check(label + ' no blank block', score.blanks === 0, 'blank: ' + score.blankSel);
  check(label + ' no NaN/undefined', !/NaN|undefined%|\[object Object\]/.test(html),
    (html.match(/.{0,40}(NaN|undefined%|\[object Object\]).{0,40}/) || [''])[0]);
  return view;
}

async function boot() {
  /* login screen ka intezar — fixed 400ms par kabhi-kabhi boot slow ho kar crash
     ho jata tha (2026-09-24 flake). Poll karo, phir value set karo. */
  await waitForDom(() => !!(doc.querySelector('#lgUser') && doc.querySelector('#lgPass')), 10000);
  let user = doc.querySelector('#lgUser'), pass = doc.querySelector('#lgPass');
  if (!user || !pass) { console.log('AUDIT CRASH: login form 10s mein nahi mila'); process.exit(2); }
  user.value = 'owner'; pass.value = 'admin123';
  doc.querySelector('form.login-box').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  await sleep(700);

  /* ---------------------------- 1. SCREENS ------------------------------- */
  const screens = Object.keys(win.App.screens || {});
  console.log('\n\x1b[1mSCREENS (' + screens.length + ')\x1b[0m');
  for (const id of screens) {
    const before = errors.length;
    win.App.go(id);
    await sleep(id === 'pos' ? 1600 : 520);      // POS: virtual grid + catalog
    await visit('screen ' + id);
    check('screen ' + id + ' no console errors', errors.length === before,
      errors.slice(before).join(' | '));

    /* har level ke tabs */
    for (const lvl of ['.tabbar-l1 .tab', '.tabbar-l2 .tab', '.tabbar-l3 .tab']) {
      const tabs = Array.from(doc.querySelectorAll('#view ' + lvl));
      for (let i = 0; i < tabs.length; i++) {
        const name = (tabs[i].textContent || '').trim().slice(0, 26) || ('tab' + i);
        const list = Array.from(doc.querySelectorAll('#view ' + lvl));
        if (!list[i]) continue;
        const b4 = errors.length;
        list[i].dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
        await sleep(400);
        await visit('  ' + id + ' ▸ ' + name);
        check('  ' + id + ' ▸ ' + name + ' no errors', errors.length === b4,
          errors.slice(b4).join(' | '));
      }
    }
  }

  /* --------------------------- 2. SETTINGS ------------------------------- */
  console.log('\n\x1b[1mSETTINGS (Automation & AI)\x1b[0m');
  win.App.go('settings');
  await sleep(1400);
  const defs = win.CONFIG_DEFS_DEMO || [];
  const groups = defs.length ? defs : [];
  for (const g of groups) {
    const gtabs = Array.from(doc.querySelectorAll('#view .tabbar-l1 .tab, #view .tabbar .tab'));
    const first = String(g.label || '').split(/[\s&]+/)[0];
    const gt = gtabs.find(t => (t.textContent || '').indexOf(g.label) > -1) ||
               gtabs.find(t => (t.textContent || '').indexOf(g.id) > -1) ||
               gtabs.find(t => (t.textContent || '').indexOf(first) > -1);
    if (!gt) { check('settings group ' + g.id + ' tab exists', false, 'tab not found'); continue; }
    gt.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
    await sleep(420);
    for (const sub of (g.sub || [])) {
      const stabs = Array.from(doc.querySelectorAll('#view .tabbar-l2 .tab, #view .tabbar .tab'));
      const st = stabs.find(t => (t.textContent || '').trim() === sub.label) ||
                 stabs.find(t => (t.textContent || '').indexOf(sub.label) > -1);
      if (!st) { check('settings ' + g.id + ' ▸ ' + sub.label + ' sub-tab exists', false, 'not found'); continue; }
      const b4 = errors.length;
      st.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(450);
      const view = await visit('  settings ' + g.id + ' ▸ ' + sub.label);
      /* har settings sub-tab me kam az kam ek control hona chahiye */
      const controls = view ? view.querySelectorAll('input, select, textarea, button, .list-item, .card').length : 0;
      check('  settings ' + g.id + ' ▸ ' + sub.label + ' has controls', controls > 0, 'controls=' + controls);
      check('  settings ' + g.id + ' ▸ ' + sub.label + ' no errors', errors.length === b4,
        errors.slice(b4).join(' | '));
    }
  }

  /* --------------- 3. AI AGENT (v2.10 — dedicated tab) ------------------- */
  console.log('\n\x1b[1mAI AGENT (dedicated tab)\x1b[0m');
  win.App.go('settings'); await sleep(600);
  {
    const autoTab = Array.from(doc.querySelectorAll('#view .tabbar-l1 .tab'))
      .find(t => (t.textContent || '').indexOf('Automation') > -1);
    if (autoTab) {
      autoTab.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(400);
      const aiTab = Array.from(doc.querySelectorAll('#view .tabbar-l2 .tab, #view .tabbar .tab'))
        .find(t => (t.textContent || '').indexOf('AI') > -1);
      check('settings ▸ automation ▸ AI sub-tab exists', !!aiTab, 'not found');
      if (aiTab) {
        const b4 = errors.length;
        aiTab.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
        await sleep(500);
        const stxt = (doc.querySelector('#view') || {}).textContent || '';
        check('settings AI section shows bridge to AI Agent tab', /AI Agent kholein|Open AI Agent tab/.test(stxt), stxt.slice(0, 120));
        const bridge = Array.from(doc.querySelectorAll('#view button')).find(b => /AI Agent kholein|Open AI Agent tab/.test(b.textContent || ''));
        if (bridge) { bridge.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true })); await sleep(900); }
        check('bridge click reaches AI screen', win.App.current === 'ai', 'current=' + win.App.current);
        check('settings AI section no errors', errors.length === b4, errors.slice(b4).join(' | ').slice(0, 160));
      }
    }
    if (win.App.current !== 'ai') { win.App.go('ai'); await sleep(1000); }
    const view = doc.querySelector('#view');
    check('ai screen: 4 L1 tabs', view.querySelectorAll('.tabs.l1 .tab').length === 4,
      'tabs=' + view.querySelectorAll('.tabs.l1 .tab').length);
    check('ai screen: assistant chat input present', !!view.querySelector('#aiAsk, textarea'), 'no input');
    check('ai screen: suggestion chips (hydrated)', view.querySelectorAll('button.chip').length >= 3,
      'chips=' + view.querySelectorAll('button.chip').length);
    let b4 = errors.length;
    const setupT = Array.from(view.querySelectorAll('.tabs.l1 .tab')).find(x => /Setup/i.test(x.textContent || ''));
    if (setupT) { setupT.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); await sleep(600); }
    const v2 = doc.querySelector('#view');
    check('ai setup: provider cards (>=5)', v2.querySelectorAll('.ai-provc').length >= 5, 'cards=' + v2.querySelectorAll('.ai-provc').length);
    const btnTxt = Array.from(v2.querySelectorAll('button')).map(b => b.textContent || '').join('|');
    check('ai setup: Test + Save buttons', /Test connection/.test(btnTxt) && /Save settings/.test(btnTxt), btnTxt.slice(0, 140));
    check('ai setup: model select present', !!v2.querySelector('select'), 'no select');
    check('ai setup no errors', errors.length === b4, errors.slice(b4).join(' | ').slice(0, 160));
    b4 = errors.length;
    const toolsT = Array.from(doc.querySelectorAll('#view .tabs.l1 .tab')).find(x => /Tools/i.test(x.textContent || ''));
    if (toolsT) { toolsT.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); await sleep(500); }
    const toolRows = doc.querySelectorAll('#view .ai-tool').length;
    check('ai tools matrix rendered (17 tools)', toolRows >= 15, 'tools=' + toolRows);
    check('ai tools no errors', errors.length === b4, errors.slice(b4).join(' | ').slice(0, 160));
    b4 = errors.length;
    const actT = Array.from(doc.querySelectorAll('#view .tabs.l1 .tab')).find(x => /Activity/i.test(x.textContent || ''));
    if (actT) { actT.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); await sleep(500); }
    check('ai activity: stats cards', doc.querySelectorAll('#view .ai-stat').length >= 2, 'stats=' + doc.querySelectorAll('#view .ai-stat').length);
    check('ai activity no errors', errors.length === b4, errors.slice(b4).join(' | ').slice(0, 160));
  }

  /* ------------------------ 4. DASHBOARD CHARTS -------------------------- */
  console.log('\n\x1b[1mDASHBOARD CHARTS\x1b[0m');
  win.App.go('dashboard'); await sleep(2200);
  const svgs = doc.querySelectorAll('svg.chart-svg').length;
  check('dashboard renders SVG charts', svgs >= 4, 'svgs=' + svgs);
  check('dashboard has gauge/circle charts', doc.querySelectorAll('.chart-gauge').length >= 3,
    'gauges=' + doc.querySelectorAll('.chart-gauge').length);
  check('dashboard has donut', doc.querySelectorAll('.chart-donut').length >= 1, 'none');
  check('dashboard has line chart', doc.querySelectorAll('.chart-line').length >= 1, 'none');
  /* v2.5: bar charts HTML rows (.bars-html .bh-row) ya SVG (.chart-bars) — dono qabil-e-qubool,
     lekin HTML rows mein label/value overlap hona mumkin hi nahi (industry best practice) */
  const barRows = doc.querySelectorAll('.bars-html .bh-row').length;
  check('dashboard has bars (HTML rows ya SVG)',
    barRows >= 3 || doc.querySelectorAll('.chart-bars').length >= 1,
    'htmlRows=' + barRows + ' svg=' + doc.querySelectorAll('.chart-bars').length);
  check('bar rows are complete (label + track + value)',
    !barRows || Array.from(doc.querySelectorAll('.bars-html .bh-row'))
      .every(r => r.querySelector('.bh-lab') && r.querySelector('.bh-fill') && r.querySelector('.bh-val')),
    'incomplete rows');
  check('bar values are compact (<=10 chars, koi overlap nahi)',
    !barRows || Array.from(doc.querySelectorAll('.bars-html .bh-val'))
      .every(v => v.textContent.trim().length <= 10), 'value too long');
  check('dashboard has progress bars', doc.querySelectorAll('.prog-row').length >= 3,
    'rows=' + doc.querySelectorAll('.prog-row').length);
  check('charts have legends', doc.querySelectorAll('.lg-row, .lg-inline').length >= 3, 'none');
  /* chart style toggle (Line / Area / Bars) */
  const segs = Array.from(doc.querySelectorAll('#view .cseg'));
  check('chart style switch present', segs.length === 3, 'segs=' + segs.length);
  if (segs.length) {
    const b4 = errors.length;
    segs[2].dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
    await sleep(500);
    check('bars mode renders after switch',
      doc.querySelectorAll('.bars-html .bh-row').length >= 3 || doc.querySelectorAll('.chart-bars').length >= 1,
      'no bars (html=' + doc.querySelectorAll('.bars-html .bh-row').length +
      ' svg=' + doc.querySelectorAll('.chart-bars').length + ')');
    check('chart switch no errors', errors.length === b4, errors.slice(b4).join(' | '));
  }

  /* -------------------------- 5. RESULT ---------------------------------- */
  console.log('\n==============================================================');
  console.log('AUDIT CHECKS: ' + results.length + '   FAILED: ' + problems.length);
  console.log('==============================================================');
  if (problems.length) {
    console.log('\nFailures:');
    problems.forEach(p => console.log(' - ' + p.slice(0, 300)));
    process.exitCode = 1;
  }
  process.exit(problems.length ? 1 : 0);
}

boot().catch(e => { console.error('AUDIT CRASH:', e.message); process.exit(2); });
