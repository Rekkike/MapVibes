// The timeline page of the documents (FR-12 as amended in v1.13.0, FR-67,
// FR-78, FR-80): the fitted schedule of the shown items, drawn statically
// through the Painter interface — the same way the stage page is drawn — so
// that the PDF writer paints it as vectors and the PowerPoint slide as a
// rasterised image. Pure: no DOM, no state. The window is always the fitted
// one (the owner's ruling); every lane is drawn full-height, since a static
// page has no transient expansion; the events beyond the window are counted
// in static "+n" chips at the ends of the strip and named beside it.

import { formatDate, readDate } from './dates';
import type { RowColour } from './dataset';
import { COLOUR_RGB, drawFooter, drawMarker, layoutLegend, LEGEND_FONT, markerSize, PALETTE, wrapValue, type PageFrame, type Painter } from './documents';
import { format } from './i18n';
import type { LegendSection } from './legend';
import { fitText, textWidth } from './pdfwriter';
import type { MarkerSymbol } from './symbols';
import { fitWindow, layoutEvents, type EventChip, type ScheduleEvent, type TimelineItem, type TimelineLine, type TimelineModel, type TimelineRow, type TimelineSpan } from './timeline';
import { eventChipWidth, ticks } from './timelineview';

// A timeline item as the figure needs it: the badge's symbol beside the name.
export interface FigureItem extends TimelineItem {
  symbol?: MarkerSymbol;
}

export interface TimelineFigureLabels {
  // The page title.
  title: string;
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
  // The per-line captions (FR-78 as amended): the activities with their dates
  // (as typed when unreadable), progress, edited mark, and work phase.
  activities: string;
  edited: string;
  workPhase: string;
  // The events (FR-80): the strip's heading, the "+n" chip, and the end
  // chips' names of the events beyond the window.
  events: string;
  moreEvents: string;
  eventsBefore: string;
  eventsAfter: string;
  // The today line's label, with {date} (FR-12 as noted).
  today: string;
}

export interface TimelineFigure {
  model: TimelineModel;
  events: ScheduleEvent[];
  // The export date as a day number, or null for no today line.
  today: number | null;
  labels: TimelineFigureLabels;
  legendTitle: string;
  legend: LegendSection[];
}

// The figure's geometry in page units (points on paper, points on a slide).
export const FIGURE = {
  titleFont: 11,
  titleHeight: 20,
  nameWidth: 150,
  font: 7,
  badgeScale: 0.55,
  // Every lane is a full row (the owner's ruling: full-height, no badge).
  lineHeight: 17,
  barHeight: 9,
  segHeight: 6,
  pointSize: 6,
  headingFont: 8,
  headingHeight: 15,
  axisFont: 7,
  axisHeight: 17,
  eventFont: 6.5,
  eventRowHeight: 12,
  eventPad: 3,
  eventGap: 3,
  // The chips' widths are estimated from their characters, as in the views
  // (FR-80, accepted as recorded), scaled to page units.
  eventChipScale: 0.72,
  eventMoreWidth: 22,
  eventEdgeWidth: 22,
  eventEdgeReserve: 24,
  captionFont: 6.5,
  captionLineHeight: 8.5,
  captionMaxLines: 2,
  hairline: 0.6,
  // The today line: a dashed 1.2-point line, distinct from the events' thin
  // solid hairlines.
  todayWidth: 1.2,
  todayDash: [3, 2] as readonly number[],
  gridline: 0.4,
  legendGap: 6,
  rowGap: 2,
} as const;

export interface TimelineLayout {
  window: { from: number; to: number };
  // The plot's position within the page and its width.
  plotX: number;
  plotWidth: number;
  nameWidth: number;
  titleHeight: number;
  axisHeight: number;
  // The events strip's height (0 when the work has no events), including the
  // footnote line naming the events beyond the window.
  stripHeight: number;
  stripTop: number;
  stripRows: number;
  legendHeight: number;
  bodyTop: number;
  bodyHeight: number;
  // Per page, the indices into model.rows, in order; every row appears once.
  pages: number[][];
  // The events' chips at the plot's width, and those beyond the window.
  chips: EventChip[];
  eventsBefore: ScheduleEvent[];
  eventsAfter: ScheduleEvent[];
  drawn: boolean; // whether an axis is drawn (the model has a dated span)
}

