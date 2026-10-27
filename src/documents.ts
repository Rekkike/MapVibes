// The document exports (FR-12, FR-50 to FR-52): the visible presentation
// stage as a scene in stage pixels, drawn through a small painter interface
// (the PDF writer, or a canvas for the PowerPoint slide image), followed by
// the shown items as a paginated table. Everything here is pure layout and
// drawing; the browser-only steps (image encoding, rasterising) live in
// raster.ts.

import { dashArray, rectOf, distance, type Annotation, type AnnotationKind, type LineStyle, type Outline } from './annotations';
import { labelAnchor } from './annotationlayer';
import type { RowColour } from './dataset';
import type { LegendSection } from './legend';
import { fitText, PdfDocument, textWidth, type PdfFont, type PdfImage, type Rgb, type Transform } from './pdfwriter';
import { ICON_PATHS, isIcon, type MarkerSymbol } from './symbols';
import { buildPptx, type PptxTableSlide } from './pptxwriter';
import { imageToScreen, type Point, type Viewport } from './viewport';

// The documents use the light theme's palette: they are read on white
// paper and white slides whatever the interface theme. The values are the
// light theme's tokens (pinned by a test against the stylesheet).
export const PALETTE = {
  green: [0x28, 0x7a, 0x4d],
  blue: [0x2f, 0x66, 0xb3],
  yellow: [0xe0, 0xb3, 0x1f],
  red: [0xc0, 0x3a, 0x3a],
  markerText: [0xff, 0xff, 0xff],
  markerTextOnYellow: [0x1a, 0x1c, 0x20],
  ring: [0xff, 0xff, 0xff],
  neutral: [0x6b, 0x73, 0x80],
  halo: [0x3a, 0x3f, 0x47],
  outlineBlack: [0x00, 0x00, 0x00],
  outlineWhite: [0xff, 0xff, 0xff],
  fg: [0x1a, 0x1c, 0x20],
  muted: [0x5a, 0x62, 0x70],
  border: [0xc9, 0xce, 0xd6],
  stage: [0xf6, 0xf7, 0xf9],
  white: [0xff, 0xff, 0xff],
  shade: [0xee, 0xf0, 0xf3],
} as const satisfies Record<string, Rgb>;

const COLOUR_RGB: Record<RowColour, Rgb> = { green: PALETTE.green, blue: PALETTE.blue, yellow: PALETTE.yellow, red: PALETTE.red };

// --- The scene -------------------------------------------------------------

export interface SceneMarker {
  x: number;
  y: number;
  symbol: MarkerSymbol;
  colour: RowColour;
  label: string;
}

export interface SceneAnnotation {
  kind: AnnotationKind;
  points: Point[];
  colour: RowColour;
  fillOpacity: number;
  outline: Outline;
  lineStyle: LineStyle;
  label: string;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StageScene {
  // The stage's size in pixels; everything below is in stage pixels.
  width: number;
  height: number;
  // The visible part of the background: where it is on the stage, and which
  // part of the image (in the image's own pixels) it shows.
  background: { stage: Rect; image: Rect } | null;
  annotations: SceneAnnotation[];
  markers: SceneMarker[];
  legendTitle: string;
  legend: LegendSection[];
}

export interface StageInput {
  viewport: Viewport;
  stage: { width: number; height: number };
  background: { width: number; height: number } | null;
  // The markers shown in the presentation, in image coordinates.
  markers: Array<{ position: Point; symbol: MarkerSymbol; colour: RowColour; label: string }>;
  // The annotations shown in the presentation, in image coordinates.
  annotations: Annotation[];
  legendTitle: string;
  legend: LegendSection[];
}

// Half the largest marker, in stage pixels: a marker whose centre lies this
// far outside the stage still shows in part, as on screen.
const MARKER_REACH = 24;

function intersect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return r > x && bottom > y ? { x, y, width: r - x, height: bottom - y } : null;
}

