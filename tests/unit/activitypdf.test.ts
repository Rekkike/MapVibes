import { describe, expect, test } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import { PdfDocument } from '../../src/pdfwriter';
import { readPdfText } from '../../src/pdftext';
import { parsePdfPages } from '../../src/activityparse';

// Crafted PDF fixtures through the repository's own writer, read back with
// the bundled library (FR-76): the recognition runs on real text items.

(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = pdfjsWorker;

async function open(bytes: Uint8Array) {
  return pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false }).promise;
}

function tablePdf(): Uint8Array {
  const doc = new PdfDocument({ title: 'Fiktivt ursprungssystem', created: new Date('2024-07-01T00:00:00Z') });
  const page = doc.addPage(595, 842);
  const x = [40, 220, 320, 400, 470];
  page.text(40, 810, 'Projektplan, utdrag 2024-07-01. Följande gäller.', 'regular', 9);
  const headers = ['Post', 'Från', 'Till', 'Längd', 'Klart'];
  headers.forEach((h, c) => page.text(x[c], 780, h, 'bold', 10));
  const rows = [
    ['Grävning tomt 3', '2024-01-08', '2024-02-16', '6 v', '100 %'],
    ['Ledningsdragning', '2024-02-12', '2024-04-30', '11 v', '60 %'],
    ['Asfaltering', '2024-04-15', '2024-05-24', '6 v', '0 %'],
    ['15/03/2024 rad', '15/03/2024', '2024-06-30', '', '10 %'],
    ['Totalt', '', '', '28 v', ''],
  ];
  rows.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (cell !== '') page.text(x[c], 780 - (r + 1) * 24, cell, 'regular', 10);
    });
  });
  page.text(40, 60, 'Sammanställning klar.', 'regular', 9);
  return doc.toBytes();
}

function prosePdf(): Uint8Array {
  const doc = new PdfDocument({ title: 'Ingen tabell', created: new Date('2024-07-01T00:00:00Z') });
  doc.addPage(595, 842).text(40, 700, 'Only prose, no table at all.', 'regular', 12);
  return doc.toBytes();
}

describe('reading an activities PDF with the bundled library (FR-76)', () => {
  test('a crafted table PDF parses through the real reader: columns, mapping, rows, honesty', async () => {
    const bytes = tablePdf();
    // The writer's own document is valid for the independent reader.
    const check = await open(bytes);
    expect(check.numPages).toBe(1);

    const pages = await readPdfText(bytes.buffer as ArrayBuffer);
    expect(pages).toHaveLength(1);
    const result = parsePdfPages(pages);
    expect(result.tables).toHaveLength(1);
    const table = result.tables[0];
    expect(table.page).toBe(1);
    expect(table.columns.map((c) => [c.header, c.kind])).toEqual([
      ['Post', 'text'],
      ['Från', 'date'],
      ['Till', 'date'],
      ['Längd', 'number'],
      ['Klart', 'percent'],
    ]);
    expect(table.mapping).toEqual({ label: 0, start: 1, end: 2, duration: 3, progress: 4 });
    expect(table.rows.map((r) => r.label)).toEqual(['Grävning tomt 3', 'Ledningsdragning', 'Asfaltering', '15/03/2024 rad', 'Totalt']);
    const first = table.rows[0];
    expect([first.start, first.end, first.duration, first.progress]).toEqual(['2024-01-08', '2024-02-16', '6 v', 100]);
    expect(table.rows[3].startText).toBe('15/03/2024'); // ambiguous, as typed
    expect(table.rows[4].start).toBe(''); // the summary row: a candidate, dropped in the review
  });

  test('a PDF without a table is honest: no tables, no error', async () => {
    const bytes = prosePdf();
    const pages = await readPdfText(bytes.buffer as ArrayBuffer);
    expect(parsePdfPages(pages)).toEqual({ tables: [] });
  });
});
