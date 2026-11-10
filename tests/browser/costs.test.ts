// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { DATA_ISLAND_ID } from '../../src/singlefile';
import { parseWorkState } from '../../src/workstate';

// The costs view (FR-79) and the events (FR-80) in a real layout, headless
// Chromium, offline: the demo is loaded in the application, exported from
// the costs view, and the exported viewer is measured on a desktop and a
// phone -- the costs line and its three sub-lanes, the amount fills on the
// two scales, the totals row at the top, the events' hairlines and chips in
// both schedule views, and the map view without them. Run after the build
// (npm run build).
const BUILT = join(process.cwd(), 'dist', 'build', 'index.html');

let browser: Browser;
let exported: string;
const measured: string[] = [];

beforeAll(async () => {
  if (!existsSync(BUILT)) throw new Error('dist/build/index.html is missing: run the build first');
  const dir = mkdtempSync(join(tmpdir(), 'mapvibes-costs-'));
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
  await page.click('#load-demo');
  await page.waitForFunction(() => document.querySelectorAll('#row-table-body tr').length === 12);
  await page.waitForFunction(() => document.documentElement.dataset.segment === 'map', undefined, { timeout: 30000 });
  await page.click('#tab-presentation');
  await page.click('#pres-mode-costs');
  await page.waitForFunction(() => document.querySelectorAll('#presentation-costs .timeline-line').length === 12, undefined, { timeout: 30000 });
  await page.click('#export-open');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-go')]);
  exported = join(dir, 'presentation.html');
  await download.saveAs(exported);
  await context.close();
}, 120_000);

afterAll(async () => {
  await browser?.close();
  console.log(`costs view and events, measured:\n${measured.join('\n')}`);
});

async function openViewer(options: object): Promise<{ page: Page; errors: string[] }> {
  const context = await browser.newContext({ ...(options as object) });
  await context.setOffline(true);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`file://${exported}`);
  await page.waitForFunction(() => document.documentElement.dataset.mode === 'viewer');
  await page.waitForFunction(() => document.querySelectorAll('#presentation-costs .timeline-line').length === 12, undefined, { timeout: 30000 });
  await page.waitForTimeout(1000);
  return { page, errors };
}

test('the exported file carries the events and the costs view in its island', () => {
  const page = readFileSync(exported, 'utf8');
  const island = new RegExp(`<script[^>]*id="${DATA_ISLAND_ID}"[^>]*>([\\s\\S]*?)</script>`).exec(page)!;
  const data = JSON.parse(island[1]) as { workState: unknown };
  const ws = parseWorkState(JSON.stringify(data.workState));
  expect(ws.presentationMode).toBe('costs');
  expect(ws.events).toEqual([
    { id: 'e1', date: '2024-06', label: 'Review' },
    { id: 'e2', date: '2026-03-15', label: 'Decision' },
  ]);
});

