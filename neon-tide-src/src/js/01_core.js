// ============================================================
//  NEON TIDE — original open-world driving sandbox (Three.js)
// ============================================================
THREE.ColorManagement.legacyMode = false;

// ---------- math helpers ----------
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wrapA = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const dampA = (a, b, k, dt) => a + wrapA(b - a) * (1 - Math.exp(-k * dt));
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const wrng = mulberry32(73019);
const wr = () => wrng();
const wrr = (a, b) => a + (b - a) * wrng();
const wpick = (arr) => arr[Math.floor(wrng() * arr.length)];
const rr = (a, b) => a + (b - a) * Math.random();
const rpick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0);
const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;

// ---------- extension points shared by all modules (see AGENTS.md) ----------
// EV: tiny event bus. Events: start {fresh, mode}, modeChange (mode), enterCar (car), exitCar (car),
// gunshot {x, y, z, shooter}, bulletHit {type, target, x, y, z, shooter}, pedKilled {ped, by},
// explosion {x, z, car}, playerDied, playerBusted, respawn, crime {amount, why}.
const EV = (() => {
  const m = new Map();
  return {
    on(n, f) { if (!m.has(n)) m.set(n, []); m.get(n).push(f); },
    off(n, f) { const l = m.get(n); if (l) { const i = l.indexOf(f); if (i >= 0) l.splice(i, 1); } },
    emit(n, d) { const l = m.get(n); if (!l) return; for (const f of l.slice()) { try { f(d); } catch (e) { console.error('EV ' + n, e); } } },
  };
})();
// EXT: per-frame hooks. boot: after the city is built (may be async). update(dt): game logic while playing.
// lateUpdate(dt): after the camera moved (view models, aim UI). visual(dt): every rendered frame (menu and play).
// glow(layer): add dynamic glow points via layer.add(x, y, z, r, g, b, size).
const EXT = { boot: [], update: [], lateUpdate: [], visual: [], glow: [] };

// ---------- save ----------
const SAVE_KEY = 'neon-tide-save-v1';
const DEFAULT_SAVE = { money: 300, mission: 0, quality: 'auto', sound: true, music: true, sens: 1, tokens: [], hours: 17.4, weather: 'auto' };
function readSave() { try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
const save = Object.assign({}, DEFAULT_SAVE, readSave() || {});
if (!Array.isArray(save.tokens)) save.tokens = [];
// SAVE_GUARD.story: while a creative session runs, these story fields are written from this snapshot instead of the
// live `save`, so nothing done in the sandbox (money, tokens, time of day) ever reaches the story save on disk.
const SAVE_GUARD = { story: null };
function writeSave() {
  try {
    const data = SAVE_GUARD.story ? Object.assign({}, save, SAVE_GUARD.story) : save;
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) { /* storage blocked */ }
}

// ---------- quality ----------
// Presets are never mutated: Q is a copy, with traffic/pedestrian counts scaled by DENSITY (creative world settings).
const QUALITY = {
  low: { pr: 1.0, minPr: 0.6, shadows: false, shadowSize: 1024, peds: 12, traffic: 10, fog: 520, clouds: 0, pools: false, rain: 520, splash: 0.5 },
  medium: { pr: 1.5, minPr: 0.75, shadows: true, shadowSize: 1024, peds: 18, traffic: 14, fog: 720, clouds: 1, pools: true, rain: 1100, splash: 1 },
  high: { pr: 2.0, minPr: 0.9, shadows: true, shadowSize: 2048, peds: 24, traffic: 18, fog: 900, clouds: 1, pools: true, rain: 1700, splash: 1.4 },
};
const DENSITY = { traffic: 1, peds: 1 };
let qualityName = 'medium';
let Q = Object.assign({}, QUALITY.medium);
let dynPR = 1;
function applyDensity() {
  const P = QUALITY[qualityName];
  Q.traffic = Math.round(P.traffic * DENSITY.traffic); Q.peds = Math.round(P.peds * DENSITY.peds);
}

// ---------- renderer / scene ----------
const canvas = document.getElementById('gl');
let renderer = null;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 4200);
camera.position.set(0, 60, 200);
scene.fog = new THREE.Fog(0x9fb8d8, 150, 900);
const sun = new THREE.DirectionalLight(0xffffff, 2.4);
const hemi = new THREE.HemisphereLight(0xbcd4ff, 0x4a3b2a, 0.6);
const timeU = { value: 0 };
const bldU = { uNight: { value: 0 } };

function initRenderer() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  sun.castShadow = true;
  const sc = sun.shadow.camera;
  sc.left = -85; sc.right = 85; sc.top = 85; sc.bottom = -85; sc.near = 1; sc.far = 520;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.05;
  scene.add(sun); scene.add(sun.target); scene.add(hemi);
}

function applyQuality(name) {
  if (name === 'auto') name = isTouch ? 'medium' : 'high';
  qualityName = name;
  Q = Object.assign({}, QUALITY[name]);
  applyDensity();
  dynPR = Math.min(Q.pr, window.devicePixelRatio || 1);
  if (renderer) {
    renderer.setPixelRatio(dynPR);
    sun.castShadow = Q.shadows;
    if (sun.shadow.map && sun.shadow.mapSize.x !== Q.shadowSize) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    sun.shadow.mapSize.set(Q.shadowSize, Q.shadowSize);
    if (typeof skyMat !== 'undefined' && skyMat) skyMat.uniforms.uCloud.value = Q.clouds;
    if (typeof lampPools !== 'undefined' && lampPools) lampPools.visible = Q.pools;
    resize();
  }
}

