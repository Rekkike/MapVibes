import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { byId, editCell, flush, markers, mountApp, stubImageDecoding, stubStageLayout } from './harness';

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
  return { ...mod, DEMO_MAP_TEXT: readFileSync(join(process.cwd(), 'example-data', 'example-map.osm'), 'utf8') };
});

// Reset demo (FR-56).

type App = Awaited<ReturnType<typeof mountApp>>;

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await flush();
  }
}

describe('reset demo (FR-56)', () => {
  let app: App;

  beforeEach(async () => {
    app = await mountApp({
      beforeMain: () => {
        stubStageLayout();
        stubImageDecoding(3000, 2000);
      },
    });
  });

  afterEach(() => vi.restoreAllMocks());

  test('the action shows beside the demo label only while the demo is loaded', async () => {
    expect(byId('demo-reset').classList.contains('hidden')).toBe(true);
    byId('load-demo').click();
    await settle();
    expect(byId('demo-reset').classList.contains('hidden')).toBe(false);
    expect(byId('demo-reset').textContent).toBe('Reset demo');
    // From the medium class upward the reset sits in the bar's Menu (FR-71 as
    // amended in v2.0.0); the demo's badge stays in the bar.
    expect(byId('demo-reset').parentElement!.id).toBe('app-menu');
    expect(byId('demo-badge').parentElement!.id).toBe('app-header');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    byId('tab-information').click();
    byId('start-empty').click();
    expect(byId('demo-reset').classList.contains('hidden')).toBe(true);
  });

  test('an untouched demo resets without a question', async () => {
    byId('load-demo').click();
    await settle();
    const confirm = vi.spyOn(window, 'confirm');
    byId('demo-reset').click();
    await settle();
    expect(confirm).not.toHaveBeenCalled();
    expect(markers()).toHaveLength(11);
  });

  test('a changed demo asks first; declining keeps the changes, accepting restores the pristine demo', async () => {
    byId('load-demo').click();
    await settle();
    const pristine = JSON.stringify({ ...app.captureWorkState(), viewport: null });
    // Changes: an edited value, a removed marker's item switched off, a symbol label, the numbering.
    byId('tab-information').click();
    editCell(0, 'Name', 'Changed gate');
    const label = document.querySelector<HTMLInputElement>('#symbol-label-list input[data-symbol="bolt"]')!;
    label.value = 'Urgent';
    label.dispatchEvent(new Event('change'));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    byId('demo-reset').click();
    await settle();
    expect(confirm).toHaveBeenCalledWith('The demo has changes that are not saved. Resetting it discards them and loads the demo as it was. Continue?');
    expect(app.captureWorkState().rows[0].values.Name).toBe('Changed gate');
    confirm.mockReturnValue(true);
    byId('demo-reset').click();
    await settle();
    const after = app.captureWorkState();
    expect(after.rows[0].values.Name).toBe('North gate');
    expect(after.symbolLabels).toEqual({});
    expect(JSON.stringify({ ...after, viewport: null })).toBe(pristine);
    expect(byId('segment-map').classList.contains('hidden')).toBe(false);
  });

  test('the action follows the language', async () => {
    const lang = byId<HTMLSelectElement>('select-language');
    lang.value = 'sv';
    lang.dispatchEvent(new Event('change'));
    byId('load-demo').click();
    await settle();
    expect(byId('demo-reset').textContent).toBe('Återställ demo');
  });
});
