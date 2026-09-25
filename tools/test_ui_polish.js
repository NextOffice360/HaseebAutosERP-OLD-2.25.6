#!/usr/bin/env node
/* ==========================================================================
   test_ui_polish.js — v2.6 QA round 2 · UI polish regression tests
   --------------------------------------------------------------------------
   Ye test ASLI browser (Chromium) mein render kar ke napta hai — kyunki
   in maslon mein se koi bhi static audit ya unit test se nahi mila:

     ① Buttons: ek hi .btn class ki 6 alag height (34/44/51/54/56/72px)
        ROOT CAUSE: `.sec` (section) DEAD CSS tha (0 istemal) magar
        `.btn.sec` (120 buttons) us se match kar jata tha → 16px padding.
     ② Product card: naam do baar ("…450ML" + "Flamingo · DashBoard Polish Spray")
     ③ Sidebar collapse / expand + full-screen button (naye features)
     ④ Typography: koi text 12px se chhota nahi

     python3 tools/build_demo.py   (pehle)
     node tools/test_ui_polish.js
   ========================================================================== */
const puppeteer = require('puppeteer');
const { login } = require('./_harness');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const DEMO = path.join(ROOT, 'demo', 'index.html');

let pass = 0, fail = 0; const failures = [];
const ok = (n, c, d) => c ? (pass++, console.log('  ✔ ' + n + (d ? '  → ' + d : '')))
  : (fail++, failures.push(n), console.log('  ✖ ' + n + (d ? '  → ' + d : '')));

if (!fs.existsSync(DEMO)) {
  console.log('✖ demo/index.html nahi mila — pehle: python3 tools/build_demo.py');
  process.exit(1);
}

