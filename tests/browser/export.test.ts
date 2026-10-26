// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

// Round trip of the interactive export (FR-11, FR-14, FR-38, FR-39) through
// the built single-file page in headless Chromium, offline: the application
// produces an exported file, which is then opened on its own, from a local
// folder, and compared back. Run after the build (npm run build).

const BUILT = join(process.cwd(), 'dist', 'build', 'index.html');
const EXAMPLE = join(process.cwd(), 'example-data');

let browser: Browser;
let context: BrowserContext;
let dir: string;
let exported: string;
let exportedText: string;
// Every request any page made, by URL.
const requests: string[] = [];

async function newPage(): Promise<{ page: Page; errors: string[] }> {
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  return { page, errors };
}

beforeAll(async () => {
  if (!existsSync(BUILT)) throw new Error('dist/build/index.html is missing: run the build first');
  dir = mkdtempSync(join(tmpdir(), 'mapvibes-export-'));
  browser = await chromium.launch();
  context = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true, hasTouch: false });
  await context.setOffline(true);
  // Anything other than the local files themselves is recorded and refused.
  await context.route('**/*', (route) => {
    const url = route.request().url();
    requests.push(url);
    if (url.startsWith('file://') || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    return route.abort();
  });

  // In the application: the example workbook, the identifier and area roles,
  // the example background, three markers, a comment, one item switched off.
  const { page } = await newPage();
  await page.goto(`file://${BUILT}`);
  await page.evaluate(() => delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker);
  await page.selectOption('#select-language', 'en');
  await page.setInputFiles('#file-input', join(EXAMPLE, 'example.xlsx'));
  await page.selectOption('.role-select[data-header="ID"]', 'identifier');
  await page.selectOption('.role-select[data-header="Group"]', 'area');
  await page.locator('#row-table-body tr').nth(2).locator('.row-details').click();
  await page.fill('#details-panel .details-comment-input', 'Comment carried into the export.');
  await page.click('#details-panel .details-comment-add');
  await page.click('#details-panel .details-close');
  await page.click('#tab-map');
  await page.setInputFiles('#map-file-input', join(EXAMPLE, 'example-background.png'));
  await page.waitForFunction(() => document.getElementById('map-stage')!.dataset.hasBackground === 'true');
  const box = (await page.locator('#map-stage').boundingBox())!;
  for (const [i, index] of [0, 2, 4].entries()) {
    await page
      .locator('.placement-item')
      .nth(index)
      .dragTo(page.locator('#map-stage'), { targetPosition: { x: Math.round(box.width * (0.2 + 0.3 * i)), y: Math.round(box.height / 2) } });
  }
  await page.click('#tab-presentation');
  // Switch off A-05 (the third placed item).
  await page.locator('.visibility-toggle').nth(2).uncheck();
  await page.click('#export-open');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-go')]);
  exported = join(dir, 'mapvibes-presentation.html');
  await download.saveAs(exported);
  exportedText = readFileSync(exported, 'utf8');
  await page.close();
}, 120_000);

