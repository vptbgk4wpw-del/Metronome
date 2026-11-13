/* The panel, built the way Dish builds it. It shows only what steers a performance: look, pace and framing, tool,
   patterns, sound, output. Everything that adds chaos or changes the physics or the optics sits under Advanced. */
import { P, DEFAULTS, LOOK_KEYS, PALETTES, CUSTOM, CUSTOM_SLOTS, PRESETS, QUAL, PAL, store, rgbHex, hexRgb } from './params.js';
import { derive } from './color.js';
import { AU, DUB, BANDS } from './audio.js';
import { PATTERNS, runPattern } from './patterns.js';
import { REC, PRINT, toast, toggleRec, openOutput, fullscreen, pullPrint } from './output.js';

const $ = s => document.querySelector(s);
const pct = v => Math.round(v * 100) + '%';
const f2 = v => (+v).toFixed(2), f1 = v => (+v).toFixed(1), sec = v => (+v).toFixed(1) + ' s', x2 = v => '×' + (+v).toFixed(2);
const SL = {
  tempo:{ l:'Tempo', kbd:'[ ]', min:0.05, max:2, s:0.01, f:pct },
  zoom:{ l:'Zoom', kbd:'− +', min:1, max:3, s:0.01, f:x2 },
  scale:{ l:'Form scale', kbd:', .', min:0.5, max:3, s:0.01, f:x2 },
  brush:{ l:'Brush', min:0.02, max:0.25, s:0.005, f:pct },
  pulse:{ l:'Pulse', min:0, max:2, s:0.01, f:pct },
  bubbling:{ l:'Bubbling', min:0, max:1, s:0.01, f:pct },
  gate:{ l:'Gate', min:0, max:1, s:0.01, f:pct },
  aGain:{ l:'Sensitivity', min:0, max:3, s:0.01, f:pct },
  aGlitch:{ l:'Lamp glitch', min:0, max:1, s:0.01, f:pct },
  gBpm:{ l:'Generator tempo', min:90, max:140, s:1, f:v => Math.round(v) + ' BPM' },
  gVol:{ l:'Generator volume', min:0, max:1, s:0.01, f:pct },
  drift:{ l:'Drift', min:0, max:1.5, s:0.01, f:f2 },
  waves:{ l:'Wave strength', min:0, max:2, s:0.01, f:f2 },
  swirl:{ l:'Whirls', min:0, max:40, s:0.5, f:f1 },
  autoDrop:{ l:'Rings every', min:1, max:20, s:0.5, f:sec },
  mBubble:{ l:'Drops per second', min:0, max:2, s:0.01, f:f2 },
  mSize:{ l:'Drop size', min:0.4, max:2.5, s:0.01, f:x2 },
  mRings:{ l:'Share of ring drops', min:0, max:1, s:0.01, f:pct },
  mWater:{ l:'Share of clear water', min:0, max:0.6, s:0.01, f:pct },
  wetFlow:{ l:'Current', min:0, max:2, s:0.01, f:f2 },
  wetVisc:{ l:'Thickness of the size', min:0, max:1, s:0.01, f:pct },
  gall:{ l:'Ox gall', min:0, max:1, s:0.01, f:pct },
  gallKind:{ l:'Veins ↔ cells', min:0, max:1, s:0.01, f:pct },
  exposure:{ l:'Exposure', min:0.2, max:3, s:0.01, f:f2 },
  hot:{ l:'Lamp hot spot', min:0, max:1, s:0.01, f:pct },
  dyeDensity:{ l:'Pigment density', min:0.2, max:3, s:0.01, f:f2 },
  mixKM:{ l:'Glass ↔ paint mixing', min:0, max:1, s:0.01, f:pct },
  lens:{ l:'Drop lensing', min:0, max:2, s:0.01, f:f2 },
  caustic:{ l:'Edge caustics', min:0, max:2, s:0.01, f:f2 },
  sat:{ l:'Saturation', min:0, max:2, s:0.01, f:pct },
  mEdge:{ l:'Dark edges', min:0, max:1, s:0.01, f:pct },
  gran:{ l:'Pigment granulation', min:0, max:1.5, s:0.01, f:f2 },
  streak:{ l:'Comb streaks', min:0, max:1.5, s:0.01, f:f2 },
  paper:{ l:'Paper texture', min:0, max:1.5, s:0.01, f:f2 },
  glow:{ l:'Glow', min:0, max:2, s:0.01, f:f2 },
  glowThresh:{ l:'Glow threshold', min:0, max:2, s:0.01, f:f2 },
  halation:{ l:'Halation', min:0, max:1.5, s:0.01, f:f2 },
  aberr:{ l:'Chromatic aberration', min:0, max:2, s:0.01, f:f2 },
  grain:{ l:'Grain', min:0, max:1.5, s:0.01, f:f2 },
  grainSize:{ l:'Grain size', min:1, max:4, s:0.1, f:f1 },
  flicker:{ l:'Lamp flicker', min:0, max:1.5, s:0.01, f:f2 },
  renderScale:{ l:'Render resolution', min:0.35, max:1, s:0.05, f:pct, change:true },
};
const TG = { autoExp:'Auto exposure', auto:'Automatic drops', wet:'Wet layer' };
const ADV = [
  ['Motion', ['drift', 'waves', 'swirl', '@auto', 'mBubble', 'mSize', 'mRings', 'mWater', 'autoDrop']],
  ['Wet layer', ['@wet', 'wetFlow', 'wetVisc'], 'A slow current carries the paint between operations. With it on, the stylus stirs the bath freely.'],
  ['Ox gall', ['gall', 'gallKind'], 'Cells and veins open inside the stains, as in stone ebru.'],
  ['Light', ['@autoExp', 'exposure', 'hot', 'dyeDensity', 'mixKM', 'lens', 'caustic', 'sat']],
  ['Pigment and paper', ['mEdge', 'gran', 'streak', 'paper']],
  ['Glow and grain', ['glow', 'glowThresh', 'halation', 'aberr', 'grain', 'grainSize', 'flicker']],
];
const KEYS = [['[ ]', 'slower / faster'], ['Shift', 'burst ×3 while held'], ['− +', 'zoom'], [', .', 'form scale'], ['Q W E R', 'drop / comb / swirl / stylus'], ['Space', 'clear water under the pointer'],
  ['D', 'ring drops'], ['C', 'clear the bath'], ['1 – 7', 'patterns'], ['Z X', 'palette'], ['L', 'glass ↔ paint'], ['G', 'dub generator on / off'], ['M', 'sound off'], ['A', 'automatic drops'],
  ['H', 'hide controls'], ['F', 'fullscreen'], ['O', 'output window'], ['V', 'record'], ['P', 'save frame'], ['T', 'pull a print']];
