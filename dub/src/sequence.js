/* Pattern generator. Pure functions: state + tuning + bar number in, events out. No audio, no clock,
   no Math.random. Every pitched event carries scale degrees and octaves, never frequencies.

   A pattern is a list of candidate hits. Each hit has a rank (0 = essential, towards 1 = decoration) and a
   probability. Density decides how far down the ranks a part plays, so turning Density up reveals more of
   the same pattern instead of reshuffling it. Scene and Intensity scale density per part. */
import { rng, rand, pick, shuffle } from './prng.js';
import { PARTS } from './state.js';

export const STEPS = 16;

/* Registers: the lowest frequency a part's tonic may have. Parts name a register, the tuning names the pitch. */
export const REG = { sub: 41, conga: 185, pad: 110, stab: 165, siren: 440, pluck: 440, rim: 1400, clave: 2000 };

/* Scene: how much of each part plays. Intensity gate: below this Intensity a part stays out. */
export const SCENES = {
  intro:  { kick: 0, bass: 0, stab: 0.6, pad: 1, hats: 0.5, rim: 0, perc: 0, air: 0.9, noise: 1, siren: 0.6 },
  groove: { kick: 1, bass: 1, stab: 1, pad: 1, hats: 1, rim: 1, perc: 1, air: 1, noise: 1, siren: 1 },
  break:  { kick: 0, bass: 0, stab: 1, pad: 1, hats: 0.45, rim: 0.6, perc: 0.7, air: 1.1, noise: 1, siren: 1.3 },
  drop:   { kick: 1.25, bass: 1.25, stab: 1.2, pad: 0.8, hats: 1.3, rim: 1.2, perc: 1.3, air: 1.2, noise: 1, siren: 1 },
};
export const SCENE_ORDER = ['intro', 'groove', 'break', 'drop'];
const GATE = { kick: 0.15, bass: 0.1, stab: 0.05, pad: 0, hats: 0.2, rim: 0.3, perc: 0.4, air: 0.5, noise: 0, siren: 0.55 };

export function effDensity(S, part, scene = S.scene) {
  if (S.intensity < GATE[part]) return 0;
  const m = (SCENES[scene] || SCENES.groove)[part];
  return S.parts[part].density * m * (0.55 + 0.75 * S.intensity);
}

/* Scene by bar when Auto is on: Intro once, then Groove, Break, Drop in a loop. */
export function autoScene(S, absBar) {
  const k = Math.floor(absBar / Math.max(1, S.autoBars));
  return k === 0 ? 'intro' : ['groove', 'break', 'drop'][(k - 1) % 3];
}

/* ── harmony ── */

/* Progressions as heptatonic numerals (0 = i) with bars per chord. Numerals from v upwards sit below the tonic. */
export const PROGRESSIONS = {
  'i': [[0, 1]],
  'i-VII': [[0, 2], [-1, 2]],
  'i-iv': [[0, 2], [3, 2]],
  'i-v': [[0, 2], [-3, 2]],
  'i-VI-VII': [[0, 2], [-2, 1], [-1, 1]],
};
/* "1:2 7:1 6:1" → [[0,2],[-1,1],[-2,1]] */
export function parseProgression(text) {
  const out = [];
  for (const tok of String(text || '').split(/[\s,;]+/).filter(Boolean)) {
    const m = /^([1-7])(?::(\d{1,2}))?$/.exec(tok);
    if (!m) return null;
    const h = +m[1] - 1;
    out.push([h >= 4 ? h - 7 : h, Math.max(1, Math.min(16, +(m[2] || 1)))]);
  }
  return out.length ? out : null;
}
export function progressionOf(S) {
  if (S.progression === 'custom') return parseProgression(S.customProg) || PROGRESSIONS.i;
  return PROGRESSIONS[S.progression] || PROGRESSIONS.i;
}
/* Heptatonic numeral of the chord sounding in a bar. */
export function chordAt(S, absBar) {
  const prog = progressionOf(S), total = prog.reduce((a, c) => a + c[1], 0);
  let pos = ((absBar % total) + total) % total;
  for (const [h, bars] of prog) { if (pos < bars) return h; pos -= bars; }
  return 0;
}

