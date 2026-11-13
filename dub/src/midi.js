/* MIDI. planNote and midiFile are pure (tested in Node); DubMidi wires an engine to Web MIDI.

   Microtonal scales: a monophonic part gets a pitch bend on its channel before each note. A chord needs one
   bend per note, so it is spread over a block of channels (MPE style). On a single channel that cannot be done:
   the chord then plays the nearest 12-TET keys and the interface says so. */
import { PARTS, PART_NAMES } from './state.js';
import { barEvents, STEPS, SWING } from './sequence.js';

export const GM = { kick: 36, rim: 37, clave: 75, closed: 42, open: 46, shaker: 70, conga: 63, air: 44 };
export const POLY = new Set(['stab', 'pad']);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const bendBytes = (ch, cents, range) => { const v = clamp(8192 + Math.round(cents / (range * 100) * 8192), 0, 16383); return [0xE0 | ch, v & 127, v >> 7]; };

/* What an engine event becomes on the wire. e: the event as the engine reports it (notes: [{ note, cents }],
   dur and sd in seconds). P: the part's state. cfg: state.midi. micro: the scale has tones off the 12-TET grid.
   rot: { [part]: counter } for channel rotation. Returns { msgs: [{ at, data }], tet: true if it had to round }. */
export function planNote(e, P, cfg, micro, rot = {}) {
  const out = { msgs: [], tet: false }, ch0 = (P.ch | 0) - 1;
  if (ch0 < 0 || ch0 > 15) return out;
  const vel = clamp(Math.round(e.vel * 127), 1, 127), range = cfg.bend || 2;
  const push = (at, data) => out.msgs.push({ at, data });
  if (GM[e.kind] != null && cfg.drums !== 'key') {            // drum triggers: fixed keys of the GM map
    push(0, [0x90 | ch0, GM[e.kind], vel]); push(0.06, [0x80 | ch0, GM[e.kind], 0]);
    return out;
  }
  const bend = micro && cfg.micro === 'bend', poly = POLY.has(e.part), width = poly ? clamp(P.rotate | 0, 1, 16 - ch0) : 1;
  const note = (at, m, dur) => {
    let ch = ch0;
    if (bend && poly && width > 1) { rot[e.part] = ((rot[e.part] | 0) + 1) % width; ch = ch0 + rot[e.part]; }
    if (bend && (!poly || width > 1)) push(at, bendBytes(ch, m.cents, range));
    else if (micro && Math.abs(m.cents) > 0.5) out.tet = true;
    push(at, [0x90 | ch, clamp(m.note, 0, 127), vel]); push(at + dur, [0x80 | ch, clamp(m.note, 0, 127), 0]);
  };
  // unpitched noise sent "in key" rings the tonic, in an octave of its own per sound
  const notes = e.notes.length ? e.notes : (e.tonic ? [{ note: e.tonic.note + ({ closed: 24, open: 24, shaker: 12, air: 36 }[e.kind] || 0), cents: e.tonic.cents }] : []);
  if (e.kind === 'siren') { const iv = e.sd / (e.rate || 1); for (let k = 0; k * iv < e.dur; k++) note(k * iv, notes[k % 2], iv * 0.9); }
  else if (e.kind === 'swell') note(0, notes[0], e.dur);
  else { const dur = GM[e.kind] != null ? 0.08 : Math.max(0.03, e.dur * (poly ? 1 : 0.95)); for (const m of notes) note(0, m, e.part === 'stab' ? Math.max(0.05, P.length) : dur); }
  return out;
}

/* Pitch in cents above MIDI note 0 that a receiver would sound for a planned note. For the tests. */
export function decodePlan(msgs, range) {
  const bends = {}, out = [];
  for (const m of msgs) {
    const st = m.data[0] & 0xF0, ch = m.data[0] & 15;
    if (st === 0xE0) bends[ch] = ((m.data[2] << 7 | m.data[1]) - 8192) / 8192 * range * 100;
    else if (st === 0x90) out.push({ ch, note: m.data[1], cents: m.data[1] * 100 + (bends[ch] || 0), at: m.at });
  }
  return out;
}

