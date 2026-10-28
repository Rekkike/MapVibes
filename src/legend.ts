// Legend (FR-6): explains the marker colours. It is rendered into every view
// that shows markers (the Map segment and the Presentation stage).

import { COLOURS, type RowColour } from './dataset';
import { drawSymbol, SYMBOLS, symbolClasses, type MarkerSymbol } from './symbols';
import type { StatusEntry } from './vocab';
import type { Strings } from './i18n';

export function colourName(t: Strings, colour: RowColour): string {
  const names: Record<RowColour, string> = { green: t.colourGreen, blue: t.colourBlue, yellow: t.colourYellow, red: t.colourRed };
  return names[colour];
}

export function shapeName(t: Strings, symbol: MarkerSymbol): string {
  const names: Record<MarkerSymbol, string> = {
    circle: t.shapeCircle,
    square: t.shapeSquare,
    diamond: t.shapeDiamond,
    triangle: t.shapeTriangle,
    hexagon: t.shapeHexagon,
    bulb: t.iconBulb,
    magnifier: t.iconMagnifier,
    gear: t.iconGear,
    pause: t.iconPause,
    cross: t.iconCross,
    check: t.iconCheck,
    'hammer-shovel': t.iconHammerShovel,
    bolt: t.iconBolt,
  };
  return names[symbol];
}

function entry(swatchClass: string, label: string, data: Record<string, string>, symbol?: MarkerSymbol): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'legend-entry';
  Object.assign(li.dataset, data);
  const swatch = document.createElement('span');
  swatch.className = `legend-swatch ${swatchClass}`;
  swatch.setAttribute('aria-hidden', 'true');
  if (symbol) drawSymbol(swatch, symbol, '');
  const text = document.createElement('span');
  text.className = 'legend-label';
  text.textContent = label;
  li.append(swatch, text);
  return li;
}

// The legend explains the four colours, the marker symbols, and the user's
// statuses with their symbols where defined (FR-6, FR-26, FR-33).
// A group of the grouped numbering (FR-17): its number and its program.
export interface LegendGroup {
  index: number;
  name: string;
}

// The colour labels shown (FR-45): the user's name for each colour.
export type ColourLabels = Record<RowColour, string>;

// The symbol labels shown (FR-54): the user's name for each symbol, or its
// name in the interface language.
export type SymbolLabels = Record<MarkerSymbol, string>;

export function defaultSymbolLabels(t: Strings): SymbolLabels {
  return Object.fromEntries(SYMBOLS.map((s) => [s, shapeName(t, s)])) as SymbolLabels;
}

// One section of the legend and its entries, as a model shared by the
// on-screen legends and the documents (FR-50, FR-51), so that they cannot
// drift apart.
export interface LegendItem {
  label: string;
  colour?: RowColour;
  symbol?: MarkerSymbol;
  status?: string;
  group?: number;
}

export interface LegendSection {
  kind: 'colours' | 'shapes' | 'statuses' | 'programs';
  label: string;
  items: LegendItem[];
}

export function defaultColourLabels(t: Strings): ColourLabels {
  return { green: colourName(t, 'green'), blue: colourName(t, 'blue'), yellow: colourName(t, 'yellow'), red: colourName(t, 'red') };
}

export function legendModel(
  t: Strings,
  statuses: StatusEntry[] = [],
  numberGroups: LegendGroup[] = [],
  colourLabels: ColourLabels = defaultColourLabels(t),
  symbolLabels: SymbolLabels = defaultSymbolLabels(t),
): LegendSection[] {
  const sections: LegendSection[] = [
    { kind: 'colours', label: t.legendColours, items: COLOURS.map((c) => ({ label: colourLabels[c], colour: c })) },
    { kind: 'shapes', label: t.legendShapes, items: SYMBOLS.map((s) => ({ label: symbolLabels[s], symbol: s })) },
  ];
  if (statuses.length > 0) {
    sections.push({ kind: 'statuses', label: t.legendStatuses, items: statuses.map((s) => ({ label: s.name, status: s.name, symbol: s.symbol as MarkerSymbol })) });
  }
  if (numberGroups.length > 0) {
    sections.push({ kind: 'programs', label: t.legendProgramGroups, items: numberGroups.map((g) => ({ label: g.name, group: g.index })) });
  }
  return sections;
}

function legendEntry(item: LegendItem): HTMLLIElement {
  if (item.group !== undefined) {
    const li = document.createElement('li');
    li.className = 'legend-entry';
    li.dataset.group = String(item.group);
    const number = document.createElement('span');
    number.className = 'legend-group-number';
    number.textContent = `${item.group}.`;
    const text = document.createElement('span');
    text.className = 'legend-label';
    text.textContent = item.label;
    li.append(number, text);
    return li;
  }
  if (item.colour) return entry(`marker-${item.colour} marker-shape-circle`, item.label, { colour: item.colour });
  if (item.status !== undefined) return entry(symbolClasses(item.symbol!), item.label, { status: item.status, shape: item.symbol! }, item.symbol);
  return entry(symbolClasses(item.symbol!), item.label, { shape: item.symbol! }, item.symbol);
}

export function renderLegend(
  container: HTMLElement,
  t: Strings,
  statuses: StatusEntry[] = [],
  numberGroups: LegendGroup[] = [],
  colourLabels: ColourLabels = defaultColourLabels(t),
  symbolLabels: SymbolLabels = defaultSymbolLabels(t),
): void {
  container.innerHTML = '';
  const heading = document.createElement('span');
  heading.className = 'legend-heading';
  heading.id = `${container.id}-heading`;
  heading.textContent = t.legend;
  container.setAttribute('role', 'group');
  container.setAttribute('aria-labelledby', heading.id);
  container.append(heading);
  for (const section of legendModel(t, statuses, numberGroups, colourLabels, symbolLabels)) {
    const group = document.createElement('div');
    group.className = 'legend-group';
    group.dataset.kind = section.kind;
    const groupLabel = document.createElement('span');
    groupLabel.className = 'legend-group-label';
    groupLabel.textContent = section.label;
    const list = document.createElement('ul');
    list.className = 'legend-list';
    list.dataset.kind = section.kind;
    list.append(...section.items.map(legendEntry));
    group.append(groupLabel, list);
    container.appendChild(group);
  }
}
