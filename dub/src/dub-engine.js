/* Dub engine: generation, synthesis and the dub desk, with no dependency on any interface.
   Dish and Marble can embed it in place of the old DUB object:

     import { DubEngine } from './dub-engine.js';
     const dub = new DubEngine({ state: { tempo: 118, key: 9, scale: 'aeolian' } });
     await dub.init(audioContext);          // or dub.init() to let it make its own context
     dub.connect(analyser);                 // connect(node) adds a destination; the context's output is connected by default
     dub.on('kick', e => pulse(e.time, e.vel));
     dub.start();

   Every played sound is reported with the part name, its time on the audio clock and its strength, a
   look-ahead (≈ 0.14 s) before it sounds, so visuals can act on exact events instead of guessing from analysis. */
import { Scheduler } from './scheduler.js';
import { KEYS, SCALES, scaleById } from './tuning.js';
import { PARTS, makeState, merge, clone, tuningOf, PRESETS, DEFAULTS } from './state.js';
import { barEvents, displayBar, pitchesOf, autoScene, epochAt, STEPS, SWING } from './sequence.js';
import { buildGraph } from './graph.js';
import { loadWorklets } from './fx.js';
import { hash } from './prng.js';

export { SWING };
const TUNING_PATHS = new Set(['key', 'scale', 'a4', 'offsets', 'custom']);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class DubEngine {
  constructor({ state = null, context = null, autoConnect = true, audit = null } = {}) {
    this.S = makeState(state);
    this.tun = tuningOf(this.S);
    this.ctx = context; this.G = null; this.output = null; this.autoConnect = autoConnect; this.audit = audit;
    this.playing = false; this.version = 0; this.bar = 0; this.step = -1;
    this._on = new Map(); this._dest = []; this._pendTun = false; this._pendScene = null; this._forcePad = -1; this._barCache = null;
    this._vis = () => this._visibility();
    this.stats = { steps: 0, late: 0, skipped: 0 };       // late: steps handed out after their time; skipped: steps dropped after a sleep
  }

  /* ── set-up ── */
  /* Call this synchronously inside a tap or key handler. Phones only let sound start from a gesture: the
     context is made and resumed right here, before anything is awaited, and one silent sample is played. */
  unlock() {
    try {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!this.ctx) this.ctx = new AC({ latencyHint: 'interactive' });
      if (this.ctx.state !== 'running' && this.ctx.resume) { const p = this.ctx.resume(); if (p && p.catch) p.catch(() => {}); }
      const s = this.ctx.createBufferSource(); s.buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate); s.connect(this.ctx.destination); s.start(0);
    } catch (e) { /* no audio here; init() will report it */ }
    return this.ctx;
  }
  async init(context) {
    if (this.G) return this;
    if (this._init) return this._init;
    this._init = (async () => {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      this.ctx = context || this.ctx || new AC({ latencyHint: 'interactive' });
      this.tape = await loadWorklets(this.ctx);
      this.G = buildGraph(this.ctx, { tape: this.tape, audit: this.audit });
      this.G.apply(this.S, this.tun, this.ctx.currentTime, true);
      this.output = this.G.out;
      if (this.autoConnect) this.output.connect(this.ctx.destination);
      for (const n of this._dest) this.output.connect(n);
      this.sched = new Scheduler({ now: () => this.ctx.currentTime, stepDur: () => 15 / this.S.tempo, ahead: () => this._ahead(), onStep: (s, t, d) => this._step(s, t, d), onSkip: (n) => { this.stats.skipped += n; } });
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this._vis);
      this.emit('ready', { tape: this.tape });
      return this;
    })();
    this._init.catch(() => { this._init = null; });       // a failed set-up can be tried again
    return this._init;
  }
  connect(node) { if (this.output) this.output.connect(node); else this._dest.push(node); return node; }
  disconnect(node) { this._dest = this._dest.filter(n => n !== node); if (this.output) { try { node ? this.output.disconnect(node) : this.output.disconnect(); } catch (e) {} } }
  dispose() { this.stop(); if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this._vis); if (this.G) this.G.dispose(); this.G = null; }

  /* ── transport ── */
  async start() {
    if (!this.G) await this.init();
    if (this.playing) return;
    // never wait on resume(): without a gesture some phones leave that promise pending for ever
    if (this.ctx.state !== 'running') { try { const p = this.ctx.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
    this.playing = true; this.bar = 0; this.step = -1; this._barCache = null; this._forcePad = -1;
    if (this._pendTun) { this.tun = tuningOf(this.S); this._pendTun = false; }
    this.G.apply(this.S, this.tun, this.ctx.currentTime);
    this.G.setRunning(true);
    this.emit('start', { time: this.ctx.currentTime + 0.12 });
    this.sched.start(0.12);
  }
  stop() {
    if (!this.playing) return;
    this.playing = false; this.sched.stop(); this.G.setRunning(false);
    if (this._pendScene) { this.S.scene = this._pendScene; this._pendScene = null; }
    this.step = -1;
    this.emit('stop', { time: this.ctx.currentTime });
  }
  toggle() { return this.playing ? (this.stop(), false) : (this.start(), true); }

  /* ── state ── */
  get state() { return this.S; }
  getState() { return clone(this.S); }
  get(path) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), this.S); }
  set(path, value) {
    const keys = path.split('.'), last = keys.pop();
    let o = this.S; for (const k of keys) { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; }
    if (o[last] === value) return;
    o[last] = value;
    this._changed(keys[0] || last, path);
  }
  /* Merge a patch (a preset, a saved state). Tuning changes wait for the bar line while playing. */
  patch(patch, name = 'patch') { this.S = merge(this.S, patch); this.S.tempo = clamp(+this.S.tempo || 118, 60, 140); this._changed('*', name); }
  loadPreset(name, presets = PRESETS) {
    const p = presets[name]; if (!p) return false;
    const base = clone(DEFAULTS), keep = this.S;
    // a preset is a sound and a feel: it leaves key, scale, tuning, seed, MIDI routing and locks alone
    const next = merge(base, p);
    for (const k of ['seed', 'seedLock', 'key', 'scale', 'a4', 'offsets', 'custom', 'midi', 'xy', 'customProg']) next[k] = keep[k];
    for (const part of PARTS) for (const k of ['lock', 'mute', 'solo', 'out', 'ch', 'rotate']) if (keep.parts[part][k] !== undefined) next.parts[part][k] = keep.parts[part][k];
    next.master.volume = keep.master.volume; next.scene = keep.scene;
    this.S = next; this._changed('*', 'preset');
    return true;
  }
  _changed(top, path) {
    this.version++;
    if (top === '*' || TUNING_PATHS.has(top)) { if (this.playing) this._pendTun = true; else this.tun = tuningOf(this.S); }
    if (this.G) this.G.apply(this.S, this.tun, this.ctx.currentTime);
    this.emit('change', { path });
  }

  setTempo(bpm) { this.set('tempo', clamp(Math.round(bpm * 10) / 10, 60, 140)); }
  setKey(key) { const k = typeof key === 'string' ? KEYS.findIndex(n => n.toLowerCase() === key.toLowerCase().replace('#', '♯').replace(/b$/, '♭')) : key; if (k >= 0 && k < 12) this.set('key', k); }
  setScale(id) { if (scaleById(id, this.S.custom).id === id) this.set('scale', id); }
  setSeed(seed) { this.set('seed', Math.abs(Math.floor(+seed || 0)) % 100000); }
  newSeed() { if (!this.S.seedLock) this.setSeed(hash(this.S.seed, 'next') % 100000); return this.S.seed; }
  setMute(part, on) { this.set(`parts.${part}.mute`, !!on); }
  setSolo(part, on) { this.set(`parts.${part}.solo`, !!on); }
  mute(part, on = true) { this.setMute(part, on); }
  unmute(part) { this.setMute(part, false); }
  /* Lock freezes a part's pattern as it is now: new seeds and its own variation no longer touch it. */
  setLock(part, on) { const P = this.S.parts[part]; this.set(`parts.${part}.lock`, on ? { seed: this.S.seed, epoch: epochAt(this.S.seed, part, P.variation, Math.floor(this.bar / this.S.bars)) } : null); }
  /* Scenes change on the phrase line while playing. */
  setScene(name) {
    if (!this.playing) { this.set('scene', name); return; }
    this._pendScene = name === this.S.scene ? null : name;
    this.emit('change', { path: 'scene' });
  }
  get pendingScene() { return this._pendScene; }
  /* Throw: send a part to the delay (and some reverb) for as long as it is held. */
  throwSend(part, on) { if (this.G) this.G.setThrow(part, on, this.S); this.emit('throw', { part, on: !!on }); }
  freeze(on) { this.set('delay.freeze', !!on); }

  /* ── events ── */
  on(name, fn) { if (!this._on.has(name)) this._on.set(name, new Set()); this._on.get(name).add(fn); return () => this.off(name, fn); }
  off(name, fn) { const s = this._on.get(name); if (s) s.delete(fn); }
  emit(name, data) { const s = this._on.get(name); if (s) for (const fn of s) { try { fn(data); } catch (e) { console.error(e); } } }

  /* ── what the display needs ── */
  displayBar(part, bar = this.bar) { return displayBar(this.S, this.tun, part, bar, {}); }
  get phrase() { return Math.floor(this.bar / this.S.bars); }
  meter() { return this.G ? { reduction: this.G.master.lim.reduction || 0 } : { reduction: 0 }; }

  /* ── scheduling ── */
  _ahead() {
    const hidden = typeof document !== 'undefined' && document.hidden;
    return Math.max(0.14, Math.min(2.5, (this.sched.gap || 0) * 1.6 + 0.05), hidden ? 2 : 0);   // a throttled background timer needs a longer runway
  }
  _visibility() {
    if (!this.ctx) return;
    if (document.hidden) { if (this.playing) this.sched.tick(); }
    else if (this.playing && this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
  }
  _step(n, time, sd) {
    const bar = Math.floor(n / STEPS), s = n % STEPS, S = this.S;
    this.stats.steps++; if (time < this.ctx.currentTime) this.stats.late++;
    if (s === 0 || bar !== this.bar) this._barLine(bar, time);
    let c = this._barCache;
    if (!c || c.bar !== bar || c.version !== this.version) c = this._barCache = { bar, version: this.version, evs: barEvents(S, this.tun, bar, { forcePad: this._forcePad === bar }) };
    const t = time + (s % 2 ? S.swing * sd * SWING : 0);
    const anySolo = PARTS.some(p => S.parts[p].solo);
    for (const ev of c.evs) {
      if (ev.step !== s) continue;
      const P = S.parts[ev.part];
      if (P.mute || (anySolo && !P.solo)) continue;
      const hz = pitchesOf(this.tun, ev);
      if (P.out !== 'midi') this.G.play(ev, hz, t, sd, S);
      const e = { part: ev.part, kind: ev.kind, time: t, vel: ev.vel, bar, step: s, dur: ev.len * sd, sd, hz, notes: ev.notes.map(x => this.tun.midi(x.deg, x.oct)), tonic: this.tun.midi(0, 4), rate: ev.rate, out: P.out };
      this.emit(ev.part, e); this.emit('note', e);
    }
    this.step = s;
    this.emit('step', { step: s, bar, time, swung: t, dur: sd });
  }
  _barLine(bar, time) {
    const S = this.S;
    this.bar = bar;
    if (this._pendTun) {                              // key, scale and tuning change here, for every part at once
      this._pendTun = false; this.tun = tuningOf(S); this.version++;
      this.G.apply(S, this.tun, time); this.G.fadePads(time); this._forcePad = bar;
      this.emit('retune', { time, key: S.key, scale: S.scale });
    }
    if (bar % S.bars === 0) {
      const sc = this._pendScene || (S.auto ? autoScene(S, bar) : null);
      this._pendScene = null;
      if (sc && sc !== S.scene) { S.scene = sc; this.version++; this.emit('scene', { scene: sc, time }); this.emit('change', { path: 'scene' }); }
    }
    this.emit('bar', { bar, time, phrase: Math.floor(bar / S.bars), barInPhrase: bar % S.bars });
  }
}

export { PARTS, KEYS, SCALES, PRESETS, makeState, tuningOf };
export default DubEngine;
