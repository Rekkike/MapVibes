import { describe, expect, test } from 'vitest';
import { DEMO_MAP_TEXT, demoCounterparts, demoMapText, demoScenario, demoWorkbook, parseDemoScenarios } from '../../src/demo';
import { importColumns, parseWorkbook } from '../../src/ingest';
import { readDate } from '../../src/dates';
import scenarioJson from '../../example-data/demo-scenario.json';
import helsingborgScenarioJson from '../../example-data/helsingborg-scenario.json';

const list = importColumns(parseWorkbook(demoWorkbook('parkland')));
const scenario = demoScenario('parkland');

describe('full-test demo fixtures (FR-41)', () => {
  test('the demo list is about a dozen items under the preset headers', () => {
    expect(list.rows.length).toBe(12);
    expect(list.headers).toEqual(scenario.preset.headers);
    expect(list.rows[0]).toMatchObject({ Item: 'D-01', 'Start year': '2026', 'End year': '2028' });
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

  test('the background is the parkland extract with its recorded bounds', () => {
    // v2.3.0, re-cut by the fix-forward: the demo background is the
    // Slottskogen-only landscape extract (example-data/demo-map.osm, 6.99 MiB,
    // bounds 57.6788 / 11.9278 / 57.6952 / 11.9662, centred on Villa Belparc).
    // Its full parse and render through the application is pinned by the
    // browser suites, which load the demo in headless Chromium; a jsdom
    // DOMParser over the extract takes minutes, so this unit pin reads the
    // recorded facts from the text.
    expect(DEMO_MAP_TEXT).toMatch(/<bounds minlat="57\.6788" minlon="11\.9278" maxlat="57\.6952" maxlon="11\.9662"\/>/);
    expect(DEMO_MAP_TEXT.match(/<node /g)).toHaveLength(62488);
    expect(DEMO_MAP_TEXT.match(/<way /g)).toHaveLength(9144);
  });

  test('a damaged scenario is refused as a whole', () => {
    const bad = (mutate: (o: any) => void) => {
      const o = JSON.parse(JSON.stringify(scenarioJson));
      mutate(o);
      return () => parseDemoScenarios(o);
    };
    expect(bad(() => undefined)).not.toThrow();
    expect(bad((o) => (o.version = 2))).toThrow();
    // Since v2.6.0 the demos carry no colour labels of their own (they ride
    // the default vocabulary, FR-45 as amended); labels that are given are
    // still checked.
    expect(bad((o) => (o.colourLabels = { en: { purple: 'Odd' }, sv: { purple: 'Udda' } }))).toThrow();
    expect(bad((o) => (o.colourLabels = { en: { green: 'Ours' }, sv: { green: ' ' } }))).toThrow();
    expect(bad((o) => (o.colourLabels = { en: { green: 'Ours', red: 'Theirs' }, sv: { green: 'Våra' } }))).toThrow();
    expect(bad((o) => (o.colourLabels = { en: { green: 'Ours' }, sv: { green: 'Våra' } }))).not.toThrow();
    expect(bad((o) => (o.glanceColumns.en = ['Nowhere']))).toThrow();
    expect(bad((o) => (o.glanceColumns.sv = ['Programme']))).toThrow();
    expect(bad((o) => delete o.preset.sv)).toThrow();
    expect(bad((o) => o.preset.sv.areas.pop())).toThrow();
    expect(bad((o) => (o.preset.sv.statuses[0].symbol = 'gear'))).toThrow();
    expect(bad((o) => (o.preset.sv.roles.start = 'Slutår'))).toThrow();
    expect(bad((o) => (o.items[0].comments[0].text = 'One language only'))).toThrow();
    expect(bad((o) => (o.annotations[0].label = { en: 'Footprint' }))).toThrow();
    expect(bad((o) => (o.annotations[0].kind = 'star'))).toThrow();
    expect(
      bad(
        (o) =>
          (o.annotations[0].points = [
            [0.1, 0.1],
            [0.2, 0.2],
          ]),
      ),
    ).toThrow();
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
    for (const row of list.rows) {
      if (row.Programme !== '') {
        byProgram.set(row.Programme, (byProgram.get(row.Programme) ?? new Set()).add(row.Area));
      }
    }
    expect([...byProgram.keys()].sort()).toEqual(scenario.preset.programs);
    for (const areas of byProgram.values()) {
      expect(areas.size).toBeGreaterThanOrEqual(3);
    }
    expect(list.rows.filter((r) => r.Programme === '').length).toBeGreaterThanOrEqual(3);
  });

  test('the demo rides the default vocabulary (no colour labels of its own), and the panel columns are configured', () => {
    expect(scenario.colourLabels).toEqual({});
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
  const sv = demoScenario('parkland', 'sv');
  const svList = importColumns(parseWorkbook(demoWorkbook('parkland', 'sv')));

  test('the Swedish list is the same items under the Swedish preset headers', () => {
    expect(svList.headers).toEqual(sv.preset.headers);
    expect(svList.rows.map((r) => r.Objekt)).toEqual(list.rows.map((r) => r.Item));
    expect(svList.rows[0]).toMatchObject({ Objekt: 'D-01', Startår: '2026', Slutår: '2028', Status: 'Klar' });
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
    const c = demoCounterparts('parkland', 'en', 'sv');
    list.rows.forEach((row, i) => {
      expect(c.statuses.find(([from]) => from === row.Status)![1]).toBe(svList.rows[i].Status);
      if (row.Area !== '') {
        expect(c.areas.find(([from]) => from === row.Area)![1]).toBe(svList.rows[i].Område);
      }
      if (row.Programme !== '') {
        expect(c.programs.find(([from]) => from === row.Programme)![1]).toBe(svList.rows[i].Program);
      }
    });
  });

  test('every provided label has its own Swedish text', () => {
    const c = demoCounterparts('parkland', 'en', 'sv');
    const labels = [
      ...c.colourLabels.map((l) => [l.from, l.to]),
      ...c.areas,
      ...c.programs,
      ...c.statuses,
      ...c.annotationLabels,
      [scenario.preset.name, sv.preset.name],
    ];
    // The colour labels are the default vocabulary's since v2.6.0, not the demo's.
    expect(c.colourLabels).toEqual([]);
    expect(labels.length).toBe(5 + 2 + 6 + 3 + 1);
    for (const [en, svText] of labels) {
      expect(svText, en).not.toBe(en);
    }
    expect(sv.glanceColumns).toEqual(['Program', 'Status', 'Slutår']);
    expect(sv.items.flatMap((i) => i.comments.map((c) => c.text))).not.toContain(scenario.items[0].comments[0].text);
    // The language-free parts are the same.
    expect(sv.items.map((i) => [i.item, i.colour, i.position, i.symbol])).toEqual(scenario.items.map((i) => [i.item, i.colour, i.position, i.symbol]));
    expect(sv.annotations.map((a) => a.points)).toEqual(scenario.annotations.map((a) => a.points));
  });

  test('the counterparts run both ways', () => {
    const there = demoCounterparts('parkland', 'en', 'sv');
    const back = demoCounterparts('parkland', 'sv', 'en');
    expect(back.statuses).toEqual(there.statuses.map(([a, b]) => [b, a]));
  });

  // FR-41 as amended in v1.11.0, FR-80.
  test('the demo carries two fictional events, a review date and a decision date, in both languages', () => {
    expect(demoScenario('parkland', 'en').events).toEqual([
      { date: '2031-06', label: 'Review' },
      { date: '2033-03-15', label: 'Decision' },
    ]);
    expect(demoScenario('parkland', 'sv').events).toEqual([
      { date: '2031-06', label: 'Granskning' },
      { date: '2033-03-15', label: 'Beslut' },
    ]);
    expect(demoCounterparts('parkland', 'en', 'sv').eventLabels).toEqual([
      ['Review', 'Granskning'],
      ['Decision', 'Beslut'],
    ]);
  });

  test('an event with a date that cannot be read, or without a label in a language, is refused', () => {
    const damaged = (change: (events: Array<Record<string, unknown>>) => void) => {
      const raw = JSON.parse(JSON.stringify(scenarioJson));
      change(raw.events);
      return raw;
    };
    expect(() => parseDemoScenarios(damaged((e) => (e[0].date = '15/03/2031')))).toThrow(/events\[0\].date/);
    expect(() => parseDemoScenarios(damaged((e) => (e[1].label = { en: 'Decision' })))).toThrow(/events\[1\].label.sv/);
  });

  // FR-41 as amended in v1.12.0: the refinement's fixtures.
  test('the project with eight activities has a work phase, its excavation, in both languages', () => {
    for (const [lang, label] of [
      ['en', 'Excavation'],
      ['sv', 'Schaktning'],
    ] as const) {
      const item = demoScenario('parkland', lang).items.find((i) => i.item === 'D-05')!;
      expect(item.activities).toHaveLength(8);
      expect(item.workPhase).toBe('a3');
      expect(item.activities![2].label).toBe(label);
    }
    // No other item has one.
    expect(
      demoScenario('parkland')
        .items.filter((i) => i.workPhase !== undefined)
        .map((i) => i.item),
    ).toEqual(['D-05']);
  });

  test('one activity is corrected by hand: the review whose date could not be read is mended and marked; no activity has an unreadable date any more', () => {
    for (const [lang, label] of [
      ['en', 'Review'],
      ['sv', 'Granskning'],
    ] as const) {
      const review = demoScenario('parkland', lang).items.find((i) => i.item === 'D-11')!.activities![1];
      expect(review).toEqual({ label, start: '2031-12-15', end: '2032-06-30', progress: 10, edited: true });
    }
    const all = demoScenario('parkland').items.flatMap((i) => i.activities ?? []);
    expect(all.filter((a) => a.edited)).toHaveLength(1);
    expect(all.every((a) => readDate(a.start).kind === 'date' && readDate(a.end).kind === 'date')).toBe(true);
  });

  test('a work phase that names no activity of its item, and an edited mark that is not true, are refused', () => {
    const damaged = (change: (items: Array<Record<string, any>>) => void) => {
      const raw = JSON.parse(JSON.stringify(scenarioJson));
      change(raw.items);
      return raw;
    };
    const d05 = (items: Array<Record<string, any>>) => items.find((i) => i.item === 'D-05')!;
    expect(() => parseDemoScenarios(damaged((items) => (d05(items).workPhase = 'a9')))).toThrow(/workPhase/);
    expect(() => parseDemoScenarios(damaged((items) => (items.find((i) => !i.activities)!.workPhase = 'a1')))).toThrow(/workPhase/);
    expect(() => parseDemoScenarios(damaged((items) => (d05(items).activities[0].edited = 'yes')))).toThrow(/edited/);
  });
});

describe('the Helsingborg demo fixtures (v2.4.0, the rule-7 exception)', () => {
  const hList = importColumns(parseWorkbook(demoWorkbook('helsingborg', 'sv')));
  const hListEn = importColumns(parseWorkbook(demoWorkbook('helsingborg', 'en')));
  const hScenario = demoScenario('helsingborg');
  const hScenarioSv = demoScenario('helsingborg', 'sv');

  test('the list is thirteen items under the preset headers, in both languages, Swedish-first', () => {
    expect(hList.rows.length).toBe(13);
    expect(hList.headers).toEqual(hScenarioSv.preset.headers);
    expect(hListEn.headers).toEqual(hScenario.preset.headers);
    expect(hList.rows[0]).toMatchObject({ Objekt: 'H-00' });
    expect(hListEn.rows[0]).toMatchObject({ Item: 'H-00' });
    expect(hList.rows.map((r) => r.Objekt)).toEqual(hScenario.items.map((i) => i.item));
  });

  test('the preset assigns every role, carries the vocabularies, the series, and kr', () => {
    expect(Object.keys(hScenario.preset.roles).sort()).toEqual(['area', 'end', 'identifier', 'name', 'note', 'program', 'start', 'status']);
    expect(hScenario.preset.areas).toEqual([
      'West Harbour (current terminal)',
      'Southern harbour site (new terminal)',
      'Gåsebäck (Kemira land)',
      'Öresund (fairway)',
      'Planteringen, Söder',
    ]);
    expect(hScenario.preset.currencyUnit).toBe('kr');
    expect(Object.keys(hScenario.preset.series!.budget!.columns)).toHaveLength(9);
  });

  test('the real figures are carried as data, with the as-of date in the about item', () => {
    const h10 = hList.rows.find((r) => r.Objekt === 'H-10')!;
    expect(h10['Budget 2025']).toBe('2600000000');
    expect(h10['Prognos 2026']).toBe('3400000000');
    const h00 = hList.rows.find((r) => r.Objekt === 'H-00')!;
    expect(h00.Anteckning).toContain('2026-11-17');
    const h05 = hList.rows.find((r) => r.Objekt === 'H-05')!;
    expect(h05.Kajdjup).toContain('15 m');
    expect(h05.Kajdjup).toContain('13 m');
    expect(h05.Fartygsklass).toContain('Post-Panamax');
    const h09 = hList.rows.find((r) => r.Objekt === 'H-09')!;
    expect(h09.Anteckning).toContain('8 000 t CO2');
    const h07 = hList.rows.find((r) => r.Objekt === 'H-07')!;
    expect(h07.Anteckning).toContain('6 STS-kranar');
  });

  test('the arrangement: twelve placed on real features, one not placed, all fractions within the extent, three annotations, two events', () => {
    const placed = hScenario.items.filter((i) => i.position);
    expect(placed.length).toBe(12);
    expect(hScenario.items.filter((i) => !i.position).map((i) => i.item)).toEqual(['H-00']);
    for (const i of placed) {
      expect(i.position![0]).toBeGreaterThanOrEqual(0);
      expect(i.position![0]).toBeLessThanOrEqual(1);
      expect(i.position![1]).toBeGreaterThanOrEqual(0);
      expect(i.position![1]).toBeLessThanOrEqual(1);
    }
    expect(new Set(hScenario.items.map((i) => i.colour)).size).toBe(4);
    expect(
      hScenario.items
        .filter((i) => i.symbol)
        .map((i) => i.symbol)
        .sort(),
    ).toEqual(['bolt', 'diamond', 'square']);
    expect(hScenario.annotations.length).toBe(3);
    expect(hScenario.annotations.map((a) => a.link).sort()).toEqual(['H-05', 'H-08', 'H-09']);
    expect(hScenario.events.map((e) => e.date)).toEqual(['2026-04-21', '2026-09-23']);
    // The quay-depth and vessel-class columns are data, never computed: they
    // exist as plain columns and no role is assigned to them.
    expect(Object.values(hScenario.preset.roles)).not.toContain('Quay depth');
    expect(Object.values(hScenario.preset.roles)).not.toContain('Vessel class');
  });

  test('the scenario parses in both languages and the damaged forms are refused', () => {
    expect(parseDemoScenarios(helsingborgScenarioJson).sv.items.length).toBe(13);
    const bad = (mutate: (o: any) => void) => {
      const o = JSON.parse(JSON.stringify(helsingborgScenarioJson));
      mutate(o);
      return () => parseDemoScenarios(o);
    };
    expect(bad(() => undefined)).not.toThrow();
    expect(bad((o) => (o.version = 2))).toThrow();
    expect(bad((o) => (o.items[5].position = [1.2, 0.5]))).toThrow();
    expect(bad((o) => (o.annotations[1].link = 'H-99'))).toThrow();
    expect(bad((o) => delete o.preset.en)).toThrow();
  });

  test('the background is the Helsingborg south extract with its recorded bounds', () => {
    // v2.4.0 Unit 1: cut per docs/v2.3.0-extract-counsel.md in six tiled
    // /api/0.6/map calls; kept to the eight FR-31 selectors, metadata
    // stripped, so it equals an in-app fetch of the same area. The full
    // parse and render is pinned by the browser suites; this unit pin reads
    // the recorded facts from the text.
    const text = demoMapText('helsingborg');
    expect(text).toMatch(/<bounds minlat="56\.0220" minlon="12\.6780" maxlat="56\.0460" maxlon="12\.7140"\/>/);
    expect(text.match(/<node /g)).toHaveLength(19488);
    expect(text.match(/<way /g)).toHaveLength(3066);
  });
});
