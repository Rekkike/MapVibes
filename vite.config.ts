import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// The build version is the specification version, read from the status line
// of docs/SPECIFICATION.md: the same source the release workflow uses for the
// release tag. The workflow passes it in MAPVIBES_VERSION; a local build or
// test run reads the same line. It is never maintained by hand in the source.
function specificationVersion(): string {
  const spec = readFileSync(new URL('./docs/SPECIFICATION.md', import.meta.url), 'utf8');
  const match = spec.match(/Status: v([0-9]+\.[0-9]+\.[0-9]+)/);
  if (!match) throw new Error('specification status line has no version');
  return match[1];
}

const specVersion = specificationVersion();
const injected = process.env.MAPVIBES_VERSION;
if (injected !== undefined && injected !== specVersion) {
  throw new Error(`MAPVIBES_VERSION ${injected} differs from the specification version ${specVersion}`);
}

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(injected ?? specVersion),
  },
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
    // Since v2.3.0 the demo's parkland extract (demo-map.osm, 6.36 MiB) is
    // bundled as a raw string in the module graph of every UI test file
    // (main -> demo.ts), so each file's first test pays a larger module init:
    // measured 1.5 s at v2.2.2, 3.7 s locally at v2.3.0, and over the default
    // 5 s on the 4-core CI runner, where it timed out once. The default test
    // timeout is raised to 20 s; long tests keep their explicit timeouts.
    testTimeout: 20_000,
  },
});
