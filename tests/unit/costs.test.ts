import { describe, expect, test } from 'vitest';
import {
  amountShare,
  buildCosts,
  inThousands,
  layoutEvents,
  type EventChip,
  type CostsAmount,
  type CostsItem,
  type TimelineModel,
  type TimelineSpan,
} from '../../src/timeline';
import { amountLabelPlace, eventChipWidth } from '../../src/timelineview';
import { dayNumber } from '../../src/dates';

// The costs view's model (FR-79).

const amount = (series: CostsAmount['series'], year: number, value: number, decimals = 0): CostsAmount => ({ series, year, value, decimals });
const item = (id: string, amounts: CostsAmount[], extra: Partial<CostsItem> = {}): CostsItem => ({
  id,
  label: id,
  name: `Item ${id}`,
  colour: 'green',
  area: '',
  start: '',
  end: '',
  amounts,
  typed: [],
  ...extra,
});
const brief = (spans: TimelineSpan[]) => spans.map((s) => `${s.amount!.year} ${s.amount!.series} ${s.amount!.value} @${s.lane}`);

describe('the costs model (FR-79)', () => {
  test('each year with a value is one span per series covering the year, of kind amount', () => {
    const m = buildCosts([item('1', [amount('budget', 2024, 100), amount('outcome', 2024, 90)])], [2024]);
    const line = m.lines[0];
    expect(line.spans.map((s) => [s.kind, s.from, s.to])).toEqual([
      ['amount', dayNumber(2024, 1, 1), dayNumber(2024, 12, 31)],
      ['amount', dayNumber(2024, 1, 1), dayNumber(2024, 12, 31)],
    ]);
    expect(line.spans.map((s) => s.amount)).toEqual([amount('budget', 2024, 100), amount('outcome', 2024, 90)]);
  });

  test('the series of a year fully overlap, so the lane layout packs them into the three sub-lanes, budget, forecast, outcome', () => {
    const m = buildCosts(
      [item('1', [amount('outcome', 2025, 3), amount('budget', 2024, 1), amount('forecast', 2025, 2), amount('budget', 2025, 1), amount('outcome', 2026, 5)])],
      [2024, 2025, 2026],
    );
    expect(brief(m.lines[0].spans)).toEqual(['2024 budget 1 @0', '2025 budget 1 @0', '2025 forecast 2 @1', '2025 outcome 3 @2', '2026 outcome 5 @0']);
    expect(m.lines[0].lanes).toBe(3);
    // Never more than the three sub-lanes: the badge has nothing to hide.
    expect(Math.max(...m.lines[0].spans.map((s) => s.lane))).toBeLessThan(3);
  });

  test('an item without economics is an empty named line: absence is never an error and never a zero', () => {
    const m = buildCosts([item('1', [amount('budget', 2024, 100)]), item('2', [])], [2024]);
    expect(m.lines.map((l) => [l.item.id, l.spans.length])).toEqual([
      ['1', 1],
      ['2', 0],
    ]);
    // No "No dates" section: the empty line keeps its place.
    expect(m.rows.map((r) => (r.kind === 'heading' ? `# ${r.heading}` : r.item.id))).toEqual(['# totals', '1', '2']);
  });

  test('a value that is not a number has no span and is left out of the sums', () => {
    const m = buildCosts([item('1', [amount('budget', 2024, 100)], { typed: [{ series: 'budget', year: 2025, text: '1,250' }] })], [2024, 2025]);
    expect(brief(m.lines[0].spans)).toEqual(['2024 budget 100 @0']);
    expect(brief((m.rows[0] as { spans: TimelineSpan[] }).spans)).toEqual(['2024 budget 100 @0']);
  });

  test('the totals row is first: one sum per series and year across the lines, in the same sub-lanes, exact to the decimals given', () => {
    const m = buildCosts(
      [
        item('1', [amount('budget', 2024, 100.1, 1), amount('outcome', 2024, 90)]),
        item('2', [amount('budget', 2024, 0.25, 2), amount('forecast', 2025, 7)]),
        item('3', []),
      ],
      [2024, 2025],
    );
    const totals = m.rows[0];
    expect(totals.kind === 'heading' && totals.heading).toBe('totals');
    const spans = (totals as { spans: TimelineSpan[] }).spans;
    expect(brief(spans)).toEqual(['2024 budget 100.35 @0', '2024 outcome 90 @1', '2025 forecast 7 @0']);
    expect(spans[0].amount!.decimals).toBe(2);
  });

  test('no amounts at all: no totals row', () => {
    expect(buildCosts([item('1', [])], [2024]).rows.map((r) => r.kind)).toEqual(['line']);
  });

  test('two scales: the lines on the largest single year amount, the totals on the largest year total', () => {
    const m = buildCosts([item('1', [amount('budget', 2024, 600), amount('budget', 2025, 100)]), item('2', [amount('budget', 2024, 500)])], [2024, 2025]);
    expect(m.scale).toEqual({ line: 600, totals: 1100 });
    expect(amountShare(600, m.scale!.line)).toBe(1);
    expect(amountShare(100, m.scale!.line)).toBeCloseTo(1 / 6);
    expect(amountShare(1100, m.scale!.totals)).toBe(1);
  });

  test('a fill is the share of the scale, from 0 to 1; a negative amount or an empty scale has none', () => {
    expect(amountShare(50, 200)).toBe(0.25);
    expect(amountShare(-50, 200)).toBe(0);
    expect(amountShare(0, 0)).toBe(0);
    expect(amountShare(300, 200)).toBe(1);
  });

  test('the fitted extent spans the years of the assigned series, with or without values; none without series', () => {
    const m = buildCosts([item('1', [amount('budget', 2024, 1)])], [2022, 2023, 2024, 2025]);
    expect(m.extent).toEqual({ from: dayNumber(2022, 1, 1), to: dayNumber(2025, 12, 31) });
    expect(buildCosts([item('1', [])], []).extent).toBeNull();
  });

  test('the order is shared with the timeline: by number, by area with headings, or by start date', () => {
    const items = [
      item('1', [], { area: 'South', start: '2026' }),
      item('2', [], { area: 'North', start: '2024' }),
      item('3', [amount('budget', 2024, 1)], { area: 'South' }),
    ];
    const ids = (m: TimelineModel) => m.rows.map((r) => (r.kind !== 'heading' ? r.item.id : r.heading === 'area' ? `# ${r.area}` : `# ${r.heading}`));
    expect(ids(buildCosts(items, [2024]))).toEqual(['# totals', '1', '2', '3']);
    expect(ids(buildCosts(items, [2024], 'area', ['North', 'South']))).toEqual(['# totals', '# North', '2', '# South', '1', '3']);
    expect(ids(buildCosts(items, [2024], 'start'))).toEqual(['# totals', '2', '1', '3']);
  });

  test('amounts are shown in whole thousands, rounded half away from zero', () => {
    expect([663000, 1499, 1500, 499, -1500, 0].map(inThousands)).toEqual([663, 1, 2, 0, -2, 0]);
  });

  test('the figure stands after the fill where the cell has room, inside a fill wide enough, else nowhere', () => {
    // A 63-pixel cell, a three-character figure (21.6 pixels: the figures are
    // 12 pixels since v2.0.0, 7.2 a character; they were 10 pixels, 6 a
    // character).
    expect(amountLabelPlace(63, 0.36, 3)).toBe('outside');
    expect(amountLabelPlace(63, 0.9, 3)).toBe('inside');
    // A five-character figure (36 pixels) after a fill of seven tenths does
    // not fit; inside it does.
    expect(amountLabelPlace(63, 0.7, 5)).toBe('inside');
    // The fitting cost of the larger figures: a fill of six tenths held the
    // five-character figure before v2.0.0 and no longer does.
    expect(amountLabelPlace(63, 0.6, 5)).toBe('none');
    // The compact and short classes keep the 10-pixel figures, 6 a character.
    expect(amountLabelPlace(63, 0.6, 5, 6)).toBe('inside');
    // A narrow cell holds neither.
    expect(amountLabelPlace(20, 0.5, 3)).toBe('none');
  });
});

