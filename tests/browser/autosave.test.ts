// @vitest-environment node
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { pressExport, setSelect } from './chrome';

// The stored work on the device (v2.8.0) in a real browser, offline: an
// interrupted session (an import and a removal, then a reload) is recovered
// through the clearly labelled offer on open -- never applied silently --
// at a phone and a desktop size in both themes and both languages; a
// quota-exceeded refusal is reported honestly while the explicit save of a
// work file is unaffected; and the exported viewer never offers, reads, or
// writes a stored copy. Run after the build (npm run build).
const BUILT = join(process.cwd(), 'dist', 'build', 'index.html');
const EXAMPLE = join(process.cwd(), 'example-data', 'example.xlsx');
const KEY = 'mapvibes.stored-work';

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

const SIZES = [
  ['phone 390x844', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ['desktop 1440x900', { viewport: { width: 1440, height: 900 } }],
] as const;

async function openApp(options: Parameters<Browser['newContext']>[0], lang: 'en' | 'sv', theme: 'light' | 'dark'): Promise<Page> {
  const context = await browser.newContext({ ...options, acceptDownloads: true });
  await context.setOffline(true);
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('file://') || url.startsWith('data:') || url.startsWith('blob:')) {
      return route.continue();
    }
    return route.abort();
  });
  const page = await context.newPage();
  page.on('dialog', (d) => void d.accept());
  await page.goto(`file://${BUILT}`);
  await page.evaluate(() => delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker);
  await setSelect(page, 'select-language', lang);
  await setSelect(page, 'select-theme', theme);
  return page;
}

// Imports the example workbook and removes its first row, so that the
// stored copy provably carries the last change; waits for the stored copy.
async function workThenStored(page: Page): Promise<number> {
  await page.setInputFiles('#file-input', EXAMPLE);
  await page.waitForFunction(() => document.querySelectorAll('#row-table-body tr').length > 0, undefined, { timeout: 30_000 });
  const rows = await page.locator('#row-table-body tr').count();
  await page.locator('#row-table-body .row-select').first().click();
  await page.click('#delete-selected');
  await page.waitForFunction((n) => document.querySelectorAll('#row-table-body tr').length === n - 1, rows, { timeout: 30_000 });
  await page.waitForFunction((k) => localStorage.getItem(k) !== null, KEY, { timeout: 20_000 });
  return rows - 1;
}

