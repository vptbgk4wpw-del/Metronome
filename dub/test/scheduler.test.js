import test from 'node:test';
import assert from 'node:assert/strict';
import { Scheduler } from '../src/scheduler.js';

/* A fake audio clock and a timer that never fires on its own: the test calls tick() itself. */
function rig({ tempo = 120, ahead = 0.14 } = {}) {
  const r = { t: 10, steps: [], skipped: 0 };
  r.s = new Scheduler({ now: () => r.t, stepDur: () => 60 / tempo / 4, ahead: () => ahead, timer: () => () => {},
    onStep: (step, time) => r.steps.push({ step, time, at: r.t }), onSkip: (n) => { r.skipped += n; } });
  r.run = (seconds, every = 0.025) => { for (let e = 0; e < seconds; e += every) { r.t += every; r.s.tick(); } };
  return r;
}

test('every step is planned at least 100 ms ahead on the audio clock, with a 25 ms timer', () => {
  const r = rig(); r.s.start(0.12); r.run(20);
  assert.ok(r.steps.length > 150);
  for (const s of r.steps.slice(1)) assert.ok(s.time - s.at >= 0.1 - 1e-9, `step ${s.step} only ${s.time - s.at}s ahead`);
  assert.equal(r.skipped, 0);
});

test('steps are consecutive and exactly one sixteenth apart', () => {
  const r = rig({ tempo: 118 }); r.s.start(); r.run(10);
  r.steps.forEach((s, i) => { assert.equal(s.step, i); if (i) assert.ok(Math.abs(s.time - r.steps[i - 1].time - 60 / 118 / 4) < 1e-9); });
});

test('after a sleep the overdue steps are dropped, not played in a burst', () => {
  const r = rig(); r.s.start(); r.run(2);
  const before = r.steps.length, last = r.steps[before - 1], t0 = r.steps[0].time, sd = 0.125;
  r.t += 30;                                   // the tab slept for 30 s
  r.s.tick();
  const burst = r.steps.slice(before);
  assert.ok(burst.length <= 3, `${burst.length} steps scheduled at once`);
  assert.ok(r.skipped > 200);
  for (const s of burst) {
    assert.ok(s.time >= r.t, 'nothing is scheduled in the past');
    assert.ok(Math.abs((s.time - t0) / sd - s.step) < 1e-6, 'the grid did not move');
  }
  assert.ok(burst[0].step > last.step + 200);
});

test('a throttled timer (1 s ticks) loses nothing when the look-ahead is widened', () => {
  const r = rig({ ahead: 1.6 }); r.s.start(); r.run(20, 1);
  assert.equal(r.skipped, 0);
  r.steps.forEach((s, i) => assert.equal(s.step, i));
});

test('tempo changes take effect on the next step', () => {
  let tempo = 120; const r = { t: 0, steps: [] };
  const s = new Scheduler({ now: () => r.t, stepDur: () => 60 / tempo / 4, timer: () => () => {}, onStep: (step, time) => r.steps.push(time) });
  s.start(0.1);
  for (let i = 0; i < 400; i++) { r.t += 0.025; if (i === 200) tempo = 60; s.tick(); }
  const d = r.steps.slice(1).map((t, i) => +(t - r.steps[i]).toFixed(6));
  assert.equal(d[0], 0.125); assert.equal(d[d.length - 1], 0.25);
});
