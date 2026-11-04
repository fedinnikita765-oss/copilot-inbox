// ============================================================
//  Player, camera, missions, pickups
// ============================================================
const GAME = { state: 'loading', time: 0 };
const player = {
  x: 0, y: 0, z: 0, vx: 0, vz: 0, vy: 0, h: 0, onGround: true, mode: 'foot', car: null, health: 100,
  H: null, root: null, blob: null, anim: { phase: 0, speed: 0, punch: 0, air: false, t: 0, hands: false },
  punchCd: 0, pendingHit: null, regenT: 0, dead: false, knockT: 0, stepPhase: 0,
};
function initPlayer() {
  player.H = buildHuman(HERO_LOOK);
  player.root = player.H.root; player.root.rotation.order = 'YXZ';
  scene.add(player.root);
  player.blob = new THREE.Mesh(blobGeo, blobMat); player.blob.scale.set(1.2, 1, 1.2); player.blob.renderOrder = 1; scene.add(player.blob);
}

// ---------- camera ----------
const cam = { yaw: 0, pitch: 0.3, idle: 0, shake: 0, zoom: 1, curDist: 6, look: 0 };
function shakeCam(a) { cam.shake = Math.min(1.2, cam.shake + a); }
function updateCamera(dt) {
  let tx, ty, tz, dist;
  if (player.mode === 'car' && player.car) {
    const c = player.car;
    tx = c.x; ty = c.y + 1.55; tz = c.z;
    dist = 6.2 + c.T.L * 0.45 + Math.min(c.speed, 45) * 0.055;
    cam.idle += dt;
    if (cam.idle > 1.1) {
      const target = c.vf < -4 ? c.h + Math.PI : c.h;
      cam.yaw = dampA(cam.yaw, target, Math.min(4.5, 1 + c.speed * 0.12), dt);
      cam.pitch = damp(cam.pitch, 0.2, 1.8, dt);
    }
  } else {
    tx = player.x; ty = player.y + 1.6; tz = player.z; dist = 4.4;
    cam.idle += dt;
  }
  cam.pitch = clamp(cam.pitch, -0.25, 1.15);
  dist *= cam.zoom;
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const dx = -Math.sin(cam.yaw) * cp, dy = sp, dz = -Math.cos(cam.yaw) * cp;
  const t = rayBoxes(tx, ty, tz, dx, dy, dz, dist + 0.5);
  const d = t < dist + 0.5 ? Math.max(1.0, t - 0.5) : dist;
  cam.curDist = d < cam.curDist ? d : damp(cam.curDist, d, 3, dt);
  let cx = tx + dx * cam.curDist, cy = ty + dy * cam.curDist, cz = tz + dz * cam.curDist;
  cy = Math.max(cy, groundH(cx, cz) + 0.35);
  if (cam.shake > 0) {
    const s = cam.shake * 0.22;
    cx += (Math.random() - 0.5) * s; cy += (Math.random() - 0.5) * s; cz += (Math.random() - 0.5) * s;
    cam.shake = Math.max(0, cam.shake - dt * 2.4);
  }
  camera.position.set(cx, cy, cz);
  camera.lookAt(tx, ty + 0.1, tz);
  const base = window.innerWidth < window.innerHeight ? 78 : 62;
  const spd = player.mode === 'car' && player.car ? player.car.speed : 0;
  const fov = base + Math.min(14, spd * 0.26) + (player.car && player.car.usingNitro ? 7 : 0);
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = damp(camera.fov, fov, 3, dt); camera.updateProjectionMatrix(); }
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
  const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw), rx = -fz, rz = fx;
  let mx = fx * jy + rx * jx, mz = fz * jy + rz * jx;
  const ml = Math.hypot(mx, mz); if (ml > 1e-4) { mx /= ml; mz /= ml; }
  const run = input.sprint || mag > 0.93;
  const tsp = mag < 0.12 ? 0 : (run ? 7.4 : 3.3 * Math.max(0.45, mag));
  const k = P.onGround ? 11 : 2.5;
  P.vx = damp(P.vx, mx * tsp, k, dt); P.vz = damp(P.vz, mz * tsp, k, dt);
  const prevH = P.h;
  if (tsp > 0) P.h = dampA(P.h, Math.atan2(mx, mz), 12, dt);
  if (input.jump && P.onGround) { P.vy = 5.4; P.onGround = false; AUD.jump(); }
  input.jump = false;
  P.vy -= 17 * dt; P.y += P.vy * dt;
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
  if (P.y <= gg + 0.001) { P.y = gg; if (P.vy < 0) P.vy = 0; P.onGround = true; } else P.onGround = false;
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
  P.anim.speed = spd; P.anim.t += dt; P.anim.air = P.y > gg + 0.25; P.anim.vy = P.vy; P.anim.mode = 'normal';
  P.anim.turn = wrapA(P.h - prevH) / Math.max(dt, 1e-3);
  P.anim.flinch = Math.max(0, (P.anim.flinch || 0) - dt * 4);
  if (animHuman(P.H, P.anim, dt) && P.onGround) AUD.step(spd);
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
  if (c.speed > 10) { P.knockT = 1.4; P.vy = 2; hurtPlayer(c.speed * 0.6, 'Выпрыгнул на ходу'); }
}

