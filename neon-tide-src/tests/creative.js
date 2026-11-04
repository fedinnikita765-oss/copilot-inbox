// Creative mode + weather test: node tests/creative.js <built.html> [shotsDir]
// Starts creative mode from the menu (touch), uses the build UI, places ramps / barrels / cars / people, drives a car up a
// ramp, blows up barrels (crash and gunshot), undo / redo, saves and reloads builds, toggles every weather type, checks the
// story save is untouched and that everything works with localStorage blocked. Screenshots: build UI, catalog,
// rainy night street, foggy morning. Fails on any console error or warning.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const FILE = path.resolve(process.argv[2] || path.join(ROOT, '..', 'neon-tide.html'));
const SHOTS = path.resolve(process.argv[3] || path.join(ROOT, 'shots'));
fs.mkdirSync(SHOTS, { recursive: true });
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
let fails = 0;
const check = (name, ok, info) => { console.log((ok ? 'ok   ' : 'FAIL ') + name.padEnd(34), info === undefined ? '' : JSON.stringify(info)); if (!ok) fails++; };

async function openPage(browser, opts) {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 320 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  if (opts && opts.blockStorage) {
    await ctx.addInitScript(() => {
      const thrower = () => { throw new DOMException('blocked', 'SecurityError'); };
      Object.defineProperty(window, 'localStorage', { get: thrower, configurable: true });
    });
  }
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message + ' | ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  await page.route('**/fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto('file://' + FILE);
  await page.waitForFunction(() => window.__neon && window.__neon.GAME.state === 'menu', null, { timeout: 120000 });
  return { ctx, page, logs };
}
const shot = async (page, name, hideHud) => {
  if (hideHud) await page.evaluate(() => { document.getElementById('hud').style.visibility = 'hidden'; });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(SHOTS, name), timeout: 120000 });
  if (hideHud) await page.evaluate(() => { document.getElementById('hud').style.visibility = ''; });
  console.log('     screenshot', path.join(SHOTS, name));
};

