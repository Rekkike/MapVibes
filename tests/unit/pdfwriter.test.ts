import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import { encodeWinAnsi, fitText, jpegComponents, parseSvgPath, PdfDocument, pdfTextString, textWidth, unrepresentable, winAnsiCode } from '../../src/pdfwriter';
import { ICON_PATHS, ICONS } from '../../src/symbols';

(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = pdfjsWorker;

const jpeg = new Uint8Array(readFileSync(join(process.cwd(), 'example-data', 'example-background.jpg')));
const AT = new Date('2026-01-02T03:04:05.000Z');

function text(bytes: Uint8Array): string {
  return new TextDecoder('latin1').decode(bytes);
}

// Opens the document with the bundled PDF.js library: an independent reader.
async function open(bytes: Uint8Array) {
  return pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false }).promise;
}

async function pageText(bytes: Uint8Array, page = 1): Promise<string> {
  const doc = await open(bytes);
  const content = await (await doc.getPage(page)).getTextContent();
  return content.items.map((i) => ('str' in i ? i.str : '')).filter((s) => s !== '').join('|');
}

function sample(): PdfDocument {
  const doc = new PdfDocument({ title: 'Plan — Översikt', created: AT });
  const page = doc.addPage(842, 595);
  page.fillColour([46, 125, 50]).rect(10, 20, 100, 50).fill();
  page.text(20, 100, 'Åtgärd: ändrad yta 4 750 m² – klar', 'regular', 12);
  page.text(20, 130, 'Rubrik', 'bold', 14);
  doc.addPage(595, 842).text(20, 40, 'Second page', 'regular', 10);
  return doc;
}

