// @vitest-environment node
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { chromium, devices, type Browser, type Page } from 'playwright';
import { pressExport, setSelect } from './chrome';

// The timeline (FR-66 to FR-70) and the date cells read as dates (FR-1 as
// amended) in a real layout, headless Chromium, offline: the application at
// 1500 × 950 with the example workbook of date cells and with the full-test
// demo, and the exported viewer in both views on a desktop, phones, and a
// tablet. Run after the build.
const BUILT = join(process.cwd(), 'dist', 'build', 'index.html');
const EXAMPLE = join(process.cwd(), 'example-data');

let browser: Browser;
let exported: string;

beforeAll(async () => {
  if (!existsSync(BUILT)) {
    throw new Error('dist/build/index.html is missing: run the build first');
  }
  browser = await chromium.launch();
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

// The timeline's measures: its lines, their names and bars, and the plot.
async function lines(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('#presentation-timeline .timeline-lines > li')].map((li) => {
      const r = li.getBoundingClientRect();
      const name = li.querySelector('.timeline-title')?.getBoundingClientRect();
      const bar = li.querySelector('.timeline-bar, .timeline-point')?.getBoundingClientRect();
      return {
        heading: li.classList.contains('timeline-heading'),
        text: li.classList.contains('timeline-heading') ? li.textContent : li.querySelector('.timeline-title')!.textContent,
        top: r.top,
        height: r.height,
        name: name ? { top: name.top, bottom: name.bottom, left: name.left, right: name.right } : null,
        bar: bar ? { left: bar.left, right: bar.right, top: bar.top, width: bar.width } : null,
      };
    }),
  );
}

async function firstBarLeft(page: Page): Promise<number> {
  return page.evaluate(() => document.querySelector<HTMLElement>('#presentation-timeline .timeline-bar')!.getBoundingClientRect().left);
}

