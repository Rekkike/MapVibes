// @vitest-environment node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

// Information density (FR-42) in a real layout: the built page with the
// full-test demo loaded, in headless Chromium, offline, in both themes.
const BUILT = join(process.cwd(), 'dist', 'build', 'index.html');

let browser: Browser;

function luminance(rgb: number[]): number {
  const c = rgb.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function contrast(a: string, b: string): number {
  const parse = (s: string) => s.match(/[\d.]+/g)!.slice(0, 3).map(Number);
  const [x, y] = [luminance(parse(a)), luminance(parse(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

async function demoPage(theme: 'light' | 'dark'): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  await context.setOffline(true);
  const page = await context.newPage();
  await page.goto(`file://${BUILT}`);
  await page.selectOption('#select-language', 'en');
  await page.selectOption('#select-theme', theme);
  await page.click('#load-demo');
  await page.waitForFunction(() => document.querySelectorAll('#marker-layer .marker').length === 11);
  return page;
}

beforeAll(async () => {
  if (!existsSync(BUILT)) throw new Error('dist/build/index.html is missing: run the build first');
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

describe('dense operator surfaces in a real layout (FR-42)', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`the details panel shows every field in two columns, with all of it in view (${theme})`, async () => {
      const page = await demoPage(theme);
      await page.locator('#marker-layer .marker').first().click();
      await expect.poll(() => page.isVisible('#details-panel')).toBe(true);
      const layout = await page.evaluate(() => {
        const panel = document.getElementById('details-panel')!;
        const fields = [...panel.querySelectorAll('.details-fields > .details-field')].map((f) => f.getBoundingClientRect());
        const lefts = [...new Set(fields.map((r) => Math.round(r.left)))];
        const rows = [...new Set(fields.map((r) => Math.round(r.top)))].sort((a, b) => a - b);
        const gaps = rows.slice(1).map((top, i) => top - Math.max(...fields.filter((r) => Math.round(r.top) === rows[i]).map((r) => r.bottom)));
        const label = getComputedStyle(panel.querySelector('.details-label')!);
        return {
          fields: fields.length,
          lefts: lefts.length,
          gaps,
          scrolls: panel.scrollHeight > panel.clientHeight,
          labelSize: parseFloat(label.fontSize),
          labelColour: label.color,
          background: getComputedStyle(panel).backgroundColor,
        };
      });
      expect(layout.fields).toBe(7);
      expect(layout.lefts).toBe(2);
      expect(Math.max(...layout.gaps)).toBeLessThanOrEqual(8);
      expect(layout.scrolls).toBe(false);
      expect(layout.labelSize).toBeGreaterThanOrEqual(12);
      expect(contrast(layout.labelColour, layout.background)).toBeGreaterThanOrEqual(4.5);
      await page.context().close();
    });

    test(`at-a-glance entries and placement items are one compact line each (${theme})`, async () => {
      const page = await demoPage(theme);
      const heights = await page.evaluate(() => ({
        glance: [...document.querySelectorAll('#map-glance-list .glance-entry')].map((e) => e.getBoundingClientRect().height),
        placement: [...document.querySelectorAll('#placement-list .placement-item')].map((e) => e.getBoundingClientRect().height),
      }));
      expect(heights.glance.length).toBeGreaterThan(5);
      expect(Math.max(...heights.glance)).toBeLessThanOrEqual(32);
      expect(heights.placement).toHaveLength(12);
      expect(Math.max(...heights.placement)).toBeLessThanOrEqual(32);
      await page.context().close();
    });

    test(`the presentation data card keeps its projection sizes (${theme})`, async () => {
      const page = await demoPage(theme);
      await page.click('#tab-presentation');
      await page.locator('#presentation-marker-layer .marker').first().click();
      await expect.poll(() => page.getAttribute('#presentation-card', 'data-state')).toBe('open');
      const sizes = await page.evaluate(() => {
        const card = document.getElementById('presentation-card')!;
        return [card.querySelector('.details-title')!, card.querySelector('.details-value')!].map((n) => getComputedStyle(n).fontSize);
      });
      expect(sizes).toEqual(['28px', '20px']);
      await page.context().close();
    });
  }
});
