// ============================================================
//  Weapons & combat core (owner: weapons)
//  Shared with police / other modules:
//    fireBullet(o)                → hit-scan shot with damage, FX, sound and events
//    attachGun(H, type)           → gun model in a character's right hand (returns the mesh)
//    wpnNpcShoot(ped, tx, ty, tz, o) → convenience for armed NPCs (aims from the chest, fires from the gun)
//    wpnWeaponExplosion(x, y, z, o)  → area damage + FX (grenades, barrels…)
//  Also here: the weapon table, procedural gun models, pooled combat FX (tracers, flashes, bullet holes,
//  shell casings), grenades and synthesized weapon sounds. Player logic lives in 05e_arsenal.js.
// ============================================================

// ---------- weapon table ----------
// kind: 'fists' | 'melee' | 'gun'. anim: value for anim.weapon ('none' | 'pistol' | 'twohand' | 'melee').
const WPN_WEAPON_ORDER = ['fists', 'bat', 'pistol', 'smg', 'shotgun', 'rifle'];
const WPN_WEAPONS = {
  fists: { id: 'fists', name: 'Кулаки', short: 'Кулаки', kind: 'fists', anim: 'none', price: 0, desc: 'Всегда с тобой.' },
  bat: { id: 'bat', name: 'Бита «Волнолом»', short: 'Волнолом', kind: 'melee', anim: 'melee', price: 120, damage: 30, swing: 0.62, reach: 2.3,
    desc: 'Алюминиевая бита с неоновой обмоткой. Тихо и без патронов.', stats: [0.45, 0.35, 0.05] },
  pistol: { id: 'pistol', name: 'Пистолет «Бриз»', short: 'Бриз', kind: 'gun', anim: 'pistol', price: 350, damage: 34, cd: 0.2, auto: false,
    mag: 12, maxRes: 240, reload: 1.25, spread: 0.007, bloom: 0.02, maxSpread: 0.07, recoil: 0.045, range: 110, pellets: 1,
    ammoPack: 24, ammoPrice: 40, shell: 0.8, tracer: 2.2, flash: 0.55, desc: 'Лёгкий полуавтомат. Точный, быстрый, в кармане не мешает.', stats: [0.45, 0.5, 0.55] },
  smg: { id: 'smg', name: 'Пистолет-пулемёт «Шторм»', short: 'Шторм', kind: 'gun', anim: 'twohand', price: 1200, damage: 17, cd: 0.075, auto: true,
    mag: 30, maxRes: 480, reload: 1.6, spread: 0.016, bloom: 0.009, maxSpread: 0.08, recoil: 0.018, range: 85, pellets: 1,
    ammoPack: 60, ammoPrice: 90, shell: 0.75, tracer: 2.4, flash: 0.6, desc: 'Автоматический огонь в компактном корпусе. Держи кнопку — и шторм начнётся.', stats: [0.3, 0.95, 0.4] },
  shotgun: { id: 'shotgun', name: 'Дробовик «Прибой»', short: 'Прибой', kind: 'gun', anim: 'twohand', price: 1800, damage: 13, cd: 0.88, auto: false,
    mag: 6, maxRes: 96, reload: 0.46, shellReload: true, spread: 0.07, bloom: 0, maxSpread: 0.07, recoil: 0.12, range: 46, pellets: 9,
    ammoPack: 12, ammoPrice: 80, shell: 1.5, tracer: 1.3, flash: 1.0, desc: 'Помповое ружьё. Девять дробин на выстрел — вблизи ему нет равных.', stats: [1.0, 0.2, 0.25] },
  rifle: { id: 'rifle', name: 'Автомат «Цунами»', short: 'Цунами', kind: 'gun', anim: 'twohand', price: 3200, damage: 30, cd: 0.105, auto: true,
    mag: 30, maxRes: 360, reload: 1.9, spread: 0.0045, bloom: 0.0095, maxSpread: 0.055, recoil: 0.027, range: 170, pellets: 1,
    ammoPack: 60, ammoPrice: 150, shell: 1.2, tracer: 3.4, flash: 0.75, desc: 'Штурмовая винтовка с коллиматором. Бьёт далеко и кучно.', stats: [0.65, 0.8, 1.0] },
};
const WPN_GRENADE = { name: 'Граната «Гром»', price: 120, max: 10, fuse: 2.3, radius: 8.5, damage: 165, speed: 15 };

// ---------- shared assets ----------
const WPN_WA = { ready: false, geo: {}, mats: null, vmats: null, tex: {}, muzzle: {}, eject: {}, sight: {}, left: {}, tip: new V3(0, 0, 0.74) };
const WPN_GUNCOL = { metal: '#3b4048', poly: '#26292f', light: '#a3aab3', dark: '#15171a', wood: '#8c5631', woodD: '#5c3820', alu: '#c3c9d1' };

