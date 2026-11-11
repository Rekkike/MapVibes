import { describe, expect, test } from 'vitest';
import { PdfDocument } from '../../src/pdfwriter';
import { PdfPainter } from '../../src/documents';
import { PDF_PAGE, type PageFrame, type Painter } from '../../src/documents';
import { captionOf, drawTimelinePage, FIGURE, layoutTimeline, timelineRowHeight, type FigureItem, type TimelineFigure } from '../../src/documenttimeline';
import { buildTimeline, type ScheduleEvent } from '../../src/timeline';
import { legendModel } from '../../src/legend';
import { en } from '../../src/i18n';
import type { Rgb, Transform } from '../../src/pdfwriter';

// A painter that records its operations, for assertions on what was drawn.
class RecordingPainter implements Painter {
  ops: Array<{ op: string; args: unknown[] }> = [];
  private record(op: string, ...args: unknown[]): void {
    this.ops.push({ op, args });
  }
  save(): void { this.record('save'); }
  restore(): void { this.record('restore'); }
  fillColour(c: Rgb): void { this.record('fillColour', c); }
  strokeColour(c: Rgb): void { this.record('strokeColour', c); }
  lineWidth(w: number): void { this.record('lineWidth', w); }
  dash(pattern: readonly number[]): void { this.record('dash', pattern); }
  opacity(a: number): void { this.record('opacity', a); }
  roundLines(): void { this.record('roundLines'); }
  beginPath(): void { this.record('beginPath'); }
  moveTo(x: number, y: number): void { this.record('moveTo', x, y); }
  lineTo(x: number, y: number): void { this.record('lineTo', x, y); }
  curveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void { this.record('curveTo', x1, y1, x2, y2, x, y); }
  close(): void { this.record('close'); }
  rect(x: number, y: number, w: number, h: number): void { this.record('rect', x, y, w, h); }
  circle(cx: number, cy: number, r: number): void { this.record('circle', cx, cy, r); }
  svgPath(d: string, t: Transform): void { this.record('svgPath', d, t); }
  fill(): void { this.record('fill'); }
  stroke(): void { this.record('stroke'); }
  clip(): void { this.record('clip'); }
  text(x: number, y: number, text: string): void { this.record('text', x, y, text); }
  image(): void { this.record('image'); }
  texts(): string[] { return this.ops.filter((o) => o.op === 'text').map((o) => String(o.args[2])); }
}

const day = (iso: string): number => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

function item(partial: Partial<FigureItem> & { id: string }): FigureItem {
  return {
    label: partial.id,
    name: partial.name ?? `Item ${partial.id}`,
    colour: partial.colour ?? 'green',
    area: '',
    start: '',
    end: '',
    symbol: 'circle',
    ...partial,
  } as FigureItem;
}

// A small fictional schedule: one item with activities and a work phase, one
// plain dated item, one item with an unreadable start, one without dates.
function figure(events: ScheduleEvent[] = [], today: number | null = null): TimelineFigure {
  const items: FigureItem[] = [
    item({
      id: 'r1',
      label: '1',
      name: 'Alpha',
      colour: 'green',
      start: '2020-01-01',
      end: '2022-12-31',
      activities: [
        { id: 'a1', label: 'Groundwork', start: '2020-03-04', end: '2020-05-31', progress: 100 },
        { id: 'a2', label: 'Paving', start: '2020-05-01', end: '2020-08-15', progress: 40 },
        { id: 'a3', label: 'Planting', start: '2020-08-01', end: '2020-11-30', progress: null, edited: true },
      ],
      workPhase: 'a2',
    }),
    item({ id: 'r2', label: '2', name: 'Beta', colour: 'blue', start: '2021-06', end: '2023' }),
    item({ id: 'r3', label: '3', name: 'Gamma', colour: 'red', start: 'not a date', end: '2024-05-05' }),
    item({ id: 'r4', label: '4', name: 'Delta', colour: 'yellow' }),
  ];
  return {
    model: buildTimeline(items, 'number', [], 'en'),
    events,
    today,
    labels: {
      title: 'Timeline',
      noDates: 'No dates',
      noArea: 'No area',
      empty: 'No items to show.',
      noRoles: null,
      startOnly: 'start only',
      endOnly: 'end only',
      startHeader: 'Start',
      endHeader: 'End',
      locale: 'en-GB',
      activities: 'Activities',
      edited: 'edited by hand',
      workPhase: 'Work phase',
      events: 'Events',
      moreEvents: '+{count}',
      eventsBefore: 'Events before the shown window: {events}',
      eventsAfter: 'Events after the shown window: {events}',
      today: 'Today, {date}',
    },
    legendTitle: en.legend,
    legend: legendModel(en),
  };
}

