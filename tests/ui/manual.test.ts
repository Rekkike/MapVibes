import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  addColumn,
  byId,
  columnKeyOf,
  esc,
  dragItemToStage,
  editCell,
  importExampleWorkbook,
  loadExampleBackground,
  markers,
  mountApp,
  placementItems,
  setRole,
  STAGE,
} from './harness';

function rowsShown(): number {
  return document.querySelectorAll('#row-table-body tr').length;
}

function numbers(): string[] {
  return [...document.querySelectorAll('#row-table-body td.num')].map((td) => td.textContent ?? '');
}

function column(label: string): string[] {
  const key = columnKeyOf(label);
  return [...document.querySelectorAll<HTMLElement>(`#row-table-body td[data-header="${esc(key)}"]`)].map(
    (td) => td.querySelector<HTMLInputElement>('.cell-input')?.value ?? td.textContent ?? '',
  );
}

describe('manual list (FR-9, FR-24, FR-30)', () => {
  beforeEach(async () => {
    await mountApp();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('an empty list can be started with no import at all', () => {
    expect(byId('start-empty').textContent).toBe('Start an empty list');
    byId('start-empty').click();
    expect(byId('list-panel').classList.contains('hidden')).toBe(false);
    expect(byId('no-file').classList.contains('hidden')).toBe(true);
    expect(rowsShown()).toBe(0);
    expect(document.querySelectorAll('#row-table-head th[data-header]')).toHaveLength(0);
    expect(byId('counter-retained').textContent).toBe('Retained rows: 0');
    expect(byId('work-dirty').classList.contains('hidden')).toBe(false);
  });

  test('columns and rows are added and edited by hand, and rows are numbered like imported rows', () => {
    byId('start-empty').click();
    addColumn('Label');
    addColumn('Zone');
    byId('add-row').click();
    byId('add-row').click();
    byId('add-row').click();
    expect(rowsShown()).toBe(3);
    expect(numbers()).toEqual(['1', '2', '3']);
    editCell(0, 'Label', 'First');
    editCell(1, 'Label', 'Second');
    editCell(2, 'Label', 'Third');
    editCell(0, 'Zone', 'East');
    editCell(2, 'Zone', 'West');
    expect(column('Label')).toEqual(['First', 'Second', 'Third']);
    expect(column('Zone')).toEqual(['East', '', 'West']);
    expect(byId('counter-retained').textContent).toBe('Retained rows: 3');
  });

  test('manual rows receive colours and marker placement exactly like imported rows', async () => {
    byId('start-empty').click();
    addColumn('Label');
    for (let i = 0; i < 3; i++) byId('add-row').click();
    ['Alpha', 'Beta', 'Gamma'].forEach((v, i) => editCell(i, 'Label', v));
    setRole(columnKeyOf('Label'), 'name');
    document.querySelectorAll<HTMLElement>('#row-table-body .colour-chip')[1].click();
    byId('tab-map').click();
    expect(placementItems().map((i) => i.querySelector('.placement-label')!.textContent)).toEqual(['Alpha', 'Beta', 'Gamma']);
    await loadExampleBackground();
    dragItemToStage(placementItems()[1], STAGE.left + 200, STAGE.top + 200);
    dragItemToStage(placementItems()[2], STAGE.left + 400, STAGE.top + 200);
    expect(markers().map((m) => [m.textContent, m.dataset.colour, m.getAttribute('aria-label')])).toEqual([
      ['2', 'blue', 'Marker 2: Beta'],
      ['3', 'green', 'Marker 3: Gamma'],
    ]);
  });

  test('deleting manual rows renumbers the list and the markers as for imported data', async () => {
    byId('start-empty').click();
    addColumn('Label');
    for (let i = 0; i < 3; i++) byId('add-row').click();
    ['Alpha', 'Beta', 'Gamma'].forEach((v, i) => editCell(i, 'Label', v));
    byId('tab-map').click();
    await loadExampleBackground();
    dragItemToStage(placementItems()[2], STAGE.left + 400, STAGE.top + 200);
    byId('tab-information').click();
    document.querySelectorAll<HTMLInputElement>('.row-select')[0].click();
    byId('delete-selected').click();
    expect(numbers()).toEqual(['1', '2']);
    expect(column('Label')).toEqual(['Beta', 'Gamma']);
    expect(byId('counter-removed').textContent).toBe('Removed rows: 1');
    expect(markers().map((m) => m.textContent)).toEqual(['2']);
  });

  test('a manual column on an imported list takes part in sorting, filtering, and grouping', async () => {
    await importExampleWorkbook();
    setRole('ID', 'identifier');
    addColumn('Rank');
    expect(column('Rank')).toEqual(['', '', '', '', '']);
    ['3', '1', '', '2', '1'].forEach((v, i) => editCell(i, 'Rank', v));
    // Imported values of imported columns stay read-only.
    expect(document.querySelector('#row-table-body td[data-header="ID"] .cell-input')).toBeNull();
    // Sorting.
    document.querySelector<HTMLButtonElement>(`th[data-header="${esc(columnKeyOf('Rank'))}"] .sort-button`)!.click();
    expect(column('Rank')).toEqual(['', '1', '1', '2', '3']);
    expect(column('ID')).toEqual(['A-03', 'A-02', 'A-05', 'A-04', 'A-01']);
    // Filtering on the manual column.
    const kind = byId<HTMLSelectElement>('select-filter-kind');
    kind.value = 'empty';
    kind.dispatchEvent(new Event('change'));
    const filterColumn = byId<HTMLSelectElement>('select-filter-column');
    expect([...filterColumn.options].map((o) => o.textContent)).toContain('Rank');
    filterColumn.value = columnKeyOf('Rank');
    filterColumn.dispatchEvent(new Event('change'));
    expect(column('ID')).toEqual(['A-03']);
    kind.value = 'all';
    kind.dispatchEvent(new Event('change'));
    // Grouping: the area role on a manual column feeds the at-a-glance panel.
    setRole(columnKeyOf('Rank'), 'area');
    byId('tab-map').click();
    await loadExampleBackground();
    dragItemToStage(placementItems()[0], STAGE.left + 100, STAGE.top + 100);
    expect(document.querySelector('#map-glance-list .glance-area')!.textContent).toBe('3');
  });

  test('a manual column can be renamed and hidden; a repeated name stays a separate column', async () => {
    await importExampleWorkbook();
    addColumn('Note');
    const manualKey = [...document.querySelectorAll<HTMLElement>('th[data-manual="true"]')][0].dataset.header!;
    expect(manualKey).not.toBe('Note');
    const rename = document.querySelector<HTMLInputElement>('.column-name-input')!;
    rename.value = 'Remark';
    rename.dispatchEvent(new Event('change'));
    expect(document.querySelector(`th[data-header="${esc(manualKey)}"] .column-label`)!.textContent).toBe('Remark');
    expect(document.querySelector('th[data-header="Note"] .column-label')!.textContent).toBe('Note');
    document.querySelector<HTMLInputElement>(`.column-visible[data-header="${esc(manualKey)}"]`)!.click();
    expect(document.querySelector(`th[data-header="${esc(manualKey)}"]`)!.classList.contains('hidden')).toBe(true);
  });

  test('rows added to an imported list continue its numbering and are editable in every column', async () => {
    await importExampleWorkbook();
    byId('add-row').click();
    expect(numbers()).toEqual(['1', '2', '3', '4', '5', '6']);
    editCell(5, 'ID', 'M-01');
    editCell(5, 'Note', 'Added by hand');
    expect(column('ID')[5]).toBe('M-01');
    expect(document.querySelectorAll('#row-table-body tr')[5].getAttribute('data-manual')).toBe('true');
  });

  test('an empty column name adds nothing', () => {
    byId('start-empty').click();
    addColumn('   ');
    expect(document.querySelectorAll('#row-table-head th[data-header]')).toHaveLength(0);
  });

  test('starting an empty list over unsaved work asks first', async () => {
    await importExampleWorkbook();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    byId('start-empty').click();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(rowsShown()).toBe(5);
    confirm.mockReturnValue(true);
    byId('start-empty').click();
    expect(rowsShown()).toBe(0);
  });
});
