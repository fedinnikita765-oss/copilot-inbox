// ============================================================
//  Player driving: input mapping, skid marks, drift smoke, headlight
//  (owner: models & driving)
// ============================================================
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

