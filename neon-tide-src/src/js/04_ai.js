// ============================================================
//  Traffic, pedestrians, police pursuit and the wanted level
//  - Traffic obeys signals (SIG in 02_city.js), queues at red, yields to pedestrians, taxis and buses
//    pull over at the curb, drivers panic or abandon the car when shots are fired nearby.
//  - Pedestrians walk the blocks and cross at crosswalks on the walk phase, sit on benches, chat in
//    groups, jog on the promenade, take photos on the pier, wait at bus stops, queue at the club; they
//    dodge speeding cars, flee / cower / duck at gunfire and explosions, and some fight back.
//  - Police cars chase with lead, PIT manoeuvres, cut-offs at intersections and search the last seen
//    position. Officers on foot, roadblocks, the helicopter and witnesses live in 04b_police.js.
// ============================================================
const _pv = new V3();
function inView(x, z, y) {
  _pv.set(x, y === undefined ? 1.5 : y, z).project(camera);
  return Math.abs(_pv.x) < 1.15 && Math.abs(_pv.y) < 1.15 && _pv.z < 1;
}
const nkey = (n) => n[0] * 16 + n[1];
const nodeRes = new Map();
const _aiSmp = { x: 0, z: 0, h: 0 };

// ---------- traffic ----------
class TrafficAI {
  constructor(car, a, b, s) {
    this.car = car; this.seg = laneSeg(a, b); this.mode = 'lane'; this.s = s;
    this.bus = car.type === 'bus';
    this.cruise = this.bus ? rr(9, 11) : rr(11, 15.5); this.v = this.cruise * 0.7; this.turn = null; this.prevV = this.v;
    this.resKey = undefined;
    this.off = 0; this.offV = 0; this.stopS = -1; this.stop = null; this.dwell = 0; this.pullOff = this.bus ? 2.6 : 2.2;
    this.panicT = 0; this.haltT = 0; this.blockT = 0; this.honkT = rr(2, 4);
    car.kinematic = true; car.driver = 'ai'; car.ai = this;
    this.planStop();
    this.apply(0);
  }
  release() { this.freeNode(); }
  freeNode() { if (this.resKey !== undefined && nodeRes.get(this.resKey) === this) nodeRes.delete(this.resKey); this.resKey = undefined; }
  // taxis drop passengers at random spots, buses stop at the bus stops of their segment
  planStop() {
    this.stopS = -1; this.stop = null; this.dwell = 0;
    if (!SPOT.busStopBySeg) return;
    const key = citySegKey(this.seg.a, this.seg.b);
    if (this.bus) { const st = SPOT.busStopBySeg.get(key); if (st && st.s > this.s + 12) { this.stopS = st.s; this.stop = st; } }
    else if (this.car.type === 'taxi' && Math.random() < 0.25 && !SPOT.curbSegs.has(key) && !SPOT.busStopBySeg.has(key)) {
      const s = rr(18, this.seg.len - 18); if (s > this.s + 14) this.stopS = s;
    }
  }
  sample() {
    const S = this.seg;
    if (this.mode === 'lane') {
      const t = clamp(this.s / S.len, 0, 1), hv = Math.max(this.v, 0.6);
      _aiSmp.x = lerp(S.sx, S.ex, t) + S.rx * this.off; _aiSmp.z = lerp(S.sz, S.ez, t) + S.rz * this.off;
      _aiSmp.h = Math.atan2(S.dx * hv + S.rx * this.offV, S.dz * hv + S.rz * this.offV);
      return _aiSmp;
    }
    const T = this.turn, t = clamp(this.s / T.len, 0, 1), u = 1 - t;
    _aiSmp.x = u * u * T.p0x + 2 * u * t * T.p1x + t * t * T.p2x; _aiSmp.z = u * u * T.p0z + 2 * u * t * T.p1z + t * t * T.p2z;
    _aiSmp.h = Math.atan2(2 * u * (T.p1x - T.p0x) + 2 * t * (T.p2x - T.p1x), 2 * u * (T.p1z - T.p0z) + 2 * t * (T.p2z - T.p1z));
    return _aiSmp;
  }
  planTurn() {
    const S = this.seg, a = S.a, b = S.b;
    const opts = nodeNeighbors(b[0], b[1]).filter((n) => !(n[0] === a[0] && n[1] === a[1]));
    const straight = opts.find((n) => Math.sign(n[0] - b[0]) === S.dx && Math.sign(n[1] - b[1]) === S.dz);
    const next = (straight && Math.random() < (this.bus ? 0.7 : 0.5)) ? straight : rpick(opts);
    const N = laneSeg(b, next);
    const p0x = S.ex, p0z = S.ez, p2x = N.sx, p2z = N.sz;
    let p1x, p1z, speed;
    if (N.dx === S.dx && N.dz === S.dz) { p1x = (p0x + p2x) / 2; p1z = (p0z + p2z) / 2; speed = this.cruise; }
    else { if (S.dx !== 0) { p1x = p2x; p1z = p0z; } else { p1x = p0x; p1z = p2z; } speed = this.bus ? 5 : 7; }
    const len = (Math.hypot(p1x - p0x, p1z - p0z) + Math.hypot(p2x - p1x, p2z - p1z) + Math.hypot(p2x - p0x, p2z - p0z)) / 2;
    this.turn = { p0x, p0z, p1x, p1z, p2x, p2z, len, speed, next: N };
  }
  update(dt) {
    const c = this.car;
    if (!this.turn) this.planTurn();
    const panic = this.panicT > 0;
    if (panic) this.panicT -= dt;
    let target = this.mode === 'turn' ? this.turn.speed : this.cruise;
    if (panic) target = this.mode === 'turn' ? 12 : 23;
    if (this.haltT > 0) { this.haltT -= dt; target = 0; if (this.haltT <= 0) this.panicT = rr(6, 10); }
    // obstacles ahead: cars (pulled-over and curb-parked cars sit outside the lane), pedestrians, the player
    const fx = Math.sin(c.h), fz = Math.cos(c.h), rx = -fz, rz = fx, half = c.T.L * 0.5;
    let gap = 99, blocker = null;
    for (let k = 0; k < cars.length; k++) {
      const o = cars[k]; if (o === c) continue;
      const dx = o.x - c.x, dz = o.z - c.z; if (dx > 30 || dx < -30 || dz > 30 || dz < -30) continue;
      const al = dx * fx + dz * fz; if (al <= 0 || al > 26) continue;
      const lat = dx * rx + dz * rz; if (Math.abs(lat) > (this.off > 1.2 ? 1.3 : 2.05)) continue;
      const g = al - (half + o.T.L * 0.5); if (g < gap) { gap = g; blocker = o; }
    }
    for (let k = 0; k < peds.length; k++) {
      const p = peds[k]; if (p.state === 'dead') continue;
      const dx = p.x - c.x, dz = p.z - c.z; if (dx > 18 || dx < -18 || dz > 18 || dz < -18) continue;
      const al = dx * fx + dz * fz; if (al <= 0 || al > 16) continue;
      const lat = dx * rx + dz * rz; if (Math.abs(lat) > 1.7) continue;
      const g = al - half - 1.2; if (g < gap) { gap = g; blocker = null; }
    }
    if (player.mode === 'foot' && !player.dead) {
      const dx = player.x - c.x, dz = player.z - c.z, al = dx * fx + dz * fz, lat = dx * rx + dz * rz;
      if (al > 0 && al < 18 && Math.abs(lat) < 2.2) { const g = al - half - 0.6; if (g < gap) { gap = g; blocker = null; } }
    }
    // constant-deceleration approach: comes to a full stop in finite time
    if (gap < 99) target = Math.min(target, Math.sqrt(Math.max(0, 2 * 4.5 * (gap - (panic ? 1.4 : 2.3)))));
    // honk at the player's car blocking the lane
    if (blocker && blocker === player.car && gap < 4 && this.v < 0.5) { this.blockT += dt; if (this.blockT > 2.5) { this.honkT -= dt; if (this.honkT <= 0) { this.honkT = rr(1.5, 3.5); aiHonkAt(c); } } }
    else this.blockT = 0;
    if (this.mode === 'lane') {
      const remain = this.seg.len - this.s, b = this.seg.b;
      let st = 0;
      if (!panic) {
        st = tsigState(b[0], b[1], this.seg.dx !== 0 ? 0 : 1);
        const rs = remain - 2.6 - half; // bumper to the stop line
        if (st === 2 && rs > -1.2) target = Math.min(target, Math.sqrt(Math.max(0, 2 * 3.5 * (rs - 0.3))));
        else if (st === 1 && rs > 0.5 && rs > this.v * this.v / 14 + 1) target = Math.min(target, Math.sqrt(Math.max(0, 2 * 3.5 * (rs - 0.3))));
      }
      if (remain < 16 && !panic && st === 0) {
        const key = nkey(b), holder = nodeRes.get(key);
        if (holder && holder !== this && !holder.car.dead && holder.car.ai === holder && (holder.inDx !== this.seg.dx || holder.inDz !== this.seg.dz)) {
          target = Math.min(target, Math.max(0, (remain - 0.8 - half + 2.3) * 1.3));
        } else if (remain < 7) { nodeRes.set(key, this); this.resKey = key; this.inDx = this.seg.dx; this.inDz = this.seg.dz; }
      }
      if (remain < 16) target = Math.min(target, this.turn.speed + remain * 0.55 + (panic ? 6 : 0));
      // curb stop
      if (this.stopS >= 0) {
        const ds = this.stopS - this.s;
        if (this.dwell > 0) {
          target = 0; this.dwell -= dt;
          if (this.dwell <= 0) { this.stopS = -1; this.stop = null; }
        } else if (ds < 32) {
          target = Math.min(target, Math.max(0, ds * 0.75));
          if (ds < 1.0 && this.v < 0.5 && this.off > this.pullOff - 0.25) { this.dwell = this.bus ? rr(5, 8) : rr(3.5, 6); this.onStop(); }
        }
        if (panic) { this.stopS = -1; this.stop = null; this.dwell = 0; }
      }
    }
    this.prevV = this.v;
    this.v = this.v < target ? Math.min(target, this.v + (panic ? 7 : 4.2) * dt) : Math.max(target, this.v - 12 * dt);
    // lateral offset toward the curb
    const remain = this.mode === 'lane' ? this.seg.len - this.s : 0;
    const offT = this.mode === 'lane' && this.stopS >= 0 && this.stopS - this.s < 32 && remain > 10 ? this.pullOff : 0;
    this.offV = clamp((offT - this.off) * 1.1, -1.3, 1.3);
    this.off = this.mode === 'lane' ? clamp(this.off + this.offV * dt, 0, this.pullOff) : 0;
    this.s += this.v * dt;
    if (this.mode === 'lane' && this.s >= this.seg.len) { this.s -= this.seg.len; this.mode = 'turn'; this.off = 0; this.offV = 0; }
    if (this.mode === 'turn' && this.s >= this.turn.len) { this.s -= this.turn.len; this.mode = 'lane'; this.seg = this.turn.next; this.turn = null; this.freeNode(); this.planStop(); }
    this.apply(dt);
  }
  onStop() {
    const c = this.car, S = this.seg;
    const cx = c.x + S.rx * 2.6, cz = c.z + S.rz * 2.6;
    if (this.bus) {
      if (this.stop) for (const p of this.stop.waiting.slice()) if (!p.removed && p.act && p.act.kind === 'wait') p.board(c);
      const n = Math.random() < 0.7 ? 1 + (Math.random() < 0.45 ? 1 : 0) : 0;
      for (let k = 0; k < n; k++) pedSpawnAlight(cx + S.dx * (k - 0.5) * 1.4, cz + S.dz * (k - 0.5) * 1.4);
    } else if (Math.random() < 0.65) pedSpawnAlight(cx, cz);
  }
  apply(dt) {
    const c = this.car, smp = this.sample(), x = smp.x, z = smp.z, h = smp.h;
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
function aiHonkAt(c) {
  if (GAME.state !== 'play') return;
  const d = Math.hypot(c.x - player.x, c.z - player.z); if (d > 60) return;
  const v = clamp(1 - d / 60, 0, 1) * 0.05;
  AUD.tone(370, 0.32, 'square', v); AUD.tone(466, 0.32, 'square', v * 0.8);
}
// Drivers near gunfire / explosions: floor it, freeze, or abandon the car and run.
function trafficScare(x, z, r) {
  for (let i = cars.length - 1; i >= 0; i--) {
    const c = cars[i], ai = c.ai;
    if (!(ai instanceof TrafficAI) || c === player.car) continue;
    const d = Math.hypot(c.x - x, c.z - z); if (d > r) continue;
    if (ai.panicT > 0 || ai.haltT > 0) continue;
    const q = Math.random();
    if (q < 0.5 || ai.v > 8 || ai.bus) ai.panicT = rr(7, 11);
    else if (q < 0.82 && d < r * 0.8) abandonCar(c, x, z);
    else ai.haltT = rr(1.5, 3);
  }
}
// Driverless cars (curb-parked, abandoned): simulated only while moving, held by the handbrake.
class ParkedAI {
  constructor(car) { this.car = car; car.ai = this; car.kinematic = false; car.driver = null; }
  release() { }
  update(dt) { const c = this.car; if (c.speed > 0.05 || c.y > groundH(c.x, c.z) + 0.05) c.physics({ throttle: 0, brake: c.vf > 0.6 ? 1 : 0, steer: 0, hand: true }, dt); else { c.vx = c.vz = 0; c.braking = false; } }
}
function abandonCar(c, fx, fz) {
  if (c.ai) { c.ai.release(); c.ai = null; }
  c.kinematic = false; c.driver = null; c.abandoned = true; c.braking = true;
  new ParkedAI(c);
  const sx = Math.cos(c.h), sz = -Math.sin(c.h);
  const p = new Ped(randomLook(), c.x + sx * 1.6, c.z + sz * 1.6);
  p.h = c.h; p.flee(fx, fz, rr(6, 10));
  p.screamT = 0;
  return p;
}
const BUS_COLORS = ['#16a3a6', '#e8a33c', '#d8343f'];
function spawnTraffic(px, pz, force) {
  for (let tries = 0; tries < 14; tries++) {
    const i = Math.floor(Math.random() * NODES), j = Math.floor(Math.random() * NODES);
    const b = rpick(nodeNeighbors(i, j)), seg = laneSeg([i, j], b);
    const s = rr(4, seg.len - 4), t = s / seg.len;
    const x = lerp(seg.sx, seg.ex, t), z = lerp(seg.sz, seg.ez, t);
    const d = Math.hypot(x - px, z - pz);
    if (d < (force ? 28 : 80) || d > 200) continue;
    if (!force && d < 150 && inView(x, z)) continue;
    let bus = 0; for (const c of cars) if (c.type === 'bus') bus++;
    const busMax = Q.traffic > 12 ? 2 : 1;
    let type = CAR_TYPES.bus && bus < busMax && Math.random() < 0.1 ? 'bus' : typeof pickCarType === 'function' ? pickCarType() : rpick(['sedan', 'sedan', 'coupe', 'suv', 'muscle', 'taxi', 'sedan', 'suv', 'coupe', 'taxi']);
    if (type === 'bus' && bus >= busMax) type = 'sedan';
    const clr = type === 'bus' ? 14 : 10;
    let clear = true;
    for (const c of cars) if (Math.abs(c.x - x) < clr && Math.abs(c.z - z) < clr) { clear = false; break; }
    if (!clear) continue;
    const car = new Car(type, type === 'bus' ? rpick(BUS_COLORS) : undefined);
    if (type === 'bus' && typeof lifeDressBus === 'function') lifeDressBus(car);
    car.place(x, z, Math.atan2(seg.dx, seg.dz));
    new TrafficAI(car, [i, j], b, s);
    return car;
  }
  return null;
}
// Traffic signal lenses: recolour only when a phase changes.
function aiUpdateSignals() {
  if (!TSIG.lens) return;
  let dirty = false;
  for (const n of TSIG.nodes.values()) {
    for (let ax = 0; ax < 2; ax++) {
      const st = tsigState(n.i, n.j, ax);
      if (st === n.s[ax]) continue;
      n.s[ax] = st; dirty = true;
      for (const a of n.apps) {
        if (a.axis !== ax) continue;
        for (let h = 0; h < 2; h++) for (let k = 0; k < 3; k++) { const ls = 2 - k; TSIG.lens.setColorAt(a.lens + h * 3 + k, ls === st ? TSIG.ON[ls] : TSIG.OFF[ls]); }
      }
    }
  }
  if (dirty) TSIG.lens.instanceColor.needsUpdate = true;
}
// Curb-parked cars are real cars streamed in near the player (stealable, physical).
let _aiParkW = null;
function aiParkWeights() {
  if (!_aiParkW) { _aiParkW = {}; const w = { sedan: 5, coupe: 3, suv: 3, muscle: 2, pickup: 2, van: 2, supercar: 0.4 }; for (const k in w) if (CAR_TYPES[k]) _aiParkW[k] = w[k]; }
  return _aiParkW;
}
let aiParkT = 0;
function updateCurbParking(dt, px, pz) {
  aiParkT -= dt; if (aiParkT > 0 || !SPOT.curbParking) return;
  aiParkT = 0.6;
  // every car costs ~17 draw calls: keep the parked ones few, and none behind the menu
  const lim = GAME.state !== 'play' ? 0 : qualityName === 'low' ? 2 : qualityName === 'medium' ? 4 : 7;
  let n = 0;
  for (const s of SPOT.curbParking) {
    const c = s.car;
    if (!c) continue;
    if (c.dead || c.driver === 'player' || c.persistent || Math.hypot(c.x - s.x, c.z - s.z) > 2.5) { s.car = null; continue; }
    const d = Math.hypot(c.x - px, c.z - pz);
    if ((d > 140 || lim === 0) && !inView(c.x, c.z)) { c.remove(); s.car = null; continue; }
    n++;
  }
  if (n >= lim) return;
  for (let k = 0; k < 8 && n < lim; k++) {
    const s = SPOT.curbParking[Math.floor(Math.random() * SPOT.curbParking.length)];
    if (s.car) continue;
    const d = Math.hypot(s.x - px, s.z - pz);
    if (d > 100 || (d < 60 && inView(s.x, s.z)) || d < 18) continue;
    let clear = true;
    for (const c of cars) if (Math.abs(c.x - s.x) < 5 && Math.abs(c.z - s.z) < 5) { clear = false; break; }
    if (!clear) continue;
    const c = new Car(typeof pickCarType === 'function' ? pickCarType(aiParkWeights()) : rpick(['sedan', 'sedan', 'coupe', 'suv', 'muscle', 'sedan', 'suv']));
    c.place(s.x, s.z, s.h); c.parked = true; new ParkedAI(c); s.car = c; n++;
  }
}
function updateTraffic(dt) {
  const px = player.x, pz = player.z;
  let n = 0;
  for (let i = cars.length - 1; i >= 0; i--) {
    const c = cars[i];
    if (c === player.car || c.mission || c.persistent || c.driver === 'police') continue;
    const d = Math.hypot(c.x - px, c.z - pz);
    if ((d > 230 || (d > 140 && c.exploded)) && !inView(c.x, c.z)) { c.remove(); continue; }
    if (c.ai) { if (!(c.ai instanceof ParkedAI)) n++; c.ai.update(dt); }
  }
  if (n < Q.traffic) spawnTraffic(px, pz, false);
  aiUpdateSignals();
  updateCurbParking(dt, px, pz);
}

// ---------- pedestrians ----------
const peds = [];
let pedBlobGeo = null;
const _aiRP = [0, 0, 0, 0, 0];
// point on a rectangle perimeter: [x, z, dirx, dirz, side]
function rectPoint(r, p, out) {
  out = out || [0, 0, 0, 0, 0];
  const w = r.x1 - r.x0, d = r.z1 - r.z0, per = 2 * (w + d);
  p = ((p % per) + per) % per;
  if (p < w) { out[0] = r.x0 + p; out[1] = r.z0; out[2] = 1; out[3] = 0; out[4] = 0; return out; }
  p -= w; if (p < d) { out[0] = r.x1; out[1] = r.z0 + p; out[2] = 0; out[3] = 1; out[4] = 1; return out; }
  p -= d; if (p < w) { out[0] = r.x1 - p; out[1] = r.z1; out[2] = -1; out[3] = 0; out[4] = 2; return out; }
  p -= w; out[0] = r.x0; out[1] = r.z1 - p; out[2] = 0; out[3] = -1; out[4] = 3; return out;
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
function aiBlockRect(b, inset) { return { x0: b.x0 + inset, x1: b.x1 - inset, z0: b.z0 + inset, z1: b.z1 - inset, blk: b, inset }; }
const aiPickInset = () => (Math.random() < 0.5 ? rr(2.2, 2.7) : rr(3.6, 4.6));
// Extra poses layered on top of animHuman (sitting, crouching, photo, cower). [bone, x, y, z]
const PED_POSES = {
  sit: [[HB.thL, -1.5, 0, 0.07], [HB.thR, -1.5, 0, -0.07], [HB.shL, 1.45, 0, 0], [HB.shR, 1.45, 0, 0], [HB.ftL, 0.05, 0, 0], [HB.ftR, 0.05, 0, 0],
    [HB.spine, -0.08, 0, 0], [HB.uaL, -0.35, 0, 0.12], [HB.uaR, -0.35, 0, -0.12], [HB.faL, -0.8, 0, 0], [HB.faR, -0.8, 0, 0]],
  duck: [[HB.thL, -1.95, 0, 0.28], [HB.thR, -1.85, 0, -0.28], [HB.shL, 2.35, 0, 0], [HB.shR, 2.3, 0, 0], [HB.ftL, -0.42, 0, 0], [HB.ftR, -0.45, 0, 0],
    [HB.spine, 0.5, 0, 0], [HB.chest, 0.25, 0, 0], [HB.neck, 0.35, 0, 0], [HB.uaL, -2.55, 0, 0.55], [HB.uaR, -2.55, 0, -0.55], [HB.faL, -2.1, 0, 0], [HB.faR, -2.1, 0, 0]],
  cower: [[HB.thL, -0.4, 0, 0.12], [HB.thR, -0.4, 0, -0.12], [HB.shL, 0.75, 0, 0], [HB.shR, 0.75, 0, 0], [HB.ftL, -0.33, 0, 0], [HB.ftR, -0.33, 0, 0], [HB.spine, 0.22, 0, 0], [HB.neck, 0.25, 0, 0]],
  photo: [[HB.uaL, -1.25, 0, -0.42], [HB.uaR, -1.25, 0, 0.42], [HB.faL, -1.15, 0, 0], [HB.faR, -1.15, 0, 0], [HB.haL, 0.2, 0, 0], [HB.haR, 0.2, 0, 0], [HB.neck, 0.08, 0, 0]],
};
const PED_POSE_HIP = { sit: -0.47, duck: -0.52, cower: -0.12, photo: 0 };
function pedApplyPose(H, name, w) {
  const P = PED_POSES[name]; if (!P) return;
  const bn = H.bones;
  for (let i = 0; i < P.length; i++) {
    const e = P[i], r = bn[e[0]].rotation;
    r.x = lerp(r.x, e[1], w); r.y = lerp(r.y, e[2], w); r.z = lerp(r.z, e[3], w);
  }
  const hp = bn[HB.hips].position; hp.y = lerp(hp.y, 0.95 + PED_POSE_HIP[name], w);
}
const pedCrossers = [];
const PEDSTAT = { crossed: 0, dodged: 0, fights: 0 };
class Ped {
  constructor(look, x, z) {
    look = look || randomLook();
    this.look = look;
    this.H = buildHuman(look);
    this.root = this.H.root; this.root.rotation.order = 'YXZ';
    this.blob = new THREE.Mesh(blobGeo, blobMat); this.blob.scale.set(1.1, 1, 1.1); this.blob.renderOrder = 1;
    this.x = x; this.z = z; this.y = groundH(x, z); this.h = Math.random() * TAU;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.state = 'walk'; this.anim = { speed: 0, punch: 0, punchSide: 1, air: false, vy: 0, t: Math.random() * 10, hands: false, phone: !!look.phone, mode: 'normal', getT: 0, turn: 0, flinch: 0 };
    this.idleT = Math.random() < 0.3 ? rr(1, 4) : 0; this.getT = 0; this._ph = undefined;
    this.health = 60; this.t = 0; this.fleeT = 0; this.downT = 0; this.tumble = 0; this.removeT = 30; this.thinkT = Math.random() * 0.3;
    this.rect = null; this.p = 0; this.dir = 1; this.spd = 1.3; this.cop = false; this.side = -1;
    this.act = null; this.pose = null; this.poseName = null; this.poseW = 0; this.line = null;
    this.brave = look.gender === 'm' ? Math.random() < 0.22 : Math.random() < 0.08;
    this.punchCd = 0; this.pendingHit = 0; this.fightT = 0; this.stateT = 0; this.cross = null;
    scene.add(this.root); scene.add(this.blob);
    peds.push(this);
  }
  get alive() { return this.state !== 'dead' && this.state !== 'fly' && this.state !== 'down' && this.state !== 'getup'; }
  remove() {
    this.leaveActivity();
    scene.remove(this.root); scene.remove(this.blob); this.H.dispose();
    const i = peds.indexOf(this); if (i >= 0) peds.splice(i, 1);
    this.removed = true;
  }
  // release benches, bus-stop and queue spots, the crossing list
  leaveActivity() {
    const A = this.act;
    if (A) {
      if (A.bench && A.bench.taken === this) A.bench.taken = null;
      if (A.spot && A.spot.taken === this) A.spot.taken = null;
      if (A.stop) { const i = A.stop.waiting.indexOf(this); if (i >= 0) A.stop.waiting.splice(i, 1); }
      if (A.slot && A.slot.taken === this) A.slot.taken = null;
      this.act = null;
    }
    if (this.cross) { const i = pedCrossers.indexOf(this); if (i >= 0) pedCrossers.splice(i, 1); this.cross = null; }
    this.pose = null; this.line = null;
  }
  ensureRect() {
    if (this.rect) return true;
    const b = cityBlockAt(this.x, this.z) || blocks[clamp(Math.round((this.x + CITY.HALF - CITY.P / 2) / CITY.P), 0, CITY.N - 1) * CITY.N + clamp(Math.round((this.z + CITY.HALF - CITY.P / 2) / CITY.P), 0, CITY.N - 1)];
    if (!b || this.x > 287) return false;
    this.rect = aiBlockRect(b, aiPickInset()); this.p = rectProject(this.rect, this.x, this.z); this.dir = Math.random() < 0.5 ? 1 : -1;
    return true;
  }
  // after a scare / activity: walk back to the block sidewalk, or stroll along the promenade
  resume() {
    this.leaveActivity();
    if (this.ensureRect()) { this.state = 'return'; this.p = rectProject(this.rect, this.x, this.z); }
    else { this.state = 'line'; this.line = SPOT.jog && SPOT.jog[this.x > 296 ? 1 : 0]; this.lt = this.line ? clamp((this.z - this.line.z0) / (this.line.z1 - this.line.z0), 0, 1) : 0; this.ldir = Math.random() < 0.5 ? 1 : -1; this.spd = rr(1.1, 1.5); if (!this.line) this.state = 'flee'; }
  }
  flee(fromX, fromZ, t) {
    if (this.state === 'dead' || this.state === 'fly' || this.state === 'down' || this.state === 'getup') return;
    this.leaveActivity();
    const dx = this.x - fromX, dz = this.z - fromZ, d = Math.hypot(dx, dz) || 1;
    this.fx = dx / d; this.fz = dz / d; this.state = 'flee'; this.fleeT = t || rr(4, 7); this.anim.phone = !!this.report; this.idleT = 0; this.anim.hands = false;
  }
  cower(fromX, fromZ, t) {
    if (!this.alive) return;
    this.leaveActivity();
    this.state = 'cower'; this.stateT = t; this.fx = this.x - fromX; this.fz = this.z - fromZ; this.pose = 'cower'; this.anim.hands = true; this.anim.phone = false;
    this.h = Math.atan2(fromX - this.x, fromZ - this.z);
  }
  duck(fromX, fromZ, t) {
    if (!this.alive) return;
    this.leaveActivity();
    this.state = 'duck'; this.stateT = t; this.fx = this.x - fromX; this.fz = this.z - fromZ; this.pose = 'duck'; this.anim.phone = false;
  }
  // reaction to gunfire / explosions at distance d
  panic(x, z, d, kind) {
    if (!this.alive || this.cop) return;
    if (this.state === 'fight') { this.flee(x, z, rr(5, 8)); return; }
    if (this.state === 'cower' || this.state === 'duck') return;
    if (this.state === 'flee') { this.fleeT = Math.max(this.fleeT, 4); return; }
    const r = Math.random(), boom = kind === 'boom';
    if (d < 13) { if (r < (boom ? 0.15 : 0.32)) { this.cower(x, z, rr(3, 6)); return; } if (r < 0.62) { this.duck(x, z, rr(1.6, 3.2)); return; } }
    else if (d < 32 && r < (boom ? 0.45 : 0.3)) { this.duck(x, z, rr(1.0, 2.2)); return; }
    if (d < 45 || r < 0.7) this.flee(x, z, rr(5, 9));
  }
  dodge(dx, dz) {
    this.leaveActivity(); PEDSTAT.dodged++;
    this.state = 'dodge'; this.stateT = rr(0.55, 0.8); this.vx = dx * 6.2; this.vz = dz * 6.2; this.h = Math.atan2(dx, dz);
    if (Math.random() < 0.5) AUD.tone(rr(520, 760), 0.22, 'triangle', 0.025, rr(800, 1100));
  }
  board(bus) { this.leaveActivity(); this.state = 'board'; this.boardCar = bus; this.stateT = 3; }
  knock(vx, vz, sp, attacker) {
    if (this.state === 'dead' && this.y > groundH(this.x, this.z) + 0.3) return;
    const wasAlive = this.state !== 'dead';
    this.leaveActivity();
    this.state = 'fly'; this.vx = vx; this.vz = vz; this.vy = 1.8 + sp * 0.22; this.tumble = 0; this.anim.hands = false;
    this.health -= 10 + sp * 7;
    if (attacker !== undefined) this.lastAttacker = attacker;
    if (wasAlive && this.health <= 0) { this.killedBy = attacker; this.markKilled(attacker); }
    AUD.thud(Math.min(1, sp / 12));
  }
  markKilled(by) { if (this._killed) return; this._killed = true; EV.emit('pedKilled', { ped: this, by }); }
  update(dt) {
    const a = this.anim; a.t += dt; a.flinch = Math.max(0, (a.flinch || 0) - dt * 4);
    if (a.punch > 0) { a.punch += dt / 0.4; if (a.punch >= 1) a.punch = 0; }
    switch (this.state) {
      case 'walk': this.updWalk(dt); break;
      case 'toCross': case 'waitCross': case 'cross': this.updCross(dt); break;
      case 'line': this.updLine(dt); break;
      case 'idle': this.updIdle(dt); break;
      case 'flee': case 'return': {
        let tx, tz, sp;
        if (this.state === 'flee') {
          tx = this.fx; tz = this.fz; sp = 5.6; this.fleeT -= dt;
          if (this.fleeT <= 0) this.resume();
        } else {
          if (!this.rect) { this.resume(); break; }
          const r = rectPoint(this.rect, this.p, _aiRP); const dx = r[0] - this.x, dz = r[1] - this.z, d = Math.hypot(dx, dz);
          if (d < 0.5) { this.state = 'walk'; this.side = -1; break; }
          tx = dx / d; tz = dz / d; sp = 1.7;
        }
        if (this.state !== 'flee' && this.state !== 'return') break;
        this.vx = damp(this.vx, tx * sp, 6, dt); this.vz = damp(this.vz, tz * sp, 6, dt);
        this.x += this.vx * dt; this.z += this.vz * dt;
        const hit = collideCircle(this.x, this.z, 0.3);
        if (hit.hit && this.state === 'flee') { this.fx = this.fx * 0.3 + hit.nx; this.fz = this.fz * 0.3 + hit.nz; const l = Math.hypot(this.fx, this.fz) || 1; this.fx /= l; this.fz /= l; }
        this.x = hit.x; this.z = hit.z;
        const s = Math.hypot(this.vx, this.vz);
        if (s > 0.2) this.h = dampA(this.h, Math.atan2(this.vx, this.vz), 10, dt);
        a.speed = s;
        break;
      }
      case 'dodge': {
        this.stateT -= dt;
        this.vx = damp(this.vx, 0, 2.5, dt); this.vz = damp(this.vz, 0, 2.5, dt);
        this.x += this.vx * dt; this.z += this.vz * dt;
        const hit = collideCircle(this.x, this.z, 0.3); this.x = hit.x; this.z = hit.z;
        a.speed = Math.hypot(this.vx, this.vz);
        if (this.stateT <= 0) { if (Math.random() < 0.4) this.flee(this.x - this.vx, this.z - this.vz, rr(2, 4)); else this.resume(); }
        break;
      }
      case 'cower': case 'duck': {
        this.stateT -= dt; a.speed = damp(a.speed, 0, 8, dt);
        if (this.stateT <= 0) { this.pose = null; this.anim.hands = false; this.flee(this.x - this.fx, this.z - this.fz, rr(5, 9)); }
        break;
      }
      case 'fight': this.updFight(dt); break;
      case 'board': {
        const b = this.boardCar; this.stateT -= dt;
        if (!b || b.dead || this.stateT <= 0) { this.remove(); return; }
        const dx = b.x - this.x, dz = b.z - this.z, d = Math.hypot(dx, dz);
        if (d < 1.8) { this.remove(); return; }
        this.x += dx / d * 1.6 * dt; this.z += dz / d * 1.6 * dt; this.h = dampA(this.h, Math.atan2(dx, dz), 8, dt); a.speed = 1.6;
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
        if (this.getT >= 1.05) {
          this.tumble = 0;
          const d = Math.hypot(player.x - this.x, player.z - this.z);
          if (this.brave && !this.cop && this.lastAttacker === 'player' && GAME.state === 'play' && player.mode === 'foot' && !player.dead && this.health > 18 && d < 12) { this.state = 'fight'; this.fightT = rr(10, 16); this.punchCd = 0.4; }
          else { this.state = 'flee'; this.fleeT = rr(4, 7); if (!this.fx) { this.fx = 1; this.fz = 0; } }
        }
        break;
      }
      case 'dead': {
        this.removeT -= dt;
        this.vx = damp(this.vx, 0, 4, dt); this.vz = damp(this.vz, 0, 4, dt); this.x += this.vx * dt; this.z += this.vz * dt;
        break;
      }
      default: break;
    }
    if (this.removed) return;
    if (this.state !== 'fly') this.y = damp(this.y, groundH(this.x, this.z), 12, dt);
    this.sync(dt);
  }
  // walking around the block, deciding to cross at corners
  updWalk(dt) {
    const a = this.anim;
    if (!this.rect) { this.resume(); return; }
    if (this.idleT > 0) { this.idleT -= dt; a.speed = damp(a.speed, 0, 6, dt); }
    else {
      this.p += this.dir * this.spd * dt;
      const r = rectPoint(this.rect, this.p, _aiRP);
      const side = r[4];
      if (this.side >= 0 && side !== this.side && this.rect.blk && Math.random() < 0.42) {
        const corner = this.dir > 0 ? side : this.side;
        if (this.planCross(corner, this.dir > 0 ? side : (side + 3) % 4)) return;
      }
      this.side = side;
      this.x = r[0]; this.z = r[1];
      this.h = dampA(this.h, Math.atan2(r[2] * this.dir, r[3] * this.dir), 7, dt);
      a.speed = damp(a.speed, this.spd, 6, dt);
      if (Math.random() < dt * 0.025) this.idleT = rr(2, 7);
    }
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = 0.25; this.react(); }
  }
  // corner k: 0 (x0,z0) 1 (x1,z0) 2 (x1,z1) 3 (x0,z1); heading side tells which road is "straight ahead"
  planCross(k, nextSide) {
    const b = this.rect.blk, sx = (k === 1 || k === 2) ? 1 : -1, sz = k >= 2 ? 1 : -1;
    const cx = sx > 0 ? b.x1 : b.x0, cz = sz > 0 ? b.z1 : b.z0;
    const ni = b.bi + (sx > 0 ? 1 : 0), nj = b.bj + (sz > 0 ? 1 : 0);
    // option X: cross the vertical road (walk along x); option Z: cross the horizontal road (walk along z)
    const tbX = b.bi + sx, tbZ = b.bj + sz;
    const okX = tbX >= 0 && tbX < CITY.N, okZ = tbZ >= 0 && tbZ < CITY.N;
    if (!okX && !okZ) return false;
    // nextSide 0/2 run along x, 1/3 along z: going "straight" continues the old side direction
    let useX = okX && (!okZ || Math.random() < 0.5);
    if (useX) {
      const zc = cz - sz * 2.4;
      this.cross = { ax: cx - sx * 0.45, az: zc, bx: cx + sx * (CITY.RW + 0.45), bz: zc, ni, nj, axis: 1, tb: blocks[tbX * CITY.N + b.bj], wait: 0 };
    } else {
      const xc = cx - sx * 2.4;
      this.cross = { ax: xc, az: cz - sz * 0.45, bx: xc, bz: cz + sz * (CITY.RW + 0.45), ni, nj, axis: 0, tb: blocks[b.bi * CITY.N + tbZ], wait: 0 };
    }
    this.state = 'toCross';
    return true;
  }
  updCross(dt) {
    const C = this.cross, a = this.anim;
    if (!C) { this.resume(); return; }
    if (this.state === 'toCross') {
      const dx = C.ax - this.x, dz = C.az - this.z, d = Math.hypot(dx, dz);
      if (d < 0.25) { this.state = 'waitCross'; C.wait = 0; }
      else { const sp = Math.min(this.spd, d * 3); this.x += dx / d * sp * dt; this.z += dz / d * sp * dt; this.h = dampA(this.h, Math.atan2(dx, dz), 8, dt); a.speed = damp(a.speed, sp, 6, dt); }
    } else if (this.state === 'waitCross') {
      a.speed = damp(a.speed, 0, 6, dt);
      this.h = dampA(this.h, Math.atan2(C.bx - C.ax, C.bz - C.az), 5, dt);
      C.wait += dt;
      if (pedCrossOK(C)) { this.state = 'cross'; pedCrossers.push(this); }
      else if (C.wait > 35) { this.cross = null; this.resume(); return; }
    } else {
      const dx = C.bx - this.x, dz = C.bz - this.z, d = Math.hypot(dx, dz);
      // hurry if the light changes mid-way
      const sp = tsigState(C.ni, C.nj, 1 - C.axis) === 0 ? 1.9 : 3.2;
      if (d < 0.3) {
        const i = pedCrossers.indexOf(this); if (i >= 0) pedCrossers.splice(i, 1);
        const tb = C.tb; this.cross = null; PEDSTAT.crossed++;
        if (tb) { this.rect = aiBlockRect(tb, this.rect ? this.rect.inset : aiPickInset()); this.p = rectProject(this.rect, this.x, this.z); this.dir = Math.random() < 0.5 ? 1 : -1; this.state = 'return'; this.side = -1; }
        else this.resume();
        return;
      }
      this.x += dx / d * sp * dt; this.z += dz / d * sp * dt; this.h = dampA(this.h, Math.atan2(dx, dz), 8, dt); a.speed = damp(a.speed, sp, 8, dt);
    }
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = 0.25; this.react(); }
  }
  // jogging / strolling back and forth on a line
  updLine(dt) {
    const L = this.line, a = this.anim;
    if (!L) { this.resume(); return; }
    const len = Math.hypot(L.x1 - L.x0, L.z1 - L.z0) || 1;
    this.lt += this.ldir * this.spd * dt / len;
    if (this.lt > 1) { this.lt = 1; this.ldir = -1; } else if (this.lt < 0) { this.lt = 0; this.ldir = 1; }
    const tx = lerp(L.x0, L.x1, this.lt) + (this.lo || 0), tz = lerp(L.z0, L.z1, this.lt);
    this.x = damp(this.x, tx, 6, dt); this.z = damp(this.z, tz, 6, dt);
    this.h = dampA(this.h, Math.atan2((L.x1 - L.x0) * this.ldir, (L.z1 - L.z0) * this.ldir), 6, dt);
    a.speed = damp(a.speed, this.spd, 4, dt);
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = 0.25; this.react(); }
  }
  // stationary activities: sit, chat, photo, wait (bus stop), queue (club), guard (bouncer)
  updIdle(dt) {
    const A = this.act, a = this.anim;
    if (!A) { this.resume(); return; }
    a.speed = damp(a.speed, 0, 8, dt);
    A.t -= dt;
    if (A.kind === 'sit') { this.x = A.bench.x; this.z = A.bench.z; this.h = A.bench.h; }
    else {
      const dx = A.x - this.x, dz = A.z - this.z, d = Math.hypot(dx, dz);
      if (d > 0.08) { const sp = Math.min(A.spd || 1.4, d * 2); this.x += dx / d * sp * dt; this.z += dz / d * sp * dt; a.speed = sp; }
      this.h = dampA(this.h, A.h, 4, dt);
    }
    if (A.kind === 'chat') {
      A.gest -= dt;
      if (A.gest <= 0) { A.gest = rr(2.5, 6); A.gestW = 1.4; }
      A.gestW = Math.max(0, A.gestW - dt);
    } else if (A.kind === 'photo') {
      A.flash -= dt; if (A.flash <= 0) { A.flash = rr(2, 5); A.flashT = 0.12; }
      A.flashT = Math.max(0, (A.flashT || 0) - dt);
    } else if (A.kind === 'queue' && DAY.night < 0.3) A.t = Math.min(A.t, 0);
    if (A.t <= 0 && A.kind !== 'guard') {
      if (A.kind === 'photo' && SPOT.stroll) { this.leaveActivity(); this.state = 'line'; this.line = rpick(SPOT.stroll); this.lt = clamp((this.x - this.line.x0) / (this.line.x1 - this.line.x0), 0, 1); this.ldir = Math.random() < 0.5 ? 1 : -1; this.spd = rr(1.1, 1.4); }
      else this.resume();
      return;
    }
    if (A.kind === 'guard' && DAY.night < 0.25) { this.resume(); return; }
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = 0.3; this.react(); }
  }
  updFight(dt) {
    const a = this.anim;
    this.fightT -= dt; this.punchCd -= dt;
    const dx = player.x - this.x, dz = player.z - this.z, d = Math.hypot(dx, dz);
    if (this.fightT <= 0 || player.dead || player.mode !== 'foot' || d > 18 || this.health < 18 || GAME.state !== 'play') { this.flee(player.x, player.z, rr(3, 6)); return; }
    this.h = dampA(this.h, Math.atan2(dx, dz), 10, dt);
    const want = d > 1.15 ? Math.min(4.6, (d - 1.0) * 3) : 0;
    this.vx = damp(this.vx, dx / (d || 1) * want, 8, dt); this.vz = damp(this.vz, dz / (d || 1) * want, 8, dt);
    this.x += this.vx * dt; this.z += this.vz * dt;
    const hit = collideCircle(this.x, this.z, 0.3); this.x = hit.x; this.z = hit.z;
    a.speed = Math.hypot(this.vx, this.vz);
    if (d < 1.45 && this.punchCd <= 0) { this.punchCd = rr(0.85, 1.3); a.punch = 0.001; a.punchSide = -(a.punchSide || 1); this.pendingHit = 0.16; AUD.whoosh(); }
    if (this.pendingHit > 0) {
      this.pendingHit -= dt;
      if (this.pendingHit <= 0 && d < 1.75 && player.mode === 'foot' && !player.dead) { hurtPlayer(rr(5, 8), 'Избит прохожим'); AUD.punch(); shakeCam(0.14); }
    }
  }
  react() {
    if (GAME.state === 'play' && player.dead) return;
    // crowds part around a speeding car
    for (let k = 0; k < cars.length; k++) {
      const c = cars[k], sp = c.speed; if (sp < 7) continue;
      const dx = this.x - c.x, dz = this.z - c.z; if (dx > 30 || dx < -30 || dz > 30 || dz < -30) continue;
      const ux = c.vx / sp, uz = c.vz / sp, al = dx * ux + dz * uz; if (al < 0 || al > sp * 1.4 + 4) continue;
      const lat = dx * uz - dz * ux; if (Math.abs(lat) > 2.6) continue;
      const s = lat >= 0 ? 1 : -1;
      this.dodge(uz * s, -ux * s);
      return;
    }
    if (GAME.state === 'play' && wanted.stars >= 2 && Math.hypot(this.x - player.x, this.z - player.z) < 14 && Math.random() < 0.3) this.flee(player.x, player.z);
  }
  sync(dt) {
    const lying = this.state === 'down' || this.state === 'dead' || this.state === 'fly';
    const a = this.anim;
    a.mode = lying ? 'down' : this.state === 'getup' ? 'getup' : 'normal';
    a.getT = this.getT;
    a.turn = this._ph === undefined || !(dt > 0) ? 0 : wrapA(this.h - this._ph) / dt; this._ph = this.h;
    animHuman(this.H, a, dt || 0.016);
    // activity pose (sit / duck / cower / photo) blended in after the procedural animation
    const pose = lying ? null : this.pose;
    if (pose) { this.poseName = pose; this.poseW = Math.min(1, this.poseW + (dt || 0.016) * 4); }
    else this.poseW = Math.max(0, this.poseW - (dt || 0.016) * 4);
    if (this.poseW > 0.001 && this.poseName) pedApplyPose(this.H, this.poseName, sstep(0, 1, this.poseW));
    const A = this.act;
    if (A && A.kind === 'chat' && A.gestW > 0) { const g = Math.sin(clamp(A.gestW / 1.4, 0, 1) * Math.PI), bn = this.H.bones; bn[HB.uaR].rotation.x -= 0.55 * g; bn[HB.faR].rotation.x -= 0.9 * g; bn[HB.uaR].rotation.z += 0.25 * g; }
    if (this.postAnim) this.postAnim(dt);
    this.root.position.set(this.x, this.y + Math.sin(this.tumble) * 0.13, this.z);
    this.root.rotation.set(-this.tumble, this.h, 0);
    this.blob.position.set(this.x, groundH(this.x, this.z) + 0.03, this.z);
  }
}
// Generic damage entry point (bullets, melee, explosions). dx, dz: direction of the hit.
Ped.prototype.damage = function (amount, attacker, dx, dz) {
  if (this.removed) return;
  const wasAlive = this.state !== 'dead' && this.health > 0;
  this.health -= amount; this.anim.flinch = 1;
  if (attacker !== undefined) this.lastAttacker = attacker;
  if (this.health <= 0) {
    if (wasAlive) this._viaDamage = true;
    if (this.state !== 'fly' && this.state !== 'dead') this.knock((dx || 0) * 2.5, (dz || 0) * 2.5, 1.5, attacker);
  } else if (this.alive) {
    if (this.brave && attacker === 'player' && amount < 15 && player.mode === 'foot') { this.leaveActivity(); this.state = 'fight'; this.fightT = rr(8, 14); }
    else this.flee(this.x - (dx || 0) * 5, this.z - (dz || 0) * 5);
  }
  if (wasAlive && this.health <= 0) this.markKilled(attacker);
};
function pedCrossOK(C) {
  const n = tsigNode(C.ni, C.nj);
  if (n) return tsigState(C.ni, C.nj, C.axis) === 2 && tsigState(C.ni, C.nj, 1 - C.axis) === 0 && tsigGreenLeft(C.ni, C.nj, 1 - C.axis) > 5.5;
  const mx = (C.ax + C.bx) / 2, mz = (C.az + C.bz) / 2;
  for (const c of cars) if (c.speed > 2 && Math.abs(c.x - mx) < 24 && Math.abs(c.z - mz) < 24) return false;
  return true;
}
// Gunfire / explosion panic for everyone around (x, z)
function pedPanic(x, z, radius, kind) {
  for (let i = 0; i < peds.length; i++) {
    const p = peds[i]; if (p.cop || !p.alive) continue;
    const d = Math.hypot(p.x - x, p.z - z); if (d > radius) continue;
    p.panic(x, z, d, kind);
  }
}
// ---------- pedestrian spawning ----------
function pedSpawnOK(x, z, px, pz, force) {
  const d = Math.hypot(x - px, z - pz);
  if (d < (force ? 14 : 45) || d > 150) return false;
  if (!force && d < 100 && inView(x, z)) return false;
  return true;
}
function pedSpawnWalker(px, pz, force) {
  for (let tries = 0; tries < 12; tries++) {
    const b = blocks[Math.floor(Math.random() * blocks.length)];
    if (Math.abs(b.cx - px) > 160 || Math.abs(b.cz - pz) > 160) continue;
    const rect = aiBlockRect(b, aiPickInset());
    const per = 2 * ((rect.x1 - rect.x0) + (rect.z1 - rect.z0)), p = Math.random() * per;
    const pt = rectPoint(rect, p, _aiRP);
    if (!pedSpawnOK(pt[0], pt[1], px, pz, force)) continue;
    const ped = new Ped(randomLook(), pt[0], pt[1]);
    ped.rect = rect; ped.p = p; ped.dir = Math.random() < 0.5 ? 1 : -1; ped.spd = rr(1.1, 1.6);
    return ped;
  }
  return null;
}
function pedStartIdle(p, act, pose) { p.state = 'idle'; p.act = act; p.pose = pose || null; p.poseW = pose ? 1 : 0; p.poseName = pose || null; }
function pedSpawnSitter(px, pz, force) {
  const B = SPOT.benches; if (!B || !B.length) return null;
  for (let tries = 0; tries < 10; tries++) {
    const s = B[Math.floor(Math.random() * B.length)];
    if (s.taken || !pedSpawnOK(s.x, s.z, px, pz, force)) continue;
    const look = randomLook(); if (Math.random() < 0.3) look.phone = true;
    const p = new Ped(look, s.x, s.z); p.h = s.h; s.taken = p;
    pedStartIdle(p, { kind: 'sit', bench: s, t: rr(25, 70) }, 'sit');
    return p;
  }
  return null;
}
function pedSpawnGroup(px, pz, force) {
  for (let tries = 0; tries < 10; tries++) {
    let cx, cz;
    if (SPOT.plaza && Math.random() < 0.3) { const a = Math.random() * TAU, r = rr(19, 24); cx = SPOT.plaza.x + Math.cos(a) * r; cz = SPOT.plaza.z + Math.sin(a) * r; }
    else {
      const b = blocks[Math.floor(Math.random() * blocks.length)];
      if (b.type === 'site') continue;
      const S = cityBlockSides(b)[Math.floor(Math.random() * 4)], t = rr(24, 40), ins = 4.4;
      cx = S.x + S.ux * t - S.nx * ins; cz = S.z + S.uz * t - S.nz * ins;
    }
    if (!pedSpawnOK(cx, cz, px, pz, force) || collideCircle(cx, cz, 1.3).hit) continue;
    const n = Math.random() < 0.6 ? 2 : 3, a0 = Math.random() * TAU, first = [];
    for (let k = 0; k < n; k++) {
      const a = a0 + k / n * TAU + rr(-0.2, 0.2), r = rr(0.55, 0.75), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const p = new Ped(randomLook(), x, z);
      p.h = Math.atan2(cx - x, cz - z);
      pedStartIdle(p, { kind: 'chat', x, z, h: p.h, t: rr(25, 75), gest: rr(0.5, 4), gestW: 0 });
      first.push(p);
    }
    return first[0];
  }
  return null;
}
function pedSpawnLiner(px, pz, force) {
  const lines = SPOT.jog; if (!lines || !lines.length || px < 150) return null;
  for (let tries = 0; tries < 6; tries++) {
    const L = rpick(lines), t = Math.random(), x = lerp(L.x0, L.x1, t), z = lerp(L.z0, L.z1, t);
    if (!pedSpawnOK(x, z, px, pz, force)) continue;
    const look = randomLook(); look.shorts = true; look.sleeves = Math.random() < 0.5 ? 'tank' : 'short'; look.phone = false;
    const p = new Ped(look, x, z);
    p.state = 'line'; p.line = L; p.lt = t; p.ldir = Math.random() < 0.5 ? 1 : -1; p.spd = rr(3.3, 3.9); p.lo = rr(-0.6, 0.6);
    return p;
  }
  return null;
}
function pedSpawnPhotographer(px, pz, force) {
  const S = SPOT.photo; if (!S || !S.length || px < 220) return null;
  for (let tries = 0; tries < 8; tries++) {
    const s = S[Math.floor(Math.random() * S.length)];
    if (s.taken || !pedSpawnOK(s.x, s.z, px, pz, force)) continue;
    const look = randomLook(); look.phone = true;
    const p = new Ped(look, s.x, s.z); p.h = s.h; s.taken = p;
    pedStartIdle(p, { kind: 'photo', spot: s, x: s.x, z: s.z, h: s.h, t: rr(10, 22), flash: rr(1, 4), flashT: 0 }, 'photo');
    return p;
  }
  return null;
}
function pedSpawnWaiter(px, pz, force) {
  const S = SPOT.busStops; if (!S || !S.length) return null;
  for (let tries = 0; tries < 8; tries++) {
    const st = S[Math.floor(Math.random() * S.length)];
    const k = st.waiting.length; if (k >= st.waitSpots.length) continue;
    const [x, z] = st.waitSpots[k];
    if (!pedSpawnOK(x, z, px, pz, force)) continue;
    const p = new Ped(randomLook(), x, z); p.h = st.ry;
    st.waiting.push(p);
    pedStartIdle(p, { kind: 'wait', stop: st, x, z, h: st.ry, t: rr(50, 110) });
    return p;
  }
  return null;
}
const BOUNCER_LOOK = { gender: 'm', skin: '#5c3824', shirt: '#121216', shirtPat: 'fabric', sleeves: 'long', pants: '#121216', pantsPat: 'fabric', shorts: false,
  shoes: '#111111', sole: '#111111', hair: '#0d0d0d', hairStyle: 'bald', hat: null, glasses: true, phone: false, belt: true, height: 1.06, girth: 1.22 };
