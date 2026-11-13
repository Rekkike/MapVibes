// @vitest-environment node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

// The design pin suite of the layout (FR-29 and FR-81, v2.0.0; the compact
// rows raised in v2.1.0): the built page, offline, on the full-test demo, at
// the 22 probe viewports of docs/redesign/probes.md. The floors of the
// medium, wide, and extra wide probes are the figures that the direction of
// record promised (probes.md, section 4), less a tenth of a point for
// rounding. The compact probes hold the promised figures of probes.md's
// compact rows under the new phone chrome (one 48-pixel header row and one
// 56-pixel bottom bar in the Map segment); the short probes keep the present
// chrome until the owner rules the rail's contents. Run after the build.
const BUILT = join(process.cwd(), 'dist', 'build', 'index.html');

type Layout = 'compact' | 'short' | 'medium' | 'wide' | 'xwide';

// Width, height, class, the Map segment's floor, the Presentation segment's
// floor (per cent of the viewport), and the header's height.
const PROBES: Array<[number, number, Layout, number, number, number]> = [
  [2560, 1080, 'xwide', 75.2, 95.9, 44],
  [3440, 1440, 'xwide', 81.4, 96.9, 44],
  [1920, 1080, 'xwide', 68.3, 95.9, 44],
  [2560, 1440, 'xwide', 76.0, 96.9, 44],
  [3840, 2160, 'xwide', 83.9, 98.0, 44],
  [1920, 1200, 'xwide', 68.6, 96.3, 44],
  [2560, 1600, 'xwide', 76.3, 97.3, 44],
  [1366, 768, 'wide', 91.2, 94.3, 44],
  [1440, 900, 'wide', 76.1, 95.1, 44],
  [960, 1080, 'medium', 95.9, 95.9, 44],
  [1280, 720, 'wide', 90.7, 93.9, 44],
  [390, 844, 'compact', 87.7, 94.3, 48],
  [320, 568, 'compact', 81.7, 91.5, 48],
  [393, 852, 'compact', 87.8, 94.4, 48],
  [430, 932, 'compact', 88.8, 94.8, 48],
  [412, 915, 'compact', 88.6, 94.8, 48],
  [360, 800, 'compact', 87.0, 94.0, 48],
  [844, 390, 'short', 53.4, 65.4, 53],
  [768, 1024, 'medium', 95.7, 95.7, 44],
  [1024, 768, 'medium', 94.3, 94.3, 44],
  [820, 1180, 'medium', 96.3, 96.3, 44],
  [1180, 820, 'medium', 94.6, 94.6, 44],
];

const TOLERANCE = 0.1;

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

async function openDemo(width: number, height: number, tablet = false): Promise<Page> {
  const touch = tablet || width < 768 || height < 500;
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: tablet || (touch && width < 768) });
  await context.setOffline(true);
  const page = await context.newPage();
  await page.goto(`file://${BUILT}`);
  await page.evaluate(() => {
    const select = document.getElementById('select-language') as HTMLSelectElement;
    select.value = 'en';
    select.dispatchEvent(new Event('change'));
    document.getElementById('load-demo')!.click();
  });
  await page.waitForFunction(() => document.documentElement.dataset.segment === 'map', undefined, { timeout: 30_000 });
  await page.waitForTimeout(300);
  return page;
}

interface Measure {
  layout: string | undefined;
  share: number;
  header: number;
  page: [number, number];
  viewport: [number, number];
}

function measure(page: Page): Promise<Measure> {
  return page.evaluate(() => {
    const segment = document.documentElement.dataset.segment;
    const stage = document.querySelector(segment === 'map' ? '#map-stage' : '#presentation-stage')!.getBoundingClientRect();
    const vw = innerWidth;
    const vh = innerHeight;
    const visible = Math.max(0, Math.min(stage.right, vw) - Math.max(stage.left, 0)) * Math.max(0, Math.min(stage.bottom, vh) - Math.max(stage.top, 0));
    return {
      layout: document.documentElement.dataset.layout,
      share: (100 * visible) / (vw * vh),
      header: Math.round(document.getElementById('app-header')!.getBoundingClientRect().height),
      page: [document.documentElement.scrollWidth, document.documentElement.scrollHeight] as [number, number],
      viewport: [vw, vh] as [number, number],
    };
  });
}

