// @vitest-environment node
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

// The label rule on both stages and in the exported viewer (FR-47 and FR-57
// as amended in v1.4.0, superseding the v1.3.1 constant-size ruling for
// labels): markers are pins through the map and keep their size on screen;
// annotation labels are lettering drawn on the map, printed at a fraction of
// the background (its longer side divided by 64), and scale with the zoom
// together with their shapes. Measured in a real layout, headless Chromium,
// offline, with the full-test demo, across zoom by the buttons, the wheel,
// and a two-finger pinch. Run after the build (npm run build).
const BUILT = join(process.cwd(), 'dist', 'build', 'index.html');
// The printed size of a label, as a fraction of the background's longer side.
const FRACTION = 1 / 64;

let browser: Browser;
let context: BrowserContext;

beforeAll(async () => {
  if (!existsSync(BUILT)) throw new Error('dist/build/index.html is missing: run the build first');
  browser = await chromium.launch();
  context = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true, hasTouch: true });
  await context.setOffline(true);
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

type Stage = { stage: string; labels: string; shapes: string; markers: string; zoomIn: string; fit: string };
const MAP: Stage = { stage: '#map-stage', labels: '#map-annotation-labels', shapes: '#map-annotations', markers: '#marker-layer', zoomIn: '#map-zoom-in', fit: '#map-fit' };
const PRESENTATION: Stage = {
  stage: '#presentation-stage',
  labels: '#presentation-annotation-labels',
  shapes: '#presentation-annotations',
  markers: '#presentation-marker-layer',
  zoomIn: '#pres-zoom-in',
  fit: '#pres-fit',
};

async function demo(): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`file://${BUILT}`);
  await page.evaluate(() => delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker);
  await page.selectOption('#select-language', 'en');
  await page.click('#load-demo');
  await page.waitForFunction(() => document.querySelectorAll('#marker-layer .marker').length === 11);
  return page;
}

// The size on screen of every label, the first marker, and the free
// rectangle, and the scale of the map.
async function measure(page: Page, s: Stage) {
  return page.evaluate((s) => {
    const size = (el: Element | null) => {
      const r = el!.getBoundingClientRect();
      return { width: r.width, height: r.height };
    };
    const content = document.querySelector(s.stage)!.firstElementChild as HTMLElement;
    const image = content.querySelector('img')!;
    return {
      scale: Number(/scale\(([\d.]+)\)/.exec(content.style.transform)![1]),
      sheet: Math.max(image.naturalWidth, image.naturalHeight),
      lineHeight: parseFloat(getComputedStyle(document.querySelector(`${s.labels} .annotation-label`)!).lineHeight),
      labels: [...document.querySelectorAll(`${s.labels} .annotation-label`)].map((l) => ({ text: l.textContent, ...size(l), font: getComputedStyle(l).fontSize })),
      marker: size(document.querySelector(`${s.markers} .marker`)),
      shape: size(document.querySelector(`${s.shapes} g.annotation-rectangle rect`)),
    };
  }, s);
}

type Measured = Awaited<ReturnType<typeof measure>>;

// The labels are printed at the fraction of the sheet, and drawn at that
// size times the map's scale: their height on screen is the line height of
// the printed size, scaled.
function expectPrinted(m: Measured, where: string): void {
  for (const l of m.labels) {
    expect(parseFloat(l.font), `${where}: ${l.text}`).toBeCloseTo(m.sheet * FRACTION, 3);
    expect(l.height / m.scale, `${where}: ${l.text}`).toBeCloseTo(m.lineHeight, 0);
  }
}

// From one view to another, the labels scale by the ratio of the scales,
// while the markers keep their size.
function expectProportional(a: Measured, b: Measured, where: string): void {
  expect(b.labels.map((l) => l.text), where).toEqual(a.labels.map((l) => l.text));
  const ratio = b.scale / a.scale;
  b.labels.forEach((l, i) => {
    expect(l.height / a.labels[i].height, `${where}: ${l.text}`).toBeCloseTo(ratio, 1);
    expect(l.width / a.labels[i].width, `${where}: ${l.text}`).toBeCloseTo(ratio, 1);
  });
  expect(b.marker.height, where).toBeCloseTo(a.marker.height, 0);
  expect(b.marker.width, where).toBeCloseTo(a.marker.width, 0);
}