const CREDITS = [
  ['Mathematical marbling', 'Shufang Lu, Aubrey Jaffer and others, 2012', 'method'],
  ['Spectral.js', 'Ronald van Wijnen', 'MIT', 'pigment mixing on the spectrum'],
  ['WebGL Fluid Simulation', 'Pavel Dobryakov', 'MIT', 'wet layer'],
  ['reaction-diffusion-webgl', 'piellardj', 'MIT', 'ox gall'],
  ['RDSystem', 'Keijiro Takahashi', 'Unlicense', 'ox gall'],
  ['turing-patterns', 'ijmbarr', 'MIT', 'ox gall'],
  ['psrdnoise', 'Stefan Gustavson, Ian McEwan', 'MIT', 'drift of the current and the vents'],
  ['glsl-smooth-min', 'Hugh Kennedy, after Inigo Quilez', 'MIT', 'bubbles joining'],
  ['LineIntegralConvolutions', 'AstroKriel', 'MIT', 'comb streaks'],
  ['p5.brush', 'Alejandro Campos Uribe', 'MIT', 'edges and granulation'],
  ['KinoAqua', 'Keijiro Takahashi', 'Unlicense', 'edges and paper'],
  ['index.opensource', '현 @hyun2xyz', '', 'where these were found'],
];