function pedSpawnClubber(px, pz, force) {
  const C = SPOT.club; if (!C || !C.queue || DAY.night < 0.45) return null;
  if (Math.hypot(C.x - px, C.z - pz) > 140) return null;
  if (!C.bouncerPed || C.bouncerPed.removed || !C.bouncerPed.alive || (C.bouncerPed.act && C.bouncerPed.act.kind !== 'guard') || !C.bouncerPed.act) {
    if (!pedSpawnOK(C.bouncer.x, C.bouncer.z, px, pz, true)) return null;
    const p = new Ped(BOUNCER_LOOK, C.bouncer.x, C.bouncer.z); p.h = C.bouncer.h; p.brave = true;
    pedStartIdle(p, { kind: 'guard', x: C.bouncer.x, z: C.bouncer.z, h: C.bouncer.h, t: 1e9 });
    C.bouncerPed = p; return p;
  }
  for (const q of C.queue) {
    if (q.taken) continue;
    if (!pedSpawnOK(q.x, q.z, px, pz, force)) return null;
    const look = randomLook(); if (Math.random() < 0.4) look.shirt = rpick(['#ff3f8e', '#3fe5ef', '#7a5cff', '#121216', '#f4f1ea']);
    const p = new Ped(look, q.x, q.z); p.h = q.h; q.taken = p;
    pedStartIdle(p, { kind: 'queue', slot: q, x: q.x + rr(-0.15, 0.15), z: q.z, h: q.h, t: rr(40, 120) });
    return p;
  }
  return null;
}
function pedSpawnAlight(x, z) {
  let n = 0; for (const p of peds) if (!p.cop && p.state !== 'dead') n++;
  if (n > Q.peds + 4) return null;
  const p = new Ped(randomLook(), x, z);
  p.resume();
  return p;
}
function spawnPed(px, pz, force) {
  const r = Math.random();
  let p = null;
  if (r < 0.14) p = pedSpawnSitter(px, pz, force);
  else if (r < 0.24) p = pedSpawnGroup(px, pz, force);
  else if (r < 0.33) p = pedSpawnLiner(px, pz, force);
  else if (r < 0.39) p = pedSpawnPhotographer(px, pz, force);
  else if (r < 0.45) p = pedSpawnWaiter(px, pz, force);
  else if (r < 0.53) p = pedSpawnClubber(px, pz, force);
  return p || pedSpawnWalker(px, pz, force);
}
function updatePeds(dt) {
  const px = player.x, pz = player.z;
  let n = 0;
  for (let i = peds.length - 1; i >= 0; i--) {
    const p = peds[i];
    const d = Math.hypot(p.x - px, p.z - pz);
    if (d > 175 || (p.state === 'dead' && p.removeT <= 0 && !inView(p.x, p.z))) { p.remove(); continue; }
    if (p.state !== 'dead' && !p.cop) n++;
    if (d > 110 && (p.state === 'walk' || p.state === 'idle' || p.state === 'line') && !p.cop) {
      if (p.state === 'walk' && p.idleT <= 0) p.p += p.dir * p.spd * dt;
      p.root.visible = false; continue;
    }
    p.update(dt);
    if (p.removed) continue;
    p.root.visible = d < 120;
  }
  // cars hitting pedestrians
  for (const c of cars) {
    const sp = c.speed; if (sp < 3) continue;
    const r = carCircles(c, CA) + 0.3;
    for (const p of peds) {
      if (p.state === 'fly' || p.state === 'board') continue;
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

// ---------- police pursuit & wanted ----------
const police = [];
// lastX/Z/VX/VZ: last confirmed sighting; seenAt: game time of the last sighting by any unit;
// hostileAt: last time the player attacked (shots, hitting officers); copNear: an officer within arrest reach.
const wanted = { heat: 0, stars: 0, unseen: 0, flash: false, bustT: 0, lastX: 0, lastZ: 0, lastVX: 0, lastVZ: 0, seenAt: -99, hostileAt: -99, copNear: false };
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
function aiPlayerVel(out) {
  if (player.mode === 'car' && player.car) { out[0] = player.car.vx; out[1] = player.car.vz; } else { out[0] = player.vx || 0; out[1] = player.vz || 0; }
  return out;
}
const _aiPvel = [0, 0];
// Any police unit that sees the player reports the position to everyone.
function policeSpot() {
  aiPlayerVel(_aiPvel);
  wanted.lastX = player.x; wanted.lastZ = player.z; wanted.lastVX = _aiPvel[0]; wanted.lastVZ = _aiPvel[1]; wanted.seenAt = GAME.time;
}
function policeCanSee(x, z, range) {
  const d = Math.hypot(player.x - x, player.z - z);
  return d < 22 || (d < range && losClear(x, z, player.x, player.z));
}
const policePlayerHostile = () => wanted.stars >= 3 || GAME.time - wanted.hostileAt < 9;
class PoliceAI {
  // role: 'chase' | 'cutoff' | 'block' (roadblock) | 'van' (armoured squad van)
  constructor(car, role) {
    this.car = car; car.driver = 'police'; car.ai = this;
    this.role = role || 'chase'; this.mode = 'chase'; this.state = role === 'block' ? 'block' : 'drive';
    this.path = []; this.repath = 0; this.stuckT = 0; this.revT = 0; this.flash = Math.random() * 10;
    this.seats = role === 'van' ? 4 : role === 'block' ? 0 : 2; this.crew = []; this.seen = false; this.seeT = Math.random() * 0.25;
    this.pitCd = rr(2, 4); this.goal = null; this.waitT = 0; this.searchNode = null; this.deployCd = 0;
  }
  get static() { return this.role === 'block'; }
  release() { }
  // hold still: brake while rolling forward, handbrake otherwise (brake at standstill = reverse gear)
  brake(dt) { const c = this.car; c.physics({ throttle: 0, brake: c.vf > 0.6 ? 1 : 0, steer: 0, hand: true }, dt); }
  update(dt) {
    const c = this.car;
    this.flash += dt;
    if (c.wrecked || this.mode === 'leave' || player.dead) { this.brake(dt); this.seen = false; return; }
    this.seeT -= dt;
    if (this.seeT <= 0) { this.seeT = 0.25; this.seen = policeCanSee(c.x, c.z, 88); if (this.seen) policeSpot(); }
    if (this.state === 'block' || this.state === 'deploy') { this.brake(dt); if (typeof policeDeployedUpdate === 'function') policeDeployedUpdate(this, dt); return; }
    this.deployCd -= dt; this.pitCd -= dt;
    const known = GAME.time - wanted.seenAt < 1.6;
    const pc = player.mode === 'car' ? player.car : null;
    let tx, tz;
    if (known) { tx = player.x; tz = player.z; } else { tx = wanted.lastX + wanted.lastVX * 1.2; tz = wanted.lastZ + wanted.lastVZ * 1.2; }
    const dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz);
    aiPlayerVel(_aiPvel);
    const tsp = Math.hypot(_aiPvel[0], _aiPvel[1]);
    // deploy officers when the suspect is on foot or stopped nearby
    const slow = !pc || pc.speed < 3;
    if (known && this.seen && d < 26 && slow && this.seats > 0 && this.deployCd <= 0 && c.speed < 2.2 && (wanted.stars >= 2 || !pc) && typeof policeDeployCrew === 'function') {
      if (policeDeployCrew(this)) { this.state = 'deploy'; this.brake(dt); return; }
      this.deployCd = 4;
    }
    let ax, az, pit = false;
    if (known && this.seen && d < 95) {
      const lead = clamp(d / 28, 0, 1.1); ax = tx + _aiPvel[0] * lead; az = tz + _aiPvel[1] * lead; this.path.length = 0; this.searchNode = null;
      // PIT: line up on the suspect's rear quarter and tap it
      if (pc && wanted.stars >= 2 && tsp > 8 && d < 18 && this.pitCd <= 0) {
        const pf = [Math.sin(pc.h), Math.cos(pc.h)], pr = [Math.cos(pc.h), -Math.sin(pc.h)];
        const rel = [c.x - pc.x, c.z - pc.z], along = rel[0] * pf[0] + rel[1] * pf[1], lat = rel[0] * pr[0] + rel[1] * pr[1];
        const side = lat >= 0 ? 1 : -1;
        if (along < 2 && along > -pc.T.L * 2.2) {
          pit = true;
          const close = Math.abs(lat) < 3.2 && along > -pc.T.L * 1.2;
          const back = close ? pc.T.L * 0.42 : pc.T.L * 0.6, sideOff = close ? 0.2 : pc.T.W * 1.05;
          ax = pc.x - pf[0] * back + pr[0] * side * sideOff + _aiPvel[0] * 0.25; az = pc.z - pf[1] * back + pr[1] * side * sideOff + _aiPvel[1] * 0.25;
          if (close) this.tryPit(pc, side);
        }
      }
      // cut-off: the second unit heads for the suspect's next intersection
      if (this.role === 'cutoff' && pc && tsp > 9 && d > 30 && !pit) {
        const node = this.cutNode(pc);
        if (node) { this.goal = node; }
      }
    } else if (!known && Math.hypot(wanted.lastX - c.x, wanted.lastZ - c.z) < 16) {
      // reached the last known position: search nearby intersections
      if (!this.searchNode || Math.hypot(roadC(this.searchNode[0]) - c.x, roadC(this.searchNode[1]) - c.z) < 12) {
        const n0 = nearestNode(wanted.lastX, wanted.lastZ);
        this.searchNode = [clamp(n0[0] + Math.floor(rr(-2, 3)), 0, CITY.N), clamp(n0[1] + Math.floor(rr(-2, 3)), 0, CITY.N)];
        this.path.length = 0;
      }
    }
    if (this.goal) {
      const gx = roadC(this.goal[0]), gz = roadC(this.goal[1]), gd = Math.hypot(gx - c.x, gz - c.z);
      const pd = Math.hypot(gx - player.x, gz - player.z);
      const passed = pc && ((gx - player.x) * _aiPvel[0] + (gz - player.z) * _aiPvel[1]) < 0;
      if (passed || !pc || this.waitT > 7) { this.goal = null; this.waitT = 0; }
      else if (gd < 9) { this.waitT += dt; this.brake(dt); if (pd < 14) { this.goal = null; this.waitT = 0; } return; }
      else { const path = bfsPath(nearestNode(c.x, c.z), this.goal); const nx = path.length ? path[0] : this.goal; ax = roadC(nx[0]); az = roadC(nx[1]); if (path.length > 1 && Math.hypot(ax - c.x, az - c.z) < 11) { ax = roadC(path[1][0]); az = roadC(path[1][1]); } }
    }
    if (ax === undefined) {
      this.repath -= dt;
      const goalNode = this.searchNode || nearestNode(tx, tz);
      if (this.repath <= 0 || !this.path.length) { this.repath = 1.2; this.path = bfsPath(nearestNode(c.x, c.z), goalNode); }
      while (this.path.length > 1 && Math.hypot(roadC(this.path[0][0]) - c.x, roadC(this.path[0][1]) - c.z) < 11) this.path.shift();
      if (this.path.length) { ax = roadC(this.path[0][0]); az = roadC(this.path[0][1]); } else { ax = tx; az = tz; }
    }
    const want = Math.atan2(ax - c.x, az - c.z);
    const diff = wrapA(want - c.h);
    let steer = clamp(-diff * 2.4, -1, 1), thr = 1, brk = 0, hand = false;
    const sp = c.vf;
    if (!known && this.searchNode) thr = 0.55;
    // heavier cars corner late: brake before sharp turns
    if (Math.abs(diff) > 0.9 && sp > 13) { thr = 0.15; brk = 0.75; }
    if (Math.abs(diff) > 1.5 && sp > 9) hand = true;
    if (known && this.seen && !pit && d < 14 + Math.max(0, sp) * 1.1 && (player.mode === 'foot' || tsp < 3)) {
      // 3+ stars: one unit rams a stopped car instead of parking next to it
      const ram = pc && wanted.stars >= 3 && this.role !== 'van' && !this.crew.length && this.ramT === undefined && Math.random() < 0.004;
      if (ram) this.ramT = 2.2;
      if (this.ramT > 0) { this.ramT -= dt; thr = 1; brk = 0; } else { thr = d > 9 ? 0.3 : 0; brk = sp > (d > 9 ? 6 : 1.5) ? 1 : 0; }
    }
    if (this.revT > 0) { this.revT -= dt; thr = 0; brk = 1; steer = -steer; }
    else if (thr > 0.5 && Math.abs(sp) < 1.5) { this.stuckT += dt; if (this.stuckT > 1.1) { this.revT = 1.2; this.stuckT = 0; } }
    else this.stuckT = Math.max(0, this.stuckT - dt);
    c.physics({ throttle: thr, brake: brk, steer, hand, nitro: wanted.stars >= 3 && d > 55 && Math.abs(diff) < 0.3 }, dt);
  }
  // spin the suspect when the nose touches the rear quarter
  tryPit(pc, side) {
    const fx = Math.sin(this.car.h), fz = Math.cos(this.car.h), nx = this.car.x + fx * this.car.T.L * 0.45, nz = this.car.z + fz * this.car.T.L * 0.45;
    const rx = pc.x - Math.sin(pc.h) * pc.T.L * 0.35, rz = pc.z - Math.cos(pc.h) * pc.T.L * 0.35;
    if (Math.hypot(nx - rx, nz - rz) > pc.T.W * 0.5 + 0.9) return;
    this.pitCd = rr(5, 8);
    POLICE_PIT.car = pc; POLICE_PIT.rate = side * rr(2.4, 3.2); POLICE_PIT.t = 0.42;
    pc.damage(6, this.car); sparks((nx + rx) / 2, pc.y + 0.6, (nz + rz) / 2, 14); AUD.crash(9); shakeCam(0.45);
    if (typeof HUD !== 'undefined' && HUD.toast) HUD.toast('Полиция идёт на таран!', 'warn');
  }
  // the suspect's next intersection, if this unit can get there first
  cutNode(pc) {
    const vx = pc.vx, vz = pc.vz, sp = Math.hypot(vx, vz) || 1;
    let ni, nj;
    if (Math.abs(vx) > Math.abs(vz)) { const f = (pc.x + CITY.HALF) / CITY.P; ni = vx > 0 ? Math.ceil(f + 0.2) : Math.floor(f - 0.2); nj = Math.round((pc.z + CITY.HALF) / CITY.P); }
    else { const f = (pc.z + CITY.HALF) / CITY.P; nj = vz > 0 ? Math.ceil(f + 0.2) : Math.floor(f - 0.2); ni = Math.round((pc.x + CITY.HALF) / CITY.P); }
    if (ni < 0 || nj < 0 || ni > CITY.N || nj > CITY.N) return null;
    const gx = roadC(ni), gz = roadC(nj), tp = Math.hypot(gx - pc.x, gz - pc.z) / sp;
    const tu = (Math.abs(gx - this.car.x) + Math.abs(gz - this.car.z)) / 34;
    return tu < tp + 0.8 ? [ni, nj] : null;
  }
}
// PIT spin applied to the suspect's car over a few frames
const POLICE_PIT = { car: null, rate: 0, t: 0 };
function policeUpdatePit(dt) {
  if (!POLICE_PIT.car || POLICE_PIT.t <= 0) return;
  const c = POLICE_PIT.car; POLICE_PIT.t -= dt;
  if (c !== player.car || c.dead) { POLICE_PIT.t = 0; return; }
  c.h += POLICE_PIT.rate * dt;
  const k = Math.exp(-1.6 * dt); c.vx *= k; c.vz *= k;
}
function spawnPolice(role) {
  for (let tries = 0; tries < 12; tries++) {
    const i = Math.floor(Math.random() * NODES), j = Math.floor(Math.random() * NODES);
    const x = roadC(i), z = roadC(j), d = Math.hypot(x - player.x, z - player.z);
    if (d < 80 || d > 175) continue;
    if (d < 130 && inView(x, z)) continue;
    let clear = true;
    for (const c of cars) if (Math.abs(c.x - x) < 9 && Math.abs(c.z - z) < 9) { clear = false; break; }
    if (!clear) continue;
    const van = role === 'van' && typeof lifeSquadType === 'function' ? lifeSquadType() : null;
    const car = new Car(van || 'police', van === 'van' ? '#1f2430' : undefined);
    if (van && typeof lifeDressSwat === 'function') lifeDressSwat(car);
    car.place(x, z, Math.atan2(player.x - x, player.z - z));
    const unit = new PoliceAI(car, van ? 'van' : role || 'chase');
    police.push(unit);
    return unit;
  }
  return null;
}
function addCrime(amount, why) {
  if (GAME.state !== 'play' || player.dead || GAME.cheats.noPolice) return;
  EV.emit('crime', { amount, why });
  const prev = wanted.stars;
  wanted.heat = Math.min(5.99, wanted.heat + amount);
  wanted.stars = Math.floor(wanted.heat);
  if (wanted.stars > prev) { wanted.unseen = 0; if (prev === 0) policeSpot(); HUD.toast(why || 'Полиция ищет тебя', 'warn'); AUD.alarm(); }
}
function setWanted(n) { if (wanted.stars < n) { const first = wanted.stars === 0; wanted.heat = n + 0.05; wanted.stars = n; wanted.unseen = 0; if (first) policeSpot(); AUD.alarm(); } }
function clearWanted() {
  wanted.heat = 0; wanted.stars = 0; wanted.unseen = 0; wanted.bustT = 0; wanted.copNear = false;
  for (const p of police) p.mode = 'leave';
  if (typeof policeStandDown === 'function') policeStandDown();
}
function updateWanted(dt) {
  policeUpdatePit(dt);
  if (wanted.stars > 0 && !player.dead) {
    const S = wanted.stars, low = qualityName === 'low';
    const need = Math.max(1, [0, 2, 3, 4, 5, 5][S] - (low && S > 2 ? 1 : 0));
    let active = 0, near = false, cutoff = 0;
    for (const p of police) {
      if (p.mode === 'leave' || p.car.wrecked || p.static || p.heli) continue;
      active++;
      if (p.role === 'cutoff') cutoff++;
      const d = Math.hypot(p.car.x - player.x, p.car.z - player.z);
      // a patrol car parked next to a slow suspect arrests at 1-2 stars; from 3 stars an officer has to get there
      if (d < 7.5 && p.car.speed < 4 && S <= 2 && !p.crew.length) near = true;
    }
    if (active < need) spawnPolice(S >= 2 && cutoff === 0 && active >= 1 ? 'cutoff' : 'chase');
    if (typeof policeExtras === 'function') policeExtras(dt);
    if (wanted.copNear) near = true;
    const seen = GAME.time - wanted.seenAt < 0.4;
    if (seen) wanted.unseen = 0; else wanted.unseen += dt;
    wanted.flash = wanted.unseen > 1.5;
    const limit = 7 + S * 3;
    if (wanted.unseen > limit) { clearWanted(); HUD.toast('Ты оторвался от полиции'); AUD.chime(); }
    const slow = player.mode === 'foot' ? Math.hypot(player.vx, player.vz) < 2.2 : (player.car && player.car.speed < 2);
    if (near && slow) wanted.bustT += dt; else wanted.bustT = Math.max(0, wanted.bustT - dt * 2);
    if (wanted.bustT > (player.mode === 'foot' ? 2.2 : 3.4)) { wanted.bustT = 0; bustPlayer(); }
  } else { wanted.flash = false; if (typeof policeExtras === 'function') policeExtras(dt); }
  for (const p of police) if (p.car !== player.car) p.update(dt);
  for (let i = police.length - 1; i >= 0; i--) {
    const p = police[i], c = p.car, d = Math.hypot(c.x - player.x, c.z - player.z);
    if (c === player.car) { police.splice(i, 1); c.driver = 'player'; c.ai = null; if (typeof policeUnitLost === 'function') policeUnitLost(p); continue; }
    if (!p.heli && !c.dead && p.seats <= 0 && !p.static && (!p.crew || !p.crew.length) && p.state === 'deploy') {
      // the whole crew is down: the car is left empty
      police.splice(i, 1); c.ai = null; c.abandoned = true; new ParkedAI(c); continue;
    }
    if (c.dead || d > 330 || ((p.mode === 'leave' || c.wrecked) && d > 110 && !inView(c.x, c.z))) { if (!c.dead) c.remove(); police.splice(i, 1); if (typeof policeUnitLost === 'function') policeUnitLost(p); }
  }
}
