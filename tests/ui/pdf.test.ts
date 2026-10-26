import { beforeEach, describe, expect, test, vi } from 'vitest';
import { byId, exampleFile, flush, mountApp, stubImageDecoding, stubStageLayout } from './harness';

// jsdom has no canvas: the PDF library is replaced by a stand-in that reports
// the example document's two pages and "renders" a page to a data URL that
// names it. Real parsing is covered in tests/unit/pdfbackground.test.ts and
// real rendering by the headless-browser verification of the built artifact.
const rendered: number[] = [];
const closed: number[] = [];
let failRender = false;

vi.mock('../../src/pdfbackground', () => ({
  isPdfFile: (file: File) => file.name.toLowerCase().endsWith('.pdf'),
  openPdf: async (data: ArrayBuffer) => {
    const head = new TextDecoder().decode(new Uint8Array(data).slice(0, 5));
    if (head !== '%PDF-') throw new Error('not a PDF');
    const pageCount = data.byteLength > 1000 ? 2 : 1;
    return {
      pageCount,
      pageSize: async () => ({ width: 842, height: 595 }),
      renderPage: async (page: number) => {
        if (failRender) throw new Error('render failed');
        rendered.push(page);
        return `data:image/png;base64,UEFHRS${page}`;
      },
      close: async () => {
        closed.push(pageCount);
      },
    };
  },
}));

function pick(file: File): void {
  const input = byId<HTMLInputElement>('map-file-input');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change'));
}

const pdf = () => exampleFile('example-background.pdf', 'application/pdf');

describe('PDF background import UI (FR-25)', () => {
  beforeEach(async () => {
    rendered.length = 0;
    closed.length = 0;
    failRender = false;
    await mountApp();
    byId('tab-map').click();
    stubStageLayout();
    stubImageDecoding(2526, 1785);
  });

  test('the file picker accepts PDF documents in addition to images', () => {
    expect(byId<HTMLInputElement>('map-file-input').accept).toBe('image/*,application/pdf,.pdf,.osm');
  });

  test('loading a multi-page PDF offers its pages for selection', async () => {
    pick(pdf());
    await flush();
    expect(byId('pdf-panel').classList.contains('hidden')).toBe(false);
    expect([...byId<HTMLSelectElement>('pdf-page').options].map((o) => o.value)).toEqual(['1', '2']);
    expect(byId('pdf-page-count').textContent).toBe('of 2');
    expect(rendered).toEqual([]);
    expect(byId('map-stage').dataset.hasBackground).toBe('false');
  });

  test('the selected page is rendered and becomes the background on the same viewport', async () => {
    pick(pdf());
    await flush();
    byId<HTMLSelectElement>('pdf-page').value = '2';
    byId('pdf-use').click();
    await flush();
    expect(rendered).toEqual([2]);
    expect(byId<HTMLImageElement>('map-image').getAttribute('src')).toBe('data:image/png;base64,UEFHRS2');
    expect(byId('map-stage').dataset.hasBackground).toBe('true');
    expect(byId('pdf-panel').classList.contains('hidden')).toBe(true);
    expect(closed).toEqual([2]);
    // Fitted like any image: 2526x1785 into 800x600.
    expect(Number(byId('map-stage').dataset.scale)).toBeCloseTo(800 / 2526, 10);
    byId('map-zoom-in').click();
    expect(Number(byId('map-stage').dataset.scale)).toBeCloseTo((800 / 2526) * 1.25, 10);
  });

  test('a dropped PDF document goes through the same page selection', async () => {
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { files: [pdf()], types: ['Files'], getData: () => '' } });
    byId('map-stage').dispatchEvent(drop);
    await flush();
    expect(byId('pdf-panel').classList.contains('hidden')).toBe(false);
  });

  test('cancelling the page selection closes the document and keeps the current background', async () => {
    pick(pdf());
    await flush();
    byId('pdf-cancel').click();
    await flush();
    expect(byId('pdf-panel').classList.contains('hidden')).toBe(true);
    expect(closed).toEqual([2]);
    expect(rendered).toEqual([]);
    expect(byId('map-stage').dataset.hasBackground).toBe('false');
  });

  test('a single-page PDF is used directly', async () => {
    const onePage = new File(['%PDF-1.4 minimal'], 'one.pdf', { type: 'application/pdf' });
    Object.defineProperty(onePage, 'arrayBuffer', { value: async () => new TextEncoder().encode('%PDF-1.4 minimal').buffer });
    pick(onePage);
    await flush();
    expect(rendered).toEqual([1]);
    expect(byId('pdf-panel').classList.contains('hidden')).toBe(true);
    expect(byId('map-stage').dataset.hasBackground).toBe('true');
  });

  test('an unreadable PDF is reported clearly', async () => {
    const broken = new File(['broken'], 'broken.pdf', { type: 'application/pdf' });
    Object.defineProperty(broken, 'arrayBuffer', { value: async () => new TextEncoder().encode('broken').buffer });
    pick(broken);
    await flush();
    expect(byId('map-error').classList.contains('hidden')).toBe(false);
    expect(byId('map-error').textContent).toBe('The PDF document could not be read.');
    expect(byId('pdf-panel').classList.contains('hidden')).toBe(true);
  });

  test('a page that fails to render is reported and the selection stays open', async () => {
    pick(pdf());
    await flush();
    failRender = true;
    byId('pdf-use').click();
    await flush();
    expect(byId('map-error').textContent).toBe('The PDF page could not be rendered.');
    expect(byId('pdf-panel').classList.contains('hidden')).toBe(false);
    expect(byId<HTMLButtonElement>('pdf-use').disabled).toBe(false);
  });
});
