/* Dub — the instrument's face. Everything here only reads and writes the engine's state; the sound lives
   in dub-engine.js and knows nothing about this file. */
import './ui.css';
import { DubEngine } from './dub-engine.js';
import { DubMidi, midiFile, POLY } from './midi.js';
import { renderLoop, renderStems, startRecording } from './export.js';
import { encodeWav, zip } from './formats.js';
import { PARTS, PART_NAMES, SCENE_NAMES, STYLE_NAMES, VOICING_NAMES, PROG_NAMES, SYNC, PRESETS, clone } from './state.js';
import { SCALES, SCALE_GROUPS, KEYS, parseScale, scaleById } from './tuning.js';
import { parseProgression, SCENE_ORDER } from './sequence.js';
import { delayTime } from './graph.js';
import { djFilter } from './fx.js';

const VERSION = '1.0';

/* ── storage: everything under the "dub." prefix, every access guarded ── */
const store = {
  get(k, d) { try { const v = localStorage.getItem('dub.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('dub.' + k, JSON.stringify(v)); } catch (e) { /* private mode, quota: play on without saving */ } },
};

let engine;
try { const s = store.get('state', null); engine = new DubEngine({ state: s && s.v === 1 ? s : null }); engine.S.delay.freeze = false; for (const p of PARTS) engine.S.parts[p].solo = false; }
catch (e) { engine = new DubEngine(); }
const midi = new DubMidi(engine);
let userPresets = store.get('presets', {}) || {};
let lastPreset = store.get('preset', '');
window.dub = engine; window.dubMidi = midi;

/* ── tiny DOM kit ── */
const h = (tag, props, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid);
  return el;
};
const binds = [];
const bind = (fn) => { binds.push(fn); fn(); };
const refresh = () => { for (const fn of binds) fn(); };
const S = () => engine.S;
const pct = (v) => Math.round(v * 100) + '%';
const hzText = (f) => f >= 1000 ? (f / 1000).toFixed(f >= 10000 ? 0 : 1) + ' kHz' : Math.round(f) + ' Hz';
const snapped = (f) => hzText(engine.tun.snap(f));
const sign = (v, unit = '') => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v) + unit;

let toastT = 0;
function toast(msg, ms = 2600) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms); }

