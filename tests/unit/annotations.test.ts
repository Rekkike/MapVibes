import { describe, expect, test } from 'vitest';
import {
  closesPolygon,
  dashArray,
  hits,
  isComplete,
  outlinePoints,
  polygonArea,
  rectOf,
  shapeArea,
  translate,
  type Annotation,
} from '../../src/annotations';

function ann(kind: Annotation['kind'], points: Array<[number, number]>): Annotation {
  return { id: 'a', kind, points: points.map(([x, y]) => ({ x, y })), colour: 'blue', fillOpacity: 0.3, outline: 'black', lineStyle: 'solid', label: '' };
}

describe('annotation geometry (FR-47, FR-49)', () => {
  test('a rectangle is spanned by any two opposite corners', () => {
    expect(rectOf({ x: 10, y: 50 }, { x: 4, y: 20 })).toEqual({ x: 4, y: 20, width: 6, height: 30 });
    expect(outlinePoints(ann('rectangle', [[10, 50], [4, 20]]))).toEqual([
      { x: 4, y: 20 },
      { x: 10, y: 20 },
      { x: 10, y: 50 },
      { x: 4, y: 50 },
    ]);
  });

  test('areas: polygon by the shoelace formula in either winding, rectangle, circle; a line has none', () => {
    expect(polygonArea([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }])).toBe(6);
    expect(polygonArea([{ x: 4, y: 3 }, { x: 4, y: 0 }, { x: 0, y: 0 }])).toBe(6);
    expect(shapeArea(ann('rectangle', [[0, 0], [10, 20]]))).toBe(200);
    expect(shapeArea(ann('circle', [[5, 5], [5, 15]]))).toBeCloseTo(Math.PI * 100, 10);
    expect(shapeArea(ann('polygon', [[0, 0], [10, 0], [10, 10], [0, 10]]))).toBe(100);
    expect(shapeArea(ann('line', [[0, 0], [10, 0]]))).toBe(0);
  });

  test('a polygon closes on a press near its first vertex, once it has three vertices', () => {
    const v = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    expect(closesPolygon(v, { x: 3, y: 3 }, { x: 0, y: 0 })).toBe(false);
    const three = [...v, { x: 10, y: 10 }];
    expect(closesPolygon(three, { x: 8, y: 6 }, { x: 0, y: 0 })).toBe(true);
    expect(closesPolygon(three, { x: 9, y: 9 }, { x: 0, y: 0 })).toBe(false);
    expect(closesPolygon(three, { x: 20, y: 0 }, { x: 0, y: 0 }, 25)).toBe(true);
  });

  test('moving translates every point', () => {
    expect(translate(ann('line', [[1, 2], [3, 4]]), 10, -1).points).toEqual([
      { x: 11, y: 1 },
      { x: 13, y: 3 },
    ]);
  });

  test('hit testing: inside shapes, near outlines and lines, not elsewhere', () => {
    const square = ann('polygon', [[0, 0], [10, 0], [10, 10], [0, 10]]);
    expect(hits(square, { x: 5, y: 5 }, 1)).toBe(true);
    expect(hits(square, { x: 10.5, y: 5 }, 1)).toBe(true);
    expect(hits(square, { x: 13, y: 5 }, 1)).toBe(false);
    const line = ann('line', [[0, 0], [10, 0], [10, 10]]);
    expect(hits(line, { x: 5, y: 0.5 }, 1)).toBe(true);
    // A line is not closed: its inside is not a hit.
    expect(hits(line, { x: 4, y: 4 }, 1)).toBe(false);
    expect(hits(ann('circle', [[0, 0], [5, 0]]), { x: 3, y: 3 }, 0)).toBe(true);
    expect(hits(ann('circle', [[0, 0], [5, 0]]), { x: 5, y: 5 }, 0)).toBe(false);
    expect(hits(ann('rectangle', [[0, 0], [10, 10]]), { x: 5, y: 5 }, 0)).toBe(true);
  });

  test('only complete annotations are kept', () => {
    expect(isComplete(ann('rectangle', [[0, 0], [1, 30]]), 3)).toBe(false);
    expect(isComplete(ann('rectangle', [[0, 0], [5, 30]]), 3)).toBe(true);
    expect(isComplete(ann('circle', [[0, 0], [2, 0]]), 3)).toBe(false);
    expect(isComplete(ann('polygon', [[0, 0], [5, 0]]), 3)).toBe(false);
    expect(isComplete(ann('polygon', [[0, 0], [5, 0], [10, 0]]), 3)).toBe(false);
    expect(isComplete(ann('polygon', [[0, 0], [5, 0], [5, 5]]), 3)).toBe(true);
    expect(isComplete(ann('line', [[0, 0]]), 3)).toBe(false);
    expect(isComplete(ann('line', [[0, 0], [1, 1]]), 3)).toBe(true);
  });

  test('line styles: solid, dotted, dashed', () => {
    expect([dashArray('solid'), dashArray('dotted'), dashArray('dashed')]).toEqual([null, '0 7', '10 7']);
  });
});

