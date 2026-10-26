// Comparison of an exported file with the current work (FR-14). Items are
// paired by equal values of the identifier column, for display only: the
// comparison changes nothing. Values are compared after removing surrounding
// white space, and are otherwise exact (letter case included). An item whose
// identifier is empty, or occurs more than once on its own side, cannot be
// paired and is listed as such rather than guessed.

import type { Point } from './viewport';

export interface CompareItem {
  // The item's key on its side (a row identifier in the application, an
  // index in the file).
  key: string;
  identifier: string;
  number: number;
  label: string;
  position: Point | null;
}

export interface MatchedItem {
  current: CompareItem;
  file: CompareItem;
  // With a marker in the file: whether its position differs from the
  // current one (or the current item has no marker).
  positionDiffers: boolean;
}

export interface Comparison {
  // Paired items whose file item has a marker; its position can be adopted.
  matchedWithMarkers: MatchedItem[];
  // Paired items whose file item has no marker.
  matchedWithoutMarkers: MatchedItem[];
  fileOnly: CompareItem[];
  currentOnly: CompareItem[];
  // Items with an empty or repeated identifier, on either side.
  unpairable: { current: CompareItem[]; file: CompareItem[] };
}

// Positions closer than this, in image pixels, count as the same.
const SAME_POSITION = 0.5;

function samePosition(a: Point | null, b: Point | null): boolean {
  if (!a || !b) return a === b;
  return Math.abs(a.x - b.x) < SAME_POSITION && Math.abs(a.y - b.y) < SAME_POSITION;
}

function identifierCounts(items: CompareItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const id = item.identifier.trim();
    if (id !== '') counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

export function compareItems(current: CompareItem[], file: CompareItem[]): Comparison {
  const curCounts = identifierCounts(current);
  const fileCounts = identifierCounts(file);
  // An identifier pairs only when it occurs exactly once on each side where
  // it occurs; an empty one, or one repeated on either side, never pairs.
  const pairable = (id: string) => id !== '' && (curCounts.get(id) ?? 0) <= 1 && (fileCounts.get(id) ?? 0) <= 1;
  const fileById = new Map(file.map((item) => [item.identifier.trim(), item]));
  const result: Comparison = {
    matchedWithMarkers: [],
    matchedWithoutMarkers: [],
    fileOnly: [],
    currentOnly: [],
    unpairable: { current: [], file: [] },
  };
  for (const item of current) {
    const id = item.identifier.trim();
    if (!pairable(id)) {
      result.unpairable.current.push(item);
      continue;
    }
    const other = fileCounts.has(id) ? fileById.get(id)! : undefined;
    if (!other) result.currentOnly.push(item);
    else if (other.position) result.matchedWithMarkers.push({ current: item, file: other, positionDiffers: !samePosition(item.position, other.position) });
    else result.matchedWithoutMarkers.push({ current: item, file: other, positionDiffers: false });
  }
  for (const item of file) {
    const id = item.identifier.trim();
    if (!pairable(id)) result.unpairable.file.push(item);
    else if (!curCounts.has(id)) result.fileOnly.push(item);
  }
  return result;
}