function boundsOf(points: Point[]): Rect {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

function annotationBounds(a: Pick<Annotation, 'kind' | 'points'>): Rect {
  if (a.kind === 'circle') {
    const r = distance(a.points[0], a.points[1]);
    return { x: a.points[0].x - r, y: a.points[0].y - r, width: 2 * r, height: 2 * r };
  }
  return boundsOf(a.points);
}

// The visible presentation stage as a scene (FR-50): only what the stage
// shows, in stage pixels. Markers and annotations entirely outside the view
// are left out; those at its edge are kept and clipped when drawn.
export function sceneFromStage(input: StageInput): StageScene {
  const v = input.viewport;
  const stageRect = { x: 0, y: 0, width: input.stage.width, height: input.stage.height };
  let background: StageScene['background'] = null;
  if (input.background) {
    const imageRect = { x: v.x, y: v.y, width: input.background.width * v.scale, height: input.background.height * v.scale };
    const shown = intersect(imageRect, stageRect);
    if (shown) {
      background = {
        stage: shown,
        image: {
          x: (shown.x - v.x) / v.scale,
          y: (shown.y - v.y) / v.scale,
          width: shown.width / v.scale,
          height: shown.height / v.scale,
        },
      };
    }
  }
  const reach = { x: -MARKER_REACH, y: -MARKER_REACH, width: input.stage.width + 2 * MARKER_REACH, height: input.stage.height + 2 * MARKER_REACH };
  const markers = input.markers
    .map((m) => ({ ...imageToScreen(v, m.position), symbol: m.symbol, colour: m.colour, label: m.label }))
    .filter((m) => m.x >= reach.x && m.x <= reach.x + reach.width && m.y >= reach.y && m.y <= reach.y + reach.height);
  const annotations = input.annotations
    .map((a) => ({
      kind: a.kind,
      points: a.points.map((p) => imageToScreen(v, p)),
      colour: a.colour,
      fillOpacity: a.fillOpacity,
      outline: a.outline,
      lineStyle: a.lineStyle,
      label: a.label.trim(),
    }))
    .filter((a) => {
      const b = annotationBounds(a);
      // Strokes reach a few pixels beyond the geometry.
      return intersect({ x: b.x - 4, y: b.y - 4, width: b.width + 8, height: b.height + 8 }, stageRect) !== null;
    });
  return { width: input.stage.width, height: input.stage.height, background, annotations, markers, legendTitle: input.legendTitle, legend: input.legend };
}

// --- The painter -----------------------------------------------------------

// The drawing operations both documents need, in page units with a top-left
// origin. The PDF writer's page is one painter; a canvas is the other.
export interface Painter {
  save(): void;
  restore(): void;
  fillColour(c: Rgb): void;
  strokeColour(c: Rgb): void;
  lineWidth(w: number): void;
  dash(pattern: readonly number[]): void;
  opacity(a: number): void;
  roundLines(): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  curveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void;
  close(): void;
  rect(x: number, y: number, w: number, h: number): void;
  circle(cx: number, cy: number, r: number): void;
  svgPath(d: string, t: Transform): void;
  fill(): void;
  stroke(): void;
  clip(): void;
  // Text in the current fill colour, on a baseline.
  text(x: number, y: number, text: string, font: PdfFont, size: number, align?: 'left' | 'centre' | 'right'): void;
  // The background image filling the rectangle.
  image(x: number, y: number, w: number, h: number): void;
}

export class PdfPainter implements Painter {
  constructor(
    private readonly page: import('./pdfwriter').PdfPage,
    private readonly img: PdfImage | null,
  ) {}
  save(): void {
    this.page.save();
  }
  restore(): void {
    this.page.restore();
  }
  fillColour(c: Rgb): void {
    this.page.fillColour(c);
  }
  strokeColour(c: Rgb): void {
    this.page.strokeColour(c);
  }
  lineWidth(w: number): void {
    this.page.lineWidth(w);
  }
  dash(pattern: readonly number[]): void {
    this.page.dash(pattern);
  }
  opacity(a: number): void {
    this.page.opacity(a);
  }
  roundLines(): void {
    this.page.roundLines();
  }
  beginPath(): void {
    // A PDF path begins with its first segment.
  }
  moveTo(x: number, y: number): void {
    this.page.moveTo(x, y);
  }
  lineTo(x: number, y: number): void {
    this.page.lineTo(x, y);
  }
  curveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void {
    this.page.curveTo(x1, y1, x2, y2, x, y);
  }
  close(): void {
    this.page.close();
  }
  rect(x: number, y: number, w: number, h: number): void {
    this.page.rect(x, y, w, h);
  }
  circle(cx: number, cy: number, r: number): void {
    this.page.circle(cx, cy, r);
  }
  svgPath(d: string, t: Transform): void {
    this.page.svgPath(d, t);
  }
  fill(): void {
    this.page.fill();
  }
  stroke(): void {
    this.page.stroke();
  }
  clip(): void {
    this.page.clip();
  }
  text(x: number, y: number, text: string, font: PdfFont, size: number, align: 'left' | 'centre' | 'right' = 'left'): void {
    this.page.text(x, y, text, font, size, align);
  }
  image(x: number, y: number, w: number, h: number): void {
    if (this.img) this.page.image(this.img, x, y, w, h);
  }
}

// --- Markers, annotations, the legend --------------------------------------

// Marker geometry in stage pixels, from the stylesheet: 28 pixels high
// (diamonds and triangles 36), at least as wide, with a 2 pixel ring; the
// number in bold at 12.8 pixels; an icon 14.72 pixels wide before it.
const MARKER = { height: 28, tall: 36, ring: 2, font: 12.8, padding: 8, iconPadding: 10.4, glyph: 14.72, gap: 1, glyphStroke: 2.6 };

function markerSize(symbol: MarkerSymbol, label: string): { width: number; height: number } {
  const tall = symbol === 'diamond' || symbol === 'triangle';
  const height = tall ? MARKER.tall : MARKER.height;
  const text = label === '' ? 0 : textWidth(label, 'bold', MARKER.font);
  const content = isIcon(symbol) ? MARKER.glyph + (label === '' ? 0 : MARKER.gap + text) : text;
  const padding = isIcon(symbol) ? MARKER.iconPadding : MARKER.padding;
  return { width: Math.max(height, content + padding), height };
}

// The marker's outline: a pill for the circle and the icons, a rounded
// square, or a polygon on the marker's box.
function markerOutline(p: Painter, symbol: MarkerSymbol, x: number, y: number, w: number, h: number): void {
  p.beginPath();
  const poly = (pts: Array<[number, number]>) => {
    pts.forEach(([px, py], i) => (i === 0 ? p.moveTo(x + px * w, y + py * h) : p.lineTo(x + px * w, y + py * h)));
    p.close();
  };
  switch (symbol) {
    case 'square':
      roundedRect(p, x, y, w, h, Math.min(3, w / 2, h / 2));
      return;
    case 'diamond':
      return poly([[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]]);
    case 'triangle':
      return poly([[0.5, 0], [1, 1], [0, 1]]);
    case 'hexagon':
      return poly([[0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5]]);
    default:
      roundedRect(p, x, y, w, h, Math.min(w, h) / 2);
  }
}

function roundedRect(p: Painter, x: number, y: number, w: number, h: number, r: number): void {
  const k = 0.5522847498 * r;
  p.moveTo(x + r, y);
  p.lineTo(x + w - r, y);
  p.curveTo(x + w - r + k, y, x + w, y + r - k, x + w, y + r);
  p.lineTo(x + w, y + h - r);
  p.curveTo(x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h);
  p.lineTo(x + r, y + h);
  p.curveTo(x + r - k, y + h, x, y + h - r + k, x, y + h - r);
  p.lineTo(x, y + r);
  p.curveTo(x, y + r - k, x + r - k, y, x + r, y);
  p.close();
}

// A marker centred on (cx, cy), drawn at the given scale (page units per
// stage pixel): the halo, the white ring, the fill, the icon, the number.
export function drawMarker(p: Painter, cx: number, cy: number, symbol: MarkerSymbol, colour: RowColour | null, label: string, scale: number): void {
  const size = markerSize(symbol, label);
  const w = size.width * scale;
  const h = size.height * scale;
  const x = cx - w / 2;
  const y = cy - h / 2;
  const fill = colour ? COLOUR_RGB[colour] : PALETTE.neutral;
  const ink = colour === 'yellow' ? PALETTE.markerTextOnYellow : colour ? PALETTE.markerText : PALETTE.ring;
  const ring = MARKER.ring * scale;
  p.save();
  // The thin dark halo that keeps the marker legible on light backgrounds.
  p.opacity(0.85);
  p.strokeColour(PALETTE.halo);
  p.lineWidth(1 * scale);
  markerOutline(p, symbol, x, y, w, h);
  p.stroke();
  p.opacity(1);
  p.fillColour(PALETTE.ring);
  markerOutline(p, symbol, x, y, w, h);
  p.fill();
  p.fillColour(fill);
  markerOutline(p, symbol, x + ring, y + ring, w - 2 * ring, h - 2 * ring);
  p.fill();
  // A triangle's number sits lower, in its wider part.
  const textY = cy + (symbol === 'triangle' ? 4.8 * scale : 0) + 0.35 * MARKER.font * scale;
  if (isIcon(symbol)) {
    const g = (MARKER.glyph / 24) * scale;
    const contentWidth = (MARKER.glyph + (label === '' ? 0 : MARKER.gap + textWidth(label, 'bold', MARKER.font))) * scale;
    const left = cx - contentWidth / 2;
    p.strokeColour(ink);
    p.lineWidth(MARKER.glyphStroke * g);
    p.roundLines();
    p.beginPath();
    p.svgPath(ICON_PATHS[symbol], [g, 0, 0, g, left, cy - (MARKER.glyph * scale) / 2]);
    p.stroke();
    if (label !== '') {
      p.fillColour(ink);
      p.text(left + (MARKER.glyph + MARKER.gap) * scale, textY, label, 'bold', MARKER.font * scale);
    }
  } else if (label !== '') {
    p.fillColour(ink);
    p.text(cx, textY, label, 'bold', MARKER.font * scale, 'centre');
  }
  p.restore();
}

// Annotation strokes in stage pixels, from the stylesheet: shapes 2, line
// casings 6, lines 3.5; labels in bold at 14 pixels with 4 pixel padding.
const ANNOTATION = { shape: 2, casing: 6, line: 3.5, labelFont: 14, labelPadding: 4, labelHeight: 18.9, radius: 6, gap: 4 };

function dashPattern(style: LineStyle, scale: number): number[] {
  const d = dashArray(style);
  return d ? d.split(' ').map((n) => Number(n) * scale) : [];
}

function annotationPath(p: Painter, a: SceneAnnotation, t: (q: Point) => Point): void {
  p.beginPath();
  if (a.kind === 'circle') {
    const c = t(a.points[0]);
    const e = t(a.points[1]);
    p.circle(c.x, c.y, Math.hypot(e.x - c.x, e.y - c.y));
    return;
  }
  const pts = a.kind === 'rectangle' ? rectCorners(a.points[0], a.points[1]) : a.points;
  pts.map(t).forEach((q, i) => (i === 0 ? p.moveTo(q.x, q.y) : p.lineTo(q.x, q.y)));
  if (a.kind !== 'line') p.close();
}

function rectCorners(a: Point, b: Point): Point[] {
  const r = rectOf(a, b);
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.width, y: r.y },
    { x: r.x + r.width, y: r.y + r.height },
    { x: r.x, y: r.y + r.height },
  ];
}

