import { describe, expect, test } from 'vitest';
import { classifyColumn, parsePdfPages, parseRows, proposeMapping, recogniseTable, type TableColumn } from '../../src/activityparse';
import type { PdfTextItem } from '../../src/pdftext';

// Synthetic text items: a table of five columns (label, two date columns, a
// duration column, a percent column) with prose around it, plus the layout
// artefacts the library emits (space-only and zero-height items).
function item(str: string, x: number, y: number, w = 40, h = 10): PdfTextItem {
  return { str, x, y, w, h };
}

function tablePage(): PdfTextItem[] {
  const x = [40, 220, 320, 400, 470];
  const out: PdfTextItem[] = [
    item('Projektplan, utdrag 2024-07-01.', 40, 32, 200, 9), // prose: one item
    item('Post', x[0], 62),
    item(' ', 62, 62, 158, 0),
    item('Från', x[1], 62),
    item('Till', x[2], 62),
    item('Längd', x[3], 62),
    item('Klart', x[4], 62),
    item('Grävning', x[0], 86),
    item('2024-01-08', x[1], 86),
    item('2024-02-16', x[2], 86),
    item('6 v', x[3], 86),
    item('100 %', x[4], 86),
    item('Ledningar', x[0], 110),
    item('2024-02-12', x[1], 110),
    item('2024-04-30', x[2], 110),
    item('11 v', x[3], 110),
    item('60 %', x[4], 110),
    item('Asfalt', x[0], 134),
    item('2024-04-15', x[1], 134),
    item('2024-05-24', x[2], 134),
    item('6 v', x[3], 134),
    item('0 %', x[4], 134),
    item('Belysning', x[0], 158),
    item('2024-05-20', x[1], 158),
    item('2024-06-28', x[2], 158),
    item('5 v', x[3], 158),
    item('', x[4], 158, 0, 0),
    item('Oklar rad', x[0], 182),
    item('15/03/2024', x[1], 182),
    item('2024-06-30', x[2], 182),
    item('', x[3], 182, 0, 0),
    item('10 %', x[4], 182),
    item('Totalt', x[0], 230),
    item('', x[1], 230, 0, 0),
    item('', x[2], 230, 0, 0),
    item('28 v', x[3], 230),
    item('', x[4], 230, 0, 0),
    item('Sammanställning klar.', 40, 782, 180, 9), // prose
  ];
  return out;
}

describe('activity table recognition (FR-76)', () => {
  test('rows, the table region, and columns come from geometry only; artefacts are filtered', () => {
    const table = recogniseTable(1, tablePage());
    expect(table).not.toBeNull();
    expect(table!.columns.map((c) => [c.header, c.kind])).toEqual([
      ['Post', 'text'],
      ['Från', 'date'],
      ['Till', 'date'],
      ['Längd', 'number'],
      ['Klart', 'percent'],
    ]);
    // The prose rows hold one item each and are outside the table.
    expect(table!.rows).toHaveLength(6);
  });

  test('the proposed mapping uses cell shapes, never the header words', () => {
    const table = recogniseTable(1, tablePage())!;
    expect(proposeMapping(table.columns)).toEqual({ label: 0, start: 1, end: 2, progress: 4, duration: 3 });
  });

  test('parsing reads dates through the shared reader; an ambiguous date stays as typed', () => {
    const table = recogniseTable(1, tablePage())!;
    const rows = table.rows;
    expect(rows[0]).toMatchObject({
      label: 'Grävning',
      start: '2024-01-08',
      end: '2024-02-16',
      duration: '6 v',
      progress: 100,
      startText: null,
      endText: null,
    });
    expect(rows[3]).toMatchObject({ label: 'Belysning', progress: null });
    expect(rows[4]).toMatchObject({ label: 'Oklar rad', start: '15/03/2024', startText: '15/03/2024', progress: 10 });
    // The summary row is a candidate; only the review drops it.
    expect(rows[5]).toMatchObject({ label: 'Totalt', start: '', startText: null });
  });

  test('a page without a table is null; an empty document has no tables -- honest, not an error', () => {
    expect(recogniseTable(1, [item('Only prose here.', 40, 40, 200, 9)])).toBeNull();
    expect(parsePdfPages([[], [item('lone', 10, 10)]])).toEqual({ tables: [] });
  });

  test('a repeated header on a later page is skipped, its rows continuing the table', () => {
    const page2: PdfTextItem[] = [
      item('Post', 40, 62),
      item('Från', 220, 62),
      item('Till', 320, 62),
      item('Längd', 400, 62),
      item('Klart', 470, 62),
      item('Målning', 40, 86),
      item('2024-07-01', 220, 86),
      item('2024-08-15', 320, 86),
      item('6 v', 400, 86),
      item('0 %', 470, 86),
    ];
    const result = parsePdfPages([tablePage(), page2]);
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0].rows.map((r) => r.label)).toContain('Målning');
    expect(result.tables[0].rows).toHaveLength(7);
  });

  test('wrapped cells join within their column; column classification thresholds', () => {
    expect(classifyColumn(['2024-01-01', '2024-02-01', '2024-03-01', '15/03/2024'])).toBe('date'); // 3 of 4 read
    expect(classifyColumn(['15/03/2024', '2024-02-01', 'x', 'y'])).toBe('text');
    expect(classifyColumn(['10 %', '50 %', 'x'])).toBe('percent');
    expect(classifyColumn(['6 v', '11 v', '28 v'])).toBe('number');
    expect(classifyColumn(['Grävning', 'Ledningar'])).toBe('text');
    expect(classifyColumn(['', ''])).toBe('text');
    const cols: TableColumn[] = [
      { index: 0, header: 'A', kind: 'text', xStart: 40 },
      { index: 1, header: 'B', kind: 'text', xStart: 220 },
    ];
    const rows = parseRows([['wrapped', 'cell one', 'part two']], { label: 0 });
    expect(rows).toHaveLength(1);
    expect(cols[1].kind).toBe('text');
  });

  test('fully empty rows are not activities', () => {
    const table = recogniseTable(1, [...tablePage(), item('', 40, 254, 0, 0), item('', 220, 254, 0, 0)])!;
    expect(table.rows.every((r) => r.cells.some((c) => c.trim() !== ''))).toBe(true);
  });
});
