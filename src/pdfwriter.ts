// A minimal PDF writer (FR-50): pages, vector paths and shapes, text in the
// base-14 fonts Helvetica and Helvetica-Bold with the WinAnsi encoding, fill
// and stroke opacity, and embedded JPEG images. Written for this application
// alone: no libraries, no font files, no network. The document is PDF 1.4,
// with uncompressed content streams and a cross-reference table, so that its
// structure stays readable and testable.
//
// The page API uses top-left coordinates in points (y grows downwards), like
// the screen; the writer converts to PDF's bottom-left coordinates.

import { HELVETICA_BOLD_WIDTHS, HELVETICA_WIDTHS, WINANSI_SPECIAL } from './pdfmetrics';

export type PdfFont = 'regular' | 'bold';

// A colour as red, green, and blue from 0 to 255.
export type Rgb = readonly [number, number, number];

export interface PdfImage {
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

// A 2D affine transform [a, b, c, d, e, f], mapping (x, y) to
// (a x + c y + e, b x + d y + f), as in SVG and canvas.
export type Transform = readonly [number, number, number, number, number, number];

export const IDENTITY: Transform = [1, 0, 0, 1, 0, 0];

// Paper sizes in points.
export const A4_LANDSCAPE = { width: 841.89, height: 595.28 };

const REPLACEMENT = 0x3f; // '?'

// The WinAnsi code of a Unicode code point, or null.
export function winAnsiCode(codePoint: number): number | null {
  if ((codePoint >= 0x20 && codePoint <= 0x7e) || (codePoint >= 0xa0 && codePoint <= 0xff)) return codePoint;
  return WINANSI_SPECIAL.get(codePoint) ?? null;
}

// Encodes text in WinAnsi. A character it cannot represent becomes a
// question mark and is counted (FR-50); tabs and line breaks count as spaces.
export function encodeWinAnsi(text: string): { codes: number[]; replaced: number } {
  const codes: number[] = [];
  let replaced = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp === 0x09 || cp === 0x0a || cp === 0x0d) {
      codes.push(0x20);
      continue;
    }
    const code = winAnsiCode(cp);
    if (code === null) {
      codes.push(REPLACEMENT);
      replaced++;
    } else {
      codes.push(code);
    }
  }
  return { codes, replaced };
}

// The number of characters of a text that WinAnsi cannot represent.
export function unrepresentable(text: string): number {
  return encodeWinAnsi(text).replaced;
}

function widthsOf(font: PdfFont): readonly number[] {
  return font === 'bold' ? HELVETICA_BOLD_WIDTHS : HELVETICA_WIDTHS;
}

// The width of a text in points, as the PDF shows it.
export function textWidth(text: string, font: PdfFont, size: number): number {
  const widths = widthsOf(font);
  return (encodeWinAnsi(text).codes.reduce((sum, c) => sum + widths[c], 0) * size) / 1000;
}

// The text shortened with an ellipsis to fit the width, or the whole text.
export function fitText(text: string, font: PdfFont, size: number, width: number): string {
  if (textWidth(text, font, size) <= width) return text;
  const chars = [...text];
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (textWidth(`${chars.slice(0, mid).join('').trimEnd()}…`, font, size) <= width) lo = mid;
    else hi = mid - 1;
  }
  return lo === 0 ? '' : `${chars.slice(0, lo).join('').trimEnd()}…`;
}

function num(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`pdf: not a finite number: ${n}`);
  const r = Math.round(n * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
}

function colour(c: Rgb): string {
  return c.map((v) => num(Math.max(0, Math.min(255, v)) / 255)).join(' ');
}

export function applyTransform(t: Transform, x: number, y: number): [number, number] {
  return [t[0] * x + t[2] * y + t[4], t[1] * x + t[3] * y + t[5]];
}

// SVG path data to absolute cubic path segments (M, L, C, Z), so that the
// icons' paths can be drawn in a PDF (FR-26, FR-50).
export type PathSegment = ['M', number, number] | ['L', number, number] | ['C', number, number, number, number, number, number] | ['Z'];

