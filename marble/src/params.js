/* Parameters, persistence, palettes (as pigments), looks, quality levels. */
export const DEFAULTS = {
  palette:0, tool:'drop', brush:0.07, tempo:0.3, zoom:1, scale:1,
  // marbling
  mBubble:0.35, mSize:1, mRings:0.4, mWater:0.12, mEdge:0, waves:0.5, drift:0.3, swirl:5, auto:1, autoDrop:6,
  // light and pigment
  // flat colour by default: no edge lines, lensing, caustics or texture; the looks and Advanced bring them back
  mixKM:1, exposure:1.0, autoExp:1, hot:0.15, dyeDensity:2.2, lens:0, caustic:0, sat:1.05,
  gran:0, streak:0, paper:0,
  // wet layer and ox gall, both off by default
  wet:0, wetFlow:0.5, wetVisc:0.4, gall:0, gallKind:0.7,
  // post
  glow:0.12, glowThresh:0.9, halation:0, aberr:0, grain:0.08, grainSize:1.3, flicker:0,
  // sound
  aGain:1.0, pulse:1.0, bubbling:0.5, gate:0.35,
  gBpm:118, gVol:0.8, gKick:1, gBass:1, gChord:1, gHat:1, gAir:1,
  // output
  quality:1, renderScale:0.8, printSize:0,
};
export const LOOK_KEYS = ['palette','tempo','zoom','scale','mBubble','mSize','mRings','mWater','mEdge','waves','drift','swirl','mixKM','exposure','hot','dyeDensity','lens','caustic','sat','gran','streak','paper','gall','gallKind','glow','glowThresh','halation','aberr','grain','grainSize','flicker'];

export const store = {
  get(k, d){ try { const v = localStorage.getItem('marble.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v){ try { localStorage.setItem('marble.' + k, JSON.stringify(v)); } catch (e) {} },
};
export const P = Object.assign({}, DEFAULTS);
{
  const saved = store.get('state2', {});   // 'state2': the defaults changed to flat colour, older saved states are left behind
  for (const k in saved) if (k in DEFAULTS && typeof saved[k] === typeof DEFAULTS[k]) P[k] = saved[k];
  if (!['drop', 'comb', 'swirl', 'stylus'].includes(P.tool)) P.tool = 'drop';
}

/* Palettes are four pigments, a lamp and the colour of the empty bath. Colours are sRGB 0..1. */
const hx = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const pal = (name, lamp, bath, pigments) => ({ name, lamp:hx(lamp), bath:hx(bath), names:pigments.map(p => p[0]), dyes:pigments.map(p => hx(p[1])) });
export const PALETTES = [
  pal('Ebru', '#fff1dc', '#0b0a0c', [['Lahore indigo', '#1f2f7a'], ['Yellow ochre', '#d9a12b'], ['Red oxide', '#b63a22'], ['Lead white', '#f1e9d8']]),
  pal('Primaries', '#fff8ec', '#08090c', [['Cobalt blue', '#0047ab'], ['Cadmium yellow', '#fdd500'], ['Quinacridone magenta', '#c8195f'], ['Titanium white', '#f4f1e8']]),
  pal('Suminagashi', '#fffaf0', '#d9d2c0', [['Sumi black', '#17171b'], ['Indigo', '#27407a'], ['Vermilion', '#d5432a'], ['Pale ash', '#a9a69c']]),
  pal('Lava', '#ffd9a8', '#0a0402', [['Cadmium orange', '#ff7a12'], ['Pyrrole red', '#d81f16'], ['Burnt umber', '#5a2a14'], ['Naples yellow', '#ffe08a']]),
  pal('Petrol', '#eef3ff', '#04060d', [['Prussian blue', '#12356e'], ['Dioxazine violet', '#6a2bb0'], ['Viridian', '#0f8f82'], ['Gold ochre', '#f0be4a']]),
  pal('Acid', '#fffff2', '#07040b', [['Fluorescent green', '#4dff2e'], ['Opera rose', '#ff1ac6'], ['Ultramarine', '#2f45ff'], ['Signal orange', '#ff8400']]),
];
export const CUSTOM = Object.assign(pal('Custom', '#fff1dc', '#0b0a0c', [['Pigment 1', '#1f2f7a'], ['Pigment 2', '#d9a12b'], ['Pigment 3', '#b63a22'], ['Pigment 4', '#f1e9d8']]), { touched:false });
{
  const c = store.get('custom', null);
  if (c && Array.isArray(c.dyes) && c.dyes.length === 4) { CUSTOM.dyes = c.dyes; if (c.lamp) CUSTOM.lamp = c.lamp; if (c.bath) CUSTOM.bath = c.bath; CUSTOM.touched = !!c.touched; }
}
PALETTES.push(CUSTOM);
export const CUSTOM_SLOTS = [['dyes', 0, 'Pigment 1'], ['dyes', 1, 'Pigment 2'], ['dyes', 2, 'Pigment 3'], ['dyes', 3, 'Pigment 4'], ['lamp', null, 'Lamp']];
export const rgbHex = c => '#' + c.map(x => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0')).join('');
export const hexRgb = hx;
if (!PALETTES[P.palette]) P.palette = 0;
export const PAL = () => PALETTES[P.palette];

export const PRESETS = [
  { name:'Ebru', palette:0 },
  { name:'Suminagashi', palette:2, tempo:0.25, mRings:0.9, mBubble:0.3, mWater:0.3, drift:0.45, swirl:2, waves:0.8, sat:1.0 },
  { name:'Paintbox', palette:1, mRings:0.3, sat:1.1 },
  { name:'Paper', palette:0, mEdge:0.3, gran:0.55, streak:0.6, paper:0.6, grain:0.3 },
  { name:'Lava', palette:3, tempo:0.35, mBubble:0.6, mSize:1.3, mRings:0.25, mWater:0.05, mEdge:0.5, lens:0.9, caustic:0.8, hot:0.5, dyeDensity:1.5, glow:0.95, glowThresh:0.6, halation:0.7, grain:0.5, flicker:0.3 },
  { name:'Lightbox', palette:4, mixKM:0.15, mEdge:0.45, lens:0.8, caustic:0.7, hot:0.45, dyeDensity:1.6, glow:0.85, glowThresh:0.65, halation:0.5, grain:0.45 },
  { name:'Acid', palette:5, tempo:0.4, mBubble:0.5, mRings:0.55, swirl:9, sat:1.15 },
];

/* mq: share of screen resolution the marble is evaluated at; mb: baked texture; wet: velocity grid; rd: ox gall grid */
export const QUAL = [
  { name:'Low', mq:0.55, mb:1024, wet:96, rd:256, hist:0 },
  { name:'Medium', mq:0.8, mb:1536, wet:128, rd:384, hist:300 },
  { name:'High', mq:1.0, mb:2048, wet:192, rd:512, hist:400 },
];
if (!QUAL[P.quality]) P.quality = 1;
