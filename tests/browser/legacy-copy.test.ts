// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { pressExport, setSelect } from './chrome';

// The withdrawal (v2.8.1) in a real browser, offline. The automatic copy of
// v2.8.0 is withdrawn: no work state is ever written to device storage --
// pinned at 390x844 and 1440x900 through edits, an explicit save, and a
// pagehide, with every setItem key recorded. What remains for the users who
// ran v2.8.0 or the withdrawn branch: on open, a legacy stored key gets ONE
// final offer, clearly labelled as the copy of a withdrawn feature --
// restore it into the work (as v2.8.0 applied it) or discard it; either
// choice removes the key and the app never reads it again. A damaged copy
// is cleared with a notice. No key, no offer, no banner. The exported
// viewer never reads the key. Run after the build (npm run build).
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
  // Records every key written to device storage, so that the zero-write pin
  // sees all writes, not only the final state.
  await context.addInitScript(() => {
    const w = window as unknown as { __setItemKeys?: string[] };
    w.__setItemKeys = [];
    const orig = (Storage.prototype as unknown as { setItem: (this: Storage, key: string, value: string) => void }).setItem;
    Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
      w.__setItemKeys!.push(key);
      return orig.call(this, key, value);
    };
  });
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

async function setItemKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __setItemKeys: string[] }).__setItemKeys);
}

// Saves the work as a file through the download route (the save dialog is
// not available in the test browser); the download confirmation dialog is
// accepted. At the compact size the work controls sit in the Menu overlay.
// Returns the written file's text.
async function saveWorkFile(page: Page): Promise<string> {
  if (await page.isVisible('#menu-toggle')) {
    await page.click('#menu-toggle');
    await page.waitForTimeout(200);
  }
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#work-save')]);
  if (await page.isVisible('#menu-toggle')) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
  const dir = mkdtempSync(join(tmpdir(), 'mapvibes-legacy-'));
  const file = join(dir, 'work.json');
  await download.saveAs(file);
  return readFileSync(file, 'utf8');
}

// Seeds a legacy stored key exactly as v2.8.0 wrote it.
async function seedLegacyCopy(page: Page, state: string, savedAt = new Date(Date.now() - 3600_000).toISOString()): Promise<void> {
  await page.evaluate(
    ({ k, savedAt, state }) => localStorage.setItem(k, JSON.stringify({ format: 'mapvibes-stored-work', version: 1, savedAt, state })),
    { k: KEY, savedAt, state },
  );
}

describe('the withdrawal: zero storage writes of work state (v2.8.1)', () => {
  for (const [name, options] of SIZES) {
    test(`on ${name}: edits, an explicit save, and a pagehide write no work state to device storage; across a reload there is no key and no offer`, async () => {
      const page = await openApp(options, 'en', 'light');
      await page.setInputFiles('#file-input', EXAMPLE);
      await page.waitForFunction(() => document.querySelectorAll('#row-table-body tr').length > 0, undefined, { timeout: 30_000 });
      const rows = await page.locator('#row-table-body tr').count();
      await page.locator('#row-table-body .colour-chip').first().click();
      await page.locator('#row-table-body .row-select').first().click();
      await page.click('#delete-selected');
      await page.waitForFunction((n) => document.querySelectorAll('#row-table-body tr').length === n - 1, rows, { timeout: 30_000 });
      // The explicit save writes the work file -- and nothing to storage.
      const text = await saveWorkFile(page);
      expect(text).toContain('mapvibes-work-state');
      await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
      await page.waitForTimeout(1600);
      expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull();
      expect((await setItemKeys(page)).filter((k) => k === KEY)).toEqual([]);
      // Across a reload: no key, no offer, no banner.
      await page.reload();
      await page.waitForTimeout(1500);
      expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull();
      expect(await page.locator('#legacy-offer:not(.hidden)').count()).toBe(0);
      await page.context().close();
    }, 120_000);
  }
});

