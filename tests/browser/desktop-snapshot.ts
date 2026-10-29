// The desktop layout snapshot (Pass 13, unit 4): the computed styles and
// the bounding boxes of the main elements at 1500 × 950, in the
// application's segments and in the exported viewer, with the full-test
// demo. It proves that the narrow viewer layout leaves the desktop
// unchanged: the snapshot of the current build is compared with that of the
// v1.3.1 build, made in the same browser and with the same fonts.
//
// Excluded on purpose: the annotation label layers and their labels, which
// unit 1 moves into the scaled map (a deliberate desktop change), and the
// version and export-date texts, which differ between the builds and are
// set to a fixed text in both before measuring.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser, Page } from 'playwright';

export const SELECTORS = [
  'html',
  'body',
  '#app-header',
  '#app-title',
  '#viewer-badge',
  '#demo-badge',
  '#segment-nav',
  '#work-controls',
  '#app-main',
  '#segment-information',
  '#list-area',
  '#ingest-panel',
  '#list-panel',
  '#vocab-panels',
  '#list-toolbar',
  '#list-scroll',
  '#row-table',
  '#row-table-head th:first-child',
  '#row-table-body tr:first-child',
  '#segment-map',
  '#placement-area',
  '#placement-list',
  '#map-area',
  '#map-toolbar',
  '#annotation-toolbar',
  '#map-stage',
  '#map-content',
  '#map-annotations',
  '#marker-layer',
  '#marker-layer .marker',
  '#map-legend',
  '#map-glance',
  '#map-glance-list .glance-entry',
  '#segment-presentation',
  '#visibility-area',
  '#presentation-area',
  '#presentation-toolbar',
  '#export-panel',
  '#presentation-stage',
  '#presentation-content',
  '#presentation-annotations',
  '#presentation-marker-layer .marker',
  '#presentation-card',
  '#presentation-legend',
  '#presentation-glance',
  '#presentation-glance-list .glance-entry',
  '#details-panel',
];

export const PROPERTIES = [
  'display',
  'position',
  'visibility',
  'box-sizing',
  'width',
  'height',
  'grid-template-columns',
  'grid-template-rows',
  'flex-direction',
  'flex-wrap',
  'column-gap',
  'row-gap',
  'align-items',
  'justify-content',
  'overflow-x',
  'overflow-y',
  'overscroll-behavior-y',
  'font-size',
  'font-weight',
  'line-height',
  'color',
  'background-color',
  'border-top-width',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'z-index',
  'opacity',
  'transform',
  'transition-property',
];

export interface ElementSnapshot {
  box: { x: number; y: number; width: number; height: number };
  style: Record<string, string>;
}

// Every rendered element of the page besides, by a stable path (from the
// nearest ancestor with an id), with its box, display, visibility, font size,
// and colours, so that no change of the desktop layout goes unseen.
export type StateSnapshot = Record<string, ElementSnapshot | null | string>;
export type Snapshot = Record<string, StateSnapshot>;

async function take(page: Page): Promise<StateSnapshot> {
  return page.evaluate(
    ({ selectors, properties }) => {
      const out: Record<string, unknown> = {};
      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (!el) {
          out[selector] = null;
          continue;
        }
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const round = (v: number) => Math.round(v * 2) / 2;
        out[selector] = {
          box: { x: round(r.x), y: round(r.y), width: round(r.width), height: round(r.height) },
          style: Object.fromEntries(properties.map((p) => [p, cs.getPropertyValue(p)])),
        };
      }
      const excluded = ['map-annotation-labels', 'presentation-annotation-labels'];
      const path = (el: Element): string => {
        const parts: string[] = [];
        for (let e: Element | null = el; e && e !== document.body; e = e.parentElement) {
          if (e.id) {
            parts.unshift(`#${e.id}`);
            break;
          }
          const parent = e.parentElement;
          const index = parent ? [...parent.children].filter((c) => c.tagName === e!.tagName).indexOf(e) : 0;
          parts.unshift(`${e.tagName.toLowerCase()}:${index}`);
        }
        return parts.join('>');
      };
      for (const el of document.body.querySelectorAll('*')) {
        if (el.closest(excluded.map((id) => `#${id}`).join(','))) continue;
        if (el.closest('script, style')) continue;
        // Only what is rendered: an element with a layout box.
        if (el.getClientRects().length === 0) continue;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const round = (v: number) => Math.round(v * 2) / 2;
        out[`all ${path(el)}`] = [round(r.x), round(r.y), round(r.width), round(r.height), cs.display, cs.visibility, cs.fontSize, cs.color, cs.backgroundColor].join('|');
      }
      return out;
    },
    { selectors: SELECTORS, properties: PROPERTIES },
  ) as Promise<StateSnapshot>;
}

// The texts that differ between the builds compared, set alike in both.
async function normalise(page: Page): Promise<void> {
  await page.evaluate(() => {
    const version = document.getElementById('app-version');
    if (version) version.textContent = 'v0.0.0';
    const badge = document.getElementById('viewer-badge');
    if (badge && badge.textContent) badge.textContent = 'View-only presentation, exported 2000-01-01 00:00';
  });
}

