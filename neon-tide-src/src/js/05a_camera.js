// ============================================================
//  Camera (owner: camera & feel)
// ============================================================
// ---------- camera ----------
// cam.fp: first-person view active. cam.override(dt): when set (creative free camera), it drives the camera instead.
const cam = { yaw: 0, pitch: 0.3, idle: 0, shake: 0, zoom: 1, curDist: 6, look: 0, fp: false, override: null };
// Aim ray from the camera: origin and unit direction. Weapons start bullets from here (see AGENTS.md).
const _aimDir = new V3();
function getAim() {
  camera.getWorldDirection(_aimDir);
  return { x: camera.position.x, y: camera.position.y, z: camera.position.z, dx: _aimDir.x, dy: _aimDir.y, dz: _aimDir.z };
}
function shakeCam(a) { cam.shake = Math.min(1.2, cam.shake + a); }
function updateCamera(dt) {
  if (cam.override) { cam.override(dt); return; }
  let tx, ty, tz, dist;
  if (player.mode === 'car' && player.car) {
    const c = player.car;
    tx = c.x; ty = c.y + 1.55; tz = c.z;
    dist = 6.2 + c.T.L * 0.45 + Math.min(c.speed, 45) * 0.055;
    cam.idle += dt;
    if (cam.idle > 1.1) {
      const target = c.vf < -4 ? c.h + Math.PI : c.h;
      cam.yaw = dampA(cam.yaw, target, Math.min(4.5, 1 + c.speed * 0.12), dt);
      cam.pitch = damp(cam.pitch, 0.2, 1.8, dt);
    }
  } else {
    tx = player.x; ty = player.y + 1.6; tz = player.z; dist = 4.4;
    cam.idle += dt;
  }
  cam.pitch = clamp(cam.pitch, -0.25, 1.15);
  dist *= cam.zoom;
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const dx = -Math.sin(cam.yaw) * cp, dy = sp, dz = -Math.cos(cam.yaw) * cp;
  const t = rayBoxes(tx, ty, tz, dx, dy, dz, dist + 0.5);
  const d = t < dist + 0.5 ? Math.max(1.0, t - 0.5) : dist;
  cam.curDist = d < cam.curDist ? d : damp(cam.curDist, d, 3, dt);
  let cx = tx + dx * cam.curDist, cy = ty + dy * cam.curDist, cz = tz + dz * cam.curDist;
  cy = Math.max(cy, groundH(cx, cz) + 0.35);
  if (cam.shake > 0) {
    const s = cam.shake * 0.22;
    cx += (Math.random() - 0.5) * s; cy += (Math.random() - 0.5) * s; cz += (Math.random() - 0.5) * s;
    cam.shake = Math.max(0, cam.shake - dt * 2.4);
  }
  camera.position.set(cx, cy, cz);
  camera.lookAt(tx, ty + 0.1, tz);
  const base = window.innerWidth < window.innerHeight ? 78 : 62;
  const spd = player.mode === 'car' && player.car ? player.car.speed : 0;
  const fov = base + Math.min(14, spd * 0.26) + (player.car && player.car.usingNitro ? 7 : 0);
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = damp(camera.fov, fov, 3, dt); camera.updateProjectionMatrix(); }
}

