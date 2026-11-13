/* Marble — digital marbling for live visuals. Sister tool to Dish: same panel, same ears, a different engine. */
import './style.css';
import { gl, glError, canvas, program, run, makeFBO } from './gl.js';
import { VS, SRC } from './shaders.js';
import { P, PALETTES, PAL, QUAL } from './params.js';
import { S, rnd, clamp, view, tempoNow } from './state.js';
import { derive } from './color.js';
import { MB, measureInit, measureTick, measureNow, exposureTick } from './engine.js';
import { fxInit, fxStep, WET, GALL } from './fx.js';
import { AU, DUB } from './audio.js';
import { BUB } from './bubbling.js';
import { PATTERNS, runPattern } from './patterns.js';
import { REC, toast, saveBlob, stamp, toggleRec, openOutput, fullscreen, wake, pullPrint } from './output.js';
import { buildUI, syncUI, saveSoon, pickSource, toggleUI, applyPreset } from './ui.js';

const $ = s => document.querySelector(s);
function fatal(msg){ const f = $('#fatal'); f.hidden = false; f.querySelector('p').textContent = msg; }

function boot(){
  if (glError) { fatal(glError); return; }
  try { S.PR = {}; for (const k in SRC) S.PR[k] = program(VS, SRC[k]); }
  catch (e) { fatal('The shaders did not compile: ' + e.message); return; }
  for (const p of PALETTES) derive(p);

  /* ───────── sizing and post (from Dish) ───────── */
  function resize(){
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = Math.max(2, Math.round(innerWidth * dpr * P.renderScale)), h = Math.max(2, Math.round(innerHeight * dpr * P.renderScale));
    const cap = 3840 * 2160; if (w * h > cap) { const k = Math.sqrt(cap / (w * h)); w = Math.round(w * k); h = Math.round(h * k); }
    if (w === S.W && h === S.H && S.scene) return;
    S.W = w; S.H = h; canvas.width = w; canvas.height = h;
    if (S.scene) S.scene.del(); S.bloom.forEach(b => b.del()); S.bloom = [];
    S.scene = makeFBO(w, h);
    let bw = w >> 1, bh = h >> 1;
    for (let i = 0; i < 6 && bw >= 8 && bh >= 8; i++) { S.bloom.push(makeFBO(bw, bh)); bw >>= 1; bh >>= 1; }
    $('#hudRes').textContent = w + '×' + h;
  }
  function post(){
    const PR = S.PR, bloom = S.bloom, mod = S.mod;
    run(PR.bloomPre, bloom[0], { uSrc:S.scene.tex, uTexel:S.scene.texel, uThresh:P.glowThresh });
    for (let i = 1; i < bloom.length; i++) run(PR.down, bloom[i], { uSrc:bloom[i - 1].tex, uTexel:bloom[i - 1].texel });
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    for (let i = bloom.length - 1; i > 0; i--) run(PR.up, bloom[i - 1], { uSrc:bloom[i].tex, uTexel:bloom[i].texel });
    gl.disable(gl.BLEND);
    run(PR.final, null, { uScene:S.scene.tex, uBloom:bloom[0].tex, uGlow:P.glow * (0.6 + 0.4 * mod.light), uHal:P.halation, uAberr:P.aberr,
      uGrain:P.grain * (1 + mod.shimmer * 0.6), uGrainSize:P.grainSize * Math.max(1, S.W / 1920), uExposure:P.exposure * mod.light * S.bal.autoExp, uSat:P.sat, uTime:S.time, uFlick:P.flicker });
  }

  /* ───────── pointer ───────── */
  const ptr = S.ptr;
  function toSim(e){
    const r = canvas.getBoundingClientRect();
    const px = (e.clientX - r.left) * (S.W / r.width), py = (r.bottom - e.clientY) * (S.H / r.height);
    const v = view(); return [(px - v.cx) / v.size + 0.5, (py - v.cy) / v.size + 0.5];
  }
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId); ptr.id = e.pointerId;
    const [x, y] = toSim(e); ptr.down = true; ptr.x = ptr.lx = x; ptr.y = ptr.ly = y; ptr.stroke++;
    wake();
    if (AU.ctx && AU.ctx.state === 'suspended') AU.ctx.resume();
    MB.tool(0, true);
  });
  canvas.addEventListener('pointermove', e => {
    const [x, y] = toSim(e);
    if (!ptr.down) { ptr.x = ptr.lx = x; ptr.y = ptr.ly = y; return; }
    if (e.pointerId === ptr.id) { ptr.x = x; ptr.y = y; }
  });
  const endPtr = e => { if (e.pointerId === ptr.id) { ptr.down = false; ptr.id = null; MB.toolEnd(); } };
  canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);

  /* ───────── actions ───────── */
  let wantShot = false;
  function clearBath(){ MB.reset(); S.bal.dye = 0; S.bal.ch = [0, 0, 0, 0]; toast('Bath cleared'); }
  function setQuality(q){
    P.quality = q; MB.alloc(); MB.seed(); WET.free(); GALL.free(); MB.fx.wet = false;
  }
  const api = window.__marble = { paused:false, P, S, MB, AU, DUB, BUB, WET, GALL, PATTERNS, runPattern, applyPreset, pullPrint:o => pullPrint(api, o), clearBath, setQuality,
    /* run the simulation ahead without waiting for the clock (tests) */
    step(n, dt = 1 / 60){ for (let i = 0; i < n; i++) { tick(dt); if (i % 12 === 11) { MB.render(S.scene); measureNow(); exposureTick(dt * 12); } } MB.render(S.scene); post(); } };
  buildUI({ clear:clearBath, resize, setQuality, shot:() => { wantShot = true; }, api });

  document.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target; if (t && (t.tagName === 'INPUT' && t.type !== 'range' || t.tagName === 'TEXTAREA')) return;
    const k = e.key.toLowerCase();
    if (t && (t.tagName === 'BUTTON' || t.tagName === 'SUMMARY') && (k === 'enter' || k === ' ')) return;
    const tools = { q:'drop', w:'comb', e:'swirl', r:'stylus' };
    let handled = true;
    if (tools[k]) { P.tool = tools[k]; MB.toolEnd(); syncUI(); }
    else if (k === ' ') { if (!e.repeat) MB.pressAt(ptr.x, ptr.y); }
    else if (k === 'd') MB.event();
    else if (k === 'c') clearBath();
    else if (k >= '1' && k <= '7') { const p = runPattern(PATTERNS[+k - 1].id); toast(p.name, 1200); }
    else if (k === 'z') { P.palette = (P.palette + PALETTES.length - 1) % PALETTES.length; syncUI(); toast(PAL().name, 900); }
    else if (k === 'x') { P.palette = (P.palette + 1) % PALETTES.length; syncUI(); toast(PAL().name, 900); }
    else if (k === 'l') { P.mixKM = P.mixKM > 0.66 ? 0 : P.mixKM > 0.33 ? 1 : 0.5; syncUI(); toast(P.mixKM > 0.66 ? 'Paint' : P.mixKM > 0.33 ? 'Half glass, half paint' : 'Glass', 900); }
    else if (k === 'a') { P.auto = P.auto ? 0 : 1; syncUI(); toast(P.auto ? 'Automatic drops on' : 'Automatic drops off', 1000); }
    else if (k === 'g') pickSource('dub');
    else if (k === 'm') { AU.stop(); syncUI(); toast('Sound off', 1000); }
    else if (k === 'h') toggleUI();
    else if (k === 'f') fullscreen();
    else if (k === 'o') openOutput();
    else if (k === 'v') toggleRec();
    else if (k === 'p') wantShot = true;
    else if (k === 't') pullPrint(api);
    else if (k === '-' || k === '=' || k === '+') { P.zoom = clamp(Math.round((P.zoom + (k === '-' ? -0.1 : 0.1)) * 100) / 100, 1, 3); syncUI(); toast('Zoom ×' + P.zoom.toFixed(1), 900); }
    else if (k === ',' || k === '.') { P.scale = clamp(Math.round((P.scale + (k === '.' ? 0.1 : -0.1)) * 100) / 100, 0.5, 3); syncUI(); toast('Form scale ×' + P.scale.toFixed(1), 900); }
    else if (k === '[' || k === ']') { P.tempo = clamp(Math.round((P.tempo + (k === ']' ? 0.05 : -0.05)) * 100) / 100, 0.05, 2); syncUI(); toast('Tempo ' + Math.round(P.tempo * 100) + '%', 900); }
    else if (e.key === 'Shift') { S.held.shift = true; handled = false; }
    else handled = false;
    if (handled) { e.preventDefault(); saveSoon(); }
  });
  document.addEventListener('keyup', e => { if (e.key === 'Shift') S.held.shift = false; });
  window.addEventListener('blur', () => { S.held.shift = false; });
  window.addEventListener('resize', resize);

  /* ───────── loop ───────── */
  const auto = { t:0, next:4 };
  let last = performance.now(), fpsAcc = 0, fpsN = 0, hudT = 0, meterEls = null;
  function hud(dt){
    fpsAcc += dt; fpsN++;
    hudT += dt; if (hudT < 0.05) return; hudT = 0;
    if (!meterEls) meterEls = document.querySelectorAll('#meters div');
    meterEls.forEach((m, i) => { m.firstChild.style.setProperty('--v', Math.min(100, AU.pulse[i] * 100) + '%'); m.classList.toggle('open', AU.b[i].open || AU.pulse[i] > 0.25); });
    if (fpsAcc > 0.5) { $('#hudFps').textContent = Math.round(fpsN / fpsAcc) + ' fps'; fpsAcc = 0; fpsN = 0; }
    if (REC.mr) { const s = Math.floor((performance.now() - REC.t0) / 1000); $('#hudRec').textContent = 'REC ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  }
  function tick(dt){
    S.time += dt;
    AU.update(dt);
    S.mod.shimmer = AU.pulse[2] * 0.4;
    const simDt = Math.min(1 / 20, dt * tempoNow());
    if (P.auto) { auto.t += simDt / 0.3; if (auto.t > auto.next) { auto.t = 0; auto.next = P.autoDrop * rnd(0.6, 1.4); MB.event(); } }
    BUB.update(dt);
    MB.step(simDt, dt);
    fxStep(dt);
  }
  function frame(now){
    requestAnimationFrame(frame);
    if (api.paused) { last = now; return; }
    const dt = Math.min(1 / 30, Math.max(1 / 240, (now - last) / 1000)); last = now;
    resize();
    if (ptr.down) MB.tool(dt, false);
    tick(dt);
    MB.render(S.scene);
    measureTick(dt);
    exposureTick(dt);
    post();
    if (wantShot) { wantShot = false; canvas.toBlob(b => { if (b) saveBlob(b, 'marble-' + stamp() + '.png'); }, 'image/png'); }
    hud(dt);
  }

  resize();
  measureInit();
  fxInit();
  BUB.init();
  MB.alloc();
  MB.seed();
  syncUI();
  requestAnimationFrame(t => { last = t; requestAnimationFrame(frame); });
}
boot();
