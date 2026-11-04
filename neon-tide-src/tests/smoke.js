const { chromium } = require('playwright');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const THREE_MIN = path.join(ROOT, 'node_modules/three/build/three.min.js');
(async () => {
  let failed = false;
  const files = process.argv.slice(2).length ? process.argv.slice(2).map((f) => path.resolve(f)) : [path.join(ROOT, '..', 'neon-tide.html'), path.join(ROOT, 'dist/neon-tide.cdn.html')];
  for (const file of files) {
    const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const ctx = await browser.newContext({ viewport: { width: 640, height: 300 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const logs = [];
    page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
    await page.route('**/fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.route('**/cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', path: THREE_MIN }));
    await page.goto('file://' + file);
    await page.waitForFunction(() => window.__neon && window.__neon.GAME.state === 'menu', null, { timeout: 120000 });
    await page.tap('#playBtn');
    await page.waitForTimeout(1500);
    // touch: tap the stick zone and a button
    await page.touchscreen.tap(120, 230);
    await page.tap('#bJump');
    await page.evaluate(() => window.__neon.step(200, 1 / 30));
    const st = await page.evaluate(() => { const n = window.__neon; return { state: n.GAME.state, mis: n.MS.idx, cars: n.cars.length, peds: n.peds.length, title: document.title }; });
    console.log(path.relative(ROOT, file), JSON.stringify(st), 'console errors:', logs.length, logs.slice(0, 5).join(' | '));
    if (logs.length || st.state !== 'play') failed = true;
    await browser.close();
  }
  if (failed) { console.error('SMOKE TEST FAILED'); process.exit(1); }
  console.log('OK');
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
