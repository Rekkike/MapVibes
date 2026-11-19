import { describe, expect, test } from 'vitest';
import { defaultColourLabels, defaultSymbolLabels, legendModel, type LegendUse } from '../../src/legend';
import type { RowColour } from '../../src/dataset';
import type { MarkerSymbol } from '../../src/symbols';
import { en, sv } from '../../src/i18n';
import { SYMBOLS } from '../../src/symbols';
import { COLOURS } from '../../src/dataset';
import type { StatusEntry } from '../../src/vocab';
import { starterSymbolLabels } from '../../src/starter';
import type { SymbolLabels } from '../../src/legend';

// The used-only legend (FR-75): the model filters every section by what the
// visible items carry; without the filter it holds the whole vocabulary, as
// the Map segment's legend and the documents' legends still do. Since v2.6.0
// (FR-54 and FR-75 as amended) the symbols section explains named symbols
// only, and never a glyph the statuses line already shows.

// The default vocabulary's symbol names in English, the other symbols unnamed.
const named = (t: 'en' | 'sv'): SymbolLabels => ({ ...defaultSymbolLabels(), ...starterSymbolLabels(t) });

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
  test('without a filter the whole vocabulary is listed: the named symbols only, the statuses with their glyphs', () => {
    const sections = legendModel(en, statuses, groups, defaultColourLabels(en), named('en'));
    expect(sections.map((s) => [s.kind, s.items.map((i) => i.label)])).toEqual([
      ['colours', ['Green', 'Blue', 'Yellow', 'Red']],
      ['shapes', ['Idea phase', 'Pre-study', 'Engineering', 'Execution', 'OPS quay']],
      ['statuses', ['Planned', 'Done']],
      ['programs', ['Harbour', 'Hills']],
    ]);
  });

  test('one of each glyph stands: the statuses line keeps its glyphs, the symbols section drops them (FR-75 as amended)', () => {
    const own: StatusEntry[] = [
      { name: 'Planerad', symbol: 'bulb' },
      { name: 'Pågår', symbol: 'hammer-shovel' },
      { name: 'Klar', symbol: 'check' },
    ];
    const sections = legendModel(sv, own, [], defaultColourLabels(sv), named('sv'));
    const glyphs = sections.flatMap((s) => s.items.filter((i) => i.symbol).map((i) => i.symbol));
    expect(new Set(glyphs).size).toBe(glyphs.length);
    expect(sections.find((s) => s.kind === 'shapes')!.items.map((i) => i.label)).toEqual(['Förstudie', 'Projektering', 'OPS kaj']);
    expect(sections.find((s) => s.kind === 'statuses')!.items.map((i) => [i.label, i.symbol])).toEqual([
      ['Planerad', 'bulb'],
      ['Pågår', 'hammer-shovel'],
      ['Klar', 'check'],
    ]);
  });

  test('no tautologies: an unnamed symbol is never explained, and a symbols section with nothing to explain does not appear', () => {
    const sections = legendModel(en, [], [], defaultColourLabels(en), defaultSymbolLabels());
    expect(sections.map((s) => s.kind)).toEqual(['colours']);
    const blank = { ...named('en'), cross: '  ' };
    expect(legendModel(en, [], [], defaultColourLabels(en), blank, use({ symbols: ['cross', 'circle'] }))).toEqual([]);
  });

  test('with a filter every section keeps only what the visible items carry', () => {
    const used = use({ colours: ['green', 'red'], symbols: ['circle', 'check', 'bolt', 'gear'], statuses: ['Done'], groups: [2] });
    const sections = legendModel(en, statuses, groups, defaultColourLabels(en), named('en'), used);
    expect(sections.map((s) => [s.kind, s.items.map((i) => i.label)])).toEqual([
      ['colours', ['Green', 'Red']],
      ['shapes', ['Engineering', 'OPS quay']],
      ['statuses', ['Done']],
      ['programs', ['Hills']],
    ]);
    // Each entry keeps its meaning: the status entry carries its symbol.
    expect(sections[2].items[0].symbol).toBe('check');
  });

  test('a section whose entries are all unused does not appear', () => {
    const used = use({ colours: ['blue'], symbols: ['gear'], statuses: [], groups: [] });
    const sections = legendModel(en, statuses, groups, defaultColourLabels(en), named('en'), used);
    expect(sections.map((s) => s.kind)).toEqual(['colours', 'shapes']);
  });

  test('nothing visible: no sections at all, in both languages', () => {
    for (const t of [en, sv]) {
      const sections = legendModel(t, statuses, groups, defaultColourLabels(t), defaultSymbolLabels(), use({}));
      expect(sections).toEqual([]);
    }
  });

  test('the full vocabulary is still available for the Map segment and the documents', () => {
    expect(COLOURS).toHaveLength(4);
    expect(SYMBOLS).toHaveLength(13);
    expect(legendModel(en, [], [], defaultColourLabels(en), named('en')).map((s) => s.kind)).toEqual(['colours', 'shapes']);
  });
});