/* Voicings as heptatonic steps above the chord root. '5' is the scale's own fifth above the root. */
export const VOICINGS = {
  m79: [0, 2, 4, 6, 8],
  sus: [0, 3, 4, 8],
  fifths: [0, '5', 7, '5+'],
  cluster: [0, 1, 2, 4],
  stack: [0, 2, 4, 6, 8, 10, 12],
};
export const voicingOf = (S, tun) => (S.voicing === 'auto' || !VOICINGS[S.voicing]) ? (tun.micro ? 'fifths' : 'm79') : S.voicing;
/* Scale degrees of a chord on a root degree: stacked from the scale in use, never from a semitone table. */
export function chordDegrees(S, tun, root) {
  const out = [];
  for (const s of VOICINGS[voicingOf(S, tun)]) {
    const d = s === '5' ? tun.fifthOf(root) : s === '5+' ? tun.fifthOf(root) + tun.n : root + tun.step(s);
    if (!out.includes(d)) out.push(d);
  }
  return out;
}

/* ── rhythm ── */

export function euclid(k, n, rot = 0) {
  const out = [];
  for (let i = 0; i < n; i++) if ((((i - rot) % n + n) % n * k) % n < k) out.push(i);
  return out;
}

const H = (step, rank, p, v, extra) => ({ step, rank, p, v, len: 1, kind: '', notes: null, ...extra });

const KICK = {
  four:     { core: [[0, 1], [4, 0.9], [8, 0.95], [12, 0.9]], extra: [[14, 0.55], [11, 0.5], [7, 0.5], [15, 0.45]] },
  steppers: { core: [[0, 1], [4, 0.95], [8, 1], [12, 0.95]],  extra: [[15, 0.5], [10, 0.5], [6, 0.45], [14, 0.5]] },
  onedrop:  { core: [[8, 1]],                                   extra: [[15, 0.5], [0, 0.8], [11, 0.5], [14, 0.45]] },
  rockers:  { core: [[0, 1], [8, 0.95]],                        extra: [[10, 0.6], [15, 0.5], [6, 0.5], [3, 0.45]] },
  half:     { core: [[0, 1]],                                   extra: [[10, 0.7], [7, 0.55], [14, 0.5], [3, 0.45]] },
};
const BACKBEAT = { four: [[4, 12], 0.42], steppers: [[8], 0.1], onedrop: [[8], 0.05], rockers: [[4, 12], 0.1], half: [[8], 0.1] };

function context(part, S, tun, seed, epoch, phrase) {
  const base = phrase * S.bars;
  return {
    part, S, tun, n: tun.n, bars: S.bars, style: KICK[S.style] ? S.style : 'four', base,
    B: (...k) => rng(seed, part, 'base', ...k),                 // what the pattern is
    V: (...k) => rng(seed, part, 'var', epoch, ...k),           // how this variation differs
    root: (bip) => tun.step(chordAt(S, base + bip)),            // chord root as a degree of the scale
    each: (fn) => Array.from({ length: S.bars }, (_, b) => fn(b)),
  };
}

function genKick(c) {
  const T = KICK[c.style], extra = shuffle(c.B('extra'), T.extra);
  const deg = c.S.parts.kick.tune === 'fifth' ? c.tun.fifthOf(0) : 0;
  const note = { deg, oct: c.tun.octFor(deg, REG.sub) };
  return c.each((b) => {
    const hits = T.core.map(([s, v]) => H(s, 0, 1, v));
    extra.forEach(([s, v], i) => hits.push(H(s, 0.62 + i * 0.1, 0.6, v)));
    if (c.bars > 1 && b === c.bars - 1) { const [s, v] = pick(c.V('fill'), T.extra); hits.push(H(s, 0.4, 0.8, v)); }
    hits.forEach(h => { h.notes = [note]; });
    return hits;
  });
}

/* Bass by rule: the root lands on the one and holds, a fifth or a seventh below answers late in the bar,
   rests outrank notes, and the last bar of the phrase walks into the next root through scale tones. */