function resize() {
  if (!renderer) return;
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // keep a comfortable horizontal field of view in portrait
  camera.fov = w < h ? 78 : 62;
  camera.updateProjectionMatrix();
  const scale = (h * renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  glowMats.forEach((m) => { m.uniforms.uScale.value = scale; });
  if (fxMats) fxMats.forEach((m) => { m.uniforms.uScale.value = scale; });
}

// ---------- canvas textures ----------
const TEX = {};
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function toTex(c, opt) {
  opt = opt || {};
  const t = new THREE.CanvasTexture(c);
  if (opt.srgb !== false) t.encoding = THREE.sRGBEncoding;
  if (opt.wrap !== false) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = Math.min(opt.aniso || 8, renderer.capabilities.getMaxAnisotropy());
  return t;
}
function speckle(g, w, h, amt) {
  const id = g.getImageData(0, 0, w, h), d = id.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(id, 0, 0);
}
function wrapEllipse(g, S, x, y, rx, ry, rot) {
  const m = Math.max(rx, ry) * 1.2;
  for (let ox = -S; ox <= S; ox += S) for (let oy = -S; oy <= S; oy += S) {
    const cx = x + ox, cy = y + oy;
    if (cx + m < 0 || cx - m > S || cy + m < 0 || cy - m > S) continue;
    g.beginPath(); g.ellipse(cx, cy, rx, ry, rot, 0, TAU); g.fill();
  }
}
const FONT_D = '"Unbounded","Arial Black",Impact,sans-serif';
const FONT_B = '"Manrope","Arial",sans-serif';

function makeTextures() {
  // asphalt
  {
    const S = 512, c = mkCanvas(S, S), g = c.getContext('2d');
    g.fillStyle = '#3e4047'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 80; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(130,130,138,0.07)' : 'rgba(8,8,12,0.10)';
      wrapEllipse(g, S, Math.random() * S, Math.random() * S, rr(14, 70), rr(8, 40), Math.random() * TAU);
    }
    speckle(g, S, S, 30);
    for (let i = 0; i < 2600; i++) {
      const v = Math.random() < 0.5 ? 22 : 150;
      g.fillStyle = `rgba(${v},${v},${v + 4},${rr(0.15, 0.4).toFixed(2)})`;
      g.fillRect(Math.random() * S, Math.random() * S, rr(1, 2.4), rr(1, 2.4));
    }
    TEX.asphalt = toTex(c);
  }
  // sidewalk tiles
  {
    const S = 256, c = mkCanvas(S, S), g = c.getContext('2d');
    g.fillStyle = '#b4ada3'; g.fillRect(0, 0, S, S);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const v = rr(-12, 12) | 0; g.fillStyle = `rgb(${178 + v},${171 + v},${161 + v})`; g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
    }
    speckle(g, S, S, 22);
    g.fillStyle = 'rgba(60,55,50,0.35)';
    for (let i = 0; i <= 4; i++) { g.fillRect(i * 64 - 1, 0, 2, S); g.fillRect(0, i * 64 - 1, S, 2); }
    TEX.sidewalk = toTex(c);
  }
  // grass
  {
    const S = 256, c = mkCanvas(S, S), g = c.getContext('2d');
    g.fillStyle = '#4b7f34'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 60; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(120,160,60,0.18)' : 'rgba(25,65,28,0.22)';
      wrapEllipse(g, S, Math.random() * S, Math.random() * S, rr(10, 40), rr(8, 30), Math.random() * TAU);
    }
    g.lineWidth = 1;
    for (let i = 0; i < 3200; i++) {
      g.strokeStyle = `hsla(${rr(80, 115) | 0},${rr(35, 60) | 0}%,${rr(22, 45) | 0}%,0.6)`;
      const x = Math.random() * S, y = Math.random() * S;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + rr(-1.5, 1.5), y - rr(2, 5)); g.stroke();
    }
    TEX.grass = toTex(c);
  }
  // sand
  {
    const S = 256, c = mkCanvas(S, S), g = c.getContext('2d');
    g.fillStyle = '#e7cfa0'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 50; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(255,240,210,0.16)' : 'rgba(170,130,80,0.10)'; wrapEllipse(g, S, Math.random() * S, Math.random() * S, rr(10, 50), rr(6, 30), Math.random() * TAU); }
    speckle(g, S, S, 28);
    TEX.sand = toTex(c);
  }
  // wood planks
  {
    const c = mkCanvas(256, 256), g = c.getContext('2d');
    for (let i = 0; i < 8; i++) {
      const v = rr(-14, 14) | 0; g.fillStyle = `rgb(${128 + v},${92 + v},${62 + v})`; g.fillRect(0, i * 32, 256, 32);
      g.fillStyle = 'rgba(40,24,12,0.55)'; g.fillRect(0, i * 32, 256, 2);
      g.fillRect(((i * 97) % 200) + 20, i * 32, 2, 32);
    }
    speckle(g, 256, 256, 20);
    TEX.wood = toTex(c);
  }
  // palm bark
  {
    const c = mkCanvas(64, 256), g = c.getContext('2d');
    g.fillStyle = '#8a6a48'; g.fillRect(0, 0, 64, 256);
    for (let y = 0; y < 256; y += 9) { g.fillStyle = 'rgba(50,32,18,0.45)'; g.fillRect(0, y, 64, 3); g.fillStyle = 'rgba(200,170,130,0.18)'; g.fillRect(0, y + 3, 64, 2); }
    speckle(g, 64, 256, 26);
    TEX.bark = toTex(c);
  }
  // palm frond (alpha)
  {
    const c = mkCanvas(256, 64), g = c.getContext('2d');
    g.lineCap = 'round';
    for (let i = 0; i < 46; i++) {
      const t = i / 46, x = 6 + t * 236;
      const len = Math.sin(Math.PI * Math.min(1, t * 1.12)) * 26 + 4;
      g.strokeStyle = `hsl(${rr(88, 114) | 0},${rr(42, 60) | 0}%,${rr(22, 36) | 0}%)`;
      g.lineWidth = rr(2.6, 4);
      g.beginPath(); g.moveTo(x, 32); g.quadraticCurveTo(x + 6, 32 - len * 0.6, x + 12, 32 - len); g.stroke();
      g.beginPath(); g.moveTo(x, 32); g.quadraticCurveTo(x + 6, 32 + len * 0.6, x + 12, 32 + len); g.stroke();
    }
    g.strokeStyle = '#6b6a2e'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 32); g.lineTo(250, 32); g.stroke();
    TEX.frond = toTex(c, { wrap: false });
  }
  // contact shadow blob
  {
    const c = mkCanvas(128, 128), g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,0.62)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.32)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    TEX.blob = toTex(c, { wrap: false, srgb: false });
  }
  // soft light pool
  {
    const c = mkCanvas(128, 128), g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,200,140,0.9)'); gr.addColorStop(0.4, 'rgba(255,170,110,0.35)'); gr.addColorStop(1, 'rgba(255,150,90,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    TEX.pool = toTex(c, { wrap: false });
  }
  // marker beam
  {
    const c = mkCanvas(8, 128), g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.75, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0.95)');
    g.fillStyle = gr; g.fillRect(0, 0, 8, 128);
    TEX.beam = toTex(c, { wrap: false, srgb: false });
  }
  // tropical shirt for the hero
  {
    const S = 256, c = mkCanvas(S, S), g = c.getContext('2d');
    g.fillStyle = '#ff6a5c'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 26; i++) {
      g.fillStyle = Math.random() < 0.5 ? '#1f7a52' : '#2c9a63';
      wrapEllipse(g, S, Math.random() * S, Math.random() * S, rr(14, 26), rr(5, 9), Math.random() * TAU);
    }
    for (let i = 0; i < 14; i++) {
      const x = Math.random() * S, y = Math.random() * S, r = rr(9, 15), a0 = Math.random() * TAU;
      g.fillStyle = Math.random() < 0.5 ? '#fff4e0' : '#ffd23f';
      for (let p = 0; p < 5; p++) { const a = a0 + p * TAU / 5; wrapEllipse(g, S, x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7, r * 0.62, r * 0.4, a); }
      g.fillStyle = '#b81d4a'; wrapEllipse(g, S, x, y, r * 0.28, r * 0.28, 0);
    }
    TEX.shirt = toTex(c);
  }
  // neon signs
  const SIGNS = [['MOTEL', '#ff3f8e'], ['TACOS', '#ffb02e'], ['CLUB 88', '#3fe5ef'], ['DINER', '#ff5a3c'], ['SURF', '#7dff6a'],
    ['ARCADE', '#c06bff'], ['PIZZA', '#ff8a3d'], ['HOTEL', '#3fe5ef'], ['BAR', '#ff3f8e'], ['24/7', '#7dff6a']];
  TEX.signs = SIGNS.map(([txt, color]) => {
    const c = mkCanvas(512, 128), g = c.getContext('2d');
    g.fillStyle = 'rgba(14,6,26,0.92)';
    roundRect(g, 4, 4, 504, 120, 22); g.fill();
    g.strokeStyle = color; g.lineWidth = 5; g.shadowColor = color; g.shadowBlur = 18;
    roundRect(g, 12, 12, 488, 104, 16); g.stroke();
    g.font = `900 66px ${FONT_D}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = color; g.shadowBlur = 26; g.fillText(txt, 256, 68);
    g.shadowBlur = 0; g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillText(txt, 256, 68);
    return toTex(c, { wrap: false });
  });
  // billboards (fictional brands)
  const ADS = [
    ['SUNRISE COLA', 'вкус вечного лета', ['#ff3f8e', '#ff8a3d']],
    ['РАДИО НЕОН', '101.7 FM · синтвейв 24/7', ['#3a1c71', '#d76d77']],
    ['ТАКО У РИКО', 'острее только погони', ['#ffb02e', '#ff3c3c']],
    ['ВОЛНА', 'аренда катеров на пирсе', ['#00a6c0', '#3fe5ef']],
    ['ПЭЛМ МОТОРС', 'тачки без вопросов', ['#1d1d3a', '#7a5cff']],
  ];
  TEX.ads = ADS.map(([t1, t2, gc]) => {
    const c = mkCanvas(512, 224), g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 512, 224); gr.addColorStop(0, gc[0]); gr.addColorStop(1, gc[1]);
    g.fillStyle = gr; g.fillRect(0, 0, 512, 224);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(420 + i * 6, 40, 120 - i * 18, 0, TAU); g.fill(); }
    g.fillStyle = '#fff'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.font = `900 46px ${FONT_D}`; g.fillText(t1, 28, 112, 456);
    g.font = `700 26px ${FONT_B}`; g.fillStyle = 'rgba(255,255,255,0.88)'; g.fillText(t2, 30, 160, 450);
    return toTex(c, { wrap: false });
  });
  // police door decal
  {
    const c = mkCanvas(256, 64), g = c.getContext('2d');
    g.fillStyle = '#f2f4f8'; g.fillRect(0, 0, 256, 64);
    g.fillStyle = '#1f4fd1'; g.fillRect(0, 44, 256, 10);
    g.fillStyle = '#0f1a3a'; g.font = `900 28px ${FONT_D}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('ПОЛИЦИЯ', 128, 24);
    TEX.police = toTex(c, { wrap: false });
  }
  // taxi roof sign
  {
    const c = mkCanvas(128, 48), g = c.getContext('2d');
    g.fillStyle = '#ffe14d'; g.fillRect(0, 0, 128, 48); g.fillStyle = '#111'; g.font = `900 28px ${FONT_D}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('TAXI', 64, 26);
    TEX.taxi = toTex(c, { wrap: false });
  }
  // garage door
  {
    const c = mkCanvas(256, 256), g = c.getContext('2d');
    g.fillStyle = '#9aa3ad'; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 16) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, y, 256, 3); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, y + 3, 256, 2); }
    g.fillStyle = '#ff3f8e'; g.font = `900 40px ${FONT_D}`; g.textAlign = 'center'; g.fillText('ГАРАЖ', 128, 60);
    TEX.garage = toTex(c, { wrap: false });
  }
  // repair shop sign
  {
    const c = mkCanvas(512, 128), g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 512, 0);
    ['#ff3f8e', '#ff8a3d', '#ffd23f', '#7dff6a', '#3fe5ef', '#8f45ff'].forEach((cc, i) => gr.addColorStop(i / 5, cc));
    g.fillStyle = '#140a24'; g.fillRect(0, 0, 512, 128);
    g.fillStyle = gr; g.fillRect(0, 108, 512, 20);
    g.font = `900 54px ${FONT_D}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText('РАДУГА', 256, 54);
    TEX.paint = toTex(c, { wrap: false });
  }
  // lighthouse stripes
  {
    const c = mkCanvas(64, 256), g = c.getContext('2d');
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f4f1ea' : '#d8343f'; g.fillRect(0, i * 32, 64, 32); }
    TEX.light = toTex(c);
  }
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}

