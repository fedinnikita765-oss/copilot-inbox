// ============================================================
//  HUD, minimap and input
// ============================================================
const $ = (id) => document.getElementById(id);
const HUD = (() => {
  const el = {};
  ['hud', 'money', 'clock', 'stars', 'objective', 'objText', 'objMeta', 'sms', 'smsText', 'smsFrom', 'smsAva', 'banner', 'bannerSub', 'bannerTitle',
    'toasts', 'speedo', 'spdVal', 'carHp', 'radio', 'hpFg', 'minimap', 'dead', 'deadText', 'fade', 'hurt', 'stick', 'knob'].forEach((k) => { el[k] = $(k); });
  const CIRC = 2 * Math.PI * 48;
  el.hpFg.style.strokeDasharray = CIRC.toFixed(1);
  const starEls = [];
  for (let i = 0; i < 5; i++) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'star');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', 'M12 2.2l2.9 6.2 6.8.8-5 4.7 1.3 6.7L12 17.3l-6 3.3 1.3-6.7-5-4.7 6.8-.8z');
    s.appendChild(p); el.stars.appendChild(s); starEls.push(s);
  }
  let last = { obj: null, money: -1, clock: '', stars: -1, flash: null, spd: -1, hp: -1, meta: '', carHp: -1, radio: null };
  let smsT = 0, bannerT = 0, mapT = 0;
  const FOOT_BTNS = ['bPunch', 'bJump', 'bSprint'], CAR_BTNS = ['bGas', 'bBrake', 'bHand', 'bExit', 'bHorn', 'bNitro'];
  function setMode(m) {
    FOOT_BTNS.forEach((id) => $(id).classList.toggle('hidden', m !== 'foot'));
    CAR_BTNS.forEach((id) => $(id).classList.toggle('hidden', m !== 'car'));
    el.speedo.classList.toggle('hidden', m !== 'car');
    if (m !== 'foot') $('bEnter').classList.add('hidden');
  }
  function toast(text, cls) {
    const d = document.createElement('div'); d.className = 'toast' + (cls ? ' ' + cls : ''); d.textContent = text;
    el.toasts.appendChild(d);
    while (el.toasts.children.length > 4) el.toasts.removeChild(el.toasts.firstChild);
    setTimeout(() => { d.style.opacity = '0'; }, 2400);
    setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 2900);
  }
  function sms(from, text) { el.smsFrom.textContent = from; el.smsAva.textContent = from.charAt(0); el.smsText.textContent = text; el.sms.classList.add('show'); smsT = 7.5; }
  function banner(sub, title, bad) { el.bannerSub.textContent = sub || ''; el.bannerTitle.textContent = title || ''; el.banner.classList.toggle('bad', !!bad); el.banner.classList.add('show'); bannerT = 2.4; }
  function objective(text) {
    if (text === last.obj) return;
    last.obj = text; el.objText.textContent = text || '';
    el.objective.classList.toggle('off', !text);
  }
  function dead(title, sub, busted) {
    if (!title) { el.dead.classList.remove('show'); return; }
    el.deadText.textContent = title;
    if (sub) { const s = document.createElement('small'); s.textContent = sub; el.deadText.appendChild(s); }
    el.dead.classList.toggle('busted', !!busted); el.dead.classList.add('show');
  }
  function fade(on) { el.fade.style.opacity = on ? '1' : '0'; }
  let hurtT = 0;
  function hurt() { hurtT = 0.45; el.hurt.style.opacity = '1'; }
  function moneyBump() { last.money = -1; }
  function fmtTime(t) { t = Math.max(0, Math.ceil(t)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }
  function update(dt) {
    if (smsT > 0) { smsT -= dt; if (smsT <= 0) el.sms.classList.remove('show'); }
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) el.banner.classList.remove('show'); }
    if (hurtT > 0) { hurtT -= dt; if (hurtT <= 0) el.hurt.style.opacity = '0'; }
    if (save.money !== last.money) { last.money = save.money; el.money.textContent = '$' + save.money.toLocaleString('ru-RU'); }
    const hh = Math.floor(DAY.hours), mm = Math.floor((DAY.hours - hh) * 60);
    const clk = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
    if (clk !== last.clock) { last.clock = clk; el.clock.textContent = clk; }
    if (wanted.stars !== last.stars) { last.stars = wanted.stars; starEls.forEach((s, i) => s.classList.toggle('on', i < wanted.stars)); }
    if (wanted.flash !== last.flash) { last.flash = wanted.flash; el.stars.classList.toggle('flash', wanted.flash); }
    const hp = Math.round(clamp(player.health, 0, 100));
    if (hp !== last.hp) {
      last.hp = hp; el.hpFg.style.strokeDashoffset = (CIRC * (1 - hp / 100)).toFixed(1);
      el.hpFg.style.stroke = hp > 50 ? 'var(--lime)' : hp > 25 ? 'var(--gold)' : 'var(--red)';
    }
    let meta = '';
    if (MS.target && !player.dead) { const d = Math.hypot(MS.target.x - player.x, MS.target.z - player.z); meta = d > 999 ? (d / 1000).toFixed(1) + ' км' : Math.round(d) + ' м'; }
    if (MS.timer > 0) meta = '⏱ ' + fmtTime(MS.timer) + (meta ? ' · ' + meta : '');
    if (wanted.bustT > 0.3) meta = 'Задержание…';
    if (meta !== last.meta) { last.meta = meta; el.objMeta.textContent = meta; }
    if (player.mode === 'car' && player.car) {
      const s = Math.round(player.car.speed * 3.6);
      if (s !== last.spd) { last.spd = s; el.spdVal.textContent = s; }
      const ch = Math.round(player.car.health);
      if (ch !== last.carHp) { last.carHp = ch; el.carHp.firstElementChild.style.width = clamp(ch, 0, 100) + '%'; }
      const rt = save.music && save.sound ? 'РАДИО НЕОН · 101.7' : 'РАДИО ВЫКЛ';
      if (rt !== last.radio) { last.radio = rt; el.radio.textContent = rt; }
    }
    mapT -= dt;
    if (mapT <= 0) { mapT = 1 / 30; drawMinimap(); }
  }
  const mctx = el.minimap.getContext('2d');
  function blip(g, x, y, r, color, ring) {
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = color; g.fill();
    if (ring) { g.lineWidth = 2.5; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.stroke(); }
  }
  function drawMinimap() {
    if (!MAP.canvas) return;
    const g = mctx, W = el.minimap.width, R = W / 2;
    const sp = player.mode === 'car' && player.car ? player.car.speed : 0;
    const radiusM = player.mode === 'car' ? 95 + Math.min(sp, 40) * 1.4 : 70;
    const scale = R / radiusM, s0 = MAP.px / MAP.size, k = scale / s0;
    const rot = -Math.PI / 2 - Math.atan2(Math.cos(cam.yaw), Math.sin(cam.yaw));
    const cr = Math.cos(rot), sr = Math.sin(rot);
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, W);
    g.beginPath(); g.arc(R, R, R, 0, TAU); g.clip();
    g.fillStyle = '#123a56'; g.fillRect(0, 0, W, W);
    g.translate(R, R); g.rotate(rot); g.scale(k, k);
    g.drawImage(MAP.canvas, -(player.x - MAP.x0) * s0, -(player.z - MAP.z0) * s0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    const toMap = (x, z, clampEdge) => {
      const rx = (x - player.x) * scale, rz = (z - player.z) * scale;
      let mx = rx * cr - rz * sr, my = rx * sr + rz * cr;
      const d = Math.hypot(mx, my), lim = R - 10;
      let edge = false;
      if (d > lim) { if (!clampEdge) return null; mx *= lim / d; my *= lim / d; edge = true; }
      return [R + mx, R + my, edge];
    };
    // shops & garage
    for (const s of SPOT.shops) { const p = toMap(s.x, s.z, false); if (p) { blip(g, p[0], p[1], 9, '#c06bff', true); g.fillStyle = '#fff'; g.font = '800 11px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('R', p[0], p[1] + 0.5); } }
    { const p = toMap(SPOT.garage.x, SPOT.garage.z, false); if (p) { g.fillStyle = '#ff3f8e'; g.fillRect(p[0] - 8, p[1] - 6, 16, 12); g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 2; g.strokeRect(p[0] - 8, p[1] - 6, 16, 12); } }
    for (const pk of pickups) if (pk.kind === 'cash') { const p = toMap(pk.x, pk.z, false); if (p) blip(g, p[0], p[1], 4, '#8dff7a'); }
    for (const m of MS.markers) if (m.kind === 'bag' && m.g.visible) { const p = toMap(m.x, m.z, true); if (p) blip(g, p[0], p[1], 7, C_BAG, true); }
    const fl = Math.floor(GAME.time * 6) % 2;
    for (const pa of police) { if (pa.mode === 'leave') continue; const p = toMap(pa.car.x, pa.car.z, false); if (p) blip(g, p[0], p[1], 6, fl ? '#ff4d5e' : '#4d8dff', true); }
    if (MS.target) {
      const p = toMap(MS.target.x, MS.target.z, true);
      if (p) {
        blip(g, p[0], p[1], p[2] ? 8 : 10, MS.target.color || C_OBJ, true);
        if (MS.target.start) { g.fillStyle = '#24062b'; g.font = '900 12px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', p[0], p[1] + 0.5); }
      }
    }
    // player arrow
    const ph = player.mode === 'car' && player.car ? player.car.h : player.h;
    const dx = Math.sin(ph), dz = Math.cos(ph), ax = dx * cr - dz * sr, ay = dx * sr + dz * cr;
    const a = Math.atan2(ay, ax);
    g.translate(R, R); g.rotate(a);
    g.beginPath(); g.moveTo(13, 0); g.lineTo(-9, 8); g.lineTo(-5, 0); g.lineTo(-9, -8); g.closePath();
    g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = 'rgba(12,7,22,0.85)'; g.stroke();
    g.restore();
    // north marker
    const n = toMap(player.x, player.z - 1e6, true);
    if (n) { g.fillStyle = 'rgba(12,7,22,0.8)'; g.beginPath(); g.arc(n[0], n[1], 10, 0, TAU); g.fill(); g.fillStyle = '#fff'; g.font = '800 12px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('С', n[0], n[1] + 0.5); }
  }
  return { el, setMode, toast, sms, banner, objective, dead, fade, hurt, moneyBump, update, drawMinimap };
})();

