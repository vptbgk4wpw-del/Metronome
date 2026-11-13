/* Offline rendering: the same graph and the same generator as the live engine, in an OfflineAudioContext.
   Used for the WAV loop and stems, and by the tests. */
import { PARTS, clone, tuningOf } from './state.js';
import { barEvents, pitchesOf, autoScene, STEPS, SWING } from './sequence.js';
import { buildGraph } from './graph.js';
import { loadWorklets } from './fx.js';

const setPath = (S, path, value) => { const k = path.split('.'), last = k.pop(); let o = S; for (const x of k) o = o[x]; o[last] = value; };
const TUNING = /^(key|scale|a4|offsets|custom)/;

/* state: a Dub state. bars: how many bars to play from startBar. tail: seconds rendered after the last bar.
   timeline: [{ bar, step?, set: { 'delay.freeze': true }, throw: { stab: true } }] — moves made while it plays.
   solo: render one part alone. dynamics: false bypasses master saturation, compressor and limiter (for stems). */
export async function renderOffline(state, { bars = 4, startBar = 0, tail = 0, sampleRate = 44100, timeline = [], solo = null, dynamics = true, audit = null, tape = true } = {}) {
  const S = clone(state);
  if (solo) for (const p of PARTS) { S.parts[p].solo = p === solo; S.parts[p].mute = S.parts[p].mute && p === solo; }
  let tun = tuningOf(S), total = 0;
  { const T = clone(S); for (let b = 0; b < bars; b++) { for (const m of timeline) if (m.bar === b && m.set && m.set.tempo) T.tempo = m.set.tempo; total += STEPS * 15 / T.tempo; } }
  const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  const ctx = new OAC(2, Math.ceil((total + tail) * sampleRate), sampleRate);
  const hasTape = tape ? await loadWorklets(ctx) : false;
  const G = buildGraph(ctx, { tape: hasTape, audit, dynamics });
  G.apply(S, tun, 0, true); G.setRunning(true, 0);
  G.out.connect(ctx.destination);
  const events = [];
  let t = 0, forcePad = false;
  for (let b = 0; b < bars; b++) {
    const sd0 = 15 / S.tempo, moves = timeline.filter(m => m.bar === b).sort((x, y) => (x.step || 0) - (y.step || 0));
    for (const m of moves) {
      const at = t + (m.step || 0) * sd0; let retune = false;
      for (const [path, v] of Object.entries(m.set || {})) { setPath(S, path, v); if (TUNING.test(path)) retune = true; }
      if (retune) { tun = tuningOf(S); if (!(m.step > 0)) { G.fadePads(at); forcePad = true; } }
      for (const [part, on] of Object.entries(m.throw || {})) G.throws[part] = !!on;
      G.apply(S, tun, at);
    }
    const sd = 15 / S.tempo, bar = startBar + b, scene = S.auto ? autoScene(S, bar) : S.scene;
    const anySolo = PARTS.some(p => S.parts[p].solo);
    for (const ev of barEvents(S, tun, bar, { scene, forcePad })) {
      const P = S.parts[ev.part];
      if (P.mute || (anySolo && !P.solo)) continue;
      const time = t + ev.step * sd + (ev.step % 2 ? S.swing * sd * SWING : 0), hz = pitchesOf(tun, ev);
      G.play(ev, hz, time, sd, S);
      events.push({ part: ev.part, kind: ev.kind, time, bar, step: ev.step, vel: ev.vel, hz });
    }
    forcePad = false;
    t += STEPS * sd;
  }
  G.setRunning(false, t);
  const buffer = await ctx.startRendering();
  return { buffer, seconds: t, events, tape: hasTape, sampleRate };
}