// The height of one row of the model in page units: a heading's own height, a
// line's full height (its lanes, every one a full row) plus its caption.
export function timelineRowHeight(fig: TimelineFigure, row: TimelineRow, layout: Pick<TimelineLayout, 'plotWidth'>, f = FIGURE): number {
  if (row.kind === 'heading') return f.headingHeight;
  const caption = captionOf(fig, row);
  const captionLines = caption === '' ? 0 : wrapValue(caption, layout.plotWidth, 'regular', f.captionFont, f.captionMaxLines).length;
  return row.lanes * f.lineHeight + (captionLines > 0 ? captionLines * f.captionLineHeight + 2 : 0) + f.rowGap;
}

// The caption of a line (FR-78 as amended in v1.13.0): the values shown as
// typed, and every activity with its dates, progress, edited mark, and work
// phase — what the views carry in titles and accessible descriptions.
export function captionOf(fig: TimelineFigure, line: TimelineLine): string {
  const labels = fig.labels;
  const parts: string[] = [];
  if (line.start.kind === 'text') parts.push(`${labels.startHeader}: ${line.start.text}`);
  if (line.end.kind === 'text') parts.push(`${labels.endHeader}: ${line.end.text}`);
  const acts = line.item.activities ?? [];
  if (acts.length > 0) {
    const list = acts.map((a) => {
      const s = readDate(a.start);
      const e = readDate(a.end);
      const ws = s.kind === 'date' ? formatDate(s, 'start') : a.start;
      const we = e.kind === 'date' ? formatDate(e, 'end') : a.end;
      return `${a.label}: ${ws} – ${we}${a.progress === null ? '' : `, ${a.progress}%`}${a.edited ? `, ${labels.edited}` : ''}${line.phase?.activity === a ? `, ${labels.workPhase}` : ''}`;
    });
    parts.push(`${labels.activities}: ${list.join('; ')}`);
  }
  return parts.join('. ');
}

function isHeading(row: TimelineRow): row is Extract<TimelineRow, { kind: 'heading' }> {
  return row.kind === 'heading';
}

