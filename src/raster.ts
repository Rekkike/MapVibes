// The browser-only steps of the document exports (FR-50, FR-51): the
// visible part of the background re-encoded as a JPEG image for the PDF, and
// the stage page rasterised on a canvas for the PowerPoint slide. Nothing
// leaves the browser.

import { drawStagePage, type PageFrame, type Painter, type Rect, type StageScene } from './documents';
import type { PdfFont, Rgb, Transform } from './pdfwriter';

// The longest side of a re-encoded background, in pixels.
export const MAX_BACKGROUND_SIDE = 4096;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('the background could not be decoded'));
    img.src = src;
  });
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('the canvas could not be encoded'));
          return;
        }
        void blob.arrayBuffer().then((b) => resolve(new Uint8Array(b)), reject);
      },
      type,
      quality,
    );
  });
}

// The part of the background the stage shows (in the image's pixels), as a
// JPEG image at its own resolution (bounded), on white where the image is
// transparent.
export async function backgroundJpeg(src: string, crop: Rect): Promise<{ jpeg: Uint8Array; width: number; height: number }> {
  const img = await loadImage(src);
  const factor = Math.min(1, MAX_BACKGROUND_SIDE / Math.max(crop.width, crop.height));
  const width = Math.max(1, Math.round(crop.width * factor));
  const height = Math.max(1, Math.round(crop.height * factor));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
  return { jpeg: await canvasBlob(canvas, 'image/jpeg', 0.9), width, height };
}

function css(c: Rgb): string {
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

// The painter on a canvas, in page units (the context is scaled).
export class CanvasPainter implements Painter {
  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly background: { img: HTMLImageElement; crop: Rect } | null,
  ) {}
  save(): void {
    this.ctx.save();
  }
  restore(): void {
    this.ctx.restore();
  }
  fillColour(c: Rgb): void {
    this.ctx.fillStyle = css(c);
  }
  strokeColour(c: Rgb): void {
    this.ctx.strokeStyle = css(c);
  }
  lineWidth(w: number): void {
    this.ctx.lineWidth = w;
  }
  dash(pattern: readonly number[]): void {
    this.ctx.setLineDash([...pattern]);
  }
  opacity(a: number): void {
    this.ctx.globalAlpha = a;
  }
  roundLines(): void {
    this.ctx.lineJoin = 'round';
    this.ctx.lineCap = 'round';
  }
  beginPath(): void {
    this.ctx.beginPath();
  }
  moveTo(x: number, y: number): void {
    this.ctx.moveTo(x, y);
  }
  lineTo(x: number, y: number): void {
    this.ctx.lineTo(x, y);
  }
  curveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void {
    this.ctx.bezierCurveTo(x1, y1, x2, y2, x, y);
  }
  close(): void {
    this.ctx.closePath();
  }
  rect(x: number, y: number, w: number, h: number): void {
    this.ctx.rect(x, y, w, h);
  }
  circle(cx: number, cy: number, r: number): void {
    this.ctx.moveTo(cx + r, cy);
    this.ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  }
  // An SVG path is kept as a Path2D under its transform and painted by the
  // next fill or stroke, whose line width stays in page units.
  svgPath(d: string, t: Transform): void {
    const path = new Path2D();
    path.addPath(new Path2D(d), new DOMMatrix([...t]));
    this.pending = path;
  }
  private pending: Path2D | null = null;
  fill(): void {
    if (this.pending) this.ctx.fill(this.pending);
    else this.ctx.fill();
    this.pending = null;
  }
  stroke(): void {
    if (this.pending) this.ctx.stroke(this.pending);
    else this.ctx.stroke();
    this.pending = null;
  }
  clip(): void {
    this.ctx.clip();
  }
  text(x: number, y: number, text: string, font: PdfFont, size: number, align: 'left' | 'centre' | 'right' = 'left'): void {
    this.ctx.font = `${font === 'bold' ? 'bold ' : ''}${size}px Helvetica, Arial, "Liberation Sans", sans-serif`;
    this.ctx.textAlign = align === 'centre' ? 'center' : align;
    this.ctx.textBaseline = 'alphabetic';
    this.ctx.fillText(text, x, y);
  }
  image(x: number, y: number, w: number, h: number): void {
    if (!this.background) return;
    const { img, crop } = this.background;
    this.ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, x, y, w, h);
  }
}

// The stage page rasterised as a PNG image: the frame in page units, drawn
// at the given pixels per unit, on white.
export async function stagePagePng(scene: StageScene, frame: PageFrame, pixelsPerUnit: number, backgroundSrc: string | null): Promise<{ png: Uint8Array; width: number; height: number }> {
  const background = backgroundSrc && scene.background ? { img: await loadImage(backgroundSrc), crop: scene.background.image } : null;
  const width = Math.round(frame.width * pixelsPerUnit);
  const height = Math.round(frame.height * pixelsPerUnit);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.scale(pixelsPerUnit, pixelsPerUnit);
  drawStagePage(new CanvasPainter(ctx, background), scene, frame);
  return { png: await canvasBlob(canvas, 'image/png'), width, height };
}