// Zooms in three ways in turn, each time checking that the map scaled, and
// its shapes and labels with it, while the markers kept their size.
async function expectScalingAcrossZoom(page: Page, s: Stage, where: string): Promise<void> {
  await page.click(s.fit);
  await page.waitForTimeout(400);
  const fitted = await measure(page, s);
  expect(fitted.labels.length, where).toBe(3);
  expectPrinted(fitted, `${where}, fitted`);
  // The type size on screen at the fitted view, for the record.
  console.log(`${where}: fitted scale ${fitted.scale.toFixed(3)}, type ${(parseFloat(fitted.labels[0].font) * fitted.scale).toFixed(1)} px`);
  let previous = fitted;
  const steps: Array<[string, () => Promise<void>]> = [
    [
      'buttons',
      async () => {
        await page.click(s.zoomIn);
        await page.click(s.zoomIn);
      },
    ],
    [
      'wheel',
      async () => {
        const box = (await page.locator(s.stage).boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -200);
      },
    ],
    [
      'pinch',
      async () => {
        const box = (await page.locator(s.stage).boundingBox())!;
        const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2];
        const cdp = await context.newCDPSession(page);
        const fingers = (d: number) => [
          { x: cx - d, y: cy, id: 0 },
          { x: cx + d, y: cy, id: 1 },
        ];
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(40) });
        for (let d = 50; d <= 120; d += 10) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers(d) });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await cdp.detach();
      },
    ],
  ];
  for (const [how, zoom] of steps) {
    await zoom();
    await page.waitForTimeout(500);
    const zoomed = await measure(page, s);
    expect(zoomed.scale, `${where}, ${how}`).toBeGreaterThan(previous.scale * 1.1);
    // The shapes are geographic: they grow with the map.
    expect(zoomed.shape.width / fitted.shape.width, `${where}, ${how}`).toBeCloseTo(zoomed.scale / fitted.scale, 1);
    // The labels are lettering on the map: they scale with it.
    expectPrinted(zoomed, `${where}, ${how}`);
    expectProportional(fitted, zoomed, `${where}, ${how}`);
    previous = zoomed;
  }
}

describe('labels scale with the map, printed relative to the sheet; markers keep their size (FR-47, FR-57)', () => {
  test('on the Map stage', async () => {
    const page = await demo();
    await page.click('#tab-map');
    await expectScalingAcrossZoom(page, MAP, 'Map stage');
    await page.close();
  }, 60_000);

  test('on the Presentation stage, at the same printed size as on the Map stage', async () => {
    const page = await demo();
    await page.click('#tab-map');
    await page.click(MAP.fit);
    await page.waitForTimeout(400);
    const map = await measure(page, MAP);
    await page.click('#tab-presentation');
    await expectScalingAcrossZoom(page, PRESENTATION, 'Presentation stage');
    await page.click(PRESENTATION.fit);
    await page.waitForTimeout(400);
    // The same printed size relative to the sheet; on screen, in proportion
    // to each stage's scale.
    expectProportional(map, await measure(page, PRESENTATION), 'Map and Presentation stages');
    await page.close();
  }, 60_000);

  test('in the exported viewer, at the same printed size as in the application', async () => {
    const page = await demo();
    await page.click('#tab-presentation');
    await page.click(PRESENTATION.fit);
    await page.waitForTimeout(400);
    const app = await measure(page, PRESENTATION);
    await page.click('#export-open');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-go')]);
    const file = join(mkdtempSync(join(tmpdir(), 'mapvibes-labels-')), 'presentation.html');
    await download.saveAs(file);
    const viewer = await context.newPage();
    await viewer.goto(`file://${file}`);
    await viewer.waitForFunction(() => document.documentElement.dataset.mode === 'viewer');
    await viewer.waitForTimeout(800);
    await expectScalingAcrossZoom(viewer, PRESENTATION, 'exported viewer');
    await viewer.click(PRESENTATION.fit);
    await viewer.waitForTimeout(400);
    expectProportional(app, await measure(viewer, PRESENTATION), 'application and viewer');
    await viewer.close();
    await page.close();
  }, 60_000);
});