// Merged low-poly geometry builder: group 0 = lit body (vertex colours), group 1 = unlit neon accents.
const _wpnGM = new THREE.Matrix4(), _wpnGE = new THREE.Euler(), _wpnGQ = new THREE.Quaternion(), _wpnGP = new V3(), _wpnGS = new V3();
class WpnGunGeo {
  constructor() { this.parts = [[], []]; }
  add(geo, x, y, z, o, col) {
    o = o || {};
    _wpnGE.set(o.rx || 0, o.ry || 0, o.rz || 0); _wpnGQ.setFromEuler(_wpnGE); _wpnGP.set(x, y, z); _wpnGS.set(o.sx || 1, o.sy || 1, o.sz || 1);
    geo.applyMatrix4(_wpnGM.compose(_wpnGP, _wpnGQ, _wpnGS));
    const g = geo.index ? geo.toNonIndexed() : geo;
    const n = g.attributes.position.count, c = new Float32Array(n * 3), cc = new THREE.Color(col);
    for (let i = 0; i < n; i++) { c[i * 3] = cc.r; c[i * 3 + 1] = cc.g; c[i * 3 + 2] = cc.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    this.parts[o.glow ? 1 : 0].push(g);
    return this;
  }
  box(w, h, d, x, y, z, col, o) { return this.add(new THREE.BoxGeometry(w, h, d), x, y, z, o, col); }
  // cylinder along +Z (r0 at the back, r1 at the front)
  cyl(r0, r1, len, seg, x, y, z, col, o) { const g = new THREE.CylinderGeometry(r1, r0, len, seg || 10); g.rotateX(Math.PI / 2); return this.add(g, x, y, z, o, col); }
  sph(r, x, y, z, col, o) { return this.add(new THREE.SphereGeometry(r, 10, 8), x, y, z, o, col); }
  build() {
    const all = this.parts[0].concat(this.parts[1]);
    let total = 0; for (const g of all) total += g.attributes.position.count;
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
    let o = 0;
    for (const g of all) { const n = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3); o += n; g.dispose(); }
    const m = new THREE.BufferGeometry();
    m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    m.setAttribute('color', new THREE.BufferAttribute(col, 3));
    let n0 = 0; for (const g of this.parts[0]) n0 += g.attributes.position.count;
    m.addGroup(0, n0, 0); m.addGroup(n0, total - n0, 1);
    m.computeBoundingSphere();
    return m;
  }
}
// Canonical gun frame: origin = centre of the shooting hand's grip, +Z = barrel, +Y = up, gun's right side = -X.
function wpnBuildGunGeo(type) {
  const B = new WpnGunGeo(), C = WPN_GUNCOL;
  if (type === 'pistol') {
    B.box(0.029, 0.112, 0.045, 0, -0.006, -0.014, C.poly, { rx: 0.24 });
    B.box(0.031, 0.012, 0.05, 0, -0.064, -0.03, C.metal, { rx: 0.24 });
    for (let i = 0; i < 5; i++) B.box(0.0305, 0.096, 0.003, 0, -0.004, -0.04 + i * 0.006, C.dark, { rx: 0.24, sx: 1.02 });
    B.box(0.027, 0.022, 0.16, 0, 0.061, 0.038, C.poly);
    B.box(0.031, 0.034, 0.196, 0, 0.089, 0.045, C.metal);
    for (let i = 0; i < 4; i++) B.box(0.0316, 0.026, 0.0035, 0, 0.09, -0.042 + i * 0.008, C.light);
    B.box(0.014, 0.004, 0.05, -0.0085, 0.106, 0.04, C.dark);
    B.cyl(0.0078, 0.0078, 0.012, 10, 0, 0.091, 0.146, C.dark);
    B.box(0.007, 0.006, 0.05, 0, 0.038, 0.047, C.poly);
    B.box(0.007, 0.024, 0.006, 0, 0.049, 0.073, C.poly);
    B.box(0.004, 0.017, 0.006, 0, 0.044, 0.035, C.light, { rx: 0.35 });
    B.box(0.006, 0.008, 0.008, 0, 0.11, 0.134, C.dark);
    B.box(0.026, 0.008, 0.008, 0, 0.11, -0.04, C.dark);
    B.box(0.0315, 0.0035, 0.12, 0, 0.076, 0.058, '#3fe5ef', { glow: true });
    B.box(0.005, 0.004, 0.004, 0, 0.115, 0.134, '#7dff6a', { glow: true });
    WPN_WA.muzzle.pistol = new V3(0, 0.091, 0.158); WPN_WA.eject.pistol = new V3(-0.018, 0.098, 0.04); WPN_WA.sight.pistol = 0.112;
    WPN_WA.left.pistol = [0.03, -0.022, 0.004];
  } else if (type === 'smg') {
    B.box(0.03, 0.105, 0.042, 0, -0.008, -0.01, C.poly, { rx: 0.2 });
    B.box(0.046, 0.07, 0.3, 0, 0.075, 0.07, C.metal);
    B.box(0.02, 0.008, 0.22, 0, 0.114, 0.07, C.dark);
    for (let i = 0; i < 9; i++) B.box(0.022, 0.004, 0.006, 0, 0.12, -0.02 + i * 0.024, C.dark);
    B.box(0.012, 0.016, 0.012, 0, 0.122, -0.06, C.dark);
    B.box(0.006, 0.016, 0.01, 0, 0.122, 0.205, C.dark);
    B.cyl(0.018, 0.018, 0.07, 12, 0, 0.083, 0.255, C.poly);
    for (let i = 0; i < 3; i++) B.cyl(0.0195, 0.0195, 0.006, 12, 0, 0.083, 0.232 + i * 0.02, C.light);
    B.cyl(0.0085, 0.0085, 0.06, 10, 0, 0.083, 0.315, C.dark);
    B.box(0.027, 0.15, 0.034, 0, -0.02, 0.108, C.poly, { rx: -0.08 });
    B.box(0.03, 0.01, 0.038, 0, -0.096, 0.114, C.metal, { rx: -0.08 });
    B.box(0.008, 0.006, 0.05, 0, 0.036, 0.04, C.poly);
    B.box(0.004, 0.016, 0.006, 0, 0.045, 0.03, C.light, { rx: 0.3 });
    for (const s of [-1, 1]) B.box(0.008, 0.008, 0.2, s * 0.018, 0.07, -0.18, C.light);
    B.box(0.046, 0.075, 0.014, 0, 0.06, -0.285, C.poly);
    B.box(0.01, 0.012, 0.03, -0.028, 0.095, 0.15, C.light);
    B.box(0.0475, 0.006, 0.19, 0, 0.058, 0.07, '#ff3f8e', { glow: true });
    WPN_WA.muzzle.smg = new V3(0, 0.083, 0.35); WPN_WA.eject.smg = new V3(-0.024, 0.09, 0.08); WPN_WA.sight.smg = 0.126;
    WPN_WA.left.smg = [0, 0.012, 0.215];
  } else if (type === 'shotgun') {
    B.box(0.032, 0.1, 0.046, 0, -0.004, -0.012, C.wood, { rx: 0.35 });
    B.box(0.038, 0.06, 0.3, 0, 0.043, -0.2, C.wood, { rx: 0.1 });
    B.box(0.038, 0.115, 0.05, 0, 0.022, -0.34, C.wood, { rx: 0.1 });
    B.box(0.041, 0.12, 0.016, 0, 0.022, -0.37, C.dark, { rx: 0.1 });
    B.box(0.044, 0.07, 0.2, 0, 0.075, 0.06, C.metal);
    B.box(0.012, 0.004, 0.13, -0.0225, 0.08, 0.06, C.dark);
    B.cyl(0.0125, 0.0125, 0.5, 12, 0, 0.095, 0.41, C.metal);
    B.cyl(0.011, 0.011, 0.38, 10, 0, 0.062, 0.35, C.dark);
    B.cyl(0.021, 0.021, 0.15, 12, 0, 0.062, 0.34, C.wood);
    for (let i = 0; i < 4; i++) B.cyl(0.0222, 0.0222, 0.008, 12, 0, 0.062, 0.29 + i * 0.033, C.woodD);
    B.box(0.006, 0.008, 0.006, 0, 0.112, 0.648, C.light);
    B.box(0.008, 0.006, 0.05, 0, 0.036, 0.04, C.metal);
    B.box(0.004, 0.016, 0.006, 0, 0.046, 0.03, C.light, { rx: 0.3 });
    B.cyl(0.0137, 0.0137, 0.012, 12, 0, 0.095, 0.655, '#ff8a3d', { glow: true });
    B.box(0.0445, 0.005, 0.12, 0, 0.055, 0.06, '#ff8a3d', { glow: true });
    WPN_WA.muzzle.shotgun = new V3(0, 0.095, 0.67); WPN_WA.eject.shotgun = new V3(-0.024, 0.085, 0.06); WPN_WA.sight.shotgun = 0.113;
    WPN_WA.left.shotgun = [0, 0.05, 0.34];
  } else if (type === 'rifle') {
    B.box(0.03, 0.1, 0.042, 0, -0.006, -0.012, C.poly, { rx: 0.3 });
    B.box(0.046, 0.058, 0.3, 0, 0.088, 0.07, C.metal);
    B.box(0.042, 0.04, 0.17, 0, 0.045, 0.03, C.poly);
    B.box(0.022, 0.01, 0.52, 0, 0.122, 0.2, C.dark);
    for (let i = 0; i < 20; i++) B.box(0.024, 0.004, 0.008, 0, 0.128, -0.04 + i * 0.026, C.dark);
    B.cyl(0.031, 0.031, 0.27, 8, 0, 0.085, 0.355, C.poly);
    B.cyl(0.009, 0.009, 0.12, 10, 0, 0.085, 0.55, C.dark);
    B.cyl(0.014, 0.014, 0.045, 10, 0, 0.085, 0.628, C.metal);
    B.box(0.028, 0.09, 0.05, 0, -0.004, 0.102, C.poly, { rx: -0.15 });
    B.box(0.028, 0.072, 0.048, 0, -0.078, 0.122, C.poly, { rx: -0.38 });
    B.box(0.03, 0.01, 0.052, 0, -0.114, 0.137, C.metal, { rx: -0.38 });
    B.box(0.042, 0.065, 0.22, 0, 0.078, -0.19, C.poly);
    B.box(0.03, 0.02, 0.16, 0, 0.115, -0.18, C.metal);
    B.box(0.044, 0.1, 0.014, 0, 0.065, -0.305, C.dark);
    B.box(0.008, 0.006, 0.05, 0, 0.022, 0.04, C.poly);
    B.box(0.004, 0.016, 0.006, 0, 0.03, 0.03, C.light, { rx: 0.3 });
    // open red-dot frame (the dot itself is drawn by the HUD in first-person aim)
    B.box(0.026, 0.012, 0.06, 0, 0.133, 0.06, C.dark);
    B.box(0.036, 0.006, 0.05, 0, 0.168, 0.06, C.metal);
    for (const s of [-1, 1]) B.box(0.005, 0.036, 0.05, s * 0.0155, 0.15, 0.06, C.metal);
    B.box(0.0605, 0.005, 0.2, 0, 0.085, 0.355, '#3fe5ef', { glow: true });
    B.box(0.0465, 0.004, 0.1, 0, 0.07, 0.1, '#3fe5ef', { glow: true });
    WPN_WA.muzzle.rifle = new V3(0, 0.085, 0.655); WPN_WA.eject.rifle = new V3(-0.024, 0.095, 0.065); WPN_WA.sight.rifle = 0.149;
    WPN_WA.left.rifle = [0, 0.05, 0.36];
  } else if (type === 'bat') {
    B.cyl(0.024, 0.024, 0.016, 12, 0, 0, -0.075, C.dark);
    B.cyl(0.0175, 0.0175, 0.2, 10, 0, 0, 0.025, '#ff3f8e');
    B.cyl(0.0155, 0.017, 0.17, 10, 0, 0, 0.2, C.alu);
    B.cyl(0.017, 0.034, 0.18, 12, 0, 0, 0.375, C.alu);
    B.cyl(0.034, 0.034, 0.33, 14, 0, 0, 0.63, C.alu);
    B.cyl(0.034, 0.029, 0.014, 14, 0, 0, 0.802, C.light);
    B.cyl(0.0348, 0.0348, 0.03, 14, 0, 0, 0.52, '#3fe5ef', { glow: true });
    B.cyl(0.0182, 0.0182, 0.008, 10, 0, 0, -0.066, '#3fe5ef', { glow: true });
  } else if (type === 'grenade') {
    B.sph(0.032, 0, 0, 0, '#2f4a3a', { sy: 1.15 });
    B.cyl(0.013, 0.013, 0.022, 10, 0, 0.042, 0, C.metal, { rx: -Math.PI / 2 });
    B.box(0.012, 0.062, 0.005, 0, 0.012, 0.033, C.light, { rx: 0.12 });
    B.add(new THREE.TorusGeometry(0.011, 0.0022, 6, 12), 0.018, 0.052, 0, { ry: Math.PI / 2 }, C.light);
    B.cyl(0.0335, 0.0335, 0.008, 12, 0, 0, 0, '#ff4d5e', { rx: -Math.PI / 2, glow: true });
  }
  return B.build();
}
function wpnMakeWeaponTextures() {
  const T = WPN_WA.tex;
  { // muzzle flash / impact flare: hot core with four soft spikes
    const S = 128, c = mkCanvas(S, S), g = c.getContext('2d');
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 60);
    r.addColorStop(0, 'rgba(255,255,240,1)'); r.addColorStop(0.18, 'rgba(255,220,140,0.95)'); r.addColorStop(0.45, 'rgba(255,140,40,0.35)'); r.addColorStop(1, 'rgba(255,90,20,0)');
    g.fillStyle = r; g.fillRect(0, 0, S, S);
    g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 6; k++) {
      g.save(); g.translate(64, 64); g.rotate(k * Math.PI / 3 + (k % 2) * 0.2);
      const gr = g.createLinearGradient(0, 0, 60, 0); gr.addColorStop(0, 'rgba(255,240,200,0.9)'); gr.addColorStop(1, 'rgba(255,150,60,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(0, -5); g.lineTo(k % 2 ? 44 : 62, 0); g.lineTo(0, 5); g.closePath(); g.fill(); g.restore();
    }
    T.flare = toTex(c, { wrap: false });
  }
  { // tracer: bright core across the width, fading toward the tail (canvas top)
    const c = mkCanvas(32, 128), g = c.getContext('2d');
    for (let y = 0; y < 128; y++) {
      const a = Math.pow(y / 127, 1.6);
      const gr = g.createLinearGradient(0, 0, 32, 0);
      gr.addColorStop(0, 'rgba(255,200,120,0)'); gr.addColorStop(0.5, `rgba(255,250,225,${a})`); gr.addColorStop(1, 'rgba(255,200,120,0)');
      g.fillStyle = gr; g.fillRect(0, y, 32, 1);
    }
    T.tracer = toTex(c, { wrap: false });
  }
  { // bullet hole
    const S = 64, c = mkCanvas(S, S), g = c.getContext('2d');
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 30);
    r.addColorStop(0, 'rgba(8,8,10,1)'); r.addColorStop(0.22, 'rgba(15,14,16,0.95)'); r.addColorStop(0.36, 'rgba(60,55,52,0.55)'); r.addColorStop(0.6, 'rgba(120,112,100,0.18)'); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(20,18,18,0.55)'; g.lineWidth = 1.2;
    for (let k = 0; k < 7; k++) { const a = Math.random() * TAU, l = rr(10, 22); g.beginPath(); g.moveTo(32 + Math.cos(a) * 6, 32 + Math.sin(a) * 6); g.lineTo(32 + Math.cos(a + rr(-0.2, 0.2)) * l, 32 + Math.sin(a + rr(-0.2, 0.2)) * l); g.stroke(); }
    T.hole = toTex(c, { wrap: false });
  }
}
function wpnInitWeaponAssets() {
  if (WPN_WA.ready) return;
  wpnMakeWeaponTextures();
  WPN_WA.mats = [new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.46, metalness: 0.42 }), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })];
  // view-model variants: transparent so they draw last (after the depth clear, see 05e_viewmodel.js)
  WPN_WA.vmats = WPN_WA.mats.map((m) => { const v = m.clone(); v.transparent = true; v.fog = false; return v; });
  for (const t of ['pistol', 'smg', 'shotgun', 'rifle', 'bat', 'grenade']) WPN_WA.geo[t] = wpnBuildGunGeo(t);
  WPN_WA.ready = true;
}
function wpnGunMesh(type, vm) {
  const m = new THREE.Mesh(WPN_WA.geo[type], vm ? WPN_WA.vmats : WPN_WA.mats);
  m.userData.type = type; m.userData.muzzle = WPN_WA.muzzle[type] || null;
  return m;
}