describe('the PDF writer: document structure (FR-50)', () => {
  test('header, objects, cross-reference table, and trailer are consistent', () => {
    const bytes = sample().toBytes();
    const s = text(bytes);
    expect(s.startsWith('%PDF-1.4\n%')).toBe(true);
    expect(s.endsWith('%%EOF\n')).toBe(true);
    const startxref = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(s)![1]);
    expect(s.slice(startxref, startxref + 5)).toBe('xref\n');
    const [, first, count] = /^xref\n(\d+) (\d+)\n/.exec(s.slice(startxref))!;
    expect(first).toBe('0');
    const entries = s.slice(startxref).split('\n').slice(2, 2 + Number(count));
    expect(entries[0]).toBe('0000000000 65535 f ');
    // Every entry points at the start of its object.
    entries.slice(1).forEach((entry, i) => {
      expect(entry).toMatch(/^\d{10} 00000 n $/);
      const offset = Number(entry.slice(0, 10));
      expect(s.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`);
    });
    expect(s).toMatch(new RegExp(`trailer\\n<< /Size ${count} /Root 1 0 R /Info 5 0 R >>`));
  });

  test('the fonts are the base-14 Helvetica faces with the WinAnsi encoding; nothing is embedded', () => {
    const s = text(sample().toBytes());
    expect(s).toContain('/BaseFont /Helvetica /Encoding /WinAnsiEncoding');
    expect(s).toContain('/BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding');
    expect(s).not.toContain('/FontFile');
  });

  test('content streams state their exact length', () => {
    const s = text(sample().toBytes());
    for (const m of s.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
      const start = m.index! + m[0].length;
      expect(s.slice(start + Number(m[1]), start + Number(m[1]) + 10)).toBe('\nendstream');
    }
  });

  test('pages keep their sizes and order; the information names the title in any script', async () => {
    const bytes = sample().toBytes();
    const s = text(bytes);
    expect(s).toContain('/MediaBox [0 0 842 595]');
    expect(s).toContain('/MediaBox [0 0 595 842]');
    expect(s).toContain(`/Title ${pdfTextString('Plan — Översikt')}`);
    expect(s).toContain('/CreationDate (D:20260102030405Z)');
    const doc = await open(bytes);
    expect(doc.numPages).toBe(2);
    const viewport = (await doc.getPage(2)).getViewport({ scale: 1 });
    expect([viewport.width, viewport.height]).toEqual([595, 842]);
    const meta = await doc.getMetadata();
    expect((meta.info as { Title: string }).Title).toBe('Plan — Översikt');
  });

  test('an independent reader opens the document and reads its text back exactly', async () => {
    const bytes = sample().toBytes();
    expect(await pageText(bytes)).toBe('Åtgärd: ändrad yta 4 750 m² – klar|Rubrik');
    expect(await pageText(bytes, 2)).toBe('Second page');
  });

  test('a document needs a page', () => {
    expect(() => new PdfDocument().toBytes()).toThrow();
  });

  test('the writer uses top-left coordinates, converted to the bottom-left of PDF', () => {
    const doc = new PdfDocument({ created: AT });
    const page = doc.addPage(200, 100);
    page.rect(10, 20, 30, 40).moveTo(0, 0).lineTo(200, 100);
    expect(page.content()).toBe('10 40 30 40 re\n0 100 m\n200 0 l');
  });
});

describe('the PDF writer: WinAnsi text (FR-50)', () => {
  test("the interface languages' characters are represented", () => {
    const special = 'åäöÅÄÖéÉüÜ²€–—…«»°×';
    const { codes, replaced } = encodeWinAnsi(special);
    expect(replaced).toBe(0);
    expect(codes.map((c) => c.toString(16))).toEqual(['e5', 'e4', 'f6', 'c5', 'c4', 'd6', 'e9', 'c9', 'fc', 'dc', 'b2', '80', '96', '97', '85', 'ab', 'bb', 'b0', 'd7']);
    expect(winAnsiCode('A'.codePointAt(0)!)).toBe(0x41);
  });

  test('characters WinAnsi cannot represent become question marks and are counted, one per character', () => {
    expect(encodeWinAnsi('Ωmega 平和 😀')).toEqual({ codes: [0x3f, 0x6d, 0x65, 0x67, 0x61, 0x20, 0x3f, 0x3f, 0x20, 0x3f], replaced: 4 });
    expect(unrepresentable('Plain text, åäö.')).toBe(0);
    const doc = new PdfDocument();
    doc.addPage(100, 100).text(0, 50, 'Ω and Ж', 'regular', 10);
    expect(doc.replacedCharacters).toBe(2);
  });

  test('line breaks and tabs become spaces', () => {
    expect(encodeWinAnsi('a\nb\tc').codes).toEqual([0x61, 0x20, 0x62, 0x20, 0x63]);
  });

  test('text is written as hexadecimal WinAnsi codes, so no character needs escaping', () => {
    const doc = new PdfDocument();
    const page = doc.addPage(100, 100);
    page.text(10, 20, '(å)\\', 'bold', 9);
    expect(page.content()).toBe('BT /F2 9 Tf 10 80 Td <28e5295c> Tj ET');
  });

  test('widths follow the Helvetica metrics; text is centred and fitted by them', () => {
    expect(textWidth('A', 'regular', 1000)).toBe(667);
    expect(textWidth('A', 'bold', 1000)).toBe(722);
    expect(textWidth('ÅÄÖ', 'regular', 10)).toBeCloseTo((667 + 667 + 778) / 100, 6);
    const doc = new PdfDocument();
    const page = doc.addPage(100, 100);
    page.text(50, 10, 'AA', 'regular', 10, 'centre');
    expect(page.content()).toContain(`${50 - 6.67} 90 Td`);
    const long = 'A long value that does not fit';
    const fitted = fitText(long, 'regular', 10, 60);
    expect(fitted.endsWith('…')).toBe(true);
    expect(textWidth(fitted, 'regular', 10)).toBeLessThanOrEqual(60);
    expect(fitText('Short', 'regular', 10, 60)).toBe('Short');
  });
});

describe('the PDF writer: shapes, opacity, and images (FR-50)', () => {
  test('a circle is four cubic curves; opacity uses one graphics state per value', () => {
    const doc = new PdfDocument({ created: AT });
    const page = doc.addPage(100, 100);
    page.opacity(0.3).circle(50, 50, 10).fill();
    page.opacity(0.3).dash([4, 2]).polygon([[0, 0], [10, 0], [10, 10]]).stroke();
    page.opacity(1);
    expect(page.content().match(/ c$/gm)).toHaveLength(4);
    expect(page.content()).toContain('[4 2] 0 d');
    const s = text(doc.toBytes());
    expect(s).toContain('/ExtGState << /GS1 << /Type /ExtGState /ca 0.3 /CA 0.3 >> /GS2 << /Type /ExtGState /ca 1 /CA 1 >> >>');
  });

  test('a JPEG image is embedded as it is, with its size and colour space', async () => {
    expect(jpegComponents(jpeg)).toBe(3);
    const doc = new PdfDocument({ created: AT });
    const img = doc.addJpeg(jpeg, 1200, 800);
    doc.addPage(600, 400).image(img, 0, 0, 600, 400);
    const bytes = doc.toBytes();
    const s = text(bytes);
    expect(s).toContain(`/Subtype /Image /Width 1200 /Height 800 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`);
    // The image bytes are in the file unchanged.
    const at = s.indexOf('stream\n', s.indexOf('/DCTDecode')) + 'stream\n'.length;
    expect(bytes.slice(at, at + jpeg.length)).toEqual(jpeg);
    expect(s).toContain('q 600 0 0 400 0 0 cm /Im1 Do Q');
    const page = await (await open(bytes)).getPage(1);
    const ops = await page.getOperatorList();
    expect(ops.fnArray).toContain(pdfjs.OPS.paintImageXObject);
  });

  test('data that is not a JPEG image is refused', () => {
    expect(() => new PdfDocument().addJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), 1, 1)).toThrow();
  });
});

describe('SVG path data for the icons (FR-26, FR-50)', () => {
  test('absolute and relative lines, horizontal and vertical moves, and closing', () => {
    expect(parseSvgPath('M1 2h3v4l-1 1L0 0z')).toEqual([
      ['M', 1, 2],
      ['L', 4, 2],
      ['L', 4, 6],
      ['L', 3, 7],
      ['L', 0, 0],
      ['Z'],
    ]);
    // Coordinate pairs after a move are lines.
    expect(parseSvgPath('M0 0 10 0 10 10')).toEqual([
      ['M', 0, 0],
      ['L', 10, 0],
      ['L', 10, 10],
    ]);
  });

  test('a quadratic curve becomes the equivalent cubic curve', () => {
    const [, c] = parseSvgPath('M0 0Q3 3 6 0');
    expect(c).toEqual(['C', 2, 2, 4, 2, 6, 0]);
  });

  test('smooth curves reflect the previous control point', () => {
    expect(parseSvgPath('M0 0C1 1 2 1 3 0S5 -1 6 0')[2]).toEqual(['C', 4, -1, 5, -1, 6, 0]);
    expect(parseSvgPath('M0 0Q3 3 6 0T12 0')[2]).toEqual(['C', 8, -2, 10, -2, 12, 0]);
  });

  test('an arc becomes cubic curves ending at its end point, through its far side', () => {
    const segs = parseSvgPath('M10 4a6 6 0 1 0 0 12');
    const last = segs[segs.length - 1];
    expect(last[0]).toBe('C');
    expect(last.slice(5)).toEqual([10, 16].map((v) => expect.closeTo(v, 9)));
    // The large arc of a half circle to the left: the curve passes x = 4.
    const xs = segs.flatMap((s) => (s[0] === 'C' ? [s[5]] : []));
    expect(Math.min(...xs)).toBeCloseTo(4, 6);
  });

  test("every icon's path is understood", () => {
    for (const icon of ICONS) {
      const segs = parseSvgPath(ICON_PATHS[icon]);
      expect(segs.length, icon).toBeGreaterThan(1);
      expect(segs[0][0], icon).toBe('M');
    }
  });

  test('the bulb uses compact arc flags and relative curves', () => {
    const segs = parseSvgPath(ICON_PATHS.bulb);
    expect(segs.filter((s) => s[0] === 'C').length).toBeGreaterThanOrEqual(4);
  });
});
