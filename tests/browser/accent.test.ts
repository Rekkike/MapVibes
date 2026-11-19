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
  // The legend's glyphs (FR-75 as amended in v2.6.0, the owner's ruling): in
  // every legend a swatch's icon lies within the swatch's coloured fill,
  // inside the 2-pixel ring, so that it reads as a line drawing.
  for (const [name, options] of SIZES) {
    for (const theme of ['light', 'dark'] as const) {
      test(`every legend glyph lies within its swatch's fill, Helsingborg on ${name} (${theme})`, async () => {
        const page = await open(options, 'sv', theme);
        await page.evaluate(() => document.getElementById('load-demo')!.click());
        await page.evaluate(() => {
          const r = document.getElementById('demo-choice-helsingborg') as HTMLInputElement;
          r.checked = true;
          r.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await page.evaluate(() => document.getElementById('demo-go')!.click());
        await page.waitForFunction(() => document.querySelectorAll('#marker-layer .marker').length > 0, undefined, { timeout: 30_000 });
        await page.evaluate(() => document.getElementById('tab-presentation')!.click());
        await page.waitForTimeout(800);
        const phone = (options.viewport?.width ?? 1440) < 768;
        if (phone) {
          await page.evaluate(() => document.getElementById('toggle-legend')!.click());
          await page.waitForTimeout(300);
        }
        const outside = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>('#presentation-legend .legend-swatch, #map-legend .legend-swatch')].flatMap((swatch) => {
            const glyph = swatch.querySelector(':scope > svg.marker-glyph');
            const s = swatch.getBoundingClientRect();
            if (!glyph || s.width === 0) {
              return [];
            }
            const g = glyph.getBoundingClientRect();
            const ring = 2;
            const inside = g.left >= s.left + ring - 0.5 && g.right <= s.right - ring + 0.5 && g.top >= s.top + ring - 0.5 && g.bottom <= s.bottom - ring + 0.5;
            return inside ? [] : [`${swatch.closest('.legend-entry')?.textContent}: glyph ${g.width.toFixed(1)} in swatch ${s.width.toFixed(1)}`];
          }),
        );
        const counted = await page.$$eval(
          '#presentation-legend .legend-swatch > svg.marker-glyph',
          (els) => els.filter((e) => e.getBoundingClientRect().width > 0).length,
        );
        expect(counted).toBeGreaterThan(0);
        expect(outside).toEqual([]);
        await page.context().close();
      }, 120_000);
    }
  }
  // The emphasis marker (FR-83, v2.7.0), pinned by DOM and CSS assertions:
  // the owner's visual spec -- a red lightning on a yellow filled circle,
  // larger than the ordinary marker -- its fill the marker yellow, its stroke
  // the emphasis ink at 4.5:1 or more on the yellow (FR-29), covering neither
  // the number nor the symbol; the Helsingborg demo's OPS quay standing out.
  for (const [name, options] of SIZES) {
    for (const theme of ['light', 'dark'] as const) {
      test(`the emphasis marker: size, fill, stroke, and contrast on ${name} (${theme})`, async () => {
        const page = await open(options, 'sv', theme);
        await page.evaluate(() => document.getElementById('load-demo')!.click());
        await page.evaluate(() => {
          const r = document.getElementById('demo-choice-helsingborg') as HTMLInputElement;
          r.checked = true;
          r.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await page.evaluate(() => document.getElementById('demo-go')!.click());
        await page.waitForFunction(() => document.querySelectorAll('#marker-layer .marker').length > 0, undefined, { timeout: 30_000 });
        await page.evaluate(() => document.getElementById('tab-map')?.click());
        // The OPS quay: the item whose marker carries the bolt.
        await page.evaluate(() => {
          const marker = [...document.querySelectorAll<HTMLElement>('#marker-layer .marker')].find((m) => m.dataset.shape === 'bolt')!;
          const r = marker.getBoundingClientRect();
          for (const type of ['pointerdown', 'pointerup']) {
            marker.dispatchEvent(
              new PointerEvent(type, { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 1, isPrimary: true }),
            );
          }
        });
        await page.waitForSelector('#details-panel .details-accent select', { state: 'attached' });
        await page.selectOption('#details-panel .details-accent select', 'bolt');
        await page.evaluate(() => {
          const box = document.querySelector<HTMLInputElement>('#details-panel .emphasis-box')!;
          box.checked = true;
          box.dispatchEvent(new Event('change'));
        });
        await page.waitForTimeout(250);
        const m = await page.evaluate(() => {
          const marker = document.querySelector<HTMLElement>('#marker-layer .marker.marker-emphasised')!;
          const big = marker.querySelector<HTMLElement>('.marker-emphasis')!;
          const glyph = marker.querySelector(':scope > svg.marker-glyph')!;
          const text = [...marker.childNodes].find((n) => n.nodeType === Node.TEXT_NODE)!;
          const range = document.createRange();
          range.selectNodeContents(text);
          const box = (r: DOMRect) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height });
          const probe = (v: string) => {
            const s = document.createElement('span');
            s.style.color = `var(${v})`;
            document.body.appendChild(s);
            const c = getComputedStyle(s).color;
            s.remove();
            return c;
          };
          const parse = (c: string) => /rgba?\(([^)]+)\)/.exec(c)![1].split(',').map(Number);
          const lum = (c: number[]) =>
            [0, 1, 2]
              .map((i) => c[i] / 255)
              .reduce((sum, s, i) => sum + [0.2126, 0.7152, 0.0722][i] * (s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4), 0);
          const bg = getComputedStyle(big).backgroundColor;
          const stroke = getComputedStyle(big.querySelector('svg')!).stroke;
          const [a, b] = [lum(parse(stroke)), lum(parse(bg))].sort((x, y) => y - x);
          return {
            marker: box(marker.getBoundingClientRect()),
            big: box(big.getBoundingClientRect()),
            glyph: box(glyph.getBoundingClientRect()),
            number: box(range.getBoundingClientRect()),
            radius: getComputedStyle(big).borderRadius,
            bg,
            stroke,
            yellow: probe('--marker-yellow'),
            ink: probe('--emphasis-ink'),
            ratio: (a + 0.05) / (b + 0.05),
          };
        });
        // Larger than the ordinary marker: 44 pixels against its 28.
        expect(m.big.width).toBeCloseTo(44, 0);
        expect(m.big.height).toBeCloseTo(44, 0);
        expect(m.big.height).toBeGreaterThanOrEqual(m.marker.height * 1.5);
        expect(m.radius).toBe('999px');
        // Yellow filled, the icon stroked in red, 4.5:1 or more.
        expect(m.bg).toBe(m.yellow);
        expect(m.stroke).toBe(m.ink);
        expect(m.ink).toBe('rgb(143, 16, 16)');
        expect(m.ratio).toBeGreaterThanOrEqual(4.5);
        // It stands at the upper right, covering neither the number nor the symbol.
        expect(m.big.left).toBeGreaterThan(m.marker.left);
        expect(m.big.top).toBeLessThan(m.marker.top);
        expect(overlaps(m.big, m.number)).toBe(false);
        expect(overlaps(m.big, m.glyph)).toBe(false);
        await page.context().close();
      }, 120_000);
    }
  }
});
