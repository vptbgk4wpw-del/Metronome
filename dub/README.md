# Dub

Generatywna maszyna dub techno w przeglądarce. Wszystko, co ma wysokość, jest zapisane jako stopień skali i oktawa, a skala to lista centów, więc makamy i etiopskie qenet działają tak samo jak skale 12-TET.

- `dist/dub.html` — całe narzędzie w jednym pliku, działa offline (krój Inter dociąga się z sieci tylko wtedy, gdy jest dostępna).
- `dist/dub-engine.js` — sam silnik jako jeden moduł ES bez zależności, do osadzenia w Dish i Marble.

## Praca nad kodem

```
npm install
npm run dev      # Vite, http://localhost:5173/dub.html
npm run build    # dist/dub.html i dist/dub-engine.js
npm test         # testy w Node: strój, generator, harmonogram, MIDI
node tools/accept.mjs   # testy w headless Chromium na zbudowanych plikach (wymaga Playwright)
node tools/demos.mjs    # dema dźwiękowe do renders/
```

## Moduły

| Plik | Rola |
|---|---|
| `src/tuning.js` | silnik stroju w centach: skale, tonacja, A4, korekty stopni, `hz()` jako jedyne miejsce zamiany stopnia na częstotliwość, `snap()` dla filtrów |
| `src/prng.js` | mulberry32 i hasz; logika muzyczna nie używa `Math.random` |
| `src/sequence.js` | generator wzorów: rytmy euklidesowe, szablony stylu, bas z reguł, akordy ze stopni skali, sceny, intensywność |
| `src/scheduler.js` | harmonogram z wyprzedzeniem (timer 25 ms, okno ≥ 100 ms), bez nadrabiania po uśpieniu karty |
| `src/graph.js` | synteza dziesięciu partii i routing na stół |
| `src/fx.js`, `src/tape-worklet.js` | delay taśmowy (AudioWorklet, zapasowo zwykłe węzły), reverb sprężynowy i płytowy, master |
| `src/dub-engine.js` | silnik: stan, transport, zdarzenia, przestrajanie na granicy taktu |
| `src/render.js`, `src/export.js`, `src/formats.js` | render offline, pętla WAV z zawiniętym ogonem, stems, ZIP, nagrywanie |
| `src/midi.js` | Web MIDI out, zegar, pitch bend i rotacja kanałów dla mikrotonów, zegar in, plik MIDI |
| `src/ui.js`, `src/ui.css` | interfejs |

## Osadzanie silnika

```js
import { DubEngine } from './dub-engine.js';

const dub = new DubEngine({ state: { tempo: 118, key: 9, scale: 'aeolian' }, autoConnect: false });
await dub.init(AU.ctx);            // własny kontekst gospodarza; init() bez argumentu tworzy nowy
dub.connect(AU.an);                // connect(node) — dowolna liczba celów
dub.connect(AU.ctx.destination);

dub.on('kick', e => pulse(e.time, e.vel));   // e.time jest w zegarze AudioContext
dub.on('stab', e => flash(e.time, e.vel));
dub.on('step', e => {});                     // każda szesnastka: { step, bar, time, dur }

dub.setTempo(120); dub.setKey('F♯'); dub.setScale('huseyni'); dub.setSeed(4136);
dub.mute('hats'); dub.unmute('hats');
await dub.start();   dub.stop();
```

Zdarzenia partii: `kick`, `bass`, `stab`, `pad`, `hats`, `rim`, `perc`, `air`, `siren`, a także `note` (wszystkie), `step`, `bar`, `scene`, `retune`, `start`, `stop`, `change`. Zdarzenie przychodzi z wyprzedzeniem około 0,14 s względem `e.time`, więc wizualizacja powinna porównywać `e.time` z `ctx.currentTime`.

## Co świadomie nie jest kwantyzowane do skali

- rozstrojenie par oscylatorów w akordach i padach (symetryczne wokół dźwięku skali),
- ruch filtra akordów od LFO (odchylenie w centach wokół skwantowanej częstotliwości spoczynkowej),
- wow i flutter delaya oraz zmiana jego czasu (taśma),
- klawisze GM dla perkusji w MIDI (to numery wyzwalaczy; opcja „In key” wysyła je w tonacji).
