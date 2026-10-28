import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import { byId, editCell, flush, mountApp, placeExampleMarkers, pointer, removeSaveDialog, STAGE, stubSaveDialog } from './harness';

(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = pdfjsWorker;

// jsdom has no canvas: the re-encoding of the background stands in with the
// example JPEG image and records the part of the image asked for.
const crops: Array<{ x: number; y: number; width: number; height: number }> = [];
vi.mock('../../src/raster', () => ({
  backgroundJpeg: async (_src: string, crop: { x: number; y: number; width: number; height: number }) => {
    crops.push(crop);
    return { jpeg: new Uint8Array(readFileSync(join(process.cwd(), 'example-data', 'example-background.jpg'))), width: 1200, height: 800 };
  },
}));

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await flush();
}

async function openPdf(): Promise<void> {
  byId('pdf-open').click();
  await settle();
}

function lines(id: string): string[] {
  return [...byId(id).querySelectorAll('li')].map((li) => li.textContent ?? '');
}

async function exportPdf(): Promise<Uint8Array> {
  const written = stubSaveDialog();
  await openPdf();
  byId('document-go').click();
  await settle();
  expect(written.name).toBe('mapvibes-presentation.pdf');
  expect(written.type).toBe('application/pdf');
  return written.bytes!;
}

async function pageTexts(bytes: Uint8Array): Promise<string[]> {
  const doc = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false }).promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    out.push(content.items.map((it) => ('str' in it ? it.str : '')).filter((s) => s.trim() !== '').join('|'));
  }
  return out;
}

function at(type: string, x: number, y: number): void {
  pointer(type, byId('map-stage'), STAGE.left + x, STAGE.top + y);
}

function drawRectangle(from: [number, number], to: [number, number], label: string): void {
  document.querySelector<HTMLButtonElement>('#annotation-tools [data-tool="rectangle"]')!.click();
  at('pointerdown', ...from);
  at('pointermove', ...to);
  at('pointerup', ...to);
  const input = byId<HTMLInputElement>('annotation-label');
  input.value = label;
  input.dispatchEvent(new Event('input'));
  input.dispatchEvent(new Event('change'));
}

