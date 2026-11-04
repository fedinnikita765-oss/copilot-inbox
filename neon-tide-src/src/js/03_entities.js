// ============================================================
//  Cars and people
// ============================================================
const CAR_TYPES = {
  coupe: { L: 4.3, W: 1.9, H: 0.92, cab: [0.40, 0.78], cabH: 0.44, rin: 0.22, fin: 0.38, wr: 0.34, maxV: 60, acc: 17, grip: 8.5 },
  sedan: { L: 4.7, W: 1.92, H: 1.0, cab: [0.26, 0.72], cabH: 0.5, rin: 0.2, fin: 0.3, wr: 0.35, maxV: 50, acc: 13, grip: 9 },
  suv: { L: 4.8, W: 2.05, H: 1.22, cab: [0.14, 0.74], cabH: 0.62, rin: 0.05, fin: 0.22, wr: 0.42, maxV: 46, acc: 12, grip: 8 },
  muscle: { L: 4.9, W: 1.98, H: 0.98, cab: [0.30, 0.64], cabH: 0.46, rin: 0.26, fin: 0.3, wr: 0.37, maxV: 58, acc: 16, grip: 7.6 },
};
CAR_TYPES.taxi = Object.assign({}, CAR_TYPES.sedan, { shape: 'sedan', taxi: true });
CAR_TYPES.police = Object.assign({}, CAR_TYPES.sedan, { shape: 'sedan', police: true, maxV: 57, acc: 16.5, grip: 9.5 });
const CAR_COLORS = ['#d7263d', '#f46036', '#2e294e', '#1b998b', '#c5d86d', '#e8e8e8', '#1f1f22', '#3a86ff', '#8338ec', '#ffbe0b', '#ff006e', '#a0a4a8', '#5f0f40', '#0f4c5c', '#f2efe9', '#7c1d1d', '#40c9a2'];

