// ============================================================
//  City layout, static geometry and collision
// ============================================================
const CITY = { P: 80, RW: 16, N: 7, HALF: 280, SW: 6 };
const roadC = (i) => -CITY.HALF + i * CITY.P;
const blocks = [];
const buildings = [];
const bInst = [];
const SPOT = { shops: [], tokens: [], parking: [], antennas: [], lamps: [], wheel: null, lighthouse: null };
let lampPools = null;
let wheelGroup = null, lightBeam = null, fountainTop = null;

// ---------- collision grid ----------
const CG = { cell: 16, ox: -352, oz: -352, nx: 48, nz: 48, cells: [], stamp: 0 };
for (let i = 0; i < CG.nx * CG.nz; i++) CG.cells.push([]);
function cgAdd(c) {
  const ix0 = clamp(Math.floor((c.x0 - CG.ox) / CG.cell), 0, CG.nx - 1), ix1 = clamp(Math.floor((c.x1 - CG.ox) / CG.cell), 0, CG.nx - 1);
  const iz0 = clamp(Math.floor((c.z0 - CG.oz) / CG.cell), 0, CG.nz - 1), iz1 = clamp(Math.floor((c.z1 - CG.oz) / CG.cell), 0, CG.nz - 1);
  for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) CG.cells[ix * CG.nz + iz].push(c);
  c.stamp = 0;
}
function cgRemove(c) {
  for (const cell of CG.cells) { const k = cell.indexOf(c); if (k >= 0) cell.splice(k, 1); }
}
function addBoxCollider(x0, x1, z0, z1, h, tag) { const c = { t: 0, x0, x1, z0, z1, h: h || 100, tag: tag || 'p' }; cgAdd(c); return c; }
function addCircleCollider(x, z, r, h, tag) { const c = { t: 1, x, z, r, x0: x - r, x1: x + r, z0: z - r, z1: z + r, h: h || 10, tag: tag || 'p' }; cgAdd(c); return c; }
const _q = [];
function cgQuery(x0, x1, z0, z1) {
  CG.stamp++; _q.length = 0;
  const ix0 = clamp(Math.floor((x0 - CG.ox) / CG.cell), 0, CG.nx - 1), ix1 = clamp(Math.floor((x1 - CG.ox) / CG.cell), 0, CG.nx - 1);
  const iz0 = clamp(Math.floor((z0 - CG.oz) / CG.cell), 0, CG.nz - 1), iz1 = clamp(Math.floor((z1 - CG.oz) / CG.cell), 0, CG.nz - 1);
  for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
    const cell = CG.cells[ix * CG.nz + iz];
    for (let k = 0; k < cell.length; k++) { const c = cell[k]; if (c.stamp !== CG.stamp) { c.stamp = CG.stamp; _q.push(c); } }
  }
  return _q;
}
function onPier(x, z) { return x > 295 && x < 385 && z > -6 && z < 6; }
// world limits: island edges, beach shoreline, pier
function eastLimit(z) { return (z > -5.9 && z < 5.9) ? 383 : 305; }
const _hit = { x: 0, z: 0, nx: 0, nz: 0, hit: false, depth: 0 };
function collideCircle(x, z, r, y) {
  let hit = false, nxs = 0, nzs = 0, maxD = 0;
  const list = cgQuery(x - r, x + r, z - r, z + r);
  for (let k = 0; k < list.length; k++) {
    const c = list[k];
    if (y !== undefined && y > c.h) continue;
    if (c.t === 0) {
      const px = clamp(x, c.x0, c.x1), pz = clamp(z, c.z0, c.z1);
      const dx = x - px, dz = z - pz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      let nx, nz, pen;
      if (d2 > 1e-10) { const d = Math.sqrt(d2); nx = dx / d; nz = dz / d; pen = r - d; }
      else {
        const l = x - c.x0, rt = c.x1 - x, b = z - c.z0, t = c.z1 - z, m = Math.min(l, rt, b, t);
        if (m === l) { nx = -1; nz = 0; pen = l + r; } else if (m === rt) { nx = 1; nz = 0; pen = rt + r; }
        else if (m === b) { nx = 0; nz = -1; pen = b + r; } else { nx = 0; nz = 1; pen = t + r; }
      }
      x += nx * pen; z += nz * pen; nxs += nx; nzs += nz; hit = true; if (pen > maxD) maxD = pen;
    } else {
      const dx = x - c.x, dz = z - c.z, rs = r + c.r, d2 = dx * dx + dz * dz;
      if (d2 >= rs * rs) continue;
      const d = Math.sqrt(d2) || 1e-4, nx = dx / d, nz = dz / d, pen = rs - d;
      x += nx * pen; z += nz * pen; nxs += nx; nzs += nz; hit = true; if (pen > maxD) maxD = pen;
    }
  }
  // island bounds
  const ex = eastLimit(z) - r;
  if (x > ex) { if (x - ex > maxD) maxD = x - ex; x = ex; nxs -= 1; hit = true; }
  if (x < -299 + r) { maxD = Math.max(maxD, -299 + r - x); x = -299 + r; nxs += 1; hit = true; }
  if (z > 299 - r) { maxD = Math.max(maxD, z - 299 + r); z = 299 - r; nzs -= 1; hit = true; }
  if (z < -299 + r) { maxD = Math.max(maxD, -299 + r - z); z = -299 + r; nzs += 1; hit = true; }
  _hit.x = x; _hit.z = z; _hit.hit = hit;
  const nl = Math.hypot(nxs, nzs) || 1; _hit.nx = nxs / nl; _hit.nz = nzs / nl; _hit.depth = maxD;
  return _hit;
}
function pointInBuilding(x, z) {
  const list = cgQuery(x, x, z, z);
  for (let k = 0; k < list.length; k++) { const c = list[k]; if (c.t === 0 && c.tag === 'b' && x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1) return true; }
  return false;
}
function losClear(ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz), n = Math.ceil(L / 5);
  for (let i = 1; i < n; i++) { const t = i / n; if (pointInBuilding(ax + dx * t, az + dz * t)) return false; }
  return true;
}
function rayBoxes(ox, oy, oz, dx, dy, dz, maxT) {
  const ex = ox + dx * maxT, ez = oz + dz * maxT;
  const list = cgQuery(Math.min(ox, ex), Math.max(ox, ex), Math.min(oz, ez), Math.max(oz, ez));
  let best = maxT;
  for (let k = 0; k < list.length; k++) {
    const c = list[k]; if (c.t !== 0 || c.h < 2) continue;
    let t0 = 0, t1 = best;
    if (Math.abs(dx) < 1e-6) { if (ox < c.x0 || ox > c.x1) continue; } else { let a = (c.x0 - ox) / dx, b = (c.x1 - ox) / dx; if (a > b) { const s = a; a = b; b = s; } t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) continue; }
    if (Math.abs(dz) < 1e-6) { if (oz < c.z0 || oz > c.z1) continue; } else { let a = (c.z0 - oz) / dz, b = (c.z1 - oz) / dz; if (a > b) { const s = a; a = b; b = s; } t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) continue; }
    if (Math.abs(dy) < 1e-6) { if (oy < 0 || oy > c.h) continue; } else { let a = (0 - oy) / dy, b = (c.h - oy) / dy; if (a > b) { const s = a; a = b; b = s; } t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) continue; }
    if (t0 < best) best = t0;
  }
  return best;
}

