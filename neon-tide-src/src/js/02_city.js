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
    if (c.soft && r > 0.6) continue; // street furniture blocks people, not vehicles
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
// Extra ray targets that are not grid colliders (creative ramps, platforms, cubes...):
// RAY_HOOKS.push(fn(ox, oy, oz, dx, dy, dz, maxT) → hit distance along the unit ray, or Infinity).
// rayBoxes() returns the nearest of the boxes and all hooks; losClear() tests them at eye height (1.4 m).
const RAY_HOOKS = [];
let _rayHookBusy = false; // a hook may call rayBoxes itself: no recursion into the hooks
function rayHooks(ox, oy, oz, dx, dy, dz, maxT) {
  if (!RAY_HOOKS.length || _rayHookBusy) return maxT;
  let best = maxT;
  _rayHookBusy = true;
  try { for (let i = 0; i < RAY_HOOKS.length; i++) { const t = RAY_HOOKS[i](ox, oy, oz, dx, dy, dz, best); if (t >= 0 && t < best) best = t; } }
  finally { _rayHookBusy = false; }
  return best;
}
function losClear(ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz), n = Math.ceil(L / 5);
  for (let i = 1; i < n; i++) { const t = i / n; if (pointInBuilding(ax + dx * t, az + dz * t)) return false; }
  if (RAY_HOOKS.length && L > 0.5 && rayHooks(ax, 1.4, az, dx / L, 0, dz / L, L) < L - 0.5) return false;
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
  return RAY_HOOKS.length ? rayHooks(ox, oy, oz, dx, dy, dz, best) : best;
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
  if (y0 === 0) { buildings.push(b); b.col = addBoxCollider(x0, x1, z0, z1, h, 'b'); }
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
      b.grid = { nx, nz, w, d, L0 };
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
  cityShapeDistricts();
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
  // stop lines in front of the crosswalks at signalled intersections
  for (let i = 0; i <= CITY.N; i++) for (let j = 0; j <= CITY.N; j++) {
    const nb = nodeNeighbors(i, j); if (nb.length < 3) continue;
    const x = roadC(i), z = roadC(j);
    for (const [ni, nj] of nb) {
      const dx = Math.sign(i - ni), dz = Math.sign(j - nj), rx = -dz, rz = dx;
      const ax = x - dx * 12.4 + rx * 0.45, az = z - dz * 12.4 + rz * 0.45, bx = x - dx * 12.9 + rx * 7.4, bz = z - dz * 12.9 + rz * 7.4;
      wht.add(Math.min(ax, bx), Math.max(ax, bx), Math.min(az, bz), Math.max(az, bz), Y);
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
    // benches around the fountain (built with the street furniture), sitters face the water
    SPOT.plazaBenches = [];
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + 0.2; SPOT.plazaBenches.push([b.cx + Math.cos(a) * 12, b.cz + Math.sin(a) * 12, Math.atan2(-Math.cos(a), -Math.sin(a))]); }
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
    const lgWhite = new THREE.MeshStandardMaterial({ color: 0xf6f1e8, roughness: 0.7 });
    SPOT.lifeguards = [-170, -60, 70, 190];
    for (const z of SPOT.lifeguards) addCircleCollider(301.5, z, 2.0, 5, 'tower');
    // umbrellas
    const umbN = 16;
    const umbTop = new THREE.InstancedMesh(new THREE.ConeGeometry(1.7, 0.7, 10), new THREE.MeshStandardMaterial({ roughness: 0.7, side: THREE.DoubleSide }), umbN);
    const umbPole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 5), lgWhite, umbN);
    const UC = ['#ff3f8e', '#ffd23f', '#3fe5ef', '#ff8a3d', '#8dff7a', '#ffffff'];
    for (let i = 0; i < umbN; i++) {
      const x = wrr(299.5, 304.5); let z = wrr(-260, 260); if (Math.abs(z) < 9) z += 20;
      if (Math.abs(z - 122) < 10 || Math.abs(z + 118) < 10 || Math.abs(Math.abs(z) - 26) < 4) z += 21; // volleyball courts, lifeguard huts
      const y = groundH(x, z);
      setInst(umbTop, i, x, y + 2.4, z, wr() * TAU, 1, 1, 1, wrr(-0.12, 0.12), wrr(-0.12, 0.12));
      setInst(umbPole, i, x, y + 1.2, z, 0, 1, 1, 1);
      umbTop.setColorAt(i, new THREE.Color(wpick(UC)));
    }
    umbTop.castShadow = true; scene.add(umbTop, umbPole);
  }
  await progress(0.84, 'Улицы и вывески');
  buildLivingCity();
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

// ============================================================
//  Living city: districts, landmarks, street furniture, traffic signals
//  Static props are merged per 160 m chunk (one draw call per visible chunk, frustum-culled).
// ============================================================
const cityRng = mulberry32(55117);
const cityR = () => cityRng();
const cityRR = (a, b) => a + (b - a) * cityRng();
const cityPick = (arr) => arr[Math.floor(cityRng() * arr.length)];
const cityHash = (x, z) => { const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return v - Math.floor(v); };
const BRICK_COLORS = ['#8a4b3c', '#7a4236', '#9c5a45', '#6e4a3d', '#8f6a55', '#5e5650', '#a0705a', '#74635a', '#86574a'];
const GLASS_COLORS = ['#7d9bb5', '#5f7f9a', '#8fb3c9', '#4f6b82', '#a9c1d1', '#6a8aa6'];
const DECO_COLORS = ['#f7c5d0', '#bfe8d6', '#ffe0b8', '#d9c9f2', '#bfe6ee', '#fff1dc', '#ffc9bd', '#f3e6a8'];
// Landmark blocks [bi, bj]
const CITY_LAND = { gas: [5, 6], court: [0, 2], site: [4, 2], club: [5, 3] };
const cityBlockAt = (x, z) => {
  const bi = Math.floor((x + CITY.HALF) / CITY.P), bj = Math.floor((z + CITY.HALF) / CITY.P);
  return bi >= 0 && bi < CITY.N && bj >= 0 && bj < CITY.N ? blocks[bi * CITY.N + bj] : null;
};
// Runtime handles for animated / night-lit city parts (driven from 04b_living.js)
const CITYX = { cranes: [], lasers: [], neonMats: [], glowPts: [], signMats: [], netMat: null, batches: [] };

// ---------- traffic signals ----------
// Each signalled intersection runs a fixed cycle: axis 0 (traffic along x) green, yellow, all-red, then axis 1.
const TSIG = { nodes: new Map(), apps: [], C: 28, G: 11, Y: 2.5, lens: null, ON: [], OFF: [] };
function tsigNode(i, j) { return TSIG.nodes.get(i * 16 + j); }
function tsigPhase(n, axis) { let t = ((GAME.time + n.off) % TSIG.C + TSIG.C) % TSIG.C; if (axis === 1) t = (t + TSIG.C / 2) % TSIG.C; return t; }
// 0 green, 1 yellow, 2 red; intersections without signals are always "green" (yield by reservation)
function tsigState(i, j, axis) {
  const n = tsigNode(i, j); if (!n) return 0;
  const t = tsigPhase(n, axis);
  return t < TSIG.G ? 0 : t < TSIG.G + TSIG.Y ? 1 : 2;
}
function tsigGreenLeft(i, j, axis) { const n = tsigNode(i, j); if (!n) return 99; const t = tsigPhase(n, axis); return t < TSIG.G ? TSIG.G - t : 0; }

