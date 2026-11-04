// ============================================================
//  View options, desktop mouse look, stamina HUD and breathing (owner: camera & feel)
//  - HUD button under the pause button and the V key switch first / third person (saved in save.fp)
//  - pause panel: «Вид от первого лица» and «Покачивание камеры» (save.camBob)
//  - desktop: click the game to lock the pointer for mouse look (sensitivity from save.sens);
//    Esc releases the lock and opens the pause menu, «Продолжить» locks again
//  - stamina bar while it is not full, heavy breathing when winded
// ============================================================
const VIEWUI = { btn: null, chipFp: null, chipBob: null, bar: null, fill: null, barOn: false, barW: -1, barTired: false,
  breathT: 0, breathIn: false, layer: null, wasLocked: false, selfUnlock: false, lockPausedAt: -1e9 };
const ICON_VIEW_FP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const ICON_VIEW_TP = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="6.2" r="3.2"/><path d="M6.5 21v-4.6A5.5 5.5 0 0 1 12 11a5.5 5.5 0 0 1 5.5 5.4V21z"/></svg>';

function viewSyncUI() {
  const fp = cam.fpPref;
  if (VIEWUI.btn) {
    // the icon shows the current view: an eye in first person, a figure in third person
    VIEWUI.btn.firstElementChild.outerHTML = fp ? ICON_VIEW_FP : ICON_VIEW_TP;
    VIEWUI.btn.setAttribute('aria-label', fp ? 'Вид от первого лица — переключить на третье' : 'Вид от третьего лица — переключить на первое');
    VIEWUI.btn.classList.toggle('fp', fp);
  }
  if (VIEWUI.chipFp) VIEWUI.chipFp.classList.toggle('on', fp);
  if (VIEWUI.chipBob) VIEWUI.chipBob.classList.toggle('on', cam.bob > 0);
}
function viewLockable() { return !isTouch && VIEWUI.layer && typeof VIEWUI.layer.requestPointerLock === 'function'; }
function viewRequestLock() {
  if (!viewLockable() || GAME.state !== 'play' || document.pointerLockElement) return;
  try { const p = VIEWUI.layer.requestPointerLock(); if (p && typeof p.catch === 'function') p.catch(() => {}); } catch (e) { /* not allowed here */ }
}
function viewReleaseLock() {
  if (document.pointerLockElement && document.exitPointerLock) { VIEWUI.selfUnlock = true; document.exitPointerLock(); }
}
function viewBreathe(inhale, v) {
  if (inhale) AUD.noise(0.3, 0.028 * v, 1650, 1.3, 'bandpass');
  else { AUD.noise(0.42, 0.05 * v, 780, 1.0, 'bandpass'); AUD.tone(130, 0.2, 'sine', 0.014 * v, 96); }
}