// ---------- ground height ----------
function inBlockSlab(x, z) {
  const P = CITY.P, h = CITY.RW / 2;
  const lx = ((x + CITY.HALF) % P + P) % P, lz = ((z + CITY.HALF) % P + P) % P;
  return lx > h && lx < P - h && lz > h && lz < P - h && Math.abs(x) < CITY.HALF && Math.abs(z) < CITY.HALF;
}
// Extra walkable/drivable surfaces (creative ramps, platforms): each hook returns a height or -Infinity.
const GROUND_HOOKS = [];
function groundH(x, z) {
  let g = groundBase(x, z);
  for (let i = 0; i < GROUND_HOOKS.length; i++) { const h = GROUND_HOOKS[i](x, z); if (h > g) g = h; }
  return g;
}
function groundBase(x, z) {
  if (onPier(x, z)) return 0.3;
  if (x > 296) return Math.max(-2.2, 0.18 - (x - 296) * 0.052);
  if (Math.abs(x) > 288 || Math.abs(z) > 288) return 0.18;
  return inBlockSlab(x, z) ? 0.18 : 0;
}

// ---------- road graph ----------
const NODES = CITY.N + 1;
function nodePos(i, j) { return [roadC(i), roadC(j)]; }
function nodeNeighbors(i, j) {
  const r = [];
  if (i > 0) r.push([i - 1, j]); if (i < CITY.N) r.push([i + 1, j]);
  if (j > 0) r.push([i, j - 1]); if (j < CITY.N) r.push([i, j + 1]);
  return r;
}
function nearestNode(x, z) { return [clamp(Math.round((x + CITY.HALF) / CITY.P), 0, CITY.N), clamp(Math.round((z + CITY.HALF) / CITY.P), 0, CITY.N)]; }
const LANE = 3.9, STOP = CITY.RW / 2 + 2.5;
function laneSeg(a, b) {
  const ax = roadC(a[0]), az = roadC(a[1]), bx = roadC(b[0]), bz = roadC(b[1]);
  const dx = Math.sign(bx - ax), dz = Math.sign(bz - az), rx = -dz, rz = dx;
  return { a, b, dx, dz, rx, rz, sx: ax + dx * STOP + rx * LANE, sz: az + dz * STOP + rz * LANE, ex: bx - dx * STOP + rx * LANE, ez: bz - dz * STOP + rz * LANE, len: Math.abs(bx - ax) + Math.abs(bz - az) - 2 * STOP };
}

// ---------- geometry helpers ----------
function mergeGeos(list) {
  let total = 0; const gs = [];
  for (const g0 of list) { const g = g0.index ? g0.toNonIndexed() : g0; gs.push(g); total += g.attributes.position.count; }
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  let o = 0;
  for (const g of gs) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += n;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  m.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  m.computeBoundingSphere();
  return m;
}
function worldUV(g, s) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ny = Math.abs(n.getY(i)), nx = Math.abs(n.getX(i));
    if (ny > 0.5) uv.setXY(i, p.getX(i) / s, p.getZ(i) / s);
    else if (nx > 0.5) uv.setXY(i, p.getZ(i) / s, p.getY(i) / s);
    else uv.setXY(i, p.getX(i) / s, p.getY(i) / s);
  }
  uv.needsUpdate = true;
  return g;
}
function boxAt(x0, x1, y0, y1, z0, z1) { const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return g; }
function quadH(x0, x1, z0, z1, y) { const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, y, (z0 + z1) / 2); return g; }
class QuadBatch {
  constructor() { this.p = []; }
  add(x0, x1, z0, z1, y) { this.p.push(x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0); }
  geo() {
    const g = new THREE.BufferGeometry(), a = new Float32Array(this.p), n = new Float32Array(a.length);
    for (let i = 1; i < n.length; i += 3) n[i] = 1;
    g.setAttribute('position', new THREE.BufferAttribute(a, 3)); g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
    g.computeBoundingSphere(); return g;
  }
}
const _m4 = new THREE.Matrix4(), _q4 = new THREE.Quaternion(), _p4 = new V3(), _s4 = new V3(), _e4 = new THREE.Euler();
function setInst(mesh, i, x, y, z, ry, sx, sy, sz, rx, rz) {
  _e4.set(rx || 0, ry || 0, rz || 0); _q4.setFromEuler(_e4); _p4.set(x, y, z); _s4.set(sx, sy, sz);
  _m4.compose(_p4, _q4, _s4); mesh.setMatrixAt(i, _m4);
}

// ---------- palettes ----------
const DT_COLORS = ['#8fa3b8', '#6f8296', '#b6c2cc', '#5d7387', '#a89c8c', '#7d8f9c', '#c2c8cc', '#506070'];
const MID_COLORS = ['#d9c3a5', '#c98b6b', '#e2d5c0', '#b9b2a8', '#e0a989', '#9fb1a8', '#d7c9b8', '#b98d76'];
const LOW_COLORS = ['#f2c6c2', '#bfe3d0', '#f7e3a8', '#c9d7f2', '#f3d1e8', '#fff1d6', '#ffd0a8', '#d6f0f0'];
const COAST_COLORS = ['#f7b7c8', '#a8e6cf', '#ffd3a5', '#cdb4f0', '#9fe3e8', '#fff3e0', '#ffb3a7'];
const NEON_HUES = [0.93, 0.5, 0.07, 0.78, 0.33, 0.58];

