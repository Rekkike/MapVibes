// @vitest-environment node
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { chromium, devices, type Browser, type BrowserContextOptions, type Page } from 'playwright';
import { pressExport, setSelect } from './chrome';

// The Presentation sort control on the phone (FR-70, fix-forward of v2.2.1):
// two symptoms of one report, both in the compact class's Presentation
// segment at 390 by 844, in both themes. (1) The order dropdown in the
// toolbar's sideways-scrolling row was drawn too small for its content --
// its label cut off, the Swedish and English label widths differing: the
// stylesheet left the select's box to the browser's intrinsic sizing inside
// the nowrap row. The rule now gives the control its content's width
// (#pres-order min-width: max-content, its label flex: none) and the row
// keeps its own sideways scroll. (2) The control's up/down arrows rendered
// black against the dark ground: the native glyphs did not follow the theme
// because the stylesheet never declared color-scheme, so the computed scheme
// was "normal" in both themes. The theme roots now declare it (light on
// :root, dark on html[data-theme='dark']).
//
// This suite pins both at the rule level, in both languages and both themes,
// in the application and in the exported viewer: the order control's geometry
// at compact (its box holds every option's label in both languages, whatever
// option is chosen, and the row still scrolls sideways), the colour-scheme
// token on the root and on every select (the arrows' colour, in both themes),
// and the audit's coverage: every select in the chrome at compact and short
// holds its content, and the only toolbar controls whose text is clipped are
// the icon buttons, whose glyph masks take the text token. Run after the
// build (npm run build).
const BUILT = join(process.cwd(), 'dist', 'build', 'index.html');

