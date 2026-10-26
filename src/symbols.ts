// Marker symbol library (FR-26): the geometric shapes and seven icons. Icons
// are vector paths (24 by 24 units) drawn with the marker's number colour, so
// that they share its pinned contrast against every marker fill.

import { SHAPES, type MarkerShape } from './markers';

export type MarkerIcon = 'bulb' | 'magnifier' | 'gear' | 'pause' | 'cross' | 'check' | 'hammer-shovel';

export type MarkerSymbol = MarkerShape | MarkerIcon;

export const ICONS: MarkerIcon[] = ['bulb', 'magnifier', 'gear', 'pause', 'cross', 'check', 'hammer-shovel'];

export const SYMBOLS: MarkerSymbol[] = [...SHAPES, ...ICONS];

export const ICON_PATHS: Record<MarkerIcon, string> = {
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z',
  magnifier: 'M10.5 4a6.5 6.5 0 1 0 0 13a6.5 6.5 0 0 0 0-13zM15.5 15.5L21 21',
  gear: 'M18.75 10.13L21.39 10.57L21.39 13.43L18.75 13.87L18.09 15.45L19.65 17.63L17.63 19.65L15.45 18.09L13.87 18.75L13.43 21.39L10.57 21.39L10.13 18.75L8.55 18.09L6.37 19.65L4.35 17.63L5.91 15.45L5.25 13.87L2.61 13.43L2.61 10.57L5.25 10.13L5.91 8.55L4.35 6.37L6.37 4.35L8.55 5.91L10.13 5.25L10.57 2.61L13.43 2.61L13.87 5.25L15.45 5.91L17.63 4.35L19.65 6.37L18.09 8.55ZM12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6z',
  pause: 'M8.5 5v14M15.5 5v14',
  cross: 'M6 6l12 12M18 6L6 18',
  check: 'M4 12.5l5 5L20 6.5',
  // A hammer (handle from the lower left, head at the upper right) crossed
  // with a shovel (handle from the lower right with a grip, blade at the
  // upper left).
  'hammer-shovel': 'M4 20L14.9 9.1M14.2 4.1L19.9 9.8L17.8 11.9L12.1 6.2ZM20 20L9 9M18.5 21.5L21.5 18.5M10.4 7.6L7.4 4.6Q5 3 4 4Q3 5 4.6 7.4L7.6 10.4Z',
};

export function isIcon(value: unknown): value is MarkerIcon {
  return typeof value === 'string' && (ICONS as string[]).includes(value);
}

export function isSymbol(value: unknown): value is MarkerSymbol {
  return typeof value === 'string' && (SYMBOLS as string[]).includes(value);
}

// The classes of a symbol: icons sit on the pill-shaped default outline.
export function symbolClasses(symbol: MarkerSymbol): string {
  return isIcon(symbol) ? `marker-icon marker-icon-${symbol}` : `marker-shape-${symbol}`;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function iconSvg(icon: MarkerIcon): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'marker-glyph');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', ICON_PATHS[icon]);
  svg.appendChild(path);
  return svg;
}

// Shows a symbol on a marker, badge, or swatch: the icon (if any) followed
// by the text (the number; empty for a swatch).
export function drawSymbol(node: HTMLElement, symbol: MarkerSymbol, text: string): void {
  node.replaceChildren();
  if (isIcon(symbol)) node.appendChild(iconSvg(symbol));
  if (text !== '') node.appendChild(document.createTextNode(text));
}
