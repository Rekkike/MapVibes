// Work-state file (FR-13). The complete work state is written to, and read
// from, a single local JSON file on explicit Save and Open only. The file
// carries a schema version. Version 5 is written; version 1 files (v0.4.0),
// version 2 files (v0.5.x), version 3 files (v0.6.0), and version 4 files
// (v0.7.0) are read and migrated; a file with any other version is rejected.
//
// Schema version 2 adds to version 1: role assignments by column key
// (replacing the version 1 column mapping, as all columns are now kept), the
// marker shape per marker, the presentation visibility toggles, and the
// saved column presets.
//
// Schema version 3 adds to version 2 the manual-list metadata: the columns
// added by hand (key and label) and, per row, whether it was imported or
// added by hand. Files of versions 1 and 2 have no manual columns and only
// imported rows.
//
// Schema version 4 adds to version 3 the user's vocabularies (the area values
// and the statuses with their symbols), the "assign marker symbols from
// status" toggle, and the symbol library's icons. A marker's symbol is null
// when no symbol was chosen manually for it. Versions 2 and 3 stored a shape
// for every marker: on migration the default shape (circle) counts as no
// manual choice and any other shape as a manual choice.
//
// Schema version 5 adds to version 4, per row, the values edited by hand
// (FR-10) and the comments (FR-15). The current values stay in the row's
// values; "edited" maps each imported value changed by hand to the value it
// had when imported, so that edits remain traceable. Rows added by hand and
// columns added by hand have no imported values, so they have no edits.
// Comments are entries of plain text with an ISO 8601 timestamp. Files of
// versions 1 to 4 have no edits and no comments.

import { COLOURS, type RowColour, type SortDirection, type ValueFilter } from './dataset';
import { isRole, ROLES, type Role, type RoleAssignments } from './roles';
import { DEFAULT_SHAPE, SHAPES } from './markers';
import { isSymbol, SYMBOLS, type MarkerSymbol } from './symbols';
import { parseStatuses, parseValueList, type StatusEntry } from './vocab';
import { isManualKey } from './manual';
import { clonePreset, parsePresets, type ColumnPreset } from './presets';
import { isCommentDate } from './comments';
import type { Background } from './mapview';
import { SEGMENTS, type Segment } from './segments';
import type { Point, Viewport } from './viewport';

export const WORK_STATE_FORMAT = 'mapvibes-work-state';
export const WORK_STATE_SCHEMA_VERSION = 5;
export const READABLE_SCHEMA_VERSIONS = [1, 2, 3, 4, 5];
export const SUGGESTED_FILE_NAME = 'mapvibes-work-state.json';

export interface WorkStateRow {
  values: Record<string, string>;
  colour: RowColour;
  removed: boolean;
  // Added by hand (FR-9) rather than imported.
  manual: boolean;
  // The imported values changed by hand (FR-10): column key to the value as
  // imported.
  edited: Record<string, string>;
  // The item's comments (FR-15), oldest first.
  comments: StoredComment[];
}

export interface StoredComment {
  date: string;
  text: string;
}

export interface ManualColumn {
  key: string;
  label: string;
}

export interface WorkStateMarker {
  // Index into WorkState.rows (ingestion order).
  row: number;
  position: Point;
  // The symbol chosen manually for this marker, or null (FR-26, FR-34).
  symbol: MarkerSymbol | null;
}

// The in-memory snapshot of the work state. Rows are in ingestion order;
// the retained rows, in that order, carry the global sequential numbers.
export interface WorkState {
  // Column keys in file order, and role assignments to column keys.
  headers: string[];
  roles: RoleAssignments;
  // Columns added by hand (FR-24), in the order of headers.
  manualColumns: ManualColumn[];
  hiddenHeaders: string[];
  rows: WorkStateRow[];
  background: Background | null;
  markers: WorkStateMarker[];
  // Indices into rows of the items switched off for the presentation.
  excluded: number[];
  presets: ColumnPreset[];
  // The user's vocabularies (FR-32, FR-33) and the toggle (FR-34).
  areaValues: string[];
  statuses: StatusEntry[];
  symbolsFromStatus: boolean;
  segment: Segment;
  viewport: Viewport;
  sort: { header: string | null; direction: SortDirection };
  filter: ValueFilter;
}

