import { beforeEach, describe, expect, test } from 'vitest';
import { byId, dragItemToStage, importExampleWorkbook, loadExampleBackground, markers, mountApp, placementItems, pointer, STAGE } from './harness';

// With the example background (1200x800) fitted into the 800x600 stage the
// viewport is scale 2/3, offset (0, 33.33...): image = (stage - offset) * 1.5.
const OFFSET_Y = (600 - 800 * (2 / 3)) / 2;

function client(stageX: number, stageY: number): [number, number] {
  return [STAGE.left + stageX, STAGE.top + stageY];
}

describe('markers (FR-5, FR-18)', () => {
  beforeEach(async () => {
    await mountApp();
    await importExampleWorkbook();
    byId('tab-map').click();
  });

  test('the placement list shows every row with its number, colour, and identifier', () => {
    const items = placementItems();
    expect(items).toHaveLength(5);
    expect(items.map((i) => i.querySelector('.marker-badge')!.textContent)).toEqual(['1', '2', '3', '4', '5']);
    expect(items[0].querySelector('.marker-badge')!.classList.contains('marker-green')).toBe(true);
    expect(items[0].querySelector('.placement-label')!.textContent).toBe('A-01');
    expect(items.every((i) => i.draggable)).toBe(true);
    expect(items.every((i) => i.dataset.placed === 'false')).toBe(true);
  });

  test('dropping a row before a background exists is refused with a notice', () => {
    dragItemToStage(placementItems()[0], ...client(100, 100));
    expect(markers()).toHaveLength(0);
    expect(byId('map-error').textContent).toMatch(/Load a background/);
  });

  test('drag-and-drop of a row creates its numbered, colour-coded marker at the drop point', async () => {
    await loadExampleBackground();
    dragItemToStage(placementItems()[2], ...client(300, 200));
    const [marker] = markers();
    expect(marker).toBeDefined();
    // DOM/CSS assertions: the colour class and the number.
    expect(marker.classList.contains('marker')).toBe(true);
    expect(marker.classList.contains('marker-green')).toBe(true);
    expect(marker.textContent).toBe('3');
    expect(marker.dataset.number).toBe('3');
    expect(marker.style.left).toBe('300px');
    expect(parseFloat(marker.style.top)).toBeCloseTo(200, 6);
    expect(marker.getAttribute('aria-label')).toBe('Marker 3: A-03');
    expect(placementItems()[2].dataset.placed).toBe('true');
    expect(marker.classList.contains('selected')).toBe(true);
  });

  test('each of the four colours renders with its own colour class', async () => {
    await loadExampleBackground();
    byId('tab-information').click();
    const chips = () => [...document.querySelectorAll<HTMLElement>('#row-table-body .colour-chip')];
    chips()[1].click();
    chips()[2].click();
    chips()[2].click();
    chips()[3].click();
    chips()[3].click();
    chips()[3].click();
    byId('tab-map').click();
    placementItems().slice(0, 4).forEach((item, i) => dragItemToStage(item, ...client(100 + i * 50, 100)));
    expect(markers().map((m) => [m.textContent, m.className.replace(' selected', '')])).toEqual([
      ['1', 'marker marker-green'],
      ['2', 'marker marker-blue'],
      ['3', 'marker marker-yellow'],
      ['4', 'marker marker-red'],
    ]);
  });

  test('a marker follows its row colour when the colour is changed in the list', async () => {
    await loadExampleBackground();
    dragItemToStage(placementItems()[0], ...client(100, 100));
    byId('tab-information').click();
    document.querySelector<HTMLElement>('#row-table-body .colour-chip')!.click();
    byId('tab-map').click();
    expect(markers()[0].classList.contains('marker-blue')).toBe(true);
  });

  test('markers keep a fixed screen size and follow the viewport', async () => {
    await loadExampleBackground();
    dragItemToStage(placementItems()[0], ...client(300, 200));
    byId('map-reset').click();
    // Image point ((300-0)*1.5, (200-33.3)*1.5) = (450, 250) at scale 1 with offset (-200,-100).
    const m = markers()[0];
    expect(parseFloat(m.style.left)).toBeCloseTo(250, 6);
    expect(parseFloat(m.style.top)).toBeCloseTo(150, 6);
    expect(m.style.transform).toBe('');
  });

  test('a marker can be selected and moved by dragging', async () => {
    await loadExampleBackground();
    dragItemToStage(placementItems()[0], ...client(300, 200));
    dragItemToStage(placementItems()[1], ...client(500, 400));
    const first = markers()[0];
    pointer('pointerdown', first, ...client(300, 200));
    expect(first.classList.contains('selected')).toBe(true);
    expect(markers()[1].classList.contains('selected')).toBe(false);
    expect(byId('marker-selection').textContent).toBe('Selected marker: 1');
    pointer('pointermove', first, ...client(360, 260));
    pointer('pointerup', first, ...client(360, 260));
    expect(parseFloat(first.style.left)).toBeCloseTo(360, 6);
    expect(parseFloat(first.style.top)).toBeCloseTo(260, 6);
    // Moving a marker does not pan the background.
    expect(byId('map-content').style.transform).toBe(`translate(0px, ${OFFSET_Y}px) scale(${2 / 3})`);
    // The position is stored in image coordinates: it survives a zoom.
    byId('map-reset').click();
    expect(parseFloat(markers()[0].style.left)).toBeCloseTo(360 * 1.5 - 200, 6);
  });

  test('clicking the empty stage clears the selection', async () => {
    await loadExampleBackground();
    dragItemToStage(placementItems()[0], ...client(300, 200));
    expect(markers()[0].classList.contains('selected')).toBe(true);
    pointer('pointerdown', byId('map-stage'), ...client(50, 50));
    pointer('pointerup', byId('map-stage'), ...client(50, 50));
    expect(markers()[0].classList.contains('selected')).toBe(false);
    expect(byId<HTMLButtonElement>('marker-remove').disabled).toBe(true);
  });

  test('a selected marker can be removed with the toolbar button or the Delete key', async () => {
    await loadExampleBackground();
    dragItemToStage(placementItems()[0], ...client(300, 200));
    dragItemToStage(placementItems()[1], ...client(400, 200));
    expect(byId<HTMLButtonElement>('marker-remove').disabled).toBe(false);
    byId('marker-remove').click();
    expect(markers().map((m) => m.textContent)).toEqual(['1']);
    expect(placementItems()[1].dataset.placed).toBe('false');
    markers()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    expect(markers()).toHaveLength(0);
  });

  test('dropping an already placed row moves its single marker', async () => {
    await loadExampleBackground();
    dragItemToStage(placementItems()[0], ...client(300, 200));
    dragItemToStage(placementItems()[0], ...client(100, 100));
    expect(markers()).toHaveLength(1);
    expect(markers()[0].style.left).toBe('100px');
  });

  test('marker numbers regenerate with the global numbering when rows are deleted', async () => {
    await loadExampleBackground();
    dragItemToStage(placementItems()[1], ...client(100, 100));
    dragItemToStage(placementItems()[4], ...client(200, 100));
    expect(markers().map((m) => m.textContent)).toEqual(['2', '5']);
    byId('tab-information').click();
    const selects = [...document.querySelectorAll<HTMLInputElement>('.row-select')];
    selects[0].click();
    selects[1].click();
    byId('delete-selected').click();
    byId('tab-map').click();
    // Row 2 was deleted with its marker; former row 5 is now number 3.
    expect(markers().map((m) => m.textContent)).toEqual(['3']);
    expect(markers()[0].getAttribute('aria-label')).toBe('Marker 3: A-05');
    expect(placementItems().map((i) => i.querySelector('.marker-badge')!.textContent)).toEqual(['1', '2', '3']);
  });

  test('placed markers survive a round trip through the other segments', async () => {
    await loadExampleBackground();
    dragItemToStage(placementItems()[0], ...client(300, 200));
    byId('tab-information').click();
    byId('tab-presentation').click();
    byId('tab-map').click();
    expect(markers().map((m) => m.textContent)).toEqual(['1']);
  });
});
