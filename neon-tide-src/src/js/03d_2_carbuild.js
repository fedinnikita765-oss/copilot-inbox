// ============================================================
//  Car geometry builder (owner: models & driving). One shared set of geometries per car type:
//  body (paint, morph targets for damage), detail (plates, liners, mirrors, decals), lamps, wheel, extras,
//  and a lazily built interior for first-person driving.
// ============================================================
const BODY_RING = SEC_N * 2 - 2;
let carAtlasCtx = null;
function carAtlasBegin() {
  const c = mkCanvas(ATLAS.W, ATLAS.H), m = mkCanvas(ATLAS.W, ATLAS.H);
  const g = c.getContext('2d'), gm = m.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, ATLAS.W, ATLAS.H);
  gm.fillStyle = '#000'; gm.fillRect(0, 0, ATLAS.W, ATLAS.H);
  carAtlasCtx = { c, m, g, gm };
}
// Combine colour + glass mask into the body atlas (alpha 0 = glass) and a half-res roughness/metalness map.
function carAtlasEnd() {
  const { c, m, g, gm } = carAtlasCtx, W = ATLAS.W, H = ATLAS.H;
  const col = g.getImageData(0, 0, W, H).data, msk = gm.getImageData(0, 0, W, H).data;
  const data = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H * 4; i += 4) { data[i] = col[i]; data[i + 1] = col[i + 1]; data[i + 2] = col[i + 2]; data[i + 3] = 255 - msk[i]; }
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.encoding = THREE.sRGBEncoding; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy()); t.flipY = false; t.needsUpdate = true;
  const OW = W / 2, OH = H / 2, od = new Uint8Array(OW * OH * 4);
  for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) {
    let r = 0, gg = 0, b = 0, a = 0;
    for (let k = 0; k < 4; k++) { const i = (((y * 2 + (k >> 1)) * W) + x * 2 + (k & 1)) * 4; r += data[i]; gg += data[i + 1]; b += data[i + 2]; a += data[i + 3]; }
    r /= 4; gg /= 4; b /= 4; a /= 4;
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), lum = (r + gg + b) / 3, sat = mx > 0 ? (mx - mn) / mx : 0;
    const glass = 1 - a / 255, trim = lum < 70 && sat < 0.3 ? 1 : 0;
    // material roughness 0.6 / metalness 0.5: paint 0.32 / 0.45, trim 0.6 / 0.05, glass 0.03 / 0; red = clearcoat
    const rough = lerp(lerp(0.53, 1, trim), 0.05, glass), metal = lerp(lerp(0.9, 0.1, trim), 0, glass), coat = lerp(lerp(1, 0.25, trim), 1, glass);
    const o = (y * OW + x) * 4; od[o] = Math.round(coat * 255); od[o + 1] = Math.round(clamp(rough, 0, 1) * 255); od[o + 2] = Math.round(clamp(metal, 0, 1) * 255); od[o + 3] = 255;
  }
  const o = new THREE.DataTexture(od, OW, OH, THREE.RGBAFormat, THREE.UnsignedByteType);
  o.magFilter = THREE.LinearFilter; o.minFilter = THREE.LinearMipmapLinearFilter; o.generateMipmaps = true; o.flipY = false; o.needsUpdate = true;
  ATLAS.tex = t; ATLAS.orm = o;
  carAtlasCtx = null;
}

// Paint every tile first (the atlas is uploaded once), then geometries use the stored uv mappers.
const CARSHAPE = {};
function prepareCarShapes() {
  carAtlasBegin();
  for (const type of CAR_TILE_ORDER) {
    const sh = carShape(type);
    const zs = carSlices(sh);
    let Smax = 0, capY = 0;
    for (const z of zs) { const s = sh.at(z); Smax = Math.max(Smax, s.S); }
    for (let i = 0; i <= 200; i++) Smax = Math.max(Smax, sh.at(lerp(sh.zmin, sh.zmax, i / 200)).S);
    for (const z of [sh.zmin, sh.zmax]) { const s = sh.at(z); capY = Math.max(capY, s.yt + Math.max(0, s.crown) + 0.02); }
    sh.zs = zs; sh.Smax = Smax * 1.002; sh.capY = capY;
    sh.uv = paintCarTile(carAtlasCtx.g, carAtlasCtx.gm, type, sh, sh.Smax, capY);
    CARSHAPE[type] = sh;
  }
  carAtlasEnd();
}
function carSlices(sh) {
  const S = sh.S, L = sh.L, zs = [], n = Math.ceil(L / (L > 8 ? 0.3 : 0.16));
  for (let i = 0; i <= n; i++) zs.push(sh.zmin + L * i / n);
  for (const az of [sh.axF, sh.axR]) {
    for (let k = 0; k <= 14; k++) zs.push(az + Math.cos(Math.PI * k / 14) * (sh.ra - 0.004));
    zs.push(az - sh.ra - 0.004, az + sh.ra + 0.004);
  }
  for (const e of [0.012, 0.035, 0.07, 0.12, 0.2]) zs.push(sh.zmin + e, sh.zmax - e);
  for (const gz of S.g) if (gz > -0.49 && gz < 0.49) zs.push(gz * L - 0.02, gz * L, gz * L + 0.02);
  if (S.wallZ) for (const wz of S.wallZ) zs.push(wz * L - 0.004, wz * L + 0.004);
  if (S.bed) zs.push(S.bed[0] * L, S.bed[1] * L);
  zs.sort((a, b) => a - b);
  const out = [];
  for (const z of zs) if (z >= sh.zmin - 1e-6 && z <= sh.zmax + 1e-6 && (!out.length || z - out[out.length - 1] > 0.006)) out.push(clamp(z, sh.zmin, sh.zmax));
  out[out.length - 1] = sh.zmax;
  return out;
}

