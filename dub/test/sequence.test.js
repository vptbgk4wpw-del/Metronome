import test from 'node:test';
import assert from 'node:assert/strict';
import { SCALES } from '../src/tuning.js';
import { makeState, tuningOf, PARTS, STYLE_NAMES, VOICING_NAMES } from '../src/state.js';
import { barEvents, resolveBar, displayBar, pitchesOf, chordDegrees, PROGRESSIONS, parseProgression, euclid, epochAt, autoScene } from '../src/sequence.js';

const run = (S, bars = 16, opt) => { const t = tuningOf(S), out = []; for (let b = 0; b < bars; b++) out.push(...barEvents(S, t, b, opt)); return out; };
const full = (patch) => { const S = makeState({ intensity: 1, ...patch }); for (const p of PARTS) S.parts[p].density = 1; return S; };

/* Acceptance 1, generator side: every pitch that can be scheduled is a tone of the scale, to 1 cent. */
test('every scheduled pitch belongs to the scale (19 scales × 3 keys × 5 styles × 6 progressions)', () => {
  let checked = 0, worst = 0;
  for (const scale of SCALES) for (const key of [0, 6, 9]) for (const style of Object.keys(STYLE_NAMES)) {
    for (const progression of [...Object.keys(PROGRESSIONS), 'custom']) {
      const S = full({ scale: scale.id, key, style, progression, customProg: '1:1 4:1 6:1 5:1', seed: 7 + key });
      S.parts.kick.tune = key === 6 ? 'fifth' : 'root';
      const t = tuningOf(S);
      for (const ev of run(S, 8)) for (const hz of pitchesOf(t, ev)) {
        const e = t.error(hz); worst = Math.max(worst, e); checked++;
        assert.ok(e < 1, `${scale.name} key ${key} ${style} ${ev.part}: ${hz} Hz is ${e} c off`);
      }
    }
  }
  assert.ok(checked > 100000);
  console.log(`      ${checked} pitches checked, worst error ${worst.toExponential(2)} cents`);
});

test('the same holds with per-degree corrections and a custom scale', () => {
  const S = full({ scale: 'ussak', key: 2, offsets: { ussak: [0, -22, 0, 0, 12, 0, 0] } });
  const t = tuningOf(S);
  for (const ev of run(S, 8)) for (const hz of pitchesOf(t, ev)) assert.ok(t.error(hz) < 1);
  const C = full({ scale: 'u1', custom: [{ id: 'u1', name: 'Bohlen', cents: [0, 146.3, 292.6, 438.9, 585.2, 731.5, 877.8, 1024.1] }] });
  const tc = tuningOf(C);
  assert.equal(tc.n, 8);
  for (const ev of run(C, 8)) for (const hz of pitchesOf(tc, ev)) assert.ok(tc.error(hz) < 1);
});

/* Acceptance 3 */
test('same seed and settings give an identical event sequence', () => {
  const a = JSON.stringify(run(makeState({ seed: 99 }), 32)), b = JSON.stringify(run(makeState({ seed: 99 }), 32));
  assert.equal(a, b);
  assert.ok(a.length > 5000);
  assert.notEqual(a, JSON.stringify(run(makeState({ seed: 100 }), 32)));
});

test('bars can be resolved in any order with the same result', () => {
  const S = makeState({ seed: 5 }), t = tuningOf(S);
  const fwd = [0, 1, 2, 3, 4, 5, 6, 7].map(b => JSON.stringify(barEvents(S, t, b)));
  const rev = [7, 6, 5, 4, 3, 2, 1, 0].map(b => JSON.stringify(barEvents(S, t, b))).reverse();
  assert.deepEqual(fwd, rev);
});

test('key and scale do not change the rhythm, only the pitch', () => {
  const strip = (evs) => JSON.stringify(evs.map(e => [e.part, e.bar, e.step, e.kind, e.vel]));
  assert.equal(strip(run(makeState({ key: 0 }), 8)), strip(run(makeState({ key: 7 }), 8)));
  assert.equal(strip(run(makeState({ scale: 'aeolian' }), 8)), strip(run(makeState({ scale: 'huseyni', voicing: 'm79' }), 8)));
});

