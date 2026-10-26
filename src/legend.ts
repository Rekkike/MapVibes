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
// A group of the grouped numbering (FR-17): its number and its area value
// ('' for the items without one).
export interface LegendAreaGroup {
  index: number;
  area: string;
}

export function renderLegend(container: HTMLElement, t: Strings, statuses: StatusEntry[] = [], areaGroups: LegendAreaGroup[] = []): void {
  container.innerHTML = '';
  const heading = document.createElement('span');
  heading.className = 'legend-heading';
  heading.id = `${container.id}-heading`;
  heading.textContent = t.legend;
  container.setAttribute('role', 'group');
  container.setAttribute('aria-labelledby', heading.id);
  const groups: Array<[string, string, HTMLLIElement[]]> = [
    ['colours', t.legendColours, COLOURS.map((c) => entry(`marker-${c} marker-shape-circle`, colourName(t, c), { colour: c }))],
    ['shapes', t.legendShapes, SYMBOLS.map((s) => entry(symbolClasses(s), shapeName(t, s), { shape: s }, s))],
  ];
  if (statuses.length > 0) {
    groups.push([
      'statuses',
      t.legendStatuses,
      statuses.map((s) => entry(symbolClasses(s.symbol as MarkerSymbol), s.name, { status: s.name, shape: s.symbol }, s.symbol as MarkerSymbol)),
    ]);
  }
  if (areaGroups.length > 0) {
    groups.push([
      'areas',
      t.legendAreaGroups,
      areaGroups.map((g) => {
        const li = document.createElement('li');
        li.className = 'legend-entry';
        li.dataset.group = String(g.index);
        const number = document.createElement('span');
        number.className = 'legend-group-number';
        number.textContent = `${g.index}.`;
        const text = document.createElement('span');
        text.className = 'legend-label';
        text.textContent = g.area === '' ? t.numberingNoArea : g.area;
        li.append(number, text);
        return li;
      }),
    ]);
  }
  container.append(heading);
  for (const [kind, label, entries] of groups) {
    const group = document.createElement('div');
    group.className = 'legend-group';
    group.dataset.kind = kind;
    const groupLabel = document.createElement('span');
    groupLabel.className = 'legend-group-label';
    groupLabel.textContent = label;
    const list = document.createElement('ul');
    list.className = 'legend-list';
    list.dataset.kind = kind;
    list.append(...entries);
    group.append(groupLabel, list);
    container.appendChild(group);
  }
}
