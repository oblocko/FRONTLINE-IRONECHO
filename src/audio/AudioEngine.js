// Procedural audio engine (Web Audio API). Every sound is synthesised at
// runtime: weapons, explosions, footsteps, vehicles, rotors, radio, ambience
// and an adaptive score. Features:
//  - Buses: music / sfx / ambience / dialogue -> master -> limiter
//  - Priority + ducking: dialogue ducks music & sfx; voice-limited sfx pool
//  - HRTF 3D panning for positional sources, distance attenuation
//  - Indoor/outdoor acoustic switch (convolution reverb send vs. outdoor slapback)
import { settings } from '../core/Settings.js';
import { events } from '../core/Events.js';

const MAX_VOICES = 48;

export class AudioEngine {
  constructor() {
    this.ctx = null; this.ready = false; this.voices = 0; this.indoor = 0;
    this.loops = new Set();
    this.musicState = 'silent'; this.musicIntensity = 0;
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -8; this.limiter.knee.value = 6; this.limiter.ratio.value = 12; this.limiter.attack.value = 0.002; this.limiter.release.value = 0.2;
    this.master.connect(this.limiter).connect(ctx.destination);
    const bus = () => { const g = ctx.createGain(); g.connect(this.master); return g; };
    this.musicBus = bus(); this.sfxBus = bus(); this.ambBus = bus(); this.dlgBus = bus();
    this.duckMusic = ctx.createGain(); this.duckMusic.connect(this.musicBus);
    this.duckSfx = ctx.createGain(); this.duckSfx.connect(this.sfxBus);
    this.duckAmb = ctx.createGain(); this.duckAmb.connect(this.ambBus);
    // reverb send
    this.reverb = ctx.createConvolver(); this.reverb.buffer = this.makeIR(2.2, 2.5);
    this.reverbSend = ctx.createGain(); this.reverbSend.gain.value = 0.0;
    this.reverbSend.connect(this.reverb).connect(this.duckSfx);
    // outdoor slapback echo
    this.echo = ctx.createDelay(1.0); this.echo.delayTime.value = 0.32;
    this.echoFb = ctx.createGain(); this.echoFb.gain.value = 0.28;
    this.echoLP = ctx.createBiquadFilter(); this.echoLP.type = 'lowpass'; this.echoLP.frequency.value = 1400;
    this.echoSend = ctx.createGain(); this.echoSend.gain.value = 0.35;
    this.echoSend.connect(this.echo); this.echo.connect(this.echoLP).connect(this.echoFb).connect(this.echo); this.echoLP.connect(this.duckSfx);

    this.noise = this.makeNoise(2, 'white'); this.brown = this.makeNoise(4, 'brown');
    this.applyVolumes();
    events.on('settings:changed', () => this.applyVolumes());
    this.ready = true;
    this.startMusicEngine();
  }
  applyVolumes() {
    if (!this.ctx) return;
    const a = settings.data.audio; const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(a.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(a.music * 0.55, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(a.sfx, t, 0.05);
    this.ambBus.gain.setTargetAtTime(a.sfx * 0.8, t, 0.05);
    this.dlgBus.gain.setTargetAtTime(a.dialogue, t, 0.05);
  }
  makeNoise(sec, kind) {
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * sec, this.ctx.sampleRate); const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return b;
  }
  makeIR(sec, decay) {
    const rate = this.ctx.sampleRate, len = rate * sec, b = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return b;
  }

  // ---------- spatial ----------
  updateListener(camera) {
    if (!this.ctx) return;
    const l = this.ctx.listener; const p = camera.getWorldPosition(this._v || (this._v = camera.position.clone()));
    const f = camera.getWorldDirection(this._f || (this._f = camera.position.clone()));
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(p.x, t, 0.02); l.positionY.setTargetAtTime(p.y, t, 0.02); l.positionZ.setTargetAtTime(p.z, t, 0.02);
      l.forwardX.setTargetAtTime(f.x, t, 0.02); l.forwardY.setTargetAtTime(f.y, t, 0.02); l.forwardZ.setTargetAtTime(f.z, t, 0.02);
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else { l.setPosition(p.x, p.y, p.z); l.setOrientation(f.x, f.y, f.z, 0, 1, 0); }
    this.listenerPos = p;
  }
  panner(pos, ref = 4, rolloff = 1.2, max = 800) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = rolloff; p.maxDistance = max;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
    return p;
  }
  setIndoor(v) {
    if (!this.ctx || this.indoor === v) return; this.indoor = v; const t = this.ctx.currentTime;
    this.reverbSend.gain.setTargetAtTime(v ? 0.45 : 0.0, t, 0.3);
    this.echoSend.gain.setTargetAtTime(v ? 0.05 : 0.35, t, 0.3);
    if (this.windGain) this.windGain.gain.setTargetAtTime(v ? 0.02 : this.windLevel, t, 0.5);
  }
  // returns output node routing a source: optional panner, then sfx bus + sends
  route(node, pos, opts = {}) {
    let out = node;
    if (pos) { const p = this.panner(pos, opts.ref ?? 4, opts.rolloff ?? 1.2); out.connect(p); out = p; }
    const bus = opts.bus === 'amb' ? this.duckAmb : opts.bus === 'dlg' ? this.dlgBus : this.duckSfx;
    out.connect(bus);
    if (opts.wet !== false && opts.bus !== 'dlg') { out.connect(this.reverbSend); if (opts.echo !== false) out.connect(this.echoSend); }
    return out;
  }
  canPlay(priority = 1) {
    if (!this.ready) return false;
    if (this.voices >= MAX_VOICES && priority < 2) return false;
    return true;
  }
  track(src, dur) { this.voices++; setTimeout(() => this.voices--, (dur + 0.1) * 1000); src.onended = null; }

