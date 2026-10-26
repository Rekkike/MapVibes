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
    expect(roles()).toEqual({ Item: 'identifier', Name: 'name', Area: 'area', Status: 'status', 'Start year': 'start', 'End year': 'end' });
    expect(byId('preset-status').textContent).toBe('The preset "Demo columns" matches these columns and was applied automatically.');
    expect(JSON.parse(localStorage.getItem('mapvibes.presets')!).map((p: { name: string }) => p.name)).toContain('Demo columns');
    // The vocabularies and the toggle.
    expect([...document.querySelectorAll('#area-list li')].length).toBe(5);
    expect([...document.querySelectorAll('#status-list li')].length).toBe(6);
    expect(byId<HTMLInputElement>('symbols-from-status').checked).toBe(true);
    // The background, the markers (one item is left to place), their symbols.
    expect(byId('map-stage').dataset.hasBackground).toBe('true');
    expect(byId<HTMLImageElement>('map-image').getAttribute('src')).toBe('data:image/png;base64,T1NN3000x2000');
    expect(markers()).toHaveLength(11);
    expect(markers().map((m) => m.dataset.shape)).toEqual(['check', 'hammer-shovel', 'bulb', 'diamond', 'hammer-shovel', 'pause', 'check', 'cross', 'square', 'bulb', 'magnifier']);
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