async function settle(page: Page, ms = 500): Promise<void> {
  await page.waitForTimeout(ms);
}

// A fingerprint of the rendering environment: the browser version and the
// width of a text in the interface font, so that a recorded snapshot is only
// compared where it was recorded.
export async function fingerprint(page: Page): Promise<string> {
  const width = await page.evaluate(() => {
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.font = "100px system-ui, -apple-system, 'Segoe UI', sans-serif";
    return Math.round(ctx.measureText('MapVibes 0123456789 Ågård').width * 100) / 100;
  });
  return `${page.context().browser()!.version()} / ${width}`;
}

// Every state of the snapshot, in a fresh browser context (no stored
// preferences or presets) at 1500 × 950, offline, for the given build.
export async function snapshotBuild(browser: Browser, indexHtml: string): Promise<{ snapshot: Snapshot; fingerprint: string }> {
  const context = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
  await context.setOffline(true);
  const snapshot: Snapshot = {};
  const page = await context.newPage();
  await page.goto(`file://${indexHtml}`);
  await page.evaluate(() => delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker);
  await page.selectOption('#select-language', 'en');
  await page.selectOption('#select-theme', 'light');
  const record = async (name: string) => {
    await normalise(page);
    await settle(page, 150);
    snapshot[name] = await take(page);
  };
  await record('start');
  await page.click('#load-demo');
  await page.waitForFunction(() => document.querySelectorAll('#marker-layer .marker').length === 11);
  await page.click('#tab-information');
  await record('demo-information');
  await page.click('#tab-map');
  await page.click('#map-fit');
  await settle(page);
  await record('demo-map');
  await page.locator('#marker-layer .marker').nth(4).click();
  await page.waitForFunction(() => document.documentElement.dataset.details === 'open');
  await settle(page);
  await record('demo-map-details');
  await page.locator('#details-panel .details-close').click();
  await settle(page);
  await page.click('#tab-presentation');
  await page.click('#pres-fit');
  await settle(page);
  await record('demo-presentation');
  await page.locator('#presentation-marker-layer .marker').nth(4).click();
  await page.waitForFunction(() => document.getElementById('presentation-card')!.dataset.state === 'open');
  await settle(page);
  await record('demo-presentation-card');
  await page.keyboard.press('Escape');
  await settle(page);
  await page.selectOption('#select-theme', 'dark');
  await record('demo-presentation-dark');
  await page.selectOption('#select-theme', 'light');
  await page.click('#export-open');
  await settle(page);
  await record('export-dialog');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-go')]);
  const file = join(mkdtempSync(join(tmpdir(), 'mapvibes-snapshot-')), 'presentation.html');
  await download.saveAs(file);
  const print = await fingerprint(page);
  await page.close();
  const viewer = await context.newPage();
  await viewer.goto(`file://${file}`);
  await viewer.waitForFunction(() => document.documentElement.dataset.mode === 'viewer');
  await settle(viewer, 800);
  const recordViewer = async (name: string) => {
    await normalise(viewer);
    await settle(viewer, 150);
    snapshot[name] = await take(viewer);
  };
  await recordViewer('viewer');
  await viewer.locator('#presentation-marker-layer .marker').nth(4).click();
  await viewer.waitForFunction(() => document.getElementById('presentation-card')!.dataset.state === 'open');
  await settle(viewer);
  await recordViewer('viewer-card');
  await context.close();
  return { snapshot, fingerprint: print };
}

// The differences between two snapshots, as readable lines.
export function differences(expected: Snapshot, actual: Snapshot): string[] {
  const out: string[] = [];
  for (const state of Object.keys(expected)) {
    // An element rendered now that was not before is a difference too.
    for (const selector of Object.keys(actual[state] ?? {})) if (!(selector in expected[state])) out.push(`${state} ${selector}: new`);
    for (const selector of Object.keys(expected[state])) {
      const a = expected[state][selector];
      const b = actual[state]?.[selector];
      if (typeof a === 'string' || typeof b === 'string') {
        if (a !== b) out.push(`${state} ${selector}: ${a} → ${b ?? 'absent'}`);
        continue;
      }
      if (a === null || b === null || b === undefined) {
        if ((a === null) !== (b === null || b === undefined)) out.push(`${state} ${selector}: present ${a !== null} → ${b !== null && b !== undefined}`);
        continue;
      }
      for (const k of ['x', 'y', 'width', 'height'] as const) if (Math.abs(a.box[k] - b.box[k]) > 0.5) out.push(`${state} ${selector} box.${k}: ${a.box[k]} → ${b.box[k]}`);
      for (const p of Object.keys(a.style)) if (a.style[p] !== b.style[p]) out.push(`${state} ${selector} ${p}: ${a.style[p]} → ${b.style[p]}`);
    }
  }
  return out;
}
