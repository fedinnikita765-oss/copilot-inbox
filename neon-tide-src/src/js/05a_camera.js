// ============================================================
//  Camera (owner: camera & feel)
//  Views: 'tp' over-the-shoulder third person (tighter aim view while cam.wantAim), 'fp' first person at the
//  hero's eyes, 'chase' car chase camera, 'cockpit' first-person driving, 'death' slow third-person orbit and
//  'override' (cam.override(dt) drives the camera, e.g. the creative free camera). Switches blend smoothly.
//
//  Shared API (see AGENTS.md):
//    cam.yaw / cam.pitch  look target written by input (pitch > 0 looks down); cam.zoom; cam.override; cam.idle
//    getAim(out?)         ray from the camera through the screen centre → { x, y, z, dx, dy, dz }
//    shakeCam(a)          add camera shake (0..1.2)
//  Added by this module:
//    cam.fp               read-only: a first-person camera is on (on foot or cockpit)
//    cam.view, cam.blend  read-only: current view name and the 0..1 progress of the switch into it
//    cam.wantAim          set true while aiming (weapons) → shoulder aim view / FP zoom and slower look
//    cam.aim              read-only 0..1 aim blend
//    cam.aimMinDist       read-only: pass to fireBullet({ minDist }) so shots ignore what is between camera and hero
//    cam.kick(up, right)  recoil in radians (up > 0 raises the view, right > 0 turns it right); recovers smoothly
//    cam.vYaw, cam.vPitch read-only smoothed view angles (what is on screen, without recoil)
//    cam.setView(fp), cam.toggleView()  the player's choice, saved in save.fp; emits EV 'viewChange' { fp }
//    cam.setBob(on), cam.bob            camera motion on/off (save.camBob); EV 'camView' (view) on every switch
//    cam.locked           read-only: desktop pointer lock is active (see 05d_view.js)
// ============================================================
const CAMCFG = {
  lookTouch: 34, lookMouse: 75, aimSens: 0.68,        // view smoothing (spring ω) and look speed while aiming
  tpDist: 3.55, tpShoulder: 0.44, tpHeight: 1.62,     // over-the-shoulder rig
  aimDist: 2.3, aimShoulder: 0.78, aimHeight: 1.6,
  tpSpring: 11, tpSpringY: 8.5, tpLag: 0.3,          // pivot spring; lag = share of the velocity lag kept
  carSpring: 9, carSpringY: 7, carLag: 0.2,
  blendTime: 0.36, nearFP: 0.06, nearCar: 0.08, nearTP: 0.1,
};
const cam = {
  yaw: 0, pitch: 0.3, idle: 0, shake: 0, zoom: 1, curDist: 6, look: 0, fp: false, override: null,
  view: 'tp', blend: 1, wantAim: false, aim: 0, aimMinDist: 0, vYaw: 0, vPitch: 0.3, locked: false,
  fpPref: !!save.fp, bob: save.camBob === false ? 0 : 1,
  kick(up, right) { CAMST.kickTP = clamp(CAMST.kickTP - (up || 0), -0.4, 0.4); CAMST.kickTY = clamp(CAMST.kickTY - (right || 0), -0.3, 0.3); },
  setView(fp) {
    fp = !!fp; if (fp === cam.fpPref) return;
    cam.fpPref = fp; save.fp = fp; writeSave(); EV.emit('viewChange', { fp });
  },
  toggleView() { cam.setView(!cam.fpPref); },
  setBob(on) { cam.bob = on ? 1 : 0; save.camBob = !!on; writeSave(); EV.emit('viewChange', { fp: cam.fpPref }); },
};
// private camera state
const CAMST = {
  view: '', snap: true, prevYaw: 0, prevPitch: 0.3, lookType: 'touch', mouseMoved: false, tx: 0, tz: 0,
  vy: 0, vp: 0.3, lastVy: 0, yawVel: 0,
  kickTP: 0, kickTY: 0, kp: 0, ky: 0,
  px: 0, py: 0, pz: 0, sx: 0, sz: 0, svx: 0, svz: 0, dist: 4.4, sh: 0, fresh: true,
  hx: 0, hy: 1.56, hz: 0.03, stepY: 0, lastY: 0, wasGround: true,
  dip: 0, dipV: 0, lroll: 0, lrollV: 0, strafeRoll: 0, turnRoll: 0, brPh: 0, bobK: 1, knockK: 0,
  cOff: 0, cvOff: 0,
  blend: 1, fromP: new V3(), fromQ: new THREE.Quaternion(), tPos: new V3(), tQ: new THREE.Quaternion(),
  fx: 0, fy: 0, fz: 1, fovBase: 62, portrait: window.innerWidth < window.innerHeight,
  headHidden: false, proxy: null, interiorCar: null,
};
const CAMSV = new Float64Array(12);                    // spring velocities (see camSpring)
const _camEul = new THREE.Euler(0, 0, 0, 'YXZ'), _camQ = new THREE.Quaternion(), _camV1 = new V3(), _camV2 = new V3();
const _aimDir = new V3();
const _camPO = { x: 0, z: 0 };
window.addEventListener('resize', () => { CAMST.portrait = window.innerWidth < window.innerHeight; });
EV.on('start', () => camReset());
EV.on('respawn', () => camReset());

