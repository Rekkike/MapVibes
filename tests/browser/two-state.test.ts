// @vitest-environment node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

// The two-state chapter (v1.14.0) in a real layout, headless Chromium,
// offline, on the demo in the application, at 1500 x 950 and 390 x 844 in
// both themes, with the clock set to 2026-11-11: the split of a line's
// controls, the timeline's two states and the multi-open comparison with the
// names beside the bars, the costs split with the budget's one style and
// the quiet tick, and the today mark. Run after the build (npm run build).
const BUILT = join(process.cwd(), 'dist', 'build', 'index.html');
const TODAY = new Date(2026, 10, 11, 10, 0);

let browser: Browser;
const measured: string[] = [];

beforeAll(async () => {
  if (!existsSync(BUILT)) throw new Error('dist/build/index.html is missing: run the build first');
  browser = await chromium.launch();
}, 60_000);

afterAll(async () => {
  await browser?.close();
  console.log(`the two states and the today mark, measured:\n${measured.join('\n')}`);
});

const lum = (c: number[]) => {
  const f = (v: number) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};
const ratio = (a: string, b: string) => {
  const [x, y] = [a, b].map((s) => lum(s.match(/[\d.]+/g)!.slice(0, 3).map(Number))).sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

async function demo(options: object, clearBudget = false): Promise<{ page: Page; errors: string[] }> {
  const context = await browser.newContext({ ...options });
  await context.setOffline(true);
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('file://') || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    return route.abort();
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(TODAY);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`file://${BUILT}`);
  await page.evaluate(() => {
    const s = document.querySelector<HTMLSelectElement>('#select-language')!;
    s.value = 'en';
    s.dispatchEvent(new Event('change'));
    document.querySelector<HTMLButtonElement>('#load-demo')!.click();
  });
  await page.waitForFunction(() => document.documentElement.dataset.segment === 'map', undefined, { timeout: 30000 });
  if (clearBudget) {
    // A year with forecast and outcome but no budget: North gate's 2019.
    await page.evaluate(() => {
      document.querySelector<HTMLButtonElement>('#tab-information')!.click();
      const cell = document.querySelector<HTMLInputElement>('#row-table-body tr .cell-input[data-header="Budget 2019"]')!;
      cell.value = '';
      cell.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('#tab-presentation')!.click());
  return { page, errors };
}

async function view(page: Page, v: 'timeline' | 'costs'): Promise<void> {
  await page.evaluate((x) => document.querySelector<HTMLButtonElement>(`#pres-mode-${x}`)!.click(), v);
  await page.waitForTimeout(400);
}

// Presses a line's plot, at its leading edge clear of the bars.
async function press(page: Page, v: string, nth: number): Promise<void> {
  const control = page.locator(`#presentation-${v} button.timeline-plot-control`).nth(nth);
  await control.scrollIntoViewIfNeeded();
  await control.click({ position: { x: 3, y: 3 } });
  await page.waitForTimeout(150);
}

describe.each([
  ['1500x950 light', { viewport: { width: 1500, height: 950 }, colorScheme: 'light' }, false],
  ['1500x950 dark', { viewport: { width: 1500, height: 950 }, colorScheme: 'dark' }, false],
  ['390x844 light', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, colorScheme: 'light' }, true],
  ['390x844 dark', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, colorScheme: 'dark' }, true],
] as const)('the two states at %s', (name, options, narrow) => {
  const lineH = narrow ? 48 : 28;
  const lane = narrow ? 24 : 28;
  const nameRow = narrow ? 24 : 0;

  test('the split: the chip opens the card beside it (docked on a phone); the plot expands; two targets per line', async () => {
    const { page, errors } = await demo(options);
    await view(page, 'timeline');
    const g = await page.evaluate(() => {
      const li = [...document.querySelectorAll<HTMLElement>('#presentation-timeline .timeline-line')][4];
      const r = (e: Element) => e.getBoundingClientRect();
      const chip = r(li.querySelector('.timeline-chip')!);
      const plot = r(li.querySelector('.timeline-plot-control')!);
      const ind = r(li.querySelector('.timeline-indicator')!);
      return { chip: [chip.left, chip.top, chip.width, chip.height], plot: [plot.left, plot.top, plot.width, plot.height], ind: [ind.width, ind.height], indInChip: ind.top >= chip.top - 0.5 && ind.bottom <= chip.bottom + 0.5, overlap: chip.right > plot.left + 0.5 && chip.bottom > plot.top + 0.5 && plot.bottom > chip.top + 0.5, stops: document.querySelectorAll('#presentation-timeline .timeline-lines button').length, nested: document.querySelectorAll('#presentation-timeline button button').length };
    });
    expect(g.chip[3]).toBe(lane);
    expect(g.plot[3]).toBe(lane);
    expect(g.overlap).toBe(false);
    expect(g.indInChip).toBe(true);
    expect(g.stops).toBe(17); // twelve chips, five plots with activities
    expect(g.nested).toBe(0);
    // The chip opens the card.
    await page.locator('#presentation-timeline .timeline-chip').nth(4).click();
    await page.waitForFunction(() => document.getElementById('presentation-card')!.dataset.state === 'open');
    await page.waitForTimeout(300);
    const card = (await page.locator('#presentation-card').boundingBox())!;
    const dock = await page.getAttribute('#presentation-card', 'data-dock');
    if (narrow) expect(dock).toBe('bottom');
    else expect(Math.abs(card.x - (g.chip[0] + g.chip[2] + 28))).toBeLessThanOrEqual(1); // beside the chip, its gap of 28 pixels
    expect(await page.evaluate(() => document.querySelectorAll('#presentation-timeline .timeline-line[data-expanded="true"]').length)).toBe(0);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    // The plot expands, and leaves the card alone.
    await press(page, 'timeline', 3);
    expect(await page.evaluate(() => [document.querySelectorAll('#presentation-timeline .timeline-line[data-expanded="true"]').length, document.getElementById('presentation-card')!.dataset.state])).toEqual([1, 'closed']);
    measured.push(`${name}: chip ${g.chip[2].toFixed(0)} x ${g.chip[3]} px, plot ${g.plot[2].toFixed(0)} x ${g.plot[3]} px, separate; indicator ${g.ind[0].toFixed(0)} x ${g.ind[1].toFixed(0)} px in the chip's row; 17 tab stops; card ${narrow ? 'docked at the bottom' : `at the chip's right edge + 28 px (x ${card.x.toFixed(0)})`}`);
    expect(errors).toEqual([]);
    await page.context().close();
  }, 90_000);

  test('the timeline: collapsed, the own bar alone; all five open at once, whole, the names beside the bars', async () => {
    const { page, errors } = await demo(options);
    await view(page, 'timeline');
    const quiet = await page.evaluate(() => {
      const lines = [...document.querySelectorAll<HTMLElement>('#presentation-timeline .timeline-line')];
      return { heights: [...new Set(lines.map((l) => Math.round(l.getBoundingClientRect().height)))], segs: [...document.querySelectorAll('#presentation-timeline .timeline-seg')].filter((s) => s.getClientRects().length > 0).length, band: Math.round(document.querySelector('#presentation-timeline .timeline-phase')!.getBoundingClientRect().height) };
    });
    expect(quiet.heights).toEqual([lineH]);
    expect(quiet.segs).toBe(0);
    expect(quiet.band).toBe(lane);
    for (let i = 0; i < 5; i++) await press(page, 'timeline', i);
    await page.click('#pres-fit');
    await page.waitForTimeout(300);
    const open = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>('#presentation-timeline')!;
      const lines = [...root.querySelectorAll<HTMLElement>('.timeline-line[data-expanded="true"]')];
      const names = lines.flatMap((l) => [...l.querySelectorAll<HTMLElement>('.timeline-lane-label')]);
      const shown = names.filter((n) => n.getClientRects().length > 0);
      const panel = getComputedStyle(root).backgroundColor;
      return {
        open: lines.length,
        sizes: lines.map((l) => [Number(l.dataset.lanes), Math.round(l.getBoundingClientRect().height), Math.round(l.querySelector('.timeline-plot')!.getBoundingClientRect().height)]),
        whole: lines.every((l) => { const p = l.querySelector('.timeline-plot')!.getBoundingClientRect(); return [...l.querySelectorAll('.timeline-bar, .timeline-seg')].every((m) => { const r = m.getBoundingClientRect(); return r.top >= p.top - 0.5 && r.bottom <= p.bottom + 0.5; }); }),
        names: names.length,
        shown: shown.length,
        onBar: shown.filter((n) => { const r = n.getBoundingClientRect(); return [...n.closest('li')!.querySelectorAll<HTMLElement>('.timeline-seg, .timeline-bar')].some((m) => m.dataset.lane === n.dataset.lane && (() => { const q = m.getBoundingClientRect(); return r.left < q.right - 0.5 && q.left < r.right - 0.5; })()); }).length,
        colour: shown[0] ? getComputedStyle(shown[0]).color : '',
        panel,
        font: shown[0] ? getComputedStyle(shown[0]).fontSize : '',
        content: root.querySelector('.timeline-scroll')!.scrollHeight,
      };
    });
    expect(open.open).toBe(5);
    for (const [lanes, h, plot] of open.sizes) {
      expect(plot).toBe(lanes * lane);
      expect(h).toBe(nameRow + lanes * lane);
    }
    expect(open.whole).toBe(true);
    expect(open.names).toBe(21);
    expect(open.shown).toBeGreaterThanOrEqual(15);
    expect(open.onBar).toBe(0);
    expect(ratio(open.colour, open.panel)).toBeGreaterThan(7);
    measured.push(`${name}: collapsed ${quiet.heights[0]} px, 0 segments, band ${quiet.band} px; five open at once after Fit: ${open.sizes.map(([l, h]) => `${l} lanes ${h} px`).join(', ')}, every lane whole; names ${open.shown} of ${open.names} beside their bars (${open.font}, contrast ${ratio(open.colour, open.panel).toFixed(2)}), none on a bar; content ${open.content} px`);
    expect(errors).toEqual([]);
    await page.context().close();
  }, 90_000);

  test('the costs view: the budget spine in the budget\'s one style, the quiet tick, the sub-lanes when pressed, the totals row unchanged', async () => {
    const { page, errors } = await demo(options, true);
    await view(page, 'costs');
    const quiet = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>('#presentation-costs')!;
      const lines = [...root.querySelectorAll<HTMLElement>('.timeline-line')];
      const shown = [...root.querySelectorAll<HTMLElement>('.timeline-line .timeline-seg')].filter((s) => s.getClientRects().length > 0);
      const spine = shown[0];
      const plot = spine.closest('li')!.querySelector('.timeline-plot')!.getBoundingClientRect();
      const r = spine.getBoundingClientRect();
      const fill = getComputedStyle(spine.querySelector('.timeline-seg-fill')!);
      const faint = getComputedStyle(spine.querySelector('.timeline-seg-fill')!, '::before');
      const tick = root.querySelector<HTMLElement>('.timeline-year-tick');
      const tb = tick?.getBoundingClientRect();
      return {
        heights: [...new Set(lines.map((l) => Math.round(l.getBoundingClientRect().height)))],
        series: [...new Set(shown.map((s) => s.dataset.series))],
        spine: [r.top - plot.top, r.height],
        edge: `${fill.borderTopWidth} ${fill.borderTopStyle}`, fillBg: fill.backgroundColor, faint: faint.opacity, edgeColour: fill.borderTopColor, panel: getComputedStyle(root).backgroundColor,
        tick: tick ? { title: tick.title, w: tb!.width, mid: getComputedStyle(tick, '::after').width, h: tb!.height } : null,
        totals: Math.round(root.querySelector('.timeline-totals')!.getBoundingClientRect().height),
        totalsBudget: `${getComputedStyle(root.querySelector('.timeline-totals .timeline-seg[data-series="budget"] .timeline-seg-fill')!).borderTopStyle} ${getComputedStyle(root.querySelector('.timeline-totals .timeline-seg[data-series="budget"] .timeline-seg-fill')!, '::before').opacity}`,
        outcome: getComputedStyle(root.querySelector('.timeline-totals .timeline-seg[data-series="outcome"] .timeline-seg-fill')!).backgroundColor,
      };
    });
    expect(quiet.heights).toEqual([lineH]);
    expect(quiet.series).toEqual(['budget']);
    expect(quiet.spine[0]).toBeCloseTo((lane - 12) / 2, 0);
    expect(quiet.spine[1]).toBe(12);
    expect(quiet.edge).toMatch(/^1\.5px solid|^1px solid/);
    expect(quiet.fillBg).toBe('rgba(0, 0, 0, 0)');
    expect(quiet.faint).toBe('0.4');
    expect(ratio(quiet.edgeColour, quiet.panel)).toBeGreaterThan(3);
    expect(quiet.tick).not.toBeNull();
    expect(quiet.tick!.title).toBe('2019: Forecast, Outcome, no budget');
    expect(quiet.totals).toBe(narrow ? 64 : 46);
    expect(quiet.totalsBudget).toBe('solid 0.4');
    expect(quiet.outcome).not.toBe('rgba(0, 0, 0, 0)');
    // Pressed: the sub-lanes at today's 46/64 pixels; the tick gives way.
    await press(page, 'costs', 0);
    const open = await page.evaluate(() => {
      const l = document.querySelector<HTMLElement>('#presentation-costs .timeline-line[data-expanded="true"]')!;
      const plot = l.querySelector('.timeline-plot')!.getBoundingClientRect();
      const tops = [...new Set([...l.querySelectorAll<HTMLElement>('.timeline-seg')].filter((s) => s.getClientRects().length > 0).map((s) => `${s.dataset.series}@${Math.round(s.getBoundingClientRect().top - plot.top)}`))];
      return { h: Math.round(l.getBoundingClientRect().height), tops, tick: l.querySelector('.timeline-year-tick')!.getClientRects().length };
    });
    expect(open.h).toBe(narrow ? 64 : 46);
    // The three sub-lanes at the costs view's tops; a year without a budget
    // packs its series upwards (FR-79's shared lane layout).
    const tops = narrow ? [0, 14, 28] : [3, 17, 31];
    for (const t of open.tops) expect(tops).toContain(Number(t.split('@')[1]));
    expect(open.tops).toContain(`budget@${tops[0]}`);
    expect(open.tops).toContain(`outcome@${tops[2]}`);
    expect(open.tops.some((t) => t.startsWith('outcome'))).toBe(true);
    expect(open.tick).toBe(0);
    measured.push(`${name}: costs collapsed ${quiet.heights[0]} px, the budget spine 12 px at ${quiet.spine[0].toFixed(0)} px, ${quiet.edge} edge with a 0.4 fill (edge contrast ${ratio(quiet.edgeColour, quiet.panel).toFixed(2)}); tick "${quiet.tick!.title}"; opened ${open.h} px (${open.tops.join(', ')}); totals ${quiet.totals} px, its budget ${quiet.totalsBudget}`);
    expect(errors).toEqual([]);
    await page.context().close();
  }, 90_000);

  test('the today mark: a 2-pixel dashed line at 2026-11-11 in both views, distinct from the events, its legend entry carrying the date', async () => {
    const { page, errors } = await demo(options);
    for (const v of ['timeline', 'costs'] as const) {
      await view(page, v);
      const m = await page.evaluate((x) => {
        const root = document.querySelector<HTMLElement>(`#presentation-${x}`)!;
        const t = root.querySelector<HTMLElement>('.timeline-today')!;
        const tr = t.getBoundingClientRect();
        const body = root.querySelector('.timeline-body')!.getBoundingClientRect();
        const ticks = [...root.querySelectorAll<HTMLElement>('.timeline-tick')].map((k) => [k.textContent, k.getBoundingClientRect().left]);
        const ev = root.querySelector<HTMLElement>('.timeline-event-line')!;
        const cs = getComputedStyle(t);
        const es = getComputedStyle(ev);
        const legend = document.querySelector('#presentation-legend .legend-group[data-kind="today"]');
        return { x: tr.left, h: tr.height, bodyH: body.height, style: `${cs.borderLeftWidth} ${cs.borderLeftStyle}`, colour: cs.borderLeftColor, event: `${es.width} ${es.opacity}`, ticks, legend: legend ? [legend.querySelector('.legend-group-label')!.textContent, legend.querySelector('.legend-label')!.textContent] : null, panel: getComputedStyle(root).backgroundColor, chips: [...root.querySelectorAll('.timeline-event-chip')].map((c) => c.textContent) };
      }, v);
      expect(m.style).toBe('2px dashed');
      expect(m.h).toBeCloseTo(m.bodyH, 0);
      expect(m.event).not.toMatch(/^2px/);
      expect(m.chips).toEqual(['Review', 'Decision']);
      expect(m.legend).toEqual(['Today', '2026-11-11']);
      // Between the 2026 and the later tick, nearer 2027.
      const t2026 = m.ticks.find(([t]) => t === '2026');
      if (t2026) expect(m.x).toBeGreaterThan(t2026[1] as number);
      measured.push(`${name}, ${v}: today ${m.style} at x ${m.x.toFixed(1)}, ${m.h.toFixed(0)} px over the ${m.bodyH.toFixed(0)} px body, contrast ${ratio(m.colour, m.panel).toFixed(2)}; the events' hairlines ${m.event.split(' ')[0]} at opacity ${m.event.split(' ')[1]}; legend "${m.legend!.join(' ')}"`);
    }
    expect(errors).toEqual([]);
    await page.context().close();
  }, 90_000);
});