/* A labelled slider. opt.get / opt.set replace the plain path access; opt.log maps the track exponentially. */
function slider(label, path, opt = {}) {
  const { min = 0, max = 1, step = 0.01, fmt = pct, log = false } = opt;
  const get = opt.get || (() => engine.get(path)), set = opt.set || ((v) => engine.set(path, v));
  const toPos = (v) => log ? Math.log(v / min) / Math.log(max / min) : v, toVal = (x) => log ? min * Math.pow(max / min, x) : x;
  const input = h('input', { type: 'range', min: log ? 0 : min, max: log ? 1 : max, step: log ? 0.001 : step, 'aria-label': opt.aria || label });
  const out = h('output');
  const upd = () => {
    const v = get(), x = toPos(Math.min(max, Math.max(min, v)));
    if (document.activeElement !== input || Math.abs(+input.value - x) > (log ? 0.002 : step)) input.value = x;
    input.style.setProperty('--pct', ((x - (log ? 0 : min)) / ((log ? 1 : max) - (log ? 0 : min)) * 100) + '%');
    out.textContent = fmt(v);
  };
  input.addEventListener('input', () => { set(toVal(+input.value)); upd(); });
  if (opt.reset != null) input.addEventListener('dblclick', () => { set(opt.reset); upd(); });
  bind(upd);
  return opt.mini ? h('label', { class: 'mini' }, h('span', { text: label }), input) : h('div', { class: 'row' + (opt.wide ? ' wide' : '') }, h('label', { text: label }), out, input);
}
/* A row of words, one of them white. */
function choice(path, items, opt = {}) {
  const get = opt.get || (() => engine.get(path)), set = opt.set || ((v) => engine.set(path, v));
  const btns = items.map(([value, label]) => h('button', { class: 'opt', type: 'button', text: label, onclick: () => set(value) }));
  bind(() => { const v = get(); btns.forEach((b, i) => { const on = items[i][0] === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }); });
  return h('div', { class: 'opts' + (opt.wide ? ' wide' : ''), role: 'group', 'aria-label': opt.aria || path }, opt.cap ? h('span', { class: 'grp-cap', text: opt.cap }) : null, btns);
}
function toggle(label, path, opt = {}) {
  const get = opt.get || (() => !!engine.get(path)), set = opt.set || ((v) => engine.set(path, v));
  const b = h('button', { class: 'opt', type: 'button', text: label, onclick: () => set(!get()) });
  if (opt.k) b.dataset.k = opt.k;
  bind(() => { const on = get(); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  return b;
}
const act = (label, fn, key) => h('button', { class: 'act', type: 'button', onclick: fn }, label, key ? h('kbd', { text: key }) : null);
const sec = (cls, cap, ...kids) => h('section', { class: 'sec ' + cls }, cap ? (typeof cap === 'string' ? h('div', { class: 'cap', text: cap }) : cap) : null, kids);
const adv = (title, ...kids) => h('details', { class: 'adv' }, h('summary', { text: title }), kids);
const grp = (...kids) => h('div', { class: 'grp' }, kids);
/* A section whose shape depends on state (ports, custom scales…): rebuilt only when its key changes. */
function dynamic(el, keyFn, build) { let key; bind(() => { const k = keyFn(); if (k === key) return; key = k; el.replaceChildren(...[build()].flat(Infinity).filter(Boolean)); }); return el; }

/* ── transport ── */
/* iPhone: the ringer switch silences Web Audio unless the page counts as media playback. Newer systems have
   a setting for that; older ones need an (inaudible) media element playing alongside. */
let silentEl = null;
function mediaSession() {
  try { if (navigator.audioSession) { navigator.audioSession.type = 'playback'; return; } } catch (e) {}
  if (silentEl || !/iPhone|iPad|iPod/.test(navigator.userAgent) && !(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return;
  try {
    const wav = encodeWav([new Float32Array(2205)], 22050, 16); let bin = ''; for (let i = 0; i < wav.length; i++) bin += String.fromCharCode(wav[i]);
    silentEl = new Audio('data:audio/wav;base64,' + btoa(bin)); silentEl.loop = true; silentEl.setAttribute('playsinline', ''); silentEl.preload = 'auto';
    const p = silentEl.play(); if (p && p.catch) p.catch(() => {});
  } catch (e) {}
}
let warnT = 0;
function play() {
  // everything a phone insists on happens synchronously in this tap: session, context, resume
  mediaSession();
  const fresh = !engine.G;
  engine.unlock();
  if (fresh) status(null, 'Starting audio…');
  (async () => {
    try {
      await engine.init(); meterSetup();
      if (engine.playing) engine.stop(); else await engine.start();
    } catch (e) { toast('Audio could not start. ' + (e && e.message ? e.message : ''), 6000); }
    refresh();
    clearTimeout(warnT);
    if (engine.playing) warnT = setTimeout(() => { if (engine.playing && engine.ctx.state !== 'running') toast('The browser is holding the sound back. Tap anywhere on the page once more.', 6000); }, 900);
  })();
}
/* If the system suspended audio (a call, the lock screen, a strict browser), the next touch brings it back. */
for (const ev of ['pointerdown', 'touchend', 'keydown']) window.addEventListener(ev, () => { if (engine.ctx && engine.ctx.state !== 'running') engine.unlock(); }, { capture: true, passive: true });
const taps = [];
function tap() {
  const now = performance.now();
  if (taps.length && now - taps[taps.length - 1] > 2000) taps.length = 0;
  taps.push(now); if (taps.length > 6) taps.shift();
  if (taps.length >= 2) engine.setTempo(60000 / ((taps[taps.length - 1] - taps[0]) / (taps.length - 1)));
}

/* ── header and top row ── */
const statusEl = h('p', { text: '' });
const playBtn = act('Play', play, 'Space');
function head() {
  bind(() => { playBtn.firstChild.textContent = engine.playing ? 'Stop' : 'Play'; });
  return h('header', { class: 'head' }, h('div', {}, h('h1', { text: 'Dub' }), statusEl), h('nav', {}, playBtn));
}
let statusNote = '';
function status(bar, note) {
  if (note !== undefined) statusNote = note;
  if (engine.G) statusNote = '';
  const s = S(), name = scaleById(s.scale, s.custom).name;
  statusEl.textContent = statusNote ? statusNote : engine.playing && bar != null
    ? `Bar ${bar + 1} · ${SCENE_NAMES[s.scene]} · ${KEYS[engine.tun.key]} ${engine.tun.scale.name}`
    : `Generative dub techno · ${VERSION} · ${KEYS[s.key]} ${name}`;
}

function top() {
  const scaleSum = h('summary', {});
  bind(() => { scaleSum.textContent = 'Scale  ·  ' + scaleById(S().scale, S().custom).name; });
  const scaleList = dynamic(h('div', {}), () => JSON.stringify(S().custom.map(c => c.id + c.name)), () => {
    const groups = SCALE_GROUPS.map(g => [g, SCALES.filter(s => s.group === g)]);
    if (S().custom.length) groups.push(['Yours', S().custom]);
    return groups.map(([g, list]) => choice('scale', list.map(s => [s.id, s.name]), { cap: g, set: (id) => engine.setScale(id), aria: g + ' scales' }));
  });
  const seedOut = h('b', {}); bind(() => { seedOut.textContent = String(S().seed).padStart(5, '0'); });
  const sceneBtns = SCENE_ORDER.map(id => h('button', { class: 'opt', type: 'button', onclick: () => engine.setScene(id) }));
  bind(() => sceneBtns.forEach((b, i) => { const id = SCENE_ORDER[i], pend = engine.pendingScene === id; b.textContent = SCENE_NAMES[id] + (pend ? ' …' : ''); b.classList.toggle('on', S().scene === id || pend); b.setAttribute('aria-pressed', S().scene === id); }));
  const presetList = dynamic(h('div', { class: 'opts', role: 'group', 'aria-label': 'Presets' }), () => Object.keys(userPresets).join('|') + '#' + lastPreset, () => [
    ...Object.keys(PRESETS).map(n => h('button', { class: 'opt' + (n === lastPreset ? ' on' : ''), type: 'button', text: n, onclick: () => loadPreset(n) })),
    ...Object.keys(userPresets).map(n => h('button', { class: 'opt' + (n === lastPreset ? ' on' : ''), type: 'button', onclick: () => loadPreset(n) }, n,
      h('span', { class: 'x', role: 'button', 'aria-label': 'Delete preset ' + n, text: '×', onclick: (e) => { e.stopPropagation(); delete userPresets[n]; store.set('presets', userPresets); refresh(); } }))),
  ]);
  return h('div', { class: 'grid' },
    sec('s3', null, slider('Tempo', 'tempo', { min: 60, max: 140, step: 1, fmt: (v) => (Math.round(v * 10) / 10) + ' BPM', set: (v) => engine.setTempo(v) }), h('div', { class: 'opts' }, act('Tap', tap, 'T'))),
    sec('s5', 'Key', choice('key', KEYS.map((k, i) => [i, k]), { aria: 'Key' })),
    sec('s4', null, h('details', { class: 'inl' }, scaleSum, scaleList)),
    sec('s3', h('div', { class: 'cap' }, 'Seed', seedOut), h('div', { class: 'opts' }, act('New seed', () => { if (S().seedLock) toast('Seed is locked.'); else engine.newSeed(); }, 'N'), toggle('Lock', 'seedLock'))),
    sec('s5', 'Scene', h('div', { class: 'opts', role: 'group', 'aria-label': 'Scene' }, sceneBtns, toggle('Auto', 'auto')), slider('Intensity', 'intensity')),
    sec('s4', 'Presets', presetList));
}
function loadPreset(name) {
  if (PRESETS[name]) engine.loadPreset(name); else if (userPresets[name]) { const keep = { midi: S().midi, master: { volume: S().master.volume } }; engine.patch(clone(userPresets[name])); engine.patch(keep); }
  lastPreset = name; store.set('preset', name); refresh();
}

/* ── parts ── */
const dots = {}, rows = {};
function partRow(part, index) {
  const p = `parts.${part}.`;
  const dotEls = Array.from({ length: 16 }, () => h('i'));
  dots[part] = dotEls;
  const more = h('button', { class: 'opt more', type: 'button', 'aria-expanded': 'false', 'aria-label': PART_NAMES[part] + ' advanced', text: '+' });
  const panel = h('div', { class: 'padv', hidden: true }, partAdvanced(part));
  more.addEventListener('click', () => { const open = panel.hidden; panel.hidden = !open; more.textContent = open ? '–' : '+'; more.setAttribute('aria-expanded', open); });
  const thr = h('button', { class: 'opt', type: 'button', text: 'Throw', 'aria-label': 'Throw ' + PART_NAMES[part] + ' into the delay while held' });
  thr.dataset.k = 'throw';
  const hold = (on) => (e) => { if (e.type === 'pointerdown') { try { thr.setPointerCapture(e.pointerId); } catch (x) {} } throwPart(part, on); };
  thr.addEventListener('pointerdown', hold(true)); for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) thr.addEventListener(ev, hold(false));
  thr.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); e.stopPropagation(); throwPart(part, true); } });
  thr.addEventListener('keyup', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); throwPart(part, false); } });
  thr.addEventListener('contextmenu', (e) => e.preventDefault());
  rows[part] = { thr };
  const row = h('div', { class: 'part' },
    h('div', { class: 'name' }, PART_NAMES[part], h('kbd', { text: String((index + 1) % 10) })),
    toggle('Mute', p + 'mute', { k: 'mute' }), toggle('Solo', p + 'solo', { k: 'solo' }),
    h('div', { class: 'sliders' }, slider('Level', p + 'level', { mini: true, aria: PART_NAMES[part] + ' level' }), slider('Density', p + 'density', { mini: true, aria: PART_NAMES[part] + ' density' }),
      slider('Delay', p + 'dly', { mini: true, aria: PART_NAMES[part] + ' delay send' }), slider('Reverb', p + 'rev', { mini: true, aria: PART_NAMES[part] + ' reverb send' })),
    thr,
    part === 'noise' ? h('div', { class: 'dots flat', title: 'Continuous' }) : h('div', { class: 'dots', 'aria-hidden': 'true' }, dotEls),
    more);
  bind(() => { const P = S().parts[part], solo = PARTS.some(x => S().parts[x].solo); row.classList.toggle('off', P.mute || (solo && !P.solo)); });
  return [row, panel];
}
function throwPart(part, on) { engine.throwSend(part, on); rows[part].thr.classList.toggle('on', on); }

