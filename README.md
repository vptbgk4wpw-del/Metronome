# Metronom — rytmy świata

Minimalistyczny metronom (styl szwajcarski / International Typographic Style) z cyklami rytmicznymi z sześciu tradycji:
**Latin · Flamenco · Turkish · Arabic · Persian · Ethiopian**.

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
| Kategorie (siatka 3×2) | wybór tradycji |
| Nazwa rytmu / „lista ↓” | lista wszystkich rytmów kategorii |
| ← → | poprzedni / następny rytm |
| Siatka słupków | wzór cyklu: wysoki słupek = mocne uderzenie (dum / tom / akcent), średni = wysokie (tek / bak / palma), obrys = lekkie (ka / ghost / sorda). **Dotknij komórki**, aby zmienić uderzenie; „Przywróć wzór” wraca do oryginału |
| Legenda | dotknięcie wycisza / włącza daną warstwę (np. sam dum) |
| Duża liczba | tempo; przeciągnij palcem w górę / w dół, albo − / + (przytrzymaj = szybko) |
| „typowo 60–120” | ustawia typowe tempo dla rytmu |
| Tap | tempo wystukane palcem |
| Puls | dodatkowy klik na każdą miarę / grupę (w metrach aksak: na każdą nierówną grupę 2/3) |
| Klawiatura | spacja = start/stop, ↑↓ = tempo, ←→ = rytm, T = tap |

**Jednostka tempa** jest podana pod liczbą (♩, ♩., ♪). Metra złożone (6/8, 12/8) liczymy w ćwierćnutach z kropką. Metra aksak / addytywne (5/8, 7/8, 9/8, 10/8) liczymy w ósemkach, tak jak uczy się ich w praktyce tureckiej i arabskiej. Flamenco liczymy w pulsach compás (1–12).

## Pliki

- `index.html`, `styles.css`, `app.js`: interfejs i silnik (Web Audio, harmonogram z wyprzedzeniem, syntetyzowane brzmienia: darbuka, kudüm, tombak, kebero, clave/conga, palmas)
- `rhythms.js`: **wszystkie rytmy** jako dane. Wzór to ciąg znaków, jeden znak na krok:
  `D` nisko/mocno, `T` wysoko, `K` lekko, `.` pauza; we flamenco `X` palma akcentowana, `x` palma, `o` sorda.
- `sw.js`, `manifest.webmanifest`, `icons/`: PWA (offline, ikona)

## Źródła i uwagi o rytmach

Zobacz [SOURCES.md](SOURCES.md).
