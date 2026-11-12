// @vitest-environment node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

// The raised design bar in a real layout (FR-29 as amended in v1.17.0): in
// both themes, at a desktop and a phone size, every visible text of an
// enabled control or surface measures at least 7:1 against the ground it is
// painted on, through the states of the full-test demo. Excluded, each for
// its own recorded reason: disabled controls (dimmed by design), the marker
// numbers and the legend's swatches (the 4.5:1 floor on the four item
// colours), and the schedule's figures printed on a bar of an item colour
// (the same floor). Run after the build (npm run build).
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

// Every text below 7:1 on the page as it stands, as "element on ground: ratio".
function lowContrast(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    type Rgb = { r: number; g: number; b: number; a: number };
    const parse = (c: string): Rgb | null => {
      const m = /rgba?\(([^)]+)\)/.exec(c);
      if (!m) {
        return null;
      }
      const p = m[1].split(',').map(Number);
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    };
    const lum = (c: Rgb): number => {
      const f = (v: number): number => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const name = (n: Element | null): string =>
      n
        ? n.tagName.toLowerCase() + (n.id ? `#${n.id}` : '') + (typeof n.className === 'string' && n.className ? `.${n.className.trim().split(/\s+/)[0]}` : '')
        : 'page';
    const found = new Set<string>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const e = t.parentElement;
      if (!e || !(t.textContent ?? '').trim()) {
        continue;
      }
      const cs = getComputedStyle(e);
      const box = e.getBoundingClientRect();
      if (cs.visibility === 'hidden' || cs.display === 'none' || box.width === 0 || box.height === 0) {
        continue;
      }
      if (e.closest('svg, option, :disabled, [aria-disabled="true"], .marker, .marker-badge, .legend-swatch, .timeline-seg-label')) {
        continue;
      }
      let ground: Rgb = { r: 255, g: 255, b: 255, a: 1 };
      let by: Element | null = null;
      for (let n: Element | null = e; n; n = n.parentElement) {
        const bg = parse(getComputedStyle(n).backgroundColor);
        if (bg && bg.a >= 0.99) {
          ground = bg;
          by = n;
          break;
        }
      }
      const fg = parse(cs.color);
      if (!fg) {
        continue;
      }
      const [x, y] = [lum(fg), lum(ground)].sort((p, q) => q - p);
      const ratio = (x + 0.05) / (y + 0.05);
      if (ratio < 7) {
        found.add(`${name(e)} on ${name(by)}: ${ratio.toFixed(2)}`);
      }
    }
    return [...found];
  });
}

async function walk(theme: 'light' | 'dark', width: number, height: number, touch: boolean): Promise<string[]> {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
  await context.setOffline(true);
  const page = await context.newPage();
  await page.goto(`file://${BUILT}`);
  // On a phone the two selects are inside the menu; they are set directly.
  await page.evaluate((chosen) => {
    for (const [id, value] of [
      ['select-language', 'en'],
      ['select-theme', chosen],
    ]) {
      const select = document.getElementById(id) as HTMLSelectElement;
      select.value = value;
      select.dispatchEvent(new Event('change'));
    }
  }, theme);
  const click = (selector: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), selector);
  const found: string[] = [];
  const check = async (state: string) => {
    await page.waitForTimeout(250);
    for (const line of await lowContrast(page)) {
      found.push(`${state}: ${line}`);
    }
  };
  await check('empty');
  await click('#load-demo');
  await page.waitForFunction(() => document.documentElement.dataset.segment === 'map', undefined, { timeout: 30_000 });
  await check('map');
  await click('#map-marker-layer .marker');
  await check('map with details');
  await click('#tab-information');
  await check('list');
  await click('#row-table-body tr .row-details');
  await check('list with details');
  await click('#tab-presentation');
  await check('presentation');
  await click('#presentation-marker-layer .marker');
  await check('card');
  await click('#pres-mode-timeline');
  await check('timeline');
  await click('#pres-mode-costs');
  await check('costs');
  await click('#pres-mode-map');
  await click('#export-open');
  await check('export dialog');
  await context.close();
  return found;
}

describe('text contrast in a real layout (FR-29 as amended in v1.17.0)', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`every enabled text measures at least 7:1 on a desktop (${theme})`, async () => {
      expect(await walk(theme, 1500, 950, false)).toEqual([]);
    }, 120_000);

    test(`every enabled text measures at least 7:1 on a phone (${theme})`, async () => {
      expect(await walk(theme, 390, 844, true)).toEqual([]);
    }, 120_000);
  }

  test('the selection colour is the violet of the tokens, on the active tab and on the focus ring', async () => {
    const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
    await context.setOffline(true);
    const page = await context.newPage();
    await page.goto(`file://${BUILT}`);
    await page.selectOption('#select-theme', 'light');
    const seen = await page.evaluate(() => {
      const tab = document.querySelector<HTMLElement>(".segment-tab[aria-selected='true']")!;
      tab.focus();
      return { fill: getComputedStyle(tab).backgroundColor, text: getComputedStyle(tab).color };
    });
    expect(seen).toEqual({ fill: 'rgb(90, 58, 168)', text: 'rgb(255, 255, 255)' });
    await context.close();
  });
});