function partAdvanced(part) {
  const p = `parts.${part}.`, out = [];
  if (part === 'kick') out.push(choice(p + 'tune', [['root', 'Root'], ['fifth', 'Fifth']], { cap: 'Tune' }), slider('Decay', p + 'decay'), slider('Punch', p + 'punch'), slider('Tone', p + 'tone', { fmt: (v) => snapped(120 * Math.pow(2, v * 3.6)) }));
  if (part === 'bass') out.push(choice(p + 'shape', [['sine', 'Sine'], ['triangle', 'Triangle'], ['saw', 'Saw'], ['square', 'Square']], { cap: 'Wave' }), choice(p + 'octave', [[-1, '−1'], [0, '0'], [1, '+1']], { cap: 'Octave' }),
    slider('Glide', p + 'glide', { max: 0.3, fmt: (v) => Math.round(v * 1000) + ' ms' }), slider('Filter', p + 'filter', { fmt: (v) => snapped(70 * Math.pow(2, v * 4.3)) }), slider('Harmonics', p + 'drive'));
  if (part === 'stab') out.push(choice('voicing', Object.entries(VOICING_NAMES), { cap: 'Voicing', wide: true }), slider('Detune', p + 'detune', { max: 30, step: 1, fmt: (v) => '±' + v + ' c' }),
    slider('Envelope', p + 'env'), slider('Length', p + 'length', { min: 0.05, max: 1.5, log: true, fmt: (v) => Math.round(v * 1000) + ' ms' }));
  if (part === 'pad') out.push(slider('Tone', p + 'tone', { fmt: (v) => snapped(300 * Math.pow(2, v * 4)) }));
  if (part === 'hats') out.push(slider('Tone', p + 'tone', { fmt: (v) => snapped(3000 * Math.pow(2, v * 1.8)) }), slider('Decay', p + 'decay'));
  if (part === 'noise') out.push(h('p', { class: 'note', text: 'Tape hiss and vinyl crackle. Density is the amount of crackle.' }));
  else out.push(slider('Variation', p + 'variation'), h('div', { class: 'opts' }, toggle('Lock pattern', p + 'lock', { get: () => !!S().parts[part].lock, set: (on) => engine.setLock(part, on) })));
  return out;
}

