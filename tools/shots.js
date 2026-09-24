/**
 * shots.js — har screen ka real-browser screenshot (Chromium / puppeteer).
 *   node tools/shots.js [outDir] [width] [height]
 * Design QA ke liye: asli layout, asli fonts, asli overlap — jsdom se nahi dikhta.
 */
const puppeteer = require('puppeteer');
const { login } = require('./_harness');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, process.argv[2] || 'shots');
const W = Number(process.argv[3] || 1440), H = Number(process.argv[4] || 900);

const SCREENS = [
  ['dashboard', 'Dashboard'], ['pos', 'POS'], ['sales', 'Sales history'],
  ['items', 'Items'], ['inventory', 'Inventory'], ['warehouse', 'Warehouse'],
  ['parties', 'Parties'], ['purchase', 'Purchase'], ['reorder', 'Auto reorder'],
  ['orders', 'Orders'], ['takeorder', 'Take order'], ['accounting', 'Accounting'],
  ['money', 'Payments & cash'], ['shop', 'Shop open/close'], ['reports', 'Reports'],
  ['insights', 'Insights'], ['users', 'Users & security'], ['settings', 'Settings']
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
    defaultViewport: { width: W, height: H, deviceScaleFactor: 1 }
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  const DARK = process.argv.indexOf('--dark') > -1;
  await page.goto('file://' + path.join(ROOT, 'demo', 'index.html'), { waitUntil: 'load' });
  await login(page);            /* poll + login (shared harness) */
  await new Promise(r => setTimeout(r, 900));
  if (DARK) {
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await new Promise(r => setTimeout(r, 500));
  }

  /* kuch screens ki "deep" shot: andar ka tab bhi khul kar (e.g. Settings ▸ Data & tools ▸ Maintenance) */
  const DEEP = {
    settings: [['.tabbar-l1 .tab', /Data & tools/i], ['.tabbar-l2 .tab', /Maintenance/i]]
  };

  const results = [];
  for (const [id, label] of SCREENS) {
    try {
      await page.evaluate(s => window.App.go(s), id);
      await new Promise(r => setTimeout(r, 1400));
      for (const step of (DEEP[id] || [])) {
        await page.evaluate((sel, src) => {
          const rx = new RegExp(src, 'i');
          const b = Array.from(document.querySelectorAll(sel)).find(x => rx.test(x.textContent || ''));
          if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        }, step[0], step[1].source);
        await new Promise(r => setTimeout(r, 1500));
      }
      const file = path.join(OUT, id + '.png');
      await page.screenshot({ path: file });
      /* layout sanity — real browser measurements */
      const m = await page.evaluate(() => {
        const vw = window.innerWidth, out = { overflow: 0, tiny: 0, clipped: 0, dupIds: 0 };
        document.querySelectorAll('#view *').forEach(el => {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.right > vw + 2) out.overflow++;
          if (el.matches('button, .btn, .tab, select, input') && r.height > 0 && r.height < 28) out.tiny++;
          if (el.children.length === 0 && el.scrollWidth > el.clientWidth + 4 && getComputedStyle(el).overflow === 'visible'
            && getComputedStyle(el).textOverflow !== 'ellipsis' && el.clientWidth > 0) out.clipped++;
        });
        const ids = {}, dups = [];
        document.querySelectorAll('[id]').forEach(e => { ids[e.id] = (ids[e.id] || 0) + 1; });
        Object.keys(ids).forEach(k => { if (ids[k] > 1) dups.push(k); });
        out.dupIds = dups.length;
        out.dupList = dups.slice(0, 6).join(',');
        out.hScroll = document.documentElement.scrollWidth > window.innerWidth + 2;
        return out;
      });
      results.push({ id, label, ok: true, ...m });
      console.log(`  ✔ ${id.padEnd(11)} overflow:${m.overflow} tiny:${m.tiny} clipped:${m.clipped} dupIds:${m.dupIds} hScroll:${m.hScroll ? 'YES' : 'no'}`);
    } catch (e) {
      results.push({ id, label, ok: false, err: e.message });
      console.log(`  ✖ ${id}: ${e.message}`);
    }
  }
  fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify({ viewport: { W, H }, results, errs }, null, 2));
  console.log('\nshots →', path.relative(ROOT, OUT), '| js errors:', errs.length);
  errs.slice(0, 8).forEach(e => console.log('   ! ' + e));
  await browser.close();
})();
