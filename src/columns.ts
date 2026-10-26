// Columns (FR-1). Every column of an imported file is kept and shown under
// the file's own header text, as-is. Internally each column has a unique key:
// the header text itself, or, for a repeated header, the header text followed
// by a separator and an occurrence number, so that columns sharing a header
// keep their values apart. The separator is a control-picture character that
// does not occur in ordinary header text and is never displayed.

export const DUPLICATE_SEPARATOR = '␟';

export function columnKeys(headers: string[]): string[] {
  const used = new Set<string>();
  const counts = new Map<string, number>();
  return headers.map((header) => {
    const n = (counts.get(header) ?? 0) + 1;
    counts.set(header, n);
    let key = n === 1 ? header : `${header}${DUPLICATE_SEPARATOR}${n}`;
    while (used.has(key)) key = `${key}${DUPLICATE_SEPARATOR}`;
    used.add(key);
    return key;
  });
}

// The header text shown for a column key; an empty header is shown with the
// given placeholder text.
export function columnLabel(key: string, untitled: string): string {
  const header = key.split(DUPLICATE_SEPARATOR)[0];
  return header === '' ? untitled : header;
}
