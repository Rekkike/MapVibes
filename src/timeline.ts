// The timeline's model (FR-67, FR-70). Pure: no DOM, no state. Each item of
// the presentation is a line; a line holds a list of spans laid out in
// lanes. Until activities exist (a later pass), a line's only span is the
// item itself, from its start to its end, and the lane layout is trivial.
// Absence is never an error: an item without a readable start or end is a
// marked point at the date it has, and one with neither is listed under
// "No dates", last, with no bar; a value that cannot be read is kept as
// typed, to be shown on the line.

import { dateOfDay, readDate, type DateReading } from './dates';
import type { PresentationOrder } from './workstate';
import type { SeriesRole } from './economics';

export interface TimelineItem {
  id: string;
  // The number as shown (FR-3, FR-17), and the display name.
  label: string;
  name: string;
  colour: string;
  area: string;
  start: string;
  end: string;
  // The item's activities (FR-78), or absent for none. Absence is never an
  // error: the line shows its bar as before.
  activities?: TimelineActivity[];
  // The item's work phase (FR-78 as amended): the id of one of its
  // activities, or absent for none.
  workPhase?: string;
}

// An activity (FR-76, FR-77): a label, a start and an end (read by the shared
// date reader), and a progress or null.
export interface TimelineActivity {
  // The activity's id within its item and its edited mark (FR-77, schema
  // 12); absent where a caller has none to give.
  id?: string;
  edited?: boolean;
  label: string;
  start: string;
  end: string;
  progress: number | null;
}

// A span: from its first day to its last day, inclusive, in its lane. A
// point marks an item of which only the start ('start') or only the end
// ('end') can be read. An 'activity' span is one activity of the line
// (FR-78); the kind is extensible, so a later view (the costs view) can add
// its own span kinds and reuse the line, lane, and badge machinery.
export interface TimelineSpan {
  from: number;
  to: number;
  lane: number;
  kind: 'span' | 'start' | 'end' | 'activity' | 'amount';
  // For an activity span: the activity it draws (label and progress).
  activity?: TimelineActivity;
  // For an amount span (FR-79): the year amount of a series it draws.
  amount?: CostsAmount;
}

// A year amount of a series (FR-79): a value read as a number (FR-65), with
// the decimals it was given.
export interface CostsAmount {
  series: SeriesRole;
  year: number;
  value: number;
  decimals: number;
}

export interface TimelineLine {
  kind: 'line';
  item: TimelineItem;
  // All the line's spans, the item's own and the activities', packed into
  // lanes; the item's own span is lane 0 (FR-78).
  spans: TimelineSpan[];
  // The activity spans among them, for the badge, the fills, and the
  // description.
  activitySpans: TimelineSpan[];
  // The total lane count, lane 0 included; the expanded line's height is the
  // line height times this. The collapsed line packs up to three activity
  // sub-lanes and shows a badge for the rest.
  lanes: number;
  start: DateReading;
  end: DateReading;
  // The work phase as drawn (FR-78 as amended): the days of the referenced
  // activity, when its dates read; absent otherwise. It is the line's, not
  // a lane's: lane packing does not hide it.
  phase?: { from: number; to: number; activity: TimelineActivity };
}

export type TimelineRow =
  | { kind: 'heading'; heading: 'area'; area: string }
  | { kind: 'heading'; heading: 'noDates' }
  // The costs view's per-year totals (FR-79): one amount span per series
  // and year, the sum across the shown lines, in the lines' sub-lanes.
  | { kind: 'heading'; heading: 'totals'; spans: TimelineSpan[] }
  | TimelineLine;

export interface TimelineModel {
  rows: TimelineRow[];
  lines: TimelineLine[];
  // The first and last day of all spans, or null when no item has a date.
  extent: { from: number; to: number } | null;
  // The costs view's scales (FR-79): the largest single year amount of a
  // line, and the largest year total; a fill is the amount's share of its
  // scale. Absent in the timeline.
  scale?: { line: number; totals: number };
}