// ---------- body ----------
function buildCarBody(type, sh, deform) {
  const zs = sh.zs, nS = zs.length, R = BODY_RING, uv = sh.uv, S = sh.S;
  const P = [], UV = [], IX = [];
  for (let i = 0; i < nS; i++) {
    const z = zs[i], s = sh.at(z), v = uv.v(z);
    for (let k = 0; k < R; k++) {
      const j = k < SEC_N ? k : R - k, sx = k < SEC_N ? 1 : -1;
      P.push(s.px[j] * sx, s.py[j], z); UV.push(uv.u(s.ps[j]), v);
    }
  }
  const halfSeg = (k) => { const a = k < SEC_N ? k : R - k, b = (k + 1) % R, bb = b < SEC_N ? b : R - b; return Math.min(a, bb); };
  for (let i = 0; i < nS - 1; i++) {
    const zm = (zs[i] + zs[i + 1]) / 2, bed = S.bed && zm > S.bed[0] * sh.L && zm < S.bed[1] * sh.L;
    for (let k = 0; k < R; k++) {
      if (bed && halfSeg(k) >= 9) continue;
      const a = i * R + k, b = i * R + (k + 1) % R, c = a + R, d = b + R;
      IX.push(a, b, c, b, d, c);
    }
  }
  // caps with two inner rings for a gently domed face
  const cap = (i, front) => {
    const z = zs[i], s = sh.at(z);
    let y0 = 1e9, y1 = -1e9; for (let j = 0; j < SEC_N; j++) { y0 = Math.min(y0, s.py[j]); y1 = Math.max(y1, s.py[j]); }
    const cy = (y0 + y1) / 2, base = P.length / 3, rings = [1, 0.72, 0.4];
    for (const f of rings) for (let k = 0; k < R; k++) {
      const j = k < SEC_N ? k : R - k, sx = k < SEC_N ? 1 : -1, x = s.px[j] * sx * f, y = cy + (s.py[j] - cy) * f;
      P.push(x, y, z); UV.push(front ? uv.fu(x) : uv.bu(x), uv.cv(y));
    }
    const c = P.length / 3; P.push(0, cy, z); UV.push(front ? uv.fu(0) : uv.bu(0), uv.cv(cy));
    for (let r = 0; r < rings.length; r++) for (let k = 0; k < R; k++) {
      const a = base + r * R + k, b = base + r * R + (k + 1) % R;
      if (r < rings.length - 1) { const a2 = a + R, b2 = b + R; if (front) IX.push(a, b, a2, b, b2, a2); else IX.push(a, a2, b, b, a2, b2); }
      else if (front) IX.push(a, b, c); else IX.push(a, c, b);
    }
  };
  cap(nS - 1, true); cap(0, false);
  const parts = new PartList();
  parts.p = P; parts.u = UV; parts.ix = IX; parts.cnt = P.length / 3; parts.n = new Array(P.length).fill(0);
  addPaintParts(parts, type, sh);
  const g = parts.build(deform);
  // smooth normals for the loft/caps; painted parts keep their own normals
  const loftCount = nS * R + 2 * (3 * R + 1);
  const n0 = g.attributes.normal.array.slice(loftCount * 3);
  g.computeVertexNormals();
  g.attributes.normal.array.set(n0, loftCount * 3);
  g.userData.loftCount = loftCount;
  addDamageMorphs(g, sh, true);
  return g;
}
// small painted parts merged into the body: mirrors, scoop, spoilers
function addPaintParts(parts, type, sh) {
  const S = sh.S, st = S.style, L = sh.L, plain = sh.uv.plain;
  const sph = () => new THREE.SphereGeometry(1, 10, 7), box = () => new THREE.BoxGeometry(1, 1, 1);
  if (st.bus) {
    for (const s of [-1, 1]) {
      parts.add(box(), cmx(s * (sh.hw + 0.13), 2.35, sh.zmax - 0.05, 0.3, 0.04, 0.04), plain);
      parts.add(sph(), cmx(s * (sh.hw + 0.27), 2.05, sh.zmax + 0.02, 0.07, 0.24, 0.06), plain);
    }
  } else {
    const z = S.g[3] * L - (type === 'van' ? 0.12 : 0.2), s0 = sh.at(z), y = s0.belt + (type === 'supercar' ? 0.06 : 0.1);
    for (const s of [-1, 1]) {
      parts.add(sph(), cmx(s * (s0.wg + 0.13), y, z, 0.105, 0.065, 0.05, 0, s * 0.15, 0), plain);
      parts.add(box(), cmx(s * (s0.wg + 0.04), y - 0.03, z + 0.01, 0.1, 0.03, 0.05), plain);
    }
  }
  if (st.scoop) { const s0 = sh.at(0.3 * L); parts.add(sph(), cmx(0, s0.belt + s0.crown, 0.28 * L, 0.26, 0.085, 0.42), plain); }
  if (st.duck || st.lip) {
    const z = sh.zmin + 0.06, s0 = sh.at(z);
    parts.add(box(), cmx(0, s0.belt + s0.crown + (st.duck ? 0.02 : 0.008), z + 0.02, s0.w * 1.8, st.duck ? 0.05 : 0.025, 0.12, -0.25), plain);
  }
}
// Shared crumple targets: front, rear, left (+x), right (-x), roof.
function addDamageMorphs(g, sh, normals) {
  const pos = g.attributes.position, n = pos.count, hw = sh.hw, L2 = sh.L / 2;
  const roofY = sh.at(sh.S.g[1] * sh.L * 0.5 + sh.S.g[2] * sh.L * 0.5).yt;
  const tg = [0, 1, 2, 3, 4].map(() => new Float32Array(n * 3));
  const hash = (x, y, z, k) => { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + k * 19.19) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; };
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), zn = z / L2, xn = x / hw, ax = Math.abs(xn);
    const w1 = hash(x, y, z, 1), w2 = hash(x, y, z, 2), w3 = hash(x, y, z, 3);
    const yb = sh.at(clamp(z, sh.zmin, sh.zmax)).yb;
    // front
    let f = sstep(0.42, 1.0, zn);
    if (f > 0) {
      const t = tg[0], o = i * 3;
      t[o] = -Math.sign(x) * f * 0.04 + w1 * 0.03 * f; t[o + 1] = f * (0.035 * (0.5 + w2)) * sstep(0.5, 0.9, y) ; t[o + 2] = -f * (0.26 + 0.12 * (1 - ax)) + w3 * 0.035 * f;
      if (x > 0 && y < yb + 0.3 && zn > 0.8) { t[o + 1] -= 0.14 * f * (1 - (y - yb) / 0.3) * sstep(0.2, 1, xn); t[o] += 0.05 * f; }
    }
    f = sstep(-0.45, -1.0, zn);
    if (f > 0) {
      const t = tg[1], o = i * 3;
      t[o] = -Math.sign(x) * f * 0.04 + w1 * 0.03 * f; t[o + 1] = f * 0.03 * (0.5 + w2) * sstep(0.5, 0.9, y); t[o + 2] = f * (0.22 + 0.1 * (1 - ax)) + w3 * 0.035 * f;
      if (x < 0 && y < yb + 0.3 && zn < -0.8) { t[o + 1] -= 0.12 * f * (1 - (y - yb) / 0.3) * sstep(0.2, 1, -xn); t[o] -= 0.04 * f; }
    }
    for (let side = 0; side < 2; side++) {
      const sx = side ? -1 : 1, q = sstep(0.25, 1.0, x * sx / hw) * (1 - sstep(0.7, 1.0, Math.abs(zn))) * Math.exp(-Math.pow((y - 0.75) / 0.55, 2));
      if (q <= 0) continue;
      const t = tg[2 + side], o = i * 3, bell = Math.exp(-zn * zn * 3);
      t[o] = -sx * q * (0.12 + 0.12 * bell) + w1 * 0.03 * q; t[o + 1] = w2 * 0.025 * q; t[o + 2] = w3 * 0.03 * q;
    }
    const r = sstep(roofY - 0.45, roofY, y) * (1 - ax * ax * 0.6);
    if (r > 0) { const t = tg[4], o = i * 3; t[o] = w1 * 0.02 * r; t[o + 1] = -r * 0.3 + w2 * 0.03 * r; t[o + 2] = w3 * 0.02 * r; }
  }
  if (!normals) { g.morphAttributes.position = tg.map((t) => new THREE.BufferAttribute(t, 3)); g.morphTargetsRelative = true; return; }
  // normals of each fully applied target, stored as deltas
  const base = g.attributes.normal.array, mp = [], mn = [];
  const tmp = new THREE.BufferGeometry(); tmp.setIndex(g.index);
  for (const t of tg) {
    const p2 = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) p2[i] = pos.array[i] + t[i];
    tmp.setAttribute('position', new THREE.BufferAttribute(p2, 3)); tmp.computeVertexNormals();
    const nn = tmp.attributes.normal.array, d = new Float32Array(n * 3);
    const lc = g.userData.loftCount * 3;
    for (let i = 0; i < lc; i++) d[i] = nn[i] - base[i];
    mp.push(new THREE.BufferAttribute(t, 3)); mn.push(new THREE.BufferAttribute(d, 3));
    tmp.deleteAttribute('normal');
  }
  g.morphAttributes.position = mp; g.morphAttributes.normal = mn; g.morphTargetsRelative = true;
}

