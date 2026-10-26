// PDF background import (FR-25). PDF documents are parsed and rendered by the
// bundled PDF.js library (pdfjs-dist, legacy build for broad browser
// support). Its worker module is bundled too and runs on the main thread
// through PDF.js's in-thread worker mechanism, so no worker script, font,
// or other resource is ever fetched: there are no URLs to load from.

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';

(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = pdfjsWorker;

export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

// Longest side of a rendered page, in pixels, and the preferred resolution
// multiplier relative to PDF points (1 point = 1/72 inch).
export const MAX_RENDER_SIDE = 4096;
export const PREFERRED_RENDER_SCALE = 3;

// The render scale for a page of the given size in points: high enough to
// stay sharp when zoomed in, bounded so the longest side stays within
// MAX_RENDER_SIDE.
export function renderScale(widthPt: number, heightPt: number): number {
  const longest = Math.max(widthPt, heightPt);
  if (!(longest > 0)) return 1;
  return Math.min(PREFERRED_RENDER_SCALE, MAX_RENDER_SIDE / longest);
}

export interface PdfDocument {
  pageCount: number;
  pageSize(page: number): Promise<{ width: number; height: number }>;
  renderPage(page: number): Promise<string>;
  close(): Promise<void>;
}

export async function openPdf(data: ArrayBuffer): Promise<PdfDocument> {
  // PDF.js 6 contains no eval-based code paths; XFA forms are not rendered.
  const task = pdfjs.getDocument({
    data: new Uint8Array(data),
    enableXfa: false,
    useSystemFonts: true,
    disableFontFace: false,
    stopAtErrors: false,
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  });
  const doc = await task.promise;
  return {
    pageCount: doc.numPages,
    async pageSize(page) {
      const p = await doc.getPage(page);
      const v = p.getViewport({ scale: 1 });
      return { width: v.width, height: v.height };
    },
    async renderPage(page) {
      const p = await doc.getPage(page);
      const base = p.getViewport({ scale: 1 });
      const viewport = p.getViewport({ scale: renderScale(base.width, base.height) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('canvas 2d context unavailable');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await p.render({ canvas, canvasContext: context, viewport }).promise;
      p.cleanup();
      return canvas.toDataURL('image/png');
    },
    async close() {
      await task.destroy();
    },
  };
}
