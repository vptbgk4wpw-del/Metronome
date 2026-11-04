/* Metronom — world rhythm metronome.
   Web Audio lookahead scheduler, synthesized percussion, no dependencies. */
(() => {
  'use strict';

  const CATS = window.CATEGORIES;
  const DATA = window.RHYTHMS;
  const $ = (s) => document.querySelector(s);

  /* ---------------------------------------------------------------- state */
  const STORE = 'metronom.v2';
  const defaults = { cat: CATS[0].id, sel: {}, bpm: {}, pulse: false, edits: {}, mute: {}, view: 'clock' };
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
  const pattern = (r) => S.edits[r.id] || r.pattern;
  const unit = (r) => r.unit || 1;
  const bpmOf = (r) => S.bpm[r.id] || r.bpm || Math.round((r.tempo[0] + r.tempo[1]) / 2);

  // stroke char -> strength 0..3 (drives both the bar height and the sound)
  const STRENGTH = { D: 3, X: 3, T: 2, x: 2, K: 1, o: 1, '.': 0 };

  function groups(r) {
    const n = r.pattern.length;
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
      [...r.pattern].forEach((ch, i) => { if (ch === 'X') s.add(i); });
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

  function env(t, g, attack, decay) {
    const a = ctx.createGain();
    a.gain.setValueAtTime(0.0001, t);
    a.gain.exponentialRampToValueAtTime(g, t + attack);
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

  function pulseClick(t, first) {
    tone(t, first ? 2200 : 1550, 0.03, first ? 0.42 : 0.3, 'square');
  }

  /* ------------------------------------------------------------ scheduler */
  const LOOKAHEAD = 0.12;
  let playing = false, step = 0, nextTime = 0, queue = [], raf = 0, worker = null, intervalId = 0, wakeLock = null;
  let cur = { pat: '', starts: new Set(), len: 1 };

  function snapshot() {
    const r = rhythm();
    const starts = beatStarts(r);
    cur = { r, pat: pattern(r), starts, first: Math.min(...starts), len: r.pattern.length, kit: KITS[cat().kit] };
  }

  function stepDur() { return 60 / bpmOf(cur.r) / unit(cur.r); }

  function tick() {
    if (!playing) return;
    while (nextTime < ctx.currentTime + LOOKAHEAD) {
      const i = step % cur.len;
      const ch = cur.pat[i];
      const v = STRENGTH[ch] || 0;
      if (v && !S.mute[cur.r.id + ':' + v]) cur.kit(nextTime, v);
      const isBeat = cur.starts.has(i);
      if (S.pulse && isBeat) pulseClick(nextTime, i === cur.first);
      queue.push({ t: nextTime, i, beat: isBeat });
      nextTime += stepDur();
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
    queue = [];
    nextTime = ctx.currentTime + 0.06;
    tick();
    startTimer();
    raf = requestAnimationFrame(draw);
    requestWake();
    $('#play').textContent = 'Stop';
    $('#play').setAttribute('aria-pressed', 'true');
  }

  function stop() {
    playing = false;
    stopTimer();
    cancelAnimationFrame(raf);
    queue = [];
    highlight(-1);
    lastHit = null;
    if (handEl) handEl.style.visibility = 'hidden';
    $('#led').className = 'beat-led';
    releaseWake();
    $('#play').textContent = 'Start';
    $('#play').setAttribute('aria-pressed', 'false');
  }

  // Restart the cycle from step 0 on the next step boundary (rhythm changed).
  function resync() {
    if (!playing) return;
    snapshot();
    queue = [];
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

  function highlight(i) {
    if (i === lastOn) return;
    const each = (k, fn) => { const c = cells[k]; if (c) (Array.isArray(c) ? c : [c]).forEach(fn); };
    if (lastOn >= 0) each(lastOn, (el) => el.classList.remove('on'));
    if (i >= 0) each(i, (el) => el.classList.add('on'));
    lastOn = i;
  }

  let ledTimer = 0;
  function draw() {
    if (!playing) return;
    const lat = Math.min(0.2, (ctx.outputLatency || 0) + (ctx.baseLatency || 0));
    const now = ctx.currentTime - lat;
    let hit = null;
    while (queue.length && queue[0].t <= now) hit = queue.shift();
    if (hit) {
      lastHit = hit;
      highlight(hit.i);
      if (hit.beat) {
        const led = $('#led');
        led.className = 'beat-led on' + (hit.i === cur.first ? '' : ' weak');
        clearTimeout(ledTimer);
        ledTimer = setTimeout(() => { led.className = 'beat-led'; }, 90);
      }
    }
    if (handEl && lastHit) {
      // smooth sweep between scheduled steps
      const frac = lastHit.i + Math.max(0, Math.min(0.999, (now - lastHit.t) / stepDur()));
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
    $('#rNote').textContent = (r.note || '') + (r.conf === 'p' ? ' Wzór orientacyjny — źródła potwierdzają metrum, uderzenia warto dopasować.' : '');
    $('#rRange').textContent = `typowo ${r.tempo[0]}–${r.tempo[1]}`;
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

  // Rhythm clock: steps on a circle, strokes joined into a polygon, a sweeping hand.
  function clockOffset(r) {
    const n = r.pattern.length;
    if (r.counts && n === 12) {
      const k = r.counts.split(/\s+/).indexOf('12');
      if (k >= 0) return (n - k) % n; // flamenco: count 12 sits at the top, like a clock face
    }
    return 0;
  }

  function renderClock() {
    const r = rhythm();
    const pat = pattern(r);
    const n = pat.length;
    const off = clockOffset(r);
    const counts = r.counts ? r.counts.split(/\s+/) : null;
    const gstarts = new Set();
    { let i = 0; for (const g of groups(r)) { gstarts.add(i); i += g; } }
    const R = 74, L = 88;
    const ang = (i) => ((i + off) / n) * 2 * Math.PI - Math.PI / 2;
    const pt = (i, rad) => [+(Math.cos(ang(i)) * rad).toFixed(2), +(Math.sin(ang(i)) * rad).toFixed(2)];
    const RAD = { 3: 5.2, 2: 4, 1: 3.4, 0: 2.1 };

    let svg = `<svg class="clock" viewBox="-100 -100 200 200" role="img" aria-label="Zegar rytmu: ${n} kroków">`;
    svg += `<line class="axis" x1="0" y1="${-R}" x2="0" y2="${R}"/><line class="axis" x1="${-R}" y1="0" x2="${R}" y2="0"/>`;
    svg += `<circle class="ring" r="${R}"/>`;
    const on = [];
    for (let i = 0; i < n; i++) if (STRENGTH[pat[i]]) on.push(pt(i, R).join(','));
    if (on.length >= 2) svg += `<polygon class="poly" points="${on.join(' ')}"/>`;
    svg += `<g id="hand" class="hand" style="visibility:hidden"><line x1="0" y1="0" x2="0" y2="${-R}"/><circle cx="0" cy="${-R}" r="1.8"/></g>`;
    for (let i = 0; i < n; i++) {
      const v = STRENGTH[pat[i]] || 0;
      const [x, y] = pt(i, R);
      const muted = v && S.mute[r.id + ':' + v] ? ' muted' : '';
      svg += `<g class="dot${muted}" data-i="${i}" data-v="${v}" role="button" aria-label="Krok ${i + 1}: ${strokeName(pat[i])}">` +
        `<circle class="hit" cx="${x}" cy="${y}" r="9"/><circle class="vis" cx="${x}" cy="${y}" r="${RAD[v]}"/></g>`;
    }
    const fs = n > 16 ? 6 : 7;
    for (let i = 0; i < n; i++) {
      const [x, y] = pt(i, L);
      const lbl = counts ? counts[i] : String(i + 1);
      const strong = counts ? pat[i] === 'X' || r.pattern[i] === 'X' : gstarts.has(i);
      svg += `<text class="num${strong ? ' beat' : ''}" x="${x}" y="${y}" font-size="${fs}">${lbl}</text>`;
    }
    svg += `<circle class="hub" r="1.6"/></svg>`;

    const grid = $('#grid');
    grid.classList.remove('is-seq', 'two');
    grid.classList.add('is-clock');
    grid.innerHTML = `<div class="clock-wrap">${svg}</div>`;
    cells = [...grid.querySelectorAll('.dot')];
    cells.forEach((c) => { c.onclick = () => editStep(+c.dataset.i); });
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
    const pat = pattern(r);
    const n = pat.length;
    const gs = groups(r);
    const counts = r.counts ? r.counts.split(/\s+/) : null;
    const gstarts = new Set();
    { let i = 0; for (const g of gs) { gstarts.add(i); i += g; } }
    const lanes = cat().strokes;

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
    grid.classList.remove('is-clock');
    grid.classList.add('is-seq');
    grid.classList.toggle('two', blocks.length > 1);
    grid.innerHTML = '';
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
          const v = STRENGTH[row.lane.c];
          const muted = !!S.mute[r.id + ':' + v];
          head.textContent = row.lane.short || row.lane.label;
          head.title = 'Wycisz / włącz';
          head.setAttribute('aria-pressed', String(!muted));
          head.onclick = () => toggleMute(v);
          if (muted) rowEl.classList.add('muted');
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
              el.className = 'seq-num' + ((counts ? r.pattern[i] === 'X' : gstarts.has(i)) ? ' beat' : '');
              el.textContent = counts ? counts[i] : String(i + 1);
            } else {
              el = document.createElement('button');
              el.className = 'pad';
              const onLane = pat[i] === row.lane.c;
              if (onLane) el.classList.add('hit');
              if (gstarts.has(i)) el.classList.add('first');
              el.dataset.i = i;
              el.setAttribute('aria-label', `Krok ${i + 1}, ${row.lane.label}: ${onLane ? 'tak' : 'nie'}`);
              const step = i, c = row.lane.c;
              el.onclick = () => setStep(step, pattern(r)[step] === c ? '.' : c);
            }
            grp.appendChild(el);
            cells[i].push(el);
          }
          rowEl.appendChild(grp);
        }
        blockEl.appendChild(rowEl);
      }
      grid.appendChild(blockEl);
      start += blk.reduce((a2, b2) => a2 + b2, 0);
    }
  }

  function strokeName(ch) {
    if (ch === '.') return 'pauza';
    const s = cat().strokes.find((x) => x.c === ch);
    return s ? s.label : ch;
  }

  function toggleMute(v) {
    const k = rhythm().id + ':' + v;
    if (S.mute[k]) delete S.mute[k]; else S.mute[k] = 1;
    save(); renderLegend(); renderGrid();
  }

  function renderLegend() {
    const r = rhythm();
    const el = $('#legend');
    el.innerHTML = '';
    for (const s of cat().strokes) {
      const v = STRENGTH[s.c];
      const b = document.createElement('button');
      b.className = 'lg';
      b.dataset.v = v;
      b.setAttribute('aria-pressed', String(!S.mute[r.id + ':' + v]));
      b.title = 'Wycisz / włącz';
      b.innerHTML = `<span class="sw"><i></i></span>${s.label}`;
      b.onclick = () => toggleMute(v);
      el.appendChild(b);
    }
  }

  function renderTempo() {
    const r = rhythm();
    const b = bpmOf(r);
    $('#bpm').textContent = b;
    $('#slider').value = b;
    $('#unit').textContent = unitGlyph(r);
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

  function editStep(i) {
    const order = cat().strokes.map((x) => x.c).concat('.');
    const pos = order.indexOf(pattern(rhythm())[i]);
    setStep(i, order[(pos + 1) % order.length]);
  }

  function setStep(i, ch) {
    const r = rhythm();
    const pat = pattern(r).split('');
    pat[i] = ch;
    const np = pat.join('');
    if (np === r.pattern) delete S.edits[r.id]; else S.edits[r.id] = np;
    save();
    renderGrid();
    if (playing) cur.pat = pattern(r);
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
  $('#closeList').onclick = closeSheet;
  $('#reset').onclick = () => { delete S.edits[rhythm().id]; save(); renderGrid(); if (playing) cur.pat = pattern(rhythm()); };
  $('#rRange').onclick = () => { const r = rhythm(); setBpm((r.tempo[0] + r.tempo[1]) / 2); };
  $('#slider').oninput = (e) => setBpm(+e.target.value);
  holdRepeat($('#minus'), (d) => setBpm(bpmOf(rhythm()) - d));
  holdRepeat($('#plus'), (d) => setBpm(bpmOf(rhythm()) + d));
  dragBpm($('#bpm'));

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
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
