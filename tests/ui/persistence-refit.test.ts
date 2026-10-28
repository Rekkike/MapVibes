import { beforeEach, describe, expect, test } from 'vitest';
import { byId, flush, markers, mountApp, openWorkFile, placeExampleMarkers, pointer, setRole, STAGE, stubImageDecoding, textFile } from './harness';
import { serialiseWorkState } from '../../src/workstate';

// Settings persistence (FR-17 as amended in v1.3.0) and the details-panel
// refit (FR-16 as amended in v1.3.0).

type App = Awaited<ReturnType<typeof mountApp>>;

function choose(id: string, value: string): void {
  const select = byId<HTMLSelectElement>(id);
  select.value = value;
  select.dispatchEvent(new Event('change'));
}

describe('the numbering mode and the list view are saved with the work (FR-17)', () => {
  test('both survive a save and open', async () => {
    const app = await mountApp();
    await placeExampleMarkers([[0, 100, 100]]);
    byId('tab-information').click();
    setRole('Group', 'area');
    setRole('Note', 'program');
    choose('numbering-mode', 'grouped');
    choose('list-view', 'grouped');
    const ws = app.captureWorkState();
    expect([ws.numbering, ws.listView]).toEqual(['grouped', 'grouped']);
    const text = serialiseWorkState(ws, new Date());
    const fresh = await mountApp();
    stubImageDecoding(1200, 800);
    openWorkFile(textFile('work.json', text));
    await flush();
    await flush();
    expect(byId<HTMLSelectElement>('numbering-mode').value).toBe('grouped');
    expect(byId<HTMLSelectElement>('list-view').value).toBe('grouped');
    expect(document.querySelectorAll('#row-table-body tr.group-row').length).toBeGreaterThan(0);
    expect([fresh.captureWorkState().numbering, fresh.captureWorkState().listView]).toEqual(['grouped', 'grouped']);
  });
});

describe('opening the details panel refits the map view (FR-16)', () => {
  let app: App;
  // The stage is 800 pixels wide, and 560 while the details panel is open.
  const width = () => (document.documentElement.dataset.details === 'open' ? 560 : 800);

  beforeEach(async () => {
    app = await mountApp();
    await placeExampleMarkers([
      [0, 60, 100],
      [2, 400, 300],
    ]);
    const stage = byId('map-stage');
    stage.getBoundingClientRect = () => ({ ...STAGE, width: width(), x: STAGE.left, y: STAGE.top, right: STAGE.left + width(), bottom: STAGE.top + STAGE.height, toJSON: () => ({}) }) as DOMRect;
    byId('map-fit').click();
  });

  test('the fitted map stays wholly in view when the panel narrows the stage, and when it widens it again', () => {
    const fitted = app.captureWorkState().viewport;
    expect(fitted.scale * 1200).toBeCloseTo(800, 6);
    pointer('pointerdown', markers()[0], STAGE.left + 60, STAGE.top + 100);
    pointer('pointerup', markers()[0], STAGE.left + 60, STAGE.top + 100);
    expect(document.documentElement.dataset.details).toBe('open');
    const narrowed = app.captureWorkState().viewport;
    // The whole image still fits the narrower stage.
    expect(narrowed.scale * 1200).toBeLessThanOrEqual(560 + 1e-6);
    expect(narrowed.x).toBeGreaterThanOrEqual(-1e-6);
    expect(narrowed.x + narrowed.scale * 1200).toBeLessThanOrEqual(560 + 1e-6);
    byId('details-panel').querySelector<HTMLButtonElement>('.details-close')!.click();
    const widened = app.captureWorkState().viewport;
    expect(widened.scale).toBeCloseTo(fitted.scale, 6);
    expect(widened.x).toBeCloseTo(fitted.x, 6);
  });

  test('a zoomed view keeps its centre', () => {
    byId('map-zoom-in').click();
    byId('map-zoom-in').click();
    const v = app.captureWorkState().viewport;
    const centre = { x: (400 - v.x) / v.scale, y: (300 - v.y) / v.scale };
    pointer('pointerdown', markers()[1], STAGE.left + 400, STAGE.top + 300);
    pointer('pointerup', markers()[1], STAGE.left + 400, STAGE.top + 300);
    const after = app.captureWorkState().viewport;
    expect((280 - after.x) / after.scale).toBeCloseTo(centre.x, 6);
    expect((300 - after.y) / after.scale).toBeCloseTo(centre.y, 6);
  });
});
