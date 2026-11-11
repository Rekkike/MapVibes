// @vitest-environment node
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

// The edge indicators (FR-80 as amended in v1.11.1) in a real layout,
// headless Chromium, offline: the demo is loaded, two fictional events are
// added beyond the items' span (one before it, one after it) through the
// Information segment's events panel, the presentation is exported from
// the timeline view, and the exported viewer is measured on a desktop and a
// phone: a small "+n"-style chip at each end of the events strip counting
// the events beyond the shown window, taking no extra height and no room of
// the in-window chips, and on a tap panning the window to the nearest of
// those events, so that it is drawn. Run after the build (npm run build).
const BUILT = join(process.cwd(), 'dist', 'build', 'index.html');

let browser: Browser;
let exported: string;
const measured: string[] = [];

beforeAll(async () => {
  if (!existsSync(BUILT)) {
    throw new Error('dist/build/index.html is missing: run the build first');
  }
  const dir = mkdtempSync(join(tmpdir(), 'mapvibes-edge-'));
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
  await context.setOffline(true);
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('file://') || url.startsWith('data:') || url.startsWith('blob:')) {
      return route.continue();
    }
    return route.abort();
  });
  const page = await context.newPage();
  await page.goto(`file://${BUILT}`);
  await page.evaluate(() => delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker);
  await page.selectOption('#select-language', 'en');
  await page.click('#load-demo');
  await page.waitForFunction(() => document.querySelectorAll('#row-table-body tr').length === 12);
  // Two fictional events beyond the items' span, through the events panel.
  await page.click('#tab-information');
  await page.waitForTimeout(300);
  await page.click('#event-panel-summary');
  await page.waitForTimeout(300);
  for (const [date, label] of [
    ['2022-03', 'Early'],
    ['2042-06', 'Far review'],
  ] as const) {
    await page.fill('#event-date-new', date);
    await page.fill('#event-label-new', label);
    await page.click('#event-add');
    await page.waitForTimeout(150);
  }
  await page.click('#tab-presentation');
  await page.click('#pres-mode-timeline');
  await page.waitForFunction(() => document.querySelectorAll('#presentation-timeline .timeline-line').length === 12, undefined, { timeout: 30000 });
  await page.click('#export-open');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-go')]);
  exported = join(dir, 'presentation.html');
  await download.saveAs(exported);
  await context.close();
}, 120_000);

afterAll(async () => {
  await browser?.close();
  console.log(`the edge indicators, measured:\n${measured.join('\n')}`);
});

async function openViewer(options: object): Promise<{ page: Page; errors: string[] }> {
  const context = await browser.newContext({ ...options });
  await context.setOffline(true);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`file://${exported}`);
  await page.waitForFunction(() => document.documentElement.dataset.mode === 'viewer');
  await page.waitForFunction(() => document.querySelectorAll('#presentation-timeline .timeline-line').length === 12, undefined, { timeout: 30000 });
  await page.waitForTimeout(1000);
  return { page, errors };
}

async function readStrip(page: Page, view: 'timeline' | 'costs') {
  await page.locator(`#pres-mode-${view}`).scrollIntoViewIfNeeded();
  await page.click(`#pres-mode-${view}`);
  await page.waitForFunction((v) => (document.querySelector('#presentation-stage') as HTMLElement).dataset.view === v, view);
  await page.waitForTimeout(400);
  return page.evaluate((v) => {
    const root = document.querySelector<HTMLElement>(`#presentation-${v}`)!;
    const strip = root.querySelector('.timeline-event-strip')!.getBoundingClientRect();
    const plot = root.querySelector('.timeline-event-plot')!.getBoundingClientRect();
    const edges = [...root.querySelectorAll<HTMLElement>('.timeline-event-edge')].map((c) => {
      const r = c.getBoundingClientRect();
      return {
        side: c.dataset.side!,
        text: c.textContent,
        title: c.title,
        x: r.left - plot.left,
        right: r.right - plot.left,
        w: r.width,
        h: r.height,
        top: r.top - strip.top,
      };
    });
    const labels = [...root.querySelectorAll<HTMLElement>('.timeline-event-chip:not(.timeline-event-edge)')].map((c) => {
      const r = c.getBoundingClientRect();
      return { text: c.textContent, row: c.dataset.row!, x: r.left - plot.left, right: r.right - plot.left };
    });
    return {
      stripH: strip.height,
      plotW: plot.width,
      edges,
      labels,
      hairlines: [...root.querySelectorAll<HTMLElement>('.timeline-event-line')].map((l) => l.dataset.eventId),
      zoom: (document.querySelector('#pres-zoom-level') as HTMLElement).textContent,
    };
  }, view);
}

