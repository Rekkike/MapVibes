import { beforeEach, describe, expect, test } from 'vitest';
import { byId, flush, mountApp, openWorkFile, placeExampleMarkers, setRole, stubImageDecoding, stubStageLayout, textFile } from './harness';
import { serialiseWorkState } from '../../src/workstate';
import { dayNumber } from '../../src/dates';

// The costs view (FR-79) on the example workbook with year series: E-01
// thirteen years of budget and forecast with an outcome for the first five;
// E-02 no economics; E-03 a budget only; E-04 a year without a value and a
// value that is not a number; E-05 a budget in three years.

type App = Awaited<ReturnType<typeof mountApp>>;

const root = () => byId('presentation-costs');
const rows = () => [...root().querySelectorAll<HTMLElement>('.timeline-lines > li')];
const line = (name: string) => rows().find((li) => li.classList.contains('timeline-line') && li.textContent!.includes(name))!;
const segs = (row: HTMLElement) => [...row.querySelectorAll<HTMLElement>('.timeline-seg')];
const totals = () => root().querySelector<HTMLElement>('.timeline-totals')!;

function choose(select: HTMLSelectElement, value: string): void {
  select.value = value;
  select.dispatchEvent(new Event('change'));
}

const role = (key: string) => document.querySelector<HTMLSelectElement>(`#series-list .series-item[data-series="${key}"] .series-role`)!;

async function setUp(assign = true): Promise<App> {
  const app = await mountApp({ singleFile: true });
  window.confirm = () => true;
  await placeExampleMarkers(
    [
      [0, 60, 100],
      [1, 300, 150],
      [2, 500, 250],
      [3, 650, 400],
      [4, 760, 520],
    ],
    'example-economics.xlsx',
  );
  byId('tab-information').click();
  setRole('Name', 'name');
  setRole('Start', 'start');
  setRole('End', 'end');
  if (assign) {
    choose(role('budget'), 'budget');
    choose(role('prognos'), 'forecast');
    choose(role('utfall'), 'outcome');
  }
  byId('tab-presentation').click();
  return app;
}