function genBass(c) {
  const { tun, n } = c, r = c.B('motif');
  const sparse = c.style === 'onedrop' || c.style === 'half';
  const N = (step, len, d, rank, v) => ({ step, len, d, rank, p: 1, v });
  const A = [];
  if (r() < (sparse ? 0.7 : 0.4)) {                 // anchor: one long root, two late answers
    A.push(N(0, 4 + Math.floor(r() * 3), 'r', 0, 1));
    A.push(N(pick(r, [7, 8, 10]), 2, r() < 0.5 ? 'r' : '5', 0.3, 0.8));
    A.push(N(pick(r, [11, 12]), 3, r() < 0.6 ? '5' : '7', 0.45, 0.85));
    A.push(N(14, 2, r() < 0.5 ? '7' : 'r', 0.78, 0.7));
  } else {                                          // pulse: short roots, answers on the back half
    A.push(N(0, 3, 'r', 0, 1));
    A.push(N(pick(r, [3, 4, 6]), 2, 'r', 0.25, 0.8));
    A.push(N(pick(r, [8, 10]), 2, pick(r, ['5', 'r', '3']), 0.4, 0.85));
    A.push(N(pick(r, [11, 12]), 2, pick(r, ['7', '5']), 0.55, 0.8));
    A.push(N(pick(r, [14, 15]), 1, pick(r, ['r', '8']), 0.8, 0.65));
  }
  const oct = tun.registerOct(REG.sub) + (c.S.parts.bass.octave | 0);
  const fit = (deg) => { let d = deg; while (tun.hz(d, oct) < 34) d += n; return { deg: d, oct }; };
  const degOf = (d, R) => d === 'r' ? R : d === '5' ? tun.fifthOf(R) - n : d === '7' ? R + tun.step(6) - n : d === '3' ? R + tun.step(2) : R + n;
  return c.each((b) => {
    let hits = A.map(h => ({ ...h }));
    if (b % 2 === 1) {                               // every second bar answers differently
      const v = c.V('alt', b), i = 1 + Math.floor(v() * (hits.length - 1));
      hits[i].d = hits[i].d === '5' ? '7' : hits[i].d === '7' ? '5' : (v() < 0.5 ? '5' : hits[i].d);
    }
    const R = c.root(b);
    hits.forEach(h => { h.abs = degOf(h.d, R); });
    if (c.bars > 1 && b === c.bars - 1) {            // turnaround: two scale steps into the next root
      const next = tun.step(chordAt(c.S, c.base + c.bars)), up = c.V('turn')() < 0.35;
      hits = hits.filter(h => h.step < 11);
      hits.push({ step: 12, len: 2, abs: next + (up ? 2 : -2), rank: 0.42, p: 1, v: 0.75 });
      hits.push({ step: 14, len: 2, abs: next + (up ? 1 : -1), rank: 0.52, p: 1, v: 0.8 });
    }
    return hits.map(h => H(h.step, h.rank, h.p, h.v, { len: h.len, notes: [fit(h.abs)] }));
  });
}

const STAB_CELLS = [[2, 10], [2], [2, 10, 13], [6], [3, 11], [6, 14], [2, 7], [10], [3, 6]];
function genStab(c) {
  const r = c.B('cell'), cellA = pick(r, STAB_CELLS), cellB = pick(r, STAB_CELLS);
  const oct = c.tun.registerOct(REG.stab);
  return c.each((b) => {
    const cell = (b >> 1) % 2 ? cellB : cellA, v = c.V('vel', b);
    const notes = chordDegrees(c.S, c.tun, c.root(b)).map(deg => ({ deg, oct }));
    const hits = cell.map((s, i) => H(s, [0, 0.35, 0.6][i], 1, 0.65 + 0.35 * v(), { notes }));
    hits.push(H(pick(v, [5, 7, 13, 14, 15]), 0.8, 0.5, 0.45, { notes }));
    return hits;
  });
}

/* Pad: one long event per chord, re-struck every second bar. Tones carry their own rank: Density is the number of voices. */
function genPad(c) {
  const { tun, n } = c, oct = tun.registerOct(REG.pad);
  const starts = [];
  for (let b = 0; b < c.bars; b++) if (b === 0 || c.root(b) !== c.root(b - 1) || b % 2 === 0) starts.push(b);
  return c.each((b) => {
    const i = starts.indexOf(b);
    if (i < 0) return [];
    const R = c.root(b), end = i + 1 < starts.length ? starts[i + 1] : c.bars;
    const upper = chordDegrees(c.S, tun, R).filter(d => d !== R);
    const notes = [{ deg: R, oct: oct - 1, rank: 0 }, { deg: tun.fifthOf(R), oct: oct - 1, rank: 0.15 }, { deg: R, oct, rank: 0.3 }];
    upper.forEach((deg, k) => notes.push({ deg, oct, rank: 0.4 + k * 0.12 }));
    return [H(0, 0, 1, 0.7, { len: (end - b) * STEPS, notes })];
  });
}

function genHats(c) {
  const r = c.B('mode'), hits16 = [];
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
    const hits = hits16.map(h => ({ ...h, kind: 'closed' }));
    if (b === c.bars - 1) hits.push(H(pick(c.V('open'), [14, 6, 10]), 0.35, 0.8, 0.6, { kind: 'open', len: 2 }));
    return hits;
  });
}

