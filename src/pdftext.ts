// Reading the text of a PDF with the bundled PDF.js library (FR-76): text-
// selectable documents only, no OCR engine ever. The same entry point and
// options as the PDF background import (src/pdfbackground.ts): the worker
// module is bundled and runs on the main thread, nothing is fetched.

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';

(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = pdfjsWorker;

// One text item of a page: its string and its box in PDF points (y measured
// as the library reports it; the recogniser sorts rows by it either way).
export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type PdfTextPage = PdfTextItem[];

// The text of every page of the document, in order. A page without text
// yields an empty array.
export async function readPdfText(data: ArrayBuffer): Promise<PdfTextPage[]> {
  const task = pdfjs.getDocument({
    data: new Uint8Array(data),
    enableXfa: false,
    useSystemFonts: true,
    disableFontFace: false,
    stopAtErrors: false,
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  });
  const doc = await task.promise;
  const pages: PdfTextPage[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    pages.push(
      content.items
        .filter((i) => 'str' in i)
        .map((i) => ({ str: (i as { str: string }).str, x: i.transform[4], y: i.transform[5], w: i.width, h: i.height })),
    );
  }
  return pages;
}
