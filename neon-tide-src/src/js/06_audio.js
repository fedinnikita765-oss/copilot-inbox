// ============================================================
//  Audio: synthesized engine, effects and an original synthwave radio loop
// ============================================================
const AUD = (() => {
  let ctx = null, master = null, sfx = null, mus = null, ok = false;
  let eng = null, skidG = null, ambG = null, siren = null, noiseBuf = null, horn = null;
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
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
    const o2 = ctx.createOscillator(); o2.type = 'square';
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; lp.Q.value = 2.5;
    const eg = ctx.createGain(); eg.gain.value = 0;
    o1.connect(lp); o2.connect(lp); lp.connect(eg); eg.connect(sfx); o1.start(); o2.start();
    eng = { o1, o2, lp, g: eg };
    const sn = ctx.createBufferSource(); sn.buffer = noiseBuf; sn.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 4;
    skidG = ctx.createGain(); skidG.gain.value = 0; sn.connect(bp); bp.connect(skidG); skidG.connect(sfx); sn.start();
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
    engine(vf, thr, maxV) {
      if (!ok) return;
      const t = ctx.currentTime, sp = Math.abs(vf), gl = maxV / 5, gear = Math.min(4, Math.floor(sp / gl)), frac = (sp - gear * gl) / gl;
      const rpm = 0.22 + frac * 0.78, f = 40 + rpm * 72 + gear * 7;
      eng.o1.frequency.setTargetAtTime(f, t, 0.05); eng.o2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
      eng.lp.frequency.setTargetAtTime(320 + thr * 900 + rpm * 500, t, 0.08);
      eng.g.gain.setTargetAtTime(0.045 + thr * 0.055 + rpm * 0.02, t, 0.1);
    },
    engineOff() { if (ok) eng.g.gain.setTargetAtTime(0, ctx.currentTime, 0.15); },
    skid(v) { if (ok) skidG.gain.setTargetAtTime(v * 0.07, ctx.currentTime, 0.05); },
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
    crash(sp) { noise(0.35, clamp(sp / 25, 0.05, 0.5), 900, 0.6); tone(90, 0.25, 'sine', clamp(sp / 40, 0.05, 0.3), 40); },
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