// ---------- lamps ----------
function lampShape(kind, w, h, cx, cy, mirror) {
  const s = new THREE.Shape(); let pts;
  const o = (x, y) => [cx + (mirror ? -x : x), cy + y];
  if (kind === 'slim') pts = [o(-w / 2, -h / 2), o(w / 2, -h / 2 + 0.015), o(w / 2, h / 2 + 0.03), o(-w / 2 + 0.05, h / 2)];
  else if (kind === 'blade') pts = [o(-w / 2, -h / 2), o(w / 2, -h / 2 + 0.035), o(w / 2, h / 2 + 0.03), o(-w / 2 + 0.03, h / 2)];
  else if (kind === 'twin') {
    const a = new THREE.Shape(); a.absarc(cx + (mirror ? -1 : 1) * w * 0.25, cy, h / 2, 0, TAU, false);
    const b = new THREE.Shape(); b.absarc(cx - (mirror ? -1 : 1) * w * 0.24, cy, h * 0.44, 0, TAU, false);
    return [a, b];
  } else {
    const r = kind === 'square' ? 0.02 : kind === 'bar' || kind === 'wide' ? 0.015 : 0.035;
    return [roundRectShape(w, h, r, cx, cy)];
  }
  if (mirror) pts.reverse();
  s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]); s.closePath();
  return [s];
}
function buildLamps(sh, front) {
  const S = sh.S, T = sh.T, spec = front ? S.head : S.tail, hx = sh.hw - 0.37, hy = T.H - 0.2;
  const y = front || !spec.up ? hy + (front ? 0 : 0.02) : hy + spec.up * 0.5 - 0.05;
  const end = front ? sh.at(sh.zmax) : sh.at(sh.zmin);
  const parts = new PartList(), reg = DET.R[front ? 'lampHead' : 'lampTail'];
  const depth = 0.04, bev = 0.012;
  for (const sd of [-1, 1]) {
    const cx = sd * hx * (front ? 1 : -1), mirror = (sd < 0) === front;
    const shapes = lampShape(spec.shape, spec.w, spec.h, cx, y, mirror);
    for (const shp of shapes) {
      const geo = new THREE.ExtrudeGeometry(shp, { depth, bevelEnabled: true, bevelThickness: bev, bevelSize: 0.008, bevelSegments: 2, curveSegments: 10 });
      const x0 = cx - spec.w / 2, y0 = y - spec.h / 2;
      const m = front ? cmx(0, 0, sh.zmax + 0.006 - depth - bev, 1) : cmx(0, 0, sh.zmin - 0.006 + depth + bev, 1, 1, 1, 0, Math.PI, 0);
      parts.add(geo, m, null, (px, py) => {
        const lx = front ? px : -px;
        return [lerp(reg[0], reg[2], clamp((lx - x0) / spec.w, 0, 1)), lerp(reg[1], reg[3], clamp((py - y0) / spec.h, 0, 1))];
      });
    }
  }
  return parts;
}