// The events' chips in a schedule view (FR-80).
describe('the events layout (FR-80)', () => {
  const ev = (id: string, x: number, width = 60) => ({ event: { id, label: id, day: Math.round(x), date: '2024' }, x, width });
  const brief = (chips: EventChip[]) => chips.map((c) => `${c.event.id}@${c.row}:${c.left}${c.more.length > 0 ? `+${c.more.map((m) => m.id).join(',')}` : ''}`);

  test('events apart share the first row, each chip after its hairline', () => {
    expect(brief(layoutEvents([ev('b', 300), ev('a', 100)], 800, 30))).toEqual(['a@0:100', 'b@0:300']);
  });

  test('near-dated events whose labels would overlap stagger into two rows', () => {
    expect(brief(layoutEvents([ev('a', 100), ev('b', 120), ev('c', 300)], 800, 30))).toEqual(['a@0:100', 'b@1:120', 'c@0:300']);
  });

  test('past two rows, an event is counted in a "+n" chip beside the chip that blocks it', () => {
    const chips = layoutEvents([ev('a', 100), ev('b', 110), ev('c', 120), ev('d', 130)], 800, 30);
    expect(brief(chips)).toEqual(['a@0:100', 'b@1:110+c,d']);
    // The "+n" chip takes its own room: an event just past the blocker joins it too.
    expect(brief(layoutEvents([ev('a', 100), ev('b', 110), ev('c', 120), ev('d', 180), ev('e', 400)], 800, 30))).toEqual([
      'a@0:100',
      'b@1:110+c',
      'd@0:180',
      'e@0:400',
    ]);
  });

  test('zooming, which spreads the positions, separates them', () => {
    const at = (scale: number) => layoutEvents([ev('a', 100 * scale), ev('b', 110 * scale), ev('c', 120 * scale)], 8000, 30);
    expect(brief(at(1))).toEqual(['a@0:100', 'b@1:110+c']);
    expect(brief(at(8))).toEqual(['a@0:800', 'b@0:880', 'c@0:960']);
  });

  test('a chip stands before its hairline where the plot ends; an event outside the window has no chip', () => {
    expect(brief(layoutEvents([ev('a', 780), ev('out', 900), ev('before', -5)], 800, 30))).toEqual(['a@0:720']);
  });

  test('the edge indicators reserve the plot ends, so no in-window chip overlaps them (v1.11.1)', () => {
    // A left reservation: a chip at the very left staggers into the second row, one past it stays in the first.
    expect(brief(layoutEvents([ev('a', 10)], 800, 30, 2, 30, 0))).toEqual(['a@1:10']);
    expect(brief(layoutEvents([ev('a', 60)], 800, 30, 2, 30, 0))).toEqual(['a@0:60']);
    // A right reservation: a chip that would end inside the reserved end flips to before its hairline.
    expect(brief(layoutEvents([ev('a', 730)], 800, 30))).toEqual(['a@0:730']);
    expect(brief(layoutEvents([ev('a', 730)], 800, 30, 2, 0, 30))).toEqual(['a@0:670']);
    // Both reservations together keep both ends clear.
    expect(brief(layoutEvents([ev('a', 10), ev('b', 730)], 800, 30, 2, 30, 30))).toEqual(['a@1:10', 'b@0:670']);
  });

  test('a chip is as wide as its label needs, up to a longest chip', () => {
    // 12-pixel text since v2.0.0: 7.1 pixels a character and a longest chip
    // of 175 (they were 6.5 and 160 for 11-pixel text).
    expect(eventChipWidth('Review')).toBe(57);
    expect(eventChipWidth('x'.repeat(200))).toBe(175);
  });
});