export function parseSvgPath(d: string): PathSegment[] {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  const out: PathSegment[] = [];
  let i = 0;
  let cmd = '';
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  // The last control point, for the smooth curve commands.
  let lastCubic: [number, number] | null = null;
  let lastQuad: [number, number] | null = null;
  const next = (): number => {
    const t = tokens[i++];
    if (t === undefined || /[a-zA-Z]/.test(t)) throw new Error(`pdf: bad path data: ${d}`);
    return Number(t);
  };
  const flag = (): number => {
    // Arc flags may be written without separators ("a1 1 0 01 1 1").
    const t = tokens[i];
    if (t !== undefined && /^[01]\d/.test(t)) {
      tokens[i] = t.slice(1);
      return Number(t[0]);
    }
    return next();
  };
  const quad = (x1: number, y1: number, x2: number, y2: number) => {
    out.push(['C', x + ((x1 - x) * 2) / 3, y + ((y1 - y) * 2) / 3, x2 + ((x1 - x2) * 2) / 3, y2 + ((y1 - y2) * 2) / 3, x2, y2]);
  };
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    else if (cmd === '') throw new Error(`pdf: bad path data: ${d}`);
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    let cubic: [number, number] | null = null;
    let quadratic: [number, number] | null = null;
    switch (cmd.toUpperCase()) {
      case 'M':
        x = ox + next();
        y = oy + next();
        sx = x;
        sy = y;
        out.push(['M', x, y]);
        // Further coordinate pairs are line segments.
        cmd = rel ? 'l' : 'L';
        break;
      case 'L':
        x = ox + next();
        y = oy + next();
        out.push(['L', x, y]);
        break;
      case 'H':
        x = ox + next();
        out.push(['L', x, y]);
        break;
      case 'V':
        y = oy + next();
        out.push(['L', x, y]);
        break;
      case 'C': {
        const x1 = ox + next();
        const y1 = oy + next();
        const x2 = ox + next();
        const y2 = oy + next();
        x = ox + next();
        y = oy + next();
        out.push(['C', x1, y1, x2, y2, x, y]);
        cubic = [x2, y2];
        break;
      }
      case 'S': {
        const [x1, y1]: [number, number] = lastCubic ? [2 * x - lastCubic[0], 2 * y - lastCubic[1]] : [x, y];
        const x2 = ox + next();
        const y2 = oy + next();
        x = ox + next();
        y = oy + next();
        out.push(['C', x1, y1, x2, y2, x, y]);
        cubic = [x2, y2];
        break;
      }
      case 'Q': {
        const x1 = ox + next();
        const y1 = oy + next();
        const x2 = ox + next();
        const y2 = oy + next();
        quad(x1, y1, x2, y2);
        x = x2;
        y = y2;
        quadratic = [x1, y1];
        break;
      }
      case 'T': {
        const x1: number = lastQuad ? 2 * x - lastQuad[0] : x;
        const y1: number = lastQuad ? 2 * y - lastQuad[1] : y;
        const x2 = ox + next();
        const y2 = oy + next();
        quad(x1, y1, x2, y2);
        x = x2;
        y = y2;
        quadratic = [x1, y1];
        break;
      }
      case 'A': {
        const rx = next();
        const ry = next();
        const rotation = next();
        const large = flag();
        const sweep = flag();
        const x2 = ox + next();
        const y2 = oy + next();
        for (const seg of arcToCubics(x, y, rx, ry, rotation, large === 1, sweep === 1, x2, y2)) out.push(seg);
        x = x2;
        y = y2;
        break;
      }
      case 'Z':
        out.push(['Z']);
        x = sx;
        y = sy;
        break;
      default:
        throw new Error(`pdf: unsupported path command ${cmd}`);
    }
    lastCubic = cubic;
    lastQuad = quadratic;
  }
  return out;
}

