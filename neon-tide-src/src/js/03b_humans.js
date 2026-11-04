// ============================================================
//  People: procedural skinned characters (one mesh, 18 bones)
//  with layered procedural animation
// ============================================================
const HB = { root: 0, hips: 1, spine: 2, chest: 3, neck: 4, head: 5, uaL: 6, faL: 7, haL: 8, uaR: 9, faR: 10, haR: 11, thL: 12, shL: 13, ftL: 14, thR: 15, shR: 16, ftR: 17 };
const HB_N = 18, HCH = HB_N * 3 + 3;
let humanMat = null;
const ATL = {};
const HT = {};
const SKIN = ['#f3cfb3', '#e8b48f', '#c98d66', '#a8714d', '#7f4f33', '#5c3824', '#f6dcc6'];
const SHIRTS = ['#ff3f8e', '#3fe5ef', '#ffd23f', '#f4f1ea', '#2d2d34', '#7a5cff', '#ff8a3d', '#59c36a', '#e63946', '#457b9d', '#ffffff', '#a8dadc', '#f4a261', '#264653'];
const PANTS = ['#2b2d42', '#3d405b', '#22223b', '#6b705c', '#c9ada7', '#1d3557', '#d8cbb0', '#8d99ae', '#3a5a40'];
const HAIR = ['#1a1110', '#3b2219', '#6b4423', '#d6b370', '#0d0d0d', '#9a3b1b', '#cfc6b8', '#4a2c1a'];

