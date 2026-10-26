import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  byId,
  flush,
  markers,
  mountApp,
  openWorkFile,
  placeExampleMarkers,
  pointer,
  presentationMarkers,
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

describe('work-state schema version 2 (FR-13)', () => {
  beforeEach(async () => {
    await mountApp();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('roles, shapes, visibility toggles, and presets survive a save and open in a fresh session', async () => {
    await placeExampleMarkers([
      [0, 100, 100],
      [2, 400, 300],
    ]);
    byId('tab-information').click();
    setRole('Note', 'name');
    setRole('Group', 'area');
    byId<HTMLInputElement>('preset-name').value = 'Standard';
    byId('preset-save').click();
    byId('tab-map').click();
    pointer('pointerdown', markers()[1], STAGE.left + 400, STAGE.top + 300);
    pointer('pointerup', markers()[1], STAGE.left + 400, STAGE.top + 300);
    const shape = byId<HTMLSelectElement>('marker-shape');
    shape.value = 'triangle';
    shape.dispatchEvent(new Event('change'));
    byId('tab-presentation').click();
    document.querySelectorAll<HTMLInputElement>('.visibility-toggle')[0].click();
    const text = await save();

    await mountApp(); // empty storage: presets come from the file only
    stubStageLayout();
    stubImageDecoding(1200, 800);
    openWorkFile(textFile('work.json', text));
    await flush();
    expect(document.querySelector<HTMLSelectElement>('.role-select[data-header="Note"]')!.value).toBe('name');
    expect(document.querySelector<HTMLSelectElement>('.role-select[data-header="Group"]')!.value).toBe('area');
    expect(markers().map((m) => [m.textContent, m.dataset.shape, m.classList.contains('marker-excluded')])).toEqual([
      ['1', 'circle', true],
      ['3', 'triangle', false],
    ]);
    expect(presentationMarkers().map((m) => m.textContent)).toEqual(['3']);
    expect([...byId<HTMLSelectElement>('preset-select').options].map((o) => o.value)).toEqual(['', 'Standard']);
    expect(JSON.parse(localStorage.getItem('mapvibes.presets')!)[0].name).toBe('Standard');
    expect(byId('work-dirty').classList.contains('hidden')).toBe(true);
  });

  test('a schema version 1 file written by v0.4.0 still opens, with defaults for the new content', async () => {
    stubStageLayout();
    stubImageDecoding(1785, 2526);
    const v1 = readFileSync(join(process.cwd(), 'example-data', 'example-work-state-v1.json'), 'utf8');
    openWorkFile(textFile('old.json', v1));
    await flush();
    expect(byId('work-status').textContent).toBe('Work opened.');
    expect(byId('counter-retained').textContent).toBe('Retained rows: 4');
    expect(byId('counter-removed').textContent).toBe('Removed rows: 1');
    expect(markers().map((m) => [m.textContent, m.dataset.shape])).toEqual([
      ['1', 'circle'],
      ['2', 'circle'],
      ['3', 'circle'],
    ]);
    expect(markers()[1].classList.contains('marker-blue')).toBe(true);
    expect(document.documentElement.dataset.segment).toBe('map');
    // Saving the migrated work writes the current schema version.
    expect(JSON.parse(await save()).schemaVersion).toBe(3);
  });
});