function box(page: Page, selector: string): Promise<{ x: number; y: number; width: number; height: number }> {
  return page.$eval(selector, (e) => {
    const b = e.getBoundingClientRect();
    return { x: b.left, y: b.top, width: b.width, height: b.height };
  });
}

describe('the stage share, the bar, and the page at the 22 probe viewports (FR-29, FR-81)', () => {
  test.each(PROBES)(
    '%i x %i (%s): the Map segment holds its floor without overflow or page scroll, and the Presentation segment holds its own',
    async (width, height, layout, mapFloor, presentationFloor, header) => {
      const page = await openDemo(width, height);
      const map = await measure(page);
      expect(map.layout).toBe(layout);
      expect(map.header, 'the header').toBe(header);
      // No sideways overflow and no page scroll in the Map segment.
      expect(map.page).toEqual(map.viewport);
      expect(map.share, 'the Map segment').toBeGreaterThanOrEqual(mapFloor - TOLERANCE);
      await page.evaluate(() => document.getElementById('tab-presentation')!.click());
      await page.waitForTimeout(300);
      const presentation = await measure(page);
      expect(presentation.page[0], 'no sideways overflow').toBe(presentation.viewport[0]);
      expect(presentation.share, 'the Presentation segment').toBeGreaterThanOrEqual(presentationFloor - TOLERANCE);
      if (layout === 'medium' || layout === 'wide' || layout === 'xwide') {
        // The promised band of the wider classes.
        expect(presentation.share).toBeGreaterThanOrEqual(93.9 - TOLERANCE);
        expect(presentation.share).toBeLessThanOrEqual(98.1);
      }
      await page.context().close();
    },
    60_000,
  );
});

describe('the gap between 897 and 1,266 pixels is closed (FR-58 as amended)', () => {
  test.each([897, 930, 960, 1000, 1024, 1100, 1180, 1199, 1200, 1266])(
    'at %i pixels of width the page neither overflows sideways nor scrolls, and the bar is one row',
    async (width) => {
      const page = await openDemo(width, 800);
      const map = await measure(page);
      expect(map.page).toEqual(map.viewport);
      expect(map.header).toBe(44);
      expect(map.layout).toBe(width < 1200 ? 'medium' : 'wide');
      await page.context().close();
    },
    60_000,
  );
});

describe('the phone chrome of the compact class (FR-71 as amended in v2.1.0)', () => {
  test('the header is one 48-pixel row with the segments in the bar, and the Map segment has one 56-pixel bottom bar with the strip, the toggles, and "more"', async () => {
    for (const [width, height] of [
      [390, 844],
      [320, 568],
    ]) {
      const page = await openDemo(width, height);
      const header = await box(page, '#app-header');
      expect(header.height, `${width} header`).toBe(48);
      // The segments share the bar's row; the brand is not on it.
      const nav = await box(page, '#segment-nav');
      expect(nav.y).toBeGreaterThanOrEqual(header.y);
      expect(nav.y + nav.height).toBeLessThanOrEqual(header.y + header.height);
      expect(await page.isVisible('#app-title')).toBe(false);
      // The bottom bar: 56 pixels, below the stage, holding the tools, the
      // overlay toggles, and "more".
      const bar = await box(page, '#annotation-toolbar');
      expect(bar.height, `${width} bar`).toBe(56);
      const stage = await box(page, '#map-stage');
      expect(bar.y).toBeGreaterThanOrEqual(stage.y + stage.height - 1);
      expect(await page.isVisible('#annotation-tools')).toBe(true);
      expect(await page.isVisible('#map-toggles')).toBe(true);
      expect(await page.isVisible('#map-more')).toBe(true);
      // The zoom group floats on the stage above the bar, not in it.
      const zoom = await box(page, '#map-zoom');
      expect(zoom.y + zoom.height).toBeLessThanOrEqual(bar.y);
      // The Presentation segment has no bottom bar: the bar alone is the
      // header's 48 pixels.
      await page.evaluate(() => document.getElementById('tab-presentation')!.click());
      await page.waitForTimeout(300);
      const presentation = await measure(page);
      expect(presentation.header).toBe(48);
      expect(await page.isVisible('#annotation-toolbar')).toBe(false);
      const pstage = await box(page, '#presentation-stage');
      expect(pstage.y + pstage.height).toBeLessThanOrEqual(height);
      await page.context().close();
    }
  }, 120_000);
});