function makeHumanAtlas() {
  const S = 512, c = mkCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
  const R = (name, x, y, w, h) => { ATL[name] = [(x + 3) / S, 1 - (y + h - 3) / S, (x + w - 3) / S, 1 - (y + 3) / S]; };
  const clip = (x, y, w, h, fn) => { g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); fn(); g.restore(); };
  R('plain', 0, 0, 128, 128);
  clip(128, 0, 128, 128, () => {
    g.fillStyle = '#f3f3f3'; g.fillRect(128, 0, 128, 128);
    g.fillStyle = 'rgba(0,0,0,0.05)'; for (let i = 0; i < 128; i += 3) { g.fillRect(128, i, 128, 1); g.fillRect(128 + i, 0, 1, 128); }
  });
  R('fabric', 128, 0, 128, 128);
  clip(256, 0, 128, 128, () => { g.fillStyle = '#9d9d9d'; for (let y = 2; y < 128; y += 13) g.fillRect(256, y, 128, 5); });
  R('stripes', 256, 0, 128, 128);
  clip(384, 0, 128, 128, () => {
    g.fillStyle = '#e2e2e2'; g.fillRect(384, 0, 128, 128);
    g.strokeStyle = 'rgba(0,0,0,0.09)'; g.lineWidth = 1;
    for (let i = -128; i < 128; i += 3) { g.beginPath(); g.moveTo(384 + i, 0); g.lineTo(384 + i + 128, 128); g.stroke(); }
    for (let i = 0; i < 500; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.06)'; g.fillRect(384 + Math.random() * 128, Math.random() * 128, 2, 1); }
  });
  R('denim', 384, 0, 128, 128);
  clip(0, 128, 256, 128, () => {
    g.fillStyle = '#ff6a5c'; g.fillRect(0, 128, 256, 128);
    for (let i = 0; i < 26; i++) { g.fillStyle = Math.random() < 0.5 ? '#1f7a52' : '#2c9a63'; g.beginPath(); g.ellipse(Math.random() * 256, 128 + Math.random() * 128, rr(10, 20), rr(4, 7), Math.random() * TAU, 0, TAU); g.fill(); }
    for (let i = 0; i < 16; i++) {
      const x = Math.random() * 256, y = 128 + Math.random() * 128, r = rr(7, 12), a0 = Math.random() * TAU;
      g.fillStyle = Math.random() < 0.5 ? '#fff4e0' : '#ffd23f';
      for (let p = 0; p < 5; p++) { const a = a0 + p * TAU / 5; g.beginPath(); g.ellipse(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7, r * 0.62, r * 0.4, a, 0, TAU); g.fill(); }
      g.fillStyle = '#b81d4a'; g.beginPath(); g.arc(x, y, r * 0.28, 0, TAU); g.fill();
    }
  });
  R('floral', 0, 128, 256, 128);
  // face: brows, eyelid shading, nose shadow, lips, cheeks (multiplied by skin tone)
  clip(256, 128, 128, 128, () => {
    const cx = 320, eyeY = 190, browY = 178, mouthY = 229, noseY = 208;
    g.fillStyle = 'rgba(200,120,110,0.18)'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * 10, 216, 5, 3.5, 0, 0, TAU); g.fill(); }
    g.fillStyle = 'rgba(90,60,50,0.22)'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * 6.4, eyeY - 1, 4.2, 2.6, 0, 0, TAU); g.fill(); }
    g.strokeStyle = 'rgba(45,30,25,0.85)'; g.lineWidth = 1.8; g.lineCap = 'round';
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * 3.2, browY + 0.6); g.quadraticCurveTo(cx + s * 6.5, browY - 1.6, cx + s * 10.2, browY + 0.4); g.stroke(); }
    g.fillStyle = 'rgba(120,80,70,0.25)'; g.beginPath(); g.ellipse(cx, noseY + 2, 2.6, 1.3, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(175,85,85,0.75)'; g.beginPath(); g.ellipse(cx, mouthY, 4.4, 1.5, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(90,40,40,0.7)'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(cx - 4.4, mouthY); g.quadraticCurveTo(cx, mouthY + 0.9, cx + 4.4, mouthY); g.stroke();
  });
  R('face', 256, 128, 128, 128);
  clip(384, 128, 128, 128, () => {
    g.fillStyle = '#d8d8d8'; g.fillRect(384, 128, 128, 128);
    for (let i = 0; i < 260; i++) { const v = (Math.random() * 90 + 150) | 0; g.strokeStyle = `rgba(${v},${v},${v},0.8)`; g.lineWidth = rr(0.6, 1.6); const x = 384 + Math.random() * 128; g.beginPath(); g.moveTo(x, 128); g.lineTo(x + rr(-6, 6), 256); g.stroke(); }
  });
  R('hair', 384, 128, 128, 128);
  clip(0, 256, 128, 128, () => {
    g.fillStyle = 'rgba(0,0,0,0.13)';
    for (let i = 0; i < 128; i += 22) { g.fillRect(0, 256 + i, 128, 7); g.fillRect(i, 256, 7, 128); }
    g.fillStyle = 'rgba(0,0,0,0.07)'; for (let i = 11; i < 128; i += 22) { g.fillRect(0, 256 + i, 128, 2); g.fillRect(i, 256, 2, 128); }
  });
  R('plaid', 0, 256, 128, 128);
  clip(128, 256, 128, 128, () => { for (let i = 0; i < 400; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(255,225,210,0.35)' : 'rgba(190,140,120,0.06)'; g.beginPath(); g.arc(128 + Math.random() * 128, 256 + Math.random() * 128, rr(1, 4), 0, TAU); g.fill(); } });
  R('skin', 128, 256, 128, 128);
  const t = toTex(c, { wrap: false, aniso: 4 });
  t.generateMipmaps = true;
  return t;
}
function initHumanAssets() {
  humanMat = new THREE.MeshStandardMaterial({ map: makeHumanAtlas(), vertexColors: true, roughness: 0.72, metalness: 0, side: THREE.DoubleSide });
  HT.sph = new THREE.SphereGeometry(1, 12, 9);
  HT.hemi = new THREE.SphereGeometry(1, 18, 9, 0, TAU, 0, Math.PI * 0.52);
  HT.box = new THREE.BoxGeometry(1, 1, 1);
  HT.shoe = new THREE.CapsuleGeometry(0.046, 0.15, 4, 10);
  HT.longHair = new THREE.CylinderGeometry(0.106, 0.128, 0.3, 14, 2, true, Math.PI / 2, Math.PI);
  HT.pony = new THREE.CapsuleGeometry(0.028, 0.12, 3, 8);
}

// ---------- geometry builder ----------
class HGeo {
  constructor() { this.p = []; this.u = []; this.c = []; this.si = []; this.sw = []; this.ix = []; this.n = 0; this.seams = []; }
  v(x, y, z, uu, vv, col, w) {
    this.p.push(x, y, z); this.u.push(uu, vv); this.c.push(col.r, col.g, col.b);
    if (w.length > 2) { this.si.push(w[0], w[2], 0, 0); this.sw.push(w[1], w[3], 0, 0); } else { this.si.push(w[0], 0, 0, 0); this.sw.push(1, 0, 0, 0); }
    return this.n++;
  }
  loft(rings, seg, capA, capB) {
    const base = this.n, nr = rings.length;
    for (let i = 0; i < nr; i++) {
      const R = rings[i], reg = ATL[R.reg] || ATL.plain;
      for (let k = 0; k <= seg; k++) {
        const u = k / seg, th = (u - 0.5) * TAU;
        this.v(R.x + Math.sin(th) * R.rx, R.y, R.z + Math.cos(th) * R.rz, lerp(reg[0], reg[2], u), lerp(reg[1], reg[3], R.v), R.c, R.w);
      }
      this.seams.push([base + i * (seg + 1), base + i * (seg + 1) + seg]);
    }
    const down = rings[nr - 1].y < rings[0].y;
    for (let i = 0; i < nr - 1; i++) for (let k = 0; k < seg; k++) {
      const a = base + i * (seg + 1) + k, b = a + seg + 1;
      if (down) this.ix.push(a, b, a + 1, a + 1, b, b + 1); else this.ix.push(a, a + 1, b, a + 1, b + 1, b);
    }
    const cap = (i, dy) => {
      const R = rings[i], reg = ATL[R.reg] || ATL.plain;
      const c = this.v(R.x, R.y + dy, R.z, (reg[0] + reg[2]) / 2, lerp(reg[1], reg[3], R.v), R.c, R.w);
      for (let k = 0; k < seg; k++) { const a = base + i * (seg + 1) + k; if (dy > 0) this.ix.push(a, a + 1, c); else this.ix.push(a + 1, a, c); }
    };
    if (capA) cap(0, capA);
    if (capB) cap(nr - 1, capB);
  }
  add(geo, m, col, w, regName) {
    const reg = ATL[regName] || ATL.plain, pos = geo.attributes.position, uv = geo.attributes.uv, base = this.n;
    const v = new V3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      this.v(v.x, v.y, v.z, lerp(reg[0], reg[2], uv ? uv.getX(i) : 0.5), lerp(reg[1], reg[3], uv ? uv.getY(i) : 0.5), col, w);
    }
    if (geo.index) { const ia = geo.index.array; for (let i = 0; i < ia.length; i++) this.ix.push(base + ia[i]); }
    else for (let i = 0; i < pos.count; i++) this.ix.push(base + i);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.ix);
    g.computeVertexNormals();
    const nr = g.attributes.normal;
    for (const [a, b] of this.seams) {
      const x = nr.getX(a) + nr.getX(b), y = nr.getY(a) + nr.getY(b), z = nr.getZ(a) + nr.getZ(b), l = Math.hypot(x, y, z) || 1;
      nr.setXYZ(a, x / l, y / l, z / l); nr.setXYZ(b, x / l, y / l, z / l);
    }
    g.boundingSphere = new THREE.Sphere(new V3(0, 0.9, 0), 1.45);
    return g;
  }
}
const _hm = new THREE.Matrix4(), _hq = new THREE.Quaternion(), _he = new THREE.Euler(), _hp = new V3(), _hs = new V3();
function hmx(x, y, z, sx, sy, sz, rx, ry, rz) { _he.set(rx || 0, ry || 0, rz || 0); _hq.setFromEuler(_he); _hp.set(x, y, z); _hs.set(sx, sy, sz); return _hm.compose(_hp, _hq, _hs); }
const wb = (a, b, t) => (t <= 0.001 ? [a] : t >= 0.999 ? [b] : [a, 1 - t, b, t]);
// Profile table rows: [y, rx, rz, x, z]. cuts = y values where the clothing changes.
function bandLoft(H, table, cuts, styleAt, weightAt, seg, capA, capB) {
  const desc = table[table.length - 1][0] < table[0][0];
  const yA = table[0][0], yB = table[table.length - 1][0], lo = Math.min(yA, yB), span = Math.abs(yB - yA);
  let ys = table.map((r) => r[0]);
  cuts.forEach((c) => { if ((c - yA) * (c - yB) < 0 && !ys.some((y) => Math.abs(y - c) < 1e-6)) ys.push(c); });
  ys.sort((a, b) => (desc ? b - a : a - b));
  const row = (y) => {
    for (let i = 0; i < table.length - 1; i++) {
      const a = table[i], b = table[i + 1];
      if ((y - a[0]) * (y - b[0]) <= 0) { const t = (y - a[0]) / ((b[0] - a[0]) || 1); return [y, lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t), lerp(a[4], b[4], t)]; }
    }
    return table[table.length - 1];
  };
  const rings = [];
  for (const y of ys) {
    const r = row(y), base = { y, rx: r[1], rz: r[2], x: r[3], z: r[4], v: (y - lo) / span, w: weightAt(y) };
    if (cuts.some((c) => Math.abs(c - y) < 1e-6)) {
      const s1 = styleAt(desc ? y + 1e-4 : y - 1e-4), s2 = styleAt(desc ? y - 1e-4 : y + 1e-4);
      rings.push(Object.assign({}, base, { c: s1.c, reg: s1.reg }), Object.assign({}, base, { c: s2.c, reg: s2.reg }));
    } else { const s = styleAt(y); rings.push(Object.assign({}, base, { c: s.c, reg: s.reg })); }
  }
  H.loft(rings, seg, capA, capB);
}

