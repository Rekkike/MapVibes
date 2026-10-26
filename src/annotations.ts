// The annotation layer (FR-47 to FR-49). Annotations are first-class objects
// like markers, stored in image coordinates so that they follow the view:
// shapes (rectangle, circle, and freehand polygon) and lines, in the four
// item colours, with a fill opacity, an outline black or white, a line
// style, and an optional label.

import type { RowColour } from './dataset';
import { pixelToLatLon, type MercatorProjection } from './osm';
import type { Point } from './viewport';

export type AnnotationKind = 'rectangle' | 'circle' | 'polygon' | 'line';
export type LineStyle = 'solid' | 'dotted' | 'dashed';
export type Outline = 'black' | 'white';

export const ANNOTATION_KINDS: AnnotationKind[] = ['rectangle', 'circle', 'polygon', 'line'];
export const LINE_STYLES: LineStyle[] = ['solid', 'dotted', 'dashed'];
export const OUTLINES: Outline[] = ['black', 'white'];

export interface AnnotationStyle {
  colour: RowColour;
  // 0 to 1; shapes only.
  fillOpacity: number;
  outline: Outline;
  lineStyle: LineStyle;
}

export interface Annotation extends AnnotationStyle {
  id: string;
  kind: AnnotationKind;
  // Image coordinates. A rectangle: two opposite corners; a circle: its
  // centre and a point on its edge; a polygon: its vertices (closed
  // implicitly); a line: its vertices in order.
  points: Point[];
  label: string;
}

export const DEFAULT_STYLE: AnnotationStyle = { colour: 'blue', fillOpacity: 0.3, outline: 'black', lineStyle: 'solid' };

let nextId = 1;

export function newAnnotationId(): string {
  return `annotation-${nextId++}`;
}

export function isShape(kind: AnnotationKind): boolean {
  return kind !== 'line';
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// The rectangle spanned by two opposite corners.
export function rectOf(a: Point, b: Point): { x: number; y: number; width: number; height: number } {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

// The corners of an annotation as a closed outline (for a rectangle) or its
// vertices (for a polygon or a line); a circle has its centre and radius.
export function outlinePoints(a: Pick<Annotation, 'kind' | 'points'>): Point[] {
  if (a.kind === 'rectangle') {
    const r = rectOf(a.points[0], a.points[1]);
    return [
      { x: r.x, y: r.y },
      { x: r.x + r.width, y: r.y },
      { x: r.x + r.width, y: r.y + r.height },
      { x: r.x, y: r.y + r.height },
    ];
  }
  return a.points.map((p) => ({ ...p }));
}

// The area of a polygon by the shoelace formula, in squared units of its
// coordinates; the sign is dropped.
export function polygonArea(points: Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

// The area of a shape in squared image units; a line has none.
export function shapeArea(a: Pick<Annotation, 'kind' | 'points'>): number {
  if (a.kind === 'line') return 0;
  if (a.kind === 'circle') return Math.PI * distance(a.points[0], a.points[1]) ** 2;
  return polygonArea(outlinePoints(a));
}

// Snap to close (FR-47): a press within the tolerance of a polygon's first
// vertex closes it, once it has at least three vertices. Distances are
// compared on screen, so the tolerance is in screen pixels whatever the zoom.
export const SNAP_TOLERANCE = 12;

export function closesPolygon(vertices: Point[], pressScreen: Point, firstScreen: Point, tolerance = SNAP_TOLERANCE): boolean {
  return vertices.length >= 3 && distance(pressScreen, firstScreen) <= tolerance;
}

export function translate(a: Annotation, dx: number, dy: number): Annotation {
  return { ...a, points: a.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
}

// The smallest distance from a point to a segment.
function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len));
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

function insidePolygon(p: Point, vertices: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[i];
    const b = vertices[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

// Whether a point (image coordinates) hits an annotation: inside a shape, or
// within the tolerance (image units) of its outline or of a line.
export function hits(a: Annotation, p: Point, tolerance: number): boolean {
  if (a.kind === 'circle') {
    const r = distance(a.points[0], a.points[1]);
    return distance(p, a.points[0]) <= r + tolerance;
  }
  const vertices = outlinePoints(a);
  const closed = a.kind !== 'line';
  for (let i = 0; i < vertices.length - (closed ? 0 : 1); i++) {
    if (segmentDistance(p, vertices[i], vertices[(i + 1) % vertices.length]) <= tolerance) return true;
  }
  return closed && insidePolygon(p, vertices);
}

// Whether an annotation is complete enough to keep: a shape of some size, a
// polygon of three vertices or more, a line of two vertices or more.
export function isComplete(a: Pick<Annotation, 'kind' | 'points'>, minimum: number): boolean {
  switch (a.kind) {
    case 'rectangle': {
      const r = rectOf(a.points[0], a.points[1]);
      return r.width >= minimum && r.height >= minimum;
    }
    case 'circle':
      return distance(a.points[0], a.points[1]) >= minimum;
    case 'polygon':
      return a.points.length >= 3 && polygonArea(a.points) > 0;
    case 'line':
      return a.points.length >= 2;
  }
}

// The SVG dash pattern of a line style, in screen pixels.
export function dashArray(style: LineStyle): string | null {
  if (style === 'dotted') return '0 7';
  if (style === 'dashed') return '10 7';
  return null;
}

// Honest area measurement (FR-49). On a background rendered from
// OpenStreetMap data, the projection is known: every vertex converts back to
// latitude and longitude, and the area follows on the sphere (the WGS84
// equatorial radius, by the formula for spherical polygons with straight
// edges between vertices in longitude and latitude). A circle is measured as
// a polygon of 64 vertices. On a plain image there is no known scale, so no
// area in true units exists: null.
const EARTH_RADIUS = 6378137;

export function trueArea(a: Pick<Annotation, 'kind' | 'points'>, projection: MercatorProjection | undefined): number | null {
  if (!projection || a.kind === 'line') return null;
  let vertices = outlinePoints(a);
  if (a.kind === 'circle') {
    const r = distance(a.points[0], a.points[1]);
    vertices = Array.from({ length: 64 }, (_, i) => ({ x: a.points[0].x + r * Math.cos((2 * Math.PI * i) / 64), y: a.points[0].y + r * Math.sin((2 * Math.PI * i) / 64) }));
  }
  const geo = vertices.map((p) => pixelToLatLon(projection, p.x, p.y)).map((g) => ({ lat: (g.lat * Math.PI) / 180, lon: (g.lon * Math.PI) / 180 }));
  let sum = 0;
  for (let i = 0; i < geo.length; i++) {
    const p = geo[i];
    const q = geo[(i + 1) % geo.length];
    sum += (q.lon - p.lon) * (2 + Math.sin(p.lat) + Math.sin(q.lat));
  }
  return Math.abs((sum * EARTH_RADIUS * EARTH_RADIUS) / 2);
}

// An area in square metres, as shown: square metres below a hectare,
// hectares below a square kilometre, then square kilometres; three
// significant digits.
export function formatArea(squareMetres: number, locale: string): string {
  const format = (v: number, unit: string) => `${new Intl.NumberFormat(locale, { maximumSignificantDigits: 3 }).format(v)} ${unit}`;
  if (squareMetres < 10_000) return format(squareMetres, 'm²');
  if (squareMetres < 1_000_000) return format(squareMetres / 10_000, 'ha');
  return format(squareMetres / 1_000_000, 'km²');
}
