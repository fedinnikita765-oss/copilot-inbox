// ============================================================
//  Player arsenal (owner: weapons): owned weapons and ammo (saved in save.arsenal), firing, reloading,
//  switching, bat, grenades, drive-by, crimes, touch aim assist and the hero's combat animation fields.
//  Public: WPN_ARS (state), wpnArsStore(), wpnArsSelect(id), wpnArsCycle(dir), wpnArsReload(), wpnArsThrow(), wpnArsGive(id, rounds),
//  wpnArsAddAmmo(id, rounds), wpnArsAmmo(id), wpnArsOwned(id), wpnArsSpread().
//  Input fields: input.fire (held), input.aim (held/toggled by the UI), set by 05e_wui.js.
// ============================================================
const WPN_SWITCH_T = 0.42;
const WPN_ARS = {
  cur: 'fists', last: 'pistol', want: null, switchT: 0, cd: 0, reloadT: 0, reloadDur: 1, reloading: false, rackT: 0,
  bloom: 0, aim: false, aimSm: 0, raise: 0, sinceShot: 9, firePrev: false, swingT: 0, swingHit: false,
  throwT: 0, throwReq: false, throwDone: true, reloadReq: false, crimeT: 0, fleeT: 0, hitT: 0, hitKill: false, hitHead: false,
  kick: 0, kickAcc: 0, shotN: 0, touch: isTouch, shoulder: 0, dbWeapon: null, dbOk: false, aimPt: new V3(), aimYaw: 0, aimPitch: 0,
  infinite: false, cPoses: false, msgT: 0,
};
const WPN_ARS_CREATIVE = { owned: {}, mag: {}, res: {}, gren: 99, cur: 'pistol' };
function wpnArsDefault() { return { v: 1, owned: { fists: true }, mag: {}, res: {}, gren: 0, cur: 'fists' }; }
function wpnArsStore() {
  if (GAME.mode === 'creative') return WPN_ARS_CREATIVE;
  let s = save.arsenal;
  if (!s || typeof s !== 'object' || !s.owned) { s = save.arsenal = wpnArsDefault(); }
  if (!s.mag) s.mag = {}; if (!s.res) s.res = {}; if (typeof s.gren !== 'number') s.gren = 0;
  s.owned.fists = true;
  return s;
}
(function initCreativeStore() {
  for (const id of WPN_WEAPON_ORDER) { const W = WPN_WEAPONS[id]; WPN_ARS_CREATIVE.owned[id] = true; if (W.kind === 'gun') { WPN_ARS_CREATIVE.mag[id] = W.mag; WPN_ARS_CREATIVE.res[id] = W.maxRes; } }
})();
const wpnArsOwned = (id) => !!wpnArsStore().owned[id];
function wpnArsAmmo(id) { const s = wpnArsStore(); return { mag: s.mag[id] | 0, res: s.res[id] | 0 }; }
const wpnArsWeapon = () => WPN_WEAPONS[WPN_ARS.cur] || WPN_WEAPONS.fists;
const wpnArsGunDrawn = () => wpnArsWeapon().kind === 'gun';
// Give a weapon (and/or rounds). Returns true if it was new.
function wpnArsGive(id, rounds) {
  const s = wpnArsStore(), W = WPN_WEAPONS[id]; if (!W) return false;
  const fresh = !s.owned[id];
  s.owned[id] = true;
  if (W.kind === 'gun') {
    if (fresh) { s.mag[id] = Math.min(W.mag, rounds || W.mag); rounds = Math.max(0, (rounds || W.mag) - s.mag[id]); }
    wpnArsAddAmmo(id, rounds || 0);
  }
  if (GAME.mode !== 'creative') writeSave();
  return fresh;
}
function wpnArsAddAmmo(id, rounds) {
  const s = wpnArsStore(), W = WPN_WEAPONS[id]; if (!W || W.kind !== 'gun') return 0;
  const before = s.res[id] | 0;
  s.res[id] = Math.min(W.maxRes, before + (rounds | 0));
  return s.res[id] - before;
}
function wpnArsSelect(id) {
  if (!WPN_WEAPONS[id] || !wpnArsOwned(id) || player.mode !== 'foot') return false;
  if (id === WPN_ARS.cur) { WPN_ARS.want = null; return true; }
  if (WPN_ARS.want === id) return true;
  WPN_ARS.want = id; return true;
}
function wpnArsCycle(dir) {
  const list = WPN_WEAPON_ORDER.filter((id) => wpnArsOwned(id));
  const from = WPN_ARS.want || WPN_ARS.cur;
  let i = list.indexOf(from); if (i < 0) i = 0;
  wpnArsSelect(list[(i + dir + list.length) % list.length]);
}
function wpnArsReload() { WPN_ARS.reloadReq = true; }
function wpnArsThrow() { WPN_ARS.throwReq = true; }
const wpnArsInfinite = () => GAME.mode === 'creative';

