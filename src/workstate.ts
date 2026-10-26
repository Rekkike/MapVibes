// Work-state file (FR-13). The complete work state is written to, and read
// from, a single local JSON file on explicit Save and Open only. The file
// carries a schema version; a file with any other version is rejected.

import { COLOURS, type RowColour, type SortDirection, type ValueFilter } from './dataset';
import type { ColumnMapping, ColumnRole } from './ingest';
import type { Background } from './mapview';
import { SEGMENTS, type Segment } from './segments';
import type { Point, Viewport } from './viewport';

export const WORK_STATE_FORMAT = 'mapvibes-work-state';
export const WORK_STATE_SCHEMA_VERSION = 1;
export const SUGGESTED_FILE_NAME = 'mapvibes-work-state.json';

export interface WorkStateRow {
  values: Record<string, string>;
  colour: RowColour;
  removed: boolean;
}

export interface WorkStateMarker {
  // Index into WorkState.rows (ingestion order).
  row: number;
  position: Point;
}

// The in-memory snapshot of the work state. Rows are in ingestion order;
// the retained rows, in that order, carry the global sequential numbers.
export interface WorkState {
  mapping: ColumnMapping[];
  headers: string[];
  hiddenHeaders: string[];
  rows: WorkStateRow[];
  background: Background | null;
  markers: WorkStateMarker[];
  segment: Segment;
  viewport: Viewport;
  sort: { header: string | null; direction: SortDirection };
  filter: ValueFilter;
}

export type WorkStateErrorCode = 'not-json' | 'not-work-state' | 'unknown-version' | 'invalid';

export class WorkStateError extends Error {
  constructor(
    readonly code: WorkStateErrorCode,
    readonly detail: string,
  ) {
    super(`${code}: ${detail}`);
    this.name = 'WorkStateError';
  }
}

const ROLES: ColumnRole[] = ['none', 'identifier', 'start', 'end', 'area'];
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
      mapping: state.mapping.map((m) => ({ header: m.header, keep: m.keep, role: m.role })),
      headers: [...state.headers],
      hiddenInList: [...state.hiddenHeaders],
    },
    rows: state.rows.map((r, i) => ({
      values: { ...r.values },
      colour: r.colour,
      status: r.removed ? 'removed' : 'retained',
      number: numbers[i],
    })),
    background: state.background
      ? { dataUrl: state.background.src, width: state.background.width, height: state.background.height }
      : null,
    markers: state.markers.map((m) => ({ row: m.row, x: m.position.x, y: m.position.y })),
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

function invalid(detail: string): never {
  throw new WorkStateError('invalid', detail);
}

function obj(value: unknown, where: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid(`${where} is not an object`);
  return value as Json;
}

function arr(value: unknown, where: string): unknown[] {
  if (!Array.isArray(value)) invalid(`${where} is not a list`);
  return value;
}

function str(value: unknown, where: string): string {
  if (typeof value !== 'string') invalid(`${where} is not text`);
  return value;
}

function num(value: unknown, where: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) invalid(`${where} is not a finite number`);
  return value;
}

