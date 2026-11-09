import { describe, expect, test } from 'vitest';
import { economicsOf, proposeSeries, readAmount, yearOfHeader, yearOfValue, yearRanges, type SeriesAssignments } from '../../src/economics';

// Year series and the economics of an item (FR-63 to FR-65).

describe('year series from headers (FR-63)', () => {
  test('a four-digit year standing alone, separated by a space, an underscore, a hyphen, or brackets', () => {
    expect(yearOfHeader('Budget 2026')).toEqual({ year: 2026, name: 'Budget' });
    expect(yearOfHeader('2026 Budget')).toEqual({ year: 2026, name: 'Budget' });
    expect(yearOfHeader('Prognos_2026')).toEqual({ year: 2026, name: 'Prognos' });
    expect(yearOfHeader('Utfall-2026')).toEqual({ year: 2026, name: 'Utfall' });
    expect(yearOfHeader('Utfall (2026)')).toEqual({ year: 2026, name: 'Utfall' });
    expect(yearOfHeader('Cost [2027] kr')).toEqual({ year: 2027, name: 'Cost kr' });
  });

  test('no year, a year within a word or a longer number, two years, or a number outside the years is not a year series', () => {
    for (const header of ['Budget', 'Budget2026', 'Ref 20261', 'Budget 2024 2025', 'Code 0042', 'Start year']) expect(yearOfHeader(header), header).toBeNull();
  });

  test('columns are grouped by the header without its year, without regard to case, named by the first header as typed', () => {
    const proposals = proposeSeries([
      { key: 'a', label: 'Budget 2025' },
      { key: 'b', label: 'budget 2026' },
      { key: 'c', label: 'Prognos 2025' },
      { key: 'd', label: 'Name' },
      { key: 'e', label: 'BUDGET 2026' },
      { key: 'f', label: '2027' },
    ]);
    expect(proposals).toEqual([
      { name: 'Budget', key: 'budget', columns: { 2025: 'a', 2026: 'b' } },
      { name: 'Prognos', key: 'prognos', columns: { 2025: 'c' } },
    ]);
  });
});

describe('reading amounts (FR-65)', () => {
  const n = (value: number, decimals = 0) => ({ kind: 'number', value, decimals });

  test('clearly readable forms are numbers', () => {
    expect(readAmount('1250000', 'SEK')).toEqual(n(1250000));
    expect(readAmount('1 250 000', 'SEK')).toEqual(n(1250000));
    expect(readAmount('1 250 000', 'SEK')).toEqual(n(1250000));
    expect(readAmount('1 250 000,50', 'SEK')).toEqual(n(1250000.5, 2));
    expect(readAmount('1,250,000', 'SEK')).toEqual(n(1250000));
    expect(readAmount('1,250,000.75', 'SEK')).toEqual(n(1250000.75, 2));
    expect(readAmount('1,250.75', 'SEK')).toEqual(n(1250.75, 2));
    expect(readAmount('1.250.000', 'SEK')).toEqual(n(1250000));
    expect(readAmount('1.250,5', 'SEK')).toEqual(n(1250.5, 1));
    expect(readAmount('1234.5', 'SEK')).toEqual(n(1234.5, 1));
    expect(readAmount('-1 000', 'SEK')).toEqual(n(-1000));
    expect(readAmount('−1 000', 'SEK')).toEqual(n(-1000));
    expect(readAmount('0', 'SEK')).toEqual(n(0));
  });

  test('the work currency unit may stand before or after; another unit makes the value text', () => {
    expect(readAmount('1 250 000 kr', 'kr')).toEqual(n(1250000));
    expect(readAmount('1 250 000 KR', 'kr')).toEqual(n(1250000));
    expect(readAmount('SEK 1 250 000', 'SEK')).toEqual(n(1250000));
    expect(readAmount('1 250 tkr', 'kr')).toEqual({ kind: 'text', text: '1 250 tkr' });
    expect(readAmount('1 250 000 kr', 'SEK')).toEqual({ kind: 'text', text: '1 250 000 kr' });
  });

  test('an ambiguous separator is never guessed', () => {
    for (const s of ['1,250', '1.250', '0,500', '12.345']) expect(readAmount(s, 'SEK'), s).toEqual({ kind: 'text', text: s });
  });

  test('anything else is shown as typed; nothing at all is empty, never zero', () => {
    expect(readAmount('ca 1 M', 'SEK')).toEqual({ kind: 'text', text: 'ca 1 M' });
    expect(readAmount('1 25 000', 'SEK')).toEqual({ kind: 'text', text: '1 25 000' });
    expect(readAmount('', 'SEK')).toEqual({ kind: 'empty' });
    expect(readAmount('   ', 'SEK')).toEqual({ kind: 'empty' });
  });

  test('a start or end value gives its year, from a year alone or a date', () => {
    expect(yearOfValue('2024')).toBe(2024);
    expect(yearOfValue('2024-03-15')).toBe(2024);
    expect(yearOfValue('soon')).toBeNull();
    expect(yearOfValue('')).toBeNull();
  });
});