export function drawAnnotation(p: Painter, a: SceneAnnotation, t: (q: Point) => Point, scale: number): void {
  const outline = a.outline === 'black' ? PALETTE.outlineBlack : PALETTE.outlineWhite;
  p.save();
  p.roundLines();
  if (a.kind === 'line') {
    const dash = dashPattern(a.lineStyle, scale);
    p.dash(dash);
    p.strokeColour(outline);
    p.lineWidth(ANNOTATION.casing * scale);
    annotationPath(p, a, t);
    p.stroke();
    p.strokeColour(COLOUR_RGB[a.colour]);
    p.lineWidth(ANNOTATION.line * scale);
    annotationPath(p, a, t);
    p.stroke();
  } else {
    if (a.fillOpacity > 0) {
      p.opacity(a.fillOpacity);
      p.fillColour(COLOUR_RGB[a.colour]);
      annotationPath(p, a, t);
      p.fill();
      p.opacity(1);
    }
    p.strokeColour(outline);
    p.lineWidth(ANNOTATION.shape * scale);
    annotationPath(p, a, t);
    p.stroke();
  }
  p.restore();
}

export function drawAnnotationLabel(p: Painter, a: SceneAnnotation, t: (q: Point) => Point, scale: number): void {
  if (a.label === '') return;
  const anchor = t(labelAnchor(a));
  const size = ANNOTATION.labelFont * scale;
  const w = textWidth(a.label, 'bold', size) + 2 * ANNOTATION.labelPadding * scale;
  const h = ANNOTATION.labelHeight * scale;
  const top = a.kind === 'line' ? anchor.y - h / 2 : anchor.y + ANNOTATION.gap * scale;
  p.save();
  p.fillColour(a.outline === 'black' ? PALETTE.outlineBlack : PALETTE.outlineWhite);
  p.beginPath();
  roundedRect(p, anchor.x - w / 2, top, w, h, Math.min(ANNOTATION.radius * scale, h / 2));
  p.fill();
  p.fillColour(a.outline === 'black' ? PALETTE.outlineWhite : PALETTE.outlineBlack);
  p.text(anchor.x, top + h / 2 + 0.35 * size, a.label, 'bold', size, 'centre');
  p.restore();
}

