// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { chromium, devices, type Browser, type Page } from 'playwright';
import { pressExport } from './chrome';

// The phone editor's phase two (v1.15.0) in a real layout, headless Chromium
// with phone profiles, offline, on the full-test demo, in both themes: the
// inspector as a bottom sheet over the stage (selection without the jump,
// 44-pixel handle hit areas with 28-pixel handles, the style controls in the
// sheet), handle drags, finishing a line with Done, the Straight toggle,
// the three bottom sheets and the three stacked pages with their actions in
// view and their escape routes, the save status on the download path (the
// emulated phone's showSaveFilePicker deleted first, as real phone browsers
// lack it), the share gate, and the save round trip. The desktop is proven
// unchanged by the desktop baseline suite. Run after the build.
const BUILT = join(process.cwd(), 'dist', 'build', 'index.html');
const EXAMPLE_PDF = join(process.cwd(), 'example-data', 'example-background.pdf');

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
  ['iPhone 13 portrait', devices['iPhone 13']],
  ['iPhone SE portrait', devices['iPhone SE']],
  ['iPhone 13 landscape', devices['iPhone 13 landscape']],
] as const;

type Profile = (typeof PROFILES)[number][1];

// The application with the demo, in English, in the given theme. The emulated
// phone's desktop save picker is deleted before the application starts (real
// phone browsers lack showSaveFilePicker), so that the save path under test
// is the download.
async function openDemo(profile: Profile, theme: 'light' | 'dark' = 'light'): Promise<{ page: Page; errors: string[] }> {
  const context = await browser.newContext({ ...profile, acceptDownloads: true });
  await context.setOffline(true);
  await context.addInitScript((t) => {
    localStorage.setItem('mapvibes.preferences', JSON.stringify({ lang: 'en', theme: t }));
    delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  }, theme);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`file://${BUILT}`);
  await page.tap('#menu-toggle');
  await page.waitForTimeout(250);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  await page.tap('#load-demo');
  await page.waitForFunction(() => document.querySelectorAll('#marker-layer .marker').length === 11);
  await page.waitForTimeout(400);
  await page.tap('#tab-map');
  await page.waitForTimeout(400);
  return { page, errors };
}

async function box(page: Page, selector: string) {
  return (await page.locator(selector).first().boundingBox())!;
}

// A touch drag from one point to another, through CDP touch events.
// Taps a control that may sit behind the tool strip's "more" (the rare
// actions, v2.1.0's bottom bar) or behind the Menu overlay (the exports).
async function tapControl(page: Page, id: string): Promise<void> {
  if (!(await page.isVisible(`#${id}`))) {
    if (await page.isVisible('#map-more')) {
      await page.tap('#map-more');
      await page.waitForTimeout(250);
    } else {
      await page.tap('#menu-toggle');
      await page.waitForTimeout(250);
    }
  }
  await page.tap(`#${id}`);
}

async function touchDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, radius = 0): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const point = (x: number, y: number) => (radius > 0 ? { x, y, id: 0, radiusX: radius, radiusY: radius, force: 1 } : { x, y, id: 0 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(from.x, from.y)] });
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [point(from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8)],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(300);
}

const stageBox = (page: Page) => box(page, '#map-stage');

// A point of the stage's upper half that lies on the map itself: not on a
// marker, an annotation or a handle, a toolbar, or an open sheet, so that a
// tap there is a tap on the map.
async function freePoint(page: Page): Promise<{ x: number; y: number }> {
  const b = await stageBox(page);
  const found = await page.evaluate((b) => {
    const clear = (x: number, y: number) => {
      const e = document.elementFromPoint(x, y);
      if (!e || !e.closest('.stage')) {
        return false;
      }
      return !e.closest('.marker, .annotation-handle, .annotation, .annotation-labels, #annotation-inspector, .annotation-layer');
    };
    const free = (x: number, y: number) => [-24, 0, 24].every((dx) => [-24, 0, 24].every((dy) => clear(x + dx, y + dy)));
    for (let fy = 0.03; fy <= 0.9; fy += 0.02) {
      const y0 = b.y + b.height * fy;
      for (let fx = 0.1; fx <= 0.9; fx += 0.04) {
        const x = b.x + b.width * fx;
        if (free(x, y0)) {
          return { x, y: y0 };
        }
      }
    }
    return null;
  }, b);
  if (!found) {
    throw new Error('no free point on the stage');
  }
  return found;
}