const event = (id: string, iso: string, label: string): ScheduleEvent => ({ id, label, day: day(iso), date: iso });

const frame = (height = PDF_PAGE.height): PageFrame => ({ width: PDF_PAGE.width, height, margin: PDF_PAGE.margin, footer: 'MapVibes · page 1 of 1' });

describe("the timeline page's layout (FR-12 as amended in v1.13.0)", () => {
  test('the window is the fitted one, and every row lands on exactly one page, in order', () => {
    const fig = figure([event('e1', '2021-05-10', 'Review'), event('e2', '2015-01-01', 'Early'), event('e3', '2030-06-01', 'Late')]);
    const layout = layoutTimeline(fig, frame());
    expect(layout.window.from).toBeLessThanOrEqual(fig.model.extent!.from);
    expect(layout.window.to).toBeGreaterThanOrEqual(fig.model.extent!.to);
    expect(layout.pages).toHaveLength(1);
    expect(layout.pages[0]).toEqual(fig.model.rows.map((_, i) => i));
    // The events beyond the fitted window are counted at the ends, not drawn.
    expect(layout.eventsBefore.map((e) => e.label)).toEqual(['Early']);
    expect(layout.eventsAfter.map((e) => e.label)).toEqual(['Late']);
    expect(layout.chips.map((c) => c.event.label)).toEqual(['Review']);
    expect(layout.drawn).toBe(true);
  });

  test('every lane is a full row: a line with activities is lanes times the line height, plus its caption', () => {
    const fig = figure();
    const layout = layoutTimeline(fig, frame());
    const line = fig.model.lines[0];
    expect(line.lanes).toBeGreaterThan(1);
    expect(line.activitySpans).toHaveLength(3);
    const h = timelineRowHeight(fig, fig.model.rows[layout.pages[0][0]], layout);
    // The first row is line r1: its spans are packed into lanes, each a full row.
    expect(h).toBeGreaterThanOrEqual(line.lanes * FIGURE.lineHeight);
  });

  test('long schedules paginate; no page exceeds the body, no line is split, no heading is orphaned', () => {
    const items: FigureItem[] = Array.from({ length: 60 }, (_, i) =>
      item({ id: `r${i}`, label: String(i + 1), name: `Item ${i + 1}`, colour: ['green', 'blue', 'red', 'yellow'][i % 4], start: `${2000 + i}-01-01`, end: `${2001 + i}-12-31` }),
    );
    const fig: TimelineFigure = { ...figure(), model: buildTimeline(items, 'number', [], 'en') };
    const layout = layoutTimeline(fig, frame());
    expect(layout.pages.length).toBeGreaterThan(1);
    const all = layout.pages.flat();
    expect(all).toEqual(fig.model.rows.map((_, i) => i));
    for (const page of layout.pages) {
      const used = page.reduce((s, i) => s + timelineRowHeight(fig, fig.model.rows[i], layout), 0);
      expect(used).toBeLessThanOrEqual(layout.bodyHeight + 1e-6);
      const last = fig.model.rows[page[page.length - 1]];
      expect(last.kind).not.toBe('heading');
    }
    // A short page splits the same schedule into more pages.
    const short = layoutTimeline(fig, frame(260));
    expect(short.pages.length).toBeGreaterThan(layout.pages.length);
    expect(short.pages.flat()).toEqual(all);
  });

  test('an empty schedule has no pages; a schedule without dates draws the notice, not an axis', () => {
    const empty = figure();
    empty.model = buildTimeline([], 'number', [], 'en');
    expect(layoutTimeline(empty, frame()).pages).toEqual([]);
    const undated = figure();
    undated.model = buildTimeline([item({ id: 'r1', label: '1' })], 'number', [], 'en');
    const layout = layoutTimeline(undated, frame());
    expect(layout.drawn).toBe(false);
    expect(layout.pages).toHaveLength(1);
    const p = new RecordingPainter();
    drawTimelinePage(p, undated, layout, layout.pages[0], frame());
    expect(p.texts()).toContain('No dates');
  });
});

