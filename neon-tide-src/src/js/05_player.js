// ============================================================
//  Player: on-foot movement, entering/leaving cars, damage, death
//  (owner: camera & feel)
//  Movement has weight: acceleration and braking ramps, slower turning at speed, walk / jog / sprint,
//  and stamina for sprinting. In first person or while aiming the hero faces the camera and strafes.
//  Read-only extras: player.stamina (0..1), player.exhausted, player.sprinting, player.breath (0..1 exertion).
//  player.faceCamT: seconds the hero keeps facing the camera direction (weapons may set it on hip fire).
//  Animation extras: anim.dir = movement direction relative to facing in radians (0 forward, +π/2 left,
//  −π/2 right, ±π back); anim.breath = exertion 0..1.
// ============================================================
const GAME = { state: 'loading', time: 0, mode: 'story', cheats: { god: false, noPolice: false } };
const player = {
  x: 0, y: 0, z: 0, vx: 0, vz: 0, vy: 0, h: 0, onGround: true, mode: 'foot', car: null, health: 100,
  H: null, root: null, blob: null, anim: { phase: 0, speed: 0, punch: 0, air: false, t: 0, hands: false, dir: 0, breath: 0 },
  punchCd: 0, pendingHit: null, regenT: 0, dead: false, knockT: 0, stepPhase: 0,
  stamina: 1, exhausted: false, sprinting: false, breath: 0, stamRegenT: 0, faceCamT: 0,
};
// on-foot tuning (m/s, m/s², rad/s, stamina per second)
const FOOTCFG = {
  walk: 1.7, jog: 4.1, sprint: 6.9, tired: 3.2, aim: 2.3, back: 0.62, side: 0.86,
  accel: 9.5, accelHi: 5.2, decel: 12, air: 2.4, gravity: 19.5, jumpV: 5.9,
  turnSlow: 11, turnJog: 5.4, turnSprint: 2.8,
  drain: 0.155, regenIdle: 0.3, regenMove: 0.17, regenDelay: 0.9, recover: 0.42, jumpCost: 0.07,
};
function tickStamina(dt, draining, spd) {
  const P = player;
  if (draining) { P.stamina -= FOOTCFG.drain * dt; P.stamRegenT = FOOTCFG.regenDelay; P.breath = Math.min(1, P.breath + dt * 0.2); }
  else {
    P.stamRegenT -= dt;
    if (P.stamRegenT <= 0) P.stamina += (spd > 2.5 ? FOOTCFG.regenMove : FOOTCFG.regenIdle) * dt;
    P.breath = Math.max(0, P.breath - dt * (P.exhausted ? 0.045 : 0.085));
  }
  if (P.stamina <= 0) { P.stamina = 0; if (!P.exhausted) { P.exhausted = true; P.breath = 1; EV.emit('exhausted'); } }
  else if (P.exhausted && P.stamina >= FOOTCFG.recover) P.exhausted = false;
  if (P.stamina > 1) P.stamina = 1;
}
function resetStamina() { const P = player; P.stamina = 1; P.exhausted = false; P.sprinting = false; P.breath = 0; P.stamRegenT = 0; P.faceCamT = 0; }
EV.on('start', resetStamina);
function initPlayer() {
  player.H = buildHuman(HERO_LOOK);
  player.root = player.H.root; player.root.rotation.order = 'YXZ';
  scene.add(player.root);
  player.blob = new THREE.Mesh(blobGeo, blobMat); player.blob.scale.set(1.2, 1, 1.2); player.blob.renderOrder = 1; scene.add(player.blob);
}