// ---------- helpers ----------
// Camera aim ray, read once per update (wpnRefreshAim) and shared by everything in the arsenal update.
const _wpnAimA = { x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 1 };
// First-person view is fully active (camera module blends views over cam.blend 0..1).
function wpnFpView() { return cam.fp === true && (cam.blend === undefined || cam.blend >= 1); }
// Creative build mode (owner E): free camera, taps place objects — weapons ignore fire/aim/throw input.
function wpnBuilding() { return typeof CREATIVE !== 'undefined' && !!CREATIVE && !!CREATIVE.building; }
const _wpnAimOut = { x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 1 };
function wpnRefreshAim() {
  const a = getAim(_wpnAimOut) || _wpnAimOut;
  _wpnAimA.x = a.x; _wpnAimA.y = a.y; _wpnAimA.z = a.z; _wpnAimA.dx = a.dx; _wpnAimA.dy = a.dy; _wpnAimA.dz = a.dz;
  return _wpnAimA;
}
const wpnAimRay = () => _wpnAimA;
// Distance along the camera ray where the hero stands (third person), so bullets ignore things between camera and hero.
function wpnAimMin(A) {
  if (typeof cam.aimMinDist === 'number') return cam.aimMinDist;
  if (wpnFpView()) return 0.25;
  const t = (player.x - A.x) * A.dx + (player.y + 1.45 - A.y) * A.dy + (player.z - A.z) * A.dz;
  return Math.max(0.4, t + 0.75);
}
function wpnArsSpread() {
  const W = wpnArsWeapon(); if (W.kind !== 'gun') return 0;
  const P = player, sp = Math.hypot(P.vx, P.vz), aimK = lerp(1, wpnFpView() ? 0.35 : 0.6, WPN_ARS.aimSm);
  if (W.id === 'shotgun') return W.spread * lerp(1, 0.8, WPN_ARS.aimSm);
  const s = W.spread * aimK * (1 + Math.min(1, sp / 6) * 0.9) * (P.onGround ? 1 : 2.2);
  return Math.min(W.maxSpread * 1.6, s + WPN_ARS.bloom);
}
function wpnCanAct() {
  const P = player;
  return GAME.state === 'play' && !P.dead && P.knockT <= 0 && !wpnBuilding() && !(typeof WPN_WSHOP !== 'undefined' && WPN_WSHOP.open) && !(typeof WPN_WUI !== 'undefined' && WPN_WUI.wheelOpen);
}
function wpnCharRight(h, out) { return out.set(-Math.cos(h), 0, Math.sin(h)); }
function wpnArsToast(t, w) { if (WPN_ARS.msgT <= 0) { HUD.toast(t, w ? 'warn' : undefined); WPN_ARS.msgT = 1.6; } }

// ---------- crimes & reactions ----------
function wpnShotReaction(x, z, hits) {
  if (hits.cop) addCrime(hits.copKill ? 2.2 : 1.6, hits.copKill ? 'Нападение на полицейского!' : 'Стрельба по полиции!');
  else if (hits.copCar) addCrime(0.9, 'Стрельба по патрульной машине!');
  else if (hits.kill) addCrime(1.0, 'Перестрелка на улице — полиция уже едет');
  else if (hits.ped) addCrime(0.55, 'Стрельба по прохожим');
  else if (hits.car && WPN_ARS.crimeT <= 0) { addCrime(0.25, 'Стрельба по машинам'); WPN_ARS.crimeT = 2.5; }
  if (WPN_ARS.fleeT <= 0) {
    WPN_ARS.fleeT = 0.4;
    let wit = false;
    for (const p of peds) {
      if (p.state === 'dead' || p.state === 'fly' || p.removed) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < 26) { p.flee(x, z); wit = true; } else if (d < 38) wit = true;
    }
    for (const pc of police) if (Math.hypot(pc.car.x - x, pc.car.z - z) < 70) wit = true;
    if (wit && WPN_ARS.crimeT <= 0 && !hits.ped && !hits.cop && !hits.copCar) { addCrime(0.35, 'Стрельба на улице — свидетели звонят в полицию'); WPN_ARS.crimeT = 3; }
  }
}
function wpnIsCopCar(c) { return !!(c && (c.driver === 'police' || (c.T && c.T.police))); }
const _wpnHits = { ped: false, kill: false, cop: false, copKill: false, car: false, copCar: false, any: false, head: false };
function wpnTallyHit(r) {
  if (!r || !r.type) return;
  if (r.type === 'ped') {
    _wpnHits.ped = true; _wpnHits.any = true; if (r.head) _wpnHits.head = true;
    if (r.killed) _wpnHits.kill = true;
    if (r.target.cop) { _wpnHits.cop = true; if (r.killed) _wpnHits.copKill = true; }
  } else if (r.type === 'car') { _wpnHits.car = true; _wpnHits.any = true; if (wpnIsCopCar(r.target)) _wpnHits.copCar = true; }
}
function wpnResetHits() { for (const k in _wpnHits) _wpnHits[k] = false; }

