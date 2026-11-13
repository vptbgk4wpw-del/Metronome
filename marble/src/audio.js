/* Audio, carried over from Dish with its logic unchanged: input, four gated band envelopes, and the dub techno
   test generator. The only additions are `hits` and `level` on each band, which Marble's vents read.

   Each band is normalised to its own peak, gated against its own recent average so only distinct hits open it,
   then smoothed by a soft spring. Air, the very top, is only metered here (in Dish it glitches the lamp).
   Kick is not "bass": it listens to the punch region through its own filter and keeps only the transient,
   so a sustained bass line leaves the paint alone. */
import { P } from './params.js';

export const BANDS = [ { n:'Kick', rel:0.2, w:18, floor:0.004, dec:0.97 }, { n:'Mid', lo:280, hi:2400, rel:0.2, w:22, floor:0.0004, dec:0.88 },
  { n:'High', lo:4000, hi:9000, rel:0.14, w:34, floor:0.00008, dec:0.88 }, { n:'Air', lo:10500, hi:17000, rel:0.06, w:70, floor:0.00003, dec:0.88 } ];
export const AU = {
  ctx:null, an:null, buf:null, node:null, el:null, stream:null, dest:null, kind:'none', name:'', force:null,
  b:BANDS.map(B => ({ peak:B.floor, avg:0, slow:0, open:false, env:0, x:0, v:0, hits:0, level:0 })), pulse:[0, 0, 0, 0], activity:0,
  ensure(){
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.an = this.ctx.createAnalyser(); this.an.fftSize = 2048; this.an.smoothingTimeConstant = 0.1;
      this.buf = new Float32Array(this.an.frequencyBinCount);
      this.dest = this.ctx.createMediaStreamDestination();
      // kick listener: the punch region (85–190 Hz, steep below) read as short-window loudness, next to the whole low end.
      // A kick puts most of its low energy into the punch region when it lands; a bass note keeps it underneath.
      const f = (type, hz, q) => { const n = this.ctx.createBiquadFilter(); n.type = type; n.frequency.value = hz; n.Q.value = q; return n; };
      const h1 = f('highpass', 85, 0.54), h2 = f('highpass', 85, 1.31), lp = f('lowpass', 190, 0.7), lo = f('lowpass', 260, 0.7);
      this.kAn = this.ctx.createAnalyser(); this.kAn.fftSize = 1024; this.kBuf = new Float32Array(1024);
      this.lAn = this.ctx.createAnalyser(); this.lAn.fftSize = 1024; this.lBuf = new Float32Array(1024);
      this.an.connect(h1); h1.connect(h2); h2.connect(lp); lp.connect(this.kAn);
      this.an.connect(lo); lo.connect(this.lAn);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },
  stop(){
    DUB.stop();
    if (this.node) { try { this.node.disconnect(); } catch (e) {} this.node = null; }
    if (this.el) { this.el.pause(); URL.revokeObjectURL(this.el.src); this.el = null; }
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
    this.kind = 'none'; this.name = '';
  },
  async file(f){
    this.ensure(); this.stop();
    const el = new Audio(); el.src = URL.createObjectURL(f); el.loop = true;
    const node = this.ctx.createMediaElementSource(el);
    node.connect(this.an); node.connect(this.ctx.destination); node.connect(this.dest);
    this.el = el; this.node = node; this.kind = 'file'; this.name = f.name;
    await el.play();
  },
  async mic(){
    this.ensure();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('no-api');
    const s = await navigator.mediaDevices.getUserMedia({ audio:{ echoCancellation:false, noiseSuppression:false, autoGainControl:false } });
    this.stop();
    const node = this.ctx.createMediaStreamSource(s); node.connect(this.an); node.connect(this.dest);
    this.stream = s; this.node = node; this.kind = 'mic'; this.name = (s.getAudioTracks()[0] || {}).label || 'input';
  },
  update(dt){
    const raw = [0, 0, 0, 0]; let punch = 0;
    if (this.kind !== 'none' && this.an) {
      this.an.getFloatFrequencyData(this.buf);
      const hz = this.ctx.sampleRate / this.an.fftSize;
      this.kAn.getFloatTimeDomainData(this.kBuf);
      let q = 0; for (let k = 0; k < this.kBuf.length; k++) q += this.kBuf[k] * this.kBuf[k];
      raw[0] = Math.sqrt(q / this.kBuf.length);
      this.lAn.getFloatTimeDomainData(this.lBuf);
      let ql = 0; for (let k = 0; k < this.lBuf.length; k++) ql += this.lBuf[k] * this.lBuf[k];
      punch = Math.min(1, Math.max(0, (raw[0] / Math.max(1e-6, Math.sqrt(ql / this.lBuf.length)) - 0.65) / 0.3));
      BANDS.forEach((B, i) => {
        if (!i) return;
        const i0 = Math.max(1, Math.floor(B.lo / hz)), i1 = Math.min(this.buf.length - 1, Math.ceil(B.hi / hz));
        let s = 0; for (let k = i0; k <= i1; k++) { const db = this.buf[k]; if (db > -140) s += Math.pow(10, db / 10); }
        raw[i] = Math.sqrt(s / (i1 - i0 + 1));
      });
    }
    let onsets = 0;
    BANDS.forEach((B, i) => {
      const s = this.b[i];
      s.peak = Math.max(raw[i], s.peak * Math.pow(B.dec, dt), B.floor);
      let v = raw[i] / s.peak;
      if (i === 0) { s.slow += (v - s.slow) * Math.min(1, dt / 0.22); s.hit = Math.max(punch, (s.hit || 0) * Math.exp(-dt / 0.08)); v = Math.min(1, Math.max(0, v - s.slow) * 1.5) * s.hit; }
      s.avg += (v - s.avg) * Math.min(1, dt / 0.9);
      const thr = s.avg * (1.05 + P.gate * 0.5) + 0.03 + P.gate * 0.12;
      if (!s.open && v > thr) { s.open = true; if (s.peak > B.floor * 2) { onsets++; s.hits++; } } else if (s.open && v < thr * 0.8) s.open = false;
      // loudness above the band's own recent average, so a hit stands out from a sustained note
      let target = s.open ? Math.min(1, Math.max(0, (v - 0.6 * s.avg) / Math.max(0.15, 1 - 0.6 * s.avg))) : 0;
      target *= Math.min(1, Math.max(0, (s.peak / B.floor - 1.2) / 1.8));   // a band that is only noise floor stays still
      if (this.force) target = this.force.p[i] || 0;
      s.level = target;
      s.env += (target - s.env) * Math.min(1, dt / (target > s.env ? 0.012 : B.rel));
      const n = Math.max(1, Math.ceil(dt * B.w / 0.4)), h = dt / n;
      for (let k = 0; k < n; k++) { s.v += (B.w * B.w * (s.env - s.x) - 2 * 0.5 * B.w * s.v) * h; s.x += s.v * h; }
      this.pulse[i] = Math.min(1.6, Math.max(0, s.x) * P.aGain);
    });
    this.activity = Math.min(1, this.activity * Math.exp(-dt / 3) + onsets * 0.032);
    if (this.force && this.force.act != null) this.activity = this.force.act;
  },
};