// The legend as lines of entries, wrapped to a width (in page units).
interface LegendLine {
  height: number;
  entries: Array<{ x: number; draw: (p: Painter, x: number, baseline: number) => void }>;
}

export const LEGEND_FONT = 8;

export function layoutLegend(title: string, sections: LegendSection[], width: number, font = LEGEND_FONT): { height: number; draw: (p: Painter, x: number, y: number) => void } {
  const lineHeight = font * 1.9;
  const swatch = font * 1.35;
  const gap = font * 0.5;
  const entryGap = font * 1.2;
  const lines: LegendLine[] = [];
  let line: LegendLine = { height: lineHeight, entries: [] };
  let at = 0;
  const place = (w: number, draw: LegendLine['entries'][number]['draw'], newLineFirst = false) => {
    if ((newLineFirst && line.entries.length > 0) || (at > 0 && at + w > width)) {
      lines.push(line);
      line = { height: lineHeight, entries: [] };
      at = 0;
    }
    line.entries.push({ x: at, draw });
    at += w + entryGap;
  };
  const titleWidth = textWidth(title, 'bold', font + 1);
  place(titleWidth, (p, x, b) => {
    p.fillColour(PALETTE.fg);
    p.text(x, b, title, 'bold', font + 1);
  });
  for (const section of sections) {
    const labelWidth = textWidth(section.label, 'regular', font);
    // Each section starts on its own line, after the first.
    place(
      labelWidth,
      (p, x, b) => {
        p.fillColour(PALETTE.muted);
        p.text(x, b, section.label, 'regular', font);
      },
      section !== sections[0],
    );
    for (const item of section.items) {
      if (item.group !== undefined) {
        const number = `${item.group}.`;
        const w = textWidth(number, 'bold', font) + gap + textWidth(item.label, 'regular', font);
        place(w, (p, x, b) => {
          p.fillColour(PALETTE.fg);
          p.text(x, b, number, 'bold', font);
          p.text(x + textWidth(number, 'bold', font) + gap, b, item.label, 'regular', font);
        });
        continue;
      }
      const w = swatch + gap + textWidth(item.label, 'regular', font);
      place(w, (p, x, b) => {
        // Every swatch is the same height, the taller shapes included.
        const symbol = item.colour ? 'circle' : item.symbol!;
        const scale = swatch / markerSize(symbol, '').height;
        drawMarker(p, x + swatch / 2, b - font * 0.33, symbol, item.colour ?? null, '', scale);
        p.fillColour(PALETTE.fg);
        p.text(x + swatch + gap, b, item.label, 'regular', font);
      });
    }
  }
  if (line.entries.length > 0) lines.push(line);
  const height = lines.reduce((h, l) => h + l.height, 0);
  return {
    height,
    draw: (p, x, y) => {
      let top = y;
      for (const l of lines) {
        const baseline = top + l.height * 0.68;
        for (const e of l.entries) e.draw(p, x + e.x, baseline);
        top += l.height;
      }
    },
  };
}

