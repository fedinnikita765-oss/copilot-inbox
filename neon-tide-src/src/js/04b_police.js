// ============================================================
//  Police on foot, roadblocks, helicopter, armoured squad, witnesses (owner D)
//  1★ officers come to arrest; 2★+ they leave the car with pistols (3★+ rifles), take cover behind
//  their car, flank and chase on foot, and shoot with fireBullet() — accuracy falls off with distance,
//  the suspect's speed and their own movement. 3★+ roadblocks ahead of a driving suspect,
//  4★+ a helicopter with a searchlight and a door gunner, 5★ an armoured van with a rifle squad.
//  Gunfire, hits, kills and explosions are reported by witnesses after a delay (unless the witness
//  is taken down or leaves the area); officers who see a crime report it instantly.
//  Events used: gunshot, bulletHit, pedKilled, explosion, start, respawn, playerDied, playerBusted.
//  Hook for the HUD: policeBlips(fn) → fn(x, z, kind) for kind 'car' | 'cop' | 'heli' | 'block'.
// ============================================================
const polCops = [];
const POL = { heli: null, heliCd: 2, blocks: [], blockCd: 4, vanCd: 0, shots: 0, hits: 0, assaultT: -99, copNearAcc: false, flashes: [], toastT: -99, gunCheck: null, aimFallback: true, reports: 0 };
// err0 + errK·distance: aim error in metres at the target (grows with the suspect's speed, own movement, night)
const POL_GUNS = {
  pistol: { dmg: 8, err0: 0.5, errK: 0.032, cd: [0.9, 1.5], mag: 12, reload: 1.8, range: 70, burst: 1, gap: 0, anim: 'pistol' },
  rifle: { dmg: 7, err0: 0.42, errK: 0.024, cd: [1.7, 2.5], mag: 30, reload: 2.4, range: 95, burst: 3, gap: 0.12, anim: 'twohand' },
};
const POL_SWAT_LOOK = { gender: 'm', skin: '#8a5a3c', shirt: '#2a2f3a', shirtPat: 'fabric', sleeves: 'long', pants: '#1c2028', pantsPat: 'fabric', shorts: false,
  shoes: '#111111', sole: '#111111', hair: '#1a1110', hairStyle: 'buzz', hat: '#1c2028', glasses: true, phone: false, belt: true, height: 1.04, girth: 1.24 };
function polCopLook(swat) {
  const L = Object.assign({}, swat ? POL_SWAT_LOOK : COP_LOOK);
  L.skin = rpick(SKIN);
  if (!swat && Math.random() < 0.25) { L.gender = 'f'; L.hairStyle = 'bun'; L.height = 0.97; L.girth = 1.0; }
  return L;
}
PED_POSES.kneel = [[HB.thL, -1.65, 0, 0.2], [HB.thR, -0.6, 0, -0.18], [HB.shL, 1.6, 0, 0], [HB.shR, 2.2, 0, 0], [HB.ftL, 0.05, 0, 0], [HB.ftR, -1.0, 0, 0], [HB.spine, 0.25, 0, 0]];
PED_POSE_HIP.kneel = -0.42;
PED_POSES.seat = PED_POSES.sit;
PED_POSE_HIP.seat = PED_POSE_HIP.sit;

// ---------- weapons for officers ----------
// attachGun() belongs to the weapons module; until it returns a mesh we hang a simple model on the hand.
let POL_FB_GUN = null;
function polFallbackGun(H, type) {
  if (!POL_FB_GUN) {
    const m = new THREE.MeshStandardMaterial({ color: 0x1c1d21, roughness: 0.4, metalness: 0.6 });
    const pis = mergeGeos([boxAt(-0.017, 0.017, -0.2, -0.0, 0.015, 0.065), boxAt(-0.015, 0.015, -0.065, 0.0, -0.075, 0.02)]);
    const rif = mergeGeos([boxAt(-0.025, 0.025, -0.55, 0.22, 0.02, 0.085), boxAt(-0.012, 0.012, -0.78, -0.55, 0.04, 0.065), boxAt(-0.018, 0.018, -0.2, -0.08, -0.12, 0.02), boxAt(-0.02, 0.02, -0.05, 0.0, -0.09, 0.02), boxAt(-0.022, 0.022, 0.22, 0.4, 0.0, 0.08)]);
    POL_FB_GUN = { m, pis, rif };
  }
  const mesh = new THREE.Mesh(type === 'rifle' ? POL_FB_GUN.rif : POL_FB_GUN.pis, POL_FB_GUN.m);
  mesh.position.set(0, -0.07, 0.01); mesh.castShadow = true;
  H.bones[HB.haR].add(mesh);
  return mesh;
}
function polArmHuman(H, type) {
  let g = null;
  try { g = typeof attachGun === 'function' ? attachGun(H, type) : null; } catch (e) { g = null; }
  return g || polFallbackGun(H, type);
}
// Is the aim pose implemented by animHuman? (owner C adds it; until then we pose the arms ourselves)
function polDetectAimPose() {
  try {
    const H = buildHuman(COP_LOOK), a = { speed: 0, t: 0, mode: 'normal', aim: 0, aimYaw: 0, aimPitch: 0, weapon: 'pistol', recoil: 0, reload: 0 };
    for (let i = 0; i < 20; i++) animHuman(H, a, 0.05);
    const x0 = H.bones[HB.uaR].rotation.x;
    a.aim = 1; for (let i = 0; i < 30; i++) animHuman(H, a, 0.05);
    const x1 = H.bones[HB.uaR].rotation.x;
    H.dispose();
    POL.aimFallback = Math.abs(x1 - x0) < 0.25;
  } catch (e) { POL.aimFallback = true; }
}
// fallback aim pose: right arm (and left for two-handed) raised along the aim line
function polAimPose(H, a) {
  const w = a.aim || 0; if (w < 0.01) return;
  const bn = H.bones, p = clamp(a.aimPitch || 0, -0.9, 0.9), y = clamp(a.aimYaw || 0, -0.9, 0.9), rc = (a.recoil || 0) * 0.18;
  const set = (b, x, yy, z) => { const r = bn[b].rotation; r.x = lerp(r.x, x, w); r.y = lerp(r.y, yy, w); r.z = lerp(r.z, z, w); };
  set(HB.chest, bn[HB.chest].rotation.x, y * 0.6, 0);
  if (a.weapon === 'twohand') {
    set(HB.uaR, -1.42 - p - rc, 0.1, 0.12); set(HB.faR, -0.18, 0, 0); set(HB.haR, 0, 0, 0);
    set(HB.uaL, -1.25 - p - rc, -0.2, -0.62); set(HB.faL, -0.62, 0, 0); set(HB.haL, 0, 0, 0);
  } else {
    set(HB.uaR, -1.5 - p - rc, 0.05, 0.08); set(HB.faR, -0.06, 0, 0); set(HB.haR, 0, 0, 0);
    set(HB.uaL, -1.35 - p - rc, 0, -0.5); set(HB.faL, -0.35, 0, 0);
  }
}

