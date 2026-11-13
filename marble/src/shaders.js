/* All GLSL. Marbling evaluation and compositing come from Szalka's "Marmur" engine, post-processing from Dish. */
export const VS = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;
const HEAD = `#version 300 es
precision highp float; precision highp sampler2D; precision highp sampler3D;
in vec2 vUv; out vec4 o;
`;
const HEAD2 = `#version 300 es
precision highp float; precision highp sampler2D;
in vec2 vUv; layout(location = 0) out vec4 o; layout(location = 1) out vec4 oMc;
`;
const NOISE = `
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy) * 2.0 - 1.0; }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float gnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(dot(hash22(i), f), dot(hash22(i + vec2(1, 0)), f - vec2(1, 0)), u.x),
             mix(dot(hash22(i + vec2(0, 1)), f - vec2(0, 1)), dot(hash22(i + vec2(1, 1)), f - vec2(1, 1)), u.x), u.y); }
`;
/* Material coordinates ride along with the paint. They are kept in a half-float texture as coarse + fine parts,
   which stays exact under linear filtering because the split is linear. */
const MC = `
vec4 encMc(vec2 m){ vec2 a = floor(m * 64.0) / 64.0; return vec4(a.x, (m.x - a.x) * 64.0, a.y, (m.y - a.y) * 64.0); }
vec2 decMc(vec4 e){ return vec2(e.x + e.y / 64.0, e.z + e.w / 64.0); }
`;
/* psrdnoise (c) 2021 Stefan Gustavson and Ian McEwan, MIT licence, https://github.com/stegu/psrdnoise
   2-D simplex noise with rotating gradients and an analytic derivative (the non-periodic branch). */
const PSRD = `
float psrdnoise(vec2 x, float alpha, out vec2 gradient){
  vec2 uv = vec2(x.x + x.y * 0.5, x.y);
  vec2 i0 = floor(uv), f0 = fract(uv);
  float cmp = step(f0.y, f0.x);
  vec2 o1 = vec2(cmp, 1.0 - cmp);
  vec2 i1 = i0 + o1, i2 = i0 + vec2(1.0);
  vec2 v0 = vec2(i0.x - i0.y * 0.5, i0.y);
  vec2 v1 = vec2(v0.x + o1.x - o1.y * 0.5, v0.y + o1.y);
  vec2 v2 = vec2(v0.x + 0.5, v0.y + 1.0);
  vec2 x0 = x - v0, x1 = x - v1, x2 = x - v2;
  vec3 iu = vec3(i0.x, i1.x, i2.x), iv = vec3(i0.y, i1.y, i2.y);
  vec3 hash = mod(iu, 289.0);
  hash = mod((hash * 51.0 + 2.0) * hash + iv, 289.0);
  hash = mod((hash * 34.0 + 10.0) * hash, 289.0);
  vec3 psi = hash * 0.07482 + alpha;
  vec3 gx = cos(psi), gy = sin(psi);
  vec2 g0 = vec2(gx.x, gy.x), g1 = vec2(gx.y, gy.y), g2 = vec2(gx.z, gy.z);
  vec3 w = max(0.8 - vec3(dot(x0, x0), dot(x1, x1), dot(x2, x2)), 0.0);
  vec3 w2 = w * w, w4 = w2 * w2;
  vec3 gdotx = vec3(dot(g0, x0), dot(g1, x1), dot(g2, x2));
  float n = dot(w4, gdotx);
  vec3 w3 = w2 * w, dw = -8.0 * w3 * gdotx;
  vec2 dn0 = w4.x * g0 + dw.x * x0, dn1 = w4.y * g1 + dw.y * x1, dn2 = w4.z * g2 + dw.z * x2;
  gradient = 10.9 * (dn0 + dn1 + dn2);
  return 10.9 * n;
}
`;
const TONE = `
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
vec3 tone(vec3 col, float exposure, float sat, vec2 gp, float grain){
  col = aces(col * exposure);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = max(mix(vec3(l), col, sat), 0.0);
  float n = (hash12(gp) + hash12(gp + 19.19) - 1.0);
  vec3 nc = vec3(n, hash12(gp + 3.7) - 0.5, hash12(gp + 7.3) - 0.5) * vec3(1.0, 0.35, 0.35);
  col += (vec3(nc.x) + nc.yzz) * grain * 0.2 * (0.03 + l * (1.0 - l) * 3.2);
  return pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));
}
`;