afterAll(async () => {
  await browser?.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('the exported file in a browser, offline (FR-11, FR-38)', () => {
  test('it opens on its own as the view-only presentation, with no errors', async () => {
    const { page, errors } = await newPage();
    await page.goto(`file://${exported}`);
    await page.waitForFunction(() => document.getElementById('presentation-stage')!.dataset.hasBackground === 'true');
    expect(await page.evaluate(() => document.documentElement.dataset.mode)).toBe('viewer');
    expect(await page.isVisible('#segment-presentation')).toBe(true);
    for (const id of ['#segment-nav', '#work-controls', '#export-open', '#segment-information', '#segment-map']) expect(await page.isVisible(id), id).toBe(false);
    expect(await page.locator('.visibility-toggle').count()).toBe(0);
    expect(errors).toEqual([]);
    await page.close();
  });

  test('the map, markers, legend, list, at-a-glance panel, and cards hold the exported content', async () => {
    const { page } = await newPage();
    await page.goto(`file://${exported}`);
    await page.waitForFunction(() => document.getElementById('presentation-stage')!.dataset.hasBackground === 'true');
    // The background image is decoded from the embedded data.
    expect(await page.evaluate(() => (document.getElementById('presentation-image') as HTMLImageElement).naturalWidth)).toBe(1200);
    expect(await page.locator('#presentation-marker-layer .marker').allTextContents()).toEqual(['1', '3']);
    expect(await page.locator('#presentation-legend .legend-entry[data-colour]').count()).toBe(4);
    expect(await page.locator('#visibility-list .placement-label').allTextContents()).toEqual(['A-01', 'A-02', 'A-03', 'A-04']);
    expect(await page.locator('#presentation-glance-list .glance-name').allTextContents()).toEqual(['A-01', 'A-03']);
    expect(await page.locator('#presentation-glance-list .glance-area').allTextContents()).toEqual(['North', 'South']);
    await page.locator('#presentation-marker-layer .marker').nth(1).click();
    await expect.poll(() => page.getAttribute('#presentation-card', 'data-state')).toBe('open');
    expect(await page.textContent('#presentation-card .details-title')).toBe('A-03');
    expect(await page.locator('#presentation-card .details-comment-text').allTextContents()).toEqual(['Comment carried into the export.']);
    expect(await page.locator('#presentation-card input, #presentation-card select, #presentation-card textarea').count()).toBe(0);
    await page.keyboard.press('Escape');
    await expect.poll(() => page.getAttribute('#presentation-card', 'data-state')).toBe('closed');
    // Zoom works.
    const before = await page.getAttribute('#presentation-stage', 'data-scale');
    await page.click('#pres-zoom-in');
    expect(await page.getAttribute('#presentation-stage', 'data-scale')).not.toBe(before);
    await page.close();
  });

  test('honest export: the switched-off item is absent from the file and from what is shown', async () => {
    // Not in the file at all: neither in the data nor anywhere else.
    expect(exportedText).not.toContain('A-05');
    expect(exportedText).not.toContain('Delta item');
    const { page } = await newPage();
    await page.goto(`file://${exported}`);
    await page.waitForFunction(() => document.getElementById('presentation-stage')!.dataset.hasBackground === 'true');
    const shown = await page.evaluate(() => document.body.innerText);
    expect(shown).not.toContain('A-05');
    expect(await page.locator('#presentation-marker-layer .marker').count()).toBe(2);
    expect(await page.locator('#presentation-marker-layer .marker', { hasText: '5' }).count()).toBe(0);
    await page.close();
  });

  test('no network: the exported file makes no request beyond the local file itself', async () => {
    const start = requests.length;
    const { page } = await newPage();
    await page.goto(`file://${exported}`);
    await page.waitForFunction(() => document.getElementById('presentation-stage')!.dataset.hasBackground === 'true');
    await page.locator('#presentation-marker-layer .marker').first().click();
    await page.click('#pres-zoom-in');
    await page.waitForTimeout(500);
    const made = requests.slice(start);
    expect(made.filter((u) => !u.startsWith('data:'))).toEqual([`file://${exported}`]);
    const resources = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name));
    expect(resources.every((u) => u.startsWith('data:') || u.startsWith('blob:'))).toBe(true);
    await page.close();
  });

  test('the exported file opens back in the application for comparison', async () => {
    const { page, errors } = await newPage();
    await page.goto(`file://${BUILT}`);
    await page.selectOption('#select-language', 'en');
    await page.setInputFiles('#file-input', join(EXAMPLE, 'example.xlsx'));
    await page.selectOption('.role-select[data-header="ID"]', 'identifier');
    await page.setInputFiles('#work-file-input', exported);
    await expect.poll(() => page.isVisible('#compare-panel')).toBe(true);
    expect(await page.textContent('#work-status')).toBe('The exported file was opened for comparison. The current work is unchanged.');
    expect(await page.locator('#compare-groups h3').allTextContents()).toEqual([
      'Paired, with a marker in the file (2)',
      'Paired, without a marker in the file (2)',
      'Only in the file (0)',
      'Only in the current work (1)',
      'Cannot be paired: empty or repeated identifier (0)',
    ]);
    expect(errors).toEqual([]);
    await page.close();
  });
});
