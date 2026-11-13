/* Test rig: serves dist/ on localhost and opens it in headless Chromium, so offline renders and the live
   engine can be driven from Node. Usage: const h = await open(); await h.page.evaluate(...); await h.close(); */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const HARNESS = `<!doctype html><meta charset=utf-8><title>harness</title><script type=module>import * as Dub from './dist/dub-engine.js'; window.Dub = Dub; window.ready = true;</script>`;

export async function open({ url = '/harness', viewport = { width: 1280, height: 900 }, headless = true } = {}) {
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    if (u === '/harness') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(HARNESS); return; }
    const file = path.join(root, u);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless, args: ['--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(base + url);
  if (url === '/harness') await page.waitForFunction('window.ready === true');
  return { page, browser, context, base, errors, close: async () => { await browser.close(); server.close(); } };
}

/* Render in the page and bring the audio back as channels of Float32. fn runs in the page and must return
   { channels: [Float32Array, Float32Array], sampleRate, ...json }. */
export async function pull(page, fn, arg) {
  const r = await page.evaluate(async ({ fn, arg }) => {
    const out = await (new Function('return (' + fn + ')')())(arg);
    const b64 = (f32) => { const u = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength); let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s); };
    return { ...out, channels: out.channels.map(b64) };
  }, { fn: fn.toString(), arg });
  r.channels = r.channels.map(s => { const b = Buffer.from(s, 'base64'); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4).slice(); });
  return r;
}

export function stats(ch) {
  let peak = 0, sum = 0, dmax = 0, nan = 0;
  for (const c of ch) for (let i = 0; i < c.length; i++) { const x = c[i]; if (!(x === x)) nan++; const a = Math.abs(x); if (a > peak) peak = a; sum += x * x; if (i) { const d = Math.abs(x - c[i - 1]); if (d > dmax) dmax = d; } }
  return { peak, rms: Math.sqrt(sum / (ch[0].length * ch.length)), maxStep: dmax, nan, seconds: 0 };
}
