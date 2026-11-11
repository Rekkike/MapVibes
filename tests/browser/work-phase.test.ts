// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { parseWorkState, serialiseWorkState } from '../../src/workstate';

// The work-phase marker (FR-78 as amended in v1.12.0) in a real layout,
// headless Chromium, offline: a work state of schema 12 with two work phases
// is opened in the application, exported from the timeline, and the exported
// viewer is measured at 1500 x 950 and 390 x 844, in both themes -- the
// band's geometry (the plot's full height, from the activity's start to its
// end, behind the bar and the segments), the hatching, the collapsed "+n"
// case and the expanded line, the legend entry, and that the viewer is
// view-only. Run after the build (npm run build).
const BUILT = join(process.cwd(), 'dist', 'build', 'index.html');
const V6 = join(process.cwd(), 'example-data', 'example-work-state-v6.json');

let browser: Browser;
let exported: string;
const measured: string[] = [];

beforeAll(async () => {
  if (!existsSync(BUILT)) {
    throw new Error('dist/build/index.html is missing: run the build first');
  }
  // A-01: five overlapping activities, its work phase one that lies behind
  // the third lane, not drawn while the line is collapsed. A-04: two activities, its work
  // phase the first, visible, and corrected by hand. A-03: a work phase
  // whose dates cannot be read, so nothing is drawn for it.
  const ws = parseWorkState(readFileSync(V6, 'utf8'));
  const byId: Record<string, number> = Object.fromEntries(ws.rows.map((r, i) => [r.values.ID, i]));
  ws.rows[byId['A-01']].activities = [
    { id: 'a1', label: 'Groundwork', start: '2024-01-05', end: '2024-01-20', progress: 100 },
    { id: 'a2', label: 'Piping', start: '2024-01-10', end: '2024-01-25', progress: 60 },
    { id: 'a3', label: 'Wiring', start: '2024-01-15', end: '2024-01-30', progress: 0 },
    { id: 'a4', label: 'Testing', start: '2024-01-20', end: '2024-02-01', progress: null },
    { id: 'a5', label: 'Handover', start: '2024-02-01', end: '2024-02-15', progress: 10 },
  ];
  ws.rows[byId['A-01']].workPhase = 'a4';
  ws.rows[byId['A-04']].activities = [
    { id: 'a1', edited: true, label: 'Survey', start: '2024-02-02', end: '2024-02-10', progress: 100 },
    { id: 'a2', label: 'Report', start: '2024-02-20', end: '2024-03-01', progress: 40 },
  ];
  ws.rows[byId['A-04']].workPhase = 'a1';
  ws.rows[byId['A-03']].activities = [{ id: 'a1', label: 'Unknown dates', start: '15/03/2024', end: '2024-03-15', progress: 50 }];
  ws.rows[byId['A-03']].workPhase = 'a1';
  const dir = mkdtempSync(join(tmpdir(), 'mapvibes-phase-'));
  const workFile = join(dir, 'work.json');
  writeFileSync(workFile, serialiseWorkState(ws, new Date('2026-01-02T03:04:05.000Z')));

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
  await page.setInputFiles('#work-file-input', workFile);
  await page.waitForFunction(() => document.querySelectorAll('#row-table-body tr').length === 5);
  await page.click('#tab-presentation');
  await page.click('#pres-mode-timeline');
  await page.waitForFunction(() => document.querySelectorAll('#presentation-timeline .timeline-line').length === 5, undefined, { timeout: 30000 });
  await page.click('#export-open');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-go')]);
  exported = join(dir, 'presentation.html');
  await download.saveAs(exported);
  await context.close();
}, 120_000);

afterAll(async () => {
  await browser?.close();
  console.log(`work phase, measured:\n${measured.join('\n')}`);
});

async function openViewer(options: object): Promise<{ page: Page; errors: string[] }> {
  const context = await browser.newContext({ ...options });
  await context.setOffline(true);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`file://${exported}`);
  await page.waitForFunction(() => document.documentElement.dataset.mode === 'viewer');
  await page.waitForFunction(() => document.querySelectorAll('#presentation-timeline .timeline-line').length === 5, undefined, { timeout: 30000 });
  await page.waitForTimeout(1000);
  return { page, errors };
}

