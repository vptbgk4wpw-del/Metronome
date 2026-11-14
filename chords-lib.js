/* Chwyty — teoria i generator chwytów gitarowych (strój EADGBE). Bez DOM, bez zależności.
   Skale i akordy zapisane wzorami stopni („1 b3 5 b7”), chwyty przesuwne jako odstępy od progu prymy.
   Sprawdzenie danych: node tools/check-chords.js */
(function (global) {
  'use strict';

  const NAT = [0, 2, 4, 5, 7, 9, 11];
  const LET = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const mod = (a, n) => ((a % n) + n) % n;
  const signed = (x) => mod(x + 6, 12) - 6;
  const pretty = (s) => s.replace(/b/g, '♭').replace(/#/g, '♯');

  // 'b3' → { label, off: odstęp liter od prymy, semi: półtony }
  function iv(label) {
    const m = /^([b#]*)(\d+)$/.exec(label);
    const n = +m[2];
    let semi = NAT[(n - 1) % 7];
    for (const c of m[1]) semi += c === 'b' ? -1 : 1;
    return { label, off: (n - 1) % 7, semi: mod(semi, 12) };
  }
  const ivs = (f) => (f ? f.split(' ').map(iv) : []);

  /* ------------------------------------------------------------ skale */
  // char: stopnie charakterystyczne (pierwszy = najważniejszy); harm: skala, z której bierzemy akordy
  // vamps: akordy jako 'stopień:akord'; free = akord spoza skali (zapożyczony)
  const SCALES = [
    { id: 'ionian', group: 'Mody', name: 'Jońska', alt: 'dur · tonacja durowa', f: '1 2 3 4 5 6 7', char: ['4', '7'],
      note: 'Zwykły dur. Kwarta czysta i septyma wielka ciągną do toniki, więc to skala kadencji, nie vampów.',
      vamps: [
        { ch: ['1:maj', '4:maj', '5:maj'] },
        { ch: ['2:m7', '5:7', '1:maj7'], note: 'kadencja jazzowa' },
        { ch: ['1:maj', '6:m', '4:maj', '5:maj'] },
        { ch: ['1:maj7', '4:maj7'], note: 'soul' },
      ] },
    { id: 'dorian', group: 'Mody', name: 'Dorycka', alt: 'moll z wielką sekstą', f: '1 2 b3 4 5 6 b7', char: ['6'],
      note: 'Najbardziej funkowy moll. Wielka seksta daje durową subdominantę: vamp i7 – IV7 (Oye Como Va, Chameleon). Na jednym akordzie: m7, m9, m6, m11.',
      vamps: [
        { ch: ['1:m7', '4:7'], note: 'vamp funkowy' },
        { ch: ['1:m9', '4:9'] },
        { ch: ['1:m7', '2:m7'], note: 'So What' },
        { ch: ['1:m', 'b3:maj', '4:maj'] },
        { ch: ['1:m7', 'b7:maj', '4:maj'] },
      ] },
    { id: 'phrygian', group: 'Mody', name: 'Frygijska', alt: 'moll z małą sekundą', f: '1 b2 b3 4 5 b6 b7', char: ['b2'],
      note: 'Ciemny moll. Cały charakter siedzi w półtonie nad toniką: i – ♭II. Na jednym akordzie: sus♭9.',
      vamps: [
        { ch: ['1:m', 'b2:maj'] },
        { ch: ['1:m', 'b2:maj', 'b3:maj'] },
        { ch: ['1:m7', 'b7:m7'] },
        { ch: ['1:7susb9'], note: 'jeden akord' },
      ] },
    { id: 'lydian', group: 'Mody', name: 'Lidyjska', alt: 'dur ze zwiększoną kwartą', f: '1 2 3 #4 5 6 7', char: ['#4'],
      note: 'Jasny, zawieszony dur. Zwiększona kwarta daje durowy akord o cały ton nad toniką: I – II.',
      vamps: [
        { ch: ['1:maj', '2:maj'] },
        { ch: ['1:maj7#11'], note: 'jeden akord' },
        { ch: ['1:maj7', '7:m7'] },
        { ch: ['1:maj7', '2:7'] },
      ] },
    { id: 'mixolydian', group: 'Mody', name: 'Miksolidyjska', alt: 'dur z małą septymą', f: '1 2 3 4 5 6 b7', char: ['b7'],
      note: 'Skala akordu dominantowego, podstawa funku na jednym akordzie (9, 13, 7sus4). Mała septyma daje durowy akord o cały ton pod toniką: I – ♭VII.',
      vamps: [
        { ch: ['1:9'], note: 'jeden akord, funk' },
        { ch: ['1:9', '1:13'], note: 'ten sam bas, ruch na górze' },
        { ch: ['1:maj', 'b7:maj'] },
        { ch: ['1:maj', 'b7:maj', '4:maj'] },
        { ch: ['1:7', '5:m7'] },
      ] },
    { id: 'aeolian', group: 'Mody', name: 'Eolska', alt: 'moll naturalny · tonacja molowa', f: '1 2 b3 4 5 b6 b7', char: ['b6'],
      note: 'Zwykły moll. Mała seksta daje molową subdominantę i durowy ♭VI: i – ♭VII – ♭VI (All Along the Watchtower).',
      vamps: [
        { ch: ['1:m', 'b7:maj', 'b6:maj'] },
        { ch: ['1:m7', '4:m7'] },
        { ch: ['1:m', 'b6:maj', 'b7:maj'] },
        { ch: ['1:m', '4:m', '5:m'] },
      ] },
    { id: 'locrian', group: 'Mody', name: 'Lokrycka', alt: 'moll ze zmniejszoną kwintą', f: '1 b2 b3 4 b5 b6 b7', char: ['b5'],
      note: 'Tonika jest akordem zmniejszonym, więc skala nie stoi sama. Przydaje się nad akordem m7♭5.',
      vamps: [
        { ch: ['1:m7b5', 'b2:maj7'] },
        { ch: ['1:m7b5', 'b5:maj7'] },
      ] },

    { id: 'harmonic', group: 'Moll i pochodne', name: 'Moll harmoniczny', alt: 'moll z wielką septymą', f: '1 2 b3 4 5 b6 7', char: ['7'],
      note: 'Moll z durową dominantą: V7 – i. Półtora tonu między ♭6 a 7 daje orientalny kolor.',
      vamps: [
        { ch: ['1:m', '5:7'] },
        { ch: ['2:m7b5', '5:7b9', '1:m'], note: 'kadencja molowa' },
        { ch: ['1:m', '4:m', '5:7'] },
        { ch: ['1:m', 'b6:maj', '5:7'] },
      ] },
    { id: 'melodic', group: 'Moll i pochodne', name: 'Moll melodyczny', alt: 'jazzowy · moll z 6 i 7', f: '1 2 b3 4 5 6 7', char: ['6', '7'],
      note: 'Moll z wielką sekstą i septymą. Tonika brzmi jak m6 albo m(maj7), na IV stopniu stoi akord dominantowy.',
      vamps: [
        { ch: ['1:m6', '4:7'] },
        { ch: ['1:mMaj7', '2:m7'] },
        { ch: ['1:m6', '5:7'] },
      ] },
    { id: 'phrdom', group: 'Moll i pochodne', name: 'Frygijska dominantowa', alt: 'zbliżona do makamu hidżaz · 5. stopień moll harm.', f: '1 b2 3 4 5 b6 b7', char: ['b2', '3'],
      note: 'Durowa tonika i półton nad nią: flamenco, Bliski Wschód, Bałkany. I – ♭II, a kadencja andaluzyjska pożycza ♭III z frygijskiej.',
      vamps: [
        { ch: ['1:maj', 'b2:maj'] },
        { ch: ['4:m', 'b3:maj', 'b2:maj', '1:maj'], note: 'kadencja andaluzyjska', free: true },
        { ch: ['1:maj', 'b7:m'] },
        { ch: ['1:7b9', '4:m'] },
      ] },
    { id: 'lyddom', group: 'Moll i pochodne', name: 'Lidyjska dominantowa', alt: 'lidyjska ♭7 · 4. stopień moll mel.', f: '1 2 3 #4 5 6 b7', char: ['#4', 'b7'],
      note: 'Dominanta ze zwiększoną kwartą. Brzmi jak akord 7♯11, dobrze stoi w miejscu.',
      vamps: [
        { ch: ['1:7', '2:7'] },
        { ch: ['1:7#11'], note: 'jeden akord' },
        { ch: ['1:9', '5:mMaj7'] },
      ] },
    { id: 'dblharm', group: 'Moll i pochodne', name: 'Podwójna harmoniczna', alt: 'hidżaz kar · bizantyjska', f: '1 b2 3 4 5 b6 7', char: ['b2', '7'],
      note: 'Dwa kroki półtoratonowe. Tonika durowa, obok niej durowy ♭II i molowa subdominanta.',
      vamps: [
        { ch: ['1:maj', 'b2:maj'] },
        { ch: ['1:maj', '4:m'] },
        { ch: ['1:maj7', 'b2:maj7'] },
      ] },

    { id: 'pentmin', group: 'Pentatoniki i blues', name: 'Pentatonika molowa', alt: 'pięć dźwięków', f: '1 b3 4 5 b7', harm: 'dorian',
      note: 'Pięć dźwięków wspólnych dla doryckiej, eolskiej i frygijskiej. Akordy poniżej pochodzą z doryckiej, bo ta leży najbliżej funku.',
      vamps: [
        { ch: ['1:m7', '4:7'], note: 'vamp funkowy' },
        { ch: ['1:m7', '4:9'] },
        { ch: ['1:m', 'b3:maj', '4:maj'] },
        { ch: ['1:m11'], note: 'jeden akord' },
      ] },
    { id: 'pentmaj', group: 'Pentatoniki i blues', name: 'Pentatonika durowa', alt: 'pięć dźwięków', f: '1 2 3 5 6', harm: 'ionian',
      note: 'Pięć dźwięków wspólnych dla jońskiej, lidyjskiej i miksolidyjskiej. Akordy poniżej pochodzą z jońskiej.',
      vamps: [
        { ch: ['1:maj', '4:maj'] },
        { ch: ['1:6/9'], note: 'jeden akord' },
        { ch: ['1:maj', '6:m7'] },
        { ch: ['1:6', '2:m7'] },
      ] },
    { id: 'blues', group: 'Pentatoniki i blues', name: 'Bluesowa', alt: 'pentatonika molowa + ♭5', f: '1 b3 4 b5 5 b7', harm: 'dorian',
      note: 'Pentatonika molowa z dodaną ♭5. Gra się ją także nad akordami dominantowymi, których nie ma w żadnej jednej skali: I7 – IV7 – V7.',
      vamps: [
        { ch: ['1:7', '4:7', '5:7'], note: 'blues', free: true },
        { ch: ['1:7#9'], note: 'jeden akord', free: true },
        { ch: ['1:m7', '4:7'] },
        { ch: ['1:9', '4:9'], free: true },
      ] },
  ];
  for (const s of SCALES) {
    s.deg = ivs(s.f);
    s.set = new Set(s.deg.map((d) => d.semi));
  }
  const SC = Object.fromEntries(SCALES.map((s) => [s.id, s]));

  /* ----------------------------------------------------------- akordy */
  // f: składniki, req: składniki, bez których akord traci tożsamość (reszta może wypaść),
  // opt: dźwięki, które wolno dodać w chwycie
  const QUALS = [
    { id: 'maj', suf: '', g: 'Trójdźwięki', f: '1 3 5' },
    { id: 'm', suf: 'm', g: 'Trójdźwięki', f: '1 b3 5' },
    { id: 'dim', suf: '°', g: 'Trójdźwięki', f: '1 b3 b5' },
    { id: 'aug', suf: '+', g: 'Trójdźwięki', f: '1 3 #5' },
    { id: 'sus2', suf: 'sus2', g: 'Sus i dodane', f: '1 2 5' },
    { id: 'sus4', suf: 'sus4', g: 'Sus i dodane', f: '1 4 5' },
    { id: '7sus4', suf: '7sus4', g: 'Sus i dodane', f: '1 4 5 b7', req: '4 b7' },
    { id: '9sus4', suf: '9sus4', g: 'Sus i dodane', f: '1 4 5 b7 9', req: '4 b7 9' },
    { id: '7susb9', suf: '7sus♭9', g: 'Sus i dodane', f: '1 4 5 b7 b9', req: '4 b7 b9' },
    { id: 'add9', suf: 'add9', g: 'Sus i dodane', f: '1 3 5 9', req: '3 9' },
    { id: 'madd9', suf: 'm(add9)', g: 'Sus i dodane', f: '1 b3 5 9', req: 'b3 9' },
    { id: '6', suf: '6', g: 'Sus i dodane', f: '1 3 5 6', req: '3 6' },
    { id: 'm6', suf: 'm6', g: 'Sus i dodane', f: '1 b3 5 6', req: 'b3 6' },
    { id: '6/9', suf: '6/9', g: 'Sus i dodane', f: '1 3 5 6 9', req: '3 6 9' },
    { id: 'm6/9', suf: 'm6/9', g: 'Sus i dodane', f: '1 b3 5 6 9', req: 'b3 6 9' },
    { id: '7', suf: '7', g: 'Septymowe', f: '1 3 5 b7', req: '3 b7' },
    { id: 'maj7', suf: 'maj7', g: 'Septymowe', f: '1 3 5 7', req: '3 7' },
    { id: 'm7', suf: 'm7', g: 'Septymowe', f: '1 b3 5 b7', req: 'b3 b7' },
    { id: 'mMaj7', suf: 'm(maj7)', g: 'Septymowe', f: '1 b3 5 7', req: 'b3 7' },
    { id: 'm7b5', suf: 'm7♭5', g: 'Septymowe', f: '1 b3 b5 b7', req: 'b3 b5 b7' },
    { id: 'dim7', suf: '°7', g: 'Septymowe', f: '1 b3 b5 6', req: 'b3 b5 6' },
    { id: 'maj7#5', suf: 'maj7♯5', g: 'Septymowe', f: '1 3 #5 7', req: '3 #5 7' },
    { id: '7b5', suf: '7♭5', g: 'Septymowe', f: '1 3 b5 b7', req: '3 b5 b7' },
    { id: '9', suf: '9', g: 'Rozszerzone', f: '1 3 5 b7 9', req: '3 b7 9' },
    { id: '13', suf: '13', g: 'Rozszerzone', f: '1 3 5 b7 13', req: '3 b7 13', opt: '9' },
    { id: '7#9', suf: '7♯9', g: 'Rozszerzone', f: '1 3 5 b7 #9', req: '3 b7 #9' },
    { id: '7b9', suf: '7♭9', g: 'Rozszerzone', f: '1 3 5 b7 b9', req: '3 b7 b9' },
    { id: '7#11', suf: '7♯11', g: 'Rozszerzone', f: '1 3 5 b7 #11', req: '3 b7 #11', opt: '9' },
    { id: 'maj9', suf: 'maj9', g: 'Rozszerzone', f: '1 3 5 7 9', req: '3 7 9' },
    { id: 'maj7#11', suf: 'maj7♯11', g: 'Rozszerzone', f: '1 3 5 7 #11', req: '3 7 #11', opt: '9' },
    { id: 'm9', suf: 'm9', g: 'Rozszerzone', f: '1 b3 5 b7 9', req: 'b3 b7 9' },
    { id: 'm11', suf: 'm11', g: 'Rozszerzone', f: '1 b3 5 b7 11', req: 'b3 b7 11', opt: '9' },
  ];
  for (const q of QUALS) {
    q.tones = ivs(q.f);
    q.set = new Set(q.tones.map((t) => t.semi));
    q.req = new Set(ivs(q.req || q.f).map((t) => t.semi));
    q.opts = ivs(q.opt);
    q.minor = q.set.has(3) && !q.set.has(4);
  }
  const QU = Object.fromEntries(QUALS.map((q) => [q.id, q]));

  /* ------------------------------------------------------ nazwy nut */
  // Dobór pisowni prymy tak, żeby skala miała jak najmniej znaków (remis → krzyżyki).
  function spellRoot(rootPc, degs) {
    let best = null;
    for (let L = 0; L < 7; L++) {
      const a = signed(rootPc - NAT[L]);
      if (Math.abs(a) > 1) continue;
      let cost = a < 0 ? 0.1 : 0;
      for (const d of degs) {
        const acc = signed(rootPc + d.semi - NAT[(L + d.off) % 7]);
        cost += Math.abs(acc) + (Math.abs(acc) > 1 ? 10 : 0);
      }
      if (!best || cost < best.cost) best = { L, cost };
    }
    return best.L;
  }
  const spell = (rootPc, L, d) => {
    const pc = mod(rootPc + d.semi, 12);
    let l = (L + d.off) % 7;
    let acc = signed(pc - NAT[l]);
    // podwójny znak → sąsiednia litera (B♭♭ → A), czytelniej na gryfie
    if (Math.abs(acc) > 1) { l = mod(l + Math.sign(acc), 7); acc = signed(pc - NAT[l]); }
    return { l, acc, pc };
  };
  // naming 'h': polska / niemiecka pisownia (H = B, B = B♭)
  function noteStr(n, naming) {
    const acc = (k) => (k < 0 ? '♭' : '♯').repeat(Math.abs(k));
    if (naming === 'h' && n.l === 6) return n.acc < 0 ? 'B' + acc(n.acc + 1) : 'H' + acc(n.acc);
    return LET[n.l] + acc(n.acc);
  }
  // Pisownia domyślna dla samej prymy (tryb „Akord”)
  const DEFAULT_ROOTS = [[0, 0], [0, 1], [1, 0], [2, -1], [2, 0], [3, 0], [3, 1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0]]
    .map(([l, acc], pc) => ({ l, acc, pc }));

  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  const ROMAN_SUF = { maj: '', m: '', dim: '°', aug: '+', m7: '7', m7b5: 'ø', mMaj7: '(maj7)', madd9: '(add9)' };
  function roman(label, q) {
    const m = /^([b#]*)(\d+)$/.exec(label);
    let r = ROMAN[(+m[2] - 1) % 7];
    if (q && q.minor) r = r.toLowerCase();
    let suf = '';
    if (q) suf = q.id in ROMAN_SUF ? ROMAN_SUF[q.id] : q.minor ? q.suf.replace(/^m/, '') : q.suf;
    return pretty(m[1]) + r + suf;
  }

  /* ------------------------------------------------- skala → akordy */
  function scaleInfo(rootPc, scaleId) {
    const scale = SC[scaleId] || SC.dorian;
    const h = scale.harm ? SC[scale.harm] : scale;
    const L = spellRoot(rootPc, h.deg);
    const notes = scale.deg.map((d) => Object.assign({ label: d.label }, spell(rootPc, L, d)));
    const charSemi = scale.char ? iv(scale.char[0]).semi : -1;
    const findQ = (set) => QUALS.find((q) => q.set.size === set.size && [...set].every((x) => q.set.has(x))) || null;
    const degrees = h.deg.map((d, i) => {
      const rel = (k) => mod(h.deg[(i + k) % 7].semi - d.semi, 12);
      const triad = findQ(new Set([0, rel(2), rel(4)]));
      const seventh = findQ(new Set([0, rel(2), rel(4), rel(6)]));
      const fits = QUALS.filter((q) => q.tones.every((t) => h.set.has(mod(d.semi + t.semi, 12)))).map((q) => q.id);
      const main = triad || seventh;
      const isChar = charSemi >= 0 && !!main && main.tones.some((t) => mod(d.semi + t.semi, 12) === charSemi);
      return { label: d.label, semi: d.semi, note: spell(rootPc, L, d), triad: triad && triad.id, seventh: seventh && seventh.id, fits, isChar };
    });
    return { scale, harm: h, L, rootPc, notes, degrees };
  }
  // akord podany stopniem względem toniki skali ('b7' + 'maj')
  function chordAt(info, label, qualId) {
    const d = iv(label);
    const note = spell(info.rootPc, info.L, d);
    return { label, qual: qualId, pc: note.pc, note, roman: roman(label, QU[qualId]) };
  }
  const chordName = (note, qualId, naming) => noteStr(note, naming) + QU[qualId].suf;
  const chordTones = (note, qualId) => QU[qualId].tones.map((t) => Object.assign({ label: t.label }, spell(note.pc, note.l, t)));

  /* --------------------------------------------------------- chwyty */
  const OPEN = [40, 45, 50, 55, 59, 64];
  const OPC = OPEN.map((m) => m % 12);
  const MAXF = 15;
  const SETS = [[3, 4, 5], [2, 3, 4], [2, 3, 4, 5]];
  const SET_NAMES = ['G‑B‑e', 'D‑G‑B', 'D‑G‑B‑e'];

  // Chwyty przesuwne: f = odstępy od progu prymy (x = struna tłumiona), g = palce (T = kciuk),
  // s = struna z prymą (6 / 5), c = 'thumb' (kciuk od góry gryfu) albo 'full'
  const FORMS = {
    maj: [
      { f: '0 x 2 1 0 0', g: 'T x 3 2 1 1', s: 6, c: 'thumb' },
      { f: '0 0 2 2 2 0', g: 'T T 3 3 3 1', s: 5, c: 'thumb', bass5: true },
      { f: '0 2 2 1 0 0', g: '1 3 4 2 1 1', s: 6, c: 'full' },
      { f: 'x 0 2 2 2 0', g: 'x 1 3 3 3 1', s: 5, c: 'full' },
    ],
    m: [
      { f: '0 x 2 0 0 0', g: 'T x 3 1 1 1', s: 6, c: 'thumb' },
      { f: '0 0 2 2 1 0', g: 'T T 3 4 2 1', s: 5, c: 'thumb', bass5: true },
      { f: '0 2 2 0 0 0', g: '1 3 4 1 1 1', s: 6, c: 'full' },
      { f: 'x 0 2 2 1 0', g: 'x 1 3 4 2 1', s: 5, c: 'full' },
    ],
    dim: [{ f: 'x 0 1 2 1 x', g: 'x 1 2 4 3 x', s: 5, c: 'full' }],
    aug: [
      { f: '0 x 2 1 1 x', g: 'T x 3 1 2 x', s: 6, c: 'thumb' },
      { f: 'x 0 -1 -2 -2 x', g: 'x 3 2 1 1 x', s: 5, c: 'full' },
    ],
    sus2: [{ f: 'x 0 2 2 0 0', g: 'x 1 3 4 1 1', s: 5, c: 'full' }],
    sus4: [
      { f: '0 x 2 2 0 0', g: 'T x 3 4 1 1', s: 6, c: 'thumb' },
      { f: '0 2 2 2 0 0', g: '1 2 3 4 1 1', s: 6, c: 'full' },
      { f: 'x 0 2 2 3 0', g: 'x 1 2 3 4 1', s: 5, c: 'full' },
    ],
    '7sus4': [
      { f: '0 x 0 2 0 0', g: 'T x 1 3 1 1', s: 6, c: 'thumb' },
      { f: '0 0 0 2 0 0', g: 'T T T 3 1 1', s: 6, c: 'thumb' },
      { f: '0 2 0 2 0 0', g: '1 3 1 4 1 1', s: 6, c: 'full' },
      { f: 'x 0 2 0 3 0', g: 'x 1 3 1 4 1', s: 5, c: 'full' },
    ],
    '9sus4': [
      { f: '0 x 0 -1 -2 -2', g: 'T x 3 2 1 1', s: 6, c: 'thumb' },
      { f: 'x 0 0 0 0 0', g: 'x 1 1 1 1 1', s: 5, c: 'full' },
    ],
    add9: [{ f: '0 x 2 1 0 2', g: 'T x 3 2 1 4', s: 6, c: 'thumb' }],
    6: [
      { f: '0 x -1 1 0 x', g: 'T x 1 3 2 x', s: 6, c: 'thumb' },
      { f: 'x 0 2 2 2 2', g: 'x 1 3 3 3 3', s: 5, c: 'full' },
    ],
    m6: [
      { f: '0 x -1 0 0 x', g: 'T x 1 2 3 x', s: 6, c: 'thumb' },
      { f: 'x 0 -2 -1 -2 0', g: 'x 3 1 2 1 4', s: 5, c: 'full' },
    ],
    '6/9': [
      { f: '0 -1 -1 -1 0 0', g: 'T 1 1 1 2 3', s: 6, c: 'thumb' },
      { f: 'x 0 -1 -1 0 0', g: 'x 2 1 1 3 4', s: 5, c: 'full' },
    ],
    'm6/9': [
      { f: '0 x -1 0 0 2', g: 'T x 1 2 3 4', s: 6, c: 'thumb' },
      { f: 'x 0 -2 -1 0 0', g: 'x 3 1 2 4 4', s: 5, c: 'full' },
    ],
    7: [
      { f: '0 x 0 1 0 0', g: 'T x 1 2 1 1', s: 6, c: 'thumb' },
      { f: '0 0 2 0 2 0', g: 'T T 3 1 4 1', s: 5, c: 'thumb', bass5: true },
      { f: '0 2 0 1 0 0', g: '1 3 1 2 1 1', s: 6, c: 'full' },
      { f: 'x 0 2 0 2 0', g: 'x 1 3 1 4 1', s: 5, c: 'full' },
    ],
    maj7: [
      { f: '0 x 1 1 0 x', g: 'T x 2 3 1 x', s: 6, c: 'thumb' },
      { f: '0 2 1 1 0 0', g: '1 4 2 3 1 1', s: 6, c: 'full' },
      { f: 'x 0 2 1 2 0', g: 'x 1 3 2 4 1', s: 5, c: 'full' },
    ],
    m7: [
      { f: '0 x 0 0 0 0', g: 'T x 1 1 1 1', s: 6, c: 'thumb' },
      { f: '0 0 2 0 1 0', g: 'T T 3 1 2 1', s: 5, c: 'thumb', bass5: true },
      { f: '0 2 0 0 0 0', g: '1 3 1 1 1 1', s: 6, c: 'full' },
      { f: 'x 0 2 0 1 0', g: 'x 1 3 1 2 1', s: 5, c: 'full' },
    ],
    mMaj7: [
      { f: '0 x 1 0 0 x', g: 'T x 2 1 1 x', s: 6, c: 'thumb' },
      { f: 'x 0 2 1 1 0', g: 'x 1 4 2 3 1', s: 5, c: 'full' },
    ],
    m7b5: [
      { f: '0 x 0 0 -1 x', g: 'T x 2 3 1 x', s: 6, c: 'thumb' },
      { f: 'x 0 1 0 1 x', g: 'x 1 3 2 4 x', s: 5, c: 'full' },
    ],
    dim7: [
      { f: '0 x -1 0 -1 x', g: 'T x 1 3 2 x', s: 6, c: 'thumb' },
      { f: 'x 0 1 -1 1 x', g: 'x 2 3 1 4 x', s: 5, c: 'full' },
    ],
    'maj7#5': [{ f: '0 x 1 1 1 x', g: 'T x 1 1 1 x', s: 6, c: 'thumb' }],
    '7b5': [{ f: '0 x 0 1 -1 x', g: 'T x 2 3 1 x', s: 6, c: 'thumb' }],
    9: [
      { f: '0 x 0 1 0 2', g: 'T x 1 2 1 4', s: 6, c: 'thumb' },
      { f: 'x 0 -1 0 0 0', g: 'x 2 1 3 3 3', s: 5, c: 'full' },
    ],
    13: [
      { f: '0 x 0 1 2 x', g: 'T x 1 2 3 x', s: 6, c: 'thumb' },
      { f: 'x 0 -1 0 0 2', g: 'x 2 1 3 3 4', s: 5, c: 'full' },
    ],
    '7#9': [
      { f: '0 x 0 1 0 3', g: 'T x 1 2 1 4', s: 6, c: 'thumb' },
      { f: 'x 0 -1 0 1 x', g: 'x 2 1 3 4 x', s: 5, c: 'full' },
    ],
    '7b9': [
      { f: '0 x 0 1 0 1', g: 'T x 1 2 1 3', s: 6, c: 'thumb' },
      { f: 'x 0 -1 0 -1 x', g: 'x 2 1 3 1 x', s: 5, c: 'full' },
    ],
    '7#11': [{ f: 'x 0 -1 0 0 -1', g: 'x 2 1 3 4 1', s: 5, c: 'full' }],
    maj9: [
      { f: '0 -1 1 -1 x x', g: 'T 1 3 1 x x', s: 6, c: 'thumb' },
      { f: 'x 0 -1 1 0 x', g: 'x 2 1 4 3 x', s: 5, c: 'full' },
    ],
    'maj7#11': [{ f: '0 x 1 1 -1 x', g: 'T x 3 4 1 x', s: 6, c: 'thumb' }],
    m9: [
      { f: '0 x 0 0 0 2', g: 'T x 1 1 1 4', s: 6, c: 'thumb' },
      { f: 'x 0 -2 0 0 x', g: 'x 2 1 3 4 x', s: 5, c: 'full' },
    ],
    m11: [
      { f: '0 x 0 0 -2 x', g: 'T x 2 3 1 x', s: 6, c: 'thumb' },
      { f: '0 0 0 0 0 0', g: '1 1 1 1 1 1', s: 6, c: 'full' },
      { f: 'x 0 0 0 1 x', g: 'x 1 1 1 2 x', s: 5, c: 'full' },
    ],
  };

  // Chwyty otwarte: progi bezwzględne, klucz = 'pryma(pc):akord'
  const OPENS = {
    '4:maj': [{ f: '0 2 2 1 0 0', g: '0 2 3 1 0 0' }],
    '4:m': [{ f: '0 2 2 0 0 0', g: '0 2 3 0 0 0' }],
    '4:7': [{ f: '0 2 0 1 0 0', g: '0 2 0 1 0 0' }],
    '4:m7': [{ f: '0 2 0 0 0 0', g: '0 2 0 0 0 0' }],
    '4:maj7': [{ f: '0 2 1 1 0 0', g: '0 3 1 2 0 0' }],
    '4:sus4': [{ f: '0 2 2 2 0 0', g: '0 2 3 4 0 0' }],
    '4:7sus4': [{ f: '0 2 0 2 0 0', g: '0 2 0 3 0 0' }],
    '4:9': [{ f: '0 2 0 1 0 2', g: '0 2 0 1 0 3' }],
    '4:m6': [{ f: '0 2 2 0 2 0', g: '0 1 2 0 3 0' }],
    '4:m9': [{ f: '0 2 0 0 0 2', g: '0 1 0 0 0 3' }],
    '9:maj': [{ f: 'x 0 2 2 2 0', g: 'x 0 1 2 3 0' }],
    '9:m': [{ f: 'x 0 2 2 1 0', g: 'x 0 2 3 1 0' }],
    '9:7': [{ f: 'x 0 2 0 2 0', g: 'x 0 2 0 3 0' }],
    '9:m7': [{ f: 'x 0 2 0 1 0', g: 'x 0 2 0 1 0' }],
    '9:maj7': [{ f: 'x 0 2 1 2 0', g: 'x 0 2 1 3 0' }],
    '9:sus2': [{ f: 'x 0 2 2 0 0', g: 'x 0 1 2 0 0' }],
    '9:sus4': [{ f: 'x 0 2 2 3 0', g: 'x 0 1 2 3 0' }],
    '9:7sus4': [{ f: 'x 0 2 0 3 0', g: 'x 0 2 0 3 0' }],
    '9:6': [{ f: 'x 0 2 2 2 2', g: 'x 0 1 1 1 1' }],
    '9:m6': [{ f: 'x 0 2 2 1 2', g: 'x 0 2 3 1 4' }],
    '2:maj': [{ f: 'x x 0 2 3 2', g: 'x x 0 1 3 2' }, { f: '2 x 0 2 3 2', g: 'T x 0 1 3 2', c: 'thumb' }],
    '2:m': [{ f: 'x x 0 2 3 1', g: 'x x 0 2 3 1' }],
    '2:7': [{ f: 'x x 0 2 1 2', g: 'x x 0 2 1 3' }, { f: '2 x 0 2 1 2', g: 'T x 0 2 1 3', c: 'thumb' }],
    '2:m7': [{ f: 'x x 0 2 1 1', g: 'x x 0 2 1 1' }],
    '2:maj7': [{ f: 'x x 0 2 2 2', g: 'x x 0 1 1 1' }],
    '2:sus2': [{ f: 'x x 0 2 3 0', g: 'x x 0 1 3 0' }],
    '2:sus4': [{ f: 'x x 0 2 3 3', g: 'x x 0 1 2 3' }],
    '2:6': [{ f: 'x x 0 2 0 2', g: 'x x 0 1 0 2' }],
    '2:m6': [{ f: 'x x 0 2 0 1', g: 'x x 0 2 0 1' }],
    '7:maj': [{ f: '3 2 0 0 0 3', g: '2 1 0 0 0 3' }, { f: '3 x 0 0 0 3', g: 'T x 0 0 0 3', c: 'thumb' }],
    '7:7': [{ f: '3 2 0 0 0 1', g: '3 2 0 0 0 1' }],
    '7:maj7': [{ f: '3 2 0 0 0 2', g: '3 2 0 0 0 1' }],
    '7:6': [{ f: '3 2 0 0 0 0', g: '2 1 0 0 0 0' }],
    '0:maj': [{ f: 'x 3 2 0 1 0', g: 'x 3 2 0 1 0' }],
    '0:7': [{ f: 'x 3 2 3 1 0', g: 'x 3 2 4 1 0' }],
    '0:maj7': [{ f: 'x 3 2 0 0 0', g: 'x 3 2 0 0 0' }],
    '0:add9': [{ f: 'x 3 2 0 3 0', g: 'x 2 1 0 3 0' }],
    '5:maj7': [{ f: 'x x 3 2 1 0', g: 'x x 3 2 1 0' }],
    '11:7': [{ f: 'x 2 1 2 0 2', g: 'x 2 1 3 0 4' }],
    '11:m7': [{ f: 'x 2 0 2 0 2', g: 'x 1 0 2 0 3' }],
  };

  const fretted = (frets) => frets.filter((f) => f !== null && f > 0);

  // Palcowanie dla chwytów generowanych: najniższy próg = palec wskazujący (barré), dalej wg odstępu.
  // Zwraca null, gdy układu nie da się złapać czterema palcami.
  function autoFinger(frets, k) {
    const fing = frets.map((f, i) => (f === null ? null : i < k ? 'T' : null));
    const notes = [];
    for (let i = k; i < 6; i++) if (frets[i] > 0) notes.push({ s: i, f: frets[i] });
    if (!notes.length) return fing;
    const minF = Math.min(...notes.map((n) => n.f));
    const groups = new Map();
    for (const n of notes) { if (!groups.has(n.f)) groups.set(n.f, []); groups.get(n.f).push(n.s); }
    let next = 1;
    for (const f of [...groups.keys()].sort((a, b) => a - b)) {
      const strs = groups.get(f);
      const lo = strs[0], hi = strs[strs.length - 1];
      // barré: żadna struna pod palcem nie może być pusta ani mieć niższego progu
      let canBarre = strs.length > 1;
      for (let i = lo; i <= hi; i++) if (frets[i] !== null && (frets[i] === 0 || frets[i] < f)) canBarre = false;
      const base = f === minF ? 1 : Math.max(next, Math.min(4, f - minF + 1));
      if (base > 4) return null;
      const free = 4 - base + 1;
      if (canBarre && (f === minF || strs.length >= 3 || strs.length > free)) {
        const fg = f === minF ? 1 : Math.max(base, 3);
        for (const s of strs) fing[s] = fg;
        next = fg + 1;
      } else {
        if (strs.length > free) return null;
        let fg = base;
        for (const s of strs) { fing[s] = fg; fg++; }
        next = fg;
      }
    }
    return fing;
  }

  function scoreOf(frets, fingers, k) {
    const fr = [];
    const used = new Set();
    for (let i = 0; i < 6; i++) {
      if (fingers[i] && fingers[i] !== 'T') { used.add(fingers[i]); fr.push(frets[i]); }
    }
    const span = fr.length ? Math.max(...fr) - Math.min(...fr) : 0;
    const all = fretted(frets);
    const top = all.length ? Math.max(...all) : 0;
    let first = -1, last = -1, inner = 0;
    frets.forEach((f, i) => { if (f !== null) { if (first < 0) first = i; last = i; } });
    for (let i = first; i <= last; i++) if (frets[i] === null) inner++;
    return used.size + span * 0.5 + [0, 0.5, 0.9, 1.5][k] + inner * 0.6 + (top > 12 ? 2.5 : top > 9 ? 0.8 : 0) + (k && top > 9 ? 1 : 0);
  }

  function mk(rootPc, q, frets, fingers, k, cat, extra) {
    const lab = new Map();
    for (const t of q.tones.concat(q.opts)) if (!lab.has(mod(rootPc + t.semi, 12))) lab.set(mod(rootPc + t.semi, 12), t.label);
    const labels = frets.map((f, i) => (f === null ? null : lab.get(mod(OPC[i] + f, 12)) || '?'));
    const fr = fretted(frets);
    const bassIdx = frets.findIndex((f) => f !== null);
    return Object.assign({
      frets, fingers, thumb: k, cat, labels,
      base: fr.length ? Math.min(...fr) : 0,
      top: fr.length ? Math.max(...fr) : 0,
      hasRoot: labels.includes('1'),
      bass: labels[bassIdx],
      bassPc: mod(OPC[bassIdx] + frets[bassIdx], 12),
      midi: frets.map((f, i) => (f === null ? null : OPEN[i] + f)).filter((m) => m !== null),
      score: scoreOf(frets, fingers, k),
      key: frets.map((f) => (f === null ? 'x' : f)).join('.') + (k ? 'T' + k : ''),
    }, extra);
  }

  // czy chwyt zawiera wyłącznie dźwięki akordu i wszystkie składniki wymagane
  function valid(rootPc, q, frets) {
    const pcs = new Set();
    const allowed = new Set(q.tones.concat(q.opts).map((t) => mod(rootPc + t.semi, 12)));
    for (let i = 0; i < 6; i++) {
      if (frets[i] === null) continue;
      const pc = mod(OPC[i] + frets[i], 12);
      if (!allowed.has(pc)) return false;
      pcs.add(pc);
    }
    for (const r of q.req) if (!pcs.has(mod(rootPc + r, 12))) return false;
    return true;
  }

  function fromForm(rootPc, q, form) {
    const offs = form.f.split(' ').map((x) => (x === 'x' ? null : +x));
    const minOff = Math.min(...offs.filter((x) => x !== null));
    let r = mod(rootPc - OPC[6 - form.s], 12);
    if (r === 0) r = 12;
    if (r + minOff < 0) r += 12;
    if (r + Math.max(...offs.filter((x) => x !== null)) > MAXF) return null;
    const frets = offs.map((o) => (o === null ? null : r + o));
    const g = form.g.split(' ');
    const fingers = frets.map((f, i) => (f === null || f === 0 ? null : g[i] === 'T' ? 'T' : +g[i]));
    const k = g.filter((x) => x === 'T').length;
    return mk(rootPc, q, frets, fingers, k, form.c, { curated: true });
  }

  function fromOpen(rootPc, q, o) {
    const frets = o.f.split(' ').map((x) => (x === 'x' ? null : +x));
    const g = o.g.split(' ');
    const fingers = frets.map((f, i) => (f === null || f === 0 ? null : g[i] === 'T' ? 'T' : +g[i]));
    return mk(rootPc, q, frets, fingers, g.filter((x) => x === 'T').length, o.c || 'full', { curated: true, open: true });
  }

  // Wszystkie małe układy na 3–4 sąsiednich strunach (D‑G‑B‑e) w rozpiętości 4 progów.
  function fragments(rootPc, q) {
    const tonePcs = new Set(q.tones.map((t) => mod(rootPc + t.semi, 12)));
    const out = [];
    SETS.forEach((set, si) => {
      for (let b = 1; b <= 12; b++) {
        const opts = set.map((s) => {
          const a = [];
          for (let f = b; f <= Math.min(b + 3, MAXF); f++) if (tonePcs.has(mod(OPC[s] + f, 12))) a.push(f);
          return a;
        });
        const walk = (i, acc) => {
          if (i === set.length) {
            if (Math.min(...acc) !== b) return;
            const pcs = new Set(acc.map((f, j) => mod(OPC[set[j]] + f, 12)));
            const need = set.length === 3 ? Math.min(3, q.set.size) : Math.min(4, q.set.size);
            if (pcs.size < (set.length === 3 ? need : Math.min(need, 3))) return;
            out.push({ si, set, fr: acc.slice(), pcs });
            return;
          }
          for (const f of opts[i]) { acc.push(f); walk(i + 1, acc); acc.pop(); }
        };
        walk(0, []);
      }
    });
    return out;
  }

  const toFrets = (frag, k, t) => {
    const frets = [null, null, null, null, null, null];
    for (let i = 0; i < k; i++) frets[i] = t;
    frag.set.forEach((s, j) => { frets[s] = frag.fr[j]; });
    return frets;
  };

  const cache = new Map();
  function voicings(rootPc, qualId, maxThumb) {
    const ck = rootPc + ':' + qualId + ':' + maxThumb;
    if (cache.has(ck)) return cache.get(ck);
    const q = QU[qualId];
    const frags = fragments(rootPc, q);
    const seen = new Set();
    const add = (list, v) => { if (!seen.has(v.key)) { seen.add(v.key); list.push(v); } };

    // pełne i z kciukiem — z tabeli
    const full = [], thumb = [];
    for (const o of OPENS[rootPc + ':' + qualId] || []) {
      const v = fromOpen(rootPc, q, o);
      if (v.thumb <= maxThumb) add(v.thumb ? thumb : full, v);
    }
    for (const form of FORMS[qualId] || []) {
      const v = fromForm(rootPc, q, form);
      if (v && v.thumb <= maxThumb) add(v.thumb ? thumb : full, v);
    }

    // funk: sam układ na górnych strunach
    const funk = [];
    for (const fg of frags) {
      const distinct = fg.pcs.size;
      const want = fg.set.length === 3 ? Math.min(3, q.set.size) : Math.min(4, q.set.size);
      if (distinct < want) continue;
      const frets = toFrets(fg, 0, 0);
      if (!valid(rootPc, q, frets)) continue;
      const fing = autoFinger(frets, 0);
      if (fing) add(funk, mk(rootPc, q, frets, fing, 0, 'funk', { si: fg.si }));
    }
    funk.sort((a, b) => a.base - b.base || a.si - b.si || a.score - b.score);

    // kciuk na 1–3 strunach basowych + układ na górze
    const has = (semi) => q.set.has(semi);
    for (let k = 1; k <= maxThumb; k++) {
      for (let t = 1; t <= 12; t++) {
        const bass = mod(OPC[0] + t - rootPc, 12);
        // bas: pryma; przy kciuku na 2–3 strunach także kwinta (wtedy pryma wypada na strunie A)
        if (!(bass === 0 || (k >= 2 && bass === 7))) continue;
        let ok = true;
        for (let i = 0; i < k; i++) if (!has(mod(OPC[i] + t - rootPc, 12))) ok = false;
        if (!ok) continue;
        for (const fg of frags) {
          if (fg.set[0] < k) continue;
          if (fg.set.length === 3 && fg.pcs.size < Math.min(3, q.set.size)) continue;
          const m = Math.min(...fg.fr), M = Math.max(...fg.fr);
          // kciuk leży naprzeciw palca wskazującego: najwyżej 2 progi nad nim, najwyżej 1 pod nim
          if (m < t - 2 || m > t + 1 || M > t + 3) continue;
          const frets = toFrets(fg, k, t);
          if (!valid(rootPc, q, frets)) continue;
          const all = new Set(frets.map((f, i) => (f === null ? -1 : mod(OPC[i] + f, 12))));
          all.delete(-1);
          if (all.size < Math.min(4, q.set.size)) continue;
          const fing = autoFinger(frets, k);
          if (!fing) continue;
          const v = mk(rootPc, q, frets, fing, k, 'thumb', { si: fg.si });
          if (v.score <= 6) add(thumb, v);
        }
      }
    }
    const rank = (v) => v.score - (v.curated ? 1.5 : 0);
    thumb.sort((a, b) => rank(a) - rank(b) || a.base - b.base);
    full.sort((a, b) => (b.open ? 1 : 0) - (a.open ? 1 : 0) || a.score - b.score);

    // najprostsze: po trzy z funku i z kciuka, bez układów, które się w sobie zawierają
    const overlap = (a, b) => {
      let common = 0;
      for (let i = 0; i < 6; i++) {
        if (a.frets[i] === null || b.frets[i] === null) continue;
        if (a.frets[i] !== b.frets[i]) return false;
        common++;
      }
      return common >= 2;
    };
    const pick = (list, n) => {
      const got = [];
      for (const v of list.slice().sort((a, b) => rank(a) - rank(b) || (b.hasRoot ? 1 : 0) - (a.hasRoot ? 1 : 0) || a.base - b.base)) {
        if (got.length >= n) break;
        if (!got.some((x) => overlap(x, v))) got.push(v);
      }
      return got;
    };
    const best = pick(funk, thumb.length ? 3 : 6);
    best.push(...pick(thumb.filter((v) => v.score <= 6.5), 6 - best.length));
    const res = { best, funk, thumb, full };
    cache.set(ck, res);
    return res;
  }

  // Akordy progresji w jednej pozycji (palec wskazujący na progu p), na tym samym zestawie strun.
  function inPosition(chords, si, p) {
    return chords.map((c) => {
      const cand = voicings(c.pc, c.qual, 0).funk.filter((v) => v.si === si && v.base >= p && v.top <= p + 3 && !v.frets.includes(0));
      cand.sort((a, b) => a.score - b.score);
      return cand[0] || null;
    });
  }
  function bestPosition(chords, si) {
    let best = { p: 5, cost: Infinity };
    for (let p = 1; p <= 10; p++) {
      const vs = inPosition(chords, si, p);
      const cost = vs.reduce((a, v) => a + (v ? v.score : 20), 0) + (p < 3 ? 0.3 : 0) + (p > 8 ? 0.3 : 0);
      if (cost < best.cost) best = { p, cost };
    }
    return best.p;
  }

  const lib = {
    SCALES, SC, QUALS, QU, FORMS, OPENS, SETS, SET_NAMES, OPEN, OPC, DEFAULT_ROOTS,
    iv, pretty, mod, noteStr, roman, scaleInfo, chordAt, chordName, chordTones, voicings, inPosition, bestPosition,
    valid, fromForm, fromOpen,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = lib;
  else global.ChordLib = lib;
})(typeof window !== 'undefined' ? window : globalThis);
