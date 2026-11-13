/* The whole instrument as one plain, serialisable object. The engine reads it, the UI writes it. */
import { Tuning, scaleById } from './tuning.js';

export const PARTS = ['kick', 'bass', 'stab', 'pad', 'hats', 'rim', 'perc', 'air', 'noise', 'siren'];
export const PART_NAMES = { kick: 'Kick', bass: 'Sub bass', stab: 'Chord stab', pad: 'Pad / drone', hats: 'Hats', rim: 'Rim / clave', perc: 'Perc', air: 'Air', noise: 'Noise', siren: 'Siren / FX' };
export const SCENE_NAMES = { intro: 'Intro', groove: 'Groove', break: 'Break', drop: 'Drop' };
export const STYLE_NAMES = { four: 'Four on the floor', steppers: 'Steppers', onedrop: 'One drop', rockers: 'Rockers', half: 'Half-time' };
export const VOICING_NAMES = { auto: 'Auto', m79: 'Minor 7/9', sus: 'Sus', fifths: 'Fifths', cluster: 'Cluster', stack: 'Scale stack' };
export const PROG_NAMES = { 'i': 'i', 'i-VII': 'i–VII', 'i-iv': 'i–iv', 'i-v': 'i–v', 'i-VI-VII': 'i–VI–VII', custom: 'Custom' };
/* Delay times locked to the tempo, in beats. A dotted eighth and 3/16 are the same length, so it is listed once. */
export const SYNC = { e: ['1/8', 0.5], d8: ['3/16', 0.75], q: ['1/4', 1], qt: ['1/4T', 2 / 3], free: ['Free', 0] };

const part = (o) => ({ level: 0.7, mute: false, solo: false, density: 0.6, variation: 0.25, lock: null, dly: 0, rev: 0, out: 'browser', ch: 1, ...o });

export const DEFAULTS = {
  v: 1,
  tempo: 118, swing: 0.12, bars: 4,
  seed: 4136, seedLock: false,
  key: 9, scale: 'aeolian', a4: 440, offsets: {}, custom: [],
  style: 'four', progression: 'i', customProg: '1:2 7:2', voicing: 'auto',
  scene: 'groove', auto: false, autoBars: 16, intensity: 0.6,
  parts: {
    kick:  part({ level: 0.85, ch: 1, tune: 'root', decay: 0.42, punch: 0.5, tone: 0.3 }),
    bass:  part({ level: 0.8, ch: 2, shape: 'sine', glide: 0, octave: 0, filter: 0.4 }),
    stab:  part({ level: 0.7, ch: 3, dly: 0.75, rev: 0.4, detune: 8, cutoff: 0.48, res: 0.38, env: 0.5, length: 0.22, lfoDepth: 0.35, lfoRate: 0.045, rotate: 1 }),
    pad:   part({ level: 0.45, ch: 4, dly: 0.15, rev: 0.5, variation: 0, tone: 0.4, rotate: 1 }),
    hats:  part({ level: 0.5, ch: 5, dly: 0.2, rev: 0.1, tone: 0.5, decay: 0.3 }),
    rim:   part({ level: 0.5, ch: 6, dly: 0.4, rev: 0.4, density: 0.5 }),
    perc:  part({ level: 0.45, ch: 7, dly: 0.2, rev: 0.25, density: 0.5 }),
    air:   part({ level: 0.4, ch: 8, dly: 0.3, rev: 0.2, density: 0.5 }),
    noise: part({ level: 0.45, ch: 0, rev: 0.1, density: 0.5, variation: 0 }),
    siren: part({ level: 0.45, ch: 9, dly: 0.8, rev: 0.4, density: 0.5, variation: 0.6 }),
  },
  delay: { sync: 'd8', free: 0.38, feedback: 0.62, hp: 320, lp: 1700, sat: 0.3, wow: 0.25, flutter: 0.15, ping: true, freeze: false, level: 0.7 },
  reverb: { type: 'plate', size: 0.6, damp: 0.5, level: 0.55 },
  master: { dj: 0, sat: 0.25, comp: 0.4, volume: 0.8 },
  xy: { mode: 'delay' },
  midi: { on: false, out: '', in: '', clockOut: true, clockIn: false, micro: 'bend', bend: 2, drums: 'gm' },
};

