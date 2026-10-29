// @vitest-environment node
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { chromium, devices, type Browser, type Page } from 'playwright';

// The narrow viewer layout (FR-58) in a real layout, headless Chromium with
// the device profiles of a phone in portrait and in landscape and a tablet
// in portrait, offline, with the full-test demo exported from the desktop:
// the stage occupies the viewport, the two overlays open and close, the card
// stays within the viewport, nothing overflows sideways, pan and pinch work
// on the stage, "Fit view" brings the markers in, a shortened value shows in
// full on the card, and labels scale with the map while markers do not.
// Emulation is not a device: real iOS Safari is part of the owner's
// acceptance test. Run after the build (npm run build).
const BUILT = join(process.cwd(), 'dist', 'build', 'index.html');

let browser: Browser;
let exported: string;

beforeAll(async () => {
  if (!existsSync(BUILT)) throw new Error('dist/build/index.html is missing: run the build first');
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
  await context.setOffline(true);
  const page = await context.newPage();
  await page.goto(`file://${BUILT}`);
  await page.evaluate(() => delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker);
  await page.selectOption('#select-language', 'en');
  await page.click('#load-demo');
  await page.waitForFunction(() => document.querySelectorAll('#marker-layer .marker').length === 11);
  await page.click('#tab-presentation');
  await page.click('#pres-fit');
  await page.waitForTimeout(300);
  await page.click('#export-open');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-go')]);
  exported = join(mkdtempSync(join(tmpdir(), 'mapvibes-narrow-')), 'presentation.html');
  await download.saveAs(exported);
  await context.close();
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

const PROFILES = [
  ['phone portrait', devices['iPhone 13']],
  ['phone landscape', devices['iPhone 13 landscape']],
  ['tablet portrait', devices['iPad (gen 7)']],
] as const;

async function openViewer(profile: (typeof PROFILES)[number][1]): Promise<{ page: Page; errors: string[] }> {
  const context = await browser.newContext({ ...profile });
  await context.setOffline(true);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`file://${exported}`);
  await page.waitForFunction(() => document.documentElement.dataset.mode === 'viewer');
  await page.waitForTimeout(800);
  return { page, errors };
}

async function box(page: Page, selector: string) {
  return (await page.locator(selector).first().boundingBox())!;
}

const viewport = (page: Page) => page.viewportSize()!;

// Every element that sticks out of the viewport sideways, the map inside
// the stage (clipped by it) excepted.
async function overflowing(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (el.closest('.stage') && !el.classList.contains('stage')) continue;
      if (el.getClientRects().length === 0 || getComputedStyle(el).visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.left < -0.5 || r.right > innerWidth + 0.5) out.push(`${el.tagName.toLowerCase()}#${el.id}.${el.className}`);
    }
    return out;
  });
}

async function visibility(page: Page, selector: string): Promise<string> {
  return page.$eval(selector, (e) => `${getComputedStyle(e).visibility}/${(e as HTMLElement).dataset.state}`);
}

async function scaleOf(page: Page): Promise<number> {
  return page.evaluate(() => Number(/scale\(([\d.]+)\)/.exec(document.getElementById('presentation-content')!.style.transform)![1]));
}

async function pinch(page: Page, from: number, to: number): Promise<void> {
  const b = await box(page, '#presentation-stage');
  const [cx, cy] = [b.x + b.width / 2, b.y + b.height / 3];
  const cdp = await page.context().newCDPSession(page);
  const fingers = (d: number) => [
    { x: cx - d, y: cy, id: 0 },
    { x: cx + d, y: cy, id: 1 },
  ];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(from) });
  const step = (to - from) / 8;
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers(from + step * i) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(300);
}

async function drag(page: Page, dx: number, dy: number): Promise<void> {
  const b = await box(page, '#presentation-stage');
  const [x, y] = [b.x + b.width / 2, b.y + b.height / 3];
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 0 }] });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * i) / 8, y: y + (dy * i) / 8, id: 0 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(300);
}