describe('the legacy stored copy: one final offer on open (v2.8.1)', () => {
  for (const [name, options] of SIZES) {
    for (const theme of ['light', 'dark'] as const) {
      test(`on ${name} (${theme}, en): a seeded key offers once, labelled as the copy of a withdrawn feature; restore applies it and removes the key`, async () => {
        const page = await openApp(options, 'en', theme);
        await page.setInputFiles('#file-input', EXAMPLE);
        await page.waitForFunction(() => document.querySelectorAll('#row-table-body tr').length > 0, undefined, { timeout: 30_000 });
        const rows = await page.locator('#row-table-body tr').count();
        const text = await saveWorkFile(page);
        await seedLegacyCopy(page, text);
        // A reload: the application starts over the legacy key.
        await page.reload();
        await page.waitForSelector('#legacy-offer:not(.hidden)', { timeout: 30_000 });
        const offer = await page.locator('#legacy-text').textContent();
        expect(offer).toMatch(/stored on this device from \d{4}-\d{2}-\d{2} \d{2}:\d{2} \(/);
        expect(offer).toContain('automatic copy');
        expect(offer).toContain('withdrawn');
        expect(offer).toContain('not a saved work file');
        expect(offer).toMatch(/ago\)|just now/);
        expect(await page.locator('#legacy-restore').textContent()).toBe('Restore the copy into the work');
        // Never applied silently: the list is still empty under the offer.
        expect(await page.locator('#row-table-body tr').count()).toBe(0);
        // The explicit action restores the work, as v2.8.0 applied it.
        await page.click('#legacy-restore');
        await page.waitForFunction((n) => document.querySelectorAll('#row-table-body tr').length === n, rows, { timeout: 30_000 });
        expect(await page.locator('#work-status').textContent()).toContain('restored from the device copy of the withdrawn feature');
        expect(await page.locator('#legacy-offer:not(.hidden)').count()).toBe(0);
        // Either choice removes the key; a later open offers nothing.
        expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull();
        await page.reload();
        await page.waitForTimeout(1500);
        expect(await page.locator('#legacy-offer:not(.hidden)').count()).toBe(0);
        await page.context().close();
      }, 120_000);
    }
  }

  test('on desktop 1440x900 (light, sv): the offer is in Swedish; discard removes the key', async () => {
    const page = await openApp({ viewport: { width: 1440, height: 900 } }, 'sv', 'light');
    await page.setInputFiles('#file-input', EXAMPLE);
    await page.waitForFunction(() => document.querySelectorAll('#row-table-body tr').length > 0, undefined, { timeout: 30_000 });
    const text = await saveWorkFile(page);
    await seedLegacyCopy(page, text);
    await page.reload();
    await page.waitForSelector('#legacy-offer:not(.hidden)', { timeout: 30_000 });
    const offer = await page.locator('#legacy-text').textContent();
    expect(offer).toMatch(/sparades p\u00e5 den h\u00e4r enheten fr\u00e5n \d{4}-\d{2}-\d{2} \d{2}:\d{2} \(/);
    expect(offer).toContain('automatiska kopian');
    expect(offer).toContain('dragits tillbaka');
    expect(offer).toContain('inte en sparad arbetsfil');
    expect(await page.locator('#legacy-restore').textContent()).toBe('\u00c5terst\u00e4ll kopian i arbetet');
    expect(await page.locator('#legacy-discard').textContent()).toBe('Kasta kopian');
    await page.click('#legacy-discard');
    await page.waitForFunction((k) => localStorage.getItem(k) === null, KEY, { timeout: 10_000 });
    expect(await page.locator('#legacy-offer:not(.hidden)').count()).toBe(0);
    expect(await page.locator('#work-status').textContent()).toContain('kastats');
    await page.reload();
    await page.waitForTimeout(1500);
    expect(await page.locator('#legacy-offer:not(.hidden)').count()).toBe(0);
    await page.context().close();
  }, 120_000);

  test('a damaged legacy copy is not offered: it is cleared with a notice, and a later open offers nothing', async () => {
    const page = await openApp({ viewport: { width: 1440, height: 900 } }, 'en', 'light');
    await page.setInputFiles('#file-input', EXAMPLE);
    await page.waitForFunction(() => document.querySelectorAll('#row-table-body tr').length > 0, undefined, { timeout: 30_000 });
    const text = await saveWorkFile(page);
    await seedLegacyCopy(page, text.slice(0, 200) + '{"format":"mapvibes-work-state"}');
    await page.reload();
    await page.waitForSelector('#legacy-offer:not(.hidden)', { timeout: 30_000 });
    const offer = await page.locator('#legacy-text').textContent();
    expect(offer).toContain('cannot be read');
    expect(offer).toContain('withdrawn');
    // Not offered as a restore: the restore action is hidden, one dismiss action.
    expect(await page.locator('#legacy-restore:not(.hidden)').count()).toBe(0);
    expect(await page.locator('#legacy-discard').textContent()).toBe('OK');
    // Cleared with the notice -- never silently.
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull();
    await page.click('#legacy-discard');
    expect(await page.locator('#legacy-offer:not(.hidden)').count()).toBe(0);
    await page.reload();
    await page.waitForTimeout(1500);
    expect(await page.locator('#legacy-offer:not(.hidden)').count()).toBe(0);
    await page.context().close();
  }, 120_000);
});

describe('the exported viewer never reads a legacy key (v2.8.1)', () => {
  test('with a legacy key on the device, the viewer offers nothing and leaves the key untouched', async () => {
    const page = await openApp({ viewport: { width: 1440, height: 900 } }, 'en', 'light');
    await page.setInputFiles('#file-input', EXAMPLE);
    await page.waitForFunction(() => document.querySelectorAll('#row-table-body tr').length > 0, undefined, { timeout: 30_000 });
    const text = await saveWorkFile(page);
    // Export a presentation from the work on screen.
    await page.click('#tab-presentation');
    await page.waitForTimeout(500);
    await pressExport(page, 'export-open');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-go')]);
    const dir = mkdtempSync(join(tmpdir(), 'mapvibes-legacy-viewer-'));
    const exported = join(dir, 'presentation.html');
    await download.saveAs(exported);
    await page.context().close();

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.setOffline(true);
    const viewer = await context.newPage();
    await viewer.goto(`file://${exported}`);
    await viewer.waitForFunction(() => document.documentElement.dataset.mode === 'viewer', undefined, { timeout: 30_000 });
    // Seed a legacy key inside the viewer's own storage, then reload.
    await viewer.evaluate(
      ({ k, savedAt, state }) => localStorage.setItem(k, JSON.stringify({ format: 'mapvibes-stored-work', version: 1, savedAt, state })),
      { k: KEY, savedAt: new Date(Date.now() - 3600_000).toISOString(), state: text },
    );
    const before = await viewer.evaluate((k) => localStorage.getItem(k), KEY);
    await viewer.reload();
    await viewer.waitForFunction(() => document.documentElement.dataset.mode === 'viewer', undefined, { timeout: 30_000 });
    await viewer.waitForTimeout(800);
    expect(await viewer.locator('#legacy-offer:not(.hidden)').count()).toBe(0);
    await viewer.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    expect(await viewer.evaluate((k) => localStorage.getItem(k), KEY)).toBe(before);
    await context.close();
  }, 120_000);
});
