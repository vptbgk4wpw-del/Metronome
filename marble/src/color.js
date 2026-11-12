/* Pigment mixing with Spectral.js (MIT, Ronald van Wijnen): Kubelka-Munk on the spectrum, so blue and yellow
   make green the way paint does. The four pigments of a palette span a tetrahedron of mixing ratios; that is
   tabulated once per palette into a small 3-D texture the compositor reads with one lookup. */
import { Color, mix } from 'spectral.js';
import { gl } from './gl.js';
import { rgbHex } from './params.js';

export const LUT_N = 20;
const lin = c => c.map(x => Math.pow(x, 2.2));
let tex = null;
const data = new Float32Array(LUT_N * LUT_N * LUT_N * 4);

export function mixPigments(dyes, weights){
  const parts = [];
  for (let i = 0; i < 4; i++) if (weights[i] > 1e-4) parts.push([new Color(rgbHex(dyes[i])), weights[i]]);
  if (!parts.length) return [1, 1, 1];
  const c = parts.length === 1 ? parts[0][0] : mix(...parts);
  return c.lRGB.map(x => Math.min(1, Math.max(0, x)));
}

export function derive(p){
  p.lampL = lin(p.lamp); p.bathL = lin(p.bath);
  p.dyesL = p.dyes.map(lin);
  p.absF = new Float32Array(p.dyesL.flatMap(c => c.map(x => -Math.log(Math.max(x, 0.015)))));
  p.lutDirty = true;
}
function build(p){
  const cols = p.dyes.map(d => new Color(rgbHex(d))), N = LUT_N;
  let j = 0;
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let a = x / (N - 1), b = y / (N - 1), c = z / (N - 1), s = a + b + c;
    if (s > 1) { a /= s; b /= s; c /= s; s = 1; }
    const w = [a, b, c, 1 - s], parts = [];
    for (let i = 0; i < 4; i++) if (w[i] > 1e-4) parts.push([cols[i], w[i]]);
    const rgb = (parts.length === 1 ? parts[0][0] : mix(...parts)).lRGB;
    data[j++] = Math.min(1, Math.max(0, rgb[0])); data[j++] = Math.min(1, Math.max(0, rgb[1])); data[j++] = Math.min(1, Math.max(0, rgb[2])); data[j++] = 1;
  }
}
/* the table for the active palette; rebuilt when the palette or one of its pigments changes */
let current = null;
export function lutFor(p){
  if (!tex) {
    tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_3D, tex);
    for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_3D, k, gl.LINEAR);
    for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, k, gl.CLAMP_TO_EDGE);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA16F, LUT_N, LUT_N, LUT_N, 0, gl.RGBA, gl.FLOAT, null);
  }
  if (current !== p || p.lutDirty) {
    build(p); current = p; p.lutDirty = false;
    gl.bindTexture(gl.TEXTURE_3D, tex);
    gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, 0, LUT_N, LUT_N, LUT_N, gl.RGBA, gl.FLOAT, data);
  }
  return tex;
}
