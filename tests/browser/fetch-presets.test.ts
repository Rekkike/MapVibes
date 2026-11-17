// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { chromium, devices, type Browser, type BrowserContext, type Page } from 'playwright';
import { setSelect } from './chrome';

// The fetch area size presets (v2.5.0, FR-31): 40, 60 and 85 per cent of the
// maximum fetch area (0.0025 sq deg, the cap), offered in the fetch panel's
// radiogroup pattern beside the maximum, each label naming its own area in
// both languages, the cap named as the maximum. The FR-31 route is unchanged:
// every request is still made only by the explicit button presses, carrying
// only the name and the (scaled) area; both caps hold (0.0025 sq deg per
// request, 16 MiB of answer); offline, the action is disabled with its
// unchanged message. Run after the build (npm run build), in headless
// Chromium, with the two open services emulated by request interception and
// every other non-local request refused.
const BUILT = join(process.cwd(), 'dist', 'build', 'index.html');
const OSM = readFileSync(join(process.cwd(), 'example-data', 'example-map.osm'), 'utf8');
const PLACES = JSON.stringify([
  { display_name: 'Example Town, Nowhere', boundingbox: ['0', '0.006', '0', '0.009'] },
  { display_name: 'Example Region', boundingbox: ['-1', '1', '-1', '1'] },
]);

let browser: Browser;

beforeAll(async () => {
  if (!existsSync(BUILT)) {
    throw new Error('dist/build/index.html is missing: run the build first');
  }
  browser = await chromium.launch();
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

const WIDE = { width: 1440, height: 900 };
const PHONE = devices['iPhone 13']; // 390 x 844

const TEXTS = {
  en: {
    legend: 'Fetch area size',
    help: "The cap is the maximum area fetched at once: 0.0025 square degrees, about 5.5 by 5.5 kilometres at the equator. A preset scales the area to fetch to its share of the cap, about the requested area's centre.",
    max: 'Maximum (the cap): 0.0025 sq deg, about 5.5 × 5.5 km',
    p40: '40% of the maximum: 0.0010 sq deg, about 3.5 × 3.5 km',
    p60: '60% of the maximum: 0.0015 sq deg, about 4.3 × 4.3 km',
    p85: '85% of the maximum: 0.002125 sq deg, about 5.1 × 5.1 km',
    offline: 'You are offline. Fetching open map data needs a connection; a local OpenStreetMap (.osm) file can be loaded instead.',
    reduced: (pct: number) => `The area was scaled to ${pct}% of the maximum fetch area, about its centre:`,
    done: 'Open map data fetched and rendered.',
  },
  sv: {
    legend: 'Storlek på hämtningsområdet',
    help: 'Gränsen är det största område som hämtas åt gången: 0,0025 kvadratgrader, ungefär 5,5 gånger 5,5 kilometer vid ekvatorn. Ett förval skalar området som hämtas till sin andel av gränsen, kring det begärda områdets mitt.',
    max: 'Maximum (gränsen): 0,0025 kvadratgrader, ungefär 5,5 × 5,5 km',
    p40: '40 % av maximum: 0,0010 kvadratgrader, ungefär 3,5 × 3,5 km',
    p60: '60 % av maximum: 0,0015 kvadratgrader, ungefär 4,3 × 4,3 km',
    p85: '85 % av maximum: 0,002125 kvadratgrader, ungefär 5,1 × 5,1 km',
    offline: 'Du är offline. Att hämta öppen kartdata kräver en anslutning; en lokal OpenStreetMap-fil (.osm) kan läsas in i stället.',
    reduced: (pct: number) => `Området skalades till ${pct} % av det största hämtningsområdet, kring dess mitt:`,
    done: 'Öppen kartdata har hämtats och renderats.',
  },
} as const;

type Lang = keyof typeof TEXTS;

async function openApp(options: Parameters<Browser['newContext']>[0], lang: Lang, theme: 'light' | 'dark'): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext(options);
  await context.setOffline(true);
  const page = await context.newPage();
  await page.goto(`file://${BUILT}`);
  await setSelect(page, 'select-language', lang);
  await setSelect(page, 'select-theme', theme);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);
  return { context, page };
}

// Opens the fetch panel: the Map segment, then the action itself, which the
// wide classes and the phone's bar keep behind the tool strip's "more". The
// two presses are dispatched as click events: the pins target the panel's
// content, and a real click on the "more" control waits out the strip's own
// re-layout.
async function openFetchPanel(page: Page): Promise<void> {
  await page.click('#tab-map');
  await page.waitForTimeout(300);
  if (!(await page.isVisible('#fetch-open'))) {
    await page.dispatchEvent('#map-more', 'click');
    await page.waitForTimeout(250);
  }
  await page.dispatchEvent('#fetch-open', 'click');
  await page.waitForTimeout(300);
  expect(await page.isVisible('#fetch-panel')).toBe(true);
}

