/* node tools/spectrum.mjs file.wav [t0 t1] → strongest spectral peaks (16-bit WAV) */
import fs from 'node:fs';
const [file, t0 = 0, t1 = 4] = process.argv.slice(2);
const b = fs.readFileSync(file), sr = b.readUInt32LE(24), nc = b.readUInt16LE(22);
const n = Math.floor((b.length - 44) / 2 / nc), x = new Float64Array(n);
for (let i = 0; i < n; i++) x[i] = b.readInt16LE(44 + i * 2 * nc) / 32768;
const a = Math.floor(t0 * sr), N = 1 << Math.floor(Math.log2(Math.min(n - a, (t1 - t0) * sr)));
const re = new Float64Array(N), im = new Float64Array(N);
for (let i = 0; i < N; i++) re[i] = x[a + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
for (let i = 0, j = 0; i < N; i++) { if (i < j) { [re[i], re[j]] = [re[j], re[i]]; } let m = N >> 1; while (m >= 1 && j & m) { j ^= m; m >>= 1; } j |= m; }
for (let s = 2; s <= N; s <<= 1) { const w = -2 * Math.PI / s; for (let i = 0; i < N; i += s) for (let k = 0; k < s / 2; k++) { const c = Math.cos(w * k), d = Math.sin(w * k), p = i + k, q = p + s / 2; const tr = re[q] * c - im[q] * d, ti = re[q] * d + im[q] * c; re[q] = re[p] - tr; im[q] = im[p] - ti; re[p] += tr; im[p] += ti; } }
const mag = []; for (let i = 1; i < N / 2; i++) mag.push([i * sr / N, Math.hypot(re[i], im[i]) / N * 4]);
const peaks = []; for (let i = 1; i < mag.length - 1; i++) if (mag[i][1] > mag[i - 1][1] && mag[i][1] >= mag[i + 1][1]) peaks.push(mag[i]);
peaks.sort((p, q) => q[1] - p[1]);
console.log(peaks.slice(0, 14).map(p => `${p[0].toFixed(1)}Hz ${(20 * Math.log10(p[1])).toFixed(1)}dB`).join('  '));
