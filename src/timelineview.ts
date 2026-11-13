// The timeline view (FR-67): one line per item across a time axis, inside
// the presentation stage. It zooms and pans in time only: the plain wheel
// scrolls the lines; the wheel with Ctrl or Cmd, and a pinch, zoom time; a
// sideways drag or a sideways wheel pans. Bars are placed in percentages of
// the time window, so a change of window moves them without measuring.
// Pointer and wheel events stop here, so that the stage's map underneath
// neither pans nor zooms.

import { formatDate, readDate } from './dates';
import {
  amountShare,
  clampWindow,
  dayShare,
  eventChipWidth,
  EVENT_ROWS,
  fitWindow,
  layoutEvents,
  ticks,
  zoomWindow,
  type ScheduleEvent,
  type CostsAmount,
  type CostsLine,
  type TimelineLine,
  type TimelineModel,
  type TimelineSpan,
} from './timeline';
import type { SeriesRole } from './economics';

// The shared geometry lives with the model; these two stay importable from
// here.
export { eventChipWidth, ticks };

// {placeholder} substitution, as in i18n.
function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_match: string, k: string) => String(values[k] ?? ''));
}

export interface TimelineLabels {
  noDates: string;
  noArea: string;
  empty: string;
  // Shown when neither the start nor the end role is assigned.
  noRoles: string | null;
  startOnly: string;
  endOnly: string;
  // The headers of the start and end columns, for values shown as typed.
  startHeader: string;
  endHeader: string;
  locale: string;
  // The accessible name of a line's expansion control (FR-78 as amended),
  // with {name} and, in the timeline, {count}; and the header of
  // the activities in a line's description.
  expand: string;
  activities: string;
  // An activity corrected by hand, and the work phase (FR-76, FR-78 as
  // amended), as said in titles and descriptions.
  edited: string;
  workPhase: string;
  // The costs view's own words (FR-79); absent in the timeline.
  costs?: CostsLabels;
  // The today mark (FR-78, FR-79 as amended): its name with
  // {date}, and the edge indicator's names when today lies beyond the window.
  today: string;
  todayBefore: string;
  todayAfter: string;
  // The events' heading and their "+n" chip (FR-80), and the edge
  // indicators' accessible names (the follow-up amendment): the events beyond the shown
  // window, listed at each end of the strip.
  events: string;
  moreEvents: string;
  eventsBefore: string;
  eventsAfter: string;
}

export interface CostsLabels {
  // The series' names, the user's own words (FR-63).
  series: Record<SeriesRole, string>;
  // An amount in whole thousands, as shown on a bar, and exactly, with the
  // unit, as said in a title and a description.
  thousands: (value: number) => string;
  exact: (amount: CostsAmount) => string;
  // The totals row's name, its note of the unit shown, and its description.
  totals: string;
  unitNote: string;
  totalsDescription: string;
  // A line without amounts, and the header of the values shown as typed.
  none: string;
  typed: string;
  // The quiet tick's word for a year without a budget (FR-79 as amended).
  noBudget: string;
}

export interface TimelineCallbacks {
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  // The window or the scroll position changed.
  onViewChanged: () => void;
  // The badge of an item, drawn like its marker.
  badge: (line: TimelineLine) => HTMLElement;
}

type Window = { from: number; to: number };

// The packed sub-lane rows shown in a collapsed line (FR-78): the item's own
// span is row 0; spans in later lanes collapse into the "+n" badge. The
// geometry: 7-pixel segments with 2-pixel gaps and 2-pixel padding on a wide
// viewport (3 rows: tops 2, 11, 20, bottom 27 of 28), 4-pixel segments with
// 2-pixel gaps and 1-pixel padding in the narrow 20-pixel plot (tops 1, 7,
// 13, bottom 17 of 20).
// v1.10.0's packed sub-lanes are retired in the views (FR-78 as amended):
// collapsed, a line shows its own bar alone.
// An activity's name beside its bar (FR-78 as amended): the gap
// between the bar and the name, and the name's width estimated from its
// characters where the layout gives none.
const LANE_LABEL_GAP = 4;
const LANE_LABEL_CHAR_PX = 6.5;
// A segment's label shows inside it only from this width on (the rest is
// carried by its title and the line's description).
// An amount's figure in thousands (FR-79) shows after its fill where the
// year cell has room for both, else inside the fill's end where the fill is
// wide enough to hold it, else not at all: the title and the description
// carry it. The figure's width is estimated from its characters (10-pixel
// tabular figures), so that placing it needs no measuring.
// An event's label chip (FR-80): its width is estimated from its characters
// (11-pixel text, 6 pixels of padding either side), up to a longest chip
// that ends in an ellipsis; a "+n" chip beside it takes a fixed room.
const EVENT_MORE_PX = 33;
// The edge indicators (the follow-up amendment): a small chip at each end of the events
// strip counting the events beyond the shown window, in the "+n" chip's own
// size and style. Its tap pans the window to the nearest of those events.
const EVENT_EDGE_PX = 31;
const EVENT_EDGE_RESERVE_PX = 33;
// Where a tap on an edge chip brings the nearest event into the window: this
// share of the window's length inside the edge it lies beyond.
const EVENT_EDGE_MARGIN = 0.05;

// 12-pixel tabular figures since v2.0.0 (they were 10 pixels, 6 a figure).
const AMOUNT_CHAR_PX = 7.2;
const AMOUNT_CHAR_RATIO = 0.6;
const AMOUNT_GAP_PX = 3;

// The width of one figure of an amount, from the size its label is drawn
// at: six tenths of it (7.2 pixels at 12, and 6 at the 10 pixels that the
// compact and short classes keep). Where the size is not known (no layout),
// the 12-pixel width.
function figureWidth(mark: Element): number {
  const label = mark.querySelector('.timeline-seg-label');
  const size = label ? parseFloat(getComputedStyle(label).fontSize) : NaN;
  return Number.isFinite(size) && size > 0 ? size * AMOUNT_CHAR_RATIO : AMOUNT_CHAR_PX;
}

