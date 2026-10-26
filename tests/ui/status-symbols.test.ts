import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { addColumn, byId, columnKeyOf, esc, flush, markers, mountApp, placeExampleMarkers, pointer, presentationMarkers, setRole, STAGE } from './harness';

let key: string;

function statusCell(index: number): HTMLSelectElement {
  return [...document.querySelectorAll<HTMLSelectElement>(`#row-table-body .status-select[data-header="${esc(key)}"]`)][index];
}

function choose(index: number, value: string): void {
  byId('tab-information').click();
  const select = statusCell(index);
  select.value = value;
  select.dispatchEvent(new Event('change'));
  byId('tab-map').click();
}

function addStatus(name: string, symbol: string): void {
  byId('tab-information').click();
  byId<HTMLInputElement>('status-new').value = name;
  byId('status-add').click();
  const select = document.querySelector<HTMLSelectElement>(`#status-list .vocab-item[data-status="${esc(name)}"] .status-symbol`)!;
  select.value = symbol;
  select.dispatchEvent(new Event('change'));
  byId('tab-map').click();
}

function toggle(on: boolean): void {
  byId('tab-information').click();
  const box = byId<HTMLInputElement>('symbols-from-status');
  if (box.checked !== on) box.click();
  byId('tab-map').click();
}

function symbols(): Array<[string, string, string]> {
  return markers().map((m) => [m.textContent ?? '', m.dataset.shape ?? '', m.dataset.symbolSource ?? '']);
}

function chooseManual(index: number, symbol: string): void {
  const m = markers()[index];
  pointer('pointerdown', m, STAGE.left + parseFloat(m.style.left), STAGE.top + parseFloat(m.style.top));
  pointer('pointerup', m, STAGE.left + parseFloat(m.style.left), STAGE.top + parseFloat(m.style.top));
  const select = byId<HTMLSelectElement>('marker-shape');
  select.value = symbol;
  select.dispatchEvent(new Event('change'));
}

describe('assign marker symbols from status (FR-34)', () => {
  beforeEach(async () => {
    await mountApp();
    await placeExampleMarkers([
      [0, 100, 100],
      [1, 300, 100],
      [2, 500, 100],
    ]);
    byId('tab-information').click();
    addColumn('State');
    key = columnKeyOf('State');
    setRole(key, 'status');
    byId('tab-map').click();
    addStatus('Ready', 'check');
    addStatus('Waiting', 'pause');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('the toggle exists, is clearly labelled, and is off by default', () => {
    byId('tab-information').click();
    expect(byId<HTMLInputElement>('symbols-from-status').checked).toBe(false);
    expect(byId('symbols-from-status-label').textContent).toBe('Assign marker symbols from status');
    expect(byId('symbols-from-status-hint').textContent).toMatch(/a manually chosen symbol is never overridden/);
  });

  test('while off, choosing a status in a cell never changes any marker symbol', () => {
    choose(0, 'Ready');
    choose(1, 'Waiting');
    expect(symbols()).toEqual([
      ['1', 'circle', 'default'],
      ['2', 'circle', 'default'],
      ['3', 'circle', 'default'],
    ]);
    // Symbols still change per marker in the Map segment.
    chooseManual(2, 'gear');
    expect(symbols()[2]).toEqual(['3', 'gear', 'manual']);
  });

  test('when enabled, markers without a manual symbol follow their status; a manual symbol is never overridden', () => {
    chooseManual(1, 'hexagon');
    choose(0, 'Ready');
    choose(1, 'Waiting');
    toggle(true);
    expect(symbols()).toEqual([
      ['1', 'check', 'status'],
      ['2', 'hexagon', 'manual'],
      ['3', 'circle', 'default'],
    ]);
    // Status changes now carry through, except for the manual marker.
    choose(2, 'Waiting');
    choose(0, 'Waiting');
    choose(1, 'Ready');
    expect(symbols()).toEqual([
      ['1', 'pause', 'status'],
      ['2', 'hexagon', 'manual'],
      ['3', 'pause', 'status'],
    ]);
    // A changed status symbol carries through as well.
    byId('tab-information').click();
    const symbolSelect = document.querySelector<HTMLSelectElement>('#status-list .vocab-item[data-status="Waiting"] .status-symbol')!;
    symbolSelect.value = 'cross';
    symbolSelect.dispatchEvent(new Event('change'));
    byId('tab-map').click();
    expect(symbols().map((s) => s[1])).toEqual(['cross', 'hexagon', 'cross']);
  });

  test('switching the toggle off again returns the status-derived symbols to the default; manual symbols stay', () => {
    chooseManual(1, 'hexagon');
    choose(0, 'Ready');
    toggle(true);
    expect(symbols()[0][1]).toBe('check');
    toggle(false);
    expect(symbols()).toEqual([
      ['1', 'circle', 'default'],
      ['2', 'hexagon', 'manual'],
      ['3', 'circle', 'default'],
    ]);
  });

  test('the status-derived symbol shows in the lists and on the presentation stage', async () => {
    choose(0, 'Ready');
    toggle(true);
    expect(document.querySelector('#placement-list .placement-item .marker-badge')!.classList.contains('marker-icon-check')).toBe(true);
    byId('tab-presentation').click();
    await flush();
    expect(presentationMarkers()[0].dataset.shape).toBe('check');
  });

  test('the toggle marks the work as changed', () => {
    toggle(true);
    expect(byId('work-dirty').classList.contains('hidden')).toBe(false);
  });
});
