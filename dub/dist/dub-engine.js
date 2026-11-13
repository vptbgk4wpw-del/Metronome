class Scheduler {
  /* now(): seconds on the audio clock. stepDur(): seconds per sixteenth right now.
     ahead(): look-ahead in seconds (may grow when the page is hidden and timers are throttled). */
  constructor({ now, stepDur, onStep, onSkip = null, ahead = () => 0.14, interval = 25, timer = null }) {
    Object.assign(this, { now, stepDur, onStep, onSkip, ahead, interval });
    this.timer = timer || makeTimer;
    this.running = false;
    this.step = 0;
    this.next = 0;
    this._stop = null;
  }
  start(lead = 0.08) {
    if (this.running) return;
    this.running = true;
    this.step = 0;
    this.next = this.now() + lead;
    this.last = null;
    this.gap = 0;
    this._stop = this.timer(() => this.tick(), this.interval);
    this.tick();
  }
  stop() {
    if (!this.running) return;
    this.running = false;
    if (this._stop) this._stop();
    this._stop = null;
  }
  tick() {
    if (!this.running) return;
    const now = this.now(), sd = this.stepDur();
    this.gap = this.last != null ? now - this.last : 0;
    this.last = now;
    if (this.next < now) {
      const missed = Math.ceil((now + 0.02 - this.next) / sd);
      this.step += missed;
      this.next += missed * sd;
      if (this.onSkip) this.onSkip(missed);
    }
    const horizon = now + Math.max(0.1, this.ahead());
    while (this.next < horizon) {
      const d = this.stepDur();
      this.onStep(this.step, this.next, d);
      this.next += d;
      this.step++;
    }
  }
}
function makeTimer(fn, ms) {
  let worker = null, id = 0, url = null;
  try {
    url = URL.createObjectURL(new Blob([`let i=0;onmessage=e=>{clearInterval(i);if(e.data>0)i=setInterval(()=>postMessage(0),e.data)}`], { type: "text/javascript" }));
    worker = new Worker(url);
    worker.onmessage = fn;
    worker.onerror = () => {
      try {
        worker.terminate();
      } catch (e) {
      }
      worker = null;
      if (!id) id = setInterval(fn, ms);
    };
    worker.postMessage(ms);
  } catch (e) {
    worker = null;
    id = setInterval(fn, ms);
  }
  return () => {
    if (worker) {
      try {
        worker.postMessage(0);
        worker.terminate();
      } catch (e) {
      }
    }
    if (id) clearInterval(id);
    if (url) {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {
      }
    }
  };
}
const COMMA = 1200 / 53;
const tet = (...semis) => semis.map((s) => s * 100);
const aeu = (...commas) => {
  const out = [0];
  let c = 0;
  for (let i = 0; i < commas.length - 1; i++) {
    c += commas[i];
    out.push(c * COMMA);
  }
  return out;
};
const SCALES = [
  { id: "aeolian", name: "Aeolian", group: "Western", cents: tet(0, 2, 3, 5, 7, 8, 10) },
  { id: "dorian", name: "Dorian", group: "Western", cents: tet(0, 2, 3, 5, 7, 9, 10) },
  { id: "phrygian", name: "Phrygian", group: "Western", cents: tet(0, 1, 3, 5, 7, 8, 10) },
  { id: "harmonic", name: "Harmonic minor", group: "Western", cents: tet(0, 2, 3, 5, 7, 8, 11) },
  { id: "minpent", name: "Minor pentatonic", group: "Western", cents: tet(0, 3, 5, 7, 10) },
  { id: "mixolydian", name: "Mixolydian", group: "Western", cents: tet(0, 2, 4, 5, 7, 9, 10) },
  { id: "major", name: "Major", group: "Western", cents: tet(0, 2, 4, 5, 7, 9, 11) },
  { id: "rast", name: "Rast", group: "Makam", cents: aeu(9, 8, 5, 9, 9, 8, 5), commas: [9, 8, 5, 9, 9, 8, 5] },
  { id: "ussak", name: "Uşşak", group: "Makam", cents: aeu(8, 5, 9, 9, 4, 9, 9), commas: [8, 5, 9, 9, 4, 9, 9] },
  { id: "huseyni", name: "Hüseyni", group: "Makam", cents: aeu(8, 5, 9, 9, 8, 5, 9), commas: [8, 5, 9, 9, 8, 5, 9] },
  { id: "hicaz", name: "Hicaz", group: "Makam", cents: aeu(5, 12, 5, 9, 4, 9, 9), commas: [5, 12, 5, 9, 4, 9, 9] },
  { id: "kurdi", name: "Kürdi", group: "Makam", cents: aeu(4, 9, 9, 9, 4, 9, 9), commas: [4, 9, 9, 9, 4, 9, 9] },
  { id: "saba", name: "Saba", group: "Makam", cents: aeu(8, 5, 5, 13, 4, 9, 9), commas: [8, 5, 5, 13, 4, 9, 9] },
  { id: "tizitamaj", name: "Tizita major", group: "Qenet", cents: [0, 200, 400, 700, 900] },
  { id: "tizitamin", name: "Tizita minor", group: "Qenet", cents: [0, 200, 300, 700, 800] },
  { id: "batimaj", name: "Bati major", group: "Qenet", cents: [0, 400, 500, 700, 1100] },
  { id: "batimin", name: "Bati minor", group: "Qenet", cents: [0, 300, 500, 700, 1e3] },
  { id: "ambassel", name: "Ambassel", group: "Qenet", cents: [0, 100, 500, 700, 800] },
  { id: "anchihoye", name: "Anchihoye", group: "Qenet", cents: [0, 100, 500, 600, 900] }
];
const KEYS = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
const A4_MIN = 430, A4_MAX = 450, OFFSET_MAX = 50;
const mod = (a, n) => (a % n + n) % n;
const clamp$2 = (v, a, b) => Math.min(b, Math.max(a, v));
const log2 = Math.log2;
function parseScale(text) {
  const nums = String(text).split(/[\s,;]+/).filter(Boolean).map(Number);
  if (nums.length < 2 || nums.length > 24 || nums.some((n) => !isFinite(n))) return null;
  if (nums[0] !== 0) nums.unshift(0);
  if (nums[nums.length - 1] === 1200) nums.pop();
  for (let i = 1; i < nums.length; i++) if (!(nums[i] > nums[i - 1]) || nums[i] >= 1200) return null;
  return nums.length >= 2 ? nums : null;
}
class Tuning {
  /* key: pitch class 0–11 (C = 0). scale: an entry of SCALES or a custom { id, name, cents }.
     offsets: per-degree correction in cents (±50). a4: reference pitch in Hz. */
  constructor({ key = 9, scale = SCALES[0], a4 = 440, offsets = null } = {}) {
    this.key = mod(Math.round(key), 12);
    this.scale = scale;
    this.a4 = clamp$2(a4, A4_MIN, A4_MAX);
    this.n = scale.cents.length;
    this.offsets = scale.cents.map((_, i) => clamp$2(offsets && +offsets[i] || 0, -OFFSET_MAX, OFFSET_MAX));
    this.cents = scale.cents.map((c, i) => c + this.offsets[i]);
    this.root0 = this.a4 * Math.pow(2, (this.key - 9) / 12 - 4);
    this.micro = this.cents.some((c) => Math.abs(c - Math.round(c / 100) * 100) > 0.5);
  }
  /* Cents above the tonic of octave 0 for a scale degree (any integer, degrees wrap into higher octaves). */
  degCents(deg, oct = 0) {
    const d = Math.round(deg);
    return (Math.floor(d / this.n) + oct) * 1200 + this.cents[mod(d, this.n)];
  }
  /* THE place where a degree becomes a frequency. */
  hz(deg, oct = 0) {
    return this.root0 * Math.pow(2, this.degCents(deg, oct) / 1200);
  }
  /* Lowest octave whose tonic is at or above lowHz: parts name a register, never a pitch. */
  registerOct(lowHz) {
    return Math.ceil(log2(lowHz / this.root0) - 1e-9);
  }
  /* Cents above the tonic of octave 0. */
  centsOf(hz) {
    return 1200 * log2(hz / this.root0);
  }
  /* Distance in cents from the nearest scale tone (always ≥ 0). */
  error(hz) {
    const c = mod(this.centsOf(hz), 1200);
    let best = Infinity;
    for (const s of this.cents) {
      const d = Math.abs(c - s);
      best = Math.min(best, d, 1200 - d);
    }
    return best;
  }
  /* Nearest scale tone as { deg, oct } and as a frequency. Used for everything that resonates. */
  nearest(hz) {
    const c = this.centsOf(hz), o = Math.floor(c / 1200);
    let best = null, bd = Infinity;
    for (let oo = o - 1; oo <= o + 1; oo++) for (let i = 0; i < this.n; i++) {
      const d = Math.abs(oo * 1200 + this.cents[i] - c);
      if (d < bd) {
        bd = d;
        best = { deg: i, oct: oo };
      }
    }
    return best;
  }
  snap(hz) {
    const p = this.nearest(hz);
    return this.hz(p.deg, p.oct);
  }
  /* A heptatonic step (0 = tonic, 2 = third, 4 = fifth, 7 = octave, negative = below) as an index into this
     scale. Identity for seven-tone scales, proportional for pentatonics and custom scales, so chords are
     always built by stacking degrees of the scale in use. */
  step(h) {
    return Math.round(h * this.n / 7);
  }
  /* The scale tone that works as a fifth above a degree: the one within 60 cents of 3:2, otherwise the
     fourth, otherwise the octave. Returned as an absolute degree index above deg. */
  fifthOf(deg = 0) {
    const d = Math.round(deg), base = this.degCents(d);
    const near = (target) => {
      let bi = null, bd = 60;
      for (let j2 = d + 1; j2 < d + this.n; j2++) {
        const e = Math.abs(this.degCents(j2) - base - target);
        if (e <= bd) {
          bd = e;
          bi = j2;
        }
      }
      return bi;
    };
    let j = near(701.955);
    if (j == null) j = near(498.045);
    if (j == null) j = d + this.n;
    return j;
  }
  /* Lowest octave in which a degree sounds at or above lowHz. */
  octFor(deg, lowHz) {
    return Math.ceil((1200 * Math.log2(lowHz / this.root0) - this.degCents(deg, 0)) / 1200 - 1e-9);
  }
  /* MIDI: fractional note number (A4 of this tuning = 69), nearest key and the remainder in cents. */
  midi(deg, oct = 0) {
    const f = 69 + 12 * log2(this.hz(deg, oct) / this.a4);
    const note = Math.round(f);
    return { float: f, note, cents: (f - note) * 100 };
  }
  /* All scale tones between two frequencies, ascending. */
  tones(lo, hi) {
    const out = [];
    for (let o = this.registerOct(lo) - 1; ; o++) {
      if (this.hz(0, o) > hi) break;
      for (let i = 0; i < this.n; i++) {
        const f = this.hz(i, o);
        if (f >= lo && f <= hi) out.push(f);
      }
    }
    return out;
  }
}
const scaleById = (id, custom = []) => SCALES.find((s) => s.id === id) || custom.find((s) => s.id === id) || SCALES[0];
const PARTS = ["kick", "bass", "stab", "pad", "hats", "rim", "perc", "air", "noise", "siren"];
const PART_NAMES = { kick: "Kick", bass: "Sub bass", stab: "Chord stab", pad: "Pad / drone", hats: "Hats", rim: "Rim / clave", perc: "Perc", air: "Air", noise: "Noise", siren: "Siren / FX" };
const SYNC = { e: ["1/8", 0.5], d8: ["3/16", 0.75], q: ["1/4", 1], qt: ["1/4T", 2 / 3], free: ["Free", 0] };
const part = (o) => ({ level: 0.7, mute: false, solo: false, density: 0.6, variation: 0.25, lock: null, dly: 0, rev: 0, out: "browser", ch: 1, ...o });
const DEFAULTS = {
  v: 1,
  tempo: 118,
  swing: 0.12,
  bars: 4,
  seed: 4136,
  seedLock: false,
  key: 9,
  scale: "aeolian",
  a4: 440,
  offsets: {},
  custom: [],
  style: "four",
  progression: "i",
  customProg: "1:2 7:2",
  voicing: "auto",
  scene: "groove",
  auto: false,
  autoBars: 16,
  intensity: 0.6,
  parts: {
    kick: part({ level: 0.85, ch: 1, tune: "root", decay: 0.42, punch: 0.5, tone: 0.3 }),
    bass: part({ level: 0.8, ch: 2, shape: "sine", glide: 0, octave: 0, filter: 0.4 }),
    stab: part({ level: 0.7, ch: 3, dly: 0.75, rev: 0.4, detune: 8, cutoff: 0.48, res: 0.38, env: 0.5, length: 0.22, lfoDepth: 0.35, lfoRate: 0.045, rotate: 1 }),
    pad: part({ level: 0.45, ch: 4, dly: 0.15, rev: 0.5, variation: 0, tone: 0.4, rotate: 1 }),
    hats: part({ level: 0.5, ch: 5, dly: 0.2, rev: 0.1, tone: 0.5, decay: 0.3 }),
    rim: part({ level: 0.5, ch: 6, dly: 0.4, rev: 0.4, density: 0.5 }),
    perc: part({ level: 0.45, ch: 7, dly: 0.2, rev: 0.25, density: 0.5 }),
    air: part({ level: 0.4, ch: 8, dly: 0.3, rev: 0.2, density: 0.5 }),
    noise: part({ level: 0.45, ch: 0, rev: 0.1, density: 0.5, variation: 0 }),
    siren: part({ level: 0.45, ch: 9, dly: 0.8, rev: 0.4, density: 0.5, variation: 0.6 })
  },
  delay: { sync: "d8", free: 0.38, feedback: 0.62, hp: 320, lp: 1700, sat: 0.3, wow: 0.25, flutter: 0.15, ping: true, freeze: false, level: 0.7 },
  reverb: { type: "plate", size: 0.6, damp: 0.5, level: 0.55 },
  master: { dj: 0, sat: 0.25, comp: 0.4, volume: 0.8 },
  xy: { mode: "delay" },
  midi: { on: false, out: "", in: "", clockOut: true, clockIn: false, micro: "bend", bend: 2, drums: "gm" }
};
const PRESETS = {
  "Burial Mix": {
    tempo: 104,
    swing: 0.2,
    style: "onedrop",
    voicing: "auto",
    progression: "i",
    parts: { kick: { decay: 0.5, punch: 0.35, tone: 0.2 }, bass: { level: 0.9, shape: "sine", filter: 0.3 }, stab: { cutoff: 0.4, res: 0.3, length: 0.18, dly: 0.8, rev: 0.5 }, hats: { level: 0.35 }, rim: { level: 0.6, rev: 0.6 }, noise: { level: 0.6 } },
    delay: { sync: "d8", feedback: 0.68, lp: 1300, hp: 280, sat: 0.45, wow: 0.35 },
    reverb: { type: "spring", size: 0.55, damp: 0.6, level: 0.6 },
    master: { sat: 0.35 }
  },
  "Deep Chord": {
    tempo: 120,
    swing: 0.1,
    style: "four",
    voicing: "m79",
    progression: "i",
    parts: { stab: { cutoff: 0.5, res: 0.45, length: 0.35, detune: 12, lfoDepth: 0.5, lfoRate: 0.03, dly: 0.85, rev: 0.55 }, pad: { level: 0.5 }, hats: { level: 0.45 }, bass: { filter: 0.35 } },
    delay: { sync: "d8", feedback: 0.72, lp: 2200, hp: 380, sat: 0.25, wow: 0.2 },
    reverb: { type: "plate", size: 0.8, damp: 0.45, level: 0.65 }
  },
  "Steppers": {
    tempo: 126,
    swing: 0.06,
    style: "steppers",
    voicing: "auto",
    progression: "i-VII",
    parts: { kick: { punch: 0.65, decay: 0.34 }, bass: { shape: "triangle", filter: 0.45, density: 0.75 }, hats: { level: 0.55, density: 0.7 }, perc: { level: 0.5 }, stab: { length: 0.14, cutoff: 0.55 } },
    delay: { sync: "q", feedback: 0.55, lp: 1900, hp: 400 },
    reverb: { type: "plate", size: 0.5, damp: 0.5, level: 0.45 }
  },
  "One Drop": {
    tempo: 96,
    swing: 0.28,
    style: "onedrop",
    voicing: "sus",
    progression: "i-iv",
    parts: { bass: { level: 0.9, glide: 0.06, filter: 0.32 }, rim: { level: 0.65, dly: 0.5 }, stab: { length: 0.12, cutoff: 0.45, res: 0.3 }, perc: { level: 0.5, density: 0.6 } },
    delay: { sync: "qt", feedback: 0.6, lp: 1500, hp: 300, sat: 0.4 },
    reverb: { type: "spring", size: 0.6, damp: 0.5, level: 0.6 }
  },
  "Kosmische Dub": {
    tempo: 110,
    swing: 0.08,
    style: "half",
    voicing: "fifths",
    progression: "i-VI-VII",
    parts: { pad: { level: 0.65, tone: 0.55, rev: 0.7 }, stab: { length: 0.6, cutoff: 0.42, res: 0.5, lfoDepth: 0.7, lfoRate: 0.08, detune: 14 }, air: { level: 0.5, dly: 0.5 }, siren: { level: 0.5 }, hats: { level: 0.35 } },
    delay: { sync: "q", feedback: 0.78, lp: 2600, hp: 450, wow: 0.5, flutter: 0.3 },
    reverb: { type: "plate", size: 0.95, damp: 0.35, level: 0.7 }
  }
};
const isObj = (o) => o && typeof o === "object" && !Array.isArray(o);
function merge(base, patch) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  if (!isObj(patch)) return out;
  for (const k of Object.keys(patch)) {
    if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
    out[k] = isObj(patch[k]) && isObj(base[k]) ? merge(base[k], patch[k]) : isObj(patch[k]) ? merge({}, patch[k]) : patch[k];
  }
  return out;
}
const clone = (o) => JSON.parse(JSON.stringify(o));
const makeState = (patch) => merge(clone(DEFAULTS), patch || {});
function tuningOf(S) {
  const scale = scaleById(S.scale, S.custom);
  return new Tuning({ key: S.key, scale, a4: S.a4, offsets: (S.offsets || {})[scale.id] });
}
function mulberry32(a) {
  return function() {
    a |= 0;
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hash(...parts) {
  const s = parts.join("|");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}
const rng = (...parts) => mulberry32(hash(...parts));
const rand = (...parts) => mulberry32(hash(...parts))();
const pick = (r, list) => list[Math.min(list.length - 1, Math.floor(r() * list.length))];
function shuffle(r, list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const STEPS = 16;
const SWING = 0.4;
const REG = { sub: 41, conga: 185, pad: 110, stab: 165, siren: 440, rim: 1400, clave: 2e3 };
const SCENES = {
  intro: { kick: 0, bass: 0, stab: 0.6, pad: 1, hats: 0.5, rim: 0, perc: 0, air: 0.9, noise: 1, siren: 0.6 },
  groove: { kick: 1, bass: 1, stab: 1, pad: 1, hats: 1, rim: 1, perc: 1, air: 1, noise: 1, siren: 1 },
  break: { kick: 0, bass: 0, stab: 1, pad: 1, hats: 0.45, rim: 0.6, perc: 0.7, air: 1.1, noise: 1, siren: 1.3 },
  drop: { kick: 1.25, bass: 1.25, stab: 1.2, pad: 0.8, hats: 1.3, rim: 1.2, perc: 1.3, air: 1.2, noise: 1, siren: 1 }
};
const GATE = { kick: 0.15, bass: 0.1, stab: 0.05, pad: 0, hats: 0.2, rim: 0.3, perc: 0.4, air: 0.5, noise: 0, siren: 0.55 };
function effDensity(S, part2, scene = S.scene) {
  if (S.intensity < GATE[part2]) return 0;
  const m = (SCENES[scene] || SCENES.groove)[part2];
  return S.parts[part2].density * m * (0.55 + 0.75 * S.intensity);
}
function autoScene(S, absBar) {
  const k = Math.floor(absBar / Math.max(1, S.autoBars));
  return k === 0 ? "intro" : ["groove", "break", "drop"][(k - 1) % 3];
}
const PROGRESSIONS = {
  "i": [[0, 1]],
  "i-VII": [[0, 2], [-1, 2]],
  "i-iv": [[0, 2], [3, 2]],
  "i-v": [[0, 2], [-3, 2]],
  "i-VI-VII": [[0, 2], [-2, 1], [-1, 1]]
};
function parseProgression(text) {
  const out = [];
  for (const tok of String(text || "").split(/[\s,;]+/).filter(Boolean)) {
    const m = /^([1-7])(?::(\d{1,2}))?$/.exec(tok);
    if (!m) return null;
    const h = +m[1] - 1;
    out.push([h >= 4 ? h - 7 : h, Math.max(1, Math.min(16, +(m[2] || 1)))]);
  }
  return out.length ? out : null;
}
function progressionOf(S) {
  if (S.progression === "custom") return parseProgression(S.customProg) || PROGRESSIONS.i;
  return PROGRESSIONS[S.progression] || PROGRESSIONS.i;
}
function chordAt(S, absBar) {
  const prog = progressionOf(S), total = prog.reduce((a, c) => a + c[1], 0);
  let pos = (absBar % total + total) % total;
  for (const [h, bars] of prog) {
    if (pos < bars) return h;
    pos -= bars;
  }
  return 0;
}
const VOICINGS = {
  m79: [0, 2, 4, 6, 8],
  sus: [0, 3, 4, 8],
  fifths: [0, "5", 7, "5+"],
  cluster: [0, 1, 2, 4],
  stack: [0, 2, 4, 6, 8, 10, 12]
};
const voicingOf = (S, tun) => S.voicing === "auto" || !VOICINGS[S.voicing] ? tun.micro ? "fifths" : "m79" : S.voicing;
function chordDegrees(S, tun, root) {
  const out = [];
  for (const s of VOICINGS[voicingOf(S, tun)]) {
    const d = s === "5" ? tun.fifthOf(root) : s === "5+" ? tun.fifthOf(root) + tun.n : root + tun.step(s);
    if (!out.includes(d)) out.push(d);
  }
  return out;
}
function euclid(k, n, rot = 0) {
  const out = [];
  for (let i = 0; i < n; i++) if (((i - rot) % n + n) % n * k % n < k) out.push(i);
  return out;
}
const H = (step, rank, p, v, extra) => ({ step, rank, p, v, len: 1, kind: "", notes: null, ...extra });
const KICK = {
  four: { core: [[0, 1], [4, 0.9], [8, 0.95], [12, 0.9]], extra: [[14, 0.55], [11, 0.5], [7, 0.5], [15, 0.45]] },
  steppers: { core: [[0, 1], [4, 0.95], [8, 1], [12, 0.95]], extra: [[15, 0.5], [10, 0.5], [6, 0.45], [14, 0.5]] },
  onedrop: { core: [[8, 1]], extra: [[15, 0.5], [0, 0.8], [11, 0.5], [14, 0.45]] },
  rockers: { core: [[0, 1], [8, 0.95]], extra: [[10, 0.6], [15, 0.5], [6, 0.5], [3, 0.45]] },
  half: { core: [[0, 1]], extra: [[10, 0.7], [7, 0.55], [14, 0.5], [3, 0.45]] }
};
const BACKBEAT = { four: [[4, 12], 0.42], steppers: [[8], 0.1], onedrop: [[8], 0.05], rockers: [[4, 12], 0.1], half: [[8], 0.1] };
function context(part2, S, tun, seed, epoch, phrase) {
  const base = phrase * S.bars;
  return {
    part: part2,
    S,
    tun,
    n: tun.n,
    bars: S.bars,
    style: KICK[S.style] ? S.style : "four",
    base,
    B: (...k) => rng(seed, part2, "base", ...k),
    // what the pattern is
    V: (...k) => rng(seed, part2, "var", epoch, ...k),
    // how this variation differs
    root: (bip) => tun.step(chordAt(S, base + bip)),
    // chord root as a degree of the scale
    each: (fn) => Array.from({ length: S.bars }, (_, b) => fn(b))
  };
}
function genKick(c) {
  const T = KICK[c.style], extra = shuffle(c.B("extra"), T.extra);
  const deg = c.S.parts.kick.tune === "fifth" ? c.tun.fifthOf(0) : 0;
  const note = { deg, oct: c.tun.octFor(deg, REG.sub) };
  return c.each((b) => {
    const hits = T.core.map(([s, v]) => H(s, 0, 1, v));
    extra.forEach(([s, v], i) => hits.push(H(s, 0.62 + i * 0.1, 0.6, v)));
    if (c.bars > 1 && b === c.bars - 1) {
      const [s, v] = pick(c.V("fill"), T.extra);
      hits.push(H(s, 0.4, 0.8, v));
    }
    hits.forEach((h) => {
      h.notes = [note];
    });
    return hits;
  });
}
function genBass(c) {
  const { tun, n } = c, r = c.B("motif");
  const sparse = c.style === "onedrop" || c.style === "half";
  const N = (step, len, d, rank, v) => ({ step, len, d, rank, p: 1, v });
  const A = [];
  if (r() < (sparse ? 0.7 : 0.4)) {
    A.push(N(0, 4 + Math.floor(r() * 3), "r", 0, 1));
    A.push(N(pick(r, [7, 8, 10]), 2, r() < 0.5 ? "r" : "5", 0.3, 0.8));
    A.push(N(pick(r, [11, 12]), 3, r() < 0.6 ? "5" : "7", 0.45, 0.85));
    A.push(N(14, 2, r() < 0.5 ? "7" : "r", 0.78, 0.7));
  } else {
    A.push(N(0, 3, "r", 0, 1));
    A.push(N(pick(r, [3, 4, 6]), 2, "r", 0.25, 0.8));
    A.push(N(pick(r, [8, 10]), 2, pick(r, ["5", "r", "3"]), 0.4, 0.85));
    A.push(N(pick(r, [11, 12]), 2, pick(r, ["7", "5"]), 0.55, 0.8));
    A.push(N(pick(r, [14, 15]), 1, pick(r, ["r", "8"]), 0.8, 0.65));
  }
  const oct = tun.registerOct(REG.sub) + (c.S.parts.bass.octave | 0);
  const fit = (deg) => {
    let d = deg;
    while (tun.hz(d, oct) < 34) d += n;
    return { deg: d, oct };
  };
  const degOf = (d, R) => d === "r" ? R : d === "5" ? tun.fifthOf(R) - n : d === "7" ? R + tun.step(6) - n : d === "3" ? R + tun.step(2) : R + n;
  return c.each((b) => {
    let hits = A.map((h) => ({ ...h }));
    if (b % 2 === 1) {
      const v = c.V("alt", b), i = 1 + Math.floor(v() * (hits.length - 1));
      hits[i].d = hits[i].d === "5" ? "7" : hits[i].d === "7" ? "5" : v() < 0.5 ? "5" : hits[i].d;
    }
    const R = c.root(b);
    hits.forEach((h) => {
      h.abs = degOf(h.d, R);
    });
    if (c.bars > 1 && b === c.bars - 1) {
      const next = tun.step(chordAt(c.S, c.base + c.bars)), up = c.V("turn")() < 0.35;
      hits = hits.filter((h) => h.step < 11);
      hits.push({ step: 12, len: 2, abs: next + (up ? 2 : -2), rank: 0.42, p: 1, v: 0.75 });
      hits.push({ step: 14, len: 2, abs: next + (up ? 1 : -1), rank: 0.52, p: 1, v: 0.8 });
    }
    return hits.map((h) => H(h.step, h.rank, h.p, h.v, { len: h.len, notes: [fit(h.abs)] }));
  });
}
const STAB_CELLS = [[2, 10], [2], [2, 10, 13], [6], [3, 11], [6, 14], [2, 7], [10], [3, 6]];
function genStab(c) {
  const r = c.B("cell"), cellA = pick(r, STAB_CELLS), cellB = pick(r, STAB_CELLS);
  const oct = c.tun.registerOct(REG.stab);
  return c.each((b) => {
    const cell = (b >> 1) % 2 ? cellB : cellA, v = c.V("vel", b);
    const notes = chordDegrees(c.S, c.tun, c.root(b)).map((deg) => ({ deg, oct }));
    const hits = cell.map((s, i) => H(s, [0, 0.35, 0.6][i], 1, 0.65 + 0.35 * v(), { notes }));
    hits.push(H(pick(v, [5, 7, 13, 14, 15]), 0.8, 0.5, 0.45, { notes }));
    return hits;
  });
}
function genPad(c) {
  const { tun, n } = c, oct = tun.registerOct(REG.pad);
  const starts = [];
  for (let b = 0; b < c.bars; b++) if (b === 0 || c.root(b) !== c.root(b - 1) || b % 2 === 0) starts.push(b);
  return c.each((b) => {
    const i = starts.indexOf(b);
    if (i < 0) return [];
    const R = c.root(b), end = i + 1 < starts.length ? starts[i + 1] : c.bars;
    const upper = chordDegrees(c.S, tun, R).filter((d) => d !== R);
    const notes = [{ deg: R, oct: oct - 1, rank: 0 }, { deg: tun.fifthOf(R), oct: oct - 1, rank: 0.15 }, { deg: R, oct, rank: 0.3 }];
    upper.forEach((deg, k) => notes.push({ deg, oct, rank: 0.4 + k * 0.12 }));
    return [H(0, 0, 1, 0.7, { len: (end - b) * STEPS, notes })];
  });
}
function genHats(c) {
  const r = c.B("mode"), hits16 = [];
  if (r() < 0.65) {
    for (let s = 0; s < STEPS; s++) {
      if (s % 4 === 2) hits16.push(H(s, 0.05 + 0.1 * r(), 1, 0.8));
      else if (s % 2 === 1) hits16.push(H(s, 0.55 + 0.35 * r(), 0.35 + 0.3 * r(), 0.3));
      else hits16.push(H(s, 0.9, 0.5, 0.25));
    }
  } else {
    const on = euclid(pick(r, [5, 7, 6, 9]), STEPS, Math.floor(r() * 4));
    shuffle(r, on).forEach((s, i) => hits16.push(H(s, i * 0.7 / on.length, 1, s % 2 ? 0.55 : 0.8)));
    for (let s = 0; s < STEPS; s++) if (!on.includes(s)) hits16.push(H(s, 0.8 + 0.15 * r(), 0.4, 0.25));
  }
  return c.each((b) => {
    const hits = hits16.map((h) => ({ ...h, kind: "closed" }));
    if (b === c.bars - 1) hits.push(H(pick(c.V("open"), [14, 6, 10]), 0.35, 0.8, 0.6, { kind: "open", len: 2 }));
    return hits;
  });
}
function genRim(c) {
  const { tun } = c, r = c.B("clave");
  const [back, backRank] = BACKBEAT[c.style];
  const fifth = tun.fifthOf(0);
  const rim = { deg: fifth, oct: tun.octFor(fifth, REG.rim) }, clave = { deg: 0, oct: tun.registerOct(REG.clave) };
  const pat = euclid(pick(r, [3, 5, 5]), STEPS, Math.floor(r() * STEPS)).filter((s) => !back.includes(s));
  const order = shuffle(r, pat);
  return c.each((b) => {
    const hits = back.map((s) => H(s, backRank, 1, 0.9, { kind: "rim", notes: [rim] }));
    order.forEach((s, i) => hits.push(H(s, 0.5 + i * 0.1, 0.7, 0.6, { kind: "clave", notes: [clave] })));
    if (b % 2 === 1) {
      const s = pick(c.V("ghost", b), [7, 9, 13, 15]);
      if (!back.includes(s)) hits.push(H(s, 0.7, 0.6, 0.45, { kind: "rim", notes: [rim] }));
    }
    return hits;
  });
}
function genPerc(c) {
  const { tun } = c, r = c.B("conga");
  const lo = { deg: 0, oct: tun.registerOct(REG.conga) };
  const hiDeg = r() < 0.5 ? tun.fifthOf(0) : tun.step(2);
  const hi = { deg: hiDeg, oct: lo.oct };
  const on = euclid(pick(r, [3, 4, 5]), STEPS, Math.floor(r() * STEPS));
  const tones = on.map(() => r() < 0.6 ? lo : hi), vels = on.map(() => 0.6 + 0.3 * r());
  return c.each((b) => {
    const hits = [];
    for (let s = 0; s < STEPS; s++) hits.push(s % 2 ? H(s, 0.65, 0.8, 0.3, { kind: "shaker" }) : H(s, s % 4 === 2 ? 0.25 : 0.35, 1, s % 4 === 2 ? 0.7 : 0.5, { kind: "shaker" }));
    const shift = b % 2 === 1 && c.V("shift", b)() < 0.5 ? 1 : 0;
    on.forEach((s, i) => hits.push(H((s + (i === on.length - 1 ? shift : 0)) % STEPS, 0.15 + i * 0.12, 1, vels[i], { kind: "conga", notes: [tones[i]] })));
    return hits;
  });
}
function genAir(c) {
  const r = c.B("air"), on = euclid(pick(r, [2, 3, 5]), STEPS, Math.floor(r() * STEPS));
  const vels = on.map(() => 0.5 + 0.5 * r());
  return c.each((b) => {
    const rot = Math.floor(c.V("rot")() * 3);
    const hits = on.map((s, i) => H((s + rot) % STEPS, i * 0.2, 0.75, vels[i]));
    if (b === c.bars - 1) [13, 14, 15].forEach((s) => hits.push(H(s, 0.6, 0.6, 0.4)));
    return hits;
  });
}
function genSiren(c) {
  const { tun, n } = c, v = c.V("fx");
  const oct = tun.registerOct(REG.siren), fifth = tun.fifthOf(0);
  const out = c.each(() => []);
  const place = (bar, rankBase) => {
    const type = pick(v, ["siren", "fragment", "zap", "siren"]);
    if (type === "siren") {
      const other = v() < 0.6 ? { deg: fifth, oct } : { deg: tun.step(2), oct };
      out[bar].push(H(pick(v, [4, 8, 10]), rankBase, 0.75, 0.8, { kind: "siren", len: pick(v, [4, 6]), rate: pick(v, [1, 2, 0.5]), notes: [{ deg: n, oct }, other] }));
    } else if (type === "zap") {
      out[bar].push(H(pick(v, [7, 11, 15]), rankBase, 0.75, 0.8, { kind: "zap", notes: [{ deg: n, oct: oct + 1 }, { deg: 0, oct }] }));
    } else {
      const walk = pick(v, [[4, 2, 0], [0, 2, 4], [7, 4, 2], [2, 1, 0], [-1, 0, 2]]).map((h) => tun.step(h));
      const s0 = pick(v, [2, 6, 8]);
      walk.forEach((deg, i) => out[bar].push(H(s0 + i * 3, rankBase + i * 0.08, 0.85, 0.75 - i * 0.1, { kind: "pluck", len: 2, notes: [{ deg, oct }] })));
    }
  };
  place(c.bars - 1, 0.2);
  if (c.bars > 2) place(Math.floor(c.bars / 2) - 1, 0.7);
  return out;
}
const GEN = { kick: genKick, bass: genBass, stab: genStab, pad: genPad, hats: genHats, rim: genRim, perc: genPerc, air: genAir, siren: genSiren, noise: (c) => c.each(() => []) };
function epochAt(seed, part2, variation, phrase) {
  if (!(variation > 0)) return 0;
  for (let j = phrase; j > 0; j--) if (rand(seed, part2, "epoch", j) < variation * 0.9) return j;
  return 0;
}
function patternOf(S, tun, part2, phrase) {
  const P = S.parts[part2];
  const seed = P.lock ? P.lock.seed : S.seed;
  const epoch = P.lock ? P.lock.epoch : epochAt(seed, part2, P.variation, phrase);
  return { seed, epoch, bars: GEN[part2](context(part2, S, tun, seed, epoch, phrase)) };
}
function resolveBar(S, tun, part2, absBar, opt = {}) {
  const dens = effDensity(S, part2, opt.scene);
  if (!(dens > 0)) return [];
  const bars = S.bars, phrase = Math.floor(absBar / bars), bip = absBar % bars;
  const pat = patternOf(S, tun, part2, phrase);
  let hits = pat.bars[bip];
  if (part2 === "pad" && opt.forcePad && !hits.length) {
    for (let b = bip - 1; b >= 0; b--) if (pat.bars[b].length) {
      hits = pat.bars[b].map((h) => ({ ...h, len: h.len - (bip - b) * STEPS }));
      break;
    }
  }
  const best = /* @__PURE__ */ new Map();
  for (const h of hits) {
    if (!(h.rank < dens)) continue;
    const k = h.step + ":" + h.kind, o = best.get(k);
    if (!o || h.rank < o.rank) best.set(k, h);
  }
  const out = [];
  for (const h of best.values()) {
    if (h.p < 1 && !(rand(pat.seed, part2, "p", absBar, h.step, h.kind) < h.p)) continue;
    const vel = Math.min(1, h.v * (0.92 + 0.16 * rand(pat.seed, part2, "vel", absBar, h.step, h.kind)));
    let notes = h.notes;
    if (part2 === "pad") notes = notes.filter((n) => n.rank < dens).map((n) => ({ deg: n.deg, oct: n.oct }));
    const ev = { part: part2, bar: absBar, step: h.step, vel, len: h.len, kind: h.kind || part2, notes: notes || [] };
    if (h.rate) ev.rate = h.rate;
    out.push(ev);
  }
  out.sort((a, b) => a.step - b.step || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
  if (part2 === "bass") for (let i = 0; i < out.length; i++) {
    const end = i + 1 < out.length ? out[i + 1].step : STEPS;
    out[i].len = Math.max(0.5, Math.min(out[i].len, end - out[i].step));
  }
  return out;
}
function barEvents(S, tun, absBar, opt = {}) {
  const out = [];
  for (const part2 of PARTS) for (const ev of resolveBar(S, tun, part2, absBar, opt)) out.push(ev);
  out.sort((a, b) => a.step - b.step || PARTS.indexOf(a.part) - PARTS.indexOf(b.part));
  return out;
}
function displayBar(S, tun, part2, absBar, opt = {}) {
  const out = new Array(STEPS).fill(0);
  const dens = effDensity(S, part2, opt.scene);
  if (!(dens > 0)) return out;
  const bars = S.bars, pat = patternOf(S, tun, part2, Math.floor(absBar / bars)).bars[absBar % bars];
  for (const h of pat) if (h.rank < dens && h.step < STEPS) out[h.step] = Math.max(out[h.step], h.p >= 1 ? 1 : 0.5);
  return out;
}
const pitchesOf = (tun, ev) => ev.notes.map((n) => tun.hz(n.deg, n.oct));
const tapeSrc = "/* Audio-thread processors. Loaded as text and registered from a Blob, so the single-file build stays one file.\n\n   dub-tape: a tape delay. The read head moves smoothly when the time changes (pitch glides like tape\n   changing speed), wow and flutter wobble it, and the loop holds a high-pass, a low-pass, saturation and\n   a limiter. Freeze closes the input and holds the loop at unity gain; the limiter keeps it from running away.\n\n   dub-rec: hands the signal to the main thread in blocks, for live recording to WAV. */\n\nclass DubTape extends AudioWorkletProcessor {\n  static get parameterDescriptors() {\n    const k = (name, defaultValue, minValue, maxValue) => ({ name, defaultValue, minValue, maxValue, automationRate: 'k-rate' });\n    return [k('time', 0.38, 0.01, 3.9), k('feedback', 0.6, 0, 1.1), k('hp', 300, 10, 20000), k('lp', 1800, 10, 20000),\n      k('drive', 0.3, 0, 1), k('wow', 0.2, 0, 1), k('flutter', 0.1, 0, 1), k('ping', 1, 0, 1), k('freeze', 0, 0, 1)];\n  }\n  constructor() {\n    super();\n    let n = 1; while (n < sampleRate * 4 + 8) n <<= 1;\n    this.N = n; this.mask = n - 1;\n    this.bL = new Float32Array(n); this.bR = new Float32Array(n);\n    this.w = 0; this.cur = -1; this.p1 = 0; this.p2 = 0; this.frz = 0; this.pg = 1;\n    this.hpF = 0; this.lpF = 0; this.hc = [1, 0, 0, 0, 0]; this.lc = [1, 0, 0, 0, 0];\n    this.z = new Float64Array(8);     // biquad states: hpL, hpR, lpL, lpR (two each)\n  }\n  coef(type, f) {\n    const w0 = 2 * Math.PI * Math.min(f, sampleRate * 0.45) / sampleRate, c = Math.cos(w0), a = Math.sin(w0) / (2 * 0.9), a0 = 1 + a;\n    return type ? [(1 + c) / 2 / a0, -(1 + c) / a0, (1 + c) / 2 / a0, -2 * c / a0, (1 - a) / a0]\n                : [(1 - c) / 2 / a0, (1 - c) / a0, (1 - c) / 2 / a0, -2 * c / a0, (1 - a) / a0];\n  }\n  process(inputs, outputs, P) {\n    const inp = inputs[0], out = outputs[0], oL = out[0], oR = out[1] || out[0];\n    const iL = inp && inp[0], iR = inp && (inp[1] || inp[0]);\n    const time = P.time[0], fbP = P.feedback[0], drive = P.drive[0], ping = P.ping[0] > 0.5 ? 1 : 0, freeze = P.freeze[0] > 0.5 ? 1 : 0;\n    if (P.hp[0] !== this.hpF) { this.hpF = P.hp[0]; this.hc = this.coef(1, this.hpF); }\n    if (P.lp[0] !== this.lpF) { this.lpF = P.lp[0]; this.lc = this.coef(0, this.lpF); }\n    if (this.cur < 0) this.cur = time;\n    const sr = sampleRate, N = this.N, mask = this.mask, bL = this.bL, bR = this.bR, z = this.z, hc = this.hc, lc = this.lc;\n    const slew = 1 - Math.exp(-1 / (sr * 0.09)), fs = 1 - Math.exp(-1 / (sr * 0.03));\n    const wowA = P.wow[0] * 0.0035, fluA = P.flutter[0] * 0.00045, d1 = 2 * Math.PI * 0.43 / sr, d2 = 2 * Math.PI * 6.7 / sr;\n    const g = 1 + 3 * drive, T = 0.6;\n    let w = this.w, cur = this.cur, p1 = this.p1, p2 = this.p2, frz = this.frz, pg = this.pg;\n    for (let i = 0; i < oL.length; i++) {\n      cur += (time - cur) * slew; frz += (freeze - frz) * fs; pg += (ping - pg) * fs;\n      p1 += d1; if (p1 > 6.283185307) p1 -= 6.283185307;\n      p2 += d2; if (p2 > 6.283185307) p2 -= 6.283185307;\n      let d = (cur + wowA * Math.sin(p1) + fluA * Math.sin(p2)) * sr;\n      if (d < 2) d = 2; else if (d > N - 4) d = N - 4;\n      const pos = w - d, i0 = Math.floor(pos), f = pos - i0;\n      const a = (i0 - 1) & mask, b = i0 & mask, c = (i0 + 1) & mask, e = (i0 + 2) & mask;\n      // 4-point Hermite read\n      let yl = bL[b] + 0.5 * f * (bL[c] - bL[a] + f * (2 * bL[a] - 5 * bL[b] + 4 * bL[c] - bL[e] + f * (3 * (bL[b] - bL[c]) + bL[e] - bL[a])));\n      let yr = bR[b] + 0.5 * f * (bR[c] - bR[a] + f * (2 * bR[a] - 5 * bR[b] + 4 * bR[c] - bR[e] + f * (3 * (bR[b] - bR[c]) + bR[e] - bR[a])));\n      // loop filters (transposed direct form II)\n      let t = lc[0] * yl + z[4]; z[4] = lc[1] * yl - lc[3] * t + z[5]; z[5] = lc[2] * yl - lc[4] * t; let fl = t;\n      t = hc[0] * fl + z[0]; z[0] = hc[1] * fl - hc[3] * t + z[1]; z[1] = hc[2] * fl - hc[4] * t; fl = t;\n      t = lc[0] * yr + z[6]; z[6] = lc[1] * yr - lc[3] * t + z[7]; z[7] = lc[2] * yr - lc[4] * t; let fr = t;\n      t = hc[0] * fr + z[2]; z[2] = hc[1] * fr - hc[3] * t + z[3]; z[3] = hc[2] * fr - hc[4] * t; fr = t;\n      // frozen: the loop bypasses its filters and saturation, so it neither darkens nor decays\n      let sl = Math.tanh(g * fl) / g, sr2 = Math.tanh(g * fr) / g;\n      sl += (yl - sl) * frz; sr2 += (yr - sr2) * frz;\n      // limiter in the loop: unity below the threshold, bounded by 1 above it\n      let m = sl < 0 ? -sl : sl; if (m > T) sl = (sl < 0 ? -1 : 1) * (T + (1 - T) * Math.tanh((m - T) / (1 - T)));\n      m = sr2 < 0 ? -sr2 : sr2; if (m > T) sr2 = (sr2 < 0 ? -1 : 1) * (T + (1 - T) * Math.tanh((m - T) / (1 - T)));\n      const fb = fbP + (1 - fbP) * frz, inG = 1 - frz;\n      const xl = iL ? iL[i] : 0, xr = iR ? iR[i] : 0, mono = (xl + xr) * 0.7;\n      // ping-pong: the input enters on the left and the two lines feed each other\n      bL[w] = (xl + (mono - xl) * pg) * inG + fb * (sl + (sr2 - sl) * pg);\n      bR[w] = (xr - xr * pg) * inG + fb * (sr2 + (sl - sr2) * pg);\n      w = (w + 1) & mask;\n      oL[i] = fl + (yl - fl) * frz; oR[i] = fr + (yr - fr) * frz;\n    }\n    for (let k = 0; k < 8; k++) if (!(Math.abs(z[k]) > 1e-30)) z[k] = 0;      // denormals and NaN guard\n    this.w = w; this.cur = cur; this.p1 = p1; this.p2 = p2; this.frz = frz; this.pg = pg;\n    return true;\n  }\n}\nregisterProcessor('dub-tape', DubTape);\n\nclass DubRec extends AudioWorkletProcessor {\n  constructor() {\n    super(); this.on = false; this.n = 0; this.L = new Float32Array(8192); this.R = new Float32Array(8192);\n    this.port.onmessage = (e) => { if (e.data === 'start') { this.on = true; this.n = 0; } else if (e.data === 'stop') { this.flush(); this.on = false; this.port.postMessage('done'); } };\n  }\n  flush() { if (this.n) { this.port.postMessage({ l: this.L.slice(0, this.n), r: this.R.slice(0, this.n) }); this.n = 0; } }\n  process(inputs) {\n    const i = inputs[0];\n    if (this.on && i && i[0]) {\n      const l = i[0], r = i[1] || i[0];\n      for (let k = 0; k < l.length; k++) { this.L[this.n] = l[k]; this.R[this.n] = r[k]; if (++this.n === 8192) this.flush(); }\n    }\n    return true;\n  }\n}\nregisterProcessor('dub-rec', DubRec);\n";
async function loadWorklets(ctx) {
  if (!ctx.audioWorklet || typeof AudioWorkletNode === "undefined") return false;
  try {
    const url = URL.createObjectURL(new Blob([tapeSrc], { type: "text/javascript" }));
    try {
      await ctx.audioWorklet.addModule(url);
      return true;
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (e) {
  }
  try {
    await ctx.audioWorklet.addModule("data:text/javascript;charset=utf-8," + encodeURIComponent(tapeSrc));
    return true;
  } catch (e) {
    return false;
  }
}
const curve = (fn, n = 2049) => {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = fn(i / (n - 1) * 2 - 1);
  return c;
};
const satCurve = (amount) => {
  const k = 0.5 + amount * 4, d = Math.tanh(k);
  return curve((x) => Math.tanh(k * x) / d);
};
const clipCurve = () => curve((x) => {
  const m = Math.abs(x);
  return m < 0.75 ? x : Math.sign(x) * (0.75 + 0.22 * Math.tanh((m - 0.75) / 0.22));
});
function makeDelay(ctx, tape) {
  const D = { in: ctx.createGain(), out: ctx.createGain(), tape };
  const NAMES = ["time", "feedback", "hp", "lp", "drive", "wow", "flutter", "ping", "freeze"];
  if (tape) {
    const node = new AudioWorkletNode(ctx, "dub-tape", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: "explicit" });
    D.in.connect(node);
    node.connect(D.out);
    D.set = (v, t, instant) => {
      for (const k of NAMES) {
        const p = node.parameters.get(k);
        if (instant) p.setValueAtTime(v[k], t);
        else p.setTargetAtTime(v[k], t, k === "ping" || k === "freeze" ? 1e-3 : 0.02);
      }
    };
    D.dispose = () => {
      try {
        node.disconnect();
      } catch (e) {
      }
    };
    return D;
  }
  const g = (v) => {
    const n = ctx.createGain();
    n.gain.value = v;
    return n;
  };
  const f = (type) => {
    const n = ctx.createBiquadFilter();
    n.type = type;
    n.Q.value = 0.9;
    return n;
  };
  const mono = g(0.7);
  mono.channelCount = 1;
  mono.channelCountMode = "explicit";
  const inL = g(1), inR = g(0), dL = ctx.createDelay(4), dR = ctx.createDelay(4);
  const lpL = f("lowpass"), lpR = f("lowpass"), hpL = f("highpass"), hpR = f("highpass");
  const shL = ctx.createWaveShaper(), shR = ctx.createWaveShaper();
  const fLL = g(0), fLR = g(0.6), fRL = g(0.6), fRR = g(0), merge2 = ctx.createChannelMerger(2);
  const wow = ctx.createOscillator(), wowG = g(0), flu = ctx.createOscillator(), fluG = g(0);
  wow.frequency.value = 0.43;
  flu.frequency.value = 6.7;
  D.in.connect(mono);
  mono.connect(inL);
  mono.connect(inR);
  inL.connect(dL);
  inR.connect(dR);
  dL.connect(lpL);
  lpL.connect(hpL);
  hpL.connect(shL);
  shL.connect(fLL);
  shL.connect(fLR);
  fLL.connect(dL);
  fLR.connect(dR);
  dR.connect(lpR);
  lpR.connect(hpR);
  hpR.connect(shR);
  shR.connect(fRR);
  shR.connect(fRL);
  fRR.connect(dR);
  fRL.connect(dL);
  hpL.connect(merge2, 0, 0);
  hpR.connect(merge2, 0, 1);
  merge2.connect(D.out);
  wow.connect(wowG);
  flu.connect(fluG);
  for (const d of [dL, dR]) {
    wowG.connect(d.delayTime);
    fluG.connect(d.delayTime);
  }
  wow.start();
  flu.start();
  let drive = -1;
  D.set = (v, t, instant) => {
    const s = (p, x, tc = 0.02) => instant ? p.setValueAtTime(x, t) : p.setTargetAtTime(x, t, tc);
    const fb = v.freeze ? 1 : Math.min(v.feedback, 1.05), on = v.freeze ? 0 : 1;
    s(dL.delayTime, v.time, 0.09);
    s(dR.delayTime, v.time, 0.09);
    for (const n of [lpL, lpR]) s(n.frequency, v.lp);
    for (const n of [hpL, hpR]) s(n.frequency, v.hp);
    s(fLL.gain, v.ping ? 0 : fb);
    s(fRR.gain, v.ping ? 0 : fb);
    s(fLR.gain, v.ping ? fb : 0);
    s(fRL.gain, v.ping ? fb : 0);
    s(inL.gain, on);
    s(inR.gain, v.ping ? 0 : on);
    s(wowG.gain, v.wow * 35e-4);
    s(fluG.gain, v.flutter * 45e-5);
    if (v.drive !== drive) {
      drive = v.drive;
      const k = 1 + 3 * drive;
      const c = new Float32Array(1025);
      for (let i = 0; i < 1025; i++) c[i] = Math.tanh(k * (i / 512 - 1)) / k;
      shL.curve = c;
      shR.curve = c;
    }
  };
  D.dispose = () => {
    try {
      wow.stop();
      flu.stop();
      merge2.disconnect();
    } catch (e) {
    }
  };
  return D;
}
function makeIR(ctx, type, size) {
  const sr = ctx.sampleRate, dur = type === "spring" ? 1.2 + size * 2.6 : 0.7 + size * 4.6;
  const len = Math.floor(dur * sr), buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch), r = mulberry32(hash("ir", type, ch));
    if (type === "spring") {
      const T = 0.031 + 0.012 * ch + 0.02 * size, passes = Math.floor(dur / T);
      for (let k = 0; k < passes; k++) {
        const t0 = Math.floor(k * T * (1 + 0.013 * (r() - 0.5)) * sr), L = Math.floor(Math.min(T * (0.55 + 0.35 * k), T * 3.5) * sr);
        const amp = Math.pow(1e-3, k * T / dur) * (k ? 1 : 0.6), top = 4300 * Math.pow(0.93, k) + 500;
        let ph = r() * 6.28;
        for (let i = 0; i < L && t0 + i < len; i++) {
          const x = i / L, fq = 120 + (top - 120) * Math.pow(x, 1.7);
          ph += 2 * Math.PI * fq / sr;
          d[t0 + i] += Math.sin(ph) * amp * Math.sin(Math.PI * x) * (1 - 0.6 * x);
        }
      }
      let lp = 0;
      for (let i = 0; i < len; i++) {
        lp += (d[i] + (r() * 2 - 1) * 0.02 * Math.pow(1e-3, i / len) - lp) * 0.45;
        d[i] = lp;
      }
    } else {
      let lp = 0, lp2 = 0;
      for (let i = 0; i < len; i++) {
        const x = i / len, n = r() * 2 - 1;
        lp += (n - lp) * (0.75 - 0.6 * x);
        lp2 += (lp - lp2) * 0.9;
        d[i] = lp2 * Math.pow(1e-3, x) * Math.min(1, i / (4e-3 * sr));
      }
    }
    const fade = Math.floor(0.02 * sr);
    for (let i = 0; i < fade; i++) d[len - 1 - i] *= i / fade;
  }
  return buf;
}
function makeReverb(ctx) {
  const R = { in: ctx.createGain(), out: ctx.createGain(), pre: ctx.createBiquadFilter(), conv: ctx.createConvolver(), damp: ctx.createBiquadFilter(), key: "" };
  R.pre.type = "highpass";
  R.pre.Q.value = 0.6;
  R.damp.type = "lowpass";
  R.damp.Q.value = 0.6;
  R.in.connect(R.pre);
  R.pre.connect(R.conv);
  R.conv.connect(R.damp);
  R.damp.connect(R.out);
  R.setIR = (type, size) => {
    const key = type + ":" + Math.round(size * 40);
    if (key === R.key) return;
    R.key = key;
    R.conv.buffer = makeIR(ctx, type, Math.round(size * 40) / 40);
  };
  return R;
}
function makeMaster(ctx, dynamics = true) {
  const M = {
    in: ctx.createGain(),
    hp: ctx.createBiquadFilter(),
    lp: ctx.createBiquadFilter(),
    sat: ctx.createWaveShaper(),
    comp: ctx.createDynamicsCompressor(),
    post: ctx.createGain(),
    lim: ctx.createDynamicsCompressor(),
    clip: ctx.createWaveShaper(),
    vol: ctx.createGain(),
    satAmt: -1
  };
  M.hp.type = "highpass";
  M.lp.type = "lowpass";
  M.sat.oversample = "2x";
  M.comp.attack.value = 0.012;
  M.comp.release.value = 0.22;
  M.comp.knee.value = 10;
  M.lim.threshold.value = -2.5;
  M.lim.knee.value = 0;
  M.lim.ratio.value = 20;
  M.lim.attack.value = 2e-3;
  M.lim.release.value = 0.09;
  M.clip.curve = clipCurve();
  M.in.gain.value = 0.8;
  M.in.connect(M.hp);
  M.hp.connect(M.lp);
  if (dynamics) {
    M.lp.connect(M.sat);
    M.sat.connect(M.comp);
    M.comp.connect(M.post);
    M.post.connect(M.lim);
    M.lim.connect(M.clip);
  } else M.lp.connect(M.clip);
  M.clip.connect(M.vol);
  M.out = M.vol;
  return M;
}
function djFilter(dj) {
  const a = Math.abs(dj) < 0.03 ? 0 : (Math.abs(dj) - 0.03) / 0.97;
  return { hp: dj < 0 ? 20 * Math.pow(2, a * 7.6) : 20, lp: dj > 0 ? 2e4 * Math.pow(2, -a * 7) : 2e4, q: 0.7 + a * 1.6 };
}
const clamp$1 = (v, a, b) => Math.min(b, Math.max(a, v));
const TRIM = { kick: 1, bass: 1, stab: 1, pad: 1, hats: 1, rim: 1, perc: 1, air: 1, noise: 1, siren: 1 };
const stabCutoff = (x) => 200 * Math.pow(2, x * 5);
const delayTime = (S) => clamp$1(S.delay.sync === "free" || !SYNC[S.delay.sync] ? S.delay.free : SYNC[S.delay.sync][1] * 60 / S.tempo, 0.02, 3.8);
function buildGraph(ctx, { tape = false, audit = null, dynamics = true } = {}) {
  const sr = ctx.sampleRate, fmax = Math.min(18e3, sr * 0.42);
  const G = { ctx, tape, parts: {}, S: null, tun: null, throws: {}, pads: [], running: false };
  const gain = (v = 1) => {
    const n = ctx.createGain();
    n.gain.value = v;
    return n;
  };
  const biq = (type, q = 0.707) => {
    const n = ctx.createBiquadFilter();
    n.type = type;
    n.Q.value = q;
    return n;
  };
  const osc = (type) => {
    const n = ctx.createOscillator();
    n.type = type;
    return n;
  };
  const F = (hz, kind) => {
    if (audit) audit(hz, kind);
    return hz;
  };
  const snap = (hz, kind = "filter") => F(G.tun.snap(clamp$1(hz, 18, fmax)), kind);
  const white = ctx.createBuffer(1, sr * 2, sr);
  {
    const d = white.getChannelData(0), r = mulberry32(hash("white"));
    for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
  }
  const crackle = ctx.createBuffer(1, sr * 7, sr);
  {
    const d = crackle.getChannelData(0), r = mulberry32(hash("crackle"));
    let i = 0;
    while (i < d.length) {
      i += Math.floor(40 + Math.pow(r(), 3) * sr * 0.5);
      const a = (0.15 + 0.85 * Math.pow(r(), 4)) * (r() < 0.5 ? -1 : 1), n = 2 + Math.floor(r() * 10);
      for (let k = 0; k < n && i + k < d.length; k++) d[i + k] = a * (1 - k / n);
    }
  }
  const noiseSrc = (t, dur, k) => {
    const s = ctx.createBufferSource();
    s.buffer = white;
    s.start(t, k * 0.0731 % 1.6, dur + 0.05);
    return s;
  };
  const M = G.master = makeMaster(ctx, dynamics), D = G.delay = makeDelay(ctx, tape), R = G.reverb = makeReverb(ctx);
  G.out = M.out;
  D.out.connect(M.in);
  R.out.connect(M.in);
  const dlyRev = gain(0.22);
  D.out.connect(dlyRev);
  dlyRev.connect(R.in);
  for (const p of PARTS) {
    const P = G.parts[p] = { in: gain(1), level: gain(0), dly: gain(0), rev: gain(0) };
    P.level.connect(M.in);
    P.level.connect(P.dly);
    P.level.connect(P.rev);
    P.dly.connect(D.in);
    P.rev.connect(R.in);
  }
  const X = G.parts;
  const insert = (p, node) => {
    X[p].in.connect(node);
    node.connect(X[p].level);
    return node;
  };
  X.kick.lp = insert("kick", biq("lowpass", 0.6));
  X.stab.f = insert("stab", biq("lowpass", 2));
  X.hats.hp = insert("hats", biq("highpass", 0.7));
  X.air.hp = insert("air", biq("highpass", 0.9));
  X.siren.lp = insert("siren", biq("lowpass", 1.2));
  for (const p of ["bass", "pad", "rim", "perc", "noise"]) X[p].in.connect(X[p].level);
  const lfo = osc("sine"), lfoG = gain(0);
  lfo.connect(lfoG);
  lfoG.connect(X.stab.f.detune);
  lfo.start();
  const B = X.bass;
  B.o1 = osc("sine");
  B.o2 = osc("sine");
  B.g1 = gain(0.75);
  B.g2 = gain(0.45);
  B.amp = gain(0);
  B.lp = biq("lowpass", 0.8);
  B.duck = gain(1);
  B.o1.connect(B.g1);
  B.o2.connect(B.g2);
  B.g1.connect(B.lp);
  B.g2.connect(B.lp);
  B.lp.connect(B.amp);
  B.amp.connect(B.duck);
  B.duck.connect(B.in);
  B.o1.start();
  B.o2.start();
  B.last = -1;
  const N = X.noise;
  N.gate = gain(0);
  N.hiss = ctx.createBufferSource();
  N.hiss.buffer = white;
  N.hiss.loop = true;
  N.hissF = biq("bandpass", 0.5);
  N.hissG = gain(0.05);
  N.cr = ctx.createBufferSource();
  N.cr.buffer = crackle;
  N.cr.loop = true;
  N.crF = biq("highpass", 0.7);
  N.crG = gain(0);
  N.hiss.connect(N.hissF);
  N.hissF.connect(N.hissG);
  N.hissG.connect(N.gate);
  N.cr.connect(N.crF);
  N.crF.connect(N.crG);
  N.crG.connect(N.gate);
  N.gate.connect(N.in);
  N.hiss.start();
  N.cr.start();
  G.apply = (S, tun, t = ctx.currentTime, instant = false) => {
    G.S = S;
    G.tun = tun;
    const set = (p, v, tc = 0.03) => instant ? p.setValueAtTime(v, t) : p.setTargetAtTime(v, t, tc);
    const anySolo = PARTS.some((p) => S.parts[p].solo);
    for (const p of PARTS) {
      const P = S.parts[p], thr = G.throws[p];
      set(X[p].level.gain, P.mute || anySolo && !P.solo ? 0 : P.level * P.level * TRIM[p]);
      set(X[p].dly.gain, thr ? 1 : P.dly * P.dly, thr ? 8e-3 : 0.03);
      set(X[p].rev.gain, thr ? Math.max(0.5, P.rev * P.rev) : P.rev * P.rev, thr ? 8e-3 : 0.03);
    }
    const k = S.parts;
    set(X.kick.lp.frequency, snap(120 * Math.pow(2, k.kick.tone * 3.6)));
    set(B.lp.frequency, snap(70 * Math.pow(2, k.bass.filter * 4.3)));
    const shape = { sine: "sine", triangle: "triangle", saw: "sawtooth", square: "square" }[k.bass.shape] || "sine";
    if (B.o1.type !== shape) B.o1.type = shape;
    set(B.g1.gain, shape === "sine" ? 0.75 : shape === "triangle" ? 0.7 : 0.35);
    set(X.stab.f.frequency, snap(stabCutoff(k.stab.cutoff)));
    set(X.stab.f.Q, 0.5 + k.stab.res * k.stab.res * 14);
    set(lfo.frequency, clamp$1(k.stab.lfoRate, 5e-3, 12));
    set(lfoG.gain, k.stab.lfoDepth * 2400);
    set(X.hats.hp.frequency, snap(3e3 * Math.pow(2, k.hats.tone * 1.8)));
    set(X.air.hp.frequency, snap(11500));
    set(X.siren.lp.frequency, snap(2600));
    set(N.hissF.frequency, snap(4200));
    set(N.crF.frequency, snap(1e3));
    set(N.crG.gain, k.noise.density * 0.5);
    set(N.hissG.gain, 0.05);
    const d = S.delay;
    D.set({ time: delayTime(S), feedback: d.feedback, hp: snap(d.hp), lp: snap(d.lp), drive: d.sat, wow: d.wow, flutter: d.flutter, ping: d.ping ? 1 : 0, freeze: d.freeze ? 1 : 0 }, t, instant);
    set(D.out.gain, d.level);
    R.setIR(S.reverb.type === "spring" ? "spring" : "plate", S.reverb.size);
    set(R.pre.frequency, snap(180));
    set(R.damp.frequency, snap(900 * Math.pow(2, (1 - S.reverb.damp) * 3.6)));
    set(R.out.gain, S.reverb.level);
    const m = S.master, dj = djFilter(m.dj);
    set(M.hp.frequency, snap(dj.hp), 0.05);
    set(M.lp.frequency, snap(dj.lp), 0.05);
    set(M.hp.Q, dj.q);
    set(M.lp.Q, dj.q);
    if (m.sat !== M.satAmt) {
      M.satAmt = m.sat;
      M.sat.curve = satCurve(m.sat);
    }
    set(M.comp.threshold, -6 - m.comp * 14);
    set(M.comp.ratio, 1.5 + m.comp * 3);
    set(M.post.gain, Math.pow(10, -(1.5 + m.comp * 3) / 20));
    set(M.vol.gain, m.volume * m.volume);
  };
  G.setThrow = (part2, on, S, t = ctx.currentTime) => {
    G.throws[part2] = !!on;
    const P = S.parts[part2];
    X[part2].dly.gain.setTargetAtTime(on ? 1 : P.dly * P.dly, t, 8e-3);
    X[part2].rev.gain.setTargetAtTime(on ? Math.max(0.5, P.rev * P.rev) : P.rev * P.rev, t, 8e-3);
  };
  G.setRunning = (on, t = ctx.currentTime) => {
    G.running = on;
    N.gate.gain.setTargetAtTime(on ? 1 : 0, t, 0.02);
    if (!on) {
      B.amp.gain.setTargetAtTime(0, t, 0.03);
      G.fadePads(t);
    }
  };
  G.fadePads = (t = ctx.currentTime) => {
    for (const p of G.pads) {
      p.kill.gain.setTargetAtTime(0, t, 0.09);
    }
    G.pads = [];
  };
  const env = (peak, t, attack, decay) => {
    const a = gain(0);
    a.gain.setValueAtTime(1e-4, t);
    a.gain.exponentialRampToValueAtTime(Math.max(2e-4, peak), t + attack);
    a.gain.exponentialRampToValueAtTime(1e-4, t + attack + decay);
    return a;
  };
  const tone = (type, hz, t, end, kind, detune = 0) => {
    const o = osc(type);
    o.frequency.setValueAtTime(F(hz, kind), t);
    if (detune) o.detune.setValueAtTime(detune, t);
    o.start(t);
    o.stop(end);
    return o;
  };
  const V = {
    kick(ev, hz, t, sd, P) {
      const f1 = hz[0], f0 = f1 * (P.punch < 0.5 ? 2 : 4);
      const sweep = 0.05 + (1 - P.punch) * 0.09, dec = 0.12 + P.decay * 0.75, o = osc("sine"), a = env(0.95 * ev.vel, t, 6e-3, dec);
      o.frequency.setValueAtTime(F(f0, "kick"), t);
      o.frequency.exponentialRampToValueAtTime(F(f1, "kick"), t + sweep);
      o.connect(a);
      a.connect(X.kick.in);
      o.start(t);
      o.stop(t + dec + 0.05);
      if (P.punch > 0.05) {
        const c = noiseSrc(t, 0.01, ev.step), ca = env(0.5 * P.punch * ev.vel, t, 1e-3, 8e-3);
        c.connect(ca);
        ca.connect(X.kick.in);
      }
      B.duck.gain.setValueAtTime(0.4, t);
      B.duck.gain.linearRampToValueAtTime(1, t + 0.17);
    },
    bass(ev, hz, t, sd, P) {
      const f = F(hz[0], "bass"), len = Math.max(0.05, ev.len * sd);
      for (const o of [B.o1, B.o2]) {
        if (P.glide > 4e-3 && B.last >= 0) o.frequency.setTargetAtTime(f, t, P.glide / 3);
        else o.frequency.setValueAtTime(f, t);
      }
      B.last = f;
      B.amp.gain.setTargetAtTime(0.42 * ev.vel, t, 6e-3);
      B.amp.gain.setTargetAtTime(0, t + len - 0.012, 0.028);
    },
    stab(ev, hz, t, sd, P) {
      const len = clamp$1(P.length, 0.04, 2), cut = stabCutoff(P.cutoff), end = t + len + 0.06;
      const a = env(0.5 * ev.vel, t, 4e-3, len), vf = biq("lowpass", 0.5);
      vf.frequency.setValueAtTime(snap(cut * Math.pow(2, 0.4 + P.env * 2.6), "env"), t);
      vf.frequency.exponentialRampToValueAtTime(snap(cut * 0.8, "env"), t + len * 0.6);
      const g = gain(1 / Math.sqrt(hz.length));
      for (const f of hz) for (const det of [-P.detune, P.detune]) tone("sawtooth", f, t, end, "stab", det).connect(g);
      g.connect(vf);
      vf.connect(a);
      a.connect(X.stab.in);
    },
    pad(ev, hz, t, sd, P) {
      const dur = ev.len * sd, att = Math.min(1.6, dur * 0.35), rel = 2.2, end = t + dur + rel * 1.7, peak = 0.34 * ev.vel;
      const a = gain(0), kill = gain(1), vf = biq("lowpass", 0.7), g = gain(1 / Math.sqrt(Math.max(1, hz.length)));
      a.gain.setValueAtTime(0, t);
      a.gain.linearRampToValueAtTime(peak, t + att);
      a.gain.setValueAtTime(peak, t + Math.max(att, dur));
      a.gain.setTargetAtTime(0, t + Math.max(att, dur), rel / 3);
      vf.frequency.setValueAtTime(snap(300 * Math.pow(2, P.tone * 4)), t);
      hz.forEach((f, i) => {
        if (i < 2) {
          tone("triangle", f, t, end, "pad").connect(g);
          tone("sine", f, t, end, "pad").connect(g);
        } else for (const det of [-7, 7]) {
          const h = gain(0.5);
          tone("sawtooth", f, t, end, "pad", det).connect(h);
          h.connect(g);
        }
      });
      g.connect(vf);
      vf.connect(a);
      a.connect(kill);
      kill.connect(X.pad.in);
      G.pads = G.pads.filter((p) => p.end > t);
      G.pads.push({ kill, end });
    },
    closed(ev, hz, t, sd, P) {
      const dec = 0.02 + P.decay * 0.12, a = env(0.9 * ev.vel, t, 1e-3, dec);
      noiseSrc(t, dec, ev.step + 3).connect(a);
      a.connect(X.hats.in);
    },
    open(ev, hz, t, sd, P) {
      const dec = 0.15 + P.decay * 0.5, a = env(0.7 * ev.vel, t, 2e-3, dec);
      noiseSrc(t, dec, ev.step + 7).connect(a);
      a.connect(X.hats.in);
    },
    rim(ev, hz, t) {
      const a = env(0.6 * ev.vel, t, 1e-3, 0.035);
      tone("triangle", hz[0], t, t + 0.06, "rim").connect(a);
      a.connect(X.rim.in);
      const c = noiseSrc(t, 0.01, ev.step + 11), cf = biq("bandpass", 2), ca = env(0.5 * ev.vel, t, 1e-3, 0.012);
      cf.frequency.setValueAtTime(snap(hz[0] * 2), t);
      c.connect(cf);
      cf.connect(ca);
      ca.connect(X.rim.in);
    },
    clave(ev, hz, t) {
      const a = env(0.5 * ev.vel, t, 1e-3, 0.09);
      tone("sine", hz[0], t, t + 0.12, "clave").connect(a);
      a.connect(X.rim.in);
    },
    shaker(ev, hz, t) {
      const a = env(0.45 * ev.vel, t, 0.012, 0.05), f = biq("bandpass", 1.4);
      f.frequency.setValueAtTime(snap(6200), t);
      noiseSrc(t, 0.08, ev.step + 5).connect(f);
      f.connect(a);
      a.connect(X.perc.in);
    },
    conga(ev, hz, t) {
      const a = env(0.7 * ev.vel, t, 2e-3, 0.2);
      tone("sine", hz[0], t, t + 0.25, "conga").connect(a);
      a.connect(X.perc.in);
      const c = noiseSrc(t, 0.01, ev.step + 13), cf = biq("bandpass", 1.5), ca = env(0.12 * ev.vel, t, 1e-3, 0.01);
      cf.frequency.setValueAtTime(snap(hz[0] * 4), t);
      c.connect(cf);
      cf.connect(ca);
      ca.connect(X.perc.in);
    },
    air(ev, hz, t) {
      const dec = 0.03 + 0.05 * ev.vel, a = env(0.8 * ev.vel, t, 1e-3, dec);
      noiseSrc(t, dec, ev.step + 17).connect(a);
      a.connect(X.air.in);
    },
    siren(ev, hz, t, sd) {
      const dur = ev.len * sd, iv = sd / (ev.rate || 1), o = osc("square"), a = gain(0);
      o.frequency.setValueAtTime(F(hz[0], "siren"), t);
      F(hz[1], "siren");
      for (let k = 1; k * iv < dur; k++) o.frequency.setTargetAtTime(hz[k % 2], t + k * iv, iv * 0.2);
      a.gain.setValueAtTime(0, t);
      a.gain.linearRampToValueAtTime(0.2 * ev.vel, t + 0.02);
      a.gain.setTargetAtTime(0, t + dur, 0.03);
      o.connect(a);
      a.connect(X.siren.in);
      o.start(t);
      o.stop(t + dur + 0.3);
    },
    zap(ev, hz, t) {
      const o = osc("sine"), a = env(0.4 * ev.vel, t, 2e-3, 0.25);
      o.frequency.setValueAtTime(F(hz[0], "zap"), t);
      o.frequency.exponentialRampToValueAtTime(F(hz[1], "zap"), t + 0.14);
      o.connect(a);
      a.connect(X.siren.in);
      o.start(t);
      o.stop(t + 0.3);
    },
    pluck(ev, hz, t) {
      const a = env(0.4 * ev.vel, t, 2e-3, 0.3);
      tone("triangle", hz[0], t, t + 0.35, "pluck").connect(a);
      a.connect(X.siren.in);
    }
  };
  G.play = (ev, hz, t, sd, S) => {
    const v = V[ev.kind];
    if (v) v(ev, hz, t, sd, S.parts[ev.part]);
  };
  G.dispose = () => {
    for (const n of [lfo, B.o1, B.o2, N.hiss, N.cr]) {
      try {
        n.stop();
      } catch (e) {
      }
    }
    try {
      D.dispose();
      M.out.disconnect();
    } catch (e) {
    }
  };
  return G;
}
const TUNING_PATHS = /* @__PURE__ */ new Set(["key", "scale", "a4", "offsets", "custom"]);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
class DubEngine {
  constructor({ state = null, context: context2 = null, autoConnect = true, audit = null } = {}) {
    this.S = makeState(state);
    this.tun = tuningOf(this.S);
    this.ctx = context2;
    this.G = null;
    this.output = null;
    this.autoConnect = autoConnect;
    this.audit = audit;
    this.playing = false;
    this.version = 0;
    this.bar = 0;
    this.step = -1;
    this._on = /* @__PURE__ */ new Map();
    this._dest = [];
    this._pendTun = false;
    this._pendScene = null;
    this._forcePad = -1;
    this._barCache = null;
    this._vis = () => this._visibility();
    this.stats = { steps: 0, late: 0, skipped: 0 };
  }
  /* ── set-up ── */
  async init(context2) {
    if (this.G) return this;
    if (this._init) return this._init;
    this._init = (async () => {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      this.ctx = context2 || this.ctx || new AC({ latencyHint: "interactive" });
      this.tape = await loadWorklets(this.ctx);
      this.G = buildGraph(this.ctx, { tape: this.tape, audit: this.audit });
      this.G.apply(this.S, this.tun, this.ctx.currentTime, true);
      this.output = this.G.out;
      if (this.autoConnect) this.output.connect(this.ctx.destination);
      for (const n of this._dest) this.output.connect(n);
      this.sched = new Scheduler({ now: () => this.ctx.currentTime, stepDur: () => 15 / this.S.tempo, ahead: () => this._ahead(), onStep: (s, t, d) => this._step(s, t, d), onSkip: (n) => {
        this.stats.skipped += n;
      } });
      if (typeof document !== "undefined") document.addEventListener("visibilitychange", this._vis);
      this.emit("ready", { tape: this.tape });
      return this;
    })();
    return this._init;
  }
  connect(node) {
    if (this.output) this.output.connect(node);
    else this._dest.push(node);
    return node;
  }
  disconnect(node) {
    this._dest = this._dest.filter((n) => n !== node);
    if (this.output) {
      try {
        node ? this.output.disconnect(node) : this.output.disconnect();
      } catch (e) {
      }
    }
  }
  dispose() {
    this.stop();
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this._vis);
    if (this.G) this.G.dispose();
    this.G = null;
  }
  /* ── transport ── */
  async start() {
    if (!this.G) await this.init();
    if (this.playing) return;
    if (this.ctx.state !== "running") {
      try {
        await this.ctx.resume();
      } catch (e) {
      }
    }
    this.playing = true;
    this.bar = 0;
    this.step = -1;
    this._barCache = null;
    this._forcePad = -1;
    if (this._pendTun) {
      this.tun = tuningOf(this.S);
      this._pendTun = false;
    }
    this.G.apply(this.S, this.tun, this.ctx.currentTime);
    this.G.setRunning(true);
    this.emit("start", { time: this.ctx.currentTime + 0.12 });
    this.sched.start(0.12);
  }
  stop() {
    if (!this.playing) return;
    this.playing = false;
    this.sched.stop();
    this.G.setRunning(false);
    if (this._pendScene) {
      this.S.scene = this._pendScene;
      this._pendScene = null;
    }
    this.step = -1;
    this.emit("stop", { time: this.ctx.currentTime });
  }
  toggle() {
    return this.playing ? (this.stop(), false) : (this.start(), true);
  }
  /* ── state ── */
  get state() {
    return this.S;
  }
  getState() {
    return clone(this.S);
  }
  get(path) {
    return path.split(".").reduce((o, k) => o == null ? o : o[k], this.S);
  }
  set(path, value) {
    const keys = path.split("."), last = keys.pop();
    let o = this.S;
    for (const k of keys) {
      if (o[k] == null || typeof o[k] !== "object") o[k] = {};
      o = o[k];
    }
    if (o[last] === value) return;
    o[last] = value;
    this._changed(keys[0] || last, path);
  }
  /* Merge a patch (a preset, a saved state). Tuning changes wait for the bar line while playing. */
  patch(patch, name = "patch") {
    this.S = merge(this.S, patch);
    this.S.tempo = clamp(+this.S.tempo || 118, 60, 140);
    this._changed("*", name);
  }
  loadPreset(name, presets = PRESETS) {
    const p = presets[name];
    if (!p) return false;
    const base = clone(DEFAULTS), keep = this.S;
    const next = merge(base, p);
    for (const k of ["seed", "seedLock", "key", "scale", "a4", "offsets", "custom", "midi", "xy", "customProg"]) next[k] = keep[k];
    for (const part2 of PARTS) for (const k of ["lock", "mute", "solo", "out", "ch", "rotate"]) if (keep.parts[part2][k] !== void 0) next.parts[part2][k] = keep.parts[part2][k];
    next.master.volume = keep.master.volume;
    next.scene = keep.scene;
    this.S = next;
    this._changed("*", "preset");
    return true;
  }
  _changed(top, path) {
    this.version++;
    if (top === "*" || TUNING_PATHS.has(top)) {
      if (this.playing) this._pendTun = true;
      else this.tun = tuningOf(this.S);
    }
    if (this.G) this.G.apply(this.S, this.tun, this.ctx.currentTime);
    this.emit("change", { path });
  }
  setTempo(bpm) {
    this.set("tempo", clamp(Math.round(bpm * 10) / 10, 60, 140));
  }
  setKey(key) {
    const k = typeof key === "string" ? KEYS.findIndex((n) => n.toLowerCase() === key.toLowerCase().replace("#", "♯").replace(/b$/, "♭")) : key;
    if (k >= 0 && k < 12) this.set("key", k);
  }
  setScale(id) {
    if (scaleById(id, this.S.custom).id === id) this.set("scale", id);
  }
  setSeed(seed) {
    this.set("seed", Math.abs(Math.floor(+seed || 0)) % 1e5);
  }
  newSeed() {
    if (!this.S.seedLock) this.setSeed(hash(this.S.seed, "next") % 1e5);
    return this.S.seed;
  }
  setMute(part2, on) {
    this.set(`parts.${part2}.mute`, !!on);
  }
  setSolo(part2, on) {
    this.set(`parts.${part2}.solo`, !!on);
  }
  mute(part2, on = true) {
    this.setMute(part2, on);
  }
  unmute(part2) {
    this.setMute(part2, false);
  }
  /* Lock freezes a part's pattern as it is now: new seeds and its own variation no longer touch it. */
  setLock(part2, on) {
    const P = this.S.parts[part2];
    this.set(`parts.${part2}.lock`, on ? { seed: this.S.seed, epoch: epochAt(this.S.seed, part2, P.variation, Math.floor(this.bar / this.S.bars)) } : null);
  }
  /* Scenes change on the phrase line while playing. */
  setScene(name) {
    if (!this.playing) {
      this.set("scene", name);
      return;
    }
    this._pendScene = name === this.S.scene ? null : name;
    this.emit("change", { path: "scene" });
  }
  get pendingScene() {
    return this._pendScene;
  }
  /* Throw: send a part to the delay (and some reverb) for as long as it is held. */
  throwSend(part2, on) {
    if (this.G) this.G.setThrow(part2, on, this.S);
    this.emit("throw", { part: part2, on: !!on });
  }
  freeze(on) {
    this.set("delay.freeze", !!on);
  }
  /* ── events ── */
  on(name, fn) {
    if (!this._on.has(name)) this._on.set(name, /* @__PURE__ */ new Set());
    this._on.get(name).add(fn);
    return () => this.off(name, fn);
  }
  off(name, fn) {
    const s = this._on.get(name);
    if (s) s.delete(fn);
  }
  emit(name, data) {
    const s = this._on.get(name);
    if (s) for (const fn of s) {
      try {
        fn(data);
      } catch (e) {
        console.error(e);
      }
    }
  }
  /* ── what the display needs ── */
  displayBar(part2, bar = this.bar) {
    return displayBar(this.S, this.tun, part2, bar, {});
  }
  get phrase() {
    return Math.floor(this.bar / this.S.bars);
  }
  meter() {
    return this.G ? { reduction: this.G.master.lim.reduction || 0 } : { reduction: 0 };
  }
  /* ── scheduling ── */
  _ahead() {
    const hidden = typeof document !== "undefined" && document.hidden;
    return Math.max(0.14, Math.min(2.5, (this.sched.gap || 0) * 1.6 + 0.05), hidden ? 2 : 0);
  }
  _visibility() {
    if (!this.ctx) return;
    if (document.hidden) {
      if (this.playing) this.sched.tick();
    } else if (this.playing && this.ctx.state !== "running") this.ctx.resume().catch(() => {
    });
  }
  _step(n, time, sd) {
    const bar = Math.floor(n / STEPS), s = n % STEPS, S = this.S;
    this.stats.steps++;
    if (time < this.ctx.currentTime) this.stats.late++;
    if (s === 0 || bar !== this.bar) this._barLine(bar, time);
    let c = this._barCache;
    if (!c || c.bar !== bar || c.version !== this.version) c = this._barCache = { bar, version: this.version, evs: barEvents(S, this.tun, bar, { forcePad: this._forcePad === bar }) };
    const t = time + (s % 2 ? S.swing * sd * SWING : 0);
    const anySolo = PARTS.some((p) => S.parts[p].solo);
    for (const ev of c.evs) {
      if (ev.step !== s) continue;
      const P = S.parts[ev.part];
      if (P.mute || anySolo && !P.solo) continue;
      const hz = pitchesOf(this.tun, ev);
      if (P.out !== "midi") this.G.play(ev, hz, t, sd, S);
      const e = { part: ev.part, kind: ev.kind, time: t, vel: ev.vel, bar, step: s, dur: ev.len * sd, sd, hz, notes: ev.notes.map((x) => this.tun.midi(x.deg, x.oct)), tonic: this.tun.midi(0, 4), rate: ev.rate, out: P.out };
      this.emit(ev.part, e);
      this.emit("note", e);
    }
    this.step = s;
    this.emit("step", { step: s, bar, time, swung: t, dur: sd });
  }
  _barLine(bar, time) {
    const S = this.S;
    this.bar = bar;
    if (this._pendTun) {
      this._pendTun = false;
      this.tun = tuningOf(S);
      this.version++;
      this.G.apply(S, this.tun, time);
      this.G.fadePads(time);
      this._forcePad = bar;
      this.emit("retune", { time, key: S.key, scale: S.scale });
    }
    if (bar % S.bars === 0) {
      const sc = this._pendScene || (S.auto ? autoScene(S, bar) : null);
      this._pendScene = null;
      if (sc && sc !== S.scene) {
        S.scene = sc;
        this.version++;
        this.emit("scene", { scene: sc, time });
        this.emit("change", { path: "scene" });
      }
    }
    this.emit("bar", { bar, time, phrase: Math.floor(bar / S.bars), barInPhrase: bar % S.bars });
  }
}
const setPath = (S, path, value) => {
  const k = path.split("."), last = k.pop();
  let o = S;
  for (const x of k) o = o[x];
  o[last] = value;
};
const TUNING = /^(key|scale|a4|offsets|custom)/;
async function renderOffline(state, { bars = 4, startBar = 0, tail = 0, sampleRate = 44100, timeline = [], solo = null, dynamics = true, audit = null, tape = true } = {}) {
  const S = clone(state);
  if (solo) for (const p of PARTS) {
    S.parts[p].solo = p === solo;
    S.parts[p].mute = S.parts[p].mute && p === solo;
  }
  let tun = tuningOf(S), total = 0;
  {
    const T = clone(S);
    for (let b = 0; b < bars; b++) {
      for (const m of timeline) if (m.bar === b && m.set && m.set.tempo) T.tempo = m.set.tempo;
      total += STEPS * 15 / T.tempo;
    }
  }
  const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  const ctx = new OAC(2, Math.ceil((total + tail) * sampleRate), sampleRate);
  const hasTape = tape ? await loadWorklets(ctx) : false;
  const G = buildGraph(ctx, { tape: hasTape, audit, dynamics });
  G.apply(S, tun, 0, true);
  G.setRunning(true, 0);
  G.out.connect(ctx.destination);
  const events = [];
  let t = 0, forcePad = false;
  for (let b = 0; b < bars; b++) {
    const sd0 = 15 / S.tempo, moves = timeline.filter((m) => m.bar === b).sort((x, y) => (x.step || 0) - (y.step || 0));
    for (const m of moves) {
      const at = t + (m.step || 0) * sd0;
      let retune = false;
      for (const [path, v] of Object.entries(m.set || {})) {
        setPath(S, path, v);
        if (TUNING.test(path)) retune = true;
      }
      if (retune) {
        tun = tuningOf(S);
        if (!(m.step > 0)) {
          G.fadePads(at);
          forcePad = true;
        }
      }
      for (const [part2, on] of Object.entries(m.throw || {})) G.throws[part2] = !!on;
      G.apply(S, tun, at);
    }
    const sd = 15 / S.tempo, bar = startBar + b, scene = S.auto ? autoScene(S, bar) : S.scene;
    const anySolo = PARTS.some((p) => S.parts[p].solo);
    for (const ev of barEvents(S, tun, bar, { scene, forcePad })) {
      const P = S.parts[ev.part];
      if (P.mute || anySolo && !P.solo) continue;
      const time = t + ev.step * sd + (ev.step % 2 ? S.swing * sd * SWING : 0), hz = pitchesOf(tun, ev);
      G.play(ev, hz, time, sd, S);
      events.push({ part: ev.part, kind: ev.kind, time, bar, step: ev.step, vel: ev.vel, hz });
    }
    forcePad = false;
    t += STEPS * sd;
  }
  G.setRunning(false, t);
  const buffer = await ctx.startRendering();
  return { buffer, seconds: t, events, tape: hasTape, sampleRate };
}
function encodeWav(channels, sampleRate, bits = 24) {
  const n = channels[0].length, nc = channels.length, bps = bits / 8, size = n * nc * bps;
  const buf = new ArrayBuffer(44 + size), v = new DataView(buf);
  const str = (o2, s) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o2 + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, 36 + size, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, nc, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * nc * bps, true);
  v.setUint16(32, nc * bps, true);
  v.setUint16(34, bits, true);
  str(36, "data");
  v.setUint32(40, size, true);
  let o = 44;
  const max = bits === 16 ? 32767 : 8388607;
  for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) {
    const x = Math.max(-1, Math.min(1, channels[c][i])), s = Math.round(x * max);
    if (bits === 16) {
      v.setInt16(o, s, true);
      o += 2;
    } else {
      v.setUint8(o, s & 255);
      v.setUint8(o + 1, s >> 8 & 255);
      v.setUint8(o + 2, s >> 16 & 255);
      o += 3;
    }
  }
  return new Uint8Array(buf);
}
function foldLoop(channels, loopLen) {
  return channels.map((src) => {
    const out = new Float32Array(loopLen);
    for (let i = 0; i < src.length; i++) out[i % loopLen] += src[i];
    return out;
  });
}
const peakOf = (channels) => {
  let p = 0;
  for (const c of channels) for (let i = 0; i < c.length; i++) {
    const a = Math.abs(c[i]);
    if (a > p) p = a;
  }
  return p;
};
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(u8) {
  let c = 4294967295;
  for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ c >>> 8;
  return (c ^ 4294967295) >>> 0;
}
function zip(files) {
  const enc = new TextEncoder(), parts = [], central = [];
  let off = 0;
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 67324752, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 2048, true);
    h.setUint16(8, 0, true);
    h.setUint32(10, 2162688, true);
    h.setUint32(14, crc, true);
    h.setUint32(18, f.data.length, true);
    h.setUint32(22, f.data.length, true);
    h.setUint16(26, name.length, true);
    parts.push(new Uint8Array(h.buffer), name, f.data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 33639248, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 2048, true);
    c.setUint32(12, 2162688, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, f.data.length, true);
    c.setUint32(24, f.data.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), name);
    off += 30 + name.length + f.data.length;
  }
  const csize = central.reduce((a, b) => a + b.length, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 101010256, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, csize, true);
  e.setUint32(16, off, true);
  const all = [...parts, ...central, new Uint8Array(e.buffer)], out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
  let o = 0;
  for (const p of all) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