describe('the timeline in the application (FR-66, FR-67, FR-70)', () => {
  test('date cells as dates; the lines, the points, and "No dates"; zoom, pan, and scroll; the card beside a line; the order', async () => {
    const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
    await context.setOffline(true);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`file://${BUILT}`);
    await setSelect(page, 'select-language', 'en');
    await page.setInputFiles('#file-input', join(EXAMPLE, 'example-dates.xlsx'));
    await page.waitForSelector('.role-select[data-header="Start"]');
    // The date cells read as dates, never as their serial numbers.
    const cells = await page.$$eval('#row-table-body .cell-input', (inputs) => inputs.map((i) => (i as HTMLInputElement).value));
    expect(cells).toEqual(expect.arrayContaining(['2024-03-15', '2026-06-30', '2024-05-02 18:00', '2025-12-31', '2025-01-10', '15/03/2024']));
    expect(cells.some((v) => /^4\d{4}(\.\d+)?$/.test(v))).toBe(false);
    for (const [h, r] of [
      ['ID', 'identifier'],
      ['Name', 'name'],
      ['Start', 'start'],
      ['End', 'end'],
      ['Group', 'area'],
    ]) {
      await page.selectOption(`.role-select[data-header="${h}"]`, r);
    }
    await page.click('#tab-presentation');
    await page.click('#pres-mode-timeline');
    const stage = (await page.locator('#presentation-stage').boundingBox())!;
    let l = await lines(page);
    expect(l.map((x) => x.text)).toEqual(['Dated item', 'Timed item', 'Month item', 'Open item', 'No dates', 'Ambiguous item', 'Undated item']);
    // Desktop lines: 28 pixels, the name in its column beside the bar.
    for (const x of l.filter((x) => !x.heading)) {
      expect(x.height).toBe(28);
      if (x.bar) {
        expect(x.bar.left).toBeGreaterThanOrEqual(x.name!.right);
      }
    }
    // Every bar within the stage at the fitted view; no bar for "No dates".
    for (const x of l.filter((x) => x.bar)) {
      expect(x.bar!.left).toBeGreaterThanOrEqual(stage.x);
      expect(x.bar!.right).toBeLessThanOrEqual(stage.x + stage.width + 0.5);
    }
    expect(l.filter((x) => x.text === 'Ambiguous item' || x.text === 'Undated item').every((x) => x.bar === null)).toBe(true);
    expect(await page.textContent('#presentation-timeline .timeline-typed')).toBe('Start: 15/03/2024');
    // Ctrl with the wheel zooms time; a sideways wheel pans; Fit returns.
    const body = (await page.locator('#presentation-timeline .timeline-body').boundingBox())!;
    await page.mouse.move(body.x + body.width * 0.6, body.y + body.height - 20);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -300);
    await page.keyboard.up('Control');
    await page.waitForTimeout(100);
    expect(Number((await page.textContent('#pres-zoom-level'))!.replace('%', ''))).toBeGreaterThan(100);
    const before = await firstBarLeft(page);
    await page.mouse.wheel(200, 0);
    await page.waitForTimeout(100);
    expect(await firstBarLeft(page)).toBeLessThan(before - 50);
    // A sideways drag pans back.
    const panned = await firstBarLeft(page);
    await page.mouse.move(body.x + body.width * 0.4, body.y + body.height - 20);
    await page.mouse.down();
    await page.mouse.move(body.x + body.width * 0.6, body.y + body.height - 15, { steps: 6 });
    await page.mouse.up();
    expect(await firstBarLeft(page)).toBeGreaterThan(panned + 50);
    await page.click('#pres-fit');
    expect(await page.textContent('#pres-zoom-level')).toBe('100%');
    // The map underneath did not move.
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('presentation-marker-layer')!).visibility)).toBe('hidden');
    // A line's chip opens the card beside it, within the stage; Escape closes it.
    await page.click('#presentation-timeline .timeline-chip >> text=Timed item');
    await page.waitForFunction(() => document.getElementById('presentation-card')!.dataset.state === 'open');
    await page.waitForTimeout(250);
    const card = (await page.locator('#presentation-card').boundingBox())!;
    expect(card.x).toBeGreaterThanOrEqual(stage.x);
    expect(card.x + card.width).toBeLessThanOrEqual(stage.x + stage.width + 0.5);
    expect(card.y).toBeGreaterThanOrEqual(stage.y);
    expect(card.y + card.height).toBeLessThanOrEqual(stage.y + stage.height + 0.5);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.getElementById('presentation-card')!.dataset.state === 'closed');
    expect(await page.evaluate(() => document.activeElement?.closest('.timeline-chip')?.textContent)).toContain('Timed item');
    // The order: by area under the areas' names, by start date.
    await page.selectOption('#pres-order', 'area');
    l = await lines(page);
    expect(l.map((x) => x.text)).toEqual([
      'North',
      'Dated item',
      'Month item',
      'South',
      'Timed item',
      'Open item',
      'No dates',
      'Ambiguous item',
      'Undated item',
    ]);
    expect(await page.$$eval('#presentation-glance-list .glance-name', (n) => n.map((x) => x.textContent))).toEqual([
      'Dated item',
      'Month item',
      'Timed item',
      'Open item',
      'Ambiguous item',
      'Undated item',
    ]);
    await page.selectOption('#pres-order', 'start');
    expect((await lines(page)).map((x) => x.text).slice(0, 4)).toEqual(['Dated item', 'Timed item', 'Open item', 'Month item']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    expect(errors).toEqual([]);
    await context.close();
  }, 90_000);

  test('the demo: every item on the timeline, with or without a marker; exported in the timeline', async () => {
    const context = await browser.newContext({ viewport: { width: 1500, height: 700 }, acceptDownloads: true });
    await context.setOffline(true);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`file://${BUILT}`);
    await page.evaluate(() => delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker);
    await setSelect(page, 'select-language', 'en');
    await page.click('#load-demo');
    await page.waitForFunction(() => document.querySelectorAll('#map-stage .marker').length === 11);
    await page.click('#tab-presentation');
    await page.click('#pres-mode-timeline');
    // Twelve items, one without a marker, all on the timeline.
    expect((await lines(page)).length).toBe(12);
    // All twelve lines fit the desktop stage: "In view" lists them all.
    expect(await page.$$eval('#presentation-glance-list .glance-entry', (e) => e.length)).toBe(12);
    await pressExport(page, 'export-open');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-go')]);
    exported = join(mkdtempSync(join(tmpdir(), 'mapvibes-timeline-')), 'presentation.html');
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
    test(`the exported viewer on a ${name}: the timeline it was exported in, ${narrow ? '48-pixel lines with the chip row above the plot, the switch on the toggles row' : 'the switch at the head of the toolbar'}; both views`, async () => {
      const context = await browser.newContext({ ...profile });
      await context.setOffline(true);
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(`file://${exported}`);
      await page.waitForFunction(() => document.querySelectorAll('#presentation-timeline .timeline-line').length === 12);
      expect(await page.getAttribute('#presentation-stage', 'data-view')).toBe('timeline');
      expect(await page.getAttribute('#pres-mode-timeline', 'aria-pressed')).toBe('true');
      const l = (await lines(page)).filter((x) => !x.heading);
      const vw = await page.evaluate(() => innerWidth);
      if (narrow) {
        // The 48-pixel line (FR-58 as noted in v1.14.0): the chip row over the plot.
        for (const x of l) {
          expect(x.height).toBe(48);
        }
        // The name above the bar.
        for (const x of l.filter((x) => x.bar && x.top >= 0)) {
          expect(x.name!.bottom).toBeLessThanOrEqual(x.bar!.top + 0.5);
        }
        // The switch on the row of the two toggles.
        const mode = (await page.locator('#pres-mode').boundingBox())!;
        const toggles = (await page.locator('#viewer-toggles').boundingBox())!;
        expect(Math.abs(mode.y - toggles.y)).toBeLessThanOrEqual(4);
        expect(await page.isVisible('#toggle-legend')).toBe(true);
        // "In view" lists the visible lines; an entry opens the card docked
        // at the bottom, within the viewport.
        // The plain wheel scrolls the lines, and leaves the zoom alone.
        const scroller = page.locator('#presentation-timeline .timeline-scroll');
        const overflows = await scroller.evaluate((x) => x.scrollHeight > x.clientHeight);
        // Measured on the built v1.9.0 viewer (iPhone 13, 390 x 664): the
        // stage grew to 517 pixels (header 71, toolbar 54), so the twelve
        // lines (scroller 487 x 487) no longer overflow in portrait;
        // in landscape (844 x 390, stage 314) they still do.
        // Measured on the built v1.11.0 viewer (iPhone 13, 390 x 664): the
        // demo's two events stagger into two rows, so the events strip
        // (FR-80) takes 42 pixels above the lines; the scroller is 440
        // pixels and the twelve lines (480 pixels) scroll in portrait too.
        // Since v1.14.0 the lines are 48 pixels (576 in all) and scroll.
        if (name === 'phone portrait') {
          expect(overflows).toBe(true);
        }
        if (name === 'phone landscape') {
          expect(overflows).toBe(true);
        }
        if (overflows) {
          const body = (await page.locator('#presentation-timeline .timeline-body').boundingBox())!;
          await page.mouse.move(body.x + body.width / 2, body.y + body.height / 2);
          await page.mouse.wheel(0, 120);
          await page.waitForTimeout(250);
          expect(await scroller.evaluate((x) => x.scrollTop)).toBeGreaterThan(0);
          expect(await page.evaluate(() => document.getElementById('pres-zoom-level')!.textContent)).toBe('100%');
        }
        await page.tap('#toggle-glance');
        await page.waitForTimeout(300);
        const entries = await page.$$eval('#presentation-glance-list .glance-entry', (e) => e.length);
        expect(entries).toBeGreaterThan(0);
        // Only the lines in view.
        const shown = await page.evaluate(() => {
          const s = document.querySelector<HTMLElement>('#presentation-timeline .timeline-scroll')!;
          return [...s.querySelectorAll<HTMLElement>('.timeline-line')].filter(
            (r) => r.offsetTop + r.offsetHeight > s.scrollTop && r.offsetTop < s.scrollTop + s.clientHeight,
          ).length;
        });
        expect(entries).toBe(shown);
        await page.tap('#presentation-glance-list .glance-entry');
        await page.waitForFunction(() => document.getElementById('presentation-card')!.dataset.state === 'open');
        await page.waitForTimeout(300);
        const card = (await page.locator('#presentation-card').boundingBox())!;
        const vh = await page.evaluate(() => innerHeight);
        expect(await page.getAttribute('#presentation-card', 'data-dock')).toBe('bottom');
        expect(card.y + card.height).toBeLessThanOrEqual(vh + 0.5);
        expect(card.x).toBeGreaterThanOrEqual(0);
        expect(card.x + card.width).toBeLessThanOrEqual(vw + 0.5);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(250);
      } else {
        for (const x of l) {
          expect(x.height).toBe(28);
        }
        expect(await page.evaluate(() => document.getElementById('presentation-toolbar')!.firstElementChild!.id)).toBe('pres-mode');
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      // The map, from the same switch.
      await page.click('#pres-mode-map');
      await page.waitForTimeout(300);
      expect(await page.getAttribute('#presentation-stage', 'data-view')).toBe('map');
      expect(await page.locator('#presentation-marker-layer .marker').count()).toBe(11);
      expect(await page.evaluate(() => getComputedStyle(document.getElementById('presentation-timeline')!).display)).toBe('none');
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      expect(errors).toEqual([]);
      await context.close();
    }, 60_000);
  }
});