// ---------- shooting ----------
const _wpnAimT = { type: null }, _wpnOrg = new V3(), _wpnDir = new V3(), _wpnMz = new V3(), _wpnEj = new V3(), _wpnRt = new V3();
// The hero's aim point into WPN_ARS.aimPt: a real ray cast (skipping the hero) when firing, else a cheap point down the ray.
function wpnUpdateAimPoint(range, trace) {
  const A = wpnAimRay(), min = wpnAimMin(A);
  if (trace) wpnTraceShot(A.x, A.y, A.z, A.dx, A.dy, A.dz, range + min, min, 'player', null, _wpnAimT);
  if (trace && _wpnAimT.type) WPN_ARS.aimPt.set(_wpnAimT.x, _wpnAimT.y, _wpnAimT.z);
  else { const d = trace ? range + min : min + 30; WPN_ARS.aimPt.set(A.x + A.dx * d, A.y + A.dy * d, A.z + A.dz * d); }
  WPN_ARS.aimYaw = Math.atan2(A.dx, A.dz); WPN_ARS.aimPitch = Math.asin(clamp(A.dy, -1, 1));
  return A;
}
function wpnPlayerShoot(W) {
  const st = wpnArsStore(), P = player, inf = wpnArsInfinite();
  const A = wpnAimRay(), fp = wpnFpView(), min = wpnAimMin(A);
  let ox, oy, oz;
  if (fp) { ox = A.x; oy = A.y; oz = A.z; _wpnDir.set(A.dx, A.dy, A.dz); }
  else {
    wpnUpdateAimPoint(W.range, true);
    wpnCharRight(P.h, _wpnRt);
    ox = P.x + _wpnRt.x * 0.2 + Math.sin(P.h) * 0.15; oy = P.y + 1.42; oz = P.z + _wpnRt.z * 0.2 + Math.cos(P.h) * 0.15;
    _wpnDir.set(WPN_ARS.aimPt.x - ox, WPN_ARS.aimPt.y - oy, WPN_ARS.aimPt.z - oz);
    if (_wpnDir.lengthSq() < 0.25) _wpnDir.set(A.dx, A.dy, A.dz);
    _wpnDir.normalize();
  }
  // muzzle (for the tracer): first-person view model or the hero's gun
  let muzzle = null;
  if (fp && typeof WPN_VM !== 'undefined' && WPN_VM.muzzleWorld(_wpnMz)) muzzle = _wpnMz;
  else if (!fp && wpnGunMuzzle(P.H, _wpnMz)) muzzle = _wpnMz;
  const spread = wpnArsSpread();
  wpnResetHits();
  const pel = W.pellets || 1;
  for (let k = 0; k < pel; k++) {
    const r = fireBullet({ x: ox, y: oy, z: oz, dx: _wpnDir.x, dy: _wpnDir.y, dz: _wpnDir.z, range: W.range, damage: W.damage, shooter: 'player', spread,
      weapon: W.id, minDist: fp ? min : 0, muzzle, quiet: k > 0, pellet: pel > 1, carMul: pel > 1 ? 0.17 : 0.3, force: W.id === 'shotgun' ? 2.5 : 0 });
    wpnTallyHit(r);
  }
  // flash, light, shells
  if (muzzle) {
    if (!fp) wpnFxFlare(muzzle.x, muzzle.y, muzzle.z, 0.5 * W.flash + 0.2, 0.05, 1.7, 1.25, 0.7);
    wpnFxGlow(muzzle.x, muzzle.y, muzzle.z, 1.8, 1.1, 0.45, 2.5 + W.flash * 3, 0.06);
    wpnFlashLight(muzzle.x, muzzle.y, muzzle.z, 6 + W.flash * 6, 0.05, 12);
  }
  if (W.id !== 'shotgun') wpnEjectShell(W, fp);
  else WPN_ARS.rackT = 0.36;
  if (!inf) st.mag[W.id] = Math.max(0, (st.mag[W.id] | 0) - 1);
  WPN_ARS.bloom = Math.min(W.maxSpread, WPN_ARS.bloom + W.bloom);
  WPN_ARS.sinceShot = 0; WPN_ARS.raise = 1; WPN_ARS.kick = 1; WPN_ARS.shotN++;
  if (!fp) P.faceCamT = Math.max(P.faceCamT || 0, 0.9);
  P.anim.recoil = 1;
  const kk = W.recoil * lerp(1, 0.6, WPN_ARS.aimSm);
  if (typeof cam.kick === 'function') cam.kick(kk, rr(-0.5, 0.5) * kk * 0.4);
  else { cam.pitch -= kk; cam.yaw += rr(-0.5, 0.5) * kk * 0.35; WPN_ARS.kickAcc += kk; }
  if (typeof shakeCam === 'function') shakeCam(W.id === 'shotgun' ? 0.16 : 0.03);
  if (_wpnHits.any) { WPN_ARS.hitT = 0.28; WPN_ARS.hitKill = _wpnHits.kill || _wpnHits.copKill; WPN_ARS.hitHead = _wpnHits.head; }
  wpnShotReaction(P.x, P.z, _wpnHits);
}
function wpnEjectShell(W, fp) {
  const P = player;
  if (fp && typeof WPN_VM !== 'undefined' && WPN_VM.ejectWorld(_wpnEj)) {
    wpnCharRight(WPN_ARS.aimYaw, _wpnRt);
    const fx = Math.sin(WPN_ARS.aimYaw), fz = Math.cos(WPN_ARS.aimYaw);
    wpnFxShell(_wpnEj.x + fx * 0.15, _wpnEj.y, _wpnEj.z + fz * 0.15, _wpnRt.x * rr(2.4, 3.2) + fx * 0.6 + P.vx, rr(1.8, 2.6), _wpnRt.z * rr(2.4, 3.2) + fz * 0.6 + P.vz, W.shell * 0.8);
  } else if (P.H.gun && P.H.gun.visible) {
    P.H.gun.updateWorldMatrix(true, false);
    _wpnEj.copy(WPN_WA.eject[W.id]).applyMatrix4(P.H.gun.matrixWorld);
    wpnCharRight(P.h, _wpnRt);
    wpnFxShell(_wpnEj.x, _wpnEj.y, _wpnEj.z, _wpnRt.x * rr(1.6, 2.4) + P.vx, rr(1.4, 2.2), _wpnRt.z * rr(1.6, 2.4) + P.vz, W.shell);
  }
}
function wpnStartReload(Wo) {
  const W = Wo || wpnArsWeapon(), st = wpnArsStore();
  if (W.kind !== 'gun' || WPN_ARS.reloading || WPN_ARS.switchT > 0) return false;
  const mag = st.mag[W.id] | 0, res = wpnArsInfinite() ? 999 : st.res[W.id] | 0;
  if (mag >= W.mag) return false;
  if (res <= 0) { wpnArsToast('Нет патронов — загляни в «Калибр»', true); WPN_WSND.click(); return false; }
  WPN_ARS.reloading = true; WPN_ARS.reloadDur = W.reload; WPN_ARS.reloadT = W.reload;
  if (!W.shellReload) WPN_WSND.magOut();
  return true;
}
function wpnUpdateReload(dt, W) {
  if (!WPN_ARS.reloading) return;
  const st = wpnArsStore(), inf = wpnArsInfinite();
  const before = WPN_ARS.reloadT;
  WPN_ARS.reloadT -= dt;
  if (!W.shellReload && before > W.reload * 0.35 && WPN_ARS.reloadT <= W.reload * 0.35) WPN_WSND.magIn();
  if (WPN_ARS.reloadT > 0) return;
  if (W.shellReload) {
    st.mag[W.id] = (st.mag[W.id] | 0) + 1; if (!inf) st.res[W.id] = Math.max(0, (st.res[W.id] | 0) - 1);
    WPN_WSND.shell();
    if (st.mag[W.id] < W.mag && (inf || st.res[W.id] > 0)) { WPN_ARS.reloadT = W.reload; return; }
    WPN_ARS.rackT = 0.12;
  } else {
    const n = inf ? W.mag - (st.mag[W.id] | 0) : Math.min(W.mag - (st.mag[W.id] | 0), st.res[W.id] | 0);
    st.mag[W.id] = (st.mag[W.id] | 0) + n; if (!inf) st.res[W.id] = (st.res[W.id] | 0) - n;
    WPN_WSND.rack();
  }
  WPN_ARS.reloading = false; WPN_ARS.reloadT = 0;
}
function wpnCancelReload() { WPN_ARS.reloading = false; WPN_ARS.reloadT = 0; }