function partsSection() {
  const headRow = h('div', { class: 'parthead', 'aria-hidden': 'true' }, h('span'), h('span'), h('span'), h('span', { text: 'Level' }), h('span', { text: 'Density' }), h('span', { text: 'Delay' }), h('span', { text: 'Reverb' }), h('span'), h('span', { text: 'Steps' }), h('span'));
  return h('div', { class: 'parts' }, headRow, PARTS.map((p, i) => partRow(p, i)));
}

/* ── the dub desk ── */
function desk() {
  const freeRow = slider('Free time', 'delay.free', { min: 0.03, max: 1.5, log: true, fmt: (v) => Math.round(v * 1000) + ' ms' });
  bind(() => { freeRow.hidden = S().delay.sync !== 'free'; });
  const delayMore = h('details', { class: 'inl' }, h('summary', { text: 'Tape' }), h('div', {},
    slider('High-pass', 'delay.hp', { min: 40, max: 2000, log: true, fmt: snapped }), slider('Low-pass', 'delay.lp', { min: 400, max: 12000, log: true, fmt: snapped }),
    slider('Saturation', 'delay.sat'), slider('Wow', 'delay.wow'), slider('Flutter', 'delay.flutter'), tapeNote));
  const meter = h('div', { class: 'meter' }, h('i'), h('span', { text: 'Limit' }));
  meterEl = meter;
  return h('div', { class: 'grid' },
    sec('s3', 'Delay', choice('delay.sync', Object.entries(SYNC).map(([k, v]) => [k, v[0]]), { aria: 'Delay time' }), freeRow,
      slider('Feedback', 'delay.feedback', { max: 1.1 }), slider('Level', 'delay.level'),
      h('div', { class: 'opts' }, toggle('Freeze', 'delay.freeze'), h('kbd', { text: 'F' }), toggle('Ping-pong', 'delay.ping')), delayMore),
    sec('s3', 'Reverb', choice('reverb.type', [['spring', 'Spring'], ['plate', 'Plate']], { aria: 'Reverb type' }), slider('Size', 'reverb.size'), slider('Damping', 'reverb.damp', { fmt: (v) => snapped(900 * Math.pow(2, (1 - v) * 3.6)) }), slider('Level', 'reverb.level')),
    sec('s3', 'Chord filter', slider('Cutoff', 'parts.stab.cutoff', { fmt: (v) => snapped(200 * Math.pow(2, v * 5)) }), slider('Resonance', 'parts.stab.res'), slider('LFO depth', 'parts.stab.lfoDepth'),
      slider('LFO rate', 'parts.stab.lfoRate', { min: 0.01, max: 8, log: true, fmt: (v) => (v < 1 ? v.toFixed(2) : v.toFixed(1)) + ' Hz' })),
    sec('s3', 'Master', slider('DJ filter', 'master.dj', { min: -1, max: 1, reset: 0, fmt: (v) => { const f = djFilter(v); return v < -0.03 ? 'HP ' + snapped(f.hp) : v > 0.03 ? 'LP ' + snapped(f.lp) : 'Off'; } }),
      slider('Saturation', 'master.sat'), slider('Compressor', 'master.comp'), slider('Volume', 'master.volume'), meter),
    sec('s12', null, xyPad()));
}
const tapeNote = h('p', { class: 'note', hidden: true, text: 'This browser does not allow audio worklets here, so the delay runs on standard nodes: same controls, slightly plainer tape.' });
engine.on('ready', (e) => { tapeNote.hidden = !!e.tape; });

