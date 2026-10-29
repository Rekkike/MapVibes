import { describe, expect, test } from 'vitest';
import { DEMO_MAP_TEXT, demoCounterparts, demoScenario, demoWorkbook, parseDemoScenarios } from '../../src/demo';
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

  test('the preset assigns every role and carries the vocabularies', () => {
    expect(Object.keys(scenario.preset.roles).sort()).toEqual(['area', 'end', 'identifier', 'name', 'note', 'program', 'start', 'status']);
    expect(scenario.preset.areas!.length).toBeGreaterThanOrEqual(4);
    expect(scenario.preset.programs).toEqual(['Green links', 'Heritage route']);
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
      return () => parseDemoScenarios(o);
    };
    expect(bad(() => undefined)).not.toThrow();
    expect(bad((o) => (o.version = 2))).toThrow();
    expect(bad((o) => (o.colourLabels.en.purple = 'Odd'))).toThrow();
    expect(bad((o) => (o.colourLabels.sv.green = ' '))).toThrow();
    expect(bad((o) => delete o.colourLabels.sv.red)).toThrow();
    expect(bad((o) => (o.glanceColumns.en = ['Nowhere']))).toThrow();
    expect(bad((o) => (o.glanceColumns.sv = ['Programme']))).toThrow();
    expect(bad((o) => delete o.preset.sv)).toThrow();
    expect(bad((o) => o.preset.sv.areas.pop())).toThrow();
    expect(bad((o) => (o.preset.sv.statuses[0].symbol = 'gear'))).toThrow();
    expect(bad((o) => (o.preset.sv.roles.start = 'Slutår'))).toThrow();
    expect(bad((o) => (o.items[0].comments[0].text = 'One language only'))).toThrow();
    expect(bad((o) => (o.annotations[0].label = { en: 'Footprint' }))).toThrow();
    expect(bad((o) => (o.annotations[0].kind = 'star'))).toThrow();
    expect(bad((o) => (o.annotations[0].points = [[0.1, 0.1], [0.2, 0.2]]))).toThrow();
    expect(bad((o) => (o.annotations[1].points[0] = [1.2, 0]))).toThrow();
    expect(bad((o) => (o.annotations[0].fillOpacity = 2))).toThrow();
    expect(bad((o) => (o.annotations[0].link = 'D-99'))).toThrow();
    expect(bad((o) => (o.items[0].colour = 'purple'))).toThrow();
    expect(bad((o) => (o.items[0].position = [1.5, 0]))).toThrow();
    expect(bad((o) => (o.items[0].symbol = 'star'))).toThrow();
    expect(bad((o) => (o.items[0].comments = [{ date: 'later', text: { en: 'x', sv: 'x' } }]))).toThrow();
    expect(bad((o) => (o.items[1].item = 'D-01'))).toThrow();
    expect(bad((o) => delete o.preset.en.roles.identifier)).toThrow();
  });
});

describe('the demo extension (FR-41 as amended in v1.1.0)', () => {
  test('invented programmes span areas, and some items have none', () => {
    const byProgram = new Map<string, Set<string>>();
    for (const row of list.rows) if (row.Programme !== '') byProgram.set(row.Programme, (byProgram.get(row.Programme) ?? new Set()).add(row.Area));
    expect([...byProgram.keys()].sort()).toEqual(scenario.preset.programs);
    for (const areas of byProgram.values()) expect(areas.size).toBeGreaterThanOrEqual(3);
    expect(list.rows.filter((r) => r.Programme === '').length).toBeGreaterThanOrEqual(3);
  });

  test('every colour has a user-chosen label, and the panel columns are configured', () => {
    expect(Object.keys(scenario.colourLabels).sort()).toEqual(['blue', 'green', 'red', 'yellow']);
    expect(scenario.glanceColumns).toEqual(['Programme', 'Status', 'End year']);
  });

  test('the annotations: a linked polygon footprint, a free annotation, and one dashed line', () => {
    const [footprint, free, line] = scenario.annotations;
    expect([footprint.kind, footprint.link]).toEqual(['polygon', 'D-07']);
    expect([free.kind, free.link]).toEqual(['rectangle', null]);
    expect([line.kind, line.lineStyle, line.link]).toEqual(['line', 'dashed', null]);
    expect(scenario.annotations.filter((a) => a.lineStyle === 'dashed')).toHaveLength(1);
    // The footprint is drawn around its item's marker.
    const item = scenario.items.find((i) => i.item === 'D-07')!.position!;
    const xs = footprint.points.map((p) => p[0]);
    const ys = footprint.points.map((p) => p[1]);
    expect(item[0]).toBeGreaterThan(Math.min(...xs));
    expect(item[0]).toBeLessThan(Math.max(...xs));
    expect(item[1]).toBeGreaterThan(Math.min(...ys));
    expect(item[1]).toBeLessThan(Math.max(...ys));
  });
});

