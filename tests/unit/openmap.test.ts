import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  DATA_TIMEOUT_MS,
  fetchableBounds,
  FetchError,
  fetchMapData,
  GEOCODER_URL,
  geocoderUrl,
  MAX_FETCH_AREA,
  MAX_FETCH_BYTES,
  OVERPASS_URL,
  overpassQuery,
  overpassRemarkError,
  overpassUrl,
  parseBounds,
  parseEdge,
  parsePlaces,
  searchPlace,
  statusError,
} from '../../src/openmap';
import { XML_IDENTIFIERS } from '../../src/pptxwriter';

function failure(f: () => unknown): FetchError {
  try {
    f();
  } catch (e) {
    expect(e).toBeInstanceOf(FetchError);
    return e as FetchError;
  }
  throw new Error('expected a FetchError');
}

async function failureOf(p: Promise<unknown>): Promise<FetchError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(FetchError);
    return e as FetchError;
  }
  throw new Error('expected a FetchError');
}

const area = { minLat: 0, minLon: 0, maxLat: 0.006, maxLon: 0.009 };
const edges = (south: string, west: string, north: string, east: string) => ({ south, west, north, east });

describe('open-map fetch requests (FR-31)', () => {
  test('a place search sends only the place name, asking for a few results', () => {
    const url = new URL(geocoderUrl('  Example Town '));
    expect(`${url.origin}${url.pathname}`).toBe(GEOCODER_URL);
    expect([...url.searchParams.keys()]).toEqual(['q', 'format', 'limit']);
    expect(url.searchParams.get('q')).toBe('Example Town');
    expect(url.searchParams.get('limit')).toBe('5');
  });

  test('a data request sends only the rectangle, with the time and size caps', () => {
    const url = new URL(overpassUrl(area));
    expect(`${url.origin}${url.pathname}`).toBe(OVERPASS_URL);
    expect([...url.searchParams.keys()]).toEqual(['data']);
    const query = url.searchParams.get('data')!;
    expect(query).toBe(overpassQuery(area));
    expect(query).toMatch(/^\[out:xml\]\[timeout:25\]\[maxsize:16777216\];/);
    expect(query).toContain('way["highway"](0,0,0.006,0.009);');
    expect(MAX_FETCH_BYTES).toBe(16 * 1024 * 1024);
  });
});

describe('bounding rectangle fields (FR-31)', () => {
  test('four edges in decimal degrees, south, west, north, east', () => {
    expect(parseBounds(edges('0', '0', '0.006', '0.009'))).toEqual(area);
    expect(parseBounds(edges('-0,01', '\u22120.02', '0', '0'))).toEqual({ minLat: -0.01, minLon: -0.02, maxLat: 0, maxLon: 0 });
  });

  test('a non-numeric value is rejected and names its field', () => {
    for (const field of ['south', 'west', 'north', 'east'] as const) {
      const values = { ...edges('0', '0', '0.006', '0.009'), [field]: 'abc' };
      const e = failure(() => parseBounds(values));
      expect([e.code, e.detail.field]).toEqual(['not-a-number', field]);
    }
    expect(failure(() => parseEdge('north', '  ')).code).toBe('not-a-number');
  });

  test('an out-of-range value is rejected and names its field', () => {
    expect(failure(() => parseEdge('south', '-90.5')).detail.field).toBe('south');
    expect(failure(() => parseEdge('north', '91')).code).toBe('out-of-range');
    expect(failure(() => parseEdge('west', '-181')).detail.field).toBe('west');
    expect(failure(() => parseEdge('east', '180.01')).code).toBe('out-of-range');
    expect(parseEdge('east', '180')).toBe(180);
    expect(parseEdge('south', '-90')).toBe(-90);
  });

  test('south must be less than north, west less than east', () => {
    expect(failure(() => parseBounds(edges('1', '0', '1', '1'))).code).toBe('south-north');
    expect(failure(() => parseBounds(edges('0', '2', '1', '1'))).code).toBe('west-east');
  });

  test('a large area is reduced about its centre to the cap; a small one is unchanged', () => {
    const b = { minLat: 10, maxLat: 11, minLon: 20, maxLon: 22 };
    const r = fetchableBounds(b);
    expect((r.maxLat - r.minLat) * (r.maxLon - r.minLon)).toBeLessThanOrEqual(MAX_FETCH_AREA);
    expect((r.minLat + r.maxLat) / 2).toBeCloseTo(10.5, 10);
    expect((r.minLon + r.maxLon) / 2).toBeCloseTo(21, 10);
    expect((r.maxLon - r.minLon) / (r.maxLat - r.minLat)).toBeCloseTo(2, 10);
    expect(fetchableBounds(area)).toBe(area);
  });
});