// ---------- looks ----------
function randomLook() {
  const F = Math.random() < 0.5;
  return {
    gender: F ? 'f' : 'm', skin: rpick(SKIN),
    shirt: rpick(SHIRTS), shirtPat: rpick(['fabric', 'fabric', 'plain', 'stripes', 'plaid', 'floral']),
    sleeves: rpick(F ? ['short', 'short', 'tank', 'long'] : ['short', 'short', 'long', 'tank']),
    pants: rpick(PANTS), pantsPat: rpick(['denim', 'denim', 'fabric']), shorts: Math.random() < (F ? 0.4 : 0.3),
    shoes: rpick(['#151515', '#f4f4f4', '#7a4b2a', '#2a2a40', '#c0392b']), sole: rpick(['#f0f0f0', '#222222']),
    hair: rpick(HAIR), hairStyle: F ? rpick(['long', 'long', 'pony', 'bun', 'short', 'curly']) : rpick(['short', 'short', 'buzz', 'bald', 'curly']),
    hat: Math.random() < 0.15 ? rpick(['#d7263d', '#1d3557', '#111111', '#f4f1ea', '#2a9d8f']) : null,
    glasses: Math.random() < 0.18, phone: Math.random() < 0.14, belt: Math.random() < 0.6,
    height: F ? rr(0.9, 0.98) : rr(0.95, 1.05), girth: rr(0.9, 1.18),
  };
}
const HERO_LOOK = { gender: 'm', skin: '#b97a55', shirt: '#ffffff', shirtPat: 'floral', sleeves: 'short', pants: '#efe9dc', pantsPat: 'fabric', shorts: false,
  shoes: '#f4f4f4', sole: '#d9d9d9', hair: '#15100d', hairStyle: 'short', hat: null, glasses: true, phone: false, belt: true, height: 1.0, girth: 1.02, hero: true };
const COP_LOOK = { gender: 'm', skin: '#8a5a3c', shirt: '#1f3c8f', shirtPat: 'fabric', sleeves: 'short', pants: '#14213d', pantsPat: 'fabric', shorts: false,
  shoes: '#111111', sole: '#111111', hair: '#1a1110', hairStyle: 'buzz', hat: '#14213d', glasses: false, phone: false, belt: true, height: 1.02, girth: 1.1 };

