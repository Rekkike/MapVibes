import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist/build',
    emptyOutDir: true,
    assetsInlineLimit: 100000000,
  },
  test: {
    environment: 'jsdom',
    globals: false,
  },
});
