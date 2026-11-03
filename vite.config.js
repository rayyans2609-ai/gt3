import { defineConfig } from 'vite';
import theatreSave from './scripts/vite-theatre-save.mjs';

export default defineConfig({
  plugins: [theatreSave()], // dev-server only (apply: 'serve'); absent from build/preview
  publicDir: 'public',
  // Scan only GT3's entry: otherwise the dev dependency scan crawls git-ignored local/ material
  // (reference projects) and fails, which delays pre-bundling and reloads the page mid-session.
  optimizeDeps: { entries: ['index.html'] },
  server: {
    port: 5173,
    open: false,
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
});