// --- The stage page --------------------------------------------------------

export interface PageFrame {
  width: number;
  height: number;
  margin: number;
  // A line at the foot of the page (source, date, page number).
  footer: string;
}

// The stage page: the visible stage scaled to fit above the legend, framed,
// with the background clipped to the stage, then the annotations, the
// markers, and the annotation labels on top, as on screen.
export function drawStagePage(p: Painter, scene: StageScene, frame: PageFrame): { mapBox: Rect; scale: number } {
  const contentWidth = frame.width - 2 * frame.margin;
  const legend = layoutLegend(scene.legendTitle, scene.legend, contentWidth);
  const footerSpace = frame.footer === '' ? 0 : LEGEND_FONT * 2;
  const available = frame.height - 2 * frame.margin - legend.height - LEGEND_FONT - footerSpace;
  const scale = Math.min(contentWidth / scene.width, available / scene.height);
  const mapBox = { x: frame.margin + (contentWidth - scene.width * scale) / 2, y: frame.margin, width: scene.width * scale, height: scene.height * scale };
  const t = (q: Point): Point => ({ x: mapBox.x + q.x * scale, y: mapBox.y + q.y * scale });

  p.save();
  p.fillColour(PALETTE.stage);
  p.beginPath();
  p.rect(mapBox.x, mapBox.y, mapBox.width, mapBox.height);
  p.fill();
  p.beginPath();
  p.rect(mapBox.x, mapBox.y, mapBox.width, mapBox.height);
  p.clip();
  if (scene.background) {
    const b = scene.background.stage;
    p.image(mapBox.x + b.x * scale, mapBox.y + b.y * scale, b.width * scale, b.height * scale);
  }
  for (const a of scene.annotations) drawAnnotation(p, a, t, scale);
  for (const m of scene.markers) {
    const c = t(m);
    drawMarker(p, c.x, c.y, m.symbol, m.colour, m.label, scale);
  }
  for (const a of scene.annotations) drawAnnotationLabel(p, a, t, scale);
  p.restore();

  p.save();
  p.strokeColour(PALETTE.border);
  p.lineWidth(0.75);
  p.beginPath();
  p.rect(mapBox.x, mapBox.y, mapBox.width, mapBox.height);
  p.stroke();
  p.restore();

  legend.draw(p, frame.margin, mapBox.y + mapBox.height + LEGEND_FONT);
  drawFooter(p, frame);
  return { mapBox, scale };
}

