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

type Reply = { status?: number; body?: string; fail?: boolean };
let calls: Array<{ url: string; init: RequestInit }>;
let replies: Reply[];

function stubFetch(): void {
  calls = [];
  replies = [];
  window.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    const reply = replies.shift() ?? { status: 500, body: '' };
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

async function searchAndChoose(name: string, index = 0): Promise<void> {
  byId('fetch-open').click();
  byId<HTMLInputElement>('fetch-place').value = name;
  replies.push({ body: PLACES });
  byId('fetch-search').click();
  await flush();
  document.querySelectorAll<HTMLButtonElement>('.fetch-result')[index].click();
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

  test('the action is clearly labelled as the only network operation', () => {
    expect(byId('fetch-open').textContent).toBe('Fetch open map data (online)');
    expect(byId('fetch-open').classList.contains('network-action')).toBe(true);
    byId('fetch-open').click();
    expect(visible('fetch-panel')).toBe(true);
    expect(byId('fetch-badge').textContent).toBe('Network');
    expect(byId('fetch-notice').textContent).toMatch(/only network operation/);
    expect(byId('fetch-notice').textContent).toMatch(/No list data, markers, or other work is sent/);
  });

  test('no request is ever made automatically: not on start, import, editing, panel opening, or save', async () => {
    byId('tab-information').click();
    await importExampleWorkbook();
    setRole('ID', 'identifier');
    document.querySelector<HTMLElement>('#row-table-body .colour-chip')!.click();
    byId('tab-map').click();
    byId('fetch-open').click();
    byId<HTMLInputElement>('fetch-place').value = 'Example Town';
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
    expect(byId<HTMLButtonElement>('fetch-go').disabled).toBe(false);
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
    for (const call of calls) {
      expect(call.init.credentials).toBe('omit');
      expect(call.init.method).toBe('GET');
      expect(call.init.body).toBeUndefined();
      // No user data in any request.
      for (const value of ['A-01', 'Alpha item', 'North']) expect(decodeURIComponent(call.url)).not.toContain(value);
    }
    expect(rendered).toEqual([{ width: 3000, height: 2000, attribution: '© OpenStreetMap contributors' }]);
    expect(byId('map-stage').dataset.hasBackground).toBe('true');
    expect(byId('fetch-status').textContent).toBe('Open map data fetched and rendered.');
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
    const file = JSON.parse(written.text!);
    expect(file.background.dataUrl).toBe('data:image/png;base64,RkVUQ0g3000x2000');
    expect(calls).toHaveLength(2);
  });

  test('a large place is reduced to its central part, and the user is told', async () => {
    await searchAndChoose('Example Region', 1);
    expect(byId('fetch-status').textContent).toBe('The area of this place is large; the central part is fetched.');
    replies.push({ body: osmText });
    byId('fetch-go').click();
    await flush();
    const box = new URL(calls[1].url).searchParams.get('data')!.match(/\]\(([^)]*)\)/)![1].split(',').map(Number);
    expect((box[2] - box[0]) * (box[3] - box[1])).toBeLessThanOrEqual(0.0025);
  });

  test('a bounding box can be entered directly; invalid and too large areas are refused without a request', async () => {
    byId('fetch-open').click();
    byId<HTMLInputElement>('fetch-mode-bbox').click();
    expect(visible('fetch-bbox-row')).toBe(true);
    expect(visible('fetch-place-row')).toBe(false);
    const bbox = byId<HTMLInputElement>('fetch-bbox');
    bbox.value = '0, 0, 1';
    bbox.dispatchEvent(new Event('input'));
    byId('fetch-go').click();
    await flush();
    expect(byId('fetch-status').textContent).toBe('Enter the area as four numbers: south, west, north, east, in decimal degrees.');
    bbox.value = '0, 0, 1, 1';
    byId('fetch-go').click();
    await flush();
    expect(byId('fetch-status').textContent).toMatch(/too large/);
    expect(calls).toEqual([]);
    bbox.value = '0, 0, 0.006, 0.009';
    replies.push({ body: osmText });
    byId('fetch-go').click();
    await flush();
    expect(calls).toHaveLength(1);
    expect(byId('map-stage').dataset.hasBackground).toBe('true');
  });

  test('offline, the action is disabled with a clear message, and no request is attempted', async () => {
    setOnline(false);
    expect(byId<HTMLButtonElement>('fetch-open').disabled).toBe(true);
    expect(visible('fetch-offline')).toBe(true);
    expect(byId('fetch-offline').textContent).toMatch(/You are offline/);
    expect(byId('fetch-offline').textContent).toMatch(/\.osm/);
    expect(byId('fetch-open').getAttribute('aria-describedby')).toBe('fetch-offline');
    setOnline(true);
    expect(byId<HTMLButtonElement>('fetch-open').disabled).toBe(false);
    expect(visible('fetch-offline')).toBe(false);
    // Going offline with the panel open disables its request buttons too.
    await searchAndChoose('Example Town');
    setOnline(false);
    expect(byId<HTMLButtonElement>('fetch-search').disabled).toBe(true);
    expect(byId<HTMLButtonElement>('fetch-go').disabled).toBe(true);
    expect(calls).toHaveLength(1);
  });

  test('service failures are reported and change nothing', async () => {
    byId('fetch-open').click();
    byId<HTMLInputElement>('fetch-place').value = 'Example Town';
    replies.push({ fail: true });
    byId('fetch-search').click();
    await flush();
    expect(byId('fetch-status').textContent).toMatch(/could not be reached/);
    expect(byId('fetch-status').classList.contains('error')).toBe(true);
    replies.push({ status: 429 });
    byId('fetch-search').click();
    await flush();
    expect(byId('fetch-status').textContent).toBe('The service is busy. Try again in a minute.');
    replies.push({ body: '[]' });
    byId('fetch-search').click();
    await flush();
    expect(byId('fetch-status').textContent).toBe('No places were found for this name.');
    await searchAndChoose('Example Town');
    replies.push({ body: '<html>error page</html>' });
    byId('fetch-go').click();
    await flush();
    expect(byId('map-error').textContent).toMatch(/not well-formed OpenStreetMap XML/);
    expect(byId('map-stage').dataset.hasBackground).toBe('false');
  });

  test('the panel follows the interface language', () => {
    const select = byId<HTMLSelectElement>('select-language');
    select.value = 'sv';
    select.dispatchEvent(new Event('change'));
    expect(byId('fetch-open').textContent).toBe('Hämta öppen kartdata (online)');
    expect(byId('fetch-badge').textContent).toBe('Nätverk');
  });
});
