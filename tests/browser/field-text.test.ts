// @vitest-environment node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

// The text of every field follows the theme (FR-29, fix-forward of v2.2.1):
// a field's value is drawn in the theme's text token and its placeholder in
// the muted token, whatever the field's kind. Before the fix-forward the
// phone card's wrapping field (a textarea) took the browser's fixed black,
// unreadable on the dark field ground; the contrast suite of v1.17.0 could
// not see it, as a field's value is not a text node. This suite reads the
// computed colours of the fields themselves: on the card in the Map segment
// (the reported case) and in the list, and one field of each kind elsewhere
// (a text input, a select, a textarea), at a phone and a desktop size, in
// both themes. Run after the build (npm run build).
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

type Seen = { selector: string; color: string; fill: string; placeholder: string | null; ratio: number };

// The computed colours of the first field matching each selector, with the
// two tokens resolved to the same notation, and the value's contrast on the
// field's own ground.
function fields(page: Page, selectors: string[]): Promise<{ fg: string; muted: string; seen: Seen[] }> {
  return page.evaluate((list) => {
    const resolve = (token: string): string => {
      const probe = document.createElement('span');
      probe.style.color = `var(${token})`;
      document.body.appendChild(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    };
    const parse = (c: string): number[] => /rgba?\(([^)]+)\)/.exec(c)![1].split(',').map(Number);
    const lum = (c: number[]): number => {
      const f = (v: number): number => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const ground = (e: Element): number[] => {
      for (let n: Element | null = e; n; n = n.parentElement) {
        const bg = parse(getComputedStyle(n).backgroundColor);
        if (bg.length < 4 || bg[3] >= 0.99) {
          return bg;
        }
      }
      return [255, 255, 255];
    };
    return {
      fg: resolve('--fg'),
      muted: resolve('--muted'),
      seen: list.map((selector) => {
        const e = document.querySelector<HTMLInputElement>(selector);
        if (!e) {
          return { selector, color: 'missing', fill: 'missing', placeholder: null, ratio: 0 };
        }
        const cs = getComputedStyle(e);
        const [x, y] = [lum(parse(cs.color)), lum(ground(e))].sort((p, q) => q - p);
        return {
          selector,
          color: cs.color,
          fill: cs.webkitTextFillColor,
          placeholder: 'placeholder' in e && e.placeholder ? getComputedStyle(e, '::placeholder').color : null,
          ratio: Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100,
        };
      }),
    };
  }, selectors);
}

async function open(theme: 'light' | 'dark', phone: boolean): Promise<Page> {
  const context = await browser.newContext(
    phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1500, height: 950 } },
  );
  await context.setOffline(true);
  const page = await context.newPage();
  await page.goto(`file://${BUILT}`);
  // On a phone the two selects are inside the menu; they are set directly.
  await page.evaluate((chosen) => {
    for (const [id, value] of [
      ['select-language', 'sv'],
      ['select-theme', chosen],
    ]) {
      const select = document.getElementById(id) as HTMLSelectElement;
      select.value = value;
      select.dispatchEvent(new Event('change'));
    }
  }, theme);
  await page.evaluate(() => document.getElementById('load-demo')!.click());
  await page.waitForFunction(() => document.documentElement.dataset.segment === 'map', undefined, { timeout: 30_000 });
  return page;
}

function expectThemed(result: { fg: string; muted: string; seen: Seen[] }): void {
  for (const s of result.seen) {
    expect({ selector: s.selector, color: s.color, fill: s.fill }).toEqual({ selector: s.selector, color: result.fg, fill: result.fg });
    expect(s.ratio, s.selector).toBeGreaterThanOrEqual(7);
    if (s.placeholder !== null) {
      expect({ selector: s.selector, placeholder: s.placeholder }).toEqual({ selector: s.selector, placeholder: result.muted });
    }
  }
}

describe('the text of every field follows the theme (FR-29, fix-forward of v2.2.1)', () => {
  for (const theme of ['dark', 'light'] as const) {
    test(`the card opened from the Map segment on a phone, and a field of each kind (${theme})`, async () => {
      const page = await open(theme, true);
      await page.locator('#marker-layer .marker').first().tap();
      await page.waitForSelector('#details-panel textarea.cell-input', { state: 'visible' });
      // The card's fields: the wrapping text fields, a field from a
      // vocabulary (an input), the status (a select), and the comment box.
      const card = await fields(page, [
        '#details-panel textarea.cell-input',
        '#details-panel input.cell-input',
        '#details-panel select.cell-input',
        '#details-panel .details-comment-input',
      ]);
      expect(card.seen.map((s) => s.color)).not.toContain('missing');
      expectThemed(card);
      // Elsewhere: a text input with a placeholder in a column panel, and a
      // select in the Presentation segment.
      expectThemed(await fields(page, ['#area-new', '#pres-order', '#select-filter-kind']));
      await page.context().close();
    }, 120_000);

    test(`the list's cell editors and the card beside them on a desktop (${theme})`, async () => {
      const page = await open(theme, false);
      await page.evaluate(() => document.getElementById('tab-information')!.click());
      await page.waitForSelector('#row-table-body .cell-input');
      await page.evaluate(() => document.querySelector<HTMLElement>('#row-table-body tr .row-details')!.click());
      await page.waitForSelector('#details-panel .details-comment-input', { state: 'visible' });
      const result = await fields(page, [
        '#row-table-body input.cell-input',
        '#row-table-body input.cell-input.combobox',
        '#row-table-body select.cell-input',
        '#details-panel input.cell-input',
        '#details-panel .details-comment-input',
        '#new-column-name',
      ]);
      expect(result.seen.map((s) => s.color)).not.toContain('missing');
      expectThemed(result);
      await page.context().close();
    }, 120_000);
  }
});