describe("the timeline page's captions (FR-78 as amended in v1.13.0)", () => {
  test('a line with activities carries them, with dates, progress, the edited mark, and the work phase; an unreadable value is shown as typed', () => {
    const fig = figure();
    const withActivities = fig.model.lines[0];
    const caption = captionOf(fig, withActivities);
    expect(caption).toContain('Activities');
    expect(caption).toContain('Groundwork: 2020-03-04 – 2020-05-31, 100%');
    expect(caption).toContain('Paving: 2020-05-01 – 2020-08-15, 40%, Work phase');
    expect(caption).toContain('Planting: 2020-08-01 – 2020-11-30, edited by hand');
    const typed = fig.model.lines[2];
    expect(captionOf(fig, typed)).toContain('Start: not a date');
  });
});

describe('the timeline page drawn through the Painter', () => {
  test('the bars, the full-height lanes, the progress fills, and the hatched work-phase band are drawn', () => {
    const fig = figure();
    const layout = layoutTimeline(fig, frame());
    const p = new RecordingPainter();
    drawTimelinePage(p, fig, layout, layout.pages[0], frame());
    const line = fig.model.lines[0];
    // The phase band: a clip and diagonal strokes across the line's full height.
    expect(p.ops.filter((o) => o.op === 'clip').length).toBeGreaterThan(0);
    const bandX0 = layout.plotX + ((line.phase!.from - layout.window.from) / (layout.window.to - layout.window.from)) * layout.plotWidth;
    const hatches = p.ops.filter((o) => o.op === 'lineTo' && Math.abs(Number(o.args[0]) - (bandX0 + 10)) < 30);
    expect(hatches.length).toBeGreaterThan(0);
    // The item's own bar is filled in its colour.
    const fills = p.ops.filter((o) => o.op === 'fill');
    expect(fills.length).toBeGreaterThan(0);
    // The axis tick labels carry years or year-months.
    expect(p.texts().some((t) => /20\d\d/.test(t))).toBe(true);
    // The title, the legend title, and the footer.
    expect(p.texts()).toContain('Timeline');
    expect(p.texts()).toContain(en.legend);
    expect(p.texts()).toContain('MapVibes · page 1 of 1');
    // The item names are drawn.
    for (const name of ['Alpha', 'Beta', 'Gamma', 'Delta']) expect(p.texts()).toContain(name);
  });

  test('the events: a hairline per in-window event, its chip, and static "+n" end chips naming the off-window events', () => {
    const fig = figure([event('e1', '2021-05-10', 'Review'), event('e2', '2015-01-01', 'Early'), event('e3', '2030-06-01', 'Late')]);
    const layout = layoutTimeline(fig, frame());
    const p = new RecordingPainter();
    drawTimelinePage(p, fig, layout, layout.pages[0], frame());
    // The in-window event's hairline crosses the body; the off-window ones have none.
    const hairX = layout.plotX + layout.chips[0].x;
    const hairlines = p.ops.filter((o) => o.op === 'moveTo' && Math.abs(Number(o.args[0]) - hairX) < 0.01);
    expect(hairlines.length).toBeGreaterThan(0);
    // The chip's label is drawn.
    expect(p.texts()).toContain('Review');
    // The end chips: "+1" twice (before and after).
    expect(p.texts().filter((t) => t === '+1')).toHaveLength(2);
    // The footnote names the off-window events.
    const note = p.texts().find((t) => t.includes('before the shown window'));
    expect(note).toContain('2015-01-01: Early');
    expect(p.texts().find((t) => t.includes('after the shown window'))).toContain('2030-06-01: Late');
  });

  test('characters WinAnsi cannot represent are replaced and counted when the page is drawn into a PDF', () => {
    const fig = figure([event('e1', '2021-05-10', '₹ review Ω')]);
    fig.model.lines[0].item.name = '₹ Alpha';
    const layout = layoutTimeline(fig, frame());
    const doc = new PdfDocument({ title: 't' });
    const page = doc.addPage(PDF_PAGE.width, PDF_PAGE.height);
    drawTimelinePage(new PdfPainter(page, null), fig, layout, layout.pages[0], frame());
    doc.toBytes();
    // ₹ and Ω are each one character outside WinAnsi, in the event label and the item name.
    expect(doc.replacedCharacters).toBe(3);
  });
});