// Lays spans out in lanes: each span in the first lane where it overlaps no
// earlier span. Returns the spans with their lanes, and the number of lanes.
export function layoutLanes(spans: Array<Omit<TimelineSpan, 'lane'>>): { spans: TimelineSpan[]; lanes: number } {
  const ends: number[] = [];
  // The item's own spans win lane ties against activity spans, so the own
  // span keeps lane 0 (FR-78).
  const out = [...spans]
    .sort((a, b) => a.from - b.from || (a.kind === 'activity' ? 1 : 0) - (b.kind === 'activity' ? 1 : 0) || a.to - b.to)
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
  // The item's own spans: its bar, or a marked point.
  const own: Array<Omit<TimelineSpan, 'lane'>> = [];
  if (start.kind === 'date' && end.kind === 'date') {
    // An end written before the start is drawn between the two, as written
    // values, not corrected.
    own.push({ from: Math.min(start.start, end.end), to: Math.max(start.start, end.end), kind: 'span' });
  } else if (start.kind === 'date') {
    own.push({ from: start.start, to: start.start, kind: 'start' });
  } else if (end.kind === 'date') {
    own.push({ from: end.end, to: end.end, kind: 'end' });
  }
  // The activity spans: one per activity whose start and end both read
  // (FR-68); an activity with an unreadable date has no segment and is
  // listed as typed in the line's description instead.
  const acts: Array<Omit<TimelineSpan, 'lane'> & { activity: TimelineActivity }> = [];
  for (const a of item.activities ?? []) {
    const s = readDate(a.start);
    const e = readDate(a.end);
    if (s.kind !== 'date' || e.kind !== 'date') {
      continue;
    }
    acts.push({ from: Math.min(s.start, e.end), to: Math.max(s.start, e.end), kind: 'activity', activity: a });
  }
  // All spans pack together; the item's own spans win lane ties, so the own
  // span is lane 0 (FR-78).
  const { spans, lanes } = layoutLanes([...own, ...acts]);
  const marked = item.workPhase === undefined ? undefined : acts.find((a) => a.activity.id === item.workPhase);
  return {
    ...(marked ? { phase: { from: marked.from, to: marked.to, activity: marked.activity } } : {}),
    kind: 'line',
    item,
    spans,
    activitySpans: spans.filter((sp) => sp.kind === 'activity'),
    lanes,
    start,
    end,
  };
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
export function orderEntries<T>(
  entries: T[],
  order: PresentationOrder,
  keys: (entry: T) => { area: string; start: number | null },
  areaOrder: string[] = [],
  locale = 'en',
): T[] {
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
  if (undated.length > 0) {
    rows.push({ kind: 'heading', heading: 'noDates' }, ...undated);
  }
  const days = dated.flatMap((l) => [...l.spans, ...l.activitySpans].flatMap((s) => [s.from, s.to]));
  const extent = days.length > 0 ? { from: Math.min(...days), to: Math.max(...days) } : null;
  return { rows, lines: [...ordered, ...undated], extent };
}

// The fitted window (FR-67): the full span of all items, with a margin on
// either side, never shorter than a month; a year around nothing at all.
export function fitWindow(extent: { from: number; to: number } | null): { from: number; to: number } {
  if (extent === null) {
    return { from: 0, to: 365 };
  }
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

// The costs view's model (FR-79). Each item is a line carrying, for each
// year with a value in an assigned series, one span per series covering the
// year; the series of a year fully overlap, so the shared lane layout packs
// them into the sub-lane rows, in the order budget, forecast, outcome. A
// value that is not a number has no span: it is listed as typed in the
// line's description and left out of the sums (FR-65). An item without
// economics is an empty named line: absence is never an error and never a
// zero.
export interface CostsItem extends Omit<TimelineItem, 'activities'> {
  amounts: CostsAmount[];
  // Values that are not numbers, as typed.
  typed: Array<{ series: SeriesRole; year: number; text: string }>;
}

export interface CostsLine extends TimelineLine {
  item: CostsItem;
}

const SERIES_ORDER: SeriesRole[] = ['budget', 'forecast', 'outcome'];

function yearSpan(year: number): { from: number; to: number } {
  return { from: Math.round(Date.UTC(year, 0, 1) / 86_400_000), to: Math.round(Date.UTC(year, 11, 31) / 86_400_000) };
}

function amountSpans(amounts: CostsAmount[]): TimelineSpan[] {
  const sorted = [...amounts].sort((a, b) => a.year - b.year || SERIES_ORDER.indexOf(a.series) - SERIES_ORDER.indexOf(b.series));
  return layoutLanes(sorted.map((amount) => ({ ...yearSpan(amount.year), kind: 'amount' as const, amount }))).spans;
}

// The years are those of the assigned series (FR-79): the fitted window
// spans them whether or not every year holds a value.
export function buildCosts(items: CostsItem[], years: number[], order: PresentationOrder = 'number', areaOrder: string[] = [], locale = 'en'): TimelineModel {
  const all: CostsLine[] = items.map((item) => {
    const spans = amountSpans(item.amounts);
    return {
      kind: 'line',
      item,
      spans,
      activitySpans: [],
      lanes: Math.max(1, ...spans.map((s) => s.lane + 1)),
      start: readDate(item.start),
      end: readDate(item.end),
    };
  });
  const ordered = orderEntries(all, order, (l) => ({ area: l.item.area, start: l.start.kind === 'date' ? l.start.start : null }), areaOrder, locale);
  // The totals: per series and year, the sum of the lines' amounts, exact to
  // the decimals given.
  const sums = new Map<string, CostsAmount>();
  for (const line of all) {
    for (const a of line.item.amounts) {
      const key = `${a.series} ${a.year}`;
      const sum = sums.get(key) ?? { series: a.series, year: a.year, value: 0, decimals: 0 };
      const decimals = Math.max(sum.decimals, a.decimals);
      const scale = 10 ** decimals;
      sums.set(key, { ...sum, decimals, value: (Math.round(sum.value * scale) + Math.round(a.value * scale)) / scale });
    }
  }
  const totals = amountSpans([...sums.values()]);
  const rows: TimelineRow[] = [];
  if (totals.length > 0) {
    rows.push({ kind: 'heading', heading: 'totals', spans: totals });
  }
  let area: string | null = null;
  for (const line of ordered) {
    if (order === 'area' && line.item.area !== area) {
      area = line.item.area;
      rows.push({ kind: 'heading', heading: 'area', area });
    }
    rows.push(line);
  }
  const extent = years.length > 0 ? { from: yearSpan(Math.min(...years)).from, to: yearSpan(Math.max(...years)).to } : null;
  const largest = (spans: TimelineSpan[]) => Math.max(0, ...spans.map((s) => s.amount!.value));
  return { rows, lines: ordered, extent, scale: { line: largest(all.flatMap((l) => l.spans)), totals: largest(totals) } };
}

// An amount's share of its scale, as a fill from 0 to 1: a negative amount
// or an empty scale has no fill.
export function amountShare(value: number, scale: number): number {
  return scale > 0 && value > 0 ? Math.min(1, value / scale) : 0;
}

// An amount in whole thousands (FR-79 as ruled): rounded half away from zero.
export function inThousands(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value) / 1000);
}

