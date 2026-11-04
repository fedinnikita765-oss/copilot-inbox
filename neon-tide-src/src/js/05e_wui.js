// ============================================================
//  Weapons HUD and controls (owner: weapons)
//  Touch: «Огонь» replaces «Удар» while a gun or the bat is drawn (hold for automatic fire, drag to look),
//  «Прицел» (tap = toggle, hold = while held), «Перезарядка», «Граната», drive-by «Огонь» in cars,
//  weapon pill at the bottom centre that opens the «колесо оружия». Gentle aim assist lives in 05e_arsenal.js.
//  Desktop: LMB fire (and punch with pointer lock), RMB aim, R reload, 1–6 / Q / mouse wheel switch, G grenade.
// ============================================================
const WPN_WICON = {
  fists: '<svg viewBox="0 0 64 32" fill="currentColor"><g transform="translate(20 4) scale(1.05)"><path d="M7 8.5a2 2 0 0 1 2-2h7.2a2.8 2.8 0 0 1 2.8 2.8v4.4A5.3 5.3 0 0 1 13.7 19H11a4 4 0 0 1-4-4z"/><path d="M8 6.2V5a1.6 1.6 0 0 1 3.2 0v1.2M11.2 6.2V4.6a1.6 1.6 0 0 1 3.2 0v1.6M14.4 6.2V5.2a1.6 1.6 0 0 1 3.2 0v1.6" stroke="currentColor" stroke-width="1.6" fill="none"/></g></svg>',
  bat: '<svg viewBox="0 0 64 32" fill="currentColor"><path d="M10 25.5 33 13.6" stroke="currentColor" stroke-width="3.6" stroke-linecap="round"/><path d="M31 14.6 55.5 5" stroke="currentColor" stroke-width="8" stroke-linecap="round"/><circle cx="8" cy="26.5" r="3.2"/></svg>',
  pistol: '<svg viewBox="0 0 64 32" fill="currentColor"><path d="M12 7h38v3h3v6H33l-1.6 3.4c-.5 1-1.4 1.6-2.5 1.6h-3.2l-2.2 7.5c-.3 1-1.2 1.5-2.2 1.5h-6.5c-1.3 0-2.2-1.2-1.8-2.4L16.6 16H12z"/><path d="M27 16v2.5h3.3L31.5 16" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  smg: '<svg viewBox="0 0 64 32" fill="currentColor"><path d="M14 9h34v3h8v4h-8v2H36l2 11h-5.5L31 18h-6l-2 7h-5l1.8-7H14z"/><path d="M14 11H4v5h2.2v-2.6H14" /><rect x="40" y="6" width="5" height="3"/></svg>',
  shotgun: '<svg viewBox="0 0 64 32" fill="currentColor"><path d="M2 15.5c0-1.6 1.2-2.5 2.6-2.5H22l2-2h38v3.4H44v3.3H25l-3.5 2.6-7.2 6.6c-.8.7-2 .6-2.6-.3l-1.2-1.7c-.5-.7-.4-1.7.3-2.3l3-2.7H4.6C3.2 20 2 19 2 17.6z"/><rect x="33" y="17" width="10" height="3.6" rx="1"/></svg>',
  rifle: '<svg viewBox="0 0 64 32" fill="currentColor"><path d="M2 12.5h12l2-1.5h22v-3h6v3h12v3.6H44v2.4H34l1.6 9.5h-5.4l-2.6-9.5h-2.4l-2.6 5.5h-5L19.8 17H14l-3.2 3.2H2z"/><rect x="24" y="5" width="9" height="4" rx="1"/></svg>',
  grenade: '<svg viewBox="0 0 64 32" fill="currentColor"><circle cx="32" cy="19" r="9.5"/><rect x="28.5" y="5.5" width="7" height="5" rx="1"/><path d="M35 7.5h6.5l2.6 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="26" cy="6.5" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
};
const WPN_WUI = { ready: false, wheelOpen: false, b: {}, key: '', pillKey: '', xh: null, gap: 8, reload: null, pill: null, wheel: null, lookId: null, lx: 0, ly: 0, aimDownT: 0, aimToggle: false, wheelAcc: 0, wheelT: 0 };
const WPN_ICON_FIRE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="7.2"/><path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/></svg>';
const WPN_ICON_AIM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15"/><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/></svg>';
const WPN_ICON_RELOAD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4v4.5H15"/></svg>';
const WPN_ICON_BAT = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4.2 20.6 13 11.8" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M12 12.8 19.6 5.2" stroke="currentColor" stroke-width="5.2" stroke-linecap="round"/></svg>';

