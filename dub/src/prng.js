/* Deterministic randomness. Nothing in the music logic calls Math.random: every decision is a pure
   function of the seed and of where in the piece it is taken, so the same seed always gives the same track. */

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* FNV-1a over the joined parts, then one avalanche round. */
export function hash(...parts) {
  const s = parts.join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}

/* A stream of numbers for one named decision. */
export const rng = (...parts) => mulberry32(hash(...parts));
/* A single number for one named decision. */
export const rand = (...parts) => mulberry32(hash(...parts))();

export const pick = (r, list) => list[Math.min(list.length - 1, Math.floor(r() * list.length))];
export function shuffle(r, list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
