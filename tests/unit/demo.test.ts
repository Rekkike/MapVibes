import { describe, expect, test } from 'vitest';
import { DEMO_MAP_TEXT, demoScenario, demoWorkbook, parseDemoScenario } from '../../src/demo';
import { importColumns, parseWorkbook } from '../../src/ingest';
import { parseOsm } from '../../src/osm';
import scenarioJson from '../../example-data/demo-scenario.json';

const list = importColumns(parseWorkbook(demoWorkbook()));
const scenario = demoScenario();

describe('full-test demo fixtures (FR-41)', () => {
  test('the demo list is about a dozen items under the preset headers', () => {
    expect(list.rows.length).toBe(12);
    expect(list.headers).toEqual(scenario.preset.headers);
    expect(list.rows[0]).toMatchObject({ Item: 'D-01', 'Start year': '2019', 'End year': '2021' });
  });

  test('the preset assigns every role and carries both vocabularies', () => {
    expect(Object.keys(scenario.preset.roles).sort()).toEqual(['area', 'end', 'identifier', 'name', 'start', 'status']);
    expect(scenario.preset.areas!.length).toBeGreaterThanOrEqual(4);
    expect(scenario.preset.statuses!.every((s) => s.symbol !== 'circle')).toBe(true);
  });

  test('the list and the scenario agree: every scenario item is in the list, and the list uses the vocabularies', () => {
    const ids = list.rows.map((r) => r.Item);
    expect(scenario.items.map((i) => i.item)).toEqual(ids);
    const areas = new Set(scenario.preset.areas);
    const statuses = new Set(scenario.preset.statuses!.map((s) => s.name));
    for (const row of list.rows) {
      expect(row.Area === '' || areas.has(row.Area), row.Item).toBe(true);
      expect(statuses.has(row.Status), row.Item).toBe(true);
    }
    // Every area value of the vocabulary and every status is used.
    expect(new Set(list.rows.map((r) => r.Area).filter((a) => a !== ''))).toEqual(areas);
    expect(new Set(list.rows.map((r) => r.Status))).toEqual(statuses);
  });

  test('the arrangement is varied: colours, manual symbols, a cluster, items near the edges, an item not placed, comments', () => {
    const placed = scenario.items.filter((i) => i.position);
    expect(new Set(scenario.items.map((i) => i.colour)).size).toBe(4);
    expect(scenario.items.filter((i) => i.symbol).length).toBeGreaterThanOrEqual(2);
    expect(scenario.items.some((i) => !i.position)).toBe(true);
    const near = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.06;
    expect(placed.some((a) => placed.filter((b) => b !== a && near(a.position!, b.position!)).length >= 2)).toBe(true);
    const edge = (p: number[]) => p.some((v) => v < 0.08 || v > 0.92);
    expect(placed.filter((i) => edge(i.position!)).length).toBeGreaterThanOrEqual(3);
    expect(scenario.items.filter((i) => i.comments.length > 0).length).toBeGreaterThanOrEqual(4);
  });

  test('the background is the synthetic town map fixture', () => {
    const data = parseOsm(DEMO_MAP_TEXT);
    expect(data.bounds).not.toBeNull();
  });

  test('a damaged scenario is refused as a whole', () => {
    const bad = (mutate: (o: any) => void) => {
      const o = JSON.parse(JSON.stringify(scenarioJson));
      mutate(o);
      return () => parseDemoScenario(o);
    };
    expect(bad((o) => (o.version = 2))).toThrow();
    expect(bad((o) => (o.items[0].colour = 'purple'))).toThrow();
    expect(bad((o) => (o.items[0].position = [1.5, 0]))).toThrow();
    expect(bad((o) => (o.items[0].symbol = 'star'))).toThrow();
    expect(bad((o) => (o.items[0].comments = [{ date: 'later', text: 'x' }]))).toThrow();
    expect(bad((o) => (o.items[1].item = 'D-01'))).toThrow();
    expect(bad((o) => delete o.preset.roles.identifier)).toThrow();
  });
});