function bool(value: unknown, where: string): boolean {
  if (typeof value !== 'boolean') invalid(`${where} is not true or false`);
  return value;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], where: string): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) invalid(`${where} has an unknown value`);
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
  if (file.schemaVersion !== WORK_STATE_SCHEMA_VERSION) {
    throw new WorkStateError('unknown-version', String(file.schemaVersion));
  }

  const columns = obj(file.columns, 'columns');
  const mapping: ColumnMapping[] = arr(columns.mapping, 'columns.mapping').map((m, i) => {
    const o = obj(m, `columns.mapping[${i}]`);
    return {
      header: str(o.header, `columns.mapping[${i}].header`),
      keep: bool(o.keep, `columns.mapping[${i}].keep`),
      role: oneOf(o.role, ROLES, `columns.mapping[${i}].role`),
    };
  });
  const headers = arr(columns.headers, 'columns.headers').map((h, i) => str(h, `columns.headers[${i}]`));
  const kept = mapping.filter((m) => m.keep).map((m) => m.header);
  if (kept.length !== headers.length || kept.some((h, i) => h !== headers[i])) {
    invalid('columns.headers does not match the kept columns of the mapping');
  }
  const hiddenHeaders = arr(columns.hiddenInList, 'columns.hiddenInList').map((h, i) => {
    const header = str(h, `columns.hiddenInList[${i}]`);
    if (!headers.includes(header)) invalid(`columns.hiddenInList[${i}] is not a kept column`);
    return header;
  });

  const rows: WorkStateRow[] = arr(file.rows, 'rows').map((r, i) => {
    const o = obj(r, `rows[${i}]`);
    const valuesIn = obj(o.values, `rows[${i}].values`);
    const values: Record<string, string> = {};
    for (const [k, v] of Object.entries(valuesIn)) {
      if (!headers.includes(k)) invalid(`rows[${i}].values has a column that is not kept`);
      values[k] = str(v, `rows[${i}].values`);
    }
    return {
      values,
      colour: oneOf(o.colour, COLOURS, `rows[${i}].colour`),
      removed: oneOf(o.status, ['retained', 'removed'] as const, `rows[${i}].status`) === 'removed',
    };
  });
  const expected = rowNumbers(rows);
  arr(file.rows, 'rows').forEach((r, i) => {
    if ((r as Json).number !== expected[i]) invalid(`rows[${i}].number breaks the global sequential numbering`);
  });

  let background: Background | null = null;
  if (file.background !== null) {
    const b = obj(file.background, 'background');
    const src = str(b.dataUrl, 'background.dataUrl');
    // Only embedded image data is accepted: a URL would make the browser
    // fetch a resource, which the privacy constraints forbid.
    if (!/^data:image\/[a-z0-9.+-]+(;[a-z0-9=.+-]+)*,/i.test(src)) invalid('background.dataUrl is not embedded image data');
    const width = num(b.width, 'background.width');
    const height = num(b.height, 'background.height');
    if (width <= 0 || height <= 0) invalid('background size is not positive');
    background = { src, width, height };
  }

  const placed = new Set<number>();
  const markers: WorkStateMarker[] = arr(file.markers, 'markers').map((m, i) => {
    const o = obj(m, `markers[${i}]`);
    const row = num(o.row, `markers[${i}].row`);
    if (!Number.isInteger(row) || row < 0 || row >= rows.length) invalid(`markers[${i}].row does not refer to a row`);
    if (rows[row].removed) invalid(`markers[${i}] belongs to a removed row`);
    if (placed.has(row)) invalid(`markers[${i}] duplicates the marker of another entry`);
    placed.add(row);
    return { row, position: { x: num(o.x, `markers[${i}].x`), y: num(o.y, `markers[${i}].y`) } };
  });
  if (markers.length > 0 && !background) invalid('markers are present without a background');

  const view = obj(file.view, 'view');
  const vp = obj(view.viewport, 'view.viewport');
  const viewport = { scale: num(vp.scale, 'view.viewport.scale'), x: num(vp.x, 'view.viewport.x'), y: num(vp.y, 'view.viewport.y') };
  if (viewport.scale <= 0) invalid('view.viewport.scale is not positive');
  const list = obj(view.list, 'view.list');
  const sortIn = obj(list.sort, 'view.list.sort');
  const sortHeader = sortIn.header === null ? null : str(sortIn.header, 'view.list.sort.header');
  if (sortHeader !== null && !headers.includes(sortHeader)) invalid('view.list.sort.header is not a kept column');
  const filterIn = obj(list.filter, 'view.list.filter');
  const filterHeader = str(filterIn.header, 'view.list.filter.header');
  if (filterHeader !== '' && !headers.includes(filterHeader)) invalid('view.list.filter.header is not a kept column');

  return {
    mapping,
    headers,
    hiddenHeaders,
    rows,
    background,
    markers,
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
