import test from 'node:test';
import assert from 'node:assert/strict';
import { SCALES } from '../src/tuning.js';
import { makeState, tuningOf, PARTS } from '../src/state.js';
import { barEvents } from '../src/sequence.js';
import { planNote, decodePlan, midiFile, GM, PPQ, TICKS } from '../src/midi.js';

const asEngine = (tun, ev, sd = 0.125) => ({ part: ev.part, kind: ev.kind, vel: ev.vel, dur: ev.len * sd, sd, rate: ev.rate, tonic: tun.midi(0, 4), notes: ev.notes.map(n => tun.midi(n.deg, n.oct)) });
const full = (patch) => { const S = makeState({ intensity: 1, ...patch }); for (const p of PARTS) { S.parts[p].density = 1; S.parts[p].out = 'both'; } S.parts.stab.rotate = 6; S.parts.pad.rotate = 6; S.parts.stab.ch = 10; S.parts.pad.ch = 4; return S; };

/* Acceptance 1, MIDI side: note + pitch bend is a tone of the scale, to 1 cent, in every built-in scale and three keys. */
test('MIDI notes with bend land on scale tones (drums sent in key)', () => {
  let n = 0, worst = 0;
  for (const scale of SCALES) for (const key of [0, 6, 9]) {
    const S = full({ scale: scale.id, key }); S.midi.drums = 'key'; S.midi.micro = 'bend';
    const t = tuningOf(S), rot = {};
    for (let b = 0; b < 8; b++) for (const ev of barEvents(S, t, b)) {
      const plan = planNote(asEngine(t, ev), S.parts[ev.part], S.midi, t.micro, rot);
      assert.equal(plan.tet, false);
      for (const d of decodePlan(plan.msgs, S.midi.bend)) {
        const hz = t.a4 * Math.pow(2, (d.cents - 6900) / 1200), e = t.error(hz);
        worst = Math.max(worst, e); n++;
        assert.ok(e < 1, `${scale.name} ${ev.part} note ${d.note}: ${e} c off`);
      }
    }
  }
  assert.ok(n > 5000);
  console.log(`      ${n} MIDI notes checked, worst error ${worst.toFixed(3)} cents`);
});

test('12-TET scales send no bends at all', () => {
  const S = full({ scale: 'dorian' }), t = tuningOf(S);
  for (const ev of barEvents(S, t, 3)) for (const m of planNote(asEngine(t, ev), S.parts[ev.part], S.midi, t.micro, {}).msgs) assert.notEqual(m.data[0] & 0xF0, 0xE0);
});

test('a microtonal chord on one channel falls back to the nearest keys and says so', () => {
  const S = full({ scale: 'rast', voicing: 'm79' }); S.parts.stab.rotate = 1;
  const t = tuningOf(S), ev = barEvents(S, t, 0).find(e => e.part === 'stab');
  const plan = planNote(asEngine(t, ev), S.parts.stab, S.midi, true, {});
  assert.equal(plan.tet, true);
  assert.ok(plan.msgs.every(m => (m.data[0] & 0xF0) !== 0xE0));
  assert.deepEqual(plan.msgs.filter(m => (m.data[0] & 0xF0) === 0x90).map(m => m.data[1]), ev.notes.map(n => t.midi(n.deg, n.oct).note));
});

test('a rotated chord puts every note on its own channel with its own bend', () => {
  const S = full({ scale: 'huseyni', voicing: 'm79' }), t = tuningOf(S), ev = barEvents(S, t, 0).find(e => e.part === 'stab');
  const d = decodePlan(planNote(asEngine(t, ev), S.parts.stab, S.midi, true, {}).msgs, 2);
  assert.equal(new Set(d.map(x => x.ch)).size, ev.notes.length);
  assert.ok(d.every(x => x.ch >= 9 && x.ch < 15));
});

