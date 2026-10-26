import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { addColumn, byId, columnKeyOf, editCell, esc, importExampleWorkbook, mountApp, setRole } from './harness';

let key: string;

function statusCells(): HTMLSelectElement[] {
  return [...document.querySelectorAll<HTMLSelectElement>(`#row-table-body .status-select[data-header="${esc(key)}"]`)];
}

function statuses(): Array<[string, string]> {
  return [...document.querySelectorAll<HTMLElement>('#status-list .vocab-item')].map((li) => [
    li.querySelector<HTMLInputElement>('.vocab-name')!.value,
    li.querySelector<HTMLSelectElement>('.status-symbol')!.value,
  ]);
}

function addStatus(name: string): void {
  byId<HTMLInputElement>('status-new').value = name;
  byId('status-add').click();
}

function item(name: string): HTMLElement {
  return document.querySelector<HTMLElement>(`#status-list .vocab-item[data-status="${esc(name)}"]`)!;
}

function choose(index: number, value: string): void {
  const select = statusCells()[index];
  select.value = value;
  select.dispatchEvent(new Event('change'));
}

describe('status role and vocabulary (FR-33)', () => {
  beforeEach(async () => {
    await mountApp();
    await importExampleWorkbook();
    addColumn('State');
    key = columnKeyOf('State');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('the status list ships empty; nothing is predefined', () => {
    expect(statuses()).toEqual([]);
    expect(byId('status-status').textContent).toBe('The list is empty.');
  });

  test('a column takes the status role in the column control; its cells choose from the list, in every row', () => {
    setRole(key, 'status');
    expect(document.querySelector<HTMLSelectElement>(`.role-select[data-header="${esc(key)}"]`)!.value).toBe('status');
    expect(statusCells()).toHaveLength(5);
    expect([...statusCells()[0].options].map((o) => o.textContent)).toEqual(['No status']);
    addStatus('Open');
    addStatus('Closed');
    expect([...statusCells()[0].options].map((o) => o.value)).toEqual(['', 'Open', 'Closed']);
    choose(0, 'Closed');
    choose(3, 'Open');
    expect(statusCells().map((c) => c.value)).toEqual(['Closed', '', '', 'Open', '']);
    expect(byId('work-dirty').classList.contains('hidden')).toBe(false);
  });

  test('an imported status column is choose-from too; values not in the list are kept and marked', () => {
    key = 'Note';
    setRole('Note', 'status');
    expect(statusCells().map((c) => c.value)).toEqual(['Alpha item', '', 'Beta item', 'Gamma item', 'Delta item']);
    const cell = statusCells()[0];
    expect(cell.classList.contains('not-in-vocabulary')).toBe(true);
    expect(cell.selectedOptions[0].textContent).toBe('Alpha item (not in the list)');
    addStatus('Alpha item');
    expect(statusCells()[0].classList.contains('not-in-vocabulary')).toBe(false);
    // Other columns are plain text fields (FR-10).
    expect(document.querySelector('#row-table-body .cell-input[data-header="ID"]')!.tagName).toBe('INPUT');
  });

  test('the panel assigns a symbol to each status, renames (cells follow), reorders, and removes', () => {
    setRole(key, 'status');
    addStatus('Open');
    addStatus('Closed');
    addStatus(' open ');
    expect(statuses()).toEqual([
      ['Open', 'circle'],
      ['Closed', 'circle'],
      ['open', 'circle'],
    ]);
    const symbol = item('Closed').querySelector<HTMLSelectElement>('.status-symbol')!;
    symbol.value = 'square';
    symbol.dispatchEvent(new Event('change'));
    expect(item('Closed').querySelector('.legend-swatch')!.classList.contains('marker-shape-square')).toBe(true);
    choose(1, 'Closed');
    const rename = item('Closed').querySelector<HTMLInputElement>('.vocab-name')!;
    rename.value = 'Done';
    rename.dispatchEvent(new Event('change'));
    expect(statuses()).toEqual([
      ['Open', 'circle'],
      ['Done', 'square'],
      ['open', 'circle'],
    ]);
    expect(statusCells()[1].value).toBe('Done');
    item('Done').querySelector<HTMLButtonElement>('.vocab-up')!.click();
    expect(statuses().map((s) => s[0])).toEqual(['Done', 'Open', 'open']);
    expect(item('Done').querySelector<HTMLButtonElement>('.vocab-up')!.disabled).toBe(true);
    item('open').querySelector<HTMLButtonElement>('.vocab-remove')!.click();
    expect(statuses().map((s) => s[0])).toEqual(['Done', 'Open']);
    // Removing a status in use keeps the cell's text, marked as not in the list.
    item('Done').querySelector<HTMLButtonElement>('.vocab-remove')!.click();
    expect(statusCells()[1].value).toBe('Done');
    expect(statusCells()[1].classList.contains('not-in-vocabulary')).toBe(true);
  });

  test('statuses persist in presets with their symbols', async () => {
    setRole(key, 'status');
    addStatus('Open');
    const symbol = item('Open').querySelector<HTMLSelectElement>('.status-symbol')!;
    symbol.value = 'hexagon';
    symbol.dispatchEvent(new Event('change'));
    byId<HTMLInputElement>('preset-name').value = 'With statuses';
    byId('preset-save').click();
    expect(JSON.parse(localStorage.getItem('mapvibes.presets')!)[0].statuses).toEqual([{ name: 'Open', symbol: 'hexagon' }]);
    await mountApp({ keepStorage: true });
    await importExampleWorkbook();
    // The preset was saved with a manual column, so it does not match the
    // re-imported file and is applied by hand.
    const select = byId<HTMLSelectElement>('preset-select');
    select.value = 'With statuses';
    select.dispatchEvent(new Event('change'));
    byId('preset-apply').click();
    expect(statuses()).toEqual([['Open', 'hexagon']]);
  });

  test('editing a manual row in the status column chooses from the list as well', () => {
    setRole(key, 'status');
    addStatus('Open');
    byId('add-row').click();
    expect(statusCells()).toHaveLength(6);
    choose(5, 'Open');
    editCell(5, 'ID', 'M-01');
    expect(statusCells()[5].value).toBe('Open');
  });
});