function drawFooter(p: Painter, frame: PageFrame): void {
  if (frame.footer === '') return;
  p.fillColour(PALETTE.muted);
  p.text(frame.margin, frame.height - frame.margin + LEGEND_FONT * 0.6, frame.footer, 'regular', LEGEND_FONT - 1);
}

// --- The table -------------------------------------------------------------

// The shown items (FR-12): the headings and, per item, the values; the first
// column is the number as shown.
export interface DocumentTable {
  headings: string[];
  rows: string[][];
}

export const TABLE = { font: 8, padding: 4, lineHeight: 10, maxLines: 3, minColumn: 48, maxColumn: 220 };

export interface TableLayout {
  // Groups of column indices (the number column, 0, leads every group).
  groups: number[][];
  // The width of each column within its group, in page units.
  widths: number[][];
}

// Lays the columns out across the width: the number column leads every
// group; the other columns follow in order, as many as fit at their natural
// width (bounded), and the rest continue in further groups, so that no
// column is squeezed below a legible width. Each group then fills the width.
export function layoutTable(table: DocumentTable, width: number, t = TABLE): TableLayout {
  const natural = table.headings.map((h, c) => {
    const values = table.rows.map((r) => textWidth(r[c] ?? '', 'regular', t.font));
    const longest = Math.max(textWidth(h, 'bold', t.font), ...values, 0);
    // One point of slack, so that a value measured to fit is never wrapped
    // by rounding.
    return Math.min(t.maxColumn, Math.max(c === 0 ? 0 : t.minColumn, longest + 2 * t.padding + 1));
  });
  const groups: number[][] = [];
  let group: number[] = [0];
  let used = natural[0];
  for (let c = 1; c < table.headings.length; c++) {
    if (group.length > 1 && used + natural[c] > width) {
      groups.push(group);
      group = [0];
      used = natural[0];
    }
    group.push(c);
    used += natural[c];
  }
  groups.push(group);
  const widths = groups.map((g) => {
    const total = g.reduce((s, c) => s + natural[c], 0);
    // The number column keeps its width; the others share what is left.
    const rest = total - natural[0];
    const spare = Math.max(0, width - total);
    return g.map((c) => (c === 0 ? natural[0] : rest > 0 ? natural[c] + (spare * natural[c]) / rest : width - natural[0]));
  });
  return { groups, widths };
}

// A value wrapped at word boundaries into at most the given number of
// lines; the last line is shortened with an ellipsis when the value is
// longer. A word longer than a line is split.
export function wrapValue(text: string, width: number, font: PdfFont, size: number, maxLines: number): string[] {
  let rest = text.replace(/\s+/g, ' ').trim();
  const lines: string[] = [];
  while (rest !== '' && lines.length < maxLines) {
    if (lines.length === maxLines - 1 || textWidth(rest, font, size) <= width) {
      lines.push(fitText(rest, font, size, width));
      break;
    }
    const words = rest.split(' ');
    let n = 0;
    while (n < words.length && textWidth(words.slice(0, n + 1).join(' '), font, size) <= width) n++;
    if (n === 0) {
      const chars = [...words[0]];
      let k = chars.length - 1;
      while (k > 1 && textWidth(chars.slice(0, k).join(''), font, size) > width) k--;
      lines.push(chars.slice(0, k).join(''));
      rest = [chars.slice(k).join(''), ...words.slice(1)].join(' ');
    } else {
      lines.push(words.slice(0, n).join(' '));
      rest = words.slice(n).join(' ');
    }
  }
  return lines.length > 0 ? lines : [''];
}

