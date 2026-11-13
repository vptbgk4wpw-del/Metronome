/* Tuning engine. A scale is a list of distances from the tonic in cents, so equal temperament is only
   one case among others and makam or qenet scales go through exactly the same code.

   Nothing else in Dub stores an absolute pitch. A pitched sound is a scale degree plus an octave, and
   Tuning.hz() is the one place where that becomes a frequency. Filters that ring (delay loop, reverb,
   noise) are pulled onto scale tones with Tuning.snap(). */

export const COMMA = 1200 / 53;   // Holdrian comma, the unit of AEU makam theory

const tet = (...semis) => semis.map(s => s * 100);
const aeu = (...commas) => { const out = [0]; let c = 0; for (let i = 0; i < commas.length - 1; i++) { c += commas[i]; out.push(c * COMMA); } return out; };

export const SCALES = [
  { id: 'aeolian',   name: 'Aeolian',          group: 'Western',  cents: tet(0, 2, 3, 5, 7, 8, 10) },
  { id: 'dorian',    name: 'Dorian',           group: 'Western',  cents: tet(0, 2, 3, 5, 7, 9, 10) },
  { id: 'phrygian',  name: 'Phrygian',         group: 'Western',  cents: tet(0, 1, 3, 5, 7, 8, 10) },
  { id: 'harmonic',  name: 'Harmonic minor',   group: 'Western',  cents: tet(0, 2, 3, 5, 7, 8, 11) },
  { id: 'minpent',   name: 'Minor pentatonic', group: 'Western',  cents: tet(0, 3, 5, 7, 10) },
  { id: 'mixolydian', name: 'Mixolydian',      group: 'Western',  cents: tet(0, 2, 4, 5, 7, 9, 10) },
  { id: 'major',     name: 'Major',            group: 'Western',  cents: tet(0, 2, 4, 5, 7, 9, 11) },
  { id: 'rast',      name: 'Rast',             group: 'Makam',    cents: aeu(9, 8, 5, 9, 9, 8, 5),  commas: [9, 8, 5, 9, 9, 8, 5] },
  { id: 'ussak',     name: 'Uşşak',            group: 'Makam',    cents: aeu(8, 5, 9, 9, 4, 9, 9),  commas: [8, 5, 9, 9, 4, 9, 9] },
  { id: 'huseyni',   name: 'Hüseyni',          group: 'Makam',    cents: aeu(8, 5, 9, 9, 8, 5, 9),  commas: [8, 5, 9, 9, 8, 5, 9] },
  { id: 'hicaz',     name: 'Hicaz',            group: 'Makam',    cents: aeu(5, 12, 5, 9, 4, 9, 9), commas: [5, 12, 5, 9, 4, 9, 9] },
  { id: 'kurdi',     name: 'Kürdi',            group: 'Makam',    cents: aeu(4, 9, 9, 9, 4, 9, 9),  commas: [4, 9, 9, 9, 4, 9, 9] },
  { id: 'saba',      name: 'Saba',             group: 'Makam',    cents: aeu(8, 5, 5, 13, 4, 9, 9), commas: [8, 5, 5, 13, 4, 9, 9] },
  { id: 'tizitamaj', name: 'Tizita major',     group: 'Qenet',    cents: [0, 200, 400, 700, 900] },
  { id: 'tizitamin', name: 'Tizita minor',     group: 'Qenet',    cents: [0, 200, 300, 700, 800] },
  { id: 'batimaj',   name: 'Bati major',       group: 'Qenet',    cents: [0, 400, 500, 700, 1100] },
  { id: 'batimin',   name: 'Bati minor',       group: 'Qenet',    cents: [0, 300, 500, 700, 1000] },
  { id: 'ambassel',  name: 'Ambassel',         group: 'Qenet',    cents: [0, 100, 500, 700, 800] },
  { id: 'anchihoye', name: 'Anchihoye',        group: 'Qenet',    cents: [0, 100, 500, 600, 900] },
];
export const SCALE_GROUPS = ['Western', 'Makam', 'Qenet'];
export const KEYS = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const A4_MIN = 430, A4_MAX = 450, OFFSET_MAX = 50;

const mod = (a, n) => ((a % n) + n) % n;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const log2 = Math.log2;

/* "0 150 350 500 700 850 1000" → a custom scale, or null when the text is not a rising list inside one octave. */
export function parseScale(text) {
  const nums = String(text).split(/[\s,;]+/).filter(Boolean).map(Number);
  if (nums.length < 2 || nums.length > 24 || nums.some(n => !isFinite(n))) return null;
  if (nums[0] !== 0) nums.unshift(0);
  if (nums[nums.length - 1] === 1200) nums.pop();
  for (let i = 1; i < nums.length; i++) if (!(nums[i] > nums[i - 1]) || nums[i] >= 1200) return null;
  return nums.length >= 2 ? nums : null;
}

