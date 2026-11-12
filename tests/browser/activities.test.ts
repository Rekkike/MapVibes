// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { parseWorkState, serialiseWorkState } from '../../src/workstate';
import { pressExport, setSelect } from './chrome';

// The activities in the timeline (FR-78) in a real layout, headless Chromium,
// offline (revised for the two states of v1.14.0): a work state with activities is opened in the
// application, exported, and the exported viewer's timeline is measured on a
// desktop and a phone -- the packed sub-lane rhythm, the "+n" badge, the
// full-height expansion and its collapse, the progress fill, the fitted
// window including the activities, and a project without activities as
// before. Run after the build (npm run build).
const BUILT = join(process.cwd(), 'dist', 'build', 'index.html');
const V6 = join(process.cwd(), 'example-data', 'example-work-state-v6.json');

let browser: Browser;
let exported: string;

beforeAll(async () => {
  if (!existsSync(BUILT)) {
    throw new Error('dist/build/index.html is missing: run the build first');
  }
  // A schema-10 work state built through the repository's own parser and
  // serializer on the v6 fixture: activities on A-01 (five, deliberately
  // overlapping, so lanes and the badge are exercised), two on A-04, none on
  // A-02, and one with an unreadable date on A-03.
  const ws = parseWorkState(readFileSync(V6, 'utf8'));
  const byId: Record<string, number> = Object.fromEntries(ws.rows.map((r, i) => [r.values.ID, i]));
  ws.rows[byId['A-01']].activities = [
    { id: 'a1', label: 'Groundwork', start: '2024-01-05', end: '2024-01-20', progress: 100 },
    { id: 'a2', label: 'Piping', start: '2024-01-10', end: '2024-01-25', progress: 60 },
    { id: 'a3', label: 'Wiring', start: '2024-01-15', end: '2024-01-30', progress: 0 },
    { id: 'a4', label: 'Testing', start: '2024-01-20', end: '2024-02-01', progress: null },
    { id: 'a5', label: 'Handover', start: '2024-02-01', end: '2024-02-15', progress: 10 },
  ];
  ws.rows[byId['A-01']].activityImport = { file: 'plan.pdf', page: 1, columns: { label: 'Post', start: 'Från', end: 'Till', progress: 'Klart' } };
  ws.rows[byId['A-04']].activities = [
    { id: 'a1', label: 'Survey', start: '2024-02-02', end: '2024-02-10', progress: 100 },
    { id: 'a2', label: 'Report', start: '2024-02-20', end: '2024-03-01', progress: 40 },
  ];
  ws.rows[byId['A-03']].activities = [{ id: 'a1', label: 'Unknown dates', start: '15/03/2024', end: '2024-03-15', progress: 50 }];
  const dir = mkdtempSync(join(tmpdir(), 'mapvibes-activities-'));
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
  await setSelect(page, 'select-language', 'en');
  await page.setInputFiles('#work-file-input', workFile);
  await page.waitForFunction(() => document.querySelectorAll('#row-table-body tr').length === 5);
  await page.click('#tab-presentation');
  await page.click('#pres-mode-timeline');
  await page.waitForFunction(() => document.querySelectorAll('#presentation-timeline .timeline-line').length === 5, { timeout: 30000 });
  await pressExport(page, 'export-open');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-go')]);
  exported = join(dir, 'presentation.html');
  await download.saveAs(exported);
  await context.close();
}, 120_000);

afterAll(async () => {
  await browser?.close();
});

async function openViewer(options: object): Promise<{ page: Page; errors: string[] }> {
  const context = await browser.newContext({ ...options });
  await context.setOffline(true);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`file://${exported}`);
  await page.waitForFunction(() => document.documentElement.dataset.mode === 'viewer');
  await page.waitForFunction(() => document.querySelectorAll('#presentation-timeline .timeline-line').length === 5, { timeout: 30000 });
  await page.click('#pres-mode-timeline');
  await page.waitForFunction(() => (document.querySelector('#presentation-stage') as HTMLElement).dataset.view === 'timeline');
  await page.waitForTimeout(1500);
  return { page, errors };
}