export function amountLabelPlace(cellPx: number, share: number, characters: number, charPx = AMOUNT_CHAR_PX): 'outside' | 'inside' | 'none' {
  const label = characters * charPx;
  const fill = cellPx * share;
  if (fill + AMOUNT_GAP_PX + label + AMOUNT_GAP_PX <= cellPx) {
    return 'outside';
  }
  return fill >= label + 2 * AMOUNT_GAP_PX ? 'inside' : 'none';
}
// The plot's width where the layout gives none (before the first layout).
const FALLBACK_WIDTH = 800;
const DRAG_THRESHOLD = 5;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

export class TimelineView {
  private readonly axis: HTMLElement;
  private readonly grid: HTMLElement;
  // The events (FR-80): the strip of label chips under the axis, and the
  // hairlines crossing the whole body.
  private readonly eventStrip: HTMLElement;
  private readonly eventPlot: HTMLElement;
  private readonly eventLines: HTMLElement;
  private events: ScheduleEvent[] = [];
  // Today's day number for the today mark, or null for none.
  private today: number | null = null;
  private readonly scroller: HTMLElement;
  private readonly list: HTMLUListElement;
  private readonly message: HTMLElement;
  private model: TimelineModel = { rows: [], lines: [], extent: null };
  private labels: TimelineLabels | null = null;
  private current: Window = { from: 0, to: 365 };
  private fitted: Window = { from: 0, to: 365 };
  // A window chosen by the user (or restored), rather than the fitted one.
  private chosen = false;
  // A first line to scroll to once the lines are laid out.
  private pendingLine: number | null = null;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private drag: { x: number; y: number; window: Window; panning: boolean } | null = null;
  private pinch: { distance: number; window: Window; around: number } | null = null;
  private suppressClick = false;
  // The lines expanded to full-height lanes (FR-78): transient UI state,
  // never saved; the saved view is the window and the first visible line.
  private readonly expanded = new Set<string>();