// ---------- wheel (tyre + rim, rim face toward +x) ----------
function buildWheel(sh) {
  const T = sh.T, st = sh.S.style, r = T.wr, tw = T.tw || 0.25, rimR = r * (st.rim === 'bus' ? 0.6 : st.rim === 'steel' || st.rim === 'steel6' ? 0.62 : st.rim === 'thin' ? 0.74 : 0.68);
  const parts = new PartList(), D = DET.R;
  const lathe = (pts, seg) => { const g = new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), seg); g.rotateZ(-Math.PI / 2); return g; };
  const h = tw / 2, sw = (r - rimR);
  // sidewalls
  parts.add(lathe([[rimR + 0.004, h - 0.012], [rimR + sw * 0.3, h + 0.004], [r - sw * 0.28, h + 0.01], [r - 0.02, h - 0.002]], 22), cmx(0, 0, 0, 1), D.rubber);
  parts.add(lathe([[r - 0.02, -h + 0.002], [r - sw * 0.28, -h - 0.01], [rimR + sw * 0.3, -h - 0.004], [rimR + 0.004, -h + 0.012]], 22), cmx(0, 0, 0, 1), D.rubber);
  parts.add(lathe([[r - 0.02, h - 0.002], [r - 0.004, h * 0.6], [r, 0], [r - 0.004, -h * 0.6], [r - 0.02, -h + 0.002]], 22), cmx(0, 0, 0, 1), D.tread);
  // barrel and dark inner, brake disc
  parts.add(lathe([[rimR, -h + 0.02], [rimR, h - 0.03]], 18), cmx(0, 0, 0, 1), [lerp(D.gun[0], D.gun[2], 0.5), lerp(D.gun[1], D.gun[3], 0.5)]);
  parts.add(new THREE.CylinderGeometry(rimR * 0.72, rimR * 0.72, 0.02, 16), cmx(-0.01, 0, 0, 1, 1, 1, 0, 0, Math.PI / 2), D.gun);
  const mat = D[st.rimMat || 'silver'], mc = [lerp(mat[0], mat[2], 0.5), lerp(mat[1], mat[3], 0.5)];
  const fx = h - 0.028;
  parts.add(new THREE.TorusGeometry(rimR - 0.008, 0.014, 5, 22), cmx(fx + 0.006, 0, 0, 1, 1, 1, 0, Math.PI / 2, 0), mc);
  if (st.rim === 'steel' || st.rim === 'steel6' || st.rim === 'bus') {
    const sc = [lerp(D.steelw[0], D.steelw[2], 0.5), lerp(D.steelw[1], D.steelw[3], 0.5)];
    parts.add(new THREE.CylinderGeometry(rimR * 0.95, rimR * 0.95, 0.012, 20), cmx(fx - 0.02, 0, 0, 1, 1, 1, 0, 0, Math.PI / 2), sc);
    const nh = st.rim === 'steel6' ? 6 : 8;
    for (let i = 0; i < nh; i++) { const a = i / nh * TAU; parts.add(new THREE.CylinderGeometry(rimR * 0.1, rimR * 0.1, 0.014, 8), cmx(fx - 0.012, Math.cos(a) * rimR * 0.62, Math.sin(a) * rimR * 0.62, 1, 1, 1, 0, 0, Math.PI / 2), D.gloss); }
    parts.add(new THREE.CylinderGeometry(rimR * 0.36, rimR * 0.42, 0.05, 14), cmx(fx, 0, 0, 1, 1, 1, 0, 0, Math.PI / 2), st.rim === 'bus' ? D.gun : D.chrome);
  } else {
    const ns = st.rim === 'multi' ? 10 : st.rim === 'six' ? 6 : st.rim === 'thin' ? 10 : 5, wdt = st.rim === 'multi' || st.rim === 'thin' ? 0.022 : st.rim === 'mag' ? 0.07 : 0.048;
    for (let i = 0; i < ns; i++) {
      const a = i / ns * TAU, len = rimR * 0.78, mid = rimR * 0.2 + len / 2;
      const twist = st.rim === 'sport' ? 0.18 : st.rim === 'thin' ? (i % 2 ? 0.12 : -0.12) : 0;
      parts.add(new THREE.BoxGeometry(0.03, len, wdt), cmx(fx - 0.01, Math.cos(a) * mid, Math.sin(a) * mid, 1, 1, 1, a - Math.PI / 2 + twist, 0, 0), mc);
    }
    parts.add(new THREE.CylinderGeometry(rimR * 0.22, rimR * 0.26, 0.05, 14), cmx(fx - 0.005, 0, 0, 1, 1, 1, 0, 0, Math.PI / 2), mc);
    parts.add(new THREE.CylinderGeometry(rimR * 0.1, rimR * 0.1, 0.06, 10), cmx(fx, 0, 0, 1, 1, 1, 0, 0, Math.PI / 2), D.gloss);
  }
  return parts.build();
}