// Events in a schedule view (FR-80): each is a hairline at its date with a
// label chip at the top. Chips whose labels would overlap stagger into two
// rows; an event that fits neither row is counted in a "+n" chip beside the
// chip that blocks it. Pure: the chips' widths are given, so the layout
// needs no measuring, and zooming, which spreads the positions, separates
// them. (Amended in the follow-up pass: the edge indicators, the chips at the plot's
// ends that count the events beyond the window, reserve their room at the
// ends, so that no in-window chip overlaps them.)
export interface ScheduleEvent {
  id: string;
  label: string;
  // The event's day (the first day of a year or a month), and its date as
  // written.
  day: number;
  date: string;
}

export interface EventChip {
  event: ScheduleEvent;
  // The hairline's position, the chip's box, and its row.
  x: number;
  left: number;
  width: number;
  row: number;
  // The events hidden behind this chip's "+n".
  more: ScheduleEvent[];
}

export const EVENT_ROWS = 2;
const EVENT_GAP = 4;

export function layoutEvents(
  events: Array<{ event: ScheduleEvent; x: number; width: number }>,
  plotWidth: number,
  moreWidth: number,
  rows = EVENT_ROWS,
  // The room the edge indicators take at the plot's left and right ends
  // (the follow-up amendment): in-window chips keep clear of it.
  reservedLeft = 0,
  reservedRight = 0,
): EventChip[] {
  const ends: number[] = Array.from({ length: rows }, (_, i) => (i === 0 && reservedLeft > 0 ? reservedLeft : -Infinity));
  const last: Array<EventChip | null> = Array.from({ length: rows }, () => null);
  const out: EventChip[] = [];
  const sorted = events.filter((e) => e.x >= 0 && e.x <= plotWidth).sort((a, b) => a.x - b.x || a.event.day - b.event.day);
  const rightLimit = plotWidth - reservedRight;
  for (const e of sorted) {
    // A chip stands after its hairline, or before it where the plot ends.
    const left = e.x + e.width > rightLimit && e.x - e.width >= reservedLeft ? e.x - e.width : e.x;
    const row = ends.findIndex((end) => end + EVENT_GAP <= left);
    if (row === -1) {
      // Neither row has room: the event joins the "+n" of the chip that
      // blocks it in the last row, which then takes the room of its "+n".
      const blocker = last[rows - 1]!;
      if (blocker.more.length === 0) {
        ends[rows - 1] += moreWidth;
      }
      blocker.more.push(e.event);
      continue;
    }
    const chip: EventChip = { event: e.event, x: e.x, left, width: e.width, row, more: [] };
    ends[row] = left + e.width;
    last[row] = chip;
    out.push(chip);
  }
  return out;
}

