import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, test } from 'vitest';
import { byId, markers, mountApp, placeExampleMarkers, pointer, setRole, STAGE } from './harness';
import { ICON_PATHS } from '../../src/symbols';

const css = readFileSync(join(process.cwd(), 'src', 'styles.css'), 'utf8');

function glyphPath(node: Element): string | null {
  return node.querySelector('svg.marker-glyph path')?.getAttribute('d') ?? null;
}

function theme(value: 'light' | 'dark'): void {
  const select = byId<HTMLSelectElement>('select-theme');
  select.value = value;
  select.dispatchEvent(new Event('change'));
}

describe('the lightning-bolt icon (FR-26 as amended)', () => {
  beforeEach(async () => {
    await mountApp();
    await placeExampleMarkers([
      [0, 100, 100],
      [2, 400, 300],
    ]);
  });

  test('it is selectable per marker and drawn on the numbered marker', () => {
    pointer('pointerdown', markers()[0], STAGE.left + 100, STAGE.top + 100);
    pointer('pointerup', markers()[0], STAGE.left + 100, STAGE.top + 100);
    const shape = byId<HTMLSelectElement>('marker-shape');
    const option = [...shape.options].find((o) => o.value === 'bolt')!;
    expect(option.textContent).toBe('Lightning bolt');
    shape.value = 'bolt';
    shape.dispatchEvent(new Event('change'));
    const marker = markers()[0];
    expect(marker.dataset.shape).toBe('bolt');
    expect(marker.classList.contains('marker-icon-bolt')).toBe(true);
    expect(glyphPath(marker)).toBe(ICON_PATHS['bolt']);
    expect(marker.textContent).toBe('1');
  });

  test('it is assignable per status and follows the status when the toggle is on', () => {
    byId('tab-information').click();
    setRole('Note', 'status');
    byId('status-panel-summary').click();
    byId<HTMLInputElement>('status-new').value = 'Alpha item';
    byId('status-add').click();
    const select = document.querySelector<HTMLSelectElement>('#status-list .vocab-item[data-status="Alpha item"] .status-symbol')!;
    expect([...select.options].map((o) => o.value)).toContain('bolt');
    select.value = 'bolt';
    select.dispatchEvent(new Event('change'));
    byId<HTMLInputElement>('symbols-from-status').click();
    byId('tab-map').click();
    expect(markers()[0].dataset.shape).toBe('bolt');
    expect(markers()[0].dataset.symbolSource).toBe('status');
    const entry = byId('map-legend').querySelector<HTMLElement>('.legend-entry[data-status="Alpha item"]')!;
    expect(entry.dataset.shape).toBe('bolt');
  });

  test('the legend explains it in both views, in both themes and languages', () => {
    for (const mode of ['light', 'dark'] as const) {
      theme(mode);
      for (const id of ['map-legend', 'presentation-legend']) {
        const entry = byId(id).querySelector<HTMLElement>('.legend-entry[data-shape="bolt"]')!;
        expect(entry.textContent).toBe('Lightning bolt');
        expect(glyphPath(entry)).toBe(ICON_PATHS['bolt']);
      }
    }
    const lang = byId<HTMLSelectElement>('select-language');
    lang.value = 'sv';
    lang.dispatchEvent(new Event('change'));
    expect(byId('map-legend').querySelector('.legend-entry[data-shape="bolt"]')!.textContent).toBe('Blixt');
  });

  test('it is a stroked line drawing in the number colour, so it keeps the pinned contrast bar', () => {
    // Every icon shares the glyph rule: no fill, the stroke in the number
    // colour, whose contrast against every fill is pinned in both themes.
    expect(css).toMatch(/\.marker-glyph \{[^}]*fill: none;[^}]*stroke: currentColor;/);
    // The path stays within the 24 by 24 drawing box.
    const numbers = ICON_PATHS['bolt'].match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect(numbers.every((n) => n >= 0 && n <= 24)).toBe(true);
  });
});
