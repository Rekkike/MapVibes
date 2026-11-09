// The timeline view (FR-67): one line per item across a time axis, inside
// the presentation stage. It zooms and pans in time only: the plain wheel
// scrolls the lines; the wheel with Ctrl or Cmd, and a pinch, zoom time; a
// sideways drag or a sideways wheel pans. Bars are placed in percentages of
// the time window, so a change of window moves them without measuring.
// Pointer and wheel events stop here, so that the stage's map underneath
// neither pans nor zooms.

import { dateOfDay, formatDate } from './dates';
import { clampWindow, fitWindow, zoomWindow, type TimelineLine, type TimelineModel } from './timeline';

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
// The plot's width where the layout gives none (before the first layout).
const FALLBACK_WIDTH = 800;
const DRAG_THRESHOLD = 5;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// The ticks of the axis: the first day of each year, month, or week shown.
export function ticks(window: Window, width: number): Array<{ day: number; unit: 'day' | 'month' | 'year' }> {
  const pxPerDay = width / Math.max(1e-9, window.to - window.from);
  const step = STEPS.find((s) => s.days * pxPerDay >= MIN_TICK_PX) ?? STEPS[STEPS.length - 1];
  const out: Array<{ day: number; unit: 'day' | 'month' | 'year' }> = [];
  const first = dateOfDay(Math.floor(window.from));
  if (step.unit === 'year') {
    let y = Math.ceil(first.year / step.n) * step.n;
    for (;;) {
      const day = Date.UTC(y, 0, 1) / 86_400_000;
      if (day > window.to) break;
      if (day >= window.from) out.push({ day, unit: 'year' });
      y += step.n;
      if (out.length > 500) break;
    }
  } else if (step.unit === 'month') {
    let m = first.year * 12 + Math.floor((first.month - 1) / step.n) * step.n;
    for (;;) {
      const day = Date.UTC(Math.floor(m / 12), m % 12, 1) / 86_400_000;
      if (day > window.to) break;
      if (day >= window.from) out.push({ day, unit: 'month' });
      m += step.n;
      if (out.length > 500) break;
    }
  } else {
    // Weeks start on Mondays (1970-01-01 was a Thursday).
    let day = Math.ceil(window.from);
    if (step.n === 7) day += (((4 - day) % 7) + 7) % 7;
    for (; day <= window.to && out.length <= 500; day += step.n) out.push({ day, unit: 'day' });
  }
  return out;
}

export class TimelineView {
  private readonly axis: HTMLElement;
  private readonly grid: HTMLElement;
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