// The figure's shared geometry: what the screen's view (CSS layout) and the
// documents' painter (absolute coordinates) both compute before they draw.
// Only the geometry is shared; each paints in its own way.

export interface DayWindow {
  from: number;
  to: number;
}

// Where a day falls in a window, as a share of its length: 0 at the
// window's start, 1 at its end. The screen multiplies it by 100 (a
// percentage) or by the plot's width in pixels, the documents by the plot's
// width in page units.
export function dayShare(window: DayWindow, day: number): number {
  return (day - window.from) / (window.to - window.from);
}

// The steps of the axis, and the least room a tick needs.
const DAY = 1;
const STEPS: Array<{ unit: 'day' | 'month' | 'year'; n: number; days: number }> = [
  { unit: 'day', n: 1, days: DAY },
  { unit: 'day', n: 7, days: 7 },
  { unit: 'month', n: 1, days: 30.4 },
  { unit: 'month', n: 3, days: 91.3 },
  { unit: 'month', n: 6, days: 182.6 },
  { unit: 'year', n: 1, days: 365.25 },
  { unit: 'year', n: 2, days: 730.5 },
  { unit: 'year', n: 5, days: 1826 },
  { unit: 'year', n: 10, days: 3652 },
  { unit: 'year', n: 25, days: 9131 },
  { unit: 'year', n: 50, days: 18262 },
];
const MIN_TICK_PX = 64;

// The ticks of the axis: the first day of each year, month, or week shown.
export function ticks(window: DayWindow, width: number): Array<{ day: number; unit: 'day' | 'month' | 'year' }> {
  const pxPerDay = width / Math.max(1e-9, window.to - window.from);
  const step = STEPS.find((s) => s.days * pxPerDay >= MIN_TICK_PX) ?? STEPS[STEPS.length - 1];
  const out: Array<{ day: number; unit: 'day' | 'month' | 'year' }> = [];
  const first = dateOfDay(Math.floor(window.from));
  if (step.unit === 'year') {
    let y = Math.ceil(first.year / step.n) * step.n;
    for (;;) {
      const day = Date.UTC(y, 0, 1) / 86_400_000;
      if (day > window.to) {
        break;
      }
      if (day >= window.from) {
        out.push({ day, unit: 'year' });
      }
      y += step.n;
      if (out.length > 500) {
        break;
      }
    }
  } else if (step.unit === 'month') {
    let m = first.year * 12 + Math.floor((first.month - 1) / step.n) * step.n;
    for (;;) {
      const day = Date.UTC(Math.floor(m / 12), m % 12, 1) / 86_400_000;
      if (day > window.to) {
        break;
      }
      if (day >= window.from) {
        out.push({ day, unit: 'month' });
      }
      m += step.n;
      if (out.length > 500) {
        break;
      }
    }
  } else {
    // Weeks start on Mondays (1970-01-01 was a Thursday).
    let day = Math.ceil(window.from);
    if (step.n === 7) {
      day += (((4 - day) % 7) + 7) % 7;
    }
    for (; day <= window.to && out.length <= 500; day += step.n) {
      out.push({ day, unit: 'day' });
    }
  }
  return out;
}

// An event's label chip (FR-80): its width is estimated from its characters
// (12-pixel text since v2.0.0, the width per character and the longest
// chip raised in proportion from the 11-pixel text of earlier versions), up to a longest chip
// that ends in an ellipsis. The documents scale it to page units.
const EVENT_CHAR_PX = 7.1;
const EVENT_PAD_PX = 14;
const EVENT_MAX_PX = 175;

export function eventChipWidth(label: string): number {
  return Math.min(EVENT_MAX_PX, Math.ceil(label.length * EVENT_CHAR_PX) + EVENT_PAD_PX);
}
