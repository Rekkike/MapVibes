import { describe, expect, test } from 'vitest';
import { compareItems, type CompareItem } from '../../src/reconcile';

function item(key: string, identifier: string, position: { x: number; y: number } | null = null, number = 1): CompareItem {
  return { key, identifier, number, label: identifier || `No. ${number}`, position };
}

const keys = (items: CompareItem[]) => items.map((i) => i.key);

describe('comparison with an exported file (FR-14)', () => {
  test('matched items whose file item has a marker; differing positions are flagged', () => {
    const r = compareItems(
      [item('c1', 'A-01', { x: 10, y: 10 }), item('c2', 'A-02', null), item('c3', 'A-03', { x: 5, y: 5 })],
      [item('f1', 'A-01', { x: 10.2, y: 9.9 }), item('f2', 'A-02', { x: 50, y: 60 }), item('f3', 'A-03', { x: 7, y: 5 })],
    );
    expect(r.matchedWithMarkers.map((m) => [m.current.key, m.file.key, m.positionDiffers])).toEqual([
      ['c1', 'f1', false],
      ['c2', 'f2', true],
      ['c3', 'f3', true],
    ]);
    expect(r.matchedWithoutMarkers).toEqual([]);
  });

  test('matched items whose file item has no marker', () => {
    const r = compareItems([item('c1', 'A-01', { x: 1, y: 1 }), item('c2', 'A-02')], [item('f1', 'A-01'), item('f2', 'A-02')]);
    expect(r.matchedWithoutMarkers.map((m) => [m.current.key, m.file.key])).toEqual([
      ['c1', 'f1'],
      ['c2', 'f2'],
    ]);
    expect(r.matchedWithMarkers).toEqual([]);
  });

  test('items present only in the file', () => {
    const r = compareItems([item('c1', 'A-01')], [item('f1', 'A-01'), item('f2', 'B-01', { x: 1, y: 2 }), item('f3', 'B-02')]);
    expect(keys(r.fileOnly)).toEqual(['f2', 'f3']);
  });

  test('items present only in the current work', () => {
    const r = compareItems([item('c1', 'A-01'), item('c2', 'C-01', { x: 3, y: 3 })], [item('f1', 'A-01')]);
    expect(keys(r.currentOnly)).toEqual(['c2']);
  });

  test('identifiers are compared without surrounding white space and otherwise exactly', () => {
    const r = compareItems([item('c1', ' A-01 '), item('c2', 'a-02')], [item('f1', 'A-01'), item('f2', 'A-02')]);
    expect(r.matchedWithoutMarkers.map((m) => m.current.key)).toEqual(['c1']);
    expect(keys(r.currentOnly)).toEqual(['c2']);
    expect(keys(r.fileOnly)).toEqual(['f2']);
  });

  test('empty and repeated identifiers are never guessed: they cannot be paired, on either side', () => {
    const r = compareItems(
      [item('c1', ''), item('c2', 'A-01'), item('c3', 'A-01'), item('c4', 'A-02')],
      [item('f1', 'A-01'), item('f2', '  '), item('f3', 'A-02'), item('f4', 'A-02')],
    );
    // A-01 is repeated in the current work and A-02 in the file: neither
    // pairs, on either side.
    expect(keys(r.unpairable.current)).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(keys(r.unpairable.file)).toEqual(['f1', 'f2', 'f3', 'f4']);
    expect(r.matchedWithMarkers).toEqual([]);
    expect(r.matchedWithoutMarkers).toEqual([]);
    expect(keys(r.fileOnly)).toEqual([]);
    expect(keys(r.currentOnly)).toEqual([]);
  });

  test('every item lands in exactly one group', () => {
    const current = [item('c1', 'A'), item('c2', 'B', { x: 1, y: 1 }), item('c3', 'C'), item('c4', ''), item('c5', 'E')];
    const file = [item('f1', 'A', { x: 2, y: 2 }), item('f2', 'B'), item('f3', 'D'), item('f4', 'E'), item('f5', 'E')];
    const r = compareItems(current, file);
    const cur = [...r.matchedWithMarkers, ...r.matchedWithoutMarkers].map((m) => m.current.key).concat(keys(r.currentOnly), keys(r.unpairable.current));
    const fil = [...r.matchedWithMarkers, ...r.matchedWithoutMarkers].map((m) => m.file.key).concat(keys(r.fileOnly), keys(r.unpairable.file));
    expect(cur.sort()).toEqual(keys(current));
    expect(fil.sort()).toEqual(keys(file));
  });

  test('the comparison does not change its inputs', () => {
    const current = [item('c1', 'A-01', { x: 1, y: 1 })];
    const file = [item('f1', 'A-01', { x: 9, y: 9 })];
    const copy = JSON.stringify([current, file]);
    compareItems(current, file);
    expect(JSON.stringify([current, file])).toBe(copy);
  });
});
