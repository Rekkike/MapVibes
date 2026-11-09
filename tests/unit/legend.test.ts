import { describe, expect, test } from 'vitest';
import { defaultColourLabels, defaultSymbolLabels, legendModel, type LegendUse } from '../../src/legend';
import type { RowColour } from '../../src/dataset';
import type { MarkerSymbol } from '../../src/symbols';
import { en, sv } from '../../src/i18n';
import { SYMBOLS } from '../../src/symbols';
import { COLOURS } from '../../src/dataset';
import type { StatusEntry } from '../../src/vocab';

// The used-only legend (FR-75): the model filters every section by what the
// visible items carry; without the filter it holds the whole vocabulary, as
// the Map segment's legend and the documents' legends still do.

const statuses: StatusEntry[] = [
  { name: 'Planned', symbol: 'circle' },
  { name: 'Done', symbol: 'check' },
];

const groups = [
  { index: 1, name: 'Harbour' },
  { index: 2, name: 'Hills' },
];

function use(partial: { colours?: RowColour[]; symbols?: MarkerSymbol[]; statuses?: string[]; groups?: number[] }): LegendUse {
  return {
    colours: new Set(partial.colours ?? []),
    symbols: new Set(partial.symbols ?? []),
    statuses: new Set(partial.statuses ?? []),
    groups: new Set(partial.groups ?? []),
  };
}

describe('the legend model (FR-6, FR-75)', () => {
  test('without a filter the whole vocabulary is listed, as before', () => {
    const sections = legendModel(en, statuses, groups, defaultColourLabels(en), defaultSymbolLabels(en));
    expect(sections.map((s) => [s.kind, s.items.length])).toEqual([
      ['colours', 4],
      ['shapes', 13],
      ['statuses', 2],
      ['programs', 2],
    ]);
  });

  test('with a filter every section keeps only what the visible items carry', () => {
    const used = use({ colours: ['green', 'red'], symbols: ['circle', 'check', 'bolt'], statuses: ['Done'], groups: [2] });
    const sections = legendModel(en, statuses, groups, defaultColourLabels(en), defaultSymbolLabels(en), used);
    expect(sections.map((s) => [s.kind, s.items.map((i) => i.label)])).toEqual([
      ['colours', ['Green', 'Red']],
      ['shapes', ['Circle', 'Checkmark', 'Lightning bolt']],
      ['statuses', ['Done']],
      ['programs', ['Hills']],
    ]);
    // Each entry keeps its meaning: the status entry carries its symbol.
    expect(sections[2].items[0].symbol).toBe('check');
  });

  test('a section whose entries are all unused does not appear', () => {
    const used = use({ colours: ['blue'], symbols: ['gear'], statuses: [], groups: [] });
    const sections = legendModel(en, statuses, groups, defaultColourLabels(en), defaultSymbolLabels(en), used);
    expect(sections.map((s) => s.kind)).toEqual(['colours', 'shapes']);
  });

  test('nothing visible: no sections at all, in both languages', () => {
    for (const t of [en, sv]) {
      const sections = legendModel(t, statuses, groups, defaultColourLabels(t), defaultSymbolLabels(t), use({}));
      expect(sections).toEqual([]);
    }
  });

  test('the full vocabulary is still available for the Map segment and the documents', () => {
    expect(COLOURS).toHaveLength(4);
    expect(SYMBOLS).toHaveLength(13);
    expect(legendModel(en, [], [], defaultColourLabels(en), defaultSymbolLabels(en)).map((s) => s.kind)).toEqual(['colours', 'shapes']);
  });
});
