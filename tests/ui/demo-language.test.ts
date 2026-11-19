import { describe, expect, test, vi } from 'vitest';
import { byId, flush, importExampleWorkbook, mountApp, pointer, presentationMarkers, STAGE, stubImageDecoding, stubStageLayout } from './harness';
import { demoScenario, demoWorkbook } from '../../src/demo';
import { importColumns, parseWorkbook } from '../../src/ingest';
import { shapeName } from '../../src/legend';
import { SYMBOLS } from '../../src/symbols';
import { strings, type Lang } from '../../src/i18n';
import { starterColourLabels, starterSymbolLabels } from '../../src/starter';

vi.mock('../../src/osmrender', () => ({
  renderPlanToDataUrl: (plan: { width: number; height: number }) => `data:image/png;base64,T1NN${plan.width}x${plan.height}`,
}));

// v2.3.0: the demo's map text is now the parkland extract (demo-map.osm,
// 6.36 MiB, 154k XML elements). A jsdom DOMParser over it needs more memory
// than the test runners have (the worker is OOM-killed), so in the jsdom UI
// tests the demo's map text is substituted with the small synthetic town
// fixture; the real extract's parse and render is pinned by the unit pin
// (tests/unit/demo.test.ts) and by every browser suite, which loads the built
// application natively (the whole demo load measures 1.7 s there).
vi.mock('../../src/demo', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/demo')>();
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const town = readFileSync(join(process.cwd(), 'example-data', 'example-map.osm'), 'utf8');
  return { ...mod, DEMO_MAP_TEXT: town, demoMapText: () => town };
});

// Interface-language coherence of the demo (FR-41 as amended in v1.3.1):
// everything the application provides follows the interface language, the
// demo's data-carried labels included; everything the user types stays the
// user's own words.

type App = Awaited<ReturnType<typeof mountApp>>;

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await flush();
  }
}

function setLanguage(lang: Lang): void {
  const select = byId<HTMLSelectElement>('select-language');
  select.value = lang;
  select.dispatchEvent(new Event('change'));
}

async function mountDemo(lang: Lang): Promise<App> {
  const app = await mountApp({
    singleFile: true,
    beforeMain: () => {
      stubStageLayout();
      stubImageDecoding(3000, 2000);
    },
  });
  setLanguage(lang);
  byId('load-demo').click();
  byId('demo-go').click();
  await settle();
  return app;
}

// Every text of the demo in a language: the list's headers and values, the
// vocabularies, the colour labels, the annotation labels, the comments, and
// the preset's name.
function demoTexts(lang: Lang): Set<string> {
  const scenario = demoScenario('parkland', lang);
  const list = importColumns(parseWorkbook(demoWorkbook('parkland', lang)));
  return new Set(
    [
      ...list.headers,
      ...list.rows.flatMap((r) => Object.values(r)),
      ...(scenario.preset.areas ?? []),
      ...(scenario.preset.programs ?? []),
      ...(scenario.preset.statuses ?? []).map((s) => s.name),
      ...Object.values(scenario.colourLabels),
      // Since v2.6.0 the demo rides the default vocabulary (FR-45, FR-54 as
      // amended): its names are texts of the language too.
      ...Object.values(starterColourLabels(lang)),
      ...Object.values(starterSymbolLabels(lang)),
      ...scenario.annotations.map((a) => a.label),
      ...scenario.items.flatMap((i) => i.comments.map((c) => c.text)),
      scenario.preset.name,
    ].map((v) => String(v).trim()),
  );
}

// The demo texts of the other language that this language does not share
// (identifiers, years, and words spelt the same, such as Status, are shared).
function foreignTexts(lang: Lang): string[] {
  const own = demoTexts(lang);
  return [...demoTexts(lang === 'sv' ? 'en' : 'sv')].filter((t) => t !== '' && !own.has(t));
}

// Every text shown: text nodes, option texts, field values, and placeholders.
function shown(): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = (n.textContent ?? '').trim();
    if (text !== '' && !n.parentElement?.closest('script, style, #select-language')) {
      out.push(text);
    }
  }
  for (const input of document.querySelectorAll<HTMLInputElement>('input[type="text"], textarea')) {
    if (input.value.trim() !== '') {
      out.push(input.value.trim());
    }
    if (input.placeholder.trim() !== '') {
      out.push(input.placeholder.trim());
    }
  }
  for (const el of document.querySelectorAll('[aria-label], [title]')) {
    for (const attr of ['aria-label', 'title']) {
      const v = el.getAttribute(attr);
      if (v && v.trim() !== '') {
        out.push(v.trim());
      }
    }
  }
  return out;
}