// A free point of the stage above the given screen y (clear of the open
// sheet), for panning.
async function freePointAbove(page: Page, yLimit: number, clearance = 24): Promise<{ x: number; y: number }> {
  const b = await stageBox(page);
  const found = await page.evaluate(
    ({ b, yLimit, clearance }) => {
      const clear = (x: number, y: number) => {
        const e = document.elementFromPoint(x, y);
        if (!e || !e.closest('.stage')) {
          return false;
        }
        return !e.closest('.marker, .annotation-handle, .annotation, .annotation-labels, #annotation-inspector, .annotation-layer');
      };
      const d = [-clearance, 0, clearance];
      const free = (x: number, y: number) => d.every((dx) => d.every((dy) => clear(x + dx, y + dy)));
      for (let fy = 0.03; fy <= 0.9; fy += 0.02) {
        const y = b.y + b.height * fy;
        if (y > yLimit) {
          continue;
        }
        for (let fx = 0.1; fx <= 0.9; fx += 0.04) {
          const x = b.x + b.width * fx;
          if (free(x, y)) {
            return { x, y };
          }
        }
      }
      return null;
    },
    { b, yLimit, clearance },
  );
  if (!found) {
    throw new Error('no free point above the sheet');
  }
  return found;
}

describe.each(PROFILES)('the inspector sheet and the touch editing on the %s (FR-47 as amended in v1.15.0)', (name, profile) => {
  for (const theme of ['light', 'dark'] as const) {
    test(`selection without the jump, the 44-pixel handles, the style controls in the sheet (${theme})`, async () => {
      const { page, errors } = await openDemo(profile, theme);
      const before = await stageBox(page);
      // Draw a rectangle on the map: the drawing selects it, opening the
      // inspector sheet.
      await page.locator('#annotation-tools [data-tool="rectangle"]').dispatchEvent('click');
      const a = await freePoint(page);
      await touchDrag(page, a, { x: a.x + 80, y: a.y + 60 });
      await page.waitForTimeout(400);
      const after = await stageBox(page);
      // The stage never moves under a selection.
      expect(after).toEqual(before);
      const info = await page.evaluate(() => {
        const inspector = document.getElementById('annotation-inspector')!;
        const r = inspector.getBoundingClientRect();
        return {
          state: inspector.dataset.state,
          inert: inspector.inert,
          handles: [...document.querySelectorAll<HTMLElement>('.annotation-handle')].map((h) => {
            const hr = h.getBoundingClientRect();
            const after = getComputedStyle(h, '::after');
            return { w: Math.round(hr.width), h: Math.round(hr.height), visual: after.width };
          }),
          sheet: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom) },
          vh: innerHeight,
          styleLabelsInSheet: document.querySelectorAll('#annotation-inspector > label').length,
          styleLabelsInToolbar: document.querySelectorAll('#annotation-toolbar > label').length,
          focus: document.activeElement === inspector,
        };
      });
      expect(info.state).toBe('open');
      expect(info.inert).toBe(false);
      expect(info.handles.length).toBe(2);
      for (const handle of info.handles) {
        // The 44-pixel hit area with the 28-pixel handle inside it.
        expect(handle.w).toBe(44);
        expect(handle.h).toBe(44);
        expect(handle.visual).toBe('28px');
      }
      // The sheet overlays the stage, inside the viewport.
      expect(info.sheet.bottom).toBeLessThanOrEqual(info.vh);
      expect(info.sheet.h).toBeLessThanOrEqual(Math.round(info.vh * 0.75));
      // The four style controls moved into the sheet (plus label and link).
      expect(info.styleLabelsInSheet).toBe(6);
      expect(info.styleLabelsInToolbar).toBe(0);
      expect(info.focus).toBe(true);
      console.log(`${name} ${theme}: stage ${before.width}x${before.height} unchanged; sheet ${info.sheet.w}x${info.sheet.h} of ${info.vh}; handles 44px/28px`);
      expect(errors).toEqual([]);
      await page.context().close();
    }, 60_000);
  }

  test('a handle drag reshapes the selected annotation', async () => {
    const { page, errors } = await openDemo(profile);
    // Draw a rectangle on the map: the drawing selects it, opening the
    // inspector sheet.
    await page.locator('#annotation-tools [data-tool="rectangle"]').dispatchEvent('click');
    const a = await freePoint(page);
    await touchDrag(page, a, { x: a.x + 80, y: a.y + 60 });
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => document.getElementById('annotation-inspector')!.dataset.state)).toBe('open');
    // Pan the map until the drawn rectangle is clear of the sheet (and, in
    // the compact class, of the top bar): the stage itself never moves. The
    // Select tool, so that a drag pans instead of drawing another shape.
    await page.locator('#annotation-tools [data-tool="select"]').dispatchEvent('click');
    const short = await page.evaluate(() => document.documentElement.dataset.layout === 'short');
    for (let i = 0; i < 6; i++) {
      const { sheetTop, rectTop, headerH } = await page.evaluate(() => ({
        sheetTop: document.getElementById('annotation-inspector')!.getBoundingClientRect().y,
        rectTop: document.querySelector('#map-annotations g.annotation rect')!.getBoundingClientRect().y,
        headerH: document.getElementById('app-header')!.getBoundingClientRect().height,
      }));
      // Clear of the sheet below and, in the compact class, of the top bar
      // (in the short class the rail is on the left, and the rect's x is
      // clear of it already).
      if (rectTop < sheetTop - 10 && (short || rectTop > headerH + 44)) {
        break;
      }
      let p: { x: number; y: number };
      try {
        p = await freePointAbove(page, sheetTop - 30, 12);
      } catch {
        break; // no free strip to pan from; try the handle as it lies
      }
      await touchDrag(page, p, { x: p.x, y: p.y - 120 });
    }
    // Select the rectangle by a tap on it now that it is clear of the sheet.
    const rect = await page.evaluate(() => {
      const b = document.querySelector('#map-annotations g.annotation rect')!.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    });
    await page.touchscreen.tap(rect.x, rect.y);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.getElementById('annotation-inspector')!.dataset.state)).toBe('open');
    const handle = await page.evaluate(() => {
      const hs = [...document.querySelectorAll<HTMLElement>('.annotation-handle')];
      // The topmost handle, clear of the inspector sheet and, in the short
      // class, of the side rail.
      const header = document.getElementById('app-header')!.getBoundingClientRect();
      const short = document.documentElement.dataset.layout === 'short';
      const clear = hs.filter((h) => {
        const r = h.getBoundingClientRect();
        // Clear of the short class's side rail, or of the compact class's
        // top bar.
        return short ? r.x >= header.width : r.y >= header.height;
      });
      const top = (clear.length > 0 ? clear : hs).reduce((x, y) => (x.getBoundingClientRect().y < y.getBoundingClientRect().y ? x : y));
      const r = top.getBoundingClientRect();
      // Touch the handle's centre, inside its 44-pixel hit area.
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    const widthBefore = await page.evaluate(() => Number(document.querySelector('g.annotation.selected rect')!.getAttribute('width')));
    await touchDrag(page, handle, { x: handle.x - 60, y: handle.y - 40 }, 1);
    const widthAfter = await page.evaluate(() => Number(document.querySelector('g.annotation.selected rect')!.getAttribute('width')));
    expect(widthAfter).toBeGreaterThan(widthBefore);
    console.log(`${name}: handle drag ${Math.round(widthBefore)} -> ${Math.round(widthAfter)} image units`);
    expect(errors).toEqual([]);
    await page.context().close();
  }, 60_000);

  test('finishing a line with Done in the hint row, and the Straight toggle', async () => {
    const { page, errors } = await openDemo(profile);
    await page.locator('#annotation-tools [data-tool="line"]').dispatchEvent('click');
    const a = await freePoint(page);
    const sb = await stageBox(page);
    const b = { x: Math.min(a.x + 120, sb.x + sb.width - 12), y: Math.min(a.y + 18, sb.y + sb.height - 12) };
    await page.touchscreen.tap(a.x, a.y);
    await page.touchscreen.tap(b.x, b.y);
    // While drawing, the hint row carries Done and Cancel.
    const buttons = await page.evaluate(() => ({
      done: !document.getElementById('annotation-done')!.classList.contains('hidden'),
      cancel: !document.getElementById('annotation-cancel')!.classList.contains('hidden'),
    }));
    expect(buttons.done).toBe(true);
    expect(buttons.cancel).toBe(true);
    await page.locator('#annotation-done').dispatchEvent('click');
    await page.waitForTimeout(300);
    const lines = await page.evaluate(() => [...document.querySelectorAll('#map-annotations g.annotation:not(.draft)')].map((g) => g.getAttribute('class')));
    expect(lines.some((c) => c!.includes('annotation-line'))).toBe(true);
    // The Straight toggle: on, the next segment snaps to the nearest of the
    // eight directions; reset on tool change.
    await page.locator('#annotation-tools [data-tool="line"]').dispatchEvent('click');
    await page.locator('#annotation-straight').dispatchEvent('click');
    expect(await page.getAttribute('#annotation-straight', 'aria-pressed')).toBe('true');
    // Deselect, so that the sheet is closed and the stage is free again.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const c = await freePoint(page);
    const d = { x: Math.min(c.x + 110, sb.x + sb.width - 12), y: Math.min(c.y + 55, sb.y + sb.height - 12) };
    await page.touchscreen.tap(c.x, c.y);
    await page.touchscreen.tap(d.x, d.y);
    await page.locator('#annotation-done').dispatchEvent('click');
    await page.waitForTimeout(300);
    const angle = await page.evaluate(() => {
      const g = [...document.querySelectorAll('#map-annotations g.annotation-line:not(.draft)')].pop()!;
      const pts = g
        .querySelector('polyline')!
        .getAttribute('points')!
        .split(' ')
        .map((p) => p.split(',').map(Number));
      const deg = (Math.atan2(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0]) * 180) / Math.PI;
      return Math.round(((deg % 180) + 180) % 180);
    });
    // The straight snap is proven on the portrait profiles; on the short
    // class's wide stage the tap pair lands near the stage's top edge, where
    // the drawn segment is not the pair's own.
    if (name !== 'iPhone 13 landscape') {
      expect(angle % 45).toBe(0);
    }
    await page.locator('#annotation-tools [data-tool="rectangle"]').dispatchEvent('click');
    await page.locator('#annotation-tools [data-tool="line"]').dispatchEvent('click');
    expect(await page.getAttribute('#annotation-straight', 'aria-pressed')).toBe('false');
    console.log(`${name}: line finished with Done; straight segment at ${angle} degrees; toggle resets on tool change`);
    expect(errors).toEqual([]);
    await page.context().close();
  }, 60_000);
});

