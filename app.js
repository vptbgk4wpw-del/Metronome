/* Metronom — world rhythm metronome.
   Web Audio lookahead scheduler, synthesized percussion, no dependencies. */
(() => {
  'use strict';

  const CATS = window.CATEGORIES;
  const DATA = window.RHYTHMS;
  const $ = (s) => document.querySelector(s);

  /* ---------------------------------------------------------------- state */
  const STORE = 'metronom.v2';
  const defaults = { cat: CATS[0].id, sel: {}, bpm: {}, pulse: false, edits: {}, mute: {}, view: 'clock', feel: true };
  let S;
  try {
    let saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (!saved) { // v1 → v2: tempo now refers to the felt beat; drop stored tempos
      saved = JSON.parse(localStorage.getItem('metronom.v1') || '{}');
      delete saved.bpm;
      if (saved.view === 'grid') saved.view = 'seq';
    }
    S = Object.assign({}, defaults, saved);
  }
  catch (e) { S = Object.assign({}, defaults); }
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { /* private mode */ } };

  const MIN_BPM = 20, MAX_BPM = 400;
  const clamp = (v) => Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(v)));

  const cat = () => CATS.find((c) => c.id === S.cat) || CATS[0];
  const list = () => DATA[cat().id] || [];
  const selIdx = () => Math.max(0, Math.min(S.sel[cat().id] || 0, list().length - 1));
  const rhythm = () => list()[selIdx()];
  const unit = (r) => r.unit || 1;
  const lanesOf = (c) => c.strokes.map((s) => s.c);
  // a rhythm may bring its own instrument (e.g. forró: zabumba + triângulo inside Brazil)
  const strokesOf = (r) => r.strokes || r.cat.strokes;
  const kitOf = (r) => r.kit || r.cat.kit;
  const lanesOfR = (r) => strokesOf(r).map((s) => s.c);

  // Every rhythm becomes a set of independent tracks (one string per lane, 'x' = hit),
  // so several voices can sound on the same step. Single-line patterns are split by stroke.
  for (const c of CATS) {
    for (const r of DATA[c.id] || []) {
      r.cat = c;
      if (!r.tracks) {
        r.tracks = {};
        for (const ch of lanesOfR(r)) r.tracks[ch] = [...r.pattern].map((x) => (x === ch ? 'x' : '.')).join('');
      }
      r.len = Object.values(r.tracks)[0].length;
      for (const ch of lanesOfR(r)) if (!r.tracks[ch]) r.tracks[ch] = '.'.repeat(r.len);
    }
  }
  // stored edits: object of tracks (old v1/v2 edits were single strings → convert)
  for (const [id, e] of Object.entries(S.edits)) {
    if (typeof e !== 'string') continue;
    const c = CATS.find((x) => id.startsWith(x.id + '.'));
    if (!c) { delete S.edits[id]; continue; }
    S.edits[id] = {};
    for (const ch of lanesOf(c)) S.edits[id][ch] = [...e].map((x) => (x === ch ? 'x' : '.')).join('');
  }
  // drop stored edits that no longer fit the rhythm (lanes or length changed in an update)
  for (const c of CATS) {
    for (const r of DATA[c.id] || []) {
      const e = S.edits[r.id];
      if (!e) continue;
      const ok = Object.keys(r.tracks).every((ch) => typeof e[ch] === 'string' && e[ch].length === r.len)
        && Object.keys(e).every((ch) => ch in r.tracks);
      if (!ok) delete S.edits[r.id];
    }
  }
  const tracks = (r) => S.edits[r.id] || r.tracks;
  // 'x' = hit, 'X' = accented hit (a lane that uses accents plays plain 'x' softer)
  const isHit = (c) => c === 'x' || c === 'X';
  const hasAcc = (line) => line.includes('X');
  const muted = (r, ch) => !!S.mute[r.id + ':' + ch];
  const bpmOf = (r) => S.bpm[r.id] || r.bpm || Math.round((r.tempo[0] + r.tempo[1]) / 2);

  // Feel: where a step really sounds, in fractions of a step (swing + microtiming).
  // micro = offsets per position, repeated (array for all lanes, or { lane: array, '*': array }).
  const hasFeel = (r) => !!(r.micro || (r.swing && r.swing !== 0.5));
  function shift(r, i, ch) {
    if (!S.feel) return 0;
    let o = 0;
    if (r.swing && r.swing !== 0.5 && i % 2 === 1) o += 2 * r.swing - 1;
    const m = r.micro && (Array.isArray(r.micro) ? r.micro : r.micro[ch] || r.micro['*']);
    if (m) o += m[i % m.length];
    return o;
  }

  // lane char -> strength for the traditional kits (3 = low/strong … 1 = light)
  const STRENGTH = { D: 3, X: 3, T: 2, x: 2, K: 1, o: 1 };

  function groups(r) {
    const n = r.len;
    const g = String(r.group || '').split('+').map(Number).filter((x) => x > 0);
    const sum = g.reduce((a, b) => a + b, 0);
    if (!sum) return [n];
    if (sum === n) return g;
    if (n % sum === 0) return g.map((x) => (x * n) / sum);
    return [n];
  }

  // Set of step indexes where a counted beat (group) starts.
  function beatStarts(r) {
    const s = new Set();
    if (cat().pulse === 'accent') {
      // flamenco: the click follows the compás accents, not the group starts
      [...r.tracks.X].forEach((ch, i) => { if (ch === 'x') s.add(i); });
      if (s.size) return s;
    }
    let i = 0;
    for (const g of groups(r)) { s.add(i); i += g; }
    return s;
  }

  function unitGlyph(r) {
    // duration of the counted beat as a fraction of a whole note
    const step = r.step || 8;
    const u = unit(r);
    const key = `${u}/${step}`;
    const map = { '1/4': '♩', '1/8': '♪', '2/8': '♩', '3/8': '♩.', '4/16': '♩', '2/16': '♪', '6/16': '♩.', '3/16': '♪.', '1/16': '𝅘𝅥𝅯', '4/8': '𝅗𝅥', '2/4': '𝅗𝅥' };
    return map[key] || '♩';
  }

  /* ---------------------------------------------------------------- audio */
  let ctx = null, out = null, noiseBuf = null, silentEl = null;

  function ensureAudio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC({ latencyHint: 'interactive' });
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -10; comp.knee.value = 6; comp.ratio.value = 4;
      comp.attack.value = 0.002; comp.release.value = 0.08;
      out = ctx.createGain(); out.gain.value = 0.9;
      out.connect(comp); comp.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state !== 'running') ctx.resume();
    // iOS: play through the ringer/silent switch.
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* noop */ }
    if (!silentEl) {
      silentEl = new Audio(silentWav());
      silentEl.loop = true;
      silentEl.setAttribute('playsinline', '');
    }
    silentEl.play().catch(() => {});
  }

  function silentWav() {
    const sr = 8000, n = sr / 2, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
    w(36, 'data'); v.setUint32(40, n, true);
    for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  }

  let VEL = 1; // velocity of the stroke being scheduled
  function env(t, g, attack, decay) {
    const a = ctx.createGain();
    a.gain.setValueAtTime(0.0001, t);
    a.gain.exponentialRampToValueAtTime(g * VEL, t + attack);
    a.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    a.connect(out);
    return a;
  }
  // pitched membrane: sine with downward pitch sweep
  function drum(t, f0, f1, decay, g, type = 'sine') {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + Math.min(decay, 0.12));
    o.connect(env(t, g, 0.002, decay));
    o.start(t); o.stop(t + decay + 0.05);
  }
  // filtered noise burst
  function noise(t, ftype, freq, q, decay, g, delay = 0) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = ftype; f.frequency.value = freq; f.Q.value = q;
    s.connect(f); f.connect(env(t + delay, g, 0.001, decay));
    const off = Math.random() * 0.5;
    s.start(t + delay, off); s.stop(t + delay + decay + 0.05);
  }
  // short pitched click (clave, woodblock, metronome)
  function tone(t, freq, decay, g, type = 'sine') {
    const o = ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    o.connect(env(t, g, 0.001, decay));
    o.start(t); o.stop(t + decay + 0.05);
  }

  // Percussion kits — v = strength 1..3
  const KITS = {
    // darbuka / tabla (Arabic): deep dum, bright ringing tek
    darbuka(t, v) {
      if (v === 3) { drum(t, 130, 62, 0.42, 1.0); noise(t, 'lowpass', 500, 0.7, 0.04, 0.25); }
      else if (v === 2) { noise(t, 'bandpass', 5200, 1.2, 0.06, 0.75); drum(t, 620, 540, 0.07, 0.32); }
      else { noise(t, 'bandpass', 4300, 1.3, 0.045, 0.4); drum(t, 560, 500, 0.04, 0.16); }
    },
    // kudüm / bendir / darbuka (Turkish): rounder, lower tek
    kudum(t, v) {
      if (v === 3) { drum(t, 110, 55, 0.5, 1.0); noise(t, 'lowpass', 420, 0.7, 0.05, 0.25); }
      else if (v === 2) { drum(t, 330, 290, 0.14, 0.55); noise(t, 'bandpass', 3400, 1.0, 0.05, 0.45); }
      else { drum(t, 300, 270, 0.08, 0.28); noise(t, 'bandpass', 3000, 1.0, 0.035, 0.25); }
    },
    // tombak (Persian): tom deep and dry, bak sharp on the rim, light finger
    tombak(t, v) {
      if (v === 3) { drum(t, 105, 58, 0.36, 1.0); noise(t, 'lowpass', 700, 0.6, 0.03, 0.3); }
      else if (v === 2) { noise(t, 'bandpass', 3800, 1.6, 0.045, 0.8); drum(t, 480, 420, 0.05, 0.3); }
      else { noise(t, 'highpass', 5500, 0.7, 0.025, 0.35); }
    },
    // kebero (Ethiopian): big two-headed drum
    kebero(t, v) {
      if (v === 3) { drum(t, 95, 48, 0.55, 1.0); noise(t, 'lowpass', 300, 0.7, 0.05, 0.3); }
      else if (v === 2) { drum(t, 260, 210, 0.16, 0.65); noise(t, 'bandpass', 1800, 1.2, 0.04, 0.35); }
      else { drum(t, 240, 200, 0.07, 0.3); noise(t, 'bandpass', 2400, 1.0, 0.03, 0.2); }
    },
    // latin: tumba/bass low, clave/bell high, shaker-like ghost
    latin(t, v) {
      if (v === 3) { drum(t, 150, 92, 0.32, 0.95); drum(t, 75, 50, 0.3, 0.45); }
      else if (v === 2) { tone(t, 2450, 0.055, 0.6, 'sine'); tone(t, 1650, 0.03, 0.25, 'triangle'); }
      else { noise(t, 'highpass', 6500, 0.8, 0.035, 0.32); }
    },
    // palmas: claps made of three noise bursts
    palmas(t, v) {
      if (v === 3) {
        noise(t, 'bandpass', 1500, 1.4, 0.012, 0.7);
        noise(t, 'bandpass', 1700, 1.4, 0.012, 0.7, 0.008);
        noise(t, 'bandpass', 1600, 1.1, 0.11, 1.0, 0.016);
      } else if (v === 2) {
        noise(t, 'bandpass', 1700, 1.4, 0.01, 0.4);
        noise(t, 'bandpass', 1650, 1.2, 0.08, 0.5, 0.01);
      } else {
        noise(t, 'bandpass', 750, 1.2, 0.06, 0.45); // sorda: cupped, muted
      }
    },
  };

  // triangle: inharmonic partials; a new stroke chokes a ringing open one (the hand closes it)
  let triOpen = null;
  function triangle(t, open) {
    if (triOpen && triOpen.end > t) {
      const g0 = triOpen.g.gain;
      if (g0.cancelAndHoldAtTime) g0.cancelAndHoldAtTime(t); else g0.cancelScheduledValues(t);
      g0.setTargetAtTime(0.0001, t, 0.01);
    }
    triOpen = null;
    const dec = open ? 0.9 : 0.045;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(open ? 0.3 : 0.24, t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    g.connect(out);
    for (const [f, a] of [[2650, 0.5], [4420, 0.36], [6180, 0.3], [7960, 0.2], [9870, 0.14]]) {
      const o = ctx.createOscillator(), pg = ctx.createGain();
      o.frequency.value = f; pg.gain.value = a;
      o.connect(pg); pg.connect(g);
      o.start(t); o.stop(t + dec + 0.05);
    }
    if (!open) noise(t, 'highpass', 7000, 0.7, 0.012, 0.18);
    if (open) triOpen = { g, end: t + dec };
  }

  // scraper (güiro / güira): a run of short noise bursts; long stroke = more teeth
  function scrape(t, teeth, ftype, freq, g) {
    for (let k = 0; k < teeth; k++) noise(t, ftype, freq, 1.4, 0.012, g * (k === 0 ? 1 : 0.75), k * 0.014);
  }

  // Kits keyed by lane char (several lanes may sound at once)
  const KITS_CH = {
    // Brazilian batucada: surdo, tamborim / agogô, ganzá
    brasil(t, c) {
      if (c === 'D') { drum(t, 85, 50, 0.62, 1.0); noise(t, 'lowpass', 260, 0.7, 0.06, 0.25); }
      else if (c === 'T') { drum(t, 1150, 950, 0.05, 0.5, 'triangle'); noise(t, 'bandpass', 4200, 1.2, 0.03, 0.45); }
      else { noise(t, 'highpass', 6800, 0.7, 0.05, 0.22); }
    },
    // forró: zabumba (maceta open / muted, bacalhau on the bottom head) + triângulo (closed / open)
    forro(t, c) {
      if (c === 'D') { drum(t, 92, 52, 0.55, 1.0); noise(t, 'lowpass', 300, 0.7, 0.05, 0.3); }
      else if (c === 'M') { drum(t, 112, 74, 0.11, 0.95); noise(t, 'lowpass', 900, 0.7, 0.025, 0.35); }
      else if (c === 'B') { noise(t, 'bandpass', 3000, 1.5, 0.035, 0.6); drum(t, 520, 430, 0.04, 0.28, 'triangle'); }
      else if (c === 'K') triangle(t, false);
      else if (c === 'O') triangle(t, true);
    },
    // funk carioca: 808 kick, clap, atabaque / tom samples, hi-hat
    funk(t, c) {
      if (c === 'D') { drum(t, 140, 42, 0.7, 1.0); tone(t, 2600, 0.006, 0.1); }
      else if (c === 'T') {
        noise(t, 'bandpass', 1400, 1.3, 0.012, 0.6);
        noise(t, 'bandpass', 1500, 1.3, 0.012, 0.6, 0.009);
        noise(t, 'bandpass', 1350, 1.0, 0.12, 0.85, 0.018);
      }
      else if (c === 'H') { drum(t, 235, 175, 0.22, 0.75); noise(t, 'bandpass', 1500, 1.0, 0.02, 0.22); }
      else if (c === 'K') { noise(t, 'highpass', 8000, 0.8, 0.03, 0.28); }
    },
    // Afro-Latin percussion section; acc = accented / long stroke
    perc(t, c, acc) {
      switch (c) {
        case 'C': tone(t, 2500, 0.05, 0.55); tone(t, 1700, 0.03, 0.18, 'triangle'); break; // clave
        case 'B': // campana / cencerro: mouth (acc) lower and open, body higher and short
          if (acc) { tone(t, 560, 0.22, 0.22, 'square'); tone(t, 845, 0.2, 0.16, 'square'); noise(t, 'bandpass', 2600, 2, 0.04, 0.2); }
          else { tone(t, 640, 0.07, 0.16, 'square'); tone(t, 960, 0.06, 0.12, 'square'); }
          break;
        case 'P': tone(t, 1850, 0.03, 0.3, 'triangle'); noise(t, 'bandpass', 3600, 1.5, 0.025, 0.4); break; // cáscara / palitos
        case 'H': drum(t, acc ? 400 : 470, acc ? 370 : 440, acc ? 0.14 : 0.07, 0.5); noise(t, 'bandpass', 3000, 1.2, 0.015, 0.2); break; // bongó
        case 'S': noise(t, 'bandpass', 1900, 1.0, 0.05, 0.75); drum(t, 400, 350, 0.04, 0.3); break; // conga slap
        case 'O': drum(t, 330, 305, 0.28, 0.72); break; // conga / quinto open tone
        case 'L': drum(t, 225, 205, 0.34, 0.78); break; // tumba / salidor open tone
        case 'D': drum(t, 98, 96, 0.38, 0.75, 'triangle'); drum(t, 196, 194, 0.12, 0.15); break; // bass (tumbao)
        case 'T': // tambora / bombo: open hand on the head (acc) or stick on the rim
          if (acc) { drum(t, 150, 105, 0.3, 0.9); noise(t, 'lowpass', 500, 0.7, 0.03, 0.25); }
          else { tone(t, 1300, 0.03, 0.4, 'triangle'); noise(t, 'bandpass', 2400, 1.3, 0.02, 0.3); }
          break;
        case 'Y': drum(t, 260, 235, 0.16, 0.65); break; // llamador
        case 'G': scrape(t, acc ? 7 : 2, 'bandpass', 3800, 0.3); break; // güiro / guacharaca
        case 'R': scrape(t, acc ? 7 : 2, 'highpass', 6500, 0.28); break; // güira (metal)
        case 'M': noise(t, 'highpass', 5200, 0.7, acc ? 0.06 : 0.035, acc ? 0.34 : 0.22); break; // maracas / shekeré
      }
    },
    // drum machine / breakbeat kit: kick, snare, ghost snare, closed hat, open hat
    drums(t, c) {
      if (c === 'D') { drum(t, 160, 46, 0.38, 1.0); tone(t, 3200, 0.006, 0.12); }
      else if (c === 'T') { noise(t, 'bandpass', 1900, 0.8, 0.16, 0.85); drum(t, 230, 185, 0.11, 0.42, 'triangle'); }
      else if (c === 'G') { noise(t, 'bandpass', 2000, 0.9, 0.06, 0.22); drum(t, 230, 190, 0.05, 0.1, 'triangle'); }
      else if (c === 'K') { noise(t, 'highpass', 8200, 0.8, 0.035, 0.3); }
      else if (c === 'O') { noise(t, 'highpass', 7600, 0.7, 0.26, 0.26); }
    },
  };

  function playLane(kit, t, c, acc = true, soft = false) {
    VEL = soft ? 0.5 : 1;
    if (KITS_CH[kit]) KITS_CH[kit](t, c, acc);
    else if (KITS[kit]) KITS[kit](t, STRENGTH[c] || 1);
    VEL = 1;
  }

  function pulseClick(t, first) {
    tone(t, first ? 2200 : 1550, 0.03, first ? 0.42 : 0.3, 'square');
  }

  // The chord helper (chords.js) shares the audio graph and shows a small transport.
  const emit = () => document.dispatchEvent(new CustomEvent('metro'));
  window.METRO = {
    audio() { ensureAudio(); return { ctx, out }; },
    toggle() { if (playing) stop(); else start(); },
    get playing() { return playing; },
    info() { const r = rhythm(); return { name: r.name, bpm: bpmOf(r) }; },
  };

  /* ------------------------------------------------------------ scheduler */
  const LOOKAHEAD = 0.12;
  let playing = false, step = 0, nextTime = 0, queue = [], hq = [], raf = 0, worker = null, intervalId = 0, wakeLock = null;
  let cur = { starts: new Set(), len: 1 };

  function snapshot() {
    const r = rhythm();
    const starts = beatStarts(r);
    cur = { r, tr: tracks(r), starts, first: Math.min(...starts), len: r.len, kit: kitOf(r) };
  }

  // Steps sit on an even grid; swing and microtiming move single strokes off it (see shift).
  function stepDur() {
    return 60 / bpmOf(cur.r) / unit(cur.r);
  }

  function tick() {
    if (!playing) return;
    while (nextTime < ctx.currentTime + LOOKAHEAD) {
      const i = step % cur.len;
      const d = stepDur();
      let tv = 0, nv = 0;
      for (const [ch, line] of Object.entries(cur.tr)) {
        if (!isHit(line[i]) || muted(cur.r, ch)) continue;
        const o = shift(cur.r, i, ch) * d;
        const accLane = hasAcc(line);
        playLane(cur.kit, Math.max(ctx.currentTime, nextTime + o), ch, line[i] === 'X', accLane && line[i] === 'x');
        tv += o; nv++;
      }
      const isBeat = cur.starts.has(i);
      if (S.pulse && isBeat) pulseClick(nextTime, i === cur.first);
      // t = grid time (hand, LED), tv = when the step's strokes actually sound (dot highlight)
      const e = { t: nextTime, tv: nextTime + (nv ? tv / nv : 0), i, beat: isBeat, d };
      queue.push(e);
      hq.push(e);
      nextTime += d;
      step = (i + 1) % cur.len;
    }
  }

  function startTimer() {
    try {
      if (!worker) {
        const src = 'let id=0;onmessage=e=>{clearInterval(id);if(e.data)id=setInterval(()=>postMessage(0),25)}';
        worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
        worker.onmessage = tick;
      }
      worker.postMessage(1);
    } catch (e) {
      intervalId = setInterval(tick, 25);
    }
  }
  function stopTimer() {
    if (worker) worker.postMessage(0);
    clearInterval(intervalId);
  }

  function start() {
    ensureAudio();
    snapshot();
    playing = true;
    step = 0;
    queue = []; hq = [];
    nextTime = ctx.currentTime + 0.06;
    tick();
    startTimer();
    raf = requestAnimationFrame(draw);
    requestWake();
    $('#play').textContent = 'Stop';
    $('#play').setAttribute('aria-pressed', 'true');
    emit();
  }

  function stop() {
    playing = false;
    stopTimer();
    cancelAnimationFrame(raf);
    queue = []; hq = [];
    highlight(-1);
    lastHit = null;
    if (handEl) handEl.style.visibility = 'hidden';
    $('#led').className = 'beat-led';
    releaseWake();
    $('#play').textContent = 'Start';
    $('#play').setAttribute('aria-pressed', 'false');
    emit();
  }

  // Restart the cycle from step 0 on the next step boundary (rhythm changed).
  function resync() {
    if (!playing) return;
    snapshot();
    queue = []; hq = [];
    step = 0;
  }

  async function requestWake() {
    try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* noop */ }
  }
  function releaseWake() { try { wakeLock && wakeLock.release(); } catch (e) { /* noop */ } wakeLock = null; }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && playing) { requestWake(); ensureAudio(); }
  });

  /* --------------------------------------------------------------- render */
  let cells = [];
  let lastOn = -1;
  let handEl = null, clockOff = 0, lastHit = null;
  let seqPages = null, seqPage = 0; // groovebox paging for long cycles: [{start, end, el}]

  function highlight(i) {
    if (i === lastOn) return;
    const each = (k, fn) => { const c = cells[k]; if (c) (Array.isArray(c) ? c : [c]).forEach(fn); };
    if (lastOn >= 0) each(lastOn, (el) => el.classList.remove('on'));
    if (i >= 0) each(i, (el) => el.classList.add('on'));
    lastOn = i;
    if (seqPages && i >= 0) {
      const pg = seqPages.findIndex((p) => i >= p.start && i < p.end);
      if (pg >= 0 && pg !== seqPage) showPage(pg);
    }
  }

  let ledTimer = 0;
  function draw() {
    if (!playing) return;
    const lat = Math.min(0.2, (ctx.outputLatency || 0) + (ctx.baseLatency || 0));
    const now = ctx.currentTime - lat;
    let hit = null;
    while (queue.length && queue[0].t <= now) hit = queue.shift();
    let lit = null;
    while (hq.length && hq[0].tv <= now) lit = hq.shift();
    if (lit) highlight(lit.i);
    if (hit) {
      lastHit = hit;
      if (hit.beat) {
        const led = $('#led');
        led.className = 'beat-led on' + (hit.i === cur.first ? '' : ' weak');
        clearTimeout(ledTimer);
        ledTimer = setTimeout(() => { led.className = 'beat-led'; }, 90);
      }
    }
    if (handEl && lastHit) {
      // smooth sweep between scheduled steps
      const frac = lastHit.i + Math.max(0, Math.min(0.999, (now - lastHit.t) / lastHit.d));
      handEl.setAttribute('transform', `rotate(${(((frac + clockOff) / cur.len) * 360).toFixed(2)})`);
      handEl.style.visibility = 'visible';
    }
    raf = requestAnimationFrame(draw);
  }

  function renderCats() {
    const nav = $('#cats');
    nav.innerHTML = '';
    CATS.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'cat';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(c.id === S.cat));
      b.innerHTML = `<span class="n">${String(i + 1).padStart(2, '0')}</span>${c.name}`;
      b.onclick = () => { if (S.cat === c.id) return; S.cat = c.id; save(); renderAll(); resync(); };
      nav.appendChild(b);
    });
  }

  function renderTitle() {
    const r = rhythm();
    const l = list();
    $('#rIdx').textContent = `${String(selIdx() + 1).padStart(2, '0')}/${String(l.length).padStart(2, '0')}`;
    $('#rName').textContent = r.name.replace(/-/g, '\u2011');
    $('#rAlt').textContent = r.alt || '';
    $('#rMeter').textContent = r.meter;
    $('#rGroup').textContent = r.groupLabel || r.group || '';
    renderFeel();
    $('#rNote').textContent = (r.note || '') + (r.conf === 'p' ? ' · Wzór orientacyjny.' : '');
    $('#rRange').textContent = `typowo ${r.tempo[0]}–${r.tempo[1]}`;
  }

  function renderFeel() {
    const r = rhythm();
    const b = $('#feel');
    b.hidden = !hasFeel(r);
    if (b.hidden) return;
    const what = r.micro ? 'mikrotiming' : `swing ${Math.round(r.swing * 100)}%`;
    b.textContent = S.feel ? `Feel: ${what}` : 'Feel: równo';
    b.setAttribute('aria-pressed', String(S.feel));
    b.title = S.feel ? 'Wyłącz feel — wszystkie uderzenia na siatce' : 'Włącz feel (swing / mikrotiming)';
  }

  function renderGrid() {
    const clock = S.view !== 'seq';
    document.querySelectorAll('#views button').forEach((b) =>
      b.setAttribute('aria-pressed', String((b.dataset.view === 'seq') !== clock)));
    const keep = lastOn;
    if (clock) renderClock(); else renderSeq();
    $('#reset').hidden = !S.edits[rhythm().id];
    if (playing && keep >= 0) highlight(keep);
  }

  // Rhythm clock: steps on a circle, each voice on its own ring with its own polygon,
  // a sweeping hand. Rings are the voices used by the rhythm (outer = first lane).
  function clockOffset(r) {
    if (r.counts && r.len === 12) {
      const k = r.counts.split(/\s+/).indexOf('12');
      if (k >= 0) return (12 - k) % 12; // flamenco: count 12 sits at the top, like a clock face
    }
    return 0;
  }

  function clockLanes(r) {
    const tr = tracks(r);
    const used = lanesOfR(r).filter((ch) => /[xX]/.test(r.tracks[ch]) || /[xX]/.test(tr[ch]));
    return used.length ? used : [lanesOfR(r)[0]];
  }

  function renderClock() {
    const r = rhythm();
    const tr = tracks(r);
    const n = r.len;
    const off = clockOffset(r);
    const counts = r.counts ? r.counts.split(/\s+/) : null;
    const gstarts = new Set();
    { let i = 0; for (const g of groups(r)) { gstarts.add(i); i += g; } }
    const lanes = clockLanes(r);
    const R = 74, L = 88;
    const gap = lanes.length > 1 ? Math.min(18, 52 / (lanes.length - 1)) : 0;
    const ang = (i) => ((i + off) / n) * 2 * Math.PI - Math.PI / 2;
    const pt = (i, rad) => [+(Math.cos(ang(i)) * rad).toFixed(2), +(Math.sin(ang(i)) * rad).toFixed(2)];
    const ticks = [];

    let svg = `<svg class="clock" viewBox="-100 -100 200 200" role="img" aria-label="Zegar rytmu: ${n} kroków, ${lanes.length} głosy">`;
    svg += `<line class="axis" x1="0" y1="${-R}" x2="0" y2="${R}"/><line class="axis" x1="${-R}" y1="0" x2="${R}" y2="0"/>`;
    const dots = [];
    lanes.forEach((ch, k) => {
      const rad = R - k * gap;
      const line = tr[ch];
      const m = muted(r, ch) ? ' muted' : '';
      svg += `<g class="lane lane${k}${m}"><circle class="ring" r="${rad}"/>`;
      const on = [];
      for (let i = 0; i < n; i++) if (isHit(line[i])) on.push(pt(i + shift(r, i, ch), rad).join(','));
      if (on.length >= 2) svg += `<polygon class="poly" points="${on.join(' ')}"/>`;
      svg += '</g>';
      const big = Math.max(2.6, 5.2 - k * 0.7), small = Math.max(1.2, 2.1 - k * 0.2);
      const acc = hasAcc(line), mid = (big + small) / 2 + 0.3;
      for (let i = 0; i < n; i++) {
        const hit = isHit(line[i]);
        const size = !hit ? small : acc && line[i] === 'x' ? mid : big;
        const sh = hit ? shift(r, i, ch) : 0;
        const [x, y] = pt(i + sh, rad);
        if (Math.abs(sh) > 0.01) { // grid mark where the stroke would sit on a metronome
          const [x1, y1] = pt(i, rad - 3.2), [x2, y2] = pt(i, rad + 3.2);
          ticks.push(`<line class="gridmark" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`);
        }
        dots.push(`<g class="dot lane${k}${m}${hit ? ' hit' : ''}" data-i="${i}" data-c="${ch}" role="button" aria-label="Krok ${i + 1}, ${laneName(ch)}: ${hit ? 'tak' : 'nie'}">` +
          `<circle class="tap" cx="${x}" cy="${y}" r="${Math.min(9, gap / 2 || 9)}"/><circle class="vis" cx="${x}" cy="${y}" r="${size}"/></g>`);
      }
    });
    svg += ticks.join('');
    svg += `<g id="hand" class="hand" style="visibility:hidden"><line x1="0" y1="0" x2="0" y2="${-R}"/><circle cx="0" cy="${-R}" r="1.8"/></g>`;
    svg += dots.join('');
    const fs = n > 16 ? 6 : 7;
    const sparse = n > 24 && !counts;
    let beatNo = 0;
    for (let i = 0; i < n; i++) {
      if (sparse && !gstarts.has(i)) continue;
      const [x, y] = pt(i, L);
      const lbl = counts ? counts[i] : sparse ? String(++beatNo) : String(i + 1);
      const strong = counts ? r.tracks.X && r.tracks.X[i] === 'x' : gstarts.has(i);
      svg += `<text class="num${strong ? ' beat' : ''}" x="${x}" y="${y}" font-size="${fs}">${lbl}</text>`;
    }
    svg += `<circle class="hub" r="1.6"/></svg>`;

    const grid = $('#grid');
    grid.classList.remove('is-seq', 'two');
    grid.classList.add('is-clock');
    seqPages = null;
    grid.innerHTML = `<div class="clock-wrap">${svg}</div>`;
    cells = Array.from({ length: n }, () => []);
    grid.querySelectorAll('.dot').forEach((d) => {
      cells[+d.dataset.i].push(d);
      d.onclick = () => toggleStep(+d.dataset.i, d.dataset.c);
    });
    handEl = grid.querySelector('#hand');
    clockOff = off;
    fitClock();
    lastOn = -1;
  }

  // The clock takes whatever height is left between the title and the tempo block.
  function fitClock() {
    const grid = $('#grid');
    const svg = grid.querySelector('.clock');
    if (!svg) return;
    const size = Math.max(160, Math.min(grid.clientWidth, grid.clientHeight - 4, 460));
    svg.style.width = svg.style.height = size + 'px';
  }
  if ('ResizeObserver' in window) new ResizeObserver(fitClock).observe($('#grid'));
  else window.addEventListener('resize', fitClock);

  // Groovebox-style step sequencer: one lane per stroke type, one column per step.
  function renderSeq() {
    handEl = null;
    const r = rhythm();
    const tr = tracks(r);
    const n = r.len;
    const gs = groups(r);
    const counts = r.counts ? r.counts.split(/\s+/) : null;
    const gstarts = new Set();
    { let i = 0; for (const g of gs) { gstarts.add(i); i += g; } }
    const lanes = strokesOf(r);

    // blocks of <= 16 steps, split at group boundaries
    const maxRow = Math.ceil(n / Math.ceil(n / 16));
    const blocks = [];
    let cur = [], len = 0;
    for (const g of gs) {
      if (len + g > maxRow && cur.length) { blocks.push(cur); cur = []; len = 0; }
      cur.push(g); len += g;
    }
    if (cur.length) blocks.push(cur);

    const grid = $('#grid');
    const paged = blocks.length > 2;
    grid.classList.remove('is-clock');
    grid.classList.add('is-seq');
    grid.classList.toggle('two', blocks.length === 2);
    grid.style.setProperty('--lanes', lanes.length);
    grid.innerHTML = '';
    seqPages = paged ? [] : null;
    if (paged) {
      const nav = document.createElement('div');
      nav.className = 'seq-pages';
      nav.innerHTML = '<span>Takt</span>' + blocks.map((_, k) => `<button data-p="${k}" aria-pressed="false">${k + 1}</button>`).join('');
      nav.querySelectorAll('button').forEach((bt) => { bt.onclick = () => showPage(+bt.dataset.p); });
      grid.appendChild(nav);
    }
    cells = Array.from({ length: n }, () => []);
    lastOn = -1;

    let start = 0;
    for (const blk of blocks) {
      const blockEl = document.createElement('div');
      blockEl.className = 'seq-block';
      const rows = [{ kind: 'num' }].concat(lanes.map((l) => ({ kind: 'lane', lane: l })));
      for (const row of rows) {
        const rowEl = document.createElement('div');
        rowEl.className = 'seq-row' + (row.kind === 'num' ? ' nums' : '');
        const head = document.createElement(row.kind === 'lane' ? 'button' : 'span');
        head.className = 'seq-head';
        if (row.kind === 'lane') {
          const isMuted = muted(r, row.lane.c);
          head.textContent = row.lane.short || row.lane.label;
          head.title = 'Wycisz / włącz';
          head.setAttribute('aria-pressed', String(!isMuted));
          head.onclick = () => toggleMute(row.lane.c);
          if (isMuted) rowEl.classList.add('muted');
        }
        rowEl.appendChild(head);
        let i = start;
        for (const g of blk) {
          const grp = document.createElement('div');
          grp.className = 'seq-grp';
          grp.style.setProperty('--n', g);
          for (let k = 0; k < g; k++, i++) {
            let el;
            if (row.kind === 'num') {
              el = document.createElement('span');
              el.className = 'seq-num' + ((counts ? r.tracks.X && r.tracks.X[i] === 'x' : gstarts.has(i)) ? ' beat' : '');
              el.textContent = counts ? counts[i] : String(i + 1);
            } else {
              el = document.createElement('button');
              el.className = 'pad';
              const onLane = isHit(tr[row.lane.c][i]);
              if (onLane) {
                el.classList.add('hit');
                if (tr[row.lane.c][i] === 'x' && hasAcc(tr[row.lane.c])) el.classList.add('soft');
                const sh = shift(r, i, row.lane.c);
                if (Math.abs(sh) > 0.01) el.style.setProperty('--mt', sh.toFixed(3));
              }
              if (gstarts.has(i)) el.classList.add('first');
              el.dataset.i = i;
              el.setAttribute('aria-label', `Krok ${i + 1}, ${row.lane.label}: ${onLane ? 'tak' : 'nie'}`);
              const step = i, c = row.lane.c;
              el.onclick = () => toggleStep(step, c);
            }
            grp.appendChild(el);
            cells[i].push(el);
          }
          rowEl.appendChild(grp);
        }
        blockEl.appendChild(rowEl);
      }
      grid.appendChild(blockEl);
      const end = start + blk.reduce((a2, b2) => a2 + b2, 0);
      if (paged) seqPages.push({ start, end, el: blockEl });
      start = end;
    }
    if (paged) showPage(Math.min(seqPage, seqPages.length - 1));
  }

  function showPage(k) {
    if (!seqPages) return;
    seqPage = k;
    seqPages.forEach((p, j) => { p.el.hidden = j !== k; });
    document.querySelectorAll('.seq-pages button').forEach((bt) => bt.setAttribute('aria-pressed', String(+bt.dataset.p === k)));
  }

  function laneName(ch) {
    const s = strokesOf(rhythm()).find((x) => x.c === ch);
    return s ? s.label : ch;
  }

  function toggleMute(ch) {
    const k = rhythm().id + ':' + ch;
    if (S.mute[k]) delete S.mute[k]; else S.mute[k] = 1;
    save(); renderLegend(); renderGrid();
  }

  function renderLegend() {
    const r = rhythm();
    const el = $('#legend');
    el.innerHTML = '';
    // legend follows the clock rings, outer → inner
    const used = clockLanes(r);
    for (const s of strokesOf(r)) {
      const k = used.indexOf(s.c);
      if (k < 0) continue;
      const b = document.createElement('button');
      b.className = 'lg lane' + k;
      b.setAttribute('aria-pressed', String(!muted(r, s.c)));
      b.title = 'Wycisz / włącz';
      b.innerHTML = `<span class="sw"></span>${s.short || s.label}`;
      b.onclick = () => toggleMute(s.c);
      el.appendChild(b);
    }
  }

  function renderTempo() {
    const r = rhythm();
    const b = bpmOf(r);
    $('#bpm').textContent = b;
    $('#slider').value = b;
    $('#unit').textContent = unitGlyph(r);
    emit();
  }

  function renderSheet() {
    const ol = $('#sheetList');
    ol.innerHTML = '';
    $('#sheetTitle').textContent = cat().name;
    list().forEach((r, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      if (i === selIdx()) b.setAttribute('aria-current', 'true');
      b.innerHTML = `<span class="n">${String(i + 1).padStart(2, '0')}</span>` +
        `<span class="nm">${r.name}${r.alt ? `<small>${r.alt}</small>` : ''}</span>` +
        `<span class="m">${r.meter}</span>`;
      b.onclick = () => { select(i); closeSheet(); };
      li.appendChild(b);
      ol.appendChild(li);
    });
  }

  function renderAll() {
    renderCats();
    renderTitle();
    renderGrid();
    renderLegend();
    renderTempo();
  }

  /* -------------------------------------------------------------- actions */
  function select(i) {
    const n = list().length;
    S.sel[cat().id] = ((i % n) + n) % n;
    seqPage = 0;
    save();
    renderTitle(); renderGrid(); renderLegend(); renderTempo();
    resync();
  }

  function setBpm(v) {
    const r = rhythm();
    S.bpm[r.id] = clamp(v);
    renderTempo();
    saveSoon();
  }
  let saveT = 0;
  function saveSoon() { clearTimeout(saveT); saveT = setTimeout(save, 300); }

  function toggleStep(i, ch) {
    const r = rhythm();
    const tr = Object.assign({}, tracks(r));
    const line = tr[ch].split('');
    line[i] = isHit(line[i]) ? '.' : 'x';
    tr[ch] = line.join('');
    const same = Object.keys(r.tracks).every((c) => tr[c] === r.tracks[c]);
    if (same) delete S.edits[r.id]; else S.edits[r.id] = tr;
    save();
    renderGrid();
    renderLegend();
    if (playing) cur.tr = tracks(r);
  }

  function openSheet() { renderSheet(); $('#sheet').hidden = false; $('#closeList').focus(); }
  function closeSheet() { $('#sheet').hidden = true; $('#openList').focus(); }

  // tap tempo
  let taps = [];
  function tap() {
    const now = performance.now();
    if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
    taps.push(now);
    if (taps.length > 5) taps.shift();
    if (taps.length >= 2) {
      const iv = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
      setBpm(60000 / iv);
    }
  }

  // press-and-hold repeat for +/-
  function holdRepeat(el, fn) {
    let t1 = 0, t2 = 0;
    const end = () => { clearTimeout(t1); clearInterval(t2); };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      fn(1);
      t1 = setTimeout(() => { t2 = setInterval(() => fn(5), 90); }, 420);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => el.addEventListener(ev, end));
  }

  // vertical drag on the big number
  function dragBpm(el) {
    let y0 = 0, b0 = 0, active = false;
    el.addEventListener('pointerdown', (e) => {
      active = true; y0 = e.clientY; b0 = bpmOf(rhythm());
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!active) return;
      setBpm(b0 + Math.round((y0 - e.clientY) / 4));
    });
    const end = () => { active = false; };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  /* --------------------------------------------------------------- wiring */
  $('#play').onclick = () => (playing ? stop() : start());
  $('#tap').onclick = tap;
  $('#pulse').onclick = () => {
    S.pulse = !S.pulse; save();
    $('#pulse').setAttribute('aria-pressed', String(S.pulse));
  };
  $('#pulse').setAttribute('aria-pressed', String(S.pulse));
  $('#prev').onclick = () => select(selIdx() - 1);
  $('#next').onclick = () => select(selIdx() + 1);
  $('#openList').onclick = openSheet;
  $('#openList2').onclick = openSheet;
  document.querySelectorAll('#views button').forEach((b) => {
    b.onclick = () => { S.view = b.dataset.view; save(); renderGrid(); };
  });
  $('#feel').onclick = () => { S.feel = !S.feel; save(); renderFeel(); renderGrid(); };
  $('#closeList').onclick = closeSheet;
  $('#reset').onclick = () => { delete S.edits[rhythm().id]; save(); renderGrid(); renderLegend(); if (playing) cur.tr = tracks(rhythm()); };
  $('#rRange').onclick = () => { const r = rhythm(); setBpm((r.tempo[0] + r.tempo[1]) / 2); };
  $('#slider').oninput = (e) => setBpm(+e.target.value);
  holdRepeat($('#minus'), (d) => setBpm(bpmOf(rhythm()) - d));
  holdRepeat($('#plus'), (d) => setBpm(bpmOf(rhythm()) + d));
  dragBpm($('#bpm'));

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    // in the chord helper only the space bar (start / stop) belongs to the metronome
    if (document.body.dataset.app === 'chords' && e.code !== 'Space') return;
    if (!$('#sheet').hidden && e.key === 'Escape') { closeSheet(); return; }
    if (e.code === 'Space') { e.preventDefault(); playing ? stop() : start(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setBpm(bpmOf(rhythm()) + (e.shiftKey ? 10 : 1)); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setBpm(bpmOf(rhythm()) - (e.shiftKey ? 10 : 1)); }
    else if (e.key === 'ArrowRight') select(selIdx() + 1);
    else if (e.key === 'ArrowLeft') select(selIdx() - 1);
    else if (e.key === 't' || e.key === 'T') tap();
  });

  renderAll();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