function xyPad() {
  const pad = h('div', { class: 'xy', tabindex: '0', role: 'group', 'aria-label': 'XY pad. Arrow keys move the handle.' }, h('i'));
  const lx = h('span'), ly = h('span');
  const T0 = 0.03, T1 = 1.5;
  const read = () => S().xy.mode === 'filter' ? [S().parts.stab.cutoff, S().parts.stab.res] : [Math.log(delayTime(S()) / T0) / Math.log(T1 / T0), S().delay.feedback / 1.1];
  const write = (x, y) => {
    x = Math.min(1, Math.max(0, x)); y = Math.min(1, Math.max(0, y));
    if (S().xy.mode === 'filter') { engine.set('parts.stab.cutoff', x); engine.set('parts.stab.res', y); }
    else { engine.set('delay.free', T0 * Math.pow(T1 / T0, x)); engine.set('delay.sync', 'free'); engine.set('delay.feedback', y * 1.1); }
  };
  const at = (e) => { const r = pad.getBoundingClientRect(); write((e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height); };
  pad.addEventListener('pointerdown', (e) => { pad.setPointerCapture(e.pointerId); at(e); });
  pad.addEventListener('pointermove', (e) => { if (pad.hasPointerCapture(e.pointerId)) at(e); });
  pad.addEventListener('keydown', (e) => { const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key]; if (!d) return; e.preventDefault(); const [x, y] = read(); write(x + d[0] * 0.02, y + d[1] * 0.02); });
  bind(() => {
    const [x, y] = read(), f = S().xy.mode === 'filter';
    pad.style.setProperty('--x', Math.min(100, Math.max(0, x * 100)) + '%'); pad.style.setProperty('--y', Math.min(100, Math.max(0, (1 - y) * 100)) + '%');
    lx.textContent = f ? 'Cutoff ' + snapped(200 * Math.pow(2, S().parts.stab.cutoff * 5)) + ' →' : 'Delay time ' + Math.round(delayTime(S()) * 1000) + ' ms →';
    ly.textContent = f ? '↑ Resonance ' + pct(S().parts.stab.res) : '↑ Feedback ' + pct(S().delay.feedback);
  });
  return [h('div', { class: 'cap' }, 'XY pad', choice('xy.mode', [['delay', 'Delay time × feedback'], ['filter', 'Filter cutoff × resonance']], { aria: 'XY pad target' })), pad, h('div', { class: 'xylab' }, ly, lx)];
}

