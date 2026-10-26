import * as XLSX from 'xlsx';
import { columnKeys } from './columns';


export interface ParseResult {
  headers: string[];
  rows: string[][];
}

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    const y = String(value.getUTCFullYear());
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value);
}

export function parseWorkbook(data: ArrayBuffer): ParseResult {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(data, { type: 'array' });
  } catch (e) {
    throw new ParseError(e instanceof Error ? e.message : String(e));
  }
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new ParseError('workbook has no sheets');
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new ParseError('first sheet is missing');
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: true,
    defval: '',
  });
  if (matrix.length === 0) {
    return { headers: [], rows: [] };
  }
  const headerRow = matrix[0];
  const width = Math.max(headerRow.length, ...matrix.map((r) => (Array.isArray(r) ? r.length : 0)));
  const headers: string[] = [];
  for (let c = 0; c < width; c++) {
    const header = cellToString(headerRow?.[c]).trim();
    headers.push(header);
  }
  const rows: string[][] = [];
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r];
    const out: string[] = new Array(width).fill('');
    if (Array.isArray(row)) {
      for (let c = 0; c < width; c++) {
        out[c] = cellToString(row[c]);
      }
    }
    rows.push(out);
  }
  return { headers, rows };
}

// Direct import (FR-1): every column of the file, keyed by unique column
// keys derived from the file's own headers, with all values as text.
export function importColumns(parse: ParseResult): { headers: string[]; rows: Record<string, string>[] } {
  const headers = columnKeys(parse.headers);
  const rows = parse.rows.map((raw) => {
    const values: Record<string, string> = {};
    headers.forEach((key, i) => {
      values[key] = raw[i] ?? '';
    });
    return values;
  });
  return { headers, rows };
}