// ---------- officers on foot ----------
const _polFv = new V3();
class PolCop extends Ped {
  constructor(x, z, unit, weapon, swat, role) {
    super(polCopLook(swat), x, z);
    this.cop = true; this.swat = !!swat; this.unit = unit || null; this.role = role || 'patrol';
    this.wpn = POL_GUNS[weapon] ? weapon : 'pistol'; this.G = POL_GUNS[this.wpn];
    this.health = swat ? 150 : 100; this.brave = true;
    this.state = 'exit'; this.stT = 0.5; this.ammo = this.G.mag; this.cd = rr(0.2, 0.7); this.aimT = 0; this.burstN = 0; this.burstT = 0; this.reloadT = 0;
    this.goal = null; this.goalT = 0; this.think = Math.random() * 0.35; this.seen = false; this.seeT = Math.random() * 0.3;
    this.flankSide = Math.random() < 0.45 ? (Math.random() < 0.5 ? -1 : 1) : 0; this.coverIdx = 0; this.inCover = false; this.up = true; this.popT = 0;
    this.sideT = 0; this.sideDir = 1; this.lostT = 0; this.stuckT = 0; this.moving = false; this.shout = 0;
    const a = this.anim; a.weapon = 'none'; a.aim = 0; a.aimYaw = 0; a.aimPitch = 0; a.recoil = 0; a.reload = 0; a.phone = false;
    this.gun = null; this.armed = false;
    polCops.push(this);
  }
  arm(on) {
    if (on && !this.gun) this.gun = polArmHuman(this.H, this.wpn);
    if (this.gun) this.gun.visible = !!on;
    this.armed = !!on; this.anim.weapon = on ? this.G.anim : 'none'; this.anim.oneHand = on && this.wpn === 'pistol';
  }
  remove() {
    super.remove();
    const i = polCops.indexOf(this); if (i >= 0) polCops.splice(i, 1);
    if (this.unit) { const k = this.unit.crew.indexOf(this); if (k >= 0) this.unit.crew.splice(k, 1); }
  }
  flee() { }
  panic() { }
  react() { }
  cower() { }
  duck() { }
  // should open fire (vs. move in to arrest)?
  hostileNow(d) {
    const S = wanted.stars; if (S < 2 || !this.armed) return false;
    if (policePlayerHostile()) return true;
    if (player.mode === 'car' && player.car && player.car.speed > 4) return true;
    if (player.mode === 'foot' && Math.hypot(player.vx, player.vz) > 4.2 && d > 7) return true;
    return false;
  }
  decide(d) {
    const S = wanted.stars;
    if (S === 0 || player.dead) { this.state = this.unit ? 'return' : 'leave'; return; }
    if (this.role === 'guard' && d > 24) { this.arm(true); this.state = 'guard'; return; }
    if (S <= 1) { this.arm(false); this.state = 'arrest'; return; }
    this.arm(true);
    this.state = this.hostileNow(d) ? 'engage' : 'arrest';
  }
  update(dt) {
    if (this.state === 'flee') { this.state = 'engage'; this.inCover = false; }
    if (this.state === 'fly' || this.state === 'down' || this.state === 'getup' || this.state === 'dead') {
      this.inCover = false; this.anim.aim = damp(this.anim.aim, 0, 10, dt); super.update(dt);
      if (this.state === 'flee') this.state = 'engage';
      return;
    }
    const a = this.anim; a.t += dt; a.flinch = Math.max(0, (a.flinch || 0) - dt * 4); a.recoil = Math.max(0, (a.recoil || 0) - dt * 7);
    if (a.punch > 0) { a.punch += dt / 0.4; if (a.punch >= 1) a.punch = 0; }
    const P = player, pc = P.mode === 'car' ? P.car : null;
    const pdx = P.x - this.x, pdz = P.z - this.z, d = Math.hypot(pdx, pdz);
    this.seeT -= dt;
    if (this.seeT <= 0) { this.seeT = 0.3; this.seen = !P.dead && GAME.state === 'play' && wanted.stars > 0 && policeCanSee(this.x, this.z, 72); if (this.seen) policeSpot(); }
    const known = GAME.time - wanted.seenAt < 1.6;
    const S = wanted.stars;
    let gx = null, gz = null, spd = 0, face = null, shoot = false;
    this.think -= dt;
    const tick = this.think <= 0; if (tick) this.think = 0.35;
    if ((S === 0 || P.dead) && this.state !== 'return' && this.state !== 'leave') this.state = this.unit && !this.unit.car.dead ? 'return' : 'leave';
    switch (this.state) {
      case 'exit': {
        this.stT -= dt;
        if (this.goal) { gx = this.goal[0]; gz = this.goal[1]; spd = 2.6; }
        if (this.stT <= 0) { this.goal = null; this.decide(d); }
        break;
      }
      case 'arrest': {
        if (tick) {
          if (S >= 2 && !this.armed) this.arm(true);
          if (S >= 2 && this.hostileNow(d)) { this.state = 'engage'; break; }
          if (d > 30 || (pc && pc.speed > 6)) { this.state = 'chase'; break; }
        }
        let tx = P.x, tz = P.z;
        if (pc) { tx = pc.x + Math.cos(pc.h) * 1.7; tz = pc.z - Math.sin(pc.h) * 1.7; }
        const td = Math.hypot(tx - this.x, tz - this.z);
        if (td > 1.1) { gx = tx; gz = tz; spd = td > 6 ? 5.6 : 2.4; }
        face = [P.x, P.z]; shoot = false;
        if (td < 2.4 && !P.dead) {
          POL.copNearAcc = true;
          if (GAME.time - POL.toastT > 9) { POL.toastT = GAME.time; HUD.toast(pc ? '«Выйти из машины! Руки на руль!»' : '«Стоять! Полиция! Руки вверх!»', 'warn'); }
        }
        break;
      }
      case 'engage': {
        if (tick) {
          if (!this.hostileNow(d) && d < 34) { this.state = 'arrest'; this.inCover = false; break; }
          if (d > 38 || (!known && wanted.unseen > 3)) { this.state = 'chase'; this.inCover = false; break; }
          if (pc && pc.speed > 7 && d > 30 && this.unit && !this.unit.car.dead) { this.state = 'return'; this.inCover = false; break; }
          this.goalT -= 0.35;
          if (!this.goal || this.goalT <= 0) this.pickPosition(d);
        }
        if (this.goal) { gx = this.goal[0]; gz = this.goal[1]; spd = Math.hypot(gx - this.x, gz - this.z) > 3 ? 5.2 : 2.2; }
        face = [P.x, P.z]; shoot = this.seen;
        // close enough to grab a suspect who stopped running
        if (d < 2.0 && P.mode === 'foot' && Math.hypot(P.vx, P.vz) < 1.5) POL.copNearAcc = true;
        if (this.sideT > 0) { this.sideT -= dt; const s = this.sideDir; gx = this.x + Math.cos(this.h) * s * 2; gz = this.z - Math.sin(this.h) * s * 2; spd = 2.4; }
        break;
      }
      case 'chase': {
        if (tick) {
          if (known && d < 22 && this.seen) { this.decide(d); break; }
          if (this.unit && !this.unit.car.dead && (d > 70 || (pc && pc.speed > 7 && d > 35))) { this.state = 'return'; break; }
          if (!known) this.lostT += 0.35; else this.lostT = 0;
          if (this.lostT > 7) { this.state = 'search'; this.goal = null; }
        }
        const tx = known ? P.x : wanted.lastX, tz = known ? P.z : wanted.lastZ;
        gx = tx; gz = tz; spd = 6.1;
        shoot = this.seen && d < 26 && this.hostileNow(d);
        if (shoot) { spd = 1.6; face = [P.x, P.z]; }
        break;
      }
      case 'search': {
        if (tick) {
          if (known && this.seen) { this.decide(d); break; }
          if (!this.goal || Math.hypot(this.goal[0] - this.x, this.goal[1] - this.z) < 1.5) { const a2 = Math.random() * TAU, r = rr(6, 20); this.goal = [wanted.lastX + Math.cos(a2) * r, wanted.lastZ + Math.sin(a2) * r]; }
          this.lostT += 0.35; if (this.lostT > 25) this.state = this.unit && !this.unit.car.dead ? 'return' : 'leave';
        }
        if (this.goal) { gx = this.goal[0]; gz = this.goal[1]; spd = 2.2; }
        break;
      }
      case 'guard': {
        if (tick && d < 24 && (P.mode === 'foot' || (pc && pc.speed < 3))) this.decide(d);
        face = [P.x, P.z];
        shoot = this.seen && d < 55 && S >= 2 && (S >= 3 || this.hostileNow(d));
        if (this.goal && Math.hypot(this.goal[0] - this.x, this.goal[1] - this.z) > 0.4) { gx = this.goal[0]; gz = this.goal[1]; spd = 2; }
        break;
      }
      case 'return': {
        const u = this.unit;
        if (!u || u.car.dead || u.car.wrecked || u.mode === 'leave' && S > 0) { this.state = 'leave'; break; }
        const c = u.car, tx = c.x + Math.cos(c.h) * 1.4 * (this.coverIdx ? -1 : 1), tz = c.z - Math.sin(c.h) * 1.4 * (this.coverIdx ? -1 : 1);
        const td = Math.hypot(tx - this.x, tz - this.z);
        this.lostT += dt;
        if (td < 1.3 || this.lostT > 14) { u.seats++; this.unit = null; this.remove(); return; }
        gx = tx; gz = tz; spd = 5.4;
        if (S >= 2 && this.seen && d < 30 && this.hostileNow(d)) { shoot = true; face = [P.x, P.z]; }
        break;
      }
      case 'leave': {
        this.arm(false);
        if (!this.goal) { const a2 = Math.atan2(this.x - P.x, this.z - P.z); this.goal = [this.x + Math.sin(a2) * 60, this.z + Math.cos(a2) * 60]; }
        gx = this.goal[0]; gz = this.goal[1]; spd = 1.6;
        if ((d > 70 || (d > 35 && wanted.stars > 0)) && !inView(this.x, this.z)) { this.remove(); return; }
        break;
      }
      default: this.state = 'engage';
    }
    if (this.removed) return;
    // cover pop-up cycle: crouched behind the car, standing up to fire
    if (this.inCover) {
      this.popT -= dt;
      if (this.popT <= 0) { this.up = !this.up; this.popT = this.up ? rr(1.1, 1.8) : rr(0.9, 1.7); }
      if (!this.up) shoot = false;
    } else this.up = true;
    // movement
    this.moving = false;
    if (gx !== null && spd > 0) {
      const dx = gx - this.x, dz = gz - this.z, dd = Math.hypot(dx, dz);
      if (dd > 0.25) {
        const s = Math.min(spd, dd * 3);
        this.vx = damp(this.vx, dx / dd * s, 8, dt); this.vz = damp(this.vz, dz / dd * s, 8, dt);
        this.moving = s > 1.2;
      } else { this.vx = damp(this.vx, 0, 10, dt); this.vz = damp(this.vz, 0, 10, dt); }
    } else { this.vx = damp(this.vx, 0, 10, dt); this.vz = damp(this.vz, 0, 10, dt); }
    const ox = this.x, oz = this.z;
    this.x += this.vx * dt; this.z += this.vz * dt;
    const hit = collideCircle(this.x, this.z, 0.3); this.x = hit.x; this.z = hit.z;
    // stuck against a wall: sidestep
    if (this.moving && Math.hypot(this.x - ox, this.z - oz) < dt * 0.4) { this.stuckT += dt; if (this.stuckT > 0.8) { this.stuckT = 0; this.sideT = 0.9; this.sideDir = Math.random() < 0.5 ? 1 : -1; this.goal = null; } } else this.stuckT = 0;
    const sp = Math.hypot(this.vx, this.vz);
    a.speed = sp;
    // facing: the suspect while aiming, otherwise the direction of travel
    const aiming = shoot || (this.armed && face && d < 40 && this.state !== 'leave');
    if (face && (aiming || sp < 0.6)) this.h = dampA(this.h, Math.atan2(face[0] - this.x, face[1] - this.z), 9, dt);
    else if (sp > 0.4) this.h = dampA(this.h, Math.atan2(this.vx, this.vz), 9, dt);
    // pose: crouch in cover between bursts
    this.pose = this.inCover && !this.up ? 'kneel' : null;
    this.fire(dt, d, shoot, aiming);
    this.y = damp(this.y, groundH(this.x, this.z), 12, dt);
    this.sync(dt);
  }
  // choose a firing position: cover behind the unit's car, a flank, or advance
  pickPosition(d) {
    const P = player, u = this.unit, car = u && !u.car.dead && !u.car.wrecked ? u.car : null;
    this.inCover = false; this.goal = null; this.goalT = rr(5, 8);
    if (car && this.flankSide === 0 && Math.hypot(car.x - this.x, car.z - this.z) < 16 && Math.hypot(car.x - P.x, car.z - P.z) > 7) {
      const nx = car.x - P.x, nz = car.z - P.z, nl = Math.hypot(nx, nz) || 1;
      const ax = Math.sin(car.h), az = Math.cos(car.h), along = (this.coverIdx ? 1 : -1) * car.T.L * 0.32;
      const off = car.T.W * 0.5 + 1.05;
      const gx = car.x + nx / nl * off + ax * along, gz = car.z + nz / nl * off + az * along;
      if (!collideCircle(gx, gz, 0.35).hit) { this.goal = [gx, gz]; this.inCoverGoal = true; this.goalT = rr(7, 11); return; }
    }
    if (this.flankSide && d > 7 && d < 32) {
      const ang = Math.atan2(this.x - P.x, this.z - P.z) + this.flankSide * rr(0.8, 1.2), R = clamp(d * 0.85, 9, 15);
      const gx = P.x + Math.sin(ang) * R, gz = P.z + Math.cos(ang) * R;
      if (!pointInBuilding(gx, gz) && !collideCircle(gx, gz, 0.4).hit && losClear(gx, gz, P.x, P.z)) { this.goal = [gx, gz]; this.inCoverGoal = false; return; }
      this.flankSide = 0;
    }
    if (d > 20 || !this.seen) {
      const k = Math.max(0, d - 13) / (d || 1);
      this.goal = [this.x + (P.x - this.x) * k, this.z + (P.z - this.z) * k]; this.inCoverGoal = false;
    }
  }
  fire(dt, d, shoot, aiming) {
    const a = this.anim, G = this.G;
    // in cover once the goal is reached
    if (this.goal && this.inCoverGoal && Math.hypot(this.goal[0] - this.x, this.goal[1] - this.z) < 0.6) this.inCover = true;
    else if (!this.goal || !this.inCoverGoal) this.inCover = false;
    if (this.reloadT > 0) {
      this.reloadT -= dt; a.reload = clamp(1 - this.reloadT / G.reload, 0, 1);
      if (this.reloadT <= 0) { this.ammo = G.mag; a.reload = 0; }
      a.aim = damp(a.aim, 0.3, 8, dt); this.aimT = 0; return;
    }
    a.aim = damp(a.aim, aiming && this.armed ? 1 : 0, 8, dt);
    const P = player, pc = P.mode === 'car' ? P.car : null;
    const ty = pc ? pc.y + 1.0 : P.y + 1.35;
    a.aimPitch = Math.atan2(ty - (this.y + 1.4), Math.max(d, 0.5));
    a.aimYaw = clamp(wrapA(Math.atan2(P.x - this.x, P.z - this.z) - this.h), -1, 1);
    if (!shoot || !this.armed || d > G.range || P.dead) { this.aimT = Math.max(0, this.aimT - dt); this.burstN = 0; return; }
    this.aimT += dt; this.cd -= dt;
    if (this.burstN > 0) { this.burstT -= dt; if (this.burstT <= 0) { this.burstN--; this.burstT = G.gap; this.shoot(d); } return; }
    if (this.aimT > 0.5 && this.cd <= 0 && a.aim > 0.75) { this.cd = rr(G.cd[0], G.cd[1]); this.burstN = G.burst - 1; this.burstT = G.gap; this.shoot(d); }
  }
  shoot(d) {
    if (this.ammo <= 0) { this.reloadT = this.G.reload; return; }
    const P = player, pc = P.mode === 'car' ? P.car : null;
    const h = this.h, sx = Math.sin(h), sz = Math.cos(h);
    const mx = this.x + sx * 0.55 - sz * 0.14, my = this.y + 1.42, mz = this.z + sz * 0.55 + sx * 0.14;
    const tx = pc ? pc.x : P.x, ty = pc ? pc.y + 1.0 : P.y + 1.35, tz = pc ? pc.z : P.z;
    let dx = tx - mx, dy = ty - my, dz = tz - mz; const L = Math.hypot(dx, dy, dz) || 1; dx /= L; dy /= L; dz /= L;
    // hold fire if another officer is in the line of fire
    for (const o of polCops) {
      if (o === this || !o.alive) continue;
      const ox = o.x - mx, oz = o.z - mz, t = ox * dx + oz * dz;
      if (t < 0.6 || t > L - 0.4) continue;
      if (Math.hypot(ox - dx * t, oz - dz * t) < 0.65) { this.sideT = 0.8; this.sideDir = Math.random() < 0.5 ? 1 : -1; return; }
    }
    this.ammo--; if (this.ammo <= 0) this.reloadT = this.G.reload;
    const psp = pc ? pc.speed : Math.hypot(P.vx, P.vz);
    const err = this.G.err0 + this.G.errK * L + psp * 0.09 + (this.moving ? 0.5 : 0) + (this.aimT < 1.0 ? 0.3 : 0) + DAY.night * 0.15;
    POL.shots++;
    const hp = P.health;
    // the car body soaks part of the hit (fireBullet passes 30 % on to the driver)
    const r = fireBullet({ x: mx, y: my, z: mz, dx, dy, dz, range: this.G.range + 10, damage: pc ? this.G.dmg * 0.6 : this.G.dmg, shooter: this, spread: err / L, minDist: this.inCover ? 2.4 : 0.45 });
    if (r && (r.type === 'player' || (r.type === 'car' && r.target === P.car)) && P.health < hp) POL.hits++;
    this.anim.recoil = 1;
    polShotFx(mx, my, mz, dx, dz);
  }
  postAnim() { if (POL.aimFallback) polAimPose(this.H, this.anim); }
}
function polShotFx(x, y, z, dx, dz) {
  if (polArsenal()) return; // the weapons module draws the muzzle flash, tracer and sound from the officer's gun
  fireFx.emit(x + dx * 0.15, y, z + dz * 0.15, dx * 2, 0.2, dz * 2, 0.05, 0.5, 0.15, 2.0, 1.6, 0.8, 1, 1.2, 0.5, 0.1, 0, 0);
  POL.flashes.push({ x, y, z, t: 0.06 });
  if (POL.flashes.length > 24) POL.flashes.shift();
  const dd = Math.hypot(x - camera.position.x, z - camera.position.z);
  const v = clamp(1 - dd / 140, 0, 1);
  if (v > 0.02) { AUD.noise(0.13, 0.32 * v * v + 0.02, 1100, 0.6, 'lowpass'); AUD.tone(140, 0.09, 'square', 0.05 * v, 55); }
}
function polCopCap() { return qualityName === 'low' ? 5 : qualityName === 'medium' ? 8 : 12; }
// officers still in the fight (not the ones walking away after standing down)
function polLiveCops() { let n = 0; for (const c of polCops) if (c.state !== 'dead' && c.state !== 'leave') n++; return n; }
// spawn the crew of a stopped police car; returns how many officers got out
function policeDeployCrew(u) {
  // the armoured squad always gets out (it is the 5-star response); other crews respect the cap
  const c = u.car, cap = u.role === 'van' ? 4 : polCopCap() - polLiveCops();
  const n = Math.min(u.seats, cap, wanted.stars <= 1 ? 1 : u.seats);
  if (n <= 0) return 0;
  const wpn = u.role === 'van' || wanted.stars >= 3 ? 'rifle' : 'pistol';
  const sx = Math.cos(c.h), sz = -Math.sin(c.h), fx = Math.sin(c.h), fz = Math.cos(c.h);
  for (let k = 0; k < n; k++) {
    const side = k % 2 ? -1 : 1, back = k >= 2 ? -1.7 : 0.25;
    const x = c.x + sx * side * 1.2 + fx * back, z = c.z + sz * side * 1.2 + fz * back;
    const cop = new PolCop(x, z, u, wpn, u.role === 'van');
    cop.h = c.h + side * Math.PI / 2; cop.goal = [x + sx * side * 1.4, z + sz * side * 1.4]; cop.coverIdx = k % 2;
    if (k >= 2) cop.flankSide = side;
    u.crew.push(cop); u.seats--;
  }
  AUD.door();
  return n;
}
// a deployed car waits for its crew; it drives on once everybody is back on board
function policeDeployedUpdate(u, dt) {
  if (u.state === 'block') return;
  for (let i = u.crew.length - 1; i >= 0; i--) { const c = u.crew[i]; if (c.removed || c.state === 'dead') { u.crew.splice(i, 1); if (!c.removed) c.unit = null; } }
  const P = player, d = Math.hypot(P.x - u.car.x, P.z - u.car.z);
  const gone = (P.mode === 'car' && P.car && P.car.speed > 6 && d > 28) || d > 75 || wanted.stars === 0;
  if (gone) for (const c of u.crew) if (c.alive && c.state !== 'return') { c.state = 'return'; c.lostT = 0; c.inCover = false; }
  if (!u.crew.length && u.seats > 0) { u.state = 'drive'; u.deployCd = 3; }
}
function policeUnitLost(u) { if (u.crew) for (const c of u.crew) c.unit = null; }

