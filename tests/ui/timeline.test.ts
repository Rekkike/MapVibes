import { beforeEach, describe, expect, test } from 'vitest';
import { byId, flush, importExampleWorkbook, mountApp, openWorkFile, placeExampleMarkers, setRole, stubImageDecoding, stubStageLayout, textFile } from './harness';
import { serialiseWorkState } from '../../src/workstate';
import { dayNumber } from '../../src/dates';

// The presentation's two views (FR-66) and the timeline (FR-67) on the
// example workbook with date cells: T-01 both dates; T-02 a date and time
// and a year; T-03 a year and month and a date; T-04 a day-first date as
// text and no end; T-05 no dates; T-06 a start only.

type App = Awaited<ReturnType<typeof mountApp>>;

const lines = () => [...document.querySelectorAll<HTMLElement>('#presentation-timeline .timeline-lines > li')];
const rowsText = () =>
  lines().map((li) => (li.classList.contains('timeline-heading') ? `# ${li.textContent}` : li.querySelector('.timeline-name')!.textContent!.replace(/^\d+/, '').trim()));
const entry = (name: string) => [...document.querySelectorAll<HTMLButtonElement>('#presentation-timeline .timeline-entry')].find((b) => b.textContent!.includes(name))!;

async function setUp(): Promise<App> {
  const app = await mountApp({ singleFile: true });
  window.confirm = () => true;
  await importExampleWorkbook('example-dates.xlsx');
  setRole('ID', 'identifier');
  setRole('Name', 'name');
  setRole('Start', 'start');
  setRole('End', 'end');
  setRole('Group', 'area');
  byId('tab-presentation').click();
  return app;
}

describe('the presentation views (FR-66)', () => {
  let app: App;

  beforeEach(async () => {
    app = await setUp();
  });

  test('a Map | Timeline switch heads the toolbar; the map is the default and unchanged', () => {
    const toolbar = byId('presentation-toolbar');
    expect(toolbar.firstElementChild!.id).toBe('pres-mode');
    expect(byId('pres-mode').getAttribute('aria-label')).toBe('Presentation view');
    expect([...byId('pres-mode').querySelectorAll('button')].map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['Map', 'true'],
      ['Timeline', 'false'],
    ]);
    expect(byId('presentation-stage').dataset.view).toBe('map');
    expect(byId('presentation-timeline').classList.contains('hidden')).toBe(true);
    expect(byId('presentation-empty').classList.contains('hidden')).toBe(false);
    expect(app.captureWorkState().presentationMode).toBe('map');
  });

  test('the timeline needs no background; the toolbar acts on it, and Reset is Fit', () => {
    byId('pres-mode-timeline').click();
    expect(byId('pres-mode-timeline').getAttribute('aria-pressed')).toBe('true');
    expect(byId('presentation-stage').dataset.view).toBe('timeline');
    expect(byId('presentation-timeline').classList.contains('hidden')).toBe(false);
    expect(byId('presentation-empty').classList.contains('hidden')).toBe(true);
    expect(byId<HTMLButtonElement>('pres-fit').disabled).toBe(false);
    expect(byId('pres-zoom-level').textContent).toBe('100%');
    byId('pres-zoom-in').click();
    expect(byId('pres-zoom-level').textContent).not.toBe('100%');
    byId('pres-reset').click();
    expect(byId('pres-zoom-level').textContent).toBe('100%');
    byId('pres-zoom-out').click();
    byId('pres-fit').click();
    expect(byId('pres-zoom-level').textContent).toBe('100%');
    expect(app.captureWorkState().presentationMode).toBe('timeline');
    byId('pres-mode-map').click();
    expect(byId('presentation-timeline').classList.contains('hidden')).toBe(true);
  });

  test('the pointer and the wheel on the timeline do not reach the map', () => {
    byId('pres-mode-timeline').click();
    let reached = 0;
    byId('presentation-stage').addEventListener('wheel', () => reached++);
    byId('presentation-stage').addEventListener('pointerdown', () => reached++);
    const body = byId('presentation-timeline').querySelector('.timeline-body')!;
    body.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true }));
    body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(reached).toBe(0);
  });
});

