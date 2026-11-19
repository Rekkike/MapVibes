import { beforeEach, describe, expect, test } from 'vitest';
import { byId, flush, markers, mountApp, placeExampleMarkers, placementItems, pointer, presentationMarkers, STAGE } from './harness';

// Since v2.6.0 (FR-26 as amended) a marker's button shape and its symbol are
// independent: the button shape (Knappform) in #marker-form, the symbol (an
// icon or none) in #marker-shape.
function chooseForm(form: string): void {
  const select = byId<HTMLSelectElement>('marker-form');
  select.value = form;
  select.dispatchEvent(new Event('change'));
}

function chooseShape(symbol: string): void {
  const select = byId<HTMLSelectElement>('marker-shape');
  select.value = symbol;
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

  test('the button shape and the symbol are two controls, available only for a selected marker', () => {
    const form = byId<HTMLSelectElement>('marker-form');
    expect(form.disabled).toBe(true);
    expect(byId('marker-form-text').textContent).toBe('Button shape');
    // The button shapes by their own names: a choice, never explained.
    expect([...form.options].map((o) => [o.value, o.textContent])).toEqual([
      ['circle', 'Circle'],
      ['square', 'Square'],
      ['diamond', 'Diamond'],
      ['triangle', 'Triangle'],
      ['hexagon', 'Hexagon'],
    ]);
    const select = byId<HTMLSelectElement>('marker-shape');
    expect(select.disabled).toBe(true);
    expect([...select.options].map((o) => [o.value, o.textContent])).toEqual([
      ['none', 'No symbol'],
      // A named symbol by its label beside its own name, an unnamed one by its
      // own name (FR-54 as amended in v2.6.0; a new work's starter names).
      ['bulb', 'Idea phase (Light bulb)'],
      ['magnifier', 'Pre-study (Magnifying glass)'],
      ['gear', 'Engineering (Gear)'],
      ['pause', 'Pause'],
      ['cross', 'Cross'],
      ['check', 'Checkmark'],
      ['hammer-shovel', 'Execution (Hammer and shovel)'],
      ['bolt', 'OPS quay (Lightning bolt)'],
    ]);
    pointer('pointerdown', markers()[1], STAGE.left + 400, STAGE.top + 300);
    pointer('pointerup', markers()[1], STAGE.left + 400, STAGE.top + 300);
    expect(select.disabled).toBe(false);
    expect(form.disabled).toBe(false);
    expect([form.value, select.value]).toEqual(['circle', 'none']);
  });

  test('each shape renders with its own shape class; the number and colour are kept', () => {
    pointer('pointerdown', markers()[1], STAGE.left + 400, STAGE.top + 300);
    pointer('pointerup', markers()[1], STAGE.left + 400, STAGE.top + 300);
    for (const shape of ['square', 'diamond', 'triangle', 'hexagon', 'circle']) {
      chooseForm(shape);
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
    chooseForm('diamond');
    byId('tab-information').click();
    document.querySelector<HTMLElement>('#row-table-body .colour-chip')!.click();
    byId('tab-map').click();
    expect(markers()[0].className).toBe('marker marker-blue marker-shape-diamond selected');
    expect(byId('work-dirty').classList.contains('hidden')).toBe(false);
  });

  test('the shape is shown wherever the marker is listed or presented', async () => {
    pointer('pointerdown', markers()[0], STAGE.left + 100, STAGE.top + 100);
    pointer('pointerup', markers()[0], STAGE.left + 100, STAGE.top + 100);
    chooseForm('hexagon');
    expect(placementItems()[0].querySelector('.marker-badge')!.classList.contains('marker-shape-hexagon')).toBe(true);
    expect(document.querySelector('#map-glance-list .marker-badge')!.classList.contains('marker-shape-hexagon')).toBe(true);
    byId('tab-presentation').click();
    await flush();
    expect(presentationMarkers()[0].classList.contains('marker-shape-hexagon')).toBe(true);
    expect(document.querySelector('#visibility-list .marker-badge')!.classList.contains('marker-shape-hexagon')).toBe(true);
  });

  test('the legend explains the colours and the named symbols, in both views and both languages', () => {
    // Since v2.6.0 (FR-54 and FR-75 as amended) an unnamed symbol is never
    // explained: a new work names five symbols, and the Map segment's palette
    // lists those five; the presentation's legend is used-only (FR-75), and
    // every item here carries the unnamed default circle, so it has no
    // symbols section at all.
    for (const id of ['map-legend', 'presentation-legend']) {
      const legend = byId(id);
      expect([...legend.querySelectorAll('.legend-group')].map((g) => g.querySelector('.legend-group-label')!.textContent)).toEqual(
        id === 'map-legend' ? ['Colours', 'Symbols'] : ['Colours'],
      );
      const shapes = [...legend.querySelectorAll<HTMLElement>('.legend-entry[data-shape]')];
      expect(shapes.map((e) => e.dataset.shape)).toEqual(id === 'map-legend' ? ['bulb', 'magnifier', 'gear', 'hammer-shovel', 'bolt'] : []);
      shapes.forEach((e) => {
        expect(e.querySelector('.legend-swatch')!.classList.contains(`marker-icon-${e.dataset.shape}`)).toBe(true);
        expect(e.querySelector('.legend-swatch svg.marker-glyph path')).not.toBeNull();
      });
    }
    // The button shapes carry no labels and are never explained (FR-26 and
    // FR-54 as amended): the label panel lists the eight icons only.
    expect(document.querySelector('#symbol-label-list input[data-symbol="square"]')).toBeNull();
    expect(document.querySelectorAll('#symbol-label-list input')).toHaveLength(8);
    const select = byId<HTMLSelectElement>('select-language');
    select.value = 'sv';
    select.dispatchEvent(new Event('change'));
    expect(byId('marker-form-text').textContent).toBe('Knappform');
    expect([...byId('map-legend').querySelectorAll('.legend-entry[data-shape] .legend-label')].map((e) => e.textContent)).toEqual([
      'Idéfas',
      'Förstudie',
      'Projektering',
      'Genomförande',
      'OPS kaj',
    ]);
  });

  test('an icon sits inside any button shape; each choice keeps the other (FR-26 as amended)', () => {
    pointer('pointerdown', markers()[1], STAGE.left + 400, STAGE.top + 300);
    pointer('pointerup', markers()[1], STAGE.left + 400, STAGE.top + 300);
    chooseForm('diamond');
    chooseShape('bulb');
    let m = markers()[1];
    expect([m.dataset.form, m.dataset.shape]).toEqual(['diamond', 'bulb']);
    expect(m.classList.contains('marker-shape-diamond') && m.classList.contains('marker-icon-bulb')).toBe(true);
    expect(m.querySelector('svg.marker-glyph')).not.toBeNull();
    expect(m.textContent).toBe('2');
    chooseForm('triangle');
    m = markers()[1];
    expect([m.dataset.form, m.dataset.shape]).toEqual(['triangle', 'bulb']);
    chooseShape('none');
    m = markers()[1];
    expect([m.dataset.form, m.dataset.shape]).toEqual(['triangle', 'triangle']);
    expect(m.querySelector('svg.marker-glyph')).toBeNull();
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
    // The Map segment's legend keeps the working palette (FR-6 as amended in
    // v1.9.0): the whole status vocabulary with its symbols.
    const group = byId('map-legend').querySelector('.legend-group[data-kind="statuses"]')!;
    expect(group.querySelector('.legend-group-label')!.textContent).toBe('Statuses');
    const entry = group.querySelector<HTMLElement>('.legend-entry')!;
    expect([entry.dataset.status, entry.dataset.shape]).toEqual(['Ready', 'check']);
    expect(entry.querySelector('.legend-label')!.textContent).toBe('Ready');
    expect(entry.querySelector('.legend-swatch svg.marker-glyph')).not.toBeNull();
    // The presentation's legend is used-only (FR-75): no visible item carries
    // 'Ready' here, so the section does not appear.
    expect(byId('presentation-legend').querySelector('.legend-group[data-kind="statuses"]')).toBeNull();
  });
});