describe('honest area measurement (FR-49)', () => {
  // A projection like the renderer's: longitude 0 at x = 0, latitude 0 at
  // y = 1000, 1000 pixels per radian... scaled to a small area: one pixel is
  // about 1.11 metres at the equator.
  const scale = 1 / ((1.11 / 6378137) * 1);
  const projection = { x0: 0, y1: 1000 / scale, scale };

  test('a pixel converts back to latitude and longitude', async () => {
    const { pixelToLatLon } = await import('../../src/osm');
    const origin = pixelToLatLon(projection, 0, 1000);
    expect(origin.lon).toBeCloseTo(0, 10);
    expect(origin.lat).toBeCloseTo(0, 10);
    const east = pixelToLatLon(projection, 100, 1000);
    expect(east.lon).toBeGreaterThan(0);
  });

  test('a square of 100 by 100 pixels near the equator measures about 111 by 111 metres', async () => {
    const { trueArea } = await import('../../src/annotations');
    const square = ann('polygon', [[0, 900], [100, 900], [100, 1000], [0, 1000]]);
    const area = trueArea(square, projection)!;
    expect(area / (111 * 111)).toBeGreaterThan(0.995);
    expect(area / (111 * 111)).toBeLessThan(1.005);
    // The same square as a rectangle measures the same.
    expect(trueArea(ann('rectangle', [[0, 900], [100, 1000]]), projection)).toBeCloseTo(area, 6);
  });

  test('a circle is measured as a polygon close to pi r squared', async () => {
    const { trueArea } = await import('../../src/annotations');
    const area = trueArea(ann('circle', [[500, 500], [600, 500]]), projection)!;
    expect(area / (Math.PI * 111 * 111)).toBeGreaterThan(0.99);
    expect(area / (Math.PI * 111 * 111)).toBeLessThan(1.01);
  });

  test('on a plain image (no known scale), and for a line, there is no area in true units', async () => {
    const { trueArea } = await import('../../src/annotations');
    expect(trueArea(ann('polygon', [[0, 0], [10, 0], [10, 10]]), undefined)).toBeNull();
    expect(trueArea(ann('line', [[0, 0], [10, 0]]), projection)).toBeNull();
  });

  test('the measurement agrees with the rendered example town map', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { parseOsm, planRender, pixelToLatLon } = await import('../../src/osm');
    const { trueArea } = await import('../../src/annotations');
    const plan = planRender(parseOsm(readFileSync(join(process.cwd(), 'example-data', 'example-map.osm'), 'utf8')));
    // The whole rendering, measured, against the extent in degrees.
    const whole = trueArea(ann('rectangle', [[0, 0], [plan.width, plan.height]]), plan.projection)!;
    const nw = pixelToLatLon(plan.projection, 0, 0);
    const se = pixelToLatLon(plan.projection, plan.width, plan.height);
    const metresPerDegree = (Math.PI / 180) * 6378137;
    const expected = (se.lon - nw.lon) * metresPerDegree * (nw.lat - se.lat) * metresPerDegree * Math.cos((((nw.lat + se.lat) / 2) * Math.PI) / 180);
    expect(whole / expected).toBeGreaterThan(0.99);
    expect(whole / expected).toBeLessThan(1.01);
  });

  test('areas are shown in square metres, hectares, or square kilometres, to three significant digits', async () => {
    const { formatArea } = await import('../../src/annotations');
    expect(formatArea(1234.5, 'en-GB')).toBe('1,230 m²');
    expect(formatArea(12345, 'en-GB')).toBe('1.23 ha');
    expect(formatArea(2_500_000, 'en-GB')).toBe('2.5 km²');
    expect(formatArea(12345, 'sv-SE')).toBe('1,23 ha');
  });
});

describe('label placement (FR-47)', () => {
  test("a shape's label hangs below it, centred, clear of the item marker inside; a line's sits on its middle segment", async () => {
    const { labelAnchor } = await import('../../src/annotationlayer');
    expect(labelAnchor({ kind: 'rectangle', points: [{ x: 10, y: 20 }, { x: 50, y: 80 }] })).toEqual({ x: 30, y: 80 });
    expect(labelAnchor({ kind: 'circle', points: [{ x: 100, y: 100 }, { x: 130, y: 140 }] })).toEqual({ x: 100, y: 150 });
    expect(labelAnchor({ kind: 'polygon', points: [{ x: 0, y: 0 }, { x: 40, y: 10 }, { x: 20, y: 30 }] })).toEqual({ x: 20, y: 30 });
    expect(labelAnchor({ kind: 'line', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }] })).toEqual({ x: 10, y: 10 });
  });
});

describe('the straight-line constraint (FR-47 as amended in v1.3.0)', () => {
  test('a point moves onto the nearest of horizontal, vertical, and the diagonals through the anchor', async () => {
    const { snapToAxis, constrained } = await import('../../src/annotationlayer');
    const o = { x: 10, y: 10 };
    expect(snapToAxis(o, { x: 50, y: 14 })).toEqual({ x: 50, y: 10 });
    expect(snapToAxis(o, { x: 13, y: -40 })).toEqual({ x: 10, y: -40 });
    const d = snapToAxis(o, { x: 40, y: 44 });
    expect(d.x - o.x).toBeCloseTo(d.y - o.y, 9);
    expect(d.x).toBeCloseTo(42, 9);
    const a = snapToAxis(o, { x: 40, y: -18 });
    expect(a.x - o.x).toBeCloseTo(-(a.y - o.y), 9);
    // Leftwards and upwards work the same way.
    expect(snapToAxis(o, { x: -30, y: 12 })).toEqual({ x: -30, y: 10 });
    expect(snapToAxis(o, o)).toEqual(o);
    expect([constrained({ shiftKey: true }), constrained({ ctrlKey: true }), constrained({})]).toEqual([true, true, false]);
  });
});
