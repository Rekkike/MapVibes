import { describe, expect, test } from 'vitest';
import { findMatchingPreset, parsePresets, presetConfiguration, presetMatches, removePreset, upsertPreset, type ColumnPreset } from '../../src/presets';

const p = (name: string, headers: string[], extra: Partial<ColumnPreset> = {}): ColumnPreset => ({
  name,
  headers,
  hidden: [],
  roles: {},
  ...extra,
});

describe('column presets (FR-23)', () => {
  test('a preset matches the same headers in any order, and nothing else', () => {
    const preset = p('A', ['ID', 'Start', 'Note']);
    expect(presetMatches(preset, ['ID', 'Start', 'Note'])).toBe(true);
    expect(presetMatches(preset, ['Note', 'ID', 'Start'])).toBe(true);
    expect(presetMatches(preset, ['ID', 'Start'])).toBe(false);
    expect(presetMatches(preset, ['ID', 'Start', 'Note', 'Extra'])).toBe(false);
    expect(presetMatches(preset, ['ID', 'Start', 'Other'])).toBe(false);
    expect(presetMatches(p('B', ['X', 'X']), ['X', 'Y'])).toBe(false);
  });

  test('the most recently saved matching preset is chosen automatically', () => {
    let list: ColumnPreset[] = [];
    list = upsertPreset(list, p('first', ['A', 'B']));
    list = upsertPreset(list, p('other', ['C']));
    list = upsertPreset(list, p('second', ['B', 'A']));
    expect(findMatchingPreset(list, ['A', 'B'])!.name).toBe('second');
    list = upsertPreset(list, p('first', ['A', 'B'], { hidden: ['B'] }));
    expect(findMatchingPreset(list, ['A', 'B'])!.name).toBe('first');
    expect(list.map((x) => x.name)).toEqual(['other', 'second', 'first']);
    expect(findMatchingPreset(list, ['Z'])).toBeNull();
  });

  test('applying a preset ignores settings for absent columns', () => {
    const preset = p('A', ['ID', 'Note', 'Gone'], { hidden: ['Note', 'Gone'], roles: { identifier: 'ID', area: 'Gone' } });
    expect(presetConfiguration(preset, ['ID', 'Note'])).toEqual({ hidden: ['Note'], roles: { identifier: 'ID' } });
  });

  test('removing a preset removes only that preset', () => {
    const list = [p('A', ['x']), p('B', ['y'])];
    expect(removePreset(list, 'A').map((x) => x.name)).toEqual(['B']);
    expect(removePreset(list, 'none')).toHaveLength(2);
  });

  test('stored preset data is validated', () => {
    expect(parsePresets([p('A', ['x'], { hidden: ['x'], roles: { name: 'x' } })])).toHaveLength(1);
    for (const bad of [
      'nope',
      [{ name: '', headers: [], hidden: [], roles: {} }],
      [p('A', ['x']), p('A', ['y'])],
      [p('A', ['x'], { hidden: ['y'] })],
      [p('A', ['x'], { roles: { name: 'y' } })],
      [p('A', ['x'], { roles: { owner: 'x' } as never })],
      [p('A', ['x', 'y'], { roles: { name: 'x', identifier: 'x' } })],
    ]) {
      expect(parsePresets(bad)).toBeNull();
    }
  });

  test('a preset may carry the area vocabulary, which is validated and copied', () => {
    const parsed = parsePresets([p('A', ['x'], { areas: ['North', 'South'] })])!;
    expect(parsed[0].areas).toEqual(['North', 'South']);
    expect(parsePresets([p('A', ['x'], { areas: ['North', 'North'] })])).toBeNull();
    expect(parsePresets([p('A', ['x'])])![0].areas).toBeUndefined();
    const saved = upsertPreset([], p('B', ['x'], { areas: ['East'] }));
    expect(saved[0].areas).toEqual(['East']);
  });

  test('a preset may carry the status vocabulary with symbols, which is validated', () => {
    expect(parsePresets([p('A', ['x'], { statuses: [{ name: 'Open', symbol: 'square' }] })])![0].statuses).toEqual([{ name: 'Open', symbol: 'square' }]);
    expect(parsePresets([p('A', ['x'], { statuses: [{ name: 'Open', symbol: 'unknown' }] })])).toBeNull();
  });
});
