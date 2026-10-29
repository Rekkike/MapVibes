import { describe, expect, test, vi } from 'vitest';
import { byId, flush, mountApp, pointer, presentationMarkers, STAGE, stubImageDecoding, stubStageLayout } from './harness';
import { demoScenario, demoWorkbook } from '../../src/demo';
import { importColumns, parseWorkbook } from '../../src/ingest';
import { shapeName } from '../../src/legend';
import { SYMBOLS } from '../../src/symbols';
import { strings, type Lang } from '../../src/i18n';

vi.mock('../../src/osmrender', () => ({
  renderPlanToDataUrl: (plan: { width: number; height: number }) => `data:image/png;base64,T1NN${plan.width}x${plan.height}`,
}));

// Interface-language coherence of the demo (FR-41 as amended in v1.3.1):
// everything the application provides follows the interface language, the
// demo's data-carried labels included; everything the user types stays the
// user's own words.

type App = Awaited<ReturnType<typeof mountApp>>;

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await flush();
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
  await settle();
  return app;
}

// Every text of the demo in a language: the list's headers and values, the
// vocabularies, the colour labels, the annotation labels, the comments, and
// the preset's name.
function demoTexts(lang: Lang): Set<string> {
  const scenario = demoScenario(lang);
  const list = importColumns(parseWorkbook(demoWorkbook(lang)));
  return new Set(
    [
      ...list.headers,
      ...list.rows.flatMap((r) => Object.values(r)),
      ...(scenario.preset.areas ?? []),
      ...(scenario.preset.programs ?? []),
      ...(scenario.preset.statuses ?? []).map((s) => s.name),
      ...Object.values(scenario.colourLabels),
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
    if (text !== '' && !n.parentElement?.closest('script, style, #select-language')) out.push(text);
  }
  for (const input of document.querySelectorAll<HTMLInputElement>('input[type="text"], textarea')) {
    if (input.value.trim() !== '') out.push(input.value.trim());
    if (input.placeholder.trim() !== '') out.push(input.placeholder.trim());
  }
  for (const el of document.querySelectorAll('[aria-label], [title]')) {
    for (const attr of ['aria-label', 'title']) {
      const v = el.getAttribute(attr);
      if (v && v.trim() !== '') out.push(v.trim());
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

// Every surface: the Information segment with every panel open, the Map
// segment with the annotation inspector, and the Presentation segment with
// a card.
async function visitEverySurface(): Promise<string[]> {
  const lang = byId<HTMLSelectElement>('select-language').value as Lang;
  const found: string[] = [];
  byId('tab-information').click();
  for (const d of document.querySelectorAll('details')) d.open = true;
  found.push(...foreignShown(lang));
  byId('tab-map').click();
  document.querySelector<HTMLButtonElement>('#annotation-tools [data-tool="select"]')!.click();
  pointer('pointerdown', byId('map-stage'), STAGE.left + 328, STAGE.top + 438);
  pointer('pointerup', byId('map-stage'), STAGE.left + 328, STAGE.top + 438);
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
  const scenario = demoScenario(lang);
  const t = strings(lang);
  const colours = ['green', 'blue', 'yellow', 'red'].map((c) => scenario.colourLabels[c as 'green']!);
  const statuses = scenario.preset.statuses!.map((s) => s.name);
  const symbols = SYMBOLS.map((s) => shapeName(t, s));
  for (const legend of ['map-legend', 'presentation-legend']) {
    expect(legendLabels(legend, 'colour')).toEqual(colours);
    expect(legendLabels(legend, 'shape')).toEqual(symbols);
    expect(legendLabels(legend, 'status')).toEqual(statuses);
  }
  expect(options('#annotation-colour')).toEqual(colours);
  expect(options('#marker-shape')).toEqual(symbols);
  expect(options('#status-list .status-symbol')).toEqual(symbols);
  expect(options('.status-select').slice(1)).toEqual(statuses);
  expect([...document.querySelectorAll<HTMLInputElement>('#status-list .vocab-name')].map((i) => i.value)).toEqual(statuses);
  expect([...document.querySelectorAll<HTMLInputElement>('#colour-label-list input')].map((i) => i.value)).toEqual(colours);
  expect([...document.querySelectorAll<HTMLInputElement>('#symbol-label-list input')].map((i) => i.placeholder)).toEqual(symbols);
  // The preset matches the list's headers, which stay as loaded.
  expect(options('#preset-select')).toContain(demoScenario(loadedIn).preset.name);
}

describe('the demo loads in the interface language (FR-41)', () => {
  test('in Swedish, no provided label or text of the demo appears in English, on any surface', async () => {
    const app = await mountDemo('sv');
    expect(await visitEverySurface()).toEqual([]);
    expectProvided('sv');
    expect(app.captureWorkState().headers).toEqual(demoScenario('sv').preset.headers);
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
    expect(new Set(ws.rows.map((r) => r.values[status]))).toEqual(new Set(demoScenario('en').preset.statuses!.map((s) => s.name)));
    expect(ws.annotations.map((a) => a.label)).toEqual(demoScenario('en').annotations.map((a) => a.label));
    // The headers and the preset that matches them stay as loaded.
    expect(ws.headers).toEqual(demoScenario('sv').preset.headers);
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
    pointer('pointerdown', byId('map-stage'), STAGE.left + 328, STAGE.top + 438);
    pointer('pointerup', byId('map-stage'), STAGE.left + 328, STAGE.top + 438);
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
      expect(options('#marker-shape')[SYMBOLS.indexOf('gear')]).toBe('Mitt kugghjul');
      // The labels not renamed follow the language.
      const scenario = demoScenario(lang);
      expect(ws.colourLabels.green).toBe(scenario.colourLabels.green);
      expect(ws.statuses.slice(1).map((s) => s.name)).toEqual(scenario.preset.statuses!.slice(1).map((s) => s.name));
      expect(ws.areaValues.slice(1)).toEqual(scenario.preset.areas!.slice(1));
      expect(ws.annotations[0].label).toBe(scenario.annotations[0].label);
      expect(legendLabels('map-legend', 'shape')[0]).toBe(shapeName(strings(lang), 'circle'));
    }
  }, 30_000);
});
