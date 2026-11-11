// Recognising an activities table in a PDF's text (FR-76). Pure: no DOM, no
// state, no I/O. The recognition is generic by construction: rows by the y
// coordinate, columns by x-start clusters, and each column classified by the
// shape of its cells only, through the shared date reader (FR-68). The origin
// system's header words are carried as the user's own words and are never
// matched against anything (hard constraint 5). Space-only and zero-height
// items are filtered first: the library emits them, and they would create
// phantom rows and columns (found by measurement).

import { readDate, type DateReading } from './dates';
import type { PdfTextItem, PdfTextPage } from './pdftext';

export type ColumnKind = 'text' | 'date' | 'percent' | 'number';

export interface TableColumn {
  index: number;
  header: string;
  kind: ColumnKind;
  xStart: number;
}

export type ActivityField = 'label' | 'start' | 'end' | 'progress' | 'duration';

// One parsed row of the table, before the review: the raw cells, and the
// fields as read. A date that cannot be read stays as typed (startText /
// endText), never guessed. dropped is set by the user in the review.
export interface ActivityDraft {
  cells: string[];
  label: string;
  start: string;
  end: string;
  duration: string;
  progress: number | null;
  startText: string | null;
  endText: string | null;
  dropped: boolean;
}

export interface ActivityTable {
  page: number;
  columns: TableColumn[];
  // The proposed role of each column, as a column index; the user confirms
  // or changes it in the assign step.
  mapping: Partial<Record<ActivityField, number>>;
  rows: ActivityDraft[];
}

export interface ActivityParseResult {
  // One entry per page that holds a table; empty when no page does ("no
  // table found" is then an honest, clear message, not an error).
  tables: ActivityTable[];
}

interface Row {
  y: number;
  items: PdfTextItem[];
}

// The items that carry text: space-only strings and zero-height boxes are
// layout artefacts, not cells.
function textItems(items: PdfTextItem[]): PdfTextItem[] {
  return items.filter((i) => i.str.trim() !== '' && i.h > 0);
}

// Groups items into rows by y, within half the item height, in reading order
// (the library's y grows downward here; either way the sort is stable).
function rowsOf(items: PdfTextItem[]): Row[] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: Row[] = [];
  for (const it of sorted) {
    const row = rows.find((r) => Math.abs(r.y - it.y) <= Math.max(4, it.h * 0.6));
    if (row) {
      row.items.push(it);
      row.y = (row.y * (row.items.length - 1) + it.y) / row.items.length;
    } else {
      rows.push({ y: it.y, items: [it] });
    }
  }
  for (const row of rows) {
    row.items.sort((a, b) => a.x - b.x);
  }
  return rows;
}

// The x-start clusters of the table's items: a gap wider than the threshold
// starts a new column. The threshold follows the text size, so a dense page
// still separates its columns.
function columnStartsOf(rows: Row[]): number[] {
  const hs = rows.flatMap((r) => r.items.map((i) => i.h)).sort((a, b) => a - b);
  const medianH = hs.length > 0 ? hs[Math.floor(hs.length / 2)] : 10;
  const threshold = Math.max(20, medianH * 2.5);
  const starts = rows.flatMap((r) => r.items.map((i) => i.x)).sort((a, b) => a - b);
  const out: number[] = [];
  for (const x of starts) {
    if (out.length === 0 || x - out[out.length - 1] > threshold) {
      out.push(x);
    }
  }
  return out;
}

