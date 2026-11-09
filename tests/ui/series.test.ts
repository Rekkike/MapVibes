import { beforeEach, describe, expect, test, vi } from 'vitest';
import { byId, importExampleWorkbook, mountApp } from './harness';
import { parseWorkState, serialiseWorkState } from '../../src/workstate';

// Year series and series roles (FR-63), with the currency unit (FR-64), on
// the example workbook with year series.

type App = Awaited<ReturnType<typeof mountApp>>;

function items(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('#series-list .series-item')];
}

function item(key: string): HTMLElement {
  return byId('series-list').querySelector<HTMLElement>(`.series-item[data-series="${key}"]`)!;
}

function choose(select: HTMLSelectElement, value: string): void {
  select.value = value;
  select.dispatchEvent(new Event('change'));
}

const role = (key: string) => item(key).querySelector<HTMLSelectElement>('.series-role')!;

describe('year series and series roles (FR-63)', () => {
  let app: App;

  beforeEach(async () => {
    app = await mountApp();
    await importExampleWorkbook('example-economics.xlsx');
  });

  test('the year columns are proposed as series, named by the headers, with their years; a free-text column with a year in its header is proposed too, but nothing is used', () => {
    expect(byId('series-panel-summary').textContent).toBe('Year series and economics');
    expect(items().map((li) => [li.querySelector('.series-name')!.textContent, li.querySelector('.series-years')!.textContent])).toEqual([
      ['Budget', '2020–2032, 13 columns'],
      ['Prognos', '2020–2032, 13 columns'],
      ['Utfall', '2020–2024, 5 columns'],
      ['Note', '2024–2024, 1 column'],
    ]);
    expect(items().map((li) => li.querySelector<HTMLSelectElement>('.series-role')!.value)).toEqual(['', '', '', '']);
    expect(app.captureWorkState().series).toEqual({});
  });

  test('a series is used only when assigned; one series per role; the total column once used', () => {
    choose(role('budget'), 'budget');
    choose(role('prognos'), 'forecast');
    choose(role('utfall'), 'outcome');
    let series = app.captureWorkState().series;
    expect(Object.keys(series)).toEqual(['budget', 'forecast', 'outcome']);
    expect(series.budget!.columns['2020']).toBe('Budget 2020');
    expect(Object.keys(series.budget!.columns)).toHaveLength(13);
    // Assigning the budget role to another series moves it.
    choose(role('prognos'), 'budget');
    series = app.captureWorkState().series;
    expect(series.budget!.name).toBe('Prognos');
    expect(series.forecast).toBeUndefined();
    expect(role('budget').value).toBe('');
    // The total column: a column outside the year series.
    const total = item('prognos').querySelector<HTMLSelectElement>('.series-total')!;
    const options = [...total.options].map((o) => o.value);
    expect(options).toContain('Budget total');
    expect(options).not.toContain('Budget 2020');
    expect(options).not.toContain('Note 2024');
    choose(total, 'Budget total');
    expect(app.captureWorkState().series.budget!.total).toBe('Budget total');
    expect(item('budget').querySelector('.series-total')).toBeNull();
  });

  test('the currency unit is SEK until changed, and persists with the series', () => {
    const unit = byId<HTMLInputElement>('currency-unit');
    expect(unit.value).toBe('SEK');
    unit.value = 'kr';
    unit.dispatchEvent(new Event('change'));
    choose(role('budget'), 'budget');
    const back = parseWorkState(serialiseWorkState(app.captureWorkState(), new Date()));
    expect(back.currencyUnit).toBe('kr');
    expect(back.series.budget!.name).toBe('Budget');
  });

  test('a new list starts without series and with the default unit', async () => {
    choose(role('budget'), 'budget');
    const unit = byId<HTMLInputElement>('currency-unit');
    unit.value = 'kr';
    unit.dispatchEvent(new Event('change'));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await importExampleWorkbook();
    confirm.mockRestore();
    const ws = app.captureWorkState();
    expect([ws.series, ws.currencyUnit]).toEqual([{}, 'SEK']);
    expect(byId('series-none').classList.contains('hidden')).toBe(false);
  });

  test('the panel follows the language', () => {
    const lang = byId<HTMLSelectElement>('select-language');
    lang.value = 'sv';
    lang.dispatchEvent(new Event('change'));
    expect(byId('series-panel-summary').textContent).toBe('Årsserier och ekonomi');
    expect([...role('budget').options].map((o) => o.textContent)).toEqual(['Används inte', 'Budget', 'Prognos', 'Utfall']);
    expect(items()[0].querySelector('.series-years')!.textContent).toBe('2020–2032, 13 kolumner');
  });
});