// Aim ray from the camera: origin and unit direction. Weapons start bullets from here (see AGENTS.md).
// Pass `out` to reuse an object instead of allocating one.
function getAim(out) {
  camera.getWorldDirection(_aimDir);
  const o = out || {};
  o.x = camera.position.x; o.y = camera.position.y; o.z = camera.position.z; o.dx = _aimDir.x; o.dy = _aimDir.y; o.dz = _aimDir.z;
  return o;
}
function shakeCam(a) { cam.shake = Math.min(1.2, cam.shake + a); }
// footstep and landing impulses for the first-person camera (called by the player module)
function camStep(sp) { CAMST.dipV -= 0.05 + 0.15 * sstep(2.4, 4.8, sp) + 0.12 * sstep(5, 6.8, sp); }
function camLand(v) {
  CAMST.dipV -= clamp(v * 0.21, 0.3, 1.9);
  CAMST.lrollV += (Math.random() < 0.5 ? -1 : 1) * clamp(v * 0.032, 0.03, 0.24);
  if (v > 10) shakeCam(0.18);
}
function camReset() {
  CAMST.snap = true; CAMST.vy = cam.vYaw = cam.yaw; CAMST.vp = cam.vPitch = cam.pitch; CAMST.prevYaw = cam.yaw; CAMST.prevPitch = cam.pitch;
  CAMST.kickTP = CAMST.kickTY = CAMST.kp = CAMST.ky = 0; CAMST.dip = CAMST.dipV = CAMST.lroll = CAMST.lrollV = 0; cam.aim = 0; cam.shake = 0;
  CAMSV.fill(0);
}

