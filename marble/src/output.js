/* Recording, frame grabs, fullscreen, the output window (all from Dish) and "Pull a print". */
import { gl, canvas, run, makeFBO } from './gl.js';
import { P } from './params.js';
import { S, view, MARGIN } from './state.js';
import { MB } from './engine.js';
import { AU } from './audio.js';

const $ = s => document.querySelector(s);
let toastT = 0;
export function toast(msg, ms = 2600){ const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms); }

let DL = null;
try { if (window.claude && typeof window.claude.use === 'function') window.claude.use('downloads').then(d => { DL = d; }).catch(() => {}); } catch (e) {}
export async function saveBlob(blob, name){
  if (DL) {
    try { await DL.save({ filename:name, data:blob }); toast('Saved ' + name); }
    catch (e) { if (e && e.code === 'declined') toast('Save cancelled'); else toast('Could not save the file (' + (e && e.code || 'error') + ').'); }
    return;
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Saved ' + name);
}
export const stamp = () => { const d = new Date(), z = n => String(n).padStart(2, '0'); return d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + '-' + z(d.getHours()) + z(d.getMinutes()) + z(d.getSeconds()); };

export const REC = { mr:null, chunks:[], t0:0, mime:'', ext:'webm', onChange:() => {} };
export function toggleRec(){
  if (REC.mr) { REC.mr.stop(); return; }
  if (!window.MediaRecorder || !canvas.captureStream) { toast('This browser cannot record the canvas.'); return; }
  const stream = canvas.captureStream(60);
  if (AU.dest && AU.kind !== 'none') { const t = AU.dest.stream.getAudioTracks()[0]; if (t) stream.addTrack(t); }
  const types = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1.640028', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp9', 'video/webm'];
  REC.mime = types.find(t => MediaRecorder.isTypeSupported(t)) || '';
  REC.ext = REC.mime.startsWith('video/mp4') ? 'mp4' : 'webm';
  try { REC.mr = new MediaRecorder(stream, REC.mime ? { mimeType:REC.mime, videoBitsPerSecond:24e6 } : { videoBitsPerSecond:24e6 }); }
  catch (e) { toast('Recording could not start.'); return; }
  REC.chunks = []; REC.t0 = performance.now();
  REC.mr.ondataavailable = e => { if (e.data && e.data.size) REC.chunks.push(e.data); };
  REC.mr.onstop = () => {
    const blob = new Blob(REC.chunks, { type:REC.mime || 'video/webm' });
    REC.mr = null; REC.onChange(); $('#hudRec').hidden = true;
    saveBlob(blob, 'marble-' + stamp() + '.' + REC.ext);
  };
  REC.mr.start(500); REC.onChange(); $('#hudRec').hidden = false;
  toast('Recording ' + REC.ext.toUpperCase() + '. V stops.');
}
export function openOutput(){
  let w = null;
  try { w = window.open('', 'marble-output', 'popup,width=1280,height=720'); } catch (e) {}
  if (!w) { toast('The output window works when the file is opened locally in Chrome. Here, use fullscreen (F).', 4200); return; }
  w.document.open();
  w.document.write('<!doctype html><meta charset="utf-8"><title>Marble — output</title><style>html,body{margin:0;height:100%;background:#000;overflow:hidden}video{width:100%;height:100%;object-fit:contain;cursor:none;display:block}</style><video autoplay muted playsinline></video>');
  w.document.close();
  const v = w.document.querySelector('video');
  v.srcObject = canvas.captureStream(60); v.play().catch(() => {});
  w.document.addEventListener('dblclick', () => { w.document.documentElement.requestFullscreen().catch(() => {}); });
  toast('Output window open. Drag it to the projector and double-click it to fill the screen.', 4200);
}
export function fullscreen(){
  if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
  const r = document.documentElement.requestFullscreen ? document.documentElement.requestFullscreen() : null;
  if (r && r.catch) r.catch(() => toast('Fullscreen is blocked here. Open the file locally or use the browser\'s presentation mode.', 3600));
}
let wakeLock = null;
export function wake(){ if (wakeLock || !navigator.wakeLock) return; navigator.wakeLock.request('screen').then(l => { wakeLock = l; l.addEventListener('release', () => { wakeLock = null; }); }).catch(() => {}); }