function blockType(bi, bj) {
  const k = bi + ',' + bj;
  if (k === '3,3') return 'plaza';
  if (k === '1,1' || k === '4,1' || k === '1,5') return 'park';
  if (k === '5,4') return 'parking';
  if (k === '1,3' || k === '4,5') return 'shop';
  if (bi === CITY.N - 1) return 'coast';
  const cx = (roadC(bi) + roadC(bi + 1)) / 2, cz = (roadC(bj) + roadC(bj + 1)) / 2;
  const d = Math.max(Math.abs(cx), Math.abs(cz - 10));
  if (d < 130) return 'downtown';
  if (d < 210) return 'mid';
  return 'low';
}
function addBuilding(x0, x1, z0, z1, h, color, style, hue, y0) {
  y0 = y0 || 0;
  const b = { x0, x1, z0, z1, y0, h, top: y0 + h, color, style, seed: wr(), lit: wrr(0.28, 0.62), hue: hue === undefined ? wpick(NEON_HUES) : hue, roof: true };
  bInst.push(b);
  if (y0 === 0) { buildings.push(b); addBoxCollider(x0, x1, z0, z1, h, 'b'); }
  return b;
}
function splitLot(L, alongX, gap) {
  const [x0, x1, z0, z1] = L;
  if (alongX) { const m = lerp(x0, x1, wrr(0.38, 0.62)); return [[x0, m - gap / 2, z0, z1], [m + gap / 2, x1, z0, z1]]; }
  const m = lerp(z0, z1, wrr(0.38, 0.62)); return [[x0, x1, z0, m - gap / 2], [x0, x1, m + gap / 2, z1]];
}
function genBlock(b, palms, trees) {
  const SW = CITY.SW;
  const L0 = [b.x0 + SW, b.x1 - SW, b.z0 + SW, b.z1 - SW];
  switch (b.type) {
    case 'downtown': {
      const lots = wr() < 0.4 ? [L0] : splitLot(L0, wr() < 0.5, 4);
      for (const L of lots) {
        const s = wrr(0, 2.2), d = Math.hypot(b.cx, b.cz - 10);
        const h = wrr(38, 62) + Math.max(0, 1 - d / 150) * wrr(30, 85);
        const style = h > 62 ? 2 : (wr() < 0.5 ? 0 : 1);
        const color = wpick(DT_COLORS);
        const setback = style === 2 && wr() < 0.7;
        const base = addBuilding(L[0] + s, L[1] - s, L[2] + s, L[3] - s, setback ? h * wrr(0.45, 0.68) : h, color, style);
        if (setback) {
          base.roof = false;
          const ins = Math.min(base.x1 - base.x0, base.z1 - base.z0) * wrr(0.13, 0.24);
          addBuilding(base.x0 + ins, base.x1 - ins, base.z0 + ins, base.z1 - ins, h - base.h, color, style, base.hue, base.h);
        }
      }
      break;
    }
    case 'mid': {
      let lots = splitLot(L0, wr() < 0.5, 3);
      if (wr() < 0.7) lots = lots.flatMap((L) => splitLot(L, (L[1] - L[0]) > (L[3] - L[2]), 3));
      for (const L of lots) addBuilding(L[0], L[1], L[2], L[3], wrr(14, 40), wpick(MID_COLORS), wr() < 0.55 ? 0 : 1);
      break;
    }
    case 'low': {
      const nx = wr() < 0.5 ? 2 : 3, nz = 5 - nx;
      const w = (L0[1] - L0[0] - (nx - 1) * 2.5) / nx, d = (L0[3] - L0[2] - (nz - 1) * 2.5) / nz;
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        if (i > 0 && i < nx - 1 && j > 0 && j < nz - 1) continue;
        const x0 = L0[0] + i * (w + 2.5), z0 = L0[2] + j * (d + 2.5);
        addBuilding(x0, x0 + w, z0, z0 + d, wrr(6, 14), wpick(LOW_COLORS), wr() < 0.35 ? 3 : 0);
      }
      break;
    }
    case 'coast': {
      const n = wr() < 0.5 ? 2 : 3, gap = 4, d = (L0[3] - L0[2] - (n - 1) * gap) / n;
      for (let j = 0; j < n; j++) {
        const z0 = L0[2] + j * (d + gap);
        addBuilding(L0[0] + wrr(0, 4), L0[1], z0, z0 + d, wrr(14, 30), wpick(COAST_COLORS), 3);
      }
      for (let z = b.z0 + 6; z < b.z1 - 4; z += 14) palms.push([b.x1 - 2.6, z + wrr(-1, 1), wrr(0.85, 1.15)]);
      break;
    }
    case 'park': {
      for (let i = 0; i < 16; i++) {
        const x = wrr(L0[0] + 3, L0[1] - 3), z = wrr(L0[2] + 3, L0[3] - 3);
        if (Math.abs(x - b.cx) < 3 || Math.abs(z - b.cz) < 3) continue;
        if (wr() < 0.3) palms.push([x, z, wrr(0.8, 1.1)]); else trees.push([x, z, wrr(0.8, 1.3)]);
      }
      break;
    }
    case 'plaza': {
      for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; palms.push([b.cx + Math.cos(a) * 19, b.cz + Math.sin(a) * 19, wrr(0.9, 1.15)]); }
      for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + Math.PI / 4; palms.push([b.cx + Math.cos(a) * 27, b.cz + Math.sin(a) * 27, 1.1]); }
      break;
    }
    case 'parking': {
      const g = addBuilding(L0[0], L0[0] + 16, L0[3] - 13, L0[3], 6.5, '#c9b79c', 0, 0.93);
      g.lit = 0.1;
      SPOT.garageBld = g;
      SPOT.garage = { x: g.x1 + 5, z: (g.z0 + g.z1) / 2 };
      for (let r = 0; r < 2; r++) for (let k = 0; k < 6; k++) {
        const x = L0[0] + 22 + k * 4.6, z = L0[2] + 6 + r * 17;
        SPOT.parking.push({ x, z, h: r ? Math.PI : 0 });
      }
      break;
    }
    case 'shop': {
      const g = addBuilding(L0[0], L0[1], (L0[2] + L0[3]) / 2 + 2, L0[3], 7, '#e9e2d6', 0, 0.55);
      g.lit = 0.2;
      SPOT.shops.push({ x: (L0[0] + L0[1]) / 2, z: (L0[2] + L0[3]) / 2 - 8, bld: g });
      break;
    }
    default: break;
  }
}

// ---------- building material (procedural facades) ----------
let bldMat = null;
function makeBuildingMaterial() {
  bldMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.84, metalness: 0.0 });
  bldMat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = bldU.uNight;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aBld;