// critically damped spring step (stable for any dt); i = slot in CAMSV for the velocity
function camSpring(cur, target, i, w, dt) {
  const x = w * dt, ex = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const ch = cur - target, tmp = (CAMSV[i] + w * ch) * dt;
  CAMSV[i] = (CAMSV[i] - w * tmp) * ex;
  return target + (ch + tmp) * ex;
}
function camSetTarget(x, y, z, yaw, pitch, roll) {
  CAMST.tPos.set(x, y, z);
  _camEul.set(-pitch, yaw + Math.PI, roll, 'YXZ'); CAMST.tQ.setFromEuler(_camEul);
  const cp = Math.cos(pitch); CAMST.fx = Math.sin(yaw) * cp; CAMST.fy = -Math.sin(pitch); CAMST.fz = Math.cos(yaw) * cp;
}
// Input post-processing: cam.yaw/pitch were moved by touch or mouse since the last frame. Touch gets a mild
// acceleration curve (slow drags precise, fast flicks turn further); aiming slows everything down.
function camLookInput(dt) {
  const mouse = CAMST.mouseMoved; CAMST.mouseMoved = false;
  const dragging = typeof lookP !== 'undefined' && lookP && lookP.id !== null;
  if (!mouse && !dragging) return;                                   // code set the angles: keep them exact
  const dy = wrapA(cam.yaw - CAMST.prevYaw), dp = cam.pitch - CAMST.prevPitch;
  if ((dy === 0 && dp === 0) || Math.abs(dy) > 0.9 || Math.abs(dp) > 0.9) return;   // big jumps are resets
  let g = lerp(1, CAMCFG.aimSens, cam.aim);
  if (dragging && CAMST.lookType !== 'mouse') g *= lerp(0.9, 1.5, sstep(0.9, 7, Math.hypot(dy, dp) / Math.max(dt, 1e-3)));
  cam.yaw = CAMST.prevYaw + dy * g; cam.pitch = CAMST.prevPitch + dp * g;
}
// the view follows the look target with a short spring: a little weight, no lag you can feel
function camSmoothView(dt) {
  const w = CAMST.lookType === 'mouse' ? CAMCFG.lookMouse : CAMCFG.lookTouch;
  CAMST.vy = wrapA(camSpring(CAMST.vy, CAMST.vy + wrapA(cam.yaw - CAMST.vy), 3, w, dt));
  CAMST.vp = camSpring(CAMST.vp, cam.pitch, 4, w, dt);
}
// pivot follows the subject with a spring; velocity feed-forward keeps only part of the lag
function camSubject(dt, x, y, z, w, wy, lag) {
  if (CAMST.fresh) {
    CAMST.px = x; CAMST.py = y; CAMST.pz = z; CAMST.svx = CAMST.svz = 0; CAMSV[0] = CAMSV[1] = CAMSV[2] = 0; CAMST.fresh = false;
  } else {
    const idt = 1 / Math.max(dt, 1e-3);
    CAMST.svx = damp(CAMST.svx, (x - CAMST.sx) * idt, 10, dt); CAMST.svz = damp(CAMST.svz, (z - CAMST.sz) * idt, 10, dt);
    const ff = 2 / w * (1 - lag);
    CAMST.px = camSpring(CAMST.px, x + CAMST.svx * ff, 0, w, dt);
    CAMST.py = camSpring(CAMST.py, y, 1, wy, dt);
    CAMST.pz = camSpring(CAMST.pz, z + CAMST.svz * ff, 2, w, dt);
  }
  CAMST.sx = x; CAMST.sz = z;
}
// keep the camera a little away from building walls (boxes the camera ray test can miss when sliding along them)
function camPushOut(x, z, y, r) {
  _camPO.x = x; _camPO.z = z;
  if (typeof cgQuery !== 'function') return _camPO;
  const list = cgQuery(x - r, x + r, z - r, z + r);
  for (let k = 0; k < list.length; k++) {
    const c = list[k]; if (c.t !== 0 || c.h < 2 || y > c.h + 0.2) continue;
    const qx = clamp(_camPO.x, c.x0, c.x1), qz = clamp(_camPO.z, c.z0, c.z1), dx = _camPO.x - qx, dz = _camPO.z - qz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r || d2 < 1e-10) continue;
    const d = Math.sqrt(d2), pen = r - d; _camPO.x += dx / d * pen; _camPO.z += dz / d * pen;
  }
  return _camPO;
}
// orbit rig around the pivot (CAMST.px/py/pz): shoulder offset to the right, boom back along the view, wall tests
function camOrbit(dt, sh, dist, minD) {
  const yaw = CAMST.vy + CAMST.ky, pitch = CAMST.vp + CAMST.kp;
  const cp = Math.cos(pitch), sp = Math.sin(pitch), sy = Math.sin(yaw), cy = Math.cos(yaw);
  const fx = sy * cp, fy = -sp, fz = cy * cp, rx = -cy, rz = sy;
  const px = CAMST.px, py = CAMST.py, pz = CAMST.pz;
  let s = sh;
  if (s > 0.01) { const t = rayBoxes(px, py, pz, rx, 0, rz, s + 0.32); if (t < s + 0.32) s = Math.max(0, t - 0.32); }
  CAMST.sh = s < CAMST.sh ? s : damp(CAMST.sh, s, 5, dt);
  const ox = px + rx * CAMST.sh, oz = pz + rz * CAMST.sh, L = dist + 0.35, o = 0.2;
  const t = Math.min(rayBoxes(ox, py, oz, -fx, -fy, -fz, L), rayBoxes(ox + rx * o, py, oz + rz * o, -fx, -fy, -fz, L),
    rayBoxes(ox - rx * o, py, oz - rz * o, -fx, -fy, -fz, L), rayBoxes(ox, py + o, oz, -fx, -fy, -fz, L));
  const d = t < L ? Math.max(minD, t - 0.35) : dist;
  CAMST.dist = d < CAMST.dist ? d : damp(CAMST.dist, d, 3.2, dt);
  let y = py - fy * CAMST.dist;
  const p = camPushOut(ox - fx * CAMST.dist, oz - fz * CAMST.dist, y, 0.24);
  const g = groundH(p.x, p.z) + 0.3; if (y < g) y = g;
  camSetTarget(p.x, y, p.z, yaw, pitch, 0);
}

