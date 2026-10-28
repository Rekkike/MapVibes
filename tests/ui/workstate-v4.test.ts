import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  addColumn,
  byId,
  columnKeyOf,
  esc,
  flush,
  markers,
  mountApp,
  openWorkFile,
  placeExampleMarkers,
  pointer,
  removeSaveDialog,
  setRole,
  STAGE,
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

describe('work-state schema version 4 (FR-13, FR-32 to FR-34)', () => {
  beforeEach(async () => {
    await mountApp();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('vocabularies, the toggle, status-derived and manual symbols survive a save and open', async () => {
    await placeExampleMarkers([
      [0, 100, 100],
      [1, 300, 100],
    ]);
    byId('tab-information').click();
    setRole('Group', 'area');
    byId('area-collect').click();
    addColumn('State');
    const key = columnKeyOf('State');
    setRole(key, 'status');
    byId<HTMLInputElement>('status-new').value = 'Ready';
    byId('status-add').click();
    const symbol = document.querySelector<HTMLSelectElement>('#status-list .status-symbol')!;
    symbol.value = 'check';
    symbol.dispatchEvent(new Event('change'));
    const cell = document.querySelectorAll<HTMLSelectElement>(`#row-table-body .status-select[data-header="${esc(key)}"]`)[0];
    cell.value = 'Ready';
    cell.dispatchEvent(new Event('change'));
    byId('symbols-from-status').click();
    byId('tab-map').click();
    pointer('pointerdown', markers()[1], STAGE.left + 300, STAGE.top + 100);
    pointer('pointerup', markers()[1], STAGE.left + 300, STAGE.top + 100);
    const manual = byId<HTMLSelectElement>('marker-shape');
    manual.value = 'gear';
    manual.dispatchEvent(new Event('change'));
    const text = await save();
    const file = JSON.parse(text);
    expect(file.schemaVersion).toBe(7);
    expect(file.vocabularies).toEqual({ areas: ['North', 'South'], programs: [], statuses: [{ name: 'Ready', symbol: 'check' }] });
    expect(file.symbolsFromStatus).toBe(true);
    expect(file.markers.map((m: { symbol: string | null }) => m.symbol)).toEqual([null, 'gear']);

    await mountApp();
    stubStageLayout();
    stubImageDecoding(1200, 800);
    openWorkFile(textFile('work.json', text));
    await flush();
    expect([...document.querySelectorAll<HTMLInputElement>('#area-list .vocab-name')].map((i) => i.value)).toEqual(['North', 'South']);
    expect(byId<HTMLInputElement>('symbols-from-status').checked).toBe(true);
    expect(markers().map((m) => [m.dataset.shape, m.dataset.symbolSource])).toEqual([
      ['check', 'status'],
      ['gear', 'manual'],
    ]);
  });

  test('a schema version 3 file written by v0.6.0 opens: manual data kept, vocabularies empty, toggle off', async () => {
    stubStageLayout();
    stubImageDecoding(1200, 800);
    const v3 = readFileSync(join(process.cwd(), 'example-data', 'example-work-state-v3.json'), 'utf8');
    openWorkFile(textFile('v3.json', v3));
    await flush();
    expect(byId('work-status').textContent).toBe('Work opened.');
    expect(markers().map((m) => [m.textContent, m.dataset.shape, m.dataset.symbolSource])).toEqual([
      ['1', 'circle', 'default'],
      ['3', 'circle', 'default'],
      ['6', 'square', 'manual'],
    ]);
    expect(document.querySelectorAll('#area-list .vocab-item')).toHaveLength(0);
    expect(byId<HTMLInputElement>('symbols-from-status').checked).toBe(false);
    expect(document.querySelectorAll('.column-name-input')).toHaveLength(1);
    expect(JSON.parse(await save()).schemaVersion).toBe(7);
  });
});
