// ============================================================
//  Traffic, pedestrians, police and the wanted level
// ============================================================
const _pv = new V3();
function inView(x, z, y) {
  _pv.set(x, y === undefined ? 1.5 : y, z).project(camera);
  return Math.abs(_pv.x) < 1.15 && Math.abs(_pv.y) < 1.15 && _pv.z < 1;
}
const nkey = (n) => n[0] * 16 + n[1];
const nodeRes = new Map();

class TrafficAI {
  constructor(car, a, b, s) {
    this.car = car; this.seg = laneSeg(a, b); this.mode = 'lane'; this.s = s;
    this.cruise = rr(11, 15.5); this.v = this.cruise * 0.7; this.turn = null; this.prevV = this.v;
    this.resKey = undefined;
    car.kinematic = true; car.driver = 'ai'; car.ai = this;
    this.apply(0);
  }
  release() { this.freeNode(); }
  freeNode() { if (this.resKey !== undefined && nodeRes.get(this.resKey) === this) nodeRes.delete(this.resKey); this.resKey = undefined; }
  sample() {
    const S = this.seg;
    if (this.mode === 'lane') { const t = clamp(this.s / S.len, 0, 1); return [lerp(S.sx, S.ex, t), lerp(S.sz, S.ez, t), Math.atan2(S.dx, S.dz)]; }
    const T = this.turn, t = clamp(this.s / T.len, 0, 1), u = 1 - t;
    const x = u * u * T.p0x + 2 * u * t * T.p1x + t * t * T.p2x, z = u * u * T.p0z + 2 * u * t * T.p1z + t * t * T.p2z;
    const dx = 2 * u * (T.p1x - T.p0x) + 2 * t * (T.p2x - T.p1x), dz = 2 * u * (T.p1z - T.p0z) + 2 * t * (T.p2z - T.p1z);
    return [x, z, Math.atan2(dx, dz)];
  }
  planTurn() {
    const S = this.seg, a = S.a, b = S.b;
    const opts = nodeNeighbors(b[0], b[1]).filter((n) => !(n[0] === a[0] && n[1] === a[1]));
    const straight = opts.find((n) => Math.sign(n[0] - b[0]) === S.dx && Math.sign(n[1] - b[1]) === S.dz);
    const next = (straight && Math.random() < 0.5) ? straight : rpick(opts);
    const N = laneSeg(b, next);
    const p0x = S.ex, p0z = S.ez, p2x = N.sx, p2z = N.sz;
    let p1x, p1z, speed;
    if (N.dx === S.dx && N.dz === S.dz) { p1x = (p0x + p2x) / 2; p1z = (p0z + p2z) / 2; speed = this.cruise; }
    else { if (S.dx !== 0) { p1x = p2x; p1z = p0z; } else { p1x = p0x; p1z = p2z; } speed = 7; }
    const len = (Math.hypot(p1x - p0x, p1z - p0z) + Math.hypot(p2x - p1x, p2z - p1z) + Math.hypot(p2x - p0x, p2z - p0z)) / 2;
    this.turn = { p0x, p0z, p1x, p1z, p2x, p2z, len, speed, next: N };
  }
  update(dt) {
    const c = this.car;
    if (!this.turn) this.planTurn();
    let target = this.mode === 'turn' ? this.turn.speed : this.cruise;
    const fx = Math.sin(c.h), fz = Math.cos(c.h), rx = -fz, rz = fx;
    let gap = 99;
    for (let k = 0; k < cars.length; k++) {
      const o = cars[k]; if (o === c) continue;
      const dx = o.x - c.x, dz = o.z - c.z; if (dx > 26 || dx < -26 || dz > 26 || dz < -26) continue;
      const al = dx * fx + dz * fz; if (al <= 0 || al > 22) continue;
      const lat = dx * rx + dz * rz; if (Math.abs(lat) > 2.5) continue;
      const g = al - (c.T.L + o.T.L) * 0.5; if (g < gap) gap = g;
    }
    if (player.mode === 'foot' && !player.dead) {
      const dx = player.x - c.x, dz = player.z - c.z, al = dx * fx + dz * fz, lat = dx * rx + dz * rz;
      if (al > 0 && al < 18 && Math.abs(lat) < 2.2) gap = Math.min(gap, al - c.T.L * 0.5 - 0.6);
    }
    if (gap < 99) target = Math.min(target, Math.max(0, (gap - 2.0) * 1.5));
    if (this.mode === 'lane') {
      const remain = this.seg.len - this.s;
      if (remain < 16) {
        const key = nkey(this.seg.b), holder = nodeRes.get(key);
        if (holder && holder !== this && !holder.car.dead && holder.car.ai === holder && (holder.inDx !== this.seg.dx || holder.inDz !== this.seg.dz)) {
          target = Math.min(target, Math.max(0, (remain - 0.8) * 1.3));
        } else if (remain < 7) { nodeRes.set(key, this); this.resKey = key; this.inDx = this.seg.dx; this.inDz = this.seg.dz; }
        target = Math.min(target, this.turn.speed + remain * 0.55);
      }
    }
    this.prevV = this.v;
    this.v = this.v < target ? Math.min(target, this.v + 4.2 * dt) : Math.max(target, this.v - 12 * dt);
    this.s += this.v * dt;
    if (this.mode === 'lane' && this.s >= this.seg.len) { this.s -= this.seg.len; this.mode = 'turn'; }
    if (this.mode === 'turn' && this.s >= this.turn.len) { this.s -= this.turn.len; this.mode = 'lane'; this.seg = this.turn.next; this.turn = null; this.freeNode(); }
    this.apply(dt);
  }
  apply(dt) {
    const c = this.car, smp = this.sample(), x = smp[0], z = smp[1], h = smp[2];
    const dh = wrapA(h - c.h);
    c.x = x; c.z = z; c.h = h; c.y = groundH(x, z);
    c.vf = this.v; c.vx = Math.sin(h) * this.v; c.vz = Math.cos(h) * this.v;
    c.yawRate = dt > 0 ? -dh / dt : 0;
    c.accS = c.yawRate * this.v;
    c.accF = dt > 0 ? damp(c.accF, (this.v - this.prevV) / dt, 6, dt) : 0;
    c.steer = clamp(Math.atan(c.yawRate * c.T.L * 0.62 / Math.max(this.v, 1)), -0.6, 0.6);
    c.wheelRot += this.v / c.T.wr * dt;
    c.braking = this.v < this.prevV - 0.02 || this.v < 0.3;
  }
}
function spawnTraffic(px, pz, force) {
  for (let tries = 0; tries < 14; tries++) {
    const i = Math.floor(Math.random() * NODES), j = Math.floor(Math.random() * NODES);
    const b = rpick(nodeNeighbors(i, j)), seg = laneSeg([i, j], b);
    const s = rr(4, seg.len - 4), t = s / seg.len;
    const x = lerp(seg.sx, seg.ex, t), z = lerp(seg.sz, seg.ez, t);
    const d = Math.hypot(x - px, z - pz);
    if (d < (force ? 28 : 80) || d > 200) continue;
    if (!force && d < 150 && inView(x, z)) continue;
    let clear = true;
    for (const c of cars) if (Math.abs(c.x - x) < 10 && Math.abs(c.z - z) < 10) { clear = false; break; }
    if (!clear) continue;
    const car = new Car(rpick(['sedan', 'sedan', 'coupe', 'suv', 'muscle', 'taxi', 'sedan', 'suv', 'coupe']));
    car.place(x, z, Math.atan2(seg.dx, seg.dz));
    new TrafficAI(car, [i, j], b, s);
    return car;
  }
  return null;
}
function updateTraffic(dt) {
  const px = player.x, pz = player.z;
  let n = 0;
  for (let i = cars.length - 1; i >= 0; i--) {
    const c = cars[i];
    if (c === player.car || c.mission || c.persistent || c.driver === 'police') continue;
    const d = Math.hypot(c.x - px, c.z - pz);
    if ((d > 230 || (d > 140 && c.exploded)) && !inView(c.x, c.z)) { c.remove(); continue; }
    if (c.ai) { n++; c.ai.update(dt); }
  }
  if (n < Q.traffic) spawnTraffic(px, pz, false);
}

