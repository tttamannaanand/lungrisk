import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Relative base so the build works at any path (GitHub Pages serves /lungrisk/).
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        air: resolve(import.meta.dirname, 'air.html'),
      },
    },
  },
});
