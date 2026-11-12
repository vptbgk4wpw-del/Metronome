# Metronom — rytmy świata

Minimalistyczny metronom z zegarem rytmicznym (styl szwajcarski / International Typographic Style) z cyklami rytmicznymi z dziewięciu kategorii:
**Latin · Brazil · Flamenco · Greek · Turkish · Arabic · Persian · Ethiopian · Hip-hop** (118 rytmów).

Rytmy są wielogłosowe: każdy głos (np. dum i tak, surdo i tamborim, kick, snare i hi-hat) ma własny tor i może grać jednocześnie z innymi.

Zwykła strona HTML + PWA. Nie ma zależności ani kroku budowania. Działa offline i da się ją dodać do ekranu głównego telefonu jak aplikację.

## Uruchomienie na telefonie (najprościej)

1. Włącz GitHub Pages dla repozytorium: *Settings → Pages → Build and deployment → Source: Deploy from a branch*, wybierz gałąź (np. `main`) i folder `/ (root)`.
2. Po minucie strona jest pod adresem `https://<użytkownik>.github.io/<repo>/`.
3. Otwórz ten adres na telefonie:
   - **iPhone (Safari):** Udostępnij → *Do ekranu początkowego*.
   - **Android (Chrome):** menu ⋮ → *Zainstaluj aplikację* / *Dodaj do ekranu głównego*.
4. Ikona działa jak aplikacja: pełny ekran, offline, ekran nie gaśnie w trakcie grania.

Lokalnie (komputer): `python3 -m http.server` w folderze repo, potem `http://localhost:8000`.

> iPhone: dźwięk gra również przy włączonym przełączniku wyciszenia (aplikacja ustawia sesję audio na „playback”).

## Obsługa

| Element | Działanie |
|---|---|
| Kategorie | wybór tradycji |
| Nazwa rytmu / „lista ↓” | lista wszystkich rytmów kategorii |
| ← → | poprzedni / następny rytm |
| Zegar rytmiczny | cykl na okręgu (krok 1 u góry, zgodnie z ruchem wskazówek), uderzenia połączone w wielokąt, czerwona wskazówka biegnie po cyklu. Duża kropka = mocne (dum / tom / akcent), mała pełna = wysokie (tek / bak / palma), pusta = lekkie (ka / ghost / sorda). We flamenco 12 jest u góry, jak na tarczy zegara. **Dotknij kropki**, aby zmienić uderzenie; „Przywróć” wraca do oryginału |
| Zegar / Sekwencer | przełącza widok: zegar rytmiczny albo sekwencer w stylu grooveboxa (osobny tor na każde uderzenie, kolumna = krok; dotknięcie pada włącza/wyłącza uderzenie, dotknięcie nazwy toru wycisza tor) |
| Legenda | dotknięcie wycisza / włącza daną warstwę (np. sam dum) |
| Feel | (pod metrum, gdy rytm ma swing lub mikrotiming) włącza / wyłącza przesunięcia uderzeń względem siatki: samba, forró, xote, swing hip-hopu. Wyłączony = wszystko równo, jak metronom |
| Duża liczba | tempo; przeciągnij palcem w górę / w dół, albo − / + (przytrzymaj = szybko) |
| „typowo 60–120” | ustawia typowe tempo dla rytmu |
| Tap | tempo wystukane palcem |
| Puls | dodatkowy klik na każdą miarę / grupę (w metrach aksak: na każdą nierówną grupę 2/3) |
| Klawiatura | spacja = start/stop, ↑↓ = tempo, ←→ = rytm, T = tap |

**Jednostka tempa** to zawsze odczuwalna miara, podana obok słowa „Tempo”:
- metra proste i nieparzyste (2/4, 4/4, 5/8, 7/8, 9/8, 10/8) → ♩ (ćwierćnuta = 2 ósemki); w aksaku grupa 3 trwa ♩.,
- metra złożone (6/8, 12/8) → ♩.,
- clave (son, rumba, bossa, cáscara) → jeden takt 4/4 z 16 szesnastkami, czyli puls „na dwa” kubańskiego 2-taktowego zapisu,
- flamenco 12-miarowe → pulsy compás.

## Pliki

- `index.html`, `styles.css`, `app.js`: interfejs i silnik (Web Audio, harmonogram z wyprzedzeniem, syntetyzowane brzmienia: darbuka, kudüm, tombak, kebero, clave/conga, palmas, surdo/tamborim/ganzá, zabumba/bacalhau/trójkąt, automat perkusyjny)
- `rhythms.js`: **wszystkie rytmy** jako dane. Rytm to albo jeden ciąg znaków (`pattern`, jeden znak na krok: `D` nisko/mocno, `T` wysoko, `K` lekko, `.` pauza; we flamenco `X` / `x` / `o`), albo osobne tory (`tracks`, np. `{ D: 'x...x...', T: '..x...x.' }`), gdy kilka głosów gra jednocześnie. Hip-hop ma tory `D` kick, `T` snare, `G` ghost, `K` hi-hat, `O` open hat; `swing` = swing w stylu MPC. Rytm może mieć własny zestaw (`kit` + `strokes`, np. forró: zabumba + trójkąt). `micro` = mikrotiming: przesunięcia w ułamkach kroku, powtarzane co miarę (np. samba `[0, 0, -0.06, -0.16]`), wspólne lub osobne dla torów.
- `sw.js`, `manifest.webmanifest`, `icons/`: PWA (offline, ikona)

## Źródła i uwagi o rytmach

Zobacz [SOURCES.md](SOURCES.md).