// ---------- views ----------
function viewTP(dt) {
  const P = player, a = sstep(0, 1, cam.aim), sp = Math.hypot(P.vx, P.vz);
  // a moving hero slowly pulls the camera behind him while the player leaves the camera alone (phones)
  if (!cam.locked && cam.idle > 2 && a < 0.01 && sp > 2 && P.knockT <= 0) {
    const d = wrapA(P.h - cam.yaw);
    if (Math.abs(d) < 1.9) cam.yaw = dampA(cam.yaw, P.h, 0.55 * sstep(2, 5, sp), dt);
  }
  cam.pitch = clamp(cam.pitch, lerp(-0.65, -0.9, a), lerp(1.2, 1.0, a));
  camSmoothView(dt);
  CAMST.knockK = damp(CAMST.knockK, P.knockT > 0 ? 1 : 0, 4, dt);
  const h = lerp(lerp(CAMCFG.tpHeight, CAMCFG.aimHeight, a), 0.95, CAMST.knockK);
  camSubject(dt, P.x, P.y + h, P.z, CAMCFG.tpSpring, CAMCFG.tpSpringY, CAMCFG.tpLag);
  camOrbit(dt, lerp(CAMCFG.tpShoulder, CAMCFG.aimShoulder, a) * (1 - CAMST.knockK), lerp(CAMCFG.tpDist * cam.zoom, CAMCFG.aimDist, a), 0.75);
  // shots from the camera must not hit anything before they pass the hero
  const dx = P.x - CAMST.tPos.x, dy = P.y + 1.2 - CAMST.tPos.y, dz = P.z - CAMST.tPos.z;
  cam.aimMinDist = Math.max(0, dx * CAMST.fx + dy * CAMST.fy + dz * CAMST.fz + 0.5);
}
function viewFP(dt) {
  const P = player, H = P.H, bob = CAMST.bobK;
  cam.pitch = clamp(cam.pitch, -1.3, 1.38);
  camSmoothView(dt);
  // posture: the head bone in the body frame, low-pass filtered (keeps crouches and leans, drops gait jitter)
  H.bones[HB.head].getWorldPosition(_camV1);
  const ch = Math.cos(P.h), shh = Math.sin(P.h), dx = _camV1.x - P.x, dy = _camV1.y - P.y, dz = _camV1.z - P.z;
  const lx = clamp(dx * ch - dz * shh, -0.18, 0.18), ly = clamp(dy, 0.5, 1.9), lz = clamp(dx * shh + dz * ch, -0.2, 0.35);
  if (CAMST.fresh) { CAMST.hx = lx; CAMST.hy = ly; CAMST.hz = lz; CAMST.stepY = 0; CAMST.lastY = P.y; CAMST.fresh = false; }
  const k = bob > 0.5 ? 6 : 3.5;
  CAMST.hx = damp(CAMST.hx, lx, k, dt); CAMST.hy = damp(CAMST.hy, ly, k, dt); CAMST.hz = damp(CAMST.hz, lz, k, dt);
  // kerbs and steps: the eye glides instead of popping
  if (P.onGround && CAMST.wasGround && Math.abs(P.y - CAMST.lastY) < 0.6) CAMST.stepY -= P.y - CAMST.lastY;
  CAMST.stepY = damp(CAMST.stepY, 0, 11, dt); CAMST.lastY = P.y; CAMST.wasGround = P.onGround;
  // gait-driven bob, sway and roll (heel strike at phase k·π)
  const sp = P.anim.speed || 0, mv = sstep(0.25, 1.4, sp), run = sstep(2.4, 4.8, sp), spr = sstep(4.8, 6.6, sp);
  const ph = H.phase, c2 = 0.5 + 0.5 * Math.cos(2 * ph - run * 0.5), s1 = Math.sin(ph), gnd = P.onGround ? 1 : 0;
  let by = -mv * gnd * (lerp(0.02, 0.036, run) + spr * 0.012) * c2;
  let bx = mv * gnd * lerp(0.018, 0.011, run) * s1;                     // toward the stance leg (body left > 0)
  let roll = mv * gnd * lerp(0.007, 0.012, run) * s1;
  let pn = mv * gnd * lerp(0.005, 0.011, run) * c2;
  // breathing (faster and deeper when winded) and a slow idle sway
  const br = P.breath || 0;
  CAMST.brPh += dt * lerp(1.45, 5.6, br);
  const bs = Math.sin(CAMST.brPh), ba = lerp(0.0045, 0.016, br), idl = 1 - mv, t = GAME.time;
  by += bs * ba * (1 - 0.5 * mv); pn -= bs * ba * 0.55;
  bx += idl * 0.005 * Math.sin(t * 0.41) + br * 0.004 * Math.sin(t * 0.83);
  roll += idl * 0.0035 * Math.sin(t * 0.29 + 1);
  // lean into strafes and hard turns
  const yaw0 = CAMST.vy, rx = -Math.cos(yaw0), rz = Math.sin(yaw0);
  CAMST.strafeRoll = damp(CAMST.strafeRoll, clamp(-(P.vx * rx + P.vz * rz) * 0.0055, -0.024, 0.024), 6, dt);
  CAMST.turnRoll = damp(CAMST.turnRoll, clamp(CAMST.yawVel * 0.0065 * mv, -0.035, 0.035), 5, dt);
  roll += CAMST.strafeRoll + CAMST.turnRoll;
  // impacts keep a little motion even with the bob switched off
  const imp = 0.35 + 0.65 * bob;
  by = by * bob + CAMST.dip * imp; bx *= bob; pn = pn * bob - CAMST.dip * 0.8 * imp; roll = roll * bob + CAMST.lroll * imp;
  // the eyes sit in front of the neck pivot and swing forward and down when looking down
  const hp = clamp(CAMST.vp, -0.7, 1.3), dn = Math.max(0, Math.sin(hp));
  const fwd = 0.085 * Math.cos(hp) + 0.12 * Math.sin(hp) + 0.045 * dn * dn, up = 0.12 * Math.cos(hp) - 0.085 * Math.sin(hp) + 0.03 * dn;
  const yaw = CAMST.vy + CAMST.ky, sy = Math.sin(yaw), cy = Math.cos(yaw);
  const nx = P.x + CAMST.hx * ch + CAMST.hz * shh, nz = P.z - CAMST.hx * shh + CAMST.hz * ch, ny = P.y + CAMST.stepY + CAMST.hy;
  camSetTarget(nx + sy * fwd - rx * bx, ny + up + by, nz + cy * fwd - rz * bx, yaw, CAMST.vp + CAMST.kp + pn, roll);
  cam.aimMinDist = 0.3;
}
function viewChase(dt, c) {
  const sp = c.speed;
  if (cam.idle > 1.1) {
    const base = c.vf < -4 ? c.h + Math.PI : c.h;
    let target = base;
    if (c.vf >= -4 && sp > 5) target += wrapA(Math.atan2(c.vx, c.vz) - base) * 0.3;   // show the drift angle
    target -= clamp(c.yawRate, -2, 2) * 0.14;                                          // look into the turn
    cam.yaw = dampA(cam.yaw, target, Math.min(4.5, 1 + sp * 0.12), dt);
    cam.pitch = damp(cam.pitch, 0.2, 1.8, dt);
  }
  cam.pitch = clamp(cam.pitch, -0.3, 1.1);
  camSmoothView(dt);
  camSubject(dt, c.x, c.y + 1.5, c.z, CAMCFG.carSpring, CAMCFG.carSpringY, CAMCFG.carLag);
  camOrbit(dt, 0, (5.9 + c.T.L * 0.42 + Math.min(sp, 45) * 0.055) * cam.zoom, 1.4);
  cam.aimMinDist = 0;
}
function viewCockpit(dt, c) {
  // free look around the car heading; recentres (looking slightly into turns) when left alone
  CAMST.cOff = clamp(wrapA(CAMST.cOff + wrapA(cam.yaw - CAMST.prevYaw)), -1.75, 1.75);
  if (cam.idle > 0.9) {
    CAMST.cOff = damp(CAMST.cOff, clamp(-c.yawRate * 0.11, -0.3, 0.3), 2.6, dt);
    cam.pitch = damp(cam.pitch, 0.03, 2.2, dt);
  }
  cam.pitch = clamp(cam.pitch, -0.55, 0.85);
  const w = CAMST.lookType === 'mouse' ? CAMCFG.lookMouse : CAMCFG.lookTouch;
  CAMST.cvOff = camSpring(CAMST.cvOff, CAMST.cOff, 7, w, dt);
  CAMST.vp = camSpring(CAMST.vp, cam.pitch, 4, w, dt);
  cam.yaw = c.h + CAMST.cOff; CAMST.vy = wrapA(c.h + CAMST.cvOff);
  c.eyeWorld(_camV1);
  // road and engine vibration, body pitch and roll
  const t = GAME.time, sp = c.speed, m = 0.4 + 0.6 * CAMST.bobK;
  const vib = CAMST.bobK * Math.min(1, sp / 40) * 0.006 * (Math.sin(t * 31) * 0.6 + Math.sin(t * 47.3) * 0.4);
  camSetTarget(_camV1.x, _camV1.y + 0.05 + vib, _camV1.z, CAMST.vy + CAMST.ky, CAMST.vp + CAMST.kp + c.pitch * 0.85 * m, -c.roll * 0.7 * m);
  cam.aimMinDist = 0;
}
function viewDeath(dt) {
  const P = player;
  cam.yaw += dt * 0.2; cam.pitch = damp(cam.pitch, 0.5, 1.5, dt);
  camSmoothView(dt);
  camSubject(dt, P.x, P.y + (P.anim.hands ? 1.3 : 0.6), P.z, 6, 6, 0);
  camOrbit(dt, 0, 4.6 * cam.zoom, 1.0);
  cam.aimMinDist = 0;
}