describe('the demo in both interface languages (FR-41 as amended in v1.3.1)', () => {
  const sv = demoScenario('sv');
  const svList = importColumns(parseWorkbook(demoWorkbook('sv')));

  test('the Swedish list is the same items under the Swedish preset headers', () => {
    expect(svList.headers).toEqual(sv.preset.headers);
    expect(svList.rows.map((r) => r.Objekt)).toEqual(list.rows.map((r) => r.Item));
    expect(svList.rows[0]).toMatchObject({ Objekt: 'D-01', Startår: '2019', Slutår: '2021', Status: 'Klar' });
    // The years and the empty cells are the same in both lists.
    list.rows.forEach((row, i) => {
      const other = svList.rows[i];
      expect([other.Startår, other.Slutår]).toEqual([row['Start year'], row['End year']]);
      expect(other.Område === '').toBe(row.Area === '');
      expect(other.Program === '').toBe(row.Programme === '');
    });
  });

  test('the Swedish list uses the Swedish vocabularies, entry for entry with the English ones', () => {
    const statuses = new Set(sv.preset.statuses!.map((s) => s.name));
    for (const row of svList.rows) {
      expect(row.Område === '' || sv.preset.areas!.includes(row.Område), row.Objekt).toBe(true);
      expect(statuses.has(row.Status), row.Objekt).toBe(true);
    }
    const c = demoCounterparts('en', 'sv');
    list.rows.forEach((row, i) => {
      expect(c.statuses.find(([from]) => from === row.Status)![1]).toBe(svList.rows[i].Status);
      if (row.Area !== '') expect(c.areas.find(([from]) => from === row.Area)![1]).toBe(svList.rows[i].Område);
      if (row.Programme !== '') expect(c.programs.find(([from]) => from === row.Programme)![1]).toBe(svList.rows[i].Program);
    });
  });

  test('every provided label has its own Swedish text', () => {
    const c = demoCounterparts('en', 'sv');
    const labels = [...c.colourLabels.map((l) => [l.from, l.to]), ...c.areas, ...c.programs, ...c.statuses, ...c.annotationLabels, [scenario.preset.name, sv.preset.name]];
    expect(labels.length).toBe(4 + 5 + 2 + 6 + 3 + 1);
    for (const [en, svText] of labels) expect(svText, en).not.toBe(en);
    expect(sv.glanceColumns).toEqual(['Program', 'Status', 'Slutår']);
    expect(sv.items.flatMap((i) => i.comments.map((c) => c.text))).not.toContain(scenario.items[0].comments[0].text);
    // The language-free parts are the same.
    expect(sv.items.map((i) => [i.item, i.colour, i.position, i.symbol])).toEqual(scenario.items.map((i) => [i.item, i.colour, i.position, i.symbol]));
    expect(sv.annotations.map((a) => a.points)).toEqual(scenario.annotations.map((a) => a.points));
  });

  test('the counterparts run both ways', () => {
    const there = demoCounterparts('en', 'sv');
    const back = demoCounterparts('sv', 'en');
    expect(back.statuses).toEqual(there.statuses.map(([a, b]) => [b, a]));
  });
});