export type WorkStateErrorCode = 'not-json' | 'not-work-state' | 'unknown-version' | 'invalid';

// The kinds of inconsistency a damaged file can have. The interface shows
// each through its own translated message (FR-19); the field is the path of
// the offending entry in the file, a technical, language-neutral identifier.
export const PROBLEM_KINDS = [
  'notObject',
  'notList',
  'notText',
  'notNumber',
  'notBoolean',
  'unknownValue',
  'headersMismatch',
  'notAColumn',
  'numbering',
  'notEmbedded',
  'notPositive',
  'noSuchRow',
  'removedRow',
  'duplicateMarker',
  'markersWithoutBackground',
  'duplicateRole',
  'duplicateEntry',
  'invalidPresets',
  'invalidVocabulary',
  'invalidEdit',
  'invalidComment',
] as const;

export type ProblemKind = (typeof PROBLEM_KINDS)[number];

export interface Problem {
  kind: ProblemKind;
  field: string;
}

export class WorkStateError extends Error {
  constructor(
    readonly code: WorkStateErrorCode,
    // The schema version for 'unknown-version'; the field for 'invalid'.
    readonly detail: string,
    readonly problem?: Problem,
  ) {
    super(`${code}: ${problem ? `${problem.kind} at ${problem.field}` : detail}`);
    this.name = 'WorkStateError';
  }
}

const FILTER_KINDS: ValueFilter['kind'][] = ['all', 'empty', 'nonempty', 'contains'];

// The global sequential numbers of the rows: 1..n over the retained rows in
// ingestion order, null for removed rows (FR-3).
export function rowNumbers(rows: WorkStateRow[]): Array<number | null> {
  let next = 1;
  return rows.map((r) => (r.removed ? null : next++));
}

export function serialiseWorkState(state: WorkState, savedAt: Date): string {
  const numbers = rowNumbers(state.rows);
  const file = {
    format: WORK_STATE_FORMAT,
    schemaVersion: WORK_STATE_SCHEMA_VERSION,
    savedAt: savedAt.toISOString(),
    columns: {
      headers: [...state.headers],
      hiddenInList: [...state.hiddenHeaders],
      roles: Object.fromEntries(ROLES.filter((r) => state.roles[r] !== undefined).map((r) => [r, state.roles[r]])),
      manual: state.manualColumns.map((c) => ({ key: c.key, label: c.label })),
    },
    rows: state.rows.map((r, i) => ({
      values: { ...r.values },
      colour: r.colour,
      status: r.removed ? 'removed' : 'retained',
      origin: r.manual ? 'manual' : 'imported',
      number: numbers[i],
      edited: { ...r.edited },
      comments: r.comments.map((c) => ({ date: c.date, text: c.text })),
    })),
    background: state.background
      ? { dataUrl: state.background.src, width: state.background.width, height: state.background.height }
      : null,
    markers: state.markers.map((m) => ({ row: m.row, x: m.position.x, y: m.position.y, symbol: m.symbol })),
    presentation: { hidden: [...state.excluded] },
    presets: state.presets.map(clonePreset),
    vocabularies: {
      areas: [...state.areaValues],
      statuses: state.statuses.map((s) => ({ name: s.name, symbol: s.symbol })),
    },
    symbolsFromStatus: state.symbolsFromStatus,
    view: {
      segment: state.segment,
      viewport: { scale: state.viewport.scale, x: state.viewport.x, y: state.viewport.y },
      list: {
        sort: { header: state.sort.header, direction: state.sort.direction },
        filter: { kind: state.filter.kind, header: state.filter.header, text: state.filter.text },
      },
    },
  };
  return JSON.stringify(file, null, 2);
}

type Json = Record<string, unknown>;

function invalid(kind: ProblemKind, field: string): never {
  throw new WorkStateError('invalid', field, { kind, field });
}

function obj(value: unknown, where: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid('notObject', where);
  return value as Json;
}

