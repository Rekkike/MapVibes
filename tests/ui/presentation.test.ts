import { beforeEach, describe, expect, test } from 'vitest';
import { byId, dragItemToStage, flush, markers, mountApp, placeExampleMarkers, placementItems, pointer, presentationMarkers, STAGE } from './harness';

function toggle(id: string): HTMLInputElement {
  return document.querySelector<HTMLInputElement>(`.visibility-toggle[data-row-id="${id}"]`)!;
}

describe('presentation mode (FR-27)', () => {
  beforeEach(async () => {
    await mountApp();
    await placeExampleMarkers([
      [0, 100, 100],
      [2, 400, 300],
      [4, 700, 500],
    ]);
    byId('tab-presentation').click();
    await flush();
  });

  test('the stage shows the whole map: the background, fitted, with the markers and the legend', () => {
    expect(byId('presentation-stage').dataset.hasBackground).toBe('true');
    expect(byId<HTMLImageElement>('presentation-image').getAttribute('src')).toBe(byId<HTMLImageElement>('map-image').getAttribute('src'));
    expect(Number(byId('presentation-stage').dataset.scale)).toBeCloseTo(2 / 3, 10);
    expect(presentationMarkers().map((m) => [m.textContent, m.className])).toEqual([
      ['1', 'marker marker-green marker-shape-circle'],
      ['3', 'marker marker-green marker-shape-circle'],
      ['5', 'marker marker-green marker-shape-circle'],
    ]);
    expect(presentationMarkers()[1].style.left).toBe('400px');
    expect(byId('presentation-empty').classList.contains('hidden')).toBe(true);
    const legend = [...byId('presentation-legend').querySelectorAll<HTMLElement>('.legend-entry[data-colour]')].map((e) => e.dataset.colour);
    expect(legend).toEqual(['green', 'blue', 'yellow', 'red']);
  });

  test('zoom and pan work on the stage, independently of the Map segment view', () => {
    const mapTransform = byId('map-content').style.transform;
    byId('pres-zoom-in').click();
    expect(Number(byId('presentation-stage').dataset.scale)).toBeCloseTo((2 / 3) * 1.25, 10);
    pointer('pointerdown', byId('presentation-stage'), STAGE.left + 10, STAGE.top + 10);
    pointer('pointermove', byId('presentation-stage'), STAGE.left + 60, STAGE.top + 10);
    pointer('pointerup', byId('presentation-stage'), STAGE.left + 60, STAGE.top + 10);
    expect(byId('presentation-content').style.transform).toMatch(/^translate\(/);
    byId('pres-fit').click();
    expect(Number(byId('presentation-stage').dataset.scale)).toBeCloseTo(2 / 3, 10);
    expect(byId('map-content').style.transform).toBe(mapTransform);
  });

  test('the stage is not an editor: markers cannot be moved, removed, or placed there', () => {
    const marker = presentationMarkers()[0];
    const mapPositions = markers().map((m) => [m.style.left, m.style.top]);
    // Dragging from a marker pans the whole view (FR-36): the marker keeps its
    // place on the map and moves only with the view.
    pointer('pointerdown', marker, STAGE.left + 100, STAGE.top + 100);
    pointer('pointermove', marker, STAGE.left + 300, STAGE.top + 300);
    pointer('pointerup', marker, STAGE.left + 300, STAGE.top + 300);
    marker.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    expect(presentationMarkers()[0].style.left).toBe('300px');
    expect(presentationMarkers()[1].style.left).toBe('600px');
    byId('pres-fit').click();
    expect(presentationMarkers()[0].style.left).toBe('100px');
    expect(markers().map((m) => [m.style.left, m.style.top])).toEqual(mapPositions);
    expect(presentationMarkers()).toHaveLength(3);
    expect(markers()).toHaveLength(3);
    // A row dropped onto the presentation stage creates nothing.
    const store = new Map([['application/x-mapvibes-row', 'row-2']]);
    const drop = new MouseEvent('drop', { bubbles: true, cancelable: true, clientX: STAGE.left + 50, clientY: STAGE.top + 50 });
    Object.defineProperty(drop, 'dataTransfer', { value: { getData: (t: string) => store.get(t) ?? '', files: [], types: [...store.keys()] } });
    byId('presentation-stage').dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(true);
    expect(markers()).toHaveLength(3);
  });

  test('clicking a marker selects it without panning the stage', () => {
    const before = byId('presentation-content').style.transform;
    pointer('pointerdown', presentationMarkers()[1], STAGE.left + 400, STAGE.top + 300);
    pointer('pointerup', presentationMarkers()[1], STAGE.left + 400, STAGE.top + 300);
    expect(presentationMarkers()[1].classList.contains('selected')).toBe(true);
    expect(byId('presentation-content').style.transform).toBe(before);
  });

  test('a press on a marker that moves pans the stage and selects nothing (FR-36)', () => {
    const before = byId('presentation-content').style.transform;
    pointer('pointerdown', presentationMarkers()[1], STAGE.left + 400, STAGE.top + 300);
    pointer('pointermove', byId('presentation-stage'), STAGE.left + 440, STAGE.top + 320);
    pointer('pointerup', byId('presentation-stage'), STAGE.left + 440, STAGE.top + 320);
    expect(presentationMarkers().some((m) => m.classList.contains('selected'))).toBe(false);
    expect(byId('presentation-content').style.transform).not.toBe(before);
    expect(byId('presentation-card').dataset.state).toBe('closed');
  });

  test('a small tremor during a tap still selects', () => {
    pointer('pointerdown', presentationMarkers()[0], STAGE.left + 100, STAGE.top + 100);
    pointer('pointermove', presentationMarkers()[0], STAGE.left + 103, STAGE.top + 102);
    pointer('pointerup', presentationMarkers()[0], STAGE.left + 103, STAGE.top + 102);
    expect(byId('presentation-card').dataset.state).toBe('open');
  });

  test('the visibility list offers a toggle per placed item, all shown by default', () => {
    const items = [...document.querySelectorAll<HTMLElement>('#visibility-list .visibility-item')];
    expect(items.map((i) => i.querySelector('.marker-badge')!.textContent)).toEqual(['1', '3', '5']);
    expect(items.map((i) => i.querySelector('.placement-label')!.textContent)).toEqual(['A-01', 'A-03', 'A-05']);
    expect(items.every((i) => (i.querySelector('.visibility-toggle') as HTMLInputElement).checked)).toBe(true);
    expect(items[0].querySelector('.visibility-toggle')!.getAttribute('aria-label')).toBe('Shown in the presentation: A-01');
  });

  test('switching an item off hides its marker on the stage; switching it on shows it again', () => {
    const id = presentationMarkers()[1].dataset.rowId!;
    toggle(id).click();
    expect(presentationMarkers().map((m) => m.textContent)).toEqual(['1', '5']);
    expect(document.querySelector<HTMLElement>(`.visibility-item[data-row-id="${id}"]`)!.dataset.shown).toBe('false');
    expect(byId('work-dirty').classList.contains('hidden')).toBe(false);
    // In the Map segment the marker stays editable and is shown faded.
    const mapMarker = markers().find((m) => m.dataset.rowId === id)!;
    expect(mapMarker.classList.contains('marker-excluded')).toBe(true);
    toggle(id).click();
    expect(presentationMarkers().map((m) => m.textContent)).toEqual(['1', '3', '5']);
    expect(markers().find((m) => m.dataset.rowId === id)!.classList.contains('marker-excluded')).toBe(false);
  });

  test('markers placed or moved in the Map segment appear on the stage', () => {
    byId('tab-map').click();
    dragItemToStage(placementItems()[1], STAGE.left + 250, STAGE.top + 250);
    byId('tab-presentation').click();
    expect(presentationMarkers().map((m) => m.textContent)).toEqual(['1', '2', '3', '5']);
  });

  test('without a background the stage says where to load one', async () => {
    await mountApp();
    byId('tab-presentation').click();
    expect(byId('presentation-empty').classList.contains('hidden')).toBe(false);
    expect(byId<HTMLButtonElement>('pres-fit').disabled).toBe(true);
    expect(byId('visibility-empty').classList.contains('hidden')).toBe(false);
  });
});
