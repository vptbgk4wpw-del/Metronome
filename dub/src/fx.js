/* The dub desk's effects: tape delay, spring and plate reverb, master chain. Works in a live AudioContext
   and in an OfflineAudioContext alike. Frequencies arrive here already snapped to the scale. */
import tapeSrc from './tape-worklet.js?raw';
import { mulberry32, hash } from './prng.js';

/* Registers dub-tape and dub-rec. Resolves false where worklets from a Blob or data URL are not allowed;
   the desk then builds the delay from ordinary nodes. */
export async function loadWorklets(ctx) {
  if (!ctx.audioWorklet || typeof AudioWorkletNode === 'undefined') return false;
  try {
    const url = URL.createObjectURL(new Blob([tapeSrc], { type: 'text/javascript' }));
    try { await ctx.audioWorklet.addModule(url); return true; } finally { URL.revokeObjectURL(url); }
  } catch (e) { /* try the next way in */ }
  try { await ctx.audioWorklet.addModule('data:text/javascript;charset=utf-8,' + encodeURIComponent(tapeSrc)); return true; } catch (e) { return false; }
}

const curve = (fn, n = 2049) => { const c = new Float32Array(n); for (let i = 0; i < n; i++) c[i] = fn(i / (n - 1) * 2 - 1); return c; };
export const satCurve = (amount) => { const k = 0.5 + amount * 4, d = Math.tanh(k); return curve(x => Math.tanh(k * x) / d); };
/* Final safety: transparent below 0.75, never above 0.93 whatever comes in. */
export const clipCurve = () => curve(x => { const m = Math.abs(x); return m < 0.75 ? x : Math.sign(x) * (0.75 + 0.22 * Math.tanh((m - 0.75) / 0.22)); });

/* ── tape delay ── */
export function makeDelay(ctx, tape) {
  const D = { in: ctx.createGain(), out: ctx.createGain(), tape };
  const NAMES = ['time', 'feedback', 'hp', 'lp', 'drive', 'wow', 'flutter', 'ping', 'freeze'];
  if (tape) {
    const node = new AudioWorkletNode(ctx, 'dub-tape', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit' });
    D.in.connect(node); node.connect(D.out);
    D.set = (v, t, instant) => { for (const k of NAMES) { const p = node.parameters.get(k); if (instant) p.setValueAtTime(v[k], t); else p.setTargetAtTime(v[k], t, k === 'ping' || k === 'freeze' ? 0.001 : 0.02); } };
    D.dispose = () => { try { node.disconnect(); } catch (e) {} };
    return D;
  }
  // Fallback from ordinary nodes: two delay lines, filters and a tanh stage in each loop, cross-feeds for ping-pong.
  const g = (v) => { const n = ctx.createGain(); n.gain.value = v; return n; };
  const f = (type) => { const n = ctx.createBiquadFilter(); n.type = type; n.Q.value = 0.9; return n; };
  const mono = g(0.7); mono.channelCount = 1; mono.channelCountMode = 'explicit';
  const inL = g(1), inR = g(0), dL = ctx.createDelay(4), dR = ctx.createDelay(4);
  const lpL = f('lowpass'), lpR = f('lowpass'), hpL = f('highpass'), hpR = f('highpass');
  const shL = ctx.createWaveShaper(), shR = ctx.createWaveShaper();
  const fLL = g(0), fLR = g(0.6), fRL = g(0.6), fRR = g(0), merge = ctx.createChannelMerger(2);
  const wow = ctx.createOscillator(), wowG = g(0), flu = ctx.createOscillator(), fluG = g(0);
  wow.frequency.value = 0.43; flu.frequency.value = 6.7;
  D.in.connect(mono); mono.connect(inL); mono.connect(inR); inL.connect(dL); inR.connect(dR);
  dL.connect(lpL); lpL.connect(hpL); hpL.connect(shL); shL.connect(fLL); shL.connect(fLR); fLL.connect(dL); fLR.connect(dR);
  dR.connect(lpR); lpR.connect(hpR); hpR.connect(shR); shR.connect(fRR); shR.connect(fRL); fRR.connect(dR); fRL.connect(dL);
  hpL.connect(merge, 0, 0); hpR.connect(merge, 0, 1); merge.connect(D.out);
  wow.connect(wowG); flu.connect(fluG); for (const d of [dL, dR]) { wowG.connect(d.delayTime); fluG.connect(d.delayTime); }
  wow.start(); flu.start();
  let drive = -1;
  D.set = (v, t, instant) => {
    const s = (p, x, tc = 0.02) => instant ? p.setValueAtTime(x, t) : p.setTargetAtTime(x, t, tc);
    const fb = v.freeze ? 1 : Math.min(v.feedback, 1.05), on = v.freeze ? 0 : 1;
    s(dL.delayTime, v.time, 0.09); s(dR.delayTime, v.time, 0.09);
    for (const n of [lpL, lpR]) s(n.frequency, v.lp); for (const n of [hpL, hpR]) s(n.frequency, v.hp);
    s(fLL.gain, v.ping ? 0 : fb); s(fRR.gain, v.ping ? 0 : fb); s(fLR.gain, v.ping ? fb : 0); s(fRL.gain, v.ping ? fb : 0);
    s(inL.gain, on); s(inR.gain, v.ping ? 0 : on);
    s(wowG.gain, v.wow * 0.0035); s(fluG.gain, v.flutter * 0.00045);
    if (v.drive !== drive) { drive = v.drive; const k = 1 + 3 * drive; const c = new Float32Array(1025); for (let i = 0; i < 1025; i++) c[i] = Math.tanh(k * (i / 512 - 1)) / k; shL.curve = c; shR.curve = c; }
  };
  D.dispose = () => { try { wow.stop(); flu.stop(); merge.disconnect(); } catch (e) {} };
  return D;
}

/* ── reverb: impulse responses are synthesised, seeded, and the same on every run ── */
export function makeIR(ctx, type, size) {
  const sr = ctx.sampleRate, dur = type === 'spring' ? 1.2 + size * 2.6 : 0.7 + size * 4.6;
  const len = Math.floor(dur * sr), buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch), r = mulberry32(hash('ir', type, ch));
    if (type === 'spring') {
      // A spring: the impulse comes back as a train of chirps, low frequencies first, each pass longer and duller.
      const T = (0.031 + 0.012 * ch + 0.02 * size), passes = Math.floor(dur / T);
      for (let k = 0; k < passes; k++) {
        const t0 = Math.floor((k * T * (1 + 0.013 * (r() - 0.5))) * sr), L = Math.floor(Math.min(T * (0.55 + 0.35 * k), T * 3.5) * sr);
        const amp = Math.pow(0.001, k * T / dur) * (k ? 1 : 0.6), top = 4300 * Math.pow(0.93, k) + 500;
        let ph = r() * 6.28;
        for (let i = 0; i < L && t0 + i < len; i++) {
          const x = i / L, fq = 120 + (top - 120) * Math.pow(x, 1.7);
          ph += 2 * Math.PI * fq / sr;
          d[t0 + i] += Math.sin(ph) * amp * Math.sin(Math.PI * x) * (1 - 0.6 * x);
        }
      }
      let lp = 0; for (let i = 0; i < len; i++) { lp += (d[i] + (r() * 2 - 1) * 0.02 * Math.pow(0.001, i / len) - lp) * 0.45; d[i] = lp; }
    } else {
      // A plate: dense from the first millisecond, bright, the top fading faster than the body.
      let lp = 0, lp2 = 0;
      for (let i = 0; i < len; i++) {
        const x = i / len, n = r() * 2 - 1;
        lp += (n - lp) * (0.75 - 0.6 * x); lp2 += (lp - lp2) * 0.9;
        d[i] = lp2 * Math.pow(0.001, x) * Math.min(1, i / (0.004 * sr));
      }
    }
    const fade = Math.floor(0.02 * sr); for (let i = 0; i < fade; i++) d[len - 1 - i] *= i / fade;
  }
  return buf;
}