function arr(value: unknown, where: string): unknown[] {
  if (!Array.isArray(value)) invalid('notList', where);
  return value;
}

function str(value: unknown, where: string): string {
  if (typeof value !== 'string') invalid('notText', where);
  return value;
}

function num(value: unknown, where: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) invalid('notNumber', where);
  return value;
}

function bool(value: unknown, where: string): boolean {
  if (typeof value !== 'boolean') invalid('notBoolean', where);
  return value;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], where: string): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) invalid('unknownValue', where);
  return value as T;
}

export function parseWorkState(text: string): WorkState {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new WorkStateError('not-json', 'the file is not valid JSON');
  }
  if (typeof raw !== 'object' || raw === null || (raw as Json).format !== WORK_STATE_FORMAT) {
    throw new WorkStateError('not-work-state', 'the file is not a MapVibes work-state file');
  }
  const file = raw as Json;
  const version = file.schemaVersion;
  if (typeof version !== 'number' || !READABLE_SCHEMA_VERSIONS.includes(version)) {
    throw new WorkStateError('unknown-version', String(version));
  }

  const columns = obj(file.columns, 'columns');
  const headers = arr(columns.headers, 'columns.headers').map((h, i) => str(h, `columns.headers[${i}]`));
  if (new Set(headers).size !== headers.length) invalid('duplicateEntry', 'columns.headers');
  const roles = version === 1 ? migrateMappingV1(columns, headers) : parseRolesV2(columns, headers);
  const manualColumns = version >= 3 ? parseManualColumns(columns, headers) : [];
  const hiddenHeaders = arr(columns.hiddenInList, 'columns.hiddenInList').map((h, i) => {
    const header = str(h, `columns.hiddenInList[${i}]`);
    if (!headers.includes(header)) invalid('notAColumn', `columns.hiddenInList[${i}]`);
    return header;
  });

  const rows: WorkStateRow[] = arr(file.rows, 'rows').map((r, i) => {
    const o = obj(r, `rows[${i}]`);
    const valuesIn = obj(o.values, `rows[${i}].values`);
    const values: Record<string, string> = {};
    for (const [k, v] of Object.entries(valuesIn)) {
      if (!headers.includes(k)) invalid('notAColumn', `rows[${i}].values`);
      values[k] = str(v, `rows[${i}].values`);
    }
    // Versions 1 and 2 have no manual rows.
    const manual = version >= 3 && oneOf(o.origin, ['imported', 'manual'] as const, `rows[${i}].origin`) === 'manual';
    // Versions 1 to 4 have no edits and no comments.
    const edited = version >= 5 ? parseEdited(o.edited, `rows[${i}].edited`, headers, manual) : {};
    const comments = version >= 5 ? parseComments(o.comments, `rows[${i}].comments`) : [];
    return {
      values,
      colour: oneOf(o.colour, COLOURS, `rows[${i}].colour`),
      removed: oneOf(o.status, ['retained', 'removed'] as const, `rows[${i}].status`) === 'removed',
      manual,
      edited,
      comments,
    };
  });
  const expected = rowNumbers(rows);
  arr(file.rows, 'rows').forEach((r, i) => {
    if ((r as Json).number !== expected[i]) invalid('numbering', `rows[${i}].number`);
  });

  let background: Background | null = null;
  if (file.background !== null) {
    const b = obj(file.background, 'background');
    const src = str(b.dataUrl, 'background.dataUrl');
    // Only embedded image data is accepted: a URL would make the browser
    // fetch a resource, which the privacy constraints forbid.
    if (!/^data:image\/[a-z0-9.+-]+(;[a-z0-9=.+-]+)*,/i.test(src)) invalid('notEmbedded', 'background.dataUrl');
    const width = num(b.width, 'background.width');
    const height = num(b.height, 'background.height');
    if (width <= 0 || height <= 0) invalid('notPositive', 'background');
    background = { src, width, height };
  }

  const placed = new Set<number>();
  const markers: WorkStateMarker[] = arr(file.markers, 'markers').map((m, i) => {
    const o = obj(m, `markers[${i}]`);
    const row = num(o.row, `markers[${i}].row`);
    if (!Number.isInteger(row) || row < 0 || row >= rows.length) invalid('noSuchRow', `markers[${i}].row`);
    if (rows[row].removed) invalid('removedRow', `markers[${i}]`);
    if (placed.has(row)) invalid('duplicateMarker', `markers[${i}]`);
    placed.add(row);
    let symbol: MarkerSymbol | null = null;
    if (version >= 4) {
      symbol = o.symbol === null ? null : oneOf(o.symbol, SYMBOLS, `markers[${i}].symbol`);
    } else if (version >= 2) {
      // Versions 2 and 3: shapes only; the default shape counts as no choice.
      const shape = oneOf(o.shape, SHAPES, `markers[${i}].shape`);
      symbol = shape === DEFAULT_SHAPE ? null : shape;
    }
    return { row, position: { x: num(o.x, `markers[${i}].x`), y: num(o.y, `markers[${i}].y`) }, symbol };
  });
  if (markers.length > 0 && !background) invalid('markersWithoutBackground', 'markers');

  const view = obj(file.view, 'view');
  const vp = obj(view.viewport, 'view.viewport');
  const viewport = { scale: num(vp.scale, 'view.viewport.scale'), x: num(vp.x, 'view.viewport.x'), y: num(vp.y, 'view.viewport.y') };
  if (viewport.scale <= 0) invalid('notPositive', 'view.viewport.scale');
  const list = obj(view.list, 'view.list');
  const sortIn = obj(list.sort, 'view.list.sort');
  const sortHeader = sortIn.header === null ? null : str(sortIn.header, 'view.list.sort.header');
  if (sortHeader !== null && !headers.includes(sortHeader)) invalid('notAColumn', 'view.list.sort.header');
  const filterIn = obj(list.filter, 'view.list.filter');
  const filterHeader = str(filterIn.header, 'view.list.filter.header');
  if (filterHeader !== '' && !headers.includes(filterHeader)) invalid('notAColumn', 'view.list.filter.header');

  // Version 1 has no presentation toggles and no presets.
  const excluded: number[] = [];
  let presets: ColumnPreset[] = [];
  if (version >= 2) {
    const presentation = obj(file.presentation, 'presentation');
    for (const [i, h] of arr(presentation.hidden, 'presentation.hidden').entries()) {
      const row = num(h, `presentation.hidden[${i}]`);
      if (!Number.isInteger(row) || row < 0 || row >= rows.length) invalid('noSuchRow', `presentation.hidden[${i}]`);
      if (rows[row].removed) invalid('removedRow', `presentation.hidden[${i}]`);
      if (excluded.includes(row)) invalid('duplicateEntry', `presentation.hidden[${i}]`);
      excluded.push(row);
    }
    const parsed = parsePresets(file.presets);
    if (parsed === null) invalid('invalidPresets', 'presets');
    presets = parsed;
  }

  // Versions 1 to 3 have no vocabularies, and the toggle was not yet there.
  let areaValues: string[] = [];
  let statuses: StatusEntry[] = [];
  let symbolsFromStatus = false;
  if (version >= 4) {
    const vocab = obj(file.vocabularies, 'vocabularies');
    const areas = parseValueList(vocab.areas);
    if (areas === null) invalid('invalidVocabulary', 'vocabularies.areas');
    const parsedStatuses = parseStatuses(vocab.statuses, isSymbol);
    if (parsedStatuses === null) invalid('invalidVocabulary', 'vocabularies.statuses');
    areaValues = areas;
    statuses = parsedStatuses;
    symbolsFromStatus = bool(file.symbolsFromStatus, 'symbolsFromStatus');
  }

  return {
    headers,
    roles,
    manualColumns,
    hiddenHeaders,
    rows,
    background,
    markers,
    excluded,
    presets,
    areaValues,
    statuses,
    symbolsFromStatus,
    segment: oneOf(view.segment, SEGMENTS, 'view.segment'),
    viewport,
    sort: { header: sortHeader, direction: oneOf(sortIn.direction, ['asc', 'desc'] as const, 'view.list.sort.direction') },
    filter: {
      kind: oneOf(filterIn.kind, FILTER_KINDS, 'view.list.filter.kind'),
      header: filterHeader,
      text: str(filterIn.text, 'view.list.filter.text'),
    },
  };
}

