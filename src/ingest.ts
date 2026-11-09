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

// A date cell (FR-68) is the calendar date it shows in the spreadsheet, as
// an ISO date, with the time of day when it has one. The reader gives the
// cell's wall-clock date and time in local time, so the local getters return
// exactly what the spreadsheet shows, whatever the time zone.
export function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    const two = (n: number) => String(n).padStart(2, '0');
    const date = `${String(value.getFullYear()).padStart(4, '0')}-${two(value.getMonth() + 1)}-${two(value.getDate())}`;
    const [h, m] = [value.getHours(), value.getMinutes()];
    return h === 0 && m === 0 ? date : `${date} ${two(h)}:${two(m)}`;
  }
  return String(value);
}

export function parseWorkbook(data: ArrayBuffer): ParseResult {
  let workbook: XLSX.WorkBook;
  try {
    // As bytes, so that the reader recognises a text file's byte order mark
    // whatever the realm of the buffer.
    // Date cells as dates, not as their serial numbers (FR-68); a text
    // file's values exactly as typed, never converted into numbers or dates
    // by guessing (FR-1, FR-68).
    workbook = XLSX.read(new Uint8Array(data), { type: 'array', cellDates: true, raw: true });
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