// Lays the figure out on a page frame: the fitted window, the plot's width,
// the events' chips, and the pages — the rows packed whole, a heading never
// orphaned (it travels with the line that follows it).
export function layoutTimeline(fig: TimelineFigure, frame: PageFrame, f = FIGURE): TimelineLayout {
  const contentWidth = frame.width - 2 * frame.margin;
  const footerSpace = frame.footer === '' ? 0 : LEGEND_FONT * 2;
  const window = fitWindow(fig.model.extent);
  const nameWidth = Math.min(f.nameWidth, contentWidth * 0.3);
  const plotX = frame.margin + nameWidth;
  const plotWidth = contentWidth - nameWidth;
  const legend = layoutLegend(fig.legendTitle, fig.legend, contentWidth);
  const drawn = fig.model.extent !== null;
  // The events at the fitted window: the chips in the strip, and those beyond
  // it counted at the ends (FR-80 as amended in v1.13.0).
  const eventsBefore = fig.events.filter((e) => e.day < window.from);
  const eventsAfter = fig.events.filter((e) => e.day > window.to);
  const inWindow = fig.events.filter((e) => e.day >= window.from && e.day <= window.to);
  const scale = f.eventChipScale;
  const chips = layoutEvents(
    inWindow.map((event) => ({ event, x: ((event.day - window.from) / (window.to - window.from)) * plotWidth, width: eventChipWidth(event.label) * scale })),
    plotWidth,
    f.eventMoreWidth * scale,
    2,
    eventsBefore.length > 0 ? f.eventEdgeReserve : 0,
    eventsAfter.length > 0 ? f.eventEdgeReserve : 0,
  );
  const stripRows = fig.events.length === 0 ? 0 : Math.max(1, ...chips.map((c) => c.row + 1));
  const footnote = eventsBefore.length > 0 || eventsAfter.length > 0 ? f.captionLineHeight : 0;
  const stripHeight = fig.events.length === 0 ? 0 : stripRows * f.eventRowHeight + 2 + footnote;
  const titleHeight = f.titleHeight;
  const axisHeight = drawn ? f.axisHeight : f.captionLineHeight + 4;
  const bodyTop = frame.margin + titleHeight + axisHeight + stripHeight;
  const bodyHeight = frame.height - frame.margin - footerSpace - legend.height - f.legendGap - bodyTop;
  // The pages: units of (heading, line) packed whole.
  const units: Array<{ heading: number | null; line: number }> = [];
  let pending: number | null = null;
  fig.model.rows.forEach((row, i) => {
    if (isHeading(row)) pending = i;
    else {
      units.push({ heading: pending, line: i });
      pending = null;
    }
  });
  const pages: number[][] = [];
  let page: number[] = [];
  let used = 0;
  for (const unit of units) {
    const h = timelineRowHeight(fig, fig.model.rows[unit.line], { plotWidth }, f) + (unit.heading === null ? 0 : f.headingHeight);
    if (page.length > 0 && used + h > bodyHeight) {
      pages.push(page);
      page = [];
      used = 0;
    }
    if (unit.heading !== null) page.push(unit.heading);
    page.push(unit.line);
    used += h;
  }
  if (page.length > 0) pages.push(page);
  return {
    window,
    plotX,
    plotWidth,
    nameWidth,
    titleHeight,
    axisHeight,
    stripHeight,
    stripTop: frame.margin + titleHeight + axisHeight,
    stripRows,
    legendHeight: legend.height,
    bodyTop,
    bodyHeight,
    pages,
    chips,
    eventsBefore,
    eventsAfter,
    drawn,
  };
}

// The x position of a day in the plot, in page units.
function dayX(layout: TimelineLayout, day: number): number {
  return layout.plotX + ((day - layout.window.from) / (layout.window.to - layout.window.from)) * layout.plotWidth;
}

// A hatched band (the work phase, FR-78): diagonal strokes inside a clip, as
// the stylesheet's repeating gradient.
function hatchBand(p: Painter, x: number, y: number, w: number, h: number): void {
  p.save();
  p.beginPath();
  p.rect(x, y, w, h);
  p.clip();
  p.strokeColour(PALETTE.fg);
  p.opacity(0.3);
  p.lineWidth(0.7);
  p.beginPath();
  for (let sx = x - h; sx < x + w; sx += 5) {
    p.moveTo(sx, y + h);
    p.lineTo(sx + h, y);
  }
  p.stroke();
  p.restore();
  p.strokeColour(PALETTE.muted);
  p.opacity(1);
  p.lineWidth(0.5);
  p.beginPath();
  p.moveTo(x, y);
  p.lineTo(x, y + h);
  p.moveTo(x + w, y);
  p.lineTo(x + w, y + h);
  p.stroke();
}

function roundedChip(p: Painter, x: number, y: number, w: number, h: number, label: string, font: number, f: typeof FIGURE): void {
  const r = Math.min(3, h / 2);
  p.save();
  p.fillColour(PALETTE.white);
  p.strokeColour(PALETTE.border);
  p.lineWidth(0.5);
  p.beginPath();
  p.moveTo(x + r, y);
  p.lineTo(x + w - r, y);
  p.curveTo(x + w, y, x + w, y + r, x + w, y + r);
  p.lineTo(x + w, y + h - r);
  p.curveTo(x + w, y + h, x + w - r, y + h, x + w - r, y + h);
  p.lineTo(x + r, y + h);
  p.curveTo(x, y + h, x, y + h - r, x, y + h - r);
  p.lineTo(x, y + r);
  p.curveTo(x, y, x + r, y, x + r, y);
  p.close();
  p.fill();
  p.stroke();
  p.fillColour(PALETTE.fg);
  const shown = fitText(label, 'regular', font, w - 2 * f.eventPad);
  if (shown !== '') p.text(x + f.eventPad, y + h / 2 + 0.35 * font, shown, 'regular', font);
  p.restore();
}

