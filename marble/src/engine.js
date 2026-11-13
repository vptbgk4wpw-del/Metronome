/* Marble: a short stack of exact maps on top of a baked texture (Szalka's "Marmur" engine, full screen).
   Live ops (growing drops, combs easing in) change every frame; once the stack gets long, the finished prefix is
   baked into the texture in one resample. Baked ops are also kept in a history on top of a key frame, so a print
   can replay them analytically at any resolution. */
import { gl, run, makeFBO, makeDouble, clearT, mips } from './gl.js';
import { P, QUAL, PAL } from './params.js';
import { S, rnd, clamp, ease, view, viewWin, randInView, dyeVec, rndDye, scarceDye, MARGIN } from './state.js';
import { lutFor, LUT_N } from './color.js';

export const MAXOPS = 192, BAKE_AT = 48, HIST_MAX = 420;
const OPW = (MAXOPS + HIST_MAX) * 2;

export const MB = {
  ops:[], hist:[], base:null, key:null, ev:null, opTex:null, buf:new Float32Array(OPW * 4), dummy:null,
  clock:0, rclock:0, win:[0, 0, 1, 1], hold:null, ring:null, combStart:null, queue:[], bakes:0, wetT:0,
  tm:{ bubble:0.3, wave:0.2, comb:9, vortex:1 },
  /* set by the other modules */
  fx:{ disp:null, wet:false, onWetBake:null, gall:null, ventN:0, vents:new Float32Array(64) },

  alloc(){
    if (this.base) this.base.del();
    if (this.key) { this.key.del(); this.key = null; }
    const q = QUAL[P.quality], b = q.mb, o = { mrt:true, wrap:gl.MIRRORED_REPEAT, mip:true };
    this.base = makeDouble(b, b, o);
    if (q.hist) this.key = makeFBO(b, b, { wrap:gl.MIRRORED_REPEAT, mip:true });
    if (!this.dummy) this.dummy = makeFBO(1, 1);
    if (!this.opTex) {
      this.opTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.opTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, OPW, 1, 0, gl.RGBA, gl.FLOAT, null);
    }
    this.reset();
  },
  reset(){
    run(S.PR.initBase, this.base.read, {}); run(S.PR.initBase, this.base.write, {}); mips(this.base.read.tex);
    if (this.key) { clearT(this.key); mips(this.key.tex); }
    this.ops = []; this.hist = []; this.queue = []; this.hold = null; this.ring = null;
  },
  size(a, b){ return Math.min(0.2, rnd(a, b) * P.mSize * Math.pow(P.scale, 0.7)); },
  /* the next pigment: the scarcest one, sometimes with a second pigment stirred in, sometimes clear water.
     Water gets likelier as the bath fills up, so the sheet stays open without running empty. */
  dye(){
    const cov = S.bal.ok ? S.bal.dye : 0.8;
    if (Math.random() < clamp(P.mWater + (cov - 0.85) * 1.5, 0.02, 0.6)) return [0, 0, 0, 0];
    const v = dyeVec(scarceDye(), rnd(0.75, 1.05));
    if (Math.random() < 0.3) v[rndDye()] += rnd(0.2, 0.6);
    return v;
  },
  push(o){ if (this.ops.length >= MAXOPS - 2) this.bake(true); this.ops.push(o); return o; },
  later(delay, fn){ this.queue.push({ at:this.rclock + delay, fn }); },
  drop(x, y, R, dye, o = {}){
    return this.push({ ty:0, x, y, R, r:o.instant ? R : 0, dye, t:0, dur:o.dur != null ? o.dur : rnd(1.2, 2.4), live:!o.instant, rt:!!o.rt });
  },
  rings(x, y, n, R, now){
    const A = this.dye(); let B = this.dye();
    if (A.join() === B.join()) B = A.some(v => v > 0) ? (Math.random() < 0.5 ? [0, 0, 0, 0] : dyeVec(A.indexOf(Math.max(...A)) + 2, rnd(0.8, 1))) : dyeVec(scarceDye(), 1);
    const gap = rnd(0.35, 0.6) / Math.max(0.15, P.tempo);
    for (let i = 0; i < n; i++) {
      const mk = () => this.drop(x, y, R * rnd(0.85, 1.1), i % 2 ? B : A, now ? { instant:true } : { dur:rnd(0.5, 0.9) });
      if (now) mk(); else this.later(i * gap, mk);
    }
  },
  wave(done){
    if (P.waves <= 0) return;
    const a = rnd(0, 6.283), lam = rnd(0.25, 0.6) * Math.pow(P.scale, 0.7), A = rnd(0.018, 0.045) * P.waves * 1.4 * Math.pow(P.scale, 0.5);
    this.push({ ty:3, nx:Math.cos(a), ny:Math.sin(a), amp:done ? A : 0, A, fr:6.283 / lam, phs:rnd(0, 6.283), t:0, dur:rnd(2.5, 5), live:!done });
  },
  comb(o){
    const a = rnd(0, 6.283), sp = rnd(0.07, 0.16) * Math.pow(P.scale, 0.7);
    return this.push(Object.assign({ ty:1, nx:Math.cos(a), ny:Math.sin(a), amp:0, A:rnd(0.025, 0.06) * (0.4 + P.drift) * (Math.random() < 0.5 ? 1 : -1), off:rnd(0, sp), sp, c:sp * rnd(0.12, 0.25), t:0, dur:rnd(2, 4), live:true }, o));
  },
  vortex(done, o){
    const [x, y] = randInView(), A = (Math.random() < 0.5 ? -1 : 1) * rnd(0.8, 2.2) * Math.pow(Math.max(P.swirl, 1) / 10, 0.7);
    return this.push(Object.assign({ ty:2, x, y, ang:done ? A : 0, A, lam:rnd(0.07, 0.16) * Math.pow(P.scale, 0.7), t:0, dur:rnd(2.5, 5), live:!done }, o));
  },
  bubble(){
    const [x, y] = randInView(0.05), R = this.size(0.035, 0.1);
    if (Math.random() < P.mRings) this.rings(x, y, 3 + ((Math.random() * 4) | 0), R * 0.7);
    else this.drop(x, y, R, this.dye());
  },
  upd(o, dt){
    o.t += dt; const s = Math.min(1, o.t / o.dur);
    if (o.ty === 0) {
      o.r = o.R * Math.sqrt(1 - Math.pow(1 - s, 2.5));
      if (s >= 1) { o.r = o.R; o.live = false; }
    } else {
      const v = o.A * ease(s);
      if (o.ty === 2) o.ang = v; else o.amp = v;
      if (s >= 1) o.live = false;
    }
  },
  seed(){
    const n = Math.max(30, Math.round(110 / Math.pow(P.scale, 1.3)));
    for (let i = 0; i < n; i++) { const [x, y] = randInView(0.12); this.drop(x, y, this.size(0.02, 0.085), i < 4 ? dyeVec(i, rnd(0.8, 1)) : this.dye(), { instant:true }); }
    for (let i = 0; i < 3; i++) { const [x, y] = randInView(-0.1); this.rings(x, y, 4 + ((Math.random() * 3) | 0), this.size(0.03, 0.06), true); }
    const w = P.waves; if (w <= 0) P.waves = 0.5;
    this.wave(true); this.wave(true); P.waves = w;
    this.vortex(true);
  },
  /* dt follows Tempo; rdt is real time, for everything tied to the music or to a pattern */
  step(dt, rdt){
    this.clock += dt; this.rclock += rdt;
    if (this.queue.length) { const due = this.queue.filter(q => q.at <= this.rclock); this.queue = this.queue.filter(q => q.at > this.rclock); due.forEach(q => q.fn()); }
    for (const o of this.ops) if (o.live && !o.held) this.upd(o, o.rt ? rdt : dt);
    const T = this.tm;
    if (P.drift > 0) {
      if ((T.wave -= dt) <= 0) { this.wave(); T.wave = rnd(1.2, 2.6) / (0.3 + P.drift); }
      if ((T.comb -= dt) <= 0) { this.comb(); T.comb = rnd(14, 28) / (0.3 + P.drift); }
    }
    if (P.swirl > 0 && (T.vortex -= dt) <= 0) { this.vortex(); T.vortex = rnd(1.4, 3.2) / (0.25 + P.swirl / 10); }
    if (P.auto && P.mBubble > 0 && (T.bubble -= dt) <= 0) { this.bubble(); T.bubble = -Math.log(1 - Math.random() * 0.95) / P.mBubble; }
    this.wetT += rdt;
    const wetDue = this.fx.wet && this.wetT > 8;
    if (this.ops.length >= BAKE_AT || wetDue) this.bake(this.ops.length >= MAXOPS - 24, wetDue);
  },
  pack(list, at){
    const b = this.buf;
    for (let i = 0; i < list.length; i++) {
      const o = list[i], j = (at + i) * 8;
      if (o.ty === 0) { b[j] = 0; b[j + 1] = o.x; b[j + 2] = o.y; b[j + 3] = o.r; b[j + 4] = o.dye[0]; b[j + 5] = o.dye[1]; b[j + 6] = o.dye[2]; b[j + 7] = o.dye[3]; }
      else if (o.ty === 1) { b[j] = 1; b[j + 1] = o.nx; b[j + 2] = o.ny; b[j + 3] = o.amp; b[j + 4] = o.off; b[j + 5] = o.sp; b[j + 6] = o.c; b[j + 7] = 0; }
      else if (o.ty === 2) { b[j] = 2; b[j + 1] = o.x; b[j + 2] = o.y; b[j + 3] = o.ang; b[j + 4] = o.lam; b[j + 5] = 0; b[j + 6] = 0; b[j + 7] = 0; }
      else if (o.ty === 4) { b[j] = 4; b[j + 1] = o.x; b[j + 2] = o.y; b[j + 3] = o.R; b[j + 4] = o.mx; b[j + 5] = o.my; b[j + 6] = o.k; b[j + 7] = 0; }
      else { b[j] = o.ty; b[j + 1] = o.nx; b[j + 2] = o.ny; b[j + 3] = o.amp; b[j + 4] = o.fr; b[j + 5] = o.phs; b[j + 6] = 0; b[j + 7] = 0; }
    }
    return at + list.length;
  },
  upload(...lists){
    let n = 0; for (const l of lists) n = this.pack(l, n);
    if (!n) return 0;
    gl.bindTexture(gl.TEXTURE_2D, this.opTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, n * 2, 1, gl.RGBA, gl.FLOAT, this.buf, 0);
    return n;
  },
  evalU(base, n, win, px, breathe, n0 = 0){   // px: the size of one output pixel in paint coordinates
    const fx = this.fx;
    return { uBase:base.tex, uMcBase:this.base.read.tex2, uOps:this.opTex, uN:{ i:n }, uN0:{ i:n0 }, uBaseTexel:this.base.texel, uWin:win, uPx:px,
      uDisp:fx.wet && fx.disp ? fx.disp() : this.dummy.tex, uWet:fx.wet ? 1 : 0, uVN:{ i:breathe ? fx.ventN : 0 }, uVent:{ v4:fx.vents } };
  },
  bake(force, wet){
    const firstLive = () => { const k = this.ops.findIndex(o => o.live || o.held); return k < 0 ? this.ops.length : k; };
    let k = firstLive();
    if (force) while (k < Math.min(16, this.ops.length)) {
      const o = this.ops[k]; o.live = false; o.held = false; if (this.hold === o) this.hold = null; k = firstLive();
    }
    if (!wet && (k === 0 || (!force && k < 16))) return;
    this.upload(this.ops);
    run(S.PR.marbEval, this.base.write, this.evalU(this.base.read, k, [0, 0, 1, 1], this.base.texel[0], false));
    this.base.swap(); mips(this.base.read.tex); this.bakes++;
    const baked = this.ops.splice(0, k);
    if (this.fx.wet) { this.wetT = 0; if (this.fx.onWetBake) this.fx.onWetBake(); }
    if (this.key) {
      for (const o of baked) this.hist.push(o);
      if (this.fx.wet || this.hist.length > HIST_MAX - 60) { run(S.PR.copy, this.key, { uSrc:this.base.read.tex }); mips(this.key.tex); this.hist = []; }
    }
  },
  compU(ev, win, v, origin, px, tap){
    const pal = PAL(), fx = this.fx, cssMax = Math.max(innerWidth, innerHeight);
    return { uEv:ev.dye, uEvMc:ev.mc, uGall:P.gall > 0 && fx.gall ? fx.gall() : this.dummy.tex, uLut:{ t3:lutFor(pal) }, uLutN:LUT_N,
      uCenter:[v.cx, v.cy], uOrigin:origin, uTap:tap, uWin:win, uSize:v.size, uHalf:0.5 * Math.hypot(v.w, v.h), uPx:px, uGrainF:cssMax * MARGIN / 2.6,
      uLamp:pal.lampL, uBath:pal.bathL, uAbs:{ v3:pal.absF }, uMixKM:P.mixKM, uDyeDen:P.dyeDensity, uHot:P.hot, uLens:P.lens, uCaustic:P.caustic,
      uEdge:P.mEdge, uGran:P.gran, uStreak:P.streak, uPaper:P.paper, uGallK:P.gall > 0 && fx.gall ? P.gall : 0 };
  },
  render(target){
    const v = view(), win = this.win = viewWin(); v.w = S.W; v.h = S.H;
    const q = QUAL[P.quality].mq, cl = n => Math.max(64, Math.min(2560, Math.round(n)));
    const tw = cl(S.W * q), th = cl(S.H * q);
    if (!this.ev || tw !== this.ev.w || th !== this.ev.h) { if (this.ev) this.ev.del(); this.ev = makeFBO(tw, th, { mrt:true }); }
    const n = this.upload(this.ops);
    const aa = Math.max((win[2] - win[0]) / tw, (win[3] - win[1]) / th);
    run(S.PR.marbEval, this.ev, this.evalU(this.base.read, n, win, aa, true));
    run(S.PR.comp, target, this.compU({ dye:this.ev.tex, mc:this.ev.tex2 }, win, v, [0, 0], S.W / innerWidth, this.ev.texel));
  },
  event(){
    const [x, y] = randInView(-0.08);
    this.rings(x, y, 4 + ((Math.random() * 4) | 0), this.size(0.04, 0.08));
  },
  /* clear water pressed in under the pointer, the way a drop of ox gall opens the paint */
  pressAt(x, y){ this.drop(x, y, 0.1 * Math.pow(P.scale, 0.5), [0, 0, 0, 0], { dur:0.9, rt:true }); },
  endHold(){ if (this.hold) { this.hold.held = false; this.hold.live = false; this.hold = null; } },
  tool(dt, first){
    const ptr = S.ptr, r = P.brush / P.zoom, tool = P.tool, mx = ptr.x, my = ptr.y;
    if (tool !== 'drop' && tool !== 'swirl' && tool !== 'comb') this.endHold();
    if (tool === 'stylus') {
      const dx = mx - ptr.lx, dy = my - ptr.ly;
      if (dx * dx + dy * dy > 1e-9) {
        if (this.fx.wet && this.fx.stir) this.fx.stir(mx, my, dx / Math.max(dt, 1 / 240), dy / Math.max(dt, 1 / 240), r);
        else this.push({ ty:4, x:mx, y:my, R:r * 0.7, mx:dx, my:dy, k:1, live:false });
      }
    } else if (tool === 'drop') {
      let h = this.hold;
      if (h && (h.ty !== 0 || first || Math.hypot(mx - h.x, my - h.y) > Math.max(h.r * 0.8, r * 0.3))) { this.endHold(); h = null; }
      if (!h) h = this.hold = this.push({ ty:0, x:mx, y:my, R:0, r:0, dye:dyeVec(ptr.stroke, 1), t:0, held:true, live:true, r0:r * 0.35 });
      if (!first) h.t += dt;
      h.r = h.R = Math.min(0.45, Math.sqrt(h.r0 * h.r0 + 0.9 * r * r * h.t));
    } else if (tool === 'comb') {
      let h = this.hold;
      if (first || !this.combStart || (h && h.ty !== 1)) { this.endHold(); h = null; this.combStart = [mx, my]; }
      const dx = mx - this.combStart[0], dy = my - this.combStart[1], L = Math.hypot(dx, dy);
      if (!h) {
        if (L > 0.004) {
          const ux = dx / L, uy = dy / L, nx = uy, ny = -ux, sp = Math.max(0.02, r * 1.1);
          this.hold = this.push({ ty:1, nx, ny, ux, uy, amp:L, A:L, off:mx * nx + my * ny, sp, c:sp * 0.22, t:0, dur:1, held:true, live:true });
        }
      } else {
        const along = dx * h.ux + dy * h.uy, perp = Math.abs(dx * h.nx + dy * h.ny);
        h.amp = h.A = along;
        if (perp > Math.max(0.03, Math.abs(along) * 0.6)) { this.endHold(); this.combStart = [mx, my]; }   // the hand turned: a new pull starts here
      }
    } else if (tool === 'swirl') {
      let h = this.hold;
      if (h && (h.ty !== 2 || first || Math.hypot(mx - h.x, my - h.y) > r * 0.8)) { this.endHold(); h = null; }
      if (!h) h = this.hold = this.push({ ty:2, x:mx, y:my, ang:0, A:0, lam:r * 1.3, t:0, dur:1, held:true, live:true, dir:ptr.stroke % 2 ? -1 : 1 });
      h.ang += h.dir * dt * 2.4; h.A = h.ang;
    }
    ptr.lx = mx; ptr.ly = my;
  },
  toolEnd(){ this.endHold(); this.ring = null; this.combStart = null; },
};

