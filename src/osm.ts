// OpenStreetMap XML backgrounds (FR-31). An .osm file (or open map data
// fetched by the labelled action) is parsed locally into nodes and ways and
// turned into a render plan: the ways to draw, projected to pixel
// coordinates, with a basic style per feature class. Relations are not
// interpreted: features that exist only as multipolygon relations are not
// drawn.

export interface OsmNode {
  lat: number;
  lon: number;
}

export interface OsmWay {
  refs: string[];
  tags: Record<string, string>;
}

export interface OsmBounds {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

export interface OsmData {
  nodes: Map<string, OsmNode>;
  ways: OsmWay[];
  bounds: OsmBounds | null;
}

export type OsmErrorCode = 'malformed' | 'empty' | 'too-large';

export class OsmError extends Error {
  constructor(readonly code: OsmErrorCode) {
    super(code);
    this.name = 'OsmError';
  }
}

// Files are read whole and parsed on the main thread; above this size they
// are refused with a message instead of risking an unresponsive page.
export const MAX_OSM_BYTES = 50 * 1024 * 1024;

export function isOsmFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.osm') || file.type === 'application/vnd.openstreetmap.data+xml';
}

function finite(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function parseOsm(text: string): OsmData {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const root = doc.documentElement;
  if (!root || root.nodeName !== 'osm' || doc.getElementsByTagName('parsererror').length > 0) {
    throw new OsmError('malformed');
  }
  const nodes = new Map<string, OsmNode>();
  const ways: OsmWay[] = [];
  let bounds: OsmBounds | null = null;
  for (const child of Array.from(root.children)) {
    if (child.nodeName === 'node') {
      const id = child.getAttribute('id');
      const lat = finite(child.getAttribute('lat'));
      const lon = finite(child.getAttribute('lon'));
      if (id === null || lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        throw new OsmError('malformed');
      }
      nodes.set(id, { lat, lon });
    } else if (child.nodeName === 'way') {
      const refs: string[] = [];
      const tags: Record<string, string> = {};
      for (const part of Array.from(child.children)) {
        if (part.nodeName === 'nd') {
          const ref = part.getAttribute('ref');
          if (ref !== null) refs.push(ref);
        } else if (part.nodeName === 'tag') {
          const k = part.getAttribute('k');
          const v = part.getAttribute('v');
          if (k !== null && v !== null) tags[k] = v;
        }
      }
      ways.push({ refs, tags });
    } else if (child.nodeName === 'bounds') {
      const b = {
        minLat: finite(child.getAttribute('minlat')),
        minLon: finite(child.getAttribute('minlon')),
        maxLat: finite(child.getAttribute('maxlat')),
        maxLon: finite(child.getAttribute('maxlon')),
      };
      if (b.minLat === null || b.minLon === null || b.maxLat === null || b.maxLon === null) throw new OsmError('malformed');
      if (b.minLat >= b.maxLat || b.minLon >= b.maxLon) throw new OsmError('malformed');
      bounds = { minLat: b.minLat, minLon: b.minLon, maxLat: b.maxLat, maxLon: b.maxLon };
    }
  }
  return { nodes, ways, bounds };
}

// Feature classes, drawn in this order (areas first, then lines).
export type FeatureClass = 'green' | 'water' | 'building' | 'waterway' | 'rail' | 'path' | 'minor-road' | 'major-road';

export const DRAW_ORDER: FeatureClass[] = ['green', 'water', 'building', 'waterway', 'rail', 'path', 'minor-road', 'major-road'];

const MAJOR_ROADS = ['motorway', 'trunk', 'primary', 'secondary', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link'];
const PATHS = ['footway', 'path', 'cycleway', 'pedestrian', 'steps', 'bridleway', 'track'];
const GREEN_LANDUSE = ['grass', 'forest', 'meadow', 'recreation_ground', 'village_green', 'cemetery', 'allotments'];

export function classify(tags: Record<string, string>): FeatureClass | null {
  if (tags.building !== undefined && tags.building !== 'no') return 'building';
  if (tags.natural === 'water' || tags.water !== undefined || tags.waterway === 'riverbank' || tags.landuse === 'reservoir' || tags.landuse === 'basin') {
    return 'water';
  }
  if (tags.waterway !== undefined) return 'waterway';
  if (tags.highway !== undefined) {
    if (MAJOR_ROADS.includes(tags.highway)) return 'major-road';
    if (PATHS.includes(tags.highway)) return 'path';
    return 'minor-road';
  }
  if (tags.railway !== undefined && tags.railway !== 'abandoned') return 'rail';
  if (tags.leisure === 'park' || tags.leisure === 'garden' || tags.natural === 'wood' || GREEN_LANDUSE.includes(tags.landuse ?? '')) {
    return 'green';
  }
  return null;
}

export const AREA_CLASSES: FeatureClass[] = ['green', 'water', 'building'];

export interface PlannedShape {
  feature: FeatureClass;
  closed: boolean;
  points: Array<[number, number]>;
}

export interface RenderPlan {
  width: number;
  height: number;
  shapes: PlannedShape[];
  // The Web Mercator projection of the rendering, so that its scale is known
  // (FR-49).
  projection: MercatorProjection;
}

// A pixel (x, y) of a rendering lies at longitude x / scale + x0 (radians)
// and at the Mercator ordinate y1 - y / scale.
export interface MercatorProjection {
  x0: number;
  y1: number;
  scale: number;
}

export function pixelToLatLon(projection: MercatorProjection, x: number, y: number): { lat: number; lon: number } {
  const lon = ((x / projection.scale + projection.x0) * 180) / Math.PI;
  const lat = ((2 * Math.atan(Math.exp(projection.y1 - y / projection.scale)) - Math.PI / 2) * 180) / Math.PI;
  return { lat, lon };
}

export const MAX_RENDER_SIDE = 4096;
export const PREFERRED_RENDER_SIDE = 3000;

function mercatorY(lat: number): number {
  const rad = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + rad / 2));
}

