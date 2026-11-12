/* psrdnoise (c) 2021 Stefan Gustavson and Ian McEwan, MIT licence, https://github.com/stegu/psrdnoise
   JavaScript port of the non-periodic 2-D branch. Returns the analytic gradient [dx, dy], which is all the
   vents need: their drift is the curl of the noise, so they never bunch up. */
const mod289 = x => x - Math.floor(x / 289) * 289;
export function psrdGrad(x, y, alpha){
  const u = x + y * 0.5, i0x = Math.floor(u), i0y = Math.floor(y), fx = u - i0x, fy = y - i0y;
  const cmp = fx >= fy ? 1 : 0, o1x = cmp, o1y = 1 - cmp;
  const vx = [i0x - i0y * 0.5, 0, 0], vy = [i0y, 0, 0];
  vx[1] = vx[0] + o1x - o1y * 0.5; vy[1] = vy[0] + o1y; vx[2] = vx[0] + 0.5; vy[2] = vy[0] + 1;
  const iu = [i0x, i0x + o1x, i0x + 1], iv = [i0y, i0y + o1y, i0y + 1];
  let gx = 0, gy = 0;
  for (let k = 0; k < 3; k++) {
    let h = mod289(iu[k]); h = mod289((h * 51 + 2) * h + iv[k]); h = mod289((h * 34 + 10) * h);
    const psi = h * 0.07482 + alpha, cx = Math.cos(psi), cy = Math.sin(psi);
    const dx = x - vx[k], dy = y - vy[k], w = Math.max(0.8 - dx * dx - dy * dy, 0);
    const w2 = w * w, w4 = w2 * w2, gd = cx * dx + cy * dy, dw = -8 * w2 * w * gd;
    gx += w4 * cx + dw * dx; gy += w4 * cy + dw * dy;
  }
  return [10.9 * gx, 10.9 * gy];
}
