/* placeholder — replaced by researched data */
window.CATEGORIES = [
  { id: 'latin', name: 'Latin', kit: 'latin', strokes: [{ c: 'D', label: 'Bas' }, { c: 'T', label: 'Clave' }, { c: 'K', label: 'Ghost' }] },
  { id: 'flamenco', name: 'Flamenco', kit: 'palmas', strokes: [{ c: 'X', label: 'Acento' }, { c: 'x', label: 'Palma' }, { c: 'o', label: 'Sorda' }] },
  { id: 'turkish', name: 'Turkish', kit: 'kudum', strokes: [{ c: 'D', label: 'Düm' }, { c: 'T', label: 'Tek' }, { c: 'K', label: 'Ka' }] },
  { id: 'arabic', name: 'Arabic', kit: 'darbuka', strokes: [{ c: 'D', label: 'Dum' }, { c: 'T', label: 'Tak' }, { c: 'K', label: 'Ka' }] },
  { id: 'persian', name: 'Persian', kit: 'tombak', strokes: [{ c: 'D', label: 'Tom' }, { c: 'T', label: 'Bak' }, { c: 'K', label: 'Riz' }] },
  { id: 'ethiopian', name: 'Ethiopian', kit: 'kebero', strokes: [{ c: 'D', label: 'Niski' }, { c: 'T', label: 'Wysoki' }, { c: 'K', label: 'Lekki' }] },
];
window.RHYTHMS = {
  latin: [{ id: 'son32', name: 'Son clave 3-2', meter: '4/4', group: '4+4+4+4+4+4+4+4', step: 16, unit: 4, pattern: 'T..T..T.D...T.T.....T.T.D..T....'.slice(0,32), tempo: [80, 200], note: 'test' }],
  flamenco: [{ id: 'solea', name: 'Soleá', meter: '12', group: '3+3+2+2+2', step: 4, unit: 1, pattern: 'xxXxxXxXxXxX', counts: '1 2 3 4 5 6 7 8 9 10 11 12', tempo: [60, 140], note: 'test' }],
  turkish: [{ id: 'aksak', name: 'Aksak', meter: '9/8', group: '2+2+2+3', step: 8, unit: 1, pattern: 'D.KTD.T..', tempo: [120, 300], note: 'test' }],
  arabic: [{ id: 'maqsum', name: 'Maqsum', meter: '4/4', group: '2+2+2+2', step: 8, unit: 2, pattern: 'DT.TD.T.', tempo: [60, 140], note: 'test' }],
  persian: [{ id: 'reng', name: 'Reng', meter: '6/8', group: '3+3', step: 8, unit: 3, pattern: 'D.TD.T', tempo: [50, 100], note: 'test' }],
  ethiopian: [{ id: 'chik', name: 'Chik-chika', meter: '6/8', group: '3+3', step: 8, unit: 3, pattern: 'D.TT.T', tempo: [60, 120], note: 'test' }],
};
