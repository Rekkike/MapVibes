import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { byId, dragItemToStage, flush, importExampleWorkbook, loadExampleBackground, markers, mountApp, placementItems, STAGE, stubSaveDialog, type Picker } from './harness';

async function prepareWork(): Promise<void> {
  await importExampleWorkbook();
  const chips = () => [...document.querySelectorAll<HTMLElement>('#row-table-body .colour-chip')];
  chips()[2].click(); // row 3 -> blue
  document.querySelectorAll<HTMLInputElement>('.row-select')[1].click();
  byId('delete-selected').click(); // row 2 removed
  byId('tab-map').click();
  await loadExampleBackground();
  dragItemToStage(placementItems()[1], STAGE.left + 300, STAGE.top + 200); // former row 3, now number 2
  byId('map-zoom-in').click();
}

describe('Save work (FR-13)', () => {
  beforeEach(async () => {
    await mountApp();
  });

  afterEach(() => {
    delete (window as unknown as { showSaveFilePicker?: Picker }).showSaveFilePicker;
  });

  test('Save is unavailable while there is no work', () => {
    expect(byId<HTMLButtonElement>('work-save').disabled).toBe(true);
  });

  test('Save writes the complete work state to the file the user chooses', async () => {
    await prepareWork();
    const written = stubSaveDialog();
    expect(byId<HTMLButtonElement>('work-save').disabled).toBe(false);
    byId('work-save').click();
    await flush();
    expect(written.name).toBe('mapvibes-work-state.json');
    expect(written.closed).toBe(true);
    const file = JSON.parse(written.text!);
    expect(file.format).toBe('mapvibes-work-state');
    expect(file.schemaVersion).toBe(2);
    expect(file.columns.headers).toEqual(['ID', 'Start', 'End', 'Group', 'Note']);
    expect(file.columns.roles).toEqual({});
    expect(file.markers[0].shape).toBe('circle');
    expect(file.presentation).toEqual({ hidden: [] });
    expect(file.presets).toEqual([]);
    expect(file.rows).toHaveLength(5);
    expect(file.rows.map((r: { status: string }) => r.status)).toEqual(['retained', 'removed', 'retained', 'retained', 'retained']);
    expect(file.rows.map((r: { number: number | null }) => r.number)).toEqual([1, null, 2, 3, 4]);
    expect(file.rows[2].colour).toBe('blue');
    expect(file.rows[1].values.ID).toBe('A-02');
    expect(file.background.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect([file.background.width, file.background.height]).toEqual([1200, 800]);
    expect(file.markers).toHaveLength(1);
    expect(file.markers[0].row).toBe(2);
    expect(file.markers[0].x).toBeCloseTo(450, 6);
    expect(file.view.segment).toBe('map');
    expect(file.view.viewport.scale).toBeCloseTo((2 / 3) * 1.25, 10);
    expect(byId('work-status').textContent).toBe('Work saved.');
    expect(markers()).toHaveLength(1);
  });

  test('cancelling the save dialog writes nothing and reports nothing', async () => {
    await prepareWork();
    const written = stubSaveDialog('cancel');
    byId('work-save').click();
    await flush();
    expect(written.text).toBeUndefined();
    expect(byId('work-status').textContent).toBe('');
  });

  test('a failed write is reported', async () => {
    await prepareWork();
    stubSaveDialog('fail');
    byId('work-save').click();
    await flush();
    expect(byId('work-status').textContent).toBe('The work could not be saved.');
  });

  test('without a save dialog, the file is offered as a local download', async () => {
    await prepareWork();
    const blobs: Blob[] = [];
    const clicked: Array<{ href: string; download: string }> = [];
    URL.createObjectURL = (b: Blob) => {
      blobs.push(b);
      return 'blob:local-1';
    };
    URL.revokeObjectURL = () => undefined;
    const original = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      clicked.push({ href: this.getAttribute('href') ?? '', download: this.download });
    };
    try {
      byId('work-save').click();
      await flush();
    } finally {
      HTMLAnchorElement.prototype.click = original;
    }
    expect(clicked).toEqual([{ href: 'blob:local-1', download: 'mapvibes-work-state.json' }]);
    expect(blobs[0].type).toBe('application/json');
    expect(document.querySelector('a[download]')).toBeNull();
  });
});