// ---------- shared GLSL ----------
const GLSL_NOISE = `
float nHash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = nHash(i), b = nHash(i + vec2(1.0, 0.0)), c = nHash(i + vec2(0.0, 1.0)), d = nHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ v += a * vNoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
`;

// ---------- sky ----------
let skyMat = null, skyMesh = null, skyScene = null, pmrem = null, envRT = null;
function makeSky() {
  skyMat = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uGnd: { value: new THREE.Color() },
      uSunCol: { value: new THREE.Color() }, uSunDir: { value: new V3(0, 1, 0) }, uMoonDir: { value: new V3(0, -1, 0) },
      uNight: { value: 0 }, uTime: timeU, uCloud: { value: 1 }, uCloudCol: { value: new THREE.Color() },
      // weather: cloud cover 0..1, overcast darkening 0..1, haze toward the fog colour, lightning flash
      uCover: { value: 0.35 }, uDark: { value: 0 }, uHaze: { value: 0 }, uHazeCol: { value: new THREE.Color() }, uFlash: { value: 0 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
uniform vec3 uTop, uHor, uGnd, uSunCol, uSunDir, uMoonDir, uCloudCol, uHazeCol; uniform float uNight, uTime, uCloud, uCover, uDark, uHaze, uFlash;
varying vec3 vDir;
${GLSL_NOISE}
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHor, uTop, pow(clamp(h, 0.0, 1.0), 0.48));
  col = mix(col, uGnd, smoothstep(0.0, -0.12, h));
  float sd = max(dot(d, uSunDir), 0.0);
  float sunUp = smoothstep(-0.12, 0.02, uSunDir.y);
  float open = 1.0 - smoothstep(0.55, 0.97, uCover);
  col += uSunCol * (pow(sd, 5.0) * 0.22 + pow(sd, 48.0) * 0.4) * sunUp * (0.35 + 0.65 * open);
  col += uSunCol * smoothstep(0.99935, 0.99965, sd) * 14.0 * sunUp * open;
  float md = max(dot(d, uMoonDir), 0.0);
  col += vec3(0.85, 0.9, 1.0) * (smoothstep(0.99905, 0.9994, md) * 2.6 + pow(md, 60.0) * 0.08) * uNight * open;
  if (h > 0.0) {
    vec3 sc = floor(d * 300.0);
    float s = fract(sin(dot(sc, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    float tw = 0.6 + 0.4 * sin(uTime * 3.0 + s * 40.0);
    col += vec3(0.9, 0.95, 1.0) * step(0.9975, s) * tw * uNight * smoothstep(0.02, 0.3, h) * 1.4 * open;
    if (uCloud > 0.5) {
      vec2 uv = d.xz / (h + 0.14) * 1.4 + vec2(uTime * 0.006, uTime * 0.002) * (1.0 + uDark * 2.5);
      float n = fbm(uv * 1.6);
      float lo = mix(0.6, 0.16, uCover);
      float c = smoothstep(lo, lo + 0.32, n) * smoothstep(0.0, 0.18, h);
      vec3 cc = uCloudCol * mix(1.0, 0.5 + 0.7 * smoothstep(lo, 1.0, n), uDark) + uSunCol * pow(sd, 6.0) * 0.55 * sunUp * (1.0 - uDark);
      col = mix(col, cc, c * mix(0.82, 0.97, uCover));
    }
  }
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(lum * 0.92, lum * 0.97, lum * 1.05), uDark * 0.72) * (1.0 - uDark * 0.42);
  col = mix(col, uHazeCol, uHaze * (1.0 - 0.6 * smoothstep(0.0, 0.55, h)));
  col += vec3(0.72, 0.78, 1.0) * uFlash * (0.5 + 0.5 * smoothstep(-0.05, 0.4, h));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <encodings_fragment>
}`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  skyMesh = new THREE.Mesh(new THREE.SphereGeometry(3000, 40, 20), skyMat);
  skyMesh.renderOrder = -10; skyMesh.frustumCulled = false;
  scene.add(skyMesh);
  skyScene = new THREE.Scene();
  skyScene.add(new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), skyMat));
  pmrem = new THREE.PMREMGenerator(renderer);
}
function updateEnv() {
  const old = envRT, fl = skyMat.uniforms.uFlash.value;
  skyMat.uniforms.uFlash.value = 0; // never bake a lightning flash into the reflections
  envRT = pmrem.fromScene(skyScene, 0.035, 0.1, 100);
  skyMat.uniforms.uFlash.value = fl;
  scene.environment = envRT.texture;
  if (old) old.dispose();
}

// ---------- ocean ----------
let waterMat = null;
const ISLAND = { x0: -300, x1: 308, z0: -300, z1: 300 };
function makeWater() {
  waterMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uNight: { value: 0 }, uSunDir: { value: new V3(0, 1, 0) }, uSunCol: { value: new THREE.Color() },
      uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uDeep: { value: new THREE.Color() }, uShallow: { value: new THREE.Color() },
      uIsland: { value: new THREE.Vector4(ISLAND.x0, ISLAND.x1, ISLAND.z0, ISLAND.z1) },
      uChop: { value: 1 }, uRain: { value: 0 }, uFlash: { value: 0 },
    }]),
    vertexShader: `
varying vec3 vW;
#include <fog_pars_vertex>
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`,
    fragmentShader: `
uniform float uTime, uNight, uChop, uRain, uFlash; uniform vec3 uSunDir, uSunCol, uTop, uHor, uDeep, uShallow; uniform vec4 uIsland;
varying vec3 vW;
#include <fog_pars_fragment>
${GLSL_NOISE}
void main(){
  vec2 p = vW.xz; float t = uTime;
  float dist = length(cameraPosition - vW);
  vec2 g = vec2(0.0);
  g += vec2(0.13, 0.04) * cos(dot(p, vec2(0.13, 0.04)) + t * 1.2) * 0.9;
  g += vec2(-0.07, 0.11) * cos(dot(p, vec2(-0.07, 0.11)) + t * 0.9) * 1.1;
  g += vec2(0.31, -0.22) * cos(dot(p, vec2(0.31, -0.22)) + t * 2.1) * 0.35;
  g += vec2(-0.45, -0.38) * cos(dot(p, vec2(-0.45, -0.38)) + t * 2.7) * 0.2;
  vec2 q = p * 0.35 + vec2(t * 0.3, t * 0.21);
  float n0 = vNoise(q), nx = vNoise(q + vec2(0.4, 0.0)), nz = vNoise(q + vec2(0.0, 0.4));
  g += vec2(nx - n0, nz - n0) * 0.9;
  g *= uChop;
  if (uRain > 0.01) {
    vec2 rq = p * 2.6 + vec2(t * 1.9, -t * 1.4);
    float r0 = vNoise(rq), rx = vNoise(rq + vec2(0.25, 0.0)), rz = vNoise(rq + vec2(0.0, 0.25));
    g += vec2(rx - r0, rz - r0) * 2.2 * uRain * (1.0 - smoothstep(20.0, 140.0, dist));
  }
  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
  N = normalize(mix(N, vec3(0.0, 1.0, 0.0), clamp(dist / 1400.0, 0.0, 0.85)));
  vec3 V = normalize(cameraPosition - vW);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 R = reflect(-V, N);
  vec3 sky = mix(uHor, uTop, pow(max(R.y, 0.0), 0.5));
  vec2 c = vec2(uIsland.x + uIsland.y, uIsland.z + uIsland.w) * 0.5;
  vec2 hs = vec2(uIsland.y - uIsland.x, uIsland.w - uIsland.z) * 0.5;
  vec2 dd = abs(p - c) - hs;
  float sdf = length(max(dd, 0.0)) + min(max(dd.x, dd.y), 0.0);
  float shallowK = exp(-max(sdf, 0.0) * 0.045);
  vec3 base = mix(uDeep, uShallow, shallowK);
  vec3 col = mix(base, sky, fres);
  float sp = max(dot(R, uSunDir), 0.0);
  col += uSunCol * (pow(sp, 260.0) * 5.0 + pow(sp, 24.0) * 0.22) * smoothstep(-0.05, 0.05, uSunDir.y);
  float fn = vNoise(p * 0.55 + vec2(t * 0.4, -t * 0.3));
  float wave = sin(t * 1.3 - sdf * 0.7) * 0.9;
  float foam = smoothstep(4.5, 0.0, sdf + fn * 3.0 - 1.2 - wave) * step(-2.0, sdf);
  col = mix(col, vec3(0.92, 0.96, 1.0) * (1.0 - uNight * 0.72), foam * 0.78);
  col += vec3(1.0, 0.55, 0.3) * uNight * shallowK * 0.18 * smoothstep(0.55, 0.95, vNoise(p * vec2(0.06, 0.9) + vec2(0.0, t * 0.3)));
  // whitecaps in a storm, lightning mirrored in the waves
  col = mix(col, vec3(0.85, 0.9, 0.95) * (1.0 - uNight * 0.7), smoothstep(0.78, 0.95, vNoise(p * 0.21 + vec2(t * 0.5, t * 0.2))) * clamp(uChop - 1.0, 0.0, 1.0) * 0.35 * (1.0 - smoothstep(60.0, 400.0, dist)));
  col += vec3(0.7, 0.78, 1.0) * uFlash * (0.25 + fres * 0.9);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <encodings_fragment>
  #include <fog_fragment>
}`,
    fog: true,
  });
  const w = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000, 1, 1), waterMat);
  w.rotation.x = -Math.PI / 2; w.position.y = -0.45; w.renderOrder = -5;
  scene.add(w);
}

// ---------- glow sprites (single draw call each) ----------
const glowMats = [];
function makeGlowMat() {
  const m = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 500 }, uInt: { value: 1 }, uFogNear: { value: 150 }, uFogFar: { value: 900 } },
    vertexShader: `
attribute float aSize; attribute vec3 aColor; uniform float uScale, uInt, uFogNear, uFogFar; varying vec3 vC;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uScale / max(-mv.z, 0.5), 0.0, 220.0);
  float f = 1.0 - smoothstep(uFogNear, uFogFar * 1.25, -mv.z);
  vC = aColor * uInt * f * smoothstep(0.5, 4.0, -mv.z); }`,
    fragmentShader: `varying vec3 vC; void main(){ vec2 p = gl_PointCoord * 2.0 - 1.0; float d = dot(p, p); if (d > 1.0) discard;
  float a = exp(-d * 5.0) + 0.55 * exp(-d * 40.0); gl_FragColor = vec4(vC * a, 1.0);
  #include <encodings_fragment>
}`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  glowMats.push(m);
  return m;
}
class GlowLayer {
  constructor(max, mat) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.size = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3); this.aCol = new THREE.BufferAttribute(this.col, 3); this.aSize = new THREE.BufferAttribute(this.size, 1);
    this.aPos.setUsage(THREE.DynamicDrawUsage); this.aCol.setUsage(THREE.DynamicDrawUsage); this.aSize.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('aColor', this.aCol); g.setAttribute('aSize', this.aSize);
    g.setDrawRange(0, 0);
    this.geo = g;
    this.points = new THREE.Points(g, mat || makeGlowMat());
    this.points.frustumCulled = false; this.points.renderOrder = 5;
    scene.add(this.points);
  }
  begin() { this.n = 0; }
  add(x, y, z, r, g, b, s) {
    if (this.n >= this.max) return;
    const i = this.n++, i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.col[i3] = r; this.col[i3 + 1] = g; this.col[i3 + 2] = b; this.size[i] = s;
  }
  end() {
    this.geo.setDrawRange(0, this.n);
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aSize.needsUpdate = true;
  }
}
let glowStatic = null, glowDyn = null;

// ---------- particles ----------
let fxMats = null;
class Particles {
  constructor(max, additive) {
    this.max = max; this.alive = 0;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
    this.c = new Float32Array(max * 4); this.c1 = new Float32Array(max * 3); this.drag = new Float32Array(max); this.grav = new Float32Array(max);
    this.outC = new Float32Array(max * 4); this.outS = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.p, 3); this.aCol = new THREE.BufferAttribute(this.outC, 4); this.aSize = new THREE.BufferAttribute(this.outS, 1);
    [this.aPos, this.aCol, this.aSize].forEach((a) => a.setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('position', this.aPos); g.setAttribute('aCol', this.aCol); g.setAttribute('aSize', this.aSize);
    g.setDrawRange(0, 0);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 } },
      vertexShader: `attribute float aSize; attribute vec4 aCol; uniform float uScale; varying vec4 vC;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(aSize * uScale / max(-mv.z, 0.5), 0.0, 260.0); vC = aCol; }`,
      fragmentShader: `varying vec4 vC; void main(){ vec2 p = gl_PointCoord * 2.0 - 1.0; float d = dot(p, p); if (d > 1.0) discard; float a = 1.0 - d; a *= a;
  gl_FragColor = vec4(vC.rgb, vC.a * a);
  #include <encodings_fragment>
}`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false; this.points.renderOrder = 6;
    scene.add(this.points);
  }
  // color: [r,g,b,a] start; end rgb
  emit(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, r1, g1, b1, drag, grav) {
    if (this.alive >= this.max) return;
    const i = this.alive++, i3 = i * 3, i4 = i * 4;
    this.p[i3] = x; this.p[i3 + 1] = y; this.p[i3 + 2] = z;
    this.v[i3] = vx; this.v[i3 + 1] = vy; this.v[i3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life; this.s0[i] = s0; this.s1[i] = s1;
    this.c[i4] = r; this.c[i4 + 1] = g; this.c[i4 + 2] = b; this.c[i4 + 3] = a;
    this.c1[i3] = r1; this.c1[i3 + 1] = g1; this.c1[i3 + 2] = b1; this.drag[i] = drag || 0; this.grav[i] = grav || 0;
  }
  kill(i) {
    const j = --this.alive; if (i === j) return;
    const i3 = i * 3, j3 = j * 3, i4 = i * 4, j4 = j * 4;
    for (let k = 0; k < 3; k++) { this.p[i3 + k] = this.p[j3 + k]; this.v[i3 + k] = this.v[j3 + k]; this.c1[i3 + k] = this.c1[j3 + k]; }
    for (let k = 0; k < 4; k++) this.c[i4 + k] = this.c[j4 + k];
    this.life[i] = this.life[j]; this.maxLife[i] = this.maxLife[j]; this.s0[i] = this.s0[j]; this.s1[i] = this.s1[j]; this.drag[i] = this.drag[j]; this.grav[i] = this.grav[j];
  }
  update(dt) {
    for (let i = this.alive - 1; i >= 0; i--) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.kill(i); continue; }
      const i3 = i * 3, i4 = i * 4;
      const dr = Math.exp(-this.drag[i] * dt);
      this.v[i3] *= dr; this.v[i3 + 1] = this.v[i3 + 1] * dr - this.grav[i] * dt; this.v[i3 + 2] *= dr;
      this.p[i3] += this.v[i3] * dt; this.p[i3 + 1] += this.v[i3 + 1] * dt; this.p[i3 + 2] += this.v[i3 + 2] * dt;
      if (this.p[i3 + 1] < 0.05 && this.grav[i] > 0) { this.p[i3 + 1] = 0.05; this.v[i3 + 1] *= -0.3; }
      const t = 1 - this.life[i] / this.maxLife[i];
      this.outC[i4] = lerp(this.c[i4], this.c1[i3], t); this.outC[i4 + 1] = lerp(this.c[i4 + 1], this.c1[i3 + 1], t); this.outC[i4 + 2] = lerp(this.c[i4 + 2], this.c1[i3 + 2], t);
      this.outC[i4 + 3] = this.c[i4 + 3] * Math.min(1, (1 - t) * 1.6) * Math.min(1, t * 8 + 0.2);
      this.outS[i] = lerp(this.s0[i], this.s1[i], t);
    }
    this.geo.setDrawRange(0, this.alive);
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aSize.needsUpdate = true;
  }
}
let smokeFx = null, fireFx = null, splashFx = null;
function makeFx() {
  smokeFx = new Particles(900, false);
  fireFx = new Particles(700, true);
  splashFx = new Particles(260, false);
  fxMats = [smokeFx.mat, fireFx.mat, splashFx.mat];
  makeRain(); makeGlare();
}

// ---------- rain (one GPU line batch that wraps around the camera) ----------
const RAIN_MAX = 1700, RAIN_BOX = 46, RAIN_H = 26;
let rainMesh = null, boltMesh = null, glareSun = null, glareMoon = null;
function makeRain() {
  const seed = new Float32Array(RAIN_MAX * 2 * 4);
  for (let i = 0; i < RAIN_MAX; i++) {
    const x = Math.random(), y = Math.random(), z = Math.random(), s = Math.random();
    for (let k = 0; k < 2; k++) { const o = (i * 2 + k) * 4; seed[o] = x; seed[o + 1] = y; seed[o + 2] = z; seed[o + 3] = k + s * 0.5; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RAIN_MAX * 2 * 3), 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  g.setDrawRange(0, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uCam: { value: new V3() }, uT: { value: 0 }, uWind: { value: new THREE.Vector2() }, uLen: { value: 1 }, uA: { value: 0.4 }, uCol: { value: new THREE.Color() } },
    vertexShader: `