// An elliptical arc as cubic curves (the SVG endpoint parameterisation).
function arcToCubics(x1: number, y1: number, rx: number, ry: number, rotationDeg: number, large: boolean, sweep: boolean, x2: number, y2: number): PathSegment[] {
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) return [['L', x2, y2]];
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const phi = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num2 = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coef = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num2 / den));
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const parts = Math.ceil(Math.abs(delta) / (Math.PI / 2));
  const step = delta / parts;
  const k = (4 / 3) * Math.tan(step / 4);
  const point = (t: number): [number, number] => [cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos];
  const deriv = (t: number): [number, number] => [-rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos];
  const out: PathSegment[] = [];
  for (let p = 0; p < parts; p++) {
    const a = theta1 + p * step;
    const b = a + step;
    const [ax, ay] = point(a);
    const [bx, by] = point(b);
    const [dax, day] = deriv(a);
    const [dbx, dby] = deriv(b);
    out.push(['C', ax + k * dax, ay + k * day, bx - k * dbx, by - k * dby, bx, by]);
  }
  return out;
}

export class PdfPage {
  private readonly ops: string[] = [];

  constructor(
    private readonly doc: PdfDocument,
    readonly width: number,
    readonly height: number,
  ) {}

  private y(v: number): number {
    return this.height - v;
  }

  private op(text: string): this {
    this.ops.push(text);
    return this;
  }

  save(): this {
    return this.op('q');
  }

  restore(): this {
    return this.op('Q');
  }

  fillColour(c: Rgb): this {
    return this.op(`${colour(c)} rg`);
  }

  strokeColour(c: Rgb): this {
    return this.op(`${colour(c)} RG`);
  }

  lineWidth(w: number): this {
    return this.op(`${num(w)} w`);
  }

  // Round joins and caps, as the application's SVG strokes use.
  roundLines(): this {
    return this.op('1 j 1 J');
  }

  // A dash pattern in points; an empty pattern is a solid line.
  dash(pattern: readonly number[], phase = 0): this {
    return this.op(`[${pattern.map(num).join(' ')}] ${num(phase)} d`);
  }

  // Fill and stroke opacity (0 to 1) through a graphics state.
  opacity(fill: number, stroke = fill): this {
    return this.op(`/${this.doc.graphicsState(fill, stroke)} gs`);
  }

  moveTo(x: number, y: number): this {
    return this.op(`${num(x)} ${num(this.y(y))} m`);
  }

  lineTo(x: number, y: number): this {
    return this.op(`${num(x)} ${num(this.y(y))} l`);
  }

  curveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): this {
    return this.op(`${num(x1)} ${num(this.y(y1))} ${num(x2)} ${num(this.y(y2))} ${num(x)} ${num(this.y(y))} c`);
  }

  close(): this {
    return this.op('h');
  }

  rect(x: number, y: number, w: number, h: number): this {
    return this.op(`${num(x)} ${num(this.y(y + h))} ${num(w)} ${num(h)} re`);
  }

  // A circle as four cubic curves.
  circle(cx: number, cy: number, r: number): this {
    const k = 0.5522847498 * r;
    this.moveTo(cx + r, cy);
    this.curveTo(cx + r, cy + k, cx + k, cy + r, cx, cy + r);
    this.curveTo(cx - k, cy + r, cx - r, cy + k, cx - r, cy);
    this.curveTo(cx - r, cy - k, cx - k, cy - r, cx, cy - r);
    this.curveTo(cx + k, cy - r, cx + r, cy - k, cx + r, cy);
    return this.close();
  }

  polygon(points: ReadonlyArray<readonly [number, number]>, closed = true): this {
    points.forEach(([x, y], i) => (i === 0 ? this.moveTo(x, y) : this.lineTo(x, y)));
    return closed ? this.close() : this;
  }

  // SVG path data, mapped through a transform into page coordinates.
  svgPath(d: string, t: Transform = IDENTITY): this {
    for (const seg of parseSvgPath(d)) {
      if (seg[0] === 'Z') this.close();
      else if (seg[0] === 'C') {
        const [x1, y1] = applyTransform(t, seg[1], seg[2]);
        const [x2, y2] = applyTransform(t, seg[3], seg[4]);
        const [x, y] = applyTransform(t, seg[5], seg[6]);
        this.curveTo(x1, y1, x2, y2, x, y);
      } else {
        const [x, y] = applyTransform(t, seg[1], seg[2]);
        if (seg[0] === 'M') this.moveTo(x, y);
        else this.lineTo(x, y);
      }
    }
    return this;
  }

  fill(evenOdd = false): this {
    return this.op(evenOdd ? 'f*' : 'f');
  }

  stroke(): this {
    return this.op('S');
  }

  fillStroke(): this {
    return this.op('B');
  }

  // Intersects the clipping region with the current path.
  clip(): this {
    return this.op('W n');
  }

  // Text on a baseline at (x, y), starting there, or centred or ending there.
  text(x: number, y: number, text: string, font: PdfFont, size: number, align: 'left' | 'centre' | 'right' = 'left'): this {
    const { codes, replaced } = encodeWinAnsi(text);
    this.doc.countReplaced(replaced);
    const w = textWidth(text, font, size);
    const left = align === 'left' ? x : align === 'centre' ? x - w / 2 : x - w;
    const hex = codes.map((c) => c.toString(16).padStart(2, '0')).join('');
    return this.op(`BT /${font === 'bold' ? 'F2' : 'F1'} ${num(size)} Tf ${num(left)} ${num(this.y(y))} Td <${hex}> Tj ET`);
  }

  // An image filling the rectangle.
  image(img: PdfImage, x: number, y: number, w: number, h: number): this {
    return this.op(`q ${num(w)} 0 0 ${num(h)} ${num(x)} ${num(this.y(y + h))} cm /${img.name} Do Q`);
  }

  content(): string {
    return this.ops.join('\n');
  }
}

interface ImageEntry {
  name: string;
  width: number;
  height: number;
  data: Uint8Array;
}

export class PdfDocument {
  private readonly pages: PdfPage[] = [];
  private readonly images: ImageEntry[] = [];
  private readonly states = new Map<string, string>();
  private replaced = 0;

  constructor(private readonly info: { title?: string; producer?: string; created?: Date } = {}) {}

  addPage(width: number, height: number): PdfPage {
    const page = new PdfPage(this, width, height);
    this.pages.push(page);
    return page;
  }

  get pageCount(): number {
    return this.pages.length;
  }

  // The characters replaced so far because WinAnsi cannot represent them.
  get replacedCharacters(): number {
    return this.replaced;
  }

  countReplaced(n: number): void {
    this.replaced += n;
  }

