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
const REFERENCE_SHA256 = 'f8d07191c89546c0a0be59ca24a677fca0172261dd81bb1922c3ec5050238236';
const RECORD = JSON.parse(readFileSync(join(process.cwd(), 'example-data', 'desktop-baseline-v1.3.1.json'), 'utf8')) as {
  fingerprint: string;
  snapshot: Snapshot;
};

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

// Pass 16 (FR-66, FR-69, FR-70): the view switch and the order at the head
// of the presentation toolbar, and the Information totals' line. At 1500 ×
// 950 the toolbar's items no longer fit one row: the toolbar grows in height
// only, its existing items move without changing size or style, the stage
// below moves down and is shorter by as much, and the map in it is fitted
// again to the shorter stage (its boxes and its fitting transform change,
// nothing else about it).
const NEW_PASS_16 = ['#pres-mode', '#pres-mode-map', '#pres-mode-timeline', '#pres-order-label', '#pres-order-text', '#pres-order', '#list-totals'];
const PRESENTATION_STATES = ['demo-presentation', 'demo-presentation-card', 'demo-presentation-dark', 'export-dialog', 'viewer', 'viewer-card'];
const MOVED_IN_PRESENTATION_TOOLBAR = [
  '#pres-zoom-out',
  '#pres-zoom-level',
  '#pres-zoom-in',
  '#pres-fit',
  '#pres-reset',
  '#export-separator',
  '#export-open',
  '#pdf-open',
  '#pptx-open',
];
const REFITTED = ['#presentation-content', '#presentation-image', '#presentation-annotations', '#presentation-marker-layer'];

function pass16(d: NonNullable<ReturnType<typeof parse>>): boolean {
  if (!PRESENTATION_STATES.includes(d.state)) {
    return false;
  }
  if (d.all) {
    const [a, b] = [d.before.split('|'), d.after.split('|')];
    const sameStyle = a.slice(4).join('|') === b.slice(4).join('|');
    // The toolbar: taller, nothing else.
    if (d.target === '#presentation-toolbar') {
      return sameStyle && a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
    }
    // Its items: moved, the same size (the separator stretches to the row).
    if (MOVED_IN_PRESENTATION_TOOLBAR.includes(d.target)) {
      return sameStyle && a[2] === b[2] && (a[3] === b[3] || d.target === '#export-separator');
    }
    // The stage: lower and shorter, as wide.
    if (d.target === '#presentation-stage') {
      return sameStyle && a[0] === b[0] && a[2] === b[2];
    }
    // The map fitted again: boxes only; the markers keep their size.
    if (d.target.startsWith('#presentation-marker-layer>')) {
      return sameStyle && a[2] === b[2] && a[3] === b[3];
    }
    if (inside(d.target, REFITTED)) {
      return sameStyle;
    }
    return false;
  }
  if (d.target === '#presentation-toolbar') {
    return ['box.height', 'height'].includes(d.what);
  }
  if (d.target === '#presentation-stage') {
    return ['box.y', 'box.height', 'height'].includes(d.what);
  }
  if (d.target.startsWith('#presentation-marker-layer ')) {
    return ['box.x', 'box.y'].includes(d.what);
  }
  if (inside(d.target, REFITTED)) {
    return ['box.x', 'box.y', 'box.width', 'box.height', 'transform'].includes(d.what);
  }
  return false;
}

