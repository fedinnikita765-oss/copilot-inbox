const { chromium } = require('playwright');
const path = require('path');
const ROOT = path.join(__dirname, '..');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 640, height: 300 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message + ' | ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  await page.route('**/fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto('file://' + (process.argv[2] || path.join(ROOT, '..', 'neon-tide.html')));
  await page.waitForFunction(() => window.__neon && window.__neon.GAME.state === 'menu', null, { timeout: 120000 });
  const ev = (f, a) => page.evaluate(f, a);
  const step = (n, dt) => ev(([n, dt]) => window.__neon.step(n, dt), [n, dt || 1 / 30]);
  const log = (k, v) => console.log(k.padEnd(28), JSON.stringify(v));
  await ev(() => window.__neon.startGame(true));
  await step(60);
  log('start', await ev(() => { const n = window.__neon; return { mode: n.player.mode, mis: n.MS.idx, si: n.MS.si, money: n.save.money }; }));
  // walk with keys
  await page.keyboard.down('KeyW'); await step(30); await page.keyboard.up('KeyW');
  log('walked', await ev(() => { const n = window.__neon; return { x: n.player.x.toFixed(1), z: n.player.z.toFixed(1), y: n.player.y.toFixed(2) }; }));
  // punch nearby ped
  await ev(() => { const n = window.__neon; const p = n.peds[0]; p.state = 'walk'; p.x = n.player.x + Math.sin(n.player.h) * 1; p.z = n.player.z + Math.cos(n.player.h) * 1; });
  await page.keyboard.press('KeyE'); await step(30);
  log('punch', await ev(() => { const n = window.__neon; return { state: n.peds[0] && n.peds[0].state, stars: n.wanted.stars, heat: n.wanted.heat.toFixed(2) }; }));
  // enter the mission car
  await ev(() => { const n = window.__neon; n.player.x = 293.5; n.player.z = -24; });
  await step(2);
  await ev(() => window.__neon.tryEnterExit());
  await step(5);
  log('entered', await ev(() => { const n = window.__neon; return { mode: n.player.mode, si: n.MS.si }; }));
  await page.keyboard.down('KeyW'); await step(120); 
  log('drive', await ev(() => { const c = window.__neon.player.car; return { x: c.x.toFixed(1), z: c.z.toFixed(1), kmh: (c.speed * 3.6).toFixed(0), hp: c.health.toFixed(0) }; }));
  await page.keyboard.down('KeyD'); await page.keyboard.down('Space'); await step(40); await page.keyboard.up('Space'); await page.keyboard.up('KeyD');
  await page.keyboard.up('KeyW'); await step(60);
  log('drift', await ev(() => { const c = window.__neon.player.car; return { x: c.x.toFixed(1), z: c.z.toFixed(1), kmh: (c.speed * 3.6).toFixed(0), hp: c.health.toFixed(0) }; }));
  // mission 0: teleport to garage
  await ev(() => { const n = window.__neon; const c = n.player.car; c.x = n.SPOT.garage.x; c.z = n.SPOT.garage.z; c.vx = c.vz = 0; });
  await step(10);
  log('m0 done', await ev(() => { const n = window.__neon; return { mis: n.MS.idx, saveMis: n.save.mission, money: n.save.money }; }));
  // paint shop with wanted
  await ev(() => { const n = window.__neon; n.setWanted(2); const c = n.player.car; const s = n.SPOT.shops[0]; c.x = s.x; c.z = s.z; c.vx = c.vz = 0; n.save.money += 500; });
  await step(10);
  log('paint shop', await ev(() => { const n = window.__neon; return { stars: n.wanted.stars, money: n.save.money }; }));
  // police chase
  await ev(() => { const n = window.__neon; const c = n.player.car; c.x = n.roadC(3); c.z = n.roadC(4) - 20; c.h = 0; n.setWanted(3); });
  await step(300);
  log('chase', await ev(() => { const n = window.__neon; const d = n.police.map(p => Math.hypot(p.car.x - n.player.x, p.car.z - n.player.z).toFixed(0)); return { police: n.police.length, d, stars: n.wanted.stars, bust: n.wanted.bustT.toFixed(2), alive: !n.player.dead }; }));
  await step(300);
  log('chase2', await ev(() => { const n = window.__neon; const d = n.police.map(p => Math.hypot(p.car.x - n.player.x, p.car.z - n.player.z).toFixed(0)); return { police: n.police.length, d, stars: n.wanted.stars, dead: n.player.dead, mode: n.player.mode }; }));
  await page.waitForTimeout(4500);
  await step(5);
  log('after bust?', await ev(() => { const n = window.__neon; return { dead: n.player.dead, x: n.player.x.toFixed(0), z: n.player.z.toFixed(0), money: n.save.money, stars: n.wanted.stars }; }));
  await ev(() => window.__neon.clearWanted());
  // mission 1
  await ev(() => { const n = window.__neon; if (n.player.mode === 'car') n.tryEnterExit(); const s = n.missionStartSpot(1); n.player.x = s.x; n.player.z = s.z; n.MS.needLeave = false; });
  await step(5);
  log('m1 start', await ev(() => { const n = window.__neon; return { mis: n.MS.idx, si: n.MS.si, target: n.MS.target }; }));
  for (let k = 0; k < 2; k++) { await ev(() => { const n = window.__neon; if (n.MS.target) { n.player.x = n.MS.target.x; n.player.z = n.MS.target.z; } }); await step(5); }
  log('m1 end', await ev(() => { const n = window.__neon; return { mis: n.MS.idx, saveMis: n.save.mission, money: n.save.money }; }));
  // mission 2 race
  await ev(() => { const n = window.__neon; const s = n.missionStartSpot(2); n.player.x = s.x; n.player.z = s.z; n.MS.needLeave = false; });
  await step(5);
  log('m2 start', await ev(() => { const n = window.__neon; return { mis: n.MS.idx, si: n.MS.si }; }));
  await ev(() => { const n = window.__neon; const c = n.cars.filter(c => !c.wrecked).sort((a, b) => Math.hypot(a.x - n.player.x, a.z - n.player.z) - Math.hypot(b.x - n.player.x, b.z - n.player.z))[0]; n.player.x = c.x + 1; n.player.z = c.z; n.tryEnterExit(); });
  await step(120);
  for (let k = 0; k < 10; k++) { await ev(() => { const n = window.__neon; const c = n.player.car; if (c && n.MS.target) { c.x = n.MS.target.x; c.z = n.MS.target.z; c.vx = c.vz = 0; } }); await step(4); }
  log('m2 end', await ev(() => { const n = window.__neon; return { mis: n.MS.idx, saveMis: n.save.mission, money: n.save.money, mode: n.player.mode }; }));
  // mission 3 rival
  await ev(() => { const n = window.__neon; const s = n.missionStartSpot(3); const c = n.player.car; c.x = s.x; c.z = s.z; c.vx = c.vz = 0; n.MS.needLeave = false; });
  await step(5);
  await step(120);
  log('m3 rival', await ev(() => { const n = window.__neon; const r = n.MS.target; return { mis: n.MS.idx, si: n.MS.si, target: r && [r.x.toFixed(0), r.z.toFixed(0)] }; }));
  await ev(() => { const n = window.__neon; const t = n.cars.find(c => c.mission === 'target'); t.damage(40); });
  await step(60);
  log('m3 panic', await ev(() => { const n = window.__neon; const t = n.cars.find(c => c.mission === 'target'); return { stars: n.wanted.stars, hp: t.health, wrecked: t.wrecked }; }));
  await ev(() => { const n = window.__neon; const t = n.cars.find(c => c.mission === 'target'); t.damage(500); });
  await step(200);
  await ev(() => window.__neon.clearWanted());
  await step(10);
  log('m3 end', await ev(() => { const n = window.__neon; return { mis: n.MS.idx, saveMis: n.save.mission, money: n.save.money }; }));
  // mission 4 heist
  await ev(() => { const n = window.__neon; const s = n.missionStartSpot(4); n.player.x = s.x; n.player.z = s.z; if (n.player.car) { n.player.car.x = s.x; n.player.car.z = s.z; n.player.car.vx = n.player.car.vz = 0; } n.MS.needLeave = false; });
  await step(5);
  for (let k = 0; k < 4; k++) { await ev(() => { const n = window.__neon; const t = n.MS.target; const c = n.player.car; if (t) { if (c) { c.x = t.x; c.z = t.z; c.vx = c.vz = 0; } else { n.player.x = t.x; n.player.z = t.z; } } }); await step(4); }
  log('m4 bags', await ev(() => { const n = window.__neon; return { mis: n.MS.idx, si: n.MS.si, stars: n.wanted.stars }; }));
  await ev(() => window.__neon.clearWanted()); await step(4);
  await ev(() => { const n = window.__neon; const t = n.MS.target; const c = n.player.car; if (t) { if (c) { c.x = t.x; c.z = t.z; c.vx = c.vz = 0; } else { n.player.x = t.x; n.player.z = t.z; } } }); await step(6);
  log('m4 end', await ev(() => { const n = window.__neon; return { mis: n.MS.idx, saveMis: n.save.mission, money: n.save.money }; }));
  // courier
  await ev(() => { const n = window.__neon; const s = n.missionStartSpot(5); const c = n.player.car; if (c) { c.x = s.x; c.z = s.z; c.vx = c.vz = 0; } else { n.player.x = s.x; n.player.z = s.z; } n.MS.needLeave = false; });
  await step(5);
  for (let k = 0; k < 2; k++) { await ev(() => { const n = window.__neon; const t = n.MS.target; const c = n.player.car; if (t) { if (c) { c.x = t.x; c.z = t.z; c.vx = c.vz = 0; } else { n.player.x = t.x; n.player.z = t.z; } } }); await step(4); }
  log('courier', await ev(() => { const n = window.__neon; return { mis: n.MS.idx, money: n.save.money }; }));
  // run over a pedestrian and explode the car
  await ev(() => { const n = window.__neon; const c = n.player.car; if (!c) return; const p = n.peds.find(p => p.state === 'walk'); if (p) { p.x = c.x + Math.sin(c.h) * 4; p.z = c.z + Math.cos(c.h) * 4; } c.vx = Math.sin(c.h) * 15; c.vz = Math.cos(c.h) * 15; });
  await step(20);
  log('ran over', await ev(() => { const n = window.__neon; return { stars: n.wanted.stars, heat: n.wanted.heat.toFixed(2), pickups: n.pickups.length }; }));
  await ev(() => { const n = window.__neon; const c = n.player.car; if (c) c.damage(500); });
  await step(200);
  log('exploded', await ev(() => { const n = window.__neon; return { dead: n.player.dead, mode: n.player.mode }; }));
  await page.waitForTimeout(4500); await step(5);
  log('respawn', await ev(() => { const n = window.__neon; return { dead: n.player.dead, hp: n.player.health, x: n.player.x.toFixed(0), money: n.save.money, cars: n.cars.length, peds: n.peds.length, police: n.police.length }; }));
  // long soak
  await page.keyboard.down('KeyW'); await step(900, 1 / 30); await page.keyboard.up('KeyW');
  log('soak', await ev(() => { const n = window.__neon; return { cars: n.cars.length, peds: n.peds.length, hours: n.DAY.hours.toFixed(2) }; }));
  console.log('console errors (' + logs.length + '):\n' + logs.slice(0, 30).join('\n'));
  if (logs.length) process.exitCode = 1;
  await browser.close();
})().catch((e) => { console.error('TEST FAILED', e); process.exit(1); });
