// ============================================================
//  Boot, menus and the main loop
// ============================================================
const IDLE_IN = { throttle: 0, brake: 0.3, steer: 0, hand: false, nitro: false };
const START_SPOT = { x: 293.5, z: -17.5 };
let menuAngle = 0.6;

function showError(msg) {
  const d = document.createElement('div'); d.id = 'err'; d.textContent = msg;
  document.getElementById('app').appendChild(d);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function progress(p, label) {
  $('loadBar').firstElementChild.style.width = Math.round(p * 100) + '%';
  $('loadTxt').textContent = label + '…';
  await wait(16);
}
Ped.prototype.onDeath = function (p) { if (Math.random() < 0.75) spawnCash(p.x, p.z, Math.round(rr(10, 70))); };

GAMEHOOK.carHit = (car, other, sp) => {
  const pc = player.car;
  if (!pc || (car !== pc && other !== pc)) return;
  if (car === pc) { AUD.crash(sp); shakeCam(Math.min(0.8, sp * 0.045)); }
  if (car !== pc) return;
  if (other && other.driver === 'police' && sp > 3) addCrime(0.55, 'Таран полицейской машины!');
  else if (other && (other.driver === 'ai' || other.driver === 'npc') && sp > 10 && other.mission !== 'target') addCrime(0.2, 'Авария — свидетели вызвали полицию');
};
GAMEHOOK.pedHit = (p, c) => {
  if (c !== player.car) return;
  if (p.health <= 0) addCrime(1.0, 'Наезд на пешехода!'); else addCrime(0.35, 'ДТП с пешеходом');
  for (const o of peds) if (o !== p && Math.hypot(o.x - c.x, o.z - c.z) < 18) o.flee(c.x, c.z);
};
GAMEHOOK.explosion = (x, z, car) => {
  const d = Math.hypot(x - player.x, z - player.z);
  AUD.boom(d); shakeCam(clamp(1.2 - d / 45, 0, 1.2));
  for (const p of peds) {
    const dd = Math.hypot(p.x - x, p.z - z) || 1;
    if (dd < 9 && p.state !== 'fly') p.knock((p.x - x) / dd * 8, (p.z - z) / dd * 8, 12, 'boom');
    else if (dd < 35) p.flee(x, z);
  }
  if (GAME.state !== 'play') return;
  if (player.mode === 'foot' && d < 8 && !player.dead) {
    hurtPlayer((8 - d) * 11, 'Взрыв');
    if (!player.dead) { player.knockT = 1.5; player.vx = (player.x - x) / (d || 1) * 6; player.vz = (player.z - z) / (d || 1) * 6; player.vy = 4; }
  }
  if (player.mode === 'car' && player.car !== car && d < 6) player.car.damage(30);
};

function spawnParked() {
  const types = ['sedan', 'coupe', 'suv', 'muscle', 'sedan', 'coupe'];
  SPOT.parking.forEach((s) => { if (Math.random() < 0.6) { const c = new Car(typeof pickCarType === 'function' ? pickCarType() : rpick(types)); c.place(s.x, s.z, s.h); c.persistent = true; } });
}
function populate(px, pz) {
  for (let i = 0; i < Q.traffic; i++) spawnTraffic(px, pz, true);
  for (let i = 0; i < Q.peds; i++) spawnPed(px, pz, true);
}

// ---------- menus ----------
const QNAMES = [['auto', 'Авто'], ['low', 'Низкая'], ['medium', 'Средняя'], ['high', 'Высокая']];
function syncSettingsUI() {
  document.querySelectorAll('[data-q]').forEach((b) => b.classList.toggle('on', b.dataset.q === save.quality));
  $('sndChip').classList.toggle('on', !!save.sound);
  $('musChip').classList.toggle('on', !!save.music);
  $('sens').value = save.sens;
  AUD.setSound(save.sound);
  if (!save.music || !save.sound) AUD.music(false);
}
function updatePauseStats() {
  $('stMis').textContent = Math.min(save.mission, 5) + '/5';
  $('stTok').textContent = save.tokens.length + '/' + SPOT.tokens.length;
  $('stMoney').textContent = '$' + save.money.toLocaleString('ru-RU');
}
function pauseGame(on) {
  if (on && GAME.state === 'play') {
    GAME.state = 'pause'; $('pause').classList.remove('hidden'); updatePauseStats(); resetInput(); AUD.suspend();
    save.hours = DAY.hours; writeSave();
  } else if (!on && GAME.state === 'pause') {
    GAME.state = 'play'; $('pause').classList.add('hidden'); AUD.resume();
  }
}
function canFullscreen() { const d = document.documentElement; return !!(d.requestFullscreen || d.webkitRequestFullscreen); }
function toggleFullscreen() {
  const d = document.documentElement;
  try {
    if (document.fullscreenElement || document.webkitFullscreenElement) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
    const p = (d.requestFullscreen || d.webkitRequestFullscreen).call(d, { navigationUI: 'hide' });
    if (p && p.then) p.then(() => { try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* not supported */ } }).catch(() => {});
  } catch (e) { /* fullscreen not allowed here */ }
}
function initMenus() {
  ['qChipsMenu', 'qChipsPause'].forEach((id) => {
    const box = $(id);
    QNAMES.forEach(([k, label]) => {
      const b = document.createElement('button'); b.className = 'chip'; b.dataset.q = k; b.textContent = label; b.type = 'button';
      b.addEventListener('click', () => { save.quality = k; writeSave(); applyQuality(k); syncSettingsUI(); });
      box.appendChild(b);
    });
  });
  const hasProgress = save.mission > 0 || save.money !== DEFAULT_SAVE.money || save.tokens.length > 0;
  $('playBtn').textContent = hasProgress ? 'ПРОДОЛЖИТЬ' : 'ИГРАТЬ';
  $('newBtn').classList.toggle('hidden', !hasProgress);
  $('playBtn').addEventListener('click', () => startGame(false));
  $('creativeBtn').addEventListener('click', () => startGame(false, 'creative'));
  $('newBtn').addEventListener('click', () => { $('newConfirm').classList.remove('hidden'); $('menuBtns').classList.add('hidden'); });
  $('newNo').addEventListener('click', () => { $('newConfirm').classList.add('hidden'); $('menuBtns').classList.remove('hidden'); });
  $('newYes').addEventListener('click', () => { $('newConfirm').classList.add('hidden'); startGame(true); });
  $('resumeBtn').addEventListener('click', () => pauseGame(false));
  $('sndChip').addEventListener('click', () => { save.sound = !save.sound; writeSave(); syncSettingsUI(); });
  $('musChip').addEventListener('click', () => { save.music = !save.music; writeSave(); syncSettingsUI(); });
  if (canFullscreen()) $('fsChip').addEventListener('click', toggleFullscreen); else $('fsChip').classList.add('hidden');
  document.querySelectorAll('[data-hour]').forEach((b) => b.addEventListener('click', () => { DAY.hours = parseFloat(b.dataset.hour); DAY.envT = 99; DAY.lastEnvDir.set(0, -2, 0); save.hours = DAY.hours; writeSave(); }));
  $('sens').addEventListener('input', (e) => { save.sens = parseFloat(e.target.value) || 1; writeSave(); });
  if (!isTouch) $('keysHint').innerHTML = 'Управление: <b>WASD</b> — движение и руль, клик — захват мыши для обзора, <b>V</b> — вид от первого лица, <b>Shift</b> — спринт / нитро, <b>Пробел</b> — прыжок / дрифт, <b>F</b> — сесть / выйти, <b>E</b> — удар, <b>H</b> — гудок, <b>M</b> — радио, <b>Esc</b> — отпустить мышь и пауза.';
  syncSettingsUI();
}
function startGame(fresh, mode) {
  AUD.init();
  GAME.mode = mode || 'story';
  if (fresh) {
    save.money = DEFAULT_SAVE.money; save.mission = 0; save.tokens = []; save.hours = DEFAULT_SAVE.hours; writeSave();
    for (const p of pickups.slice()) if (p.kind === 'token') p.remove();
    initTokens();
  }
  $('menu').classList.add('gone');
  setTimeout(() => $('menu').classList.add('hidden'), 650);
  $('hud').classList.remove('hidden');
  const newbie = save.mission === 0 && GAME.mode === 'story';
  const s = GAME.mode === 'creative' ? { x: SPOT.plaza.x + 14, z: SPOT.plaza.z } : newbie ? START_SPOT : { x: SPOT.garage.x + 3, z: SPOT.garage.z - 5 };
  Object.assign(player, { x: s.x, z: s.z, y: groundH(s.x, s.z), vx: 0, vz: 0, vy: 0, h: newbie ? Math.PI : Math.PI / 2, health: 100, dead: false, mode: 'foot', car: null, knockT: 0 });
  player.root.visible = true; player.blob.visible = true;
  cam.yaw = player.h; cam.pitch = 0.26; cam.idle = 0; cam.curDist = 4.4;
  for (const c of cars.slice()) if (c.ai instanceof TrafficAI) c.remove();
  for (const p of peds.slice()) p.remove();
  if (newbie) { const c = new Car('coupe', '#ff8a3d'); c.place(292, -27.5, Math.PI); c.persistent = true; }
  populate(player.x, player.z);
  DAY.hours = typeof save.hours === 'number' ? save.hours : DEFAULT_SAVE.hours; DAY.envT = 99; DAY.lastEnvDir.set(0, -2, 0);
  HUD.setMode('foot');
  GAME.state = 'play';
  EV.emit('start', { fresh: !!fresh, mode: GAME.mode });
  if (GAME.mode !== 'story') return;
  if (!newbie) setTimeout(() => sms(save.mission >= 5 ? 'С возвращением! Заказы курьера ждут у гаража.' : 'С возвращением. Жёлтый маяк на карте — следующее дело.'), 1500);
  else setTimeout(() => sms('Привет, новенький! Это Вэл. Добро пожаловать в Неон-Тайд. Возле тебя стоит оранжевая тачка — садись и подъезжай ко мне в гараж.'), 3300);
}

