/* The instrument's signal graph: ten parts, each with a level and two sends, into the dub desk.
   Voices get their frequencies from the caller (degrees resolved by the tuning); every filter that can ring
   is set through snap(), which pulls it onto a tone of the scale. `audit` sees every frequency written. */
import { mulberry32, hash } from './prng.js';
import { PARTS, SYNC } from './state.js';
import { makeDelay, makeReverb, makeMaster, satCurve, djFilter } from './fx.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const TRIM = { kick: 1, bass: 1, stab: 1, pad: 1, hats: 1, rim: 1, perc: 1, air: 1, noise: 1, siren: 1 };
export const stabCutoff = (x) => 200 * Math.pow(2, x * 5);       // 200 Hz – 6.4 kHz
export const delayTime = (S) => clamp(S.delay.sync === 'free' || !SYNC[S.delay.sync] ? S.delay.free : SYNC[S.delay.sync][1] * 60 / S.tempo, 0.02, 3.8);

export function buildGraph(ctx, { tape = false, audit = null, dynamics = true } = {}) {
  const sr = ctx.sampleRate, fmax = Math.min(18000, sr * 0.42);
  const G = { ctx, tape, parts: {}, S: null, tun: null, throws: {}, pads: [], running: false };
  const gain = (v = 1) => { const n = ctx.createGain(); n.gain.value = v; return n; };
  const biq = (type, q = 0.707) => { const n = ctx.createBiquadFilter(); n.type = type; n.Q.value = q; return n; };
  const osc = (type) => { const n = ctx.createOscillator(); n.type = type; return n; };
  const F = (hz, kind) => { if (audit) audit(hz, kind); return hz; };
  const snap = (hz, kind = 'filter') => F(G.tun.snap(clamp(hz, 18, fmax)), kind);

  /* noise: seeded, so two renders of the same state are the same file */
  const white = ctx.createBuffer(1, sr * 2, sr);
  { const d = white.getChannelData(0), r = mulberry32(hash('white')); for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1; }
  const crackle = ctx.createBuffer(1, sr * 7, sr);
  { const d = crackle.getChannelData(0), r = mulberry32(hash('crackle')); let i = 0;
    while (i < d.length) { i += Math.floor(40 + Math.pow(r(), 3) * sr * 0.5); const a = (0.15 + 0.85 * Math.pow(r(), 4)) * (r() < 0.5 ? -1 : 1), n = 2 + Math.floor(r() * 10); for (let k = 0; k < n && i + k < d.length; k++) d[i + k] = a * (1 - k / n); } }
  const noiseSrc = (t, dur, k) => { const s = ctx.createBufferSource(); s.buffer = white; s.start(t, (k * 0.0731) % 1.6, dur + 0.05); return s; };

  const M = G.master = makeMaster(ctx, dynamics), D = G.delay = makeDelay(ctx, tape), R = G.reverb = makeReverb(ctx);
  G.out = M.out;
  D.out.connect(M.in); R.out.connect(M.in);
  const dlyRev = gain(0.22); D.out.connect(dlyRev); dlyRev.connect(R.in);
  for (const p of PARTS) {
    const P = G.parts[p] = { in: gain(1), level: gain(0), dly: gain(0), rev: gain(0) };
    P.level.connect(M.in); P.level.connect(P.dly); P.level.connect(P.rev); P.dly.connect(D.in); P.rev.connect(R.in);
  }
  const X = G.parts;
  const insert = (p, node) => { X[p].in.connect(node); node.connect(X[p].level); return node; };
  X.kick.lp = insert('kick', biq('lowpass', 0.6));
  X.stab.f = insert('stab', biq('lowpass', 2));
  X.hats.hp = insert('hats', biq('highpass', 0.7));
  X.air.hp = insert('air', biq('highpass', 0.9));
  X.siren.lp = insert('siren', biq('lowpass', 1.2));
  for (const p of ['bass', 'pad', 'rim', 'perc', 'noise']) X[p].in.connect(X[p].level);

  /* chord filter LFO: moves the cutoff in cents around its (snapped) resting place */
  const lfo = osc('sine'), lfoG = gain(0); lfo.connect(lfoG); lfoG.connect(X.stab.f.detune); lfo.start();
  /* bass: one voice that is always there, so notes can glide */
  const B = X.bass; B.o1 = osc('sine'); B.o2 = osc('sine'); B.g1 = gain(0.75); B.g2 = gain(0.45); B.amp = gain(0); B.lp = biq('lowpass', 0.8); B.duck = gain(1);
  B.o1.connect(B.g1); B.o2.connect(B.g2); B.g1.connect(B.lp); B.g2.connect(B.lp); B.lp.connect(B.amp); B.amp.connect(B.duck); B.duck.connect(B.in);
  B.o1.start(); B.o2.start(); B.last = -1;
  /* noise bed: tape hiss and vinyl crackle, gated by the transport */
  const N = X.noise; N.gate = gain(0); N.hiss = ctx.createBufferSource(); N.hiss.buffer = white; N.hiss.loop = true; N.hissF = biq('bandpass', 0.5); N.hissG = gain(0.05);
  N.cr = ctx.createBufferSource(); N.cr.buffer = crackle; N.cr.loop = true; N.crF = biq('highpass', 0.7); N.crG = gain(0);
  N.hiss.connect(N.hissF); N.hissF.connect(N.hissG); N.hissG.connect(N.gate); N.cr.connect(N.crF); N.crF.connect(N.crG); N.crG.connect(N.gate); N.gate.connect(N.in);
  N.hiss.start(); N.cr.start();

  /* ── parameters ── */
  G.apply = (S, tun, t = ctx.currentTime, instant = false) => {
    G.S = S; G.tun = tun;
    const set = (p, v, tc = 0.03) => instant ? p.setValueAtTime(v, t) : p.setTargetAtTime(v, t, tc);
    const anySolo = PARTS.some(p => S.parts[p].solo);
    for (const p of PARTS) {
      const P = S.parts[p], thr = G.throws[p];
      set(X[p].level.gain, (P.mute || (anySolo && !P.solo)) ? 0 : P.level * P.level * TRIM[p]);
      set(X[p].dly.gain, thr ? 1 : P.dly * P.dly, thr ? 0.008 : 0.03);
      set(X[p].rev.gain, thr ? Math.max(0.5, P.rev * P.rev) : P.rev * P.rev, thr ? 0.008 : 0.03);
    }
    const k = S.parts;
    set(X.kick.lp.frequency, snap(120 * Math.pow(2, k.kick.tone * 3.6)));
    set(B.lp.frequency, snap(70 * Math.pow(2, k.bass.filter * 4.3)));
    const shape = { sine: 'sine', triangle: 'triangle', saw: 'sawtooth', square: 'square' }[k.bass.shape] || 'sine';
    if (B.o1.type !== shape) B.o1.type = shape;
    set(B.g1.gain, shape === 'sine' ? 0.75 : shape === 'triangle' ? 0.7 : 0.35);
    set(X.stab.f.frequency, snap(stabCutoff(k.stab.cutoff)));
    set(X.stab.f.Q, 0.5 + k.stab.res * k.stab.res * 14);
    set(lfo.frequency, clamp(k.stab.lfoRate, 0.005, 12)); set(lfoG.gain, k.stab.lfoDepth * 2400);
    set(X.hats.hp.frequency, snap(3000 * Math.pow(2, k.hats.tone * 1.8)));
    set(X.air.hp.frequency, snap(11500)); set(X.siren.lp.frequency, snap(2600));
    set(N.hissF.frequency, snap(4200)); set(N.crF.frequency, snap(1000));
    set(N.crG.gain, k.noise.density * 0.5); set(N.hissG.gain, 0.05);
    const d = S.delay;
    D.set({ time: delayTime(S), feedback: d.feedback, hp: snap(d.hp), lp: snap(d.lp), drive: d.sat, wow: d.wow, flutter: d.flutter, ping: d.ping ? 1 : 0, freeze: d.freeze ? 1 : 0 }, t, instant);
    set(D.out.gain, d.level);
    R.setIR(S.reverb.type === 'spring' ? 'spring' : 'plate', S.reverb.size);
    set(R.pre.frequency, snap(180)); set(R.damp.frequency, snap(900 * Math.pow(2, (1 - S.reverb.damp) * 3.6))); set(R.out.gain, S.reverb.level);
    const m = S.master, dj = djFilter(m.dj);
    set(M.hp.frequency, snap(dj.hp), 0.05); set(M.lp.frequency, snap(dj.lp), 0.05); set(M.hp.Q, dj.q); set(M.lp.Q, dj.q);
    if (m.sat !== M.satAmt) { M.satAmt = m.sat; M.sat.curve = satCurve(m.sat); }
    set(M.comp.threshold, -6 - m.comp * 14); set(M.comp.ratio, 1.5 + m.comp * 3); set(M.post.gain, Math.pow(10, -(1.5 + m.comp * 3) / 20));
    set(M.vol.gain, m.volume * m.volume);
  };
  G.setThrow = (part, on, S, t = ctx.currentTime) => {
    G.throws[part] = !!on;
    const P = S.parts[part];
    X[part].dly.gain.setTargetAtTime(on ? 1 : P.dly * P.dly, t, 0.008);
    X[part].rev.gain.setTargetAtTime(on ? Math.max(0.5, P.rev * P.rev) : P.rev * P.rev, t, 0.008);
  };
  G.setRunning = (on, t = ctx.currentTime) => {
    G.running = on; N.gate.gain.setTargetAtTime(on ? 1 : 0, t, 0.02);
    if (!on) { B.amp.gain.setTargetAtTime(0, t, 0.03); G.fadePads(t); }
  };
  /* Sustained voices from before a retune leave quickly; the pattern re-strikes them in the new tuning. */
  G.fadePads = (t = ctx.currentTime) => { for (const p of G.pads) { p.kill.gain.setTargetAtTime(0, t, 0.09); } G.pads = []; };

  /* ── voices ── */
  const env = (peak, t, attack, decay) => { const a = gain(0); a.gain.setValueAtTime(0.0001, t); a.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack); a.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay); return a; };
  const tone = (type, hz, t, end, kind, detune = 0) => { const o = osc(type); o.frequency.setValueAtTime(F(hz, kind), t); if (detune) o.detune.setValueAtTime(detune, t); o.start(t); o.stop(end); return o; };

  const V = {
    kick(ev, hz, t, sd, P) {
      const f1 = hz[0], f0 = f1 * (P.punch < 0.5 ? 2 : 4);              // the sweep starts one or two octaves up, on the same degree
      const sweep = 0.05 + (1 - P.punch) * 0.09, dec = 0.12 + P.decay * 0.75, o = osc('sine'), a = env(0.95 * ev.vel, t, 0.006, dec);
      o.frequency.setValueAtTime(F(f0, 'kick'), t); o.frequency.exponentialRampToValueAtTime(F(f1, 'kick'), t + sweep);
      o.connect(a); a.connect(X.kick.in); o.start(t); o.stop(t + dec + 0.05);
      if (P.punch > 0.05) { const c = noiseSrc(t, 0.01, ev.step), ca = env(0.5 * P.punch * ev.vel, t, 0.001, 0.008); c.connect(ca); ca.connect(X.kick.in); }
      B.duck.gain.setValueAtTime(0.4, t); B.duck.gain.linearRampToValueAtTime(1, t + 0.17);
    },
    bass(ev, hz, t, sd, P) {
      const f = F(hz[0], 'bass'), len = Math.max(0.05, ev.len * sd);
      for (const o of [B.o1, B.o2]) { if (P.glide > 0.004 && B.last >= 0) o.frequency.setTargetAtTime(f, t, P.glide / 3); else o.frequency.setValueAtTime(f, t); }
      B.last = f;
      B.amp.gain.setTargetAtTime(0.42 * ev.vel, t, 0.006); B.amp.gain.setTargetAtTime(0, t + len - 0.012, 0.028);
    },
    stab(ev, hz, t, sd, P) {
      const len = clamp(P.length, 0.04, 2), cut = stabCutoff(P.cutoff), end = t + len + 0.06;
      const a = env(0.5 * ev.vel, t, 0.004, len), vf = biq('lowpass', 0.5);
      vf.frequency.setValueAtTime(snap(cut * Math.pow(2, 0.4 + P.env * 2.6), 'env'), t);
      vf.frequency.exponentialRampToValueAtTime(snap(cut * 0.8, 'env'), t + len * 0.6);
      const g = gain(1 / Math.sqrt(hz.length));
      for (const f of hz) for (const det of [-P.detune, P.detune]) tone('sawtooth', f, t, end, 'stab', det).connect(g);
      g.connect(vf); vf.connect(a); a.connect(X.stab.in);
    },
    pad(ev, hz, t, sd, P) {
      const dur = ev.len * sd, att = Math.min(1.6, dur * 0.35), rel = 2.2, end = t + dur + rel * 1.7, peak = 0.34 * ev.vel;
      const a = gain(0), kill = gain(1), vf = biq('lowpass', 0.7), g = gain(1 / Math.sqrt(Math.max(1, hz.length)));
      a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(peak, t + att); a.gain.setValueAtTime(peak, t + Math.max(att, dur)); a.gain.setTargetAtTime(0, t + Math.max(att, dur), rel / 3);
      vf.frequency.setValueAtTime(snap(300 * Math.pow(2, P.tone * 4)), t);
      hz.forEach((f, i) => {
        if (i < 2) { tone('triangle', f, t, end, 'pad').connect(g); tone('sine', f, t, end, 'pad').connect(g); }
        else for (const det of [-7, 7]) { const h = gain(0.5); tone('sawtooth', f, t, end, 'pad', det).connect(h); h.connect(g); }
      });
      g.connect(vf); vf.connect(a); a.connect(kill); kill.connect(X.pad.in);
      G.pads = G.pads.filter(p => p.end > t); G.pads.push({ kill, end });
    },
    closed(ev, hz, t, sd, P) { const dec = 0.02 + P.decay * 0.12, a = env(0.9 * ev.vel, t, 0.001, dec); noiseSrc(t, dec, ev.step + 3).connect(a); a.connect(X.hats.in); },
    open(ev, hz, t, sd, P) { const dec = 0.15 + P.decay * 0.5, a = env(0.7 * ev.vel, t, 0.002, dec); noiseSrc(t, dec, ev.step + 7).connect(a); a.connect(X.hats.in); },
    rim(ev, hz, t) {
      const a = env(0.6 * ev.vel, t, 0.001, 0.035); tone('triangle', hz[0], t, t + 0.06, 'rim').connect(a); a.connect(X.rim.in);
      const c = noiseSrc(t, 0.01, ev.step + 11), cf = biq('bandpass', 2), ca = env(0.5 * ev.vel, t, 0.001, 0.012);
      cf.frequency.setValueAtTime(snap(hz[0] * 2), t); c.connect(cf); cf.connect(ca); ca.connect(X.rim.in);
    },
    clave(ev, hz, t) { const a = env(0.5 * ev.vel, t, 0.001, 0.09); tone('sine', hz[0], t, t + 0.12, 'clave').connect(a); a.connect(X.rim.in); },
    shaker(ev, hz, t) {
      const a = env(0.45 * ev.vel, t, 0.012, 0.05), f = biq('bandpass', 1.4);
      f.frequency.setValueAtTime(snap(6200), t); noiseSrc(t, 0.08, ev.step + 5).connect(f); f.connect(a); a.connect(X.perc.in);
    },
    conga(ev, hz, t) {
      const a = env(0.7 * ev.vel, t, 0.002, 0.2); tone('sine', hz[0], t, t + 0.25, 'conga').connect(a); a.connect(X.perc.in);
      const c = noiseSrc(t, 0.01, ev.step + 13), cf = biq('bandpass', 1.5), ca = env(0.12 * ev.vel, t, 0.001, 0.01);
      cf.frequency.setValueAtTime(snap(hz[0] * 4), t); c.connect(cf); cf.connect(ca); ca.connect(X.perc.in);
    },
    air(ev, hz, t) { const dec = 0.03 + 0.05 * ev.vel, a = env(0.8 * ev.vel, t, 0.001, dec); noiseSrc(t, dec, ev.step + 17).connect(a); a.connect(X.air.in); },
    siren(ev, hz, t, sd) {
      const dur = ev.len * sd, iv = sd / (ev.rate || 1), o = osc('square'), a = gain(0);
      o.frequency.setValueAtTime(F(hz[0], 'siren'), t); F(hz[1], 'siren');
      for (let k = 1; k * iv < dur; k++) o.frequency.setTargetAtTime(hz[k % 2], t + k * iv, iv * 0.2);     // glides between two scale tones
      a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(0.2 * ev.vel, t + 0.02); a.gain.setTargetAtTime(0, t + dur, 0.03);
      o.connect(a); a.connect(X.siren.in); o.start(t); o.stop(t + dur + 0.3);
    },
    zap(ev, hz, t) {
      const o = osc('sine'), a = env(0.4 * ev.vel, t, 0.002, 0.25);
      o.frequency.setValueAtTime(F(hz[0], 'zap'), t); o.frequency.exponentialRampToValueAtTime(F(hz[1], 'zap'), t + 0.14);
      o.connect(a); a.connect(X.siren.in); o.start(t); o.stop(t + 0.3);
    },
    pluck(ev, hz, t) { const a = env(0.4 * ev.vel, t, 0.002, 0.3); tone('triangle', hz[0], t, t + 0.35, 'pluck').connect(a); a.connect(X.siren.in); },
  };
  /* Play one event. hz: its pitches, already resolved by the tuning. sd: seconds per sixteenth. */
  G.play = (ev, hz, t, sd, S) => { const v = V[ev.kind]; if (v) v(ev, hz, t, sd, S.parts[ev.part]); };

  G.dispose = () => {
    for (const n of [lfo, B.o1, B.o2, N.hiss, N.cr]) { try { n.stop(); } catch (e) {} }
    try { D.dispose(); M.out.disconnect(); } catch (e) {}
  };
  return G;
}
