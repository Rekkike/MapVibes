// The timeline's model (FR-67, FR-70). Pure: no DOM, no state. Each item of
// the presentation is a line; a line holds a list of spans laid out in
// lanes. Until activities exist (a later pass), a line's only span is the
// item itself, from its start to its end, and the lane layout is trivial.
// Absence is never an error: an item without a readable start or end is a
// marked point at the date it has, and one with neither is listed under
// "No dates", last, with no bar; a value that cannot be read is kept as
// typed, to be shown on the line.

import { dateOfDay, dayNumber, readDate, type DateReading } from './dates';
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

// The calendar-anchored zoom (FR-67 as amended in v2.2.0): a ladder of four
// anchors -- a calendar month, quarter, half-year, and year -- and then the
// free multi-year range out to the fitted window. At an anchor the window is
// the calendar unit that contains the window's centre date, so its edges are
// calendar boundaries. The limits of zoom are one calendar month and the
// fitted window.
export type ZoomLevel = 'month' | 'quarter' | 'half' | 'year';
export const ZOOM_LEVELS: ZoomLevel[] = ['month', 'quarter', 'half', 'year'];
// Each anchor's length in months, and its nominal length in days (an
// average calendar unit), by which spans are compared.
const LEVEL_MONTHS: Record<ZoomLevel, number> = { month: 1, quarter: 3, half: 6, year: 12 };
export const LEVEL_DAYS: Record<ZoomLevel, number> = { month: 30.44, quarter: 91.31, half: 182.62, year: 365.25 };
// The window's length is matched to an anchor within this share.
const ANCHOR_TOLERANCE = 0.06;

// The calendar unit of a level that contains a day.
export function anchorWindow(level: ZoomLevel, centre: number): { from: number; to: number } {
  const { year, month } = dateOfDay(Math.floor(centre));
  const months = LEVEL_MONTHS[level];
  const first = Math.floor((month - 1) / months) * months;
  const from = dayNumber(year, first + 1, 1);
  const end = first + months;
  const to = dayNumber(year + Math.floor(end / 12), (end % 12) + 1, 1);
  return { from, to };
}

// The anchors of the ladder for a fitted window: those not wider than it
// (FR-67 as amended: an anchor wider than the fitted window is left out).
export function ladder(fitted: { from: number; to: number }): ZoomLevel[] {
  const length = fitted.to - fitted.from;
  return ZOOM_LEVELS.filter((level) => level === 'month' || LEVEL_DAYS[level] < length * (1 - ANCHOR_TOLERANCE));
}

// The anchor a window is at, or null where it is between anchors or in the
// free range: its edges are the edges of the calendar unit at its centre.
export function anchorOf(window: { from: number; to: number }): ZoomLevel | null {
  const centre = (window.from + window.to) / 2;
  for (const level of ZOOM_LEVELS) {
    const unit = anchorWindow(level, centre);
    if (Math.abs(unit.from - window.from) < 0.01 && Math.abs(unit.to - window.to) < 0.01) {
      return level;
    }
  }
  return null;
}

// Where a window settles (FR-67 as amended): onto the nearest anchor of the
// ladder, by the logarithm of its length, at its centre date; a window
// longer than the widest anchor is in the free range and stays as it is.
export function settleWindow(window: { from: number; to: number }, fitted: { from: number; to: number }): { from: number; to: number } {
  const levels = ladder(fitted);
  const length = window.to - window.from;
  const widest = levels[levels.length - 1];
  if (length > LEVEL_DAYS[widest] * (1 + ANCHOR_TOLERANCE)) {
    return window;
  }
  const nearest = levels.reduce((best, level) =>
    Math.abs(Math.log(length / LEVEL_DAYS[level])) < Math.abs(Math.log(length / LEVEL_DAYS[best])) ? level : best,
  );
  return anchorWindow(nearest, (window.from + window.to) / 2);
}

// One step of the zoom buttons (FR-67 as amended): in, to the next anchor
// narrower than the window, at its centre date; out, to the next anchor
// wider than it, and from the widest anchor to the fitted window. At the
// limits a step leaves the window as it is.
export function stepWindow(window: { from: number; to: number }, fitted: { from: number; to: number }, direction: 'in' | 'out'): { from: number; to: number } {
  const levels = ladder(fitted);
  const length = window.to - window.from;
  const centre = (window.from + window.to) / 2;
  if (direction === 'in') {
    const narrower = [...levels].reverse().find((level) => LEVEL_DAYS[level] < length * (1 - ANCHOR_TOLERANCE));
    return narrower ? anchorWindow(narrower, centre) : window;
  }
  const wider = levels.find((level) => LEVEL_DAYS[level] > length * (1 + ANCHOR_TOLERANCE));
  return wider ? anchorWindow(wider, centre) : { ...fitted };
}