async function renderLoop(state, { phrase = 0, sampleRate = 44100, solo = null, dynamics = true, tailSeconds = 8 } = {}) {
  const S = clone(state);
  S.delay.freeze = false;
  S.auto = false;
  const loopSec = S.bars * 16 * 15 / S.tempo;
  const tail = Math.ceil(tailSeconds / loopSec) * loopSec;
  const r = await renderOffline(S, { bars: S.bars, startBar: phrase * S.bars, tail, sampleRate, solo, dynamics });
  const loopLen = Math.round(loopSec * sampleRate);
  const raw = [r.buffer.getChannelData(0), r.buffer.getChannelData(1)];
  const fade = Math.min(raw[0].length, Math.floor(0.05 * sampleRate));
  for (const c of raw) for (let i = 0; i < fade; i++) c[c.length - 1 - i] *= i / fade;
  const channels = foldLoop(raw, loopLen), peak = peakOf(channels);
  if (peak > 0.97) {
    const k = 0.97 / peak;
    for (const c of channels) for (let i = 0; i < c.length; i++) c[i] *= k;
  }
  return { channels, sampleRate, seconds: loopSec, peak, events: r.events };
}
async function renderStems(state, opt = {}) {
  const out = [];
  for (const part2 of PARTS) {
    if (state.parts[part2].mute) continue;
    const r = await renderLoop(state, { ...opt, solo: part2, dynamics: false });
    if (r.peak > 1e-5) out.push({ part: part2, ...r });
  }
  return out;
}
export {
  COMMA,
  DEFAULTS,
  DubEngine,
  KEYS,
  PARTS,
  PART_NAMES,
  PRESETS,
  SCALES,
  SWING,
  Tuning,
  barEvents,
  crc32,
  DubEngine as default,
  displayBar,
  encodeWav,
  foldLoop,
  makeIR,
  makeState,
  parseScale,
  peakOf,
  pitchesOf,
  renderLoop,
  renderOffline,
  renderStems,
  tuningOf,
  zip
};
