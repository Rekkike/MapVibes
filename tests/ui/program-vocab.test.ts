import { beforeEach, describe, expect, test } from 'vitest';
import { addColumn, byId, columnKeyOf, editCell, esc, importExampleWorkbook, mountApp, setRole } from './harness';

// A column added by hand holds the programme values: the example workbook has
// no such column, and most items belong to no programme.
let key: string;

function cells(): HTMLInputElement[] {
  return [...document.querySelectorAll<HTMLInputElement>(`#row-table-body .cell-input[data-header="${esc(key)}"]`)];
}

function programList(): string[] {
  return [...document.querySelectorAll<HTMLInputElement>('#program-list .vocab-name')].map((i) => i.value);
}

function datalist(): string[] {
  return [...document.querySelectorAll<HTMLOptionElement>('#program-values option')].map((o) => o.value);
}

function addProgram(value: string): void {
  byId<HTMLInputElement>('program-new').value = value;
  byId('program-add').click();
}

describe('program role and vocabulary (FR-43)', () => {
  beforeEach(async () => {
    await mountApp();
    await importExampleWorkbook();
    addColumn('Prog');
    key = columnKeyOf('Prog');
    editCell(0, 'Prog', 'P-East');
    editCell(2, 'Prog', 'P-East');
    editCell(3, 'Prog', 'P-West');
    setRole(key, 'program');
  });

  test('the role is offered as "Programme"; the list starts empty with an explanation', () => {
    const select = document.querySelector<HTMLSelectElement>(`#row-table-head .role-select[data-header="${esc(key)}"]`)!;
    expect(select.value).toBe('program');
    expect(select.selectedOptions[0].textContent).toBe('Programme');
    expect(byId('program-panel-summary').textContent).toBe('Programmes');
    expect(byId('program-panel-hint').textContent).toContain('most items belong to none, and an empty value is normal');
    expect(programList()).toEqual([]);
    expect(byId('program-status').textContent).toBe('The list is empty.');
  });

  test('every cell of the programme column is a combobox offering the list; empty values are normal', () => {
    expect(cells()).toHaveLength(5);
    expect(cells().every((c) => c.getAttribute('list') === 'program-values' && c.classList.contains('combobox'))).toBe(true);
    // Values not yet in the list are marked; empty values are not.
    expect(cells().map((c) => c.classList.contains('not-in-vocabulary'))).toEqual([true, false, true, true, false]);
  });

  test('collecting from the column fills the list; the cells are then in the list', () => {
    byId('program-collect').click();
    expect(programList()).toEqual(['P-East', 'P-West']);
    expect(datalist()).toEqual(['P-East', 'P-West']);
    expect(byId('program-status').textContent).toBe('2 values were added from the column.');
    expect(cells().some((c) => c.classList.contains('not-in-vocabulary'))).toBe(false);
  });

  test('a value typed into a cell joins the list', () => {
    editCell(1, 'Prog', '  P-North ');
    expect(cells()[1].value).toBe('P-North');
    expect(programList()).toEqual(['P-North']);
  });

  test('values are added, renamed (the cells follow), and removed (the cells keep their text, marked)', () => {
    addProgram('P-East');
    addProgram('P-South');
    expect(programList()).toEqual(['P-East', 'P-South']);
    const rename = document.querySelectorAll<HTMLInputElement>('#program-list .vocab-name')[0];
    rename.value = 'P-Central';
    rename.dispatchEvent(new Event('change'));
    expect(programList()).toEqual(['P-Central', 'P-South']);
    expect(cells().map((c) => c.value)).toEqual(['P-Central', '', 'P-Central', 'P-West', '']);
    document.querySelectorAll<HTMLButtonElement>('#program-list .vocab-remove')[0].click();
    expect(programList()).toEqual(['P-South']);
    expect(cells()[0].value).toBe('P-Central');
    expect(cells()[0].classList.contains('not-in-vocabulary')).toBe(true);
  });

  test('the areas and the programmes are separate lists', () => {
    setRole('Group', 'area');
    byId('area-collect').click();
    byId('program-collect').click();
    expect([...document.querySelectorAll<HTMLInputElement>('#area-list .vocab-name')].map((i) => i.value)).toEqual(['North', 'South']);
    expect(programList()).toEqual(['P-East', 'P-West']);
  });

  test('a saved preset keeps the programme list; applying it restores the list', () => {
    byId('program-collect').click();
    byId<HTMLInputElement>('preset-name').value = 'With programmes';
    byId('preset-save').click();
    const stored = JSON.parse(localStorage.getItem('mapvibes.presets')!);
    expect(stored[0].programs).toEqual(['P-East', 'P-West']);
    expect(stored[0].roles.program).toBe(key);
    document.querySelectorAll<HTMLButtonElement>('#program-list .vocab-remove')[0].click();
    expect(programList()).toEqual(['P-West']);
    const select = byId<HTMLSelectElement>('preset-select');
    select.value = 'With programmes';
    select.dispatchEvent(new Event('change'));
    byId('preset-apply').click();
    expect(programList()).toEqual(['P-East', 'P-West']);
  });

  test('the panel follows the language', () => {
    const lang = byId<HTMLSelectElement>('select-language');
    lang.value = 'sv';
    lang.dispatchEvent(new Event('change'));
    expect(byId('program-panel-summary').textContent).toBe('Program');
    expect(byId('program-new').getAttribute('aria-label')).toBe('Nytt program');
    const select = document.querySelector<HTMLSelectElement>(`#row-table-head .role-select[data-header="${esc(key)}"]`)!;
    expect(select.selectedOptions[0].textContent).toBe('Program');
  });
});
