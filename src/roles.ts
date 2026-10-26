// Column roles (FR-1). Roles are optional; each role is assigned to at most
// one column, identified by its column key.

export type Role = 'identifier' | 'name' | 'start' | 'end' | 'area' | 'status' | 'program' | 'note';

export const ROLES: Role[] = ['identifier', 'name', 'start', 'end', 'area', 'status', 'program', 'note'];

export type RoleAssignments = Partial<Record<Role, string>>;

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as string[]).includes(value);
}

export function roleOfColumn(roles: RoleAssignments, key: string): Role | null {
  return ROLES.find((r) => roles[r] === key) ?? null;
}

// Assigns a role to a column (or clears the column's role with null). A role
// moves: it is removed from any other column that held it.
export function assignRole(roles: RoleAssignments, key: string, role: Role | null): RoleAssignments {
  const next: RoleAssignments = {};
  for (const r of ROLES) {
    const holder = roles[r];
    if (holder !== undefined && holder !== key && r !== role) next[r] = holder;
  }
  if (role) next[role] = key;
  return next;
}

// Drops assignments to columns that do not exist.
export function pruneRoles(roles: RoleAssignments, headers: string[]): RoleAssignments {
  const next: RoleAssignments = {};
  for (const r of ROLES) {
    const holder = roles[r];
    if (holder !== undefined && headers.includes(holder)) next[r] = holder;
  }
  return next;
}

// The display name of an item (FR-1): the name/title value where that role is
// assigned and the value is not empty; otherwise the identifier value;
// otherwise the item's global number, formatted by the caller.
export function displayName(
  values: Record<string, string>,
  roles: RoleAssignments,
  numberLabel: string,
): string {
  for (const role of ['name', 'identifier'] as const) {
    const key = roles[role];
    const value = key === undefined ? '' : (values[key] ?? '').trim();
    if (value !== '') return value;
  }
  return numberLabel;
}

// The list's column order: the name/title column, where assigned, leads as
// the primary label; the other columns keep the file's order.
export function listColumnOrder(headers: string[], roles: RoleAssignments): string[] {
  const name = roles.name;
  if (name === undefined || !headers.includes(name)) return [...headers];
  return [name, ...headers.filter((h) => h !== name)];
}