// Pass 18 (v1.9.0, the quiet presentation chrome, FR-37/FR-38 as amended):
// in every state that shows the Presentation segment or the exported viewer,
// the chrome quiets down -- the compact header, the ghost toolbar controls
// with the single accent on the active switch, the paddings and radii, the
// compact used-only legend (whose entries are re-rendered, hence new lines
// inside it), the narrowed persistent "In view" column -- and the stage grows
// into the room. Every rendered element outside the stage's subtrees is
// chrome and may change; inside the stage's subtrees (the map content, the
// annotations, the markers, the card, the timeline) only the box may change,
// never a style, and the markers keep their size. Nothing outside these
// states changes.
const STAGE_18_ROOTS = [
  '#presentation-stage',
  '#presentation-content',
  '#presentation-image',
  '#presentation-annotations',
  '#presentation-marker-layer',
  '#presentation-card',
  '#presentation-timeline',
  '#presentation-empty',
];
// The snapshotted selectors that lie in the chrome (non-"all" lines name them
// directly, not as paths).
const CHROME_18_SELECTORS = [
  '#app-header',
  '#app-title',
  '#viewer-badge',
  '#demo-badge',
  '#segment-nav',
  '#work-controls',
  '#app-main',
  '#segment-presentation',
  '#visibility-area',
  '#presentation-area',
  '#presentation-toolbar',
  '#presentation-legend',
  '#presentation-glance',
  '#presentation-glance-list .glance-entry',
  '#export-panel',
];
const STAGE_18_SELECTORS = [
  '#presentation-stage',
  '#presentation-content',
  '#presentation-annotations',
  '#presentation-marker-layer .marker',
  '#presentation-card',
];

function pass18(d: NonNullable<ReturnType<typeof parse>>): boolean {
  if (!PRESENTATION_STATES.includes(d.state)) {
    return false;
  }
  if (d.all) {
    if (d.target === 'html' || d.target === 'body') {
      const [a, b] = [d.before.split('|'), d.after.split('|')];
      return a[2] === b[2] && a.slice(4).join('|') === b.slice(4).join('|');
    }
    // "all" lines carry a path rooted at the nearest id'd ancestor.
    const root = d.target.split('>')[0];
    if (STAGE_18_ROOTS.includes(root)) {
      const [a, b] = [d.before.split('|'), d.after.split('|')];
      // Display, visibility, and colours keep; the inherited font size may
      // quiet with the segment (the markers set their own and keep it).
      const sameStyle = a[4] === b[4] && a[5] === b[5] && a[7] === b[7] && a[8] === b[8];
      // The markers keep their size and their type; the rest of the stage's
      // content only moves and grows with the stage.
      // The markers themselves (below the layer) keep their size and type.
      if (root === '#presentation-marker-layer' && d.target.includes('>')) {
        return sameStyle && a[2] === b[2] && a[3] === b[3] && a[6] === b[6];
      }
      return sameStyle;
    }
    // Any other rendered element in a presentation state is chrome.
    return true;
  }
  if (CHROME_18_SELECTORS.includes(d.target)) {
    return true;
  }
  if (d.target === 'html' || d.target === 'body') {
    return ['box.height', 'height'].includes(d.what);
  }
  if (STAGE_18_SELECTORS.includes(d.target)) {
    if (d.target === '#presentation-marker-layer .marker') {
      return ['box.x', 'box.y'].includes(d.what);
    }
    return ['box.x', 'box.y', 'box.width', 'box.height', 'width', 'height', 'transform', 'font-size'].includes(d.what);
  }
  return false;
}

// A line of the differences: "<state> <selector> <what>: <before> → <after>".
function parse(line: string): { state: string; target: string; all: boolean; what: string; before: string; after: string } | null {
  const m = /^(\S+) (all )?(.+?)(?: (box\.\w+|[a-z-]+))?: (.+) → (.+)$/.exec(line);
  if (!m) {
    return null;
  }
  return { state: m[1], all: m[2] !== undefined, target: m[3], what: m[4] ?? '', before: m[5], after: m[6] };
}

function inside(target: string, ids: string[]): boolean {
  return ids.some((id) => target === id || target.startsWith(`${id}>`) || target.startsWith(`${id} `));
}