function genRim(c) {
  const { tun } = c, r = c.B('clave');
  const [back, backRank] = BACKBEAT[c.style];
  const fifth = tun.fifthOf(0);
  const rim = { deg: fifth, oct: tun.octFor(fifth, REG.rim) }, clave = { deg: 0, oct: tun.registerOct(REG.clave) };
  const pat = euclid(pick(r, [3, 5, 5]), STEPS, Math.floor(r() * STEPS)).filter(s => !back.includes(s));
  const order = shuffle(r, pat);
  return c.each((b) => {
    const hits = back.map(s => H(s, backRank, 1, 0.9, { kind: 'rim', notes: [rim] }));
    order.forEach((s, i) => hits.push(H(s, 0.5 + i * 0.1, 0.7, 0.6, { kind: 'clave', notes: [clave] })));
    if (b % 2 === 1) { const s = pick(c.V('ghost', b), [7, 9, 13, 15]); if (!back.includes(s)) hits.push(H(s, 0.7, 0.6, 0.45, { kind: 'rim', notes: [rim] })); }
    return hits;
  });
}

function genPerc(c) {
  const { tun } = c, r = c.B('conga');
  const lo = { deg: 0, oct: tun.registerOct(REG.conga) };
  const hiDeg = r() < 0.5 ? tun.fifthOf(0) : tun.step(2);
  const hi = { deg: hiDeg, oct: lo.oct };
  const on = euclid(pick(r, [3, 4, 5]), STEPS, Math.floor(r() * STEPS));
  const tones = on.map(() => (r() < 0.6 ? lo : hi)), vels = on.map(() => 0.6 + 0.3 * r());
  return c.each((b) => {
    const hits = [];
    for (let s = 0; s < STEPS; s++) hits.push(s % 2 ? H(s, 0.65, 0.8, 0.3, { kind: 'shaker' }) : H(s, s % 4 === 2 ? 0.25 : 0.35, 1, s % 4 === 2 ? 0.7 : 0.5, { kind: 'shaker' }));
    const shift = b % 2 === 1 && c.V('shift', b)() < 0.5 ? 1 : 0;       // the conga figure leans late every other bar
    on.forEach((s, i) => hits.push(H((s + (i === on.length - 1 ? shift : 0)) % STEPS, 0.15 + i * 0.12, 1, vels[i], { kind: 'conga', notes: [tones[i]] })));
    return hits;
  });
}

function genAir(c) {
  const r = c.B('air'), on = euclid(pick(r, [2, 3, 5]), STEPS, Math.floor(r() * STEPS));
  const vels = on.map(() => 0.5 + 0.5 * r());
  return c.each((b) => {
    const rot = Math.floor(c.V('rot')() * 3);
    const hits = on.map((s, i) => H((s + rot) % STEPS, i * 0.2, 0.75, vels[i]));
    if (b === c.bars - 1) [13, 14, 15].forEach(s => hits.push(H(s, 0.6, 0.6, 0.4)));
    return hits;
  });
}

/* Siren / FX: one gesture per phrase — a two-tone siren, a falling zap, or a three-note fragment of the scale. */
function genSiren(c) {
  const { tun, n } = c, v = c.V('fx');
  const oct = tun.registerOct(REG.siren), fifth = tun.fifthOf(0);
  const out = c.each(() => []);
  const place = (bar, rankBase) => {
    const type = pick(v, ['siren', 'fragment', 'zap', 'siren']);
    if (type === 'siren') {
      const other = v() < 0.6 ? { deg: fifth, oct } : { deg: tun.step(2), oct };
      out[bar].push(H(pick(v, [4, 8, 10]), rankBase, 0.75, 0.8, { kind: 'siren', len: pick(v, [4, 6]), rate: pick(v, [1, 2, 0.5]), notes: [{ deg: n, oct }, other] }));
    } else if (type === 'zap') {
      out[bar].push(H(pick(v, [7, 11, 15]), rankBase, 0.75, 0.8, { kind: 'zap', notes: [{ deg: n, oct: oct + 1 }, { deg: 0, oct }] }));
    } else {
      const walk = pick(v, [[4, 2, 0], [0, 2, 4], [7, 4, 2], [2, 1, 0], [-1, 0, 2]]).map(h => tun.step(h));
      const s0 = pick(v, [2, 6, 8]);
      walk.forEach((deg, i) => out[bar].push(H(s0 + i * 3, rankBase + i * 0.08, 0.85, 0.75 - i * 0.1, { kind: 'pluck', len: 2, notes: [{ deg, oct }] })));
    }
  };
  place(c.bars - 1, 0.2);
  if (c.bars > 2) place(Math.floor(c.bars / 2) - 1, 0.7);
  return out;
}

