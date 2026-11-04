// ============================================================
//  Living city runtime (owner D): city buses and the armoured police van, animated landmarks
//  (cranes, club lasers, neon), traffic-signal and landmark glow, pickup games on the beach
//  volleyball courts and the streetball court.
// ============================================================
// Extra vehicle types registered into the shared car registry (geometry is built by carGeo).
// With the modelled cars (owner C: per-type shape atlas) the city bus is theirs and the squad uses their van;
// the old parametric car builder gets our own bus and armoured van types.
const LIFE_MODEL_CARS = typeof CARSHAPE !== 'undefined';
if (typeof CAR_TYPES !== 'undefined') {
  if (!CAR_TYPES.bus) CAR_TYPES.bus = { lifeBus: true, L: 10.6, W: 2.5, H: 1.22, cab: [0.015, 0.985], cabH: 1.5, rin: 0.0, fin: 0.035, wr: 0.5, maxV: 27, acc: 6.5, grip: 7.2 };
  if (!LIFE_MODEL_CARS && !CAR_TYPES.swat) CAR_TYPES.swat = { L: 5.7, W: 2.3, H: 1.42, cab: [0.05, 0.8], cabH: 0.98, rin: 0.0, fin: 0.17, wr: 0.47, maxV: 46, acc: 13, grip: 8.6, police: true, armored: true };
}
const LIFE_VEH = { busGeo: null, swatGeo: null, mats: {} };
function lifeVehTex(txt, w, h, bg, fg, font) {
  const c = mkCanvas(w, h), g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = fg; g.fillText(txt, w / 2, h / 2 + 2);
  return toTex(c, { wrap: false });
}
// window pillars, destination sign, doors and roof stripe; the eye is moved to the driver's seat
function lifeDressBus(car) {
  if (!car.T.lifeBus) return; // the modelled bus comes with its own windows and signs
  const T = car.T, G = carGeo('bus'), W = T.W, L = T.L, ct = G.ct, ch = T.cabH;
  G.eye = [W * 0.24, ct + ch * 0.5, L / 2 - 1.15];
  if (!LIFE_VEH.busGeo) {
    const p = [];
    const cw = W - 0.42;
    for (let z = -L / 2 + 1.0; z < L / 2 - 1.4; z += 1.55) for (const s of [-1, 1]) { const g = new THREE.BoxGeometry(0.05, ch * 0.92, 0.09); g.translate(s * (cw / 2 + 0.035), ct + ch * 0.48, z); p.push(g); }
    const stripe = new THREE.BoxGeometry(W - 0.36, 0.06, L - 0.6); stripe.translate(0, ct + ch + 0.12, 0); p.push(stripe);
    LIFE_VEH.busGeo = mergeGeos(p);
    const d = []; for (const z of [L / 2 - 1.9, -0.6]) { const g = new THREE.BoxGeometry(0.04, ct + ch * 0.9 - 0.3, 1.25); g.translate(-W / 2 - 0.01, (ct + ch * 0.9 + 0.3) / 2, z); d.push(g); }
    LIFE_VEH.busDoor = mergeGeos(d);
    LIFE_VEH.busSign = new THREE.PlaneGeometry(1.5, 0.3); LIFE_VEH.busSign.translate(0, ct + ch - 0.22, L / 2 - 0.34);
    LIFE_VEH.mats.sign = new THREE.MeshBasicMaterial({ map: lifeVehTex('7  ПИРС', 256, 52, '#120d06', '#ffb02e', `900 30px ${FONT_D}`), toneMapped: false });
    LIFE_VEH.mats.door = new THREE.MeshStandardMaterial({ color: 0x1a2128, roughness: 0.3, metalness: 0.6 });
  }
  const m = new THREE.Mesh(LIFE_VEH.busGeo, car.paintMat); car.body.add(m);
  car.body.add(new THREE.Mesh(LIFE_VEH.busDoor, LIFE_VEH.mats.door));
  car.body.add(new THREE.Mesh(LIFE_VEH.busSign, LIFE_VEH.mats.sign));
}
// armoured squad van: opaque cargo box over the rear glass, push bar, side lettering
// vehicle type for the armoured squad
function lifeSquadType() { return CAR_TYPES.swat ? 'swat' : CAR_TYPES.van ? 'van' : 'police'; }
function lifeDressSwat(car) {
  car.armored = true; car.health = 260;
  if (car.type !== 'swat') { lifeDressSquadVan(car); return; }
  const T = car.T, G = carGeo('swat'), W = T.W, L = T.L, ct = G.ct, ch = T.cabH;
  G.eye = [W * 0.22, ct + ch * 0.55, L / 2 - L * 0.2 - 0.9];
  car.health = 260;
  if (!LIFE_VEH.swatGeo) {
    const x0 = -L / 2 + L * T.cab[0], x1 = -L / 2 + L * T.cab[1], cl = x1 - x0, len = cl * 0.6;
    const box = new THREE.BoxGeometry(W - 0.34, ch + 0.06, len); box.translate(0, ct + ch / 2, x0 + len / 2 - 0.02);
    LIFE_VEH.swatGeo = box;
    const p = [];
    const bar = new THREE.BoxGeometry(W * 0.92, 0.42, 0.2); bar.translate(0, 0.62, L / 2 + 0.16); p.push(bar);
    for (const s of [-0.55, 0.55]) { const g = new THREE.BoxGeometry(0.12, 0.62, 0.16); g.translate(s, 0.72, L / 2 + 0.2); p.push(g); }
    for (const s of [-1, 1]) { const g = new THREE.BoxGeometry(0.06, 0.06, len * 0.9); g.translate(s * (W / 2 - 0.3), ct + ch + 0.1, x0 + len / 2); p.push(g); }
    LIFE_VEH.swatTrim = mergeGeos(p);
    const dec = [];
    for (const s of [-1, 1]) { const g = new THREE.PlaneGeometry(len * 0.9, 0.42); g.rotateY(s * Math.PI / 2); g.translate(s * ((W - 0.34) / 2 + 0.012), ct + ch * 0.55, x0 + len / 2); dec.push(g); }
    LIFE_VEH.swatDecal = mergeGeos(dec);
    LIFE_VEH.mats.swatDecal = new THREE.MeshStandardMaterial({ map: lifeVehTex('СПЕЦОТРЯД', 512, 84, '#1b2030', '#ffd23f', `900 52px ${FONT_D}`), roughness: 0.5 });
  }
  car.body.add(new THREE.Mesh(LIFE_VEH.swatGeo, car.paintMat));
  car.body.add(new THREE.Mesh(LIFE_VEH.swatTrim, CARMAT.trim));
  car.body.add(new THREE.Mesh(LIFE_VEH.swatDecal, LIFE_VEH.mats.swatDecal));
}