describe('the economics of an item (FR-64)', () => {
  const series: SeriesAssignments = {
    budget: { name: 'Budget', columns: { 2023: 'b23', 2024: 'b24', 2025: 'b25', 2026: 'b26' }, total: 'bt' },
    forecast: { name: 'Prognos', columns: { 2023: 'p23', 2024: 'p24', 2025: 'p25', 2026: 'p26' }, total: 'pt' },
    outcome: { name: 'Utfall', columns: { 2023: 'u23', 2024: 'u24' }, total: null },
  };
  const span = { start: 2024, end: 2026 };

  test('an item without values in any assigned series has no economics', () => {
    expect(economicsOf({ b24: '', p24: ' ' }, series, span, 'kr')).toBeNull();
    expect(economicsOf({ b24: '100' }, {}, span, 'kr')).toBeNull();
  });

  test('outcome replaces forecast in every year that has an outcome; the composition is spelled out by years', () => {
    const e = economicsOf({ b24: '100', b25: '100', b26: '100', p24: '90', p25: '110', p26: '120', u24: '95' }, series, span, 'kr')!;
    expect(e.years.map((y) => [y.year, y.track!.kind, y.track!.reading])).toEqual([
      [2024, 'outcome', { kind: 'number', value: 95, decimals: 0 }],
      [2025, 'forecast', { kind: 'number', value: 110, decimals: 0 }],
      [2026, 'forecast', { kind: 'number', value: 120, decimals: 0 }],
    ]);
    expect([e.track!.sum, e.track!.outcomeYears, e.track!.forecastYears]).toEqual([325, [2024], [2025, 2026]]);
    expect(e.budget!.sum).toBe(300);
    // The track mixes outcome and forecast: no column of the file speaks
    // for it.
    expect(e.track!.file).toBeNull();
  });

  test('a year without a value is "no data", adds nothing, and is not counted', () => {
    const e = economicsOf({ b24: '100', b26: '100' }, series, span, 'kr')!;
    expect(e.years.map((y) => [y.year, y.budget!.kind])).toEqual([
      [2024, 'number'],
      [2025, 'empty'],
      [2026, 'number'],
    ]);
    expect([e.budget!.sum, e.budget!.counted]).toEqual([200, [2024, 2026]]);
  });

  test('a series without values for the item does not appear', () => {
    const budgetOnly = economicsOf({ b24: '100' }, series, span, 'kr')!;
    expect(budgetOnly.track).toBeNull();
    expect(budgetOnly.years.every((y) => y.track === null)).toBe(true);
    const trackOnly = economicsOf({ p25: '50' }, series, span, 'kr')!;
    expect(trackOnly.budget).toBeNull();
    expect(trackOnly.years.every((y) => y.budget === null)).toBe(true);
  });

  test('a year outside the span with a value is shown and marked; empty years outside are not shown', () => {
    const e = economicsOf({ b23: '40', b24: '100' }, series, span, 'kr')!;
    expect(e.years.map((y) => [y.year, y.outside])).toEqual([
      [2023, true],
      [2024, false],
      [2025, false],
      [2026, false],
    ]);
  });

  test('without a span, the years run from the first to the last with a value', () => {
    const e = economicsOf({ b23: '40', b25: '60' }, series, { start: null, end: null }, 'kr')!;
    expect(e.years.map((y) => [y.year, y.outside])).toEqual([
      [2023, false],
      [2024, false],
      [2025, false],
    ]);
  });

  test("the file's total is kept beside the sum, and a track wholly of forecast takes the forecast's total", () => {
    const e = economicsOf({ b24: '100', b25: '100', bt: '250', p24: '90', pt: '200' }, series, span, 'kr')!;
    expect(e.budget!.file).toEqual({ kind: 'number', value: 250, decimals: 0 });
    expect(e.budget!.sum).toBe(200);
    expect(e.track!.file).toEqual({ kind: 'number', value: 200, decimals: 0 });
  });

  test('a value that is not a number is kept as typed, outside the sums, and noted', () => {
    const e = economicsOf({ b24: 'ca 1 M', b25: '100', bt: 'see note' }, series, span, 'kr')!;
    expect(e.budget!.sum).toBe(100);
    expect(e.texts).toEqual([
      { role: 'budget', year: 2024, text: 'ca 1 M' },
      { role: 'budget', year: null, text: 'see note' },
    ]);
  });

  test('decimals are summed exactly to the decimals given', () => {
    const e = economicsOf({ b24: '0,10', b25: '0,20' }, series, span, 'kr')!;
    expect([e.budget!.sum, e.budget!.decimals]).toEqual([0.3, 2]);
  });

  test('years are spelled out as ranges', () => {
    expect(yearRanges([2025, 2021, 2022, 2023, 2027])).toEqual([
      [2021, 2023],
      [2025, 2025],
      [2027, 2027],
    ]);
  });
});
