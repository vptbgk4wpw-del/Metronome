/* Acceptance checks that need a real browser: run the built files in headless Chromium.
   node tools/accept.mjs [audit] [retune] [live] [freeze] [loop] [midi] [soak=120] */
import fs from 'node:fs';
import { open, pull, stats } from './harness.mjs';
import { encodeWav } from '../src/formats.js';
const want = process.argv.slice(2), on = (k) => !want.length || want.some(w => w.split('=')[0] === k);
const arg = (k, d) => { const w = want.find(x => x.startsWith(k + '=')); return w ? +w.split('=')[1] : d; };
const results = [];
const check = (name, pass, detail) => { results.push({ name, pass }); console.log(`${pass ? '✔' : '✖'} ${name}${detail ? '  — ' + detail : ''}`); };
const wav = (name, ch, sr) => fs.writeFileSync(`renders/${name}.wav`, encodeWav(ch, sr, 16));
const quantile = (arr, q) => { const a = Float32Array.from(arr).sort(); return a[Math.min(a.length - 1, Math.floor(q * a.length))]; };
const steps = (c, a, b) => { let m = 0; for (let i = Math.max(1, a); i < Math.min(c.length, b); i++) { const d = Math.abs(c[i] - c[i - 1]); if (d > m) m = d; } return m; };

const h = await open();
const page = h.page;

if (on('audit')) {
  /* 1. Every frequency written to an oscillator or a filter, in every built-in scale and three keys. */
  const r = await page.evaluate(async () => {
    let n = 0, worst = 0, bad = []; const kinds = {};
    for (const scale of Dub.SCALES) for (const key of [0, 6, 9]) {
      const S = Dub.makeState({ scale: scale.id, key, intensity: 1, progression: 'i-VI-VII', seed: 11 + key, master: { dj: key === 6 ? -0.5 : key === 9 ? 0.6 : 0 } });
      for (const p of Dub.PARTS) S.parts[p].density = 1;
      S.parts.kick.tune = key === 6 ? 'fifth' : 'root';
      const tun = Dub.tuningOf(S), seen = [];
      await Dub.renderOffline(S, { bars: 4, sampleRate: 22050, tape: key === 0, audit: (hz, kind) => seen.push([hz, kind]) });
      for (const [hz, kind] of seen) { const e = tun.error(hz); n++; kinds[kind] = (kinds[kind] || 0) + 1; if (e > worst) worst = e; if (e >= 1 && bad.length < 5) bad.push([scale.name, key, kind, hz, e]); }
    }
    return { n, worst, bad, kinds };
  });
  check('1  every oscillator and filter frequency is a scale tone (19 scales × 3 keys)', r.worst < 1 && r.n > 10000, `${r.n} frequencies, worst ${r.worst.toExponential(2)} c; ${Object.entries(r.kinds).map(([k, v]) => k + ' ' + v).join(', ')}${r.bad.length ? ' BAD ' + JSON.stringify(r.bad) : ''}`);
}

