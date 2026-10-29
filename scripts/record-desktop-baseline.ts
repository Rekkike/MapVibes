// Records the desktop layout snapshot of a build (Pass 13, unit 4) into
// example-data, with the fingerprint of the environment it was recorded in.
// Usage: vite-node scripts/record-desktop-baseline.ts <index.html> <out.json>
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { snapshotBuild } from '../tests/browser/desktop-snapshot';

const [indexHtml, out] = process.argv.slice(2);
const browser = await chromium.launch();
const { snapshot, fingerprint } = await snapshotBuild(browser, indexHtml);
await browser.close();
writeFileSync(out, `${JSON.stringify({ build: 'v1.3.1', viewport: '1500 x 950', fingerprint, snapshot }, null, 2)}\n`);
console.log(`recorded ${Object.keys(snapshot).length} states, fingerprint ${fingerprint}`);
