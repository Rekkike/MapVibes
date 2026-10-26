import { describe, expect, test } from 'vitest';
import { addValue, collectValues, hasValue, mergeValues, moveValue, parseValueList, removeValue, renameValue } from '../../src/vocab';

describe('user-managed vocabularies (FR-32, FR-33)', () => {
  test('values are added once, trimmed, and never empty', () => {
    let list: string[] = [];
    list = addValue(list, ' Alpha ');
    list = addValue(list, 'Beta');
    list = addValue(list, 'Alpha');
    list = addValue(list, '   ');
    expect(list).toEqual(['Alpha', 'Beta']);
    expect(hasValue(list, ' Beta ')).toBe(true);
    expect(hasValue(list, '')).toBe(false);
  });

  test('values are removed, renamed, and reordered', () => {
    const list = ['A', 'B', 'C'];
    expect(removeValue(list, 'B')).toEqual(['A', 'C']);
    expect(renameValue(list, 'B', ' Bee ')).toEqual({ list: ['A', 'Bee', 'C'], renamed: true });
    expect(renameValue(list, 'B', 'C')).toEqual({ list, renamed: false });
    expect(renameValue(list, 'B', '')).toEqual({ list, renamed: false });
    expect(renameValue(list, 'Z', 'Y')).toEqual({ list, renamed: false });
    expect(moveValue(list, 'C', -1)).toEqual(['A', 'C', 'B']);
    expect(moveValue(list, 'A', -1)).toBe(list);
    expect(moveValue(list, 'C', 1)).toBe(list);
  });

  test('the values present in a column are collected in first-seen order and merged without duplicates', () => {
    const rows: Array<{ values: Record<string, string> }> = [{ values: { G: 'North' } }, { values: { G: '' } }, { values: { G: 'South' } }, { values: { G: ' North ' } }, { values: {} }];
    expect(collectValues(rows, 'G')).toEqual(['North', 'South']);
    expect(mergeValues(['East', 'South'], ['North', 'South'])).toEqual(['East', 'South', 'North']);
  });

  test('stored lists are validated', () => {
    expect(parseValueList(['A', 'B'])).toEqual(['A', 'B']);
    expect(parseValueList(['A', 'A'])).toBeNull();
    expect(parseValueList(['A', ''])).toBeNull();
    expect(parseValueList(['A', 3])).toBeNull();
    expect(parseValueList('A')).toBeNull();
  });
});

describe('status vocabulary (FR-33)', () => {
  const isSymbol = (v: unknown) => typeof v === 'string' && ['circle', 'square'].includes(v);

  test('statuses are added once with the default symbol, renamed, reordered, given symbols, and removed', async () => {
    const { addStatus, moveStatus, removeStatus, renameStatus, setStatusSymbol, statusSymbol } = await import('../../src/vocab');
    let s = addStatus([], ' First ', 'circle');
    s = addStatus(s, 'Second', 'circle');
    s = addStatus(s, 'First', 'square');
    expect(s).toEqual([
      { name: 'First', symbol: 'circle' },
      { name: 'Second', symbol: 'circle' },
    ]);
    s = setStatusSymbol(s, 'Second', 'square');
    expect(statusSymbol(s, ' Second ')).toBe('square');
    expect(statusSymbol(s, 'Other')).toBeNull();
    const r = renameStatus(s, 'Second', 'Later');
    expect([r.renamed, r.name, r.statuses[1]]).toEqual([true, 'Later', { name: 'Later', symbol: 'square' }]);
    expect(renameStatus(s, 'Second', 'First').renamed).toBe(false);
    expect(moveStatus(r.statuses, 'Later', -1).map((x) => x.name)).toEqual(['Later', 'First']);
    expect(moveStatus(r.statuses, 'First', -1)).toBe(r.statuses);
    expect(removeStatus(r.statuses, 'First')).toEqual([{ name: 'Later', symbol: 'square' }]);
  });

  test('stored statuses are validated', async () => {
    const { parseStatuses } = await import('../../src/vocab');
    expect(parseStatuses([{ name: 'A', symbol: 'circle' }], isSymbol)).toEqual([{ name: 'A', symbol: 'circle' }]);
    expect(parseStatuses([{ name: 'A', symbol: 'star' }], isSymbol)).toBeNull();
    expect(parseStatuses([{ name: 'A', symbol: 'circle' }, { name: 'A', symbol: 'square' }], isSymbol)).toBeNull();
    expect(parseStatuses([{ name: ' ', symbol: 'circle' }], isSymbol)).toBeNull();
    expect(parseStatuses({}, isSymbol)).toBeNull();
  });
});
