import { describe, expect, test } from 'vitest';
import { makeRow, type RowData } from '../../src/dataset';
import { areaGroups, programGroups, programLabels } from '../../src/grouping';

function rows(values: string[], key = 'Prog'): RowData[] {
  return values.map((v, i) => makeRow({ ID: `R-${i + 1}`, [key]: v }));
}

function labels(list: RowData[], vocabulary: string[]): string[] {
  const map = programLabels(list, 'Prog', vocabulary);
  return list.map((r) => map.get(r)!);
}

describe('grouped numbering by program (FR-17, FR-43)', () => {
  test('items in a program are numbered within it, programs in the order of the program list', () => {
    const list = rows(['P-B', 'P-A', 'P-B', 'P-A', 'P-C']);
    expect(labels(list, ['P-A', 'P-B', 'P-C'])).toEqual(['2.1', '1.1', '2.2', '1.2', '3.1']);
  });

  test('items without a program are numbered 1, 2, 3 among themselves', () => {
    const list = rows(['', 'P-A', '', '  ', 'P-A', '']);
    expect(labels(list, ['P-A'])).toEqual(['1', '1.1', '2', '3', '1.2', '4']);
  });

  test('program values not in the list follow in order of first appearance; only programs with items count', () => {
    const list = rows(['P-X', '', 'P-A', 'P-Y', 'P-X']);
    expect(labels(list, ['P-Q', 'P-A'])).toEqual(['2.1', '1', '1.1', '3.1', '2.2']);
    expect(programGroups(list, 'Prog', ['P-Q', 'P-A']).map((g) => [g.index, g.program, g.rows.length])).toEqual([
      [1, 'P-A', 1],
      [2, 'P-X', 2],
      [3, 'P-Y', 1],
    ]);
  });

  test('program values are compared without surrounding white space', () => {
    expect(labels(rows([' P-A', 'P-A ', 'P-A']), ['P-A'])).toEqual(['1.1', '1.2', '1.3']);
  });

  test('numbers regenerate on deletion and on a change of program; they follow list order', () => {
    const list = rows(['P-A', '', 'P-A', '']);
    expect(labels(list, ['P-A'])).toEqual(['1.1', '1', '1.2', '2']);
    const rest = list.slice(1);
    expect(labels(rest, ['P-A'])).toEqual(['1', '1.1', '2']);
    rest[0].values.Prog = 'P-A';
    expect(labels(rest, ['P-A'])).toEqual(['1.1', '1.2', '1']);
  });

  test('every number is unique, whatever the mix', () => {
    const list = rows(['P-A', '', 'P-B', '', 'P-A', 'P-C', '', 'P-B']);
    const all = labels(list, ['P-B']);
    expect(new Set(all).size).toBe(list.length);
    expect(all.every((l) => /^\d+(\.\d+)?$/.test(l))).toBe(true);
  });

  test('without any program, the numbers are the plain running numbers', () => {
    expect(labels(rows(['', '', '']), [])).toEqual(['1', '2', '3']);
  });
});

describe('area groups of the grouped list view (FR-17)', () => {
  test('values in the order of the list, then others by first appearance, then the items without a value', () => {
    const list = rows(['West', '', 'North', 'Centre', 'West', '  '], 'Area');
    expect(areaGroups(list, 'Area', ['North']).map((g) => [g.index, g.area, g.rows.length])).toEqual([
      [1, 'North', 1],
      [2, 'West', 2],
      [3, 'Centre', 1],
      [4, '', 2],
    ]);
  });

  test('an empty list has no groups', () => {
    expect(areaGroups([], 'Area', ['A'])).toEqual([]);
  });
});
