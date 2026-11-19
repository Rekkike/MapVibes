import { describe, expect, test } from 'vitest';
import { applyStarterVocabulary, followStarterVocabulary, starterColourLabels, starterSymbolLabels, type WorkLabels } from '../../src/starter';
import { SYMBOLS } from '../../src/symbols';

// The default vocabulary (FR-45 and FR-54 as amended in v2.6.0): the
// owner-ruled names a new work starts with, in both interface languages, as
// ordinary label data; untouched names follow the language, edited names stay.
describe('the default vocabulary (FR-45, FR-54 as amended in v2.6.0)', () => {
  test('the ruled colour and symbol names, in both languages', () => {
    expect(starterColourLabels('sv')).toEqual({ green: 'Internt projekt', blue: 'Externt projekt', yellow: 'Paus', red: 'Stopp' });
    expect(starterColourLabels('en')).toEqual({ green: 'Internal project', blue: 'External project', yellow: 'Pause', red: 'Stop' });
    expect(starterSymbolLabels('sv')).toEqual({
      bolt: 'OPS kaj',
      bulb: 'Idéfas',
      magnifier: 'Förstudie',
      gear: 'Projektering',
      'hammer-shovel': 'Genomförande',
    });
    expect(starterSymbolLabels('en')).toEqual({
      bolt: 'OPS quay',
      bulb: 'Idea phase',
      magnifier: 'Pre-study',
      gear: 'Engineering',
      'hammer-shovel': 'Execution',
    });
    // The other eight symbols start unnamed: shown, never explained.
    expect(SYMBOLS.filter((s) => starterSymbolLabels('en')[s] === undefined)).toEqual([
      'circle',
      'square',
      'diamond',
      'triangle',
      'hexagon',
      'pause',
      'cross',
      'check',
    ]);
  });

  test('a new work starts with them; untouched names follow the language both ways, edited names stay as typed', () => {
    const work: WorkLabels = { colourLabels: {}, symbolLabels: {} };
    applyStarterVocabulary(work, 'en');
    expect(work.colourLabels.green).toBe('Internal project');
    work.colourLabels.red = 'Halted';
    work.symbolLabels.gear = 'Design';
    expect(followStarterVocabulary(work, 'en', 'sv')).toBe(true);
    expect(work.colourLabels).toEqual({ green: 'Internt projekt', blue: 'Externt projekt', yellow: 'Paus', red: 'Halted' });
    expect(work.symbolLabels).toEqual({ bolt: 'OPS kaj', bulb: 'Idéfas', magnifier: 'Förstudie', gear: 'Design', 'hammer-shovel': 'Genomförande' });
    expect(followStarterVocabulary(work, 'sv', 'en')).toBe(true);
    expect(work.colourLabels.green).toBe('Internal project');
    expect(followStarterVocabulary(work, 'en', 'en')).toBe(false);
  });
});