// ---------- character construction ----------
function buildHuman(look) {
  const F = look.gender === 'f', G = look.girth || 1, LG = 0.55 + 0.45 * G, seg = look.hero ? 18 : 14;
  const P = F ? { sh: 0.166, shY: 1.4, hw: 0.097, arm: 0.86 } : { sh: 0.19, shY: 1.42, hw: 0.092, arm: 1 };
  const H = new HGeo();
  const C = (hex) => new THREE.Color(hex);
  const skin = C(look.skin), shirt = C(look.shirt), pants = C(look.pants), shoes = C(look.shoes), sole = C(look.sole || '#e8e8e8'), hair = C(look.hair);
  const belt = C('#2b1e17'), dark = C('#111114'), eyes = C('#1a120d');
  const sReg = look.shirtPat || 'fabric', pReg = look.pantsPat || 'denim';
  const ST = { skin: { c: skin, reg: 'skin' }, shirt: { c: shirt, reg: sReg }, pants: { c: pants, reg: pReg }, belt: { c: belt, reg: 'fabric' } };
  // torso
  const TOR = F ? [
    [0.835, 0.075, 0.06, 0, 0], [0.86, 0.145, 0.1, 0, 0], [0.9, 0.178, 0.12, 0, -0.005], [0.96, 0.18, 0.125, 0, -0.005], [1.02, 0.152, 0.108, 0, 0.004],
    [1.1, 0.127, 0.093, 0, 0.006], [1.17, 0.137, 0.1, 0, 0.01], [1.24, 0.152, 0.128, 0, 0.03], [1.3, 0.156, 0.12, 0, 0.022], [1.36, 0.158, 0.1, 0, 0.006],
    [1.41, 0.132, 0.08, 0, -0.004], [1.445, 0.066, 0.056, 0, -0.01]]
    : [[0.835, 0.07, 0.06, 0, 0], [0.86, 0.135, 0.1, 0, 0], [0.9, 0.163, 0.114, 0, 0], [0.96, 0.17, 0.12, 0, 0], [1.02, 0.158, 0.112, 0, 0.004],
      [1.1, 0.148, 0.105, 0, 0.008], [1.18, 0.156, 0.11, 0, 0.012], [1.27, 0.173, 0.118, 0, 0.016], [1.35, 0.183, 0.115, 0, 0.012],
      [1.41, 0.178, 0.104, 0, 0.004], [1.45, 0.14, 0.085, 0, -0.005], [1.48, 0.07, 0.06, 0, -0.01]];
  TOR.forEach((r) => { r[1] *= G; r[2] *= lerp(1, G, 0.8); if (r[0] < 1.2) r[4] += (G - 1) * 0.04; });
  const torsoW = (y) => (y < 0.98 ? [HB.hips] : y < 1.12 ? wb(HB.hips, HB.spine, (y - 0.98) / 0.14) : y < 1.25 ? wb(HB.spine, HB.chest, (y - 1.12) / 0.13) : y > 1.44 ? wb(HB.chest, HB.neck, 0.4) : [HB.chest]);
  const bY0 = 1.0, bY1 = look.belt ? 1.035 : 1.0;
  bandLoft(H, TOR, look.belt ? [bY0, bY1] : [bY0], (y) => (y < bY0 ? ST.pants : y < bY1 ? ST.belt : ST.shirt), torsoW, seg, -0.02, 0.012);
  // neck
  bandLoft(H, [[1.42, 0.056 * LG, 0.052 * LG, 0, -0.008], [1.5, 0.05 * LG, 0.047 * LG, 0, -0.008], [1.58, 0.046, 0.044, 0, 0.0]], [], () => ST.skin,
    (y) => (y < 1.47 ? wb(HB.chest, HB.neck, (y - 1.42) / 0.05) : y < 1.55 ? [HB.neck] : wb(HB.neck, HB.head, 0.6)), 10, 0, 0);
  // head
  const HEAD = [[1.548, 0.02, 0.02, 0, 0.03], [1.56, 0.045, 0.04, 0, 0.035], [1.585, 0.07, 0.074, 0, 0.022], [1.62, 0.087, 0.098, 0, 0.007], [1.66, 0.094, 0.106, 0, 0],
    [1.70, 0.096, 0.108, 0, -0.004], [1.74, 0.089, 0.101, 0, -0.009], [1.77, 0.072, 0.084, 0, -0.012], [1.795, 0.042, 0.052, 0, -0.014]];
  if (F) HEAD.forEach((r) => { if (r[0] < 1.63) { r[1] *= 0.94; r[2] *= 0.97; } });
  bandLoft(H, HEAD, [], () => ({ c: skin, reg: 'face' }), () => [HB.head], look.hero ? 20 : 16, -0.004, 0.012);
  const hd = [HB.head];
  for (const s of [-1, 1]) {
    H.add(HT.sph, hmx(s * 0.033, 1.676, 0.099, 0.0105, 0.0085, 0.0058), eyes, hd);
    H.add(HT.sph, hmx(s * 0.093, 1.665, -0.006, 0.0095, 0.027, 0.018), skin, hd, 'skin');
  }
  H.add(HT.sph, hmx(0, 1.646, 0.103, 0.0145, 0.022, 0.018, -0.25), skin, hd, 'skin');
  // hair & headwear
  const hs = look.hairStyle;
  if (hs !== 'bald') {
    const big = hs === 'curly' ? 1.14 : hs === 'buzz' ? 0.985 : 1.0;
    const hcol = hs === 'buzz' ? hair.clone().lerp(skin, 0.35) : hair;
    H.add(HT.hemi, hmx(0, 1.686, -0.007, 0.104 * big, 0.126 * big, 0.12 * big, -0.24), hcol, hd, 'hair');
    if (hs === 'curly') H.add(HT.sph, hmx(0, 1.74, -0.03, 0.105, 0.085, 0.11), hcol, hd, 'hair');
    if (hs === 'long') H.add(HT.longHair, hmx(0, 1.57, -0.012, 1, 1, 1), hcol, hd, 'hair');
    if (hs === 'pony') { H.add(HT.pony, hmx(0, 1.62, -0.125, 1, 1, 1, 0.4), hcol, hd, 'hair'); H.add(HT.sph, hmx(0, 1.69, -0.112, 0.026, 0.026, 0.026), hcol, hd, 'hair'); }
    if (hs === 'bun') H.add(HT.sph, hmx(0, 1.785, -0.07, 0.048, 0.044, 0.048), hcol, hd, 'hair');
  }
  if (look.hat) {
    const hc = C(look.hat);
    H.add(HT.hemi, hmx(0, 1.7, -0.006, 0.113, 0.122, 0.125, -0.12), hc, hd, 'fabric');
    H.add(HT.box, hmx(0, 1.716, 0.125, 0.15, 0.012, 0.09, 0.16), hc, hd, 'fabric');
  }
  if (look.glasses) {
    H.add(HT.box, hmx(0, 1.678, 0.104, 0.104, 0.027, 0.014), dark, hd);
    for (const s of [-1, 1]) H.add(HT.box, hmx(s * 0.088, 1.682, 0.055, 0.006, 0.007, 0.1), dark, hd);
  }
  // arms
  for (const s of [-1, 1]) {
    const x = s * P.sh, y = P.shY, k = P.arm * LG;
    const ua = s > 0 ? HB.uaL : HB.uaR, fa = s > 0 ? HB.faL : HB.faR, ha = s > 0 ? HB.haL : HB.haR;
    const ARM = [[y + 0.045, 0.045 * k, 0.045 * k, x, 0], [y + 0.015, 0.062 * k, 0.058 * k, x, 0], [y - 0.06, 0.056 * k, 0.055 * k, x, 0], [y - 0.17, 0.048 * k, 0.047 * k, x, 0],
      [y - 0.27, 0.041 * k, 0.04 * k, x, 0], [y - 0.3, 0.04 * k, 0.039 * k, x, 0.003], [y - 0.36, 0.044 * k, 0.041 * k, x, 0.004], [y - 0.47, 0.036 * k, 0.032 * k, x, 0.004], [y - 0.545, 0.028 * k, 0.024 * k, x, 0.004]];
    const cut = look.sleeves === 'long' ? y - 0.52 : look.sleeves === 'short' ? y - 0.15 : null;
    bandLoft(H, ARM, cut === null ? [] : [cut], (yy) => (cut !== null && yy > cut ? ST.shirt : ST.skin),
      (yy) => (yy > y - 0.24 ? [ua] : yy > y - 0.33 ? wb(ua, fa, (y - 0.24 - yy) / 0.09) : yy < y - 0.53 ? wb(fa, ha, 0.3) : [fa]), 10, 0.01, -0.006);
    H.add(HT.sph, hmx(x + s * 0.002, y - 0.6, 0.008, 0.023 * P.arm, 0.058, 0.043 * P.arm), skin, [ha], 'skin');
    H.add(HT.sph, hmx(x - s * 0.016, y - 0.585, 0.035, 0.013, 0.03, 0.013, 0.3), skin, [ha], 'skin');
    if (look.phone && s < 0) H.add(HT.box, hmx(x - s * 0.026, y - 0.6, 0.02, 0.012, 0.11, 0.055), dark, [ha]);
  }
  // legs and shoes
  for (const s of [-1, 1]) {
    const x = s * P.hw, k = LG * (F ? 0.95 : 1);
    const th = s > 0 ? HB.thL : HB.thR, sh = s > 0 ? HB.shL : HB.shR, ft = s > 0 ? HB.ftL : HB.ftR;
    const LEG = [[0.95, 0.07 * k, 0.07 * k, x, 0], [0.92, 0.088 * k, 0.09 * k, x, 0], [0.84, 0.084 * k, 0.086 * k, x, 0.002], [0.7, 0.073 * k, 0.075 * k, x, 0.004],
      [0.56, 0.058 * k, 0.06 * k, x, 0.006], [0.48, 0.054 * k, 0.056 * k, x, 0.008], [0.42, 0.057 * k, 0.06 * k, x, 0], [0.32, 0.058 * k, 0.062 * k, x, -0.006],
      [0.2, 0.045 * k, 0.047 * k, x, -0.002], [0.1, 0.036 * k, 0.037 * k, x, 0], [0.07, 0.034 * k, 0.035 * k, x, 0]];
    const cut = look.shorts ? 0.62 : 0.1;
    bandLoft(H, LEG, [cut], (yy) => (yy > cut ? ST.pants : ST.skin),
      (yy) => (yy > 0.56 ? [th] : yy > 0.44 ? wb(th, sh, (0.56 - yy) / 0.12) : yy < 0.1 ? wb(sh, ft, 0.5) : [sh]), 12, 0.01, -0.01);
    H.add(HT.shoe, hmx(x, 0.045, 0.045, 1.05, 0.72, 1, Math.PI / 2), shoes, [ft], 'fabric');
    H.add(HT.box, hmx(x, 0.009, 0.046, 0.094, 0.018, 0.245), sole, [ft]);
  }
  const geo = H.build();
  // skeleton
  const bones = []; for (let i = 0; i < HB_N; i++) bones.push(new THREE.Bone());
  const set = (i, p, x, y, z) => { bones[i].position.set(x, y, z); if (p >= 0) bones[p].add(bones[i]); };
  set(HB.root, -1, 0, 0, 0); set(HB.hips, HB.root, 0, 0.95, 0); set(HB.spine, HB.hips, 0, 0.11, 0); set(HB.chest, HB.spine, 0, 0.18, 0);
  set(HB.neck, HB.chest, 0, 0.23, 0); set(HB.head, HB.neck, 0, 0.09, 0);
  set(HB.uaL, HB.chest, P.sh, P.shY - 1.24, 0); set(HB.faL, HB.uaL, 0, -0.29, 0); set(HB.haL, HB.faL, 0, -0.26, 0);
  set(HB.uaR, HB.chest, -P.sh, P.shY - 1.24, 0); set(HB.faR, HB.uaR, 0, -0.29, 0); set(HB.haR, HB.faR, 0, -0.26, 0);
  set(HB.thL, HB.hips, P.hw, -0.03, 0); set(HB.shL, HB.thL, 0, -0.44, 0); set(HB.ftL, HB.shL, 0, -0.42, 0);
  set(HB.thR, HB.hips, -P.hw, -0.03, 0); set(HB.shR, HB.thR, 0, -0.44, 0); set(HB.ftR, HB.shR, 0, -0.42, 0);
  const mesh = new THREE.SkinnedMesh(geo, humanMat);
  mesh.add(bones[0]);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = true; mesh.receiveShadow = false;
  const root = new THREE.Group();
  const holder = new THREE.Group(); holder.scale.setScalar(look.height || 1);
  holder.add(mesh); root.add(holder);
  return {
    root, mesh, bones, female: F, seed: Math.random(), phase: Math.random() * TAU, cur: new Float32Array(HCH), init: false,
    lookT: rr(0.5, 3), lookYaw: 0, lookPitch: 0, lookSm: 0, airW: 0, landT: 0, wasAir: false,
    dispose() { geo.dispose(); mesh.skeleton.dispose(); },
  };
}