// Pass 20 (v1.11.0, FR-79 and FR-80): the Costs button joins the view switch
// in every state that shows the presentation toolbar (the chrome, admitted
// since Pass 18); in the demo's Information segment, the events panel takes
// a row of its own under the vocabulary panels, so that their container
// grows by that row and nothing else in it changes.
const NEW_PASS_20 = [
  '#event-panel',
  '#event-panel-summary',
  '#event-panel-hint',
  '#event-list',
  '#event-date-new',
  '#event-label-new',
  '#event-add',
  '#event-status',
];

function pass20(d: NonNullable<ReturnType<typeof parse>>): boolean {
  if (d.state !== 'demo-information' || d.target !== '#vocab-panels') {
    return false;
  }
  if (!d.all) {
    return ['box.height', 'height'].includes(d.what);
  }
  const [a, b] = [d.before.split('|'), d.after.split('|')];
  return a[0] === b[0] && a[2] === b[2] && a.slice(4).join('|') === b.slice(4).join('|') && Number(b[3]) > Number(a[3]);
}

// Pass 25 (v1.15.0, FR-47 as amended): the Straight toggle joins the
// annotation toolbar beside the tool buttons, so in the map states the
// toolbar's style controls move sideways by its width and nothing else
// about them changes.
const STRAIGHT_STATES = ['demo-map', 'demo-map-details'];
const MOVED_BY_STRAIGHT = [
  '#annotation-toolbar>label:0',
  '#annotation-colour-text',
  '#annotation-colour',
  '#annotation-toolbar>label:1',
  '#annotation-fill-text',
  '#annotation-fill',
  '#annotation-fill-value',
];

function pass25(d: NonNullable<ReturnType<typeof parse>>): boolean {
  if (!STRAIGHT_STATES.includes(d.state) || !d.all) {
    return false;
  }
  if (!MOVED_BY_STRAIGHT.includes(d.target)) {
    return false;
  }
  const [a, b] = [d.before.split('|'), d.after.split('|')];
  // A pure translation (sideways, and down where the environment's font
  // wraps the toolbar): the size and the style unchanged.
  return a[2] === b[2] && a[3] === b[3] && a.slice(4).join('|') === b.slice(4).join('|');
}

function intended(line: string): boolean {
  if (/ all #open-presentation: new$/.test(line)) {
    return true;
  }
  if (/ all #economics-overlay(>\S+)?: new$/.test(line)) {
    return true;
  }
  const newEntry = /^(\S+) all (\S+): new$/.exec(line);
  if (newEntry) {
    if (inside(newEntry[2], CHANGED_INSIDE) || inside(newEntry[2], NEW_PASS_16)) {
      return true;
    }
    // The used-only legend (FR-75) re-renders its entries in the presentation
    // states.
    if (PRESENTATION_STATES.includes(newEntry[1]) && inside(newEntry[2], ['#presentation-legend'])) {
      return true;
    }
    if (PRESENTATION_STATES.includes(newEntry[1]) && newEntry[2] === '#pres-mode-costs') {
      return true;
    }
    if (newEntry[1] === 'demo-information' && inside(newEntry[2], NEW_PASS_20)) {
      return true;
    }
    if (STRAIGHT_STATES.includes(newEntry[1]) && newEntry[2] === '#annotation-straight') {
      return true;
    }
    return false;
  }
  const d = parse(line);
  if (!d) {
    return false;
  }
  if (pass16(d)) {
    return true;
  }
  if (pass18(d)) {
    return true;
  }
  if (pass20(d)) {
    return true;
  }
  if (pass25(d)) {
    return true;
  }
  // Pass 14's row.
  if (d.all && MOVED_IN_ROW.includes(d.target) && d.before.split('|').slice(1).join('|') === d.after.split('|').slice(1).join('|')) {
    return true;
  }
  if (inside(d.target, CHANGED_INSIDE)) {
    return true;
  }
  if (d.all) {
    const [a, b] = [d.before.split('|'), d.after.split('|')];
    // A vertical shift: only the top changed.
    if (SHIFTING_STATES.includes(d.state) && a[0] === b[0] && a.slice(2).join('|') === b.slice(2).join('|')) {
      return true;
    }
    // A growing container: the same left and width, the rest unchanged; it
    // may also have moved down.
    if (GROWING.includes(d.target) && a[0] === b[0] && a[2] === b[2] && a.slice(4).join('|') === b.slice(4).join('|')) {
      return true;
    }
    // The toolbar's items: moved, the same but for the filter label's width.
    if (d.state === 'demo-information' && MOVED_IN_TOOLBAR.includes(d.target) && a[3] === b[3] && a.slice(4).join('|') === b.slice(4).join('|')) {
      return true;
    }
    return false;
  }
  if (GROWING.includes(d.target) && ['box.height', 'height', 'box.y', 'grid-template-rows'].includes(d.what)) {
    return true;
  }
  if (SHIFTING_STATES.includes(d.state) && d.what === 'box.y') {
    return true;
  }
  return false;
}