// ---------- roadblocks ----------
let POL_RB_MESH = null;
function polRbMesh() {
  if (POL_RB_MESH) return POL_RB_MESH;
  const pb = new CityPropBatch(MATS.furn, true, 1e6); pb.frame(0, 0, 0, 0);
  for (const s of [-0.85, 0.85]) { pb.put(CITY_PG.box, s, 0.45, 0.18, 0.06, 0.95, 0.06, cityCol('#d9d9d9'), 0.35); pb.put(CITY_PG.box, s, 0.45, -0.18, 0.06, 0.95, 0.06, cityCol('#d9d9d9'), -0.35); }
  for (let k = 0; k < 5; k++) pb.box(-1.0 + k * 0.4, -0.6 + k * 0.4, 0.72, 0.98, -0.04, 0.04, k % 2 ? cityCol('#f4f1ea') : cityCol('#d8343f'));
  const c = pb.ch.values().next().value;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(c.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(c.n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(c.c, 3)); g.setIndex(c.i);
  POL_RB_MESH = new THREE.InstancedMesh(g, MATS.furn, 16); POL_RB_MESH.count = 0; POL_RB_MESH.castShadow = true; scene.add(POL_RB_MESH);
  return POL_RB_MESH;
}
function polRebuildBarriers() {
  const m = polRbMesh(); let k = 0;
  for (const B of POL.blocks) for (const s of B.barriers) { if (k >= 16) break; setInst(m, k++, s[0], groundH(s[0], s[1]), s[1], s[2], 1, 1, 1); }
  m.count = k; m.instanceMatrix.needsUpdate = true;
}
// place a roadblock on the road ahead of a driving suspect
function polTrySpawnRoadblock() {
  POL.blockCd = 2.5;
  const pc = player.mode === 'car' ? player.car : null;
  if (!pc || pc.speed < 8) return null;
  const maxB = wanted.stars >= 4 ? 2 : 1;
  if (POL.blocks.length >= maxB) return null;
  const alongX = Math.abs(pc.vx) > Math.abs(pc.vz), s = Math.sign(alongX ? pc.vx : pc.vz);
  const fi = (pc.x + CITY.HALF) / CITY.P, fj = (pc.z + CITY.HALF) / CITY.P;
  const line = alongX ? Math.round(fj) : Math.round(fi);
  if (line < 0 || line > CITY.N) return null;
  if ((alongX ? Math.abs(pc.z - roadC(line)) : Math.abs(pc.x - roadC(line))) > 9) return null;
  const cur = alongX ? fi : fj;
  let k = s > 0 ? Math.ceil(cur + 0.02) : Math.floor(cur - 0.02);
  for (let tries = 0; tries < 3; tries++, k += s) {
    const k2 = k + s; if (k < 0 || k > CITY.N || k2 < 0 || k2 > CITY.N) return null;
    const ax = alongX ? roadC(k) : roadC(line), az = alongX ? roadC(line) : roadC(k);
    const cx = ax + (alongX ? s * 32 : 0), cz = az + (alongX ? 0 : s * 32);
    const d = Math.hypot(cx - pc.x, cz - pc.z);
    if (d < 85 || d > 240) continue;
    if (d < 150 && inView(cx, cz, 1)) continue;
    if (POL.blocks.some((B) => Math.hypot(B.x - cx, B.z - cz) < 60)) return null;
    POL.blockCd = wanted.stars >= 4 ? 14 : 20;
    return polBuildRoadblock(cx, cz, alongX ? s : 0, alongX ? 0 : s);
  }
  return null;
}
function polBuildRoadblock(cx, cz, dx, dz) {
  const px = -dz, pz = dx, n = wanted.stars >= 4 ? 3 : 2, offs = n === 3 ? [-5.3, 0, 5.3] : [-3.4, 3.4];
  const B = { x: cx, z: cz, dx, dz, units: [], cops: [], barriers: [], t: 0 };
  // clear traffic standing on the spot
  for (const c of cars.slice()) if (c.ai instanceof TrafficAI && Math.abs(c.x - cx) < 14 && Math.abs(c.z - cz) < 14) c.remove();
  offs.forEach((o, i) => {
    const car = new Car('police');
    car.place(cx + px * o, cz + pz * o, Math.atan2(px, pz) + (i % 2 ? 0.38 : -0.38) + (i === 1 && n === 3 ? Math.PI : 0));
    const u = new PoliceAI(car, 'block'); u.rb = B; police.push(u); B.units.push(u);
  });
  if (n === 2) { B.barriers.push([cx, cz, Math.atan2(px, pz)]); for (const s of [-1, 1]) B.barriers.push([cx + px * s * 7.0, cz + pz * s * 7.0, Math.atan2(px, pz)]); }
  else for (const s of [-1, 1]) B.barriers.push([cx + px * s * 7.6, cz + pz * s * 7.6, Math.atan2(px, pz)]);
  const ncop = Math.min(n === 3 ? 3 : 2, Math.max(0, polCopCap() - polLiveCops()));
  for (let k = 0; k < ncop; k++) {
    const o = lerp(-4.5, 4.5, ncop === 1 ? 0.5 : k / (ncop - 1));
    const x = cx + px * o + dx * 3.0, z = cz + pz * o + dz * 3.0;
    const cop = new PolCop(x, z, null, wanted.stars >= 3 ? 'rifle' : 'pistol', false, 'guard');
    cop.state = 'guard'; cop.arm(true); cop.h = Math.atan2(-dx, -dz); cop.goal = [x, z];
    B.cops.push(cop);
  }
  POL.blocks.push(B); polRebuildBarriers();
  return B;
}
function polUpdateRoadblocks(dt) {
  let dirty = false;
  for (let i = POL.blocks.length - 1; i >= 0; i--) {
    const B = POL.blocks[i]; B.t += dt;
    const d = Math.hypot(B.x - player.x, B.z - player.z);
    const alive = B.units.filter((u) => police.includes(u) && !u.car.dead);
    const done = (!alive.length && B.t > 2) || ((d > 240 || (wanted.stars === 0 && d > 90)) && !inView(B.x, B.z, 1)) || (wanted.stars === 0 && B.t > 60);
    if (!done) continue;
    for (const u of B.units) { if (!u.car.dead) u.car.remove(); const k = police.indexOf(u); if (k >= 0) police.splice(k, 1); }
    for (const c of B.cops) if (!c.removed && (d > 60 || !inView(c.x, c.z))) c.remove(); else if (!c.removed) { c.role = 'patrol'; c.state = 'leave'; }
    POL.blocks.splice(i, 1); dirty = true;
  }
  if (dirty) polRebuildBarriers();
}

// ---------- helicopter ----------
let POL_HELI_ASSETS = null;
function polHeliAssets() {
  if (POL_HELI_ASSETS) return POL_HELI_ASSETS;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.35 });
  const pb = new CityPropBatch(mat, true, 1e6); pb.frame(0, 0, 0, 0);
  const navy = cityCol('#17244a'), white = cityCol('#eef0f4'), dark = cityCol('#22252b'), grey = cityCol('#8a9099');
  pb.put(CITY_PG.sph, 0, 0, 0.2, 2.5, 2.3, 4.8, navy);
  pb.put(CITY_PG.sph, 0, -0.2, 0.25, 2.56, 0.5, 4.6, white);
  pb.box(-0.55, 0.55, 0.9, 1.45, -1.3, 0.8, navy);
  const boom = new THREE.CylinderGeometry(0.2, 0.42, 5.6, 10); boom.rotateX(Math.PI / 2);
  pb.put(boom, 0, 0.35, -4.0, 1, 1, 1, navy);
  pb.put(CITY_PG.box, 0, 1.05, -6.55, 0.12, 1.6, 0.95, navy, -0.3);
  pb.box(-1.0, 1.0, 0.36, 0.44, -6.1, -5.6, white);
  for (const s of [-1, 1]) {
    pb.put(CITY_PG.cyl, s * 0.95, -1.35, 0.2, 0.1, 3.6, 0.1, dark, Math.PI / 2);
    for (const zz of [-0.7, 1.0]) pb.box(s * 0.95 - 0.04, s * 0.95 + 0.04, -1.35, -0.75, zz - 0.04, zz + 0.04, dark);
  }
  pb.put(CITY_PG.cyl, 0, -1.0, 1.65, 0.36, 0.3, 0.36, grey, 0.4);
  pb.put(CITY_PG.cyl, 0, 1.55, -0.2, 0.16, 0.5, 0.16, dark);
  const body = new THREE.BufferGeometry(); { const c = pb.ch.values().next().value; body.setAttribute('position', new THREE.Float32BufferAttribute(c.p, 3)); body.setAttribute('normal', new THREE.Float32BufferAttribute(c.n, 3)); body.setAttribute('color', new THREE.Float32BufferAttribute(c.c, 3)); body.setIndex(c.i); }
  pb.ch.clear(); pb.frame(0, 0, 0, 0);
  pb.put(CITY_PG.cyl, 0, 0, 0, 0.42, 0.22, 0.42, dark);
  pb.box(-6.2, 6.2, -0.02, 0.03, -0.17, 0.17, dark); pb.box(-0.17, 0.17, -0.02, 0.03, -6.2, 6.2, dark);
  const rotor = new THREE.BufferGeometry(); { const c = pb.ch.values().next().value; rotor.setAttribute('position', new THREE.Float32BufferAttribute(c.p, 3)); rotor.setAttribute('normal', new THREE.Float32BufferAttribute(c.n, 3)); rotor.setAttribute('color', new THREE.Float32BufferAttribute(c.c, 3)); rotor.setIndex(c.i); }
  const tail = mergeGeos([boxAt(-0.02, 0.02, -0.75, 0.75, -0.07, 0.07), boxAt(-0.02, 0.02, -0.07, 0.07, -0.75, 0.75)]);
  const glass = new THREE.SphereGeometry(1, 16, 10); glass.scale(1.05, 0.82, 1.25); glass.translate(0, 0.28, 1.45);
  const decal = mergeGeos([(() => { const g = new THREE.PlaneGeometry(1.9, 0.48); g.rotateY(Math.PI / 2); g.translate(1.27, -0.2, -0.3); return g; })(), (() => { const g = new THREE.PlaneGeometry(1.9, 0.48); g.rotateY(-Math.PI / 2); g.translate(-1.27, -0.2, -0.3); return g; })()]);
  const disc = new THREE.CircleGeometry(6.2, 28); disc.rotateX(-Math.PI / 2);
  const beam = new THREE.CylinderGeometry(0.12, 1, 1, 18, 1, true); beam.translate(0, -0.5, 0);
  { const p = beam.attributes.position, col = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) { const k = p.getY(i) > -0.5 ? 1.0 : 0.18; col[i * 3] = k; col[i * 3 + 1] = k * 0.96; col[i * 3 + 2] = k * 0.88; } beam.setAttribute('color', new THREE.BufferAttribute(col, 3)); }
  const spotC = mkCanvas(128, 128), sg = spotC.getContext('2d'), gr = sg.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,250,235,1)'); gr.addColorStop(0.55, 'rgba(255,244,215,0.55)'); gr.addColorStop(1, 'rgba(255,240,200,0)'); sg.fillStyle = gr; sg.fillRect(0, 0, 128, 128);
  const spot = new THREE.PlaneGeometry(1, 1); spot.rotateX(-Math.PI / 2);
  POL_HELI_ASSETS = {
    body, rotor, tail, glass, decal, disc, beam, spot, mat,
    discMat: new THREE.MeshBasicMaterial({ color: 0x1a1d22, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }),
    beamMat: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }),
    spotMat: new THREE.MeshBasicMaterial({ map: toTex(spotC, { wrap: false, srgb: false }), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
  };
  return POL_HELI_ASSETS;
}
const _polHeQ = new THREE.Quaternion(), _polHeD = new V3(), _polHeDown = new V3(0, -1, 0), _polHeM = new V3();
class PoliceHeli {
  constructor() {
    const A = polHeliAssets();
    this.car = this; this.heli = true; this.mode = 'chase'; this.role = 'heli'; this.seen = false; this.crew = []; this.seats = 0; this.state = 'fly';
    this.wrecked = false; this.dead = false; this.exploded = false; this.health = 520; this.T = { police: true, L: 9, W: 2.6 };
    const a = Math.random() * TAU, R = 210;
    this.x = player.x + Math.cos(a) * R; this.z = player.z + Math.sin(a) * R; this.y = 75;
    this.vx = 0; this.vz = 0; this.vy = 0; this.h = Math.atan2(player.x - this.x, player.z - this.z); this.pitch = 0; this.roll = 0;
    this.orbit = a + Math.PI; this.roofT = 0; this.roof = 30; this.seeT = 0; this.shotCd = rr(2, 3); this.burstN = 0; this.burstT = 0; this.thumpT = 0; this.fallT = 0;
    this.lx = player.x; this.lz = player.z;
    const g = this.g = new THREE.Group();
    const body = new THREE.Mesh(A.body, A.mat); body.castShadow = true; g.add(body);
    g.add(new THREE.Mesh(A.glass, CARMAT.glass));
    g.add(new THREE.Mesh(A.decal, CARMAT.police));
    this.rotor = new THREE.Mesh(A.rotor, A.mat); this.rotor.position.set(0, 1.82, -0.2); this.rotor.castShadow = true; g.add(this.rotor);
    this.disc = new THREE.Mesh(A.disc, A.discMat); this.disc.position.set(0, 1.84, -0.2); g.add(this.disc);
    this.tail = new THREE.Mesh(A.tail, A.mat); this.tail.position.set(0.18, 1.05, -6.65); g.add(this.tail);
    // door gunner
    this.gunner = buildHuman(polCopLook(true)); this.gunner.root.position.set(-0.95, -0.95, 0.35); this.gunner.root.rotation.y = -Math.PI / 2; g.add(this.gunner.root);
    this.gAnim = { speed: 0, t: 0, mode: 'normal', aim: 1, aimYaw: 0, aimPitch: 0, weapon: 'twohand', recoil: 0, reload: 0, hands: false, phone: false };
    polArmHuman(this.gunner, 'rifle');
    scene.add(g);
    this.beam = new THREE.Mesh(A.beam, A.beamMat); this.beam.frustumCulled = false; scene.add(this.beam);
    this.spot = new THREE.Mesh(A.spot, A.spotMat); this.spot.renderOrder = 2; scene.add(this.spot);
  }
  get speed() { return Math.hypot(this.vx, this.vz); }
  damage(d) {
    if (this.wrecked) return;
    this.health -= d;
    if (this.health <= 0) { this.wrecked = true; this.fallT = 0; this.mode = 'leave'; HUD.toast('Вертолёт подбит!', 'cash'); addCrime(1.0, 'Сбит полицейский вертолёт!'); }
  }
  remove() {
    if (this.dead) return;
    this.dead = true; scene.remove(this.g); scene.remove(this.beam); scene.remove(this.spot); this.gunner.dispose();
    if (POL.heli === this) POL.heli = null;
  }
  update(dt) {
    if (this.dead) return;
    const P = player, A = POL_HELI_ASSETS;
    this.rotor.rotation.y += dt * (this.wrecked ? 14 : 34); this.tail.rotation.x += dt * 52;
    if (this.wrecked) {
      // spinning fall, then an explosion on impact
      this.fallT += dt; this.vy -= 9 * dt; this.h += dt * 3.2;
      this.x += this.vx * dt; this.z += this.vz * dt; this.y += this.vy * dt;
      if (Math.random() < 0.7) puffSmoke(this.x, this.y + 0.5, this.z, 1, true, 0.5);
      if (this.y <= groundH(this.x, this.z) + 0.9 || this.fallT > 12) {
        explosionFx(this.x, Math.max(this.y, 0.5), this.z);
        if (GAMEHOOK.explosion) GAMEHOOK.explosion(this.x, this.z, null);
        EV.emit('explosion', { x: this.x, z: this.z, car: null, heli: true });
        this.remove(); return;
      }
      this.sync(dt); return;
    }
    // altitude above the roofs under and ahead of the helicopter
    this.roofT -= dt;
    if (this.roofT <= 0) { this.roofT = 0.5; this.roof = polRoofHeight(this.x + this.vx * 2, this.z + this.vz * 2, 32); }
    const known = GAME.time - wanted.seenAt < 2.5;
    const tx = known ? P.x : wanted.lastX, tz = known ? P.z : wanted.lastZ;
    let gx, gz, gy;
    if (this.mode === 'leave' || P.dead) {
      const a = Math.atan2(this.x - P.x, this.z - P.z); gx = this.x + Math.sin(a) * 80; gz = this.z + Math.cos(a) * 80; gy = this.roof + 50;
      if (Math.hypot(this.x - P.x, this.z - P.z) > 300) { this.remove(); return; }
    } else {
      this.orbit += dt * 0.2;
      const R = 30; gx = tx + Math.cos(this.orbit) * R; gz = tz + Math.sin(this.orbit) * R; gy = Math.max(36, this.roof + 16);
    }
    const dx = gx - this.x, dz = gz - this.z, dd = Math.hypot(dx, dz), vmax = 28;
    const wx = dd > 0.1 ? dx / dd * Math.min(vmax, dd * 0.7) : 0, wz = dd > 0.1 ? dz / dd * Math.min(vmax, dd * 0.7) : 0;
    const ax = (wx - this.vx) * 1.1, az = (wz - this.vz) * 1.1;
    this.vx += ax * dt; this.vz += az * dt; this.vy = damp(this.vy, clamp((gy - this.y) * 0.8, -8, 10), 2, dt);
    this.x += this.vx * dt; this.z += this.vz * dt; this.y += this.vy * dt;
    // nose such that the gunner's door (left side) faces the target
    const toT = Math.atan2(tx - this.x, tz - this.z);
    this.h = dampA(this.h, this.mode === 'leave' ? Math.atan2(this.vx, this.vz) : toT + Math.PI / 2, 1.3, dt);
    const fx = Math.sin(this.h), fz = Math.cos(this.h);
    this.pitch = damp(this.pitch, clamp((ax * fx + az * fz) * 0.05, -0.3, 0.3), 3, dt);
    this.roll = damp(this.roll, clamp((ax * fz - az * fx) * -0.05, -0.3, 0.3), 3, dt);
    // searchlight follows the suspect with a lag (fast cars outrun it), or sweeps the last known area
    const st = GAME.time;
    const lt = known ? [P.x, P.z] : [wanted.lastX + Math.sin(st * 0.7) * 9, wanted.lastZ + Math.cos(st * 0.9) * 9];
    const ldx = lt[0] - this.lx, ldz = lt[1] - this.lz, ld = Math.hypot(ldx, ldz), lv = 15 * dt;
    if (ld > lv) { this.lx += ldx / ld * lv; this.lz += ldz / ld * lv; } else { this.lx = lt[0]; this.lz = lt[1]; }
    // sight: line of sight from above; at night the suspect must be in the light or close
    this.seeT -= dt;
    if (this.seeT <= 0 && this.mode !== 'leave') {
      this.seeT = 0.3;
      const ex = P.x - this.x, ey = P.y + 1.2 - this.y, ez = P.z - this.z, d3 = Math.hypot(ex, ey, ez);
      let vis = d3 < 150 && rayBoxes(this.x, this.y, this.z, ex / d3, ey / d3, ez / d3, d3) >= d3 - 1.5;
      if (vis && DAY.night > 0.4) vis = Math.hypot(P.x - this.lx, P.z - this.lz) < 8 || d3 < 42;
      this.seen = vis && !P.dead;
      if (this.seen) policeSpot();
    }
    // door gunner bursts
    this.shotCd -= dt;
    if (this.seen && wanted.stars >= 4 && !P.dead && this.mode !== 'leave') {
      if (this.burstN > 0) { this.burstT -= dt; if (this.burstT <= 0) { this.burstN--; this.burstT = 0.12; this.fire(); } }
      else if (this.shotCd <= 0) { this.shotCd = rr(2.0, 3.0); this.burstN = 2; this.burstT = 0.12; this.fire(); }
    }
    // rotor sound
    this.thumpT -= dt;
    if (this.thumpT <= 0) { this.thumpT = 0.11; const d = Math.hypot(this.x - camera.position.x, this.z - camera.position.z, this.y - camera.position.y), v = clamp(1 - d / 220, 0, 1); if (v > 0.01) AUD.noise(0.075, 0.2 * v * v, 150, 1.4, 'lowpass'); }
    this.sync(dt);
  }
  fire() {
    const P = player, pc = P.mode === 'car' ? P.car : null;
    this.g.updateMatrixWorld(true);
    _polHeM.set(-1.6, -0.35, 0.5).applyMatrix4(this.g.matrixWorld);
    const tx = pc ? pc.x : P.x, ty = pc ? pc.y + 1.0 : P.y + 1.35, tz = pc ? pc.z : P.z;
    let dx = tx - _polHeM.x, dy = ty - _polHeM.y, dz = tz - _polHeM.z; const L = Math.hypot(dx, dy, dz) || 1; dx /= L; dy /= L; dz /= L;
    const psp = pc ? pc.speed : Math.hypot(P.vx, P.vz);
    const err = 0.9 + 0.02 * L + psp * 0.1 + DAY.night * 0.2;
    POL.shots++;
    const hp = P.health;
    const r = fireBullet({ x: _polHeM.x, y: _polHeM.y, z: _polHeM.z, dx, dy, dz, range: 160, damage: pc ? 4.5 : 7, shooter: this, spread: err / L, minDist: 1.5 });
    if (r && P.health < hp) POL.hits++;
    this.gAnim.recoil = 1;
    polShotFx(_polHeM.x, _polHeM.y, _polHeM.z, dx, dz);
  }
  sync(dt) {
    this.g.position.set(this.x, this.y, this.z);
    this.g.rotation.set(this.pitch, this.h, this.roll, 'YXZ');
    // gunner aims at the suspect from the door
    const ga = this.gAnim; ga.t += dt; ga.recoil = Math.max(0, ga.recoil - dt * 7);
    const P = player, toP = Math.atan2(P.x - this.x, P.z - this.z);
    ga.aimYaw = clamp(wrapA(toP - (this.h - Math.PI / 2)), -1.0, 1.0);
    ga.aimPitch = Math.atan2(P.y + 1.35 - this.y, Math.max(1, Math.hypot(P.x - this.x, P.z - this.z)));
    animHuman(this.gunner, ga, dt);
    pedApplyPose(this.gunner, 'sit', 1);
    if (POL.aimFallback) polAimPose(this.gunner, ga);
    // searchlight cone and ground pool (night)
    const n = DAY.night, A = POL_HELI_ASSETS;
    const on = n > 0.15 && !this.wrecked;
    this.beam.visible = on; this.spot.visible = on;
    if (on) {
      const sy = this.y - 1.0, gy = groundH(this.lx, this.lz);
      _polHeD.set(this.lx - this.x, gy - sy, this.lz - this.z); const len = _polHeD.length(); _polHeD.multiplyScalar(1 / len);
      _polHeQ.setFromUnitVectors(_polHeDown, _polHeD);
      this.beam.position.set(this.x + Math.sin(this.h) * 1.6, sy, this.z + Math.cos(this.h) * 1.6); this.beam.quaternion.copy(_polHeQ); this.beam.scale.set(4.2, len, 4.2);
      A.beamMat.opacity = 0.16 * n;
      this.spot.position.set(this.lx, gy + 0.06, this.lz); this.spot.scale.set(10, 1, 10); A.spotMat.opacity = 0.95 * n;
    }
  }
}
// highest roof within r of (x, z)
function polRoofHeight(x, z, r) {
  let h = 0;
  for (const b of buildings) { if (b.x1 < x - r || b.x0 > x + r || b.z1 < z - r || b.z0 > z + r) continue; if (b.top > h) h = b.top; }
  for (const b of bInst) { if (b.y0 === 0 || b.x1 < x - r || b.x0 > x + r || b.z1 < z - r || b.z0 > z + r) continue; if (b.top > h) h = b.top; }
  return h;
}
function polSpawnHeli() {
  const h = new PoliceHeli(); POL.heli = h; police.push(h); POL.heliCd = 25;
  HUD.toast('В воздухе полицейский вертолёт', 'warn');
  return h;
}

