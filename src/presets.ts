// Saved column presets (FR-23). A preset records a column configuration
// (hidden columns and role assignments) for a set of column keys, under a
// name chosen by the user.

import { isRole, ROLES, type RoleAssignments } from './roles';
import { parseStatuses, parseValueList, type StatusEntry } from './vocab';
import { isSymbol } from './symbols';

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
  return out;
}

// Validates untrusted preset data (local storage or a work-state file).
// Returns null if the data is not a valid preset list.
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