describe('the timeline (FR-67)', () => {
  let app: App;

  beforeEach(async () => {
    app = await setUp();
    byId('pres-mode-timeline').click();
  });

  test('one line per item, with or without a marker, in number order; "No dates" last; a value that cannot be read shown as typed', () => {
    expect(rowsText()).toEqual(['Dated item', 'Timed item', 'Month item', 'Open item', '# No dates', 'Ambiguous itemStart: 15/03/2024', 'Undated item']);
    const bar = (name: string) => entry(name).querySelector<HTMLElement>('.timeline-bar, .timeline-point')!;
    // T-01: 2024-03-15 to 2026-06-30, a bar to the end of its last day.
    expect([bar('Dated item').dataset.from, bar('Dated item').dataset.to]).toEqual([String(dayNumber(2024, 3, 15)), String(dayNumber(2026, 6, 30) + 1)]);
    // T-02: to the end of the year 2027.
    expect(bar('Timed item').dataset.to).toBe(String(dayNumber(2027, 12, 31) + 1));
    // T-03: from the first day of the month.
    expect(bar('Month item').dataset.from).toBe(String(dayNumber(2025, 9, 1)));
    // T-06: a marked point at its start.
    expect([bar('Open item').className.split(' ')[0], bar('Open item').dataset.kind]).toEqual(['timeline-point', 'start']);
    expect(entry('Open item').getAttribute('aria-label')).toBe('6: Open item, 2025-01-10 (start only)');
    // No dates: no bar.
    expect(entry('Undated item').querySelector('.timeline-bar, .timeline-point')).toBeNull();
    // The bars are coloured like the markers, placed in the window.
    expect(bar('Dated item').classList.contains('marker-green') || bar('Dated item').className.includes('marker-')).toBe(true);
    expect(bar('Dated item').style.left).toMatch(/%$/);
    expect(document.querySelectorAll('#presentation-timeline .timeline-tick').length).toBeGreaterThan(1);
  });

  test('items switched off are absent', async () => {
    // Place T-01 and switch it off.
    await placeExampleMarkers([[0, 100, 100]], 'example-dates.xlsx');
    setRole('Name', 'name');
    setRole('Start', 'start');
    setRole('End', 'end');
    byId('tab-presentation').click();
    document.querySelector<HTMLInputElement>('.visibility-toggle')!.click();
    expect(rowsText()).not.toContain('Dated item');
    expect(rowsText()).toContain('Timed item');
  });

  test('a line opens the item\'s card; Escape closes it, and focus returns to the line', () => {
    const line = entry('Timed item');
    line.focus();
    line.click();
    const card = byId('presentation-card');
    expect(card.dataset.state).toBe('open');
    expect(card.querySelector('.card-title, h2, h3')!.textContent).toContain('Timed item');
    expect(entry('Timed item').closest('li')!.dataset.selected).toBe('true');
    byId('presentation-stage').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(card.dataset.state).toBe('closed');
    expect(document.activeElement).toBe(entry('Timed item'));
  });

  test('"In view" lists the visible lines', () => {
    expect([...byId('presentation-glance-list').querySelectorAll('.glance-entry')].length).toBe(6);
    expect(byId('presentation-glance-heading').querySelector('.glance-count')!.textContent).toBe('6');
    byId('presentation-glance-list').querySelector<HTMLButtonElement>('.glance-entry')!.click();
    expect(byId('presentation-card').dataset.state).toBe('open');
  });

  test('without the start and end roles, the items wait under "No dates" with a hint, never an error', async () => {
    await importExampleWorkbook('example-dates.xlsx');
    byId('tab-presentation').click();
    expect(rowsText()[0]).toBe('# No dates');
    expect(byId('presentation-timeline').querySelector('.timeline-message')!.textContent).toBe(
      'Assign the start and end roles in the Information segment to place the items in time.',
    );
  });

  test('the mode and the saved view, a time window and the first line, persist with the work', async () => {
    byId('pres-zoom-in').click();
    const saved = app.captureWorkState();
    expect(saved.presentationMode).toBe('timeline');
    expect(saved.timelineView).not.toBeNull();
    const window = { from: saved.timelineView!.from, to: saved.timelineView!.to };
    const text = serialiseWorkState({ ...saved, timelineView: { ...saved.timelineView!, firstLine: 2 } }, new Date());
    // Reopened on the map side, the file opens on the timeline at its view.
    byId('pres-mode-map').click();
    byId('pres-fit').click();
    openWorkFile(textFile('work.json', text));
    await flush();
    await flush();
    expect(byId('presentation-stage').dataset.view).toBe('timeline');
    const back = app.captureWorkState();
    expect(back.timelineView).toEqual({ ...window, firstLine: 2 });
    // A new list starts at the fitted view.
    await importExampleWorkbook('example-dates.xlsx');
    await flush();
    expect(app.captureWorkState().timelineView).toBeNull();
  });

  test('the exported file opens in the exported view', async () => {
    byId('pres-zoom-in').click();
    const window = app.captureWorkState().timelineView!;
    const page = app.exportPage(new Date(2026, 10, 9, 10, 0));
    expect(page).not.toBeNull();
    const doc = new DOMParser().parseFromString(page!, 'text/html');
    const viewer = await mountApp({
      body: doc.body.innerHTML,
      beforeMain: () => {
        stubStageLayout();
        stubImageDecoding(1200, 800);
      },
    });
    await flush();
    expect(byId('presentation-stage').dataset.view).toBe('timeline');
    expect(byId('pres-mode-timeline').getAttribute('aria-pressed')).toBe('true');
    expect(lines().length).toBeGreaterThan(0);
    expect(viewer.captureWorkState().timelineView).toEqual({ from: window.from, to: window.to, firstLine: 0 });
    // The viewer switches between the views as well.
    byId('pres-mode-map').click();
    expect(byId('presentation-stage').dataset.view).toBe('map');
  });
});

