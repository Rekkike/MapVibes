// Open-map fetch (FR-31; hard constraints 2 and 3). This module holds the
// application's only network operation: an explicit, user-initiated,
// clearly labelled fetch of open map data from open services. It is never
// called automatically. A request carries only what the user typed for the
// purpose (a place name, or a bounding box) and never any user data: no list
// values, markers, file contents, or work state. Cookies and other
// credentials are never sent; the referrer is limited to the page origin.

import type { OsmBounds } from './osm';

// Open services: the Nominatim geocoder for place search and the Overpass
// API for map data, both operated for the OpenStreetMap community.
export const GEOCODER_URL = 'https://nominatim.openstreetmap.org/search';
export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// The largest area fetched at once, in square degrees (about 5.5 km by
// 5.5 km at the equator), to keep requests within the services' fair use
// and the rendered image detailed.
export const MAX_FETCH_AREA = 0.0025;

export interface PlaceResult {
  name: string;
  bounds: OsmBounds;
}

export type FetchErrorCode = 'offline' | 'network' | 'busy' | 'service' | 'no-results' | 'invalid-area' | 'too-large';

export class FetchError extends Error {
  constructor(readonly code: FetchErrorCode) {
    super(code);
    this.name = 'FetchError';
  }
}

const REQUEST: RequestInit = {
  method: 'GET',
  credentials: 'omit',
  referrerPolicy: 'origin',
  cache: 'no-store',
};

export function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

async function request(url: string, accept: string): Promise<string> {
  if (!isOnline()) throw new FetchError('offline');
  let response: Response;
  try {
    response = await fetch(url, { ...REQUEST, headers: { Accept: accept } });
  } catch {
    throw new FetchError('network');
  }
  if (response.status === 429 || response.status === 503 || response.status === 504) throw new FetchError('busy');
  if (!response.ok) throw new FetchError('service');
  return response.text();
}

// Validates a bounding box (south, west, north, east in degrees).
export function checkBounds(b: OsmBounds): OsmBounds {
  const values = [b.minLat, b.minLon, b.maxLat, b.maxLon];
  if (values.some((v) => !Number.isFinite(v))) throw new FetchError('invalid-area');
  if (b.minLat < -90 || b.maxLat > 90 || b.minLon < -180 || b.maxLon > 180) throw new FetchError('invalid-area');
  if (b.minLat >= b.maxLat || b.minLon >= b.maxLon) throw new FetchError('invalid-area');
  if ((b.maxLat - b.minLat) * (b.maxLon - b.minLon) > MAX_FETCH_AREA) throw new FetchError('too-large');
  return b;
}

// Parses "south, west, north, east" (decimal degrees).
export function parseBoundsText(text: string): OsmBounds {
  const parts = text.split(/[,;\s]+/).filter((p) => p !== '').map(Number);
  if (parts.length !== 4) throw new FetchError('invalid-area');
  const [minLat, minLon, maxLat, maxLon] = parts;
  return checkBounds({ minLat, minLon, maxLat, maxLon });
}

export function geocoderUrl(place: string): string {
  const params = new URLSearchParams({ q: place.trim(), format: 'jsonv2', limit: '5' });
  return `${GEOCODER_URL}?${params.toString()}`;
}

export function overpassQuery(b: OsmBounds): string {
  const box = `${b.minLat},${b.minLon},${b.maxLat},${b.maxLon}`;
  const selectors = ['highway', 'building', 'natural', 'water', 'waterway', 'railway', 'leisure', 'landuse'];
  const ways = selectors.map((k) => `way["${k}"](${box});`).join('');
  return `[out:xml][timeout:25];(${ways});(._;>;);out body;`;
}

export function overpassUrl(b: OsmBounds): string {
  return `${OVERPASS_URL}?${new URLSearchParams({ data: overpassQuery(b) }).toString()}`;
}

export function parsePlaces(json: string): PlaceResult[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new FetchError('service');
  }
  if (!Array.isArray(raw)) throw new FetchError('service');
  const out: PlaceResult[] = [];
  for (const item of raw) {
    const o = item as { display_name?: unknown; boundingbox?: unknown };
    if (typeof o.display_name !== 'string' || !Array.isArray(o.boundingbox) || o.boundingbox.length !== 4) continue;
    const [s, n, w, e] = o.boundingbox.map(Number);
    if (![s, n, w, e].every(Number.isFinite) || s >= n || w >= e) continue;
    out.push({ name: o.display_name, bounds: { minLat: s, maxLat: n, minLon: w, maxLon: e } });
  }
  return out;
}

export async function searchPlace(place: string): Promise<PlaceResult[]> {
  if (place.trim() === '') throw new FetchError('no-results');
  const places = parsePlaces(await request(geocoderUrl(place), 'application/json'));
  if (places.length === 0) throw new FetchError('no-results');
  return places;
}

// A place's bounding box, reduced about its centre to the largest area that
// is fetched at once.
export function fetchableBounds(b: OsmBounds): OsmBounds {
  const area = (b.maxLat - b.minLat) * (b.maxLon - b.minLon);
  if (area <= MAX_FETCH_AREA) return b;
  const f = Math.sqrt(MAX_FETCH_AREA / area) * 0.999;
  const cLat = (b.minLat + b.maxLat) / 2;
  const cLon = (b.minLon + b.maxLon) / 2;
  const hLat = ((b.maxLat - b.minLat) * f) / 2;
  const hLon = ((b.maxLon - b.minLon) * f) / 2;
  return { minLat: cLat - hLat, maxLat: cLat + hLat, minLon: cLon - hLon, maxLon: cLon + hLon };
}

export async function fetchMapData(b: OsmBounds): Promise<string> {
  return request(overpassUrl(checkBounds(b)), 'application/osm3s+xml, application/xml');
}
