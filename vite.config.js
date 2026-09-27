import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const fontDirectory = resolve(import.meta.dirname, '../../../font');

export default defineConfig({
  publicDir: 'public',
  server: {
    port: 5173,
    open: false,
    fs: {
      allow: [resolve(import.meta.dirname), fontDirectory],
    },
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
});