// ---------- detail parts (one draw call) ----------
function sideDecal(parts, sh, z0, z1, y0, y1, reg, side, nz) {
  nz = nz || 8;
  const pos = [], uv = [], ix = [];
  for (let i = 0; i <= nz; i++) for (let j = 0; j <= 2; j++) {
    const z = lerp(z0, z1, i / nz), y = lerp(y0, y1, j / 2), s = sh.sAtY(z, y), p = sh.atS(z, s);
    pos.push(side * (p.x + 0.006), p.y, z);
    const u = side > 0 ? 1 - i / nz : i / nz; uv.push(lerp(reg[0], reg[2], u), lerp(reg[1], reg[3], j / 2));
  }
  for (let i = 0; i < nz; i++) for (let j = 0; j < 2; j++) {
    const a = i * 3 + j, b = a + 3, c = a + 1, d = b + 1;
    if (side > 0) ix.push(a, c, b, b, c, d); else ix.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(ix); g.computeVertexNormals();
  parts.add(g, cmx(0, 0, 0, 1), null, (x, y, z, u, v) => [u, v]);
}
function buildDetail(type, sh) {
  const S = sh.S, st = S.style, T = sh.T, L = sh.L, D = DET.R, parts = new PartList();
  const box = () => new THREE.BoxGeometry(1, 1, 1);
  const front = sh.at(sh.zmax), back = sh.at(sh.zmin);
  // plates
  const pl = D['plate' + (CAR_TILE_ORDER.indexOf(type) % 4)];
  if (!st.bus) {
    parts.add(new THREE.BoxGeometry(1, 1, 1, 8, 1, 1), cmx(0, front.yb + 0.14, sh.zmax + 0.008, 0.5, 0.115, 0.012), null, (x, y, z, u, v) => [lerp(pl[0], pl[2], u), lerp(pl[1], pl[3], v)]);
    parts.add(new THREE.BoxGeometry(1, 1, 1, 8, 1, 1), cmx(0, back.yb + 0.21, sh.zmin - 0.008, 0.5, 0.115, 0.012, 0, Math.PI, 0), null, (x, y, z, u, v) => [lerp(pl[0], pl[2], u), lerp(pl[1], pl[3], v)]);
  } else {
    parts.add(box(), cmx(0, 0.72, sh.zmax + 0.01, 0.5, 0.115, 0.012), null, (x, y, z, u, v) => [lerp(pl[0], pl[2], u), lerp(pl[1], pl[3], v)]);
    parts.add(box(), cmx(0, 0.78, sh.zmin - 0.01, 0.5, 0.115, 0.012, 0, Math.PI, 0), null, (x, y, z, u, v) => [lerp(pl[0], pl[2], u), lerp(pl[1], pl[3], v)]);
    const rb = D.dBus;
    parts.add(new THREE.PlaneGeometry(1, 1), cmx(0, 2.53, sh.zmax + 0.012, 1.7, 0.36, 1), rb);
  }
  // wheel-well liners (block the view through the arch tunnel)
  for (const az of [sh.axF, sh.axR]) for (const s of [-1, 1]) {
    const g = new THREE.CircleGeometry(sh.ra - 0.005, 14, 0, Math.PI);
    parts.add(g, cmx(s * (sh.hw - 0.36 - (T.tw || 0.25) * 0.5), sh.wr, az, 1, 1, 1, 0, s * Math.PI / 2, 0, 'YXZ'), D.bed);
  }
  // mirror glass
  if (!st.bus) {
    const z = S.g[3] * L - (type === 'van' ? 0.12 : 0.2), s0 = sh.at(z), y = s0.belt + (type === 'supercar' ? 0.06 : 0.1);
    for (const s of [-1, 1]) parts.add(new THREE.CircleGeometry(1, 12), cmx(s * (s0.wg + 0.14), y, z - 0.048, 0.085, 0.05, 1, 0, Math.PI, 0), D.mirror);
  } else for (const s of [-1, 1]) parts.add(new THREE.PlaneGeometry(1, 1), cmx(s * (sh.hw + 0.27), 2.05, sh.zmax - 0.045, 0.12, 0.42, 1, 0, Math.PI, 0), D.mirror);
  // wipers
  if (!st.bus && S.g[3] - S.g[2] > 0.05) {
    const z = S.g[3] * L - 0.05, s0 = sh.at(z);
    for (const s of [-1, 1]) parts.add(box(), cmx(s * 0.27 + 0.05, s0.yt + 0.03, z, 0.55, 0.014, 0.025, 0, 0, s * 0.06), D.gloss);
  }
  // exhausts
  const ex = st.exhaust;
  if (ex) {
    const xs = ex === 'center' ? [-0.09, 0.09] : ex === 2 ? [-0.55, 0.55] : [-0.55];
    for (const x of xs) {
      const r = ex === 'center' ? 0.05 : 0.036;
      parts.add(new THREE.CylinderGeometry(r, r, 0.14, 10, 1, true), cmx(x, back.yb + 0.08, sh.zmin + 0.02, 1, 1, 1, Math.PI / 2, 0, 0), D.chrome);
      parts.add(new THREE.CircleGeometry(r * 0.85, 10), cmx(x, back.yb + 0.08, sh.zmin - 0.03, 1, 1, 1, 0, Math.PI, 0), D.gloss);
    }
  }
  // grille inserts
  if (st.grille === 'mesh' || st.grille === 'super') {
    parts.add(new THREE.PlaneGeometry(1, 1, 10, 2), cmx(0, front.yb + 0.11, sh.zmax + 0.006, st.grille === 'super' ? 0.56 : 0.68, 0.12, 1), D.mesh);
  }
  if (st.scoop) parts.add(new THREE.PlaneGeometry(1, 1), cmx(0, sh.at(0.3 * L).belt + sh.at(0.3 * L).crown + 0.03, 0.28 * L + 0.4, 0.34, 0.07, 1, -0.2, 0, 0), D.gloss);
  // roof rails
  if (st.rails) {
    const za = S.g[1] * L + 0.1, zb = S.g[2] * L - 0.05, s0 = sh.at((za + zb) / 2);
    for (const s of [-1, 1]) {
      parts.add(box(), cmx(s * (s0.rwe - 0.1), s0.yt + 0.06, (za + zb) / 2, 0.035, 0.03, zb - za), D.silver);
      for (const zz of [za + 0.05, zb - 0.05]) parts.add(box(), cmx(s * (s0.rwe - 0.1), s0.yt + 0.03, zz, 0.035, 0.05, 0.06), D.black);
    }
  }
  // supercar wing
  if (st.wing) {
    const z = sh.zmin + 0.28, s0 = sh.at(z), y = s0.belt + s0.crown + 0.26;
    const af = new THREE.Shape(); af.moveTo(-0.16, 0); af.quadraticCurveTo(0, 0.05, 0.16, 0.012); af.lineTo(0.16, -0.008); af.quadraticCurveTo(0, 0.01, -0.16, 0);
    const wg = new THREE.ExtrudeGeometry(af, { depth: 1.7, bevelEnabled: false, curveSegments: 6 }); wg.translate(0, 0, -0.85); wg.rotateY(Math.PI / 2);
    parts.add(wg, cmx(0, y, z, 1), D.carbon);
    for (const s of [-1, 1]) parts.add(box(), cmx(s * 0.45, y - 0.13, z + 0.02, 0.025, 0.27, 0.1, -0.15, 0, 0), D.carbon);
    for (const s of [-1, 1]) parts.add(box(), cmx(s * 0.85, y + 0.02, z, 0.012, 0.12, 0.34), D.carbon);
  }
  // pickup bed
  if (S.bed) {
    const z0 = S.bed[0] * L, z1 = S.bed[1] * L, zc = (z0 + z1) / 2, s0 = sh.at(zc), inner = s0.w - Math.min(0.065, (s0.belt - s0.yb) * 0.2), fy = s0.belt - 0.5;
    parts.add(new THREE.PlaneGeometry(1, 1), cmx(0, fy, zc, inner * 2, z1 - z0, 1, -Math.PI / 2, 0, 0), D.bed);
    for (const s of [-1, 1]) parts.add(new THREE.PlaneGeometry(1, 1), cmx(s * inner, (fy + s0.belt) / 2, zc, z1 - z0, s0.belt - fy, 1, 0, -s * Math.PI / 2, 0), D.bed);
    const sb = sh.at(z0 + 0.02);
    parts.add(new THREE.PlaneGeometry(1, 1), cmx(0, (fy + sb.belt) / 2, z0 + 0.03, inner * 2, sb.belt - fy, 1), D.bed);
    const gw = sh.at(S.g[0] * L + 0.01);
    parts.add(new THREE.PlaneGeometry(1, 1), cmx(0, gw.belt + 0.42, S.g[0] * L - 0.008, gw.rwe * 1.5, 0.36, 1, 0, Math.PI, 0), D.glass);
  }
  // liveries / decals
  const dz = (a, b) => [S.seams[a] * L, S.seams[b] * L];
  if (type === 'police') {
    const [za, zb] = [S.seams[2] * L + 0.12, S.seams[0] * L - 0.1];
    for (const s of [-1, 1]) sideDecal(parts, sh, za, zb, sh.at(0).belt - 0.205, sh.at(0).belt - 0.07, D.dPolice, s);
    // push bar
    parts.add(box(), cmx(0, front.yb + 0.34, sh.zmax + 0.1, 0.84, 0.05, 0.05), D.black);
    parts.add(box(), cmx(0, front.yb + 0.16, sh.zmax + 0.1, 0.84, 0.04, 0.05), D.black);
    for (const s of [-1, 1]) parts.add(box(), cmx(s * 0.3, front.yb + 0.25, sh.zmax + 0.07, 0.05, 0.26, 0.09), D.black);
  }
  if (type === 'taxi') { const [zb, za] = dz(0, 1); for (const s of [-1, 1]) sideDecal(parts, sh, za + 0.08, zb - 0.06, sh.at(0).belt - 0.4, sh.at(0).belt - 0.25, D.dTaxi, s); }
  if (type === 'van') for (const s of [-1, 1]) sideDecal(parts, sh, -0.42 * L, 0.06 * L, 1.15, 1.75, D.dVan, s, 10);
  if (type === 'supercar') for (const s of [-1, 1]) sideDecal(parts, sh, sh.axR + sh.ra + 0.05, sh.axF - sh.ra - 0.05, 0.3, 0.42, D.dSuper, s);
  if (st.bus) for (const s of [-1, 1]) sideDecal(parts, sh, -0.1 * L, 0.3 * L, 0.92, 1.18, D.dBus, s, 10);
  return parts;
}
// extras with their own materials: police light bar lenses, taxi sign
function buildExtras(type, sh) {
  const out = {}, S = sh.S, L = sh.L, zc = (S.g[1] + S.g[2]) / 2 * L, s0 = sh.at(zc), y = s0.yt + s0.crown;
  if (type === 'police') {
    const lens = (x) => { const g = new THREE.ExtrudeGeometry(roundRectShape(0.58, 0.11, 0.04), { depth: 0.24, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 2, curveSegments: 6 }); g.translate(x, y + 0.11, zc - 0.12); return g; };
    out.lbR = lens(0.31); out.lbB = lens(-0.31);
    const bp = new PartList();
    bp.add(new THREE.BoxGeometry(1.32, 0.05, 0.3), cmx(0, y + 0.045, zc, 1), DET.R.black);
    for (const s of [-1, 1]) bp.add(new THREE.BoxGeometry(0.05, 0.05, 0.05), cmx(s * 0.5, y + 0.015, zc, 1), DET.R.black);
    out.lbBase = bp;
  }
  if (type === 'taxi') {
    const g = new THREE.BoxGeometry(0.78, 0.24, 0.3, 1, 1, 1), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) { p.setX(i, p.getX(i) * 0.86); p.setZ(i, p.getZ(i) * 0.6); }
    g.computeVertexNormals(); g.translate(0, y + 0.14, zc - 0.05);
    out.taxi = g;
  }
  return out;
}

