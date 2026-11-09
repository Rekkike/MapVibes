import { beforeEach, describe, expect, test, vi } from 'vitest';
import { byId, esc, flush, mountApp, placeExampleMarkers, pointer, setRole, STAGE, stubImageDecoding, stubStageLayout } from './harness';

// The used-only legend (FR-75): the Presentation segment's legend and the
// exported viewer's show only what the visible items carry; the Map segment's
// legend keeps the working palette. The Presentation segment recomputes on
// every visibility toggle; the viewer computes once from the embedded items.

function section(id: string, kind: string): string[] {
  return [...document.querySelectorAll<HTMLElement>(`#${id} .legend-group[data-kind="${kind}"] .legend-entry`)].map(
    (e) => e.dataset.status ?? e.dataset.colour ?? e.dataset.shape ?? `group:${e.dataset.group}`,
  );
}

function addStatus(name: string, symbol: string): void {
  byId<HTMLInputElement>('status-new').value = name;
  byId('status-add').click();
  const select = document.querySelector<HTMLSelectElement>(`#status-list .vocab-item[data-status="${esc(name)}"] .status-symbol`)!;
  select.value = symbol;
  select.dispatchEvent(new Event('change'));
}

function chooseShape(shape: string): void {
  const select = byId<HTMLSelectElement>('marker-shape');
  select.value = shape;
  select.dispatchEvent(new Event('change'));
}

function selectMarker(index: number, x: number, y: number): void {
  const m = document.querySelectorAll<HTMLElement>('#marker-layer .marker')[index];
  pointer('pointerdown', m, STAGE.left + x, STAGE.top + y);
  pointer('pointerup', m, STAGE.left + x, STAGE.top + y);
}

// Row colours cycle green -> blue -> yellow -> red with each chip click.
function setColour(rowIndex: number, clicks: number): void {
  const chip = document.querySelectorAll<HTMLElement>('#row-table-body tr')[rowIndex].querySelector<HTMLElement>('.colour-chip')!;
  for (let i = 0; i < clicks; i++) chip.click();
}

async function mountWork(): Promise<typeof import('../../src/main')> {
  const app = await mountApp({ singleFile: true });
  await placeExampleMarkers([
    [0, 100, 100],
    [1, 400, 300],
  ]);
  // Rows 0 and 1 are placed; rows 2, 3, 4 are shown without markers (the
  // timeline includes them, FR-67).
  byId('tab-information').click();
  setRole('Note', 'status');
  addStatus('Alpha item', 'check');
  addStatus('Beta item', 'pause');
  setColour(1, 3); // row 1 red
  setColour(2, 1); // row 2 (no marker) blue
  byId('tab-map').click();
  selectMarker(0, 100, 100);
  chooseShape('diamond');
  selectMarker(1, 400, 300);
  chooseShape('bolt');
  byId('tab-presentation').click();
  await flush();
  return app;
}

describe('the used-only legend (FR-75)', () => {
  beforeEach(async () => {
    await mountWork();
  });

  test('the presentation legend shows only what the visible items carry; the map legend keeps the palette', () => {
    // Colours: green (rows 0, 3, 4), red (row 1), blue (row 2, no marker: the
    // timeline-included item counts as used); yellow is carried by none.
    expect(section('presentation-legend', 'colours')).toEqual(['green', 'blue', 'red']);
    expect(section('map-legend', 'colours')).toEqual(['green', 'blue', 'yellow', 'red']);
    // Symbols: diamond and bolt are chosen per marker; circle is the default
    // of the unplaced rows 3 and 4. The other ten symbols are unused.
    expect(section('presentation-legend', 'shapes')).toEqual(['circle', 'diamond', 'bolt']);
    expect(section('map-legend', 'shapes')).toHaveLength(13);
    // Statuses: the shown rows carry Alpha item (row 0) and Beta item
    // (row 2); each entry keeps its symbol.
    expect(section('presentation-legend', 'statuses')).toEqual(['Alpha item', 'Beta item']);
    const entry = byId('presentation-legend').querySelector<HTMLElement>('.legend-entry[data-status="Alpha item"]')!;
    expect(entry.dataset.shape).toBe('check');
    expect(section('map-legend', 'statuses')).toEqual(['Alpha item', 'Beta item']);
  });

  test('a visibility toggle recomputes the presentation legend; the map legend is unchanged', () => {
    // Switch off row 1 (the only red, the only bolt).
    document.querySelectorAll<HTMLInputElement>('.visibility-toggle')[1].click();
    expect(section('presentation-legend', 'colours')).toEqual(['green', 'blue']);
    expect(section('presentation-legend', 'shapes')).toEqual(['circle', 'diamond']);
    expect(section('map-legend', 'colours')).toEqual(['green', 'blue', 'yellow', 'red']);
    expect(section('map-legend', 'shapes')).toHaveLength(13);
    // Switch it back on: the entries return.
    document.querySelectorAll<HTMLInputElement>('.visibility-toggle')[1].click();
    expect(section('presentation-legend', 'colours')).toEqual(['green', 'blue', 'red']);
    expect(section('presentation-legend', 'shapes')).toEqual(['circle', 'diamond', 'bolt']);
  });

  test('the exported viewer computes the used-only legend once from its embedded items', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2024, 7, 9, 10, 30));
    const app = await mountWork();
    // Switch off row 1 before the export: it is absent from the file (FR-39).
    document.querySelectorAll<HTMLInputElement>('.visibility-toggle')[1].click();
    const page = app.exportPage(new Date(2024, 7, 9, 10, 30))!;
    vi.useRealTimers();
    const doc = new DOMParser().parseFromString(page, 'text/html');
    await mountApp({
      body: doc.body.innerHTML,
      beforeMain: () => {
        stubStageLayout();
        stubImageDecoding(1200, 800);
      },
    });
    await flush();
    expect(document.documentElement.dataset.mode).toBe('viewer');
    expect(section('presentation-legend', 'colours')).toEqual(['green', 'blue']);
    expect(section('presentation-legend', 'shapes')).toEqual(['circle', 'diamond']);
    expect(section('presentation-legend', 'statuses')).toEqual(['Alpha item', 'Beta item']);
    // The Map segment's legend keeps the palette, also in the viewer's DOM.
    expect(section('map-legend', 'colours')).toEqual(['green', 'blue', 'yellow', 'red']);
    expect(section('map-legend', 'shapes')).toHaveLength(13);
  });
});
