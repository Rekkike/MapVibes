// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import { unzipStored } from '../../src/zipwriter';

(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = pdfjsWorker;

// The document exports (FR-50, FR-51) from the built page in headless
// Chromium, offline, with the full-test demo: both files download, are not
// empty, and are structurally valid; what is switched off is absent. Run
// after the build (npm run build).
const BUILT = join(process.cwd(), 'dist', 'build', 'index.html');

let browser: Browser;
let context: BrowserContext;
const requests: string[] = [];

beforeAll(async () => {
  if (!existsSync(BUILT)) throw new Error('dist/build/index.html is missing: run the build first');
  browser = await chromium.launch();
  context = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
  await context.setOffline(true);
  await context.route('**/*', (route) => {
    const url = route.request().url();
    requests.push(url);
    if (url.startsWith('file://') || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    return route.abort();
  });
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

async function demo(lang: 'en' | 'sv' = 'en'): Promise<{ page: Page; errors: string[] }> {
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`file://${BUILT}`);
  // The download path, as in browsers without a save dialog.
  await page.evaluate(() => delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker);
  await page.selectOption('#select-language', lang);
  await page.click('#load-demo');
  await page.waitForFunction(() => document.querySelectorAll('#marker-layer .marker').length === 11);
  await page.click('#tab-presentation');
  await page.click('#pres-fit');
  await page.waitForTimeout(400);
  return { page, errors };
}

async function download(page: Page, button: '#pdf-open' | '#pptx-open'): Promise<{ name: string; bytes: Uint8Array }> {
  await page.click(button);
  await page.waitForFunction(() => !(document.getElementById('document-go') as HTMLButtonElement).disabled, null, { timeout: 30_000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#document-go')]);
  const path = await dl.path();
  return { name: dl.suggestedFilename(), bytes: new Uint8Array(readFileSync(path)) };
}

async function pdfPages(bytes: Uint8Array): Promise<string[]> {
  const doc = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(content.items.map((it) => ('str' in it ? it.str : '')).filter((s) => s.trim() !== '').join('|'));
  }
  return pages;
}

function latin1(bytes: Uint8Array): string {
  return new TextDecoder('latin1').decode(bytes);
}

describe('document exports in a browser, offline (FR-50, FR-51)', () => {
  test('the PDF downloads, is valid, and holds the whole stage in view and the table', async () => {
    const { page, errors } = await demo();
    const { name, bytes } = await download(page, '#pdf-open');
    expect(name).toBe('mapvibes-presentation.pdf');
    expect(bytes.length).toBeGreaterThan(10_000);
    const s = latin1(bytes);
    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(s.endsWith('%%EOF\n')).toBe(true);
    // After Fit view the whole rendered map is in view: it is embedded whole,
    // captured before the dialog narrowed the stage.
    expect(s).toMatch(/\/Width 3000 \/Height 2000 \/ColorSpace \/DeviceRGB \/BitsPerComponent 8 \/Filter \/DCTDecode/);
    const pages = await pdfPages(bytes);
    expect(pages).toHaveLength(2);
    const stage = pages[0].split('|');
    for (let n = 1; n <= 11; n++) expect(stage, String(n)).toContain(String(n));
    for (const text of ['Jetty footprint', 'Survey zone', 'Planned footpath', 'Legend', 'On track', 'Lightning bolt']) expect(pages[0]).toContain(text);
    for (const item of ['D-01', 'D-06', 'D-12', 'Old mill', 'Heritage route']) expect(pages[1]).toContain(item);
    expect(errors).toEqual([]);
    await page.close();
  }, 60_000);

  test('the PowerPoint file downloads and is a valid package: the stage image, then the table slide', async () => {
    const { page, errors } = await demo();
    const { name, bytes } = await download(page, '#pptx-open');
    expect(name).toBe('mapvibes-presentation.pptx');
    expect(bytes.length).toBeGreaterThan(10_000);
    const parts = new Map(unzipStored(bytes).map((e) => [e.name, e.data]));
    for (const part of ['[Content_Types].xml', '_rels/.rels', 'ppt/presentation.xml', 'ppt/slideMasters/slideMaster1.xml', 'ppt/slideLayouts/slideLayout1.xml', 'ppt/theme/theme1.xml', 'ppt/slides/slide1.xml', 'ppt/slides/slide2.xml']) {
      expect(parts.has(part), part).toBe(true);
    }
    // The slide image: a PNG of 1920 by 1080 pixels.
    const png = parts.get('ppt/media/image1.png')!;
    expect([...png.slice(1, 4)].map((c) => String.fromCharCode(c)).join('')).toBe('PNG');
    const view = new DataView(png.buffer, png.byteOffset);
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([1920, 1080]);
    const table = new TextDecoder().decode(parts.get('ppt/slides/slide2.xml'));
    for (const item of ['D-01', 'D-12', 'Heritage route']) expect(table).toContain(`<a:t>${item}</a:t>`);
    expect(errors).toEqual([]);
    await page.close();
  }, 60_000);

  test('a switched-off item is absent from both documents', async () => {
    const { page } = await demo();
    // The first item toggle is D-01's (North gate).
    await page.locator('.visibility-toggle').first().click();
    const pdf = await download(page, '#pdf-open');
    const pages = await pdfPages(pdf.bytes);
    expect(pages[1]).not.toContain('D-01');
    expect(pages[1]).not.toContain('North gate');
    expect(pages[1]).toContain('D-02');
    const pptx = await download(page, '#pptx-open');
    const table = new TextDecoder().decode(unzipStored(pptx.bytes).find((e) => e.name === 'ppt/slides/slide2.xml')!.data);
    expect(table).not.toContain('D-01');
    expect(table).toContain('D-02');
    await page.close();
  }, 60_000);

  test("the Swedish interface's characters come through the PDF's standard fonts", async () => {
    const { page } = await demo('sv');
    const { bytes } = await download(page, '#pdf-open');
    const pages = await pdfPages(bytes);
    expect(pages[0]).toContain('Teckenförklaring');
    expect(pages[0]).toContain('Färger');
    expect(pages[1]).toContain('Objekt 1 till 12 av 12');
    await page.close();
  }, 60_000);

  test('no request is made beyond the local file itself', () => {
    expect(requests.filter((u) => !u.startsWith('file://') && !u.startsWith('data:') && !u.startsWith('blob:'))).toEqual([]);
  });
});
