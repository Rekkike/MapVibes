import { beforeEach, describe, expect, test } from 'vitest';
import { byId, flush, markers, mountApp, placeExampleMarkers, placementItems, pointer, presentationMarkers, STAGE } from './harness';

function chooseShape(shape: string): void {
  const select = byId<HTMLSelectElement>('marker-shape');
  select.value = shape;
  select.dispatchEvent(new Event('change'));
}

describe('marker symbol library (FR-26)', () => {
  beforeEach(async () => {
    await mountApp();
    await placeExampleMarkers([
      [0, 100, 100],
      [1, 400, 300],
    ]);
    pointer('pointerdown', byId('map-stage'), STAGE.left + 10, STAGE.top + 10);
    pointer('pointerup', byId('map-stage'), STAGE.left + 10, STAGE.top + 10);
  });

  test('the shape control offers the library and is available only for a selected marker', () => {
    const select = byId<HTMLSelectElement>('marker-shape');
    expect(select.disabled).toBe(true);
    expect([...select.options].map((o) => [o.value, o.textContent])).toEqual([
      ['circle', 'Circle'],
      ['square', 'Square'],
      ['diamond', 'Diamond'],
      ['triangle', 'Triangle'],
      ['hexagon', 'Hexagon'],
    ]);
    pointer('pointerdown', markers()[1], STAGE.left + 400, STAGE.top + 300);
    pointer('pointerup', markers()[1], STAGE.left + 400, STAGE.top + 300);
    expect(select.disabled).toBe(false);
    expect(select.value).toBe('circle');
  });

  test('each shape renders with its own shape class; the number and colour are kept', () => {
    pointer('pointerdown', markers()[1], STAGE.left + 400, STAGE.top + 300);
    pointer('pointerup', markers()[1], STAGE.left + 400, STAGE.top + 300);
    for (const shape of ['square', 'diamond', 'triangle', 'hexagon', 'circle']) {
      chooseShape(shape);
      const m = markers()[1];
      expect(m.classList.contains(`marker-shape-${shape}`)).toBe(true);
      expect(m.dataset.shape).toBe(shape);
      expect(m.textContent).toBe('2');
      expect(m.classList.contains('marker-green')).toBe(true);
    }
    expect(markers()[0].classList.contains('marker-shape-circle')).toBe(true);
  });

  test('shape and colour change independently', () => {
    pointer('pointerdown', markers()[0], STAGE.left + 100, STAGE.top + 100);
    pointer('pointerup', markers()[0], STAGE.left + 100, STAGE.top + 100);
    chooseShape('diamond');
    byId('tab-information').click();
    document.querySelector<HTMLElement>('#row-table-body .colour-chip')!.click();
    byId('tab-map').click();
    expect(markers()[0].className).toBe('marker marker-blue marker-shape-diamond selected');
    expect(byId('work-dirty').classList.contains('hidden')).toBe(false);
  });

  test('the shape is shown wherever the marker is listed or presented', async () => {
    pointer('pointerdown', markers()[0], STAGE.left + 100, STAGE.top + 100);
    pointer('pointerup', markers()[0], STAGE.left + 100, STAGE.top + 100);
    chooseShape('hexagon');
    expect(placementItems()[0].querySelector('.marker-badge')!.classList.contains('marker-shape-hexagon')).toBe(true);
    expect(document.querySelector('#map-glance-list .marker-badge')!.classList.contains('marker-shape-hexagon')).toBe(true);
    byId('tab-presentation').click();
    await flush();
    expect(presentationMarkers()[0].classList.contains('marker-shape-hexagon')).toBe(true);
    expect(document.querySelector('#visibility-list .marker-badge')!.classList.contains('marker-shape-hexagon')).toBe(true);
  });

  test('the legend explains the colours and the shapes, in both views and both languages', () => {
    for (const id of ['map-legend', 'presentation-legend']) {
      const legend = byId(id);
      expect([...legend.querySelectorAll('.legend-group')].map((g) => g.querySelector('.legend-group-label')!.textContent)).toEqual([
        'Colours',
        'Shapes',
      ]);
      const shapes = [...legend.querySelectorAll<HTMLElement>('.legend-entry[data-shape]')];
      expect(shapes.map((e) => e.dataset.shape)).toEqual(['circle', 'square', 'diamond', 'triangle', 'hexagon']);
      shapes.forEach((e) => expect(e.querySelector('.legend-swatch')!.classList.contains(`marker-shape-${e.dataset.shape}`)).toBe(true));
    }
    const select = byId<HTMLSelectElement>('select-language');
    select.value = 'sv';
    select.dispatchEvent(new Event('change'));
    expect([...byId('map-legend').querySelectorAll('.legend-entry[data-shape] .legend-label')].map((e) => e.textContent)).toEqual([
      'Cirkel',
      'Kvadrat',
      'Romb',
      'Triangel',
      'Sexhörning',
    ]);
  });

  test('the shape control is not offered on the presentation stage', () => {
    expect(byId('segment-presentation').querySelector('#marker-shape')).toBeNull();
  });
});
