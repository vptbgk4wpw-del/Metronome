/* Per-part levels of a state, pre-master dynamics. node tools/levels.mjs '<patch>' */
import { open, pull, stats } from './harness.mjs';
const patch = JSON.parse(process.argv[2] || '{}');
const h = await open();
for (const solo of [null, 'kick', 'bass', 'stab', 'pad', 'hats', 'rim', 'perc', 'air', 'noise', 'siren']) {
  for (const dynamics of solo ? [false] : [false, true]) {
    const r = await pull(h.page, async ({ patch, solo, dynamics }) => {
      const S = Dub.makeState(patch); S.master.volume = 1;
      const x = await Dub.renderOffline(S, { bars: 4, tail: 2, solo, dynamics });
      return { channels: [x.buffer.getChannelData(0), x.buffer.getChannelData(1)], sampleRate: x.sampleRate };
    }, { patch, solo, dynamics });
    const s = stats(r.channels);
    console.log((solo || 'MIX').padEnd(6), dynamics ? 'master' : 'raw   ', 'peak', s.peak.toFixed(3), 'rms', s.rms.toFixed(4), 'crest dB', (20 * Math.log10(s.peak / (s.rms || 1e-9))).toFixed(1));
  }
}
console.log('errors', h.errors);
await h.close();