describe('the fetch area size presets (v2.5.0), labelled in both languages and both themes at both viewports', () => {
  for (const [name, options] of [
    ['1440x900', { viewport: WIDE }],
    ['390x844', PHONE],
  ] as const) {
    for (const lang of ['en', 'sv'] as const) {
      for (const theme of ['light', 'dark'] as const) {
        test(`${name}, ${lang}, ${theme}: each preset names its area, the maximum named as the cap, the maximum is the default`, async () => {
          const { context, page } = await openApp(options, lang, theme);
          await openFetchPanel(page);
          const t = TEXTS[lang];
          expect(await page.textContent('#fetch-size-legend')).toBe(t.legend);
          expect(await page.textContent('#fetch-size-help')).toBe(t.help);
          expect(await page.textContent('#fetch-size-max-label')).toBe(t.max);
          expect(await page.textContent('#fetch-size-40-label')).toBe(t.p40);
          expect(await page.textContent('#fetch-size-60-label')).toBe(t.p60);
          expect(await page.textContent('#fetch-size-85-label')).toBe(t.p85);
          expect(await page.isChecked('#fetch-size-max')).toBe(true);
          await context.close();
        }, 30_000);
      }
    }
  }
});

describe('a fetch made at each preset (v2.5.0): only the name and the scaled area are sent, both caps hold', () => {
  async function fetchAtPreset(
    options: Parameters<Browser['newContext']>[0],
    lang: Lang,
    preset: 'max' | '40' | '60' | '85',
  ): Promise<{ context: BrowserContext; page: Page; requests: string[]; headers: Record<string, string>[] }> {
    const context = await browser.newContext(options);
    const requests: string[] = [];
    const headers: Record<string, string>[] = [];
    await context.route('**/*', (route) => {
      const url = route.request().url();
      if (url.startsWith('file://') || url.startsWith('data:') || url.startsWith('blob:')) {
        return route.continue();
      }
      requests.push(url);
      headers.push(route.request().headers());
      if (url.startsWith('https://nominatim.openstreetmap.org/')) {
        return route.fulfill({ contentType: 'application/json', body: PLACES });
      }
      if (url.startsWith('https://overpass-api.de/')) {
        return route.fulfill({ contentType: 'application/xml', body: OSM });
      }
      return route.abort();
    });
    const page = await context.newPage();
    await page.goto(`file://${BUILT}`);
    await setSelect(page, 'select-language', lang);
    await setSelect(page, 'select-theme', 'light');
    await page.waitForTimeout(200);
    await openFetchPanel(page);
    await page.fill('#fetch-place', 'Example Region');
    await page.click('#fetch-search');
    await page.waitForSelector('.fetch-result');
    await page.click('.fetch-result >> nth=1');
    await page.check(`#fetch-size-${preset}`);
    await page.click('#fetch-go');
    await page.waitForFunction(() => document.getElementById('map-stage')!.dataset.hasBackground === 'true', undefined, { timeout: 15_000 });
    await page.waitForTimeout(200);
    return { context, page, requests, headers };
  }

  function dataRequest(requests: string[]): URL {
    const data = requests.filter((u) => u.startsWith('https://overpass-api.de/'));
    expect(data).toHaveLength(1);
    return new URL(data[0]);
  }

  function boxOf(url: URL): number[] {
    return url.searchParams
      .get('data')!
      .match(/\]\(([^)]*)\)/)![1]
      .split(',')
      .map(Number);
  }

  test('at 1440x900 in English, a fetch at each preset sends the area scaled to the preset share of the cap, centred, with the byte cap intact', async () => {
    for (const preset of ['40', '60', '85'] as const) {
      const { context, page, requests, headers } = await fetchAtPreset({ viewport: WIDE }, 'en', preset);
      const share = (Number(preset) / 100) * 0.0025;
      // Exactly the two labelled requests: the place search, then the data.
      expect(requests).toHaveLength(2);
      const search = new URL(requests[0]);
      expect(search.hostname).toBe('nominatim.openstreetmap.org');
      expect(search.searchParams.get('q')).toBe('Example Region');
      for (const h of headers) {
        expect(h['cookie']).toBeUndefined();
      }
      const data = dataRequest(requests);
      const query = data.searchParams.get('data')!;
      expect(query).toContain('[maxsize:16777216]');
      const box = boxOf(data);
      const area = (box[2] - box[0]) * (box[3] - box[1]);
      expect(area).toBeLessThanOrEqual(share * 1.0001);
      expect(area).toBeGreaterThan(share * 0.99);
      expect((box[0] + box[2]) / 2).toBeCloseTo(0, 9);
      expect((box[1] + box[3]) / 2).toBeCloseTo(0, 9);
      const status = (await page.textContent('#fetch-status')) ?? '';
      expect(status.startsWith(TEXTS.en.reduced(Number(preset)))).toBe(true);
      expect(status.endsWith(TEXTS.en.done)).toBe(true);
      await context.close();
    }
  }, 60_000);

  test('the maximum stays the default and enforces the 0.0025 sq deg cap as today, with the existing message', async () => {
    const { context, page, requests } = await fetchAtPreset({ viewport: WIDE }, 'en', 'max');
    expect(await page.isChecked('#fetch-size-max')).toBe(true);
    const box = boxOf(dataRequest(requests));
    expect((box[2] - box[0]) * (box[3] - box[1])).toBeLessThanOrEqual(0.0025 * 1.0001);
    const status = (await page.textContent('#fetch-status')) ?? '';
    expect(status.startsWith('The area was larger than the limit of about 5.5 by 5.5 kilometres and was reduced to its central part:')).toBe(true);
    expect(status.endsWith(TEXTS.en.done)).toBe(true);
    await context.close();
  }, 30_000);

  test('at 1440x900 in Swedish, a fetch at the 60 per cent preset says so in Swedish', async () => {
    const { context, page, requests } = await fetchAtPreset({ viewport: WIDE }, 'sv', '60');
    const box = boxOf(dataRequest(requests));
    const share = 0.6 * 0.0025;
    expect((box[2] - box[0]) * (box[3] - box[1])).toBeLessThanOrEqual(share * 1.0001);
    const status = (await page.textContent('#fetch-status')) ?? '';
    expect(status.startsWith(TEXTS.sv.reduced(60))).toBe(true);
    expect(status.endsWith(TEXTS.sv.done)).toBe(true);
    await context.close();
  }, 30_000);

  test('at 390x844 the panel is a bottom sheet and a fetch at the 40 per cent preset works there too', async () => {
    const { context, page, requests } = await fetchAtPreset(PHONE, 'en', '40');
    const vh = page.viewportSize()!.height;
    const rect = await page.evaluate(() => document.getElementById('fetch-panel')!.getBoundingClientRect());
    expect(Math.round(rect.height)).toBeLessThanOrEqual(Math.round(vh * 0.75));
    const box = boxOf(dataRequest(requests));
    const share = 0.4 * 0.0025;
    expect((box[2] - box[0]) * (box[3] - box[1])).toBeLessThanOrEqual(share * 1.0001);
    const status = (await page.textContent('#fetch-status')) ?? '';
    expect(status.startsWith(TEXTS.en.reduced(40))).toBe(true);
    await context.close();
  }, 30_000);
});