/* ── advanced ── */
function advPattern() {
  const custom = h('input', { type: 'text', 'aria-label': 'Custom progression', placeholder: '1:2 7:1 6:1', spellcheck: 'false' });
  bind(() => { if (document.activeElement !== custom) custom.value = S().customProg; });
  custom.addEventListener('change', () => { if (parseProgression(custom.value)) { engine.set('customProg', custom.value.trim()); engine.set('progression', 'custom'); } else toast('Write degrees 1–7 with bars, for example 1:2 7:1 6:1'); });
  return adv('Pattern and harmony', grp(
    choice('style', Object.entries(STYLE_NAMES), { cap: 'Style', wide: true }),
    slider('Swing', 'swing'), slider('Phrase', 'bars', { min: 1, max: 8, step: 1, fmt: (v) => v + (v === 1 ? ' bar' : ' bars') }),
    slider('Auto scene every', 'autoBars', { min: 4, max: 64, step: 4, fmt: (v) => v + ' bars' }),
    choice('progression', Object.entries(PROG_NAMES), { cap: 'Chords', wide: true }),
    h('div', { class: 'row wide' }, h('label', { text: 'Custom progression: degree:bars' }), h('span'), custom),
    choice('voicing', Object.entries(VOICING_NAMES), { cap: 'Voicing', wide: true }),
    h('p', { class: 'note wide', text: 'Chords are stacked from the degrees of the scale in use. Auto picks Minor 7/9 for 12-tone scales and Fifths for scales with tones between the keys, where a dense chord turns sharp.' })));
}
function advTuning() {
  const degrees = dynamic(h('div', { class: 'grp' }), () => S().scale + '|' + S().custom.length, () => {
    const sc = scaleById(S().scale, S().custom);
    return [...sc.cents.map((c, i) => slider(`Degree ${i + 1} · ${Math.round(c * 10) / 10} c`, '', { min: -50, max: 50, step: 1, reset: 0, fmt: (v) => sign(v, ' c'),
      get: () => ((S().offsets[sc.id] || [])[i]) || 0,
      set: (v) => { const a = sc.cents.map((_, k) => ((S().offsets[sc.id] || [])[k]) || 0); a[i] = Math.round(v); engine.set('offsets.' + sc.id, a); } })),
    h('div', { class: 'opts wide' }, act('Reset corrections', () => engine.set('offsets.' + sc.id, sc.cents.map(() => 0))),
      S().custom.some(c => c.id === sc.id) ? act('Delete this scale', () => { engine.set('custom', S().custom.filter(c => c.id !== sc.id)); engine.set('scale', 'aeolian'); }) : null)];
  });
  const name = h('input', { type: 'text', placeholder: 'Name', 'aria-label': 'Scale name', maxlength: '24' }), cents = h('input', { type: 'text', placeholder: '0 150 350 500 700 850 1000', 'aria-label': 'Scale in cents', spellcheck: 'false' });
  const add = () => {
    const c = parseScale(cents.value);
    if (!c) { toast('Write rising cents inside one octave, for example 0 150 350 500 700 850 1000'); return; }
    const id = 'u' + Date.now().toString(36), list = [...S().custom, { id, name: (name.value.trim() || 'Scale ' + (S().custom.length + 1)).slice(0, 24), group: 'Yours', cents: c }];
    engine.set('custom', list); engine.setScale(id); name.value = ''; cents.value = '';
  };
  return adv('Tuning', grp(slider('Reference A4', 'a4', { min: 430, max: 450, step: 0.5, reset: 440, fmt: (v) => v + ' Hz' }),
    h('p', { class: 'note wide', text: 'Each degree of the scale can be moved by up to 50 cents either way; makam degrees are theory values and are often played a little lower or higher. Corrections are kept with the scale. Double-click a slider to reset it.' })),
    degrees,
    grp(h('div', { class: 'field wide' }, h('div', { class: 'row' }, h('label', { text: 'Your scale, in cents from the tonic' }), h('span'), cents), h('div', {}, name)), h('div', { class: 'opts' }, act('Add scale', add))));
}
function advMidi() {
  const box = dynamic(h('div', { class: 'grp' }), () => [midi.access ? 1 : 0, midi.outputs().map(o => o.id + o.state).join(), midi.inputs().map(o => o.id + o.state).join(), midi.note, engine.tun.micro].join('|'), () => {
    if (!midi.supported) return h('p', { class: 'note wide', text: 'Web MIDI is not available in this browser. Chrome, Edge and Firefox on a computer have it; Safari and iPhone do not.' });
    if (!midi.access) return [h('div', { class: 'opts' }, act('Enable MIDI', async () => { try { await midi.enable(); } catch (e) { toast('MIDI was not enabled. If this page is embedded in another one, open dub.html on its own page: embedded views often block MIDI.', 6000); } refresh(); })),
      h('p', { class: 'note wide', text: 'Every part can play from the browser, from a synth on its own MIDI channel, or both. Clock, start and stop are sent along.' })];
    const outs = midi.outputs(), ins = midi.inputs();
    return [
      outs.length ? choice('midi.out', outs.map(o => [o.id, o.name || 'Output']), { cap: 'Output', wide: true }) : h('p', { class: 'note wide', text: 'No MIDI output found. Connect a synth or open a virtual port, it appears here by itself.' }),
      h('div', { class: 'opts wide' }, h('span', { class: 'grp-cap', text: 'Clock' }), toggle('Send clock', 'midi.clockOut'), toggle('Follow incoming clock', 'midi.clockIn', { set: (on) => midi.setClockIn(on) })),
      ins.length ? choice('midi.in', [['', 'Any input'], ...ins.map(o => [o.id, o.name || 'Input'])], { cap: 'Clock from', wide: true, set: (id) => midi.setClockIn(S().midi.clockIn, id) }) : null,
      choice('midi.micro', [['bend', 'Pitch bend'], ['tet', 'Nearest 12-TET']], { cap: 'Microtones', wide: true }),
      choice('midi.bend', [[1, '±1'], [2, '±2'], [12, '±12'], [24, '±24'], [48, '±48']], { cap: 'Bend range', wide: true }),
      choice('midi.drums', [['gm', 'GM drum keys'], ['key', 'In key']], { cap: 'Drum notes', wide: true }),
      h('p', { class: 'note wide' + (midi.note ? ' warn' : ''), text: midi.note || (engine.tun.micro
        ? 'This scale has tones between the keys. Bass, siren and other single-voice parts are bent per note. A chord needs one bend per note: give Chord stab or Pad a block of channels with Rotate and use an MPE-capable synth, otherwise the chord plays the nearest 12-TET keys. Set the same bend range on the synth.'
        : 'Minilogue and Reface play chords on one channel; Monologue plays one voice. Set the same bend range here and on the synth before using makam scales.') }),
      h('div', { class: 'lines wide' }, PARTS.filter(p => p !== 'noise').map(p => h('div', { class: 'mrow' }, h('span', { text: PART_NAMES[p] }),
        choice(`parts.${p}.out`, [['browser', 'Browser'], ['midi', 'MIDI'], ['both', 'Both']], { aria: PART_NAMES[p] + ' output' }),
        slider('Channel', `parts.${p}.ch`, { min: 1, max: 16, step: 1, fmt: (v) => String(v) }),
        POLY.has(p) ? slider('Rotate', `parts.${p}.rotate`, { min: 1, max: 8, step: 1, fmt: (v) => v === 1 ? 'Off' : v + ' ch' }) : h('span')))),
    ];
  });
  return adv('MIDI', box);
}
function advExport() {
  const note = h('p', { class: 'note wide', text: 'The loop is the current phrase with the tail of delay and reverb folded back onto its start, so it repeats without a seam. Stems come as a ZIP, one WAV per part.' });
  const busy = async (label, fn) => { note.textContent = label; try { await fn(); note.textContent = 'Done.'; } catch (e) { note.textContent = (e && e.message) || 'Export failed.'; } };
  const recBtn = act('Record', async () => {
    if (recorder) { const r = recorder; recorder = null; refresh(); const f = await r.stop(); try { await download(f.name.replace('dub-take', 'dub-take-' + fileTag()), f.data, f.type); } catch (e) { toast(e.message, 5000); } return; }
    engine.unlock();
    try { await engine.init(); meterSetup(); recorder = startRecording(engine.ctx, engine.output, engine.tape); recT0 = performance.now(); if (!engine.playing) await engine.start(); } catch (e) { toast('Recording could not start. ' + (e.message || '')); }
    refresh();
  });
  recBtnEl = recBtn;
  bind(() => { recBtn.classList.toggle('on', !!recorder); if (!recorder) recBtn.firstChild.textContent = 'Record'; });
  return adv('Export', grp(h('div', { class: 'opts wide' },
    act('WAV loop', () => busy('Rendering the loop…', async () => { const r = await renderLoop(engine.getState(), { phrase: engine.playing ? engine.phrase : 0 }); await download(`dub-${fileTag()}.wav`, encodeWav(r.channels, r.sampleRate, 24), 'audio/wav'); })),
    act('Stems', () => busy('Rendering stems, one part at a time…', async () => { const st = await renderStems(engine.getState(), { phrase: engine.playing ? engine.phrase : 0 }); await download(`dub-${fileTag()}-stems.zip`, zip(st.map(s => ({ name: `${String(PARTS.indexOf(s.part) + 1).padStart(2, '0')}-${s.part}.wav`, data: encodeWav(s.channels, s.sampleRate, 24) }))), 'application/zip'); })),
    act('MIDI file', () => busy('Writing MIDI…', async () => await download(`dub-${fileTag()}.mid`, midiFile(engine.getState(), engine.tun, { phrase: engine.playing ? engine.phrase : 0 }), 'audio/midi'))),
    recBtn), note));
}
let recorder = null, recT0 = 0, recBtnEl = null;
const fileTag = () => `${KEYS[S().key].replace('♯', 's').replace('♭', 'b')}-${scaleById(S().scale, S().custom).name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Math.round(S().tempo)}bpm-${S().seed}`;
/* Save a file. On its own page that is an ordinary download. Inside a Claude artifact the page may not
   download by itself: the viewer is asked to confirm, and only some file types pass, so WAV and MIDI travel in a ZIP. */
