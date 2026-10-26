import { describe, expect, test } from 'vitest';
import { makeRow, type RowData } from '../../src/dataset';
import { areaGroups, groupedLabels } from '../../src/grouping';

function rows(areas: string[]): RowData[] {
  return areas.map((area, i) => makeRow({ ID: `R-${i + 1}`, Area: area }));
}

function labels(list: RowData[], vocabulary: string[]): string[] {
  const map = groupedLabels(list, 'Area', vocabulary);
  return list.map((r) => map.get(r)!);
}

describe('grouped numbering (FR-17)', () => {
  test('items are numbered within their area, groups in the order of the area list', () => {
    const list = rows(['South', 'North', 'South', 'North', 'East']);
    expect(labels(list, ['North', 'South', 'East'])).toEqual(['2.1', '1.1', '2.2', '1.2', '3.1']);
  });

  test('values not in the list follow in order of first appearance; items without an area come last', () => {
    const list = rows(['West', '', 'North', 'Centre', 'West', '  ']);
    expect(labels(list, ['North'])).toEqual(['2.1', '4.1', '1.1', '3.1', '2.2', '4.2']);
    expect(areaGroups(list, 'Area', ['North']).map((g) => [g.index, g.area, g.rows.length])).toEqual([
      [1, 'North', 1],
      [2, 'West', 2],
      [3, 'Centre', 1],
      [4, '', 2],
    ]);
  });

  test('only groups that hold items are counted, so group numbers stay continuous', () => {
    const list = rows(['C', 'A']);
    expect(labels(list, ['A', 'B', 'C'])).toEqual(['2.1', '1.1']);
  });

  test('area values are compared without surrounding white space', () => {
    const list = rows([' North', 'North ', 'North']);
    expect(labels(list, ['North'])).toEqual(['1.1', '1.2', '1.3']);
  });

  test('numbers regenerate on renumbering and deletion: they follow list order', () => {
    const list = rows(['A', 'B', 'A', 'A']);
    expect(labels(list, ['A', 'B'])).toEqual(['1.1', '2.1', '1.2', '1.3']);
    // Deleting the first item renumbers its group from 1.
    const rest = list.slice(1);
    expect(labels(rest, ['A', 'B'])).toEqual(['2.1', '1.1', '1.2']);
    // Changing an area moves the item into the other group.
    rest[1].values.Area = 'B';
    expect(labels(rest, ['A', 'B'])).toEqual(['2.1', '2.2', '1.1']);
  });

  test('every row gets exactly one distinct grouped number', () => {
    const list = rows(['A', 'B', '', 'C', 'A', '', 'B', 'D']);
    const all = labels(list, ['B', 'A']);
    expect(new Set(all).size).toBe(list.length);
    expect(all.every((l) => /^\d+\.\d+$/.test(l))).toBe(true);
  });

  test('an empty list has no groups', () => {
    expect(areaGroups([], 'Area', ['A'])).toEqual([]);
  });
});