  constructor(
    readonly root: HTMLElement,
    private readonly callbacks: TimelineCallbacks,
  ) {
    root.classList.add('timeline');
    this.axis = el('div', 'timeline-axis');
    this.axis.setAttribute('aria-hidden', 'true');
    const body = el('div', 'timeline-body');
    this.grid = el('div', 'timeline-grid');
    this.grid.setAttribute('aria-hidden', 'true');
    this.scroller = el('div', 'timeline-scroll');
    this.list = el('ul', 'timeline-lines');
    this.message = el('p', 'timeline-message notice hidden');
    this.scroller.append(this.list, this.message);
    body.append(this.grid, this.scroller);
    root.replaceChildren(this.axis, body);
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
        if (!this.suppressClick) return;
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
    if (firstLine !== null) this.pendingLine = firstLine;
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

  // The index of the first row at least partly visible.
  firstLine(): number {
    if (this.pendingLine !== null) return this.pendingLine;
    const top = this.scroller.scrollTop;
    const rows = [...this.list.children] as HTMLElement[];
    const i = rows.findIndex((r) => r.offsetTop + r.offsetHeight > top);
    return Math.max(0, i);
  }

  private applyPendingLine(): void {
    if (this.pendingLine === null || this.scroller.clientHeight === 0) return;
    const row = this.list.children[this.pendingLine] as HTMLElement | undefined;
    this.scroller.scrollTop = row ? row.offsetTop : 0;
    this.pendingLine = null;
  }

  // The lines whose rows are within the visible part of the list; all of
  // them before the first layout.
  visibleLines(): TimelineLine[] {
    const height = this.scroller.clientHeight;
    if (height === 0) return [...this.model.lines];
    const top = this.scroller.scrollTop;
    const shown = new Set<string>();
    for (const row of this.list.querySelectorAll<HTMLElement>('.timeline-line')) {
      if (row.offsetTop + row.offsetHeight > top && row.offsetTop < top + height) shown.add(row.dataset.rowId!);
    }
    return this.model.lines.filter((l) => shown.has(l.item.id));
  }

  // Where the card of a line opens beside it: the end of its bar, or the
  // start of its plot, in the coordinates of the given element.
  anchorOf(id: string, relativeTo: HTMLElement): { x: number; y: number } | null {
    const row = this.lineElement(id);
    if (!row) return null;
    const base = relativeTo.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    const plot = row.querySelector<HTMLElement>('.timeline-plot')!.getBoundingClientRect();
    const mark = row.querySelector<HTMLElement>('.timeline-bar, .timeline-point')?.getBoundingClientRect();
    const x = mark ? Math.min(Math.max(mark.right, plot.left), plot.right) : plot.left;
    return { x: x - base.left, y: r.top + r.height / 2 - base.top };
  }

  private lineElement(id: string): HTMLElement | undefined {
    return [...this.list.querySelectorAll<HTMLElement>('.timeline-line')].find((r) => r.dataset.rowId === id);
  }

  // Scrolls a line into view, for an item chosen in the list.
  reveal(id: string): void {
    const row = this.lineElement(id);
    if (!row || this.scroller.clientHeight === 0) return;
    const top = this.scroller.scrollTop;
    if (row.offsetTop < top) this.scroller.scrollTop = row.offsetTop;
    else if (row.offsetTop + row.offsetHeight > top + this.scroller.clientHeight) this.scroller.scrollTop = row.offsetTop + row.offsetHeight - this.scroller.clientHeight;
  }

  render(model: TimelineModel, labels: TimelineLabels, selectedId: string | null): void {
    this.model = model;
    this.labels = labels;
    this.fitted = fitWindow(model.extent);
    if (!this.chosen) this.current = { ...this.fitted };
    else this.current = clampWindow(this.current, this.fitted);
    const rows: HTMLLIElement[] = [];
    for (const row of model.rows) {
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
    li.style.setProperty('--timeline-lanes', String(line.lanes));
    if (selectedId === line.item.id) li.dataset.selected = 'true';
    const entry = el('button', 'timeline-entry');
    entry.type = 'button';
    entry.dataset.rowId = line.item.id;
    const name = el('span', 'timeline-name');
    name.appendChild(this.callbacks.badge(line));
    name.appendChild(el('span', 'timeline-title', line.item.name));
    // A value that cannot be read is shown as typed (FR-67, FR-68).
    const typed: string[] = [];
    if (line.start.kind === 'text') typed.push(`${labels.startHeader}: ${line.start.text}`);
    if (line.end.kind === 'text') typed.push(`${labels.endHeader}: ${line.end.text}`);
    if (typed.length > 0) name.appendChild(el('span', 'timeline-typed', typed.join(' · ')));
    const plot = el('span', 'timeline-plot');
    plot.setAttribute('aria-hidden', 'true');
    for (const span of line.spans) {
      const mark = el('span', span.kind === 'span' ? 'timeline-bar' : 'timeline-point');
      mark.classList.add(`marker-${line.item.colour}`);
      mark.dataset.from = String(span.from);
      mark.dataset.to = String(span.to + 1);
      mark.dataset.lane = String(span.lane);
      if (span.kind !== 'span') mark.dataset.kind = span.kind;
      plot.appendChild(mark);
    }
    entry.append(name, plot);
    entry.setAttribute('aria-label', this.describe(line, labels));
    entry.addEventListener('click', () => this.callbacks.onSelect(line.item.id));
    entry.addEventListener('pointerenter', () => this.callbacks.onHover(line.item.id));
    entry.addEventListener('pointerleave', () => this.callbacks.onHover(null));
    entry.addEventListener('focus', () => this.callbacks.onHover(line.item.id));
    entry.addEventListener('blur', () => this.callbacks.onHover(null));
    li.appendChild(entry);
    return li;
  }

  private describe(line: TimelineLine, labels: TimelineLabels): string {
    const date = (r: TimelineLine['start'], which: 'start' | 'end') => (r.kind === 'date' ? formatDate(r, which) : r.kind === 'text' ? r.text : '');
    const s = date(line.start, 'start');
    const e = date(line.end, 'end');
    const when = line.spans[0]?.kind === 'start' ? `${s} (${labels.startOnly})` : line.spans[0]?.kind === 'end' ? `${e} (${labels.endOnly})` : line.spans.length > 0 ? `${s} – ${e}` : labels.noDates;
    return `${line.item.label}: ${line.item.name}, ${when}`;
  }

  // The plot's width in pixels.
  private plotWidth(): number {
    const plot = this.list.querySelector<HTMLElement>('.timeline-plot');
    const width = plot?.clientWidth || this.grid.clientWidth;
    return width > 0 ? width : FALLBACK_WIDTH;
  }

  // Places the bars, the points, the axis, and the grid for the window.
  private position(): void {
    const { from, to } = this.current;
    const length = to - from;
    const pct = (day: number) => ((day - from) / length) * 100;
    for (const mark of this.list.querySelectorAll<HTMLElement>('.timeline-bar, .timeline-point')) {
      const a = Number(mark.dataset.from);
      const b = Number(mark.dataset.to);
      if (mark.classList.contains('timeline-bar')) {
        mark.style.left = `${pct(a).toFixed(3)}%`;
        mark.style.width = `${(((b - a) / length) * 100).toFixed(3)}%`;
      } else {
        mark.style.left = `${pct(mark.dataset.kind === 'end' ? b : a).toFixed(3)}%`;
      }
    }
    // The axis and the grid leave room for the list's scroll bar.
    const gutter = this.scroller.offsetWidth - this.scroller.clientWidth;
    this.root.style.setProperty('--timeline-gutter', `${Math.max(0, gutter)}px`);
    const locale = this.labels?.locale ?? 'en';
    const all = ticks(this.current, this.plotWidth());
    const format = (t: { day: number; unit: string }) => {
      const d = new Date(t.day * 86_400_000);
      if (t.unit === 'year') return String(d.getUTCFullYear());
      if (t.unit === 'month') return new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
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
    if (!this.pointers.has(e.pointerId)) return;
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
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.panning) {
      // A sideways drag pans; an upright one is the list's own scrolling.
      if (Math.abs(dx) < DRAG_THRESHOLD || Math.abs(dx) <= Math.abs(dy)) return;
      drag.panning = true;
      this.suppressClick = true;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    const perPixel = (drag.window.to - drag.window.from) / this.plotWidth();
    this.panBy(-dx * perPixel, drag.window);
  }

  private onPointerUp(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (this.pointers.size === 0) {
      this.drag = null;
      // A click follows the pointer's release at once; a drag's is
      // suppressed only for that click.
      if (this.suppressClick) setTimeout(() => (this.suppressClick = false), 0);
    }
  }
}