// ---------- assemble ----------
function buildCarGeo(type) {
  if (!CARSHAPE[type]) prepareCarShapes();
  const sh = CARSHAPE[type], T = sh.T, S = sh.S, L = sh.L, deform = carDeform(sh);
  const G = { type, sh };
  G.body = buildCarBody(type, sh, deform);
  G.detail = buildDetail(type, sh).build(deform);
  G.heads = buildLamps(sh, true).build(deform);
  G.tails = buildLamps(sh, false).build(deform);
  for (const g of [G.detail, G.heads, G.tails]) addDamageMorphs(g, sh, false);
  G.wheel = buildWheel(sh);
  const ex = buildExtras(type, sh);
  G.lbR = ex.lbR; G.lbB = ex.lbB; G.lbBase = ex.lbBase ? ex.lbBase.build() : null; G.taxi = ex.taxi;
  G.wf = sh.axF; G.wb = sh.axR; G.wx = sh.hw - 0.16 - ((T.tw || 0.25) - 0.25) * 0.5; G.top = T.H;
  const roof = sh.at((S.g[1] + S.g[2]) / 2 * L);
  G.roofY = roof.yt + roof.crown;
  G.ct = G.roofY - T.cabH;
  // driver eye (car frame): seated height, behind the windshield, left seat
  const ez = S.eye ? S.eye[2] : (S.style.bus ? sh.zmax - 1.25 : lerp(S.g[1], S.g[2], type === 'van' || type === 'pickup' ? 0.8 : 0.62) * L);
  const es = sh.at(ez), floor = es.yb + (S.style.bus ? 0.55 : 0.1);
  const seat = floor + (type === 'supercar' ? 0.16 : type === 'coupe' || type === 'muscle' ? 0.22 : type === 'suv' || type === 'pickup' || type === 'van' ? 0.36 : 0.27);
  const ey = Math.min(seat + 0.72, G.roofY - 0.13);
  const ex2 = S.style.bus ? sh.hw - 0.62 : Math.min(es.wg * 0.45, 0.42);
  G.eye = [ex2, ey, ez];
  G.seatY = seat; G.floorY = floor;
  return G;
}

