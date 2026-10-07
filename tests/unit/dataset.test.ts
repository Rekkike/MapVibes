import { describe, expect, test } from 'vitest';
import { applyFilter, counters, makeRow, numberRows, sortRows, type ValueFilter } from '../../src/dataset';

describe('numbering (FR-3)', () => {
  test('assigns sequential numbers starting at 1', () => {
    const rows = [makeRow({}), makeRow({}), makeRow({})];
    const numbered = numberRows(rows);
    expect(numbered.map((n) => n.number)).toEqual([1, 2, 3]);
  });

  test('numbers an empty list without error', () => {
    expect(numberRows([])).toEqual([]);
  });
});

describe('renumbering after removal (FR-3)', () => {
  test('the sequence remains continuous when rows are removed', () => {
    let rows = [makeRow({ ID: 'a' }), makeRow({ ID: 'b' }), makeRow({ ID: 'c' }), makeRow({ ID: 'd' })];
    expect(numberRows(rows).map((n) => n.number)).toEqual([1, 2, 3, 4]);
    rows = rows.filter((_r, i) => i !== 1);
    expect(numberRows(rows).map((n) => n.number)).toEqual([1, 2, 3]);
    expect(numberRows(rows)[1].row.values.ID).toBe('c');
  });

  test('the sequence remains continuous when a middle row is removed and the list is renumbered twice', () => {
    let rows = [makeRow({ ID: 'a' }), makeRow({ ID: 'b' }), makeRow({ ID: 'c' })];
    rows = rows.filter((_r, i) => i !== 1);
    rows = rows.filter((_r, i) => i !== 0);
    expect(numberRows(rows).map((n) => n.number)).toEqual([1]);
  });
});

describe('running counts (FR-2)', () => {
  test('counters reflect retained and removed rows', () => {
    expect(counters(10, 7)).toEqual({ retained: 7, removed: 3 });
    expect(counters(7, 7)).toEqual({ retained: 7, removed: 0 });
    expect(counters(0, 0)).toEqual({ retained: 0, removed: 0 });
  });
});

describe('sorting (FR-2)', () => {
  const rows = [
    makeRow({ ID: 'b', Note: 'zebra' }),
    makeRow({ ID: 'a', Note: 'apple' }),
    makeRow({ ID: 'c', Note: 'melon' }),
  ];

  test('sorts ascending by a column', () => {
    expect(sortRows(rows, 'ID', 'asc').map((r) => r.values.ID)).toEqual(['a', 'b', 'c']);
  });

  test('sorts descending by a column', () => {
    expect(sortRows(rows, 'ID', 'desc').map((r) => r.values.ID)).toEqual(['c', 'b', 'a']);
  });

  test('does not mutate the input array', () => {
    sortRows(rows, 'ID', 'desc');
    expect(rows[0].values.ID).toBe('b');
  });
});

describe('filtering (FR-2)', () => {
  const rows = numberRows([
    makeRow({ ID: 'a', Note: 'alpha' }),
    makeRow({ ID: 'b', Note: '' }),
    makeRow({ ID: 'c', Note: 'beta' }),
  ]);

  test('filter all keeps every row', () => {
    const f: ValueFilter = { kind: 'all', header: 'Note', text: '' };
    expect(applyFilter(rows, f)).toHaveLength(3);
  });

  test('filter empty keeps only rows with empty cells in the chosen column', () => {
    const f: ValueFilter = { kind: 'empty', header: 'Note', text: '' };
    expect(applyFilter(rows, f).map((n) => n.row.values.ID)).toEqual(['b']);
  });

  test('filter non-empty keeps only rows with non-empty cells in the chosen column', () => {
    const f: ValueFilter = { kind: 'nonempty', header: 'Note', text: '' };
    expect(applyFilter(rows, f).map((n) => n.row.values.ID)).toEqual(['a', 'c']);
  });

  test('filter contains matches text case-insensitively', () => {
    const f: ValueFilter = { kind: 'contains', header: 'Note', text: 'ALPH' };
    expect(applyFilter(rows, f).map((n) => n.row.values.ID)).toEqual(['a']);
  });

  test('a filter without a chosen column keeps every row', () => {
    const f: ValueFilter = { kind: 'empty', header: '', text: '' };
    expect(applyFilter(rows, f)).toHaveLength(3);
  });
});