// ---------- melee (bat) ----------
function wpnBatHitCheck(W) {
  const P = player, fx = Math.sin(P.h), fz = Math.cos(P.h);
  let hitAny = false;
  wpnResetHits();
  for (const p of peds) {
    if (p.removed || p.state === 'fly') continue;
    const dx = p.x - P.x, dz = p.z - P.z, d = Math.hypot(dx, dz);
    if (d > W.reach || d < 0.05) continue;
    if (Math.abs(wrapA(Math.atan2(dx, dz) - P.h)) > 1.15) continue;
    const wasAlive = p.state !== 'dead' && p.health > 0;
    p.damage(W.damage, 'player', dx / d, dz / d);
    if (p.state !== 'fly' && p.state !== 'dead') p.knock(dx / d * 3.6, dz / d * 3.6, 1.5, 'player');
    if (wasAlive) { _wpnHits.ped = true; _wpnHits.any = true; if (p.health <= 0) _wpnHits.kill = true; if (p.cop) { _wpnHits.cop = true; if (p.health <= 0) _wpnHits.copKill = true; } }
    wpnFxPuff(p.x, p.y + 1.2, p.z, -dx / d, 0, -dz / d, 'ped');
    hitAny = true;
  }
  for (const c of cars) {
    const r = carCircles(c, CA);
    for (let k = 0; k < 3; k++) {
      const dx = CA[k * 2] - P.x, dz = CA[k * 2 + 1] - P.z, d = Math.hypot(dx, dz);
      if (d - r > W.reach - 0.6) continue;
      if (Math.abs(wrapA(Math.atan2(dx, dz) - P.h)) > 1.0) continue;
      c.damage(4, 'player'); sparks(P.x + fx * 1.0, P.y + 1.0, P.z + fz * 1.0, 6);
      _wpnHits.car = true; _wpnHits.any = true; if (wpnIsCopCar(c)) _wpnHits.copCar = true;
      hitAny = true; WPN_WSND.batHit(true);
      break;
    }
    if (_wpnHits.car) break;
  }
  if (hitAny) {
    if (_wpnHits.ped || _wpnHits.cop) WPN_WSND.batHit(false);
    if (typeof shakeCam === 'function') shakeCam(0.18);
    WPN_ARS.hitT = 0.28; WPN_ARS.hitKill = _wpnHits.kill; WPN_ARS.hitHead = false;
    if (_wpnHits.cop) addCrime(_wpnHits.copKill ? 2.2 : 1.4, 'Нападение на полицейского!');
    else if (_wpnHits.kill) addCrime(1.0, 'Драка с битой — полиция уже едет');
    else if (_wpnHits.ped) addCrime(0.4, 'Драка с битой на улице');
    else if (_wpnHits.copCar) addCrime(0.6, 'Порча патрульной машины');
    for (const p of peds) if (p.alive && Math.hypot(p.x - P.x, p.z - P.z) < 16) p.flee(P.x, P.z);
  }
}

// ---------- grenades ----------
function wpnUpdateThrow(dt) {
  const st = wpnArsStore(), P = player;
  if (WPN_ARS.throwReq) {
    WPN_ARS.throwReq = false;
    if (WPN_ARS.throwT <= 0 && wpnCanAct() && P.mode === 'foot') {
      if (st.gren > 0 || wpnArsInfinite()) {
        if (!wpnArsInfinite()) st.gren--;
        WPN_ARS.throwT = 0.62; WPN_ARS.throwDone = false; wpnCancelReload();
        WPN_WSND.pin();
        P.anim.punch = 0.001; P.anim.punchSide = 1; P.anim.throw = 1; P.faceCamT = Math.max(P.faceCamT || 0, 0.7);
      } else wpnArsToast('Гранат нет — купи в «Калибре»', true);
    }
  }
  if (WPN_ARS.throwT > 0) {
    WPN_ARS.throwT -= dt;
    P.anim.throw = Math.max(0, WPN_ARS.throwT / 0.62);
    if (!WPN_ARS.throwDone && WPN_ARS.throwT < 0.4) {
      WPN_ARS.throwDone = true;
      if (P.dead || P.mode !== 'foot') return;
      const A = wpnAimRay();
      wpnCharRight(P.h, _wpnRt);
      let x, y, z;
      if (wpnFpView()) { x = A.x + A.dx * 0.45 + _wpnRt.x * 0.18; y = A.y - 0.1; z = A.z + A.dz * 0.45 + _wpnRt.z * 0.18; }
      else { x = P.x + _wpnRt.x * 0.3 + Math.sin(P.h) * 0.35; y = P.y + 1.7; z = P.z + _wpnRt.z * 0.3 + Math.cos(P.h) * 0.35; }
      const hit = collideCircle(x, z, 0.1, y); x = hit.x; z = hit.z;
      const up = 4.2 + Math.max(0, -A.dy) * -2;
      const s = WPN_GRENADE.speed * (0.75 + 0.25 * clamp(1 + A.dy, 0, 1));
      wpnThrowGrenade(x, y, z, A.dx * s + P.vx * 0.5, A.dy * s + up, A.dz * s + P.vz * 0.5, 'player');
      AUD.whoosh();
    }
  } else P.anim.throw = 0;
}

// ---------- touch aim assist ----------
function wpnAimAssist(dt, W) {
  if (!WPN_ARS.touch || W.kind !== 'gun' || cam.override) return;
  const firing = WPN_ARS.sinceShot < 0.35 || input.fire;
  if (!WPN_ARS.aim && !firing) return;
  const A = wpnAimRay();
  const cone = WPN_ARS.aim ? 0.21 : 0.13;
  let best = null, bestS = 1e9, tdx = 0, tdy = 0, tdz = 0;
  for (const p of peds) {
    if (p.removed || !p.alive) continue;
    const dx = p.x - A.x, dy = p.y + 1.2 - A.y, dz = p.z - A.z, d = Math.hypot(dx, dy, dz);
    if (d > W.range || d < 1.5) continue;
    const dot = (dx * A.dx + dy * A.dy + dz * A.dz) / d;
    if (dot < Math.cos(cone)) continue;
    const ang = Math.acos(Math.min(1, dot));
    const score = ang * (p.cop ? 0.7 : 1) + d * 0.0015;
    if (score >= bestS) continue;
    if (!losClear(player.x, player.z, p.x, p.z)) continue;
    best = p; bestS = score; tdx = dx / d; tdy = dy / d; tdz = dz / d;
  }
  if (!best) return;
  const eYaw = wrapA(Math.atan2(tdx, tdz) - Math.atan2(A.dx, A.dz));
  const ePitch = Math.asin(clamp(tdy, -1, 1)) - Math.asin(clamp(A.dy, -1, 1));
  const k = Math.min(1, (WPN_ARS.aim ? 5.5 : 2.4) * dt);
  cam.yaw += eYaw * k; cam.pitch -= ePitch * k;
}

