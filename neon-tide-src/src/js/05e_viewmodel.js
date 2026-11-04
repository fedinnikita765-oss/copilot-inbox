// ============================================================
//  First-person view model (owner: weapons): the hero's arms holding the current weapon, attached to the
//  camera with sway, bob, recoil, reload / switch / throw / melee animations, muzzle flash.
//  Never clips into walls: every view-model material is transparent with renderOrder 9999, so it draws last,
//  and a tiny "depth clearer" mesh (renderOrder 9990) clears the depth buffer right before it.
//  Shown while cam.fp is true and cam.blend has reached 1, with the hero on foot. WPN_VM.muzzleWorld(out) / WPN_VM.ejectWorld(out) for FX.
// ============================================================
const WPN_VM = { ready: false, root: null, pivot: null, cG: null, cF: null, guns: {}, R: null, L: null, flash: null, gren: null,
  armMat: null, flashMat: null, lastShot: 0, flashT: 0, lastYaw: 0, lastPitch: 0, swX: 0, swY: 0, bobT: 0, bobA: 0,
  kz: 0, kzv: 0, kr: 0, krv: 0, ky: 0, kyv: 0, sprint: 0, cur: null, shown: false,
  muzzleWorld(out) { return wpnVmPointWorld(out, 'muzzle'); }, ejectWorld(out) { return wpnVmPointWorld(out, 'eject'); } };
const WPN_VMV = { a: new V3(), b: new V3(), c: new V3(), q: new THREE.Quaternion(), q2: new THREE.Quaternion(), e: new THREE.Euler(), m: new THREE.Matrix4(), negZ: new V3(0, 0, -1), z: new V3(0, 0, 1) };