describe('PDF export (FR-12, FR-50, FR-52)', () => {
  beforeEach(async () => {
    crops.length = 0;
    removeSaveDialog();
    await mountApp();
    await placeExampleMarkers([
      [0, 60, 100],
      [2, 400, 300],
      [4, 760, 500],
    ]);
    drawRectangle([100, 150], [300, 250], 'Survey area');
    byId('tab-presentation').click();
    await flush();
  });

  test('the action sits in the Presentation toolbar; the dialog states what the document holds before it is written', async () => {
    expect(byId('pdf-open').textContent).toBe('Export PDF');
    expect(byId('pdf-open').parentElement!.id).toBe('presentation-toolbar');
    await openPdf();
    expect(byId('document-panel').classList.contains('hidden')).toBe(false);
    expect(byId('document-heading').textContent).toBe('Export PDF');
    expect(lines('document-contains')).toEqual([
      'the presentation stage as shown: 3 markers and 1 annotation in view',
      'the visible part of the background (1200 × 800 pixels)',
      'the legend',
      'a table of the 5 shown items with 5 columns, on 1 page',
    ]);
    expect(lines('document-omitted')).toEqual([
      '0 rows removed from the list',
      '0 items switched off for the presentation',
      '0 annotations switched off for the presentation',
      '0 hidden columns',
      '0 placed items outside the view: they are not drawn on the map but are in the table',
      'comments',
      'the end of long values: a value is shown in at most three lines, shortened with an ellipsis',
      'no characters are replaced: every character can be shown with the standard PDF fonts',
    ]);
    expect(byId('document-size').textContent).toMatch(/^File size: \d+ kB\.$/);
    expect(byId<HTMLButtonElement>('document-go').disabled).toBe(false);
  });

  test('the document holds the stage page and the table, and lands as a PDF file', async () => {
    const bytes = await exportPdf();
    expect(new TextDecoder('latin1').decode(bytes.slice(0, 8))).toBe('%PDF-1.4');
    const [stage, table] = await pageTexts(bytes);
    // The stage page: the markers' numbers, the annotation label, the legend.
    // The placed items are the first, third, and fifth.
    for (const text of ['1', '3', '5', 'Survey area', 'Legend', 'Green', 'Lightning bolt']) expect(stage.split('|')).toContain(text);
    expect(stage).toMatch(/MapVibes v\d+\.\d+\.\d+ · .+ · page 1 of 2$/);
    // The table: the number, the shown columns, every shown item.
    // The reader may split a short bold word into pieces; the text is whole.
    expect(table.replace(/\|/g, '').startsWith('Items 1 to 5 of 5No.IDStartEndGroupNote1A-012024-01-05')).toBe(true);
    for (const id of ['A-01', 'A-02', 'A-03', 'A-04', 'A-05']) expect(table).toContain(`|${id}|`);
    expect(byId('document-status').textContent).toBe('The document was exported.');
    expect(byId('document-panel').classList.contains('hidden')).toBe(true);
  });

  test('what is switched off, removed, or hidden is absent from the document', async () => {
    // A-01 switched off for the presentation, its column Note hidden, A-05
    // removed from the list, and the free annotation switched off.
    document.querySelectorAll<HTMLInputElement>('.visibility-toggle')[0].click();
    document.querySelector<HTMLInputElement>('.annotation-toggle')!.click();
    byId('tab-information').click();
    const note = document.querySelector<HTMLInputElement>('.column-visible[data-header="Note"]')!;
    note.checked = false;
    note.dispatchEvent(new Event('change'));
    const rows = document.querySelectorAll<HTMLElement>('#row-table-body tr');
    rows[4].querySelector<HTMLInputElement>('.row-select')!.click();
    byId('delete-selected').click();
    byId('tab-presentation').click();
    await flush();
    await openPdf();
    expect(lines('document-omitted').slice(0, 4)).toEqual([
      '1 row removed from the list',
      '1 item switched off for the presentation',
      '1 annotation switched off for the presentation',
      '1 hidden column',
    ]);
    byId('document-cancel').click();
    const [stage, table] = await pageTexts(await exportPdf());
    expect(stage).not.toContain('Survey area');
    expect(table).not.toContain('A-01');
    expect(table).not.toContain('A-05');
    expect(table).not.toContain('|Note|');
    expect(table).toContain('|A-03|');
  });

  test('characters the standard fonts cannot show are counted in the dialog and replaced in the document', async () => {
    byId('tab-information').click();
    editCell(1, 'Note', 'Ωmega Ж');
    byId('tab-presentation').click();
    await flush();
    await openPdf();
    expect(lines('document-omitted')).toContain('characters that the standard PDF fonts cannot show (2 in all): each is replaced by a question mark');
    byId('document-cancel').click();
    const [, table] = await pageTexts(await exportPdf());
    expect(table).toContain('?mega ?');
  });

  test('only the part of the background in view is embedded', async () => {
    byId('pres-fit').click();
    byId('pres-zoom-in').click();
    await openPdf();
    const crop = crops[crops.length - 1];
    expect(crop.width).toBeLessThan(1200);
    expect(crop.height).toBeLessThan(800);
  });

  test('cancelling writes nothing; a refused save dialog says so', async () => {
    const written = stubSaveDialog('cancel');
    await openPdf();
    byId('document-go').click();
    await settle();
    expect(written.bytes).toBeUndefined();
    expect(byId('document-status').textContent).toBe('The export was cancelled. Nothing was written.');
  });

  test('the dialog follows the language', async () => {
    const lang = byId<HTMLSelectElement>('select-language');
    lang.value = 'sv';
    lang.dispatchEvent(new Event('change'));
    expect(byId('pdf-open').textContent).toBe('Exportera PDF');
    await openPdf();
    expect(byId('document-heading').textContent).toBe('Exportera PDF');
    expect(lines('document-contains')[2]).toBe('teckenförklaringen');
    const [stage, table] = await pageTexts(await (async () => {
      byId('document-cancel').click();
      return exportPdf();
    })());
    expect(stage.split('|')).toContain('Teckenförklaring');
    // The reader may split a short bold word into letters; the text is whole.
    expect(table.replace(/\|/g, '').startsWith('Objekt 1 till 5 av 5NrIDStartEnd')).toBe(true);
  });
});

describe('PDF export without a background', () => {
  test('the dialog does not open and says why', async () => {
    await mountApp();
    byId('tab-presentation').click();
    byId('pdf-open').click();
    await settle();
    expect(byId('document-panel').classList.contains('hidden')).toBe(true);
    expect(byId('document-status').textContent).toBe('A document needs a background on the presentation stage. Nothing was exported.');
  });
});