export interface TablePage {
  group: number;
  rows: number[];
}

// The table's pages: per column group, the rows that fit each page under the
// repeated heading.
export function paginateTable(table: DocumentTable, layout: TableLayout, height: number, t = TABLE): TablePage[] {
  const pages: TablePage[] = [];
  layout.groups.forEach((g, gi) => {
    const headingHeight = rowHeight(g.map((c) => table.headings[c]), layout.widths[gi], 'bold', t);
    let rows: number[] = [];
    let used = headingHeight;
    table.rows.forEach((row, r) => {
      const h = rowHeight(g.map((c) => row[c] ?? ''), layout.widths[gi], 'regular', t);
      if (rows.length > 0 && used + h > height) {
        pages.push({ group: gi, rows });
        rows = [];
        used = headingHeight;
      }
      rows.push(r);
      used += h;
    });
    pages.push({ group: gi, rows });
  });
  return pages;
}

export function rowHeight(values: string[], widths: number[], font: PdfFont, t = TABLE): number {
  const lines = Math.max(1, ...values.map((v, i) => wrapValue(v, widths[i] - 2 * t.padding, font, t.font, t.maxLines).length));
  return lines * t.lineHeight + 2 * t.padding;
}

// The cells of one row as they appear: the wrapped lines of each value.
export function rowCells(values: string[], widths: number[], font: PdfFont, t = TABLE): string[][] {
  return values.map((v, i) => wrapValue(v, widths[i] - 2 * t.padding, font, t.font, t.maxLines));
}

export function drawTablePage(p: Painter, table: DocumentTable, layout: TableLayout, page: TablePage, frame: PageFrame, title: string, t = TABLE): void {
  const g = layout.groups[page.group];
  const widths = layout.widths[page.group];
  let y = frame.margin;
  p.fillColour(PALETTE.fg);
  p.text(frame.margin, y + 10, title, 'bold', 11);
  y += 20;
  const drawRow = (values: string[], font: PdfFont, shade: Rgb | null) => {
    const cells = rowCells(values, widths, font, t);
    const h = Math.max(1, ...cells.map((c) => c.length)) * t.lineHeight + 2 * t.padding;
    let x = frame.margin;
    if (shade) {
      p.fillColour(shade);
      p.beginPath();
      p.rect(x, y, widths.reduce((s, w) => s + w, 0), h);
      p.fill();
    }
    p.fillColour(PALETTE.fg);
    cells.forEach((lines, i) => {
      lines.forEach((line, l) => p.text(x + t.padding, y + t.padding + (l + 0.78) * t.lineHeight, line, font, t.font));
      x += widths[i];
    });
    p.strokeColour(PALETTE.border);
    p.lineWidth(0.5);
    p.beginPath();
    p.moveTo(frame.margin, y + h);
    p.lineTo(x, y + h);
    p.stroke();
    y += h;
  };
  drawRow(g.map((c) => table.headings[c]), 'bold', PALETTE.shade);
  page.rows.forEach((r, i) => drawRow(g.map((c) => table.rows[r][c] ?? ''), 'regular', i % 2 === 1 ? [0xf8, 0xf9, 0xfb] : null));
  drawFooter(p, frame);
}

// --- The PDF document --------------------------------------------------------

export interface DocumentTexts {
  title: string;
  // The footer of each page; {page} and {pages} are replaced.
  footer: string;
  // The title of each table page; {from}, {to}, and {total} are replaced;
  // when the columns are split into parts, the second form, with {part} and
  // {parts} as well.
  tableTitle: string;
  tableTitleParts: string;
  // The footer of the slide image (no page number).
  slideFooter?: string;
}

export const PDF_PAGE = { width: 841.89, height: 595.28, margin: 28 };

export interface PdfResult {
  bytes: Uint8Array;
  pages: number;
  tablePages: number;
  columnGroups: number;
  replaced: number;
}

function fillIn(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) => (key in values ? String(values[key]) : m));
}