function camEnterView(view, snap) {
  const prev = CAMST.view; CAMST.view = view;
  if (snap || !prev) CAMST.blend = 1; else { CAMST.fromP.copy(camera.position); CAMST.fromQ.copy(camera.quaternion); CAMST.blend = 0; }
  CAMST.fresh = true;
  if (view === 'cockpit') { CAMST.cOff = CAMST.cvOff = 0; CAMSV[7] = 0; cam.pitch = 0.03; }
  if (view === 'chase' && prev === 'cockpit') cam.pitch = 0.2;
  const c = view === 'cockpit' ? player.car : null;
  if (CAMST.interiorCar !== c) {
    if (CAMST.interiorCar && typeof CAMST.interiorCar.setInteriorVisible === 'function') CAMST.interiorCar.setInteriorVisible(false);
    if (c && typeof c.setInteriorVisible === 'function') c.setInteriorVisible(true);
    CAMST.interiorCar = c;
  }
  EV.emit('camView', view);
}
function camApply(dt, fpView) {
  const p = camera.position, q = camera.quaternion;
  if (CAMST.blend < 1) {
    CAMST.blend = Math.min(1, CAMST.blend + dt / CAMCFG.blendTime);
    const e = CAMST.blend * CAMST.blend * (3 - 2 * CAMST.blend);
    p.lerpVectors(CAMST.fromP, CAMST.tPos, e); q.slerpQuaternions(CAMST.fromQ, CAMST.tQ, e);
  } else { p.copy(CAMST.tPos); q.copy(CAMST.tQ); }
  if (cam.shake > 0) {
    // smooth multi-sine shake: a little position, mostly rotation in first person
    const s = Math.min(1.2, cam.shake) * (0.5 + 0.5 * CAMST.bobK), t = GAME.time;   // calmer with the bob switched off
    const n1 = Math.sin(t * 41.3) * 0.6 + Math.sin(t * 67.9 + 1.3) * 0.4, n2 = Math.sin(t * 37.7 + 2.1) * 0.6 + Math.sin(t * 59.1 + 0.4) * 0.4;
    const n3 = Math.sin(t * 45.1 + 4.2) * 0.6 + Math.sin(t * 71.3 + 2.7) * 0.4;
    const pa = s * (fpView ? 0.025 : 0.12), ra = s * (fpView ? 0.02 : 0.01) + s * s * 0.012;
    p.x += n1 * pa; p.y += n2 * pa; p.z += n3 * pa;
    _camEul.set(n2 * ra, n1 * ra, n3 * ra * 1.3, 'YXZ'); _camQ.setFromEuler(_camEul); q.multiply(_camQ);
    cam.shake = Math.max(0, cam.shake - dt * 2.4);
  }
}
function camLens(dt, view, car) {
  const base = CAMST.portrait ? 78 : 62, P = player;
  const spr = car ? 0 : sstep(4.6, 6.6, P.anim.speed || 0);
  let f = base, aimZoom = 0;
  if (view === 'fp') { f = base + 8 + spr * 4; aimZoom = 15; }
  else if (view === 'tp') { f = base + spr * 3; aimZoom = 12; }
  else if (view === 'chase') f = base + Math.min(14, car.speed * 0.26) + (car.usingNitro ? 7 : 0);
  else if (view === 'cockpit') f = base + 10 + Math.min(8, car.speed * 0.15) + (car.usingNitro ? 5 : 0);
  CAMST.fovBase = CAMST.snap ? f : damp(CAMST.fovBase, f, 3, dt);
  const fov = CAMST.fovBase - aimZoom * sstep(0, 1, cam.aim);
  const near = view === 'fp' ? CAMCFG.nearFP : view === 'cockpit' ? CAMCFG.nearCar : CAMCFG.nearTP;
  if (Math.abs(camera.fov - fov) > 0.01 || camera.near !== near) { camera.fov = fov; camera.near = near; camera.updateProjectionMatrix(); }
}
// hide the hero's head (the mesh is skinned: hair and glasses follow) while the camera is inside it;
// an invisible proxy keeps the head in the sun shadow
function camHead() {
  const P = player, H = P.H; if (!H) return;
  const hb = H.bones[HB.head];
  let hide = false;
  if (P.root.visible && !cam.override) { hb.getWorldPosition(_camV2); hide = _camV2.distanceToSquared(camera.position) < 0.2; }
  if (hide !== CAMST.headHidden) { CAMST.headHidden = hide; hb.scale.setScalar(hide ? 0.001 : 1); }
  if (hide && !CAMST.proxy) {
    CAMST.proxy = new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 8), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
    CAMST.proxy.scale.set(1, 1.15, 1.1); CAMST.proxy.castShadow = true; CAMST.proxy.name = 'heroHeadShadow'; scene.add(CAMST.proxy);
  }
  if (CAMST.proxy) { CAMST.proxy.visible = hide; if (hide) { CAMST.proxy.position.copy(_camV2); CAMST.proxy.position.y += 0.12; CAMST.proxy.rotation.y = P.h; } }
}