/* ── Standard MIDI File, format 1: one track per part, the phrase exactly as the step display shows it ── */
const vlq = (n) => { const b = [n & 127]; while ((n >>= 7)) b.unshift((n & 127) | 128); return b; };
export const PPQ = 480, TICKS = PPQ / 4;
export function midiFile(S, tun, { phrase = 0 } = {}) {
  const cfg = S.midi, micro = tun.micro, tracks = [];
  const meta = (type, bytes) => [0xFF, type, ...vlq(bytes.length), ...bytes];
  const text = (s) => Array.from(new TextEncoder().encode(s));
  const us = Math.round(60000000 / S.tempo), total = S.bars * STEPS * TICKS;
  const track = (events) => {                       // events: [{ tick, data }]
    events.sort((a, b) => a.tick - b.tick || (a.order || 0) - (b.order || 0));
    const bytes = []; let last = 0;
    for (const e of events) { bytes.push(...vlq(e.tick - last), ...e.data); last = e.tick; }
    bytes.push(...vlq(Math.max(0, total - last)), 0xFF, 0x2F, 0);
    return bytes;
  };
  tracks.push(track([{ tick: 0, data: meta(0x03, text('Dub')) }, { tick: 0, data: meta(0x51, [us >> 16 & 255, us >> 8 & 255, us & 255]) }, { tick: 0, data: meta(0x58, [4, 2, 24, 8]) }]));
  const byPart = {};
  for (let b = 0; b < S.bars; b++) for (const ev of barEvents(S, tun, phrase * S.bars + b)) {
    const P = S.parts[ev.part]; if (P.mute) continue;
    const tick = (b * STEPS + ev.step) * TICKS + (ev.step % 2 ? Math.round(S.swing * SWING * TICKS) : 0);
    const e = { part: ev.part, kind: ev.kind, vel: ev.vel, dur: ev.len, sd: 1, rate: ev.rate, tonic: tun.midi(0, 4), notes: ev.notes.map(n => tun.midi(n.deg, n.oct)) };
    const plan = planNote(e, { ...P, ch: P.ch || PARTS.indexOf(ev.part) + 1, rotate: 1, length: Math.max(0.5, P.length * S.tempo / 15 || 1) }, cfg, micro, {});
    for (const m of plan.msgs) {
      const isDrum = GM[ev.kind] != null && cfg.drums !== 'key';
      const at = isDrum ? (m.at > 0 ? TICKS / 2 : 0) : m.at * TICKS;                 // planNote ran with one step = 1 "second"
      (byPart[ev.part] = byPart[ev.part] || []).push({ tick: Math.min(total, Math.round(tick + at)), data: m.data, order: (m.data[0] & 0xF0) === 0x80 ? 0 : (m.data[0] & 0xF0) === 0xE0 ? 1 : 2 });
    }
  }
  for (const part of PARTS) if (byPart[part]) tracks.push(track([{ tick: 0, data: meta(0x03, text(PART_NAMES[part])), order: -1 }, ...byPart[part]]));
  const out = [...text('MThd'), 0, 0, 0, 6, 0, 1, tracks.length >> 8, tracks.length & 255, PPQ >> 8, PPQ & 255];
  for (const t of tracks) out.push(...text('MTrk'), t.length >>> 24 & 255, t.length >>> 16 & 255, t.length >>> 8 & 255, t.length & 255, ...t);
  return new Uint8Array(out);
}