describe.each([
  ['desktop 1500x950', { viewport: { width: 1500, height: 950 } }, 28, 28, 14, 0],
  ['phone 390x844', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, 48, 24, 10, 24],
] as const)('the activities in the viewer timeline on %s (FR-78 as amended in v1.14.0)', (_name, options, lineH, laneH, barH, nameRow) => {
  test('collapsed, the own bar alone and the indicator; pressed, the lanes whole with the names beside the bars, the fill, the fitted window', async () => {
    const { page, errors } = await openViewer(options);
    const line = (id: string) => `#presentation-timeline .timeline-line[data-row-id="${id}"]`;
    // A-01 collapsed: the own bar alone, centred, at the line's rhythm; the
    // indicator counting its five activities.
    const a01 = await page.evaluate((sel) => {
      const row = document.querySelector<HTMLElement>(sel)!;
      const plot = row.querySelector('.timeline-plot')!.getBoundingClientRect();
      const bar = row.querySelector('.timeline-bar')!.getBoundingClientRect();
      return {
        lanes: row.dataset.lanes,
        entryH: Math.round(row.querySelector('.timeline-entry')!.getBoundingClientRect().height),
        plotH: Math.round(plot.height),
        bar: [Math.round(bar.top - plot.top), Math.round(bar.height)],
        visible: [...row.querySelectorAll('.timeline-seg, .timeline-lane-label')].filter((s) => s.getClientRects().length > 0).length,
        indicator: row.querySelector('.timeline-indicator')!.textContent,
        expanded: row.querySelector('.timeline-plot-control')!.getAttribute('aria-expanded'),
        aria: row.querySelector('.timeline-chip')!.getAttribute('aria-label'),
      };
    }, line('row-1'));
    expect(a01.lanes).toBe('5'); // own + five activities, in five lanes
    expect(a01.entryH).toBe(lineH);
    expect(a01.plotH).toBe(laneH);
    expect(a01.bar).toEqual([(laneH - barH) / 2, barH]);
    expect(a01.visible).toBe(0);
    expect(a01.indicator).toBe('5');
    expect(a01.expanded).toBe('false');
    // Pressed on the plot: every lane whole, the plot the lane count times
    // the lane, below the chip row on a phone.
    await page.locator(`${line('row-1')} .timeline-plot-control`).click({ position: { x: 4, y: 4 } });
    await page.waitForTimeout(300);
    const open = await page.evaluate((sel) => {
      const row = document.querySelector<HTMLElement>(sel)!;
      const plot = row.querySelector('.timeline-plot')!.getBoundingClientRect();
      const marks = [...row.querySelectorAll<HTMLElement>('.timeline-bar, .timeline-seg')].map((m) => {
        const r = m.getBoundingClientRect();
        return { lane: Number(m.dataset.lane), top: r.top - plot.top, bottom: r.bottom - plot.top, h: r.height, title: m.title };
      });
      const names = [...row.querySelectorAll<HTMLElement>('.timeline-lane-label')].map((n) => {
        const r = n.getBoundingClientRect();
        const seg = [...row.querySelectorAll<HTMLElement>('.timeline-seg')]
          .find((s) => s.dataset.from === n.dataset.from && s.dataset.lane === n.dataset.lane)!
          .getBoundingClientRect();
        return {
          text: n.textContent,
          place: n.dataset.place,
          shown: n.getClientRects().length > 0,
          beside: r.right <= seg.left + 0.5 || r.left >= seg.right - 0.5,
          inPlot: r.left >= plot.left - 0.5 && r.right <= plot.right + 0.5,
          lane: Number(n.dataset.lane),
          top: r.top - plot.top,
          h: r.height,
        };
      });
      return {
        entryH: Math.round(row.querySelector('.timeline-entry')!.getBoundingClientRect().height),
        plotH: Math.round(plot.height),
        marks,
        names,
        expanded: row.querySelector('.timeline-plot-control')!.getAttribute('aria-expanded'),
      };
    }, line('row-1'));
    expect(open.expanded).toBe('true');
    expect(open.plotH).toBe(laneH * 5);
    expect(open.entryH).toBe(nameRow + laneH * 5);
    for (const m of open.marks) {
      // Whole: each bar inside its own lane's row, inside the plot.
      expect(m.top).toBeCloseTo(m.lane * laneH + (laneH - barH) / 2, 0);
      expect(m.h).toBe(barH);
      expect(m.bottom).toBeLessThanOrEqual(open.plotH);
    }
    // The names beside their bars, never on them, never past the plot.
    expect(open.names.map((n) => n.text)).toEqual(['Groundwork', 'Piping', 'Wiring', 'Testing', 'Handover']);
    for (const n of open.names.filter((x) => x.shown)) {
      expect(n.beside).toBe(true);
      expect(n.inPlot).toBe(true);
      expect(n.top).toBeCloseTo(n.lane * laneH, 0);
      expect(n.h).toBeCloseTo(laneH, 0);
    }
    expect(open.names.filter((x) => x.shown).length).toBeGreaterThanOrEqual(3);
    // The progress fill: the 100% activity's fill spans its segment.
    const fill = await page.evaluate((sel) => {
      const seg = [...document.querySelectorAll<HTMLElement>(`${sel} .timeline-seg`)].find((s) => s.title.startsWith('Groundwork'))!;
      return { segW: seg.getBoundingClientRect().width, fillW: seg.querySelector('.timeline-seg-fill')!.getBoundingClientRect().width };
    }, line('row-1'));
    expect(fill.fillW).toBeCloseTo(fill.segW - 2, 0); // the segment border
    // A press again collapses it.
    await page.locator(`${line('row-1')} .timeline-plot-control`).click({ position: { x: 4, y: 4 } });
    await page.waitForTimeout(300);
    expect(
      await page.evaluate((sel) => Math.round(document.querySelector<HTMLElement>(`${sel} .timeline-entry`)!.getBoundingClientRect().height), line('row-1')),
    ).toBe(lineH);
    // The accessible description carries the activities, the unreadable date as typed.
    expect(a01.aria).toContain('Activities');
    expect(await page.locator(`${line('row-3')} .timeline-chip`).getAttribute('aria-label')).toContain('15/03/2024');
    // A project without activities is as before: no segments, no indicator,
    // no plot control.
    const a05 = await page.evaluate((sel) => {
      const row = document.querySelector<HTMLElement>(sel)!;
      return {
        segs: row.querySelectorAll('.timeline-seg').length,
        indicator: !!row.querySelector('.timeline-indicator'),
        control: row.querySelector('.timeline-plot-control')!.tagName,
        marks: row.querySelectorAll('.timeline-bar, .timeline-point').length,
        entryH: Math.round(row.querySelector('.timeline-entry')!.getBoundingClientRect().height),
      };
    }, line('row-5'));
    expect(a05).toEqual({ segs: 0, indicator: false, control: 'SPAN', marks: 0, entryH: lineH }); // "No dates", as before
    // The fitted window includes the activities' extents: with every line
    // open, after Fit, every segment is inside the plot.
    for (const id of ['row-1', 'row-4']) {
      await page.locator(`${line(id)} .timeline-plot-control`).click({ position: { x: 4, y: 4 } });
    }
    await page.click('#pres-fit');
    await page.waitForTimeout(1200);
    const inside = await page.evaluate(() => {
      const plot = document.querySelector('#presentation-timeline .timeline-plot')!.getBoundingClientRect();
      const out = [...document.querySelectorAll<HTMLElement>('#presentation-timeline .timeline-seg')]
        .filter((s) => s.getClientRects().length > 0)
        .map((s) => {
          const r = s.getBoundingClientRect();
          return { ok: r.left >= plot.left - 0.5 && r.right <= plot.right + 0.5 };
        });
      return { count: out.length, all: out.every((o) => o.ok) };
    });
    expect(inside.count).toBe(7);
    expect(inside.all).toBe(true);
    expect(errors).toEqual([]);
    await page.context().close();
  }, 90_000);
});
