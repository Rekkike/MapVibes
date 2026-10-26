// Marker model (FR-5, FR-18). A marker is the placement of one row on the
// background image, stored in image coordinates. Its number is not stored:
// it is always the row's global sequential number (FR-3), so markers
// renumber together with the list.

import { numberRows, type NumberedRow, type RowColour, type RowData } from './dataset';
import type { Point } from './viewport';
import type { MarkerSymbol } from './symbols';

export type MarkerPositions = Map<RowData, Point>;

// Marker symbol library (FR-26): the shape of a marker, chosen per marker and
// independent of its colour. Circle is the default.
export type MarkerShape = 'circle' | 'square' | 'diamond' | 'triangle' | 'hexagon';

export const SHAPES: MarkerShape[] = ['circle', 'square', 'diamond', 'triangle', 'hexagon'];

export const DEFAULT_SHAPE: MarkerShape = 'circle';

// The symbol chosen per marker (a shape or an icon, FR-26).
export type MarkerShapes = Map<RowData, MarkerSymbol>;

export function isShape(value: unknown): value is MarkerShape {
  return typeof value === 'string' && (SHAPES as string[]).includes(value);
}

export interface PlacedMarker {
  row: RowData;
  number: number;
  // The number as shown (FR-17).
  label: string;
  colour: RowColour;
  shape: MarkerSymbol;
  position: Point;
}

// The numbers are the rows' sequential numbers, unless given (the exported
// viewer shows the numbers of the presentation, FR-38).
export function placedMarkers(rows: RowData[], positions: MarkerPositions, shapes: MarkerShapes = new Map(), numbered: NumberedRow[] = numberRows(rows)): PlacedMarker[] {
  const out: PlacedMarker[] = [];
  for (const { row, number, label } of numbered) {
    const position = positions.get(row);
    if (position) out.push({ row, number, label, colour: row.colour, shape: shapes.get(row) ?? DEFAULT_SHAPE, position: { ...position } });
  }
  return out;
}

// Places a row's marker, or moves it if the row is already placed: each row
// has at most one marker.
export function placeMarker(positions: MarkerPositions, row: RowData, position: Point): void {
  positions.set(row, { x: position.x, y: position.y });
}

export function removeMarker(positions: MarkerPositions, row: RowData): boolean {
  return positions.delete(row);
}

// Drops the markers of rows that are no longer in the list (for example after
// bulk deletion); returns the number of markers removed.
export function pruneMarkers(positions: MarkerPositions, rows: RowData[]): number {
  const present = new Set(rows);
  let removed = 0;
  for (const row of [...positions.keys()]) {
    if (!present.has(row)) {
      positions.delete(row);
      removed += 1;
    }
  }
  return removed;
}