// ---------- driving ----------
let skidMesh = null, skidI = 0;
const SKID_N = 700;
function initSkids() {
  const g = new THREE.PlaneGeometry(0.26, 1); g.rotateX(-Math.PI / 2);
  skidMesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), SKID_N);
  for (let i = 0; i < SKID_N; i++) setInst(skidMesh, i, 0, -50, 0, 0, 0.001, 0.001, 0.001);
  skidMesh.frustumCulled = false; skidMesh.renderOrder = 1;
  scene.add(skidMesh);
}
function addSkid(x0, z0, x1, z1, y) {
  const len = Math.hypot(x1 - x0, z1 - z0); if (len < 0.05 || len > 3) return;
  setInst(skidMesh, skidI, (x0 + x1) / 2, y + 0.022, (z0 + z1) / 2, Math.atan2(x1 - x0, z1 - z0), 1, 1, len + 0.05);
  skidI = (skidI + 1) % SKID_N; skidMesh.instanceMatrix.needsUpdate = true;
}
const driveFx = { lw: null, rw: null, t: 0 };
let headSpot = null;
function updateDriving(dt) {
  const c = player.car;
  let throttle = 0, brake = 0;
  if (input.gas) throttle = 1;
  if (input.brake) brake = 1;
  if (!input.gas && !input.brake) {
    if (input.jy > 0.2) throttle = Math.min(1, (input.jy - 0.15) * 1.5);
    else if (input.jy < -0.3) brake = Math.min(1, (-input.jy - 0.25) * 1.6);
  }
  const steer = Math.abs(input.jx) > 0.06 ? clamp(input.jx * 1.15, -1, 1) : 0;
  c.physics({ throttle, brake, steer, hand: input.hand, nitro: input.nitro }, dt);
  player.x = c.x; player.z = c.z; player.y = c.y;
  // drift smoke & skid marks from the rear wheels
  const fx = Math.sin(c.h), fz = Math.cos(c.h), rx = -fz, rz = fx;
  const bz = c.G.wb, hw = c.T.W / 2 - 0.16;
  const lwx = c.x + fx * bz - rx * hw, lwz = c.z + fz * bz - rz * hw, rwx = c.x + fx * bz + rx * hw, rwz = c.z + fz * bz + rz * hw;
  const sliding = (c.drift > 3.2 && c.speed > 5) || (c.braking && input.hand && c.speed > 5) || (throttle > 0.9 && c.vf < 9 && c.vf > 1 && c.T.acc > 15);
  if (sliding && c.y > -0.3) {
    if (driveFx.lw) { addSkid(driveFx.lw[0], driveFx.lw[1], lwx, lwz, c.y); addSkid(driveFx.rw[0], driveFx.rw[1], rwx, rwz, c.y); }
    driveFx.t -= dt;
    if (driveFx.t <= 0) { driveFx.t = 0.05; puffSmoke(lwx, c.y + 0.3, lwz, 1, false, 0.8); puffSmoke(rwx, c.y + 0.3, rwz, 1, false, 0.8); }
  }
  driveFx.lw = [lwx, lwz]; driveFx.rw = [rwx, rwz];
  AUD.skid(sliding ? clamp(c.drift / 10 + 0.3, 0, 1) : 0);
  if (c.usingNitro) {
    const ex = c.x - fx * (c.T.L / 2 + 0.2), ez = c.z - fz * (c.T.L / 2 + 0.2);
    for (let i = 0; i < 2; i++) fireFx.emit(ex + rr(-0.15, 0.15), c.y + 0.4, ez + rr(-0.15, 0.15), -fx * 8 + rr(-1, 1), rr(0, 0.6), -fz * 8 + rr(-1, 1), 0.18, 0.5, 0.15, 0.4, 0.6, 2.0, 1, 1.4, 0.6, 0.3, 1, 0);
  }
  AUD.engine(c.vf, throttle, c.T.maxV);
  if (c.exploded) killPlayer('Машина взорвалась');
}
function updateHeadlight() {
  if (!headSpot) return;
  const c = player.mode === 'car' ? player.car : null;
  const on = c && DAY.night > 0.15 && !c.wrecked;
  headSpot.intensity = on ? 2.4 * DAY.night : 0;
  if (c) {
    const fx = Math.sin(c.h), fz = Math.cos(c.h);
    headSpot.position.set(c.x + fx * (c.T.L / 2), c.y + 0.85, c.z + fz * (c.T.L / 2));
    headSpot.target.position.set(c.x + fx * 22, c.y - 1.2, c.z + fz * 22);
  }
}

