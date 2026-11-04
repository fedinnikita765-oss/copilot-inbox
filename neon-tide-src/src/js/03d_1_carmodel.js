// ============================================================
//  Car models (owner: models & driving)
//  Bodies are lofted from cross-sections (smooth sides, tumblehome, real wheel arches) and textured from one
//  procedurally painted atlas: windows, seams, handles, grilles and liveries are drawn per type in the loft's
//  (arc length, length) space. Glass has alpha 0, so the same geometry rendered with BackSide + alphaTest becomes
//  the cabin's inner shell for first-person driving. Damage uses shared morph targets (crumple per side).
// ============================================================
// Monotone cubic interpolation through [x, y] knots (no overshoot).
function carCurve(k) {
  const n = k.length, xs = k.map((p) => p[0]), ys = k.map((p) => p[1]), d = [], m = [];
  if (n === 1) return () => ys[0];
  for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

// ---------- body shapes ----------
// z values are fractions of the length (-0.5 rear .. 0.5 front); heights in metres; widths are fractions of W/2.
// g: greenhouse [deck/rear end, roof rear, roof front, cowl]. seams: door shut lines. glass: side glass z range.
const CARSPEC = {
  coupe: {
    axF: 0.315, axR: -0.3,
    yb: [[-0.5, 0.42], [-0.47, 0.29], [-0.38, 0.24], [0.38, 0.24], [0.47, 0.28], [0.5, 0.38]],
    belt: [[-0.5, 0.79], [-0.48, 0.88], [-0.4, 0.94], [-0.1, 0.93], [0.2, 0.89], [0.36, 0.84], [0.47, 0.77], [0.5, 0.7]],
    roof: [[-0.42, 0.88], [-0.3, 1.1], [-0.13, 1.3], [0.0, 1.33], [0.08, 1.325], [0.17, 1.16], [0.28, 0.86]],
    g: [-0.38, -0.12, 0.08, 0.265], w: [[-0.5, 0.82], [-0.47, 0.93], [-0.4, 0.99], [0.0, 1.0], [0.38, 0.99], [0.46, 0.93], [0.5, 0.83]],
    wg: 0.86, rw: 0.7, crown: [[-0.5, 0.02], [0, 0.045], [0.5, 0.03]], bulge: 0.018,
    seams: [0.215, -0.13], glass: [-0.22, 0.24], bpil: null, handles: [-0.1], hood: 0.27, trunk: -0.39,
    head: { shape: 'slim', w: 0.44, h: 0.1 }, tail: { shape: 'slim', w: 0.5, h: 0.09, inner: true },
    rakeF: 0.42, rakeYF: 0.36, planF: 0.16, rakeR: 0.2, rakeYR: 0.5, planR: 0.12,
    style: { skirt: 0.07, grille: 'mesh', exhaust: 2, rim: 'sport', rimMat: 'gun', lip: true, charLine: true },
  },
  sedan: {
    axF: 0.31, axR: -0.305,
    yb: [[-0.5, 0.45], [-0.47, 0.31], [-0.38, 0.26], [0.38, 0.26], [0.47, 0.31], [0.5, 0.42]],
    belt: [[-0.5, 0.86], [-0.48, 0.95], [-0.42, 0.99], [-0.2, 1.0], [0.1, 0.99], [0.3, 0.95], [0.45, 0.88], [0.5, 0.8]],
    roof: [[-0.37, 0.94], [-0.29, 1.18], [-0.17, 1.43], [-0.05, 1.47], [0.1, 1.455], [0.19, 1.22], [0.29, 0.93]],
    g: [-0.34, -0.17, 0.1, 0.27], w: [[-0.5, 0.84], [-0.47, 0.94], [-0.41, 0.99], [0.0, 1.0], [0.39, 0.99], [0.47, 0.94], [0.5, 0.84]],
    wg: 0.88, rw: 0.74, crown: [[-0.5, 0.02], [0, 0.05], [0.5, 0.03]], bulge: 0.02,
    seams: [0.2, -0.02, -0.22], glass: [-0.27, 0.245], bpil: -0.02, cpil: null, handles: [0.03, -0.18], hood: 0.275, trunk: -0.35,
    head: { shape: 'rect', w: 0.46, h: 0.14 }, tail: { shape: 'rect', w: 0.5, h: 0.13, inner: true },
    rakeF: 0.32, rakeYF: 0.4, planF: 0.13, rakeR: 0.16, rakeYR: 0.5, planR: 0.1,
    style: { grille: 'bars', exhaust: 1, rim: 'multi', rimMat: 'silver', charLine: true, chromeBelt: true },
  },
  suv: {
    axF: 0.315, axR: -0.3,
    yb: [[-0.5, 0.58], [-0.47, 0.45], [-0.38, 0.4], [0.38, 0.4], [0.47, 0.45], [0.5, 0.56]],
    belt: [[-0.5, 1.1], [-0.46, 1.17], [-0.2, 1.2], [0.2, 1.19], [0.38, 1.15], [0.47, 1.09], [0.5, 1.02]],
    roof: [[-0.52, 1.8], [-0.45, 1.85], [-0.1, 1.87], [0.12, 1.86], [0.2, 1.62], [0.31, 1.12]],
    g: [-0.5, -0.45, 0.12, 0.305], w: [[-0.5, 0.87], [-0.47, 0.95], [-0.42, 0.99], [0.0, 1.0], [0.4, 0.99], [0.47, 0.95], [0.5, 0.87]],
    wg: 0.9, rw: 0.84, crown: [[-0.5, 0.015], [0, 0.04], [0.5, 0.03]], bulge: 0.015,
    seams: [0.205, -0.04, -0.25], glass: [-0.43, 0.25], bpil: -0.04, cpil: -0.28, handles: [0.0, -0.21], hood: 0.31, trunk: null,
    head: { shape: 'rect', w: 0.5, h: 0.16 }, tail: { shape: 'tall', w: 0.2, h: 0.36, up: 0.32 },
    rakeF: 0.22, rakeYF: 0.55, planF: 0.1, rakeR: 0.06, rakeYR: 0.6, planR: 0.08,
    style: { blackLower: 0.1, blackBumper: 0.2, grille: 'big', exhaust: 1, rim: 'six', rimMat: 'silver', rails: true, rearGlass: [1.38, 1.78] },
  },
  muscle: {
    axF: 0.3, axR: -0.31,
    yb: [[-0.5, 0.44], [-0.47, 0.31], [-0.38, 0.27], [0.38, 0.27], [0.47, 0.3], [0.5, 0.42]],
    belt: [[-0.5, 0.9], [-0.46, 0.97], [-0.2, 0.98], [0.15, 0.975], [0.4, 0.955], [0.5, 0.9]],
    roof: [[-0.37, 0.95], [-0.27, 1.17], [-0.18, 1.355], [-0.08, 1.38], [0.02, 1.37], [0.1, 1.15], [0.18, 0.95]],
    g: [-0.34, -0.18, 0.02, 0.17], w: [[-0.5, 0.88], [-0.47, 0.96], [-0.41, 0.995], [0.0, 1.0], [0.41, 0.995], [0.47, 0.96], [0.5, 0.9]],
    wg: 0.86, rw: 0.72, crown: [[-0.5, 0.015], [0, 0.03], [0.5, 0.02]], bulge: 0.012,
    seams: [0.15, -0.16], glass: [-0.27, 0.15], bpil: null, handles: [-0.13], hood: 0.18, trunk: -0.35,
    head: { shape: 'twin', w: 0.42, h: 0.17 }, tail: { shape: 'wide', w: 0.62, h: 0.12, inner: true },
    rakeF: 0.08, rakeYF: 0.5, planF: 0.06, rakeR: 0.08, rakeYR: 0.5, planR: 0.06,
    style: { grille: 'muscle', exhaust: 2, rim: 'mag', rimMat: 'chrome', stripes: true, scoop: true, duck: true },
  },
  pickup: {
    axF: 0.33, axR: -0.29,
    yb: [[-0.5, 0.62], [-0.48, 0.5], [-0.4, 0.46], [0.38, 0.46], [0.47, 0.5], [0.5, 0.6]],
    belt: [[-0.5, 1.17], [-0.1, 1.2], [0.1, 1.2], [0.33, 1.19], [0.46, 1.15], [0.5, 1.08]],
    roof: [[-0.125, 1.0], [-0.118, 1.84], [-0.1, 1.89], [0.15, 1.88], [0.22, 1.6], [0.31, 1.15]],
    g: [-0.122, -0.1, 0.15, 0.31], w: [[-0.5, 0.95], [-0.48, 0.99], [0.0, 1.0], [0.42, 0.99], [0.48, 0.94], [0.5, 0.86]],
    wg: 0.88, rw: 0.82, crown: [[-0.5, 0.0], [-0.1, 0.03], [0.5, 0.03]], bulge: 0.012,
    seams: [0.235, 0.02, -0.12], glass: [-0.105, 0.28], bpil: 0.02, handles: [0.05, -0.08], hood: 0.31, trunk: null,
    head: { shape: 'square', w: 0.4, h: 0.22 }, tail: { shape: 'tall', w: 0.16, h: 0.4, up: 0.3 },
    bed: [-0.48, -0.125], wallZ: [-0.122],
    rakeF: 0.1, rakeYF: 0.6, planF: 0.06, rakeR: 0.0, rakeYR: 0.6, planR: 0.0,
    style: { blackLower: 0.07, blackBumper: 0.22, chromeBumper: true, grille: 'truck', exhaust: 1, rim: 'steel6', rimMat: 'silver' },
  },
  van: {
    axF: 0.335, axR: -0.3,
    yb: [[-0.5, 0.5], [-0.48, 0.4], [-0.4, 0.36], [0.38, 0.36], [0.47, 0.4], [0.5, 0.5]],
    belt: [[-0.5, 1.02], [-0.45, 1.06], [0.3, 1.06], [0.42, 1.03], [0.48, 0.96], [0.5, 0.9]],
    roof: [[-0.52, 2.2], [-0.47, 2.25], [0.25, 2.26], [0.3, 2.2], [0.37, 1.75], [0.445, 1.02]],
    g: [-0.5, -0.47, 0.29, 0.44], w: [[-0.5, 0.96], [-0.48, 0.99], [0.0, 1.0], [0.42, 0.99], [0.48, 0.94], [0.5, 0.85]],
    wg: 0.95, rw: 0.9, crown: [[-0.5, 0.03], [0, 0.04], [0.5, 0.03]], bulge: 0.01,
    seams: [0.4, 0.12, -0.16], glass: [0.14, 0.41], bpil: null, handles: [0.15, -0.12], hood: 0.44, trunk: null,
    head: { shape: 'rect', w: 0.42, h: 0.2 }, tail: { shape: 'tall', w: 0.16, h: 0.42, up: 0.25 },
    rakeF: 0.16, rakeYF: 0.5, planF: 0.1, rakeR: 0.0, rakeYR: 0.6, planR: 0.04,
    style: { blackLower: 0.06, blackBumper: 0.22, grille: 'van', exhaust: 1, rim: 'steel', rimMat: 'silver', vanDoors: true, rearGlass: [1.3, 2.05] },
  },
  supercar: {
    axF: 0.31, axR: -0.315,
    yb: [[-0.5, 0.34], [-0.47, 0.23], [-0.38, 0.16], [0.38, 0.16], [0.47, 0.19], [0.5, 0.25]],
    belt: [[-0.5, 0.84], [-0.44, 0.88], [-0.25, 0.9], [0.0, 0.84], [0.2, 0.76], [0.38, 0.64], [0.5, 0.5]],
    roof: [[-0.32, 0.84], [-0.2, 1.03], [-0.08, 1.15], [0.0, 1.165], [0.05, 1.155], [0.13, 1.03], [0.235, 0.78]],
    g: [-0.21, -0.08, 0.045, 0.225], w: [[-0.5, 0.86], [-0.46, 0.96], [-0.36, 1.0], [0.0, 0.97], [0.3, 0.99], [0.45, 0.93], [0.5, 0.8]],
    wg: 0.82, rw: 0.64, crown: [[-0.5, 0.0], [0.0, 0.03], [0.5, 0.0]], bulge: 0.025, fenders: 0.07,
    seams: [0.2, -0.1], glass: [-0.12, 0.22], bpil: null, handles: [], hood: 0.24, trunk: null,
    head: { shape: 'blade', w: 0.46, h: 0.075 }, tail: { shape: 'bar', w: 0.6, h: 0.05, inner: true },
    rakeF: 0.7, rakeYF: 0.26, planF: 0.2, rakeR: 0.12, rakeYR: 0.45, planR: 0.1,
    style: { skirt: 0.08, grille: 'super', exhaust: 'center', rim: 'thin', rimMat: 'gold', intakes: true, louvres: true, wing: true },
  },
  bus: {
    axF: 0.355, axR: -0.24,
    yb: [[-0.5, 0.5], [-0.49, 0.38], [-0.46, 0.33], [0.46, 0.33], [0.49, 0.38], [0.5, 0.48]],
    belt: [[-0.5, 1.22], [0.5, 1.22]],
    roof: [[-0.52, 2.98], [-0.493, 3.04], [0.49, 3.05], [0.52, 2.98]],
    g: [-0.5, -0.495, 0.495, 0.5], w: [[-0.5, 0.95], [-0.49, 0.99], [0.0, 1.0], [0.49, 0.99], [0.5, 0.95]],
    wg: 0.985, rw: 0.95, crown: [[-0.5, 0.04], [0.5, 0.04]], bulge: 0.0, ledge: 0.005, bigRoof: true,
    seams: [], glass: [-0.47, 0.37], pillars: [-0.36, -0.25, -0.13, -0.02, 0.09, 0.2], handles: [], hood: null, trunk: null,
    head: { shape: 'square', w: 0.36, h: 0.18 }, tail: { shape: 'tall', w: 0.2, h: 0.5, up: 0.35 },
    rakeF: 0.06, rakeYF: 1.2, planF: 0.12, rakeR: 0.0, rakeYR: 1.0, planR: 0.06,
    style: { blackBumper: 0.3, grille: 'bus', exhaust: 0, rim: 'bus', rimMat: 'silver', bus: true, frontGlass: [1.25, 2.6], rearGlass: [1.9, 2.75] },
  },
};
CARSPEC.taxi = CARSPEC.sedan; CARSPEC.police = CARSPEC.sedan;
const CAR_SEC_N = 18, CAR_SEC_PART = ['bot', 'lc', 'lc', 'lc', 'side', 'side', 'side', 'sh', 'sh', 'gb', 'gs', 'gs', 'rc', 'rc', 'rt', 'rt', 'rt'];

// Shape functions for one car type. All values in local metres (z forward, x left, y up), before the end deform.
function carShape(type) {
  const T = CAR_TYPES[type], S = CARSPEC[type], L = T.L, hw = T.W / 2;
  const fyb = carCurve(S.yb), fbelt = carCurve(S.belt), froof = carCurve(S.roof), fw = carCurve(S.w), fcr = carCurve(S.crown);
  const axF = S.axF * L, axR = S.axR * L, wr = T.wr, ra = wr + 0.075;
  const archTop = (z) => {
    let y = -1;
    for (const az of [axF, axR]) { const d = z - az; if (d > -ra && d < ra) y = Math.max(y, wr + Math.sqrt(ra * ra - d * d)); }
    return y;
  };
  const px = new Float32Array(CAR_SEC_N), py = new Float32Array(CAR_SEC_N), ps = new Float32Array(CAR_SEC_N);
  const sec = { px, py, ps, yb: 0, belt: 0, yt: 0, gh: 0, w: 0, wg: 0, rwe: 0, crown: 0, S: 0 };
  function at(z) {
    const zn = z / L;
    let yb = fyb(zn), belt = fbelt(zn), crown = fcr(zn);
    const at = archTop(z);
    if (at > yb) yb = at;
    if (S.fenders && at > 0) { const hump = Math.max(0, at + S.fenders - belt); belt += hump; crown -= hump * 0.85; }
    const g = S.g, inG = zn > g[0] - 0.03 && zn < g[3] + 0.03;
    const yt = inG ? Math.max(belt, froof(zn)) : belt;
    const w = hw * fw(zn), gh = Math.max(0, yt - belt);
    const rl = Math.min(0.13, (belt - yb) * 0.3), rs = Math.min(0.065, (belt - yb) * 0.2);
    const wg = Math.min(hw * S.wg, w - rs - (S.ledge === undefined ? 0.02 : S.ledge));
    const rwe = lerp(wg, Math.min(hw * S.rw, wg), clamp(gh / (S.bigRoof ? 0.4 : 0.22), 0, 1));
    const rr = Math.min(S.bigRoof ? 0.16 : 0.085, gh * 0.4);
    const bu = (S.bulge || 0) * clamp((belt - yb) / 0.5, 0, 1);
    const P = (i, x, y) => { px[i] = x; py[i] = y; };
    P(0, 0, yb); P(1, Math.max(0.05, w - rl - 0.18), yb);
    P(2, w - rl * 0.5, yb + rl * 0.134); P(3, w - rl * 0.134, yb + rl * 0.5); P(4, w, yb + rl);
    const sy0 = yb + rl, sy1 = belt - rs;
    P(5, w + bu, lerp(sy0, sy1, 0.42)); P(6, w + bu * 0.55, lerp(sy0, sy1, 0.82));
    P(7, w, belt - rs); P(8, w - rs * 0.29, belt - rs * 0.29); P(9, w - rs, belt);
    P(10, wg, belt + 0.004);
    P(11, lerp(wg, rwe, 0.5) + gh * 0.012, belt + (gh - rr) * 0.5); P(12, rwe, belt + Math.max(0, gh - rr));
    P(13, rwe - rr * 0.29, yt - rr * 0.29); P(14, rwe - rr, yt);
    const cx = rwe - rr;
    P(15, cx * 0.64, yt + crown * 0.6); P(16, cx * 0.3, yt + crown * 0.92); P(17, 0, yt + crown);
    ps[0] = 0;
    for (let i = 1; i < CAR_SEC_N; i++) ps[i] = ps[i - 1] + Math.hypot(px[i] - px[i - 1], py[i] - py[i - 1]);
    Object.assign(sec, { yb, belt, yt, gh, w, wg, rwe, crown, S: ps[CAR_SEC_N - 1] });
    return sec;
  }
  // arc length on the outer side at height y (between the bottom and the beltline)
  function sAtY(z, y) {
    at(z);
    for (let i = 1; i <= 9; i++) {
      if (py[i] >= y || i === 9) {
        const y0 = py[i - 1], y1 = py[i], t = y1 - y0 > 1e-5 ? clamp((y - y0) / (y1 - y0), 0, 1) : 1;
        return ps[i - 1] + (ps[i] - ps[i - 1]) * t;
      }
    }
    return ps[9];
  }
  const sK = (z, k) => { at(z); return ps[k]; };
  // point at arc length s → {x, y, k (segment)}
  const pt = { x: 0, y: 0, k: 0 };
  function atS(z, s) {
    at(z);
    for (let i = 1; i < CAR_SEC_N; i++) {
      if (ps[i] >= s || i === CAR_SEC_N - 1) {
        const t = ps[i] - ps[i - 1] > 1e-6 ? clamp((s - ps[i - 1]) / (ps[i] - ps[i - 1]), 0, 1) : 0;
        pt.x = lerp(px[i - 1], px[i], t); pt.y = lerp(py[i - 1], py[i], t); pt.k = i - 1; return pt;
      }
    }
    return pt;
  }
  return { T, S, L, hw, axF, axR, wr, ra, at, sAtY, sK, atS, sec, archTop, zmin: -L / 2, zmax: L / 2 };
}

// Deform near the ends: rake the nose/tail faces back above a reference height and round them in plan view.
function carDeform(sh) {
  const S = sh.S, zmax = sh.zmax, zmin = sh.zmin, hw = sh.hw, lenF = Math.min(0.7, sh.L * 0.14), lenR = Math.min(0.6, sh.L * 0.12);
  return (x, y, z) => {
    const q = (x / hw) * (x / hw);
    if (z > zmax - lenF) { const t = sstep(zmax - lenF, zmax, z); z -= t * (S.rakeF * Math.max(0, y - S.rakeYF) + S.planF * q); }
    else if (z < zmin + lenR) { const t = sstep(zmin + lenR, zmin, z); z += t * (S.rakeR * Math.max(0, y - S.rakeYR) + S.planR * q); }
    return z;
  };
}

// ---------- body atlas (2048 x 1024, 8 x 2 tiles of 256 x 512; v = canvas row, no flip) ----------
const CAR_ATLAS = { W: 2048, H: 1024, TW: 256, TH: 512, tiles: {}, tex: null, orm: null };
const CAR_TILE_ORDER = ['coupe', 'sedan', 'suv', 'muscle', 'pickup', 'van', 'supercar', 'bus', 'taxi', 'police'];
function carTileOf(type) {
  const i = CAR_TILE_ORDER.indexOf(type), t = { i, x: (i % 8) * CAR_ATLAS.TW, y: Math.floor(i / 8) * CAR_ATLAS.TH };
  return t;
}
// loft uv: u = 0.01 + 0.98 s / Smax, v = 0.01 + 0.78 (z - zmin) / L; caps: v in [0.8, 0.99]
function paintCarTile(g, gm, type, sh, Smax, capY) {
  const T = sh.T, S = sh.S, st = S.style, L = sh.L, tl = carTileOf(type), TW = CAR_ATLAS.TW, TH = CAR_ATLAS.TH;
  const zmin = sh.zmin, zmax = sh.zmax, hw = sh.hw;
  const U = (s) => tl.x + (0.01 + 0.98 * s / Smax) * TW;
  const V = (z) => tl.y + (0.01 + 0.78 * (z - zmin) / L) * TH;
  const FU = (x) => tl.x + (0.25 + 0.24 * x / (hw + 0.05)) * TW, BU = (x) => tl.x + (0.75 - 0.24 * x / (hw + 0.05)) * TW;
  const CV = (y) => tl.y + (0.8 + 0.19 * y / capY) * TH;
  const Z = (zn) => zn * L;
  g.save(); g.beginPath(); g.rect(tl.x, tl.y, TW, TH); g.clip();
  gm.save(); gm.beginPath(); gm.rect(tl.x, tl.y, TW, TH); gm.clip();
  g.fillStyle = '#ffffff'; g.fillRect(tl.x, tl.y, TW, TH);
  // band between two arc-length functions along z
  const band = (z0, z1, fa, fb, col, mask, n) => {
    if (z1 <= z0) return;
    n = n || Math.max(4, Math.ceil((z1 - z0) / 0.03));
    const ctx = mask ? gm : g;
    ctx.fillStyle = mask ? '#fff' : col; ctx.beginPath();
    for (let i = 0; i <= n; i++) { const z = lerp(z0, z1, i / n); const s = fa(z); i ? ctx.lineTo(U(s), V(z)) : ctx.moveTo(U(s), V(z)); }
    for (let i = n; i >= 0; i--) { const z = lerp(z0, z1, i / n); ctx.lineTo(U(fb(z)), V(z)); }
    ctx.closePath(); ctx.fill();
  };
  const line = (z, s0, s1, col, w) => { g.strokeStyle = col; g.lineWidth = w || 1.4; g.beginPath(); g.moveTo(U(s0), V(z)); g.lineTo(U(s1), V(z)); g.stroke(); };
  const lineZ = (z0, z1, fs, col, w) => { g.strokeStyle = col; g.lineWidth = w || 1.4; g.beginPath(); const n = Math.ceil((z1 - z0) / 0.04) + 1; for (let i = 0; i <= n; i++) { const z = lerp(z0, z1, i / n); i ? g.lineTo(U(fs(z)), V(z)) : g.moveTo(U(fs(z)), V(z)); } g.stroke(); };
  const rect = (z, s, dz, ds, col, r) => { g.fillStyle = col; roundRect(g, U(s - ds / 2), V(z - dz / 2), U(s + ds / 2) - U(s - ds / 2), V(z + dz / 2) - V(z - dz / 2), r || 2); g.fill(); };
  const SEAM = 'rgba(30,32,36,0.75)', TRIM = '#1c1d20', GLASS = '#0b0f15';
  const ybz = (z) => sh.at(z).yb, beltz = (z) => sh.at(z).belt;
  // --- liveries ---
  if (type === 'police') {
    g.fillStyle = '#16244a'; g.fillRect(tl.x, tl.y, TW, TH);
    band(Z(S.seams[2]) + 0.01, Z(S.seams[0]) - 0.01, (z) => sh.sAtY(z, ybz(z) + 0.05), (z) => sh.sK(z, 10), '#f2f4f8');
    band(Z(S.g[1]) - 0.05, Z(S.g[2]) + 0.05, (z) => sh.sK(z, 12), (z) => sh.sK(z, 17) + 0.01, '#f2f4f8');
    band(Z(S.seams[2]) + 0.01, Z(S.seams[0]) - 0.01, (z) => sh.sAtY(z, beltz(z) - 0.25), (z) => sh.sAtY(z, beltz(z) - 0.215), '#1f4fd1');
  }
  if (type === 'taxi') {
    const z0 = sh.axR + sh.ra + 0.05, z1 = sh.axF - sh.ra - 0.05, q = 0.07;
    for (let z = z0, k = 0; z < z1 - q * 0.5; z += q, k++) for (let r = 0; r < 2; r++) {
      if ((k + r) % 2) continue;
      band(z, Math.min(z1, z + q), (zz) => sh.sAtY(zz, beltz(zz) - 0.2 + r * q), (zz) => sh.sAtY(zz, beltz(zz) - 0.2 + (r + 1) * q), '#18181a', false, 2);
    }
  }
  if (st.bus) {
    band(zmin, zmax, (z) => sh.sAtY(z, 0.62), (z) => sh.sAtY(z, 0.8), '#17a3a6');
    band(zmin, zmax, (z) => sh.sAtY(z, 0.82), (z) => sh.sAtY(z, 0.88), '#ff8a3d');
    band(zmin, zmax, (z) => sh.sK(z, 12) - 0.02, (z) => sh.sK(z, 17) + 0.02, '#e9edf0');
  }
  if (st.stripes) {
    for (const [a, b] of [[0.06, 0.15], [0.2, 0.29]]) band(zmin, zmax, (z) => sh.sK(z, 17) - b, (z) => sh.sK(z, 17) - a, '#1a1a1d');
  }
  // --- underbody, lower trim, bumpers, skirts ---
  band(zmin, zmax, () => 0, (z) => sh.sK(z, 2), '#2b2b2e', false, 120);
  if (st.blackLower) band(zmin, zmax, (z) => sh.sK(z, 2), (z) => sh.sAtY(z, ybz(z) + st.blackLower), TRIM, false, 160);
  if (st.skirt) band(sh.axR + sh.ra, sh.axF - sh.ra, (z) => sh.sK(z, 2), (z) => sh.sAtY(z, ybz(z) + st.skirt), TRIM);
  if (st.blackBumper) {
    band(zmax - 0.32, zmax, () => 0, (z) => sh.sAtY(z, ybz(z) + st.blackBumper), st.chromeBumper ? '#c8ccd2' : TRIM);
    band(zmin, zmin + 0.3, () => 0, (z) => sh.sAtY(z, ybz(z) + st.blackBumper), st.chromeBumper ? '#c8ccd2' : TRIM);
  }
  // --- side details ---
  if (st.charLine) {
    lineZ(sh.axR - sh.ra * 0.6, sh.axF + sh.ra * 0.4, (z) => sh.sAtY(z, beltz(z) - 0.12), 'rgba(0,0,0,0.16)', 1.2);
    lineZ(sh.axR - sh.ra * 0.6, sh.axF + sh.ra * 0.4, (z) => sh.sAtY(z, beltz(z) - 0.11), 'rgba(255,255,255,0.9)', 1);
  }
  for (const sz of S.seams) {
    const z = Z(sz);
    line(z, sh.sAtY(z, ybz(z) + 0.04), sh.sK(z, 12), SEAM, 1.3);
  }
  if (S.seams.length >= 2 && !st.bus) {
    const zr = Z(S.seams[S.seams.length - 1]), zf = Z(S.seams[0]);
    lineZ(zr, zf, (z) => sh.sAtY(z, ybz(z) + 0.045), SEAM, 1.1);
  }
  for (const hz of S.handles) {
    const z = Z(hz), s = sh.sAtY(z, beltz(z) - 0.085);
    rect(z, s, 0.15, 0.03, '#2a2c30', 3); rect(z + 0.01, s + 0.006, 0.11, 0.008, 'rgba(255,255,255,0.35)', 1);
  }
  if (st.vanDoors) { const z = Z(-0.02); lineZ(Z(S.seams[2]), Z(S.seams[1]), (zz) => sh.sAtY(zz, beltz(zz) + 0.62), SEAM, 1.3); rect(z, sh.sAtY(z, beltz(z) - 0.02), 0.09, 0.025, '#2a2c30', 2); }
  if (st.intakes) {
    const z0 = Z(-0.2), z1 = Z(-0.08);
    band(z0, z1, (z) => sh.sAtY(z, lerp(0.42, 0.34, (z - z0) / (z1 - z0))), (z) => sh.sAtY(z, lerp(0.62, 0.72, (z - z0) / (z1 - z0))), '#121316');
  }
  // fuel door (mirrored on both sides; reads as a panel)
  if (!st.bus && type !== 'police' && S.trunk !== null) { const z = sh.axR + sh.ra + 0.32; const s = sh.sAtY(z, beltz(z) - 0.12); g.strokeStyle = SEAM; g.lineWidth = 1; g.beginPath(); g.arc(U(s), V(z), Math.abs(V(z + 0.08) - V(z)), 0, TAU); g.stroke(); }
  // --- top: hood / trunk seams, scoop, louvres ---
  if (S.hood !== null) {
    const z = Z(S.hood);
    line(z, sh.sK(z, 8), sh.sK(z, 17) + 0.02, SEAM, 1.2);
    lineZ(z, zmax - 0.06, (zz) => sh.sK(zz, 9) + 0.035, SEAM, 1.1);
  }
  if (S.trunk !== null) {
    const z = Z(S.trunk);
    line(z, sh.sK(z, 8), sh.sK(z, 17) + 0.02, SEAM, 1.2);
    lineZ(zmin + 0.06, z, (zz) => sh.sK(zz, 9) + 0.035, SEAM, 1.1);
  }
  if (st.louvres) for (let i = 0; i < 6; i++) { const z = Z(-0.3) + i * 0.07; band(z, z + 0.025, (zz) => sh.sK(zz, 17) - 0.42, (zz) => sh.sK(zz, 17) - 0.04, '#141518', false, 2); }
  // --- greenhouse: glass with black frames ---
  const g0 = Z(S.g[0]), g1 = Z(S.g[1]), g2 = Z(S.g[2]), g3 = Z(S.g[3]);
  const glassBand = (z0, z1, fa, fb, frame) => {
    band(z0 - frame, z1 + frame, (z) => fa(z) - frame, (z) => fb(z) + frame, TRIM);
    band(z0, z1, fa, fb, GLASS); band(z0, z1, fa, fb, null, true);
  };
  const gz0 = Z(S.glass[0]), gz1 = Z(S.glass[1]);
  if (gz1 > gz0) {
    glassBand(gz0, gz1, (z) => sh.sK(z, 10) + 0.02, (z) => Math.max(sh.sK(z, 10) + 0.02, sh.sK(z, 13) - 0.012), 0.022);
    if (st.chromeBelt) lineZ(gz0 - 0.02, gz1 + 0.02, (z) => sh.sK(z, 10) + 0.006, '#e8ecf0', 1.6);
  }
  const pill = (z, wd) => band(z - wd, z + wd, (zz) => sh.sK(zz, 9), (zz) => sh.sK(zz, 13) + 0.004, TRIM, false, 3);
  if (S.bpil !== null && S.bpil !== undefined) pill(Z(S.bpil), 0.045);
  if (S.cpil) band(Z(S.cpil) - 0.07, Z(S.cpil) + 0.07, (zz) => sh.sK(zz, 9), (zz) => sh.sK(zz, 13) + 0.004, '#ffffff', false, 3);
  if (S.pillars) for (const p of S.pillars) { pill(Z(p), 0.06); band(Z(p) - 0.04, Z(p) + 0.04, (zz) => sh.sK(zz, 9), (zz) => sh.sK(zz, 12), '#ffffff', false, 3); }
  if (st.bus) {
    // doors: glass down to the floor, front and middle
    for (const [a, b] of [[0.385, 0.47], [-0.05, 0.04]]) {
      const z0 = Z(a), z1 = Z(b);
      band(z0 - 0.04, z1 + 0.04, (z) => sh.sAtY(z, ybz(z) + 0.02), (z) => sh.sK(z, 13), TRIM);
      band(z0, z1, (z) => sh.sAtY(z, ybz(z) + 0.1), (z) => sh.sK(z, 12) - 0.05, GLASS); band(z0, z1, (z) => sh.sAtY(z, ybz(z) + 0.1), (z) => sh.sK(z, 12) - 0.05, null, true);
      line((z0 + z1) / 2, sh.sAtY((z0 + z1) / 2, ybz(z0) + 0.02), sh.sK((z0 + z1) / 2, 13), TRIM, 2.4);
    }
  }
  // windshield and rear window (top surface)
  if (g3 - g2 > 0.1) glassBand(g2 + 0.04, g3 - 0.035, (z) => sh.sK(z, 13) + 0.035, (z) => sh.sK(z, 17) + 0.03, 0.025);
  if (g1 - g0 > 0.1) glassBand(g0 + 0.04, g1 - 0.04, (z) => sh.sK(z, 13) + 0.05, (z) => sh.sK(z, 17) + 0.03, 0.025);
  if (S.cpil === null && S.bpil === null && type === 'coupe') pill(Z(-0.15), 0.025);
  // --- caps ---
  const capF = sh.at(zmax), ybF = capF.yb, beltF = capF.belt, wF = capF.w;
  const capB = sh.at(zmin), ybB = capB.yb, beltB = capB.belt, ytB = capB.yt, wB = capB.w;
  const hy = T.H - 0.2, hx = hw - 0.37;
  const crect = (FX, x0, y0, x1, y1, col, r) => { g.fillStyle = col; const a = FX(x0), b = FX(x1); roundRect(g, Math.min(a, b), CV(y0), Math.abs(b - a), CV(y1) - CV(y0), r || 3); g.fill(); };
  const mrect = (FX, x0, y0, x1, y1, r) => { gm.fillStyle = '#fff'; const a = FX(x0), b = FX(x1); roundRect(gm, Math.min(a, b), CV(y0), Math.abs(b - a), CV(y1) - CV(y0), r || 3); gm.fill(); };
  if (type === 'police') { g.fillStyle = '#16244a'; g.fillRect(tl.x, CV(0), TW, TH); }
  // front: lower bumper, grille, lamp housings, plate recess
  const ph = S.head;
  if (st.blackBumper) crect(FU, -wF - 0.1, ybF - 0.1, wF + 0.1, ybF + st.blackBumper, st.chromeBumper ? '#c8ccd2' : TRIM, 2);
  crect(FU, -wF + 0.12, ybF - 0.05, wF - 0.12, ybF + 0.06, '#1b1c1f', 4);
  const gr = st.grille;
  if (gr === 'bars' || gr === 'mesh' || gr === 'muscle' || gr === 'truck' || gr === 'van' || gr === 'big') {
    const gw = gr === 'mesh' ? 0.36 : gr === 'muscle' ? hx - 0.06 : gr === 'truck' ? hx - 0.24 : gr === 'big' ? 0.5 : 0.42;
    const gy0 = gr === 'mesh' ? ybF + 0.04 : hy - (gr === 'truck' ? 0.18 : 0.1), gy1 = gr === 'mesh' ? ybF + 0.2 : Math.min(beltF - 0.04, hy + (gr === 'truck' ? 0.16 : 0.06));
    crect(FU, -gw, gy0, gw, gy1, gr === 'truck' ? '#c8ccd2' : TRIM, 6);
    crect(FU, -gw + 0.03, gy0 + 0.025, gw - 0.03, gy1 - 0.025, '#0d0e10', 4);
    g.fillStyle = gr === 'bars' || gr === 'truck' ? '#9aa0a8' : '#2c2e33';
    const n = gr === 'mesh' ? 4 : 3;
    for (let i = 1; i <= n; i++) { const y = lerp(gy0 + 0.025, gy1 - 0.025, i / (n + 1)); g.fillRect(FU(-gw + 0.03), CV(y) - 0.8, FU(gw - 0.03) - FU(-gw + 0.03), 1.6); }
  }
  if (gr === 'super') { crect(FU, -wF + 0.08, ybF - 0.02, wF - 0.08, ybF + 0.13, '#0d0e10', 8); crect(FU, -0.3, ybF + 0.02, 0.3, ybF + 0.12, '#222428', 5); }
  if (gr === 'bus') {
    crect(FU, -0.6, 0.45, 0.6, 0.62, '#0d0e10', 4);
    crect(FU, -wF + 0.05, 1.22, wF - 0.05, 2.66, TRIM, 10); crect(FU, -wF + 0.09, 1.27, wF - 0.09, 2.38, GLASS, 8); mrect(FU, -wF + 0.09, 1.27, wF - 0.09, 2.38, 8);
    crect(FU, -wF + 0.12, 2.44, wF - 0.12, 2.62, '#141414', 4);
  }
  for (const s of [-1, 1]) crect(FU, s * hx - ph.w / 2 - 0.018, hy - ph.h / 2 - 0.016, s * hx + ph.w / 2 + 0.018, hy + ph.h / 2 + 0.016, '#202226', 5);
  crect(FU, -0.29, ybF + 0.06, 0.29, ybF + 0.22, '#3a3c40', 3);
  if (st.stripes) for (const [a, b] of [[0.06, 0.15], [0.2, 0.29]]) for (const s of [-1, 1]) crect(FU, s * a, beltF - 0.12, s * b, beltF + 0.1, '#1a1a1d', 0);
  // back: bumper, plate, diffuser, rear window for tall types, lamp housings
  if (st.blackBumper) crect(BU, -wB - 0.1, ybB - 0.1, wB + 0.1, ybB + st.blackBumper, st.chromeBumper ? '#c8ccd2' : TRIM, 2);
  crect(BU, -wB + 0.1, ybB - 0.05, wB - 0.1, ybB + 0.08, '#1b1c1f', 4);
  const pt = S.tail, ty = pt.up ? hy + pt.up * 0.5 - 0.05 : hy + 0.02;
  for (const s of [-1, 1]) crect(BU, s * hx - pt.w / 2 - 0.016, ty - pt.h / 2 - 0.016, s * hx + pt.w / 2 + 0.016, ty + pt.h / 2 + 0.016, '#202226', 4);
  crect(BU, -0.29, ybB + 0.12, 0.29, ybB + 0.3, '#3a3c40', 3);
  if (st.rearGlass) {
    const [y0, y1] = st.rearGlass, gw = wB - (st.bus ? 0.12 : 0.22);
    crect(BU, -gw - 0.04, y0 - 0.04, gw + 0.04, y1 + 0.04, TRIM, 8);
    if (st.vanDoors) { for (const s of [-1, 1]) { crect(BU, s * 0.04, y0, s * gw, y1, GLASS, 6); mrect(BU, s * 0.04, y0, s * gw, y1, 6); } crect(BU, -0.012, ybB + 0.25, 0.012, ytB - 0.05, SEAM, 0); }
    else { crect(BU, -gw, y0, gw, y1, GLASS, 8); mrect(BU, -gw, y0, gw, y1, 8); }
    if (type === 'suv') { g.strokeStyle = SEAM; g.lineWidth = 1.3; roundRect(g, BU(wB - 0.12), CV(ybB + 0.25), BU(-wB + 0.12) - BU(wB - 0.12), CV(ytB - 0.05) - CV(ybB + 0.25), 6); g.stroke(); }
  }
  if (st.stripes) for (const [a, b] of [[0.06, 0.15], [0.2, 0.29]]) for (const s of [-1, 1]) crect(BU, s * a, beltB - 0.12, s * b, beltB + 0.1, '#1a1a1d', 0);
  if (S.trunk !== null && !st.rearGlass) { g.strokeStyle = SEAM; g.lineWidth = 1.2; g.beginPath(); g.moveTo(BU(wB - 0.1), CV(beltB - 0.32)); g.lineTo(BU(-wB + 0.1), CV(beltB - 0.32)); g.stroke(); }
  // white strip reserved for extra painted parts (mirrors, scoops, bed rails): v 0.79..0.8
  g.fillStyle = '#ffffff'; g.fillRect(tl.x, tl.y + 0.787 * TH, TW, 0.012 * TH);
  if (type === 'police') { g.fillStyle = '#16244a'; g.fillRect(tl.x, tl.y + 0.787 * TH, TW, 0.012 * TH); }
  g.restore(); gm.restore();
  return { u: (s) => (U(s)) / CAR_ATLAS.W, v: (z) => V(z) / CAR_ATLAS.H, fu: (x) => FU(x) / CAR_ATLAS.W, bu: (x) => BU(x) / CAR_ATLAS.W, cv: (y) => CV(y) / CAR_ATLAS.H, plain: [(tl.x + TW * 0.5) / CAR_ATLAS.W, (tl.y + 0.793 * TH) / CAR_ATLAS.H] };
}

// ---------- detail atlas (512 x 512 canvas, standard flipY) ----------
const CAR_DET = { S: 512, R: {}, tex: null, orm: null };
function makeCarDetailAtlas() {
  const S = CAR_DET.S, c = mkCanvas(S, S), g = c.getContext('2d'), o = mkCanvas(S, S), go = o.getContext('2d');
  go.fillStyle = 'rgb(255,200,0)'; go.fillRect(0, 0, S, S);
  const R = (name, x, y, w, h, col, rough, metal) => {
    CAR_DET.R[name] = [(x + 1.5) / S, 1 - (y + h - 1.5) / S, (x + w - 1.5) / S, 1 - (y + 1.5) / S];
    if (col) { g.fillStyle = col; g.fillRect(x, y, w, h); }
    go.fillStyle = `rgb(255,${Math.round(rough * 255)},${Math.round(metal * 255)})`; go.fillRect(x, y, w, h);
  };
  R('black', 0, 0, 32, 32, '#1e1f22', 0.75, 0.05);
  R('gloss', 32, 0, 32, 32, '#0c0d0f', 0.22, 0.2);
  R('chrome', 64, 0, 32, 32, '#e3e7ec', 0.12, 1);
  R('silver', 96, 0, 32, 32, '#b8bdc5', 0.3, 0.92);
  R('gun', 128, 0, 32, 32, '#454a52', 0.33, 0.88);
  R('gold', 160, 0, 32, 32, '#c4a14e', 0.3, 1);
  R('mirror', 192, 0, 32, 32, '#9db0c2', 0.04, 1);
  R('red', 224, 0, 32, 32, '#c4161c', 0.35, 0.1);
  R('bed', 256, 0, 32, 32, '#232427', 0.95, 0);
  R('white', 288, 0, 32, 32, '#f2f2f2', 0.5, 0);
  R('glass', 320, 0, 32, 32, '#0b0f15', 0.04, 0.0);
  R('steelw', 352, 0, 32, 32, '#d8dbe0', 0.4, 0.6);
  // tyre sidewall: rings
  R('rubber', 0, 32, 128, 64, '#161618', 0.88, 0);
  g.fillStyle = '#202023'; for (let i = 0; i < 6; i++) g.fillRect(0, 34 + i * 10, 128, 3);
  // tread: grooves across
  R('tread', 128, 32, 128, 64, '#141416', 0.95, 0);
  g.fillStyle = '#060607';
  for (let i = 0; i < 32; i++) { const x = 128 + i * 4; g.fillRect(x, 32, 1.5, 64); }
  g.fillRect(128, 52, 128, 3); g.fillRect(128, 72, 128, 3);
  // honeycomb grille mesh
  R('mesh', 256, 32, 64, 64, '#0c0d0f', 0.6, 0.2);
  g.strokeStyle = '#3a3d43'; g.lineWidth = 1.2;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 9; x++) { const cx = 256 + x * 8 + (y % 2) * 4, cy = 32 + y * 8 + 4; g.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; g.lineTo(cx + Math.cos(a) * 3.6, cy + Math.sin(a) * 3.6); } g.closePath(); g.stroke(); }
  // carbon weave
  R('carbon', 320, 32, 64, 64, '#18191c', 0.3, 0.3);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { g.fillStyle = (x + y) % 2 ? '#26282c' : '#121315'; g.fillRect(320 + x * 4, 32 + y * 4, 4, 4); }
  // plates (original Neon Tide format)
  const plate = (name, x, y, txt) => {
    R(name, x, y, 128, 32, null, 0.4, 0.15);
    g.fillStyle = '#f4f6f2'; g.fillRect(x, y, 128, 32);
    g.strokeStyle = '#1c2a3a'; g.lineWidth = 2; g.strokeRect(x + 1.5, y + 1.5, 125, 29);
    g.fillStyle = '#12c2c0'; g.fillRect(x + 3, y + 3, 18, 26);
    g.fillStyle = '#fff'; g.font = `900 9px ${FONT_D}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('НТ', x + 12, y + 16);
    g.fillStyle = '#1c2a3a'; g.font = `800 19px ${FONT_B}`; g.fillText(txt, x + 74, y + 17.5);
  };
  plate('plate0', 0, 96, '7·НЕО·21'); plate('plate1', 128, 96, '4·ТАЙ·08'); plate('plate2', 256, 96, '2·ВОЛ·77'); plate('plate3', 384, 96, '9·ПРИ·15');
  // decals: alpha cut-outs (alphaTest)
  const decal = (name, x, y, w, h, fn) => { R(name, x, y, w, h, null, 0.45, 0.05); g.clearRect(x, y, w, h); g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); fn(x, y, w, h); g.restore(); };
  decal('dPolice', 0, 128, 256, 48, (x, y, w, h) => {
    g.fillStyle = '#16244a'; g.font = `900 30px ${FONT_D}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('ПОЛИЦИЯ', x + w / 2, y + h / 2 + 1, w - 10);
  });
  decal('dTaxi', 256, 128, 256, 48, (x, y, w, h) => {
    g.fillStyle = '#18181a'; g.font = `900 28px ${FONT_D}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('ТАКСИ', x + w / 2, y + h / 2 + 1, w - 10);
  });
  decal('dVan', 0, 176, 256, 64, (x, y, w, h) => {
    g.fillStyle = '#0f7c86'; g.beginPath(); g.moveTo(x + 8, y + 44);
    for (let i = 0; i <= 20; i++) { const t = i / 20; g.lineTo(x + 8 + t * 52, y + 30 - Math.sin(t * Math.PI * 1.5) * 16); }
    g.lineTo(x + 60, y + 52); g.lineTo(x + 8, y + 52); g.fill();
    g.font = `900 26px ${FONT_D}`; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('ПРИБОЙ', x + 68, y + 24, 180);
    g.fillStyle = '#ff6a3d'; g.font = `700 15px ${FONT_B}`; g.fillText('доставка по острову', x + 70, y + 48, 180);
  });
  decal('dBus', 256, 176, 256, 64, (x, y, w, h) => {
    g.fillStyle = '#ffb21f'; g.font = `900 34px ${FONT_D}`; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('7', x + 12, y + h / 2 + 2);
    g.font = `800 22px ${FONT_B}`; g.fillText('НАБЕРЕЖНАЯ', x + 52, y + h / 2 + 2, 196);
  });
  decal('dSuper', 0, 240, 256, 32, (x, y, w, h) => {
    g.fillStyle = '#16181c'; g.beginPath(); g.moveTo(x, y + 20); g.lineTo(x + 200, y + 8); g.lineTo(x + 256, y + 8); g.lineTo(x + 256, y + 14); g.lineTo(x + 200, y + 14); g.lineTo(x, y + 26); g.fill();
  });
  // interior: gauges, screen, leather, fabric, dash plastic
  R('dash', 256, 240, 64, 32, '#26272b', 0.8, 0.02);
  for (let i = 0; i < 300; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.08)'; g.fillRect(256 + Math.random() * 64, 240 + Math.random() * 32, 1, 1); }
  R('leather', 320, 240, 64, 32, '#3b3430', 0.6, 0.02);
  g.strokeStyle = 'rgba(0,0,0,0.25)'; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(320, 244 + i * 8); g.lineTo(384, 244 + i * 8); g.stroke(); }
  R('fabric', 384, 240, 64, 32, '#2a2d33', 0.95, 0);
  for (let i = 0; i < 400; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.1)'; g.fillRect(384 + Math.random() * 64, 240 + Math.random() * 32, 1, 1); }
  R('wheelgrip', 448, 240, 64, 32, '#151618', 0.7, 0);
  const gauge = (name, x, y, max, step, red, label) => {
    R(name, x, y, 128, 128, null, 0.5, 0.05);
    const cx = x + 64, cy = y + 64;
    g.fillStyle = '#0a0b0e'; g.fillRect(x, y, 128, 128);
    g.fillStyle = '#121419'; g.beginPath(); g.arc(cx, cy, 62, 0, TAU); g.fill();
    g.strokeStyle = '#3d4352'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, 60, 0, TAU); g.stroke();
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    g.lineWidth = 4; g.strokeStyle = '#ff3f5e'; g.beginPath(); g.arc(cx, cy, 52, lerp(a0, a1, red), a1); g.stroke();
    for (let v = 0; v <= max + 1e-6; v += step / 2) {
      const a = lerp(a0, a1, v / max), big = Math.abs(v / step - Math.round(v / step)) < 1e-6;
      g.strokeStyle = big ? '#e8f4ff' : '#8a96aa'; g.lineWidth = big ? 2.2 : 1.2;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * (big ? 44 : 48), cy + Math.sin(a) * (big ? 44 : 48)); g.lineTo(cx + Math.cos(a) * 54, cy + Math.sin(a) * 54); g.stroke();
      if (big) { g.fillStyle = '#d8eaff'; g.font = `700 11px ${FONT_B}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(Math.round(v * (max > 20 ? 1 : 1))), cx + Math.cos(a) * 34, cy + Math.sin(a) * 34); }
    }
    g.fillStyle = '#3fe5ef'; g.font = `700 9px ${FONT_B}`; g.textAlign = 'center'; g.fillText(label, cx, cy + 30);
  };
  gauge('gTach', 0, 272, 8, 1, 0.8, '×1000');
  gauge('gSpeed', 128, 272, 240, 40, 0.92, 'км/ч');
  R('screen', 256, 272, 128, 80, null, 0.3, 0.05);
  { const x = 256, y = 272; const gr = g.createLinearGradient(x, y, x + 128, y + 80); gr.addColorStop(0, '#20104a'); gr.addColorStop(1, '#0a3a4a'); g.fillStyle = gr; g.fillRect(x, y, 128, 80);
    g.strokeStyle = '#ff3f8e'; g.lineWidth = 2; g.beginPath(); for (let i = 0; i <= 32; i++) { const xx = x + 8 + i * 3.5; g.lineTo(xx, y + 52 - Math.abs(Math.sin(i * 0.7)) * 18 - (i % 3) * 3); } g.stroke();
    g.fillStyle = '#fff'; g.font = `800 12px ${FONT_B}`; g.textAlign = 'left'; g.fillText('РАДИО ВОЛНА', x + 8, y + 16); g.fillStyle = '#3fe5ef'; g.font = `700 9px ${FONT_B}`; g.fillText('104.7 FM', x + 8, y + 70); }
  R('vent', 384, 272, 64, 32, '#101114', 0.7, 0.1);
  g.fillStyle = '#2b2e34'; for (let i = 0; i < 6; i++) g.fillRect(384, 274 + i * 5, 64, 2);
  // lamps: head (0..255), tail (256..511) rows 400..511; emissive uses the same canvas
  const lampH = (x, y) => {
    R('lampHead', x, y, 128, 64, null, 0.1, 0.6);
    const gr = g.createLinearGradient(x, y, x, y + 64); gr.addColorStop(0, '#8d949c'); gr.addColorStop(1, '#3b4047'); g.fillStyle = gr; g.fillRect(x, y, 128, 64);
    for (const cx of [x + 34, x + 92]) { const rg = g.createRadialGradient(cx, y + 34, 2, cx, y + 34, 22); rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.45, '#e8eef6'); rg.addColorStop(0.5, '#4a515b'); rg.addColorStop(1, '#9aa2ac'); g.fillStyle = rg; g.beginPath(); g.arc(cx, y + 34, 22, 0, TAU); g.fill(); }
    g.fillStyle = '#ffffff'; g.fillRect(x + 6, y + 6, 116, 5);
  };
  const lampT = (x, y) => {
    R('lampTail', x, y, 128, 64, null, 0.15, 0.2);
    g.fillStyle = '#5a0006'; g.fillRect(x, y, 128, 64);
    for (let i = 0; i < 4; i++) { g.fillStyle = '#ff2a36'; g.fillRect(x + 4, y + 8 + i * 13, 120, 6); }
    g.fillStyle = '#ffd6d6'; g.fillRect(x + 84, y + 4, 40, 4);
    g.fillStyle = '#e9e9e9'; g.fillRect(x + 4, y + 50, 36, 10);
  };
  lampH(0, 448); lampT(128, 448);
  R('lampAmber', 256, 448, 32, 32, '#ff9a1f', 0.2, 0.1);
  CAR_DET.tex = toTex(c, { wrap: false, aniso: 4 });
  CAR_DET.orm = new THREE.CanvasTexture(o); CAR_DET.orm.anisotropy = 1;
  CAR_DET.canvas = c;
}

