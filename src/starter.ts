// The default vocabulary (FR-45 and FR-54 as amended in v2.6.0): the
// owner-ruled colour and symbol names a new work starts with, in the
// interface language. They are ordinary label data of the work: editable,
// cleared like any label, saved with the work; the application's logic reads
// none of them. A starter name the user has not edited follows the interface
// language, as the demo's provided labels do (FR-41 as amended).

import type { RowColour } from './dataset';
import { strings, type Lang } from './i18n';
import type { MarkerSymbol } from './symbols';

export function starterColourLabels(lang: Lang): Record<RowColour, string> {
  const t = strings(lang);
  return { green: t.vocabGreen, blue: t.vocabBlue, yellow: t.vocabYellow, red: t.vocabRed };
}

// The five named symbols; the other eight start unnamed (shown, never
// explained).
export function starterSymbolLabels(lang: Lang): Partial<Record<MarkerSymbol, string>> {
  const t = strings(lang);
  return { bolt: t.vocabBolt, bulb: t.vocabBulb, magnifier: t.vocabMagnifier, gear: t.vocabGear, 'hammer-shovel': t.vocabHammerShovel };
}

// The labels of a work, as the vocabulary functions read and change them.
export interface WorkLabels {
  colourLabels: Partial<Record<RowColour, string>>;
  symbolLabels: Partial<Record<MarkerSymbol, string>>;
}

// A new work's vocabulary: the starter names in the given language.
export function applyStarterVocabulary(work: WorkLabels, lang: Lang): void {
  work.colourLabels = { ...starterColourLabels(lang) };
  work.symbolLabels = { ...starterSymbolLabels(lang) };
}

// A change of language: each label that still holds the starter name of the
// language left takes the starter name of the language chosen; any other
// label stays as typed. Returns whether anything changed.
export function followStarterVocabulary(work: WorkLabels, from: Lang, to: Lang): boolean {
  if (from === to) {
    return false;
  }
  let changed = false;
  const colourFrom = starterColourLabels(from);
  const colourTo = starterColourLabels(to);
  for (const colour of Object.keys(colourFrom) as RowColour[]) {
    if (work.colourLabels[colour] === colourFrom[colour]) {
      work.colourLabels[colour] = colourTo[colour];
      changed = true;
    }
  }
  const symbolFrom = starterSymbolLabels(from);
  const symbolTo = starterSymbolLabels(to);
  for (const symbol of Object.keys(symbolFrom) as MarkerSymbol[]) {
    if (work.symbolLabels[symbol] === symbolFrom[symbol]) {
      work.symbolLabels[symbol] = symbolTo[symbol]!;
      changed = true;
    }
  }
  return changed;
}