// Arm/hand geometry using the human atlas (skin + floral shirt regions) with vertex colours.
class WpnVGeo {
  constructor() { this.list = []; }
  add(geo, x, y, z, o, col, reg) {
    o = o || {};
    _wpnGE.set(o.rx || 0, o.ry || 0, o.rz || 0); _wpnGQ.setFromEuler(_wpnGE); _wpnGP.set(x, y, z); _wpnGS.set(o.sx || 1, o.sy || 1, o.sz || 1);
    geo.applyMatrix4(_wpnGM.compose(_wpnGP, _wpnGQ, _wpnGS));
    const g = geo.index ? geo.toNonIndexed() : geo, n = g.attributes.position.count, R = ATL[reg] || ATL.plain;
    const uv = g.attributes.uv, c = new Float32Array(n * 3), cc = new THREE.Color(col);
    for (let i = 0; i < n; i++) { uv.setXY(i, lerp(R[0], R[2], uv.getX(i)), lerp(R[1], R[3], uv.getY(i))); c[i * 3] = cc.r; c[i * 3 + 1] = cc.g; c[i * 3 + 2] = cc.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    this.list.push(g); return this;
  }
  build() { const m = mergeGeos(this.list); let n = 0; const col = new Float32Array(m.attributes.position.count * 3); for (const g of this.list) { col.set(g.attributes.color.array, n * 3); n += g.attributes.position.count; g.dispose(); } m.setAttribute('color', new THREE.BufferAttribute(col, 3)); return m; }
}
const WPN_VM_SKIN = '#b97a55';
// Closed right fist around a vertical grip (local frame = canonical gun frame: grip along Y, fingers wrap +Z,
// back of the hand toward -X, wrist toward -Z).
function wpnVmFistGeo() {
  const G = new WpnVGeo(), S = WPN_VM_SKIN, dk = '#a86c4a';
  G.add(new THREE.SphereGeometry(1, 14, 10), -0.016, -0.004, -0.014, { sx: 0.03, sy: 0.05, sz: 0.046 }, S, 'skin');
  G.add(new THREE.SphereGeometry(1, 12, 8), -0.028, 0.0, -0.006, { sx: 0.014, sy: 0.047, sz: 0.04 }, S, 'skin');
  const ys = [0.034, 0.012, -0.01, -0.03], len = [0.03, 0.032, 0.03, 0.024];
  for (let i = 0; i < 4; i++) {
    G.add(new THREE.CapsuleGeometry(0.0105 - i * 0.0006, len[i], 3, 8), -0.002, ys[i], 0.03, { rz: Math.PI / 2 }, S, 'skin');
    G.add(new THREE.SphereGeometry(0.0105 - i * 0.0006, 8, 6), 0.021, ys[i], 0.017, {}, dk, 'skin');
    G.add(new THREE.SphereGeometry(0.0125, 8, 6), -0.024, ys[i], 0.022, { sx: 1, sy: 0.85, sz: 1 }, S, 'skin');
  }
  G.add(new THREE.CapsuleGeometry(0.0115, 0.036, 3, 8), 0.02, 0.045, 0.006, { rx: Math.PI / 2 - 0.25, ry: 0.15 }, S, 'skin');
  G.add(new THREE.CylinderGeometry(0.025, 0.027, 0.06, 12), -0.012, -0.002, -0.058, { rx: Math.PI / 2 }, S, 'skin');
  return G.build();
}
// Forearm from the wrist (origin) back along -Z, then the floral short sleeve.
function wpnVmForearmGeo() {
  const G = new WpnVGeo(), S = WPN_VM_SKIN;
  G.add(new THREE.CylinderGeometry(0.025, 0.036, 0.17, 14, 2, true), 0, 0, -0.085, { rx: Math.PI / 2 }, S, 'skin');
  G.add(new THREE.CylinderGeometry(0.036, 0.033, 0.1, 14, 1, true), 0, 0, -0.22, { rx: Math.PI / 2 }, S, 'skin');
  G.add(new THREE.SphereGeometry(0.034, 12, 8), 0, 0, -0.27, {}, S, 'skin');
  G.add(new THREE.CylinderGeometry(0.036, 0.042, 0.06, 14, 1, true), 0, 0, -0.3, { rx: Math.PI / 2 }, S, 'skin');
  G.add(new THREE.CylinderGeometry(0.062, 0.066, 0.3, 16, 2, false), 0, 0, -0.47, { rx: Math.PI / 2 }, '#ffffff', 'floral');
  G.add(new THREE.TorusGeometry(0.061, 0.006, 6, 18), 0, 0, -0.322, {}, '#f2e6dc', 'floral');
  return G.build();
}
function wpnVmMesh(geo, mat) { const m = new THREE.Mesh(geo, mat); m.renderOrder = 9999; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; return m; }
function wpnVmArm(left) {
  const grp = new THREE.Group();
  const fist = wpnVmMesh(WPN_VM.fistGeo, WPN_VM.armMat), fore = wpnVmMesh(WPN_VM.foreGeo, WPN_VM.armMat);
  fore.position.set(-0.012, -0.002, -0.085);
  grp.add(fist, fore);
  if (left) grp.scale.x = -1;
  return { grp, fist, fore, left, dir: new V3(0.3, -0.5, 0.8) };
}
function wpnInitViewModel() {
  if (WPN_VM.ready || !humanMat) return;
  WPN_VM.armMat = new THREE.MeshStandardMaterial({ map: humanMat.map, vertexColors: true, roughness: 0.68, metalness: 0, transparent: true, fog: false });
  WPN_VM.fistGeo = wpnVmFistGeo(); WPN_VM.foreGeo = wpnVmForearmGeo();
  WPN_VM.root = new THREE.Group(); WPN_VM.root.visible = false;
  WPN_VM.pivot = new THREE.Group(); WPN_VM.root.add(WPN_VM.pivot);
  WPN_VM.cG = new THREE.Group(); WPN_VM.cG.rotation.y = Math.PI; WPN_VM.pivot.add(WPN_VM.cG);
  WPN_VM.cF = new THREE.Group(); WPN_VM.cF.rotation.y = Math.PI; WPN_VM.root.add(WPN_VM.cF);
  for (const t of ['pistol', 'smg', 'shotgun', 'rifle', 'bat']) { const m = wpnVmMesh(WPN_WA.geo[t], WPN_WA.vmats); m.visible = false; WPN_VM.cG.add(m); WPN_VM.guns[t] = m; }
  WPN_VM.gren = wpnVmMesh(WPN_WA.geo.grenade, WPN_WA.vmats); WPN_VM.gren.visible = false;
  WPN_VM.R = wpnVmArm(false); WPN_VM.L = wpnVmArm(true);
  WPN_VM.cG.add(WPN_VM.R.grp, WPN_VM.L.grp);
  // muzzle flash: two crossed camera-facing quads
  WPN_VM.flashMat = new THREE.MeshBasicMaterial({ map: WPN_WA.tex.flare, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false, side: THREE.DoubleSide });
  WPN_VM.flashMat.forceSinglePass = true;
  WPN_VM.flash = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), WPN_VM.flashMat); WPN_VM.flash.renderOrder = 10000; WPN_VM.flash.frustumCulled = false; WPN_VM.flash.visible = false;
  WPN_VM.cG.add(WPN_VM.flash);
  // depth clearer: drawn just before the view model
  const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, -0.5, 0.001, 0, -0.5, 0, 0.001, -0.5]), 3));
  const clr = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false, transparent: true }));
  clr.renderOrder = 9990; clr.frustumCulled = false;
  clr.onBeforeRender = (r) => { r.state.buffers.depth.setMask(true); r.clearDepth(); };
  WPN_VM.root.add(clr);
  scene.add(WPN_VM.root);
  WPN_VM.ready = true;
}
// Pose tables. Gun position in camera space (x right, y up, -z forward): hip and aim-down-sights.
// Arms are given in the canonical gun frame (+X = gun's left, +Z = barrel); forearm directions in camera space.
const WPN_VM_POSE = {
  pistol: { hip: [0.13, -0.16, -0.42], ads: [0, -WPN_WA_SIGHT('pistol'), -0.42], R: { p: [0, 0, 0], r: [0.24, 0, 0], d: [0.28, -0.82, 0.5], da: [0.62, -0.62, 0.48] },
    L: { p: [0.031, -0.018, 0.012], r: [0.24, 0, 0], d: [-0.36, -0.8, 0.48], da: [-0.66, -0.6, 0.45] } },
  smg: { hip: [0.15, -0.18, -0.4], ads: [0, -WPN_WA_SIGHT('smg'), -0.33], R: { p: [0, 0, 0], r: [0.2, 0, 0], d: [0.3, -0.82, 0.48] },
    L: { p: [0, 0.005, 0.22], r: [-Math.PI / 2, 0, 0.25], d: [-0.4, -0.78, 0.48] } },
  shotgun: { hip: [0.16, -0.19, -0.38], ads: [0, -WPN_WA_SIGHT('shotgun'), -0.3], R: { p: [0, 0, 0], r: [0.35, 0, 0], d: [0.3, -0.82, 0.48] },
    L: { p: [0, 0.042, 0.34], r: [-Math.PI / 2, 0, 0.25], d: [-0.42, -0.76, 0.5] } },
  rifle: { hip: [0.155, -0.185, -0.37], ads: [0, -WPN_WA_SIGHT('rifle'), -0.27], R: { p: [0, 0, 0], r: [0.3, 0, 0], d: [0.3, -0.82, 0.48] },
    L: { p: [0, 0.046, 0.35], r: [-Math.PI / 2, 0, 0.25], d: [-0.42, -0.76, 0.5] } },
};
function WPN_WA_SIGHT(t) { return { pistol: 0.112, smg: 0.126, shotgun: 0.113, rifle: 0.149 }[t]; }
const _wpnVmPt = new V3();
function wpnVmPointWorld(out, kind) {
  if (!WPN_VM.ready) return false;
  const t = WPN_VM.cur; if (!t || !WPN_WA[kind][t]) return false;
  wpnSyncVmRoot();
  WPN_VM.root.updateMatrixWorld(true);
  out.copy(WPN_WA[kind][t]); WPN_VM.guns[t].localToWorld(out);
  return true;
}
function wpnSyncVmRoot() {
  camera.updateMatrixWorld();
  WPN_VM.root.position.copy(camera.position); WPN_VM.root.quaternion.copy(camera.quaternion);
  const asp = camera.aspect || 1, tv = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const k = (asp >= 1 ? tv : asp * tv) / Math.tan(THREE.MathUtils.degToRad(31));
  WPN_VM.root.scale.set(k, k, 1);
}
// Point an arm's forearm along a camera-space direction (handles the mirrored left arm and the view-model scale).
function wpnVmAimForearm(arm, cx, cy, cz) {
  WPN_VMV.a.set(cx, cy, cz).transformDirection(camera.matrixWorld);
  arm.grp.updateWorldMatrix(true, false);
  WPN_VMV.m.copy(arm.grp.matrixWorld).invert();
  WPN_VMV.a.transformDirection(WPN_VMV.m);
  arm.fore.quaternion.setFromUnitVectors(WPN_VMV.negZ, WPN_VMV.a);
}
function wpnVmSetArm(arm, P, ox, oy, oz, ads) {
  arm.grp.position.set(P.p[0] + (ox || 0), P.p[1] + (oy || 0), P.p[2] + (oz || 0));
  arm.grp.rotation.set(P.r[0], P.r[1], P.r[2]);
  arm.dir.set(P.d[0], P.d[1], P.d[2]);
  if (P.da && ads > 0) arm.dir.lerp(WPN_VMV.c.set(P.da[0], P.da[1], P.da[2]), ads);
}
// semi-implicit spring step (stable for dt ≤ 0.05)
function wpnVmSpring(x, v, k, c, dt) { return v + (-k * x - c * v) * dt; }
function wpnUpdateViewModel(dt) {
  if (!WPN_VM.ready) return;
  const P = player;
  const show = GAME.state === 'play' && wpnFpView() && P.mode === 'foot' && !P.dead && P.knockT <= 0;
  WPN_VM.root.visible = show;
  if (!show) { WPN_VM.shown = false; return; }
  wpnSyncVmRoot();
  const W = wpnArsWeapon(), kind = W.kind, throwing = WPN_ARS.throwT > 0;
  const gun = kind === 'gun' && !throwing, melee = kind === 'melee' && !throwing;
  const t = GAME.time;
  // pick model
  const model = gun || melee ? W.id : null;
  if (model !== WPN_VM.cur) {
    for (const k in WPN_VM.guns) WPN_VM.guns[k].visible = k === model;
    WPN_VM.cur = model;
  }
  if (!WPN_VM.shown) { WPN_VM.shown = true; WPN_VM.lastYaw = cam.yaw; WPN_VM.lastPitch = cam.pitch; }
  // sway (lag behind camera rotation), bob, sprint
  const dy = wrapA(cam.yaw - WPN_VM.lastYaw), dp = cam.pitch - WPN_VM.lastPitch; WPN_VM.lastYaw = cam.yaw; WPN_VM.lastPitch = cam.pitch;
  const ads = WPN_ARS.aimSm, inv = dt > 0 ? 1 / dt : 60;
  WPN_VM.swX = damp(WPN_VM.swX, clamp(dy * inv * 0.012, -0.05, 0.05) * (1 - 0.7 * ads), 9, dt);
  WPN_VM.swY = damp(WPN_VM.swY, clamp(dp * inv * 0.01, -0.04, 0.04) * (1 - 0.7 * ads), 9, dt);
  const spd = Math.hypot(P.vx, P.vz), ground = P.onGround ? 1 : 0.2;
  WPN_VM.bobA = damp(WPN_VM.bobA, Math.min(1, spd / 5) * ground, 8, dt);
  WPN_VM.bobT += dt * (2.2 + spd * 1.45);
  const bA = WPN_VM.bobA * (1 - 0.85 * ads);
  const bx = Math.sin(WPN_VM.bobT) * 0.011 * bA, by = -Math.abs(Math.cos(WPN_VM.bobT)) * 0.013 * bA + Math.sin(t * 1.7) * 0.0018 * (1 - ads);
  WPN_VM.sprint = damp(WPN_VM.sprint, spd > 6.2 && !WPN_ARS.aim && WPN_ARS.sinceShot > 0.4 && gun ? 1 : 0, 7, dt);
  // recoil springs
  if (WPN_ARS.shotN !== WPN_VM.lastShot) {
    WPN_VM.lastShot = WPN_ARS.shotN;
    if (gun) {
      const k = W.recoil * (1 - 0.45 * ads);
      WPN_VM.kzv += 2.8 * k * 30; WPN_VM.krv += 7 * k * 30; WPN_VM.kyv += rr(-1, 1) * k * 30;
      WPN_VM.flashT = 0.045;
      const s = 0.09 + W.flash * 0.1;
      WPN_VM.flash.scale.set(s * rr(0.85, 1.2), s * rr(0.85, 1.2), 1); WPN_VM.flash.rotation.z = Math.random() * TAU;
    }
  }
  WPN_VM.kzv = wpnVmSpring(WPN_VM.kz, WPN_VM.kzv, 260, 22, dt); WPN_VM.kz += WPN_VM.kzv * dt;
  WPN_VM.krv = wpnVmSpring(WPN_VM.kr, WPN_VM.krv, 220, 20, dt); WPN_VM.kr += WPN_VM.krv * dt;
  WPN_VM.kyv = wpnVmSpring(WPN_VM.ky, WPN_VM.kyv, 220, 20, dt); WPN_VM.ky += WPN_VM.kyv * dt;
  // switch / throw lowering
  let low = 0;
  if (WPN_ARS.switchT > 0) { const ph = 1 - WPN_ARS.switchT / WPN_SWITCH_T; low = ph < 0.5 ? sstep(0, 0.5, ph) : 1 - sstep(0.5, 1, ph); }
  // reload
  let rl = 0, rlL = 0;
  if (WPN_ARS.reloading && gun) {
    const pr = clamp(1 - WPN_ARS.reloadT / WPN_ARS.reloadDur, 0, 1);
    if (W.shellReload) { rl = 0.55; rlL = Math.sin(pr * Math.PI); }
    else { rl = Math.sin(Math.min(1, pr * 1.15) * Math.PI); rlL = sstep(0.08, 0.3, pr) * (1 - sstep(0.55, 0.85, pr)); }
  }
  // ---- guns ----
  WPN_VM.flashT -= dt;
  WPN_VM.flash.visible = WPN_VM.flashT > 0 && gun;
  if (gun) {
    const Pz = WPN_VM_POSE[W.id];
    const hx = lerp(Pz.hip[0], Pz.ads[0], ads), hy = lerp(Pz.hip[1], Pz.ads[1], ads), hz = lerp(Pz.hip[2], Pz.ads[2], ads);
    WPN_VM.pivot.position.set(hx + WPN_VM.swX * 0.6 + bx + WPN_VM.sprint * 0.03 + WPN_VM.ky * 0.05, hy - WPN_VM.swY * 0.6 + by - low * 0.32 - rl * 0.04 - WPN_VM.sprint * 0.05, hz + WPN_VM.kz * 0.05);
    WPN_VM.pivot.rotation.set(WPN_VM.kr * 0.06 - WPN_VM.swY * 1.2 - low * 0.9 + rl * 0.22 - WPN_VM.sprint * 0.35, WPN_VM.swX * 1.5 + WPN_VM.ky * 0.03 + WPN_VM.sprint * 0.55, rl * 0.6 - WPN_VM.swX * 0.8 + bx * 2);
    if (WPN_VM.R.grp.parent !== WPN_VM.cG) WPN_VM.cG.add(WPN_VM.R.grp);
    if (WPN_VM.L.grp.parent !== WPN_VM.cG) WPN_VM.cG.add(WPN_VM.L.grp);
    WPN_VM.R.grp.visible = true; WPN_VM.L.grp.visible = true;
    wpnVmSetArm(WPN_VM.R, Pz.R, 0, 0, 0, ads);
    // left hand: reaches down for a new magazine / shells during reload
    wpnVmSetArm(WPN_VM.L, Pz.L, rlL * 0.02, -rlL * 0.12, -rlL * (W.id === 'pistol' ? 0.02 : 0.12), ads);
    WPN_VM.L.grp.rotation.x += rlL * 0.5;
    const mz = WPN_WA.muzzle[W.id];
    WPN_VM.flash.position.set(mz.x, mz.y, mz.z + 0.03);
    WPN_VM.flash.rotation.x = 0; WPN_VM.flash.rotation.y = Math.PI;
    wpnVmAimForearm(WPN_VM.R, WPN_VM.R.dir.x, WPN_VM.R.dir.y, WPN_VM.R.dir.z);
    wpnVmAimForearm(WPN_VM.L, WPN_VM.L.dir.x, WPN_VM.L.dir.y, WPN_VM.L.dir.z);
  } else if (melee) {
    // bat over the right shoulder; swing sweeps it across the screen
    const sw = WPN_ARS.swingT > 0 ? 1 - WPN_ARS.swingT / W.swing : 0;
    const k1 = sstep(0, 0.22, sw), k2 = sstep(0.22, 0.5, sw), k3 = sstep(0.55, 1, sw);
    const px = lerp(lerp(lerp(0.22, 0.27, k1), -0.1, k2), 0.22, k3), py = lerp(lerp(lerp(-0.23, -0.17, k1), -0.2, k2), -0.23, k3), pz = lerp(lerp(lerp(-0.42, -0.36, k1), -0.46, k2), -0.42, k3);
    WPN_VM.pivot.position.set(px + WPN_VM.swX * 0.6 + bx, py - WPN_VM.swY * 0.6 + by - low * 0.35, pz);
    WPN_VM.pivot.rotation.set(-low * 0.8, WPN_VM.swX, 0);
    // bat direction in canonical space (+X = left, +Z = forward)
    WPN_VMV.a.set(-0.75, 0.55, 0.38).lerp(WPN_VMV.b.set(-0.8, 0.5, 0.05), k1).lerp(WPN_VMV.c.set(0.95, -0.08, 0.5), k2).lerp(WPN_VMV.b.set(-0.75, 0.55, 0.38), k3).normalize();
    const bat = WPN_VM.guns.bat;
    bat.position.set(0, 0, 0); bat.quaternion.setFromUnitVectors(WPN_VMV.z, WPN_VMV.a);
    if (WPN_VM.R.grp.parent !== bat) bat.add(WPN_VM.R.grp);
    WPN_VM.R.grp.visible = true; WPN_VM.L.grp.visible = false;
    WPN_VM.R.grp.position.set(0, 0, 0.0); WPN_VM.R.grp.rotation.set(-Math.PI / 2, 0, 0);
    wpnVmAimForearm(WPN_VM.R, 0.3, -0.8, 0.5);
  } else {
    // fists (guard low at the bottom of the screen, jab on punch) and grenade throws
    WPN_VM.pivot.position.set(0, -low * 0.0, 0); WPN_VM.pivot.rotation.set(0, 0, 0);
    if (WPN_VM.R.grp.parent !== WPN_VM.cF) WPN_VM.cF.add(WPN_VM.R.grp);
    if (WPN_VM.L.grp.parent !== WPN_VM.cF) WPN_VM.cF.add(WPN_VM.L.grp);
    WPN_VM.R.grp.visible = true; WPN_VM.L.grp.visible = true;
    const a = P.anim, pu = a.punch > 0 ? a.punch : 0, sd = a.punchSide || 1;
    const ext = pu < 0.28 ? 0 : pu < 0.46 ? sstep(0.28, 0.46, pu) : 1 - sstep(0.46, 0.95, pu);
    const up = pu > 0 ? sstep(0, 0.2, pu) * (1 - sstep(0.75, 1, pu)) : 0;
    const gy = -0.27 + up * 0.08 + by, gz = 0.33;
    const rE = sd > 0 ? ext : 0, lE = sd > 0 ? 0 : ext;
    WPN_VM.R.grp.position.set(-0.15 + rE * 0.1 - WPN_VM.swX * 0.5 - bx, gy + rE * 0.06 - WPN_VM.swY * 0.5, gz + rE * 0.22);
    WPN_VM.L.grp.position.set(0.15 - lE * 0.1 - WPN_VM.swX * 0.5 - bx, gy + lE * 0.06 - WPN_VM.swY * 0.5, gz + 0.01 + lE * 0.22);
    WPN_VM.R.grp.rotation.set(-0.15, -0.25 + rE * 0.25, 0.4 - rE * 0.3); WPN_VM.L.grp.rotation.set(-0.15, -0.25 + lE * 0.25, 0.4 - lE * 0.3);
    if (throwing) {
      const tp = 1 - WPN_ARS.throwT / 0.62;
      const back = sstep(0, 0.35, tp) * (1 - sstep(0.35, 0.5, tp)), fwd = sstep(0.35, 0.55, tp) * (1 - sstep(0.7, 1, tp));
      WPN_VM.R.grp.position.set(-0.17 + fwd * 0.12, -0.24 + back * 0.22 + fwd * 0.18, 0.33 - back * 0.12 + fwd * 0.25);
      WPN_VM.R.grp.rotation.set(-0.3 - back * 0.6 + fwd * 0.4, 0, 0.3);
      WPN_VM.L.grp.position.y -= 0.05;
    }
    wpnVmAimForearm(WPN_VM.R, 0.3, -0.78, 0.55);
    wpnVmAimForearm(WPN_VM.L, -0.3, -0.78, 0.55);
  }
  // grenade in the throwing hand
  const holdG = throwing && WPN_ARS.throwT > 0.4;
  if (holdG) { if (WPN_VM.gren.parent !== WPN_VM.R.grp) WPN_VM.R.grp.add(WPN_VM.gren); WPN_VM.gren.position.set(0.004, 0.0, 0.04); }
  WPN_VM.gren.visible = holdG;
}
EXT.boot.push(wpnInitViewModel);
EXT.visual.push(wpnUpdateViewModel);