// ---------- prop batching ----------
const CITY_PG = {};
function cityInitPG() {
  if (CITY_PG.box) return;
  CITY_PG.box = new THREE.BoxGeometry(1, 1, 1);
  CITY_PG.cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
  CITY_PG.cyl6 = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
  CITY_PG.cyl16 = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
  CITY_PG.cone = new THREE.ConeGeometry(0.5, 1, 10);
  CITY_PG.sph = new THREE.SphereGeometry(0.5, 10, 6);
  CITY_PG.ico = new THREE.IcosahedronGeometry(0.5, 0);
  CITY_PG.torus = new THREE.TorusGeometry(0.5, 0.08, 5, 12);
  CITY_PG.net = new THREE.CylinderGeometry(0.5, 0.33, 1, 8, 1, true);
}
const _cityCol = {};
const cityCol = (hex) => _cityCol[hex] || (_cityCol[hex] = new THREE.Color(hex));
const _cpbM = new THREE.Matrix4(), _cpbL = new THREE.Matrix4(), _cpbN = new THREE.Matrix3(), _cpbV = new V3(), _cpbQ = new THREE.Quaternion(), _cpbE = new THREE.Euler(), _cpbP = new V3(), _cpbS = new V3();
class CityPropBatch {
  // view: hide chunks farther than this from the camera (0 = up to the fog distance)
  constructor(mat, cast, chunk, view) { this.mat = mat; this.cast = cast; this.chunk = chunk || 160; this.view = view || 0; this.ch = new Map(); this.base = new THREE.Matrix4(); this.bx = 0; this.bz = 0; this.ry = 0; this.meshes = []; }
  frame(x, y, z, ry) {
    _cpbE.set(0, ry || 0, 0); _cpbQ.setFromEuler(_cpbE); _cpbP.set(x, y, z); _cpbS.set(1, 1, 1);
    this.base.compose(_cpbP, _cpbQ, _cpbS); this.bx = x; this.bz = z; this.by = y; this.ry = ry || 0; return this;
  }
  // local (frame) coordinates -> world [x, z]
  wx(lx, lz) { return this.bx + lx * Math.cos(this.ry) + lz * Math.sin(this.ry); }
  wz(lx, lz) { return this.bz - lx * Math.sin(this.ry) + lz * Math.cos(this.ry); }
  put(geo, x, y, z, sx, sy, sz, col, rx, ry, rz) {
    _cpbE.set(rx || 0, ry || 0, rz || 0); _cpbQ.setFromEuler(_cpbE); _cpbP.set(x, y, z); _cpbS.set(sx, sy, sz);
    _cpbL.compose(_cpbP, _cpbQ, _cpbS); _cpbM.multiplyMatrices(this.base, _cpbL);
    this.addM(geo, _cpbM, col);
  }
  box(x0, x1, y0, y1, z0, z1, col) { this.put(CITY_PG.box, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, col); }
  // world-space variants: frame at the part itself so it lands in the right chunk
  wbox(x0, x1, y0, y1, z0, z1, col) { const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2; this.frame(cx, 0, cz, 0); this.box(x0 - cx, x1 - cx, y0, y1, z0 - cz, z1 - cz, col); }
  wput(geo, x, y, z, sx, sy, sz, col, rx, ry, rz) { this.frame(x, 0, z, 0); this.put(geo, 0, y, 0, sx, sy, sz, col, rx, ry, rz); }
  addM(geo, m, col) {
    const key = Math.floor(this.bx / this.chunk) + ',' + Math.floor(this.bz / this.chunk);
    let c = this.ch.get(key);
    if (!c) { c = { p: [], n: [], c: [], i: [], nv: 0 }; this.ch.set(key, c); }
    const pos = geo.attributes.position, nor = geo.attributes.normal;
    _cpbN.getNormalMatrix(m);
    for (let k = 0; k < pos.count; k++) {
      _cpbV.fromBufferAttribute(pos, k).applyMatrix4(m); c.p.push(_cpbV.x, _cpbV.y, _cpbV.z);
      _cpbV.fromBufferAttribute(nor, k).applyMatrix3(_cpbN).normalize(); c.n.push(_cpbV.x, _cpbV.y, _cpbV.z);
      c.c.push(col.r, col.g, col.b);
    }
    if (geo.index) { const ia = geo.index.array; for (let k = 0; k < ia.length; k++) c.i.push(c.nv + ia[k]); }
    else for (let k = 0; k < pos.count; k++) c.i.push(c.nv + k);
    c.nv += pos.count;
  }
  build(order) {
    for (const c of this.ch.values()) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(c.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(c.n, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(c.c, 3));
      g.setIndex(c.i); g.computeBoundingSphere();
      const m = new THREE.Mesh(g, this.mat); m.castShadow = this.cast; m.receiveShadow = !this.mat.isMeshBasicMaterial;
      if (order) m.renderOrder = order;
      m.matrixAutoUpdate = false; scene.add(m); this.meshes.push(m);
      if (this.chunk < 1e5) { m.userData.view = this.view; CITYX.batches.push(m); }
    }
    this.ch.clear();
  }
}
// Textured planes merged per material. tile: UV units per metre (0 = stretch the whole texture); uvr: [u0, v0, u1, v1] atlas rect.
class CityTexPlanes {
  constructor() { this.sets = new Map(); }
  add(base, mat, w, h, lx, ly, lz, lry, lrx, tile, uvr) {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      let u = uv.getX(i), v = uv.getY(i);
      if (tile) { u *= w * tile; v *= h * tile; } else if (uvr) { u = lerp(uvr[0], uvr[2], u); v = lerp(uvr[1], uvr[3], v); }
      uv.setXY(i, u, v);
    }
    _cpbE.set(lrx || 0, lry || 0, 0); _cpbQ.setFromEuler(_cpbE); _cpbP.set(lx, ly, lz); _cpbS.set(1, 1, 1);
    _cpbL.compose(_cpbP, _cpbQ, _cpbS); _cpbM.multiplyMatrices(base, _cpbL); g.applyMatrix4(_cpbM);
    if (!this.sets.has(mat)) this.sets.set(mat, []);
    this.sets.get(mat).push(g);
  }
  build() {
    for (const [mat, list] of this.sets) {
      const m = new THREE.Mesh(mergeGeos(list), mat);
      m.receiveShadow = !mat.isMeshBasicMaterial; m.matrixAutoUpdate = false; scene.add(m);
    }
  }
}
// Box geometry with per-face UVs in metres (for tiling lattice / mesh textures)
function cityTiledBox(w, h, d, tile) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] * tile, uv.getY(i) * dims[f][1] * tile); }
  return g;
}