describe('the bar (FR-81)', () => {
  test('it is one row of 44 pixels from 768 to 3,840 pixels, with its controls in order on that row', async () => {
    for (const width of [768, 900, 1200, 1440, 1920, 3840]) {
      const page = await openDemo(width, 900);
      const header = await box(page, '#app-header');
      expect(header.height, `${width}`).toBe(44);
      const order = ['#app-title', '#segment-nav', '#bar-export', '#work-save', '#menu-toggle'];
      const boxes = await Promise.all(order.map((s) => box(page, s)));
      for (let i = 0; i < boxes.length; i++) {
        // Each control lies on the bar's row, right of the one before it.
        expect(boxes[i].y, `${width} ${order[i]}`).toBeGreaterThanOrEqual(header.y);
        expect(boxes[i].y + boxes[i].height, `${width} ${order[i]}`).toBeLessThanOrEqual(header.y + header.height);
        expect(boxes[i].x + boxes[i].width, `${width} ${order[i]}`).toBeLessThanOrEqual(width);
        if (i > 0) {
          expect(boxes[i].x, `${width} ${order[i]}`).toBeGreaterThanOrEqual(boxes[i - 1].x + boxes[i - 1].width);
        }
      }
      await page.context().close();
    }
  }, 120_000);

  test('the offline pill says the device is offline; the menu holds the language, the theme, and Open work', async () => {
    const page = await openDemo(1440, 900);
    expect(await page.isVisible('#bar-offline')).toBe(true);
    expect(await page.textContent('#bar-offline')).toBe('Offline');
    expect(await page.isVisible('#select-language')).toBe(false);
    await page.click('#menu-toggle');
    for (const id of ['select-language', 'select-theme', 'work-open', 'demo-reset']) {
      expect(await page.isVisible(`#${id}`), id).toBe(true);
    }
    // Escape closes the menu and returns the focus to its control.
    await page.keyboard.press('Escape');
    expect(await page.isVisible('#select-language')).toBe(false);
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('menu-toggle');
    await page.context().close();
  }, 60_000);

  test('Export is a menu of the three exports; chosen from the Map segment, it shows the Presentation segment and opens the dialog', async () => {
    const page = await openDemo(1440, 900);
    expect(await page.isVisible('#export-open')).toBe(false);
    await page.click('#bar-export');
    expect(await page.$$eval('#bar-export-menu button', (buttons) => buttons.map((b) => b.id))).toEqual(['export-open', 'pdf-open', 'pptx-open']);
    await page.click('#export-open');
    expect(await page.evaluate(() => document.documentElement.dataset.segment)).toBe('presentation');
    expect(await page.isVisible('#export-panel')).toBe(true);
    expect(await page.isVisible('#bar-export-menu')).toBe(false);
    await page.context().close();
  }, 60_000);
});

