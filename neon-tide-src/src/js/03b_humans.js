// ============================================================
//  People: procedural skinned characters (one SkinnedMesh + one shared material, 18 bones)
//  and layered procedural animation with locomotion, strafing and a weapon/IK layer
//  (owner: models & driving)
// ============================================================
const HB = { root: 0, hips: 1, spine: 2, chest: 3, neck: 4, head: 5, uaL: 6, faL: 7, haL: 8, uaR: 9, faR: 10, haR: 11, thL: 12, shL: 13, ftL: 14, thR: 15, shR: 16, ftR: 17 };
const HB_N = 18, HCH = HB_N * 3 + 3;
let humanMat = null;
const ATL = {};
const HT = {};
const SKIN = ['#f3cfb3', '#e8b48f', '#c98d66', '#a8714d', '#7f4f33', '#5c3824', '#f6dcc6', '#d9a27c'];
const SHIRTS = ['#ff3f8e', '#3fe5ef', '#ffd23f', '#f4f1ea', '#2d2d34', '#7a5cff', '#ff8a3d', '#59c36a', '#e63946', '#457b9d', '#ffffff', '#a8dadc', '#f4a261', '#264653', '#ef476f', '#06d6a0'];
const PANTS = ['#2b2d42', '#3d405b', '#22223b', '#6b705c', '#c9ada7', '#1d3557', '#d8cbb0', '#8d99ae', '#3a5a40', '#111114'];
const HAIR = ['#1a1110', '#3b2219', '#6b4423', '#d6b370', '#0d0d0d', '#9a3b1b', '#cfc6b8', '#4a2c1a', '#2a1a12'];
const HUM_OUTER = ['#1c1c22', '#2f3e46', '#6d4c3d', '#8b1e3f', '#1d3557', '#e9c46a', '#3a5a40', '#f2f2f2', '#c1121f'];
const HUM_DRESS = ['#e63946', '#ffd23f', '#3fe5ef', '#7a5cff', '#06d6a0', '#ff8a3d', '#f4f1ea', '#1d3557', '#ef476f'];

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
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(384 + 62, 0, 2, 128);
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
  // face: soft shading only (eyes, brows and lips are geometry); multiplied by the skin tone
  clip(256, 128, 128, 128, () => {
    const cx = 320;
    g.fillStyle = 'rgba(205,120,110,0.16)'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * 10, 214, 5.5, 3.6, 0, 0, TAU); g.fill(); }
    g.fillStyle = 'rgba(90,60,50,0.18)'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * 6.4, 188, 4.4, 2.4, 0, 0, TAU); g.fill(); }
    g.fillStyle = 'rgba(120,80,70,0.22)'; g.beginPath(); g.ellipse(cx, 210, 2.6, 1.3, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(90,60,50,0.12)'; g.beginPath(); g.ellipse(cx, 238, 9, 3, 0, 0, TAU); g.fill();
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
  // knit (beanies, hoodie cuffs)
  clip(256, 256, 128, 128, () => { g.fillStyle = '#efefef'; g.fillRect(256, 256, 128, 128); g.fillStyle = 'rgba(0,0,0,0.12)'; for (let x = 0; x < 128; x += 6) g.fillRect(256 + x, 256, 2, 128); });
  R('knit', 256, 256, 128, 128);
  // polka dots
  clip(384, 256, 128, 128, () => { g.fillStyle = '#ffffff'; g.fillRect(384, 256, 128, 128); g.fillStyle = 'rgba(255,255,255,1)'; g.fillStyle = '#5a5a5a'; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.beginPath(); g.arc(384 + x * 16 + (y % 2) * 8 + 4, 256 + y * 16 + 8, 3.2, 0, TAU); g.fill(); } });
  R('dots', 384, 256, 128, 128);
  // leather (jackets, belts, boots)
  clip(0, 384, 128, 128, () => { g.fillStyle = '#d0d0d0'; g.fillRect(0, 384, 128, 128); for (let i = 0; i < 600; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.08)'; g.fillRect(Math.random() * 128, 384 + Math.random() * 128, rr(1, 3), 1); } });
  R('leather', 0, 384, 128, 128);
  // hoodie front: kangaroo pocket outline and seam
  clip(128, 384, 128, 128, () => {
    g.fillStyle = '#f2f2f2'; g.fillRect(128, 384, 128, 128);
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(128 + 40, 384 + 128); g.lineTo(128 + 46, 384 + 84); g.lineTo(128 + 82, 384 + 84); g.lineTo(128 + 88, 384 + 128); g.stroke();
  });
  R('hoodie', 128, 384, 128, 128);
  // sneaker side
  clip(256, 384, 128, 128, () => { g.fillStyle = '#ffffff'; g.fillRect(256, 384, 128, 128); g.fillStyle = 'rgba(0,0,0,0.28)'; g.beginPath(); g.moveTo(256 + 30, 384 + 100); g.lineTo(256 + 90, 384 + 40); g.lineTo(256 + 100, 384 + 50); g.lineTo(256 + 44, 384 + 106); g.fill(); g.fillStyle = 'rgba(0,0,0,0.15)'; for (let i = 0; i < 5; i++) g.fillRect(256 + 50 + i * 10, 384 + 14, 4, 18); });
  R('sneaker', 256, 384, 128, 128);
  // police shirt: pocket flaps and a placket line
  clip(384, 384, 128, 128, () => { g.fillStyle = '#f0f0f0'; g.fillRect(384, 384, 128, 128); g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(384 + 63, 384, 2, 128); for (const x of [384 + 26, 384 + 78]) { g.fillRect(x, 384 + 40, 24, 3); g.fillRect(x, 384 + 40, 2, 22); g.fillRect(x + 22, 384 + 40, 2, 22); } });
  R('uniform', 384, 384, 128, 128);
  const t = toTex(c, { wrap: false, aniso: 4 });
  t.generateMipmaps = true;
  return t;
}
function initHumanAssets() {
  humanMat = new THREE.MeshStandardMaterial({ map: makeHumanAtlas(), vertexColors: true, roughness: 0.72, metalness: 0, side: THREE.DoubleSide });
  HT.sph = new THREE.SphereGeometry(1, 10, 7);
  HT.sphLo = new THREE.SphereGeometry(1, 7, 5);
  HT.hemi = new THREE.SphereGeometry(1, 14, 7, 0, TAU, 0, Math.PI * 0.55);
  HT.box = new THREE.BoxGeometry(1, 1, 1);
  HT.finger = new THREE.CapsuleGeometry(1, 1, 1, 4);
  HT.cyl = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
  HT.cylC = new THREE.CylinderGeometry(1, 1, 1, 12, 1, false);
  HT.disc = new THREE.CircleGeometry(1, 8);
  HT.curly = new THREE.IcosahedronGeometry(1, 1);
  { const p = HT.curly.attributes.position; for (let i = 0; i < p.count; i++) { const k = 1 + 0.09 * Math.sin(p.getX(i) * 17 + p.getY(i) * 11) * Math.cos(p.getZ(i) * 13); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); } HT.curly.computeVertexNormals(); }
  HT.shoe = new THREE.CapsuleGeometry(0.046, 0.15, 3, 8);
  HT.brim = new THREE.CylinderGeometry(1, 1, 1, 12, 1, false, -Math.PI / 2, Math.PI);
}

