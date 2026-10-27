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
      ['bulb', 'Light bulb'],
      ['magnifier', 'Magnifying glass'],
      ['gear', 'Gear'],
      ['pause', 'Pause'],
      ['cross', 'Cross'],
      ['check', 'Checkmark'],
      ['hammer-shovel', 'Hammer and shovel'],
      ['bolt', 'Lightning bolt'],
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
        'Symbols',
      ]);
      const shapes = [...legend.querySelectorAll<HTMLElement>('.legend-entry[data-shape]')];
      expect(shapes.map((e) => e.dataset.shape)).toEqual(['circle', 'square', 'diamond', 'triangle', 'hexagon', 'bulb', 'magnifier', 'gear', 'pause', 'cross', 'check', 'hammer-shovel', 'bolt']);
      shapes.slice(0, 5).forEach((e) => expect(e.querySelector('.legend-swatch')!.classList.contains(`marker-shape-${e.dataset.shape}`)).toBe(true));
      shapes.slice(5).forEach((e) => {
        expect(e.querySelector('.legend-swatch')!.classList.contains(`marker-icon-${e.dataset.shape}`)).toBe(true);
        expect(e.querySelector('.legend-swatch svg.marker-glyph path')).not.toBeNull();
      });
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
      'Glödlampa',
      'Förstoringsglas',
      'Kugghjul',
      'Paus',
      'Kryss',
      'Bock',
      'Hammare och spade',
      'Blixt',
    ]);
  });

  test('the shape control is not offered on the presentation stage', () => {
    expect(byId('segment-presentation').querySelector('#marker-shape')).toBeNull();
  });

  test('each of the eight icons renders as a vector icon on a numbered marker, everywhere the marker is shown', async () => {
    pointer('pointerdown', markers()[1], STAGE.left + 400, STAGE.top + 300);
    pointer('pointerup', markers()[1], STAGE.left + 400, STAGE.top + 300);
    for (const icon of ['bulb', 'magnifier', 'gear', 'pause', 'cross', 'check', 'hammer-shovel', 'bolt']) {
      chooseShape(icon);
      const m = markers()[1];
      expect(m.classList.contains('marker-icon')).toBe(true);
      expect(m.classList.contains(`marker-icon-${icon}`)).toBe(true);
      expect(m.querySelector('svg.marker-glyph')!.getAttribute('viewBox')).toBe('0 0 24 24');
      expect(m.querySelector('svg.marker-glyph path')!.getAttribute('d')!.length).toBeGreaterThan(10);
      expect(m.textContent).toBe('2');
      expect(m.dataset.shape).toBe(icon);
    }
    expect(placementItems()[1].querySelector('.marker-badge svg.marker-glyph')).not.toBeNull();
    expect(placementItems()[1].querySelector('.marker-badge')!.textContent).toBe('2');
    byId('tab-presentation').click();
    await flush();
    expect(presentationMarkers()[1].querySelector('svg.marker-glyph')).not.toBeNull();
  });

  test('the legend shows the status vocabulary with the symbols assigned', () => {
    expect(byId('map-legend').querySelector('.legend-group[data-kind="statuses"]')).toBeNull();
    byId('tab-information').click();
    byId<HTMLInputElement>('status-new').value = 'Ready';
    byId('status-add').click();
    const symbol = document.querySelector<HTMLSelectElement>('#status-list .status-symbol')!;
    symbol.value = 'check';
    symbol.dispatchEvent(new Event('change'));
    for (const id of ['map-legend', 'presentation-legend']) {
      const group = byId(id).querySelector('.legend-group[data-kind="statuses"]')!;
      expect(group.querySelector('.legend-group-label')!.textContent).toBe('Statuses');
      const entry = group.querySelector<HTMLElement>('.legend-entry')!;
      expect([entry.dataset.status, entry.dataset.shape]).toEqual(['Ready', 'check']);
      expect(entry.querySelector('.legend-label')!.textContent).toBe('Ready');
      expect(entry.querySelector('.legend-swatch svg.marker-glyph')).not.toBeNull();
    }
  });
});