varying vec3 vWP; varying vec3 vWN; varying vec4 vBld; varying float vTop; varying float vBase;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
{
  vec4 bw = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
  vWP = bw.xyz;
  vWN = normalize(mat3(modelMatrix) * (mat3(instanceMatrix) * objectNormal));
  vBld = aBld; vBase = instanceMatrix[3].y; vTop = instanceMatrix[3].y + length(instanceMatrix[1].xyz);
}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uNight;
varying vec3 vWP; varying vec3 vWN; varying vec4 vBld; varying float vTop; varying float vBase;
float bHash(vec2 p){ p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }
float bBox(vec2 f, vec2 a, vec2 b, vec2 w){ vec2 s = smoothstep(a - w, a + w, f) * (1.0 - smoothstep(b - w, b + w, f)); return s.x * s.y; }
vec3 bHsv(float h){ return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float wm = 0.0; vec3 wEm = vec3(0.0); float wSt = vBld.x; float wR = 0.1;
{
  float isRoof = step(0.6, vWN.y);
  float side = 1.0 - isRoof;
  vec2 td = vec2(-vWN.z, vWN.x);
  float u = dot(vWP.xz, td) + vBld.y * 37.0;
  float v = vWP.y;
  float st = vBld.x;
  vec2 sz = st < 0.5 ? vec2(2.9, 3.4) : (st < 1.5 ? vec2(4.2, 3.4) : (st < 2.5 ? vec2(1.9, 3.7) : vec2(5.0, 3.2)));
  vec2 cl = vec2(u, v - vBase) / sz;
  vec2 id = floor(cl); vec2 f = fract(cl);
  vec2 fw = fwidth(cl);
  vec2 aw = max(fw * 0.7, vec2(0.012));
  if (st < 0.5) wm = bBox(f, vec2(0.2, 0.28), vec2(0.8, 0.86), aw);
  else if (st < 1.5) wm = bBox(f, vec2(0.03, 0.3), vec2(0.97, 0.82), aw);
  else if (st < 2.5) wm = bBox(f, vec2(0.05, 0.07), vec2(0.95, 0.96), aw);
  else wm = bBox(f, vec2(0.06, 0.34), vec2(0.94, 0.8), aw);
  float gnd = step(vBase, 0.5);
  float zone = side * step(vBase + mix(0.6, 4.2, gnd), v) * step(v, vTop - 1.1);
  float fade = max(smoothstep(0.1, 0.3, max(fw.x, fw.y)), smoothstep(220.0, 560.0, length(vWP - cameraPosition)));
  float cov = st < 0.5 ? 0.33 : (st < 1.5 ? 0.48 : (st < 2.5 ? 0.82 : 0.4));
  wm = mix(wm, cov, fade) * zone;
  float h1 = bHash(id + vBld.y * 113.0);
  float h2 = bHash(id.yx * 1.7 + vBld.y * 57.0 + 3.1);
  vec3 glass = (st > 1.5 && st < 2.5) ? vec3(0.34, 0.44, 0.55) : vec3(0.11, 0.14, 0.18);
  glass *= 0.82 + 0.3 * mix(h2, 0.5, fade);
  wR = 0.05 + 0.14 * mix(h2, 0.5, fade);
  vec3 wall = diffuseColor.rgb;
  wall *= 1.0 - 0.09 * step(0.92, f.y) * side * (1.0 - fade) * step(st, 1.5);
  wall *= mix(0.6, 1.0, smoothstep(0.0, 7.0, v));
  wall = mix(wall, wall * 0.45 + vec3(0.06), isRoof);
  float shop = side * gnd * step(0.3, v) * step(v, 3.4);
  float sf = bBox(vec2(fract(u / 6.0), v / 3.5), vec2(0.08, 0.08), vec2(0.92, 0.84), max(fwidth(vec2(u / 6.0, v / 3.5)) * 0.7, vec2(0.01))) * shop;
  float awn = side * gnd * step(3.45, v) * step(v, 3.9) * step(0.5, fract(u / 1.2));
  diffuseColor.rgb = mix(wall, glass, max(wm, sf));
  diffuseColor.rgb = mix(diffuseColor.rgb, bHsv(vBld.w) * 0.55 + 0.25, awn * step(2.5, st));
  float lit = mix(step(1.0 - vBld.z, h1), vBld.z, fade);
  vec3 warm = mix(vec3(1.0, 0.66, 0.36), vec3(0.7, 0.83, 1.0), mix(step(0.74, h2), 0.26, fade));
  float flick = mix(0.6 + 0.4 * h2, 0.8, fade);
  wEm = warm * wm * lit * flick * 1.45 * uNight;
  wEm += mix(vec3(1.0, 0.78, 0.5), bHsv(vBld.w), 0.5) * sf * (0.45 + 0.35 * h2) * uNight;
  if (st > 2.5) {
    float nb = side * step(vTop - 2.4, v) * step(v, vTop - 1.75);
    float nv = side * step(abs(fract(u / 13.0) - 0.5), 0.012) * step(vBase + 4.0, v) * step(v, vTop - 2.4);
    float neon = max(nb, nv);
    diffuseColor.rgb = mix(diffuseColor.rgb, bHsv(vBld.w) * 0.75, neon);
    wEm += bHsv(vBld.w) * neon * (0.2 + 2.8 * uNight);
  }
}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, wR, wm);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
metalnessFactor = mix(metalnessFactor, (wSt > 1.5 && wSt < 2.5) ? 0.85 : 0.4, wm);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += wEm;`);
  };
}

// ---------- build ----------
const MATS = {};
async function buildCity(progress) {
  const P = CITY.P, RW = CITY.RW, HW = RW / 2;
  const palms = [], trees = [];
  for (let bi = 0; bi < CITY.N; bi++) for (let bj = 0; bj < CITY.N; bj++) {
    const x0 = roadC(bi) + HW, x1 = roadC(bi + 1) - HW, z0 = roadC(bj) + HW, z1 = roadC(bj + 1) - HW;
    blocks.push({ bi, bj, x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, type: blockType(bi, bj) });
  }
  blocks.forEach((b) => genBlock(b, palms, trees));
  await progress(0.25, 'Кварталы');

  // --- ground, sidewalks, grass, beach, walls ---
  MATS.asphalt = new THREE.MeshStandardMaterial({ map: TEX.asphalt, roughness: 0.92, metalness: 0 });
  MATS.side = new THREE.MeshStandardMaterial({ map: TEX.sidewalk, roughness: 0.88 });
  MATS.grass = new THREE.MeshStandardMaterial({ map: TEX.grass, roughness: 0.95 });
  MATS.sand = new THREE.MeshStandardMaterial({ map: TEX.sand, roughness: 0.96 });
  MATS.wood = new THREE.MeshStandardMaterial({ map: TEX.wood, roughness: 0.8 });
  MATS.concrete = new THREE.MeshStandardMaterial({ color: 0x9c968c, roughness: 0.9 });
  MATS.white = new THREE.MeshStandardMaterial({ color: 0xf0eee8, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  MATS.yellow = new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  MATS.prop = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0.1 });
  MATS.metal = new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: 0.45, metalness: 0.7 });
  MATS.lampHead = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: new THREE.Color('#ffd7a0'), emissiveIntensity: 0, roughness: 0.4 });

  const ground = new THREE.PlaneGeometry(600, 600, 1, 1); ground.rotateX(-Math.PI / 2);
  worldUV(ground, 9);
  const parkingQuads = [];
  const slabs = [], grass = [];
  const SH = 0.18;
  for (const b of blocks) {
    slabs.push(boxAt(b.x0, b.x1, -0.05, SH, b.z0, b.z1));
    const L0 = [b.x0 + CITY.SW, b.x1 - CITY.SW, b.z0 + CITY.SW, b.z1 - CITY.SW];
    if (b.type === 'park') {
      grass.push(quadH(L0[0], L0[1], L0[2], L0[3], SH + 0.005));
      slabs.push(boxAt(b.cx - 1.6, b.cx + 1.6, SH, SH + 0.01, L0[2], L0[3]));
      slabs.push(boxAt(L0[0], L0[1], SH, SH + 0.01, b.cz - 1.6, b.cz + 1.6));
    }
    if (b.type === 'parking' || b.type === 'shop') parkingQuads.push(quadH(L0[0], L0[1], L0[2], L0[3], SH + 0.006));
  }
  slabs.push(boxAt(-300, -288, -0.05, SH, -300, 300));
  slabs.push(boxAt(288, 296, -0.05, SH, -300, 300));
  slabs.push(boxAt(-288, 288, -0.05, SH, 288, 300));
  slabs.push(boxAt(-288, 288, -0.05, SH, -300, -288));
  const slabGeo = worldUV(mergeGeos(slabs), 4);
  const slabMesh = new THREE.Mesh(slabGeo, MATS.side); slabMesh.receiveShadow = true; scene.add(slabMesh);
  const groundMesh = new THREE.Mesh(mergeGeos([ground, ...parkingQuads.map((g) => g)]), MATS.asphalt);
  worldUV(groundMesh.geometry, 9);
  groundMesh.receiveShadow = true; scene.add(groundMesh);
  if (grass.length) { const gm = new THREE.Mesh(worldUV(mergeGeos(grass), 5), MATS.grass); gm.receiveShadow = true; scene.add(gm); }
  // beach
  const beach = new THREE.PlaneGeometry(70, 600, 28, 1); beach.rotateX(-Math.PI / 2); beach.translate(331, 0, 0);
  { const p = beach.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, groundH(p.getX(i), 100)); beach.computeVertexNormals(); }
  worldUV(beach, 7);
  const beachMesh = new THREE.Mesh(beach, MATS.sand); beachMesh.receiveShadow = true; scene.add(beachMesh);
  // sea walls
  const walls = [boxAt(-303, -299.9, -6, SH, -303, 303), boxAt(-303, 312, -6, SH, 299.9, 303), boxAt(-303, 312, -6, SH, -303, -299.9)];
  const wallMesh = new THREE.Mesh(worldUV(mergeGeos(walls), 4), MATS.concrete); scene.add(wallMesh);
  await progress(0.35, 'Дороги');

  // --- road markings ---
  const yel = new QuadBatch(), wht = new QuadBatch();
  const Y = 0.02;
  for (let i = 0; i <= CITY.N; i++) {
    const c = roadC(i);
    for (let j = 0; j < CITY.N; j++) {
      const s0 = roadC(j) + HW + 4.4, s1 = roadC(j + 1) - HW - 4.4;
      // vertical road (x = c)
      yel.add(c - 0.32, c - 0.16, s0, s1, Y); yel.add(c + 0.16, c + 0.32, s0, s1, Y);
      wht.add(c - HW + 0.5, c - HW + 0.65, s0, s1, Y); wht.add(c + HW - 0.65, c + HW - 0.5, s0, s1, Y);
      // horizontal road (z = c)
      yel.add(s0, s1, c - 0.32, c - 0.16, Y); yel.add(s0, s1, c + 0.16, c + 0.32, Y);
      wht.add(s0, s1, c - HW + 0.5, c - HW + 0.65, Y); wht.add(s0, s1, c + HW - 0.65, c + HW - 0.5, Y);
    }
    for (let j = 0; j <= CITY.N; j++) {
      const x = roadC(i), z = roadC(j);
      const nb = nodeNeighbors(i, j);
      for (const [ni, nj] of nb) {
        const dx = Math.sign(ni - i), dz = Math.sign(nj - j);
        const d0 = HW + 0.8, d1 = HW + 4.0;
        for (let k = -6.6; k <= 6.6; k += 1.2) {
          if (dx !== 0) wht.add(x + dx * (dx > 0 ? d0 : d1), x + dx * (dx > 0 ? d1 : d0), z + k - 0.3, z + k + 0.3, Y);
          else wht.add(x + k - 0.3, x + k + 0.3, z + dz * (dz > 0 ? d0 : d1), z + dz * (dz > 0 ? d1 : d0), Y);
        }
      }
    }
  }
  // parking bay lines
  for (const s of SPOT.parking) { wht.add(s.x - 2.3, s.x - 2.15, s.z - 2.8, s.z + 2.8, 0.2); wht.add(s.x + 2.15, s.x + 2.3, s.z - 2.8, s.z + 2.8, 0.2); }
  scene.add(new THREE.Mesh(yel.geo(), MATS.yellow));
  const wm = new THREE.Mesh(wht.geo(), MATS.white); wm.receiveShadow = true; scene.add(wm);
  await progress(0.45, 'Небоскрёбы');

  // --- buildings (one instanced draw call) ---
  makeBuildingMaterial();
  const bGeo = new THREE.BoxGeometry(1, 1, 1); bGeo.translate(0, 0.5, 0);
  const bMesh = new THREE.InstancedMesh(bGeo, bldMat, bInst.length);
  const aBld = new Float32Array(bInst.length * 4);
  const cTmp = new THREE.Color();
  bInst.forEach((b, i) => {
    setInst(bMesh, i, (b.x0 + b.x1) / 2, b.y0, (b.z0 + b.z1) / 2, 0, b.x1 - b.x0, b.h, b.z1 - b.z0);
    cTmp.set(b.color); bMesh.setColorAt(i, cTmp);
    aBld[i * 4] = b.style; aBld[i * 4 + 1] = b.seed; aBld[i * 4 + 2] = b.lit; aBld[i * 4 + 3] = b.hue;
  });
  bGeo.setAttribute('aBld', new THREE.InstancedBufferAttribute(aBld, 4));
  bMesh.castShadow = true; bMesh.receiveShadow = true;
  bMesh.instanceMatrix.needsUpdate = true; if (bMesh.instanceColor) bMesh.instanceColor.needsUpdate = true;
  scene.add(bMesh);

  // --- rooftop props, parapets, antennas ---
  const props = [];
  for (const b of bInst) {
    if (!b.roof) continue;
    const t = b.top, w = b.x1 - b.x0, d = b.z1 - b.z0, pc = new THREE.Color(b.color).multiplyScalar(0.85);
    props.push({ x: (b.x0 + b.x1) / 2, y: t, z: b.z0 + 0.2, sx: w, sy: 0.9, sz: 0.4, c: pc });
    props.push({ x: (b.x0 + b.x1) / 2, y: t, z: b.z1 - 0.2, sx: w, sy: 0.9, sz: 0.4, c: pc });
    props.push({ x: b.x0 + 0.2, y: t, z: (b.z0 + b.z1) / 2, sx: 0.4, sy: 0.9, sz: d - 0.8, c: pc });
    props.push({ x: b.x1 - 0.2, y: t, z: (b.z0 + b.z1) / 2, sx: 0.4, sy: 0.9, sz: d - 0.8, c: pc });
    const n = 1 + Math.floor(wr() * 3);
    for (let k = 0; k < n; k++) {
      const sx = wrr(1.4, Math.min(4, w * 0.3)), sz = wrr(1.4, Math.min(4, d * 0.3));
      props.push({ x: wrr(b.x0 + 2 + sx / 2, b.x1 - 2 - sx / 2), y: t, z: wrr(b.z0 + 2 + sz / 2, b.z1 - 2 - sz / 2), sx, sy: wrr(0.9, 2.2), sz, c: new THREE.Color(0xb8bcc2) });
    }
    if (t > 70) {
      const ax = (b.x0 + b.x1) / 2 + wrr(-2, 2), az = (b.z0 + b.z1) / 2 + wrr(-2, 2), ah = wrr(7, 14);
      props.push({ x: ax, y: t, z: az, sx: 0.35, sy: ah, sz: 0.35, c: new THREE.Color(0x777b82) });
      SPOT.antennas.push([ax, t + ah + 0.2, az]);
    }
  }
  const pGeo = new THREE.BoxGeometry(1, 1, 1); pGeo.translate(0, 0.5, 0);
  const pMesh = new THREE.InstancedMesh(pGeo, MATS.prop, props.length);
  props.forEach((p, i) => { setInst(pMesh, i, p.x, p.y, p.z, 0, p.sx, p.sy, p.sz); pMesh.setColorAt(i, p.c); });
  pMesh.castShadow = true; pMesh.receiveShadow = true; scene.add(pMesh);
  await progress(0.55, 'Неон');

  // --- neon signs & billboards ---
  const signSets = TEX.signs.map(() => []);
  for (const b of buildings) {
    if (b.h > 32 || wr() > 0.55) continue;
    const blk = blocks.find((k) => b.x0 >= k.x0 - 0.1 && b.x1 <= k.x1 + 0.1 && b.z0 >= k.z0 - 0.1 && b.z1 <= k.z1 + 0.1);
    if (!blk || (blk.type !== 'low' && blk.type !== 'coast' && blk.type !== 'mid')) continue;
    const y = Math.min(b.top - 1.6, wrr(4.8, 8.5)); if (y < 4.5) continue;
    const si = Math.floor(wr() * TEX.signs.length);
    const g = new THREE.PlaneGeometry(5.2, 1.3);
    let ok = true;
    if (b.x0 - blk.x0 < 8) { g.rotateY(-Math.PI / 2); g.translate(b.x0 - 0.08, y, (b.z0 + b.z1) / 2); }
    else if (blk.x1 - b.x1 < 8) { g.rotateY(Math.PI / 2); g.translate(b.x1 + 0.08, y, (b.z0 + b.z1) / 2); }
    else if (b.z0 - blk.z0 < 8) { g.rotateY(Math.PI); g.translate((b.x0 + b.x1) / 2, y, b.z0 - 0.08); }
    else if (blk.z1 - b.z1 < 8) { g.translate((b.x0 + b.x1) / 2, y, b.z1 + 0.08); }
    else ok = false;
    if (ok) signSets[si].push(g);
  }
  MATS.signs = TEX.signs.map((t) => new THREE.MeshBasicMaterial({ map: t, color: 0xffffff, transparent: true, toneMapped: false }));
  signSets.forEach((set, i) => { if (set.length) scene.add(new THREE.Mesh(mergeGeos(set), MATS.signs[i])); });
  // garage door + paint shop signs
  if (SPOT.garageBld) {
    const g = SPOT.garageBld;
    const door = new THREE.Mesh(new THREE.PlaneGeometry(9, 5), new THREE.MeshStandardMaterial({ map: TEX.garage, roughness: 0.5, metalness: 0.5 }));
    door.rotation.y = Math.PI / 2; door.position.set(g.x1 + 0.06, 2.6, (g.z0 + g.z1) / 2); scene.add(door);
  }
  MATS.paint = new THREE.MeshBasicMaterial({ map: TEX.paint, toneMapped: false });
  for (const s of SPOT.shops) {
    const g = s.bld;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), MATS.paint);
    sign.rotation.y = Math.PI; sign.position.set((g.x0 + g.x1) / 2, 5.2, g.z0 - 0.08); scene.add(sign);
  }
  // billboards
  MATS.ads = TEX.ads.map((t) => new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
  const cands = buildings.filter((b) => b.top > 8 && b.top < 34 && b.roof !== false);
  const used = new Set();
  for (let k = 0; k < 10 && cands.length; k++) {
    const b = cands[Math.floor(wr() * cands.length)]; if (used.has(b)) continue; used.add(b);
    const grp = new THREE.Group();
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(11, 4.8), MATS.ads[k % MATS.ads.length]); panel.position.y = 5.2; grp.add(panel);
    const back = new THREE.Mesh(new THREE.BoxGeometry(11.4, 5.2, 0.25), MATS.metal); back.position.set(0, 5.2, -0.16); grp.add(back);
    for (const sx of [-3.5, 3.5]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3, 0.3), MATS.metal); post.position.set(sx, 1.5, -0.2); grp.add(post); }
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const ni = nearestNode(cx, cz);
    const ang = Math.abs(roadC(ni[0]) - cx) < Math.abs(roadC(ni[1]) - cz) ? (roadC(ni[0]) > cx ? Math.PI / 2 : -Math.PI / 2) : (roadC(ni[1]) > cz ? 0 : Math.PI);
    grp.rotation.y = ang; grp.position.set(cx, b.top, cz);
    grp.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(grp);
  }
  await progress(0.65, 'Фонари');

  // --- street lamps ---
  const lamps = [];
  for (let i = 0; i <= CITY.N; i++) for (let j = 0; j < CITY.N; j++) for (const side of [-1, 1]) for (const k of [0.27, 0.73]) {
    const c = roadC(i), s = lerp(roadC(j) + HW, roadC(j + 1) - HW, k);
    lamps.push({ x: c + side * (HW + 0.9), z: s, ry: side > 0 ? -Math.PI / 2 : Math.PI / 2, ax: -side, az: 0 });
    lamps.push({ x: s, z: c + side * (HW + 0.9), ry: side > 0 ? Math.PI : 0, ax: 0, az: -side });
  }
  const poleGeo = new THREE.CylinderGeometry(0.08, 0.13, 8, 6); poleGeo.translate(0, 4, 0);
  const armGeo = new THREE.BoxGeometry(0.1, 0.1, 2.1); armGeo.translate(0, 7.8, 1.0);
  const headGeo = new THREE.BoxGeometry(0.42, 0.16, 0.9); headGeo.translate(0, 7.7, 2.0);
  const poles = new THREE.InstancedMesh(mergeGeos([poleGeo, armGeo]), MATS.metal, lamps.length);
  const heads = new THREE.InstancedMesh(headGeo, MATS.lampHead, lamps.length);
  const poolGeo = new THREE.PlaneGeometry(13, 13); poolGeo.rotateX(-Math.PI / 2);
  MATS.pool = new THREE.MeshBasicMaterial({ map: TEX.pool, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  lampPools = new THREE.InstancedMesh(poolGeo, MATS.pool, lamps.length);
  glowStatic = new GlowLayer(lamps.length + 64);
  glowStatic.begin();
  lamps.forEach((l, i) => {
    // arm points toward the road: local +z rotated by ry
    const ry = Math.atan2(l.ax, l.az);
    setInst(poles, i, l.x, 0.18, l.z, ry, 1, 1, 1); setInst(heads, i, l.x, 0.18, l.z, ry, 1, 1, 1);
    const hx = l.x + l.ax * 2.0, hz = l.z + l.az * 2.0;
    setInst(lampPools, i, l.x + l.ax * 3.2, 0.035, l.z + l.az * 3.2, 0, 1, 1, 1);
    glowStatic.add(hx, 7.75, hz, 1.0, 0.72, 0.42, 2.6);
    SPOT.lamps.push([hx, hz]);
    addCircleCollider(l.x, l.z, 0.2, 8, 'lamp');
  });
  glowStatic.end();
  poles.castShadow = true;
  scene.add(poles, heads, lampPools);
  lampPools.renderOrder = 2;
  lampPools.visible = Q.pools;
  await progress(0.72, 'Пальмы');

  // --- palms ---
  for (let z = -292; z <= 292; z += 11) palms.push([292 + wrr(-0.6, 0.6), z + wrr(-1.5, 1.5), wrr(0.9, 1.2)]);
  for (let i = 0; i < 18; i++) palms.push([wrr(299, 304), wrr(-280, 280), wrr(0.85, 1.25)]);
  for (const b of blocks) {
    if (b.type === 'low' || b.type === 'mid') {
      for (const [cx, cz] of [[b.x0 + 2.8, b.z0 + 2.8], [b.x1 - 2.8, b.z0 + 2.8], [b.x0 + 2.8, b.z1 - 2.8], [b.x1 - 2.8, b.z1 - 2.8]]) if (wr() < 0.45) palms.push([cx, cz, wrr(0.8, 1.1)]);
    }
  }
  const palmList = palms.filter((p) => Math.abs(p[1]) < 5.5 + 2 && p[0] > 294 ? false : true);
  makePalms(palmList);
  makeTrees(trees);
  await progress(0.8, 'Пляж и пирс');

  // --- plaza fountain ---
  {
    const b = blocks.find((k) => k.type === 'plaza');
    const stone = new THREE.MeshStandardMaterial({ color: 0xe9dfcf, roughness: 0.7 });
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(7.3, 7.6, 0.9, 40, 1, true), stone); basin.position.set(b.cx, 0.62, b.cz);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(7.3, 0.28, 8, 48), stone); rim.rotation.x = Math.PI / 2; rim.position.set(b.cx, 1.06, b.cz);
    const water = new THREE.Mesh(new THREE.CircleGeometry(7.2, 40), new THREE.MeshStandardMaterial({ color: 0x1aa6b8, roughness: 0.04, metalness: 0.3 }));
    water.rotation.x = -Math.PI / 2; water.position.set(b.cx, 0.86, b.cz);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 3.2, 16), stone); col.position.set(b.cx, 2.2, b.cz);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 0.6, 0.6, 24), stone); bowl.position.set(b.cx, 3.9, b.cz);
    [basin, rim, col, bowl].forEach((m) => { m.castShadow = true; m.receiveShadow = true; scene.add(m); });
    scene.add(water);
    addCircleCollider(b.cx, b.cz, 7.6, 1.1, 'fountain');
    fountainTop = new V3(b.cx, 4.3, b.cz);
    SPOT.plaza = { x: b.cx, z: b.cz };
    // benches
    const benchMat = new THREE.MeshStandardMaterial({ map: TEX.wood, roughness: 0.8 });
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU + 0.2, bx = b.cx + Math.cos(a) * 12, bz = b.cz + Math.sin(a) * 12;
      const bench = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.7), benchMat); bench.position.set(bx, 0.43, bz); bench.rotation.y = -a + Math.PI / 2; bench.castShadow = true; scene.add(bench);
    }
  }
  // --- pier, ferris wheel, lighthouse, beach props ---
  {
    const deck = new THREE.Mesh(worldUV(boxAt(296, 385, -0.6, 0.3, -6, 6), 6), MATS.wood); deck.receiveShadow = true; deck.castShadow = true; scene.add(deck);
    const railGeos = [];
    for (const z of [-6, 6]) { railGeos.push(boxAt(300, 385, 0.3, 1.25, z - 0.08, z + 0.08)); for (let x = 300; x <= 385; x += 3) railGeos.push(boxAt(x - 0.07, x + 0.07, 0.3, 1.25, z - 0.07, z + 0.07)); addBoxCollider(300, 385, z - 0.35, z + 0.35, 1.25, 'rail'); }
    railGeos.push(boxAt(384.8, 385, 0.3, 1.25, -6, 6)); addBoxCollider(384.6, 386, -6, 6, 1.25, 'rail');
    scene.add(new THREE.Mesh(mergeGeos(railGeos), new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.6 })));
    const posts = [];
    for (let x = 300; x <= 384; x += 7) for (const z of [-5, 5]) { const g = new THREE.CylinderGeometry(0.35, 0.35, 5, 8); g.translate(x, -3, z); posts.push(g); }
    scene.add(new THREE.Mesh(mergeGeos(posts), MATS.wood));
    // ferris wheel facing the city, rotating around X
    wheelGroup = new THREE.Group(); wheelGroup.position.set(372, 17.5, 0);
    const wMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f8, roughness: 0.35, metalness: 0.6 });
    for (const x of [-1.2, 1.2]) {
      const rimM = new THREE.Mesh(new THREE.TorusGeometry(14, 0.22, 6, 64), wMat); rimM.rotation.y = Math.PI / 2; rimM.position.x = x; wheelGroup.add(rimM);
      for (let k = 0; k < 16; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 14, 0.12), wMat); sp.position.set(x, 0, 0); sp.rotation.x = k / 16 * TAU; sp.translateY(7); wheelGroup.add(sp); }
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 3.2, 16), wMat); hub.rotation.z = Math.PI / 2; wheelGroup.add(hub);
    wheelGroup.userData.cars = [];
    const gonMat = [0xff3f8e, 0x3fe5ef, 0xffd23f, 0x8dff7a].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }));
    const gonGeo = new THREE.BoxGeometry(2.0, 1.6, 1.6); gonGeo.translate(0, -1.1, 0);
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * TAU, gon = new THREE.Mesh(gonGeo, gonMat[k % 4]);
      gon.position.set(0, Math.cos(a) * 14, Math.sin(a) * 14); gon.userData.a = a; gon.castShadow = true; wheelGroup.add(gon); wheelGroup.userData.cars.push(gon);
    }
    scene.add(wheelGroup);
    const legs = [];
    for (const x of [-2.2, 2.2]) for (const s of [-1, 1]) { const g = new THREE.BoxGeometry(0.5, 19, 0.5); g.rotateX(-s * 0.42); g.translate(372 + x, 8.8, s * 3.8); legs.push(g); }
    scene.add(new THREE.Mesh(mergeGeos(legs), wMat));
    addBoxCollider(368, 376, -5.5, 5.5, 20, 'wheel');
    SPOT.wheel = { x: 372, y: 17.5, z: 0 };
    // lighthouse
    const lx = 302, lz = -282;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.3, 22, 24), new THREE.MeshStandardMaterial({ map: TEX.light, roughness: 0.6 }));
    tower.position.set(lx, 11, lz); tower.castShadow = true; scene.add(tower);
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 1.8, 12), new THREE.MeshStandardMaterial({ color: 0x222222, emissive: new THREE.Color('#fff2c0'), emissiveIntensity: 0.4 }));
    lantern.position.set(lx, 22.9, lz); scene.add(lantern); MATS.lantern = lantern.material;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.7, 1.6, 12), new THREE.MeshStandardMaterial({ color: 0xd8343f, roughness: 0.5 })); cap.position.set(lx, 24.6, lz); scene.add(cap);
    const beamGeo = new THREE.ConeGeometry(4, 60, 16, 1, true); beamGeo.translate(0, -30, 0); beamGeo.rotateZ(Math.PI / 2);
    MATS.beam = new THREE.MeshBasicMaterial({ color: 0xfff1c8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    lightBeam = new THREE.Group(); lightBeam.position.set(lx, 22.9, lz);
    const b1 = new THREE.Mesh(beamGeo, MATS.beam), b2 = new THREE.Mesh(beamGeo, MATS.beam); b2.rotation.y = Math.PI;
    lightBeam.add(b1, b2); scene.add(lightBeam);
    addCircleCollider(lx, lz, 2.5, 30, 'tower');
    SPOT.lighthouse = { x: lx, z: lz };
    // lifeguard towers
    const lgMat = new THREE.MeshStandardMaterial({ color: 0x5ad1e6, roughness: 0.6 });
    const lgWhite = new THREE.MeshStandardMaterial({ color: 0xf6f1e8, roughness: 0.7 });
    for (const z of [-170, -60, 70, 190]) {
      const g = new THREE.Group(); g.position.set(301.5, 0, z);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(3, 2.2, 3), lgMat); cab.position.y = 3.4; g.add(cab);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.25, 3.6), lgWhite); roof.position.y = 4.65; g.add(roof);
      for (const sx of [-1.2, 1.2]) for (const sz of [-1.2, 1.2]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.6, 0.2), lgWhite); leg.position.set(sx, 1.1, sz); g.add(leg); }
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(1, 0.15, 4.2), lgWhite); ramp.position.set(-2.4, 1.2, 0); ramp.rotation.z = 0.5; g.add(ramp);
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      scene.add(g); addCircleCollider(301.5, z, 2.0, 5, 'tower');
    }
    // umbrellas
    const umbN = 16;
    const umbTop = new THREE.InstancedMesh(new THREE.ConeGeometry(1.7, 0.7, 10), new THREE.MeshStandardMaterial({ roughness: 0.7, side: THREE.DoubleSide }), umbN);
    const umbPole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 5), lgWhite, umbN);
    const UC = ['#ff3f8e', '#ffd23f', '#3fe5ef', '#ff8a3d', '#8dff7a', '#ffffff'];
    for (let i = 0; i < umbN; i++) {
      const x = wrr(299.5, 304.5); let z = wrr(-260, 260); if (Math.abs(z) < 9) z += 20;
      const y = groundH(x, z);
      setInst(umbTop, i, x, y + 2.4, z, wr() * TAU, 1, 1, 1, wrr(-0.12, 0.12), wrr(-0.12, 0.12));
      setInst(umbPole, i, x, y + 1.2, z, 0, 1, 1, 1);
      umbTop.setColorAt(i, new THREE.Color(wpick(UC)));
    }
    umbTop.castShadow = true; scene.add(umbTop, umbPole);
  }
  await progress(0.88, 'Финальные штрихи');

  // --- tokens (collectibles) ---
  const tokenSpots = [[378, 4], [302, -276], [310 - 8, 120], [SPOT.plaza.x + 9, SPOT.plaza.z + 9]];
  for (const b of blocks) {
    if (tokenSpots.length >= 15) break;
    if (wr() < 0.35 && b.type !== 'plaza') {
      const L = [b.x0 + 2, b.x1 - 2, b.z0 + 2, b.z1 - 2];
      for (let t = 0; t < 20; t++) {
        const x = wrr(L[0], L[1]), z = wrr(L[2], L[3]);
        const h = collideCircle(x, z, 0.8);
        if (!h.hit) { tokenSpots.push([x, z]); break; }
      }
    }
  }
  SPOT.tokens = tokenSpots.slice(0, 15);
  SPOT.hospital = { x: roadC(0) + CITY.RW / 2 + 3, z: (roadC(3) + roadC(4)) / 2 };
  SPOT.station = { x: (roadC(2) + roadC(3)) / 2, z: roadC(0) + CITY.RW / 2 + 3 };
  SPOT.start = { x: SPOT.garage.x + 4, z: SPOT.garage.z - 12 };
  drawMinimapBase();
  await progress(0.96, 'Машины и жители');
}

// ---------- palms & trees (instanced) ----------
let frondMat = null;
function makePalms(list) {
  // trunk with gentle bend
  const trunk = new THREE.CylinderGeometry(0.17, 0.27, 8, 8, 10, false); trunk.translate(0, 4, 0);
  { const p = trunk.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i) / 8; p.setX(i, p.getX(i) + y * y * 1.3); } trunk.computeVertexNormals(); }
  const fronds = [];
  for (let k = 0; k < 9; k++) {
    const g = new THREE.PlaneGeometry(4.4, 1.15, 8, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + 2.2, y = p.getY(i);
      const t = x / 4.4;
      p.setXYZ(i, x, -t * t * 1.9 + Math.abs(y) * 0.28, y);
    }
    g.computeVertexNormals();
    g.rotateZ(wrr(0.05, 0.35));
    g.rotateY(k / 9 * TAU + wrr(-0.15, 0.15));
    g.translate(1.3, 8.05, 0);
    fronds.push(g);
  }
  const top = new THREE.SphereGeometry(0.42, 8, 6); top.translate(1.3, 7.9, 0);
  const frondGeo = mergeGeos(fronds);
  frondMat = new THREE.MeshStandardMaterial({ map: TEX.frond, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.75 });
  frondMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = timeU;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
float sw = length(position.xz - vec2(1.3, 0.0)) * 0.05;
#ifdef USE_INSTANCING
float ph = instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.17;
#else
float ph = 0.0;
#endif
transformed.y += sin(uTime * 1.9 + ph + position.x) * sw;
transformed.x += sin(uTime * 1.3 + ph) * sw * 0.6;`);
  };
  const trunkMat = new THREE.MeshStandardMaterial({ map: TEX.bark, roughness: 0.9 });
  const n = list.length;
  const tm = new THREE.InstancedMesh(mergeGeos([trunk, top]), trunkMat, n);
  const fm = new THREE.InstancedMesh(frondGeo, frondMat, n);
  fm.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: TEX.frond, alphaTest: 0.5 });
  list.forEach((p, i) => {
    const ry = wr() * TAU, s = p[2];
    const y = groundH(p[0], p[1]);
    setInst(tm, i, p[0], y, p[1], ry, s, s * wrr(0.9, 1.15), s);
    tm.getMatrixAt(i, _m4); fm.setMatrixAt(i, _m4);
    addCircleCollider(p[0], p[1], 0.32 * s, 8, 'palm');
  });
  tm.castShadow = true; fm.castShadow = true; tm.receiveShadow = true;
  scene.add(tm, fm);
}
function makeTrees(list) {
  if (!list.length) return;
  const trunk = new THREE.CylinderGeometry(0.16, 0.24, 3, 6); trunk.translate(0, 1.5, 0);
  const crown = new THREE.IcosahedronGeometry(2.4, 1); crown.translate(0, 4.4, 0);
  const crown2 = new THREE.IcosahedronGeometry(1.7, 1); crown2.translate(0.9, 5.6, 0.4);
  const tm = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: 0x6b4b33, roughness: 0.9 }), list.length);
  const cm = new THREE.InstancedMesh(mergeGeos([crown, crown2]), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true }), list.length);
  const cc = new THREE.Color();
  list.forEach((p, i) => {
    const ry = wr() * TAU, s = p[2];
    setInst(tm, i, p[0], 0.18, p[1], ry, s, s, s); setInst(cm, i, p[0], 0.18, p[1], ry, s, s, s);
    cc.setHSL(wrr(0.24, 0.33), wrr(0.45, 0.6), wrr(0.25, 0.36)); cm.setColorAt(i, cc);
    addCircleCollider(p[0], p[1], 0.35 * s, 6, 'tree');
  });
  tm.castShadow = true; cm.castShadow = true; cm.receiveShadow = true;
  scene.add(tm, cm);
}