export const SRC = {
/* Mathematical marbling (Lu, Jaffer et al. 2012): every operation is an exact, area-preserving map,
   so each pixel walks the stack backwards to the drop or the baked texture it came from. Edges never blur. */
marbEval: HEAD2 + MC + `
uniform sampler2D uBase, uMcBase, uOps, uDisp; uniform int uN, uN0, uVN; uniform vec2 uBaseTexel; uniform vec4 uWin; uniform float uAA, uWet;
uniform vec4 uVent[16];
vec4 sampleBase(vec2 p){
  vec2 sp = p / uBaseTexel, tp = floor(sp - 0.5) + 0.5, f = sp - tp;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f)), w1 = 1.0 + f * f * (-2.5 + 1.5 * f), w2 = f * (0.5 + f * (2.0 - 1.5 * f)), w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2, t0 = (tp - 1.0) * uBaseTexel, t3 = (tp + 2.0) * uBaseTexel, t12 = (tp + w2 / w12) * uBaseTexel;
  vec4 r = (texture(uBase, vec2(t0.x, t0.y)) * w0.x + texture(uBase, vec2(t12.x, t0.y)) * w12.x + texture(uBase, vec2(t3.x, t0.y)) * w3.x) * w0.y
         + (texture(uBase, vec2(t0.x, t12.y)) * w0.x + texture(uBase, vec2(t12.x, t12.y)) * w12.x + texture(uBase, vec2(t3.x, t12.y)) * w3.x) * w12.y
         + (texture(uBase, vec2(t0.x, t3.y)) * w0.x + texture(uBase, vec2(t12.x, t3.y)) * w12.x + texture(uBase, vec2(t3.x, t3.y)) * w3.x) * w3.y;
  vec4 a = texture(uBase, tp * uBaseTexel), b = texture(uBase, (tp + vec2(1.0, 0.0)) * uBaseTexel);
  vec4 c = texture(uBase, (tp + vec2(0.0, 1.0)) * uBaseTexel), d = texture(uBase, (tp + 1.0) * uBaseTexel);
  return clamp(r, min(min(a, b), min(c, d)), max(max(a, b), max(c, d)));
}
void main(){
  vec2 p = uWin.xy + vUv * (uWin.zw - uWin.xy);
  /* reversible breathing around the active vents. Their distance fields are joined with an exponential smooth minimum
     (glsl-smooth-min, MIT, Hugh Kennedy / Inigo Quilez), so neighbouring vents swell as one organic blob. */
  if (uVN > 0) {
    float se = 0.0, amp = 0.0; vec2 dir = vec2(0.0);
    for (int i = 0; i < uVN; i++) {
      vec4 v = uVent[i]; vec2 d = p - v.xy; float L = length(d), w = exp(-5.0 * L / v.z);
      se += w; dir += w * d / max(L, 1e-5); amp += w * v.w * v.z;
    }
    if (se > 1e-30) { float f = -log(se) / 5.0; p -= dir / se * (amp / se) * f * exp(-f * f); }
  }
  vec4 acc = vec4(0.0); float w = 1.0, gain = 1.0; vec2 mc = vec2(0.0); bool got = false;
  for (int i = uN - 1; i >= uN0; i--) {
    vec4 a = texelFetch(uOps, ivec2(2 * i, 0), 0), b = texelFetch(uOps, ivec2(2 * i + 1, 0), 0);
    int ty = int(a.x + 0.5);
    if (ty == 0) {                       // drop: P' = C + (P - C) * sqrt(1 + r^2 / |P - C|^2)
      float r = a.w; if (r <= 0.0) continue;
      vec2 d = p - a.yz; float L2 = dot(d, d), L = sqrt(L2);
      float cov = clamp((r - L) / uAA * 0.5 + 0.5, 0.0, 1.0);
      if (cov > 0.0) {
        if (!got && cov >= 0.5) { got = true; mc = d + a.yz * 3.7 + 1.3; }
        acc += w * cov * b * gain; w *= 1.0 - cov; if (w < 0.004) break;
      }
      p = a.yz + d * sqrt(max(0.0, 1.0 - r * r / max(L2, 1e-12)));
    } else if (ty == 1) {                // tine comb: shift along M, decaying with distance to the nearest tine
      vec2 N = a.yz, M = vec2(-N.y, N.x);
      float sd = dot(p, N) - b.x, dd = abs(sd - b.y * floor(sd / b.y + 0.5));
      p -= M * a.w * exp2(-dd / max(b.z, 1e-4));
    } else if (ty == 2) {                // vortex: rotation that fades with distance
      vec2 d = p - a.yz; float th = -a.w * exp(-dot(d, d) / (b.x * b.x)), c = cos(th), sv = sin(th);
      p = a.yz + vec2(c * d.x - sv * d.y, sv * d.x + c * d.y);
    } else if (ty == 3) {                // sine wave shear
      vec2 N = a.yz, M = vec2(-N.y, N.x);
      p -= M * a.w * sin(b.x * dot(p, N) + b.y);
    } else if (ty == 4) {                // stylus stroke, inverted by fixed-point iteration
      vec2 mv = b.xy, s0 = a.yz - mv; float r2 = a.w * a.w, mm = max(dot(mv, mv), 1e-12); vec2 q2 = p;
      for (int k = 0; k < 3; k++) { vec2 pa = q2 - s0; vec2 dv = pa - mv * clamp(dot(pa, mv) / mm, 0.0, 1.0); q2 = p - mv * b.z * exp(-dot(dv, dv) / r2); }
      p = q2;
    } else {                             // ripple: bands pressed together and pulled apart along N (Spanish wave).
      vec2 N = a.yz; float s0 = dot(p, N), q = s0;   // Pressed paint lies denser, stretched paint thinner: that is the shading.
      for (int k = 0; k < 4; k++) q = s0 - a.w * sin(b.x * q + b.y);
      p += N * (q - s0);
      gain /= max(0.35, 1.0 + a.w * b.x * cos(b.x * q + b.y));
    }
  }
  if (uWet > 0.0) p += texture(uDisp, p).xy;
  if (!got) mc = decMc(texture(uMcBase, p));
  if (w > 0.004) acc += w * sampleBase(p) * gain;
  o = acc; oMc = encMc(mc);
}`,
initBase: HEAD2 + MC + `
void main(){ o = vec4(0.0); oMc = encMc(vUv); }`,
copy: HEAD + `
uniform sampler2D uSrc;
void main(){ o = texture(uSrc, vUv); }`,

/* Pigment and light. Paint: pigments mix on the spectrum (Spectral.js table) and cover the bath.
   Glass: transparent dye, light passes through and gets darker as dye piles up (Beer-Lambert). */
comp: HEAD + NOISE + MC + `
uniform sampler2D uEv, uEvMc, uGall; uniform sampler3D uLut;
uniform vec2 uCenter, uOrigin, uTap; uniform vec4 uWin; uniform float uSize, uHalf, uPx, uGrainF, uLutN;
uniform vec3 uLamp, uBath; uniform vec3 uAbs[4];
uniform float uMixKM, uDyeDen, uHot, uLens, uCaustic, uEdge, uGran, uStreak, uPaper, uGallK;
void main(){
  vec2 fc = gl_FragCoord.xy + uOrigin;
  vec2 suv = (fc - uCenter) / uSize + 0.5;
  const vec4 one = vec4(1.0);
  vec2 w = (suv - uWin.xy) / (uWin.zw - uWin.xy), e = uTap * 1.25, E = uTap * 6.0;   // uTap: one texel of the live evaluation, at any output size
  vec4 c0 = texture(uEv, w);
  vec4 cl = texture(uEv, w - vec2(e.x, 0.0)), cr = texture(uEv, w + vec2(e.x, 0.0)), cb = texture(uEv, w - vec2(0.0, e.y)), ct = texture(uEv, w + vec2(0.0, e.y));
  float Cl = dot(texture(uEv, w - vec2(E.x, 0.0)), one), Cr = dot(texture(uEv, w + vec2(E.x, 0.0)), one);
  float Cb = dot(texture(uEv, w - vec2(0.0, E.y)), one), Ct = dot(texture(uEv, w + vec2(0.0, E.y)), one);
  float C0 = dot(c0, one);
  vec2 g = 0.5 * vec2(Cr - Cl, Ct - Cb);
  float lap = Cl + Cr + Cb + Ct - 4.0 * C0;
  float edge = 0.5 * (length(cr - cl) + length(ct - cb));
  float line = smoothstep(0.05, 0.45, edge) * uEdge;
  vec4 c = max(texture(uEv, w - g * uLens * 0.012 / max(uWin.z - uWin.x, 1e-4)), 0.0);
  float C = dot(c, one);

  /* texture: paper fibres stay with the sheet, streaks are noise in material space, so every comb pull
     stretches them along its direction (the look a line integral convolution gives) */
  vec2 pp = fc / uPx;
  float fibre = 0.55 * gnoise(pp * 0.31) + 0.45 * gnoise(pp * vec2(0.85, 0.11) + 31.7) + 0.35 * gnoise(pp * 1.27 + 7.1);
  vec2 mc = decMc(texture(uEvMc, w));
  float J = max(length(dFdx(mc)), length(dFdy(mc))) * uSize;
  float sfade = 1.0 / (1.0 + J * J * 0.04);
  float streak = (gnoise(mc * uGrainF) + 0.6 * gnoise(mc * uGrainF * 2.3 + 11.0)) * sfade;
  float den = uDyeDen * max(0.2, 1.0 + uGran * 0.9 * fibre + uStreak * 0.9 * streak + 0.5 * line);

  vec3 tGlass = exp(-(uAbs[0] * c.x + uAbs[1] * c.y + uAbs[2] * c.z + uAbs[3] * c.w) * den);
  vec3 f3 = c.xyz / max(C, 1e-4);
  vec3 pig = texture(uLut, (clamp(f3, 0.0, 1.0) * (uLutN - 1.0) + 0.5) / uLutN).rgb;
  float cover = 1.0 - exp(-C * den * 2.0);
  if (uGallK > 0.0) {                    // ox gall: reaction-diffusion cells open lacy holes inside the stains
    float v = texture(uGall, suv).y;
    float hole = smoothstep(0.1, 0.24, v);
    cover *= 1.0 - uGallK * hole * 0.92;
    cover = min(1.0, cover * (1.0 + uGallK * 0.5 * smoothstep(0.02, 0.1, v) * (1.0 - hole)));
  }
  vec3 T = mix(tGlass, mix(uBath, pig, cover), uMixKM);

  float rr = length(fc - uCenter) / uHalf;
  float lamp = (1.0 - uHot * rr * rr * 0.7) * 0.8;
  float caust = 1.0 + clamp(-lap * uCaustic * 0.9, -0.6, 1.6);
  vec3 col = uLamp * lamp * T * caust * (1.0 - min(0.85, 0.8 * line));
  col *= 1.0 + uPaper * 0.16 * fibre;
  o = vec4(col, 1.0);
}`,
measure: HEAD + `
uniform sampler2D uScene, uEv;
void main(){
  vec4 acc = vec4(0.0);
  bool dyePart = gl_FragCoord.x >= 8.0;
  vec2 cell = floor(gl_FragCoord.xy) - vec2(dyePart ? 8.0 : 0.0, 0.0);
  for (int j = 0; j < 4; j++) for (int i = 0; i < 4; i++) {
    vec2 uv = (cell + (vec2(float(i), float(j)) + 0.5) / 4.0) / 8.0;
    if (dyePart) acc += max(texture(uEv, uv), 0.0);
    else acc += vec4(dot(texture(uScene, uv).rgb, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0, 0.0);
  }
  o = acc;
}`,

/* Wet layer: a low-resolution velocity field after Pavel Dobryakov's WebGL-Fluid-Simulation (MIT).
   It never touches the paint directly; it advects a displacement map that the marble lookup reads. */
wAdvect: HEAD + `
uniform sampler2D uVel, uSrc; uniform vec2 uTexel; uniform float uDt, uDiss;
void main(){ o = texture(uSrc, vUv - uDt * texture(uVel, vUv).xy * uTexel) * uDiss; }`,
wDisp: HEAD + `
uniform sampler2D uVel, uSrc; uniform vec2 uTexel; uniform float uDt;
void main(){ vec2 st = uDt * texture(uVel, vUv).xy * uTexel; o = vec4(texture(uSrc, vUv - st).xy - st, 0.0, 1.0); }`,
wCurl: HEAD + `
uniform sampler2D uVel; uniform vec2 uTexel;
void main(){
  float L = texture(uVel, vUv - vec2(uTexel.x, 0.0)).y, R = texture(uVel, vUv + vec2(uTexel.x, 0.0)).y;
  float T = texture(uVel, vUv + vec2(0.0, uTexel.y)).x, B = texture(uVel, vUv - vec2(0.0, uTexel.y)).x;
  o = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`,
wForce: HEAD + PSRD + `
uniform sampler2D uVel, uCurl; uniform vec2 uTexel; uniform float uCurlStr, uDt, uTime, uDrift, uRes, uScale;
void main(){
  float L = texture(uCurl, vUv - vec2(uTexel.x, 0.0)).x, R = texture(uCurl, vUv + vec2(uTexel.x, 0.0)).x;
  float T = texture(uCurl, vUv + vec2(0.0, uTexel.y)).x, B = texture(uCurl, vUv - vec2(0.0, uTexel.y)).x;
  float C = texture(uCurl, vUv).x;
  vec2 f = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  f /= length(f) + 1e-4; f *= uCurlStr * C; f.y *= -1.0;
  vec2 v = texture(uVel, vUv).xy + f * uDt;
  vec2 g1, g2;                           // curl of the noise from its analytic gradient: divergence-free drift
  psrdnoise(vUv * 3.0 / uScale, uTime * 0.11, g1);
  psrdnoise(vUv * 7.0 / uScale + 4.7, -uTime * 0.17, g2);
  v += (vec2(g1.y, -g1.x) + 0.5 * vec2(g2.y, -g2.x)) * uDrift * uRes * uDt * 0.007;
  o = vec4(clamp(v, -1000.0, 1000.0), 0.0, 1.0);
}`,
wDiv: HEAD + `
uniform sampler2D uVel; uniform vec2 uTexel;
void main(){
  vec2 C = texture(uVel, vUv).xy;
  vec2 pl = vUv - vec2(uTexel.x, 0.0), pr = vUv + vec2(uTexel.x, 0.0), pt = vUv + vec2(0.0, uTexel.y), pb = vUv - vec2(0.0, uTexel.y);
  float L = pl.x > 0.0 ? texture(uVel, pl).x : -C.x, R = pr.x < 1.0 ? texture(uVel, pr).x : -C.x;
  float T = pt.y < 1.0 ? texture(uVel, pt).y : -C.y, B = pb.y > 0.0 ? texture(uVel, pb).y : -C.y;
  o = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`,
wPressure: HEAD + `
uniform sampler2D uP, uDiv; uniform vec2 uTexel;
void main(){
  float L = texture(uP, vUv - vec2(uTexel.x, 0.0)).x, R = texture(uP, vUv + vec2(uTexel.x, 0.0)).x;
  float T = texture(uP, vUv + vec2(0.0, uTexel.y)).x, B = texture(uP, vUv - vec2(0.0, uTexel.y)).x;
  o = vec4((L + R + T + B - texture(uDiv, vUv).x) * 0.25, 0.0, 0.0, 1.0);
}`,
wGradsub: HEAD + `
uniform sampler2D uP, uVel; uniform vec2 uTexel;
void main(){
  float L = texture(uP, vUv - vec2(uTexel.x, 0.0)).x, R = texture(uP, vUv + vec2(uTexel.x, 0.0)).x;
  float T = texture(uP, vUv + vec2(0.0, uTexel.y)).x, B = texture(uP, vUv - vec2(0.0, uTexel.y)).x;
  o = vec4(texture(uVel, vUv).xy - 0.5 * vec2(R - L, T - B), 0.0, 1.0);
}`,
wSplat: HEAD + `
uniform sampler2D uTarget; uniform vec2 uPoint; uniform vec3 uValue; uniform float uRadius; uniform int uMode;
void main(){
  vec4 b = texture(uTarget, vUv); vec2 d = vUv - uPoint; float r2 = dot(d, d), g = exp(-r2 / uRadius);
  if (uMode == 0) o = b + vec4(uValue.xy * g, 0.0, 0.0);
  else { float r = sqrt(r2); o = b + vec4(d / (r + 1e-4) * uValue.x * g * smoothstep(0.0, 0.25 * sqrt(uRadius), r), 0.0, 0.0); }
}`,
scale: HEAD + `
uniform sampler2D uSrc; uniform float uMul;
void main(){ o = texture(uSrc, vUv) * uMul; }`,

/* Ox gall: Gray-Scott reaction-diffusion that only lives inside the stains (the classic two-chemical model, as in
   piellardj/reaction-diffusion-webgl, keijiro/RDSystem and ijmbarr/turing-patterns). */
gall: HEAD + NOISE + `
uniform sampler2D uRD, uBase; uniform vec2 uTexel; uniform float uF, uK, uSeed, uInit;
void main(){
  if (uInit > 0.5) { o = vec4(1.0, 0.0, 0.0, 1.0); return; }
  vec2 c = texture(uRD, vUv).xy, t = uTexel;
  vec2 lap = (texture(uRD, vUv + vec2(t.x, 0.0)).xy + texture(uRD, vUv - vec2(t.x, 0.0)).xy + texture(uRD, vUv + vec2(0.0, t.y)).xy + texture(uRD, vUv - vec2(0.0, t.y)).xy) * 0.2
    + (texture(uRD, vUv + t).xy + texture(uRD, vUv - t).xy + texture(uRD, vUv + vec2(t.x, -t.y)).xy + texture(uRD, vUv + vec2(-t.x, t.y)).xy) * 0.05 - c;
  float cov = clamp(dot(texture(uBase, vUv), vec4(1.0)), 0.0, 1.0);
  float inside = smoothstep(0.3, 0.7, cov);
  float k = mix(0.08, uK, inside), uvv = c.x * c.y * c.y;
  c += vec2(lap.x - uvv + uF * (1.0 - c.x), 0.5 * lap.y + uvv - (uF + k) * c.y);
  if (inside > 0.9 && hash12(floor(vUv / uTexel / 5.0) + uSeed) > 0.9996) c = vec2(0.3, 0.6);   // a speck of gall now and then; it has to be a few texels wide to take
  o = vec4(clamp(c, 0.0, 1.0), 0.0, 1.0);
}`,

/* post, from Dish */
bloomPre: HEAD + `
uniform sampler2D uSrc; uniform vec2 uTexel; uniform float uThresh;
void main(){
  vec3 c = (texture(uSrc, vUv + uTexel * vec2(-0.5, -0.5)).rgb + texture(uSrc, vUv + uTexel * vec2(0.5, -0.5)).rgb
          + texture(uSrc, vUv + uTexel * vec2(-0.5, 0.5)).rgb + texture(uSrc, vUv + uTexel * vec2(0.5, 0.5)).rgb) * 0.25;
  float br = max(c.r, max(c.g, c.b)); float knee = 0.3;
  float soft = clamp(br - uThresh + knee, 0.0, 2.0 * knee); soft = soft * soft / (4.0 * knee + 1e-4);
  o = vec4(c * max(soft, br - uThresh) / max(br, 1e-4), 1.0);
}`,
down: HEAD + `
uniform sampler2D uSrc; uniform vec2 uTexel;
void main(){
  o = vec4((texture(uSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture(uSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb
          + texture(uSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture(uSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb) * 0.25, 1.0);
}`,
up: HEAD + `
uniform sampler2D uSrc; uniform vec2 uTexel;
void main(){
  vec2 t = uTexel;
  vec3 s = texture(uSrc, vUv).rgb * 4.0
    + (texture(uSrc, vUv + vec2(t.x, 0.0)).rgb + texture(uSrc, vUv - vec2(t.x, 0.0)).rgb + texture(uSrc, vUv + vec2(0.0, t.y)).rgb + texture(uSrc, vUv - vec2(0.0, t.y)).rgb) * 2.0
    + texture(uSrc, vUv + t).rgb + texture(uSrc, vUv - t).rgb + texture(uSrc, vUv + vec2(t.x, -t.y)).rgb + texture(uSrc, vUv + vec2(-t.x, t.y)).rgb;
  o = vec4(s / 16.0, 1.0);
}`,
final: HEAD + NOISE + TONE + `
uniform sampler2D uScene, uBloom; uniform float uGlow, uHal, uAberr, uGrain, uGrainSize, uExposure, uSat, uTime, uFlick;
void main(){
  vec2 dc = vUv - 0.5; float k = uAberr * 0.014 * dot(dc, dc) * 4.0;
  vec3 col = vec3(texture(uScene, vUv - dc * k).r, texture(uScene, vUv).g, texture(uScene, vUv + dc * k).b);
  vec3 bl = vec3(texture(uBloom, vUv - dc * k * 2.0).r, texture(uBloom, vUv).g, texture(uBloom, vUv + dc * k * 2.0).b);
  float bll = dot(bl, vec3(0.3, 0.5, 0.2));
  col += bl * uGlow * 1.4 + vec3(1.0, 0.3, 0.1) * bll * uHal * 1.2;
  float fl = 1.0 + uFlick * (0.05 * sin(uTime * 7.3) + 0.03 * sin(uTime * 13.7 + 1.3) + 0.04 * (hash12(vec2(floor(uTime * 24.0), 3.1)) - 0.5));
  vec2 gp = floor(gl_FragCoord.xy / uGrainSize) + floor(fract(uTime * 9.7) * 97.0) * vec2(13.1, 71.7);
  o = vec4(tone(col, uExposure * fl, uSat, gp, uGrain), 1.0);
}`,
/* print: one padded tile of the re-rendered scene, plus the live glow (low-frequency, so it scales cleanly) */
printFinal: HEAD + NOISE + TONE + `
uniform sampler2D uScene, uBloom; uniform vec2 uOrigin, uFull, uPad; uniform int uSS; uniform float uGlow, uHal, uGrain, uGrainSize, uExposure, uSat;
void main(){
  vec2 fc = gl_FragCoord.xy; ivec2 b = ivec2(fc + uPad) * uSS;
  vec3 col = vec3(0.0);                  // the tile was rendered uSS times larger; average it down before tone mapping
  for (int j = 0; j < uSS; j++) for (int i = 0; i < uSS; i++) col += texelFetch(uScene, b + ivec2(i, j), 0).rgb;
  col /= float(uSS * uSS);
  vec3 bl = texture(uBloom, (fc + uOrigin) / uFull).rgb;
  col += bl * uGlow * 1.4 + vec3(1.0, 0.3, 0.1) * dot(bl, vec3(0.3, 0.5, 0.2)) * uHal * 1.2;
  o = vec4(tone(col, uExposure, uSat, floor((fc + uOrigin) / uGrainSize), uGrain), 1.0);
}`,
};