// ---------- per-frame visuals ----------
const WHEEL_COLS = [[1, 0.25, 0.6], [0.25, 0.9, 1], [1, 0.82, 0.25], [0.55, 1, 0.45]];
function updateGlows() {
  glowDyn.begin();
  const n = DAY.night, cx = camera.position.x, cz = camera.position.z;
  const ph = Math.floor(GAME.time * 7) % 2;
  for (const c of cars) {
    const dx = c.x - cx, dz = c.z - cz; if (dx * dx + dz * dz > 70000) continue;
    if (c.wrecked) continue;
    const fx = Math.sin(c.h), fz = Math.cos(c.h), rx = -fz, rz = fx, T = c.T, hy = c.y + T.H - 0.2;
    const lit = n > 0.05 || c.braking;
    if (lit) {
      for (let s = -1; s <= 1; s += 2) {
        const ox = rx * s * (T.W / 2 - 0.37), oz = rz * s * (T.W / 2 - 0.37);
        if (n > 0.05 && !(c.dmg && c.dmg.f > 26)) glowDyn.add(c.x + fx * (T.L / 2 + 0.2) + ox, hy, c.z + fz * (T.L / 2 + 0.2) + oz, n, 0.93 * n, 0.78 * n, 1.6);
        const br = c.braking ? 1.4 : 0.55 * n;
        if (!c.tailsBroken) glowDyn.add(c.x - fx * (T.L / 2 + 0.15) + ox * 1.05, hy + 0.03, c.z - fz * (T.L / 2 + 0.15) + oz * 1.05, br, 0.06 * br, 0.06 * br, c.braking ? 1.1 : 0.8);
      }
    }
    const chasing = T.police && ((c.ai && c.ai.mode === 'chase' && wanted.stars > 0) || (c === player.car && input.horn));
    if (chasing) {
      const y = c.y + c.G.ct + T.cabH + 0.22;
      glowDyn.add(c.x + rx * 0.32 - fx * 0.1, y, c.z + rz * 0.32 - fz * 0.1, ph ? 2.4 : 0.15, 0.05, 0.06, 2.8);
      glowDyn.add(c.x - rx * 0.32 - fx * 0.1, y, c.z - rz * 0.32 - fz * 0.1, 0.05, 0.14, ph ? 0.15 : 2.6, 2.8);
    }
  }
  if (Math.sin(GAME.time * 3) > 0) for (const a of SPOT.antennas) glowDyn.add(a[0], a[1], a[2], 1.6, 0.06, 0.06, 4);
  for (const p of pickups) { const g = p.glow; glowDyn.add(p.x, p.mesh.position.y, p.z, g[0], g[1], g[2], 2.4); }
  if (wheelGroup && n > 0.02) {
    const th = wheelGroup.rotation.x, shift = Math.floor(GAME.time * 3);
    for (let k = 0; k < 32; k++) {
      const a = k / 32 * TAU + th, col = WHEEL_COLS[(k + shift) % 4];
      for (const x of [-1.25, 1.25]) glowDyn.add(372 + x, 17.5 + Math.cos(a) * 14, Math.sin(a) * 14, col[0] * n, col[1] * n, col[2] * n, 1.5);
    }
  }
  if (SPOT.lighthouse && n > 0.02) glowDyn.add(SPOT.lighthouse.x, 22.9, SPOT.lighthouse.z, 1.6 * n, 1.4 * n, 0.9 * n, 6);
  for (const f of EXT.glow) f(glowDyn);
  glowDyn.end();
}
function updateNightMaterials() {
  const n = DAY.night;
  MATS.lampHead.emissiveIntensity = n * 3;
  glowStatic.points.material.uniforms.uInt.value = n;
  glowStatic.points.visible = n > 0.01;
  MATS.pool.opacity = n * 0.5; lampPools.visible = Q.pools && n > 0.01;
  const sv = 0.5 + 1.1 * n; MATS.signs.forEach((m) => m.color.setScalar(sv));
  const av = 0.72 + 0.5 * n; MATS.ads.forEach((m) => m.color.setScalar(av)); MATS.paint.color.setScalar(av);
  CARMAT.head.emissiveIntensity = 0.3 + n * 2.2; CARMAT.tail.emissiveIntensity = 0.25 + n * 1.1;
  CARMAT.taxi.emissiveIntensity = 0.25 + n * 1.2;
  const ph = Math.floor(GAME.time * 7) % 2;
  CARMAT.lbRed.emissiveIntensity = wanted.stars > 0 ? (ph ? 4 : 0.3) : 0.6; CARMAT.lbBlue.emissiveIntensity = wanted.stars > 0 ? (ph ? 0.3 : 4) : 0.6;
  MATS.lantern.emissiveIntensity = 0.4 + n * 3; MATS.beam.opacity = n * 0.2;
}
let fountainT = 0;
function updateWorldAnim(dt) {
  if (wheelGroup) {
    wheelGroup.rotation.x += dt * 0.12;
    for (const g of wheelGroup.userData.cars) g.rotation.x = -wheelGroup.rotation.x;
  }
  if (lightBeam) lightBeam.rotation.y += dt * 0.9;
  if (fountainTop && Math.hypot(camera.position.x - fountainTop.x, camera.position.z - fountainTop.z) < 140) {
    fountainT -= dt;
    if (fountainT <= 0) {
      fountainT = 0.03;
      for (let i = 0; i < 2; i++) { const a = Math.random() * TAU, s = rr(0.6, 1.4); smokeFx.emit(fountainTop.x, fountainTop.y, fountainTop.z, Math.cos(a) * s, rr(3.2, 4.2), Math.sin(a) * s, 1.1, 0.22, 0.4, 0.75, 0.9, 1.0, 0.75, 0.6, 0.8, 1.0, 0.2, 9); }
    }
  }
}

