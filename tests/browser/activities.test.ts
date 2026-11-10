// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { parseWorkState, serialiseWorkState } from '../../src/workstate';

// The activities in the timeline (FR-78) in a real layout, headless Chromium,
// offline: a work state of schema 10 with activities is opened in the
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
  if (!existsSync(BUILT)) throw new Error('dist/build/index.html is missing: run the build first');
  // A schema-10 work state built through the repository's own parser and
  // serializer on the v6 fixture: activities on A-01 (five, deliberately
  // overlapping, so lanes and the badge are exercised), two on A-04, none on
  // A-02, and one with an unreadable date on A-03.
  const ws = parseWorkState(readFileSync(V6, 'utf8'));
  const byId: Record<string, number> = Object.fromEntries(ws.rows.map((r, i) => [r.values.ID, i]));
  ws.rows[byId['A-01']].activities = [
    { label: 'Groundwork', start: '2024-01-05', end: '2024-01-20', progress: 100 },
    { label: 'Piping', start: '2024-01-10', end: '2024-01-25', progress: 60 },
    { label: 'Wiring', start: '2024-01-15', end: '2024-01-30', progress: 0 },
    { label: 'Testing', start: '2024-01-20', end: '2024-02-01', progress: null },
    { label: 'Handover', start: '2024-02-01', end: '2024-02-15', progress: 10 },
  ];
  ws.rows[byId['A-01']].activityImport = { file: 'plan.pdf', page: 1, columns: { label: 'Post', start: 'Från', end: 'Till', progress: 'Klart' } };
  ws.rows[byId['A-04']].activities = [
    { label: 'Survey', start: '2024-02-02', end: '2024-02-10', progress: 100 },
    { label: 'Report', start: '2024-02-20', end: '2024-03-01', progress: 40 },
  ];
  ws.rows[byId['A-03']].activities = [{ label: 'Unknown dates', start: '15/03/2024', end: '2024-03-15', progress: 50 }];
  const dir = mkdtempSync(join(tmpdir(), 'mapvibes-activities-'));
  const workFile = join(dir, 'work.json');
  writeFileSync(workFile, serialiseWorkState(ws, new Date('2026-01-02T03:04:05.000Z')));

  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
  await context.setOffline(true);
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('file://') || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
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
  await page.waitForFunction(() => document.querySelectorAll('#presentation-timeline .timeline-line').length === 5, { timeout: 30000 });
  await page.click('#export-open');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-go')]);
  exported = join(dir, 'presentation.html');
  await download.saveAs(exported);
  await context.close();
}, 120_000);

afterAll(async () => {
  await browser?.close();
});