// ---------- drive-by ----------
function wpnDriveByWeapon() {
  const st = wpnArsStore();
  for (const id of ['smg', 'pistol']) if (st.owned[id] && ((st.mag[id] | 0) > 0 || (st.res[id] | 0) > 0 || wpnArsInfinite())) return id;
  return null;
}
const _wpnDbE = new V3();
function wpnUpdateDriveBy(dt) {
  const c = player.car;
  WPN_ARS.dbWeapon = c && !c.wrecked ? wpnDriveByWeapon() : null;
  WPN_ARS.dbOk = false;
  if (!WPN_ARS.dbWeapon) return;
  const W = WPN_WEAPONS[WPN_ARS.dbWeapon], st = wpnArsStore();
  const A = wpnAimRay();
  const rel = wrapA(Math.atan2(A.dx, A.dz) - c.h);
  WPN_ARS.dbOk = Math.abs(rel) > 0.45 && Math.abs(rel) < 2.75;
  if (WPN_ARS.reloading) { wpnUpdateReload(dt, W); return; }
  if (WPN_ARS.reloadReq) { WPN_ARS.reloadReq = false; wpnStartReload(W); return; }
  if (!input.fire || WPN_ARS.cd > 0 || !wpnCanAct()) return;
  if (!WPN_ARS.dbOk) { wpnArsToast('Поверни камеру вбок, чтобы стрелять из окна'); return; }
  if ((st.mag[W.id] | 0) <= 0 && !wpnArsInfinite()) { if (!wpnStartReload(W)) WPN_WSND.click(); WPN_ARS.cd = 0.3; return; }
  const min = wpnAimMin(A);
  wpnTraceShot(A.x, A.y, A.z, A.dx, A.dy, A.dz, W.range + min, Math.max(2, min * 0.6), 'player', c, _wpnAimT);
  const px = _wpnAimT.type ? _wpnAimT.x : A.x + A.dx * W.range, py = _wpnAimT.type ? _wpnAimT.y : A.y + A.dy * W.range, pz = _wpnAimT.type ? _wpnAimT.z : A.z + A.dz * W.range;
  c.eyeWorld(_wpnDbE);
  const side = rel > 0 ? 1 : -1; // +1: window on the car's left, -1: right
  const ox = _wpnDbE.x + Math.cos(c.h) * side * 0.8, oz = _wpnDbE.z - Math.sin(c.h) * side * 0.8, oy = _wpnDbE.y - 0.1;
  _wpnDir.set(px - ox, py - oy, pz - oz).normalize();
  wpnResetHits();
  const r = fireBullet({ x: ox, y: oy, z: oz, dx: _wpnDir.x, dy: _wpnDir.y, dz: _wpnDir.z, range: W.range, damage: W.damage, shooter: 'player', ignore: c, spread: W.spread * 2.2 + WPN_ARS.bloom, weapon: W.id });
  wpnTallyHit(r);
  wpnFxFlare(ox + _wpnDir.x * 0.3, oy + _wpnDir.y * 0.3, oz + _wpnDir.z * 0.3, 0.5, 0.05, 1.7, 1.25, 0.7);
  wpnFxGlow(ox, oy, oz, 1.8, 1.1, 0.45, 3.5, 0.06);
  wpnFlashLight(ox, oy, oz, 8, 0.05, 10);
  if (!wpnArsInfinite()) st.mag[W.id] = Math.max(0, (st.mag[W.id] | 0) - 1);
  WPN_ARS.cd = W.auto ? W.cd * 1.15 : W.cd * 1.5; WPN_ARS.sinceShot = 0; WPN_ARS.bloom = Math.min(W.maxSpread, WPN_ARS.bloom + W.bloom);
  if (_wpnHits.any) { WPN_ARS.hitT = 0.28; WPN_ARS.hitKill = _wpnHits.kill; WPN_ARS.hitHead = _wpnHits.head; }
  wpnShotReaction(c.x, c.z, _wpnHits);
}

// ---------- third-person fallback pose (only when the human animation has no combat poses yet) ----------
const WPN_IKV = { S: new V3(), T: new V3(), E: new V3(), n: new V3(), pole: new V3(), d1: new V3(), d2: new V3(), x: new V3(), y: new V3(), z: new V3(), xu: new V3(),
  tmp: new V3(), s: new V3(), a: new V3(), b: new V3(), up: new V3(0, 1, 0), fwd: new V3(), rt: new V3(),
  qp: new THREE.Quaternion(), qu: new THREE.Quaternion(), qf: new THREE.Quaternion(), qh: new THREE.Quaternion(), ql: new THREE.Quaternion(), qi: new THREE.Quaternion(), m: new THREE.Matrix4() };
