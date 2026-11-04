// Camera & movement feel: view toggles (V key, HUD button, pause chips), first person on foot (head hidden, bob),
// acceleration ramps, sprint until stamina runs out, jump and landing dip, cockpit view and driving, chase camera,
// third-person aim view, recoil, knockdown / death / respawn views, creative override, desktop pointer lock.
// usage: node tests/camera.js <neon-tide.html> [screenshot dir, default shots/] [part: all | foot | car | desktop]
// (the parts run independently, which keeps each run short on a busy machine)
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const FILE = process.argv[2] || path.join(ROOT, '..', 'neon-tide.html');
const SHOTS = path.resolve(process.argv[3] || path.join(ROOT, 'shots'));
const PART = process.argv[4] || 'all';
const want = (p) => PART === 'all' || PART === p;
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
let fails = 0;
const check = (name, ok, info) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name.padEnd(46) + (info !== undefined ? ' ' + JSON.stringify(info) : ''));
  if (!ok) fails++;
};
async function open(browser, opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message + ' | ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  await page.route('**/fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto('file://' + path.resolve(FILE), { timeout: 180000 });
  await page.waitForFunction(() => window.__neon && window.__neon.GAME.state === 'menu', null, { timeout: 180000 });
  return { ctx, page, logs };
}
(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ args: ARGS });
  let s, r;
  if (want('foot') || want('car')) {
    const { page, logs } = await open(browser, { viewport: { width: 720, height: 360 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    const ev = (f, a) => page.evaluate(f, a);
    const step = (n, dt) => ev(([n, dt]) => window.__neon.step(n, dt), [n, dt || 1 / 60]);
    // real touch on a HUD button; checks visibility itself because Playwright's "stable" wait needs two animation
    // frames, which can take longer than its timeout when software WebGL renders at ~1 fps on a busy machine
    const tap = async (sel) => {
      const shown = await ev((sel) => { const e = document.querySelector(sel), r = e && e.getBoundingClientRect(); return !!e && e.offsetParent !== null && r.width > 20 && r.height > 20; }, sel);
      if (!shown) throw new Error(sel + ' is not visible');
      await page.tap(sel, { force: true, timeout: 120000 });
    };
    const snap = async (name) => {
      // capture only after the live loop has drawn fresh frames (a busy machine can otherwise grab an empty canvas)
      const f0 = await ev(() => window.__neon.renderer.info.render.frame);
      await page.waitForFunction((f0) => window.__neon.renderer.info.render.frame >= f0 + 2, f0, { timeout: 120000 });
      await page.screenshot({ path: path.join(SHOTS, name + '.png'), timeout: 180000 }); console.log('     screenshot', path.join(SHOTS, name + '.png')); };
    // per-frame samples at 60 fps (eye height above the feet, speed, stamina...)
    const rec = (frames) => ev((frames) => {
      const n = window.__neon, P = n.player, out = [];
      for (let i = 0; i < frames; i++) {
        n.step(1, 1 / 60);
        out.push({ v: Math.hypot(P.vx, P.vz), st: P.stamina, ex: P.exhausted, eye: n.camera.position.y - P.y, gnd: P.onGround, view: n.cam.view });
      }
      return out;
    }, frames);
    const state = () => ev(() => {
      const n = window.__neon, P = n.player, hb = P.H.bones[5], hp = hb.getWorldPosition(new n.camera.position.constructor());
      return { view: n.cam.view, fp: n.cam.fp, head: hb.scale.x, headDist: hp.distanceTo(n.camera.position), near: n.camera.near, fov: n.camera.fov, aim: n.cam.aim, minD: n.cam.aimMinDist, mode: P.mode, dead: P.dead };
    });

    if (want('foot')) {
      await ev(() => { const n = window.__neon; n.startGame(true); n.DAY.hours = 12.5; });
      await page.waitForTimeout(800);
      await step(30);
      s = await state();
      check('starts in third person', s.view === 'tp' && !s.fp && s.head === 1, s);

      // --- view toggles: V key, HUD button, saved choice ---
      await page.keyboard.press('KeyV'); await step(40);
      s = await state();
      check('V → first person, head hidden', s.view === 'fp' && s.fp && s.head < 0.01 && s.headDist < 0.45 && s.near < 0.1, s);
      check('choice saved', await ev(() => JSON.parse(localStorage.getItem('neon-tide-save-v1')).fp === true));
      await tap('#bView'); await step(40);
      s = await state();
      check('HUD button → third person, head back', s.view === 'tp' && s.head === 1 && s.headDist > 1.5, s);
      await tap('#bView'); await step(40);
      check('HUD button → first person again', (await state()).view === 'fp');
      // pause panel chips
      await tap('#pauseBtn');
      const chips = await ev(() => ({ fp: !!document.querySelector('#pause #chipFp.on'), bob: !!document.querySelector('#pause #chipBob.on') }));
      check('pause panel has camera chips (on)', chips.fp && chips.bob, chips);
      await ev(() => document.querySelector('#chipBob').click());
      const bobOff = await ev(() => ({ bob: window.__neon.cam.bob, save: window.__neon.save.camBob, chip: document.querySelector('#chipBob').classList.contains('on') }));
      check('«Покачивание камеры» switches off', bobOff.bob === 0 && bobOff.save === false && !bobOff.chip, bobOff);
      await ev(() => document.querySelector('#chipBob').click());
      await tap('#resumeBtn');
      check('resumed with bob on', await ev(() => window.__neon.GAME.state === 'play' && window.__neon.cam.bob === 1));

      // --- walking in first person: ramps and bob ---
      await ev(() => { const n = window.__neon, P = n.player; P.x = n.roadC(3) + 3; P.z = n.roadC(0) + 30; P.y = n.groundH(P.x, P.z); P.h = 0; n.cam.yaw = 0; n.cam.pitch = 0.04; });
      await step(60);
      const idle = await rec(150);
      const idleEye = idle.map((r) => r.eye);
      await page.keyboard.down('KeyW');
      r = await rec(90);
      check('start ramps up (no instant start)', r[11].v < 2.6 && r[11].v > 0.3, { v200ms: r[11].v.toFixed(2) });
      check('jog speed reached in ~0.7 s', Math.abs(r[45].v - 4.1) < 0.2, { v750ms: r[45].v.toFixed(2) });
      r = await rec(120);
      const jogEye = r.map((x) => x.eye);
      const amp = (a) => Math.max(...a) - Math.min(...a);
      check('FP bob: idle breathing subtle, jog bob visible', amp(idleEye) < 0.03 && amp(jogEye) > 0.015 && amp(jogEye) < 0.07, { idle: amp(idleEye).toFixed(3), jog: amp(jogEye).toFixed(3) });
      await snap('cam_fp_foot');
      await page.keyboard.up('KeyW');
      r = await rec(40);
      const stopI = r.findIndex((x) => x.v < 0.05);
      check('stops with a short brake (0.15–0.6 s)', stopI > 8 && stopI < 36, { frames: stopI });

      // --- sprint until stamina runs out ---
      await ev(() => { const n = window.__neon, P = n.player; P.x = n.roadC(3) + 3; P.z = n.roadC(0) + 12; P.y = n.groundH(P.x, P.z); P.h = 0; n.cam.yaw = 0; });
      await step(10);
      await page.keyboard.down('KeyW'); await page.keyboard.down('ShiftLeft');
      r = await rec(60 * 9);
      const exI = r.findIndex((x) => x.ex);
      const topV = Math.max(...r.slice(0, exI > 0 ? exI : r.length).map((x) => x.v));
      check('sprint is faster than jog', topV > 6.5, { topV: topV.toFixed(2) });
      check('stamina runs out after 5–8 s of sprint', exI > 60 * 5 && exI < 60 * 8, { seconds: (exI / 60).toFixed(2) });
      const tired = r.slice(exI + 60);
      check('winded: sprint blocked, speed capped', tired.length > 0 && Math.max(...tired.map((x) => x.v)) < 3.35, { v: tired.length && Math.max(...tired.map((x) => x.v)).toFixed(2) });
      const bar = await ev(() => { const b = document.getElementById('stamBar'); return { on: b.classList.contains('on'), tired: b.classList.contains('tired') }; });
      check('stamina bar shown, marked winded', bar.on && bar.tired, bar);
      await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW');
      r = await rec(60 * 4);
      const recI = r.findIndex((x) => !x.ex);
      check('recovers when resting', recI >= 0 && recI < 60 * 3.5, { seconds: (recI / 60).toFixed(2) });
      r = await rec(60 * 3);
      check('stamina full and bar hidden again', r[r.length - 1].st > 0.99 && !(await ev(() => document.getElementById('stamBar').classList.contains('on'))));

      // --- jump and landing ---
      await step(30);
      const eye0 = (await rec(1))[0].eye;
      await page.keyboard.press('Space');
      r = await rec(80);
      const air = r.filter((x) => !x.gnd).length, land = r.findIndex((x, i) => i > 5 && x.gnd);
      const dip = eye0 - Math.min(...r.slice(land, land + 25).map((x) => x.eye));
      check('jump has air time 0.5–0.7 s', air > 30 && air < 42, { frames: air });
      check('landing dips the first-person camera', dip > 0.03 && dip < 0.15, { dip: dip.toFixed(3) });

      // --- punch in first person keeps working ---
      await page.keyboard.press('KeyE'); await step(8);
      check('punch animates in first person', await ev(() => window.__neon.player.anim.punch > 0));
      await step(30);
    }

    if (want('car')) {
      if (!want('foot')) {
        // car part on its own: fresh game in first person next to the mission car
        await ev(() => { const n = window.__neon; n.startGame(true); n.DAY.hours = 12.5; n.cam.setView(true); });
        await page.waitForTimeout(800); await step(40);
      }
      // --- enter a car in first person, cockpit, drive ---
      await ev(() => { const n = window.__neon, P = n.player; P.x = 293.5; P.z = -24; P.y = n.groundH(P.x, P.z); n.cam.yaw = Math.PI; });
      await step(3);
      await ev(() => { const n = window.__neon; for (const c of n.cars) c.setInteriorVisible = c.setInteriorVisible || function (v) { this._iv = v; }; n.tryEnterExit(); });
      await step(40);
      s = await state();
      const eyeErr = await ev(() => { const n = window.__neon, c = n.player.car, e = c.eyeWorld(n.camera.position.clone()); e.y += 0.05; return e.distanceTo(n.camera.position); });
      check('in car: cockpit view at the driver eye', s.mode === 'car' && s.view === 'cockpit' && eyeErr < 0.12, { view: s.view, eyeErr: eyeErr.toFixed(3) });
      check('car interior shown in cockpit', await ev(() => window.__neon.player.car._iv === true));
      await page.keyboard.down('KeyW'); await step(150); await page.keyboard.up('KeyW');
      const drv = await ev(() => { const n = window.__neon, c = n.player.car, e = c.eyeWorld(n.camera.position.clone()); return { kmh: c.speed * 3.6, err: e.distanceTo(n.camera.position), yawErr: Math.abs(((n.cam.vYaw - c.h + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI) }; });
      check('drives in cockpit, camera stays at the eye', drv.kmh > 25 && drv.err < 0.2 && drv.yawErr < 0.35, drv);
      await snap('cam_fp_car');
      await page.keyboard.press('KeyV'); await step(40);
      const ch = await ev(() => { const n = window.__neon, c = n.player.car, p = n.camera.position, dx = p.x - c.x, dz = p.z - c.z; return { view: n.cam.view, back: dx * Math.sin(c.h) + dz * Math.cos(c.h), dist: Math.hypot(dx, dz), iv: c._iv }; });
      check('V in car → chase camera behind the car', ch.view === 'chase' && ch.back < -3 && ch.dist < 13 && ch.iv === false, ch);
      await page.keyboard.press('KeyV'); await step(30);
      // stop on a quiet road: passing traffic would knock the hero down (which rightly switches to third person)
      await ev(() => { const n = window.__neon, c = n.player.car; c.vx = c.vz = 0; for (const o of n.cars.slice()) if (o !== c && o.ai && Math.hypot(o.x - c.x, o.z - c.z) < 60) o.remove(); });
      await page.keyboard.press('KeyF'); await step(40);
      const knocked = await ev(() => { const n = window.__neon; let k = 0; while (n.player.knockT > 0 && k++ < 300) n.step(1, 1 / 60); n.step(30, 1 / 60); return k; });
      s = await state();
      check('exit car → first person on foot', s.mode === 'foot' && s.view === 'fp' && s.head < 0.01, Object.assign({ knockedFrames: knocked }, s));

      // --- third-person aim view, aim ray, recoil ---
      await page.keyboard.press('KeyV');
      await ev(() => { const n = window.__neon; n.cam.pitch = 0.06; });
      await step(40);
      const fovTP = (await state()).fov;
      await ev(() => { window.__neon.cam.wantAim = true; });
      await step(30);
      s = await state();
      const aimInfo = await ev(() => {
        const n = window.__neon, a = n.getAim(), P = n.player, d = new n.camera.position.constructor();
        n.camera.getWorldDirection(d);
        const toHero = Math.hypot(P.x - a.x, P.z - a.z);
        return { dot: a.dx * d.x + a.dy * d.y + a.dz * d.z, toHero, facing: Math.abs(((P.h - n.cam.vYaw + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI) };
      });
      check('aim view: tighter, lower FOV', s.view === 'tp' && s.aim === 1 && s.fov < fovTP - 8 && aimInfo.toHero < 3, { fov: s.fov.toFixed(1), fovTP: fovTP.toFixed(1), toHero: aimInfo.toHero.toFixed(2) });
      check('getAim = camera ray, minDist past the hero', aimInfo.dot > 0.9999 && s.minD > aimInfo.toHero && s.minD < aimInfo.toHero + 1.5, { minD: s.minD.toFixed(2) });
      check('hero faces the aim direction', aimInfo.facing < 0.1, aimInfo);
      await snap('cam_tp_aim');
      const dy0 = await ev(() => window.__neon.getAim().dy);
      await ev(() => window.__neon.cam.kick(0.06, 0.01));
      await step(4);
      const dy1 = await ev(() => window.__neon.getAim().dy);
      await step(90);
      const dy2 = await ev(() => window.__neon.getAim().dy);
      check('recoil kick raises the aim and recovers', dy1 - dy0 > 0.02 && Math.abs(dy2 - dy0) < 0.004, { dy0: dy0.toFixed(4), dy1: dy1.toFixed(4), dy2: dy2.toFixed(4) });
      await ev(() => { window.__neon.cam.wantAim = false; });
      await step(20);

      // --- knockdown, death and respawn in first person ---
      await page.keyboard.press('KeyV'); await step(30);
      await ev(() => { const P = window.__neon.player; P.knockT = 1.4; P.vy = 2; });
      r = await rec(20);
      check('knockdown switches to third person', r[r.length - 1].view === 'tp');
      r = await rec(90);
      check('back to first person after getting up', r[r.length - 1].view === 'fp');
      await ev(() => window.__neon.hurtPlayer(500, 'тест'));
      await step(30);
      s = await state();
      check('death camera is third person, head visible', s.dead && s.view === 'death' && s.head === 1 && s.headDist > 2, s);
      await page.waitForTimeout(4300);
      await step(30);
      s = await state();
      check('respawn returns to first person', !s.dead && s.view === 'fp' && s.head < 0.01, s);

      // --- creative override restores the head and gives the camera back ---
      await ev(() => { const n = window.__neon; n.cam.override = () => { n.camera.position.set(n.player.x + 6, n.player.y + 4, n.player.z + 6); n.camera.lookAt(n.player.x, n.player.y + 1, n.player.z); }; });
      await step(10);
      s = await state();
      check('override: camera handed over, head visible', s.view === 'override' && s.head === 1, s);
      await ev(() => { window.__neon.cam.override = null; });
      await step(40);
      check('override removed → first person again', (await state()).view === 'fp');

      // --- creative play: both views work there too ---
      await ev(() => { window.__neon.startGame(false, 'creative'); });
      await step(60);
      const cr = [];
      for (let i = 0; i < 2; i++) {
        await page.keyboard.down('KeyW'); await step(40); await page.keyboard.up('KeyW');
        cr.push(await ev(() => window.__neon.GAME.mode + ':' + window.__neon.cam.view));
        await page.keyboard.press('KeyV'); await step(30);
      }
      check('creative mode: walk in both views', cr.includes('creative:fp') && cr.includes('creative:tp'), cr);
    }

    console.log('touch page console errors (' + logs.length + ')' + (logs.length ? ':\n' + logs.slice(0, 20).join('\n') : ''));
    if (logs.length) fails++;
  }

  if (want('desktop')) {
    // --- desktop: pointer lock mouse look, Esc opens pause ---
    const D = await open(browser, { viewport: { width: 900, height: 450 }, deviceScaleFactor: 1 });
    await D.page.evaluate(() => { window.__neon.startGame(false); });
    await D.page.waitForTimeout(900);
    let locked = false;
    for (let i = 0; i < 4 && !locked; i++) {
      await D.page.mouse.click(600 + i * 10, 200);
      await D.page.waitForTimeout(400);
      locked = await D.page.evaluate(() => !!document.pointerLockElement && window.__neon.cam.locked);
    }
    if (locked) {
      // headless Chromium reports bogus movementX under pointer lock, so feed realistic relative motion directly
      const look = await D.page.evaluate(() => {
        const n = window.__neon, y0 = n.cam.yaw, v0 = n.cam.vYaw;
        for (let i = 0; i < 10; i++) { document.dispatchEvent(new MouseEvent('mousemove', { movementX: 12, movementY: 0 })); n.step(1, 1 / 60); }
        n.step(10, 1 / 60);
        const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));   // vYaw is kept in (-π, π]
        return { dyaw: wrap(n.cam.yaw - y0), dview: wrap(n.cam.vYaw - v0), expected: -120 * 0.0022 * (n.save.sens || 1) };
      });
      check('desktop: pointer lock mouse look turns camera', Math.abs(look.dyaw - look.expected) < 0.01 && Math.abs(look.dview - look.expected) < 0.02, look);
      await D.page.keyboard.press('Escape');
      await D.page.waitForTimeout(300);
      check('desktop: Esc releases the lock and pauses', await D.page.evaluate(() => window.__neon.GAME.state === 'pause' && !document.pointerLockElement));
    } else console.log('     desktop pointer lock not available in this browser: skipped');
    console.log('desktop page console errors (' + D.logs.length + ')' + (D.logs.length ? ':\n' + D.logs.slice(0, 20).join('\n') : ''));
    if (D.logs.length) fails++;
  }
  await browser.close();
  console.log(fails ? 'CAMERA TEST FAILED (' + fails + ')' : 'camera test OK');
  if (fails) process.exitCode = 1;
})().catch((e) => { console.error('TEST FAILED', e); process.exit(1); });
