/* Sprawdzenie danych chwytów: node tools/check-chords.js [--dump Am7 ...] */
const L = require('../chords-lib.js');
let errors = 0;
const fail = (m) => { errors++; console.log('BŁĄD: ' + m); };
const show = (v) => v.frets.map((f) => (f === null ? 'x' : f)).join(' ') + '  [' + v.fingers.map((f) => f || '-').join(' ') + ']  ' +
  v.labels.map((l) => l || '-').join(' ') + '  score ' + v.score.toFixed(1);

// 1. każdy chwyt z tabeli, dla każdej prymy: tylko dźwięki akordu, wszystkie wymagane, palce spójne
for (const q of L.QUALS) {
  for (let pc = 0; pc < 12; pc++) {
    for (const form of L.FORMS[q.id] || []) {
      const v = L.fromForm(pc, q, form);
      if (!v) { if (pc === 0) console.log('uwaga: brak ' + q.id + ' ' + form.f + ' dla pc ' + pc); continue; }
      if (!L.valid(pc, q, v.frets)) fail(`${q.id} ${form.f} (pc ${pc}): ${show(v)}`);
      const want = form.bass5 ? '5' : '1';
      if (v.bass !== want) fail(`${q.id} ${form.f}: bas ${v.bass}, oczekiwano ${want}`);
      const fr = v.frets.filter((f) => f > 0);
      if (Math.max(...fr) - Math.min(...fr) > 4) fail(`${q.id} ${form.f}: rozpiętość > 4`);
      // ten sam palec = ten sam próg (barré); wyższy palec nie leży niżej
      const byF = {};
      v.fingers.forEach((g, i) => { if (g && g !== 'T') (byF[g] = byF[g] || []).push(v.frets[i]); });
      for (const [g, fs] of Object.entries(byF)) if (new Set(fs).size > 1) fail(`${q.id} ${form.f}: palec ${g} na różnych progach`);
      const gs = Object.keys(byF).map(Number).sort();
      for (let i = 1; i < gs.length; i++) if (byF[gs[i]][0] < byF[gs[i - 1]][0]) fail(`${q.id} ${form.f}: palec ${gs[i]} poniżej ${gs[i - 1]}`);
    }
  }
}
for (const [key, list] of Object.entries(L.OPENS)) {
  const [pc, qid] = key.split(':');
  if (!L.QU[qid]) { fail('nieznany akord ' + key); continue; }
  for (const o of list) {
    const v = L.fromOpen(+pc, L.QU[qid], o);
    if (!L.valid(+pc, L.QU[qid], v.frets)) fail(`otwarty ${key} ${o.f}: ${show(v)}`);
  }
}

// 2. skale: pisownia bez podwójnych znaków, vampy mieszczą się w skali (chyba że free)
for (const s of L.SCALES) {
  for (let pc = 0; pc < 12; pc++) {
    const info = L.scaleInfo(pc, s.id);
    if (info.notes.some((n) => Math.abs(n.acc) > 1)) fail(`${s.id} pc ${pc}: podwójny znak`);
    for (const v of s.vamps) {
      for (const c of v.ch) {
        const [label, qid] = c.split(':');
        if (!L.QU[qid]) { fail(`${s.id}: nieznany akord ${c}`); continue; }
        const ch = L.chordAt(info, label, qid);
        const inScale = L.QU[qid].tones.every((t) => info.harm.set.has(L.mod(L.iv(label).semi + t.semi, 12)));
        if (!inScale && !v.free && pc === 0) fail(`${s.id}: ${c} poza skalą`);
        if (inScale && v.free && v.ch.every((x) => { const [l2, q2] = x.split(':'); return L.QU[q2].tones.every((t) => info.harm.set.has(L.mod(L.iv(l2).semi + t.semi, 12))); }) && pc === 0) fail(`${s.id}: vamp oznaczony free, a mieści się w skali`);
        const r = L.voicings(ch.pc, qid, 3);
        if (!r.funk.length) fail(`${s.id} ${c} pc ${pc}: brak układów funk`);
      }
    }
  }
}

// 3. każdy akord, każda pryma: generator coś zwraca i wszystko jest poprawne
let n = 0;
for (const q of L.QUALS) {
  for (let pc = 0; pc < 12; pc++) {
    const r = L.voicings(pc, q.id, 3);
    for (const v of [...r.funk, ...r.thumb, ...r.full]) {
      n++;
      if (!L.valid(pc, q, v.frets)) fail(`gen ${q.id} pc ${pc}: ${show(v)}`);
      if (v.labels.includes('?')) fail(`etykieta ? ${q.id} pc ${pc}: ${show(v)}`);
      const gs = new Set(v.fingers.filter((g) => g && g !== 'T'));
      if (gs.size > 4) fail(`za dużo palców ${q.id} pc ${pc}: ${show(v)}`);
    }
    if (!r.best.length) fail(`brak najprostszych: ${q.id} pc ${pc}`);
    if (!r.funk.length) fail(`brak funk: ${q.id} pc ${pc}`);
  }
}
console.log(`sprawdzono ${n} chwytów, błędów: ${errors}`);

// podgląd: --dump A:m7 E:9
const i = process.argv.indexOf('--dump');
if (i > 0) {
  const names = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  for (const a of process.argv.slice(i + 1)) {
    const [rn, qid] = a.split(':');
    const r = L.voicings(names.indexOf(rn), qid || 'maj', 3);
    for (const k of ['best', 'funk', 'thumb', 'full']) {
      console.log(`\n${a} — ${k} (${r[k].length})`);
      for (const v of r[k]) console.log('  ' + show(v) + (v.curated ? '  *' : ''));
    }
  }
}
process.exit(errors ? 1 : 0);