describe('the tool strip, the floating controls, and the legend (FR-6, FR-81)', () => {
  test('the strip floats at the upper left of the stage, zoom and fit at its lower right, and the rare actions sit behind "more"', async () => {
    const page = await openDemo(1440, 900);
    const stage = await box(page, '#map-stage');
    const strip = await box(page, '#annotation-tools');
    expect(strip.x - stage.x).toBeLessThanOrEqual(16);
    expect(strip.y - stage.y).toBeLessThanOrEqual(16);
    expect(strip.height).toBeGreaterThan(strip.width * 3);
    const zoom = await box(page, '#map-zoom');
    expect(stage.x + stage.width - (zoom.x + zoom.width)).toBeLessThanOrEqual(16);
    expect(stage.y + stage.height - (zoom.y + zoom.height)).toBeLessThanOrEqual(16);
    expect(await page.isVisible('#map-load')).toBe(false);
    await page.click('#map-more');
    for (const id of ['map-load', 'fetch-open', 'map-reset', 'marker-remove']) {
      expect(await page.isVisible(`#${id}`), id).toBe(true);
    }
    await page.keyboard.press('Escape');
    // The options of a drawing tool show beside the strip while it is chosen.
    expect(await page.isVisible('#annotation-colour')).toBe(false);
    await page.click(".annotation-tool[data-tool='rectangle']");
    expect(await page.isVisible('#annotation-colour')).toBe(true);
    await page.context().close();
  }, 60_000);

  test('the legend is open by default from 768 pixels, on the stage at its lower left, folds by its control, and does not move with the panned view', async () => {
    // Open by default in the medium class and above (the owner's ruling), in
    // both segments; folded in the compact class, where it is an overlay.
    for (const [width, height] of [
      [768, 1024],
      [1440, 900],
    ]) {
      const wide = await openDemo(width, height);
      expect(await wide.isVisible('#map-legend'), `${width}`).toBe(true);
      expect(await wide.getAttribute('#toggle-map-legend', 'aria-expanded')).toBe('true');
      await wide.evaluate(() => document.getElementById('tab-presentation')!.click());
      await wide.waitForTimeout(300);
      expect(await wide.isVisible('#presentation-legend'), `${width} presentation`).toBe(true);
      await wide.context().close();
    }
    const phone = await openDemo(390, 844);
    expect(await phone.isVisible('#map-legend')).toBe(false);
    await phone.context().close();
    const page = await openDemo(1440, 900);
    const stage = await box(page, '#map-stage');
    const control = await box(page, '#toggle-map-legend');
    expect(control.x - stage.x).toBeLessThanOrEqual(16);
    expect(stage.y + stage.height - (control.y + control.height)).toBeLessThanOrEqual(16);
    // Its control folds it and unfolds it again.
    await page.click('#toggle-map-legend');
    expect(await page.isVisible('#map-legend')).toBe(false);
    await page.click('#toggle-map-legend');
    const before = await box(page, '#map-legend');
    expect(before.x).toBeGreaterThanOrEqual(stage.x);
    expect(before.y + before.height).toBeLessThanOrEqual(stage.y + stage.height);
    // Chrome: outside the panned content, and still after a pan.
    expect(await page.evaluate(() => document.getElementById('map-content')!.contains(document.getElementById('map-legend')))).toBe(false);
    const transform = () => page.$eval('#map-content', (e) => (e as HTMLElement).style.transform);
    const start = await transform();
    await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2);
    await page.mouse.down();
    await page.mouse.move(stage.x + stage.width / 2 + 120, stage.y + stage.height / 2 + 60, { steps: 6 });
    await page.mouse.up();
    expect(await transform()).not.toBe(start);
    expect(await box(page, '#map-legend')).toEqual(before);
    await page.context().close();
  }, 60_000);

  test('in the Presentation segment the view switch floats at the top centre, "In view" is open, and the visibility list is closed until asked for', async () => {
    const page = await openDemo(1440, 900);
    await page.click('#tab-presentation');
    await page.waitForTimeout(300);
    const stage = await box(page, '#presentation-stage');
    const toolbar = await box(page, '#presentation-toolbar');
    expect(Math.abs(toolbar.x + toolbar.width / 2 - (stage.x + stage.width / 2))).toBeLessThanOrEqual(2);
    expect(toolbar.y - stage.y).toBeLessThanOrEqual(16);
    expect(await page.isVisible('#visibility-list')).toBe(false);
    // The stage's floating chrome is visible by default where there is room
    // (the owner's principle).
    expect(await page.isVisible('#presentation-glance-list')).toBe(true);
    await page.click('#toggle-visibility');
    expect(await page.isVisible('#visibility-list')).toBe(true);
    // Open, it lies over the stage: the stage keeps its size.
    expect(await box(page, '#presentation-stage')).toEqual(stage);
    await page.context().close();
  }, 60_000);
});