// ---------- input ----------
const input = { jx: 0, jy: 0, gas: false, brake: false, hand: false, nitro: false, sprint: false, jump: false, punch: false, horn: false, enter: false };
const btn = { gas: false, brake: false, hand: false, nitro: false, sprint: false, horn: false };
const keys = new Set();
const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0, active: false };
const lookP = { id: null, lx: 0, ly: 0 };
const STICK_R = 52;
function resetInput() {
  keys.clear(); Object.keys(btn).forEach((k) => { btn[k] = false; });
  stick.id = null; stick.active = false; stick.x = stick.y = 0; lookP.id = null;
  document.querySelectorAll('.btn.down').forEach((b) => b.classList.remove('down'));
  placeStick(null);
  AUD.horn(false);
}
function placeStick(x, y) {
  const s = HUD.el.stick;
  if (x === null) { s.style.left = ''; s.style.top = ''; s.classList.remove('on'); HUD.el.knob.style.transform = ''; return; }
  s.style.left = x + 'px'; s.style.top = y + 'px'; s.classList.add('on');
}
function readInput() {
  let kx = 0, ky = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) kx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) kx += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) ky += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) ky -= 1;
  if (stick.active) { input.jx = stick.x; input.jy = stick.y; }
  else { const l = Math.hypot(kx, ky); input.jx = l > 1 ? kx / l : kx; input.jy = l > 1 ? ky / l : ky; }
  const shift = keys.has('ShiftLeft') || keys.has('ShiftRight');
  input.gas = btn.gas; input.brake = btn.brake;
  input.hand = btn.hand || (player.mode === 'car' && keys.has('Space'));
  input.nitro = btn.nitro || (player.mode === 'car' && shift);
  input.sprint = btn.sprint || (player.mode === 'foot' && shift);
  const hornNow = btn.horn || keys.has('KeyH');
  if (hornNow !== input.horn) { input.horn = hornNow; AUD.horn(hornNow && player.mode === 'car'); }
}
function tryEnterExit() {
  if (GAME.state !== 'play' || player.dead) return;
  if (player.mode === 'car') exitCar();
  else { const c = nearestEnterableCar(); if (c) enterCar(c); }
}
function initInput() {
  const gameKeys = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
  window.addEventListener('keydown', (e) => {
    if (gameKeys.has(e.code) && GAME.state === 'play') e.preventDefault();
    if (e.repeat) { keys.add(e.code); return; }
    keys.add(e.code);
    if (e.code === 'Escape' || e.code === 'KeyP') { if (GAME.state === 'play') pauseGame(true); else if (GAME.state === 'pause') pauseGame(false); return; }
    if (GAME.state !== 'play') return;
    AUD.resume();
    if (e.code === 'Space' && player.mode === 'foot') input.jump = true;
    if (e.code === 'KeyF' || e.code === 'Enter') tryEnterExit();
    if (e.code === 'KeyE' && player.mode === 'foot') input.punch = true;
    if (e.code === 'KeyM') { save.music = !save.music; writeSave(); syncSettingsUI(); }
    if (e.code === 'KeyC') { cam.idle = 5; cam.pitch = 0.3; if (player.mode === 'foot') cam.yaw = player.h; }
  });
  window.addEventListener('keyup', (e) => { keys.delete(e.code); });
  window.addEventListener('blur', resetInput);
  const layer = $('touch');
  layer.addEventListener('pointerdown', (e) => {
    if (GAME.state !== 'play') return;
    e.preventDefault();
    AUD.resume();
    const W = window.innerWidth, H = window.innerHeight;
    if (e.pointerType !== 'mouse' && stick.id === null && e.clientX < W * 0.45 && e.clientY > H * 0.28) {
      stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; stick.active = true; stick.x = stick.y = 0;
      placeStick(e.clientX, e.clientY);
    } else if (lookP.id === null) { lookP.id = e.pointerId; lookP.lx = e.clientX; lookP.ly = e.clientY; }
    try { layer.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });
  layer.addEventListener('pointermove', (e) => {
    if (e.pointerId === stick.id) {
      let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy; const d = Math.hypot(dx, dy);
      if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
      stick.x = dx / STICK_R; stick.y = -dy / STICK_R;
      HUD.el.knob.style.transform = `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px)`;
    } else if (e.pointerId === lookP.id) {
      const dx = e.clientX - lookP.lx, dy = e.clientY - lookP.ly; lookP.lx = e.clientX; lookP.ly = e.clientY;
      const k = (e.pointerType === 'mouse' ? 0.0042 : 0.0062) * save.sens;
      cam.yaw -= dx * k; cam.pitch += dy * k * 0.75; cam.idle = 0;
    }
  });
  const release = (e) => {
    if (e.pointerId === stick.id) { stick.id = null; stick.active = false; stick.x = stick.y = 0; placeStick(null); }
    if (e.pointerId === lookP.id) lookP.id = null;
  };
  layer.addEventListener('pointerup', release); layer.addEventListener('pointercancel', release);
  layer.addEventListener('wheel', (e) => { if (GAME.state === 'play') { cam.zoom = clamp(cam.zoom * (e.deltaY > 0 ? 1.08 : 0.93), 0.6, 1.7); e.preventDefault(); } }, { passive: false });
  const hold = (id, key) => {
    const b = $(id);
    const on = (e) => { e.preventDefault(); e.stopPropagation(); AUD.resume(); b.classList.add('down'); btn[key] = true; try { b.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } };
    const off = () => { b.classList.remove('down'); btn[key] = false; };
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
  };
  const tap = (id, fn) => {
    const b = $(id);
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); AUD.resume(); b.classList.add('down'); fn(); });
    const off = () => b.classList.remove('down');
    b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
  };
  hold('bGas', 'gas'); hold('bBrake', 'brake'); hold('bHand', 'hand'); hold('bNitro', 'nitro'); hold('bSprint', 'sprint'); hold('bHorn', 'horn');
  tap('bPunch', () => { input.punch = true; });
  tap('bJump', () => { input.jump = true; });
  tap('bEnter', tryEnterExit);
  tap('bExit', tryEnterExit);
  $('pauseBtn').addEventListener('click', () => pauseGame(true));
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('touchmove', (e) => { if (!e.target.closest || !e.target.closest('.panel')) e.preventDefault(); }, { passive: false });
  document.addEventListener('dblclick', (e) => e.preventDefault());
}
