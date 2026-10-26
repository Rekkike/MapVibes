import { beforeEach, describe, expect, test } from 'vitest';
import { byId, importExampleWorkbook, mountApp } from './harness';

function visible(id: string): boolean {
  return !byId(id).classList.contains('hidden');
}

describe('segment navigation (FR-22)', () => {
  beforeEach(async () => {
    await mountApp();
  });

  test('the three segments are offered as tabs in flow order', () => {
    const tabs = [...document.querySelectorAll<HTMLElement>('#segment-nav .segment-tab')];
    expect(tabs.map((t) => t.dataset.segment)).toEqual(['information', 'map', 'presentation']);
    expect(tabs.map((t) => t.getAttribute('role'))).toEqual(['tab', 'tab', 'tab']);
  });

  test('the Information segment is shown on start', () => {
    expect(visible('segment-information')).toBe(true);
    expect(visible('segment-map')).toBe(false);
    expect(visible('segment-presentation')).toBe(false);
    expect(byId('tab-information').getAttribute('aria-selected')).toBe('true');
  });

  test('clicking a tab shows exactly that segment', () => {
    byId('tab-map').click();
    expect(visible('segment-map')).toBe(true);
    expect(visible('segment-information')).toBe(false);
    expect(byId('tab-map').getAttribute('aria-selected')).toBe('true');
    expect(byId('tab-information').getAttribute('aria-selected')).toBe('false');
    expect(document.documentElement.dataset.segment).toBe('map');
  });

  test('the Presentation segment is a stage: it offers view controls but no editing controls', () => {
    byId('tab-presentation').click();
    expect(visible('segment-presentation')).toBe(true);
    expect(byId('presentation-heading').textContent).toBe('Presentation');
    const segment = byId('segment-presentation');
    expect(segment.querySelector('#pres-fit')).not.toBeNull();
    expect(segment.querySelector('input[type="file"], #marker-remove, .placement-item')).toBeNull();
  });

  test('arrow keys move between tabs', () => {
    byId('tab-information').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(visible('segment-map')).toBe(true);
    byId('tab-map').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(visible('segment-information')).toBe(true);
    byId('tab-information').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(visible('segment-presentation')).toBe(true);
  });

  test('switching segments loses no list work (rows, deletions, colours, filters)', async () => {
    await importExampleWorkbook();
    expect(document.querySelectorAll('#row-table-body tr')).toHaveLength(5);
    document.querySelector<HTMLInputElement>('.row-select')!.click();
    byId('delete-selected').click();
    document.querySelector<HTMLElement>('#row-table-body .colour-chip')!.click();
    expect(document.querySelectorAll('#row-table-body tr')).toHaveLength(4);

    byId('tab-map').click();
    byId('tab-presentation').click();
    byId('tab-information').click();

    expect(document.querySelectorAll('#row-table-body tr')).toHaveLength(4);
    expect(document.querySelector('#row-table-body .colour-chip')!.className).toContain('blue');
    expect(byId('counter-removed').textContent).toBe('Removed rows: 1');
    expect(document.querySelector('#row-table-body td.num')!.textContent).toBe('1');
  });

  test('tab labels follow the interface language (FR-19)', () => {
    const select = byId<HTMLSelectElement>('select-language');
    select.value = 'sv';
    select.dispatchEvent(new Event('change'));
    expect(byId('tab-map').textContent).toBe('Karta');
    expect(byId('tab-presentation').textContent).toBe('Presentation');
  });
});