const CARGEO = {};
const CARMAT = {};
const WHEEL = {};
let blobMat = null, blobGeo = null;
function initCarAssets() {
  CARMAT.glass = new THREE.MeshStandardMaterial({ color: 0x0e161f, metalness: 0.9, roughness: 0.06 });
  CARMAT.tire = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.92 });
  CARMAT.rim = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 0.9, roughness: 0.25 });
  CARMAT.trim = new THREE.MeshStandardMaterial({ color: 0x18181c, roughness: 0.55, metalness: 0.3 });
  CARMAT.head = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: new THREE.Color('#fff4d6'), emissiveIntensity: 0.3, roughness: 0.2 });
  CARMAT.tail = new THREE.MeshStandardMaterial({ color: 0x4a0000, emissive: new THREE.Color('#ff1020'), emissiveIntensity: 0.25, roughness: 0.3 });
  CARMAT.brake = new THREE.MeshStandardMaterial({ color: 0x880000, emissive: new THREE.Color('#ff1020'), emissiveIntensity: 2.4, roughness: 0.3 });
  CARMAT.burnt = new THREE.MeshStandardMaterial({ color: 0x1b1918, roughness: 0.95 });
  CARMAT.police = new THREE.MeshStandardMaterial({ map: TEX.police, roughness: 0.4, metalness: 0.15 });
  CARMAT.taxi = new THREE.MeshStandardMaterial({ map: TEX.taxi, emissive: new THREE.Color('#ffffff'), emissiveMap: TEX.taxi, emissiveIntensity: 0.25, roughness: 0.4 });
  CARMAT.lbRed = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: new THREE.Color('#ff2030'), emissiveIntensity: 1.2 });
  CARMAT.lbBlue = new THREE.MeshStandardMaterial({ color: 0x000055, emissive: new THREE.Color('#2050ff'), emissiveIntensity: 1.2 });
  WHEEL.tire = new THREE.CylinderGeometry(1, 1, 1, 20); WHEEL.tire.rotateZ(Math.PI / 2);
  WHEEL.rim = new THREE.CylinderGeometry(1, 1, 1, 10); WHEEL.rim.rotateZ(Math.PI / 2);
  blobMat = new THREE.MeshBasicMaterial({ map: TEX.blob, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  blobGeo = new THREE.PlaneGeometry(1, 1); blobGeo.rotateX(-Math.PI / 2);
}
const paintCache = {};
function paint(hex) {
  if (!paintCache[hex]) paintCache[hex] = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(hex), metalness: 0.45, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.07 });
  return paintCache[hex];
}
function carGeo(key) {
  if (CARGEO[key]) return CARGEO[key];
  const T = CAR_TYPES[key];
  const L = T.L, W = T.W, c = 0.3, top = T.H, r = T.wr + 0.08, wy = T.wr + 0.02;
  const wf = L / 2 - L * 0.18, wb = -L / 2 + L * 0.19;
  const s = new THREE.Shape();
  s.moveTo(-L / 2 + 0.2, c);
  s.lineTo(wb - r, c); s.absarc(wb, wy, r, Math.PI, 0, true);
  s.lineTo(wf - r, c); s.absarc(wf, wy, r, Math.PI, 0, true);
  s.lineTo(L / 2 - 0.2, c);
  s.quadraticCurveTo(L / 2, c, L / 2, c + 0.2);
  s.lineTo(L / 2, top - 0.24);
  s.quadraticCurveTo(L / 2 - 0.02, top - 0.04, L / 2 - 0.42, top);
  s.lineTo(-L / 2 + 0.36, top + 0.02);
  s.quadraticCurveTo(-L / 2, top, -L / 2, top - 0.24);
  s.lineTo(-L / 2, c + 0.2);
  s.quadraticCurveTo(-L / 2, c, -L / 2 + 0.2, c);
  const bw = W - 0.16;
  const body = new THREE.ExtrudeGeometry(s, { depth: bw, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.07, bevelSegments: 3, curveSegments: 10 });
  body.translate(0, 0, -bw / 2); body.rotateY(-Math.PI / 2);
  const x0 = -L / 2 + L * T.cab[0], x1 = -L / 2 + L * T.cab[1], cl = x1 - x0, ct = top + 0.02;
  const cs = new THREE.Shape();
  cs.moveTo(x0, ct - 0.05); cs.lineTo(x1, ct - 0.05); cs.lineTo(x1 - cl * T.fin, ct + T.cabH); cs.lineTo(x0 + cl * T.rin, ct + T.cabH); cs.lineTo(x0, ct - 0.05);
  const cw = W - 0.42;
  const cabin = new THREE.ExtrudeGeometry(cs, { depth: cw, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 2, curveSegments: 4 });
  cabin.translate(0, 0, -cw / 2); cabin.rotateY(-Math.PI / 2);
  const ra = x0 + cl * T.rin, rb = x1 - cl * T.fin, rl = rb - ra + 0.14;
  const roof = new THREE.BoxGeometry(cw + 0.12, 0.08, rl); roof.translate(0, ct + T.cabH + 0.05, (ra + rb) / 2);
  const pillar = new THREE.BoxGeometry(cw + 0.13, T.cabH * 0.95, 0.13); pillar.translate(0, ct + T.cabH * 0.5, lerp(ra, rb, 0.42));
  const grille = new THREE.BoxGeometry(W * 0.86, 0.22, 0.12); grille.translate(0, c + 0.24, L / 2 + 0.07);
  const rear = new THREE.BoxGeometry(W * 0.9, 0.2, 0.12); rear.translate(0, c + 0.22, -L / 2 - 0.07);
  const hl = []; const tl = [];
  for (const sx of [-1, 1]) {
    const h = new THREE.BoxGeometry(0.44, 0.13, 0.1); h.translate(sx * (W / 2 - 0.37), top - 0.2, L / 2 + 0.055); hl.push(h);
    const t = new THREE.BoxGeometry(0.48, 0.12, 0.1); t.translate(sx * (W / 2 - 0.34), top - 0.17, -L / 2 - 0.055); tl.push(t);
  }
  const G = { body, cabin, roof, pillar, grille, rear, heads: mergeGeos(hl), tails: mergeGeos(tl), wf, wb, top, ct };
  CARGEO[key] = G;
  return G;
}