describe('the presentation order (FR-70)', () => {
  let app: App;
  const choose = (value: string) => {
    const select = byId<HTMLSelectElement>('pres-order');
    select.value = value;
    select.dispatchEvent(new Event('change'));
  };
  const inView = () => [...byId('presentation-glance-list').querySelectorAll('.glance-entry .glance-name')].map((n) => n.textContent);

  beforeEach(async () => {
    app = await setUp();
  });

  test('one control beside the switch, by number by default', () => {
    expect(byId('pres-order-label').previousElementSibling!.id).toBe('pres-mode');
    expect([...byId<HTMLSelectElement>('pres-order').options].map((o) => o.textContent)).toEqual(['By number', 'By area', 'By start date']);
    expect(byId<HTMLSelectElement>('pres-order').value).toBe('number');
    expect(app.captureWorkState().presentationOrder).toBe('number');
  });

  test("on the timeline: by area, each area's lines under its name; by start date, the items without a start last; \"No dates\" always last", () => {
    byId('pres-mode-timeline').click();
    choose('area');
    expect(rowsText()).toEqual(['# North', 'Dated item', 'Month item', '# South', 'Timed item', 'Open item', '# No dates', 'Ambiguous itemStart: 15/03/2024', 'Undated item']);
    expect(inView()).toEqual(['Dated item', 'Month item', 'Timed item', 'Open item', 'Ambiguous item', 'Undated item']);
    choose('start');
    expect(rowsText()).toEqual(['Dated item', 'Timed item', 'Open item', 'Month item', '# No dates', 'Ambiguous itemStart: 15/03/2024', 'Undated item']);
    expect(app.captureWorkState().presentationOrder).toBe('start');
    choose('number');
    expect(rowsText()[0]).toBe('Dated item');
    expect(rowsText()[1]).toBe('Timed item');
  });

  test('on the map, the same control orders the "In view" list, and it is saved with the work', async () => {
    await placeExampleMarkers(
      [
        [0, 100, 100],
        [2, 300, 200],
        [5, 500, 300],
        [1, 600, 400],
      ],
      'example-dates.xlsx',
    );
    setRole('Name', 'name');
    setRole('Start', 'start');
    setRole('End', 'end');
    setRole('Group', 'area');
    byId('tab-presentation').click();
    expect(inView()).toEqual(['Dated item', 'Timed item', 'Month item', 'Open item']);
    choose('start');
    expect(inView()).toEqual(['Dated item', 'Timed item', 'Open item', 'Month item']);
    choose('area');
    expect(inView()).toEqual(['Dated item', 'Month item', 'Timed item', 'Open item']);
    const text = serialiseWorkState(app.captureWorkState(), new Date());
    expect(JSON.parse(text).view.presentation.order).toBe('area');
  });
});

describe("the new strings in both languages (Pass 16)", () => {
  test('the switch, the order, the timeline, and the totals follow the language', async () => {
    await setUp();
    const role = (key: string) => document.querySelector<HTMLSelectElement>(`#series-list .series-item[data-series="${key}"] .series-role`);
    expect(role('budget')).toBeNull();
    byId('pres-mode-timeline').click();
    const lang = byId<HTMLSelectElement>('select-language');
    lang.value = 'sv';
    lang.dispatchEvent(new Event('change'));
    expect([byId('pres-mode-map').textContent, byId('pres-mode-timeline').textContent, byId('pres-mode').getAttribute('aria-label')]).toEqual(['Karta', 'Tidslinje', 'Presentationsvy']);
    expect(byId('pres-order-text').textContent).toBe('Ordning');
    expect([...byId<HTMLSelectElement>('pres-order').options].map((o) => o.textContent)).toEqual(['Efter nummer', 'Efter område', 'Efter startdatum']);
    expect(rowsText()).toContain('# Inga datum');
    expect(entry('Open item').getAttribute('aria-label')).toBe('6: Open item, 2025-01-10 (endast start)');
    lang.value = 'en';
    lang.dispatchEvent(new Event('change'));
    expect(rowsText()).toContain('# No dates');
  });
});
