import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { byId, importExampleWorkbook, mountApp, setRole } from './harness';

function areaCells(): HTMLInputElement[] {
  return [...document.querySelectorAll<HTMLInputElement>('#row-table-body .cell-input[data-header="Group"]')];
}

function areaList(): string[] {
  return [...document.querySelectorAll<HTMLInputElement>('#area-list .vocab-name')].map((i) => i.value);
}

function datalist(): string[] {
  return [...document.querySelectorAll<HTMLOptionElement>('#area-values option')].map((o) => o.value);
}

function setCell(index: number, value: string): void {
  const input = areaCells()[index];
  input.value = value;
  input.dispatchEvent(new Event('change'));
}

function addArea(value: string): void {
  byId<HTMLInputElement>('area-new').value = value;
  byId('area-add').click();
}

describe('area vocabulary (FR-32)', () => {
  beforeEach(async () => {
    await mountApp();
    await importExampleWorkbook();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('the area list ships empty; nothing is predefined', () => {
    expect(areaList()).toEqual([]);
    expect(datalist()).toEqual([]);
    expect(byId('area-status').textContent).toBe('The list is empty.');
    expect(byId<HTMLButtonElement>('area-collect').disabled).toBe(true);
  });

  test('with the area role, every area cell is a combobox offering the list, imported rows included', () => {
    setRole('Group', 'area');
    expect(areaCells()).toHaveLength(5);
    expect(areaCells().every((c) => c.getAttribute('list') === 'area-values' && c.classList.contains('combobox'))).toBe(true);
    expect(areaCells().map((c) => c.value)).toEqual(['North', 'North', 'South', '', '']);
    // Other columns are plain text fields (FR-10).
    expect(document.querySelector('#row-table-body .cell-input[data-header="ID"]')!.hasAttribute('list')).toBe(false);
  });

  test('collecting from the column fills the list with the values present', () => {
    setRole('Group', 'area');
    byId('area-collect').click();
    expect(areaList()).toEqual(['North', 'South']);
    expect(datalist()).toEqual(['North', 'South']);
    expect(byId('area-status').textContent).toBe('2 values were added from the column.');
    byId('area-collect').click();
    expect(areaList()).toEqual(['North', 'South']);
    expect(byId('area-status').textContent).toBe('0 values were added from the column.');
  });

  test('a cell picks an existing value or takes a new one, which joins the list', () => {
    setRole('Group', 'area');
    addArea('North');
    setCell(3, 'North');
    expect(areaCells()[3].value).toBe('North');
    setCell(4, '  East ');
    expect(areaCells()[4].value).toBe('East');
    expect(areaList()).toEqual(['North', 'East']);
    expect(byId('work-dirty').classList.contains('hidden')).toBe(false);
  });

  test('values not in the list are marked, not changed', () => {
    setRole('Group', 'area');
    addArea('North');
    expect(areaCells()[2].value).toBe('South');
    expect(areaCells()[2].classList.contains('not-in-vocabulary')).toBe(true);
    expect(areaCells()[2].title).toBe('This value is not in the list.');
    expect(areaCells()[0].classList.contains('not-in-vocabulary')).toBe(false);
  });

  test('the panel adds, renames (cells follow), and removes values (cells keep their text)', () => {
    setRole('Group', 'area');
    byId('area-collect').click();
    addArea('West');
    addArea('west ');
    addArea('');
    expect(areaList()).toEqual(['North', 'South', 'West', 'west']);
    const north = document.querySelectorAll<HTMLInputElement>('#area-list .vocab-name')[0];
    north.value = 'Upper';
    north.dispatchEvent(new Event('change'));
    expect(areaList()).toEqual(['Upper', 'South', 'West', 'west']);
    expect(areaCells().map((c) => c.value)).toEqual(['Upper', 'Upper', 'South', '', '']);
    // Renaming onto an existing value is refused.
    const south = document.querySelectorAll<HTMLInputElement>('#area-list .vocab-name')[1];
    south.value = 'West';
    south.dispatchEvent(new Event('change'));
    expect(areaList()).toEqual(['Upper', 'South', 'West', 'west']);
    document.querySelectorAll<HTMLButtonElement>('#area-list .vocab-remove')[1].click();
    expect(areaList()).toEqual(['Upper', 'West', 'west']);
    expect(areaCells()[2].value).toBe('South');
    expect(areaCells()[2].classList.contains('not-in-vocabulary')).toBe(true);
  });

  test('the area list persists in presets and comes back when the preset applies', async () => {
    setRole('Group', 'area');
    byId('area-collect').click();
    addArea('East');
    byId<HTMLInputElement>('preset-name').value = 'With areas';
    byId('preset-save').click();
    expect(JSON.parse(localStorage.getItem('mapvibes.presets')!)[0].areas).toEqual(['North', 'South', 'East']);
    await mountApp({ keepStorage: true });
    await importExampleWorkbook();
    expect(areaList()).toEqual(['North', 'South', 'East']);
    expect(areaCells()).toHaveLength(5);
  });

  test('the panel follows the interface language', () => {
    const select = byId<HTMLSelectElement>('select-language');
    select.value = 'sv';
    select.dispatchEvent(new Event('change'));
    expect(byId('area-panel-summary').textContent).toBe('Områdesvärden');
    expect(byId('area-collect').textContent).toBe('Hämta värden från kolumnen');
  });
});