const cars = [];
let GAMEHOOK = { carHit: null, explosion: null };
class Car {
  constructor(type, color) {
    this.type = type;
    const T = this.T = CAR_TYPES[type];
    const G = this.G = carGeo(T.shape || type);
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.color = color || (T.taxi ? '#ffc81f' : T.police ? '#15213f' : rpick(CAR_COLORS));
    this.paintMat = paint(this.color);
    const add = (geo, mat, cast) => { const m = new THREE.Mesh(geo, mat); m.castShadow = !!cast; this.body.add(m); return m; };
    this.bodyMesh = add(G.body, this.paintMat, true);
    this.cabMesh = add(G.cabin, CARMAT.glass, true);
    this.roofMesh = add(G.roof, T.police ? paint('#f2f4f8') : this.paintMat, false);
    this.pillarMesh = add(G.pillar, this.paintMat, false);
    add(G.grille, CARMAT.trim, false); add(G.rear, CARMAT.trim, false);
    this.heads = add(G.heads, CARMAT.head, false);
    this.tails = add(G.tails, CARMAT.tail, false);
    if (T.police) {
      for (const sx of [-1, 1]) {
        const d = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.42), CARMAT.police);
        d.rotation.y = sx * Math.PI / 2; d.position.set(sx * (T.W / 2 + 0.005), 0.7, -0.1); this.body.add(d);
      }
      const lr = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.13, 0.28), CARMAT.lbRed); lr.position.set(0.3, G.ct + T.cabH + 0.15, -0.1);
      const lb = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.13, 0.28), CARMAT.lbBlue); lb.position.set(-0.3, G.ct + T.cabH + 0.15, -0.1);
      this.body.add(lr, lb);
    }
    if (T.taxi) {
      const sgn = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.26, 0.32), CARMAT.taxi); sgn.position.set(0, G.ct + T.cabH + 0.2, -0.1); this.body.add(sgn);
    }
    this.wheels = [];
    for (const [sx, sz, front] of [[1, G.wf, true], [-1, G.wf, true], [1, G.wb, false], [-1, G.wb, false]]) {
      const steer = new THREE.Group(); steer.position.set(sx * (T.W / 2 - 0.16), T.wr, sz);
      const spin = new THREE.Group(); steer.add(spin);
      const tire = new THREE.Mesh(WHEEL.tire, CARMAT.tire); tire.scale.set(0.26, T.wr, T.wr); tire.castShadow = true; spin.add(tire);
      const rim = new THREE.Mesh(WHEEL.rim, CARMAT.rim); rim.scale.set(0.27, T.wr * 0.6, T.wr * 0.6); spin.add(rim);
      this.root.add(steer); this.wheels.push({ steer, spin, front });
    }
    this.blob = new THREE.Mesh(blobGeo, blobMat); this.blob.scale.set(T.W + 1.0, 1, T.L + 1.0); this.blob.position.y = 0.04; this.blob.renderOrder = 1;
    this.root.add(this.blob);
    this.x = 0; this.z = 0; this.y = 0; this.h = 0; this.vx = 0; this.vz = 0; this.vf = 0;
    this.yawRate = 0; this.steer = 0; this.health = 100; this.wrecked = false; this.burnT = 0; this.exploded = false;
    this.driver = null; this.ai = null; this.kinematic = false; this.braking = false; this.drift = 0; this.wheelRot = 0;
    this.pitch = 0; this.roll = 0; this.prevVf = 0; this.accF = 0; this.accS = 0; this.nitro = 1; this.lastHit = -9; this.fxT = 0;
    this.mission = false; this.dead = false;
    scene.add(this.root);
    cars.push(this);
  }
  place(x, z, h) { this.x = x; this.z = z; this.h = h; this.y = groundH(x, z); this.vx = this.vz = 0; this.sync(0.016); }
  get speed() { return Math.hypot(this.vx, this.vz); }
  physics(inp, dt) {
    const T = this.T;
    const fx = Math.sin(this.h), fz = Math.cos(this.h), rx = -fz, rz = fx;
    let vf = this.vx * fx + this.vz * fz, vs = this.vx * rx + this.vz * rz;
    const alive = !this.wrecked;
    const thr = alive ? inp.throttle : 0, brk = inp.brake, hand = !!inp.hand;
    const nitro = alive && inp.nitro && this.nitro > 0.02 && thr > 0;
    const maxV = T.maxV * (nitro ? 1.22 : 1);
    if (thr > 0) {
      if (vf < -0.5) vf += thr * 20 * dt;
      else vf += thr * T.acc * (nitro ? 1.75 : 1) * Math.max(0.1, 1 - vf / maxV) * dt;
    }
    if (brk > 0) {
      if (vf > 0.5) vf -= brk * 26 * dt;
      else if (alive && vf > -14) vf -= brk * T.acc * 0.6 * dt;
    }
    if (thr === 0 && brk === 0) vf -= Math.sign(vf) * Math.min(Math.abs(vf), (1.4 + Math.abs(vf) * 0.022) * dt);
    else vf -= vf * Math.abs(vf) * 0.0011 * dt;
    if (hand) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 6.5 * dt);
    this.braking = (brk > 0 && vf > 0.5) || (hand && Math.abs(vf) > 1);
    const sf = clamp(1 - Math.abs(vf) / 80, 0.3, 1);
    this.steer = damp(this.steer, (alive ? inp.steer : 0) * 0.62 * sf, 9, dt);
    const wb = T.L * 0.62;
    let yawT = vf * Math.tan(this.steer) / wb;
    if (hand) yawT *= 1.5;
    this.yawRate = damp(this.yawRate, yawT, hand ? 3.2 : 7, dt);
    this.h -= this.yawRate * dt;
    const grip = hand ? 1.0 : T.grip * (Math.abs(vs) > 6 ? 0.5 : 1);
    vs *= Math.exp(-grip * dt);
    this.drift = Math.abs(vs);
    this.vx = fx * vf + rx * vs; this.vz = fz * vf + rz * vs;
    this.x += this.vx * dt; this.z += this.vz * dt;
    this.accF = damp(this.accF, (vf - this.prevVf) / Math.max(dt, 1e-3), 8, dt); this.prevVf = vf;
    this.accS = this.yawRate * vf;
    this.vf = vf;
    if (nitro) this.nitro = Math.max(0, this.nitro - dt * 0.22); else this.nitro = Math.min(1, this.nitro + dt * 0.035);
    this.usingNitro = nitro;
    this.wheelRot += vf / T.wr * dt;
    this.collide();
    this.y = damp(this.y, groundH(this.x, this.z), 14, dt);
  }
  collide() {
    const T = this.T, fx = Math.sin(this.h), fz = Math.cos(this.h), r = T.W * 0.5, o0 = T.L * 0.5 - r;
    let impact = 0, ix = 0, iz = 0, inx = 0, inz = 0;
    for (let k = -1; k <= 1; k++) {
      const o = k * o0, cx = this.x + fx * o, cz = this.z + fz * o;
      const hit = collideCircle(cx, cz, r, this.y + 0.35);
      if (!hit.hit) continue;
      this.x += hit.x - cx; this.z += hit.z - cz;
      const nx = hit.nx, nz = hit.nz, vn = this.vx * nx + this.vz * nz;
      if (vn < 0) {
        this.vx -= 1.3 * vn * nx; this.vz -= 1.3 * vn * nz;
        this.vx *= 0.985; this.vz *= 0.985;
        const jx = -vn * nx, jz = -vn * nz;
        this.yawRate += ((fx * o) * jz - (fz * o) * jx) * 0.1;
        if (-vn > impact) { impact = -vn; ix = cx + fx * 0; iz = cz; inx = nx; inz = nz; }
      }
    }
    if (impact > 2.5) this.onImpact(impact, ix - inx * r, iz - inz * r, null);
  }
  onImpact(sp, px, pz, other) {
    let k = this.T.police ? 1.5 : 2.3;
    if (this.driver === 'player' && other && other.driver === 'police') k = 1.0;
    if (sp > 4.5) this.damage((sp - 4.5) * k, other);
    const now = performance.now() / 1000;
    if (now - this.lastHit > 0.25) {
      this.lastHit = now;
      sparks(px, this.y + 0.6, pz, Math.min(28, 4 + sp * 1.5));
      if (GAMEHOOK.carHit) GAMEHOOK.carHit(this, other, sp, px, pz);
    }
  }
  damage(d, src) {
    if (this.exploded) return;
    this.health -= d;
    if (this.health <= 0 && !this.wrecked) { this.wrecked = true; this.burnT = 4.5; this.health = 0; }
  }
  explode() {
    if (this.exploded) return;
    this.exploded = true; this.wrecked = true; this.health = 0;
    this.bodyMesh.material = CARMAT.burnt; this.roofMesh.material = CARMAT.burnt; this.pillarMesh.material = CARMAT.burnt;
    this.vy = 6; this.vx *= 0.3; this.vz *= 0.3;
    explosionFx(this.x, this.y, this.z);
    for (const c of cars) {
      if (c === this) continue;
      const d = Math.hypot(c.x - this.x, c.z - this.z);
      if (d < 8) { c.damage(55 * (1 - d / 8)); if (c.kinematic) c.makeDynamic(); const k = (8 - d) * 1.2 / (d || 1); c.vx += (c.x - this.x) * k; c.vz += (c.z - this.z) * k; }
    }
    if (GAMEHOOK.explosion) GAMEHOOK.explosion(this.x, this.z, this);
  }
  makeDynamic() {
    if (!this.kinematic) return;
    this.kinematic = false;
    if (this.ai) { this.ai.release(); this.ai = null; }
    if (this.driver === 'ai') this.driver = 'npc';
  }
  update(dt) {
    // fire, smoke, explosion timers for damaged cars
    this.fxT -= dt;
    if (this.fxT <= 0) {
      this.fxT = 0.08;
      const fx = Math.sin(this.h), fz = Math.cos(this.h), hx = this.x + fx * this.T.L * 0.35, hz = this.z + fz * this.T.L * 0.35;
      if (this.exploded) { if (Math.random() < 0.5) puffSmoke(this.x, this.y + 1.2, this.z, 1, true, 0.4); }
      else if (this.wrecked) {
        for (let i = 0; i < 3; i++) fireFx.emit(hx + rr(-0.5, 0.5), this.y + 1.0, hz + rr(-0.5, 0.5), rr(-0.4, 0.4), rr(1.5, 3), rr(-0.4, 0.4), rr(0.4, 0.8), rr(0.8, 1.2), 0.2, 2.0, 0.9, 0.25, 1, 0.9, 0.12, 0.02, 0.5, -1);
        puffSmoke(hx, this.y + 1.5, hz, 1, true, 0.5);
      } else if (this.health < 35) puffSmoke(hx, this.y + 1.0, hz, 1, this.health < 18, 0.3);
    }
    if (this.wrecked && !this.exploded) { this.burnT -= dt; if (this.burnT <= 0) this.explode(); }
    if (this.exploded && this.vy !== undefined) {
      this.y += this.vy * dt; this.vy -= 18 * dt;
      const g = groundH(this.x, this.z); if (this.y < g) { this.y = g; this.vy = this.vy < -3 ? -this.vy * 0.25 : 0; }
    }
  }
  sync(dt) {
    this.root.position.set(this.x, this.y, this.z);
    this.root.rotation.y = this.h;
    const tp = clamp(-this.accF * 0.006, -0.07, 0.07), tr = clamp(-this.accS * 0.0042, -0.075, 0.075);
    this.pitch = damp(this.pitch, tp, 6, dt); this.roll = damp(this.roll, tr, 6, dt);
    this.body.rotation.set(this.pitch, 0, this.roll);
    for (const w of this.wheels) { w.spin.rotation.x = this.wheelRot; if (w.front) w.steer.rotation.y = -this.steer; }
    this.tails.material = this.braking ? CARMAT.brake : CARMAT.tail;
  }
  remove() {
    scene.remove(this.root);
    this.dead = true;
    if (this.ai) { this.ai.release(); this.ai = null; }
    const i = cars.indexOf(this); if (i >= 0) cars.splice(i, 1);
  }
}