// A line's band, plot, bar, and segments, in the plot's coordinates.
function measureLine(page: Page, rowId: string) {
  return page.evaluate((id) => {
    const row = [...document.querySelectorAll<HTMLElement>('#presentation-timeline .timeline-line')].find((r) => r.dataset.rowId === id)!;
    const plotEl = row.querySelector<HTMLElement>('.timeline-plot')!;
    const plot = plotEl.getBoundingClientRect();
    const rel = (e: Element) => {
      const r = e.getBoundingClientRect();
      return { x: r.left - plot.left, y: r.top - plot.top, w: r.width, h: r.height };
    };
    const band = row.querySelector<HTMLElement>('.timeline-phase');
    const cs = band ? getComputedStyle(band) : null;
    const segs = [...row.querySelectorAll<HTMLElement>('.timeline-seg')].map((s) => {
      const after = getComputedStyle(s, '::after');
      return {
        ...rel(s),
        title: s.title,
        lane: Number(s.dataset.lane),
        phase: s.dataset.phase === 'true',
        shown: s.getClientRects().length > 0,
        hatch: after.backgroundImage,
        hatchContent: after.content,
      };
    });
    return {
      plot: { w: plot.width, h: plot.height },
      lineH: row.getBoundingClientRect().height,
      lanes: Number(row.dataset.lanes),
      band: band
        ? { ...rel(band), image: cs!.backgroundImage, opacity: cs!.opacity, events: cs!.pointerEvents, first: plotEl.firstElementChild === band }
        : null,
      bar: row.querySelector('.timeline-bar') ? rel(row.querySelector('.timeline-bar')!) : null,
      segs,
      indicator: row.querySelector('.timeline-indicator')?.textContent ?? null,
    };
  }, rowId);
}

