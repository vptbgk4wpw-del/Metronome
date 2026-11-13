import { defineConfig } from 'vite';

/* The engine on its own, as one ES module with no dependencies, for embedding in Dish and Marble. */
export default defineConfig({
  build: { target: 'es2020', outDir: 'dist', emptyOutDir: false, minify: false,
    lib: { entry: 'src/embed.js', formats: ['es'], fileName: () => 'dub-engine.js' } },
});