function wpnBasisQuat(yAxis, zRef, zAlt, out) {
  WPN_IKV.y.copy(yAxis);
  WPN_IKV.z.copy(zRef).addScaledVector(WPN_IKV.y, -WPN_IKV.y.dot(zRef));
  if (WPN_IKV.z.lengthSq() < 1e-5) WPN_IKV.z.copy(zAlt).addScaledVector(WPN_IKV.y, -WPN_IKV.y.dot(zAlt));
  WPN_IKV.z.normalize();
  WPN_IKV.x.crossVectors(WPN_IKV.y, WPN_IKV.z);
  WPN_IKV.m.makeBasis(WPN_IKV.x, WPN_IKV.y, WPN_IKV.z);
  return out.setFromRotationMatrix(WPN_IKV.m);
}
// Basis with an exact +Z axis and +Y as close as possible to yRef.
function wpnBasisQuatZ(zAxis, yRef, out) {
  WPN_IKV.z.copy(zAxis).normalize();
  WPN_IKV.y.copy(yRef).addScaledVector(WPN_IKV.z, -WPN_IKV.z.dot(yRef));
  if (WPN_IKV.y.lengthSq() < 1e-5) WPN_IKV.y.set(0, 1, 0).addScaledVector(WPN_IKV.z, -WPN_IKV.z.y);
  WPN_IKV.y.normalize();
  WPN_IKV.x.crossVectors(WPN_IKV.y, WPN_IKV.z);
  WPN_IKV.m.makeBasis(WPN_IKV.x, WPN_IKV.y, WPN_IKV.z);
  return out.setFromRotationMatrix(WPN_IKV.m);
}
// Two-bone IK for an arm. wrist: world target. The hand uses the shared grip frame: handZ = barrel direction
// (hand +Z), handY = up reference (hand +Y); yExact keeps +Y exact instead (the bat's axis).
function wpnIkArm(H, right, wrist, handZ, handY, w, yExact) {
  if (w <= 0.001) return;
  const ua = H.bones[right ? HB.uaR : HB.uaL], fa = H.bones[right ? HB.faR : HB.faL], ha = H.bones[right ? HB.haR : HB.haL];
  H.bones[HB.chest].matrixWorld.decompose(WPN_IKV.tmp, WPN_IKV.qp, WPN_IKV.s);
  const sc = WPN_IKV.s.x;
  WPN_IKV.S.setFromMatrixPosition(ua.matrixWorld);
  const L1 = 0.29 * sc, L2 = 0.26 * sc;
  WPN_IKV.d1.subVectors(wrist, WPN_IKV.S);
  const d = clamp(WPN_IKV.d1.length(), 0.1 * sc, (L1 + L2) * 0.995);
  WPN_IKV.n.copy(WPN_IKV.d1).normalize();
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  WPN_IKV.pole.copy(WPN_IKV.rt).multiplyScalar(right ? 0.55 : -0.55); WPN_IKV.pole.y -= 1; WPN_IKV.pole.addScaledVector(WPN_IKV.fwd, -0.2);
  WPN_IKV.pole.addScaledVector(WPN_IKV.n, -WPN_IKV.pole.dot(WPN_IKV.n)).normalize();
  WPN_IKV.E.copy(WPN_IKV.S).addScaledVector(WPN_IKV.n, a).addScaledVector(WPN_IKV.pole, h);
  WPN_IKV.T.copy(WPN_IKV.S).addScaledVector(WPN_IKV.n, d);
  WPN_IKV.d1.subVectors(WPN_IKV.E, WPN_IKV.S).normalize(); WPN_IKV.d2.subVectors(WPN_IKV.T, WPN_IKV.E).normalize();
  wpnBasisQuat(WPN_IKV.a.copy(WPN_IKV.d1).negate(), WPN_IKV.d2, WPN_IKV.fwd, WPN_IKV.qu);
  WPN_IKV.xu.copy(WPN_IKV.x);
  WPN_IKV.a.copy(WPN_IKV.d2).negate();
  WPN_IKV.b.crossVectors(WPN_IKV.xu, WPN_IKV.a);
  wpnBasisQuat(WPN_IKV.a, WPN_IKV.b, WPN_IKV.fwd, WPN_IKV.qf);
  if (yExact) wpnBasisQuat(handY, handZ, WPN_IKV.fwd, WPN_IKV.qh); else wpnBasisQuatZ(handZ, handY, WPN_IKV.qh);
  // world → local, blended with the animated pose
  WPN_IKV.ql.copy(WPN_IKV.qi.copy(WPN_IKV.qp).invert()).multiply(WPN_IKV.qu); ua.quaternion.slerp(WPN_IKV.ql, w);
  WPN_IKV.ql.copy(WPN_IKV.qi.copy(WPN_IKV.qu).invert()).multiply(WPN_IKV.qf); fa.quaternion.slerp(WPN_IKV.ql, w);
  WPN_IKV.ql.copy(WPN_IKV.qi.copy(WPN_IKV.qf).invert()).multiply(WPN_IKV.qh); ha.quaternion.slerp(WPN_IKV.ql, w);
}
const _wpnShR = new V3(), _wpnShL = new V3(), _wpnWr = new V3(), _wpnWl = new V3(), _wpnHd = new V3(), _wpnHu = new V3(), _wpnGu = new V3();
function wpnFallbackPose(dt, W, aimW) {
  const P = player, H = P.H;
  if (WPN_ARS.cPoses || wpnFpView() || P.dead || P.knockT > 0 || P.mode !== 'foot') return;
  const melee = W.kind === 'melee', gun = W.kind === 'gun';
  if (!melee && !gun && !(WPN_ARS.throwT > 0)) return;
  let w = gun ? (W.anim === 'twohand' ? Math.max(0.65, aimW) : aimW) : 1;
  if (melee && P.anim.punch > 0) w = 0;
  if (WPN_ARS.throwT > 0) return;
  const sw = WPN_ARS.switchT > 0 ? Math.abs(1 - WPN_ARS.switchT / WPN_SWITCH_T * 2) : 1;
  w *= sw;
  if (w < 0.01) return;
  P.root.updateMatrixWorld(true);
  const sc = H.root.children[0].scale.x;
  WPN_IKV.fwd.set(Math.sin(P.h), 0, Math.cos(P.h)); wpnCharRight(P.h, WPN_IKV.rt);
  _wpnShR.setFromMatrixPosition(H.bones[HB.uaR].matrixWorld); _wpnShL.setFromMatrixPosition(H.bones[HB.uaL].matrixWorld);
  if (melee) {
    _wpnWr.copy(_wpnShR).addScaledVector(WPN_IKV.fwd, 0.16 * sc).addScaledVector(WPN_IKV.rt, 0.04 * sc); _wpnWr.y -= 0.3 * sc;
    _wpnHd.copy(WPN_IKV.fwd).addScaledVector(WPN_IKV.rt, -0.3).normalize();
    _wpnHu.set(0, 0.85, 0).addScaledVector(WPN_IKV.fwd, -0.45).addScaledVector(WPN_IKV.rt, 0.15).normalize();
    wpnIkArm(H, true, _wpnWr, _wpnHd, _wpnHu, w, true);
    return;
  }
  // aim direction from the right shoulder to the aim point, lowered when not aiming
  _wpnHd.subVectors(WPN_ARS.aimPt, _wpnShR);
  if (_wpnHd.lengthSq() < 0.5) _wpnHd.set(Math.sin(WPN_ARS.aimYaw), Math.sin(WPN_ARS.aimPitch), Math.cos(WPN_ARS.aimYaw));
  _wpnHd.normalize();
  const low = 1 - aimW;
  if (low > 0.01) { _wpnHd.y -= low * 0.75; _wpnHd.normalize(); }
  const two = W.anim === 'twohand';
  // gun "up" (perpendicular to the barrel); the fist (grip centre) hangs ~6 cm below the wrist along it
  _wpnGu.copy(WPN_IKV.up).addScaledVector(_wpnHd, -_wpnHd.y).normalize();
  if (!two) {
    _wpnWr.set((_wpnShR.x + _wpnShL.x) * 0.5, (_wpnShR.y + _wpnShL.y) * 0.5, (_wpnShR.z + _wpnShL.z) * 0.5).addScaledVector(WPN_IKV.rt, 0.05 * sc).addScaledVector(_wpnHd, 0.44 * sc);
    _wpnWr.addScaledVector(_wpnGu, 0.02 * sc);
    wpnIkArm(H, true, _wpnWr, _wpnHd, _wpnGu, w);
    // support hand cups the shooting hand from the left
    _wpnHu.copy(_wpnGu).addScaledVector(WPN_IKV.rt, -0.45).normalize();
    _wpnWl.copy(_wpnWr).addScaledVector(_wpnGu, -0.07 * sc).addScaledVector(WPN_IKV.rt, -0.05 * sc).addScaledVector(_wpnHu, 0.06 * sc);
    wpnIkArm(H, false, _wpnWl, _wpnHd, _wpnHu, w);
  } else {
    _wpnWr.copy(_wpnShR).addScaledVector(_wpnHd, 0.18 * sc).addScaledVector(WPN_IKV.rt, -0.03 * sc).addScaledVector(_wpnGu, -0.1 * sc);
    wpnIkArm(H, true, _wpnWr, _wpnHd, _wpnGu, w);
    // support hand under the handguard (same grip offsets as the right hand, shifted along the gun)
    const L = WPN_WA.left[W.id] || [0, 0.05, 0.34];
    _wpnWl.copy(_wpnWr).addScaledVector(_wpnHd, L[2] * sc).addScaledVector(_wpnGu, L[1] * sc);
    wpnIkArm(H, false, _wpnWl, _wpnHd, _wpnGu, w);
  }
}