describe('offline (v2.5.0): the presets stay present but the action is disabled with its unchanged message, and no request is attempted', () => {
  for (const [name, options] of [
    ['1440x900', { viewport: WIDE }],
    ['390x844', PHONE],
  ] as const) {
    test(`${name}: the offline message is intact in both languages and the fetch control is disabled`, async () => {
      for (const lang of ['en', 'sv'] as const) {
        const { context, page } = await openApp(options, lang, 'light');
        const serviceRequests: string[] = [];
        await context.route('**/*', (route) => {
          const url = route.request().url();
          if (url.startsWith('file://') || url.startsWith('data:') || url.startsWith('blob:')) {
            return route.continue();
          }
          serviceRequests.push(url);
          return route.abort();
        });
        await page.reload();
        await page.waitForTimeout(250);
        await page.click('#tab-map');
        await page.waitForTimeout(300);
        if (!(await page.isVisible('#fetch-open'))) {
          await page.dispatchEvent('#map-more', 'click');
          await page.waitForTimeout(250);
        }
        expect(await page.isDisabled('#fetch-open')).toBe(true);
        expect(await page.textContent('#fetch-offline')).toBe(TEXTS[lang].offline);
        expect(await page.isVisible('#fetch-offline')).toBe(true);
        // Going offline with the panel open disables its request buttons.
        await context.setOffline(false);
        await page.dispatchEvent('#fetch-open', 'click');
        await page.waitForTimeout(300);
        expect(await page.isVisible('#fetch-size-row')).toBe(true);
        await context.setOffline(true);
        await page.waitForTimeout(300);
        expect(await page.isDisabled('#fetch-search')).toBe(true);
        expect(await page.isDisabled('#fetch-go')).toBe(true);
        expect(serviceRequests).toEqual([]);
        await context.close();
      }
    }, 60_000);
  }
});
