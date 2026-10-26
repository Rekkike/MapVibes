import { describe, expect, test } from 'vitest';
import { columnKeys } from '../../src/columns';
import { emptyValues, isManualKey, newManualKey } from '../../src/manual';

describe('manual columns and rows (FR-9, FR-24)', () => {
  test('manual column keys are unique and never equal an imported key', () => {
    const imported = columnKeys(['Note', 'Note', '']);
    const first = newManualKey(imported);
    const second = newManualKey([...imported, first]);
    expect(first).not.toBe(second);
    expect(imported).not.toContain(first);
    expect(isManualKey(first)).toBe(true);
    expect(imported.some(isManualKey)).toBe(false);
  });

  test('a new row has an empty value for every column', () => {
    expect(emptyValues(['A', 'B'])).toEqual({ A: '', B: '' });
    expect(emptyValues([])).toEqual({});
  });
});
