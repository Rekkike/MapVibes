// Viewport mathematics for the map view (FR-4). A viewport maps background
// image coordinates to stage (screen) coordinates:
//   screen = image * scale + offset
// All functions are pure and return new viewport values.

export interface Viewport {
  scale: number;
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export const MIN_SCALE = 0.02;
export const MAX_SCALE = 32;
export const BUTTON_ZOOM_FACTOR = 1.25;

export const IDENTITY: Viewport = { scale: 1, x: 0, y: 0 };

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return MIN_SCALE;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function imageToScreen(v: Viewport, p: Point): Point {
  return { x: p.x * v.scale + v.x, y: p.y * v.scale + v.y };
}

export function screenToImage(v: Viewport, p: Point): Point {
  return { x: (p.x - v.x) / v.scale, y: (p.y - v.y) / v.scale };
}

// Zooms by a factor while keeping the image point under the stage point
// `anchor` fixed on screen.
export function zoomAt(v: Viewport, factor: number, anchor: Point): Viewport {
  const scale = clampScale(v.scale * factor);
  const ratio = scale / v.scale;
  return {
    scale,
    x: anchor.x - (anchor.x - v.x) * ratio,
    y: anchor.y - (anchor.y - v.y) * ratio,
  };
}

export function panBy(v: Viewport, dx: number, dy: number): Viewport {
  return { scale: v.scale, x: v.x + dx, y: v.y + dy };
}

// One step of a two-finger pinch (FR-36): the view zooms by the change in
// the distance between the two points, and the image point that was under
// their midpoint stays under the midpoint as it moves.
export function pinchStep(v: Viewport, from: [Point, Point], to: [Point, Point]): Viewport {
  const distance = (p: [Point, Point]) => Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y);
  const mid = (p: [Point, Point]) => ({ x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 });
  const before = distance(from);
  const factor = before > 0 ? distance(to) / before : 1;
  const a = mid(from);
  const b = mid(to);
  return panBy(zoomAt(v, factor, a), b.x - a.x, b.y - a.y);
}

function centredAt(scale: number, image: Size, stage: Size): Viewport {
  return {
    scale,
    x: (stage.width - image.width * scale) / 2,
    y: (stage.height - image.height * scale) / 2,
  };
}

// The largest scale at which the whole image fits the stage, centred.
export function fitView(image: Size, stage: Size): Viewport {
  if (image.width <= 0 || image.height <= 0 || stage.width <= 0 || stage.height <= 0) return { ...IDENTITY };
  const scale = clampScale(Math.min(stage.width / image.width, stage.height / image.height));
  return centredAt(scale, image, stage);
}

// Actual size (one image pixel per stage pixel), centred.
export function resetView(image: Size, stage: Size): Viewport {
  return centredAt(1, image, stage);
}

// Wheel zoom factor: a smooth exponential response to the wheel delta,
// bounded per event so that one large delta does not jump excessively.
export function wheelZoomFactor(deltaY: number): number {
  const bounded = Math.max(-400, Math.min(400, deltaY));
  return Math.exp(-bounded * 0.0015);
}