/* ───────────────────────── dub techno generator ─────────────────────────
   A test signal in the Rhythm & Sound spirit: soft four-on-the-floor kick, heavy sub line, one minor-ninth stab
   thrown into a filtered feedback delay and a long dark reverb, sparse hats, tape hiss, and a few very high ticks
   ("air"). Parts can be muted to check which bubbles answer to which sound. */
export const DUB = {
  on:false, g:null, timer:0, next:0, step:0, noise:null,
  bassLines:[
    { 0:[0, 5], 7:[0, 1], 8:[-5, 3], 12:[-2, 3] },
    { 0:[0, 3], 3:[0, 1], 6:[0, 2], 10:[3, 2], 14:[-2, 2] },
  ],
  chordPats:[[2, 10], [2], [2, 10, 13], [6]],
  build(){
    if (this.g) return;
    const c = AU.ctx, g = this.g = {};
    const gain = v => { const n = c.createGain(); n.gain.value = v; return n; };
    const filt = (type, f, q) => { const n = c.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; return n; };
    g.out = gain(0);
    g.comp = c.createDynamicsCompressor(); g.comp.threshold.value = -16; g.comp.knee.value = 12; g.comp.ratio.value = 3; g.comp.attack.value = 0.01; g.comp.release.value = 0.22;
    g.out.connect(g.comp); g.comp.connect(AU.an); g.comp.connect(c.destination); g.comp.connect(AU.dest);

    const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noise = nb;
    const len = Math.floor(c.sampleRate * 3.2), ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); let lp = 0; for (let i = 0; i < len; i++) { lp += ((Math.random() * 2 - 1) - lp) * 0.22; d[i] = lp * Math.pow(1 - i / len, 2.6) * Math.min(1, i / 500); } }
    g.rev = c.createConvolver(); g.rev.buffer = ir; g.revOut = gain(0.5); g.rev.connect(g.revOut); g.revOut.connect(g.out);

    g.dly = c.createDelay(2); g.dlyLP = filt('lowpass', 1500, 0.5); g.dlyHP = filt('highpass', 320, 0.5); g.dlyFb = gain(0.64); g.dlyOut = gain(0.55); g.dlyRev = gain(0.4);
    g.dly.connect(g.dlyLP); g.dlyLP.connect(g.dlyHP); g.dlyHP.connect(g.dlyFb); g.dlyFb.connect(g.dly);
    g.dlyHP.connect(g.dlyOut); g.dlyOut.connect(g.out); g.dlyHP.connect(g.dlyRev); g.dlyRev.connect(g.rev);

    g.chord = gain(1); g.chordF = filt('lowpass', 950, 4); g.chordDry = gain(0.5); g.chordDly = gain(0.9); g.chordRev = gain(0.45);
    g.chord.connect(g.chordF); g.chordF.connect(g.chordDry); g.chordDry.connect(g.out); g.chordF.connect(g.chordDly); g.chordDly.connect(g.dly); g.chordF.connect(g.chordRev); g.chordRev.connect(g.rev);
    g.lfo = c.createOscillator(); g.lfo.frequency.value = 0.045; g.lfoG = gain(620); g.lfo.connect(g.lfoG); g.lfoG.connect(g.chordF.frequency); g.lfo.start();

    g.kick = gain(1); g.kickF = filt('lowpass', 210, 0.5); g.kick.connect(g.kickF); g.kickF.connect(g.out);
    g.bass = gain(1); g.bassDuck = gain(1); g.bassF = filt('lowpass', 240, 0.7); g.bassF.connect(g.bassDuck); g.bassDuck.connect(g.bass); g.bass.connect(g.out);
    g.hat = gain(1); g.hatF = filt('lowpass', 8800, 0.6); g.hatDly = gain(0.18); g.hat.connect(g.hatF); g.hatF.connect(g.out); g.hatF.connect(g.hatDly); g.hatDly.connect(g.dly);
    g.air = gain(1); g.air.connect(g.out);

    g.hiss = c.createBufferSource(); g.hiss.buffer = nb; g.hiss.loop = true; g.hissF = filt('bandpass', 4200, 0.5); g.hissG = gain(0.012);
    g.hiss.connect(g.hissF); g.hissF.connect(g.hissG); g.hissG.connect(g.out); g.hiss.start();
  },
  apply(){
    if (!this.g) return;
    const g = this.g, t = AU.ctx.currentTime, set = (n, v) => n.gain.setTargetAtTime(v, t, 0.03);
    set(g.kick, P.gKick ? 1 : 0); set(g.bass, P.gBass ? 1 : 0); set(g.chord, P.gChord ? 1 : 0); set(g.hat, P.gHat ? 1 : 0); set(g.air, P.gAir ? 1 : 0);
    set(g.out, this.on ? P.gVol : 0);
    g.dly.delayTime.setTargetAtTime(60 / P.gBpm * 0.75, t, 0.05);
  },
  start(){
    AU.ensure(); AU.stop(); this.build();
    this.on = true; this.step = 0; this.next = AU.ctx.currentTime + 0.1;
    this.apply();
    clearInterval(this.timer); this.timer = setInterval(() => this.tick(), 25);
    AU.kind = 'dub'; AU.name = 'Dub techno';
  },
  stop(){
    if (!this.on) return;
    this.on = false; clearInterval(this.timer); this.apply();
  },
  tick(){
    const c = AU.ctx; if (!this.on || c.state !== 'running') return;
    const sd = 60 / P.gBpm / 4;
    if (this.next < c.currentTime - 0.2) this.next = c.currentTime + 0.05;
    while (this.next < c.currentTime + 0.14) {
      this.play(this.step, this.next + (this.step % 2 ? sd * 0.14 : 0), sd);
      this.next += sd; this.step++;
    }
  },
  play(n, t, sd){
    const s = n % 16, bar = Math.floor(n / 16);
    if (s % 4 === 0) this.kick(t, s === 0 ? 1 : 0.86);
    const e = this.bassLines[(bar >> 2) % this.bassLines.length][s]; if (e) this.bassNote(t, e[0], e[1] * sd);
    if (this.chordPats[(bar >> 1) % this.chordPats.length].includes(s)) this.stab(t, 0.6 + 0.4 * Math.random());
    if (s % 4 === 2) this.hatHit(t, 0.5, 0.05); else if (s % 2 === 1 && Math.random() < 0.35) this.hatHit(t, 0.16, 0.025);
    if (s === 14 && bar % 4 === 3) this.hatHit(t, 0.3, 0.22);
    if (s === 12 && bar % 2 === 1 && Math.random() < 0.7) this.rim(t);
    if ((s === 7 && bar % 2 === 0) || (s >= 13 && bar % 4 === 3)) this.airHit(t, s === 7 ? 0.09 : 0.035);
  },
  kick(t, v){
    const c = AU.ctx, g = this.g, o = c.createOscillator(), a = c.createGain();
    o.frequency.setValueAtTime(115, t); o.frequency.exponentialRampToValueAtTime(46, t + 0.11);
    a.gain.setValueAtTime(0.0001, t); a.gain.exponentialRampToValueAtTime(0.95 * v, t + 0.012); a.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
    o.connect(a); a.connect(g.kick); o.start(t); o.stop(t + 0.4);
    g.bassDuck.gain.setValueAtTime(0.35, t); g.bassDuck.gain.linearRampToValueAtTime(1, t + 0.18);
  },
  bassNote(t, semi, len){
    const c = AU.ctx, g = this.g, f = 55 * Math.pow(2, semi / 12), a = c.createGain();
    const o1 = c.createOscillator(), o2 = c.createOscillator(), a2 = c.createGain();
    o1.frequency.value = f; o2.type = 'triangle'; o2.frequency.value = f; a2.gain.value = 0.3;
    a.gain.setValueAtTime(0.0001, t); a.gain.linearRampToValueAtTime(0.55, t + 0.012); a.gain.setValueAtTime(0.55, t + Math.max(0.03, len - 0.03)); a.gain.linearRampToValueAtTime(0.0001, t + len + 0.06);
    o1.connect(a); o2.connect(a2); a2.connect(a); a.connect(g.bassF);
    o1.start(t); o2.start(t); o1.stop(t + len + 0.1); o2.stop(t + len + 0.1);
  },
  stab(t, v){
    const c = AU.ctx, g = this.g, a = c.createGain();
    a.gain.setValueAtTime(0.0001, t); a.gain.exponentialRampToValueAtTime(0.16 * v, t + 0.005); a.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    a.connect(g.chord);
    [0, 3, 7, 10, 14].forEach((st, i) => {
      for (const det of [-8, 8]) {
        const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 220 * Math.pow(2, st / 12); o.detune.value = det;
        if (i === 4) { const h = c.createGain(); h.gain.value = 0.5; o.connect(h); h.connect(a); } else o.connect(a);
        o.start(t); o.stop(t + 0.24);
      }
    });
  },
  hatHit(t, v, dur){
    const c = AU.ctx, g = this.g, s = c.createBufferSource(), f = c.createBiquadFilter(), a = c.createGain();
    s.buffer = this.noise; f.type = 'highpass'; f.frequency.value = 5200;
    a.gain.setValueAtTime(0.42 * v, t); a.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(a); a.connect(g.hat); s.start(t, Math.random() * 1.5, dur + 0.05);
  },
  airHit(t, dur){
    const c = AU.ctx, g = this.g, s = c.createBufferSource(), f = c.createBiquadFilter(), a = c.createGain();
    s.buffer = this.noise; f.type = 'highpass'; f.frequency.value = 11500; f.Q.value = 0.9;
    a.gain.setValueAtTime(0.3, t); a.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(a); a.connect(g.air); s.start(t, Math.random() * 1.5, dur + 0.05);
  },
  rim(t){
    const c = AU.ctx, g = this.g, o = c.createOscillator(), a = c.createGain();
    o.type = 'triangle'; o.frequency.value = 1750;
    a.gain.setValueAtTime(0.16, t); a.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    o.connect(a); a.connect(g.hat); a.connect(g.rev); o.start(t); o.stop(t + 0.05);
  },
};