/* ───────── measuring the frame: how full the bath is, which pigment is scarce, how bright the picture ───────── */
const meas = { fbo:null, pbo:null, sync:null, data:new Float32Array(512), t:0 };
export function measureInit(){
  meas.fbo = makeFBO(16, 8, { ifmt:gl.RGBA32F, type:gl.FLOAT, filter:gl.NEAREST });
  meas.pbo = gl.createBuffer();
}
function readMeasure(){
  let L = 0, N = 0; const C = [0, 0, 0, 0], d = meas.data, b = S.bal;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) {
    const i = (y * 16 + x) * 4;
    if (x < 8) { L += d[i]; N += d[i + 2]; } else { C[0] += d[i]; C[1] += d[i + 1]; C[2] += d[i + 2]; C[3] += d[i + 3]; }
  }
  if (N > 0) { b.lum = L / N; b.ch = C.map(c => c / N); b.dye = b.ch.reduce((a, c) => a + c, 0); b.ok = true; }
}
export function measureTick(dt){
  if (meas.sync && gl.getSyncParameter(meas.sync, gl.SYNC_STATUS) === gl.SIGNALED) {
    gl.deleteSync(meas.sync); meas.sync = null;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, meas.pbo); gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, meas.data); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    readMeasure();
    return;                                // the next readback starts on a later frame, once this one has been consumed
  }
  meas.t += dt;
  if (meas.sync || meas.t < 0.2 || !MB.ev) return;
  meas.t = 0;
  run(S.PR.measure, meas.fbo, { uScene:S.scene.tex, uEv:MB.ev.tex });
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, meas.pbo); gl.bufferData(gl.PIXEL_PACK_BUFFER, 512 * 4, gl.STREAM_READ);
  gl.readPixels(0, 0, 16, 8, gl.RGBA, gl.FLOAT, 0); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  meas.sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush();
}
export function measureNow(){
  if (!MB.ev) return;
  run(S.PR.measure, meas.fbo, { uScene:S.scene.tex, uEv:MB.ev.tex });
  gl.readPixels(0, 0, 16, 8, gl.RGBA, gl.FLOAT, meas.data);
  readMeasure();
}
export function exposureTick(dt){
  const b = S.bal; let want = 1;
  if (P.autoExp && b.ok) want = clamp(0.2 / Math.max(b.lum, 1e-3), 0.45, 1.6);
  b.autoExp += (want - b.autoExp) * Math.min(1, dt * 0.7);
}
