import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  byId,
  dragItemToStage,
  flush,
  importExampleWorkbook,
  loadExampleBackground,
  markers,
  mountApp,
  openWorkFile,
  placementItems,
  pointer,
  removeSaveDialog,
  STAGE,
  stubSaveDialog,
  textFile,
} from './harness';

function indicatorShown(): boolean {
  return !byId('work-dirty').classList.contains('hidden');
}

function unloadBlocked(): boolean {
  const e = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
}

async function save(): Promise<string> {
  const written = stubSaveDialog();
  byId('work-save').click();
  await flush();
  removeSaveDialog();
  return written.text!;
}

describe('unsaved-changes awareness', () => {
  beforeEach(async () => {
    await mountApp();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    removeSaveDialog();
  });

  test('a fresh session has no unsaved changes and does not guard unloading', () => {
    expect(indicatorShown()).toBe(false);
    expect(unloadBlocked()).toBe(false);
  });

  test('importing marks the work unsaved: the indicator shows and unloading is guarded', async () => {
    await importExampleWorkbook();
    expect(indicatorShown()).toBe(true);
    expect(byId('work-dirty').textContent).toBe('Unsaved changes');
    expect(document.documentElement.dataset.unsaved).toBe('true');
    expect(unloadBlocked()).toBe(true);
  });

  test('saving clears the indicator and the guard', async () => {
    await importExampleWorkbook();
    await save();
    expect(indicatorShown()).toBe(false);
    expect(unloadBlocked()).toBe(false);
  });

  test('a cancelled save leaves the work unsaved', async () => {
    await importExampleWorkbook();
    stubSaveDialog('cancel');
    byId('work-save').click();
    await flush();
    expect(indicatorShown()).toBe(true);
    expect(unloadBlocked()).toBe(true);
  });

  test('every content change marks the work unsaved again', async () => {
    await importExampleWorkbook();
    byId('tab-map').click();
    await loadExampleBackground();
    const changes: Array<[string, () => void]> = [
      ['place a marker', () => dragItemToStage(placementItems()[0], STAGE.left + 100, STAGE.top + 100)],
      [
        'move a marker',
        () => {
          pointer('pointerdown', markers()[0], STAGE.left + 100, STAGE.top + 100);
          pointer('pointermove', markers()[0], STAGE.left + 150, STAGE.top + 120);
          pointer('pointerup', markers()[0], STAGE.left + 150, STAGE.top + 120);
        },
      ],
      ['remove a marker', () => byId('marker-remove').click()],
      ['change a colour', () => document.querySelector<HTMLElement>('#row-table-body .colour-chip')!.click()],
      [
        'remove a row',
        () => {
          document.querySelector<HTMLInputElement>('.row-select')!.click();
          byId('delete-selected').click();
        },
      ],
    ];
    for (const [label, change] of changes) {
      await save();
      expect(indicatorShown(), label).toBe(false);
      change();
      expect(indicatorShown(), label).toBe(true);
    }
  });

  test('view changes alone do not count as unsaved changes', async () => {
    await importExampleWorkbook();
    byId('tab-map').click();
    await loadExampleBackground();
    await save();
    byId('map-zoom-in').click();
    byId('map-fit').click();
    byId('tab-information').click();
    document.querySelector<HTMLElement>('#row-table-head th.sortable')!.click();
    expect(indicatorShown()).toBe(false);
  });

  test('opening a work-state file leaves the work in the saved state', async () => {
    await importExampleWorkbook();
    const text = await save();
    document.querySelector<HTMLElement>('#row-table-body .colour-chip')!.click();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    openWorkFile(textFile('work.json', text));
    await flush();
    expect(indicatorShown()).toBe(false);
    expect(unloadBlocked()).toBe(false);
  });

  test('no automatic writes: editing and unloading never write a file or store work', async () => {
    const picker = vi.fn();
    (window as unknown as { showSaveFilePicker: unknown }).showSaveFilePicker = picker;
    const createObjectURL = vi.fn(() => 'blob:x');
    URL.createObjectURL = createObjectURL;
    await importExampleWorkbook();
    document.querySelector<HTMLElement>('#row-table-body .colour-chip')!.click();
    unloadBlocked();
    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('unload'));
    await flush();
    expect(picker).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
    expect(keys.every((k) => k === 'mapvibes.preferences')).toBe(true);
    expect(sessionStorage.length).toBe(0);
  });

  test('the indicator follows the interface language', async () => {
    await importExampleWorkbook();
    const select = byId<HTMLSelectElement>('select-language');
    select.value = 'sv';
    select.dispatchEvent(new Event('change'));
    expect(byId('work-dirty').textContent).toBe('Osparade ändringar');
  });
});
