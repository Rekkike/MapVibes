import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  checkBounds,
  fetchableBounds,
  FetchError,
  GEOCODER_URL,
  geocoderUrl,
  MAX_FETCH_AREA,
  OVERPASS_URL,
  overpassQuery,
  overpassUrl,
  parseBoundsText,
  parsePlaces,
} from '../../src/openmap';

function code(f: () => unknown): string {
  try {
    f();
  } catch (e) {
    expect(e).toBeInstanceOf(FetchError);
    return (e as FetchError).code;
  }
  return 'none';
}

describe('open-map fetch requests (FR-31)', () => {
  test('a place search sends only the place name to the open geocoder', () => {
    const url = new URL(geocoderUrl('  Example Town '));
    expect(`${url.origin}${url.pathname}`).toBe(GEOCODER_URL);
    expect([...url.searchParams.keys()]).toEqual(['q', 'format', 'limit']);
    expect(url.searchParams.get('q')).toBe('Example Town');
  });

  test('a data request sends only the bounding box to the Overpass API', () => {
    const b = { minLat: 0, minLon: 0, maxLat: 0.006, maxLon: 0.009 };
    const url = new URL(overpassUrl(b));
    expect(`${url.origin}${url.pathname}`).toBe(OVERPASS_URL);
    expect([...url.searchParams.keys()]).toEqual(['data']);
    expect(url.searchParams.get('data')).toBe(overpassQuery(b));
    expect(overpassQuery(b)).toContain('way["highway"](0,0,0.006,0.009);');
    expect(overpassQuery(b)).toMatch(/^\[out:xml\]/);
  });

  test('bounding boxes are validated and limited in size', () => {
    expect(parseBoundsText('0, 0, 0.006, 0.009')).toEqual({ minLat: 0, minLon: 0, maxLat: 0.006, maxLon: 0.009 });
    expect(parseBoundsText('0 0 0.006 0.009').maxLon).toBe(0.009);
    expect(code(() => parseBoundsText('1, 2, 3'))).toBe('invalid-area');
    expect(code(() => parseBoundsText('a, b, c, d'))).toBe('invalid-area');
    expect(code(() => parseBoundsText('0.01, 0, 0, 0.01'))).toBe('invalid-area');
    expect(code(() => parseBoundsText('95, 0, 96, 0.01'))).toBe('invalid-area');
    expect(code(() => parseBoundsText('0, 0, 1, 1'))).toBe('too-large');
    expect(code(() => checkBounds({ minLat: 0, minLon: 0, maxLat: 0.04, maxLon: 0.06 }))).toBe('none');
  });

  test('a large place is reduced about its centre to the largest fetchable area', () => {
    const b = { minLat: 10, maxLat: 11, minLon: 20, maxLon: 22 };
    const r = fetchableBounds(b);
    expect((r.maxLat - r.minLat) * (r.maxLon - r.minLon)).toBeLessThanOrEqual(MAX_FETCH_AREA);
    expect((r.minLat + r.maxLat) / 2).toBeCloseTo(10.5, 10);
    expect((r.minLon + r.maxLon) / 2).toBeCloseTo(21, 10);
    expect((r.maxLon - r.minLon) / (r.maxLat - r.minLat)).toBeCloseTo(2, 10);
    const small = { minLat: 0, maxLat: 0.01, minLon: 0, maxLon: 0.01 };
    expect(fetchableBounds(small)).toBe(small);
  });

  test('geocoder answers are read defensively', () => {
    const answer = JSON.stringify([
      { display_name: 'Example Town', boundingbox: ['0', '0.006', '0', '0.009'] },
      { display_name: 'Broken', boundingbox: ['x'] },
      { display_name: 'Inverted', boundingbox: ['1', '0', '0', '1'] },
    ]);
    expect(parsePlaces(answer)).toEqual([{ name: 'Example Town', bounds: { minLat: 0, maxLat: 0.006, minLon: 0, maxLon: 0.009 } }]);
    expect(code(() => parsePlaces('not json'))).toBe('service');
    expect(code(() => parsePlaces('{}'))).toBe('service');
  });
});

// Hard constraint 2 (FR-31): the labelled fetch is the only network
// operation. No other application source may open a network request.
describe('the only network operation', () => {
  const srcDir = join(process.cwd(), 'src');
  const NETWORK = /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|navigator\.connection|new\s+Worker\s*\(|importScripts|https?:\/\//;

  test('only src/openmap.ts contains network calls or remote addresses', () => {
    const offenders = readdirSync(srcDir)
      .filter((f) => f.endsWith('.ts') && f !== 'openmap.ts')
      .filter((f) => NETWORK.test(readFileSync(join(srcDir, f), 'utf8')));
    expect(offenders).toEqual([]);
    expect(NETWORK.test(readFileSync(join(srcDir, 'openmap.ts'), 'utf8'))).toBe(true);
  });

  test('the network module contacts only the two open services', () => {
    const text = readFileSync(join(srcDir, 'openmap.ts'), 'utf8');
    const urls = [...text.matchAll(/https?:\/\/[^\s'"`]+/g)].map((m) => m[0]);
    expect(new Set(urls)).toEqual(new Set([GEOCODER_URL, OVERPASS_URL]));
  });
});