// A foreign text shown on its own or as a whole word in a longer text; a
// word the interface itself uses in this language (Swedish "area") is not
// the demo's.
function foreignShown(lang: Lang): string[] {
  const interfaceWords = new Set(Object.values(strings(lang)).flatMap((v) => String(v).split(/[^\p{L}]+/u)));
  const foreign = foreignTexts(lang).filter((f) => !interfaceWords.has(f));
  const escape = (f: string) => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const within = (t: string, f: string) => new RegExp(`(^|[^\\p{L}])${escape(f)}($|[^\\p{L}])`, 'u').test(t);
  return [...new Set(shown().filter((t) => foreign.some((f) => within(t, f))))];
}

// A press on the free rectangle's centre, computed from the shape's own
// geometry through the map's current transform (v2.3.0: the parkland
// background moved the rectangle, so the press point is no longer a
// hardcoded stage offset).
function pressRectangle(): void {
  const rect = document.querySelector('#map-annotations g.annotation-rectangle rect') as SVGRectElement;
  const cx = Number(rect.getAttribute('x')) + Number(rect.getAttribute('width')) / 2;
  const cy = Number(rect.getAttribute('y')) + Number(rect.getAttribute('height')) / 2;
  const m = /translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([\d.]+)\)/.exec(byId('map-content').style.transform)!;
  const x = STAGE.left + Number(m[1]) + Number(m[3]) * cx;
  const y = STAGE.top + Number(m[2]) + Number(m[3]) * cy;
  pointer('pointerdown', byId('map-stage'), x, y);
  pointer('pointerup', byId('map-stage'), x, y);
}

// Every surface: the Information segment with every panel open, the Map
// segment with the annotation inspector, and the Presentation segment with
// a card.
async function visitEverySurface(): Promise<string[]> {
  const lang = byId<HTMLSelectElement>('select-language').value as Lang;
  const found: string[] = [];
  byId('tab-information').click();
  for (const d of document.querySelectorAll('details')) {
    d.open = true;
  }
  found.push(...foreignShown(lang));
  byId('tab-map').click();
  document.querySelector<HTMLButtonElement>('#annotation-tools [data-tool="select"]')!.click();
  pressRectangle();
  expect(byId('annotation-inspector').classList.contains('hidden')).toBe(false);
  found.push(...foreignShown(lang));
  byId('tab-presentation').click();
  await flush();
  const m = presentationMarkers()[6];
  pointer('pointerdown', m, STAGE.left + parseFloat(m.style.left), STAGE.top + parseFloat(m.style.top));
  pointer('pointerup', m, STAGE.left + parseFloat(m.style.left), STAGE.top + parseFloat(m.style.top));
  found.push(...foreignShown(lang));
  byId('tab-information').click();
  return [...new Set(found)];
}

function legendLabels(id: string, section: 'colour' | 'shape' | 'status'): string[] {
  return [...byId(id).querySelectorAll<HTMLElement>(`.legend-entry[data-${section}]`)]
    .filter((li) => section !== 'shape' || li.dataset.status === undefined)
    .map((li) => li.querySelector('.legend-label')!.textContent ?? '');
}

function options(selector: string): string[] {
  return [...document.querySelector<HTMLSelectElement>(selector)!.options].map((o) => o.textContent ?? '');
}