uniform vec3 uCam; uniform float uT, uLen; uniform vec2 uWind; attribute vec4 aSeed; varying float vA;
void main(){
  float end = floor(aSeed.w), sp = 0.85 + fract(aSeed.w * 2.0) * 0.5;
  vec3 p;
  p.xz = uCam.xz + mod(aSeed.xz * ${RAIN_BOX.toFixed(1)} - uCam.xz, ${RAIN_BOX.toFixed(1)}) - ${(RAIN_BOX / 2).toFixed(1)};
  p.y = uCam.y - ${(RAIN_H * 0.45).toFixed(1)} + mod(aSeed.y * ${RAIN_H.toFixed(1)} - uT * 19.0 * sp, ${RAIN_H.toFixed(1)});
  vec3 dir = normalize(vec3(uWind.x, -19.0 * sp, uWind.y));
  p -= dir * uLen * sp * end;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float d = -mv.z;
  vA = smoothstep(0.6, 2.5, d) * (1.0 - smoothstep(10.0, 24.0, d)) * (0.55 + 0.45 * aSeed.z) * (1.0 - end * 0.65);
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: `uniform float uA; uniform vec3 uCol; varying float vA; void main(){ gl_FragColor = vec4(uCol, vA * uA);
  #include <encodings_fragment>
}`,
    transparent: true, depthWrite: false, fog: false,
  });
  rainMesh = new THREE.LineSegments(g, mat);
  rainMesh.frustumCulled = false; rainMesh.renderOrder = 7; rainMesh.visible = false;
  scene.add(rainMesh);
  // lightning bolt: a jagged line rebuilt on every strike
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(96 * 3), 3));
  bg.setDrawRange(0, 0);
  boltMesh = new THREE.LineSegments(bg, new THREE.LineBasicMaterial({ color: 0xe8eeff, transparent: true, opacity: 1, fog: false, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }));
  boltMesh.frustumCulled = false; boltMesh.visible = false; boltMesh.renderOrder = -4;
  scene.add(boltMesh);
}
function buildBolt(x, z) {
  const a = boltMesh.geometry.attributes.position, p = a.array;
  let n = 0;
  const seg = (x0, y0, z0, x1, y1, z1) => { if (n >= 96) return; p.set([x0, y0, z0, x1, y1, z1], n * 3); n += 2; };
  let px = x, py = 340, pz = z;
  while (py > 4 && n < 70) {
    const nx = px + rr(-16, 16), ny = py - rr(14, 30), nz = pz + rr(-16, 16);
    seg(px, py, pz, nx, Math.max(0, ny), nz);
    if (Math.random() < 0.22 && n < 84) { let bx = nx, by = ny, bz = nz; for (let k = 0; k < 3; k++) { const cx = bx + rr(-18, 18), cy = by - rr(10, 22), cz = bz + rr(-18, 18); seg(bx, by, bz, cx, cy, cz); bx = cx; by = cy; bz = cz; } }
    px = nx; py = ny; pz = nz;
  }
  boltMesh.geometry.setDrawRange(0, n);
  a.needsUpdate = true;
}
// ---------- sun glare and moon halo (cheap bloom stand-in) ----------
function makeGlare() {
  const c = mkCanvas(256, 256), g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.06, 'rgba(255,250,235,0.85)'); gr.addColorStop(0.2, 'rgba(255,225,190,0.28)');
  gr.addColorStop(0.5, 'rgba(255,200,160,0.07)'); gr.addColorStop(1, 'rgba(255,190,150,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,230,210,0.06)'; g.lineWidth = 5; g.beginPath(); g.arc(128, 128, 92, 0, TAU); g.stroke();
  TEX.glare = toTex(c, { wrap: false, srgb: false });
  const mk = () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glare, color: 0x000000, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
    s.renderOrder = -6; s.frustumCulled = false; scene.add(s); return s;
  };
  glareSun = mk(); glareMoon = mk();
}
function puffSmoke(x, y, z, n, dark, spread) {
  spread = spread || 0.6;
  for (let i = 0; i < n; i++) {
    const g = dark ? rr(0.05, 0.12) : rr(0.55, 0.75);
    smokeFx.emit(x + rr(-0.3, 0.3), y, z + rr(-0.3, 0.3), rr(-spread, spread), rr(0.6, 1.8), rr(-spread, spread), rr(1.2, 2.4), rr(0.6, 1.0), rr(2.4, 4.0), g, g, g * 1.04, dark ? 0.55 : 0.32, g * 0.9, g * 0.9, g, 0.8, -0.25);
  }
}
function sparks(x, y, z, n) {
  for (let i = 0; i < n; i++) fireFx.emit(x, y, z, rr(-6, 6), rr(1, 6), rr(-6, 6), rr(0.25, 0.6), 0.25, 0.05, 1.6, 1.1, 0.5, 1, 1.2, 0.3, 0.05, 1.5, 14);
}
function explosionFx(x, y, z) {
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * TAU, e = rr(-0.2, 1), s = rr(4, 16);
    fireFx.emit(x, y + 0.8, z, Math.cos(a) * s * Math.cos(e), Math.abs(Math.sin(e)) * s + 2, Math.sin(a) * s * Math.cos(e), rr(0.4, 1.1), rr(1.5, 3), rr(3, 6), 2.2, 1.3, 0.4, 1, 1.0, 0.15, 0.02, 2.2, 2);
  }
  sparks(x, y + 1, z, 40);
  puffSmoke(x, y + 1.5, z, 26, true, 3.5);
}

