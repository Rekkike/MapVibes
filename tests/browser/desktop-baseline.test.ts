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

// The intended desktop changes since v1.3.1, and nothing else.
//
// Pass 14 adds "Open presentation" at the end of the row of "Load demo"
// (FR-60), which moves the row's other items sideways, and only sideways.
const MOVED_IN_ROW = ['#manual-start-hint', '#start-empty', '#load-demo'];

// Pass 15 (FR-62 to FR-65, FR-41 as amended): the demo's new columns and the
// new controls change what is inside these elements; any change inside them
// is intended.
const CHANGED_INSIDE = [
  '#row-table',
  '#row-table-head',
  '#row-table-body',
  '#column-visibility',
  '#select-filter-column',
  '#card-fields',
  '#card-fields-summary',
  '#card-fields-hint',
  '#card-fields-list',
  '#card-fields-reset',
  '#series-panel',
  '#series-panel-summary',
  '#series-panel-hint',
  '#series-none',
  '#series-list',
  '#currency-unit-row',
  '#currency-unit-label',
  '#currency-unit',
  '#currency-unit-hint',
  '#glance-columns',
  '#glance-columns-list',
  '#glance-columns-reset',
  '#details-panel',
  '#export-columns',
  '#export-columns-hint',
  '#presentation-card',
  '#presentation-card-title',
  '#economics-overlay',
];
// The filter's column list holds the demo's longer new headers, so the list
// toolbar's items after it move sideways (and down with the rest).
const MOVED_IN_TOOLBAR = ['#filter-column-label', '#columns-details', '#columns-summary', '#counter-selected', '#select-all', '#delete-selected'];
// The containers that hold them grow, in height only.
const GROWING = ['html', 'body', '#app-main', '#segment-information', '#list-area', '#list-panel', '#list-scroll', '#export-panel'];
// In these states, what follows the grown content moves down (or, in the
// scrolled export dialog, up), and nothing else about it changes.
const SHIFTING_STATES = ['demo-information', 'export-dialog'];

// A line of the differences: "<state> <selector> <what>: <before> → <after>".
function parse(line: string): { state: string; target: string; all: boolean; what: string; before: string; after: string } | null {
  const m = /^(\S+) (all )?(.+?)(?: (box\.\w+|[a-z-]+))?: (.+) → (.+)$/.exec(line);
  if (!m) return null;
  return { state: m[1], all: m[2] !== undefined, target: m[3], what: m[4] ?? '', before: m[5], after: m[6] };
}

function inside(target: string, ids: string[]): boolean {
  return ids.some((id) => target === id || target.startsWith(`${id}>`) || target.startsWith(`${id} `));
}

function intended(line: string): boolean {
  if (/ all #open-presentation: new$/.test(line)) return true;
  if (/ all #economics-overlay(>\S+)?: new$/.test(line)) return true;
  const newEntry = /^(\S+) all (\S+): new$/.exec(line);
  if (newEntry) return inside(newEntry[2], CHANGED_INSIDE);
  const d = parse(line);
  if (!d) return false;
  // Pass 14's row.
  if (d.all && MOVED_IN_ROW.includes(d.target) && d.before.split('|').slice(1).join('|') === d.after.split('|').slice(1).join('|')) return true;
  if (inside(d.target, CHANGED_INSIDE)) return true;
  if (d.all) {
    const [a, b] = [d.before.split('|'), d.after.split('|')];
    // A vertical shift: only the top changed.
    if (SHIFTING_STATES.includes(d.state) && a[0] === b[0] && a.slice(2).join('|') === b.slice(2).join('|')) return true;
    // A growing container: the same left and width, the rest unchanged; it
    // may also have moved down.
    if (GROWING.includes(d.target) && a[0] === b[0] && a[2] === b[2] && a.slice(4).join('|') === b.slice(4).join('|')) return true;
    // The toolbar's items: moved, the same but for the filter label's width.
    if (d.state === 'demo-information' && MOVED_IN_TOOLBAR.includes(d.target) && a[3] === b[3] && a.slice(4).join('|') === b.slice(4).join('|')) return true;
    return false;
  }
  if (GROWING.includes(d.target) && ['box.height', 'height', 'box.y', 'grid-template-rows'].includes(d.what)) return true;
  if (SHIFTING_STATES.includes(d.state) && d.what === 'box.y') return true;
  return false;
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
    // The intended changes are there: the new action in the states with the
    // start row, the economics overlay in every state.
    expect(found.filter((l) => / all #open-presentation: new$/.test(l)).map((l) => l.split(' ')[0])).toEqual(['start', 'demo-information']);
    expect(found.some((l) => / all #economics-overlay: new$/.test(l))).toBe(true);
    expect(found.filter((l) => !intended(l))).toEqual([]);
  }, 120_000);
});
