/* Bubbling: sound does not stir the paint at random, it raises bubbles at chosen places.
   A dozen vents drift slowly over the sheet, each listening to one band. When that band's gate opens, some of its
   vents let a bubble out: a drop whose radius grows from zero, so the paint is really pushed aside. Size follows the
   loudness of the hit; kick makes large slow bubbles, mid medium ones, high small quick ones. The busier the music,
   the more vents answer. Between hits the chosen vents breathe (a reversible swelling in the shader). */
import { P } from './params.js';
import { S, rnd, clamp, mixf, viewWin } from './state.js';
import { AU } from './audio.js';
import { MB } from './engine.js';
import { psrdGrad } from './noise.js';
import { WET } from './fx.js';

/* per band: number of vents, bubble radius at the softest and loudest hit, growth time, breathing reach and depth */
const SPEC = [
  { n:3, r:[0.028, 0.07], dur:[1.5, 1.0], rho:0.13, amp:0.42, gap:0.18 },
  { n:4, r:[0.013, 0.032], dur:[0.6, 0.45], rho:0.075, amp:0.36, gap:0.12 },
  { n:6, r:[0.005, 0.012], dur:[0.26, 0.18], rho:0.04, amp:0.3, gap:0.07 },
];
export const BUB = {
  vents:[], seen:[0, 0, 0], pend:[null, null, null], count:[0, 0, 0], area:[0, 0, 0],
  init(){
    this.vents = [];
    SPEC.forEach((sp, band) => { for (let i = 0; i < sp.n; i++) this.vents.push({ band, x:rnd(0.3, 0.7), y:rnd(0.3, 0.7), sel:false, amp:0, last:-9, seed:rnd(0, 50), cyc:[], ci:0 }); });
  },
  cycle(v){
    const a = MB.dye(), b = MB.dye();
    v.cyc = Math.random() < 0.5 ? [a, b] : [a, [0, 0, 0, 0], b]; v.ci = 0;
    if (!v.cyc.some(d => d.some(x => x > 0))) v.cyc[0] = [0, 0, 0, 0].map((_, i) => (i === ((Math.random() * 4) | 0) ? 1 : 0));
  },
  emit(v, L){
    const sp = SPEC[v.band];
    if (MB.rclock - v.last < sp.gap) return;
    if (MB.ops.reduce((n, o) => n + (o.live && o.rt ? 1 : 0), 0) > 34) return;
    if (!v.cyc.length || v.ci >= v.cyc.length) { if (!v.cyc.length || Math.random() < 0.35) this.cycle(v); v.ci = 0; }
    const R = Math.min(0.16, mixf(sp.r[0], sp.r[1], L) * P.mSize * Math.pow(P.scale, 0.7));
    MB.drop(v.x, v.y, R, v.cyc[v.ci++], { dur:mixf(sp.dur[0], sp.dur[1], L), rt:true });
    if (P.wet > 0) WET.push(v.x, v.y, R, 1);
    v.last = MB.rclock; this.count[v.band]++; this.area[v.band] += Math.PI * R * R;
  },
  /* a hit of one band: pick the vents that answer. Few when the music is sparse, all of them when it is busy. */
  hit(band, L){
    const mine = this.vents.filter(v => v.band === band);
    const m = clamp(Math.round(mine.length * mixf(0.3, 1, AU.activity)), 1, mine.length);
    mine.forEach(v => { v.sel = false; });
    const pool = mine.slice();
    for (let i = 0; i < m; i++) pool.splice((Math.random() * pool.length) | 0, 1)[0].sel = true;
    if (Math.random() < P.bubbling) for (const v of mine) if (v.sel) this.emit(v, L);
  },
  update(rdt){
    const w = viewWin(), cx = (w[0] + w[2]) / 2, cy = (w[1] + w[3]) / 2, hx = (w[2] - w[0]) * 0.44, hy = (w[3] - w[1]) * 0.42;
    const sp = (0.006 + 0.02 * P.drift) * Math.max(0.3, P.tempo / 0.3), al = S.time * 0.07;
    for (const v of this.vents) {
      const g = psrdGrad(v.x * 2.4 + v.seed, v.y * 2.4 - v.seed, al + v.seed);
      v.x += g[1] * sp * rdt; v.y -= g[0] * sp * rdt;                       // curl of the noise
      const ex = (v.x - cx) / hx, ey = (v.y - cy) / hy;                      // soft walls keep the vents on screen
      if (Math.abs(ex) > 0.8) v.x -= Math.sign(ex) * (Math.abs(ex) - 0.8) * hx * Math.min(1, rdt * 4);
      if (Math.abs(ey) > 0.8) v.y -= Math.sign(ey) * (Math.abs(ey) - 0.8) * hy * Math.min(1, rdt * 4);
      v.x = clamp(v.x, cx - hx, cx + hx); v.y = clamp(v.y, cy - hy, cy + hy);
    }
    for (let b = 0; b < 3; b++) {
      const s = AU.b[b];
      if (s.hits !== this.seen[b]) { this.seen[b] = s.hits; if (!this.pend[b]) this.pend[b] = { t:0, L:0 }; }
      const p = this.pend[b];
      if (p) { p.t += rdt; p.L = Math.max(p.L, s.level); if (p.t >= 0.04) { this.pend[b] = null; this.hit(b, clamp(p.L, 0, 1)); } }
    }
    // breathing: the chosen vents follow their band's envelope
    const fx = MB.fx, k = Math.pow(P.scale, 0.5); let n = 0;
    for (const v of this.vents) {
      const spc = SPEC[v.band], want = v.sel && P.pulse > 0 ? Math.min(0.62, AU.pulse[v.band] * P.pulse * spc.amp) : 0;
      v.amp += (want - v.amp) * Math.min(1, rdt * (want > v.amp ? 40 : 9));
      if (v.amp > 0.004 && n < 16) { fx.vents[n * 4] = v.x; fx.vents[n * 4 + 1] = v.y; fx.vents[n * 4 + 2] = spc.rho * k; fx.vents[n * 4 + 3] = v.amp; n++; }
    }
    fx.ventN = n;
  },
};