// ---------- minimap base ----------
const MAP = { canvas: null, x0: -340, z0: -340, size: 720, px: 1024 };
function drawMinimapBase() {
  const c = mkCanvas(MAP.px, MAP.px), g = c.getContext('2d'), s = MAP.px / MAP.size;
  const X = (x) => (x - MAP.x0) * s, Z = (z) => (z - MAP.z0) * s;
  g.fillStyle = '#123a56'; g.fillRect(0, 0, MAP.px, MAP.px);
  g.fillStyle = '#d8c08a'; g.fillRect(X(296), Z(-300), (310 - 296) * s, 600 * s);
  g.fillStyle = '#9a8a72'; g.fillRect(X(296), Z(-6), (385 - 296) * s, 12 * s);
  g.fillStyle = '#5f6878'; g.fillRect(X(-300), Z(-300), 596 * s, 600 * s);
  g.fillStyle = '#2b3242';
  g.fillRect(X(-300), Z(-300), 12 * s, 600 * s); g.fillRect(X(288), Z(-300), 8 * s, 600 * s);
  g.fillRect(X(-288), Z(288), 576 * s, 12 * s); g.fillRect(X(-288), Z(-300), 576 * s, 12 * s);
  for (const b of blocks) {
    g.fillStyle = b.type === 'park' ? '#2e6a3a' : b.type === 'plaza' ? '#4a4f62' : '#2b3242';
    g.fillRect(X(b.x0), Z(b.z0), (b.x1 - b.x0) * s, (b.z1 - b.z0) * s);
  }
  g.fillStyle = '#3d4659';
  for (const b of buildings) g.fillRect(X(b.x0), Z(b.z0), (b.x1 - b.x0) * s, (b.z1 - b.z0) * s);
  MAP.canvas = c;
}