describe('the costs view (FR-79)', () => {
  let app: App;

  beforeEach(async () => {
    app = await setUp();
  });

  test('the switch is a Map | Timeline | Costs trio; the costs view is the third view', () => {
    expect([...byId('pres-mode').querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Map', 'Timeline', 'Costs']);
    expect(root().classList.contains('hidden')).toBe(true);
    byId('pres-mode-costs').click();
    expect([...byId('pres-mode').querySelectorAll('button')].map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true']);
    expect(byId('presentation-stage').dataset.view).toBe('costs');
    expect(byId('presentation-toolbar').dataset.view).toBe('costs');
    expect(root().classList.contains('hidden')).toBe(false);
    expect(byId('presentation-timeline').classList.contains('hidden')).toBe(true);
    // The costs view needs no background.
    expect(byId('presentation-empty').classList.contains('hidden')).toBe(true);
    expect(app.captureWorkState().presentationMode).toBe('costs');
    byId('pres-mode-timeline').click();
    expect(root().classList.contains('hidden')).toBe(true);
    expect(byId('presentation-timeline').classList.contains('hidden')).toBe(false);
  });

  test('each item is a line; each year with a value is one span per series, in the sub-lanes', () => {
    byId('pres-mode-costs').click();
    expect(rows().map((li) => (li.classList.contains('timeline-totals') ? '# totals' : li.querySelector('.timeline-title')!.textContent))).toEqual(['# totals', 'Long item', 'No economics', 'Budget only', 'Gaps', 'Outside']);
    // E-01: thirteen budget years, thirteen forecast years, five outcome years.
    const long = segs(line('Long item'));
    expect(long).toHaveLength(31);
    expect(long.every((s) => s.dataset.kind === 'amount')).toBe(true);
    const of = (series: string) => long.filter((s) => s.dataset.series === series);
    expect([of('budget').length, of('forecast').length, of('outcome').length]).toEqual([13, 13, 5]);
    expect([...new Set(of('budget').map((s) => s.dataset.lane))]).toEqual(['0']);
    expect([...new Set(of('forecast').map((s) => s.dataset.lane))]).toEqual(['1']);
    expect([...new Set(of('outcome').map((s) => s.dataset.lane))]).toEqual(['2']);
    // A span covers its year.
    expect([Number(of('budget')[0].dataset.from), Number(of('budget')[0].dataset.to)]).toEqual([dayNumber(2020, 1, 1), dayNumber(2021, 1, 1)]);
    // Never a "+n" badge: three sub-lanes hold every series.
    expect(root().querySelector('.timeline-badge-more')).toBeNull();
  });

  test('an amount is a width fill on the scale of the largest single year amount, shown in thousands; the exact amount is in the title', () => {
    byId('pres-mode-costs').click();
    const long = segs(line('Long item'));
    const budget2032 = long.find((s) => s.dataset.series === 'budget' && Number(s.dataset.from) === dayNumber(2032, 1, 1))!;
    // 900 000 is the largest single year amount of the work.
    expect(budget2032.dataset.share).toBe('1.0000');
    expect(budget2032.querySelector<HTMLElement>('.timeline-seg-fill')!.style.width).toBe('100%');
    expect(budget2032.querySelector('.timeline-seg-label')!.textContent).toBe('900');
    expect(budget2032.title).toBe('Budget 2032: 900,000 SEK');
    const outside = segs(line('Outside')).find((s) => Number(s.dataset.from) === dayNumber(2025, 1, 1))!;
    expect(outside.querySelector<HTMLElement>('.timeline-seg-fill')!.style.width).toBe('4.44%');
    expect(outside.querySelector('.timeline-seg-label')!.textContent).toBe('40');
    // The series carry the user's own names.
    expect(long.find((s) => s.dataset.series === 'forecast')!.title).toMatch(/^Prognos 2020: 620,000 SEK$/);
    expect(long.find((s) => s.dataset.series === 'outcome')!.title).toMatch(/^Utfall 2020: 590,000 SEK$/);
  });

  test('an item without economics is an empty named line; a value that is not a number has no bar and is said as typed', () => {
    byId('pres-mode-costs').click();
    const none = line('No economics');
    expect(segs(none)).toHaveLength(0);
    expect(none.querySelector('.timeline-chip')!.getAttribute('aria-label')).toBe('2: No economics. no amounts');
    const gaps = line('Gaps');
    // Budget 2026 and the forecasts of 2024 and 2026; "ca 1 M" has no bar.
    expect(segs(gaps).map((s) => `${s.dataset.series} ${s.querySelector('.timeline-seg-label')!.textContent}`)).toEqual(['forecast 200', 'budget 300', 'forecast 310']);
    expect(gaps.querySelector('.timeline-chip')!.getAttribute('aria-label')).toBe(
      '4: Gaps. 2024: Prognos 200,000 SEK; 2026: Budget 300,000 SEK, Prognos 310,000 SEK. Not numbers, shown as typed: Budget 2024: ca 1 M',
    );
  });

  test('the totals row is at the top: three bars per year on its own scale, in thousands, and it says so', () => {
    byId('pres-mode-costs').click();
    expect(rows()[0]).toBe(totals());
    expect(totals().querySelector('.timeline-title')!.textContent).toBe('Total per year');
    expect(totals().querySelector('.timeline-typed')!.textContent).toBe('thousands of SEK');
    const t = segs(totals());
    const at = (series: string, year: number) => t.find((s) => s.dataset.series === series && Number(s.dataset.from) === dayNumber(year, 1, 1))!;
    // Budget 2026: 750 000 + 150 000 + 300 000 + 200 000.
    expect(at('budget', 2026).title).toBe('Budget 2026: 1,400,000 SEK');
    expect(at('budget', 2026).querySelector('.timeline-seg-label')!.textContent).toBe('1,400');
    // The largest year total fills its cell, on the totals' own scale.
    expect(at('budget', 2026).dataset.share).toBe('1.0000');
    expect(at('forecast', 2026).title).toBe('Prognos 2026: 1,050,000 SEK');
    expect(at('forecast', 2026).dataset.share).toBe('0.7500');
    expect(at('outcome', 2020).dataset.lane).toBe('2');
    expect(totals().getAttribute('aria-label')).toContain('The totals have their own scale; their bars are not comparable by width with the bars of the items.');
    expect(totals().getAttribute('aria-label')).toContain('2026: Budget 1,400,000 SEK, Prognos 1,050,000 SEK');
  });

  test('the fitted window spans the years of the assigned series; zoom and fit act on the view shown', () => {
    byId('pres-mode-costs').click();
    expect(app.captureWorkState().costsView).toBeNull();
    expect(byId('pres-zoom-level').textContent).toBe('100%');
    byId('pres-zoom-in').click();
    const view = app.captureWorkState().costsView!;
    expect(view.firstLine).toBe(0);
    // The fitted window: 2020 to 2032 with its margin; zoomed in, within it.
    expect(view.from).toBeGreaterThan(dayNumber(2020, 1, 1));
    expect(view.to).toBeLessThan(dayNumber(2033, 1, 1));
    expect(byId('pres-zoom-level').textContent).toBe('125%');
    // The timeline's own view is untouched.
    expect(app.captureWorkState().timelineView).toBeNull();
    byId('pres-fit').click();
    expect(app.captureWorkState().costsView).toBeNull();
  });

  test('the saved view is the costs view\'s own window and first line, beside the timeline\'s', async () => {
    byId('pres-mode-costs').click();
    byId('pres-zoom-in').click();
    const saved = app.captureWorkState();
    const window = { from: saved.costsView!.from, to: saved.costsView!.to };
    const text = serialiseWorkState({ ...saved, costsView: { ...window, firstLine: 2 } }, new Date());
    byId('pres-fit').click();
    byId('pres-mode-map').click();
    openWorkFile(textFile('work.json', text));
    await flush();
    byId('tab-presentation').click();
    expect(byId('presentation-stage').dataset.view).toBe('costs');
    const back = app.captureWorkState();
    expect(back.costsView).toEqual({ ...window, firstLine: 2 });
    expect(back.timelineView).toBeNull();
  });

  test('the order is shared with the timeline and the list', () => {
    byId('pres-mode-costs').click();
    choose(byId<HTMLSelectElement>('pres-order'), 'start');
    expect(rows().map((li) => (li.classList.contains('timeline-totals') ? '# totals' : li.querySelector('.timeline-title')!.textContent))).toEqual(['# totals', 'Long item', 'No economics', 'Gaps', 'Budget only', 'Outside']);
  });

  test('an item switched off is absent, from the lines and from the totals', () => {
    byId('pres-mode-costs').click();
    const before = segs(totals()).find((s) => s.dataset.series === 'budget' && Number(s.dataset.from) === dayNumber(2026, 1, 1))!.title;
    expect(before).toBe('Budget 2026: 1,400,000 SEK');
    document.querySelectorAll<HTMLInputElement>('#visibility-list input[type="checkbox"]')[0].click();
    expect(line('Long item')).toBeUndefined();
    expect(segs(totals()).find((s) => s.dataset.series === 'budget' && Number(s.dataset.from) === dayNumber(2026, 1, 1))!.title).toBe('Budget 2026: 650,000 SEK');
  });

  test('a line\'s chip opens the item\'s card, unchanged', () => {
    byId('pres-mode-costs').click();
    line('Budget only').querySelector<HTMLButtonElement>('.timeline-chip')!.click();
    const card = byId('presentation-card');
    expect(card.dataset.state).toBe('open');
    expect(card.textContent).toContain('Budget only');
    expect(line('Budget only').dataset.selected).toBe('true');
  });

  test('the exported file opens in the costs view, at its saved view, view-only', async () => {
    byId('pres-mode-costs').click();
    byId('pres-zoom-in').click();
    const window = app.captureWorkState().costsView!;
    const doc = new DOMParser().parseFromString(app.exportPage(new Date(2026, 10, 9, 10, 0))!, 'text/html');
    const viewer = await mountApp({
      body: doc.body.innerHTML,
      beforeMain: () => {
        stubStageLayout();
        stubImageDecoding(1200, 800);
      },
    });
    await flush();
    expect(byId('presentation-stage').dataset.view).toBe('costs');
    expect(byId('pres-mode-costs').getAttribute('aria-pressed')).toBe('true');
    expect(segs(line('Long item'))).toHaveLength(31);
    expect(totals()).not.toBeNull();
    expect(viewer.captureWorkState().costsView).toEqual({ from: window.from, to: window.to, firstLine: 0 });
    byId('pres-mode-map').click();
    expect(byId('presentation-stage').dataset.view).toBe('map');
  });
});

describe('the costs view without series (FR-79)', () => {
  test('with no series assigned, every item is an empty line and the view says what to assign', async () => {
    await setUp(false);
    byId('pres-mode-costs').click();
    expect(totals()).toBeNull();
    expect(rows().filter((li) => li.classList.contains('timeline-line'))).toHaveLength(5);
    expect(root().querySelectorAll('.timeline-seg')).toHaveLength(0);
    expect(root().querySelector('.timeline-message')!.textContent).toBe('Assign year series to budget, forecast, or outcome in the Information segment to show the costs by year.');
  });
});

describe("the costs view's series key (FR-79 as amended in v1.11.1)", () => {
  const key = () => [...byId('presentation-legend').querySelectorAll<HTMLElement>('.legend-group[data-kind="series"] .legend-entry')];
  const groupLabel = () => byId('presentation-legend').querySelector('.legend-group[data-kind="series"] .legend-group-label')?.textContent;

  test('when the costs view is shown, the legend carries the present series with their styles and meanings; the other views carry none', async () => {
    await setUp();
    // The map view (the default): no series key.
    expect(key()).toHaveLength(0);
    byId('pres-mode-timeline').click();
    expect(key()).toHaveLength(0);
    byId('pres-mode-costs').click();
    const entries = key();
    expect(groupLabel()).toBe('Series');
    expect(entries.map((e) => [e.dataset.series, e.textContent!.trim()])).toEqual([
      ['budget', 'Budget'],
      ['forecast', 'Prognos'],
      ['outcome', 'Utfall'],
    ]);
    for (const e of entries) {
      const swatch = e.querySelector('.legend-swatch')!;
      expect(swatch.classList.contains('legend-series-swatch')).toBe(true);
      expect(swatch.getAttribute('aria-hidden')).toBe('true');
    }
    // Switching away removes the key again.
    byId('pres-mode-map').click();
    expect(key()).toHaveLength(0);
    // The Map segment's legend never carries it.
    expect(byId('map-legend').querySelector('.legend-group[data-kind="series"]')).toBeNull();
  });

  test('used-only (FR-75): only the series present among the visible items appear, recomputed on a visibility toggle', async () => {
    await setUp();
    byId('pres-mode-costs').click();
    expect(key().map((e) => e.dataset.series)).toEqual(['budget', 'forecast', 'outcome']);
    // Switch off the first item (E-01), the only one with an outcome.
    document.querySelectorAll<HTMLInputElement>('#visibility-list input[type="checkbox"]')[0].click();
    expect(key().map((e) => e.dataset.series)).toEqual(['budget', 'forecast']);
    document.querySelectorAll<HTMLInputElement>('#visibility-list input[type="checkbox"]')[0].click();
    expect(key().map((e) => e.dataset.series)).toEqual(['budget', 'forecast', 'outcome']);
  });

  test('with no series assigned, the costs view shows no series key', async () => {
    await setUp(false);
    byId('pres-mode-costs').click();
    expect(key()).toHaveLength(0);
  });

  test('the exported viewer opening in the costs view carries the series key, computed once from its embedded items', async () => {
    const app = await setUp();
    byId('pres-mode-costs').click();
    const doc = new DOMParser().parseFromString(app.exportPage(new Date(2026, 10, 9, 10, 0))!, 'text/html');
    await mountApp({
      body: doc.body.innerHTML,
      beforeMain: () => {
        stubStageLayout();
        stubImageDecoding(1200, 800);
      },
    });
    await flush();
    expect(document.documentElement.dataset.mode).toBe('viewer');
    expect(byId('presentation-stage').dataset.view).toBe('costs');
    expect(key().map((e) => [e.dataset.series, e.textContent!.trim()])).toEqual([
      ['budget', 'Budget'],
      ['forecast', 'Prognos'],
      ['outcome', 'Utfall'],
    ]);
    // The viewer's switch to another view removes the key.
    byId('pres-mode-map').click();
    expect(key()).toHaveLength(0);
  });
});
