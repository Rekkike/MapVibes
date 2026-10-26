// Open-map fetch (FR-31; hard constraints 2 and 3). This module holds the
// application's only network operation: an explicit, user-initiated,
// clearly labelled fetch of open map data from open services. It is never
// called automatically. A request carries only what the user typed for the
// purpose (a place name, or a bounding rectangle) and never any user data:
// no list values, markers, file contents, or work state. Cookies and other
// credentials are never sent; the referrer is limited to the page origin.

import type { OsmBounds } from './osm';

// Open services: the Nominatim geocoder for place search and the Overpass
// API for map data, both operated for the OpenStreetMap community.
export const GEOCODER_URL = 'https://nominatim.openstreetmap.org/search';
export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// Conservative caps on what is requested, so that a plausible search never
// pulls an entire region:
// - the area: at most 0.0025 square degrees (about 5.5 km by 5.5 km at the
//   equator); a larger area is reduced about its centre, and the user is told;
// - the data: the Overpass query asks the service to stop at 16 MiB
//   (maxsize), and an answer larger than that is not processed;
// - the time: the service is asked to stop after 25 seconds, and the browser
//   gives up waiting after 40 seconds (15 seconds for a place search).
export const MAX_FETCH_AREA = 0.0025;
export const MAX_FETCH_BYTES = 16 * 1024 * 1024;
export const SERVICE_TIMEOUT_SECONDS = 25;
export const DATA_TIMEOUT_MS = 40_000;
export const SEARCH_TIMEOUT_MS = 15_000;
export const SEARCH_RESULT_LIMIT = 5;

export interface PlaceResult {
  name: string;
  bounds: OsmBounds;
}

export type FetchErrorCode =
  | 'offline'
  | 'cancelled'
  | 'network'
  | 'timeout'
  | 'refused'
  | 'service'
  | 'no-results'
  | 'too-much-data'
  | 'not-a-number'
  | 'out-of-range'
  | 'south-north'
  | 'west-east';

export type BoundsField = 'south' | 'west' | 'north' | 'east';

