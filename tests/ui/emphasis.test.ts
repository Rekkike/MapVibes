import { beforeEach, describe, expect, test } from 'vitest';
import {
  byId,
  flush,
  markers,
  mountApp,
  placeExampleMarkers,
  placementItems,
  pointer,
  presentationMarkers,
  STAGE,
  stubImageDecoding,
  stubStageLayout,
} from './harness';
import { readDataIsland } from '../../src/singlefile';
import { parseExport } from '../../src/exportfile';
import { ICON_PATHS } from '../../src/symbols';

// The emphasis marker (FR-83, v2.7.0): an item's accent, emphasised per item,
// drawn on the map large -- the icon in red on a yellow filled circle -- in
// place of the accent's small disc; offered only while the item has an
// accent; carried by the work state (schema 14), the viewer, and the
// documents' stage page; its legend entry drawn in the emphasis form under
// the icon's label. The application gives it no meaning.

function choose(select: HTMLSelectElement, value: string): void {
  select.value = value;
  select.dispatchEvent(new Event('change'));
}

function selectMarker(index: number, x: number, y: number): void {
  pointer('pointerdown', markers()[index], STAGE.left + x, STAGE.top + y);
  pointer('pointerup', markers()[index], STAGE.left + x, STAGE.top + y);
}

function cardBox(): HTMLInputElement {
  return document.querySelector<HTMLInputElement>('#details-panel .details-accent .emphasis-box')!;
}

function tick(box: HTMLInputElement, on: boolean): void {
  box.checked = on;
  box.dispatchEvent(new Event('change'));
}

describe('the emphasis marker (FR-83)', () => {
  let app: Awaited<ReturnType<typeof mountApp>>;

  beforeEach(async () => {
    app = await mountApp({ singleFile: true });
    await placeExampleMarkers([
      [0, 100, 100],
      [2, 400, 300],
    ]);
    byId('tab-map').click();
  });

  test('it is offered only while the item has an accent; removing the accent removes it', () => {
    selectMarker(0, 100, 100);
    expect(cardBox().disabled).toBe(true);
    expect(byId<HTMLInputElement>('marker-emphasis').disabled).toBe(true);
    expect(cardBox().parentElement!.textContent.trim()).toBe('Emphasise on the map');
    choose(document.querySelector<HTMLSelectElement>('#details-panel .details-accent select')!, 'bolt');
    expect(cardBox().disabled).toBe(false);
    tick(cardBox(), true);
    expect(markers()[0].classList.contains('marker-emphasised')).toBe(true);
    choose(document.querySelector<HTMLSelectElement>('#details-panel .details-accent select')!, '');
    expect(markers()[0].classList.contains('marker-emphasised')).toBe(false);
    expect(app.captureWorkState().rows[0].emphasis).toBeUndefined();
    expect(cardBox().checked).toBe(false);
  });

  test('on the map the accent is drawn large, in the emphasis form; the lists and the card keep the small disc', () => {
    selectMarker(0, 100, 100);
    choose(document.querySelector<HTMLSelectElement>('#details-panel .details-accent select')!, 'bolt');
    tick(byId<HTMLInputElement>('marker-emphasis'), true);
    const marker = markers()[0];
    const big = marker.querySelector<HTMLElement>(':scope > .marker-accent.marker-emphasis')!;
    expect(big.dataset.accent).toBe('bolt');
    expect(big.querySelector('path')!.getAttribute('d')).toBe(ICON_PATHS.bolt);
    expect(markers()[1].querySelector('.marker-emphasis')).toBeNull();
    // The lists and the card's badge: the small disc.
    expect(placementItems()[0].querySelector('.marker-accent')!.classList.contains('marker-emphasis')).toBe(false);
    expect(document.querySelector('#details-panel .details-badge .marker-accent')!.classList.contains('marker-emphasis')).toBe(false);
    expect(document.querySelector('#map-glance-list .marker-accent')!.classList.contains('marker-emphasis')).toBe(false);
    // The Map segment's legend names it from the vocabulary, in the emphasis form.
    const entry = byId('map-legend').querySelector<HTMLElement>('.legend-entry[data-shape="bolt"]')!;
    expect(entry.textContent).toBe('OPS quay');
    expect(entry.dataset.emphasis).toBe('true');
    expect(entry.querySelector('.legend-swatch')!.classList.contains('legend-emphasis-swatch')).toBe(true);
    // The colour, the symbol, and the number are untouched.
    expect([marker.dataset.colour, marker.dataset.shape, marker.dataset.number]).toEqual(['green', 'circle', '1']);
  });

  test('it is saved, exported, drawn by the viewer with its legend, and carried by the document scene', async () => {
    selectMarker(0, 100, 100);
    choose(document.querySelector<HTMLSelectElement>('#details-panel .details-accent select')!, 'bolt');
    tick(cardBox(), true);
    expect(app.captureWorkState().rows.map((r) => r.emphasis ?? null)).toEqual([true, null, null, null, null]);
    byId('tab-presentation').click();
    await flush();
    expect(presentationMarkers()[0].querySelector('.marker-emphasis')).not.toBeNull();
    expect(byId('presentation-legend').querySelector<HTMLElement>('.legend-entry[data-shape="bolt"]')!.dataset.emphasis).toBe('true');
    expect(app.documentScene()!.markers.map((m) => m.emphasis ?? false)).toEqual([true, false]);
    const island = readDataIsland(new DOMParser().parseFromString(app.exportPage()!, 'text/html'))!;
    expect((JSON.parse(island) as { workState: { schemaVersion: number } }).workState.schemaVersion).toBe(14);
    expect(
      parseExport(island)
        .workState.rows.filter((r) => r.emphasis)
        .map((r) => r.accent),
    ).toEqual(['bolt']);
    const doc = new DOMParser().parseFromString(app.exportPage()!, 'text/html');
    await mountApp({
      body: doc.body.innerHTML,
      beforeMain: () => {
        stubStageLayout();
        stubImageDecoding(1200, 800);
      },
    });
    await flush();
    expect(document.documentElement.dataset.mode).toBe('viewer');
    expect(presentationMarkers()[0].querySelector('.marker-accent.marker-emphasis')).not.toBeNull();
    expect(byId('presentation-legend').querySelector<HTMLElement>('.legend-entry[data-shape="bolt"]')!.textContent).toBe('OPS quay');
  });

  test('both languages: the checkbox and the legend follow the interface language', () => {
    selectMarker(0, 100, 100);
    choose(document.querySelector<HTMLSelectElement>('#details-panel .details-accent select')!, 'bolt');
    tick(cardBox(), true);
    const lang = byId<HTMLSelectElement>('select-language');
    lang.value = 'sv';
    lang.dispatchEvent(new Event('change'));
    selectMarker(0, 100, 100);
    expect(cardBox().parentElement!.textContent.trim()).toBe('Framhäv på kartan');
    expect(byId('marker-emphasis-text').textContent).toBe('Framhäv på kartan');
    expect(byId('map-legend').querySelector<HTMLElement>('.legend-entry[data-emphasis]')!.textContent).toBe('OPS kaj');
  });
});
