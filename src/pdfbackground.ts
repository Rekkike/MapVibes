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
  if (!(longest > 0)) {
    return 1;
  }
  return Math.min(PREFERRED_RENDER_SCALE, MAX_RENDER_SIDE / longest);
}

export interface PdfDocument {
  pageCount: number;
  pageSize(page: number): Promise<{ width: number; height: number }>;
  renderPage(page: number): Promise<string>;
  close(): Promise<void>;
}

export type DocumentParameters = NonNullable<Parameters<typeof pdfjs.getDocument>[0]>;

// No external cmap or font-data URL is ever configured (hard constraint 2):
// the URLs are pinned to a non-network data URL, worker-side fetching is
// switched off, and every binary-data load (cmap, standard font, wasm) is
// refused by the factory below before a request is built, so no library
// version can open a fetch path for them. Fonts fall back to the system
// fonts (useSystemFonts). The offline browser assertion, no non-local
// request under setOffline, is mandatory on every pdfjs-dist bump.
export const NO_FETCH_URL = 'data:,/';

class NoFetchBinaryDataFactory {
  constructor(_options: unknown) {
    void _options;
  }

  fetch(): Promise<never> {
    return Promise.reject(new Error('MapVibes never fetches PDF resources (hard constraint 2)'));
  }
}

// The document parameters shared by every PDF.js entry point in the
// application.
export function documentParams(data: Uint8Array): DocumentParameters {
  return {
    data,
    // PDF.js 6 contains no eval-based code paths; XFA forms are not rendered.
    enableXfa: false,
    useSystemFonts: true,
    disableFontFace: false,
    stopAtErrors: false,
    verbosity: pdfjs.VerbosityLevel.ERRORS,
    cMapUrl: NO_FETCH_URL,
    cMapPacked: true,
    standardFontDataUrl: NO_FETCH_URL,
    useWorkerFetch: false,
    BinaryDataFactory: NoFetchBinaryDataFactory,
  };
}

export async function openPdf(data: ArrayBuffer): Promise<PdfDocument> {
  const task = pdfjs.getDocument(documentParams(new Uint8Array(data)));
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
      if (!context) {
        throw new Error('canvas 2d context unavailable');
      }
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