// The PDF document (FR-12, FR-50): the stage page, then the table pages.
export function buildPdf(scene: StageScene, table: DocumentTable, background: { jpeg: Uint8Array; width: number; height: number } | null, texts: DocumentTexts, created: Date): PdfResult {
  const doc = new PdfDocument({ title: texts.title, created });
  const img = background ? doc.addJpeg(background.jpeg, background.width, background.height) : null;
  const frame = (page: number, pages: number): PageFrame => ({ width: PDF_PAGE.width, height: PDF_PAGE.height, margin: PDF_PAGE.margin, footer: fillIn(texts.footer, { page, pages }) });
  const layout = layoutTable(table, PDF_PAGE.width - 2 * PDF_PAGE.margin);
  const tableHeight = PDF_PAGE.height - 2 * PDF_PAGE.margin - 20 - LEGEND_FONT * 2;
  const pages = table.rows.length > 0 ? paginateTable(table, layout, tableHeight) : [];
  const total = 1 + pages.length;
  drawStagePage(new PdfPainter(doc.addPage(PDF_PAGE.width, PDF_PAGE.height), img), scene, frame(1, total));
  pages.forEach((page, i) => {
    const title = fillIn(layout.groups.length > 1 ? texts.tableTitleParts : texts.tableTitle, {
      from: page.rows[0] + 1,
      to: page.rows[page.rows.length - 1] + 1,
      total: table.rows.length,
      part: page.group + 1,
      parts: layout.groups.length,
    });
    drawTablePage(new PdfPainter(doc.addPage(PDF_PAGE.width, PDF_PAGE.height), null), table, layout, page, frame(i + 2, total), title);
  });
  return { bytes: doc.toBytes(), pages: total, tablePages: pages.length, columnGroups: layout.groups.length, replaced: doc.replacedCharacters };
}

// --- The inventory -----------------------------------------------------------

// What a document will contain, for its dialog (FR-52).
export interface DocumentInventory {
  markersInView: number;
  shownItems: number;
  annotationsInView: number;
  background: { width: number; height: number } | null;
  columns: number;
  hiddenColumns: number;
  switchedOff: number;
  removed: number;
  annotationsOff: number;
}


// --- The PowerPoint document -------------------------------------------------

// A 16:9 slide in points (13.333 by 7.5 inches), and the table on the slides:
// a larger type than on paper, as slides are read from further away.
export const PPTX_PAGE = { width: 960, height: 540, margin: 30, titleHeight: 28 };
export const PPTX_TABLE = { font: 10, padding: 5, lineHeight: 12.5, maxLines: 3, minColumn: 56, maxColumn: 260 };

export interface PptxTables {
  slides: PptxTableSlide[];
  columnGroups: number;
}

// The table slides (FR-12, FR-51): the same layout rules as the PDF's table,
// at the slide's size; each cell's lines as laid out.
export function pptxTables(table: DocumentTable, texts: Pick<DocumentTexts, 'tableTitle' | 'tableTitleParts'>): PptxTables {
  if (table.rows.length === 0) return { slides: [], columnGroups: 0 };
  const t = PPTX_TABLE;
  const width = PPTX_PAGE.width - 2 * PPTX_PAGE.margin;
  const layout = layoutTable(table, width, t);
  const height = PPTX_PAGE.height - 2 * PPTX_PAGE.margin - PPTX_PAGE.titleHeight;
  const pages = paginateTable(table, layout, height, t);
  const slides = pages.map((page) => {
    const g = layout.groups[page.group];
    const widths = layout.widths[page.group];
    const headings = g.map((c) => table.headings[c]);
    const rows = page.rows.map((r) => g.map((c) => table.rows[r][c] ?? ''));
    return {
      title: fillIn(layout.groups.length > 1 ? texts.tableTitleParts : texts.tableTitle, {
        from: page.rows[0] + 1,
        to: page.rows[page.rows.length - 1] + 1,
        total: table.rows.length,
        part: page.group + 1,
        parts: layout.groups.length,
      }),
      headings: rowCells(headings, widths, 'bold', t).map((lines) => lines.join('\n')),
      rows: rows.map((values) => rowCells(values, widths, 'regular', t).map((lines) => lines.join('\n'))),
      widths,
      rowHeights: rows.map((values) => rowHeight(values, widths, 'regular', t)),
      headingHeight: rowHeight(headings, widths, 'bold', t),
    };
  });
  return { slides, columnGroups: layout.groups.length };
}

export function buildPptxDocument(png: Uint8Array, description: string, tables: PptxTables, title: string, lang: string, created: Date): Uint8Array {
  return buildPptx({
    title,
    image: { png, description },
    tables: tables.slides,
    font: PPTX_TABLE.font,
    padding: PPTX_TABLE.padding,
    margin: PPTX_PAGE.margin,
    titleHeight: PPTX_PAGE.titleHeight,
    lang,
    created,
  });
}
