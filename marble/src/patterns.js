/* Classic marbling patterns as ready sequences of operations, each animated over two to four seconds.
   Every pattern except Stone needs paint to work on, so on a nearly clean bath it throws a stone ground first. */
import { P } from './params.js';
import { S, rnd, viewWin, dyeVec } from './state.js';
import { MB } from './engine.js';

/* L is the long side of the visible sheet. Every spacing is a share of L and every pull a share of its own spacing,
   so a pattern has the same few, wide figures on a phone held upright as on a projector, and is never pulled so far
   that the paint is drawn out thinner than a pixel. Form scale makes the figures larger or smaller. */
const geo = () => { const w = viewWin(), ww = w[2] - w[0], hh = w[3] - w[1]; return { x0:w[0], y0:w[1], x1:w[2], y1:w[3], ww, hh, L:Math.max(ww, hh), k:Math.pow(P.scale, 0.5) }; };
const comb = (t, nx, ny, A, sp, off, c, dur = 0.75) => MB.later(t, () => MB.comb({ nx, ny, A, sp, off, c, dur, rt:true }));

/* Stone (battal): pigment thrown from the brush, large drops first, then a rain of small ones and a few of clear gall.
   The drops together hold a little more paint than the sheet has room for, so the ground closes up. */
function stone(t0 = 0, span = 2.2, fill = 1.6){
  const g = geo(), area = (g.ww + 0.08) * (g.hh + 0.08) * fill, n = Math.round(36 / (g.k * g.k));
  const rs = Math.sqrt(area / (1.9 * n * Math.PI));
  for (let i = 0; i < n; i++) {
    const big = i < n * 0.3, R = (big ? 2 : 1) * rs * rnd(0.8, 1.2);
    MB.later(t0 + span * (i / n) * rnd(0.85, 1), () => {
      const x = rnd(g.x0 - 0.04, g.x1 + 0.04), y = rnd(g.y0 - 0.04, g.y1 + 0.04);
      const dye = i < 4 ? dyeVec(i, 1) : (!big && Math.random() < 0.12 ? [0, 0, 0, 0] : MB.dye());
      MB.drop(x, y, R, dye, { dur:rnd(0.35, 0.6), rt:true });
    });
  }
  return t0 + span + 0.5;
}
function ground(){ return !S.bal.ok || S.bal.dye < 0.5 ? stone(0, 1.3, 1.5) : 0; }

/* Gel-git ("come and go"): a wide comb up, then down between the first lines; the same again across */
function gelgit(t, g, both = true, dur = 0.75){
  const sp = g.L / 4.5 * g.k, A = sp * 0.85;
  comb(t, 1, 0, A, sp, g.x0, sp * 0.34, dur); comb(t + dur, 1, 0, -A, sp, g.x0 + sp / 2, sp * 0.34, dur);
  if (!both) return t + dur * 2;
  const sp2 = sp * 1.3, B = sp2 * 0.4;
  comb(t + dur * 2, 0, 1, B, sp2, g.y0, sp2 * 0.34, dur); comb(t + dur * 3, 0, 1, -B, sp2, g.y0 + sp2 / 2, sp2 * 0.34, dur);
  return t + dur * 4;
}
/* Nonpareil: gel-git lines, then one pass of a finer comb across them */
function nonpareil(t, g){
  t = gelgit(t, g, false, 0.7);
  const sp = g.L / 11 * g.k;
  comb(t, 0, 1, sp * 1.1, sp, g.y0, sp * 0.3, 1.1);
  return t + 1.1;
}
export const PATTERNS = [
  { id:'stone', name:'Stone', run(){ stone(); } },
  { id:'gelgit', name:'Gel-git', run(){ gelgit(ground(), geo()); } },
  { id:'nonpareil', name:'Nonpareil', run(){ nonpareil(ground(), geo()); } },
  /* Chevron: fine upright streaks, then wide pulls left and right with soft tines, which fold them into zigzags */
  { id:'chevron', name:'Chevron', run(){
    const g = geo(); let t = ground();
    const fine = g.L / 9 * g.k; comb(t, 1, 0, fine * 1.4, fine, g.x0, fine * 0.3, 0.9); t += 0.9;
    const sp = g.L / 3.2 * g.k, A = sp * 0.42;
    comb(t, 0, 1, A, sp, g.y0, sp * 0.42, 0.9); comb(t + 0.9, 0, 1, -A, sp, g.y0 + sp / 2, sp * 0.42, 0.9);
  } },
  /* Bouquet (peacock): nonpareil, then a comb drawn up the sheet in a snaking line, which opens the arches into fans */
  { id:'bouquet', name:'Bouquet', run(){
    const g = geo(); let t = nonpareil(ground(), g);
    const sp = g.L / 4.5 * g.k, steps = 16, tines = Math.ceil(g.ww / sp) + 1, a = sp * 0.3, span = 1.6;
    const path = (j, s) => [g.x0 + j * sp + a * Math.sin(s * Math.PI * 2 * g.hh / (sp * 1.6)), g.y0 - 0.05 + (g.hh + 0.1) * s];
    for (let i = 1; i <= steps; i++) MB.later(t + span * i / steps, () => {
      for (let j = 0; j < tines; j++) { const p0 = path(j, (i - 1) / steps), p1 = path(j, i / steps); MB.push({ ty:4, x:p1[0], y:p1[1], R:sp * 0.17, mx:p1[0] - p0[0], my:p1[1] - p0[1], k:1, live:false }); }
    });
  } },
  /* Spanish wave: the sheet is rocked as it is laid, which presses the pattern into bands; here a ripple that squeezes
     and stretches along a diagonal, a second one across it, and a slow shear */
  { id:'spanish', name:'Spanish wave', run(){
    const g = geo(); const t = ground();
    const lam = g.L / 6 * g.k, fr = 6.283 / lam, ang = 0.5;
    const rip = (at, a, f, k, dur) => MB.later(at, () => MB.push({ ty:5, nx:Math.cos(a), ny:Math.sin(a), amp:0, A:k / f, fr:f, phs:rnd(0, 6.283), t:0, dur, live:true, rt:true }));
    MB.later(t, () => MB.push({ ty:3, nx:Math.cos(ang + 1.57), ny:Math.sin(ang + 1.57), amp:0, A:lam * 0.35, fr:6.283 / (g.L / 2.2), phs:rnd(0, 6.283), t:0, dur:1.4, live:true, rt:true }));
    rip(t + 0.5, ang, fr, 0.6, 1.6); rip(t + 1.3, ang - 0.38, fr * 1.13, 0.35, 1.5);
  } },
  /* French curl (snail): a grid of small whirls, each wound up by a stylus */
  { id:'curl', name:'French curl', run(){
    const g = geo(); const t = ground();
    const sp = g.L / 4.5 * g.k, nx = Math.ceil(g.ww / sp) + 1, ny = Math.ceil(g.hh / sp) + 1;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = g.x0 + (i + 0.5 * (j % 2)) * sp, y = g.y0 + (j + 0.25) * sp;
      MB.later(t + 0.06 * (i + j), () => MB.vortex(false, { x, y, A:4.2, lam:sp * 0.3, dur:2.2, rt:true }));
    }
  } },
];
export function runPattern(id){ const p = PATTERNS.find(q => q.id === id); if (p) { MB.toolEnd(); p.run(); } return p; }
