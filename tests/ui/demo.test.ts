import { beforeEach, describe, expect, test, vi } from 'vitest';
import { byId, editCell, flush, importExampleWorkbook, markers, mountApp, presentationMarkers, stubImageDecoding, stubStageLayout } from './harness';

// jsdom has no canvas: the drawing of the town map is replaced by a stand-in
// returning a data URL; parsing and planning are the real code.
vi.mock('../../src/osmrender', () => ({
  renderPlanToDataUrl: (plan: { width: number; height: number }) => `data:image/png;base64,T1NN${plan.width}x${plan.height}`,
}));

type App = Awaited<ReturnType<typeof mountApp>>;

async function mount(): Promise<App> {
  const app = await mountApp({
    beforeMain: () => {
      stubStageLayout();
      stubImageDecoding(3000, 2000);
    },
  });
  return app;
}

async function load(): Promise<void> {
  byId('load-demo').click();
  await flush();
}

function roles(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const select of document.querySelectorAll<HTMLSelectElement>('#row-table-head .role-select')) if (select.value) out[select.dataset.header!] = select.value;
  return out;
}

describe('full-test demo (FR-41)', () => {
  let app: App;

  beforeEach(async () => {
    app = await mount();
  });

  test('the demo action sits beside the empty list, explained as fictional example data', () => {
    expect(byId('load-demo').textContent).toBe('Load demo');
    expect(byId('demo-hint').textContent).toContain('fictional example scenario');
    expect(byId('demo-badge').classList.contains('hidden')).toBe(true);
  });

  test('one click loads the complete scenario', async () => {
    await load();
    // The list and every role, applied by the saved demo preset.
    expect(document.querySelectorAll('#row-table-body tr')).toHaveLength(12);
    expect(roles()).toEqual({ Item: 'identifier', Name: 'name', Area: 'area', Programme: 'program', Status: 'status', 'Start year': 'start', 'End year': 'end', Note: 'note' });
    expect(byId('preset-status').textContent).toBe('The preset "Demo columns" matches these columns and was applied automatically.');
    expect(JSON.parse(localStorage.getItem('mapvibes.presets')!).map((p: { name: string }) => p.name)).toContain('Demo columns');
    // The vocabularies and the toggle.
    expect([...document.querySelectorAll('#area-list li')].length).toBe(5);
    expect([...document.querySelectorAll('#status-list li')].length).toBe(6);
    expect([...document.querySelectorAll('#program-list li')].length).toBe(2);
    expect(byId<HTMLInputElement>('symbols-from-status').checked).toBe(true);
    // The background, the markers (one item is left to place), their symbols.
    expect(byId('map-stage').dataset.hasBackground).toBe('true');
    expect(byId<HTMLImageElement>('map-image').getAttribute('src')).toBe('data:image/png;base64,T1NN3000x2000');
    expect(markers()).toHaveLength(11);
    expect(markers().map((m) => m.dataset.shape)).toEqual(['check', 'hammer-shovel', 'bulb', 'diamond', 'hammer-shovel', 'pause', 'check', 'cross', 'square', 'bolt', 'magnifier']);
    expect(new Set(markers().map((m) => m.dataset.colour))).toEqual(new Set(['green', 'blue', 'yellow', 'red']));
    expect(document.querySelectorAll('.placement-item[data-placed="false"]')).toHaveLength(1);
    // It opens in the Map segment, labelled as example data, as unsaved work.
    expect(byId('segment-map').classList.contains('hidden')).toBe(false);
    expect(byId('demo-badge').classList.contains('hidden')).toBe(false);
    expect(byId('demo-badge').textContent).toBe('Demo: fictional example data');
    expect(byId('work-status').textContent).toContain('fictional example data');
    expect(byId('work-dirty').classList.contains('hidden')).toBe(false);
  });

  test('comments, start and end years, and the presentation are ready', async () => {
    await load();
    markers()[0].dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    expect(byId('details-panel').querySelector('.details-title')!.textContent).toBe('North gate');
    expect([...byId('details-panel').querySelectorAll('.details-comment-text')].map((n) => n.textContent)).toEqual(['Finished as planned.', 'Final check done.']);
    const value = (h: string) => byId('details-panel').querySelector<HTMLInputElement>(`dd[data-header="${h}"] .cell-input`)!.value;
    expect([value('Start year'), value('End year')]).toEqual(['2019', '2021']);
    byId('tab-presentation').click();
    await flush();
    expect(presentationMarkers()).toHaveLength(11);
    expect(document.querySelectorAll('#presentation-glance-list .glance-entry').length).toBeGreaterThan(0);
  });

  test('the demo is guarded by the unsaved-changes confirmation', async () => {
    await importExampleWorkbook();
    editCell(0, 'Note', 'Unsaved');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await load();
    expect(confirm).toHaveBeenCalledWith('The current work has unsaved changes. Loading the demo replaces it and the unsaved changes are lost. Continue?');
    expect(document.querySelectorAll('#row-table-body tr')).toHaveLength(5);
    confirm.mockReturnValue(true);
    await load();
    expect(document.querySelectorAll('#row-table-body tr')).toHaveLength(12);
    confirm.mockRestore();
  });

  test('the example-data label goes when other work replaces the demo', async () => {
    await load();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    byId('tab-information').click();
    byId('start-empty').click();
    expect(byId('demo-badge').classList.contains('hidden')).toBe(true);
    vi.restoreAllMocks();
  });

  test('the demo works in Swedish too; its data stays as written', async () => {
    const lang = byId<HTMLSelectElement>('select-language');
    lang.value = 'sv';
    lang.dispatchEvent(new Event('change'));
    expect(byId('load-demo').textContent).toBe('Läs in demo');
    await load();
    expect(byId('demo-badge').textContent).toBe('Demo: fiktiva exempeldata');
    expect(document.querySelectorAll('#row-table-body tr')).toHaveLength(12);
  });

  test('loading needs no network: the demo is bundled', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await load();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    expect(app).toBeDefined();
  });
});

