import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist/build',
    emptyOutDir: true,
    assetsInlineLimit: 100000000,
    // One self-contained bundle is intended (see below); PDF.js makes it large.
    chunkSizeWarningLimit: 4096,
    // The post-build inliner embeds exactly one script bundle: every module,
    // including the PDF.js library and its worker module, goes into it.
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
  },
});
