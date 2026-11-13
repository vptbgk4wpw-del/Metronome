/* Two optional layers, both off by default.
   Wet: a low-resolution velocity field (after Pavel Dobryakov's WebGL-Fluid-Simulation, MIT) that carries the baked
   paint between operations through a displacement map, and lets the stylus stir freely.
   Ox gall: Gray-Scott reaction-diffusion living inside the stains. */
import { gl, run, makeFBO, makeDouble, clearT } from './gl.js';
import { P, QUAL } from './params.js';
import { S, mixf } from './state.js';
import { MB } from './engine.js';

export const WET = {
  res:0, vel:null, pres:null, div:null, curl:null, disp:null,
  ensure(){
    const r = QUAL[P.quality].wet;
    if (this.vel && this.res === r) return;
    this.free(); this.res = r;
    this.vel = makeDouble(r, r); this.pres = makeDouble(r, r); this.div = makeFBO(r, r); this.curl = makeFBO(r, r);
    this.disp = makeDouble(r * 2, r * 2);
  },
  free(){ for (const k of ['vel', 'pres', 'div', 'curl', 'disp']) if (this[k]) { this[k].del(); this[k] = null; } },
  clearDisp(){ if (this.disp) { clearT(this.disp.read); clearT(this.disp.write); } },
  splat(mode, x, y, r, val){
    if (!this.vel) return;
    run(S.PR.wSplat, this.vel.write, { uTarget:this.vel.read.tex, uPoint:[x, y], uValue:val, uRadius:r * r, uMode:{ i:mode } });
    this.vel.swap();
  },
  /* pointer speed arrives in domain units per second; the grid works in texels per second */
  stir(x, y, vx, vy, r){ this.splat(0, x, y, r * 0.8, [vx * this.res * 0.35, vy * this.res * 0.35, 0]); },
  push(x, y, R, k){ this.splat(1, x, y, R * 2.2, [k * R * this.res * 6, 0, 0]); },
  step(dt){
    this.ensure();
    const PR = S.PR, vt = this.vel.texel;
    run(PR.wCurl, this.curl, { uVel:this.vel.read.tex, uTexel:vt });
    run(PR.wForce, this.vel.write, { uVel:this.vel.read.tex, uCurl:this.curl.tex, uTexel:vt, uCurlStr:6, uDt:dt, uTime:S.time, uDrift:P.wetFlow * (0.3 + P.drift), uRes:this.res, uScale:P.scale }); this.vel.swap();
    run(PR.wDiv, this.div, { uVel:this.vel.read.tex, uTexel:vt });
    run(PR.scale, this.pres.write, { uSrc:this.pres.read.tex, uMul:0.8 }); this.pres.swap();
    for (let i = 0; i < 14; i++) { run(PR.wPressure, this.pres.write, { uP:this.pres.read.tex, uDiv:this.div.tex, uTexel:vt }); this.pres.swap(); }
    run(PR.wGradsub, this.vel.write, { uP:this.pres.read.tex, uVel:this.vel.read.tex, uTexel:vt }); this.vel.swap();
    run(PR.wAdvect, this.vel.write, { uVel:this.vel.read.tex, uSrc:this.vel.read.tex, uTexel:vt, uDt:dt, uDiss:1 / (1 + (0.15 + P.wetVisc * 2.5) * dt) }); this.vel.swap();
    run(PR.wDisp, this.disp.write, { uVel:this.vel.read.tex, uSrc:this.disp.read.tex, uTexel:vt, uDt:dt }); this.disp.swap();
  },
};

/* gallKind runs from veins (a maze of open lines) to separate cells (round holes) */
const RD_SETS = [[0.029, 0.057], [0.0367, 0.0649]];
export const GALL = {
  rd:null, res:0,
  ensure(){
    const r = QUAL[P.quality].rd;
    if (this.rd && this.res === r) return;
    if (this.rd) this.rd.del();
    this.res = r; this.rd = makeDouble(r, r, { wrap:gl.MIRRORED_REPEAT });
    const d = MB.dummy.tex;                 // the samplers must not point at the texture being written
    run(S.PR.gall, this.rd.read, { uInit:1, uRD:d, uBase:d }); run(S.PR.gall, this.rd.write, { uInit:1, uRD:d, uBase:d });
  },
  free(){ if (this.rd) { this.rd.del(); this.rd = null; } },
  step(n){
    this.ensure();
    const t = P.gallKind, a = RD_SETS[0], b = RD_SETS[1];
    for (let j = 0; j < n; j++) {
      run(S.PR.gall, this.rd.write, { uRD:this.rd.read.tex, uBase:MB.base.read.tex, uTexel:this.rd.texel, uF:mixf(a[0], b[0], t), uK:mixf(a[1], b[1], t), uSeed:Math.random() * 100, uInit:0 });
      this.rd.swap();
    }
  },
};

export function fxInit(){
  const fx = MB.fx;
  fx.disp = () => WET.disp.read.tex;
  fx.onWetBake = () => WET.clearDisp();
  fx.stir = (x, y, vx, vy, r) => WET.stir(x, y, vx, vy, r);
  fx.gall = () => GALL.rd.read.tex;
}
export function fxStep(rdt){
  const fx = MB.fx, on = P.wet > 0;
  if (on && !fx.wet) { WET.ensure(); WET.clearDisp(); clearT(WET.vel.read); MB.wetT = 0; }
  if (!on && fx.wet) { MB.fx.wet = true; MB.bake(false, true); WET.free(); }   // keep what the water did, then let it go
  fx.wet = on;
  if (on) WET.step(rdt);
  if (P.gall > 0) GALL.step(P.quality === 0 ? 4 : 8); else if (GALL.rd) GALL.free();
}