// ---------- weather ----------
// ATMO.set(type, instant) with type 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog'; transitions are smooth unless instant.
// ATMO.auto: random weather changes while playing (story). ATMO.wet: street wetness 0..1 (lags behind the rain).
// windU.value: palm sway multiplier (1 = calm breeze), wetU.value: wetness fed to the asphalt/sidewalk shader.
// Emits EV 'weather' {type} when the target weather changes.
const WEATHER_TYPES = {
  clear: { cover: 0.32, dark: 0, rain: 0, wet: 0, fog: 1, wind: 1, sun: 1, haze: 0, storm: 0, chop: 1 },
  cloudy: { cover: 0.74, dark: 0.3, rain: 0, wet: 0, fog: 0.8, wind: 1.5, sun: 0.55, haze: 0.12, storm: 0, chop: 1.25 },
  rain: { cover: 0.96, dark: 0.6, rain: 0.72, wet: 1, fog: 0.52, wind: 2.1, sun: 0.3, haze: 0.45, storm: 0, chop: 1.5 },
  storm: { cover: 1, dark: 0.82, rain: 1, wet: 1, fog: 0.38, wind: 3.4, sun: 0.17, haze: 0.55, storm: 1, chop: 2.1 },
  fog: { cover: 0.62, dark: 0.28, rain: 0, wet: 0.3, fog: 0.2, wind: 0.45, sun: 0.5, haze: 0.9, storm: 0, chop: 0.7 },
};
const WEATHER_NAMES = { clear: 'Ясно', cloudy: 'Облачно', rain: 'Дождь', storm: 'Гроза', fog: 'Туман' };
const windU = { value: 1 }, wetU = { value: 0 };
const ATMO = {
  type: 'clear', auto: true, nextT: 260, wet: 0, flash: 0, flashT: 9, boltT: 7, t: 0, envDark: -1, rainAud: null,
  cur: Object.assign({}, WEATHER_TYPES.clear),
  set(type, instant) {
    if (!WEATHER_TYPES[type]) return;
    const changed = type !== this.type;
    this.type = type;
    if (instant) { Object.assign(this.cur, WEATHER_TYPES[type]); this.wet = WEATHER_TYPES[type].wet; DAY.envT = 99; this.envDark = -1; }
    if (changed) EV.emit('weather', { type });
  },
  // story: pick the next weather (fog in the early morning, rain more likely in the evening)
  pickNext() {
    const h = DAY.hours, morning = h > 4.5 && h < 9.5, eve = h > 17 || h < 3;
    const w = { clear: 5, cloudy: 2.6, rain: eve ? 1.8 : 1.1, storm: eve ? 0.9 : 0.5, fog: morning ? 2.4 : 0.35 };
    w[this.type] *= 0.25;
    let sum = 0; for (const k in w) sum += w[k];
    let r = Math.random() * sum;
    for (const k in w) { r -= w[k]; if (r <= 0) return k; }
    return 'clear';
  },
};
const _cHaze = new THREE.Color(), _cFlash = new THREE.Color(0.75, 0.82, 1.0);
const RAIN_DAY = new THREE.Color(0.66, 0.71, 0.78), RAIN_NIGHT = new THREE.Color(0.5, 0.54, 0.66);
function weatherTint(c, dark, haze) {
  const l = c.r * 0.299 + c.g * 0.587 + c.b * 0.114, k = dark * 0.72, m = 1 - dark * 0.42;
  c.setRGB(lerp(c.r, l * 0.92, k) * m, lerp(c.g, l * 0.97, k) * m, lerp(c.b, l * 1.05, k) * m);
  if (haze > 0) c.lerp(_cHaze, haze);
}
function strikeLightning() {
  const a = Math.random() * TAU, d = rr(240, 720);
  buildBolt(camera.position.x + Math.cos(a) * d, camera.position.z + Math.sin(a) * d);
  ATMO.flashT = 0;
  if (AUD.ready) {
    const delay = Math.min(2.6, d / 340), v = clamp(1.1 - d / 900, 0.25, 0.9);
    AUD.noise(0.35, 0.3 * v, 1400, 0.6, 'lowpass', delay);
    AUD.noise(2.8, 0.55 * v, 150, 0.5, 'lowpass', delay + 0.05);
    AUD.noise(1.6, 0.35 * v, 380, 0.7, 'lowpass', delay + 0.5);
    AUD.tone(48, 2.0, 'sine', 0.32 * v, 30, delay);
  }
}
function rainAudio(v) {
  if (!AUD.ready) return;
  let R = ATMO.rainAud;
  if (!R) {
    const ctx = AUD.ctx, buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0);
    let b = 0; for (let i = 0; i < d.length; i++) { b = b * 0.6 + (Math.random() * 2 - 1) * 0.4; d[i] = b; }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(AUD.sfx); src.start();
    R = ATMO.rainAud = { g, v: 0 };
  }
  if (Math.abs(R.v - v) > 0.004) { R.v = v; R.g.gain.setTargetAtTime(v, AUD.ctx.currentTime, 0.4); }
}
function updateWeather(dt, playing) {
  const A = ATMO, W = WEATHER_TYPES[A.type], c = A.cur;
  A.t += dt;
  if (playing && A.auto) { A.nextT -= dt; if (A.nextT <= 0) { const n = A.pickNext(); A.set(n); A.nextT = n === 'storm' || n === 'fog' ? rr(100, 200) : rr(170, 380); } }
  const k = 1 - Math.exp(-0.32 * dt);
  for (const key in W) c[key] += (W[key] - c[key]) * k;
  A.wet = c.rain > 0.05 ? Math.min(1, A.wet + dt * 0.22 * c.rain) : Math.max(W.wet, A.wet - dt * 0.012);
  if (W.wet > A.wet) A.wet = Math.min(W.wet, A.wet + dt * 0.04);
  wetU.value = A.wet;
  const gust = 0.82 + 0.18 * Math.sin(A.t * 0.7) * Math.sin(A.t * 1.9 + 1.3) + 0.12 * Math.sin(A.t * 3.1) * c.storm;
  windU.value = c.wind * gust;
  // lightning
  if (c.storm > 0.6) { A.boltT -= dt; if (A.boltT <= 0) { A.boltT = rr(4, 13); strikeLightning(); } }
  if (A.flashT < 1) {
    A.flashT += dt; const t = A.flashT;
    A.flash = (Math.max(0, 1 - t / 0.11) + (t > 0.16 ? 0.75 * Math.max(0, 1 - (t - 0.16) / 0.14) : 0) + (t > 0.36 ? 0.35 * Math.max(0, 1 - (t - 0.36) / 0.3) : 0)) * c.storm;
    boltMesh.visible = t < 0.42 && c.storm > 0.3;
    boltMesh.material.opacity = Math.min(1, A.flash * 1.4 + 0.2);
  } else { A.flash = 0; boltMesh.visible = false; }
  // rain streaks around the camera + splashes
  const rain = c.rain;
  rainMesh.visible = rain > 0.01;
  if (rainMesh.visible) {
    const u = rainMesh.material.uniforms;
    u.uCam.value.copy(camera.position); u.uT.value = A.t;
    u.uWind.value.set(Math.sin(A.t * 0.13) * 2 + 3, 2.2).multiplyScalar(c.wind * 0.9);
    u.uLen.value = 0.95 + c.storm * 0.55; u.uA.value = 0.42 + 0.25 * c.storm;
    u.uCol.value.copy(RAIN_DAY).lerp(RAIN_NIGHT, DAY.night).lerp(_cFlash, A.flash * 0.8);
    rainMesh.geometry.setDrawRange(0, Math.floor(Math.min(RAIN_MAX, Q.rain) * Math.min(1, rain)) * 2);
    let n = rain * dt * 70 * Q.splash, cx = camera.position.x, cz = camera.position.z;
    while (n > 0) {
      if (n < 1 && Math.random() > n) break;
      n -= 1;
      const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * 16, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r, y = groundH(x, z) + 0.04;
      if (y < -0.2) continue;
      const b = 0.55 + 0.25 * (1 - DAY.night);
      splashFx.emit(x, y, z, rr(-0.4, 0.4), rr(0.6, 1.3), rr(-0.4, 0.4), rr(0.18, 0.3), 0.05, 0.16, b, b, b * 1.06, 0.45, b, b, b, 0, 6);
    }
  }
  splashFx.update(dt);
  rainAudio(playing ? rain * 0.055 + c.storm * 0.02 : 0);
}

