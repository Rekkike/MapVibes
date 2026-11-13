// @vitest-environment node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { chromium, devices, type Browser, type Page } from 'playwright';
import { setSelect } from './chrome';

// The narrow application layout (FR-71 to FR-74) in a real layout, headless
// Chromium with phone and tablet profiles, offline, on the full-test demo:
// the header collapsed into a menu, the stage filling what the header and
// one toolbar row leave, no horizontal overflow, every editing control at
// least 44 pixels, the overlays and the menu, tap-to-place, the details
// sheet, the Presentation segment in the viewer's patterns, and pan and
// pinch on the stage. The profiles include those on which the first design
// broke (the iPhone SE in portrait and landscape, phones in landscape); the
// measured stage heights are printed. Emulation is not a device: real iOS
// Safari is part of the owner's acceptance test. Run after the build.
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

const PROFILES = [
  ['iPhone 13 portrait', devices['iPhone 13'], 'portrait'],
  ['iPhone SE portrait', devices['iPhone SE'], 'portrait'],
  ['iPhone 13 landscape', devices['iPhone 13 landscape'], 'landscape'],
  ['iPhone SE landscape', devices['iPhone SE landscape'], 'landscape'],
  ['Pixel 7 landscape', devices['Pixel 7 landscape'], 'landscape'],
  // A small tablet in portrait, 744 pixels wide: the widest device of the
  // compact class since v2.0.0 (FR-58 as amended); the 810-pixel tablet of
  // earlier versions is in the medium class now.
  ['small tablet portrait', { ...devices['iPad (gen 7)'], viewport: { width: 744, height: 1133 } }, 'tablet'],
] as const;

type Profile = (typeof PROFILES)[number][1];

// The application with the demo, in English, chosen through the menu.
async function openDemo(profile: Profile): Promise<{ page: Page; errors: string[] }> {
  const context = await browser.newContext({ ...profile });
  await context.setOffline(true);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`file://${BUILT}`);
  await page.tap('#menu-toggle');
  await page.waitForTimeout(250);
  await setSelect(page, 'select-language', 'en');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  await page.tap('#load-demo');
  await page.waitForFunction(() => document.querySelectorAll('#marker-layer .marker').length === 11);
  await page.waitForTimeout(300);
  return { page, errors };
}

async function box(page: Page, selector: string) {
  return (await page.locator(selector).first().boundingBox())!;
}

// Every element that sticks out of the viewport sideways, the map inside the
// stage and the content of a sideways-scrolling toolbar excepted.
async function overflowing(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (el.closest('.stage') && !el.classList.contains('stage')) {
        continue;
      }
      if (
        el.closest('#map-toolbar, #annotation-toolbar, #presentation-toolbar, #list-scroll') &&
        !['map-toolbar', 'annotation-toolbar', 'presentation-toolbar', 'list-scroll'].includes(el.id)
      ) {
        continue;
      }
      if (el.getClientRects().length === 0 || getComputedStyle(el).visibility === 'hidden') {
        continue;
      }
      const r = el.getBoundingClientRect();
      if (r.left < -0.5 || r.right > innerWidth + 0.5) {
        out.push(`${el.tagName.toLowerCase()}#${el.id}.${el.className}`);
      }
    }
    return out;
  });
}

// The editing controls in view that measure under 44 pixels on their
// smallest side (the stage's content and the schedule views' lines, whose
// controls are the 24-pixel chip row and plot of the 48-pixel line, aside).
async function smallControls(page: Page): Promise<string[]> {
  // The enlarged touch handles (FR-47 as amended in v1.15.0) are admitted
  // here too: their 44-pixel hit areas are measured like the other controls,
  // outside the stage's exclusion.
  const handles = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.annotation-handle')]
      .filter((e) => e.getClientRects().length > 0 && !e.closest('[inert]'))
      .filter((e) => Math.min(e.getBoundingClientRect().width, e.getBoundingClientRect().height) < 43.5)
      .map((e) => e.className),
  );
  const controls = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('button, select, input, summary, textarea')]
      .filter((e) => {
        const s = getComputedStyle(e);
        const r = e.getBoundingClientRect();
        return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0 && !e.closest('[inert], .stage, #presentation-timeline');
      })
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return Math.min(r.width, r.height) < 43.5;
      })
      .map((e) => e.id || e.className || e.tagName),
  );
  return [...controls, ...handles];
}

