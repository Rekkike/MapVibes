import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyMapping, ParseError, parseWorkbook, type ColumnMapping } from '../../src/ingest';

const fixturePath = join(process.cwd(), 'example-data/example.xlsx');

function loadFixture(): ArrayBuffer {
  const buf = readFileSync(fixturePath);
  const ab = new ArrayBuffer(buf.byteLength);
  new Uint8Array(ab).set(buf);
  return ab;
}

describe('ingestion (FR-1)', () => {
  test('parses the example workbook headers and rows as generic text', () => {
    const result = parseWorkbook(loadFixture());
    expect(result.headers).toEqual(['ID', 'Start', 'End', 'Group', 'Note']);
    expect(result.rows).toHaveLength(5);
    expect(result.rows[0]).toEqual(['A-01', '2024-01-05', '2024-02-01', 'North', 'Alpha item']);
    expect(result.rows[1][2]).toBe('');
  });

  test('treats all cell values as strings', () => {
    const result = parseWorkbook(loadFixture());
    for (const row of result.rows) {
      for (const cell of row) expect(typeof cell).toBe('string');
    }
  });

  test('preserves empty cells in the middle of a row', () => {
    const result = parseWorkbook(loadFixture());
    expect(result.rows[2][1]).toBe('');
    expect(result.rows[2][3]).toBe('South');
  });

  test('throws ParseError on a payload the spreadsheet library cannot parse', () => {
    const bytes = new TextEncoder().encode('<html><body>no table here</body></html>');
    const ab = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(ab).set(bytes);
    expect(() => parseWorkbook(ab)).toThrow(ParseError);
  });
});

describe('header mapping (FR-1)', () => {
  test('hidden columns are excluded from the imported rows', () => {
    const parse = {
      headers: ['ID', 'Start', 'End', 'Group', 'Note'],
      rows: [['A-01', '2024-01-05', '2024-02-01', 'North', 'Alpha item']],
    };
    const mapping: ColumnMapping[] = [
      { header: 'ID', keep: true, role: 'identifier' },
      { header: 'Start', keep: true, role: 'start' },
      { header: 'End', keep: false, role: 'none' },
      { header: 'Group', keep: true, role: 'area' },
      { header: 'Note', keep: false, role: 'none' },
    ];
    const { headers, rows } = applyMapping(parse, mapping);
    expect(headers).toEqual(['ID', 'Start', 'Group']);
    expect(rows[0].values).toEqual({ ID: 'A-01', Start: '2024-01-05', Group: 'North' });
  });

  test('rejects a mapping whose length does not match the headers', () => {
    const parse = { headers: ['ID'], rows: [] };
    expect(() => applyMapping(parse, [])).toThrow(/does not match/);
  });

  test('roles are recorded without altering the data', () => {
    const parse = { headers: ['ID'], rows: [['x']] };
    const mapping: ColumnMapping[] = [{ header: 'ID', keep: true, role: 'identifier' }];
    const { headers, rows } = applyMapping(parse, mapping);
    expect(headers).toEqual(['ID']);
    expect(rows[0].values.ID).toBe('x');
    expect(mapping[0].role).toBe('identifier');
  });
});
