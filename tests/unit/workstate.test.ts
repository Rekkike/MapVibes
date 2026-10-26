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
  PROBLEM_KINDS,
  type WorkState,
} from '../../src/workstate';
import { newManualKey } from '../../src/manual';
import { en, sv } from '../../src/i18n';

const MK = newManualKey([]);
const png = readFileSync(join(process.cwd(), 'example-data', 'example-background.png')).toString('base64');

function sample(): WorkState {
  return {
    roles: { identifier: 'ID', name: 'Note', start: 'Start', area: 'Group' },
    headers: ['ID', 'Start', 'Group', 'Note', MK],
    manualColumns: [{ key: MK, label: 'Rank' }],
    hiddenHeaders: ['Note'],
    rows: [
      { values: { ID: 'A-01', Start: '2024-01-05', Group: 'North', Note: 'Alpha item' }, colour: 'green', removed: false, manual: false, edited: { Start: '2024-01-04' }, comments: [{ date: '2024-02-01T09:00:00.000Z', text: 'First check.' }, { date: '2024-02-03T15:30:00.000Z', text: 'Second\nline.' }] },
      { values: { ID: 'A-02', Start: '2024-01-10', Group: 'North', Note: '' }, colour: 'blue', removed: true, manual: false, edited: {}, comments: [] },
      { values: { ID: 'A-03', Start: '', Group: 'South', Note: 'Beta item' }, colour: 'yellow', removed: false, manual: false, edited: {}, comments: [] },
      { values: { ID: 'A-04', Start: '', Group: 'South', Note: '' }, colour: 'red', removed: false, manual: false, edited: {}, comments: [] },
      { values: { ID: 'M-01', Start: '', Group: '', Note: 'By hand', [MK]: '1' }, colour: 'green', removed: false, manual: true, edited: {}, comments: [] },
    ],
    background: { src: `data:image/png;base64,${png}`, width: 1200, height: 800 },
    markers: [
      { row: 0, position: { x: 125.25, y: 300.5 }, symbol: 'gear' },
      { row: 3, position: { x: 1000, y: 0.125 }, symbol: null },
    ],
    excluded: [3],
    areaValues: ['North', 'South'],
    programValues: ['First programme', 'Second programme'],
    colourLabels: { green: 'On track', red: 'At risk' },
    glanceColumns: ['Group', 'Start'],
    annotations: [
      { kind: 'polygon', points: [{ x: 100, y: 100 }, { x: 300, y: 120 }, { x: 200, y: 260.5 }], colour: 'blue', fillOpacity: 0.3, outline: 'black', lineStyle: 'solid', label: 'Footprint', link: 0, hidden: false },
      { kind: 'line', points: [{ x: 10, y: 10 }, { x: 400, y: 50 }], colour: 'red', fillOpacity: 0, outline: 'white', lineStyle: 'dashed', label: '', link: null, hidden: true },
    ],
    statuses: [
      { name: 'Open', symbol: 'pause' },
      { name: 'Done', symbol: 'check' },
    ],
    symbolsFromStatus: true,
    presets: [
      { name: 'Standard', headers: ['ID', 'Start', 'Group', 'Note'], hidden: ['Note'], roles: { identifier: 'ID', area: 'Group' } },
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
  test('every problem kind has a message in both interface languages (FR-19)', () => {
    for (const kind of PROBLEM_KINDS) {
      const key = `problem${kind[0].toUpperCase()}${kind.slice(1)}` as keyof typeof en;
      expect(en[key], kind).toContain('{field}');
      expect(sv[key], kind).toContain('{field}');
      expect(sv[key]).not.toBe(en[key]);
    }
  });

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
    const state = { ...sample(), background: null, markers: [], excluded: [], presets: [], manualColumns: [], areaValues: [], programValues: [], colourLabels: {}, glanceColumns: null, annotations: [], statuses: [], symbolsFromStatus: false, segment: 'information' as const };
    expect(parseWorkState(serialiseWorkState(state, SAVED_AT))).toEqual(state);
  });

  test('the file carries the format name, schema version, and save time', () => {
    const file = fileOf(sample());
    expect(file.format).toBe(WORK_STATE_FORMAT);
    expect(file.schemaVersion).toBe(6);
    expect(WORK_STATE_SCHEMA_VERSION).toBe(6);
    expect(file.savedAt).toBe('2026-01-02T03:04:05.000Z');
  });

  test('rows carry their retained or removed status and the global sequential number', () => {
    const rows = fileOf(sample()).rows as Array<{ status: string; number: number | null }>;
    expect(rows.map((r) => [r.status, r.number])).toEqual([
      ['retained', 1],
      ['removed', null],
      ['retained', 2],
      ['retained', 3],
      ['retained', 4],
    ]);
    expect(rowNumbers(sample().rows)).toEqual([1, null, 2, 3, 4]);
  });

  test('an unknown schema version is rejected and named, never loaded silently', () => {
    for (const version of [7, 0, '6', null]) {
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
      expect(expectError(JSON.stringify(file), 'invalid').problem).toEqual({ kind: 'notEmbedded', field: 'background.dataUrl' });
    }
  });

  test('a numbering that breaks the global sequence is rejected', () => {
    const file = fileOf(sample());
    (file.rows as Array<Record<string, unknown>>)[2].number = 5;
    expect(expectError(JSON.stringify(file), 'invalid').problem).toEqual({ kind: 'numbering', field: 'rows[2].number' });
  });

  test('markers referring to removed, missing, or duplicate rows are rejected', () => {
    const cases: Array<[unknown[], string, string]> = [
      [[{ row: 1, x: 0, y: 0, symbol: null }], 'removedRow', 'markers[0]'],
      [[{ row: 9, x: 0, y: 0, symbol: null }], 'noSuchRow', 'markers[0].row'],
      [[{ row: 0, x: 0, y: 0, symbol: null }, { row: 0, x: 1, y: 1, symbol: null }], 'duplicateMarker', 'markers[1]'],
      [[{ row: 0, x: 'a', y: 0, symbol: null }], 'notNumber', 'markers[0].x'],
    ];
    for (const [markers, kind, field] of cases) {
      const file = { ...fileOf(sample()), markers };
      expect(expectError(JSON.stringify(file), 'invalid').problem).toEqual({ kind, field });
    }
  });

  test('inconsistent columns and unknown values are rejected', () => {
    const a = fileOf(sample());
    (a.columns as Record<string, unknown>).headers = ['ID'];
    expect(expectError(JSON.stringify(a), 'invalid').problem!.kind).toBe('notAColumn');
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

  test('the file stores roles, marker symbols, presentation toggles, and presets', () => {
    const file = fileOf(sample()) as Record<string, any>;
    expect(file.columns.roles).toEqual({ identifier: 'ID', name: 'Note', start: 'Start', area: 'Group' });
    expect(file.columns.mapping).toBeUndefined();
    expect(file.markers.map((m: { symbol: string | null }) => m.symbol)).toEqual(['gear', null]);
    expect(file.presentation).toEqual({ hidden: [3] });
    expect(file.presets[0].name).toBe('Standard');
  });

  test('version 2 content is validated', () => {
    const cases: Array<[(f: Record<string, any>) => void, string, string]> = [
      [(f) => (f.markers[0].symbol = 'star'), 'unknownValue', 'markers[0].symbol'],
      [(f) => (f.presentation.hidden = [1]), 'removedRow', 'presentation.hidden[0]'],
      [(f) => (f.presentation.hidden = [9]), 'noSuchRow', 'presentation.hidden[0]'],
      [(f) => (f.presentation.hidden = [0, 0]), 'duplicateEntry', 'presentation.hidden[1]'],
      [(f) => (f.presets = [{ name: 'x' }]), 'invalidPresets', 'presets'],
      [(f) => (f.columns.roles = { owner: 'ID' }), 'unknownValue', 'columns.roles.owner'],
      [(f) => (f.columns.roles = { name: 'Missing' }), 'notAColumn', 'columns.roles.name'],
      [(f) => (f.columns.roles = { name: 'ID', identifier: 'ID' }), 'duplicateRole', 'identifier'],
      [(f) => delete f.presentation, 'notObject', 'presentation'],
    ];
    for (const [mutate, kind, field] of cases) {
      const file = fileOf(sample()) as Record<string, any>;
      mutate(file);
      expect(expectError(JSON.stringify(file), 'invalid').problem, `${kind} ${field}`).toEqual({ kind, field });
    }
  });
});

describe('schema version 1 migration (FR-13)', () => {
  const v1Text = readFileSync(join(process.cwd(), 'example-data', 'example-work-state-v1.json'), 'utf8');

  test('a version 1 file written by v0.4.0 opens and migrates', () => {
    expect(JSON.parse(v1Text).schemaVersion).toBe(1);
    const state = parseWorkState(v1Text);
    expect(state.headers).toEqual(['ID', 'Start', 'End', 'Group', 'Note']);
    expect(state.roles).toEqual({});
    expect(state.rows.map((r) => [r.values.ID, r.removed, r.colour])).toEqual([
      ['A-01', true, 'green'],
      ['A-02', false, 'green'],
      ['A-03', false, 'blue'],
      ['A-04', false, 'green'],
      ['A-05', false, 'green'],
    ]);
    expect(state.background!.src.startsWith('data:image/png;base64,')).toBe(true);
    expect([state.background!.width, state.background!.height]).toEqual([1785, 2526]);
    // Version 1 has no symbols, toggles, presets, or vocabularies: defaults apply.
    expect(state.markers.map((m) => [m.row, m.symbol])).toEqual([
      [1, null],
      [2, null],
      [3, null],
    ]);
    expect(state.excluded).toEqual([]);
    expect(state.presets).toEqual([]);
    expect(state.segment).toBe('map');
  });

  test('a migrated file is saved as the current version and reads back identically', () => {
    const migrated = parseWorkState(v1Text);
    expect(migrated.manualColumns).toEqual([]);
    expect(migrated.rows.every((r) => !r.manual)).toBe(true);
    const text = serialiseWorkState(migrated, SAVED_AT);
    expect(JSON.parse(text).schemaVersion).toBe(6);
    expect(parseWorkState(text)).toEqual(migrated);
  });

  test('version 1 roles migrate to role assignments; columns not kept lose their roles', () => {
    const v1 = JSON.parse(v1Text);
    v1.columns.mapping[0].role = 'identifier';
    v1.columns.mapping[3].role = 'area';
    expect(parseWorkState(JSON.stringify(v1)).roles).toEqual({ identifier: 'ID', area: 'Group' });
    v1.columns.mapping.push({ header: 'Dropped', keep: false, role: 'start' });
    expect(parseWorkState(JSON.stringify(v1)).roles).toEqual({ identifier: 'ID', area: 'Group' });
  });

  test('a version 1 file is validated by the version 1 rules', () => {
    const v1 = JSON.parse(v1Text);
    v1.columns.mapping[4].role = 'name';
    expect(expectError(JSON.stringify(v1), 'invalid').problem).toEqual({ kind: 'unknownValue', field: 'columns.mapping[4].role' });
    const v1b = JSON.parse(v1Text);
    v1b.columns.mapping[0].keep = false;
    expect(expectError(JSON.stringify(v1b), 'invalid').problem!.kind).toBe('headersMismatch');
  });
});

describe('schema version 3: manual-list metadata (FR-9, FR-24, FR-13)', () => {
  test('manual columns and the origin of each row are stored', () => {
    const file = fileOf(sample()) as Record<string, any>;
    expect(file.columns.manual).toEqual([{ key: MK, label: 'Rank' }]);
    expect(file.rows.map((r: { origin: string }) => r.origin)).toEqual(['imported', 'imported', 'imported', 'imported', 'manual']);
    expect(parseWorkState(serialiseWorkState(sample(), SAVED_AT)).rows[4].manual).toBe(true);
  });

  test('manual-list metadata is validated', () => {
    const cases: Array<[(f: Record<string, any>) => void, string, string]> = [
      [(f) => (f.columns.manual = [{ key: 'ID', label: 'x' }]), 'notAColumn', 'columns.manual[0].key'],
      [(f) => (f.columns.manual = [{ key: MK + 'x', label: 'x' }]), 'notAColumn', 'columns.manual[0].key'],
      [(f) => (f.columns.manual = [{ key: MK, label: ' ' }]), 'notText', 'columns.manual[0].label'],
      [(f) => (f.columns.manual = [{ key: MK, label: 'a' }, { key: MK, label: 'b' }]), 'duplicateEntry', 'columns.manual[1]'],
      [(f) => (f.rows[0].origin = 'pasted'), 'unknownValue', 'rows[0].origin'],
      [(f) => delete f.columns.manual, 'notList', 'columns.manual'],
    ];
    for (const [mutate, kind, field] of cases) {
      const file = fileOf(sample()) as Record<string, any>;
      mutate(file);
      expect(expectError(JSON.stringify(file), 'invalid').problem, `${kind} ${field}`).toEqual({ kind, field });
    }
  });
});

describe('schema version 2 migration (FR-13)', () => {
  const v2Text = readFileSync(join(process.cwd(), 'example-data', 'example-work-state-v2.json'), 'utf8');

  test('a version 2 file written by v0.5.0 opens with all its content and no manual data', () => {
    expect(JSON.parse(v2Text).schemaVersion).toBe(2);
    const state = parseWorkState(v2Text);
    expect(state.roles).toEqual({ identifier: 'ID', name: 'Note', area: 'Group' });
    // Stored default circles count as no manual choice; other shapes as manual choices.
    expect(state.markers.map((m) => m.symbol)).toEqual([null, null, 'diamond', null, null]);
    expect([state.areaValues, state.statuses, state.symbolsFromStatus]).toEqual([[], [], false]);
    expect(state.excluded).toEqual([1]);
    expect(state.presets.map((p) => p.name)).toEqual(['Standard']);
    expect(state.manualColumns).toEqual([]);
    expect(state.rows.every((r) => !r.manual)).toBe(true);
  });

  test('a migrated version 2 file is saved as the current version and reads back identically', () => {
    const migrated = parseWorkState(v2Text);
    const text = serialiseWorkState(migrated, SAVED_AT);
    expect(JSON.parse(text).schemaVersion).toBe(6);
    expect(parseWorkState(text)).toEqual(migrated);
  });

  test('version 2 files are read by the version 2 rules: manual metadata is neither required nor read', () => {
    const v2 = JSON.parse(v2Text);
    v2.rows[0].origin = 'manual';
    v2.columns.manual = [{ key: 'ID', label: 'x' }];
    const state = parseWorkState(JSON.stringify(v2));
    expect(state.rows[0].manual).toBe(false);
    expect(state.manualColumns).toEqual([]);
  });
});

describe('schema version 4: vocabularies and the status-to-symbol toggle (FR-32 to FR-34, FR-13)', () => {
  test('the vocabularies, the toggle, and icon symbols round-trip', () => {
    const file = fileOf(sample()) as Record<string, any>;
    expect(file.vocabularies).toEqual({ areas: ['North', 'South'], programs: ['First programme', 'Second programme'], statuses: [{ name: 'Open', symbol: 'pause' }, { name: 'Done', symbol: 'check' }] });
    expect(file.symbolsFromStatus).toBe(true);
    const back = parseWorkState(serialiseWorkState(sample(), SAVED_AT));
    expect([back.areaValues, back.statuses, back.symbolsFromStatus]).toEqual([sample().areaValues, sample().statuses, true]);
  });

  test('presets keep their vocabularies in the file', () => {
    const state = sample();
    state.presets = [{ ...state.presets[0], areas: ['North'], statuses: [{ name: 'Open', symbol: 'cross' }] }];
    expect(parseWorkState(serialiseWorkState(state, SAVED_AT)).presets[0]).toEqual(state.presets[0]);
  });

  test('vocabularies and the toggle are validated', () => {
    const cases: Array<[(f: Record<string, any>) => void, string, string]> = [
      [(f) => (f.vocabularies.areas = ['A', 'A']), 'invalidVocabulary', 'vocabularies.areas'],
      [(f) => (f.vocabularies.statuses = [{ name: 'A', symbol: 'star' }]), 'invalidVocabulary', 'vocabularies.statuses'],
      [(f) => (f.symbolsFromStatus = 'yes'), 'notBoolean', 'symbolsFromStatus'],
      [(f) => delete f.vocabularies, 'notObject', 'vocabularies'],
    ];
    for (const [mutate, kind, field] of cases) {
      const file = fileOf(sample()) as Record<string, any>;
      mutate(file);
      expect(expectError(JSON.stringify(file), 'invalid').problem, `${kind} ${field}`).toEqual({ kind, field });
    }
  });

  test('version 2 and 3 files may not carry icons: their markers hold shapes only', () => {
    const v2 = JSON.parse(readFileSync(join(process.cwd(), 'example-data', 'example-work-state-v2.json'), 'utf8'));
    v2.markers[0].shape = 'gear';
    expect(expectError(JSON.stringify(v2), 'invalid').problem).toEqual({ kind: 'unknownValue', field: 'markers[0].shape' });
  });
});


describe('schema version 3 migration (FR-13)', () => {
  const v3Text = readFileSync(join(process.cwd(), 'example-data', 'example-work-state-v3.json'), 'utf8');

  test('a version 3 file written by v0.6.0 opens with its manual data; vocabularies start empty and the toggle off', () => {
    expect(JSON.parse(v3Text).schemaVersion).toBe(3);
    const state = parseWorkState(v3Text);
    expect(state.manualColumns.map((c) => c.label)).toEqual(['Rank']);
    expect(state.rows.map((r) => r.manual)).toEqual([false, false, false, false, false, true]);
    expect(state.roles).toEqual({ identifier: 'ID', area: 'Group' });
    // The stored default circles are no manual choice; the square is.
    expect(state.markers.map((m) => [m.row, m.symbol])).toEqual([
      [0, null],
      [2, null],
      [5, 'square'],
    ]);
    expect([state.areaValues, state.statuses, state.symbolsFromStatus]).toEqual([[], [], false]);
  });

  test('a migrated version 3 file is saved as the current version and reads back identically', () => {
    const migrated = parseWorkState(v3Text);
    const text = serialiseWorkState(migrated, SAVED_AT);
    expect(JSON.parse(text).schemaVersion).toBe(6);
    expect(parseWorkState(text)).toEqual(migrated);
  });
});

describe('schema version 5: edited values and comments (FR-10, FR-15, FR-13)', () => {
  test('edited values and comments are stored per row and round-trip', () => {
    const rows = fileOf(sample()).rows as Array<{ values: Record<string, string>; edited: Record<string, string>; comments: unknown[] }>;
    expect(rows[0].edited).toEqual({ Start: '2024-01-04' });
    // The current value stays in the values; the edit keeps the imported one.
    expect(rows[0].values.Start).toBe('2024-01-05');
    expect(rows[0].comments).toEqual([
      { date: '2024-02-01T09:00:00.000Z', text: 'First check.' },
      { date: '2024-02-03T15:30:00.000Z', text: 'Second\nline.' },
    ]);
    expect(rows.slice(1).every((r) => Object.keys(r.edited).length === 0 && r.comments.length === 0)).toBe(true);
    const text = serialiseWorkState(sample(), SAVED_AT);
    expect(parseWorkState(text)).toEqual(sample());
  });

  test('edited values and comments are validated', () => {
    const cases: Array<[(f: Record<string, any>) => void, string, string]> = [
      [(f) => (f.rows[0].edited = { Missing: 'x' }), 'notAColumn', 'rows[0].edited'],
      [(f) => (f.rows[0].edited = { [MK]: 'x' }), 'invalidEdit', `rows[0].edited.${MK}`],
      [(f) => (f.rows[4].edited = { ID: 'x' }), 'invalidEdit', 'rows[4].edited.ID'],
      [(f) => (f.rows[0].edited = { Start: 5 }), 'notText', 'rows[0].edited.Start'],
      [(f) => (f.rows[0].edited = []), 'notObject', 'rows[0].edited'],
      [(f) => delete f.rows[0].edited, 'notObject', 'rows[0].edited'],
      [(f) => (f.rows[0].comments = {}), 'notList', 'rows[0].comments'],
      [(f) => (f.rows[0].comments[1].date = 'yesterday'), 'invalidComment', 'rows[0].comments[1]'],
      [(f) => (f.rows[0].comments[0].text = '   '), 'invalidComment', 'rows[0].comments[0]'],
      [(f) => (f.rows[0].comments[0].text = 7), 'notText', 'rows[0].comments[0].text'],
      [(f) => (f.rows[0].comments[0] = 'note'), 'notObject', 'rows[0].comments[0]'],
    ];
    for (const [mutate, kind, field] of cases) {
      const file = fileOf(sample()) as Record<string, any>;
      mutate(file);
      expect(expectError(JSON.stringify(file), 'invalid').problem, `${kind} ${field}`).toEqual({ kind, field });
    }
  });

  test('files of versions 1 to 3 migrate with no edits and no comments', () => {
    for (const name of ['example-work-state-v1.json', 'example-work-state-v2.json', 'example-work-state-v3.json']) {
      const state = parseWorkState(readFileSync(join(process.cwd(), 'example-data', name), 'utf8'));
      expect(state.rows.length, name).toBeGreaterThan(0);
      expect(state.rows.every((r) => Object.keys(r.edited).length === 0 && r.comments.length === 0), name).toBe(true);
    }
  });

  test('older files are read by their own rules: edits and comments in them are neither required nor read', () => {
    const v4 = JSON.parse(readFileSync(join(process.cwd(), 'example-data', 'example-work-state-v4.json'), 'utf8'));
    v4.rows[0].edited = { Missing: 'x' };
    v4.rows[0].comments = 'not a list';
    const state = parseWorkState(JSON.stringify(v4));
    expect(state.rows[0].edited).toEqual({});
    expect(state.rows[0].comments).toEqual([]);
  });
});

describe('schema version 4 migration (FR-13)', () => {
  const v4Text = readFileSync(join(process.cwd(), 'example-data', 'example-work-state-v4.json'), 'utf8');

  test('a version 4 file written by v0.7.0 opens with its vocabularies and symbols; no edits and no comments', () => {
    expect(JSON.parse(v4Text).schemaVersion).toBe(4);
    const state = parseWorkState(v4Text);
    expect(state.roles.identifier).toBe('ID');
    expect(state.roles.area).toBe('Group');
    expect(state.roles.status).toBe(state.manualColumns[0].key);
    expect(state.manualColumns.map((c) => c.label)).toEqual(['Phase']);
    expect(state.areaValues).toEqual(['North', 'South']);
    expect(state.statuses).toEqual([
      { name: 'Open', symbol: 'pause' },
      { name: 'Done', symbol: 'check' },
    ]);
    expect(state.symbolsFromStatus).toBe(true);
    expect(state.markers.map((m) => [m.row, m.symbol])).toEqual([
      [0, null],
      [2, null],
      [4, 'gear'],
    ]);
    expect(state.rows.map((r) => [r.edited, r.comments])).toEqual(state.rows.map(() => [{}, []]));
  });

  test('a migrated version 4 file is saved as the current version and reads back identically', () => {
    const migrated = parseWorkState(v4Text);
    const text = serialiseWorkState(migrated, SAVED_AT);
    expect(JSON.parse(text).schemaVersion).toBe(6);
    expect(parseWorkState(text)).toEqual(migrated);
  });
});

describe('schema version 6: programs, colour labels, at-a-glance columns, annotations (FR-43 to FR-49, FR-13)', () => {
  test('all of them round-trip, with the projection of a rendered background', () => {
    const state = sample();
    state.background = { ...state.background!, projection: { x0: 1000.5, y1: 2000.25, scale: 4096 } };
    const file = fileOf(state) as Record<string, any>;
    expect(file.colourLabels).toEqual({ green: 'On track', red: 'At risk' });
    expect(file.glance).toEqual({ columns: ['Group', 'Start'] });
    expect(file.annotations).toHaveLength(2);
    expect(file.background.projection).toEqual({ x0: 1000.5, y1: 2000.25, scale: 4096 });
    expect(parseWorkState(serialiseWorkState(state, SAVED_AT))).toEqual(state);
  });

  test('a plain image background has no projection in the file', () => {
    const file = fileOf(sample()) as Record<string, any>;
    expect(file.background.projection).toBeUndefined();
    expect(parseWorkState(serialiseWorkState(sample(), SAVED_AT)).background!.projection).toBeUndefined();
  });

  test('damaged annotations are rejected with the field named', () => {
    const cases: Array<[(f: Record<string, any>) => void, string]> = [
      [(f) => (f.annotations[0].kind = 'star'), 'annotations[0].kind'],
      [(f) => (f.annotations[0].points = [{ x: 1, y: 1 }]), 'annotations[0].points'],
      [(f) => (f.annotations[1].points = [{ x: 1, y: 1 }]), 'annotations[1].points'],
      [(f) => (f.annotations[0].fillOpacity = 1.5), 'annotations[0].fillOpacity'],
      [(f) => (f.annotations[0].colour = 'purple'), 'annotations[0].colour'],
      [(f) => (f.annotations[0].lineStyle = 'wavy'), 'annotations[0].lineStyle'],
      [(f) => (f.annotations[0].outline = 'grey'), 'annotations[0].outline'],
      [(f) => (f.annotations[0].link = 99), 'annotations[0].link'],
    ];
    for (const [damage, field] of cases) {
      const file = fileOf(sample()) as Record<string, any>;
      damage(file);
      const error = expectError(JSON.stringify(file), 'invalid');
      expect(error.detail, field).toContain(field);
    }
  });

  test('annotations without a background are rejected', () => {
    const file = fileOf(sample()) as Record<string, any>;
    file.background = null;
    file.markers = [];
    expectError(JSON.stringify(file), 'invalid');
  });

  test('at-a-glance columns must be columns of the file', () => {
    const file = fileOf(sample()) as Record<string, any>;
    file.glance.columns = ['Nowhere'];
    expectError(JSON.stringify(file), 'invalid');
  });

  test('a version 5 file migrates with no programs, no colour labels, the default columns, and no annotations', () => {
    const file = fileOf(sample()) as Record<string, any>;
    file.schemaVersion = 5;
    delete file.vocabularies.programs;
    delete file.colourLabels;
    delete file.glance;
    delete file.annotations;
    const state = parseWorkState(JSON.stringify(file));
    expect([state.programValues, state.colourLabels, state.glanceColumns, state.annotations]).toEqual([[], {}, null, []]);
    expect(state.background!.projection).toBeUndefined();
    expect(JSON.parse(serialiseWorkState(state, SAVED_AT)).schemaVersion).toBe(6);
  });

  test('version 6 fields in an older file are ignored, as that version never wrote them', () => {
    const file = fileOf(sample()) as Record<string, any>;
    file.schemaVersion = 5;
    const state = parseWorkState(JSON.stringify(file));
    expect(state.annotations).toEqual([]);
    expect(state.programValues).toEqual([]);
  });
});
