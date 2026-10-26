import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { importColumns, ParseError, parseWorkbook } from '../../src/ingest';
import { columnKeys, columnLabel, DUPLICATE_SEPARATOR } from '../../src/columns';

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

describe('direct import (FR-1)', () => {
  test('every column of the file is imported under its own header, with all values', () => {
    const { headers, rows } = importColumns(parseWorkbook(loadFixture()));
    expect(headers).toEqual(['ID', 'Start', 'End', 'Group', 'Note']);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toEqual({ ID: 'A-01', Start: '2024-01-05', End: '2024-02-01', Group: 'North', Note: 'Alpha item' });
  });

  test('repeated and empty headers keep their columns apart and display as-is', () => {
    const parse = { headers: ['Name', 'Name', '', '', 'Name'], rows: [['a', 'b', 'c', 'd', 'e']] };
    const { headers, rows } = importColumns(parse);
    expect(new Set(headers).size).toBe(5);
    expect(headers.map((h) => columnLabel(h, '(untitled)'))).toEqual(['Name', 'Name', '(untitled)', '(untitled)', 'Name']);
    expect(headers.map((h) => rows[0][h])).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  test('a header that happens to contain the occurrence format cannot collide', () => {
    const keys = columnKeys(['A', `A${DUPLICATE_SEPARATOR}2`, 'A']);
    expect(new Set(keys).size).toBe(3);
  });

  test('headers in any language are kept verbatim', () => {
    const parse = { headers: ['Identitet', 'Område', '名前'], rows: [['1', 'Norr', 'x']] };
    const { headers } = importColumns(parse);
    expect(headers.map((h) => columnLabel(h, ''))).toEqual(['Identitet', 'Område', '名前']);
  });
});
