import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  byId,
  dragItemToStage,
  flush,
  importExampleWorkbook,
  markers,
  mountApp,
  placementItems,
  removeSaveDialog,
  setRole,
  STAGE,
  stubImageDecoding,
  stubSaveDialog,
  stubStageLayout,
} from './harness';

const rendered: Array<{ width: number; height: number; attribution?: string }> = [];
vi.mock('../../src/osmrender', () => ({
  renderPlanToDataUrl: (plan: { width: number; height: number }, attribution?: string) => {
    rendered.push({ width: plan.width, height: plan.height, attribution });
    return `data:image/png;base64,RkVUQ0g${plan.width}x${plan.height}`;
  },
}));

const osmText = readFileSync(join(process.cwd(), 'example-data', 'example-map.osm'), 'utf8').replace(/\s*<bounds[^>]*\/>/, '');
const PLACES = JSON.stringify([
  { display_name: 'Example Town, Nowhere', boundingbox: ['0', '0.006', '0', '0.009'] },
  { display_name: 'Example Region', boundingbox: ['-1', '1', '-1', '1'] },
]);

// Simulated service responses: each reply answers one request, in order. A
// pending reply waits until it is released or the request is aborted.
type Reply = { status?: number; body?: string; fail?: boolean; pending?: boolean };
let calls: Array<{ url: string; init: RequestInit }>;
let replies: Reply[];
let release: (() => void) | null;

function stubFetch(): void {
  calls = [];
  replies = [];
  release = null;
  window.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    const reply = replies.shift() ?? { status: 500, body: '' };
    if (reply.pending) {
      await new Promise<void>((resolve, reject) => {
        release = resolve;
        init?.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
      });
    }
    if (reply.fail) throw new TypeError('Failed to fetch');
    const status = reply.status ?? 200;
    return { ok: status >= 200 && status < 300, status, text: async () => reply.body ?? '' } as Response;
  }) as typeof window.fetch;
}

function setOnline(online: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { get: () => online, configurable: true });
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
}

function visible(id: string): boolean {
  return !byId(id).classList.contains('hidden');
}

function status(): string {
  return byId('fetch-status').textContent ?? '';
}

async function searchAndChoose(name: string, index = 0): Promise<void> {
  byId('fetch-open').click();
  byId<HTMLInputElement>('fetch-place').value = name;
  replies.push({ body: PLACES });
  byId('fetch-search').click();
  await flush();
  document.querySelectorAll<HTMLButtonElement>('.fetch-result')[index].click();
}

function rectangleMode(values?: [string, string, string, string]): void {
  byId('fetch-open').click();
  byId<HTMLInputElement>('fetch-mode-bbox').click();
  if (!values) return;
  (['south', 'west', 'north', 'east'] as const).forEach((edge, i) => {
    const input = byId<HTMLInputElement>(`fetch-${edge}`);
    input.value = values[i];
    input.dispatchEvent(new Event('input'));
  });
}