  constructor(
    readonly root: HTMLElement,
    private readonly callbacks: TimelineCallbacks,
    // The costs view (FR-79) is the timeline's machinery with its own line
    // geometry, set in the stylesheet by this kind.
    kind: 'timeline' | 'costs' = 'timeline',
  ) {
    root.classList.add('timeline');
    root.dataset.kind = kind;
    this.axis = el('div', 'timeline-axis');
    this.axis.setAttribute('aria-hidden', 'true');
    const body = el('div', 'timeline-body');
    this.grid = el('div', 'timeline-grid');
    this.grid.setAttribute('aria-hidden', 'true');
    this.scroller = el('div', 'timeline-scroll');
    this.list = el('ul', 'timeline-lines');
    this.message = el('p', 'timeline-message notice hidden');
    this.scroller.append(this.list, this.message);
    this.eventStrip = el('div', 'timeline-event-strip hidden');
    this.eventStrip.setAttribute('role', 'list');
    this.eventPlot = el('div', 'timeline-event-plot');
    this.eventStrip.append(el('div', 'timeline-axis-name'), this.eventPlot);
    this.eventLines = el('div', 'timeline-event-lines');
    this.eventLines.setAttribute('aria-hidden', 'true');
    body.append(this.grid, this.scroller, this.eventLines);
    root.replaceChildren(this.axis, this.eventStrip, body);
    // Neither the pointer nor the wheel reaches the map underneath.
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'wheel', 'dblclick'] as const) {
      root.addEventListener(type, (e) => e.stopPropagation());
    }
    body.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    body.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    body.addEventListener('pointermove', (e) => this.onPointerMove(e));
    body.addEventListener('pointerup', (e) => this.onPointerUp(e));
    body.addEventListener('pointercancel', (e) => this.onPointerUp(e));
    body.addEventListener(
      'click',
      (e) => {
        if (!this.suppressClick) {
          return;
        }
        this.suppressClick = false;
        e.stopPropagation();
        e.preventDefault();
      },
      true,
    );
    this.scroller.addEventListener('scroll', () => this.callbacks.onViewChanged(), { passive: true });
  }

  get window(): Window {
    return { ...this.current };
  }

  // The zoom level relative to the fitted window, in percent.
  zoomPercent(): number {
    return Math.round(((this.fitted.to - this.fitted.from) / (this.current.to - this.current.from)) * 100);
  }

  isChosen(): boolean {
    return this.chosen;
  }

  hasLines(): boolean {
    return this.model.lines.length > 0;
  }

  setWindow(window: Window | null, firstLine: number | null = null): void {
    if (window === null) {
      this.chosen = false;
      this.current = { ...this.fitted };
    } else {
      this.chosen = true;
      this.current = clampWindow(window, this.fitted);
    }
    if (firstLine !== null) {
      this.pendingLine = firstLine;
    }
    this.position();
    this.applyPendingLine();
  }

  fit(): void {
    this.setWindow(null);
    this.callbacks.onViewChanged();
  }

  zoomBy(factor: number, around: number = (this.current.from + this.current.to) / 2): void {
    this.current = clampWindow(zoomWindow(this.current, factor, around), this.fitted);
    this.chosen = true;
    this.position();
    this.callbacks.onViewChanged();
  }

  private panBy(days: number, from: Window = this.current): void {
    this.current = { from: from.from + days, to: from.to + days };
    this.chosen = true;
    this.position();
    this.callbacks.onViewChanged();
  }

  // Pans the window to an event beyond one of its ends (the follow-up amendment, the edge
  // indicators' tap): the event lands just inside that end, the window's
  // length kept.
  private panToEvent(day: number): void {
    const length = this.current.to - this.current.from;
    const margin = length * EVENT_EDGE_MARGIN;
    const shift = day < this.current.from ? day - margin - this.current.from : day + margin - this.current.to;
    this.panBy(shift);
  }

  // The index of the first row at least partly visible.
  firstLine(): number {
    if (this.pendingLine !== null) {
      return this.pendingLine;
    }
    const top = this.scroller.scrollTop;
    const rows = [...this.list.children] as HTMLElement[];
    const i = rows.findIndex((r) => r.offsetTop + r.offsetHeight > top);
    return Math.max(0, i);
  }

  private applyPendingLine(): void {
    if (this.pendingLine === null || this.scroller.clientHeight === 0) {
      return;
    }
    const row = this.list.children[this.pendingLine] as HTMLElement | undefined;
    this.scroller.scrollTop = row ? row.offsetTop : 0;
    this.pendingLine = null;
  }

  // The lines whose rows are within the visible part of the list; all of
  // them before the first layout.
  visibleLines(): TimelineLine[] {
    const height = this.scroller.clientHeight;
    if (height === 0) {
      return [...this.model.lines];
    }
    const top = this.scroller.scrollTop;
    const shown = new Set<string>();
    for (const row of this.list.querySelectorAll<HTMLElement>('.timeline-line')) {
      if (row.offsetTop + row.offsetHeight > top && row.offsetTop < top + height) {
        shown.add(row.dataset.rowId!);
      }
    }
    return this.model.lines.filter((l) => shown.has(l.item.id));
  }

  // Where the card of a line opens beside it (FR-35 as amended):
  // at the line's chip, the control that opened it, in the coordinates of
  // the given element.
  anchorOf(id: string, relativeTo: HTMLElement): { x: number; y: number } | null {
    const row = this.lineElement(id);
    if (!row) {
      return null;
    }
    const base = relativeTo.getBoundingClientRect();
    const chip = row.querySelector<HTMLElement>('.timeline-chip')!.getBoundingClientRect();
    return { x: chip.right - base.left, y: chip.top + chip.height / 2 - base.top };
  }

  private lineElement(id: string): HTMLElement | undefined {
    return [...this.list.querySelectorAll<HTMLElement>('.timeline-line')].find((r) => r.dataset.rowId === id);
  }

  // Scrolls a line into view, for an item chosen in the list.
  reveal(id: string): void {
    const row = this.lineElement(id);
    if (!row || this.scroller.clientHeight === 0) {
      return;
    }
    const top = this.scroller.scrollTop;
    if (row.offsetTop < top) {
      this.scroller.scrollTop = row.offsetTop;
    } else if (row.offsetTop + row.offsetHeight > top + this.scroller.clientHeight) {
      this.scroller.scrollTop = row.offsetTop + row.offsetHeight - this.scroller.clientHeight;
    }
  }

  render(model: TimelineModel, labels: TimelineLabels, selectedId: string | null, events: ScheduleEvent[] = [], today: number | null = null): void {
    this.model = model;
    this.labels = labels;
    this.events = events;
    this.today = today;
    this.fitted = fitWindow(model.extent);
    if (!this.chosen) {
      this.current = { ...this.fitted };
    } else {
      this.current = clampWindow(this.current, this.fitted);
    }
    const rows: HTMLLIElement[] = [];
    for (const row of model.rows) {
      if (row.kind === 'heading' && row.heading === 'totals') {
        rows.push(this.totalsRow(row.spans, labels));
        continue;
      }
      if (row.kind === 'heading') {
        const li = el('li', 'timeline-heading', row.heading === 'noDates' ? labels.noDates : row.area === '' ? labels.noArea : row.area);
        li.dataset.heading = row.heading;
        rows.push(li);
        continue;
      }
      rows.push(this.lineRow(row, labels, selectedId));
    }
    this.list.replaceChildren(...rows);
    const message = labels.noRoles ?? (model.lines.length === 0 ? labels.empty : null);
    this.message.textContent = message ?? '';
    this.message.classList.toggle('hidden', message === null);
    this.position();
    this.applyPendingLine();
  }

  private lineRow(line: TimelineLine, labels: TimelineLabels, selectedId: string | null): HTMLLIElement {
    const li = el('li', 'timeline-line');
    li.dataset.rowId = line.item.id;
    li.dataset.lanes = String(line.lanes);
    li.dataset.expanded = this.expanded.has(line.item.id) ? 'true' : 'false';
    if (selectedId === line.item.id) {
      li.dataset.selected = 'true';
    }
    // Two real controls (FR-78 as amended): the number-and-name
    // chip opens the card; the plot expands and collapses the line. The
    // entry holding them is not itself a control.
    const entry = el('div', 'timeline-entry');
    entry.dataset.rowId = line.item.id;
    const name = el('button', 'timeline-name timeline-chip');
    name.type = 'button';
    name.dataset.rowId = line.item.id;
    name.appendChild(this.callbacks.badge(line));
    name.appendChild(el('span', 'timeline-title', line.item.name));
    // A value that cannot be read is shown as typed (FR-67, FR-68).
    const typed: string[] = [];
    if (line.start.kind === 'text') {
      typed.push(`${labels.startHeader}: ${line.start.text}`);
    }
    if (line.end.kind === 'text') {
      typed.push(`${labels.endHeader}: ${line.end.text}`);
    }
    if (typed.length > 0) {
      name.appendChild(el('span', 'timeline-typed', typed.join(' · ')));
    }
    const plot = el('span', 'timeline-plot');
    plot.setAttribute('aria-hidden', 'true');
    if (line.phase) {
      // The work phase (FR-78 as amended): a hatched band across the full
      // height of the plot, behind the bar and the segments.
      const band = el('span', 'timeline-phase');
      band.dataset.from = String(line.phase.from);
      band.dataset.to = String(line.phase.to + 1);
      band.title = `${labels.workPhase}: ${line.phase.activity.label}`;
      plot.appendChild(band);
    }
    // The quiet tick (FR-79 as amended): a year that carries
    // forecast or outcome but no budget, so that it is not invisible while
    // the line shows its budget spine alone.
    if (labels.costs) {
      const years = new Map<number, TimelineSpan[]>();
      for (const sp of line.spans) {
        if (sp.kind === 'amount') {
          years.set(sp.amount!.year, [...(years.get(sp.amount!.year) ?? []), sp]);
        }
      }
      for (const [year, spans] of [...years].sort(([a], [b]) => a - b)) {
        if (spans.some((sp) => sp.amount!.series === 'budget')) {
          continue;
        }
        const tick = el('span', 'timeline-year-tick');
        tick.dataset.from = String(spans[0].from);
        tick.dataset.to = String(spans[0].to + 1);
        tick.title = `${year}: ${spans.map((sp) => labels.costs!.series[sp.amount!.series]).join(', ')}, ${labels.costs.noBudget}`;
        plot.appendChild(tick);
      }
    }
    for (const span of line.spans) {
      if (span.kind === 'amount') {
        plot.appendChild(this.amountSeg(span, this.model.scale?.line ?? 0, labels, `marker-${line.item.colour}`));
        continue;
      }
      if (span.kind === 'activity') {
        // An activity segment (FR-78): the bar with its progress fill, and
        // its label inside when it is wide enough (set at positioning).
        const seg = el('span', 'timeline-seg');
        seg.classList.add(`marker-${line.item.colour}`);
        seg.dataset.from = String(span.from);
        seg.dataset.to = String(span.to + 1);
        seg.dataset.lane = String(span.lane);
        seg.dataset.kind = 'activity';
        const a = span.activity!;
        const fill = el('span', 'timeline-seg-fill');
        fill.style.width = `${a.progress ?? 0}%`;
        seg.append(fill);
        // Its name, written beside the bar in its lane when the line is open
        // (placed at positioning; the title is the fallback).
        const name = el('span', 'timeline-lane-label', a.label);
        name.setAttribute('aria-hidden', 'true');
        name.dataset.from = seg.dataset.from;
        name.dataset.to = seg.dataset.to;
        name.dataset.lane = seg.dataset.lane;
        const s = readDate(a.start);
        const e = readDate(a.end);
        const when = s.kind === 'date' && e.kind === 'date' ? `${formatDate(s, 'start')} \u2013 ${formatDate(e, 'end')}` : `${a.start} \u2013 ${a.end}`;
        // The referenced segment is hatched where it is visible.
        const isPhase = line.phase?.activity === a;
        if (isPhase) {
          seg.dataset.phase = 'true';
        }
        if (a.edited) {
          seg.dataset.edited = 'true';
        }
        seg.title = `${a.label}: ${when}${a.progress === null ? '' : `, ${a.progress}%`}${a.edited ? `, ${labels.edited}` : ''}${isPhase ? `, ${labels.workPhase}` : ''}`;
        plot.append(seg, name);
        continue;
      }
      const mark = el('span', span.kind === 'span' ? 'timeline-bar' : 'timeline-point');
      mark.classList.add(`marker-${line.item.colour}`);
      mark.dataset.from = String(span.from);
      mark.dataset.to = String(span.to + 1);
      mark.dataset.lane = String(span.lane);
      if (span.kind !== 'span') {
        mark.dataset.kind = span.kind;
      }
      plot.appendChild(mark);
    }
    // The "+n" badge: a first-class control when spans do not all fit the
    // packed sub-lanes. It counts spans, not activities, so a later view can
    // reuse it. Activating expands the line to full-height lanes; activating
    // again collapses it.
    // What a press on the plot reveals: in the timeline the activities
    // drawn, counted by the indicator; in the costs view the forecast and
    // outcome, marked without a count.
    const costs = !!labels.costs;
    const count = costs ? line.spans.filter((sp) => sp.kind === 'amount' && sp.amount!.series !== 'budget').length : line.activitySpans.length;
    let control: HTMLElement;
    if (count > 0) {
      control = el('button', 'timeline-plot-control');
      (control as HTMLButtonElement).type = 'button';
      control.dataset.rowId = line.item.id;
      control.setAttribute('aria-expanded', this.expanded.has(line.item.id) ? 'true' : 'false');
      control.setAttribute('aria-label', fill(labels.expand, { name: `${line.item.label}: ${line.item.name}`, count }));
      // The quiet indicator, in place of v1.10.0's badge: part of the
      // control, inviting the press.
      const indicator = el('span', 'timeline-indicator', costs ? '\u2261' : String(count));
      indicator.setAttribute('aria-hidden', 'true');
      control.append(indicator, plot);
      control.addEventListener('click', () => {
        if (this.expanded.has(line.item.id)) {
          this.expanded.delete(line.item.id);
        } else {
          this.expanded.add(line.item.id);
        }
        control.setAttribute('aria-expanded', this.expanded.has(line.item.id) ? 'true' : 'false');
        this.position();
        this.callbacks.onViewChanged();
      });
      entry.dataset.expandable = 'true';
    } else {
      control = el('span', 'timeline-plot-control');
      control.appendChild(plot);
    }
    entry.append(name, control);
    name.setAttribute('aria-label', this.describe(line, labels));
    name.addEventListener('click', () => this.callbacks.onSelect(line.item.id));
    entry.addEventListener('pointerenter', () => this.callbacks.onHover(line.item.id));
    entry.addEventListener('pointerleave', () => this.callbacks.onHover(null));
    for (const target of [name, control]) {
      target.addEventListener('focus', () => this.callbacks.onHover(line.item.id));
      target.addEventListener('blur', () => this.callbacks.onHover(null));
    }
    li.appendChild(entry);
    return li;
  }

  // An amount span (FR-79): the year's cell, the amount as a width fill
  // within it on the given scale, and its figure in thousands.
  private amountSeg(span: TimelineSpan, scale: number, labels: TimelineLabels, colourClass: string | null): HTMLElement {
    const a = span.amount!;
    const seg = el('span', 'timeline-seg');
    if (colourClass) {
      seg.classList.add(colourClass);
    }
    seg.dataset.from = String(span.from);
    seg.dataset.to = String(span.to + 1);
    seg.dataset.lane = String(span.lane);
    seg.dataset.kind = 'amount';
    seg.dataset.series = a.series;
    const share = amountShare(a.value, scale);
    seg.dataset.share = share.toFixed(4);
    seg.style.setProperty('--share', share.toFixed(4));
    const fill = el('span', 'timeline-seg-fill');
    fill.style.width = `${(share * 100).toFixed(2)}%`;
    seg.append(fill, el('span', 'timeline-seg-label', labels.costs?.thousands(a.value) ?? ''));
    if (labels.costs) {
      seg.title = `${labels.costs.series[a.series]} ${a.year}: ${labels.costs.exact(a)}`;
    }
    return seg;
  }

  // The costs view's totals row (FR-79): the per-year sums in the lines'
  // sub-lanes and styles, on the totals' own scale; it stays at the top
  // while the lines scroll.
  private totalsRow(spans: TimelineSpan[], labels: TimelineLabels): HTMLLIElement {
    const li = el('li', 'timeline-totals');
    li.dataset.heading = 'totals';
    const name = el('span', 'timeline-name');
    name.appendChild(el('span', 'timeline-title', labels.costs?.totals ?? ''));
    name.appendChild(el('span', 'timeline-typed', labels.costs?.unitNote ?? ''));
    const plot = el('span', 'timeline-plot');
    plot.setAttribute('aria-hidden', 'true');
    for (const span of spans) {
      plot.appendChild(this.amountSeg(span, this.model.scale?.totals ?? 0, labels, null));
    }
    li.append(name, plot);
    if (labels.costs) {
      li.setAttribute('role', 'group');
      li.setAttribute(
        'aria-label',
        `${labels.costs.totals}. ${labels.costs.totalsDescription} ${this.amountList(
          spans.map((s) => s.amount!),
          labels.costs,
        )}`,
      );
    }
    return li;
  }

  // Amounts spelled out by year: "2024: Budget 1 000 kr, Outcome 900 kr".
  private amountList(amounts: CostsAmount[], costs: CostsLabels): string {
    const years = [...new Set(amounts.map((a) => a.year))].sort((a, b) => a - b);
    return years
      .map(
        (year) =>
          `${year}: ${amounts
            .filter((a) => a.year === year)
            .map((a) => `${costs.series[a.series]} ${costs.exact(a)}`)
            .join(', ')}`,
      )
      .join('; ');
  }

  private describe(line: TimelineLine, labels: TimelineLabels): string {
    if (labels.costs) {
      // A costs line (FR-79): its amounts exactly, by year; the values that
      // are not numbers as typed; or that it has none.
      const item = (line as CostsLine).item;
      const parts = [`${item.label}: ${item.name}`];
      parts.push(item.amounts.length > 0 ? this.amountList(item.amounts, labels.costs) : labels.costs.none);
      if (item.typed.length > 0) {
        parts.push(`${labels.costs.typed}: ${item.typed.map((v) => `${labels.costs!.series[v.series]} ${v.year}: ${v.text}`).join('; ')}`);
      }
      return parts.join('. ');
    }
    const date = (r: TimelineLine['start'], which: 'start' | 'end') => (r.kind === 'date' ? formatDate(r, which) : r.kind === 'text' ? r.text : '');
    const s = date(line.start, 'start');
    const e = date(line.end, 'end');
    const own = line.spans.find((sp) => sp.kind !== 'activity');
    const when = own?.kind === 'start' ? `${s} (${labels.startOnly})` : own?.kind === 'end' ? `${e} (${labels.endOnly})` : own ? `${s} – ${e}` : labels.noDates;
    const parts = [`${line.item.label}: ${line.item.name}, ${when}`];
    // The activities, each with its dates (as typed when unreadable) and its
    // progress (FR-78); the card itself is unchanged (FR-35, FR-37).
    if (line.item.activities && line.item.activities.length > 0) {
      const list = line.item.activities.map((a) => {
        const rs = readDate(a.start);
        const re = readDate(a.end);
        const ws = rs.kind === 'date' ? formatDate(rs, 'start') : a.start;
        const we = re.kind === 'date' ? formatDate(re, 'end') : a.end;
        return `${a.label}: ${ws} – ${we}${a.progress === null ? '' : `, ${a.progress}%`}${a.edited ? `, ${labels.edited}` : ''}${line.phase?.activity === a ? `, ${labels.workPhase}` : ''}`;
      });
      parts.push(`${labels.activities}: ${list.join('; ')}`);
    }
    return parts.join('. ');
  }

  // The plot's width in pixels.
  private plotWidth(): number {
    const plot = this.list.querySelector<HTMLElement>('.timeline-plot');
    const width = plot?.clientWidth || this.grid.clientWidth;
    return width > 0 ? width : FALLBACK_WIDTH;
  }

  // Places the bars, the points, the segments, the axis, and the grid for
  // the window.
  private position(): void {
    const { from, to } = this.current;
    const length = to - from;
    const pct = (day: number) => dayShare({ from, to }, day) * 100;
    const cs = getComputedStyle(this.root);
    // A length from the stylesheet, a stated zero included.
    const css = (name: string, fallback: number) => {
      const v = parseFloat(cs.getPropertyValue(name));
      return Number.isFinite(v) ? v : fallback;
    };
    // A lane: 28 pixels on a wide viewport, 24 in the narrow plot (FR-78 as
    // amended); an expanded line's plot holds its lanes whole.
    const laneH = css('--timeline-lane', 28);
    const segH = css('--timeline-seg-h', 7);
    const segGap = css('--timeline-seg-gap', 2);
    const segPad = css('--timeline-seg-pad', 2);
    // The costs lines' sub-lanes, and the costs line's open plot (FR-79).
    const lineSegH = css('--timeline-line-seg-h', segH);
    const lineSegGap = css('--timeline-line-seg-gap', segGap);
    const lineSegPad = css('--timeline-line-seg-pad', segPad);
    const costsOpen = css('--timeline-costs-open', 46);
    const laneBarH = css('--timeline-lane-bar-h', 14);
    // The costs line's budget spine, collapsed (FR-79 as amended).
    const spineH = css('--timeline-spine-h', 12);
    const isCostsView = this.root.dataset.kind === 'costs';
    const plotW = this.plotWidth();
    const linesById = new Map(this.model.lines.map((l) => [l.item.id, l]));
    for (const row of this.list.querySelectorAll<HTMLElement>('.timeline-line, .timeline-totals')) {
      const line = linesById.get(row.dataset.rowId ?? '');
      // A line with activities or amounts, and the totals row, pack their
      // spans into sub-lanes (FR-78, FR-79).
      const hasActivities = row.classList.contains('timeline-totals') || (!!line && line.spans.some((sp) => sp.kind === 'activity' || sp.kind === 'amount'));
      const expanded = !!line && this.expanded.has(line.item.id);
      const isTotals = row.classList.contains('timeline-totals');
      if (!isTotals) {
        row.style.setProperty('--timeline-plot-h', `${expanded ? (isCostsView ? costsOpen : line.lanes * laneH) : laneH}px`);
        row.dataset.expanded = expanded ? 'true' : 'false';
      }
      // The work-phase band: placed in time only; the stylesheet gives it
      // the plot's full height, collapsed or expanded.
      for (const band of row.querySelectorAll<HTMLElement>('.timeline-phase, .timeline-year-tick')) {
        const a = Number(band.dataset.from);
        const b = Number(band.dataset.to);
        band.style.left = `${pct(a).toFixed(3)}%`;
        band.style.width = `${(((b - a) / length) * 100).toFixed(3)}%`;
      }
      for (const mark of row.querySelectorAll<HTMLElement>('.timeline-bar, .timeline-point, .timeline-seg')) {
        const a = Number(mark.dataset.from);
        const b = Number(mark.dataset.to);
        if (mark.classList.contains('timeline-point')) {
          mark.style.left = `${pct(mark.dataset.kind === 'end' ? b : a).toFixed(3)}%`;
        } else {
          mark.style.left = `${pct(a).toFixed(3)}%`;
          mark.style.width = `${(((b - a) / length) * 100).toFixed(3)}%`;
        }
        if (!hasActivities) {
          // The plain line: the stylesheet's own centred bar.
          mark.style.removeProperty('top');
          mark.style.removeProperty('height');
          continue;
        }
        // A line with activities (FR-78 as amended): collapsed,
        // its own bar alone, as a plain line; expanded, one whole row per
        // lane.
        const lane = Number(mark.dataset.lane ?? 0);
        if (!expanded && !isTotals && mark.dataset.kind === 'amount') {
          // Collapsed, a costs line shows its budget alone, as its spine,
          // centred at the line's rhythm (FR-79 as amended).
          if (mark.dataset.series !== 'budget') {
            mark.style.display = 'none';
            continue;
          }
          mark.style.display = '';
          mark.style.height = `${spineH}px`;
          mark.style.top = `${(laneH - spineH) / 2}px`;
          mark.dataset.label = amountLabelPlace(((b - a) / length) * plotW, Number(mark.dataset.share), mark.textContent?.length ?? 0, figureWidth(mark));
          continue;
        }
        if (!expanded && mark.dataset.kind === 'activity') {
          mark.style.display = 'none';
          continue;
        }
        mark.style.display = '';
        if (!expanded && mark.dataset.kind !== 'amount') {
          mark.style.removeProperty('top');
          mark.style.removeProperty('height');
          continue;
        }
        if (mark.dataset.kind === 'amount') {
          // An amount's sub-lane: the totals' geometry, or the lines'.
          const [h, gap, pad] = isTotals ? [segH, segGap, segPad] : [lineSegH, lineSegGap, lineSegPad];
          mark.style.height = `${h}px`;
          mark.style.top = `${pad + lane * (h + gap)}px`;
        } else {
          const h = mark.classList.contains('timeline-point') ? Math.min(12, laneBarH) : laneBarH;
          mark.style.height = `${h}px`;
          mark.style.top = `${lane * laneH + (laneH - h) / 2}px`;
        }
        if (mark.dataset.kind === 'amount') {
          const px = ((b - a) / length) * plotW;
          mark.dataset.label = amountLabelPlace(px, Number(mark.dataset.share), mark.textContent?.length ?? 0, figureWidth(mark));
        }
      }
      this.placeLaneLabels(row, expanded, from, length, plotW, laneH);
    }
    // The axis and the grid leave room for the list's scroll bar.
    const gutter = this.scroller.offsetWidth - this.scroller.clientWidth;
    this.root.style.setProperty('--timeline-gutter', `${Math.max(0, gutter)}px`);
    const locale = this.labels?.locale ?? 'en';
    const all = ticks(this.current, this.plotWidth());
    const format = (t: { day: number; unit: string }) => {
      const d = new Date(t.day * 86_400_000);
      if (t.unit === 'year') {
        return String(d.getUTCFullYear());
      }
      if (t.unit === 'month') {
        return new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
      }
      return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d);
    };
    const plot = el('div', 'timeline-axis-plot');
    const lines: HTMLElement[] = [];
    for (const t of all) {
      const tick = el('span', 'timeline-tick', format(t));
      tick.style.left = `${pct(t.day).toFixed(3)}%`;
      plot.appendChild(tick);
      const line = el('span', 'timeline-gridline');
      line.style.left = `${pct(t.day).toFixed(3)}%`;
      lines.push(line);
    }
    this.axis.replaceChildren(el('div', 'timeline-axis-name'), plot);
    this.grid.replaceChildren(...lines);
    this.positionEvents(pct, plotW);
  }

  // The events (FR-80): a 1-pixel hairline crossing the whole body at each
  // event's date, and its label chip in the strip at the top; chips that
  // would overlap stagger into two rows, then a "+n" chip. (Amended in
  // The follow-up amendment: an event beyond the shown window is counted in a small edge
  // chip at that end of the strip, which on a tap pans the window to the
  // nearest of those events, so that it is drawn.)
  private positionEvents(pct: (day: number) => number, plotW: number): void {
    const labels = this.labels;
    // The today mark (FR-78, FR-79 as amended): not an event --
    // a dashed line across the body at today's date, placed in time like a
    // gridline, with no chip; beyond the window, an edge indicator of its own.
    const today = this.today;
    const todayBeyond = today === null ? null : today < this.current.from ? 'before' : today > this.current.to + 1 ? 'after' : null;
    const todayMarks: HTMLElement[] = [];
    if (today !== null && labels && todayBeyond === null) {
      const mark = el('span', 'timeline-today');
      mark.style.left = `${pct(today + 0.5).toFixed(3)}%`;
      mark.dataset.day = String(today);
      mark.title = fill(labels.today, { date: formatDate({ kind: 'date', start: today, end: today, precision: 'day' }) });
      todayMarks.push(mark);
    }
    const stripShown = this.events.length > 0 || todayBeyond !== null;
    this.eventStrip.classList.toggle('hidden', !stripShown);
    if (!stripShown || !labels) {
      this.eventPlot.replaceChildren();
      this.eventLines.replaceChildren(...todayMarks);
      return;
    }
    this.eventStrip.setAttribute('aria-label', labels.events);
    // The events beyond the shown window (the follow-up amendment), counted at the ends of
    // the strip. At the fitted view these are the events beyond the fitted
    // window; once the window is panned to one, it is drawn and no longer
    // counted.
    const before = this.events.filter((e) => e.day < this.current.from);
    const after = this.events.filter((e) => e.day > this.current.to);
    const reserve = (events: number, side: 'before' | 'after') => (events > 0 ? EVENT_EDGE_RESERVE_PX : 0) + (todayBeyond === side ? EVENT_EDGE_RESERVE_PX : 0);
    const chips = layoutEvents(
      this.events.map((event) => ({ event, x: (pct(event.day) / 100) * plotW, width: eventChipWidth(event.label) })),
      plotW,
      EVENT_MORE_PX,
      EVENT_ROWS,
      reserve(before.length, 'before'),
      reserve(after.length, 'after'),
    );
    const said = (e: ScheduleEvent) => `${e.date}: ${e.label}`;
    const strip: HTMLElement[] = [];
    const hairlines: HTMLElement[] = [];
    for (const [side, beyond, label] of [
      ['before', before, labels.eventsBefore],
      ['after', after, labels.eventsAfter],
    ] as const) {
      if (beyond.length === 0) {
        continue;
      }
      const names = beyond.map(said).join('; ');
      const edge = el('button', 'timeline-event-chip timeline-event-edge', fill(labels.moreEvents, { count: beyond.length }));
      edge.type = 'button';
      edge.dataset.side = side;
      edge.style.width = `${EVENT_EDGE_PX}px`;
      edge.style.left = side === 'before' ? '0px' : `${plotW - EVENT_EDGE_PX}px`;
      edge.title = fill(label, { events: names });
      edge.setAttribute('aria-label', fill(label, { events: names }));
      // A tap pans the window to the nearest of the events beyond this end.
      edge.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const nearest = beyond.reduce((a, b) => (side === 'before' ? (b.day > a.day ? b : a) : b.day < a.day ? b : a));
        this.panToEvent(nearest.day);
      });
      strip.push(edge);
    }
    if (today !== null && todayBeyond !== null) {
      // Today beyond the window: its own edge indicator, dashed like the
      // mark, inward of the events' one; a tap pans to today.
      const date = formatDate({ kind: 'date', start: today, end: today, precision: 'day' });
      const name = fill(todayBeyond === 'before' ? labels.todayBefore : labels.todayAfter, { date });
      const offset = (todayBeyond === 'before' ? before.length : after.length) > 0 ? EVENT_EDGE_RESERVE_PX : 0;
      const edge = el('button', 'timeline-event-chip timeline-today-edge', todayBeyond === 'before' ? '\u2039' : '\u203a');
      edge.type = 'button';
      edge.dataset.side = todayBeyond;
      edge.style.width = `${EVENT_EDGE_PX}px`;
      edge.style.left = todayBeyond === 'before' ? `${offset}px` : `${plotW - EVENT_EDGE_PX - offset}px`;
      edge.title = name;
      edge.setAttribute('aria-label', name);
      edge.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.panToEvent(today);
      });
      strip.push(edge);
    }
    for (const chip of chips) {
      const at = `${pct(chip.event.day).toFixed(3)}%`;
      const line = el('span', 'timeline-event-line');
      line.style.left = at;
      line.dataset.eventId = chip.event.id;
      hairlines.push(line);
      const stem = el('span', 'timeline-event-stem');
      stem.style.left = at;
      const node = el('span', 'timeline-event-chip', chip.event.label);
      node.setAttribute('role', 'listitem');
      node.dataset.eventId = chip.event.id;
      node.dataset.row = String(chip.row);
      node.style.left = `${((chip.left / plotW) * 100).toFixed(3)}%`;
      node.style.width = `${chip.width}px`;
      node.title = said(chip.event);
      node.setAttribute('aria-label', said(chip.event));
      strip.push(stem, node);
      if (chip.more.length > 0) {
        // The hidden events keep their hairlines; their labels are in the
        // "+n" chip's title and name.
        for (const hidden of chip.more) {
          const hiddenLine = el('span', 'timeline-event-line');
          hiddenLine.style.left = `${pct(hidden.day).toFixed(3)}%`;
          hiddenLine.dataset.eventId = hidden.id;
          hairlines.push(hiddenLine);
        }
        const more = el('span', 'timeline-event-chip timeline-event-more', fill(labels.moreEvents, { count: chip.more.length }));
        more.setAttribute('role', 'listitem');
        more.dataset.row = String(chip.row);
        more.style.left = `${(((chip.left + chip.width) / plotW) * 100).toFixed(3)}%`;
        more.title = chip.more.map(said).join('; ');
        more.setAttribute('aria-label', chip.more.map(said).join('; '));
        strip.push(more);
      }
    }
    this.eventStrip.style.setProperty('--timeline-event-rows', String(Math.max(1, ...chips.map((c) => c.row + 1))));
    this.eventPlot.replaceChildren(...strip);
    this.eventLines.replaceChildren(...hairlines, ...todayMarks);
  }

  // The activities' names beside their bars in an open line (FR-78 as
  // amended): after the bar where its lane has room up to the
  // next mark, before it otherwise, and nowhere where neither side has room
  // -- the segment's title then carries the name. Names already placed are
  // obstacles too, so two never overlap.
  private placeLaneLabels(row: HTMLElement, expanded: boolean, from: number, length: number, plotW: number, laneH: number): void {
    const labels = [...row.querySelectorAll<HTMLElement>('.timeline-lane-label')];
    if (labels.length === 0) {
      return;
    }
    if (!expanded) {
      for (const label of labels) {
        label.dataset.place = 'none';
      }
      return;
    }
    const px = (day: number) => ((day - from) / length) * plotW;
    const obstacles = new Map<string, Array<[number, number]>>();
    const lane = (key: string) => obstacles.get(key) ?? obstacles.set(key, []).get(key)!;
    for (const mark of row.querySelectorAll<HTMLElement>('.timeline-bar, .timeline-point, .timeline-seg')) {
      if (mark.style.display === 'none') {
        continue;
      }
      const a = px(Number(mark.dataset.from));
      const b = mark.classList.contains('timeline-point') ? a : px(Number(mark.dataset.to));
      lane(mark.dataset.lane ?? '0').push([a, b]);
    }
    const ordered = labels.sort((p, q) => Number(p.dataset.from) - Number(q.dataset.from));
    for (const label of ordered) {
      const a = px(Number(label.dataset.from));
      const b = px(Number(label.dataset.to));
      const marks = lane(label.dataset.lane ?? '0');
      // Measured where there is layout (shown unseen for the reading), else
      // estimated from the characters.
      label.style.display = 'block';
      label.style.visibility = 'hidden';
      const measured = label.offsetWidth;
      label.style.removeProperty('display');
      label.style.removeProperty('visibility');
      const w = measured || Math.ceil((label.textContent ?? '').length * LANE_LABEL_CHAR_PX);
      const need = w + 2 * LANE_LABEL_GAP;
      const next = Math.min(plotW, ...marks.filter(([x0]) => x0 >= b - 0.5).map(([x0]) => x0));
      const prev = Math.max(0, ...marks.filter(([, x1]) => x1 <= a + 0.5).map(([, x1]) => x1));
      let x: number | null = null;
      if (b >= 0 && b < plotW && next - b >= need) {
        x = b + LANE_LABEL_GAP;
      } else if (a > 0 && a <= plotW && a - prev >= need) {
        x = a - LANE_LABEL_GAP - w;
      }
      label.style.top = `${Number(label.dataset.lane ?? 0) * laneH}px`;
      label.style.height = `${laneH}px`;
      if (x === null) {
        label.dataset.place = 'none';
        continue;
      }
      label.dataset.place = x > a ? 'after' : 'before';
      label.style.left = `${x.toFixed(1)}px`;
      marks.push([x, x + w]);
    }
  }

  // A day at a client x coordinate, within the plot.
  private dayAt(clientX: number): number {
    const plot = this.grid.getBoundingClientRect();
    const width = plot.width > 0 ? plot.width : FALLBACK_WIDTH;
    const fraction = plot.width > 0 ? (clientX - plot.left) / width : 0.5;
    return this.current.from + fraction * (this.current.to - this.current.from);
  }

  private daysPerPixel(): number {
    return (this.current.to - this.current.from) / this.plotWidth();
  }

  private onWheel(e: WheelEvent): void {
    if (e.ctrlKey || e.metaKey) {
      // Ctrl or Cmd with the wheel (and a trackpad's pinch) zooms time.
      e.preventDefault();
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      this.zoomBy(Math.exp(-delta * 0.002), this.dayAt(e.clientX));
    } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      // A sideways wheel pans.
      e.preventDefault();
      const delta = e.deltaMode === 1 ? e.deltaX * 16 : e.deltaX;
      this.panBy(delta * this.daysPerPixel());
    }
    // The plain wheel scrolls the lines, natively.
  }

  private onPointerDown(e: PointerEvent): void {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.drag = null;
      this.pinch = { distance: Math.max(1, Math.abs(a.x - b.x)), window: { ...this.current }, around: this.dayAt((a.x + b.x) / 2) };
    } else if (this.pointers.size === 1) {
      this.drag = { x: e.clientX, y: e.clientY, window: { ...this.current }, panning: false };
    }
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.pointers.has(e.pointerId)) {
      return;
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const factor = Math.max(1, Math.abs(a.x - b.x)) / this.pinch.distance;
      this.current = clampWindow(zoomWindow(this.pinch.window, factor, this.pinch.around), this.fitted);
      this.chosen = true;
      this.suppressClick = true;
      this.position();
      this.callbacks.onViewChanged();
      return;
    }
    const drag = this.drag;
    if (!drag) {
      return;
    }
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.panning) {
      // A sideways drag pans; an upright one is the list's own scrolling.
      if (Math.abs(dx) < DRAG_THRESHOLD || Math.abs(dx) <= Math.abs(dy)) {
        return;
      }
      drag.panning = true;
      this.suppressClick = true;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    const perPixel = (drag.window.to - drag.window.from) / this.plotWidth();
    this.panBy(-dx * perPixel, drag.window);
  }

  private onPointerUp(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) {
      this.pinch = null;
    }
    if (this.pointers.size === 0) {
      this.drag = null;
      // A click follows the pointer's release at once; a drag's is
      // suppressed only for that click.
      if (this.suppressClick) {
        setTimeout(() => (this.suppressClick = false), 0);
      }
    }
  }
}