const controls = {};
function el(tag, cls, html){ const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
function setPct(inp){ const v = (inp.value - inp.min) / (inp.max - inp.min) * 100; inp.style.setProperty('--pct', v + '%'); }
let saveT = 0;
export function saveSoon(){ clearTimeout(saveT); saveT = setTimeout(() => store.set('state', P), 400); }

let H = null;   // hooks from main: clear, resize, setQuality, shot, api
function range(k){
  const it = SL[k], row = el('div', 'row');
  row.innerHTML = `<label for="p-${k}">${it.l}${it.kbd ? `<kbd>${it.kbd}</kbd>` : ''}</label><output id="o-${k}" for="p-${k}"></output><input type="range" id="p-${k}" min="${it.min}" max="${it.max}" step="${it.s}">`;
  const inp = row.querySelector('input'), out = row.querySelector('output');
  controls[k] = { inp, out, it };
  const apply = () => { P[k] = parseFloat(inp.value); out.textContent = it.f(P[k]); setPct(inp); saveSoon(); if (k === 'gBpm' || k === 'gVol') { DUB.apply(); if (k === 'gBpm') syncUI(); } };
  inp.addEventListener('input', () => { if (it.change) { out.textContent = it.f(parseFloat(inp.value)); setPct(inp); } else apply(); });
  inp.addEventListener('change', () => { apply(); if (k === 'renderScale') H.resize(); });
  return row;
}
function toggle(k, label){
  const row = el('div', 'row'); row.innerHTML = `<label>${label}</label>`;
  const b = el('button', 'opt'); b.type = 'button'; b.id = 'tg-' + k; row.appendChild(b);
  b.addEventListener('click', () => { P[k] = P[k] ? 0 : 1; syncUI(); saveSoon(); });
  controls[k] = { btn:b };
  return row;
}
function optList(id, items, onPick){
  const d = el('div', 'opts'); d.id = id;
  d.innerHTML = items.map(([v, l, kb]) => `<button class="opt" type="button" data-v="${v}">${l}${kb ? `<kbd>${kb}</kbd>` : ''}</button>`).join('');
  d.addEventListener('click', e => { const b = e.target.closest('button'); if (b) onPick(b.dataset.v); });
  return d;
}
function acts(items){
  const d = el('div', 'opts');
  for (const [id, l, kb, fn] of items) { const b = el('button', 'act', `<span>${l}</span>${kb ? `<kbd>${kb}</kbd>` : ''}`); b.type = 'button'; b.id = id; b.addEventListener('click', fn); d.appendChild(b); }
  return d;
}
function section(cap, ...kids){
  const s = el('section', 'sec'); if (cap) s.appendChild(el('div', 'cap', cap));
  kids.forEach(k => s.appendChild(k)); return s;
}

export function buildUI(hooks){
  H = hooks;
  const host = $('#panel');
  const presets = el('div', 'opts'); presets.id = 'presets';
  const palettes = el('div', 'opts'); palettes.id = 'palettes';
  host.appendChild(section('Look', presets));
  host.appendChild(section(null, range('tempo'), range('zoom'), range('scale')));
  const cbox = el('div', 'swatches'); cbox.id = 'customBox';
  CUSTOM_SLOTS.forEach(([key, idx, label]) => {
    const w = el('label', null, `<input type="color" aria-label="${label}"><span>${label}</span>`), inp = w.querySelector('input');
    inp.addEventListener('input', () => {
      const c = hexRgb(inp.value); if (idx == null) CUSTOM[key] = c; else CUSTOM.dyes[idx] = c;
      CUSTOM.touched = true; derive(CUSTOM); store.set('custom', { dyes:CUSTOM.dyes, lamp:CUSTOM.lamp, bath:CUSTOM.bath, touched:true });
      const dots = document.querySelectorAll('#palettes button:last-child .sw i'); CUSTOM.dyes.forEach((d, i) => { if (dots[i]) dots[i].style.background = rgbHex(d); });
    });
    cbox.appendChild(w);
  });
  host.appendChild(section('Palette<kbd>Z X</kbd>', palettes, cbox));
  host.appendChild(section('Tool',
    optList('segTool', [['drop', 'Drop', 'Q'], ['comb', 'Comb', 'W'], ['swirl', 'Swirl', 'E'], ['stylus', 'Stylus', 'R']], v => { P.tool = v; syncUI(); saveSoon(); }),
    range('brush'),
    acts([['btnClear', 'Clear', 'C', () => H.clear()]])));
  host.appendChild(section('Patterns', acts(PATTERNS.map((p, i) => ['pat-' + p.id, p.name, String(i + 1), () => { runPattern(p.id); toast(p.name, 1200); }]))));

  const status = el('div', 'status'); status.id = 'auName';
  const meters = el('div', 'meters'); meters.id = 'meters'; meters.innerHTML = BANDS.map(b => `<div><i></i><span>${b.n}</span></div>`).join('');
  const gen = el('div', 'box'); gen.id = 'genBox';
  gen.appendChild(optList('segParts', [['gKick', 'Kick'], ['gBass', 'Bass'], ['gChord', 'Chords'], ['gHat', 'Hats'], ['gAir', 'Air']], k => { P[k] = P[k] ? 0 : 1; DUB.apply(); syncUI(); saveSoon(); }));
  gen.appendChild(range('gBpm')); gen.appendChild(range('gVol'));
  host.appendChild(section('Sound',
    optList('segSrc', [['dub', 'Dub techno', 'G'], ['mic', 'Mic'], ['file', 'File'], ['none', 'Off', 'M']], pickSource),
    status, meters, range('pulse'), range('bubbling'), range('aGlitch'), range('gate'), range('aGain'), gen));

  host.appendChild(section('Output',
    acts([['btnRec', 'Record', 'V', toggleRec], ['btnShot', 'Save frame', 'P', () => H.shot()], ['btnPrint', 'Pull a print', 'T', () => pullPrint(H.api)]]),
    optList('segPrint', PRINT.sizes.map((s, i) => [i, s[1] + ' print']), v => { P.printSize = +v; syncUI(); saveSoon(); }),
    el('div', 'cap', 'Simulation quality'),
    optList('segQual', QUAL.map((q, i) => [i, q.name]), v => { H.setQuality(+v); syncUI(); saveSoon(); })));

  const adv = el('details', 'adv'); adv.appendChild(el('summary', null, 'Advanced'));
  for (const [name, items, note] of ADV) {
    const g = el('div', 'grp'); g.appendChild(el('div', 'cap', name));
    if (note) g.appendChild(el('div', 'note', note));
    for (const it of items) g.appendChild(it[0] === '@' ? toggle(it.slice(1), TG[it.slice(1)]) : range(it));
    adv.appendChild(g);
  }
  const og = el('div', 'grp'); og.appendChild(el('div', 'cap', 'Output'));
  og.appendChild(acts([['btnOut', 'Output window', 'O', openOutput]])); og.appendChild(range('renderScale'));
  adv.appendChild(og);
  const kg = el('div', 'grp'); kg.appendChild(el('div', 'cap', 'Shortcuts'));
  kg.appendChild(el('div', 'keys', KEYS.map(([k, t]) => `<b>${k}</b><span>${t}</span>`).join('')));
  kg.appendChild(el('div', 'note', 'For projection: H hides the controls, F goes fullscreen. Mic input and the output window need the file opened locally in Chrome.'));
  adv.appendChild(kg);
  const cg = el('div', 'grp'); cg.appendChild(el('div', 'cap', 'Credits'));
  cg.appendChild(el('div', 'keys', CREDITS.map(c => `<b>${c[0]}</b><span>${c[1]}${c[2] ? ' · ' + c[2] : ''}${c[3] ? ' · ' + c[3] : ''}</span>`).join('')));
  cg.appendChild(el('div', 'note', 'Engine from Szalka, sound and light from Dish.'));
  adv.appendChild(cg);
  host.appendChild(adv);

  $('#btnHide').addEventListener('click', () => toggleUI());
  $('#showUi').addEventListener('click', () => toggleUI());
  $('#btnFs').addEventListener('click', fullscreen);
  $('#audioFile').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try { await AU.file(f); toast('Playing ' + f.name); } catch (err) { toast('Could not play that file.'); }
    e.target.value = ''; syncUI();
  });
  REC.onChange = syncUI;
  buildLists();
}
export async function pickSource(src){
  try {
    if (src === 'file') { $('#audioFile').click(); return; }
    if (src === 'none') AU.stop();
    if (src === 'dub') { if (AU.kind === 'dub') AU.stop(); else DUB.start(); }
    if (src === 'mic') { await AU.mic(); toast('Listening to ' + AU.name); }
  } catch (e) {
    toast('No microphone access here. Open the file locally in Chrome, or use the generator or an audio file.', 4200);
  }
  syncUI();
}
let userPresets = store.get('presets', []);
if (!Array.isArray(userPresets)) userPresets = [];
function buildLists(){
  const pr = $('#presets'); pr.innerHTML = '';
  PRESETS.forEach(p => { const b = el('button', 'opt', p.name); b.type = 'button'; b.addEventListener('click', () => applyPreset(p)); pr.appendChild(b); });
  userPresets.forEach((p, i) => {
    const b = el('button', 'opt', `${p.name}<span class="x" role="button" aria-label="Delete look">×</span>`); b.type = 'button';
    b.addEventListener('click', e => { if (e.target.classList.contains('x')) { userPresets.splice(i, 1); store.set('presets', userPresets); buildLists(); toast('Deleted ' + p.name); } else applyPreset(p); });
    pr.appendChild(b);
  });
  const add = el('button', 'act', '<span>Save look</span>'); add.type = 'button';
  add.addEventListener('click', () => {
    const o = { name:'Look ' + (userPresets.length + 1) }; for (const k of LOOK_KEYS) o[k] = P[k];
    userPresets.push(o); store.set('presets', userPresets); buildLists(); toast('Saved ' + o.name);
  });
  pr.appendChild(add);
  const pa = $('#palettes'); pa.innerHTML = '';
  PALETTES.forEach((p, i) => {
    const b = el('button', 'opt', `<span class="sw">${p.dyes.map(c => `<i style="background:${rgbHex(c)}"></i>`).join('')}</span>${p.name}`);
    b.type = 'button'; b.dataset.i = i; b.title = p.names.join(', ');
    b.addEventListener('click', () => {
      if (p === CUSTOM && !CUSTOM.touched && PAL() !== CUSTOM) { const s = PAL(); Object.assign(CUSTOM, { dyes:s.dyes.map(c => c.slice()), lamp:s.lamp.slice(), bath:s.bath.slice() }); derive(CUSTOM); buildLists(); }
      P.palette = i; syncUI(); saveSoon();
    });
    pa.appendChild(b);
  });
  syncUI();
}
export function applyPreset(p){
  for (const k of LOOK_KEYS) P[k] = DEFAULTS[k];
  for (const k in p) if (k !== 'name' && k in DEFAULTS) P[k] = p[k];
  syncUI(); saveSoon(); toast(p.name, 1400);
}
export function syncUI(){
  for (const k in controls) {
    const c = controls[k];
    if (c.inp) { c.inp.value = P[k]; c.out.textContent = c.it.f(P[k]); setPct(c.inp); }
    if (c.btn) { c.btn.textContent = P[k] ? 'On' : 'Off'; c.btn.classList.toggle('on', !!P[k]); c.btn.setAttribute('aria-pressed', P[k] ? 'true' : 'false'); }
  }
  const mark = (sel, test) => document.querySelectorAll(sel).forEach(b => { const on = test(b); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  mark('#segTool button', b => b.dataset.v === P.tool);
  mark('#segQual button', b => +b.dataset.v === P.quality);
  mark('#segPrint button', b => +b.dataset.v === P.printSize);
  mark('#palettes button', b => +b.dataset.i === P.palette);
  mark('#segSrc button', b => b.dataset.v === AU.kind);
  mark('#segParts button', b => !!P[b.dataset.v]);
  $('#auName').textContent = AU.kind === 'none' ? 'No input' : AU.kind === 'dub' ? 'Dub techno generator · ' + Math.round(P.gBpm) + ' BPM' : AU.kind === 'mic' ? 'Mic · ' + AU.name : AU.name;
  $('#genBox').hidden = AU.kind !== 'dub';
  const cb = $('#customBox'); cb.hidden = PAL() !== CUSTOM;
  if (!cb.hidden) cb.querySelectorAll('input').forEach((inp, n) => { const [key, idx] = CUSTOM_SLOTS[n]; inp.value = rgbHex(idx == null ? CUSTOM[key] : CUSTOM.dyes[idx]); });
  const rb = $('#btnRec'); rb.classList.toggle('on', !!REC.mr); rb.firstChild.textContent = REC.mr ? 'Stop recording' : 'Record';
  $('#hudPal').textContent = PAL().name;
}
export function toggleUI(force){
  const off = force !== undefined ? force : !document.body.classList.contains('ui-off');
  document.body.classList.toggle('ui-off', off);
  if (off) toast('H brings the controls back', 1400);
}