async function state(page: Page, id: string): Promise<string> {
  return page.$eval(`#${id}`, (e) => `${getComputedStyle(e).visibility}/${(e as HTMLElement).dataset.state}`);
}

// In the short class whatever the rail's height cannot hold sits behind the
// rail's own menu control (the owner's ruling, v2.1.0): open it first.
async function tapControl(page: Page, id: string): Promise<void> {
  if (!(await page.isVisible(`#${id}`))) {
    await page.tap('#menu-toggle');
    await page.waitForTimeout(250);
  }
  await page.tap(`#${id}`);
}

// A point of the stage from which two fingers, the given distance either
// side of it, both start on the map itself: in the Map segment a finger on
// a marker drags the marker and takes no part in a pinch (FR-36, v1.2.0).
async function freeCentre(page: Page, selector: string, d: number): Promise<{ x: number; y: number }> {
  const b = await box(page, selector);
  const found = await page.evaluate(
    ({ b, d }) => {
      const clear = (x: number, y: number) => {
        const e = document.elementFromPoint(x, y);
        // Not a marker, a handle, or an annotation's shape, which the
        // Select tool would move.
        return (
          !!e &&
          !e.closest('.marker, .annotation-handle') &&
          !(e.closest('.annotation-layer') && !e.classList.contains('annotation-layer')) &&
          !!e.closest('.stage')
        );
      };
      // A touch has an area, and the browser adjusts it to an interactive
      // element nearby: the whole of a finger's width must be clear.
      const free = (x: number, y: number) => [-24, 0, 24].every((dx) => [-24, 0, 24].every((dy) => clear(x + dx, y + dy)));
      for (let fy = 0.15; fy <= 0.9; fy += 0.05) {
        for (let fx = 0.2; fx <= 0.8; fx += 0.02) {
          const [x, y] = [b.x + b.width * fx, b.y + b.height * fy];
          if (free(x - d, y) && free(x + d, y)) {
            return { x, y };
          }
        }
      }
      return null;
    },
    { b, d },
  );
  if (!found) {
    throw new Error('no free point for a pinch on the stage');
  }
  return found;
}

async function pinch(page: Page, selector: string, from: number, to: number): Promise<void> {
  const { x: cx, y: cy } = await freeCentre(page, selector, from);
  const cdp = await page.context().newCDPSession(page);
  const fingers = (d: number) => [
    { x: cx - d, y: cy, id: 0 },
    { x: cx + d, y: cy, id: 1 },
  ];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(from) });
  const step = (to - from) / 8;
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers(from + step * i) });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(300);
}

async function drag(page: Page, selector: string, dx: number, dy: number): Promise<void> {
  const { x, y } = await freeCentre(page, selector, 0);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 0 }] });
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * i) / 8, y: y + (dy * i) / 8, id: 0 }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(300);
}

const scaleOf = (page: Page, id: string) => page.evaluate((id) => Number(/scale\(([\d.]+)\)/.exec(document.getElementById(id)!.style.transform)![1]), id);