// The extent to draw: the file's bounds, else the extent of the nodes used
// by drawable ways.
function extentOf(data: OsmData, used: OsmNode[]): OsmBounds | null {
  if (data.bounds) return data.bounds;
  if (used.length === 0) return null;
  const lats = used.map((n) => n.lat);
  const lons = used.map((n) => n.lon);
  const b = { minLat: Math.min(...lats), maxLat: Math.max(...lats), minLon: Math.min(...lons), maxLon: Math.max(...lons) };
  if (b.minLat === b.maxLat || b.minLon === b.maxLon) return null;
  return b;
}

// Projects the drawable ways (Web Mercator) into an image whose longest side
// is the preferred size, keeping the true aspect ratio.
export function planRender(data: OsmData, longestSide = PREFERRED_RENDER_SIDE): RenderPlan {
  const drawable: Array<{ feature: FeatureClass; nodes: OsmNode[]; closed: boolean }> = [];
  for (const way of data.ways) {
    const feature = classify(way.tags);
    if (!feature) continue;
    const nodes = way.refs.map((r) => data.nodes.get(r)).filter((n): n is OsmNode => n !== undefined);
    if (nodes.length < 2) continue;
    const closed = way.refs.length > 3 && way.refs[0] === way.refs[way.refs.length - 1];
    if (AREA_CLASSES.includes(feature) && !closed && feature !== 'water') continue;
    drawable.push({ feature, nodes, closed: closed && AREA_CLASSES.includes(feature) });
  }
  const extent = extentOf(data, drawable.flatMap((d) => d.nodes));
  if (drawable.length === 0 || !extent) throw new OsmError('empty');
  const x0 = (extent.minLon * Math.PI) / 180;
  const x1 = (extent.maxLon * Math.PI) / 180;
  const y0 = mercatorY(extent.minLat);
  const y1 = mercatorY(extent.maxLat);
  const spanX = x1 - x0;
  const spanY = y1 - y0;
  const side = Math.min(MAX_RENDER_SIDE, longestSide);
  const scale = side / Math.max(spanX, spanY);
  const width = Math.max(1, Math.round(spanX * scale));
  const height = Math.max(1, Math.round(spanY * scale));
  const shapes = drawable
    .sort((a, b) => DRAW_ORDER.indexOf(a.feature) - DRAW_ORDER.indexOf(b.feature))
    .map((d) => ({
      feature: d.feature,
      closed: d.closed,
      points: d.nodes.map((n) => [((n.lon * Math.PI) / 180 - x0) * scale, (y1 - mercatorY(n.lat)) * scale] as [number, number]),
    }));
  return { width, height, shapes, projection: { x0, y1, scale } };
}

// The basic style (FR-31): one fixed palette, like a printed map, so that the
// rendered background is the same content in both interface themes.
export interface FeatureStyle {
  fill?: string;
  stroke?: string;
  width?: number;
  casing?: string;
  dash?: number[];
}

export const LAND_COLOUR = '#f2efe9';

// The style's line widths and dashes are in pixels of a map of this size.
export const STYLE_REFERENCE_SIDE = 1000;

// Line edges and area outlines keep at least 3:1 contrast against the land
// colour; area fills are told apart by hue and outline (pinned by tests).
export const OSM_STYLE: Record<FeatureClass, FeatureStyle> = {
  green: { fill: '#c8e6c0', stroke: '#5b9150', width: 1 },
  water: { fill: '#9cc6e8', stroke: '#3f7fbd', width: 1.5 },
  building: { fill: '#d4c9bc', stroke: '#857565', width: 1 },
  waterway: { stroke: '#3f7fbd', width: 3 },
  rail: { stroke: '#707070', width: 2, dash: [8, 6] },
  path: { stroke: '#8a7a6a', width: 1.5, dash: [4, 3] },
  'minor-road': { stroke: '#ffffff', width: 4, casing: '#857d75' },
  'major-road': { stroke: '#f6c96b', width: 7, casing: '#946d33' },
};
