// Year series and the economics of an item (FR-63 to FR-65). Pure: no DOM,
// no state. Year series are proposed from a generic pattern only, a
// four-digit year standing alone in a header; a column becomes money only
// when the user assigns its series to a role (hard constraint 5). Amounts
// are read from the values as text, and an ambiguous value is never guessed.

import { dateOfDay, readDate } from './dates';

export type SeriesRole = 'budget' | 'forecast' | 'outcome';

// The work's currency unit until the user changes it (FR-64): a documented,
// changeable default, never matched against a column (hard constraint 5).
export const DEFAULT_CURRENCY_UNIT = 'SEK';
export const SERIES_ROLES: SeriesRole[] = ['budget', 'forecast', 'outcome'];

// The years accepted as a year in a header.
const FIRST_YEAR = 1900;
const LAST_YEAR = 2199;

// A year token stands alone: at the start or end of the header, or between
// spaces, underscores, hyphens, or brackets.
const YEAR_TOKEN = /(^|[\s_\-([])(\d{4})(?=$|[\s_\-)\]])/g;
const EDGE = /^[\s_\-()[\]]+|[\s_\-()[\]]+$/g;

// The year a header names and the header's name without it, or null when the
// header holds no year, or more than one.
export function yearOfHeader(label: string): { year: number; name: string } | null {
  const tokens = [...label.matchAll(YEAR_TOKEN)].filter((m) => {
    const year = Number(m[2]);
    return year >= FIRST_YEAR && year <= LAST_YEAR;
  });
  if (tokens.length !== 1) {
    return null;
  }
  const m = tokens[0];
  const start = m.index + m[1].length;
  const rest = `${label.slice(0, start)} ${label.slice(start + 4)}`;
  const name = rest
    .replace(/\(\s*\)|\[\s*\]/g, ' ')
    .replace(EDGE, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { year: Number(m[2]), name };
}

export function seriesKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

// A proposed year series: columns whose headers differ only by their year,
// named by the user's own words (the first header's, as typed).
export interface SeriesProposal {
  name: string;
  key: string;
  // Year → column key.
  columns: Record<string, string>;
}

export function proposeSeries(columns: Array<{ key: string; label: string }>): SeriesProposal[] {
  const out: SeriesProposal[] = [];
  for (const column of columns) {
    const found = yearOfHeader(column.label);
    if (!found || found.name === '') {
      continue;
    }
    const key = seriesKey(found.name);
    let series = out.find((s) => s.key === key);
    if (!series) {
      series = { name: found.name, key, columns: {} };
      out.push(series);
    }
    // A second column for the same year is left to the user; the first wins.
    if (series.columns[found.year] === undefined) {
      series.columns[found.year] = column.key;
    }
  }
  return out;
}

// A series assigned to a role: its name (the user's words), its year
// columns, and an optional total column.
export interface SeriesAssignment {
  name: string;
  columns: Record<string, string>;
  total: string | null;
}

export type SeriesAssignments = Partial<Record<SeriesRole, SeriesAssignment>>;

// Reading an amount (FR-65).
export type Reading = { kind: 'empty' } | { kind: 'number'; value: number; decimals: number } | { kind: 'text'; text: string };

const SPACES = /[    ]/g;

function plainNumber(s: string): { value: number; decimals: number } | null {
  let sign = 1;
  let body = s;
  if (/^[-−+]/.test(body)) {
    if (body[0] !== '+') {
      sign = -1;
    }
    body = body.slice(1).trim();
  }
  let integer: string;
  let fraction = '';
  let m: RegExpExecArray | null;
  if (/^\d+$/.test(body)) {
    integer = body;
  } else if ((m = /^(\d{1,3}(?: \d{3})+)(?:[.,](\d+))?$/.exec(body))) {
    // Grouped by spaces; a comma or a dot after the groups is the decimal.
    integer = m[1].replace(/ /g, '');
    fraction = m[2] ?? '';
  } else if ((m = /^(\d{1,3}(?:,\d{3}){2,})(?:\.(\d+))?$/.exec(body)) || (m = /^(\d{1,3}(?:,\d{3})+)\.(\d+)$/.exec(body))) {
    // Grouped by commas: unambiguous with two groups or more, or with a
    // decimal dot after them.
    integer = m[1].replace(/,/g, '');
    fraction = m[2] ?? '';
  } else if ((m = /^(\d{1,3}(?:\.\d{3}){2,})(?:,(\d+))?$/.exec(body)) || (m = /^(\d{1,3}(?:\.\d{3})+),(\d+)$/.exec(body))) {
    // Grouped by dots, likewise, with a decimal comma.
    integer = m[1].replace(/\./g, '');
    fraction = m[2] ?? '';
  } else if ((m = /^(\d+)[.,](\d{1,2}|\d{4,})$/.exec(body))) {
    // A single separator is a decimal separator unless exactly three digits
    // follow it: "1,250" may be a thousand or one and a quarter.
    integer = m[1];
    fraction = m[2];
  } else {
    return null;
  }
  const value = sign * Number(fraction === '' ? integer : `${integer}.${fraction}`);
  return Number.isFinite(value) ? { value, decimals: fraction.length } : null;
}

// Reads a value as an amount in the work's currency unit, which may stand
// before or after the number; any other text makes it a value as typed.
export function readAmount(text: string, unit: string): Reading {
  const s = text.replace(SPACES, ' ').trim();
  if (s === '') {
    return { kind: 'empty' };
  }
  let body = s;
  const u = unit.trim().toLocaleLowerCase();
  if (u !== '') {
    const lower = body.toLocaleLowerCase();
    if (lower.endsWith(u) && /[\d\s]$/.test(body.slice(0, body.length - u.length))) {
      body = body.slice(0, body.length - u.length).trim();
    } else if (lower.startsWith(u) && /^[\s\d\-−+]/.test(body.slice(u.length))) {
      body = body.slice(u.length).trim();
    }
  }
  const n = plainNumber(body);
  return n ? { kind: 'number', ...n } : { kind: 'text', text: s };
}

// The year of a start or end value: a year alone, or the year of a date.
// The year of a start or end value, read as a date (FR-68).
export function yearOfValue(text: string): number | null {
  const reading = readDate(text);
  return reading.kind === 'date' ? dateOfDay(reading.start).year : null;
}

export interface EconomicsYear {
  year: number;
  // A year with a value outside the item's span (FR-64).
  outside: boolean;
  // Null where the budget is not shown for the item.
  budget: Reading | null;
  // The outcome where the year has one, else the forecast; null where the
  // track is not shown for the item.
  track: { reading: Reading; kind: 'outcome' | 'forecast' } | null;
}

export interface EconomicsTotal {
  // The sum of the years' numbers.
  sum: number;
  decimals: number;
  // The years that hold a number, and those of the span without one.
  counted: number[];
  // The file's own total, when the series has a total column with a value.
  file: Reading | null;
}

export interface Economics {
  years: EconomicsYear[];
  budget: EconomicsTotal | null;
  track: (EconomicsTotal & { outcomeYears: number[]; forecastYears: number[] }) | null;
  // Values that are not numbers, shown as typed and left out of the sums.
  texts: Array<{ role: SeriesRole; year: number | null; text: string }>;
  span: { start: number | null; end: number | null };
}

function valueOf(values: Record<string, string>, key: string | undefined): string {
  return key === undefined ? '' : (values[key] ?? '');
}

function hasAny(values: Record<string, string>, series: SeriesAssignment | undefined): boolean {
  if (!series) {
    return false;
  }
  return Object.values(series.columns).some((k) => valueOf(values, k).trim() !== '') || (series.total !== null && valueOf(values, series.total).trim() !== '');
}

// The economics of an item, or null when it has none: no assigned series
// holds a value for it (absence is never an error).
export function economicsOf(
  values: Record<string, string>,
  series: SeriesAssignments,
  span: { start: number | null; end: number | null },
  unit: string,
): Economics | null {
  const showBudget = hasAny(values, series.budget);
  const showTrack = hasAny(values, series.outcome) || hasAny(values, series.forecast);
  if (!showBudget && !showTrack) {
    return null;
  }
  const read = (s: SeriesAssignment | undefined, year: number): Reading => readAmount(valueOf(values, s?.columns[year]), unit);
  // The years: the item's span, and every year outside it that holds a value.
  const valueYears = new Set<number>();
  for (const role of SERIES_ROLES) {
    const s = series[role];
    if (!s || (role === 'budget' ? !showBudget : !showTrack)) {
      continue;
    }
    for (const [year, key] of Object.entries(s.columns)) {
      if (valueOf(values, key).trim() !== '') {
        valueYears.add(Number(year));
      }
    }
  }
  const { start, end } = span;
  const years = new Set<number>(valueYears);
  const low = start !== null && end !== null ? Math.min(start, end) : null;
  const high = start !== null && end !== null ? Math.max(start, end) : null;
  if (low !== null && high !== null) {
    for (let y = low; y <= high; y++) {
      years.add(y);
    }
  } else if (valueYears.size > 0) {
    // Without a span, the years from the first to the last with a value.
    const all = [...valueYears];
    for (let y = Math.min(...all); y <= Math.max(...all); y++) {
      years.add(y);
    }
  }
  const texts: Economics['texts'] = [];
  const rows: EconomicsYear[] = [...years]
    .sort((a, b) => a - b)
    .map((year) => {
      const outside = low !== null && high !== null && (year < low || year > high);
      const budget = showBudget ? read(series.budget, year) : null;
      let track: EconomicsYear['track'] = null;
      if (showTrack) {
        const outcome = read(series.outcome, year);
        track = outcome.kind !== 'empty' ? { reading: outcome, kind: 'outcome' } : { reading: read(series.forecast, year), kind: 'forecast' };
      }
      if (budget?.kind === 'text') {
        texts.push({ role: 'budget', year, text: budget.text });
      }
      if (track?.reading.kind === 'text') {
        texts.push({ role: track.kind, year, text: track.reading.text });
      }
      return { year, outside, budget, track };
    });
  const total = (cells: Array<{ year: number; reading: Reading }>, file: Reading | null): EconomicsTotal => {
    const numbers = cells.filter((c) => c.reading.kind === 'number') as Array<{ year: number; reading: { kind: 'number'; value: number; decimals: number } }>;
    const decimals = Math.max(0, ...numbers.map((c) => c.reading.decimals));
    const sum = Number(numbers.reduce((acc, c) => acc + c.reading.value, 0).toFixed(decimals));
    return { sum, decimals, counted: numbers.map((c) => c.year), file };
  };
  const fileTotal = (s: SeriesAssignment | undefined, role: SeriesRole): Reading | null => {
    if (!s || s.total === null) {
      return null;
    }
    const reading = readAmount(valueOf(values, s.total), unit);
    if (reading.kind === 'empty') {
      return null;
    }
    if (reading.kind === 'text') {
      texts.push({ role, year: null, text: reading.text });
    }
    return reading;
  };
  const budget = showBudget
    ? total(
        rows.map((r) => ({ year: r.year, reading: r.budget! })),
        fileTotal(series.budget, 'budget'),
      )
    : null;
  let track: Economics['track'] = null;
  if (showTrack) {
    const outcomeYears = rows.filter((r) => r.track!.kind === 'outcome').map((r) => r.year);
    const forecastYears = rows.filter((r) => r.track!.kind === 'forecast' && r.track!.reading.kind !== 'empty').map((r) => r.year);
    // A file's total speaks for the track only when the track is wholly of
    // that series; a mix of outcome and forecast has no column in the file.
    const only = outcomeYears.length > 0 && forecastYears.length === 0 ? 'outcome' : forecastYears.length > 0 && outcomeYears.length === 0 ? 'forecast' : null;
    const file = only === null ? null : fileTotal(series[only], only);
    track = {
      ...total(
        rows.map((r) => ({ year: r.year, reading: r.track!.reading })),
        file,
      ),
      outcomeYears,
      forecastYears,
    };
  }
  return { years: rows, budget, track, texts, span: { start: low, end: high } };
}

// Consecutive years as ranges, for spelling out a composition: 2021–2023,
// 2025.
export function yearRanges(years: number[]): Array<[number, number]> {
  const sorted = [...years].sort((a, b) => a - b);
  const out: Array<[number, number]> = [];
  for (const y of sorted) {
    const last = out[out.length - 1];
    if (last && y === last[1] + 1) {
      last[1] = y;
    } else {
      out.push([y, y]);
    }
  }
  return out;
}

// The ranges as text, as every surface spells a composition out.
export function yearRangesText(years: number[]): string {
  return yearRanges(years)
    .map(([a, b]) => (a === b ? String(a) : `${a}–${b}`))
    .join(', ');
}

// How an amount is written: the locale's digits and the work's currency
// unit. Shared by the screen's overlay and the documents' pages.
export interface EconomicsFormat {
  locale: string;
  unit: string;
}

export function formatAmount(value: number, decimals: number, format: EconomicsFormat): string {
  const number = new Intl.NumberFormat(format.locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
  return format.unit === '' ? number : `${number} ${format.unit}`;
}

// The Information totals (FR-69): over the given items, the budget total and
// the outcome-and-forecast total, each item's total following the economics
// view (the file's figure where it is a number, else the sum of its years),
// summed exactly to the decimals given; and how many values are not numbers.
export interface InformationTotals {
  budget: { sum: number; decimals: number } | null;
  track: { sum: number; decimals: number } | null;
  texts: number;
}

export function informationTotals(items: Array<Economics | null>, assigned: { budget: boolean; track: boolean }): InformationTotals {
  const add = (parts: Array<{ value: number; decimals: number }>) => {
    const decimals = Math.max(0, ...parts.map((p) => p.decimals));
    const scale = 10 ** decimals;
    const sum = parts.reduce((acc, p) => acc + Math.round(p.value * scale), 0) / scale;
    return { sum, decimals };
  };
  const itemTotal = (t: EconomicsTotal | null) =>
    t === null ? [] : t.file?.kind === 'number' ? [{ value: t.file.value, decimals: t.file.decimals }] : [{ value: t.sum, decimals: t.decimals }];
  const present = items.filter((e): e is Economics => e !== null);
  return {
    budget: assigned.budget ? add(present.flatMap((e) => itemTotal(e.budget))) : null,
    track: assigned.track ? add(present.flatMap((e) => itemTotal(e.track))) : null,
    texts: present.reduce((n, e) => n + e.texts.length, 0),
  };
}
