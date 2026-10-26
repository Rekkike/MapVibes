import { describe, expect, test } from 'vitest';
import { ICON_PATHS, ICONS, isIcon, isSymbol, symbolClasses, SYMBOLS } from '../../src/symbols';

describe('marker symbol library (FR-26)', () => {
  test('the library holds the five shapes and the six icons', () => {
    expect(SYMBOLS).toEqual(['circle', 'square', 'diamond', 'triangle', 'hexagon', 'bulb', 'magnifier', 'gear', 'pause', 'cross', 'check']);
    expect(ICONS.every((i) => ICON_PATHS[i].startsWith('M'))).toBe(true);
    expect(isSymbol('gear')).toBe(true);
    expect(isSymbol('star')).toBe(false);
    expect(isIcon('circle')).toBe(false);
  });

  test('icons sit on the default outline; shapes set their own', () => {
    expect(symbolClasses('check')).toBe('marker-icon marker-icon-check');
    expect(symbolClasses('diamond')).toBe('marker-shape-diamond');
  });
});