describe.each(PROFILES)('the narrow application on the %s (FR-71 to FR-74)', (name, profile, kind) => {
  test('the header is a menu, the stage fills what the header and the toolbars leave, nothing overflows, every control reaches 44 pixels', async () => {
    const { page, errors } = await openDemo(profile);
    const v = page.viewportSize()!;
    // The compact and short classes (FR-58 as amended in v2.1.0: the viewer
    // crossed to them too, so the old 896-pixel viewer query is retired).
    expect(await page.evaluate(() => matchMedia('(max-width: 47.999rem), (max-height: 31.249rem)').matches)).toBe(true);
    const header = await box(page, '#app-header');
    if (kind !== 'landscape') {
      // The compact class's phone chrome: one 48-pixel row with the
      // segments in the bar (v2.1.0).
      expect(header.height).toBe(48);
    } else {
      // The short class's side rail: the header is the 56-pixel rail, the
      // full height of the viewport (v2.1.0, the owner's ruling).
      expect(header.width).toBe(56);
      expect(header.height).toBe(v.height);
    }
    // No header control covers another: a tap lands on the control under it.
    expect(
      await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('#app-header > button:not([hidden]), #segment-nav button')]
          .filter((e) => e.getClientRects().length > 0)
          .filter((e) => {
            const r = e.getBoundingClientRect();
            const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return !(hit && (hit === e || e.contains(hit)));
          })
          .map((e) => e.id),
      ),
    ).toEqual([]);
    const heights: Record<string, number> = { header: Math.round(header.height) };
    for (const [tab, stage] of [
      ['tab-information', null],
      ['tab-map', 'map-stage'],
      ['tab-presentation', 'presentation-stage'],
    ] as const) {
      await page.tap(`#${tab}`);
      await page.waitForTimeout(400);
      expect(await overflowing(page), tab).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth), tab).toBe(v.width);
      expect(await smallControls(page), tab).toEqual([]);
      // No segment tab's label is cut, the selected (bold) one included.
      expect(await page.$$eval('.segment-tab', (ts) => ts.filter((t) => t.scrollWidth > t.clientWidth).map((t) => t.textContent)), tab).toEqual([]);
      if (stage) {
        const s = await box(page, `#${stage}`);
        heights[stage] = Math.round(s.height);
        // The stage reaches the bottom of the viewport, less the margins —
        // less the 56-pixel bottom bar in the compact class's Map segment.
        if (kind !== 'landscape' && stage === 'map-stage') {
          expect(v.height - (s.y + s.height), stage).toBe(56);
        } else {
          expect(v.height - (s.y + s.height), stage).toBeLessThanOrEqual(20);
        }
        // The Presentation segment's chrome floats on the stage: no tool row
        // takes height (v2.1.0). In the short class the toolbar is gone
        // altogether; the switch rides in the rail.
        if (stage === 'presentation-stage' && kind !== 'landscape') {
          expect((await box(page, '#presentation-toolbar')).height).toBeLessThanOrEqual(52);
        }
      }
    }
    console.log(`stage heights, ${name} (${v.width} × ${v.height}): ${JSON.stringify(heights)}`);
    expect(errors).toEqual([]);
    await page.context().close();
  }, 60_000);

  test('the menu and the overlays open one at a time and close by their toggle, Escape, and a tap outside', async () => {
    const { page } = await openDemo(profile);
    await page.tap('#tab-map');
    await page.waitForTimeout(300);
    await page.tap('#menu-toggle');
    await page.waitForTimeout(300);
    expect(await state(page, 'app-menu')).toBe('visible/open');
    const menu = await box(page, '#app-menu');
    const v = page.viewportSize()!;
    expect(menu.y + menu.height).toBeLessThanOrEqual(v.height + 0.5);
    // v2.1.0: the three exports ride in the Menu overlay in the compact and
    // short classes, where the bar has no Export. In the short class the
    // rail's menu also holds the toggles and the order's control (the
    // owner's ruling).
    const menuItems = await page.$$eval('#app-menu > *', (e) => e.map((x) => x.id || x.querySelector('select')!.id));
    if (kind === 'landscape') {
      // The toggles and the order's control sit behind the rail's menu
      // control, and whatever the rail's height cannot hold joins them
      // there (the owner's ruling): the zoom group and the tool strip,
      // in that priority order, depending on the viewport's height.
      expect(menuItems.slice(0, 12)).toEqual([
        'demo-badge',
        'demo-reset',
        'work-controls',
        'select-language',
        'select-theme',
        'export-open',
        'pdf-open',
        'pptx-open',
        'map-toggles',
        'presentation-toggles',
        'viewer-toggles',
        'pres-order-label',
      ]);
      for (const extra of menuItems.slice(12)) {
        expect(['map-zoom', 'annotation-tools']).toContain(extra);
      }
    } else {
      // v2.1.0: the three exports ride in the Menu overlay in the compact
      // class, where the bar has no Export.
      expect(menuItems).toEqual(['demo-badge', 'demo-reset', 'work-controls', 'select-language', 'select-theme', 'export-open', 'pdf-open', 'pptx-open']);
    }
    // Another overlay closes the menu.
    await tapControl(page, 'toggle-items');
    await page.waitForTimeout(300);
    expect([await state(page, 'placement-area'), await state(page, 'app-menu')]).toEqual(['visible/open', 'hidden/closed']);
    // In the short class the toggle sits in the rail's menu, so closing the
    // overlay by its toggle would reopen the menu instead: Escape closes it.
    if (kind === 'landscape') {
      await page.keyboard.press('Escape');
    } else {
      await tapControl(page, 'toggle-items');
    }
    await page.waitForTimeout(300);
    expect(await state(page, 'placement-area')).toBe('hidden/closed');
    await tapControl(page, 'toggle-map-legend');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    expect(await state(page, 'map-legend')).toBe('hidden/closed');
    // In the short class the toggle sits behind the rail's menu control, so
    // the focus return cannot land on it there.
    if (kind !== 'landscape') {
      expect(await page.evaluate(() => document.activeElement?.id)).toBe('toggle-map-legend');
    }
    // A tap outside, on a clear point of the stage (the compact and short
    // classes' bar carries no brand to tap on).
    await tapControl(page, 'toggle-map-glance');
    await page.waitForTimeout(300);
    const spot = await freeCentre(page, '#map-stage', 0);
    await page.touchscreen.tap(spot.x, spot.y);
    await page.waitForTimeout(300);
    expect(await state(page, 'map-glance')).toBe('hidden/closed');
    // "In view": choosing an entry closes it and opens the details sheet.
    await tapControl(page, 'toggle-map-glance');
    await page.waitForTimeout(300);
    expect(await page.locator('#map-glance-list .glance-entry').count()).toBeGreaterThan(0);
    await page.locator('#map-glance-list .glance-entry').first().tap();
    await page.waitForTimeout(300);
    expect(await state(page, 'map-glance')).toBe('hidden/closed');
    expect(await page.$eval('#details-panel', (e) => e.classList.contains('hidden'))).toBe(false);
    await page.context().close();
  }, 60_000);

  test('tap-to-place places an unplaced item; the details sheet stays within the viewport and shows every value in full', async () => {
    const { page } = await openDemo(profile);
    await page.tap('#tab-map');
    await tapControl(page, 'toggle-items');
    await page.waitForTimeout(300);
    const action = page.locator('#placement-list .placement-place');
    expect(await action.count()).toBe(1);
    await action.tap();
    await page.waitForTimeout(300);
    expect(await state(page, 'placement-area')).toBe('hidden/closed');
    expect(await page.$eval('#place-banner', (e) => e.classList.contains('hidden'))).toBe(false);
    const s = await box(page, '#map-stage');
    await page.touchscreen.tap(s.x + s.width * 0.75, s.y + s.height * 0.6);
    await page.waitForTimeout(300);
    expect(await page.locator('#marker-layer .marker').count()).toBe(12);
    expect(await page.$eval('#place-banner', (e) => e.classList.contains('hidden'))).toBe(true);
    // Every item's details, opened from the item list.
    const v = page.viewportSize()!;
    const items = await page.locator('#placement-list .placement-item').count();
    for (let i = 0; i < items; i++) {
      // An open sheet (the placed item's, then each item's) is closed by its
      // own button before the toolbar is used again: on a short screen it
      // covers the toolbar.
      if (await page.$eval('#details-panel', (e) => !e.classList.contains('hidden'))) {
        await page.tap('#details-panel .details-close');
      }
      await tapControl(page, 'toggle-items');
      await page.waitForTimeout(250);
      await page
        .locator('#placement-list .placement-item')
        .nth(i)
        .tap({ position: { x: 20, y: 20 } });
      await page.waitForTimeout(250);
      const sheet = await box(page, '#details-panel');
      expect(sheet.x).toBeGreaterThanOrEqual(0);
      expect(sheet.x + sheet.width).toBeLessThanOrEqual(v.width + 0.5);
      expect(sheet.y).toBeGreaterThanOrEqual(0);
      expect(sheet.y + sheet.height).toBeLessThanOrEqual(v.height + 0.5);
      const cut = await page.$$eval('#details-panel .cell-input', (els) =>
        els
          .filter((x) => x.scrollWidth > x.clientWidth + 1 || (x.tagName === 'TEXTAREA' && x.scrollHeight > x.clientHeight + 1))
          .map((x) => (x as HTMLElement).dataset.header),
      );
      expect(cut, `item ${i + 1}`).toEqual([]);
    }
    await page.context().close();
  }, 90_000);

  test('pan and pinch work on the map stage; the page does not move', async () => {
    const { page } = await openDemo(profile);
    await page.tap('#tab-map');
    await tapControl(page, 'map-fit');
    await page.waitForTimeout(400);
    const fitted = await scaleOf(page, 'map-content');
    await pinch(page, '#map-stage', 30, 110);
    const pinched = await scaleOf(page, 'map-content');
    expect(pinched).toBeGreaterThan(fitted * 1.5);
    const before = await page.$eval('#map-content', (e) => (e as HTMLElement).style.transform);
    // Back towards the origin, within the view's bounds at this zoom.
    await drag(page, '#map-stage', 40, 30);
    expect(await page.$eval('#map-content', (e) => (e as HTMLElement).style.transform)).not.toBe(before);
    expect(await scaleOf(page, 'map-content')).toBeCloseTo(pinched, 6);
    expect(await page.evaluate(() => [scrollX, scrollY])).toEqual([0, 0]);
    await page.context().close();
  }, 60_000);

  test("the Presentation segment in the viewer's patterns: one toolbar row led by the switch, the order, and the toggles; the card docks; 48-pixel lines", async () => {
    const { page } = await openDemo(profile);
    await page.tap('#tab-presentation');
    await page.waitForTimeout(400);
    // The view switch, the order, and the toggles lead the floating toolbar
    // pill; zoom and fit float at the stage's lower right; the exports ride
    // in the Menu overlay (v2.1.0: the phone's bar has no Export).
    const xs = await page.$$eval(['#pres-mode', '#pres-order-label', '#presentation-toggles', '#viewer-toggles', '#pres-zoom'].join(','), (els) =>
      els.map((e) => [e.id, Math.round(e.getBoundingClientRect().x)] as [string, number]),
    );
    const at = Object.fromEntries(xs);
    // In the short class there is no floating toolbar pill: the view switch
    // rides in the rail and the rest sit behind the rail's menu control.
    if (kind !== 'landscape') {
      expect(at['pres-mode']).toBeLessThan(at['pres-order-label']);
      expect(at['pres-order-label']).toBeLessThan(at['presentation-toggles']);
      expect(at['presentation-toggles']).toBeLessThan(at['viewer-toggles']);
      // Zoom and fit float at the stage's lower right, below the pill.
      const pill = await box(page, '#presentation-toolbar');
      const zoom = await box(page, '#pres-zoom');
      expect(zoom.y).toBeGreaterThanOrEqual(pill.y + pill.height - 1);
    }
    expect(await page.isVisible('#export-open')).toBe(false);
    // The Legend toggle is reached by a sideways swipe where it does not fit.
    await page.locator('#toggle-legend').scrollIntoViewIfNeeded();
    await tapControl(page, 'toggle-legend');
    await page.waitForTimeout(300);
    expect(await state(page, 'presentation-legend')).toBe('visible/open');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    // The card docks at the bottom of the stage.
    await tapControl(page, 'pres-fit');
    await page.waitForTimeout(400);
    await tapControl(page, 'toggle-glance');
    await page.waitForTimeout(300);
    await page.locator('#presentation-glance-list .glance-entry').first().tap();
    await page.waitForTimeout(400);
    const v = page.viewportSize()!;
    const card = await box(page, '#presentation-card');
    expect(await page.getAttribute('#presentation-card', 'data-dock')).toBe('bottom');
    expect(card.y + card.height).toBeLessThanOrEqual(v.height + 0.5);
    expect(card.x).toBeGreaterThanOrEqual(0);
    expect(card.x + card.width).toBeLessThanOrEqual(v.width + 0.5);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    // The timeline: 48-pixel lines, the chip row over the plot (FR-58 as
    // noted in v1.14.0); a line's chip opens the docked card.
    await tapControl(page, 'pres-mode-timeline');
    await page.waitForTimeout(400);
    const lines = await page.$$eval('#presentation-timeline .timeline-line', (ls) => ls.map((l) => l.getBoundingClientRect().height));
    expect(lines.length).toBe(12);
    for (const h of lines) {
      expect(h).toBe(48);
    }
    await page.locator('#presentation-timeline .timeline-chip').nth(1).tap();
    await page.waitForTimeout(400);
    expect(await page.getAttribute('#presentation-card', 'data-dock')).toBe('bottom');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(v.width);
    await page.context().close();
  }, 60_000);
});
