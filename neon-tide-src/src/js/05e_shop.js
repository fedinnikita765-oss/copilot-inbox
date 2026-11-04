// ============================================================
//  Gun shop «Калибр» and weapon / ammo pickups (owner: weapons)
//  The shop is a storefront on a sidewalk near the garage: walk into the orange ring to open the panel.
//  Police officers defeated by the hero drop their pistol or an ammo box.
//  Public: WPN_WSHOP { open, spot }, wpnOpenGunShop(), wpnCloseGunShop(), wpnDropWeaponPickup(x, z, kind, id, rounds), WPN_WPICK.
// ============================================================
const WPN_WSHOP = { open: false, spot: null, needLeave: false, el: null, list: null, money: null, ring: null, icon: null, signMat: null, winMat: null, t: 0 };
const WPN_WPICK = [];

function wpnPickShopSpot() {
  const ref = SPOT.garage || { x: 0, z: 0 };
  let best = null, bd = 1e9;
  for (const blk of blocks) {
    if (blk.type !== 'mid' && blk.type !== 'low') continue;
    for (const b of buildings) {
      if (b.x0 < blk.x0 - 0.1 || b.x1 > blk.x1 + 0.1 || b.z0 < blk.z0 - 0.1 || b.z1 > blk.z1 + 0.1 || b.h < 6) continue;
      const faces = [
        [b.z0 - blk.z0, b.x1 - b.x0, (b.x0 + b.x1) / 2, b.z0, 0, -1], [blk.z1 - b.z1, b.x1 - b.x0, (b.x0 + b.x1) / 2, b.z1, 0, 1],
        [b.x0 - blk.x0, b.z1 - b.z0, b.x0, (b.z0 + b.z1) / 2, -1, 0], [blk.x1 - b.x1, b.z1 - b.z0, b.x1, (b.z0 + b.z1) / 2, 1, 0]];
      for (const f of faces) {
        if (f[0] < 5 || f[0] > 8.5 || f[1] < 9) continue;
        const mx = f[2] + f[4] * 2.3, mz = f[3] + f[5] * 2.3;
        if (collideCircle(mx, mz, 1.0).hit) continue;
        const dd = Math.hypot(mx - ref.x, mz - ref.z);
        if (dd < 45) continue;
        if (dd < bd) { bd = dd; best = { fx: f[2], fz: f[3], nx: f[4], nz: f[5], len: f[1], x: mx, z: mz }; }
      }
    }
  }
  return best;
}
function wpnShopTextures() {
  const T = WPN_WA.tex;
  { // neon sign «КАЛИБР» with a crosshair mark
    const c = mkCanvas(512, 128), g = c.getContext('2d');
    g.fillStyle = 'rgba(16,8,24,0.95)'; roundRect(g, 4, 4, 504, 120, 18); g.fill();
    g.strokeStyle = '#ff8a3d'; g.lineWidth = 5; g.shadowColor = '#ff8a3d'; g.shadowBlur = 16; roundRect(g, 12, 12, 488, 104, 13); g.stroke();
    g.lineWidth = 6; g.beginPath(); g.arc(78, 64, 30, 0, TAU); g.stroke();
    g.beginPath(); g.moveTo(78, 22); g.lineTo(78, 106); g.moveTo(36, 64); g.lineTo(120, 64); g.stroke();
    g.fillStyle = '#ff3f8e'; g.beginPath(); g.arc(78, 64, 7, 0, TAU); g.fill();
    g.font = `900 64px ${FONT_D}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ffb35c'; g.shadowColor = '#ff8a3d'; g.shadowBlur = 24; g.fillText('КАЛИБР', 306, 68, 360);
    g.shadowBlur = 0; g.fillStyle = 'rgba(255,245,225,0.85)'; g.fillText('КАЛИБР', 306, 68, 360);
    T.shopSign = toTex(c, { wrap: false });
  }
  { // shop window: warm interior with racks of silhouettes
    const c = mkCanvas(256, 200), g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 200); gr.addColorStop(0, '#3a2418'); gr.addColorStop(0.6, '#6b3d22'); gr.addColorStop(1, '#2a1a12');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 200);
    g.fillStyle = 'rgba(255,190,120,0.25)'; g.fillRect(0, 0, 256, 18);
    for (let r = 0; r < 3; r++) {
      const y = 38 + r * 44;
      g.fillStyle = '#20140e'; g.fillRect(14, y + 22, 228, 5);
      for (let k = 0; k < 4; k++) {
        const x = 22 + k * 56 + (r % 2) * 10;
        g.fillStyle = 'rgba(15,12,14,0.92)';
        g.fillRect(x, y + 8, 40, 7); g.fillRect(x + 4, y + 13, 7, 10); g.fillRect(x + 26, y + 11, 18, 4);
        if (r === 1) g.fillRect(x - 10, y + 9, 12, 5);
      }
    }
    g.fillStyle = '#1a100b'; g.fillRect(0, 168, 256, 32);
    g.fillStyle = 'rgba(255,138,61,0.9)'; g.fillRect(0, 166, 256, 3);
    g.font = `800 15px ${FONT_B}`; g.fillStyle = '#ffd9a8'; g.textAlign = 'center'; g.fillText('ОРУЖИЕ · ПАТРОНЫ · ТИР', 128, 189);
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.beginPath(); g.moveTo(30, 0); g.lineTo(90, 0); g.lineTo(10, 200); g.lineTo(-50, 200); g.fill();
    g.beginPath(); g.moveTo(150, 0); g.lineTo(175, 0); g.lineTo(95, 200); g.lineTo(70, 200); g.fill();
    T.shopWin = toTex(c, { wrap: false });
  }
  { // door
    const c = mkCanvas(128, 256), g = c.getContext('2d');
    g.fillStyle = '#121016'; g.fillRect(0, 0, 128, 256);
    g.fillStyle = '#2c2430'; g.fillRect(10, 10, 108, 236);
    const gr = g.createLinearGradient(0, 0, 128, 256); gr.addColorStop(0, '#4a2c1c'); gr.addColorStop(1, '#1d1310');
    g.fillStyle = gr; g.fillRect(18, 18, 92, 150);
    g.fillStyle = '#ff8a3d'; g.fillRect(92, 140, 8, 40);
    g.fillStyle = '#7dff6a'; g.font = `800 15px ${FONT_B}`; g.textAlign = 'center'; g.fillText('ОТКРЫТО', 64, 60);
    g.strokeStyle = 'rgba(125,255,106,0.8)'; g.lineWidth = 2; g.strokeRect(24, 42, 80, 26);
    T.shopDoor = toTex(c, { wrap: false });
  }
  { // awning stripes
    const c = mkCanvas(128, 32), g = c.getContext('2d');
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#1e3a44' : '#ff8a3d'; g.fillRect(i * 16, 0, 16, 32); }
    T.awning = toTex(c);
  }
}
function wpnBuildGunShop() {
  const s = wpnPickShopSpot();
  if (!s) return;
  WPN_WSHOP.spot = s;
  wpnShopTextures();
  const T = WPN_WA.tex;
  const g = new THREE.Group();
  g.position.set(s.fx, 0.18, s.fz); g.rotation.y = Math.atan2(s.nx, s.nz);
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1a22, roughness: 0.6, metalness: 0.3 });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(7.4, 3.9, 0.3), dark); frame.position.set(0, 1.95, 0.15); g.add(frame);
  WPN_WSHOP.winMat = new THREE.MeshBasicMaterial({ map: T.shopWin, toneMapped: false });
  for (const x of [-2.35, 2.35]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 2.05), WPN_WSHOP.winMat); w.position.set(x, 1.45, 0.31); g.add(w); }
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 2.6), new THREE.MeshStandardMaterial({ map: T.shopDoor, roughness: 0.35, metalness: 0.2 }));
  door.position.set(0, 1.3, 0.31); g.add(door);
  const aw = new THREE.Mesh(new THREE.BoxGeometry(7.8, 0.1, 1.5), new THREE.MeshStandardMaterial({ map: T.awning, roughness: 0.8 }));
  aw.position.set(0, 3.05, 0.95); aw.rotation.x = 0.28; aw.castShadow = true; g.add(aw);
  WPN_WSHOP.signMat = new THREE.MeshBasicMaterial({ map: T.shopSign, toneMapped: false, transparent: true });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 1.55), WPN_WSHOP.signMat); sign.position.set(0, 4.25, 0.33); g.add(sign);
  const sb = new THREE.Mesh(new THREE.BoxGeometry(6.4, 1.7, 0.08), dark); sb.position.set(0, 4.25, 0.28); g.add(sb);
  frame.castShadow = true; frame.receiveShadow = true;
  scene.add(g);
  // protruding frame collider (the building collider covers the rest)
  const ax0 = s.fx + (s.nz !== 0 ? -3.7 : Math.min(0, s.nx * 0.32)), ax1 = s.fx + (s.nz !== 0 ? 3.7 : Math.max(0, s.nx * 0.32));
  const az0 = s.fz + (s.nx !== 0 ? -3.7 : Math.min(0, s.nz * 0.32)), az1 = s.fz + (s.nx !== 0 ? 3.7 : Math.max(0, s.nz * 0.32));
  addBoxCollider(ax0, ax1, az0, az1, 4.2, 'shop');
  // entrance ring + floating pistol
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff8a3d'), transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
  const rg = new THREE.RingGeometry(1.0, 1.16, 40); rg.rotateX(-Math.PI / 2);
  WPN_WSHOP.ring = new THREE.Mesh(rg, ringMat); WPN_WSHOP.ring.position.set(s.x, groundH(s.x, s.z) + 0.05, s.z); WPN_WSHOP.ring.renderOrder = 3; scene.add(WPN_WSHOP.ring);
  WPN_WSHOP.icon = wpnGunMesh('pistol', false); WPN_WSHOP.icon.scale.setScalar(4.2); WPN_WSHOP.icon.position.set(s.x, 1.9, s.z); WPN_WSHOP.icon.castShadow = true; scene.add(WPN_WSHOP.icon);
  WPN_WGLOW.push((layer) => {
    if (!WPN_WSHOP.spot) return;
    const n = Math.max(0.25, DAY.night), sp = WPN_WSHOP.spot, rx = -sp.nz, rz = sp.nx;
    for (let k = -2; k <= 2; k++) layer.add(sp.fx + rx * k * 1.25 + sp.nx * 0.6, 4.4, sp.fz + rz * k * 1.25 + sp.nz * 0.6, 1.2 * n, 0.55 * n, 0.2 * n, 2.6);
    layer.add(sp.x, 1.9, sp.z, 1.0, 0.5, 0.18, 2.2);
  });
}
function wpnUpdateShopVisual(dt) {
  if (!WPN_WSHOP.spot) return;
  WPN_WSHOP.t += dt;
  const n = DAY.night;
  WPN_WSHOP.signMat.color.setScalar(0.55 + 1.1 * n);
  WPN_WSHOP.winMat.color.setScalar(0.55 + 0.75 * n);
  WPN_WSHOP.icon.rotation.y = WPN_WSHOP.t * 1.6; WPN_WSHOP.icon.position.y = 1.9 + Math.sin(WPN_WSHOP.t * 2.4) * 0.12;
  WPN_WSHOP.ring.material.opacity = 0.65 + Math.sin(WPN_WSHOP.t * 4) * 0.25;
}
function wpnUpdateShopLogic() {
  const s = WPN_WSHOP.spot; if (!s || WPN_WSHOP.open) return;
  const P = player;
  if (P.mode !== 'foot' || P.dead || P.knockT > 0) return;
  const d = Math.hypot(P.x - s.x, P.z - s.z);
  if (d > 2.6) WPN_WSHOP.needLeave = false;
  if (d < 1.25 && !WPN_WSHOP.needLeave) wpnOpenGunShop();
}

// ---------- shop panel ----------
function wpnShopDom() {
  if (WPN_WSHOP.el) return;
  HUD.addStyle(`
#wShop{position:absolute;inset:0;z-index:23;display:grid;place-items:center;background:rgba(10,5,20,.5);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  padding:calc(12px + var(--st)) calc(12px + var(--sr)) calc(12px + var(--sb)) calc(12px + var(--sl))}
#wShop .panel{width:min(680px,100%);gap:10px}
.wsHead{display:flex;align-items:flex-end;justify-content:space-between;gap:12px}
.wsHead h2{margin:4px 0 0}
.wsMoney{font:800 clamp(18px,4vmin,24px)/1 var(--display);color:var(--lime);font-variant-numeric:tabular-nums;white-space:nowrap}
.wsList{display:flex;flex-direction:column;gap:7px}
.wsItem{display:grid;grid-template-columns:64px minmax(0,1fr) auto;gap:10px;align-items:center;background:rgba(255,255,255,.05);border:1px solid var(--line);border-radius:14px;padding:8px 10px}
.wsItem.own{border-color:rgba(63,229,239,.35)}
.wsIco{width:64px;height:34px;color:var(--fg)}
.wsIco svg{width:100%;height:100%}
.wsInfo b{display:block;font:800 13.5px/1.2 var(--body)}
.wsInfo small{display:block;font:600 11.5px/1.35 var(--body);color:var(--fg-dim);margin-top:2px}
.wsStats{display:flex;gap:8px;margin-top:5px;flex-wrap:wrap}
.wsStat{display:flex;align-items:center;gap:4px;font:800 9px/1 var(--body);letter-spacing:.08em;text-transform:uppercase;color:var(--fg-dim)}
.wsStat i{display:block;width:44px;height:4px;border-radius:2px;background:rgba(255,255,255,.12);overflow:hidden}
.wsStat i::after{content:'';display:block;height:100%;width:var(--v);background:linear-gradient(90deg,var(--sun),var(--gold))}
.wsBtns{display:flex;flex-direction:column;gap:5px;align-items:stretch;min-width:118px}
.wsBtns .tag{font:800 11px/1.2 var(--body);color:var(--cyan);text-align:center;font-variant-numeric:tabular-nums}
.wsBuy{pointer-events:auto;cursor:pointer;border:0;border-radius:999px;padding:8px 12px;font:800 12px/1 var(--body);color:#24062b;white-space:nowrap;
  background:linear-gradient(90deg,var(--gold),var(--sun))}
.wsBuy.alt{background:rgba(255,255,255,.08);color:var(--fg);border:1px solid var(--line)}
.wsBuy[disabled]{opacity:.42;filter:grayscale(.6);cursor:default}
.wsBuy:not([disabled]):active{transform:scale(.97)}
@media (max-height:420px){.wsInfo small{display:none}.wsItem{padding:6px 9px}}
`);
  const sec = document.createElement('section');
  sec.id = 'wShop'; sec.className = 'hidden'; sec.setAttribute('aria-label', 'Оружейный магазин «Калибр»');
  sec.innerHTML = '<div class="panel"><div class="wsHead"><div><div class="eyebrow">Оружейный магазин</div><h2>«Калибр»</h2></div><div class="wsMoney" id="wsMoney">$0</div></div>' +
    '<div class="wsList" id="wsList"></div><div class="row"><button class="play" id="wsClose" type="button">ВЫЙТИ</button></div>' +
    '<div class="keys" id="wsHint">Купленное оружие остаётся с тобой. Патроны можно подобрать у побеждённых полицейских. Стрельба на улице поднимает розыск.</div></div>';
  $('app').appendChild(sec);
  WPN_WSHOP.el = sec; WPN_WSHOP.list = $('wsList'); WPN_WSHOP.money = $('wsMoney');
  $('wsClose').addEventListener('click', wpnCloseGunShop);
  WPN_WSHOP.list.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('button[data-act]'); if (!b || b.disabled) return;
    wpnShopAction(b.dataset.act, b.dataset.id);
  });
}
function wpnStatBars(W) {
  const s = W.stats || [0, 0, 0], L = ['Урон', 'Темп', 'Дальн.'];
  return '<div class="wsStats">' + s.map((v, i) => `<span class="wsStat">${L[i]}<i style="--v:${Math.round(v * 100)}%"></i></span>`).join('') + '</div>';
}
function wpnRenderShop() {
  const st = wpnArsStore(), creative = GAME.mode === 'creative', money = save.money;
  WPN_WSHOP.money.textContent = creative ? 'Всё бесплатно' : '$' + money.toLocaleString('ru-RU');
  let h = '';
  for (const id of WPN_WEAPON_ORDER) {
    const W = WPN_WEAPONS[id]; if (W.kind === 'fists') continue;
    const own = !!st.owned[id];
    let btns = '';
    if (creative) btns = '<span class="tag">В арсенале</span>';
    else if (!own) btns = `<button class="wsBuy" type="button" data-act="buy" data-id="${id}" ${money < W.price ? 'disabled' : ''}>Купить · $${W.price}</button>`;
    else if (W.kind === 'gun') {
      const full = (st.res[id] | 0) >= W.maxRes;
      btns = `<span class="tag">${st.mag[id] | 0} / ${st.res[id] | 0}</span><button class="wsBuy alt" type="button" data-act="ammo" data-id="${id}" ${money < W.ammoPrice || full ? 'disabled' : ''}>${full ? 'Подсумок полон' : `Патроны +${W.ammoPack} · $${W.ammoPrice}`}</button>`;
    } else btns = '<span class="tag">Куплено</span>';
    h += `<div class="wsItem${own ? ' own' : ''}"><div class="wsIco">${WPN_WICON[id]}</div><div class="wsInfo"><b>${W.name}</b><small>${W.desc}</small>${wpnStatBars(W)}</div><div class="wsBtns">${btns}</div></div>`;
  }
  const gfull = st.gren >= WPN_GRENADE.max;
  const gb = creative ? '<span class="tag">∞</span>' : `<span class="tag">×${st.gren}</span><button class="wsBuy" type="button" data-act="gren" data-id="grenade" ${money < WPN_GRENADE.price || gfull ? 'disabled' : ''}>${gfull ? 'Больше не унести' : `Купить · $${WPN_GRENADE.price}`}</button>`;
  h += `<div class="wsItem${st.gren > 0 ? ' own' : ''}"><div class="wsIco">${WPN_WICON.grenade}</div><div class="wsInfo"><b>${WPN_GRENADE.name}</b><small>Бросок по дуге, взрыв через две секунды. Задевает машины и прохожих.</small>${wpnStatBars({ stats: [1, 0.1, 0.4] })}</div><div class="wsBtns">${gb}</div></div>`;
  WPN_WSHOP.list.innerHTML = h;
  $('wsHint').textContent = creative ? 'Творческий режим: весь арсенал открыт, патроны бесконечные.' : 'Купленное оружие остаётся с тобой. Патроны можно подобрать у побеждённых полицейских. Стрельба на улице поднимает розыск.';
}
function wpnShopPay(price) {
  if (save.money < price) { HUD.toast('Не хватает денег', 'warn'); AUD.beep(false); return false; }
  if (typeof addMoney === 'function') addMoney(-price); else { save.money -= price; writeSave(); HUD.moneyBump(); }
  return true;
}
function wpnShopAction(act, id) {
  if (GAME.mode === 'creative') return;
  const st = wpnArsStore();
  if (act === 'buy') {
    const W = WPN_WEAPONS[id]; if (!W || st.owned[id]) return;
    if (!wpnShopPay(W.price)) return;
    wpnArsGive(id, W.kind === 'gun' ? W.mag + W.ammoPack : 0);
    WPN_ARS.cur = id; st.cur = id; wpnArsApplyModel();
    HUD.toast(W.name + ' — твой', 'cash'); WPN_WSND.buy();
  } else if (act === 'ammo') {
    const W = WPN_WEAPONS[id]; if (!W || !st.owned[id] || (st.res[id] | 0) >= W.maxRes) return;
    if (!wpnShopPay(W.ammoPrice)) return;
    wpnArsAddAmmo(id, W.ammoPack); WPN_WSND.pickup();
  } else if (act === 'gren') {
    if (st.gren >= WPN_GRENADE.max) return;
    if (!wpnShopPay(WPN_GRENADE.price)) return;
    st.gren++; WPN_WSND.pickup();
  }
  writeSave();
  wpnRenderShop();
}
function wpnOpenGunShop() {
  if (WPN_WSHOP.open || GAME.state !== 'play') return;
  wpnShopDom();
  WPN_WSHOP.open = true;
  if (typeof resetInput === 'function') resetInput();
  input.fire = false; input.aim = false;
  wpnRenderShop();
  WPN_WSHOP.el.classList.remove('hidden');
  GAME.state = 'pause';
  AUD.chime();
  EV.emit('gunShop', { open: true });
}
function wpnCloseGunShop() {
  if (!WPN_WSHOP.open) return;
  WPN_WSHOP.open = false; WPN_WSHOP.needLeave = true;
  WPN_WSHOP.el.classList.add('hidden');
  if (GAME.state === 'pause' && $('pause').classList.contains('hidden')) GAME.state = 'play';
  AUD.resume();
  writeSave();
  EV.emit('gunShop', { open: false });
}

// ---------- pickups (weapons and ammo boxes) ----------
let wpnAmmoGeo = null;
function wpnDropWeaponPickup(x, z, kind, id, rounds) {
  if (!WPN_WA.ready) return null;
  if (!wpnAmmoGeo) {
    const B = new WpnGunGeo();
    B.box(0.34, 0.17, 0.2, 0, 0.085, 0, '#4b5a3a'); B.box(0.35, 0.03, 0.21, 0, 0.17, 0, '#3a4630');
    B.box(0.08, 0.025, 0.03, 0, 0.195, 0, WPN_GUNCOL.metal); B.box(0.345, 0.03, 0.205, 0, 0.11, 0, '#ffd23f', { glow: true });
    wpnAmmoGeo = B.build();
  }
  const mesh = kind === 'weapon' ? wpnGunMesh(id, false) : new THREE.Mesh(wpnAmmoGeo, WPN_WA.mats);
  if (kind === 'weapon') mesh.scale.setScalar(2.2); else mesh.scale.setScalar(1.6);
  mesh.castShadow = true;
  const p = { kind, id, rounds: rounds | 0, x: x + rr(-0.4, 0.4), z: z + rr(-0.4, 0.4), y: 0, t: Math.random() * 6, life: 45, mesh };
  p.y = groundH(p.x, p.z) + 0.55;
  mesh.position.set(p.x, p.y, p.z);
  scene.add(mesh); WPN_WPICK.push(p);
  return p;
}
function wpnUpdatePickupsW(dt) {
  const P = player;
  for (let i = WPN_WPICK.length - 1; i >= 0; i--) {
    const p = WPN_WPICK[i];
    p.t += dt; p.life -= dt;
    p.mesh.rotation.y = p.t * 2; p.mesh.position.y = p.y + Math.sin(p.t * 3) * 0.12;
    let take = false;
    if (P.mode === 'foot' && !P.dead && Math.abs(p.x - P.x) < 1.4 && Math.abs(p.z - P.z) < 1.4 && Math.hypot(p.x - P.x, p.z - P.z) < 1.3) take = true;
    if (take) {
      if (p.kind === 'weapon') {
        const W = WPN_WEAPONS[p.id], fresh = wpnArsGive(p.id, p.rounds);
        HUD.toast(fresh ? W.name + ' — подобран' : '+' + p.rounds + ' патр. · ' + W.short, 'cash');
        if (fresh && WPN_ARS.cur === 'fists') wpnArsSelect(p.id);
      } else {
        const W = wpnArsWeapon(), id = W.kind === 'gun' ? W.id : (wpnArsOwned('pistol') ? 'pistol' : null);
        if (id) { const n = wpnArsAddAmmo(id, Math.ceil(WPN_WEAPONS[id].ammoPack * 0.6)); HUD.toast(n > 0 ? '+' + n + ' патр. · ' + WPN_WEAPONS[id].short : 'Подсумок полон', n > 0 ? 'cash' : 'warn'); }
        else { wpnArsGive('pistol', 12); HUD.toast(WPN_WEAPONS.pistol.name + ' — подобран', 'cash'); }
        writeSave();
      }
      WPN_WSND.pickup();
    }
    if (take || p.life <= 0) { scene.remove(p.mesh); WPN_WPICK.splice(i, 1); }
  }
}
WPN_WGLOW.push((layer) => { for (const p of WPN_WPICK) layer.add(p.x, p.mesh.position.y, p.z, 1.1, 0.75, 0.2, 2.0); });
EV.on('pedKilled', (e) => {
  const p = e && e.ped;
  if (!p || !p.cop || e.by !== 'player' || GAME.state !== 'play') return;
  if (!wpnArsOwned('pistol')) wpnDropWeaponPickup(p.x, p.z, 'weapon', 'pistol', 24);
  else wpnDropWeaponPickup(p.x, p.z, 'ammo', 'pistol', 18);
});
EV.on('start', () => { for (const p of WPN_WPICK) scene.remove(p.mesh); WPN_WPICK.length = 0; if (WPN_WSHOP.open) wpnCloseGunShop(); });

// ---------- minimap blip (drawn over the HUD minimap) ----------
function wpnDrawShopBlip() {
  const s = WPN_WSHOP.spot; if (!s || !HUD.el.minimap) return;
  const cv = HUD.el.minimap, g = cv.getContext('2d'), W = cv.width, R = W / 2;
  const sp = player.mode === 'car' && player.car ? player.car.speed : 0;
  const radiusM = player.mode === 'car' ? 95 + Math.min(sp, 40) * 1.4 : 70;
  const scale = R / radiusM, rot = -Math.PI / 2 - Math.atan2(Math.cos(cam.yaw), Math.sin(cam.yaw)), cr = Math.cos(rot), sr = Math.sin(rot);
  const rx = (s.x - player.x) * scale, rz = (s.z - player.z) * scale;
  let mx = rx * cr - rz * sr, my = rx * sr + rz * cr;
  const d = Math.hypot(mx, my), lim = R - 12;
  let noGuns = GAME.mode !== 'creative';
  if (noGuns) { const st = wpnArsStore(); for (let i = 2; i < WPN_WEAPON_ORDER.length; i++) if (st.owned[WPN_WEAPON_ORDER[i]]) noGuns = false; }
  if (d > lim) { if (!noGuns) return; mx *= lim / d; my *= lim / d; }
  const x = R + mx, y = R + my;
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  g.beginPath(); g.arc(x, y, 10, 0, TAU); g.fillStyle = '#ff8a3d'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.stroke();
  g.strokeStyle = '#2a0f05'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 5, 0, TAU); g.moveTo(x - 8, y); g.lineTo(x + 8, y); g.moveTo(x, y - 8); g.lineTo(x, y + 8); g.stroke();
  g.restore();
}

EXT.boot.push(() => { wpnBuildGunShop(); wpnShopDom(); });
EXT.update.push((dt) => { wpnUpdateShopLogic(); wpnUpdatePickupsW(dt); });
EXT.visual.push((dt) => { wpnUpdateShopVisual(dt); if (GAME.state === 'play') wpnDrawShopBlip(); });
