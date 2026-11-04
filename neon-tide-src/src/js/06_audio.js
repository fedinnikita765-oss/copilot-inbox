// ============================================================
//  Audio: synthesized engine, effects and an original synthwave radio loop
// ============================================================
const AUD = (() => {
  let ctx = null, master = null, sfx = null, mus = null, ok = false;
  let eng = null, skidG = null, ambG = null, siren = null, noiseBuf = null, horn = null, squealG = null, squeal = null;
  // engine character per car type: cylinders (firing frequency), harmonic mix, drive, filter range, lope, intake noise, turbo
  const ENG = {
    four: { cyl: 4, mix: [0.55, 0.35, 0.22], drive: 2.2, lp: [380, 2600], q: 1.6, lope: 0, noise: 0.05, turbo: 0, vol: 1 },
    sport: { cyl: 6, mix: [0.5, 0.22, 0.42], drive: 2.8, lp: [520, 4200], q: 2.2, lope: 0, noise: 0.07, turbo: 0.35, vol: 1, bov: 0.6 },
    six: { cyl: 6, mix: [0.55, 0.4, 0.2], drive: 2.0, lp: [320, 2100], q: 1.5, lope: 0.05, noise: 0.05, turbo: 0, vol: 1 },
    v8: { cyl: 8, mix: [0.6, 0.5, 0.18], drive: 3.8, lp: [260, 1900], q: 2.6, lope: 0.38, noise: 0.06, turbo: 0, vol: 1.15 },
    diesel: { cyl: 4, mix: [0.45, 0.55, 0.12], drive: 1.6, lp: [220, 1200], q: 1.2, lope: 0.12, noise: 0.16, turbo: 0.2, vol: 1.05, clatter: 1 },
    super: { cyl: 10, mix: [0.42, 0.18, 0.55], drive: 3.2, lp: [700, 6200], q: 2.8, lope: 0, noise: 0.09, turbo: 0.85, vol: 1.05, bov: 1 },
    bus: { cyl: 6, mix: [0.4, 0.6, 0.1], drive: 1.4, lp: [160, 900], q: 1.0, lope: 0.08, noise: 0.2, turbo: 0.3, vol: 1.1, clatter: 1 },
  };
  let engType = null, engP = ENG.four, lastThr = 0, boost = 0, dipT = 0;
  function makeEngine() {
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), o3 = ctx.createOscillator();
    o1.type = 'sawtooth'; o2.type = 'square'; o3.type = 'sawtooth';
    const g1 = ctx.createGain(), g2 = ctx.createGain(), g3 = ctx.createGain();
    const ws = ctx.createWaveShaper(); ws.oversample = '2x';
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; lp.Q.value = 2;
    const am = ctx.createGain(); am.gain.value = 1;
    const lfo = ctx.createOscillator(), lfoG = ctx.createGain(); lfo.type = 'sine'; lfo.frequency.value = 8; lfoG.gain.value = 0;
    lfo.connect(lfoG); lfoG.connect(am.gain);
    const g = ctx.createGain(); g.gain.value = 0;
    o1.connect(g1); o2.connect(g2); o3.connect(g3); g1.connect(ws); g2.connect(ws); g3.connect(ws); ws.connect(lp); lp.connect(am); am.connect(g); g.connect(sfx);
    // intake / diesel clatter noise
    const ns = ctx.createBufferSource(); ns.buffer = noiseBuf; ns.loop = true;
    const nb = ctx.createBiquadFilter(); nb.type = 'bandpass'; nb.frequency.value = 900; nb.Q.value = 0.9;
    const nam = ctx.createGain(); nam.gain.value = 0;
    const ng = ctx.createGain(); ng.gain.value = 0; ns.connect(nb); nb.connect(nam); nam.connect(ng); ng.connect(sfx);
    const clk = ctx.createOscillator(), clkG = ctx.createGain(); clk.type = 'square'; clk.frequency.value = 20; clkG.gain.value = 0.5; clk.connect(clkG); clkG.connect(nam.gain);
    // turbo whistle
    const tb = ctx.createOscillator(), tg = ctx.createGain(); tb.type = 'sine'; tb.frequency.value = 3000; tg.gain.value = 0; tb.connect(tg); tg.connect(sfx);
    [o1, o2, o3, lfo, ns, clk, tb].forEach((o) => o.start());
    return { o1, o2, o3, g1, g2, g3, ws, lp, am, lfo, lfoG, g, nb, ng, nam, clk, clkG, tb, tg };
  }
  function shapeCurve(k) {
    const n = 512, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(x * k) / Math.tanh(k); }
    return c;
  }
  function setEngineType(kind) {
    if (!ok || kind === engType) return;
    engType = kind; engP = ENG[kind] || ENG.four;
    const t = ctx.currentTime;
    eng.g1.gain.setTargetAtTime(engP.mix[0], t, 0.05); eng.g2.gain.setTargetAtTime(engP.mix[1], t, 0.05); eng.g3.gain.setTargetAtTime(engP.mix[2], t, 0.05);
    eng.ws.curve = shapeCurve(engP.drive); eng.lp.Q.value = engP.q;
  }
  const MUS = { on: false, next: 0, step: 0, timer: 0, bpm: 102 };
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const PROG = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
  const BASS = [45, 41, 36, 43];
  const MEL = [];
  { const r = mulberry32(777); const sc = [69, 72, 74, 76, 79, 81, 84]; for (let i = 0; i < 32; i++) MEL.push(r() < 0.5 ? sc[Math.floor(r() * sc.length)] : 0); }

  function init() {
    if (ctx) { resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
    } catch (e) { ctx = null; return; }
    master = ctx.createGain(); master.gain.value = save.sound ? 0.8 : 0; master.connect(ctx.destination);
    sfx = ctx.createGain(); sfx.connect(master);
    mus = ctx.createGain(); mus.gain.value = 0; mus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    eng = makeEngine();
    const sn = ctx.createBufferSource(); sn.buffer = noiseBuf; sn.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 4;
    skidG = ctx.createGain(); skidG.gain.value = 0; sn.connect(bp); bp.connect(skidG); skidG.connect(sfx); sn.start();
    // tyre squeal: two detuned tones with vibrato on top of the hiss
    const sq1 = ctx.createOscillator(), sq2 = ctx.createOscillator(), sqv = ctx.createOscillator(), sqvg = ctx.createGain();
    sq1.type = 'triangle'; sq2.type = 'sine'; sq1.frequency.value = 880; sq2.frequency.value = 1190; sqv.frequency.value = 7.5; sqvg.gain.value = 26;
    sqv.connect(sqvg); sqvg.connect(sq1.frequency); sqvg.connect(sq2.frequency);
    squealG = ctx.createGain(); squealG.gain.value = 0; sq1.connect(squealG); sq2.connect(squealG); squealG.connect(sfx);
    sq1.start(); sq2.start(); sqv.start(); squeal = { a: sq1, b: sq2 };
    const an = ctx.createBufferSource(); an.buffer = noiseBuf; an.loop = true;
    const al = ctx.createBiquadFilter(); al.type = 'lowpass'; al.frequency.value = 420;
    ambG = ctx.createGain(); ambG.gain.value = 0; an.connect(al); al.connect(ambG); ambG.connect(sfx); an.start();
    const so = ctx.createOscillator(); so.type = 'square'; so.frequency.value = 700;
    const sl = ctx.createBiquadFilter(); sl.type = 'lowpass'; sl.frequency.value = 2000;
    const sg = ctx.createGain(); sg.gain.value = 0; so.connect(sl); sl.connect(sg); sg.connect(sfx); so.start();
    siren = { o: so, g: sg };
    ok = true;
  }
  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); }
  function suspend() { if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {}); }
  function setSound(on) { if (ok) master.gain.setTargetAtTime(on ? 0.8 : 0, ctx.currentTime, 0.05); }
  function tone(freq, dur, type, vol, slideTo, delay, dest) {
    if (!ok) return;
    const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(); o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || sfx); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, vol, freq, q, type, delay, dest) {
    if (!ok) return;
    const t = ctx.currentTime + (delay || 0);
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = rr(0.8, 1.2);
    const f = ctx.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq || 1000; f.Q.value = q || 0.8;
    const g = ctx.createGain(); g.gain.setValueAtTime(Math.max(0.0002, vol), t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || sfx); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  // ---- radio ----
  function voice(f, dur, type, vol, t, cutoff, slow) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (slow ? 0.25 : 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); lp.connect(g); g.connect(mus); o.start(t); o.stop(t + dur + 0.05);
    if (slow) { const o2 = ctx.createOscillator(); o2.type = type; o2.frequency.setValueAtTime(f * 1.006, t); o2.connect(lp); o2.start(t); o2.stop(t + dur + 0.05); }
  }
  function schedule() {
    if (!ok || !MUS.on) return;
    const spb = 60 / MUS.bpm / 2;
    if (MUS.next < ctx.currentTime - 0.5) MUS.next = ctx.currentTime + 0.05;
    while (MUS.next < ctx.currentTime + 0.3) {
      const s = MUS.step, bar = Math.floor(s / 8) % 4, t = MUS.next;
      voice(mtof(BASS[bar] + (s % 2 ? 12 : 0)), spb * 0.9, 'sawtooth', 0.07, t, 520);
      if (s % 4 === 0) { const o = ctx.createOscillator(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.22); const g = ctx.createGain(); g.gain.setValueAtTime(0.45, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3); o.connect(g); g.connect(mus); o.start(t); o.stop(t + 0.32); }
      if (s % 8 === 4) noise(0.16, 0.13, 1600, 0.7, 'highpass', t - ctx.currentTime, mus);
      noise(0.035, s % 2 ? 0.018 : 0.03, 7000, 0.7, 'highpass', t - ctx.currentTime, mus);
      if (s % 8 === 0) PROG[bar].forEach((m) => voice(mtof(m), spb * 8, 'triangle', 0.03, t, 1700, true));
      const mn = MEL[s % 32]; if (mn && Math.floor(s / 32) % 2 === 1) voice(mtof(mn), spb * 0.85, 'square', 0.022, t, 2600);
      MUS.next += spb; MUS.step++;
    }
  }
  function music(on) {
    if (!ok) return;
    on = !!(on && save.music && save.sound);
    if (on === MUS.on) return;
    MUS.on = on;
    if (on) { MUS.next = ctx.currentTime + 0.08; mus.gain.setTargetAtTime(0.6, ctx.currentTime, 0.5); if (!MUS.timer) MUS.timer = setInterval(schedule, 70); }
    else { mus.gain.setTargetAtTime(0, ctx.currentTime, 0.25); if (MUS.timer) { clearInterval(MUS.timer); MUS.timer = 0; } }
  }
  return {
    init, resume, suspend, setSound, music, tone, noise,
    get ctx() { return ctx; }, get sfx() { return sfx; },
    get ready() { return ok; },
    // vf, thr, maxV kept for older callers; car (optional) drives rpm, gear and the engine character
    engine(vf, thr, maxV, car) {
      if (!ok) return;
      const t = ctx.currentTime;
      let rpm, rl, idle;
      if (car && car.T) { setEngineType(car.T.engine || 'four'); rpm = car.rpm; rl = car.T.rl; idle = car.T.idle; }
      else { setEngineType('four'); const sp = Math.abs(vf), gl = maxV / 5, gear = Math.min(4, Math.floor(sp / gl)); rl = 6400; idle = 750; rpm = idle + ((sp - gear * gl) / gl) * (rl - idle); }
      const P = engP, k = clamp((rpm - idle) / (rl - idle), 0, 1.05);
      const f0 = rpm / 60 * P.cyl / 2, f = clamp(f0, 18, 900);
      const dip = dipT > t ? 0.55 : 1;
      eng.o1.frequency.setTargetAtTime(f, t, 0.03); eng.o2.frequency.setTargetAtTime(f * 0.5, t, 0.03); eng.o3.frequency.setTargetAtTime(f * (P.cyl >= 8 ? 1.5 : 2) * 1.004, t, 0.03);
      eng.lp.frequency.setTargetAtTime(P.lp[0] + (P.lp[1] - P.lp[0]) * (0.25 * k + 0.75 * k * (0.35 + 0.65 * thr)), t, 0.05);
      eng.lfo.frequency.setTargetAtTime(Math.max(3, f0 / P.cyl), t, 0.05);
      eng.lfoG.gain.setTargetAtTime(P.lope * (1 - k * 0.7), t, 0.05);
      eng.g.gain.setTargetAtTime((0.035 + thr * 0.05 + k * 0.03) * P.vol * dip, t, dipT > t ? 0.02 : 0.08);
      eng.nb.frequency.setTargetAtTime(P.clatter ? 1800 + k * 1200 : 500 + k * 1600, t, 0.05);
      eng.clk.frequency.setTargetAtTime(Math.max(4, f0), t, 0.05); eng.clkG.gain.setTargetAtTime(P.clatter ? 0.9 : 0.15, t, 0.1);
      eng.ng.gain.setTargetAtTime(P.noise * (0.25 + thr * 0.75) * (0.4 + k) * 0.2, t, 0.08);
      // turbo spool and blow-off when lifting off at high boost
      boost = damp(boost, P.turbo * thr * clamp(k * 1.3 - 0.2, 0, 1), thr > 0.1 ? 2.5 : 8, 1 / 30);
      eng.tb.frequency.setTargetAtTime(2200 + boost * 3800, t, 0.06); eng.tg.gain.setTargetAtTime(boost * 0.012, t, 0.05);
      if (P.bov && lastThr > 0.7 && thr < 0.2 && k > 0.45) noise(0.32, 0.07 * P.bov, 2600, 1.6, 'bandpass');
      lastThr = thr;
    },
    engineOff() { if (ok) { const t = ctx.currentTime; eng.g.gain.setTargetAtTime(0, t, 0.15); eng.ng.gain.setTargetAtTime(0, t, 0.1); eng.tg.gain.setTargetAtTime(0, t, 0.1); boost = 0; } },
    // gear change: brief volume dip; sporty engines hiss or crackle on upshift
    shift(dir, car) {
      if (!ok || dir <= 0) return;
      dipT = ctx.currentTime + 0.12;
      if (engP.bov) noise(0.12, 0.05, 3000, 1.2, 'bandpass');
      if (engP.cyl >= 8 && car && car.throttle > 0.7) { noise(0.05, 0.08, 700, 1, 'bandpass', 0.03); noise(0.04, 0.06, 900, 1, 'bandpass', 0.09); }
    },
    skid(v) {
      if (!ok) return;
      const t = ctx.currentTime;
      skidG.gain.setTargetAtTime(v * 0.065, t, 0.05);
      squealG.gain.setTargetAtTime(v > 0.15 ? (v - 0.15) * 0.035 : 0, t, 0.06);
      squeal.a.frequency.setTargetAtTime(760 + v * 260, t, 0.1); squeal.b.frequency.setTargetAtTime(1040 + v * 320, t, 0.1);
    },
    // suspension thump on a curb / bump (v 0..1) and landing after a jump (impact speed, m/s)
    bump(v) { tone(68, 0.14, 'sine', 0.08 + v * 0.2, 42); noise(0.08, 0.04 + v * 0.08, 380); },
    land(imp) {
      const v = clamp(imp / 14, 0.05, 1);
      tone(58, 0.3, 'sine', 0.18 + v * 0.35, 32); noise(0.22, 0.08 + v * 0.22, 300);
      if (imp > 7) { noise(0.25, v * 0.18, 1400, 1.2, 'bandpass', 0.02); tone(rr(300, 500), 0.2, 'triangle', v * 0.05, rr(150, 250), 0.03); }
    },
    ambience(v) { if (ok) ambG.gain.setTargetAtTime(v, ctx.currentTime, 0.5); },
    siren(d, t) {
      if (!ok) return;
      const v = d < 0 ? 0 : clamp(1 - d / 170, 0, 1) * 0.045;
      siren.g.gain.setTargetAtTime(v, ctx.currentTime, 0.1);
      siren.o.frequency.setTargetAtTime(760 + 300 * Math.sin(t * 2.4), ctx.currentTime, 0.03);
    },
    horn(on) {
      if (!ok) return;
      if (on && !horn) {
        const g = ctx.createGain(); g.gain.value = 0.06; g.connect(sfx);
        const a = ctx.createOscillator(), b = ctx.createOscillator(); a.type = b.type = 'square'; a.frequency.value = 349; b.frequency.value = 440;
        const lp = ctx.createBiquadFilter(); lp.frequency.value = 1500; a.connect(lp); b.connect(lp); lp.connect(g); a.start(); b.start();
        horn = { a, b, g };
      } else if (!on && horn) { const h = horn; horn = null; h.g.gain.setTargetAtTime(0, ctx.currentTime, 0.03); h.a.stop(ctx.currentTime + 0.15); h.b.stop(ctx.currentTime + 0.15); }
    },
    // layered crash: body thump, metal crunch with random resonances, glass tinkle for big hits
    crash(sp) {
      const v = clamp(sp / 25, 0.05, 0.6);
      noise(0.3 + v * 0.3, v, rr(700, 1100), 0.6); tone(rr(70, 100), 0.25, 'sine', clamp(sp / 40, 0.05, 0.3), 38);
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) noise(rr(0.08, 0.22), v * rr(0.3, 0.6), rr(400, 2600), rr(2, 6), 'bandpass', i * rr(0.02, 0.06));
      for (let i = 0; i < 2; i++) tone(rr(180, 620), rr(0.15, 0.4), 'square', v * 0.025, rr(90, 200), rr(0, 0.05));
      if (sp > 14) for (let i = 0; i < 5; i++) tone(rr(2600, 5200), rr(0.06, 0.16), 'sine', 0.025 * v, null, 0.05 + i * rr(0.02, 0.05));
    },
    thud(v) { tone(110, 0.18, 'sine', 0.25 * v + 0.05, 50); noise(0.1, 0.1 * v + 0.03, 500); },
    punch() { tone(140, 0.12, 'sine', 0.35, 60); noise(0.08, 0.15, 1200); },
    whoosh() { noise(0.14, 0.06, 2500, 1.2, 'bandpass'); },
    jump() { tone(220, 0.12, 'triangle', 0.06, 330); },
    step(sp) { noise(0.05, sp > 4 ? 0.05 : 0.025, 900, 1, 'bandpass'); },
    door() { tone(180, 0.06, 'square', 0.06, 120); noise(0.06, 0.08, 700); },
    coin() { tone(1046, 0.09, 'square', 0.05); tone(1568, 0.14, 'square', 0.05, null, 0.07); },
    chime() { [784, 988, 1175].forEach((f, i) => tone(f, 0.25, 'triangle', 0.08, null, i * 0.08)); },
    win() { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, 0.3, 'square', 0.05, null, i * 0.11)); },
    fail() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.05, null, i * 0.16)); },
    beep(hi) { tone(hi ? 1320 : 660, 0.16, 'square', 0.07); },
    sms() { tone(1760, 0.07, 'sine', 0.08); tone(2349, 0.1, 'sine', 0.08, null, 0.09); },
    alarm() { tone(880, 0.14, 'square', 0.05); tone(660, 0.14, 'square', 0.05, null, 0.15); },
    boom(d) { const v = clamp(1 - d / 200, 0.05, 1); noise(1.4, 0.6 * v, 400); tone(70, 0.9, 'sine', 0.5 * v, 30); },
  };
})();