// ---------- geometry assembly helpers ----------
class CarParts {
  constructor() { this.p = []; this.n = []; this.u = []; this.ix = []; this.cnt = 0; }
  // add a three geometry transformed by matrix m with its uvs remapped into region r = [u0, v0, u1, v1] (or a fixed uv)
  add(geo, m, r, uvFn) {
    const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv, base = this.cnt;
    const v = _cmV1, nm = _cmM3.getNormalMatrix(m);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m); this.p.push(v.x, v.y, v.z);
      if (nor) { v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); this.n.push(v.x, v.y, v.z); } else this.n.push(0, 1, 0);
      if (uvFn) { const q = uvFn(this.p[this.p.length - 3], this.p[this.p.length - 2], this.p[this.p.length - 1], uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0); this.u.push(q[0], q[1]); }
      else if (r && r.length === 2) this.u.push(r[0], r[1]);
      else { const uu = uv ? uv.getX(i) : 0.5, vv = uv ? uv.getY(i) : 0.5; this.u.push(lerp(r[0], r[2], uu), lerp(r[1], r[3], vv)); }
    }
    if (geo.index) { const ia = geo.index.array; for (let i = 0; i < ia.length; i++) this.ix.push(base + ia[i]); }
    else for (let i = 0; i < pos.count; i++) this.ix.push(base + i);
    this.cnt += pos.count;
    geo.dispose();
    return this;
  }
  build(deform) {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(this.p);
    if (deform) for (let i = 0; i < p.length; i += 3) p[i + 2] = deform(p[i], p[i + 1], p[i + 2]);
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setIndex(this.cnt > 65535 ? new THREE.Uint32BufferAttribute(this.ix, 1) : new THREE.Uint16BufferAttribute(this.ix, 1));
    g.computeBoundingSphere();
    return g;
  }
}
const _cmV1 = new V3(), _cmM3 = new THREE.Matrix3(), _cmM4 = new THREE.Matrix4(), _cmQ = new THREE.Quaternion(), _cmE = new THREE.Euler(), _cmP = new V3(), _cmS = new V3();
function carMx(x, y, z, sx, sy, sz, rx, ry, rz, order) { _cmE.set(rx || 0, ry || 0, rz || 0, order || 'XYZ'); _cmQ.setFromEuler(_cmE); _cmP.set(x, y, z); _cmS.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz); return _cmM4.compose(_cmP, _cmQ, _cmS); }
function carRoundRect(w, h, r, cx, cy) {
  const s = new THREE.Shape(), x = (cx || 0) - w / 2, y = (cy || 0) - h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
