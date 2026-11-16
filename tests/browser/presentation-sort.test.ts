// @vitest-environment node
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { chromium, devices, type Browser, type BrowserContextOptions, type Page } from 'playwright';
import { pressExport, setSelect } from './chrome';

// The Presentation sort control (FR-70): the v2.2.1 fix-forward gave it its
// content's width and the theme's colour scheme; v2.2.2's ruling adds the
// sorting symbol. At the compact and short classes the typical sorting
// symbol (up-down arrows, no direction hint) replaces the select's visible
// text -- the select stays the native control, its menu opening as today,
// the active order legible as the menu's checked item. At the wider classes
// the active order's name remains beside the glyph. This suite pins the
// ruled geometry at compact and short in both languages, in the
// application and in the exported viewer (the label is the 44-pixel symbol
// button, the glyph draws ink, the select still changes the order, the row
// keeps its sideways scroll), the name beside the glyph at the wider
// classes, the colour-scheme token in both themes (phone and desktop, app
// and viewer), and the audit's coverage at compact and short. Run after the
// build (npm run build).
const BUILT = join(process.cwd(), 'dist', 'build', 'index.html');

const PHONE: BrowserContextOptions = { ...devices['iPhone 13'] };
const DESKTOP: BrowserContextOptions = { viewport: { width: 1500, height: 950 } };
const WIDE: BrowserContextOptions = { viewport: { width: 1440, height: 900 } };
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
  labelBox: number;
  labelPos: string;
  labelDisplay: string;
  glyphMask: boolean;
  glyphBg: string;
  glyphWidth: string;
  selColor: string;
  selAppearance: string;
  selMinWidth: string;
  selPos: string;
  orderTextVisible: boolean;
  overflowX: string;
  rowScroll: number;
  rowClient: number;
  pad: number;
  perOption: Array<{ option: string; value: string; text: number; box: number }>;
}

// The order control's ruled state: the label's box and position, the glyph
// pseudo's mask and ink, the select's own face, the row's overflow, and, at
// the wider classes, every option's label against the box measured in the
// select's own font.
function orderControl(page: Page): Promise<OrderControl> {
  return page.evaluate(() => {
    const sel = document.getElementById('pres-order') as HTMLSelectElement;
    const label = document.getElementById('pres-order-label') as HTMLElement;
    const orderText = document.getElementById('pres-order-text') as HTMLElement;
    const toolbar = document.getElementById('presentation-toolbar') as HTMLElement;
    const cs = getComputedStyle(label);
    const bef = getComputedStyle(label, '::before');
    const scs = getComputedStyle(sel);
    const canvas = document.createElement('canvas').getContext('2d')!;
    canvas.font = scs.font;
    const pad = parseFloat(scs.paddingLeft) + parseFloat(scs.paddingRight) + parseFloat(scs.borderLeftWidth) + parseFloat(scs.borderRightWidth);
    const perOption = [...sel.options].map((o) => {
      sel.value = o.value;
      sel.dispatchEvent(new Event('change'));
      return { option: o.textContent, value: o.value, text: canvas.measureText(o.textContent).width, box: sel.getBoundingClientRect().width };
    });
    return {
      layout: document.documentElement.dataset.layout ?? '',
      labelBox: label.getBoundingClientRect().width,
      labelPos: cs.position,
      labelDisplay: cs.display,
      glyphMask: bef.maskImage !== 'none' || bef.webkitMaskImage !== 'none',
      glyphBg: bef.backgroundColor,
      glyphWidth: bef.width,
      selColor: scs.color,
      selAppearance: scs.appearance,
      selMinWidth: scs.minWidth,
      selPos: scs.position,
      orderTextVisible: orderText.getBoundingClientRect().width > 1,
      overflowX: getComputedStyle(toolbar).overflowX,
      rowScroll: toolbar.scrollWidth,
      rowClient: toolbar.clientWidth,
      pad,
      perOption,
    };
  });
}

// The ruled narrow design: the symbol alone is the control's face, the
// glyph draws ink, the select still opens and changes the order, the row
// keeps its sideways scroll.
async function expectSymbol(page: Page, control: OrderControl, where: string): Promise<void> {
  expect(control.labelPos, `${where}: the symbol's label is the glyph's anchor`).not.toBe('static');
  expect(control.labelDisplay, `${where}: the label is the icon button`).toBe('grid');
  expect(control.labelBox, `${where}: the label is the 2.75rem symbol button`).toBeCloseTo(44, 0);
  expect(control.glyphMask, `${where}: the sorting glyph's mask is set`).toBe(true);
  expect(control.glyphWidth, `${where}: the glyph is drawn at 1.125rem`).toBe('18px');
  expect(control.glyphBg, `${where}: the glyph takes the text token`).not.toBe('rgba(0, 0, 0, 0)');
  expect(control.selAppearance, `${where}: the select's face is replaced`).toBe('none');
  expect(control.selColor, `${where}: the select's visible text is replaced by the symbol`).toBe('rgba(0, 0, 0, 0)');
  expect(control.selMinWidth, `${where}: the box is the symbol's, not the text's`).toBe('0px');
  expect(control.selPos, `${where}: the select fills the label, still the control`).toBe('absolute');
  expect(control.orderTextVisible, `${where}: the order's name stays announced, not shown`).toBe(false);
  expect(control.overflowX, `${where}: the row keeps its sideways scroll`).toBe('auto');
  expect(control.rowScroll, `${where}: the row scrolls instead of shrinking its controls`).toBeGreaterThan(control.rowClient);
  for (const p of control.perOption) {
    await page.selectOption('#pres-order', p.value);
    expect(await page.$eval('#pres-order', (s) => (s as HTMLSelectElement).value), `${where}: the menu's item "${p.option}" still selects`).toBe(p.value);
  }
}

