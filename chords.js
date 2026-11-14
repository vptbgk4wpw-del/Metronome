/* Chwyty — pomocnik: skala / tonacja → akordy → chwyty (funk, kciuk, pełne).
   Teoria i generator: chords-lib.js. Dźwięk idzie przez tor audio metronomu (window.METRO). */
(() => {
  'use strict';

  const L = window.ChordLib;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------------------------------------------------------------- stan */
  const STORE = 'chwyty.v1';
  const defaults = {
    app: 'metro', mode: 'scale', root: 9, scale: 'dorian', sel: { label: '1', qual: 'm7' },
    vamp: -1, pos: 0, set: 0, filter: 'best', thumb: 3, naming: 'intl', fb: 'deg', croot: 4, cqual: '9',
  };
  let S;
  try { S = Object.assign({}, defaults, JSON.parse(localStorage.getItem(STORE) || '{}')); }
  catch (e) { S = Object.assign({}, defaults); }
  if (!L.SC[S.scale]) S.scale = defaults.scale;
  if (!L.QU[S.cqual]) S.cqual = defaults.cqual;
  if (!S.sel || !L.QU[S.sel.qual]) S.sel = Object.assign({}, defaults.sel);
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { /* tryb prywatny */ } };

  const info = () => L.scaleInfo(S.root, S.scale);
  const nm = (note) => L.noteStr(note, S.naming);
  const cname = (c) => L.chordName(c.note, c.qual, S.naming);

  // bieżący akord: { pc, note, qual, label? }
  function current() {
    if (S.mode === 'chord') {
      const note = L.DEFAULT_ROOTS[S.croot];
      return { pc: note.pc, note, qual: S.cqual };
    }
    return L.chordAt(info(), S.sel.label, S.sel.qual);
  }

  /* --------------------------------------------------------------- dźwięk */
  const bufs = new Map();
  function pluckBuf(ctx, midi) {
    if (bufs.has(midi)) return bufs.get(midi);
    const sr = ctx.sampleRate;
    const n = Math.max(2, Math.round(sr / (440 * Math.pow(2, (midi - 69) / 12))));
    const len = Math.floor(sr * 1.5);
    const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    // Karplus–Strong: szum w pętli opóźniającej z uśrednianiem = szarpnięta struna
    let prev = 0;
    for (let i = 0; i < n; i++) { const x = Math.random() * 2 - 1; d[i] = prev = 0.55 * x + 0.45 * prev; }
    for (let i = n; i < len; i++) d[i] = 0.4985 * (d[i - n] + d[i - n + 1]);
    for (let i = 0; i < 3000; i++) d[len - 1 - i] *= i / 3000;
    bufs.set(midi, buf);
    return buf;
  }
  function strum(v) {
    if (!window.METRO) return;
    const { ctx, out } = window.METRO.audio();
    const t0 = ctx.currentTime + 0.03;
    v.midi.forEach((m, i) => {
      const s = ctx.createBufferSource();
      s.buffer = pluckBuf(ctx, m);
      const g = ctx.createGain();
      g.gain.value = 0.42;
      s.connect(g); g.connect(out);
      s.start(t0 + i * 0.024);
    });
  }

  /* ------------------------------------------------------------- rysunki */
  // Diagram chwytu: struny pionowo (E po lewej), kropka czerwona = pryma, T = kciuk, liczby = palce.
  function diagram(v) {
    const fr = v.frets;
    const pos = fr.filter((f) => f > 0);
    const maxF = pos.length ? Math.max(...pos) : 1, minF = pos.length ? Math.min(...pos) : 1;
    const start = maxF <= 4 ? 1 : minF;
    const rows = Math.max(4, maxF - start + 1);
    const X = (i) => 27 + i * 12.4, Y = 19, FH = 19, H = Y + rows * FH + 17;
    const yOf = (f) => Y + (f - start + 0.5) * FH;
    let s = `<svg class="dg-svg" viewBox="0 0 100 ${H}" aria-hidden="true">`;
    for (let j = 0; j <= rows; j++) {
      s += `<line class="${j === 0 && start === 1 ? 'nut' : 'fr'}" x1="${X(0)}" x2="${X(5)}" y1="${Y + j * FH}" y2="${Y + j * FH}"/>`;
    }
    for (let i = 0; i < 6; i++) s += `<line class="st" x1="${X(i)}" x2="${X(i)}" y1="${Y}" y2="${Y + rows * FH}"/>`;
    if (start > 1) s += `<text class="pos" x="${X(0) - 16}" y="${yOf(start)}">${start}</text>`;
    for (let i = 0; i < 6; i++) {
      if (fr[i] === null) s += `<text class="mute" x="${X(i)}" y="${Y - 8}">×</text>`;
      else if (fr[i] === 0) s += `<circle class="open${v.labels[i] === '1' ? ' root' : ''}" cx="${X(i)}" cy="${Y - 8}" r="3.2"/>`;
    }
    // barré i kciuk na kilku strunach: jedna belka
    const groups = {};
    v.fingers.forEach((g, i) => { if (g) { const k = g + ':' + fr[i]; (groups[k] = groups[k] || []).push(i); } });
    for (const [k, strs] of Object.entries(groups)) {
      if (strs.length < 2) continue;
      const y = yOf(+k.split(':')[1]);
      s += `<line class="bar" x1="${X(strs[0])}" x2="${X(strs[strs.length - 1])}" y1="${y}" y2="${y}"/>`;
    }
    for (let i = 0; i < 6; i++) {
      if (!(fr[i] > 0)) continue;
      const root = v.labels[i] === '1';
      s += `<circle class="dot${root ? ' root' : ''}" cx="${X(i)}" cy="${yOf(fr[i])}" r="5.7"/>`;
      if (v.fingers[i]) s += `<text class="fg" x="${X(i)}" y="${yOf(fr[i])}">${v.fingers[i]}</text>`;
    }
    for (let i = 0; i < 6; i++) {
      if (fr[i] === null) continue;
      s += `<text class="iv${v.labels[i] === '1' ? ' root' : ''}" x="${X(i)}" y="${H - 5}">${L.pretty(v.labels[i])}</text>`;
    }
    return s + '</svg>';
  }

  function caption(v) {
    const c = [];
    if (v.open) c.push('otwarty');
    if (v.thumb) c.push(v.thumb > 1 ? `kciuk ×${v.thumb}` : 'kciuk');
    if (!v.hasRoot) c.push('bez prymy');
    else if (v.bass !== '1' && v.cat !== 'funk') c.push('bas: ' + L.pretty(v.bass));
    return c.join(' · ');
  }

  let shown = []; // chwyty aktualnie na ekranie (indeks w data-v)
  function dgButton(v, title) {
    const i = shown.push(v) - 1;
    const tab = v.frets.map((f) => (f === null ? 'x' : f)).join(' ');
    const cap = caption(v);
    return `<button class="dg" data-v="${i}" aria-label="${esc(title)}: ${tab}${cap ? ', ' + esc(cap) : ''}. Dotknij, żeby usłyszeć">` +
      diagram(v) + `<span class="dg-cap">${esc(cap) || '&nbsp;'}</span></button>`;
  }

  // Gryf (progi 0–12, struna e na górze). map: pc → { t: napis, c: klasa }
  function fretboard(map) {
    const cw = 30, x0 = 26, top = 10, sh = 16, W = x0 + 12 * cw + 6, H = top + 5 * sh + 22;
    const X = (f) => (f === 0 ? 12 : x0 + (f - 0.5) * cw);
    const Yy = (i) => top + (5 - i) * sh;
    let s = `<svg class="fb" viewBox="0 0 ${W} ${H}" role="img" aria-label="Dźwięki na gryfie, progi 0–12">`;
    for (let f = 0; f <= 12; f++) s += `<line class="${f === 0 ? 'nut' : 'fr'}" x1="${x0 + f * cw}" x2="${x0 + f * cw}" y1="${top}" y2="${top + 5 * sh}"/>`;
    for (let i = 0; i < 6; i++) s += `<line class="st" x1="${x0}" x2="${x0 + 12 * cw}" y1="${Yy(i)}" y2="${Yy(i)}"/>`;
    for (const f of [3, 5, 7, 9, 12]) s += `<text class="pos" x="${X(f)}" y="${H - 5}">${f}</text>`;
    for (let i = 0; i < 6; i++) {
      for (let f = 0; f <= 12; f++) {
        const m = map.get((L.OPC[i] + f) % 12);
        if (!m) continue;
        s += `<circle class="n ${m.c}" cx="${X(f)}" cy="${Yy(i)}" r="6.6"/><text class="nt ${m.c}" x="${X(f)}" y="${Yy(i)}">${m.t}</text>`;
      }
    }
    return s + '</svg>';
  }

  /* ---------------------------------------------------------------- widok */
  function renderRoots() {
    const el = $('#chRoots');
    const selPc = S.mode === 'chord' ? S.croot : S.root;
    let h = '';
    for (let pc = 0; pc < 12; pc++) {
      const note = S.mode === 'chord' ? L.DEFAULT_ROOTS[pc] : L.scaleInfo(pc, S.scale).notes[0];
      h += `<button data-pc="${pc}" aria-pressed="${pc === selPc}">${nm(note)}</button>`;
    }
    el.innerHTML = h;
  }

  function renderScale() {
    const inf = info();
    const sc = inf.scale;
    const cur = current();
    const curPcs = new Set(L.chordTones(cur.note, cur.qual).map((t) => t.pc));
    const charSet = new Set((sc.char || []).map((c) => L.iv(c).semi));

    let h = `<section class="title ch-title">
      <button class="title-name" id="chOpenScales" aria-haspopup="dialog" aria-label="Lista skal">
        <span class="name">${nm(inf.notes[0])} ${esc(sc.name.toLowerCase())}</span>
        <span class="alt">${esc(sc.alt || '')}</span>
      </button>
      <button class="idx" id="chOpenScales2" aria-haspopup="dialog">skale ↓</button>
    </section>`;

    h += '<div class="ch-notes">';
    sc.deg.forEach((d, i) => {
      h += `<span class="${charSet.has(d.semi) ? 'char' : ''}"><b>${nm(inf.notes[i])}</b><i>${L.pretty(d.label)}</i></span>`;
    });
    h += '</div>';
    h += `<p class="note">${esc(sc.note)}</p>`;

    // gryf: tonika czerwona, dźwięki bieżącego akordu pełne, reszta skali pusta
    const map = new Map();
    sc.deg.forEach((d, i) => {
      const n = inf.notes[i];
      map.set(n.pc, { t: S.fb === 'note' ? nm(n) : L.pretty(d.label), c: d.semi === 0 ? 'tonic' : curPcs.has(n.pc) ? 'in' : 'out' });
    });
    h += `<div class="fb-wrap">${fretboard(map)}</div>
      <div class="fb-legend"><span><i class="k tonic"></i>tonika <i class="k in"></i>${esc(cname(cur))} <i class="k out"></i>skala</span>
      <button class="link" id="chFb">${S.fb === 'note' ? 'pokaż stopnie' : 'pokaż nuty'}</button></div>`;

    // akordy na stopniach
    const charTxt = sc.char ? `<span class="hint"><i class="k tonic"></i>z nutą charakterystyczną (${L.pretty(sc.char[0])})</span>` : '';
    const from = sc.harm ? ` — z ${inf.harm.name.toLowerCase().replace(/a$/, 'iej')}` : '';
    h += `<h3 class="label sec">Akordy skali${esc(from)}${charTxt}</h3><div class="degs">`;
    const selSemi = L.iv(S.sel.label).semi;
    inf.degrees.forEach((d) => {
      const q = d.seventh || d.triad;
      const on = d.semi === selSemi;
      if (!q) { h += `<button class="deg" disabled><span class="rn">${L.roman(d.label, null)}</span><span class="cn">—</span></button>`; return; }
      h += `<button class="deg${d.isChar ? ' char' : ''}" data-label="${d.label}" data-qual="${q}" aria-pressed="${on}">` +
        `<span class="rn">${L.roman(d.label, L.QU[d.triad || q])}</span><span class="cn">${esc(nm(d.note) + L.QU[q].suf)}</span></button>`;
    });
    h += '</div>';

    // co jeszcze pasuje na wybranym stopniu
    const deg = inf.degrees.find((d) => d.semi === selSemi);
    if (deg && deg.fits.length) {
      h += '<div class="chips" id="chFits">';
      for (const qid of deg.fits) {
        h += `<button data-label="${deg.label}" data-qual="${qid}" aria-pressed="${qid === S.sel.qual}">${esc(nm(deg.note) + L.QU[qid].suf)}</button>`;
      }
      h += '</div>';
    }

    // vampy
    h += '<h3 class="label sec">Vampy i progresje</h3><div class="vamps">';
    sc.vamps.forEach((v, i) => {
      const chs = v.ch.map((c) => { const [label, qual] = c.split(':'); return L.chordAt(inf, label, qual); });
      h += `<button class="vamp" data-vamp="${i}" aria-pressed="${i === S.vamp}">` +
        `<span class="rn">${chs.map((c) => c.roman).join(' – ')}</span>` +
        `<span class="cn">${chs.map((c) => esc(cname(c))).join(' – ')}</span>` +
        `<span class="vn">${esc(v.note || '')}</span></button>`;
      if (i === S.vamp) h += posBox(chs);
    });
    h += '</div>';
    $('#chBody').innerHTML = h;
  }

  // Akordy vampu w jednej pozycji na tych samych strunach — do grania rytmicznego bez skakania po gryfie.
  function posBox(chs) {
    const p = S.pos || L.bestPosition(chs, S.set);
    const vs = L.inPosition(chs, S.set, p);
    let h = `<div class="posbox"><div class="pos-head"><span class="label">W jednej pozycji</span>
      <span class="pos-step"><button id="chPosDown" aria-label="Niżej">−</button><output>próg ${p}</output><button id="chPosUp" aria-label="Wyżej">+</button></span>
      <span class="seg" id="chSet" role="group" aria-label="Struny">` +
      L.SET_NAMES.map((n, i) => `<button data-set="${i}" aria-pressed="${i === S.set}">${n}</button>`).join('') +
      '</span></div><div class="pos-row">';
    chs.forEach((c, i) => {
      h += `<div class="pos-cell"><button class="pos-name" data-label="${c.label}" data-qual="${c.qual}">${esc(cname(c))}</button>` +
        (vs[i] ? dgButton(vs[i], cname(c)) : '<span class="dg none">brak układu<br>w tej pozycji</span>') + '</div>';
    });
    h += '</div></div>';
    posBox.p = p;
    return h;
  }

  function renderChord() {
    const cur = current();
    const q = L.QU[cur.qual];
    const tones = L.chordTones(cur.note, cur.qual);
    let h = `<section class="title ch-title"><div class="title-name">
      <span class="name">${esc(cname(cur))}</span>
      <span class="alt">${tones.map((t) => nm(t)).join(' ')} · ${q.tones.map((t) => L.pretty(t.label)).join(' ')}</span>
    </div></section>`;
    let g = '';
    for (const x of L.QUALS) {
      if (x.g !== g) { h += `${g ? '</div>' : ''}<h3 class="label sec">${x.g}</h3><div class="chips" data-quals>`; g = x.g; }
      h += `<button data-qual="${x.id}" aria-pressed="${x.id === S.cqual}">${esc(nm(cur.note) + x.suf)}</button>`;
    }
    h += '</div>';
    const map = new Map();
    tones.forEach((t) => map.set(t.pc, { t: S.fb === 'note' ? nm(t) : L.pretty(t.label), c: t.label === '1' ? 'tonic' : 'in' }));
    h += `<h3 class="label sec">Na gryfie</h3><div class="fb-wrap">${fretboard(map)}</div>
      <div class="fb-legend"><span><i class="k tonic"></i>pryma <i class="k in"></i>składniki</span>
      <button class="link" id="chFb">${S.fb === 'note' ? 'pokaż stopnie' : 'pokaż nuty'}</button></div>`;
    $('#chBody').innerHTML = h;
  }

  const FILTERS = [
    ['best', 'Najprostsze', 'Najłatwiejsze układy funkowe i z kciukiem. Dotknij chwytu, żeby go usłyszeć.'],
    ['funk', 'Funk', 'Trzy–cztery struny (D‑G‑B‑e), kolejne przewroty w górę gryfu. Bas zostaje basiście.'],
    ['thumb', 'Kciuk', 'Kciuk od góry gryfu łapie bas, pozostałe palce grają resztę.'],
    ['full', 'Pełne', 'Chwyty otwarte i barré.'],
  ];
  function renderShapes() {
    const cur = current();
    const r = L.voicings(cur.pc, cur.qual, S.thumb);
    let f = S.filter;
    if (!r[f] || !r[f].length) f = 'best';
    const name = cname(cur);
    let h = `<div class="sh-head"><h3 class="label">Chwyty <span class="sh-name">${esc(name)}</span></h3>
      <span class="seg" id="chFilter" role="group" aria-label="Rodzaj chwytu">`;
    for (const [id, label] of FILTERS) {
      if (!r[id].length) continue;
      h += `<button data-filter="${id}" aria-pressed="${id === f}">${label}</button>`;
    }
    h += `</span></div><p class="note">${FILTERS.find((x) => x[0] === f)[2]}</p><div class="dgs">`;
    for (const v of r[f]) h += dgButton(v, name);
    h += `</div><p class="note key"><i class="k tonic"></i>pryma · T kciuk · 1–4 palce · × struna tłumiona · pod spodem składniki akordu</p>`;
    $('#chShapes').innerHTML = h;
  }

  function renderOpts() {
    $('#chThumb').textContent = S.thumb ? `Kciuk ×${S.thumb}` : 'Bez kciuka';
    $('#chNaming').textContent = S.naming === 'h' ? 'Nuty: H' : 'Nuty: B';
    document.querySelectorAll('#chMode button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === S.mode)));
  }

  function render() {
    shown = [];
    renderOpts();
    renderRoots();
    if (S.mode === 'chord') renderChord(); else renderScale();
    renderShapes();
  }

  // po zmianie skali / prymy: wybrany stopień zostaje, jeśli istnieje w nowej skali
  function fixSel() {
    const inf = info();
    const semi = L.iv(S.sel.label).semi;
    const d = inf.degrees.find((x) => x.semi === semi);
    if (d && d.fits.includes(S.sel.qual)) { S.sel.label = d.label; return; }
    const pick = d && (d.seventh || d.triad) ? d : inf.degrees.find((x) => x.seventh || x.triad);
    S.sel = { label: pick.label, qual: pick.seventh || pick.triad };
  }

  /* --------------------------------------------------------------- lista */
  function openSheet() {
    let h = '', g = '';
    L.SCALES.forEach((s) => {
      if (s.group !== g) { h += `${g ? '</ol>' : ''}<h3 class="sheet-group">${s.group}</h3><ol class="sheet-list">`; g = s.group; }
      h += `<li><button data-scale="${s.id}"${s.id === S.scale ? ' aria-current="true"' : ''}>` +
        `<span class="n"></span><span class="nm">${esc(s.name)}<small>${esc(s.alt || '')}</small></span>` +
        `<span class="m">${L.pretty(s.f)}</span></button></li>`;
    });
    $('#chSheetList').innerHTML = h + '</ol>';
    $('#chSheet').hidden = false;
    $('#chCloseSheet').focus();
  }
  function closeSheet() { $('#chSheet').hidden = true; }

  /* ------------------------------------------------------------ zdarzenia */
  const body = $('#viewChords');
  body.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !body.contains(b)) return;
    const d = b.dataset;
    if (b.classList.contains('dg')) {
      strum(shown[+d.v]);
      b.classList.remove('ping'); void b.offsetWidth; b.classList.add('ping');
      return;
    }
    if (b.id === 'chOpenScales' || b.id === 'chOpenScales2') { openSheet(); return; }
    if (b.id === 'chGroove') { setApp('metro'); return; }
    if (b.id === 'chPlay') { if (window.METRO) window.METRO.toggle(); return; }
    if (d.mode) { S.mode = d.mode; }
    else if (b.id === 'chThumb') { S.thumb = (S.thumb + 3) % 4; }
    else if (b.id === 'chNaming') { S.naming = S.naming === 'h' ? 'intl' : 'h'; }
    else if (b.id === 'chFb') { S.fb = S.fb === 'note' ? 'deg' : 'note'; }
    else if (d.pc !== undefined) {
      if (S.mode === 'chord') S.croot = +d.pc; else { S.root = +d.pc; S.pos = 0; }
    }
    else if (d.vamp !== undefined) {
      const i = +d.vamp;
      S.vamp = S.vamp === i ? -1 : i;
      S.pos = 0;
      if (S.vamp >= 0) { const [label, qual] = info().scale.vamps[i].ch[0].split(':'); S.sel = { label, qual }; }
    }
    else if (d.set !== undefined) { S.set = +d.set; S.pos = 0; }
    else if (b.id === 'chPosDown') { S.pos = Math.max(1, posBox.p - 1); }
    else if (b.id === 'chPosUp') { S.pos = Math.min(12, posBox.p + 1); }
    else if (d.filter) { S.filter = d.filter; }
    else if (d.label && d.qual) { S.sel = { label: d.label, qual: d.qual }; }
    else if (d.qual) { S.cqual = d.qual; }
    else return;
    save();
    render();
  });

  $('#chSheet').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.scale) { S.scale = b.dataset.scale; S.vamp = -1; S.pos = 0; fixSel(); save(); render(); }
    closeSheet();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#chSheet').hidden) closeSheet(); });

  /* ------------------------------------------- przełączanie Metronom / Chwyty */
  function setApp(app, keepHash) {
    S.app = app === 'chords' ? 'chords' : 'metro';
    document.body.dataset.app = S.app;
    $('#viewMetro').hidden = S.app !== 'metro';
    $('#viewChords').hidden = S.app !== 'chords';
    document.querySelectorAll('#apps button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.app === S.app)));
    if (!keepHash) { try { history.replaceState(null, '', S.app === 'chords' ? '#chwyty' : location.pathname + location.search); } catch (e) { /* file:// */ } }
    if (S.app === 'chords') render();
    save();
  }
  document.querySelectorAll('#apps button').forEach((b) => { b.onclick = () => { setApp(b.dataset.app); window.scrollTo(0, 0); }; });

  // mały transport metronomu pod chwytami
  function syncMetro() {
    if (!window.METRO) return;
    const i = window.METRO.info();
    $('#chGrooveName').textContent = `${i.name} · ${i.bpm}`;
    $('#chPlay').textContent = window.METRO.playing ? 'Stop' : 'Start';
    $('#chPlay').setAttribute('aria-pressed', String(window.METRO.playing));
  }
  document.addEventListener('metro', syncMetro);

  fixSel();
  syncMetro();
  setApp(location.hash === '#chwyty' ? 'chords' : location.hash ? 'metro' : S.app, true);
})();
