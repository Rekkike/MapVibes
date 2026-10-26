import { beforeEach, describe, expect, test } from 'vitest';
import { byId, loadExampleBackground, mountApp, pointer } from './harness';

describe('legend (FR-6)', () => {
  beforeEach(async () => {
    await mountApp();
    byId('tab-map').click();
  });

  test('the legend sits at the bottom of the map view, after the stage', () => {
    const area = byId('map-area');
    const legend = byId('map-legend');
    expect(legend.parentElement).toBe(area);
    expect(area.lastElementChild).toBe(legend);
    expect(byId('map-stage').contains(legend)).toBe(false);
  });

  test('the legend explains the four colours in order, each with its colour class', () => {
    const entries = [...document.querySelectorAll<HTMLElement>('#map-legend .legend-entry[data-colour]')];
    expect(entries.map((e) => e.dataset.colour)).toEqual(['green', 'blue', 'yellow', 'red']);
    expect(entries.map((e) => e.querySelector('.legend-label')!.textContent)).toEqual(['Green', 'Blue', 'Yellow', 'Red']);
    entries.forEach((e) => {
      expect(e.querySelector('.legend-swatch')!.classList.contains(`marker-${e.dataset.colour}`)).toBe(true);
    });
    expect(byId('map-legend').querySelector('.legend-heading')!.textContent).toBe('Legend');
  });

  test('the legend follows the interface language', () => {
    const select = byId<HTMLSelectElement>('select-language');
    select.value = 'sv';
    select.dispatchEvent(new Event('change'));
    expect(byId('map-legend').querySelector('.legend-heading')!.textContent).toBe('Teckenförklaring');
    expect([...document.querySelectorAll('#map-legend .legend-entry[data-colour] .legend-label')].map((e) => e.textContent)).toEqual(['Grön', 'Blå', 'Gul', 'Röd']);
  });

  test('the legend is fixed: zooming and panning do not change it', async () => {
    await loadExampleBackground();
    const before = byId('map-legend').outerHTML;
    byId('map-zoom-in').click();
    pointer('pointerdown', byId('map-stage'), 300, 300);
    pointer('pointermove', byId('map-stage'), 350, 320);
    pointer('pointerup', byId('map-stage'), 350, 320);
    expect(byId('map-legend').outerHTML).toBe(before);
    expect(byId('map-legend').style.transform).toBe('');
  });
});