/* Pull a print: the picture is frozen and rendered again at the target size. The operations are analytic, so each
   tile walks the op history at full resolution; nothing is enlarged. Tiles are evaluated with a margin so that the
   edge and caustic filters see their neighbours and no seam shows. */
export const PRINT = { busy:false, sizes:[[3840, '4K'], [7680, '8K']] };
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
export async function pullPrint(api, opt = {}){
  if (PRINT.busy) return null;
  const long = opt.long || PRINT.sizes[P.printSize][0], k = long / Math.max(S.W, S.H);
  const PW = Math.round(S.W * k), PH = Math.round(S.H * k), T = opt.tile || 1024, PAD = 16, TP = T + PAD * 2;
  const out = document.createElement('canvas'); out.width = PW; out.height = PH;
  const ctx = out.getContext('2d');
  if (!ctx || out.width !== PW) { toast('This device cannot hold a ' + PW + '×' + PH + ' image.'); return null; }
  PRINT.busy = true; const wasPaused = api.paused; api.paused = true;
  let evA = null, evB = null, sc = null, o8 = null, blob = null;
  try {
    evA = makeFBO(TP, TP, { mrt:true }); evB = makeFBO(TP, TP, { mrt:true }); sc = makeFBO(TP, TP);
    o8 = makeFBO(T, T, { ifmt:gl.RGBA8, type:gl.UNSIGNED_BYTE, filter:gl.NEAREST });
    const size = Math.max(PW, PH) * P.zoom * MARGIN, v = { cx:PW / 2, cy:PH / 2, size, w:PW, h:PH };
    const useHist = !!MB.key && !MB.fx.wet, nh = useHist ? MB.hist.length : 0;
    const n = MB.upload(useHist ? MB.hist : [], MB.ops);
    const px = new Uint8Array(T * T * 4), tiles = Math.ceil(PW / T) * Math.ceil(PH / T); let done = 0;
    for (let oy = 0; oy < PH; oy += T) for (let ox = 0; ox < PW; ox += T) {
      const win = [0.5 + (ox - PAD - v.cx) / size, 0.5 + (oy - PAD - v.cy) / size, 0.5 + (ox + T + PAD - v.cx) / size, 0.5 + (oy + T + PAD - v.cy) / size];
      const aa = 0.75 / size;
      run(S.PR.marbEval, evA, MB.evalU(useHist ? MB.key : MB.base.read, n, win, aa, true, 0));
      if (useHist) run(S.PR.marbEval, evB, MB.evalU(MB.base.read, n, win, aa, true, nh));
      run(S.PR.comp, sc, MB.compU({ dye:evA.tex, mc:(useHist ? evB : evA).tex2, texel:evA.texel }, win, v, [ox - PAD, oy - PAD], PW / innerWidth));
      run(S.PR.printFinal, o8, { uScene:sc.tex, uBloom:S.bloom[0].tex, uOrigin:[ox, oy], uFull:[PW, PH], uPad:[PAD, PAD], uGlow:P.glow, uHal:P.halation,
        uGrain:P.grain, uGrainSize:P.grainSize * Math.max(1, PW / 1920), uExposure:P.exposure * S.bal.autoExp, uSat:P.sat });
      const tw = Math.min(T, PW - ox), th = Math.min(T, PH - oy);
      gl.readPixels(0, 0, tw, th, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const img = ctx.createImageData(tw, th);
      for (let y = 0; y < th; y++) img.data.set(px.subarray(y * tw * 4, (y + 1) * tw * 4), (th - 1 - y) * tw * 4);
      ctx.putImageData(img, ox, PH - oy - th);
      done++; toast('Pulling the print… ' + Math.round(done / tiles * 100) + '%', 4000);
      if (done % 2 === 0) await nextFrame();
    }
    blob = await new Promise(r => out.toBlob(r, 'image/png'));
    if (!blob) toast('The print could not be encoded at this size.');
    else if (!opt.silent) await saveBlob(blob, 'marble-print-' + PW + 'x' + PH + '-' + stamp() + '.png');
  } catch (e) {
    console.error(e); toast('The print failed: ' + e.message, 4000);
  } finally {
    for (const f of [evA, evB, sc, o8]) if (f) f.del();
    PRINT.busy = false; api.paused = wasPaused;
  }
  return blob ? { blob, canvas:out, w:PW, h:PH } : null;
}
