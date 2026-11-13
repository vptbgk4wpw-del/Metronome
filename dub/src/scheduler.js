/* Look-ahead clock. A coarse timer wakes up every 25 ms and hands out every sixteenth that starts within
   the look-ahead window, stamped with a time on the audio clock; the audio thread does the exact timing.
   After a sleep (tab in the background, laptop lid) the overdue steps are dropped, not played in a burst:
   the step counter jumps forward so the bar grid stays where it was. */

export class Scheduler {
  /* now(): seconds on the audio clock. stepDur(): seconds per sixteenth right now.
     ahead(): look-ahead in seconds (may grow when the page is hidden and timers are throttled). */
  constructor({ now, stepDur, onStep, onSkip = null, ahead = () => 0.14, interval = 25, timer = null }) {
    Object.assign(this, { now, stepDur, onStep, onSkip, ahead, interval });
    this.timer = timer || makeTimer;
    this.running = false; this.step = 0; this.next = 0; this._stop = null;
  }
  start(lead = 0.08) {
    if (this.running) return;
    this.running = true; this.step = 0; this.next = this.now() + lead; this.last = null; this.gap = 0;
    this._stop = this.timer(() => this.tick(), this.interval);
    this.tick();
  }
  stop() {
    if (!this.running) return;
    this.running = false;
    if (this._stop) this._stop(); this._stop = null;
  }
  tick() {
    if (!this.running) return;
    const now = this.now(), sd = this.stepDur();
    this.gap = this.last != null ? now - this.last : 0; this.last = now;
    if (this.next < now) {
      // behind the clock: skip what can no longer be played on time, keep the grid
      const missed = Math.ceil((now + 0.02 - this.next) / sd);
      this.step += missed; this.next += missed * sd;
      if (this.onSkip) this.onSkip(missed);
    }
    const horizon = now + Math.max(0.1, this.ahead());
    while (this.next < horizon) {
      const d = this.stepDur();
      this.onStep(this.step, this.next, d);
      this.next += d; this.step++;
    }
  }
}

/* Timer that keeps ticking in a background tab where it can: a Worker is not throttled like the page.
   Falls back to setInterval where Workers from a Blob are not allowed. Returns a stop function. */
export function makeTimer(fn, ms) {
  let worker = null, id = 0, url = null, heard = false, guard = 0;
  const fallback = () => { if (worker) { try { worker.terminate(); } catch (e) {} worker = null; } if (!id) id = setInterval(fn, ms); };
  try {
    url = URL.createObjectURL(new Blob([`let i=0;onmessage=e=>{clearInterval(i);if(e.data>0)i=setInterval(()=>postMessage(0),e.data)}`], { type: 'text/javascript' }));
    worker = new Worker(url);
    worker.onmessage = () => { heard = true; fn(); };
    worker.onerror = fallback;
    worker.postMessage(ms);
    guard = setTimeout(() => { if (!heard) fallback(); }, 400);      // a Worker that was blocked without an error never ticks
  } catch (e) { fallback(); }
  return () => {
    clearTimeout(guard);
    if (worker) { try { worker.postMessage(0); worker.terminate(); } catch (e) {} }
    if (id) clearInterval(id);
    if (url) { try { URL.revokeObjectURL(url); } catch (e) {} }
  };
}