// The provided labels shown where the finding saw English: the legends, the
// pickers, and the status-symbol assignment.
function expectProvided(lang: Lang, loadedIn: Lang = lang): void {
  const scenario = demoScenario('parkland', lang);
  const t = strings(lang);
  // The demo rides the default vocabulary (FR-45 and FR-54 as amended in
  // v2.6.0): the colours carry its names, and the pickers name each symbol by
  // its label beside its own name, an unnamed one by its own name.
  const starter = starterSymbolLabels(lang);
  const colours = Object.values(starterColourLabels(lang));
  const statuses = scenario.preset.statuses!.map((s) => s.name);
  const symbols = SYMBOLS.map((s) => (starter[s] ? `${starter[s]} (${shapeName(t, s)})` : shapeName(t, s)));
  // The Map segment's palette of symbols: the named symbols whose glyph the
  // statuses line does not show (FR-75 as amended in v2.6.0); the statuses
  // use the light bulb, the magnifying glass, the hammer and shovel, the
  // pause bars, the cross, and the checkmark.
  const named = [starter.gear!, starter.bolt!];
  // The Map segment's legend keeps the whole working palette (FR-6 as
  // amended in v1.9.0); the presentation's is used-only (FR-75), so every
  // entry it shows is one of the full lists in the same language, and the
  // demo's visible items carry all four colours.
  expect(legendLabels('map-legend', 'colour')).toEqual(colours);
  expect(legendLabels('map-legend', 'shape')).toEqual(named);
  expect(legendLabels('map-legend', 'status')).toEqual(statuses);
  expect(legendLabels('presentation-legend', 'colour')).toEqual(colours);
  for (const kind of ['shape', 'status'] as const) {
    const shown = legendLabels('presentation-legend', kind);
    // The demo's markers show their statuses' glyphs, explained by the
    // statuses line alone.
    expect(shown.length).toBeGreaterThan(kind === 'status' ? 0 : -1);
    for (const label of shown) {
      expect(kind === 'shape' ? named : statuses).toContain(label);
    }
  }
  expect(options('#annotation-colour')).toEqual(colours);
  expect(options('#marker-shape')).toEqual(symbols);
  expect(options('#status-list .status-symbol')).toEqual(symbols);
  expect(options('.status-select').slice(1)).toEqual(statuses);
  expect([...document.querySelectorAll<HTMLInputElement>('#status-list .vocab-name')].map((i) => i.value)).toEqual(statuses);
  expect([...document.querySelectorAll<HTMLInputElement>('#colour-label-list input')].map((i) => i.value)).toEqual(colours);
  expect([...document.querySelectorAll<HTMLInputElement>('#symbol-label-list input')].map((i) => i.value)).toEqual(SYMBOLS.map((s) => starter[s] ?? ''));
  expect([...document.querySelectorAll<HTMLInputElement>('#symbol-label-list input')].every((i) => i.placeholder === t.symbolUnnamed)).toBe(true);
  // The preset matches the list's headers, which stay as loaded.
  expect(options('#preset-select')).toContain(demoScenario('parkland', loadedIn).preset.name);
}

describe('the demo loads in the interface language (FR-41)', () => {
  test('in Swedish, no provided label or text of the demo appears in English, on any surface', async () => {
    const app = await mountDemo('sv');
    expect(await visitEverySurface()).toEqual([]);
    expectProvided('sv');
    expect(app.captureWorkState().headers).toEqual(demoScenario('parkland', 'sv').preset.headers);
  }, 30_000);

  test('in English, none appears in Swedish', async () => {
    await mountDemo('en');
    expect(await visitEverySurface()).toEqual([]);
    expectProvided('en');
  }, 30_000);
});

