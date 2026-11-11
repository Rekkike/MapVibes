// @vitest-environment node
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { chromium, devices, type Browser, type Page } from 'playwright';

// The economics view (FR-64) in a real layout, headless Chromium, offline:
// the example workbook with year series, its thirteen-year item as the
// stress case, the overlay centred on a desktop and as a bottom sheet in the
// narrow viewer, and the exported viewer. Run after the build.
const BUILT = join(process.cwd(), 'dist', 'build', 'index.html');
const EXAMPLE = join(process.cwd(), 'example-data');

let browser: Browser;
let exported: string;

// The overlay's measures: its box, the viewport, whether its table fits its
// width, and whether the page overflows sideways.
async function measure(page: Page) {
  return page.evaluate(() => {
    const o = document.getElementById('economics-overlay')!;
    const r = o.getBoundingClientRect();
    const table = o.querySelector('table')!;
    return {
      state: o.dataset.state,
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      vw: innerWidth,
      vh: innerHeight,
      rows: o.querySelectorAll('.economics-table tbody tr').length,
      tableFits: table.scrollWidth <= table.parentElement!.clientWidth + 1,
      overflowY: getComputedStyle(o).overflowY,
      pageOverflowX: document.documentElement.scrollWidth > innerWidth,
    };
  });
}

async function openFromCard(page: Page): Promise<void> {
  await page.evaluate(() => {
    const m = document.querySelector('#presentation-marker-layer .marker')!;
    m.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, isPrimary: true }));
    m.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, isPrimary: true }));
  });
  await page.waitForFunction(() => document.getElementById('presentation-card')!.dataset.state === 'open');
  await page.click('#presentation-card .card-economics');
  await page.waitForFunction(() => document.getElementById('economics-overlay')!.dataset.state === 'open');
  await page.waitForTimeout(250);
}

beforeAll(async () => {
  if (!existsSync(BUILT)) {
    throw new Error('dist/build/index.html is missing: run the build first');
  }
  browser = await chromium.launch();
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

describe('the economics view in a browser (FR-64)', () => {
  test('in the application on a desktop: centred, the thirteen years without scrolling, nothing overflowing', async () => {
    const context = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
    await context.setOffline(true);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`file://${BUILT}`);
    await page.evaluate(() => delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker);
    await page.selectOption('#select-language', 'en');
    await page.setInputFiles('#file-input', join(EXAMPLE, 'example-economics.xlsx'));
    await page.waitForSelector('.role-select[data-header="Start"]');
    for (const [h, r] of [
      ['ID', 'identifier'],
      ['Name', 'name'],
      ['Start', 'start'],
      ['End', 'end'],
    ]) {
      await page.selectOption(`.role-select[data-header="${h}"]`, r);
    }
    await page.click('#series-panel-summary');
    for (const [k, r] of [
      ['budget', 'budget'],
      ['prognos', 'forecast'],
      ['utfall', 'outcome'],
    ]) {
      await page.selectOption(`.series-item[data-series="${k}"] .series-role`, r);
    }
    await page.selectOption('.series-item[data-series="budget"] .series-total', 'Budget total');
    await page.click('#tab-map');
    await page.setInputFiles('#map-file-input', join(EXAMPLE, 'example-background.png'));
    await page.waitForFunction(() => document.getElementById('map-stage')!.dataset.hasBackground === 'true');
    const box = (await page.locator('#map-stage').boundingBox())!;
    await page
      .locator('.placement-item')
      .nth(0)
      .dragTo(page.locator('#map-stage'), { targetPosition: { x: Math.round(box.width / 2), y: Math.round(box.height / 2) } });
    await page.click('#tab-presentation');
    await page.click('#pres-fit');
    await openFromCard(page);
    const m = await measure(page);
    expect(m.rows).toBe(13);
    // Centred over the page.
    expect(Math.abs(m.x + m.width / 2 - m.vw / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(m.y + m.height / 2 - m.vh / 2)).toBeLessThanOrEqual(1);
    expect(m.y).toBeGreaterThanOrEqual(0);
    expect(m.y + m.height).toBeLessThanOrEqual(m.vh);
    expect(
      await page.evaluate(() => {
        const o = document.getElementById('economics-overlay')!;
        return o.scrollHeight <= o.clientHeight + 1;
      }),
    ).toBe(true);
    expect([m.tableFits, m.pageOverflowX]).toEqual([true, false]);
    // Escape closes it alone, and focus returns to the card's action.
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.getElementById('economics-overlay')!.dataset.state === 'closed');
    expect(await page.evaluate(() => document.activeElement?.className)).toBe('card-economics');
    expect(await page.getAttribute('#presentation-card', 'data-state')).toBe('open');
    await page.click('#export-open');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-go')]);
    exported = join(mkdtempSync(join(tmpdir(), 'mapvibes-economics-')), 'presentation.html');
    await download.saveAs(exported);
    expect(errors).toEqual([]);
    await context.close();
  }, 90_000);

  for (const [name, profile, narrow] of [
    ['desktop', { viewport: { width: 1500, height: 950 } }, false],
    ['phone portrait', devices['iPhone 13'], true],
    ['phone landscape', devices['iPhone 13 landscape'], true],
    ['tablet portrait', devices['iPad (gen 7)'], true],
  ] as const) {
    test(`in the exported viewer on a ${name}: ${narrow ? 'a bottom sheet within the viewport, scrolling inside' : 'centred'}`, async () => {
      const context = await browser.newContext({ ...profile });
      await context.setOffline(true);
      const page = await context.newPage();
      await page.goto(`file://${exported}`);
      await page.waitForFunction(() => document.querySelectorAll('#presentation-marker-layer .marker').length === 1);
      await openFromCard(page);
      const m = await measure(page);
      expect(m.rows).toBe(13);
      expect([m.tableFits, m.pageOverflowX]).toEqual([true, false]);
      expect(m.x).toBeGreaterThanOrEqual(0);
      expect(m.x + m.width).toBeLessThanOrEqual(m.vw + 0.5);
      expect(m.y).toBeGreaterThanOrEqual(0);
      expect(m.y + m.height).toBeLessThanOrEqual(m.vh + 0.5);
      if (narrow) {
        // Docked at the bottom, the viewport's width less its margins.
        expect(m.vh - (m.y + m.height)).toBeLessThanOrEqual(12);
        expect(m.width).toBeGreaterThanOrEqual(m.vw - 24);
        expect(m.overflowY).toBe('auto');
      } else {
        expect(Math.abs(m.x + m.width / 2 - m.vw / 2)).toBeLessThanOrEqual(1);
      }
      await context.close();
    }, 60_000);
  }
});
