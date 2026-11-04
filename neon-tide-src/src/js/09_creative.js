// ============================================================
//  Creative mode: a touch-first sandbox builder on top of the city,
//  plus the «Погода» row in the pause menu (owner: creative & atmosphere)
// ============================================================
// CREATIVE.building: true in «Строить» (free-fly camera, HUD mode 'creative'), false in «Играть».
// Events: 'creativeState' {building}, 'stunt' {kind: 'ring'|'jump', score, total}, 'explosion' {x, z, car: null, source: 'barrel'}.
// GAME.timeScale (creative «Скорость игры») is a request for the main loop: dt *= GAME.timeScale.
const CREATIVE = (() => {
  const MAX_ITEMS = 320, MAX_CARS = 24, MAX_PEDS = 30, GRID = 0.5, ROT_STEP = Math.PI / 12;
  const AUTO_KEY = 'neon-tide-creative-v1', BUILDS_KEY = 'neon-tide-builds-v1';
  const S = {
    on: false, building: false, tool: 'place', kind: null, rotOff: 0, lift: 0, carry: null,
    items: [], byId: new Map(), uid: 0, undo: [], redo: [], sel: null, lock: null, hover: null,
    fly: { x: 0, y: 20, z: 0, vx: 0, vy: 0, vz: 0, up: false, down: false },
    score: 0, combo: 0, comboT: 0, playStart: null, rings: [], boosts: [], props: [], lamps: [], ents: [],
    set: { god: true, noPolice: false, hour: 13, freeze: false, weather: 'clear', traffic: 0.5, peds: 1, speed: 1 },
    ui: {}, sheet: null, saveT: -1, storeOK: true, air: null, shot: null,
  };
  const MEM = {};
  const store = {
    get(k) { try { const v = localStorage.getItem(k); return v === null ? (MEM[k] || null) : v; } catch (e) { S.storeOK = false; return MEM[k] || null; } },
    set(k, v) { MEM[k] = v; try { localStorage.setItem(k, v); } catch (e) { S.storeOK = false; } },
  };
  const r2 = (v) => Math.round(v * 100) / 100, r4 = (v) => Math.round(v * 10000) / 10000;
  const snap = (v, g) => Math.round(v / g) * g;
  const fmtH = (h) => { const hh = Math.floor(h) % 24, mm = Math.floor((h - Math.floor(h)) * 60 + 0.5) % 60; return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'); };

  // ---------- textures ----------
  const T = {};
  function tex(c, srgb) { const t = toTex(c, { srgb }); return t; }
  function makeTextures() {
    { // ramp deck: dark grip plate, hazard stripes on both edges, chevrons up the slope
      const c = mkCanvas(256, 256), g = c.getContext('2d');
      g.fillStyle = '#30333b'; g.fillRect(0, 0, 256, 256);
      for (let y = 0; y < 256; y += 16) for (let x = (y / 16) % 2 ? 8 : 0; x < 256; x += 16) { g.fillStyle = 'rgba(190,200,215,0.12)'; g.save(); g.translate(x + 4, y + 4); g.rotate(0.8); g.fillRect(-4, -1.2, 8, 2.4); g.restore(); }
      speckle(g, 256, 256, 16);
      for (const x0 of [0, 230]) {
        g.save(); g.beginPath(); g.rect(x0, 0, 26, 256); g.clip();
        g.fillStyle = '#ffc21a'; g.fillRect(x0, 0, 26, 256);
        g.fillStyle = '#16161a'; for (let y = -40; y < 300; y += 28) { g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + 26, y - 18); g.lineTo(x0 + 26, y - 4); g.lineTo(x0, y + 14); g.fill(); }
        g.restore();
      }
      g.strokeStyle = 'rgba(255,255,255,0.32)'; g.lineWidth = 12; g.lineJoin = 'round';
      for (const y of [70, 190]) { g.beginPath(); g.moveTo(84, y + 30); g.lineTo(128, y - 14); g.lineTo(172, y + 30); g.stroke(); }
      T.deck = tex(c);
    }
    { // concrete panel with grooves
      const c = mkCanvas(256, 256), g = c.getContext('2d');
      g.fillStyle = '#c9c3b8'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 40; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(60,50,40,0.06)'; wrapEllipse(g, 256, Math.random() * 256, Math.random() * 256, rr(10, 50), rr(6, 30), Math.random() * TAU); }
      speckle(g, 256, 256, 22);
      g.fillStyle = 'rgba(40,36,30,0.45)'; g.fillRect(0, 0, 256, 4); g.fillRect(0, 0, 4, 256);
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, 4, 256, 2); g.fillRect(4, 0, 2, 256);
      T.panel = tex(c);
    }
    { // platform top: asphalt pad with a yellow border and corner marks
      const c = mkCanvas(512, 512), g = c.getContext('2d');
      g.drawImage(TEX.asphalt.image, 0, 0, 512, 512);
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, 0, 512, 512);
      g.strokeStyle = '#ffc21a'; g.lineWidth = 22; g.strokeRect(11, 11, 490, 490);
      g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 6; g.setLineDash([30, 22]); g.strokeRect(60, 60, 392, 392); g.setLineDash([]);
      T.top = tex(c);
    }
    { // shipping container ribs
      const c = mkCanvas(128, 128), g = c.getContext('2d');
      for (let x = 0; x < 128; x += 16) { const gr = g.createLinearGradient(x, 0, x + 16, 0); gr.addColorStop(0, '#9a9a9a'); gr.addColorStop(0.35, '#ffffff'); gr.addColorStop(0.7, '#d8d8d8'); gr.addColorStop(1, '#8c8c8c'); g.fillStyle = gr; g.fillRect(x, 0, 16, 128); }
      speckle(g, 128, 128, 14);
      T.ribs = tex(c);
    }
    { // painted wall: pastel concrete with a neon band and abstract shapes (original)
      const c = mkCanvas(256, 256), g = c.getContext('2d');
      g.fillStyle = '#e9e1d4'; g.fillRect(0, 0, 256, 256);
      speckle(g, 256, 256, 18);
      const cols = ['#ff3f8e', '#3fe5ef', '#ffd23f', '#8f45ff', '#ff8a3d'];
      for (let i = 0; i < 7; i++) { g.fillStyle = cols[i % cols.length]; g.globalAlpha = 0.75; g.beginPath(); g.arc(rr(20, 236), rr(60, 200), rr(12, 34), 0, TAU); g.fill(); }
      g.globalAlpha = 1; g.lineWidth = 9; g.lineCap = 'round';
      for (let i = 0; i < 4; i++) { g.strokeStyle = cols[(i + 2) % cols.length]; g.beginPath(); g.moveTo(rr(10, 120), rr(70, 190)); g.bezierCurveTo(rr(60, 200), rr(40, 220), rr(60, 200), rr(40, 220), rr(140, 246), rr(70, 190)); g.stroke(); }
      g.fillStyle = '#2b2440'; g.fillRect(0, 222, 256, 34); g.fillStyle = '#ff3f8e'; g.fillRect(0, 216, 256, 6);
      T.wall = tex(c);
    }
    { // jersey barrier: red / white blocks
      const c = mkCanvas(128, 32), g = c.getContext('2d');
      g.fillStyle = '#f2efe9'; g.fillRect(0, 0, 128, 32); g.fillStyle = '#d7263d'; g.fillRect(0, 0, 64, 32);
      speckle(g, 128, 32, 18); T.barrier = tex(c);
    }
    { // traffic cone bands (v runs bottom → top)
      const c = mkCanvas(32, 64), g = c.getContext('2d');
      g.fillStyle = '#ff6a1a'; g.fillRect(0, 0, 32, 64); g.fillStyle = '#f4f4f4'; g.fillRect(0, 16, 32, 9); g.fillRect(0, 34, 32, 7);
      T.cone = tex(c);
    }
    { // explosive barrel
      const c = mkCanvas(256, 128), g = c.getContext('2d');
      g.fillStyle = '#c3202b'; g.fillRect(0, 0, 256, 128);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 18, 256, 6); g.fillRect(0, 104, 256, 6);
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, 24, 256, 3); g.fillRect(0, 110, 256, 3);
      for (const x of [64, 192]) {
        g.save(); g.translate(x, 64); g.rotate(Math.PI / 4); g.fillStyle = '#ffd23f'; g.fillRect(-24, -24, 48, 48); g.strokeStyle = '#111'; g.lineWidth = 3; g.strokeRect(-20, -20, 40, 40); g.restore();
        g.fillStyle = '#111'; g.beginPath(); g.moveTo(x, 44); g.quadraticCurveTo(x + 14, 62, x + 8, 80); g.lineTo(x - 8, 80); g.quadraticCurveTo(x - 14, 64, x - 2, 56); g.quadraticCurveTo(x - 2, 66, x + 2, 68); g.quadraticCurveTo(x + 4, 56, x, 44); g.fill();
      }
      speckle(g, 256, 128, 14);
      T.barrel = tex(c);
    }
    { // wooden crate
      const c = mkCanvas(128, 128), g = c.getContext('2d');
      for (let i = 0; i < 6; i++) { const v = rr(-12, 12) | 0; g.fillStyle = `rgb(${176 + v},${128 + v},${74 + v})`; g.fillRect(0, i * 22, 128, 22); g.fillStyle = 'rgba(60,34,14,0.5)'; g.fillRect(0, i * 22, 128, 2); }
      g.fillStyle = '#7a4f28'; g.fillRect(0, 0, 128, 14); g.fillRect(0, 114, 128, 14); g.fillRect(0, 0, 14, 128); g.fillRect(114, 0, 14, 128);
      g.save(); g.translate(64, 64); g.rotate(-Math.PI / 4); g.fillRect(-80, -7, 160, 14); g.restore();
      speckle(g, 128, 128, 18); T.crate = tex(c);
    }
    { // boost pad chevrons (pointing toward +v)
      const c = mkCanvas(128, 128), g = c.getContext('2d');
      g.fillStyle = '#121026'; g.fillRect(0, 0, 128, 128);
      g.lineWidth = 16; g.lineJoin = 'miter'; g.lineCap = 'butt';
      const gr = g.createLinearGradient(0, 0, 128, 0); gr.addColorStop(0, '#3fe5ef'); gr.addColorStop(0.5, '#ffffff'); gr.addColorStop(1, '#ff3f8e');
      g.strokeStyle = gr;
      for (const y of [44, 108]) { g.beginPath(); g.moveTo(18, y + 8); g.lineTo(64, y - 30); g.lineTo(110, y + 8); g.stroke(); }
      g.fillStyle = '#3fe5ef'; g.fillRect(0, 0, 6, 128); g.fillStyle = '#ff3f8e'; g.fillRect(122, 0, 6, 128);
      T.boost = tex(c);
    }
  }

  // ---------- geometry helpers ----------
  function merge(list) {
    let total = 0; const gs = list.map((g0) => { const g = g0.index ? g0.toNonIndexed() : g0; total += g.attributes.position.count; return g; });
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
    let o = 0;
    for (const g of gs) { pos.set(g.attributes.position.array, o * 3); if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3); if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; }
    const m = new THREE.BufferGeometry();
    m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); m.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    m.computeBoundingSphere(); return m;
  }
  // tile UVs by world size s (local coordinates); keepTop leaves the +y face at 0..1 (one texture over the top)
  function tileUV(g, s, keepTop) {
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const nx = Math.abs(n.getX(i)), ny = n.getY(i);
      if (ny > 0.5 && keepTop) continue;
      if (Math.abs(ny) > 0.5) uv.setXY(i, p.getX(i) / s, p.getZ(i) / s);
      else if (nx > 0.5) uv.setXY(i, p.getZ(i) / s, p.getY(i) / s);
      else uv.setXY(i, p.getX(i) / s, p.getY(i) / s);
    }
    uv.needsUpdate = true; return g;
  }
  function boxB(w, h, l) { const g = new THREE.BoxGeometry(w, h, l); g.translate(0, h / 2, 0); return g; }
  function fromTris(P, U) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(U), 2));
    g.computeVertexNormals(); g.computeBoundingSphere(); return g;
  }
  function tri(P, U, a, b, c, ua, ub, uc, out) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * out[0] + ny * out[1] + nz * out[2] < 0) { const t = b; b = c; c = t; const tu = ub; ub = uc; uc = tu; }
    P.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); U.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
  }
  // wedge rising along +z from 0 to H (prof > 0: curved kicker h = H * t^prof)
  function rampGeos(W, L, H, prof) {
    const n = prof ? 10 : 1, hw = W / 2, hl = L / 2, zs = [], ys = [];
    for (let i = 0; i <= n; i++) { const t = i / n; zs.push(-hl + L * t); ys.push(H * (prof ? Math.pow(t, prof) : t)); }
    const dP = [], dU = [], bP = [], bU = [];
    let v = 0;
    for (let i = 0; i < n; i++) {
      const z0 = zs[i], z1 = zs[i + 1], y0 = ys[i], y1 = ys[i + 1], sl = Math.hypot(z1 - z0, y1 - y0);
      const up = [0, z1 - z0, -(y1 - y0)];
      tri(dP, dU, [-hw, y0, z0], [hw, y0, z0], [hw, y1, z1], [0, v / 2], [1, v / 2], [1, (v + sl) / 2], up);
      tri(dP, dU, [-hw, y0, z0], [hw, y1, z1], [-hw, y1, z1], [0, v / 2], [1, (v + sl) / 2], [0, (v + sl) / 2], up);
      v += sl;
      for (const sx of [-1, 1]) {
        const x = sx * hw, o = [sx, 0, 0];
        tri(bP, bU, [x, 0, z0], [x, 0, z1], [x, y1, z1], [z0 / 2, 0], [z1 / 2, 0], [z1 / 2, y1 / 2], o);
        tri(bP, bU, [x, 0, z0], [x, y1, z1], [x, y0, z0], [z0 / 2, 0], [z1 / 2, y1 / 2], [z0 / 2, y0 / 2], o);
      }
    }
    const o = [0, 0, 1];
    tri(bP, bU, [-hw, 0, hl], [hw, 0, hl], [hw, H, hl], [-hw / 2, 0], [hw / 2, 0], [hw / 2, H / 2], o);
    tri(bP, bU, [-hw, 0, hl], [hw, H, hl], [-hw, H, hl], [-hw / 2, 0], [hw / 2, H / 2], [-hw / 2, H / 2], o);
    return { deck: fromTris(dP, dU), body: fromTris(bP, bU) };
  }
  function jerseyGeo(W, L, H) {
    const s = new THREE.Shape(), hl = L / 2;
    s.moveTo(-hl, 0); s.lineTo(hl, 0); s.lineTo(hl * 0.84, H * 0.28); s.lineTo(hl * 0.36, H); s.lineTo(-hl * 0.36, H); s.lineTo(-hl * 0.84, H * 0.28); s.lineTo(-hl, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: W, bevelEnabled: false });
    g.rotateY(Math.PI / 2); g.translate(-W / 2, 0, 0);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + W / 2) / 1.5, p.getY(i) / H);
    g.computeVertexNormals(); return g;
  }
  function palmGeos() {
    const trunk = new THREE.CylinderGeometry(0.17, 0.27, 8, 8, 10, false); trunk.translate(0, 4, 0);
    { const p = trunk.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i) / 8; p.setX(i, p.getX(i) + y * y * 1.3); } trunk.computeVertexNormals(); }
    const top = new THREE.SphereGeometry(0.42, 8, 6); top.translate(1.3, 7.9, 0);
    const fr = [];
    for (let k = 0; k < 9; k++) {
      const g = new THREE.PlaneGeometry(4.4, 1.15, 8, 1), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i) + 2.2, y = p.getY(i), t = x / 4.4; p.setXYZ(i, x, -t * t * 1.9 + Math.abs(y) * 0.28, y); }
      g.computeVertexNormals(); g.rotateZ(rr(0.05, 0.35)); g.rotateY(k / 9 * TAU + rr(-0.15, 0.15)); g.translate(1.3, 8.05, 0);
      fr.push(g);
    }
    return { trunk: merge([trunk, top]), fronds: merge(fr) };
  }

  // ---------- instanced pools (one draw call per part type, swap-remove) ----------
  const _white = new THREE.Color(1, 1, 1);
  class Pool {
    constructor(geo, mat, o) { this.geo = geo; this.mat = mat; this.o = o || {}; this.n = 0; this.cap = 0; this.own = []; this.mesh = null; this.grow(8); }
    grow(cap) {
      const m = new THREE.InstancedMesh(this.geo, this.mat, cap), o = this.o;
      m.frustumCulled = false; m.castShadow = !!o.cast; m.receiveShadow = !!o.recv; if (o.order) m.renderOrder = o.order;
      if (o.depth) m.customDepthMaterial = o.depth;
      if (o.color) for (let i = 0; i < cap; i++) m.setColorAt(i, _white);
      if (this.mesh) {
        m.instanceMatrix.array.set(this.mesh.instanceMatrix.array);
        if (o.color) m.instanceColor.array.set(this.mesh.instanceColor.array);
        scene.remove(this.mesh); this.mesh.dispose();
      }
      m.count = this.n; m.visible = this.n > 0; this.mesh = m; this.cap = cap; scene.add(m);
    }
    add(part) { if (this.n >= this.cap) this.grow(this.cap * 2); part.i = this.n; this.own[this.n++] = part; this.mesh.count = this.n; this.mesh.visible = true; return part.i; }
    set(i, m4) { this.mesh.setMatrixAt(i, m4); this.mesh.instanceMatrix.needsUpdate = true; }
    color(i, c) { if (!this.o.color) return; this.mesh.setColorAt(i, c); this.mesh.instanceColor.needsUpdate = true; }
    remove(part) {
      const i = part.i, last = --this.n;
      if (i !== last) {
        const a = this.mesh.instanceMatrix.array; for (let k = 0; k < 16; k++) a[i * 16 + k] = a[last * 16 + k];
        if (this.o.color) { const c = this.mesh.instanceColor.array; for (let k = 0; k < 3; k++) c[i * 3 + k] = c[last * 3 + k]; this.mesh.instanceColor.needsUpdate = true; }
        const o = this.own[last]; this.own[i] = o; o.i = i;
      }
      this.own.length = this.n; this.mesh.count = this.n; this.mesh.visible = this.n > 0; this.mesh.instanceMatrix.needsUpdate = true; part.i = -1;
    }
  }
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p = new V3(), _s = new V3(), _ax = new V3();
  function itemMatrix(it, ox, oy, oz, sx, sy, sz) {
    _p.set(it.x + ox * it.c + oz * it.sn, it.y + oy, it.z - ox * it.sn + oz * it.c);
    _q.setFromAxisAngle(UP, it.r); _s.set(sx, sy, sz);
    return _m4.compose(_p, _q, _s);
  }

  // ---------- kinds (palette) ----------
  const CATS = [['ramps', 'Рампы'], ['blocks', 'Блоки'], ['obst', 'Препятствия'], ['stunt', 'Трюки'], ['cars', 'Машины'], ['people', 'Люди'], ['decor', 'Декор']];
  const KINDS = [
    { id: 'ramp_s', cat: 'ramps', name: 'Рампа 15°', t: 'ramp', W: 4, L: 8, H: 2, prof: 0, drive: true },
    { id: 'ramp_m', cat: 'ramps', name: 'Рампа 25°', t: 'ramp', W: 4, L: 8, H: 3.5, prof: 0, drive: true },
    { id: 'ramp_l', cat: 'ramps', name: 'Крутая рампа', t: 'ramp', W: 4, L: 5, H: 3.5, prof: 0, drive: true },
    { id: 'ramp_w', cat: 'ramps', name: 'Широкая рампа', t: 'ramp', W: 8, L: 8, H: 2, prof: 0, drive: true },
    { id: 'ramp_long', cat: 'ramps', name: 'Длинный въезд', t: 'ramp', W: 6, L: 16, H: 3.5, prof: 0, drive: true },
    { id: 'kicker', cat: 'ramps', name: 'Трамплин', t: 'ramp', W: 4, L: 5, H: 2, prof: 1.7, drive: true },
    { id: 'plat_lo', cat: 'blocks', name: 'Платформа 2 м', t: 'block', W: 8, L: 8, H: 2, top: true, drive: true },
    { id: 'plat_hi', cat: 'blocks', name: 'Платформа 3,5 м', t: 'block', W: 8, L: 8, H: 3.5, top: true, drive: true },
    { id: 'block', cat: 'blocks', name: 'Бетонный куб', t: 'block', W: 2, L: 2, H: 2, drive: true },
    { id: 'container', cat: 'blocks', name: 'Контейнер', t: 'block', W: 2.5, L: 6, H: 2.6, look: 'ribs' },
    { id: 'wall', cat: 'blocks', name: 'Стена', t: 'block', W: 6, L: 0.5, H: 3, look: 'wall' },
    { id: 'barrier', cat: 'obst', name: 'Отбойник', t: 'block', W: 3, L: 0.6, H: 0.9, look: 'jersey' },
    { id: 'cone', cat: 'obst', name: 'Конус', t: 'prop', rad: 0.24, hh: 0.35, lie: 0.2, tip: 2.5, mass: 0.98 },
    { id: 'crate', cat: 'obst', name: 'Ящик', t: 'prop', rad: 0.5, hh: 0.5, lie: 0.5, tip: 99, mass: 0.9 },
    { id: 'barrel', cat: 'obst', name: 'Взрывная бочка', t: 'prop', rad: 0.38, hh: 0.5, lie: 0.38, tip: 4, mass: 0.93, boom: true },
    { id: 'ring', cat: 'stunt', name: 'Трюковое кольцо', t: 'ring', R: 3.6 },
    { id: 'boost', cat: 'stunt', name: 'Ускоритель', t: 'boost', W: 3, L: 5 },
    { id: 'car_sedan', cat: 'cars', name: 'Седан', t: 'car', car: 'sedan' },
    { id: 'car_coupe', cat: 'cars', name: 'Купе', t: 'car', car: 'coupe' },
    { id: 'car_suv', cat: 'cars', name: 'Внедорожник', t: 'car', car: 'suv' },
    { id: 'car_muscle', cat: 'cars', name: 'Маслкар', t: 'car', car: 'muscle' },
    { id: 'car_taxi', cat: 'cars', name: 'Такси', t: 'car', car: 'taxi' },
    { id: 'car_police', cat: 'cars', name: 'Полиция', t: 'car', car: 'police' },
    { id: 'ped', cat: 'people', name: 'Прохожий', t: 'ped' },
    { id: 'cop', cat: 'people', name: 'Полицейский', t: 'ped', cop: true },
    { id: 'palm', cat: 'decor', name: 'Пальма', t: 'palm' },
    { id: 'lamp', cat: 'decor', name: 'Фонарь', t: 'lamp' },
  ];
  const KIND = {}; KINDS.forEach((k) => { KIND[k.id] = k; });
  const RING_COLS = ['#ff3f8e', '#3fe5ef', '#ffd23f', '#8dff7a'];
  const CONT_COLS = ['#e4572e', '#2a9d8f', '#3a86ff', '#ffbe0b', '#8338ec', '#f4f1ea', '#d7263d', '#1b998b'];
  const WALL_COLS = ['#ffffff', '#ffe3ef', '#e0fbff', '#fff4d0'];

  // footprint half sizes and height of a kind (for ghosts, selection, magnet, traffic blocking)
  function dims(k) {
    if (k.t === 'ramp' || k.t === 'block') return [k.W / 2, k.H, k.L / 2];
    if (k.t === 'ring') return [k.R + 0.35, k.R * 2 + 1.2, 0.4];
    if (k.t === 'boost') return [k.W / 2, 0.1, k.L / 2];
    if (k.t === 'prop') return [k.rad, k.hh * 2, k.rad];
    if (k.t === 'car') { const C = CAR_TYPES[k.car]; return [C.W / 2, C.H + C.cabH, C.L / 2]; }
    if (k.t === 'ped') return [0.35, 1.85, 0.35];
    if (k.t === 'palm') return [0.5, 9, 0.5];
    if (k.t === 'lamp') return [0.3, 8, 0.3];
    return [1, 1, 1];
  }

  // ---------- materials & part pools (created at boot) ----------
  const M = {};
  function makeAssets() {
    makeTextures();
    M.deck = new THREE.MeshStandardMaterial({ map: T.deck, roughness: 0.62, metalness: 0.25 });
    M.body = new THREE.MeshStandardMaterial({ map: T.panel, color: 0xff7a45, roughness: 0.72 });
    M.side = new THREE.MeshStandardMaterial({ map: T.panel, color: 0xd9d3c8, roughness: 0.86 });
    M.top = new THREE.MeshStandardMaterial({ map: T.top, roughness: 0.8 });
    M.ribs = new THREE.MeshStandardMaterial({ map: T.ribs, roughness: 0.5, metalness: 0.35 });
    M.wall = new THREE.MeshStandardMaterial({ map: T.wall, roughness: 0.8 });
    M.barrier = new THREE.MeshStandardMaterial({ map: T.barrier, roughness: 0.7 });
    M.cone = new THREE.MeshStandardMaterial({ map: T.cone, roughness: 0.55 });
    M.barrel = new THREE.MeshStandardMaterial({ map: T.barrel, roughness: 0.45, metalness: 0.3 });
    M.crate = new THREE.MeshStandardMaterial({ map: T.crate, roughness: 0.85 });
    M.ring = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    M.pole = (typeof MATS !== 'undefined' && MATS.metal) || new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: 0.45, metalness: 0.7 });
    M.boost = new THREE.MeshBasicMaterial({ map: T.boost, toneMapped: false, transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    M.bark = new THREE.MeshStandardMaterial({ map: TEX.bark, roughness: 0.9 });
    M.frond = (typeof frondMat !== 'undefined' && frondMat) || new THREE.MeshStandardMaterial({ map: TEX.frond, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.75 });
    M.lampHead = (typeof MATS !== 'undefined' && MATS.lampHead) || new THREE.MeshStandardMaterial({ color: 0x222222, emissive: new THREE.Color('#ffd7a0'), emissiveIntensity: 1 });
    M.pool = (typeof MATS !== 'undefined' && MATS.pool) || null;
    M.ghost = new THREE.MeshBasicMaterial({ color: 0x3fe5ef, transparent: true, opacity: 0.32, depthWrite: false });
    M.ghostEdge = new THREE.LineBasicMaterial({ color: 0x9ff6ff, transparent: true, opacity: 0.9, depthWrite: false });
    const fill = new Pool(boxB(1, 1, 1), M.side, { cast: true, recv: true });
    const blockMats = (top) => [M.side, M.side, top ? M.top : M.side, M.side, M.side, M.side];
    for (const k of KINDS) {
      k.dims = dims(k);
      if (k.t === 'ramp') {
        const g = rampGeos(k.W, k.L, k.H, k.prof);
        k.geos = [g.deck, g.body];
        k.parts = [new Pool(g.deck, M.deck, { recv: true, cast: true }), new Pool(g.body, M.body, { cast: true, recv: true }), fill];
      } else if (k.t === 'block') {
        let g, mat, o = { cast: true, recv: true };
        if (k.look === 'jersey') { g = jerseyGeo(k.W, k.L, k.H); mat = M.barrier; }
        else if (k.look === 'ribs') { g = tileUV(boxB(k.W, k.H, k.L), 2.6); mat = M.ribs; o.color = true; }
        else if (k.look === 'wall') { g = tileUV(boxB(k.W, k.H, k.L), 3); mat = M.wall; o.color = true; }
        else { g = tileUV(boxB(k.W, k.H, k.L), 2, !!k.top); mat = blockMats(k.top); }
        k.geos = [g];
        k.parts = [new Pool(g, mat, o), fill];
      } else if (k.t === 'prop') {
        let g, mat;
        if (k.id === 'cone') {
          const c = new THREE.ConeGeometry(0.24, 0.66, 14, 1, true); c.translate(0, 0.02, 0);
          const b = new THREE.BoxGeometry(0.5, 0.05, 0.5); b.translate(0, -0.325, 0);
          const bu = b.attributes.uv; for (let i = 0; i < bu.count; i++) bu.setXY(i, 0.5, 0.05);
          g = merge([c, b]); mat = M.cone;
        } else if (k.id === 'barrel') { g = new THREE.CylinderGeometry(0.38, 0.38, 1.0, 18); mat = M.barrel; }
        else { g = new THREE.BoxGeometry(1, 1, 1); mat = M.crate; }
        k.geos = [g];
        k.parts = [new Pool(g, mat, { cast: true, recv: true })];
      } else if (k.t === 'ring') {
        const g = new THREE.TorusGeometry(k.R, 0.3, 10, 56); const pole = new THREE.CylinderGeometry(0.11, 0.13, 1, 8); pole.translate(0, 0.5, 0);
        k.geos = [g];
        k.parts = [new Pool(g, M.ring, { color: true }), new Pool(pole, M.pole, { cast: true })];
      } else if (k.t === 'boost') {
        const g = new THREE.PlaneGeometry(k.W, k.L); g.rotateX(-Math.PI / 2);
        const p = g.attributes.position, uv = g.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + k.W / 2) / k.W, (p.getZ(i) + k.L / 2) / k.L * 2);
        k.geos = [g];
        k.parts = [new Pool(g, M.boost, { order: 2 })];
      } else if (k.t === 'palm') {
        const g = palmGeos();
        k.geos = [g.trunk, g.fronds];
        k.parts = [new Pool(g.trunk, M.bark, { cast: true, recv: true }), new Pool(g.fronds, M.frond, { cast: true, depth: new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: TEX.frond, alphaTest: 0.5 }) })];
      } else if (k.t === 'lamp') {
        const pole = new THREE.CylinderGeometry(0.08, 0.13, 8, 6); pole.translate(0, 4, 0);
        const arm = new THREE.BoxGeometry(0.1, 0.1, 2.1); arm.translate(0, 7.8, 1.0);
        const head = new THREE.BoxGeometry(0.42, 0.16, 0.9); head.translate(0, 7.7, 2.0);
        const pg = merge([pole, arm]);
        k.geos = [pg, head];
        k.parts = [new Pool(pg, M.pole, { cast: true }), new Pool(head, M.lampHead, {})];
        if (M.pool) { const pl = new THREE.PlaneGeometry(13, 13); pl.rotateX(-Math.PI / 2); k.parts.push(new Pool(pl, M.pool, { order: 2 })); M.lampPool = k.parts[2]; }
      } else k.parts = [];
    }
    M.fill = fill;
  }
  // part layout of an item: [partIndex, ox, oy, oz, sx, sy, sz] in the item's local frame
  const LAY = new Float32Array(7 * 6);
  function layout(it) {
    const k = it.k, L = LAY; let n = 0;
    const put = (pi, ox, oy, oz, sx, sy, sz) => { const o = n * 7; L[o] = pi; L[o + 1] = ox; L[o + 2] = oy; L[o + 3] = oz; L[o + 4] = sx; L[o + 5] = sy; L[o + 6] = sz; n++; };
    const fillH = it.y - it.base;
    if (k.t === 'ramp') { put(0, 0, 0, 0, 1, 1, 1); put(1, 0, 0, 0, 1, 1, 1); if (fillH > 0.05) put(2, 0, -fillH, 0, k.W, fillH, k.L); }
    else if (k.t === 'block') { put(0, 0, 0, 0, 1, 1, 1); if (fillH > 0.05) put(1, 0, -fillH, 0, k.W * 0.98, fillH, k.L * 0.98); }
    else if (k.t === 'ring') { const cy = k.R + 0.9; put(0, 0, cy, 0, 1, 1, 1); put(1, -k.R - 0.25, -fillH, 0, 1, cy + fillH, 1); put(1, k.R + 0.25, -fillH, 0, 1, cy + fillH, 1); }
    else if (k.t === 'boost') put(0, 0, 0.035, 0, 1, 1, 1);
    else if (k.t === 'palm') { const s = it.sc || 1; put(0, 0, 0, 0, s, s, s); put(1, 0, 0, 0, s, s, s); }
    else if (k.t === 'prop') put(0, 0, k.hh, 0, 1, 1, 1);
    else if (k.t === 'lamp') { put(0, 0, 0, 0, 1, 1, 1); put(1, 0, 0, 0, 1, 1, 1); if (k.parts[2]) put(2, 0, 0.04, 3.2, 1, 1, 1); }
    return n;
  }

  // ---------- spatial grid of placed static things: surfaces (GROUND_HOOKS) and traffic blockers ----------
  const SG = { map: new Map(), surf: 0 };
  const sgKey = (ix, iz) => (ix + 512) * 1024 + (iz + 512);
  function sgAdd(e) {
    const ex = Math.abs(e.c) * e.hw + Math.abs(e.s) * e.hl, ez = Math.abs(e.s) * e.hw + Math.abs(e.c) * e.hl;
    e.cells = [];
    for (let ix = Math.floor((e.x - ex) / 8); ix <= Math.floor((e.x + ex) / 8); ix++) {
      for (let iz = Math.floor((e.z - ez) / 8); iz <= Math.floor((e.z + ez) / 8); iz++) {
        const key = sgKey(ix, iz); let l = SG.map.get(key); if (!l) { l = []; SG.map.set(key, l); }
        l.push(e); e.cells.push(l);
      }
    }
    if (e.surf) SG.surf++;
  }
  function sgRemove(e) { for (const l of e.cells) { const i = l.indexOf(e); if (i >= 0) l.splice(i, 1); } e.cells = []; if (e.surf) SG.surf--; }
  function surfH(e, lz) { if (!e.ramp) return e.H; const t = (lz + e.hl) / (2 * e.hl); return e.H * (e.prof ? Math.pow(t, e.prof) : t); }
  function creativeGround(x, z) {
    if (SG.surf === 0) return -Infinity;
    const l = SG.map.get(sgKey(Math.floor(x / 8), Math.floor(z / 8)));
    if (!l) return -Infinity;
    let best = -Infinity;
    for (let i = 0; i < l.length; i++) {
      const e = l[i]; if (!e.surf) continue;
      const dx = x - e.x, dz = z - e.z, lx = dx * e.c - dz * e.s, lz = dx * e.s + dz * e.c;
      if (lx < -e.hw || lx > e.hw || lz < -e.hl || lz > e.hl) continue;
      const h = e.y + surfH(e, lz);
      if (h > best) best = h;
    }
    return best;
  }
  // is (x, z) inside a static item footprint grown by pad? (traffic blocking)
  function blockedAt(x, z, pad) {
    const l = SG.map.get(sgKey(Math.floor(x / 8), Math.floor(z / 8)));
    if (!l) return null;
    for (let i = 0; i < l.length; i++) {
      const e = l[i]; if (e.noBlock) continue;
      const dx = x - e.x, dz = z - e.z, lx = dx * e.c - dz * e.s, lz = dx * e.s + dz * e.c;
      if (lx > -e.hw - pad && lx < e.hw + pad && lz > -e.hl - pad && lz < e.hl + pad) return e;
    }
    return null;
  }

  // ---------- step solver for driveable pieces ----------
  // A circle (x, z, r) whose centre is outside a ramp / platform / cube collides with its footprint edge only when the
  // edge is higher than STEP above both the body (y) and the ground under the circle's centre (another piece or road).
  // So cars drive up the low end of a ramp and from a ramp onto a platform of the same height, but hit the sides,
  // the tall end of a ramp and platform walls. out: {x, z, nx, nz, hit, pen}
  const STEP = 0.6, SOL = { x: 0, z: 0, nx: 0, nz: 0, hit: false, pen: 0 };
  let solStamp = 0;
  function solveCircle(x, z, r, y) {
    const o = SOL; o.hit = false; o.nx = 0; o.nz = 0; o.pen = 0;
    if (SG.surf > 0) {
      solStamp++;
      const ix0 = Math.floor((x - r) / 8), ix1 = Math.floor((x + r) / 8), iz0 = Math.floor((z - r) / 8), iz1 = Math.floor((z + r) / 8);
      for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
        const l = SG.map.get(sgKey(ix, iz)); if (!l) continue;
        for (let i = 0; i < l.length; i++) {
          const e = l[i]; if (!e.drive || e.st === solStamp) continue;
          e.st = solStamp;
          const dx = x - e.x, dz = z - e.z, lx = dx * e.c - dz * e.s, lz = dx * e.s + dz * e.c;
          if (lx < -e.hw - r || lx > e.hw + r || lz < -e.hl - r || lz > e.hl + r) continue;
          if (lx > -e.hw && lx < e.hw && lz > -e.hl && lz < e.hl) continue; // already standing on it
          const qx = clamp(lx, -e.hw, e.hw), qz = clamp(lz, -e.hl, e.hl), ddx = lx - qx, ddz = lz - qz, d2 = ddx * ddx + ddz * ddz;
          if (d2 >= r * r) continue;
          const edge = e.y + surfH(e, qz), base = Math.max(y, groundH(x, z));
          if (edge <= base + STEP) continue;
          const d = Math.sqrt(d2) || 1e-4, nlx = ddx / d, nlz = ddz / d, pen = r - d;
          const nx = nlx * e.c + nlz * e.s, nz = -nlx * e.s + nlz * e.c;
          x += nx * pen; z += nz * pen; o.nx += nx; o.nz += nz; o.hit = true; if (pen > o.pen) o.pen = pen;
        }
      }
    }
    o.x = x; o.z = z;
    if (o.hit) { const l = Math.hypot(o.nx, o.nz) || 1; o.nx /= l; o.nz /= l; }
    return o;
  }
  function solveBodies() {
    if (!SG.surf) return;
    for (const c of cars) {
      if (c.kinematic || c.exploded) continue;
      const r = carCircles(c, CA);
      let px = 0, pz = 0, hit = false, nx = 0, nz = 0, ix = 0, iz = 0;
      for (let i = 0; i < 3; i++) {
        const cx = CA[i * 2] + px, cz = CA[i * 2 + 1] + pz, s = solveCircle(cx, cz, r, c.y);
        if (!s.hit) continue;
        px += s.x - cx; pz += s.z - cz; nx += s.nx; nz += s.nz; hit = true; ix = cx; iz = cz;
      }
      if (!hit) continue;
      c.x += px; c.z += pz;
      const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
      const vn = c.vx * nx + c.vz * nz;
      if (vn < 0) { c.vx -= 1.3 * vn * nx; c.vz -= 1.3 * vn * nz; c.vx *= 0.985; c.vz *= 0.985; if (-vn > 2.5) c.onImpact(-vn, ix - nx * r, iz - nz * r, null); }
    }
    const P = player;
    if (P.mode === 'foot' && !P.dead) {
      const s = solveCircle(P.x, P.z, 0.35, P.y);
      if (s.hit) { P.x = s.x; P.z = s.z; const vn = P.vx * s.nx + P.vz * s.nz; if (vn < 0) { P.vx -= vn * s.nx; P.vz -= vn * s.nz; } P.root.position.x = P.x; P.root.position.z = P.z; }
    }
  }

  // ---------- colliders ----------
  function chain(it, lx0, lz0, lx1, lz1, r, h) {
    const len = Math.hypot(lx1 - lx0, lz1 - lz0), n = Math.max(1, Math.ceil(len / (r * 1.4)));
    for (let i = 0; i <= n; i++) {
      const t = i / n, lx = lerp(lx0, lx1, t), lz = lerp(lz0, lz1, t);
      it.cols.push(addCircleCollider(it.x + lx * it.c + lz * it.sn, it.z - lx * it.sn + lz * it.c, r, h, 'cr'));
    }
  }
  // Driveable pieces (ramps, platforms, cubes) use the step solver below instead of grid colliders: a grid collider only
  // has a top height compared with the body's centre, which would stop a car that is still climbing the ramp.
  function makeColliders(it) {
    const k = it.k;
    if (k.drive) return;
    if (k.t === 'block') {
      const hw = k.W / 2, hl = k.L / 2, top = it.y + k.H;
      if (Math.abs(it.sn * it.c) < 1e-3) {
        const ex = Math.abs(it.c) * hw + Math.abs(it.sn) * hl, ez = Math.abs(it.sn) * hw + Math.abs(it.c) * hl;
        it.cols.push(addBoxCollider(it.x - ex, it.x + ex, it.z - ez, it.z + ez, top, 'cr'));
      } else {
        const r = Math.min(0.5, Math.min(hw, hl)), a = hw - r * 0.6, b = hl - r * 0.6;
        chain(it, -a, -b, a, -b, r, top); chain(it, a, -b, a, b, r, top); chain(it, a, b, -a, b, r, top); chain(it, -a, b, -a, -b, r, top);
      }
    } else if (k.t === 'ring') {
      for (const sx of [-1, 1]) it.cols.push(addCircleCollider(it.x + sx * (k.R + 0.25) * it.c, it.z - sx * (k.R + 0.25) * it.sn, 0.22, it.y + k.R * 2 + 2, 'cr'));
    } else if (k.t === 'palm') it.cols.push(addCircleCollider(it.x, it.z, 0.32 * (it.sc || 1), it.y + 8, 'cr'));
    else if (k.t === 'lamp') it.cols.push(addCircleCollider(it.x, it.z, 0.2, it.y + 8, 'cr'));
  }

  // ---------- items ----------
  function serialize(it) {
    const d = { id: it.id, k: it.k.id, x: r2(it.x), z: r2(it.z), r: r4(it.r), l: r2(it.lift), b: r2(it.base) };
    if (it.color) d.c = it.color; if (it.sc) d.s = r2(it.sc); if (it.look) d.look = it.look;
    return d;
  }
  function addItem(d) {
    const k = KIND[d.k]; if (!k) return null;
    const it = { id: d.id || ++S.uid, k, x: d.x, z: d.z, r: d.r || 0, lift: d.l || 0, color: d.c, sc: k.t === 'palm' ? (d.s || r2(rr(0.85, 1.15))) : 0, look: d.look, parts: [], cols: [], blk: null, ent: null };
    S.uid = Math.max(S.uid, it.id);
    it.base = typeof d.b === 'number' ? d.b : groundH(it.x, it.z);
    it.y = it.base + it.lift;
    it.c = Math.cos(it.r); it.sn = Math.sin(it.r);
    if (k.t === 'ring' && !it.color) it.color = RING_COLS[Math.floor(Math.random() * RING_COLS.length)];
    if (k.look === 'ribs' && !it.color) it.color = CONT_COLS[Math.floor(Math.random() * CONT_COLS.length)];
    if (k.look === 'wall' && !it.color) it.color = WALL_COLS[Math.floor(Math.random() * WALL_COLS.length)];
    if (k.t === 'car' && !it.color && !CAR_TYPES[k.car].taxi && !CAR_TYPES[k.car].police) it.color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
    if (k.t === 'ped' && !it.look) it.look = k.cop ? null : randomLook();
    // static footprint (surface for ramps/blocks, blocker for everything static)
    if (k.t !== 'prop' && k.t !== 'car' && k.t !== 'ped') {
      const dm = k.dims;
      it.blk = { it, x: it.x, z: it.z, c: it.c, s: it.sn, hw: dm[0], hl: dm[2], y: it.y, H: k.H || 0, ramp: k.t === 'ramp', prof: k.prof || 0, surf: k.t === 'ramp' || k.t === 'block', noBlock: k.t === 'boost', drive: !!k.drive, st: 0, cells: [] };
      sgAdd(it.blk);
    }
    // instanced parts
    const n = layout(it);
    for (let i = 0; i < n; i++) { const pool = k.parts[LAY[i * 7]]; const part = { pool, li: i }; pool.add(part); it.parts.push(part); }
    writeParts(it);
    if (k.t === 'ring' || (k.look && it.color)) { _col.set(it.color); for (const p of it.parts) if (p.pool.o.color) p.pool.color(p.i, _col); }
    makeColliders(it);
    if (k.t === 'prop') { it.p = { x: it.x, y: it.y + k.hh, z: it.z, vx: 0, vy: 0, vz: 0, ry: it.r, tl: 0, ta: 0, wy: 0, awake: false, gone: false, fuse: -1, rest: 0 }; S.props.push(it); writeProp(it); }
    if (k.t === 'ring') { it.ringT = 0; it.passT = -9; S.rings.push(it); }
    if (k.t === 'boost') S.boosts.push(it);
    if (k.t === 'lamp') { it.foot = [it.x + 2 * it.sn, it.z + 2 * it.c]; S.lamps.push(it); REFL.extra.push(it.foot); }
    if (k.t === 'car' || k.t === 'ped') { spawnEnt(it); S.ents.push(it); }
    S.items.push(it); S.byId.set(it.id, it);
    return it;
  }
  const _col = new THREE.Color();
  function writeParts(it) {
    const n = layout(it);
    for (let i = 0; i < n && i < it.parts.length; i++) {
      const o = i * 7, part = it.parts[i];
      part.pool.set(part.i, itemMatrix(it, LAY[o + 1], LAY[o + 2], LAY[o + 3], LAY[o + 4], LAY[o + 5], LAY[o + 6]));
    }
  }
  function removeItem(it) {
    if (!it || it.dead) return;
    it.dead = true;
    for (const p of it.parts) p.pool.remove(p);
    it.parts.length = 0;
    if (it.blk) sgRemove(it.blk);
    for (const c of it.cols) cgRemove(c);
    it.cols.length = 0;
    despawnEnt(it);
    const drop = (arr) => { const i = arr.indexOf(it); if (i >= 0) arr.splice(i, 1); };
    drop(S.items); drop(S.props); drop(S.rings); drop(S.boosts); drop(S.lamps); drop(S.ents);
    if (it.foot) { const i = REFL.extra.indexOf(it.foot); if (i >= 0) REFL.extra.splice(i, 1); }
    S.byId.delete(it.id);
    if (S.lock === it) S.lock = null;
    if (S.sel === it) S.sel = null;
  }
  function spawnEnt(it) {
    const k = it.k;
    if (k.t === 'car') {
      const c = new Car(k.car, it.color); c.place(it.x, it.z, it.r); c.persistent = true; c.ct = it; it.ent = c;
    } else {
      const look = k.cop ? COP_LOOK : it.look;
      const p = new Ped(look, it.x, it.z); p.h = it.r; p.ct = it; it.ent = p;
      if (k.cop) p.cop = true;
      p.rect = { x0: it.x - 2.2, x1: it.x + 2.2, z0: it.z - 2.2, z1: it.z + 2.2 };
      p.p = typeof rectProject === 'function' ? rectProject(p.rect, it.x, it.z) : 0;
      p.spd = 1.05; p.idleT = rr(3, 9);
    }
  }
  function despawnEnt(it) {
    const e = it.ent; if (!e) return;
    it.ent = null;
    if (it.k.t === 'car') {
      if (player.car === e && typeof exitCar === 'function') exitCar();
      if (!e.dead) e.remove();
    } else if (!e.removed) e.remove();
  }
  // bring entities and props back to the design (on entering «Строить»)
  function resetWorld() {
    for (const it of S.ents) {
      const e = it.ent, moved = !e || (it.k.t === 'car' ? (e.dead || e.wrecked || e.health < 99 || Math.hypot(e.x - it.x, e.z - it.z) > 0.6 || e.driver === 'player') : (e.removed || e.state !== 'walk' || Math.hypot(e.x - it.x, e.z - it.z) > 4));
      if (moved) { despawnEnt(it); spawnEnt(it); }
    }
    for (const it of S.props) { const p = it.p; Object.assign(p, { x: it.x, y: it.y + it.k.hh, z: it.z, vx: 0, vy: 0, vz: 0, ry: it.r, tl: 0, wy: 0, awake: false, gone: false, fuse: -1 }); writeProp(it); }
    S.score = 0; S.combo = 0;
  }
  function clearItems() { for (const it of S.items.slice()) removeItem(it); }

  // ---------- dynamic props (cones, crates, barrels) ----------
  function writeProp(it) {
    const p = it.p, k = it.k, part = it.parts[0];
    if (p.gone) { _m4.makeScale(0, 0, 0); part.pool.set(part.i, _m4); return; }
    _q.setFromAxisAngle(UP, p.ry);
    if (p.tl > 0.001) { _ax.set(Math.cos(p.ta), 0, -Math.sin(p.ta)); _q2.setFromAxisAngle(_ax, p.tl); _q.premultiply(_q2); }
    _p.set(p.x, p.y, p.z); _s.set(1, 1, 1);
    part.pool.set(part.i, _m4.compose(_p, _q, _s));
  }
  function knock(it, vx, vz, vy, src) {
    const p = it.p, k = it.k; if (p.gone) return;
    p.vx = vx; p.vz = vz; p.vy = Math.max(p.vy, vy); p.awake = true; p.rest = 0;
    p.wy = rr(-6, 6);
    const sp = Math.hypot(vx, vz);
    if (sp > k.tip && p.tl < 0.1) { p.ta = Math.atan2(vz, vx) + Math.PI / 2; p.tipping = true; }
    if (k.boom && (sp > 6 || src === 'bullet' || src === 'boom')) p.fuse = src === 'boom' ? rr(0.12, 0.35) : 0.02;
  }
  function explodeBarrel(it) {
    const p = it.p; if (p.gone) return;
    p.gone = true; p.awake = false; writeProp(it);
    const x = p.x, y = p.y - 0.5, z = p.z;
    explosionFx(x, y, z);
    puffSmoke(x, y + 1, z, 10, true, 2.5);
    scorch(x, z);
    if (typeof GAMEHOOK !== 'undefined' && GAMEHOOK.explosion) GAMEHOOK.explosion(x, z, null);
    else if (AUD.ready) AUD.boom(Math.hypot(x - player.x, z - player.z));
    for (const c of cars) {
      if (c.exploded) continue;
      const d = Math.hypot(c.x - x, c.z - z); if (d > 7.5) continue;
      const f = 1 - d / 7.5;
      if (!(GAME.cheats.god && c === player.car)) c.damage(62 * f, 'boom');
      if (c.kinematic) c.makeDynamic();
      const k = 9 * f / (d || 1); c.vx += (c.x - x) * k; c.vz += (c.z - z) * k;
    }
    for (const o of S.props) {
      if (o === it || o.p.gone) continue;
      const d = Math.hypot(o.p.x - x, o.p.z - z); if (d > 6.5) continue;
      const f = (1 - d / 6.5) * 13 / (d || 1);
      knock(o, (o.p.x - x) * f, (o.p.z - z) * f, 4 + 6 * (1 - d / 6.5), 'boom');
    }
    EV.emit('explosion', { x, z, car: null, source: 'barrel' });
  }
  // scorch marks left by barrels (small pool of decals)
  const SCORCH = { list: [], i: 0 };
  function scorch(x, z) {
    if (!SCORCH.list.length) {
      const m = new THREE.MeshBasicMaterial({ map: TEX.blob, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, color: 0x000000 });
      const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2);
      for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(g, m); s.visible = false; s.renderOrder = 1; scene.add(s); SCORCH.list.push(s); }
    }
    const s = SCORCH.list[SCORCH.i++ % SCORCH.list.length];
    s.position.set(x, groundH(x, z) + 0.03, z); s.scale.set(5.5, 1, 5.5); s.rotation.y = Math.random() * TAU; s.visible = true;
  }
  function propBounce(p, hit) {
    if (!hit.hit) return;
    const vn = p.vx * hit.nx + p.vz * hit.nz;
    if (vn < 0) { p.vx -= 1.5 * vn * hit.nx; p.vz -= 1.5 * vn * hit.nz; }
    p.x = hit.x; p.z = hit.z;
  }
  function updateProps(dt) {
    const P = player;
    for (const it of S.props) {
      const p = it.p, k = it.k; if (p.gone) continue;
      // cars plough through props
      for (const c of cars) {
        if (Math.abs(c.x - p.x) > 4.5 || Math.abs(c.z - p.z) > 4.5) continue;
        const sp = c.speed; if (sp < 1.2) continue;
        const r = carCircles(c, CA) + k.rad;
        for (let i = 0; i < 3; i++) {
          const dx = p.x - CA[i * 2], dz = p.z - CA[i * 2 + 1], d2 = dx * dx + dz * dz;
          if (d2 > r * r || p.y > c.y + 2.2) continue;
          const d = Math.sqrt(d2) || 0.01;
          knock(it, c.vx * 1.15 + dx / d * 2.5, c.vz * 1.15 + dz / d * 2.5, 1.5 + sp * 0.2, 'car');
          p.x = CA[i * 2] + dx / d * r; p.z = CA[i * 2 + 1] + dz / d * r;
          if (!c.kinematic) { c.vx *= k.mass; c.vz *= k.mass; }
          if (k.boom && sp > 4.5) p.fuse = 0.02;
          else if (AUD.ready && c === P.car) AUD.thud(Math.min(1, sp / 20));
          break;
        }
      }
      // the player on foot pushes and kicks them
      if (P.mode === 'foot' && !P.dead) {
        const dx = p.x - P.x, dz = p.z - P.z, r = k.rad + 0.35, d2 = dx * dx + dz * dz;
        if (d2 < r * r && P.y < p.y + k.hh) {
          const d = Math.sqrt(d2) || 0.01, ps = Math.hypot(P.vx, P.vz);
          p.x = P.x + dx / d * r; p.z = P.z + dz / d * r;
          if (ps > 1) knock(it, P.vx * 1.3 + dx / d, P.vz * 1.3 + dz / d, ps > 5 ? 2 : 0.5, 'kick');
          else writeProp(it);
        }
      }
      if (p.fuse >= 0) { p.fuse -= dt; if (p.fuse < 0) { explodeBarrel(it); continue; } }
      if (!p.awake) continue;
      p.vy -= 18 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      propBounce(p, collideCircle(p.x, p.z, k.rad, p.y - k.hh + 0.2));
      propBounce(p, solveCircle(p.x, p.z, k.rad, p.y - k.hh));
      if (p.tipping) { p.tl = Math.min(Math.PI / 2, p.tl + dt * 7); if (p.tl >= Math.PI / 2) p.tipping = false; }
      const hc = k.hh * Math.cos(p.tl) + k.lie * Math.sin(p.tl);
      const g = groundH(p.x, p.z) + hc;
      p.ry += p.wy * dt;
      if (p.y <= g) {
        p.y = g;
        if (p.vy < -2.5) { p.vy = -p.vy * 0.28; if (k.boom && p.vy > 4) p.fuse = 0.02; } else p.vy = 0;
        const f = Math.exp(-(p.tl > 1 ? 3.2 : 6) * dt); p.vx *= f; p.vz *= f; p.wy *= f;
        if (Math.abs(p.vx) + Math.abs(p.vz) < 0.08 && p.vy === 0) { p.rest += dt; if (p.rest > 0.4) p.awake = false; }
      }
      writeProp(it);
    }
  }

  // ---------- bullets vs props (pairs the gunshot origin with the hit point) ----------
  EV.on('gunshot', (d) => { S.shot = d; });
  EV.on('bulletHit', (h) => {
    if (!S.on || !S.shot || !S.props.length) return;
    const o = S.shot; S.shot = null;
    const dx = h.x - o.x, dy = h.y - o.y, dz = h.z - o.z, L2 = dx * dx + dy * dy + dz * dz || 1;
    let best = null, bt = 2;
    for (const it of S.props) {
      const p = it.p; if (p.gone) continue;
      const t = clamp(((p.x - o.x) * dx + (p.y - o.y) * dy + (p.z - o.z) * dz) / L2, 0, 1);
      const qx = o.x + dx * t - p.x, qy = o.y + dy * t - p.y, qz = o.z + dz * t - p.z;
      const r = it.k.rad + 0.08, hh = it.k.hh + 0.05;
      if (qx * qx + qz * qz < r * r && Math.abs(qy) < hh && t < bt) { bt = t; best = it; }
    }
    if (!best) return;
    const L = Math.sqrt(L2);
    if (best.k.boom) { best.p.fuse = 0.01; best.p.awake = true; }
    else knock(best, dx / L * 5, dz / L * 5, 1.5, 'bullet');
    sparks(best.p.x, best.p.y, best.p.z, 6);
  });

  // ---------- stunts: rings, boost pads, airtime ----------
  const _prev = { x: 0, y: 0, z: 0, ok: false };
  function award(kind, pts, text) {
    if (S.comboT > 0) S.combo++; else S.combo = 1;
    S.comboT = 4;
    const sc = pts * S.combo;
    S.score += sc;
    HUD.toast(text + (S.combo > 1 ? ' · комбо ×' + S.combo : '') + ' · +' + sc, 'cash');
    EV.emit('stunt', { kind, score: sc, total: S.score });
    syncScore();
  }
  function updateStunts(dt) {
    S.comboT = Math.max(0, S.comboT - dt);
    const P = player, c = P.mode === 'car' ? P.car : null;
    if (P.dead) { _prev.ok = false; return; }
    const x = c ? c.x : P.x, y = c ? c.y + 0.9 : P.y + 1.0, z = c ? c.z : P.z;
    if (_prev.ok) {
      for (const it of S.rings) {
        const R = it.k.R, cy = it.y + R + 0.9;
        if (Math.abs(x - it.x) > R + 8 || Math.abs(z - it.z) > R + 8) continue;
        const nx = it.sn, nz = it.c;
        const s0 = (_prev.x - it.x) * nx + (_prev.z - it.z) * nz, s1 = (x - it.x) * nx + (z - it.z) * nz;
        if (s0 * s1 >= 0 || GAME.time - it.passT < 1) continue;
        const t = s0 / (s0 - s1), px = lerp(_prev.x, x, t) - it.x, py = lerp(_prev.y, y, t) - cy, pz = lerp(_prev.z, z, t) - it.z;
        if (px * px + py * py + pz * pz < (R - 0.15) * (R - 0.15)) {
          it.passT = GAME.time; it.ringT = 0.8;
          award('ring', 100, 'Кольцо!');
          if (AUD.ready) [880, 1175, 1568].forEach((f, i) => AUD.tone(f, 0.18, 'triangle', 0.07, null, i * 0.06));
        }
      }
    }
    _prev.x = x; _prev.y = y; _prev.z = z; _prev.ok = true;
    // boost pads push cars (player and NPC) and the player on foot
    for (const it of S.boosts) {
      const hw = it.k.W / 2 + 0.2, hl = it.k.L / 2 + 0.2;
      for (const car of cars) {
        if (car.kinematic || Math.abs(car.x - it.x) > 6 || Math.abs(car.z - it.z) > 6) continue;
        const dx = car.x - it.x, dz = car.z - it.z, lx = dx * it.c - dz * it.sn, lz = dx * it.sn + dz * it.c;
        const on = lx > -hw && lx < hw && lz > -hl && lz < hl && car.y < it.y + 1.2;
        if (on && car.boostPad !== it) {
          const vAl = car.vx * it.sn + car.vz * it.c, add = Math.max(10, 36 - vAl);
          car.vx += it.sn * add; car.vz += it.c * add;
          car.boostFx = 0.7;
          if (AUD.ready && car === c) { AUD.tone(260, 0.5, 'sawtooth', 0.07, 1100); AUD.noise(0.4, 0.12, 2400, 0.8, 'bandpass'); }
          if (car === c) { shakeCam(0.25); HUD.toast('Ускорение!', 'cash'); }
        }
        if (on) car.boostPad = it; else if (car.boostPad === it) car.boostPad = null;
      }
      if (!c && !P.dead) {
        const dx = P.x - it.x, dz = P.z - it.z, lx = dx * it.c - dz * it.sn, lz = dx * it.sn + dz * it.c;
        const on = lx > -hw && lx < hw && lz > -hl && lz < hl && P.y < it.y + 1;
        if (on && P.boostPad !== it) { P.vx = it.sn * 14; P.vz = it.c * 14; P.vy = 4.5; P.onGround = false; if (AUD.ready) AUD.tone(330, 0.35, 'sawtooth', 0.06, 900); }
        P.boostPad = on ? it : (P.boostPad === it ? null : P.boostPad);
      }
    }
    for (const car of cars) if (car.boostFx > 0) {
      car.boostFx -= dt;
      const fx = Math.sin(car.h), fz = Math.cos(car.h), ex = car.x - fx * (car.T.L / 2 + 0.2), ez = car.z - fz * (car.T.L / 2 + 0.2);
      for (let i = 0; i < 2; i++) fireFx.emit(ex + rr(-0.3, 0.3), car.y + 0.45, ez + rr(-0.3, 0.3), -fx * 6 + rr(-1, 1), rr(0, 1), -fz * 6 + rr(-1, 1), 0.25, 0.6, 0.1, 0.4, 1.4, 2.0, 1, 1.2, 0.3, 1.6, 1, 0);
    }
    // airtime of the player's car (works with any car physics that leaves the ground)
    if (c) {
      const g = groundH(c.x, c.z), A = S.air;
      if (c.y > g + 0.7) { if (!A || A.car !== c) S.air = { car: c, x: c.x, z: c.z, t: 0, maxH: 0 }; else { A.t += dt; A.maxH = Math.max(A.maxH, c.y - g); } }
      else if (A && c.y < g + 0.3) {
        if (A.t > 0.45 && A.car === c) { const d = Math.hypot(c.x - A.x, c.z - A.z); award('jump', Math.round(d * 8 + A.maxH * 20), 'Прыжок ' + Math.round(d) + ' м · ' + A.t.toFixed(1) + ' с'); }
        S.air = null;
      }
    } else S.air = null;
  }
  // traffic: kinematic cars about to drive into a placed object stop and become ordinary cars
  function updateTrafficBlocks() {
    if (!SG.map.size || !S.items.length) return;
    for (const c of cars) {
      if (!c.kinematic || !c.ai) continue;
      const fx = Math.sin(c.h), fz = Math.cos(c.h), a = c.T.L / 2 + 1.2;
      const e = blockedAt(c.x + fx * a, c.z + fz * a, 0.9) || blockedAt(c.x + fx * a + fz * 0.8, c.z + fz * a - fx * 0.8, 0.6) || blockedAt(c.x + fx * a - fz * 0.8, c.z + fz * a + fx * 0.8, 0.6);
      if (e) { c.makeDynamic(); c.vx *= 0.5; c.vz *= 0.5; }
    }
  }

  // ---------- free-fly camera («Строить») ----------
  const _look = new V3();
  function flyCam(dt) {
    const F = S.fly, u = (F.up || keys.has('Space')) ? 1 : 0, dn = (F.down || keys.has('ShiftLeft') || keys.has('ShiftRight')) ? 1 : 0;
    const sheet = !!S.sheet;
    const jx = sheet ? 0 : input.jx, jy = sheet ? 0 : input.jy;
    const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw), rx = -fz, rz = fx;
    const g0 = groundH(F.x, F.z);
    const spd = 11 + Math.max(0, F.y - g0 - 6) * 0.35;
    F.vx = damp(F.vx, (fx * jy + rx * jx) * spd, 5, dt); F.vz = damp(F.vz, (fz * jy + rz * jx) * spd, 5, dt);
    F.vy = damp(F.vy, (sheet ? 0 : u - dn) * spd * 0.75, 5, dt);
    F.x += F.vx * dt; F.y += F.vy * dt; F.z += F.vz * dt;
    const hit = collideCircle(F.x, F.z, 0.6, F.y - 0.4);
    F.x = hit.x; F.z = hit.z;
    F.y = clamp(F.y, groundH(F.x, F.z) + 0.9, 170);
    cam.pitch = clamp(cam.pitch, -1.2, 1.45);
    camera.position.set(F.x, F.y, F.z);
    const cp = Math.cos(cam.pitch);
    _look.set(F.x + fx * cp, F.y - Math.sin(cam.pitch), F.z + fz * cp);
    camera.lookAt(_look);
    const fov = window.innerWidth < window.innerHeight ? 78 : 64;
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = damp(camera.fov, fov, 4, dt); camera.updateProjectionMatrix(); }
  }

  // ---------- aiming: screen ray → ground / items ----------
  const _ro = new V3(), _rd = new V3(), _ndc = new V3();
  const aim = { ok: false, x: 0, y: 0, z: 0, valid: false };
  const hover = { on: false, x: 0, y: 0 };
  function screenRay(sx, sy) {
    camera.updateMatrixWorld();
    _ndc.set(sx / window.innerWidth * 2 - 1, -(sy / window.innerHeight) * 2 + 1, 0.5).unproject(camera);
    _ro.copy(camera.position); _rd.copy(_ndc).sub(_ro).normalize();
  }
  function aimRay() { if (hover.on && !isTouch) screenRay(hover.x, hover.y); else screenRay(window.innerWidth / 2, window.innerHeight / 2); }
  function rayGround(maxT) {
    const ox = _ro.x, oy = _ro.y, oz = _ro.z, dx = _rd.x, dy = _rd.y, dz = _rd.z;
    const tb = typeof rayBoxes === 'function' ? rayBoxes(ox, oy, oz, dx, dy, dz, maxT) : maxT;
    let prev = 0, t = 0.4;
    while (t < tb) {
      if (oy + dy * t <= groundH(ox + dx * t, oz + dz * t)) {
        let a = prev, b = t;
        for (let i = 0; i < 7; i++) { const m = (a + b) / 2; if (oy + dy * m > groundH(ox + dx * m, oz + dz * m)) a = m; else b = m; }
        aim.x = ox + dx * b; aim.y = oy + dy * b; aim.z = oz + dz * b; return b;
      }
      prev = t; t += 0.35 + t * 0.02;
    }
    if (tb < maxT) { const t2 = Math.max(0, tb - 0.4); aim.x = ox + dx * t2; aim.y = oy + dy * t2; aim.z = oz + dz * t2; return t2; }
    return -1;
  }
  // ray vs oriented box of an item; returns distance or -1
  function itemBox(it) {
    const k = it.k, dm = k.dims;
    if (k.t === 'prop') { const p = it.p; return p.gone ? null : [p.x, p.y - k.hh, p.z, dm[0], dm[1], dm[2], p.ry]; }
    if (k.t === 'car' || k.t === 'ped') { const e = it.ent; if (!e) return null; return [e.x, e.y, e.z, dm[0], dm[1], dm[2], e.h]; }
    return [it.x, it.y, it.z, dm[0], dm[1] + (k.t === 'ring' ? 0 : 0), dm[2], it.r];
  }
  function rayItem(it) {
    const b = itemBox(it); if (!b) return -1;
    const c = Math.cos(b[6]), s = Math.sin(b[6]);
    const ox = _ro.x - b[0], oz = _ro.z - b[2], oy = _ro.y - b[1];
    const lox = ox * c - oz * s, loz = ox * s + oz * c, ldx = _rd.x * c - _rd.z * s, ldz = _rd.x * s + _rd.z * c;
    const pad = it.k.t === 'prop' || it.k.t === 'ped' ? 0.25 : 0.05;
    let t0 = 0, t1 = 120;
    const sl = (o, d, lo, hi) => { if (Math.abs(d) < 1e-6) return o >= lo && o <= hi; let a = (lo - o) / d, bb = (hi - o) / d; if (a > bb) { const q = a; a = bb; bb = q; } t0 = Math.max(t0, a); t1 = Math.min(t1, bb); return t0 <= t1; };
    if (!sl(lox, ldx, -b[3] - pad, b[3] + pad)) return -1;
    if (!sl(loz, ldz, -b[5] - pad, b[5] + pad)) return -1;
    if (!sl(oy, _rd.y, -0.1, b[4] + pad)) return -1;
    return t0;
  }
  function pickItem() {
    let best = null, bt = 90;
    for (const it of S.items) {
      const t = rayItem(it);
      if (t >= 0 && t < bt) { bt = t; best = it; }
    }
    return best;
  }

  // ---------- ghost preview ----------
  const ghosts = {};
  let ghost = null, gridMesh = null, selBox = null, dropLine = null;
  function ghostFor(k) {
    if (ghosts[k.id]) return ghosts[k.id];
    const g = new THREE.Group();
    const addG = (geo, x, y, z) => {
      const m = new THREE.Mesh(geo, M.ghost); m.position.set(x || 0, y || 0, z || 0); g.add(m);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), M.ghostEdge); e.position.copy(m.position); g.add(e);
    };
    if (k.t === 'car') { const C = CAR_TYPES[k.car]; addG(boxB(C.W, C.H + C.cabH * 0.9, C.L)); addG(boxB(C.W * 0.5, 0.06, 0.6), 0, C.H + C.cabH * 0.9, C.L * 0.35); }
    else if (k.t === 'ped') { const c = new THREE.CylinderGeometry(0.28, 0.28, 1.8, 10); c.translate(0, 0.9, 0); addG(c); }
    else if (k.t === 'prop') addG(k.geos[0], 0, k.hh, 0);
    else if (k.t === 'ring') { addG(k.geos[0], 0, k.R + 0.9, 0); const p = new THREE.CylinderGeometry(0.12, 0.12, k.R + 0.9, 6); p.translate(0, (k.R + 0.9) / 2, 0); addG(p, -k.R - 0.25, 0, 0); addG(p, k.R + 0.25, 0, 0); }
    else for (const geo of k.geos) addG(geo);
    // arrow on the ground showing the item's forward direction
    const ar = new THREE.Shape(); ar.moveTo(-0.5, 0); ar.lineTo(0.5, 0); ar.lineTo(0.5, 1.2); ar.lineTo(1.1, 1.2); ar.lineTo(0, 2.3); ar.lineTo(-1.1, 1.2); ar.lineTo(-0.5, 1.2); ar.lineTo(-0.5, 0);
    const ag = new THREE.ShapeGeometry(ar); ag.rotateX(Math.PI / 2); ag.translate(0, 0.06, k.dims[2] + 0.3);
    const arrow = new THREE.Mesh(ag, new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }));
    if (k.t !== 'palm' && k.t !== 'lamp' && k.t !== 'prop' && k.t !== 'ped') g.add(arrow);
    g.visible = false; g.renderOrder = 8; scene.add(g);
    ghosts[k.id] = g;
    return g;
  }
  function makeHelpers() {
    gridMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      uniforms: { uC: { value: new V3() }, uCol: { value: new THREE.Color(0x3fe5ef) } },
      vertexShader: 'varying vec3 vP; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform vec3 uC, uCol; varying vec3 vP;
void main(){ vec2 g = abs(fract(vP.xz + 0.5) - 0.5) / fwidth(vP.xz); float l = 1.0 - min(min(g.x, g.y), 1.0);
  float f = 1.0 - smoothstep(3.0, 9.0, length(vP.xz - uC.xz)); gl_FragColor = vec4(uCol, l * f * 0.55);
  #include <encodings_fragment>
}`,
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5,
    }));
    gridMesh.scale.set(20, 1, 20); gridMesh.visible = false; gridMesh.renderOrder = 3; gridMesh.frustumCulled = false; scene.add(gridMesh);
    selBox = new THREE.LineSegments(new THREE.EdgesGeometry(boxB(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xffd23f, depthTest: false, transparent: true }));
    selBox.visible = false; selBox.renderOrder = 20; scene.add(selBox);
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    dropLine = new THREE.LineSegments(dg, new THREE.LineBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.8, depthTest: false }));
    dropLine.frustumCulled = false; dropLine.visible = false; dropLine.renderOrder = 9; scene.add(dropLine);
  }
  // compute the placement transform for the current kind; returns false when nothing can be placed
  const place = { x: 0, z: 0, r: 0, base: 0, y: 0, valid: false };
  function snapRot() { return Math.round(cam.yaw / (Math.PI / 2)) * (Math.PI / 2) + S.rotOff; }
  function computePlacement() {
    const k = S.kind; if (!k) return false;
    aimRay();
    let t = rayGround(80);
    if (t < 0) { const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw); aim.x = _ro.x + fx * 16; aim.z = _ro.z + fz * 16; }
    const g = k.t === 'prop' || k.t === 'ped' || k.t === 'car' ? 0.5 : GRID;
    let x = snap(aim.x, g), z = snap(aim.z, g), r = wrapA(snapRot());
    if (k.t === 'ramp' || k.t === 'block') { const m = magnet(k, x, z, r); x = m[0]; z = m[1]; }
    const base = groundH(x, z);
    place.x = x; place.z = z; place.r = r; place.base = base; place.y = base + S.lift;
    place.valid = validSpot(k, x, z, r);
    return true;
  }
  function validSpot(k, x, z, r) {
    if (S.items.length >= MAX_ITEMS) return false;
    if (k.t === 'car' && S.ents.filter((e) => e.k.t === 'car').length >= MAX_CARS) return false;
    if (k.t === 'ped' && S.ents.filter((e) => e.k.t === 'ped').length >= MAX_PEDS) return false;
    const inside = (px, pz) => (px > -298 && px < 304 && pz > -298 && pz < 298) || (typeof onPier === 'function' && onPier(px, pz));
    const dm = k.dims, c = Math.cos(r), s = Math.sin(r);
    const pts = [[0, 0], [dm[0], dm[2]], [-dm[0], dm[2]], [dm[0], -dm[2]], [-dm[0], -dm[2]]];
    for (const [lx, lz] of pts) {
      const px = x + lx * c + lz * s, pz = z - lx * s + lz * c;
      if (!inside(px, pz)) return false;
      if (typeof pointInBuilding === 'function' && pointInBuilding(px, pz)) return false;
    }
    return true;
  }
  // snap flush against aligned neighbours (ramps onto platforms, blocks side by side)
  function magnet(k, x, z, r) {
    const dm = k.dims; let best = null, bd = 1.2;
    for (const it of S.items) {
      const n = it.k; if (n.t !== 'ramp' && n.t !== 'block') continue;
      if (Math.abs(it.x - x) > 18 || Math.abs(it.z - z) > 18) continue;
      const dr = wrapA(r - it.r), q = Math.round(dr / (Math.PI / 2));
      if (Math.abs(dr - q * Math.PI / 2) > 0.01) continue;
      const swap = Math.abs(q) % 2 === 1, ghw = swap ? dm[2] : dm[0], ghl = swap ? dm[0] : dm[2];
      const nd = n.dims, dx = x - it.x, dz = z - it.z, lx = dx * it.c - dz * it.sn, lz = dx * it.sn + dz * it.c;
      const gx = Math.abs(lx) - (nd[0] + ghw), gz = Math.abs(lz) - (nd[2] + ghl);
      if (Math.abs(gx) < bd && Math.abs(lz) < nd[2] + ghl - 0.4) {
        bd = Math.abs(gx); let nz = lz; if (Math.abs(lz) < 1) nz = 0; else if (Math.abs(Math.abs(lz) - (nd[2] - ghl)) < 0.8) nz = Math.sign(lz) * (nd[2] - ghl);
        best = [it, Math.sign(lx || 1) * (nd[0] + ghw), nz];
      }
      if (Math.abs(gz) < bd && Math.abs(lx) < nd[0] + ghw - 0.4) {
        bd = Math.abs(gz); let nx = lx; if (Math.abs(lx) < 1) nx = 0; else if (Math.abs(Math.abs(lx) - (nd[0] - ghw)) < 0.8) nx = Math.sign(lx) * (nd[0] - ghw);
        best = [it, nx, Math.sign(lz || 1) * (nd[2] + ghl)];
      }
    }
    if (!best) return [x, z];
    const it = best[0], lx = best[1], lz = best[2];
    return [it.x + lx * it.c + lz * it.sn, it.z - lx * it.sn + lz * it.c];
  }
  function updateGhost() {
    for (const id in ghosts) ghosts[id].visible = false;
    gridMesh.visible = false; selBox.visible = false; dropLine.visible = false;
    if (!S.building || S.sheet) return;
    if (S.tool === 'place') {
      if (!computePlacement()) return;
      const k = S.kind, g = ghostFor(k);
      g.visible = true; g.position.set(place.x, place.y, place.z); g.rotation.y = place.r;
      M.ghost.color.set(place.valid ? 0x3fe5ef : 0xff4d5e); M.ghostEdge.color.set(place.valid ? 0x9ff6ff : 0xff8a95);
      gridMesh.visible = true; gridMesh.position.set(snap(place.x, 1), place.base + 0.025, snap(place.z, 1));
      gridMesh.material.uniforms.uC.value.set(place.x, 0, place.z);
      if (S.lift > 0.05) {
        const a = dropLine.geometry.attributes.position.array; a[0] = place.x; a[1] = place.base; a[2] = place.z; a[3] = place.x; a[4] = place.y; a[5] = place.z;
        dropLine.geometry.attributes.position.needsUpdate = true; dropLine.visible = true;
      }
    } else {
      aimRay();
      S.hover = pickItem();
      if (S.lock && S.lock.dead) S.lock = null;
      S.sel = S.lock || S.hover;
      const it = S.sel;
      if (it) {
        const b = itemBox(it);
        if (b) { selBox.visible = true; selBox.position.set(b[0], b[1], b[2]); selBox.rotation.y = b[6]; selBox.scale.set(b[3] * 2 + 0.2, b[4] + 0.15, b[5] * 2 + 0.2); }
      }
    }
    syncCard();
  }

  // ---------- commands (undo / redo) ----------
  function exec(cmd) {
    apply(cmd, false);
    S.undo.push(cmd); if (S.undo.length > 120) S.undo.shift();
    S.redo.length = 0;
    dirty(); syncTop();
  }
  function apply(cmd, rev) {
    const add = (list) => list.forEach((d) => addItem(d));
    const del = (list) => list.slice().reverse().forEach((d) => removeItem(S.byId.get(d.id)));
    if (cmd.op === 'add') { if (rev) del(cmd.items); else add(cmd.items); }
    else if (cmd.op === 'del') { if (rev) add(cmd.items); else del(cmd.items); }
    else if (cmd.op === 'edit') { const d = rev ? cmd.before : cmd.after; removeItem(S.byId.get(d.id)); addItem(d); }
    else if (cmd.op === 'load') { if (rev) { del(cmd.after); add(cmd.before); } else { del(cmd.before); add(cmd.after); } }
  }
  function undo() { const c = S.undo.pop(); if (!c) return; apply(c, true); S.redo.push(c); dirty(); syncTop(); AUD.ready && AUD.tone(520, 0.08, 'triangle', 0.05, 380); }
  function redo() { const c = S.redo.pop(); if (!c) return; apply(c, false); S.undo.push(c); dirty(); syncTop(); AUD.ready && AUD.tone(380, 0.08, 'triangle', 0.05, 520); }
  function doPlace() {
    if (S.tool !== 'place' || !S.kind) return;
    if (!computePlacement()) return;
    if (!place.valid) { HUD.toast(S.items.length >= MAX_ITEMS ? 'Достигнут предел объектов (' + MAX_ITEMS + ')' : 'Здесь нельзя поставить', 'warn'); AUD.ready && AUD.tone(200, 0.15, 'square', 0.05); return; }
    const d = { id: ++S.uid, k: S.kind.id, x: r2(place.x), z: r2(place.z), r: r4(place.r), l: r2(S.lift), b: r2(place.base) };
    if (S.carry && S.carry.k === S.kind.id) { if (S.carry.c) d.c = S.carry.c; if (S.carry.look) d.look = S.carry.look; if (S.carry.s) d.s = S.carry.s; S.carry = null; }
    exec({ op: 'add', items: [d] });
    const it = S.byId.get(d.id);
    if (it) { const x = serialize(it); Object.assign(d, x); }
    if (AUD.ready) { AUD.tone(660, 0.07, 'triangle', 0.06); AUD.noise(0.08, 0.06, 700); }
    shakeCam(0.05);
  }
  function doDelete() {
    const it = S.sel; if (!it) { HUD.toast('Наведите прицел на объект'); return; }
    exec({ op: 'del', items: [serialize(it)] });
    S.lock = null;
    if (AUD.ready) { AUD.tone(300, 0.1, 'square', 0.05, 160); AUD.noise(0.12, 0.08, 500); }
  }
  function editSel(fn) {
    const it = S.sel; if (!it) { HUD.toast('Наведите прицел на объект'); return; }
    const before = serialize(it), after = Object.assign({}, before);
    fn(after);
    if (after.r === before.r && after.l === before.l) return;
    if (after.l !== before.l) after.b = before.b;
    exec({ op: 'edit', before, after });
    S.lock = S.byId.get(before.id) || null;
  }
  function rotate(dir) {
    if (S.tool === 'select') { editSel((d) => { d.r = r4(wrapA(d.r + dir * ROT_STEP)); }); return; }
    S.rotOff = wrapA(S.rotOff + dir * ROT_STEP);
    if (AUD.ready) AUD.tone(500, 0.05, 'triangle', 0.04);
    syncCard();
  }
  function liftBy(dv) {
    if (S.tool === 'select') { editSel((d) => { d.l = r2(clamp(d.l + dv, 0, 30)); }); return; }
    S.lift = r2(clamp(S.lift + dv, 0, 30));
    syncCard();
  }
  function take() {
    const it = S.sel; if (!it) return;
    const d = serialize(it);
    exec({ op: 'del', items: [d] });
    S.kind = it.k; S.lift = d.l; S.rotOff = wrapA(d.r - Math.round(cam.yaw / (Math.PI / 2)) * (Math.PI / 2));
    S.carry = { k: d.k, c: d.c, look: d.look, s: d.s };
    setTool('place');
    HUD.toast('Объект в руке — поставьте его заново');
  }
  function clearAll() {
    if (!S.items.length) return;
    exec({ op: 'del', items: S.items.map(serialize) });
    HUD.toast('Всё убрано. Отменить — кнопка ↶');
  }
  function loadItems(list, label) {
    const before = S.items.map(serialize);
    let id = S.uid;
    const after = list.filter((d) => KIND[d.k]).map((d) => Object.assign({}, d, { id: ++id }));
    exec({ op: 'load', before, after });
    if (label) HUD.toast(label);
  }

  // ---------- save / load ----------
  function dirty() { S.saveT = 1.2; }
  function autosave() {
    S.set.hour = r2(DAY.hours);
    const data = { v: 1, items: S.items.map(serialize), set: S.set, fly: { x: r2(S.fly.x), y: r2(S.fly.y), z: r2(S.fly.z), yaw: r4(cam.yaw), pitch: r4(cam.pitch) } };
    store.set(AUTO_KEY, JSON.stringify(data));
  }
  function readJSON(k) { try { const s = store.get(k); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function listBuilds() { const d = readJSON(BUILDS_KEY); return d && Array.isArray(d.builds) ? d.builds : []; }
  function saveBuild(name) {
    name = (name || '').trim().slice(0, 28) || ('Постройка ' + (listBuilds().length + 1));
    const builds = listBuilds().filter((b) => b.name !== name);
    builds.unshift({ name, t: Date.now(), items: S.items.map(serialize) });
    store.set(BUILDS_KEY, JSON.stringify({ builds: builds.slice(0, 20) }));
    HUD.toast('Сохранено: ' + name, 'cash');
    renderFiles();
  }
  function loadBuild(i) {
    const b = listBuilds()[i]; if (!b) return;
    loadItems(b.items, 'Загружено: ' + b.name);
    closeSheet();
  }
  function deleteBuild(i) {
    const builds = listBuilds(); builds.splice(i, 1);
    store.set(BUILDS_KEY, JSON.stringify({ builds }));
    renderFiles();
  }
  // a ready-made stunt park on the avenue east of the plaza (also the first-run world)
  function exampleBuild() {
    const L = [];
    const add = (k, x, z, r, l, extra) => L.push(Object.assign({ k, x, z, r: r || 0, l: l || 0 }, extra || {}));
    add('boost', 40, -26);
    add('ramp_long', 40, -12);
    add('plat_hi', 40, 0);
    add('ramp_long', 40, 12, Math.PI);
    add('barrel', 37.6, 26.5); add('barrel', 40, 27.5); add('barrel', 42.4, 26.5); add('barrel', 40, 25.2);
    for (const z of [-30, -18, 18, 30]) { add('cone', 33.5, z); add('cone', 46.5, z); }
    add('boost', 40, 53);
    add('kicker', 40, 64);
    add('ring', 40, 74, 0, 1.5);
    add('ring', 40, 86, 0, 3);
    add('crate', 38.5, 104); add('crate', 41.5, 104); add('crate', 40, 105.6);
    add('container', 34.5, 82); add('container', 45.5, 82);
    add('car_muscle', 36.2, -29.5, 0, 0, { c: '#ff8a3d' }); add('car_police', 43.8, -29.5);
    add('ped', 51.5, -4); add('ped', 51.5, 0); add('ped', 51.5, 4); add('cop', 51.5, 9);
    add('palm', 51, 18); add('palm', 51, 30); add('lamp', 49.5, 64, -Math.PI / 2);
    return L;
  }

  // ---------- state switching ----------
  function hidePlayer() { player.root.visible = false; if (player.blob) player.blob.visible = false; }
  function pinPlayer() { player.dead = true; player.vx = player.vz = player.vy = 0; player.knockT = 0; hidePlayer(); }
  function enterBuild(keepFly) {
    if (player.mode === 'car' && player.car && typeof exitCar === 'function') exitCar();
    S.building = true;
    if (!keepFly) {
      const F = S.fly; F.x = camera.position.x; F.z = camera.position.z; F.y = Math.max(camera.position.y, groundH(F.x, F.z) + 2); F.vx = F.vy = F.vz = 0;
    }
    cam.override = flyCam;
    pinPlayer();
    HUD.dead && HUD.dead(null);
    HUD.setMode('creative');
    resetWorld();
    S.lock = null;
    syncState();
    EV.emit('creativeState', { building: true });
  }
  function enterPlay(driveCar) {
    S.building = false; S.lock = null;
    cam.override = null;
    // drop the player on the ground in front of the camera
    aimRay();
    let px = S.fly.x + Math.sin(cam.yaw) * 6, pz = S.fly.z + Math.cos(cam.yaw) * 6;
    const t = rayGround(40);
    if (t > 0 && t < 30) { px = aim.x - Math.sin(cam.yaw) * 1.5; pz = aim.z - Math.cos(cam.yaw) * 1.5; }
    if (typeof pointInBuilding === 'function' && pointInBuilding(px, pz)) { px = S.fly.x; pz = S.fly.z; }
    const h = collideCircle(px, pz, 0.5);
    const P = player;
    Object.assign(P, { x: h.x, z: h.z, y: groundH(h.x, h.z), vx: 0, vz: 0, vy: 0, h: cam.yaw, dead: false, health: 100, knockT: 0, mode: 'foot', car: null });
    P.anim.mode = 'normal'; P.anim.hands = false; P.anim.punch = 0;
    P.root.rotation.set(0, P.h, 0); P.root.position.set(P.x, P.y, P.z); P.root.visible = true; if (P.blob) P.blob.visible = true;
    cam.pitch = 0.25; cam.idle = 0; cam.curDist = 4.4;
    S.playStart = { x: P.x, z: P.z };
    S.score = 0; S.combo = 0; S.air = null; _prev.ok = false;
    HUD.setMode('foot');
    if (driveCar && driveCar.ent && !driveCar.ent.dead && typeof enterCar === 'function') {
      const c = driveCar.ent; P.x = c.x; P.z = c.z; enterCar(c); cam.yaw = c.h;
    }
    syncState(); syncScore();
    EV.emit('creativeState', { building: false });
  }
  function toggleState() { if (S.building) enterPlay(); else enterBuild(); }
  function setTool(t) {
    S.tool = t; S.lock = null; S.sel = null;
    syncTop(); syncCard();
  }

  // ---------- world settings ----------
  const SPEEDS = [[1, '100%'], [0.5, '50%'], [0.25, '25%']];
  const DENS = [[0, 'Нет'], [0.5, 'Мало'], [1, 'Норма'], [1.5, 'Много']];
  function applySettings(first) {
    const s = S.set;
    GAME.cheats.god = !!s.god; GAME.cheats.noPolice = !!s.noPolice;
    if (s.noPolice && typeof clearWanted === 'function') clearWanted();
    DAY.frozen = !!s.freeze;
    if (first && typeof s.hour === 'number') setHour(s.hour);
    ATMO.auto = s.weather === 'auto';
    if (s.weather !== 'auto') ATMO.set(s.weather, !!first);
    DENSITY.traffic = s.traffic; DENSITY.peds = s.peds; applyDensity(); trimCrowd();
    GAME.timeScale = s.speed;
    dirty(); syncWorld();
  }
  function setHour(h) { DAY.hours = ((h % 24) + 24) % 24; DAY.envT = 99; DAY.lastEnvDir.set(0, -2, 0); }
  // remove traffic and pedestrians above the new density (ours and mission cars are kept)
  function trimCrowd() {
    let n = 0;
    for (let i = cars.length - 1; i >= 0; i--) {
      const c = cars[i];
      if (!(c.ai instanceof TrafficAI) || c.persistent || c === player.car || c.mission) continue;
      if (++n > Q.traffic) c.remove();
    }
    n = 0;
    for (let i = peds.length - 1; i >= 0; i--) { const p = peds[i]; if (p.ct || p.cop) continue; if (++n > Q.peds) p.remove(); }
  }

  // ---------- UI ----------
  const IC = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.2v13.6L19 12z"/></svg>',
    build: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
    place: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    select: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 3.5l12.5 7.2-5.3 1.5 3.2 6-2.4 1.3-3.2-6-4.1 3.7z"/></svg>',
    undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
    redo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg>',
    world: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="9" r="3.4"/><path d="M9 2.5v1.6M3.6 4.6l1.1 1.1M2.5 9h1.6M14.4 4.6l-1.1 1.1"/><path d="M8.5 19.5h9a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6 1.4 2.8 2.8 0 0 0 .2 5.6z" fill="currentColor" fill-opacity=".25"/></svg>',
    files: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M3.5 6.5a2 2 0 0 1 2-2h4l2 2.2h7a2 2 0 0 1 2 2v8.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="M8 13h8" stroke-linecap="round"/></svg>',
    rot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19.5 12a7.5 7.5 0 1 1-2.6-5.7"/><path d="M17.5 2.8v4.4h-4.4"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 15l7-7 7 7"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9l7 7 7-7"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5"/></svg>',
    clear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 20h16M7 16l9.5-9.5M10 19l8.5-8.5M5 13l8-8"/></svg>',
  };
  const KI = {
    ramp_s: '<path d="M3 26h26V15z" fill="#ff7a45"/><path d="M3 26 29 15" stroke="#ffc21a" stroke-width="2.4"/>',
    ramp_m: '<path d="M3 26h26V9z" fill="#ff7a45"/><path d="M3 26 29 9" stroke="#ffc21a" stroke-width="2.4"/>',
    ramp_l: '<path d="M11 26h18V6z" fill="#ff7a45"/><path d="M11 26 29 6" stroke="#ffc21a" stroke-width="2.4"/>',
    ramp_w: '<path d="M2 27h20V18zM10 22h20v-9z" fill="#ff7a45"/><path d="M10 22l20-9" stroke="#ffc21a" stroke-width="2.2"/>',
    ramp_long: '<path d="M1 26h30v-9z" fill="#ff7a45"/><path d="M1 26l30-9" stroke="#ffc21a" stroke-width="2.4"/>',
    kicker: '<path d="M3 26h25V8C26 20 15 26 3 26z" fill="#ff7a45"/><path d="M3 26C15 26 26 20 28 8" stroke="#ffc21a" stroke-width="2.4" fill="none"/>',
    plat_lo: '<path d="M4 14l12-6 12 6v7l-12 6-12-6z" fill="#d9d3c8"/><path d="M4 14l12 6 12-6-12-6z" fill="#3a3d46" stroke="#ffc21a" stroke-width="1.6"/>',
    plat_hi: '<path d="M4 11l12-6 12 6v11l-12 6-12-6z" fill="#d9d3c8"/><path d="M4 11l12 6 12-6-12-6z" fill="#3a3d46" stroke="#ffc21a" stroke-width="1.6"/>',
    block: '<path d="M7 12l9-5 9 5v10l-9 5-9-5z" fill="#c9c3b8"/><path d="M7 12l9 5 9-5-9-5z" fill="#e8e3da"/><path d="M16 17v10" stroke="#8d877c" stroke-width="1.4"/>',
    container: '<path d="M3 11h26v13H3z" fill="#2a9d8f"/><path d="M6 11v13M9.5 11v13M13 11v13M16.5 11v13M20 11v13M23.5 11v13M27 11v13" stroke="#1f6f66" stroke-width="1.4"/>',
    wall: '<path d="M3 8h26v18H3z" fill="#e9e1d4"/><circle cx="11" cy="15" r="4" fill="#ff3f8e"/><circle cx="20" cy="17" r="3.4" fill="#3fe5ef"/><path d="M3 22h26v4H3z" fill="#2b2440"/>',
    barrier: '<path d="M4 26l2-6 4-9h12l4 9 2 6z" fill="#f2efe9"/><path d="M4 26l2-6 4-9h5v15zM22 11h-0.1l4 9 2 6h-6z" fill="#d7263d"/>',
    cone: '<path d="M16 4l7 20H9z" fill="#ff6a1a"/><path d="M12.2 15h7.6l1.1 3.2H11.1z" fill="#f4f4f4"/><path d="M7 24h18v3H7z" fill="#ff6a1a"/>',
    crate: '<path d="M6 7h20v20H6z" fill="#b0804a"/><path d="M6 7h20v20H6zM6 27 26 7" stroke="#6e4522" stroke-width="2.4" fill="none"/>',
    barrel: '<path d="M8 6h16v21H8z" fill="#c3202b"/><path d="M8 10h16M8 23h16" stroke="#7a0f17" stroke-width="1.6"/><path d="M16 11l5 5.5-5 5.5-5-5.5z" fill="#ffd23f"/>',
    ring: '<circle cx="16" cy="14" r="9" fill="none" stroke="#ff3f8e" stroke-width="3.4"/><path d="M6 23v6M26 23v6" stroke="#8b93a3" stroke-width="2"/>',
    boost: '<path d="M7 4h18v24H7z" fill="#121026"/><path d="M10 14l6-5 6 5M10 22l6-5 6 5" stroke="#3fe5ef" stroke-width="2.6" fill="none"/>',
    car_sedan: '<path d="M4 20l2-5 5-1 3-4h7l4 4 3 1 1 5z" fill="#3a86ff"/><circle cx="9.5" cy="21" r="2.6" fill="#141414"/><circle cx="23" cy="21" r="2.6" fill="#141414"/>',
    car_coupe: '<path d="M3 20l2-4 6-1 4-4h5l5 4 4 1 1 4z" fill="#ff3f8e"/><circle cx="9" cy="21" r="2.6" fill="#141414"/><circle cx="23.5" cy="21" r="2.6" fill="#141414"/>',
    car_suv: '<path d="M4 21v-6l3-1 3-5h11l4 5 3 1v6z" fill="#2a9d8f"/><circle cx="9.5" cy="22" r="3" fill="#141414"/><circle cx="23" cy="22" r="3" fill="#141414"/>',
    car_muscle: '<path d="M3 20l1-4 8-1 3-3h6l4 3 5 1 1 4z" fill="#ff8a3d"/><path d="M13 13h8" stroke="#141414" stroke-width="1.6"/><circle cx="9" cy="21" r="2.8" fill="#141414"/><circle cx="23.5" cy="21" r="2.8" fill="#141414"/>',
    car_taxi: '<path d="M4 20l2-5 5-1 3-4h7l4 4 3 1 1 5z" fill="#ffc81f"/><path d="M14 7h5v3h-5z" fill="#ffe14d" stroke="#111" stroke-width=".8"/><circle cx="9.5" cy="21" r="2.6" fill="#141414"/><circle cx="23" cy="21" r="2.6" fill="#141414"/>',
    car_police: '<path d="M4 20l2-5 5-1 3-4h7l4 4 3 1 1 5z" fill="#15213f"/><path d="M11 15h11v3H11z" fill="#f2f4f8"/><path d="M13 7h3v3h-3z" fill="#ff2030"/><path d="M17 7h3v3h-3z" fill="#2050ff"/><circle cx="9.5" cy="21" r="2.6" fill="#141414"/><circle cx="23" cy="21" r="2.6" fill="#141414"/>',
    ped: '<circle cx="16" cy="7" r="3.6" fill="#f3cfb3"/><path d="M11 12h10l-1 9h-2l-.5 7h-3L14 21h-2z" fill="#3fe5ef"/>',
    cop: '<circle cx="16" cy="8" r="3.6" fill="#8a5a3c"/><path d="M11.5 5h9l-1 2h-7z" fill="#14213d"/><path d="M11 12h10l-1 9h-2l-.5 7h-3L14 21h-2z" fill="#1f3c8f"/><path d="M17.5 14h2v2h-2z" fill="#ffd23f"/>',
    palm: '<path d="M15 28c1-7 0-13 2-17" stroke="#8a6a48" stroke-width="2.4" fill="none"/><path d="M17 11c-4-4-9-3-12 0 4-1 8 0 12 0zM17 11c4-4 9-4 12-1-4-1-8 0-12 1zM17 11c-1-5 2-8 6-8-3 2-5 5-6 8zM17 11c-3 1-6 5-6 9 1-4 3-6 6-9z" fill="#3f8f3a"/>',
    lamp: '<path d="M10 28V7h9" stroke="#3a3f48" stroke-width="2.2" fill="none"/><path d="M16 6h7v3h-7z" fill="#222"/><path d="M17 9l-4 10h14l-4-10z" fill="#ffd7a0" opacity=".55"/>',
  };
  const kIcon = (id) => '<svg viewBox="0 0 32 32" stroke-linejoin="round">' + (KI[id] || '') + '</svg>';
  const CSS = `
#ctRoot{position:absolute;inset:0;pointer-events:none}
#ctRoot.off,#ctRoot .off{display:none!important}
body.ct-on #money{display:none}
.ct-bar{position:absolute;top:calc(10px + var(--st));left:50%;transform:translateX(-50%);display:flex;gap:5px;align-items:center;pointer-events:auto;
  background:var(--glass);border:1px solid var(--line);border-radius:16px;padding:4px;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 8px 24px rgba(0,0,0,.3)}
.ct-b{flex:none;width:38px;height:38px;border-radius:12px;border:1px solid transparent;background:rgba(255,255,255,.06);display:grid;place-items:center;cursor:pointer;color:var(--fg);padding:0;touch-action:manipulation}
.ct-b svg{width:20px;height:20px;pointer-events:none}
.ct-b.on{background:rgba(63,229,239,.2);border-color:var(--cyan)}
.ct-b:disabled{opacity:.32;cursor:default}
.ct-b:active:not(:disabled){transform:scale(.93)}
.ct-go{width:auto;height:38px;padding:0 11px;display:flex;gap:6px;align-items:center;font:800 11.5px/1 var(--display);letter-spacing:.05em;color:#24062b;
  background:linear-gradient(90deg,var(--gold),var(--sun) 50%,var(--pink));border:0}
.ct-go svg{width:16px;height:16px}
.ct-go span{display:none}
.ct-seg{display:flex;gap:2px;background:rgba(0,0,0,.28);border-radius:13px;padding:2px}
.ct-sep{width:1px;height:24px;background:var(--line);margin:0 1px}
#ctPlayBar{gap:8px;padding:4px 6px 4px 4px}
#ctPlayBar .ct-go span{display:inline}
#ctScore{font:800 13px/1 var(--display);color:var(--lime);font-variant-numeric:tabular-nums;padding-right:4px;white-space:nowrap}
#ctCard{position:absolute;left:50%;bottom:calc(12px + var(--sb));transform:translateX(-50%);display:flex;gap:6px;align-items:stretch;pointer-events:auto}
.ct-pick{display:flex;gap:9px;align-items:center;background:var(--glass);border:1px solid var(--line);border-radius:16px;padding:5px 12px 5px 5px;cursor:pointer;
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);text-align:left;max-width:52vw;min-width:0}
.ct-pick i{flex:none;width:40px;height:40px;border-radius:11px;background:rgba(255,255,255,.08);display:grid;place-items:center}
.ct-pick i svg{width:30px;height:30px}
.ct-pick b{display:block;font:800 12.5px/1.15 var(--body);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ct-pick small{display:block;font:700 10px/1.2 var(--body);color:var(--fg-dim);letter-spacing:.06em;margin-top:2px;white-space:nowrap}
.ct-lift{display:flex;align-items:center;gap:2px;background:var(--glass);border:1px solid var(--line);border-radius:16px;padding:4px;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
.ct-lift .ct-b{width:34px;height:34px}
.ct-lift span{font:800 11px/1 var(--display);min-width:44px;text-align:center;font-variant-numeric:tabular-nums}
.ct-acts{display:flex;gap:4px;align-items:center}
.ct-acts .ghost{padding:9px 12px;font-size:12px}
#ctCross{position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;opacity:.85}
#ctCross:before,#ctCross:after{content:'';position:absolute;background:#fff;box-shadow:0 0 3px rgba(0,0,0,.8);border-radius:1px}
#ctCross:before{left:12px;top:3px;width:2px;height:20px}#ctCross:after{top:12px;left:3px;height:2px;width:20px}
.ct-sheet{position:absolute;inset:0;z-index:12;display:grid;place-items:center;background:rgba(10,5,20,.45);pointer-events:auto;
  padding:calc(10px + var(--st)) calc(12px + var(--sr)) calc(10px + var(--sb)) calc(12px + var(--sl))}
.ct-sheet .panel{width:min(660px,100%);gap:12px}
.ct-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
.ct-x{flex:none;width:36px;height:36px;border-radius:12px;border:1px solid var(--line);background:rgba(255,255,255,.06);color:var(--fg);font:800 16px/1 var(--body);cursor:pointer}
.ct-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(86px,1fr));gap:7px}
.ct-card{display:flex;flex-direction:column;align-items:center;gap:5px;padding:9px 4px 8px;border-radius:14px;background:rgba(255,255,255,.05);border:1px solid var(--line);
  font:700 11px/1.2 var(--body);color:var(--fg);cursor:pointer;text-align:center;touch-action:manipulation}