// ---------- geometry builder ----------
class HGeo {
  constructor() { this.p = []; this.u = []; this.c = []; this.si = []; this.sw = []; this.ix = []; this.n = 0; this.seams = []; }
  v(x, y, z, uu, vv, col, w) {
    this.p.push(x, y, z); this.u.push(uu, vv); this.c.push(col.r, col.g, col.b);
    if (w.length > 2) { this.si.push(w[0], w[2], 0, 0); this.sw.push(w[1], w[3], 0, 0); } else { this.si.push(w[0], 0, 0, 0); this.sw.push(1, 0, 0, 0); }
    return this.n++;
  }
  // rings: {x, y, z, rx, rz, v, c, reg, w}; arc: [th0, th1] for an open shell (th 0 = front, ±π = back)
  loft(rings, seg, capA, capB, arc) {
    const base = this.n, nr = rings.length;
    for (let i = 0; i < nr; i++) {
      const R = rings[i], reg = ATL[R.reg] || ATL.plain;
      for (let k = 0; k <= seg; k++) {
        const u = k / seg, th = arc ? lerp(arc[0], arc[1], u) : (u - 0.5) * TAU;
        this.v(R.x + Math.sin(th) * R.rx, R.y, R.z + Math.cos(th) * R.rz, lerp(reg[0], reg[2], u), lerp(reg[1], reg[3], R.v), R.cf ? R.cf(th) : R.c, R.wf ? R.wf(th) : R.w);
      }
      if (!arc) this.seams.push([base + i * (seg + 1), base + i * (seg + 1) + seg]);
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
    const v = _humV;
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
const _humV = new V3();
const _hm = new THREE.Matrix4(), _hq = new THREE.Quaternion(), _he = new THREE.Euler(), _hp = new V3(), _hs = new V3();
function hmx(x, y, z, sx, sy, sz, rx, ry, rz) { _he.set(rx || 0, ry || 0, rz || 0); _hq.setFromEuler(_he); _hp.set(x, y, z); _hs.set(sx, sy, sz); return _hm.compose(_hp, _hq, _hs); }
const wb = (a, b, t) => (t <= 0.001 ? [a] : t >= 0.999 ? [b] : [a, 1 - t, b, t]);
// Profile table rows: [y, rx, rz, x, z]. cuts = y values where the clothing changes.
function bandLoft(H, table, cuts, styleAt, weightAt, seg, capA, capB, arc) {
  const desc = table[table.length - 1][0] < table[0][0];
  const yA = table[0][0], yB = table[table.length - 1][0], lo = Math.min(yA, yB), span = Math.abs(yB - yA);
  const ys = table.map((r) => r[0]);
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
      rings.push(Object.assign({}, base, { c: s1.c, reg: s1.reg, cf: s1.cf, wf: s1.wf }), Object.assign({}, base, { c: s2.c, reg: s2.reg, cf: s2.cf, wf: s2.wf }));
    } else { const s = styleAt(y); rings.push(Object.assign({}, base, { c: s.c, reg: s.reg, cf: s.cf, wf: s.wf })); }
  }
  H.loft(rings, seg, capA, capB, arc);
}

// ---------- looks ----------
// Fields (all optional except gender/skin): top 'tee'|'tank'|'long'|'shirt'|'hoodie'|'jacket'|'openShirt'|'dress'|'uniform',
// outer (jacket/hoodie colour), bottom 'pants'|'shorts'|'skirt', shoeStyle 'sneakers'|'boots'|'flats', hatStyle 'cap'|'beanie'|'police',
// hairStyle 'short'|'buzz'|'quiff'|'bald'|'balding'|'curly'|'long'|'bob'|'pony'|'bun', age 'young'|'adult'|'old', belly 0..1,
// beard, sunglasses, badge, holster. Older looks (shirt, sleeves, shorts, hat colour …) still work.
function randomLook() {
  const F = Math.random() < 0.5, age = Math.random() < 0.16 ? 'old' : Math.random() < 0.45 ? 'young' : 'adult';
  const top = F ? rpick(['tee', 'tee', 'tank', 'long', 'hoodie', 'jacket', 'dress', 'dress', 'shirt']) : rpick(['tee', 'tee', 'tank', 'long', 'shirt', 'hoodie', 'jacket', 'openShirt', 'tee']);
  const bottom = top === 'dress' ? 'skirt' : F ? rpick(['pants', 'pants', 'shorts', 'skirt']) : rpick(['pants', 'pants', 'pants', 'shorts']);
  const old = age === 'old';
  return {
    gender: F ? 'f' : 'm', age, skin: rpick(SKIN),
    top, shirt: top === 'dress' ? rpick(HUM_DRESS) : rpick(SHIRTS), shirtPat: top === 'dress' ? rpick(['plain', 'floral', 'dots', 'plain']) : rpick(['fabric', 'fabric', 'plain', 'stripes', 'plaid', 'floral']),
    outer: rpick(HUM_OUTER),
    sleeves: top === 'tank' ? 'tank' : top === 'long' || top === 'hoodie' || top === 'jacket' ? 'long' : 'short',
    bottom, pants: rpick(PANTS), pantsPat: rpick(['denim', 'denim', 'fabric']), shorts: bottom === 'shorts',
    shoeStyle: F ? rpick(['sneakers', 'sneakers', 'flats', 'boots']) : rpick(['sneakers', 'sneakers', 'boots']),
    shoes: rpick(['#151515', '#f4f4f4', '#7a4b2a', '#2a2a40', '#c0392b', '#f4f4f4']), sole: rpick(['#f0f0f0', '#f0f0f0', '#222222']),
    hair: old ? rpick(['#cfc6b8', '#a9a39a', '#e6e1d8']) : rpick(HAIR),
    hairStyle: F ? rpick(['long', 'long', 'pony', 'bun', 'bob', 'curly', 'short']) : old ? rpick(['balding', 'short', 'bald', 'buzz']) : rpick(['short', 'quiff', 'buzz', 'bald', 'curly', 'short']),
    hat: Math.random() < 0.16 ? rpick(['#d7263d', '#1d3557', '#111111', '#f4f1ea', '#2a9d8f', '#ffd23f']) : null, hatStyle: rpick(['cap', 'cap', 'beanie']),
    glasses: Math.random() < (old ? 0.5 : 0.12), sunglasses: Math.random() < 0.14, phone: Math.random() < 0.14, belt: Math.random() < 0.6,
    beard: !F && Math.random() < 0.25,
    height: (F ? rr(0.9, 0.98) : rr(0.95, 1.05)) * (old ? 0.97 : 1), girth: rr(0.9, 1.18) + (old ? 0.06 : 0), belly: !F && Math.random() < (old ? 0.6 : 0.2) ? rr(0.4, 1) : 0,
  };
}
const HERO_LOOK = { gender: 'm', age: 'adult', skin: '#b97a55', top: 'openShirt', shirt: '#ffffff', shirtPat: 'floral', inner: '#f4f1ea', sleeves: 'short', bottom: 'pants', pants: '#e9e2d0', pantsPat: 'fabric', shorts: false,
  shoeStyle: 'sneakers', shoes: '#f4f4f4', sole: '#d9d9d9', hair: '#15100d', hairStyle: 'quiff', hat: null, glasses: false, sunglasses: true, phone: false, belt: true, height: 1.0, girth: 1.02, hero: true };
const COP_LOOK = { gender: 'm', age: 'adult', skin: '#8a5a3c', top: 'uniform', shirt: '#1f3c8f', shirtPat: 'uniform', sleeves: 'short', bottom: 'pants', pants: '#14213d', pantsPat: 'fabric', shorts: false,
  shoeStyle: 'boots', shoes: '#111111', sole: '#111111', hair: '#1a1110', hairStyle: 'buzz', hat: '#14213d', hatStyle: 'police', glasses: false, phone: false, belt: true, badge: true, holster: true, height: 1.02, girth: 1.1 };

// ---------- character construction ----------
function buildHuman(look) {
  const F = look.gender === 'f', old = look.age === 'old', G = look.girth || 1, LG = 0.55 + 0.45 * G, hero = !!look.hero, seg = hero ? 18 : 14;
  const P = F ? { sh: 0.166, shY: 1.4, hw: 0.097, arm: 0.86 } : { sh: 0.19, shY: 1.42, hw: 0.092, arm: 1 };
  const H = new HGeo();
  const C = (hex) => new THREE.Color(hex);
  const skin = C(look.skin), shirt = C(look.shirt), pants = C(look.pants), shoes = C(look.shoes), sole = C(look.sole || '#e8e8e8'), hair = C(look.hair);
  const top = look.top || (look.sleeves === 'tank' ? 'tank' : look.sleeves === 'long' ? 'long' : 'tee');
  const bottom = look.bottom || (look.shorts ? 'shorts' : 'pants');
  const outer = C(look.outer || '#1c1c22'), inner = C(look.inner || '#f4f1ea');
  const belt = C('#2b1e17'), dark = C('#111114'), white = C('#f6f4f0'), iris = C(rpick(['#3b2414', '#4a7a9a', '#2e5a34', '#1a120d', '#6b4a2a'])), lipC = skin.clone().lerp(C(F ? '#b5454f' : '#9a5a50'), F ? 0.5 : 0.3);
  const browC = hair.clone().multiplyScalar(0.75);
  const sReg = look.shirtPat || 'fabric', pReg = look.pantsPat || 'denim';
  // torso style: shirt / hoodie / dress take the torso; jackets and open shirts are a separate open shell
  const torsoC = top === 'hoodie' ? outer : top === 'openShirt' ? inner : shirt;
  const torsoReg = top === 'hoodie' ? 'hoodie' : top === 'openShirt' ? 'fabric' : top === 'uniform' ? 'uniform' : sReg;
  const ST = { skin: { c: skin, reg: 'skin' }, shirt: { c: torsoC, reg: torsoReg }, pants: { c: pants, reg: pReg }, belt: { c: belt, reg: 'leather' }, sleeve: { c: top === 'hoodie' || top === 'jacket' ? outer : shirt, reg: top === 'hoodie' ? 'knit' : top === 'jacket' ? 'leather' : sReg } };
  // torso
  const TOR = F ? [
    [0.835, 0.075, 0.06, 0, 0], [0.86, 0.145, 0.1, 0, 0], [0.9, 0.178, 0.12, 0, -0.005], [0.96, 0.18, 0.125, 0, -0.005], [1.02, 0.152, 0.108, 0, 0.004],
    [1.1, 0.127, 0.093, 0, 0.006], [1.17, 0.137, 0.1, 0, 0.01], [1.24, 0.152, 0.128, 0, 0.03], [1.3, 0.156, 0.12, 0, 0.022], [1.36, 0.158, 0.1, 0, 0.006],
    [1.41, 0.132, 0.08, 0, -0.004], [1.445, 0.066, 0.056, 0, -0.01]]
    : [[0.835, 0.07, 0.06, 0, 0], [0.86, 0.135, 0.1, 0, 0], [0.9, 0.163, 0.114, 0, 0], [0.96, 0.17, 0.12, 0, 0], [1.02, 0.158, 0.112, 0, 0.004],
      [1.1, 0.148, 0.105, 0, 0.008], [1.18, 0.156, 0.11, 0, 0.012], [1.27, 0.173, 0.118, 0, 0.016], [1.35, 0.183, 0.115, 0, 0.012],
      [1.41, 0.178, 0.104, 0, 0.004], [1.45, 0.14, 0.085, 0, -0.005], [1.48, 0.07, 0.06, 0, -0.01]];
  const belly = look.belly || 0;
  TOR.forEach((r) => {
    r[1] *= G; r[2] *= lerp(1, G, 0.8); if (r[0] < 1.2) r[4] += (G - 1) * 0.04;
    if (belly) { const b = Math.exp(-Math.pow((r[0] - 1.07) / 0.1, 2)) * belly; r[2] += 0.035 * b; r[4] += 0.03 * b; r[1] += 0.012 * b; }
    if (top === 'hoodie' && r[0] > 0.97) { r[1] += 0.012; r[2] += 0.012; }
  });
  const torsoW = (y) => (y < 0.98 ? [HB.hips] : y < 1.12 ? wb(HB.hips, HB.spine, (y - 0.98) / 0.14) : y < 1.25 ? wb(HB.spine, HB.chest, (y - 1.12) / 0.13) : y > 1.44 ? wb(HB.chest, HB.neck, 0.4) : [HB.chest]);
  const dress = top === 'dress';
  const bY0 = dress ? 0.86 : 1.0, bY1 = look.belt && !dress ? 1.035 : bY0;
  bandLoft(H, TOR, bY1 > bY0 ? [bY0, bY1] : [bY0], (y) => (y < bY0 ? (dress ? ST.shirt : ST.pants) : y < bY1 ? ST.belt : ST.shirt), torsoW, seg, -0.02, 0.012);
  if (top === 'tank') {
    for (const s of [-1, 1]) H.add(HT.box, hmx(s * P.sh * G * 0.62, 1.43, 0.0, 0.035, 0.012, 0.085), shirt, [HB.chest], sReg);
  }
  // open shell: jacket / open shirt over the torso, with a collar
  if (top === 'jacket' || top === 'openShirt') {
    const oc = top === 'jacket' ? outer : shirt, oreg = top === 'jacket' ? 'leather' : sReg;
    const sh = TOR.filter((r) => r[0] > 0.9).map((r) => [r[0], r[1] + 0.012, r[2] + 0.014, r[3], r[4]]);
    sh[0] = [0.86, sh[0][1] + 0.01, sh[0][2] + 0.01, 0, sh[0][4]];
    bandLoft(H, sh, [], () => ({ c: oc, reg: oreg }), torsoW, seg, 0, 0, [0.3, TAU - 0.3]);
    for (const s of [-1, 1]) H.add(HT.box, hmx(s * 0.06, 1.44, 0.07, 0.07, 0.012, 0.09, 0.9, s * 0.5, s * 0.35), oc, [HB.chest], oreg);
  }
  if (top === 'shirt' || top === 'uniform') for (const s of [-1, 1]) H.add(HT.box, hmx(s * 0.045, 1.47, 0.045, 0.06, 0.012, 0.05, 0.6, s * 0.6, s * 0.2), shirt, [HB.chest], sReg);
  if (top === 'hoodie') {
    // hood resting on the upper back, drawstrings
    H.add(HT.hemi, hmx(0, 1.43, -0.085, 0.13, 0.12, 0.085, -1.2), outer, [HB.chest], 'knit');
    for (const s of [-1, 1]) H.add(HT.box, hmx(s * 0.035, 1.36, 0.105 + (G - 1) * 0.05, 0.006, 0.09, 0.006, 0.1), white, [HB.chest]);
  }
  if (look.badge) H.add(HT.box, hmx(0.075, 1.33, 0.115 * G, 0.03, 0.036, 0.008), C('#d9b13b'), [HB.chest]);
  // skirt / dress hem: A-line, partly weighted to the thighs so legs don't poke through
  if (bottom === 'skirt') {
    const sc = dress ? shirt : pants, sreg = dress ? sReg : 'fabric', top0 = dress ? 0.9 : 1.0;
    const hem = dress ? 0.55 : 0.6;
    const SK = [[top0, 0.165 * G, 0.122 * G, 0, 0], [0.86, 0.19 * G, 0.14 * G, 0, -0.005], [0.75, 0.21 * G, 0.165 * G, 0, 0], [hem, 0.235 * G, 0.19 * G, 0, 0.01]];
    bandLoft(H, SK, [], () => ({ c: sc, reg: sreg, wf: null }), (y) => [HB.hips], seg, 0, 0);
    // re-weight the last rings to the nearer thigh
    const n0 = H.n - SK.length * (seg + 1);
    for (let i = n0; i < H.n; i++) {
      const x = H.p[i * 3], y = H.p[i * 3 + 1], k = sstep(0.95, 0.62, y) * (0.25 + 0.5 * Math.min(1, Math.abs(x) / 0.18));
      if (k > 0.01) { H.si[i * 4] = HB.hips; H.si[i * 4 + 1] = x > 0 ? HB.thL : HB.thR; H.sw[i * 4] = 1 - k; H.sw[i * 4 + 1] = k; }
    }
  }
  // neck
  bandLoft(H, [[1.42, 0.056 * LG, 0.052 * LG, 0, -0.008], [1.5, 0.05 * LG, 0.047 * LG, 0, -0.008], [1.58, 0.046, 0.044, 0, 0.0]], [], () => ST.skin,
    (y) => (y < 1.47 ? wb(HB.chest, HB.neck, (y - 1.42) / 0.05) : y < 1.55 ? [HB.neck] : wb(HB.neck, HB.head, 0.6)), 10, 0, 0);
  // head: jaw and cheekbones
  const HEAD = [[1.548, 0.02, 0.02, 0, 0.034], [1.56, 0.045, 0.04, 0, 0.038], [1.585, 0.068, 0.074, 0, 0.024], [1.62, 0.086, 0.098, 0, 0.008], [1.66, 0.094, 0.106, 0, 0],
    [1.70, 0.096, 0.108, 0, -0.004], [1.74, 0.089, 0.101, 0, -0.009], [1.77, 0.072, 0.084, 0, -0.012], [1.795, 0.042, 0.052, 0, -0.014]];
  if (F) HEAD.forEach((r) => { if (r[0] < 1.63) { r[1] *= 0.92; r[2] *= 0.97; } });
  if (!F && !old) HEAD.forEach((r) => { if (r[0] < 1.6) r[1] *= 1.06; });
  bandLoft(H, HEAD, [], () => ({ c: skin, reg: 'face' }), () => [HB.head], hero ? 18 : 14, -0.004, 0.012);
  const hd = [HB.head];
  // eyes: white + iris, brows, nose, lips, ears
  for (const s of [-1, 1]) {
    H.add(HT.sphLo, hmx(s * 0.034, 1.678, 0.096, 0.0135, 0.009, 0.008), white, hd);
    H.add(HT.sphLo, hmx(s * 0.035, 1.678, 0.1032, 0.0062, 0.0066, 0.003), iris, hd);
    H.add(HT.box, hmx(s * 0.036, 1.698, 0.101, 0.03, 0.006, 0.008, 0, 0, s * (F ? -0.12 : -0.05)), browC, hd);
    H.add(HT.sphLo, hmx(s * 0.093, 1.665, -0.006, 0.0095, 0.026, 0.018), skin, hd, 'skin');
  }
  H.add(HT.sphLo, hmx(0, 1.648, 0.104, 0.0135, 0.024, 0.019, -0.3), skin, hd, 'skin');
  H.add(HT.sphLo, hmx(0, 1.611, 0.1, 0.021, 0.0062, 0.008), lipC, hd);
  if (look.beard) H.add(HT.hemi, hmx(0, 1.62, 0.012, 0.09, 0.075, 0.1, Math.PI), hair, hd, 'hair');
  // hair & headwear
  const hs = look.hairStyle, under = !!look.hat && look.hatStyle !== 'beanie';
  if (hs !== 'bald') {
    const hcol = hs === 'buzz' ? hair.clone().lerp(skin, 0.35) : hair;
    if (hs === 'balding') {
      H.add(HT.cyl, hmx(0, 1.665, -0.02, 0.099, 0.06, 0.111), hcol, hd, 'hair');
    } else {
      const big = hs === 'curly' ? 1.12 : hs === 'buzz' ? 0.985 : 1.0;
      H.add(HT.hemi, hmx(0, 1.686, -0.007, 0.104 * big, 0.126 * big, 0.12 * big, -0.24), hcol, hd, 'hair');
      if (hs === 'curly') H.add(HT.curly, hmx(0, 1.735, -0.02, 0.112, 0.092, 0.118), hcol, hd, 'hair');
      if (hs === 'short' && !under) H.add(HT.sphLo, hmx(0, 1.755, 0.07, 0.07, 0.03, 0.04, 0.3), hcol, hd, 'hair');
      if (hs === 'quiff' && !under) { H.add(HT.sphLo, hmx(0, 1.775, 0.06, 0.068, 0.04, 0.055, 0.5), hcol, hd, 'hair'); H.add(HT.sphLo, hmx(0, 1.76, -0.02, 0.09, 0.045, 0.08), hcol, hd, 'hair'); }
      if (hs === 'long') {
        bandLoft(H, [[1.75, 0.104, 0.112, 0, -0.012], [1.62, 0.112, 0.118, 0, -0.022], [1.5, 0.122, 0.09, 0, -0.045], [1.4, 0.13, 0.07, 0, -0.06]], [], () => ({ c: hcol, reg: 'hair' }),
          (y) => (y > 1.55 ? [HB.head] : wb(HB.head, HB.chest, sstep(1.55, 1.42, y) * 0.6)), 12, 0, 0, [0.95, TAU - 0.95]);
      }
      if (hs === 'bob') {
        bandLoft(H, [[1.74, 0.106, 0.114, 0, -0.01], [1.64, 0.118, 0.12, 0, -0.012], [1.58, 0.116, 0.11, 0, -0.02]], [], () => ({ c: hcol, reg: 'hair' }), () => [HB.head], 12, 0, 0, [0.75, TAU - 0.75]);
      }
      if (hs === 'pony') { H.add(HT.finger, hmx(0, 1.6, -0.13, 0.028, 0.055, 0.028, 0.35), hcol, [HB.head], 'hair'); H.add(HT.sphLo, hmx(0, 1.69, -0.112, 0.026, 0.026, 0.026), hcol, hd, 'hair'); }
      if (hs === 'bun') H.add(HT.sph, hmx(0, 1.785, -0.07, 0.048, 0.044, 0.048), hcol, hd, 'hair');
    }
  }
  if (look.hat) {
    const hc = C(look.hat), st = look.hatStyle || 'cap';
    if (st === 'beanie') {
      H.add(HT.hemi, hmx(0, 1.69, -0.008, 0.112, 0.13, 0.124, -0.2), hc, hd, 'knit');
      H.add(HT.cyl, hmx(0, 1.705, -0.006, 0.115, 0.035, 0.126, -0.2), hc.clone().multiplyScalar(0.85), hd, 'knit');
    } else if (st === 'police') {
      H.add(HT.cylC, hmx(0, 1.78, -0.005, 0.118, 0.07, 0.128, -0.05), hc, hd, 'fabric');
      H.add(HT.cyl, hmx(0, 1.735, -0.002, 0.11, 0.03, 0.12, -0.05), dark, hd);
      H.add(HT.brim, hmx(0, 1.722, 0.07, 0.1, 0.008, 0.11, 0.25), dark, hd);
      H.add(HT.box, hmx(0, 1.765, 0.118, 0.025, 0.03, 0.006, -0.05), C('#d9b13b'), hd);
    } else {
      H.add(HT.hemi, hmx(0, 1.7, -0.006, 0.113, 0.122, 0.125, -0.12), hc, hd, 'fabric');
      H.add(HT.brim, hmx(0, 1.718, 0.095, 0.105, 0.008, 0.12, 0.18), hc, hd, 'fabric');
      H.add(HT.sphLo, hmx(0, 1.82, -0.015, 0.012, 0.008, 0.012), hc, hd);
    }
  }
  if (look.glasses || look.sunglasses) {
    const fc = look.sunglasses ? dark : C('#2b2b2b');
    for (const s of [-1, 1]) H.add(HT.box, hmx(s * 0.034, 1.678, 0.11, 0.038, look.sunglasses ? 0.026 : 0.024, 0.006), look.sunglasses ? dark : C('#9fb3c8'), hd);
    H.add(HT.box, hmx(0, 1.684, 0.11, 0.03, 0.005, 0.006), fc, hd);
    for (const s of [-1, 1]) H.add(HT.box, hmx(s * 0.088, 1.684, 0.055, 0.005, 0.006, 0.1), fc, hd);
  }
  // arms with sleeves, hands with fingers and a thumb (relaxed half-curl, palm facing the body)
  const sleeveCut = top === 'tank' || dress ? null : top === 'long' || top === 'hoodie' || top === 'jacket' || look.sleeves === 'long' ? 'long' : 'short';
  for (const s of [-1, 1]) {
    const x = s * P.sh, y = P.shY, k = P.arm * LG;
    const ua = s > 0 ? HB.uaL : HB.uaR, fa = s > 0 ? HB.faL : HB.faR, ha = s > 0 ? HB.haL : HB.haR;
    const ARM = [[y + 0.045, 0.045 * k, 0.045 * k, x, 0], [y + 0.015, 0.062 * k, 0.058 * k, x, 0], [y - 0.06, 0.056 * k, 0.055 * k, x, 0], [y - 0.17, 0.048 * k, 0.047 * k, x, 0],
      [y - 0.27, 0.041 * k, 0.04 * k, x, 0], [y - 0.3, 0.04 * k, 0.039 * k, x, 0.003], [y - 0.36, 0.044 * k, 0.041 * k, x, 0.004], [y - 0.47, 0.036 * k, 0.032 * k, x, 0.004], [y - 0.545, 0.028 * k, 0.024 * k, x, 0.004]];
    if (sleeveCut === 'long' && (top === 'hoodie' || top === 'jacket')) ARM.forEach((r) => { r[1] += 0.008; r[2] += 0.008; });
    const cut = sleeveCut === 'long' ? y - 0.52 : sleeveCut === 'short' ? y - 0.15 : null;
    bandLoft(H, ARM, cut === null ? [] : [cut], (yy) => (cut !== null && yy > cut ? ST.sleeve : ST.skin),
      (yy) => (yy > y - 0.24 ? [ua] : yy > y - 0.33 ? wb(ua, fa, (y - 0.24 - yy) / 0.09) : yy < y - 0.53 ? wb(fa, ha, 0.3) : [fa]), 10, 0.01, -0.006);
    const hx = x + s * 0.002, hy = y - 0.585, hz = 0.008, pw = P.arm;
    H.add(HT.sphLo, hmx(hx, hy, hz, 0.02 * pw, 0.045, 0.04 * pw), skin, [ha], 'skin');
    for (let f = 0; f < 4; f++) {
      const fz = hz + 0.028 - f * 0.018, fl = (0.026 - Math.abs(f - 1.2) * 0.003);
      H.add(HT.finger, hmx(hx - s * 0.008, hy - 0.05 - fl * 0.5, fz, 0.0075 * pw, fl, 0.0075 * pw, -0.2, 0, -s * 0.4), skin, [ha], 'skin');
    }
    H.add(HT.finger, hmx(hx - s * 0.014, hy - 0.025, hz + 0.036, 0.0085 * pw, 0.017, 0.0085 * pw, -0.55, 0, -s * 0.35), skin, [ha], 'skin');
    if (look.phone && s < 0) H.add(HT.box, hmx(x - s * 0.026, y - 0.6, 0.02, 0.012, 0.11, 0.055), dark, [ha]);
  }
  // legs and shoes
  for (const s of [-1, 1]) {
    const x = s * P.hw, k = LG * (F ? 0.95 : 1);
    const th = s > 0 ? HB.thL : HB.thR, sh = s > 0 ? HB.shL : HB.shR, ft = s > 0 ? HB.ftL : HB.ftR;
    const LEG = [[0.95, 0.07 * k, 0.07 * k, x, 0], [0.92, 0.088 * k, 0.09 * k, x, 0], [0.84, 0.084 * k, 0.086 * k, x, 0.002], [0.7, 0.073 * k, 0.075 * k, x, 0.004],
      [0.56, 0.058 * k, 0.06 * k, x, 0.006], [0.48, 0.054 * k, 0.056 * k, x, 0.008], [0.42, 0.057 * k, 0.06 * k, x, 0], [0.32, 0.058 * k, 0.062 * k, x, -0.006],
      [0.2, 0.045 * k, 0.047 * k, x, -0.002], [0.1, 0.036 * k, 0.037 * k, x, 0], [0.07, 0.034 * k, 0.035 * k, x, 0]];
    const boots = look.shoeStyle === 'boots';
    const cut = bottom === 'shorts' ? 0.62 : bottom === 'skirt' ? 2 : boots ? 0.2 : 0.1;
    const legStyle = (yy) => (yy > cut ? ST.pants : boots && yy <= 0.2 ? { c: shoes, reg: 'leather' } : ST.skin);
    bandLoft(H, LEG, cut < 1 ? [cut] : [], legStyle,
      (yy) => (yy > 0.56 ? [th] : yy > 0.44 ? wb(th, sh, (0.56 - yy) / 0.12) : yy < 0.1 ? wb(sh, ft, 0.5) : [sh]), 12, 0.01, -0.01);
    const st = look.shoeStyle || 'sneakers';
    if (st === 'flats') {
      H.add(HT.shoe, hmx(x, 0.035, 0.045, 0.95, 0.5, 0.95, Math.PI / 2), shoes, [ft], 'leather');
      H.add(HT.box, hmx(x, 0.006, 0.046, 0.085, 0.012, 0.235), sole, [ft]);
    } else {
      H.add(HT.shoe, hmx(x, 0.047, 0.045, 1.08, 0.78, 1, Math.PI / 2), shoes, [ft], st === 'sneakers' ? 'sneaker' : 'leather');
      H.add(HT.box, hmx(x, 0.011, 0.047, 0.1, 0.022, 0.25), sole, [ft]);
      if (st === 'sneakers') { H.add(HT.sphLo, hmx(x, 0.03, 0.15, 0.045, 0.028, 0.035), sole, [ft]); H.add(HT.box, hmx(x, 0.082, 0.085, 0.05, 0.01, 0.08, -0.35), white, [ft]); }
    }
  }
  if (look.holster) H.add(HT.box, hmx(-0.185 * G, 0.95, 0.0, 0.04, 0.14, 0.07), dark, [HB.hips], 'leather');
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
  bones[HB.thL].rotation.order = 'YXZ'; bones[HB.thR].rotation.order = 'YXZ';
  const mesh = new THREE.SkinnedMesh(geo, humanMat);
  mesh.add(bones[0]);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = true; mesh.receiveShadow = false;
  const root = new THREE.Group();
  const holder = new THREE.Group(); holder.scale.setScalar(look.height || 1);
  holder.add(mesh); root.add(holder);
  return {
    root, mesh, bones, female: F, old, seed: Math.random(), phase: Math.random() * TAU, cur: new Float32Array(HCH), init: false, sh: P.sh, shY: P.shY,
    lookT: rr(0.5, 3), lookYaw: 0, lookPitch: 0, lookSm: 0, airW: 0, landT: 0, wasAir: false, aimW: 0, ikW: 0, dirSm: 0, stepT: 0, wKind: 'none',
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
  _humLC[0] = th; _humLC[1] = kn; _humLC[2] = -(th + kn) * comp + lerp(wPush, rPush, runK) - 0.04;
  return _humLC;
}
const _humLC = [0, 0, 0];
// a: { speed, t, mode ('normal'|'down'|'getup'), getT, air, vy, punch, punchSide, hands, phone, turn, flinch,
//      dir (movement direction relative to facing: 0 forward, +π/2 left, -π/2 right, ±π back),
//      aim (0..1), aimYaw (+ = toward the character's left), aimPitch (+ = up), weapon ('none'|'pistol'|'twohand'|'melee'),
//      oneHand (pistol held in one hand), recoil (0..1 impulse), reload (0..1 progress),
//      breath (0..1 heavy breathing after a sprint), crouch (0..1) }
// Gait is tuned for walk 1.7 m/s, jog 4.1 m/s, sprint 6.9 m/s.
// Weapon frame: while a weapon is held, the right hand bone (HB.haR) is oriented with local +Z along the barrel / bat,
// +Y up (the top of the gun) and +X to the character's left; the wrist is the bone origin. Attach models in that frame.
function animHuman(H, a, dt) {
  const T = _HT; T.fill(0);
  const S = (b, x, y, z) => { T[b * 3] += x; T[b * 3 + 1] += y; T[b * 3 + 2] += z; };
  const O = (b, x, y, z, w) => { if (w <= 0) return; T[b * 3] = lerp(T[b * 3], x, w); T[b * 3 + 1] = lerp(T[b * 3 + 1], y, w); T[b * 3 + 2] = lerp(T[b * 3 + 2], z, w); };
  const mode = a.mode || 'normal', t = a.t || 0, F = H.female;
  const wpn = mode === 'normal' && !a.hands ? (a.weapon || 'none') : 'none';
  H.aimW = damp(H.aimW, wpn !== 'none' ? clamp(a.aim || 0, 0, 1) : 0, 14, dt);
  H.ikW = damp(H.ikW, wpn !== 'none' ? 1 : 0, 10, dt);
  if (wpn !== 'none') H.wKind = wpn;
  let hipX = 0, hipY = 0, hipZ = 0, step = false;
  if (mode === 'down') {
    const s = H.seed;
    S(HB.thL, -0.15 + 0.3 * s, 0, 0.16); S(HB.thR, 0.12 - 0.2 * s, 0, -0.2 - 0.1 * s); S(HB.shL, 0.35, 0, 0); S(HB.shR, 0.15 + 0.3 * s, 0, 0);
    S(HB.ftL, 0.45, 0, 0); S(HB.ftR, 0.35, 0, 0);
    S(HB.uaL, 0.2, 0.3, 1.25 + 0.2 * s); S(HB.uaR, -0.3, -0.2, -1.1 + 0.2 * s); S(HB.faL, -0.5 * s, 0, 0); S(HB.faR, -0.3, 0, 0);
    S(HB.neck, 0.1, (s - 0.5) * 0.8, 0); S(HB.head, 0.05, (s - 0.5) * 0.4, 0);
    H.ikW = 0; H.aimW = 0;
  } else {
    const sp = a.speed || 0, aimW = H.aimW;
    const runK = sstep(2.3, 3.9, sp) * (1 - aimW * 0.5), crouch = clamp(a.crouch || 0, 0, 1);
    // movement direction relative to facing: sideways steps turn hips + legs, backwards reverses the cycle
    let dir = a.dir || 0;
    const back = Math.abs(dir) > Math.PI * 0.62;
    const md = back ? wrapA(dir - Math.PI) : dir;
    H.dirSm = damp(H.dirSm, clamp(md, -1.6, 1.6), 8, dt);
    const stride = (lerp(1.5, 2.55, runK) + sstep(4.6, 7.2, sp) * 0.75) * (back ? 0.8 : 1) * (1 - Math.min(0.25, Math.abs(H.dirSm) * 0.14)) * (1 - crouch * 0.3);
    const prev = H.phase;
    // turning on the spot: small steps
    const turnK = (1 - sstep(0.15, 0.7, sp)) * sstep(0.7, 2.2, Math.abs(a.turn || 0));
    const effSp = Math.max(sp, turnK * 1.1);
    H.phase += (effSp / stride) * TAU * dt * (back ? -1 : 1);
    if (H.phase > 1000) H.phase -= 318 * TAU; else if (H.phase < -1000) H.phase += 318 * TAU;
    step = (sp > 0.8 || turnK > 0.3) && Math.floor(prev / Math.PI) !== Math.floor(H.phase / Math.PI);
    const mov = Math.max(sstep(0.08, 0.9, sp), turnK * 0.4), idle = 1 - mov, ph = H.phase, cp = Math.cos(ph), spn = Math.sin(ph);
    const amp = sp > 0.1 ? 1 : 0.45;
    const L = legCycle(ph, runK), l0 = L[0] * mov * amp, l1 = L[1] * mov * amp, l2 = L[2] * mov * amp;
    const R = legCycle(ph + Math.PI, runK);
    S(HB.thL, l0, 0, 0); S(HB.shL, l1, 0, 0); S(HB.ftL, l2, 0, 0);
    S(HB.thR, R[0] * mov * amp, 0, 0); S(HB.shR, R[1] * mov * amp, 0, 0); S(HB.ftR, R[2] * mov * amp, 0, 0);
    // swing plane toward the movement direction (thighs use YXZ order), hips turn into it, chest counter-turns
    const yawM = H.dirSm * sstep(0.1, 0.8, sp);
    const hipYaw = yawM * 0.38, legYaw = yawM * 0.58 + (turnK > 0 ? Math.sign(a.turn || 0) * 0.18 * turnK * Math.sin(ph) : 0);
    S(HB.thL, 0, legYaw, 0); S(HB.thR, 0, legYaw, 0); S(HB.hips, 0, hipYaw, 0); S(HB.spine, 0, -hipYaw * 0.55, 0); S(HB.chest, 0, -hipYaw * 0.45, 0);
    // weight: deeper bob, hip shift over the stance foot, pelvis drop on the swing side
    hipY += mov * lerp(-0.026 - 0.026 * Math.cos(2 * ph), -0.07 + 0.045 * Math.cos(2 * ph), runK) * amp;
    hipX += mov * lerp(F ? 0.034 : 0.026, 0.012, runK) * spn;
    S(HB.hips, 0, -mov * lerp(F ? 0.13 : 0.1, 0.17, runK) * cp * (1 - Math.abs(H.dirSm) * 0.4), mov * lerp(F ? 0.075 : 0.055, 0.03, runK) * spn);
    S(HB.spine, mov * lerp(0.04, 0.15, runK) * (back ? -0.5 : 1), mov * 0.05 * cp, -mov * 0.025 * spn);
    S(HB.chest, mov * 0.05 * runK, mov * lerp(0.08, 0.2, runK) * cp, 0);
    if (H.old) { S(HB.spine, 0.1, 0, 0); S(HB.neck, 0.08, 0, 0); }
    // sprint: lean into it; breath: chest and shoulders heave after running; crouch: low, bent knees
    const sprintK = sstep(4.8, 6.9, sp);
    if (sprintK > 0) { S(HB.spine, 0.08 * sprintK, 0, 0); S(HB.neck, -0.06 * sprintK, 0, 0); }
    if (a.breath > 0) {
      const b = clamp(a.breath, 0, 1), hv = Math.sin(t * lerp(3.2, 5.5, b)) * b;
      S(HB.chest, -0.035 * hv - 0.04 * b * idle, 0, 0); S(HB.spine, 0.06 * b * idle, 0, 0); S(HB.neck, 0.03 * hv, 0, 0);
      S(HB.uaL, 0, 0, 0.03 * hv); S(HB.uaR, 0, 0, -0.03 * hv); hipY -= 0.006 * Math.abs(hv);
    }
    if (crouch > 0) {
      hipY -= 0.3 * crouch; hipZ -= 0.04 * crouch;
      S(HB.thL, -0.85 * crouch, 0, 0.06 * crouch); S(HB.thR, -0.85 * crouch, 0, -0.06 * crouch);
      S(HB.shL, 1.35 * crouch, 0, 0); S(HB.shR, 1.35 * crouch, 0, 0); S(HB.ftL, -0.5 * crouch, 0, 0); S(HB.ftR, -0.5 * crouch, 0, 0);
      S(HB.spine, 0.32 * crouch, 0, 0); S(HB.neck, -0.2 * crouch, 0, 0);
    }
    // arms: swing with follow-through (forearm lags behind the upper arm)
    const armSw = lerp(0.33, 0.72, runK) * mov * (1 - Math.abs(H.dirSm) * 0.35), ab = F ? 0.15 : 0.12, cl = Math.cos(ph - 0.45);
    S(HB.uaL, armSw * cp - 0.06 * runK + idle * 0.05, 0, ab + 0.06 * runK);
    S(HB.uaR, -armSw * cp - 0.06 * runK + idle * 0.05, 0, -ab - 0.06 * runK);
    S(HB.faL, -mov * lerp(0.2 + 0.3 * Math.max(0, -cl), 1.45 + 0.25 * cl, runK) - idle * 0.14, 0, 0);
    S(HB.faR, -mov * lerp(0.2 + 0.3 * Math.max(0, cl), 1.45 - 0.25 * cl, runK) - idle * 0.14, 0, 0);
    S(HB.haL, 0, 0, -0.06); S(HB.haR, 0, 0, 0.06);
    if (idle > 0.01) {
      const ws = Math.sin(t * 0.45 + H.seed * TAU), br = Math.sin(t * 1.7 + H.seed * 3);
      hipX += idle * 0.028 * ws; hipY -= idle * 0.012 * Math.abs(ws);
      S(HB.hips, 0, 0, idle * 0.03 * ws);
      S(HB.thL, -idle * 0.0, 0, -idle * 0.03 * ws); S(HB.thR, 0, 0, -idle * 0.03 * ws);
      const kb = idle * 0.2 * Math.max(0, ws), kb2 = idle * 0.2 * Math.max(0, -ws);
      S(HB.thR, -kb * 0.45, 0, 0); S(HB.shR, kb, 0, 0); S(HB.ftR, -kb * 0.55, 0, 0);
      S(HB.thL, -kb2 * 0.45, 0, 0); S(HB.shL, kb2, 0, 0); S(HB.ftL, -kb2 * 0.55, 0, 0);
      S(HB.chest, idle * 0.02 * br, 0, -idle * 0.02 * ws); S(HB.spine, idle * 0.01, 0, 0);
      S(HB.uaL, idle * 0.015 * br, 0, idle * 0.012 * br); S(HB.uaR, idle * 0.015 * br, 0, -idle * 0.012 * br);
    }
    H.lookT -= dt;
    if (H.lookT <= 0) { H.lookT = rr(2.5, 6); H.lookYaw = Math.random() < 0.45 ? 0 : rr(-0.75, 0.75); H.lookPitch = rr(-0.08, 0.12); }
    H.lookSm = damp(H.lookSm, H.lookYaw * idle * (a.phone ? 0.3 : 1) * (1 - H.ikW), 3, dt);
    const counter = -(T[HB.hips * 3 + 1] + T[HB.spine * 3 + 1] + T[HB.chest * 3 + 1]) * 0.9;
    S(HB.neck, idle * H.lookPitch * 0.5 - mov * 0.1 * runK, (H.lookSm + counter) * 0.4, 0);
    S(HB.head, idle * H.lookPitch * 0.5 - mov * 0.06 * runK, (H.lookSm + counter) * 0.6, 0);
    const lean = clamp(-(a.turn || 0) * 0.035 * mov, -0.16, 0.16);
    S(HB.spine, 0, 0, lean); S(HB.hips, 0, 0, lean * 0.4);
    if (a.phone && wpn === 'none') {
      const pw = 1 - runK;
      O(HB.uaR, -0.45, 0.28, -0.5, pw); O(HB.faR, -2.3, 0, 0, pw); O(HB.haR, 0.2, 0, 0.2, pw);
      S(HB.head, 0, 0, -0.1 * pw);
    }
    // weapon stance: the torso turns and bends toward the aim, knees soften, head follows the sights
    if (H.ikW > 0.01) {
      const w = H.ikW, ay = clamp(a.aimYaw || 0, -1.4, 1.4) * aimW, ap = clamp(a.aimPitch || 0, -1.1, 1.1) * aimW;
      const two = wpn === 'twohand' || wpn === 'melee';
      S(HB.spine, -ap * 0.18 + 0.04 * aimW, ay * 0.3, 0); S(HB.chest, -ap * 0.22, ay * 0.42 + (two ? 0.12 : 0) * aimW, 0);
      S(HB.neck, -ap * 0.25, ay * 0.12 - (two ? 0.1 : 0) * aimW, two ? 0.06 * aimW : 0); S(HB.head, -ap * 0.3, ay * 0.12 - (two ? 0.06 : 0) * aimW, two ? 0.1 * aimW : 0);
      S(HB.thL, -0.08 * aimW * w * idle, 0, 0.03 * aimW * idle); S(HB.thR, -0.12 * aimW * w * idle, 0, -0.03 * aimW * idle);
      S(HB.shL, 0.14 * aimW * idle, 0, 0); S(HB.shR, 0.2 * aimW * idle, 0, 0); hipY -= 0.025 * aimW * idle;
      if (a.recoil > 0) { S(HB.chest, -0.06 * a.recoil, 0, 0); S(HB.spine, -0.03 * a.recoil, 0, 0); S(HB.neck, 0.03 * a.recoil, 0, 0); }
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
    // punches (alternating hands) — without a weapon
    if (a.punch > 0 && wpn === 'none') {
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
    // melee swing: the torso unwinds through the strike
    if (a.punch > 0 && wpn === 'melee') {
      const p = a.punch, sw = sstep(0.15, 0.45, p) - sstep(0.6, 1, p) * 0.7, gw = sstep(0, 0.1, p) * (1 - sstep(0.8, 1, p));
      S(HB.chest, 0.1 * sw * gw, lerp(0.5, -0.7, sstep(0.15, 0.45, p)) * gw, 0); S(HB.spine, 0.08 * gw, lerp(0.25, -0.35, sstep(0.15, 0.45, p)) * gw, 0);
      S(HB.hips, 0, -0.2 * sw * gw, 0); hipY -= 0.03 * gw;
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
  if (H.ikW > 0.01 && mode === 'normal') humWeaponIK(H, a, dt);
  return step;
}

// ---------- weapon layer: two-bone IK for both arms holding one rigid weapon ----------
const HUM_IK = { q: new THREE.Quaternion(), qc: new THREE.Quaternion(), qi: new THREE.Quaternion(), qa: new THREE.Quaternion(), qb: new THREE.Quaternion(), qh: new THREE.Quaternion(), qt: new THREE.Quaternion(),
  m: new THREE.Matrix4(), e: new THREE.Euler(), f: new V3(), u: new V3(), l: new V3(), p: new V3(), w: new V3(), s: new V3(), d: new V3(), v: new V3(), el: new V3(), x: new V3(), y: new V3(), z: new V3(), t: new V3(), o: new V3(), fc: new V3(), uc: new V3() };
// orthonormal basis (columns x = left, y = up, z = forward) from forward and approximate up → quaternion
function humBasisQuat(fwd, up, out) {
  const z = HUM_IK.z.copy(fwd).normalize(), x = HUM_IK.x.crossVectors(up, z).normalize(), y = HUM_IK.y.crossVectors(z, x);
  HUM_IK.m.makeBasis(x, y, z); return out.setFromRotationMatrix(HUM_IK.m);
}
// Solve shoulder→elbow→wrist for wrist target W (chest frame), pole hint; writes ua/fa local quaternions, returns the arm's chest-frame rotation of the forearm.
function humSolveArm(S, W, pole, l1, l2, qUa, qFa) {
  const d = HUM_IK.d.subVectors(W, S); let dist = d.length();
  dist = clamp(dist, 0.05, l1 + l2 - 0.002); d.normalize();
  const cosA = clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1), A = Math.acos(cosA);
  const cosE = clamp((l1 * l1 + l2 * l2 - dist * dist) / (2 * l1 * l2), -1, 1), bend = Math.PI - Math.acos(cosE);
  const v = HUM_IK.v.copy(pole).addScaledVector(d, -pole.dot(d)); if (v.lengthSq() < 1e-6) v.set(0, -1, 0); v.normalize();
  const el = HUM_IK.el.copy(d).multiplyScalar(Math.cos(A)).addScaledVector(v, Math.sin(A)).multiplyScalar(l1).add(S);
  // upper arm: local -Y along the bone, local +Z toward the inside of the elbow (where the forearm bends to)
  const ya = HUM_IK.y.subVectors(S, el).normalize();
  const wr = HUM_IK.w.copy(S).addScaledVector(d, dist);
  const zin = HUM_IK.z.subVectors(wr, el); zin.addScaledVector(ya, -zin.dot(ya));
  if (zin.lengthSq() < 1e-6) zin.copy(v).negate(); zin.normalize();
  const xa = HUM_IK.x.crossVectors(ya, zin);
  HUM_IK.m.makeBasis(xa, ya, zin); qUa.setFromRotationMatrix(HUM_IK.m);
  qFa.setFromAxisAngle(_humIkX, -bend);
}
const _humIkX = new V3(1, 0, 0), _humIkPole = new V3(), _humIkS = new V3(), _humIkW2 = new V3();
function humWeaponIK(H, a, dt) {
  const V = HUM_IK, bn = H.bones, w = H.ikW, aim = H.aimW, kind = a.weapon && a.weapon !== 'none' ? a.weapon : H.wKind;
  // chest rotation and position relative to the character root
  const qc = V.qc.copy(bn[HB.hips].quaternion).multiply(bn[HB.spine].quaternion).multiply(bn[HB.chest].quaternion);
  const qi = V.qi.copy(qc).invert();
  // aim direction in root space → chest space
  const ay = clamp(a.aimYaw || 0, -1.5, 1.5), ap = clamp(a.aimPitch || 0, -1.2, 1.2);
  const fa = V.f.set(Math.sin(ay) * Math.cos(ap), Math.sin(ap), Math.cos(ay) * Math.cos(ap)).applyQuaternion(qi);
  const shY = H.shY - 1.24, sh = H.sh, rec = clamp(a.recoil || 0, 0, 1), rl = clamp(a.reload || 0, 0, 1), rk = rl > 0 && rl < 1 ? Math.sin(Math.PI * rl) : 0;
  const up = V.u.set(0, 1, 0);
  const fc = V.fc, uc = V.uc, o = V.o;
  let leftOn = 1, lOff = V.l;
  // weapon origin (right wrist), forward and up in chest space for carry and aim poses
  if (kind === 'pistol') {
    const one = !!a.oneHand;
    fc.set(-0.1, -0.85, 0.5).normalize(); uc.set(0, 0.3, 0.9);
    const ox = lerp(-sh - 0.02, one ? -sh * 0.55 : -0.05, aim), oy = lerp(shY - 0.52, shY + 0.02, aim), oz = lerp(0.1, one ? 0.5 : 0.42, aim);
    o.set(ox, oy, oz);
    if (aim > 0.01) { V.t.copy(fa).multiplyScalar(one ? 0.56 : 0.44); V.t.y += shY + 0.02; V.t.x += one ? -sh * 0.9 : -0.03; o.lerp(V.t, aim); }
    fc.lerp(fa, aim).normalize(); uc.lerp(up, aim);
    leftOn = one ? 0 : aim; lOff.set(0.045, -0.035, 0.005);
  } else if (kind === 'twohand') {
    fc.set(0.55, -0.35, 0.75).normalize(); uc.set(-0.3, 0.9, 0.2);
    o.set(-0.12, shY - 0.28, 0.2);
    V.t.set(-0.13, shY - 0.06, 0.08).addScaledVector(fa, 0.12); o.lerp(V.t, aim);
    fc.lerp(fa, aim).normalize(); uc.lerp(up, aim);
    leftOn = 1; lOff.set(0.0, -0.05, 0.33);
  } else { // melee: bat over the right shoulder (ready), resting on it when relaxed
    fc.set(-0.25, 0.75, -0.6).normalize(); uc.set(0, 0.6, 0.8);
    o.set(-0.16, shY - 0.18, 0.2);
    V.t.set(-0.2, shY - 0.02, 0.18); o.lerp(V.t, aim);
    V.t.set(-0.35, 0.9, -0.25).normalize(); fc.lerp(V.t, aim).normalize();
    if (a.punch > 0) {
      const p = a.punch, s1 = sstep(0.15, 0.45, p), back = 1 - sstep(0.55, 1, p);
      V.t.set(lerp(-0.4, 0.95, s1), lerp(0.8, -0.05, s1), lerp(-0.4, 0.3, s1)).normalize(); fc.lerp(V.t, back).normalize();
      o.x += lerp(0, 0.18, s1) * back; o.z += lerp(0, 0.2, s1) * back; o.y -= 0.12 * s1 * back;
    }
    leftOn = 1; lOff.set(0.0, -0.005, -0.1);
  }
  // recoil: muzzle climbs, grip kicks back; reload: weapon tilts in toward the chest
  if (rec > 0) { fc.addScaledVector(uc, (kind === 'pistol' ? 0.55 : 0.25) * rec).normalize(); o.addScaledVector(fc, -(kind === 'pistol' ? 0.07 : 0.05) * rec); o.y += 0.02 * rec; }
  if (rk > 0) {
    o.z -= 0.12 * rk; o.y -= 0.06 * rk; o.x += 0.04 * rk;
    V.t.copy(fc); V.t.y += 0.35 * rk; V.t.x += 0.15 * rk; fc.lerp(V.t.normalize(), rk).normalize();
    V.t.set(0.6, 0.6, 0); uc.lerp(V.t, 0.5 * rk);
  }
  const qw = humBasisQuat(fc, uc, V.qh);
  // right arm
  _humIkS.set(-sh, shY, 0);
  _humIkPole.set(-0.6, -0.8, -0.2).normalize();
  humSolveArm(_humIkS, o, _humIkPole, 0.29, 0.26, V.qa, V.qb);
  const qR = V.qt.copy(V.qa).multiply(V.qb).invert().multiply(qw);
  bn[HB.uaR].quaternion.slerp(V.qa, w); bn[HB.faR].quaternion.slerp(V.qb, w); bn[HB.haR].quaternion.slerp(qR, w);
  // left (support) hand: on the weapon, or on the way to a fresh magazine while reloading
  if (leftOn > 0.01) {
    const wl = _humIkW2.copy(lOff).applyQuaternion(qw).add(o);
    if (rk > 0 && kind !== 'melee') {
      const k2 = rl < 0.5 ? sstep(0.12, 0.42, rl) : 1 - sstep(0.55, 0.85, rl);
      V.t.set(0.12, shY - 0.62, 0.05); wl.lerp(V.t, k2);
    }
    _humIkS.set(sh, shY, 0);
    _humIkPole.set(0.7, -0.7, -0.2).normalize();
    humSolveArm(_humIkS, wl, _humIkPole, 0.29, 0.26, V.qa, V.qb);
    const ql = V.qi.copy(V.qa).multiply(V.qb).invert().multiply(qw);
    if (kind === 'twohand') { V.qc.setFromAxisAngle(V.t.set(0, 0, 1), -1.2); ql.multiply(V.qc); }
    const wL = w * leftOn;
    bn[HB.uaL].quaternion.slerp(V.qa, wL); bn[HB.faL].quaternion.slerp(V.qb, wL); bn[HB.haL].quaternion.slerp(ql, wL);
  }
}