async function download(name, data, type) {
  const c = window.claude;
  if (c && typeof c.use === 'function') {
    const d = await c.use('downloads');
    if (d) {
      const isZip = /\.zip$/i.test(name);
      try { await d.save({ filename: isZip ? name : name.replace(/\.[^.]+$/, '') + '.zip', data: new Blob([isZip ? data : zip([{ name, data }])]) }); }
      catch (e) { throw new Error(e && e.code === 'declined' ? 'Nothing was saved.' : 'This view could not save the file. Open dub.html on its own page to export.'); }
      return;
    }
  }
  const url = URL.createObjectURL(new Blob([data], { type })), a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function advPresets() {
  const name = h('input', { type: 'text', placeholder: 'Preset name', 'aria-label': 'Preset name', maxlength: '24' });
  const save = () => { const n = name.value.trim(); if (!n) { toast('Give the preset a name.'); return; } if (PRESETS[n]) { toast('That name belongs to a built-in preset.'); return; }
    const st = engine.getState(); delete st.midi; st.delay.freeze = false; userPresets[n] = st; store.set('presets', userPresets); lastPreset = n; store.set('preset', n); name.value = ''; refresh(); toast('Saved “' + n + '”.'); };
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  return adv('Save preset', grp(h('div', { class: 'row' }, h('label', { text: 'Everything as it is now, key and seed included' }), h('span'), name), h('div', { class: 'opts' }, act('Save preset', save))));
}
function advKeys() {
  const k = [['Space', 'Play / Stop'], ['1 – 9, 0', 'Mute a part, in the order of the rows'], ['Shift + digit', 'Throw that part into the delay while held'], ['T', 'Tap tempo'], ['F', 'Freeze the delay'], ['N', 'New seed'],
    ['← →', 'Previous / next scene'], ['Double-click', 'Reset a slider that has a centre']];
  return adv('Keyboard', grp(h('div', { class: 'keys wide' }, k.flatMap(([a, b]) => [h('b', { text: a }), h('span', { text: b })]))));
}

/* ── keyboard ── */
const heldThrows = new Set();
window.addEventListener('keydown', (e) => {
  const t = e.target, typing = t && (t.tagName === 'INPUT' && t.type === 'text');
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  const digit = /^Digit(\d)$/.exec(e.code);
  if (e.code === 'Space') { if (t && (t.tagName === 'BUTTON' || t.tagName === 'SUMMARY')) return; e.preventDefault(); if (!e.repeat) play(); }
  else if (digit) { const part = PARTS[(+digit[1] + 9) % 10]; if (e.shiftKey) { if (!e.repeat) { heldThrows.add(e.code); throwPart(part, true); } } else if (!e.repeat) engine.setMute(part, !S().parts[part].mute); e.preventDefault(); }
  else if (e.repeat) return;
  else if (e.key === 't' || e.key === 'T') tap();
  else if (e.key === 'f' || e.key === 'F') engine.freeze(!S().delay.freeze);
  else if (e.key === 'n' || e.key === 'N') engine.newSeed();
  else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !(t && (t.type === 'range' || t.classList.contains('xy')))) { const i = SCENE_ORDER.indexOf(engine.pendingScene || S().scene); engine.setScene(SCENE_ORDER[(i + (e.key === 'ArrowRight' ? 1 : 3)) % 4]); }
});
window.addEventListener('keyup', (e) => { if (heldThrows.delete(e.code)) { const d = /^Digit(\d)$/.exec(e.code); throwPart(PARTS[(+d[1] + 9) % 10], false); } });
window.addEventListener('blur', () => { for (const c of heldThrows) { const d = /^Digit(\d)$/.exec(c); throwPart(PARTS[(+d[1] + 9) % 10], false); } heldThrows.clear(); });