// ---------- animation ----------
const _HT = new Float32Array(HCH);
const gauss = (x, c, w) => { const d = (x - c) / w; return Math.exp(-d * d); };
function legCycle(p, runK) {
  p = ((p % TAU) + TAU) % TAU;
  const PI = Math.PI;
  const wTh = -0.42 * Math.cos(p) - 0.03;
  const wKn = p < PI ? 0.16 * Math.sin(p) : 1.08 * Math.sin(PI * Math.pow((p - PI) / PI, 0.75));
  const wPush = 0.42 * gauss(p, 0.82 * PI, 0.35);
  const rTh = -0.8 * Math.cos(p - 0.3) + 0.06;
  const rKn = p < 0.8 * PI ? 0.42 * Math.sin(p / 0.8) : 1.95 * Math.sin(PI * Math.pow((p - 0.8 * PI) / (1.2 * PI), 0.7));
  const rPush = 0.55 * gauss(p, 0.62 * PI, 0.3);
  const th = lerp(wTh, rTh, runK), kn = lerp(wKn, rKn, runK);
  const comp = 0.35 + 0.5 * sstep(-0.3, 0.3, Math.sin(p));
  return [th, kn, -(th + kn) * comp + lerp(wPush, rPush, runK) - 0.04];
}
// a: { speed, t, mode ('normal'|'down'|'getup'), getT, air, vy, punch, punchSide, hands, phone, turn, flinch }
function animHuman(H, a, dt) {
  const T = _HT; T.fill(0);
  const S = (b, x, y, z) => { T[b * 3] += x; T[b * 3 + 1] += y; T[b * 3 + 2] += z; };
  const O = (b, x, y, z, w) => { if (w <= 0) return; T[b * 3] = lerp(T[b * 3], x, w); T[b * 3 + 1] = lerp(T[b * 3 + 1], y, w); T[b * 3 + 2] = lerp(T[b * 3 + 2], z, w); };
  const mode = a.mode || 'normal', t = a.t || 0, F = H.female;
  let hipX = 0, hipY = 0, hipZ = 0, step = false;
  if (mode === 'down') {
    const s = H.seed;
    S(HB.thL, -0.15 + 0.3 * s, 0, 0.16); S(HB.thR, 0.12 - 0.2 * s, 0, -0.2 - 0.1 * s); S(HB.shL, 0.35, 0, 0); S(HB.shR, 0.15 + 0.3 * s, 0, 0);
    S(HB.ftL, 0.45, 0, 0); S(HB.ftR, 0.35, 0, 0);
    S(HB.uaL, 0.2, 0.3, 1.25 + 0.2 * s); S(HB.uaR, -0.3, -0.2, -1.1 + 0.2 * s); S(HB.faL, -0.5 * s, 0, 0); S(HB.faR, -0.3, 0, 0);
    S(HB.neck, 0.1, (s - 0.5) * 0.8, 0); S(HB.head, 0.05, (s - 0.5) * 0.4, 0);
  } else {
    const sp = a.speed || 0;
    const runK = sstep(2.4, 4.8, sp);
    const stride = lerp(1.3, 2.6, runK) + sstep(5.2, 7.6, sp) * 0.7;
    const prev = H.phase;
    H.phase += (sp / stride) * TAU * dt;
    if (H.phase > 1000) H.phase -= 318 * TAU;
    step = sp > 0.8 && Math.floor(prev / Math.PI) !== Math.floor(H.phase / Math.PI);
    const mov = sstep(0.08, 0.9, sp), idle = 1 - mov, ph = H.phase, cp = Math.cos(ph), spn = Math.sin(ph);
    const L = legCycle(ph, runK), R = legCycle(ph + Math.PI, runK);
    S(HB.thL, L[0] * mov, 0, 0); S(HB.shL, L[1] * mov, 0, 0); S(HB.ftL, L[2] * mov, 0, 0);
    S(HB.thR, R[0] * mov, 0, 0); S(HB.shR, R[1] * mov, 0, 0); S(HB.ftR, R[2] * mov, 0, 0);
    hipY += mov * lerp(-0.022 - 0.022 * Math.cos(2 * ph), -0.065 + 0.04 * Math.cos(2 * ph), runK);
    hipX += mov * lerp(F ? 0.03 : 0.022, 0.01, runK) * spn;
    S(HB.hips, 0, -mov * lerp(F ? 0.13 : 0.1, 0.17, runK) * cp, mov * lerp(F ? 0.07 : 0.05, 0.03, runK) * spn);
    S(HB.spine, mov * lerp(0.03, 0.13, runK), mov * 0.05 * cp, -mov * 0.025 * spn);
    S(HB.chest, mov * 0.05 * runK, mov * lerp(0.08, 0.2, runK) * cp, 0);
    const armSw = lerp(0.33, 0.72, runK) * mov, ab = F ? 0.15 : 0.12;
    S(HB.uaL, armSw * cp - 0.06 * runK + idle * 0.05, 0, ab + 0.06 * runK);
    S(HB.uaR, -armSw * cp - 0.06 * runK + idle * 0.05, 0, -ab - 0.06 * runK);
    S(HB.faL, -mov * lerp(0.22 + 0.22 * Math.max(0, -cp), 1.45 + 0.25 * cp, runK) - idle * 0.14, 0, 0);
    S(HB.faR, -mov * lerp(0.22 + 0.22 * Math.max(0, cp), 1.45 - 0.25 * cp, runK) - idle * 0.14, 0, 0);
    S(HB.haL, 0, 0, -0.06); S(HB.haR, 0, 0, 0.06);
    if (idle > 0.01) {
      const ws = Math.sin(t * 0.45 + H.seed * TAU), br = Math.sin(t * 1.7 + H.seed * 3);
      hipX += idle * 0.028 * ws; hipY -= idle * 0.012 * Math.abs(ws);
      S(HB.hips, 0, 0, idle * 0.03 * ws);
      S(HB.thL, 0, 0, -idle * 0.03 * ws); S(HB.thR, 0, 0, -idle * 0.03 * ws);
      const kb = idle * 0.2 * Math.max(0, ws), kb2 = idle * 0.2 * Math.max(0, -ws);
      S(HB.thR, -kb * 0.45, 0, 0); S(HB.shR, kb, 0, 0); S(HB.ftR, -kb * 0.55, 0, 0);
      S(HB.thL, -kb2 * 0.45, 0, 0); S(HB.shL, kb2, 0, 0); S(HB.ftL, -kb2 * 0.55, 0, 0);
      S(HB.chest, idle * 0.02 * br, 0, -idle * 0.02 * ws); S(HB.spine, idle * 0.01, 0, 0);
      S(HB.uaL, idle * 0.015 * br, 0, idle * 0.012 * br); S(HB.uaR, idle * 0.015 * br, 0, -idle * 0.012 * br);
    }
    H.lookT -= dt;
    if (H.lookT <= 0) { H.lookT = rr(2.5, 6); H.lookYaw = Math.random() < 0.45 ? 0 : rr(-0.75, 0.75); H.lookPitch = rr(-0.08, 0.12); }
    H.lookSm = damp(H.lookSm, H.lookYaw * idle * (a.phone ? 0.3 : 1), 3, dt);
    const counter = -(T[HB.hips * 3 + 1] + T[HB.spine * 3 + 1] + T[HB.chest * 3 + 1]) * 0.9;
    S(HB.neck, idle * H.lookPitch * 0.5 - mov * 0.1 * runK, (H.lookSm + counter) * 0.4, 0);
    S(HB.head, idle * H.lookPitch * 0.5 - mov * 0.06 * runK, (H.lookSm + counter) * 0.6, 0);
    const lean = clamp(-(a.turn || 0) * 0.035 * mov, -0.16, 0.16);
    S(HB.spine, 0, 0, lean); S(HB.hips, 0, 0, lean * 0.4);
    if (a.phone) {
      const pw = 1 - runK;
      O(HB.uaR, -0.45, 0.28, -0.5, pw); O(HB.faR, -2.3, 0, 0, pw); O(HB.haR, 0.2, 0, 0.2, pw);
      S(HB.head, 0, 0, -0.1 * pw);
    }
    // jump / fall
    H.airW = damp(H.airW, a.air ? 1 : 0, 12, dt);
    if (H.wasAir && !a.air) H.landT = 0.28;
    H.wasAir = !!a.air;
    if (H.airW > 0.01) {
      const w = H.airW, fall = sstep(0, -4, a.vy || 0);
      O(HB.thL, lerp(-0.85, -0.45, fall), 0, 0.05, w); O(HB.shL, lerp(1.35, 0.5, fall), 0, 0, w); O(HB.ftL, 0.3, 0, 0, w);
      O(HB.thR, lerp(-0.2, -0.3, fall), 0, -0.05, w); O(HB.shR, lerp(0.75, 0.45, fall), 0, 0, w); O(HB.ftR, 0.35, 0, 0, w);
      O(HB.uaL, lerp(-0.7, -0.3, fall), 0, lerp(0.45, 0.95, fall), w); O(HB.uaR, lerp(-0.4, -0.3, fall), 0, -lerp(0.45, 0.95, fall), w);
      O(HB.faL, -0.6, 0, 0, w); O(HB.faR, -0.6, 0, 0, w);
      O(HB.spine, lerp(0.12, -0.02, fall), 0, 0, w);
      hipY = lerp(hipY, 0.02, w);
    }
    if (H.landT > 0) {
      H.landT -= dt;
      const k = Math.sin(clamp(H.landT / 0.28, 0, 1) * Math.PI);
      hipY -= 0.11 * k;
      S(HB.thL, -0.45 * k, 0, 0); S(HB.thR, -0.45 * k, 0, 0); S(HB.shL, 0.8 * k, 0, 0); S(HB.shR, 0.8 * k, 0, 0);
      S(HB.ftL, -0.35 * k, 0, 0); S(HB.ftR, -0.35 * k, 0, 0); S(HB.spine, 0.18 * k, 0, 0);
    }
    // punches (alternating hands)
    if (a.punch > 0) {
      const p = a.punch, sd = a.punchSide || 1;
      const gw = sstep(0, 0.12, p) * (1 - sstep(0.72, 1, p));
      const ext = p < 0.28 ? -0.25 * sstep(0, 0.28, p) : p < 0.46 ? lerp(-0.25, 1, sstep(0.28, 0.46, p)) : 1 - sstep(0.46, 0.95, p);
      const e = Math.max(0, ext);
      const PA = sd > 0 ? HB.uaR : HB.uaL, PF = sd > 0 ? HB.faR : HB.faL, GA = sd > 0 ? HB.uaL : HB.uaR, GF = sd > 0 ? HB.faL : HB.faR;
      O(PA, ext >= 0 ? lerp(-0.55, -1.55, ext) : lerp(-0.55, -0.3, -ext / 0.25), 0, -sd * lerp(0.3, -0.12, e), gw);
      O(PF, lerp(-2.0, -0.08, e), 0, 0, gw);
      O(GA, -0.6, 0, sd * 0.18, gw); O(GF, -2.1, 0, 0, gw);
      S(HB.chest, 0.05 * e * gw, sd * 0.55 * ext * gw, 0); S(HB.spine, 0.08 * e * gw, sd * 0.2 * ext * gw, 0); S(HB.hips, 0, sd * 0.12 * ext * gw, 0);
      S(HB.neck, 0, -sd * 0.35 * ext * gw, 0);
      S(HB.thL, -0.1 * gw, 0, 0); S(HB.thR, -0.1 * gw, 0, 0); S(HB.shL, 0.2 * gw, 0, 0); S(HB.shR, 0.2 * gw, 0, 0);
      hipZ += 0.05 * e * gw; hipY -= 0.03 * gw;
    }
    if (a.hands) { O(HB.uaL, -2.85, 0, 0.3, 1); O(HB.uaR, -2.85, 0, -0.3, 1); O(HB.faL, -0.35, 0, 0, 1); O(HB.faR, -0.35, 0, 0, 1); }
    if (mode === 'getup') {
      const c = 1 - sstep(0.3, 1.0, a.getT || 0);
      O(HB.thL, -1.45, 0, 0.12, c); O(HB.thR, -1.3, 0, -0.12, c); O(HB.shL, 2.3, 0, 0, c); O(HB.shR, 2.1, 0, 0, c);
      O(HB.ftL, -0.75, 0, 0, c); O(HB.ftR, -0.7, 0, 0, c);
      O(HB.spine, 0.55, 0, 0, c); O(HB.uaL, -0.5, 0, 0.3, c); O(HB.uaR, -0.5, 0, -0.3, c); O(HB.faL, -0.9, 0, 0, c); O(HB.faR, -0.9, 0, 0, c);
      hipY -= 0.5 * c;
    }
    if (a.flinch > 0) { const f = a.flinch; S(HB.spine, -0.25 * f, 0, 0); S(HB.neck, -0.2 * f, 0, 0); S(HB.uaL, -0.3 * f, 0, 0.2 * f); S(HB.uaR, -0.3 * f, 0, -0.2 * f); }
  }
  T[HB_N * 3] = hipX; T[HB_N * 3 + 1] = hipY; T[HB_N * 3 + 2] = hipZ;
  const cur = H.cur;
  if (!H.init) { cur.set(T); H.init = true; }
  else { const al = 1 - Math.exp(-(mode === 'down' ? 9 : 20) * dt); for (let i = 0; i < HCH; i++) cur[i] += (T[i] - cur[i]) * al; }
  const bn = H.bones;
  for (let b = 1; b < HB_N; b++) bn[b].rotation.set(cur[b * 3], cur[b * 3 + 1], cur[b * 3 + 2]);
  bn[HB.hips].position.set(cur[HB_N * 3], 0.95 + cur[HB_N * 3 + 1], cur[HB_N * 3 + 2]);
  return step;
}