describe('failure classes (FR-31)', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.useRealTimers();
  });

  function reply(status: number, body = '', headers: Record<string, string> = {}): void {
    globalThis.fetch = vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers(headers),
      text: async () => body,
    })) as unknown as typeof fetch;
  }

  test('HTTP statuses are classified, and the status is kept', () => {
    for (const [status, code] of [
      [408, 'timeout'],
      [504, 'timeout'],
      [403, 'refused'],
      [429, 'refused'],
      [503, 'refused'],
      [500, 'service'],
      [400, 'service'],
    ] as const) {
      const e = statusError(status);
      expect([e.code, e.detail.status]).toEqual([code, status]);
    }
  });

  test('Overpass remarks in a successful answer are classified, with the service message', () => {
    expect(overpassRemarkError('<osm><remark> runtime error: Query timed out in "query" at line 1 after 26 seconds. </remark></osm>')!.code).toBe('timeout');
    const memory = overpassRemarkError('<osm><remark>runtime error: Query run out of memory using about 2048 MB of RAM.</remark></osm>')!;
    expect(memory.code).toBe('too-much-data');
    expect(memory.detail.message).toMatch(/out of memory/);
    expect(overpassRemarkError('<osm><remark>something else</remark></osm>')!.code).toBe('service');
    expect(overpassRemarkError('<osm></osm>')).toBeNull();
  });

  test('no results for a name, refusal, and unexpected answers', async () => {
    reply(200, '[]');
    expect((await failureOf(searchPlace('Nowhere'))).code).toBe('no-results');
    reply(429, '');
    const refused = await failureOf(searchPlace('Example'));
    expect([refused.code, refused.detail.status]).toEqual(['refused', 429]);
    reply(200, 'not json');
    expect((await failureOf(searchPlace('Example'))).code).toBe('service');
  });

  test('a network error is reported as such', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect((await failureOf(fetchMapData(area))).code).toBe('network');
  });

  test('an answer above the data cap is not processed', async () => {
    reply(200, '<osm/>', { 'content-length': String(MAX_FETCH_BYTES + 1) });
    expect((await failureOf(fetchMapData(area))).code).toBe('too-much-data');
    reply(200, 'x'.repeat(MAX_FETCH_BYTES + 1));
    expect((await failureOf(fetchMapData(area))).code).toBe('too-much-data');
    expect((await failureOf(fetchMapData({ minLat: 0, minLon: 0, maxLat: 1, maxLon: 1 }))).code).toBe('too-much-data');
  });

  test('the browser gives up after the time limit, and a request can be cancelled', async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
    ) as unknown as typeof fetch;
    const timed = failureOf(fetchMapData(area));
    await vi.advanceTimersByTimeAsync(DATA_TIMEOUT_MS + 1);
    expect((await timed).code).toBe('timeout');
    const controller = new AbortController();
    const cancelled = failureOf(fetchMapData(area, controller.signal));
    controller.abort();
    expect((await cancelled).code).toBe('cancelled');
  });

  test('geocoder answers are read defensively', () => {
    const answer = JSON.stringify([
      { display_name: 'Example Town', boundingbox: ['0', '0.006', '0', '0.009'] },
      { display_name: 'Broken', boundingbox: ['x'] },
      { display_name: 'Inverted', boundingbox: ['1', '0', '0', '1'] },
    ]);
    expect(parsePlaces(answer)).toEqual([{ name: 'Example Town', bounds: { minLat: 0, maxLat: 0.006, minLon: 0, maxLon: 0.009 } }]);
  });
});

// Hard constraint 2 (FR-31): the labelled fetch is the only network
// operation. No other application source may open a network request.
describe('the only network operation', () => {
  test('the exempted identifiers of the PowerPoint format are schema namespaces only', () => {
    for (const id of XML_IDENTIFIERS) expect(id).toMatch(/^http:\/\/(schemas\.openxmlformats\.org\/|purl\.org\/dc\/|www\.w3\.org\/2001\/XMLSchema-instance$)/);
  });

  const srcDir = join(process.cwd(), 'src');
  const NETWORK = /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|navigator\.connection|new\s+Worker\s*\(|importScripts|https?:\/\//;

  test('only src/openmap.ts contains network calls or remote addresses', () => {
    const offenders = readdirSync(srcDir)
      .filter((f) => f.endsWith('.ts') && f !== 'openmap.ts')
      .filter((f) => {
        // The SVG namespace, and in the PowerPoint writer the XML namespaces
        // and relationship types of the format, are identifiers written into
        // documents, not addresses that are fetched; exactly these literals
        // are exempted, nothing else.
        let text = readFileSync(join(srcDir, f), 'utf8').replaceAll("'http://www.w3.org/2000/svg'", "''");
        if (f === 'pptxwriter.ts') for (const id of XML_IDENTIFIERS) text = text.replaceAll(`'${id}'`, "''");
        return NETWORK.test(text);
      });
    expect(offenders).toEqual([]);
    expect(NETWORK.test(readFileSync(join(srcDir, 'openmap.ts'), 'utf8'))).toBe(true);
  });

  test('the network module contacts only the two open services', () => {
    const text = readFileSync(join(srcDir, 'openmap.ts'), 'utf8');
    const urls = [...text.matchAll(/https?:\/\/[^\s'"`]+/g)].map((m) => m[0]);
    expect(new Set(urls)).toEqual(new Set([GEOCODER_URL, OVERPASS_URL]));
  });
});
