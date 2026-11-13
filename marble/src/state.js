/* Shared run-time state and small helpers. */
import { P } from './params.js';

export const S = {
  time:0, W:0, H:0, PR:null, scene:null, bloom:[],
  mod:{ shimmer:0, light:1 },
  bal:{ dye:0.8, lum:0.25, ch:[0.2, 0.2, 0.2, 0.2], ok:false, autoExp:1 },
  ptr:{ down:false, x:0.5, y:0.5, lx:0.5, ly:0.5, stroke:0, id:null },
  held:{ shift:false },
};
export const rnd = (a, b) => a + Math.random() * (b - a);
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const mixf = (a, b, t) => a + (b - a) * t;
export const ease = s => s * s * (3 - 2 * s);

/* The paint lives in the unit square; the screen shows its middle, with a margin of paint beyond every edge. */
export const MARGIN = 1.12;
export function view(){ return { cx:S.W / 2, cy:S.H / 2, size:Math.max(S.W, S.H) * P.zoom * MARGIN }; }
export function viewWin(){
  const v = view();
  return [0.5 - v.cx / v.size, 0.5 - v.cy / v.size, 0.5 + (S.W - v.cx) / v.size, 0.5 + (S.H - v.cy) / v.size];
}
export function randInView(grow = 0){
  const w = viewWin(), gx = (w[2] - w[0]) * grow, gy = (w[3] - w[1]) * grow;
  return [rnd(w[0] - gx, w[2] + gx), rnd(w[1] - gy, w[3] + gy)];
}
export function tempoNow(){ return P.tempo * (S.held.shift ? 3 : 1); }
export function dyeVec(i, k = 1){ const v = [0, 0, 0, 0]; v[((i % 4) + 4) % 4] = k; return v; }
export const rndDye = () => (Math.random() * 4) | 0;
export function scarceDye(){
  const b = S.bal;
  if (!b.ok) return rndDye();
  const w = b.ch.map(c => 1 / (c / Math.max(b.dye, 1e-3) + 0.08)), sum = w.reduce((a, c) => a + c, 0);
  let r = Math.random() * sum; for (let i = 0; i < 4; i++) { r -= w[i]; if (r <= 0) return i; } return 3;
}