const PHONE: BrowserContextOptions = { ...devices['iPhone 13'] };
const DESKTOP: BrowserContextOptions = { viewport: { width: 1500, height: 950 } };
const SHORT: BrowserContextOptions = { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

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

async function openApp(options: BrowserContextOptions, lang: 'en' | 'sv', theme: 'light' | 'dark'): Promise<Page> {
  const context = await browser.newContext(options);
  await context.setOffline(true);
  const page = await context.newPage();
  await page.goto(`file://${BUILT}`);
  await setSelect(page, 'select-language', lang);
  await setSelect(page, 'select-theme', theme);
  await page.evaluate(() => document.getElementById('load-demo')!.click());
  await page.waitForFunction(() => document.documentElement.dataset.segment === 'map', undefined, { timeout: 30_000 });
  await page.evaluate(() => document.getElementById('tab-presentation')!.click());
  await page.waitForFunction(() => document.documentElement.dataset.segment === 'presentation', undefined, { timeout: 30_000 });
  await page.waitForTimeout(300);
  return page;
}

async function openViewer(options: BrowserContextOptions, lang: 'en' | 'sv', theme: 'light' | 'dark'): Promise<Page> {
  const context = await browser.newContext(options);
  await context.setOffline(true);
  const page = await context.newPage();
  await page.goto(`file://${exported}`);
  await page.waitForFunction(() => document.documentElement.dataset.mode === 'viewer', undefined, { timeout: 30_000 });
  await setSelect(page, 'select-language', lang);
  await setSelect(page, 'select-theme', theme);
  await page.waitForTimeout(300);
  return page;
}

interface OrderControl {
  layout: string;
  minWidth: string;
  labelFlex: string;
  labelBox: number;
  overflowX: string;
  rowScroll: number;
  rowClient: number;
  pad: number;
  perOption: Array<{ option: string; text: number; box: number }>;
}

// The order control's rule and geometry: the computed min-width and the
// label's flex, the row's overflow, and, for every option chosen, the box's
// width against the option's label width measured in the select's own font.
function orderControl(page: Page): Promise<OrderControl> {
  return page.evaluate(() => {
    const sel = document.getElementById('pres-order') as HTMLSelectElement;
    const label = document.getElementById('pres-order-label') as HTMLElement;
    const toolbar = document.getElementById('presentation-toolbar') as HTMLElement;
    const cs = getComputedStyle(sel);
    const canvas = document.createElement('canvas').getContext('2d')!;
    canvas.font = cs.font;
    const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
    const perOption = [...sel.options].map((o) => {
      sel.value = o.value;
      sel.dispatchEvent(new Event('change'));
      return { option: o.textContent, text: canvas.measureText(o.textContent).width, box: sel.getBoundingClientRect().width };
    });
    return {
      layout: document.documentElement.dataset.layout ?? '',
      minWidth: cs.minWidth,
      labelFlex: getComputedStyle(label).flex,
      labelBox: label.getBoundingClientRect().width,
      overflowX: getComputedStyle(toolbar).overflowX,
      rowScroll: toolbar.scrollWidth,
      rowClient: toolbar.clientWidth,
      pad,
      perOption,
    };
  });
}

function expectContentWidth(control: OrderControl): void {
  expect(control.minWidth, 'the rule: the select is never narrower than its content').toBe('max-content');
  expect(control.labelFlex, 'the rule: the label does not shrink in the row').toBe('0 0 auto');
  const boxes = control.perOption.map((p) => p.box);
  for (const p of control.perOption) {
    expect(p.box, `the box holds the label "${p.option}"`).toBeGreaterThanOrEqual(p.text + control.pad - 0.5);
  }
  expect(Math.max(...boxes) - Math.min(...boxes), 'the box does not depend on the chosen label').toBeLessThanOrEqual(0.5);
  expect(control.labelBox, 'the label wraps the select whole').toBeGreaterThanOrEqual(Math.max(...boxes) - 0.5);
  expect(control.overflowX, 'the row keeps its sideways scroll').toBe('auto');
  expect(control.rowScroll, 'the row scrolls instead of shrinking its controls').toBeGreaterThan(control.rowClient);
}

// The colour-scheme token: the root's scheme and every select's, in the
// theme in force, plus the glyph grounds resolved against the tokens: the
// mask glyph of an icon button (its ::before fill) and the text glyph of a
// zoom button (its colour).
function schemes(page: Page): Promise<{ html: string; fg: string; selects: string[]; glyphMask: string; glyphText: string }> {
  return page.evaluate(() => {
    const resolve = (token: string): string => {
      const probe = document.createElement('span');
      probe.style.color = `var(${token})`;
      document.body.appendChild(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    };
    const maskButton = document.querySelector<HTMLElement>('#pres-fit, #menu-toggle');
    const textButton = document.querySelector<HTMLElement>('#pres-zoom-in, #map-zoom-in');
    return {
      html: getComputedStyle(document.documentElement).colorScheme,
      fg: resolve('--fg'),
      selects: [...document.querySelectorAll('select')].map((s) => getComputedStyle(s).colorScheme),
      glyphMask: maskButton ? getComputedStyle(maskButton, '::before').backgroundColor : 'missing',
      glyphText: textButton ? getComputedStyle(textButton).color : 'missing',
    };
  });
}

// The audit's walk at a class: every visible select in the chrome holds its
// content, and the only controls whose text is clipped are the icon buttons
// (a glyph mask over hidden text).
function auditChrome(page: Page): Promise<Array<{ id: string; kind: string; over: boolean; reason: string }>> {
  return page.evaluate(() => {
    const roots = ['#presentation-toolbar', '#pres-zoom', '#app-header', '#annotation-toolbar', '#map-toolbar', '#app-menu', '#map-more-panel'];
    const seen = new Set<Element>();
    const rows: Array<{ id: string; kind: string; over: boolean; reason: string }> = [];
    for (const rs of roots) {
      const root = document.querySelector(rs);
      if (!root || root.getBoundingClientRect().width === 0) {
        continue;
      }
      for (const e of root.querySelectorAll('button, select, input, summary')) {
        if (seen.has(e)) {
          continue;
        }
        seen.add(e);
        const r = e.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) {
          continue;
        }
        const cs = getComputedStyle(e);
        if (cs.display === 'none' || cs.visibility === 'hidden') {
          continue;
        }
        const over = e.scrollWidth > e.clientWidth + 1;
        let reason = 'content holds';
        if (over && e.tagName === 'BUTTON') {
          const before = getComputedStyle(e, '::before');
          const masked = before.maskImage !== 'none' || before.webkitMaskImage !== 'none';
          reason = cs.overflow === 'hidden' && masked ? 'icon button by design' : 'clipped';
        } else if (over) {
          reason = 'clipped';
        }
        if (e.tagName === 'SELECT' || over) {
          rows.push({ id: (e as HTMLElement).id || e.className, kind: e.tagName, over, reason });
        }
      }
    }
    return rows;
  });
}

describe('the Presentation sort control on the phone (FR-70, fix-forward of v2.2.1)', () => {
  test('the exported file is written from the demo', async () => {
    const page = await openApp(PHONE, 'en', 'light');
    await page.evaluate(() => delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker);
    await pressExport(page, 'export-open');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-go')]);
    exported = join(mkdtempSync(join(tmpdir(), 'mapvibes-sort-')), 'presentation.html');
    await download.saveAs(exported);
    await page.context().close();
  }, 90_000);

  for (const lang of ['en', 'sv'] as const) {
    test(`in the application at compact 390x844, ${lang}: the order control has its content's width and the row keeps its sideways scroll`, async () => {
      const page = await openApp(PHONE, lang, 'light');
      const control = await orderControl(page);
      expect(control.layout).toBe('compact');
      expectContentWidth(control);
      await page.context().close();
    }, 120_000);

    test(`in the exported viewer at compact 390x844, ${lang}: the order control has its content's width and the row keeps its sideways scroll`, async () => {
      const page = await openViewer(PHONE, lang, 'light');
      const control = await orderControl(page);
      expect(control.layout).toBe('compact');
      expectContentWidth(control);
      await page.context().close();
    }, 120_000);
  }

  for (const theme of ['light', 'dark'] as const) {
    test(`in the application at compact 390x844, ${theme}: the root and every select carry the theme's colour scheme, and the glyphs take the text token`, async () => {
      const page = await openApp(PHONE, 'en', theme);
      const s = await schemes(page);
      expect(s.html, 'the colour-scheme token on the root').toBe(theme);
      expect(new Set(s.selects), 'every select, the order dropdown included').toEqual(new Set([theme]));
      expect(s.glyphMask, 'the icon glyph mask is filled with the text token').toBe(s.fg);
      expect(s.glyphText, 'the zoom glyph text takes the text token').toBe(s.fg);
      await page.context().close();
    }, 120_000);

    test(`in the application on a desktop, ${theme}: the root and every select carry the theme's colour scheme`, async () => {
      const page = await openApp(DESKTOP, 'en', theme);
      const s = await schemes(page);
      expect(s.html).toBe(theme);
      expect(new Set(s.selects)).toEqual(new Set([theme]));
      await page.context().close();
    }, 120_000);

    test(`in the exported viewer at compact 390x844, ${theme}: the root and every select carry the theme's colour scheme, and the zoom glyph takes the text token`, async () => {
      const page = await openViewer(PHONE, 'en', theme);
      const s = await schemes(page);
      expect(s.html).toBe(theme);
      expect(new Set(s.selects)).toEqual(new Set([theme]));
      expect(s.glyphText).toBe(s.fg);
      await page.context().close();
    }, 120_000);
  }

  for (const [name, profile] of [
    ['compact 390x844', PHONE],
    ['short 844x390', SHORT],
  ] as Array<[string, BrowserContextOptions]>) {
    for (const lang of ['en', 'sv'] as const) {
      test(`the audit at ${name}, ${lang}, in the application: every select holds its content; only icon buttons clip their text`, async () => {
        const page = await openApp(profile, lang, 'dark');
        if (name.startsWith('short')) {
          await page.click('#menu-toggle');
          await page.waitForTimeout(300);
        }
        const rows = await auditChrome(page);
        expect(rows.length, 'the walk sees the chrome').toBeGreaterThan(0);
        for (const row of rows) {
          if (row.kind === 'SELECT') {
            expect(row.over, `the select #${row.id} holds its content`).toBe(false);
          } else {
            expect(row.reason, `the button #${row.id}`).toBe('icon button by design');
          }
        }
        const control = await orderControl(page);
        for (const p of control.perOption) {
          expect(p.box, `the order box holds "${p.option}"`).toBeGreaterThanOrEqual(p.text + control.pad - 0.5);
        }
        await page.context().close();
      }, 120_000);

      test(`the audit at ${name}, ${lang}, in the exported viewer: every select holds its content`, async () => {
        const page = await openViewer(profile, lang, 'dark');
        const rows = await auditChrome(page);
        expect(rows.length, 'the walk sees the chrome').toBeGreaterThan(0);
        for (const row of rows) {
          if (row.kind === 'SELECT') {
            expect(row.over, `the select #${row.id} holds its content`).toBe(false);
          } else {
            expect(row.reason, `the button #${row.id}`).toBe('icon button by design');
          }
        }
        await page.context().close();
      }, 120_000);
    }
  }
});