// ---------- attachGun ----------
// Attach a weapon model to a character's right hand (H from buildHuman). Returns the mesh, or null for 'none'/'fists'.
// type: 'pistol' | 'smg' | 'shotgun' | 'rifle' | 'bat' | 'grenade' | null (remove).
// Grip frame (shared with the human animation): the right hand bone H.bones[HB.haR] has its origin at the wrist,
// +Z along the barrel, +Y up, +X to the character's left; the fist (grip centre) sits just below the wrist.
// The bat's axis points along the hand's +Y. Offsets per model live in WPN_ATTACH (tune them, not the code).
// H.gun / H.gunType are set so fireBullet can find the muzzle when this character shoots.
const WPN_ATTACH = {
  pistol: { p: [0.004, -0.062, 0.012], r: [0, 0, 0] }, smg: { p: [0.004, -0.062, 0.012], r: [0, 0, 0] },
  shotgun: { p: [0.004, -0.062, 0.012], r: [0, 0, 0] }, rifle: { p: [0.004, -0.062, 0.012], r: [0, 0, 0] },
  bat: { p: [0.004, -0.062, 0.014], r: [-Math.PI / 2, 0, 0] }, grenade: { p: [0, -0.066, 0.03], r: [0, 0, 0] },
};
function attachGun(H, type) {
  if (!H || !H.bones) return null;
  if (!WPN_WA.ready) wpnInitWeaponAssets();
  const hand = H.bones[HB.haR];
  if (H.gun && H.gunType === type) { H.gun.visible = true; return H.gun; }
  if (H.gun) { hand.remove(H.gun); H.gun = null; H.gunType = null; }
  if (!type || type === 'none' || type === 'fists' || !WPN_WA.geo[type]) return null;
  const m = wpnGunMesh(type, false), A = WPN_ATTACH[type];
  m.castShadow = true;
  m.position.set(A.p[0], A.p[1], A.p[2]); m.rotation.set(A.r[0], A.r[1], A.r[2]);
  hand.add(m);
  H.gun = m; H.gunType = type;
  return m;
}
// World position of a character's muzzle (false if it has no gun).
const _wpnMzv = new V3();
function wpnGunMuzzle(H, out) {
  const g = H && H.gun;
  if (!g || !g.userData.muzzle || !g.visible) return false;
  g.updateWorldMatrix(true, false);
  out.copy(g.userData.muzzle).applyMatrix4(g.matrixWorld);
  return true;
}