/* ── step display, meter, status: driven by the audio clock ── */
let queue = [], shownBar = 0, shownStep = -1, dirty = true, meterEl = null, analyser = null, abuf = null, peakHold = 0;
engine.on('step', (s) => { queue.push(s); if (queue.length > 256) queue.splice(0, queue.length - 256); });
engine.on('start', () => { queue = []; shownBar = 0; shownStep = -1; dirty = true; });
engine.on('stop', () => { queue = []; shownStep = -1; dirty = true; refresh(); });
engine.on('change', () => { dirty = true; refresh(); save(); });
engine.on('retune', () => { dirty = true; });
engine.on('midi', () => refresh());
function meterSetup() { if (analyser || !engine.output) return; analyser = engine.ctx.createAnalyser(); analyser.fftSize = 1024; abuf = new Float32Array(1024); engine.output.connect(analyser); }
function drawDots() {
  for (const part of PARTS) { if (part === 'noise') continue; const pat = engine.displayBar(part, shownBar), els = dots[part]; for (let i = 0; i < 16; i++) els[i].className = (pat[i] === 1 ? 'on' : pat[i] ? 'maybe' : '') + (i === shownStep ? ' now' : ''); }
}
function frame() {
  if (engine.ctx && engine.playing) {
    const now = engine.ctx.currentTime; let cur = null;
    while (queue.length && queue[0].swung <= now) cur = queue.shift();
    if (cur) { if (cur.bar !== shownBar) { shownBar = cur.bar; dirty = true; } if (cur.step !== shownStep) { shownStep = cur.step; dirty = true; } status(cur.bar); }
  } else if (shownStep !== -1 || statusEl.textContent === '') { shownStep = -1; shownBar = 0; dirty = true; }
  if (!engine.playing) status(null);
  if (dirty) { dirty = false; drawDots(); }
  if (analyser && meterEl) {
    analyser.getFloatTimeDomainData(abuf); let p = 0; for (let i = 0; i < abuf.length; i++) { const a = Math.abs(abuf[i]); if (a > p) p = a; }
    peakHold = Math.max(p, peakHold * 0.93);
    const vol = Math.max(0.0001, S().master.volume * S().master.volume), rel = peakHold / vol;       // relative to the ceiling before the volume knob
    meterEl.firstChild.style.setProperty('--v', Math.min(100, rel / 0.93 * 100) + '%');
    meterEl.classList.toggle('over', engine.meter().reduction < -3 || rel > 0.9);
  }
  if (recorder && recBtnEl) { const s = Math.floor((performance.now() - recT0) / 1000); recBtnEl.firstChild.textContent = `Stop recording ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
  requestAnimationFrame(frame);
}

let saveT = 0;
function save() { clearTimeout(saveT); saveT = setTimeout(() => store.set('state', engine.getState()), 400); }
window.addEventListener('pagehide', () => store.set('state', engine.getState()));

/* ── build ── */
document.getElementById('app').append(head(), top(), partsSection(), desk(), advPattern(), advTuning(), advMidi(), advExport(), advPresets(), advKeys());
requestAnimationFrame(frame);