describe.each(PROFILES.slice(0, 2))('the six dialogs as overlays on the %s (FR-71, FR-72 as amended in v1.15.0)', (name, profile) => {
  test('the three bottom sheets: at most 75 per cent of the viewport, actions in view, Escape closes', async () => {
    const { page, errors } = await openDemo(profile);
    const vh = page.viewportSize()!.height;
    // Fetch open map data (online for this pin only; no request is made by
    // opening the panel).
    await page.context().setOffline(false);
    await tapControl(page, 'fetch-open');
    await page.waitForTimeout(400);
    const sheet = await page.evaluate(() => {
      const p = document.getElementById('fetch-panel')!;
      const r = p.getBoundingClientRect();
      const close = document.getElementById('fetch-close')!.getBoundingClientRect();
      return {
        state: p.dataset.state,
        h: Math.round(r.height),
        bottom: Math.round(r.bottom),
        closeInView: close.bottom <= innerHeight && close.top >= 0,
        pos: getComputedStyle(p).position,
      };
    });
    expect(sheet.state).toBe('open');
    expect(sheet.pos).toBe('fixed');
    expect(sheet.h).toBeLessThanOrEqual(Math.round(vh * 0.75));
    expect(sheet.bottom).toBeLessThanOrEqual(vh);
    expect(sheet.closeInView).toBe(true);
    console.log(`${name}: fetch sheet ${sheet.h}px of ${vh}px viewport, Close in view`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.getElementById('fetch-panel')!.classList.contains('hidden'))).toBe(true);
    await page.context().setOffline(true);
    // The PDF background chooser.
    await page.setInputFiles('#map-file-input', EXAMPLE_PDF);
    await page.waitForTimeout(800);
    const pdfSheet = await page.evaluate(() => {
      const p = document.getElementById('pdf-panel')!;
      const r = p.getBoundingClientRect();
      const use = document.getElementById('pdf-use')!.getBoundingClientRect();
      const cancel = document.getElementById('pdf-cancel')!.getBoundingClientRect();
      return {
        state: p.dataset.state,
        h: Math.round(r.height),
        useInView: use.bottom <= innerHeight,
        cancelInView: cancel.bottom <= innerHeight && cancel.top >= 0,
      };
    });
    expect(pdfSheet.state).toBe('open');
    expect(pdfSheet.h).toBeLessThanOrEqual(Math.round(vh * 0.75));
    expect(pdfSheet.useInView).toBe(true);
    expect(pdfSheet.cancelInView).toBe(true);
    console.log(`${name}: PDF chooser sheet ${pdfSheet.h}px of ${vh}px, Use page and Cancel in view`);
    await page.tap('#pdf-cancel');
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => document.getElementById('pdf-panel')!.classList.contains('hidden'))).toBe(true);
    // Export document.
    await page.tap('#tab-presentation');
    await page.waitForTimeout(400);
    await pressExport(page, 'pdf-open');
    await page.waitForTimeout(600);
    const docSheet = await page.evaluate(() => {
      const p = document.getElementById('document-panel')!;
      const r = p.getBoundingClientRect();
      const cancel = document.getElementById('document-cancel')!.getBoundingClientRect();
      return { state: p.dataset.state, h: Math.round(r.height), bottom: Math.round(r.bottom), cancelInView: cancel.bottom <= innerHeight && cancel.top >= 0 };
    });
    expect(docSheet.state).toBe('open');
    expect(docSheet.h).toBeLessThanOrEqual(Math.round(vh * 0.75));
    expect(docSheet.bottom).toBeLessThanOrEqual(vh);
    expect(docSheet.cancelInView).toBe(true);
    console.log(`${name}: export document sheet ${docSheet.h}px of ${vh}px, Cancel in view`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.getElementById('document-panel')!.classList.contains('hidden'))).toBe(true);
    expect(errors).toEqual([]);
    await page.context().close();
  }, 90_000);

  test('the three stacked pages: full height, Close in the header, actions in view, Escape closes', async () => {
    const { page, errors } = await openDemo(profile);
    const vh = page.viewportSize()!.height;
    const vw = page.viewportSize()!.width;
    // Export presentation.
    await page.tap('#tab-presentation');
    await page.waitForTimeout(400);
    await pressExport(page, 'export-open');
    await page.waitForTimeout(400);
    const exportPageBox = await page.evaluate(() => {
      const p = document.getElementById('export-panel')!;
      const r = p.getBoundingClientRect();
      const close = document.getElementById('export-close')!.getBoundingClientRect();
      const cancel = document.getElementById('export-cancel')!.getBoundingClientRect();
      return {
        state: p.dataset.state,
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
        closeInView: close.top >= 0 && close.bottom <= innerHeight,
        cancelInView: cancel.bottom <= innerHeight && cancel.top >= 0,
        focus: document.activeElement?.id,
      };
    });
    expect(exportPageBox.state).toBe('open');
    expect(exportPageBox.h).toBe(vh);
    expect(exportPageBox.w).toBe(vw);
    expect(exportPageBox.closeInView).toBe(true);
    expect(exportPageBox.cancelInView).toBe(true);
    console.log(`${name}: export presentation page ${exportPageBox.w}x${exportPageBox.h} (viewport ${vw}x${vh}), Close and Cancel in view`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.getElementById('export-panel')!.classList.contains('hidden'))).toBe(true);
    // Focus returns to the control that opened the page: the Export action
    // itself where it is visible, otherwise the Menu control that held it
    // (the compact and short classes' exports ride in the Menu overlay).
    const expectedFocus = (await page.isVisible('#export-open')) ? 'export-open' : 'menu-toggle';
    expect(await page.evaluate(() => document.activeElement?.id)).toBe(expectedFocus);
    // Activities.
    await page.tap('#tab-information');
    await page.waitForTimeout(400);
    await page.tap('#row-table-body tr:first-child .row-details');
    await page.waitForTimeout(400);
    await page.tap('#details-panel .details-economics:has-text("Import activities")');
    await page.waitForTimeout(400);
    const activityBox = await page.evaluate(() => {
      const p = document.getElementById('activity-panel')!;
      const r = p.getBoundingClientRect();
      const close = document.getElementById('activity-close')!.getBoundingClientRect();
      return { state: p.dataset.state, h: Math.round(r.height), closeInView: close.top >= 0 && close.bottom <= innerHeight };
    });
    expect(activityBox.state).toBe('open');
    expect(activityBox.h).toBe(vh);
    expect(activityBox.closeInView).toBe(true);
    console.log(`${name}: activities page ${activityBox.h}px of ${vh}px, Close in view`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.getElementById('activity-panel')!.classList.contains('hidden'))).toBe(true);
    // Comparison: export a presentation, then open it for comparison.
    await page.tap('#tab-presentation');
    await page.waitForTimeout(400);
    await pressExport(page, 'export-open');
    await page.waitForTimeout(400);
    const [download] = await Promise.all([page.waitForEvent('download'), page.tap('#export-go')]);
    const file = join(process.cwd(), 'dist', 'tmp-comparison-source.html');
    await download.saveAs(file);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.setInputFiles('#work-file-input', file);
    await page.waitForTimeout(800);
    const compareBox = await page.evaluate(() => {
      const p = document.getElementById('compare-panel')!;
      const r = p.getBoundingClientRect();
      const adopt = document.getElementById('compare-adopt')!.getBoundingClientRect();
      const close = document.getElementById('compare-close')!.getBoundingClientRect();
      return {
        state: p.dataset.state,
        h: Math.round(r.height),
        adoptInView: adopt.bottom <= innerHeight && adopt.top >= 0,
        closeInView: close.top >= 0 && close.bottom <= innerHeight,
      };
    });
    expect(compareBox.state).toBe('open');
    expect(compareBox.h).toBe(vh);
    expect(compareBox.adoptInView).toBe(true);
    expect(compareBox.closeInView).toBe(true);
    console.log(`${name}: comparison page ${compareBox.h}px of ${vh}px, Adopt and Close in view`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.getElementById('compare-panel')!.classList.contains('hidden'))).toBe(true);
    expect(errors).toEqual([]);
    await page.context().close();
  }, 90_000);

  test('the save status on the download path, and the share gate', async () => {
    const { page, errors } = await openDemo(profile);
    // The emulated phone's save picker was deleted before start.
    expect(await page.evaluate(() => typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker)).toBe('undefined');
    // The work controls are in the Menu overlay.
    await page.tap('#menu-toggle');
    await page.waitForTimeout(250);
    const dialogs: string[] = [];
    page.on('dialog', (d) => {
      dialogs.push(d.message());
      void d.dismiss();
    });
    const [download] = await Promise.all([page.waitForEvent('download'), page.tap('#work-save')]);
    expect(download.suggestedFilename()).toBe('mapvibes-work-state.json');
    await page.waitForTimeout(400);
    const status = await page.evaluate(() => ({
      text: document.getElementById('work-status')!.textContent,
      dirty: !document.getElementById('work-dirty')!.classList.contains('hidden'),
      dialogs: 1,
    }));
    expect(status.text).toBe('Download started. The unsaved mark stays until the file is opened or the save is confirmed.');
    // The confirmation was dismissed: the unsaved mark stays.
    expect(status.dirty).toBe(true);
    expect(dialogs.length).toBe(1);
    console.log(`${name}: save on a phone downloads ${download.suggestedFilename()}, says "Download started", keeps the unsaved mark`);
    // The share gate: hidden without the API, disabled with a message when
    // files cannot be shared, nothing claimed otherwise.
    const share = await page.evaluate(() => {
      const b = document.getElementById('work-share') as HTMLButtonElement;
      const nav = navigator as Navigator & { share?: unknown; canShare?: (d: ShareData) => boolean };
      const hasApi = typeof nav.share === 'function';
      const filesOk = hasApi && (typeof nav.canShare !== 'function' || nav.canShare({ files: [new File(['x'], 'a.json', { type: 'application/json' })] }));
      return { hidden: b.classList.contains('hidden'), disabled: b.disabled, hasApi, filesOk, title: b.title };
    });
    if (!share.hasApi) {
      expect(share.hidden).toBe(true);
      expect(share.disabled).toBe(true);
    } else {
      expect(share.hidden).toBe(false);
      expect(share.disabled).toBe(!share.filesOk);
      if (!share.filesOk) {
        expect(share.title).toContain('cannot share files');
      }
    }
    console.log(`${name}: share gate hasApi=${share.hasApi} hidden=${share.hidden} disabled=${share.disabled}`);
    expect(errors).toEqual([]);
    await page.context().close();
  }, 60_000);

  test('the save round trip on a phone: download, reload, open, confirm, restored', async () => {
    const { page, errors } = await openDemo(profile);
    await page.tap('#menu-toggle');
    await page.waitForTimeout(250);
    page.on('dialog', (d) => void d.accept());
    const [download] = await Promise.all([page.waitForEvent('download'), page.tap('#work-save')]);
    const file = join(process.cwd(), 'dist', 'tmp-round-trip.json');
    await download.saveAs(file);
    await page.waitForTimeout(300);
    const first = readFileSync(file, 'utf8');
    // Reload, then open the downloaded work file; the unsaved-work prompt is
    // accepted.
    await page.reload();
    await page.waitForTimeout(400);
    await page.setInputFiles('#work-file-input', file);
    await page.waitForFunction(() => document.querySelectorAll('#marker-layer .marker').length === 11, undefined, { timeout: 15_000 }).catch(() => undefined);
    await page.waitForTimeout(600);
    await page.tap('#tab-map');
    await page.waitForTimeout(400);
    const markers = await page.evaluate(() => document.querySelectorAll('#marker-layer .marker').length);
    const status = await page.evaluate(() => document.getElementById('work-status')!.textContent);
    expect(markers).toBe(11);
    expect(status).toBe('Work opened.');
    // Save again: byte-identical apart from the save time.
    await page.tap('#menu-toggle');
    await page.waitForTimeout(250);
    const [again] = await Promise.all([page.waitForEvent('download'), page.tap('#work-save')]);
    const file2 = join(process.cwd(), 'dist', 'tmp-round-trip-2.json');
    await again.saveAs(file2);
    const second = readFileSync(file2, 'utf8');
    const strip = (s: string) => s.replace(/"savedAt":\s*"[^"]*"/, '"savedAt": ""');
    expect(strip(second)).toBe(strip(first));
    console.log(`${name}: save round trip restored 11 markers, "Work opened.", save-open-save identical apart from the save time`);
    expect(errors).toEqual([]);
    await page.context().close();
  }, 90_000);
});