// ---------- fallback over-the-shoulder camera (until the camera module handles cam.wantAim) ----------
function wpnCamHasAim() { return typeof cam.kick === 'function' || typeof cam.aimMinDist === 'number'; }
function wpnFallbackShoulderCam(dt) {
  const P = player;
  const want = !wpnCamHasAim() && !cam.fp && !cam.override && P.mode === 'foot' && !P.dead && wpnArsGunDrawn() && (WPN_ARS.aim || WPN_ARS.raise > 0.4) ? 1 : 0;
  WPN_ARS.shoulder = damp(WPN_ARS.shoulder, want, 8, dt);
  if (WPN_ARS.shoulder < 0.005) return;
  const s = WPN_ARS.shoulder;
  const yaw = cam.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
  const hx = P.x + rx * 0.62, hz = P.z + rz * 0.62;
  let side = 0.62;
  if (pointInBuilding(hx, hz) || rayBoxes(P.x, P.y + 1.6, P.z, rx, 0, rz, 0.9) < 0.8) side = 0.15;
  camera.position.x += (rx * side + fx * 1.6) * s;
  camera.position.z += (rz * side + fz * 1.6) * s;
  camera.position.y -= 0.12 * s;
  camera.updateMatrixWorld();
}

// ---------- main update ----------
function wpnArsApplyModel() {
  const P = player, W = wpnArsWeapon();
  const type = W.kind === 'gun' || W.kind === 'melee' ? W.id : null;
  const g = attachGun(P.H, type);
  if (g) g.visible = !wpnFpView() && P.mode === 'foot';
}
function wpnUpdateArsenal(dt) {
  const P = player, st = wpnArsStore();
  wpnRefreshAim();
  WPN_ARS.msgT -= dt; WPN_ARS.crimeT -= dt; WPN_ARS.fleeT -= dt; WPN_ARS.hitT -= dt; WPN_ARS.cd -= dt; WPN_ARS.sinceShot += dt; WPN_ARS.rackT -= dt;
  WPN_ARS.kick = Math.max(0, WPN_ARS.kick - dt * 9);
  P.anim.recoil = Math.max(0, (P.anim.recoil || 0) - dt * 7);
  if (!st.owned[WPN_ARS.cur]) { WPN_ARS.cur = 'fists'; wpnArsApplyModel(); }
  if (WPN_ARS.rackT > 0 && WPN_ARS.rackT - dt <= 0 && WPN_ARS.cur === 'shotgun') WPN_WSND.rack();
  // fallback recoil recovery
  if (WPN_ARS.kickAcc > 0 && WPN_ARS.sinceShot > 0.14) { const r = Math.min(WPN_ARS.kickAcc, WPN_ARS.kickAcc * 5 * dt + 0.002); cam.pitch += r * 0.75; WPN_ARS.kickAcc -= r; }
  if (P.mode === 'car') {
    WPN_ARS.aim = false; WPN_ARS.aimSm = 0; WPN_ARS.raise = 0;
    wpnUpdateDriveBy(dt);
    WPN_ARS.firePrev = !!input.fire;
    return;
  }
  WPN_ARS.dbWeapon = null;
  const able = wpnCanAct();
  // switching
  if (WPN_ARS.want && WPN_ARS.switchT <= 0) {
    if (WPN_ARS.want === WPN_ARS.cur) WPN_ARS.want = null;
    else { WPN_ARS.switchT = WPN_SWITCH_T; wpnCancelReload(); WPN_ARS.swingT = 0; }
  }
  if (WPN_ARS.switchT > 0) {
    const before = WPN_ARS.switchT; WPN_ARS.switchT -= dt;
    if (before > WPN_SWITCH_T / 2 && WPN_ARS.switchT <= WPN_SWITCH_T / 2 && WPN_ARS.want) {
      if (WPN_ARS.cur !== 'fists') WPN_ARS.last = WPN_ARS.cur;
      WPN_ARS.cur = WPN_ARS.want; WPN_ARS.want = null; st.cur = WPN_ARS.cur;
      wpnArsApplyModel(); WPN_WSND.draw();
    }
    if (WPN_ARS.switchT < 0) WPN_ARS.switchT = 0;
  }
  const W = wpnArsWeapon();
  if (P.H.gun) P.H.gun.visible = !wpnFpView() && (W.kind === 'gun' || W.kind === 'melee');
  // aim
  const wantAim = able && !!input.aim && (W.kind === 'gun') && WPN_ARS.switchT <= 0;
  WPN_ARS.aim = wantAim;
  WPN_ARS.aimSm = damp(WPN_ARS.aimSm, wantAim ? 1 : 0, 12, dt);
  WPN_ARS.raise = Math.max(0, WPN_ARS.raise - dt / 0.9);
  WPN_ARS.bloom = Math.max(0, WPN_ARS.bloom - dt * (W.maxSpread || 0.05) * 3.2);
  // reload
  if (WPN_ARS.reloadReq) { WPN_ARS.reloadReq = false; if (able) wpnStartReload(); }
  if (W.kind === 'gun') wpnUpdateReload(dt, W);
  // fire
  const fire = !!input.fire && able, pressed = fire && !WPN_ARS.firePrev;
  WPN_ARS.firePrev = !!input.fire;
  if (W.kind === 'gun' && WPN_ARS.switchT <= 0 && WPN_ARS.throwT <= 0) {
    if (fire && WPN_ARS.reloading && W.shellReload && (st.mag[W.id] | 0) > 0 && pressed) wpnCancelReload();
    if (fire && !WPN_ARS.reloading && WPN_ARS.cd <= 0) {
      if ((st.mag[W.id] | 0) > 0 || wpnArsInfinite()) {
        if (W.auto || pressed || WPN_ARS.cd <= -W.cd * 0.45) { wpnPlayerShoot(W); WPN_ARS.cd = W.cd; }
      } else if (pressed || WPN_ARS.cd <= -0.4) {
        WPN_WSND.click(); WPN_ARS.cd = 0.25;
        if (!wpnStartReload() && (st.res[W.id] | 0) <= 0) wpnArsToast('Нет патронов — загляни в «Калибр»', true);
      }
    }
  } else if (W.kind === 'melee') {
    const before = WPN_ARS.swingT; WPN_ARS.swingT = Math.max(-1, WPN_ARS.swingT - dt);
    if (before > 0) {
      if (!WPN_ARS.swingHit && before > W.swing * 0.55 && WPN_ARS.swingT <= W.swing * 0.55) { WPN_ARS.swingHit = true; wpnBatHitCheck(W); }
    } else if (fire && WPN_ARS.switchT <= 0 && WPN_ARS.throwT <= 0 && (pressed || WPN_ARS.swingT <= -0.08)) {
      WPN_ARS.swingT = W.swing; WPN_ARS.swingHit = false; WPN_WSND.swing();
      P.anim.punch = 0.001; P.anim.punchSide = 1;
    }
  }
  wpnUpdateThrow(dt);
  // animation fields for the human rig (owner C implements the poses)
  const a = P.anim;
  const aimW = W.kind === 'gun' ? Math.max(WPN_ARS.aimSm, Math.min(1, WPN_ARS.raise * 1.4)) : 0;
  a.weapon = W.kind === 'gun' ? W.anim : W.kind === 'melee' ? 'melee' : 'none';
  a.aim = aimW;
  a.reload = WPN_ARS.reloading ? clamp(1 - WPN_ARS.reloadT / WPN_ARS.reloadDur, 0, 1) : 0;
  a.melee = W.kind === 'melee' && WPN_ARS.swingT > 0 ? 1 - WPN_ARS.swingT / W.swing : 0;
  if (W.kind === 'gun' || WPN_ARS.throwT > 0) {
    const A = wpnUpdateAimPoint(W.range || 60, false);
    if (aimW > 0.25 || WPN_ARS.throwT > 0) {
      // the camera module turns the hero while cam.wantAim / player.faceCamT are set; otherwise turn him here
      if (wpnCamHasAim()) P.faceCamT = Math.max(P.faceCamT || 0, 0.3);
      else { P.h = dampA(P.h, WPN_ARS.aimYaw, 16, dt); P.root.rotation.y = P.h; }
    }
    a.aimYaw = wrapA(WPN_ARS.aimYaw - P.h); a.aimPitch = WPN_ARS.aimPitch;
    if (A) wpnAimAssist(dt, W);
  } else { a.aimYaw = 0; a.aimPitch = 0; }
  cam.wantAim = W.kind === 'gun' && WPN_ARS.aim && !P.dead; // state: true while aiming
  wpnFallbackPose(dt, W, aimW);
}
EV.on('start', (e) => {
  if (e && e.fresh && e.mode !== 'creative') { save.arsenal = wpnArsDefault(); writeSave(); }
  const st = wpnArsStore();
  WPN_ARS.cur = st.owned[st.cur] ? st.cur : 'fists'; WPN_ARS.want = null; WPN_ARS.switchT = 0; wpnCancelReload(); WPN_ARS.aim = false; WPN_ARS.aimSm = 0; WPN_ARS.throwT = 0; WPN_ARS.swingT = 0;
  WPN_ARS.cPoses = typeof animHuman === 'function' && (animHuman.combat === true || /\.aim\b/.test(animHuman.toString()));
  wpnArsApplyModel();
});
EV.on('respawn', () => { wpnCancelReload(); WPN_ARS.aim = false; WPN_ARS.aimSm = 0; WPN_ARS.throwT = 0; WPN_ARS.swingT = 0; wpnArsApplyModel(); });
EV.on('enterCar', () => { wpnCancelReload(); WPN_ARS.aim = false; WPN_ARS.want = null; WPN_ARS.switchT = 0; cam.wantAim = false; });
EV.on('exitCar', () => { wpnCancelReload(); wpnArsApplyModel(); });
EXT.update.push(wpnUpdateArsenal);
EXT.lateUpdate.push(wpnFallbackShoulderCam);