describe('the panels across the classes (FR-81)', () => {
  test('the items panel: a drawer below 1,200 pixels, a rail of 44 from 1,200, docked at 288 and open from 1,400', async () => {
    // Medium: folded to its control; opened, it lies over the stage.
    let page = await openDemo(1024, 768);
    const stage = await box(page, '#map-stage');
    expect(stage.width).toBe(1024);
    expect(await page.isVisible('#placement-list')).toBe(false);
    await page.click('#toggle-items');
    expect(await page.isVisible('#placement-list')).toBe(true);
    expect((await box(page, '#placement-area')).width).toBe(288);
    expect((await box(page, '#map-stage')).width).toBe(1024);
    await page.context().close();
    // Wide, below the docking width: the rail.
    page = await openDemo(1280, 720);
    expect((await box(page, '#placement-area')).width).toBe(44);
    expect((await box(page, '#map-stage')).width).toBe(1236);
    await page.click('#toggle-items');
    expect((await box(page, '#placement-area')).width).toBe(288);
    expect((await box(page, '#map-stage')).width).toBe(992);
    await page.context().close();
    // From the docking width: docked and open by default; the user folds it.
    page = await openDemo(1440, 900);
    expect((await box(page, '#placement-area')).width).toBe(288);
    expect(await page.isVisible('#placement-list')).toBe(true);
    expect((await box(page, '#map-stage')).width).toBe(1152);
    await page.click('#toggle-items');
    expect((await box(page, '#placement-area')).width).toBe(44);
    expect((await box(page, '#map-stage')).width).toBe(1396);
    await page.context().close();
  }, 120_000);

  test('"In view": floating and unfolded from 768 pixels, folded to its heading on request, docked at 264 from 1,920', async () => {
    for (const [width, height] of [
      [768, 1024],
      [1024, 768],
      [1280, 720],
    ]) {
      const open = await openDemo(width, height);
      expect(await open.isVisible('#map-glance-list'), `${width}`).toBe(true);
      await open.evaluate(() => document.getElementById('tab-presentation')!.click());
      await open.waitForTimeout(300);
      expect(await open.isVisible('#presentation-glance-list'), `${width} presentation`).toBe(true);
      await open.context().close();
    }
    let page = await openDemo(1280, 720);
    await page.click('#toggle-map-glance');
    expect(await page.isVisible('#map-glance-list')).toBe(false);
    expect((await box(page, '#map-glance')).height).toBeLessThanOrEqual(48);
    await page.context().close();
    page = await openDemo(1440, 900);
    expect(await page.isVisible('#map-glance-list')).toBe(true);
    // Floating: it takes nothing from the stage.
    expect((await box(page, '#map-stage')).width).toBe(1152);
    await page.context().close();
    page = await openDemo(1920, 1080);
    expect((await box(page, '#map-glance')).width).toBe(264);
    expect((await box(page, '#map-stage')).width).toBe(1920 - 288 - 264);
    await page.context().close();
  }, 120_000);

  test('the two named extremes: at 3,440 by 1,440 nothing centres and no chrome stretches; at 1,280 by 720 the list is its rail, "In view" floats unfolded, and the page does not scroll', async () => {
    let page = await openDemo(3440, 1440);
    const items = await box(page, '#placement-area');
    const glance = await box(page, '#map-glance');
    const stage = await box(page, '#map-stage');
    expect([items.x, items.width]).toEqual([0, 288]);
    expect([glance.x + glance.width, glance.width]).toEqual([3440, 264]);
    expect([stage.x, stage.width, stage.height]).toEqual([288, 3440 - 288 - 264, 1440 - 44]);
    expect((await box(page, '#app-header')).width).toBe(3440);
    expect((await box(page, '#annotation-tools')).width).toBeLessThanOrEqual(48);
    await page.context().close();
    page = await openDemo(1280, 720);
    const m = await measure(page);
    expect(m.page).toEqual([1280, 720]);
    expect((await box(page, '#placement-area')).width).toBe(44);
    expect(await page.isVisible('#map-glance-list')).toBe(true);
    // Floating: it takes nothing from the stage.
    expect((await box(page, '#map-stage')).width).toBe(1236);
    await page.context().close();
  }, 120_000);

  test("the stage's floating chrome, open by default, never overlaps: in both segments and views, both languages, both pointers", async () => {
    const MAP = ['#map-glance', '#map-legend', '#toggle-map-legend', '#annotation-tools', '#map-zoom', '#placement-area'];
    const PRESENTATION = ['#presentation-glance', '#presentation-legend', '#toggle-legend', '#presentation-toolbar', '#pres-zoom', '#visibility-area'];
    const overlaps = (page: Page, ids: string[]) =>
      page.evaluate((list) => {
        const shown = list
          .map((id) => [id, document.querySelector(id)] as const)
          .filter(([, e]) => e && e.getBoundingClientRect().width > 0 && getComputedStyle(e).display !== 'none');
        const out: string[] = [];
        for (let i = 0; i < shown.length; i++) {
          for (let j = i + 1; j < shown.length; j++) {
            const a = shown[i][1]!.getBoundingClientRect();
            const b = shown[j][1]!.getBoundingClientRect();
            const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (x > 0.5 && y > 0.5) {
              out.push(`${shown[i][0]} over ${shown[j][0]}`);
            }
          }
        }
        return out;
      }, ids);
    const found: string[] = [];
    for (const coarse of [false, true]) {
      for (const lang of ['en', 'sv']) {
        for (const [width, height] of [
          [768, 1024],
          [900, 700],
          [1024, 768],
          [1200, 600],
          [1280, 720],
          [1440, 900],
        ]) {
          const context = await browser.newContext({ viewport: { width, height }, hasTouch: coarse, isMobile: coarse });
          await context.setOffline(true);
          const page = await context.newPage();
          await page.goto(`file://${BUILT}`);
          await page.evaluate((chosen) => {
            const select = document.getElementById('select-language') as HTMLSelectElement;
            select.value = chosen;
            select.dispatchEvent(new Event('change'));
            document.getElementById('load-demo')!.click();
          }, lang);
          await page.waitForFunction(() => document.documentElement.dataset.segment === 'map', undefined, { timeout: 30_000 });
          await page.waitForTimeout(200);
          const at = `${coarse ? 'coarse' : 'fine'} ${lang} ${width}x${height}`;
          found.push(...(await overlaps(page, MAP)).map((o) => `${at} map: ${o}`));
          await page.evaluate(() => document.getElementById('tab-presentation')!.click());
          for (const view of ['map', 'timeline', 'costs']) {
            await page.evaluate((v) => document.getElementById(`pres-mode-${v}`)!.click(), view);
            await page.waitForTimeout(200);
            found.push(...(await overlaps(page, PRESENTATION)).map((o) => `${at} presentation ${view}: ${o}`));
          }
          await context.close();
        }
      }
    }
    expect(found).toEqual([]);
  }, 300_000);

  test('a portrait tablet is in the medium class: the bar and the stage, with 44-pixel targets under a coarse pointer', async () => {
    const page = await openDemo(768, 1024, true);
    expect(await page.evaluate(() => document.documentElement.dataset.layout)).toBe('medium');
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    expect((await box(page, '#app-header')).height).toBe(44);
    for (const selector of [".annotation-tool[data-tool='select']", '#map-more', '#toggle-items', '#toggle-map-legend', '#map-fit']) {
      const b = await box(page, selector);
      expect(Math.min(b.width, b.height), selector).toBeGreaterThanOrEqual(44);
    }
    await page.context().close();
  }, 60_000);
});
