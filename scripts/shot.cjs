// Screenshots of the game on a phone screen, from a save fixture.
//
//   npm run build && node scripts/shot.cjs city --tab recycle --layer city --out /tmp/shots/city.png
//
// The first argument is a fixture name from tests/fixtures (or a path to any save JSON).
//   --tab dump|upgrades|recycle|auto|journal|settings   open a tab
//   --layer recycle|sorting|city                        open a view on the Layers tab
//   --click <css>        click an element (repeatable, in order)
//   --tap <css>@x,y      tap inside an element at fractions of its width (x and y both of width,
//                        as the town plan counts them), e.g. --tap .town-canvas@0.5,0.62
//   --wait <ms>          wait before the shot (default 800)
//   --el <css>           shoot only this element, otherwise the phone screen
//   --full               the whole page instead of one screen (fixed panels then sit at its bottom)
//   --out <path>         where to write (default /tmp/shots/<fixture>.png)
//   --debug              open with the debug panel on
// Starts `vite preview` on port 4181 if nothing answers there, and stops it after.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 4181;
const URL = `http://localhost:${PORT}/scrap-idle/`;
const root = path.resolve(__dirname, '..');

function parse(argv) {
  const o = { fixture: argv[0], steps: [], wait: 800 };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    const v = () => argv[++i];
    if (a === '--tab') o.steps.push({ click: `#tab-${v()}` });
    else if (a === '--layer') o.steps.push({ click: `#layer-${v()}` });
    else if (a === '--click') o.steps.push({ click: v() });
    else if (a === '--tap') o.steps.push({ tap: v() });
    else if (a === '--wait') o.wait = Number(v());
    else if (a === '--el') o.el = v();
    else if (a === '--out') o.out = v();
    else if (a === '--debug') o.debug = true;
    else if (a === '--full') o.full = true;
    else throw new Error(`unknown argument ${a}`);
  }
  if (!o.fixture) throw new Error('usage: node scripts/shot.cjs <fixture> [options]');
  return o;
}

async function up() {
  try {
    return (await fetch(URL)).ok;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await up()) return null;
  if (!fs.existsSync(path.join(root, 'dist/index.html'))) throw new Error('no dist: run npm run build first');
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore', detached: true });
  for (let i = 0; i < 50; i++) {
    if (await up()) return server;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('vite preview did not start');
}

(async () => {
  const o = parse(process.argv.slice(2));
  const file = fs.existsSync(o.fixture) ? o.fixture : path.join(root, 'tests/fixtures', `${o.fixture}.json`);
  const save = JSON.parse(fs.readFileSync(file, 'utf8'));
  // A tick in the future: no "while you were gone" screen.
  save.lastTick = Date.now() + 1e9;
  const out = o.out ?? `/tmp/shots/${path.basename(file, '.json')}.png`;
  fs.mkdirSync(path.dirname(out), { recursive: true });

  const server = await ensureServer();
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
    page.on('pageerror', (e) => console.log('page error:', e.message));
    // Seed once per tab: pagehide would otherwise write the live game over the fixture on reload.
    await page.addInitScript(([s]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      localStorage.setItem('scrap-idle-save', s);
      localStorage.setItem('scrap-idle-intro-sorting', '1');
      localStorage.setItem('scrap-idle-intro-noise', '1');
    }, [JSON.stringify(save)]);
    await page.goto(URL + (o.debug ? '?debug' : ''));
    await page.waitForTimeout(800);
    const hideToasts = () => page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => (t.style.display = 'none')));
    for (const step of o.steps) {
      await hideToasts();
      if (step.click) {
        // Centre it first: scrolled only just into view, the fixed tab bar covers it.
        await page.$eval(step.click, (e) => e.scrollIntoView({ block: 'center' }));
        await page.click(step.click);
      }
      else {
        const [sel, at] = step.tap.split('@');
        const [fx, fy] = at.split(',').map(Number);
        const box = await page.$eval(sel, (e) => {
          const r = e.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width };
        });
        await page.mouse.click(box.x + box.w * fx, box.y + box.w * fy);
      }
      await page.waitForTimeout(300);
    }
    await hideToasts();
    await page.waitForTimeout(o.wait);
    if (o.el) await (await page.$(o.el)).screenshot({ path: out });
    else await page.screenshot({ path: out, fullPage: !!o.full });
    console.log(out);
  } finally {
    await browser.close();
    if (server) process.kill(-server.pid);
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
