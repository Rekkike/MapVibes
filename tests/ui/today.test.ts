import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { byId, flush, importExampleWorkbook, mountApp, setRole, stubImageDecoding, stubStageLayout } from './harness';
import { todayDay } from '../../src/clock';
import { dayNumber } from '../../src/dates';

// The today mark (FR-78, FR-79 as amended in v1.14.0; FR-80, FR-75 as noted):
// a dashed line at today's date in both schedule views, distinct from the
// events; hidden outside the window, with its own edge indicator; the
// legend's entry carrying the date; the device's clock, set here.

type App = Awaited<ReturnType<typeof mountApp>>;

const mark = (v: string) => byId(`presentation-${v}`).querySelector<HTMLElement>('.timeline-today');
const edge = (v: string) => byId(`presentation-${v}`).querySelector<HTMLElement>('.timeline-today-edge');
const legendToday = () => byId('presentation-legend').querySelector<HTMLElement>('.legend-group[data-kind="today"]');

// The economics workbook: items from 2020 to 2032, year series assigned.
async function setUp(): Promise<App> {
  const app = await mountApp({ singleFile: true });
  await importExampleWorkbook('example-economics.xlsx');
  setRole('Name', 'name');
  setRole('Start', 'start');
  setRole('End', 'end');
  const role = document.querySelector<HTMLSelectElement>('#series-list .series-item[data-series="budget"] .series-role')!;
  role.value = 'budget';
  role.dispatchEvent(new Event('change'));
  byId('tab-presentation').click();
  return app;
}

describe('the clock seam', () => {
  test("today is the device's local calendar date as a day number", () => {
    expect(todayDay(new Date(2026, 10, 11, 23, 59))).toBe(dayNumber(2026, 11, 11));
    expect(todayDay(new Date(2026, 0, 1, 0, 0))).toBe(dayNumber(2026, 1, 1));
  });
});

describe('the today mark in the schedule views', () => {
  beforeEach(() => vi.setSystemTime(new Date(2026, 10, 11, 10, 0)));
  afterEach(() => vi.useRealTimers());

  test("a dashed line at today's date in both views, placed like a gridline; not an event, and no chip", async () => {
    await setUp();
    for (const v of ['timeline', 'costs']) {
      byId(`pres-mode-${v}`).click();
      await flush();
      const m = mark(v)!;
      expect(m).not.toBeNull();
      expect(m.dataset.day).toBe(String(dayNumber(2026, 11, 11)));
      expect(m.title).toBe('Today, 2026-11-11');
      expect(m.style.left).toMatch(/%$/);
      // In the body's layer of marks, not among the events.
      expect(m.closest('.timeline-event-lines')).not.toBeNull();
      expect(m.dataset.eventId).toBeUndefined();
      expect(byId(`presentation-${v}`).querySelectorAll('.timeline-event-chip')).toHaveLength(0);
      // Without events, the strip stays hidden: no chip for today.
      expect(byId(`presentation-${v}`).querySelector('.timeline-event-strip')!.classList.contains('hidden')).toBe(true);
    }
  });

  test('the legend carries the today entry with its date in both schedule views, and not in the map view', async () => {
    await setUp();
    expect(legendToday()).toBeNull();
    for (const v of ['timeline', 'costs']) {
      byId(`pres-mode-${v}`).click();
      await flush();
      expect(legendToday()!.querySelector('.legend-group-label')!.textContent).toBe('Today');
      expect(legendToday()!.querySelector('.legend-label')!.textContent).toBe('2026-11-11');
      expect(legendToday()!.querySelector('.legend-swatch')!.classList.contains('legend-today-swatch')).toBe(true);
    }
    byId('pres-mode-map').click();
    expect(legendToday()).toBeNull();
  });

  test('outside the window: no line, an edge indicator of its own, and a tap pans to today', async () => {
    vi.setSystemTime(new Date(2040, 0, 15, 10, 0));
    await setUp();
    byId('pres-mode-timeline').click();
    await flush();
    expect(mark('timeline')).toBeNull();
    const e = edge('timeline')!;
    expect(e.dataset.side).toBe('after');
    expect(e.getAttribute('aria-label')).toBe('Today, 2040-01-15, lies after the shown window');
    expect(byId('presentation-timeline').querySelector('.timeline-event-strip')!.classList.contains('hidden')).toBe(false);
    e.click();
    await flush();
    expect(mark('timeline')).not.toBeNull();
    expect(edge('timeline')).toBeNull();
    // Before the window, at the other end.
    vi.setSystemTime(new Date(2001, 5, 1, 10, 0));
    byId('pres-fit').click();
    byId('pres-mode-costs').click();
    await flush();
    expect(edge('costs')!.dataset.side).toBe('before');
  });

  test('the Swedish strings', async () => {
    await setUp();
    const lang = byId<HTMLSelectElement>('select-language');
    lang.value = 'sv';
    lang.dispatchEvent(new Event('change'));
    byId('pres-mode-timeline').click();
    await flush();
    expect(mark('timeline')!.title).toBe('I dag, 2026-11-11');
    expect(legendToday()!.querySelector('.legend-group-label')!.textContent).toBe('I dag');
  });

  test("the exported viewer shows the reader's today, not the export date", async () => {
    const app = await setUp();
    byId('pres-mode-timeline').click();
    await flush();
    const page = app.exportPage(new Date(2026, 10, 11, 10, 0))!;
    // Opened later, by a reader whose device says another day.
    vi.setSystemTime(new Date(2027, 2, 3, 9, 0));
    const doc = new DOMParser().parseFromString(page, 'text/html');
    await mountApp({
      body: doc.body.innerHTML,
      beforeMain: () => {
        stubStageLayout();
        stubImageDecoding(1200, 800);
      },
    });
    await flush();
    expect(mark('timeline')!.dataset.day).toBe(String(dayNumber(2027, 3, 3)));
    expect(legendToday()!.querySelector('.legend-label')!.textContent).toBe('2027-03-03');
  });
});