EXT.boot.push(() => {
  HUD.addStyle(
    '#bView{top:calc(66px + var(--st));right:calc(14px + var(--sr));width:46px;height:46px;border-radius:14px}' +
    '#bView svg{width:20px;height:20px}#bView span{top:auto;bottom:-13px;font-size:8.5px;letter-spacing:.04em}#bView.fp{border-color:rgba(63,229,239,.55)}' +
    '#toasts{top:calc(132px + var(--st))}' +
    '#stamBar{position:absolute;left:50%;bottom:calc(14px + var(--sb));width:clamp(96px,22vmin,150px);height:6px;transform:translateX(-50%);' +
    'border-radius:3px;background:rgba(12,7,22,.55);box-shadow:0 0 0 1px rgba(255,255,255,.16);overflow:hidden;opacity:0;transition:opacity .4s;pointer-events:none}' +
    '#stamBar.on{opacity:1}#stamBar i{display:block;height:100%;width:100%;transform-origin:0 50%;background:linear-gradient(90deg,var(--sun),var(--gold));transition:background .3s}' +
    '#stamBar.tired i{background:linear-gradient(90deg,#b0103a,var(--red))}#stamBar.tired{animation:stamPulse .9s ease-in-out infinite}' +
    '@keyframes stamPulse{50%{box-shadow:0 0 0 1px rgba(255,77,94,.7),0 0 12px rgba(255,77,94,.45)}}' +
    '@media (prefers-reduced-motion:reduce){#stamBar.tired{animation:none}}');
  // view button under the pause button
  VIEWUI.btn = HUD.addButton({ id: 'bView', label: 'Вид', icon: ICON_VIEW_TP, modes: ['foot', 'car'], parent: 'hud',
    onDown: () => { cam.toggleView(); } });
  // stamina bar
  const bar = document.createElement('div'); bar.id = 'stamBar'; bar.setAttribute('aria-hidden', 'true');
  const fill = document.createElement('i'); bar.appendChild(fill); $('hud').appendChild(bar);
  VIEWUI.bar = bar; VIEWUI.fill = fill;
  // pause panel: camera options
  const panel = document.querySelector('#pause .panel');
  if (panel) {
    const set = document.createElement('div'); set.className = 'set';
    const lab = document.createElement('div'); lab.className = 'label'; lab.textContent = 'Камера';
    const chips = document.createElement('div'); chips.className = 'chips';
    const mk = (id, text, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.id = id; b.textContent = text; b.addEventListener('click', fn); chips.appendChild(b); return b; };
    VIEWUI.chipFp = mk('chipFp', 'Вид от первого лица', () => cam.toggleView());
    VIEWUI.chipBob = mk('chipBob', 'Покачивание камеры', () => cam.setBob(!(cam.bob > 0)));
    set.appendChild(lab); set.appendChild(chips);
    panel.insertBefore(set, panel.querySelector('.keys'));
  }
  EV.on('viewChange', viewSyncUI);
  viewSyncUI();
  // V toggles the view
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyV' && !e.repeat && GAME.state === 'play') cam.toggleView();
  });
  // which device moves the look pointer (touch gets smoothing and an acceleration curve, mouse stays raw)
  VIEWUI.layer = $('touch');
  VIEWUI.layer.addEventListener('pointermove', (e) => {
    if (typeof lookP !== 'undefined' && lookP && e.pointerId === lookP.id) CAMST.lookType = e.pointerType === 'mouse' ? 'mouse' : 'touch';
  }, true);
  // desktop pointer lock: click the game to lock; mouse movement turns the camera
  VIEWUI.layer.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') viewRequestLock(); });
  document.addEventListener('mousemove', (e) => {
    if (!cam.locked || GAME.state !== 'play') return;
    const mx = e.movementX || 0, my = e.movementY || 0;
    if (Math.abs(mx) > 300 || Math.abs(my) > 300) return;   // browsers sometimes report bogus jumps under pointer lock
    const k = 0.0022 * (save.sens || 1);
    cam.yaw -= mx * k; cam.pitch += my * k; cam.idle = 0; CAMST.lookType = 'mouse'; CAMST.mouseMoved = true;
  });
  document.addEventListener('pointerlockchange', () => {
    const locked = !!VIEWUI.layer && document.pointerLockElement === VIEWUI.layer;
    cam.locked = locked;
    // the browser releases the lock on Esc and may swallow the key: open the pause menu ourselves
    if (!locked && VIEWUI.wasLocked && !VIEWUI.selfUnlock && GAME.state === 'play' && typeof pauseGame === 'function') {
      VIEWUI.lockPausedAt = performance.now(); pauseGame(true);
    }
    if (!locked) VIEWUI.selfUnlock = false;
    VIEWUI.wasLocked = locked;
  });
  document.addEventListener('pointerlockerror', () => { cam.locked = false; });
  // if the Esc key does arrive right after that, don't let it close the pause menu again
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && performance.now() - VIEWUI.lockPausedAt < 500) e.stopImmediatePropagation();
  }, true);
  // release the pointer whenever the pause menu opens; lock again on «Продолжить»
  const pause = $('pause');
  if (pause && typeof MutationObserver === 'function') {
    new MutationObserver(() => { if (!pause.classList.contains('hidden')) viewReleaseLock(); }).observe(pause, { attributes: true, attributeFilter: ['class'] });
  }
  const resume = $('resumeBtn');
  if (resume) resume.addEventListener('click', () => { if (GAME.state === 'play') viewRequestLock(); });
});
EXT.update.push((dt) => {
  if (player.mode === 'car') tickStamina(dt, false, 0);
});
EXT.lateUpdate.push((dt) => {
  const P = player, foot = P.mode === 'foot' && !P.dead;
  // stamina bar: visible while not full
  if (VIEWUI.bar) {
    const on = foot && (P.stamina < 0.995 || P.exhausted) && HUD.mode === 'foot';
    if (on !== VIEWUI.barOn) { VIEWUI.barOn = on; VIEWUI.bar.classList.toggle('on', on); }
    const w = Math.round(P.stamina * 100) / 100;
    if (w !== VIEWUI.barW) { VIEWUI.barW = w; VIEWUI.fill.style.transform = 'scaleX(' + w + ')'; }
    if (P.exhausted !== VIEWUI.barTired) { VIEWUI.barTired = P.exhausted; VIEWUI.bar.classList.toggle('tired', P.exhausted); }
  }
  // heavy breathing when winded
  if (foot && (P.exhausted || P.breath > 0.6)) {
    VIEWUI.breathT -= dt;
    if (VIEWUI.breathT <= 0) {
      const v = 0.5 + 0.5 * P.breath;
      viewBreathe(VIEWUI.breathIn, v);
      VIEWUI.breathT = (VIEWUI.breathIn ? 0.36 : 0.44) * lerp(1.5, 1, P.breath);
      VIEWUI.breathIn = !VIEWUI.breathIn;
    }
  } else { VIEWUI.breathT = 0; VIEWUI.breathIn = true; }
});
