import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { byId, cellValue, exampleFile, flush, importExampleWorkbook, mountApp } from './harness';

function headings(): string[] {
  return [...document.querySelectorAll<HTMLElement>('#row-table-head th[data-header] .column-label')].map((th) => th.textContent ?? '');
}

async function importFile(name: string): Promise<void> {
  const input = byId<HTMLInputElement>('file-input');
  Object.defineProperty(input, 'files', { value: [exampleFile(name, 'application/octet-stream')], configurable: true });
  input.dispatchEvent(new Event('change'));
  await flush();
}

describe('direct import (FR-1)', () => {
  beforeEach(async () => {
    await mountApp();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('there is no upfront mapping dialog', () => {
    expect(document.getElementById('mapping-panel')).toBeNull();
    expect(document.getElementById('apply-mapping')).toBeNull();
  });

  test('importing populates the list immediately with every column under the file headers', async () => {
    await importExampleWorkbook();
    expect(byId('list-panel').classList.contains('hidden')).toBe(false);
    expect(byId('no-file').classList.contains('hidden')).toBe(true);
    expect(headings()).toEqual(['ID', 'Start', 'End', 'Group', 'Note']);
    expect(document.querySelectorAll('#row-table-body tr')).toHaveLength(5);
    const first = [...document.querySelectorAll('#row-table-body tr')[0].querySelectorAll('td')].map(cellValue);
    expect(first.slice(2, 7)).toEqual(['A-01', '2024-01-05', '2024-02-01', 'North', 'Alpha item']);
  });

  test('all columns are shown, and showing and hiding stays an in-list control', async () => {
    await importExampleWorkbook();
    const toggles = [...document.querySelectorAll<HTMLInputElement>('#column-visibility .column-visible')];
    expect(toggles).toHaveLength(5);
    expect(toggles.every((t) => t.checked)).toBe(true);
    expect(byId('list-panel').contains(byId('column-visibility'))).toBe(true);
  });

  test('repeated and empty headers are shown as-is, each column with its own values', async () => {
    await importFile('example-repeated-headers.xlsx');
    expect(headings()).toEqual(['Label', 'Label', '(untitled header)', 'Note']);
    const cells = [...document.querySelectorAll('#row-table-body tr')[0].querySelectorAll('td')].map(cellValue);
    expect(cells.slice(2, 6)).toEqual(['B-01', 'first', 'x', 'one']);
  });

  test('importing over unsaved work asks first; declining keeps the work', async () => {
    await importExampleWorkbook();
    document.querySelector<HTMLInputElement>('.row-select')!.click();
    byId('delete-selected').click();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await importFile('example-repeated-headers.xlsx');
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(byId('counter-removed').textContent).toBe('Removed rows: 1');
    confirm.mockReturnValue(true);
    await importFile('example-repeated-headers.xlsx');
    expect(headings()).toEqual(['Label', 'Label', '(untitled header)', 'Note']);
    expect(byId('counter-removed').textContent).toBe('Removed rows: 0');
  });

  test('a file that cannot be parsed is reported and changes nothing', async () => {
    await importFile('example-background.png');
    expect(byId('ingest-error').classList.contains('hidden')).toBe(false);
    expect(byId('list-panel').classList.contains('hidden')).toBe(true);
  });
});