// ---------- canvas textures for the new landmarks ----------
const CITY_TEX = {};
function makeCityTextures() {
  const neonText = (c, g, txt, x, y, size, color, font) => {
    g.font = `900 ${size}px ${font || FONT_D}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = size * 0.45; g.fillStyle = color; g.fillText(txt, x, y);
    g.shadowBlur = size * 0.2; g.fillText(txt, x, y); g.shadowBlur = 0; g.fillStyle = 'rgba(255,255,255,0.82)'; g.fillText(txt, x, y);
  };
  { // club sign
    const c = mkCanvas(1024, 256), g = c.getContext('2d');
    g.fillStyle = '#07020f'; g.fillRect(0, 0, 1024, 256);
    g.strokeStyle = '#3fe5ef'; g.lineWidth = 6; g.shadowColor = '#3fe5ef'; g.shadowBlur = 22; roundRect(g, 16, 16, 992, 224, 40); g.stroke(); g.shadowBlur = 0;
    for (let i = 0; i < 5; i++) { g.strokeStyle = `rgba(63,229,239,${0.5 - i * 0.08})`; g.lineWidth = 4; g.beginPath(); for (let x = 60; x <= 964; x += 8) g.lineTo(x, 214 + Math.sin(x * 0.035 + i) * 7 - i * 3); g.stroke(); }
    neonText(c, g, 'ПРИЛИВ', 512, 112, 132, '#ff3f8e');
    g.font = `800 30px ${FONT_B}`; g.fillStyle = '#ffd23f'; g.textAlign = 'center'; g.fillText('КЛУБ  ·  23:00 — 06:00', 512, 196);
    CITY_TEX.club = toTex(c, { wrap: false });
  }
  { // fuel price pylon
    const c = mkCanvas(256, 512), g = c.getContext('2d');
    g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, 256, 512);
    g.fillStyle = '#1d4fbf'; g.fillRect(0, 0, 256, 190);
    g.fillStyle = '#ffd23f'; g.beginPath(); g.moveTo(128, 34); g.lineTo(148, 112); g.lineTo(108, 112); g.closePath(); g.fill();
    g.fillStyle = '#fff'; g.fillRect(112, 112, 32, 34); g.fillStyle = '#d8343f'; g.fillRect(112, 122, 32, 8);
    g.font = `900 46px ${FONT_D}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText('МАЯК', 128, 168);
    g.fillStyle = '#16181c'; g.fillRect(14, 206, 228, 290);
    const rows = [['АИ-92', '54.30'], ['АИ-95', '58.90'], ['АИ-98', '67.40'], ['ДТ', '61.70']];
    rows.forEach(([n, v], i) => {
      const y = 246 + i * 68;
      g.font = `800 26px ${FONT_B}`; g.textAlign = 'left'; g.fillStyle = '#e8e8e8'; g.fillText(n, 28, y);
      g.font = `900 34px ${FONT_D}`; g.textAlign = 'right'; g.fillStyle = '#ff8a3d'; g.shadowColor = '#ff6a00'; g.shadowBlur = 10; g.fillText(v, 232, y); g.shadowBlur = 0;
    });
    CITY_TEX.fuel = toTex(c, { wrap: false });
  }
  { // canopy fascia
    const c = mkCanvas(512, 64), g = c.getContext('2d');
    g.fillStyle = '#f7f5f0'; g.fillRect(0, 0, 512, 64); g.fillStyle = '#d8343f'; g.fillRect(0, 44, 512, 12); g.fillStyle = '#1d4fbf'; g.fillRect(0, 56, 512, 8);
    g.font = `900 30px ${FONT_D}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#1d4fbf'; g.fillText('МАЯК · ТОПЛИВО · КОФЕ', 256, 24);
    CITY_TEX.fascia = toTex(c, { wrap: false });
  }
  { // construction hoarding banner
    const c = mkCanvas(1024, 256), g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 1024, 0); gr.addColorStop(0, '#0f3d63'); gr.addColorStop(1, '#1a7fa0');
    g.fillStyle = gr; g.fillRect(0, 0, 1024, 256);
    g.fillStyle = 'rgba(255,255,255,0.12)'; for (let i = 0; i < 7; i++) g.fillRect(700 + i * 40, 60 + (i % 3) * 20, 26, 196);
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(820, 30, 60, 226); g.fillStyle = 'rgba(160,220,255,0.7)'; for (let y = 40; y < 250; y += 14) g.fillRect(826, y, 48, 8);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillStyle = '#ffd23f'; g.font = `800 28px ${FONT_B}`; g.fillText('СТРОИТЕЛЬСТВО', 40, 64);
    g.fillStyle = '#fff'; g.font = `900 64px ${FONT_D}`; g.fillText('ЖК «ЛАЗУРЬ»', 36, 146);
    g.font = `700 28px ${FONT_B}`; g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillText('квартиры с видом на океан · сдача в 2028', 40, 200);
    g.fillStyle = '#ffd23f'; g.fillRect(0, 236, 1024, 20); g.fillStyle = '#16181c'; for (let x = -20; x < 1024; x += 40) { g.beginPath(); g.moveTo(x, 256); g.lineTo(x + 20, 236); g.lineTo(x + 40, 236); g.lineTo(x + 20, 256); g.fill(); }
    CITY_TEX.hoard = toTex(c, { wrap: false });
  }
  { // lattice (crane mast / jib) with alpha
    const c = mkCanvas(64, 64), g = c.getContext('2d');
    g.clearRect(0, 0, 64, 64); g.strokeStyle = '#ffc21a'; g.lineWidth = 6; g.strokeRect(3, 3, 58, 58);
    g.lineWidth = 4; g.beginPath(); g.moveTo(4, 4); g.lineTo(60, 60); g.moveTo(60, 4); g.lineTo(4, 60); g.stroke();
    CITY_TEX.lattice = toTex(c, { srgb: true });
  }
  { // chain-link fence
    const c = mkCanvas(64, 64), g = c.getContext('2d');
    g.clearRect(0, 0, 64, 64); g.strokeStyle = 'rgba(190,196,204,1)'; g.lineWidth = 2.2;
    for (let k = -64; k <= 64; k += 16) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 64, 64); g.stroke(); g.beginPath(); g.moveTo(k + 64, 0); g.lineTo(k, 64); g.stroke(); }
    CITY_TEX.chain = toTex(c, { srgb: true });
  }
  { // graffiti atlas: 4 original tags
    const c = mkCanvas(1024, 256), g = c.getContext('2d');
    g.clearRect(0, 0, 1024, 256);
    const tags = [['ЗАПАД', '#ff3f8e', '#ffd23f'], ['ШТОРМ', '#3fe5ef', '#7a5cff'], ['КИТ', '#8dff7a', '#ff8a3d'], ['ЮГ·7', '#ffd23f', '#ff3f8e']];
    tags.forEach(([t, a, b], i) => {
      const cx = i * 256 + 128;
      g.save(); g.translate(cx, 132); g.rotate((i % 2 ? -1 : 1) * 0.08);
      g.fillStyle = b; for (let k = 0; k < 9; k++) { g.beginPath(); g.ellipse(rr(-90, 90), rr(-40, 40), rr(14, 36), rr(10, 26), rr(0, 3), 0, TAU); g.globalAlpha = 0.35; g.fill(); }
      g.globalAlpha = 1;
      g.font = `900 ${t.length > 4 ? 58 : 76}px ${FONT_D}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineJoin = 'round'; g.lineWidth = 16; g.strokeStyle = '#111'; g.strokeText(t, 0, 0);
      const gr = g.createLinearGradient(0, -40, 0, 40); gr.addColorStop(0, a); gr.addColorStop(1, b);
      g.fillStyle = gr; g.fillText(t, 0, 0);
      g.lineWidth = 3; g.strokeStyle = '#fff'; g.strokeText(t, -2, -3);
      g.restore();
    });
    CITY_TEX.graffiti = toTex(c, { wrap: false });
  }
  { // lifeguard hut sign
    const c = mkCanvas(256, 64), g = c.getContext('2d');
    g.fillStyle = '#d8343f'; g.fillRect(0, 0, 256, 64); g.fillStyle = '#fff'; g.font = `900 30px ${FONT_D}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('СПАСАТЕЛИ', 128, 34);
    CITY_TEX.guard = toTex(c, { wrap: false });
  }
}

// ---------- districts and landmark lots ----------
function cityDropBuildings(x0, x1, z0, z1) {
  for (let k = bInst.length - 1; k >= 0; k--) {
    const b = bInst[k];
    if (!(b.x0 < x1 && b.x1 > x0 && b.z0 < z1 && b.z1 > z0)) continue;
    bInst.splice(k, 1);
    const i = buildings.indexOf(b); if (i >= 0) buildings.splice(i, 1);
    if (b.col) cgRemove(b.col);
  }
}
function cityShapeDistricts() {
  const at = (k) => blocks[k[0] * CITY.N + k[1]];
  for (const b of blocks) {
    b.dist = b.type === 'coast' || (b.cx > 120 && (b.type === 'low' || b.type === 'mid')) ? 'deco'
      : b.cx < -100 && (b.type === 'low' || b.type === 'mid') ? 'west' : b.type === 'downtown' ? 'glass' : 'mid';
  }
  // gas station: north-east corner of a southern low block
  const gb = at(CITY_LAND.gas);
  SPOT.gas = { x0: gb.x0 + 20, x1: gb.x1 - 6, z0: gb.z0 + 6, z1: gb.z0 + 39, blk: gb };
  cityDropBuildings(SPOT.gas.x0 - 1, SPOT.gas.x1 + 1, SPOT.gas.z0 - 1, SPOT.gas.z1 + 1);
  // basketball court in the gritty west
  const cb = at(CITY_LAND.court);
  SPOT.court = { cx: cb.x0 + 24, cz: cb.z0 + 20, blk: cb };
  cityDropBuildings(SPOT.court.cx - 18, SPOT.court.cx + 18, cb.z0 + 5, SPOT.court.cz + 12);
  // construction site: a whole downtown block
  const sb = at(CITY_LAND.site);
  SPOT.site = { x0: sb.x0 + 6, x1: sb.x1 - 6, z0: sb.z0 + 6, z1: sb.z1 - 6, blk: sb };
  cityDropBuildings(sb.x0, sb.x1, sb.z0, sb.z1);
  sb.type = 'site';
  // night club: the building nearest to the beach road in its block
  const kb = at(CITY_LAND.club);
  let club = null;
  for (const b of buildings) if (b.x0 >= kb.x0 && b.x1 <= kb.x1 && b.z0 >= kb.z0 && b.z1 <= kb.z1 && b.z1 - b.z0 > 12 && (!club || b.x1 > club.x1 + 0.5 || (Math.abs(b.x1 - club.x1) < 0.5 && Math.abs((b.z0 + b.z1) / 2) < Math.abs((club.z0 + club.z1) / 2)))) club = b;
  if (club) {
    club.club = true; club.h = Math.max(club.h, 14); club.top = club.h; club.color = '#2a1d3a'; club.style = 1; club.lit = 0.15; club.hue = 0.93;
    if (club.col) club.col.h = club.h;
    SPOT.club = { b: club, x: club.x1, z: (club.z0 + club.z1) / 2 };
  }
  // district palettes (deterministic per footprint so setback towers match their base)
  for (const b of bInst) {
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, blk = cityBlockAt(cx, cz);
    if (!blk || b.club || b === SPOT.garageBld) continue;
    const h = cityHash(cx, cz);
    if (blk.dist === 'west' && blk.type !== 'shop') { b.color = BRICK_COLORS[Math.floor(h * BRICK_COLORS.length)]; b.lit *= 0.85; if (b.style === 3) b.style = h < 0.5 ? 0 : 1; b.gritty = true; }
    else if (blk.dist === 'glass' && b.style !== 2 && h < 0.62) { b.style = 2; b.color = GLASS_COLORS[Math.floor(h * 97) % GLASS_COLORS.length]; }
    else if (blk.dist === 'deco') { if (blk.type !== 'coast' && h < 0.6) { b.style = 3; b.color = DECO_COLORS[Math.floor(h * 131) % DECO_COLORS.length]; } b.deco = true; }
  }
}

// ---------- helpers ----------
function cityBlockSides(b) {
  return [
    { x: b.x0, z: b.z0, ux: 1, uz: 0, nx: 0, nz: -1, len: b.x1 - b.x0 },
    { x: b.x1, z: b.z0, ux: 0, uz: 1, nx: 1, nz: 0, len: b.z1 - b.z0 },
    { x: b.x1, z: b.z1, ux: -1, uz: 0, nx: 0, nz: 1, len: b.x1 - b.x0 },
    { x: b.x0, z: b.z1, ux: 0, uz: -1, nx: -1, nz: 0, len: b.z1 - b.z0 },
  ];
}
// Lane segment that runs along a block side (traffic keeps this curb on its right-hand lane side)
function citySideLane(S) {
  const A = nearestNode(S.x + S.nx * 8, S.z + S.nz * 8), B = nearestNode(S.x + S.ux * S.len + S.nx * 8, S.z + S.uz * S.len + S.nz * 8);
  const dx = -S.nz, dz = S.nx;
  const fwd = (roadC(B[0]) - roadC(A[0])) * dx + (roadC(B[1]) - roadC(A[1])) * dz > 0;
  const a = fwd ? A : B, b = fwd ? B : A;
  return { a, b, dx, dz, seg: laneSeg(a, b), key: (a[0] * 16 + a[1]) * 256 + (b[0] * 16 + b[1]) };
}
const citySegKey = (a, b) => (a[0] * 16 + a[1]) * 256 + (b[0] * 16 + b[1]);
function citySoftCircle(x, z, r, h) { const c = addCircleCollider(x, z, r, h, 'prop'); c.soft = true; return c; }

// ---------- prop models (local frame: +z = front) ----------
function cityBench(pb, x, z, ry, y, seats) {
  const g = y === undefined ? groundH(x, z) : y;
  pb.frame(x, g, z, ry);
  const iron = cityCol('#2b2d31'), wood = cityCol('#a06c3f');
  for (const sx of [-0.88, 0.88]) { pb.box(sx - 0.05, sx + 0.05, 0, 0.43, -0.25, 0.22, iron); pb.box(sx - 0.05, sx + 0.05, 0.43, 0.92, -0.33, -0.25, iron); }
  pb.box(-1.06, 1.06, 0.42, 0.47, -0.24, 0.22, wood);
  pb.put(CITY_PG.box, 0, 0.7, -0.3, 2.12, 0.32, 0.04, wood, -0.14);
  const c = Math.cos(ry), s = Math.sin(ry);
  citySoftCircle(x + c * 0.5, z - s * 0.5, 0.42, g + 0.9); citySoftCircle(x - c * 0.5, z + s * 0.5, 0.42, g + 0.9);
  if (seats !== false) for (const o of [-0.5, 0.5]) SPOT.benches.push({ x: x + c * o + s * 0.04, z: z - s * o + c * 0.04, h: ry, y: g, taken: null });
}
function cityBin(pb, x, z, col) {
  const g = groundH(x, z); pb.frame(x, g, z, 0);
  pb.put(CITY_PG.cyl, 0, 0.45, 0, 0.52, 0.88, 0.52, col || cityCol('#2f5640')); pb.put(CITY_PG.cyl, 0, 0.91, 0, 0.58, 0.06, 0.58, cityCol('#1d2124'));
  citySoftCircle(x, z, 0.3, g + 1);
}
function cityHydrant(pb, x, z, col) {
  const g = groundH(x, z); pb.frame(x, g, z, cityR() * TAU);
  const red = col || cityCol('#c4302b'), metal = cityCol('#b9bcc2');
  pb.put(CITY_PG.cyl6, 0, 0.04, 0, 0.32, 0.08, 0.32, red); pb.put(CITY_PG.cyl, 0, 0.34, 0, 0.24, 0.56, 0.24, red);
  pb.put(CITY_PG.ico, 0, 0.62, 0, 0.27, 0.2, 0.27, red);
  pb.put(CITY_PG.cyl6, 0, 0.42, 0, 0.1, 0.42, 0.1, metal, 0, 0, Math.PI / 2); pb.put(CITY_PG.cyl6, 0, 0.36, 0.15, 0.13, 0.12, 0.13, metal, Math.PI / 2);
  citySoftCircle(x, z, 0.2, g + 0.8);
}
function cityNewsbox(pb, x, z, ry, col) {
  const g = groundH(x, z); pb.frame(x, g, z, ry);
  pb.box(-0.24, 0.24, 0.3, 1.0, -0.21, 0.21, col); pb.box(-0.26, 0.26, 1.0, 1.05, -0.23, 0.23, cityCol('#1d2124'));
  pb.box(-0.19, 0.19, 0.6, 0.92, 0.205, 0.22, cityCol('#20303e')); pb.box(-0.12, 0.12, 0.62, 0.86, 0.215, 0.225, cityCol('#e8e4d8'));
  pb.box(-0.2, -0.16, 0, 0.3, -0.17, 0.17, cityCol('#2b2d31')); pb.box(0.16, 0.2, 0, 0.3, -0.17, 0.17, cityCol('#2b2d31'));
  citySoftCircle(x, z, 0.3, g + 1.05);
}
function cityPlanter(pb, x, z, ry, flowers) {
  const g = groundH(x, z); pb.frame(x, g, z, ry);
  pb.box(-0.68, 0.68, 0, 0.55, -0.68, 0.68, cityCol('#bdb5a8')); pb.box(-0.6, 0.6, 0.55, 0.58, -0.6, 0.6, cityCol('#3b2a1e'));
  if (flowers) { for (let k = 0; k < 3; k++) pb.put(CITY_PG.ico, cityRR(-0.3, 0.3), 0.74, cityRR(-0.3, 0.3), 0.5, 0.36, 0.5, cityPick([cityCol('#ff5f9e'), cityCol('#ffd23f'), cityCol('#ff8a3d'), cityCol('#f4f1ea')])); pb.put(CITY_PG.ico, 0, 0.66, 0, 1.0, 0.36, 1.0, cityCol('#3f7a32')); }
  else { pb.put(CITY_PG.cyl6, 0, 1.0, 0, 0.12, 1.0, 0.12, cityCol('#6b4b33')); pb.put(CITY_PG.ico, 0, 1.85, 0, 1.25, 1.1, 1.25, cityCol('#4d8a3a')); pb.put(CITY_PG.ico, 0.25, 2.2, 0.1, 0.8, 0.7, 0.8, cityCol('#5f9a40')); }
  citySoftCircle(x, z, 0.75, g + 0.6);
}
function cityDumpster(pb, x, z, ry) {
  const g = groundH(x, z); pb.frame(x, g, z, ry);
  const col = cityPick([cityCol('#2e5e3e'), cityCol('#2a4f7a'), cityCol('#6b4a2c'), cityCol('#3d4248')]);
  pb.box(-0.9, 0.9, 0.16, 1.18, -0.52, 0.52, col); pb.box(-0.95, 0.95, 0.9, 0.98, -0.56, 0.56, col);
  pb.put(CITY_PG.box, 0, 1.24, -0.04, 1.84, 0.06, 1.1, cityCol('#1f2326'), -0.12);
  const c = Math.cos(ry), s = Math.sin(ry);
  addCircleCollider(x + c * 0.45, z - s * 0.45, 0.55, g + 1.25, 'prop'); addCircleCollider(x - c * 0.45, z + s * 0.45, 0.55, g + 1.25, 'prop');
}
function citySignalHead(pb, hx, hy, hz, lens, visors) {
  pb.box(hx - 0.21, hx + 0.21, hy - 0.56, hy + 0.56, hz - 0.15, hz + 0.15, cityCol('#1d2024'));
  pb.box(hx - 0.32, hx + 0.32, hy - 0.68, hy + 0.68, hz - 0.18, hz - 0.15, cityCol('#0e0f11'));
  for (let k = 0; k < 3; k++) {
    const ly = hy + 0.36 - k * 0.36;
    if (visors) pb.box(hx - 0.15, hx + 0.15, ly + 0.13, ly + 0.155, hz + 0.15, hz + 0.34, cityCol('#14161a'));
    _cpbE.set(0, pb.ry, 0); _cpbQ.setFromEuler(_cpbE);
    lens.push({ x: pb.wx(hx, hz + 0.16), y: pb.by + ly, z: pb.wz(hx, hz + 0.16), q: _cpbQ.clone() });
  }
}
function cityBuildSignals(pb) {
  const HW = CITY.RW / 2, lens = [];
  const pole = cityCol('#3b3f46');
  for (let i = 0; i <= CITY.N; i++) for (let j = 0; j <= CITY.N; j++) {
    const nb = nodeNeighbors(i, j); if (nb.length < 3) continue;
    const node = { i, j, off: ((i * 5 + j * 3) % 7) * 4 + 0.5, s: [-1, -1], apps: [] };
    TSIG.nodes.set(i * 16 + j, node);
    const x = roadC(i), z = roadC(j);
    for (const [ni, nj] of nb) {
      const dx = Math.sign(i - ni), dz = Math.sign(j - nj), rx = -dz, rz = dx;
      const px = x - dx * (HW + 5.2) + rx * (HW + 0.75), pz = z - dz * (HW + 5.2) + rz * (HW + 0.75);
      pb.frame(px, 0.18, pz, Math.atan2(-dx, -dz));
      pb.put(CITY_PG.cyl6, 0, 0.06, 0, 0.42, 0.12, 0.42, pole); pb.put(CITY_PG.cyl6, 0, 3.0, 0, 0.2, 6.0, 0.2, pole);
      pb.box(-5.2, 0.05, 5.72, 5.86, -0.06, 0.06, pole);
      pb.box(-4.89, -4.81, 5.56, 5.73, -0.03, 0.03, pole);
      const app = { node, axis: dx !== 0 ? 0 : 1, lens: lens.length };
      citySignalHead(pb, -4.85, 5.0, 0, lens, true);
      citySignalHead(pb, 0, 3.15, 0.27, lens, false);
      // pedestrian box on the pole, facing across the crosswalk
      pb.box(-0.16, 0.16, 2.25, 2.62, -0.36, -0.12, cityCol('#1d2024'));
      node.apps.push(app); TSIG.apps.push(app);
      addCircleCollider(px, pz, 0.22, 7, 'lamp');
    }
  }
  const lg = new THREE.CircleGeometry(0.115, 8); lg.translate(0, 0, 0.012);
  const mesh = new THREE.InstancedMesh(lg, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), lens.length);
  const m = new THREE.Matrix4(), off = new THREE.Color(0.05, 0.05, 0.05);
  lens.forEach((l, k) => { _cpbP.set(l.x, l.y, l.z); _cpbS.set(1, 1, 1); m.compose(_cpbP, l.q, _cpbS); mesh.setMatrixAt(k, m); mesh.setColorAt(k, off); });
  mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);
  TSIG.lens = mesh; TSIG.lensPos = lens;
  TSIG.ON = [new THREE.Color(0.12, 1.6, 0.55), new THREE.Color(1.7, 0.9, 0.05), new THREE.Color(1.8, 0.07, 0.05)];
  TSIG.OFF = [new THREE.Color(0.02, 0.09, 0.05), new THREE.Color(0.1, 0.07, 0.01), new THREE.Color(0.11, 0.02, 0.02)];
}

// ---------- street furniture along every block ----------
function cityBuildFurniture(pb, tp) {
  let busN = 0;
  const NEWS = [cityCol('#2c5aa0'), cityCol('#e0b22d'), cityCol('#c0392b'), cityCol('#2f8f5b'), cityCol('#f4f1ea')];
  for (const b of blocks) {
    const sides = cityBlockSides(b);
    for (let si = 0; si < 4; si++) {
      const S = sides[si];
      const P = (t, ins) => [S.x + S.ux * t - S.nx * ins, S.z + S.uz * t - S.nz * ins];
      const ry = Math.atan2(S.nx, S.nz);
      const gasSide = b === (SPOT.gas && SPOT.gas.blk) && (si === 0 || si === 1);
      const lane = citySideLane(S);
      const dist = b.dist, park = b.type === 'park';
      // bus stop
      let bus = false;
      if (!park && !gasSide && b.type !== 'site' && busN < 16 && cityR() < 0.09) {
        bus = true; busN++;
        const [x, z] = P(32, 1.05); cityBuildBusStop(pb, tp, x, z, ry, lane, busN);
      }
      // curb-side parked cars
      if (!bus && !gasSide && b.type !== 'plaza' && cityR() < (dist === 'west' ? 0.42 : dist === 'glass' ? 0.2 : 0.3)) {
        const n = 1 + Math.floor(cityR() * 3), t0 = cityRR(18, 46 - n * 6.2);
        for (let k = 0; k < n; k++) {
          const [x, z] = P(t0 + k * 6.2, -1.75);
          SPOT.curbParking.push({ x, z, h: Math.atan2(lane.dx, lane.dz), key: lane.key, car: null });
        }
        SPOT.curbSegs.add(lane.key);
      }
      if (gasSide) continue;
      // bins, hydrants, benches, newspaper boxes, planters
      const binCol = dist === 'deco' ? cityCol('#3aa6b9') : dist === 'west' ? cityCol('#3d4248') : cityCol('#2f5640');
      { const [x, z] = P(cityR() < 0.5 ? 21 : 43, 0.6); cityBin(pb, x, z, binCol); }
      if (cityR() < 0.55) { const [x, z] = P(cityR() < 0.5 ? 25.5 : 37.5, 0.55); cityHydrant(pb, x, z, dist === 'deco' ? cityCol('#e2b33c') : null); }
      if (!bus) {
        if (cityR() < (dist === 'west' ? 0.25 : 0.5) || park) { const [x, z] = P(31, 1.05); cityBench(pb, x, z, ry); }
        if ((dist === 'glass' && cityR() < 0.55) || (dist === 'mid' && cityR() < 0.3)) {
          const n = 2 + Math.floor(cityR() * 2);
          for (let k = 0; k < n; k++) { const [x, z] = P(38.2 + k * 0.58, 0.55); cityNewsbox(pb, x, z, ry, cityPick(NEWS)); }
        }
      }
      if ((dist === 'glass' || dist === 'deco') && cityR() < 0.5) { const [x, z] = P(11.6, 1.0); cityPlanter(pb, x, z, ry, dist === 'deco'); }
      if ((dist === 'glass' || dist === 'deco') && cityR() < 0.4) { const [x, z] = P(51.5, 1.0); cityPlanter(pb, x, z, ry, dist === 'deco'); }
    }
  }
}
function cityBuildBusStop(pb, tp, x, z, ry, lane, n) {
  const g = groundH(x, z);
  pb.frame(x, g, z, ry);
  const frame = cityCol('#2b3038'), glass = cityCol('#a9c3cf'), roof = cityCol('#30353e');
  pb.box(-2.3, 2.3, 0.15, 2.3, -0.75, -0.7, glass);
  for (const sx of [-2.28, 2.28]) { pb.box(sx - 0.05, sx + 0.05, 0, 2.45, -0.78, -0.68, frame); pb.box(sx - 0.05, sx + 0.05, 0, 2.45, 0.55, 0.65, frame); pb.box(sx - 0.05, sx + 0.05, 0.15, 2.3, -0.7, 0.55, glass); }
  pb.box(-2.45, 2.45, 2.42, 2.56, -0.92, 0.85, roof); pb.box(-2.47, 2.47, 2.38, 2.42, 0.8, 0.87, cityCol('#3fe5ef'));
  pb.box(-2.3, 2.3, 0.12, 0.16, -0.75, 0.6, frame);
  // ad panel on the back, facing the sidewalk
  pb.box(-1.75, 1.75, 0.6, 2.1, -0.82, -0.76, frame);
  tp.add(pb.base, MATS.ads[n % MATS.ads.length], 3.3, 1.38, 0, 1.35, -0.83, Math.PI);
  // stop sign
  pb.put(CITY_PG.cyl, -2.95, 1.45, 0.45, 0.08, 2.9, 0.08, cityCol('#8d939b'));
  pb.box(-3.22, -2.68, 2.55, 3.05, 0.4, 0.44, cityCol('#1d5fbf')); pb.box(-3.12, -2.78, 2.62, 2.98, 0.44, 0.45, cityCol('#f4f1ea'));
  cityBench(pb, pb.wx(0, -0.25), pb.wz(0, -0.25), ry, g);
  pb.frame(x, g, z, ry);
  for (const lx of [-2.0, -0.7, 0.7, 2.0]) addCircleCollider(pb.wx(lx, -0.73), pb.wz(lx, -0.73), 0.35, g + 2.5, 'prop');
  const s = (x - lane.seg.sx) * lane.dx + (z - lane.seg.sz) * lane.dz;
  const stop = { x, z, ry, key: lane.key, s: clamp(s, 6, lane.seg.len - 6), waitSpots: [[pb.wx(1.4, 0.3), pb.wz(1.4, 0.3)], [pb.wx(-1.5, 0.35), pb.wz(-1.5, 0.35)], [pb.wx(2.9, 0.1), pb.wz(2.9, 0.1)]], waiting: [] };
  SPOT.busStops.push(stop); SPOT.busStopBySeg.set(lane.key, stop);
}

// ---------- parks, plaza, promenade ----------
function cityBuildParks(pb) {
  if (SPOT.plazaBenches) for (const [x, z, h] of SPOT.plazaBenches) cityBench(pb, x, z, h);
  if (SPOT.plaza) for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + Math.PI / 4; cityBin(pb, SPOT.plaza.x + Math.cos(a) * 15.5, SPOT.plaza.z + Math.sin(a) * 15.5); }
  for (const b of blocks) {
    if (b.type !== 'park') continue;
    for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const dd of [9, 19]) {
      for (const side of [-1, 1]) {
        if (cityR() < 0.35) continue;
        const x = b.cx + ax * dd + az * side * 2.7, z = b.cz + az * dd + ax * side * 2.7;
        if (collideCircle(x, z, 1.3).hit) continue;
        cityBench(pb, x, z, Math.atan2(-az * side, -ax * side));
      }
    }
    cityBin(pb, b.cx + 3, b.cz + 3); cityBin(pb, b.cx - 3, b.cz - 3);
  }
  // promenade benches face the ocean, between the palms
  for (let z = -270; z <= 270; z += 22) {
    if (Math.abs(z) < 16) continue;
    const zz = z + 5.5; if (collideCircle(289.6, zz, 1.2).hit) continue;
    cityBench(pb, 289.6, zz, Math.PI / 2);
  }
  for (let z = -259; z <= 259; z += 44) if (Math.abs(z) > 16) cityBin(pb, 289.0, z);
  // pier benches and photo spots
  for (let x = 318; x <= 366; x += 16) { cityBench(pb, x, 4.85, 0, 0.3); cityBench(pb, x + 8, -4.85, Math.PI, 0.3); }
  for (let x = 312; x <= 380; x += 5) { SPOT.photo.push({ x, z: 4.9, h: 0 }); SPOT.photo.push({ x: x + 2.5, z: -4.9, h: Math.PI }); }
  for (let z = -3.5; z <= 3.5; z += 1.75) SPOT.photo.push({ x: 383.4, z, h: Math.PI / 2 });
  SPOT.jog.push({ x0: 290.6, z0: -276, x1: 290.6, z1: 276 }, { x0: 298.4, z0: -262, x1: 298.4, z1: 262 });
  SPOT.stroll = [{ x0: 300, z0: 0.8, x1: 381, z1: 0.8 }, { x0: 300, z0: -1.2, x1: 381, z1: -1.2 }];
}

// ---------- beach: lifeguard towers, huts, volleyball ----------
function cityBuildBeach(pb, tp) {
  const cyan = cityCol('#5ad1e6'), white = cityCol('#f6f1e8'), red = cityCol('#d8343f');
  for (const z of SPOT.lifeguards) {
    pb.frame(301.5, 0, z, 0);
    pb.box(-1.5, 1.5, 2.3, 4.5, -1.5, 1.5, cyan); pb.box(-1.8, 1.8, 4.52, 4.78, -1.8, 1.8, white);
    pb.box(-1.52, 1.52, 3.4, 4.1, -1.52, 1.52, cityCol('#1d3a48'));
    for (const sx of [-1.2, 1.2]) for (const sz of [-1.2, 1.2]) pb.box(sx - 0.1, sx + 0.1, -0.2, 2.4, sz - 0.1, sz + 0.1, white);
    pb.put(CITY_PG.box, -2.4, 1.2, 0, 1, 0.15, 4.2, white, 0, 0, 0.5);
    pb.box(-1.62, -1.5, 2.6, 3.3, -0.9, 0.9, white);
    pb.put(CITY_PG.torus, -1.65, 2.95, 0, 0.9, 0.9, 0.9, red, 0, Math.PI / 2);
    pb.put(CITY_PG.cyl, 1.4, 6.0, 1.4, 0.06, 3.0, 0.06, white); pb.box(1.43, 1.47, 6.6, 7.4, 1.4, 2.6, z > 0 ? cityCol('#ffd23f') : red);
  }
  for (const z of [-26, 26]) {
    const x = 302.6, g = groundH(x, z);
    pb.frame(x, g, z, -Math.PI / 2);
    pb.box(-2.2, 2.2, 0, 2.6, -1.6, 1.6, cityCol('#f4efe6')); pb.box(-2.5, 2.5, 2.6, 2.85, -1.9, 1.9, red);
    pb.box(-0.5, 0.5, 0.2, 2.1, 1.6, 1.62, cityCol('#6b4b33')); pb.box(-1.9, -1.0, 1.1, 1.8, 1.6, 1.62, cityCol('#1d3a48')); pb.box(1.0, 1.9, 1.1, 1.8, 1.6, 1.62, cityCol('#1d3a48'));
    tp.add(pb.base, MATS.guard, 2.4, 0.6, 0, 2.3, 1.63, 0);
    pb.box(2.3, 2.38, 0.2, 2.2, 1.0, 1.2, cityCol('#f6c64a'));
    addBoxCollider(x - 1.6, x + 1.6, z - 2.2, z + 2.2, 3, 'prop');
  }
  // volleyball courts on the sand (net across x, court along z)
  for (const cz of [122, -118]) {
    const x0 = 300, x1 = 307, z0 = cz - 7, z1 = cz + 7, sl = 0.052;
    const lineY = (x) => groundH(x, cz) + 0.015;
    for (const x of [x0, x1]) pb.wbox(x - 0.05, x + 0.05, lineY(x) - 0.01, lineY(x) + 0.005, z0, z1, white);
    for (const z of [z0, z1, cz]) pb.wput(CITY_PG.box, (x0 + x1) / 2, lineY((x0 + x1) / 2) - 0.002, z, x1 - x0, 0.012, 0.1, white, 0, 0, -sl);
    for (const x of [299.4, 307.6]) { const g = groundH(x, cz); pb.wput(CITY_PG.cyl, x, g + 1.25, cz, 0.1, 2.6, 0.1, cityCol('#d9d4c8')); }
    pb.frame(303.5, lineY(303.5), cz, 0);
    pb.put(CITY_PG.box, 0, 2.0, 0, 8.2, 0.85, 0.03, cityCol('#2a2b2e'), 0, 0, -sl); pb.put(CITY_PG.box, 0, 2.42, 0, 8.2, 0.07, 0.045, white, 0, 0, -sl);
    SPOT.volley.push({ cx: 303.5, cz, x0, x1, z0, z1 });
  }
}

// ---------- gas station ----------
function cityBuildGas(pb, nb, tp) {
  const G = SPOT.gas; if (!G) return;
  const cx = (G.x0 + G.x1) / 2 + 2, cz = G.z0 + 14;
  const white = cityCol('#f4f2ec'), red = cityCol('#d8343f'), conc = cityCol('#c7c2b8'), dark = cityCol('#202328');
  // forecourt slab
  pb.wbox(G.x0, G.x1, 0.18, 0.2, G.z0, G.z1, cityCol('#8e8c88'));
  // canopy
  pb.frame(cx, 0.18, cz, 0);
  pb.box(-10, 10, 4.9, 5.6, -6.5, 6.5, white); pb.box(-10.05, 10.05, 4.9, 5.05, -6.55, 6.55, red);
  nb.frame(cx, 0.18, cz, 0); nb.box(-9.6, 9.6, 4.86, 4.9, -6.1, 6.1, cityCol('#fff6e0'));
  tp.add(pb.base, MATS.fascia, 20, 0.7, 0, 5.25, 6.56, 0); tp.add(pb.base, MATS.fascia, 20, 0.7, 0, 5.25, -6.56, Math.PI);
  for (const ix of [-5, 5]) {
    pb.box(ix - 0.6, ix + 0.6, 0, 0.25, -4.6, 4.6, conc);
    for (const pz of [-4.4, 4.4]) pb.box(ix - 0.15, ix + 0.15, 0.25, 4.9, pz - 0.15, pz + 0.15, cityCol('#9aa0a8'));
    for (const pz of [-2.0, 2.0]) {
      pb.box(ix - 0.35, ix + 0.35, 0.25, 1.85, pz - 0.28, pz + 0.28, white); pb.box(ix - 0.36, ix + 0.36, 1.55, 1.85, pz - 0.29, pz + 0.29, red);
      pb.box(ix - 0.37, ix + 0.37, 1.0, 1.35, pz - 0.18, pz + 0.18, dark);
      nb.frame(cx, 0.18, cz, 0); nb.box(ix - 0.38, ix + 0.38, 1.08, 1.27, pz - 0.12, pz + 0.12, cityCol('#7dffcf'));
      pb.frame(cx, 0.18, cz, 0);
      addBoxCollider(cx + ix - 0.4, cx + ix + 0.4, cz + pz - 0.32, cz + pz + 0.32, 2.0, 'prop');
    }
    addBoxCollider(cx + ix - 0.62, cx + ix + 0.62, cz - 4.6, cz + 4.6, 0.25, 'prop');
    for (const pz of [-4.4, 4.4]) addCircleCollider(cx + ix, cz + pz, 0.25, 5, 'prop');
  }
  // shop (gets the procedural facade) and its sign
  const shop = addBuilding(G.x0 + 1, G.x0 + 15, G.z1 - 9.5, G.z1 - 0.5, 4.6, '#ece6da', 0, 0.02);
  shop.lit = 0.75;
  pb.frame(G.x0 + 8, 0.18, G.z1 - 9.5, Math.PI);
  pb.box(-4.5, 4.5, 3.2, 4.2, -0.05, 0.25, cityCol('#1d4fbf'));
  tp.add(pb.base, MATS.fascia, 8.6, 0.9, 0, 3.7, 0.27, 0);
  // price pylon at the corner
  pb.frame(G.x1 - 2.5, 0.18, G.z0 + 2.5, Math.PI * 0.75);
  pb.box(-0.75, 0.75, 0, 0.6, -0.3, 0.3, conc); pb.box(-0.72, 0.72, 0.6, 6.6, -0.22, 0.22, cityCol('#1d4fbf'));
  tp.add(pb.base, MATS.fuel, 1.3, 2.6, 0, 4.9, 0.23, 0); tp.add(pb.base, MATS.fuel, 1.3, 2.6, 0, 4.9, -0.23, Math.PI);
  addCircleCollider(G.x1 - 2.5, G.z0 + 2.5, 0.8, 6.6, 'prop');
  cityBin(pb, cx - 10.8, cz + 7.5); cityBin(pb, G.x0 + 16.5, G.z1 - 4);
  SPOT.gasPumps = [[cx - 5, cz - 2], [cx - 5, cz + 2], [cx + 5, cz - 2], [cx + 5, cz + 2]];
  CITYX.glowPts.push({ x: cx, y: 4.6, z: cz, r: 1, g: 0.95, b: 0.85, s: 7, night: true });
}

// ---------- basketball court ----------
function cityBuildCourt(pb, tp) {
  const C = SPOT.court; if (!C) return;
  const cx = C.cx, cz = C.cz, x0 = cx - 14, x1 = cx + 14, z0 = cz - 7.5, z1 = cz + 7.5, y = 0.18;
  const white = cityCol('#f2efe6'), surf = cityCol('#b4553a'), key = cityCol('#2d5c8f');
  // all court parts in the court's own frame (world offsets relative to its centre)
  const B = (ax, bx, ay, by, az, bz, col) => { pb.frame(cx, 0, cz, 0); pb.box(ax - cx, bx - cx, ay, by, az - cz, bz - cz, col); };
  B(x0 - 1.6, x1 + 1.6, y, y + 0.03, z0 - 1.6, z1 + 1.6, cityCol('#5d6b62'));
  B(x0, x1, y + 0.03, y + 0.045, z0, z1, surf);
  const ly = y + 0.05, L = (ax, bx, az, bz) => B(ax, bx, ly - 0.004, ly, az, bz, white);
  L(x0, x1, z0, z0 + 0.08); L(x0, x1, z1 - 0.08, z1); L(x0, x0 + 0.08, z0, z1); L(x1 - 0.08, x1, z0, z1); L(cx - 0.04, cx + 0.04, z0, z1);
  for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; pb.frame(cx + Math.cos(a) * 1.8, ly - 0.002, cz + Math.sin(a) * 1.8, -a); pb.box(-0.04, 0.04, -0.003, 0.002, -0.36, 0.36, white); }
  C.hoops = [];
  for (const sx of [-1, 1]) {
    const bx = sx < 0 ? x0 : x1, hx = bx - sx * 1.6;
    B(Math.min(bx, bx - sx * 5.8), Math.max(bx, bx - sx * 5.8), ly - 0.006, ly - 0.002, cz - 2.45, cz + 2.45, key);
    for (let k = 0; k <= 12; k++) {
      const a = -Math.PI / 2 + k / 12 * Math.PI;
      pb.frame(hx - sx * Math.cos(a) * 6.75, ly - 0.002, cz + Math.sin(a) * 6.75, sx < 0 ? -a : a);
      pb.box(-0.04, 0.04, -0.003, 0.002, -0.9, 0.9, white);
    }
    // hoop: pole behind the baseline, board 1.2 m inside the court
    const px = bx + sx * 0.8;
    pb.frame(px, y, cz, sx < 0 ? Math.PI / 2 : -Math.PI / 2);
    pb.put(CITY_PG.cyl, 0, 1.6, 0, 0.18, 3.2, 0.18, cityCol('#3b3f46')); pb.box(-0.06, 0.06, 3.0, 3.12, 0, 2.0, cityCol('#3b3f46'));
    pb.box(-0.92, 0.92, 2.95, 4.0, 2.0, 2.05, white); pb.box(-0.3, 0.3, 3.05, 3.5, 2.05, 2.06, cityCol('#d8343f'));
    pb.put(CITY_PG.torus, 0, 3.05, 2.32, 0.46, 0.46, 0.46, cityCol('#ff6a1f'), Math.PI / 2);
    pb.put(CITY_PG.net, 0, 2.85, 2.32, 0.44, 0.38, 0.44, cityCol('#e8e8e8'));
    C.hoops.push([pb.wx(0, 2.32), y + 3.05, pb.wz(0, 2.32)]);
    addCircleCollider(px, cz, 0.25, 4, 'prop');
  }
  // chain-link fence with a gate on the north side
  const fx0 = x0 - 1.6, fx1 = x1 + 1.6, fz0 = z0 - 1.6, fz1 = z1 + 1.6, H = 3.6, post = cityCol('#5a5f66');
  const fence = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az) - Math.PI / 2;
    pb.frame((ax + bx) / 2, y, (az + bz) / 2, ry);
    tp.add(pb.base, MATS.chain, len, H, 0, H / 2, 0, 0, 0, 0.6);
    pb.box(-len / 2, len / 2, H - 0.05, H + 0.02, -0.04, 0.04, post);
    const n = Math.max(1, Math.round(len / 3));
    for (let k = 0; k <= n; k++) { const t = -len / 2 + k * len / n; pb.box(t - 0.04, t + 0.04, 0, H, -0.04, 0.04, post); }
    addBoxCollider(Math.min(ax, bx) - 0.08, Math.max(ax, bx) + 0.08, Math.min(az, bz) - 0.08, Math.max(az, bz) + 0.08, H, 'prop');
  };
  fence(fx0, fz0, cx - 2, fz0); fence(cx + 2, fz0, fx1, fz0); fence(fx0, fz1, fx1, fz1); fence(fx0, fz0, fx0, fz1); fence(fx1, fz0, fx1, fz1);
  cityBench(pb, cx - 5, fz1 - 0.7, Math.PI); cityBench(pb, cx + 5, fz1 - 0.7, Math.PI);
  C.x0 = x0; C.x1 = x1; C.z0 = z0; C.z1 = z1; C.gate = { x: cx, z: fz0 };
}

// ---------- construction site with tower cranes ----------
function cityBuildSite(pb, tp) {
  const S = SPOT.site; if (!S) return;
  const conc = cityCol('#a9a59c'), ply = cityCol('#c9a56c'), blue = cityCol('#1b5f8c');
  const y = 0.18, scx = (S.x0 + S.x1) / 2, scz = (S.z0 + S.z1) / 2;
  const B = (ax, bx, ay, by, az, bz, col) => { pb.frame(scx, 0, scz, 0); pb.box(ax - scx, bx - scx, ay, by, az - scz, bz - scz, col); };
  // hoarding with banners on the street faces and a gate on the west side
  const gz0 = scz - 4, gz1 = scz + 4;
  const wall = (ax, az, bx, bz, banner) => {
    const len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az) - Math.PI / 2;
    pb.frame((ax + bx) / 2, y, (az + bz) / 2, ry);
    pb.box(-len / 2, len / 2, 0, 2.7, -0.06, 0.06, ply); pb.box(-len / 2, len / 2, 2.7, 2.9, -0.08, 0.08, blue);
    for (let t = -len / 2; t <= len / 2; t += 2.5) pb.box(t - 0.05, t + 0.05, 0, 2.9, 0.06, 0.14, cityCol('#8a6a3c'));
    if (banner) for (let t = -len / 2 + 2; t + 9.6 < len / 2 - 1; t += 14) tp.add(pb.base, MATS.hoard, 9.6, 2.4, t + 4.8, 1.4, -0.07, Math.PI);
    addBoxCollider(Math.min(ax, bx) - 0.1, Math.max(ax, bx) + 0.1, Math.min(az, bz) - 0.1, Math.max(az, bz) + 0.1, 2.9, 'prop');
  };
  wall(S.x0, S.z0, S.x1, S.z0, true); wall(S.x1, S.z0, S.x1, S.z1, true); wall(S.x1, S.z1, S.x0, S.z1, true);
  wall(S.x0, S.z1, S.x0, gz1, false); wall(S.x0, gz0, S.x0, S.z0, false);
  // concrete frame of the future tower
  const fx0 = S.x0 + 9, fx1 = fx0 + 30, fz0 = S.z0 + 8, fz1 = fz0 + 26, FH = 3.6, floors = 10;
  for (let k = 0; k <= floors; k++) {
    const fy = y + k * FH;
    if (k < floors - 1) B(fx0, fx1, fy, fy + 0.35, fz0, fz1, conc);
    else if (k === floors - 1) B(fx0, fx0 + 17, fy, fy + 0.35, fz0, fz1, conc);
    if (k === floors) break;
    for (let ix = 0; ix < 5; ix++) for (let iz = 0; iz < 4; iz++) {
      if (k >= floors - 1 && ix > 2) continue;
      const cxp = lerp(fx0 + 0.4, fx1 - 0.4, ix / 4), czp = lerp(fz0 + 0.4, fz1 - 0.4, iz / 3);
      B(cxp - 0.32, cxp + 0.32, fy + 0.35, fy + FH, czp - 0.32, czp + 0.32, conc);
    }
  }
  for (let ix = 0; ix < 3; ix++) for (let iz = 0; iz < 4; iz++) {
    const cxp = lerp(fx0 + 0.4, fx1 - 0.4, ix / 4), czp = lerp(fz0 + 0.4, fz1 - 0.4, iz / 3);
    for (let r = 0; r < 4; r++) { const ox = (r % 2) * 0.32 - 0.16, oz = (r >> 1) * 0.32 - 0.16; B(cxp + ox - 0.02, cxp + ox + 0.02, y + floors * FH, y + floors * FH + 1.3, czp + oz - 0.02, czp + oz + 0.02, cityCol('#5b3b2a')); }
  }
  // safety netting on the upper floors
  pb.frame((fx0 + fx1) / 2, y, fz1 + 0.3, 0); tp.add(pb.base, MATS.netting, fx1 - fx0, FH * 4, 0, FH * 7.5, 0, 0);
  pb.frame(fx1 + 0.3, y, (fz0 + fz1) / 2, Math.PI / 2); tp.add(pb.base, MATS.netting, fz1 - fz0, FH * 3, 0, FH * 7, 0, 0);
  addBoxCollider(fx0, fx1, fz0, fz1, y + floors * FH, 'b');
  // site cabins, materials, a portable toilet
  for (let k = 0; k < 3; k++) {
    const bx = S.x1 - 4, lv = k === 2 ? 1 : 0, bz = k === 2 ? S.z1 - 5.5 : S.z1 - 4 - k * 3.0;
    B(bx - 3, bx + 3, y + lv * 2.6, y + 2.5 + lv * 2.6, bz - 1.2, bz + 1.2, k === 1 ? cityCol('#d8343f') : cityCol('#e9e4d8'));
    B(bx - 3.05, bx - 2.95, y + 0.4 + lv * 2.6, y + 2.0 + lv * 2.6, bz - 0.4, bz + 0.4, cityCol('#3b3f46'));
  }
  addBoxCollider(S.x1 - 7.1, S.x1 - 0.9, S.z1 - 11.4, S.z1 - 2.6, 5.4, 'prop');
  B(S.x0 + 3, S.x0 + 4.2, y, y + 2.3, S.z1 - 3, S.z1 - 1.8, cityCol('#2c7be5'));
  pb.wput(CITY_PG.cone, S.x0 + 6, y + 0.9, S.z0 + 5, 6, 1.8, 6, cityCol('#cdb486'));
  for (let k = 0; k < 4; k++) { B(S.x0 + 14 + k * 1.6, S.x0 + 15.2 + k * 1.6, y, y + 0.15, S.z1 - 4, S.z1 - 2.8, cityCol('#9a7a4a')); B(S.x0 + 14.1 + k * 1.6, S.x0 + 15.1 + k * 1.6, y + 0.15, y + 1.0, S.z1 - 3.9, S.z1 - 2.9, cityCol('#a4553c')); }
  for (let k = 0; k < 10; k++) B(S.x0 + 4, S.x0 + 12, y + 0.05 + k * 0.035, y + 0.08 + k * 0.035, S.z0 + 11 + k * 0.08, S.z0 + 11.04 + k * 0.08, cityCol('#5b3b2a'));
  // tower cranes: static lattice masts + rotating jib groups
  const mastGeos = [];
  const cranes = [[S.x1 - 6, S.z0 + 5, 50, 36, 0.4], [S.x0 + 4.5, S.z1 - 17, 42, 28, 2.6]];
  const cable = (sb, ay, az, by, bz) => { const dy = by - ay, dz = bz - az, len = Math.hypot(dy, dz); sb.put(CITY_PG.box, 0, (ay + by) / 2, (az + bz) / 2, 0.05, 0.05, len, cityCol('#3a3a3a'), Math.atan2(-dy, dz)); };
  for (const [mx, mz, H, J, a0] of cranes) {
    const mg = cityTiledBox(2.0, H, 2.0, 0.5); mg.translate(mx, y + H / 2, mz); mastGeos.push(mg);
    pb.wbox(mx - 2.2, mx + 2.2, y, y + 0.9, mz - 2.2, mz + 2.2, conc);
    addBoxCollider(mx - 1.2, mx + 1.2, mz - 1.2, mz + 1.2, y + H, 'prop');
    const grp = new THREE.Group(); grp.position.set(mx, y + H, mz); grp.rotation.y = a0;
    const jib = cityTiledBox(1.6, 1.6, J, 0.5); jib.translate(0, 0.8, J / 2 + 1);
    const cj = cityTiledBox(1.4, 1.2, 12, 0.5); cj.translate(0, 0.6, -7);
    const top = cityTiledBox(1.6, 6, 1.6, 0.5); top.translate(0, 3.8, 0);
    const jm = new THREE.Mesh(mergeGeos([jib, cj, top]), MATS.lattice); jm.castShadow = true; grp.add(jm);
    const sb = new CityPropBatch(MATS.furn, true, 1e6); sb.frame(0, 0, 0, 0);
    sb.box(-1.4, 1.4, -0.6, 1.8, -12.8, -10.0, conc);
    sb.box(-0.9, 0.9, -1.0, 1.0, 0.8, 2.6, cityCol('#f4f1ea')); sb.box(-0.86, 0.86, -0.4, 0.6, 2.61, 2.65, cityCol('#20303e'));
    cable(sb, 6.8, 0, 1.6, J * 0.7); cable(sb, 6.8, 0, 1.2, -12);
    const tz = J * 0.62;
    sb.box(-0.7, 0.7, -0.35, 0.05, tz - 0.8, tz + 0.8, cityCol('#ffc21a'));
    sb.box(-0.025, 0.025, -H + 22, -0.35, tz - 0.025, tz + 0.025, cityCol('#2a2a2a'));
    sb.box(-0.35, 0.35, -H + 21, -H + 22, tz - 0.3, tz + 0.3, cityCol('#ffc21a'));
    sb.box(-0.6, 0.6, -H + 19.6, -H + 20.4, tz - 0.6, tz + 0.6, cityCol('#6b6f76'));
    sb.build(); for (const m of sb.meshes) { scene.remove(m); m.matrixAutoUpdate = true; grp.add(m); }
    scene.add(grp);
    CITYX.cranes.push({ g: grp, a0, ph: cityR() * TAU, sp: cityRR(0.05, 0.09), H, J, x: mx, z: mz, y });
  }
  const mm = new THREE.Mesh(mergeGeos(mastGeos), MATS.lattice); mm.castShadow = true; scene.add(mm);
}

// ---------- night club ----------
function cityBuildClub(pb, nb, tp) {
  const C = SPOT.club; if (!C) return;
  const b = C.b, x = b.x1, cz = C.z, y = 0.18;
  pb.frame(x, y, cz, Math.PI / 2);   // local +z = east (street), local +x = -z (north)
  tp.add(pb.base, MATS.club, 10, 2.5, 0, 7.6, 0.09, 0);
  pb.box(-5.4, 5.4, 6.25, 8.95, 0.0, 0.07, cityCol('#0a0612'));
  pb.box(-3.2, 3.2, 3.1, 3.35, 0, 2.6, cityCol('#14101c')); pb.box(-1.4, 1.4, 0, 2.7, 0, 0.06, cityCol('#0c0a10'));
  pb.box(-1.2, 1.2, 0.0, 0.012, 0.06, 4.0, cityCol('#7a0f22'));
  for (let k = 0; k <= 6; k++) { const lx = -1.6 - k * 1.25; pb.put(CITY_PG.cyl, lx, 0.5, 3.4, 0.07, 1.0, 0.07, cityCol('#c9a640')); pb.put(CITY_PG.sph, lx, 1.02, 3.4, 0.11, 0.11, 0.11, cityCol('#c9a640')); if (k < 6) pb.box(lx - 1.25, lx, 0.82, 0.86, 3.38, 3.42, cityCol('#a3122a')); }
  nb.frame(x, y, cz, Math.PI / 2);
  const hz = (b.z1 - b.z0) / 2 - 0.3;
  nb.box(-hz - 0.07, -hz + 0.07, 0.3, b.h - 1.2, 0.05, 0.17, cityCol('#3fe5ef')); nb.box(hz - 0.07, hz + 0.07, 0.3, b.h - 1.2, 0.05, 0.17, cityCol('#ff3f8e'));
  nb.box(-hz, hz, b.h - 1.35, b.h - 1.2, 0.05, 0.17, cityCol('#7a5cff'));
  nb.box(-3.2, 3.2, 3.05, 3.1, 2.5, 2.62, cityCol('#ff3f8e'));
  C.queue = []; for (let k = 0; k < 8; k++) C.queue.push({ x: pb.wx(-2.2 - k * 0.85, 4.1), z: pb.wz(-2.2 - k * 0.85, 4.1), h: Math.atan2(pb.wx(1, 0) - pb.wx(0, 0), pb.wz(1, 0) - pb.wz(0, 0)) });
  C.bouncer = { x: pb.wx(1.9, 1.0), z: pb.wz(1.9, 1.0), h: Math.PI / 2 };
  // rooftop lasers (animated at night)
  const lg = new THREE.CylinderGeometry(0.02, 0.9, 90, 6, 1, true); lg.translate(0, 45, 0);
  const cols = [0x3fe5ef, 0xff3f8e, 0x8dff7a, 0x7a5cff];
  for (let k = 0; k < 4; k++) {
    const m = new THREE.Mesh(lg, new THREE.MeshBasicMaterial({ color: cols[k], transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    m.position.set(lerp(b.x0 + 2, b.x1 - 2, (k + 0.5) / 4), b.h + 0.3, lerp(b.z0 + 2, b.z1 - 2, k % 2 ? 0.25 : 0.75)); m.visible = false; m.frustumCulled = false; scene.add(m);
    CITYX.lasers.push({ m, ph: k * 1.7 });
  }
  CITYX.glowPts.push({ x: x + 0.4, y: 7.6, z: cz, r: 1.4, g: 0.2, b: 0.6, s: 9, night: true });
}

// ---------- rooftops: AC units, water tanks, deco fins ----------
function cityBuildRoofs(pb, nb, ps) {
  const ac = cityCol('#c9ccce'), acd = cityCol('#9aa0a6'), fan = cityCol('#2a2d31'), wood = cityCol('#7b5a3c'), band = cityCol('#3a2e24');
  for (const b of bInst) {
    if (b.roof === false || b.club) continue;
    const w = b.x1 - b.x0, d = b.z1 - b.z0, t = b.top;
    if (w < 5 || d < 5) continue;
    const n = t > 70 ? 2 : Math.min(5, 1 + Math.floor(w * d / 90));
    for (let k = 0; k < n; k++) {
      const x = cityRR(b.x0 + 1.6, b.x1 - 1.6), z = cityRR(b.z0 + 1.6, b.z1 - 1.6);
      ps.frame(x, t, z, cityR() < 0.5 ? 0 : Math.PI / 2);
      ps.box(-0.55, 0.55, 0, 0.85, -0.5, 0.5, ac); ps.box(-0.36, 0.36, 0.85, 0.89, -0.36, 0.36, fan);
    }
    const blk = cityBlockAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
    if (blk && (blk.dist === 'west' || blk.dist === 'mid') && t < 42 && t > 8 && w > 7 && d > 7 && cityHash(b.x0, b.z1) < 0.45) {
      const x = b.x0 + 2.4, z = b.z1 - 2.4;
      pb.frame(x, t, z, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) pb.box(sx * 1.0 - 0.1, sx * 1.0 + 0.1, 0, 2.2, sz * 1.0 - 0.1, sz * 1.0 + 0.1, cityCol('#3a3d42'));
      pb.box(-1.25, 1.25, 2.2, 2.35, -1.25, 1.25, cityCol('#3a3d42'));
      pb.put(CITY_PG.cyl16, 0, 3.85, 0, 2.7, 3.0, 2.7, wood);
      for (const yy of [2.9, 3.9, 4.9]) pb.put(CITY_PG.cyl16, 0, yy, 0, 2.76, 0.09, 2.76, band);
      pb.put(CITY_PG.cone, 0, 5.75, 0, 3.0, 0.85, 3.0, cityCol('#2f2a26'));
    }
    if (b.deco && b.y0 === 0 && t > 10 && (cityHash(b.z0, b.x1) < 0.55)) {
      // streamline fin with a neon edge, facing the ocean (+x)
      const fz = (b.z0 + b.z1) / 2;
      pb.frame(b.x1, 0.18, fz, 0);
      pb.box(-0.1, 0.6, t * 0.35, t + 3.5, -0.45, 0.45, cityCol('#fbf6ee'));
      for (let yy = 4.2; yy < t - 1; yy += 3.4) pb.box(0, 0.55, yy, yy + 0.12, -(b.z1 - b.z0) / 2 + 0.6, (b.z1 - b.z0) / 2 - 0.6, cityCol('#fbf6ee'));
      nb.frame(b.x1, 0.18, fz, 0); nb.box(0.6, 0.68, t * 0.35, t + 3.5, -0.05, 0.05, cityPick([cityCol('#ff3f8e'), cityCol('#3fe5ef'), cityCol('#ffd23f'), cityCol('#8dff7a')]));
    }
  }
}

// ---------- fire escapes on low-rise walk-ups ----------
function cityBuildFireEscapes(pb) {
  const iron = cityCol('#2b2c30'), rust = cityCol('#4a3326');
  for (const b of buildings) {
    if (b.club || b === SPOT.garageBld) continue;
    const blk = cityBlockAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
    if (!blk || (blk.dist !== 'west' && blk.dist !== 'mid')) continue;
    if (b.h < 9 || b.h > 44 || cityHash(b.x1, b.z0) > (blk.dist === 'west' ? 0.7 : 0.3)) continue;
    // facade facing the nearest street
    const cands = [[b.x0 - blk.x0, -1, 0], [blk.x1 - b.x1, 1, 0], [b.z0 - blk.z0, 0, -1], [blk.z1 - b.z1, 0, 1]].sort((p, q) => p[0] - q[0]);
    const [, nx, nz] = cands[0];
    const facadeLen = nx !== 0 ? b.z1 - b.z0 : b.x1 - b.x0;
    if (facadeLen < 6) continue;
    const W = Math.min(4.8, facadeLen - 1.6), col = blk.dist === 'west' ? rust : iron;
    const wxp = nx !== 0 ? (nx > 0 ? b.x1 : b.x0) : lerp(b.x0, b.x1, 0.35);
    const wzp = nz !== 0 ? (nz > 0 ? b.z1 : b.z0) : lerp(b.z0, b.z1, 0.35);
    pb.frame(wxp, 0.18, wzp, Math.atan2(nx, nz));
    const floors = Math.floor((b.h - 1.5) / 3.4);
    for (let k = 1; k <= floors; k++) {
      const yy = k * 3.4 + 0.05;
      pb.box(-W / 2, W / 2, yy, yy + 0.07, 0.02, 1.15, col);
      pb.box(-W / 2, W / 2, yy + 0.95, yy + 1.0, 1.1, 1.15, col); pb.box(-W / 2, W / 2, yy + 0.5, yy + 0.53, 1.12, 1.15, col);
      for (const ex of [-W / 2, W / 2]) pb.box(ex - 0.025, ex + 0.025, yy, yy + 1.0, 0.02, 1.15, col);
      if (k > 1) {
        const dir = k % 2 ? 1 : -1, run = W - 1.4, len = Math.hypot(run, 3.4);
        pb.put(CITY_PG.box, 0, yy - 1.7, 0.55, len, 0.06, 0.62, col, 0, 0, dir * Math.atan2(3.4, run));
        pb.put(CITY_PG.box, 0, yy - 1.7 + 0.5, 0.86, len, 0.03, 0.03, col, 0, 0, dir * Math.atan2(3.4, run));
      }
    }
    if (floors >= 1) { const lx = W / 2 - 0.45; pb.box(lx - 0.25, lx - 0.21, 1.3, 3.45, 0.7, 0.74, col); pb.box(lx + 0.21, lx + 0.25, 1.3, 3.45, 0.7, 0.74, col); for (let yy = 1.6; yy < 3.4; yy += 0.45) pb.box(lx - 0.23, lx + 0.23, yy, yy + 0.03, 0.7, 0.74, col); }
  }
}

// ---------- alleys: dumpsters, graffiti ----------
function cityBuildAlleys(pb, tp) {
  for (const b of blocks) {
    if (!b.grid || b.type === 'site') continue;
    const { nx, nz, w, d, L0 } = b.grid;
    for (let i = 1; i < nx; i++) {
      const gx = L0[0] + i * (w + 2.5) - 1.25;
      for (const [gz, ry] of [[L0[2] + 2.0, 0], [L0[3] - 2.0, Math.PI]]) {
        if (cityR() < 0.45 || pointInBuilding(gx, gz) || collideCircle(gx, gz, 1.0).hit) continue;
        cityDumpster(pb, gx, gz, Math.PI / 2 + ry);
      }
    }
    for (let j = 1; j < nz; j++) {
      const gz = L0[2] + j * (d + 2.5) - 1.25;
      for (const gx of [L0[0] + 2.0, L0[1] - 2.0]) {
        if (cityR() < 0.45 || pointInBuilding(gx, gz) || collideCircle(gx, gz, 1.0).hit) continue;
        cityDumpster(pb, gx, gz, 0);
      }
    }
  }
  // graffiti on west-side walls facing the street
  for (const b of buildings) {
    if (!b.gritty || cityHash(b.z1, b.x0) > 0.42) continue;
    const blk = cityBlockAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2); if (!blk) continue;
    const cands = [[b.x0 - blk.x0, -1, 0], [blk.x1 - b.x1, 1, 0], [b.z0 - blk.z0, 0, -1], [blk.z1 - b.z1, 0, 1]].sort((p, q) => p[0] - q[0]);
    const [, nx, nz] = cands[0];
    const len = nx !== 0 ? b.z1 - b.z0 : b.x1 - b.x0; if (len < 6) continue;
    const t = Math.floor(cityHash(b.x0, b.z0) * 4), u = cityRR(-len / 2 + 2.2, len / 2 - 2.2);
    const wxp = nx !== 0 ? (nx > 0 ? b.x1 : b.x0) : (b.x0 + b.x1) / 2, wzp = nz !== 0 ? (nz > 0 ? b.z1 : b.z0) : (b.z0 + b.z1) / 2;
    pb.frame(wxp, 0.18, wzp, Math.atan2(nx, nz));
    tp.add(pb.base, MATS.graffiti, 3.6, 1.8, u, 1.55, 0.03, 0, 0, 0, [t / 4, 0, (t + 1) / 4, 1]);
  }
}

function buildLivingCity() {
  cityInitPG(); makeCityTextures();
  SPOT.benches = []; SPOT.busStops = []; SPOT.busStopBySeg = new Map(); SPOT.curbParking = []; SPOT.curbSegs = new Set();
  SPOT.photo = []; SPOT.jog = []; SPOT.volley = [];
  MATS.furn = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.74, metalness: 0.08 });
  MATS.neonTube = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  MATS.club = new THREE.MeshBasicMaterial({ map: CITY_TEX.club, toneMapped: false });
  MATS.fuel = new THREE.MeshBasicMaterial({ map: CITY_TEX.fuel, toneMapped: false });
  MATS.fascia = new THREE.MeshStandardMaterial({ map: CITY_TEX.fascia, roughness: 0.5, emissive: new THREE.Color('#ffffff'), emissiveMap: CITY_TEX.fascia, emissiveIntensity: 0.1 });
  MATS.hoard = new THREE.MeshStandardMaterial({ map: CITY_TEX.hoard, roughness: 0.8 });
  MATS.guard = new THREE.MeshStandardMaterial({ map: CITY_TEX.guard, roughness: 0.7 });
  MATS.lattice = new THREE.MeshStandardMaterial({ map: CITY_TEX.lattice, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.3 });
  MATS.lattice.map.wrapS = MATS.lattice.map.wrapT = THREE.RepeatWrapping;
  MATS.chain = new THREE.MeshStandardMaterial({ map: CITY_TEX.chain, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.6 });
  MATS.graffiti = new THREE.MeshStandardMaterial({ map: CITY_TEX.graffiti, transparent: true, alphaTest: 0.05, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false });
  MATS.netting = new THREE.MeshStandardMaterial({ color: 0x2f8a4a, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, roughness: 0.9 });
  CITYX.signMats.push(MATS.club, MATS.fuel); CITYX.neonMats.push(MATS.neonTube); CITYX.fascia = MATS.fascia;
  const pb = new CityPropBatch(MATS.furn, true, 160, 0), nb = new CityPropBatch(MATS.neonTube, false, 160, 0), tp = new CityTexPlanes();
  const ps = new CityPropBatch(MATS.furn, false, 100, 150), pm = new CityPropBatch(MATS.furn, false, 160, 270);
  cityBuildSignals(pm);
  cityBuildFurniture(ps, tp);
  cityBuildParks(ps);
  cityBuildBeach(pb, tp);
  cityBuildGas(pb, nb, tp);
  cityBuildCourt(pb, tp);
  cityBuildSite(pb, tp);
  cityBuildClub(pb, nb, tp);
  cityBuildRoofs(pb, nb, ps);
  cityBuildFireEscapes(pm);
  cityBuildAlleys(ps, tp);
  pb.build(); nb.build(); ps.build(); pm.build(); tp.build();
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
  // landmarks
  if (SPOT.site) { const S = SPOT.site; g.fillStyle = '#5a5132'; g.fillRect(X(S.x0), Z(S.z0), (S.x1 - S.x0) * s, (S.z1 - S.z0) * s); g.strokeStyle = '#ffc21a'; g.lineWidth = 2; g.strokeRect(X(S.x0), Z(S.z0), (S.x1 - S.x0) * s, (S.z1 - S.z0) * s); }
  if (SPOT.court && SPOT.court.x0 !== undefined) { const C = SPOT.court; g.fillStyle = '#9a4a33'; g.fillRect(X(C.x0), Z(C.z0), (C.x1 - C.x0) * s, (C.z1 - C.z0) * s); }
  if (SPOT.gas) { const G = SPOT.gas; g.fillStyle = '#4a5a72'; g.fillRect(X(G.x0), Z(G.z0), (G.x1 - G.x0) * s, (G.z1 - G.z0 - 10) * s); }
  if (SPOT.club) { const b = SPOT.club.b; g.fillStyle = '#7a2a5a'; g.fillRect(X(b.x0), Z(b.z0), (b.x1 - b.x0) * s, (b.z1 - b.z0) * s); }
  if (SPOT.volley) { g.fillStyle = '#e9d3a0'; for (const v of SPOT.volley) g.fillRect(X(v.x0), Z(v.z0), (v.x1 - v.x0) * s, (v.z1 - v.z0) * s); }
  MAP.canvas = c;
}
