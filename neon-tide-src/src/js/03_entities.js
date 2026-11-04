// ============================================================
//  Cars: types, materials, the Car class (physics, suspension, damage, interior), car-vs-car collisions
//  (owner: models & driving). Models are built in 03d_carmodel.js / 03d_carbuild.js.
// ============================================================
// H: reference height for lamp glows (headlights at H - 0.2), H + cabH: roof (set from the model).
// grip: tyre friction in g; mass in tonnes; gears: top speed fraction of each gear; rl: redline rpm.
const CAR_TYPES = {
  coupe: { L: 4.35, W: 1.88, H: 0.8, cabH: 0.58, wr: 0.34, tw: 0.26, maxV: 60, acc: 17, grip: 2.3, mass: 1.25, drive: 'rwd', gears: [0.27, 0.42, 0.57, 0.72, 0.86, 1], rl: 7600, idle: 850, engine: 'sport' },
  sedan: { L: 4.75, W: 1.92, H: 0.88, cabH: 0.64, wr: 0.35, tw: 0.24, maxV: 50, acc: 13, grip: 2.2, mass: 1.45, drive: 'fwd', gears: [0.28, 0.46, 0.64, 0.82, 1], rl: 6400, idle: 750, engine: 'four' },
  suv: { L: 4.85, W: 2.05, H: 1.1, cabH: 0.81, wr: 0.42, tw: 0.28, maxV: 46, acc: 12, grip: 2.0, mass: 1.95, drive: 'awd', gears: [0.26, 0.42, 0.58, 0.74, 0.88, 1], rl: 6000, idle: 700, engine: 'six' },
  muscle: { L: 4.95, W: 1.98, H: 0.92, cabH: 0.5, wr: 0.37, tw: 0.28, maxV: 58, acc: 16, grip: 2.05, mass: 1.6, drive: 'rwd', gears: [0.32, 0.52, 0.74, 1], rl: 6200, idle: 700, engine: 'v8' },
  pickup: { L: 5.3, W: 2.04, H: 1.12, cabH: 0.8, wr: 0.42, tw: 0.3, maxV: 47, acc: 12.5, grip: 1.95, mass: 2.1, drive: 'rwd', gears: [0.27, 0.45, 0.63, 0.82, 1], rl: 4800, idle: 650, engine: 'diesel' },
  van: { L: 5.0, W: 2.0, H: 0.96, cabH: 1.34, wr: 0.38, tw: 0.25, maxV: 42, acc: 10.5, grip: 1.9, mass: 2.2, drive: 'fwd', gears: [0.28, 0.47, 0.66, 0.84, 1], rl: 4600, idle: 700, engine: 'diesel' },
  supercar: { L: 4.55, W: 2.04, H: 0.63, cabH: 0.56, wr: 0.36, tw: 0.32, maxV: 72, acc: 21, grip: 2.6, mass: 1.35, drive: 'awd', gears: [0.2, 0.32, 0.45, 0.58, 0.71, 0.85, 1], rl: 9000, idle: 1000, engine: 'super', rearEngine: true },
  bus: { L: 11.6, W: 2.55, H: 1.05, cabH: 2.04, wr: 0.52, tw: 0.32, maxV: 30, acc: 6.5, grip: 1.7, mass: 9, drive: 'rwd', gears: [0.3, 0.55, 0.8, 1], rl: 2600, idle: 600, engine: 'bus' },
};
CAR_TYPES.taxi = Object.assign({}, CAR_TYPES.sedan, { shape: 'sedan', taxi: true });
CAR_TYPES.police = Object.assign({}, CAR_TYPES.sedan, { shape: 'sedan', police: true, maxV: 57, acc: 16.5, grip: 2.4, drive: 'rwd', rl: 6800, engine: 'v8' });
const CAR_COLORS = ['#d7263d', '#f46036', '#2e294e', '#1b998b', '#c5d86d', '#e8e8e8', '#1f1f22', '#3a86ff', '#8338ec', '#ffbe0b', '#ff006e', '#a0a4a8', '#5f0f40', '#0f4c5c', '#f2efe9', '#7c1d1d', '#40c9a2'];
const CAR_COLORS_LIGHT = ['#f4f4f2', '#fff1c9', '#d9f2f0', '#e8e8e8', '#ffe1d1'];
// Weighted random type for spawners (traffic, parked cars). Others can call it behind a typeof guard.
const CAR_SPAWN_WEIGHTS = { sedan: 5, coupe: 3, suv: 3, muscle: 2, taxi: 2, pickup: 2, van: 2, supercar: 0.7 };
function pickCarType(weights) {
  const w = weights || CAR_SPAWN_WEIGHTS; let sum = 0;
  for (const k in w) sum += w[k];
  let r = Math.random() * sum;
  for (const k in w) { r -= w[k]; if (r <= 0) return k; }
  return 'sedan';
}