const GEN = { kick: genKick, bass: genBass, stab: genStab, pad: genPad, hats: genHats, rim: genRim, perc: genPerc, air: genAir, siren: genSiren, noise: (c) => c.each(() => []) };

/* How often a part's pattern changes: the variation in force is named by the last phrase at which it changed. */
export function epochAt(seed, part, variation, phrase) {
  if (!(variation > 0)) return 0;
  for (let j = phrase; j > 0; j--) if (rand(seed, part, 'epoch', j) < variation * 0.9) return j;
  return 0;
}

/* The pattern a part plays in a phrase, bar by bar. A locked part keeps the seed and variation it was locked with. */
export function patternOf(S, tun, part, phrase) {
  const P = S.parts[part];
  const seed = P.lock ? P.lock.seed : S.seed;
  const epoch = P.lock ? P.lock.epoch : epochAt(seed, part, P.variation, phrase);
  return { seed, epoch, bars: GEN[part](context(part, S, tun, seed, epoch, phrase)) };
}

/* Events of one part in one bar, with density, scene, intensity and step probability applied.
   opt.scene overrides the scene, opt.forcePad re-strikes the pad at the top of the bar (after a retune). */
export function resolveBar(S, tun, part, absBar, opt = {}) {
  const dens = effDensity(S, part, opt.scene);
  if (!(dens > 0)) return [];
  const bars = S.bars, phrase = Math.floor(absBar / bars), bip = absBar % bars;
  const pat = patternOf(S, tun, part, phrase);
  let hits = pat.bars[bip];
  if (part === 'pad' && opt.forcePad && !hits.length) {
    for (let b = bip - 1; b >= 0; b--) if (pat.bars[b].length) { hits = pat.bars[b].map(h => ({ ...h, len: h.len - (bip - b) * STEPS })); break; }
  }
  const best = new Map();
  for (const h of hits) {
    if (!(h.rank < dens)) continue;
    const k = h.step + ':' + h.kind, o = best.get(k);
    if (!o || h.rank < o.rank) best.set(k, h);
  }
  const out = [];
  for (const h of best.values()) {
    if (h.p < 1 && !(rand(pat.seed, part, 'p', absBar, h.step, h.kind) < h.p)) continue;
    const vel = Math.min(1, h.v * (0.92 + 0.16 * rand(pat.seed, part, 'vel', absBar, h.step, h.kind)));
    let notes = h.notes;
    if (part === 'pad') notes = notes.filter(n => n.rank < dens).map(n => ({ deg: n.deg, oct: n.oct }));
    const ev = { part, bar: absBar, step: h.step, vel, len: h.len, kind: h.kind || part, notes: notes || [] };
    if (h.rate) ev.rate = h.rate;
    out.push(ev);
  }
  out.sort((a, b) => a.step - b.step || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
  if (part === 'bass') for (let i = 0; i < out.length; i++) {       // one voice: a note ends where the next begins
    const end = i + 1 < out.length ? out[i + 1].step : STEPS;
    out[i].len = Math.max(0.5, Math.min(out[i].len, end - out[i].step));
  }
  return out;
}

/* Everything that happens in a bar, in playing order. */
export function barEvents(S, tun, absBar, opt = {}) {
  const out = [];
  for (const part of PARTS) for (const ev of resolveBar(S, tun, part, absBar, opt)) out.push(ev);
  out.sort((a, b) => a.step - b.step || PARTS.indexOf(a.part) - PARTS.indexOf(b.part));
  return out;
}

/* What the step display shows for a bar: 1 = hit, 0.5 = hit that only sometimes fires, 0 = rest. */
export function displayBar(S, tun, part, absBar, opt = {}) {
  const out = new Array(STEPS).fill(0);
  const dens = effDensity(S, part, opt.scene);
  if (!(dens > 0)) return out;
  const bars = S.bars, pat = patternOf(S, tun, part, Math.floor(absBar / bars)).bars[absBar % bars];
  for (const h of pat) if (h.rank < dens && h.step < STEPS) out[h.step] = Math.max(out[h.step], h.p >= 1 ? 1 : 0.5);
  return out;
}

/* Frequencies of an event, in the order of its notes. With Tuning.hz this is the only road from degree to Hz. */
export const pitchesOf = (tun, ev) => ev.notes.map(n => tun.hz(n.deg, n.oct));