// One timeline page: the title, the axis and its tick labels, the events
// strip with the hairlines crossing the body, the rows (every lane a full
// row, the phase band across the line's full height), the captions, the
// legend, and the footer.
export function drawTimelinePage(p: Painter, fig: TimelineFigure, layout: TimelineLayout, page: number[], frame: PageFrame, f = FIGURE): void {
  const bodyBottom = frame.height - frame.margin - (frame.footer === '' ? 0 : LEGEND_FONT * 2) - layout.legendHeight - f.legendGap;
  let y = frame.margin;
  p.fillColour(PALETTE.fg);
  p.text(frame.margin, y + f.titleFont, fig.labels.title, 'bold', f.titleFont);
  y += f.titleHeight;

  if (!layout.drawn) {
    // No item has a readable date: the notice the view shows, then the lines.
    p.fillColour(PALETTE.muted);
    const message = fig.labels.noRoles ?? (fig.model.lines.length === 0 ? fig.labels.empty : '');
    if (message !== '') p.text(frame.margin, y + f.captionLineHeight, message, 'regular', f.captionFont);
    y += f.axisHeight;
  } else {
    // The axis and the gridlines.
    const axisY = y + f.axisHeight - 2;
    const locale = fig.labels.locale;
    const fmt = (t: { day: number; unit: string }) => {
      const d = new Date(t.day * 86_400_000);
      if (t.unit === 'year') return String(d.getUTCFullYear());
      if (t.unit === 'month') return new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
      return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d);
    };
    p.strokeColour(PALETTE.border);
    p.lineWidth(f.gridline);
    p.beginPath();
    p.moveTo(layout.plotX, axisY);
    p.lineTo(layout.plotX + layout.plotWidth, axisY);
    p.stroke();
    p.fillColour(PALETTE.muted);
    for (const t of ticks(layout.window, layout.plotWidth)) {
      const x = dayX(layout, t.day);
      p.text(x, axisY - 2, fmt(t), 'regular', f.axisFont, 'centre');
      p.strokeColour(PALETTE.border);
      p.lineWidth(f.gridline);
      p.beginPath();
      p.moveTo(x, axisY + 1);
      p.lineTo(x, bodyBottom);
      p.stroke();
    }
    y += f.axisHeight;
  }

  // The events strip (FR-80 as amended in v1.13.0): the hairlines crossing
  // the body, the chips in the strip, and the static end chips counting the
  // events beyond the window, which are named in the footnote.
  if (fig.events.length > 0) {
    const stripTop = y;
    p.strokeColour(PALETTE.muted);
    p.lineWidth(f.hairline);
    p.beginPath();
    for (const chip of layout.chips) {
      const x = layout.plotX + chip.x;
      p.moveTo(x, stripTop);
      p.lineTo(x, bodyBottom);
      for (const hidden of chip.more) {
        const hx = dayX(layout, hidden.day);
        p.moveTo(hx, stripTop);
        p.lineTo(hx, bodyBottom);
      }
    }
    p.stroke();
    for (const chip of layout.chips) {
      roundedChip(p, layout.plotX + chip.left, stripTop + chip.row * f.eventRowHeight + 1, chip.width, f.eventRowHeight - 2, chip.event.label, f.eventFont, f);
      if (chip.more.length > 0) {
        roundedChip(p, layout.plotX + chip.left + chip.width + f.eventGap, stripTop + chip.row * f.eventRowHeight + 1, f.eventMoreWidth * f.eventChipScale, f.eventRowHeight - 2, format(fig.labels.moreEvents, { count: chip.more.length }), f.eventFont, f);
      }
    }
    if (layout.eventsBefore.length > 0) {
      roundedChip(p, layout.plotX, stripTop + 1, f.eventEdgeWidth, f.eventRowHeight - 2, format(fig.labels.moreEvents, { count: layout.eventsBefore.length }), f.eventFont, f);
    }
    if (layout.eventsAfter.length > 0) {
      roundedChip(p, layout.plotX + layout.plotWidth - f.eventEdgeWidth, stripTop + 1, f.eventEdgeWidth, f.eventRowHeight - 2, format(fig.labels.moreEvents, { count: layout.eventsAfter.length }), f.eventFont, f);
    }
    if (layout.eventsBefore.length > 0 || layout.eventsAfter.length > 0) {
      const said = (e: ScheduleEvent) => `${e.date}: ${e.label}`;
      const note: string[] = [];
      if (layout.eventsBefore.length > 0) note.push(format(fig.labels.eventsBefore, { events: layout.eventsBefore.map(said).join('; ') }));
      if (layout.eventsAfter.length > 0) note.push(format(fig.labels.eventsAfter, { events: layout.eventsAfter.map(said).join('; ') }));
      p.fillColour(PALETTE.muted);
      p.text(layout.plotX, stripTop + layout.stripRows * f.eventRowHeight + 2 + f.captionLineHeight - 2, fitText(note.join(' '), 'regular', f.captionFont, layout.plotWidth), 'regular', f.captionFont);
    }
    y += layout.stripHeight;
  }
  const bodyTop = y;

  // The rows: headings, then the lines with every lane a full row.
  for (const rowIndex of page) {
    const row = fig.model.rows[rowIndex];
    if (isHeading(row)) {
      p.fillColour(PALETTE.muted);
      const heading = row.heading === 'noDates' ? fig.labels.noDates : row.heading === 'area' ? row.area === '' ? fig.labels.noArea : row.area : '';
      p.text(frame.margin, y + f.headingFont, heading, 'bold', f.headingFont);
      y += f.headingHeight;
      continue;
    }
    const line = row;
    const rowTop = y;
    const rowHeight = line.lanes * f.lineHeight;
    // The name: the badge (the marker with its number, as on the map) and the
    // title, in the name column.
    const badge = f.font * 1.35 * f.badgeScale;
    const symbol = (line.item as FigureItem).symbol ?? 'circle';
    const scale = badge / markerSize(symbol, line.item.label).height;
    drawMarker(p, frame.margin + badge / 2 + 2, rowTop + f.lineHeight / 2, symbol, line.item.colour as RowColour, line.item.label, scale);
    p.fillColour(PALETTE.fg);
    const nameLeft = frame.margin + badge + 6;
    const nameWidth = layout.plotX - nameLeft - 4;
    const name = fitText(line.item.name, 'regular', f.font, Math.max(10, nameWidth));
    p.text(nameLeft, rowTop + f.lineHeight / 2 + 0.35 * f.font, name, 'regular', f.font);
    // The plot's frame for the line.
    p.strokeColour(PALETTE.border);
    p.lineWidth(f.gridline);
    p.beginPath();
    p.moveTo(layout.plotX, rowTop);
    p.lineTo(layout.plotX + layout.plotWidth, rowTop);
    p.stroke();
    if (layout.drawn) {
      // The work-phase band across the line's full height, behind the spans.
      if (line.phase) {
        const bx = dayX(layout, line.phase.from);
        const bw = dayX(layout, line.phase.to + 1) - bx;
        hatchBand(p, bx, rowTop, bw, rowHeight);
      }
      for (const span of line.spans) {
        drawSpan(p, fig, layout, line, span, rowTop, f);
      }
    }
    y += rowHeight;
    // The caption: the segment labels and the values shown as typed.
    const caption = captionOf(fig, line);
    if (caption !== '') {
      p.fillColour(PALETTE.muted);
      const lines = wrapValue(caption, layout.plotWidth, 'regular', f.captionFont, f.captionMaxLines);
      lines.forEach((text, i) => p.text(layout.plotX, y + 2 + (i + 0.78) * f.captionLineHeight, text, 'regular', f.captionFont));
      y += lines.length * f.captionLineHeight + 2;
    }
    y += f.rowGap;
  }

  // The today line (FR-12 as noted): a dashed line in the text
  // colour across the body at the export date, labelled with that date at
  // its head, on the side with room; not drawn outside the window.
  if (layout.drawn && fig.today !== null && fig.today >= layout.window.from && fig.today <= layout.window.to) {
    const x = dayX(layout, fig.today + 0.5);
    p.strokeColour(PALETTE.fg);
    p.lineWidth(f.todayWidth);
    p.dash(f.todayDash);
    p.beginPath();
    p.moveTo(x, bodyTop);
    p.lineTo(x, bodyBottom);
    p.stroke();
    p.dash([]);
    const day = fig.today;
    const label = format(fig.labels.today, { date: formatDate({ kind: 'date', start: day, end: day, precision: 'day' }) });
    const w = textWidth(label, 'regular', f.captionFont) + 4;
    const right = x + 2 + w <= layout.plotX + layout.plotWidth;
    p.fillColour(PALETTE.white);
    p.beginPath();
    p.rect(right ? x + 2 : x - 2 - w, bodyTop + 1, w, f.captionLineHeight);
    p.fill();
    p.fillColour(PALETTE.fg);
    p.text(right ? x + 4 : x - w, bodyTop + f.captionLineHeight - 1.5, label, 'regular', f.captionFont);
  }

  // The legend, as the stage page carries it, then the footer.
  layoutLegend(fig.legendTitle, fig.legend, frame.width - 2 * frame.margin).draw(p, frame.margin, bodyBottom + f.legendGap);
  drawFooter(p, frame);
}