describe.each([
  ['desktop 1500x950', { viewport: { width: 1500, height: 950 } }, 22],
  ['phone 390x844', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, 42],
] as const)('the edge indicators in the viewer on %s', (name, options, stripH) => {
  test('each end of the events strip carries a small chip counting the events beyond the window, in both schedule views', async () => {
    const { page, errors } = await openViewer(options);
    for (const view of ['timeline', 'costs'] as const) {
      const m = await readStrip(page, view);
      // One chip at each end, in the strip's first row, as small as the "+n" chip.
      expect(m.edges.map((e) => [e.side, e.text, e.title])).toEqual([
        ['before', '+1', 'Events before the shown window: 2022-03: Early'],
        ['after', '+1', 'Events after the shown window: 2042-06: Far review'],
      ]);
      for (const e of m.edges) {
        expect(e.w).toBe(28);
        expect(e.h).toBe(17);
        expect(e.top).toBeCloseTo(2, 0);
      }
      expect(m.edges[0].x).toBeCloseTo(0, 0);
      expect(m.edges[1].right).toBeCloseTo(m.plotW, 0);
      // No extra height: the strip is as tall as without the off-span events.
      expect(m.stripH).toBe(stripH);
      // The in-window chips keep clear of the edge chips.
      for (const l of m.labels) {
        expect(l.right).toBeLessThanOrEqual(m.edges[1].x - 4 + 0.5);
        expect(l.x).toBeGreaterThanOrEqual(m.edges[0].right + 4 - 0.5);
      }
      // The off-span events have no hairline at the fitted view.
      expect(m.hairlines).toEqual(['e1', 'e2']);
      measured.push(
        `${name}, ${view}: edge chips ${m.edges.map((e) => `${e.side} "${e.text}" at ${e.x.toFixed(0)}..${e.right.toFixed(0)} of ${m.plotW.toFixed(0)} px, ${e.w}x${e.h.toFixed(0)} px`).join('; ')}; strip ${m.stripH} px, in-window chips ${m.labels.map((l) => `${l.text} row ${l.row}`).join(', ')}`,
      );
    }
    expect(errors).toEqual([]);
    await page.context().close();
  }, 60_000);

  test('tapping an edge chip pans the window to the nearest event beyond that end, which is then drawn', async () => {
    const { page, errors } = await openViewer(options);
    for (const view of ['timeline', 'costs'] as const) {
      const before = await readStrip(page, view);
      await page.click(`#presentation-${view} .timeline-event-edge[data-side="after"]`);
      await page.waitForTimeout(400);
      const after = await page.evaluate((v) => {
        const root = document.querySelector<HTMLElement>(`#presentation-${v}`)!;
        return {
          zoom: (document.querySelector('#pres-zoom-level') as HTMLElement).textContent,
          edges: [...root.querySelectorAll<HTMLElement>('.timeline-event-edge')].map((c) => `${c.dataset.side}:${c.textContent}`),
          labels: [...root.querySelectorAll<HTMLElement>('.timeline-event-chip:not(.timeline-event-edge)')].map((c) => c.textContent),
          hairlines: [...root.querySelectorAll<HTMLElement>('.timeline-event-line')].map((l) => l.dataset.eventId),
          stripH: root.querySelector('.timeline-event-strip')!.getBoundingClientRect().height,
        };
      }, view);
      // The window panned at the same zoom; the far event is drawn; the right edge chip is gone.
      expect(after.zoom).toBe(before.zoom);
      expect(after.hairlines).toContain('e4');
      expect(after.labels).toContain('Far review');
      expect(after.edges).toEqual(['before:+1']);
      expect(after.stripH).toBeLessThanOrEqual(before.stripH + 20);
      measured.push(
        `${name}, ${view}: tapping the "after" edge chip panned the window at ${after.zoom}; hairlines ${after.hairlines.join(',')}; chips ${after.labels.join(', ')}; edges ${after.edges.join(', ')}; strip ${after.stripH} px`,
      );
    }
    expect(errors).toEqual([]);
    await page.context().close();
  }, 60_000);
});
