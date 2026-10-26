// User-managed vocabularies (FR-32, FR-33). Every vocabulary starts empty and
// is populated by the user; nothing is predefined. A vocabulary is an ordered
// list of unique, non-empty values (compared after trimming).

export function normalise(value: string): string {
  return value.trim();
}

export function hasValue(list: string[], value: string): boolean {
  const v = normalise(value);
  return v !== '' && list.includes(v);
}

// Adds a value at the end; an empty or already present value adds nothing.
export function addValue(list: string[], value: string): string[] {
  const v = normalise(value);
  if (v === '' || list.includes(v)) return list;
  return [...list, v];
}

export function removeValue(list: string[], value: string): string[] {
  return list.filter((v) => v !== value);
}

export type RenameResult = { list: string[]; renamed: boolean };

// Renames a value in place. Renaming to an empty value or to another value
// that is already in the list is refused.
export function renameValue(list: string[], from: string, to: string): RenameResult {
  const v = normalise(to);
  if (!list.includes(from) || v === '' || (v !== from && list.includes(v))) return { list, renamed: false };
  return { list: list.map((x) => (x === from ? v : x)), renamed: v !== from };
}

// Moves a value one place up (-1) or down (+1).
export function moveValue(list: string[], value: string, step: -1 | 1): string[] {
  const i = list.indexOf(value);
  const j = i + step;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

// The non-empty values present in a column, in first-seen order.
export function collectValues(rows: Array<{ values: Record<string, string> }>, key: string): string[] {
  let list: string[] = [];
  for (const row of rows) list = addValue(list, row.values[key] ?? '');
  return list;
}

// Adds every given value that is not yet present, keeping the existing order.
export function mergeValues(list: string[], values: string[]): string[] {
  return values.reduce((acc, v) => addValue(acc, v), list);
}

export function parseValueList(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  let list: string[] = [];
  for (const v of raw) {
    if (typeof v !== 'string' || normalise(v) === '' || list.includes(normalise(v))) return null;
    list = addValue(list, v);
  }
  return list;
}

// The status vocabulary (FR-33): ordered statuses, each with a name and the
// marker symbol assigned to it. A new status gets the default symbol until
// the user assigns another.
export interface StatusEntry {
  name: string;
  symbol: string;
}

export function statusNames(statuses: StatusEntry[]): string[] {
  return statuses.map((s) => s.name);
}

export function addStatus(statuses: StatusEntry[], name: string, symbol: string): StatusEntry[] {
  const names = addValue(statusNames(statuses), name);
  if (names.length === statuses.length) return statuses;
  return [...statuses, { name: names[names.length - 1], symbol }];
}

export function removeStatus(statuses: StatusEntry[], name: string): StatusEntry[] {
  return statuses.filter((s) => s.name !== name);
}

export function renameStatus(statuses: StatusEntry[], from: string, to: string): { statuses: StatusEntry[]; renamed: boolean; name: string } {
  const { list, renamed } = renameValue(statusNames(statuses), from, to);
  if (!renamed) return { statuses, renamed: false, name: from };
  const name = list[statusNames(statuses).indexOf(from)];
  return { statuses: statuses.map((s) => (s.name === from ? { ...s, name } : s)), renamed: true, name };
}

export function moveStatus(statuses: StatusEntry[], name: string, step: -1 | 1): StatusEntry[] {
  const order = moveValue(statusNames(statuses), name, step);
  if (order === statusNames(statuses) || order.every((n, i) => n === statuses[i].name)) return statuses;
  return order.map((n) => statuses.find((s) => s.name === n)!);
}

export function setStatusSymbol(statuses: StatusEntry[], name: string, symbol: string): StatusEntry[] {
  return statuses.map((s) => (s.name === name ? { ...s, symbol } : s));
}

export function statusSymbol(statuses: StatusEntry[], value: string): string | null {
  const v = normalise(value);
  return statuses.find((s) => s.name === v)?.symbol ?? null;
}

export function parseStatuses(raw: unknown, isSymbol: (v: unknown) => boolean): StatusEntry[] | null {
  if (!Array.isArray(raw)) return null;
  const out: StatusEntry[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) return null;
    const o = item as Record<string, unknown>;
    if (typeof o.name !== 'string' || normalise(o.name) === '' || out.some((s) => s.name === normalise(o.name as string))) return null;
    if (!isSymbol(o.symbol)) return null;
    out.push({ name: normalise(o.name), symbol: o.symbol as string });
  }
  return out;
}
