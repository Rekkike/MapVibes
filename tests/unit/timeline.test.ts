import { describe, expect, test } from 'vitest';
import { areaRanks, buildTimeline, clampWindow, fitWindow, layoutLanes, orderEntries, zoomWindow, type TimelineItem } from '../../src/timeline';
import { ticks } from '../../src/timelineview';
import { dayNumber } from '../../src/dates';

// The timeline's model (FR-67) and the presentation's order (FR-70).

const item = (id: string, area: string, start: string, end: string): TimelineItem => ({ id, label: id, name: `Item ${id}`, colour: 'green', area, start, end });

describe('the timeline model (FR-67)', () => {
  test('a span runs from the start to the end; one readable end is a marked point; neither is "No dates", last', () => {
    const m = buildTimeline([item('1', '', '2024', '2025-06'), item('2', '', '', ''), item('3', '', '2024-03-15', 'soon'), item('4', '', '', '2026')]);
    expect(m.rows.map((r) => (r.kind === 'heading' ? `# ${r.heading}` : r.item.id))).toEqual(['1', '3', '4', '# noDates', '2']);
    const line = (id: string) => m.lines.find((l) => l.item.id === id)!;
    expect(line('1').spans).toEqual([{ from: dayNumber(2024, 1, 1), to: dayNumber(2025, 6, 30), lane: 0, kind: 'span' }]);
    expect(line('3').spans).toEqual([{ from: dayNumber(2024, 3, 15), to: dayNumber(2024, 3, 15), lane: 0, kind: 'start' }]);
    expect(line('3').end).toEqual({ kind: 'text', text: 'soon' });
    expect(line('4').spans[0].kind).toBe('end');
    expect(line('2').spans).toEqual([]);
    expect(m.extent).toEqual({ from: dayNumber(2024, 1, 1), to: dayNumber(2026, 12, 31) });
  });

  test('an end written before the start is drawn between the two, as written', () => {
    const m = buildTimeline([item('1', '', '2026', '2024')]);
    expect(m.lines[0].spans[0]).toMatchObject({ from: dayNumber(2024, 12, 31), to: dayNumber(2026, 1, 1), kind: 'span' });
  });

  test('spans are laid out in lanes: each in the first lane where it overlaps nothing', () => {
    const { spans, lanes } = layoutLanes([
      { from: 0, to: 10, kind: 'span' },
      { from: 5, to: 15, kind: 'span' },
      { from: 11, to: 20, kind: 'span' },
    ]);
    expect(spans.map((s) => s.lane)).toEqual([0, 1, 0]);
    expect(lanes).toBe(2);
    expect(layoutLanes([]).lanes).toBe(1);
  });

  test('without any date, nothing has an extent and the fitted window is a year', () => {
    const m = buildTimeline([item('1', '', '', '')]);
    expect(m.extent).toBeNull();
    expect(fitWindow(null)).toEqual({ from: 0, to: 365 });
  });

  test('the fitted window holds the full span with a margin; zoom stays between one calendar month and the fit (FR-67 as amended in v2.2.0)', () => {
    const fitted = fitWindow({ from: 100, to: 199 });
    expect(fitted.from).toBeLessThan(100);
    expect(fitted.to).toBeGreaterThan(200);
    // Day 150 lies in May 1970, a month of 31 days.
    const narrow = clampWindow(zoomWindow(fitted, 1000, 150), fitted);
    expect(narrow.to - narrow.from).toBeCloseTo(31);
    const wide = clampWindow(zoomWindow(fitted, 0.01, 150), fitted);
    expect(wide.to - wide.from).toBeCloseTo(fitted.to - fitted.from);
    // Zooming keeps the day under the pointer where it is.
    const z = zoomWindow({ from: 0, to: 100 }, 2, 20);
    expect(z).toEqual({ from: 10, to: 60 });
  });

  test('the axis ticks are years, months, or days, as the room allows', () => {
    const years = ticks({ from: dayNumber(2018, 1, 1), to: dayNumber(2030, 1, 1) }, 900);
    expect(years.every((t) => t.unit === 'year')).toBe(true);
    expect(years[0].day).toBe(dayNumber(2018, 1, 1));
    const months = ticks({ from: dayNumber(2024, 1, 1), to: dayNumber(2024, 12, 31) }, 900);
    expect(months.every((t) => t.unit === 'month')).toBe(true);
    const days = ticks({ from: dayNumber(2024, 3, 1), to: dayNumber(2024, 3, 15) }, 1200);
    expect(days.every((t) => t.unit === 'day')).toBe(true);
  });
});

