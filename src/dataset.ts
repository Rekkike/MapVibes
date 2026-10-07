export type RowColour = 'green' | 'blue' | 'yellow' | 'red';

export const COLOURS: RowColour[] = ['green', 'blue', 'yellow', 'red'];

export interface RowData {
  values: Record<string, string>;
  colour: RowColour;
}

export interface NumberedRow {
  row: RowData;
  number: number;
}

export function numberRows(rows: RowData[]): NumberedRow[] {
  return rows.map((row, i) => ({ row, number: i + 1 }));
}

export function renumber(rows: RowData[]): void {
  numberRows(rows);
}

export type SortDirection = 'asc' | 'desc';

export function sortRows(
  rows: RowData[],
  header: string,
  direction: SortDirection,
): RowData[] {
  const copy = rows.slice();
  copy.sort((a, b) => {
    const av = a.values[header] ?? '';
    const bv = b.values[header] ?? '';
    const cmp = av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' });
    return direction === 'asc' ? cmp : -cmp;
  });
  return copy;
}

export function makeRow(values: Record<string, string>): RowData {
  return { values, colour: 'green' };
}

export interface Counters {
  retained: number;
  removed: number;
}

export function counters(ingestedTotal: number, retained: number): Counters {
  return { retained, removed: ingestedTotal - retained };
}

export interface ValueFilter {
  kind: 'all' | 'empty' | 'nonempty' | 'contains';
  header: string;
  text: string;
}

export const NO_FILTER: ValueFilter = { kind: 'all', header: '', text: '' };

export function applyFilter(rows: NumberedRow[], filter: ValueFilter): NumberedRow[] {
  if (filter.kind === 'all' || filter.header === '') return rows;
  const value = (r: RowData) => r.values[filter.header] ?? '';
  switch (filter.kind) {
    case 'empty':
      return rows.filter((n) => value(n.row).trim() === '');
    case 'nonempty':
      return rows.filter((n) => value(n.row).trim() !== '');
    case 'contains':
      return rows.filter((n) => value(n.row).toLowerCase().includes(filter.text.toLowerCase()));
  }
}