/* ── Web MIDI ── */
export class DubMidi {
  constructor(engine) {
    this.e = engine; this.access = null; this.rot = {}; this.used = new Set(); this.note = ''; this.ticks = []; this.sent = 0;
    engine.on('note', (e) => this._note(e));
    engine.on('step', (s) => this._clock(s));
    engine.on('start', (s) => { if (this._clockOut()) this._send([0xFA], s.time); });
    engine.on('stop', () => this.panic(true));
  }
  get cfg() { return this.e.S.midi; }
  get supported() { return typeof navigator !== 'undefined' && !!navigator.requestMIDIAccess; }
  async enable() {
    if (!this.supported) throw new Error('Web MIDI is not available in this browser.');
    this.access = await navigator.requestMIDIAccess({ sysex: false });
    this.access.onstatechange = () => { this._listen(); this.e.emit('midi', {}); };
    if (!this.cfg.out || !this.output) { const first = this.outputs()[0]; if (first) this.e.set('midi.out', first.id); }
    this.e.set('midi.on', true); this._listen();
    return this;
  }
  outputs() { return this.access ? Array.from(this.access.outputs.values()) : []; }
  inputs() { return this.access ? Array.from(this.access.inputs.values()) : []; }
  get output() { return this.access ? this.access.outputs.get(this.cfg.out) || null : null; }
  _listen() {
    for (const i of this.inputs()) i.onmidimessage = (this.cfg.clockIn && (!this.cfg.in || this.cfg.in === i.id)) ? (m) => this._in(m) : null;
  }
  setClockIn(on, id) { this.e.set('midi.clockIn', !!on); if (id !== undefined) this.e.set('midi.in', id); this.ticks = []; this._listen(); }
  /* audio-clock time → the timestamp Web MIDI wants (performance.now clock). The two clocks are read as a pair
     that jitters by a few milliseconds from call to call, so the offset between them is smoothed: MIDI clock
     ticks stay evenly spaced and still follow slow drift. */
  _ts(t) {
    const c = this.e.ctx; let raw;
    try { const o = c.getOutputTimestamp(); if (o && o.performanceTime > 0) raw = o.performanceTime - o.contextTime * 1000; } catch (e) {}
    if (raw == null) raw = performance.now() - (c.currentTime - (c.outputLatency || c.baseLatency || 0)) * 1000;
    if (this._off == null || Math.abs(raw - this._off) > 30) this._off = raw; else this._off += (raw - this._off) * 0.02;
    return this._off + t * 1000;
  }
  _send(data, t) { const o = this.output; if (!o || !this.cfg.on) return; try { o.send(data, t == null ? undefined : this._ts(t)); this.sent++; } catch (e) {} }
  _clockOut() { return this.cfg.on && this.cfg.clockOut && this.output; }
  _clock(s) { if (this._clockOut()) for (let k = 0; k < 6; k++) this._send([0xF8], s.time + k * s.dur / 6); }
  _note(e) {
    if (!this.cfg.on || !this.output) return;
    const P = this.e.S.parts[e.part];
    if (P.out === 'browser' || !P.out) return;
    const plan = planNote(e, P, this.cfg, this.e.tun.micro, this.rot);
    for (const m of plan.msgs) { this._send(m.data, e.time + m.at); this.used.add(m.data[0] & 15); }
    const note = plan.tet ? `${PART_NAMES[e.part]}: this scale has tones between the keys and a chord on one MIDI channel cannot bend each note separately, so it plays the nearest 12-TET keys. For exact tuning set Rotate to 4 or more channels on an MPE-capable synth.` : '';
    if (plan.tet && note !== this.note) { this.note = note; this.e.emit('midi', { note }); }
  }
  /* silence everything we may have started */
  panic(stop) {
    const o = this.output; if (!o) return;
    try {
      if (stop && this.cfg.clockOut && this.cfg.on) o.send([0xFC]);
      for (const ch of this.used) { o.send([0xB0 | ch, 123, 0]); o.send([0xE0 | ch, 0, 64]); }
    } catch (e) {}
  }
  /* MIDI clock in: follow the sender's tempo, start and stop with it */
  _in(m) {
    const st = m.data[0];
    if (st === 0xF8) {
      const now = m.timeStamp || performance.now(); this.ticks.push(now); if (this.ticks.length > 49) this.ticks.shift();
      if (this.ticks.length >= 25 && this.ticks.length % 6 === 1) {
        const span = this.ticks[this.ticks.length - 1] - this.ticks[this.ticks.length - 25], bpm = 60000 / span;
        if (bpm >= 60 && bpm <= 140 && Math.abs(bpm - this.e.S.tempo) > 0.25) this.e.setTempo(Math.round(bpm * 2) / 2);
      }
    } else if (st === 0xFA || st === 0xFB) { this.ticks = []; this.e.start(); }
    else if (st === 0xFC) this.e.stop();
  }
}
