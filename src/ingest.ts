import * as XLSX from 'xlsx';


export type ColumnRole = 'none' | 'identifier' | 'start' | 'end' | 'area';

export interface ColumnMapping {
  header: string;
  keep: boolean;
  role: ColumnRole;
}

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

export interface AppliedMapping {
  keptIndices: number[];
  mapping: ColumnMapping[];
}

export function applyMapping(
  parse: ParseResult,
  mapping: ColumnMapping[],
): { headers: string[]; rows: { values: Record<string, string> }[] } {
  if (mapping.length !== parse.headers.length) {
    throw new Error('mapping length does not match parsed headers');
  }
  const keptIndices: number[] = [];
  parse.headers.forEach((_h, i) => {
    if (mapping[i].keep) keptIndices.push(i);
  });
  const headers = keptIndices.map((i) => parse.headers[i]);
  const rows = parse.rows.map((raw) => {
    const values: Record<string, string> = {};
    keptIndices.forEach((srcIdx, outIdx) => {
      values[headers[outIdx]] = raw[srcIdx] ?? '';
    });
    return { values };
  });
  return { headers, rows };
}