// The ruled wide design: the active order's name remains beside the glyph.
function expectNameBesideGlyph(control: OrderControl, where: string): void {
  expect(control.labelDisplay, `${where}: the label lays out text, glyph, and select`).toBe('flex');
  expect(control.glyphMask, `${where}: the sorting glyph draws beside the name`).toBe(true);
  expect(control.glyphBg, `${where}: the glyph takes the text token`).not.toBe('rgba(0, 0, 0, 0)');
  expect(control.orderTextVisible, `${where}: the "Order" label is shown`).toBe(true);
  expect(control.selAppearance, `${where}: the native select keeps its arrow`).toBe('auto');
  expect(control.selColor, `${where}: the select's text is shown`).not.toBe('rgba(0, 0, 0, 0)');
  expect(control.selMinWidth, `${where}: the select keeps its content's width`).toBe('max-content');
  for (const p of control.perOption) {
    expect(p.box, `${where}: the box holds the label "${p.option}"`).toBeGreaterThanOrEqual(p.text + control.pad - 0.5);
  }
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
// content -- except the order select at the narrow classes, where the ruled
// symbol replaces its text -- and the only controls whose text is clipped
// are the icon buttons (a glyph mask over hidden text).
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
          reason = e.id === 'pres-order' ? 'the ruled symbol replaces the text at the narrow classes' : 'clipped';
        }
        if (e.tagName === 'SELECT' || over) {
          rows.push({ id: (e as HTMLElement).id || e.className, kind: e.tagName, over, reason });
        }
      }
    }
    return rows;
  });
}

describe('the Presentation sort control (FR-70, v2.2.1 content width and colour scheme, v2.2.2 the ruled sorting symbol)', () => {
  test('the exported file is written from the demo', async () => {
    const page = await openApp(DESKTOP, 'en', 'light');
    await page.evaluate(() => delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker);
    await pressExport(page, 'export-open');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-go')]);
    exported = join(mkdtempSync(join(tmpdir(), 'mapvibes-sort-')), 'presentation.html');
    await download.saveAs(exported);
    await page.context().close();
  }, 90_000);

  for (const lang of ['en', 'sv'] as const) {
    test(`in the application at compact 390x844, ${lang}: the order control is the sorting symbol and the row keeps its sideways scroll`, async () => {
      const page = await openApp(PHONE, lang, 'light');
      const control = await orderControl(page);
      expect(control.layout).toBe('compact');
      await expectSymbol(page, control, `app compact ${lang}`);
      await page.context().close();
    }, 120_000);

    test(`in the exported viewer at compact 390x844, ${lang}: the order control is the sorting symbol`, async () => {
      const page = await openViewer(PHONE, lang, 'light');
      const control = await orderControl(page);
      expect(control.layout).toBe('compact');
      await expectSymbol(page, control, `viewer compact ${lang}`);
      await page.context().close();
    }, 120_000);

    test(`in the application at short 844x390, ${lang}: the order control in the rail's menu is the sorting symbol`, async () => {
      const page = await openApp(SHORT, lang, 'dark');
      await page.click('#menu-toggle');
      await page.waitForTimeout(300);
      const control = await orderControl(page);
      expect(control.layout).toBe('short');
      expect(control.labelPos).not.toBe('static');
      expect(control.glyphMask).toBe(true);
      expect(control.selAppearance).toBe('none');
      expect(control.selColor).toBe('rgba(0, 0, 0, 0)');
      await page.context().close();
    }, 120_000);

    test(`in the application at wide 1440x900, ${lang}: the active order's name remains beside the glyph`, async () => {
      const page = await openApp(WIDE, lang, 'light');
      const control = await orderControl(page);
      expect(control.layout).toBe('wide');
      expectNameBesideGlyph(control, `app wide ${lang}`);
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
        const layout = await page.evaluate(() => document.documentElement.dataset.layout);
        expect(rows.length, 'the walk sees the chrome').toBeGreaterThan(0);
        for (const row of rows) {
          if (row.kind === 'SELECT') {
            if (row.id === 'pres-order' && (layout === 'compact' || layout === 'short')) {
              continue; // the ruled sorting symbol replaces the text at the narrow classes
            }
            expect(row.over, `the select #${row.id} holds its content`).toBe(false);
          } else {
            expect(row.reason, `the button #${row.id}`).toBe('icon button by design');
          }
        }
        await page.context().close();
      }, 120_000);

      test(`the audit at ${name}, ${lang}, in the exported viewer: every select holds its content`, async () => {
        const page = await openViewer(profile, lang, 'dark');
        const rows = await auditChrome(page);
        const layout = await page.evaluate(() => document.documentElement.dataset.layout);
        expect(rows.length, 'the walk sees the chrome').toBeGreaterThan(0);
        for (const row of rows) {
          if (row.kind === 'SELECT') {
            if (row.id === 'pres-order' && (layout === 'compact' || layout === 'short')) {
              continue; // the ruled sorting symbol replaces the text at the narrow classes
            }
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
