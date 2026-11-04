// Police & living city test: traffic signals, witnesses, pedestrian panic, wanted escalation 1★→5★
// (officers on foot, shooting, roadblocks, helicopter, armoured van) and screenshots.
//   node tests/police.js <build.html> [--shots <dir>]
const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const file = path.resolve(args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--shots') || path.join(ROOT, '..', 'neon-tide.html'));
const shotDir = args.includes('--shots') ? path.resolve(args[args.indexOf('--shots') + 1]) : path.join(os.tmpdir(), 'neon-tide-police');
fs.mkdirSync(shotDir, { recursive: true });
let failures = 0;
const check = (name, ok, info) => { console.log((ok ? 'PASS ' : 'FAIL ') + name.padEnd(46), info === undefined ? '' : JSON.stringify(info)); if (!ok) failures++; };
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message + ' | ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  await page.route('**/fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto('file://' + file);
  await page.waitForFunction(() => window.__neon && window.__neon.GAME.state === 'menu', null, { timeout: 120000 });
  const ev = (f, a) => page.evaluate(f, a);
  const step = (n, dt) => ev(([n, dt]) => window.__neon.step(n, dt), [n, dt || 1 / 30]);
  // step until cond() (evaluated in page) is true or maxSteps run out; returns steps used or -1
  const until = async (cond, maxSteps, chunk) => {
    chunk = chunk || 15;
    for (let k = 0; k < maxSteps; k += chunk) { if (await ev(cond)) return k; await step(chunk); }
    return (await ev(cond)) ? maxSteps : -1;
  };
  // software WebGL is slow: the page only renders while a screenshot is taken
  const rendering = (on) => ev((on) => { const r = window.__neon.renderer; if (!r.__render) { r.__render = r.render; r.__frames = 0; } r.render = on ? function (s, c) { r.__frames++; return r.__render.call(r, s, c); } : function () {}; }, on);
  // let one cheap (unrendered) game frame refresh glows and culling, freeze the simulation, then render
  const shot = async (name) => {
    const t0 = await ev(() => window.__neon.GAME.time);
    await page.waitForFunction((t0) => window.__neon.GAME.time > t0, t0, { timeout: 60000 });
    await ev(() => { window.__neon.GAME.state = 'pause'; document.getElementById('toasts').innerHTML = ''; });
    const f0 = await ev(() => { const r = window.__neon.renderer; return r.__frames || 0; });
    await rendering(true);
    await page.waitForFunction((f0) => window.__neon.renderer.__frames > f0 + 1, f0, { timeout: 150000 });
    const p = path.join(shotDir, name + '.png');
    await page.screenshot({ path: p, timeout: 150000 });
    const info = await ev(() => { const i = window.__neon.renderer.info.render; return { calls: i.calls, tris: i.triangles }; });
    console.log('shot', p, JSON.stringify(info));
    await ev(() => { window.__neon.GAME.state = 'play'; });
    await rendering(false);
  };
  await ev(() => { const n = window.__neon; n.save.mission = 5; n.save.tokens = []; n.startGame(false); });
  await rendering(false);
  await step(20);

  // ---------- 1. traffic signals: a car approaching a red light stops at the line and queues ----------
  const sig = await ev(() => {
    const n = window.__neon, A = window.__neonAI;
    // a signalled node with an axis that stays red for a while
    for (const node of A.SIG.nodes.values()) {
      if (node.i < 2 || node.i > 5 || node.j < 2 || node.j > 5) continue;
      for (const axis of [0, 1]) {
        if (A.sigState(node.i, node.j, axis) !== 2 || A.sigGreenLeft(node.i, node.j, 1 - axis) < 8) continue;
        // incoming lane on that axis
        const from = axis === 0 ? [node.i - 1, node.j] : [node.i, node.j - 1];
        const seg = A.laneSeg(from, [node.i, node.j]);
        const mk = (s) => { const c = new n.Car('sedan'); const t = s / seg.len; c.place(seg.sx + (seg.ex - seg.sx) * t, seg.sz + (seg.ez - seg.sz) * t, Math.atan2(seg.dx, seg.dz)); new A.TrafficAI(c, from, [node.i, node.j], s); return c; };
        // clear the lane first
        for (const c of n.cars.slice()) if (c.ai instanceof A.TrafficAI && Math.abs(c.x - (seg.sx + seg.ex) / 2) < 40 && Math.abs(c.z - (seg.sz + seg.ez) / 2) < 40) c.remove();
        const c1 = mk(seg.len - 30), c2 = mk(seg.len - 46);
        n.player.x = c1.x + seg.rx * 12; n.player.z = c1.z + seg.rz * 12;
        window.__sigTest = { c1, c2, node, axis, seg, from, s0: c1.ai.s };
        return { node: [node.i, node.j], axis, len: seg.len.toFixed(1) };
      }
    }
    return null;
  });
  check('signal test setup', !!sig, sig);
  if (sig) {
    await step(150);
    const st = await ev(() => {
      const T = window.__sigTest, A = window.__neonAI;
      const r1 = T.c1.ai, r2 = T.c2.ai;
      return { light: A.sigState(T.node.i, T.node.j, T.axis), v1: r1.v.toFixed(2), toLine: (r1.seg.len - r1.s - 2.6 - T.c1.T.L / 2).toFixed(2), v2: r2.v.toFixed(2), gap: (Math.hypot(T.c1.x - T.c2.x, T.c1.z - T.c2.z) - T.c1.T.L).toFixed(2) };
    });
    check('car stops at red light', st.light === 2 && +st.v1 < 0.3 && +st.toLine > -1.0 && +st.toLine < 2.5, st);
    check('second car queues behind it', +st.v2 < 0.3 && +st.gap > 0.5 && +st.gap < 5, st);
    const waited = await until(() => { const T = window.__sigTest; return window.__neonAI.sigState(T.node.i, T.node.j, T.axis) === 0; }, 900, 30);
    await step(120);
    const go = await ev(() => { const T = window.__sigTest, ai = T.c1.ai; if (!ai) return { mode: 'gone', moved: false }; const sameSeg = ai.seg.a[0] === T.from[0] && ai.seg.a[1] === T.from[1]; return { mode: ai.mode, moved: ai.mode === 'turn' || !sameSeg || ai.s > T.s0 + 20 }; });
    check('car drives on at green', waited >= 0 && go.moved, go);
  }
  // a pedestrian at a signalled corner waits for the walk phase, crosses and continues on the next block
  const cr0 = await ev(() => {
    const n = window.__neon, A = window.__neonAI, b = A.blocks[3 * 7 + 4];
    const p = new n.Ped(n.randomLook(), b.x0 + 2.4, b.z0 + 2.4);
    p.rect = A.blockRect(b, 2.4); p.p = 0; p.state = 'walk'; p.planCross(0);
    n.player.x = b.x0 - 4; n.player.z = b.z0 + 14;
    window.__crossPed = p; window.__crossBlk = b;
    return { crossed: A.PEDSTAT.crossed, state: p.state, axis: p.cross.axis };
  });
  const tc = await until(() => { const p = window.__crossPed; return p.removed || p.state === 'cross'; }, 1500, 5);
  const cr1 = await ev(() => { const p = window.__crossPed, A = window.__neonAI, C = p.cross; return C ? { state: p.state, crossedAxisLight: A.sigState(C.ni, C.nj, C.axis), parallelLight: A.sigState(C.ni, C.nj, 1 - C.axis) } : { state: p.state }; });
  const tc2 = await until(() => { const p = window.__crossPed; return p.removed || !p.cross; }, 600, 5);
  const cr2 = await ev(() => { const p = window.__crossPed, A = window.__neonAI; return { crossed: A.PEDSTAT.crossed, onNewBlock: !!p.rect && p.rect.blk !== window.__crossBlk, state: p.state }; });
  check('pedestrian crosses on the walk phase only', tc >= 0 && cr1.state === 'cross' && cr1.crossedAxisLight === 2 && cr1.parallelLight === 0, cr1);
  check('pedestrian reaches the next block', tc2 >= 0 && cr2.crossed > cr0.crossed && cr2.onNewBlock, cr2);
  // pedestrians use the crosswalks
  await step(300);
  const peds = await ev(() => { const A = window.__neonAI; const s = {}; for (const p of A.peds) s[p.state] = (s[p.state] || 0) + 1; return { states: s, crossing: A.crossers.length, stats: A.PEDSTAT }; });
  console.log('ped states', JSON.stringify(peds));

  // ---------- 2. busy street screenshot (day) ----------
  await ev(() => {
    const n = window.__neon, A = window.__neonAI;
    n.DAY.hours = 16.2; n.DAY.envT = 99; n.DAY.lastEnvDir.set(0, -2, 0);
    n.player.x = -52; n.player.z = 30; n.player.mode = 'foot';
    // walkers heading to / waiting at the four corners of the intersection at (-40, 40), a chatting group
    const corners = [[2, 3, 2], [3, 3, 3], [2, 4, 1], [3, 4, 0]];
    for (const [bi, bj, k] of corners) {
      const b = A.blocks[bi * 7 + bj], ins = 2.5, r = A.blockRect(b, ins), w = r.x1 - r.x0, d = r.z1 - r.z0;
      const cp = [0, w, w + d, 2 * w + d][k];
      for (let m = 0; m < 4; m++) {
        const p = new n.Ped(n.randomLook(), 0, 0);
        p.rect = r; p.p = cp + (m - 1.5) * 4.5; p.dir = m % 2 ? 1 : -1; p.spd = 1.2 + m * 0.12; p.state = 'walk';
      }
      const q = new n.Ped(n.randomLook(), 0, 0); q.rect = r; q.p = cp; q.state = 'walk'; q.planCross(k);
    }
    const gx = -31, gz = 29;
    for (let m = 0; m < 3; m++) { const a = m / 3 * Math.PI * 2, x = gx + Math.cos(a) * 0.7, z = gz + Math.sin(a) * 0.7; const p = new n.Ped(n.randomLook(), x, z); p.h = Math.atan2(gx - x, gz - z); p.state = 'idle'; p.act = { kind: 'chat', x, z, h: p.h, t: 60, gest: m, gestW: 0 }; }
    for (let k = 0; k < 4; k++) A.spawnTraffic(-40, 40, true);
    document.getElementById('hud').style.visibility = 'hidden';
    n.cam.override = () => { n.camera.position.set(-52.5, 2.1, 55); n.camera.lookAt(-39, 1.4, 38); };
  });
  await step(45);
  await shot('busy_street');
  await ev(() => { const n = window.__neon; n.cam.override = null; document.getElementById('hud').style.visibility = ''; });

  // ---------- 3. witnesses report gunfire ----------
  const wit = await ev(() => {
    const n = window.__neon, A = window.__neonAI;
    n.clearWanted();
    for (const p of n.police.slice()) { if (!p.car.dead) p.car.remove(); } n.police.length = 0;
    n.player.x = -120; n.player.z = 30; n.player.mode = 'foot'; n.player.car = null;
    for (const p of A.peds.slice()) if (Math.hypot(p.x - n.player.x, p.z - n.player.z) < 60) p.remove();
    for (let k = 0; k < 4; k++) { const p = new n.Ped(n.randomLook(), n.player.x + 6 + k * 2, n.player.z + 4); p.ensureRect(); p.state = 'walk'; }
    n.GAME.cheats.god = true;
    n.fireBullet({ x: n.player.x, y: n.player.y + 1.5, z: n.player.z, dx: 0, dy: 1, dz: 0, range: 60, damage: 20, shooter: 'player' });
    return { stars: n.wanted.stars };
  });
  await step(45);
  const w1 = await ev(() => { const A = window.__neonAI; const s = {}; for (const p of A.peds) s[p.state] = (s[p.state] || 0) + 1; return { witnesses: A.INC.witnesses.length, stars: A.wanted.stars, states: s }; });
  check('gunshot: witnesses start calling', w1.witnesses > 0 && w1.stars === 0, w1);
  check('gunshot: pedestrians flee / cower / duck', (w1.states.flee || 0) + (w1.states.cower || 0) + (w1.states.duck || 0) >= 2, w1.states);
  await step(240);
  // with the weapons module the shot itself already adds a little heat and the witness tops it up (to 1★ in play)
  const w2 = await ev(() => { const A = window.__neonAI; return { stars: A.wanted.stars, heat: +A.wanted.heat.toFixed(2), reports: A.POL.reports, arsenal: typeof window.__neon.WPN === 'object' }; });
  check('witness report raises the wanted level', w2.reports >= 1 && (w2.stars >= 1 || w2.heat >= 0.65), w2);
  // witnesses taken down before calling → no report
  const w3 = await ev(() => {
    const n = window.__neon, A = window.__neonAI;
    n.clearWanted();
    n.player.x = -120; n.player.z = -30;
    for (const p of A.peds.slice()) if (Math.hypot(p.x - n.player.x, p.z - n.player.z) < 60) p.remove();
    for (let k = 0; k < 3; k++) { const p = new n.Ped(n.randomLook(), n.player.x + 5 + k * 2, n.player.z + 3); p.ensureRect(); p.state = 'walk'; }
    n.fireBullet({ x: n.player.x, y: n.player.y + 1.5, z: n.player.z, dx: 0, dy: 1, dz: 0, range: 60, damage: 20, shooter: 'player' });
    return true;
  });
  await step(40);
  await ev(() => { const A = window.__neonAI; for (const w of A.INC.witnesses.slice()) w.p.knock(3, 0, 6, 'test'); });
  await step(270);
  const w4 = await ev(() => ({ stars: window.__neon.wanted.stars }));
  check('silenced witnesses do not report', w3 && w4.stars === 0, w4);

  // ---------- 4. escalation ----------
  // 1★: an officer gets out to arrest a suspect on foot
  await ev(() => { const n = window.__neon; n.GAME.cheats.god = true; n.player.x = -40 + 12; n.player.z = 120 - 30; n.player.vx = n.player.vz = 0; n.setWanted(1); });
  const t1 = await until(() => window.__neonAI.cops.some((c) => c.state === 'arrest' || c.state === 'exit'), 1500, 30);
  const a1 = await ev(() => { const A = window.__neonAI, n = window.__neon; return { cops: A.cops.map((c) => c.state + ':' + Math.hypot(c.x - n.player.x, c.z - n.player.z).toFixed(0)), armed: A.cops.some((c) => c.armed), bust: n.wanted.bustT.toFixed(2) }; });
  check('1★: officer exits the car to arrest (unarmed)', t1 >= 0 && !a1.armed, a1);
  // 2★ and hostile (the suspect fires): officers draw and shoot; the player gets hurt
  await ev(() => { const n = window.__neon; n.setWanted(2); n.fireBullet({ x: n.player.x, y: n.player.y + 1.5, z: n.player.z, dx: 0.3, dy: 0.9, dz: 0.3, range: 60, damage: 20, shooter: 'player' }); n.GAME.cheats.god = false; n.player.health = 100; window.__neonAI.POL.shots = 0; window.__neonAI.POL.hits = 0; });
  const t2 = await until(() => window.__neon.player.health < 99.5 || window.__neonAI.POL.shots >= 30, 900, 15);
  const a2 = await ev(() => { const A = window.__neonAI, n = window.__neon; return { hp: n.player.health.toFixed(0), shots: A.POL.shots, hits: A.POL.hits, cops: A.cops.map((c) => c.state + (c.armed ? '+' + c.wpn : '') + ':' + Math.hypot(c.x - n.player.x, c.z - n.player.z).toFixed(0) + (c.inCover ? 'C' : '')) }; });
  await ev(() => { window.__neon.GAME.cheats.god = true; });
  check('2★: armed officers on foot open fire', t2 >= 0 && a2.shots >= 1 && a2.cops.some((s) => s.includes('+pistol') || s.includes('+rifle')), a2);
  check('2★: player health drops', +a2.hp < 100, a2.hp);
  // 3★ in a car: roadblock ahead, rifles
  await ev(() => {
    const n = window.__neon;
    n.player.health = 100;
    const c = new n.Car('muscle', '#ff8a3d'); c.place(n.roadC(4) + 4, n.roadC(0) + 30, 0); c.persistent = true;
    n.player.x = c.x + 2; n.player.z = c.z; n.tryEnterExit();
    n.setWanted(3);
  });
  await page.keyboard.down('KeyW');
  const t3 = await until(() => window.__neonAI.POL.blocks.length > 0, 600, 10);
  const a3 = await ev(() => { const A = window.__neonAI, n = window.__neon; const B = A.POL.blocks[0]; return B ? { d: Math.hypot(B.x - n.player.x, B.z - n.player.z).toFixed(0), cars: B.units.length, cops: B.cops.length, rifles: B.cops.filter((c) => c.wpn === 'rifle').length, ahead: ((B.x - n.player.x) * n.player.car.vx + (B.z - n.player.z) * n.player.car.vz) > 0 } : null; });
  await page.keyboard.up('KeyW');
  check('3★: roadblock appears ahead of the driver', t3 >= 0 && a3 && a3.ahead && a3.cars >= 2, a3);
  check('3★: roadblock officers carry rifles', a3 && a3.rifles >= 1, a3);
  // roadblock screenshot (dusk) from the approach side
  if (a3) {
    await ev(() => {
      const n = window.__neon, B = window.__neonAI.POL.blocks[0];
      const c = n.player.car; c.vx = c.vz = 0; c.x = B.x - B.dx * 34 - B.dz * 3; c.z = B.z - B.dz * 34 + B.dx * 3; c.h = Math.atan2(B.dx, B.dz);
      n.DAY.hours = 19.2; n.DAY.envT = 99; n.DAY.lastEnvDir.set(0, -2, 0);
      document.getElementById('hud').style.visibility = 'hidden';
      n.cam.override = () => { n.camera.position.set(B.x - B.dx * 12.5 + B.dz * 4, 2.5, B.z - B.dz * 12.5 - B.dx * 4); n.camera.lookAt(B.x + B.dx * 2, 1.0, B.z + B.dz * 2); };
    });
    await step(20);
    await shot('roadblock');
    await ev(() => { const n = window.__neon; n.cam.override = null; document.getElementById('hud').style.visibility = ''; });
  }
  // 4★: helicopter with a door gunner
  await ev(() => { const n = window.__neon; n.setWanted(4); n.DAY.hours = 23.2; n.DAY.envT = 99; n.DAY.lastEnvDir.set(0, -2, 0); const c = n.player.car; c.x = n.roadC(5) + 4; c.z = n.roadC(1) + 10; c.h = 0; c.vx = c.vz = 0; c.health = 2000; window.__neonAI.POL.shots = 0; });
  await page.keyboard.down('KeyW');
  const t4 = await until(() => !!window.__neonAI.POL.heli, 300, 10);
  await step(150);
  await page.keyboard.up('KeyW');
  const t4b = await until(() => { const h = window.__neonAI.POL.heli, n = window.__neon; return h && Math.hypot(h.x - n.player.x, h.z - n.player.z) < 70; }, 900, 30);
  const a4 = await ev(() => { const A = window.__neonAI, n = window.__neon, h = A.POL.heli; return h ? { d: Math.hypot(h.x - n.player.x, h.z - n.player.z).toFixed(0), alt: (h.y - n.player.y).toFixed(0), seen: h.seen, beam: h.beam.visible, inPolice: A.police.includes(h), blips: (() => { const k = {}; A.policeBlips((x, z, t) => { k[t] = (k[t] || 0) + 1; }); return k; })() } : null; });
  check('4★: police helicopter arrives', t4 >= 0 && t4b >= 0 && !!a4, a4);
  check('4★: searchlight on at night, heli on the police list', a4 && a4.beam && a4.inPolice && a4.blips.heli === 1, a4);
  const t4c = await until(() => window.__neonAI.POL.shots > 0, 600, 30);
  check('4★: door gunner / officers keep shooting', t4c >= 0, await ev(() => window.__neonAI.POL.shots));
  // night chase screenshot: the suspect's car coming at the camera, cruisers behind, the helicopter's beam on it
  await ev(() => {
    const n = window.__neon, A = window.__neonAI;
    let c = n.player.car;
    if (!c) return;
    c.health = 2000; c.wrecked = false; c.burnT = 9;
    // a straight piece of road: along x = roadC(5), between two intersections
    c.x = n.roadC(5) + 4; c.z = n.roadC(2) + 22; c.h = 0; c.vx = 0; c.vz = 9;
    for (const cop of A.cops.slice()) cop.remove();
    const f = [0, 1], r = [1, 0];
    let k = 0;
    for (const p of A.police) { if (p.heli || p.static || p.mode === 'leave') continue; if (k > 2) { p.car.x = c.x + 300; continue; } const pc = p.car; pc.x = c.x + [-2.2, 3.6, -3.4][k]; pc.z = c.z - [9, 13, 21][k]; pc.h = [0.15, -0.1, 0.05][k]; pc.vx = 0; pc.vz = 9; p.state = 'drive'; p.crew.length = 0; p.seats = 2; k++; }
    const h = A.POL.heli;
    if (h) { h.x = c.x - 3; h.z = c.z - 15; h.y = c.y + 17; h.vx = h.vz = h.vy = 0; h.h = Math.PI / 2 + 0.3; h.pitch = 0.08; h.roll = -0.05; h.lx = c.x; h.lz = c.z + 1; h.mode = 'chase'; }
    document.getElementById('hud').style.visibility = 'hidden';
    n.cam.override = () => { n.camera.position.set(c.x + 5.5, 2.4, c.z + 13); n.camera.lookAt(c.x - 1, 5.5, c.z - 6); };
  });
  await step(1, 1 / 60);
  await shot('night_chase');
  await ev(() => { const n = window.__neon; n.cam.override = null; document.getElementById('hud').style.visibility = ''; });
  // 5★: armoured van with a rifle squad
  await ev(() => { const n = window.__neon; n.setWanted(5); n.cam.zoom = 1; });
  const t5 = await until(() => window.__neonAI.police.some((p) => p.role === 'van' && !p.car.dead), 300, 10);
  const a5 = await ev(() => { const A = window.__neonAI; const v = A.police.find((p) => p.role === 'van'); return v ? { type: v.car.type, hp: v.car.health, seats: v.seats, police: !!v.car.T.police } : null; });
  check('5★: armoured van with a squad', t5 >= 0 && a5 && (a5.type === 'swat' || a5.type === 'van') && a5.police && a5.seats === 4, a5);
  // let the van arrive and deploy its squad next to a stopped suspect
  await ev(() => { const n = window.__neon, A = window.__neonAI, v = A.police.find((p) => p.role === 'van'), c = n.player.car; c.vx = c.vz = 0; if (v) { v.car.x = c.x - Math.sin(c.h) * 40; v.car.z = c.z - Math.cos(c.h) * 40; v.car.h = c.h; v.car.vx = v.car.vz = 0; } });
  const t5b = await until(() => window.__neonAI.cops.some((c) => c.swat), 600, 15);
  check('5★: squad deploys from the van', t5b >= 0, await ev(() => window.__neonAI.cops.filter((c) => c.swat).length));
  // stand down
  await ev(() => window.__neon.clearWanted());
  await step(300);
  const end = await ev(() => { const A = window.__neonAI; return { stars: A.wanted.stars, heliLeaving: A.POL.heli ? A.POL.heli.mode : 'gone', armed: A.cops.filter((c) => c.armed && c.alive).length }; });
  check('wanted cleared: everybody stands down', end.stars === 0 && end.armed === 0, end);
  await step(300);
  console.log('console errors (' + logs.length + '):\n' + logs.slice(0, 30).join('\n'));
  if (logs.length) failures++;
  console.log(failures ? 'POLICE TEST: ' + failures + ' failure(s)' : 'POLICE TEST OK');
  process.exitCode = failures ? 1 : 0;
  await browser.close();
})().catch((e) => { console.error('TEST FAILED', e); process.exit(1); });
