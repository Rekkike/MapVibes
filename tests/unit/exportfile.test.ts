import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { EXPORT_FORMAT, EXPORT_VERSION, ExportError, parseExport, READABLE_EXPORT_VERSIONS, serialiseExport, type ExportData } from '../../src/exportfile';
import { parseWorkState, serialiseWorkState } from '../../src/workstate';

const v4Text = readFileSync(join(process.cwd(), 'example-data', 'example-work-state-v4.json'), 'utf8');
const AT = new Date('2024-10-01T12:00:00.000Z');

// An export built from the version 4 fixture: its rows are all retained.
function sample(): Omit<ExportData, 'exportedAt'> {
  const workState = parseWorkState(v4Text);
  return { application: '0.9.0', lang: 'sv', theme: 'dark', workState, numbers: workState.rows.map((_, i) => i + 1) };
}

function file(): Record<string, any> {
  return JSON.parse(serialiseExport(sample(), AT));
}

function expectError(text: string, code: ExportError['code']): ExportError {
  try {
    parseExport(text);
  } catch (e) {
    expect(e).toBeInstanceOf(ExportError);
    expect((e as ExportError).code).toBe(code);
    return e as ExportError;
  }
  throw new Error('expected an ExportError');
}

describe('export format (FR-40)', () => {
  test('the data carries its own format name and version, with the work state inside', () => {
    const f = file();
    expect(f.format).toBe(EXPORT_FORMAT);
    expect(f.exportVersion).toBe(1);
    expect(EXPORT_VERSION).toBe(1);
    expect(READABLE_EXPORT_VERSIONS).toEqual([1]);
    expect(f.exportedAt).toBe('2024-10-01T12:00:00.000Z');
    expect(f.application).toBe('0.9.0');
    expect(f.preferences).toEqual({ language: 'sv', theme: 'dark' });
    expect(f.workState.format).toBe('mapvibes-work-state');
    expect(f.workState.schemaVersion).toBe(5);
  });

  test('a round trip restores the same data', () => {
    const data = parseExport(serialiseExport(sample(), AT));
    expect(data).toEqual({ ...sample(), exportedAt: '2024-10-01T12:00:00.000Z' });
  });

  test('the data is readable: indented JSON with one field per line', () => {
    const text = serialiseExport(sample(), AT);
    expect(text).toContain('\n  "format": "mapvibes-export",\n');
    expect(text).toContain('"ID": "A-01"');
  });

  test('the embedded work state follows the work-state migrations', () => {
    const f = file();
    // An embedded version 4 work state (no edits, no comments) is read.
    f.workState = JSON.parse(v4Text);
    const data = parseExport(JSON.stringify(f));
    expect(data.workState.rows.every((r) => r.comments.length === 0)).toBe(true);
    expect(data.workState.statuses.map((s) => s.name)).toEqual(['Open', 'Done']);
    // It is written back at the current schema version.
    expect(JSON.parse(serialiseExport(data, AT)).workState.schemaVersion).toBe(5);
  });

  test('an unknown export version is rejected and named, never read silently', () => {
    for (const version of [0, 2, '1', null]) {
      const f = { ...file(), exportVersion: version };
      expect(expectError(JSON.stringify(f), 'unknown-version').detail).toBe(String(version));
    }
  });

  test('text that is not JSON, and JSON that is not export data, are rejected', () => {
    expectError('<html>', 'not-json');
    expectError(JSON.stringify({ format: 'something-else' }), 'not-export');
    // A work-state file is not export data.
    expectError(serialiseWorkState(parseWorkState(v4Text), AT), 'not-export');
  });

  test('damaged fields are named', () => {
    const cases: Array<[(f: Record<string, any>) => void, string]> = [
      [(f) => (f.exportedAt = 'soon'), 'exportedAt'],
      [(f) => (f.application = 9), 'application'],
      [(f) => delete f.preferences, 'preferences'],
      [(f) => (f.preferences.language = 'xx'), 'preferences.language'],
      [(f) => (f.preferences.theme = 'blue'), 'preferences.theme'],
      [(f) => (f.workState.rows[0].colour = 'purple'), 'workState'],
      [(f) => (f.numbers = f.numbers.slice(1)), 'numbers'],
      [(f) => (f.numbers[1] = f.numbers[0]), 'numbers'],
      [(f) => (f.numbers[0] = 0), 'numbers'],
      [(f) => (f.numbers[0] = 1.5), 'numbers'],
    ];
    for (const [mutate, field] of cases) {
      const f = file();
      mutate(f);
      expect(expectError(JSON.stringify(f), 'invalid').detail, field).toBe(field);
    }
  });

  test('the underlying work-state problem is kept for the message', () => {
    const f = file();
    f.workState.rows[0].colour = 'purple';
    expect(expectError(JSON.stringify(f), 'invalid').cause?.problem).toEqual({ kind: 'unknownValue', field: 'rows[0].colour' });
  });

  test('an export holds no removed rows', () => {
    const f = file();
    f.workState.rows[1].status = 'removed';
    f.workState.rows[1].number = null;
    f.workState.rows.slice(2).forEach((r: { number: number }) => (r.number -= 1));
    f.workState.markers = f.workState.markers.filter((m: { row: number }) => m.row !== 1);
    expect(expectError(JSON.stringify(f), 'invalid').detail).toBe('workState.rows');
  });
});