// ---------- interior (first-person) ----------
const CARINT = {};
function buildInterior(type, G) {
  if (CARINT[type]) return CARINT[type];
  const sh = G.sh, S = sh.S, L = sh.L, D = DET.R, e = G.eye, parts = new PartList(), gp = new PartList(), bus = !!S.style.bus;
  const cowlZ = bus ? sh.zmax - 0.15 : S.g[3] * L, cs = sh.at(cowlZ - 0.05), wIn = (bus ? sh.hw - 0.08 : cs.wg - 0.03);
  const topY = bus ? 1.25 : cs.belt - 0.03, dashBack = e[2] + (bus ? 0.55 : 0.62);
  const dc = (r) => [lerp(r[0], r[2], 0.5), lerp(r[1], r[3], 0.5)];
  // dashboard: side profile extruded across the cabin
  const prof = new THREE.Shape();
  prof.moveTo(cowlZ, G.floorY + 0.12); prof.lineTo(cowlZ, topY); prof.quadraticCurveTo((cowlZ + dashBack) / 2, topY + 0.07, dashBack, topY + 0.03);
  prof.quadraticCurveTo(dashBack - 0.04, topY - 0.08, dashBack + 0.02, topY - 0.16); prof.lineTo(dashBack + 0.1, G.floorY + 0.42); prof.lineTo(dashBack - 0.2, G.floorY + 0.12);
  const dg = new THREE.ExtrudeGeometry(prof, { depth: wIn * 2, bevelEnabled: false, curveSegments: 6 });
  dg.rotateY(-Math.PI / 2); dg.translate(wIn, 0, 0);
  parts.add(dg, cmx(0, 0, 0, 1), dc(D.dash));
  // binnacle hood over the gauges
  const hb = new THREE.CylinderGeometry(0.2, 0.2, 0.18, 14, 1, true, -Math.PI / 2, Math.PI);
  parts.add(hb, cmx(e[0], topY + 0.02, dashBack - 0.06, 1, 0.45, 1, Math.PI / 2, 0, 0), dc(D.dash));
  // gauges (emissive mesh)
  const gy = topY - 0.015, gz = dashBack - 0.02, tilt = -0.32;
  const gauge = (x, reg) => gp.add(new THREE.CircleGeometry(0.074, 22), cmx(x, gy, gz, 1, 1, 1, tilt, Math.PI, 0, 'YXZ'), null, (px, py, pz, u, v) => [lerp(reg[0], reg[2], u), lerp(reg[1], reg[3], v)]);
  gauge(e[0] + 0.082, D.gTach); gauge(e[0] - 0.082, D.gSpeed);
  // centre screen, vents, console
  if (!bus) {
    gp.add(new THREE.PlaneGeometry(0.24, 0.15), cmx(0, topY - 0.06, dashBack + 0.0, 1, 1, 1, -0.2, Math.PI, 0, 'YXZ'), null, (px, py, pz, u, v) => [lerp(D.screen[0], D.screen[2], u), lerp(D.screen[1], D.screen[3], v)]);
    for (const x of [-0.1, 0.1, wIn - 0.12, -wIn + 0.12]) parts.add(new THREE.PlaneGeometry(0.12, 0.05), cmx(x, topY - 0.17, dashBack + 0.03, 1, 1, 1, 0, Math.PI, 0), D.vent);
    parts.add(new THREE.BoxGeometry(0.24, 0.2, 0.7), cmx(0, G.floorY + 0.12, dashBack - 0.15, 1, 1, 1, 0.25, 0, 0), dc(D.dash));
    parts.add(new THREE.BoxGeometry(0.22, 0.12, 0.6), cmx(0, G.seatY - 0.02, e[2] - 0.15, 1), dc(D.gloss));
  }
  // seats
  const seat = (x, z, w, bench) => {
    const cush = new THREE.ExtrudeGeometry(roundRectShape(w, 0.14, 0.05), { depth: 0.5, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, curveSegments: 4 });
    parts.add(cush, cmx(x, G.seatY - 0.07, z - 0.2, 1, 1, 1, -0.08, 0, 0), dc(D.leather));
    const back = new THREE.ExtrudeGeometry(roundRectShape(w, 0.66, 0.08), { depth: 0.12, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 2, curveSegments: 4 });
    parts.add(back, cmx(x, G.seatY + 0.3, z - 0.32, 1, 1, 1, -0.2, 0, 0), dc(D.leather));
    if (!bench) parts.add(new THREE.BoxGeometry(0.26, 0.16, 0.1), cmx(x, G.seatY + 0.73, z - 0.43, 1, 1, 1, -0.15, 0, 0), dc(D.leather));
  };
  if (bus) seat(e[0], e[2], 0.5, false);
  else {
    seat(e[0], e[2], 0.5, false); seat(-e[0], e[2], 0.5, false);
    if (type !== 'supercar' && type !== 'pickup') seat(0, e[2] - 0.95, cs.wg * 1.6, true);
  }
  // rear-view mirror, sun visors
  if (!bus) {
    const rz = S.g[2] * L - 0.08, rs = sh.at(rz);
    parts.add(new THREE.BoxGeometry(0.2, 0.055, 0.025), cmx(0, rs.yt - 0.1, rz - 0.04, 1, 1, 1, 0.1, 0, 0), dc(D.black));
    parts.add(new THREE.PlaneGeometry(0.18, 0.042), cmx(0, rs.yt - 0.1, rz - 0.054, 1, 1, 1, 0, Math.PI, 0), D.mirror);
    for (const s of [-1, 1]) parts.add(new THREE.BoxGeometry(0.34, 0.012, 0.16), cmx(s * e[0], rs.yt - 0.035, rz - 0.13, 1, 1, 1, 0.12, 0, 0), dc(D.fabric));
  }
  const I = { dash: parts.build(), gauges: gp.build() };
  // steering wheel: rim + spokes + hub, built around the column axis (+z toward the dash)
  const wp = new PartList();
  wp.add(new THREE.TorusGeometry(bus ? 0.23 : 0.175, 0.016, 8, 28), cmx(0, 0, 0, 1), dc(D.wheelgrip));
  for (const a of [0, Math.PI, -Math.PI / 2]) wp.add(new THREE.BoxGeometry(0.15, 0.035, 0.016), cmx(Math.cos(a) * 0.085, Math.sin(a) * 0.085, 0.01, 1, 1, 1, 0, 0, a), dc(D.black));
  wp.add(new THREE.CylinderGeometry(0.05, 0.055, 0.05, 14), cmx(0, 0, 0.02, 1, 1, 1, Math.PI / 2, 0, 0), dc(D.gloss));
  wp.add(new THREE.CylinderGeometry(0.025, 0.03, 0.3, 8), cmx(0, 0, 0.18, 1, 1, 1, Math.PI / 2, 0, 0), dc(D.black));
  I.wheel = wp.build();
  I.wheelPos = [e[0], e[1] - (bus ? 0.44 : 0.42), e[2] + (bus ? 0.48 : 0.4)];
  I.wheelTilt = bus ? 1.05 : 0.36;
  // needle: pivot at the origin, pointing +y
  const np = new PartList();
  np.add(new THREE.BoxGeometry(0.005, 0.058, 0.003), cmx(0, 0.026, 0, 1), dc(D.red));
  np.add(new THREE.CylinderGeometry(0.009, 0.009, 0.006, 10), cmx(0, 0, 0, 1, 1, 1, Math.PI / 2, 0, 0), dc(D.gloss));
  I.needle = np.build();
  I.tach = [e[0] + 0.082, gy, gz - 0.004]; I.speed = [e[0] - 0.082, gy, gz - 0.004]; I.tilt = tilt;
  CARINT[type] = I;
  return I;
}