// ---------- pooled FX ----------
const _wpnCR = new V3(), _wpnCU = new V3(), _wpnCB = new V3(), _wpnFx1 = new V3(), _wpnFx2 = new V3(), _wpnFx3 = new V3(), _wpnFxM = new THREE.Matrix4(), _wpnFxC = new THREE.Color();
function wpnCamBasis() {
  const e = camera.matrixWorld.elements;
  _wpnCR.set(e[0], e[1], e[2]).normalize(); _wpnCU.set(e[4], e[5], e[6]).normalize(); _wpnCB.set(e[8], e[9], e[10]).normalize();
}
// Packed instanced pool: active instances live in [0, n), removal swaps with the last one.
class WpnFxPool {
  constructor(geo, mat, max, fields) {
    this.max = max; this.n = 0;
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _wpnFxC.setRGB(1, 1, 1));
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0; this.mesh.frustumCulled = false;
    this.f = {}; for (const k of fields) this.f[k] = new Float32Array(max);
    this.keys = fields; this.lastN = 0;
    scene.add(this.mesh);
  }
  alloc() { if (this.n >= this.max) return -1; return this.n++; }
  get dirty() { const d = this.n > 0 || this.lastN > 0; this.lastN = this.n; return d; }
  kill(i) {
    const j = --this.n; if (i === j) return;
    for (const k of this.keys) { const a = this.f[k]; a[i] = a[j]; }
  }
  commit() { if (!this.dirty) return; this.mesh.count = this.n; this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; }
}
const WPN_WFX = { tracers: null, flares: null, holes: null, holeI: 0, holeN: 0, shells: null, glow: null, light: null, lightT: 0, lightI: 0 };
function wpnInitWeaponFx() {
  const lowQ = qualityName === 'low';
  { // tracers: streak quads billboarded around their axis
    const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2);
    const m = new THREE.MeshBasicMaterial({ map: WPN_WA.tex.tracer, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });
    m.forceSinglePass = true;
    WPN_WFX.tracers = new WpnFxPool(g, m, 64, ['ax', 'ay', 'az', 'ux', 'uy', 'uz', 'len', 't', 'sp', 'L', 'w', 'r', 'g', 'b']);
    WPN_WFX.tracers.mesh.renderOrder = 7;
  }
  { // flares: camera-facing flashes (muzzle flashes, impact sparks, explosion flash)
    const g = new THREE.PlaneGeometry(1, 1);
    const m = new THREE.MeshBasicMaterial({ map: WPN_WA.tex.flare, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    WPN_WFX.flares = new WpnFxPool(g, m, 48, ['x', 'y', 'z', 's', 'a', 't', 'life', 'r', 'g', 'b']);
    WPN_WFX.flares.mesh.renderOrder = 7;
  }
  { // bullet holes: ring buffer of oriented decals
    const g = new THREE.PlaneGeometry(1, 1);
    const m = new THREE.MeshBasicMaterial({ map: WPN_WA.tex.hole, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const max = lowQ ? 60 : 160;
    WPN_WFX.holes = new THREE.InstancedMesh(g, m, max); WPN_WFX.holes.count = 0; WPN_WFX.holes.frustumCulled = false; WPN_WFX.holes.renderOrder = 2;
    WPN_WFX.holes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(WPN_WFX.holes);
  }
  { // brass shell casings with a little physics
    const g = new THREE.CylinderGeometry(0.0055, 0.0055, 0.024, 7); g.rotateZ(Math.PI / 2);
    const m = new THREE.MeshStandardMaterial({ color: 0xd9a63a, metalness: 0.55, roughness: 0.35, emissive: new THREE.Color('#5a3a08'), emissiveIntensity: 0.6 });
    WPN_WFX.shells = new WpnFxPool(g, m, 48, ['x', 'y', 'z', 'vx', 'vy', 'vz', 'rx', 'ry', 'wx', 'wy', 'life', 's', 'rest']);
    WPN_WFX.shells.mesh.castShadow = false;
  }
  if (qualityName === 'high') { WPN_WFX.light = new THREE.PointLight(0xffb060, 0, 14, 2); scene.add(WPN_WFX.light); }
  WPN_WFX.glow = { x: new Float32Array(24), y: new Float32Array(24), z: new Float32Array(24), r: new Float32Array(24), g: new Float32Array(24), b: new Float32Array(24), s: new Float32Array(24), t: new Float32Array(24), life: new Float32Array(24), n: 0 };
  EXT.glow.push(wpnWeaponGlows);
}
function wpnFxTracer(x0, y0, z0, x1, y1, z1, L, w, r, g, b) {
  const P = WPN_WFX.tracers; if (!P) return;
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, len = Math.hypot(dx, dy, dz);
  if (len < 0.5) return;
  const i = P.alloc(); if (i < 0) return;
  const f = P.f;
  f.ax[i] = x0; f.ay[i] = y0; f.az[i] = z0; f.ux[i] = dx / len; f.uy[i] = dy / len; f.uz[i] = dz / len; f.len[i] = len;
  f.t[i] = L * 0.6; f.sp[i] = 330; f.L[i] = L; f.w[i] = w; f.r[i] = r; f.g[i] = g; f.b[i] = b;
}
function wpnFxFlare(x, y, z, s, life, r, g, b) {
  const P = WPN_WFX.flares; if (!P) return;
  const i = P.alloc(); if (i < 0) return;
  const f = P.f;
  f.x[i] = x; f.y[i] = y; f.z[i] = z; f.s[i] = s; f.a[i] = Math.random() * TAU; f.t[i] = life; f.life[i] = life; f.r[i] = r; f.g[i] = g; f.b[i] = b;
}
function wpnFxGlow(x, y, z, r, g, b, s, life) {
  const G = WPN_WFX.glow; if (!G || G.n >= 24) return;
  const i = G.n++;
  G.x[i] = x; G.y[i] = y; G.z[i] = z; G.r[i] = r; G.g[i] = g; G.b[i] = b; G.s[i] = s; G.t[i] = life; G.life[i] = life;
}
function wpnWeaponGlows(layer) {
  const G = WPN_WFX.glow; if (!G) return;
  for (let i = 0; i < G.n; i++) { const k = G.t[i] / G.life[i]; layer.add(G.x[i], G.y[i], G.z[i], G.r[i] * k, G.g[i] * k, G.b[i] * k, G.s[i]); }
  for (const f of WPN_WGLOW) f(layer);
}
const WPN_WGLOW = []; // extra per-frame glow callbacks from the weapon modules
const _wpnHm4 = new THREE.Matrix4(), _wpnHq4 = new THREE.Quaternion(), _wpnHv = new V3(), _wpnHz = new V3(0, 0, 1);
function wpnFxHole(x, y, z, nx, ny, nz) {
  const M = WPN_WFX.holes; if (!M) return;
  _wpnHv.set(nx, ny, nz); _wpnHq4.setFromUnitVectors(_wpnHz, _wpnHv);
  const s = rr(0.1, 0.15);
  _wpnFx1.set(x + nx * 0.015, y + ny * 0.015, z + nz * 0.015);
  _wpnFx2.set(s, s, s);
  _wpnHm4.compose(_wpnFx1, _wpnHq4, _wpnFx2);
  _wpnHm4.multiply(_wpnFxM.makeRotationZ(Math.random() * TAU));
  M.setMatrixAt(WPN_WFX.holeI, _wpnHm4);
  WPN_WFX.holeI = (WPN_WFX.holeI + 1) % M.instanceMatrix.count;
  WPN_WFX.holeN = Math.min(WPN_WFX.holeN + 1, M.instanceMatrix.count);
  M.count = WPN_WFX.holeN; M.instanceMatrix.needsUpdate = true;
}
function wpnFxShell(x, y, z, vx, vy, vz, size) {
  const P = WPN_WFX.shells; if (!P) return;
  let i = P.alloc();
  if (i < 0) { // recycle the oldest resting shell
    let best = -1, bl = 1e9; for (let k = 0; k < P.n; k++) if (P.f.life[k] < bl) { bl = P.f.life[k]; best = k; }
    if (best < 0) return; i = best;
  }
  const f = P.f;
  f.x[i] = x; f.y[i] = y; f.z[i] = z; f.vx[i] = vx; f.vy[i] = vy; f.vz[i] = vz; f.rx[i] = 0; f.ry[i] = Math.random() * TAU;
  f.wx[i] = rr(-25, 25); f.wy[i] = rr(-18, 18); f.life[i] = 3.5; f.s[i] = size || 1; f.rest[i] = 0;
}
function wpnUpdateWeaponFx(dt) {
  if (!WPN_WFX.tracers) return;
  wpnCamBasis();
  const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
  // tracers
  { const P = WPN_WFX.tracers, f = P.f, M = P.mesh;
    for (let i = P.n - 1; i >= 0; i--) {
      f.t[i] += f.sp[i] * dt;
      const head = Math.min(f.t[i], f.len[i]), tail = Math.max(0, f.t[i] - f.L[i]);
      if (tail >= f.len[i] - 0.01) { P.kill(i); continue; }
    }
    for (let i = 0; i < P.n; i++) {
      const head = Math.min(f.t[i], f.len[i]), tail = Math.max(0, f.t[i] - f.L[i]), m = (head + tail) * 0.5, L = Math.max(0.05, head - tail);
      const ux = f.ux[i], uy = f.uy[i], uz = f.uz[i];
      const px = f.ax[i] + ux * m, py = f.ay[i] + uy * m, pz = f.az[i] + uz * m;
      let vx = cx - px, vy = cy - py, vz = cz - pz;
      const dist = Math.hypot(vx, vy, vz) || 1;
      const d = vx * ux + vy * uy + vz * uz; vx -= ux * d; vy -= uy * d; vz -= uz * d;
      _wpnFx2.set(vx, vy, vz).normalize(); _wpnFx3.set(ux, uy, uz);
      _wpnFx1.crossVectors(_wpnFx2, _wpnFx3);
      const w = Math.max(f.w[i], dist * 0.0022);
      _wpnFxM.makeBasis(_wpnFx1.multiplyScalar(w), _wpnFx2, _wpnFx3.multiplyScalar(L)); _wpnFxM.setPosition(px, py, pz);
      M.setMatrixAt(i, _wpnFxM);
      const fade = Math.min(1, (f.len[i] - tail) / 6 + 0.35);
      M.setColorAt(i, _wpnFxC.setRGB(f.r[i] * fade, f.g[i] * fade, f.b[i] * fade));
    }
    P.commit(); }
  // flares
  { const P = WPN_WFX.flares, f = P.f, M = P.mesh;
    for (let i = P.n - 1; i >= 0; i--) { f.t[i] -= dt; if (f.t[i] <= 0) P.kill(i); }
    for (let i = 0; i < P.n; i++) {
      const k = f.t[i] / f.life[i], s = f.s[i] * (0.6 + 0.4 * k), ca = Math.cos(f.a[i]) * s, sa = Math.sin(f.a[i]) * s;
      _wpnFx1.set(_wpnCR.x * ca + _wpnCU.x * sa, _wpnCR.y * ca + _wpnCU.y * sa, _wpnCR.z * ca + _wpnCU.z * sa);
      _wpnFx2.set(-_wpnCR.x * sa + _wpnCU.x * ca, -_wpnCR.y * sa + _wpnCU.y * ca, -_wpnCR.z * sa + _wpnCU.z * ca);
      _wpnFxM.makeBasis(_wpnFx1, _wpnFx2, _wpnCB); _wpnFxM.setPosition(f.x[i], f.y[i], f.z[i]);
      M.setMatrixAt(i, _wpnFxM);
      M.setColorAt(i, _wpnFxC.setRGB(f.r[i] * k, f.g[i] * k, f.b[i] * k));
    }
    P.commit(); }
  // shells
  { const P = WPN_WFX.shells, f = P.f, M = P.mesh;
    for (let i = P.n - 1; i >= 0; i--) {
      f.life[i] -= dt;
      if (f.life[i] <= 0) { P.kill(i); continue; }
      if (f.rest[i]) continue;
      f.vy[i] -= 14 * dt;
      f.x[i] += f.vx[i] * dt; f.y[i] += f.vy[i] * dt; f.z[i] += f.vz[i] * dt;
      f.rx[i] += f.wx[i] * dt; f.ry[i] += f.wy[i] * dt;
      const g = groundH(f.x[i], f.z[i]) + 0.006;
      if (f.y[i] < g) {
        f.y[i] = g;
        if (f.vy[i] < -1.2) { f.vy[i] *= -0.35; f.vx[i] *= 0.5; f.vz[i] *= 0.5; f.wx[i] *= 0.5; if (Math.random() < 0.3 && wpnDist2Cam(f.x[i], f.z[i]) < 400) WPN_WSND.tink(0.25); }
        else { f.vy[i] = 0; f.rest[i] = 1; f.rx[i] = 0; }
      }
    }
    for (let i = 0; i < P.n; i++) {
      _wpnGE.set(f.rx[i], f.ry[i], 0); _wpnGQ.setFromEuler(_wpnGE); _wpnFx1.set(f.x[i], f.y[i], f.z[i]); const s = f.s[i]; _wpnFx2.set(s, s, s);
      M.setMatrixAt(i, _wpnFxM.compose(_wpnFx1, _wpnGQ, _wpnFx2));
    }
    if (P.dirty) { M.count = P.n; M.instanceMatrix.needsUpdate = true; } }
  // timed glows + muzzle light
  { const G = WPN_WFX.glow;
    for (let i = G.n - 1; i >= 0; i--) {
      G.t[i] -= dt;
      if (G.t[i] <= 0) { const j = --G.n; if (i !== j) { G.x[i] = G.x[j]; G.y[i] = G.y[j]; G.z[i] = G.z[j]; G.r[i] = G.r[j]; G.g[i] = G.g[j]; G.b[i] = G.b[j]; G.s[i] = G.s[j]; G.t[i] = G.t[j]; G.life[i] = G.life[j]; } }
    } }
  wpnUpdateMuzzleLight(dt);
}
function wpnDist2Cam(x, z) { const dx = x - camera.position.x, dz = z - camera.position.z; return dx * dx + dz * dz; }
// A single point light for muzzle flashes / explosions, only on the high preset (it costs a light in every shader).
function wpnUpdateMuzzleLight(dt) {
  const want = qualityName === 'high';
  if (want && !WPN_WFX.light) {
    WPN_WFX.light = new THREE.PointLight(0xffb060, 0, 14, 2); WPN_WFX.light.castShadow = false; scene.add(WPN_WFX.light);
  } else if (!want && WPN_WFX.light) { scene.remove(WPN_WFX.light); WPN_WFX.light.dispose(); WPN_WFX.light = null; }
  if (!WPN_WFX.light) return;
  WPN_WFX.lightT -= dt;
  WPN_WFX.light.intensity = WPN_WFX.lightT > 0 ? WPN_WFX.lightI * Math.min(1, WPN_WFX.lightT / 0.04) : 0;
}
function wpnFlashLight(x, y, z, power, life, dist) {
  if (!WPN_WFX.light) return;
  WPN_WFX.light.position.set(x, y, z); WPN_WFX.lightI = power; WPN_WFX.lightT = life || 0.05; WPN_WFX.light.distance = dist || 14;
}

// ---------- hit-scan ----------
const _wpnBn = { x: 0, y: 1, z: 0 };
// Normal of the building face at a world hit point (buildings are axis-aligned boxes in the collision grid).
function wpnWallNormal(x, y, z, dx, dz, out) {
  const list = cgQuery(x - 0.3, x + 0.3, z - 0.3, z + 0.3);
  let best = 0.25; out.x = 0; out.y = 0; out.z = 0;
  for (let k = 0; k < list.length; k++) {
    const c = list[k]; if (c.t !== 0 || c.h < 2 || y > c.h + 0.05) continue;
    const inZ = z > c.z0 - 0.05 && z < c.z1 + 0.05, inX = x > c.x0 - 0.05 && x < c.x1 + 0.05;
    let d;
    if (inZ && (d = Math.abs(x - c.x0)) < best) { best = d; out.x = -1; out.y = 0; out.z = 0; }
    if (inZ && (d = Math.abs(x - c.x1)) < best) { best = d; out.x = 1; out.y = 0; out.z = 0; }
    if (inX && (d = Math.abs(z - c.z0)) < best) { best = d; out.x = 0; out.y = 0; out.z = -1; }
    if (inX && (d = Math.abs(z - c.z1)) < best) { best = d; out.x = 0; out.y = 0; out.z = 1; }
    if (inX && inZ && (d = Math.abs(y - c.h)) < best) { best = d; out.x = 0; out.y = 1; out.z = 0; }
  }
  if (best === 0.25) { if (Math.abs(dx) > Math.abs(dz)) { out.x = -Math.sign(dx); out.z = 0; } else { out.x = 0; out.z = -Math.sign(dz); } out.y = 0; }
  return out;
}
// Pure ray query (no side effects). Fills and returns `out`.
// SHOT_HOOKS: extra shootable objects (creative props: barrels, walls, ramps…). Each hook is
// fn(o, dx, dy, dz, best) → null or { t, onHit(hitInfo), nx?, ny?, nz? } when its object is hit at distance t < best.
// o = { x, y, z, range, minDist, shooter, weapon, damage } (a reused object: read it, don't keep it).
// Hooks are also consulted by aim traces (no side effects there); fireBullet calls onHit for the nearest hit with
// hitInfo = { x, y, z, dx, dy, dz, dist, nx, ny, nz, damage, shooter, weapon }. The hit's type is 'prop'.
const SHOT_HOOKS = [];
const _wpnShotO = { x: 0, y: 0, z: 0, range: 0, minDist: 0, shooter: null, weapon: null, damage: 0 };
const _wpnTrace = { type: null, target: null, x: 0, y: 0, z: 0, dist: 0, nx: 0, ny: 0, nz: 0, head: false, glass: false, hook: null };
function wpnTraceShot(ox, oy, oz, dx, dy, dz, range, min, shooter, ignore, out, weapon, damage) {
  out = out || _wpnTrace;
  let best = rayBoxes(ox, oy, oz, dx, dy, dz, range), type = best < range ? 'world' : null, target = null, ground = false;
  if (best < min) { best = range; type = null; }
  if (dy < -1e-4) {
    let tg = (groundH(ox, oz) - oy) / dy;
    if (tg > 0 && tg < range) { const tg2 = (groundH(ox + dx * tg, oz + dz * tg) - oy) / dy; if (tg2 > 0) tg = tg2; }
    if (tg > min && tg < best) { best = tg; type = 'world'; ground = true; }
  }
  const h2 = dx * dx + dz * dz || 1e-6;
  let head = false, glass = false;
  for (let i = 0; i < peds.length; i++) {
    const p = peds[i];
    if (p === shooter || p === ignore || p.removed || Math.abs(p.x - ox) > best || Math.abs(p.z - oz) > best) continue;
    const low = p.state === 'dead' || p.state === 'down' || p.state === 'fly';
    const r = low ? 0.7 : 0.33, y0 = p.y, y1 = p.y + (low ? 0.45 : 1.85);
    const t = ((p.x - ox) * dx + (p.z - oz) * dz) / h2;
    if (t < min || t > best) continue;
    const px = ox + dx * t - p.x, pz = oz + dz * t - p.z;
    if (px * px + pz * pz > r * r) continue;
    const py = oy + dy * t; if (py < y0 || py > y1) continue;
    best = t; type = 'ped'; target = p; ground = false; head = !low && py > p.y + 1.52;
  }
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i];
    if (c === shooter || c === ignore || Math.abs(c.x - ox) > best + 4 || Math.abs(c.z - oz) > best + 4) continue;
    const r = carCircles(c, CA), y0 = c.y + 0.25, y1 = c.y + c.T.H + c.T.cabH;
    for (let k = 0; k < 3; k++) {
      const cx = CA[k * 2], cz = CA[k * 2 + 1];
      const t = ((cx - ox) * dx + (cz - oz) * dz) / h2;
      if (t < min || t > best) continue;
      const px = ox + dx * t - cx, pz = oz + dz * t - cz;
      if (px * px + pz * pz > r * r) continue;
      const py = oy + dy * t; if (py < y0 || py > y1) continue;
      best = t; type = 'car'; target = c; ground = false; head = false; glass = py > c.y + c.T.H + 0.05 && k === 1;
    }
  }
  if (shooter !== 'player' && ignore !== player && !player.dead && player.mode === 'foot') {
    const t = ((player.x - ox) * dx + (player.z - oz) * dz) / h2;
    if (t >= min && t < best) {
      const px = ox + dx * t - player.x, pz = oz + dz * t - player.z, py = oy + dy * t;
      if (px * px + pz * pz < 0.35 * 0.35 && py > player.y && py < player.y + 1.85) { best = t; type = 'player'; target = player; ground = false; head = false; }
    }
  }
  let hook = null;
  if (SHOT_HOOKS.length) {
    const so = _wpnShotO;
    so.x = ox; so.y = oy; so.z = oz; so.range = range; so.minDist = min; so.shooter = shooter; so.weapon = weapon || null; so.damage = damage || 0;
    for (let i = 0; i < SHOT_HOOKS.length; i++) {
      let r = null;
      try { r = SHOT_HOOKS[i](so, dx, dy, dz, best); } catch (e) { console.error('SHOT_HOOKS', e); }
      if (r && r.t >= min && r.t < best) { best = r.t; hook = r; type = 'prop'; target = r; ground = false; head = false; glass = false; }
    }
  }
  out.type = type; out.target = target; out.dist = best; out.head = head; out.glass = glass; out.hook = hook;
  out.x = ox + dx * best; out.y = oy + dy * best; out.z = oz + dz * best;
  if (hook) { if (hook.nx !== undefined) { out.nx = hook.nx; out.ny = hook.ny; out.nz = hook.nz; } else { out.nx = -dx; out.ny = -dy; out.nz = -dz; } }
  else if (type === 'world') { if (ground) { out.nx = 0; out.ny = 1; out.nz = 0; } else { wpnWallNormal(out.x, out.y, out.z, dx, dz, _wpnBn); out.nx = _wpnBn.x; out.ny = _wpnBn.y; out.nz = _wpnBn.z; } }
  else { out.nx = -dx; out.ny = -dy; out.nz = -dz; }
  return out;
}
// Random direction inside a cone of half-angle ~spread (radians) around (dx, dy, dz).
const _wpnSd = new V3(), _wpnSa = new V3(), _wpnSb = new V3();
function wpnSpreadDir(dx, dy, dz, spread, out) {
  out.set(dx, dy, dz);
  if (!(spread > 0)) return out;
  _wpnSa.set(Math.abs(dy) < 0.9 ? 0 : 1, Math.abs(dy) < 0.9 ? 1 : 0, 0).cross(out).normalize();
  _wpnSb.crossVectors(out, _wpnSa);
  const a = Math.random() * TAU, r = spread * Math.sqrt(Math.random());
  out.addScaledVector(_wpnSa, Math.cos(a) * r).addScaledVector(_wpnSb, Math.sin(a) * r).normalize();
  return out;
}
// o: { x, y, z: origin; dx, dy, dz: unit direction; range = 120; damage = 20; shooter: 'player' | Ped | Car;
//      spread = 0 (cone half-angle, radians); minDist = 0 (ignore hits closer than this, e.g. camera to player);
//      optional: weapon (sound/FX type, default 'pistol'), ignore (object to skip, e.g. the shooter's car),
//      muzzle {x,y,z} (tracer start), quiet (no sound/gunshot event: extra shotgun pellets), headMul (2),
//      carMul (0.3), falloff (distance where damage starts to drop), tracer (false to hide), force (knockback) }
// returns { type: 'ped' | 'car' | 'player' | 'world' | null, target, x, y, z, dist, head, nx, ny, nz }
function fireBullet(o) {
  const range = o.range || 120, min = o.minDist || 0, weapon = o.weapon || 'pistol', W = WPN_WEAPONS[weapon] || WPN_WEAPONS.pistol;
  wpnSpreadDir(o.dx, o.dy, o.dz, o.spread || 0, _wpnSd);
  const dx = _wpnSd.x, dy = _wpnSd.y, dz = _wpnSd.z;
  const tr = wpnTraceShot(o.x, o.y, o.z, dx, dy, dz, range, min, o.shooter, o.ignore, _wpnTrace, weapon, o.damage || 20);
  const res = { type: tr.type, target: tr.target, x: tr.x, y: tr.y, z: tr.z, dist: tr.dist, head: tr.head, nx: tr.nx, ny: tr.ny, nz: tr.nz };
  // damage with distance falloff
  let dmg = o.damage || 20;
  const fo = o.falloff || range * 0.55;
  if (res.dist > fo) dmg *= lerp(1, 0.5, clamp((res.dist - fo) / Math.max(1, range - fo), 0, 1));
  const byPlayer = o.shooter === 'player';
  if (res.type === 'ped') {
    const p = res.target;
    if (res.head) dmg *= o.headMul || 2;
    const wasAlive = p.state !== 'dead' && p.health > 0;
    p.damage(dmg, o.shooter, dx, dz);
    res.killed = wasAlive && p.health <= 0;
    if (p.state === 'fly' && o.force) { p.vx += dx * o.force; p.vz += dz * o.force; }
    wpnFxPuff(res.x, res.y, res.z, dx, dy, dz, 'ped');
  } else if (res.type === 'car') {
    const c = res.target;
    c.damage(dmg * (o.carMul || 0.3), o.shooter);
    if (c === player.car && !byPlayer) hurtPlayer(dmg * 0.3, 'Застрелен в машине');
    wpnFxPuff(res.x, res.y, res.z, dx, dy, dz, res.glass ? 'glass' : 'metal');
  } else if (res.type === 'player') {
    hurtPlayer(dmg, 'Застрелен');
    if (typeof shakeCam === 'function') shakeCam(0.12);
  } else if (res.type === 'prop') {
    const h = tr.hook;
    res.target = h;
    wpnFxPuff(res.x, res.y, res.z, res.nx, res.ny, res.nz, 'wall');
    if (h && typeof h.onHit === 'function') {
      try { h.onHit({ x: res.x, y: res.y, z: res.z, dx, dy, dz, dist: res.dist, nx: res.nx, ny: res.ny, nz: res.nz, damage: dmg, shooter: o.shooter, weapon }); }
      catch (e) { console.error('SHOT_HOOKS onHit', e); }
    }
  } else if (res.type === 'world') {
    wpnFxPuff(res.x, res.y, res.z, res.nx, res.ny, res.nz, res.ny > 0.5 && res.y < 1 ? 'ground' : 'wall');
    if (Math.random() < (o.pellet ? 0.35 : 1)) wpnFxHole(res.x, res.y, res.z, res.nx, res.ny, res.nz);
  }
  // tracer from the muzzle (or the origin) to the hit
  if (o.tracer !== false) {
    let sx = o.x + dx * min, sy = o.y + dy * min, sz = o.z + dz * min;
    if (o.muzzle) { sx = o.muzzle.x; sy = o.muzzle.y; sz = o.muzzle.z; }
    else if (o.shooter && o.shooter.H && wpnGunMuzzle(o.shooter.H, _wpnMzv)) { sx = _wpnMzv.x; sy = _wpnMzv.y; sz = _wpnMzv.z; if (!o.quiet) { wpnFxFlare(sx, sy, sz, 0.55, 0.06, 1.6, 1.2, 0.7); wpnFxGlow(sx, sy, sz, 1.5, 0.9, 0.4, 3.5, 0.07); } }
    const ex = res.type ? res.x : o.x + dx * range, ey = res.type ? res.y : o.y + dy * range, ez = res.type ? res.z : o.z + dz * range;
    if (!o.pellet || Math.random() < 0.5) wpnFxTracer(sx, sy, sz, ex, ey, ez, W.tracer || 2.2, 0.03, 1.4, 1.05, 0.62);
  }
  if (!o.quiet) {
    WPN_WSND.shot(weapon, o.x, o.z, byPlayer);
    EV.emit('gunshot', { x: o.x, y: o.y, z: o.z, shooter: o.shooter, weapon });
  }
  if (res.type) { if (res.type !== 'world' || wpnDist2Cam(res.x, res.z) < 900) WPN_WSND.impact(res.type === 'world' ? (res.ny > 0.5 ? 'ground' : 'wall') : res.type, res.x, res.z); EV.emit('bulletHit', Object.assign({ shooter: o.shooter, weapon }, res)); }
  return res;
}
// Impact particles (non-gory: cloth dust for people).
function wpnFxPuff(x, y, z, nx, ny, nz, kind) {
  if (kind === 'wall' || kind === 'ground') {
    const col = kind === 'ground' ? [0.5, 0.46, 0.4] : [0.62, 0.6, 0.58];
    for (let i = 0; i < 3; i++) smokeFx.emit(x + nx * 0.05, y + ny * 0.05, z + nz * 0.05, nx * rr(0.6, 1.8) + rr(-0.4, 0.4), ny * rr(0.6, 1.8) + rr(0.1, 0.6), nz * rr(0.6, 1.8) + rr(-0.4, 0.4),
      rr(0.5, 0.9), 0.12, rr(0.5, 0.8), col[0], col[1], col[2], 0.5, col[0] * 0.9, col[1] * 0.9, col[2] * 0.9, 2.2, -0.2);
    for (let i = 0; i < 4; i++) fireFx.emit(x, y, z, nx * rr(2, 5) + rr(-2, 2), ny * rr(2, 5) + rr(0, 3), nz * rr(2, 5) + rr(-2, 2), rr(0.12, 0.3), 0.07, 0.02, 1.8, 1.3, 0.6, 1, 1.2, 0.4, 0.1, 1, 14);
    wpnFxFlare(x + nx * 0.04, y + ny * 0.04, z + nz * 0.04, 0.32, 0.05, 1.2, 0.95, 0.6);
  } else if (kind === 'metal') {
    sparks(x, y, z, 7);
    wpnFxFlare(x, y, z, 0.4, 0.06, 1.6, 1.25, 0.7);
  } else if (kind === 'glass') {
    for (let i = 0; i < 10; i++) fireFx.emit(x, y, z, rr(-2.5, 2.5) - nx * 1.5, rr(0, 2.5), rr(-2.5, 2.5) - nz * 1.5, rr(0.4, 0.9), rr(0.05, 0.09), 0.03, 0.75, 0.95, 1.1, 1, 0.25, 0.35, 0.45, 0.6, 12);
    wpnFxFlare(x, y, z, 0.35, 0.05, 0.9, 1.1, 1.3);
  } else if (kind === 'ped') {
    for (let i = 0; i < 3; i++) smokeFx.emit(x, y, z, rr(-0.6, 0.6) - nx * 0.8, rr(0, 0.8), rr(-0.6, 0.6) - nz * 0.8, rr(0.35, 0.6), 0.1, 0.45, 0.85, 0.84, 0.82, 0.45, 0.7, 0.7, 0.7, 2.5, 0);
  }
}
// Armed NPC helper: shoot at a world point from the NPC's chest with the given accuracy (0..1).
// o: { weapon = H.gunType || 'pistol', damage, accuracy = 0.6, range }
function wpnNpcShoot(ped, tx, ty, tz, o) {
  o = o || {};
  const type = o.weapon || (ped.H && ped.H.gunType) || 'pistol', W = WPN_WEAPONS[type] || WPN_WEAPONS.pistol;
  const ox = ped.x, oy = ped.y + 1.42, oz = ped.z;
  let dx = tx - ox, dy = ty - oy, dz = tz - oz; const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
  const acc = o.accuracy === undefined ? 0.6 : o.accuracy;
  if (ped.anim) ped.anim.recoil = 1;
  const pel = W.pellets || 1;
  let res = null;
  for (let k = 0; k < pel; k++) {
    const r = fireBullet({ x: ox, y: oy, z: oz, dx, dy, dz, range: o.range || W.range, damage: o.damage === undefined ? (W.damage || 20) * 0.55 : o.damage,
      shooter: ped, spread: W.spread + (1 - acc) * 0.09, weapon: type, quiet: k > 0, pellet: pel > 1 });
    if (!res) res = r;
  }
  return res;
}

// ---------- explosions & grenades ----------
// Area damage + FX. o: { radius = 8, damage = 160, by = 'player', car (exploding car to skip) }.
function wpnWeaponExplosion(x, y, z, o) {
  o = o || {};
  const R = o.radius || 8, D = o.damage || 160, by = o.by === undefined ? 'player' : o.by;
  explosionFx(x, y, z);
  wpnFxFlare(x, y + 1, z, 7, 0.22, 2.2, 1.6, 0.9);
  wpnFxGlow(x, y + 1.2, z, 3, 1.6, 0.6, 22, 0.5);
  wpnFlashLight(x, y + 1.5, z, 40, 0.18, 30);
  wpnFxHole(x, groundH(x, z) + 0.005, z, 0, 1, 0); wpnFxHole(x + 0.4, groundH(x, z) + 0.006, z - 0.3, 0, 1, 0);
  let victims = 0;
  for (let i = peds.length - 1; i >= 0; i--) {
    const p = peds[i]; if (p.removed) continue;
    const dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz) || 0.1;
    if (d > R) continue;
    if (!losClear(x, z, p.x, p.z)) continue;
    const k = 1 - d / R;
    const wasAlive = p.state !== 'dead';
    p.damage(D * k + 15, by, dx / d, dz / d);
    if (p.state !== 'dead' || p.y < groundH(p.x, p.z) + 0.3) p.knock(dx / d * (5 + 9 * k), dz / d * (5 + 9 * k), 4 + 10 * k, by);
    if (wasAlive) victims++;
  }
  for (let i = cars.length - 1; i >= 0; i--) {
    const c = cars[i]; if (c === o.car) continue;
    const dx = c.x - x, dz = c.z - z, d = Math.hypot(dx, dz) || 0.1;
    if (d > R + 1.5) continue;
    const k = 1 - Math.min(1, d / (R + 1.5));
    c.damage(D * 0.9 * k + 8, by);
    if (c.kinematic) c.makeDynamic();
    c.vx += dx / d * 7 * k; c.vz += dz / d * 7 * k;
    victims++;
  }
  if (by === 'player' && victims && typeof addCrime === 'function') addCrime(1.4, 'Взрыв на улице!');
  if (GAMEHOOK.explosion) GAMEHOOK.explosion(x, z, o.car || null);
  EV.emit('explosion', { x, y, z, car: o.car || null, by, radius: R, grenade: !!o.grenade });
}
const WPN_GREN = { list: [], geo: null };
function wpnThrowGrenade(x, y, z, vx, vy, vz, by, fuse) {
  let g = WPN_GREN.list.find((q) => !q.active);
  if (!g) {
    if (WPN_GREN.list.length >= 8) return null;
    g = { mesh: wpnGunMesh('grenade', false), active: false };
    g.mesh.castShadow = true; scene.add(g.mesh); WPN_GREN.list.push(g);
  }
  Object.assign(g, { active: true, x, y, z, vx, vy, vz, t: fuse || WPN_GRENADE.fuse, by: by || 'player', rx: 0, rz: 0, bounces: 0 });
  g.mesh.visible = true; g.mesh.position.set(x, y, z);
  return g;
}
function wpnUpdateGrenades(dt) {
  for (const g of WPN_GREN.list) {
    if (!g.active) continue;
    g.t -= dt;
    g.vy -= 18 * dt;
    const nx = g.x + g.vx * dt, nz = g.z + g.vz * dt;
    let ny = g.y + g.vy * dt;
    // buildings / props
    const hit = collideCircle(nx, nz, 0.09, ny);
    if (hit.hit) {
      const vn = g.vx * hit.nx + g.vz * hit.nz;
      if (vn < 0) { g.vx -= 1.45 * vn * hit.nx; g.vz -= 1.45 * vn * hit.nz; g.vx *= 0.7; g.vz *= 0.7; if (-vn > 2) WPN_WSND.bounce(g.x, g.z); }
      g.x = hit.x; g.z = hit.z;
    } else { g.x = nx; g.z = nz; }
    // cars
    for (const c of cars) {
      if (Math.abs(c.x - g.x) > 4 || Math.abs(c.z - g.z) > 4 || ny > c.y + c.T.H + c.T.cabH) continue;
      const r = carCircles(c, CA) + 0.1;
      for (let k = 0; k < 3; k++) {
        const dx = g.x - CA[k * 2], dz = g.z - CA[k * 2 + 1], d = Math.hypot(dx, dz);
        if (d < r && d > 1e-3) {
          const top = c.y + c.T.H + (k === 1 ? c.T.cabH : 0);
          if (g.y > top - 0.15 && g.vy < 0) { ny = top; g.vy = -g.vy * 0.3; g.vx *= 0.7; g.vz *= 0.7; }
          else { const nxx = dx / d, nzz = dz / d, vn = g.vx * nxx + g.vz * nzz; g.x = CA[k * 2] + nxx * r; g.z = CA[k * 2 + 1] + nzz * r; if (vn < 0) { g.vx -= 1.4 * vn * nxx; g.vz -= 1.4 * vn * nzz; g.vx += c.vx * 0.5; g.vz += c.vz * 0.5; } }
        }
      }
    }
    const gh = groundH(g.x, g.z) + 0.035;
    if (ny < gh) {
      ny = gh;
      if (g.vy < -1.5) { g.vy = -g.vy * 0.32; if (g.bounces++ < 3) WPN_WSND.bounce(g.x, g.z); } else g.vy = 0;
      g.vx *= 0.62; g.vz *= 0.62;
    }
    g.y = ny;
    const sp = Math.hypot(g.vx, g.vz);
    g.rx += g.vz * dt * 9; g.rz -= g.vx * dt * 9;
    g.mesh.position.set(g.x, g.y, g.z); g.mesh.rotation.set(g.rx, 0, g.rz);
    if (sp < 0.05 && g.vy === 0) { g.vx = 0; g.vz = 0; }
    if (g.t <= 0) {
      g.active = false; g.mesh.visible = false;
      wpnWeaponExplosion(g.x, g.y, g.z, { radius: WPN_GRENADE.radius, damage: WPN_GRENADE.damage, by: g.by, grenade: true });
    }
  }
}
WPN_WGLOW.push((layer) => {
  const blink = Math.floor(GAME.time * 6) % 2;
  for (const g of WPN_GREN.list) if (g.active && (blink || g.t < 0.6)) layer.add(g.x, g.y + 0.06, g.z, 1.6, 0.15, 0.2, 0.9);
});

