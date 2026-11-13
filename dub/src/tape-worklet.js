/* Audio-thread processors. Loaded as text and registered from a Blob, so the single-file build stays one file.

   dub-tape: a tape delay. The read head moves smoothly when the time changes (pitch glides like tape
   changing speed), wow and flutter wobble it, and the loop holds a high-pass, a low-pass, saturation and
   a limiter. Freeze closes the input and holds the loop at unity gain; the limiter keeps it from running away.

   dub-rec: hands the signal to the main thread in blocks, for live recording to WAV. */

class DubTape extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    const k = (name, defaultValue, minValue, maxValue) => ({ name, defaultValue, minValue, maxValue, automationRate: 'k-rate' });
    return [k('time', 0.38, 0.01, 3.9), k('feedback', 0.6, 0, 1.1), k('hp', 300, 10, 20000), k('lp', 1800, 10, 20000),
      k('drive', 0.3, 0, 1), k('wow', 0.2, 0, 1), k('flutter', 0.1, 0, 1), k('ping', 1, 0, 1), k('freeze', 0, 0, 1)];
  }
  constructor() {
    super();
    let n = 1; while (n < sampleRate * 4 + 8) n <<= 1;
    this.N = n; this.mask = n - 1;
    this.bL = new Float32Array(n); this.bR = new Float32Array(n);
    this.w = 0; this.cur = -1; this.p1 = 0; this.p2 = 0; this.frz = 0; this.pg = 1;
    this.hpF = 0; this.lpF = 0; this.hc = [1, 0, 0, 0, 0]; this.lc = [1, 0, 0, 0, 0];
    this.z = new Float64Array(8);     // biquad states: hpL, hpR, lpL, lpR (two each)
  }
  coef(type, f) {
    const w0 = 2 * Math.PI * Math.min(f, sampleRate * 0.45) / sampleRate, c = Math.cos(w0), a = Math.sin(w0) / (2 * 0.9), a0 = 1 + a;
    return type ? [(1 + c) / 2 / a0, -(1 + c) / a0, (1 + c) / 2 / a0, -2 * c / a0, (1 - a) / a0]
                : [(1 - c) / 2 / a0, (1 - c) / a0, (1 - c) / 2 / a0, -2 * c / a0, (1 - a) / a0];
  }
  process(inputs, outputs, P) {
    const inp = inputs[0], out = outputs[0], oL = out[0], oR = out[1] || out[0];
    const iL = inp && inp[0], iR = inp && (inp[1] || inp[0]);
    const time = P.time[0], fbP = P.feedback[0], drive = P.drive[0], ping = P.ping[0] > 0.5 ? 1 : 0, freeze = P.freeze[0] > 0.5 ? 1 : 0;
    if (P.hp[0] !== this.hpF) { this.hpF = P.hp[0]; this.hc = this.coef(1, this.hpF); }
    if (P.lp[0] !== this.lpF) { this.lpF = P.lp[0]; this.lc = this.coef(0, this.lpF); }
    if (this.cur < 0) this.cur = time;
    const sr = sampleRate, N = this.N, mask = this.mask, bL = this.bL, bR = this.bR, z = this.z, hc = this.hc, lc = this.lc;
    const slew = 1 - Math.exp(-1 / (sr * 0.09)), fs = 1 - Math.exp(-1 / (sr * 0.03));
    const wowA = P.wow[0] * 0.0035, fluA = P.flutter[0] * 0.00045, d1 = 2 * Math.PI * 0.43 / sr, d2 = 2 * Math.PI * 6.7 / sr;
    const g = 1 + 3 * drive, T = 0.6;
    let w = this.w, cur = this.cur, p1 = this.p1, p2 = this.p2, frz = this.frz, pg = this.pg;
    for (let i = 0; i < oL.length; i++) {
      cur += (time - cur) * slew; frz += (freeze - frz) * fs; pg += (ping - pg) * fs;
      p1 += d1; if (p1 > 6.283185307) p1 -= 6.283185307;
      p2 += d2; if (p2 > 6.283185307) p2 -= 6.283185307;
      let d = (cur + wowA * Math.sin(p1) + fluA * Math.sin(p2)) * sr;
      if (d < 2) d = 2; else if (d > N - 4) d = N - 4;
      const pos = w - d, i0 = Math.floor(pos), f = pos - i0;
      const a = (i0 - 1) & mask, b = i0 & mask, c = (i0 + 1) & mask, e = (i0 + 2) & mask;
      // 4-point Hermite read
      let yl = bL[b] + 0.5 * f * (bL[c] - bL[a] + f * (2 * bL[a] - 5 * bL[b] + 4 * bL[c] - bL[e] + f * (3 * (bL[b] - bL[c]) + bL[e] - bL[a])));
      let yr = bR[b] + 0.5 * f * (bR[c] - bR[a] + f * (2 * bR[a] - 5 * bR[b] + 4 * bR[c] - bR[e] + f * (3 * (bR[b] - bR[c]) + bR[e] - bR[a])));
      // loop filters (transposed direct form II)
      let t = lc[0] * yl + z[4]; z[4] = lc[1] * yl - lc[3] * t + z[5]; z[5] = lc[2] * yl - lc[4] * t; let fl = t;
      t = hc[0] * fl + z[0]; z[0] = hc[1] * fl - hc[3] * t + z[1]; z[1] = hc[2] * fl - hc[4] * t; fl = t;
      t = lc[0] * yr + z[6]; z[6] = lc[1] * yr - lc[3] * t + z[7]; z[7] = lc[2] * yr - lc[4] * t; let fr = t;
      t = hc[0] * fr + z[2]; z[2] = hc[1] * fr - hc[3] * t + z[3]; z[3] = hc[2] * fr - hc[4] * t; fr = t;
      // frozen: the loop bypasses its filters and saturation, so it neither darkens nor decays
      let sl = Math.tanh(g * fl) / g, sr2 = Math.tanh(g * fr) / g;
      sl += (yl - sl) * frz; sr2 += (yr - sr2) * frz;
      // limiter in the loop: unity below the threshold, bounded by 1 above it
      let m = sl < 0 ? -sl : sl; if (m > T) sl = (sl < 0 ? -1 : 1) * (T + (1 - T) * Math.tanh((m - T) / (1 - T)));
      m = sr2 < 0 ? -sr2 : sr2; if (m > T) sr2 = (sr2 < 0 ? -1 : 1) * (T + (1 - T) * Math.tanh((m - T) / (1 - T)));
      const fb = fbP + (1 - fbP) * frz, inG = 1 - frz;
      const xl = iL ? iL[i] : 0, xr = iR ? iR[i] : 0, mono = (xl + xr) * 0.7;
      // ping-pong: the input enters on the left and the two lines feed each other
      bL[w] = (xl + (mono - xl) * pg) * inG + fb * (sl + (sr2 - sl) * pg);
      bR[w] = (xr - xr * pg) * inG + fb * (sr2 + (sl - sr2) * pg);
      w = (w + 1) & mask;
      oL[i] = fl + (yl - fl) * frz; oR[i] = fr + (yr - fr) * frz;
    }
    for (let k = 0; k < 8; k++) if (!(Math.abs(z[k]) > 1e-30)) z[k] = 0;      // denormals and NaN guard
    this.w = w; this.cur = cur; this.p1 = p1; this.p2 = p2; this.frz = frz; this.pg = pg;
    return true;
  }
}
registerProcessor('dub-tape', DubTape);

class DubRec extends AudioWorkletProcessor {
  constructor() {
    super(); this.on = false; this.n = 0; this.L = new Float32Array(8192); this.R = new Float32Array(8192);
    this.port.onmessage = (e) => { if (e.data === 'start') { this.on = true; this.n = 0; } else if (e.data === 'stop') { this.flush(); this.on = false; this.port.postMessage('done'); } };
  }
  flush() { if (this.n) { this.port.postMessage({ l: this.L.slice(0, this.n), r: this.R.slice(0, this.n) }); this.n = 0; } }
  process(inputs) {
    const i = inputs[0];
    if (this.on && i && i[0]) {
      const l = i[0], r = i[1] || i[0];
      for (let k = 0; k < l.length; k++) { this.L[this.n] = l[k]; this.R[this.n] = r[k]; if (++this.n === 8192) this.flush(); }
    }
    return true;
  }
}
registerProcessor('dub-rec', DubRec);
