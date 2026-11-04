// Weapons & combat test: shop, every weapon vs peds / cars / walls, grenade, reload, bat, drive-by, cop drops,
// creative mode, plus screenshots (third-person aim, first-person view model, gun shop UI and storefront).
// Usage: node tests/weapons.js /path/to/neon-tide.html [screenshotDir]
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const file = path.resolve(process.argv[2] || path.join(ROOT, '..', 'neon-tide.html'));
const out = path.resolve(process.argv[3] || path.join(ROOT, 'dist', 'weapons-shots'));
const SHOTS = process.env.NO_SHOTS ? false : true;
fs.mkdirSync(out, { recursive: true });
let fails = 0;
const check = (name, ok, info) => { console.log((ok ? 'ok   ' : 'FAIL ') + name.padEnd(36), info === undefined ? '' : JSON.stringify(info)); if (!ok) fails++; };
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: SHOTS ? { width: 760, height: 360 } : { width: 480, height: 240 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message + ' | ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  await page.route('**/fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto('file://' + file);
  await page.waitForFunction(() => window.__neon && window.__neon.GAME.state === 'menu' && window.__neonW, null, { timeout: 120000 });
  const ev = (f, a) => page.evaluate(f, a);
  // Without screenshots, skip GPU work entirely (logic, hooks and DOM still run every frame).
  if (!SHOTS) await ev(() => { window.__neon.renderer.render = () => {}; });
  const step = (n, dt) => ev(([n, dt]) => window.__neon.step(n, dt), [n, dt || 1 / 30]);
  const shot = async (name) => { if (!SHOTS) return; const t = Date.now(); await page.screenshot({ path: path.join(out, name + '.png'), timeout: 150000 }); console.log('     screenshot', name, ((Date.now() - t) / 1000).toFixed(1) + 's'); };
  const pull = async (frames) => { await ev(() => { window.__neon.input.fire = true; }); await step(frames || 2); await ev(() => { window.__neon.input.fire = false; }); };
  // UI clicks via DOM events (page.tap waits for rendered frames, which are very slow with software WebGL)
  const click = (sel) => ev((sel) => { const el = document.querySelector(sel); if (!el) throw new Error('no ' + sel); el.click(); }, sel);
  const press = (sel) => ev((sel) => { const el = document.querySelector(sel); if (!el) throw new Error('no ' + sel); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch' })); }, sel);
  const cdFrames = async () => Math.ceil((await ev(() => window.__neonW.WEAPONS[window.__neonW.ARS.cur].cd || 0.3)) * 30) + 1;
  // helpers in the page
  await ev(() => {
    const n = window.__neon, W = window.__neonW;
    window.T = {
      clearArea() { for (const p of n.peds.slice()) p.remove(); for (const c of n.cars.slice()) if (c !== n.player.car) c.remove(); n.clearWanted(); },
      place(x, z, h) { const P = n.player; P.x = x; P.z = z; P.y = n.groundH(x, z); P.vx = P.vz = 0; P.h = h; n.cam.yaw = h; n.cam.pitch = 0.05; },
      rayPoint(d) { const A = W.getAim(); return { x: A.x + A.dx * d, y: A.y + A.dy * d, z: A.z + A.dz * d }; },
      ped(d, cop) { const q = T.rayPoint(d); const p = new n.Ped(cop ? n.COP_LOOK : n.randomLook(), q.x, q.z); p.state = 'walk'; p.rect = { x0: q.x - 0.01, x1: q.x + 0.01, z0: q.z - 0.01, z1: q.z + 0.01 }; p.idleT = 999; if (cop) p.cop = true; return p; },
      car(d) { const q = T.rayPoint(d); const c = new n.Car('sedan'); c.place(q.x, q.z, n.player.h + Math.PI / 2); c.persistent = true; return c; },
    };
  });
  // ---------- start story ----------
  await ev(() => { const n = window.__neon; n.save.arsenal = null; n.startGame(true); });
  await step(20);
  let r = await ev(() => { const W = window.__neonW; return { cur: W.ARS.cur, owned: Object.keys(W.arsStore().owned), spot: W.WSHOP.spot && [+W.WSHOP.spot.x.toFixed(1), +W.WSHOP.spot.z.toFixed(1)], fire: document.getElementById('bFire').classList.contains('hidden'), punch: document.getElementById('bPunch').classList.contains('hidden') }; });
  check('fresh arsenal = fists', r.cur === 'fists' && r.owned.join() === 'fists', r);
  check('gun shop placed', !!r.spot, r.spot);
  check('fists: Fire hidden, Punch shown', r.fire && !r.punch);
  // ---------- gun shop ----------
  await ev(() => { const n = window.__neon, W = window.__neonW; n.save.money = 20000; const s = W.WSHOP.spot; n.player.x = s.x; n.player.z = s.z; n.player.y = n.groundH(s.x, s.z); });
  await step(2);
  r = await ev(() => ({ open: window.__neonW.WSHOP.open, state: window.__neon.GAME.state, vis: !document.getElementById('wShop').classList.contains('hidden') }));
  check('walking into the ring opens shop', r.open && r.state === 'pause' && r.vis, r);
  for (const id of ['pistol', 'bat', 'smg', 'shotgun', 'rifle']) await click(`[data-act=buy][data-id=${id}]`);
  await click('[data-act=ammo][data-id=pistol]');
  for (let i = 0; i < 4; i++) await click('[data-act=gren]');
  await shot('shop-ui');
  r = await ev(() => { const n = window.__neon, st = window.__neonW.arsStore(); return { owned: Object.keys(st.owned), res: st.res, gren: st.gren, money: n.save.money, saved: JSON.parse(localStorage.getItem('neon-tide-save-v1')).arsenal.gren }; });
  check('bought all weapons', r.owned.length === 6, r.owned);
  check('money spent, ammo & grenades', r.money === 20000 - (350 + 120 + 1200 + 1800 + 3200 + 40 + 4 * 120) && r.gren === 4 && r.res.pistol === 48, r);
  check('arsenal persisted in save', r.saved === 4, r.saved);
  await click('#wsClose');
  await step(2);
  r = await ev(() => ({ open: window.__neonW.WSHOP.open, state: window.__neon.GAME.state }));
  check('shop closes, game resumes', !r.open && r.state === 'play', r);
  // storefront screenshot (evening)
  await ev(() => { const n = window.__neon, W = window.__neonW, s = W.WSHOP.spot; T.clearArea(); n.player.x = s.x + s.nx * 9; n.player.z = s.z + s.nz * 9; n.player.y = n.groundH(n.player.x, n.player.z); n.player.h = Math.atan2(-s.nx, -s.nz); n.cam.yaw = n.player.h; n.cam.pitch = 0.12; n.DAY.hours = 20.3; });
  await step(15);
  await ev(() => { const st = document.createElement('style'); st.id = 'tHide'; st.textContent = '#sms,#banner,#objective{display:none!important}'; document.head.appendChild(st); });
  await shot('shop-front');
  await ev(() => document.getElementById('tHide').remove());
  // ---------- firing range: every gun vs a ped and a car ----------
  await ev(() => { window.__neon.DAY.hours = 16.8; });
  const res = {};
  for (const id of ['pistol', 'smg', 'shotgun', 'rifle']) {
    await ev(([id]) => { const n = window.__neon, W = window.__neonW; T.clearArea(); T.place(n.roadC(3), n.roadC(2) + 2, Math.PI / 2); W.arsSelect(id); n.input.aim = true; }, [id]);
    await step(25);
    const before = await ev(() => { const W = window.__neonW, st = W.arsStore(); W.p = T.ped(11); W.c = T.car(26); return { mag: st.mag[W.ARS.cur], cur: W.ARS.cur }; });
    let shots = 0;
    const cdf = await cdFrames();
    for (let k = 0; k < 14; k++) {
      if (!(await ev(() => window.__neonW.p.health > 0 && window.__neonW.p.state !== 'dead'))) break;
      await pull(2); await step(cdf); shots++;
    }
    await step(30);
    const a = await ev(() => { const n = window.__neon, W = window.__neonW, st = W.arsStore(); return { cur: W.ARS.cur, mag: st.mag[W.ARS.cur], pedHp: Math.round(W.p.health), pedState: W.p.state, heat: +n.wanted.heat.toFixed(2) }; });
    await ev(() => { const W = window.__neonW, n = window.__neon; W.p.remove(); const q = T.rayPoint(14); W.c.place(q.x, q.z, n.player.h + Math.PI / 2); });
    for (let k = 0; k < 4; k++) { await pull(2); await step(cdf); }
    const c = await ev(() => Math.round(window.__neonW.c.health));
    res[id] = { shots, hp: a.pedHp, carHp: c, heat: a.heat };
    check(id + ': ped down', a.pedState === 'dead' || a.pedState === 'fly' || a.pedHp <= 0, { shots, hp: a.pedHp, state: a.pedState });
    check(id + ': ammo used', a.mag < before.mag, { before: before.mag, after: a.mag });
    check(id + ': car damaged', c < 100, { carHp: c });
    check(id + ': wanted rises', a.heat > 0, { heat: a.heat });
  }
  await ev(() => { window.__neon.input.aim = false; });
  // building hit → face normal + bullet hole
  r = await ev(() => { const n = window.__neon, W = window.__neonW; const before = W.WFX.holeN; let hit = null;
    for (const dir of [[0.6, 0.8], [-0.6, 0.8], [0.6, -0.8], [-0.6, -0.8], [0.8, 0.6], [-0.8, -0.6]]) { const q = W.fireBullet({ x: n.player.x, y: n.player.y + 1.4, z: n.player.z, dx: dir[0], dy: 0, dz: dir[1], range: 200, damage: 30, shooter: 'player', weapon: 'pistol' }); if (q.type === 'world') { hit = q; break; } }
    return { hit: hit && { nx: hit.nx, nz: hit.nz, d: +hit.dist.toFixed(1) }, holes: W.WFX.holeN - before }; });
  check('building hit: face normal + hole', !!r.hit && Math.abs(r.hit.nx) + Math.abs(r.hit.nz) === 1 && r.holes > 0, r);
  // ---------- third-person aim screenshots ----------
  await ev(() => { const n = window.__neon, W = window.__neonW; T.clearArea(); T.place(n.roadC(3) + 4, n.roadC(2) + 3, Math.PI / 2 + 0.25); n.cam.pitch = 0.1; W.arsSelect('pistol'); n.input.aim = true; });
  await step(25);
  await ev(() => { const W = window.__neonW; W.p = T.ped(13); W.p2 = T.ped(19); });
  await step(3);
  await pull(1);
  await shot('tp-aim-pistol');
  await ev(() => { const n = window.__neon, W = window.__neonW; W.arsSelect('rifle'); n.cam.yaw -= 0.5; });
  await step(25);
  await pull(3);
  await shot('tp-aim-rifle');
  r = await ev(() => { const P = window.__neon.player; return { weapon: P.anim.weapon, aim: +P.anim.aim.toFixed(2), aimYaw: +P.anim.aimYaw.toFixed(2), aimPitch: +P.anim.aimPitch.toFixed(2), wantAim: window.__neon.cam.wantAim, gun: P.H.gunType }; });
  check('hero anim fields while aiming', r.weapon === 'twohand' && r.aim > 0.9 && r.wantAim === true && r.gun === 'rifle', r);
  await ev(() => { window.__neon.input.aim = false; });
  // ---------- reload ----------
  await ev(() => window.__neonW.arsSelect('smg'));
  await step(20);
  await ev(() => { const st = window.__neonW.arsStore(); st.mag.smg = 3; st.res.smg = 50; window.__neonW.arsReload(); });
  await step(5);
  const mid = await ev(() => ({ reloading: window.__neonW.ARS.reloading, prog: +window.__neon.player.anim.reload.toFixed(2) }));
  await step(60);
  r = await ev(() => { const st = window.__neonW.arsStore(); return { mag: st.mag.smg, res: st.res.smg, reloading: window.__neonW.ARS.reloading }; });
  check('reload refills magazine', mid.reloading && mid.prog > 0 && r.mag === 30 && r.res === 23 && !r.reloading, { mid, r });
  await ev(() => window.__neonW.arsSelect('shotgun'));
  await step(20);
  await ev(() => { const st = window.__neonW.arsStore(); st.mag.shotgun = 2; st.res.shotgun = 10; window.__neonW.arsReload(); });
  await step(70);
  r = await ev(() => { const st = window.__neonW.arsStore(); return { mag: st.mag.shotgun, res: st.res.shotgun }; });
  check('shotgun loads shell by shell', r.mag === 6 && r.res === 6, r);
  // ---------- bat ----------
  await ev(() => { T.clearArea(); window.__neonW.arsSelect('bat'); });
  await step(20);
  r = await ev(() => { const n = window.__neon, W = window.__neonW, P = n.player; const p = new n.Ped(n.randomLook(), P.x + Math.sin(P.h) * 1.3, P.z + Math.cos(P.h) * 1.3); p.state = 'walk'; p.rect = { x0: p.x - 0.01, x1: p.x + 0.01, z0: p.z - 0.01, z1: p.z + 0.01 }; p.idleT = 999; W.p = p;
    return { fire: !document.getElementById('bFire').classList.contains('hidden'), label: document.querySelector('#bFire span').textContent, punch: document.getElementById('bPunch').classList.contains('hidden') }; });
  check('bat: Fire button says «Удар»', r.fire && r.label === 'Удар' && r.punch, r);
  await pull(3); await step(25);
  r = await ev(() => ({ hp: window.__neonW.p.health, state: window.__neonW.p.state }));
  check('bat hits and knocks down', r.hp < 60 && r.state !== 'walk', r);
  // ---------- grenade ----------
  await ev(() => { const n = window.__neon, W = window.__neonW; T.clearArea(); W.arsSelect('pistol'); n.cam.pitch = 0.25; });
  await step(15);
  await ev(() => { const n = window.__neon, W = window.__neonW, P = n.player; W.gp = []; for (let k = 0; k < 3; k++) { const p = new n.Ped(n.randomLook(), P.x + Math.sin(P.h) * (13 + k) + k, P.z + Math.cos(P.h) * (13 + k)); p.state = 'walk'; p.rect = { x0: p.x - 0.01, x1: p.x + 0.01, z0: p.z - 0.01, z1: p.z + 0.01 }; p.idleT = 999; W.gp.push(p); }
    const c = new n.Car('coupe'); c.place(P.x + Math.sin(P.h) * 15, P.z + Math.cos(P.h) * 15 + 3, 0); c.persistent = true; W.gc = c; W.expl = 0; n.EV.on('explosion', () => { W.expl++; }); });
  const g0 = await ev(() => window.__neonW.arsStore().gren);
  await ev(() => window.__neonW.arsThrow());
  await step(12);
  const flying = await ev(() => { const g = window.__neonW.GREN.list.find((q) => q.active); return g ? { x: +g.x.toFixed(1), y: +g.y.toFixed(1), vy: +g.vy.toFixed(1) } : null; });
  await step(80);
  r = await ev(() => { const W = window.__neonW, n = window.__neon, P = n.player; const g = W.GREN.list[0];
    return { gren: W.arsStore().gren, expl: W.expl, peds: W.gp.map((p) => p.state + ':' + Math.round(p.health)), car: Math.round(W.gc.health), dist: g && +Math.hypot(g.x - P.x, g.z - P.z).toFixed(1), heat: +n.wanted.heat.toFixed(2) }; });
  check('grenade thrown in an arc', !!flying && r.gren === g0 - 1, { flying, g0, left: r.gren });
  check('grenade explodes: area damage', r.expl === 1 && r.car < 100 && r.peds.some((s) => !s.startsWith('walk')), r);
  // ---------- cop drop ----------
  await ev(() => { T.clearArea(); window.__neon.input.aim = true; });
  await step(20);
  await ev(() => { window.__neonW.cop = T.ped(8, true); });
  for (let k = 0; k < 6; k++) { await pull(2); await step(6); }
  await step(30);
  r = await ev(() => { const W = window.__neonW, n = window.__neon; return { cop: W.cop.state, picks: W.WPICK.length, stars: n.wanted.stars, heat: +n.wanted.heat.toFixed(2) }; });
  check('shooting a cop: big wanted + drop', r.picks >= 1 && r.heat >= 1.6, r);
  r = await ev(() => { const W = window.__neonW, n = window.__neon, st = W.arsStore(); const p = W.WPICK[0]; const before = st.res.pistol; n.player.x = p.x; n.player.z = p.z; n.step(2, 1 / 30); return { before, after: st.res.pistol, picks: W.WPICK.length }; });
  check('cop drop gives ammo', r.after > r.before && r.picks === 0, r);
  await ev(() => { window.__neon.input.aim = false; window.__neon.clearWanted(); });
  // ---------- npc shooting via the shared API ----------
  r = await ev(() => { const n = window.__neon, W = window.__neonW, P = n.player; T.clearArea(); const hp0 = P.health; const cop = new n.Ped(n.COP_LOOK, P.x + 6, P.z); const g = W.attachGun(cop.H, 'pistol'); let hits = 0;
    for (let k = 0; k < 3; k++) { const q = W.npcShoot(cop, P.x, P.y + 1.2, P.z, { accuracy: 1 }); if (q && q.type === 'player') hits++; }
    const hp = P.health; P.health = 100; cop.remove(); return { gun: !!g && g.parent === cop.H.bones[W.HB.haR], hits, hp0, hp: Math.round(hp), dead: P.dead }; });
  check('attachGun + npcShoot hit the hero', r.gun && r.hits > 0 && (r.hp < r.hp0 || r.dead), r);
  await ev(() => { const P = window.__neon.player; if (P.dead) { P.dead = false; P.health = 100; } });
  // ---------- first-person view model ----------
  await ev(() => { const n = window.__neon, W = window.__neonW, P = n.player; T.clearArea(); T.place(n.roadC(3) + 10, n.roadC(2) + 4, Math.PI / 2 - 0.4); W.arsSelect('rifle'); n.cam.pitch = -0.02;
    if (typeof n.cam.setView === 'function') n.cam.setView(true);
    else { P.root.visible = false; n.cam.fp = true; n.cam.override = () => { const cp = Math.cos(n.cam.pitch); const c = W.camera; c.position.set(P.x, P.y + 1.62, P.z); c.lookAt(P.x + Math.sin(n.cam.yaw) * cp * 10, P.y + 1.62 - Math.sin(n.cam.pitch) * 10, P.z + Math.cos(n.cam.yaw) * cp * 10); }; } });
  await step(25);
  await ev(() => { window.__neonW.p = T.ped(14); }); await pull(2);
  await shot('fp-rifle-hip');
  await ev(() => { window.__neon.input.aim = true; window.__neonW.arsSelect('pistol'); });
  await step(25); await pull(1);
  await shot('fp-pistol-aim');
  await ev(() => { window.__neon.input.aim = false; window.__neonW.arsSelect('shotgun'); });
  await step(25);
  await ev(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
  await shot('fp-shotgun');
  r = await ev(() => { const W = window.__neonW; return { vm: W.VM.root.visible, cur: W.VM.cur, tpGunHidden: !window.__neon.player.H.gun.visible }; });
  check('view model shown in first person', r.vm && r.cur === 'shotgun' && r.tpGunHidden, r);
  await ev(() => { const n = window.__neon; if (typeof n.cam.setView === 'function') n.cam.setView(false); else n.cam.fp = false; n.cam.override = null; n.player.root.visible = true; });
  // ---------- drive-by ----------
  await ev(() => { const n = window.__neon, P = n.player; T.clearArea(); const c = new n.Car('sedan'); c.place(P.x + 2, P.z, P.h); c.persistent = true; P.x = c.x + 1; n.tryEnterExit(); });
  await step(10);
  r = await ev(() => { const n = window.__neon, W = window.__neonW, c = n.player.car; n.cam.yaw = c.h + Math.PI / 2; n.cam.idle = 0; const st = W.arsStore(); return { mode: n.player.mode, db: W.ARS.dbWeapon, mag: st.mag[W.ARS.dbWeapon] }; });
  await step(2);
  await ev(() => { window.__neon.cam.idle = 0; window.__neon.input.fire = true; }); await step(8); await ev(() => { window.__neon.input.fire = false; });
  const r2 = await ev(() => { const W = window.__neonW, st = W.arsStore(); return { ok: W.ARS.dbOk, mag: st.mag[W.ARS.dbWeapon], btn: !document.getElementById('bDrive').classList.contains('hidden') }; });
  check('drive-by fires from the window', r.mode === 'car' && r2.btn && r2.mag < r.mag, { r, r2 });
  await ev(() => window.__neon.tryEnterExit()); await step(5);
  // ---------- creative mode ----------
  await ev(() => window.__neon.startGame(false, 'creative'));
  await step(20);
  await ev(() => { T.clearArea(); window.__neonW.arsSelect('rifle'); });
  await step(20);
  const cm0 = await ev(() => window.__neonW.arsStore().mag.rifle);
  await pull(20);
  r = await ev(() => { const W = window.__neonW; return { owned: Object.keys(W.arsStore().owned).length, mag: W.arsStore().mag.rifle, shots: W.ARS.shotN, storySaved: !!JSON.parse(localStorage.getItem('neon-tide-save-v1')).arsenal.owned.rifle }; });
  check('creative: all weapons, infinite ammo', r.owned === 6 && r.mag === cm0 && r.storySaved, { ...r, cm0 });
  // SHOT_HOOKS: a creative prop (sphere) in front of the hero is hit directly, with nothing behind it
  r = await ev(() => { const n = window.__neon, W = window.__neonW, P = n.player; T.clearArea(); const A = W.getAim(); const c = { x: A.x + A.dx * 9, y: A.y + A.dy * 9, z: A.z + A.dz * 9, r: 0.6 }; let got = null;
    const hook = (o, dx, dy, dz, best) => { const ox = c.x - o.x, oy = c.y - o.y, oz = c.z - o.z, t = ox * dx + oy * dy + oz * dz; if (t < 0 || t > best) return null; const qx = ox - dx * t, qy = oy - dy * t, qz = oz - dz * t; return qx * qx + qy * qy + qz * qz < c.r * c.r ? { t, onHit: (h) => { got = h; } } : null; };
    W.SHOT_HOOKS.push(hook);
    const res = W.fireBullet({ x: A.x, y: A.y, z: A.z, dx: A.dx, dy: A.dy, dz: A.dz, range: 80, damage: 25, shooter: 'player', weapon: 'pistol' });
    W.SHOT_HOOKS.splice(W.SHOT_HOOKS.indexOf(hook), 1);
    return { type: res.type, dist: +res.dist.toFixed(2), got: !!got && { damage: got.damage, weapon: got.weapon, d: +got.dist.toFixed(2) } }; });
  check('SHOT_HOOKS: props can be shot', r.type === 'prop' && r.got && r.got.damage === 25 && Math.abs(r.dist - 9) < 0.7, r);
  // creative build mode: weapons ignore fire input
  r = await ev(() => { const n = window.__neon, W = window.__neonW; window.CREATIVE = { building: true }; const s0 = W.ARS.shotN; n.input.fire = true; n.step(15, 1 / 30); n.input.fire = false; const s1 = W.ARS.shotN; delete window.CREATIVE; n.step(2, 1 / 30); return { blocked: s1 === s0, fireBtn: document.getElementById('bFire').classList.contains('hidden') }; });
  check('creative build mode blocks firing', r.blocked, r);
  // weapon wheel UI
  await press('#wPill');
  await shot('weapon-wheel');
  await press('#wWheel [data-id=smg]');
  await step(20);
  r = await ev(() => ({ cur: window.__neonW.ARS.cur, open: window.__neonW.WUI.wheelOpen }));
  check('weapon wheel selects', r.cur === 'smg' && !r.open, r);
  await pull(120);
  console.log('results', JSON.stringify(res));
  console.log('console errors (' + logs.length + '):\n' + logs.slice(0, 30).join('\n'));
  if (logs.length) fails++;
  console.log(fails ? 'WEAPONS TEST FAILED (' + fails + ')' : 'WEAPONS OK');
  process.exitCode = fails ? 1 : 0;
  await browser.close();
})().catch((e) => { console.error('TEST FAILED', e); process.exit(1); });