.ct-card svg{width:38px;height:38px}
.ct-card.on{border-color:var(--cyan);background:rgba(63,229,239,.15)}
.ct-row{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:12px;background:rgba(255,255,255,.05)}
.ct-row>span{flex:1;min-width:0}
.ct-row b{display:block;font:800 13px/1.2 var(--body);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ct-row small{font:700 10.5px/1.2 var(--body);color:var(--fg-dim)}
.ct-row .ghost{padding:8px 11px;font-size:12px}
.ct-in{flex:1;min-width:0;border-radius:999px;border:1px solid var(--line);background:rgba(0,0,0,.25);color:var(--fg);font:700 13px/1 var(--body);padding:11px 14px;outline:none;user-select:text;-webkit-user-select:text;touch-action:manipulation}
.ct-in:focus{border-color:var(--cyan)}
.ct-sheet .play{padding:11px 20px;font-size:13px}
.ct-val{color:var(--fg);letter-spacing:.05em;margin-left:6px}
#ctWx .chip,#ctPauseWx .chip{min-width:0}
@media (min-width:760px){.ct-go span{display:inline}.ct-b{width:40px;height:40px}}
@media (orientation:portrait){
  .ct-bar{top:calc(var(--map) + 30px + var(--st));left:calc(14px + var(--sl));transform:none}
  #ctPlayBar{top:calc(var(--map) + 30px + var(--st))}
  #ctCard{bottom:calc(30px + var(--sb) + var(--b) * 2.9);}
  .ct-pick{max-width:62vw}
}`;
  function el(tag, cls, html, parent) { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; if (parent) parent.appendChild(e); return e; }
  function tap(e, fn) {
    e.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); AUD.resume(); });
    e.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); if (!e.disabled) fn(ev); });
  }
  function buildUI() {
    HUD.addStyle(CSS);
    const U = S.ui;
    const root = U.root = el('div', 'off', '', $('hud')); root.id = 'ctRoot';
    // build bar
    const bar = U.bar = el('div', 'ct-bar', '', root); bar.id = 'ctBar';
    U.play = el('button', 'ct-b ct-go', IC.play + '<span>ИГРАТЬ</span>', bar); U.play.id = 'ctPlayBtn'; U.play.setAttribute('aria-label', 'Играть');
    tap(U.play, () => enterPlay());
    const seg = el('div', 'ct-seg', '', bar);
    U.tPlace = el('button', 'ct-b', IC.place, seg); U.tPlace.id = 'ctToolPlace'; U.tPlace.setAttribute('aria-label', 'Ставить объекты');
    U.tSel = el('button', 'ct-b', IC.select, seg); U.tSel.id = 'ctToolSel'; U.tSel.setAttribute('aria-label', 'Выбирать объекты');
    tap(U.tPlace, () => setTool('place')); tap(U.tSel, () => setTool('select'));
    el('i', 'ct-sep', '', bar);
    U.undo = el('button', 'ct-b', IC.undo, bar); U.undo.id = 'ctUndo'; U.undo.setAttribute('aria-label', 'Отменить'); tap(U.undo, undo);
    U.redo = el('button', 'ct-b', IC.redo, bar); U.redo.id = 'ctRedo'; U.redo.setAttribute('aria-label', 'Повторить'); tap(U.redo, redo);
    el('i', 'ct-sep', '', bar);
    U.world = el('button', 'ct-b', IC.world, bar); U.world.id = 'ctWorldBtn'; U.world.setAttribute('aria-label', 'Настройки мира'); tap(U.world, () => openSheet('world'));
    U.files = el('button', 'ct-b', IC.files, bar); U.files.id = 'ctFilesBtn'; U.files.setAttribute('aria-label', 'Сохранения'); tap(U.files, () => openSheet('files'));
    // play bar
    const pb = U.playBar = el('div', 'ct-bar', '', root); pb.id = 'ctPlayBar';
    U.back = el('button', 'ct-b ct-go', IC.build + '<span>СТРОИТЬ</span>', pb); U.back.id = 'ctBuildBtn'; U.back.setAttribute('aria-label', 'Строить'); tap(U.back, () => enterBuild());
    U.score = el('div', '', '', pb); U.score.id = 'ctScore';
    // bottom card
    const card = U.card = el('div', '', '', root); card.id = 'ctCard';
    U.pick = el('button', 'ct-pick', '<i></i><span><b></b><small></small></span>', card); U.pick.id = 'ctPick';
    U.pickIco = U.pick.querySelector('i'); U.pickName = U.pick.querySelector('b'); U.pickInfo = U.pick.querySelector('small');
    tap(U.pick, () => { if (S.tool === 'place') openSheet('catalog'); });
    U.acts = el('div', 'ct-acts', '', card);
    U.take = el('button', 'ghost', 'Взять', U.acts); U.take.id = 'ctTake'; tap(U.take, take);
    U.drive = el('button', 'ghost', 'За руль', U.acts); U.drive.id = 'ctDrive'; tap(U.drive, () => { const it = S.sel; if (it && it.k.t === 'car') enterPlay(it); });
    const lift = el('div', 'ct-lift', '', card);
    U.lo = el('button', 'ct-b', IC.down, lift); U.lo.id = 'ctLiftDown'; U.lo.setAttribute('aria-label', 'Ниже'); tap(U.lo, () => liftBy(-0.5));
    U.liftV = el('span', '', '0 м', lift);
    U.hi = el('button', 'ct-b', IC.up, lift); U.hi.id = 'ctLiftUp'; U.hi.setAttribute('aria-label', 'Выше'); tap(U.hi, () => liftBy(0.5));
    U.cross = el('div', '', '', root); U.cross.id = 'ctCross';
    // right cluster (HUD buttons, shown only in the 'creative' HUD mode)
    U.bPlace = HUD.addButton({ id: 'bCtPlace', label: 'Поставить', icon: IC.place, modes: ['creative'], right: 0, bottom: 0, big: true, onDown: () => { if (S.sheet) return; if (S.tool === 'place') doPlace(); else doDelete(); } });
    U.bRot = HUD.addButton({ id: 'bCtRot', label: 'Поворот', icon: IC.rot, modes: ['creative'], right: 1.42, bottom: -0.05, onDown: () => rotate(1) });
    U.bUp = HUD.addButton({ id: 'bCtUp', label: 'Вверх', icon: IC.up, modes: ['creative'], right: 0.12, bottom: 1.55, onDown: () => { S.fly.up = true; }, onUp: () => { S.fly.up = false; } });
    U.bDown = HUD.addButton({ id: 'bCtDown', label: 'Вниз', icon: IC.down, modes: ['creative'], right: 1.5, bottom: 1.25, onDown: () => { S.fly.down = true; }, onUp: () => { S.fly.down = false; } });
    U.bPlace.style.borderColor = 'rgba(63,229,239,.55)';
    buildSheets();
    buildPauseWeather();
  }
  function sheet(id, title) {
    const sh = el('div', 'ct-sheet off', '', S.ui.root); sh.id = id;
    const p = el('div', 'panel', '', sh);
    const head = el('div', 'ct-head', '<h2>' + title + '</h2>', p);
    const x = el('button', 'ct-x', '✕', head); x.setAttribute('aria-label', 'Закрыть'); tap(x, closeSheet);
    sh.addEventListener('pointerdown', (e) => { if (e.target === sh) { e.stopPropagation(); closeSheet(); } });
    sh.addEventListener('keydown', (e) => e.stopPropagation());
    return p;
  }
  function chips(parent, list, onPick) {
    const box = el('div', 'chips', '', parent);
    list.forEach(([v, label]) => { const b = el('button', 'chip', label, box); b.type = 'button'; b.dataset.v = String(v); tap(b, () => onPick(v)); });
    return box;
  }
  function buildSheets() {
    const U = S.ui;
    // catalog
    const cp = U.catP = sheet('ctCatalog', 'Каталог');
    U.tabs = chips(cp, CATS, (c) => { U.cat = c; renderCatalog(); });
    U.grid = el('div', 'ct-grid', '', cp);
    if (!isTouch) el('div', 'keys', 'Клавиши: <b>WASD</b> — полёт, <b>Пробел</b>/<b>Shift</b> — вверх/вниз, мышь — обзор, <b>клик</b> — поставить, <b>T</b> — повернуть, <b>[ ]</b> — выше/ниже, <b>Tab</b> — ставить/выбирать, <b>Del</b> — удалить, <b>Ctrl+Z / Ctrl+Y</b> — отмена/повтор, <b>B</b> — играть/строить.', cp);
    U.cat = 'ramps';
    // world
    const wp = sheet('ctWorld', 'Мир');
    let s = el('div', 'set', '<div class="label">Игрок и полиция</div>', wp);
    U.wGod = chips(s, [['god', 'Бессмертие'], ['noPolice', 'Без полиции']], (k) => { S.set[k] = !S.set[k]; applySettings(); });
    s = el('div', 'set', '<div class="label">Время суток<span class="ct-val" id="ctHourV"></span></div>', wp);
    U.hour = el('input', 'slider', undefined, s); Object.assign(U.hour, { type: 'range', min: '0', max: '23.75', step: '0.25' }); U.hour.setAttribute('aria-label', 'Время суток');
    U.hour.addEventListener('input', () => { setHour(parseFloat(U.hour.value) || 0); S.set.hour = DAY.hours; dirty(); syncWorld(); });
    U.hour.addEventListener('pointerdown', (e) => e.stopPropagation());
    U.wFreeze = chips(s, [['freeze', 'Остановить время']], () => { S.set.freeze = !S.set.freeze; applySettings(); });
    s = el('div', 'set', '<div class="label">Погода</div>', wp);
    U.wWx = chips(s, [['auto', 'Авто']].concat(Object.keys(WEATHER_TYPES).map((k) => [k, WEATHER_NAMES[k]])), (k) => { S.set.weather = k; applySettings(); });
    U.wWx.id = 'ctWx';
    s = el('div', 'set', '<div class="label">Машины на улицах</div>', wp);
    U.wTraffic = chips(s, DENS, (v) => { S.set.traffic = v; applySettings(); });
    s = el('div', 'set', '<div class="label">Прохожие</div>', wp);
    U.wPeds = chips(s, DENS, (v) => { S.set.peds = v; applySettings(); });
    s = el('div', 'set', '<div class="label">Скорость игры</div>', wp);
    U.wSpeed = chips(s, SPEEDS, (v) => { S.set.speed = v; applySettings(); });
    // files
    const fp = sheet('ctFiles', 'Постройки');
    const row = el('div', 'row', '', fp);
    U.name = el('input', 'ct-in', undefined, row); U.name.id = 'ctNameIn'; Object.assign(U.name, { type: 'text', maxLength: 28, placeholder: 'Название постройки' }); U.name.setAttribute('aria-label', 'Название постройки');
    U.name.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') saveBuild(U.name.value); });
    U.name.addEventListener('keyup', (e) => e.stopPropagation());
    U.name.addEventListener('pointerdown', (e) => e.stopPropagation());
    const sv = el('button', 'play', 'СОХРАНИТЬ', row); sv.id = 'ctSaveBtn'; tap(sv, () => saveBuild(U.name.value));
    U.list = el('div', 'set', '', fp);
    const r2w = el('div', 'row', '', fp);
    const ex = el('button', 'ghost', 'Пример: трюк-парк', r2w); ex.id = 'ctExampleBtn'; tap(ex, () => { loadItems(exampleBuild(), 'Загружен пример: трюк-парк'); closeSheet(); flyTo(22, 17, -42, 0.5, 0.32); });
    U.clear = el('button', 'ghost', 'Очистить всё', r2w); U.clear.id = 'ctClearBtn';
    U.clearAsk = el('div', 'confirm off', 'Убрать все объекты? Это можно отменить кнопкой ↶.', fp);
    const yes = el('button', 'ghost', 'Да, очистить', U.clearAsk); yes.id = 'ctClearYes';
    const no = el('button', 'ghost', 'Отмена', U.clearAsk);
    tap(U.clear, () => U.clearAsk.classList.remove('off'));
    tap(yes, () => { U.clearAsk.classList.add('off'); clearAll(); closeSheet(); });
    tap(no, () => U.clearAsk.classList.add('off'));
    U.note = el('div', 'keys', '', fp);
  }
  function renderCatalog() {
    const U = S.ui;
    U.tabs.querySelectorAll('.chip').forEach((b) => b.classList.toggle('on', b.dataset.v === U.cat));
    U.grid.innerHTML = '';
    for (const k of KINDS) {
      if (k.cat !== U.cat) continue;
      const b = el('button', 'ct-card' + (S.kind === k ? ' on' : ''), kIcon(k.id) + '<span>' + k.name + '</span>', U.grid);
      b.type = 'button';
      tap(b, () => { S.kind = k; S.carry = null; setTool('place'); closeSheet(); if (AUD.ready) AUD.tone(720, 0.06, 'triangle', 0.05); });
    }
  }
  function renderFiles() {
    const U = S.ui, builds = listBuilds();
    U.list.innerHTML = '<div class="label">Сохранённые постройки</div>';
    if (!builds.length) el('div', 'keys', 'Пока пусто. Дайте постройке имя и нажмите «Сохранить».', U.list);
    builds.forEach((b, i) => {
      const d = new Date(b.t || 0);
      const r = el('div', 'ct-row', '', U.list);
      const info = el('span', '', '', r);
      el('b', '', '', info).textContent = b.name;
      el('small', '', (b.items ? b.items.length : 0) + ' объектов · ' + String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'), info);
      tap(el('button', 'ghost', 'Загрузить', r), () => loadBuild(i));
      const del = el('button', 'ghost', '✕', r); del.setAttribute('aria-label', 'Удалить ' + b.name); tap(del, () => deleteBuild(i));
    });
    U.note.textContent = (S.storeOK ? 'Постройки хранятся в этом браузере. ' : 'Хранилище браузера недоступно — постройки сохранятся только до закрытия страницы. ') + 'Объектов сейчас: ' + S.items.length + ' из ' + MAX_ITEMS + '.';
  }
  function openSheet(id) {
    closeSheet();
    const map = { catalog: 'ctCatalog', world: 'ctWorld', files: 'ctFiles' };
    const sh = $(map[id]); if (!sh) return;
    S.sheet = id; sh.classList.remove('off');
    if (id === 'catalog') { if (S.kind) S.ui.cat = S.kind.cat; renderCatalog(); }
    if (id === 'files') { renderFiles(); S.ui.name.value = ''; S.ui.clearAsk.classList.add('off'); }
    if (id === 'world') syncWorld();
    S.fly.up = S.fly.down = false;
  }
  function closeSheet() {
    for (const id of ['ctCatalog', 'ctWorld', 'ctFiles']) { const s = $(id); if (s) s.classList.add('off'); }
    S.sheet = null;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }
  function syncState() {
    const U = S.ui; if (!U.root) return;
    U.root.classList.toggle('off', !S.on);
    document.body.classList.toggle('ct-on', S.on);
    const b = S.building;
    U.bar.classList.toggle('off', !b); U.card.classList.toggle('off', !b); U.cross.classList.toggle('off', !b);
    U.playBar.classList.toggle('off', b);
    if (!b) closeSheet();
    syncTop(); syncCard(); syncScore();
  }
  function syncTop() {
    const U = S.ui; if (!U.root) return;
    U.tPlace.classList.toggle('on', S.tool === 'place'); U.tSel.classList.toggle('on', S.tool === 'select');
    U.undo.disabled = !S.undo.length; U.redo.disabled = !S.redo.length;
    const del = S.tool === 'select';
    if (U.bPlace) {
      U.bPlace.innerHTML = (del ? IC.trash : IC.place) + '<span>' + (del ? 'Удалить' : 'Поставить') + '</span>';
      U.bPlace.style.borderColor = del ? 'rgba(255,77,94,.6)' : 'rgba(63,229,239,.55)';
    }
  }
  let lastCard = '';
  function syncCard() {
    const U = S.ui; if (!U.root || !S.building) return;
    let key;
    if (S.tool === 'place') {
      const k = S.kind, deg = Math.round(((S.rotOff * 180 / Math.PI) % 360 + 360) % 360);
      key = 'p' + k.id + deg + S.lift;
      if (key === lastCard) return;
      U.pickIco.innerHTML = kIcon(k.id); U.pickName.textContent = k.name; U.pickInfo.textContent = 'КАТАЛОГ ▾ · ' + deg + '°';
      U.acts.classList.add('off'); U.liftV.textContent = '+' + S.lift.toFixed(1) + ' м';
    } else {
      const it = S.sel;
      key = 's' + (it ? it.id + ':' + it.r + ':' + it.lift : '') + (S.lock ? 'L' : '');
      if (key === lastCard) return;
      U.pickIco.innerHTML = it ? kIcon(it.k.id) : IC.select;
      U.pickName.textContent = it ? it.k.name : 'Наведите прицел';
      U.pickInfo.textContent = it ? (S.lock ? 'ВЫБРАНО' : 'ПОД ПРИЦЕЛОМ') + ' · ' + Math.round(((it.r * 180 / Math.PI) % 360 + 360) % 360) + '°' : 'ИЛИ КОСНИТЕСЬ ОБЪЕКТА';
      U.acts.classList.toggle('off', !it);
      U.drive.classList.toggle('off', !(it && it.k.t === 'car'));
      U.liftV.textContent = it ? '+' + (it.lift || 0).toFixed(1) + ' м' : '—';
    }
    lastCard = key;
  }
  function syncScore() { const U = S.ui; if (!U.score) return; U.score.textContent = S.score > 0 ? 'ТРЮКИ ' + S.score.toLocaleString('ru-RU') : ''; }
  function syncWorld() {
    const U = S.ui, s = S.set; if (!U.wGod) return;
    U.wGod.querySelectorAll('.chip').forEach((b) => b.classList.toggle('on', !!s[b.dataset.v]));
    U.wFreeze.querySelector('.chip').classList.toggle('on', !!s.freeze);
    U.hour.value = String(DAY.hours); $('ctHourV').textContent = fmtH(DAY.hours);
    U.wWx.querySelectorAll('.chip').forEach((b) => b.classList.toggle('on', b.dataset.v === s.weather));
    U.wTraffic.querySelectorAll('.chip').forEach((b) => b.classList.toggle('on', parseFloat(b.dataset.v) === s.traffic));
    U.wPeds.querySelectorAll('.chip').forEach((b) => b.classList.toggle('on', parseFloat(b.dataset.v) === s.peds));
    U.wSpeed.querySelectorAll('.chip').forEach((b) => b.classList.toggle('on', parseFloat(b.dataset.v) === s.speed));
    syncPauseWeather();
  }
  function flyTo(x, y, z, yaw, pitch) { const F = S.fly; F.x = x; F.y = y; F.z = z; F.vx = F.vy = F.vz = 0; cam.yaw = yaw; cam.pitch = pitch; }

  // ---------- pause menu: weather row (story and creative) ----------
  function buildPauseWeather() {
    const panel = document.querySelector('#pause .panel'); if (!panel) return;
    const s = el('div', 'set', '<div class="label">Погода</div>');
    const anchor = Array.from(panel.querySelectorAll('.set')).find((e) => e.querySelector('[data-hour]'));
    if (anchor && anchor.nextSibling) panel.insertBefore(s, anchor.nextSibling); else panel.appendChild(s);
    S.ui.pWx = chips(s, [['auto', 'Авто']].concat(Object.keys(WEATHER_TYPES).map((k) => [k, WEATHER_NAMES[k]])), (k) => {
      if (S.on) { S.set.weather = k; applySettings(); return; }
      save.weather = k; writeSave(); applyStoryWeather(false); syncPauseWeather();
    });
    S.ui.pWx.id = 'ctPauseWx';
    syncPauseWeather();
  }
  function syncPauseWeather() {
    const box = S.ui.pWx; if (!box) return;
    const v = S.on ? S.set.weather : (save.weather || 'auto');
    box.querySelectorAll('.chip').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
  }
  function applyStoryWeather(first) {
    const w = save.weather || 'auto';
    ATMO.auto = w === 'auto';
    if (w !== 'auto') ATMO.set(w, first);
    else if (first) { ATMO.set('clear', true); ATMO.nextT = rr(150, 300); }
  }

  // ---------- input: desktop keys and mouse clicks, taps in the select tool ----------
  function initInput() {
    window.addEventListener('keydown', (e) => {
      if (!S.on || GAME.state !== 'play' || e.repeat) return;
      const tg = e.target && e.target.tagName; if (tg === 'INPUT' || tg === 'TEXTAREA') return;
      if (e.code === 'KeyB') { toggleState(); return; }
      if (!S.building) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.code === 'KeyZ') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (ctrl && e.code === 'KeyY') { e.preventDefault(); redo(); return; }
      if (S.sheet) return;
      switch (e.code) {
        case 'KeyT': rotate(e.shiftKey ? -1 : 1); break;
        case 'BracketRight': case 'PageUp': liftBy(0.5); break;
        case 'BracketLeft': case 'PageDown': liftBy(-0.5); break;
        case 'Tab': e.preventDefault(); setTool(S.tool === 'place' ? 'select' : 'place'); break;
        case 'Delete': case 'Backspace': if (S.tool === 'select') doDelete(); break;
        case 'KeyN': openSheet('catalog'); break;
        case 'KeyO': openSheet('world'); break;
        case 'KeyL': openSheet('files'); break;
        default: break;
      }
    });
    const layer = $('touch');
    let down = null;
    layer.addEventListener('pointerdown', (e) => { if (!S.on || !S.building) return; down = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), type: e.pointerType, b: e.button }; });
    layer.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') { hover.on = true; hover.x = e.clientX; hover.y = e.clientY; } });
    layer.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hover.on = false; });
    layer.addEventListener('pointerup', (e) => {
      const d = down; down = null;
      if (!d || d.id !== e.pointerId || !S.on || !S.building || S.sheet) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8 || performance.now() - d.t > 350) return;
      if (S.tool === 'select') {
        screenRay(e.clientX, e.clientY);
        S.lock = pickItem(); lastCard = '';
        if (S.lock && AUD.ready) AUD.tone(820, 0.05, 'triangle', 0.04);
      } else if (d.type === 'mouse' && d.b === 0) doPlace();
    });
  }

  // ---------- per-frame ----------
  function update(dt) {
    if (!S.on) return;
    if (S.building) {
      if (!player.dead || player.root.visible) pinPlayer();
      if (player.mode === 'car' && player.car && typeof exitCar === 'function') { exitCar(); pinPlayer(); }
      if (HUD.mode !== 'creative') HUD.setMode('creative');
    } else {
      if (GAME.cheats.god && player.car && !player.car.wrecked) player.car.health = Math.max(player.car.health, 100);
      updateStunts(dt);
    }
    updateProps(dt);
    solveBodies();
    updateTrafficBlocks();
    for (const it of S.ents) if (it.k.t === 'ped' && it.ent && !it.ent.removed && it.ent.state === 'walk' && it.ent.idleT <= 0 && Math.random() < dt * 0.15) it.ent.idleT = rr(2, 6);
    if (S.saveT > 0) { S.saveT -= dt; if (S.saveT <= 0) autosave(); }
  }
  function lateUpdate() { if (S.on) updateGhost(); }
  const _ringCol = new THREE.Color();
  function visual(dt) {
    if (window.__neon && !window.__neon.CREATIVE) Object.assign(window.__neon, { CREATIVE: api, ATMO, DENSITY, WEATHER_TYPES, getQ: () => Q, SAVE_GUARD, REFL, MATS, windU, wetU });
    if (!S.on) return;
    if (T.boost) T.boost.offset.y = (T.boost.offset.y - dt * 1.6) % 1;
    for (const it of S.rings) {
      if (it.ringT > 0) { it.ringT -= dt; _ringCol.set(it.color).lerp(_white, Math.max(0, it.ringT / 0.8)); it.parts[0].pool.color(it.parts[0].i, _ringCol); if (it.ringT <= 0) { _ringCol.set(it.color); it.parts[0].pool.color(it.parts[0].i, _ringCol); } }
    }
    if (M.lampPool) M.lampPool.mesh.visible = M.lampPool.n > 0 && Q.pools && DAY.night > 0.01;
  }
  function glow(layer) {
    if (!S.on) return;
    const cx = camera.position.x, cz = camera.position.z, n = DAY.night;
    for (const it of S.rings) {
      if (Math.abs(it.x - cx) > 160 || Math.abs(it.z - cz) > 160) continue;
      _ringCol.set(it.color); const k = 0.35 + n * 0.9 + (it.ringT > 0 ? it.ringT : 0), R = it.k.R, cy = it.y + R + 0.9;
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + GAME.time * 0.6; layer.add(it.x + Math.cos(a) * R * it.c, cy + Math.sin(a) * R, it.z - Math.cos(a) * R * it.sn, _ringCol.r * k, _ringCol.g * k, _ringCol.b * k, 1.6); }
    }
    for (const it of S.boosts) { if (Math.abs(it.x - cx) > 120 || Math.abs(it.z - cz) > 120) continue; const k = 0.3 + n * 0.8; layer.add(it.x, it.y + 0.3, it.z, 0.25 * k, 0.9 * k, 1.0 * k, 3.4); }
    if (n > 0.02) for (const it of S.lamps) { const f = it.foot; if (Math.abs(f[0] - cx) > 200 || Math.abs(f[1] - cz) > 200) continue; layer.add(f[0], it.y + 7.75, f[1], n, 0.72 * n, 0.42 * n, 2.6); }
    for (const it of S.props) { const p = it.p; if (p.fuse >= 0 && !p.gone) layer.add(p.x, p.y + 0.6, p.z, 2, 0.8, 0.2, 2); }
  }

  // ---------- lifecycle ----------
  function boot() {
    makeAssets(); makeHelpers(); buildUI(); initInput();
    GROUND_HOOKS.push(creativeGround);
    S.kind = KIND.ramp_m;
  }
  function start(d) {
    if (d.mode !== 'creative') {
      if (S.on) { clearItems(); S.on = false; cam.override = null; SAVE_GUARD.story = null; syncState(); }
      DENSITY.traffic = 1; DENSITY.peds = 1; applyDensity(); GAME.timeScale = 1;
      applyStoryWeather(true); syncPauseWeather();
      return;
    }
    S.on = true;
    SAVE_GUARD.story = { money: save.money, mission: save.mission, tokens: save.tokens.slice(), hours: save.hours };
    const auto = readJSON(AUTO_KEY);
    if (auto && auto.set) Object.assign(S.set, auto.set);
    clearItems(); S.undo.length = 0; S.redo.length = 0;
    const list = auto && Array.isArray(auto.items) ? auto.items : exampleBuild();
    for (const dd of list) addItem(Object.assign({}, dd, { id: dd.id || undefined }));
    const f = auto && auto.fly && isFinite(auto.fly.x) ? auto.fly : { x: 22, y: 17, z: -42, yaw: 0.5, pitch: 0.32 };
    flyTo(f.x, f.y, f.z, f.yaw, f.pitch);
    applySettings(true);
    if (!auto) setTimeout(() => HUD.toast('Пример: трюк-парк. Каталог — внизу, сохранения — сверху'), 900);
    S.building = false;
    enterBuild(true);
    camera.position.set(f.x, f.y, f.z);
    autosave();
  }
  EV.on('start', start);
  EV.on('modeChange', (m) => { if (S.on && S.building && m !== 'creative') HUD.setMode('creative'); });
  EV.on('respawn', () => {
    if (!S.on) return;
    if (S.building) { pinPlayer(); HUD.setMode('creative'); return; }
    const s = S.playStart; if (!s) return;
    player.x = s.x; player.z = s.z; player.y = groundH(s.x, s.z);
  });
  EXT.boot.push(boot);
  EXT.update.push(update);
  EXT.lateUpdate.push(lateUpdate);
  EXT.visual.push(visual);
  EXT.glow.push(glow);

  const api = {
    S, KINDS, KIND, get building() { return S.building; }, get items() { return S.items; },
    enterBuild, enterPlay, toggleState, setTool, undo, redo, rotate, liftBy, clearAll, openSheet, closeSheet,
    selectKind(id) { if (KIND[id]) { S.kind = KIND[id]; S.carry = null; setTool('place'); } },
    place: doPlace, del: doDelete, take,
    // tests and tools: add an item directly ({k, x, z, r, l}); returns the item
    add(d) { const dd = Object.assign({ id: ++S.uid }, d); exec({ op: 'add', items: [dd] }); const it = S.byId.get(dd.id); if (it) Object.assign(dd, serialize(it)); return it; },
    remove(it) { if (it) exec({ op: 'del', items: [serialize(it)] }); },
    select(it) { S.lock = it; lastCard = ''; },
    saveBuild, loadBuild, listBuilds, deleteBuild, loadExample() { loadItems(exampleBuild(), 'Загружен пример: трюк-парк'); },
    setWorld(o) { Object.assign(S.set, o); applySettings(o.hour !== undefined); if (o.hour !== undefined) setHour(o.hour); },
    explode(it) { if (it && it.p) explodeBarrel(it); },
    flyTo, ground: creativeGround, serialize,
  };
  return api;
})();