function columnOf(starts: number[], it: PdfTextItem): number {
  let best = 0;
  let bestD = Infinity;
  starts.forEach((s, i) => {
    const d = Math.abs(s - it.x);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

// The cell grid of the rows: each item's text lands in its column; several
// items in one cell (wrapped text) join with a space, in x order.
function cellGrid(rows: Row[], starts: number[]): string[][] {
  return rows.map((r) => {
    const cells: string[] = Array.from({ length: starts.length }, () => '');
    for (const it of r.items) {
      const c = columnOf(starts, it);
      cells[c] = cells[c] === '' ? it.str.trim() : `${cells[c]} ${it.str.trim()}`;
    }
    return cells;
  });
}

// The table region: the run of rows holding at least two items; the first of
// them is the header row. Prose lines hold one item and fall outside.
function tableRegion(rows: Row[]): { header: Row; body: Row[] } | null {
  const multi = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.items.length >= 2);
  if (multi.length === 0) {
    return null;
  }
  const start = multi[0].i;
  const region = rows.slice(start).filter((r) => r.items.length >= 2);
  if (region.length < 2) {
    return null;
  } // a header alone is no table
  return { header: region[0], body: region.slice(1) };
}

// A column's kind from the shape of its body cells only.
export function classifyColumn(cells: string[]): ColumnKind {
  const nonEmpty = cells.filter((c) => c.trim() !== '');
  if (nonEmpty.length === 0) {
    return 'text';
  }
  const dates = nonEmpty.filter((c) => readDate(c).kind === 'date').length;
  const percents = nonEmpty.filter((c) => /^\d{1,3}\s?%$/.test(c.trim())).length;
  const numbers = nonEmpty.filter((c) => /^-?\d+([.,]\d+)?\s*(\p{L}{1,4})?$/u.test(c.trim())).length;
  if (dates > 0 && dates >= nonEmpty.length * 0.6) {
    return 'date';
  }
  if (percents > 0 && percents >= nonEmpty.length * 0.5) {
    return 'percent';
  }
  if (numbers > 0 && numbers >= nonEmpty.length * 0.5) {
    return 'number';
  }
  return 'text';
}

// The proposed mapping: the label is the first text column, the start and
// end the first two date columns, the progress the percent column, the
// duration the remaining number column. Nothing reads the header words.
export function proposeMapping(columns: TableColumn[]): Partial<Record<ActivityField, number>> {
  const mapping: Partial<Record<ActivityField, number>> = {};
  const label = columns.find((c) => c.kind === 'text');
  if (label) {
    mapping.label = label.index;
  }
  const dates = columns.filter((c) => c.kind === 'date');
  if (dates[0]) {
    mapping.start = dates[0].index;
  }
  if (dates[1]) {
    mapping.end = dates[1].index;
  }
  const progress = columns.find((c) => c.kind === 'percent');
  if (progress) {
    mapping.progress = progress.index;
  }
  const number = columns.find((c) => c.kind === 'number' && c.index !== mapping.duration);
  if (number && mapping.start !== number.index && mapping.end !== number.index) {
    mapping.duration = number.index;
  }
  return mapping;
}

function progressOf(cell: string): number | null {
  const m = /^(\d{1,3})\s?%$/.exec(cell.trim());
  if (!m) {
    return null;
  }
  const n = Number(m[1]);
  return n >= 0 && n <= 100 ? n : null;
}

// Parses the rows of a recognised table into activity drafts, under a mapping
// (column index per role). A row is a candidate when any of its cells is
// non-empty; fully empty rows are not activities and are left out.
export function parseRows(grid: string[][], mapping: Partial<Record<ActivityField, number>>): ActivityDraft[] {
  const col = (row: string[], field: ActivityField) => (mapping[field] === undefined ? '' : (row[mapping[field]] ?? ''));
  const out: ActivityDraft[] = [];
  for (const cells of grid) {
    if (cells.every((c) => c.trim() === '')) {
      continue;
    }
    const start = col(cells, 'start').trim();
    const end = col(cells, 'end').trim();
    const startReading: DateReading = readDate(start);
    const endReading: DateReading = readDate(end);
    out.push({
      cells,
      label: col(cells, 'label').trim(),
      start,
      end,
      duration: col(cells, 'duration').trim(),
      progress: mapping.progress === undefined ? null : progressOf(col(cells, 'progress')),
      startText: startReading.kind === 'text' ? start : null,
      endText: endReading.kind === 'text' ? end : null,
      dropped: false,
    });
  }
  return out;
}

// Recognises the table of one page, or null when the page holds none.
export function recogniseTable(page: number, items: PdfTextItem[]): ActivityTable | null {
  const rows = rowsOf(textItems(items));
  const region = tableRegion(rows);
  if (!region) {
    return null;
  }
  const tableRows = [region.header, ...region.body];
  const starts = columnStartsOf(tableRows);
  if (starts.length < 2) {
    return null;
  }
  const grid = cellGrid(tableRows, starts);
  const header = grid[0];
  const body = grid.slice(1);
  const columns: TableColumn[] = starts.map((xStart, index) => ({
    index,
    header: header[index] ?? '',
    kind: classifyColumn(body.map((r) => r[index])),
    xStart,
  }));
  const mapping = proposeMapping(columns);
  return { page, columns, mapping, rows: parseRows(body, mapping) };
}

// The whole document: one table per page that holds one. A repeated header
// row on a later page (the same header cells as an earlier table) is skipped,
// not parsed as data.
export function parsePdfPages(pages: PdfTextPage[]): ActivityParseResult {
  const tables: ActivityTable[] = [];
  const headerKeys: string[] = [];
  for (let p = 0; p < pages.length; p++) {
    const table = recogniseTable(p + 1, pages[p]);
    if (!table) {
      continue;
    }
    const key = table.columns.map((c) => c.header).join('|');
    if (headerKeys.includes(key)) {
      // A repeated header page: its body rows continue the earlier table.
      const first = tables[tables.length - 1];
      if (first && first.page !== table.page) {
        first.rows.push(...table.rows);
        continue;
      }
    }
    headerKeys.push(key);
    tables.push(table);
  }
  return { tables };
}