if (on('retune')) {
  /* 2. Key and scale change at a bar line while it plays: no click, and everything after the line is in the new tuning. */
  const run = (timeline) => pull(page, async ({ timeline }) => {
    const S = Dub.makeState({ intensity: 0.9, seed: 21 });
    const x = await Dub.renderOffline(S, { bars: 8, tail: 1, timeline });
    const T = [Dub.tuningOf(S), Dub.tuningOf({ ...S, key: 2 }), Dub.tuningOf({ ...S, key: 2, scale: 'huseyni' })];
    let worst = 0; for (const e of x.events) { const t = e.bar < 3 ? T[0] : e.bar < 6 ? T[1] : T[2]; for (const hz of e.hz) worst = Math.max(worst, t.error(hz)); }
    const barSec = 16 * 15 / S.tempo;
    return { channels: [x.buffer.getChannelData(0), x.buffer.getChannelData(1)], sampleRate: x.sampleRate, worst, barSec };
  }, { timeline });
  const moved = await run([{ bar: 3, set: { key: 2 } }, { bar: 6, set: { scale: 'huseyni' } }]), still = await run([]);
  wav('accept-retune', moved.channels, moved.sampleRate);
  const sr = moved.sampleRate, win = Math.floor(0.03 * sr), out = [];
  for (const [name, r] of [['changed', moved], ['unchanged', still]]) for (const bar of [3, 6]) {
    const at = Math.round(bar * r.barSec * sr);
    out.push({ name, bar, atLine: Math.max(...r.channels.map(c => steps(c, at - win, at + win))), elsewhere: Math.max(...[1, 2, 4, 5, 7].map(b => Math.max(...r.channels.map(c => steps(c, Math.round(b * r.barSec * sr) - win, Math.round(b * r.barSec * sr) + win))))) });
  }
  const worstRatio = Math.max(...out.filter(o => o.name === 'changed').map(o => o.atLine / o.elsewhere));
  check('2a after the bar line every part is in the new key and scale', moved.worst < 1, `worst ${moved.worst.toExponential(2)} c against the tuning in force`);
  check('2b no click at the retune: largest sample step at the changed bar lines is no bigger than at ordinary bar lines', worstRatio < 1.25, out.map(o => `${o.name} bar ${o.bar}: ${o.atLine.toFixed(3)} vs ${o.elsewhere.toFixed(3)}`).join('; '));
}

if (on('freeze')) {
  /* 5. Freeze and maximum feedback cannot overdrive the output. */
  for (const tape of [true, false]) {
    const r = await pull(page, async ({ tape }) => {
      const S = Dub.makeState({ intensity: 1, delay: { feedback: 1.1, level: 1, sat: 1 }, reverb: { level: 1, size: 1 }, master: { volume: 1, sat: 1, comp: 1 } });
      for (const p of Dub.PARTS) { S.parts[p].density = 1; S.parts[p].level = 1; S.parts[p].dly = 1; S.parts[p].rev = 1; }
      const x = await Dub.renderOffline(S, { bars: 8, tail: 12, tape, timeline: [{ bar: 4, set: { 'delay.freeze': true } }] });
      return { channels: [x.buffer.getChannelData(0), x.buffer.getChannelData(1)], sampleRate: x.sampleRate, seconds: x.seconds, tape: x.tape };
    }, { tape });
    const s = stats(r.channels), sr = r.sampleRate, tail = r.channels.map(c => c.subarray(Math.floor((r.seconds + 9) * sr)));
    const t = stats(tail);
    if (tape) wav('accept-freeze', r.channels, sr);
    check(`5  everything at maximum, feedback 110 %, then Freeze (${r.tape ? 'tape worklet' : 'fallback delay'}): output stays under full scale`, s.peak <= 0.931 && s.nan === 0, `peak ${s.peak.toFixed(4)} of 1.0, no NaN; 9–12 s after the last note the frozen loop still sounds at rms ${t.rms.toFixed(3)}`);
    if (tape) check('5b the frozen loop holds instead of dying or growing', t.rms > 0.02 && t.peak <= 0.931, `tail rms ${t.rms.toFixed(3)}, peak ${t.peak.toFixed(3)}`);
  }
}