export function makeReverb(ctx) {
  const R = { in: ctx.createGain(), out: ctx.createGain(), pre: ctx.createBiquadFilter(), conv: ctx.createConvolver(), damp: ctx.createBiquadFilter(), key: '' };
  R.pre.type = 'highpass'; R.pre.Q.value = 0.6; R.damp.type = 'lowpass'; R.damp.Q.value = 0.6;
  R.in.connect(R.pre); R.pre.connect(R.conv); R.conv.connect(R.damp); R.damp.connect(R.out);
  R.setIR = (type, size) => {
    const key = type + ':' + Math.round(size * 40);
    if (key === R.key) return;
    R.key = key; R.conv.buffer = makeIR(ctx, type, Math.round(size * 40) / 40);
  };
  return R;
}

/* ── master: DJ filter → tape saturation → compressor → limiter → safety clip → volume ── */
export function makeMaster(ctx, dynamics = true) {
  const M = { in: ctx.createGain(), hp: ctx.createBiquadFilter(), lp: ctx.createBiquadFilter(), sat: ctx.createWaveShaper(),
    comp: ctx.createDynamicsCompressor(), post: ctx.createGain(), lim: ctx.createDynamicsCompressor(), clip: ctx.createWaveShaper(), vol: ctx.createGain(), satAmt: -1 };
  M.hp.type = 'highpass'; M.lp.type = 'lowpass'; M.sat.oversample = '2x';
  M.comp.attack.value = 0.012; M.comp.release.value = 0.22; M.comp.knee.value = 10;
  M.lim.threshold.value = -2.5; M.lim.knee.value = 0; M.lim.ratio.value = 20; M.lim.attack.value = 0.002; M.lim.release.value = 0.09;
  M.clip.curve = clipCurve();
  M.in.gain.value = 0.8; M.in.connect(M.hp); M.hp.connect(M.lp);
  if (dynamics) { M.lp.connect(M.sat); M.sat.connect(M.comp); M.comp.connect(M.post); M.post.connect(M.lim); M.lim.connect(M.clip); } else M.lp.connect(M.clip);
  M.clip.connect(M.vol);
  M.out = M.vol;
  return M;
}
/* One knob: left of centre a high-pass climbs, right of centre a low-pass comes down. */
export function djFilter(dj) {
  const a = Math.abs(dj) < 0.03 ? 0 : (Math.abs(dj) - 0.03) / 0.97;
  return { hp: dj < 0 ? 20 * Math.pow(2, a * 7.6) : 20, lp: dj > 0 ? 20000 * Math.pow(2, -a * 7) : 20000, q: 0.7 + a * 1.6 };
}