describe('a change of language while the demo is loaded (FR-41)', () => {
  test('the provided labels not renamed follow, in every surface, both ways', async () => {
    const app = await mountDemo('sv');
    setLanguage('en');
    expectProvided('en', 'sv');
    // The cells follow their vocabulary values.
    const ws = app.captureWorkState();
    const status = ws.roles.status!;
    expect(new Set(ws.rows.map((r) => r.values[status]))).toEqual(new Set(demoScenario('parkland', 'en').preset.statuses!.map((s) => s.name)));
    expect(ws.annotations.map((a) => a.label)).toEqual(demoScenario('parkland', 'en').annotations.map((a) => a.label));
    // The headers and the preset that matches them stay as loaded.
    expect(ws.headers).toEqual(demoScenario('parkland', 'sv').preset.headers);
    expect(ws.presets.map((p) => p.name)).toEqual(['Demokolumner']);
    setLanguage('sv');
    expectProvided('sv');
  }, 30_000);

  test('following the language is not a change of the user: an untouched demo resets without asking', async () => {
    await mountDemo('sv');
    setLanguage('en');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    byId('demo-reset').click();
    await settle();
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
    // The reset demo is in the interface language.
    expectProvided('en');
    // Loading it in English replaced the unchanged Swedish demo preset.
    expect(options('#preset-select').slice(1)).toEqual(['Demo columns']);
  }, 30_000);

  test('labels the user typed stay as typed under either language', async () => {
    const app = await mountDemo('sv');
    // A colour label, a status, an area, and a symbol label typed by the user.
    const typed = (selector: string, value: string) => {
      const input = document.querySelector<HTMLInputElement>(selector)!;
      input.value = value;
      input.dispatchEvent(new Event('change'));
    };
    typed('#colour-label-list input[data-colour="blue"]', 'Mitt eget blått');
    typed('#status-list .vocab-name', 'Min egen status');
    typed('#area-list .vocab-name', 'Mitt område');
    typed('#symbol-label-list input[data-symbol="gear"]', 'Mitt kugghjul');
    // An annotation label typed by the user: the free rectangle's.
    byId('tab-map').click();
    document.querySelector<HTMLButtonElement>('#annotation-tools [data-tool="select"]')!.click();
    pressRectangle();
    const label = byId<HTMLInputElement>('annotation-label');
    label.value = 'Min zon';
    label.dispatchEvent(new Event('input'));
    label.dispatchEvent(new Event('change'));
    for (const lang of ['en', 'sv', 'en'] as const) {
      setLanguage(lang);
      const ws = app.captureWorkState();
      expect(ws.colourLabels.blue).toBe('Mitt eget blått');
      expect(ws.statuses[0].name).toBe('Min egen status');
      expect(ws.areaValues[0]).toBe('Mitt område');
      expect(ws.symbolLabels.gear).toBe('Mitt kugghjul');
      expect(ws.annotations[1].label).toBe('Min zon');
      expect(legendLabels('map-legend', 'colour')[1]).toBe('Mitt eget blått');
      expect(legendLabels('map-legend', 'status')[0]).toBe('Min egen status');
      expect(options('#marker-shape')[SYMBOLS.indexOf('gear')]).toBe(`Mitt kugghjul (${shapeName(strings(lang), 'gear')})`);
      // The labels not renamed follow the language.
      const scenario = demoScenario('parkland', lang);
      expect(ws.colourLabels.green).toBe(starterColourLabels(lang).green);
      expect(ws.statuses.slice(1).map((s) => s.name)).toEqual(scenario.preset.statuses!.slice(1).map((s) => s.name));
      expect(ws.areaValues.slice(1)).toEqual(scenario.preset.areas!.slice(1));
      expect(ws.annotations[0].label).toBe(scenario.annotations[0].label);
      expect(legendLabels('map-legend', 'shape')).toEqual(['Mitt kugghjul', starterSymbolLabels(lang).bolt]);
    }
  }, 30_000);

  // FR-41 as amended in v1.11.0: the demo's two fictional events.
  test('the demo loads its two events in the interface language; unrenamed, they follow a change of language', async () => {
    const app = await mountDemo('sv');
    expect(app.captureWorkState().events).toEqual([
      { id: 'e1', date: '2031-06', label: 'Granskning' },
      { id: 'e2', date: '2033-03-15', label: 'Beslut' },
    ]);
    setLanguage('en');
    expect(app.captureWorkState().events.map((e) => e.label)).toEqual(['Review', 'Decision']);
    // A label the user typed is kept as typed.
    const label = document.querySelector<HTMLInputElement>('#event-list .event-label')!;
    label.value = 'My own review';
    label.dispatchEvent(new Event('change'));
    setLanguage('sv');
    expect(app.captureWorkState().events.map((e) => e.label)).toEqual(['My own review', 'Beslut']);
  }, 30_000);

  test("the demo's events are drawn in both schedule views, and discarded with the demo", async () => {
    const app = await mountDemo('en');
    byId('tab-presentation').click();
    for (const view of ['timeline', 'costs']) {
      byId(`pres-mode-${view}`).click();
      expect([...document.querySelectorAll(`#presentation-${view} .timeline-event-chip`)].map((c) => c.textContent)).toEqual(['Review', 'Decision']);
    }
    byId('tab-information').click();
    window.confirm = () => true;
    await importExampleWorkbook();
    await settle();
    expect(app.captureWorkState().events).toEqual([]);
  }, 30_000);

  // FR-41 as amended in v1.12.0: the work phase and the hand correction.
  test('the demo loads its work phase and its hand-corrected activity, in both languages; the timeline and its legend show the phase', async () => {
    for (const [lang, excavation, review, entry] of [
      ['en', 'Excavation', 'Review', 'Work phase'],
      ['sv', 'Schaktning', 'Granskning', 'Arbetsfas'],
    ] as const) {
      const app = await mountDemo(lang);
      const ws = app.captureWorkState();
      const id = ws.roles.identifier!;
      const row = (item: string) => ws.rows.find((r) => r.values[id] === item)!;
      expect(row('D-05').workPhase).toBe('a3');
      expect(row('D-05').activities![2]).toMatchObject({ id: 'a3', label: excavation });
      expect(row('D-11').activities![1]).toEqual({ id: 'a2', edited: true, label: review, start: '2031-12-15', end: '2032-06-30', progress: 10 });
      expect(ws.rows.filter((r) => r.workPhase !== undefined)).toHaveLength(1);
      byId('tab-presentation').click();
      byId('pres-mode-timeline').click();
      await settle();
      const bands = [...document.querySelectorAll<HTMLElement>('#presentation-timeline .timeline-phase')];
      expect(bands).toHaveLength(1);
      expect(bands[0].title).toBe(`${entry}: ${excavation}`);
      expect(byId('presentation-legend').querySelector('.legend-group[data-kind="phase"] .legend-group-label')!.textContent).toBe(entry);
      // The mended review now has its segment, marked as edited.
      expect(document.querySelectorAll('#presentation-timeline .timeline-seg[data-edited="true"]')).toHaveLength(1);
    }
  }, 60_000);
});