test('every note-on has a note-off on the same channel and key', () => {
  const S = full({ scale: 'saba' }), t = tuningOf(S), rot = {};
  for (let b = 0; b < 4; b++) for (const ev of barEvents(S, t, b)) {
    const msgs = planNote(asEngine(t, ev), S.parts[ev.part], S.midi, true, rot).msgs;
    const on = msgs.filter(m => (m.data[0] & 0xF0) === 0x90), off = msgs.filter(m => (m.data[0] & 0xF0) === 0x80);
    assert.equal(on.length, off.length);
    for (const m of on) assert.ok(off.some(o => (o.data[0] & 15) === (m.data[0] & 15) && o.data[1] === m.data[1] && o.at > m.at));
  }
});

test('drum parts default to GM keys on their own channels', () => {
  const S = makeState(), t = tuningOf(S);
  const kick = barEvents(S, t, 0).find(e => e.part === 'kick');
  const p = planNote(asEngine(t, kick), S.parts.kick, S.midi, false, {});
  assert.deepEqual(p.msgs[0].data, [0x90, GM.kick, Math.round(kick.vel * 127)]);
  assert.equal(new Set(PARTS.filter(x => x !== 'noise').map(x => S.parts[x].ch)).size, 9);
});

/* Acceptance 6, file side: the MIDI file is the pattern on screen. */
function parse(u8) {
  const dv = new DataView(u8.buffer); let o = 14; const tracks = [];
  assert.equal(String.fromCharCode(...u8.slice(0, 4)), 'MThd');
  const ntr = dv.getUint16(10), ppq = dv.getUint16(12);
  for (let i = 0; i < ntr; i++) {
    assert.equal(String.fromCharCode(...u8.slice(o, o + 4)), 'MTrk');
    const len = dv.getUint32(o + 4), end = o + 8 + len; o += 8;
    let tick = 0, name = '', notes = [], tempo = 0, status = 0;
    while (o < end) {
      let d = 0, b; do { b = u8[o++]; d = d << 7 | (b & 127); } while (b & 128); tick += d;
      status = u8[o++];
      if (status === 0xFF) { const type = u8[o++]; let l = 0; do { b = u8[o++]; l = l << 7 | (b & 127); } while (b & 128);
        if (type === 3) name = new TextDecoder().decode(u8.slice(o, o + l)); if (type === 0x51) tempo = 60000000 / (u8[o] << 16 | u8[o + 1] << 8 | u8[o + 2]); o += l; }
      else { const a = u8[o++], c = u8[o++]; if ((status & 0xF0) === 0x90) notes.push({ tick, ch: status & 15, note: a, vel: c }); }
    }
    assert.equal(o, end);
    tracks.push({ name, notes, tempo, end: tick });
  }
  return { ppq, tracks };
}
test('the MIDI file holds the phrase as displayed: one track per part, steps on the grid', () => {
  const S = makeState({ tempo: 112, swing: 0, bars: 4 }), t = tuningOf(S);
  const f = parse(midiFile(S, t));
  assert.equal(f.ppq, PPQ);
  assert.ok(Math.abs(f.tracks[0].tempo - 112) < 0.01);
  for (const tr of f.tracks) assert.equal(tr.end, 4 * 16 * TICKS);
  const evs = []; for (let b = 0; b < 4; b++) evs.push(...barEvents(S, t, b));
  for (const part of ['kick', 'bass', 'hats', 'rim']) {
    const tr = f.tracks.find(x => x.name === { kick: 'Kick', bass: 'Sub bass', hats: 'Hats', rim: 'Rim / clave' }[part]);
    const want = evs.filter(e => e.part === part).map(e => (e.bar * 16 + e.step) * TICKS);
    assert.deepEqual(tr.notes.map(n => n.tick), want, part);
    assert.ok(tr.notes.every(n => n.ch === S.parts[part].ch - 1));
  }
  const bass = f.tracks.find(x => x.name === 'Sub bass'), want = evs.filter(e => e.part === 'bass').map(e => t.midi(e.notes[0].deg, e.notes[0].oct).note);
  assert.deepEqual(bass.notes.map(n => n.note), want);
  const stab = f.tracks.find(x => x.name === 'Chord stab'), first = evs.find(e => e.part === 'stab');
  assert.deepEqual(stab.notes.slice(0, first.notes.length).map(n => n.note).sort(), first.notes.map(n => t.midi(n.deg, n.oct).note).sort());
});
