// Reading dates (FR-68): a start or end value is a year, a year and month,
// or an ISO date (with or without a time of day). A form whose order of day
// and month is a matter of convention (15/03/2024, 3/15/2024, 1.5.2024) is
// never guessed: like any value that cannot be read, it is treated as
// missing and shown as typed. Dates are counted in whole days from
// 1970-01-01, a calendar count independent of the time zone.

export type DatePrecision = 'year' | 'month' | 'day';

export type DateReading = { kind: 'date'; start: number; end: number; precision: DatePrecision } | { kind: 'empty' } | { kind: 'text'; text: string };

export const FIRST_DATE_YEAR = 1900;
export const LAST_DATE_YEAR = 2199;

const DAY_MS = 86_400_000;

// The day number of a calendar date; month 1 to 12.
export function dayNumber(year: number, month: number, day: number): number {
  return Math.round(Date.UTC(year, month - 1, day) / DAY_MS);
}

// The calendar date of a day number.
export function dateOfDay(day: number): { year: number; month: number; day: number } {
  const d = new Date(day * DAY_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const FORM = /^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?)?)?$/;

export function readDate(value: string): DateReading {
  const text = value.trim();
  if (text === '') {
    return { kind: 'empty' };
  }
  const m = FORM.exec(text);
  const unread: DateReading = { kind: 'text', text: value };
  if (!m) {
    return unread;
  }
  const year = Number(m[1]);
  if (year < FIRST_DATE_YEAR || year > LAST_DATE_YEAR) {
    return unread;
  }
  if (m[2] === undefined) {
    return { kind: 'date', start: dayNumber(year, 1, 1), end: dayNumber(year, 12, 31), precision: 'year' };
  }
  const month = Number(m[2]);
  if (month < 1 || month > 12) {
    return unread;
  }
  if (m[3] === undefined) {
    return { kind: 'date', start: dayNumber(year, month, 1), end: dayNumber(year, month, daysInMonth(year, month)), precision: 'month' };
  }
  const day = Number(m[3]);
  if (day < 1 || day > daysInMonth(year, month)) {
    return unread;
  }
  if (m[4] !== undefined && (Number(m[4]) > 23 || Number(m[5]) > 59 || Number(m[6] ?? 0) > 59)) {
    return unread;
  }
  const n = dayNumber(year, month, day);
  return { kind: 'date', start: n, end: n, precision: 'day' };
}

// An item's span in days from its start and end values: the start's first
// day and the end's last day. Either end may be missing; an end before the
// start is read as written, the span then running backwards being the
// caller's to mark.
export interface DateSpan {
  start: DateReading;
  end: DateReading;
  from: number | null;
  to: number | null;
}

export function readSpan(start: string, end: string): DateSpan {
  const s = readDate(start);
  const e = readDate(end);
  return { start: s, end: e, from: s.kind === 'date' ? s.start : null, to: e.kind === 'date' ? e.end : null };
}

// A date as written in ISO form, to the precision it was given.
export function formatDate(reading: Extract<DateReading, { kind: 'date' }>, which: 'start' | 'end' = 'start'): string {
  const d = dateOfDay(which === 'start' ? reading.start : reading.end);
  const two = (n: number) => String(n).padStart(2, '0');
  if (reading.precision === 'year') {
    return String(d.year);
  }
  if (reading.precision === 'month') {
    return `${d.year}-${two(d.month)}`;
  }
  return `${d.year}-${two(d.month)}-${two(d.day)}`;
}