export class Tuning {
  /* key: pitch class 0–11 (C = 0). scale: an entry of SCALES or a custom { id, name, cents }.
     offsets: per-degree correction in cents (±50). a4: reference pitch in Hz. */
  constructor({ key = 9, scale = SCALES[0], a4 = 440, offsets = null } = {}) {
    this.key = mod(Math.round(key), 12);
    this.scale = scale;
    this.a4 = clamp(a4, A4_MIN, A4_MAX);
    this.n = scale.cents.length;
    this.offsets = scale.cents.map((_, i) => clamp((offsets && +offsets[i]) || 0, -OFFSET_MAX, OFFSET_MAX));
    this.cents = scale.cents.map((c, i) => c + this.offsets[i]);          // one octave, tonic first
    this.root0 = this.a4 * Math.pow(2, (this.key - 9) / 12 - 4);            // tonic in octave 0; the key itself sits on the 12-TET grid
    this.micro = this.cents.some(c => Math.abs(c - Math.round(c / 100) * 100) > 0.5);
  }

  /* Cents above the tonic of octave 0 for a scale degree (any integer, degrees wrap into higher octaves). */
  degCents(deg, oct = 0) {
    const d = Math.round(deg);
    return (Math.floor(d / this.n) + oct) * 1200 + this.cents[mod(d, this.n)];
  }

  /* THE place where a degree becomes a frequency. */
  hz(deg, oct = 0) { return this.root0 * Math.pow(2, this.degCents(deg, oct) / 1200); }

  /* Lowest octave whose tonic is at or above lowHz: parts name a register, never a pitch. */
  registerOct(lowHz) { return Math.ceil(log2(lowHz / this.root0) - 1e-9); }

  /* Cents above the tonic of octave 0. */
  centsOf(hz) { return 1200 * log2(hz / this.root0); }

  /* Distance in cents from the nearest scale tone (always ≥ 0). */
  error(hz) {
    const c = mod(this.centsOf(hz), 1200);
    let best = Infinity;
    for (const s of this.cents) { const d = Math.abs(c - s); best = Math.min(best, d, 1200 - d); }
    return best;
  }

  /* Nearest scale tone as { deg, oct } and as a frequency. Used for everything that resonates. */
  nearest(hz) {
    const c = this.centsOf(hz), o = Math.floor(c / 1200);
    let best = null, bd = Infinity;
    for (let oo = o - 1; oo <= o + 1; oo++) for (let i = 0; i < this.n; i++) {
      const d = Math.abs(oo * 1200 + this.cents[i] - c);
      if (d < bd) { bd = d; best = { deg: i, oct: oo }; }
    }
    return best;
  }
  snap(hz) { const p = this.nearest(hz); return this.hz(p.deg, p.oct); }

  /* A heptatonic step (0 = tonic, 2 = third, 4 = fifth, 7 = octave, negative = below) as an index into this
     scale. Identity for seven-tone scales, proportional for pentatonics and custom scales, so chords are
     always built by stacking degrees of the scale in use. */
  step(h) { return Math.round(h * this.n / 7); }

  /* The scale tone that works as a fifth above a degree: the one within 60 cents of 3:2, otherwise the
     fourth, otherwise the octave. Returned as an absolute degree index above deg. */
  fifthOf(deg = 0) {
    const d = Math.round(deg), base = this.degCents(d);
    const near = (target) => { let bi = null, bd = 60; for (let j = d + 1; j < d + this.n; j++) { const e = Math.abs(this.degCents(j) - base - target); if (e <= bd) { bd = e; bi = j; } } return bi; };
    let j = near(701.955); if (j == null) j = near(498.045); if (j == null) j = d + this.n;
    return j;
  }

  /* Lowest octave in which a degree sounds at or above lowHz. */
  octFor(deg, lowHz) { return Math.ceil((1200 * Math.log2(lowHz / this.root0) - this.degCents(deg, 0)) / 1200 - 1e-9); }

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
      for (let i = 0; i < this.n; i++) { const f = this.hz(i, o); if (f >= lo && f <= hi) out.push(f); }
    }
    return out;
  }
}

export const scaleById = (id, custom = []) => SCALES.find(s => s.id === id) || custom.find(s => s.id === id) || SCALES[0];
