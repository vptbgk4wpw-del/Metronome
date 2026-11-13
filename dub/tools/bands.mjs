import fs from 'node:fs';
for (const file of process.argv.slice(2)) {
  const b = fs.readFileSync(file), sr = b.readUInt32LE(24), nc = b.readUInt16LE(22), n = Math.floor((b.length - 44) / 2 / nc);
  const x = new Float64Array(n); for (let i = 0; i < n; i++) x[i] = b.readInt16LE(44 + i * 2 * nc) / 32768;
  // cascade of one-pole splits is crude but enough to see the balance
  const band = (lo, hi) => { let e = 0, y1 = 0, y2 = 0, h1 = 0, px = 0; const a = Math.exp(-2 * Math.PI * hi / sr), c = Math.exp(-2 * Math.PI * lo / sr);
    for (let i = 0; i < n; i++) { y1 = (1 - a) * x[i] + a * y1; y2 = (1 - a) * y1 + a * y2; h1 = c * (h1 + y2 - px); px = y2; e += h1 * h1; } return 10 * Math.log10(e / n + 1e-12); };
  console.log(file.split('/').pop().padEnd(28), 'sub<90', band(20, 90).toFixed(1), ' low 90–400', band(90, 400).toFixed(1), ' mid 400–3k', band(400, 3000).toFixed(1), ' high 3k–16k', band(3000, 16000).toFixed(1), 'dB');
}