function updateCamera(dt) {
  if (cam.override) {
    if (CAMST.view !== 'override') camEnterView('override', true);
    cam.override(dt);
    cam.fp = false; cam.view = 'override'; cam.blend = 1; cam.aim = 0;
    CAMST.prevYaw = cam.yaw; CAMST.prevPitch = cam.pitch; CAMST.vy = cam.vYaw = cam.yaw; CAMST.vp = cam.vPitch = cam.pitch;
    camHead();
    return;
  }
  camLookInput(dt);
  const P = player, car = P.mode === 'car' && P.car ? P.car : null;
  const view = P.dead ? 'death' : car ? (cam.fpPref ? 'cockpit' : 'chase') : (cam.fpPref && P.knockT <= 0 ? 'fp' : 'tp');
  // teleports (missions, respawn, tests) snap instead of sweeping across the city
  const sx = car ? car.x : P.x, sz = car ? car.z : P.z;
  const snap = CAMST.snap || Math.abs(sx - CAMST.tx) + Math.abs(sz - CAMST.tz) > 12;
  CAMST.tx = sx; CAMST.tz = sz;
  if (snap) { CAMST.fresh = true; CAMST.blend = 1; }
  if (view !== CAMST.view) camEnterView(view, snap);
  cam.idle += dt;
  const aimOk = cam.wantAim && !car && !P.dead && P.knockT <= 0;
  cam.aim = clamp(cam.aim + (aimOk ? dt : -dt) / 0.2, 0, 1);
  CAMST.bobK = damp(CAMST.bobK, cam.bob, 4, dt);
  // recoil: the target jumps, the offset rises fast and recovers
  CAMST.kickTP = damp(CAMST.kickTP, 0, 7, dt); CAMST.kickTY = damp(CAMST.kickTY, 0, 7, dt);
  CAMST.kp = camSpring(CAMST.kp, CAMST.kickTP, 5, 42, dt); CAMST.ky = camSpring(CAMST.ky, CAMST.kickTY, 6, 42, dt);
  // impact springs: dip (m) and landing roll (rad)
  CAMST.dipV += (-169 * CAMST.dip - 15.6 * CAMST.dipV) * dt; CAMST.dip += CAMST.dipV * dt;
  CAMST.lrollV += (-64 * CAMST.lroll - 7.2 * CAMST.lrollV) * dt; CAMST.lroll += CAMST.lrollV * dt;
  if (view === 'fp') viewFP(dt); else if (view === 'tp') viewTP(dt);
  else if (view === 'chase') viewChase(dt, car); else if (view === 'cockpit') viewCockpit(dt, car); else viewDeath(dt);
  const yr = wrapA(CAMST.vy - CAMST.lastVy) / Math.max(dt, 1e-3); CAMST.lastVy = CAMST.vy;
  CAMST.yawVel = snap ? 0 : damp(CAMST.yawVel, clamp(yr, -12, 12), 8, dt);
  const fpView = view === 'fp' || view === 'cockpit';
  camApply(dt, fpView);
  camLens(dt, view, car);
  camHead();
  cam.fp = fpView; cam.view = view; cam.blend = CAMST.blend; cam.vYaw = CAMST.vy; cam.vPitch = CAMST.vp; cam.curDist = CAMST.dist;
  CAMST.prevYaw = cam.yaw; CAMST.prevPitch = cam.pitch; CAMST.snap = false;
}