describe('the stored work on the device, recovered after an interrupted session (v2.8.0)', () => {
  for (const [name, options] of SIZES) {
    for (const theme of ['light', 'dark'] as const) {
      test(`on ${name} (${theme}, en): the reload offers the stored work, labelled, and restores it on the explicit action`, async () => {
        const page = await openApp(options, 'en', theme);
        const kept = await workThenStored(page);
        // The interrupted session: a reload with the work unsaved.
        await page.reload();
        await page.waitForSelector('#recovery-offer:not(.hidden)', { timeout: 30_000 });
        const offer = await page.locator('#recovery-text').textContent();
        expect(offer).toMatch(/Stored work on this device from \d{4}-\d{2}-\d{2} \d{2}:\d{2} \(/);
        expect(offer).toMatch(/ago\)|just now/);
        expect(offer).toContain('not a saved work file');
        // Never applied silently: the list is still empty under the offer.
        expect(await page.locator('#row-table-body tr').count()).toBe(0);
        expect(await page.locator('#work-clear-stored:not(.hidden)').count()).toBe(1);
        // The explicit action restores the work, including the last change.
        await page.click('#recovery-restore');
        await page.waitForFunction((n) => document.querySelectorAll('#row-table-body tr').length === n, kept, { timeout: 30_000 });
        expect(await page.locator('#work-status').textContent()).toContain('was restored');
        expect(await page.locator('#recovery-offer:not(.hidden)').count()).toBe(0);
        await page.context().close();
      }, 120_000);
    }
  }

  test('on desktop 1440x900 (light, sv): the offer is in Swedish', async () => {
    const page = await openApp({ viewport: { width: 1440, height: 900 } }, 'sv', 'light');
    const kept = await workThenStored(page);
    await page.reload();
    await page.waitForSelector('#recovery-offer:not(.hidden)', { timeout: 30_000 });
    const offer = await page.locator('#recovery-text').textContent();
    expect(offer).toMatch(/Sparat arbete på den här enheten från \d{4}-\d{2}-\d{2} \d{2}:\d{2} \(/);
    expect(offer).toContain('inte en sparad arbetsfil');
    expect(await page.locator('#recovery-restore').textContent()).toBe('Återställ sparat arbete');
    await page.click('#recovery-restore');
    await page.waitForFunction((n) => document.querySelectorAll('#row-table-body tr').length === n, kept, { timeout: 30_000 });
    expect(await page.locator('#work-status').textContent()).toContain('har återställts');
    await page.context().close();
  }, 120_000);

  test('discarding the offer clears the stored work; a later open offers nothing', async () => {
    const page = await openApp({ viewport: { width: 1440, height: 900 } }, 'en', 'light');
    await workThenStored(page);
    await page.reload();
    await page.waitForSelector('#recovery-offer:not(.hidden)', { timeout: 30_000 });
    await page.click('#recovery-discard');
    await page.waitForFunction((k) => localStorage.getItem(k) === null, KEY, { timeout: 10_000 });
    expect(await page.locator('#recovery-offer:not(.hidden)').count()).toBe(0);
    await page.reload();
    await page.waitForTimeout(1500);
    expect(await page.locator('#recovery-offer:not(.hidden)').count()).toBe(0);
    await page.context().close();
  }, 120_000);
});

describe('a quota-exceeded refusal is handled honestly (v2.8.0)', () => {
  async function fillStorage(page: Page): Promise<void> {
    await page.evaluate(() => {
      const trySet = (key: string, n: number): boolean => {
        try {
          localStorage.setItem(key, 'x'.repeat(n));
          return true;
        } catch {
          return false;
        }
      };
      let lo = 0;
      let hi = 6 * 1024 * 1024;
      while (hi - lo > 512) {
        const mid = Math.floor((lo + hi) / 2);
        if (trySet('probe', mid)) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      // Consume all but a couple of kilobytes, so the work state cannot fit.
      trySet('probe', lo);
      let rest = 0;
      for (let n = 1024; n < lo; n += 512) {
        if (trySet('probe2', n)) {
          rest = n;
        } else {
          break;
        }
      }
      trySet('probe2', rest);
    });
  }

  for (const [name, options, theme] of [
    ['desktop 1440x900', { viewport: { width: 1440, height: 900 } }, 'light'],
    ['phone 390x844', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, 'dark'],
  ] as const) {
    test(`on ${name} (${theme}): the refusal says so and stays, and the explicit save writes the file`, async () => {
      const page = await openApp(options, 'en', theme);
      await fillStorage(page);
      await page.setInputFiles('#file-input', EXAMPLE);
      await page.waitForFunction(() => document.querySelectorAll('#row-table-body tr').length > 0, undefined, { timeout: 30_000 });
      await page.waitForFunction(
        (k) =>
          localStorage.getItem(k) === null &&
          (document.getElementById('work-status') as HTMLElement).textContent.includes('refused to store the work on this device'),
        KEY,
        { timeout: 20_000 },
      );
      expect(await page.locator('#work-status').textContent()).toContain('Saving a work file is unaffected');
      expect(await page.locator('#work-status.error').count()).toBe(1);
      // The unsaved mark stays: a refusal is not a save and not a loss.
      expect(await page.locator('#work-dirty:not(.hidden)').count()).toBe(1);
      // The explicit save is unaffected: the file downloads as ever (at the
      // compact size the work controls sit in the Menu overlay).
      if (await page.isVisible('#menu-toggle')) {
        await page.click('#menu-toggle');
        await page.waitForTimeout(200);
      }
      const [download] = await Promise.all([page.waitForEvent('download'), page.click('#work-save')]);
      const dir = mkdtempSync(join(tmpdir(), 'mapvibes-autosave-'));
      const file = join(dir, 'work.json');
      await download.saveAs(file);
      const text = (await import('node:fs')).readFileSync(file, 'utf8');
      expect(text).toContain('mapvibes-work-state');
      expect(await page.locator('#row-table-body tr').count()).toBeGreaterThan(0);
      await page.context().close();
    }, 120_000);
  }
});

describe('the exported viewer never touches a stored copy (v2.8.0)', () => {
  test('with a stored copy on the device, the viewer offers nothing and writes nothing', async () => {
    const page = await openApp({ viewport: { width: 1440, height: 900 } }, 'en', 'light');
    await workThenStored(page);
    // Export a presentation from the work on screen.
    await page.click('#tab-presentation');
    await page.waitForTimeout(500);
    await pressExport(page, 'export-open');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-go')]);
    const dir = mkdtempSync(join(tmpdir(), 'mapvibes-autosave-viewer-'));
    const exported = join(dir, 'presentation.html');
    await download.saveAs(exported);
    await page.context().close();

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.setOffline(true);
    const viewer = await context.newPage();
    await viewer.goto(`file://${exported}`);
    await viewer.waitForFunction(() => document.documentElement.dataset.mode === 'viewer', undefined, { timeout: 30_000 });
    // Seed a stored copy inside the viewer's own storage, then reload: the
    // application starts over it.
    await viewer.evaluate((k) => {
      localStorage.setItem(
        k,
        JSON.stringify({
          format: 'mapvibes-stored-work',
          version: 1,
          savedAt: new Date(Date.now() - 3600_000).toISOString(),
          state:
            localStorage.getItem(k) ??
            '{"format":"mapvibes-work-state","schemaVersion":14,"columns":{"headers":[],"hiddenInList":[],"roles":{},"manual":[]},"rows":[],"background":null,"markers":[],"presentation":{"hidden":[]},"presets":[],"vocabularies":{"areas":[],"statuses":[],"programs":[]},"symbolsFromStatus":false,"colourLabels":{},"symbolLabels":{},"glance":{"columns":null},"card":{"columns":null},"economics":{"unit":"SEK","series":{}},"events":[],"annotations":[],"view":{"segment":"information","viewport":{"scale":1,"x":0,"y":0},"list":{"sort":{"header":null,"direction":"asc"},"filter":{"kind":"all","header":"","text":""},"numbering":"global","grouping":"flat"},"presentation":{"mode":"map","order":"number","timeline":null,"costs":null}}}',
        }),
      );
    }, KEY);
    const before = await viewer.evaluate((k) => localStorage.getItem(k), KEY);
    await viewer.reload();
    await viewer.waitForFunction(() => document.documentElement.dataset.mode === 'viewer', undefined, { timeout: 30_000 });
    await viewer.waitForTimeout(800);
    // No offer, no clear action, and the copy is unchanged even after a
    // pagehide.
    expect(await viewer.locator('#recovery-offer:not(.hidden)').count()).toBe(0);
    expect(await viewer.locator('#work-clear-stored:not(.hidden)').count()).toBe(0);
    await viewer.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    expect(await viewer.evaluate((k) => localStorage.getItem(k), KEY)).toBe(before);
    await context.close();
  }, 120_000);
});
