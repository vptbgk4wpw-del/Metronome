# Marble

Digital marbling (ebru, suminagashi) for live visuals. Sister tool to Dish: the same panel and the same way of
listening to sound, with a different engine. The picture fills the whole screen, and sound can change it for good by
raising bubbles of paint.

## Run

    npm install
    npm run dev        # development server
    npm run build      # dist/index.html, one self-contained file

`dist/index.html` works offline (open it straight from disk) and can be published as an artifact.

## How it works

- **Engine** (`src/engine.js`, `marbEval` in `src/shaders.js`): mathematical marbling after Lu, Jaffer et al. (2012).
  Every operation (drop, tine comb, whirl, sine shear, stylus stroke, ripple) is an exact map; a pixel walks the stack
  of operations backwards to the drop or the baked texture it came from. When the stack gets long its finished part is
  baked into a texture. Baked operations are also kept in a history above a key frame, so a print replays them
  analytically at 4K or 8K instead of enlarging the frame.
- **Colour** (`src/color.js`): pigments mix on the spectrum with Spectral.js (Kubelka–Munk). Each palette is four
  pigments; their mixing ratios are tabulated into a small 3-D texture. "Glass ↔ paint" blends this with transparent
  dye (Beer–Lambert).
- **Sound** (`src/audio.js`, from Dish): four gated bands (Kick, Mid, High, Air) and the dub techno test generator.
- **Bubbling** (`src/bubbling.js`): thirteen vents drift over the sheet, each tied to kick, mid or high. A hit lets some
  of them release a drop that grows from zero; its size follows the loudness. Between hits the chosen vents breathe
  (reversible). "Bubbling" sets how many hits become bubbles; at 0% nothing permanent happens.
- **Patterns** (`src/patterns.js`): Stone, Gel-git, Nonpareil, Chevron, Bouquet, Spanish wave, French curl.
- **Wet layer and ox gall** (`src/fx.js`, off by default): a low-resolution current that carries the baked paint
  through a displacement map, and Gray–Scott reaction-diffusion that opens cells inside the stains.
- **Texture** (`comp` in `src/shaders.js`): dark edges, pigment granulation, paper fibres, and streaks that follow
  every comb pull (noise carried in material coordinates).

Settings are kept in `localStorage` under the `marble.` prefix.

## Credits

Engine from Szalka, sound and light from Dish. Building blocks found through index.opensource (현 @hyun2xyz):

| Project | Licence | Used for |
|---|---|---|
| [Spectral.js](https://github.com/rvanwijnen/spectral.js), Ronald van Wijnen | MIT | pigment mixing (bundled dependency) |
| [WebGL-Fluid-Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation), Pavel Dobryakov | MIT | wet layer (shaders adapted) |
| [reaction-diffusion-webgl](https://github.com/piellardj/reaction-diffusion-webgl), [RDSystem](https://github.com/keijiro/RDSystem), [turing-patterns](https://github.com/ijmbarr/turing-patterns) | MIT / Unlicense / MIT | ox gall (Gray–Scott, own implementation) |
| [psrdnoise](https://github.com/stegu/psrdnoise), Stefan Gustavson and Ian McEwan | MIT (stated in its README; the repository has no licence file) | drift of the current and of the vents (ported) |
| [glsl-smooth-min](https://github.com/glslify/glsl-smooth-min) | MIT | joining of neighbouring bubbles (formula) |
| [LineIntegralConvolutions](https://github.com/AstroKriel/LineIntegralConvolutions) | MIT | idea behind the comb streaks (no code taken) |
| [p5.brush](https://github.com/acamposuribe/p5.brush), [KinoAqua](https://github.com/keijiro/KinoAqua) | MIT / Unlicense | idea behind edges, granulation and paper (no code taken) |