const CARGEO = {};
const CARMAT = {};
let blobMat = null, blobGeo = null;
function initCarAssets() {
  makeCarDetailAtlas();
  carPrepareShapes();
  const D = CAR_DET.tex, O = CAR_DET.orm;
  CARMAT.detail = new THREE.MeshStandardMaterial({ map: D, roughnessMap: O, metalnessMap: O, roughness: 1, metalness: 1, alphaTest: 0.5 });
  CARMAT.head = new THREE.MeshStandardMaterial({ map: D, emissive: new THREE.Color('#fff4d6'), emissiveMap: D, emissiveIntensity: 0.3, roughness: 0.12, metalness: 0.3 });
  CARMAT.tail = new THREE.MeshStandardMaterial({ map: D, emissive: new THREE.Color('#ff2030'), emissiveMap: D, emissiveIntensity: 0.25, roughness: 0.2 });
  CARMAT.brake = new THREE.MeshStandardMaterial({ map: D, emissive: new THREE.Color('#ff1020'), emissiveMap: D, emissiveIntensity: 2.6, roughness: 0.2 });
  CARMAT.headBroken = new THREE.MeshStandardMaterial({ map: D, color: 0x3a3f46, roughness: 0.6, metalness: 0.4 });
  CARMAT.tailBroken = new THREE.MeshStandardMaterial({ map: D, color: 0x3a1a1c, roughness: 0.6 });
  CARMAT.burnt = new THREE.MeshStandardMaterial({ map: CAR_ATLAS.tex, color: 0x1b1918, roughness: 0.95 });
  CARMAT.shell = new THREE.MeshStandardMaterial({ map: CAR_ATLAS.tex, color: 0x5a5651, emissive: new THREE.Color(0x24221f), emissiveMap: CAR_ATLAS.tex, roughness: 0.92, side: THREE.BackSide, alphaTest: 0.5 });
  CARMAT.interior = new THREE.MeshStandardMaterial({ map: D, roughness: 0.85, metalness: 0.05 });
  CARMAT.gauge = new THREE.MeshStandardMaterial({ map: D, emissive: new THREE.Color('#ffffff'), emissiveMap: D, emissiveIntensity: 0.5, roughness: 0.3 });
  CARMAT.needle = new THREE.MeshStandardMaterial({ color: 0xff3a2a, emissive: new THREE.Color('#ff3a2a'), emissiveIntensity: 1.2, roughness: 0.4 });
  CARMAT.police = CARMAT.detail;
  { const c = mkCanvas(256, 64), g = c.getContext('2d');
    g.fillStyle = '#ffd23f'; g.fillRect(0, 0, 256, 64);
    for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#141414' : '#ffd23f'; g.fillRect(i * 16, 0, 16, 8); g.fillStyle = i % 2 ? '#ffd23f' : '#141414'; g.fillRect(i * 16, 56, 16, 8); }
    g.fillStyle = '#141414'; g.font = `900 30px ${FONT_D}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('ТАКСИ', 128, 33, 236);
    const t = toTex(c, { wrap: false, aniso: 4 });
    CARMAT.taxi = new THREE.MeshStandardMaterial({ map: t, emissive: new THREE.Color('#ffffff'), emissiveMap: t, emissiveIntensity: 0.25, roughness: 0.4 }); }
  CARMAT.lbRed = new THREE.MeshStandardMaterial({ color: 0x660008, emissive: new THREE.Color('#ff2030'), emissiveIntensity: 1.2, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.92 });
  CARMAT.lbBlue = new THREE.MeshStandardMaterial({ color: 0x000a66, emissive: new THREE.Color('#2050ff'), emissiveIntensity: 1.2, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.92 });
  blobMat = new THREE.MeshBasicMaterial({ map: TEX.blob, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  blobGeo = new THREE.PlaneGeometry(1, 1); blobGeo.rotateX(-Math.PI / 2);
}
// Car paint: atlas colour × paint colour, glass from the atlas alpha. Cracked variants add procedural cracks on glass.
const paintCache = {};
function paint(hex, cracked) {
  const key = hex + (cracked ? '#c' : '');
  if (paintCache[key]) return paintCache[key];
  const m = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(hex), map: CAR_ATLAS.tex, roughnessMap: CAR_ATLAS.orm, metalnessMap: CAR_ATLAS.orm, clearcoatMap: CAR_ATLAS.orm,
    roughness: 0.6, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.06 });
  if (cracked) {
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      {
        vec4 tg = texture2D(map, vUv);
        if (tg.a < 0.5) {
          vec2 p = vec2(vUv.x * 64.0, vUv.y * 22.0); vec2 ip = floor(p), fp = fract(p); float d1 = 8.0, d2 = 8.0;
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec2 o = vec2(float(i), float(j)); vec2 r = o + fract(sin(vec2(dot(ip + o, vec2(127.1, 311.7)), dot(ip + o, vec2(269.5, 183.3)))) * 43758.5453) - fp;
            float d = dot(r, r); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
          }
          float e = 1.0 - smoothstep(0.0, 0.035, sqrt(d2) - sqrt(d1));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.55, 0.58), e * 0.6);
        }
      }`);
    };
    m.customProgramCacheKey = () => 'carCrack'; m.userData.cracked = true;
  }
  paintCache[key] = m;
  return m;
}
function carGeo(type) {
  if (CARGEO[type]) return CARGEO[type];
  const G = buildCarGeo(type);
  CAR_TYPES[type].cabH = G.roofY - CAR_TYPES[type].H;
  CARGEO[type] = G;
  return G;
}