export const PRESETS = {
  'Burial Mix': { tempo: 104, swing: 0.2, style: 'onedrop', voicing: 'auto', progression: 'i',
    parts: { kick: { decay: 0.5, punch: 0.35, tone: 0.2 }, bass: { level: 0.9, shape: 'sine', filter: 0.3 }, stab: { cutoff: 0.4, res: 0.3, length: 0.18, dly: 0.8, rev: 0.5 }, hats: { level: 0.35 }, rim: { level: 0.6, rev: 0.6 }, noise: { level: 0.6 } },
    delay: { sync: 'd8', feedback: 0.68, lp: 1300, hp: 280, sat: 0.45, wow: 0.35 }, reverb: { type: 'spring', size: 0.55, damp: 0.6, level: 0.6 }, master: { sat: 0.35 } },
  'Deep Chord': { tempo: 120, swing: 0.1, style: 'four', voicing: 'm79', progression: 'i',
    parts: { stab: { cutoff: 0.5, res: 0.45, length: 0.35, detune: 12, lfoDepth: 0.5, lfoRate: 0.03, dly: 0.85, rev: 0.55 }, pad: { level: 0.5 }, hats: { level: 0.45 }, bass: { filter: 0.35 } },
    delay: { sync: 'd8', feedback: 0.72, lp: 2200, hp: 380, sat: 0.25, wow: 0.2 }, reverb: { type: 'plate', size: 0.8, damp: 0.45, level: 0.65 } },
  'Steppers': { tempo: 126, swing: 0.06, style: 'steppers', voicing: 'auto', progression: 'i-VII',
    parts: { kick: { punch: 0.65, decay: 0.34 }, bass: { shape: 'triangle', filter: 0.45, density: 0.75 }, hats: { level: 0.55, density: 0.7 }, perc: { level: 0.5 }, stab: { length: 0.14, cutoff: 0.55 } },
    delay: { sync: 'q', feedback: 0.55, lp: 1900, hp: 400 }, reverb: { type: 'plate', size: 0.5, damp: 0.5, level: 0.45 } },
  'One Drop': { tempo: 96, swing: 0.28, style: 'onedrop', voicing: 'sus', progression: 'i-iv',
    parts: { bass: { level: 0.9, glide: 0.06, filter: 0.32 }, rim: { level: 0.65, dly: 0.5 }, stab: { length: 0.12, cutoff: 0.45, res: 0.3 }, perc: { level: 0.5, density: 0.6 } },
    delay: { sync: 'qt', feedback: 0.6, lp: 1500, hp: 300, sat: 0.4 }, reverb: { type: 'spring', size: 0.6, damp: 0.5, level: 0.6 } },
  'Kosmische Dub': { tempo: 110, swing: 0.08, style: 'half', voicing: 'fifths', progression: 'i-VI-VII',
    parts: { pad: { level: 0.65, tone: 0.55, rev: 0.7 }, stab: { length: 0.6, cutoff: 0.42, res: 0.5, lfoDepth: 0.7, lfoRate: 0.08, detune: 14 }, air: { level: 0.5, dly: 0.5 }, siren: { level: 0.5 }, hats: { level: 0.35 } },
    delay: { sync: 'q', feedback: 0.78, lp: 2600, hp: 450, wow: 0.5, flutter: 0.3 }, reverb: { type: 'plate', size: 0.95, damp: 0.35, level: 0.7 } },
};

const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
export function merge(base, patch) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  if (!isObj(patch)) return out;
  for (const k of Object.keys(patch)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    out[k] = isObj(patch[k]) && isObj(base[k]) ? merge(base[k], patch[k]) : (isObj(patch[k]) ? merge({}, patch[k]) : patch[k]);
  }
  return out;
}
export const clone = (o) => JSON.parse(JSON.stringify(o));
export const makeState = (patch) => merge(clone(DEFAULTS), patch || {});

/* The tuning a state describes. */
export function tuningOf(S) {
  const scale = scaleById(S.scale, S.custom);
  return new Tuning({ key: S.key, scale, a4: S.a4, offsets: (S.offsets || {})[scale.id] });
}
