import { describe, expect, test, vi } from 'vitest';
import {
  byId,
  exampleFile,
  flush,
  importExampleWorkbook,
  loadExampleBackground,
  mountApp,
  openWorkFile,
  placeExampleMarkers,
  pointer,
  setRole,
  STAGE,
  stubImageDecoding,
  stubStageLayout,
  textFile,
} from './harness';
import { NARROW_QUERY } from '../../src/narrowviewer';

// jsdom has no canvas: the PDF library is replaced by the stand-in of
// tests/ui/pdf.test.ts (the example document has two pages).
vi.mock('../../src/pdfbackground', () => ({
  isPdfFile: (file: File) => file.name.toLowerCase().endsWith('.pdf'),
  openPdf: async (data: ArrayBuffer) => {
    const head = new TextDecoder().decode(new Uint8Array(data).slice(0, 5));
    if (head !== '%PDF-') throw new Error('not a PDF');
    const pageCount = data.byteLength > 1000 ? 2 : 1;
    return {
      pageCount,
      pageSize: async () => ({ width: 842, height: 595 }),
      renderPage: async (page: number) => `data:image/png;base64,UEFHRS${page}`,
      close: async () => undefined,
    };
  },
}));

// The phone editor's phase two, units 4 and 5 (FR-71 and FR-72 as amended in
// v1.15.0): in the narrow layout the six dialogs open as overlays over the
// stage -- the three bottom sheets (fetch open map data, the PDF background
// chooser, export document) and the three stacked pages (export
// presentation, comparison, activities) -- one open at a time, with a
// data-state, inert while closed, focus moved in on opening and returned to
// the opener on closing, Escape and a tap outside closing. Above the
// threshold the dialogs keep their page-flow shapes and nothing of the
// overlay remains. The sheets' and pages' layout (75 per cent of the
// viewport, the pinned actions, full height) is measured in the browser
// suite.

async function mountNarrow(): Promise<void> {
  await mountApp({
    beforeMain: () => {
      const plain = window.matchMedia;
      window.matchMedia = ((q: string) => (q === NARROW_QUERY ? { ...plain(q), matches: true } : plain(q))) as typeof window.matchMedia;
    },
  });
}

async function mountNarrowWithWork(): Promise<void> {
  // singleFile, so that the export action can prepare its file (FR-11).
  await mountApp({
    singleFile: true,
    beforeMain: () => {
      const plain = window.matchMedia;
      window.matchMedia = ((q: string) => (q === NARROW_QUERY ? { ...plain(q), matches: true } : plain(q))) as typeof window.matchMedia;
    },
  });
  await placeExampleMarkers([
    [0, 60, 100],
    [2, 400, 300],
  ]);
}

function esc(): void {
  (document.activeElement ?? window).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

function tapOutside(): void {
  pointer('pointerdown', byId('map-stage'), STAGE.left + 700, STAGE.top + 500);
}

const expectSheetOpen = (id: string) => {
  expect(byId(id).classList.contains('hidden'), id).toBe(false);
  expect(byId(id).dataset.state, id).toBe('open');
  expect(byId(id).inert, id).toBe(false);
  expect(byId(id).contains(document.activeElement), id).toBe(true);
};

const expectSheetClosed = (id: string) => {
  expect(byId(id).classList.contains('hidden'), id).toBe(true);
  expect(byId(id).dataset.state, id).toBe('closed');
  expect(byId(id).inert, id).toBe(true);
};

describe('the three bottom sheets in the narrow layout (FR-71, FR-72 as amended in v1.15.0)', () => {
  test('fetch open map data: opens as a sheet, focus in; Escape, tap outside, and Close each close it with focus returned', async () => {
    await mountNarrowWithWork();
    byId('fetch-open').focus();
    byId('fetch-open').click();
    expectSheetOpen('fetch-panel');
    expect(document.activeElement).toBe(byId('fetch-place'));
    esc();
    expectSheetClosed('fetch-panel');
    expect(document.activeElement).toBe(byId('fetch-open'));
    byId('fetch-open').click();
    expectSheetOpen('fetch-panel');
    tapOutside();
    expectSheetClosed('fetch-panel');
    byId('fetch-open').click();
    expectSheetOpen('fetch-panel');
    byId('fetch-close').click();
    expectSheetClosed('fetch-panel');
  });

  test('the PDF background chooser: opens as a sheet on a multi-page document; Escape and Cancel close it', async () => {
    await mountNarrow();
    await importExampleWorkbook();
    byId('tab-map').click();
    stubStageLayout();
    stubImageDecoding(2526, 1785);
    const input = byId<HTMLInputElement>('map-file-input');
    Object.defineProperty(input, 'files', { value: [exampleFile('example-background.pdf', 'application/pdf')], configurable: true });
    input.dispatchEvent(new Event('change'));
    await flush();
    expectSheetOpen('pdf-panel');
    expect(document.activeElement).toBe(byId('pdf-page'));
    esc();
    expectSheetClosed('pdf-panel');
    Object.defineProperty(input, 'files', { value: [exampleFile('example-background.pdf', 'application/pdf')], configurable: true });
    input.dispatchEvent(new Event('change'));
    await flush();
    expectSheetOpen('pdf-panel');
    byId('pdf-cancel').click();
    await flush();
    expectSheetClosed('pdf-panel');
  });

  test('export document: opens as a sheet over the stage; Escape closes it and focus returns to its action', async () => {
    await mountNarrowWithWork();
    byId('tab-presentation').click();
    await flush();
    byId('pdf-open').focus();
    byId('pdf-open').click();
    await flush();
    expectSheetOpen('document-panel');
    esc();
    expectSheetClosed('document-panel');
    expect(document.activeElement).toBe(byId('pdf-open'));
    byId('pdf-open').click();
    await flush();
    expectSheetOpen('document-panel');
    byId('document-cancel').click();
    expectSheetClosed('document-panel');
  });
});

describe('above the threshold the sheets keep their page-flow shapes', () => {
  test('the fetch panel toggles plainly, with no overlay state', async () => {
    await mountApp();
    await placeExampleMarkers([[0, 60, 100]]);
    byId('tab-map').click();
    await flush();
    byId('fetch-open').click();
    expect(byId('fetch-panel').classList.contains('hidden')).toBe(false);
    expect(byId('fetch-panel').dataset.state).toBeUndefined();
    expect(byId('fetch-panel').inert).toBe(false);
    expect(byId('fetch-panel').contains(document.activeElement)).toBe(true);
    byId('fetch-close').click();
    expect(byId('fetch-panel').classList.contains('hidden')).toBe(true);
  });
});
