// ============================================================
//  Weapons & combat (owner: weapons)
//  fireBullet() is the shared hit-scan entry point used by the player and by police.
// ============================================================
// o: { x, y, z: origin; dx, dy, dz: unit direction; range = 120; damage = 20; shooter: 'player' | Ped | Car;
//      spread = 0 (radians-ish jitter); minDist = 0 (ignore hits closer than this, e.g. camera to player) }
// returns { type: 'ped' | 'car' | 'player' | 'world' | null, target, x, y, z, dist }
function fireBullet(o) {
  const range = o.range || 120, min = o.minDist || 0;
  let dx = o.dx, dy = o.dy, dz = o.dz;
  if (o.spread) { dx += rr(-o.spread, o.spread); dy += rr(-o.spread, o.spread); dz += rr(-o.spread, o.spread); const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l; }
  let best = rayBoxes(o.x, o.y, o.z, dx, dy, dz, range), type = best < range ? 'world' : null, target = null;
  if (dy < -1e-4) { const tg = (groundH(o.x, o.z) - o.y) / dy; if (tg > min && tg < best) { best = tg; type = 'world'; } }
  const h2 = dx * dx + dz * dz || 1e-6;
  const cyl = (cx, cz, y0, y1, r) => {
    const t = ((cx - o.x) * dx + (cz - o.z) * dz) / h2;
    if (t < min || t > best) return -1;
    const px = o.x + dx * t - cx, pz = o.z + dz * t - cz;
    if (px * px + pz * pz > r * r) return -1;
    const py = o.y + dy * t;
    return py < y0 || py > y1 ? -1 : t;
  };
  for (const p of peds) {
    if (p === o.shooter || p.removed || Math.abs(p.x - o.x) > range || Math.abs(p.z - o.z) > range) continue;
    const low = p.state === 'dead' || p.state === 'down' || p.state === 'fly';
    const t = cyl(p.x, p.z, p.y, p.y + (low ? 0.45 : 1.85), low ? 0.7 : 0.33);
    if (t >= 0 && t < best) { best = t; type = 'ped'; target = p; }
  }
  for (const c of cars) {
    if (c === o.shooter || Math.abs(c.x - o.x) > range || Math.abs(c.z - o.z) > range) continue;
    const r = carCircles(c, CA);
    for (let k = 0; k < 3; k++) {
      const t = cyl(CA[k * 2], CA[k * 2 + 1], c.y + 0.25, c.y + c.T.H + c.T.cabH, r);
      if (t >= 0 && t < best) { best = t; type = 'car'; target = c; }
    }
  }
  if (o.shooter !== 'player' && !player.dead && player.mode === 'foot') {
    const t = cyl(player.x, player.z, player.y, player.y + 1.85, 0.35);
    if (t >= 0 && t < best) { best = t; type = 'player'; target = player; }
  }
  const hx = o.x + dx * best, hy = o.y + dy * best, hz = o.z + dz * best;
  if (type === 'ped') target.damage(o.damage || 20, o.shooter, dx, dz);
  else if (type === 'car') {
    target.damage((o.damage || 20) * 0.25, o.shooter);
    if (target === player.car && o.shooter !== 'player') hurtPlayer((o.damage || 20) * 0.3, 'Застрелен в машине');
  } else if (type === 'player') hurtPlayer(o.damage || 20, 'Застрелен');
  if (type === 'world' || type === 'car') sparks(hx, hy, hz, 6);
  for (let i = 1; i <= 6; i++) { const t = Math.min(best, range) * i / 7; fireFx.emit(o.x + dx * t, o.y + dy * t, o.z + dz * t, 0, 0, 0, 0.06, 0.12, 0.05, 1.6, 1.3, 0.7, 1, 1, 0.6, 0.2, 0, 0); }
  EV.emit('gunshot', { x: o.x, y: o.y, z: o.z, shooter: o.shooter });
  const res = { type, target, x: hx, y: hy, z: hz, dist: best };
  if (type) EV.emit('bulletHit', Object.assign({ shooter: o.shooter }, res));
  return res;
}
// Attach a weapon model to a character's right hand (H from buildHuman). Returns the mesh or null.
// type: 'pistol' | 'smg' | 'shotgun' | 'rifle' | 'bat'. Implemented by the weapons module.
function attachGun(H, type) { return null; }