// ---------- witnesses and crime reports ----------
const POL_INC = { list: [], witnesses: [] };
// a crime at (x, z): merged with an open incident nearby, then reported by police or witnesses
function polReportIncident(x, z, amount, why) {
  if (GAME.state !== 'play' || player.dead || GAME.cheats.noPolice) return;
  for (const I of POL_INC.list) if (!I.closed && Math.hypot(I.x - x, I.z - z) < 35) { if (amount > I.amount) { I.amount = amount; I.why = why; } return; }
  POL_INC.list.push({ x, z, amount, why, t: 0.9, closed: false, reported: false });
}
function policeSeesPoint(x, z) {
  for (const p of police) { if (p.mode === 'leave' || p.car.wrecked) continue; const d = Math.hypot(p.car.x - x, p.car.z - z); if (d < (p.heli ? 120 : 60) && (p.heli || losClear(p.car.x, p.car.z, x, z))) return true; }
  for (const c of polCops) { if (!c.alive) continue; const d = Math.hypot(c.x - x, c.z - z); if (d < 55 && losClear(c.x, c.z, x, z)) return true; }
  return false;
}
function polCloseIncident(I) {
  I.closed = true;
  if (policeSeesPoint(I.x, I.z)) { I.reported = true; addCrime(I.amount, I.why + ' — полиция всё видела'); policeSpot(); return; }
  const list = [];
  for (const p of peds) {
    if (p.cop || !p.alive || p.report) continue;
    const d = Math.hypot(p.x - I.x, p.z - I.z);
    if (d < 20 || (d < 55 && losClear(p.x, p.z, I.x, I.z))) list.push([d, p]);
  }
  list.sort((a, b) => a[0] - b[0]);
  const n = Math.min(3, list.length);
  for (let k = 0; k < n; k++) {
    const p = list[k][1];
    p.report = I; p.anim.phone = true;
    if (p.state !== 'flee') p.flee(I.x, I.z, rr(7, 11)); else p.fleeT = Math.max(p.fleeT, 7);
    p.anim.phone = true;
    POL_INC.witnesses.push({ p, I, t: rr(4, 7) });
  }
  if (n && GAME.time - POL.toastT > 6) { POL.toastT = GAME.time; HUD.toast(n > 1 ? 'Свидетели звонят в полицию…' : 'Свидетель звонит в полицию…', 'warn'); }
}
function polUpdateIncidents(dt) {
  for (let i = POL_INC.list.length - 1; i >= 0; i--) { const I = POL_INC.list[i]; if (!I.closed) { I.t -= dt; if (I.t <= 0) polCloseIncident(I); } else if (I.reported || !POL_INC.witnesses.some((w) => w.I === I)) POL_INC.list.splice(i, 1); }
  for (let i = POL_INC.witnesses.length - 1; i >= 0; i--) {
    const w = POL_INC.witnesses[i], p = w.p;
    // stopped: the witness was taken down or left the area (despawned)
    if (p.removed || !p.alive || w.I.reported) { if (!p.removed) { p.report = null; p.anim.phone = false; } POL_INC.witnesses.splice(i, 1); continue; }
    w.t -= dt;
    if (w.t <= 0) {
      w.I.reported = true; p.report = null; p.anim.phone = false; POL_INC.witnesses.splice(i, 1);
      POL.reports++;
      if (GAME.state === 'play' && !player.dead) { addCrime(w.I.amount, 'Свидетель сообщил: ' + w.I.why.toLowerCase()); wanted.lastX = w.I.x; wanted.lastZ = w.I.z; wanted.lastVX = wanted.lastVZ = 0; }
    }
  }
}
function polScanExplosions() {
  for (const c of cars) if (c.exploded && !c._aiBoom) { c._aiBoom = true; polOnExplosion(c.x, c.z, c); }
}
function polOnExplosion(x, z, car) {
  if (car && car._aiBoomDone) return;
  if (car) car._aiBoomDone = true;
  pedPanic(x, z, 70, 'boom');
  trafficScare(x, z, 45);
  const near = Math.hypot(x - player.x, z - player.z) < 45;
  if (car && (GAME.time - (car.playerHitT || -99) < 12 || car === POL.lastPlayerCar)) polReportIncident(x, z, 1.2, 'Взрыв на улице');
  else if (!car && near && GAME.time - wanted.hostileAt < 5) polReportIncident(x, z, 1.2, 'Взрыв на улице');
}