let browser: Browser;

beforeAll(async () => {
  if (!existsSync(BUILT)) {
    throw new Error('dist/build/index.html is missing: run the build first');
  }
  if (!existsSync(REFERENCE)) {
    throw new Error('dist/reference/v1.3.1/index.html is missing: build the v1.3.1 tag into it');
  }
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
    if (reference.fingerprint === RECORD.fingerprint) {
      expect(differences(RECORD.snapshot, reference.snapshot)).toEqual([]);
    } else {
      console.log(`recorded in ${RECORD.fingerprint}; this environment is ${reference.fingerprint}: compared with the reference build only`);
    }
  }, 120_000);

  test('the current build at 1500 × 950 equals the reference in every state', async () => {
    const current = await snapshotBuild(browser, BUILT);
    expect(current.fingerprint).toBe(reference.fingerprint);
    const found = differences(reference.snapshot, current.snapshot);
    // The intended changes are there: the new action in the states with the
    // start row, the economics overlay in every state.
    expect(found.filter((l) => / all #open-presentation: new$/.test(l)).map((l) => l.split(' ')[0])).toEqual(['start', 'demo-information']);
    expect(found.some((l) => / all #economics-overlay: new$/.test(l))).toBe(true);
    // Pass 16: the switch and the order in every state that shows the
    // presentation toolbar, the totals' line in the demo's Information.
    expect(found.filter((l) => / all #pres-mode: new$/.test(l)).map((l) => l.split(' ')[0])).toEqual(PRESENTATION_STATES);
    expect(found.filter((l) => / all #pres-order-label: new$/.test(l)).map((l) => l.split(' ')[0])).toEqual(PRESENTATION_STATES);
    expect(found.filter((l) => / all #list-totals: new$/.test(l)).map((l) => l.split(' ')[0])).toEqual(['demo-information']);
    // Pass 20: the Costs button in every presentation state, the events panel
    // in the demo's Information.
    expect(found.filter((l) => / all #pres-mode-costs: new$/.test(l)).map((l) => l.split(' ')[0])).toEqual(PRESENTATION_STATES);
    expect(found.filter((l) => / all #event-panel: new$/.test(l)).map((l) => l.split(' ')[0])).toEqual(['demo-information']);
    // Pass 25: the Straight toggle in the map states, and the style controls
    // moved by it (a whole set per state; which states show the set depends
    // on the environment's font metrics).
    const straightLines = found.filter((l) => STRAIGHT_STATES.includes(l.split(' ')[0]));
    console.log(straightLines.join('\n'));
    expect(straightLines.filter((l) => / all #annotation-straight: new$/.test(l)).map((l) => l.split(' ')[0])).toEqual(STRAIGHT_STATES);
    expect(straightLines.filter((l) => MOVED_BY_STRAIGHT.includes(parse(l)?.target ?? '')).length).toBeGreaterThan(0);
    expect(found.filter((l) => !intended(l))).toEqual([]);
  }, 120_000);
});