// ---------- on foot ----------
function updateFoot(dt) {
  const P = player;
  const g = groundH(P.x, P.z);
  if (P.dead) {
    P.vx = damp(P.vx, 0, 3, dt); P.vz = damp(P.vz, 0, 3, dt);
    P.anim.mode = P.anim.hands ? 'normal' : 'down'; P.anim.speed = 0; P.anim.punch = 0; P.anim.t += dt;
    animHuman(P.H, P.anim, dt);
    P.root.position.set(P.x, g + (P.anim.hands ? 0 : 0.13), P.z);
    P.root.rotation.set(P.anim.hands ? 0 : -Math.PI / 2, P.h, 0);
    return;
  }
  if (P.knockT > 0) {
    P.knockT -= dt;
    P.vy -= 17 * dt; P.y += P.vy * dt; P.x += P.vx * dt; P.z += P.vz * dt;
    const hit = collideCircle(P.x, P.z, 0.35, P.y + 0.2); P.x = hit.x; P.z = hit.z;
    const gg = groundH(P.x, P.z);
    if (P.y < gg) { P.y = gg; P.vy = 0; P.vx *= 0.8; P.vz *= 0.8; }
    const getT = P.knockT < 0.75 ? 1 - P.knockT / 0.75 : 0;
    const tilt = P.knockT >= 0.75 ? Math.PI / 2 * Math.min(1, (1.6 - P.knockT) * 4) : Math.PI / 2 * (1 - sstep(0, 0.4, getT));
    P.anim.mode = P.knockT >= 0.75 ? 'down' : 'getup'; P.anim.getT = getT; P.anim.speed = 0; P.anim.punch = 0; P.anim.t += dt;
    animHuman(P.H, P.anim, dt);
    P.root.position.set(P.x, P.y + Math.sin(tilt) * 0.13, P.z); P.root.rotation.set(-tilt, P.h, 0);
    P.blob.position.set(P.x, gg + 0.03, P.z);
    if (P.knockT <= 0) { P.root.rotation.set(0, P.h, 0); P.anim.mode = 'normal'; }
    return;
  }
  const jx = input.jx, jy = input.jy, mag = Math.min(1, Math.hypot(jx, jy));
  const yawRef = cam.vYaw;   // the view the player sees
  const fx = Math.sin(yawRef), fz = Math.cos(yawRef), rx = -fz, rz = fx;
  let mx = fx * jy + rx * jx, mz = fz * jy + rz * jx;
  const ml = Math.hypot(mx, mz); if (ml > 1e-4) { mx /= ml; mz /= ml; }
  const moving = mag > 0.12, aiming = cam.wantAim || cam.aim > 0.3;
  if (P.faceCamT > 0) P.faceCamT -= dt;
  const strafe = cam.fp || aiming || P.faceCamT > 0;
  const spd0 = Math.hypot(P.vx, P.vz);
  // gait: stick deflection picks a slow walk → walk → jog; sprint needs the sprint input and stamina
  let tsp = 0;
  if (moving) tsp = mag < 0.62 ? lerp(0.85, FOOTCFG.walk, (mag - 0.12) / 0.5) : lerp(FOOTCFG.walk, FOOTCFG.jog, sstep(0.62, 0.95, mag));
  P.sprinting = moving && input.sprint && !aiming && !P.exhausted && mag > 0.5;
  if (P.sprinting) tsp = FOOTCFG.sprint;
  if (P.exhausted) tsp = Math.min(tsp, FOOTCFG.tired);
  if (aiming) tsp = Math.min(tsp, FOOTCFG.aim);
  const prevH = P.h;
  let tvx = 0, tvz = 0;
  if (strafe) {
    // face the camera, move in any direction (slower backwards and sideways, sprint only forwards)
    P.h = dampA(P.h, yawRef, cam.fp ? 22 : 12, dt);
    if (moving) {
      const fwd = mx * Math.sin(P.h) + mz * Math.cos(P.h);
      let k = fwd >= 0 ? lerp(FOOTCFG.side, 1, fwd) : lerp(FOOTCFG.side, FOOTCFG.back, -fwd);
      if (P.sprinting && fwd < 0.55) k = Math.min(k, FOOTCFG.jog / FOOTCFG.sprint);
      tvx = mx * tsp * k; tvz = mz * tsp * k;
    }
  } else if (moving) {
    // turn toward the stick with a rate that drops with speed: a sprinting body carries its momentum
    const want = Math.atan2(mx, mz), diff = wrapA(want - P.h);
    const rate = lerp(lerp(FOOTCFG.turnSlow, FOOTCFG.turnJog, sstep(1.2, 4.2, spd0)), FOOTCFG.turnSprint, sstep(4.4, 6.8, spd0));
    const lim = rate * dt;
    P.h = wrapA(P.h + clamp(diff * (1 - Math.exp(-14 * dt)), -lim, lim));
    // sharp direction changes plant the feet: speed drops until the body faces the new way
    const align = lerp(0.3, 1, sstep(-0.35, 0.85, Math.cos(wrapA(want - P.h))));
    tvx = Math.sin(P.h) * tsp * align; tvz = Math.cos(P.h) * tsp * align;
  }
  // acceleration ramps: a gentle start, slower build-up above a jog, firmer braking, little air control
  {
    const dvx = tvx - P.vx, dvz = tvz - P.vz, dl = Math.hypot(dvx, dvz);
    if (dl > 1e-6) {
      const tl = Math.hypot(tvx, tvz);
      const a = !P.onGround ? FOOTCFG.air : tl > spd0 + 0.05 ? (spd0 > FOOTCFG.jog - 0.2 ? FOOTCFG.accelHi : FOOTCFG.accel * (0.6 + 0.4 * sstep(0, 1.6, spd0))) : FOOTCFG.decel;
      const m = Math.min(1, a * dt / dl);
      P.vx += dvx * m; P.vz += dvz * m;
    }
  }
  const wasGround = P.onGround;
  if (input.jump && P.onGround) {
    P.vy = P.exhausted || P.stamina < FOOTCFG.jumpCost ? FOOTCFG.jumpV * 0.82 : FOOTCFG.jumpV;
    P.stamina = Math.max(0, P.stamina - FOOTCFG.jumpCost); P.stamRegenT = Math.max(P.stamRegenT, 0.5);
    P.onGround = false; AUD.jump();
  }
  input.jump = false;
  P.vy -= FOOTCFG.gravity * dt; P.y += P.vy * dt;
  P.x += P.vx * dt; P.z += P.vz * dt;
  const hit = collideCircle(P.x, P.z, 0.35, P.y + 0.25); P.x = hit.x; P.z = hit.z;
  // cars push the player; fast cars knock him down
  for (const c of cars) {
    if (Math.abs(c.x - P.x) > 5 || Math.abs(c.z - P.z) > 5) continue;
    const r = carCircles(c, CA) + 0.35;
    for (let i = 0; i < 3; i++) {
      const dx = P.x - CA[i * 2], dz = P.z - CA[i * 2 + 1], d2 = dx * dx + dz * dz;
      if (d2 < r * r && P.y < c.y + 1.4) {
        const d = Math.sqrt(d2) || 0.01, pen = r - d;
        P.x += dx / d * pen; P.z += dz / d * pen;
        const sp = c.speed;
        if (sp > 6) {
          hurtPlayer((sp - 5) * 3.2, 'Сбит машиной');
          P.knockT = 1.6; P.vx = c.vx * 0.6 + dx / d * 3; P.vz = c.vz * 0.6 + dz / d * 3; P.vy = 3 + sp * 0.12; AUD.thud(1); shakeCam(0.5);
        }
        break;
      }
    }
  }
  for (const p of peds) {
    if (!p.alive) continue;
    const dx = P.x - p.x, dz = P.z - p.z, d2 = dx * dx + dz * dz;
    if (d2 < 0.49 && d2 > 1e-6) { const d = Math.sqrt(d2), pen = 0.7 - d; P.x += dx / d * pen * 0.5; P.z += dz / d * pen * 0.5; }
  }
  const gg = groundH(P.x, P.z);
  // stay glued to the ground going down slopes and small kerbs; real falls land with weight
  if (P.y <= gg + 0.001 || (wasGround && P.vy <= 0 && P.y - gg < 0.12)) {
    const vLand = -P.vy;
    P.y = gg; if (P.vy < 0) P.vy = 0; P.onGround = true;
    if (!wasGround && vLand > 2.5) {
      camLand(vLand);
      if (vLand > 7.5) { P.vx *= 0.55; P.vz *= 0.55; AUD.thud(0.3); } else AUD.step(6);
    }
  } else P.onGround = false;
  // punch
  P.punchCd -= dt;
  if (input.punch && P.punchCd <= 0) {
    P.punchCd = 0.42; P.anim.punch = 0.001; P.anim.punchSide = -(P.anim.punchSide || -1); AUD.whoosh();
    let best = null, bd = 1.8;
    for (const p of peds) {
      if (p.state === 'dead' || p.state === 'fly') continue;
      const dx = p.x - P.x, dz = p.z - P.z, d = Math.hypot(dx, dz);
      if (d > bd) continue;
      if (Math.abs(wrapA(Math.atan2(dx, dz) - P.h)) > 1.2) continue;
      best = p; bd = d;
    }
    if (best) P.pendingHit = { ped: best, t: 0.12 };
  }
  input.punch = false;
  if (P.pendingHit) {
    P.pendingHit.t -= dt;
    if (P.pendingHit.t <= 0) {
      const p = P.pendingHit.ped; P.pendingHit = null;
      if (!p.removed && p.state !== 'fly') {
        const dx = p.x - P.x, dz = p.z - P.z, d = Math.hypot(dx, dz) || 1;
        const wasAlive = p.state !== 'dead';
        p.knock(dx / d * 3.2, dz / d * 3.2, 3.5, 'player');
        p.health -= 8;
        AUD.punch(); shakeCam(0.12);
        if (wasAlive) addCrime(p.health <= 0 ? 0.9 : 0.3, 'Драка на улице — вызвали полицию');
        for (const o of peds) if (o !== p && Math.hypot(o.x - P.x, o.z - P.z) < 14) o.flee(P.x, P.z);
      }
    }
  }
  if (P.anim.punch > 0) { P.anim.punch += dt / 0.4; if (P.anim.punch >= 1) P.anim.punch = 0; }
  const spd = Math.hypot(P.vx, P.vz);
  tickStamina(dt, P.sprinting && spd > FOOTCFG.jog * 0.85, spd);
  P.anim.speed = spd; P.anim.t += dt; P.anim.air = P.y > gg + 0.25; P.anim.vy = P.vy; P.anim.mode = 'normal';
  P.anim.turn = wrapA(P.h - prevH) / Math.max(dt, 1e-3);
  if (spd > 0.3) P.anim.dir = wrapA(Math.atan2(P.vx, P.vz) - P.h);
  P.anim.breath = P.breath;
  P.anim.flinch = Math.max(0, (P.anim.flinch || 0) - dt * 4);
  if (animHuman(P.H, P.anim, dt) && P.onGround) { AUD.step(spd); camStep(spd); }
  P.root.position.set(P.x, P.y, P.z); P.root.rotation.set(0, P.h, 0);
  P.blob.position.set(P.x, gg + 0.03, P.z);
}
function nearestEnterableCar() {
  let best = null, bd = 4.3;
  for (const c of cars) {
    if (c.exploded || c.wrecked) continue;
    const d = Math.hypot(c.x - player.x, c.z - player.z);
    if (d < bd && Math.abs(c.y - player.y) < 1.6) { bd = d; best = c; }
  }
  return best;
}
function enterCar(c) {
  const P = player;
  if (c.driver === 'ai' || c.driver === 'npc' || c.driver === 'police') {
    const fx = Math.sin(c.h), fz = Math.cos(c.h);
    const look = c.driver === 'police' ? COP_LOOK : randomLook();
    const ped = new Ped(look, c.x + fz * 1.8, c.z - fx * 1.8);
    ped.flee(P.x, P.z, 8); ped.rect = null;
    if (c.driver === 'police') { ped.cop = true; addCrime(1.2, 'Угон полицейской машины!'); }
    else if (c.mission !== 'target') addCrime(0.45, 'Угон машины');
  }
  if (c.kinematic) c.makeDynamic();
  if (c.ai) { c.ai.release(); c.ai = null; }
  c.driver = 'player'; c.persistent = true;
  P.car = c; P.mode = 'car'; P.root.visible = false; P.blob.visible = false;
  P.vx = P.vz = 0;
  cam.idle = 2;
  AUD.door(); HUD.setMode('car');
  EV.emit('enterCar', c);
}
function exitCar() {
  const P = player, c = P.car; if (!c) return;
  const fx = Math.sin(c.h), fz = Math.cos(c.h), lx = fz, lz = -fx;
  let ex = c.x + lx * 1.9, ez = c.z + lz * 1.9;
  let hit = collideCircle(ex, ez, 0.4);
  if (hit.depth > 0.3 || pointInBuilding(ex, ez)) { ex = c.x - lx * 1.9; ez = c.z - lz * 1.9; hit = collideCircle(ex, ez, 0.4); }
  P.x = hit.x; P.z = hit.z; P.y = groundH(P.x, P.z); P.h = c.h; P.vy = 0;
  P.vx = c.vx * 0.3; P.vz = c.vz * 0.3;
  c.driver = null; c.braking = false;
  P.car = null; P.mode = 'foot'; P.root.visible = true; P.blob.visible = true;
  AUD.door(); HUD.setMode('foot');
  EV.emit('exitCar', c);
  if (c.speed > 10) { P.knockT = 1.4; P.vy = 2; hurtPlayer(c.speed * 0.6, 'Выпрыгнул на ходу'); }
}

