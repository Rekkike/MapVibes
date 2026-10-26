import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  parseWorkState,
  rowNumbers,
  serialiseWorkState,
  WORK_STATE_FORMAT,
  WORK_STATE_SCHEMA_VERSION,
  WorkStateError,
  type WorkState,
} from '../../src/workstate';

const png = readFileSync(join(process.cwd(), 'example-data', 'example-background.png')).toString('base64');

function sample(): WorkState {
  return {
    mapping: [
      { header: 'ID', keep: true, role: 'identifier' },
      { header: 'Start', keep: true, role: 'start' },
      { header: 'End', keep: false, role: 'end' },
      { header: 'Group', keep: true, role: 'area' },
      { header: 'Note', keep: true, role: 'none' },
    ],
    headers: ['ID', 'Start', 'Group', 'Note'],
    hiddenHeaders: ['Note'],
    rows: [
      { values: { ID: 'A-01', Start: '2024-01-05', Group: 'North', Note: 'Alpha item' }, colour: 'green', removed: false },
      { values: { ID: 'A-02', Start: '2024-01-10', Group: 'North', Note: '' }, colour: 'blue', removed: true },
      { values: { ID: 'A-03', Start: '', Group: 'South', Note: 'Beta item' }, colour: 'yellow', removed: false },
      { values: { ID: 'A-04', Start: '', Group: 'South', Note: '' }, colour: 'red', removed: false },
    ],
    background: { src: `data:image/png;base64,${png}`, width: 1200, height: 800 },
    markers: [
      { row: 0, position: { x: 125.25, y: 300.5 } },
      { row: 3, position: { x: 1000, y: 0.125 } },
    ],
    segment: 'map',
    viewport: { scale: 0.6666666666666666, x: 12.5, y: -33.25 },
    sort: { header: 'Group', direction: 'desc' },
    filter: { kind: 'contains', header: 'Note', text: 'item' },
  };
}

const SAVED_AT = new Date('2026-01-02T03:04:05.000Z');

function fileOf(state: WorkState): Record<string, unknown> {
  return JSON.parse(serialiseWorkState(state, SAVED_AT));
}

function expectError(text: string, code: WorkStateError['code']): WorkStateError {
  try {
    parseWorkState(text);
  } catch (e) {
    expect(e).toBeInstanceOf(WorkStateError);
    expect((e as WorkStateError).code).toBe(code);
    return e as WorkStateError;
  }
  throw new Error('expected a WorkStateError');
}

describe('work-state file (FR-13)', () => {
  test('a save/load round trip restores an identical state, including background data and marker positions', () => {
    const state = sample();
    const restored = parseWorkState(serialiseWorkState(state, SAVED_AT));
    expect(restored).toEqual(state);
    expect(restored.background!.src).toBe(state.background!.src);
    expect(restored.markers.map((m) => m.position)).toEqual([{ x: 125.25, y: 300.5 }, { x: 1000, y: 0.125 }]);
    // A second round trip is byte-identical.
    expect(serialiseWorkState(restored, SAVED_AT)).toBe(serialiseWorkState(state, SAVED_AT));
  });

  test('a state without background or markers round-trips too', () => {
    const state = { ...sample(), background: null, markers: [], segment: 'information' as const };
    expect(parseWorkState(serialiseWorkState(state, SAVED_AT))).toEqual(state);
  });

  test('the file carries the format name, schema version, and save time', () => {
    const file = fileOf(sample());
    expect(file.format).toBe(WORK_STATE_FORMAT);
    expect(file.schemaVersion).toBe(1);
    expect(WORK_STATE_SCHEMA_VERSION).toBe(1);
    expect(file.savedAt).toBe('2026-01-02T03:04:05.000Z');
  });

  test('rows carry their retained or removed status and the global sequential number', () => {
    const rows = fileOf(sample()).rows as Array<{ status: string; number: number | null }>;
    expect(rows.map((r) => [r.status, r.number])).toEqual([
      ['retained', 1],
      ['removed', null],
      ['retained', 2],
      ['retained', 3],
    ]);
    expect(rowNumbers(sample().rows)).toEqual([1, null, 2, 3]);
  });

  test('an unknown schema version is rejected and named, never loaded silently', () => {
    for (const version of [2, 0, '1', null]) {
      const file = { ...fileOf(sample()), schemaVersion: version };
      expect(expectError(JSON.stringify(file), 'unknown-version').detail).toBe(String(version));
    }
    const { schemaVersion: _omit, ...withoutVersion } = fileOf(sample());
    expect(expectError(JSON.stringify(withoutVersion), 'unknown-version').detail).toBe('undefined');
  });

  test('text that is not JSON, and JSON that is not a work-state file, are rejected', () => {
    expectError('not json at all', 'not-json');
    expectError('{"format":"something-else","schemaVersion":1}', 'not-work-state');
    expectError('[1,2,3]', 'not-work-state');
  });

  test('a background that is not embedded image data is rejected (no network fetch can result)', () => {
    for (const src of ['https://example.invalid/map.png', '//example.invalid/x.png', 'file:///tmp/x.png', 'data:text/html,<b>x</b>']) {
      const file = fileOf(sample());
      (file.background as Record<string, unknown>).dataUrl = src;
      expect(expectError(JSON.stringify(file), 'invalid').detail).toMatch(/embedded image data/);
    }
  });

  test('a numbering that breaks the global sequence is rejected', () => {
    const file = fileOf(sample());
    (file.rows as Array<Record<string, unknown>>)[2].number = 5;
    expect(expectError(JSON.stringify(file), 'invalid').detail).toMatch(/numbering/);
  });

  test('markers referring to removed, missing, or duplicate rows are rejected', () => {
    const cases: Array<[unknown[], RegExp]> = [
      [[{ row: 1, x: 0, y: 0 }], /removed row/],
      [[{ row: 9, x: 0, y: 0 }], /does not refer/],
      [[{ row: 0, x: 0, y: 0 }, { row: 0, x: 1, y: 1 }], /duplicates/],
      [[{ row: 0, x: 'a', y: 0 }], /finite number/],
    ];
    for (const [markers, message] of cases) {
      const file = { ...fileOf(sample()), markers };
      expect(expectError(JSON.stringify(file), 'invalid').detail).toMatch(message);
    }
  });

  test('inconsistent columns and unknown values are rejected', () => {
    const a = fileOf(sample());
    (a.columns as Record<string, unknown>).headers = ['ID'];
    expect(expectError(JSON.stringify(a), 'invalid').detail).toMatch(/kept columns/);
    const b = fileOf(sample());
    (b.rows as Array<Record<string, unknown>>)[0].colour = 'purple';
    expectError(JSON.stringify(b), 'invalid');
    const c = fileOf(sample());
    (c.view as Record<string, unknown>).segment = 'elsewhere';
    expectError(JSON.stringify(c), 'invalid');
    const d = fileOf(sample());
    (d.rows as Array<Record<string, unknown>>)[0].values = { Unknown: 'x' };
    expectError(JSON.stringify(d), 'invalid');
  });
});
