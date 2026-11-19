// @vitest-environment node
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { pressExport, setSelect } from './chrome';

// The per-item accent (FR-82, v2.6.0) and the default vocabulary (FR-45,
// FR-54 as amended) in a real layout, at a phone and a desktop size, in both
// themes and both languages: a fresh work starts with the ruled names; an
// accent set on an item's card is drawn in its own slot at the marker's
// upper right, beside the number and the status's symbol and covering
// neither, its glyph at least 4.5:1 on its disc; the exported viewer draws it
// and its legend names it. Run after the build (npm run build).
const BUILT = join(process.cwd(), 'dist', 'build', 'index.html');

let browser: Browser;

beforeAll(async () => {
  if (!existsSync(BUILT)) {
    throw new Error('dist/build/index.html is missing: run the build first');
  }
  browser = await chromium.launch();
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

const SIZES = [
  ['phone 390x844', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ['desktop 1440x900', { viewport: { width: 1440, height: 900 } }],
] as const;

async function open(options: Parameters<Browser['newContext']>[0], lang: 'en' | 'sv', theme: 'light' | 'dark'): Promise<Page> {
  const context = await browser.newContext({ ...options, acceptDownloads: true });
  await context.setOffline(true);
  const page = await context.newPage();
  await page.goto(`file://${BUILT}`);
  // The export lands as a download, not through the save-file picker.
  await page.evaluate(() => delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker);
  await setSelect(page, 'select-language', lang);
  await setSelect(page, 'select-theme', theme);
  return page;
}

async function loadDemo(page: Page): Promise<void> {
  await page.evaluate(() => document.getElementById('load-demo')!.click());
  await page.evaluate(() => document.getElementById('demo-go')!.click());
  await page.waitForFunction(() => document.querySelectorAll('#marker-layer .marker').length === 11, undefined, { timeout: 30_000 });
  await page.waitForTimeout(300);
}

// The geometry of the first marker and its parts, and the accent's contrast.
function measure(page: Page, layer: string) {
  return page.evaluate((selector) => {
    const marker = document.querySelector<HTMLElement>(`${selector} .marker[data-accent]`)!;
    const accent = marker.querySelector<HTMLElement>('.marker-accent')!;
    const glyph = marker.querySelector<SVGElement>(':scope > svg.marker-glyph');
    const text = [...marker.childNodes].find((n) => n.nodeType === Node.TEXT_NODE)!;
    const range = document.createRange();
    range.selectNodeContents(text);
    const box = (r: DOMRect) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    const parse = (c: string) => /rgba?\(([^)]+)\)/.exec(c)![1].split(',').map(Number);
    const lum = (c: number[]) =>
      [0, 1, 2].map((i) => c[i] / 255).reduce((sum, s, i) => sum + [0.2126, 0.7152, 0.0722][i] * (s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4), 0);
    const ink = lum(parse(getComputedStyle(accent).color));
    const ground = lum(parse(getComputedStyle(accent).backgroundColor));
    return {
      marker: box(marker.getBoundingClientRect()),
      accent: box(accent.getBoundingClientRect()),
      glyph: glyph ? box(glyph.getBoundingClientRect()) : null,
      number: box(range.getBoundingClientRect()),
      ratio: (Math.max(ink, ground) + 0.05) / (Math.min(ink, ground) + 0.05),
      vw: innerWidth,
    };
  }, layer);
}

type Box = { left: number; top: number; right: number; bottom: number };
const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

describe('the per-item accent and the default vocabulary in a real layout (FR-82, FR-45, FR-54 as amended)', () => {
  for (const [name, options] of SIZES) {
    for (const theme of ['light', 'dark'] as const) {
      test(`a fresh work's starter names, and an accent beside the number and the status on ${name} (${theme})`, async () => {
        const page = await open(options, 'sv', theme);
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        // A fresh empty work: the panels hold the ruled names.
        expect(await page.$$eval('#colour-label-list input', (els) => els.map((e) => (e as HTMLInputElement).value))).toEqual([
          'Internt projekt',
          'Externt projekt',
          'Paus',
          'Stopp',
        ]);
        expect(
          await page.$$eval('#symbol-label-list input', (els) =>
            els.filter((e) => (e as HTMLInputElement).value !== '').map((e) => (e as HTMLInputElement).value),
          ),
        ).toEqual(['Idéfas', 'Förstudie', 'Projektering', 'Genomförande', 'OPS kaj']);
        await loadDemo(page);
        // The first item's card, opened from its marker; the accent chosen there.
        await page.evaluate(() => document.getElementById('tab-map')?.click());
        await page.locator('#marker-layer .marker').first().dispatchEvent('click');
        await page.evaluate(() => {
          const marker = document.querySelector<HTMLElement>('#marker-layer .marker')!;
          const r = marker.getBoundingClientRect();
          for (const type of ['pointerdown', 'pointerup']) {
            marker.dispatchEvent(
              new PointerEvent(type, { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 1, isPrimary: true }),
            );
          }
        });
        await page.waitForSelector('#details-panel .details-accent select', { state: 'attached' });
        await page.selectOption('#details-panel .details-accent select', 'bolt');
        await page.waitForTimeout(200);
        const m = await measure(page, '#marker-layer');
        // Its own slot at the upper right: beyond the marker's top and right
        // edges, covering neither the number nor the status's symbol.
        expect(m.accent.top).toBeLessThan(m.marker.top);
        expect(m.accent.right).toBeGreaterThan(m.marker.right);
        expect(overlaps(m.accent, m.number)).toBe(false);
        if (m.glyph) {
          expect(overlaps(m.accent, m.glyph)).toBe(false);
        }
        expect(m.ratio).toBeGreaterThanOrEqual(4.5);
        expect(errors).toEqual([]);
        await page.context().close();
      }, 120_000);
    }
  }

  test('the exported viewer draws the accent and its legend names it, in English', async () => {
    const page = await open({ viewport: { width: 1440, height: 900 } }, 'en', 'light');
    await loadDemo(page);
    await page.evaluate(() => {
      const marker = document.querySelector<HTMLElement>('#marker-layer .marker')!;
      const r = marker.getBoundingClientRect();
      for (const type of ['pointerdown', 'pointerup']) {
        marker.dispatchEvent(
          new PointerEvent(type, { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 1, isPrimary: true }),
        );
      }
    });
    await page.waitForSelector('#details-panel .details-accent select', { state: 'attached' });
    await page.selectOption('#details-panel .details-accent select', 'bolt');
    await page.click('#tab-presentation');
    await page.waitForTimeout(300);
    await pressExport(page, 'export-open');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-go')]);
    const file = join(mkdtempSync(join(tmpdir(), 'mapvibes-accent-')), 'presentation.html');
    await download.saveAs(file);
    const viewer = await page.context().newPage();
    await viewer.goto(`file://${file}`);
    await viewer.waitForFunction(() => document.documentElement.dataset.mode === 'viewer');
    await viewer.waitForFunction(() => document.querySelector('#presentation-marker-layer .marker[data-accent="bolt"]') !== null);
    expect(await viewer.locator('#presentation-marker-layer .marker-accent').count()).toBe(1);
    expect(await viewer.locator('#presentation-legend .legend-entry[data-shape="bolt"]').allTextContents()).toEqual(['OPS quay']);
    const m = await measure(viewer, '#presentation-marker-layer');
    expect(overlaps(m.accent, m.number)).toBe(false);
    await page.context().close();
  }, 120_000);
});
