// Models & driving check (owner C): people lineup with combat poses, every car type, interior, damage, ramp jump.
//   node tests/models.js <neon-tide.html> [outDir] [--only people,poses,cars,interior,damage]
// Prints vertex / draw-call numbers, checks airborne physics on a GROUND_HOOKS ramp, saves screenshots to outDir.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const file = path.resolve(args[0] || path.join(ROOT, '..', 'neon-tide.html'));
const outDir = path.resolve(args[1] && !args[1].startsWith('--') ? args[1] : path.join(ROOT, 'dist', 'models'));
const oi = args.indexOf('--only'), only = oi >= 0 ? args[oi + 1].split(',') : null;
const want = (k) => !only || only.includes(k);
fs.mkdirSync(outDir, { recursive: true });
let failed = false;
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failed = true; };
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 800, height: 450 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message + ' | ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  await page.route('**/fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto('file://' + file);
  await page.waitForFunction(() => window.__neon && window.__neon.GAME.state === 'menu', null, { timeout: 120000 });
  const ev = (f, a) => page.evaluate(f, a);
  await ev(() => { const n = window.__neon; n.startGame(false, 'creative'); n.DAY.hours = 16.3; n.DAY.envT = 99; document.getElementById('hud').style.display = 'none'; });
  await ev(() => window.__neon.step(2, 1 / 30));

  // ---------- numbers ----------
  const stats = await ev(() => {
    const n = window.__neon, out = { cars: {}, people: {} };
    for (const t of ['coupe', 'sedan', 'suv', 'muscle', 'pickup', 'van', 'supercar', 'bus', 'taxi', 'police']) {
      const c = new n.Car(t); c.place(0, 400, 0);
      let meshes = 0, verts = 0;
      c.root.traverse((o) => { if (o.isMesh && o.visible) { meshes++; verts += o.geometry.attributes.position.count; } });
      const G = c.G;
      out.cars[t] = { drawCalls: meshes, verts, body: G.body.attributes.position.count, eye: G.eye.map((v) => +v.toFixed(2)), roof: +G.roofY.toFixed(2), morphs: G.body.morphAttributes.position.length };
      c.setInteriorVisible(true);
      let im = 0; c.interior.traverse((o) => { if (o.isMesh) im++; }); out.cars[t].interiorCalls = im;
      c.remove();
    }
    const vc = []; for (let i = 0; i < 60; i++) { const H = n.buildHuman(n.randomLook()); vc.push(H.mesh.geometry.attributes.position.count); H.dispose(); }
    const hero = n.buildHuman(Object.assign({}, n.COP_LOOK, { hero: false })); const cop = hero.mesh.geometry.attributes.position.count; hero.dispose();
    out.people = { min: Math.min(...vc), avg: Math.round(vc.reduce((a, b) => a + b, 0) / vc.length), max: Math.max(...vc), cop, hero: n.player.H.mesh.geometry.attributes.position.count, bones: n.player.H.bones.length };
    return out;
  });
  for (const t in stats.cars) console.log(t.padEnd(9), JSON.stringify(stats.cars[t]));
  console.log('people   ', JSON.stringify(stats.people));
  check(Object.values(stats.cars).every((c) => c.drawCalls <= 13), 'draw calls per car ≤ 13');
  check(stats.people.max <= 3500, 'pedestrian vertices ≤ 3500 (max ' + stats.people.max + ')');
  check(Object.values(stats.cars).every((c) => c.morphs === 5 && c.eye[1] > 0.8 && c.eye[1] < c.roof), 'damage morphs and driver eye below the roof');

  // ---------- physics: gears, ramp jump via GROUND_HOOKS, landing ----------
  const phys = await ev(() => {
    const n = window.__neon, X = n.roadC(3) + 3.9, Z0 = 40;
    for (const c of n.cars.slice()) if (Math.abs(c.x - X) < 30) c.remove();
    n.GROUND_HOOKS.push((x, z) => (Math.abs(x - X) < 2.6 && z > Z0 && z < Z0 + 8 ? (z - Z0) / 8 * 1.6 : -Infinity));
    const c = new n.Car('sedan'); c.place(X, Z0 - 70, 0); c.driver = 'player';
    const inp = { throttle: 1, brake: 0, steer: 0, hand: false, nitro: false };
    let flew = false, tAir = 0, maxY = 0, land = 0, gears = new Set(), maxRpm = 0;
    for (let i = 0; i < 240; i++) {
      if (c.speed > 25) inp.throttle = 0;
      c.physics(inp, 1 / 30); c.sync(1 / 30);
      gears.add(c.gear); maxRpm = Math.max(maxRpm, c.rpm);
      if (c.air) { flew = true; tAir += 1 / 30; }
      maxY = Math.max(maxY, c.y); if (c.landImpact) { land = Math.max(land, c.landImpact); c.landImpact = 0; }
    }
    const r = { flew, tAir: +tAir.toFixed(2), maxY: +maxY.toFixed(2), land: +land.toFixed(1), gears: [...gears].sort(), maxRpm: Math.round(maxRpm), hp: Math.round(c.health), z: Math.round(c.z - Z0) };
    c.remove(); n.GROUND_HOOKS.pop();
    return r;
  });
  console.log('ramp     ', JSON.stringify(phys));
  check(phys.flew && phys.tAir > 0.3 && phys.maxY > 1.7, 'car leaves the ramp and flies (' + phys.tAir + ' s, top ' + phys.maxY + ' m)');
  check(phys.land > 3, 'landing impact registered (' + phys.land + ' m/s)');
  check(phys.gears.length >= 3 && phys.maxRpm > 3000, 'gearbox shifts (' + phys.gears.join(',') + ', max rpm ' + phys.maxRpm + ')');

  // ---------- screenshots ----------
  const shoot = async (name, setup) => {
    await ev(setup);
    await ev(() => window.__neon.step(3, 1 / 30));
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(outDir, name + '.png'), timeout: 180000 });
    console.log('shot     ', name);
  };
  // stage: clear the area east of the plaza
  await ev(() => {
    const n = window.__neon; const x0 = n.SPOT.plaza.x + 40, z0 = n.SPOT.plaza.z;
    window.__stage = { x0, z0 };
    for (const c of n.cars.slice()) if (Math.hypot(c.x - x0, c.z - z0) < 70) c.remove();
    for (const p of n.peds.slice()) p.remove();
    n.player.x = x0 - 25; n.player.z = z0 - 30; n.player.root.visible = false;
    window.__cam = (px, py, pz, tx, ty, tz, fov) => { n.cam.override = () => { n.camera.position.set(px, py, pz); n.camera.lookAt(tx, ty, tz); if (n.camera.fov !== fov) { n.camera.fov = fov; n.camera.updateProjectionMatrix(); } }; };
    // stand-in weapon models in the documented hand frame (+Z barrel, +Y up)
    const THREE = window.THREE, mat = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.5, metalness: 0.6 });
    window.__gun = (H, kind) => {
      const g = new THREE.Group(), b = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); g.add(m); };
      if (kind === 'pistol') { b(0.03, 0.035, 0.17, 0, 0.035, 0.06); b(0.028, 0.09, 0.035, 0, -0.01, -0.005); }
      else if (kind === 'twohand') { b(0.04, 0.06, 0.62, 0, 0.04, 0.12); b(0.03, 0.08, 0.035, 0, -0.01, 0); b(0.035, 0.1, 0.05, 0, 0.0, 0.15); b(0.04, 0.07, 0.22, 0, 0.02, -0.25); }
      else { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.016, 0.85, 8), new THREE.MeshStandardMaterial({ color: 0xb08850, roughness: 0.6 })); m.rotation.x = Math.PI / 2; m.position.z = 0.3; g.add(m); }
      H.bones[11].add(g);
    };
  });
  if (want('people')) {
    await shoot('people_lineup', () => {
      const n = window.__neon, { x0, z0 } = window.__stage;
      const looks = [n.COP_LOOK, Object.assign({}, n.randomLook(), { gender: 'f', top: 'dress', bottom: 'skirt', hairStyle: 'long', shirt: '#ffd23f', shirtPat: 'floral' })];
      looks.push(Object.assign({}, n.randomLook(), { gender: 'm', top: 'hoodie', outer: '#2f3e46', hairStyle: 'curly', hat: null }));
      looks.push(Object.assign({}, n.randomLook(), { gender: 'f', top: 'jacket', outer: '#8b1e3f', bottom: 'pants', hairStyle: 'pony' }));
      looks.push(Object.assign({}, n.randomLook(), { gender: 'm', age: 'old', top: 'shirt', hairStyle: 'balding', hair: '#cfc6b8', belly: 0.8, glasses: true }));
      looks.push(Object.assign({}, n.randomLook(), { gender: 'f', top: 'tank', bottom: 'shorts', hairStyle: 'bun', sunglasses: true }));
      looks.push(Object.assign({}, n.randomLook(), { gender: 'm', top: 'jacket', outer: '#1c1c22', hat: '#d7263d', hatStyle: 'cap', beard: true }));
      looks.push(Object.assign({}, n.randomLook(), { gender: 'f', top: 'hoodie', outer: '#ff8a3d', bottom: 'skirt', hairStyle: 'bob', hat: '#1d3557', hatStyle: 'beanie' }));
      window.__peds = looks.map((lk, i) => { const p = new n.Ped(lk, x0 + (i - 3.5) * 0.95, z0); p.state = 'idle'; p.h = 0; p.anim.speed = 0; return p; });
      window.__cam(x0 + 0.4, 1.5, z0 + 5.2, x0 + 0.1, 0.95, z0, 50);
    });
    await shoot('people_close', () => { const { x0, z0 } = window.__stage; window.__cam(x0 - 2.4, 1.5, z0 + 1.75, x0 - 2.4, 1.3, z0, 45); });
  }
  if (want('poses')) {
    await ev(() => { for (const p of (window.__peds || [])) p.remove(); window.__peds = []; });
    const setupPoses = () => {
      const n = window.__neon, { x0, z0 } = window.__stage;
      const mk = (look, x, a) => { const p = new n.Ped(look, x0 + x, z0); p.state = 'idle'; p.h = 0; Object.assign(p.anim, a); if (a.weapon && a.weapon !== 'none') window.__gun(p.H, a.weapon); window.__peds.push(p); return p; };
      const hero = Object.assign({}, n.randomLook(), { gender: 'm', top: 'openShirt', shirt: '#ffffff', shirtPat: 'floral', inner: '#f4f1ea', pants: '#e9e2d0', pantsPat: 'fabric', hairStyle: 'quiff', sunglasses: true, hat: null });
      mk(hero, -3.0, { weapon: 'pistol', aim: 1, aimYaw: 0.25, aimPitch: 0.05 });
      mk(n.COP_LOOK, -1.6, { weapon: 'twohand', aim: 1, aimYaw: -0.2, aimPitch: 0.0 });
      mk(n.randomLook(), -0.2, { weapon: 'melee', aim: 1 });
      mk(n.COP_LOOK, 1.2, { weapon: 'pistol', aim: 1, crouch: 0.8, aimYaw: 0.15 });
      mk(Object.assign({}, n.randomLook(), { top: 'hoodie' }), 2.6, { weapon: 'twohand', aim: 0.9, reload: 0.45 });
      mk(n.randomLook(), 4.0, { speed: 3.0, dir: 1.57, weapon: 'pistol', aim: 1, aimYaw: -0.1 });
      mk(n.randomLook(), 5.4, { speed: 1.7, dir: Math.PI, breath: 1 });
    };
    await ev(setupPoses);
    await shoot('poses_back', () => { const { x0, z0 } = window.__stage; window.__cam(x0 + 0.6, 2.0, z0 - 5.4, x0 + 0.8, 1.1, z0 + 2, 55); });
    await shoot('poses_front', () => { const { x0, z0 } = window.__stage; window.__cam(x0 + 0.8, 1.7, z0 + 5.8, x0 + 0.8, 1.1, z0, 55); });
    await ev(() => { for (const p of window.__peds) p.remove(); window.__peds = []; });
  }
  if (want('cars')) {
    await ev(() => {
      window.__lineup = (types) => {
        const n = window.__neon, { x0, z0 } = window.__stage;
        for (const c of (window.__cars || [])) c.remove();
        window.__cars = types.map((t, i) => { const c = new n.Car(t); c.place(x0 + (i - 2) * 6.2, z0, -0.55); c.persistent = true; return c; });
        window.__cam(x0 + 1, 5.5, z0 + 17.5, x0, 0.6, z0, 52);
      };
    });
    await shoot('cars_a', () => window.__lineup(['coupe', 'sedan', 'suv', 'muscle', 'pickup']));
    await shoot('cars_b', () => window.__lineup(['van', 'supercar', 'taxi', 'police', 'bus']));
    await shoot('cars_rear', () => { const { x0, z0 } = window.__stage; window.__cam(x0 - 3, 2.8, z0 - 10, x0 + 1, 0.8, z0, 55); });
  }
  if (want('interior')) {
    await shoot('interior', () => {
      const n = window.__neon, { x0, z0 } = window.__stage;
      for (const c of (window.__cars || [])) c.remove();
      const c = new n.Car('sedan'); c.place(x0, z0, 0.2); c.persistent = true; c.setInteriorVisible(true); c.rpm = 3200; c.steer = 0.2;
      window.__cars = [c];
      const v = new window.THREE.Vector3();
      n.cam.override = () => { c.steer = 0.25; c.eyeWorld(v); n.camera.position.copy(v); n.camera.lookAt(v.x + Math.sin(c.h) * 10 - Math.cos(c.h) * 1.2, v.y - 1.4, v.z + Math.cos(c.h) * 10 + Math.sin(c.h) * 1.2); if (n.camera.fov !== 70) { n.camera.fov = 70; n.camera.updateProjectionMatrix(); } };
    });
  }
  if (want('damage')) {
    await shoot('damage', () => {
      const n = window.__neon, { x0, z0 } = window.__stage;
      for (const c of (window.__cars || [])) c.remove();
      const a = new n.Car('sedan', '#3a86ff'); a.place(x0 - 2.6, z0, -0.6); a.persistent = true; a.dmg.f = 80; a.dmg.l = 40; a.health = 30;
      const b = new n.Car('coupe', '#ffbe0b'); b.place(x0 + 2.6, z0 + 0.5, -0.6); b.persistent = true; b.dmg.r = 70; b.dmg.rt = 60; b.dmg.top = 30;
      window.__cars = [a, b];
      window.__cam(x0 - 1, 2.6, z0 + 8.5, x0, 0.7, z0, 50);
    });
  }
  console.log('console errors (' + logs.length + ')' + (logs.length ? ':\n' + logs.slice(0, 20).join('\n') : ''));
  if (logs.length) failed = true;
  await browser.close();
  if (failed) { console.error('MODELS TEST FAILED'); process.exitCode = 1; } else console.log('OK');
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