  noiseSrc(buf = this.noise) { const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.loopStart = Math.random(); return s; }
  env(g, t, a, peak, d, end = 0.0001) {
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(end, t + a + d);
  }

  // ---------- weapons ----------
  shot(pos, { kind = 'rifle', enemy = false, suppressed = false } = {}) {
    if (!this.canPlay(enemy ? 1 : 2)) return;
    const c = this.ctx, t = c.currentTime;
    const dist = pos && this.listenerPos ? this.listenerPos.distanceTo(pos) : 0;
    const far = Math.min(1, dist / 120);
    const dur = 0.5 + far * 0.8;
    const n = this.noiseSrc(); const bp = c.createBiquadFilter(); bp.type = 'lowpass';
    bp.frequency.setValueAtTime((kind === 'pistol' ? 5000 : 7000) * (1 - far * 0.85), t);
    bp.frequency.exponentialRampToValueAtTime(400, t + 0.25);
    const g = c.createGain(); this.env(g, t, 0.002, (kind === 'pistol' ? 0.7 : 1.0) * (suppressed ? 0.2 : 1), 0.18 + far * 0.4);
    n.connect(bp).connect(g);
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(kind === 'pistol' ? 140 : 110, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    const og = c.createGain(); this.env(og, t, 0.002, 0.9 * (1 - far * 0.5), 0.16);
    o.connect(og);
    const mix = c.createGain(); mix.gain.value = enemy ? 0.75 : 0.6; g.connect(mix); og.connect(mix);
    this.route(mix, pos, { ref: 6, rolloff: 0.9 });
    n.start(t, Math.random()); n.stop(t + dur); o.start(t); o.stop(t + 0.25); this.track(n, dur);
    // mechanical click for player
    if (!pos) this.click(0.06, 2200, 0.02);
  }
  click(gain = 0.2, freq = 3000, dur = 0.015, when = 0) {
    if (!this.ready) return; const c = this.ctx, t = c.currentTime + when;
    const n = this.noiseSrc(); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 4;
    const g = c.createGain(); this.env(g, t, 0.001, gain, dur); n.connect(f).connect(g); this.route(g, null, { wet: false });
    n.start(t, Math.random()); n.stop(t + dur + 0.05);
  }
  reload(kind = 'rifle', dur = 2.2) {
    // magazine out, pouch, mag in, charging handle
    const k = dur / 2.2;
    this.click(0.25, 1800, 0.03, 0.25 * k); this.click(0.12, 900, 0.06, 0.4 * k);
    this.click(0.15, 700, 0.08, 0.9 * k); this.click(0.35, 2400, 0.03, 1.35 * k); this.click(0.2, 1200, 0.04, 1.4 * k);
    if (kind === 'rifle') { this.click(0.3, 3000, 0.02, 1.8 * k); this.click(0.3, 2000, 0.03, 1.9 * k); }
  }
  dryFire() { this.click(0.25, 3500, 0.01); }
  switchWeapon() { this.click(0.15, 1000, 0.05); this.click(0.2, 2500, 0.02, 0.18); }
  hitMarker(kill = false) {
    if (!this.ready) return; const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = kill ? 1400 : 2200;
    const g = c.createGain(); this.env(g, t, 0.001, kill ? 0.12 : 0.07, 0.06); o.connect(g); this.route(g, null, { wet: false });
    o.start(t); o.stop(t + 0.1);
  }
  bulletImpact(pos, surface = 'concrete') {
    if (!this.canPlay(0)) return; const c = this.ctx, t = c.currentTime;
    const n = this.noiseSrc(); const f = c.createBiquadFilter(); f.type = 'bandpass';
    f.frequency.value = { metal: 3500, concrete: 2200, dirt: 600, snow: 400, wood: 1200, flesh: 500 }[surface] || 1500; f.Q.value = 1.5;
    const g = c.createGain(); this.env(g, t, 0.001, 0.35, 0.08); n.connect(f).connect(g); this.route(g, pos, { ref: 2, rolloff: 1.5, echo: false });
    n.start(t, Math.random()); n.stop(t + 0.15); this.track(n, 0.15);
    if (surface === 'metal' || (surface === 'concrete' && Math.random() < 0.25)) {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(3000 + Math.random() * 2000, t); o.frequency.exponentialRampToValueAtTime(900, t + 0.35);
      const og = c.createGain(); this.env(og, t, 0.002, 0.06, 0.35); o.connect(og); this.route(og, pos, { ref: 3 }); o.start(t); o.stop(t + 0.4);
    }
  }
  whiz(pos) { // near-miss crack
    if (!this.canPlay(1)) return; const c = this.ctx, t = c.currentTime;
    const n = this.noiseSrc(); const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2500;
    const g = c.createGain(); this.env(g, t, 0.003, 0.4, 0.07); n.connect(f).connect(g); this.route(g, pos, { ref: 1, wet: false });
    n.start(t, Math.random()); n.stop(t + 0.1);
  }
  explosion(pos, scale = 1, { ring = true } = {}) {
    if (!this.ready) return; const c = this.ctx, t = c.currentTime;
    const dist = pos && this.listenerPos ? this.listenerPos.distanceTo(pos) : 0;
    const delay = Math.min(1.5, dist / 343); const t0 = t + delay;
    const n = this.noiseSrc(this.brown); const lp = c.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3000 / (1 + dist / 80), t0); lp.frequency.exponentialRampToValueAtTime(120, t0 + 2.5);
    const g = c.createGain(); this.env(g, t0, 0.005, 1.6 * scale, 2.8);
    n.connect(lp).connect(g);
    const crack = this.noiseSrc(); const cf = c.createBiquadFilter(); cf.type = 'lowpass'; cf.frequency.value = 5000 / (1 + dist / 40);
    const cg = c.createGain(); this.env(cg, t0, 0.001, 0.9 * scale, 0.25); crack.connect(cf).connect(cg);
    const o = c.createOscillator(); o.frequency.setValueAtTime(60, t0); o.frequency.exponentialRampToValueAtTime(25, t0 + 1.2);
    const og = c.createGain(); this.env(og, t0, 0.01, 1.4 * scale, 1.4); o.connect(og);
    const mix = c.createGain(); g.connect(mix); cg.connect(mix); og.connect(mix);
    this.route(mix, pos, { ref: 15, rolloff: 0.6 });
    n.start(t0, Math.random()); n.stop(t0 + 3.5); crack.start(t0, Math.random()); crack.stop(t0 + 0.4); o.start(t0); o.stop(t0 + 1.6);
    this.track(n, 3.5 + delay);
    if (ring && dist < 25) this.tinnitus((1 - dist / 25) * Math.min(1, scale));   // ear ringing only from real blasts, scaled by their size
  }
  tinnitus(amount) {
    if (!this.ready || amount < 0.3) return; const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.frequency.value = 3800 + Math.random() * 400;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.04 * amount, t + 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 3.6);
    // muffle world briefly
    this.duckSfx.gain.cancelScheduledValues(t); this.duckSfx.gain.setValueAtTime(0.25, t); this.duckSfx.gain.setTargetAtTime(1, t + 0.5, 1.2);
  }
  distantArtillery() {
    if (!this.ready) return; const c = this.ctx, t = c.currentTime + Math.random() * 0.3;
    const n = this.noiseSrc(this.brown); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160 + Math.random() * 120;
    const g = c.createGain(); this.env(g, t, 0.05, 0.5 + Math.random() * 0.4, 2.5 + Math.random() * 2);
    n.connect(lp).connect(g); this.route(g, null, { bus: 'amb', echo: true });
    n.start(t, Math.random()); n.stop(t + 5);
  }
  footstep(surface = 'dirt', loud = 1, pos = null) {
    if (!this.canPlay(pos ? 0 : 1)) return; const c = this.ctx, t = c.currentTime;
    const n = this.noiseSrc(); const f = c.createBiquadFilter();
    const cfg = { dirt: [700, 1.2, 0.09], snow: [1800, 0.7, 0.14], concrete: [1800, 2, 0.05], metal: [2600, 6, 0.08], wood: [900, 3, 0.07], gravel: [2500, 0.8, 0.1] }[surface] || [900, 1, 0.08];
    f.type = 'bandpass'; f.frequency.value = cfg[0] * (0.85 + Math.random() * 0.3); f.Q.value = cfg[1];
    const g = c.createGain(); this.env(g, t, 0.005, 0.22 * loud, cfg[2]);
    n.connect(f).connect(g); this.route(g, pos, { ref: 2, rolloff: 2, echo: false });
    n.start(t, Math.random()); n.stop(t + 0.2);
  }
  playerHurt() {
    if (!this.ready) return; const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.2);
    const g = c.createGain(); this.env(g, t, 0.003, 0.5, 0.25); o.connect(g); this.route(g, null, { wet: false }); o.start(t); o.stop(t + 0.3);
  }
  heartbeat(rate) {
    if (!this.ready) return; const c = this.ctx, t = c.currentTime;
    for (const d of [0, 0.18]) {
      const o = c.createOscillator(); o.frequency.value = 55; const g = c.createGain(); this.env(g, t + d, 0.01, 0.35 * rate, 0.15);
      o.connect(g).connect(this.master); o.start(t + d); o.stop(t + d + 0.2);
    }
  }
  // death: world sound sinks under a ringing tone and a slowing heartbeat
  deathSequence() {
    if (!this.ready) return; const c = this.ctx, t = c.currentTime;
    this.duckSfx.gain.cancelScheduledValues(t); this.duckSfx.gain.setTargetAtTime(0.08, t, 0.5);
    this.duckAmb.gain.cancelScheduledValues(t); this.duckAmb.gain.setTargetAtTime(0.25, t, 0.8);
    this.duckMusic.gain.cancelScheduledValues(t); this.duckMusic.gain.setTargetAtTime(0.15, t, 0.6);
    const o = c.createOscillator(); o.frequency.value = 3400; const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.03, t + 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + 5);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 5.1);
    [0.4, 1.5, 2.9, 4.6].forEach((d, i) => setTimeout(() => this.heartbeat(0.9 - i * 0.2), d * 1000));
  }
  recover() {
    if (!this.ready) return; const t = this.ctx.currentTime;
    for (const g of [this.duckSfx, this.duckAmb, this.duckMusic]) { g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(1, t, 0.3); }
  }
  ui(kind = 'hover') {
    if (!this.ready) return; const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'square';
    const f = { hover: 1800, select: 900, back: 600, objective: 660, complete: 520, checkpoint: 1100, error: 220 }[kind] || 1000;
    o.frequency.setValueAtTime(f, t);
    if (kind === 'objective') o.frequency.setValueAtTime(990, t + 0.09);
    if (kind === 'complete') { o.frequency.setValueAtTime(660, t + 0.12); o.frequency.setValueAtTime(880, t + 0.24); }
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000;
    const g = c.createGain(); const len = kind === 'hover' ? 0.03 : kind === 'complete' ? 0.5 : 0.2;
    this.env(g, t, 0.002, kind === 'hover' ? 0.03 : 0.07, len);
    o.connect(lp).connect(g).connect(this.master); o.start(t); o.stop(t + len + 0.05);
  }
  // radio squelch + static bed during transmissions
  radio(on, dur = 0) {
    if (!this.ready) return; const c = this.ctx, t = c.currentTime;
    const n = this.noiseSrc(); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 0.8;
    const g = c.createGain(); this.env(g, t, 0.003, on ? 0.18 : 0.14, 0.12); n.connect(f).connect(g).connect(this.dlgBus); n.start(t, Math.random()); n.stop(t + 0.2);
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = on ? 1250 : 950; const og = c.createGain(); this.env(og, t + 0.02, 0.002, 0.05, 0.08);
    o.connect(og).connect(this.dlgBus); o.start(t); o.stop(t + 0.15);
    if (on && dur > 0) {
      const s = this.noiseSrc(); const sf = c.createBiquadFilter(); sf.type = 'bandpass'; sf.frequency.value = 3000; sf.Q.value = 0.5;
      const sg = c.createGain(); sg.gain.setValueAtTime(0.0001, t); sg.gain.exponentialRampToValueAtTime(0.025, t + 0.1); sg.gain.setValueAtTime(0.025, t + dur); sg.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.1);
      s.connect(sf).connect(sg).connect(this.dlgBus); s.start(t, Math.random()); s.stop(t + dur + 0.2);
    }
  }
  // speech presence: a soft formant murmur under subtitles so lines don't feel silent
  // (no recorded voice acting exists in this build — subtitles carry the dialogue)
  // recorded dialogue (assets/voice/<id>.mp3): decoded once, played on the dialogue bus (radio lines
  // band-limited). Returns the clip length in seconds, or 0 if the file is missing.
  async loadVoice(id) {
    this.voices ||= new Map(); if (this.voices.has(id)) return this.voices.get(id);
    const pr = (async () => { try { const r = await fetch(new URL(`assets/voice/${id}.mp3`, document.baseURI)); if (!r.ok) return null; const buf = await r.arrayBuffer(); return await this.ctx.decodeAudioData(buf); } catch { return null; } })();
    this.voices.set(id, pr); return pr;
  }
  async playVoice(id, radio = false) {
    if (!this.ready) return 0; const buf = await this.loadVoice(id); if (!buf) return 0;
    const c = this.ctx; const src = c.createBufferSource(); src.buffer = buf; const g = c.createGain(); g.gain.value = 1.0;
    if (radio) { const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 400; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200; src.connect(hp).connect(lp).connect(g); } else src.connect(g);
    g.connect(this.dlgBus); src.start(); this.voiceSrc = src; return buf.duration;
  }
  stopVoice() { try { this.voiceSrc?.stop(); } catch {} this.voiceSrc = null; }
  voiceMurmur(dur, pitch = 1, radio = false) {
    if (!this.ready) return; const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 110 * pitch;
    const lfo = c.createOscillator(); lfo.frequency.value = 5.5; const lg = c.createGain(); lg.gain.value = 25 * pitch; lfo.connect(lg).connect(o.frequency);
    const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 700; f1.Q.value = 5;
    const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1500; f2.Q.value = 6;
    const am = c.createGain(); am.gain.value = 0;
    // syllable envelope
    let tt = t; while (tt < t + dur) { const sl = 0.09 + Math.random() * 0.12; am.gain.setValueAtTime(0.0001, tt); am.gain.linearRampToValueAtTime(0.5 + Math.random() * 0.5, tt + sl * 0.3); am.gain.linearRampToValueAtTime(0.05, tt + sl); tt += sl + (Math.random() < 0.15 ? 0.15 : 0.02); }
    am.gain.setValueAtTime(0, tt);
    const g = c.createGain(); g.gain.value = radio ? 0.05 : 0.04;
    o.connect(f1).connect(am); o.connect(f2).connect(am); am.connect(g);
    if (radio) { const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500; g.connect(hp).connect(this.dlgBus); } else g.connect(this.dlgBus);
    o.start(t); lfo.start(t); o.stop(tt + 0.1); lfo.stop(tt + 0.1);
  }
  duck(on) {
    if (!this.ready) return; const t = this.ctx.currentTime;
    this.duckMusic.gain.setTargetAtTime(on ? 0.4 : 1, t, 0.25);
    this.duckAmb.gain.setTargetAtTime(on ? 0.6 : 1, t, 0.25);
  }

  // ---------- loops: ambience / vehicles ----------
  startWind(level = 0.08) {
    if (!this.ready) return; this.stopWind();
    const c = this.ctx; const n = this.noiseSrc(this.brown); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 400; f.Q.value = 0.6;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.13; const lg = c.createGain(); lg.gain.value = 250; lfo.connect(lg).connect(f.frequency);
    this.windLevel = level; this.windGain = c.createGain(); this.windGain.gain.value = level;
    n.connect(f).connect(this.windGain).connect(this.duckAmb); n.start(); lfo.start();
    this.wind = { n, lfo };
  }
  stopWind() { if (this.wind) { try { this.wind.n.stop(); this.wind.lfo.stop(); } catch {} this.wind = null; } }
  engineLoop(kind = 'truck') {
    if (!this.ready) return null; const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = kind === 'apc' ? 38 : 45;
    const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.value = (kind === 'apc' ? 38 : 45) * 0.5;
    const n = this.noiseSrc(this.brown);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
    const g = c.createGain(); g.gain.value = 0;
    const og2 = c.createGain(); og2.gain.value = 0.5;
    o.connect(lp); o2.connect(og2).connect(lp); n.connect(lp); lp.connect(g);
    const p = this.panner({ x: 0, y: 0, z: 0 }, 6, 1);
    g.connect(p).connect(this.duckSfx); p.connect(this.reverbSend);
    o.start(); o2.start(); n.start();
    const h = { kind, o, o2, n, lp, g, p, setPos: (v) => { if (p.positionX) { p.positionX.value = v.x; p.positionY.value = v.y; p.positionZ.value = v.z; } },
      set: (rpm, vol) => { const t = c.currentTime; const base = (kind === 'apc' ? 38 : 45) * (0.8 + rpm * 1.2); o.frequency.setTargetAtTime(base, t, 0.2); o2.frequency.setTargetAtTime(base * 0.5, t, 0.2); lp.frequency.setTargetAtTime(220 + rpm * 500, t, 0.2); g.gain.setTargetAtTime(vol, t, 0.3); },
      stop: () => { try { o.stop(); o2.stop(); n.stop(); } catch {} this.loops.delete(h); } };
    if (kind === 'apc') { // track clatter
      const tn = this.noiseSrc(); const tf = c.createBiquadFilter(); tf.type = 'bandpass'; tf.frequency.value = 2400; tf.Q.value = 3;
      const tg = c.createGain(); tg.gain.value = 0; const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 9; const lg = c.createGain(); lg.gain.value = 0.15;
      lfo.connect(lg).connect(tg.gain); tn.connect(tf).connect(tg).connect(g); tn.start(); lfo.start();
      const s0 = h.stop; h.stop = () => { try { tn.stop(); lfo.stop(); } catch {} s0(); };
    }
    this.loops.add(h); return h;
  }
  rotorLoop() {
    if (!this.ready) return null; const c = this.ctx;
    const n = this.noiseSrc(this.brown); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    const am = c.createGain(); am.gain.value = 0.3;
    const lfo = c.createOscillator(); lfo.type = 'sawtooth'; lfo.frequency.value = 5.2; const lg = c.createGain(); lg.gain.value = 0.7; lfo.connect(lg).connect(am.gain);
    const whine = c.createOscillator(); whine.type = 'sine'; whine.frequency.value = 1900; const wg = c.createGain(); wg.gain.value = 0.015;
    const g = c.createGain(); g.gain.value = 0.0;
    n.connect(lp).connect(am).connect(g); whine.connect(wg).connect(g);
    const p = this.panner({ x: 0, y: 0, z: 0 }, 20, 0.8);
    g.connect(p).connect(this.duckSfx); p.connect(this.echoSend);
    n.start(); lfo.start(); whine.start();
    const h = { setPos: (v) => { if (p.positionX) { p.positionX.value = v.x; p.positionY.value = v.y; p.positionZ.value = v.z; } },
      set: (vol) => g.gain.setTargetAtTime(vol, c.currentTime, 0.4),
      stop: () => { try { n.stop(); lfo.stop(); whine.stop(); } catch {} this.loops.delete(h); } };
    this.loops.add(h); return h;
  }
  // small quadcopter: high rotor whine with flutter, positional
  droneLoop() {
    if (!this.ready) return null; const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 210 + Math.random() * 40;
    const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.value = o.frequency.value * 1.98;
    const lfo = c.createOscillator(); lfo.frequency.value = 23; const lg = c.createGain(); lg.gain.value = 12; lfo.connect(lg).connect(o.frequency);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.8;
    const g = c.createGain(); g.gain.value = 0.05; const g2 = c.createGain(); g2.gain.value = 0.4;
    o.connect(bp); o2.connect(g2).connect(bp); bp.connect(g);
    const p = this.panner({ x: 0, y: 0, z: 0 }, 5, 1.4); g.connect(p).connect(this.duckSfx);
    o.start(); o2.start(); lfo.start();
    const h = { setPos: (v) => { if (p.positionX) { p.positionX.value = v.x; p.positionY.value = v.y; p.positionZ.value = v.z; } },
      stop: () => { try { o.stop(); o2.stop(); lfo.stop(); } catch {} this.loops.delete(h); } };
    this.loops.add(h); return h;
  }
  // distant civil-defence siren (rising/falling wail), non-positional ambience
  sirenLoop(level = 0.05) {
    if (!this.ready) return null; const c = this.ctx;
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = 600;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.12; const lg = c.createGain(); lg.gain.value = 220; lfo.connect(lg).connect(o.frequency);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
    const g = c.createGain(); g.gain.value = level; o.connect(lp).connect(g).connect(this.duckAmb);
    o.start(); lfo.start();
    const h = { set: (v) => g.gain.setTargetAtTime(v, c.currentTime, 0.5), stop: () => { try { o.stop(); lfo.stop(); } catch {} this.loops.delete(h); } };
    this.loops.add(h); return h;
  }
  stopAllLoops() { for (const l of [...this.loops]) l.stop(); this.stopWind(); }

  // ---------- adaptive music ----------
  // Procedural score built from a minor-mode progression. States:
  //  'menu' (theme), 'ambient' (sparse pads), 'tension' (pulse), 'combat' (percussion + ostinato), 'cinematic' (swell), 'silent'
  startMusicEngine() {
    const c = this.ctx;
    this.musicOut = c.createGain(); this.musicOut.gain.value = 0; this.musicOut.connect(this.duckMusic);
    this.musicLP = c.createBiquadFilter(); this.musicLP.type = 'lowpass'; this.musicLP.frequency.value = 1200; this.musicLP.connect(this.musicOut);
    this.musicRev = c.createConvolver(); this.musicRev.buffer = this.makeIR(4, 2); const rg = c.createGain(); rg.gain.value = 0.5;
    this.musicLP.connect(this.musicRev).connect(rg).connect(this.musicOut);
    this.beat = 0; this.nextBeat = c.currentTime + 0.1; this.bpm = 84;
    // A minor-ish progression with modal colour: i - VI - III - VII / i - iv - VI - V
    this.prog = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62], [57, 60, 64], [50, 53, 57], [53, 57, 60], [52, 56, 59]];
    this.musicTimer = setInterval(() => this.musicTick(), 50);
  }
  // Pre-rendered track (MP3) played through the music bus; used for the menu theme.
  playTrack(url, { loop = true, volume = 1 } = {}) {
    if (!this.ready) return;
    if (this.bgm?.url === url) { if (this.bgm.el.paused) this.bgm.el.play().catch(() => {}); this.bgm.g.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.8); return; }
    this.stopTrack(0.6);
    const el = new Audio(url); el.loop = loop; el.preload = 'auto';
    const src = this.ctx.createMediaElementSource(el); const g = this.ctx.createGain(); g.gain.value = 0.0001;
    src.connect(g).connect(this.duckMusic);
    g.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.8);
    const tr = { url, el, g, failed: false }; this.bgm = tr;
    el.addEventListener('error', () => { tr.failed = true; if (this.bgm === tr) { this.bgm = null; this.bgmFallback?.(); } });
    el.play().catch(() => {});
  }
  stopTrack(fade = 1.2) {
    const tr = this.bgm; if (!tr) return; this.bgm = null;
    tr.g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, fade / 3);
    setTimeout(() => { tr.el.pause(); tr.el.src = ''; }, fade * 1000 + 200);
  }
  setMusic(state) {
    if (!this.ready) return;
    // the menu uses the recorded theme when available; procedural score otherwise
    if (state === 'menu' && this.menuTrackUrl && !this.menuTrackFailed) {
      this.bgmFallback = () => { this.menuTrackFailed = true; this.musicState = null; this.setMusic('menu'); };
      this.playTrack(this.menuTrackUrl, { volume: 1 });
      state = 'silent';
    } else this.stopTrack();  // any non-menu state ends the recorded theme
    if (state === this.musicState) return;
    this.musicState = state;
    const t = this.ctx.currentTime;
    const lvl = { silent: 0, menu: 0.8, ambient: 0.45, tension: 0.6, combat: 0.75, cinematic: 0.85, ending: 0.8 }[state] ?? 0.5;
    this.musicOut.gain.setTargetAtTime(lvl, t, state === 'silent' ? 1.0 : 1.5);
    this.musicLP.frequency.setTargetAtTime({ combat: 2600, tension: 1600, menu: 1800, cinematic: 2200 }[state] || 1100, t, 1);
    this.bpm = { combat: 112, tension: 96, menu: 72, cinematic: 70, ending: 64 }[state] || 80;
  }
  note(midi, t, dur, { type = 'sawtooth', gain = 0.05, detune = 7, attack = 0.6, out = this.musicLP } = {}) {
    const c = this.ctx; const f = 440 * Math.pow(2, (midi - 69) / 12);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.setValueAtTime(gain, t + Math.max(attack, dur - 0.8)); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    g.connect(out);
    for (const d of [-detune, detune]) { const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = d; o.connect(g); o.start(t); o.stop(t + dur + 0.05); }
  }
  pluck(midi, t, gain = 0.06) {
    const c = this.ctx; const f = 440 * Math.pow(2, (midi - 69) / 12);
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    o.connect(g).connect(this.musicLP); o.start(t); o.stop(t + 1.7);
  }
  drum(t, kind = 'low', gain = 0.3) {
    const c = this.ctx;
    if (kind === 'low') {
      const o = c.createOscillator(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.25);
      const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5); o.connect(g).connect(this.musicOut); o.start(t); o.stop(t + 0.55);
    } else {
      const n = this.noiseSrc(); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = kind === 'snare' ? 1800 : 7000; f.Q.value = 1;
      const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'snare' ? 0.18 : 0.05)); n.connect(f).connect(g).connect(this.musicOut); n.start(t, Math.random()); n.stop(t + 0.2);
    }
  }
  musicTick() {
    if (!this.ready || this.musicState === 'silent' || this.ctx.state !== 'running') { if (this.ctx) this.nextBeat = Math.max(this.nextBeat, this.ctx.currentTime + 0.1); return; }
    const c = this.ctx; const spb = 60 / this.bpm;
    while (this.nextBeat < c.currentTime + 0.25) {
      const t = this.nextBeat, b = this.beat, s = this.musicState;
      const bar = Math.floor(b / 8) % this.prog.length; const chord = this.prog[bar]; const step = b % 8;
      if (step === 0) { // pads every bar (8 eighths)
        const len = spb * 4.2;
        for (const m of chord) this.note(m - 12, t, len, { gain: s === 'ambient' ? 0.018 : 0.026, attack: 1.2 });
        this.note(chord[0] - 24, t, len, { type: 'sine', gain: 0.07, detune: 0, attack: 0.8 });
      }
      if (s === 'menu' || s === 'cinematic' || s === 'ending') {
        const arp = [0, 1, 2, 1, 2, 0, 1, 2];
        if (step % 2 === 0 || s === 'menu') this.pluck(chord[arp[step]] + (step >= 4 ? 12 : 0), t, s === 'menu' ? 0.035 : 0.045);
        if (s === 'cinematic' && step === 0) this.drum(t, 'low', 0.35);
      }
      if (s === 'tension') {
        this.note(chord[0] - 12, t, spb * 0.45, { type: 'square', gain: 0.012, attack: 0.01, detune: 2 });
        if (step === 0 || step === 6) this.drum(t, 'low', 0.18);
      }
      if (s === 'combat') {
        this.note(chord[step % 3] + (step % 4 === 3 ? 12 : 0), t, spb * 0.4, { type: 'sawtooth', gain: 0.018, attack: 0.01, detune: 4 });
        if (step === 0 || step === 3 || step === 6) this.drum(t, 'low', 0.32);
        if (step === 4) this.drum(t, 'snare', 0.12);
        this.drum(t, 'hat', 0.03);
      }
      this.nextBeat += spb / 2; this.beat++;
    }
  }
}

export const audio = new AudioEngine();
