import { beforeEach, describe, expect, test } from 'vitest';
import { byId, importExampleWorkbook, mountApp, setRole } from './harness';

function headCells(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('#row-table-head th')].filter((c) => !c.classList.contains('hidden'));
}

function rowCells(index = 0): HTMLElement[] {
  return [...document.querySelectorAll('#row-table-body tr')[index].querySelectorAll<HTMLElement>('td')].filter(
    (c) => !c.classList.contains('hidden'),
  );
}

// Regression test for the pre-existing defect: the header row lacked a cell for
// the row-selection column, so every heading sat one column left of its values;
// a hidden column also hid its values but not its heading.
describe('list header alignment', () => {
  beforeEach(async () => {
    await mountApp();
    await importExampleWorkbook();
  });

  test('the header row has exactly one cell per body column', () => {
    expect(headCells()).toHaveLength(rowCells().length);
    expect(headCells()[0].classList.contains('select-column')).toBe(true);
    expect(headCells()[0].textContent).toBe('Select');
    expect(rowCells()[0].querySelector('.row-select')).not.toBeNull();
    expect(headCells()[1].textContent).toBe('No.');
    expect(rowCells()[1].classList.contains('num')).toBe(true);
  });

  test('every column heading sits directly above that column\'s values', () => {
    const heads = headCells();
    const cells = rowCells();
    heads.forEach((th, i) => {
      if (th.dataset.header) expect(cells[i].dataset.header).toBe(th.dataset.header);
    });
    expect(heads.at(-1)!.textContent).toBe('Colour');
    expect(cells.at(-1)!.querySelector('.colour-chip')).not.toBeNull();
  });

  test('alignment holds when a column is hidden, and the hidden column hides its heading too', () => {
    document.querySelector<HTMLInputElement>('.column-visible[data-header="Start"]')!.click();
    expect(document.querySelector('th[data-header="Start"]')!.classList.contains('hidden')).toBe(true);
    expect(headCells()).toHaveLength(rowCells().length);
    headCells().forEach((th, i) => {
      if (th.dataset.header) expect(rowCells()[i].dataset.header).toBe(th.dataset.header);
    });
  });

  test('alignment holds when the name/title column leads', () => {
    setRole('Note', 'name');
    headCells().forEach((th, i) => {
      if (th.dataset.header) expect(rowCells()[i].dataset.header).toBe(th.dataset.header);
    });
    expect(headCells()[2].dataset.header).toBe('Note');
  });

  test('the selection heading is translated', () => {
    const select = byId<HTMLSelectElement>('select-language');
    select.value = 'sv';
    select.dispatchEvent(new Event('change'));
    expect(headCells()[0].textContent).toBe('Markera');
  });
});
