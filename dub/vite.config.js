import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/* One self-contained HTML file: scripts, styles and the audio worklet are all inlined, so dist/dub.html works offline. */
export default defineConfig({
  plugins: [viteSingleFile()],
  build: { target: 'es2020', outDir: 'dist', emptyOutDir: false, assetsInlineLimit: 1e8, cssCodeSplit: false, rollupOptions: { input: 'dub.html' } },
});
