// Manual data entry (FR-9, FR-24, FR-30). Rows and columns can be added by
// hand, to an imported list or to a list started empty. A manual column has
// a stable internal key and an editable label; a manual row is an ordinary
// row that was not imported.

import { DUPLICATE_SEPARATOR } from './columns';

const MANUAL_PREFIX = `${DUPLICATE_SEPARATOR}manual${DUPLICATE_SEPARATOR}`;

export function isManualKey(key: string): boolean {
  return key.startsWith(MANUAL_PREFIX);
}

// A key for a new manual column that is not among the existing keys. Manual
// keys can never equal an imported key, which starts with header text.
export function newManualKey(existing: string[]): string {
  let n = 1;
  while (existing.includes(`${MANUAL_PREFIX}${n}`)) n += 1;
  return `${MANUAL_PREFIX}${n}`;
}

// Values of a new row: an empty value for every column.
export function emptyValues(headers: string[]): Record<string, string> {
  return Object.fromEntries(headers.map((h) => [h, '']));
}
