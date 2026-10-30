// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { chromium, devices, type Browser, type BrowserContextOptions, type Page } from 'playwright';

// The recipient problem (Pass 14) in a real browser, offline: the exported
// file's static state (FR-38 as amended in v1.5.0), the no-scripts notice's
// three behaviours (FR-59), and Open presentation (FR-60). A device's static
// preview is stood in for by Chromium with scripts disabled; the iPhone's own
// preview is not available here. Run after the build (npm run build).
const BUILT = join(process.cwd(), 'dist', 'build', 'index.html');
const DIR = mkdtempSync(join(tmpdir(), 'mapvibes-recipient-'));

let browser: Browser;
let exported: string;

beforeAll(async () => {
  if (!existsSync(BUILT)) throw new Error('dist/build/index.html is missing: run the build first');
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
  await context.setOffline(true);
  const page = await context.newPage();
  await page.goto(`file://${BUILT}`);
  await page.evaluate(() => delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker);
  await page.selectOption('#select-language', 'en');
  await page.click('#load-demo');
  await page.waitForFunction(() => document.querySelectorAll('#marker-layer .marker').length === 11);
  await page.click('#tab-presentation');
  await page.click('#export-open');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-go')]);
  exported = join(DIR, 'presentation.html');
  await download.saveAs(exported);
  await context.close();
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

async function open(file: string, options: BrowserContextOptions = {}, init?: () => void): Promise<Page> {
  const context = await browser.newContext({ ...devices['iPhone 13'], ...options });
  await context.setOffline(true);
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  await page.goto(`file://${file}`);
  return page;
}

const noticeShown = (page: Page) => page.evaluate(() => {
  const n = document.getElementById('boot-notice');
  return n !== null && getComputedStyle(n).display !== 'none' && n.getClientRects().length > 0;
});

describe('the no-scripts notice (FR-59)', () => {
  for (const [name, throttle] of [
    ['at full speed', 1],
    ['with the processor six times slower', 6],
  ] as const) {
    test(`with scripts running it never appears, ${name}`, async () => {
      // Every frame from the first records whether the notice is shown.
      const page = await open(exported, {}, () => {
        (window as unknown as { noticeFrames: number }).noticeFrames = 0;
        const watch = () => {
          const n = document.getElementById('boot-notice');
          if (n && getComputedStyle(n).display !== 'none' && n.getClientRects().length > 0) (window as unknown as { noticeFrames: number }).noticeFrames++;
          requestAnimationFrame(watch);
        };
        requestAnimationFrame(watch);
      });
      if (throttle > 1) {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
        await page.reload();
      }
      await page.waitForFunction(() => document.documentElement.hasAttribute('data-started'), undefined, { timeout: 30_000 });
      await page.waitForFunction(() => document.querySelectorAll('#presentation-marker-layer .marker').length === 11);
      expect(await page.evaluate(() => (window as unknown as { noticeFrames: number }).noticeFrames)).toBe(0);
      expect(await noticeShown(page)).toBe(false);
      await page.context().close();
    }, 60_000);
  }

  test('with scripts disabled it appears at once, above the presentation frame; the editor is nowhere', async () => {
    const page = await open(exported, { javaScriptEnabled: false });
    expect(await noticeShown(page)).toBe(true);
    const text = await page.locator('#boot-notice').innerText();
    expect(text).toContain('This presentation has not started.');
    expect(text).toContain('https://rekkike.github.io/MapVibes/');
    expect(text).toContain('"Open presentation"');
    // The static state: the viewer frame, in the export language.
    expect(await page.evaluate(() => [document.documentElement.dataset.mode, document.documentElement.lang])).toEqual(['viewer', 'en']);
    expect(await page.isVisible('#presentation-stage')).toBe(true);
    for (const id of ['#segment-information', '#segment-map', '#segment-nav', '#work-controls', '#visibility-area', '#export-open', '#presentation-empty']) expect(await page.isVisible(id), id).toBe(false);
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('Drop an .xlsx file');
    expect(body).not.toContain('Load demo');
    // Nothing overflows the phone's width.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.context().close();
  }, 60_000);

  test('when the program fails to start, it appears after fifteen seconds, not before', async () => {
    // A browser below the minimum platform: the application cannot start.
    const page = await open(exported, {}, () => {
      delete (Element.prototype as { replaceChildren?: unknown }).replaceChildren;
    });
    await page.clock.install();
    await page.reload();
    await page.clock.runFor(14_000);
    expect(await noticeShown(page)).toBe(false);
    await page.clock.runFor(1_500);
    expect(await noticeShown(page)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.dataset.boot)).toBe('failed');
    await page.context().close();
  }, 60_000);

  test('the minimum platform: without the array method at (before iOS 15.4) the presentation still starts (FR-61)', async () => {
    const page = await open(exported, {}, () => {
      delete (Array.prototype as { at?: unknown }).at;
    });
    await page.waitForFunction(() => document.querySelectorAll('#presentation-marker-layer .marker').length === 11);
    expect(await noticeShown(page)).toBe(false);
    await page.context().close();
  }, 60_000);
});

describe('Open presentation in the application (FR-60)', () => {
  async function application(): Promise<{ page: Page; errors: string[] }> {
    const page = await open(BUILT);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.evaluate(() => document.getElementById('select-language') && ((document.getElementById('select-language') as HTMLSelectElement).value = 'en'));
    await page.selectOption('#select-language', 'en');
    return { page, errors };
  }

  test('a valid file is shown read-only in the narrow viewer on a phone, and closing starts the application afresh', async () => {
    const { page, errors } = await application();
    await page.setInputFiles('#presentation-file-input', exported);
    await page.waitForFunction(() => document.querySelectorAll('#presentation-marker-layer .marker').length === 11);
    expect(await page.evaluate(() => document.documentElement.dataset.mode)).toBe('viewer');
    // The narrow layout applies: the toggle bar, the overlays closed.
    expect(await page.isVisible('#toggle-glance')).toBe(true);
    expect(await page.$eval('#presentation-glance', (e) => (e as HTMLElement).dataset.state)).toBe('closed');
    for (const id of ['#segment-information', '#segment-map', '#work-controls']) expect(await page.isVisible(id), id).toBe(false);
    expect(await page.isVisible('#presentation-close')).toBe(true);
    // Nothing of the file's own program ran: the notice and its script are
    // only text the file carries.
    expect(await page.evaluate(() => document.getElementById('boot-notice'))).toBeNull();
    await Promise.all([page.waitForEvent('load'), page.click('#presentation-close')]);
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-started'));
    expect(await page.evaluate(() => document.documentElement.dataset.mode ?? null)).toBeNull();
    expect(await page.isVisible('#load-demo')).toBe(true);
    expect(errors).toEqual([]);
    await page.context().close();
  }, 60_000);

  test('a tampered file is refused strictly, and the application stays as it was', async () => {
    const { page } = await application();
    const text = readFileSync(exported, 'utf8');
    const tampered = join(DIR, 'tampered.html');
    // The presentation numbers no longer rise with the rows.
    writeFileSync(tampered, text.replace(/"numbers": \[\s*1,/, '"numbers": [\n    99,'));
    expect(readFileSync(tampered, 'utf8')).not.toBe(text);
    await page.setInputFiles('#presentation-file-input', tampered);
    await page.waitForFunction(() => document.getElementById('work-status')!.textContent !== '');
    expect(await page.textContent('#work-status')).toBe('The data embedded in the exported file could not be read. Nothing was opened.');
    expect(await page.evaluate(() => document.documentElement.dataset.mode ?? null)).toBeNull();
    await page.context().close();
  }, 60_000);

  test('a file larger than 50 MB is refused', async () => {
    const { page } = await application();
    const big = join(DIR, 'big.html');
    writeFileSync(big, Buffer.alloc(50 * 1024 * 1024 + 1, 0x20));
    await page.setInputFiles('#presentation-file-input', big);
    await page.waitForFunction(() => document.getElementById('work-status')!.textContent !== '');
    expect(await page.textContent('#work-status')).toBe('The file is larger than 50 MB. Nothing was opened.');
    expect(await page.evaluate(() => document.documentElement.dataset.mode ?? null)).toBeNull();
    await page.context().close();
  }, 60_000);
});