(async () => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1440, height: 900 }
  });
  const page = await browser.newPage();
  await page.goto('file://' + DEMO, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 900));
  await login(page);            /* poll + login (shared harness) */
  await new Promise(r => setTimeout(r, 1200));

  /* ══════════════ ① BUTTON HEIGHT CONSISTENCY ══════════════ */
  console.log('\n\x1b[1m① Buttons — height consistency\x1b[0m');
  const SCREENS = ['pos', 'items', 'reports', 'settings', 'sales', 'parties', 'warehouse', 'accounting'];
  const heights = {};
  for (const sc of SCREENS) {
    await page.evaluate(s => window.App.go(s), sc);
    await new Promise(r => setTimeout(r, 1300));
    const hs = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('#view .btn').forEach(b => {
        const r = b.getBoundingClientRect();
        if (r.width > 0 && r.height > 10) out.push(Math.round(r.height));
      });
      return out;
    });
    hs.forEach(h => { heights[h] = (heights[h] || 0) + 1; });
  }
  const keys = Object.keys(heights).map(Number).sort((a, b) => a - b);
  console.log('     heights: ' + JSON.stringify(heights));
  /* 32=sm, 38=normal, 46=POS payment pad (jaan boojh kar bara — ungli se asan) */
  ok('button height sirf 4 tarah ki (32 sm / 36 base / 38 normal / 46 POS pad) — pehle 6 thin',
    keys.length <= 4 && keys.every(k => [32, 36, 38, 46].indexOf(k) >= 0), /* v2.30.6: 36 = base .btn min-height (touch-target qaafiyat) */
    'milay: ' + keys.join('/') + 'px');
  ok('koi button 60px se bara nahi (72px wala bug wapas nahi aaya)',
    keys.every(k => k <= 60), 'sab se bara: ' + Math.max.apply(null, keys) + 'px');
  ok('koi button 28px se chhota nahi (tap target)',
    keys.every(k => k >= 28), 'sab se chhota: ' + Math.min.apply(null, keys) + 'px');

  /* .sec dead CSS wapas na aaye */
  const secLeak = await page.evaluate(() => {
    const b = document.createElement('button');
    b.className = 'btn sec';
    document.body.appendChild(b);
    const pad = getComputedStyle(b).padding;
    b.remove();
    return pad;
  });
  ok('.btn.sec par section wali 16px padding nahi lagti (dead .sec CSS hataya gaya)',
    secLeak !== '16px', 'padding = ' + secLeak);

  /* ══════════════ ② PRODUCT CARD — DOUBLE NAME ══════════════ */
  console.log('\n\x1b[1m② Product card — double name\x1b[0m');
  await page.evaluate(() => window.App.go('pos'));
  await new Promise(r => setTimeout(r, 2200));
  const cards = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.pcard').forEach(c => {
      const n = c.querySelector('.pc-name'), cd = c.querySelector('.pc-code');
      if (n) out.push({ name: (n.textContent || '').trim(), sub: cd ? (cd.textContent || '').trim() : '' });
    });
    return out.slice(0, 12);
  });
  ok('POS cards milti hain', cards.length > 0, cards.length + ' cards');
  const dupes = cards.filter(c => {
    const nw = c.name.toUpperCase().split(/\s+/).filter(w => w.length > 3);
    const sw = c.sub.toUpperCase().split(/\s+/).filter(w => w.length > 3);
    if (!sw.length) return false;
    const hit = sw.filter(w => nw.some(x => x.indexOf(w) === 0 || w.indexOf(x) === 0)).length;
    return (hit / sw.length) >= 0.6;
  });
  ok('kisi card par naam do baar nahi (deduplication kaam kar rahi hai)',
    dupes.length === 0, dupes.length ? JSON.stringify(dupes.slice(0, 2)) : cards[0] ? ('pehla: "' + cards[0].name + '" / "' + cards[0].sub + '"') : '-');

  /* ══════════════ ③ SIDEBAR COLLAPSE + FULLSCREEN ══════════════ */
  console.log('\n\x1b[1m③ Sidebar collapse / expand + full screen\x1b[0m');
  const wSide = () => page.evaluate(() =>
    Math.round(document.getElementById('sidebar').getBoundingClientRect().width));

  const before = await wSide();
  await page.evaluate(() => document.getElementById('sbCollapse').click());
  await new Promise(r => setTimeout(r, 600));           /* CSS transition .18s */
  const collapsed = await wSide();
  const nameHidden = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.sb-name')).display === 'none');
  await page.evaluate(() => document.getElementById('sbCollapse').click());
  await new Promise(r => setTimeout(r, 600));
  const after = await wSide();
  const sb = await page.evaluate(() => {
    const fs = document.getElementById('fsBtn');
    return { fsExists: !!fs, fsVisible: fs ? getComputedStyle(fs).display !== 'none' : false,
      railExists: !!document.getElementById('sbRail') };
  });
  sb.before = before; sb.collapsed = collapsed; sb.after = after; sb.nameHidden = nameHidden;
  ok('collapse karne par sidebar patla ho jata hai (248 → 64)',
    sb.collapsed < sb.before - 100, sb.before + 'px → ' + sb.collapsed + 'px');
  ok('collapsed mein brand ka naam chhup jata hai (sirf icon rail)',
    sb.nameHidden === true, 'sb-name hidden = ' + sb.nameHidden);
  ok('dobara expand ho jata hai (64 → 248)',
    sb.after > sb.collapsed + 100, sb.collapsed + 'px → ' + sb.after + 'px');
  ok('full screen button maujood aur nazar aata hai', sb.fsExists && sb.fsVisible);
  ok('desktop rail button (⇤) bhi maujood hai', sb.railExists);

  /* Ctrl+B shortcut */
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown',
    { key: 'b', ctrlKey: true, bubbles: true })));
  await new Promise(r => setTimeout(r, 400));
  const afterKey = await page.evaluate(() =>
    Math.round(document.getElementById('sidebar').getBoundingClientRect().width));
  ok('Ctrl+B se bhi collapse hota hai', afterKey < 150, afterKey + 'px');
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown',
    { key: 'b', ctrlKey: true, bubbles: true })));
  await new Promise(r => setTimeout(r, 300));

  /* ══════════════ ④ TYPOGRAPHY ══════════════
     v2.7: scale compact hua (user ki guidance: chart labels ~9–9.6px).
     Is liye ab do alag hadden hain:
       · CHART text (SVG <text>)  → kam se kam 9.2px   (compact, jaiz)
       · UI text   (HTML)         → kam se kam 10.8px  (parhne layak)
     ──────────────────────────────────────────────────────────────────────── */
  console.log('\n\x1b[1m④ Typography — compact scale (chart 9.2px+ / UI 10.8px+)\x1b[0m');
  const MIN_CHART = 9.2, MIN_UI = 10.8;
  for (const sc of ['settings', 'pos', 'items', 'dashboard']) {
    await page.evaluate(s => window.App.go(s), sc);
    await new Promise(r => setTimeout(r, 1200));
    const r = await page.evaluate((mc, mu) => {
      const badChart = [], badUi = [];
      document.querySelectorAll('#view *').forEach(el => {
        if (el.children.length || !el.textContent.trim()) return;
        const v = parseFloat(getComputedStyle(el).fontSize) || 0;
        if (!v) return;
        const inSvg = !!el.closest('svg');
        const tag = Math.round(v * 10) / 10 + 'px ' + el.textContent.trim().slice(0, 18);
        if (inSvg) { if (v < mc - 0.05) badChart.push(tag); }
        else if (v < mu - 0.05) badUi.push(tag);
      });
      return { badChart, badUi };
    }, MIN_CHART, MIN_UI);
    ok(sc + ': chart text >= ' + MIN_CHART + 'px, UI text >= ' + MIN_UI + 'px',
      r.badChart.length === 0 && r.badUi.length === 0,
      r.badChart.length ? 'CHART: ' + r.badChart.slice(0, 2).join(' | ')
        : r.badUi.length ? 'UI: ' + r.badUi.slice(0, 2).join(' | ') : 'sab hadd ke andar');
  }


  /* ══════════════ ⑤ ICON SIZE + TEXT LEGIBILITY ══════════════ */
  console.log('\n\x1b[1m⑤ Icons & text — size (user: "icone bohat small hain")\x1b[0m');
  await page.evaluate(() => window.App.go('dashboard'));
  await new Promise(r => setTimeout(r, 1800));
  const sizes = await page.evaluate(() => {
    const fs = el => el ? parseFloat(getComputedStyle(el).fontSize) : null;
    const nav = document.querySelector('.nav-item .ni');
    const kpi = document.querySelector('.kpi .k-ico');
    let tiny = 0, total = 0;
    document.querySelectorAll('#view *').forEach(el => {
      if (!el.children.length && el.textContent.trim()) {
        const v = parseFloat(getComputedStyle(el).fontSize);
        if (v) { total++; if (v < 13) tiny++; }   /* 12px = sirf chart labels */
      }
    });
    return { nav: fs(nav), kpi: fs(kpi), tiny: tiny, total: total };
  });
  ok('sidebar icon kam se kam 24px (pehle 20px tha)', sizes.nav >= 24, sizes.nav + 'px');
  ok('KPI icon kam se kam 26px (pehle 20px tha)', sizes.kpi === null || sizes.kpi >= 26,
    sizes.kpi === null ? 'is screen par KPI nahi' : sizes.kpi + 'px');

  /* har screen par: UI text 10.8px se chhota nahi; chart text 9.2px se nahi */
  const legibility = {};
  for (const sc of ['dashboard', 'pos', 'items', 'sales', 'settings']) {
    await page.evaluate(x => window.App.go(x), sc);
    await new Promise(r => setTimeout(r, 1300));
    legibility[sc] = await page.evaluate((mc, mu) => {
      let tinyUi = 0, tinyChart = 0, total = 0, worstUi = 99;
      document.querySelectorAll('#view *').forEach(el => {
        if (!el.children.length && el.textContent.trim()) {
          const v = parseFloat(getComputedStyle(el).fontSize);
          if (!v) return;
          total++;
          if (el.closest('svg')) { if (v < mc - 0.05) tinyChart++; }
          else { if (v < mu - 0.05) tinyUi++; if (v < worstUi) worstUi = v; }
        }
      });
      return { tiny: tinyUi + tinyChart, tinyUi, tinyChart, total,
        worst: worstUi === 99 ? null : worstUi };
    }, MIN_CHART, MIN_UI);
  }
  const bad = Object.keys(legibility).filter(k => legibility[k].tiny > 0);
  ok('UI text >= ' + MIN_UI + 'px, chart text >= ' + MIN_CHART + 'px (v2.7 compact scale)',
    bad.length === 0,
    bad.length ? bad.map(k => k + ':' + legibility[k].tiny + '/' + legibility[k].total).join(' ')
      : Object.keys(legibility).map(k => k + ' ✔').join(' '));


  /* ══════════════ ⑥ ICON MEANING (har screen ka apna icon) ══════════════ */
  console.log('\n\x1b[1m⑥ Icons — har screen ki apni pehchan\x1b[0m');
  console.log('   (pehle 📊 Dashboard AUR Reports dono ke liye tha — farq hi nahi chalta tha)');
  const icons = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.nav-item').forEach(n => {
      const svg = n.querySelector('.ni svg');
      out.push({
        label: n.textContent.trim().slice(0, 26),
        svg: !!svg,
        size: svg ? Math.round(svg.getBoundingClientRect().width) : 0,
        sig: svg ? Array.from(svg.querySelectorAll('path')).map(x => (x.getAttribute('d') || '').slice(0, 20)).join('|') : '',
        stroke: svg ? getComputedStyle(svg).stroke : ''
      });
    });
    return out;
  });
  ok('sidebar ke tamam icons SVG hain (emoji nahi)', icons.length > 0 && icons.every(i => i.svg),
    icons.filter(i => i.svg).length + '/' + icons.length);
  ok('har icon 24px ya bara hai', icons.every(i => !i.svg || i.size >= 24),
    'sab se chhota: ' + Math.min.apply(null, icons.map(i => i.size || 99)) + 'px');

  const sigSeen = {}, dups = [];
  icons.forEach(i => { if (!i.svg) return; if (sigSeen[i.sig]) dups.push(i.label + ' = ' + sigSeen[i.sig]); else sigSeen[i.sig] = i.label; });
  ok('KOI DO SCREENS KA ICON AIK JAISA NAHI (yehi asal shikayat thi)',
    dups.length === 0, dups.length ? dups.join(' | ') : icons.length + ' screens, sab alag shakl');
  ok('icon ka rang theme se aata hai (currentColor)',
    icons.every(i => !i.svg || /rgb/.test(i.stroke)), icons[0] ? icons[0].stroke : '-');


  /* ══════════════ ⑦ KPI + TAB ICONS bhi SVG honay chahiye ══════════════ */
  console.log('\n\x1b[1m⑦ KPI cards & tabs — SVG icons\x1b[0m');
  let kpiTot = 0, kpiSvg = 0, kpiMiss = [];
  for (const sc of ['dashboard', 'warehouse', 'insights', 'reports', 'accounting']) {
    await page.evaluate(x => window.App.go(x), sc);
    await new Promise(r => setTimeout(r, 1400));
    const q = await page.evaluate(() => {
      let tot = 0, sv = 0; const miss = [];
      document.querySelectorAll('#view .kpi').forEach(k => {
        tot++;
        const ico = k.querySelector('.k-ico');
        if (ico && ico.querySelector('svg')) sv++;
        else if (ico) miss.push(((k.querySelector('.k-label') || {}).textContent || '').trim().slice(0, 18)
          + '[' + (ico.textContent || '').trim() + ']');
      });
      return { tot, sv, miss };
    });
    kpiTot += q.tot; kpiSvg += q.sv; kpiMiss = kpiMiss.concat(q.miss);
  }
  ok('KPI cards ke icons SVG hain', kpiTot > 0 && kpiSvg === kpiTot,
    kpiSvg + '/' + kpiTot + (kpiMiss.length ? '  baqi: ' + kpiMiss.slice(0, 3).join(' ') : ''));

  await page.evaluate(() => window.App.go('settings'));
  await new Promise(r => setTimeout(r, 2000));
  const tabQ = await page.evaluate(() => {
    let tot = 0, sv = 0; const miss = [];
    document.querySelectorAll('#view .tab').forEach(t => {
      tot++;
      const ti = t.querySelector('.ti');
      if (ti && ti.querySelector('svg')) sv++;
      else if (ti) miss.push((ti.textContent || '').trim());
    });
    return { tot, sv, miss: [...new Set(miss)] };
  });
  ok('Settings ke tamam tabs/sub-tabs SVG icon dikhatay hain',
    tabQ.tot > 0 && tabQ.sv === tabQ.tot,
    tabQ.sv + '/' + tabQ.tot + (tabQ.miss.length ? '  baqi: ' + tabQ.miss.join(' ') : ''));


  /* ══════════════ ⑧ HAR SCREEN — buttons/headings mein emoji NAHI ══════════════ */
  console.log('\n\x1b[1m⑧ Har screen — buttons aur headings ab SVG (emoji nahi)\x1b[0m');
  const screens = await page.evaluate(() => Object.keys(window.App.screens || {}));
  let svgAll = 0; const leftEmoji = {};
  for (const sc of screens) {
    try {
      await page.evaluate(x => window.App.go(x), sc);
      await new Promise(r => setTimeout(r, 1200));
      const q = await page.evaluate(() => {
        let svg = 0; const m = {};
        document.querySelectorAll('#view .btn, #view .sec-head h4, #view .card-head h3, #view .card-head h4, #view .page-head h2')
          .forEach(el => {
            if (el.querySelector('svg')) { svg++; return; }
            const mm = ((el.textContent || '').trim()).match(/^(\p{Extended_Pictographic})/u);
            if (mm) m[mm[1]] = (m[mm[1]] || 0) + 1;
          });
        return { svg, m };
      });
      svgAll += q.svg;
      Object.keys(q.m).forEach(k => { leftEmoji[k] = (leftEmoji[k] || 0) + q.m[k]; });
    } catch (e) { /* aik screen fail ho to baqi chalte rahein */ }
  }
  const leftList = Object.keys(leftEmoji);
  ok('har screen ke buttons/headings SVG hain — koi emoji nahi bacha',
    leftList.length === 0,
    svgAll + ' SVG icons, ' + screens.length + ' screens' +
    (leftList.length ? '  |  baqi: ' + leftList.map(k => k + '×' + leftEmoji[k]).join(' ') : ''));

  /* ══════════════ ⑨ SIDEBAR COLLAPSED → HOVER FLYOUT ══════════════════════
     User: "left side menu bar toggles, ui is broken, it should be hidden and
     when mouse over it it shows while collapsed."
     v2.25.8 — USER NE FLYOUT REJECT KAR DIYA ("collapsed must actually reduce the
     width and hide the text labels while retaining the icons"). Ab rail hover par
     bhi 64px icons-only rehta hai; naam CSS tooltip (data-tip) mein aata hai.
     ──────────────────────────────────────────────────────────────────────── */
  console.log('\n\x1b[1m⑨ Sidebar collapsed → rail (icons-only, hover par bhi)\x1b[0m');
  {
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluate(() => { location.hash = '#/dashboard'; });
    await new Promise(r => setTimeout(r, 1200));
    const W = () => page.evaluate(() => {
      const sb = document.getElementById('sidebar');
      const main = document.querySelector('.main');
      const nm = document.querySelector('.sb-name');
      const lbl = sb.querySelector('.nav-item .sb-txt');
      const it = sb.querySelector('.nav-item');
      return {
        sb: Math.round(sb.getBoundingClientRect().width),
        mainX: Math.round(main.getBoundingClientRect().x),
        mainW: Math.round(main.getBoundingClientRect().width),
        nameShown: nm ? getComputedStyle(nm).display !== 'none' : null,
        lblRects: lbl ? lbl.getClientRects().length : -1,
        tip: it ? (it.getAttribute('data-tip') || '') : ''
      };
    });
    // expanded state
    const exp = await W();
    // collapse
    await page.evaluate(() => { const b = document.getElementById('sbCollapse'); if (b) b.click(); });
    await new Promise(r => setTimeout(r, 700));
    const col = await W();
    ok('collapsed: rail sirf 64px (chhupi hui)', col.sb <= 68, col.sb + 'px');
    ok('collapsed: menu ke naam chhupe hote hain', col.nameShown === false, 'display:none');
    ok('collapsed: content ko 64px zyada jagah milti hai',
      col.mainW > exp.mainW, exp.mainW + 'px → ' + col.mainW + 'px');
    // HOVER → rail wahi rehni chahiye (v2.25.8: flyout nahi)
    await page.hover('#sidebar');
    await new Promise(r => setTimeout(r, 700));
    const fly = await W();
    ok('hover: rail 64px hi rehti hai (purani 248px flyout nahi)', fly.sb <= 68, fly.sb + 'px');
    ok('hover: labels chhupe rehte hain (rects 0) — sirf icons',
      fly.nameShown === false && fly.lblRects === 0, 'nameShown=' + fly.nameShown + ' lblRects=' + fly.lblRects);
    ok('hover: naam tooltip (data-tip) se milta hai', !!fly.tip, 'data-tip="' + fly.tip + '"');
    ok('hover: content ko dhakka nahi lagta (rail layout stable)',
      fly.mainX === col.mainX, 'main x ' + col.mainX + ' → ' + fly.mainX);
    // hover hatayein
    await page.mouse.move(1100, 500);
    await new Promise(r => setTimeout(r, 700));
    const back = await W();
    ok('hover hatane par bhi rail wahi (64px, names hidden)',
      back.sb <= 68 && back.nameShown === false && back.lblRects === 0,
      back.sb + 'px, names hidden, lblRects=' + back.lblRects);
  }

  /* ══════════════ ⑩ PURCHASE ORDER — multi-column + English titles ══════════
     User: "Purchase order page improve... many fields truncating, overlapping.
     Use multi columns to manage data and save space. Use English titles
     (Urdu only as hint)."
     ──────────────────────────────────────────────────────────────────────── */
  console.log('\n\x1b[1m⑩ Purchase Order — multi-column, English titles, koi truncation\x1b[0m');
  {
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluate(() => { location.hash = '#/purchase'; });
    await new Promise(r => setTimeout(r, 1600));
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button,.btn')].find(x => /new po/i.test(x.textContent));
      if (b) b.click();
    });
    await new Promise(r => setTimeout(r, 1600));
    const po = await page.evaluate(() => {
      const dr = document.querySelector('.drawer');
      if (!dr) return { found: false };
      const fg = dr.querySelector('.form-grid.c3');
      const kids = fg ? [...fg.children] : [];
      const ys = [...new Set(kids.map(k => Math.round(k.getBoundingClientRect().y)))];
      const enLabels = kids.map(k => (k.querySelector('label') || {}).textContent || '').filter(Boolean);
      const urHints = kids.map(k => (k.querySelector('.hint') || {}).textContent || '')
        .filter(h => /[؀-ۿ]/.test(h));
      return {
        found: true,
        drawerW: Math.round(dr.getBoundingClientRect().width),
        cols: fg ? getComputedStyle(fg).gridTemplateColumns.split(' ').filter(x => parseFloat(x) > 1).length : 0,
        rows: ys.length,
        fields: kids.length,
        enLabels, urHints: urHints.length,
        clipped: kids.filter(k => { const i = k.querySelector('input,select,textarea');
          return i && i.scrollWidth > i.clientWidth + 2; }).length,
        hScroll: dr.scrollWidth > dr.clientWidth + 2
      };
    });
    ok('PO drawer khulta hai', po.found === true);
    ok('PO drawer chauda (520px se zyada — pehle items table kuchalta tha)',
      po.drawerW >= 900, po.drawerW + 'px');
    ok('PO form multi-column (3 columns)', po.cols === 3, po.cols + ' columns');
    ok('PO fields 2+ lines mein bante hain (jaga bachi)', po.rows >= 2, po.rows + ' rows');
    ok('PO titles ENGLISH mein', po.enLabels.length >= 6 &&
      po.enLabels.every(l => /^[A-Za-z0-9 ()\/\-\.]+$/.test(l)), po.enLabels.slice(0, 3).join(' | '));
    ok('Urdu sirf HINT mein hai (title mein nahi)', po.urHints >= 4, po.urHints + ' Urdu hints');
    ok('PO mein koi field truncate nahi hota', po.clipped === 0, po.clipped + ' clipped');
    ok('PO drawer mein horizontal scroll nahi', po.hScroll === false);

    // supplier select → balance card multi-column
    await page.evaluate(() => {
      const s = document.getElementById('f_supplierId');
      if (s) { const o = [...s.options].find(x => x.value); s.value = o.value;
        s.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await new Promise(r => setTimeout(r, 2200));
    const bal = await page.evaluate(() => {
      const pb = document.querySelector('.party-bal');
      if (!pb || pb.style.display === 'none') return { visible: false };
      const rows = pb.querySelector('.pb-rows');
      const cells = rows ? [...rows.children] : [];
      return { visible: true, multiCol: !!rows, cells: cells.length,
        sameLine: cells.length > 1 && cells.every(c =>
          Math.round(c.getBoundingClientRect().y) === Math.round(cells[0].getBoundingClientRect().y)),
        fit: rows ? (rows.scrollWidth <= rows.clientWidth + 2) : true,
        en: cells.map(c => (c.querySelector('span') || {}).textContent || ''),
        urTooltips: cells.filter(c => /[؀-ۿ]/.test(c.getAttribute('title') || '')).length };
    });
    ok('supplier card multi-column grid mein', bal.visible && bal.multiCol && bal.cells >= 3,
      (bal.cells || 0) + ' cells');
    /* v2.30.6: N10 ne card ki rows barha di (contact/address/limit live) —
       ab multi-row grid BY DESIGN hai; sahi contract = koi horizontal overflow nahi */
    ok('supplier card fields grid mein fit (koi overflow nahi)', bal.fit === true, 'fit=' + bal.fit);
    ok('supplier card English titles + Urdu tooltips',
      bal.en && bal.en.some(x => /^[A-Za-z]/.test(x)) && bal.urTooltips >= 3,
      (bal.en || []).slice(0, 2).join(' | '));

    // ek item add kar ke items line ki truncation check
    await page.evaluate(() => {
      const pi = [...document.querySelectorAll('.drawer input[type=text]')]
        .find(i => /Item dhoondain/i.test(i.placeholder || ''));
      if (pi) { pi.value = 'flam'; pi.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    await new Promise(r => setTimeout(r, 2600));
    await page.evaluate(() => { const it = document.querySelector('.gs-item'); if (it) it.click(); });
    await new Promise(r => setTimeout(r, 1400));
    const line = await page.evaluate(() => {
      const l = document.querySelector('.po-line');
      if (!l) return { found: false };
      const nm = l.querySelector('.pl-name b');
      return { found: true, name: nm.textContent,
        w: Math.round(nm.getBoundingClientRect().width),
        truncated: nm.scrollWidth > nm.clientWidth + 2 };
    });
    ok('PO item ka POORA naam dikhta hai (kat-ta nahi)',
      line.found && line.truncated === false, (line.name || '') + ' — ' + (line.w || 0) + 'px');
    await page.evaluate(() => { const x = document.querySelector('.drawer .x'); if (x) x.click(); });
    await new Promise(r => setTimeout(r, 600));
  }

  /* ══════════════ ⑪ SETTINGS — alignment, English titles, tooltips ══════════
     User: "Settings & Configuration still needs polish... many fields zig-zag,
     not aligned even though sections have space. English titles, hints in
     Urdu and English, plus tooltips."
     ROOT CAUSE (is test ne pakra): Styles.html me DUPLICATE `.f-grid` rule
     `repeat(auto-fit, minmax(180px,1fr))` — auto-fit KHALI tracks hata deta
     tha, to jis section me jitne fields utne COLUMNS → har section alag
     chaurai → zig-zag. Theek: auto-FILL (columns container se bante hain).
     ──────────────────────────────────────────────────────────────────────── */
  console.log('\n\x1b[1m⑪ Settings — alignment (koi zig-zag), English titles, tooltips\x1b[0m');
  {
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluate(() => { location.hash = '#/settings'; });
    await new Promise(r => setTimeout(r, 2200));
    const nTabs = await page.evaluate(() => document.querySelectorAll('.tabbar-l1 .tab').length);
    let grids = 0, misaligned = 0, clipped = 0, tips = 0, biHints = 0, enHeads = 0, urTips = 0;
    const colCounts = new Set();
    for (let t = 0; t < nTabs; t++) {
      await page.evaluate(i => { const tb = document.querySelectorAll('.tabbar-l1 .tab')[i]; if (tb) tb.click(); }, t);
      await new Promise(r => setTimeout(r, 950));
      const nSub = await page.evaluate(() => document.querySelectorAll('.tabbar-l2 .tab').length);
      for (let s = 0; s < Math.max(nSub, 1); s++) {
        if (nSub) {
          await page.evaluate(i => { const tb = document.querySelectorAll('.tabbar-l2 .tab')[i]; if (tb) tb.click(); }, s);
          await new Promise(r => setTimeout(r, 620));
        }
        const r = await page.evaluate(() => {
          const gs = [...document.querySelectorAll('.cfg-secs .f-grid')];
          const counts = new Set(gs.map(g => getComputedStyle(g).gridTemplateColumns
            .split(' ').filter(x => parseFloat(x) > 1).length));
          return { n: gs.length, counts: [...counts],
            clip: [...document.querySelectorAll('.cfg-secs input,.cfg-secs select,.cfg-secs textarea')]
              .filter(i => i.scrollWidth > i.clientWidth + 2).length,
            tips: document.querySelectorAll('.f-col label[title],.frs-label[title]').length,
            bi: document.querySelectorAll('.f-hint.bi').length,
            heads: [...document.querySelectorAll('.sec-head h4')].map(x => x.textContent.trim()),
            /* N.B. Urdu yahan ROMAN-URDU (Latin script) hai — is liye Arabic
               range se match nahi hota. Asli check: tooltip me heading se
               ZYADA matn ho (yani Urdu counterpart juda hua ho). */
            urTip: [...document.querySelectorAll('.sec-head h4[title]')]
              .filter(x => (x.getAttribute('title') || '').trim() !== x.textContent.trim()).length };
        });
        grids += r.n;
        if (r.counts.length > 1) misaligned++;
        r.counts.forEach(c => colCounts.add(c));
        clipped += r.clip; tips += r.tips; biHints += r.bi; urTips += r.urTip;
        enHeads += r.heads.filter(h => /^[0-9A-Za-z①-⑩ ()\/·&\-\.,]/.test(h)).length;
      }
    }
    ok('Settings: HAR section ka grid EK JITNE columns (koi zig-zag nahi)',
      misaligned === 0, misaligned + ' misaligned / ' + grids + ' grids');
    ok('Settings: columns container se bante hain (field-count se nahi)',
      colCounts.size <= 2, 'column counts seen: ' + [...colCounts].join(','));
    ok('Settings: koi field truncate nahi hota', clipped === 0, clipped + ' clipped');
    ok('Settings: har field par TOOLTIP', tips >= 200, tips + ' tooltips');
    ok('Settings: hints dono zabanon mein (Urdu + English)', biHints >= 20, biHints + ' bilingual hints');
    ok('Settings: headings English mein', enHeads >= 40, enHeads + ' English headings');
    ok('Settings: asli (Urdu) heading tooltip me mehfooz', urTips >= 5,
      urTips + ' headings jin ka tooltip EN + Urdu dono rakhta hai');
  }

  /* -------------------------------------------------------------------
     ⑫ v2.24.1 — Demand form: khaali (empty) boxes nahi
     Bug: `type:'el'` rows ka wrapper `.f-col.full` ko border/padding milta
     hai; andar wala note `hidden` hota tha magar WRAPPER visible reh jata
     tha → form mein khaali strip. Ab wrapper bhi sync hota hai.
     ------------------------------------------------------------------- */
  console.log('\n\x1b[1m⑫ Demand form — khaali boxes / hidden-note wrappers\x1b[0m');
  {
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluate(() => { App.go('demands'); });
    await new Promise(r => setTimeout(r, 1600));
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /^New Demand$/i.test((x.textContent || '').trim()));
      if (b) b.click();
    });
    await new Promise(r => setTimeout(r, 1800));

    const measure = () => page.evaluate(() => {
      const t = [...document.querySelectorAll('.modal-scrim')].pop();
      if (!t) return { open: false };
      const emptyBoxes = [...t.querySelectorAll('.f-col')].filter(el => {
        if (el.offsetParent === null) return false;
        if ((el.innerText || '').trim()) return false;
        /* koi asli control (vo jinke apna text nahi hota) — to box khaali nahi */
        return !el.querySelector('input, select, textarea, button');
      }).map(el => ({ cls: String(el.className), h: Math.round(el.getBoundingClientRect().height) }));
      const badWrappers = [...t.querySelectorAll('.f-el-row')].filter(col => {
        const inner = col.firstElementChild;
        return inner && inner.hidden && getComputedStyle(col).display !== 'none';
      }).map(col => String(col.firstElementChild && col.firstElementChild.className));
      const elRows = t.querySelectorAll('.f-el-row').length;
      const notes = [...t.querySelectorAll('.f-note')]
        .filter(n => n.offsetParent !== null)
        .map(n => (n.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 30));
      return { open: true, emptyBoxes, badWrappers, elRows, notes };
    });

    let m = await measure();
    ok('Demand modal khula (khaali-box check ke liye)', m.open === true, JSON.stringify(m.open));
    ok('Demand form mein KOI khaali bordered box nahi (hidden note wrapper bhi chhupa)',
      m.open && m.emptyBoxes.length === 0, JSON.stringify(m.emptyBoxes));
    ok('hidden note ka wrapper (f-el-row) bhi display:none — attribute par bharosa nahi',
      m.open && m.elRows >= 4 && m.badWrappers.length === 0,
      JSON.stringify({ elRows: m.elRows, bad: m.badWrappers }));
    ok('data-aware note panels nazar aate hain aur unme text hai',
      m.open && m.notes.length >= 2 && m.notes.every(t => t.length > 3), JSON.stringify(m.notes));

    /* customer pick → walk-in note chhup jata hai, phir bhi zero khaali box */
    const picked = await page.evaluate(async () => {
      const i = document.querySelector('.modal-scrim #f_customerId');
      if (!i) return false;
      i.focus(); i.value = 'Ahmad'; i.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 1200));
      const r = i.closest('.f-col').querySelector('.f-search-results .f-sr');
      if (r) { r.click(); return true; }
      return false;
    });
    await new Promise(r => setTimeout(r, 1000));
    m = await measure();
    ok('customer pick ke baad bhi zero khaali box (walk-in note theek se chhupa)',
      picked && m.open && m.emptyBoxes.length === 0 && m.badWrappers.length === 0,
      JSON.stringify({ picked, empty: m.emptyBoxes, bad: m.badWrappers }));

    await page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 400));
    await page.evaluate(() => document.querySelectorAll('.modal-scrim,.drawer').forEach(x => x.remove()));
    await new Promise(r => setTimeout(r, 300));
  }

  /* ======================================================================
     v2.25.0 (req 6) — SHARED DIALOGS: native confirm()/prompt() ka khatma.
     User ki shikayat: "cancel button, close button not working in many popups".
     Root cause: kai jagah native confirm/prompt thay — sandboxed preview/iframe
     mein wo BLOCK hote hain (kuch hota hi nahi tha) aur design system se bahar
     thay. Ab: UI2.confirm (promise-aware) + UI2.askCode + UI2.copyText.
     ====================================================================== */
  const dlg = await page.evaluate(async () => {
    const out = {};
    out.fns = { askCode: typeof UI2.askCode, copyText: typeof UI2.copyText, confirm: typeof UI2.confirm };

    /* (1) askCode — Enter par value, Cancel par null (native prompt ka replacement) */
    const p1 = UI2.askCode({ title: 'Test code' });
    await new Promise(r => setTimeout(r, 350));
    const mEl = document.querySelector('.modal-scrim .modal2');
    const inp = mEl ? mEl.querySelector('input.f-input') : null;
    out.ask = { opened: !!mEl, input: !!inp,
      fs: inp ? getComputedStyle(inp).fontSize : '',
      minH: inp ? getComputedStyle(inp).minHeight : '' };
    if (inp) {
      out.ask.focused = document.activeElement === inp;
      inp.value = 'ABC-123';
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    }
    out.askVal = await p1;
    await new Promise(r => setTimeout(r, 400));
    out.askClosed = !document.querySelector('.modal-scrim .modal2');

    /* (2) askCode — Cancel par null aur modal band */
    const p2 = UI2.askCode({ title: 'Test cancel' });
    await new Promise(r => setTimeout(r, 300));
    const m2 = document.querySelector('.modal-scrim .modal2');
    const cancel = m2 ? [].slice.call(m2.querySelectorAll('.m-foot button')).find(x => /Cancel/i.test(x.textContent || '')) : null;
    if (cancel) cancel.click();
    out.cancelVal = await p2;
    await new Promise(r => setTimeout(r, 350));
    out.cancelClosed = !document.querySelector('.modal-scrim .modal2');

    /* (3) confirm — Yes par true, Cancel par false (awaited guards) */
    const y = UI2.confirm('Test confirm?');
    await new Promise(r => setTimeout(r, 300));
    const my = document.querySelector('.modal-scrim .modal2');
    const yb = my ? [].slice.call(my.querySelectorAll('.m-foot button')).find(x => /^\s*Yes\s*$/.test((x.textContent || '').trim())) : null;
    if (yb) yb.click();
    out.confirmYes = await y;
    const n = UI2.confirm('Test confirm 2?');
    await new Promise(r => setTimeout(r, 300));
    const mn = document.querySelector('.modal-scrim .modal2');
    const nb = mn ? [].slice.call(mn.querySelectorAll('.m-foot button')).find(x => /Cancel/i.test(x.textContent || '')) : null;
    if (nb) nb.click();
    out.confirmNo = await n;

    /* (4) copyText — clipboard block ho to selectable box (native prompt nahi) */
    window.__copyFallback = null;
    const realClip = navigator.clipboard;
    try { Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }); } catch (e) { }
    UI2.copyText('https://example.com/app', 'Test link');
    await new Promise(r => setTimeout(r, 350));
    const mc = document.querySelector('.modal-scrim .modal2');
    out.copy = { box: !!mc, readonly: !!(mc && mc.querySelector('input[readonly]')),
      val: mc && mc.querySelector('input[readonly]') ? mc.querySelector('input[readonly]').value : '' };
    if (mc) { const x = mc.querySelector('.m-foot button'); if (x) x.click(); }
    try { Object.defineProperty(navigator, 'clipboard', { value: realClip, configurable: true }); } catch (e) { }
    await new Promise(r => setTimeout(r, 300));
    return out;
  });
  ok('shared dialogs maujood hain (askCode / copyText / confirm — ek hi design system)',
    dlg.fns.askCode === 'function' && dlg.fns.copyText === 'function' && dlg.fns.confirm === 'function',
    JSON.stringify(dlg.fns));
  ok('UI2.askCode — native prompt ki jagah: modal khulta hai, 16px input + autofocus, Enter par value wapas',
    dlg.ask && dlg.ask.opened && dlg.ask.input && dlg.ask.focused && dlg.ask.fs === '16px' && dlg.askVal === 'ABC-123' && dlg.askClosed,
    JSON.stringify({ ask: dlg.ask, val: dlg.askVal, closed: dlg.askClosed }));
  ok('UI2.askCode — Cancel par null (aur modal band, atka nahi)',
    dlg.cancelVal === null && dlg.cancelClosed, JSON.stringify({ v: dlg.cancelVal, closed: dlg.cancelClosed }));
  ok('UI2.confirm — Yes = true, Cancel = false (awaited guards sach mein rukte hain)',
    dlg.confirmYes === true && dlg.confirmNo === false, JSON.stringify({ yes: dlg.confirmYes, no: dlg.confirmNo }));
  ok('UI2.copyText — clipboard block hone par native prompt NAHI, selectable box',
    dlg.copy && dlg.copy.box && dlg.copy.readonly && /example\.com/.test(dlg.copy.val || ''), JSON.stringify(dlg.copy));

  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log(`  UI POLISH (rendered)   PASS: ${pass}   FAIL: ${fail}`);
  if (fail) failures.forEach(f => console.log('   ✖ ' + f));
  console.log('══════════════════════════════════════════════════════════════════');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('✖ ' + e.message); process.exit(1); });