describe('the presentation order (FR-70)', () => {
  const entries = [
    item('1', 'South', '2025', ''),
    item('2', '', '2023', ''),
    item('3', 'North', '', ''),
    item('4', 'East', '2023', ''),
    item('5', 'North', '2022', ''),
  ];
  const keys = (e: TimelineItem) => ({ area: e.area, start: e.start === '' ? null : Number(e.start) });

  test('by number, the order given', () => {
    expect(orderEntries(entries, 'number', keys).map((e) => e.id)).toEqual(['1', '2', '3', '4', '5']);
  });

  test("by area: the user's areas first in their order, then the others alphabetically, then no area; by number within", () => {
    expect(orderEntries(entries, 'area', keys, ['North', 'South']).map((e) => e.id)).toEqual(['3', '5', '1', '4', '2']);
    expect([...areaRanks(['b', '', 'a'], []).keys()]).toEqual(['a', 'b', '']);
  });

  test('by start date, the items without a start last; by number among equals', () => {
    expect(orderEntries(entries, 'start', keys).map((e) => e.id)).toEqual(['5', '2', '4', '1', '3']);
  });

  test('by area, the timeline shows each area under its name', () => {
    const m = buildTimeline(entries, 'area', ['North']);
    expect(m.rows.map((r) => (r.kind === 'heading' ? `# ${r.heading === 'area' ? r.area : 'noDates'}` : r.item.id))).toEqual([
      '# North',
      '5',
      '# East',
      '4',
      '# South',
      '1',
      '# ',
      '2',
      '# noDates',
      '3',
    ]);
  });
});

describe('activities in the timeline model (FR-78)', () => {
  const act = (label: string, start: string, end: string, progress: number | null = null) => ({ label, start, end, progress });

  test('the own span keeps lane 0 and the activities pack into lanes; the extent includes them', () => {
    const m = buildTimeline([
      {
        ...item('1', 'P1', '2024', '2025'),
        activities: [
          act('a', '2024-01-01', '2024-03-01', 50),
          act('b', '2024-02-01', '2024-04-01', 100),
          act('c', '2024-02-15', '2024-05-01', null),
          act('d', '2025-06-01', '2025-12-31', 0),
        ],
      },
    ]);
    const line = m.lines[0];
    const own = line.spans.find((s) => s.kind !== 'activity')!;
    expect(own.lane).toBe(0);
    expect(line.activitySpans).toHaveLength(4);
    // Overlapping activities pack into later lanes.
    expect(line.lanes).toBeGreaterThan(1);
    expect(line.lanes).toBe(1 + Math.max(...line.activitySpans.map((s) => s.lane)));
    // The fitted window covers the activity extents too.
    expect(m.extent!.to).toBeGreaterThanOrEqual(new Date('2025-12-31T00:00:00Z').getTime() / 86400000);
  });

  test('an activity with an unreadable date has no segment (absence is not an error)', () => {
    const m = buildTimeline([
      { ...item('1', 'P1', '2024', '2025'), activities: [act('bad', '15/03/2024', '2024-05-01', 10), act('ok', '2024-02-01', '2024-03-01', null)] },
    ]);
    const line = m.lines[0];
    expect(line.activitySpans).toHaveLength(1);
    expect(line.activitySpans[0].activity!.label).toBe('ok');
    // The item's own activities are still all on the item, for the description.
    expect(line.item.activities).toHaveLength(2);
  });

  test('a project without activities is exactly as before: one span, one lane', () => {
    const m = buildTimeline([item('1', 'P1', '2024', '2025')]);
    expect(m.lines[0].spans).toHaveLength(1);
    expect(m.lines[0].lanes).toBe(1);
    expect(m.lines[0].activitySpans).toEqual([]);
  });
});
