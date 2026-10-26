import { describe, expect, test } from 'vitest';
import {
  clampScale,
  fitView,
  imageToScreen,
  MAX_SCALE,
  MIN_SCALE,
  panBy,
  resetView,
  screenToImage,
  wheelZoomFactor,
  zoomAt,
  type Viewport,
} from '../../src/viewport';

const v: Viewport = { scale: 2, x: 10, y: -20 };

describe('viewport mathematics (FR-4)', () => {
  test('image and screen coordinates are inverse transforms', () => {
    const p = { x: 123.5, y: -7 };
    const back = screenToImage(v, imageToScreen(v, p));
    expect(back.x).toBeCloseTo(p.x, 10);
    expect(back.y).toBeCloseTo(p.y, 10);
    expect(imageToScreen(v, { x: 5, y: 5 })).toEqual({ x: 20, y: -10 });
  });

  test('zooming keeps the anchored image point fixed on screen', () => {
    const anchor = { x: 300, y: 200 };
    const before = screenToImage(v, anchor);
    const zoomed = zoomAt(v, 1.7, anchor);
    expect(zoomed.scale).toBeCloseTo(3.4, 10);
    const after = imageToScreen(zoomed, before);
    expect(after.x).toBeCloseTo(anchor.x, 10);
    expect(after.y).toBeCloseTo(anchor.y, 10);
  });

  test('zoom in then out by the same factor restores the viewport', () => {
    const anchor = { x: 50, y: 75 };
    const round = zoomAt(zoomAt(v, 1.25, anchor), 1 / 1.25, anchor);
    expect(round.scale).toBeCloseTo(v.scale, 10);
    expect(round.x).toBeCloseTo(v.x, 10);
    expect(round.y).toBeCloseTo(v.y, 10);
  });

  test('scale is clamped to the supported range, and the anchor still holds at the limit', () => {
    expect(clampScale(1000)).toBe(MAX_SCALE);
    expect(clampScale(0)).toBe(MIN_SCALE);
    expect(clampScale(-1)).toBe(MIN_SCALE);
    expect(clampScale(Number.NaN)).toBe(MIN_SCALE);
    const anchor = { x: 10, y: 10 };
    const before = screenToImage(v, anchor);
    const z = zoomAt(v, 1e6, anchor);
    expect(z.scale).toBe(MAX_SCALE);
    const after = imageToScreen(z, before);
    expect(after.x).toBeCloseTo(anchor.x, 8);
    expect(after.y).toBeCloseTo(anchor.y, 8);
  });

  test('panning translates without changing scale', () => {
    expect(panBy(v, 5, -3)).toEqual({ scale: 2, x: 15, y: -23 });
  });

  test('fit view shows the whole image centred at the largest fitting scale', () => {
    const wide = fitView({ width: 2000, height: 1000 }, { width: 800, height: 600 });
    expect(wide.scale).toBeCloseTo(0.4, 10);
    expect(wide.x).toBeCloseTo(0, 10);
    expect(wide.y).toBeCloseTo(100, 10);
    const tall = fitView({ width: 100, height: 400 }, { width: 800, height: 600 });
    expect(tall.scale).toBeCloseTo(1.5, 10);
    expect(tall.x).toBeCloseTo(325, 10);
    expect(tall.y).toBeCloseTo(0, 10);
  });

  test('fit view of degenerate sizes falls back to identity', () => {
    expect(fitView({ width: 0, height: 10 }, { width: 100, height: 100 })).toEqual({ scale: 1, x: 0, y: 0 });
    expect(fitView({ width: 10, height: 10 }, { width: 0, height: 0 })).toEqual({ scale: 1, x: 0, y: 0 });
  });

  test('reset view is actual size, centred', () => {
    expect(resetView({ width: 200, height: 100 }, { width: 800, height: 600 })).toEqual({ scale: 1, x: 300, y: 250 });
  });

  test('wheel factor zooms in for negative delta, out for positive, and is bounded', () => {
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100)).toBeLessThan(1);
    expect(wheelZoomFactor(0)).toBe(1);
    expect(wheelZoomFactor(100) * wheelZoomFactor(-100)).toBeCloseTo(1, 10);
    expect(wheelZoomFactor(1e9)).toBeCloseTo(wheelZoomFactor(400), 12);
  });
});
