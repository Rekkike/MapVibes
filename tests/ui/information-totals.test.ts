import { beforeEach, describe, expect, test } from 'vitest';
import { byId, importExampleWorkbook, mountApp, setRole } from './harness';

// The Information totals (FR-69) on the example workbook with year series:
// E-01 a budget total of 9,000,000 in the file (its years add up to
// 9,750,000), E-02 no economics, E-03 a budget only, E-04 a value that is not
// a number, E-05 a value outside its span.

function choose(select: HTMLSelectElement, value: string): void {
  select.value = value;
  select.dispatchEvent(new Event('change'));
}

const role = (key: string) => document.querySelector<HTMLSelectElement>(`#series-list .series-item[data-series="${key}"] .series-role`)!;
const parts = () => [...byId('list-totals').children].map((c) => c.textContent.replace(/ /g, ' '));

describe('the Information totals (FR-69)', () => {
  beforeEach(async () => {
    await mountApp();
    await importExampleWorkbook('example-economics.xlsx');
    setRole('Start', 'start');
    setRole('End', 'end');
  });

  test('without an assigned series there is no line', () => {
    expect(byId('list-totals').classList.contains('hidden')).toBe(true);
    expect(byId('list-totals').children).toHaveLength(0);
  });

  test("beside the counters: the budget total and the track's total of all retained rows, each item's total as in the economics view", () => {
    choose(role('budget'), 'budget');
    expect(byId('list-totals').classList.contains('hidden')).toBe(false);
    expect(byId('list-totals').previousElementSibling!.id).toBe('list-counts');
    // Without a total column: the sum of the years of every item.
    const withoutFile = parts();
    choose(document.querySelector<HTMLSelectElement>('#series-list .series-item[data-series="budget"] .series-total')!, 'Budget total');
    choose(role('prognos'), 'forecast');
    choose(role('utfall'), 'outcome');
    // E-01's file figure (9,000,000) replaces the sum of its years (9,750,000).
    const budget = (p: string[]) => Number(p.find((x) => x.startsWith('Budget:'))!.replace(/[^\d]/g, ''));
    expect(budget(withoutFile) - budget(parts())).toBe(750_000);
    expect(parts()).toEqual([
      'Totals of all retained rows',
      'Budget: 10,050,000 SEK',
      expect.stringMatching(/^Utfall \/ Prognos: [\d,]+ SEK$/),
      '1 value is not a number and left out',
    ]);
  });

  test('the filter and hidden columns change nothing; the unit and the language follow', () => {
    choose(role('budget'), 'budget');
    const before = parts();
    choose(byId<HTMLSelectElement>('select-filter-kind'), 'contains');
    choose(byId<HTMLSelectElement>('select-filter-column'), 'ID');
    const filter = byId<HTMLInputElement>('filter-text');
    filter.value = 'E-03';
    filter.dispatchEvent(new Event('input'));
    expect(document.querySelectorAll('#row-table-body tr')).toHaveLength(1);
    expect(byId('counter-retained').textContent).toBe('Retained rows: 5');
    expect(parts()).toEqual(before);
    // Hiding the year columns changes nothing either.
    let hidden = 0;
    for (const box of document.querySelectorAll<HTMLInputElement>('#column-visibility input[type="checkbox"]')) {
      if (/^Budget \d{4}$/.test(box.closest('label')?.textContent ?? '')) {
        box.checked = false;
        box.dispatchEvent(new Event('change'));
        hidden++;
      }
    }
    expect(hidden).toBe(13);
    expect(parts()).toEqual(before);
    choose(byId<HTMLSelectElement>('select-filter-kind'), 'all');
    const unit = byId<HTMLInputElement>('currency-unit');
    unit.value = 'kr';
    unit.dispatchEvent(new Event('change'));
    const lang = byId<HTMLSelectElement>('select-language');
    lang.value = 'sv';
    lang.dispatchEvent(new Event('change'));
    expect(parts()[0]).toBe('Summor för alla behållna rader');
    expect(parts()[1]).toMatch(/^Budget: [\d ]+ kr$/);
    expect(parts()[2]).toBe('1 värde är inte tal och ingår inte');
  });
});