// car vs car
const CA = new Float32Array(6), CB = new Float32Array(6);
function carCircles(c, out) {
  const fx = Math.sin(c.h), fz = Math.cos(c.h), r = c.T.W * 0.5, o = c.T.L * 0.5 - r;
  out[0] = c.x + fx * o; out[1] = c.z + fz * o; out[2] = c.x; out[3] = c.z; out[4] = c.x - fx * o; out[5] = c.z - fz * o;
  return r;
}
function resolveCarPair(a, b) {
  const ra = carCircles(a, CA), rb = carCircles(b, CB), rs = ra + rb;
  let best = 0, nx = 0, nz = 0, px = 0, pz = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const dx = CB[j * 2] - CA[i * 2], dz = CB[j * 2 + 1] - CA[i * 2 + 1], d2 = dx * dx + dz * dz;
    if (d2 < rs * rs) {
      const d = Math.sqrt(d2) || 0.01, pen = rs - d;
      if (pen > best) { best = pen; nx = dx / d; nz = dz / d; px = (CA[i * 2] + CB[j * 2]) / 2; pz = (CA[i * 2 + 1] + CB[j * 2 + 1]) / 2; }
    }
  }
  if (best <= 0) return;
  const rel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
  const strong = rel < -1.5 || best > 0.6;
  if (a.kinematic && b.kinematic) return;
  if (a.kinematic && strong && !b.kinematic) a.makeDynamic();
  if (b.kinematic && strong && !a.kinematic) b.makeDynamic();
  const ma = a.kinematic ? 0 : 1, mb = b.kinematic ? 0 : 1;
  if (ma + mb === 0) return;
  const ka = ma / (ma + mb), kb = mb / (ma + mb);
  a.x -= nx * best * ka; a.z -= nz * best * ka; b.x += nx * best * kb; b.z += nz * best * kb;
  if (rel < 0) {
    const j = -(1.25) * rel / (ma + mb);
    a.vx -= j * ma * nx; a.vz -= j * ma * nz; b.vx += j * mb * nx; b.vz += j * mb * nz;
    if (-rel > 2.5) { a.onImpact(-rel, px, pz, b); b.onImpact(-rel, px, pz, a); }
  }
}
function carCarCollisions() {
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j], dx = b.x - a.x, dz = b.z - a.z, m = (a.T.L + b.T.L) * 0.5;
      if (dx * dx + dz * dz < m * m) resolveCarPair(a, b);
    }
  }
}