// The limits of zoom (FR-67 as amended): one calendar month (the month at
// the window's centre) to the fitted window.
export function clampWindow(window: { from: number; to: number }, fitted: { from: number; to: number }): { from: number; to: number } {
  const middle = (window.from + window.to) / 2;
  const month = anchorWindow('month', middle);
  const minLength = month.to - month.from;
  const maxLength = Math.max(minLength, fitted.to - fitted.from);
  const length = Math.min(maxLength, Math.max(minLength, window.to - window.from));
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

// The axis's grade by the window's length (FR-67 as amended in v2.2.0): the
// grade of the nearest anchor, by the logarithm of the length -- days at
// the month, months at the quarter and the half-year, years at the year
// and beyond.
export type AxisGrade = 'days' | 'months' | 'years';

export function axisGrade(window: DayWindow): AxisGrade {
  const length = window.to - window.from;
  if (length < Math.sqrt(LEVEL_DAYS.month * LEVEL_DAYS.quarter)) {
    return 'days';
  }
  return length < Math.sqrt(LEVEL_DAYS.half * LEVEL_DAYS.year) ? 'months' : 'years';
}

export interface GradedTick {
  day: number;
  unit: 'day' | 'month' | 'year';
  // A day tick on the 1st of a month: it carries the month's name, marking
  // the boundary.
  monthStart?: boolean;
  // The first label of the window and every January carry the year beside
  // the month's name at the day and month grades (FR-67 as amended in
  // v2.2.1).
  withYear?: boolean;
}

// Marks the ticks that carry the year: the first, and every January.
function markYears(ticks: GradedTick[]): GradedTick[] {
  ticks.forEach((tick, i) => {
    const date = dateOfDay(tick.day);
    const january = date.month === 1 && (tick.unit === 'month' || date.day === 1);
    if (i === 0 || january) {
      tick.withYear = true;
    }
  });
  return ticks;
}

// The least room between two labelled ticks, in pixels.
const GRADED_TICK_PX = 64;
const MONTH_TICK_PX = 36;
// The days labelled at the month level where every day has no room (the
// owner's ruling): the 1st, 8th, 15th, 22nd, and 29th, else the 1st and 15th.
const WEEKLY_DAYS = [1, 8, 15, 22, 29];
const FORTNIGHTLY_DAYS = [1, 15];

// The ticks of the axis at the window's grade.
export function gradedTicks(window: DayWindow, width: number): GradedTick[] {
  const grade = axisGrade(window);
  const pxPerDay = width / Math.max(1e-9, window.to - window.from);
  const first = Math.ceil(window.from);
  const out: GradedTick[] = [];
  if (grade === 'days') {
    const days = pxPerDay >= GRADED_TICK_PX ? null : 7 * pxPerDay >= GRADED_TICK_PX ? WEEKLY_DAYS : FORTNIGHTLY_DAYS;
    for (let day = first; day <= window.to && out.length <= 500; day++) {
      const date = dateOfDay(day).day;
      if (days === null || days.includes(date)) {
        out.push({ day, unit: 'day', monthStart: date === 1 });
      }
    }
    return markYears(out);
  }
  if (grade === 'months') {
    const every = 30.44 * pxPerDay >= MONTH_TICK_PX ? 1 : 2;
    const start = dateOfDay(Math.floor(window.from));
    for (let m = start.year * 12 + start.month - 1; out.length <= 500; m++) {
      const day = dayNumber(Math.floor(m / 12), (m % 12) + 1, 1);
      if (day > window.to) {
        break;
      }
      if (day >= window.from && (m % 12) % every === 0) {
        out.push({ day, unit: 'month' });
      }
    }
    return markYears(out);
  }
  // Years: the existing steps of whole years (1, 2, 5, 10, ... years), never
  // months or days.
  const pxPerYear = 365.25 * pxPerDay;
  const n = [1, 2, 5, 10, 25, 50].find((y) => y * pxPerYear >= MIN_TICK_PX) ?? 50;
  const startYear = dateOfDay(Math.floor(window.from)).year;
  for (let y = Math.ceil(startYear / n) * n; out.length <= 500; y += n) {
    const day = dayNumber(y, 1, 1);
    if (day > window.to) {
      break;
    }
    if (day >= window.from) {
      out.push({ day, unit: 'year' });
    }
  }
  return out;
}

// The readout of the schedule views (FR-67 as amended in v2.2.1): the
// visible window in compact calendar form, from the interface language's
// own calendar names and its two unit codes. At an anchor: the month and
// year, the quarter or half-year code with the year, or the year; in the
// free multi-year range, the years of the window's ends; at no anchor and
// no wider than a year, the window's ends at the axis's grade.
export function windowLabel(window: DayWindow, locale: string, codes: { quarter: string; half: string }): string {
  const date = (day: number) => new Date(day * 86_400_000);
  const fmt = (day: number, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(date(day));
  const fill = (template: string, values: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ''));
  const first = Math.floor(window.from + 1e-6);
  const last = Math.ceil(window.to - 1e-6) - 1;
  const start = dateOfDay(first);
  const end = dateOfDay(last);
  const level = anchorOf(window);
  if (level === 'month') {
    return fmt(first, { month: 'short', year: 'numeric' });
  }
  if (level === 'quarter') {
    return fill(codes.quarter, { n: Math.floor((start.month - 1) / 3) + 1, year: start.year });
  }
  if (level === 'half') {
    return fill(codes.half, { n: start.month <= 6 ? 1 : 2, year: start.year });
  }
  if (level === 'year') {
    return String(start.year);
  }
  const years = start.year === end.year ? String(start.year) : `${start.year}\u2013${end.year}`;
  if (window.to - window.from > LEVEL_DAYS.year * (1 + ANCHOR_TOLERANCE)) {
    return years;
  }
  const grade = axisGrade(window);
  if (grade === 'years') {
    return years;
  }
  const sameYear = start.year === end.year;
  const part = grade === 'days' ? { day: 'numeric', month: 'short' } : { month: 'short' };
  const a = fmt(first, sameYear ? (part as Intl.DateTimeFormatOptions) : { ...(part as Intl.DateTimeFormatOptions), year: 'numeric' });
  const b = fmt(last, { ...(part as Intl.DateTimeFormatOptions), year: 'numeric' });
  return a === b ? b : `${a} \u2013 ${b}`;
}
