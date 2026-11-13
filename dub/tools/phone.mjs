/* A hostile phone, simulated: autoplay locked until a tap, resume() that never settles, a worklet module that
   never loads, a Worker that never ticks, iPhone user agent and touch. The page must still play after one tap. */
import { open } from './harness.mjs';
const hostile = () => {
  const AC = window.AudioContext;
  AC.prototype.resume = new Proxy(AC.prototype.resume, { apply(t, self, a) { Reflect.apply(t, self, a); return new Promise(() => {}); } });
  Object.defineProperty(AudioWorklet.prototype, 'addModule', { value: () => new Promise(() => {}) });
  window.Worker = class { constructor() {} postMessage() {} terminate() {} };
};
let fail = 0;
for (const [name, init] of [['plain phone', null], ['hostile phone', hostile]]) {
  const h = await open({ url: '/dist/dub.html', viewport: { width: 390, height: 844 }, args: ['--autoplay-policy=user-gesture-required'], init,
    context: { hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1' } });
  const p = h.page;
  await p.waitForSelector('.part');
  const before = await p.evaluate(() => ({ ctx: !!dub.ctx }));
  await p.tap('.head .act');
  await p.waitForTimeout(4200);
  const r = await p.evaluate(async () => {
    const an = dub.ctx.createAnalyser(); dub.output.connect(an); const b = new Float32Array(2048); let peak = 0;
    for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 30)); an.getFloatTimeDomainData(b); for (const x of b) peak = Math.max(peak, Math.abs(x)); }
    return { playing: dub.playing, state: dub.ctx.state, tape: dub.tape, steps: dub.stats.steps, time: +dub.ctx.currentTime.toFixed(2), peak: +peak.toFixed(3), button: document.querySelector('.head .act').textContent, status: document.querySelector('.head p').textContent, silentAudio: document.querySelectorAll('audio').length };
  });
  const ok = r.playing && r.state === 'running' && r.steps > 25 && r.peak > 0.01 && /Stop/.test(r.button) && h.errors.length === 0 && !before.ctx;
  if (!ok) fail++;
  console.log(`${ok ? '✔' : '✖'} ${name}: one tap on Play → ${JSON.stringify(r)} errors ${JSON.stringify(h.errors)}`);
  await h.close();
}
process.exit(fail ? 1 : 0);
