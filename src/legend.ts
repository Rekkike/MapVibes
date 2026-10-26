// Legend (FR-6): explains the marker colours. It is rendered into every view
// that shows markers (the Map segment and the Presentation stage).

import { COLOURS, type RowColour } from './dataset';
import { SHAPES, type MarkerShape } from './markers';
import type { Strings } from './i18n';

export function colourName(t: Strings, colour: RowColour): string {
  const names: Record<RowColour, string> = { green: t.colourGreen, blue: t.colourBlue, yellow: t.colourYellow, red: t.colourRed };
  return names[colour];
}

export function shapeName(t: Strings, shape: MarkerShape): string {
  const names: Record<MarkerShape, string> = {
    circle: t.shapeCircle,
    square: t.shapeSquare,
    diamond: t.shapeDiamond,
    triangle: t.shapeTriangle,
    hexagon: t.shapeHexagon,
  };
  return names[shape];
}

function entry(swatchClass: string, label: string, data: Record<string, string>): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'legend-entry';
  Object.assign(li.dataset, data);
  const swatch = document.createElement('span');
  swatch.className = `legend-swatch ${swatchClass}`;
  swatch.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.className = 'legend-label';
  text.textContent = label;
  li.append(swatch, text);
  return li;
}

// The legend explains the four colours and the marker shapes (FR-6, FR-26).
export function renderLegend(container: HTMLElement, t: Strings): void {
  container.innerHTML = '';
  const heading = document.createElement('span');
  heading.className = 'legend-heading';
  heading.id = `${container.id}-heading`;
  heading.textContent = t.legend;
  container.setAttribute('role', 'group');
  container.setAttribute('aria-labelledby', heading.id);
  const groups: Array<[string, string, HTMLLIElement[]]> = [
    ['colours', t.legendColours, COLOURS.map((c) => entry(`marker-${c} marker-shape-circle`, colourName(t, c), { colour: c }))],
    ['shapes', t.legendShapes, SHAPES.map((s) => entry(`marker-shape-${s}`, shapeName(t, s), { shape: s }))],
  ];
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
