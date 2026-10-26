import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { classify, DRAW_ORDER, MAX_RENDER_SIDE, OsmError, parseOsm, planRender } from '../../src/osm';

const fixture = (name: string) => readFileSync(join(process.cwd(), 'example-data', name), 'utf8');

function expectOsmError(f: () => unknown, code: string): void {
  try {
    f();
  } catch (e) {
    expect(e).toBeInstanceOf(OsmError);
    expect((e as OsmError).code).toBe(code);
    return;
  }
  throw new Error('expected an OsmError');
}

describe('.osm parsing (FR-31)', () => {
  test('the example file parses into nodes, ways with tags, and bounds', () => {
    const data = parseOsm(fixture('example-map.osm'));
    expect(data.nodes.size).toBe(142);
    expect(data.ways).toHaveLength(38);
    expect(data.bounds).toEqual({ minLat: 0, minLon: 0, maxLat: 0.006, maxLon: 0.009 });
    const lake = data.ways.find((w) => w.tags.natural === 'water')!;
    expect(lake.refs).toHaveLength(17);
    expect(lake.refs[0]).toBe(lake.refs[16]);
    expect(data.nodes.get('1')).toEqual({ lat: 0.001, lon: 0.0002 });
  });

  test('malformed, truncated, or non-OSM XML fails with a clear code', () => {
    expectOsmError(() => parseOsm(fixture('example-map-malformed.osm')), 'malformed');
    expectOsmError(() => parseOsm('not xml at all'), 'malformed');
    expectOsmError(() => parseOsm('<?xml version="1.0"?><gpx></gpx>'), 'malformed');
    expectOsmError(() => parseOsm('<osm><node id="1" lat="x" lon="0"/></osm>'), 'malformed');
    expectOsmError(() => parseOsm('<osm><node id="1" lat="95" lon="0"/></osm>'), 'malformed');
    expectOsmError(() => parseOsm('<osm><bounds minlat="1" minlon="0" maxlat="0" maxlon="1"/></osm>'), 'malformed');
  });

  test('a file without drawable features is reported as empty', () => {
    expectOsmError(() => planRender(parseOsm('<osm></osm>')), 'empty');
    const onlyBoundary =
      '<osm><node id="1" lat="0" lon="0"/><node id="2" lat="1" lon="1"/><way id="9"><nd ref="1"/><nd ref="2"/><tag k="boundary" v="x"/></way></osm>';
    expectOsmError(() => planRender(parseOsm(onlyBoundary)), 'empty');
  });
});

describe('feature classes and the render plan (FR-31)', () => {
  test('roads, buildings, water, green areas, waterways, rail, and paths are distinguished', () => {
    expect(classify({ highway: 'primary' })).toBe('major-road');
    expect(classify({ highway: 'residential' })).toBe('minor-road');
    expect(classify({ highway: 'footway' })).toBe('path');
    expect(classify({ building: 'yes' })).toBe('building');
    expect(classify({ building: 'no' })).toBeNull();
    expect(classify({ natural: 'water' })).toBe('water');
    expect(classify({ waterway: 'river' })).toBe('waterway');
    expect(classify({ leisure: 'park' })).toBe('green');
    expect(classify({ railway: 'rail' })).toBe('rail');
    expect(classify({ boundary: 'administrative' })).toBeNull();
  });

  test('the plan keeps the true aspect ratio within the size limit, and draws areas before lines', () => {
    const plan = planRender(parseOsm(fixture('example-map.osm')));
    // 0.009 degrees of longitude by 0.006 of latitude at the equator: 3 : 2.
    expect(plan.width).toBe(3000);
    expect(plan.height).toBe(2000);
    expect(Math.max(plan.width, plan.height)).toBeLessThanOrEqual(MAX_RENDER_SIDE);
    const order = plan.shapes.map((s) => DRAW_ORDER.indexOf(s.feature));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    const counts = plan.shapes.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s.feature]: (acc[s.feature] ?? 0) + 1 }), {});
    expect(counts).toEqual({ green: 1, water: 1, building: 24, waterway: 1, rail: 1, path: 1, 'minor-road': 7, 'major-road': 1 });
  });

  test('points are projected into the image, north up, west left', () => {
    const plan = planRender(parseOsm(fixture('example-map.osm')));
    const all = plan.shapes.flatMap((s) => s.points);
    for (const [x, y] of all) {
      expect(x).toBeGreaterThanOrEqual(-0.001);
      expect(x).toBeLessThanOrEqual(plan.width + 0.001);
      expect(y).toBeGreaterThanOrEqual(-0.001);
      expect(y).toBeLessThanOrEqual(plan.height + 0.001);
    }
    // The first street (latitude 0.001, the south part) lies in the lower half.
    const street = plan.shapes.find((s) => s.feature === 'minor-road')!;
    expect(street.points[0][1]).toBeGreaterThan(plan.height / 2);
    expect(street.points[0][0]).toBeLessThan(street.points[1][0]);
  });

  test('without bounds, the extent of the drawn features is used', () => {
    const text = fixture('example-map.osm').replace(/\s*<bounds[^>]*\/>/, '');
    const plan = planRender(parseOsm(text));
    const xs = plan.shapes.flatMap((s) => s.points.map((p) => p[0]));
    expect(Math.min(...xs)).toBeCloseTo(0, 6);
    expect(Math.max(...xs)).toBeCloseTo(plan.width, 6);
  });

  test('ways referring to missing nodes are skipped, not invented', () => {
    const text = '<osm><node id="1" lat="0" lon="0"/><node id="2" lat="0.001" lon="0.001"/>' +
      '<way id="1"><nd ref="1"/><nd ref="2"/><tag k="highway" v="residential"/></way>' +
      '<way id="2"><nd ref="1"/><nd ref="99"/><tag k="highway" v="residential"/></way></osm>';
    expect(planRender(parseOsm(text)).shapes).toHaveLength(1);
  });
});