// ---------- pedestrians ----------
const peds = [];
let pedBlobGeo = null;
function rectPoint(r, p) {
  const w = r.x1 - r.x0, d = r.z1 - r.z0, per = 2 * (w + d);
  p = ((p % per) + per) % per;
  if (p < w) return [r.x0 + p, r.z0, 1, 0];
  p -= w; if (p < d) return [r.x1, r.z0 + p, 0, 1];
  p -= d; if (p < w) return [r.x1 - p, r.z1, -1, 0];
  p -= w; return [r.x0, r.z1 - p, 0, -1];
}
function rectProject(r, x, z) {
  const w = r.x1 - r.x0, d = r.z1 - r.z0;
  const cx = clamp(x, r.x0, r.x1), cz = clamp(z, r.z0, r.z1);
  const dl = cx - r.x0, dr = r.x1 - cx, db = cz - r.z0, dt = r.z1 - cz, m = Math.min(dl, dr, db, dt);
  if (m === db) return cx - r.x0;
  if (m === dr) return w + (cz - r.z0);
  if (m === dt) return w + d + (r.x1 - cx);
  return 2 * w + d + (r.z1 - cz);
}
class Ped {
  constructor(look, x, z) {
    look = look || randomLook();
    this.H = buildHuman(look);
    this.root = this.H.root; this.root.rotation.order = 'YXZ';
    this.blob = new THREE.Mesh(blobGeo, blobMat); this.blob.scale.set(1.1, 1, 1.1); this.blob.renderOrder = 1;
    this.x = x; this.z = z; this.y = groundH(x, z); this.h = Math.random() * TAU;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.state = 'walk'; this.anim = { speed: 0, punch: 0, punchSide: 1, air: false, vy: 0, t: Math.random() * 10, hands: false, phone: !!look.phone, mode: 'normal', getT: 0, turn: 0, flinch: 0 };
    this.idleT = Math.random() < 0.3 ? rr(1, 4) : 0; this.getT = 0; this._ph = undefined;
    this.health = 60; this.t = 0; this.fleeT = 0; this.downT = 0; this.tumble = 0; this.removeT = 30; this.thinkT = Math.random() * 0.3;
    this.rect = null; this.p = 0; this.dir = 1; this.spd = 1.3; this.cop = false;
    scene.add(this.root); scene.add(this.blob);
    peds.push(this);
  }
  get alive() { return this.state !== 'dead' && this.state !== 'fly' && this.state !== 'down' && this.state !== 'getup'; }
  remove() { scene.remove(this.root); scene.remove(this.blob); this.H.dispose(); const i = peds.indexOf(this); if (i >= 0) peds.splice(i, 1); this.removed = true; }
  flee(fromX, fromZ, t) {
    if (this.state === 'dead' || this.state === 'fly' || this.state === 'down' || this.state === 'getup') return;
    const dx = this.x - fromX, dz = this.z - fromZ, d = Math.hypot(dx, dz) || 1;
    this.fx = dx / d; this.fz = dz / d; this.state = 'flee'; this.fleeT = t || rr(4, 7); this.anim.phone = false; this.idleT = 0;
  }
  knock(vx, vz, sp, attacker) {
    if (this.state === 'dead' && this.y > groundH(this.x, this.z) + 0.3) return;
    const wasAlive = this.state !== 'dead';
    this.state = 'fly'; this.vx = vx; this.vz = vz; this.vy = 1.8 + sp * 0.22; this.tumble = 0;
    this.health -= 10 + sp * 7;
    if (wasAlive && this.health <= 0) this.killedBy = attacker;
    AUD.thud(Math.min(1, sp / 12));
  }
  update(dt) {
    const a = this.anim; a.t += dt;
    switch (this.state) {
      case 'walk': {
        if (this.idleT > 0) { this.idleT -= dt; a.speed = damp(a.speed, 0, 6, dt); }
        else {
          this.p += this.dir * this.spd * dt;
          const r = rectPoint(this.rect, this.p);
          this.x = r[0]; this.z = r[1];
          this.h = dampA(this.h, Math.atan2(r[2] * this.dir, r[3] * this.dir), 7, dt);
          a.speed = damp(a.speed, this.spd, 6, dt);
          if (Math.random() < dt * 0.025) this.idleT = rr(2, 7);
        }
        this.thinkT -= dt;
        if (this.thinkT <= 0) { this.thinkT = 0.25; this.react(); }
        break;
      }
      case 'flee': case 'return': {
        let tx, tz, sp;
        if (this.state === 'flee') { tx = this.fx; tz = this.fz; sp = 5.6; this.fleeT -= dt; if (this.fleeT <= 0 && this.rect) { this.state = 'return'; this.p = rectProject(this.rect, this.x, this.z); } }
        else { const r = rectPoint(this.rect, this.p); const dx = r[0] - this.x, dz = r[1] - this.z, d = Math.hypot(dx, dz); if (d < 0.5) { this.state = 'walk'; break; } tx = dx / d; tz = dz / d; sp = 1.7; }
        this.vx = damp(this.vx, tx * sp, 6, dt); this.vz = damp(this.vz, tz * sp, 6, dt);
        this.x += this.vx * dt; this.z += this.vz * dt;
        const hit = collideCircle(this.x, this.z, 0.3);
        if (hit.hit && this.state === 'flee') { this.fx = this.fx * 0.3 + hit.nx; this.fz = this.fz * 0.3 + hit.nz; const l = Math.hypot(this.fx, this.fz) || 1; this.fx /= l; this.fz /= l; }
        this.x = hit.x; this.z = hit.z;
        const s = Math.hypot(this.vx, this.vz);
        if (s > 0.2) this.h = dampA(this.h, Math.atan2(this.vx, this.vz), 10, dt);
        a.speed = s;
        if (!this.rect && this.state === 'flee' && this.fleeT <= 0) this.fleeT = 3;
        break;
      }
      case 'fly': {
        this.vy -= 18 * dt; this.x += this.vx * dt; this.z += this.vz * dt; this.y += this.vy * dt;
        const hit = collideCircle(this.x, this.z, 0.3, this.y);
        if (hit.hit) { this.vx *= -0.3; this.vz *= -0.3; }
        this.x = hit.x; this.z = hit.z;
        this.tumble = Math.min(Math.PI / 2, this.tumble + dt * 6);
        const g = groundH(this.x, this.z);
        if (this.y <= g && this.vy < 0) {
          this.y = g; this.tumble = Math.PI / 2;
          if (Math.abs(this.vy) > 4) { this.vy = -this.vy * 0.25; } else { this.vy = 0; this.vx *= 0.5; this.vz *= 0.5; this.state = this.health <= 0 ? 'dead' : 'down'; this.downT = rr(2.5, 4); if (this.state === 'dead' && this.onDeath) this.onDeath(this); }
        }
        break;
      }
      case 'down': {
        this.downT -= dt;
        this.vx = damp(this.vx, 0, 4, dt); this.vz = damp(this.vz, 0, 4, dt); this.x += this.vx * dt; this.z += this.vz * dt;
        if (this.downT <= 0) { this.state = 'getup'; this.getT = 0; }
        break;
      }
      case 'getup': {
        this.getT += dt;
        this.tumble = Math.PI / 2 * (1 - sstep(0, 0.4, this.getT));
        a.speed = 0;
        if (this.getT >= 1.05) { this.tumble = 0; this.state = 'flee'; this.fleeT = rr(4, 7); if (!this.fx) { this.fx = 1; this.fz = 0; } }
        break;
      }
      case 'dead': {
        this.removeT -= dt;
        this.vx = damp(this.vx, 0, 4, dt); this.vz = damp(this.vz, 0, 4, dt); this.x += this.vx * dt; this.z += this.vz * dt;
        break;
      }
      default: break;
    }
    if (this.state !== 'fly') this.y = damp(this.y, groundH(this.x, this.z), 12, dt);
    this.sync(dt);
  }
  react() {
    if (player.dead) return;
    const pc = player.car;
    if (pc && player.mode === 'car') {
      const dx = this.x - pc.x, dz = this.z - pc.z, d = Math.hypot(dx, dz), sp = pc.speed;
      if (d < 9 && sp > 9) { const ap = (dx * pc.vx + dz * pc.vz) / (d * sp); if (ap > 0.4) this.flee(pc.x, pc.z, rr(2, 4)); }
    }
    if (wanted.stars >= 2 && Math.hypot(this.x - player.x, this.z - player.z) < 14 && Math.random() < 0.3) this.flee(player.x, player.z);
  }
  sync(dt) {
    const lying = this.state === 'down' || this.state === 'dead' || this.state === 'fly';
    const a = this.anim;
    a.mode = lying ? 'down' : this.state === 'getup' ? 'getup' : 'normal';
    a.getT = this.getT;
    a.turn = this._ph === undefined || !(dt > 0) ? 0 : wrapA(this.h - this._ph) / dt; this._ph = this.h;
    animHuman(this.H, a, dt || 0.016);
    this.root.position.set(this.x, this.y + Math.sin(this.tumble) * 0.13, this.z);
    this.root.rotation.set(-this.tumble, this.h, 0);
    this.blob.position.set(this.x, groundH(this.x, this.z) + 0.03, this.z);
  }
}
function spawnPed(px, pz, force) {
  for (let tries = 0; tries < 12; tries++) {
    const b = blocks[Math.floor(Math.random() * blocks.length)];
    if (Math.abs(b.cx - px) > 160 || Math.abs(b.cz - pz) > 160) continue;
    const inset = Math.random() < 0.5 ? rr(1.5, 2.0) : rr(3.4, 4.6);
    const rect = { x0: b.x0 + inset, x1: b.x1 - inset, z0: b.z0 + inset, z1: b.z1 - inset };
    const per = 2 * ((rect.x1 - rect.x0) + (rect.z1 - rect.z0)), p = Math.random() * per;
    const pt = rectPoint(rect, p);
    const d = Math.hypot(pt[0] - px, pt[1] - pz);
    if (d < (force ? 14 : 45) || d > 150) continue;
    if (!force && d < 100 && inView(pt[0], pt[1])) continue;
    const ped = new Ped(randomLook(), pt[0], pt[1]);
    ped.rect = rect; ped.p = p; ped.dir = Math.random() < 0.5 ? 1 : -1; ped.spd = rr(1.1, 1.6);
    return ped;
  }
  return null;
}
function updatePeds(dt) {
  const px = player.x, pz = player.z;
  let n = 0;
  for (let i = peds.length - 1; i >= 0; i--) {
    const p = peds[i];
    const d = Math.hypot(p.x - px, p.z - pz);
    if (d > 175 || (p.state === 'dead' && p.removeT <= 0 && !inView(p.x, p.z))) { p.remove(); continue; }
    if (p.state !== 'dead') n++;
    if (d > 110 && p.state === 'walk') { p.p += p.dir * p.spd * dt; p.root.visible = false; continue; }
    p.update(dt);
    p.root.visible = d < 120;
  }
  // cars hitting pedestrians
  for (const c of cars) {
    const sp = c.speed; if (sp < 3) continue;
    const r = carCircles(c, CA) + 0.3;
    for (const p of peds) {
      if (p.state === 'fly') continue;
      if (Math.abs(p.x - c.x) > 4 || Math.abs(p.z - c.z) > 4) continue;
      for (let k = 0; k < 3; k++) {
        const dx = p.x - CA[k * 2], dz = p.z - CA[k * 2 + 1];
        if (dx * dx + dz * dz < r * r) {
          const wasDead = p.state === 'dead';
          p.knock(c.vx * 0.8 + dx * 2, c.vz * 0.8 + dz * 2, sp, c);
          if (!wasDead && GAMEHOOK.pedHit) GAMEHOOK.pedHit(p, c, sp);
          if (c === player.car) shakeCam(0.25);
          break;
        }
      }
    }
  }
  if (n < Q.peds) spawnPed(px, pz, false);
}

