import test from 'node:test';
import assert from 'node:assert/strict';
import { Tuning, SCALES, COMMA, parseScale, scaleById } from '../src/tuning.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);
const S = (id) => scaleById(id);

test('reference pitch: A4 = 440 Hz, adjustable 430–450', () => {
  close(new Tuning({ key: 9 }).hz(0, 4), 440);
  close(new Tuning({ key: 0 }).hz(0, 4), 261.6255653, 1e-6);
  close(new Tuning({ key: 9, a4: 432 }).hz(0, 4), 432);
  close(new Tuning({ key: 9, a4: 500 }).hz(0, 4), 450);     // clamped
  close(new Tuning({ key: 9, a4: 400 }).hz(0, 4), 430);
});

test('there are 19 built-in scales in three groups', () => {
  assert.equal(SCALES.length, 19);
  assert.deepEqual(SCALES.filter(s => s.group === 'Western').map(s => s.name), ['Aeolian', 'Dorian', 'Phrygian', 'Harmonic minor', 'Minor pentatonic', 'Mixolydian', 'Major']);
  assert.deepEqual(SCALES.filter(s => s.group === 'Makam').map(s => s.name), ['Rast', 'Uşşak', 'Hüseyni', 'Hicaz', 'Kürdi', 'Saba']);
  assert.deepEqual(SCALES.filter(s => s.group === 'Qenet').map(s => s.name), ['Tizita major', 'Tizita minor', 'Bati major', 'Bati minor', 'Ambassel', 'Anchihoye']);
});

test('makam scales are cumulative AEU commas of 1200/53 cents and close the octave', () => {
  for (const s of SCALES.filter(s => s.group === 'Makam')) {
    assert.equal(s.commas.reduce((a, b) => a + b, 0), 53, s.name);
    let c = 0;
    s.commas.forEach((k, i) => { close(s.cents[i], c * COMMA, 1e-9); c += k; });
  }
  close(S('rast').cents[1], 9 * 1200 / 53);        // 203.77 c
  close(S('rast').cents[2], 17 * 1200 / 53);       // 384.91 c, the "neutral-ish" AEU third
  close(S('ussak').cents[1], 8 * 1200 / 53);       // 181.13 c
  close(S('saba').cents[3], 18 * 1200 / 53);       // 407.55 c
});

test('qenet scales use the cents given in the brief', () => {
  assert.deepEqual(S('tizitamaj').cents, [0, 200, 400, 700, 900]);
  assert.deepEqual(S('tizitamin').cents, [0, 200, 300, 700, 800]);
  assert.deepEqual(S('batimaj').cents, [0, 400, 500, 700, 1100]);
  assert.deepEqual(S('batimin').cents, [0, 300, 500, 700, 1000]);
  assert.deepEqual(S('ambassel').cents, [0, 100, 500, 700, 800]);
  assert.deepEqual(S('anchihoye').cents, [0, 100, 500, 600, 900]);
});

test('degrees wrap into octaves, also below the tonic', () => {
  const t = new Tuning({ key: 9, scale: S('aeolian') });
  close(t.hz(7, 3), t.hz(0, 4));
  close(t.hz(-7, 4), t.hz(0, 3));
  close(t.hz(-1, 4), 440 * Math.pow(2, -2 / 12));    // G below A
  close(t.hz(4, 4), 440 * Math.pow(2, 7 / 12));      // E above A
  const p = new Tuning({ key: 0, scale: S('batimin') });
  close(p.hz(5, 2), p.hz(0, 3));
});

test('per-degree correction is ±50 cents and moves only that degree', () => {
  const base = new Tuning({ key: 2, scale: S('ussak') });
  const t = new Tuning({ key: 2, scale: S('ussak'), offsets: [0, -30, 0, 0, 0, 0, 90] });
  close(t.degCents(1) - base.degCents(1), -30);
  close(t.degCents(6) - base.degCents(6), 50);       // clamped
  close(t.degCents(2), base.degCents(2));
  close(t.degCents(8, 1) - base.degCents(8, 1), -30); // the same degree an octave up
});

test('snap lands exactly on a scale tone and is idempotent', () => {
  for (const scale of SCALES) for (const key of [0, 6, 9]) {
    const t = new Tuning({ key, scale });
    for (const hz of [23, 55.3, 180, 317, 1234.5, 4200, 11500, 17999]) {
      const f = t.snap(hz);
      assert.ok(t.error(f) < 1e-6, `${scale.name} ${hz}`);
      close(t.snap(f), f, 1e-9);
      const tones = t.tones(hz / 2, hz * 2);
      const nearest = tones.reduce((a, b) => Math.abs(Math.log(b / hz)) < Math.abs(Math.log(a / hz)) ? b : a);
      close(f, nearest, 1e-6);
    }
  }
});

test('registers pick an octave, not a pitch', () => {
  for (let key = 0; key < 12; key++) {
    const t = new Tuning({ key }), f = t.hz(0, t.registerOct(41));
    assert.ok(f >= 41 - 1e-9 && f < 82, `key ${key}: ${f}`);
  }
});

test('the fifth is found in the scale, with fourth and octave as fallbacks', () => {
  for (const scale of SCALES) {
    const t = new Tuning({ scale }), j = t.fifthOf(0), c = t.degCents(j) - t.degCents(0);
    if (scale.id === 'anchihoye') close(c, 500); else assert.ok(Math.abs(c - 702) < 60, `${scale.name}: ${c}`);
  }
  const whole = new Tuning({ scale: { id: 'x', name: 'x', cents: [0, 200, 400, 600, 800, 1000] } });
  close(whole.degCents(whole.fifthOf(0)), 1200);
});

test('MIDI note plus bend reproduces the frequency', () => {
  for (const scale of SCALES) {
    const t = new Tuning({ key: 4, scale });
    for (let d = -7; d < 15; d++) {
      const m = t.midi(d, 3);
      assert.ok(Math.abs(m.cents) <= 50 + 1e-9);
      close(t.a4 * Math.pow(2, (m.note - 69 + m.cents / 100) / 12), t.hz(d, 3), 1e-9);
      if (!t.micro) close(m.cents, 0, 1e-7);
    }
  }
});

test('custom scales are entered in cents', () => {
  assert.deepEqual(parseScale('0 150 350 500 700 850 1000'), [0, 150, 350, 500, 700, 850, 1000]);
  assert.deepEqual(parseScale('204, 386.3, 702, 1200'), [0, 204, 386.3, 702]);
  assert.equal(parseScale('0 300 200'), null);
  assert.equal(parseScale('abc'), null);
  assert.equal(parseScale('0'), null);
});