// ---------- main update ----------
let enterShown = null, saveT = 0;
function update(dt) {
  GAME.time += dt;
  readInput();
  if (player.mode === 'car' && player.car) updateDriving(dt); else updateFoot(dt);
  if (player.mode === 'car' && player.car && player.car.wrecked && !player.car.exploded && !player.car.warned) { player.car.warned = true; HUD.toast('Машина горит — выходи!', 'warn'); }
  updateTraffic(dt);
  for (const c of cars) if (!c.kinematic && c !== player.car && !c.ai && !c.exploded && (c.speed > 0.02 || c.y > groundH(c.x, c.z) + 0.05)) c.physics(IDLE_IN, dt);
  updateWanted(dt);
  carCarCollisions();
  updatePeds(dt);
  updatePickups(dt);
  if (GAME.mode === 'story') updateMissions(dt);
  for (const f of EXT.update) f(dt);
  for (const c of cars) { c.update(dt); c.sync(dt); }
  if (!player.dead) { player.regenT -= dt; if (player.regenT <= 0 && player.health < 100) player.health = Math.min(100, player.health + 5 * dt); }
  if (player.mode === 'foot' && !player.dead) {
    const near = !!nearestEnterableCar();
    if (near !== enterShown) { enterShown = near; $('bEnter').classList.toggle('hidden', !near); }
    $('bEnter').classList.toggle('hot', near && MS.idx === 0 && MS.si === 0);
  } else if (enterShown !== false) { enterShown = false; $('bEnter').classList.add('hidden'); }
  updateCamera(dt);
  for (const f of EXT.lateUpdate) f(dt);
  // audio
  let sd = -1;
  for (const p of police) { if (p.mode !== 'chase' || p.car.wrecked) continue; const d = Math.hypot(p.car.x - player.x, p.car.z - player.z); if (sd < 0 || d < sd) sd = d; }
  AUD.siren(wanted.stars > 0 ? sd : -1, GAME.time);
  AUD.ambience(player.x > 240 ? 0.05 : 0.018);
  AUD.music(player.mode === 'car');
  if (player.mode !== 'car') { AUD.engineOff(); AUD.skid(0); }
  saveT += dt; if (saveT > 10) { saveT = 0; save.hours = DAY.hours; writeSave(); }
  HUD.update(dt);
}
function updateMenu(dt) {
  GAME.time += dt;
  menuAngle += dt * 0.035;
  player.x = 0; player.z = 0;
  updateTraffic(dt);
  for (const c of cars) if (!c.kinematic && !c.ai && !c.exploded && c.speed > 0.02) c.physics(IDLE_IN, dt);
  updatePeds(dt);
  for (const c of cars) { c.update(dt); c.sync(dt); }
  const r = 250;
  camera.position.set(Math.sin(menuAngle) * r + 60, 78, Math.cos(menuAngle) * r);
  camera.lookAt(40, 22, 0);
}
let lastT = performance.now(), fpsAcc = 0, fpsN = 0;
function loop(now) {
  requestAnimationFrame(loop);
  let dt = (now - lastT) / 1000; lastT = now;
  if (!(dt > 0)) dt = 0.016;
  dt = Math.min(dt, 0.05) * (GAME.timeScale || 1);
  if (GAME.state === 'loading') return;
  if (GAME.state === 'pause') { renderer.render(scene, camera); return; }
  const tU = performance.now();
  if (GAME.state === 'play') update(dt); else updateMenu(dt);
  GAME.profU = performance.now() - tU;
  timeU.value += dt;
  waterMat.uniforms.uTime.value = timeU.value;
  updateDay(dt, GAME.state === 'play');
  updateNightMaterials();
  updateWorldAnim(dt);
  updateHeadlight();
  skyMesh.position.copy(camera.position);
  const fx = player.mode === 'car' && player.car ? player.car : player;
  if (GAME.state === 'play') placeShadow(fx.x + Math.sin(cam.yaw) * 25, 0, fx.z + Math.cos(cam.yaw) * 25);
  else placeShadow(camera.position.x * 0.3 + 30, 0, camera.position.z * 0.3);
  smokeFx.update(dt); fireFx.update(dt);
  for (const f of EXT.visual) f(dt);
  updateGlows();
  const sc = (renderer.domElement.height) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  glowMats.forEach((m) => { m.uniforms.uScale.value = sc; }); fxMats.forEach((m) => { m.uniforms.uScale.value = sc; });
  const tR = performance.now();
  renderer.render(scene, camera);
  GAME.profR = performance.now() - tR;
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 2) {
    const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
    const cap = Math.min(Q.pr, window.devicePixelRatio || 1);
    if (fps < 42 && dynPR > Q.minPr) { dynPR = Math.max(Q.minPr, dynPR - 0.15); renderer.setPixelRatio(dynPR); resize(); }
    else if (fps > 57 && dynPR < cap - 0.01) { dynPR = Math.min(cap, dynPR + 0.1); renderer.setPixelRatio(dynPR); resize(); }
    else if (fps < 30 && save.quality === 'auto' && qualityName !== 'low' && dynPR <= Q.minPr + 0.01) { applyQuality('low'); }
  }
}

