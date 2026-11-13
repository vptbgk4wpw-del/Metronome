/* Renders the stage demos into renders/. node tools/demos.mjs */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { open, pull, stats } from './harness.mjs';
import { encodeWav } from '../src/formats.js';
import { midiFile } from '../src/midi.js';
import { makeState, tuningOf } from '../src/state.js';
const h = await open();
const save = (name, r) => { fs.writeFileSync(`renders/${name}.wav`, encodeWav(r.channels, r.sampleRate, 16)); const s = stats(r.channels);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', `renders/${name}.wav`, '-b:a', '192k', `renders/${name}.mp3`]);
  console.log(name.padEnd(22), `${(r.channels[0].length / r.sampleRate).toFixed(1)} s  peak ${s.peak.toFixed(2)}  rms ${s.rms.toFixed(3)}`); };
const render = (patch, opts) => pull(h.page, async ({ patch, opts }) => { const x = await Dub.renderOffline(Dub.makeState(patch), opts); return { channels: [x.buffer.getChannelData(0), x.buffer.getChannelData(1)], sampleRate: x.sampleRate }; }, { patch, opts });

/* Stage 1: the tuning engine alone — every built-in scale, one octave up from A, plain sine. */
save('1-scales', await pull(h.page, async () => {
  const sr = 44100, step = 0.17, gap = 0.35, n = Dub.SCALES.reduce((a, s) => a + (s.cents.length + 1) * step + gap, 0);
  const ctx = new OfflineAudioContext(2, Math.ceil(n * sr), sr); let t = 0.05;
  for (const scale of Dub.SCALES) { const tun = new Dub.Tuning({ key: 9, scale });
    for (let d = 0; d <= tun.n; d++) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.value = tun.hz(d, 3);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + step * 1.6); o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + step * 1.7); t += step; }
    t += gap; }
  const b = await ctx.startRendering(); return { channels: [b.getChannelData(0), b.getChannelData(1)], sampleRate: sr };
}));
/* Stage 2: synthesis and generator with the desk switched off — every part dry. */
const dry = { intensity: 0.85, delay: { level: 0 }, reverb: { level: 0 }, master: { sat: 0, comp: 0 } };
save('2-parts-dry', await render(dry, { bars: 8, tail: 1 }));
/* Stage 3: the desk — the same groove with delay and reverb, a throw, a freeze and a DJ-filter move. */
save('3-dub-desk', await render({ intensity: 0.85 }, { bars: 12, tail: 6, timeline: [
  { bar: 2, step: 8, throw: { rim: true, hats: true } }, { bar: 3, throw: { rim: false, hats: false } },
  { bar: 5, step: 10, set: { 'delay.freeze': true } }, { bar: 6, step: 8, set: { 'parts.kick.mute': true, 'parts.bass.mute': true } }, { bar: 8, set: { 'delay.freeze': false, 'parts.kick.mute': false, 'parts.bass.mute': false } },
  { bar: 9, set: { 'master.dj': 0.45 } }, { bar: 9, step: 8, set: { 'master.dj': 0.75 } }, { bar: 10, set: { 'master.dj': 0.4 } }, { bar: 10, step: 8, set: { 'master.dj': 0 } },
  { bar: 11, set: { 'delay.feedback': 0.95 } } ] }));
/* Stage 4: scenes on Auto — Intro, Groove, Break, Drop, four bars each. */
save('4-scenes', await render({ auto: true, autoBars: 4, intensity: 0.8 }, { bars: 16, tail: 4 }));
/* Microtonal: Hüseyni on D with the One Drop preset's feel; then Tizita minor. */
save('5-huseyni-one-drop', await pull(h.page, async () => { const S = Dub.makeState(Dub.PRESETS['One Drop']); S.key = 2; S.scale = 'huseyni'; S.intensity = 0.8; const x = await Dub.renderOffline(S, { bars: 8, tail: 5 }); return { channels: [x.buffer.getChannelData(0), x.buffer.getChannelData(1)], sampleRate: x.sampleRate }; }));
save('6-kosmische-tizita', await pull(h.page, async () => { const S = Dub.makeState(Dub.PRESETS['Kosmische Dub']); S.key = 4; S.scale = 'tizitamin'; S.intensity = 0.85; S.seed = 2718; const x = await Dub.renderOffline(S, { bars: 8, tail: 6 }); return { channels: [x.buffer.getChannelData(0), x.buffer.getChannelData(1)], sampleRate: x.sampleRate }; }));
/* Stage 5: the exports — MIDI file of the default phrase (the WAV loop comes from tools/accept.mjs loop). */
const S = makeState(); fs.writeFileSync('renders/dub-A-aeolian-118bpm-4136.mid', midiFile(S, tuningOf(S)));
console.log('errors', JSON.stringify(h.errors));
await h.close();