// ---------- sounds (synthesized) ----------
const WPN_WSND = (() => {
  const vol = (x, z) => { const d = Math.sqrt(wpnDist2Cam(x, z)); return { v: clamp(1 - d / 230, 0.03, 1), far: d > 45 }; };
  return {
    shot(type, x, z, mine) {
      if (!AUD.ready) return;
      const q = mine ? { v: 1, far: false } : vol(x, z), v = q.v, lp = q.far ? 0.55 : 1;
      if (type === 'shotgun') {
        AUD.noise(0.42, 0.75 * v, 1300 * lp, 0.7); AUD.noise(0.05, 0.4 * v, 4200 * lp, 0.7, 'highpass'); AUD.tone(85, 0.3, 'sine', 0.55 * v, 32);
        AUD.noise(0.9, 0.08 * v, 520, 0.5, 'lowpass', 0.06);
        if (mine) { AUD.noise(0.05, 0.12, 1700, 2, 'bandpass', 0.38); AUD.tone(330, 0.04, 'square', 0.035, null, 0.39); AUD.noise(0.06, 0.13, 1300, 2, 'bandpass', 0.55); AUD.tone(250, 0.05, 'square', 0.035, null, 0.56); }
      } else if (type === 'rifle') {
        AUD.noise(0.2, 0.55 * v, 2600 * lp, 0.7); AUD.noise(0.03, 0.42 * v, 7000 * lp, 0.8, 'highpass'); AUD.tone(120, 0.16, 'sine', 0.42 * v, 45);
        AUD.noise(0.6, 0.07 * v, 600, 0.5, 'lowpass', 0.05);
      } else if (type === 'smg') {
        AUD.noise(0.09, 0.42 * v, 3000 * lp, 0.7); AUD.noise(0.02, 0.26 * v, 6200 * lp, 0.8, 'highpass'); AUD.tone(210, 0.06, 'triangle', 0.22 * v, 90);
      } else {
        AUD.noise(0.16, 0.5 * v, 2200 * lp, 0.7); AUD.noise(0.03, 0.36 * v, 5200 * lp, 0.8, 'highpass'); AUD.tone(150, 0.12, 'sine', 0.35 * v, 55);
        AUD.noise(0.5, 0.06 * v, 700, 0.5, 'lowpass', 0.04);
      }
    },
    impact(kind, x, z) {
      if (!AUD.ready) return;
      const v = vol(x, z).v;
      if (kind === 'car') { AUD.tone(rr(1800, 2600), 0.08, 'triangle', 0.06 * v); AUD.noise(0.05, 0.08 * v, 3000, 2, 'bandpass'); }
      else if (kind === 'ped' || kind === 'player') AUD.noise(0.06, 0.12 * v, 500, 1);
      else if (kind === 'wall') { AUD.noise(0.05, 0.1 * v, 2400, 1.5, 'bandpass'); if (Math.random() < 0.25) AUD.tone(rr(2400, 3400), 0.16, 'sine', 0.03 * v, rr(900, 1400)); }
      else AUD.noise(0.06, 0.08 * v, 900, 1);
    },
    click() { AUD.tone(1400, 0.03, 'square', 0.05); AUD.noise(0.02, 0.06, 4000, 2, 'bandpass'); },
    magOut() { AUD.noise(0.05, 0.1, 1600, 3, 'bandpass'); AUD.tone(520, 0.04, 'square', 0.03); },
    magIn() { AUD.noise(0.04, 0.14, 2200, 3, 'bandpass'); AUD.tone(780, 0.03, 'square', 0.04); },
    rack() { AUD.noise(0.05, 0.12, 2600, 2, 'bandpass'); AUD.tone(980, 0.03, 'square', 0.035); AUD.noise(0.05, 0.12, 1900, 2, 'bandpass', 0.09); AUD.tone(700, 0.03, 'square', 0.035, null, 0.09); },
    shell() { AUD.noise(0.04, 0.1, 1400, 3, 'bandpass'); AUD.tone(420, 0.03, 'square', 0.025, null, 0.02); },
    draw() { AUD.noise(0.08, 0.06, 2500, 1.5, 'bandpass'); AUD.tone(600, 0.04, 'square', 0.025, null, 0.05); },
    swing() { AUD.noise(0.18, 0.09, 1600, 1.4, 'bandpass'); },
    batHit(metal) { AUD.tone(metal ? 900 : 130, metal ? 0.18 : 0.12, metal ? 'triangle' : 'sine', metal ? 0.1 : 0.35, metal ? 600 : 55); AUD.noise(0.08, 0.18, metal ? 2500 : 900, 1); },
    tink(v) { if (AUD.ready) AUD.tone(rr(3200, 4200), 0.06, 'sine', 0.02 * (v || 1)); },
    bounce(x, z) { if (!AUD.ready) return; const v = vol(x, z).v; AUD.tone(rr(260, 340), 0.06, 'triangle', 0.12 * v, 180); },
    pin() { AUD.tone(2600, 0.05, 'sine', 0.05); AUD.tone(1900, 0.08, 'triangle', 0.04, null, 0.05); },
    pickup() { AUD.tone(700, 0.06, 'square', 0.04); AUD.tone(1050, 0.08, 'square', 0.04, null, 0.06); AUD.noise(0.05, 0.08, 2000, 2, 'bandpass', 0.02); },
    buy() { AUD.tone(523, 0.08, 'square', 0.05); AUD.tone(784, 0.12, 'square', 0.05, null, 0.08); AUD.noise(0.06, 0.1, 2400, 2, 'bandpass', 0.16); },
  };
})();

EXT.boot.push(() => { wpnInitWeaponAssets(); wpnInitWeaponFx(); });
EXT.update.push((dt) => wpnUpdateGrenades(dt));
EXT.visual.push((dt) => { if (GAME.state === 'play') wpnUpdateWeaponFx(dt); });
