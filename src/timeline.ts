// The timeline's model (FR-67, FR-70). Pure: no DOM, no state. Each item of
// the presentation is a line; a line holds a list of spans laid out in
// lanes. Until activities exist (a later pass), a line's only span is the
// item itself, from its start to its end, and the lane layout is trivial.
// Absence is never an error: an item without a readable start or end is a
// marked point at the date it has, and one with neither is listed under
// "No dates", last, with no bar; a value that cannot be read is kept as
// typed, to be shown on the line.

import { readDate, type DateReading } from './dates';
import type { PresentationOrder } from './workstate';

export interface TimelineItem {
  id: string;
  // The number as shown (FR-3, FR-17), and the display name.
  label: string;
  name: string;
  colour: string;
  area: string;
  start: string;
  end: string;
}

// A span: from its first day to its last day, inclusive, in its lane. A
// point marks an item of which only the start ('start') or only the end
// ('end') can be read.
export interface TimelineSpan {
  from: number;
  to: number;
  lane: number;
  kind: 'span' | 'start' | 'end';
}

export interface TimelineLine {
  kind: 'line';
  item: TimelineItem;
  spans: TimelineSpan[];
  lanes: number;
  start: DateReading;
  end: DateReading;
}

export type TimelineRow = { kind: 'heading'; heading: 'area'; area: string } | { kind: 'heading'; heading: 'noDates' } | TimelineLine;

export interface TimelineModel {
  rows: TimelineRow[];
  lines: TimelineLine[];
  // The first and last day of all spans, or null when no item has a date.
  extent: { from: number; to: number } | null;
}

// Lays spans out in lanes: each span in the first lane where it overlaps no
// earlier span. Returns the spans with their lanes, and the number of lanes.
export function layoutLanes(spans: Array<Omit<TimelineSpan, 'lane'>>): { spans: TimelineSpan[]; lanes: number } {
  const ends: number[] = [];
  const out = [...spans]
    .sort((a, b) => a.from - b.from || a.to - b.to)
    .map((s) => {
      let lane = ends.findIndex((end) => end < s.from);
      if (lane === -1) {
        lane = ends.length;
        ends.push(s.to);
      } else {
        ends[lane] = s.to;
      }
      return { ...s, lane };
    });
  return { spans: out, lanes: Math.max(1, ends.length) };
}

function lineOf(item: TimelineItem): TimelineLine {
  const start = readDate(item.start);
  const end = readDate(item.end);
  const raw: Array<Omit<TimelineSpan, 'lane'>> = [];
  if (start.kind === 'date' && end.kind === 'date') {
    // An end written before the start is drawn between the two, as written
    // values, not corrected.
    raw.push({ from: Math.min(start.start, end.end), to: Math.max(start.start, end.end), kind: 'span' });
  } else if (start.kind === 'date') {
    raw.push({ from: start.start, to: start.start, kind: 'start' });
  } else if (end.kind === 'date') {
    raw.push({ from: end.end, to: end.end, kind: 'end' });
  }
  const { spans, lanes } = layoutLanes(raw);
  return { kind: 'line', item, spans, lanes, start, end };
}

// The first day an entry starts on, for the order by start date: the
// start's first day, else null (FR-70: items without a start come last).
export function startDay(start: string): number | null {
  const r = readDate(start);
  return r.kind === 'date' ? r.start : null;
}

// The presentation's order (FR-70), shared by the timeline's lines and the
// "In view" list: by number (the order given), by area (the areas in the
// order given, then any other area in alphabetical order, then the entries
// without an area; by number within each), or by start date (the entries
// without a start last; by number among equals). Stable.
export function orderEntries<T>(entries: T[], order: PresentationOrder, keys: (entry: T) => { area: string; start: number | null }, areaOrder: string[] = [], locale = 'en'): T[] {
  const indexed = entries.map((entry, index) => ({ entry, index, ...keys(entry) }));
  if (order === 'area') {
    const rank = areaRanks(
      indexed.map((e) => e.area),
      areaOrder,
      locale,
    );
    indexed.sort((a, b) => rank.get(a.area)! - rank.get(b.area)! || a.index - b.index);
  } else if (order === 'start') {
    indexed.sort((a, b) => (a.start === null ? 1 : 0) - (b.start === null ? 1 : 0) || (a.start ?? 0) - (b.start ?? 0) || a.index - b.index);
  }
  return indexed.map((e) => e.entry);
}

// The rank of each area for the order by area.
export function areaRanks(areas: string[], areaOrder: string[], locale = 'en'): Map<string, number> {
  const present = [...new Set(areas)];
  const known = areaOrder.filter((a) => present.includes(a));
  const others = present.filter((a) => a !== '' && !areaOrder.includes(a)).sort((a, b) => a.localeCompare(b, locale));
  const ranked = [...known, ...others, ...(present.includes('') ? [''] : [])];
  return new Map(ranked.map((a, i) => [a, i]));
}

export function buildTimeline(items: TimelineItem[], order: PresentationOrder = 'number', areaOrder: string[] = [], locale = 'en'): TimelineModel {
  const all = items.map(lineOf);
  const dated = all.filter((l) => l.spans.length > 0);
  const undated = all.filter((l) => l.spans.length === 0);
  const ordered = orderEntries(dated, order, (l) => ({ area: l.item.area, start: l.start.kind === 'date' ? l.start.start : null }), areaOrder, locale);
  const rows: TimelineRow[] = [];
  let area: string | null = null;
  for (const line of ordered) {
    if (order === 'area' && line.item.area !== area) {
      area = line.item.area;
      rows.push({ kind: 'heading', heading: 'area', area });
    }
    rows.push(line);
  }
  // "No dates" is always last, in number order.
  if (undated.length > 0) rows.push({ kind: 'heading', heading: 'noDates' }, ...undated);
  const days = dated.flatMap((l) => l.spans.flatMap((s) => [s.from, s.to]));
  const extent = days.length > 0 ? { from: Math.min(...days), to: Math.max(...days) } : null;
  return { rows, lines: [...ordered, ...undated], extent };
}

// The fitted window (FR-67): the full span of all items, with a margin on
// either side, never shorter than a month; a year around nothing at all.
export function fitWindow(extent: { from: number; to: number } | null): { from: number; to: number } {
  if (extent === null) return { from: 0, to: 365 };
  const length = Math.max(30, extent.to + 1 - extent.from);
  const margin = length * 0.03;
  const middle = (extent.from + extent.to + 1) / 2;
  return { from: middle - length / 2 - margin, to: middle + length / 2 + margin };
}

// The limits of zoom: from two weeks to four times the fitted window.
export const MIN_WINDOW_DAYS = 14;

export function clampWindow(window: { from: number; to: number }, fitted: { from: number; to: number }): { from: number; to: number } {
  const maxLength = Math.max(MIN_WINDOW_DAYS, (fitted.to - fitted.from) * 4);
  const length = Math.min(maxLength, Math.max(MIN_WINDOW_DAYS, window.to - window.from));
  const middle = (window.from + window.to) / 2;
  return { from: middle - length / 2, to: middle + length / 2 };
}

// Zooms a window by a factor (above 1 zooms in) around a day.
export function zoomWindow(window: { from: number; to: number }, factor: number, around: number): { from: number; to: number } {
  return { from: around - (around - window.from) / factor, to: around + (window.to - around) / factor };
}