// ---------- day / night ----------
const DAY = { hours: 18, rate: 1 / 60, frozen: false, night: 0, elev: 0, sunDir: new V3(), moonDir: new V3(), envT: 99, lastEnvDir: new V3(0, 1, 0) };
const SKYKEYS = [
  [-0.4, '#050a1c', '#16163a', '#06070f', '#000000', '#141832'],
  [-0.14, '#0a1236', '#2e1f5c', '#0c0b1a', '#2a1638', '#22224a'],
  [-0.03, '#1b2862', '#c9476e', '#2a1b2b', '#ff5a3a', '#4a3354'],
  [0.05, '#2d4b97', '#ff8b55', '#4a3636', '#ff8a45', '#ffb08a'],
  [0.16, '#3a6cc0', '#ffbf8f', '#6b5a50', '#ffcf98', '#fff0e2'],
  [0.38, '#2c77da', '#a9cff5', '#7a7468', '#fff0dc', '#ffffff'],
  [1.01, '#1f62c8', '#9fc8f2', '#7a7468', '#ffffff', '#ffffff'],
].map((k) => ({ e: k[0], top: new THREE.Color(k[1]), hor: new THREE.Color(k[2]), gnd: new THREE.Color(k[3]), sun: new THREE.Color(k[4]), cloud: new THREE.Color(k[5]) }));
const _cTop = new THREE.Color(), _cHor = new THREE.Color(), _cGnd = new THREE.Color(), _cSun = new THREE.Color(), _cCloud = new THREE.Color();
const MOONCOL = new THREE.Color('#8fa6ff');
const DEEP_DAY = new THREE.Color('#0b4c70'), DEEP_NIGHT = new THREE.Color('#020611');
const SH_DAY = new THREE.Color('#1fbdbb'), SH_NIGHT = new THREE.Color('#05202b');
const HEMI_GND = new THREE.Color('#4a3a2c');
const NIGHT_AMB = new THREE.Color('#34407a');
function skyAt(e) {
  let i = 0;
  while (i < SKYKEYS.length - 2 && e > SKYKEYS[i + 1].e) i++;
  const a = SKYKEYS[i], b = SKYKEYS[i + 1];
  const t = clamp((e - a.e) / (b.e - a.e), 0, 1);
  _cTop.copy(a.top).lerp(b.top, t); _cHor.copy(a.hor).lerp(b.hor, t); _cGnd.copy(a.gnd).lerp(b.gnd, t);
  _cSun.copy(a.sun).lerp(b.sun, t); _cCloud.copy(a.cloud).lerp(b.cloud, t);
}
function updateDay(dt, playing) {
  if (playing && !DAY.frozen) DAY.hours = (DAY.hours + dt * DAY.rate) % 24;
  updateWeather(dt, playing);
  const W = ATMO.cur, dark = W.dark, flash = ATMO.flash;
  const a = (DAY.hours - 6) / 24 * TAU;
  DAY.sunDir.set(-Math.cos(a), Math.sin(a) * 0.92, 0.32).normalize();
  DAY.moonDir.set(Math.cos(a) * 0.8, -Math.sin(a) * 0.9 + 0.12, -0.3).normalize();
  const e = DAY.sunDir.y; DAY.elev = e;
  skyAt(e);
  const night = sstep(0.07, -0.13, e);
  DAY.night = night;
  // haze colour: a grey of the horizon's brightness, keeping some of its tint (warm in the morning, deep blue at night)
  const hl = _cHor.r * 0.299 + _cHor.g * 0.587 + _cHor.b * 0.114;
  _cHaze.setRGB(hl * 0.97, hl, hl * 1.04).lerp(_cHor, 0.4).multiplyScalar(lerp(1.15, 1.6, night) * (1 - dark * 0.5));
  const su = skyMat.uniforms;
  su.uTop.value.copy(_cTop); su.uHor.value.copy(_cHor); su.uGnd.value.copy(_cGnd); su.uSunCol.value.copy(_cSun);
  su.uSunDir.value.copy(DAY.sunDir); su.uMoonDir.value.copy(DAY.moonDir); su.uNight.value = night; su.uCloudCol.value.copy(_cCloud);
  su.uCover.value = W.cover; su.uDark.value = dark; su.uHaze.value = W.haze; su.uHazeCol.value.copy(_cHaze); su.uFlash.value = flash;
  // from here on the palette is the weather-tinted one (fog, ambient light, water reflections)
  weatherTint(_cTop, dark, W.haze * 0.6); weatherTint(_cHor, dark, W.haze * 0.75);
  const sunI = sstep(-0.03, 0.14, e) * 2.7 * W.sun;
  const moonI = sstep(-0.03, -0.18, e) * 0.8 * lerp(1, 0.35, Math.min(1, W.cover * 1.2 - 0.2));
  if (e > -0.05) { sun.color.copy(_cSun); sun.intensity = sunI; DAY.lightDir = DAY.sunDir; }
  else { sun.color.copy(MOONCOL); sun.intensity = moonI; DAY.lightDir = DAY.moonDir; }
  hemi.color.copy(_cTop).lerp(_cHor, 0.45).lerp(NIGHT_AMB, night * 0.55).lerp(_cFlash, Math.min(1, flash));
  hemi.groundColor.copy(HEMI_GND).multiplyScalar(lerp(1, 0.25, night));
  hemi.intensity = lerp(0.62, 0.55, night) + (1 - W.sun) * 0.38 * (1 - night) + flash * 2.4;
  renderer.toneMappingExposure = lerp(1.0, 1.32, night) * (1 - dark * 0.08);
  scene.fog.color.copy(_cHor).lerp(_cTop, 0.15).lerp(_cHaze, W.haze * 0.6);
  const fogK = sstep(0.55, 0.15, W.fog); // 0 in clear air, 1 in thick fog
  scene.fog.far = Q.fog * lerp(1, 0.82, night) * W.fog; scene.fog.near = scene.fog.far * lerp(0.16, 0.01, fogK);
  glowMats.forEach((m) => { m.uniforms.uFogNear.value = scene.fog.near; m.uniforms.uFogFar.value = scene.fog.far; });
  const wu = waterMat.uniforms;
  wu.uTop.value.copy(_cTop); wu.uHor.value.copy(_cHor); wu.uSunCol.value.copy(_cSun).multiplyScalar(W.sun); wu.uSunDir.value.copy(DAY.sunDir); wu.uNight.value = night;
  wu.uDeep.value.copy(DEEP_DAY).lerp(DEEP_NIGHT, night); wu.uShallow.value.copy(SH_DAY).lerp(SH_NIGHT, night);
  if (dark > 0) { weatherTint(wu.uDeep.value, dark * 0.8, 0); weatherTint(wu.uShallow.value, dark, 0); }
  wu.uChop.value = W.chop; wu.uRain.value = W.rain; wu.uFlash.value = flash;
  wu.fogColor.value.copy(scene.fog.color); wu.fogNear.value = scene.fog.near; wu.fogFar.value = scene.fog.far;
  bldU.uNight.value = night;
  updateGlare(e, night, W);
  DAY.envT += dt;
  const envW = dark + W.haze * 0.5 + W.cover * 0.3;
  if (DAY.envT > 2.5 && (DAY.lastEnvDir.distanceTo(DAY.sunDir) > 0.01 || Math.abs(envW - ATMO.envDark) > 0.05)) {
    DAY.envT = 0; DAY.lastEnvDir.copy(DAY.sunDir); ATMO.envDark = envW; updateEnv();
  }
}
const _gp = new V3();
function updateGlare(e, night, W) {
  if (!glareSun) return;
  const open = 1 - sstep(0.5, 0.95, W.cover), d = 2400;
  const ks = sstep(-0.06, 0.08, e) * open * (0.32 + 0.25 * sstep(0.35, 0.05, e)) * (1 - W.haze * 0.7);
  glareSun.visible = ks > 0.005;
  if (glareSun.visible) {
    _gp.copy(DAY.sunDir).multiplyScalar(d).add(camera.position); glareSun.position.copy(_gp);
    glareSun.scale.setScalar(d * lerp(0.42, 0.62, sstep(0.3, 0.0, e)));
    glareSun.material.color.copy(_cSun).multiplyScalar(ks);
  }
  const km = night * open * 0.2 * sstep(-0.1, 0.1, DAY.moonDir.y);
  glareMoon.visible = km > 0.005;
  if (glareMoon.visible) {
    _gp.copy(DAY.moonDir).multiplyScalar(d).add(camera.position); glareMoon.position.copy(_gp);
    glareMoon.scale.setScalar(d * 0.16); glareMoon.material.color.setRGB(0.6 * km, 0.7 * km, km);
  }
}

