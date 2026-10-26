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
  removeSaveDialog,
  STAGE,
  stubImageDecoding,
  stubSaveDialog,
  stubStageLayout,
  textFile,
} from './harness';

// Builds real work through the interface and saves it with the stubbed save
// dialog; returns the file text exactly as the application wrote it.
async function savedWorkText(): Promise<string> {
  await mountApp();
  await importExampleWorkbook();
  const chips = () => [...document.querySelectorAll<HTMLElement>('#row-table-body .colour-chip')];
  chips()[3].click();
  chips()[3].click(); // row 4 -> yellow
  document.querySelectorAll<HTMLInputElement>('.row-select')[0].click();
  byId('delete-selected').click(); // row 1 removed
  document.querySelector<HTMLInputElement>('.column-visible[data-header="Note"]')!.click(); // hide Note
  const kind = byId<HTMLSelectElement>('select-filter-kind');
  kind.value = 'nonempty';
  kind.dispatchEvent(new Event('change'));
  const column = byId<HTMLSelectElement>('select-filter-column');
  column.value = 'Start';
  column.dispatchEvent(new Event('change'));
  byId('tab-map').click();
  await loadExampleBackground();
  dragItemToStage(placementItems()[0], STAGE.left + 120, STAGE.top + 140);
  dragItemToStage(placementItems()[2], STAGE.left + 520, STAGE.top + 360);
  byId('map-zoom-in').click();
  const written = stubSaveDialog();
  byId('work-save').click();
  await flush();
  removeSaveDialog();
  return written.text!;
}

function snapshot() {
  return {
    rows: [...document.querySelectorAll('#row-table-body tr')].map((tr) =>
      [...tr.querySelectorAll('td')].slice(1).map((td) => td.querySelector('.colour-chip')?.className ?? td.textContent),
    ),
    retained: byId('counter-retained').textContent,
    removed: byId('counter-removed').textContent,
    hiddenNote: (document.querySelector('.column-visible[data-header="Note"]') as HTMLInputElement | null)?.checked,
    filterKind: byId<HTMLSelectElement>('select-filter-kind').value,
    filterColumn: byId<HTMLSelectElement>('select-filter-column').value,
    // Marker selection is transient interaction state and is not saved.
    markers: markers().map((m) => [m.textContent, m.className.replace(' selected', ''), m.style.left, m.style.top, m.getAttribute('aria-label')]),
    placement: placementItems().map((i) => [i.querySelector('.marker-badge')!.textContent, i.dataset.placed]),
    transform: byId('map-content').style.transform,
    image: byId<HTMLImageElement>('map-image').getAttribute('src'),
    segment: document.documentElement.dataset.segment,
  };
}

describe('Open work (FR-13)', () => {
  let text: string;
  let before: ReturnType<typeof snapshot>;

  beforeEach(async () => {
    text = await savedWorkText();
    before = snapshot();
    // A fresh application instance, as after a reload.
    await mountApp();
    stubStageLayout();
    stubImageDecoding(1200, 800);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('opening the saved file in a fresh session restores the complete state', async () => {
    expect(markers()).toHaveLength(0);
    openWorkFile(textFile('work.json', text));
    await flush();
    const after = snapshot();
    expect(after).toEqual(before);
    expect(after.removed).toBe('Removed rows: 1');
    expect(after.markers.map((m) => m[0])).toEqual(['1', '3']);
    expect(after.segment).toBe('map');
    expect(after.image!.startsWith('data:image/png;base64,')).toBe(true);
    expect(byId('work-status').textContent).toBe('Work opened.');
    expect(byId('no-file').classList.contains('hidden')).toBe(true);
  });

  test('the restored work saves to an identical file, apart from the save time', async () => {
    openWorkFile(textFile('work.json', text));
    await flush();
    const written = stubSaveDialog();
    byId('work-save').click();
    await flush();
    removeSaveDialog();
    const strip = (t: string) => ({ ...JSON.parse(t), savedAt: null });
    expect(strip(written.text!)).toEqual(strip(text));
  });

  test('opening over unsaved work asks for confirmation; declining changes nothing', async () => {
    await importExampleWorkbook();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    openWorkFile(textFile('work.json', text));
    await flush();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0]).toMatch(/unsaved changes/);
    expect(byId('counter-retained').textContent).toBe('Retained rows: 5');
    expect(byId('map-stage').dataset.hasBackground).toBe('false');
  });

  test('accepting the confirmation replaces the unsaved work', async () => {
    await importExampleWorkbook();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    openWorkFile(textFile('work.json', text));
    await flush();
    expect(byId('counter-retained').textContent).toBe('Retained rows: 4');
    expect(markers()).toHaveLength(2);
  });

  test('no confirmation is asked when there is no unsaved work', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    openWorkFile(textFile('work.json', text));
    await flush();
    openWorkFile(textFile('work.json', text));
    await flush();
    expect(confirm).not.toHaveBeenCalled();
  });

  test('a file with an unknown schema version fails with a clear message and changes nothing', async () => {
    await importExampleWorkbook();
    const confirm = vi.spyOn(window, 'confirm');
    openWorkFile(textFile('future.json', JSON.stringify({ ...JSON.parse(text), schemaVersion: 7 })));
    await flush();
    expect(byId('work-status').textContent).toBe(
      'The work-state file has schema version 7, which this version of MapVibes cannot read. Nothing was opened.',
    );
    expect(byId('work-status').classList.contains('error')).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(byId('counter-retained').textContent).toBe('Retained rows: 5');
  });

  test('a file that is not a work-state file is rejected clearly', async () => {
    openWorkFile(textFile('other.json', '{"hello": "world"}'));
    await flush();
    expect(byId('work-status').textContent).toBe('The file is not a MapVibes work-state file. Nothing was opened.');
    openWorkFile(textFile('broken.json', '{ not json'));
    await flush();
    expect(byId('work-status').textContent).toBe('The file is not a MapVibes work-state file. Nothing was opened.');
  });

  test('a damaged file names the inconsistency in the interface language', async () => {
    const file = JSON.parse(text);
    file.markers[0].row = 0; // row 1 was removed
    openWorkFile(textFile('damaged.json', JSON.stringify(file)));
    await flush();
    expect(byId('work-status').textContent).toBe(
      'The work-state file is damaged or inconsistent; nothing was opened. Detail: markers[0] belongs to a removed row.',
    );
    const select = byId<HTMLSelectElement>('select-language');
    select.value = 'sv';
    select.dispatchEvent(new Event('change'));
    openWorkFile(textFile('damaged.json', JSON.stringify(file)));
    await flush();
    expect(byId('work-status').textContent).toBe(
      'Arbetstillståndsfilen är skadad eller inkonsekvent; ingenting öppnades. Detalj: markers[0] hör till en borttagen rad.',
    );
  });

  test('a background that cannot be decoded aborts the open and changes nothing', async () => {
    await importExampleWorkbook();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    stubImageDecoding(0, 0, true);
    openWorkFile(textFile('work.json', text));
    await flush();
    expect(byId('work-status').textContent).toBe('The background stored in the work-state file could not be decoded. Nothing was opened.');
    expect(byId('counter-retained').textContent).toBe('Retained rows: 5');
    expect(byId('map-error').classList.contains('hidden')).toBe(true);
  });
});
