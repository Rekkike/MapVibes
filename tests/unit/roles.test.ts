import { describe, expect, test } from 'vitest';
import { assignRole, displayName, listColumnOrder, pruneRoles, roleOfColumn } from '../../src/roles';

describe('roles (FR-1)', () => {
  test('assigning a role moves it from any other column and replaces the column\'s previous role', () => {
    let roles = assignRole({}, 'A', 'identifier');
    roles = assignRole(roles, 'B', 'identifier');
    expect(roles).toEqual({ identifier: 'B' });
    roles = assignRole(roles, 'B', 'name');
    expect(roles).toEqual({ name: 'B' });
    roles = assignRole(roles, 'B', null);
    expect(roles).toEqual({});
    expect(roleOfColumn({ area: 'X' }, 'X')).toBe('area');
    expect(roleOfColumn({ area: 'X' }, 'Y')).toBeNull();
  });

  test('display name: name/title, else identifier, else the number label', () => {
    const roles = { name: 'N', identifier: 'I' };
    expect(displayName({ N: 'Title', I: 'id-1' }, roles, 'No. 1')).toBe('Title');
    expect(displayName({ N: '  ', I: 'id-1' }, roles, 'No. 1')).toBe('id-1');
    expect(displayName({ N: '', I: '' }, roles, 'No. 1')).toBe('No. 1');
    expect(displayName({ N: 'Title' }, {}, 'No. 7')).toBe('No. 7');
  });

  test('the name/title column leads the list order; the rest keep file order', () => {
    expect(listColumnOrder(['A', 'B', 'C'], { name: 'C' })).toEqual(['C', 'A', 'B']);
    expect(listColumnOrder(['A', 'B', 'C'], {})).toEqual(['A', 'B', 'C']);
    expect(listColumnOrder(['A', 'B'], { name: 'Z' })).toEqual(['A', 'B']);
  });

  test('assignments to missing columns are pruned', () => {
    expect(pruneRoles({ name: 'A', area: 'Z' }, ['A', 'B'])).toEqual({ name: 'A' });
  });
});