describe('open-map fetch (FR-31)', () => {
  beforeEach(async () => {
    rendered.length = 0;
    await mountApp();
    stubFetch();
    setOnline(true);
    byId('tab-map').click();
    stubStageLayout();
    stubImageDecoding(3000, 2000);
  });

  afterEach(() => {
    setOnline(true);
    removeSaveDialog();
  });

  test('the action is clearly labelled as the only network operation; place search is the primary route', () => {
    expect(byId('fetch-open').textContent).toBe('Fetch open map data (online)');
    expect(byId('fetch-open').classList.contains('network-action')).toBe(true);
    byId('fetch-open').click();
    expect(visible('fetch-panel')).toBe(true);
    expect(byId('fetch-badge').textContent).toBe('Network');
    expect(byId('fetch-notice').textContent).toMatch(/only network operation/);
    expect(byId('fetch-notice').textContent).toMatch(/No list data, markers, or other work is sent/);
    expect(byId<HTMLInputElement>('fetch-mode-place').checked).toBe(true);
    expect(byId('fetch-mode-place-label').textContent).toBe('Place name (recommended)');
    expect(visible('fetch-bbox-row')).toBe(false);
  });

  test('no request is ever made automatically: not on start, import, editing, panel opening, or save', async () => {
    byId('tab-information').click();
    await importExampleWorkbook();
    setRole('ID', 'identifier');
    document.querySelector<HTMLElement>('#row-table-body .colour-chip')!.click();
    byId('tab-map').click();
    byId('fetch-open').click();
    byId<HTMLInputElement>('fetch-place').value = 'Example Town';
    rectangleMode(['0', '0', '0.006', '0.009']);
    stubSaveDialog();
    byId('work-save').click();
    setOnline(false);
    setOnline(true);
    await flush();
    expect(calls).toEqual([]);
  });

  test('place search, choice, and fetch render the data as the background, sending only the name and the area', async () => {
    byId('tab-information').click();
    await importExampleWorkbook();
    setRole('ID', 'identifier');
    byId('tab-map').click();
    await searchAndChoose('Example Town');
    expect([...document.querySelectorAll('.fetch-result')].map((b) => b.textContent)).toEqual(['Example Town, Nowhere', 'Example Region']);
    replies.push({ body: osmText });
    byId('fetch-go').click();
    await flush();
    expect(calls).toHaveLength(2);
    const search = new URL(calls[0].url);
    expect(search.hostname).toBe('nominatim.openstreetmap.org');
    expect(search.searchParams.get('q')).toBe('Example Town');
    const data = new URL(calls[1].url);
    expect(data.hostname).toBe('overpass-api.de');
    expect(data.searchParams.get('data')).toContain('(0,0,0.006,0.009)');
    expect(data.searchParams.get('data')).toContain('[maxsize:16777216]');
    for (const call of calls) {
      expect(call.init.credentials).toBe('omit');
      expect(call.init.method).toBe('GET');
      expect(call.init.body).toBeUndefined();
      for (const value of ['A-01', 'Alpha item', 'North']) expect(decodeURIComponent(call.url)).not.toContain(value);
    }
    expect(rendered).toEqual([{ width: 3000, height: 2000, attribution: '© OpenStreetMap contributors' }]);
    expect(byId('map-stage').dataset.hasBackground).toBe('true');
    expect(status()).toBe('Open map data fetched and rendered.');
  });

  test('markers are placed on the fetched background, which is embedded in the work state', async () => {
    byId('tab-information').click();
    await importExampleWorkbook();
    byId('tab-map').click();
    await searchAndChoose('Example Town');
    replies.push({ body: osmText });
    byId('fetch-go').click();
    await flush();
    dragItemToStage(placementItems()[0], STAGE.left + 400, STAGE.top + 300);
    expect(markers()).toHaveLength(1);
    const written = stubSaveDialog();
    byId('work-save').click();
    await flush();
    expect(JSON.parse(written.text!).background.dataUrl).toBe('data:image/png;base64,RkVUQ0g3000x2000');
    expect(calls).toHaveLength(2);
  });

  test('a large area is reduced to its central part, and the reduction is stated with its edges', async () => {
    await searchAndChoose('Example Region', 1);
    replies.push({ body: osmText });
    byId('fetch-go').click();
    await flush();
    const box = new URL(calls[1].url).searchParams.get('data')!.match(/\]\(([^)]*)\)/)![1].split(',').map(Number);
    expect((box[2] - box[0]) * (box[3] - box[1])).toBeLessThanOrEqual(0.0025);
    expect(status()).toMatch(/^The area was larger than the limit of about 5\.5 by 5\.5 kilometres and was reduced to its central part: South -0\.02498, West -0\.02498, North 0\.02498, East 0\.02498\. Open map data fetched and rendered\.$/);
  });

  describe('bounding rectangle', () => {
    test('four labelled fields in decimal degrees, with an explanation and an example', () => {
      rectangleMode();
      expect(visible('fetch-bbox-row')).toBe(true);
      expect(visible('fetch-place-row')).toBe(false);
      expect(byId('fetch-bbox-legend').textContent).toBe('Bounding rectangle in decimal degrees (WGS84)');
      expect(byId('fetch-bbox-help').textContent).toMatch(/latitudes from −90 to 90 for south and north, longitudes from −180 to 180 for west and east/);
      expect(byId('fetch-bbox-example').textContent).toBe('Example: south 10.000, west 20.000, north 10.020, east 20.030.');
      const labels = [...byId('fetch-bbox-row').querySelectorAll('.fetch-edge')].map((l) => l.querySelector('span')!.textContent);
      expect(labels).toEqual(['South', 'West', 'North', 'East']);
      expect(byId<HTMLButtonElement>('fetch-go').disabled).toBe(true);
    });

    test('a non-numeric value is rejected with a message naming the field, without a request', async () => {
      rectangleMode(['0', 'abc', '0.006', '0.009']);
      byId('fetch-go').click();
      await flush();
      expect(status()).toBe('West is not a number. Enter decimal degrees, for example 10.020.');
      expect(byId('fetch-west').getAttribute('aria-invalid')).toBe('true');
      expect(byId('fetch-south').getAttribute('aria-invalid')).toBe('false');
      expect(calls).toEqual([]);
    });

    test('an out-of-range value is rejected with a message naming the field', async () => {
      rectangleMode(['0', '0', '95', '0.009']);
      byId('fetch-go').click();
      await flush();
      expect(status()).toBe('North is out of range: it must be between −90 and 90.');
      rectangleMode(['0', '0', '0.006', '200']);
      byId('fetch-go').click();
      await flush();
      expect(status()).toBe('East is out of range: it must be between −180 and 180.');
      rectangleMode(['1', '0', '0.5', '0.009']);
      byId('fetch-go').click();
      await flush();
      expect(status()).toBe('South must be less than north.');
      expect(calls).toEqual([]);
    });

    test('a valid rectangle is fetched; a comma decimal separator is accepted', async () => {
      rectangleMode(['0', '0', '0,006', '0,009']);
      replies.push({ body: osmText });
      byId('fetch-go').click();
      await flush();
      expect(calls).toHaveLength(1);
      expect(new URL(calls[0].url).searchParams.get('data')).toContain('(0,0,0.006,0.009)');
      expect(byId('map-stage').dataset.hasBackground).toBe('true');
    });

    test('a rectangle larger than the cap is reduced and the reduction is stated', async () => {
      rectangleMode(['0', '0', '1', '1']);
      replies.push({ body: osmText });
      byId('fetch-go').click();
      await flush();
      expect(status()).toMatch(/^The area was larger than the limit .* reduced to its central part: South 0\.47502, West 0\.47502, North 0\.52497, East 0\.52497\./);
    });
  });

  test('while a request runs the panel is busy and the request can be cancelled', async () => {
    byId('fetch-open').click();
    byId<HTMLInputElement>('fetch-place').value = 'Example Town';
    replies.push({ pending: true, body: PLACES });
    byId('fetch-search').click();
    await flush();
    expect(byId('fetch-panel').getAttribute('aria-busy')).toBe('true');
    expect(status()).toBe('Searching…');
    expect(byId('fetch-status').classList.contains('busy')).toBe(true);
    expect(visible('fetch-cancel')).toBe(true);
    expect(byId<HTMLButtonElement>('fetch-search').disabled).toBe(true);
    expect(byId<HTMLInputElement>('fetch-place').disabled).toBe(true);
    byId('fetch-cancel').click();
    await flush();
    expect(status()).toBe('Cancelled. Nothing was changed.');
    expect(byId('fetch-panel').getAttribute('aria-busy')).toBe('false');
    expect(visible('fetch-cancel')).toBe(false);
    expect(byId<HTMLButtonElement>('fetch-search').disabled).toBe(false);
  });

  test('a running data request can be cancelled and nothing changes', async () => {
    await searchAndChoose('Example Town');
    replies.push({ pending: true, body: osmText });
    byId('fetch-go').click();
    await flush();
    expect(status()).toBe('Fetching map data…');
    byId('fetch-cancel').click();
    await flush();
    expect(status()).toBe('Cancelled. Nothing was changed.');
    expect(byId('map-stage').dataset.hasBackground).toBe('false');
  });

  describe('every failure has its own message, with the service status', () => {
    async function searchFails(reply: Reply): Promise<string> {
      byId('fetch-open').click();
      byId<HTMLInputElement>('fetch-place').value = 'Example Town';
      replies.push(reply);
      byId('fetch-search').click();
      await flush();
      expect(byId('fetch-status').classList.contains('error')).toBe(true);
      return status();
    }

    async function dataFails(reply: Reply): Promise<string> {
      await searchAndChoose('Example Town');
      replies.push(reply);
      byId('fetch-go').click();
      await flush();
      expect(byId('map-stage').dataset.hasBackground).toBe('false');
      return status();
    }

    test('no results for the name', async () => {
      expect(await searchFails({ body: '[]' })).toBe('No places were found for this name. Try another spelling or a nearby larger place.');
    });

    test('no map features in the area', async () => {
      expect(await dataFails({ body: '<?xml version="1.0"?><osm version="0.6"></osm>' })).toBe('No map features were found in this area. Nothing was changed.');
    });

    test('the service timed out (HTTP status, and the service remark)', async () => {
      expect(await dataFails({ status: 504 })).toBe(
        'The service took too long to answer and the request timed out. Try a smaller area or try again later. The service answered: HTTP 504 (Gateway Timeout).',
      );
      const remark = await dataFails({ body: '<osm><remark> runtime error: Query timed out in "query" at line 1 after 26 seconds. </remark></osm>' });
      expect(remark).toBe(
        'The service took too long to answer and the request timed out. Try a smaller area or try again later. The service answered: "runtime error: Query timed out in "query" at line 1 after 26 seconds.".',
      );
    });

    test('the service refused or rate-limited the request', async () => {
      expect(await searchFails({ status: 429 })).toBe(
        'The service refused the request or is limiting the number of requests. Wait a minute and try again. The service answered: HTTP 429 (Too Many Requests).',
      );
      expect(await dataFails({ status: 403 })).toMatch(/refused the request .* HTTP 403 \(Forbidden\)\.$/);
    });

    test('too much data for the cap', async () => {
      expect(await dataFails({ body: '<osm><remark>runtime error: Query run out of memory using about 16 MB of RAM.</remark></osm>' })).toMatch(
        /^The area holds more map data than the limit of 16 MB allows\. Choose a smaller area\. The service answered: "runtime error: Query run out of memory/,
      );
    });

    test('a network error', async () => {
      expect(await searchFails({ fail: true })).toMatch(/^A network error occurred: the service could not be reached\./);
    });

    test('an unexpected answer keeps its status', async () => {
      expect(await dataFails({ status: 500 })).toBe('The service returned an unexpected answer. Nothing was changed. The service answered: HTTP 500 (Internal Server Error).');
      expect(await dataFails({ body: '<html>error page</html>' })).toBe(
        'The service returned an unexpected answer. Nothing was changed. The service answered: "map data that could not be read".',
      );
    });
  });

  test('offline, the action is disabled with a clear message, and no request is attempted', async () => {
    setOnline(false);
    expect(byId<HTMLButtonElement>('fetch-open').disabled).toBe(true);
    expect(visible('fetch-offline')).toBe(true);
    expect(byId('fetch-offline').textContent).toMatch(/You are offline/);
    expect(byId('fetch-offline').textContent).toMatch(/\.osm/);
    setOnline(true);
    expect(byId<HTMLButtonElement>('fetch-open').disabled).toBe(false);
    await searchAndChoose('Example Town');
    setOnline(false);
    expect(byId<HTMLButtonElement>('fetch-search').disabled).toBe(true);
    expect(byId<HTMLButtonElement>('fetch-go').disabled).toBe(true);
    expect(calls).toHaveLength(1);
  });

  test('the panel follows the interface language', () => {
    const select = byId<HTMLSelectElement>('select-language');
    select.value = 'sv';
    select.dispatchEvent(new Event('change'));
    expect(byId('fetch-open').textContent).toBe('Hämta öppen kartdata (online)');
    expect(byId('fetch-badge').textContent).toBe('Nätverk');
    expect(byId('fetch-south-label').textContent).toBe('Syd');
    expect(byId('fetch-bbox-example').textContent).toBe('Exempel: syd 10,000, väst 20,000, nord 10,020, öst 20,030.');
  });
});
