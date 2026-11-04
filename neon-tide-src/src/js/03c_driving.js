// ============================================================
//  Player driving: input mapping, skid marks, tyre smoke, landing / curb feedback, headlight
//  (owner: models & driving)
// ============================================================
// ---------- skid marks ----------
let skidMesh = null, skidI = 0;
const SKID_N = 900;
function initSkids() {
  const g = new THREE.PlaneGeometry(0.26, 1); g.rotateX(-Math.PI / 2);
  skidMesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), SKID_N);
  for (let i = 0; i < SKID_N; i++) setInst(skidMesh, i, 0, -50, 0, 0, 0.001, 0.001, 0.001);
  skidMesh.frustumCulled = false; skidMesh.renderOrder = 1;
  scene.add(skidMesh);
}
function addSkid(x0, z0, x1, z1, y, w) {
  const len = Math.hypot(x1 - x0, z1 - z0); if (len < 0.05 || len > 3) return;
  setInst(skidMesh, skidI, (x0 + x1) / 2, y + 0.022, (z0 + z1) / 2, Math.atan2(x1 - x0, z1 - z0), w || 1, 1, len + 0.05);
  skidI = (skidI + 1) % SKID_N; skidMesh.instanceMatrix.needsUpdate = true;
}
// Per-car wheel trail state (last contact points); kept on the car object to avoid allocations.
function carWheelTrails(c, on, smokeK, dt) {
  const fx = Math.sin(c.h), fz = Math.cos(c.h), rx = -fz, rz = fx;
  const hw = c.G.wx, w = (c.T.tw || 0.25) / 0.26;
  if (!c._tr) c._tr = new Float32Array(9);
  const t = c._tr;
  const bz = c.G.wb, fzz = c.G.wf;
  const lx = c.x + fx * bz - rx * hw, lz = c.z + fz * bz - rz * hw, qx = c.x + fx * bz + rx * hw, qz = c.z + fz * bz + rz * hw;
  const front = on > 1;
  const flx = c.x + fx * fzz - rx * hw, flz = c.z + fz * fzz - rz * hw, frx = c.x + fx * fzz + rx * hw, frz = c.z + fz * fzz + rz * hw;
  if (on && t[8] > 0) {
    const gy = groundH(c.x, c.z);
    addSkid(t[0], t[1], lx, lz, gy, w); addSkid(t[2], t[3], qx, qz, gy, w);
    if (front) { addSkid(t[4], t[5], flx, flz, gy, w); addSkid(t[6], t[7], frx, frz, gy, w); }
    c._smT = (c._smT || 0) - dt;
    if (c._smT <= 0 && smokeK > 0) {
      c._smT = lerp(0.12, 0.035, smokeK);
      puffSmoke(lx, gy + 0.3, lz, 1, false, 0.5 + smokeK * 0.6); puffSmoke(qx, gy + 0.3, qz, 1, false, 0.5 + smokeK * 0.6);
    }
  }
  t[0] = lx; t[1] = lz; t[2] = qx; t[3] = qz; t[4] = flx; t[5] = flz; t[6] = frx; t[7] = frz; t[8] = on ? 1 : 0;
}
const driveFx = { t: 0 };
let headSpot = null;
const CAR_DRIVE_IN = { throttle: 0, brake: 0, steer: 0, hand: false, nitro: false };
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
  CAR_DRIVE_IN.throttle = throttle; CAR_DRIVE_IN.brake = brake; CAR_DRIVE_IN.steer = steer; CAR_DRIVE_IN.hand = !!input.hand; CAR_DRIVE_IN.nitro = !!input.nitro;
  c.physics(CAR_DRIVE_IN, dt);
  player.x = c.x; player.z = c.z; player.y = c.y;
  // tyre marks and smoke from slip (power slides, handbrake, hard braking, drifts)
  const sp = c.speed;
  const slide = !c.air && sp > 3.5 && (c.slip > 0.42 || c.drift > 3.0 || (c.braking && input.hand) || c.spin > 0.25);
  const hardBrake = !c.air && brake > 0.8 && c.vf > 14;
  carWheelTrails(c, slide ? (hardBrake ? 2 : 1) : hardBrake ? 2 : 0, slide ? clamp(c.slip * 0.8 + c.drift / 14 + c.spin, 0, 1) : 0, dt);
  AUD.skid(slide || hardBrake ? clamp(c.slip * 0.7 + c.drift / 12 + c.spin * 0.6 + (hardBrake ? 0.35 : 0), 0, 1) : 0);
  // landings and curb bumps
  if (c.landImpact > 0) {
    const k = c.landImpact; c.landImpact = 0;
    if (k > 1.5) { AUD.land(k); shakeCam(Math.min(0.9, k * 0.055)); }
    if (k > 4) { const g = groundH(c.x, c.z); for (let i = 0; i < 3; i++) puffSmoke(c.x + rr(-1, 1), g + 0.2, c.z + rr(-1, 1), 1, false, 1.2); }
    if (k > 7) sparks(c.x, c.y + 0.2, c.z, Math.min(30, k * 2));
  }
  if (c.bump > 0) { const b = c.bump; c.bump = 0; if (b > 0.5) { AUD.bump(Math.min(1, b / 4)); shakeCam(Math.min(0.25, b * 0.04)); } }
  if (c.shiftEvt) { AUD.shift(c.shiftEvt, c); c.shiftEvt = 0; }
  if (c.usingNitro) {
    const fx = Math.sin(c.h), fz = Math.cos(c.h);
    const ex = c.x - fx * (c.T.L / 2 + 0.2), ez = c.z - fz * (c.T.L / 2 + 0.2);
    for (let i = 0; i < 2; i++) fireFx.emit(ex + rr(-0.15, 0.15), c.y + 0.4, ez + rr(-0.15, 0.15), -fx * 8 + rr(-1, 1), rr(0, 0.6), -fz * 8 + rr(-1, 1), 0.18, 0.5, 0.15, 0.4, 0.6, 2.0, 1, 1.4, 0.6, 0.3, 1, 0);
  }
  AUD.engine(c.vf, throttle, c.T.maxV, c);
  if (c.exploded) killPlayer('Машина взорвалась');
}
// Sounds for other cars' landings near the camera (player handled above).
GAMEHOOK.carLand = (c, imp) => {
  if (c === player.car || imp < 3) return;
  const d = Math.hypot(c.x - camera.position.x, c.z - camera.position.z);
  if (d < 60) AUD.land(imp * clamp(1 - d / 60, 0, 1));
};
function updateHeadlight() {
  if (!headSpot) return;
  const c = player.mode === 'car' ? player.car : null;
  const on = c && DAY.night > 0.15 && !c.wrecked && c.dmg.f <= 26;
  headSpot.intensity = on ? 2.4 * DAY.night : 0;
  if (c) {
    const fx = Math.sin(c.h), fz = Math.cos(c.h);
    headSpot.position.set(c.x + fx * (c.T.L / 2), c.y + c.T.H - 0.1, c.z + fz * (c.T.L / 2));
    headSpot.target.position.set(c.x + fx * 22, c.y - 1.2, c.z + fz * 22);
  }
}
