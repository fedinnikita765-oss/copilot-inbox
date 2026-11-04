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
const DEFAULT_SAVE = { money: 300, mission: 0, quality: 'auto', sound: true, music: true, sens: 1, tokens: [], hours: 17.4 };
function readSave() { try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
const save = Object.assign({}, DEFAULT_SAVE, readSave() || {});
if (!Array.isArray(save.tokens)) save.tokens = [];
function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* storage blocked */ } }

// ---------- quality ----------
const QUALITY = {
  low: { pr: 1.0, minPr: 0.6, shadows: false, shadowSize: 1024, peds: 12, traffic: 10, fog: 520, clouds: 0, pools: false },
  medium: { pr: 1.5, minPr: 0.75, shadows: true, shadowSize: 1024, peds: 18, traffic: 14, fog: 720, clouds: 1, pools: true },
  high: { pr: 2.0, minPr: 0.9, shadows: true, shadowSize: 2048, peds: 24, traffic: 18, fog: 900, clouds: 1, pools: true },
};
let qualityName = 'medium';
let Q = QUALITY.medium;
let dynPR = 1;

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
  Q = QUALITY[name];
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
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
uniform vec3 uTop, uHor, uGnd, uSunCol, uSunDir, uMoonDir, uCloudCol; uniform float uNight, uTime, uCloud;
varying vec3 vDir;
${GLSL_NOISE}
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHor, uTop, pow(clamp(h, 0.0, 1.0), 0.48));
  col = mix(col, uGnd, smoothstep(0.0, -0.12, h));
  float sd = max(dot(d, uSunDir), 0.0);
  float sunUp = smoothstep(-0.12, 0.02, uSunDir.y);
  col += uSunCol * (pow(sd, 5.0) * 0.22 + pow(sd, 48.0) * 0.4) * sunUp;
  col += uSunCol * smoothstep(0.99935, 0.99965, sd) * 14.0 * sunUp;
  float md = max(dot(d, uMoonDir), 0.0);
  col += vec3(0.85, 0.9, 1.0) * (smoothstep(0.99905, 0.9994, md) * 2.6 + pow(md, 60.0) * 0.08) * uNight;
  if (h > 0.0) {
    vec3 sc = floor(d * 300.0);
    float s = fract(sin(dot(sc, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    float tw = 0.6 + 0.4 * sin(uTime * 3.0 + s * 40.0);
    col += vec3(0.9, 0.95, 1.0) * step(0.9975, s) * tw * uNight * smoothstep(0.02, 0.3, h) * 1.4;
    if (uCloud > 0.5) {
      vec2 uv = d.xz / (h + 0.14) * 1.4 + vec2(uTime * 0.006, uTime * 0.002);
      float c = smoothstep(0.48, 0.82, fbm(uv * 1.6)) * smoothstep(0.0, 0.18, h);
      vec3 cc = uCloudCol + uSunCol * pow(sd, 6.0) * 0.55 * sunUp;
      col = mix(col, cc, c * 0.82);
    }
  }
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
  const old = envRT;
  envRT = pmrem.fromScene(skyScene, 0.035, 0.1, 100);
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
    }]),
    vertexShader: `
varying vec3 vW;
#include <fog_pars_vertex>
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`,
    fragmentShader: `
uniform float uTime, uNight; uniform vec3 uSunDir, uSunCol, uTop, uHor, uDeep, uShallow; uniform vec4 uIsland;
varying vec3 vW;
#include <fog_pars_fragment>
${GLSL_NOISE}
void main(){
  vec2 p = vW.xz; float t = uTime;
  vec2 g = vec2(0.0);
  g += vec2(0.13, 0.04) * cos(dot(p, vec2(0.13, 0.04)) + t * 1.2) * 0.9;
  g += vec2(-0.07, 0.11) * cos(dot(p, vec2(-0.07, 0.11)) + t * 0.9) * 1.1;
  g += vec2(0.31, -0.22) * cos(dot(p, vec2(0.31, -0.22)) + t * 2.1) * 0.35;
  g += vec2(-0.45, -0.38) * cos(dot(p, vec2(-0.45, -0.38)) + t * 2.7) * 0.2;
  vec2 q = p * 0.35 + vec2(t * 0.3, t * 0.21);
  float n0 = vNoise(q), nx = vNoise(q + vec2(0.4, 0.0)), nz = vNoise(q + vec2(0.0, 0.4));
  g += vec2(nx - n0, nz - n0) * 0.9;
  float dist = length(cameraPosition - vW);
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
let smokeFx = null, fireFx = null;
function makeFx() {
  smokeFx = new Particles(900, false);
  fireFx = new Particles(700, true);
  fxMats = [smokeFx.mat, fireFx.mat];
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

// ---------- day / night ----------
const DAY = { hours: 18, rate: 1 / 60, night: 0, elev: 0, sunDir: new V3(), moonDir: new V3(), envT: 99, lastEnvDir: new V3(0, 1, 0) };
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
  if (playing) DAY.hours = (DAY.hours + dt * DAY.rate) % 24;
  const a = (DAY.hours - 6) / 24 * TAU;
  DAY.sunDir.set(-Math.cos(a), Math.sin(a) * 0.92, 0.32).normalize();
  DAY.moonDir.set(Math.cos(a) * 0.8, -Math.sin(a) * 0.9 + 0.12, -0.3).normalize();
  const e = DAY.sunDir.y; DAY.elev = e;
  skyAt(e);
  const night = sstep(0.07, -0.13, e);
  DAY.night = night;
  const su = skyMat.uniforms;
  su.uTop.value.copy(_cTop); su.uHor.value.copy(_cHor); su.uGnd.value.copy(_cGnd); su.uSunCol.value.copy(_cSun);
  su.uSunDir.value.copy(DAY.sunDir); su.uMoonDir.value.copy(DAY.moonDir); su.uNight.value = night; su.uCloudCol.value.copy(_cCloud);
  const sunI = sstep(-0.03, 0.14, e) * 2.7;
  const moonI = sstep(-0.03, -0.18, e) * 0.8;
  if (e > -0.05) { sun.color.copy(_cSun); sun.intensity = sunI; DAY.lightDir = DAY.sunDir; }
  else { sun.color.copy(MOONCOL); sun.intensity = moonI; DAY.lightDir = DAY.moonDir; }
  hemi.color.copy(_cTop).lerp(_cHor, 0.45).lerp(NIGHT_AMB, night * 0.55);
  hemi.groundColor.copy(HEMI_GND).multiplyScalar(lerp(1, 0.25, night));
  hemi.intensity = lerp(0.62, 0.55, night);
  renderer.toneMappingExposure = lerp(1.0, 1.32, night);
  scene.fog.color.copy(_cHor).lerp(_cTop, 0.15);
  scene.fog.far = Q.fog * lerp(1, 0.82, night); scene.fog.near = Q.fog * 0.16;
  glowMats.forEach((m) => { m.uniforms.uFogNear.value = scene.fog.near; m.uniforms.uFogFar.value = scene.fog.far; });
  const wu = waterMat.uniforms;
  wu.uTop.value.copy(_cTop); wu.uHor.value.copy(_cHor); wu.uSunCol.value.copy(_cSun); wu.uSunDir.value.copy(DAY.sunDir); wu.uNight.value = night;
  wu.uDeep.value.copy(DEEP_DAY).lerp(DEEP_NIGHT, night); wu.uShallow.value.copy(SH_DAY).lerp(SH_NIGHT, night);
  wu.fogColor.value.copy(scene.fog.color); wu.fogNear.value = scene.fog.near; wu.fogFar.value = scene.fog.far;
  bldU.uNight.value = night;
  DAY.envT += dt;
  if (DAY.envT > 2.5 && DAY.lastEnvDir.distanceTo(DAY.sunDir) > 0.01) { DAY.envT = 0; DAY.lastEnvDir.copy(DAY.sunDir); updateEnv(); }
}
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