// modelled van turned into the squad van: police flag (lights, sirens, damage), light bar, push bar, lettering
function lifeDressSquadVan(car) {
  car.T = Object.assign({}, car.T, { police: true });
  const T = car.T, G = car.G, W = T.W, L = T.L, roof = G.roofY !== undefined ? G.roofY : T.H + T.cabH;
  if (!LIFE_VEH.vanGeo) {
    const p = [];
    const bar = new THREE.BoxGeometry(W * 0.9, 0.4, 0.18); bar.translate(0, 0.6, L / 2 + 0.14); p.push(bar);
    for (const sx of [-0.5, 0.5]) { const g = new THREE.BoxGeometry(0.12, 0.6, 0.14); g.translate(sx, 0.7, L / 2 + 0.18); p.push(g); }
    const base = new THREE.BoxGeometry(1.3, 0.06, 0.32); base.translate(0, roof + 0.03, L * 0.22); p.push(base);
    LIFE_VEH.vanGeo = mergeGeos(p);
    LIFE_VEH.vanR = new THREE.BoxGeometry(0.56, 0.12, 0.26); LIFE_VEH.vanR.translate(0.3, roof + 0.12, L * 0.22);
    LIFE_VEH.vanB = new THREE.BoxGeometry(0.56, 0.12, 0.26); LIFE_VEH.vanB.translate(-0.3, roof + 0.12, L * 0.22);
    const dec = [];
    for (const s of [-1, 1]) { const g = new THREE.PlaneGeometry(L * 0.42, 0.36); g.rotateY(s * Math.PI / 2); g.translate(s * (W / 2 + 0.02), T.H + 0.25, -L * 0.12); dec.push(g); }
    LIFE_VEH.vanDecal = mergeGeos(dec);
    if (!LIFE_VEH.mats.swatDecal) LIFE_VEH.mats.swatDecal = new THREE.MeshStandardMaterial({ map: lifeVehTex('СПЕЦОТРЯД', 512, 84, '#1b2030', '#ffd23f', `900 52px ${FONT_D}`), roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  }
  const trim = CARMAT.trim || CARMAT.detail;
  car.body.add(new THREE.Mesh(LIFE_VEH.vanGeo, trim));
  if (CARMAT.lbRed) car.body.add(new THREE.Mesh(LIFE_VEH.vanR, CARMAT.lbRed));
  if (CARMAT.lbBlue) car.body.add(new THREE.Mesh(LIFE_VEH.vanB, CARMAT.lbBlue));
  car.body.add(new THREE.Mesh(LIFE_VEH.vanDecal, LIFE_VEH.mats.swatDecal));
}

// ---------- animated landmarks and night lights ----------
const LIFE_RT = { t: 0, games: [], ballGeo: null, sigDir: false };
function lifeVisual(dt) {
  LIFE_RT.t += dt;
  const t = LIFE_RT.t, n = DAY.night;
  // distance culling of prop chunks: street furniture near, signals mid-range, landmarks to the fog
  const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z, far = scene.fog.far * 1.05;
  for (const m of CITYX.batches) {
    const sp = m.geometry.boundingSphere, v = m.userData.view || far;
    const dx = sp.center.x - cx, dy = sp.center.y - cy, dz = sp.center.z - cz;
    m.visible = Math.sqrt(dx * dx + dy * dy + dz * dz) - sp.radius < v;
  }
  for (const c of CITYX.cranes) c.g.rotation.y = c.a0 + Math.sin(t * c.sp + c.ph) * 1.3;
  const on = n > 0.3;
  for (const L of CITYX.lasers) {
    L.m.visible = on;
    if (!on) continue;
    L.m.rotation.set(Math.sin(t * 0.8 + L.ph) * 0.55, 0, Math.cos(t * 0.55 + L.ph * 1.3) * 0.55);
    L.m.material.opacity = (0.1 + 0.08 * Math.sin(t * 6 + L.ph)) * n;
  }
  const nv = 0.45 + 1.15 * n;
  for (const m of CITYX.neonMats) m.color.setScalar(nv);
  for (const m of CITYX.signMats) m.color.setScalar(0.62 + 0.75 * n);
  if (CITYX.fascia) CITYX.fascia.emissiveIntensity = 0.1 + 0.7 * n;
  for (const g of LIFE_RT.games) g.visual(dt);
}
const LIFE_SIG_GLOW = [[0.15, 1.0, 0.45], [1.0, 0.62, 0.05], [1.0, 0.08, 0.05]];
function lifeGlow(layer) {
  const n = DAY.night, cx = camera.position.x, cz = camera.position.z;
  // signal lenses (lit lamp of each head) — bright at night, faint by day
  if (TSIG.lensPos) {
    if (!LIFE_RT.sigDir) { LIFE_RT.sigDir = true; const v = new V3(); for (const l of TSIG.lensPos) { v.set(0, 0, 1).applyQuaternion(l.q); l.fx = v.x; l.fz = v.z; } }
    const k = 0.25 + 0.95 * n;
    for (const a of TSIG.apps) {
      const nd = a.node; const st = nd.s[a.axis]; if (st < 0) continue;
      for (let h = 0; h < 2; h++) {
        const l = TSIG.lensPos[a.lens + h * 3 + (2 - st)];
        const dx = l.x - cx, dz = l.z - cz; if (dx * dx + dz * dz > 26000) continue;
        const c = LIFE_SIG_GLOW[st];
        layer.add(l.x + l.fx * 0.06, l.y, l.z + l.fz * 0.06, c[0] * k, c[1] * k, c[2] * k, h ? 0.55 : 0.75);
      }
    }
  }
  if (n > 0.05) {
    for (const p of CITYX.glowPts) layer.add(p.x, p.y, p.z, p.r * n, p.g * n, p.b * n, p.s);
    const blink = Math.sin(LIFE_RT.t * 4) > 0;
    if (blink) for (const c of CITYX.cranes) {
      const a = c.g.rotation.y, tip = c.J + 1;
      layer.add(c.x + Math.sin(a) * tip, c.y + c.H + 1.0, c.z + Math.cos(a) * tip, 1.6 * n, 0.08 * n, 0.05 * n, 2.4);
      layer.add(c.x, c.y + c.H + 7.2, c.z, 1.6 * n, 0.08 * n, 0.05 * n, 2.4);
    }
  }
  // camera flashes on the pier
  for (const p of peds) {
    const A = p.act; if (!A || A.kind !== 'photo' || !(A.flashT > 0) || !p.root.visible) continue;
    layer.add(p.x + Math.sin(p.h) * 0.45, p.y + 1.55, p.z + Math.cos(p.h) * 0.45, 2.2, 2.2, 2.4, 1.2);
  }
}

// ---------- pickup games: beach volleyball (4 players) and streetball (2 players) ----------
class LifeBallGame {
  constructor(kind, site) {
    this.kind = kind; this.site = site; this.players = []; this.active = false; this.cd = rr(2, 6);
    if (!LIFE_RT.ballGeo) {
      LIFE_RT.ballGeo = new THREE.SphereGeometry(kind === 'volley' ? 0.11 : 0.12, 12, 8);
      LIFE_RT.volleyMat = new THREE.MeshStandardMaterial({ color: 0xfff3c4, roughness: 0.5 });
      LIFE_RT.hoopMat = new THREE.MeshStandardMaterial({ color: 0xe06a24, roughness: 0.65 });
    }
    this.ball = new THREE.Mesh(LIFE_RT.ballGeo, kind === 'volley' ? LIFE_RT.volleyMat : LIFE_RT.hoopMat);
    this.ball.castShadow = true; this.ball.visible = false; scene.add(this.ball);
    this.fl = null; this.holder = 0;
  }
  spots() {
    const S = this.site;
    if (this.kind === 'volley') return [[S.cx - 1.6, S.cz - 4.0], [S.cx + 1.4, S.cz - 2.6], [S.cx - 1.4, S.cz + 3.2], [S.cx + 1.7, S.cz + 4.4]];
    const h = S.hoops[0];
    return [[h[0] + (S.cx > h[0] ? 4.5 : -4.5), h[2] + 1.5], [h[0] + (S.cx > h[0] ? 2.2 : -2.2), h[2] - 2.4]];
  }
  start() {
    const sp = this.spots();
    for (const [x, z] of sp) {
      const look = randomLook(); look.shorts = true; if (this.kind === 'volley') { look.sleeves = 'tank'; look.shoes = '#e8c39e'; } else look.sleeves = rpick(['tank', 'short']);
      look.phone = false; look.hat = null;
      const p = new Ped(look, x, z);
      pedStartIdle(p, { kind: 'game', x, z, h: 0, t: 1e9, spd: 4.2, home: [x, z] });
      p.game = this; this.players.push(p);
    }
    this.active = true; this.ball.visible = true; this.holder = 0; this.next(0.5);
  }
  stop() {
    for (const p of this.players) if (!p.removed && p.act && p.act.kind === 'game') p.resume();
    for (const p of this.players) p.game = null;
    this.players.length = 0; this.active = false; this.ball.visible = false; this.cd = rr(25, 60);
  }
  // plan the next flight from the current holder
  next(delay) {
    const n = this.players.length, from = this.players[this.holder];
    if (!from) return;
    let to, tx, ty, tz, dur, apex;
    if (this.kind === 'volley') {
      const sideA = this.holder < 2; to = sideA ? 2 + Math.floor(Math.random() * 2) : Math.floor(Math.random() * 2);
      const tp = this.players[to]; const hm = tp.act.home;
      tx = hm[0] + rr(-1.2, 1.2); tz = hm[1] + rr(-1.0, 1.0); ty = groundH(tx, tz) + 1.9; dur = rr(1.25, 1.6); apex = rr(3.6, 4.8);
      tp.act.x = tx; tp.act.z = tz - Math.sign(tz - this.site.cz) * 0.3;
    } else {
      const H = this.site.hoops[0];
      if (this.holder === 0) { to = -1; tx = H[0]; ty = H[1] + 0.25; tz = H[2]; dur = 1.05; apex = 1.6; }
      else { to = 0; const sh = this.players[0]; const a = rr(-1.1, 1.1), r = rr(3.8, 6.2), sx = Math.sign(this.site.cx - H[0]); sh.act.x = H[0] + sx * Math.cos(a) * r; sh.act.z = H[2] + Math.sin(a) * r; tx = sh.act.x; tz = sh.act.z; ty = groundH(tx, tz) + 1.2; dur = 0.9; apex = 1.1; }
    }
    this.fl = { from: this.holder, to, sx: 0, sy: 0, sz: 0, tx, ty, tz, t: -(delay || 0), dur, apex };
  }
  update(dt) {
    if (!this.active) {
      this.cd -= dt;
      const S = this.site, d = Math.hypot(player.x - S.cx, player.z - S.cz);
      if (this.cd <= 0 && d < 120 && d > 35 && qualityName !== 'low' && DAY.night < 0.55 && wanted.stars === 0) this.start();
      return;
    }
    const S = this.site, d = Math.hypot(player.x - S.cx, player.z - S.cz);
    if (this.players.some((p) => p.removed || !p.act || p.act.kind !== 'game') || d > 160 || DAY.night > 0.7) { this.stop(); return; }
    const F = this.fl; if (!F) return;
    const from = this.players[F.from];
    if (F.t < 0) {
      F.t += dt;
      // ball held at the hitter's hands
      this.ball.position.set(from.x + Math.sin(from.h) * 0.35, from.y + (this.kind === 'volley' ? 1.9 : 1.25), from.z + Math.cos(from.h) * 0.35);
      if (F.t >= 0) { F.sx = this.ball.position.x; F.sy = this.ball.position.y; F.sz = this.ball.position.z; from.anim.punch = 0.001; from.anim.punchSide = -(from.anim.punchSide || 1); }
      return;
    }
    F.t += dt;
    const u = Math.min(1, F.t / F.dur);
    this.ball.position.set(lerp(F.sx, F.tx, u), lerp(F.sy, F.ty, u) + Math.sin(u * Math.PI) * F.apex, lerp(F.sz, F.tz, u));
    this.ball.rotation.x += dt * 9;
    // players face the ball
    for (const p of this.players) p.act.h = Math.atan2(this.ball.position.x - p.x, this.ball.position.z - p.z);
    if (u >= 1) {
      if (this.kind === 'hoops' && F.to < 0) {
        // dropped through the net: rebound to the second player
        this.holder = 1; const reb = this.players[1], H = this.site.hoops[0];
        reb.act.x = H[0] + rr(-1.2, 1.2) + Math.sign(this.site.cx - H[0]) * 1.2; reb.act.z = H[2] + rr(-1.2, 1.2);
        this.fl = { from: 1, to: 1, sx: H[0], sy: H[1] - 0.2, sz: H[2], tx: reb.act.x, ty: groundH(reb.act.x, reb.act.z) + 1.0, tz: reb.act.z, t: 0, dur: 0.75, apex: 0.4, rebound: true };
        return;
      }
      if (F.rebound) { this.next(rr(0.5, 1.0)); return; }
      this.holder = F.to; this.next(rr(0.05, 0.25));
    }
  }
  visual() { }
}
function lifeUpdate(dt) {
  for (const g of LIFE_RT.games) g.update(dt);
}
EXT.boot.push(() => {
  if (SPOT.volley) for (const v of SPOT.volley) LIFE_RT.games.push(new LifeBallGame('volley', v));
  if (SPOT.court && SPOT.court.hoops) LIFE_RT.games.push(new LifeBallGame('hoops', SPOT.court));
});
EXT.visual.push(lifeVisual);
EXT.glow.push(lifeGlow);
EXT.update.push(lifeUpdate);
EV.on('start', () => { for (const g of LIFE_RT.games) if (g.active) g.stop(); });