if (on('loop')) {
  /* 6. The exported loop repeats without a seam. */
  for (const patch of [{}, { tempo: 96, bars: 2, style: 'onedrop', delay: { feedback: 0.85 }, reverb: { size: 0.9 } }]) {
    const r = await pull(page, async ({ patch }) => { const x = await Dub.renderLoop(Dub.makeState(patch)); return { channels: x.channels, sampleRate: x.sampleRate, seconds: x.seconds, peak: x.peak }; }, { patch });
    const c = r.channels[0], n = c.length, d = []; for (let i = 1; i < n; i++) d.push(Math.abs(c[i] - c[i - 1]));
    const seam = Math.abs(c[0] - c[n - 1]), p999 = quantile(d, 0.999), med = quantile(d, 0.5);
    const twice = r.channels.map(ch => { const o = new Float32Array(ch.length * 2); o.set(ch); o.set(ch, ch.length); return o; });
    if (!patch.tempo) { wav('loop', r.channels, r.sampleRate); wav('loop-twice', twice, r.sampleRate); }
    const exact = Math.abs(n - r.seconds * r.sampleRate) < 1;
    check(`6  WAV loop (${patch.tempo || 118} BPM, ${patch.bars || 4} bars): the step from last sample to first is an ordinary one`, seam <= p999 && exact, `seam step ${seam.toFixed(5)}, median step ${med.toFixed(5)}, 99.9th percentile ${p999.toFixed(5)}; length ${n} samples = ${r.seconds.toFixed(4)} s exactly; peak ${r.peak.toFixed(3)}`);
  }
}
if (on('embed')) {
  /* The engine on its own, the way Dish or Marble would hold it: their context, their analyser, exact events. */
  const r = await page.evaluate(async () => {
    const ctx = new AudioContext(), an = ctx.createAnalyser(), dub = new Dub.DubEngine({ state: { tempo: 124, seed: 3 }, autoConnect: false });
    await dub.init(ctx); dub.connect(an);
    const kicks = [], stabs = [], any = []; dub.on('kick', e => kicks.push(e)); dub.on('stab', e => stabs.push(e)); dub.on('note', e => any.push(e.time - ctx.currentTime));
    dub.setTempo(124); dub.setKey('F♯'); dub.setScale('dorian'); dub.setSeed(42); dub.mute('hats');
    await dub.start(); await new Promise(r => setTimeout(r, 3000));
    const buf = new Float32Array(an.fftSize); an.getFloatTimeDomainData(buf); let peak = 0; for (const x of buf) peak = Math.max(peak, Math.abs(x));
    dub.stop(); dub.unmute('hats');
    const gaps = kicks.slice(1).map((k, i) => k.time - kicks[i].time);
    const out = { kicks: kicks.length, stabs: stabs.length, gap: gaps[0], lead: Math.min(...any), peak, key: dub.S.key, fields: Object.keys(kicks[0] || {}).join(','), vel: kicks[0] && kicks[0].vel, hats: any.length };
    dub.dispose(); await ctx.close(); return out;
  });
  check('E  dist/dub-engine.js embedded: own context, connect(node), on(\'kick\'), on(\'stab\') with audio-clock time and strength', r.kicks >= 5 && r.stabs >= 1 && Math.abs(r.gap - 60 / 124) < 1e-6 && r.lead > 0 && r.peak > 0.01 && r.key === 6,
    `${r.kicks} kicks exactly ${r.gap.toFixed(4)} s apart (124 BPM), ${r.stabs} stabs, each reported ${(r.lead * 1000).toFixed(0)} ms or more before it sounds; analyser peak ${r.peak.toFixed(2)}; event fields: ${r.fields}`);
}
await h.context.close();

