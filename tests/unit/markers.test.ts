import { describe, expect, test } from 'vitest';
import { makeRow, type RowData } from '../../src/dataset';
import { placedMarkers, placeMarker, pruneMarkers, removeMarker, type MarkerPositions } from '../../src/markers';

function rows(n: number): RowData[] {
  return Array.from({ length: n }, (_, i) => makeRow({ Key: `item-${i + 1}` }));
}

describe('marker numbering (FR-3, FR-5)', () => {
  test('a marker carries the global sequential number of its row', () => {
    const list = rows(5);
    const positions: MarkerPositions = new Map();
    placeMarker(positions, list[3], { x: 10, y: 20 });
    placeMarker(positions, list[0], { x: 1, y: 2 });
    const placed = placedMarkers(list, positions);
    expect(placed.map((m) => m.number)).toEqual([1, 4]);
    expect(placed.map((m) => m.row.values.Key)).toEqual(['item-1', 'item-4']);
  });

  test('numbers regenerate when rows before a marker are removed', () => {
    let list = rows(5);
    const positions: MarkerPositions = new Map();
    placeMarker(positions, list[4], { x: 0, y: 0 });
    placeMarker(positions, list[2], { x: 0, y: 0 });
    list = list.filter((_, i) => i !== 0 && i !== 1);
    pruneMarkers(positions, list);
    expect(placedMarkers(list, positions).map((m) => [m.row.values.Key, m.number])).toEqual([
      ['item-3', 1],
      ['item-5', 3],
    ]);
  });

  test('numbers regenerate when rows are added before a marker', () => {
    const list = rows(2);
    const positions: MarkerPositions = new Map();
    placeMarker(positions, list[1], { x: 0, y: 0 });
    list.unshift(makeRow({ Key: 'new' }));
    expect(placedMarkers(list, positions)[0].number).toBe(3);
  });

  test('removing a placed row prunes its marker; numbering stays continuous', () => {
    let list = rows(3);
    const positions: MarkerPositions = new Map();
    list.forEach((r, i) => placeMarker(positions, r, { x: i, y: i }));
    list = [list[0], list[2]];
    expect(pruneMarkers(positions, list)).toBe(1);
    expect(positions.size).toBe(2);
    expect(placedMarkers(list, positions).map((m) => m.number)).toEqual([1, 2]);
  });

  test('placing an already placed row moves its single marker', () => {
    const list = rows(2);
    const positions: MarkerPositions = new Map();
    placeMarker(positions, list[0], { x: 1, y: 1 });
    placeMarker(positions, list[0], { x: 5, y: 6 });
    const placed = placedMarkers(list, positions);
    expect(placed).toHaveLength(1);
    expect(placed[0].position).toEqual({ x: 5, y: 6 });
  });

  test('a marker takes its row colour, green by default', () => {
    const list = rows(2);
    list[1].colour = 'red';
    const positions: MarkerPositions = new Map();
    placeMarker(positions, list[0], { x: 0, y: 0 });
    placeMarker(positions, list[1], { x: 0, y: 0 });
    expect(placedMarkers(list, positions).map((m) => m.colour)).toEqual(['green', 'red']);
  });

  test('removeMarker removes only the given marker', () => {
    const list = rows(2);
    const positions: MarkerPositions = new Map();
    placeMarker(positions, list[0], { x: 0, y: 0 });
    placeMarker(positions, list[1], { x: 0, y: 0 });
    expect(removeMarker(positions, list[0])).toBe(true);
    expect(removeMarker(positions, list[0])).toBe(false);
    expect(placedMarkers(list, positions).map((m) => m.number)).toEqual([2]);
  });

  test('stored positions are copies, not shared references', () => {
    const list = rows(1);
    const positions: MarkerPositions = new Map();
    const p = { x: 1, y: 1 };
    placeMarker(positions, list[0], p);
    p.x = 99;
    const placed = placedMarkers(list, positions);
    placed[0].position.y = 42;
    expect(positions.get(list[0])).toEqual({ x: 1, y: 1 });
  });
});