// Version 1 records a column mapping (header, kept flag, role) that includes
// the columns not kept at import. Those carry no data, so their roles do not
// apply. The name/title role did not exist in version 1.
const V1_ROLES: Role[] = ['identifier', 'start', 'end', 'area'];

function migrateMappingV1(columns: Json, headers: string[]): RoleAssignments {
  const mapping = arr(columns.mapping, 'columns.mapping').map((m, i) => {
    const o = obj(m, `columns.mapping[${i}]`);
    const role = str(o.role, `columns.mapping[${i}].role`);
    if (role !== 'none' && !(V1_ROLES as string[]).includes(role)) invalid('unknownValue', `columns.mapping[${i}].role`);
    return {
      header: str(o.header, `columns.mapping[${i}].header`),
      keep: bool(o.keep, `columns.mapping[${i}].keep`),
      role,
    };
  });
  const kept = mapping.filter((m) => m.keep).map((m) => m.header);
  if (kept.length !== headers.length || kept.some((h, i) => h !== headers[i])) {
    invalid('headersMismatch', 'columns.headers');
  }
  const roles: RoleAssignments = {};
  for (const m of mapping) {
    if (!m.keep || !isRole(m.role)) continue;
    if (roles[m.role] !== undefined) invalid('duplicateRole', m.role);
    roles[m.role] = m.header;
  }
  return roles;
}

