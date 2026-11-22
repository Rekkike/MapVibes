// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { pressExport, setSelect } from './chrome';

// The stored work on the device (v2.8.1) in a real browser, offline. The
// scope is the owner's ruling from use: nothing is written to device storage
// without the user's initiative -- the automatic copy exists only for a work
// with an explicit file relationship (a successful save to a work file, or
// opened from one), and from then the debounced copy follows changes. A
// never-saved work performs zero storage writes through any number of edits.
// A refused write is named once, in a dismissible notice at the top of the
// main area -- never persistent, never over an interactive surface (pinned
// geometrically at 390x844 and 1440x900) -- and the copy stops retrying until
// the work changes materially or is saved explicitly. An interrupted session
// of a saved work is recovered through the clearly labelled offer on open,
// never applied silently, at both sizes, both themes, both languages. The
// exported viewer never offers, reads, or writes a stored copy. Run after
// the build (npm run build).
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

async function keyAttempts(page: Page): Promise<number> {
  const keys = await setItemKeys(page);
  return keys.filter((k) => k === KEY).length;
}

// Saves the work as a file through the download route (the save dialog is
// not available in the test browser); the download confirmation dialog is
// accepted, so the save counts as successful and begins the work's file
// relationship. At the compact size the work controls sit in the Menu
// overlay. Returns the written file's text.
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
  const dir = mkdtempSync(join(tmpdir(), 'mapvibes-autosave-'));
  const file = join(dir, 'work.json');
  await download.saveAs(file);
  return readFileSync(file, 'utf8');
}

// Imports the example workbook, saves the work as a file (the first
// successful save starts the stored copy), then removes the first row and
// waits for the copy to follow the change; returns the kept row count.
async function workThenStored(page: Page): Promise<number> {
  await page.setInputFiles('#file-input', EXAMPLE);
  await page.waitForFunction(() => document.querySelectorAll('#row-table-body tr').length > 0, undefined, { timeout: 30_000 });
  const rows = await page.locator('#row-table-body tr').count();
  const text = await saveWorkFile(page);
  expect(text).toContain('mapvibes-work-state');
  await page.waitForFunction((k) => localStorage.getItem(k) !== null, KEY, { timeout: 20_000 });
  // The copy then follows changes, as v2.8.0 built it.
  const before = await page.evaluate((k) => localStorage.getItem(k) ?? '', KEY);
  await page.locator('#row-table-body .row-select').first().click();
  await page.click('#delete-selected');
  await page.waitForFunction((n) => document.querySelectorAll('#row-table-body tr').length === n - 1, rows, { timeout: 30_000 });
  await page.waitForFunction(
    ([k, prev]) => {
      const raw = localStorage.getItem(k);
      return raw !== null && raw !== prev;
    },
    [KEY, before],
    { timeout: 20_000 },
  );
  return rows - 1;
}

// The refusal notice's placement pin: it is a block at the top of the main
// area, fully inside the viewport and intersecting no interactive surface
// (the stages, the list, the segment nav) at the named sizes.
async function assertNoticeClearOfSurfaces(page: Page): Promise<void> {
  const result = await page.evaluate(() => {
    interface Box {
      sel: string;
      left: number;
      top: number;
      right: number;
      bottom: number;
      w: number;
      h: number;
    }
    const box = (sel: string): Box | null => {
      const e = document.querySelector(sel);
      if (!e) {
        return null;
      }
      const r = e.getBoundingClientRect();
      return { sel, left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height };
    };
    const overlap = (a: Box, b: Box): number =>
      Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const notice = box('#storage-refused');
    if (!notice) {
      throw new Error('the refusal notice is not in the page');
    }
    const surfaces = ['#map-stage', '#presentation-stage', '#list-scroll', '#list-toolbar', '#segment-nav']
      .map(box)
      .filter((b): b is Box => b !== null && b.w > 0 && b.h > 0);
    return {
      notice,
      overlaps: surfaces.map((s) => ({ sel: s.sel, area: overlap(notice, s) })),
      vw: window.innerWidth,
      vh: window.innerHeight,
    };
  });
  expect(result.notice.w).toBeGreaterThan(0);
  expect(result.notice.h).toBeGreaterThan(0);
  expect(result.notice.left).toBeGreaterThanOrEqual(0);
  expect(result.notice.top).toBeGreaterThanOrEqual(0);
  expect(result.notice.right).toBeLessThanOrEqual(result.vw);
  expect(result.notice.bottom).toBeLessThanOrEqual(result.vh);
  for (const o of result.overlaps) {
    expect(o.area, `#storage-refused overlaps ${o.sel}`).toBe(0);
  }
}