async function openViewer(options: object): Promise<{ page: Page; errors: string[] }> {
  const context = await browser.newContext({ ...(options as object) });
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

const box = (page: Page, sel: string) => page.locator(sel).first().boundingBox();

describe.each([
  ['desktop 1500x950', { viewport: { width: 1500, height: 950 } }, 28, 7, 9, 2],
  ['phone 390x844', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, 40, 4, 6, 1],
] as const)('the activities in the viewer timeline on %s (FR-78)', (name, options, lineH, segH, laneStep, segPad) => {
  test('packed sub-lanes in the unchanged line, the badge, expansion and collapse, the fill, the fitted window', async () => {
    const { page, errors } = await openViewer(options);
    // A-01's line: the own bar in lane 0 and five activity segments packed.
    const a01 = await page.evaluate(() => {
      const row = [...document.querySelectorAll<HTMLElement>('#presentation-timeline .timeline-line')].find((r) => r.dataset.rowId === 'row-1')!;
      const plot = row.querySelector('.timeline-plot')!.getBoundingClientRect();
      const marks = [...row.querySelectorAll<HTMLElement>('.timeline-bar, .timeline-seg')].map((m) => {
        const r = m.getBoundingClientRect();
        return { cls: m.className, lane: m.dataset.lane, kind: m.dataset.kind, x: r.x, w: r.width, y: r.y - plot.y, h: r.height };
      });
      const badge = row.querySelector('.timeline-badge-more');
      const entry = row.querySelector('.timeline-entry')!.getBoundingClientRect();
      return {
        lanes: row.dataset.lanes,
        entryH: Math.round(entry.height),
        plotH: Math.round(plot.height),
        marks,
        badge: badge ? { text: badge.textContent, expanded: badge.getAttribute('aria-expanded') } : null,
        aria: row.querySelector('.timeline-entry')!.getAttribute('aria-label'),
      };
    });
    expect(a01.lanes).toBe('5'); // own + five activities, packed into five lanes
    expect(a01.entryH).toBe(lineH); // the line keeps its one row, collapsed
    const segs = a01.marks.filter((m) => m.cls.includes('timeline-seg'));
    expect(segs).toHaveLength(5);
    // Collapsed, only the packed sub-lane rows show: lanes 0..2 (the badge
    // hides the rest).
    const visible = segs.filter((m) => m.lane !== undefined && Number(m.lane) < 3);
    expect(visible).toHaveLength(3);
    // The packed sub-lane rhythm: segments of segH, stepping laneStep, from segPad.
    for (const seg of visible) expect(seg.h).toBe(segH);
    const lanes = [...new Set(visible.map((s) => Number(s.lane)))].sort((a, b) => a - b);
    const tops = lanes.map((l) => visible.find((s) => Number(s.lane) === l)!.y);
    for (let i = 0; i < tops.length; i++) expect(tops[i]).toBeCloseTo(segPad + lanes[i] * laneStep, 0);
    // The own bar is lane 0.
    expect(a01.marks.find((m) => m.cls.includes('timeline-bar'))!.lane).toBe('0');
    // The badge counts the hidden spans and expands to full-height lanes.
    const hidden = Number(a01.lanes) - 3; // spans past the three packed rows
    expect(a01.badge).not.toBeNull();
    expect(a01.badge!.text).toBe(`+${hidden} more`);
    expect(a01.badge!.expanded).toBe('false');
    await page.locator('#presentation-timeline .timeline-line[data-row-id="row-1"] .timeline-badge-more').click();
    await page.waitForTimeout(300);
    const expanded = await page.evaluate(() => {
      const row = document.querySelector<HTMLElement>('#presentation-timeline .timeline-line[data-row-id="row-1"]')!;
      const entry = row.querySelector('.timeline-entry')!.getBoundingClientRect();
      const bar = row.querySelector('.timeline-bar')!.getBoundingClientRect();
      const seg = row.querySelector('.timeline-seg')!.getBoundingClientRect();
      return { entryH: Math.round(entry.height), lanes: Number(row.dataset.lanes), barH: Math.round(bar.height), segH: Math.round(seg.height), expanded: row.dataset.expanded, ariaExpanded: row.querySelector('.timeline-badge-more')!.getAttribute('aria-expanded') };
    });
    expect(expanded.entryH).toBe(lineH * Number(a01.lanes));
    expect(expanded.barH).toBeGreaterThan(segH);
    expect(expanded.expanded).toBe('true');
    expect(expanded.ariaExpanded).toBe('true');
    // Collapse on the second activation.
    await page.locator('#presentation-timeline .timeline-line[data-row-id="row-1"] .timeline-badge-more').click();
    await page.waitForTimeout(300);
    const collapsed = await page.evaluate(() => Math.round(document.querySelector<HTMLElement>('#presentation-timeline .timeline-line[data-row-id="row-1"] .timeline-entry')!.getBoundingClientRect().height));
    expect(collapsed).toBe(lineH);
    // The progress fill: the 100% activity's fill spans its segment.
    const fill = await page.evaluate(() => {
      const seg = [...document.querySelectorAll<HTMLElement>('#presentation-timeline .timeline-line[data-row-id="row-1"] .timeline-seg')].find((s) => s.title!.startsWith('Groundwork'))!;
      const r = seg.getBoundingClientRect();
      const f = seg.querySelector('.timeline-seg-fill')!.getBoundingClientRect();
      return { segW: r.width, fillW: f.width };
    });
    expect(fill.fillW).toBeCloseTo(fill.segW - 2, 0); // the segment border
    // The accessible description carries the activities, the unreadable date as typed.
    expect(a01.aria).toContain('Activities');
    const a03aria = await page.locator('#presentation-timeline .timeline-line[data-row-id="row-3"] .timeline-entry').getAttribute('aria-label');
    expect(a03aria).toContain('15/03/2024'); // the unreadable date, as typed
    // A project without activities is exactly as before: one centred bar, no
    // segments, no badge.
    const a05 = await page.evaluate(() => {
      const row = document.querySelector<HTMLElement>('#presentation-timeline .timeline-line[data-row-id="row-5"]')!;
      return { segs: row.querySelectorAll('.timeline-seg').length, badge: !!row.querySelector('.timeline-badge-more'), marks: row.querySelectorAll('.timeline-bar, .timeline-point').length, entryH: Math.round(row.querySelector('.timeline-entry')!.getBoundingClientRect().height) };
    });
    expect(a05).toEqual({ segs: 0, badge: false, marks: 0, entryH: lineH }); // "No dates", as before
    // The fitted window includes the activities' extents: after Fit, every
    // segment is inside the plot.
    await page.click('#pres-fit');
    await page.waitForTimeout(1200);
    const inside = await page.evaluate(() => {
      const plot = document.querySelector('#presentation-timeline .timeline-plot')!.getBoundingClientRect();
      const out = [...document.querySelectorAll<HTMLElement>('#presentation-timeline .timeline-seg')].filter((s) => s.getClientRects().length > 0).map((s) => {
        const r = s.getBoundingClientRect();
        return { title: s.title, left: Math.round(r.left - plot.left), right: Math.round(r.right - plot.left), plotW: Math.round(plot.width), ok: r.left >= plot.left - 0.5 && r.right <= plot.right + 0.5 };
      });
      return { all: out.every((o) => o.ok), out };
    });
    expect(inside.all).toBe(true);
    expect(errors).toEqual([]);
    await page.context().close();
  }, 90_000);
});