describe.each([
  ['desktop 1500x950', { viewport: { width: 1500, height: 950 } }, 46, 46, [3, 17, 31]],
  ['phone 390x844', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, 64, 44, [2, 16, 30]],
] as const)('the costs view and the events in the viewer on %s', (name, options, lineH, plotH, tops) => {
  test('the viewer opens in the costs view; the line, its three sub-lanes, and the fills on the scale of the largest year amount', async () => {
    const { page, errors } = await openViewer(options);
    expect(await page.getAttribute('#presentation-stage', 'data-view')).toBe('costs');
    expect(await page.getAttribute('#pres-mode-costs', 'aria-pressed')).toBe('true');
    const m = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>('#presentation-costs')!;
      const lines = [...root.querySelectorAll<HTMLElement>('.timeline-line')];
      const of = (row: HTMLElement) => {
        const plot = row.querySelector('.timeline-plot')!.getBoundingClientRect();
        return [...row.querySelectorAll<HTMLElement>('.timeline-seg')].map((s) => {
          const r = s.getBoundingClientRect();
          const f = s.querySelector('.timeline-seg-fill')!.getBoundingClientRect();
          return { series: s.dataset.series!, lane: Number(s.dataset.lane), share: Number(s.dataset.share), top: r.top - plot.top, h: r.height, w: r.width, fill: f.width, title: s.title, label: s.dataset.label, text: s.textContent };
        });
      };
      return {
        heights: [...new Set(lines.map((l) => Math.round(l.getBoundingClientRect().height)))],
        plots: [...new Set(lines.map((l) => Math.round(l.querySelector('.timeline-plot')!.getBoundingClientRect().height)))],
        segs: lines.map(of),
        names: lines.map((l) => l.querySelector('.timeline-title')!.textContent),
        badges: root.querySelectorAll('.timeline-badge-more').length,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    });
    expect(m.heights).toEqual([lineH]);
    expect(m.plots).toEqual([plotH]);
    expect(m.badges).toBe(0);
    expect(m.overflow).toBeLessThanOrEqual(0);
    // The demo's gaps: an item without economics is an empty named line.
    expect(m.segs.filter((s) => s.length === 0)).toHaveLength(1);
    expect(m.names).toHaveLength(12);
    const all = m.segs.flat();
    // Three sub-lanes of 12-pixel bars: budget, forecast, outcome where a year has all three.
    for (const s of all) {
      expect(s.h).toBe(12);
      expect(s.top).toBeCloseTo(tops[s.lane], 0);
      expect(s.lane).toBeLessThan(3);
    }
    const full = m.segs[0].filter((s) => s.title.includes(' 2019:'));
    expect(full.map((s) => [s.series, s.lane])).toEqual([
      ['budget', 0],
      ['forecast', 1],
      ['outcome', 2],
    ]);
    // A fill is the amount's share of its year cell; the largest amount fills it.
    for (const s of all) expect(s.fill).toBeCloseTo(s.share * s.w, 0);
    const largest = all.reduce((a, b) => (b.share > a.share ? b : a));
    expect(largest.share).toBe(1);
    expect(largest.title).toContain('663,000 kr');
    measured.push(`${name}: line ${m.heights[0]} px, plot ${m.plots[0]} px, sub-lane tops ${[...new Set(all.map((s) => Math.round(s.top)))].sort((a, b) => a - b).join(', ')}, bars 12 px, year cell ${all[0].w.toFixed(1)} px, ${all.length} amount spans on 11 lines, figures shown on ${all.filter((s) => s.label !== 'none').length}`);
    expect(errors).toEqual([]);
    await page.context().close();
  }, 60_000);

  test('the totals row is at the top, three bars per year on its own scale, and stays there while the lines scroll', async () => {
    const { page, errors } = await openViewer(options);
    const m = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>('#presentation-costs')!;
      const totals = root.querySelector<HTMLElement>('.timeline-totals')!;
      const scroll = root.querySelector<HTMLElement>('.timeline-scroll')!;
      const top = () => totals.getBoundingClientRect().top - scroll.getBoundingClientRect().top;
      const before = top();
      scroll.scrollTop = 200;
      const segs = [...totals.querySelectorAll<HTMLElement>('.timeline-seg')].map((s) => ({ series: s.dataset.series, share: Number(s.dataset.share), title: s.title, lane: Number(s.dataset.lane), w: s.getBoundingClientRect().width, fill: s.querySelector('.timeline-seg-fill')!.getBoundingClientRect().width }));
      return { first: root.querySelector('.timeline-lines')!.firstElementChild === totals, before, after: top(), scrolled: scroll.scrollTop, h: totals.getBoundingClientRect().height, name: totals.querySelector('.timeline-name')!.textContent, segs };
    });
    expect(m.first).toBe(true);
    expect(m.before).toBeCloseTo(0, 0);
    if (m.scrolled > 0) expect(m.after).toBeCloseTo(0, 0);
    expect(m.h).toBe(lineH);
    expect(m.name).toBe('Total per yearthousands of kr');
    // The demo: 12 budget years, 12 forecast years, 8 outcome years.
    const count = (series: string) => m.segs.filter((s) => s.series === series).length;
    expect([count('budget'), count('forecast'), count('outcome')]).toEqual([12, 12, 8]);
    const largest = m.segs.reduce((a, b) => (b.share > a.share ? b : a));
    expect(largest.title).toBe('Budget 2026: 3,201,000 kr');
    expect(largest.share).toBe(1);
    expect(largest.fill).toBeCloseTo(largest.w, 0);
    // On the totals' own scale, no other bar is saturated.
    expect(m.segs.filter((s) => s.share === 1)).toHaveLength(1);
    const shares = m.segs.map((s) => s.share);
    measured.push(`${name}: totals row ${m.h} px at the top (${m.before.toFixed(0)} px before and ${m.after.toFixed(0)} px after scrolling ${m.scrolled} px), ${m.segs.length} bars, shares ${Math.min(...shares).toFixed(2)} to ${Math.max(...shares).toFixed(2)} of the largest year total`);
    expect(errors).toEqual([]);
    await page.context().close();
  }, 60_000);

  test('each event is a 1-pixel hairline crossing the whole body with its chip at the top, in both schedule views; the map view has none', async () => {
    const { page, errors } = await openViewer(options);
    for (const view of ['costs', 'timeline'] as const) {
      await page.locator(`#pres-mode-${view}`).scrollIntoViewIfNeeded();
      await page.click(`#pres-mode-${view}`);
      await page.waitForFunction((v) => (document.querySelector('#presentation-stage') as HTMLElement).dataset.view === v, view);
      const m = await page.evaluate((v) => {
        const root = document.querySelector<HTMLElement>(`#presentation-${v}`)!;
        const body = root.querySelector('.timeline-body')!.getBoundingClientRect();
        const strip = root.querySelector('.timeline-event-strip')!.getBoundingClientRect();
        const axis = root.querySelector('.timeline-axis')!.getBoundingClientRect();
        const lines = [...root.querySelectorAll<HTMLElement>('.timeline-event-lines .timeline-event-line')].map((l) => {
          const r = l.getBoundingClientRect();
          return { x: r.left, w: r.width, top: r.top - body.top, h: r.height, events: getComputedStyle(l.parentElement!).pointerEvents };
        });
        const chips = [...root.querySelectorAll<HTMLElement>('.timeline-event-chip')].map((c) => {
          const r = c.getBoundingClientRect();
          return { text: c.textContent, title: c.title, row: c.dataset.row, x: r.left, right: r.right, top: r.top - strip.top, h: r.height };
        });
        return { bodyH: body.height, stripH: strip.height, stripTop: strip.top - axis.bottom, bodyTop: body.top - strip.bottom, lines, chips };
      }, view);
      expect(m.lines).toHaveLength(2);
      for (const l of m.lines) {
        expect(l.w).toBe(1);
        expect(l.top).toBeCloseTo(0, 0);
        expect(l.h).toBeCloseTo(m.bodyH, 0);
        expect(l.events).toBe('none');
      }
      // The strip sits between the axis and the body.
      expect(m.stripTop).toBeCloseTo(0, 0);
      expect(m.bodyTop).toBeCloseTo(0, 0);
      expect(m.chips.map((c) => [c.text, c.title])).toEqual([
        ['Review', '2024-06: Review'],
        ['Decision', '2026-03-15: Decision'],
      ]);
      // A chip starts at its hairline.
      m.chips.forEach((c, i) => expect(c.x).toBeCloseTo(m.lines[i].x, 0));
      // The chips never overlap: side by side in one row, or staggered into two.
      const [a, b] = m.chips;
      if (a.row === b.row) expect(b.x).toBeGreaterThanOrEqual(a.right);
      else expect([a.row, b.row]).toEqual(['0', '1']);
      expect(m.stripH).toBe(a.row === b.row ? 22 : 42);
      measured.push(`${name}, ${view}: hairlines 1 px wide over the body's ${m.bodyH.toFixed(0)} px; chips ${m.chips.map((c) => `${c.text} row ${c.row}`).join(', ')}; strip ${m.stripH} px`);
    }
    await page.locator('#pres-mode-map').scrollIntoViewIfNeeded();
    await page.click('#pres-mode-map');
    await page.waitForFunction(() => (document.querySelector('#presentation-stage') as HTMLElement).dataset.view === 'map');
    const visible = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.timeline-event-line, .timeline-event-chip')].filter((e) => e.getClientRects().length > 0).length);
    expect(visible).toBe(0);
    expect(errors).toEqual([]);
    await page.context().close();
  }, 60_000);
});
