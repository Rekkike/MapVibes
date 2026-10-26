import { beforeEach, describe, expect, test } from 'vitest';
import { byId, dragItemToStage, importExampleWorkbook, loadExampleBackground, markers, mountApp, placementItems, setRole, STAGE } from './harness';

function headingOrder(): string[] {
  return [...document.querySelectorAll<HTMLElement>('#row-table-head th[data-header]')].map((th) => th.dataset.header ?? '');
}

function roleOf(header: string): string {
  return document.querySelector<HTMLSelectElement>(`.role-select[data-header="${header}"]`)!.value;
}

function placementLabels(): string[] {
  return placementItems().map((i) => i.querySelector('.placement-label')!.textContent ?? '');
}

describe('in-list role assignment (FR-1)', () => {
  beforeEach(async () => {
    await mountApp();
    await importExampleWorkbook();
  });

  test('every column heading has a role control offering the optional roles, unassigned by default', () => {
    const selects = [...document.querySelectorAll<HTMLSelectElement>('#row-table-head .role-select')];
    expect(selects).toHaveLength(5);
    expect([...selects[0].options].map((o) => o.value)).toEqual(['', 'identifier', 'name', 'start', 'end', 'area', 'status']);
    expect([...selects[0].options].map((o) => o.textContent)).toEqual([
      'No role',
      'Identifier',
      'Name / title',
      'Start date',
      'End date',
      'Area / grouping',
      'Status',
    ]);
    expect(selects.every((s) => s.value === '')).toBe(true);
    expect(selects[0].getAttribute('aria-label')).toBe('Role: ID');
  });

  test('a role is held by one column at most: assigning it elsewhere moves it', () => {
    setRole('ID', 'identifier');
    expect(roleOf('ID')).toBe('identifier');
    setRole('Note', 'identifier');
    expect(roleOf('Note')).toBe('identifier');
    expect(roleOf('ID')).toBe('');
    setRole('Note', '');
    expect(roleOf('Note')).toBe('');
  });

  test('without roles, the display name falls back to the item number', () => {
    expect(placementLabels()).toEqual(['No. 1', 'No. 2', 'No. 3', 'No. 4', 'No. 5']);
  });

  test('with an identifier, the display name is the identifier value', () => {
    setRole('ID', 'identifier');
    expect(placementLabels()).toEqual(['A-01', 'A-02', 'A-03', 'A-04', 'A-05']);
  });

  test('the name/title is the primary label: it leads the list and is used as the display name, with fallbacks for empty values', () => {
    setRole('ID', 'identifier');
    setRole('Note', 'name');
    expect(headingOrder()).toEqual(['Note', 'ID', 'Start', 'End', 'Group']);
    const firstRow = document.querySelectorAll('#row-table-body tr')[0];
    const cells = [...firstRow.querySelectorAll('td')];
    expect(cells[2].textContent).toBe('Alpha item');
    expect(cells[2].classList.contains('primary-label')).toBe(true);
    // Row 2 has an empty Note: the identifier applies.
    expect(placementLabels()).toEqual(['Alpha item', 'A-02', 'Beta item', 'Gamma item', 'Delta item']);
  });

  test('marker labels use the display name', async () => {
    setRole('Note', 'name');
    byId('tab-map').click();
    await loadExampleBackground();
    dragItemToStage(placementItems()[0], STAGE.left + 100, STAGE.top + 100);
    dragItemToStage(placementItems()[1], STAGE.left + 200, STAGE.top + 100);
    expect(markers().map((m) => m.getAttribute('aria-label'))).toEqual(['Marker 1: Alpha item', 'Marker 2: No. 2']);
  });

  test('roles do not alter the data, and sorting still works from the heading', () => {
    setRole('Group', 'area');
    document.querySelector<HTMLButtonElement>('th[data-header="Group"] .sort-button')!.click();
    expect(document.querySelector('th[data-header="Group"]')!.getAttribute('data-sort')).toBe('asc');
    expect(roleOf('Group')).toBe('area');
    const values = [...document.querySelectorAll('#row-table-body td[data-header="Group"]')].map((td) => td.textContent);
    expect(values).toEqual([...values].sort());
  });

  test('assigning a role marks the work as unsaved', () => {
    setRole('ID', 'identifier');
    expect(byId('work-dirty').classList.contains('hidden')).toBe(false);
  });
});