function parseRolesV2(columns: Json, headers: string[]): RoleAssignments {
  const roles: RoleAssignments = {};
  for (const [role, key] of Object.entries(obj(columns.roles, 'columns.roles'))) {
    if (!isRole(role)) invalid('unknownValue', `columns.roles.${role}`);
    const header = str(key, `columns.roles.${role}`);
    if (!headers.includes(header)) invalid('notAColumn', `columns.roles.${role}`);
    if (Object.values(roles).includes(header)) invalid('duplicateRole', role);
    roles[role] = header;
  }
  return roles;
}

// Version 3: the columns added by hand. Each is a kept column with a manual
// key (which no imported column can have) and a non-empty label.
function parseManualColumns(columns: Json, headers: string[]): ManualColumn[] {
  const out: ManualColumn[] = [];
  for (const [i, c] of arr(columns.manual, 'columns.manual').entries()) {
    const o = obj(c, `columns.manual[${i}]`);
    const key = str(o.key, `columns.manual[${i}].key`);
    const label = str(o.label, `columns.manual[${i}].label`);
    if (!headers.includes(key) || !isManualKey(key)) invalid('notAColumn', `columns.manual[${i}].key`);
    if (out.some((m) => m.key === key)) invalid('duplicateEntry', `columns.manual[${i}]`);
    if (label.trim() === '') invalid('notText', `columns.manual[${i}].label`);
    out.push({ key, label });
  }
  return out;
}

// Version 5: the imported values edited by hand. Only imported columns of
// imported rows have imported values.
function parseEdited(value: unknown, where: string, headers: string[], manualRow: boolean): Record<string, string> {
  const o = obj(value, where);
  const out: Record<string, string> = {};
  for (const [key, original] of Object.entries(o)) {
    if (!headers.includes(key)) invalid('notAColumn', where);
    if (manualRow || isManualKey(key)) invalid('invalidEdit', `${where}.${key}`);
    out[key] = str(original, `${where}.${key}`);
  }
  return out;
}

// Version 5: the comments of a row, each with a timestamp and some text.
function parseComments(value: unknown, where: string): StoredComment[] {
  return arr(value, where).map((c, i) => {
    const o = obj(c, `${where}[${i}]`);
    const text = str(o.text, `${where}[${i}].text`);
    if (!isCommentDate(o.date) || text.trim() === '') invalid('invalidComment', `${where}[${i}]`);
    return { date: o.date, text };
  });
}