function wpnWuiStyle() {
  HUD.addStyle(`
#wxh{position:absolute;left:50%;top:50%;width:0;height:0;pointer-events:none;z-index:1;transition:opacity .12s}
#wxh.off{opacity:0}
#wxh i{position:absolute;display:block;background:#fff;box-shadow:0 0 0 1px rgba(10,4,20,.65),0 0 6px rgba(0,0,0,.35);border-radius:1px}
#wxh .xl,#wxh .xr{width:9px;height:2px;top:-1px}
#wxh .xt,#wxh .xb{width:2px;height:9px;left:-1px}
#wxh .xd{width:3px;height:3px;left:-1.5px;top:-1.5px;border-radius:50%}
#wxh.red .xl,#wxh.red .xr,#wxh.red .xt,#wxh.red .xb{opacity:0}
#wxh.red .xd{width:6px;height:6px;left:-3px;top:-3px;background:#ff3550;box-shadow:0 0 8px #ff3550,0 0 2px #fff}
#wxh .hm{position:absolute;left:0;top:0;opacity:0}
#wxh .hm i{width:2px;height:8px;left:-1px;top:-4px;background:#fff}
#wxh .hm.kill i{background:#ff4d5e;box-shadow:0 0 6px rgba(255,77,94,.9)}
#wRel{position:absolute;left:50%;top:calc(50% + 30px);transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:none;
  font:800 9.5px/1 var(--body);letter-spacing:.2em;color:var(--fg);text-shadow:0 1px 3px rgba(0,0,0,.8)}
#wRel i{display:block;width:64px;height:3px;border-radius:2px;background:rgba(255,255,255,.18);overflow:hidden}
#wRel i b{display:block;height:100%;width:0;background:var(--gold)}
#wPill{pointer-events:auto;position:absolute;left:50%;bottom:calc(10px + var(--sb));transform:translateX(-50%);display:flex;align-items:center;gap:8px;
  padding:5px 12px 5px 8px;border-radius:999px;background:var(--glass);border:1px solid var(--line);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
  color:var(--fg);cursor:pointer;touch-action:none}
#wPill .ico{width:46px;height:23px}
#wPill .ico svg{width:100%;height:100%}
#wPill .nm{font:800 11px/1 var(--body);letter-spacing:.08em;text-transform:uppercase;color:var(--fg-dim)}
#wPill .am{font:800 15px/1 var(--display);font-variant-numeric:tabular-nums;white-space:nowrap}
#wPill .am small{font:700 11px/1 var(--display);color:var(--fg-dim)}
#wPill .am.low{color:var(--red)}
#wPill:active{transform:translateX(-50%) scale(.97)}
#wPill .gr{font:800 11px/1 var(--body);color:var(--gold);padding-left:6px;border-left:1px solid var(--line)}
.btn .cnt{position:absolute;right:-2px;top:-2px;min-width:18px;height:18px;border-radius:9px;padding:0 4px;display:grid;place-items:center;
  font:800 11px/1 var(--display);background:var(--gold);color:#24062b;pointer-events:none}
#bFire{border-color:rgba(255,77,94,.55)}
#bFire.melee{border-color:rgba(63,229,239,.55)}
#bAim.on{background:rgba(63,229,239,.22);border-color:var(--cyan)}
#bDrive{border-color:rgba(255,77,94,.55)}
#bDrive.off{opacity:.45}
#wWheel{position:absolute;inset:0;z-index:21;display:grid;place-items:center;background:radial-gradient(circle,rgba(12,7,22,.55),rgba(12,7,22,.82));pointer-events:auto;touch-action:none}
#wWheel .ring{--wr:min(29vmin,136px);position:relative;width:min(76vmin,356px);height:min(76vmin,356px);border-radius:50%;
  background:radial-gradient(circle,rgba(255,255,255,0) 38%,rgba(255,255,255,.05) 39%,rgba(255,255,255,.05) 70%,rgba(255,255,255,0) 71%)}
#wWheel .it{position:absolute;left:50%;top:50%;width:min(19vmin,92px);height:min(19vmin,92px);margin:calc(min(19vmin,92px) / -2) 0 0 calc(min(19vmin,92px) / -2);
  border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;background:var(--glass);border:1.5px solid var(--line);color:var(--fg);cursor:pointer;padding:0}
#wWheel .it svg{width:72%;height:36%}
#wWheel .it span{font:800 9px/1 var(--body);letter-spacing:.06em;text-transform:uppercase;color:var(--fg-dim)}
#wWheel .it em{font:800 10px/1 var(--display);font-style:normal;color:var(--fg);font-variant-numeric:tabular-nums}
#wWheel .it.cur{border-color:var(--cyan);background:rgba(63,229,239,.18)}
#wWheel .it.lock{opacity:.35}
#wWheel .mid{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);text-align:center;pointer-events:none;width:44%}
#wWheel .mid b{display:block;font:800 clamp(11px,2.6vmin,14px)/1.2 var(--body)}
#wWheel .mid small{display:block;margin-top:4px;font:700 10px/1.3 var(--body);color:var(--fg-dim)}
`);
}
function wpnWuiLookMove(e) {
  if (e.pointerId !== WPN_WUI.lookId) return;
  const dx = e.clientX - WPN_WUI.lx, dy = e.clientY - WPN_WUI.ly; WPN_WUI.lx = e.clientX; WPN_WUI.ly = e.clientY;
  const k = (e.pointerType === 'mouse' ? 0.0042 : 0.0062) * save.sens * (WPN_ARS.aim ? 0.6 : 1);
  cam.yaw -= dx * k; cam.pitch += dy * k * 0.75; cam.idle = 0;
}
function wpnWuiDragLook(b) {
  b.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse' && WPN_WUI.lookId === null) { WPN_WUI.lookId = e.pointerId; WPN_WUI.lx = e.clientX; WPN_WUI.ly = e.clientY; } });
  b.addEventListener('pointermove', wpnWuiLookMove);
  const end = (e) => { if (e.pointerId === WPN_WUI.lookId) WPN_WUI.lookId = null; };
  b.addEventListener('pointerup', end); b.addEventListener('pointercancel', end); b.addEventListener('lostpointercapture', end);
}
function wpnInitWeaponUI() {
  if (WPN_WUI.ready) return;
  wpnWuiStyle();
  const hud = $('hud');
  // crosshair + reload indicator
  const xh = document.createElement('div'); xh.id = 'wxh'; xh.className = 'off';
  xh.innerHTML = '<i class="xl"></i><i class="xr"></i><i class="xt"></i><i class="xb"></i><i class="xd"></i><div class="hm"><i></i><i></i><i></i><i></i></div>';
  hud.appendChild(xh); WPN_WUI.xh = xh; WPN_WUI.xp = { l: xh.querySelector('.xl'), r: xh.querySelector('.xr'), t: xh.querySelector('.xt'), b: xh.querySelector('.xb'), hm: xh.querySelector('.hm') };
  WPN_WUI.xp.hm.querySelectorAll('i').forEach((el, i) => { const a = 45 + i * 90; el.style.transform = `rotate(${a}deg) translateY(-9px)`; });
  const rel = document.createElement('div'); rel.id = 'wRel'; rel.className = 'hidden'; rel.innerHTML = 'ПЕРЕЗАРЯДКА<i><b></b></i>';
  hud.appendChild(rel); WPN_WUI.reload = rel; WPN_WUI.relBar = rel.querySelector('b');
  // weapon pill
  const pill = document.createElement('button'); pill.id = 'wPill'; pill.type = 'button'; pill.className = 'hidden'; pill.setAttribute('aria-label', 'Колесо оружия');
  pill.innerHTML = '<span class="ico"></span><span class="nm"></span><span class="am"></span><span class="gr hidden"></span>';
  hud.appendChild(pill); WPN_WUI.pill = pill;
  WPN_WUI.pp = { ico: pill.querySelector('.ico'), nm: pill.querySelector('.nm'), am: pill.querySelector('.am'), gr: pill.querySelector('.gr') };
  pill.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); AUD.resume(); wpnOpenWheel(); });
  // buttons
  WPN_WUI.b.fire = HUD.addButton({ id: 'bFire', label: 'Огонь', icon: WPN_ICON_FIRE, modes: ['foot'], right: 0, bottom: 0, big: true,
    onDown: (e) => { WPN_ARS.touch = e.pointerType !== 'mouse'; input.fire = true; }, onUp: () => { input.fire = false; } });
  wpnWuiDragLook(WPN_WUI.b.fire);
  WPN_WUI.b.aim = HUD.addButton({ id: 'bAim', label: 'Прицел', icon: WPN_ICON_AIM, modes: ['foot'], right: 2.8, bottom: 0.2,
    onDown: (e) => {
      WPN_ARS.touch = e.pointerType !== 'mouse'; WPN_WUI.aimDownT = performance.now();
      if (WPN_WUI.aimToggle) { WPN_WUI.aimToggle = false; input.aim = false; WPN_WUI.aimIgnoreUp = true; } else { input.aim = true; WPN_WUI.aimIgnoreUp = false; }
    },
    onUp: () => { if (WPN_WUI.aimIgnoreUp) return; if (performance.now() - WPN_WUI.aimDownT > 320) input.aim = false; else WPN_WUI.aimToggle = true; } });
  wpnWuiDragLook(WPN_WUI.b.aim);
  WPN_WUI.b.reload = HUD.addButton({ id: 'bReload', label: 'Перезарядка', icon: WPN_ICON_RELOAD, modes: ['foot'], right: 2.7, bottom: 1.5, onDown: () => wpnArsReload() });
  WPN_WUI.b.gren = HUD.addButton({ id: 'bGren', label: 'Граната', icon: WPN_WICON.grenade.replace('viewBox="0 0 64 32"', 'viewBox="16 0 32 32"'), modes: ['foot'], right: 1.5, bottom: 2.55, onDown: () => wpnArsThrow() });
  WPN_WUI.grCnt = document.createElement('b'); WPN_WUI.grCnt.className = 'cnt'; WPN_WUI.b.gren.appendChild(WPN_WUI.grCnt);
  WPN_WUI.b.drive = HUD.addButton({ id: 'bDrive', label: 'Огонь', icon: WPN_ICON_FIRE, modes: ['car'], right: 2.9, bottom: 1.85,
    onDown: (e) => { WPN_ARS.touch = e.pointerType !== 'mouse'; input.fire = true; }, onUp: () => { input.fire = false; } });
  wpnWuiDragLook(WPN_WUI.b.drive);
  // weapon wheel
  const wh = document.createElement('div'); wh.id = 'wWheel'; wh.className = 'hidden';
  let items = '';
  WPN_WEAPON_ORDER.forEach((id, i) => {
    const a = (i / WPN_WEAPON_ORDER.length) * TAU - Math.PI / 2;
    items += `<button class="it" type="button" data-id="${id}" style="transform:translate(calc(var(--wr) * ${Math.cos(a).toFixed(3)}),calc(var(--wr) * ${Math.sin(a).toFixed(3)}))">${WPN_WICON[id]}<span>${WPN_WEAPONS[id].short}</span><em></em></button>`;
  });
  wh.innerHTML = `<div class="ring">${items}<div class="mid"><b id="wwName"></b><small id="wwInfo"></small></div></div>`;
  $('app').appendChild(wh); WPN_WUI.wheel = wh;
  wh.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    const it = e.target.closest && e.target.closest('.it');
    if (it) { if (wpnArsOwned(it.dataset.id)) { wpnArsSelect(it.dataset.id); wpnCloseWheel(); } else HUD.toast('Это оружие продаётся в «Калибре»', 'warn'); return; }
    wpnCloseWheel();
  });
  // keyboard (capture phase so weapon keys win over the default punch/pause handlers)
  window.addEventListener('keydown', (e) => {
    if (WPN_WSHOP.open && (e.code === 'Escape' || e.code === 'KeyP')) { e.stopPropagation(); e.preventDefault(); wpnCloseGunShop(); return; }
    if (WPN_WUI.wheelOpen && (e.code === 'Escape' || e.code === 'KeyP' || e.code === 'Tab')) { e.stopPropagation(); e.preventDefault(); wpnCloseWheel(); return; }
    if (GAME.state !== 'play' || e.repeat || (HUD.mode !== 'foot' && HUD.mode !== 'car') || wpnBuilding()) return;
    if (/^Digit[1-6]$/.test(e.code)) { const id = WPN_WEAPON_ORDER[+e.code.slice(5) - 1]; if (wpnArsOwned(id)) wpnArsSelect(id); else HUD.toast(WPN_WEAPONS[id].name + ' — в магазине «Калибр»', 'warn'); }
    else if (e.code === 'KeyQ') { const to = WPN_ARS.cur === 'fists' ? WPN_ARS.last : 'fists'; if (wpnArsOwned(to)) wpnArsSelect(to); }
    else if (e.code === 'KeyR') wpnArsReload();
    else if (e.code === 'KeyG') wpnArsThrow();
    else if (e.code === 'Tab' && player.mode === 'foot') { e.preventDefault(); wpnOpenWheel(); }
    else if (e.code === 'KeyE' && player.mode === 'foot' && wpnArsWeapon().kind === 'melee') { e.stopPropagation(); input.fire = true; WPN_ARS.touch = false; setTimeout(() => { if (!WPN_WUI.mouseFire) input.fire = false; }, 90); }
  }, true);
  // mouse: LMB fire, RMB aim (pointer events: the camera layer cancels compatibility mouse events)
  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || GAME.state !== 'play' || cam.override || (HUD.mode !== 'foot' && HUD.mode !== 'car') || wpnBuilding()) return;
    if (e.target.closest && e.target.closest('.btn,.panel,#wPill,#wWheel,#pauseBtn')) return;
    WPN_ARS.touch = false;
    // with the camera module: the first click locks the pointer (cam.locked); only clicks while locked act
    const locked = cam.locked !== undefined ? !!cam.locked : !!document.pointerLockElement, W = wpnArsWeapon();
    if (cam.locked !== undefined && !locked) return;
    if (e.button === 0) {
      if (player.mode === 'car') { if (WPN_ARS.dbWeapon) { input.fire = true; WPN_WUI.mouseFire = true; } }
      else if (W.kind !== 'fists') { input.fire = true; WPN_WUI.mouseFire = true; }
      else if (locked) input.punch = true;
    } else if (e.button === 2) { input.aim = true; WPN_WUI.mouseAim = true; }
  });
  const mup = (e) => {
    if (e.pointerType !== 'mouse') return;
    if (e.button === 0 && WPN_WUI.mouseFire) { input.fire = false; WPN_WUI.mouseFire = false; }
    if (e.button === 2 && WPN_WUI.mouseAim) { input.aim = false; WPN_WUI.mouseAim = false; }
  };
  window.addEventListener('pointerup', mup); window.addEventListener('pointercancel', mup);
  window.addEventListener('blur', () => { input.fire = false; input.aim = false; WPN_WUI.aimToggle = false; WPN_WUI.mouseFire = false; WPN_WUI.mouseAim = false; });
  window.addEventListener('wheel', (e) => {
    if (GAME.state !== 'play' || player.mode !== 'foot' || WPN_WUI.wheelOpen || HUD.mode !== 'foot' || cam.override || wpnBuilding()) return;
    if (e.target.closest && e.target.closest('.panel')) return;
    e.stopPropagation(); e.preventDefault();
    const now = performance.now();
    WPN_WUI.wheelAcc += e.deltaY;
    if (Math.abs(WPN_WUI.wheelAcc) > 40 && now - WPN_WUI.wheelT > 110) { wpnArsCycle(WPN_WUI.wheelAcc > 0 ? 1 : -1); WPN_WUI.wheelAcc = 0; WPN_WUI.wheelT = now; }
  }, { capture: true, passive: false });
  // help texts
  if (!isTouch && $('keysHint')) $('keysHint').insertAdjacentHTML('beforeend', ' Оружие: <b>ЛКМ</b> — огонь, <b>ПКМ</b> — прицел, <b>R</b> — перезарядка, <b>1–6</b> / <b>Q</b> / колесо мыши — выбор, <b>G</b> — граната.');
  const pk = document.querySelector('#pause .panel .keys');
  if (pk) pk.insertAdjacentText('beforeend', ' Оружейный магазин «Калибр» отмечен на карте оранжевым прицелом.');
  EV.on('modeChange', () => { WPN_WUI.key = ''; wpnRefreshWeaponUI(); });
  WPN_WUI.ready = true;
}
function wpnOpenWheel() {
  if (GAME.state !== 'play' || player.dead) return;
  WPN_WUI.wheelOpen = true; input.fire = false;
  const st = wpnArsStore();
  WPN_WUI.wheel.querySelectorAll('.it').forEach((b) => {
    const id = b.dataset.id, W = WPN_WEAPONS[id], own = !!st.owned[id];
    b.classList.toggle('lock', !own); b.classList.toggle('cur', id === (WPN_ARS.want || WPN_ARS.cur));
    b.querySelector('em').textContent = !own ? '$' + W.price : W.kind === 'gun' ? (wpnArsInfinite() ? '∞' : (st.mag[id] | 0) + '/' + (st.res[id] | 0)) : '';
  });
  const W = wpnArsWeapon();
  $('wwName').textContent = W.name;
  $('wwInfo').textContent = 'Гранаты: ' + (wpnArsInfinite() ? '∞' : st.gren) + (isTouch ? ' · коснись оружия' : ' · клавиши 1–6');
  WPN_WUI.wheel.classList.remove('hidden');
}
function wpnCloseWheel() { WPN_WUI.wheelOpen = false; WPN_WUI.wheel.classList.add('hidden'); }
function wpnSetHidden(el, h) { if (el && el.classList.contains('hidden') !== h) el.classList.toggle('hidden', h); }
// Show / hide the buttons for the current HUD mode and weapon (cheap: only touches the DOM when the state changes).
function wpnRefreshWeaponUI() {
  if (!WPN_WUI.ready) return;
  const W = wpnArsWeapon(), st = wpnArsStore(), m = HUD.mode, foot = m === 'foot' && player.mode === 'foot' && !wpnBuilding(), car = m === 'car' && player.mode === 'car';
  const gren = wpnArsInfinite() ? 99 : st.gren, K = WPN_WUI.k || (WPN_WUI.k = {});
  if (WPN_WUI.key === 'ok' && K.m === m && K.w === W.id && K.foot === foot && K.car === car && K.g === gren > 0 && K.db === WPN_ARS.dbWeapon && K.ok === WPN_ARS.dbOk && K.dead === player.dead) return;
  WPN_WUI.key = 'ok'; K.m = m; K.w = W.id; K.foot = foot; K.car = car; K.g = gren > 0; K.db = WPN_ARS.dbWeapon; K.ok = WPN_ARS.dbOk; K.dead = player.dead;
  const gun = W.kind === 'gun', mel = W.kind === 'melee';
  wpnSetHidden(WPN_WUI.b.fire, !(foot && (gun || mel)));
  WPN_WUI.b.fire.classList.toggle('melee', mel);
  WPN_WUI.b.fire.querySelector('span').textContent = mel ? 'Удар' : 'Огонь';
  const svg = WPN_WUI.b.fire.querySelector('svg'); if (svg) svg.outerHTML = mel ? WPN_ICON_BAT : WPN_ICON_FIRE;
  wpnSetHidden(WPN_WUI.b.aim, !(foot && gun));
  wpnSetHidden(WPN_WUI.b.reload, !(foot && gun));
  wpnSetHidden(WPN_WUI.b.gren, !(foot && gren > 0));
  wpnSetHidden(WPN_WUI.b.drive, !(car && WPN_ARS.dbWeapon));
  WPN_WUI.b.drive.classList.toggle('off', !WPN_ARS.dbOk);
  if (m === 'foot') wpnSetHidden($('bPunch'), gun || mel);
  if (!(foot && gun)) { WPN_WUI.aimToggle = false; if (!WPN_WUI.mouseAim) input.aim = false; }
  if (!(foot && (gun || mel)) && !car && !WPN_WUI.mouseFire) input.fire = false;
}
function wpnUpdateWeaponHud(dt) {
  if (!WPN_WUI.ready) return;
  const playing = GAME.state === 'play';
  wpnRefreshWeaponUI();
  const W = wpnArsWeapon(), st = wpnArsStore(), P = player;
  const foot = HUD.mode === 'foot' && P.mode === 'foot' && !wpnBuilding(), car = HUD.mode === 'car' && P.mode === 'car';
  WPN_WUI.b.aim.classList.toggle('on', !!input.aim);
  // pill
  let anyGun = false; for (let i = 1; i < WPN_WEAPON_ORDER.length; i++) if (st.owned[WPN_WEAPON_ORDER[i]]) anyGun = true;
  const showPill = playing && !P.dead && ((foot && anyGun) || (car && WPN_ARS.dbWeapon));
  wpnSetHidden(WPN_WUI.pill, !showPill);
  if (showPill) {
    const id = car ? WPN_ARS.dbWeapon : (WPN_ARS.want || WPN_ARS.cur), PW = WPN_WEAPONS[id];
    const inf = wpnArsInfinite(), gren = inf ? '∞' : st.gren, Q = WPN_WUI.pq || (WPN_WUI.pq = {});
    if (Q.id !== id || Q.mag !== (st.mag[id] | 0) || Q.res !== (st.res[id] | 0) || Q.g !== st.gren || Q.inf !== inf || Q.car !== car) {
      Q.id = id; Q.mag = st.mag[id] | 0; Q.res = st.res[id] | 0; Q.g = st.gren; Q.inf = inf; Q.car = car;
      WPN_WUI.pp.ico.innerHTML = WPN_WICON[id]; WPN_WUI.pp.nm.textContent = PW.short;
      if (PW.kind === 'gun') { WPN_WUI.pp.am.innerHTML = inf ? '∞' : `${st.mag[id] | 0} <small>/ ${st.res[id] | 0}</small>`; WPN_WUI.pp.am.classList.toggle('low', !inf && (st.mag[id] | 0) <= Math.ceil(PW.mag * 0.25)); }
      else WPN_WUI.pp.am.textContent = '';
      wpnSetHidden(WPN_WUI.pp.gr, !(inf || st.gren > 0) || car); WPN_WUI.pp.gr.textContent = '● ' + gren;
    }
  }
  const gc = wpnArsInfinite() ? -1 : st.gren;
  if (gc !== WPN_WUI.grW) { WPN_WUI.grW = gc; WPN_WUI.grCnt.textContent = gc < 0 ? '∞' : gc; }
  // crosshair
  const dbAim = car && WPN_ARS.dbWeapon && WPN_ARS.dbOk;
  const raised = wpnFpView() || WPN_ARS.aimSm > 0.3 || WPN_ARS.raise > 0.2 || WPN_ARS.sinceShot < 0.6;
  const showX = playing && !P.dead && ((foot && W.kind === 'gun' && WPN_ARS.switchT <= 0 && raised) || dbAim);
  WPN_WUI.xh.classList.toggle('off', !showX);
  if (showX) {
    const red = wpnFpView() && WPN_ARS.aimSm > 0.85 && W.id === 'rifle';
    WPN_WUI.xh.classList.toggle('red', red);
    const sp = car ? WPN_WEAPONS[WPN_ARS.dbWeapon].spread * 2.2 + WPN_ARS.bloom : wpnArsSpread();
    const fovT = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const target = 5 + Math.tan(sp) / fovT * (window.innerHeight / 2) + WPN_ARS.kick * 3;
    WPN_WUI.gap = damp(WPN_WUI.gap, target, 18, dt);
    const g = Math.round(WPN_WUI.gap * 2) / 2;
    if (g !== WPN_WUI.gapW) {
      WPN_WUI.gapW = g;
      WPN_WUI.xp.l.style.transform = `translateX(${-g - 9}px)`; WPN_WUI.xp.r.style.transform = `translateX(${g}px)`;
      WPN_WUI.xp.t.style.transform = `translateY(${-g - 9}px)`; WPN_WUI.xp.b.style.transform = `translateY(${g}px)`;
    }
    const hm = Math.max(0, WPN_ARS.hitT / 0.28);
    if (hm > 0 || WPN_WUI.hmW !== 0) { WPN_WUI.hmW = hm; WPN_WUI.xp.hm.style.opacity = hm.toFixed(2); }
    if (hm > 0) { WPN_WUI.xp.hm.classList.toggle('kill', WPN_ARS.hitKill); WPN_WUI.xp.hm.style.transform = `scale(${(1 + (1 - hm) * 0.35 + (WPN_ARS.hitHead ? 0.25 : 0)).toFixed(2)})`; }
  }
  // reload bar
  const rl = playing && WPN_ARS.reloading && (foot || car);
  wpnSetHidden(WPN_WUI.reload, !rl);
  if (rl) WPN_WUI.relBar.style.width = Math.round(clamp(1 - WPN_ARS.reloadT / WPN_ARS.reloadDur, 0, 1) * 100) + '%';
  if (!playing && WPN_WUI.wheelOpen && GAME.state !== 'pause') wpnCloseWheel();
}
EXT.boot.push(wpnInitWeaponUI);
EXT.update.push(() => { if (WPN_WUI.wheelOpen && (player.dead || player.mode !== 'foot')) wpnCloseWheel(); wpnRefreshWeaponUI(); });
EXT.visual.push(wpnUpdateWeaponHud);
// Debug / test handle (window.__neon is owned by the integrator; weapons expose their own).
EXT.boot.push(() => {
  window.__neonW = { ARS: WPN_ARS, WEAPONS: WPN_WEAPONS, WEAPON_ORDER: WPN_WEAPON_ORDER, GRENADE: WPN_GRENADE, WA: WPN_WA, WFX: WPN_WFX, GREN: WPN_GREN, VM: WPN_VM,
    WSHOP: WPN_WSHOP, WPICK: WPN_WPICK, WUI: WPN_WUI, arsStore: wpnArsStore, arsSelect: wpnArsSelect, arsCycle: wpnArsCycle, arsReload: wpnArsReload,
    arsThrow: wpnArsThrow, arsGive: wpnArsGive, arsAddAmmo: wpnArsAddAmmo, openGunShop: wpnOpenGunShop, closeGunShop: wpnCloseGunShop,
    dropWeaponPickup: wpnDropWeaponPickup, fireBullet, npcShoot: wpnNpcShoot, attachGun, weaponExplosion: wpnWeaponExplosion, traceShot: wpnTraceShot,
    getAim, camera, HB, SHOT_HOOKS, fallbackPose: wpnFallbackPose, updateAimPoint: wpnUpdateAimPoint, aimAssist: wpnAimAssist, arsWeapon: wpnArsWeapon };
});