// ---------- police & wanted ----------
const police = [];
const wanted = { heat: 0, stars: 0, unseen: 0, flash: false, bustT: 0 };
function bfsPath(a, b) {
  if (a[0] === b[0] && a[1] === b[1]) return [b];
  const prev = new Map(); const q = [a]; prev.set(nkey(a), null);
  while (q.length) {
    const n = q.shift(); if (n[0] === b[0] && n[1] === b[1]) break;
    for (const m of nodeNeighbors(n[0], n[1])) { const k = nkey(m); if (!prev.has(k)) { prev.set(k, n); q.push(m); } }
  }
  const path = []; let cur = b;
  while (cur && !(cur[0] === a[0] && cur[1] === a[1])) { path.unshift(cur); cur = prev.get(nkey(cur)); }
  return path;
}
class PoliceAI {
  constructor(car) {
    this.car = car; car.driver = 'police'; car.ai = this;
    this.path = []; this.repath = 0; this.stuckT = 0; this.revT = 0; this.mode = 'chase'; this.flash = Math.random() * 10;
  }
  release() { }
  update(dt) {
    const c = this.car;
    this.flash += dt;
    if (c.wrecked || this.mode === 'leave' || player.dead) { c.physics({ throttle: 0, brake: 1, steer: 0, hand: false }, dt); return; }
    const tx = player.x, tz = player.z, tvx = player.mode === 'car' ? player.car.vx : 0, tvz = player.mode === 'car' ? player.car.vz : 0;
    const dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz);
    const los = d < 95 && losClear(c.x, c.z, tx, tz);
    this.seen = los && d < 80;
    let ax, az;
    if (los) { const lead = clamp(d / 28, 0, 1.1); ax = tx + tvx * lead; az = tz + tvz * lead; this.path.length = 0; }
    else {
      this.repath -= dt;
      if (this.repath <= 0 || !this.path.length) { this.repath = 1.2; this.path = bfsPath(nearestNode(c.x, c.z), nearestNode(tx, tz)); }
      while (this.path.length > 1 && Math.hypot(roadC(this.path[0][0]) - c.x, roadC(this.path[0][1]) - c.z) < 11) this.path.shift();
      if (this.path.length) { ax = roadC(this.path[0][0]); az = roadC(this.path[0][1]); } else { ax = tx; az = tz; }
    }
    const want = Math.atan2(ax - c.x, az - c.z);
    const diff = wrapA(want - c.h);
    let steer = clamp(-diff * 2.4, -1, 1), thr = 1, brk = 0, hand = false;
    const sp = c.vf;
    if (Math.abs(diff) > 1.2 && sp > 15) { thr = 0.2; brk = 0.7; }
    if (Math.abs(diff) > 1.5 && sp > 9) hand = true;
    const tsp = Math.hypot(tvx, tvz);
    if (los && d < 14 + Math.max(0, sp) * 1.1 && (player.mode === 'foot' || tsp < 3)) { thr = d > 9 ? 0.3 : 0; brk = sp > (d > 9 ? 6 : 1.5) ? 1 : 0; }
    if (this.revT > 0) { this.revT -= dt; thr = 0; brk = 1; steer = -steer; }
    else if (thr > 0.5 && Math.abs(sp) < 1.5) { this.stuckT += dt; if (this.stuckT > 1.1) { this.revT = 1.2; this.stuckT = 0; } }
    else this.stuckT = Math.max(0, this.stuckT - dt);
    c.physics({ throttle: thr, brake: brk, steer, hand, nitro: wanted.stars >= 3 && d > 55 && Math.abs(diff) < 0.3 }, dt);
  }
}
function spawnPolice() {
  for (let tries = 0; tries < 12; tries++) {
    const i = Math.floor(Math.random() * NODES), j = Math.floor(Math.random() * NODES);
    const x = roadC(i), z = roadC(j), d = Math.hypot(x - player.x, z - player.z);
    if (d < 80 || d > 175) continue;
    if (d < 130 && inView(x, z)) continue;
    let clear = true;
    for (const c of cars) if (Math.abs(c.x - x) < 9 && Math.abs(c.z - z) < 9) { clear = false; break; }
    if (!clear) continue;
    const car = new Car('police');
    car.place(x, z, Math.atan2(player.x - x, player.z - z));
    police.push(new PoliceAI(car));
    return true;
  }
  return false;
}
function addCrime(amount, why) {
  if (GAME.state !== 'play' || player.dead) return;
  const prev = wanted.stars;
  wanted.heat = Math.min(5.99, wanted.heat + amount);
  wanted.stars = Math.floor(wanted.heat);
  if (wanted.stars > prev) { wanted.unseen = 0; HUD.toast(why || 'Полиция ищет тебя', 'warn'); AUD.alarm(); }
}
function setWanted(n) { if (wanted.stars < n) { wanted.heat = n + 0.05; wanted.stars = n; wanted.unseen = 0; AUD.alarm(); } }
function clearWanted() {
  wanted.heat = 0; wanted.stars = 0; wanted.unseen = 0; wanted.bustT = 0;
  for (const p of police) p.mode = 'leave';
}
function updateWanted(dt) {
  if (wanted.stars > 0 && !player.dead) {
    const need = [0, 2, 3, 4, 6, 7][wanted.stars];
    let active = 0, seen = false, near = false;
    for (const p of police) {
      if (p.mode === 'leave' || p.car.wrecked) continue;
      active++;
      const d = Math.hypot(p.car.x - player.x, p.car.z - player.z);
      if (p.seen || d < 26) seen = true;
      if (d < 7.5 && p.car.speed < 4) near = true;
    }
    if (active < need) spawnPolice();
    if (seen) wanted.unseen = 0; else wanted.unseen += dt;
    wanted.flash = wanted.unseen > 1.5;
    const limit = 7 + wanted.stars * 3;
    if (wanted.unseen > limit) { clearWanted(); HUD.toast('Ты оторвался от полиции'); AUD.chime(); }
    const slow = player.mode === 'foot' || (player.car && player.car.speed < 2);
    if (near && slow) wanted.bustT += dt; else wanted.bustT = Math.max(0, wanted.bustT - dt * 2);
    if (wanted.bustT > (player.mode === 'foot' ? 2.2 : 3.4)) { wanted.bustT = 0; bustPlayer(); }
  } else wanted.flash = false;
  for (const p of police) if (p.car !== player.car) p.update(dt);
  for (let i = police.length - 1; i >= 0; i--) {
    const p = police[i], c = p.car, d = Math.hypot(c.x - player.x, c.z - player.z);
    if (c === player.car) { police.splice(i, 1); c.driver = 'player'; c.ai = null; continue; }
    if (c.dead || d > 330 || ((p.mode === 'leave' || c.wrecked) && d > 110 && !inView(c.x, c.z))) { if (!c.dead) c.remove(); police.splice(i, 1); }
  }
}