if (on('live') || on('midi') || on('soak')) {
  const a = await open({ url: '/dist/dub.html' });
  const p = a.page;
  await p.waitForSelector('.part');
  await p.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

  if (on('live')) {
    /* 3. Two live runs with the same seed and settings report the same events. */
    const take = (ms, mid) => p.evaluate(async ({ ms, mid }) => {
      const log = [], off = dub.on('note', e => log.push([e.part, e.kind, e.bar, e.step, +e.vel.toFixed(6), e.hz.map(x => +x.toFixed(4))]));
      const rt = [], off2 = dub.on('retune', e => rt.push({ bar: dub.bar, time: e.time }));
      dub.setKey(9); dub.setScale('aeolian');
      await dub.start(); const t0 = dub.ctx.currentTime;
      if (mid) setTimeout(() => { mid.at = { bar: dub.bar, step: dub.step }; dub.setKey(mid.key); dub.setScale(mid.scale); }, mid.ms);
      await new Promise(r => setTimeout(r, ms));
      dub.stop(); off(); off2();
      return { log, rt, mid, elapsed: dub.ctx.currentTime - t0, stats: { ...dub.stats } };
    }, { ms, mid });
    const r1 = await take(9000), r2 = await take(9000);
    const n = Math.min(r1.log.length, r2.log.length) - 4;
    check('3  two live runs, same seed and settings: identical event sequence', n > 100 && JSON.stringify(r1.log.slice(0, n)) === JSON.stringify(r2.log.slice(0, n)), `${n} events compared`);
    const r3 = await take(9000, { ms: 3300, key: 4, scale: 'saba' });
    // judge in Node with the pure tuning module
    const { makeState, tuningOf } = await import('../src/state.js');
    const oldT = tuningOf(makeState({ key: 9, scale: 'aeolian' })), newT = tuningOf(makeState({ key: 4, scale: 'saba' }));
    const rb = r3.rt.length ? r3.rt[r3.rt.length - 1].bar : -1; let okOld = true, okNew = true, after = 0;
    for (const e of r3.log) for (const hz of e[5]) { if (e[2] < rb) okOld = okOld && oldT.error(hz) < 1; else { okNew = okNew && newT.error(hz) < 1; after++; } }
    check('2c live: key and scale changed mid-bar take hold at the next bar line, for every part at once', r3.rt.length >= 1 && rb === r3.mid.at.bar + 1 && okOld && okNew && after > 20, `changed during bar ${r3.mid.at.bar + 1} step ${r3.mid.at.step + 1}; retuned at bar ${rb + 1}; ${after} pitches after it, all in E Saba`);
  }

  if (on('midi')) {
    /* 7. MIDI out against what the browser plays, with a fake MIDI port. */
    const r = await p.evaluate(async () => {
      const sent = [];
      const out = { id: 'o1', name: 'Fake synth', state: 'connected', send: (data, ts) => sent.push({ data: Array.from(data), ts: ts == null ? performance.now() : ts }) };
      const inp = { id: 'i1', name: 'Fake clock', state: 'connected', onmidimessage: null };
      navigator.requestMIDIAccess = async () => ({ outputs: new Map([['o1', out]]), inputs: new Map([['i1', inp]]), onstatechange: null });
      await dubMidi.enable();
      dub.set('tempo', 120); dub.set('scale', 'rast'); dub.set('swing', 0);
      for (const part of ['bass', 'stab', 'pad', 'kick', 'siren']) dub.set(`parts.${part}.out`, 'both');
      dub.set('parts.stab.ch', 10); dub.set('parts.stab.rotate', 6); dub.set('parts.pad.rotate', 1);
      const notes = [], off = dub.on('note', e => { if (e.out !== 'browser') notes.push({ part: e.part, time: e.time, ts: dubMidi._ts(e.time), notes: e.notes, kind: e.kind }); });
      await dub.start(); await new Promise(r => setTimeout(r, 6200)); dub.stop(); off();
      const chans = {}; for (const part of ['bass', 'stab', 'pad', 'kick', 'siren']) chans[part] = dub.S.parts[part].ch;
      // follow incoming clock at 100 BPM
      dubMidi.setClockIn(true); let t = performance.now();
      for (let i = 0; i < 60; i++) { t += 60000 / 100 / 24; inp.onmidimessage({ data: [0xF8], timeStamp: t }); }
      const followed = dub.S.tempo; dubMidi.setClockIn(false);
      return { sent, notes, chans, note: dubMidi.note, followed };
    });
    const clock = r.sent.filter(m => m.data[0] === 0xF8).map(m => m.ts), gaps = clock.slice(1).map((t, i) => t - clock[i]);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length, dev = Math.max(...gaps.map(g => Math.abs(g - 60000 / 120 / 24)));
    const first = r.sent.find(m => m.data[0] >= 0xF8), last = r.sent.filter(m => m.data[0] >= 0xF8).pop();
    check('7a MIDI clock: 24 ticks per beat at the engine tempo, Start first, Stop last', first.data[0] === 0xFA && last.data[0] === 0xFC && Math.abs(mean - 60000 / 120 / 24) < 0.01 && dev < 0.5, `${clock.length} ticks, mean interval ${mean.toFixed(3)} ms (expected ${(60000 / 120 / 24).toFixed(3)}), worst deviation ${dev.toFixed(3)} ms`);
    const ons = r.sent.filter(m => (m.data[0] & 0xF0) === 0x90); let matched = 0, total = 0, worstMs = 0, wrongCh = 0;
    for (const e of r.notes) {
      if (e.kind === 'siren' || e.kind === 'swell') continue;
      const lo = r.chans[e.part] - 1, hi = e.part === 'stab' ? lo + 5 : lo;
      const expect = e.part === 'kick' ? [36] : e.notes.map(n => n.note);
      for (const key of expect) { total++; const m = ons.find(o => o.data[1] === key && Math.abs(o.ts - e.ts) < 0.5 && (o.data[0] & 15) >= lo && (o.data[0] & 15) <= hi); if (m) { matched++; worstMs = Math.max(worstMs, Math.abs(m.ts - e.ts)); } else wrongCh++; }
    }
    const bends = r.sent.filter(m => (m.data[0] & 0xF0) === 0xE0).length;
    check('7b MIDI notes: every note the browser plays goes out with the same key, on the part\'s channel, within 0.5 ms of the audio', total > 40 && matched === total, `${matched} of ${total} note-ons matched (bass ch ${r.chans.bass}, chord ch ${r.chans.stab}–${r.chans.stab + 5} rotating, pad ch ${r.chans.pad}, kick ch ${r.chans.kick} key 36); ${bends} pitch bends for Rast`);
    check('7c a microtonal chord on one channel says so in the interface', /nearest 12-TET/.test(r.note), r.note.slice(0, 90) + '…');
    check('7d incoming MIDI clock at 100 BPM sets the tempo', Math.abs(r.followed - 100) <= 0.5, `tempo followed to ${r.followed} BPM`);
  }

  if (on('soak')) {
    /* 4 (shortened). Continuous play: nothing late, nothing skipped, memory flat. */
    const secs = arg('soak', 120);
    const r = await p.evaluate(async (secs) => {
      dub.set('intensity', 1); dub.set('auto', true); dub.set('autoBars', 8);
      const mem = () => (performance.memory ? performance.memory.usedJSHeapSize / 1e6 : 0);
      const s0 = { ...dub.stats }; await dub.start(); const t0 = dub.ctx.currentTime, w0 = performance.now();
      await new Promise(r => setTimeout(r, 15000)); const m0 = mem();
      let maxGap = 0; const iv = setInterval(() => { maxGap = Math.max(maxGap, dub.sched.gap); }, 50);
      await new Promise(r => setTimeout(r, (secs - 15) * 1000)); clearInterval(iv);
      const out = { audio: dub.ctx.currentTime - t0, wall: (performance.now() - w0) / 1000, steps: dub.stats.steps - s0.steps, late: dub.stats.late - s0.late, skipped: dub.stats.skipped - s0.skipped, m0, m1: mem(), maxGap, state: dub.ctx.state,
        under: dub.ctx.playbackStats ? dub.ctx.playbackStats.fallbackFramesEvents ?? dub.ctx.playbackStats.underrunEvents : null };
      dub.stop(); dub.set('auto', false);
      return out;
    }, secs);
    check(`4  ${secs} s of continuous play at full intensity with auto scenes (headless Chromium, not 30 min, not an iPhone)`, r.late === 0 && r.skipped === 0 && Math.abs(r.audio - r.wall) < 0.5 && r.state === 'running',
      `${r.steps} steps scheduled, ${r.late} late, ${r.skipped} skipped; audio clock ${r.audio.toFixed(1)} s vs wall ${r.wall.toFixed(1)} s; longest timer gap ${(r.maxGap * 1000).toFixed(0)} ms; JS heap ${r.m0.toFixed(1)} → ${r.m1.toFixed(1)} MB${r.under != null ? '; underruns ' + r.under : ''}`);
  }
  check('8  no errors in the console', a.errors.length === 0, a.errors.join(' | ').slice(0, 300));
  await a.close();
}
await h.close();
const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length} of ${results.length} browser checks passed`);
process.exit(failed.length ? 1 : 0);