// ---------- damage / death ----------
function hurtPlayer(d, why) {
  if (player.dead || GAME.state !== 'play') return;
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
    player.dead = false; player.health = 100; player.knockT = 0; player.anim.hands = false; player.anim.punch = 0;
    player.x = spot.x; player.z = spot.z; player.y = groundH(spot.x, spot.z); player.vx = player.vz = player.vy = 0;
    player.root.rotation.set(0, 0, 0); player.root.visible = true; player.blob.visible = true; player.anim.mode = 'normal';
    player.mode = 'foot'; player.car = null; HUD.setMode('foot');
    HUD.dead(null);
    HUD.fade(false);
    if (paid > 0) HUD.toast(msg + '$' + paid, 'warn');
  }, 650);
}

// ---------- world markers ----------
const markerGeo = {};
class Marker {
  constructor(x, z, color, r, kind) {
    if (!markerGeo.ring) {
      markerGeo.ring = new THREE.RingGeometry(0.86, 1, 48); markerGeo.ring.rotateX(-Math.PI / 2);
      markerGeo.beam = new THREE.CylinderGeometry(1, 1, 30, 32, 1, true); markerGeo.beam.translate(0, 15, 0);
      markerGeo.arrow = new THREE.ConeGeometry(0.55, 1.0, 4); markerGeo.arrow.rotateX(Math.PI);
    }
    this.x = x; this.z = z; this.r = r; this.color = color; this.kind = kind || 'obj';
    const col = new THREE.Color(color);
    this.g = new THREE.Group();
    this.ringMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.beamMat = new THREE.MeshBasicMaterial({ color: col, map: TEX.beam, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(markerGeo.ring, this.ringMat); ring.scale.set(r, 1, r); ring.position.y = 0.06;
    const beam = new THREE.Mesh(markerGeo.beam, this.beamMat); beam.scale.set(r * 0.92, 1, r * 0.92);
    this.arrow = new THREE.Mesh(markerGeo.arrow, new THREE.MeshBasicMaterial({ color: col, toneMapped: false }));
    this.arrow.position.y = 3.2;
    this.g.add(ring, beam, this.arrow);
    this.g.position.set(x, groundH(x, z), z);
    this.g.renderOrder = 3;
    scene.add(this.g);
  }
  move(x, z, y) { this.x = x; this.z = z; this.g.position.set(x, y === undefined ? groundH(x, z) : y, z); }
  update(t) { this.arrow.position.y = 3.2 + Math.sin(t * 3) * 0.3; this.arrow.rotation.y = t * 2; this.beamMat.opacity = 0.42 + Math.sin(t * 4) * 0.12; }
  remove() { scene.remove(this.g); this.ringMat.dispose(); this.beamMat.dispose(); this.arrow.material.dispose(); }
}

// ---------- pickups ----------
const pickups = [];
const pickGeo = {};
class Pickup {
  constructor(kind, x, z, value, id) {
    if (!pickGeo.cash) {
      pickGeo.cash = new THREE.BoxGeometry(0.55, 0.28, 0.32);
      pickGeo.token = new THREE.OctahedronGeometry(0.42, 0);
      pickGeo.bag = new THREE.SphereGeometry(0.45, 12, 8);
      pickGeo.mat = {
        cash: new THREE.MeshStandardMaterial({ color: 0x2ea84a, emissive: new THREE.Color('#3cff6a'), emissiveIntensity: 0.6, roughness: 0.4 }),
        token: new THREE.MeshStandardMaterial({ color: 0xff3f8e, emissive: new THREE.Color('#ff3f8e'), emissiveIntensity: 1.2, roughness: 0.2, metalness: 0.4 }),
        bag: new THREE.MeshStandardMaterial({ color: 0x8a6a3a, emissive: new THREE.Color('#ffd23f'), emissiveIntensity: 0.35, roughness: 0.8 }),
      };
    }
    this.kind = kind; this.x = x; this.z = z; this.value = value || 0; this.id = id; this.t = Math.random() * 10;
    this.mesh = new THREE.Mesh(pickGeo[kind], pickGeo.mat[kind]); this.mesh.castShadow = true;
    this.y = groundH(x, z) + 0.9;
    this.mesh.position.set(x, this.y, z);
    this.life = kind === 'cash' ? 60 : Infinity;
    scene.add(this.mesh);
    pickups.push(this);
  }
  get glow() { return this.kind === 'cash' ? [0.25, 1.0, 0.4] : this.kind === 'token' ? [1.0, 0.25, 0.6] : [1.0, 0.8, 0.25]; }
  remove() { scene.remove(this.mesh); const i = pickups.indexOf(this); if (i >= 0) pickups.splice(i, 1); this.removed = true; }
}
function spawnCash(x, z, v) { new Pickup('cash', x + rr(-0.5, 0.5), z + rr(-0.5, 0.5), v); }
function updatePickups(dt) {
  const r = player.mode === 'car' ? 3.2 : 1.5;
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.t += dt; p.life -= dt;
    p.mesh.rotation.y = p.t * 2.2; p.mesh.position.y = p.y + Math.sin(p.t * 3) * 0.15;
    if (p.life <= 0) { p.remove(); continue; }
    if (player.dead) continue;
    if (Math.abs(p.x - player.x) < r && Math.abs(p.z - player.z) < r && Math.hypot(p.x - player.x, p.z - player.z) < r) {
      if (p.kind === 'cash') { addMoney(p.value); AUD.coin(); }
      else if (p.kind === 'token') {
        if (!save.tokens.includes(p.id)) save.tokens.push(p.id);
        addMoney(250); AUD.chime();
        HUD.toast('Неоновый жетон ' + save.tokens.length + '/' + SPOT.tokens.length, 'cash');
        if (save.tokens.length === SPOT.tokens.length) { addMoney(5000); HUD.banner('ВСЕ ЖЕТОНЫ', '+$5000'); }
      } else if (p.kind === 'bag') { AUD.coin(); if (p.onTake) p.onTake(p); }
      p.remove();
    }
  }
}
function addMoney(v) {
  save.money = Math.max(0, Math.round(save.money + v));
  writeSave();
  if (v > 0) HUD.toast('+$' + Math.round(v), 'cash');
  HUD.moneyBump();
}

// ---------- missions ----------
const C_START = '#ffd23f', C_OBJ = '#3fe5ef', C_CP = '#ff3f8e', C_BAG = '#8dff7a', C_SHOP = '#c06bff';
const MS = { idx: -1, steps: [], si: -1, timer: 0, markers: [], startMarker: null, data: {}, target: null, needLeave: false, startIdx: -1, shopCd: 0 };
const MISSION_NAMES = ['Новый город', 'Горячая доставка', 'Ночной заезд', 'Конкурент', 'Большой куш', 'Курьер'];
const MISSION_REWARD = [300, 800, 1200, 2000, 5000, 0];
function missionStartSpot(i) {
  const g = SPOT.garage;
  return [null, { x: SPOT.plaza.x + 22, z: SPOT.plaza.z - 26 }, { x: 291.5, z: 14 }, { x: roadC(2) + 12, z: roadC(5) - 12 }, { x: g.x + 2, z: g.z + 9 }, { x: g.x + 3, z: g.z - 11 }][i];
}
function sms(text, from) { HUD.sms(from || 'ВЭЛ', text); AUD.sms(); }
function inZone(x, z, r, needCar) {
  if (player.dead) return false;
  if (needCar && player.mode !== 'car') return false;
  const rr2 = r + (player.mode === 'car' ? 1.5 : 0);
  return Math.hypot(player.x - x, player.z - z) < rr2;
}
function clearMissionObjects() {
  MS.markers.forEach((m) => m.remove()); MS.markers.length = 0;
  MS.target = null;
}
function spawnCarNear(x, z, type, color) {
  for (let k = 0; k < 16; k++) {
    const a = k / 16 * TAU, px = x + Math.cos(a) * 5, pz = z + Math.sin(a) * 5;
    const h = collideCircle(px, pz, 2.4);
    if (!h.hit && !cars.some((c) => Math.hypot(c.x - px, c.z - pz) < 5)) {
      const c = new Car(type, color); c.place(px, pz, Math.atan2(x - px, z - pz) + Math.PI / 2); c.persistent = true; return c;
    }
  }
  const c = new Car(type, color); c.place(x + 3, z + 3, 0); c.persistent = true; return c;
}
class FleeAI {
  constructor(car) { this.car = car; car.ai = this; car.driver = 'npc'; car.kinematic = false; this.path = []; this.repath = 0; this.revT = 0; this.stuckT = 0; this.panic = false; }
  release() { }
  update(dt) {
    const c = this.car;
    if (c.wrecked) { c.physics({ throttle: 0, brake: 1, steer: 0 }, dt); return; }
    this.repath -= dt;
    if (this.repath <= 0 || !this.path.length) {
      this.repath = this.panic ? 2.5 : 6;
      let best = null, bd = -1;
      for (let k = 0; k < 10; k++) {
        const n = [Math.floor(Math.random() * NODES), Math.floor(Math.random() * NODES)];
        const d = Math.hypot(roadC(n[0]) - player.x, roadC(n[1]) - player.z) + (this.panic ? 0 : Math.random() * 400);
        if (d > bd) { bd = d; best = n; }
      }
      this.path = bfsPath(nearestNode(c.x, c.z), best);
    }
    while (this.path.length > 1 && Math.hypot(roadC(this.path[0][0]) - c.x, roadC(this.path[0][1]) - c.z) < 11) this.path.shift();
    const ax = this.path.length ? roadC(this.path[0][0]) : c.x + Math.sin(c.h) * 10, az = this.path.length ? roadC(this.path[0][1]) : c.z + Math.cos(c.h) * 10;
    const diff = wrapA(Math.atan2(ax - c.x, az - c.z) - c.h);
    let steer = clamp(-diff * 2.2, -1, 1), thr = this.panic ? 1 : 0.5, brk = 0;
    if (Math.abs(diff) > 1.2 && c.vf > (this.panic ? 16 : 9)) { thr = 0.1; brk = 0.6; }
    if (this.revT > 0) { this.revT -= dt; thr = 0; brk = 1; steer = -steer; }
    else if (thr > 0.3 && Math.abs(c.vf) < 1.2) { this.stuckT += dt; if (this.stuckT > 1.2) { this.revT = 1.2; this.stuckT = 0; } }
    else this.stuckT = Math.max(0, this.stuckT - dt);
    c.physics({ throttle: thr, brake: brk, steer, hand: false, nitro: this.panic && Math.abs(diff) < 0.25 }, dt);
  }
}
function buildSteps(i) {
  const D = MS.data = {};
  const g = SPOT.garage;
  switch (i) {
    case 0: return [
      { text: 'Сядь в машину — подойди к ней и нажми «Сесть»', check: () => player.mode === 'car' },
      { text: 'Доедь до гаража Вэл (метка на карте)', marker: { x: g.x, z: g.z, r: 4.5, color: C_OBJ }, check: () => inZone(g.x, g.z, 4.5, true) },
    ];
    case 1: {
      const A = { x: SPOT.hospital.x + 1, z: SPOT.hospital.z + 18 }, B = { x: 336, z: 0 };
      return [
        { text: 'Забери посылку у больницы на западе', marker: { x: A.x, z: A.z, r: 3, color: C_OBJ }, enter: () => sms('Клиент ждёт посылку на пирсе. Забери её у больницы на западе и гони — времени мало.'), check: () => inZone(A.x, A.z, 3) },
        { text: 'Доставь посылку на пирс', marker: { x: B.x, z: B.z, r: 4.5, color: C_OBJ }, timer: Math.round(Math.hypot(A.x - B.x, A.z - B.z) / 15 + 30), enter: () => { AUD.chime(); HUD.toast('Посылка у тебя'); }, check: () => inZone(B.x, B.z, 4.5) },
      ];
    }
    case 2: {
      const route = [[7, 4], [7, 7], [4, 7], [4, 5], [2, 5], [2, 2], [5, 2], [5, 0], [7, 0], [7, 3]];
      let total = 0, px = player.x, pz = player.z;
      route.forEach((n) => { total += Math.abs(roadC(n[0]) - px) + Math.abs(roadC(n[1]) - pz); px = roadC(n[0]); pz = roadC(n[1]); });
      const steps = [
        { text: 'Нужна машина: сядь в спорткар рядом', enter: () => { if (player.mode !== 'car') D.car = spawnCarNear(player.x, player.z, 'coupe', '#ff3f8e'); sms('Гонка по ночному городу. 10 чекпоинтов, укладывайся во время — и приз твой.'); }, check: () => player.mode === 'car' },
        { text: 'Приготовься…', enter: () => { D.cd = 3.2; D.lastN = 0; }, check: (dt) => { D.cd -= dt; const n = Math.ceil(D.cd); if (n !== D.lastN && n > 0) { D.lastN = n; HUD.banner('СТАРТ ЧЕРЕЗ', String(n)); AUD.beep(false); } if (D.cd <= 0) { HUD.banner('', 'ВПЕРЁД!'); AUD.beep(true); return true; } return false; } },
      ];
      route.forEach((n, k) => {
        const x = roadC(n[0]), z = roadC(n[1]);
        steps.push({ text: () => 'Чекпоинт ' + (k + 1) + ' из ' + route.length, marker: { x, z, r: 8, color: C_CP }, timer: k === 0 ? Math.round(total / 21 + 18) : undefined, check: () => { if (inZone(x, z, 8.5, true)) { AUD.beep(true); return true; } return false; } });
      });
      return steps;
    }
    case 3: return [
      { text: 'Найди и разбей красный маслкар Дюка', enter: () => {
          sms('Дюк из «Пэлм Моторс» уводит у меня клиентов. Его красный маслкар катается по городу. Разбей его.');
          let s = null;
          for (let k = 0; k < 30 && !s; k++) { const i2 = Math.floor(Math.random() * NODES), j2 = Math.floor(Math.random() * NODES); const d = Math.hypot(roadC(i2) - player.x, roadC(j2) - player.z); if (d > 120 && d < 260) s = [roadC(i2), roadC(j2)]; }
          if (!s) s = [roadC(0), roadC(0)];
          const c = new Car('muscle', '#c1121f'); c.place(s[0], s[1], 0); c.mission = 'target'; c.health = 160; c.persistent = true;
          D.car = c; D.ai = new FleeAI(c); D.hp = c.health;
          D.mk = new Marker(c.x, c.z, '#ff4d5e', 2.2, 'target'); MS.markers.push(D.mk);
        },
        update: (dt) => {
          const c = D.car; if (c.ai === D.ai) D.ai.update(dt);
          D.mk.move(c.x, c.z, c.y + 2.2); MS.target = { x: c.x, z: c.z, color: '#ff4d5e' };
          if (c.health < D.hp - 1 && !D.ai.panic) { D.ai.panic = true; setWanted(2); sms('Он заметил тебя! Не дай ему уйти. И да — копы уже едут.'); }
        },
        fail: () => (D.car.dead || Math.hypot(D.car.x - player.x, D.car.z - player.z) > 420) ? 'Дюк скрылся' : false,
        check: () => D.car.wrecked },
      { text: () => wanted.stars > 0 ? 'Оторвись от полиции' : 'Готово', enter: () => { HUD.toast('Машина Дюка уничтожена', 'cash'); }, check: () => wanted.stars === 0 },
    ];
    case 4: {
      const spots = [{ x: SPOT.lighthouse.x - 8, z: SPOT.lighthouse.z + 6 }, { x: 352, z: 2 }, { x: roadC(1) + 40, z: roadC(5) + 40 }, { x: -294, z: -140 }];
      return [
        { text: () => 'Собери сумки с деньгами: ' + (D.got || 0) + ' из 4', timer: 240, enter: () => {
            sms('Последнее дело. Инкассаторы растеряли 4 сумки по всему городу, но копы уже в курсе. Собери всё и вези в гараж.');
            setWanted(2); D.got = 0; D.bags = [];
            spots.forEach((s) => { const b = new Pickup('bag', s.x, s.z, 0); b.onTake = () => { D.got++; HUD.toast('Сумка ' + D.got + '/4', 'cash'); }; D.bags.push(b); const m = new Marker(s.x, s.z, C_BAG, 2.2, 'bag'); m.bag = b; MS.markers.push(m); });
          },
          update: () => {
            for (const m of MS.markers) if (m.bag && m.bag.removed && !m.gone) { m.gone = true; m.g.visible = false; }
            const left = MS.markers.filter((m) => m.bag && !m.bag.removed);
            let best = null, bd = 1e9; for (const m of left) { const d = Math.hypot(m.x - player.x, m.z - player.z); if (d < bd) { bd = d; best = m; } }
            MS.target = best ? { x: best.x, z: best.z, color: C_BAG } : null;
          },
          check: () => D.got >= 4 },
        { text: () => wanted.stars > 0 ? 'Оторвись от полиции с деньгами' : 'Чисто', enter: () => { MS.timer = 0; }, check: () => wanted.stars === 0 },
        { text: 'Привези деньги в гараж Вэл', marker: { x: g.x, z: g.z, r: 4.5, color: C_OBJ }, check: () => inZone(g.x, g.z, 4.5) },
      ];
    }
    case 5: {
      const pick = () => { for (let k = 0; k < 40; k++) { const b = blocks[Math.floor(Math.random() * blocks.length)]; const x = b.x0 + 2.5, z = lerp(b.z0 + 6, b.z1 - 6, Math.random()); const d = Math.hypot(x - player.x, z - player.z); if (d > 120 && d < 380 && !collideCircle(x, z, 1).hit) return { x, z }; } return { x: SPOT.plaza.x + 20, z: SPOT.plaza.z + 20 }; };
      const A = pick(); const B = (() => { for (let k = 0; k < 40; k++) { const b = blocks[Math.floor(Math.random() * blocks.length)]; const x = b.x1 - 2.5, z = lerp(b.z0 + 6, b.z1 - 6, Math.random()); const d = Math.hypot(x - A.x, z - A.z); if (d > 200 && !collideCircle(x, z, 1).hit) return { x, z }; } return { x: SPOT.garage.x, z: SPOT.garage.z }; })();
      D.reward = Math.round(150 + Math.hypot(A.x - B.x, A.z - B.z) * 0.9);
      return [
        { text: 'Курьер: забери заказ', marker: { x: A.x, z: A.z, r: 3, color: C_OBJ }, enter: () => sms('Есть заказ на доставку. Оплата $' + D.reward + ', если успеешь вовремя.'), check: () => inZone(A.x, A.z, 3) },
        { text: 'Курьер: доставь заказ', marker: { x: B.x, z: B.z, r: 3.5, color: C_OBJ }, timer: Math.round(Math.hypot(A.x - B.x, A.z - B.z) / 14 + 25), check: () => inZone(B.x, B.z, 3.5) },
      ];
    }
  }
  return [];
}
function startMission(i) {
  if (MS.startMarker) { MS.startMarker.remove(); MS.startMarker = null; }
  MS.idx = i; MS.timer = 0;
  MS.steps = buildSteps(i); MS.si = -1;
  HUD.banner('МИССИЯ', MISSION_NAMES[i]);
  AUD.chime();
  nextStep();
}
function nextStep() {
  MS.markers.filter((m) => m.kind === 'obj').forEach((m) => m.remove());
  MS.markers = MS.markers.filter((m) => m.kind !== 'obj');
  MS.si++;
  if (MS.si >= MS.steps.length) { completeMission(); return; }
  const st = MS.steps[MS.si];
  if (st.enter) st.enter();
  if (st.marker) { MS.markers.push(new Marker(st.marker.x, st.marker.z, st.marker.color, st.marker.r, 'obj')); MS.target = { x: st.marker.x, z: st.marker.z, color: st.marker.color }; }
  else if (MS.idx !== 3 && MS.idx !== 4) MS.target = null;
  if (st.timer) MS.timer = st.timer;
}
function completeMission() {
  const i = MS.idx;
  const reward = i === 5 ? MS.data.reward : MISSION_REWARD[i];
  clearMissionObjects();
  if (MS.data.bags) MS.data.bags.forEach((b) => { if (!b.removed) b.remove(); });
  if (MS.data.car && MS.data.car.mission) MS.data.car.mission = false;
  MS.idx = -1; MS.steps = []; MS.si = -1; MS.timer = 0;
  if (i < 5) save.mission = Math.max(save.mission, i + 1);
  HUD.banner('МИССИЯ ВЫПОЛНЕНА', '+$' + reward);
  AUD.win();
  addMoney(reward);
  const notes = [
    'Неплохо водишь. Загляни на площадь с фонтаном — есть работа.',
    'Клиент доволен. Если любишь скорость — жду у пирса, там собирается ночной заезд.',
    'Вот это скорость! Подходи к перекрёстку на северо-западе, обсудим одного типа.',
    'Дюк больше не проблема. Для последнего дела приходи к гаражу.',
    'Ты теперь свой в Неон-Тайде. Если нужна подработка — у гаража всегда есть заказы курьера.',
  ];
  if (i < 5) setTimeout(() => sms(notes[i]), 2400);
  MS.needLeave = true;
}
function failMission(reason) {
  if (MS.idx < 0) return;
  const i = MS.idx;
  clearMissionObjects();
  if (MS.data.bags) MS.data.bags.forEach((b) => { if (!b.removed) b.remove(); });
  if (MS.data.car && MS.data.car.mission) { MS.data.car.mission = false; MS.data.car.persistent = false; if (MS.data.car.ai instanceof FleeAI) { MS.data.car.ai = null; MS.data.car.driver = 'npc'; } }
  MS.idx = -1; MS.steps = []; MS.si = -1; MS.timer = 0; MS.needLeave = true;
  HUD.banner('МИССИЯ ПРОВАЛЕНА', reason || MISSION_NAMES[i], true);
  AUD.fail();
}
function updateMissions(dt) {
  const t = GAME.time;
  MS.markers.forEach((m) => m.update(t));
  if (MS.startMarker) MS.startMarker.update(t);
  // paint & repair shops
  MS.shopCd -= dt;
  if (player.mode === 'car' && MS.shopCd <= 0 && !player.dead) {
    for (const s of SPOT.shops) {
      if (Math.hypot(player.x - s.x, player.z - s.z) < 5.5) {
        MS.shopCd = 4;
        const c = player.car;
        if (wanted.stars > 0) {
          if (save.money >= 250) { addMoney(-250); clearWanted(); c.health = 100; const col = rpick(CAR_COLORS); c.paintMat = paint(col); c.bodyMesh.material = c.paintMat; if (!c.T.police) c.roofMesh.material = c.paintMat; c.pillarMesh.material = c.paintMat; HUD.toast('Перекрашено. Розыск снят — $250', 'cash'); AUD.chime(); }
          else HUD.toast('Перекраска стоит $250', 'warn');
        } else if (c.health < 100) {
          if (save.money >= 100) { addMoney(-100); c.health = 100; HUD.toast('Машина отремонтирована — $100', 'cash'); AUD.chime(); }
          else HUD.toast('Ремонт стоит $100', 'warn');
        }
      }
    }
  }
  if (MS.idx >= 0) {
    const st = MS.steps[MS.si]; if (!st) return;
    if (st.update) st.update(dt);
    if (MS.idx === 3 || MS.idx === 4) { /* target set by update */ }
    if (MS.timer > 0) { MS.timer -= dt; if (MS.timer <= 0) { MS.timer = 0; failMission('Время вышло'); return; } }
    const f = st.fail && st.fail();
    if (f) { failMission(f); return; }
    if (st.check(dt)) nextStep();
    if (MS.idx >= 0 && MS.steps[MS.si]) HUD.objective(typeof MS.steps[MS.si].text === 'function' ? MS.steps[MS.si].text() : MS.steps[MS.si].text);
    return;
  }
  // no active mission: show the next start marker
  if (player.dead) return;
  if (save.mission === 0) {
    if (MS.wait0 === undefined) MS.wait0 = 0.8;
    MS.wait0 -= dt;
    if (MS.wait0 <= 0) { MS.wait0 = 3; startMission(0); }
    HUD.objective('');
    return;
  }
  const next = Math.min(save.mission, 5);
  const sp = missionStartSpot(next);
  if (!MS.startMarker || MS.startIdx !== next) {
    if (MS.startMarker) MS.startMarker.remove();
    MS.startMarker = new Marker(sp.x, sp.z, C_START, 1.6, 'start'); MS.startIdx = next;
  }
  MS.target = { x: sp.x, z: sp.z, color: C_START, start: true };
  const d = Math.hypot(player.x - sp.x, player.z - sp.z);
  if (MS.needLeave) { if (d > 8) MS.needLeave = false; }
  else if (d < (player.mode === 'car' ? 3.5 : 2.0)) startMission(next);
  HUD.objective(next === 5 ? 'Подработка: жёлтый маяк у гаража' : 'Следующая миссия: «' + MISSION_NAMES[next] + '» — жёлтый маяк на карте');
}
function initTokens() {
  SPOT.tokens.forEach((s, i) => { if (!save.tokens.includes(i)) new Pickup('token', s[0], s[1], 0, i); });
}