describe.each(PROFILES)('the narrow viewer on a %s (FR-58)', (name, profile) => {
  test('the query matches, the stage occupies the viewport, and nothing overflows', async () => {
    const { page, errors } = await openViewer(profile);
    const v = viewport(page);
    expect(await page.evaluate(() => matchMedia("(max-width: 56rem), (orientation: landscape) and (max-height: 30rem) and (pointer: coarse)").matches)).toBe(true);
    // No page scroll in either direction.
    expect(await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight])).toEqual([v.width, v.height]);
    expect(await overflowing(page)).toEqual([]);
    // The stage spans the width and reaches the bottom of the viewport; the
    // header and the toolbar take the rest of the height.
    const stage = await box(page, '#presentation-stage');
    expect(stage.width).toBeGreaterThanOrEqual(v.width - 24);
    expect(v.height - (stage.y + stage.height)).toBeLessThanOrEqual(12);
    expect(stage.height).toBeGreaterThanOrEqual(v.height * (name === 'phone landscape' ? 0.5 : 0.7));
    // The side panels are out of the flow: no item list, and the overlays
    // closed.
    expect(await page.isVisible('#visibility-area')).toBe(false);
    expect(await visibility(page, '#presentation-glance')).toBe('hidden/closed');
    expect(await visibility(page, '#presentation-legend')).toBe('hidden/closed');
    // The stage keeps its overscroll to itself.
    expect(await page.$eval('#presentation-stage', (e) => getComputedStyle(e).overscrollBehaviorY)).toBe('none');
    expect(errors).toEqual([]);
    await page.context().close();
  }, 60_000);

  test('the overlays open from the toggle bar one at a time, within the viewport, and close by toggle, Escape, and a tap outside', async () => {
    const { page } = await openViewer(profile);
    const v = viewport(page);
    await page.tap('#toggle-glance');
    await page.waitForTimeout(300);
    expect(await visibility(page, '#presentation-glance')).toBe('visible/open');
    expect(await page.getAttribute('#toggle-glance', 'aria-expanded')).toBe('true');
    const panel = await box(page, '#presentation-glance');
    expect(panel.x).toBeGreaterThanOrEqual(0);
    expect(panel.x + panel.width).toBeLessThanOrEqual(v.width);
    expect(panel.y + panel.height).toBeLessThanOrEqual(v.height);
    // The other toggle: one open at a time.
    await page.tap('#toggle-legend');
    await page.waitForTimeout(300);
    expect(await visibility(page, '#presentation-legend')).toBe('visible/open');
    expect(await visibility(page, '#presentation-glance')).toBe('hidden/closed');
    expect(await page.locator('#presentation-legend .legend-entry').count()).toBeGreaterThan(10);
    // Its toggle closes it.
    await page.tap('#toggle-legend');
    await page.waitForTimeout(300);
    expect(await visibility(page, '#presentation-legend')).toBe('hidden/closed');
    // Escape.
    await page.tap('#toggle-glance');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    expect(await visibility(page, '#presentation-glance')).toBe('hidden/closed');
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('toggle-glance');
    // A tap outside, on the stage above the overlay.
    await page.tap('#toggle-glance');
    await page.waitForTimeout(300);
    const stage = await box(page, '#presentation-stage');
    await page.touchscreen.tap(stage.x + stage.width / 2, stage.y + 10);
    await page.waitForTimeout(300);
    expect(await visibility(page, '#presentation-glance')).toBe('hidden/closed');
    expect(await overflowing(page)).toEqual([]);
    await page.context().close();
  }, 60_000);

  test('"Fit view" brings every marker in; an entry of "In view" opens the card docked within the viewport, a shortened value in full', async () => {
    const { page } = await openViewer(profile);
    const v = viewport(page);
    await page.tap('#pres-fit');
    await page.waitForTimeout(500);
    const stage = await box(page, '#presentation-stage');
    const markers = await page.locator('#presentation-marker-layer .marker').all();
    expect(markers).toHaveLength(11);
    for (const m of markers) {
      const b = (await m.boundingBox())!;
      const [cx, cy] = [b.x + b.width / 2, b.y + b.height / 2];
      expect(cx).toBeGreaterThanOrEqual(stage.x);
      expect(cx).toBeLessThanOrEqual(stage.x + stage.width);
      expect(cy).toBeGreaterThanOrEqual(stage.y);
      expect(cy).toBeLessThanOrEqual(stage.y + stage.height);
    }
    await page.tap('#toggle-glance');
    await page.waitForTimeout(300);
    expect(await page.locator('#presentation-glance-list .glance-entry').count()).toBe(11);
    // A value the narrow entry shortens, if any, and the entry it belongs to.
    const shortened = await page.$$eval('#presentation-glance-list .glance-entry', (entries) =>
      entries
        .map((e, index) => {
          // The entry's values are shortened together, with an ellipsis at
          // the edge of their row: a value reaching past it is cut.
          const row = e.querySelector<HTMLElement>('.glance-values');
          if (!row || row.scrollWidth <= row.clientWidth + 1) return { index, values: [] as string[] };
          const edge = row.getBoundingClientRect().right;
          return { index, values: [...row.querySelectorAll<HTMLElement>('.glance-value')].filter((v) => v.getBoundingClientRect().right > edge + 1).map((v) => v.textContent ?? '') };
        })
        .find((e) => e.values.length > 0),
    );
    // A phone in portrait is narrow enough to shorten some value.
    if (name === 'phone portrait') expect(shortened?.values.length ?? 0).toBeGreaterThan(0);
    console.log(`${name}: shortened ${JSON.stringify(shortened?.values ?? [])}`);
    const entries = page.locator('#presentation-glance-list .glance-entry');
    await entries.nth(shortened?.index ?? 0).tap();
    await page.waitForTimeout(400);
    expect(await visibility(page, '#presentation-glance')).toBe('hidden/closed');
    expect(await page.getAttribute('#presentation-card', 'data-state')).toBe('open');
    expect(await page.getAttribute('#presentation-card', 'data-dock')).toBe('bottom');
    const card = await box(page, '#presentation-card');
    expect(card.x).toBeGreaterThanOrEqual(stage.x);
    expect(card.x + card.width).toBeLessThanOrEqual(Math.min(v.width, stage.x + stage.width) + 0.5);
    expect(card.y + card.height).toBeLessThanOrEqual(Math.min(v.height, stage.y + stage.height) + 0.5);
    expect(card.y).toBeGreaterThanOrEqual(stage.y);
    // Docked at the bottom of the stage, with its own scrolling.
    expect(stage.y + stage.height - (card.y + card.height)).toBeLessThanOrEqual(12);
    expect(await page.$eval('#presentation-card', (e) => getComputedStyle(e).overflowY)).toBe('auto');
    // Touch has no tooltips: what the entry shortens, the card shows whole.
    if (shortened) {
      const values = await page.locator('#presentation-card .card-value').allTextContents();
      for (const text of shortened.values) expect(values).toContain(text);
    }
    await page.context().close();
  }, 60_000);

  test('pan and pinch work on the stage; labels scale with the map while markers do not', async () => {
    const { page } = await openViewer(profile);
    await page.tap('#pres-fit');
    await page.waitForTimeout(500);
    const measure = () =>
      page.evaluate(() => ({
        transform: document.getElementById('presentation-content')!.style.transform,
        label: document.querySelector('#presentation-annotation-labels .annotation-label')!.getBoundingClientRect().height,
        marker: document.querySelector('#presentation-marker-layer .marker')!.getBoundingClientRect().height,
      }));
    const fitted = { ...(await measure()), scale: await scaleOf(page) };
    await pinch(page, 30, 110);
    const pinched = { ...(await measure()), scale: await scaleOf(page) };
    expect(pinched.scale).toBeGreaterThan(fitted.scale * 1.5);
    expect(pinched.label / fitted.label).toBeCloseTo(pinched.scale / fitted.scale, 1);
    expect(pinched.marker).toBeCloseTo(fitted.marker, 0);
    await drag(page, -60, -40);
    const panned = await measure();
    expect(panned.transform).not.toBe(pinched.transform);
    expect(await scaleOf(page)).toBeCloseTo(pinched.scale, 6);
    // The page itself did not move.
    expect(await page.evaluate(() => [scrollX, scrollY])).toEqual([0, 0]);
    await page.context().close();
  }, 60_000);
});

describe('the landscape clause (FR-58)', () => {
  test('a large phone turned sideways, wider than the width threshold, is narrow by the landscape clause', async () => {
    const context = await browser.newContext({ viewport: { width: 932, height: 430 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    const page = await context.newPage();
    await page.goto(`file://${exported}`);
    await page.waitForFunction(() => document.documentElement.dataset.mode === 'viewer');
    const [width, landscape] = await page.evaluate(() => [matchMedia('(max-width: 56rem)').matches, matchMedia('(orientation: landscape) and (max-height: 30rem) and (pointer: coarse)').matches]);
    expect([width, landscape]).toEqual([false, true]);
    expect(await visibility(page, '#presentation-glance')).toBe('hidden/closed');
    expect(await page.isVisible('#toggle-glance')).toBe(true);
    await context.close();
  }, 60_000);
});
