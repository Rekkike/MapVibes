import { beforeEach, describe, expect, test } from 'vitest';
import { byId, flush, importExampleWorkbook, mountApp, openWorkFile, setRole, stubImageDecoding, stubStageLayout, textFile } from './harness';
import { parseWorkState, serialiseWorkState } from '../../src/workstate';
import { DATA_ISLAND_ID } from '../../src/singlefile';
import { dayNumber } from '../../src/dates';

// The events (FR-80): global dated markers, hand-authored in the Information
// segment in the vocabulary pattern, saved in the work state (schema 11) and
// carried in the exported file's island.

type App = Awaited<ReturnType<typeof mountApp>>;

const items = () => [...document.querySelectorAll<HTMLElement>('#event-list .event-item')];
const listed = () => items().map((li) => [li.querySelector<HTMLInputElement>('.event-date')!.value, li.querySelector<HTMLInputElement>('.event-label')!.value]);

function add(date: string, label: string): void {
  byId<HTMLInputElement>('event-date-new').value = date;
  byId<HTMLInputElement>('event-label-new').value = label;
  byId('event-add').click();
}

function change(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('change'));
}

describe('the events panel (FR-80)', () => {
  let app: App;

  beforeEach(async () => {
    app = await mountApp({ singleFile: true });
    window.confirm = () => true;
    await importExampleWorkbook('example-dates.xlsx');
  });

  test('the list ships empty: nothing is inferred from the data', () => {
    expect(byId('event-panel-summary').textContent).toBe('Events');
    expect(listed()).toEqual([]);
    expect(byId('event-status').textContent).toBe('The list is empty.');
    expect(app.captureWorkState().events).toEqual([]);
  });

  test('an event is added with a date and a label, at year, month, or day precision, kept as typed', () => {
    add('2024', 'Review');
    add(' 2024-06 ', 'Decision');
    add('2025-03-15', 'Opening');
    expect(listed()).toEqual([
      ['2024', 'Review'],
      ['2024-06', 'Decision'],
      ['2025-03-15', 'Opening'],
    ]);
    expect(app.captureWorkState().events).toEqual([
      { id: 'e1', date: '2024', label: 'Review' },
      { id: 'e2', date: '2024-06', label: 'Decision' },
      { id: 'e3', date: '2025-03-15', label: 'Opening' },
    ]);
    expect(byId<HTMLInputElement>('event-date-new').value).toBe('');
    expect(byId<HTMLInputElement>('event-label-new').value).toBe('');
    expect(byId('event-status').textContent).toBe('');
  });

  test('an event needs both a date and a label', () => {
    add('2024', '');
    add('', 'Review');
    expect(listed()).toEqual([]);
    expect(byId('event-status').textContent).toBe('An event needs a date and a label.');
  });

  test('a date that cannot be read is never guessed: it is kept as typed and said to be unreadable', () => {
    add('15/03/2024', 'Review');
    expect(listed()).toEqual([['15/03/2024', 'Review']]);
    expect(byId('event-status').textContent).toContain('cannot be read');
    const date = items()[0].querySelector<HTMLInputElement>('.event-date')!;
    expect(date.classList.contains('not-in-vocabulary')).toBe(true);
    expect(app.captureWorkState().events[0].date).toBe('15/03/2024');
    // Corrected, it reads.
    change(date, '2024-03-15');
    expect(items()[0].querySelector<HTMLInputElement>('.event-date')!.classList.contains('not-in-vocabulary')).toBe(false);
    expect(byId('event-status').textContent).toBe('');
  });

  test('an event is renamed and removed; ids stay stable and are never reused while in use', () => {
    add('2024', 'Review');
    add('2025', 'Decision');
    change(items()[0].querySelector<HTMLInputElement>('.event-label')!, 'First review');
    expect(app.captureWorkState().events[0]).toEqual({ id: 'e1', date: '2024', label: 'First review' });
    // An emptied label is not a rename.
    change(items()[0].querySelector<HTMLInputElement>('.event-label')!, '  ');
    expect(listed()[0]).toEqual(['2024', 'First review']);
    items()[0].querySelector<HTMLButtonElement>('.vocab-remove')!.click();
    expect(app.captureWorkState().events).toEqual([{ id: 'e2', date: '2025', label: 'Decision' }]);
    add('2026', 'Opening');
    expect(app.captureWorkState().events.map((e) => e.id)).toEqual(['e2', 'e3']);
  });

  test('the events are saved and reopened with the work', async () => {
    add('2024-06', 'Decision');
    add('next spring', 'Review');
    const text = serialiseWorkState(app.captureWorkState(), new Date());
    expect(JSON.parse(text).events).toEqual([
      { id: 'e1', date: '2024-06', label: 'Decision' },
      { id: 'e2', date: 'next spring', label: 'Review' },
    ]);
    await importExampleWorkbook('example-dates.xlsx');
    openWorkFile(textFile('work.json', text));
    await flush();
    expect(listed()).toEqual([
      ['2024-06', 'Decision'],
      ['next spring', 'Review'],
    ]);
  });

  test('a new list keeps the events the user authored; the work is theirs', async () => {
    add('2024', 'Review');
    await importExampleWorkbook('example-dates.xlsx');
    expect(listed()).toEqual([['2024', 'Review']]);
  });

  test('the exported file carries the events in its island; the viewer holds them view-only', async () => {
    add('2024-06', 'Decision');
    const page = app.exportPage(new Date(2026, 10, 9, 10, 0))!;
    const doc = new DOMParser().parseFromString(page, 'text/html');
    const island = JSON.parse(doc.getElementById(DATA_ISLAND_ID)!.textContent!);
    expect(parseWorkState(JSON.stringify(island.workState)).events).toEqual([{ id: 'e1', date: '2024-06', label: 'Decision' }]);
    const viewer = await mountApp({
      body: doc.body.innerHTML,
      beforeMain: () => {
        stubStageLayout();
        stubImageDecoding(1200, 800);
      },
    });
    await flush();
    expect(viewer.captureWorkState().events).toEqual([{ id: 'e1', date: '2024-06', label: 'Decision' }]);
  });
});

