// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { documentParams, isPdfFile, MAX_RENDER_SIDE, NO_FETCH_URL, openPdf, PREFERRED_RENDER_SCALE, renderScale } from '../../src/pdfbackground';

function fixture(): ArrayBuffer {
  const buf = readFileSync(join(process.cwd(), 'example-data', 'example-background.pdf'));
  const ab = new ArrayBuffer(buf.byteLength);
  new Uint8Array(ab).set(buf);
  return ab;
}

describe('PDF background import (FR-25)', () => {
  test('render scale prefers the high-resolution multiplier for ordinary pages', () => {
    expect(renderScale(842, 595)).toBe(PREFERRED_RENDER_SCALE);
    expect(renderScale(595, 842)).toBe(PREFERRED_RENDER_SCALE);
  });

  test('render scale bounds the longest rendered side for large pages', () => {
    const s = renderScale(3370, 2384);
    expect(3370 * s).toBeCloseTo(MAX_RENDER_SIDE, 6);
    expect(renderScale(2384, 3370)).toBe(s);
  });

  test('render scale of a degenerate page is 1', () => {
    expect(renderScale(0, 0)).toBe(1);
    expect(renderScale(Number.NaN, 10)).toBe(1);
  });

  test('PDF files are recognised by type or extension', () => {
    expect(isPdfFile(new File([], 'x.bin', { type: 'application/pdf' }))).toBe(true);
    expect(isPdfFile(new File([], 'PLAN.PDF'))).toBe(true);
    expect(isPdfFile(new File([], 'image.png', { type: 'image/png' }))).toBe(false);
  });

  test('the bundled library opens the example document with its pages and page sizes', async () => {
    const doc = await openPdf(fixture());
    expect(doc.pageCount).toBe(2);
    expect(await doc.pageSize(1)).toEqual({ width: 842, height: 595 });
    expect(await doc.pageSize(2)).toEqual({ width: 595, height: 842 });
    await doc.close();
  });

  test('the document parameters pin the cmap and font-data URLs off the network and refuse binary-data loads', async () => {
    const params = documentParams(new Uint8Array([1, 2, 3]));
    expect(params.cMapUrl).toBe(NO_FETCH_URL);
    expect(params.standardFontDataUrl).toBe(NO_FETCH_URL);
    expect(/^https?:/.test(params.cMapUrl ?? '')).toBe(false);
    expect(/^https?:/.test(params.standardFontDataUrl ?? '')).toBe(false);
    expect(params.useWorkerFetch).toBe(false);
    expect(params.useSystemFonts).toBe(true);
    expect(params.enableXfa).toBe(false);
    const factory = new (params.BinaryDataFactory as new (options: unknown) => { fetch(): Promise<unknown> })({});
    await expect(factory.fetch()).rejects.toThrow('never fetches');
  });

  test('a document that is not a PDF is rejected', async () => {
    const bytes = new TextEncoder().encode('not a pdf document');
    await expect(openPdf(bytes.buffer)).rejects.toBeDefined();
  });
});