// ---------- events ----------
// With the weapons module (owner B) the player's own shots already raise an immediate crime (hits, kills,
// attacks on officers). Then witnesses only top that up to the full amount, and attacks on officers are
// left to it; without it this module raises everything itself.
const polArsenal = () => typeof wpnShotReaction === 'function';
let polPanicT = 0;
EV.on('gunshot', (e) => {
  if (GAME.state !== 'play') return;
  const fromPlayer = e.shooter === 'player';
  if (GAME.time - polPanicT > 0.25 || fromPlayer) { polPanicT = GAME.time; pedPanic(e.x, e.z, fromPlayer ? 55 : 40, 'gun'); trafficScare(e.x, e.z, fromPlayer ? 36 : 22); }
  if (!fromPlayer) return;
  wanted.hostileAt = GAME.time;
  polReportIncident(e.x, e.z, polArsenal() ? 0.7 : 1.05, 'Стрельба на улице');
  // bullets against the helicopter (it is not part of the shared hit test)
  const h = POL.heli;
  if (h && !h.dead && !h.wrecked) {
    const A = typeof getAim === 'function' ? getAim() : null;
    if (A) {
      const ox = e.x, oy = e.y, oz = e.z, cx = h.x - ox, cy = h.y - oy, cz = h.z - oz, t = cx * A.dx + cy * A.dy + cz * A.dz;
      if (t > 0 && t < 220) { const px = A.dx * t - cx, py = A.dy * t - cy, pz = A.dz * t - cz; if (px * px + py * py + pz * pz < 2.8 * 2.8) { h.damage(22); sparks(ox + A.dx * t, oy + A.dy * t, oz + A.dz * t, 8); polAssault(true); } }
    }
  }
});
// force: the weapons module does not know this target (the helicopter)
function polAssault(force) {
  wanted.hostileAt = GAME.time;
  if (!force && polArsenal()) { policeSpot(); return; }
  if (GAME.time - POL.assaultT > 1.2) { POL.assaultT = GAME.time; addCrime(wanted.stars < 2 ? 2.05 - wanted.heat + 0.01 : 0.6, 'Нападение на полицию!'); policeSpot(); }
}
EV.on('bulletHit', (e) => {
  if (e.shooter !== 'player' || GAME.state !== 'play') return;
  const t = e.target;
  if (e.type === 'ped' && t && t.cop) { polAssault(); return; }
  if (e.type === 'car' && t) {
    t.playerHitT = GAME.time;
    if (t.driver === 'police') { polAssault(); return; }
    if (t.ai instanceof TrafficAI) { if (Math.random() < 0.6) abandonCar(t, e.x, e.z); else t.ai.panicT = rr(6, 10); }
    polReportIncident(e.x, e.z, polArsenal() ? 0.85 : 1.1, 'Стрельба по машинам');
    return;
  }
  if (e.type === 'ped') polReportIncident(e.x, e.z, polArsenal() ? 0.75 : 1.3, 'Стрельба по людям');
});
EV.on('pedKilled', (e) => {
  if (GAME.state !== 'play' || !e.ped) return;
  // fists and bumpers are already reported by the player module; weapons (damage) go through witnesses
  if (e.by !== 'player' || !e.ped._viaDamage) return;
  if (e.ped.cop) { wanted.hostileAt = GAME.time; if (!polArsenal()) addCrime(1.6, 'Убит полицейский!'); policeSpot(); return; }
  polReportIncident(e.ped.x, e.ped.z, polArsenal() ? 0.8 : 1.8, 'Убийство на улице');
});
EV.on('explosion', (e) => {
  if (!e || e.heli) return;
  // grenades and other weapon blasts are judged by the weapons module: only panic and traffic here
  if (e.by === 'player' && polArsenal()) { if (!e.car || !e.car._aiBoom) { pedPanic(e.x, e.z, 70, 'boom'); trafficScare(e.x, e.z, 45); } wanted.hostileAt = GAME.time; if (e.car) e.car._aiBoom = e.car._aiBoomDone = true; return; }
  polOnExplosion(e.x, e.z, e.car || null);
});
EV.on('enterCar', (c) => { POL.lastPlayerCar = c; });
function policeReset() {
  for (const c of polCops.slice()) c.remove();
  for (const B of POL.blocks) for (const u of B.units) { if (!u.car.dead) u.car.remove(); const k = police.indexOf(u); if (k >= 0) police.splice(k, 1); }
  POL.blocks.length = 0; if (POL_RB_MESH) polRebuildBarriers();
  if (POL.heli) { POL.heli.remove(); const k = police.indexOf(POL.heli); if (k >= 0) police.splice(k, 1); POL.heli = null; }
  for (const w of POL_INC.witnesses) if (!w.p.removed) { w.p.report = null; w.p.anim.phone = false; }
  POL_INC.list.length = 0; POL_INC.witnesses.length = 0; POL.flashes.length = 0;
  POL.heliCd = 2; POL.blockCd = 4; POL.vanCd = 0; POLICE_PIT.t = 0;
  wanted.copNear = false; wanted.hostileAt = -99; wanted.seenAt = -99;
}
EV.on('respawn', policeReset);
EV.on('start', policeReset);
EV.on('playerDied', () => { for (const c of polCops) if (c.alive) { c.state = c.unit ? 'return' : 'leave'; c.inCover = false; } });
EV.on('playerBusted', () => { for (const c of polCops) if (c.alive) { c.arm(false); c.state = 'leave'; } });