// The events in the schedule views (FR-80): a hairline at the date and a
// label chip at the top, in the timeline and the costs view alike; the map
// view shows none.
describe('the events in the schedule views (FR-80)', () => {
  let app: App;
  const strip = (view: string) => document.querySelector<HTMLElement>(`#presentation-${view} .timeline-event-strip`)!;
  const chips = (view: string) => [...document.querySelectorAll<HTMLElement>(`#presentation-${view} .timeline-event-chip`)];
  const hairlines = (view: string) => [...document.querySelectorAll<HTMLElement>(`#presentation-${view} .timeline-event-lines .timeline-event-line`)];

  // The workbook with years 2020 to 2032 and year series, so that both
  // schedule views have a window in time.
  beforeEach(async () => {
    app = await mountApp({ singleFile: true });
    window.confirm = () => true;
    await importExampleWorkbook('example-economics.xlsx');
    setRole('Name', 'name');
    setRole('Start', 'start');
    setRole('End', 'end');
    const role = document.querySelector<HTMLSelectElement>('#series-list .series-item[data-series="budget"] .series-role')!;
    role.value = 'budget';
    role.dispatchEvent(new Event('change'));
  });

  test('without events the schedule views are as before: no strip, no hairline', () => {
    byId('tab-presentation').click();
    byId('pres-mode-timeline').click();
    expect(strip('timeline').classList.contains('hidden')).toBe(true);
    expect(hairlines('timeline')).toEqual([]);
    byId('pres-mode-costs').click();
    expect(strip('costs').classList.contains('hidden')).toBe(true);
  });

  test('each event is a hairline crossing the body at its date, with a label chip at the top, in both schedule views', () => {
    add('2022-03-01', 'Review');
    add('2028-06', 'Decision');
    byId('tab-presentation').click();
    for (const view of ['timeline', 'costs']) {
      byId(`pres-mode-${view}`).click();
      expect(strip(view).classList.contains('hidden')).toBe(false);
      expect(strip(view).getAttribute('aria-label')).toBe('Events');
      expect(chips(view).map((c) => [c.textContent, c.title, c.dataset.row])).toEqual([
        ['Review', '2022-03-01: Review', '0'],
        ['Decision', '2028-06: Decision', '0'],
      ]);
      expect(hairlines(view).map((l) => l.dataset.eventId)).toEqual(['e1', 'e2']);
      // The hairline is over the lines, not part of them, and takes no pointer.
      expect(hairlines(view)[0].closest('.timeline-body')).not.toBeNull();
      expect(hairlines(view)[0].closest('.timeline-scroll')).toBeNull();
      // The hairline and the chip stand at the same place.
      expect(chips(view)[0].style.left).toBe(hairlines(view)[0].style.left);
    }
  });

  test('the map view does not show events', () => {
    add('2024-03-01', 'Review');
    byId('tab-presentation').click();
    expect(byId('presentation-stage').dataset.view).toBe('map');
    expect(byId('presentation-timeline').classList.contains('hidden')).toBe(true);
    expect(byId('presentation-costs').classList.contains('hidden')).toBe(true);
    expect(document.querySelectorAll('#presentation-content .timeline-event-line, #presentation-marker-layer .timeline-event-line')).toHaveLength(0);
  });

  test('an event whose date cannot be read is not drawn; corrected, it is', () => {
    add('15/03/2024', 'Review');
    byId('tab-presentation').click();
    byId('pres-mode-timeline').click();
    expect(strip('timeline').classList.contains('hidden')).toBe(true);
    byId('tab-information').click();
    change(items()[0].querySelector<HTMLInputElement>('.event-date')!, '2024-03-15');
    byId('tab-presentation').click();
    expect(chips('timeline').map((c) => c.textContent)).toEqual(['Review']);
  });

  test('near-dated events stagger into two rows, then a "+n" chip naming the rest; removing one updates the views', () => {
    add('2024-03-01', 'Review');
    add('2024-03-02', 'Decision');
    add('2024-03-03', 'Opening');
    add('2024-03-04', 'Closing');
    byId('tab-presentation').click();
    byId('pres-mode-timeline').click();
    expect(chips('timeline').map((c) => [c.textContent, c.dataset.row])).toEqual([
      ['Review', '0'],
      ['Decision', '1'],
      ['+2', '1'],
    ]);
    expect(chips('timeline')[2].title).toBe('2024-03-03: Opening; 2024-03-04: Closing');
    expect(strip('timeline').style.getPropertyValue('--timeline-event-rows')).toBe('2');
    // Every event keeps its hairline.
    expect(hairlines('timeline')).toHaveLength(4);
    byId('tab-information').click();
    items()[3].querySelector<HTMLButtonElement>('.vocab-remove')!.click();
    items()[2].querySelector<HTMLButtonElement>('.vocab-remove')!.click();
    items()[1].querySelector<HTMLButtonElement>('.vocab-remove')!.click();
    byId('tab-presentation').click();
    expect(chips('timeline').map((c) => c.textContent)).toEqual(['Review']);
    expect(strip('timeline').style.getPropertyValue('--timeline-event-rows')).toBe('1');
  });

  test('the exported viewer renders the events, view-only', async () => {
    add('2024-03-01', 'Review');
    byId('tab-presentation').click();
    byId('pres-mode-timeline').click();
    const doc = new DOMParser().parseFromString(app.exportPage(new Date(2026, 10, 9, 10, 0))!, 'text/html');
    await mountApp({
      body: doc.body.innerHTML,
      beforeMain: () => {
        stubStageLayout();
        stubImageDecoding(1200, 800);
      },
    });
    await flush();
    expect(chips('timeline').map((c) => c.textContent)).toEqual(['Review']);
    expect(hairlines('timeline')).toHaveLength(1);
    byId('pres-mode-costs').click();
    expect(chips('costs').map((c) => c.textContent)).toEqual(['Review']);
  });

  test('an event beyond the shown window is counted in an edge chip at that end of the strip; tapping it pans the window to it (v1.11.1)', () => {
    add('2022-03-01', 'Review');
    add('2015-01', 'Early');
    add('2040-06', 'Far review');
    byId('tab-presentation').click();
    for (const view of ['timeline', 'costs'] as const) {
      byId(`pres-mode-${view}`).click();
      const edges = () => [...document.querySelectorAll<HTMLElement>(`#presentation-${view} .timeline-event-edge`)];
      const labels = () => chips(view).filter((c) => !c.classList.contains('timeline-event-edge'));
      // The edge chips count the events beyond the window, each end its own, with their names.
      expect(edges().map((e) => [e.dataset.side, e.textContent, e.title])).toEqual([
        ['before', '+1', 'Events before the shown window: 2015-01: Early'],
        ['after', '+1', 'Events after the shown window: 2040-06: Far review'],
      ]);
      // They take no extra row: the strip stays at one row.
      expect(strip(view).style.getPropertyValue('--timeline-event-rows')).toBe('1');
      // The in-window event is drawn as before; the off-span ones have no hairline yet.
      expect(labels().map((c) => c.textContent)).toEqual(['Review']);
      expect(hairlines(view).map((l) => l.dataset.eventId)).toEqual(['e1']);
      // Tapping the "after" edge chip pans the window to the nearest event beyond the right end.
      edges().find((e) => e.dataset.side === 'after')!.click();
      const saved = app.captureWorkState();
      const window = view === 'timeline' ? saved.timelineView : saved.costsView;
      expect(window).not.toBeNull();
      // The window moved past the fitted one, so that it now covers the far event.
      expect(window!.to).toBeGreaterThan(dayNumber(2040, 7, 1));
      // The far event is now drawn with its chip; the right edge chip is gone, the left one stays.
      expect(hairlines(view).map((l) => l.dataset.eventId)).toContain('e3');
      expect(labels().map((c) => c.textContent)).toContain('Far review');
      expect(edges().map((e) => e.dataset.side)).toEqual(['before']);
    }
  });
});
