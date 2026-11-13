// @vitest-environment node
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { chromium, devices, type Browser, type Page } from 'playwright';
import { pressExport, setSelect } from './chrome';

// The presentation chrome, pinned in a real layout, headless Chromium,
// offline, with the full-test demo exported from the desktop: the bar's
// height and the stage's share of the viewport at desktop, tablet, and
// phone sizes, in both views and both themes, the fitted map's scale at the
// fitted view, and the used-only legend (FR-75) computed once in the viewer.
// Since this pass the viewer has crossed to the five classes (FR-38 as
// amended): the bar is 44 pixels (48 in the compact class; in the short class
// the header is the 56-pixel side rail, so its height is the viewport's),
// and the stage's share holds the promise — 94 to 98 per cent on desktops,
// 91.5 to 94.8 on phones, and a portrait tablet lands better than v1.17.0's
// 89 per cent. Run after the build (npm run build).
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
// at least, whether the fitted scale is pinned (map view; null where the view
// is width-bound on a phone). The bar is 44 px in the wider classes and 48 px
// in the compact class; in the short class the header is the side rail, the
// full viewport high.
const PROFILES: Array<[string, object, [number, number], number, [number, number] | null]> = [
  ['desktop 1500x950', { viewport: { width: 1500, height: 950 } }, [44, 44], 0.94, [0.36, 0.4]],
  ['desktop 1280x800', { viewport: { width: 1280, height: 800 } }, [44, 44], 0.94, [0.29, 0.32]],
  ['tablet portrait 834x1112', { ...devices['iPad (gen 7)'], viewport: { width: 834, height: 1112 } }, [44, 44], 0.94, null],
  ['phone portrait 390x844', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, [48, 48], 0.915, null],
  ['phone landscape 844x390', { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, [390, 390], 0.915, null],
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
          // "In view" floats on the stage below 1,920 pixels (the stage keeps
          // its full width); from 1,920 it docks beside the stage at 264.
          const glance = await box(page, '#presentation-glance');
          expect(await page.$eval('#presentation-glance', (e) => getComputedStyle(e).visibility)).toBe('visible');
          if (v.width >= 1920) {
            expect(glance.width).toBe(264);
          } else {
            expect(glance.width).toBe(232);
            expect(stage.width).toBe(v.width);
          }
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
      // The fitted scale is derived from the stage and the background's own
      // size, so the pin holds whatever the chrome: fitted means the whole
      // background in the stage.
      const fitted = await page.evaluate(() => {
        const stage = (document.querySelector('#presentation-stage') as HTMLElement).getBoundingClientRect();
        const img = document.querySelector('#presentation-image') as HTMLImageElement;
        const m = /matrix\(([^)]+)\)/.exec(getComputedStyle(document.querySelector('#presentation-content')!).transform);
        return { scale: m ? Number(m[1].split(',')[0]) : null, expected: Math.min(stage.width / img.naturalWidth, stage.height / img.naturalHeight) };
      });
      expect(fitted.scale, `${name} fitted scale`).toBeGreaterThanOrEqual(fitted.expected - 0.01);
      expect(fitted.scale, `${name} fitted scale`).toBeLessThanOrEqual(fitted.expected + 0.01);
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

describe("the viewer's presentation scale step above 1,920 pixels (the owner's ruling)", () => {
  test("at an extra-wide size the viewer's type is one token above its wide-size value, and the markers step with it", async () => {
    const wide = await openViewer({ viewport: { width: 1500, height: 950 } });
    const xwide = await openViewer({ viewport: { width: 2560, height: 1440 } });
    const read = (page: Page) =>
      page.evaluate(() => ({
        // The view switch's type, one token up from 13 to 14 pixels.
        button: parseFloat(getComputedStyle(document.getElementById('pres-mode-map')!).fontSize),
        // The marker's size band, drawn from --text-13, steps with it.
        marker: parseFloat(getComputedStyle(document.querySelector('#presentation-marker-layer .marker')!).fontSize),
        bar: (document.getElementById('app-header') as HTMLElement).getBoundingClientRect().height,
      }));
    const atWide = await read(wide.page);
    const atXwide = await read(xwide.page);
    expect(atWide.bar).toBe(44);
    expect(atXwide.bar).toBe(44);
    expect(atWide.button).toBe(13);
    expect(atXwide.button).toBe(14);
    expect(atXwide.marker).toBe(atWide.marker + 1);
    expect(atWide.marker).toBe(13);
    await wide.page.context().close();
    await xwide.page.context().close();
  }, 90_000);
});