// ---------- wet streets, wind in the palms, lamp reflections (installed after the city is built) ----------
// Wet shader: darker albedo and low roughness, with world-space puddles that become mirrors of scene.environment.
function installWet(m, key, strength) {
  if (!m || m.userData.wet) return;
  m.userData.wet = true;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r);
    sh.uniforms.uWet = wetU;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWetP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWetP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uWet; varying vec3 vWetP;\n' + GLSL_NOISE)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
if (uWet > 0.003) {
  float pn = vNoise(vWetP.xz * 0.09) * 0.62 + vNoise(vWetP.xz * 0.37 + 7.1) * 0.38;
  float pud = smoothstep(${(0.56 + (1 - strength) * 0.12).toFixed(3)}, ${(0.64 + (1 - strength) * 0.12).toFixed(3)}, pn) * smoothstep(0.3, 0.85, uWet);
  float wk = uWet * ${strength.toFixed(2)};
  roughnessFactor = mix(roughnessFactor, mix(0.3, 0.035, pud), clamp(wk + pud, 0.0, 1.0));
  diffuseColor.rgb *= 1.0 - 0.36 * wk - 0.3 * pud;
}`);
  };
  m.customProgramCacheKey = () => 'neon-wet-' + key;
  m.needsUpdate = true;
}
function installWind(m) {
  if (!m || m.userData.wind) return;
  m.userData.wind = true;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r);
    sh.uniforms.uWind = windU;
    const hasT = /uniform\s+float\s+uTime\s*;/.test(sh.vertexShader);
    if (!sh.uniforms.uTime) sh.uniforms.uTime = timeU;
    // scale whatever sway the material already has by the wind, and add a fast flutter in strong wind
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWind;' + (hasT ? '' : '\nuniform float uTime;'))
      .replace('#include <morphtarget_vertex>', `{
  vec3 sway = transformed - position;
  float fl = length(position.xz - vec2(1.3, 0.0)) * 0.05 * max(0.0, uWind - 1.0);
  transformed = position + sway * uWind;
  transformed.y += sin(uTime * 7.3 + position.x * 1.7 + position.z) * fl * 0.35;
  transformed.x += fl * 0.5 * (0.6 + 0.4 * sin(uTime * 2.1));
}
#include <morphtarget_vertex>`);
  };
  m.customProgramCacheKey = () => 'neon-wind-fronds';
  m.needsUpdate = true;
}
// Reflections of street lamps (static) and car lights (copied from the dynamic glow layer) on wet asphalt:
// instanced quads that stretch from each light's foot toward the camera, built entirely in the vertex shader.
// Lamps are re-selected a few times per second: within REFL_R of the camera and with a clear line of sight.
const REFL = { mesh: null, max: 96, pos: null, col: null, aPos: null, aCol: null, lamps: null, vis: [], t: 0, cx: 1e9, cz: 1e9 };
const REFL_R = 115;
function makeReflections(lamps) {
  const max = REFL.max;
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0]), 3));
  g.setIndex([0, 1, 2, 1, 3, 2]);
  // aPos = (x, light height above the road, z); the quad lies on the road and runs from the light's foot to its mirror point
  const pos = new Float32Array(max * 3), col = new Float32Array(max * 3);
  const aPos = new THREE.InstancedBufferAttribute(pos, 3), aCol = new THREE.InstancedBufferAttribute(col, 3);
  aPos.setUsage(THREE.DynamicDrawUsage); aCol.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('aPos', aPos); g.setAttribute('aCol', aCol);
  g.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uInt: { value: 0 }, uFogNear: { value: 100 }, uFogFar: { value: 700 }, uT: timeU },
    vertexShader: `
attribute vec3 aPos; attribute vec3 aCol; uniform float uFogNear, uFogFar; varying vec2 vUv; varying vec3 vC;
void main(){
  vec2 to = cameraPosition.xz - aPos.xz; float L = length(to); vec2 dir = to / max(L, 0.001); vec2 side = vec2(-dir.y, dir.x);
  float E = max(cameraPosition.y - 0.03, 0.3);
  float m = L * aPos.y / (E + aPos.y);          // foot → mirror point distance
  float len = min(m * 1.3, L - 0.4);
  float t = position.y * len;
  float w = max(L - t, 0.6) * (0.008 + 0.016 * position.y * position.y); // roughly constant width on screen, blurrier near the viewer
  vec2 xz = aPos.xz + side * position.x * w + dir * t;
  vec4 mv = viewMatrix * vec4(xz.x, 0.03, xz.y, 1.0);
  vUv = vec2(position.x, t / max(m, 0.01));
  vC = aCol * (1.0 - smoothstep(min(uFogNear, 60.0), min(uFogFar, ${REFL_R.toFixed(1)}), L)) * smoothstep(1.0, 4.0, L);
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: `uniform float uInt, uT; varying vec2 vUv; varying vec3 vC;
void main(){ float d = vUv.y - 1.0; float a = exp(-vUv.x * vUv.x * 3.0) * exp(-d * d / (d < 0.0 ? 0.13 : 0.015)) * smoothstep(0.0, 0.1, vUv.y);
  a *= 0.8 + 0.2 * sin(vUv.y * 38.0 - uT * 2.5 + vUv.x * 2.0);
  gl_FragColor = vec4(vC * a * uInt, 1.0);
  #include <encodings_fragment>
}`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, side: THREE.DoubleSide,
  });
  REFL.mesh = new THREE.Mesh(g, mat);
  REFL.mesh.frustumCulled = false; REFL.mesh.renderOrder = 2; REFL.mesh.visible = false;
  Object.assign(REFL, { pos, col, aPos, aCol, lamps });
  scene.add(REFL.mesh);
}
function reflPut(n, x, h, z, r, g, b) {
  const P = REFL.pos, C = REFL.col, o = n * 3;
  P[o] = x; P[o + 1] = h; P[o + 2] = z; C[o] = r; C[o + 1] = g; C[o + 2] = b;
  return n + 1;
}
const reflSees = (x, z) => typeof losClear !== 'function' || losClear(camera.position.x, camera.position.z, x, z);
function reflPickLamps() {
  const cx = camera.position.x, cz = camera.position.z, L = REFL.lamps, V = REFL.vis;
  V.length = 0;
  for (let i = 0; i < L.length; i++) {
    const dx = L[i][0] - cx, dz = L[i][1] - cz;
    if (dx * dx + dz * dz < REFL_R * REFL_R && reflSees(L[i][0], L[i][1])) V.push(L[i]);
  }
  REFL.cx = cx; REFL.cz = cz; REFL.t = 0;
}
EXT.boot.push(() => {
  if (typeof MATS !== 'undefined') { installWet(MATS.asphalt, 'asphalt', 1); installWet(MATS.side, 'side', 0.7); }
  if (typeof frondMat !== 'undefined' && frondMat) installWind(frondMat);
  if (typeof SPOT !== 'undefined' && SPOT.lamps) makeReflections(SPOT.lamps);
});
// Car head/tail lights: copy low glow points (y < 1.6) from the dynamic glow layer into the reflection batch.
EXT.glow.push((layer) => {
  if (!REFL.mesh) return;
  const k = ATMO.wet, ln = sstep(0.05, 0.4, DAY.night); // street lamps only reflect once they are lit
  REFL.mesh.visible = k > 0.03;
  if (!REFL.mesh.visible) return;
  const m = REFL.mesh.material.uniforms;
  m.uInt.value = k * 0.6; m.uFogNear.value = scene.fog.near; m.uFogFar.value = scene.fog.far;
  const cx = camera.position.x, cz = camera.position.z;
  let n = 0;
  if (ln > 0.01) {
    REFL.t += 1;
    if (REFL.t > 12 || Math.abs(cx - REFL.cx) + Math.abs(cz - REFL.cz) > 5) reflPickLamps();
    const r = ln, g = 0.66 * ln, b = 0.36 * ln;
    for (let i = 0; i < REFL.vis.length && n < REFL.max - 24; i++) n = reflPut(n, REFL.vis[i][0], 7.7, REFL.vis[i][1], r, g, b);
    for (let i = 0; i < REFL.extra.length && n < REFL.max - 16; i++) { const e = REFL.extra[i]; if (Math.abs(e[0] - cx) < REFL_R && Math.abs(e[1] - cz) < REFL_R) n = reflPut(n, e[0], 7.7, e[1], r, g, b); }
  }
  const s = Math.min(1.6, 0.6 / Math.max(0.2, DAY.night));
  for (let i = 0; i < layer.n && n < REFL.max; i++) {
    const i3 = i * 3, y = layer.pos[i3 + 1];
    if (y > 1.6 || y < 0) continue;
    const x = layer.pos[i3], z = layer.pos[i3 + 2], dx = x - cx, dz = z - cz;
    if (dx * dx + dz * dz > 4900 || (dx * dx + dz * dz > 400 && !reflSees(x, z))) continue;
    n = reflPut(n, x, Math.max(0.3, y), z, layer.col[i3] * s, layer.col[i3 + 1] * s, layer.col[i3 + 2] * s);
  }
  REFL.mesh.geometry.instanceCount = n;
  REFL.aPos.updateRange.offset = 0; REFL.aPos.updateRange.count = n * 3; REFL.aPos.needsUpdate = true;
  REFL.aCol.updateRange.offset = 0; REFL.aCol.updateRange.count = n * 3; REFL.aCol.needsUpdate = true;
});
REFL.extra = []; // [[x, z], ...] extra lamp feet (creative street lamps)
// on wet asphalt the specular streaks take over from the diffuse lamp pools (08_main sets the base opacity before EXT.visual)
EXT.visual.push(() => { if (typeof MATS !== 'undefined' && MATS.pool && ATMO.wet > 0.01) MATS.pool.opacity *= 1 - ATMO.wet * 0.45; });
const _lr = new V3(), _lu = new V3(), _sc = new V3();
function placeShadow(cx, cy, cz) {
  const ld = DAY.lightDir || DAY.sunDir;
  _lr.crossVectors(UP, ld).normalize(); _lu.crossVectors(ld, _lr);
  const sc = sun.shadow.camera;
  const texel = (sc.right - sc.left) / sun.shadow.mapSize.x;
  _sc.set(cx, cy, cz);
  let r = _sc.dot(_lr), u = _sc.dot(_lu); const f = _sc.dot(ld);
  r = Math.round(r / texel) * texel; u = Math.round(u / texel) * texel;
  _sc.copy(_lr).multiplyScalar(r).addScaledVector(_lu, u).addScaledVector(ld, f);
  sun.target.position.copy(_sc);
  sun.position.copy(_sc).addScaledVector(ld, 260);
}
