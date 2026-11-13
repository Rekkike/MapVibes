// @vitest-environment node
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { chromium, devices, type Browser, type Page } from 'playwright';
import { pressExport, setSelect } from './chrome';

// The quiet presentation chrome (v1.9.0, FR-37/FR-38 as amended), pinned in
// a real layout, headless Chromium, offline, with the full-test demo exported
// from the desktop: the header's height band and the stage's share of the
// viewport at desktop, tablet, and phone sizes, in both views and both
// themes, the fitted map's scale and the annotation labels' size at the
// fitted view, and the used-only legend (FR-75) computed once in the viewer.
// The bands are measured on the built v1.9.0 pass, so that no future pass
// silently gives the room back. Run after the build (npm run build).
const BUILT = join(process.cwd(), 'dist', 'build', 'index.html');

let browser: Browser;
let exported: string;

beforeAll(async () => {
  if (!existsSync(BUILT)) {
    throw new Error('dist/build/index.html is missing: run the build first');
  }
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
  await context.setOffline(true);
  const page = await context.newPage();
  await page.goto(`file://${BUILT}`);
  await page.evaluate(() => delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker);
  await setSelect(page, 'select-language', 'en');
  await page.click('#load-demo');
  await page.waitForFunction(() => document.querySelectorAll('#marker-layer .marker').length === 11);
  await page.click('#tab-presentation');
  await page.click('#pres-fit');
  await page.waitForTimeout(300);
  await pressExport(page, 'export-open');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-go')]);
  exported = join(mkdtempSync(join(tmpdir(), 'mapvibes-sleek-')), 'presentation.html');
  await download.saveAs(exported);
  await context.close();
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

// name, context options, header band [min, max], stage share of the viewport
// at least, fitted scale band at "Fit view" (map view; null where the view is
// width-bound on a phone).
const PROFILES: Array<[string, object, [number, number], number, [number, number] | null]> = [
  ['desktop 1500x950', { viewport: { width: 1500, height: 950 } }, [30, 34], 0.64, [0.36, 0.4]],
  ['desktop 1280x800', { viewport: { width: 1280, height: 800 } }, [30, 34], 0.58, [0.29, 0.32]],
  ['tablet portrait 834x1112', { ...devices['iPad (gen 7)'], viewport: { width: 834, height: 1112 } }, [27, 31], 0.89, null],
  ['phone portrait 390x844', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, [66, 76], 0.78, null],
  ['phone landscape 844x390', { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, [27, 31], 0.77, null],
];

async function openViewer(options: object): Promise<{ page: Page; errors: string[] }> {
  const context = await browser.newContext({ ...options });
  await context.setOffline(true);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`file://${exported}`);
  await page.waitForFunction(() => document.documentElement.dataset.mode === 'viewer');
  await page.waitForFunction(() => document.querySelectorAll('#presentation-marker-layer .marker').length === 11);
  await page.waitForTimeout(2500); // the fitted-view glide settles
  return { page, errors };
}

async function box(page: Page, selector: string) {
  return (await page.locator(selector).first().boundingBox())!;
}

describe.each(PROFILES)('the quiet chrome on %s (v1.9.0)', (name, options, headerBand, minShare, scaleBand) => {
  test('the header band and the stage share hold, in both views and both themes', async () => {
    for (const theme of ['light', 'dark'] as const) {
      const { page, errors } = await openViewer(options);
      await setSelect(page, 'select-theme', theme);
      for (const view of ['map', 'timeline'] as const) {
        if (view === 'timeline') {
          await page.click('#pres-mode-timeline');
          await page.waitForFunction(() => (document.querySelector('#presentation-stage') as HTMLElement)?.dataset.view === 'timeline');
          await page.waitForTimeout(400);
        }
        const v = page.viewportSize()!;
        const header = await box(page, '#app-header');
        expect(header.height, `${name} ${theme} ${view} header`).toBeGreaterThanOrEqual(headerBand[0]);
        expect(header.height, `${name} ${theme} ${view} header`).toBeLessThanOrEqual(headerBand[1]);
        const stage = await box(page, '#presentation-stage');
        const share = (stage.width * stage.height) / (v.width * v.height);
        expect(share, `${name} ${theme} ${view} stage share`).toBeGreaterThanOrEqual(minShare);
        if (view === 'map' && v.width >= 900) {
          // The "In view" column stays persistent on a wide viewport, narrowed.
          const glance = await box(page, '#presentation-glance');
          expect(await page.$eval('#presentation-glance', (e) => getComputedStyle(e).visibility)).toBe('visible');
          expect(glance.width).toBeLessThanOrEqual(210);
        }
        if (view === 'timeline') {
          await page.click('#pres-mode-map');
          await page.waitForFunction(() => (document.querySelector('#presentation-stage') as HTMLElement)?.dataset.view === 'map');
        }
      }
      expect(errors).toEqual([]);
      await page.context().close();
    }
  }, 90_000);

  test('the fitted view gains scale, and the legend is used-only', async () => {
    const { page, errors } = await openViewer(options);
    // The used-only legend, computed once from the embedded items: the demo's
    // visible items carry all four colours, nine of the thirteen symbols, and
    // all six statuses; each entry keeps its meaning.
    const colours = await page.locator('#presentation-legend .legend-entry[data-colour]').evaluateAll((els) => els.map((e) => e.getAttribute('data-colour')));
    expect(colours).toEqual(['green', 'blue', 'yellow', 'red']);
    const shapes = await page
      .locator('#presentation-legend .legend-entry[data-shape]:not([data-status])')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-shape')));
    expect(shapes).toEqual(['square', 'diamond', 'bulb', 'magnifier', 'pause', 'cross', 'check', 'hammer-shovel', 'bolt']);
    const statuses = await page
      .locator('#presentation-legend .legend-entry[data-status]')
      .evaluateAll((els) => els.map((e) => [e.getAttribute('data-status'), e.getAttribute('data-shape')]));
    expect(statuses).toHaveLength(6);
    for (const [, symbol] of statuses) {
      expect(symbol).not.toBeNull();
    }
    if (scaleBand) {
      await page.click('#pres-fit');
      await page.waitForTimeout(1200);
      const scale = await page.evaluate(() => {
        const m = /matrix\(([^)]+)\)/.exec(getComputedStyle(document.querySelector('#presentation-content')!).transform);
        return m ? Number(m[1].split(',')[0]) : null;
      });
      expect(scale, `${name} fitted scale`).toBeGreaterThanOrEqual(scaleBand[0]);
      expect(scale, `${name} fitted scale`).toBeLessThanOrEqual(scaleBand[1]);
      // The annotation labels scale with the map (FR-47): at the fitted view
      // they read at the printed fraction of the background times the scale.
      const labelPx = await page.evaluate(() => {
        const label = document.querySelector('#presentation-annotation-labels > *');
        if (!label) {
          return null;
        }
        const m = /matrix\(([^)]+)\)/.exec(getComputedStyle(document.querySelector('#presentation-content')!).transform)!;
        return parseFloat(getComputedStyle(label).fontSize) * Number(m[1].split(',')[0]);
      });
      expect(labelPx, `${name} label at fit`).toBeGreaterThanOrEqual(13);
    }
    expect(errors).toEqual([]);
    await page.context().close();
  }, 90_000);
});