// One span of a line, in its lane: the item's bar, a marked point, or an
// activity segment with its progress fill and, where it is the work phase,
// its hatch; the label inside the segment when it fits.
function drawSpan(p: Painter, fig: TimelineFigure, layout: TimelineLayout, line: TimelineLine, span: TimelineSpan, rowTop: number, f: typeof FIGURE): void {
  if (span.kind === 'amount') return; // the costs view's spans are not drawn here
  const colour = COLOUR_RGB[line.item.colour as RowColour];
  const x0 = dayX(layout, span.from);
  const x1 = dayX(layout, span.to + 1);
  const w = Math.max(0.8, x1 - x0);
  const laneTop = rowTop + span.lane * f.lineHeight;
  if (span.kind === 'start' || span.kind === 'end') {
    const cx = span.kind === 'start' ? x0 : x1;
    p.fillColour(colour);
    p.beginPath();
    p.rect(cx - f.pointSize / 2, laneTop + (f.lineHeight - f.pointSize) / 2, f.pointSize, f.pointSize);
    p.fill();
    return;
  }
  const h = span.kind === 'span' ? f.barHeight : f.segHeight;
  const top = laneTop + (f.lineHeight - h) / 2;
  p.fillColour(colour);
  p.beginPath();
  p.rect(x0, top, w, h);
  p.fill();
  if (span.kind === 'activity') {
    const a = span.activity!;
    if (a.progress !== null && a.progress > 0) {
      p.fillColour(PALETTE.fg);
      p.opacity(0.3);
      p.beginPath();
      p.rect(x0, top, Math.min(w, (w * a.progress) / 100), h);
      p.fill();
      p.opacity(1);
    }
    if (line.phase?.activity === a) hatchBand(p, x0, top, w, h);
    const label = a.label;
    if (label !== '' && w >= 18) {
      const shown = fitText(label, 'bold', f.font - 0.5, w - 4);
      if (shown !== '') {
        p.fillColour(PALETTE.markerText);
        p.text(x0 + w / 2, top + h / 2 + 0.35 * (f.font - 0.5), shown, 'bold', f.font - 0.5, 'centre');
      }
    }
  }
}
