/* WebGL2 plumbing, carried over from Dish: fullscreen triangle, programs, uniform helper, float render targets. */
export const canvas = document.querySelector('#stage');
export const gl = canvas.getContext('webgl2', { alpha:false, antialias:false, depth:false, stencil:false, preserveDrawingBuffer:false, powerPreference:'high-performance' });
export let glError = null;
if (!gl) glError = 'This browser has no WebGL2. Open Marble in a current Chrome, Safari or Firefox.';
else if (!gl.getExtension('EXT_color_buffer_float')) glError = 'This graphics card cannot render to floating-point textures (EXT_color_buffer_float). Try Chrome on a computer.';
if (gl) gl.getExtension('EXT_float_blend');

let quadVAO = null;
if (gl) {
  quadVAO = gl.createVertexArray();
  gl.bindVertexArray(quadVAO);
  const qb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
}

function compile(type, src){
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    console.error(log + '\n' + src.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n'));
    throw new Error('Shader: ' + log);
  }
  return s;
}
export function program(vs, fs){
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Link: ' + gl.getProgramInfoLog(p));
  const locs = {};
  return { p, loc(n){ if (!(n in locs)) locs[n] = gl.getUniformLocation(p, n); return locs[n]; } };
}
function setU(pr, U){
  let unit = 0;
  for (const k in U) {
    const v = U[k], l = pr.loc(k);
    if (l === null) continue;
    if (v instanceof WebGLTexture) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, v); gl.uniform1i(l, unit); unit++; }
    else if (typeof v === 'number') gl.uniform1f(l, v);
    else if (Array.isArray(v)) { if (v.length === 2) gl.uniform2f(l, v[0], v[1]); else if (v.length === 3) gl.uniform3f(l, v[0], v[1], v[2]); else gl.uniform4f(l, v[0], v[1], v[2], v[3]); }
    else if (v.i !== undefined) gl.uniform1i(l, v.i);
    else if (v.v3) gl.uniform3fv(l, v.v3);
    else if (v.v4) gl.uniform4fv(l, v.v4);
    else if (v.t3) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_3D, v.t3); gl.uniform1i(l, unit); unit++; }
  }
}
export function bindTarget(t){
  if (t) { gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb); gl.viewport(0, 0, t.w, t.h); }
  else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height); }
}
export function run(pr, target, U){
  gl.useProgram(pr.p); gl.bindVertexArray(quadVAO); setU(pr, U); bindTarget(target);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
function makeTex(w, h, o){
  const ifmt = o.ifmt || gl.RGBA16F, type = o.type || gl.HALF_FLOAT, filt = o.filter || gl.LINEAR, wrap = o.wrap || gl.CLAMP_TO_EDGE;
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filt);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filt);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, gl.RGBA, type, null);
  return tex;
}
/* o.mrt adds a second colour attachment of the same format (tex2) */
export function makeFBO(w, h, o = {}){
  const tex = makeTex(w, h, o), tex2 = o.mrt ? makeTex(w, h, o) : null;
  const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  if (tex2) { gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, tex2, 0); gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]); }
  const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (st !== gl.FRAMEBUFFER_COMPLETE) throw new Error('FBO incomplete ' + st);
  gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  return { tex, tex2, fb, w, h, texel:[1 / w, 1 / h], del(){ gl.deleteTexture(tex); if (tex2) gl.deleteTexture(tex2); gl.deleteFramebuffer(fb); } };
}
export function makeDouble(w, h, o = {}){
  let a = makeFBO(w, h, o), b = makeFBO(w, h, o);
  return { w, h, texel:a.texel, get read(){ return a; }, get write(){ return b; }, swap(){ const t = a; a = b; b = t; }, del(){ a.del(); b.del(); } };
}
export function clearT(t){ bindTarget(t); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