// called from clearWanted(): everyone stands down
function policeStandDown() {
  for (const c of polCops) if (c.alive && c.state !== 'leave') { c.state = c.unit && !c.unit.car.dead ? 'return' : 'leave'; c.inCover = false; c.lostT = 0; }
  if (POL.heli) POL.heli.mode = 'leave';
  for (const w of POL_INC.witnesses) if (!w.p.removed) { w.p.report = null; w.p.anim.phone = false; }
  POL_INC.list.length = 0; POL_INC.witnesses.length = 0;
  POL.blockCd = 4; POL.heliCd = 2;
}
// called every play frame from updateWanted()
function policeExtras(dt) {
  wanted.copNear = POL.copNearAcc; POL.copNearAcc = false;
  polUpdateIncidents(dt);
  polScanExplosions();
  const S = wanted.stars;
  if (S > 0 && !player.dead) {
    POL.blockCd -= dt;
    if (S >= 3 && POL.blockCd <= 0) polTrySpawnRoadblock();
    if (S >= 4 && (!POL.heli || POL.heli.dead)) { POL.heliCd -= dt; if (POL.heliCd <= 0) polSpawnHeli(); }
    if (S >= 5) {
      POL.vanCd -= dt;
      if (POL.vanCd <= 0 && !police.some((p) => p.role === 'van' && p.mode !== 'leave' && !p.car.dead)) POL.vanCd = spawnPolice('van') ? 30 : 2;
    }
  }
  polUpdateRoadblocks(dt);
}
// HUD hook: every police unit for the minimap
function policeBlips(fn) {
  for (const p of police) { if (p.mode === 'leave' || p.car.dead) continue; fn(p.car.x, p.car.z, p.heli ? 'heli' : p.static ? 'block' : 'car'); }
  for (const c of polCops) if (c.alive) fn(c.x, c.z, 'cop');
}
// glow: muzzle flashes, heli beacons, witness phones
function policeGlow(layer) {
  for (let i = POL.flashes.length - 1; i >= 0; i--) { const f = POL.flashes[i]; layer.add(f.x, f.y, f.z, 2.4, 1.6, 0.6, 1.4); }
  const h = POL.heli;
  if (h && !h.dead) {
    const ph = Math.floor(GAME.time * 3) % 2, fx = Math.sin(h.h), fz = Math.cos(h.h);
    if (ph) layer.add(h.x - fx * 6.6, h.y + 1.9, h.z - fz * 6.6, 2.4, 0.1, 0.08, 2.2);
    layer.add(h.x + Math.cos(h.h) * 1.0, h.y - 0.3, h.z - Math.sin(h.h) * 1.0, 0.1, 1.2, 0.3, 1.2);
    layer.add(h.x - Math.cos(h.h) * 1.0, h.y - 0.3, h.z + Math.sin(h.h) * 1.0, 1.4, 0.1, 0.1, 1.2);
    if (!h.wrecked && DAY.night > 0.15) layer.add(h.x + fx * 1.6, h.y - 1.0, h.z + fz * 1.6, 2.6, 2.5, 2.2, 3.2);
  }
  const blink = Math.floor(GAME.time * 4) % 2;
  if (blink) for (const w of POL_INC.witnesses) { const p = w.p; if (p.root.visible) layer.add(p.x + Math.sin(p.h) * 0.25, p.y + 1.62, p.z + Math.cos(p.h) * 0.25, 0.5, 0.9, 1.6, 0.9); }
}
function policeVisual(dt) {
  for (let i = POL.flashes.length - 1; i >= 0; i--) { POL.flashes[i].t -= dt; if (POL.flashes[i].t <= 0) POL.flashes.splice(i, 1); }
}
EXT.boot.push(() => { polDetectAimPose(); });
EXT.glow.push(policeGlow);
EXT.visual.push(policeVisual);
// debug / test access
window.__neonAI = { cops: polCops, police, wanted, POL, INC: POL_INC, SIG: TSIG, sigState: tsigState, sigGreenLeft: tsigGreenLeft, sigPhase: tsigPhase, peds, cars,
  PoliceAI, Cop: PolCop, ParkedAI, spawnHeli: polSpawnHeli, trySpawnRoadblock: polTrySpawnRoadblock, buildRoadblock: polBuildRoadblock, spawnPolice,
  reportIncident: polReportIncident, policeBlips, TrafficAI, SPOT, LIFE: LIFE_RT, crossers: pedCrossers, CITYX, roofHeight: polRoofHeight, PEDSTAT,
  blockRect: aiBlockRect, blocks, spawnPed, spawnTraffic, spawnWalker: pedSpawnWalker, pedPanic, laneSeg, nodeNeighbors, PIT: POLICE_PIT };
