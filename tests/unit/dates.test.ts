import { describe, expect, test } from 'vitest';
import { dateOfDay, dayNumber, formatDate, readDate, readSpan } from '../../src/dates';
import { cellToString } from '../../src/ingest';

// Reading dates from values (FR-68), and date cells read as dates (FR-1 as
// amended).

const day = (y: number, m: number, d: number) => dayNumber(y, m, d);

describe('reading dates (FR-68)', () => {
  test('a year is the whole year', () => {
    expect(readDate('2024')).toEqual({ kind: 'date', start: day(2024, 1, 1), end: day(2024, 12, 31), precision: 'year' });
    expect(readDate(' 2024 ')).toEqual({ kind: 'date', start: day(2024, 1, 1), end: day(2024, 12, 31), precision: 'year' });
  });

  test('a year and a month is the whole month, leap years included', () => {
    expect(readDate('2024-02')).toEqual({ kind: 'date', start: day(2024, 2, 1), end: day(2024, 2, 29), precision: 'month' });
    expect(readDate('2023-2')).toEqual({ kind: 'date', start: day(2023, 2, 1), end: day(2023, 2, 28), precision: 'month' });
  });

  test('an ISO date is one day, with or without a time', () => {
    for (const s of ['2024-03-15', '2024-3-15', '2024-03-15 18:00', '2024-03-15T18:00:00', '2024-03-15T18:00:00.000Z', '2024-03-15T08:30+01:00']) {
      expect(readDate(s), s).toEqual({ kind: 'date', start: day(2024, 3, 15), end: day(2024, 3, 15), precision: 'day' });
    }
  });

  test('a form with the day or the month first is never guessed', () => {
    for (const s of ['15/03/2024', '3/15/2024', '1.5.2024', '05-01-2024', '15 March 2024', '2024/03/15', 'March 2024']) {
      expect(readDate(s), s).toEqual({ kind: 'text', text: s });
    }
  });

  test('a value that cannot be read is shown as typed; nothing at all is empty', () => {
    for (const s of ['soon', '2024-13', '2024-02-30', '2024-03-15 25:00', '1850', '20245', 'Q3 2024']) {
      expect(readDate(s), s).toEqual({ kind: 'text', text: s });
    }
    expect(readDate('')).toEqual({ kind: 'empty' });
    expect(readDate('  ')).toEqual({ kind: 'empty' });
  });

  test("a span runs from the start's first day to the end's last day; either may be missing", () => {
    expect(readSpan('2024', '2026-06')).toMatchObject({ from: day(2024, 1, 1), to: day(2026, 6, 30) });
    expect(readSpan('', '2026')).toMatchObject({ from: null, to: day(2026, 12, 31) });
    expect(readSpan('15/03/2024', '')).toMatchObject({ from: null, to: null, start: { kind: 'text', text: '15/03/2024' } });
  });

  test('day numbers and calendar dates go both ways, independent of the time zone', () => {
    expect(dayNumber(1970, 1, 1)).toBe(0);
    expect(dateOfDay(day(2024, 2, 29))).toEqual({ year: 2024, month: 2, day: 29 });
    const r = readDate('2024-07') as Extract<ReturnType<typeof readDate>, { kind: 'date' }>;
    expect([formatDate(r), formatDate(r, 'end')]).toEqual(['2024-07', '2024-07']);
    expect(formatDate(readDate('2024-07-04') as Extract<ReturnType<typeof readDate>, { kind: 'date' }>)).toBe('2024-07-04');
  });
});

describe('date cells (FR-1 as amended)', () => {
  test('a date cell is its calendar date, with its time when it has one', () => {
    expect(cellToString(new Date(2024, 2, 15))).toBe('2024-03-15');
    expect(cellToString(new Date(2024, 4, 2, 18, 0))).toBe('2024-05-02 18:00');
    expect(cellToString(new Date(NaN))).toBe('');
  });
});

describe('a text file is read as typed (FR-1, FR-68)', () => {
  test('no value of a text file is converted into a number or a date by guessing', async () => {
    const { parseWorkbook } = await import('../../src/ingest');
    const csv = new TextEncoder().encode('A,B,C,D,E,F\n2024-03-15,3/15/2024,1.5.2024,0042,"1,5",TRUE\n');
    expect(parseWorkbook(csv.buffer).rows[0]).toEqual(['2024-03-15', '3/15/2024', '1.5.2024', '0042', '1,5', 'TRUE']);
  });
});