// ---------- damage / death ----------
function hurtPlayer(d, why) {
  if (player.dead || GAME.state !== 'play' || GAME.cheats.god) return;
  player.health -= d; player.regenT = 6; player.anim.flinch = 1;
  HUD.hurt();
  if (player.health <= 0) killPlayer(why);
}
function killPlayer(why) {
  if (player.dead) return;
  player.dead = true; player.health = 0;
  if (player.mode === 'car') { const c = player.car; exitCar(); player.x = c.x + 2; player.z = c.z; }
  player.anim.mode = 'down'; player.anim.punch = 0; player.root.rotation.set(-Math.PI / 2, player.h, 0);
  player.root.visible = true;
  failMission(null);
  HUD.dead('ВЫ ПОГИБЛИ', why || '', false);
  EV.emit('playerDied');
  AUD.fail();
  setTimeout(() => respawn(SPOT.hospital, 120, 'Больница Святой Марины. Счёт за лечение: '), 3300);
}
function bustPlayer() {
  if (player.dead) return;
  player.dead = true;
  if (player.mode === 'car') exitCar();
  player.anim.hands = true; player.anim.speed = 0;
  failMission(null);
  HUD.dead('ЗАДЕРЖАН', 'Полиция забрала часть денег', true);
  EV.emit('playerBusted');
  AUD.fail();
  setTimeout(() => respawn(SPOT.station, 200, 'Залог: '), 3300);
}
function respawn(spot, fee, msg) {
  HUD.fade(true);
  setTimeout(() => {
    const paid = Math.min(save.money, fee);
    save.money -= paid; writeSave();
    clearWanted();
    for (const p of police.slice()) { if (!p.car.dead) p.car.remove(); }
    police.length = 0;
    player.dead = false; player.health = 100; player.knockT = 0; player.anim.hands = false; player.anim.punch = 0; resetStamina();
    player.x = spot.x; player.z = spot.z; player.y = groundH(spot.x, spot.z); player.vx = player.vz = player.vy = 0;
    player.root.rotation.set(0, 0, 0); player.root.visible = true; player.blob.visible = true; player.anim.mode = 'normal';
    player.mode = 'foot'; player.car = null; HUD.setMode('foot');
    HUD.dead(null);
    HUD.fade(false);
    if (paid > 0) HUD.toast(msg + '$' + paid, 'warn');
    EV.emit('respawn');
  }, 650);
}

