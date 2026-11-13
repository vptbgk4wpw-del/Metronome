/* node tools/render.mjs <name> '<json state patch>' '<json options>'  → renders/<name>.wav + stats */
import fs from 'node:fs';
import { open, pull, stats } from './harness.mjs';
const [name = 'out', patch = '{}', opts = '{}'] = process.argv.slice(2);
const h = await open();
const r = await pull(h.page, async ({ patch, opts }) => {
  const S = Dub.makeState(patch);
  const t0 = performance.now();
  const x = await Dub.renderOffline(S, opts);
  return { channels: [x.buffer.getChannelData(0), x.buffer.getChannelData(1)], sampleRate: x.sampleRate, tape: x.tape, events: x.events.length, ms: performance.now() - t0, seconds: x.seconds };
}, { patch: JSON.parse(patch), opts: JSON.parse(opts) });
const { encodeWav } = await import('../src/formats.js');
fs.writeFileSync(`renders/${name}.wav`, encodeWav(r.channels, r.sampleRate, 16));
const s = stats(r.channels);
console.log(name, JSON.stringify({ tape: r.tape, events: r.events, renderMs: Math.round(r.ms), seconds: +(r.channels[0].length / r.sampleRate).toFixed(2), peak: +s.peak.toFixed(3), rms: +s.rms.toFixed(4), nan: s.nan, errors: h.errors }));
await h.close();