test('no Math.random anywhere in the music logic', async () => {
  const fs = await import('node:fs');
  for (const f of ['sequence.js', 'prng.js', 'tuning.js', 'state.js', 'scheduler.js']) {
    const code = fs.readFileSync(new URL('../src/' + f, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');   // comments may name it
    assert.ok(!/Math\.random/.test(code), f);
  }
  const real = Math.random; Math.random = () => { throw new Error('Math.random called'); };
  try { run(makeState(), 8); } finally { Math.random = real; }
});

test('density reveals more of the same pattern', () => {
  for (const part of PARTS) {
    if (part === 'noise') continue;
    let prev = null;
    for (const d of [0.2, 0.5, 0.8, 1]) {
      const S = makeState(); S.parts[part].density = d;
      const cur = displayBar(S, tuningOf(S), part, 3).map(v => v > 0);
      if (prev) prev.forEach((on, i) => { if (on) assert.ok(cur[i], `${part} lost step ${i} at density ${d}`); });
      prev = cur;
    }
  }
});

test('lock freezes a pattern against new seeds and variation', () => {
  const S = makeState({ seed: 1 }); S.parts.hats.lock = { seed: 1, epoch: 0 }; S.parts.hats.variation = 1;
  const t = tuningOf(S);
  const a = JSON.stringify([0, 1, 2, 3].map(b => displayBar(S, t, 'hats', b)));
  S.seed = 777;
  assert.equal(JSON.stringify([40, 41, 42, 43].map(b => displayBar(S, t, 'hats', b))), a);
});

test('variation 0 repeats the phrase, variation 1 changes it', () => {
  const S = makeState(); S.parts.stab.variation = 0;
  const t = tuningOf(S), strip = (b) => JSON.stringify(displayBar(S, t, 'stab', b));
  for (let b = 0; b < 4; b++) assert.equal(strip(b), strip(b + 40));
  assert.equal(epochAt(1, 'stab', 0, 50), 0);
  assert.ok(epochAt(1, 'stab', 1, 50) > 40);
});

test('scenes and intensity thin the arrangement', () => {
  const S = makeState(), t = tuningOf(S);
  const partsIn = (opt, patch) => { const X = makeState(patch); return new Set(barEvents(X, t, 0, opt).concat(barEvents(X, t, 3, opt)).map(e => e.part)); };
  assert.ok(partsIn({ scene: 'groove' }).has('kick'));
  assert.ok(!partsIn({ scene: 'break' }).has('kick') && !partsIn({ scene: 'break' }).has('bass'));
  assert.ok(!partsIn({ scene: 'intro' }).has('kick') && partsIn({ scene: 'intro' }).has('pad'));
  assert.deepEqual([...partsIn({}, { intensity: 0.07 })].sort(), ['pad', 'stab']);
  assert.ok(run(makeState({ intensity: 1 }), 4).length > run(makeState({ intensity: 0.3 }), 4).length);
  assert.deepEqual([0, 15, 16, 32, 48, 64].map(b => autoScene(S, b)), ['intro', 'intro', 'groove', 'break', 'drop', 'groove']);
});

test('the bass is one voice: notes never overlap and stay inside the bar', () => {
  for (const style of Object.keys(STYLE_NAMES)) for (const seed of [1, 2, 3, 4, 5]) {
    const S = full({ style, seed }), t = tuningOf(S);
    for (let b = 0; b < 8; b++) {
      const evs = resolveBar(S, t, 'bass', b);
      evs.forEach((e, i) => { assert.ok(e.step + e.len <= (i + 1 < evs.length ? evs[i + 1].step : 16) + 1e-9); });
      assert.equal(evs[0].step === 0 ? evs[0].notes[0].deg % t.n : 0, 0);
    }
  }
});

test('chords are stacked scale degrees', () => {
  const S = makeState({ voicing: 'm79' }), t = tuningOf(S);
  assert.deepEqual(chordDegrees(S, t, 0), [0, 2, 4, 6, 8]);
  assert.deepEqual(chordDegrees(S, t, -1), [-1, 1, 3, 5, 7]);
  const P = makeState({ scale: 'minpent', voicing: 'm79' }), tp = tuningOf(P);
  assert.deepEqual(chordDegrees(P, tp, 0).map(d => tp.degCents(d)), [0, 300, 700, 1000, 1500]);
  const M = makeState({ scale: 'rast' });           // microtonal → Fifths by default
  assert.deepEqual(chordDegrees(M, tuningOf(M), 0), [0, 4, 7, 11]);
  for (const v of Object.keys(VOICING_NAMES)) assert.ok(chordDegrees(makeState({ voicing: v }), t, 0).length >= 3);
});

test('progressions and euclidean rhythms', () => {
  assert.deepEqual(parseProgression('1:2 7:1 6:1'), [[0, 2], [-1, 1], [-2, 1]]);
  assert.equal(parseProgression('1:2 9'), null);
  assert.deepEqual(euclid(3, 8), [0, 3, 6]);
  assert.deepEqual(euclid(4, 16), [0, 4, 8, 12]);
  assert.equal(euclid(5, 16, 3).length, 5);
});