(async () => {
  const browser = await chromium.launch({ args: ARGS });
  let { page, logs } = await openPage(browser);
  const ev = (f, a) => page.evaluate(f, a);
  const step = (n, dt) => ev(([n, dt]) => window.__neon.step(n, dt), [n, dt || 1 / 30]);
  const storyBefore = await ev(() => localStorage.getItem('neon-tide-save-v1'));

  // ---- enter creative mode from the menu ----
  await page.tap('#creativeBtn');
  await page.waitForTimeout(1200);
  await step(5);
  let st = await ev(() => { const n = window.__neon, C = n.CREATIVE; return { mode: n.GAME.mode, b: C.building, hud: n.HUD.mode, items: C.items.length, god: n.GAME.cheats.god, ui: !document.getElementById('ctRoot').classList.contains('off'), place: !document.getElementById('bCtPlace').classList.contains('hidden'), punch: document.getElementById('bPunch').classList.contains('hidden') }; });
  check('creative starts in build mode', st.mode === 'creative' && st.b && st.hud === 'creative' && st.ui && st.place && st.punch, st);
  check('first run loads the example park', st.items > 20, st.items);
  await shot(page, 'creative-build.png');

  // ---- catalog via touch, place a barrel with the Place button ----
  await ev(() => { const C = window.__neon.CREATIVE; C.flyTo(-120, 12, -40, 0, 0.42); C.setWorld({ traffic: 0, peds: 0.5, weather: 'clear', hour: 13 }); });
  await step(3);
  await page.tap('#ctPick');
  await page.waitForTimeout(300);
  await page.tap('#ctCatalog .chip[data-v="obst"]');
  await page.waitForTimeout(200);
  await shot(page, 'creative-catalog.png');
  await page.locator('#ctCatalog .ct-card', { hasText: 'Взрывная бочка' }).tap();
  await step(2);
  const n0 = await ev(() => window.__neon.CREATIVE.items.length);
  await page.tap('#bCtPlace');
  await step(2);
  st = await ev(() => { const C = window.__neon.CREATIVE, it = C.items[C.items.length - 1]; return { n: C.items.length, k: it.k.id, x: it.x, z: it.z, sheet: C.S.sheet }; });
  check('catalog + place button', st.n === n0 + 1 && st.k === 'barrel' && st.sheet === null, st);
  await page.tap('#bCtRot'); await step(1);
  check('rotate button turns the ghost', await ev(() => Math.abs(window.__neon.CREATIVE.S.rotOff - Math.PI / 12) < 1e-6));
  await page.tap('#ctUndo'); await step(1);
  check('undo removes the barrel', (await ev(() => window.__neon.CREATIVE.items.length)) === n0);
  await page.tap('#ctRedo'); await step(1);
  check('redo puts it back', (await ev(() => window.__neon.CREATIVE.items.length)) === n0 + 1);

  // ---- a little test track on the empty avenue x = -120 ----
  st = await ev(() => {
    const n = window.__neon, C = n.CREATIVE;
    C.add({ k: 'ramp_m', x: -120, z: 0, r: 0 });
    C.add({ k: 'barrel', x: -126, z: 26 });
    C.add({ k: 'barrel', x: -114, z: 30 });
    C.add({ k: 'car_suv', x: -122, z: 30, r: Math.PI / 2 });
    C.add({ k: 'car_sedan', x: -120, z: -24, r: 0 });
    C.add({ k: 'ped', x: -110, z: 8 }); C.add({ k: 'cop', x: -110, z: 12 });
    C.add({ k: 'plat_lo', x: -134, z: 0 }); C.add({ k: 'ring', x: -120, z: 16, l: 1 }); C.add({ k: 'boost', x: -125.5, z: -14 });
    C.add({ k: 'wall', x: -104, z: -6, r: Math.PI / 4 }); C.add({ k: 'cone', x: -116, z: -8 }); C.add({ k: 'palm', x: -106, z: 20 }); C.add({ k: 'lamp', x: -107, z: -20 });
    const g = (x, z) => +n.groundH(x, z).toFixed(2);
    return { h0: g(-120, -3.9), hMid: g(-120, 0), hTop: g(-120, 3.9), plat: g(-134, 0), cars: C.items.filter((i) => i.k.t === 'car').length, peds: n.peds.filter((p) => p.ct).length, cols: n.CG.cells.reduce((a, c) => a + c.filter((o) => o.tag === 'cr').length, 0) };
  });
  check('ramp & platform surfaces (GROUND_HOOKS)', st.h0 < 0.2 && Math.abs(st.hMid - 1.75) < 0.1 && st.hTop > 3.3 && Math.abs(st.plat - 2) < 0.25, st);
  check('cars and people spawned', st.cars >= 4 && st.peds >= 6, st);
  check('colliders registered', st.cols > 10, st.cols);

  // ---- play: drive the sedan up the ramp ----
  await page.tap('#ctPlayBtn');
  await step(2);
  st = await ev(() => { const n = window.__neon; return { b: n.CREATIVE.building, hud: n.HUD.mode, dead: n.player.dead, vis: n.player.root.visible, ov: !!n.cam.override }; });
  check('play mode', !st.b && st.hud === 'foot' && !st.dead && st.vis && !st.ov, st);
  await ev(() => { const n = window.__neon; const it = n.CREATIVE.items.find((i) => i.k.id === 'car_sedan'); n.player.x = it.ent.x + 2; n.player.z = it.ent.z; n.tryEnterExit(); });
  await step(2);
  check('entered the placed sedan', await ev(() => window.__neon.player.mode === 'car'));
  await page.keyboard.down('KeyW');
  let maxY = 0, onRamp = 0;
  for (let i = 0; i < 160; i++) {
    const s = await ev(([n]) => { const N = window.__neon; N.step(n, 1 / 30); const c = N.player.car; return { y: c.y, z: c.z }; }, [i < 15 ? 4 : 1]);
    if (s.z > -4 && s.z < 4.5) { onRamp++; maxY = Math.max(maxY, s.y); }
    if (s.z > 8) break;
  }
  await page.keyboard.up('KeyW');
  st = await ev(() => { const c = window.__neon.player.car; return { z: +c.z.toFixed(1), y: +c.y.toFixed(2), kmh: Math.round(c.speed * 3.6) }; });
  check('car climbed the ramp', maxY > 2.6 && st.z > 4, { maxY: +maxY.toFixed(2), onRamp, end: st });

  // ---- a platform wall stops a car that is not on top of it ----
  st = await ev(() => { const n = window.__neon, c = n.player.car; c.x = -146; c.z = 0; c.h = Math.PI / 2; c.y = 0; c.vx = 14; c.vz = 0; n.step(45, 1 / 30); return { x: +c.x.toFixed(2), y: +c.y.toFixed(2) }; });
  check('platform side blocks cars', st.x < -137.4 && st.y < 0.6, st);

  // ---- barrels: crash into one, shoot another ----
  await ev(() => { window.__neon.__boom = 0; window.__neon.EV.on('explosion', () => { window.__neon.__boom++; }); });
  await ev(() => { const n = window.__neon, c = n.player.car; c.x = -126; c.z = 14; c.h = 0; c.y = 0; c.vx = 0; c.vz = 16; });
  await step(30);
  st = await ev(() => { const n = window.__neon, C = n.CREATIVE, bs = C.items.filter((i) => i.k.id === 'barrel' && i.x < -120); const suv = C.items.find((i) => i.k.id === 'car_suv'); return { gone: bs.map((b) => b.p.gone), boom: n.__boom, suv: Math.round(suv.ent.health), hp: Math.round(n.player.car.health), dead: n.player.dead }; });
  check('crash detonates a barrel', st.gone[0] === true && st.boom >= 1, st);
  check('explosion hurts nearby cars, god mode protects', st.suv < 100 && st.hp >= 100 && !st.dead, st);
  await ev(() => { const n = window.__neon; if (n.player.mode === 'car') n.tryEnterExit(); });
  await step(3);
  st = await ev(() => {
    const n = window.__neon, b = n.CREATIVE.items.find((i) => i.k.id === 'barrel' && i.x > -116);
    const o = { x: b.p.x + 10, y: 1.2, z: b.p.z + 1 }, dx = b.p.x - o.x, dy = b.p.y - o.y, dz = b.p.z - o.z, l = Math.hypot(dx, dy, dz);
    n.fireBullet({ x: o.x, y: o.y, z: o.z, dx: dx / l, dy: dy / l, dz: dz / l, range: 80, damage: 20, shooter: 'player' });
    return b.id;
  });
  await step(6);
  check('a bullet detonates a barrel', await ev((id) => window.__neon.CREATIVE.S.byId.get(id).p.gone, st));

  // ---- back to build: the world resets, undo/redo of a placement ----
  await page.tap('#ctBuildBtn');
  await step(3);
  st = await ev(() => { const n = window.__neon, C = n.CREATIVE; return { b: C.building, hud: n.HUD.mode, barrels: C.items.filter((i) => i.k.id === 'barrel').map((i) => i.p.gone), sedan: !!C.items.find((i) => i.k.id === 'car_sedan').ent.dead }; });
  check('build mode resets barrels and cars', st.b && st.hud === 'creative' && st.barrels.every((g) => !g) && !st.sedan, st);
  const cnt = await ev(() => window.__neon.CREATIVE.items.length);
  await ev(() => window.__neon.CREATIVE.undo());
  const cntU = await ev(() => window.__neon.CREATIVE.items.length);
  await ev(() => window.__neon.CREATIVE.redo());
  check('undo / redo of placements', cntU === cnt - 1 && (await ev(() => window.__neon.CREATIVE.items.length)) === cnt, { cnt, cntU });
  // select tool: tap-to-select at the screen centre, rotate + delete via the HUD buttons
  await ev(() => { const C = window.__neon.CREATIVE; C.flyTo(-120, 6, -14, 0, 0.48); });
  await page.tap('#ctToolSel'); await step(3);
  st = await ev(() => { const C = window.__neon.CREATIVE; return { tool: C.S.tool, sel: C.S.sel && C.S.sel.k.id }; });
  check('select tool targets an item', st.tool === 'select' && !!st.sel, st);
  const before = await ev(() => window.__neon.CREATIVE.items.length);
  await page.tap('#bCtPlace'); await step(2);
  check('delete in select mode', (await ev(() => window.__neon.CREATIVE.items.length)) === before - 1);
  await page.tap('#ctUndo'); await page.tap('#ctToolPlace'); await step(2);

  // ---- save / clear / load a named build through the UI ----
  await page.tap('#ctFilesBtn'); await page.waitForTimeout(200);
  await page.fill('#ctNameIn', 'Тест трамплин');
  await page.tap('#ctSaveBtn'); await page.waitForTimeout(200);
  const saved = await ev(() => window.__neon.CREATIVE.listBuilds().map((b) => [b.name, b.items.length]));
  check('build saved', saved.length >= 1 && saved[0][0] === 'Тест трамплин' && saved[0][1] === cnt, saved);
  for (let i = 0; i < 3 && !(await page.isVisible('#ctClearYes')); i++) { await page.tap('#ctClearBtn'); await page.waitForTimeout(300); }
  for (let i = 0; i < 3 && (await page.isVisible('#ctClearYes')); i++) { await page.tap('#ctClearYes'); await page.waitForTimeout(300); }
  await step(2);
  check('clear all', (await ev(() => window.__neon.CREATIVE.items.length)) === 0);
  await page.tap('#ctFilesBtn'); await page.waitForTimeout(200);
  await page.locator('#ctFiles .ct-row .ghost', { hasText: 'Загрузить' }).first().tap();
  await step(2);
  check('build loaded', (await ev(() => window.__neon.CREATIVE.items.length)) === cnt);
  await page.tap('#ctUndo'); await step(1);
  check('loading is undoable', (await ev(() => window.__neon.CREATIVE.items.length)) === 0);
  await page.tap('#ctRedo'); await step(60); // also lets the autosave run

  // ---- weather through the world panel ----
  await page.tap('#ctWorldBtn'); await page.waitForTimeout(200);
  const wx = {};
  for (const w of ['clear', 'cloudy', 'rain', 'storm', 'fog']) {
    await page.tap('#ctWorld .chip[data-v="' + w + '"]');
    await step(240);
    wx[w] = await ev(() => { const A = window.__neon.ATMO; return { t: A.type, rain: +A.cur.rain.toFixed(2), fog: +A.cur.fog.toFixed(2), dark: +A.cur.dark.toFixed(2), wet: +A.wet.toFixed(2), wind: +A.cur.wind.toFixed(2), far: Math.round(window.__neon.scene.fog.far) }; });
  }
  check('weather: clear', wx.clear.t === 'clear' && wx.clear.rain < 0.05 && wx.clear.dark < 0.05, wx.clear);
  check('weather: cloudy', wx.cloudy.t === 'cloudy' && wx.cloudy.dark > 0.2 && wx.cloudy.rain < 0.05, wx.cloudy);
  check('weather: rain (wet streets)', wx.rain.t === 'rain' && wx.rain.rain > 0.6 && wx.rain.wet > 0.6, wx.rain);
  check('weather: storm (wind)', wx.storm.t === 'storm' && wx.storm.rain > 0.9 && wx.storm.wind > 3, wx.storm);
  check('weather: fog', wx.fog.t === 'fog' && wx.fog.fog < 0.3 && wx.fog.far < 220, wx.fog);
  await page.tap('#ctWorld .chip[data-v="noPolice"]'); await page.tap('#ctWorld .chip[data-v="1.5"]'); await page.tap('#ctWorld .ct-x');
  st = await ev(() => { const n = window.__neon; return { np: n.GAME.cheats.noPolice, q: n.getQ().traffic, ts: n.GAME.timeScale }; });
  check('world toggles', st.np === true && st.q > 0, st);
  await ev(() => window.__neon.CREATIVE.setWorld({ noPolice: false, traffic: 0.5 }));

  // ---- screenshots: rainy night street and foggy morning (select tool: no placement ghost in the picture) ----
  await page.tap('#ctToolSel');
  await ev(() => { const n = window.__neon, C = n.CREATIVE; C.setWorld({ weather: 'rain', hour: 22.5, freeze: true }); n.ATMO.set('rain', true); C.flyTo(201, 1.9, -150, 0.03, -0.02); });
  await step(30);
  await shot(page, 'rain-night.png', true);
  await ev(() => { const n = window.__neon, C = n.CREATIVE; C.setWorld({ weather: 'fog', hour: 7.2 }); n.ATMO.set('fog', true); C.flyTo(288, 2.4, -62, 0.12, -0.03); });
  await step(30);
  await shot(page, 'fog-morning.png', true);
  await ev(() => window.__neon.CREATIVE.setWorld({ weather: 'clear', hour: 13, freeze: false }));
  await step(70);

  // ---- reload: the creative world comes back, the story save is untouched ----
  const itemsBefore = await ev(() => window.__neon.CREATIVE.items.length);
  await page.reload();
  await page.waitForFunction(() => window.__neon && window.__neon.GAME.state === 'menu', null, { timeout: 120000 });
  const storyAfter = await ev(() => localStorage.getItem('neon-tide-save-v1'));
  check('story save untouched', storyAfter === storyBefore || (storyBefore === null && (storyAfter === null || JSON.parse(storyAfter).mission === 0 && JSON.parse(storyAfter).money === 300)), { before: storyBefore && storyBefore.slice(0, 60), after: storyAfter && storyAfter.slice(0, 60) });
  await page.tap('#creativeBtn'); await page.waitForTimeout(1000); await step(3);
  st = await ev(() => { const C = window.__neon.CREATIVE; return { n: C.items.length, builds: C.listBuilds().length, b: C.building }; });
  check('creative world restored after reload', st.n === itemsBefore && st.builds >= 1 && st.b, st);
  const logs1 = logs.slice();
  await page.context().close();

  // ---- storage blocked: creative mode still works (memory only) ----
  ({ page, logs } = await openPage(browser, { blockStorage: true }));
  await page.tap('#creativeBtn'); await page.waitForTimeout(1000);
  st = await page.evaluate(() => {
    const n = window.__neon, C = n.CREATIVE; n.step(5, 1 / 30);
    const k = C.items.length; C.add({ k: 'ramp_s', x: -120, z: 0 }); C.saveBuild('Без хранилища'); C.clearAll(); C.loadBuild(0);
    n.step(60, 1 / 30);
    return { k, after: C.items.length, builds: C.listBuilds().length, storeOK: C.S.storeOK };
  });
  check('works with localStorage blocked', st.after === st.k + 1 && st.builds === 1 && st.storeOK === false, st);
  const all = logs1.concat(logs);
  console.log('console errors (' + all.length + '):\n' + all.slice(0, 30).join('\n'));
  await browser.close();
  if (all.length || fails) { console.error('CREATIVE TEST FAILED (' + fails + ' checks, ' + all.length + ' console messages)'); process.exit(1); }
  console.log('OK');
})().catch((e) => { console.error('TEST FAILED', e); process.exit(1); });