// ---------- boot ----------
async function boot() {
  try { initRenderer(); }
  catch (e) { showError('Не удалось запустить 3D-графику. Включите WebGL в настройках браузера или откройте страницу в свежем Chrome или Safari.'); return; }
  applyQuality(save.quality);
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 250));
  await progress(0.04, 'Шрифты');
  try {
    if (document.fonts && document.fonts.load) {
      await Promise.race([Promise.all([document.fonts.load('900 64px Unbounded'), document.fonts.load('700 24px Manrope')]), wait(1500)]);
    }
  } catch (e) { /* fonts are optional */ }
  makeTextures();
  await progress(0.12, 'Небо и океан');
  makeSky(); makeWater(); makeFx(); initCarAssets(); initHumanAssets();
  glowDyn = new GlowLayer(900);
  headSpot = new THREE.SpotLight(0xfff1d8, 0, 70, 0.6, 0.55, 1.2);
  scene.add(headSpot); scene.add(headSpot.target);
  await buildCity(progress);
  initPlayer(); initSkids(); initTokens(); spawnParked();
  player.root.visible = false; player.blob.visible = false; player.x = 0; player.z = 0;
  populate(0, 0);
  DAY.hours = 17.75;
  updateDay(0, false); updateEnv();
  initInput(); initMenus();
  for (const f of EXT.boot) await f();
  resize();
  updateMenu(0.016);
  try { renderer.compile(scene, camera); } catch (e) { /* compile lazily */ }
  await progress(1, 'Готово');
  $('load').classList.add('hidden');
  $('menuBtns').classList.remove('hidden');
  GAME.state = 'menu';
  window.__neon = { GAME, player, cars, peds, police, wanted, MS, save, DAY, SPOT, startGame, tryEnterExit, input, btn, cam, renderer, scene, camera, keys, missionStartSpot, setWanted, clearWanted, pickups, roadC, Ped, randomLook, COP_LOOK, Car, EXT, EV, HUD, getAim, fireBullet, hurtPlayer, addCrime, buildHuman, animHuman, CG, cgRemove, addBoxCollider, addCircleCollider, groundH, GROUND_HOOKS, CREATIVE, ATMO,
    step(n, dt) { for (let i = 0; i < n; i++) { update(dt); updateDay(dt, true); smokeFx.update(dt); fireFx.update(dt); } } };
}
document.addEventListener('visibilitychange', () => { if (document.hidden) { if (GAME.state === 'play') pauseGame(true); AUD.suspend(); } });
requestAnimationFrame(loop);
const hot = window.claude && window.claude.hot;
if (hot && typeof hot.snapshot === 'function') { try { hot.snapshot(() => ({ save: JSON.parse(JSON.stringify(save)) })); } catch (e) { /* optional */ } }
const startBoot = (data) => { if (data && data.save) Object.assign(save, data.save); boot(); };
if (hot && typeof hot.ready === 'function') hot.ready(startBoot); else startBoot(hot && hot.data ? hot.data : {});
