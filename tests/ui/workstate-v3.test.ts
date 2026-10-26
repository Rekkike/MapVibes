import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  addColumn,
  byId,
  columnKeyOf,
  editCell,
  flush,
  importExampleWorkbook,
  markers,
  mountApp,
  openWorkFile,
  removeSaveDialog,
  stubImageDecoding,
  stubSaveDialog,
  stubStageLayout,
  textFile,
} from './harness';

async function save(): Promise<string> {
  const written = stubSaveDialog();
  byId('work-save').click();
  await flush();
  removeSaveDialog();
  return written.text!;
}

function cellValues(): string[][] {
  return [...document.querySelectorAll('#row-table-body tr')].map((tr) =>
    [...tr.querySelectorAll<HTMLElement>('td[data-header]')].map((td) => td.querySelector<HTMLInputElement>('.cell-input')?.value ?? td.textContent ?? ''),
  );
}

describe('work-state schema version 3 (FR-13, FR-9, FR-24)', () => {
  beforeEach(async () => {
    await mountApp();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('a list started empty and filled by hand survives a save and open, still editable', async () => {
    byId('start-empty').click();
    addColumn('Label');
    addColumn('Zone');
    byId('add-row').click();
    byId('add-row').click();
    editCell(0, 'Label', 'First');
    editCell(1, 'Label', 'Second');
    editCell(1, 'Zone', 'West');
    const text = await save();
    const file = JSON.parse(text);
    expect(file.schemaVersion).toBe(6);
    expect(file.columns.manual.map((c: { label: string }) => c.label)).toEqual(['Label', 'Zone']);
    expect(file.rows.map((r: { origin: string }) => r.origin)).toEqual(['manual', 'manual']);

    await mountApp();
    openWorkFile(textFile('work.json', text));
    await flush();
    expect(cellValues()).toEqual([
      ['First', ''],
      ['Second', 'West'],
    ]);
    // Still a manual list: cells remain editable and columns renameable.
    editCell(0, 'Zone', 'East');
    expect(cellValues()[0]).toEqual(['First', 'East']);
    expect(document.querySelectorAll('.column-name-input')).toHaveLength(2);
    byId('add-row').click();
    expect(document.querySelectorAll('#row-table-body td.num')[2].textContent).toBe('3');
  });

  test('manual additions to an imported list keep their origin after opening', async () => {
    await importExampleWorkbook();
    addColumn('Rank');
    editCell(0, 'Rank', '7');
    byId('add-row').click();
    editCell(5, 'ID', 'M-01');
    const text = await save();
    await mountApp();
    openWorkFile(textFile('work.json', text));
    await flush();
    const rank = columnKeyOf('Rank');
    expect(document.querySelector<HTMLInputElement>(`#row-table-body tr .cell-input[data-header="${rank}"]`)!.value).toBe('7');
    expect(document.querySelectorAll('#row-table-body tr')[5].getAttribute('data-manual')).toBe('true');
    expect(document.querySelectorAll('#row-table-body tr')[5].querySelector<HTMLInputElement>('td[data-header="ID"] .cell-input')!.value).toBe('M-01');
  });

  test('a schema version 2 file written by v0.5.0 still opens, with everything it holds', async () => {
    stubStageLayout();
    stubImageDecoding(1200, 800);
    const v2 = readFileSync(join(process.cwd(), 'example-data', 'example-work-state-v2.json'), 'utf8');
    openWorkFile(textFile('v2.json', v2));
    await flush();
    expect(byId('work-status').textContent).toBe('Work opened.');
    expect(document.querySelector<HTMLSelectElement>('.role-select[data-header="Note"]')!.value).toBe('name');
    expect(markers().map((m) => [m.textContent, m.dataset.shape, m.classList.contains('marker-excluded')])).toEqual([
      ['1', 'circle', false],
      ['2', 'circle', true],
      ['3', 'diamond', false],
      ['4', 'circle', false],
      ['5', 'circle', false],
    ]);
    // Only the area column (FR-32) is choose-from; every value is editable (FR-10).
    expect(document.querySelectorAll('#row-table-body .cell-input.combobox')).toHaveLength(5);
    expect(document.querySelectorAll('#row-table-body .cell-input.combobox:not([data-header="Group"])')).toHaveLength(0);
    expect(JSON.parse(await save()).schemaVersion).toBe(6);
  });
});