describe.each([
  ['1500x950 light', { viewport: { width: 1500, height: 950 }, colorScheme: 'light' }, 28, 28, 0],
  ['1500x950 dark', { viewport: { width: 1500, height: 950 }, colorScheme: 'dark' }, 28, 28, 0],
  ['390x844 light', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, colorScheme: 'light' }, 48, 24, 24],
  ['390x844 dark', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, colorScheme: 'dark' }, 48, 24, 24],
] as const)('the work phase in the viewer timeline at %s (FR-78)', (name, options, lineH, plotH, nameRow) => {
  // The lines are collapsed by default (FR-78 as amended in v1.14.0): the
  // band is drawn unbidden; its segment is drawn once the line is pressed.
  const press = (page: Page, id: string) =>
    page.locator(`#presentation-timeline .timeline-line[data-row-id="${id}"] .timeline-plot-control`).click({ position: { x: 4, y: 4 } });

  test("the band spans the plot's full height from the activity's start to its end, hatched, behind the bar and the segments, unbidden; pressed, its segment is hatched", async () => {
    const { page, errors } = await openViewer(options);
    const theme = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const quiet = await measureLine(page, 'row-4');
    expect(quiet.lineH).toBe(lineH);
    expect(quiet.plot.h).toBe(plotH);
    expect(quiet.band).not.toBeNull();
    // Collapsed: the band at the plot's full height, no segment drawn.
    expect(quiet.band!.y).toBeCloseTo(0, 0);
    expect(quiet.band!.h).toBeCloseTo(plotH, 0);
    expect(quiet.segs.filter((s) => s.shown)).toEqual([]);
    await press(page, 'row-4');
    const m = await measureLine(page, 'row-4');
    expect(m.lineH).toBe(nameRow + plotH * m.lanes);
    const band = m.band!;
    // The full height of the open plot.
    expect(band.y).toBeCloseTo(0, 0);
    expect(band.h).toBeCloseTo(m.plot.h, 0);
    // From the activity's start to its end: where its segment stands.
    const seg = m.segs.find((s) => s.phase)!;
    expect(seg.title).toBe('Survey: 2024-02-02 – 2024-02-10, 100%, edited by hand, Work phase');
    expect(band.x).toBeCloseTo(seg.x, 0);
    expect(band.w).toBeCloseTo(seg.w, 0);
    // Hatched, and behind: first in the plot, taking no pointer.
    expect(band.image).toContain('repeating-linear-gradient');
    expect(band.first).toBe(true);
    expect(band.events).toBe('none');
    expect(seg.shown).toBe(true);
    expect(seg.hatch).toContain('repeating-linear-gradient');
    // Only the referenced segment is hatched.
    expect(m.segs.filter((s) => s.hatchContent !== 'none').map((s) => s.title.split(':')[0])).toEqual(['Survey']);
    // The band is taller than every bar and segment it stands behind.
    expect(band.h).toBeGreaterThan(m.bar!.h);
    for (const s of m.segs) {
      expect(band.h).toBeGreaterThan(s.h);
    }
    // A work phase whose dates cannot be read draws nothing.
    expect((await measureLine(page, 'row-3')).band).toBeNull();
    measured.push(
      `${name}: page ${theme}; collapsed line ${quiet.lineH} px, band ${quiet.band!.w.toFixed(1)} x ${quiet.band!.h.toFixed(1)} px; open line ${m.lineH} px, plot ${m.plot.h} px, band ${band.w.toFixed(1)} x ${band.h.toFixed(1)} px, opacity ${band.opacity}; its segment ${seg.w.toFixed(1)} x ${seg.h} px at y ${seg.y.toFixed(1)}`,
    );
    expect(errors).toEqual([]);
    await page.context().close();
  }, 60_000);

  test('the collapsed line: the segment is not drawn and the band still shows, the indicator counting the activities; expanded, the band spans all the lanes', async () => {
    const { page, errors } = await openViewer(options);
    const collapsed = await measureLine(page, 'row-1');
    expect(collapsed.indicator).toBe('5');
    expect(collapsed.segs.filter((s) => s.shown)).toEqual([]);
    const hidden = collapsed.segs.find((s) => s.phase)!;
    expect(hidden.title.startsWith('Testing')).toBe(true);
    expect(hidden.lane).toBeGreaterThanOrEqual(3);
    expect(hidden.shown).toBe(false);
    expect(collapsed.band).not.toBeNull();
    expect(collapsed.band!.y).toBeCloseTo(0, 0);
    expect(collapsed.band!.h).toBeCloseTo(plotH, 0);
    expect(collapsed.band!.w).toBeGreaterThan(3);
    await press(page, 'row-1');
    const expanded = await measureLine(page, 'row-1');
    const lanes = expanded.plot.h / plotH;
    expect(lanes).toBe(5);
    expect(expanded.lineH).toBe(nameRow + plotH * lanes);
    // The band spans the expanded plot, every lane of it, whole.
    expect(expanded.band!.y).toBeCloseTo(0, 0);
    expect(expanded.band!.h).toBeCloseTo(expanded.plot.h, 0);
    const shown = expanded.segs.find((s) => s.phase)!;
    expect(shown.shown).toBe(true);
    expect(expanded.band!.x).toBeCloseTo(shown.x, 0);
    expect(expanded.band!.w).toBeCloseTo(shown.w, 0);
    measured.push(
      `${name}: collapsed band ${collapsed.band!.w.toFixed(1)} x ${collapsed.band!.h.toFixed(1)} px its segment not drawn, the indicator "${collapsed.indicator}"; expanded to ${lanes} lanes, band ${expanded.band!.w.toFixed(1)} x ${expanded.band!.h.toFixed(1)} px over a ${expanded.plot.h.toFixed(0)} px plot`,
    );
    expect(errors).toEqual([]);
    await page.context().close();
  }, 60_000);

  test('the legend entry with its hatched swatch, in the timeline only; the viewer is view-only', async () => {
    const { page, errors } = await openViewer(options);
    const entry = () =>
      page.evaluate(() => {
        const group = document.querySelector<HTMLElement>('#presentation-legend .legend-group[data-kind="phase"]');
        if (!group) {
          return null;
        }
        const swatch = group.querySelector<HTMLElement>('.legend-swatch')!;
        const r = swatch.getBoundingClientRect();
        return {
          label: group.querySelector('.legend-group-label')!.textContent,
          text: group.querySelector('.legend-label')!.textContent,
          w: r.width,
          h: r.height,
          image: getComputedStyle(swatch).backgroundImage,
          entries: group.querySelectorAll('.legend-entry').length,
        };
      });
    const inTimeline = await entry();
    expect(inTimeline).not.toBeNull();
    expect([inTimeline!.label, inTimeline!.text, inTimeline!.entries]).toEqual(['Work phase', 'The marked activity of an item', 1]);
    expect(inTimeline!.image).toContain('repeating-linear-gradient');
    expect(inTimeline!.w).toBeGreaterThan(inTimeline!.h);
    for (const view of ['map', 'costs'] as const) {
      await page.locator(`#pres-mode-${view}`).scrollIntoViewIfNeeded();
      await page.click(`#pres-mode-${view}`);
      await page.waitForFunction((v) => (document.querySelector('#presentation-stage') as HTMLElement).dataset.view === v, view);
      expect(await entry()).toBeNull();
    }
    // Nothing of the phase in the costs view.
    expect(await page.locator('#presentation-costs .timeline-phase, #presentation-costs [data-phase]').count()).toBe(0);
    // View-only: no correction, no import, no dialog.
    expect(await page.locator('.details-correct-activities').count()).toBe(0);
    expect(await page.isVisible('#activity-panel')).toBe(false);
    measured.push(`${name}: legend swatch ${inTimeline!.w.toFixed(1)} x ${inTimeline!.h.toFixed(1)} px`);
    expect(errors).toEqual([]);
    await page.context().close();
  }, 60_000);
});
