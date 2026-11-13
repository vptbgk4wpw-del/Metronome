/* Getting sound out: seamless WAV loop, stems, live recording. */
import { PARTS, clone } from './state.js';
import { renderOffline } from './render.js';
import { encodeWav, foldLoop, peakOf } from './formats.js';
export { encodeWav, foldLoop, peakOf, zip, crc32 } from './formats.js';

/* The current phrase as a seamless loop. Freeze is left out (it never ends). */
export async function renderLoop(state, { phrase = 0, sampleRate = 44100, solo = null, dynamics = true, tailSeconds = 8 } = {}) {
  const S = clone(state); S.delay.freeze = false; S.auto = false;
  const loopSec = S.bars * 16 * 15 / S.tempo;
  const tail = Math.ceil(tailSeconds / loopSec) * loopSec;                  // whole passes, so the fold lines up
  const r = await renderOffline(S, { bars: S.bars, startBar: phrase * S.bars, tail, sampleRate, solo, dynamics });
  const loopLen = Math.round(loopSec * sampleRate);
  const raw = [r.buffer.getChannelData(0), r.buffer.getChannelData(1)];
  const fade = Math.min(raw[0].length, Math.floor(0.05 * sampleRate));      // whatever still rings after the tail leaves without a step
  for (const c of raw) for (let i = 0; i < fade; i++) c[c.length - 1 - i] *= i / fade;
  const channels = foldLoop(raw, loopLen), peak = peakOf(channels);
  if (peak > 0.97) { const k = 0.97 / peak; for (const c of channels) for (let i = 0; i < c.length; i++) c[i] *= k; }
  return { channels, sampleRate, seconds: loopSec, peak, events: r.events };
}

/* One loop per part, each with its own share of delay and reverb, master dynamics bypassed. All stems share
   one gain so they still sum to the mix. */
export async function renderStems(state, opt = {}) {
  const out = [];
  for (const part of PARTS) {
    if (state.parts[part].mute) continue;
    const r = await renderLoop(state, { ...opt, solo: part, dynamics: false });
    if (r.peak > 1e-5) out.push({ part, ...r });
  }
  return out;
}

/* ── live recording: exact PCM through the worklet, MediaRecorder where there is none ── */
export function startRecording(ctx, source, tape) {
  if (tape) {
    const node = new AudioWorkletNode(ctx, 'dub-rec', { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 2, channelCountMode: 'explicit' });
    const L = [], R = []; let done;
    const finished = new Promise(res => { done = res; });
    node.port.onmessage = (e) => { if (e.data === 'done') done(); else { L.push(e.data.l); R.push(e.data.r); } };
    source.connect(node); node.port.postMessage('start');
    return { kind: 'wav', async stop() {
      node.port.postMessage('stop'); await finished; try { source.disconnect(node); } catch (e) {}
      const join = (a) => { const out = new Float32Array(a.reduce((n, x) => n + x.length, 0)); let o = 0; for (const x of a) { out.set(x, o); o += x.length; } return out; };
      return { name: 'dub-take.wav', type: 'audio/wav', data: encodeWav([join(L), join(R)], ctx.sampleRate, 24) };
    } };
  }
  const dest = ctx.createMediaStreamDestination(), rec = new MediaRecorder(dest.stream), chunks = [];
  source.connect(dest); rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); }; rec.start(250);
  return { kind: 'media', stop: () => new Promise(res => {
    rec.onstop = async () => { try { source.disconnect(dest); } catch (e) {} const type = rec.mimeType || 'audio/webm', blob = new Blob(chunks, { type });
      res({ name: 'dub-take.' + (/mp4/.test(type) ? 'm4a' : /ogg/.test(type) ? 'ogg' : 'webm'), type, data: new Uint8Array(await blob.arrayBuffer()) }); };
    rec.stop();
  }) };
}