describe('the demo extension (FR-41 as amended in v1.1.0)', () => {
  for (const [lang, theme] of [
    ['en', 'light'],
    ['sv', 'dark'],
  ] as const) {
    test(`programmes, colour labels, panel columns, the note, and annotations are shown (${lang}, ${theme})`, async () => {
      await mount();
      const select = byId<HTMLSelectElement>('select-language');
      select.value = lang;
      select.dispatchEvent(new Event('change'));
      const themeSelect = byId<HTMLSelectElement>('select-theme');
      themeSelect.value = theme;
      themeSelect.dispatchEvent(new Event('change'));
      expect(document.documentElement.dataset.theme).toBe(theme);
      await load();
      // The user-named colour labels in the legend; the data never colours.
      expect([...byId('map-legend').querySelectorAll('.legend-entry[data-colour]')].map((e) => e.textContent)).toEqual(['On track', 'Under way', 'Needs attention', 'Stopped']);
      // The annotations: the footprint, the free rectangle, the dashed line.
      const shapes = [...byId('map-annotations').querySelectorAll('g.annotation')];
      expect(shapes.map((g) => g.getAttribute('class')!.split(' ')[1])).toEqual(['annotation-polygon', 'annotation-rectangle', 'annotation-line']);
      expect(shapes[2].getAttribute('class')).toContain('style-dashed');
      expect(byId('map-annotation-labels').textContent).toContain('Survey zone');
      // The at-a-glance panel: programme groups, each where its first member
      // stands in the list, and the configured columns.
      expect([...document.querySelectorAll('#map-glance-list .glance-group-name')].map((n) => n.textContent)).toEqual(['Heritage route', 'Green links']);
      expect(document.querySelector('#map-glance-list .glance-value')!.textContent).not.toBe('');
      byId('tab-presentation').click();
      await flush();
      expect(byId('presentation-annotations').querySelectorAll('g.annotation')).toHaveLength(3);
      // The card of the lake jetty: the note first, and its footprint.
      const jetty = presentationMarkers().find((m) => m.getAttribute('aria-label')!.includes('Lake jetty'))!;
      jetty.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
      jetty.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 }));
      const card = byId('presentation-card');
      expect(card.querySelector('.card-note')!.textContent).toBe('On the lake shore.');
      expect(card.querySelector('.footprint-name')!.textContent).toBe('Jetty footprint');
      // The rendered map has a known scale: the footprint's area is given.
      expect(card.querySelector('.footprint-area')!.textContent).toMatch(/^[\d,.\s]+ (m²|ha|km²)$/);
    });
  }

  test('the demo saves as a version 6 work state with all of it', async () => {
    const app = await mount();
    await load();
    const ws = app.captureWorkState();
    expect(ws.programValues).toEqual(['Green links', 'Heritage route']);
    expect(Object.keys(ws.colourLabels)).toHaveLength(4);
    expect(ws.glanceColumns).toEqual(['Programme', 'Status', 'End year']);
    expect(ws.annotations.map((a) => [a.kind, a.link === null ? null : ws.rows[a.link].values.Item])).toEqual([
      ['polygon', 'D-07'],
      ['rectangle', null],
      ['line', null],
    ]);
    expect(ws.background!.projection).toBeDefined();
  });
});