// The today line (FR-12 as noted in v1.14.0): a dashed line at the export
// date across the body, labelled with that date, and its legend entry.
describe("the timeline page's today line (FR-12 as noted in v1.14.0)", () => {
  const draw = (fig: TimelineFigure) => {
    const p = new RecordingPainter();
    const layout = layoutTimeline(fig, frame());
    drawTimelinePage(p, fig, layout, layout.pages[0], frame());
    return { p, layout };
  };
  // The dashed strokes: a dash pattern set, a path, a stroke.
  const dashedLines = (p: RecordingPainter) => {
    const out: Array<{ pattern: unknown; x: number; y0: number; y1: number; width: unknown }> = [];
    p.ops.forEach((o, i) => {
      if (o.op !== 'dash' || (o.args[0] as number[]).length === 0) return;
      const move = p.ops.slice(i).find((x) => x.op === 'moveTo')!;
      const line = p.ops.slice(i).find((x) => x.op === 'lineTo')!;
      const width = [...p.ops.slice(0, i)].reverse().find((x) => x.op === 'lineWidth')!.args[0];
      out.push({ pattern: o.args[0], x: move.args[0] as number, y0: move.args[1] as number, y1: line.args[1] as number, width });
    });
    return out;
  };

  test('at the export date within the window: a dashed 1.2-point line across the body, labelled with the date', () => {
    const { p, layout } = draw(figure([], day('2021-03-15')));
    const lines = dashedLines(p);
    expect(lines).toHaveLength(1);
    expect(lines[0].pattern).toEqual([3, 2]);
    expect(lines[0].width).toBe(1.2);
    const x = layout.plotX + ((day('2021-03-15') + 0.5 - layout.window.from) / (layout.window.to - layout.window.from)) * layout.plotWidth;
    expect(lines[0].x).toBeCloseTo(x, 3);
    expect(lines[0].y1).toBeGreaterThan(lines[0].y0 + 50);
    expect(p.texts()).toContain('Today, 2021-03-15');
    // The dash is reset after it, so nothing else is drawn dashed.
    const resets = p.ops.filter((o) => o.op === 'dash' && (o.args[0] as number[]).length === 0);
    expect(resets.length).toBeGreaterThanOrEqual(1);
  });

  test('outside the window, or with no date, nothing is drawn', () => {
    for (const today of [day('2040-01-01'), day('2001-01-01'), null]) {
      const { p } = draw(figure([], today));
      expect(dashedLines(p)).toHaveLength(0);
      expect(p.texts().some((t) => t.startsWith('Today'))).toBe(false);
    }
  });

  test('it is not an event: the events keep their solid hairlines and chips', () => {
    const { p } = draw(figure([{ id: 'e1', label: 'Review', day: day('2021-03-15'), date: '2021-03-15' }], day('2021-03-15')));
    expect(dashedLines(p)).toHaveLength(1);
    expect(p.texts()).toContain('Review');
    expect(p.texts()).toContain('Today, 2021-03-15');
  });

  test('the legend carries its entry with the date, drawn as a dashed swatch', () => {
    const fig = { ...figure([], day('2021-03-15')), legend: legendModel(en, [], [], undefined, undefined, undefined, undefined, false, '2021-03-15') };
    expect(fig.legend.map((s) => s.kind)).toContain('today');
    const { p } = draw(fig);
    expect(p.texts()).toContain('Today');
    expect(p.texts()).toContain('2021-03-15');
    // The page's line and the legend's swatch: two dashed strokes.
    expect(dashedLines(p)).toHaveLength(2);
  });
});
