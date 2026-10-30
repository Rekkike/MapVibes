// @vitest-environment node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { differences, snapshotBuild, type Snapshot } from './desktop-snapshot';

// Desktop safety (Pass 13, unit 4): at 1500 × 950 the narrow viewer layout
// (FR-58) changes nothing. The computed styles and bounding boxes of the main
// elements, in ten states of the application and the exported viewer, are
// compared with those of the released v1.3.1 build, rendered in the same
// browser with the same fonts, and that build's snapshot with the one
// recorded before any change of Pass 13 (example-data), wherever the
// environment is the one it was recorded in. The annotation label layers are
// excluded: Pass 13 moves them into the scaled map on purpose (FR-47).
// Run after the build (npm run build); the reference build is the v1.3.1
// release, in dist/reference/v1.3.1 (built from its tag in CI).
const BUILT = join(process.cwd(), 'dist', 'build', 'index.html');
const REFERENCE = join(process.cwd(), 'dist', 'reference', 'v1.3.1', 'index.html');
// The SHA-256 of the released v1.3.1 build's index.html.
const REFERENCE_SHA256 = '077554412e3b6f3cddf1b6b559b29c8450fdbaa5a4231b9bf812c45716d1f75c';
const RECORD = JSON.parse(readFileSync(join(process.cwd(), 'example-data', 'desktop-baseline-v1.3.1.json'), 'utf8')) as { fingerprint: string; snapshot: Snapshot };

// The intended desktop changes since v1.3.1, and nothing else: Pass 14 adds
// "Open presentation" at the end of the row of "Load demo" (FR-60), which
// moves the row's other items sideways, and only sideways.
const MOVED_IN_ROW = ['#manual-start-hint', '#start-empty', '#load-demo'];

function intended(line: string): boolean {
  if (/ all #open-presentation: new$/.test(line)) return true;
  const moved = /^\S+ all (#[\w-]+): (.+) → (.+)$/.exec(line);
  if (!moved || !MOVED_IN_ROW.includes(moved[1])) return false;
  // The same entry but for its horizontal position.
  return moved[2].split('|').slice(1).join('|') === moved[3].split('|').slice(1).join('|');
}

let browser: Browser;

beforeAll(async () => {
  if (!existsSync(BUILT)) throw new Error('dist/build/index.html is missing: run the build first');
  if (!existsSync(REFERENCE)) throw new Error('dist/reference/v1.3.1/index.html is missing: build the v1.3.1 tag into it');
  browser = await chromium.launch();
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

describe('the desktop layout is that of v1.3.1 (Pass 13, unit 4)', () => {
  let reference: { snapshot: Snapshot; fingerprint: string };

  test('the reference is the released v1.3.1 build', () => {
    expect(createHash('sha256').update(readFileSync(REFERENCE)).digest('hex')).toBe(REFERENCE_SHA256);
  });

  test('the reference renders as recorded before any change, where recorded', async () => {
    reference = await snapshotBuild(browser, REFERENCE);
    expect(Object.keys(reference.snapshot)).toEqual(Object.keys(RECORD.snapshot));
    // The record holds in the environment it was recorded in: the browser
    // version and the interface font's metrics. Elsewhere (another font),
    // the reference rendered here is the baseline.
    if (reference.fingerprint === RECORD.fingerprint) expect(differences(RECORD.snapshot, reference.snapshot)).toEqual([]);
    else console.log(`recorded in ${RECORD.fingerprint}; this environment is ${reference.fingerprint}: compared with the reference build only`);
  }, 120_000);

  test('the current build at 1500 × 950 equals the reference in every state', async () => {
    const current = await snapshotBuild(browser, BUILT);
    expect(current.fingerprint).toBe(reference.fingerprint);
    const found = differences(reference.snapshot, current.snapshot);
    // The intended changes are there, in the states with the start row.
    expect(found.filter(intended).filter((l) => l.endsWith(': new')).map((l) => l.split(' ')[0])).toEqual(['start', 'demo-information']);
    expect(found.filter((l) => !intended(l))).toEqual([]);
  }, 120_000);
});
