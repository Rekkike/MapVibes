// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

// The polish pass (v1.3.0) in a real layout, headless Chromium, offline, with
// the full-test demo: the export absence of what is not chosen (FR-53), the
// straight-line constraint with the modifier keys held (FR-47), the markers'
// constant size across zoom while shapes and their labels scale (FR-47 and
// FR-57 as amended in v1.4.0),
// the details-panel refit (FR-16), and the viewer's restored view (FR-38).
// Run after the build (npm run build).
const BUILT = join(process.cwd(), 'dist', 'build', 'index.html');

let browser: Browser;
let context: BrowserContext;
const requests: string[] = [];

beforeAll(async () => {
  if (!existsSync(BUILT)) throw new Error('dist/build/index.html is missing: run the build first');
  browser = await chromium.launch();
  context = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
  await context.setOffline(true);
  await context.route('**/*', (route) => {
    const url = route.request().url();
    requests.push(url);
    if (url.startsWith('file://') || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    return route.abort();
  });
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

async function demo(): Promise<{ page: Page; errors: string[] }> {
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`file://${BUILT}`);
  await page.evaluate(() => delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker);
  await page.selectOption('#select-language', 'en');
  await page.click('#load-demo');
  await page.waitForFunction(() => document.querySelectorAll('#marker-layer .marker').length === 11);
  await page.click('#map-fit');
  await page.waitForTimeout(400);
  return { page, errors };
}

async function box(page: Page, selector: string) {
  return (await page.locator(selector).first().boundingBox())!;
}

describe('the polish pass in a browser (v1.3.0)', () => {
  test('what is not chosen in the export dialog is absent from the downloaded file (FR-53)', async () => {
    const { page, errors } = await demo();
    // Values of the user's own (the application bundles the demo's fictional
    // data, so the demo's own texts are checked in the data only).
    await page.click('#tab-information');
    await page.locator('#row-table-body tr').nth(7).locator('.row-details').click();
    await page.fill('#details-panel .details-comment-input', 'A remark only on the boathouse.');
    await page.click('#details-panel .details-comment-add');
    await page.click('#details-panel .details-close');
    await page.click('#tab-presentation');
    await page.click('#export-open');
    // Leave out the Lakeside area (the lake jetty with its footprint, the
    // boathouse with its comments) and the Note column.
    await page.locator('.export-area-toggle[data-area="Lakeside"]').uncheck();
    await page.locator('.export-column-toggle[data-header="Note"]').uncheck();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#export-go')]);
    const html = readFileSync(await dl.path(), 'utf8');
    const island = /<script type="application\/json" id="mapvibes-export-data">([\s\S]*?)<\/script>/.exec(html)![1];
    for (const text of ['D-07', 'D-08', 'Lake jetty', 'Boathouse', 'Jetty footprint', 'Lakeside', 'On the lake shore.', 'Not carried out.', 'A remark only on the boathouse.', '"Note"']) {
      expect(island, text).not.toContain(text);
    }
    // The user's own remark is nowhere in the file.
    expect(html).not.toContain('A remark only on the boathouse.');
    expect(island).toContain('D-01');
    expect(island).toContain('Survey zone');
    expect(errors).toEqual([]);
    await page.close();
  }, 60_000);

  test('holding Shift keeps a drawn line horizontal; holding Ctrl keeps a dragged shape on its axis (FR-47)', async () => {
    const { page, errors } = await demo();
    const stage = await box(page, '#map-stage');
    const X = (f: number) => stage.x + stage.width * f;
    const Y = (f: number) => stage.y + stage.height * f;
    await page.click('#annotation-tools [data-tool="line"]');
    await page.mouse.click(X(0.2), Y(0.85));
    await page.keyboard.down('Shift');
    await page.mouse.move(X(0.5), Y(0.88), { steps: 6 });
    await page.mouse.click(X(0.5), Y(0.88));
    await page.keyboard.up('Shift');
    await page.keyboard.press('Enter');
    const points = (await page.getAttribute('#map-annotations g.annotation-line:last-of-type polyline.annotation-stroke', 'points'))!
      .trim()
      .split(' ')
      .map((p) => p.split(',').map(Number));
    expect(points).toHaveLength(2);
    expect(points[1][1]).toBeCloseTo(points[0][1], 6);
    // The free rectangle (Survey zone), dragged with Ctrl held, moves along
    // the horizontal only.
    await page.click('#annotation-tools [data-tool="select"]');
    const rect = await box(page, '#map-annotations g.annotation-rectangle rect');
    const before = { x: Number(await page.getAttribute('#map-annotations g.annotation-rectangle rect', 'x')), y: Number(await page.getAttribute('#map-annotations g.annotation-rectangle rect', 'y')) };
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.keyboard.down('Control');
    await page.mouse.move(rect.x + rect.width / 2 + 80, rect.y + rect.height / 2 + 9, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.up('Control');
    const after = { x: Number(await page.getAttribute('#map-annotations g.annotation-rectangle rect', 'x')), y: Number(await page.getAttribute('#map-annotations g.annotation-rectangle rect', 'y')) };
    expect(after.x).toBeGreaterThan(before.x + 50);
    expect(after.y).toBeCloseTo(before.y, 6);
    expect(errors).toEqual([]);
    await page.close();
  }, 60_000);

  test('across zoom, markers keep their size on screen while shapes and labels scale (FR-47, FR-57)', async () => {
    const { page } = await demo();
    const measure = async () => ({
      label: await box(page, '#map-annotation-labels .annotation-label'),
      marker: await box(page, '#marker-layer .marker'),
      shape: await box(page, '#map-annotations g.annotation-rectangle rect'),
    });
    const fitted = await measure();
    await page.click('#map-zoom-in');
    await page.click('#map-zoom-in');
    await page.waitForTimeout(500);
    const zoomed = await measure();
    // The label is lettering on the map: it grows with the shape.
    expect(zoomed.label.width / fitted.label.width).toBeCloseTo(zoomed.shape.width / fitted.shape.width, 1);
    expect(zoomed.marker.height).toBeCloseTo(fitted.marker.height, 0);
    expect(zoomed.marker.width).toBeCloseTo(fitted.marker.width, 0);
    // The shape grows with the map.
    expect(zoomed.shape.width / fitted.shape.width).toBeGreaterThan(1.3);
    expect(fitted.marker.height).toBeGreaterThanOrEqual(24);
    await page.close();
  }, 60_000);

  test('opening the details panel refits the map: every marker stays on the stage (FR-16)', async () => {
    const { page } = await demo();
    await page.locator('#marker-layer .marker').first().click();
    await page.waitForFunction(() => document.documentElement.dataset.details === 'open');
    await page.waitForTimeout(500);
    const stage = await box(page, '#map-stage');
    const panel = await box(page, '#details-panel');
    for (const m of await page.locator('#marker-layer .marker').all()) {
      const b = (await m.boundingBox())!;
      const cx = b.x + b.width / 2;
      expect(cx).toBeGreaterThanOrEqual(stage.x - 1);
      expect(cx).toBeLessThanOrEqual(stage.x + stage.width + 1);
      // Not under the panel.
      expect(cx).toBeLessThan(panel.x);
    }
    await page.close();
  }, 60_000);

  test('the exported viewer opens at the exported view (FR-38)', async () => {
    const { page } = await demo();
    await page.click('#tab-presentation');
    await page.click('#pres-fit');
    await page.click('#pres-zoom-in');
    await page.click('#pres-zoom-in');
    await page.waitForTimeout(500);
    const zoom = await page.textContent('#pres-zoom-level');
    // The map point at the centre of the stage.
    const centre = (p: Page) =>
      p.evaluate(() => {
        const stage = document.getElementById('presentation-stage')!;
        const m = /translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([\d.]+)\)/.exec(document.getElementById('presentation-content')!.style.transform)!;
        const [x, y, scale] = [Number(m[1]), Number(m[2]), Number(m[3])];
        return { x: (stage.clientWidth / 2 - x) / scale, y: (stage.clientHeight / 2 - y) / scale };
      });
    const before = await centre(page);
    await page.click('#export-open');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#export-go')]);
    const file = join(mkdtempSync(join(tmpdir(), 'mapvibes-polish-')), 'presentation.html');
    await dl.saveAs(file);
    const viewer = await context.newPage();
    await viewer.goto(`file://${file}`);
    await viewer.waitForFunction(() => document.documentElement.dataset.mode === 'viewer');
    await viewer.waitForTimeout(800);
    expect(await viewer.textContent('#pres-zoom-level')).toBe(zoom);
    // The same map point at the centre of the viewer's stage, which may be of
    // another size than the exporting one.
    const after = await centre(viewer);
    expect(after.x).toBeCloseTo(before.x, 0);
    expect(after.y).toBeCloseTo(before.y, 0);
    await viewer.close();
    await page.close();
  }, 60_000);

  test('no request is made beyond the local files', () => {
    expect(requests.filter((u) => !u.startsWith('file://') && !u.startsWith('data:') && !u.startsWith('blob:'))).toEqual([]);
  });
});
