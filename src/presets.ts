// Saved column presets (FR-23). A preset records a column configuration
// (hidden columns and role assignments) for a set of column keys, under a
// name chosen by the user.

import { isRole, ROLES, type RoleAssignments } from './roles';
import { parseStatuses, parseValueList, type StatusEntry } from './vocab';
import { isSymbol } from './symbols';
import { SERIES_ROLES, type SeriesAssignments } from './economics';

export interface ColumnPreset {
  name: string;
  headers: string[];
  hidden: string[];
  roles: RoleAssignments;
  // The user's area vocabulary (FR-32), when saved with the preset.
  areas?: string[];
  // The user's program vocabulary (FR-43), when saved with the preset.
  programs?: string[];
  // The user's status vocabulary (FR-33), when saved with the preset.
  statuses?: StatusEntry[];
  // The card fields (FR-62), the year series' roles (FR-63), and the
  // currency unit (FR-64), when saved with the preset.
  cardColumns?: string[];
  series?: SeriesAssignments;
  currencyUnit?: string;
}

function sortedCopy(values: string[]): string[] {
  return [...values].sort();
}

// A preset matches an import with the same headers (the same column keys,
// in any order).
export function presetMatches(preset: ColumnPreset, headers: string[]): boolean {
  if (preset.headers.length !== headers.length) return false;
  const a = sortedCopy(preset.headers);
  const b = sortedCopy(headers);
  return a.every((h, i) => h === b[i]);
}

// The preset applied automatically to an import: the most recently saved
// matching preset (presets are kept in save order, latest last).
export function findMatchingPreset(presets: ColumnPreset[], headers: string[]): ColumnPreset | null {
  for (let i = presets.length - 1; i >= 0; i--) {
    if (presetMatches(presets[i], headers)) return presets[i];
  }
  return null;
}

// The configuration a preset gives to the given columns: settings for columns
// that are not present are ignored.
export function presetConfiguration(preset: ColumnPreset, headers: string[]): { hidden: string[]; roles: RoleAssignments } {
  const roles: RoleAssignments = {};
  for (const r of ROLES) {
    const key = preset.roles[r];
    if (key !== undefined && headers.includes(key)) roles[r] = key;
  }
  return { hidden: preset.hidden.filter((h) => headers.includes(h)), roles };
}

// Saves a preset; a preset with the same name is replaced. The saved preset
// becomes the most recent.
export function upsertPreset(presets: ColumnPreset[], preset: ColumnPreset): ColumnPreset[] {
  return [...presets.filter((p) => p.name !== preset.name), clonePreset(preset)];
}

export function removePreset(presets: ColumnPreset[], name: string): ColumnPreset[] {
  return presets.filter((p) => p.name !== name);
}

export function clonePreset(p: ColumnPreset): ColumnPreset {
  const out: ColumnPreset = { name: p.name, headers: [...p.headers], hidden: [...p.hidden], roles: { ...p.roles } };
  if (p.areas) out.areas = [...p.areas];
  if (p.programs) out.programs = [...p.programs];
  if (p.statuses) out.statuses = p.statuses.map((s) => ({ ...s }));
  if (p.cardColumns) out.cardColumns = [...p.cardColumns];
  if (p.series) out.series = Object.fromEntries(Object.entries(p.series).map(([r, a]) => [r, { ...a, columns: { ...a.columns } }]));
  if (p.currencyUnit !== undefined) out.currencyUnit = p.currencyUnit;
  return out;
}

// Validates untrusted preset data (local storage or a work-state file).
// Returns null if the data is not a valid preset list.
function parseSeries(raw: unknown, headers: string[]): SeriesAssignments | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const out: SeriesAssignments = {};
  for (const [role, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!(SERIES_ROLES as string[]).includes(role) || typeof value !== 'object' || value === null) return null;
    const a = value as Record<string, unknown>;
    if (typeof a.name !== 'string' || typeof a.columns !== 'object' || a.columns === null) return null;
    const columns: Record<string, string> = {};
    for (const [year, key] of Object.entries(a.columns as Record<string, unknown>)) {
      if (!/^\d{4}$/.test(year) || typeof key !== 'string' || !headers.includes(key)) return null;
      columns[year] = key;
    }
    if (a.total !== null && (typeof a.total !== 'string' || !headers.includes(a.total))) return null;
    out[role as keyof SeriesAssignments] = { name: a.name, columns, total: a.total as string | null };
  }
  return out;
}

export function parsePresets(raw: unknown): ColumnPreset[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ColumnPreset[] = [];
  const names = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) return null;
    const o = item as Record<string, unknown>;
    if (typeof o.name !== 'string' || o.name.trim() === '' || names.has(o.name)) return null;
    if (!Array.isArray(o.headers) || !o.headers.every((h) => typeof h === 'string')) return null;
    if (!Array.isArray(o.hidden) || !o.hidden.every((h) => typeof h === 'string' && (o.headers as string[]).includes(h))) return null;
    if (typeof o.roles !== 'object' || o.roles === null || Array.isArray(o.roles)) return null;
    const roles: RoleAssignments = {};
    for (const [role, key] of Object.entries(o.roles as Record<string, unknown>)) {
      if (!isRole(role) || typeof key !== 'string' || !(o.headers as string[]).includes(key)) return null;
      if (Object.values(roles).includes(key)) return null;
      roles[role] = key;
    }
    names.add(o.name);
    const preset: ColumnPreset = { name: o.name, headers: [...(o.headers as string[])], hidden: [...(o.hidden as string[])], roles };
    if (o.programs !== undefined) {
      const programs = parseValueList(o.programs);
      if (programs === null) return null;
      preset.programs = programs;
    }
    if (o.areas !== undefined) {
      const areas = parseValueList(o.areas);
      if (areas === null) return null;
      preset.areas = areas;
    }
    if (o.statuses !== undefined) {
      const statuses = parseStatuses(o.statuses, isSymbol);
      if (statuses === null) return null;
      preset.statuses = statuses;
    }
    const headers = o.headers as string[];
    if (o.cardColumns !== undefined) {
      if (!Array.isArray(o.cardColumns) || !o.cardColumns.every((h) => typeof h === 'string' && headers.includes(h))) return null;
      preset.cardColumns = [...(o.cardColumns as string[])];
    }
    if (o.series !== undefined) {
      const series = parseSeries(o.series, headers);
      if (series === null) return null;
      preset.series = series;
    }
    if (o.currencyUnit !== undefined) {
      if (typeof o.currencyUnit !== 'string') return null;
      preset.currencyUnit = o.currencyUnit;
    }
    out.push(preset);
  }
  return out;
}

const STORAGE_KEY = 'mapvibes.presets';

function storage(): Storage | null {
  try {
    const s = globalThis.localStorage;
    s.getItem(STORAGE_KEY);
    return s;
  } catch {
    return null;
  }
}

export function loadStoredPresets(): ColumnPreset[] {
  const s = storage();
  if (!s) return [];
  try {
    const raw = s.getItem(STORAGE_KEY);
    return raw ? (parsePresets(JSON.parse(raw)) ?? []) : [];
  } catch {
    return [];
  }
}

export function storePresets(presets: ColumnPreset[]): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // Storage full or blocked: presets remain available for this session.
  }
}