const cars = [];
let GAMEHOOK = { carHit: null, explosion: null };
const CAR_GRAV = 21;
const _cmEyeV = new V3(), _cmCarQ = new THREE.Quaternion();
const CAR_SUSP = { k: 85, c: 7.5 };
class Car {
  constructor(type, color) {
    this.type = type;
    const T = this.T = CAR_TYPES[type];
    const G = this.G = carGeo(type);
    this.root = new THREE.Group(); this.root.rotation.order = 'YXZ';
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.color = color || (T.taxi ? '#ffc81f' : T.police ? '#f4f6fa' : type === 'bus' || type === 'van' ? rpick(CAR_COLORS_LIGHT) : rpick(CAR_COLORS));
    this.paintMat = paint(this.color);
    const add = (geo, mat, cast, parent) => { const m = new THREE.Mesh(geo, mat); m.castShadow = !!cast; (parent || this.body).add(m); return m; };
    this.bodyMesh = add(G.body, this.paintMat, true); this._mat = this.paintMat;
    // compatibility: older code repaints bodyMesh/roofMesh/pillarMesh; all three are the one body mesh now
    this.roofMesh = this.bodyMesh; this.pillarMesh = this.bodyMesh; this.cabMesh = this.bodyMesh;
    this.detailMesh = add(G.detail, CARMAT.detail, false);
    this.heads = add(G.heads, CARMAT.head, false);
    this.tails = add(G.tails, CARMAT.tail, false);
    // detail parts and lamps crumple with the body (shared influences)
    this.detailMesh.morphTargetInfluences = this.heads.morphTargetInfluences = this.tails.morphTargetInfluences = this.bodyMesh.morphTargetInfluences;
    if (G.lbR) { this.lbR = add(G.lbR, CARMAT.lbRed, false); this.lbB = add(G.lbB, CARMAT.lbBlue, false); add(G.lbBase, CARMAT.detail, false); }
    if (G.taxi) add(G.taxi, CARMAT.taxi, false);
    this.wheels = [];
    for (const [sx, sz, front] of [[1, G.wf, true], [-1, G.wf, true], [1, G.wb, false], [-1, G.wb, false]]) {
      const steer = new THREE.Group(); steer.position.set(sx * G.wx, T.wr, sz);
      const spin = new THREE.Group(); steer.add(spin);
      const m = new THREE.Mesh(G.wheel, CARMAT.detail); m.scale.x = sx; spin.add(m);
      this.root.add(steer); this.wheels.push({ steer, spin, front, sx });
    }
    this.blob = new THREE.Mesh(blobGeo, blobMat); this.blob.scale.set(T.W + 1.0, 1, T.L + 1.0); this.blob.position.y = 0.04; this.blob.renderOrder = 1;
    this.root.add(this.blob);
    this.x = 0; this.z = 0; this.y = 0; this.h = 0; this.vx = 0; this.vz = 0; this.vy = 0; this.vf = 0; this.vs = 0;
    this.yawRate = 0; this.steer = 0; this.health = 100; this.wrecked = false; this.burnT = 0; this.exploded = false;
    this.driver = null; this.ai = null; this.kinematic = false; this.braking = false; this.drift = 0; this.wheelRot = 0; this.rearRot = 0;
    this.pitch = 0; this.roll = 0; this.prevVf = 0; this.accF = 0; this.accS = 0; this.nitro = 1; this.lastHit = -9; this.fxT = 0;
    this.mission = false; this.dead = false;
    // drivetrain, suspension, air, damage
    this.gear = 1; this.rpm = T.idle; this.rpmK = 0; this.shiftT = 0; this.shiftEvt = 0; this.throttle = 0; this.slip = 0; this.spin = 0;
    this.air = false; this.airT = 0; this.tPitch = 0; this.tRoll = 0; this.aPitchV = 0; this.aRollV = 0; this.landImpact = 0; this.bump = 0;
    this.sp = { h: 0, hv: 0, p: 0, pv: 0, r: 0, rv: 0 }; this.droop = 0;
    this.dmg = { f: 0, r: 0, l: 0, rt: 0, top: 0 }; this.dmgLook = ''; this.lastHealth = 100; this.cracked = false;
    this.interior = null; this.interiorOn = false;
    scene.add(this.root);
    cars.push(this);
  }
  // ---------- first-person support ----------
  // Driver eye in world space, including suspension and terrain tilt.
  eyeWorld(out) {
    const e = this.G.eye;
    this.body.updateMatrix(); this.root.updateMatrix();
    return out.set(e[0], e[1], e[2]).applyMatrix4(this.body.matrix).applyMatrix4(this.root.matrix);
  }
  // Orientation of the cabin (root × body) for a camera that should tilt with the car.
  eyeQuat(out) { return (out || _cmCarQ).copy(this.root.quaternion).multiply(this.body.quaternion); }
  setInteriorVisible(on) {
    on = !!on;
    if (on && !this.interior) {
      const I = carBuildInterior(this.type, this.G), grp = new THREE.Group();
      const shell = new THREE.Mesh(this.G.body, CARMAT.shell); shell.morphTargetInfluences = this.bodyMesh.morphTargetInfluences;
      grp.add(shell, new THREE.Mesh(I.dash, CARMAT.interior), new THREE.Mesh(I.gauges, CARMAT.gauge));
      const col = new THREE.Group(); col.position.set(I.wheelPos[0], I.wheelPos[1], I.wheelPos[2]); col.rotation.x = I.wheelTilt;
      const wheel = new THREE.Mesh(I.wheel, CARMAT.interior); col.add(wheel); grp.add(col);
      const needle = (p) => { const pv = new THREE.Group(); pv.position.set(p[0], p[1], p[2]); pv.rotation.set(I.tilt, Math.PI, 0, 'YXZ'); const n = new THREE.Mesh(I.needle, CARMAT.needle); pv.add(n); grp.add(pv); return n; };
      this.interior = grp; this.intWheel = wheel; this.needleSpeed = needle(I.speed); this.needleTach = needle(I.tach);
      grp.visible = false; this.body.add(grp);
    }
    if (this.interior) this.interior.visible = on;
    this.interiorOn = on;
  }
  place(x, z, h) {
    this.x = x; this.z = z; this.h = h; this.vx = this.vz = this.vy = 0; this.air = false; this.yawRate = 0;
    this.groundSample(); this.y = this.gY; this.tPitch = this.gP; this.tRoll = this.gR;
    this.sync(0.016);
  }
  get speed() { return Math.hypot(this.vx, this.vz); }
  // true while the car flies (ramps, drops); airT = duration of the current / last flight (stunt scoring)
  get airborne() { return this.air; }
  // ground under the axles: height at the CG, terrain pitch and roll
  groundSample() {
    const G = this.G, fx = Math.sin(this.h), fz = Math.cos(this.h), a = G.wf, b = -G.wb, tw = G.wx;
    const gF = groundH(this.x + fx * a, this.z + fz * a), gB = groundH(this.x - fx * b, this.z - fz * b);
    const gL = groundH(this.x + fz * tw, this.z - fx * tw), gRt = groundH(this.x - fz * tw, this.z + fx * tw);
    const lon = (gF * b + gB * a) / (a + b), lat = (gL + gRt) / 2;
    this.gY = Math.max(lon, lat, groundH(this.x, this.z) - 0.05);
    this.gP = -Math.atan2(gF - gB, a + b); this.gR = Math.atan2(gL - gRt, tw * 2);
    this.gSl = (gF - gB) / (a + b);
  }
  physics(inp, dt) {
    const n = dt > 0.021 ? Math.ceil(dt / 0.0167) : 1, h = dt / n;
    for (let i = 0; i < n; i++) this.step(inp, h);
    this.collide();
  }
  step(inp, dt) {
    const T = this.T, G = this.G;
    const fx = Math.sin(this.h), fz = Math.cos(this.h), rx = -fz, rz = fx;
    let vf = this.vx * fx + this.vz * fz, vs = this.vx * rx + this.vz * rz, r = this.yawRate;
    const alive = !this.wrecked, player = this.driver === 'player';
    const thr = alive ? clamp(inp.throttle || 0, 0, 1) : 0, brk = clamp(inp.brake || 0, 0, 1), hand = !!inp.hand;
    const nitro = alive && inp.nitro && this.nitro > 0.02 && thr > 0;
    const maxV = T.maxV * (nitro ? 1.22 : 1), av = Math.abs(vf);
    this.throttle = thr;
    // ---- gearbox (automatic) ----
    const gears = T.gears, ng = gears.length;
    if (vf < -0.4) this.gear = -1;
    else if (this.gear < 1) this.gear = 1;
    let rk;
    if (this.gear > 0) {
      const top = maxV * gears[this.gear - 1];
      rk = av / top;
      if (this.shiftT <= 0) {
        if (rk > lerp(0.62, 0.97, thr) && this.gear < ng && (thr > 0.05 || rk > 0.95)) { this.gear++; this.shiftT = thr > 0.5 ? 0.2 : 0.12; this.shiftEvt = 1; }
        else if (this.gear > 1 && av / (maxV * gears[this.gear - 2]) < lerp(0.55, 0.78, thr)) { this.gear--; this.shiftEvt = -1; }
      }
    } else rk = av / 12;
    if (this.shiftT > 0) this.shiftT -= dt;
    // ---- longitudinal ----
    const grounded = !this.air;
    let fwd = 0;
    if (grounded) {
      if (thr > 0) {
        if (vf < -0.5) fwd += thr * 20;
        else {
          const g = Math.max(1, this.gear), rr0 = clamp(rk, 0, 1.05);
          const torque = 0.78 + 0.42 * Math.sin(Math.PI * clamp(rr0 * 0.92 + 0.05, 0, 1));
          const gm = lerp(1.18, 0.86, ng > 1 ? (g - 1) / (ng - 1) : 0);
          const cut = this.shiftT > 0 ? 0.15 : 1;
          fwd += thr * T.acc * (nitro ? 1.75 : 1) * torque * gm * cut * Math.max(0.08, 1 - vf / maxV);
        }
      }
      if (brk > 0) {
        if (vf > 0.5) fwd -= brk * 26;
        else if (alive && vf > -14) fwd -= brk * T.acc * 0.6;
      }
      if (thr === 0 && brk === 0) fwd -= Math.sign(vf) * Math.min(av / dt, 1.4 + av * 0.022 + (this.gear > 0 ? 0.6 / this.gear : 0));
      else fwd -= vf * av * 0.0011;
      if (hand) fwd -= Math.sign(vf) * Math.min(av / dt, 6.5);
    } else fwd -= vf * av * 0.0006;
    vf += fwd * dt;
    this.braking = (brk > 0 && vf > 0.5) || (hand && av > 1);
    // ---- steering ----
    const sf = clamp(1 - av / 72, 0.3, 1);
    this.steer = damp(this.steer, (alive ? clamp(inp.steer || 0, -1, 1) : 0) * 0.6 * sf, 8, dt);
    // ---- lateral: two-axle tyre model with load transfer, handbrake and power slides ----
    const a = G.wf, b = -G.wb, wb = a + b;
    if (grounded) {
      const u = Math.max(av, 2.5), sg = vf < -0.2 ? -1 : 1;
      const lt = clamp(-this.accF * 0.022, -0.22, 0.22);
      const nF = b / wb + lt, nR = a / wb - lt;
      const mu = T.grip * CAR_GRAV * 0.47 * (alive ? 1 : 0.6) * (1 + 0.22 * sstep(16, 45, av));
      let spin = 0;
      if (T.drive !== 'fwd' && thr > 0.6 && vf > 0 && this.gear <= 2) spin = clamp((T.acc / (T.grip * 9.8)) * thr * (1 - vf / (maxV * 0.55)) * (T.drive === 'awd' ? 0.5 : 1.15) - 0.35, 0, 0.75);
      if (hand && av > 3) spin = Math.max(spin, 0.55);
      this.spin = damp(this.spin, spin, 6, dt);
      const muF = mu * nF, muR = mu * nR * (hand ? 0.45 : 1) * (1 - this.spin * 0.55);
      const af = Math.atan2(vs + a * r, u) - this.steer * sg, ar = Math.atan2(vs - b * r, u);
      const Ff = clamp(-af * muF * 9, -muF, muF), Fr = clamp(-ar * muR * 9, -muR, muR);
      vs += (Ff + Fr) * dt;
      r += (a * Ff - b * Fr) / (a * b * 1.05) * dt;
      // stability assists (stronger for AI and while not drifting on purpose)
      const ass = player ? (hand ? 0.15 : 0.55) : 1.6;
      if (Math.abs(ar) > 0.12) r -= r * ass * 1.2 * dt;
      // low speed: blend to kinematic turning
      const lw = 1 - sstep(1.2, 4.5, av);
      if (lw > 0) { const rk0 = vf * Math.tan(this.steer) / wb; r = lerp(r, rk0, lw); vs *= 1 - lw * Math.min(1, 12 * dt); }
      if (hand && av > 5 && player) r += clamp(inp.steer || 0, -1, 1) * 1.5 * dt * sstep(5, 12, av);
      const rMax = (hand ? 3.8 : 2.9) + 0.4 / Math.max(1, av * 0.1);
      r = clamp(r, -rMax, rMax);
      const beta = Math.atan2(Math.abs(vs), Math.max(av, 0.5));
      if (beta > 0.95 && !hand) vs *= Math.exp(-4 * dt);
      this.slip = clamp(Math.max(Math.abs(af), Math.abs(ar)) * 4 - 0.3 + this.spin, 0, 1);
    } else {
      r *= Math.exp(-0.4 * dt);
      this.slip = 0;
    }
    // world velocity from body-frame components of this step, then rotate the car (exact frame rotation)
    this.vx = fx * vf + rx * vs; this.vz = fz * vf + rz * vs;
    this.yawRate = r;
    this.h -= r * dt;
    this.drift = Math.abs(vs);
    this.x += this.vx * dt; this.z += this.vz * dt;
    this.accF = damp(this.accF, (vf - this.prevVf) / Math.max(dt, 1e-3), 8, dt); this.prevVf = vf;
    this.accS = r * vf;
    this.vf = vf; this.vs = vs;
    if (nitro) this.nitro = Math.max(0, this.nitro - dt * 0.22); else this.nitro = Math.min(1, this.nitro + dt * 0.035);
    this.usingNitro = nitro;
    this.wheelRot += vf / T.wr * dt;
    if (!(hand && grounded)) this.rearRot += (vf + (grounded ? this.spin * 14 : thr * 18)) / T.wr * dt;
    // ---- engine rpm for audio / HUD ----
    const idleK = 0.1;
    let tk = this.gear > 0 ? clamp(rk, 0, 1.04) : clamp(rk, 0, 1);
    if (this.spin > 0.05 || !grounded) tk = Math.max(tk, clamp(0.35 + thr * 0.7, 0, 1.02));
    if (av < 1.5 && thr > 0) tk = Math.max(tk, 0.25 + thr * 0.35);
    tk = Math.max(idleK, tk);
    this.rpmK = this.shiftT > 0 ? damp(this.rpmK, tk, 22, dt) : damp(this.rpmK, tk, 12, dt);
    this.rpm = T.idle + (T.rl - T.idle) * clamp(this.rpmK, 0, 1.04);
    // ---- vertical: ground following, take-off, flight, landing ----
    this.groundSample();
    if (this.air) {
      this.airT += dt;
      this.vy -= CAR_GRAV * dt; this.y += this.vy * dt;
      this.aPitchV += (0.35 + (thr - brk) * -0.6) * dt; this.tPitch += this.aPitchV * dt; this.tRoll += this.aRollV * dt;
      this.tPitch = clamp(this.tPitch, -0.75, 0.75); this.tRoll = clamp(this.tRoll, -0.5, 0.5);
      if (this.y <= this.gY) {
        const imp = -this.vy;
        this.air = false; this.y = this.gY; this.vy = 0; this.lastAirT = this.airT;
        this.landImpact = Math.max(this.landImpact, imp);
        this.sp.hv -= imp * 0.32; this.sp.pv += (this.tPitch - this.gP) * 4; this.sp.rv += (this.tRoll - this.gR) * 3;
        this.tPitch = lerp(this.tPitch, this.gP, 0.6); this.tRoll = lerp(this.tRoll, this.gR, 0.6);
        if (imp > 9.5) { const d = (imp - 9.5) * 2.4; this.damage(d); this.dmg.f += d * 0.4; this.dmg.r += d * 0.4; this.dmg.top += d * 0.15; }
        if (GAMEHOOK.carLand) GAMEHOOK.carLand(this, imp);
      }
    } else {
      // vy: low-passed vertical speed of the ground under the car (a ramp builds it up, a curb step barely does)
      const yFree = this.y + this.vy * dt - 0.5 * CAR_GRAV * dt * dt;
      if ((yFree > this.gY + 0.025 && this.vy > 1.2) || this.gY < this.y - 0.35) {
        this.air = true; this.airT = 0; this.y = yFree; this.vy -= CAR_GRAV * dt;
        this.aPitchV = 0; this.aRollV = (this.tRoll - this.gR) * 0.5;
      } else {
        const dy = this.gY - this.y;
        if (Math.abs(dy) > 0.025 && av > 2) { this.sp.h -= dy * 0.75; this.sp.hv -= dy * av * 0.35; this.bump = Math.max(this.bump, Math.abs(dy) * av); }
        this.vy = damp(this.vy, dy / dt, 14, dt);
        this.y = this.gY;
        const k = 1 - Math.exp(-16 * dt);
        this.tPitch += (this.gP - this.tPitch) * k; this.tRoll += (this.gR - this.tRoll) * k;
      }
    }
  }
  collide() {
    const T = this.T, fx = Math.sin(this.h), fz = Math.cos(this.h), r = T.W * 0.5, o0 = T.L * 0.5 - r, nk = T.L > 8 ? 2 : 1;
    let impact = 0, ix = 0, iz = 0, inx = 0, inz = 0;
    for (let k = -nk; k <= nk; k++) {
      const o = k * o0 / nk, cx = this.x + fx * o, cz = this.z + fz * o;
      const hit = collideCircle(cx, cz, r, this.y + 0.35);
      if (!hit.hit) continue;
      this.x += hit.x - cx; this.z += hit.z - cz;
      const nx = hit.nx, nz = hit.nz, vn = this.vx * nx + this.vz * nz;
      if (vn < 0) {
        this.vx -= 1.3 * vn * nx; this.vz -= 1.3 * vn * nz;
        this.vx *= 0.985; this.vz *= 0.985;
        const jx = -vn * nx, jz = -vn * nz;
        this.yawRate += ((fx * o) * jz - (fz * o) * jx) * 0.1 / Math.sqrt(T.mass || 1);
        if (-vn > impact) { impact = -vn; ix = cx; iz = cz; inx = nx; inz = nz; }
      }
    }
    if (impact > 2.5) this.onImpact(impact, ix - inx * r, iz - inz * r, null);
  }
  onImpact(sp, px, pz, other) {
    let k = this.T.police ? 1.5 : 2.3;
    if (this.driver === 'player' && other && other.driver === 'police') k = 1.0;
    if (other && other.T.mass && this.T.mass) k *= clamp(Math.sqrt(other.T.mass / this.T.mass), 0.6, 1.35);
    if (sp > 4.5) {
      const d = (sp - 4.5) * k;
      this.damage(d, other);
      // directional crumple
      const dx = px - this.x, dz = pz - this.z, fx = Math.sin(this.h), fz = Math.cos(this.h);
      const lz = dx * fx + dz * fz, lx = dx * fz - dz * fx, L = this.T.L;
      const z = lz > L * 0.26 ? 'f' : lz < -L * 0.26 ? 'r' : lx > 0 ? 'l' : 'rt';
      this.dmg[z] += d * 1.6;
    }
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
    this.bodyMesh.material = CARMAT.burnt;
    this.heads.material = CARMAT.headBroken; this.tails.material = CARMAT.tailBroken;
    this.dmg.f = Math.max(this.dmg.f, 40); this.dmg.r = Math.max(this.dmg.r, 40); this.dmg.top = Math.max(this.dmg.top, 30);
    this.vy = 6; this.vx *= 0.3; this.vz *= 0.3; this.air = true;
    explosionFx(this.x, this.y, this.z);
    for (const c of cars) {
      if (c === this) continue;
      const d = Math.hypot(c.x - this.x, c.z - this.z);
      if (d < 8) {
        c.damage(55 * (1 - d / 8)); if (c.kinematic) c.makeDynamic();
        const k = (8 - d) * 1.2 / (d || 1) / Math.sqrt(c.T.mass || 1); c.vx += (c.x - this.x) * k; c.vz += (c.z - this.z) * k;
        if (!c.air && d < 5 && (c.T.mass || 1) < 3) { c.air = true; c.vy = (5 - d) * 1.6; c.aRollV = rr(-1, 1); }
      }
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
      const e = this.T.rearEngine ? -0.35 : 0.35, fx = Math.sin(this.h), fz = Math.cos(this.h), hx = this.x + fx * this.T.L * e, hz = this.z + fz * this.T.L * e;
      if (this.exploded) { if (Math.random() < 0.5) puffSmoke(this.x, this.y + 1.2, this.z, 1, true, 0.4); }
      else if (this.wrecked) {
        for (let i = 0; i < 3; i++) fireFx.emit(hx + rr(-0.5, 0.5), this.y + 1.0, hz + rr(-0.5, 0.5), rr(-0.4, 0.4), rr(1.5, 3), rr(-0.4, 0.4), rr(0.4, 0.8), rr(0.8, 1.2), 0.2, 2.0, 0.9, 0.25, 1, 0.9, 0.12, 0.02, 0.5, -1);
        puffSmoke(hx, this.y + 1.5, hz, 1, true, 0.5);
      } else if (this.health < 35) puffSmoke(hx, this.y + 1.0, hz, 1, this.health < 18, 0.3);
    }
    if (this.wrecked && !this.exploded) { this.burnT -= dt; if (this.burnT <= 0) this.explode(); }
    if (this.exploded) {
      if (this.air) {
        this.y += this.vy * dt; this.vy -= 18 * dt; this.x += this.vx * dt; this.z += this.vz * dt;
        const g = groundH(this.x, this.z); if (this.y < g) { this.y = g; if (this.vy < -3) this.vy = -this.vy * 0.25; else { this.vy = 0; this.air = false; } }
      }
    }
  }
  // damage visuals: crumple morphs, cracked glass, dead lamps
  updateDamageLook() {
    const D = this.dmg, inf = this.bodyMesh.morphTargetInfluences;
    if (this.health > this.lastHealth + 15) { D.f = D.r = D.l = D.rt = D.top = 0; this.cracked = false; }
    this.lastHealth = this.health;
    const m = (v) => clamp(Math.sqrt(Math.max(0, v) / 70), 0, 1);
    inf[0] = m(D.f); inf[1] = m(D.r); inf[2] = m(D.l); inf[3] = m(D.rt); inf[4] = m(D.top);
    if (this.exploded) return;
    const tot = D.f + D.r + D.l + D.rt + D.top, crack = tot > 34 || this.health < 40;
    if (crack !== this.cracked) { this.cracked = crack; if (this.bodyMesh.material !== CARMAT.burnt) { this.bodyMesh.material = this._mat = paint(this.color, crack); if (!crack) this.paintMat = this._mat; } }
    this.heads.material = D.f > 26 ? CARMAT.headBroken : CARMAT.head;
    this.tailsBroken = D.r > 26;
  }
  sync(dt) {
    const T = this.T, sp = this.sp;
    // repaint support: the paint shop sets bodyMesh.material = paint(col) directly; pick the new colour up
    const bm = this.bodyMesh.material;
    if (bm !== this._mat) {
      if (bm !== CARMAT.burnt && !bm.userData.cracked && bm.color) { this.paintMat = bm; this.color = '#' + bm.color.getHexString(); }
      this._mat = bm;
    }
    this.updateDamageLook();
    // kinematic traffic: tilt with the ground (ramps), cheap two-sample version
    if (this.kinematic) {
      const fx = Math.sin(this.h), fz = Math.cos(this.h), a = this.G.wf, b = -this.G.wb;
      const gF = groundH(this.x + fx * a, this.z + fz * a), gB = groundH(this.x - fx * b, this.z - fz * b);
      this.tPitch = damp(this.tPitch, -Math.atan2(gF - gB, a + b), 12, dt); this.tRoll = damp(this.tRoll, 0, 12, dt);
      this.y = Math.max(this.y, (gF * b + gB * a) / (a + b));
    }
    this.root.position.set(this.x, this.y, this.z);
    this.root.rotation.set(this.tPitch, this.h, this.tRoll);
    // suspension: damped springs toward load-transfer targets, plus bump/landing impulses
    const mk = clamp(1.6 / Math.sqrt(T.mass || 1.4), 0.5, 1.3);
    const tp = this.air ? 0 : clamp(-this.accF * 0.0065, -0.085, 0.085), tr = this.air ? 0 : clamp(-this.accS * 0.0045, -0.085, 0.085);
    const h = Math.min(dt, 0.034), K = CAR_SUSP.k * mk, C = CAR_SUSP.c * Math.sqrt(mk);
    sp.hv += (-K * sp.h - C * sp.hv) * h; sp.h += sp.hv * h;
    sp.pv += (-K * (sp.p - tp) - C * sp.pv) * h; sp.p += sp.pv * h;
    sp.rv += (-K * 0.8 * (sp.r - tr) - C * sp.rv) * h; sp.r += sp.rv * h;
    sp.h = clamp(sp.h, -0.16, 0.12); sp.p = clamp(sp.p, -0.14, 0.14); sp.r = clamp(sp.r, -0.12, 0.12);
    this.pitch = sp.p; this.roll = sp.r;
    this.body.position.y = sp.h + (this.air ? 0.03 : 0);
    this.body.rotation.set(sp.p, 0, sp.r);
    this.droop = damp(this.droop, this.air ? 0.07 : 0, this.air ? 6 : 20, dt);
    const wr = T.wr;
    for (const w of this.wheels) {
      w.spin.rotation.x = w.front ? this.wheelRot : this.rearRot;
      if (w.front) w.steer.rotation.y = -this.steer;
      w.steer.position.y = wr - this.droop;
    }
    this.tails.material = this.tailsBroken ? CARMAT.tailBroken : this.braking ? CARMAT.brake : CARMAT.tail;
    this.blob.position.y = 0.04 - this.y + groundH(this.x, this.z) * 1;
    this.blob.visible = this.y - groundH(this.x, this.z) < 6;
    if (this.interiorOn) {
      this.intWheel.rotation.z = this.steer * 3.6;
      const spd = clamp(this.speed * 3.6 / 240, 0, 1), rpmK = clamp(this.rpm / 8000, 0, 1);
      this.needleSpeed.rotation.z = lerp(0.75 * Math.PI, -0.75 * Math.PI, spd);
      this.needleTach.rotation.z = lerp(0.75 * Math.PI, -0.75 * Math.PI, rpmK);
      CARMAT.gauge.emissiveIntensity = 0.35 + DAY.night * 0.9;
    }
  }
  remove() {
    scene.remove(this.root);
    this.dead = true;
    if (this.ai) { this.ai.release(); this.ai = null; }
    const i = cars.indexOf(this); if (i >= 0) cars.splice(i, 1);
  }
}

