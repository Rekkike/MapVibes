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
  if (!existsSync(BUILT)) {
    throw new Error('dist/build/index.html is missing: run the build first');
  }
  browser = await chromium.launch();
  context = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
  await context.setOffline(true);
  await context.route('**/*', (route) => {
    const url = route.request().url();
    requests.push(url);
    if (url.startsWith('file://') || url.startsWith('data:') || url.startsWith('blob:')) {
      return route.continue();
    }
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
    pages.push(
      content.items
        .map((it) => ('str' in it ? it.str : ''))
        .filter((s) => s.trim() !== '')
        .join('|'),
    );
  }
  return pages;
}

function latin1(bytes: Uint8Array): string {
  return new TextDecoder('latin1').decode(bytes);
}

describe('document exports in a browser, offline (FR-50, FR-51)', () => {
  test('the PDF downloads, is valid, and holds the stage, the timeline pages, the economics pages, and the table', async () => {
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
    // Stage 1, timeline 2, economics 4, table 1 (measured on the demo).
    expect(pages).toHaveLength(8);
    const stage = pages[0].split('|');
    for (let n = 1; n <= 11; n++) {
      expect(stage, String(n)).toContain(String(n));
    }
    for (const text of ['Jetty footprint', 'Survey zone', 'Planned footpath', 'Legend', 'On track', 'Lightning bolt']) {
      expect(pages[0]).toContain(text);
    }
    // The timeline pages: the fitted axis (2-year ticks over 2026..2036), the
    // lines with their names, the events' chips, the work-phase legend entry
    // (the demo marks one activity as the work phase), and the captions.
    const timeline = pages.slice(1, 3).join('|');
    for (const text of [
      'Timeline',
      '2026',
      '2036',
      'North gate',
      'Old mill',
      'Review',
      'Decision',
      'Work phase',
      'The marked activity of an item',
      'Groundwork',
    ]) {
      expect(timeline).toContain(text);
    }
    expect(timeline).toMatch(/page 2 of 8/);
    // The economics pages: per-item blocks, the years with the unit, the
    // series names as headings, the totals.
    const economics = pages.slice(3, 7).join('|');
    for (const text of ['Economics', '237,000 kr', 'North gate', 'Outcome / Forecast', 'Budget:']) {
      expect(economics).toContain(text);
    }
    // The table is the last page.
    expect(pages[7].startsWith('Items 1 to 12 of 12')).toBe(true);
    for (const item of ['D-01', 'D-06', 'D-12', 'Old mill', 'Heritage route']) {
      expect(pages[7]).toContain(item);
    }
    expect(errors).toEqual([]);
    await page.close();
  }, 60_000);

  test('the PowerPoint file downloads and is a valid package: the image slides (stage, timeline, economics), then the table slides', async () => {
    const { page, errors } = await demo();
    const { name, bytes } = await download(page, '#pptx-open');
    expect(name).toBe('mapvibes-presentation.pptx');
    expect(bytes.length).toBeGreaterThan(10_000);
    const parts = new Map(unzipStored(bytes).map((e) => [e.name, e.data]));
    for (const part of [
      '[Content_Types].xml',
      '_rels/.rels',
      'ppt/presentation.xml',
      'ppt/slideMasters/slideMaster1.xml',
      'ppt/slideLayouts/slideLayout1.xml',
      'ppt/theme/theme1.xml',
    ]) {
      expect(parts.has(part), part).toBe(true);
    }
    // 9 slides (measured on the demo): stage 1, timeline 2, economics 4,
    // table 2. The first 7 are pictures, each with its own media part at
    // 1920 by 1080 pixels.
    const slides = [...parts.keys()].filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k)).sort();
    expect(slides).toHaveLength(9);
    const media = [...parts.keys()].filter((k) => /^ppt\/media\/image\d+\.png$/.test(k)).sort();
    expect(media).toHaveLength(7);
    for (const name of media) {
      const png = parts.get(name)!;
      expect([...png.slice(1, 4)].map((c) => String.fromCharCode(c)).join('')).toBe('PNG');
      const view = new DataView(png.buffer, png.byteOffset);
      expect([view.getUint32(16), view.getUint32(20)]).toEqual([1920, 1080]);
    }
    for (let i = 1; i <= 7; i++) {
      const xml = new TextDecoder().decode(parts.get(`ppt/slides/slide${i}.xml`));
      expect(xml).toContain('<p:pic>');
      expect(xml).not.toContain('<a:tbl>');
      expect(new TextDecoder().decode(parts.get(`ppt/slides/_rels/slide${i}.xml.rels`))).toContain(`../media/image${i}.png`);
    }
    // The table slides follow, as native tables.
    for (const n of [8, 9]) {
      const xml = new TextDecoder().decode(parts.get(`ppt/slides/slide${n}.xml`));
      expect(xml).toContain('<a:tbl>');
      expect(xml).not.toContain('<p:pic>');
    }
    const table = new TextDecoder().decode(parts.get('ppt/slides/slide8.xml'));
    expect(table).toContain('Items 1 to 12 of 12');
    for (const item of ['D-01', 'D-12', 'Heritage route']) {
      expect(table).toContain(`<a:t>${item}</a:t>`);
    }
    expect(errors).toEqual([]);
    await page.close();
  }, 60_000);

  test('a switched-off item is absent from the timeline pages, the economics pages, and the table in both documents', async () => {
    const { page } = await demo();
    // The first item toggle is D-01's (North gate).
    await page.locator('.visibility-toggle').first().click();
    const pdf = await download(page, '#pdf-open');
    const pages = await pdfPages(pdf.bytes);
    const table = pages[pages.length - 1];
    const schedule = pages.slice(1, -1).join('|');
    expect(table).not.toContain('D-01');
    expect(table).toContain('D-02');
    expect(schedule).not.toContain('North gate');
    expect(schedule).toContain('Garden path');
    const pptx = await download(page, '#pptx-open');
    const tableSlides = unzipStored(pptx.bytes).filter(
      (e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.name) && new TextDecoder().decode(e.data).includes('<a:tbl>'),
    );
    const tableXml = tableSlides.map((e) => new TextDecoder().decode(e.data)).join('');
    expect(tableXml).not.toContain('D-01');
    expect(tableXml).toContain('D-02');
    await page.close();
  }, 60_000);

  test("the Swedish interface's characters come through the PDF's standard fonts", async () => {
    const { page } = await demo('sv');
    const { bytes } = await download(page, '#pdf-open');
    const pages = await pdfPages(bytes);
    expect(pages[0]).toContain('Teckenförklaring');
    expect(pages[0]).toContain('Färger');
    expect(pages[1]).toContain('Tidslinje');
    expect(pages[1]).toContain('Arbetsfas');
    expect(pages[3]).toContain('Ekonomi');
    expect(pages[pages.length - 1]).toContain('Objekt 1 till 12 av 12');
    await page.close();
  }, 60_000);

  test('on a phone the dialog states the same pages and the documents come out the same size (the page kinds are laid out at document scale)', async () => {
    const phone = await context.newPage();
    await phone.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = [];
    phone.on('pageerror', (e) => errors.push(String(e)));
    await phone.goto(`file://${BUILT}`);
    await phone.evaluate(() => {
      delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
      // The language select is not visible at phone width; set it directly.
      const select = document.getElementById('select-language') as HTMLSelectElement;
      select.value = 'en';
      select.dispatchEvent(new Event('change'));
    });
    await phone.click('#load-demo');
    await phone.waitForFunction(() => document.querySelectorAll('#marker-layer .marker').length === 11);
    await phone.click('#tab-presentation');
    await phone.click('#pres-fit');
    await phone.waitForTimeout(400);
    await phone.click('#pdf-open');
    await phone.waitForFunction(() => !(document.getElementById('document-go') as HTMLButtonElement).disabled, null, { timeout: 30_000 });
    const contains = await phone.$$eval('#document-contains li', (lis) => lis.map((li) => li.textContent ?? ''));
    expect(contains).toContain('the timeline of the 12 shown items, fitted to the full span, on 2 pages');
    expect(contains).toContain('economics blocks for 11 of the shown items, on 4 pages');
    const [dl] = await Promise.all([phone.waitForEvent('download'), phone.click('#document-go')]);
    const pdfBytes = new Uint8Array(readFileSync(await dl.path()));
    const pages = await pdfPages(pdfBytes);
    expect(pages).toHaveLength(8);
    expect(errors).toEqual([]);
    await phone.close();
  }, 60_000);

  test('no request is made beyond the local file itself', () => {
    expect(requests.filter((u) => !u.startsWith('file://') && !u.startsWith('data:') && !u.startsWith('blob:'))).toEqual([]);
  });
});