export class FetchError extends Error {
  constructor(
    readonly code: FetchErrorCode,
    // The service's answer (HTTP status, or the service's own message), or
    // the offending field of a bounding rectangle.
    readonly detail: { status?: number; message?: string; field?: BoundsField } = {},
  ) {
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

// Classifies an HTTP status that is not a success.
export function statusError(status: number): FetchError {
  if (status === 408 || status === 504) return new FetchError('timeout', { status });
  if (status === 403 || status === 429 || status === 503) return new FetchError('refused', { status });
  return new FetchError('service', { status });
}

// Overpass reports some failures inside a successful answer, as a remark.
export function overpassRemarkError(text: string): FetchError | null {
  const remark = text.match(/<remark>([\s\S]*?)<\/remark>/);
  if (!remark) return null;
  const message = remark[1].trim();
  if (/timed out|timeout/i.test(message)) return new FetchError('timeout', { message });
  if (/out of memory|maxsize/i.test(message)) return new FetchError('too-much-data', { message });
  return new FetchError('service', { message });
}

async function request(url: string, accept: string, timeoutMs: number, signal?: AbortSignal): Promise<string> {
  if (!isOnline()) throw new FetchError('offline');
  if (signal?.aborted) throw new FetchError('cancelled');
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onCancel = () => controller.abort();
  signal?.addEventListener('abort', onCancel);
  try {
    let response: Response;
    try {
      response = await fetch(url, { ...REQUEST, headers: { Accept: accept }, signal: controller.signal });
    } catch {
      if (signal?.aborted) throw new FetchError('cancelled');
      if (timedOut) throw new FetchError('timeout');
      throw new FetchError('network');
    }
    if (!response.ok) throw statusError(response.status);
    const length = Number(response.headers?.get?.('content-length') ?? '0');
    if (length > MAX_FETCH_BYTES) throw new FetchError('too-much-data');
    const text = await response.text();
    if (text.length > MAX_FETCH_BYTES) throw new FetchError('too-much-data');
    return text;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onCancel);
  }
}

// Reads one edge of a bounding rectangle, in decimal degrees (WGS84). A comma
// is accepted as the decimal separator.
export function parseEdge(field: BoundsField, text: string): number {
  const value = Number(text.trim().replace(',', '.').replace('−', '-'));
  if (text.trim() === '' || !Number.isFinite(value)) throw new FetchError('not-a-number', { field });
  const limit = field === 'south' || field === 'north' ? 90 : 180;
  if (value < -limit || value > limit) throw new FetchError('out-of-range', { field });
  return value;
}

// Validates a bounding rectangle given by its four edges.
export function parseBounds(edges: Record<BoundsField, string>): OsmBounds {
  const south = parseEdge('south', edges.south);
  const west = parseEdge('west', edges.west);
  const north = parseEdge('north', edges.north);
  const east = parseEdge('east', edges.east);
  if (south >= north) throw new FetchError('south-north', { field: 'south' });
  if (west >= east) throw new FetchError('west-east', { field: 'west' });
  return { minLat: south, minLon: west, maxLat: north, maxLon: east };
}

export function areaOf(b: OsmBounds): number {
  return (b.maxLat - b.minLat) * (b.maxLon - b.minLon);
}

// An area reduced about its centre to the largest area that is fetched at
// once; an area within the limit is returned unchanged.
export function fetchableBounds(b: OsmBounds): OsmBounds {
  const area = areaOf(b);
  if (area <= MAX_FETCH_AREA) return b;
  const f = Math.sqrt(MAX_FETCH_AREA / area) * 0.999;
  const cLat = (b.minLat + b.maxLat) / 2;
  const cLon = (b.minLon + b.maxLon) / 2;
  const hLat = ((b.maxLat - b.minLat) * f) / 2;
  const hLon = ((b.maxLon - b.minLon) * f) / 2;
  return { minLat: cLat - hLat, maxLat: cLat + hLat, minLon: cLon - hLon, maxLon: cLon + hLon };
}

export function geocoderUrl(place: string): string {
  const params = new URLSearchParams({ q: place.trim(), format: 'jsonv2', limit: String(SEARCH_RESULT_LIMIT) });
  return `${GEOCODER_URL}?${params.toString()}`;
}

export function overpassQuery(b: OsmBounds): string {
  const box = `${b.minLat},${b.minLon},${b.maxLat},${b.maxLon}`;
  const selectors = ['highway', 'building', 'natural', 'water', 'waterway', 'railway', 'leisure', 'landuse'];
  const ways = selectors.map((k) => `way["${k}"](${box});`).join('');
  return `[out:xml][timeout:${SERVICE_TIMEOUT_SECONDS}][maxsize:${MAX_FETCH_BYTES}];(${ways});(._;>;);out body;`;
}

export function overpassUrl(b: OsmBounds): string {
  return `${OVERPASS_URL}?${new URLSearchParams({ data: overpassQuery(b) }).toString()}`;
}

export function parsePlaces(json: string): PlaceResult[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new FetchError('service', { message: 'unreadable answer' });
  }
  if (!Array.isArray(raw)) throw new FetchError('service', { message: 'unreadable answer' });
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

export async function searchPlace(place: string, signal?: AbortSignal): Promise<PlaceResult[]> {
  if (place.trim() === '') throw new FetchError('no-results');
  const places = parsePlaces(await request(geocoderUrl(place), 'application/json', SEARCH_TIMEOUT_MS, signal));
  if (places.length === 0) throw new FetchError('no-results');
  return places;
}

// Fetches the map data of an area that is within the limit (see
// fetchableBounds).
export async function fetchMapData(b: OsmBounds, signal?: AbortSignal): Promise<string> {
  if (areaOf(b) > MAX_FETCH_AREA * 1.0001) throw new FetchError('too-much-data');
  const text = await request(overpassUrl(b), 'application/osm3s+xml, application/xml', DATA_TIMEOUT_MS, signal);
  const remark = overpassRemarkError(text);
  if (remark) throw remark;
  return text;
}