// Consumes the device storage down to a couple of kilobytes, so that the
// work state cannot fit: the measured wall is 5,239,808 bytes for a single
// write.
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

describe('a saved work is recovered after an interrupted session (v2.8.1)', () => {
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
    expect(offer).toMatch(/Sparat arbete p\u00e5 den h\u00e4r enheten fr\u00e5n \d{4}-\d{2}-\d{2} \d{2}:\d{2} \(/);
    expect(offer).toContain('inte en sparad arbetsfil');
    expect(await page.locator('#recovery-restore').textContent()).toBe('\u00c5terst\u00e4ll sparat arbete');
    await page.click('#recovery-restore');
    await page.waitForFunction((n) => document.querySelectorAll('#row-table-body tr').length === n, kept, { timeout: 30_000 });
    expect(await page.locator('#work-status').textContent()).toContain('har \u00e5terst\u00e4llts');
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

describe('a never-saved work performs zero storage writes (v2.8.1 scope ruling)', () => {
  for (const [name, options] of SIZES) {
    test(`on ${name}: edits and a pagehide write nothing to device storage, and no notice appears`, async () => {
      const page = await openApp(options, 'en', 'light');
      await page.setInputFiles('#file-input', EXAMPLE);
      await page.waitForFunction(() => document.querySelectorAll('#row-table-body tr').length > 0, undefined, { timeout: 30_000 });
      const rows = await page.locator('#row-table-body tr').count();
      await page.locator('#row-table-body .colour-chip').first().click();
      await page.locator('#row-table-body .row-select').first().click();
      await page.click('#delete-selected');
      await page.waitForFunction((n) => document.querySelectorAll('#row-table-body tr').length === n - 1, rows, { timeout: 30_000 });
      await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
      await page.waitForTimeout(1600);
      expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull();
      expect(await keyAttempts(page)).toBe(0);
      // The unsaved mark still shows, and no refusal notice appears.
      expect(await page.locator('#work-dirty:not(.hidden)').count()).toBe(1);
      expect(await page.locator('#storage-refused:not(.hidden)').count()).toBe(0);
      // Across a reload: no copy exists, so nothing is offered.
      await page.reload();
      await page.waitForTimeout(1500);
      expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull();
      expect(await page.locator('#recovery-offer:not(.hidden)').count()).toBe(0);
      expect(await page.locator('#storage-refused:not(.hidden)').count()).toBe(0);
      await page.context().close();
    }, 120_000);
  }
});

describe('a quota-exceeded refusal is named once, dismissible, and clear of the surfaces (v2.8.1 cure)', () => {
  for (const [name, options, theme] of [
    ['desktop 1440x900', { viewport: { width: 1440, height: 900 } }, 'light'],
    ['phone 390x844', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, 'dark'],
  ] as const) {
    test(`on ${name} (${theme}, en): the refusal is named once in a dismissible notice clear of the interactive surfaces; retries stop until a material change; the explicit save is unaffected`, async () => {
      const page = await openApp(options, 'en', theme);
      await fillStorage(page);
      await page.setInputFiles('#file-input', EXAMPLE);
      await page.waitForFunction(() => document.querySelectorAll('#row-table-body tr').length > 0, undefined, { timeout: 30_000 });
      // The first successful save starts the copy; the write is refused (the
      // work does not fit in the remaining storage) and named once.
      const text = await saveWorkFile(page);
      expect(text).toContain('mapvibes-work-state');
      await page.waitForSelector('#storage-refused:not(.hidden)', { timeout: 20_000 });
      expect(await page.locator('#storage-refused-text').textContent()).toContain('too large for the device storage');
      expect(await page.locator('#storage-refused-text').textContent()).toContain('Saving the work as a file is the protection');
      expect(await page.locator('#storage-refused-dismiss').textContent()).toBe('Dismiss');
      // The notice is a block at the top of the main area, not over any
      // interactive surface, at this size.
      await assertNoticeClearOfSurfaces(page);
      // It does not mask the work status; the save itself succeeded.
      expect((await page.locator('#work-status').textContent()) ?? '').not.toContain('refused');
      expect(await page.locator('#work-status').textContent()).toContain('Work saved.');
      // Dismissed: the notice goes and does not come back for this episode.
      const attemptsAfterFirstRefusal = await keyAttempts(page);
      await page.click('#storage-refused-dismiss');
      expect(await page.locator('#storage-refused:not(.hidden)').count()).toBe(0);
      // No retry while the work does not change.
      await page.waitForTimeout(1600);
      expect(await keyAttempts(page)).toBe(attemptsAfterFirstRefusal);
      // A material change retries once, is refused again, and is NOT named
      // again.
      await page.locator('#row-table-body .colour-chip').first().click();
      await page.waitForTimeout(1600);
      expect(await keyAttempts(page)).toBe(attemptsAfterFirstRefusal + 1);
      expect(await page.locator('#storage-refused:not(.hidden)').count()).toBe(0);
      expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull();
      // The explicit save remains the protection and is unaffected: the work
      // file downloads as ever.
      const again = await saveWorkFile(page);
      expect(again).toContain('mapvibes-work-state');
      expect(await page.locator('#row-table-body tr').count()).toBeGreaterThan(0);
      await page.context().close();
    }, 180_000);
  }

  test('on desktop 1440x900 (light, sv): the refusal notice is in Swedish', async () => {
    const page = await openApp({ viewport: { width: 1440, height: 900 } }, 'sv', 'light');
    await fillStorage(page);
    await page.setInputFiles('#file-input', EXAMPLE);
    await page.waitForFunction(() => document.querySelectorAll('#row-table-body tr').length > 0, undefined, { timeout: 30_000 });
    await saveWorkFile(page);
    await page.waitForSelector('#storage-refused:not(.hidden)', { timeout: 20_000 });
    expect(await page.locator('#storage-refused-text').textContent()).toContain('f\u00f6r stort f\u00f6r enhetens lagring');
    expect(await page.locator('#storage-refused-text').textContent()).toContain('Att spara arbetet som en fil \u00e4r skyddet');
    expect(await page.locator('#storage-refused-dismiss').textContent()).toBe('St\u00e4ng');
    await assertNoticeClearOfSurfaces(page);
    await page.click('#storage-refused-dismiss');
    expect(await page.locator('#storage-refused:not(.hidden)').count()).toBe(0);
    await page.context().close();
  }, 180_000);
});

describe('the exported viewer never touches a stored copy (v2.8.1)', () => {
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
    // No offer, no refusal notice, no clear action, and the copy is unchanged
    // even after a pagehide.
    expect(await viewer.locator('#recovery-offer:not(.hidden)').count()).toBe(0);
    expect(await viewer.locator('#storage-refused:not(.hidden)').count()).toBe(0);
    expect(await viewer.locator('#work-clear-stored:not(.hidden)').count()).toBe(0);
    await viewer.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    expect(await viewer.evaluate((k) => localStorage.getItem(k), KEY)).toBe(before);
    await context.close();
  }, 120_000);
});
