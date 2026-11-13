/* File formats with no audio dependencies: WAV, loop folding, ZIP. Usable from Node as well as the browser. */

/* PCM WAV, 16 or 24 bit. channels: Float32Arrays of equal length. */
export function encodeWav(channels, sampleRate, bits = 24) {
  const n = channels[0].length, nc = channels.length, bps = bits / 8, size = n * nc * bps;
  const buf = new ArrayBuffer(44 + size), v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + size, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, nc, true); v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * nc * bps, true); v.setUint16(32, nc * bps, true); v.setUint16(34, bits, true);
  str(36, 'data'); v.setUint32(40, size, true);
  let o = 44; const max = bits === 16 ? 32767 : 8388607;
  for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) {
    const x = Math.max(-1, Math.min(1, channels[c][i])), s = Math.round(x * max);
    if (bits === 16) { v.setInt16(o, s, true); o += 2; } else { v.setUint8(o, s & 255); v.setUint8(o + 1, (s >> 8) & 255); v.setUint8(o + 2, (s >> 16) & 255); o += 3; }
  }
  return new Uint8Array(buf);
}

/* Fold everything after the loop point back onto the start: the tail of the effects becomes the head of
   the loop, so the last sample runs into the first as if the loop had always been playing. */
export function foldLoop(channels, loopLen) {
  return channels.map((src) => {
    const out = new Float32Array(loopLen);
    for (let i = 0; i < src.length; i++) out[i % loopLen] += src[i];
    return out;
  });
}
export const peakOf = (channels) => { let p = 0; for (const c of channels) for (let i = 0; i < c.length; i++) { const a = Math.abs(c[i]); if (a > p) p = a; } return p; };

/* ── ZIP (stored, no compression) for the stems ── */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
export function zip(files) {
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint32(10, 0x00210000, true);
    h.setUint32(14, crc, true); h.setUint32(18, f.data.length, true); h.setUint32(22, f.data.length, true); h.setUint16(26, name.length, true);
    parts.push(new Uint8Array(h.buffer), name, f.data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint32(12, 0x00210000, true);
    c.setUint32(16, crc, true); c.setUint32(20, f.data.length, true); c.setUint32(24, f.data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), name);
    off += 30 + name.length + f.data.length;
  }
  const csize = central.reduce((a, b) => a + b.length, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
  const all = [...parts, ...central, new Uint8Array(e.buffer)], out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
  let o = 0; for (const p of all) { out.set(p, o); o += p.length; }
  return out;
}