  // A baseline JPEG image (DCTDecode), RGB or greyscale.
  addJpeg(data: Uint8Array, width: number, height: number): PdfImage {
    if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) throw new Error('pdf: not a JPEG image');
    const entry = { name: `Im${this.images.length + 1}`, width, height, data };
    this.images.push(entry);
    return { name: entry.name, width, height };
  }

  graphicsState(fill: number, stroke: number): string {
    const key = `${num(Math.max(0, Math.min(1, fill)))} ${num(Math.max(0, Math.min(1, stroke)))}`;
    let name = this.states.get(key);
    if (!name) {
      name = `GS${this.states.size + 1}`;
      this.states.set(key, name);
    }
    return name;
  }

  toBytes(): Uint8Array {
    if (this.pages.length === 0) throw new Error('pdf: a document needs a page');
    const chunks: Uint8Array[] = [];
    let length = 0;
    const offsets: number[] = [];
    const push = (bytes: Uint8Array) => {
      chunks.push(bytes);
      length += bytes.length;
    };
    const ascii = (text: string) => push(latin1(text));
    // Object numbers: 1 catalogue, 2 page tree, 3 and 4 fonts, 5 info, then
    // images, then a content stream and a page per page.
    const imageBase = 6;
    const pageBase = imageBase + this.images.length;
    const objectCount = pageBase + 2 * this.pages.length - 1;
    const begin = (n: number) => {
      offsets[n] = length;
      ascii(`${n} 0 obj\n`);
    };
    const end = () => ascii('\nendobj\n');

    // The header, with a comment of high bytes marking the file as binary.
    ascii('%PDF-1.4\n');
    push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

    begin(1);
    ascii('<< /Type /Catalog /Pages 2 0 R >>');
    end();
    const kids = this.pages.map((_, i) => `${pageBase + 2 * i + 1} 0 R`).join(' ');
    begin(2);
    ascii(`<< /Type /Pages /Kids [${kids}] /Count ${this.pages.length} >>`);
    end();
    begin(3);
    ascii('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    end();
    begin(4);
    ascii('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    end();
    begin(5);
    const created = this.info.created ?? new Date();
    ascii(
      `<< /Title ${pdfTextString(this.info.title ?? '')} /Producer ${pdfTextString(this.info.producer ?? 'MapVibes')} /CreationDate (${pdfDate(created)}) >>`,
    );
    end();
    this.images.forEach((img, i) => {
      begin(imageBase + i);
      const components = jpegComponents(img.data);
      const space = components === 1 ? '/DeviceGray' : components === 4 ? '/DeviceCMYK' : '/DeviceRGB';
      ascii(`<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace ${space} /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.data.length} >>\nstream\n`);
      push(img.data);
      ascii('\nendstream');
      end();
    });
    const states = [...this.states.entries()].map(([key, name]) => {
      const [ca, CA] = key.split(' ');
      return `/${name} << /Type /ExtGState /ca ${ca} /CA ${CA} >>`;
    });
    const resources =
      `<< /Font << /F1 3 0 R /F2 4 0 R >>` +
      (this.images.length > 0 ? ` /XObject << ${this.images.map((img, i) => `/${img.name} ${imageBase + i} 0 R`).join(' ')} >>` : '') +
      (states.length > 0 ? ` /ExtGState << ${states.join(' ')} >>` : '') +
      ` /ProcSet [/PDF /Text /ImageB /ImageC] >>`;
    this.pages.forEach((page, i) => {
      const content = latin1(page.content());
      begin(pageBase + 2 * i);
      ascii(`<< /Length ${content.length} >>\nstream\n`);
      push(content);
      ascii('\nendstream');
      end();
      begin(pageBase + 2 * i + 1);
      ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(page.width)} ${num(page.height)}] /Resources ${resources} /Contents ${pageBase + 2 * i} 0 R >>`);
      end();
    });

    const xref = length;
    ascii(`xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`);
    for (let n = 1; n <= objectCount; n++) ascii(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
    ascii(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

    const out = new Uint8Array(length);
    let at = 0;
    for (const c of chunks) {
      out.set(c, at);
      at += c.length;
    }
    return out;
  }
}

function latin1(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c > 0xff) throw new Error('pdf: internal text is not Latin-1');
    out[i] = c;
  }
  return out;
}

// A PDF text string (for the document information): UTF-16BE with a byte
// order mark, written in hexadecimal, so that any title survives.
export function pdfTextString(text: string): string {
  let hex = 'feff';
  for (let i = 0; i < text.length; i++) hex += text.charCodeAt(i).toString(16).padStart(4, '0');
  return `<${hex}>`;
}

function pdfDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

// The number of colour components of a JPEG image, from its frame header;
// 3 when it cannot be read.
export function jpegComponents(data: Uint8Array): number {
  let i = 2;
  while (i + 9 < data.length) {
    if (data[i] !== 0xff) return 3;
    const marker = data[i + 1];
    const size = (data[i + 2] << 8) | data[i + 3];
    // Start-of-frame markers, except DHT (C4), JPG (C8), and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return data[i + 9];
    i += 2 + size;
  }
  return 3;
}
