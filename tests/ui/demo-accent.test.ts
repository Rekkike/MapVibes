import { beforeEach, describe, expect, test, vi } from 'vitest';
import { byId, flush, markers, mountApp, stubImageDecoding, stubStageLayout } from './harness';

// jsdom has no canvas and the bundled extracts are too large for a jsdom
// parse, so the demo's map text is substituted with the small synthetic
// town fixture, as in the other demo UI suites; the list and the scenario
// are the real fixture.
vi.mock('../../src/osmrender', () => ({
  renderPlanToDataUrl: (plan: { width: number; height: number }) => `data:image/png;base64,T1NN${plan.width}x${plan.height}`,
}));
vi.mock('../../src/demo', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/demo')>();
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const town = readFileSync(join(process.cwd(), 'example-data', 'example-map.osm'), 'utf8');
  return { ...mod, DEMO_MAP_TEXT: town, demoMapText: () => town };
});

// v2.8.0: the Helsingborg demo's OPS item (H-09, the shore-power item)
// carries its accent and the emphasis flag in the fixture's own data, in
// both interface languages, so that every fresh load of the demo draws the
// emphasis marker on the map without a hand touching it, and no other item
// is emphasised.

type App = Awaited<ReturnType<typeof mountApp>>;

async function mount(): Promise<App> {
  return mountApp({
    beforeMain: () => {
      stubStageLayout();
      stubImageDecoding(3000, 2000);
    },
  });
}

async function loadHelsingborg(app: App, lang: 'en' | 'sv'): Promise<void> {
  if (lang !== 'en') {
    const select = byId<HTMLSelectElement>('select-language');
    select.value = lang;
    select.dispatchEvent(new Event('change'));
  }
  await app.loadDemo('helsingborg');
  await flush();
  await flush();
}

describe('the Helsingborg demo freshly loaded (v2.8.0)', () => {
  let app: App;

  beforeEach(async () => {
    app = await mount();
  });

  test('the OPS item carries the bolt as its accent, emphasised, in the work state and on the map, untouched', async () => {
    await loadHelsingborg(app, 'en');
    const ws = app.captureWorkState();
    const idKey = ws.roles.identifier!;
    const opsIndex = ws.rows.findIndex((r) => r.values[idKey] === 'H-09');
    expect(opsIndex).toBeGreaterThanOrEqual(0);
    expect(ws.rows[opsIndex].accent).toBe('bolt');
    expect(ws.rows[opsIndex].emphasis).toBe(true);
    // No other item carries an accent or an emphasis.
    expect(ws.rows.filter((r) => r.accent !== undefined).map((r) => r.values[idKey])).toEqual(['H-09']);
    expect(ws.rows.filter((r) => r.emphasis === true).map((r) => r.values[idKey])).toEqual(['H-09']);
    // On the Map segment's stage, the item's marker is drawn emphasised: the
    // big form in place of the small disc, and it is the only one.
    const emphasised = markers().filter((m) => m.classList.contains('marker-emphasised'));
    expect(emphasised).toHaveLength(1);
    expect(emphasised[0].dataset.accent).toBe('bolt');
    expect(emphasised[0].querySelector(':scope > .marker-accent.marker-emphasis')).not.toBeNull();
    // The legend names it from the vocabulary, in the emphasis form.
    const entry = byId('map-legend').querySelector<HTMLElement>('.legend-entry[data-emphasis="true"]')!;
    expect(entry).not.toBeNull();
    expect(entry.querySelector('.legend-swatch')!.classList.contains('legend-emphasis-swatch')).toBe(true);
    expect(entry.textContent).toBe('OPS quay');
  });

  test('the same in Swedish: OPS kaj, the fixture data consistent across the languages', async () => {
    await loadHelsingborg(app, 'sv');
    const ws = app.captureWorkState();
    const idKey = ws.roles.identifier!;
    const opsIndex = ws.rows.findIndex((r) => r.values[idKey] === 'H-09');
    expect(ws.rows[opsIndex].accent).toBe('bolt');
    expect(ws.rows[opsIndex].emphasis).toBe(true);
    expect(markers().filter((m) => m.classList.contains('marker-emphasised'))).toHaveLength(1);
    const entry = byId('map-legend').querySelector<HTMLElement>('.legend-entry[data-emphasis="true"]')!;
    expect(entry.textContent).toBe('OPS kaj');
  });
});