// car vs car
const CA = new Float32Array(10), CB = new Float32Array(10);
// Collision circles along the car (3, or 5 for long vehicles); returns the radius. out holds x, z pairs.
function carCircles(c, out) {
  const fx = Math.sin(c.h), fz = Math.cos(c.h), r = c.T.W * 0.5, o = c.T.L * 0.5 - r;
  out[0] = c.x + fx * o; out[1] = c.z + fz * o; out[2] = c.x; out[3] = c.z; out[4] = c.x - fx * o; out[5] = c.z - fz * o;
  if (c.T.L > 8) { out[6] = c.x + fx * o * 0.5; out[7] = c.z + fz * o * 0.5; out[8] = c.x - fx * o * 0.5; out[9] = c.z - fz * o * 0.5; }
  else { out[6] = out[2]; out[7] = out[3]; out[8] = out[2]; out[9] = out[3]; }
  return r;
}
function resolveCarPair(a, b) {
  if (Math.abs(a.y - b.y) > 1.3) return;
  const ra = carCircles(a, CA), rb = carCircles(b, CB), rs = ra + rb, na = a.T.L > 8 ? 5 : 3, nb = b.T.L > 8 ? 5 : 3;
  let best = 0, nx = 0, nz = 0, px = 0, pz = 0;
  for (let i = 0; i < na; i++) for (let j = 0; j < nb; j++) {
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
  const ma = a.kinematic ? 0 : 1 / (a.T.mass || 1.4), mb = b.kinematic ? 0 : 1 / (b.T.mass || 1.4);
  if (ma + mb === 0) return;
  const ka = ma / (ma + mb), kb = mb / (ma + mb);
  a.x -= nx * best * ka; a.z -= nz * best * ka; b.x += nx * best * kb; b.z += nz * best * kb;
  if (rel < 0) {
    const j = -(1.25) * rel / (ma + mb);
    a.vx -= j * ma * nx; a.vz -= j * ma * nz; b.vx += j * mb * nx; b.vz += j * mb * nz;
    // spin from off-centre hits
    const ta = ((px - a.x) * nz - (pz - a.z) * nx), tb = ((px - b.x) * nz - (pz - b.z) * nx);
    if (!a.kinematic) a.yawRate -= ta * j * ma * 0.12;
    if (!b.kinematic) b.yawRate += tb * j * mb * 0.12;
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
