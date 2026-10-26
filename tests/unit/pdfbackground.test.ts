// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { isPdfFile, MAX_RENDER_SIDE, openPdf, PREFERRED_RENDER_SCALE, renderScale } from '../../src/pdfbackground';

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

  test('a document that is not a PDF is rejected', async () => {
    const bytes = new TextEncoder().encode('not a pdf document');
    await expect(openPdf(bytes.buffer as ArrayBuffer)).rejects.toBeDefined();
  });
});
